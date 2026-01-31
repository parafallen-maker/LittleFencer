import CoreGraphics
import Foundation

/// Orchestrates all action detectors
///
/// Manages a pool of specialized detectors, processes each frame through
/// all relevant detectors, and returns the most confident action.
///
/// Priority handling:
/// - Completed actions take priority over in-progress
/// - Higher confidence in-progress actions take priority
/// - Conflicting detections resolved by action hierarchy
class ActionDetectorManager {
    
    // MARK: - Detectors
    
    private let detectors: [ActionDetector] = [
        AdvanceDetector(),
        LungeDetector(),          // Independent lunge detector
        RetreatDetector(),
        AdvanceLungeDetector(),
        BalestraLungeDetector(),
        FlungeDetector(),
        ParryRiposteDetector()
    ]
    
    // MARK: - Pose History
    
    private var poseHistory: [PoseFrame] = []
    private let maxHistorySize = 30  // ~1 second at 30fps
    
    // MARK: - Processing
    
    /// Process a new frame through all detectors
    func processFrame(landmarks: [CGPoint], timestampMs: Double) -> ActionResult {
        let currentFrame = PoseFrame(landmarks: landmarks, timestampMs: timestampMs)
        
        // Add to history
        poseHistory.append(currentFrame)
        while poseHistory.count > maxHistorySize {
            poseHistory.removeFirst()
        }
        
        // Need minimum history
        guard poseHistory.count >= 5 else {
            return .none
        }
        
        // Run all detectors
        let results = detectors.map { detector in
            detector.detect(current: currentFrame, history: Array(poseHistory.dropLast()))
        }
        
        // Find best result (Completed > InProgress > None)
        var completedResults: [(ActionResult, ActionQuality)] = []
        for result in results {
            if case let .completed(_, quality, _, _) = result {
                completedResults.append((result, quality))
            }
        }
        
        if !completedResults.isEmpty {
            // Return highest quality completed action
            if let best = completedResults.max(by: { $0.1 < $1.1 }) {
                return best.0
            }
            return completedResults[0].0
        }
        
        // Check for in-progress results
        var inProgressResults: [(ActionResult, CGFloat)] = []
        for result in results {
            if case let .inProgress(_, confidence, _) = result {
                inProgressResults.append((result, confidence))
            }
        }
        
        if !inProgressResults.isEmpty {
            // Return highest confidence in-progress action
            if let best = inProgressResults.max(by: { $0.1 < $1.1 }) {
                return best.0
            }
            return inProgressResults[0].0
        }
        
        return .none
    }
    
    /// Get information about all currently in-progress actions
    func getInProgressActions() -> [ActionResult] {
        guard let currentFrame = poseHistory.last,
              poseHistory.count >= 5 else {
            return []
        }
        
        let history = Array(poseHistory.dropLast())
        
        return detectors.compactMap { detector -> ActionResult? in
            let result = detector.detect(current: currentFrame, history: history)
            if case .inProgress = result {
                return result
            }
            return nil
        }
    }
    
    /// Reset all detectors
    func reset() {
        detectors.forEach { $0.reset() }
        poseHistory.removeAll()
    }
    
    /// Get list of all supported actions
    func getSupportedActions() -> [SaberAction] {
        return detectors.map { $0.targetAction }
    }
}
