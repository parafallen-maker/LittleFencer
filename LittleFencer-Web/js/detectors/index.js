/**
 * Action Detector Manager
 * Manages all action detectors and coordinates detection
 * 
 * IMPORTANT: Detection uses hip center velocity, NOT simple ankle position difference!
 * This matches the Android implementation for consistent behavior.
 */

import { PoseLandmark } from '../pose.js';
import { calculateAngle, calculateDistance, midpoint, calculateVelocity } from '../utils.js';
import { DetectorConfig, DetectionGate } from '../config.js';

// Action types
export const SaberAction = {
    ADVANCE: 'advance',
    RETREAT: 'retreat',
    LUNGE: 'lunge',
    ADVANCE_LUNGE: 'advance_lunge',
    BALESTRA_LUNGE: 'balestra_lunge',
    FLUNGE: 'flunge',
    PARRY_RIPOSTE: 'parry_riposte'
};

// Action display names
export const ActionDisplayNames = {
    [SaberAction.ADVANCE]: '前进步',
    [SaberAction.RETREAT]: '后退步',
    [SaberAction.LUNGE]: '弓步',
    [SaberAction.ADVANCE_LUNGE]: '前进弓步',
    [SaberAction.BALESTRA_LUNGE]: '跳步弓步',
    [SaberAction.FLUNGE]: '飞弓步',
    [SaberAction.PARRY_RIPOSTE]: '格挡反攻'
};

// Quality levels
export const Quality = {
    PERFECT: 'PERFECT',
    GOOD: 'GOOD',
    ACCEPTABLE: 'ACCEPTABLE',
    POOR: 'POOR'
};

/**
 * Base Action Detector
 */
class BaseDetector {
    constructor() {
        this.phase = 'idle';
        this.phaseStartTime = 0;
        this.actionStartTime = 0;
        this.metrics = {};
    }

    /**
     * Detect action from frame
     * @param {Object} frame - Current pose frame with landmarks and timestamp
     * @param {Array} history - Previous frames
     * @param {Object} velocityTracker - Optional: Pre-computed velocity tracker from engine
     */
    detect(frame, history, velocityTracker = null) {
        return null;
    }

    reset() {
        this.phase = 'idle';
        this.phaseStartTime = 0;
        this.actionStartTime = 0;
        this.metrics = {};
    }

    getLandmark(landmarks, index) {
        return landmarks[index];
    }

    transitionTo(phase) {
        this.phase = phase;
        this.phaseStartTime = Date.now();
    }

    /**
     * Calculate hip center point (center of mass proxy)
     */
    getHipCenter(landmarks) {
        const leftHip = landmarks[PoseLandmark.LEFT_HIP];
        const rightHip = landmarks[PoseLandmark.RIGHT_HIP];
        return midpoint(leftHip, rightHip);
    }

    /**
     * Calculate front knee angle based on stance
     */
    getFrontKneeAngle(landmarks) {
        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];
        const isLeftFront = leftAnkle.x > rightAnkle.x;

        const frontHip = landmarks[isLeftFront ? PoseLandmark.LEFT_HIP : PoseLandmark.RIGHT_HIP];
        const frontKnee = landmarks[isLeftFront ? PoseLandmark.LEFT_KNEE : PoseLandmark.RIGHT_KNEE];
        const frontAnkle = landmarks[isLeftFront ? PoseLandmark.LEFT_ANKLE : PoseLandmark.RIGHT_ANKLE];

        return calculateAngle(frontHip, frontKnee, frontAnkle);
    }

    /**
     * Check if in valid En Garde position
     */
    isValidEnGarde(landmarks) {
        const kneeAngle = this.getFrontKneeAngle(landmarks);
        return kneeAngle >= 80 && kneeAngle <= 140;
    }
}

/**
 * Lunge Detector - 4-phase state machine with arm-first principle
 */
class LungeDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            ARM_EXTENDING: 'arm_extending',
            LUNGING: 'lunging',
            LANDING: 'landing'
        };

        this.thresholds = DetectorConfig.lunge;

        this.baselineArmExtension = null;
        this.peakArmExtension = 0;
        this.armExtendedFirst = false;
    }

    detect(frame, history) {
        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        // Calculate current metrics
        const metrics = this.calculateMetrics(landmarks);

        // State machine
        switch (this.phase) {
            case this.phases.IDLE:
                return this.handleIdle(metrics);

            case this.phases.ARM_EXTENDING:
                return this.handleArmExtending(metrics);

            case this.phases.LUNGING:
                return this.handleLunging(metrics);

            case this.phases.LANDING:
                return this.handleLanding(metrics);
        }

        return null;
    }

    calculateMetrics(landmarks) {
        // Determine facing direction
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;

        // Weapon arm (front arm when facing right = right arm)
        const weaponShoulder = landmarks[facingRight ? PoseLandmark.RIGHT_SHOULDER : PoseLandmark.LEFT_SHOULDER];
        const weaponElbow = landmarks[facingRight ? PoseLandmark.RIGHT_ELBOW : PoseLandmark.LEFT_ELBOW];
        const weaponWrist = landmarks[facingRight ? PoseLandmark.RIGHT_WRIST : PoseLandmark.LEFT_WRIST];

        // Calculate arm extension
        const shoulderToWrist = calculateDistance(weaponShoulder, weaponWrist);
        const shoulderToElbow = calculateDistance(weaponShoulder, weaponElbow);
        const elbowToWrist = calculateDistance(weaponElbow, weaponWrist);
        const maxArmLength = shoulderToElbow + elbowToWrist;
        const armExtension = maxArmLength > 0 ? shoulderToWrist / maxArmLength : 0;

        // Determine front/back leg
        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];
        const frontLegLeft = facingRight ? (leftAnkle.x > rightAnkle.x) : (leftAnkle.x < rightAnkle.x);

        // Calculate knee angles
        const frontHip = landmarks[frontLegLeft ? PoseLandmark.LEFT_HIP : PoseLandmark.RIGHT_HIP];
        const frontKnee = landmarks[frontLegLeft ? PoseLandmark.LEFT_KNEE : PoseLandmark.RIGHT_KNEE];
        const frontAnkle = landmarks[frontLegLeft ? PoseLandmark.LEFT_ANKLE : PoseLandmark.RIGHT_ANKLE];

        const backHip = landmarks[frontLegLeft ? PoseLandmark.RIGHT_HIP : PoseLandmark.LEFT_HIP];
        const backKnee = landmarks[frontLegLeft ? PoseLandmark.RIGHT_KNEE : PoseLandmark.LEFT_KNEE];
        const backAnkle = landmarks[frontLegLeft ? PoseLandmark.RIGHT_ANKLE : PoseLandmark.LEFT_ANKLE];

        const frontKneeAngle = calculateAngle(frontHip, frontKnee, frontAnkle);
        const backKneeAngle = calculateAngle(backHip, backKnee, backAnkle);

        // Calculate stance width
        const leftHip = landmarks[PoseLandmark.LEFT_HIP];
        const rightHip = landmarks[PoseLandmark.RIGHT_HIP];
        const hipWidth = calculateDistance(leftHip, rightHip);
        const ankleWidth = calculateDistance(leftAnkle, rightAnkle);
        const stanceWidth = hipWidth > 0 ? ankleWidth / hipWidth : 0;

        return {
            armExtension,
            frontKneeAngle,
            backKneeAngle,
            stanceWidth,
            facingRight
        };
    }

    handleIdle(metrics) {
        // Set baseline arm extension
        if (this.baselineArmExtension === null) {
            this.baselineArmExtension = metrics.armExtension;
        }

        // Check for arm extension starting
        const armDelta = metrics.armExtension - this.baselineArmExtension;

        if (armDelta >= this.thresholds.ARM_EXTENSION_START) {
            this.transitionTo(this.phases.ARM_EXTENDING);
            this.actionStartTime = Date.now();
            this.peakArmExtension = metrics.armExtension;
            this.armExtendedFirst = true;
        }

        return null;
    }

    handleArmExtending(metrics) {
        // Track peak arm extension
        this.peakArmExtension = Math.max(this.peakArmExtension, metrics.armExtension);

        // Check for full arm extension and lunge starting
        const armDelta = metrics.armExtension - (this.baselineArmExtension || 0);
        const isArmExtended = armDelta >= this.thresholds.ARM_EXTENSION_FULL;
        const isLunging = metrics.frontKneeAngle <= this.thresholds.FRONT_KNEE_LUNGE_MAX;

        if (isArmExtended && isLunging) {
            this.transitionTo(this.phases.LUNGING);
        }

        // Timeout - reset if taking too long
        if (Date.now() - this.actionStartTime > this.thresholds.MAX_LUNGE_DURATION) {
            this.reset();
        }

        return null;
    }

    handleLunging(metrics) {
        // Check for landing (back leg straight, wide stance)
        const isBackLegStraight = metrics.backKneeAngle >= this.thresholds.BACK_KNEE_MIN_STRAIGHT;
        const isWideStance = metrics.stanceWidth >= this.thresholds.STANCE_WIDTH_LUNGE;

        if (isBackLegStraight && isWideStance) {
            this.transitionTo(this.phases.LANDING);
            this.metrics = { ...metrics };
        }

        // Timeout
        if (Date.now() - this.actionStartTime > this.thresholds.MAX_LUNGE_DURATION) {
            this.reset();
        }

        return null;
    }

    handleLanding(metrics) {
        const duration = Date.now() - this.actionStartTime;

        if (duration >= this.thresholds.MIN_LUNGE_DURATION) {
            // Evaluate quality
            const quality = this.evaluateQuality(this.metrics);
            const feedback = this.generateFeedback(this.metrics, quality);

            // Reset for next detection
            this.reset();

            return {
                action: SaberAction.LUNGE,
                quality: quality,
                feedback: feedback,
                duration: duration
            };
        }

        return null;
    }

    evaluateQuality(metrics) {
        let score = 0;

        // Arm extended first (most important for saber)
        if (this.armExtendedFirst) score += 2;

        // Back leg straight
        if (metrics.backKneeAngle >= this.thresholds.BACK_KNEE_MIN_STRAIGHT) score += 1;

        // Good front knee bend
        if (metrics.frontKneeAngle >= 80 && metrics.frontKneeAngle <= 100) score += 1;

        // Wide stance
        if (metrics.stanceWidth >= this.thresholds.STANCE_WIDTH_LUNGE) score += 1;

        if (score >= 5) return Quality.PERFECT;
        if (score >= 4) return Quality.GOOD;
        if (score >= 2) return Quality.ACCEPTABLE;
        return Quality.POOR;
    }

    generateFeedback(metrics, quality) {
        if (quality === Quality.PERFECT) {
            return '完美弓步！';
        }

        const issues = [];

        if (!this.armExtendedFirst) {
            issues.push('手臂先动');
        }

        if (metrics.backKneeAngle < this.thresholds.BACK_KNEE_MIN_STRAIGHT) {
            issues.push('后腿伸直');
        }

        if (metrics.frontKneeAngle > 110) {
            issues.push('前膝再弯');
        }

        return issues.length > 0 ? issues.join('，') : '不错！';
    }

    reset() {
        super.reset();
        this.baselineArmExtension = null;
        this.peakArmExtension = 0;
        this.armExtendedFirst = false;
    }
}

