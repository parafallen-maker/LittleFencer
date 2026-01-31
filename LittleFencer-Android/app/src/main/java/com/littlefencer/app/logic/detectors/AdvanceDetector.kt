package com.littlefencer.app.logic

import android.graphics.PointF
import com.littlefencer.app.utils.GeometryUtils
import com.littlefencer.app.utils.MediaPipeLandmarks

/**
 * AdvanceDetector - Detects the Advance (前进步) footwork.
 * 
 * Biomechanics:
 * - Front foot lifts heel-first, moves forward, lands heel-first
 * - Back foot pushes off, then lands
 * - Fencer returns to En Garde stance
 * - Movement accelerates (slow start, quick finish)
 * 
 * Detection Strategy:
 * 1. Track ankle X positions over time
 * 2. Detect forward translation (both ankles move +X)
 * 3. Verify En Garde stance maintained during movement
 * 4. Confirm return to stable En Garde at end
 */
class AdvanceDetector : ActionDetector {
    
    override val targetAction = SaberAction.ADVANCE
    
    private var isAdvancing = false
    private var advanceStartTime = 0L
    private var startPosition = 0f  // Initial front ankle X
    
    companion object {
        // Minimum distance traveled (normalized)
        private const val MIN_ADVANCE_DISTANCE = 0.05f
        
        // Maximum time for an advance (ms)
        private const val MAX_ADVANCE_DURATION = 800L
        
        // Velocity threshold to detect movement start
        private const val MOVEMENT_VELOCITY_THRESHOLD = 0.02f
        
        // Knee angle range during advance (should maintain En Garde)
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
        val backAnkle = if (isLeftFront) rightAnkle else leftAnkle
        
        // Calculate hip midpoint (center of mass proxy)
        val hipMidpoint = GeometryUtils.midpoint(leftHip, rightHip)
        
        // Get previous hip midpoint for velocity
        val prevFrame = history.lastOrNull() ?: return ActionResult.None
        val prevLandmarks = prevFrame.landmarks
        if (prevLandmarks.size < 33) return ActionResult.None
        
        val prevLeftHip = prevLandmarks[MediaPipeLandmarks.LEFT_HIP]
        val prevRightHip = prevLandmarks[MediaPipeLandmarks.RIGHT_HIP]
        val prevHipMidpoint = GeometryUtils.midpoint(prevLeftHip, prevRightHip)
        
        // Calculate forward velocity (positive X = forward in mirror view)
        val deltaTime = current.timeDeltaMs(prevFrame)
        val forwardVelocity = if (deltaTime > 0) {
            (hipMidpoint.x - prevHipMidpoint.x) / deltaTime * 1000f
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
        return if (!isAdvancing) {
            // Check for advance initiation
            if (forwardVelocity > MOVEMENT_VELOCITY_THRESHOLD && 
                frontKneeAngle in KNEE_MIN..KNEE_MAX) {
                // Start tracking advance
                isAdvancing = true
                advanceStartTime = current.timestampMs
                startPosition = frontAnkle.x
                
                ActionResult.InProgress(
                    action = SaberAction.ADVANCE,
                    confidence = 0.5f
                )
            } else {
                ActionResult.None
            }
        } else {
            // Advance in progress - check completion or failure
            val elapsed = current.timestampMs - advanceStartTime
            val distanceTraveled = frontAnkle.x - startPosition
            
            // Check timeout
            if (elapsed > MAX_ADVANCE_DURATION) {
                reset()
                return ActionResult.None
            }
            
            // Check if movement has stopped (velocity near zero) and distance met
            if (kotlin.math.abs(forwardVelocity) < MOVEMENT_VELOCITY_THRESHOLD * 0.5f &&
                distanceTraveled > MIN_ADVANCE_DISTANCE) {
                
                // Evaluate quality
                val quality = evaluateQuality(frontKneeAngle, distanceTraveled, elapsed)
                val feedback = generateFeedback(frontKneeAngle)
                
                reset()
                
                ActionResult.Completed(
                    action = SaberAction.ADVANCE,
                    quality = quality,
                    feedback = feedback,
                    durationMs = elapsed
                )
            } else if (distanceTraveled < -0.02f) {
                // Moving backward - abort
                reset()
                ActionResult.None
            } else {
                ActionResult.InProgress(
                    action = SaberAction.ADVANCE,
                    confidence = (distanceTraveled / MIN_ADVANCE_DISTANCE).coerceIn(0.5f, 0.9f)
                )
            }
        }
    }
    
    private fun evaluateQuality(kneeAngle: Float, distance: Float, durationMs: Long): ActionQuality {
        val kneeGood = kneeAngle in 90f..120f
        val distanceGood = distance > MIN_ADVANCE_DISTANCE * 1.5f
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
        isAdvancing = false
        advanceStartTime = 0L
        startPosition = 0f
    }
}
