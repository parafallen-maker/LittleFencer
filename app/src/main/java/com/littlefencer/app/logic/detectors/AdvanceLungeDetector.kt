package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * AdvanceLungeDetector - Detects the Advance-Lunge (前进弓步) combination.
 * 
 * Biomechanics:
 * - Start from En Garde stance
 * - Execute a small advance step to close distance
 * - Immediately follow with a full lunge
 * - The arm begins extending during the advance
 * 
 * Detection Strategy:
 * 1. Detect advance initiation (forward hip movement)
 * 2. Detect arm extension beginning during advance
 * 3. Detect lunge completion (full arm extension + back leg straight)
 */
class AdvanceLungeDetector : ActionDetector {

    override val targetAction = SaberAction.ADVANCE_LUNGE

    private var phase = Phase.IDLE
    private var phaseStartTime = 0L
    private var startHipX = 0f
    
    private enum class Phase {
        IDLE,
        ADVANCING,  // Forward step in progress
        LUNGING     // Lunge phase
    }

    companion object {
        // Advance phase
        private const val MIN_ADVANCE_DISTANCE = 0.02f  // Smaller than solo advance
        private const val ADVANCE_VELOCITY_THRESHOLD = 0.015f
        
        // Lunge phase
        private const val ARM_EXTENDED_THRESHOLD = 0.25f
        private const val LUNGE_VELOCITY_THRESHOLD = 0.3f
        private const val BACK_KNEE_MIN_STRAIGHT = 155f
        
        // Timing
        private const val MAX_ADVANCE_DURATION = 500L
        private const val MAX_TOTAL_DURATION = 1000L
    }

    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 5) return ActionResult.None

        val landmarks = current.landmarks
        if (landmarks.size < 33) return ActionResult.None

        // Extract landmarks
        val leftHip = landmarks[MediaPipeLandmarks.LEFT_HIP]
        val rightHip = landmarks[MediaPipeLandmarks.RIGHT_HIP]
        val leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER]
        val rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER]
        val leftWrist = landmarks[MediaPipeLandmarks.LEFT_WRIST]
        val rightWrist = landmarks[MediaPipeLandmarks.RIGHT_WRIST]
        val leftKnee = landmarks[MediaPipeLandmarks.LEFT_KNEE]
        val rightKnee = landmarks[MediaPipeLandmarks.RIGHT_KNEE]
        val leftAnkle = landmarks[MediaPipeLandmarks.LEFT_ANKLE]
        val rightAnkle = landmarks[MediaPipeLandmarks.RIGHT_ANKLE]

        val hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        val shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        val ankleMidpoint = GeometryUtils.midpoint(leftAnkle, rightAnkle)
        val bodyHeight = GeometryUtils.distance(shoulderMidpoint, ankleMidpoint)
        
        // Determine front side
        val isLeftFront = leftWrist.x > rightWrist.x
        val frontWrist = if (isLeftFront) leftWrist else rightWrist
        val frontShoulder = if (isLeftFront) leftShoulder else rightShoulder
        
        // Arm extension
        val armExtension = if (bodyHeight > 0) {
            GeometryUtils.distance(frontShoulder, frontWrist) / bodyHeight
        } else 0f
        
        // Back knee angle
        val backKneeAngle = if (isLeftFront) {
            GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        } else {
            GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        }

        // Previous frame for velocity
        val prevFrame = history.last()
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevHipMidpoint = GeometryUtils.midpoint(
            prevLandmarks[MediaPipeLandmarks.LEFT_HIP],
            prevLandmarks[MediaPipeLandmarks.RIGHT_HIP]
        )
        val prevFrontWrist = if (isLeftFront) {
            prevLandmarks[MediaPipeLandmarks.LEFT_WRIST]
        } else {
            prevLandmarks[MediaPipeLandmarks.RIGHT_WRIST]
        }
        
        val deltaTime = current.timeDeltaMs(prevFrame)
        val forwardVelocity = if (deltaTime > 0) {
            (hipMidpoint.x - prevHipMidpoint.x) / deltaTime * 1000f
        } else 0f
        val wristVelocity = if (deltaTime > 0) {
            (frontWrist.x - prevFrontWrist.x) / deltaTime * 1000f
        } else 0f

        return when (phase) {
            Phase.IDLE -> {
                // Detect advance with early arm extension (key differentiator)
                if (forwardVelocity > ADVANCE_VELOCITY_THRESHOLD && 
                    armExtension > ARM_EXTENDED_THRESHOLD * 0.5f) {
                    
                    phase = Phase.ADVANCING
                    phaseStartTime = current.timestampMs
                    startHipX = hipMidpoint.x
                    
                    ActionResult.InProgress(SaberAction.ADVANCE_LUNGE, 0.4f)
                } else {
                    ActionResult.None
                }
            }
            
            Phase.ADVANCING -> {
                val elapsed = current.timestampMs - phaseStartTime
                val distanceTraveled = hipMidpoint.x - startHipX
                
                // Check timeout
                if (elapsed > MAX_ADVANCE_DURATION) {
                    // Just an advance, not advance-lunge
                    reset()
                    return ActionResult.None
                }
                
                // Transition to lunge phase (high wrist velocity + arm extending)
                if (wristVelocity > LUNGE_VELOCITY_THRESHOLD && 
                    armExtension > ARM_EXTENDED_THRESHOLD * 0.7f) {
                    
                    phase = Phase.LUNGING
                    ActionResult.InProgress(SaberAction.ADVANCE_LUNGE, 0.6f)
                } else if (distanceTraveled < -0.01f) {
                    // Moving backward - abort
                    reset()
                    ActionResult.None
                } else {
                    ActionResult.InProgress(SaberAction.ADVANCE_LUNGE, 0.5f)
                }
            }
            
            Phase.LUNGING -> {
                val totalElapsed = current.timestampMs - phaseStartTime
                
                // Check timeout
                if (totalElapsed > MAX_TOTAL_DURATION) {
                    reset()
                    return ActionResult.None
                }
                
                // Check completion (full arm extension + back leg straight)
                if (armExtension > ARM_EXTENDED_THRESHOLD && 
                    backKneeAngle > BACK_KNEE_MIN_STRAIGHT) {
                    
                    val quality = evaluateQuality(armExtension, backKneeAngle)
                    reset()
                    
                    ActionResult.Completed(
                        action = SaberAction.ADVANCE_LUNGE,
                        quality = quality,
                        durationMs = totalElapsed
                    )
                } else {
                    ActionResult.InProgress(SaberAction.ADVANCE_LUNGE, 0.8f)
                }
            }
        }
    }
    
    private fun evaluateQuality(armExt: Float, backKnee: Float): ActionQuality {
        val armGood = armExt > ARM_EXTENDED_THRESHOLD * 1.2f
        val legGood = backKnee > 165f
        
        return when {
            armGood && legGood -> ActionQuality.PERFECT
            armGood || legGood -> ActionQuality.GOOD
            else -> ActionQuality.ACCEPTABLE
        }
    }

    override fun reset() {
        phase = Phase.IDLE
        phaseStartTime = 0L
        startHipX = 0f
    }
}
