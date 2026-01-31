import CoreGraphics
import Foundation

/// Detects Parry (格挡) and Riposte (反攻) actions
///
/// Saber Parry Positions:
/// - Tierce (3): Block to the outside, blade moves laterally
/// - Quarte (4): Block to the inside
/// - Quinte (5): Block to the head (high parry)
///
/// Biomechanics:
/// - Parry: Quick wrist movement to deflect, minimal arm movement
/// - Riposte: Immediate counter-attack following successful parry
class ParryRiposteDetector: ActionDetector {
    
    let targetAction = SaberAction.parry  // Primary action
    
    private enum Phase {
        case idle
        case parrying
        case riposting
    }
    
    private enum ParryDirection: String {
        case none = "None"
        case tierce = "Tierce"   // Outside
        case quarte = "Quarte"   // Inside
        case quinte = "Quinte"   // High
    }
    
    private var phase = Phase.idle
    private var phaseStartTime: Double = 0
    private var parryDirection = ParryDirection.none
    private var parryWristPos: (CGFloat, CGFloat) = (0, 0)
    
    // MARK: - Thresholds
    
    private let PARRY_LATERAL_THRESHOLD: CGFloat = 0.04
    private let PARRY_VERTICAL_THRESHOLD: CGFloat = 0.03
    private let PARRY_VELOCITY_THRESHOLD: CGFloat = 0.3
    private let RIPOSTE_VELOCITY_THRESHOLD: CGFloat = 0.4
    private let MAX_PARRY_TO_RIPOSTE: Double = 400
    private let MAX_PARRY_DURATION: Double = 300
    private let MAX_TOTAL_DURATION: Double = 800
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 5, current.landmarks.count >= 33 else {
            return .none
        }
        
        let landmarks = current.landmarks
        
        // Extract wrist positions
        let leftWrist = landmarks[PoseLandmarks.LEFT_WRIST]
        let rightWrist = landmarks[PoseLandmarks.RIGHT_WRIST]
        let leftShoulder = landmarks[PoseLandmarks.LEFT_SHOULDER]
        let rightShoulder = landmarks[PoseLandmarks.RIGHT_SHOULDER]
        
        let isLeftFront = leftWrist.x > rightWrist.x
        let frontWrist = isLeftFront ? leftWrist : rightWrist
        let frontShoulder = isLeftFront ? leftShoulder : rightShoulder
        
        // Get previous frame data
        guard let prevFrame = history.last,
              prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevFrontWrist = isLeftFront 
            ? prevFrame.landmarks[PoseLandmarks.LEFT_WRIST]
            : prevFrame.landmarks[PoseLandmarks.RIGHT_WRIST]
        
        let deltaTime = current.timeDeltaMs(prevFrame)
        
        // Calculate wrist velocities
        let lateralVelocity: CGFloat = deltaTime > 0 
            ? (frontWrist.x - prevFrontWrist.x) / CGFloat(deltaTime) * 1000 
            : 0
        let verticalVelocity: CGFloat = deltaTime > 0 
            ? (frontWrist.y - prevFrontWrist.y) / CGFloat(deltaTime) * 1000 
            : 0
        
        // Wrist position relative to shoulder
        let wristRelativeX = frontWrist.x - frontShoulder.x
        let wristRelativeY = frontWrist.y - frontShoulder.y
        
        switch phase {
        case .idle:
            // Detect parry initiation
            let direction = detectParryDirection(lateralVelocity: lateralVelocity,
                                                 verticalVelocity: verticalVelocity,
                                                 isLeftFront: isLeftFront)
            
            if direction != .none {
                phase = .parrying
                phaseStartTime = current.timestampMs
                parryDirection = direction
                return .inProgress(action: .parry, confidence: 0.5)
            }
            return .none
            
        case .parrying:
            let elapsed = current.timestampMs - phaseStartTime
            
            // Check timeout
            if elapsed > MAX_PARRY_DURATION {
                let quality = evaluateParryQuality()
                let feedback = getParryName()
                reset()
                return .completed(action: .parry, quality: quality,
                                 feedback: feedback, durationMs: elapsed)
            }
            
            // Detect riposte initiation
            if lateralVelocity > RIPOSTE_VELOCITY_THRESHOLD &&
               abs(verticalVelocity) < PARRY_VELOCITY_THRESHOLD * 0.5 {
                parryWristPos = (frontWrist.x, frontWrist.y)
                phase = .riposting
                return .inProgress(action: .riposte, confidence: 0.7)
            }
            
            return .inProgress(action: .parry, confidence: 0.6)
            
        case .riposting:
            let elapsed = current.timestampMs - phaseStartTime
            
            // Check timeout
            if elapsed > MAX_TOTAL_DURATION {
                reset()
                return .none
            }
            
            // Check riposte completion (forward velocity decreased, arm extended)
            if lateralVelocity < RIPOSTE_VELOCITY_THRESHOLD * 0.3 &&
               frontWrist.x > parryWristPos.0 + 0.05 {
                
                let quality = evaluateRiposteQuality(elapsed: elapsed)
                reset()
                return .completed(action: .riposte, quality: quality,
                                 feedback: "Nice riposte!", durationMs: elapsed)
            }
            
            return .inProgress(action: .riposte, confidence: 0.8)
        }
    }
    
    private func detectParryDirection(lateralVelocity: CGFloat, 
                                      verticalVelocity: CGFloat,
                                      isLeftFront: Bool) -> ParryDirection {
        // Quinte - high parry (upward movement)
        if verticalVelocity < -PARRY_VERTICAL_THRESHOLD &&
           abs(lateralVelocity) < PARRY_VELOCITY_THRESHOLD {
            return .quinte
        }
        
        // Tierce - outside parry (wrist moves away from body)
        if isLeftFront && lateralVelocity > PARRY_LATERAL_THRESHOLD {
            return .tierce
        } else if !isLeftFront && lateralVelocity < -PARRY_LATERAL_THRESHOLD {
            return .tierce
        }
        
        // Quarte - inside parry (wrist moves toward body)
        if isLeftFront && lateralVelocity < -PARRY_LATERAL_THRESHOLD {
            return .quarte
        } else if !isLeftFront && lateralVelocity > PARRY_LATERAL_THRESHOLD {
            return .quarte
        }
        
        return .none
    }
    
    private func evaluateParryQuality() -> ActionQuality {
        // Simplified quality evaluation
        switch parryDirection {
        case .quinte: return .good  // High parry is harder
        case .tierce, .quarte: return .good
        case .none: return .acceptable
        }
    }
    
    private func evaluateRiposteQuality(elapsed: Double) -> ActionQuality {
        // Quick riposte is better
        if elapsed < 300 { return .perfect }
        if elapsed < 500 { return .good }
        return .acceptable
    }
    
    private func getParryName() -> String {
        return "Good \(parryDirection.rawValue)!"
    }
    
    func reset() {
        phase = .idle
        phaseStartTime = 0
        parryDirection = .none
        parryWristPos = (0, 0)
    }
}
