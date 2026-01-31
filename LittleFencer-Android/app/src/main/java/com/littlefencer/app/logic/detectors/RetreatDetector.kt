package com.littlefencer.app.logic.detectors

import com.littlefencer.app.logic.ActionDetector
import com.littlefencer.app.logic.ActionQuality
import com.littlefencer.app.logic.ActionResult
import com.littlefencer.app.logic.PoseFrame
import com.littlefencer.app.logic.SaberAction
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * RetreatDetector - Detects the Retreat (后退步) footwork.
 * 
 * Biomechanics:
 * - Back foot moves first, touches ground with ball of foot
 * - Front foot slides back to maintain En Garde position
 * - Movement accelerates (slow start, quick finish)
 * - Must maintain balance and readiness
 * 
 * Detection Strategy:
 * 1. Track ankle X positions over time
 * 2. Detect backward translation (both ankles move -X)
 * 3. Verify En Garde stance maintained during movement
 * 4. Confirm return to stable En Garde at end
 */
class RetreatDetector : ActionDetector {
    
    override val targetAction = SaberAction.RETREAT
    
    private var isRetreating = false
    private var retreatStartTime = 0L
    private var startPosition = 0f  // Initial front ankle X
    
    companion object {
        // Minimum distance traveled (normalized, negative = backward)
        private const val MIN_RETREAT_DISTANCE = 0.05f
        
        // Maximum time for a retreat (ms)
        private const val MAX_RETREAT_DURATION = 800L
        
        // Velocity threshold to detect movement start (negative = backward)
        private const val MOVEMENT_VELOCITY_THRESHOLD = 0.02f
        
        // Knee angle range during retreat (should maintain En Garde)
        private const val KNEE_MIN = 80f
        private const val KNEE_MAX = 140f
    }
    
    override fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult {
        if (history.size < 5) return ActionResult.None
        
        val currentLandmarks = current.landmarks
        if (currentLandmarks.size < 33) return ActionResult.None
        
        // Extract key points
        val leftAnkle = currentLandmarks[MediaPipeLandmarks.LEFT_ANKLE]
        val rightAnkle = currentLandmarks[MediaPipeLandmarks.RIGHT_ANKLE]
        val leftHip = currentLandmarks[MediaPipeLandmarks.LEFT_HIP]
        val rightHip = currentLandmarks[MediaPipeLandmarks.RIGHT_HIP]
        val leftKnee = currentLandmarks[MediaPipeLandmarks.LEFT_KNEE]
        val rightKnee = currentLandmarks[MediaPipeLandmarks.RIGHT_KNEE]
        
        // Determine front/back based on ankle position
        val isLeftFront = leftAnkle.x > rightAnkle.x
        val frontAnkle = if (isLeftFront) leftAnkle else rightAnkle
        
        // Calculate hip midpoint (center of mass proxy)
        val hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        
        // Get previous hip midpoint for velocity
        val prevFrame = history.lastOrNull() ?: return ActionResult.None
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevLeftHip = prevLandmarks[MediaPipeLandmarks.LEFT_HIP]
        val prevRightHip = prevLandmarks[MediaPipeLandmarks.RIGHT_HIP]
        val prevHipMidpoint = GeometryUtils.midpoint(prevLeftHip, prevRightHip)
        
        // Calculate backward velocity (negative X = backward in mirror view)
        val deltaTime = current.timeDeltaMs(prevFrame)
        val backwardVelocity = if (deltaTime > 0) {
            (prevHipMidpoint.x - hipMidpoint.x) / deltaTime * 1000f  // Positive when moving back
        } else 0f
        
        // Calculate knee angles
        val leftKneeAngle = GeometryUtils.angleBetweenPoints(
            leftHip, leftKnee, currentLandmarks[MediaPipeLandmarks.LEFT_ANKLE]
        )
        val rightKneeAngle = GeometryUtils.angleBetweenPoints(
            rightHip, rightKnee, currentLandmarks[MediaPipeLandmarks.RIGHT_ANKLE]
        )
        val frontKneeAngle = if (isLeftFront) leftKneeAngle else rightKneeAngle
        
        // State machine
        return if (!isRetreating) {
            // Check for retreat initiation (moving backward)
            if (backwardVelocity > MOVEMENT_VELOCITY_THRESHOLD && 
                frontKneeAngle in KNEE_MIN..KNEE_MAX) {
                // Start tracking retreat
                isRetreating = true
                retreatStartTime = current.timestampMs
                startPosition = frontAnkle.x
                
                ActionResult.InProgress(
                    action = SaberAction.RETREAT,
                    confidence = 0.5f
                )
            } else {
                ActionResult.None
            }
        } else {
            // Retreat in progress - check completion or failure
            val elapsed = current.timestampMs - retreatStartTime
            val distanceTraveled = startPosition - frontAnkle.x  // Positive when moving back
            
            // Check timeout
            if (elapsed > MAX_RETREAT_DURATION) {
                reset()
                return ActionResult.None
            }
            
            // Check if movement has stopped (velocity near zero) and distance met
            if (kotlin.math.abs(backwardVelocity) < MOVEMENT_VELOCITY_THRESHOLD * 0.5f &&
                distanceTraveled > MIN_RETREAT_DISTANCE) {
                
                // Evaluate quality
                val quality = evaluateQuality(frontKneeAngle, distanceTraveled, elapsed)
                val feedback = generateFeedback(frontKneeAngle)
                
                reset()
                
                ActionResult.Completed(
                    action = SaberAction.RETREAT,
                    quality = quality,
                    feedback = feedback,
                    durationMs = elapsed
                )
            } else if (distanceTraveled < -0.02f) {
                // Moving forward - abort (might be advance instead)
                reset()
                ActionResult.None
            } else {
                ActionResult.InProgress(
                    action = SaberAction.RETREAT,
                    confidence = (distanceTraveled / MIN_RETREAT_DISTANCE).coerceIn(0.5f, 0.9f)
                )
            }
        }
    }
    
    private fun evaluateQuality(kneeAngle: Float, distance: Float, durationMs: Long): ActionQuality {
        val kneeGood = kneeAngle in 90f..120f
        val distanceGood = distance > MIN_RETREAT_DISTANCE * 1.5f
        val speedGood = durationMs < 500L
        
        return when {
            kneeGood && distanceGood && speedGood -> ActionQuality.PERFECT
            kneeGood && (distanceGood || speedGood) -> ActionQuality.GOOD
            kneeGood || distanceGood -> ActionQuality.ACCEPTABLE
            else -> ActionQuality.POOR
        }
    }
    
    private fun generateFeedback(kneeAngle: Float): String? {
        return when {
            kneeAngle < 90f -> "Too low!"
            kneeAngle > 130f -> "Bend more!"
            else -> null
        }
    }
    
    override fun reset() {
        isRetreating = false
        retreatStartTime = 0L
        startPosition = 0f
    }
}
