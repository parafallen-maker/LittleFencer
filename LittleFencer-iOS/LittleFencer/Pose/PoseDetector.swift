import AVFoundation
import Vision
import CoreML

/// Pose detector supporting both MediaPipe (33-point native) and Vision Framework (19-point mapped)
/// Uses compile-time flag to determine backend
class PoseDetector: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    
    @Published var currentLandmarks: [CGPoint]?
    @Published var usingMediaPipe: Bool = false
    
    /// Callback when pose is detected
    var onPoseDetected: (([CGPoint]?) -> Void)?
    
    /// Frame callback for pre-padding buffer
    var onFrameProcessed: ((CVPixelBuffer, Double) -> Void)?
    
    // Vision framework (fallback)
    private var poseRequest: VNDetectHumanBodyPoseRequest?
    private let sequenceHandler = VNSequenceRequestHandler()
    private let processQueue = DispatchQueue(label: "com.littlefencer.posedetector", qos: .userInitiated)
    
    /// Minimum confidence threshold for valid landmarks
    private let confidenceThreshold: Float = 0.3
    
    override init() {
        super.init()
        setupPoseDetection()
    }
    
    private func setupPoseDetection() {
        setupVisionFramework()
    }
    
    // MARK: - Vision Framework Setup (19-point mapped to 33)
    
    private func setupVisionFramework() {
        poseRequest = VNDetectHumanBodyPoseRequest { [weak self] request, error in
            guard let observations = request.results as? [VNHumanBodyPoseObservation],
                  let observation = observations.first else {
                self?.handleNoDetection()
                return
            }
            
            self?.processVisionObservation(observation)
        }
        usingMediaPipe = false
        print("📍 Using Vision Framework - 19 points mapped to 33")
    }
    
    // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate
    
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        
        let timestampMs = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds * 1000
        
        // Provide frame to buffer listener
        onFrameProcessed?(pixelBuffer, timestampMs)
        
        // Use Vision Framework
        processWithVision(pixelBuffer: pixelBuffer)
    }
    
    // MARK: - Vision Framework Processing
    
    private func processWithVision(pixelBuffer: CVPixelBuffer) {
        guard let poseRequest = poseRequest else { return }
        
        processQueue.async { [weak self] in
            do {
                try self?.sequenceHandler.perform([poseRequest], on: pixelBuffer)
            } catch {
                print("Vision detection error: \(error)")
            }
        }
    }
    
    private func processVisionObservation(_ observation: VNHumanBodyPoseObservation) {
        // Vision provides 19 body points, we map to 33 for MediaPipe compatibility
        var landmarks: [CGPoint] = Array(repeating: .zero, count: 33)
        
        do {
            let recognizedPoints = try observation.recognizedPoints(.all)
            
            // Head/Face
            if let nose = recognizedPoints[.nose] {
                landmarks[PoseLandmarks.NOSE] = convertVisionPoint(nose)
            }
            
            // Eyes (approximate from face region)
            if let leftEar = recognizedPoints[.leftEar] {
                let point = convertVisionPoint(leftEar)
                landmarks[PoseLandmarks.LEFT_EAR] = point
                landmarks[PoseLandmarks.LEFT_EYE] = point
                landmarks[PoseLandmarks.LEFT_EYE_INNER] = point
                landmarks[PoseLandmarks.LEFT_EYE_OUTER] = point
            }
            
            if let rightEar = recognizedPoints[.rightEar] {
                let point = convertVisionPoint(rightEar)
                landmarks[PoseLandmarks.RIGHT_EAR] = point
                landmarks[PoseLandmarks.RIGHT_EYE] = point
                landmarks[PoseLandmarks.RIGHT_EYE_INNER] = point
                landmarks[PoseLandmarks.RIGHT_EYE_OUTER] = point
            }
            
            // Shoulders
            if let leftShoulder = recognizedPoints[.leftShoulder] {
                landmarks[PoseLandmarks.LEFT_SHOULDER] = convertVisionPoint(leftShoulder)
            }
            if let rightShoulder = recognizedPoints[.rightShoulder] {
                landmarks[PoseLandmarks.RIGHT_SHOULDER] = convertVisionPoint(rightShoulder)
            }
            
            // Arms
            if let leftElbow = recognizedPoints[.leftElbow] {
                landmarks[PoseLandmarks.LEFT_ELBOW] = convertVisionPoint(leftElbow)
            }
            if let rightElbow = recognizedPoints[.rightElbow] {
                landmarks[PoseLandmarks.RIGHT_ELBOW] = convertVisionPoint(rightElbow)
            }
            if let leftWrist = recognizedPoints[.leftWrist] {
                let point = convertVisionPoint(leftWrist)
                landmarks[PoseLandmarks.LEFT_WRIST] = point
                landmarks[PoseLandmarks.LEFT_PINKY] = point
                landmarks[PoseLandmarks.LEFT_INDEX] = point
                landmarks[PoseLandmarks.LEFT_THUMB] = point
            }
            if let rightWrist = recognizedPoints[.rightWrist] {
                let point = convertVisionPoint(rightWrist)
                landmarks[PoseLandmarks.RIGHT_WRIST] = point
                landmarks[PoseLandmarks.RIGHT_PINKY] = point
                landmarks[PoseLandmarks.RIGHT_INDEX] = point
                landmarks[PoseLandmarks.RIGHT_THUMB] = point
            }
            
            // Hips
            if let leftHip = recognizedPoints[.leftHip] {
                landmarks[PoseLandmarks.LEFT_HIP] = convertVisionPoint(leftHip)
            }
            if let rightHip = recognizedPoints[.rightHip] {
                landmarks[PoseLandmarks.RIGHT_HIP] = convertVisionPoint(rightHip)
            }
            
            // Legs
            if let leftKnee = recognizedPoints[.leftKnee] {
                landmarks[PoseLandmarks.LEFT_KNEE] = convertVisionPoint(leftKnee)
            }
            if let rightKnee = recognizedPoints[.rightKnee] {
                landmarks[PoseLandmarks.RIGHT_KNEE] = convertVisionPoint(rightKnee)
            }
            if let leftAnkle = recognizedPoints[.leftAnkle] {
                let point = convertVisionPoint(leftAnkle)
                landmarks[PoseLandmarks.LEFT_ANKLE] = point
                landmarks[PoseLandmarks.LEFT_HEEL] = point
                landmarks[PoseLandmarks.LEFT_FOOT_INDEX] = point
            }
            if let rightAnkle = recognizedPoints[.rightAnkle] {
                let point = convertVisionPoint(rightAnkle)
                landmarks[PoseLandmarks.RIGHT_ANKLE] = point
                landmarks[PoseLandmarks.RIGHT_HEEL] = point
                landmarks[PoseLandmarks.RIGHT_FOOT_INDEX] = point
            }
            
            // Check if we have enough valid points
            let validPoints = landmarks.filter { $0 != .zero }.count
            if validPoints >= 12 {
                publishLandmarks(landmarks)
            } else {
                handleNoDetection()
            }
            
        } catch {
            print("Error getting recognized points: \(error)")
            handleNoDetection()
        }
    }
    
    // MARK: - Helpers
    
    private func publishLandmarks(_ landmarks: [CGPoint]) {
        DispatchQueue.main.async {
            self.currentLandmarks = landmarks
            self.onPoseDetected?(landmarks)
        }
    }
    
    private func handleNoDetection() {
        DispatchQueue.main.async {
            self.currentLandmarks = nil
            self.onPoseDetected?(nil)
        }
    }
    
    /// Convert Vision point to normalized CGPoint
    /// Vision uses bottom-left origin, we need top-left
    private func convertVisionPoint(_ point: VNRecognizedPoint) -> CGPoint {
        guard point.confidence > confidenceThreshold else { return .zero }
        return CGPoint(x: point.location.x, y: 1.0 - point.location.y)
    }
}

