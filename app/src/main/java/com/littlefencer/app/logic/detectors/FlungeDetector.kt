package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * FlungeDetector - Detects the Flunge (飞弓步) - saber's replacement for the banned fleche.
 * 
 * Biomechanics:
 * - A "flying lunge" - essentially an exaggerated lunge with explosive forward momentum
 * - Back foot may leave ground but MUST NOT pass the front foot (rule)
 * - Body fully commits forward with maximum arm extension
 * - Very high forward velocity compared to normal lunge
 * 
 * Detection Strategy:
 * 1. Arm extends first (attacking principle)
 * 2. Detect explosive forward velocity (much higher than normal lunge)
 * 3. Check back leg leaves ground briefly (optional but common)
 * 4. Verify back foot never passes front foot (rule compliance)
 */
class FlungeDetector : ActionDetector {

    override val targetAction = SaberAction.FLUNGE

    private var isFlunging = false
    private var flungeStartTime = 0L
    private var peakVelocity = 0f
    
    companion object {
        // Flunge requires higher velocity than normal lunge
        private const val FLUNGE_VELOCITY_THRESHOLD = 0.8f  // vs 0.5f for lunge
        
        // Arm must be extended first
        private const val ARM_EXTENDED_THRESHOLD = 0.25f
        
        // Maximum duration
        private const val MAX_FLUNGE_DURATION = 600L  // Faster than normal lunge
        
        // Back leg should be nearly straight
        private const val BACK_KNEE_MIN_STRAIGHT = 155f
    }

    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 5) return ActionResult.None

        val landmarks = current.landmarks
        if (landmarks.size < 33) return ActionResult.None

        // Extract landmarks
        val leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER]
        val rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER]
        val leftHip = landmarks[MediaPipeLandmarks.LEFT_HIP]
        val rightHip = landmarks[MediaPipeLandmarks.RIGHT_HIP]
        val leftWrist = landmarks[MediaPipeLandmarks.LEFT_WRIST]
        val rightWrist = landmarks[MediaPipeLandmarks.RIGHT_WRIST]
        val leftKnee = landmarks[MediaPipeLandmarks.LEFT_KNEE]
        val rightKnee = landmarks[MediaPipeLandmarks.RIGHT_KNEE]
        val leftAnkle = landmarks[MediaPipeLandmarks.LEFT_ANKLE]
        val rightAnkle = landmarks[MediaPipeLandmarks.RIGHT_ANKLE]

        val shoulderMidpoint = GeometryUtils.midpoint(leftShoulder, rightShoulder)
        val ankleMidpoint = GeometryUtils.midpoint(leftAnkle, rightAnkle)
        val bodyHeight = GeometryUtils.distance(shoulderMidpoint, ankleMidpoint)
        
        // Determine front side
        val isLeftFront = leftWrist.x > rightWrist.x
        val frontWrist = if (isLeftFront) leftWrist else rightWrist
        val frontShoulder = if (isLeftFront) leftShoulder else rightShoulder
        val frontAnkle = if (isLeftFront) leftAnkle else rightAnkle
        val backAnkle = if (isLeftFront) rightAnkle else leftAnkle
        
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

        // Calculate forward velocity
        val prevFrame = history.last()
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevFrontWrist = if (isLeftFront) {
            prevLandmarks[MediaPipeLandmarks.LEFT_WRIST]
        } else {
            prevLandmarks[MediaPipeLandmarks.RIGHT_WRIST]
        }
        
        val deltaTime = current.timeDeltaMs(prevFrame)
        val wristVelocity = if (deltaTime > 0) {
            (frontWrist.x - prevFrontWrist.x) / deltaTime * 1000f
        } else 0f

        // Rule check: back foot must not pass front foot
        val backFootPassed = backAnkle.x > frontAnkle.x

        return if (!isFlunging) {
            // Check for flunge initiation
            if (armExtension > ARM_EXTENDED_THRESHOLD && 
                wristVelocity > FLUNGE_VELOCITY_THRESHOLD &&
                !backFootPassed) {
                
                isFlunging = true
                flungeStartTime = current.timestampMs
                peakVelocity = wristVelocity
                
                ActionResult.InProgress(SaberAction.FLUNGE, 0.6f)
            } else {
                ActionResult.None
            }
        } else {
            val elapsed = current.timestampMs - flungeStartTime
            
            // Track peak velocity
            if (wristVelocity > peakVelocity) {
                peakVelocity = wristVelocity
            }
            
            // Rule violation check
            if (backFootPassed) {
                reset()
                return ActionResult.Completed(
                    action = SaberAction.FLUNGE,
                    quality = ActionQuality.POOR,
                    feedback = "Back foot passed! (Rule violation)"
                )
            }
            
            // Check timeout
            if (elapsed > MAX_FLUNGE_DURATION) {
                reset()
                return ActionResult.None
            }
            
            // Check completion (velocity decreasing, arm extended, back leg straight)
            if (wristVelocity < peakVelocity * 0.3f &&
                armExtension > ARM_EXTENDED_THRESHOLD &&
                backKneeAngle > BACK_KNEE_MIN_STRAIGHT) {
                
                val quality = evaluateQuality(peakVelocity, armExtension, backKneeAngle)
                reset()
                
                ActionResult.Completed(
                    action = SaberAction.FLUNGE,
                    quality = quality,
                    durationMs = elapsed
                )
            } else {
                ActionResult.InProgress(SaberAction.FLUNGE, 0.7f)
            }
        }
    }
    
    private fun evaluateQuality(velocity: Float, armExt: Float, backKnee: Float): ActionQuality {
        val velocityGood = velocity > FLUNGE_VELOCITY_THRESHOLD * 1.5f
        val armGood = armExt > ARM_EXTENDED_THRESHOLD * 1.2f
        val legGood = backKnee > 165f
        
        val score = listOf(velocityGood, armGood, legGood).count { it }
        
        return when (score) {
            3 -> ActionQuality.PERFECT
            2 -> ActionQuality.GOOD
            1 -> ActionQuality.ACCEPTABLE
            else -> ActionQuality.POOR
        }
    }

    override fun reset() {
        isFlunging = false
        flungeStartTime = 0L
        peakVelocity = 0f
    }
}
