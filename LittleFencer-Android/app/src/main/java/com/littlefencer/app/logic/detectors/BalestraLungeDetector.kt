package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * BalestraLungeDetector - Detects the Balestra-Lunge (跳步弓步) combination.
 * 
 * Biomechanics:
 * 1. Start from En Garde stance
 * 2. Quick forward hop/jump (both feet leave ground, come together in air)
 * 3. Land with front foot first, followed by rear foot
 * 4. Immediately spring into lunge
 * 
 * Detection Strategy:
 * 1. Detect vertical hip movement (jump phase)
 * 2. Track rapid forward translation during jump
 * 3. Detect landing + immediate lunge initiation
 * 4. Evaluate arm extension and leg form during lunge
 */
class BalestraLungeDetector : ActionDetector {

    override val targetAction = SaberAction.BALESTRA_LUNGE

    private var phase = Phase.IDLE
    private var phaseStartTime = 0L
    private var jumpPeakY = 0f  // Lowest Y value during jump (Y increases downward)
    private var startHipY = 0f
    
    private enum class Phase {
        IDLE,       // Waiting for jump initiation
        JUMPING,    // In the air
        LANDING,    // Just landed, expecting lunge
        LUNGING     // In lunge phase
    }

    companion object {
        // Jump detection
        private const val MIN_JUMP_HEIGHT = 0.03f  // Minimum hip rise (normalized)
        private const val MAX_JUMP_DURATION = 400L  // ms
        
        // Landing to lunge transition
        private const val MAX_LANDING_TO_LUNGE = 300L  // ms to initiate lunge after landing
        
        // Lunge detection
        private const val ARM_EXTENDED_THRESHOLD = 0.25f
        private const val BACK_KNEE_MIN_STRAIGHT = 155f
        private const val MAX_TOTAL_DURATION = 1200L  // ms for complete balestra-lunge
    }

    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 3) return ActionResult.None

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
        
        // Previous frame data
        val prevFrame = history.last()
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevHipMidpoint = GeometryUtils.midpoint(
            prevLandmarks[MediaPipeLandmarks.LEFT_HIP],
            prevLandmarks[MediaPipeLandmarks.RIGHT_HIP]
        )
        
        // Vertical velocity (negative = rising, positive = falling)
        val deltaTime = current.timeDeltaMs(prevFrame)
        val verticalVelocity = if (deltaTime > 0) {
            (hipMidpoint.y - prevHipMidpoint.y) / deltaTime * 1000f
        } else 0f
        
        // Body height estimation
        val bodyHeight = GeometryUtils.distance(shoulderMidpoint, GeometryUtils.midpoint(leftAnkle, rightAnkle))
        
        // Front arm detection
        val isLeftFront = leftWrist.x > rightWrist.x
        val frontWrist = if (isLeftFront) leftWrist else rightWrist
        val frontShoulder = if (isLeftFront) leftShoulder else rightShoulder
        val armExtension = if (bodyHeight > 0) {
            GeometryUtils.distance(frontShoulder, frontWrist) / bodyHeight
        } else 0f
        
        // Back knee angle
        val backKneeAngle = if (isLeftFront) {
            GeometryUtils.angleBetweenPoints(rightHip, rightKnee, rightAnkle)
        } else {
            GeometryUtils.angleBetweenPoints(leftHip, leftKnee, leftAnkle)
        }

        return when (phase) {
            Phase.IDLE -> {
                // Detect jump initiation (rapid upward movement)
                if (verticalVelocity < -0.05f) {  // Rising
                    phase = Phase.JUMPING
                    phaseStartTime = current.timestampMs
                    startHipY = hipMidpoint.y
                    jumpPeakY = hipMidpoint.y
                    
                    ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.3f)
                } else {
                    ActionResult.None
                }
            }
            
            Phase.JUMPING -> {
                val elapsed = current.timestampMs - phaseStartTime
                
                // Track peak (lowest Y)
                if (hipMidpoint.y < jumpPeakY) {
                    jumpPeakY = hipMidpoint.y
                }
                
                // Check timeout
                if (elapsed > MAX_JUMP_DURATION) {
                    reset()
                    return ActionResult.None
                }
                
                // Detect landing (falling and hip Y returns near start)
                if (verticalVelocity > 0.03f && hipMidpoint.y >= startHipY - 0.01f) {
                    val jumpHeight = startHipY - jumpPeakY
                    
                    if (jumpHeight >= MIN_JUMP_HEIGHT) {
                        phase = Phase.LANDING
                        phaseStartTime = current.timestampMs
                        ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.5f)
                    } else {
                        reset()
                        ActionResult.None
                    }
                } else {
                    ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.4f)
                }
            }
            
            Phase.LANDING -> {
                val elapsed = current.timestampMs - phaseStartTime
                
                // Check for lunge initiation (arm extension)
                if (armExtension > ARM_EXTENDED_THRESHOLD * 0.7f) {
                    phase = Phase.LUNGING
                    phaseStartTime = current.timestampMs
                    ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.7f)
                } else if (elapsed > MAX_LANDING_TO_LUNGE) {
                    // No lunge initiated - might just be a jump
                    reset()
                    ActionResult.None
                } else {
                    ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.6f)
                }
            }
            
            Phase.LUNGING -> {
                val totalElapsed = current.timestampMs - phaseStartTime
                
                // Check completion (arm fully extended + back leg straight)
                if (armExtension > ARM_EXTENDED_THRESHOLD && backKneeAngle > BACK_KNEE_MIN_STRAIGHT) {
                    val quality = evaluateQuality(armExtension, backKneeAngle)
                    reset()
                    
                    ActionResult.Completed(
                        action = SaberAction.BALESTRA_LUNGE,
                        quality = quality,
                        durationMs = totalElapsed
                    )
                } else if (totalElapsed > MAX_TOTAL_DURATION) {
                    reset()
                    ActionResult.None
                } else {
                    ActionResult.InProgress(SaberAction.BALESTRA_LUNGE, 0.8f)
                }
            }
        }
    }
    
    private fun evaluateQuality(armExtension: Float, backKneeAngle: Float): ActionQuality {
        val armGood = armExtension > ARM_EXTENDED_THRESHOLD * 1.2f
        val legGood = backKneeAngle > 165f
        
        return when {
            armGood && legGood -> ActionQuality.PERFECT
            armGood || legGood -> ActionQuality.GOOD
            else -> ActionQuality.ACCEPTABLE
        }
    }

    override fun reset() {
        phase = Phase.IDLE
        phaseStartTime = 0L
        jumpPeakY = 0f
        startHipY = 0f
    }
}