/**
 * Advance Detector - Uses hip center velocity for reliable detection
 * 
 * Detection Strategy (matching Android):
 * 1. Track hip center position (center of mass proxy)
 * 2. Calculate forward velocity with time normalization
 * 3. Verify En Garde stance maintained (knee angle 80-140°)
 * 4. Confirm movement STOPPED and distance threshold met before reporting
 */
class AdvanceDetector extends BaseDetector {
    constructor() {
        super();
        this.isAdvancing = false;
        this.advanceStartTime = 0;
        this.startHipX = 0;
        this.peakVelocity = 0;
        this.stableFrames = 0;
        this.forwardDir = 1;

        this.cfg = DetectorConfig.advance;
    }

    detect(frame, history, velocityTracker = null) {
        if (history.length < 3) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        // Get current hip center
        const hipCenter = this.getHipCenter(landmarks);

        // "Forward" depends on which way the fencer faces. Lock the
        // direction at action start so a mid-action turn doesn't flip signs.
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const forwardDir = this.isAdvancing
            ? this.forwardDir
            : (leftShoulder.x > rightShoulder.x ? 1 : -1);

        // Use pre-filtered velocity from engine if available (more accurate)
        let forwardVelocity;
        if (velocityTracker) {
            // Use average of left and right hip velocities (already filtered)
            const leftHipVel = velocityTracker.getVelocity(PoseLandmark.LEFT_HIP);
            const rightHipVel = velocityTracker.getVelocity(PoseLandmark.RIGHT_HIP);
            forwardVelocity = ((leftHipVel.x + rightHipVel.x) / 2) * forwardDir;
        } else {
            // Fallback: calculate from raw frame data
            const prevFrame = history[history.length - 1];
            const prevLandmarks = prevFrame.landmarks;
            if (!prevLandmarks || prevLandmarks.length < 33) return null;
            const prevHipCenter = this.getHipCenter(prevLandmarks);
            const deltaTime = frame.timestamp - prevFrame.timestamp;
            forwardVelocity = deltaTime > 0
                ? (hipCenter.x - prevHipCenter.x) / deltaTime * 1000 * forwardDir
                : 0;
        }

        // Get knee angle for En Garde check
        const kneeAngle = this.getFrontKneeAngle(landmarks);
        const isEnGarde = kneeAngle >= this.cfg.KNEE_MIN && kneeAngle <= this.cfg.KNEE_MAX;

        if (!this.isAdvancing) {
            // Check for advance initiation: forward velocity + valid En Garde
            if (forwardVelocity > this.cfg.VELOCITY_START && isEnGarde) {
                this.isAdvancing = true;
                this.advanceStartTime = frame.timestamp;
                this.startHipX = hipCenter.x;
                this.peakVelocity = forwardVelocity;
                this.stableFrames = 0;
                this.forwardDir = forwardDir;
                return null;  // Don't report yet, wait for completion
            }
        } else {
            // Advance in progress - check completion
            const elapsed = frame.timestamp - this.advanceStartTime;
            const distanceTraveled = (hipCenter.x - this.startHipX) * forwardDir;

            // Track peak velocity
            this.peakVelocity = Math.max(this.peakVelocity, forwardVelocity);

            // Check timeout
            if (elapsed > this.cfg.MAX_DURATION) {
                this.reset();
                return null;
            }

            // Check if moving backward (abort - might be retreat)
            if (distanceTraveled < -0.02) {
                this.reset();
                return null;
            }

            // Check for movement stopped AND sufficient distance
            if (Math.abs(forwardVelocity) < this.cfg.VELOCITY_STOP) {
                this.stableFrames++;

                if (this.stableFrames >= this.cfg.STABLE_FRAMES &&
                    distanceTraveled > this.cfg.MIN_DISTANCE) {

                    // Action completed!
                    const quality = this.evaluateAdvanceQuality(kneeAngle, distanceTraveled, elapsed);
                    const feedback = this.generateAdvanceFeedback(kneeAngle);

                    this.reset();

                    return {
                        action: SaberAction.ADVANCE,
                        quality: quality,
                        feedback: feedback,
                        duration: elapsed
                    };
                }
            } else {
                // Still moving, reset stable counter
                this.stableFrames = 0;
            }
        }

        return null;
    }

