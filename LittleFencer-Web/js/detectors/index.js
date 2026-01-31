/**
 * Action Detector Manager
 * Manages all action detectors and coordinates detection
 */

import { PoseLandmark } from '../pose.js';
import { calculateAngle, calculateDistance, midpoint, calculateVelocity } from '../utils.js';

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
    
    detect(frame, history) {
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
        
        this.thresholds = {
            ARM_EXTENSION_START: 0.20,
            ARM_EXTENSION_FULL: 0.30,
            BACK_KNEE_MIN_STRAIGHT: 150,
            FRONT_KNEE_LUNGE_MAX: 110,
            STANCE_WIDTH_LUNGE: 1.8,
            MIN_LUNGE_DURATION: 150,
            MAX_LUNGE_DURATION: 1500
        };
        
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
 * Advance Detector
 */
class AdvanceDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            FRONT_FOOT_MOVING: 'front_foot_moving',
            BACK_FOOT_FOLLOWING: 'back_foot_following'
        };
        
        this.initialFrontAnkleX = null;
        this.initialBackAnkleX = null;
        this.movementThreshold = 0.05;
    }
    
    detect(frame, history) {
        if (history.length < 5) return null;
        
        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;
        
        // Determine facing and front/back legs
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;
        
        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];
        
        const frontAnkle = facingRight 
            ? (leftAnkle.x > rightAnkle.x ? leftAnkle : rightAnkle)
            : (leftAnkle.x < rightAnkle.x ? leftAnkle : rightAnkle);
        const backAnkle = facingRight
            ? (leftAnkle.x > rightAnkle.x ? rightAnkle : leftAnkle)
            : (leftAnkle.x < rightAnkle.x ? rightAnkle : leftAnkle);
        
        // Get previous frame
        const prevFrame = history[history.length - 5];
        const prevLandmarks = prevFrame.landmarks;
        const prevLeftAnkle = prevLandmarks[PoseLandmark.LEFT_ANKLE];
        const prevRightAnkle = prevLandmarks[PoseLandmark.RIGHT_ANKLE];
        
        const prevFrontAnkle = facingRight
            ? (prevLeftAnkle.x > prevRightAnkle.x ? prevLeftAnkle : prevRightAnkle)
            : (prevLeftAnkle.x < prevRightAnkle.x ? prevLeftAnkle : prevRightAnkle);
        const prevBackAnkle = facingRight
            ? (prevLeftAnkle.x > prevRightAnkle.x ? prevRightAnkle : prevLeftAnkle)
            : (prevLeftAnkle.x < prevRightAnkle.x ? prevRightAnkle : prevLeftAnkle);
        
        // Calculate movement
        const forwardDir = facingRight ? 1 : -1;
        const frontMovement = (frontAnkle.x - prevFrontAnkle.x) * forwardDir;
        const backMovement = (backAnkle.x - prevBackAnkle.x) * forwardDir;
        
        switch (this.phase) {
            case this.phases.IDLE:
                if (frontMovement > this.movementThreshold) {
                    this.transitionTo(this.phases.FRONT_FOOT_MOVING);
                    this.actionStartTime = Date.now();
                    this.initialFrontAnkleX = prevFrontAnkle.x;
                    this.initialBackAnkleX = prevBackAnkle.x;
                }
                break;
                
            case this.phases.FRONT_FOOT_MOVING:
                if (backMovement > this.movementThreshold / 2) {
                    this.transitionTo(this.phases.BACK_FOOT_FOLLOWING);
                }
                
                // Timeout
                if (Date.now() - this.actionStartTime > 1000) {
                    this.reset();
                }
                break;
                
            case this.phases.BACK_FOOT_FOLLOWING:
                const duration = Date.now() - this.actionStartTime;
                if (duration > 100) {
                    this.reset();
                    return {
                        action: SaberAction.ADVANCE,
                        quality: Quality.GOOD,
                        feedback: '前进步！',
                        duration: duration
                    };
                }
                break;
        }
        
        return null;
    }
}

/**
 * Retreat Detector
 */
class RetreatDetector extends BaseDetector {
    constructor() {
        super();
        this.phases = {
            IDLE: 'idle',
            BACK_FOOT_MOVING: 'back_foot_moving',
            FRONT_FOOT_FOLLOWING: 'front_foot_following'
        };
        
        this.movementThreshold = 0.05;
    }
    
    detect(frame, history) {
        if (history.length < 5) return null;
        
        const landmarks = frame.landmarks;
        if (!landmarks || landmarks.length < 33) return null;
        
        // Determine facing and front/back legs
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const facingRight = leftShoulder.x > rightShoulder.x;
        
        const leftAnkle = landmarks[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = landmarks[PoseLandmark.RIGHT_ANKLE];
        
        const frontAnkle = facingRight 
            ? (leftAnkle.x > rightAnkle.x ? leftAnkle : rightAnkle)
            : (leftAnkle.x < rightAnkle.x ? leftAnkle : rightAnkle);
        const backAnkle = facingRight
            ? (leftAnkle.x > rightAnkle.x ? rightAnkle : leftAnkle)
            : (leftAnkle.x < rightAnkle.x ? rightAnkle : leftAnkle);
        
        // Get previous frame
        const prevFrame = history[history.length - 5];
        const prevLandmarks = prevFrame.landmarks;
        const prevLeftAnkle = prevLandmarks[PoseLandmark.LEFT_ANKLE];
        const prevRightAnkle = prevLandmarks[PoseLandmark.RIGHT_ANKLE];
        
        const prevFrontAnkle = facingRight
            ? (prevLeftAnkle.x > prevRightAnkle.x ? prevLeftAnkle : prevRightAnkle)
            : (prevLeftAnkle.x < prevRightAnkle.x ? prevLeftAnkle : prevRightAnkle);
        const prevBackAnkle = facingRight
            ? (prevLeftAnkle.x > prevRightAnkle.x ? prevRightAnkle : prevLeftAnkle)
            : (prevLeftAnkle.x < prevRightAnkle.x ? prevRightAnkle : prevLeftAnkle);
        
        // Calculate backward movement
        const backwardDir = facingRight ? -1 : 1;
        const backFootBackward = (backAnkle.x - prevBackAnkle.x) * backwardDir;
        const frontFootBackward = (frontAnkle.x - prevFrontAnkle.x) * backwardDir;
        
        switch (this.phase) {
            case this.phases.IDLE:
                if (backFootBackward > this.movementThreshold) {
                    this.transitionTo(this.phases.BACK_FOOT_MOVING);
                    this.actionStartTime = Date.now();
                }
                break;
                
            case this.phases.BACK_FOOT_MOVING:
                if (frontFootBackward > this.movementThreshold / 2) {
                    this.transitionTo(this.phases.FRONT_FOOT_FOLLOWING);
                }
                
                if (Date.now() - this.actionStartTime > 1000) {
                    this.reset();
                }
                break;
                
            case this.phases.FRONT_FOOT_FOLLOWING:
                const duration = Date.now() - this.actionStartTime;
                if (duration > 100) {
                    this.reset();
                    return {
                        action: SaberAction.RETREAT,
                        quality: Quality.GOOD,
                        feedback: '后退步！',
                        duration: duration
                    };
                }
                break;
        }
        
        return null;
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
            new RetreatDetector()
        ];
    }
    
    detect(frame, history) {
        for (const detector of this.detectors) {
            const result = detector.detect(frame, history);
            if (result) {
                return result;
            }
        }
        return null;
    }
    
    resetAll() {
        for (const detector of this.detectors) {
            detector.reset();
        }
    }
}
