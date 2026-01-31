package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * LungeDetector - Detects the standalone Lunge (弓步) action.
 * 
 * Biomechanics:
 * - Start from En Garde stance
 * - Front foot steps forward explosively
 * - Arm extends FIRST, then front leg moves
 * - Back leg remains straight to provide power
 * - Body stays upright
 * 
 * Detection Strategy:
 * 1. Detect arm extension initiation (arm-first principle)
 * 2. Track front foot forward movement
 * 3. Verify back leg straightens
 * 4. Complete when forward velocity decreases (landing)
 */
class LungeDetector : ActionDetector {

    override val targetAction = SaberAction.LUNGE

    private var phase = Phase.IDLE
    private var phaseStartTime = 0L
    private var startHipX = 0f
    private var startWristX = 0f
    private var peakVelocity = 0f

    private enum class Phase {
        IDLE,
        ARM_EXTENDING,  // Arm starts extending first
        LUNGING,        // Full body moving forward
        LANDING         // Deceleration phase
    }

    companion object {
        // Arm extension thresholds
        private const val ARM_EXTENSION_START = 0.20f   // Initial arm extension
        private const val ARM_EXTENSION_FULL = 0.30f    // Full extension
        private const val WRIST_VELOCITY_THRESHOLD = 0.15f  // Arm moving forward
        
        // Body movement thresholds
        private const val HIP_VELOCITY_THRESHOLD = 0.08f
        private const val HIP_FORWARD_DISTANCE = 0.05f
        
        // Back leg check
        private const val BACK_KNEE_MIN_STRAIGHT = 150f
        private const val BACK_KNEE_IDEAL = 165f
        
        // Front knee check (should be bent, over ankle)
        private const val FRONT_KNEE_MAX_ANGLE = 120f
        private const val FRONT_KNEE_IDEAL = 90f
        
        // Timing
        private const val MAX_ARM_PHASE = 300L      // Arm should extend quickly
        private const val MAX_LUNGE_DURATION = 800L // Total lunge time
        private const val MIN_LUNGE_DURATION = 150L // Too fast = not a real lunge
        
        // Quality thresholds
        private const val TORSO_UPRIGHT_THRESHOLD = 10f  // Degrees from vertical
    }

    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 5) return ActionResult.None

        val landmarks = current.landmarks
        if (landmarks.size < 33) return ActionResult.None

        // Extract key landmarks
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
        
        // Determine front side based on wrist position (weapon arm forward)
        val isLeftFront = leftWrist.x > rightWrist.x
        val frontWrist = if (isLeftFront) leftWrist else rightWrist
        val frontShoulder = if (isLeftFront) leftShoulder else rightShoulder
        val frontKnee = if (isLeftFront) leftKnee else rightKnee
        val frontHip = if (isLeftFront) leftHip else rightHip
        val frontAnkle = if (isLeftFront) leftAnkle else rightAnkle
        val backKnee = if (isLeftFront) rightKnee else leftKnee
        val backHip = if (isLeftFront) rightHip else leftHip
        val backAnkle = if (isLeftFront) rightAnkle else leftAnkle

        // Calculate arm extension (normalized by body height)
        val armExtension = if (bodyHeight > 0) {
            GeometryUtils.distance(frontShoulder, frontWrist) / bodyHeight
        } else 0f

        // Calculate knee angles
        val frontKneeAngle = GeometryUtils.angleBetweenPoints(frontHip, frontKnee, frontAnkle)
        val backKneeAngle = GeometryUtils.angleBetweenPoints(backHip, backKnee, backAnkle)

        // Torso angle (for quality check)
        val torsoAngle = GeometryUtils.angleBetweenPoints(
            hipMidpoint,
            shoulderMidpoint,
            android.graphics.PointF(shoulderMidpoint.x, shoulderMidpoint.y - 0.1f)  // Reference up
        )

        // Previous frame for velocity calculations
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
        val hipVelocity = if (deltaTime > 0) {
            (hipMidpoint.x - prevHipMidpoint.x) / deltaTime * 1000f
        } else 0f
        val wristVelocity = if (deltaTime > 0) {
            (frontWrist.x - prevFrontWrist.x) / deltaTime * 1000f
        } else 0f

        return when (phase) {
            Phase.IDLE -> {
                // Detect arm extension initiation (arm-first principle!)
                if (wristVelocity > WRIST_VELOCITY_THRESHOLD && 
                    armExtension > ARM_EXTENSION_START) {
                    
                    phase = Phase.ARM_EXTENDING
                    phaseStartTime = current.timestampMs
                    startHipX = hipMidpoint.x
                    startWristX = frontWrist.x
                    peakVelocity = wristVelocity
                    
                    ActionResult.InProgress(SaberAction.LUNGE, 0.3f)
                } else {
                    ActionResult.None
                }
            }

            Phase.ARM_EXTENDING -> {
                val elapsed = current.timestampMs - phaseStartTime
                
                // Track peak velocity
                if (wristVelocity > peakVelocity) {
                    peakVelocity = wristVelocity
                }
                
                // Timeout or wrong movement
                if (elapsed > MAX_ARM_PHASE || wristVelocity < 0) {
                    reset()
                    return ActionResult.None
                }
                
                // Transition to lunging phase when body starts moving
                if (hipVelocity > HIP_VELOCITY_THRESHOLD && 
                    armExtension > ARM_EXTENSION_START * 1.5f) {
                    
                    phase = Phase.LUNGING
                    ActionResult.InProgress(SaberAction.LUNGE, 0.5f)
                } else {
                    ActionResult.InProgress(SaberAction.LUNGE, 0.4f)
                }
            }

            Phase.LUNGING -> {
                val elapsed = current.timestampMs - phaseStartTime
                
                // Track peak velocity
                if (hipVelocity > peakVelocity) {
                    peakVelocity = hipVelocity
                }
                
                // Timeout
                if (elapsed > MAX_LUNGE_DURATION) {
                    reset()
                    return ActionResult.None
                }
                
                val distanceTraveled = hipMidpoint.x - startHipX
                
                // Transition to landing when decelerating
                if (hipVelocity < HIP_VELOCITY_THRESHOLD * 0.5f && 
                    distanceTraveled > HIP_FORWARD_DISTANCE &&
                    armExtension > ARM_EXTENSION_FULL) {
                    
                    phase = Phase.LANDING
                    ActionResult.InProgress(SaberAction.LUNGE, 0.8f)
                } else if (distanceTraveled < -0.02f) {
                    // Moving backward = abort
                    reset()
                    ActionResult.None
                } else {
                    ActionResult.InProgress(SaberAction.LUNGE, 0.6f)
                }
            }

            Phase.LANDING -> {
                val elapsed = current.timestampMs - phaseStartTime
                val distanceTraveled = hipMidpoint.x - startHipX
                
                // Verify final lunge position
                val armFullyExtended = armExtension > ARM_EXTENSION_FULL
                val backLegStraight = backKneeAngle > BACK_KNEE_MIN_STRAIGHT
                val frontKneeBent = frontKneeAngle < FRONT_KNEE_MAX_ANGLE
                
                if (armFullyExtended && backLegStraight && frontKneeBent) {
                    // Lunge completed!
                    val quality = evaluateQuality(
                        armExtension = armExtension,
                        backKneeAngle = backKneeAngle,
                        frontKneeAngle = frontKneeAngle,
                        torsoAngle = torsoAngle,
                        duration = elapsed
                    )
                    
                    val feedback = generateFeedback(
                        armExtension = armExtension,
                        backKneeAngle = backKneeAngle,
                        frontKneeAngle = frontKneeAngle,
                        torsoAngle = torsoAngle
                    )
                    
                    reset()
                    ActionResult.Completed(
                        action = SaberAction.LUNGE,
                        quality = quality,
                        feedback = feedback,
                        durationMs = elapsed
                    )
                } else if (elapsed > MAX_LUNGE_DURATION) {
                    // Timeout - incomplete lunge
                    reset()
                    ActionResult.None
                } else {
                    ActionResult.InProgress(SaberAction.LUNGE, 0.85f)
                }
            }
        }
    }

    private fun evaluateQuality(
        armExtension: Float,
        backKneeAngle: Float,
        frontKneeAngle: Float,
        torsoAngle: Float,
        duration: Long
    ): ActionQuality {
        var score = 0
        
        // Arm extension (max 2 points)
        if (armExtension > ARM_EXTENSION_FULL * 1.2f) score += 2
        else if (armExtension > ARM_EXTENSION_FULL) score += 1
        
        // Back leg straight (max 2 points)
        if (backKneeAngle > BACK_KNEE_IDEAL) score += 2
        else if (backKneeAngle > BACK_KNEE_MIN_STRAIGHT) score += 1
        
        // Front knee bent correctly (max 2 points)
        if (frontKneeAngle in (FRONT_KNEE_IDEAL - 15f)..(FRONT_KNEE_IDEAL + 15f)) score += 2
        else if (frontKneeAngle < FRONT_KNEE_MAX_ANGLE) score += 1
        
        // Torso upright (max 1 point)
        if (torsoAngle < TORSO_UPRIGHT_THRESHOLD) score += 1
        
        // Timing (max 1 point) - not too fast, not too slow
        if (duration in MIN_LUNGE_DURATION..500L) score += 1
        
        return when {
            score >= 7 -> ActionQuality.PERFECT
            score >= 5 -> ActionQuality.GOOD
            score >= 3 -> ActionQuality.ACCEPTABLE
            else -> ActionQuality.POOR
        }
    }

    private fun generateFeedback(
        armExtension: Float,
        backKneeAngle: Float,
        frontKneeAngle: Float,
        torsoAngle: Float
    ): String? {
        // Priority order of feedback
        if (armExtension < ARM_EXTENSION_FULL) {
            return "Arm first! Extend fully."
        }
        if (backKneeAngle < BACK_KNEE_MIN_STRAIGHT) {
            return "Push back leg straight!"
        }
        if (frontKneeAngle > FRONT_KNEE_MAX_ANGLE) {
            return "Bend front knee more."
        }
        if (torsoAngle > TORSO_UPRIGHT_THRESHOLD * 2) {
            return "Stay upright!"
        }
        return null  // No issues - good lunge!
    }

    override fun reset() {
        phase = Phase.IDLE
        phaseStartTime = 0L
        startHipX = 0f
        startWristX = 0f
        peakVelocity = 0f
    }
}
