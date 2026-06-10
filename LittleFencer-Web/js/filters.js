/**
 * Signal Processing Utilities
 * Low-pass filtering, Kalman filtering, and velocity calculation
 */

/**
 * Exponential Moving Average Low-Pass Filter
 * Reduces high-frequency noise from pose estimation
 */
export class LowPassFilter {
    constructor(alpha = 0.3) {
        this.alpha = alpha;  // Smoothing factor (0-1, lower = smoother)
        this.prevValue = null;
    }

    filter(value) {
        if (this.prevValue === null) {
            this.prevValue = value;
            return value;
        }
        const filtered = this.alpha * value + (1 - this.alpha) * this.prevValue;
        this.prevValue = filtered;
        return filtered;
    }

    reset() {
        this.prevValue = null;
    }
}

/**
 * Multi-dimensional Low-Pass Filter for landmarks
 */
export class LandmarkFilter {
    constructor(numLandmarks = 33, alpha = 0.4) {
        this.filters = [];
        for (let i = 0; i < numLandmarks; i++) {
            this.filters.push({
                x: new LowPassFilter(alpha),
                y: new LowPassFilter(alpha),
                z: new LowPassFilter(alpha)
            });
        }
    }

    filter(landmarks) {
        return landmarks.map((lm, i) => ({
            x: this.filters[i].x.filter(lm.x),
            y: this.filters[i].y.filter(lm.y),
            z: lm.z !== undefined ? this.filters[i].z.filter(lm.z) : 0,
            visibility: lm.visibility
        }));
    }

    reset() {
        this.filters.forEach(f => {
            f.x.reset();
            f.y.reset();
            f.z.reset();
        });
    }
}

/**
 * Simple 1D Kalman Filter
 * Better noise rejection than low-pass for tracking position/velocity
 */
export class KalmanFilter {
    constructor(processNoise = 0.1, measurementNoise = 0.5) {
        this.q = processNoise;      // Process noise covariance
        this.r = measurementNoise;  // Measurement noise covariance
        this.x = 0;                 // State estimate
        this.p = 1;                 // Estimation error covariance
        this.initialized = false;
    }

    update(measurement) {
        if (!this.initialized) {
            this.x = measurement;
            this.initialized = true;
            return measurement;
        }

        // Prediction step
        this.p += this.q;

        // Update step
        const k = this.p / (this.p + this.r);  // Kalman gain
        this.x += k * (measurement - this.x);
        this.p *= (1 - k);

        return this.x;
    }

    reset() {
        this.x = 0;
        this.p = 1;
        this.initialized = false;
    }
}

/**
 * Velocity Calculator with smoothing
 */
export class VelocityTracker {
    constructor(windowSize = 5) {
        this.windowSize = windowSize;
        this.positions = [];
        this.timestamps = [];
    }

    update(position, timestamp) {
        this.positions.push(position);
        this.timestamps.push(timestamp);

        if (this.positions.length > this.windowSize) {
            this.positions.shift();
            this.timestamps.shift();
        }
    }

    getVelocity() {
        if (this.positions.length < 2) return 0;

        const n = this.positions.length;
        const dt = (this.timestamps[n - 1] - this.timestamps[0]) / 1000; // seconds

        if (dt === 0) return 0;

        // Use linear regression for smoother velocity estimate
        const dx = this.positions[n - 1] - this.positions[0];
        return dx / dt;
    }

    getAcceleration() {
        if (this.positions.length < 3) return 0;

        const n = this.positions.length;
        const mid = Math.floor(n / 2);

        const dt1 = (this.timestamps[mid] - this.timestamps[0]) / 1000;
        const dt2 = (this.timestamps[n - 1] - this.timestamps[mid]) / 1000;

        if (dt1 === 0 || dt2 === 0) return 0;

        const v1 = (this.positions[mid] - this.positions[0]) / dt1;
        const v2 = (this.positions[n - 1] - this.positions[mid]) / dt2;

        const totalDt = (this.timestamps[n - 1] - this.timestamps[0]) / 1000;
        return (v2 - v1) / totalDt;
    }

    reset() {
        this.positions = [];
        this.timestamps = [];
    }
}

/**
 * Joint Velocity Tracker
 * Tracks velocity for multiple joints
 */
export class JointVelocityTracker {
    constructor(jointIndices, windowSize = 5) {
        this.trackers = {};
        jointIndices.forEach(idx => {
            this.trackers[idx] = {
                x: new VelocityTracker(windowSize),
                y: new VelocityTracker(windowSize)
            };
        });
    }

    update(landmarks, timestamp) {
        for (const [idx, tracker] of Object.entries(this.trackers)) {
            const lm = landmarks[idx];
            if (lm) {
                tracker.x.update(lm.x, timestamp);
                tracker.y.update(lm.y, timestamp);
            }
        }
    }

    getVelocity(jointIdx) {
        const tracker = this.trackers[jointIdx];
        if (!tracker) return { x: 0, y: 0, magnitude: 0 };

        const vx = tracker.x.getVelocity();
        const vy = tracker.y.getVelocity();

        return {
            x: vx,
            y: vy,
            magnitude: Math.sqrt(vx * vx + vy * vy)
        };
    }

    getAcceleration(jointIdx) {
        const tracker = this.trackers[jointIdx];
        if (!tracker) return { x: 0, y: 0, magnitude: 0 };

        const ax = tracker.x.getAcceleration();
        const ay = tracker.y.getAcceleration();

        return {
            x: ax,
            y: ay,
            magnitude: Math.sqrt(ax * ax + ay * ay)
        };
    }

    reset() {
        for (const tracker of Object.values(this.trackers)) {
            tracker.x.reset();
            tracker.y.reset();
        }
    }
}

