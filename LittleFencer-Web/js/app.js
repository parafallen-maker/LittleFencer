/**
 * LittleFencer Web App - Main Entry Point
 * AI-Powered Fencing Training Assistant
 * With iOS/Safari compatibility
 */

import { CameraManager } from './camera.js';
import { PoseDetector } from './pose.js';
import { FencingStateEngine } from './engine.js';
import { AudioFeedbackManager } from './feedback.js';
import { VideoRecorder } from './recorder.js';
import { UIManager } from './ui.js';
import { SkeletonRenderer } from './skeleton.js';
import { platform, requestWakeLock } from './platform.js';
import { videoStorage } from './storage.js';
import { safeJsonParse } from './utils.js';

class LittleFencerApp {
    constructor() {
        // Core modules
        this.camera = null;
        this.poseDetector = null;
        this.engine = null;
        this.feedback = null;
        this.recorder = null;
        this.ui = null;
        this.skeleton = null;
        
        // State
        this.isRunning = false;
        this.isInitialized = false;
        this.frameCount = 0;
        this.lastFpsTime = 0;
        this.fps = 0;
        this.sessionStartTime = null;
        this.wakeLock = null;
        
        // Stats
        this.stats = {
            actionCount: 0,
            perfectCount: 0,
            comboCount: 0,
            maxCombo: 0
        };
        
        // Settings
        this.settings = {
            voiceEnabled: true,
            soundEnabled: true,
            skeletonEnabled: true,
            autoRecordEnabled: true
        };
        
        this.loadSettings();
        
        // Log platform info
        console.log('[App] Platform:', {
            iOS: platform.isIOS,
            Safari: platform.isSafari,
            Mobile: platform.isMobile,
            PWA: platform.isPWA
        });
    }
    
    /**
     * Initialize the app
     */
    async init() {
        // Re-entry guard: a second init() would create duplicate
        // camera/pose/engine instances and leak the old ones.
        if (this.isInitialized || this.isInitializing) {
            console.warn('[App] init() called twice, ignoring');
            return;
        }
        this.isInitializing = true;

        console.log('[App] Initializing LittleFencer...');

        try {
            // Update loading progress
            this.updateLoadingProgress(10, '初始化界面...');
            
            // Initialize UI
            this.ui = new UIManager(this);
            this.ui.init();
            
            this.updateLoadingProgress(20, '初始化摄像头...');
            
            // Initialize camera
            this.camera = new CameraManager();
            await this.camera.init();
            
            this.updateLoadingProgress(40, '加载 AI 姿态模型...');
            
            // Initialize pose detector
            this.poseDetector = new PoseDetector();
            await this.poseDetector.init((progress) => {
                this.updateLoadingProgress(40 + progress * 0.4, '加载 AI 姿态模型...');
            });
            
            this.updateLoadingProgress(80, '初始化状态引擎...');
            
            // Initialize fencing state engine
            this.engine = new FencingStateEngine();
            
            // Initialize feedback manager
            this.feedback = new AudioFeedbackManager();
            await this.feedback.init();
            
            this.updateLoadingProgress(90, '初始化录像模块...');
            
            // Initialize video recorder
            this.recorder = new VideoRecorder();
            
            // Initialize skeleton renderer
            this.skeleton = new SkeletonRenderer('skeleton-canvas');
            
            // Initialize video storage (IndexedDB)
            await videoStorage.init();
            console.log('[App] Video storage initialized');
            
            this.updateLoadingProgress(100, '准备就绪！');
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Register service worker
            this.registerServiceWorker();
            
            // Mark as initialized
            this.isInitialized = true;
            
            // Hide splash screen after a short delay
            setTimeout(() => {
                this.hideSplashScreen();
            }, 500);
            
            console.log('[App] Initialization complete!');
            
        } catch (error) {
            console.error('[App] Initialization failed:', error);
            this.updateLoadingProgress(0, `初始化失败: ${error.message}`);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }
    
    /**
     * Update loading progress
     */
    updateLoadingProgress(percent, text) {
        const progressBar = document.getElementById('loading-progress');
        const loadingText = document.getElementById('loading-text');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        if (loadingText) {
            loadingText.textContent = text;
        }
    }
    
    /**
     * Hide splash screen and show main app
     */
    hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        const app = document.getElementById('app');
        
        splash.classList.add('fade-out');
        
        setTimeout(() => {
            splash.classList.add('hidden');
            app.classList.remove('hidden');
        }, 500);
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Engine callbacks
        this.engine.onStateChange = (state, data) => {
            this.handleStateChange(state, data);
        };
        
        this.engine.onActionDetected = (action, quality, feedback) => {
            this.handleActionDetected(action, quality, feedback);
        };
        
        this.engine.onFeedback = (message, type) => {
            this.handleFeedback(message, type);
        };
        
        // Visibility change callback
        this.engine.onVisibilityChange = (visibilityInfo) => {
            this.handleVisibilityChange(visibilityInfo);
        };
        
        // Pose detector callback
        this.poseDetector.onResults = (results) => {
            this.handlePoseResults(results);
        };
    }
    
