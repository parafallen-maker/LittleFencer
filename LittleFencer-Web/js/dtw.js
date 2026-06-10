/**
 * Dynamic Time Warping (DTW) Action Matcher
 * Compares real-time motion sequences against reference templates
 */

import { PoseLandmark } from './pose.js';
import { calculateAngle, calculateDistance } from './utils.js';

/**
 * Feature extractor for DTW
 * Extracts normalized, body-size-invariant features from landmarks
 */
export class FeatureExtractor {
    constructor() {
        // Key joint indices for feature extraction
        this.keyJoints = [
            PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER,
            PoseLandmark.LEFT_ELBOW, PoseLandmark.RIGHT_ELBOW,
            PoseLandmark.LEFT_WRIST, PoseLandmark.RIGHT_WRIST,
            PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP,
            PoseLandmark.LEFT_KNEE, PoseLandmark.RIGHT_KNEE,
            PoseLandmark.LEFT_ANKLE, PoseLandmark.RIGHT_ANKLE
        ];
    }

    /**
     * Extract features from a single frame
     * Returns body-size-normalized features
     */
    extractFrame(landmarks) {
        if (!landmarks || landmarks.length < 33) return null;

        // Reference distances for normalization
        const shoulderWidth = calculateDistance(
            landmarks[PoseLandmark.LEFT_SHOULDER],
            landmarks[PoseLandmark.RIGHT_SHOULDER]
        );
        const torsoHeight = calculateDistance(
            this.midpoint(landmarks[PoseLandmark.LEFT_SHOULDER], landmarks[PoseLandmark.RIGHT_SHOULDER]),
            this.midpoint(landmarks[PoseLandmark.LEFT_HIP], landmarks[PoseLandmark.RIGHT_HIP])
        );
        const bodyScale = (shoulderWidth + torsoHeight) / 2;

        if (bodyScale === 0) return null;

        // Extract normalized joint positions relative to hip center
        const hipCenter = this.midpoint(
            landmarks[PoseLandmark.LEFT_HIP],
            landmarks[PoseLandmark.RIGHT_HIP]
        );

        const features = [];

        // 1. Normalized joint positions (12 joints × 2 = 24 features)
        for (const idx of this.keyJoints) {
            const lm = landmarks[idx];
            features.push((lm.x - hipCenter.x) / bodyScale);
            features.push((lm.y - hipCenter.y) / bodyScale);
        }

        // 2. Key angles (4 features)
        const leftKneeAngle = calculateAngle(
            landmarks[PoseLandmark.LEFT_HIP],
            landmarks[PoseLandmark.LEFT_KNEE],
            landmarks[PoseLandmark.LEFT_ANKLE]
        ) / 180;  // Normalize to 0-1

        const rightKneeAngle = calculateAngle(
            landmarks[PoseLandmark.RIGHT_HIP],
            landmarks[PoseLandmark.RIGHT_KNEE],
            landmarks[PoseLandmark.RIGHT_ANKLE]
        ) / 180;

        const leftElbowAngle = calculateAngle(
            landmarks[PoseLandmark.LEFT_SHOULDER],
            landmarks[PoseLandmark.LEFT_ELBOW],
            landmarks[PoseLandmark.LEFT_WRIST]
        ) / 180;

        const rightElbowAngle = calculateAngle(
            landmarks[PoseLandmark.RIGHT_SHOULDER],
            landmarks[PoseLandmark.RIGHT_ELBOW],
            landmarks[PoseLandmark.RIGHT_WRIST]
        ) / 180;

        features.push(leftKneeAngle, rightKneeAngle, leftElbowAngle, rightElbowAngle);

        // 3. Arm extension ratios (2 features)
        const leftArmExtension = this.getArmExtension(landmarks, 'left');
        const rightArmExtension = this.getArmExtension(landmarks, 'right');
        features.push(leftArmExtension, rightArmExtension);

        // 4. Stance width ratio (1 feature)
        const ankleWidth = calculateDistance(
            landmarks[PoseLandmark.LEFT_ANKLE],
            landmarks[PoseLandmark.RIGHT_ANKLE]
        );
        const hipWidth = calculateDistance(
            landmarks[PoseLandmark.LEFT_HIP],
            landmarks[PoseLandmark.RIGHT_HIP]
        );
        features.push(hipWidth > 0 ? ankleWidth / hipWidth : 1);

        return features;  // Total: 31 features
    }

