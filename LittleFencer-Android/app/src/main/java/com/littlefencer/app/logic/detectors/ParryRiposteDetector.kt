package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * ParryRiposteDetector - Detects Parry (格挡) and Riposte (反攻) actions.
 * 
 * Saber Parry Positions:
 * - Tierce (3): Block to the outside, blade moves laterally
 * - Quarte (4): Block to the inside
 * - Quinte (5): Block to the head (high parry)
 * 
 * Biomechanics:
 * - Parry: Quick wrist movement to deflect, minimal arm movement
 * - Riposte: Immediate counter-attack following successful parry
 * 
 * Detection Strategy:
 * 1. Detect rapid wrist lateral/vertical movement (parry)
 * 2. Wrist returns to attack position quickly (riposte)
 * 3. Full parry-riposte should complete within ~500ms
 */
class ParryRiposteDetector : ActionDetector {

    override val targetAction = SaberAction.PARRY  // Primary action

    private var phase = Phase.IDLE
    private var phaseStartTime = 0L
    private var parryDirection = ParryDirection.NONE
    private var parryWristPos = 0f to 0f  // X, Y at parry peak
    
    private enum class Phase {
        IDLE,
        PARRYING,  // Defensive wrist movement
        RIPOSTING  // Counter-attack
    }
    
    private enum class ParryDirection {
        NONE,
        TIERCE,  // Outside (wrist moves away from body)
        QUARTE,  // Inside (wrist moves toward body)
        QUINTE   // High (wrist moves up for head protection)
    }

