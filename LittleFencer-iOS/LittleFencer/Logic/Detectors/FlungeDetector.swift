import CoreGraphics
import Foundation

/// Detects the Flunge (飞弓步) - saber's replacement for the banned fleche
///
/// Biomechanics:
/// - A "flying lunge" - essentially an exaggerated lunge with explosive forward momentum
/// - Back foot may leave ground but MUST NOT pass the front foot (rule)
/// - Body fully commits forward with maximum arm extension
/// - Very high forward velocity compared to normal lunge
class FlungeDetector: ActionDetector {
    
    let targetAction = SaberAction.flunge
    
    private var isFlunging = false
    private var flungeStartTime: Double = 0
    private var peakVelocity: CGFloat = 0
    
    // MARK: - Thresholds
    
    private let FLUNGE_VELOCITY_THRESHOLD: CGFloat = 0.8
    private let ARM_EXTENDED_THRESHOLD: CGFloat = 0.25
    private let MAX_FLUNGE_DURATION: Double = 600
    private let BACK_KNEE_MIN_STRAIGHT: CGFloat = 155
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 5, current.landmarks.count >= 33 else {
            return .none
        }
        
        let landmarks = current.landmarks
        
        // Extract landmarks
        let leftShoulder = landmarks[PoseLandmarks.LEFT_SHOULDER]
        let rightShoulder = landmarks[PoseLandmarks.RIGHT_SHOULDER]
        let leftHip = landmarks[PoseLandmarks.LEFT_HIP]
        let rightHip = landmarks[PoseLandmarks.RIGHT_HIP]
        let leftWrist = landmarks[PoseLandmarks.LEFT_WRIST]
        let rightWrist = landmarks[PoseLandmarks.RIGHT_WRIST]
        let leftKnee = landmarks[PoseLandmarks.LEFT_KNEE]
        let rightKnee = landmarks[PoseLandmarks.RIGHT_KNEE]
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        
        let shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        let ankleMidpoint = GeometryUtils.midpoint(leftAnkle, rightAnkle)
        let bodyHeight = GeometryUtils.distance(shoulderMidpoint, ankleMidpoint)
        
        // Determine front side
        let isLeftFront = leftWrist.x > rightWrist.x
        let frontWrist = isLeftFront ? leftWrist : rightWrist
        let frontShoulder = isLeftFront ? leftShoulder : rightShoulder
        let frontAnkle = isLeftFront ? leftAnkle : rightAnkle
        let backAnkle = isLeftFront ? rightAnkle : leftAnkle
        
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
        
        let prevFrontWrist = isLeftFront 
            ? prevFrame.landmarks[PoseLandmarks.LEFT_WRIST]
            : prevFrame.landmarks[PoseLandmarks.RIGHT_WRIST]
        
        let deltaTime = current.timeDeltaMs(prevFrame)
        let wristVelocity: CGFloat = deltaTime > 0 
            ? (frontWrist.x - prevFrontWrist.x) / CGFloat(deltaTime) * 1000 
            : 0
        
        // Rule check: back foot must not pass front foot
        let backFootPassed = backAnkle.x > frontAnkle.x
        
        if !isFlunging {
            // Check for flunge initiation
            if armExtension > ARM_EXTENDED_THRESHOLD &&
               wristVelocity > FLUNGE_VELOCITY_THRESHOLD &&
               !backFootPassed {
                isFlunging = true
                flungeStartTime = current.timestampMs
                peakVelocity = wristVelocity
                return .inProgress(action: .flunge, confidence: 0.6)
            }
            return .none
        } else {
            let elapsed = current.timestampMs - flungeStartTime
            
            // Track peak velocity
            if wristVelocity > peakVelocity {
                peakVelocity = wristVelocity
            }
            
            // Rule violation check
            if backFootPassed {
                reset()
                return .completed(action: .flunge, quality: .poor,
                                 feedback: "Back foot passed! (Rule violation)",
                                 durationMs: elapsed)
            }
            
            // Check timeout
            if elapsed > MAX_FLUNGE_DURATION {
                reset()
                return .none
            }
            
            // Check completion
            if wristVelocity < peakVelocity * 0.3 &&
               armExtension > ARM_EXTENDED_THRESHOLD &&
               backKneeAngle > BACK_KNEE_MIN_STRAIGHT {
                
                let quality = evaluateQuality(armExtension: armExtension,
                                             backKneeAngle: backKneeAngle,
                                             peakVelocity: peakVelocity)
                let feedback = generateFeedback(armExtension: armExtension,
                                               backKneeAngle: backKneeAngle)
                reset()
                return .completed(action: .flunge, quality: quality,
                                 feedback: feedback, durationMs: elapsed)
            }
            
            return .inProgress(action: .flunge, confidence: 0.7)
        }
    }
    
    private func evaluateQuality(armExtension: CGFloat, backKneeAngle: CGFloat, peakVelocity: CGFloat) -> ActionQuality {
        let armGood = armExtension > ARM_EXTENDED_THRESHOLD * 1.2
        let legGood = backKneeAngle > 165
        let velocityGood = peakVelocity > FLUNGE_VELOCITY_THRESHOLD * 1.5
        
        var score = 0
        if armGood { score += 1 }
        if legGood { score += 1 }
        if velocityGood { score += 1 }
        
        switch score {
        case 3: return .perfect
        case 2: return .good
        case 1: return .acceptable
        default: return .poor
        }
    }
    
    private func generateFeedback(armExtension: CGFloat, backKneeAngle: CGFloat) -> String? {
        if armExtension < ARM_EXTENDED_THRESHOLD { return "Arm first!" }
        if backKneeAngle < BACK_KNEE_MIN_STRAIGHT { return "Push back leg!" }
        return nil
    }
    
    func reset() {
        isFlunging = false
        flungeStartTime = 0
        peakVelocity = 0
    }
}