    /**
     * Extract features from a sequence of frames
     */
    extractSequence(frameHistory) {
        return frameHistory
            .map(frame => this.extractFrame(frame.landmarks))
            .filter(f => f !== null);
    }

    getArmExtension(landmarks, side) {
        const shoulderIdx = side === 'left' ? PoseLandmark.LEFT_SHOULDER : PoseLandmark.RIGHT_SHOULDER;
        const elbowIdx = side === 'left' ? PoseLandmark.LEFT_ELBOW : PoseLandmark.RIGHT_ELBOW;
        const wristIdx = side === 'left' ? PoseLandmark.LEFT_WRIST : PoseLandmark.RIGHT_WRIST;

        const shoulderToWrist = calculateDistance(landmarks[shoulderIdx], landmarks[wristIdx]);
        const shoulderToElbow = calculateDistance(landmarks[shoulderIdx], landmarks[elbowIdx]);
        const elbowToWrist = calculateDistance(landmarks[elbowIdx], landmarks[wristIdx]);
        const maxLength = shoulderToElbow + elbowToWrist;

        return maxLength > 0 ? shoulderToWrist / maxLength : 0;
    }

    midpoint(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
}

/**
 * DTW Algorithm implementation
 */
export class DTW {
    /**
     * Calculate DTW distance between two sequences
     * @param {number[][]} seq1 - First sequence (array of feature vectors)
     * @param {number[][]} seq2 - Second sequence (array of feature vectors)
     * @returns {number} Normalized DTW distance
     */
    static distance(seq1, seq2) {
        if (seq1.length === 0 || seq2.length === 0) return Infinity;

        const n = seq1.length;
        const m = seq2.length;

        // DTW matrix
        const dtw = Array(n + 1).fill(null).map(() =>
            Array(m + 1).fill(Infinity)
        );
        dtw[0][0] = 0;

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                const cost = this.euclidean(seq1[i - 1], seq2[j - 1]);
                dtw[i][j] = cost + Math.min(
                    dtw[i - 1][j],      // Insertion
                    dtw[i][j - 1],      // Deletion
                    dtw[i - 1][j - 1]   // Match
                );
            }
        }

        // Normalize by path length
        return dtw[n][m] / Math.max(n, m);
    }

    /**
     * Euclidean distance between two feature vectors
     */
    static euclidean(v1, v2) {
        if (v1.length !== v2.length) return Infinity;

        let sum = 0;
        for (let i = 0; i < v1.length; i++) {
            const diff = v1[i] - v2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }
}

/**
 * Action templates - reference motion sequences
 * These should be recorded from expert fencers
 */
export const ActionTemplates = {
    // Lunge template (simplified - should be replaced with real data)
    lunge: {
        name: 'lunge',
        displayName: '弓步',
        // Feature sequence representing ideal lunge motion
        // Format: array of feature vectors, each frame ~33ms apart
        sequence: generateLungeTemplate(),
        threshold: 0.20,  // STRICTER: Reduced from 0.35 for better accuracy
        minFrames: 10,    // STRICTER: Need more frames for valid detection
        maxFrames: 25
    },

    advance: {
        name: 'advance',
        displayName: '前进步',
        sequence: generateAdvanceTemplate(),
        threshold: 0.18,  // STRICTER: Reduced from 0.30
        minFrames: 8,     // STRICTER: Need more frames
        maxFrames: 20
    },

    retreat: {
        name: 'retreat',
        displayName: '后退步',
        sequence: generateRetreatTemplate(),
        threshold: 0.18,  // STRICTER: Reduced from 0.30
        minFrames: 8,     // STRICTER: Need more frames
        maxFrames: 20
    }
};

/**
 * Generate lunge template based on FIE Standards
 * FIE: Front knee 90°, back leg straight 160-175°, arm extended, torso upright
 */
