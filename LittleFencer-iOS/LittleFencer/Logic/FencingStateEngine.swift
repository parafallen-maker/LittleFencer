import Foundation
import CoreGraphics

/// Fencing action states
enum FencingState: String, CaseIterable {
    case idle = "Idle"          // No pose detected or not in position
    case enGarde = "En Garde"   // Ready stance - waiting for action
    case lunging = "Lunging"    // Forward attack in progress
    case recovery = "Recovery"  // Returning to En Garde
}

/// Form feedback for real-time corrections
struct FormFeedback {
    let isGoodForm: Bool
    let message: String?
    let highlightJoints: [String]
    
    init(isGoodForm: Bool, message: String? = nil, highlightJoints: [String] = []) {
        self.isGoodForm = isGoodForm
        self.message = message
        self.highlightJoints = highlightJoints
    }
}

/// Fencing state machine for detecting fencing actions
/// Uses ActionDetectorManager for advanced action detection
class FencingStateEngine: ObservableObject {
    
    // MARK: - Callbacks
    
    var onStateChanged: ((FencingState, FencingState) -> Void)?
    var onFormFeedback: ((FormFeedback) -> Void)?
    var onRepCompleted: ((Bool) -> Void)?
    var onActionCompleted: ((SaberAction, ActionQuality) -> Void)?
    
    // MARK: - State
    
    @Published private(set) var currentState: FencingState = .idle
    @Published private(set) var currentAction: SaberAction?
    
    /// Track which leg is in front
    private var isLeftLegFront = true
    
    /// Pose history for velocity tracking
    private var previousWristPos: CGPoint?
    private var previousFrameTime: Double = 0
    
    /// Track form quality throughout rep
    private var lastRepHadGoodForm = true
    
    /// Action detector manager
    private let actionDetectorManager = ActionDetectorManager()
    
    // MARK: - Thresholds
    
    private let KNEE_MIN_GOOD: CGFloat = 90
    private let KNEE_MAX_GOOD: CGFloat = 120
    private let KNEE_MIN_ACCEPTABLE: CGFloat = 80
    private let KNEE_MAX_ACCEPTABLE: CGFloat = 135
    private let BACK_KNEE_MIN_STRAIGHT: CGFloat = 155
    private let ARM_EXTENDED_THRESHOLD: CGFloat = 0.25
    private let LUNGE_VELOCITY_THRESHOLD: CGFloat = 0.5
    private let STABLE_VELOCITY_THRESHOLD: CGFloat = 0.1
    private let TORSO_LEAN_MAX: CGFloat = 20
    private let STANCE_WIDTH_MIN: CGFloat = 1.2
    private let STANCE_WIDTH_MAX: CGFloat = 2.0
    private let HEAD_DROP_MAX: CGFloat = 0.08
    private let BLADE_LEVEL_TOLERANCE: CGFloat = 0.15
    private let KNEE_OVER_ANKLE_MAX: CGFloat = 0.08
    
    // MARK: - Processing
    
    /// Process a new frame of pose landmarks
    func processFrame(landmarks: [CGPoint], frameTimeMs: Double) {
        guard landmarks.count >= 33 else {
            transitionTo(.idle)
            actionDetectorManager.reset()
            return
        }
        
        // 1. Process basic metrics for UI overlays
        updateBasicMetrics(landmarks: landmarks)
        
        // 2. Delegate deep action analysis to ActionDetectorManager
        let result = actionDetectorManager.processFrame(landmarks: landmarks, timestampMs: frameTimeMs)
        
        // 3. Handle detection results
        switch result {
        case .completed(let action, let quality, let feedback, _):
            handleCompletedAction(action: action, quality: quality, feedback: feedback)
        case .inProgress(let action, _, let feedback):
            handleInProgressAction(action: action, feedback: feedback)
        case .none:
            handleIdleState(landmarks: landmarks, frameTimeMs: frameTimeMs)
        }
        
        // 4. Update previous frame tracking
        previousFrameTime = frameTimeMs
    }
    
    // MARK: - Action Handlers
    
