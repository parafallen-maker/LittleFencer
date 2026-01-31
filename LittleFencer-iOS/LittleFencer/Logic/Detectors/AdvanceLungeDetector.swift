import CoreGraphics
import Foundation

/// Detects the Advance-Lunge (前进弓步) combination
///
/// Biomechanics:
/// - Start from En Garde stance
/// - Execute a small advance step to close distance
/// - Immediately follow with a full lunge
/// - The arm begins extending during the advance
class AdvanceLungeDetector: ActionDetector {
    
    let targetAction = SaberAction.advanceLunge
    
    private enum Phase {
        case idle
        case advancing
        case lunging
    }
    
    private var phase = Phase.idle
    private var phaseStartTime: Double = 0
    private var startHipX: CGFloat = 0
    
    // MARK: - Thresholds
    
    private let MIN_ADVANCE_DISTANCE: CGFloat = 0.02
    private let ADVANCE_VELOCITY_THRESHOLD: CGFloat = 0.015
    private let ARM_EXTENDED_THRESHOLD: CGFloat = 0.25
    private let LUNGE_VELOCITY_THRESHOLD: CGFloat = 0.3
    private let BACK_KNEE_MIN_STRAIGHT: CGFloat = 155
    private let MAX_ADVANCE_DURATION: Double = 500
    private let MAX_TOTAL_DURATION: Double = 1000
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 5, current.landmarks.count >= 33 else {
            return .none
        }
        
        let landmarks = current.landmarks
        
        // Extract landmarks
        let leftHip = landmarks[PoseLandmarks.LEFT_HIP]
        let rightHip = landmarks[PoseLandmarks.RIGHT_HIP]
        let leftShoulder = landmarks[PoseLandmarks.LEFT_SHOULDER]
        let rightShoulder = landmarks[PoseLandmarks.RIGHT_SHOULDER]
        let leftWrist = landmarks[PoseLandmarks.LEFT_WRIST]
        let rightWrist = landmarks[PoseLandmarks.RIGHT_WRIST]
        let leftKnee = landmarks[PoseLandmarks.LEFT_KNEE]
        let rightKnee = landmarks[PoseLandmarks.RIGHT_KNEE]
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        
        let hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        let shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        let ankleMidpoint = GeometryUtils.midpoint(leftAnkle, rightAnkle)
        let bodyHeight = GeometryUtils.distance(shoulderMidpoint, ankleMidpoint)
        
        // Determine front side
        let isLeftFront = leftWrist.x > rightWrist.x
        let frontWrist = isLeftFront ? leftWrist : rightWrist
        let frontShoulder = isLeftFront ? leftShoulder : rightShoulder
        
        // Arm extension
        let armExtension = bodyHeight > 0 
            ? GeometryUtils.distance(frontShoulder, frontWrist) / bodyHeight 
            : 0
        
        // Back knee angle
        let backKneeAngle: CGFloat
        if isLeftFront {
            backKneeAngle = GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        } else {
            backKneeAngle = GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        }
        
        // Previous frame for velocity
        guard let prevFrame = history.last,
              prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevHipMidpoint = GeometryUtils.midpoint(
            prevFrame.landmarks[PoseLandmarks.LEFT_HIP],
            prevFrame.landmarks[PoseLandmarks.RIGHT_HIP]
        )
        let prevFrontWrist = isLeftFront 
            ? prevFrame.landmarks[PoseLandmarks.LEFT_WRIST]
            : prevFrame.landmarks[PoseLandmarks.RIGHT_WRIST]
        
        let deltaTime = current.timeDeltaMs(prevFrame)
        let forwardVelocity: CGFloat = deltaTime > 0 
            ? (hipMidpoint.x - prevHipMidpoint.x) / CGFloat(deltaTime) * 1000 
            : 0
        let wristVelocity: CGFloat = deltaTime > 0 
            ? (frontWrist.x - prevFrontWrist.x) / CGFloat(deltaTime) * 1000 
            : 0
        
        switch phase {
        case .idle:
            // Detect advance with early arm extension
            if forwardVelocity > ADVANCE_VELOCITY_THRESHOLD &&
               armExtension > ARM_EXTENDED_THRESHOLD * 0.5 {
                phase = .advancing
                phaseStartTime = current.timestampMs
                startHipX = hipMidpoint.x
                return .inProgress(action: .advanceLunge, confidence: 0.4)
            }
            return .none
            
        case .advancing:
            let elapsed = current.timestampMs - phaseStartTime
            let distanceTraveled = hipMidpoint.x - startHipX
            
            // Check timeout
            if elapsed > MAX_ADVANCE_DURATION {
                reset()
                return .none
            }
            
            // Transition to lunge phase
            if wristVelocity > LUNGE_VELOCITY_THRESHOLD &&
               armExtension > ARM_EXTENDED_THRESHOLD * 0.7 {
                phase = .lunging
                return .inProgress(action: .advanceLunge, confidence: 0.6)
            } else if distanceTraveled < -0.01 {
                reset()
                return .none
            }
            return .inProgress(action: .advanceLunge, confidence: 0.5)
            
        case .lunging:
            let totalElapsed = current.timestampMs - phaseStartTime
            
            if totalElapsed > MAX_TOTAL_DURATION {
                reset()
                return .none
            }
            
            // Check lunge completion
            if wristVelocity < LUNGE_VELOCITY_THRESHOLD * 0.3 &&
               armExtension > ARM_EXTENDED_THRESHOLD &&
               backKneeAngle > BACK_KNEE_MIN_STRAIGHT {
                
                let quality = evaluateQuality(armExtension: armExtension,
                                             backKneeAngle: backKneeAngle)
                let feedback = generateFeedback(armExtension: armExtension,
                                               backKneeAngle: backKneeAngle)
                reset()
                return .completed(action: .advanceLunge, quality: quality,
                                 feedback: feedback, durationMs: totalElapsed)
            }
            return .inProgress(action: .advanceLunge, confidence: 0.7)
        }
    }
    
    private func evaluateQuality(armExtension: CGFloat, backKneeAngle: CGFloat) -> ActionQuality {
        let armGood = armExtension > ARM_EXTENDED_THRESHOLD * 1.2
        let legGood = backKneeAngle > 165
        
        if armGood && legGood { return .perfect }
        if armGood || legGood { return .good }
        return .acceptable
    }
    
    private func generateFeedback(armExtension: CGFloat, backKneeAngle: CGFloat) -> String? {
        if armExtension < ARM_EXTENDED_THRESHOLD { return "Arm first!" }
        if backKneeAngle < BACK_KNEE_MIN_STRAIGHT { return "Push back leg!" }
        return nil
    }
    
    func reset() {
        phase = .idle
        phaseStartTime = 0
        startHipX = 0
    }
}