function generateLungeTemplate() {
    const frames = [];
    const numFrames = 18;  // More frames for accurate matching

    for (let i = 0; i < numFrames; i++) {
        const t = i / (numFrames - 1);  // 0 to 1 progress

        // FIE Standard: Arm extends FIRST (leads the movement)
        const armExtension = Math.min(1, t * 1.8);  // Arm reaches full extension at t=0.55

        // FIE Standard: Leg follows arm
        const legProgress = Math.max(0, (t - 0.15) * 1.18);  // Starts after arm

        // FIE Standard: Front knee reaches 90° (normalized to 0.5 = 90°)
        // Start from en garde ~100° (0.55) to lunge 90° (0.5)
        const frontKneeAngle = 0.55 - legProgress * 0.05;  // Ends at 0.5 (90°)

        // FIE Standard: Back leg straightens to 160-175° (normalized ~0.9-0.97)
        const backKneeAngle = 0.55 + legProgress * 0.42;  // Ends at ~0.97 (175°)

        // FIE Standard: Stance widens significantly (1.5-2.5x shoulder width)
        const stanceWidth = 1.0 + legProgress * 1.2;  // Ends at 2.2

        // FIE Standard: Torso stays upright (max 15° lean)
        const torsoLean = legProgress * 0.08;  // Slight forward lean

        // Create complete feature vector (31 features)
        const features = new Array(31).fill(0);

        // Joint positions (normalized, relative to hip center)
        // Indices 0-23: 12 joints × 2 (x, y)

        // Shoulders (indices 0-3)
        features[0] = -0.15;  // Left shoulder X
        features[1] = -0.4;   // Left shoulder Y
        features[2] = 0.15;   // Right shoulder X
        features[3] = -0.4;   // Right shoulder Y (slightly lower in lunge)

        // Wrists (indices 8-11) - weapon arm extended
        features[8] = -0.1;   // Left wrist X (guard hand back)
        features[9] = 0.1 + legProgress * 0.3;  // Left wrist Y (drops down)
        features[10] = 0.5 + armExtension * 0.4;  // Right wrist X (extends forward)
        features[11] = -0.35 - armExtension * 0.05;  // Right wrist Y (at shoulder height)

        // Hips (indices 12-15)
        features[12] = -0.1;   // Left hip X
        features[13] = 0;      // Left hip Y
        features[14] = 0.1;    // Right hip X
        features[15] = 0;      // Right hip Y

        // Knees (indices 16-19)
        features[16] = -0.15 - legProgress * 0.3;  // Left knee X (back leg extends)
        features[17] = 0.35;   // Left knee Y
        features[18] = 0.2 + legProgress * 0.4;    // Right knee X (front knee forward)
        features[19] = 0.35 + legProgress * 0.1;   // Right knee Y

        // Ankles (indices 20-23)
        features[20] = -0.2 - legProgress * 0.2;   // Left ankle X (back foot)
        features[21] = 0.7;    // Left ankle Y
        features[22] = 0.3 + legProgress * 0.6;    // Right ankle X (front foot lunges)
        features[23] = 0.7;    // Right ankle Y

        // Key angles (indices 24-27)
        features[24] = frontKneeAngle;  // Left knee angle (normalized)
        features[25] = backKneeAngle;   // Right knee angle (back leg straight)
        features[26] = 0.5 + armExtension * 0.45;  // Left elbow (guard arm bent)
        features[27] = 0.5 + armExtension * 0.48;  // Right elbow (weapon arm straight)

        // Arm extension ratios (indices 28-29)
        features[28] = 0.3 + legProgress * 0.2;    // Left arm (guard)
        features[29] = 0.4 + armExtension * 0.58;  // Right arm (extends to ~0.98)

        // Stance width ratio (index 30)
        features[30] = stanceWidth;

        frames.push(features);
    }

    return frames;
}

/**
 * Generate advance template based on FIE Standards
 * Front foot moves first, back foot follows, knees stay bent, horizontal motion
 */
function generateAdvanceTemplate() {
    const frames = [];
    const numFrames = 12;

    for (let i = 0; i < numFrames; i++) {
        const t = i / (numFrames - 1);

        // Front foot moves first (FIE standard)
        const frontFootProgress = Math.min(1, t * 2.2);
        // Back foot follows with delay
        const backFootProgress = Math.max(0, (t - 0.25) * 1.35);

        // Maintain en garde knee angles throughout (80-110°)
        const kneeAngle = 0.53 + Math.sin(t * Math.PI) * 0.02;  // Slight variation

        const features = new Array(31).fill(0);

        // Starting from en garde position, moving forward
        features[0] = -0.15; features[1] = -0.4;  // Left shoulder
        features[2] = 0.15; features[3] = -0.4;  // Right shoulder

        // Hips move forward together
        features[12] = -0.1 + frontFootProgress * 0.05;
        features[13] = 0;
        features[14] = 0.1 + frontFootProgress * 0.05;
        features[15] = 0;

        // Ankles: front foot leads, back foot follows
        features[20] = -0.2 + backFootProgress * 0.08;   // Back ankle
        features[21] = 0.7;
        features[22] = 0.25 + frontFootProgress * 0.1;   // Front ankle
        features[23] = 0.7;

        // Maintain bent knees
        features[24] = kneeAngle;
        features[25] = kneeAngle;

        // Arms maintain guard position
        features[28] = 0.4;
        features[29] = 0.5;

        // Stance width stays constant
        features[30] = 1.1;

        frames.push(features);
    }

    return frames;
}

