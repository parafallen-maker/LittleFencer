/**
 * Geometry Utilities
 * Math functions for pose analysis
 */

/**
 * Calculate angle between three points (in degrees)
 * @param {Object} a First point {x, y}
 * @param {Object} b Middle point (vertex)
 * @param {Object} c Third point
 * @returns {number} Angle in degrees
 */
export function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    
    if (angle > 180.0) {
        angle = 360.0 - angle;
    }
    
    return angle;
}

/**
 * Calculate distance between two points
 * @param {Object} a First point {x, y}
 * @param {Object} b Second point {x, y}
 * @returns {number} Distance
 */
export function calculateDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate 3D distance
 * @param {Object} a First point {x, y, z}
 * @param {Object} b Second point {x, y, z}
 * @returns {number} 3D Distance
 */
export function calculateDistance3D(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = (b.z || 0) - (a.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate midpoint between two points
 * @param {Object} a First point {x, y}
 * @param {Object} b Second point {x, y}
 * @returns {Object} Midpoint {x, y}
 */
export function midpoint(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: ((a.z || 0) + (b.z || 0)) / 2
    };
}

/**
 * Calculate vertical angle of a line segment from horizontal
 * @param {Object} a Start point {x, y}
 * @param {Object} b End point {x, y}
 * @returns {number} Angle in degrees from horizontal
 */
export function verticalAngle(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.atan2(dy, dx) * 180.0 / Math.PI;
}

/**
 * Check if point is in front (for determining front/back leg)
 * @param {Object} point Point to check {x}
 * @param {Object} reference Reference point {x}
 * @param {boolean} facingRight Whether person is facing right
 * @returns {boolean} True if point is in front
 */
export function isInFront(point, reference, facingRight) {
    if (facingRight) {
        return point.x > reference.x;
    } else {
        return point.x < reference.x;
    }
}

/**
 * Determine facing direction based on shoulder positions
 * @param {Object} leftShoulder Left shoulder landmark
 * @param {Object} rightShoulder Right shoulder landmark
 * @returns {boolean} True if facing right
 */
export function isFacingRight(leftShoulder, rightShoulder) {
    return leftShoulder.x > rightShoulder.x;
}

/**
 * Smooth a value using exponential moving average
 * @param {number} current Current value
 * @param {number} previous Previous smoothed value
 * @param {number} alpha Smoothing factor (0-1, lower = more smooth)
 * @returns {number} Smoothed value
 */
export function smoothValue(current, previous, alpha = 0.3) {
    if (previous === null || previous === undefined) {
        return current;
    }
    return alpha * current + (1 - alpha) * previous;
}

/**
 * Clamp a value between min and max
 * @param {number} value Value to clamp
 * @param {number} min Minimum value
 * @param {number} max Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 * @param {number} a Start value
 * @param {number} b End value
 * @param {number} t Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Calculate velocity between two frames
 * @param {Object} current Current position {x, y}
 * @param {Object} previous Previous position {x, y}
 * @param {number} deltaTime Time between frames in ms
 * @returns {Object} Velocity {x, y, magnitude}
 */
export function calculateVelocity(current, previous, deltaTime) {
    if (!previous || deltaTime <= 0) {
        return { x: 0, y: 0, magnitude: 0 };
    }
    
    const vx = (current.x - previous.x) / deltaTime * 1000;
    const vy = (current.y - previous.y) / deltaTime * 1000;
    
    return {
        x: vx,
        y: vy,
        magnitude: Math.sqrt(vx * vx + vy * vy)
    };
}
