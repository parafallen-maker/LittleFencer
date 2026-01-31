import CoreGraphics
import Foundation

/// Detects the Balestra-Lunge (跳步弓步) combination
///
/// Biomechanics:
/// 1. Start from En Garde stance
/// 2. Quick forward hop/jump (both feet leave ground, come together in air)
/// 3. Land with front foot first, followed by rear foot
/// 4. Immediately spring into lunge
class BalestraLungeDetector: ActionDetector {
    
    let targetAction = SaberAction.balestraLunge
    
    private enum Phase {
        case idle
        case jumping
        case landing
        case lunging
    }
    
    private var phase = Phase.idle
    private var phaseStartTime: Double = 0
    private var jumpPeakY: CGFloat = 0
    private var startHipY: CGFloat = 0
    
    // MARK: - Thresholds
    
    private let MIN_JUMP_HEIGHT: CGFloat = 0.03
    private let MAX_JUMP_DURATION: Double = 400
    private let MAX_LANDING_TO_LUNGE: Double = 300
    private let ARM_EXTENDED_THRESHOLD: CGFloat = 0.25
    private let BACK_KNEE_MIN_STRAIGHT: CGFloat = 155
    private let MAX_TOTAL_DURATION: Double = 1200
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 3, current.landmarks.count >= 33 else {
            return .none
        }
        
        let landmarks = current.landmarks
        
        // Extract key landmarks
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
        
        // Previous frame data
        guard let prevFrame = history.last,
              prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevHipMidpoint = GeometryUtils.midpoint(
            prevFrame.landmarks[PoseLandmarks.LEFT_HIP],
            prevFrame.landmarks[PoseLandmarks.RIGHT_HIP]
        )
        
        // Vertical velocity (negative = rising, positive = falling)
        let deltaTime = current.timeDeltaMs(prevFrame)
        let verticalVelocity: CGFloat = deltaTime > 0 
            ? (hipMidpoint.y - prevHipMidpoint.y) / CGFloat(deltaTime) * 1000 
            : 0
        
        // Body height estimation
        let bodyHeight = GeometryUtils.distance(shoulderMidpoint, 
                                                 GeometryUtils.midpoint(leftAnkle, rightAnkle))
        
        // Front arm detection
        let isLeftFront = leftWrist.x > rightWrist.x
        let frontWrist = isLeftFront ? leftWrist : rightWrist
        let frontShoulder = isLeftFront ? leftShoulder : rightShoulder
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
        
        switch phase {
        case .idle:
            // Detect jump initiation (rapid upward movement)
            if verticalVelocity < -0.05 {
                phase = .jumping
                phaseStartTime = current.timestampMs
                startHipY = hipMidpoint.y
                jumpPeakY = hipMidpoint.y
                return .inProgress(action: .balestraLunge, confidence: 0.3)
            }
            return .none
            
        case .jumping:
            let elapsed = current.timestampMs - phaseStartTime
            
            // Track peak (lowest Y)
            if hipMidpoint.y < jumpPeakY {
                jumpPeakY = hipMidpoint.y
            }
            
            // Check timeout
            if elapsed > MAX_JUMP_DURATION {
                reset()
                return .none
            }
            
            // Detect landing
            if verticalVelocity > 0.03 && hipMidpoint.y >= startHipY - 0.01 {
                let jumpHeight = startHipY - jumpPeakY
                
                if jumpHeight >= MIN_JUMP_HEIGHT {
                    phase = .landing
                    phaseStartTime = current.timestampMs
                    return .inProgress(action: .balestraLunge, confidence: 0.5)
                } else {
                    reset()
                    return .none
                }
            }
            return .inProgress(action: .balestraLunge, confidence: 0.4)
            
        case .landing:
            let elapsed = current.timestampMs - phaseStartTime
            
            // Check timeout
            if elapsed > MAX_LANDING_TO_LUNGE {
                reset()
                return .none
            }
            
            // Detect lunge initiation
            if armExtension > ARM_EXTENDED_THRESHOLD * 0.7 {
                phase = .lunging
                return .inProgress(action: .balestraLunge, confidence: 0.7)
            }
            return .inProgress(action: .balestraLunge, confidence: 0.5)
            
        case .lunging:
            let totalElapsed = current.timestampMs - phaseStartTime
            
            if totalElapsed > MAX_TOTAL_DURATION {
                reset()
                return .none
            }
            
            // Check lunge completion
            if armExtension > ARM_EXTENDED_THRESHOLD &&
               backKneeAngle > BACK_KNEE_MIN_STRAIGHT {
                
                let quality = evaluateQuality(armExtension: armExtension,
                                             backKneeAngle: backKneeAngle)
                reset()
                return .completed(action: .balestraLunge, quality: quality,
                                 feedback: nil, durationMs: totalElapsed)
            }
            return .inProgress(action: .balestraLunge, confidence: 0.8)
        }
    }
    
    private func evaluateQuality(armExtension: CGFloat, backKneeAngle: CGFloat) -> ActionQuality {
        let armGood = armExtension > ARM_EXTENDED_THRESHOLD * 1.2
        let legGood = backKneeAngle > 165
        
        if armGood && legGood { return .perfect }
        if armGood || legGood { return .good }
        return .acceptable
    }
    
    func reset() {
        phase = .idle
        phaseStartTime = 0
        jumpPeakY = 0
        startHipY = 0
    }
}
