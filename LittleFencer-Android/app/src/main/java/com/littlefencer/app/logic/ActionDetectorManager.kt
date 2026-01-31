package com.littlefencer.app.logic

import com.littlefencer.app.logic.detectors.*

/**
 * ActionDetectorManager - Orchestrates all action detectors.
 * 
 * Manages a pool of specialized detectors, processes each frame through
 * all relevant detectors, and returns the most confident action.
 * 
 * Priority handling:
 * - Completed actions take priority over in-progress
 * - Higher confidence in-progress actions take priority
 * - Conflicting detections resolved by action hierarchy
 */
class ActionDetectorManager {

    private val detectors: List<ActionDetector> = listOf(
        AdvanceDetector(),
        RetreatDetector(),
        LungeDetector(),          // NEW: Independent lunge detector
        AdvanceLungeDetector(),
        BalestraLungeDetector(),
        FlungeDetector(),
        ParryRiposteDetector()
    )

    // Pose history buffer
    private val poseHistory = mutableListOf<PoseFrame>()
    private val maxHistorySize = 30  // ~1 second at 30fps

    /**
     * Process a new frame through all detectors.
     * 
     * @param landmarks Current frame landmarks
     * @param timestampMs Frame timestamp
     * @return Best action result from all detectors
     */
    fun processFrame(landmarks: List<android.graphics.PointF>, timestampMs: Long): ActionResult {
        val currentFrame = PoseFrame(landmarks, timestampMs)
        
        // Add to history
        poseHistory.add(currentFrame)
        while (poseHistory.size > maxHistorySize) {
            poseHistory.removeAt(0)
        }
        
        // Need minimum history
        if (poseHistory.size < 5) {
            return ActionResult.None
        }
        
        // Run all detectors
        val results = detectors.map { detector ->
            detector.detect(currentFrame, poseHistory.dropLast(1))
        }
        
        // Find best result (Completed > InProgress > None)
        val completedResults = results.filterIsInstance<ActionResult.Completed>()
        if (completedResults.isNotEmpty()) {
            // Return highest quality completed action
            return completedResults.maxByOrNull { 
                when (it.quality) {
                    ActionQuality.PERFECT -> 4
                    ActionQuality.GOOD -> 3
                    ActionQuality.ACCEPTABLE -> 2
                    ActionQuality.POOR -> 1
                }
            } ?: completedResults.first()
        }
        
        val inProgressResults = results.filterIsInstance<ActionResult.InProgress>()
        if (inProgressResults.isNotEmpty()) {
            // Return highest confidence in-progress action
            return inProgressResults.maxByOrNull { it.confidence } ?: inProgressResults.first()
        }
        
        return ActionResult.None
    }

    /**
     * Get information about all currently in-progress actions.
     * Useful for UI to show multiple potential actions.
     */
    fun getInProgressActions(): List<ActionResult.InProgress> {
        val currentFrame = poseHistory.lastOrNull() ?: return emptyList()
        val history = poseHistory.dropLast(1)
        
        if (history.size < 5) return emptyList()
        
        return detectors.mapNotNull { detector ->
            val result = detector.detect(currentFrame, history)
            result as? ActionResult.InProgress
        }
    }

    /**
     * Reset all detectors (e.g., when user leaves frame).
     */
    fun reset() {
        detectors.forEach { it.reset() }
        poseHistory.clear()
    }

    /**
     * Get list of all supported actions.
     */
    fun getSupportedActions(): List<SaberAction> = detectors.map { it.targetAction }
}
