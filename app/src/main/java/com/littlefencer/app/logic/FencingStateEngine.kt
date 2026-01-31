package com.littlefencer.app.logic

import android.graphics.PointF
import android.util.Log
import com.littlefencer.app.feedback.AudioFeedbackManager
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

    // Action detector manager
    private val actionDetectorManager = ActionDetectorManager()

    /**
     * Process a new frame of pose landmarks.
     * 
     * @param landmarks List of 33 PointF landmarks from MediaPipe (normalized 0-1)
     * @param frameTimeMs Current frame timestamp in milliseconds
     */
    fun processFrame(landmarks: List<PointF>, frameTimeMs: Long) {
        if (landmarks.size < 33) {
            transitionTo(FencingState.IDLE)
            actionDetectorManager.reset()
            return
        }
        
        // 1. Process basic metrics for UI overlays (always needed)
        updateBasicMetrics(landmarks)

        // 2. Delegate deep action analysis to ActionDetectorManager
        val result = actionDetectorManager.processFrame(landmarks, frameTimeMs)
        
        // 3. Handle detection results
        when (result) {
            is ActionResult.Completed -> handleCompletedAction(result)
            is ActionResult.InProgress -> handleInProgressAction(result)
            is ActionResult.None -> handleIdleState(landmarks, frameTimeMs)
        }
        
        // 4. Update internal state for UI compatibility (mapping new actions to known states)
        updateLegacyState(result)
    }
    
    // ... helper methods ...

    private fun handleCompletedAction(result: ActionResult.Completed) {
        // Play feedback based on action and quality
        if (result.quality == ActionQuality.PERFECT || result.quality == ActionQuality.GOOD) {
            onRepCompleted(true) // Good rep
            
            val message = when(result.action) {
                SaberAction.ADVANCE -> AudioFeedbackManager.PHRASE_NICE_ADVANCE
                SaberAction.RETREAT -> AudioFeedbackManager.PHRASE_NICE_RETREAT
                SaberAction.LUNGE -> AudioFeedbackManager.PHRASE_NICE_LUNGE
                SaberAction.ADVANCE_LUNGE -> "Nice attack!"
                SaberAction.FLUNGE -> AudioFeedbackManager.PHRASE_FLUNGE_ALERT
                SaberAction.PARRY -> AudioFeedbackManager.PHRASE_NICE_PARRY
                SaberAction.RIPOSTE -> AudioFeedbackManager.PHRASE_NICE_RIPOSTE
                SaberAction.BALESTRA_LUNGE -> "Nice Balestra!"
                else -> "Good!"
            }
            // Only speak if there isn't a specific form feedback error overriding it
            onFormFeedback(FormFeedback(true, message))
        } else {
            onRepCompleted(false) // Bad rep
            // Speak specific feedback if available, e.g. "Knee out!"
            result.feedback?.let { 
                onFormFeedback(FormFeedback(false, it))
            }
        }
    }

    private fun handleInProgressAction(result: ActionResult.InProgress) {
        // Continuous feedback for long-duration actions
        if (result.feedback != null) {
             onFormFeedback(FormFeedback(false, result.feedback))
        }
        
        // Map to legacy state for UI
        val newState = when(result.action) {
            SaberAction.LUNGE, SaberAction.ADVANCE_LUNGE, SaberAction.FLUNGE, SaberAction.BALESTRA_LUNGE -> FencingState.LUNGING
            SaberAction.RECOVERY -> FencingState.RECOVERY
            else -> FencingState.EN_GARDE // Advances/Retreats are maintaining En Garde
        }
        transitionTo(newState)
    }

    private fun handleIdleState(landmarks: List<PointF>, frameTimeMs: Long) {
        // If detector says None, check if we are just standing in En Garde
        // Reuse existing isValidEnGarde logic (simplified)
        // Note: In P2, we might want a dedicated StaticEnGardeDetector
        transitionTo(FencingState.EN_GARDE) // Default assumption if skeletons are present
    }
    
    private fun updateLegacyState(result: ActionResult) {
        // Logic moved to handleInProgressAction for cleaner flow
    }

    private fun updateBasicMetrics(landmarks: List<PointF>) {
        // Extract key points needed for simple UI updates (knee angles etc)
        // This ensures the green/red lines on the skeleton still work
        val leftAnkle = landmarks[MediaPipeLandmarks.LEFT_ANKLE]
        val rightAnkle = landmarks[MediaPipeLandmarks.RIGHT_ANKLE]
        isLeftLegFront = leftAnkle.x > rightAnkle.x
        
        // Recalculate angles for UI (ActionDetectorManager does this internally for logic)
        // We could expose metrics from Manager to avoid duplicate math, but for now re-calc is cheap
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