    private func handleCompletedAction(action: SaberAction, quality: ActionQuality, feedback: String?) {
        // Play feedback based on action and quality
        if quality == .perfect || quality == .good {
            onRepCompleted?(true) // Good rep
            
            let message: String
            switch action {
            case .advance:
                message = AudioFeedbackManager.PHRASE_NICE_ADVANCE
            case .retreat:
                message = AudioFeedbackManager.PHRASE_NICE_RETREAT
            case .lunge, .lunging:
                message = AudioFeedbackManager.PHRASE_NICE_LUNGE
            case .advanceLunge:
                message = "Nice attack!"
            case .flunge:
                message = AudioFeedbackManager.PHRASE_FLUNGE_ALERT
            case .parry:
                message = AudioFeedbackManager.PHRASE_NICE_PARRY
            case .riposte:
                message = AudioFeedbackManager.PHRASE_NICE_RIPOSTE
            case .balestraLunge:
                message = "Nice Balestra!"
            default:
                message = "Good!"
            }
            onFormFeedback?(FormFeedback(isGoodForm: true, message: message))
        } else {
            onRepCompleted?(false) // Bad rep
            if let feedback = feedback {
                onFormFeedback?(FormFeedback(isGoodForm: false, message: feedback))
            }
        }
        
        // Notify action completion
        onActionCompleted?(action, quality)
        
        // Update state after action
        transitionTo(.enGarde)
    }
    
    private func handleInProgressAction(action: SaberAction, feedback: String?) {
        currentAction = action
        
        // Continuous feedback for long-duration actions
        if let feedback = feedback {
            onFormFeedback?(FormFeedback(isGoodForm: false, message: feedback))
        }
        
        // Map to legacy state for UI
        let newState: FencingState
        switch action {
        case .lunge, .lunging, .advanceLunge, .flunge, .balestraLunge:
            newState = .lunging
        case .recovery:
            newState = .recovery
        default:
            // Advances/Retreats are maintaining En Garde
            newState = .enGarde
        }
        transitionTo(newState)
    }
    
    private func handleIdleState(landmarks: [CGPoint], frameTimeMs: Double) {
        // If detector says None, check if we are just standing in En Garde
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        let leftHip = landmarks[PoseLandmarks.LEFT_HIP]
        let rightHip = landmarks[PoseLandmarks.RIGHT_HIP]
        let leftKnee = landmarks[PoseLandmarks.LEFT_KNEE]
        let rightKnee = landmarks[PoseLandmarks.RIGHT_KNEE]
        let leftWrist = landmarks[PoseLandmarks.LEFT_WRIST]
        let rightWrist = landmarks[PoseLandmarks.RIGHT_WRIST]
        
        // Calculate front knee angle
        let isLeftFront = leftAnkle.x > rightAnkle.x
        let frontKneeAngle: CGFloat
        if isLeftFront {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        } else {
            frontKneeAngle = GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        }
        
        // Calculate wrist velocity
        let frontWrist = leftWrist.x > rightWrist.x ? leftWrist : rightWrist
        let velocity: CGFloat
        if let prevWrist = previousWristPos, previousFrameTime > 0 {
            let deltaTime = frameTimeMs - previousFrameTime
            velocity = GeometryUtils.velocity(prevWrist, frontWrist, deltaTime)
        } else {
            velocity = 0
        }
        previousWristPos = frontWrist
        
        // Check if valid En Garde
        let kneeInRange = frontKneeAngle >= KNEE_MIN_ACCEPTABLE && frontKneeAngle <= KNEE_MAX_ACCEPTABLE
        let isStable = velocity < STABLE_VELOCITY_THRESHOLD * 2
        
        if kneeInRange && isStable {
            transitionTo(.enGarde)
            
            // Evaluate and provide form feedback
            let feedback = evaluateEnGardeForm(landmarks: landmarks, frontKneeAngle: frontKneeAngle)
            onFormFeedback?(feedback)
        } else {
            transitionTo(.idle)
        }
    }
    
    private func updateBasicMetrics(landmarks: [CGPoint]) {
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        isLeftLegFront = leftAnkle.x > rightAnkle.x
    }
    