    /**
     * Register service worker for PWA
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('[App] Service Worker registered:', registration.scope);
            } catch (error) {
                console.log('[App] Service Worker registration failed:', error);
            }
        }
    }
    
    /**
     * Start training session
     */
    async start() {
        if (this.isRunning) return;
        
        console.log('[App] Starting training session...');
        
        // Request wake lock to prevent screen from dimming
        this.wakeLock = await requestWakeLock();
        
        // Start camera
        await this.camera.start();
        
        // Connect camera to pose detector
        this.poseDetector.setVideoElement(this.camera.videoElement);
        
        // Start pose detection
        this.poseDetector.start();
        
        // Update state
        this.isRunning = true;
        this.sessionStartTime = Date.now();
        this.resetStats();
        
        // Update UI
        this.ui.setTrainingState(true);
        this.ui.showFeedback('开始训练！摆出 En Garde 姿势', 'success');
        
        // Speak welcome
        if (this.settings.voiceEnabled) {
            this.feedback.speak('开始训练，请摆出预备姿势');
        }
        
        // Start FPS counter
        this.startFpsCounter();
        
        // Start duration timer
        this.startDurationTimer();
    }
    
    /**
     * Stop training session
     */
    stop() {
        if (!this.isRunning) return;
        
        console.log('[App] Stopping training session...');
        
        // Stop pose detection
        this.poseDetector.stop();
        
        // Stop recording if active
        if (this.recorder.isRecording) {
            this.recorder.stop();
        }
        
        // Release wake lock
        if (this.wakeLock) {
            this.wakeLock.release().catch(() => {});
            this.wakeLock = null;
        }
        
        // Update state
        this.isRunning = false;
        
        // Reset engine
        this.engine.reset();
        
        // Update UI
        this.ui.setTrainingState(false);
        this.skeleton.clear();
        
        // Stop timers
        this.stopFpsCounter();
        this.stopDurationTimer();
        
        // Show session summary
        this.showSessionSummary();
    }
    
