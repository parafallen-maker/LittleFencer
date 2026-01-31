import CoreGraphics
import Foundation

/// Detects the Advance (前进步) footwork
///
/// Biomechanics:
/// - Front foot lifts heel-first, moves forward, lands heel-first
/// - Back foot pushes off, then lands
/// - Fencer returns to En Garde stance
/// - Movement accelerates (slow start, quick finish)
class AdvanceDetector: ActionDetector {
    
    let targetAction = SaberAction.advance
    
    private var isAdvancing = false
    private var advanceStartTime: Double = 0
    private var startPosition: CGFloat = 0
    
    // MARK: - Thresholds
    
    private let MIN_ADVANCE_DISTANCE: CGFloat = 0.05
    private let MAX_ADVANCE_DURATION: Double = 800
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
        
        // Determine front/back based on ankle position
        let isLeftFront = leftAnkle.x > rightAnkle.x
        let frontAnkle = isLeftFront ? leftAnkle : rightAnkle
        
        // Calculate hip midpoint (center of mass proxy)
        let hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        
        // Get previous frame for velocity
        guard let prevFrame = history.last,
              prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevLeftHip = prevFrame.landmarks[PoseLandmarks.LEFT_HIP]
        let prevRightHip = prevFrame.landmarks[PoseLandmarks.RIGHT_HIP]
        let prevHipMidpoint = GeometryUtils.midpoint(prevLeftHip, prevRightHip)
        
        // Calculate forward velocity (positive X = forward in mirror view)
        let deltaTime = current.timeDeltaMs(prevFrame)
        let forwardVelocity: CGFloat = deltaTime > 0 
            ? (hipMidpoint.x - prevHipMidpoint.x) / CGFloat(deltaTime) * 1000 
            : 0
        
        // Calculate knee angle
        let frontKneeAngle: CGFloat
        if isLeftFront {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        } else {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        }
        
        // State machine
        if !isAdvancing {
            // Check for advance initiation
            if forwardVelocity > MOVEMENT_VELOCITY_THRESHOLD &&
               frontKneeAngle >= KNEE_MIN && frontKneeAngle <= KNEE_MAX {
                isAdvancing = true
                advanceStartTime = current.timestampMs
                startPosition = frontAnkle.x
                return .inProgress(action: .advance, confidence: 0.5)
            }
            return .none
        } else {
            // Advance in progress
            let elapsed = current.timestampMs - advanceStartTime
            let distanceTraveled = frontAnkle.x - startPosition
            
            // Check timeout
            if elapsed > MAX_ADVANCE_DURATION {
                reset()
                return .none
            }
            
            // Check completion
            if abs(forwardVelocity) < MOVEMENT_VELOCITY_THRESHOLD * 0.5 &&
               distanceTraveled > MIN_ADVANCE_DISTANCE {
                
                let quality = evaluateQuality(kneeAngle: frontKneeAngle, 
                                             distance: distanceTraveled, 
                                             durationMs: elapsed)
                let feedback = generateFeedback(kneeAngle: frontKneeAngle)
                
                reset()
                return .completed(action: .advance, quality: quality, 
                                 feedback: feedback, durationMs: elapsed)
            } else if distanceTraveled < -0.02 {
                // Moving backward - abort
                reset()
                return .none
            }
            
            let confidence = min(0.9, max(0.5, distanceTraveled / MIN_ADVANCE_DISTANCE))
            return .inProgress(action: .advance, confidence: confidence)
        }
    }
    
    private func evaluateQuality(kneeAngle: CGFloat, distance: CGFloat, durationMs: Double) -> ActionQuality {
        let kneeGood = kneeAngle >= 90 && kneeAngle <= 120
        let distanceGood = distance > MIN_ADVANCE_DISTANCE * 1.5
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
        isAdvancing = false
        advanceStartTime = 0
        startPosition = 0
    }
}
