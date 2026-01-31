package com.littlefencer.app.logic

import android.graphics.PointF
import android.util.Log
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * FencingStateEngine - State Machine for detecting fencing actions.
 * 
 * Analyzes pose landmarks to detect the action sequence:
 * IDLE → EN_GARDE → LUNGING → RECOVERY → EN_GARDE (loop)
 * 
 * Based on PRD requirements:
 * - En Garde: Knee bent 90°-120°, stable stance
 * - Lunge: Arm extension + forward movement
 * - Good form: Green skeleton
 * - Bad form: Red skeleton + audio correction
 */
class FencingStateEngine(
    private val onStateChanged: (FencingState, FencingState) -> Unit,
    private val onFormFeedback: (FormFeedback) -> Unit,
    private val onRepCompleted: (Boolean) -> Unit  // true = good rep, false = bad rep
) {
    /**
     * Fencing action states
     */
    enum class FencingState {
        IDLE,       // No pose detected or not in position
        EN_GARDE,   // Ready stance - waiting for action
        LUNGING,    // Forward attack in progress
        RECOVERY    // Returning to En Garde
    }

    /**
     * Form feedback for real-time corrections
     */
    data class FormFeedback(
        val isGoodForm: Boolean,
        val message: String?,      // TTS message for correction
        val highlightJoints: List<String> = emptyList()  // Joints to highlight red
    )

    // Current state
    private var currentState = FencingState.IDLE
    
    // Track which leg is in front (for dynamic joint feedback)
    private var isLeftLegFront = true
    
    // Pose history for velocity tracking
    private var previousWristPos: PointF? = null
    private var previousFrameTime: Long = 0
    
    // Thresholds (tuned for youth fencers, may need adjustment)
    companion object {
        private const val TAG = "FencingStateEngine"
        
        // Front Knee angle thresholds (degrees)
        private const val KNEE_MIN_GOOD = 90f
        private const val KNEE_MAX_GOOD = 120f
        private const val KNEE_MIN_ACCEPTABLE = 80f
        private const val KNEE_MAX_ACCEPTABLE = 135f
        
        // Back Knee angle thresholds (should be nearly straight)
        private const val BACK_KNEE_MIN_STRAIGHT = 155f
        
        // Arm extension threshold (normalized distance, wrist-to-shoulder)
        private const val ARM_EXTENDED_THRESHOLD = 0.25f  // Relative to body height
        
        // Velocity threshold for lunge detection (units per second)
        private const val LUNGE_VELOCITY_THRESHOLD = 0.5f
        
        // Stability threshold for En Garde (low velocity)
        private const val STABLE_VELOCITY_THRESHOLD = 0.1f
        
        // Torso lean threshold (degrees from vertical)
        private const val TORSO_LEAN_MAX = 20f
        
        // Stance width (normalized by shoulder width)
        private const val STANCE_WIDTH_MIN = 1.2f
        private const val STANCE_WIDTH_MAX = 2.0f
        
        // Head position (nose should not drop below shoulders)
        private const val HEAD_DROP_MAX = 0.08f  // Normalized distance
        
        // Blade/wrist level (wrist Y relative to shoulder Y)
        private const val BLADE_LEVEL_TOLERANCE = 0.15f
        
        // Knee over ankle check
        private const val KNEE_OVER_ANKLE_MAX = 0.08f  // Normalized distance
    }

    /**
     * Process a new frame of pose landmarks.
     * 
     * @param landmarks List of 33 PointF landmarks from MediaPipe (normalized 0-1)
     * @param frameTimeMs Current frame timestamp in milliseconds
     */
    fun processFrame(landmarks: List<PointF>, frameTimeMs: Long) {
        if (landmarks.size < 33) {
            transitionTo(FencingState.IDLE)
            return
        }

        // Extract key points using shared landmark constants
        val nose = landmarks[MediaPipeLandmarks.NOSE]
        val leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER]
        val rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER]
        val leftElbow = landmarks[MediaPipeLandmarks.LEFT_ELBOW]
        val rightElbow = landmarks[MediaPipeLandmarks.RIGHT_ELBOW]
        val leftWrist = landmarks[MediaPipeLandmarks.LEFT_WRIST]
        val rightWrist = landmarks[MediaPipeLandmarks.RIGHT_WRIST]
        val leftHip = landmarks[MediaPipeLandmarks.LEFT_HIP]
        val rightHip = landmarks[MediaPipeLandmarks.RIGHT_HIP]
        val leftKnee = landmarks[MediaPipeLandmarks.LEFT_KNEE]
        val rightKnee = landmarks[MediaPipeLandmarks.RIGHT_KNEE]
        val leftAnkle = landmarks[MediaPipeLandmarks.LEFT_ANKLE]
        val rightAnkle = landmarks[MediaPipeLandmarks.RIGHT_ANKLE]
        
        // Computed reference points
        val shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        val hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        val shoulderWidth = GeometryUtils.distance(leftShoulder, rightShoulder)

        // Dynamically detect which leg is in front (based on ankle X position)
        // Front foot is the one closer to the opponent (higher X in mirror view)
        isLeftLegFront = leftAnkle.x > rightAnkle.x
        
        // Calculate knee angles based on detected front leg
        val (frontKneeAngle, backKneeAngle) = if (isLeftLegFront) {
            Pair(
                GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle),
                GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
            )
        } else {
            Pair(
                GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle),
                GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
            )
        }
        
        // Determine dominant (front) arm based on which wrist is further forward
        val (frontWrist, frontShoulder, frontElbow) = if (leftWrist.x > rightWrist.x) {
            Triple(leftWrist, leftShoulder, leftElbow)
        } else {
            Triple(rightWrist, rightShoulder, rightElbow)
        }
        
        // Body height estimation for normalization
        val bodyHeight = GeometryUtils.distance(shoulderMidpoint, GeometryUtils.midpoint(leftAnkle, rightAnkle))
        
        // Arm extension (normalized by body height)
        val armLength = GeometryUtils.distance(frontShoulder, frontWrist)
        val armExtension = if (bodyHeight > 0) armLength / bodyHeight else 0f
        
        // === Enhanced metrics for form analysis ===
        
        // Stance width (normalized by shoulder width)
        val stanceWidth = kotlin.math.abs(leftAnkle.x - rightAnkle.x) / (shoulderWidth + 0.001f)
        
        // Torso lean angle (degrees from vertical)
        val torsoLeanAngle = kotlin.math.atan2(
            (shoulderMidpoint.x - hipMidpoint.x).toDouble(),
            (hipMidpoint.y - shoulderMidpoint.y).toDouble()  // Y is inverted
        ) * 180.0 / kotlin.math.PI
        
        // Head drop (nose Y relative to shoulder Y, positive = dropped)
        val headDrop = nose.y - shoulderMidpoint.y
        
        // Blade/wrist level (wrist Y relative to shoulder Y)
        val bladeLevel = frontWrist.y - frontShoulder.y
        
        // Knee over ankle check (for lunge)
        val frontKneePos = if (isLeftLegFront) leftKnee else rightKnee
        val frontAnklePos = if (isLeftLegFront) leftAnkle else rightAnkle
        val kneeOverAnkle = frontKneePos.x - frontAnklePos.x
        
        // Wrist velocity for movement detection
        val deltaTime = frameTimeMs - previousFrameTime
        val wristVelocity = previousWristPos?.let { prev ->
            GeometryUtils.velocity(prev, frontWrist, deltaTime)
        } ?: 0f
        
        // Update history
        previousWristPos = frontWrist
        previousFrameTime = frameTimeMs

        // State machine logic
        when (currentState) {
            FencingState.IDLE -> {
                if (isValidEnGarde(frontKneeAngle, backKneeAngle, wristVelocity)) {
                    transitionTo(FencingState.EN_GARDE)
                }
            }
            
            FencingState.EN_GARDE -> {
                // Check form and provide feedback with enhanced metrics
                val feedback = evaluateEnGardeForm(
                    frontKneeAngle, backKneeAngle, stanceWidth, 
                    torsoLeanAngle.toFloat(), headDrop
                )
                onFormFeedback(feedback)
                
                // Detect lunge initiation
                if (armExtension > ARM_EXTENDED_THRESHOLD && wristVelocity > LUNGE_VELOCITY_THRESHOLD) {
                    transitionTo(FencingState.LUNGING)
                }
                
                // Lost stance
                if (!isValidEnGarde(frontKneeAngle, backKneeAngle, wristVelocity)) {
                    transitionTo(FencingState.IDLE)
                }
            }
            
            FencingState.LUNGING -> {
                // Check lunge form with enhanced metrics
                val feedback = evaluateLungeForm(
                    frontKneeAngle, backKneeAngle, armExtension,
                    torsoLeanAngle.toFloat(), headDrop, bladeLevel, kneeOverAnkle
                )
                onFormFeedback(feedback)
                
                // Detect recovery (arm retracting, slowing down)
                if (wristVelocity < STABLE_VELOCITY_THRESHOLD && armExtension < ARM_EXTENDED_THRESHOLD) {
                    transitionTo(FencingState.RECOVERY)
                }
            }
            
            FencingState.RECOVERY -> {
                // Check if returned to En Garde
                if (isValidEnGarde(frontKneeAngle, backKneeAngle, wristVelocity)) {
                    // Rep completed!
                    val wasGoodRep = evaluateOverallRep()
                    onRepCompleted(wasGoodRep)
                    transitionTo(FencingState.EN_GARDE)
                }
                
                // Timeout or lost position
                if (!isRecovering(frontKneeAngle, backKneeAngle)) {
                    transitionTo(FencingState.IDLE)
                }
            }
        }
        
        Log.v(TAG, "State: $currentState, Knee: $frontKneeAngle°, Arm: $armExtension, Vel: $wristVelocity")
    }

    private fun transitionTo(newState: FencingState) {
        if (newState != currentState) {
            val oldState = currentState
            currentState = newState
            Log.d(TAG, "State transition: $oldState → $newState")
            onStateChanged(oldState, newState)
        }
    }

    private fun isValidEnGarde(frontKnee: Float, backKnee: Float, velocity: Float): Boolean {
        val kneeInRange = frontKnee in KNEE_MIN_ACCEPTABLE..KNEE_MAX_ACCEPTABLE
        val isStable = velocity < STABLE_VELOCITY_THRESHOLD * 2  // Allow some movement
        return kneeInRange && isStable
    }

    private fun isRecovering(frontKnee: Float, backKnee: Float): Boolean {
        // More lenient check during recovery
        return frontKnee in 60f..180f
    }

    /**
     * Evaluate En Garde stance form with comprehensive checks.
     */
    private fun evaluateEnGardeForm(
        frontKnee: Float, 
        backKnee: Float,
        stanceWidth: Float,
        torsoLean: Float,
        headDrop: Float
    ): FormFeedback {
        val issues = mutableListOf<String>()
        val badJoints = mutableListOf<String>()
        val frontKneeJoint = if (isLeftLegFront) "left_knee" else "right_knee"
        val backKneeJoint = if (isLeftLegFront) "right_knee" else "left_knee"
        
        // Priority 1: Front knee angle (most critical)
        when {
            frontKnee < KNEE_MIN_GOOD -> {
                issues.add("Too low!")  // Knee too bent/collapsed
                badJoints.add(frontKneeJoint)
            }
            frontKnee > KNEE_MAX_GOOD -> {
                issues.add("Bend more!")  // Knee too straight
                badJoints.add(frontKneeJoint)
            }
        }
        
        // Priority 2: Back leg straight
        if (backKnee < BACK_KNEE_MIN_STRAIGHT && issues.isEmpty()) {
            issues.add("Push back leg!")
            badJoints.add(backKneeJoint)
        }
        
        // Priority 3: Stance width
        if (stanceWidth < STANCE_WIDTH_MIN && issues.isEmpty()) {
            issues.add("Wider stance!")
            badJoints.add("left_ankle")
            badJoints.add("right_ankle")
        }
        
        // Priority 4: Torso upright
        if (kotlin.math.abs(torsoLean) > TORSO_LEAN_MAX && issues.isEmpty()) {
            issues.add("Stay upright!")
            badJoints.add("left_shoulder")
            badJoints.add("right_shoulder")
        }
        
        // Priority 5: Head position
        if (headDrop > HEAD_DROP_MAX && issues.isEmpty()) {
            issues.add("Head up!")
        }
        
        // Track form quality for rep evaluation
        lastRepHadGoodForm = issues.isEmpty()
        
        return if (issues.isEmpty()) {
            FormFeedback(isGoodForm = true, message = null)
        } else {
            FormFeedback(isGoodForm = false, message = issues.first(), highlightJoints = badJoints)
        }
    }

    /**
     * Evaluate Lunge form with comprehensive checks.
     */
    private fun evaluateLungeForm(
        frontKnee: Float,
        backKnee: Float,
        armExtension: Float,
        torsoLean: Float,
        headDrop: Float,
        bladeLevel: Float,
        kneeOverAnkle: Float
    ): FormFeedback {
        val issues = mutableListOf<String>()
        val badJoints = mutableListOf<String>()
        val frontKneeJoint = if (isLeftLegFront) "left_knee" else "right_knee"
        val backKneeJoint = if (isLeftLegFront) "right_knee" else "left_knee"
        val frontWristJoint = if (isLeftLegFront) "left_wrist" else "right_wrist"
        
        // Priority 1: Arm first principle
        if (armExtension < ARM_EXTENDED_THRESHOLD * 0.8f) {
            issues.add("Arm first!")
            badJoints.add(frontWristJoint)
        }
        
        // Priority 2: Back leg must be fully extended (power generation)
        if (backKnee < BACK_KNEE_MIN_STRAIGHT && issues.isEmpty()) {
            issues.add("Push back leg!")
            badJoints.add(backKneeJoint)
        }
        
        // Priority 3: Knee over ankle check (injury prevention)
        if (kneeOverAnkle > KNEE_OVER_ANKLE_MAX && issues.isEmpty()) {
            issues.add("Knee forward!")
            badJoints.add(frontKneeJoint)
        }
        
        // Priority 4: Front knee collapse
        if (frontKnee < 70f && issues.isEmpty()) {
            issues.add("Knee out!")
            badJoints.add(frontKneeJoint)
        }
        
        // Priority 5: Stay upright (don't lean forward)
        if (torsoLean > TORSO_LEAN_MAX && issues.isEmpty()) {
            issues.add("Stay upright!")
            badJoints.add("left_shoulder")
            badJoints.add("right_shoulder")
        }
        
        // Priority 6: Head position
        if (headDrop > HEAD_DROP_MAX && issues.isEmpty()) {
            issues.add("Head up!")
        }
        
        // Priority 7: Blade level
        if (bladeLevel > BLADE_LEVEL_TOLERANCE && issues.isEmpty()) {
            issues.add("Blade level!")
            badJoints.add(frontWristJoint)
        }
        
        // Track form quality for rep evaluation
        lastRepHadGoodForm = lastRepHadGoodForm && issues.isEmpty()
        
        return if (issues.isEmpty()) {
            FormFeedback(isGoodForm = true, message = null)
        } else {
            FormFeedback(isGoodForm = false, message = issues.first(), highlightJoints = badJoints)
        }
    }

    private var lastRepHadGoodForm = true
    
    private fun evaluateOverallRep(): Boolean {
        // In a more sophisticated implementation, we'd track form throughout the rep
        // For MVP, we return the last known form state
        return lastRepHadGoodForm
    }

    /**
     * Reset the state machine (e.g., when user leaves frame)
     */
    fun reset() {
        currentState = FencingState.IDLE
        previousWristPos = null
        previousFrameTime = 0
    }

    /**
     * Get current state for UI display
     */
    fun getCurrentState(): FencingState = currentState
}