    /**
     * Toggle training state
     */
    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }
    
    /**
     * Handle pose detection results
     */
    handlePoseResults(results) {
        if (!this.isRunning) return;

        // Update FPS
        this.frameCount++;

        // A single bad frame must not take down the whole loop — swallow
        // per-frame errors, surface once, and keep processing.
        try {
            if (results.poseLandmarks) {
                this.engine.processPose(results.poseLandmarks, results.poseWorldLandmarks);

                if (this.settings.skeletonEnabled) {
                    const quality = this.engine.getCurrentQuality();
                    this.skeleton.render(results.poseLandmarks, quality);
                }
            } else {
                // No pose detected
                this.skeleton.clear();
                this.engine.handleNoPose();
            }
            this.frameErrorCount = 0;
        } catch (error) {
            this.frameErrorCount = (this.frameErrorCount || 0) + 1;
            if (this.frameErrorCount === 1) {
                console.error('[App] Frame processing error:', error);
                this.ui.showFeedback('检测出现异常，已自动恢复', 'error');
            } else if (this.frameErrorCount >= 90) {
                // ~3s of consecutive failures at 30fps: something is
                // structurally broken, stop instead of spinning.
                console.error('[App] Persistent frame errors, stopping session');
                this.ui.showFeedback('检测持续异常，请刷新页面', 'error');
                this.stop();
            }
        }
    }
    
    /**
     * Handle visibility change from engine
     */
    handleVisibilityChange(visibilityInfo) {
        this.ui.updateVisibility(visibilityInfo);
    }
    
    /**
     * Handle state change from engine
     */
    handleStateChange(state, data) {
        console.log('[App] State changed:', state, data);
        
        // Update UI status
        this.ui.setStatus(state, data);
        
        // Handle specific states
        switch (state) {
            case 'WAITING_FULL_BODY':
                // Show position guide
                this.ui.showPositionGuide(true);
                if (this.settings.voiceEnabled) {
                    this.feedback.speak('请后退，确保全身入镜');
                }
                break;
                
            case 'IDLE':
                // Hide position guide when full body detected
                this.ui.showPositionGuide(false);
                break;
                
            case 'EN_GARDE':
                this.ui.showPositionGuide(false);
                if (this.settings.voiceEnabled) {
                    this.feedback.speak('好！保持姿势');
                }
                break;
                
            case 'LUNGING':
                // Auto-start recording on action
                if (this.settings.autoRecordEnabled && !this.recorder.isRecording) {
                    this.startRecording();
                }
                break;
                
            case 'RECOVERY':
                // Stop recording after action
                if (this.settings.autoRecordEnabled && this.recorder.isRecording) {
                    setTimeout(() => {
                        this.stopRecording();
                    }, 1000);
                }
                break;
        }
    }
    
    /**
     * Handle action detected from engine
     */
    handleActionDetected(action, quality, feedbackText) {
        console.log('[App] Action detected:', action, quality, feedbackText);
        
        // Update stats
        this.stats.actionCount++;
        
        if (quality === 'PERFECT') {
            this.stats.perfectCount++;
            this.stats.comboCount++;
            this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.comboCount);
        } else {
            this.stats.comboCount = 0;
        }
        
        // Update UI
        this.ui.showAction(action, quality);
        this.ui.updateStats(this.stats);
        this.ui.setCombo(this.stats.comboCount);
        
        // Check for badges
        this.ui.checkBadges(this.stats);
        
        // Play sound
        if (this.settings.soundEnabled) {
            this.feedback.playActionSound(quality);
        }
        
        // Speak feedback
        if (this.settings.voiceEnabled && feedbackText) {
            this.feedback.speak(feedbackText);
        }
    }
    
    /**
     * Handle feedback message from engine
     */
    handleFeedback(message, type) {
        // Show visual feedback
        this.ui.showFeedback(message, type);
        
        // Speak correction feedback
        if (this.settings.voiceEnabled && type === 'error') {
            this.feedback.speak(message);
        }
    }
    
    /**
     * Start video recording
     */
    async startRecording() {
        if (this.recorder.isRecording) return;
        
        try {
            const stream = this.camera.getStream();
            const started = await this.recorder.start(stream);
            if (started !== false) {
                this.ui.setRecordingState(true);
            }
        } catch (error) {
            console.error('[App] Failed to start recording:', error);
        }
    }
    
    /**
     * Stop video recording
     */
    async stopRecording() {
        if (!this.recorder.isRecording) return;
        
        try {
            const blob = await this.recorder.stop();
            this.ui.setRecordingState(false);
            
            // Save to gallery
            if (blob) {
                this.saveRecording(blob);
            }
        } catch (error) {
            console.error('[App] Failed to stop recording:', error);
        }
    }
    
    /**
     * Toggle recording
     */
    toggleRecording() {
        if (this.recorder.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    /**
     * Save recording to gallery
     */
    async saveRecording(blob) {
        const quality = this.stats.comboCount >= 3 ? 'starred' : 'normal';
        const video = {
            blob: blob,
            quality: quality,
            duration: this.recorder.getDuration(),
            actionCount: this.stats.actionCount,
            perfectCount: this.stats.perfectCount
        };
        
        // Save to IndexedDB
        try {
            const savedVideo = await videoStorage.saveVideo(video);
            console.log('[App] Recording saved to IndexedDB:', savedVideo.id);
            this.ui.showFeedback('视频已保存', 'success');
        } catch (error) {
            console.error('[App] Failed to save recording:', error);
            this.ui.showFeedback('保存失败', 'error');
        }
    }
    
    /**
     * Get gallery videos (async)
     */
    async getGalleryVideos(filter = 'all') {
        try {
            return await videoStorage.getVideos(filter);
        } catch (error) {
            console.error('[App] Failed to get videos:', error);
            return [];
        }
    }
    
    /**
     * Get video by ID
     */
    async getVideoById(id) {
        try {
            return await videoStorage.getVideo(id);
        } catch (error) {
            console.error('[App] Failed to get video:', error);
            return null;
        }
    }
    
    /**
     * Toggle video star status
     */
    async toggleVideoStar(id) {
        try {
            const video = await videoStorage.toggleStar(id);
            return video;
        } catch (error) {
            console.error('[App] Failed to toggle star:', error);
            return null;
        }
    }
    
    /**
     * Delete video
     */
    async deleteVideo(id) {
        try {
            await videoStorage.deleteVideo(id);
            console.log('[App] Video deleted:', id);
            return true;
        } catch (error) {
            console.error('[App] Failed to delete video:', error);
            return false;
        }
    }
    
    /**
     * Share video
     */
    async shareVideo(id) {
        try {
            const shareData = await videoStorage.exportForShare(id);
            
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareData.file] })) {
                await navigator.share({
                    title: 'LittleFencer 训练视频',
                    text: `我的佩剑训练：${shareData.stats.actionCount}个动作，${shareData.stats.perfectCount}个完美！`,
                    files: [shareData.file]
                });
                this.ui.showFeedback('分享成功', 'success');
                return true;
            } else {
                // Fallback: download the file
                const url = URL.createObjectURL(shareData.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = shareData.filename;
                a.click();
                URL.revokeObjectURL(url);
                this.ui.showFeedback('视频已下载', 'success');
                return true;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[App] Failed to share video:', error);
                this.ui.showFeedback('分享失败', 'error');
            }
            return false;
        }
    }
    
    /**
     * Get gallery stats
     */
    async getGalleryStats() {
        try {
            const total = await videoStorage.getVideoCount();
            const starred = await videoStorage.getStarredCount();
            return { total, starred };
        } catch (error) {
            console.error('[App] Failed to get stats:', error);
            return { total: 0, starred: 0 };
        }
    }
    
    /**
     * Flip camera (front/back)
     */
    async flipCamera() {
        await this.camera.flip();
    }
    
    /**
     * Toggle sound (master mute: voice and sound move together to the
     * same value — independently flipping them can leave the two channels
     * out of sync with the single mute button)
     */
    toggleSound() {
        const muted = !(this.settings.soundEnabled || this.settings.voiceEnabled);
        this.settings.soundEnabled = muted;
        this.settings.voiceEnabled = muted;
        this.saveSettings();
        return this.settings.soundEnabled;
    }
    
    /**
     * Start FPS counter
     */
    startFpsCounter() {
        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        
        this.fpsInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.lastFpsTime;
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            this.frameCount = 0;
            this.lastFpsTime = now;
            this.ui.updateFps(this.fps);
        }, 1000);
    }
    
    /**
     * Stop FPS counter
     */
    stopFpsCounter() {
        if (this.fpsInterval) {
            clearInterval(this.fpsInterval);
            this.fpsInterval = null;
        }
    }
    
    /**
     * Start duration timer
     */
    startDurationTimer() {
        this.durationInterval = setInterval(() => {
            if (this.sessionStartTime) {
                const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                this.ui.updateDuration(`${minutes}:${seconds}`);
            }
        }, 1000);
    }
    
    /**
     * Stop duration timer
     */
    stopDurationTimer() {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
    }
    
    /**
     * Reset stats
     */
    resetStats() {
        this.stats = {
            actionCount: 0,
            perfectCount: 0,
            comboCount: 0,
            maxCombo: 0
        };
        this.ui.updateStats(this.stats);
        this.ui.setCombo(0);
    }
    
    /**
     * Show session summary
     */
    showSessionSummary() {
        if (this.stats.actionCount > 0) {
            const perfectRate = Math.round((this.stats.perfectCount / this.stats.actionCount) * 100);
            const message = `训练结束！完成 ${this.stats.actionCount} 个动作，完美率 ${perfectRate}%`;
            this.ui.showFeedback(message, 'success');
            
            if (this.settings.voiceEnabled) {
                this.feedback.speak(message);
            }
        }
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const saved = safeJsonParse(localStorage.getItem('littlefencer_settings'), null);
        if (saved && typeof saved === 'object') {
            this.settings = { ...this.settings, ...saved };
        }
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        localStorage.setItem('littlefencer_settings', JSON.stringify(this.settings));
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.app = new LittleFencerApp();
    await window.app.init();
});
