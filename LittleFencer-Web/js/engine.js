/**
 * Fencing State Engine
 * Main state machine for detecting fencing actions and providing feedback
 */

import { PoseLandmark } from './pose.js';
import { calculateAngle, calculateDistance, midpoint, isFacingRight, calculateVelocity } from './utils.js';
import { ActionDetectorManager } from './detectors/index.js';

// Fencing states
export const FencingState = {
    IDLE: 'IDLE',
    EN_GARDE: 'EN_GARDE',
    ADVANCING: 'ADVANCING',
    RETREATING: 'RETREATING',
    LUNGING: 'LUNGING',
    RECOVERY: 'RECOVERY'
};

// Action quality levels
export const ActionQuality = {
    PERFECT: 'PERFECT',
    GOOD: 'GOOD',
    ACCEPTABLE: 'ACCEPTABLE',
    POOR: 'POOR'
};

/**
 * Pose frame for history tracking
 */
class PoseFrame {
    constructor(landmarks, worldLandmarks, timestamp) {
        this.landmarks = landmarks;
        this.worldLandmarks = worldLandmarks;
        this.timestamp = timestamp;
    }
}

export class FencingStateEngine {
    constructor() {
        // State
        this.currentState = FencingState.IDLE;
        this.previousState = null;
        this.stateStartTime = Date.now();
        
        // Pose history
        this.poseHistory = [];
        this.maxHistorySize = 30; // ~1 second at 30fps
        
        // Metrics
        this.metrics = {
            frontKneeAngle: 0,
            backKneeAngle: 0,
            torsoAngle: 0,
            armExtension: 0,
            stanceWidth: 0,
            hipCenterY: 0
        };
        
        // Tracking
        this.facingRight = true;
        this.frontLegSide = 'right';
        this.lastFrameTime = 0;
        this.noPoseFrames = 0;
        
        // Action detection
        this.detectorManager = new ActionDetectorManager();
        this.lastAction = null;
        this.lastActionTime = 0;
        
        // Callbacks
        this.onStateChange = null;
        this.onActionDetected = null;
        this.onFeedback = null;
        
        // Thresholds
        this.thresholds = {
            enGardeKneeMin: 100,
            enGardeKneeMax: 150,
            lungeKneeMin: 70,
            lungeKneeMax: 110,
            backKneeMinStraight: 155,
            torsoMaxLean: 25,
            minArmExtension: 0.3,
            stateTransitionMs: 200,
            noPoseResetFrames: 10
        };
    }
    
    /**
     * Process pose landmarks
     */
    processPose(landmarks, worldLandmarks) {
        const now = Date.now();
        const deltaTime = now - this.lastFrameTime;
        this.lastFrameTime = now;
        
        // Reset no-pose counter
        this.noPoseFrames = 0;
        
        // Add to history
        const frame = new PoseFrame(landmarks, worldLandmarks, now);
        this.poseHistory.push(frame);
        if (this.poseHistory.length > this.maxHistorySize) {
            this.poseHistory.shift();
        }
        
        // Calculate metrics
        this.calculateMetrics(landmarks, worldLandmarks);
        
        // Determine facing direction
        this.updateFacingDirection(landmarks);
        
        // Run action detectors
        this.runActionDetectors(frame);
        
        // Update state machine
        this.updateState(now);
        
        // Check for form corrections
        this.checkFormCorrections();
    }
    
    /**
     * Handle no pose detected
     */
    handleNoPose() {
        this.noPoseFrames++;
        
        if (this.noPoseFrames >= this.thresholds.noPoseResetFrames) {
            this.transitionTo(FencingState.IDLE);
        }
    }
    
