import CoreGraphics
import Foundation

/// Detects the Retreat (后退步) footwork
///
/// Biomechanics:
/// - Back foot moves first, touches ground with ball of foot
/// - Front foot slides back to maintain En Garde position
/// - Movement accelerates (slow start, quick finish)
/// - Must maintain balance and readiness
class RetreatDetector: ActionDetector {
    
    let targetAction = SaberAction.retreat
    
    private var isRetreating = false
    private var retreatStartTime: Double = 0
    private var startPosition: CGFloat = 0
    
    // MARK: - Thresholds
    
    private let MIN_RETREAT_DISTANCE: CGFloat = 0.05
    private let MAX_RETREAT_DURATION: Double = 800
    private let MOVEMENT_VELOCITY_THRESHOLD: CGFloat = 0.02
    private let KNEE_MIN: CGFloat = 80
    private let KNEE_MAX: CGFloat = 140
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 5, current.landmarks.count >= 33 else {
            return .none
        }
        
        let landmarks = current.landmarks
        
        // Extract key points
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        let leftHip = landmarks[PoseLandmarks.LEFT_HIP]
        let rightHip = landmarks[PoseLandmarks.RIGHT_HIP]
        let leftKnee = landmarks[PoseLandmarks.LEFT_KNEE]
        let rightKnee = landmarks[PoseLandmarks.RIGHT_KNEE]
        
        // Determine front/back
        let isLeftFront = leftAnkle.x > rightAnkle.x
        let frontAnkle = isLeftFront ? leftAnkle : rightAnkle
        
        // Calculate hip midpoint
        let hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        
        // Get previous frame for velocity
        guard let prevFrame = history.last,
              prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevLeftHip = prevFrame.landmarks[PoseLandmarks.LEFT_HIP]
        let prevRightHip = prevFrame.landmarks[PoseLandmarks.RIGHT_HIP]
        let prevHipMidpoint = GeometryUtils.midpoint(prevLeftHip, prevRightHip)
        
        // Calculate backward velocity (positive when moving back)
        let deltaTime = current.timeDeltaMs(prevFrame)
        let backwardVelocity: CGFloat = deltaTime > 0 
            ? (prevHipMidpoint.x - hipMidpoint.x) / CGFloat(deltaTime) * 1000 
            : 0
        
        // Calculate knee angle
        let frontKneeAngle: CGFloat
        if isLeftFront {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        } else {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        }
        
        // State machine
        if !isRetreating {
            // Check for retreat initiation (moving backward)
            if backwardVelocity > MOVEMENT_VELOCITY_THRESHOLD &&
               frontKneeAngle >= KNEE_MIN && frontKneeAngle <= KNEE_MAX {
                isRetreating = true
                retreatStartTime = current.timestampMs
                startPosition = frontAnkle.x
                return .inProgress(action: .retreat, confidence: 0.5)
            }
            return .none
        } else {
            // Retreat in progress
            let elapsed = current.timestampMs - retreatStartTime
            let distanceTraveled = startPosition - frontAnkle.x  // Positive when moving back
            
            // Check timeout
            if elapsed > MAX_RETREAT_DURATION {
                reset()
                return .none
            }
            
            // Check completion
            if abs(backwardVelocity) < MOVEMENT_VELOCITY_THRESHOLD * 0.5 &&
               distanceTraveled > MIN_RETREAT_DISTANCE {
                
                let quality = evaluateQuality(kneeAngle: frontKneeAngle,
                                             distance: distanceTraveled,
                                             durationMs: elapsed)
                let feedback = generateFeedback(kneeAngle: frontKneeAngle)
                
                reset()
                return .completed(action: .retreat, quality: quality,
                                 feedback: feedback, durationMs: elapsed)
            } else if distanceTraveled < -0.02 {
                // Moving forward - abort
                reset()
                return .none
            }
            
            let confidence = min(0.9, max(0.5, distanceTraveled / MIN_RETREAT_DISTANCE))
            return .inProgress(action: .retreat, confidence: confidence)
        }
    }
    
    private func evaluateQuality(kneeAngle: CGFloat, distance: CGFloat, durationMs: Double) -> ActionQuality {
        let kneeGood = kneeAngle >= 90 && kneeAngle <= 120
        let distanceGood = distance > MIN_RETREAT_DISTANCE * 1.5
        let speedGood = durationMs < 500
        
        if kneeGood && distanceGood && speedGood {
            return .perfect
        } else if kneeGood && (distanceGood || speedGood) {
            return .good
        } else if kneeGood || distanceGood {
            return .acceptable
        }
        return .poor
    }
    
    private func generateFeedback(kneeAngle: CGFloat) -> String? {
        if kneeAngle < 90 { return "Too low!" }
        if kneeAngle > 130 { return "Bend more!" }
        return nil
    }
    
    func reset() {
        isRetreating = false
        retreatStartTime = 0
        startPosition = 0
    }
}