    evaluateAdvanceQuality(kneeAngle, distance, durationMs) {
        const kneeGood = kneeAngle >= 90 && kneeAngle <= 120;
        const distanceGood = distance > this.cfg.MIN_DISTANCE * 1.5;
        const speedGood = durationMs < 500;

        if (kneeGood && distanceGood && speedGood) return Quality.PERFECT;
        if (kneeGood && (distanceGood || speedGood)) return Quality.GOOD;
        if (kneeGood || distanceGood) return Quality.ACCEPTABLE;
        return Quality.POOR;
    }

    generateAdvanceFeedback(kneeAngle) {
        if (kneeAngle < 90) return '前进步！重心太低';
        if (kneeAngle > 130) return '前进步！膝盖再弯一点';
        return '前进步！';
    }

    reset() {
        super.reset();
        this.isAdvancing = false;
        this.advanceStartTime = 0;
        this.startHipX = 0;
        this.peakVelocity = 0;
        this.stableFrames = 0;
        this.forwardDir = 1;
    }
}

/**
 * Retreat Detector - Uses hip center velocity for reliable detection
 * 
 * Detection Strategy (matching Android):
 * 1. Track hip center position (center of mass proxy)
 * 2. Calculate backward velocity with time normalization
 * 3. Verify En Garde stance maintained (knee angle 80-140°)
 * 4. Confirm movement STOPPED and distance threshold met before reporting
 */