// MARK: - MediaPipe Compatible Pose Landmarks

/// Pose landmark indices compatible with MediaPipe 33-point model
struct PoseLandmarks {
    // Face
    static let NOSE = 0
    static let LEFT_EYE_INNER = 1
    static let LEFT_EYE = 2
    static let LEFT_EYE_OUTER = 3
    static let RIGHT_EYE_INNER = 4
    static let RIGHT_EYE = 5
    static let RIGHT_EYE_OUTER = 6
    static let LEFT_EAR = 7
    static let RIGHT_EAR = 8
    static let MOUTH_LEFT = 9
    static let MOUTH_RIGHT = 10
    
    // Upper Body
    static let LEFT_SHOULDER = 11
    static let RIGHT_SHOULDER = 12
    static let LEFT_ELBOW = 13
    static let RIGHT_ELBOW = 14
    static let LEFT_WRIST = 15
    static let RIGHT_WRIST = 16
    
    // Hands
    static let LEFT_PINKY = 17
    static let RIGHT_PINKY = 18
    static let LEFT_INDEX = 19
    static let RIGHT_INDEX = 20
    static let LEFT_THUMB = 21
    static let RIGHT_THUMB = 22
    
    // Lower Body
    static let LEFT_HIP = 23
    static let RIGHT_HIP = 24
    static let LEFT_KNEE = 25
    static let RIGHT_KNEE = 26
    static let LEFT_ANKLE = 27
    static let RIGHT_ANKLE = 28
    
    // Feet
    static let LEFT_HEEL = 29
    static let RIGHT_HEEL = 30
    static let LEFT_FOOT_INDEX = 31
    static let RIGHT_FOOT_INDEX = 32
}
