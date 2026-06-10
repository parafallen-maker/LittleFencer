/**
 * Fencing State Engine
 * Main state machine for detecting fencing actions and providing feedback
 * With improved accuracy using DTW matching and signal filtering
 * 
 * VERSION: 2026-02-02-v1 - Unified velocity pipeline
 */

// 在加载时立即打印版本信息
console.log('🔴 [ENGINE.JS] VERSION 2026-02-02-v1 LOADED - UNIFIED VELOCITY PIPELINE');

import { PoseLandmark } from './pose.js';
import { calculateAngle, calculateDistance, midpoint, isFacingRight, calculateVelocity } from './utils.js';
import { ActionDetectorManager } from './detectors/index.js';
import { LandmarkFilter, JointVelocityTracker, ConfidenceWeightedFilter, OutlierRejector, OneEuroLandmarkFilter } from './filters.js';
import { DTWActionMatcher } from './dtw.js';
import { KeyframeDetector } from './keyframeDetector.js';

// Fencing states
export const FencingState = {
    IDLE: 'IDLE',
    WAITING_FULL_BODY: 'WAITING_FULL_BODY', // New state: waiting for full body visibility
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

// Required landmarks for full body detection
const REQUIRED_LANDMARKS = [
    { index: PoseLandmark.NOSE, name: '头部' },
    { index: PoseLandmark.LEFT_SHOULDER, name: '左肩' },
    { index: PoseLandmark.RIGHT_SHOULDER, name: '右肩' },
    { index: PoseLandmark.LEFT_HIP, name: '左髋' },
    { index: PoseLandmark.RIGHT_HIP, name: '右髋' },
    { index: PoseLandmark.LEFT_KNEE, name: '左膝' },
    { index: PoseLandmark.RIGHT_KNEE, name: '右膝' },
    { index: PoseLandmark.LEFT_ANKLE, name: '左脚' },
    { index: PoseLandmark.RIGHT_ANKLE, name: '右脚' }
];

/**
 * FIE Official Fencing Technical Standards
 * Based on International Fencing Federation guidelines and biomechanics research
 * Source: fie.org, fencing.net, affencing.com, biomechanics studies
 */
export const FIE_STANDARDS = {
    // 准备姿势 (En Garde) - FIE标准
    enGarde: {
        name: 'enGarde',
        displayName: '准备姿势',
        description: '击剑攻防格斗的起始姿势',
        criteria: {
            // 前膝角度：花剑~90°, 重剑~100°, 佩剑~80°，统一使用80-110°范围
            frontKneeAngle: { min: 80, max: 110, unit: '°', description: '前膝弯曲角度' },
            // 后膝角度：与前膝相似
            backKneeAngle: { min: 80, max: 110, unit: '°', description: '后膝弯曲角度' },
            // 躯干直立，最大倾斜10°
            torsoAngle: { max: 12, unit: '°', description: '躯干倾斜角度' },
            // 步幅约等于肩宽
            stanceWidthRatio: { min: 0.9, max: 1.3, unit: '×肩宽', description: '步幅比例' },
            // 重心均匀分布
            weightBalance: { min: 0.4, max: 0.6, description: '重心分布比例' }
        },
        feedback: {
            frontKneeTooStraight: '前膝弯曲不够，需要更低的姿势',
            frontKneeTooBent: '前膝弯曲过度，注意保护膝盖',
            backKneeTooStraight: '后膝弯曲不够',
            backKneeTooBent: '后膝弯曲过度',
            torsoLeaning: '躯干前倾过大，保持直立',
            stanceTooNarrow: '步幅太窄，双脚分开与肩同宽',
            stanceTooWide: '步幅太宽，影响移动灵活性'
        }
    },

    // 弓步 (Lunge) - FIE官方标准
    lunge: {
        name: 'lunge',
        displayName: '弓步',
        description: '击剑最重要的进攻步法，绝大多数有效攻击通过弓步完成',
        criteria: {
            // FIE标准：大腿与小腿成直角 (90°)
            frontKneeAngle: { min: 85, max: 100, unit: '°', description: '前膝角度(标准90°)' },
            // FIE标准：后腿接近完全伸直
            backKneeAngle: { min: 160, max: 180, unit: '°', description: '后腿伸直角度' },
            // FIE标准：躯干保持直立，不前倾
            torsoAngle: { max: 15, unit: '°', description: '躯干倾斜角度' },
            // FIE标准：手臂完全伸直
            armExtension: { min: 0.90, unit: '比例', description: '手臂伸直程度(90%+)' },
            // 步幅加宽
            stanceWidthRatio: { min: 1.5, max: 2.5, unit: '×肩宽', description: '步幅比例' },
            // 后脚跟离地约5cm
            backHeelLift: { target: 0.05, unit: 'm', description: '后脚跟离地高度' }
        },
        timing: {
            // FIE标准：手臂先动，腿部跟随
            armLeadsLeg: true,
            armLeadTime: { min: 50, max: 150, unit: 'ms', description: '手臂领先时间' }
        },
        feedback: {
            frontKneeTooStraight: '前膝弯曲不够，需要达到90°',
            frontKneeTooBent: '前膝弯曲过度，膝盖超过脚尖',
            backKneeNotStraight: '后腿没有伸直！这是弓步的关键',
            torsoLeaning: '躯干前倾过大，保持直立',
            armNotExtended: '手臂没有伸直，剑尖应与肩同高',
            armNotFirst: '手臂要先动！伸直手臂再蹬腿'
        }
    },

    // 前进步 (Advance)
    advance: {
        name: 'advance',
        displayName: '前进步',
        description: '用于拉近与对手距离，创造进攻机会',
        criteria: {
            // 保持膝盖弯曲，不完全伸直
            kneesBent: { min: 80, max: 130, unit: '°', description: '膝盖弯曲角度' },
            // 水平移动，重心无上下跳动
            verticalBounce: { max: 0.03, unit: '比例', description: '垂直跳动幅度' },
            // 步幅约一脚掌长
            stepLength: { min: 0.8, max: 1.2, unit: '×脚长', description: '步幅' },
            // 前脚先动，后脚跟随
            frontFootFirst: true,
            // 保持准备姿势
            maintainStance: true
        },
        feedback: {
            kneesTooStraight: '保持膝盖弯曲状态',
            bouncingTooMuch: '减少上下跳动，保持水平移动',
            stanceChanged: '保持准备姿势不变'
        }
    },

    // 后退步 (Retreat)
    retreat: {
        name: 'retreat',
        displayName: '后退步',
        description: '用于拉开与对手距离，进行防守或反攻',
        criteria: {
            // 保持膝盖弯曲
            kneesBent: { min: 80, max: 130, unit: '°', description: '膝盖弯曲角度' },
            // 水平移动
            verticalBounce: { max: 0.03, unit: '比例', description: '垂直跳动幅度' },
            // 后脚先动
            backFootFirst: true,
            // 保持准备姿势
            maintainStance: true
        },
        feedback: {
            kneesTooStraight: '保持膝盖弯曲状态',
            bouncingTooMuch: '减少上下跳动，保持水平移动',
            stanceChanged: '保持准备姿势不变'
        }
    }
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
        this.currentState = FencingState.WAITING_FULL_BODY; // Start with waiting for full body
        this.previousState = null;
        this.stateStartTime = Date.now();

        // Full body visibility
        this.visibilityInfo = {
            isFullBody: false,
            score: 0,
            missingParts: [],
            visibleParts: []
        };
        this.fullBodyFrameCount = 0; // Consecutive frames with full body
        this.requiredFullBodyFrames = 10; // Need 10 frames (~0.3s) of stable full body

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

        // Improved accuracy: Signal filtering and DTW matching
        // P0: Outlier rejection (first) - removes impossible jumps
        this.outlierRejector = new OutlierRejector(0.15, 0.8);
        // P0: Confidence-weighted filter - adapts to landmark quality
        this.confidenceFilter = new ConfidenceWeightedFilter(33, 0.4, 0.1);
        // P1: One Euro filter - reduces lag for fast movements
        this.oneEuroFilter = new OneEuroLandmarkFilter(33, 1.0, 0.007);
        // Legacy filter (kept for compatibility)
        this.landmarkFilter = new LandmarkFilter(33, 0.4);
        // Velocity tracking
        this.velocityTracker = new JointVelocityTracker([
            PoseLandmark.LEFT_WRIST, PoseLandmark.RIGHT_WRIST,
            PoseLandmark.LEFT_ANKLE, PoseLandmark.RIGHT_ANKLE,
            PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP
        ], 5);
        // P1: Keyframe detection for efficient DTW
        this.keyframeDetector = new KeyframeDetector();
        // DTW matching
        this.dtwMatcher = new DTWActionMatcher();
        this.useDTW = true;  // Enable DTW matching (can be toggled)
        this.useAdvancedFilters = true;  // Use new P0/P1 filters

        // Callbacks
        this.onStateChange = null;
        this.onActionDetected = null;
        this.onFeedback = null;
        this.onVisibilityChange = null; // New callback for visibility updates

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
            noPoseResetFrames: 10,
            minVisibility: 0.7,  // Increased: Minimum visibility threshold for landmarks
            // Screen bounds with margin - landmarks must be within this range
            screenMargin: 0.05,  // 5% margin from edges
            minX: 0.05,
            maxX: 0.95,
            minY: 0.05,
            maxY: 0.95
        };
    }

    /**
     * Check full body visibility - STRICT version
     * Both visibility score AND screen position must be valid
     */
    checkFullBodyVisibility(landmarks) {
        const missingParts = [];
        const visibleParts = [];
        let totalVisibility = 0;

        for (const req of REQUIRED_LANDMARKS) {
            const lm = landmarks[req.index];

            // Check 1: Landmark exists and has good visibility score
            const hasGoodVisibility = lm && lm.visibility >= this.thresholds.minVisibility;

            // Check 2: Landmark is within screen bounds (not guessed outside frame)
            const isOnScreen = lm &&
                lm.x >= this.thresholds.minX &&
                lm.x <= this.thresholds.maxX &&
                lm.y >= this.thresholds.minY &&
                lm.y <= this.thresholds.maxY;

            // Both conditions must be met
            if (hasGoodVisibility && isOnScreen) {
                visibleParts.push(req.name);
                totalVisibility += lm.visibility;
            } else {
                missingParts.push(req.name);
                // Debug: log why it failed
                if (lm) {
                    console.debug(`${req.name}: vis=${lm.visibility.toFixed(2)}, x=${lm.x.toFixed(2)}, y=${lm.y.toFixed(2)} - ${!hasGoodVisibility ? 'LOW_VIS' : ''} ${!isOnScreen ? 'OFF_SCREEN' : ''}`);
                }
            }
        }

        const score = Math.round((visibleParts.length / REQUIRED_LANDMARKS.length) * 100);
        const isFullBody = missingParts.length === 0;

        this.visibilityInfo = {
            isFullBody,
            score,
            missingParts,
            visibleParts
        };

        // Notify UI about visibility change
        if (this.onVisibilityChange) {
            this.onVisibilityChange(this.visibilityInfo);
        }

        return this.visibilityInfo;
    }

    /**
     * Get visibility info
     */
    getVisibilityInfo() {
        return this.visibilityInfo;
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

        // Check full body visibility first - THIS IS CRITICAL
        // skipFullBodyCheck: video test / offline eval mode — recorded
        // footage often doesn't keep the full body in frame, so the gate
        // would lock the engine in WAITING and nothing would be detected.
        const visibility = this.skipFullBodyCheck
            ? { isFullBody: true, score: 100, missingParts: [] }
            : this.checkFullBodyVisibility(landmarks);

        // DEBUG: Log visibility status every 30 frames (~1 second)
        if (Math.random() < 0.03) {
            console.log(`[VISIBILITY] score=${visibility.score}%, isFullBody=${visibility.isFullBody}, missing=[${visibility.missingParts.join(', ')}]`);
        }

        // Track consecutive full body frames
        if (visibility.isFullBody) {
            this.fullBodyFrameCount++;
        } else {
            this.fullBodyFrameCount = 0;
        }

        // If not enough full body frames, stay in waiting state
        if (this.currentState === FencingState.WAITING_FULL_BODY) {
            if (this.fullBodyFrameCount >= this.requiredFullBodyFrames) {
                // Full body confirmed, transition to IDLE
                this.transitionTo(FencingState.IDLE);
                console.log('[ENGINE] Full body confirmed, starting training!');
                if (this.onFeedback) {
                    this.onFeedback('全身已检测到！准备训练', 'success');
                }
            }
            return; // Don't process further until full body is confirmed
        }

        // CRITICAL: If body not fully visible, DO NOT detect actions!
        if (!visibility.isFullBody) {
            console.log(`[ENGINE] Body incomplete (${visibility.score}%), blocking action detection`);

            // Give warning feedback about missing parts
            if (this.onFeedback && this.noPoseFrames === 0) {
                const missing = visibility.missingParts.slice(0, 3).join('、');
                this.onFeedback(`请确保 ${missing} 在画面中`, 'warning');
            }

            // After losing full body for a few frames, go back to waiting state
            this.noPoseFrames++;
            if (this.noPoseFrames >= 5) {
                console.log('[ENGINE] Lost body, returning to WAITING state');
                this.transitionTo(FencingState.WAITING_FULL_BODY);
                // Also reset detectors to clear any in-progress detection
                this.detectorManager.resetAll();
            }

            // DON'T run action detection - RETURN HERE!
            return;
        }

        // Reset noPoseFrames when we have full body
        this.noPoseFrames = 0;

        // === IMPROVED FILTER PIPELINE ===
        let processedLandmarks = landmarks;

        if (this.useAdvancedFilters) {
            // Step 1 [P0]: Outlier rejection - remove impossible jumps
            const { landmarks: cleanedLandmarks, rejected } = this.outlierRejector.process(landmarks);
            if (rejected.length > 0) {
                console.log(`[Filter] Rejected ${rejected.length} outlier points`);
            }

            // Step 2 [P0]: Confidence-weighted filter - adapt to landmark quality
            const confFiltered = this.confidenceFilter.filter(cleanedLandmarks);

            // Step 3 [P1]: One Euro filter - reduce lag for fast movements
            processedLandmarks = this.oneEuroFilter.filter(confFiltered, now);
        } else {
            // Fallback: Legacy low-pass filter
            processedLandmarks = this.landmarkFilter.filter(landmarks);
        }

        // Update velocity tracker with filtered landmarks
        this.velocityTracker.update(processedLandmarks, now);

        // Add to history (use processed landmarks)
        const frame = new PoseFrame(processedLandmarks, worldLandmarks, now);
        this.poseHistory.push(frame);
        if (this.poseHistory.length > this.maxHistorySize) {
            this.poseHistory.shift();
        }

        // Calculate metrics (use processed landmarks)
        this.calculateMetrics(processedLandmarks, worldLandmarks);

        // Determine facing direction
        this.updateFacingDirection(processedLandmarks);

        // Run rule-based action detectors
        this.runActionDetectors(frame);

        // [P1] Keyframe-triggered DTW matching for efficiency
        if (this.useDTW) {
            const keyframeEvent = this.keyframeDetector.update(
                this.velocityTracker,
                [PoseLandmark.RIGHT_WRIST, PoseLandmark.LEFT_WRIST,
                PoseLandmark.RIGHT_ANKLE, PoseLandmark.LEFT_ANKLE]
            );

            if (keyframeEvent === 'MOTION_END') {
                // Only run DTW when motion ends
                this.runDTWMatcher(frame);
            }
        }

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
        this.fullBodyFrameCount = 0;

        // Update visibility to zero
        this.visibilityInfo = {
            isFullBody: false,
            score: 0,
            missingParts: ['全部'],
            visibleParts: []
        };

        if (this.onVisibilityChange) {
            this.onVisibilityChange(this.visibilityInfo);
        }

        if (this.noPoseFrames >= this.thresholds.noPoseResetFrames) {
            // Go back to waiting for full body instead of just IDLE
            this.transitionTo(FencingState.WAITING_FULL_BODY);
        }
    }

    /**
     * Reset to waiting state (can be called externally)
     */
    resetToWaiting() {
        this.fullBodyFrameCount = 0;
        this.transitionTo(FencingState.WAITING_FULL_BODY);
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
     * Restrict detection to a subset of actions (single-action practice).
     * @param {Array<string>|string|null} actions SaberAction values; null/'all' = everything
     */
    setEnabledActions(actions) {
        this.detectorManager.setEnabledActions(actions);
    }

    /**
     * Run action detectors
     */
    runActionDetectors(frame) {
        // Pass velocityTracker to detectors for filtered velocity data
        const result = this.detectorManager.detect(frame, this.poseHistory, this.velocityTracker);

        if (result && result.action) {
            const now = Date.now();

            // Debounce same action. Kept short (800ms): the manager already
            // enforces a global cooldown, and a 2s window here swallows
            // legitimate rapid footwork (e.g. three quick advances).
            if (result.action !== this.lastAction || now - this.lastActionTime > 800) {
                this.lastAction = result.action;
                this.lastActionTime = now;

                if (this.onActionDetected) {
                    this.onActionDetected(result.action, result.quality, result.feedback);
                }
            }
        }
    }

    /**
     * Run DTW-based action matching.
     *
     * Tech route R3: rule-based state machines are the single reporting
     * path; DTW is corroboration only. Until real expert templates are
     * recorded (current ones are synthetic placeholders), a DTW match is
     * logged and stored for calibration/debugging but never reported to
     * the user — two independent reporting paths produced contradictory
     * announcements for one physical motion.
     */
    runDTWMatcher(frame) {
        const result = this.dtwMatcher.addFrame(frame);

        if (result) {
            this.lastDTWMatch = { ...result, timestamp: Date.now() };
            console.log(`[DTW] Matched: ${result.displayName} (confidence: ${(result.confidence * 100).toFixed(1)}%) — 仅记录，不播报`);
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
     * Check if in En Garde position - Using FIE Standards
     */
    isEnGardePosition() {
        const { frontKneeAngle, backKneeAngle, stanceWidth, torsoAngle } = this.metrics;
        const std = FIE_STANDARDS.enGarde.criteria;

        // Check front knee bent appropriately (FIE: 80-110°)
        const frontKneeOk = frontKneeAngle >= std.frontKneeAngle.min &&
            frontKneeAngle <= std.frontKneeAngle.max;

        // Check back knee (FIE: 80-110°)
        const backKneeOk = backKneeAngle >= std.backKneeAngle.min &&
            backKneeAngle <= std.backKneeAngle.max;

        // Check stance width ratio (FIE: 0.9-1.3 × shoulder width)
        const stanceOk = stanceWidth >= std.stanceWidthRatio.min &&
            stanceWidth <= std.stanceWidthRatio.max;

        // Check torso upright (FIE: max 12°)
        const torsoOk = torsoAngle <= std.torsoAngle.max;

        // Debug logging
        if (Math.random() < 0.02) {
            console.log(`[EnGarde Check] front=${frontKneeAngle.toFixed(1)}° (${frontKneeOk}), ` +
                `back=${backKneeAngle.toFixed(1)}° (${backKneeOk}), stance=${stanceWidth.toFixed(2)} (${stanceOk}), ` +
                `torso=${torsoAngle.toFixed(1)}° (${torsoOk})`);
        }

        return frontKneeOk && backKneeOk && stanceOk && torsoOk;
    }

    /**
     * Check if in lunge position - Using FIE Standards
     */
    isLungePosition() {
        const { frontKneeAngle, backKneeAngle, stanceWidth, armExtension, torsoAngle } = this.metrics;
        const std = FIE_STANDARDS.lunge.criteria;

        // FIE Standard: Front knee at 90° (85-100° range)
        const frontKneeOk = frontKneeAngle >= std.frontKneeAngle.min &&
            frontKneeAngle <= std.frontKneeAngle.max;

        // FIE Standard: Back leg nearly straight (160-180°)
        const backKneeOk = backKneeAngle >= std.backKneeAngle.min;

        // FIE Standard: Wide stance (1.5-2.5 × shoulder width)
        const stanceOk = stanceWidth >= std.stanceWidthRatio.min;

        // FIE Standard: Arm fully extended (90%+)
        const armOk = armExtension >= std.armExtension.min;

        // FIE Standard: Torso upright (max 15°)
        const torsoOk = torsoAngle <= std.torsoAngle.max;

        // Debug logging
        if (Math.random() < 0.02) {
            console.log(`[Lunge Check] front=${frontKneeAngle.toFixed(1)}° (${frontKneeOk}), ` +
                `back=${backKneeAngle.toFixed(1)}° (${backKneeOk}), arm=${(armExtension * 100).toFixed(0)}% (${armOk}), ` +
                `stance=${stanceWidth.toFixed(2)} (${stanceOk}), torso=${torsoAngle.toFixed(1)}° (${torsoOk})`);
        }

        // ALL criteria must be met for a valid lunge
        return frontKneeOk && backKneeOk && stanceOk && armOk && torsoOk;
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