class RetreatDetector extends BaseDetector {
    constructor() {
        super();
        this.isRetreating = false;
        this.retreatStartTime = 0;
        this.startHipX = 0;
        this.peakVelocity = 0;
        this.stableFrames = 0;
        this.backwardDir = -1;

        this.cfg = DetectorConfig.retreat;
    }

    detect(frame, history, velocityTracker = null) {
        if (history.length < 3) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        // Get current hip center
        const hipCenter = this.getHipCenter(landmarks);

        // "Backward" is opposite to the facing direction. Lock the direction
        // at action start so a mid-action turn doesn't flip signs.
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const backwardDir = this.isRetreating
            ? this.backwardDir
            : (leftShoulder.x > rightShoulder.x ? -1 : 1);

        // Use pre-filtered velocity from engine if available (more accurate)
        let backwardVelocity;
        if (velocityTracker) {
            // Use average of left and right hip velocities (already filtered)
            const leftHipVel = velocityTracker.getVelocity(PoseLandmark.LEFT_HIP);
            const rightHipVel = velocityTracker.getVelocity(PoseLandmark.RIGHT_HIP);
            backwardVelocity = ((leftHipVel.x + rightHipVel.x) / 2) * backwardDir;
        } else {
            // Fallback: calculate from raw frame data
            const prevFrame = history[history.length - 1];
            const prevLandmarks = prevFrame.landmarks;
            if (!prevLandmarks || prevLandmarks.length < 33) return null;
            const prevHipCenter = this.getHipCenter(prevLandmarks);
            const deltaTime = frame.timestamp - prevFrame.timestamp;
            backwardVelocity = deltaTime > 0
                ? (hipCenter.x - prevHipCenter.x) / deltaTime * 1000 * backwardDir
                : 0;
        }

        // Get knee angle for En Garde check
        const kneeAngle = this.getFrontKneeAngle(landmarks);
        const isEnGarde = kneeAngle >= this.cfg.KNEE_MIN && kneeAngle <= this.cfg.KNEE_MAX;

        if (!this.isRetreating) {
            // Check for retreat initiation: backward velocity + valid En Garde
            if (backwardVelocity > this.cfg.VELOCITY_START && isEnGarde) {
                this.isRetreating = true;
                this.retreatStartTime = frame.timestamp;
                this.startHipX = hipCenter.x;
                this.peakVelocity = backwardVelocity;
                this.stableFrames = 0;
                this.backwardDir = backwardDir;
                return null;  // Don't report yet, wait for completion
            }
        } else {
            // Retreat in progress - check completion
            const elapsed = frame.timestamp - this.retreatStartTime;
            const distanceTraveled = (hipCenter.x - this.startHipX) * backwardDir;  // Positive when moving back

            // Track peak velocity
            this.peakVelocity = Math.max(this.peakVelocity, backwardVelocity);

            // Check timeout
            if (elapsed > this.cfg.MAX_DURATION) {
                this.reset();
                return null;
            }

            // Check if moving forward (abort - might be advance)
            if (distanceTraveled < -0.02) {
                this.reset();
                return null;
            }

            // Check for movement stopped AND sufficient distance
            if (Math.abs(backwardVelocity) < this.cfg.VELOCITY_STOP) {
                this.stableFrames++;

                if (this.stableFrames >= this.cfg.STABLE_FRAMES &&
                    distanceTraveled > this.cfg.MIN_DISTANCE) {

                    // Action completed!
                    const quality = this.evaluateRetreatQuality(kneeAngle, distanceTraveled, elapsed);
                    const feedback = this.generateRetreatFeedback(kneeAngle);

                    this.reset();

                    return {
                        action: SaberAction.RETREAT,
                        quality: quality,
                        feedback: feedback,
                        duration: elapsed
                    };
                }
            } else {
                // Still moving, reset stable counter
                this.stableFrames = 0;
            }
        }

        return null;
    }

