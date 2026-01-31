import AVFoundation
import Photos

/// Video category for classification
enum VideoCategory: String, CaseIterable {
    case all = "All"
    case perfect = "Perfect"
    case practice = "Practice"
    
    var displayName: String {
        switch self {
        case .all: return "全部"
        case .perfect: return "⭐ 精彩"
        case .practice: return "📝 待改进"
        }
    }
    
    var filePrefix: String {
        switch self {
        case .all: return ""
        case .perfect: return "Perfect_"
        case .practice: return "Practice_"
        }
    }
}

/// Video recorder using AVCaptureMovieFileOutput
class VideoRecorder: NSObject, ObservableObject, AVCaptureFileOutputRecordingDelegate {
    
    @Published var isRecording = false
    
    var onRecordingFinished: ((Bool, URL?) -> Void)?
    
    private var movieOutput: AVCaptureMovieFileOutput?
    private var currentCategory: VideoCategory = .practice
    private var currentOutputURL: URL?
    
    // MARK: - Setup
    
    func setMovieOutput(_ output: AVCaptureMovieFileOutput) {
        self.movieOutput = output
    }
    
    // MARK: - Recording
    
    /// Start recording video
    func startRecording(category: VideoCategory = .practice) {
        guard let output = movieOutput, !isRecording else {
            print("Cannot start recording: output nil or already recording")
            return
        }
        
        currentCategory = category
        
        // Create temp file URL
        let tempDir = FileManager.default.temporaryDirectory
        let timestamp = DateFormatter.fileTimestamp.string(from: Date())
        let prefix = category == .perfect ? "Perfect" : "Practice"
        let filename = "LittleFencer_\(prefix)_\(timestamp).mp4"
        let outputURL = tempDir.appendingPathComponent(filename)
        
        currentOutputURL = outputURL
        
        // Start recording
        output.startRecording(to: outputURL, recordingDelegate: self)
        isRecording = true
        
        print("Recording started: \(filename)")
    }
    
    /// Stop recording
    func stopRecording() {
        guard let output = movieOutput, isRecording else { return }
        
        output.stopRecording()
        print("Recording stop requested")
    }
    
    // MARK: - AVCaptureFileOutputRecordingDelegate
    
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        DispatchQueue.main.async {
            self.isRecording = true
        }
    }
    
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        DispatchQueue.main.async {
            self.isRecording = false
        }
        
        if let error = error {
            print("Recording error: \(error.localizedDescription)")
            onRecordingFinished?(false, nil)
            return
        }
        
        // Save to Photos library
        saveToPhotosLibrary(outputFileURL)
    }
    
    // MARK: - Save to Photos
    
    private func saveToPhotosLibrary(_ url: URL) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard status == .authorized || status == .limited else {
                print("Photos permission denied")
                self?.onRecordingFinished?(false, nil)
                return
            }
            
            var savedAssetID: String?
            
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .video, fileURL: url, options: nil)
                savedAssetID = request.placeholderForCreatedAsset?.localIdentifier
            } completionHandler: { [weak self] success, error in
                // Clean up temp file
                try? FileManager.default.removeItem(at: url)
                
                if success, let assetID = savedAssetID {
                    // Get the saved asset URL
                    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetID], options: nil)
                    if let asset = fetchResult.firstObject {
                        // For sharing, we need to get the actual URL
                        let options = PHVideoRequestOptions()
                        options.version = .original
                        
                        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                            if let urlAsset = avAsset as? AVURLAsset {
                                DispatchQueue.main.async {
                                    self?.onRecordingFinished?(true, urlAsset.url)
                                }
                            } else {
                                DispatchQueue.main.async {
                                    self?.onRecordingFinished?(true, nil)
                                }
                            }
                        }
                    }
                } else {
                    print("Save error: \(error?.localizedDescription ?? "unknown")")
                    DispatchQueue.main.async {
                        self?.onRecordingFinished?(false, nil)
                    }
                }
            }
        }
    }
}

// MARK: - Frame Ring Buffer

/// Circular buffer for storing recent video frames (dashcam mode)
class FrameRingBuffer {
    
    struct TimestampedFrame {
        let pixelBuffer: CVPixelBuffer
        let timestamp: CMTime
    }
    
    private var buffer: [TimestampedFrame] = []
    private let maxFrames: Int
    private let lock = NSLock()
    
    init(maxFrames: Int = 90) { // 3 seconds @ 30fps
        self.maxFrames = maxFrames
    }
    
    func addFrame(_ pixelBuffer: CVPixelBuffer, timestamp: CMTime) {
        lock.lock()
        defer { lock.unlock() }
        
        // Copy the pixel buffer
        var copiedBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            CVPixelBufferGetWidth(pixelBuffer),
            CVPixelBufferGetHeight(pixelBuffer),
            CVPixelBufferGetPixelFormatType(pixelBuffer),
            nil,
            &copiedBuffer
        )
        
        guard status == kCVReturnSuccess, let newBuffer = copiedBuffer else { return }
        
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        CVPixelBufferLockBaseAddress(newBuffer, [])
        
        let src = CVPixelBufferGetBaseAddress(pixelBuffer)
        let dst = CVPixelBufferGetBaseAddress(newBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        
        memcpy(dst, src, bytesPerRow * height)
        
        CVPixelBufferUnlockBaseAddress(newBuffer, [])
        CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
        
        // Add to buffer
        if buffer.count >= maxFrames {
            buffer.removeFirst()
        }
        buffer.append(TimestampedFrame(pixelBuffer: newBuffer, timestamp: timestamp))
    }
    
    func drainFrames() -> [TimestampedFrame] {
        lock.lock()
        defer { lock.unlock() }
        
        let frames = buffer
        buffer.removeAll()
        return frames
    }
    
    func clear() {
        lock.lock()
        buffer.removeAll()
        lock.unlock()
    }
}

// MARK: - Date Formatter Extension

extension DateFormatter {
    static let fileTimestamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return formatter
    }()
}