    /**
     * Calculate all metrics from landmarks
     */
    calculateMetrics(landmarks, worldLandmarks) {
        const lm = landmarks;
        
        // Determine front/back leg
        const leftAnkle = lm[PoseLandmark.LEFT_ANKLE];
        const rightAnkle = lm[PoseLandmark.RIGHT_ANKLE];
        
        if (this.facingRight) {
            this.frontLegSide = leftAnkle.x > rightAnkle.x ? 'left' : 'right';
        } else {
            this.frontLegSide = leftAnkle.x < rightAnkle.x ? 'left' : 'right';
        }
        
        // Get leg landmarks based on front leg
        const frontHip = lm[this.frontLegSide === 'left' ? PoseLandmark.LEFT_HIP : PoseLandmark.RIGHT_HIP];
        const frontKnee = lm[this.frontLegSide === 'left' ? PoseLandmark.LEFT_KNEE : PoseLandmark.RIGHT_KNEE];
        const frontAnkle = lm[this.frontLegSide === 'left' ? PoseLandmark.LEFT_ANKLE : PoseLandmark.RIGHT_ANKLE];
        
        const backHip = lm[this.frontLegSide === 'left' ? PoseLandmark.RIGHT_HIP : PoseLandmark.LEFT_HIP];
        const backKnee = lm[this.frontLegSide === 'left' ? PoseLandmark.RIGHT_KNEE : PoseLandmark.LEFT_KNEE];
        const backAnkle = lm[this.frontLegSide === 'left' ? PoseLandmark.RIGHT_ANKLE : PoseLandmark.LEFT_ANKLE];
        
        // Calculate knee angles
        this.metrics.frontKneeAngle = calculateAngle(frontHip, frontKnee, frontAnkle);
        this.metrics.backKneeAngle = calculateAngle(backHip, backKnee, backAnkle);
        
        // Calculate torso angle
        const leftShoulder = lm[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = lm[PoseLandmark.RIGHT_SHOULDER];
        const leftHip = lm[PoseLandmark.LEFT_HIP];
        const rightHip = lm[PoseLandmark.RIGHT_HIP];
        
        const shoulderMid = midpoint(leftShoulder, rightShoulder);
        const hipMid = midpoint(leftHip, rightHip);
        
        // Torso lean angle (0 = vertical)
        const dx = shoulderMid.x - hipMid.x;
        const dy = shoulderMid.y - hipMid.y;
        this.metrics.torsoAngle = Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
        
        // Calculate arm extension (weapon arm)
        const weaponShoulder = lm[this.facingRight ? PoseLandmark.RIGHT_SHOULDER : PoseLandmark.LEFT_SHOULDER];
        const weaponElbow = lm[this.facingRight ? PoseLandmark.RIGHT_ELBOW : PoseLandmark.LEFT_ELBOW];
        const weaponWrist = lm[this.facingRight ? PoseLandmark.RIGHT_WRIST : PoseLandmark.LEFT_WRIST];
        
        const shoulderToWrist = calculateDistance(weaponShoulder, weaponWrist);
        const shoulderToElbow = calculateDistance(weaponShoulder, weaponElbow);
        const elbowToWrist = calculateDistance(weaponElbow, weaponWrist);
        const maxArmLength = shoulderToElbow + elbowToWrist;
        
        this.metrics.armExtension = maxArmLength > 0 ? shoulderToWrist / maxArmLength : 0;
        
        // Calculate stance width relative to hip width
        const hipWidth = calculateDistance(leftHip, rightHip);
        const ankleWidth = calculateDistance(leftAnkle, rightAnkle);
        this.metrics.stanceWidth = hipWidth > 0 ? ankleWidth / hipWidth : 0;
        
        // Hip center Y position (for detecting vertical movement)
        this.metrics.hipCenterY = hipMid.y;
    }
    
    /**
     * Update facing direction
     */
    updateFacingDirection(landmarks) {
        const leftShoulder = landmarks[PoseLandmark.LEFT_SHOULDER];
        const rightShoulder = landmarks[PoseLandmark.RIGHT_SHOULDER];
        this.facingRight = isFacingRight(leftShoulder, rightShoulder);
    }
    
    /**
     * Run action detectors
     */
    runActionDetectors(frame) {
        const result = this.detectorManager.detect(frame, this.poseHistory);
        
        if (result && result.action) {
            const now = Date.now();
            
            // Debounce same action
            if (result.action !== this.lastAction || now - this.lastActionTime > 2000) {
                this.lastAction = result.action;
                this.lastActionTime = now;
                
                if (this.onActionDetected) {
                    this.onActionDetected(result.action, result.quality, result.feedback);
                }
            }
        }
    }
    
    /**
     * Update state machine
     */
    updateState(now) {
        const timeSinceStateChange = now - this.stateStartTime;
        
        // State transitions
        switch (this.currentState) {
            case FencingState.IDLE:
                // Check for En Garde position
                if (this.isEnGardePosition() && timeSinceStateChange > this.thresholds.stateTransitionMs) {
                    this.transitionTo(FencingState.EN_GARDE);
                }
                break;
                
            case FencingState.EN_GARDE:
                // Check for lunge start
                if (this.isLungePosition()) {
                    this.transitionTo(FencingState.LUNGING);
                }
                // Check if lost En Garde
                else if (!this.isEnGardePosition() && timeSinceStateChange > 500) {
                    this.transitionTo(FencingState.IDLE);
                }
                break;
                
            case FencingState.LUNGING:
                // Check for recovery
                if (!this.isLungePosition() && timeSinceStateChange > 300) {
                    this.transitionTo(FencingState.RECOVERY);
                }
                break;
                
            case FencingState.RECOVERY:
                // Check for return to En Garde
                if (this.isEnGardePosition()) {
                    this.transitionTo(FencingState.EN_GARDE);
                }
                // Timeout to idle
                else if (timeSinceStateChange > 2000) {
                    this.transitionTo(FencingState.IDLE);
                }
                break;
        }
    }
    
    /**
     * Check if in En Garde position
     */
    isEnGardePosition() {
        const { frontKneeAngle, backKneeAngle, stanceWidth, torsoAngle } = this.metrics;
        
        // Check front knee bent appropriately
        const frontKneeOk = frontKneeAngle >= this.thresholds.enGardeKneeMin && 
                           frontKneeAngle <= this.thresholds.enGardeKneeMax;
        
        // Check stance width (should be wider than standing)
        const stanceOk = stanceWidth >= 1.2;
        
        // Check torso relatively upright
        const torsoOk = torsoAngle <= this.thresholds.torsoMaxLean;
        
        return frontKneeOk && stanceOk && torsoOk;
    }
    
    /**
     * Check if in lunge position
     */
    isLungePosition() {
        const { frontKneeAngle, backKneeAngle, stanceWidth, armExtension } = this.metrics;
        
        // Front knee deeply bent
        const frontKneeOk = frontKneeAngle >= this.thresholds.lungeKneeMin && 
                           frontKneeAngle <= this.thresholds.lungeKneeMax;
        
        // Back leg straight
        const backKneeOk = backKneeAngle >= this.thresholds.backKneeMinStraight;
        
        // Wide stance
        const stanceOk = stanceWidth >= 1.8;
        
        // Arm extended
        const armOk = armExtension >= this.thresholds.minArmExtension;
        
        return frontKneeOk && backKneeOk && stanceOk && armOk;
    }
    
    /**
     * Transition to new state
     */
    transitionTo(newState) {
        if (newState === this.currentState) return;
        
        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateStartTime = Date.now();
        
        console.log(`[Engine] State: ${this.previousState} → ${newState}`);
        
        if (this.onStateChange) {
            this.onStateChange(newState, {
                previousState: this.previousState,
                metrics: { ...this.metrics }
            });
        }
    }
    
    /**
     * Check form and provide correction feedback
     */
    checkFormCorrections() {
        if (this.currentState === FencingState.IDLE) return;
        
        const { frontKneeAngle, backKneeAngle, torsoAngle, armExtension } = this.metrics;
        const now = Date.now();
        
        // Throttle feedback
        if (!this.lastFeedbackTime) this.lastFeedbackTime = 0;
        if (now - this.lastFeedbackTime < 2000) return;
        
        let feedback = null;
        let type = 'error';
        
        // Check back leg
        if (this.currentState === FencingState.LUNGING) {
            if (backKneeAngle < this.thresholds.backKneeMinStraight - 10) {
                feedback = '后腿伸直！';
            }
        }
        
        // Check torso
        if (torsoAngle > this.thresholds.torsoMaxLean + 10) {
            feedback = '保持身体直立！';
        }
        
        // Check front knee in En Garde
        if (this.currentState === FencingState.EN_GARDE) {
            if (frontKneeAngle > this.thresholds.enGardeKneeMax + 10) {
                feedback = '膝盖再弯一点！';
            } else if (frontKneeAngle < this.thresholds.enGardeKneeMin - 10) {
                feedback = '膝盖弯曲过度！';
            }
        }
        
        // Check arm extension in lunge
        if (this.currentState === FencingState.LUNGING) {
            if (armExtension < this.thresholds.minArmExtension - 0.1) {
                feedback = '手臂先动！伸直手臂！';
            }
        }
        
        if (feedback && this.onFeedback) {
            this.lastFeedbackTime = now;
            this.onFeedback(feedback, type);
        }
    }
    
    /**
     * Get current quality assessment
     */
    getCurrentQuality() {
        const { frontKneeAngle, backKneeAngle, torsoAngle, armExtension } = this.metrics;
        
        let score = 0;
        let total = 0;
        
        // Evaluate based on current state
        if (this.currentState === FencingState.EN_GARDE) {
            // Front knee
            if (frontKneeAngle >= this.thresholds.enGardeKneeMin && 
                frontKneeAngle <= this.thresholds.enGardeKneeMax) {
                score += 1;
            }
            total += 1;
            
            // Torso
            if (torsoAngle <= this.thresholds.torsoMaxLean) {
                score += 1;
            }
            total += 1;
        }
        
        if (this.currentState === FencingState.LUNGING) {
            // Front knee
            if (frontKneeAngle >= this.thresholds.lungeKneeMin && 
                frontKneeAngle <= this.thresholds.lungeKneeMax) {
                score += 1;
            }
            total += 1;
            
            // Back knee
            if (backKneeAngle >= this.thresholds.backKneeMinStraight) {
                score += 1;
            }
            total += 1;
            
            // Arm extension
            if (armExtension >= this.thresholds.minArmExtension) {
                score += 1;
            }
            total += 1;
            
            // Torso
            if (torsoAngle <= this.thresholds.torsoMaxLean) {
                score += 1;
            }
            total += 1;
        }
        
        if (total === 0) return 'neutral';
        
        const ratio = score / total;
        
        if (ratio >= 1.0) return 'perfect';
        if (ratio >= 0.75) return 'good';
        if (ratio >= 0.5) return 'acceptable';
        return 'poor';
    }
    
    /**
     * Reset engine state
     */
    reset() {
        this.currentState = FencingState.IDLE;
        this.previousState = null;
        this.stateStartTime = Date.now();
        this.poseHistory = [];
        this.lastAction = null;
        this.lastActionTime = 0;
        this.noPoseFrames = 0;
        this.detectorManager.resetAll();
    }
}
