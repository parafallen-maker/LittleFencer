package com.littlefencer.app.logic

import android.graphics.PointF

/**
 * PoseFrame - A single snapshot of pose landmarks with timing.
 * Used for temporal analysis across frames.
 */
data class PoseFrame(
    val landmarks: List<PointF>,
    val timestampMs: Long
) {
    /**
     * Get a specific landmark point.
     */
    fun getLandmark(index: Int): PointF? = landmarks.getOrNull(index)
    
    /**
     * Calculate time delta from another frame.
     */
    fun timeDeltaMs(other: PoseFrame): Long = timestampMs - other.timestampMs
}

/**
 * ActionResult - Result from an action detector.
 */
sealed class ActionResult {
    /** No action detected */
    object None : ActionResult()
    
    /** Action is in progress */
    data class InProgress(
        val action: SaberAction,
        val confidence: Float,
        val feedback: String? = null
    ) : ActionResult()
    
    /** Action completed */
    data class Completed(
        val action: SaberAction,
        val quality: ActionQuality,
        val feedback: String? = null,
        val durationMs: Long = 0
    ) : ActionResult()
}

/**
 * All saber fencing actions.
 */
enum class SaberAction {
    // Stance
    EN_GARDE,
    
    // Footwork
    ADVANCE,        // 前进步
    RETREAT,        // 后退步
    ADVANCE_LUNGE,  // 前进弓步
    
    // Attacks
    LUNGE,          // 弓步
    LUNGING,        // 弓步进行中 (in progress)
    FLUNGE,         // 飞弓步 (saber-specific, replaces fleche)
    BALESTRA_LUNGE, // 跳步弓步
    
    // Defense
    PARRY,          // 格挡
    RIPOSTE,        // 反攻
    
    // Recovery
    RECOVERY        // 回收
}

/**
 * Quality rating for completed actions.
 */
enum class ActionQuality {
    PERFECT,    // All form criteria met
    GOOD,       // Minor imperfections
    ACCEPTABLE, // Needs improvement
    POOR        // Significant errors
}

/**
 * Interface for action-specific detectors.
 */
interface ActionDetector {
    /**
     * The action this detector handles.
     */
    val targetAction: SaberAction
    
    /**
     * Analyze pose history to detect the action.
     * 
     * @param current Current frame landmarks
     * @param history Recent pose history (oldest first)
     * @return Detection result
     */
    fun detect(current: PoseFrame, history: List<PoseFrame>): ActionResult
    
    /**
     * Reset detector state.
     */
    fun reset()
}
