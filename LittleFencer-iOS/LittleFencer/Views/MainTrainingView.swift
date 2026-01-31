import SwiftUI
import AVFoundation

/// Main training screen - "Smart Digital Mirror"
/// Displays camera preview with skeleton overlay and HUD elements
struct MainTrainingView: View {
    @EnvironmentObject var appState: AppState
    @Binding var showGallery: Bool
    
    @StateObject private var cameraManager = CameraManager()
    @StateObject private var poseDetector = PoseDetector()
    @StateObject private var fencingEngine = FencingStateEngine()
    @StateObject private var audioManager = AudioFeedbackManager()
    @StateObject private var videoRecorder = VideoRecorder()
    
    @State private var statusMessage = "Waiting for En Garde..."
    @State private var skeletonColor: Color = .green
    @State private var showShareButton = false
    @State private var lastRecordingURL: URL?
    @State private var currentRepHasErrors = false
    @State private var currentActionName: String?
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Camera Preview Layer
                CameraPreviewView(cameraManager: cameraManager)
                    .ignoresSafeArea()
                
                // Skeleton Overlay Layer
                SkeletonOverlayView(
                    landmarks: poseDetector.currentLandmarks,
                    color: skeletonColor,
                    viewSize: geometry.size
                )
                .ignoresSafeArea()
                
                // HUD Layer
                VStack {
                    HStack(alignment: .top) {
                        // Left side - Combo Counter
                        VStack(alignment: .leading, spacing: 8) {
                            if appState.comboCount >= 2 {
                                ComboCounterView(count: appState.comboCount)
                                    .transition(.scale.combined(with: .opacity))
                            }
                            
                            // Current action indicator
                            if let actionName = currentActionName {
                                ActionIndicatorView(actionName: actionName)
                                    .transition(.scale.combined(with: .opacity))
                            }
                        }
                        
                        Spacer()
                        
                        // Right side - Rep Counter
                        RepCounterView(count: appState.repCount)
                    }
                    .padding(24)
                    
                    Spacer()
                    
                    // Status Text (Bottom Center)
                    Text(statusMessage)
                        .font(.title2)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .shadow(color: .black, radius: 4, x: 2, y: 2)
                        .padding(.bottom, 48)
                }
                
