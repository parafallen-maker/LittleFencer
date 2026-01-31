package com.littlefencer.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PointF
import android.util.AttributeSet
import android.view.View
import com.littlefencer.app.utils.MediaPipeLandmarks
import kotlin.random.Random

/**
 * SkeletonOverlayView - Custom View for drawing skeleton overlay on camera preview.
 * Agent C (Artist) - Task C1 + C3 (Visual Effects)
 * 
 * This view draws a "stickman" skeleton based on pose landmark data.
 * Colors indicate posture quality: GREEN = good, RED = needs correction.
 * Includes particle effects for "Perfect" moves.
 */
class SkeletonOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // Current landmarks to draw (normalized 0.0-1.0 coordinates)
    private var landmarks: List<PointF> = emptyList()
    
    // Skeleton color state
    private var skeletonColor: Int = COLOR_GOOD
    
    // Particle system for effects
    private val particles = mutableListOf<Particle>()
    private var isAnimating = false

    // Paint configurations
    private val linePaint = Paint().apply {
        strokeWidth = LINE_WIDTH
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        isAntiAlias = true
    }

    private val pointPaint = Paint().apply {
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val particlePaint = Paint().apply {
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    // Glow effect paint
    private val glowPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = LINE_WIDTH * 2
        strokeCap = Paint.Cap.ROUND
        isAntiAlias = true
        alpha = 80
    }

    companion object {
        // Visual constants
        private const val LINE_WIDTH = 8f
        private const val POINT_RADIUS = 12f
        private const val GLOW_LINE_WIDTH = 16f
        
        // Colors (Neon style for visibility)
        const val COLOR_GOOD = 0xFF00FF00.toInt()      // Neon Green
        const val COLOR_BAD = 0xFFFF0000.toInt()       // Bright Red
        const val COLOR_NEUTRAL = 0xFFFFFFFF.toInt()   // White
        const val COLOR_PERFECT = 0xFF00FFFF.toInt()   // Cyan (Perfect move)

        // Particle colors
        private val SPARKLE_COLORS = intArrayOf(
            0xFFFFD700.toInt(), // Gold
            0xFFFF6B6B.toInt(), // Coral
            0xFF4ECDC4.toInt(), // Teal
            0xFFFFA07A.toInt(), // Light Salmon
            0xFF98D8C8.toInt()  // Seafoam
        )

        // Re-export landmark constants for backward compatibility
        const val LEFT_SHOULDER = MediaPipeLandmarks.LEFT_SHOULDER
        const val RIGHT_SHOULDER = MediaPipeLandmarks.RIGHT_SHOULDER
        const val LEFT_ELBOW = MediaPipeLandmarks.LEFT_ELBOW
        const val RIGHT_ELBOW = MediaPipeLandmarks.RIGHT_ELBOW
        const val LEFT_WRIST = MediaPipeLandmarks.LEFT_WRIST
        const val RIGHT_WRIST = MediaPipeLandmarks.RIGHT_WRIST
        const val LEFT_HIP = MediaPipeLandmarks.LEFT_HIP
        const val RIGHT_HIP = MediaPipeLandmarks.RIGHT_HIP
        const val LEFT_KNEE = MediaPipeLandmarks.LEFT_KNEE
        const val RIGHT_KNEE = MediaPipeLandmarks.RIGHT_KNEE
        const val LEFT_ANKLE = MediaPipeLandmarks.LEFT_ANKLE
        const val RIGHT_ANKLE = MediaPipeLandmarks.RIGHT_ANKLE
    }

    /**
     * Update the skeleton with new landmark data.
     */
    fun updateSkeleton(newLandmarks: List<PointF>, color: Int = COLOR_GOOD) {
        landmarks = newLandmarks
        skeletonColor = color
        invalidate()
    }

    /**
     * Clear the skeleton from view.
     */
    fun clearSkeleton() {
        landmarks = emptyList()
        invalidate()
    }

    /**
     * Trigger sparkle particle effect at a specific point.
     * Call this when a "Perfect" move is detected.
     */
    fun triggerSparkles(centerX: Float, centerY: Float, count: Int = 20) {
        repeat(count) {
            particles.add(Particle(
                x = centerX,
                y = centerY,
                vx = Random.nextFloat() * 10f - 5f,
                vy = Random.nextFloat() * -12f - 2f,
                color = SPARKLE_COLORS.random(),
                life = 1.0f,
                size = Random.nextFloat() * 8f + 4f
            ))
        }
        
        if (!isAnimating) {
            isAnimating = true
            animateParticles()
        }
    }

    /**
     * Trigger sparkles at the center of the screen.
     */
    fun triggerCenterSparkles() {
        triggerSparkles(width / 2f, height / 2f, 30)
    }

    private fun animateParticles() {
        if (particles.isEmpty()) {
            isAnimating = false
            return
        }

        // Update particle physics
        val iterator = particles.iterator()
        while (iterator.hasNext()) {
            val p = iterator.next()
            p.x += p.vx
            p.y += p.vy
            p.vy += 0.3f  // Gravity
            p.life -= 0.02f
            
            if (p.life <= 0) {
                iterator.remove()
            }
        }

        invalidate()
        
        // Schedule next frame
        postDelayed({ animateParticles() }, 16) // ~60fps
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        // Draw particles first (behind skeleton)
        for (p in particles) {
            particlePaint.color = p.color
            particlePaint.alpha = (p.life * 255).toInt()
            canvas.drawCircle(p.x, p.y, p.size * p.life, particlePaint)
        }

        if (landmarks.isEmpty() || landmarks.size < 33) {
            return
        }

        // Set colors
        linePaint.color = skeletonColor
        pointPaint.color = skeletonColor
        glowPaint.color = skeletonColor

        // Convert normalized coordinates to screen coordinates
        val screenLandmarks = landmarks.map { point ->
            PointF(point.x * width, point.y * height)
        }

        // Draw glow effect (behind main lines)
        if (skeletonColor == COLOR_PERFECT) {
            for ((startIdx, endIdx) in MediaPipeLandmarks.POSE_CONNECTIONS) {
                if (startIdx < screenLandmarks.size && endIdx < screenLandmarks.size) {
                    val start = screenLandmarks[startIdx]
                    val end = screenLandmarks[endIdx]
                    canvas.drawLine(start.x, start.y, end.x, end.y, glowPaint)
                }
            }
        }

        // Draw connections (lines)
        for ((startIdx, endIdx) in MediaPipeLandmarks.POSE_CONNECTIONS) {
            if (startIdx < screenLandmarks.size && endIdx < screenLandmarks.size) {
                val start = screenLandmarks[startIdx]
                val end = screenLandmarks[endIdx]
                canvas.drawLine(start.x, start.y, end.x, end.y, linePaint)
            }
        }

        // Draw key joint points
        for (idx in MediaPipeLandmarks.KEY_JOINTS) {
            if (idx < screenLandmarks.size) {
                val point = screenLandmarks[idx]
                canvas.drawCircle(point.x, point.y, POINT_RADIUS, pointPaint)
            }
        }
    }

    /**
     * Particle data class for sparkle effects.
     */
    private data class Particle(
        var x: Float,
        var y: Float,
        var vx: Float,
        var vy: Float,
        val color: Int,
        var life: Float,
        val size: Float
    )
}