    // MARK: - Form Evaluation
    
    private func evaluateEnGardeForm(landmarks: [CGPoint], frontKneeAngle: CGFloat) -> FormFeedback {
        var issues: [String] = []
        var badJoints: [String] = []
        let frontKneeJoint = isLeftLegFront ? "left_knee" : "right_knee"
        let backKneeJoint = isLeftLegFront ? "right_knee" : "left_knee"
        
        let leftHip = landmarks[PoseLandmarks.LEFT_HIP]
        let rightHip = landmarks[PoseLandmarks.RIGHT_HIP]
        let leftKnee = landmarks[PoseLandmarks.LEFT_KNEE]
        let rightKnee = landmarks[PoseLandmarks.RIGHT_KNEE]
        let leftAnkle = landmarks[PoseLandmarks.LEFT_ANKLE]
        let rightAnkle = landmarks[PoseLandmarks.RIGHT_ANKLE]
        let leftShoulder = landmarks[PoseLandmarks.LEFT_SHOULDER]
        let rightShoulder = landmarks[PoseLandmarks.RIGHT_SHOULDER]
        let nose = landmarks[PoseLandmarks.NOSE]
        
        // Calculate back knee angle
        let backKneeAngle: CGFloat
        if isLeftLegFront {
            backKneeAngle = GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        } else {
            backKneeAngle = GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        }
        
        // Calculate stance width
        let shoulderWidth = GeometryUtils.distance(leftShoulder, rightShoulder)
        let stanceWidth = abs(leftAnkle.x - rightAnkle.x) / (shoulderWidth + 0.001)
        
        // Calculate torso lean
        let shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        let hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        let torsoLeanAngle = atan2(
            shoulderMidpoint.x - hipMidpoint.x,
            hipMidpoint.y - shoulderMidpoint.y
        ) * 180.0 / .pi
        
        // Calculate head drop
        let headDrop = nose.y - shoulderMidpoint.y
        
        // Priority 1: Front knee angle
        if frontKneeAngle < KNEE_MIN_GOOD {
            issues.append(AudioFeedbackManager.PHRASE_TOO_LOW)
            badJoints.append(frontKneeJoint)
        } else if frontKneeAngle > KNEE_MAX_GOOD {
            issues.append(AudioFeedbackManager.PHRASE_BEND_MORE)
            badJoints.append(frontKneeJoint)
        }
        
        // Priority 2: Back leg straight
        if backKneeAngle < BACK_KNEE_MIN_STRAIGHT && issues.isEmpty {
            issues.append(AudioFeedbackManager.PHRASE_BACK_LEG)
            badJoints.append(backKneeJoint)
        }
        
        // Priority 3: Stance width
        if stanceWidth < STANCE_WIDTH_MIN && issues.isEmpty {
            issues.append(AudioFeedbackManager.PHRASE_WIDER_STANCE)
            badJoints.append("left_ankle")
            badJoints.append("right_ankle")
        }
        
        // Priority 4: Torso upright
        if abs(torsoLeanAngle) > TORSO_LEAN_MAX && issues.isEmpty {
            issues.append(AudioFeedbackManager.PHRASE_STAY_UPRIGHT)
            badJoints.append("left_shoulder")
            badJoints.append("right_shoulder")
        }
        
        // Priority 5: Head position
        if headDrop > HEAD_DROP_MAX && issues.isEmpty {
            issues.append(AudioFeedbackManager.PHRASE_HEAD_UP)
        }
        
        lastRepHadGoodForm = issues.isEmpty
        
        return FormFeedback(
            isGoodForm: issues.isEmpty,
            message: issues.first,
            highlightJoints: badJoints
        )
    }
    
    // MARK: - State Management
    
    private func transitionTo(_ newState: FencingState) {
        guard newState != currentState else { return }
        let oldState = currentState
        currentState = newState
        onStateChanged?(oldState, newState)
    }
    
    /// Reset the state machine
    func reset() {
        currentState = .idle
        currentAction = nil
        previousWristPos = nil
        previousFrameTime = 0
        lastRepHadGoodForm = true
        actionDetectorManager.reset()
    }
}
