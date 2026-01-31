import SwiftUI
import AVFoundation

/// Camera preview UIViewRepresentable wrapper
struct CameraPreviewView: UIViewRepresentable {
    @ObservedObject var cameraManager: CameraManager
    
    func makeUIView(context: Context) -> VideoPreviewView {
        let view = VideoPreviewView()
        view.videoPreviewLayer.session = cameraManager.captureSession
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        return view
    }
    
    func updateUIView(_ uiView: VideoPreviewView, context: Context) {
        // Update if needed
    }
}

/// UIView subclass for AVCaptureVideoPreviewLayer
class VideoPreviewView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }
    
    var videoPreviewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}

/// Camera manager using AVFoundation
class CameraManager: NSObject, ObservableObject {
    
    let captureSession = AVCaptureSession()
    private var videoOutput: AVCaptureVideoDataOutput?
    private var movieOutput: AVCaptureMovieFileOutput?
    
    private let sessionQueue = DispatchQueue(label: "com.littlefencer.camera.session")
    
    @Published var isSessionRunning = false
    @Published var error: String?
    
    override init() {
        super.init()
    }
    
    /// Start camera session with pose detection delegate
    func startSession(
        sampleBufferDelegate: AVCaptureVideoDataOutputSampleBufferDelegate?,
        videoRecorder: VideoRecorder?
    ) {
        sessionQueue.async { [weak self] in
            self?.configureSession(
                sampleBufferDelegate: sampleBufferDelegate,
                videoRecorder: videoRecorder
            )
        }
    }
    
    /// Stop camera session
    func stopSession() {
        sessionQueue.async { [weak self] in
            self?.captureSession.stopRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = false
            }
        }
    }
    
    private func configureSession(
        sampleBufferDelegate: AVCaptureVideoDataOutputSampleBufferDelegate?,
        videoRecorder: VideoRecorder?
    ) {
        captureSession.beginConfiguration()
        captureSession.sessionPreset = .hd1280x720
        
        // Add video input (front camera)
        guard let videoDevice = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .front
        ) else {
            DispatchQueue.main.async {
                self.error = "Front camera not available"
            }
            return
        }
        
        do {
            let videoInput = try AVCaptureDeviceInput(device: videoDevice)
            if captureSession.canAddInput(videoInput) {
                captureSession.addInput(videoInput)
            }
        } catch {
            DispatchQueue.main.async {
                self.error = "Cannot access camera: \(error.localizedDescription)"
            }
            return
        }
        
        // Add audio input
        if let audioDevice = AVCaptureDevice.default(for: .audio) {
            do {
                let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                if captureSession.canAddInput(audioInput) {
                    captureSession.addInput(audioInput)
                }
            } catch {
                print("Cannot access microphone: \(error.localizedDescription)")
            }
        }
        
        // Add video output for pose detection
        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.setSampleBufferDelegate(
            sampleBufferDelegate,
            queue: DispatchQueue(label: "com.littlefencer.camera.video")
        )
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        
        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
            self.videoOutput = videoOutput
            
            // Mirror front camera
            if let connection = videoOutput.connection(with: .video) {
                if connection.isVideoMirroringSupported {
                    connection.isVideoMirrored = true
                }
            }
        }
        
        // Add movie output for recording
        let movieOutput = AVCaptureMovieFileOutput()
        if captureSession.canAddOutput(movieOutput) {
            captureSession.addOutput(movieOutput)
            self.movieOutput = movieOutput
            videoRecorder?.setMovieOutput(movieOutput)
            
            // Mirror front camera for recording
            if let connection = movieOutput.connection(with: .video) {
                if connection.isVideoMirroringSupported {
                    connection.isVideoMirrored = true
                }
            }
        }
        
        captureSession.commitConfiguration()
        
        // Start session
        captureSession.startRunning()
        
        DispatchQueue.main.async {
            self.isSessionRunning = self.captureSession.isRunning
        }
    }
}
