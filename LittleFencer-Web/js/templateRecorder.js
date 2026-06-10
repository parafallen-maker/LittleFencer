/**
 * Template Recorder
 * Records professional athlete movements for DTW template creation
 */

import { FeatureExtractor } from './dtw.js';

/**
 * Action display names mapping
 */
const ACTION_DISPLAY_NAMES = {
    lunge: '弓步',
    advance: '前进步',
    retreat: '后退步',
    advance_lunge: '前进弓步',
    balestra_lunge: '跳步弓步',
    flunge: '飞弓步',
    parry_riposte: '格挡反攻'
};

/**
 * Template Recorder class
 * Used in "Coach Mode" to record expert movements
 */
export class TemplateRecorder {
    constructor() {
        this.featureExtractor = new FeatureExtractor();
        this.isRecording = false;
        this.frames = [];
        this.rawLandmarks = [];  // Keep raw data for debugging
        this.actionName = '';
        this.startTime = 0;
        this.recordedBy = '';

        // Callbacks
        this.onFrameRecorded = null;
        this.onRecordingComplete = null;
    }

    /**
     * Start recording a new action
     * @param {string} actionName - Action type (e.g., 'lunge', 'advance')
     * @param {string} recordedBy - Name of the person recording (optional)
     */
    startRecording(actionName, recordedBy = 'Coach') {
        if (this.isRecording) {
            console.warn('[Recorder] Already recording, stop first');
            return false;
        }

        this.actionName = actionName;
        this.recordedBy = recordedBy;
        this.frames = [];
        this.rawLandmarks = [];
        this.startTime = Date.now();
        this.isRecording = true;

        console.log(`[Recorder] 🔴 开始录制: ${this.getDisplayName(actionName)}`);
        return true;
    }

    /**
     * Add a frame during recording
     * @param {Object[]} landmarks - 33-point pose landmarks
     */
    addFrame(landmarks) {
        if (!this.isRecording) return;

        const features = this.featureExtractor.extractFrame(landmarks);
        if (!features) return;

        const timestamp = Date.now() - this.startTime;

        this.frames.push({
            timestamp: timestamp,
            features: features
        });

        // Keep raw landmarks for debugging (optional)
        this.rawLandmarks.push({
            timestamp: timestamp,
            landmarks: landmarks.map(lm => ({
                x: lm.x,
                y: lm.y,
                z: lm.z || 0,
                visibility: lm.visibility
            }))
        });

        if (this.onFrameRecorded) {
            this.onFrameRecorded(this.frames.length, timestamp);
        }
    }

    /**
     * Stop recording and export template
     * @returns {Object} Template object
     */
    stopRecording() {
        if (!this.isRecording) {
            console.warn('[Recorder] Not recording');
            return null;
        }

        this.isRecording = false;
        const template = this.exportTemplate();

        console.log(`[Recorder] ⏹️ 录制完成: ${this.frames.length} 帧, ${template.metadata.duration}ms`);

        if (this.onRecordingComplete) {
            this.onRecordingComplete(template);
        }

        return template;
    }

    /**
     * Cancel recording without saving
     */
    cancelRecording() {
        this.isRecording = false;
        this.frames = [];
        this.rawLandmarks = [];
        console.log('[Recorder] ❌ 录制已取消');
    }

    /**
     * Export recorded frames as template object
     */
    exportTemplate() {
        const duration = this.frames.length > 0
            ? this.frames[this.frames.length - 1].timestamp
            : 0;

        return {
            name: this.actionName,
            displayName: this.getDisplayName(this.actionName),
            version: '1.0',
            recordedBy: this.recordedBy,
            recordedAt: new Date().toISOString(),
            sampleRate: Math.round(this.frames.length / (duration / 1000)) || 30,
            threshold: this.getDefaultThreshold(this.actionName),
            frames: this.frames,
            metadata: {
                duration: duration,
                frameCount: this.frames.length,
                quality: 'expert',
                featureDimension: 31
            }
        };
    }

    /**
     * Download template as JSON file
     */
    downloadTemplate() {
        const template = this.exportTemplate();
        const json = JSON.stringify(template, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `template_${this.actionName}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[Recorder] 📥 模板已下载: ${a.download}`);
    }

    /**
     * Download raw landmarks for debugging
     */
    downloadRawLandmarks() {
        const data = {
            actionName: this.actionName,
            recordedAt: new Date().toISOString(),
            frames: this.rawLandmarks
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `raw_landmarks_${this.actionName}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Get display name for action
     */
    getDisplayName(actionName) {
        return ACTION_DISPLAY_NAMES[actionName] || actionName;
    }

    /**
     * Get default DTW threshold for action type
     */
    getDefaultThreshold(actionName) {
        const thresholds = {
            lunge: 0.35,
            advance: 0.30,
            retreat: 0.30,
            advance_lunge: 0.40,
            balestra_lunge: 0.40,
            flunge: 0.40,
            parry_riposte: 0.35
        };
        return thresholds[actionName] || 0.35;
    }

    /**
     * Get recording status
     */
    getStatus() {
        return {
            isRecording: this.isRecording,
            actionName: this.actionName,
            frameCount: this.frames.length,
            duration: this.frames.length > 0
                ? this.frames[this.frames.length - 1].timestamp
                : 0
        };
    }
}

/**
 * Template Manager
 * Manages loading, saving, and organizing templates
 */
export class TemplateManager {
    constructor() {
        this.templates = {};
        this.storageKey = 'littlefencer_templates';
    }

    /**
     * Import a template from JSON
     */
    importTemplate(templateJson) {
        const template = typeof templateJson === 'string'
            ? JSON.parse(templateJson)
            : templateJson;

        // Validate
        if (!template.name || !template.frames || template.frames.length < 5) {
            throw new Error('无效的模板格式: 缺少必要字段或帧数不足');
        }

        this.templates[template.name] = template;
        console.log(`[TemplateManager] 导入模板: ${template.displayName} (${template.frames.length}帧)`);

        return template;
    }

    /**
     * Import multiple templates
     */
    importTemplates(templates) {
        const results = [];
        for (const t of templates) {
            try {
                results.push(this.importTemplate(t));
            } catch (e) {
                console.error(`[TemplateManager] 导入失败:`, e);
            }
        }
        return results;
    }

    /**
     * Get template by name
     */
    getTemplate(name) {
        return this.templates[name];
    }

    /**
     * Get all templates
     */
    getAllTemplates() {
        return Object.values(this.templates);
    }

    /**
     * Delete a template
     */
    deleteTemplate(name) {
        delete this.templates[name];
    }

    /**
     * Save templates to localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.templates));
            console.log('[TemplateManager] 模板已保存到本地存储');
        } catch (e) {
            console.error('[TemplateManager] 保存失败:', e);
        }
    }

    /**
     * Load templates from localStorage
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                this.templates = JSON.parse(data);
                console.log(`[TemplateManager] 从本地存储加载 ${Object.keys(this.templates).length} 个模板`);
            }
        } catch (e) {
            console.error('[TemplateManager] 加载失败:', e);
        }
    }

    /**
     * Export all templates as JSON
     */
    exportAll() {
        return JSON.stringify(Object.values(this.templates), null, 2);
    }

    /**
     * Import from file input
     */
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const template = this.importTemplate(e.target.result);
                    resolve(template);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}
