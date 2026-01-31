import CoreGraphics
import Foundation

/// LungeDetector - Detects the standalone Lunge (弓步) action.
///
/// Biomechanics:
/// - Start from En Garde stance
/// - Front foot steps forward explosively
/// - Arm extends FIRST, then front leg moves
/// - Back leg remains straight to provide power
/// - Body stays upright
///
/// Detection Strategy:
/// 1. Detect arm extension initiation (arm-first principle)
/// 2. Track front foot forward movement
/// 3. Verify back leg straightens
/// 4. Complete when forward velocity decreases (landing)
class LungeDetector: ActionDetector {
    
    let targetAction = SaberAction.lunge
    
    private var phase = Phase.idle
    private var phaseStartTime: Double = 0
    private var startHipX: CGFloat = 0
    private var startWristX: CGFloat = 0
    private var peakVelocity: CGFloat = 0
    
    private enum Phase {
        case idle
        case armExtending   // Arm starts extending first
        case lunging        // Full body moving forward
        case landing        // Deceleration phase
    }
    
    // MARK: - Thresholds
    
    // Arm extension thresholds
    private let ARM_EXTENSION_START: CGFloat = 0.20
    private let ARM_EXTENSION_FULL: CGFloat = 0.30
    private let WRIST_VELOCITY_THRESHOLD: CGFloat = 0.15
    
    // Body movement thresholds
    private let HIP_VELOCITY_THRESHOLD: CGFloat = 0.08
    private let HIP_FORWARD_DISTANCE: CGFloat = 0.05
    
    // Back leg check
    private let BACK_KNEE_MIN_STRAIGHT: CGFloat = 150
    private let BACK_KNEE_IDEAL: CGFloat = 165
    
    // Front knee check (should be bent, over ankle)
    private let FRONT_KNEE_MAX_ANGLE: CGFloat = 120
    private let FRONT_KNEE_IDEAL: CGFloat = 90
    
    // Timing
    private let MAX_ARM_PHASE: Double = 300
    private let MAX_LUNGE_DURATION: Double = 800
    private let MIN_LUNGE_DURATION: Double = 150
    
    // Quality thresholds
    private let TORSO_UPRIGHT_THRESHOLD: CGFloat = 10
    
    // MARK: - Detection
    