    companion object {
        // Parry detection
        private const val PARRY_LATERAL_THRESHOLD = 0.04f   // Min wrist lateral movement
        private const val PARRY_VERTICAL_THRESHOLD = 0.03f  // Min wrist vertical movement for quinte
        private const val PARRY_VELOCITY_THRESHOLD = 0.3f   // Quick defensive motion
        
        // Riposte detection
        private const val RIPOSTE_VELOCITY_THRESHOLD = 0.4f  // Forward velocity
        private const val MAX_PARRY_TO_RIPOSTE = 400L        // ms between parry and riposte
        
        // Timeouts
        private const val MAX_PARRY_DURATION = 300L
        private const val MAX_TOTAL_DURATION = 800L
    }

    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 5) return ActionResult.None

        val landmarks = current.landmarks
        if (landmarks.size < 33) return ActionResult.None

        // Determine front side and extract wrist positions
        val leftWrist = landmarks[MediaPipeLandmarks.LEFT_WRIST]
        val rightWrist = landmarks[MediaPipeLandmarks.RIGHT_WRIST]
        val leftShoulder = landmarks[MediaPipeLandmarks.LEFT_SHOULDER]
        val rightShoulder = landmarks[MediaPipeLandmarks.RIGHT_SHOULDER]
        
        val isLeftFront = leftWrist.x > rightWrist.x
        val frontWrist = if (isLeftFront) leftWrist else rightWrist
        val frontShoulder = if (isLeftFront) leftShoulder else rightShoulder
        
        // Get previous frame data
        val prevFrame = history.last()
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevFrontWrist = if (isLeftFront) {
            prevLandmarks[MediaPipeLandmarks.LEFT_WRIST]
        } else {
            prevLandmarks[MediaPipeLandmarks.RIGHT_WRIST]
        }
        
        val deltaTime = current.timeDeltaMs(prevFrame)
        
        // Calculate wrist velocities
        val lateralVelocity = if (deltaTime > 0) {
            (frontWrist.x - prevFrontWrist.x) / deltaTime * 1000f
        } else 0f
        
        val verticalVelocity = if (deltaTime > 0) {
            (frontWrist.y - prevFrontWrist.y) / deltaTime * 1000f
        } else 0f
        
        // Wrist position relative to shoulder
        val wristRelativeX = frontWrist.x - frontShoulder.x
        val wristRelativeY = frontWrist.y - frontShoulder.y

        return when (phase) {
            Phase.IDLE -> {
                // Detect parry initiation (rapid defensive wrist movement)
                val direction = detectParryDirection(lateralVelocity, verticalVelocity, isLeftFront)
                
                if (direction != ParryDirection.NONE) {
                    phase = Phase.PARRYING
                    phaseStartTime = current.timestampMs
                    parryDirection = direction
                    
                    ActionResult.InProgress(SaberAction.PARRY, 0.5f)
                } else {
                    ActionResult.None
                }
            }
            
            Phase.PARRYING -> {
                val elapsed = current.timestampMs - phaseStartTime
                
                // Check timeout
                if (elapsed > MAX_PARRY_DURATION) {
                    // Parry completed without riposte
                    val quality = evaluateParryQuality()
                    reset()
                    
                    return ActionResult.Completed(
                        action = SaberAction.PARRY,
                        quality = quality,
                        feedback = getParryName(),
                        durationMs = elapsed
                    )
                }
                
                // Detect riposte initiation (forward velocity after parry)
                if (lateralVelocity > RIPOSTE_VELOCITY_THRESHOLD && 
                    kotlin.math.abs(verticalVelocity) < PARRY_VELOCITY_THRESHOLD * 0.5f) {
                    
                    parryWristPos = frontWrist.x to frontWrist.y
                    phase = Phase.RIPOSTING
                    
                    ActionResult.InProgress(SaberAction.RIPOSTE, 0.7f)
                } else {
                    ActionResult.InProgress(SaberAction.PARRY, 0.6f)
                }
            }
            
            Phase.RIPOSTING -> {
                val totalElapsed = current.timestampMs - phaseStartTime
                
                // Check timeout
                if (totalElapsed > MAX_TOTAL_DURATION) {
                    reset()
                    return ActionResult.None
                }
                
                // Check completion (wrist extended forward past parry position)
                if (frontWrist.x > parryWristPos.first + 0.03f) {
                    val quality = evaluateRiposteQuality(lateralVelocity)
                    reset()
                    
                    ActionResult.Completed(
                        action = SaberAction.RIPOSTE,
                        quality = quality,
                        feedback = "${getParryName()} → Riposte!",
                        durationMs = totalElapsed
                    )
                } else {
                    ActionResult.InProgress(SaberAction.RIPOSTE, 0.8f)
                }
            }
        }
    }
    
    private fun detectParryDirection(lateralV: Float, verticalV: Float, isLeftFront: Boolean): ParryDirection {
        // Quinte (head parry) - upward movement
        if (verticalV < -PARRY_VELOCITY_THRESHOLD) {
            return ParryDirection.QUINTE
        }
        
        // Tierce/Quarte - lateral movement
        if (kotlin.math.abs(lateralV) > PARRY_VELOCITY_THRESHOLD) {
            return if ((lateralV < 0 && isLeftFront) || (lateralV > 0 && !isLeftFront)) {
                ParryDirection.TIERCE  // Outside
            } else {
                ParryDirection.QUARTE  // Inside
            }
        }
        
        return ParryDirection.NONE
    }
    
    private fun getParryName(): String = when (parryDirection) {
        ParryDirection.TIERCE -> "Tierce (外格)"
        ParryDirection.QUARTE -> "Quarte (内格)"
        ParryDirection.QUINTE -> "Quinte (头格)"
        ParryDirection.NONE -> "Parry"
    }
    
    private fun evaluateParryQuality(): ActionQuality {
        // Simple evaluation based on successful detection
        return ActionQuality.GOOD
    }
    
    private fun evaluateRiposteQuality(velocity: Float): ActionQuality {
        return when {
            velocity > RIPOSTE_VELOCITY_THRESHOLD * 1.5f -> ActionQuality.PERFECT
            velocity > RIPOSTE_VELOCITY_THRESHOLD -> ActionQuality.GOOD
            else -> ActionQuality.ACCEPTABLE
        }
    }

    override fun reset() {
        phase = Phase.IDLE
        phaseStartTime = 0L
        parryDirection = ParryDirection.NONE
        parryWristPos = 0f to 0f
    }
}
