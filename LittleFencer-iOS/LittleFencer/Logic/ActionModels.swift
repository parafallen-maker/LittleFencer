import CoreGraphics
import Foundation

// MARK: - Pose Frame

/// A single snapshot of pose landmarks with timing
/// Used for temporal analysis across frames
struct PoseFrame {
    let landmarks: [CGPoint]
    let timestampMs: Double
    
    /// Get a specific landmark point
    func getLandmark(_ index: Int) -> CGPoint? {
        guard index >= 0 && index < landmarks.count else { return nil }
        return landmarks[index]
    }
    
    /// Calculate time delta from another frame
    func timeDeltaMs(_ other: PoseFrame) -> Double {
        return timestampMs - other.timestampMs
    }
}

// MARK: - Action Result

/// Result from an action detector
enum ActionResult {
    /// No action detected
    case none
    
    /// Action is in progress
    case inProgress(action: SaberAction, confidence: CGFloat, feedback: String? = nil)
    
    /// Action completed
    case completed(action: SaberAction, quality: ActionQuality, feedback: String? = nil, durationMs: Double = 0)
}

// MARK: - Saber Action

/// All saber fencing actions
enum SaberAction: String, CaseIterable {
    // Stance
    case enGarde = "En Garde"
    
    // Footwork
    case advance = "前进步"        // Advance
    case retreat = "后退步"        // Retreat
    case advanceLunge = "前进弓步"  // Advance-Lunge
    
    // Attacks
    case lunge = "弓步"            // Lunge
    case lunging = "弓步进行中"     // Lunging (in progress)
    case flunge = "飞弓步"         // Flunge (saber-specific, replaces fleche)
    case balestraLunge = "跳步弓步" // Balestra-Lunge
    
    // Defense
    case parry = "格挡"           // Parry
    case riposte = "反攻"         // Riposte
    
    // Recovery
    case recovery = "回收"        // Recovery
    
    /// Display name for UI
    var displayName: String {
        return rawValue
    }
    
    /// English name for TTS
    var englishName: String {
        switch self {
        case .enGarde: return "En Garde"
        case .advance: return "Advance"
        case .retreat: return "Retreat"
        case .advanceLunge: return "Advance Lunge"
        case .lunge, .lunging: return "Lunge"
        case .flunge: return "Flunge"
        case .balestraLunge: return "Balestra Lunge"
        case .parry: return "Parry"
        case .riposte: return "Riposte"
        case .recovery: return "Recovery"
        }
    }
}

// MARK: - Action Quality

/// Quality rating for completed actions
enum ActionQuality: Int, Comparable {
    case poor = 1        // Significant errors
    case acceptable = 2  // Needs improvement
    case good = 3        // Minor imperfections
    case perfect = 4     // All form criteria met
    
    static func < (lhs: ActionQuality, rhs: ActionQuality) -> Bool {
        return lhs.rawValue < rhs.rawValue
    }
    
    var displayEmoji: String {
        switch self {
        case .perfect: return "⭐️"
        case .good: return "✅"
        case .acceptable: return "👍"
        case .poor: return "❌"
        }
    }
}

// MARK: - Action Detector Protocol

/// Protocol for action-specific detectors
protocol ActionDetector {
    /// The action this detector handles
    var targetAction: SaberAction { get }
    
    /// Analyze pose history to detect the action
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult
    
    /// Reset detector state
    func reset()
}