    evaluateRetreatQuality(kneeAngle, distance, durationMs) {
        const kneeGood = kneeAngle >= 90 && kneeAngle <= 120;
        const distanceGood = distance > this.cfg.MIN_DISTANCE * 1.5;
        const speedGood = durationMs < 500;

        if (kneeGood && distanceGood && speedGood) return Quality.PERFECT;
        if (kneeGood && (distanceGood || speedGood)) return Quality.GOOD;
        if (kneeGood || distanceGood) return Quality.ACCEPTABLE;
        return Quality.POOR;
    }

    generateRetreatFeedback(kneeAngle) {
        if (kneeAngle < 90) return '后退步！重心太低';
        if (kneeAngle > 130) return '后退步！膝盖再弯一点';
        return '后退步！';
    }

    reset() {
        super.reset();
        this.isRetreating = false;
        this.retreatStartTime = 0;
        this.startHipX = 0;
        this.peakVelocity = 0;
        this.stableFrames = 0;
        this.backwardDir = -1;
    }
}

/**
 * Advance-Lunge Detector - Advance followed by lunge
 */
class AdvanceLungeDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            ADVANCING: 'advancing',
            LUNGING: 'lunging',
            COMPLETE: 'complete'
        };
        this.cfg = DetectorConfig.advanceLunge;
        this.movementThreshold = this.cfg.MOVEMENT_THRESHOLD;
        this.lungeDetector = new LungeDetector();
    }

    detect(frame, history) {
        if (history.length < 10) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;

        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];

        const prevFrame = history[history.length - 5];
        const prevLandmarks = prevFrame.landmarks;

        const forwardDir = facingRight ? 1 : -1;
        const frontAnkle = facingRight ?
            (leftAnkle.x > rightAnkle.x ? leftAnkle : rightAnkle) :
            (leftAnkle.x < rightAnkle.x ? leftAnkle : rightAnkle);
        const prevFrontAnkle = prevLandmarks[facingRight ?
            (prevLandmarks[PoseLandmark.LEFT_ANKLE].x > prevLandmarks[PoseLandmark.RIGHT_ANKLE].x ? PoseLandmark.LEFT_ANKLE : PoseLandmark.RIGHT_ANKLE) :
            (prevLandmarks[PoseLandmark.LEFT_ANKLE].x < prevLandmarks[PoseLandmark.RIGHT_ANKLE].x ? PoseLandmark.LEFT_ANKLE : PoseLandmark.RIGHT_ANKLE)];

        const movement = (frontAnkle.x - prevFrontAnkle.x) * forwardDir;

        switch (this.phase) {
            case this.phases.IDLE:
                if (movement > this.movementThreshold) {
                    this.transitionTo(this.phases.ADVANCING);
                    this.actionStartTime = Date.now();
                }
                break;

            case this.phases.ADVANCING:
                const lungeResult = this.lungeDetector.detect(frame, history);
                if (lungeResult) {
                    const duration = Date.now() - this.actionStartTime;
                    this.reset();
                    this.lungeDetector.reset();
                    return {
                        action: SaberAction.ADVANCE_LUNGE,
                        quality: lungeResult.quality,
                        feedback: '前进弓步！' + (lungeResult.feedback || ''),
                        duration: duration
                    };
                }

                if (Date.now() - this.actionStartTime > this.cfg.TOTAL_TIMEOUT) {
                    this.reset();
                    this.lungeDetector.reset();
                }
                break;
        }

        return null;
    }

    reset() {
        super.reset();
        if (this.lungeDetector) this.lungeDetector.reset();
    }
}

/**
 * Balestra-Lunge Detector - Jump forward followed by lunge
 */
class BalestraLungeDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            AIRBORNE: 'airborne',
            LANDING: 'landing',
            LUNGING: 'lunging'
        };
        this.baselineHipY = null;
        this.cfg = DetectorConfig.balestraLunge;
        this.jumpThreshold = this.cfg.JUMP_THRESHOLD;
        this.lungeDetector = new LungeDetector();
    }

    detect(frame, history) {
        if (history.length < 10) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        const leftHip = landmarks[PoseLandmark.LEFT_HIP];
        const rightHip = landmarks[PoseLandmark.RIGHT_HIP];
        const hipY = (leftHip.y + rightHip.y) / 2;

        if (this.baselineHipY === null) {
            this.baselineHipY = hipY;
        }

        const hipRise = this.baselineHipY - hipY;

        switch (this.phase) {
            case this.phases.IDLE:
                if (hipRise > this.jumpThreshold) {
                    this.transitionTo(this.phases.AIRBORNE);
                    this.actionStartTime = Date.now();
                }
                break;

            case this.phases.AIRBORNE:
                if (hipRise < this.jumpThreshold * 0.5) {
                    this.transitionTo(this.phases.LANDING);
                }
                if (Date.now() - this.actionStartTime > this.cfg.AIRBORNE_TIMEOUT) {
                    this.reset();
                }
                break;

            case this.phases.LANDING:
                const lungeResult = this.lungeDetector.detect(frame, history);
                if (lungeResult) {
                    const duration = Date.now() - this.actionStartTime;
                    this.reset();
                    return {
                        action: SaberAction.BALESTRA_LUNGE,
                        quality: lungeResult.quality,
                        feedback: '跳步弓步！' + (lungeResult.feedback || ''),
                        duration: duration
                    };
                }

                if (Date.now() - this.phaseStartTime > this.cfg.LANDING_TIMEOUT) {
                    this.reset();
                }
                break;
        }

        return null;
    }

    reset() {
        super.reset();
        this.baselineHipY = null;
        if (this.lungeDetector) this.lungeDetector.reset();
    }
}

/**
 * Flunge Detector - Flying lunge (fleche-lunge hybrid)
 */
class FlungeDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            EXTENDING: 'extending',
            FLYING: 'flying',
            LANDING: 'landing'
        };
        this.baselineHipY = null;
        this.baselineArmExtension = null;
        this.cfg = DetectorConfig.flunge;
    }

    detect(frame, history) {
        if (history.length < 10) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;

        const weaponShoulder = landmarks[facingRight ? PoseLandmark.RIGHT_SHOULDER : PoseLandmark.LEFT_SHOULDER];
        const weaponElbow = landmarks[facingRight ? PoseLandmark.RIGHT_ELBOW : PoseLandmark.LEFT_ELBOW];
        const weaponWrist = landmarks[facingRight ? PoseLandmark.RIGHT_WRIST : PoseLandmark.LEFT_WRIST];

        const shoulderToWrist = calculateDistance(weaponShoulder, weaponWrist);
        const shoulderToElbow = calculateDistance(weaponShoulder, weaponElbow);
        const elbowToWrist = calculateDistance(weaponElbow, weaponWrist);
        const maxArmLength = shoulderToElbow + elbowToWrist;
        const armExtension = maxArmLength > 0 ? shoulderToWrist / maxArmLength : 0;

        const leftHip = landmarks[PoseLandmark.LEFT_HIP];
        const rightHip = landmarks[PoseLandmark.RIGHT_HIP];
        const hipY = (leftHip.y + rightHip.y) / 2;

        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];
        const bothFeetSimilarY = Math.abs(leftAnkle.y - rightAnkle.y) < this.cfg.FEET_Y_TOLERANCE;

        if (this.baselineHipY === null) this.baselineHipY = hipY;
        if (this.baselineArmExtension === null) this.baselineArmExtension = armExtension;

        const hipRise = this.baselineHipY - hipY;
        const armDelta = armExtension - this.baselineArmExtension;

        switch (this.phase) {
            case this.phases.IDLE:
                if (armDelta > this.cfg.ARM_DELTA_START) {
                    this.transitionTo(this.phases.EXTENDING);
                    this.actionStartTime = Date.now();
                }
                break;

            case this.phases.EXTENDING:
                if (hipRise > this.cfg.HIP_RISE_FLYING && bothFeetSimilarY) {
                    this.transitionTo(this.phases.FLYING);
                }
                if (Date.now() - this.actionStartTime > this.cfg.EXTENDING_TIMEOUT) {
                    this.reset();
                }
                break;

            case this.phases.FLYING:
                if (hipRise < this.cfg.HIP_RISE_LANDED) {
                    this.transitionTo(this.phases.LANDING);
                }
                if (Date.now() - this.phaseStartTime > this.cfg.FLYING_TIMEOUT) {
                    this.reset();
                }
                break;

            case this.phases.LANDING:
                const duration = Date.now() - this.actionStartTime;
                if (duration > this.cfg.MIN_DURATION) {
                    this.reset();
                    return {
                        action: SaberAction.FLUNGE,
                        quality: Quality.GOOD,
                        feedback: '飞弓步！保持平衡',
                        duration: duration
                    };
                }
                break;
        }

        return null;
    }

    reset() {
        super.reset();
        this.baselineHipY = null;
        this.baselineArmExtension = null;
    }
}