                // Action Buttons (Bottom Right)
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        VStack(spacing: 16) {
                            // Gallery Button
                            ActionButton(
                                systemImage: "film.stack",
                                action: { showGallery = true }
                            )
                            
                            // Share Button (appears after recording)
                            if showShareButton, let url = lastRecordingURL {
                                ActionButton(
                                    systemImage: "square.and.arrow.up",
                                    action: { shareRecording(url: url) }
                                )
                                .transition(.scale.combined(with: .opacity))
                            }
                        }
                        .padding(24)
                    }
                }
            }
        }
        .onAppear {
            setupPipeline()
        }
        .onDisappear {
            teardownPipeline()
        }
        .statusBar(hidden: true)
    }
    
    // MARK: - Setup
    
    private func setupPipeline() {
        // Initialize audio
        audioManager.initialize()
        
        // Setup pose detection callback
        poseDetector.onPoseDetected = { landmarks in
            handlePoseResult(landmarks: landmarks)
        }
        
        // Setup fencing engine callbacks
        fencingEngine.onStateChanged = { oldState, newState in
            handleStateChange(from: oldState, to: newState)
        }
        
        fencingEngine.onFormFeedback = { feedback in
            handleFormFeedback(feedback)
        }
        
        fencingEngine.onRepCompleted = { isGood in
            handleRepCompleted(isGood: isGood)
        }
        
        fencingEngine.onActionCompleted = { action, quality in
            handleActionCompleted(action: action, quality: quality)
        }
        
        // Setup video recorder callback
        videoRecorder.onRecordingFinished = { success, url in
            if success, let url = url {
                lastRecordingURL = url
                withAnimation {
                    showShareButton = true
                }
            }
        }
        
        // Start camera with pose detection
        cameraManager.startSession(
            sampleBufferDelegate: poseDetector,
            videoRecorder: videoRecorder
        )
    }
    
    private func teardownPipeline() {
        cameraManager.stopSession()
        audioManager.release()
    }
    
    // MARK: - Pose Handling
    
    private func handlePoseResult(landmarks: [CGPoint]?) {
        guard let landmarks = landmarks, landmarks.count >= 33 else {
            fencingEngine.reset()
            DispatchQueue.main.async {
                statusMessage = "Waiting for En Garde..."
                currentActionName = nil
            }
            return
        }
        
        let frameTime = CACurrentMediaTime() * 1000
        fencingEngine.processFrame(landmarks: landmarks, frameTimeMs: frameTime)
    }
    
    // MARK: - State Machine Handling
    
    private func handleStateChange(from oldState: FencingState, to newState: FencingState) {
        DispatchQueue.main.async {
            switch newState {
            case .idle:
                statusMessage = "Stand in En Garde position"
                currentActionName = nil
                if videoRecorder.isRecording {
                    stopAndSaveRecording()
                }
                
            case .enGarde:
                if oldState == .idle {
                    statusMessage = "En Garde! ⚔️ Ready..."
                    audioManager.speak(AudioFeedbackManager.PHRASE_EN_GARDE)
                    audioManager.playGoodFeedback()
                } else if oldState == .recovery {
                    statusMessage = "Good recovery! ✓"
                }
                
            case .lunging:
                statusMessage = "Attacking... 🗡️"
                startRecording()
                
            case .recovery:
                statusMessage = "Recovering..."
            }
        }
    }
    
    private func handleFormFeedback(_ feedback: FormFeedback) {
        DispatchQueue.main.async {
            skeletonColor = feedback.isGoodForm ? .green : .red
            
            if let message = feedback.message {
                if !feedback.isGoodForm {
                    audioManager.speak(message)
                    audioManager.playBadFeedback()
                    audioManager.triggerErrorHaptic()
                    currentRepHasErrors = true
                }
            }
        }
    }
    
    private func handleRepCompleted(isGood: Bool) {
        DispatchQueue.main.async {
            appState.repCount += 1
            
            if isGood {
                appState.comboCount += 1
                audioManager.playPerfectFeedback()
                audioManager.triggerSuccessHaptic()
                
                // Combo milestones
                if appState.comboCount == 5 {
                    audioManager.speak(AudioFeedbackManager.PHRASE_FIVE_COMBO)
                } else if appState.comboCount == 10 {
                    audioManager.speak(AudioFeedbackManager.PHRASE_TEN_COMBO)
                }
            } else {
                appState.comboCount = 0
                audioManager.playBadFeedback()
            }
        }
        
        stopAndSaveRecording()
    }
    
    private func handleActionCompleted(action: SaberAction, quality: ActionQuality) {
        DispatchQueue.main.async {
            // Update status with action name and quality
            let qualityEmoji = quality.displayEmoji
            statusMessage = "\(action.displayName) \(qualityEmoji)"
            
            // Show action indicator briefly
            withAnimation {
                currentActionName = action.englishName
            }
            
            // Hide after delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation {
                    currentActionName = nil
                }
            }
        }
    }
    
    // MARK: - Recording
    
    private func startRecording() {
        guard !videoRecorder.isRecording else { return }
        currentRepHasErrors = false
        
        let category: VideoCategory = skeletonColor == .green ? .perfect : .practice
        videoRecorder.startRecording(category: category)
    }
    
    private func stopAndSaveRecording() {
        guard videoRecorder.isRecording else { return }
        videoRecorder.stopRecording()
    }
    
    private func shareRecording(url: URL) {
        let activityVC = UIActivityViewController(
            activityItems: [url],
            applicationActivities: nil
        )
        
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            rootVC.present(activityVC, animated: true)
        }
    }
}

// MARK: - Supporting Views

struct RepCounterView: View {
    let count: Int
    
    var body: some View {
        Text("\(count)")
            .font(.system(size: 72, weight: .bold))
            .foregroundColor(.white)
            .shadow(color: .black, radius: 4, x: 2, y: 2)
    }
}

struct ComboCounterView: View {
    let count: Int
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(count)x")
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(Color(hex: "FFD700"))
            Text("COMBO!")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Color(hex: "FFD700"))
        }
        .shadow(color: .black, radius: 4, x: 2, y: 2)
    }
}

struct ActionIndicatorView: View {
    let actionName: String
    
    var body: some View {
        Text(actionName)
            .font(.system(size: 24, weight: .semibold))
            .foregroundColor(.cyan)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.6))
            .cornerRadius(8)
    }
}

struct ActionButton: View {
    let systemImage: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundColor(.white)
                .frame(width: 48, height: 48)
                .background(Color.black.opacity(0.5))
                .clipShape(Circle())
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    MainTrainingView(showGallery: .constant(false))
        .environmentObject(AppState())
}