    func detect(current: PoseFrame, history: [PoseFrame]) -> ActionResult {
        guard history.count >= 5, current.landmarks.count >= 33 else {
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
        let ankleMidpoint = GeometryUtils.midpoint(leftAnkle, rightAnkle)
        let bodyHeight = GeometryUtils.distance(shoulderMidpoint, ankleMidpoint)
        
        // Determine front side based on wrist position (weapon arm forward)
        let isLeftFront = leftWrist.x > rightWrist.x
        let frontWrist = isLeftFront ? leftWrist : rightWrist
        let frontShoulder = isLeftFront ? leftShoulder : rightShoulder
        let frontKnee = isLeftFront ? leftKnee : rightKnee
        let frontHip = isLeftFront ? leftHip : rightHip
        let frontAnkle = isLeftFront ? leftAnkle : rightAnkle
        let backKnee = isLeftFront ? rightKnee : leftKnee
        let backHip = isLeftFront ? rightHip : leftHip
        let backAnkle = isLeftFront ? rightAnkle : leftAnkle
        
        // Calculate arm extension (normalized by body height)
        let armExtension: CGFloat = bodyHeight > 0 ? GeometryUtils.distance(frontShoulder, frontWrist) / bodyHeight : 0
        
        // Calculate knee angles
        let frontKneeAngle = GeometryUtils.angleBetweenPoints(frontHip, frontKnee, frontAnkle)
        let backKneeAngle = GeometryUtils.angleBetweenPoints(backHip, backKnee, backAnkle)
        
        // Torso angle (for quality check)
        let torsoAngle = GeometryUtils.angleBetweenPoints(
            hipMidpoint,
            shoulderMidpoint,
            CGPoint(x: shoulderMidpoint.x, y: shoulderMidpoint.y - 0.1)
        )
        
        // Previous frame for velocity calculations
        guard let prevFrame = history.last, prevFrame.landmarks.count >= 33 else {
            return .none
        }
        
        let prevLandmarks = prevFrame.landmarks
        let prevHipMidpoint = GeometryUtils.midpoint(
            prevLandmarks[PoseLandmarks.LEFT_HIP],
            prevLandmarks[PoseLandmarks.RIGHT_HIP]
        )
        let prevFrontWrist = isLeftFront ? prevLandmarks[PoseLandmarks.LEFT_WRIST] : prevLandmarks[PoseLandmarks.RIGHT_WRIST]
        
        let deltaTime = current.timeDeltaMs(prevFrame)
        let hipVelocity: CGFloat = deltaTime > 0 ? (hipMidpoint.x - prevHipMidpoint.x) / CGFloat(deltaTime) * 1000 : 0
        let wristVelocity: CGFloat = deltaTime > 0 ? (frontWrist.x - prevFrontWrist.x) / CGFloat(deltaTime) * 1000 : 0
        
        switch phase {
        case .idle:
            // Detect arm extension initiation (arm-first principle!)
            if wristVelocity > WRIST_VELOCITY_THRESHOLD && armExtension > ARM_EXTENSION_START {
                phase = .armExtending
                phaseStartTime = current.timestampMs
                startHipX = hipMidpoint.x
                startWristX = frontWrist.x
                peakVelocity = wristVelocity
                return .inProgress(action: .lunge, confidence: 0.3)
            }
            return .none
            
        case .armExtending:
            let elapsed = current.timestampMs - phaseStartTime
            
            if wristVelocity > peakVelocity {
                peakVelocity = wristVelocity
            }
            
            if elapsed > MAX_ARM_PHASE || wristVelocity < 0 {
                reset()
                return .none
            }
            
            if hipVelocity > HIP_VELOCITY_THRESHOLD && armExtension > ARM_EXTENSION_START * 1.5 {
                phase = .lunging
                return .inProgress(action: .lunge, confidence: 0.5)
            }
            return .inProgress(action: .lunge, confidence: 0.4)
            
        case .lunging:
            let elapsed = current.timestampMs - phaseStartTime
            
            if hipVelocity > peakVelocity {
                peakVelocity = hipVelocity
            }
            
            if elapsed > MAX_LUNGE_DURATION {
                reset()
                return .none
            }
            
            let distanceTraveled = hipMidpoint.x - startHipX
            
            if hipVelocity < HIP_VELOCITY_THRESHOLD * 0.5 && distanceTraveled > HIP_FORWARD_DISTANCE && armExtension > ARM_EXTENSION_FULL {
                phase = .landing
                return .inProgress(action: .lunge, confidence: 0.8)
            } else if distanceTraveled < -0.02 {
                reset()
                return .none
            }
            return .inProgress(action: .lunge, confidence: 0.6)
            
        case .landing:
            let elapsed = current.timestampMs - phaseStartTime
            
            let armFullyExtended = armExtension > ARM_EXTENSION_FULL
            let backLegStraight = backKneeAngle > BACK_KNEE_MIN_STRAIGHT
            let frontKneeBent = frontKneeAngle < FRONT_KNEE_MAX_ANGLE
            
            if armFullyExtended && backLegStraight && frontKneeBent {
                let quality = evaluateQuality(
                    armExtension: armExtension,
                    backKneeAngle: backKneeAngle,
                    frontKneeAngle: frontKneeAngle,
                    torsoAngle: torsoAngle,
                    duration: elapsed
                )
                
                let feedback = generateFeedback(
                    armExtension: armExtension,
                    backKneeAngle: backKneeAngle,
                    frontKneeAngle: frontKneeAngle,
                    torsoAngle: torsoAngle
                )
                
                reset()
                return .completed(action: .lunge, quality: quality, feedback: feedback, durationMs: elapsed)
            } else if elapsed > MAX_LUNGE_DURATION {
                reset()
                return .none
            }
            return .inProgress(action: .lunge, confidence: 0.85)
        }
    }
    
    // MARK: - Quality Evaluation
    
    private func evaluateQuality(
        armExtension: CGFloat,
        backKneeAngle: CGFloat,
        frontKneeAngle: CGFloat,
        torsoAngle: CGFloat,
        duration: Double
    ) -> ActionQuality {
        var score = 0
        
        if armExtension > ARM_EXTENSION_FULL * 1.2 {
            score += 2
        } else if armExtension > ARM_EXTENSION_FULL {
            score += 1
        }
        
        if backKneeAngle > BACK_KNEE_IDEAL {
            score += 2
        } else if backKneeAngle > BACK_KNEE_MIN_STRAIGHT {
            score += 1
        }
        
        if frontKneeAngle >= FRONT_KNEE_IDEAL - 15 && frontKneeAngle <= FRONT_KNEE_IDEAL + 15 {
            score += 2
        } else if frontKneeAngle < FRONT_KNEE_MAX_ANGLE {
            score += 1
        }
        
        if torsoAngle < TORSO_UPRIGHT_THRESHOLD {
            score += 1
        }
        
        if duration >= MIN_LUNGE_DURATION && duration <= 500 {
            score += 1
        }
        
        switch score {
        case 7...8: return .perfect
        case 5...6: return .good
        case 3...4: return .acceptable
        default: return .poor
        }
    }
    
    private func generateFeedback(
        armExtension: CGFloat,
        backKneeAngle: CGFloat,
        frontKneeAngle: CGFloat,
        torsoAngle: CGFloat
    ) -> String? {
        if armExtension < ARM_EXTENSION_FULL {
            return "Arm first! Extend fully."
        }
        if backKneeAngle < BACK_KNEE_MIN_STRAIGHT {
            return "Push back leg straight!"
        }
        if frontKneeAngle > FRONT_KNEE_MAX_ANGLE {
            return "Bend front knee more."
        }
        if torsoAngle > TORSO_UPRIGHT_THRESHOLD * 2 {
            return "Stay upright!"
        }
        return nil
    }
    
    func reset() {
        phase = .idle
        phaseStartTime = 0
        startHipX = 0
        startWristX = 0
        peakVelocity = 0
    }
}