/**
 * Generate retreat template based on FIE Standards
 * Back foot moves first, front foot follows, maintain stance
 */
function generateRetreatTemplate() {
    const frames = [];
    const numFrames = 12;

    for (let i = 0; i < numFrames; i++) {
        const t = i / (numFrames - 1);

        // Back foot moves first (FIE standard for retreat)
        const backFootProgress = Math.min(1, t * 2.2);
        // Front foot follows
        const frontFootProgress = Math.max(0, (t - 0.25) * 1.35);

        const kneeAngle = 0.53 + Math.sin(t * Math.PI) * 0.02;

        const features = new Array(31).fill(0);

        features[0] = -0.15; features[1] = -0.4;
        features[2] = 0.15; features[3] = -0.4;

        // Hips move backward
        features[12] = -0.1 - backFootProgress * 0.05;
        features[13] = 0;
        features[14] = 0.1 - backFootProgress * 0.05;
        features[15] = 0;

        // Back foot moves first, front follows
        features[20] = -0.2 - backFootProgress * 0.1;    // Back ankle retreats
        features[21] = 0.7;
        features[22] = 0.25 - frontFootProgress * 0.08;  // Front ankle follows
        features[23] = 0.7;

        features[24] = kneeAngle;
        features[25] = kneeAngle;
        features[28] = 0.4;
        features[29] = 0.5;
        features[30] = 1.1;

        frames.push(features);
    }

    return frames;
}

/**
 * DTW Action Matcher
 * Main class for matching real-time motion against templates
 */
export class DTWActionMatcher {
    constructor() {
        this.featureExtractor = new FeatureExtractor();
        this.templates = ActionTemplates;
        this.frameBuffer = [];
        this.maxBufferSize = 30;  // ~1 second at 30fps
        this.lastMatchTime = 0;
        this.matchCooldown = 1500;  // Minimum ms between matches

        // STRICTER MATCHING: Minimum confidence to accept a match
        this.minConfidence = 0.6;  // Must be at least 60% confident
        this.strictMode = true;    // Enable strict matching mode
    }

    /**
     * Add a frame and check for action matches
     * @param {Object} frame - Frame with landmarks
     * @returns {Object|null} Match result or null
     */
    addFrame(frame) {
        // Add to buffer
        this.frameBuffer.push(frame);
        if (this.frameBuffer.length > this.maxBufferSize) {
            this.frameBuffer.shift();
        }

        // Check cooldown
        const now = Date.now();
        if (now - this.lastMatchTime < this.matchCooldown) {
            return null;
        }

        // Need minimum frames
        if (this.frameBuffer.length < 6) {
            return null;
        }

        // Extract features from recent frames
        const sequence = this.featureExtractor.extractSequence(this.frameBuffer);
        if (sequence.length < 6) {
            return null;
        }

        // Try matching against each template
        let bestMatch = null;
        let bestScore = Infinity;

        if (Object.keys(this.templates).length === 0) {
            if (!this._warnedEmptyTemplates) {
                console.warn('[DTW] 模板库为空，DTW 匹配被跳过 — 请用模板录制工具录入标准动作');
                this._warnedEmptyTemplates = true;
            }
            return null;
        }

        for (const [actionName, template] of Object.entries(this.templates)) {
            // Check frame count bounds - STRICTER check
            if (sequence.length < template.minFrames) {
                continue;
            }

            // Use sliding window for longer sequences
            const windowSize = Math.min(sequence.length, template.maxFrames);
            const recentSequence = sequence.slice(-windowSize);

            const distance = DTW.distance(recentSequence, template.sequence);

            // Calculate confidence (higher = better match)
            const confidence = Math.max(0, 1 - (distance / template.threshold));

            // STRICTER: Apply strict mode multiplier for harder matching
            const effectiveThreshold = this.strictMode
                ? template.threshold * 0.85  // 15% stricter in strict mode
                : template.threshold;

            // Debug logging for tuning
            if (distance < template.threshold * 1.5) {
                console.log(`[DTW Debug] ${actionName}: dist=${distance.toFixed(3)}, ` +
                    `threshold=${effectiveThreshold.toFixed(3)}, conf=${(confidence * 100).toFixed(1)}%`);
            }

            // STRICTER matching criteria:
            // 1. Distance must be below effective threshold
            // 2. Confidence must meet minimum requirement
            // 3. Must be better than current best
            if (distance < effectiveThreshold &&
                confidence >= this.minConfidence &&
                distance < bestScore) {
                bestScore = distance;
                bestMatch = {
                    action: actionName,
                    displayName: template.displayName,
                    confidence: confidence,
                    distance: distance
                };
            }
        }

        if (bestMatch) {
            console.log(`[DTW] ✓ 匹配成功: ${bestMatch.displayName} ` +
                `(置信度: ${(bestMatch.confidence * 100).toFixed(1)}%, 距离: ${bestMatch.distance.toFixed(3)})`);
            this.lastMatchTime = now;
            this.frameBuffer = [];  // Clear buffer after match
            return bestMatch;
        }

        return null;
    }

