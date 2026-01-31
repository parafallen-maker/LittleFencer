package com.littlefencer.app.utils

import android.graphics.PointF
import kotlin.math.atan2
import kotlin.math.hypot

/**
 * GeometryUtils - Utility functions for pose analysis in fencing movements.
 * 
 * Used by FencingStateEngine to detect:
 * - Knee bend angles (En Garde stance)
 * - Arm extension (Lunge detection)
 * - Movement velocity (Attack speed)
 */
object GeometryUtils {

    /**
     * Calculate the angle at point p2 formed by the line segments p1-p2 and p2-p3.
     * 
     * Example usage:
     * - Knee angle: angleBetweenPoints(hip, knee, ankle)
     * - Elbow angle: angleBetweenPoints(shoulder, elbow, wrist)
     * 
     * @param p1 First point (e.g., hip)
     * @param p2 Vertex point where angle is measured (e.g., knee)
     * @param p3 Third point (e.g., ankle)
     * @return Angle in degrees (0-180). Returns 180 for a straight line.
     */
    fun angleBetweenPoints(p1: PointF, p2: PointF, p3: PointF): Float {
        // Vector from p2 to p1
        val v1x = p1.x - p2.x
        val v1y = p1.y - p2.y
        
        // Vector from p2 to p3
        val v2x = p3.x - p2.x
        val v2y = p3.y - p2.y
        
        // Calculate angles using atan2
        val angle1 = atan2(v1y.toDouble(), v1x.toDouble())
        val angle2 = atan2(v2y.toDouble(), v2x.toDouble())
        
        // Difference in radians, convert to degrees
        var angleDiff = Math.toDegrees(angle1 - angle2).toFloat()
        
        // Normalize to 0-180 range
        angleDiff = Math.abs(angleDiff)
        if (angleDiff > 180f) {
            angleDiff = 360f - angleDiff
        }
        
        return angleDiff
    }

    /**
     * Calculate Euclidean distance between two points.
     * 
     * Example usage:
     * - Wrist-to-hip distance (arm extension check)
     * - Foot spacing (stance width)
     * 
     * @param p1 First point
     * @param p2 Second point
     * @return Distance in the same units as input coordinates (typically pixels or normalized 0-1)
     */
    fun distance(p1: PointF, p2: PointF): Float {
        return hypot((p2.x - p1.x).toDouble(), (p2.y - p1.y).toDouble()).toFloat()
    }

    /**
     * Calculate velocity of movement between two positions.
     * 
     * Example usage:
     * - Detect fast arm extension (lunge attack)
     * - Detect recovery speed
     * 
     * @param prevPos Previous position
     * @param currPos Current position
     * @param deltaTimeMs Time elapsed in milliseconds (must be > 0)
     * @return Velocity in units per second. Returns 0 if deltaTimeMs <= 0.
     */
    fun velocity(prevPos: PointF, currPos: PointF, deltaTimeMs: Long): Float {
        if (deltaTimeMs <= 0) return 0f
        
        val dist = distance(prevPos, currPos)
        // Convert ms to seconds: dist / (deltaTimeMs / 1000) = dist * 1000 / deltaTimeMs
        return (dist * 1000f) / deltaTimeMs
    }

    /**
     * Check if a point is within a bounding box defined by min/max coordinates.
     * Useful for checking if a landmark is in a specific screen region.
     * 
     * @param point The point to check
     * @param minX Minimum X coordinate
     * @param minY Minimum Y coordinate
     * @param maxX Maximum X coordinate
     * @param maxY Maximum Y coordinate
     * @return True if point is within bounds (inclusive)
     */
    fun isPointInBounds(point: PointF, minX: Float, minY: Float, maxX: Float, maxY: Float): Boolean {
        return point.x in minX..maxX && point.y in minY..maxY
    }

    /**
     * Calculate the midpoint between two points.
     * Useful for finding body center (midpoint of hips).
     * 
     * @param p1 First point
     * @param p2 Second point
     * @return Midpoint as PointF
     */
    fun midpoint(p1: PointF, p2: PointF): PointF {
        return PointF((p1.x + p2.x) / 2f, (p1.y + p2.y) / 2f)
    }

    /**
     * Normalize a value to 0-1 range given min and max bounds.
     * Useful for converting pixel coordinates to normalized coordinates.
     * 
     * @param value The value to normalize
     * @param min Minimum expected value
     * @param max Maximum expected value
     * @return Normalized value clamped to 0-1
     */
    fun normalize(value: Float, min: Float, max: Float): Float {
        if (max <= min) return 0f
        return ((value - min) / (max - min)).coerceIn(0f, 1f)
    }
}