/**
 * Confidence-Weighted Filter [P0]
 * Adapts smoothing based on landmark visibility/confidence
 * Low confidence = more smoothing (trust history)
 * High confidence = less smoothing (trust measurement)
 */
export class ConfidenceWeightedFilter {
    constructor(numLandmarks = 33, baseAlpha = 0.4, minAlpha = 0.1) {
        this.baseAlpha = baseAlpha;  // Base smoothing factor
        this.minAlpha = minAlpha;    // Minimum alpha (for low confidence)
        this.prevLandmarks = null;
    }

    filter(landmarks) {
        if (!this.prevLandmarks) {
            this.prevLandmarks = landmarks.map(lm => ({ ...lm }));
            return landmarks;
        }

        const result = landmarks.map((lm, i) => {
            const prev = this.prevLandmarks[i];

            // Calculate dynamic alpha based on confidence
            // Higher visibility = higher alpha (trust current more)
            const conf = lm.visibility !== undefined ? lm.visibility : 0.5;
            const alpha = this.minAlpha + (this.baseAlpha - this.minAlpha) * conf;

            const filtered = {
                x: alpha * lm.x + (1 - alpha) * prev.x,
                y: alpha * lm.y + (1 - alpha) * prev.y,
                z: alpha * (lm.z || 0) + (1 - alpha) * (prev.z || 0),
                visibility: lm.visibility
            };

            this.prevLandmarks[i] = filtered;
            return filtered;
        });

        return result;
    }

    reset() {
        this.prevLandmarks = null;
    }
}

/**
 * Outlier Rejector [P0]
 * Detects and rejects physically impossible landmark jumps
 * Falls back to previous position for rejected points
 */
export class OutlierRejector {
    constructor(maxJumpRatio = 0.15, minConfidenceForJump = 0.8) {
        this.maxJumpRatio = maxJumpRatio;  // Max jump as ratio of body size
        this.minConfidenceForJump = minConfidenceForJump;  // Allow jumps if confidence is high
        this.prevLandmarks = null;
        this.lastRejected = [];
    }

    process(landmarks) {
        if (!this.prevLandmarks) {
            this.prevLandmarks = landmarks.map(lm => ({ ...lm }));
            this.lastRejected = [];
            return { landmarks, rejected: [] };
        }

        // Calculate body scale from shoulder width
        const shoulderDist = this._dist(landmarks[11], landmarks[12]);
        const maxJump = Math.max(shoulderDist * this.maxJumpRatio, 0.02);

        const rejected = [];
        const result = landmarks.map((lm, i) => {
            const prev = this.prevLandmarks[i];
            const jump = this._dist(lm, prev);

            // Reject if: jump is too large AND confidence is not high
            if (jump > maxJump && (lm.visibility || 0) < this.minConfidenceForJump) {
                rejected.push(i);
                // Return previous value
                return { ...prev, visibility: lm.visibility };
            }

            return lm;
        });

        this.prevLandmarks = result.map(lm => ({ ...lm }));
        this.lastRejected = rejected;

        return { landmarks: result, rejected };
    }

    _dist(a, b) {
        if (!a || !b) return 0;
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    getLastRejected() {
        return this.lastRejected;
    }

    reset() {
        this.prevLandmarks = null;
        this.lastRejected = [];
    }
}

/**
 * One Euro Filter [P1]
 * Adaptive low-pass filter that reduces lag for fast movements
 * - Slow movement = more smoothing (stable)
 * - Fast movement = less smoothing (responsive)
 */
export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.minCutoff = minCutoff;  // Minimum cutoff frequency
        this.beta = beta;            // Speed coefficient
        this.dCutoff = dCutoff;      // Derivative cutoff frequency
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }

    _alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    filter(value, timestamp) {
        if (this.xPrev === null) {
            this.xPrev = value;
            this.tPrev = timestamp;
            return value;
        }

        const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001);  // seconds
        this.tPrev = timestamp;

        // Compute derivative
        const dx = (value - this.xPrev) / dt;

        // Filter derivative
        const alphaDx = this._alpha(this.dCutoff, dt);
        const dxFiltered = alphaDx * dx + (1 - alphaDx) * this.dxPrev;
        this.dxPrev = dxFiltered;

        // Compute adaptive cutoff
        const cutoff = this.minCutoff + this.beta * Math.abs(dxFiltered);

        // Filter value
        const alpha = this._alpha(cutoff, dt);
        const filtered = alpha * value + (1 - alpha) * this.xPrev;
        this.xPrev = filtered;

        return filtered;
    }

    reset() {
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }
}

/**
 * One Euro Landmark Filter [P1]
 * Applies One Euro Filter to all landmarks
 */
export class OneEuroLandmarkFilter {
    constructor(numLandmarks = 33, minCutoff = 1.0, beta = 0.007) {
        this.filters = [];
        for (let i = 0; i < numLandmarks; i++) {
            this.filters.push({
                x: new OneEuroFilter(minCutoff, beta),
                y: new OneEuroFilter(minCutoff, beta),
                z: new OneEuroFilter(minCutoff, beta)
            });
        }
    }

    filter(landmarks, timestamp) {
        return landmarks.map((lm, i) => ({
            x: this.filters[i].x.filter(lm.x, timestamp),
            y: this.filters[i].y.filter(lm.y, timestamp),
            z: lm.z !== undefined ? this.filters[i].z.filter(lm.z, timestamp) : 0,
            visibility: lm.visibility
        }));
    }

    reset() {
        this.filters.forEach(f => {
            f.x.reset();
            f.y.reset();
            f.z.reset();
        });
    }
}