    /**
     * Reset matcher state
     */
    reset() {
        this.frameBuffer = [];
        this.lastMatchTime = 0;
    }

    /**
     * Add a custom template from recorded motion
     */
    addTemplate(name, displayName, frames, threshold = 0.35) {
        const sequence = this.featureExtractor.extractSequence(frames);
        this.templates[name] = {
            name,
            displayName,
            sequence,
            threshold,
            minFrames: Math.max(6, Math.floor(sequence.length * 0.5)),
            maxFrames: Math.ceil(sequence.length * 1.5)
        };
    }

    /**
     * Import a template from JSON (recorded by TemplateRecorder)
     * @param {Object|string} templateJson - Template object or JSON string
     */
    importTemplate(templateJson) {
        const template = typeof templateJson === 'string'
            ? JSON.parse(templateJson)
            : templateJson;

        // Validate format
        if (!template.name || !template.frames || template.frames.length < 5) {
            console.error('[DTW] Invalid template format');
            return false;
        }

        // Extract feature sequence from frames
        const sequence = template.frames.map(f => f.features);

        // Register template
        this.templates[template.name] = {
            name: template.name,
            displayName: template.displayName || template.name,
            sequence: sequence,
            threshold: template.threshold || 0.35,
            minFrames: Math.max(5, Math.floor(sequence.length * 0.5)),
            maxFrames: Math.ceil(sequence.length * 1.5),
            metadata: template.metadata
        };

        console.log(`[DTW] ✅ 导入模板: ${template.displayName} (${sequence.length}帧, 阈值=${template.threshold})`);
        return true;
    }

    /**
     * Import multiple templates
     * @param {Array} templates - Array of template objects
     */
    importTemplates(templates) {
        let imported = 0;
        for (const t of templates) {
            if (this.importTemplate(t)) {
                imported++;
            }
        }
        console.log(`[DTW] 导入完成: ${imported}/${templates.length} 个模板`);
        return imported;
    }

    /**
     * Import template from File object (for file input)
     * @param {File} file - File object from input element
     */
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const success = this.importTemplate(e.target.result);
                    resolve(success);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Get list of loaded templates
     */
    getLoadedTemplates() {
        return Object.entries(this.templates).map(([name, t]) => ({
            name: name,
            displayName: t.displayName,
            frameCount: t.sequence.length,
            threshold: t.threshold,
            isExpert: t.metadata?.quality === 'expert'
        }));
    }

    /**
     * Remove a template
     */
    removeTemplate(name) {
        if (this.templates[name]) {
            delete this.templates[name];
            console.log(`[DTW] 移除模板: ${name}`);
            return true;
        }
        return false;
    }

    /**
     * Clear all custom templates, keep only built-in
     */
    resetToDefaults() {
        this.templates = { ...ActionTemplates };
        console.log('[DTW] 已重置为默认模板');
    }
}