/**
 * Parry-Riposte Detector - Defensive block followed by counter-attack
 */
class ParryRiposteDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            PARRYING: 'parrying',
            RIPOSTING: 'riposting'
        };
        this.baselineWristY = null;
        this.cfg = DetectorConfig.parryRiposte;
        this.parryThreshold = this.cfg.PARRY_THRESHOLD;
    }

    detect(frame, history) {
        if (history.length < 10) return null;

        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;

        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;

        const weaponWrist = landmarks[facingRight ? PoseLandmark.RIGHT_WRIST : PoseLandmark.LEFT_WRIST];
        const weaponShoulder = landmarks[facingRight ? PoseLandmark.RIGHT_SHOULDER : PoseLandmark.LEFT_SHOULDER];
        const weaponElbow = landmarks[facingRight ? PoseLandmark.RIGHT_ELBOW : PoseLandmark.LEFT_ELBOW];

        const shoulderToWrist = calculateDistance(weaponShoulder, weaponWrist);
        const shoulderToElbow = calculateDistance(weaponShoulder, weaponElbow);
        const elbowToWrist = calculateDistance(weaponElbow, weaponWrist);
        const maxArmLength = shoulderToElbow + elbowToWrist;
        const armExtension = maxArmLength > 0 ? shoulderToWrist / maxArmLength : 0;

        if (this.baselineWristY === null) {
            this.baselineWristY = weaponWrist.y;
        }

        const wristRise = this.baselineWristY - weaponWrist.y;

        switch (this.phase) {
            case this.phases.IDLE:
                if (wristRise > this.parryThreshold) {
                    this.transitionTo(this.phases.PARRYING);
                    this.actionStartTime = Date.now();
                }
                break;

            case this.phases.PARRYING:
                if (armExtension > this.cfg.RIPOSTE_ARM_EXTENSION && wristRise < this.parryThreshold * 0.5) {
                    this.transitionTo(this.phases.RIPOSTING);
                }
                if (Date.now() - this.actionStartTime > this.cfg.PARRY_TIMEOUT) {
                    this.reset();
                }
                break;

            case this.phases.RIPOSTING:
                const duration = Date.now() - this.actionStartTime;
                if (duration > this.cfg.MIN_DURATION) {
                    this.reset();
                    return {
                        action: SaberAction.PARRY_RIPOSTE,
                        quality: Quality.GOOD,
                        feedback: '格挡反攻！动作流畅',
                        duration: duration
                    };
                }
                break;
        }

        return null;
    }

    reset() {
        super.reset();
        this.baselineWristY = null;
    }
}

/**
 * Action Detector Manager
 */
export class ActionDetectorManager {
    constructor() {
        this.detectors = [
            new LungeDetector(),
            new AdvanceDetector(),
            new RetreatDetector(),
            new AdvanceLungeDetector(),
            new BalestraLungeDetector(),
            new FlungeDetector(),
            new ParryRiposteDetector()
        ];
    }

    /**
     * Detect actions from frame
     * @param {Object} frame - Current pose frame
     * @param {Array} history - Previous frames
     * @param {Object} velocityTracker - Pre-computed velocity tracker from engine (optional)
     */
    detect(frame, history, velocityTracker = null) {
        // Gate on keypoint confidence before running any state machine:
        // feeding low-confidence joints (occluded arms, blurred ankles)
        // into the detectors is the main source of false positives.
        if (!this.hasReliableLandmarks(frame.landmarks)) {
            return null;
        }

        for (const detector of this.detectors) {
            const result = detector.detect(frame, history, velocityTracker);
            if (result) {
                return result;
            }
        }
        return null;
    }

    hasReliableLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 33) return false;

        for (const idx of DetectionGate.requiredLandmarks) {
            const lm = landmarks[idx];
            if (!lm) return false;
            if (lm.visibility !== undefined && lm.visibility < DetectionGate.minVisibility) {
                return false;
            }
        }
        return true;
    }

    resetAll() {
        for (const detector of this.detectors) {
            detector.reset();
        }
    }
}
