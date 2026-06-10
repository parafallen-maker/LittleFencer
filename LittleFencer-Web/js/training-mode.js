/**
 * Training Mode - MVP Focus Mode
 * Simplified training page with real-time feedback
 * 
 * Core Features:
 * - Camera + Pose detection
 * - Real-time voice feedback (5 key corrections)
 * - Speed tracking with comparison
 * - Combo counter
 */

import { FencingStateEngine, FencingState, FIE_STANDARDS } from './engine.js';
import { AudioFeedbackManager } from './feedback.js';
import { SkeletonRenderer } from './skeleton.js';
import { platform } from './platform.js';
import { VideoRecorder } from './recorder.js';
import { videoStorage } from './storage.js';

class TrainingMode {
    constructor() {
        // Core components
        this.engine = new FencingStateEngine();
        this.audio = new AudioFeedbackManager();
        this.skeleton = null;

        // Camera
        this.video = null;
        this.pose = null;
        this.camera = null;
        this.isRunning = false;
        this.useFrontCamera = true;

        // UI elements
        this.splashScreen = null;
        this.trainingApp = null;
        this.feedbackText = null;
        this.statusText = null;
        this.comboNumber = null;
        this.comboDisplay = null;
        this.speedCurrent = null;
        this.speedDiff = null;

        // State
        this.combo = 0;
        this.bestCombo = 0;
        this.lastFeedbackTime = 0;
        this.feedbackCooldown = 1500; // ms between same feedback
        this.lastFeedback = '';
        this.processingFrame = false; // Throttle for pose detection
        this.sessionStartTime = null; // Track session duration

        // Speed tracking
        this.lungeHistory = [];
        this.maxHistory = 10;
        this.lungeStartTime = null;
        this.lastLungeTime = null;

        // Settings
        this.voiceEnabled = true;
        this.soundEnabled = true;
        this.skeletonVisible = true;

        // Recording
        this.recorder = new VideoRecorder();
        this.isRecording = false;
        this.currentPlayingVideoId = null;
        this.galleryObjectUrls = []; // Track for cleanup
    }

    async init() {
        console.log('🎯 Training Mode initializing...');

        try {
            this.updateProgress(10, '初始化界面...');

            // Get DOM elements
            this.splashScreen = document.getElementById('splash-screen');
            this.trainingApp = document.getElementById('training-app');
            this.video = document.getElementById('video');
            this.feedbackText = document.getElementById('feedback-text');
            this.statusText = document.getElementById('status-text');
            this.comboNumber = document.getElementById('combo-number');
            this.comboDisplay = document.getElementById('combo-display');
            this.speedCurrent = document.getElementById('speed-current');
            this.speedDiff = document.getElementById('speed-diff');
            console.log('  ✓ DOM elements loaded');

            // Load saved settings and training history
            this.loadSettings();
            this.loadTrainingHistory();
            console.log('  ✓ Settings loaded');

            this.updateProgress(30, '加载骨骼渲染器...');

            // Initialize skeleton renderer (pass ID, not element)
            this.skeleton = new SkeletonRenderer('skeleton-canvas');
            console.log('  ✓ Skeleton renderer created');

            this.updateProgress(50, '初始化音频...');

            // Initialize audio
            await this.audio.init();
            console.log('  ✓ Audio initialized');

            this.updateProgress(70, '加载AI姿态模型...');

            // Initialize MediaPipe Pose
            await this.initPose();
            console.log('  ✓ MediaPipe Pose initialized');

            this.updateProgress(100, '准备完成！');

            // Setup event listeners
            this.setupEventListeners();
            console.log('  ✓ Event listeners set up');

            // Small delay to show 100%
            await new Promise(r => setTimeout(r, 300));

            // Hide splash, show app
            this.splashScreen.classList.add('hidden');
            this.trainingApp.classList.remove('hidden');

            console.log('✅ Training Mode ready!');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.updateProgress(0, '初始化失败: ' + error.message);
        }
    }

    updateProgress(percent, text) {
        const bar = document.getElementById('loading-progress');
        const label = document.getElementById('loading-text');
        if (bar) bar.style.width = percent + '%';
        if (label) label.textContent = text;
    }

    loadTrainingHistory() {
        try {
            const saved = localStorage.getItem('trainingHistory');
            if (saved) {
                const history = JSON.parse(saved);
                this.lungeHistory = history.lungeHistory || [];
                this.lastLungeTime = history.lastLungeTime || null;
                this.bestCombo = history.bestCombo || 0;
                this.totalLunges = history.totalLunges || 0;
                console.log('📊 Training history loaded:', history);
            }
        } catch (e) {
            console.warn('Failed to load training history:', e);
        }
    }

    saveTrainingHistory() {
        try {
            const history = {
                lungeHistory: this.lungeHistory.slice(-20), // Keep last 20
                lastLungeTime: this.lastLungeTime,
                bestCombo: Math.max(this.bestCombo || 0, this.combo),
                totalLunges: this.totalLunges || 0,
                lastSession: new Date().toISOString()
            };
            localStorage.setItem('trainingHistory', JSON.stringify(history));
        } catch (e) {
            console.warn('Failed to save training history:', e);
        }
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('trainingSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.voiceEnabled = settings.voiceEnabled ?? true;
                this.soundEnabled = settings.soundEnabled ?? true;
                this.skeletonVisible = settings.skeletonVisible ?? true;

                // Update UI checkboxes
                const voiceCheck = document.getElementById('voice-enabled');
                const soundCheck = document.getElementById('sound-enabled');
                const skeletonCheck = document.getElementById('skeleton-visible');
                if (voiceCheck) voiceCheck.checked = this.voiceEnabled;
                if (soundCheck) soundCheck.checked = this.soundEnabled;
                if (skeletonCheck) skeletonCheck.checked = this.skeletonVisible;

                console.log('📂 Settings loaded:', settings);
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }

    saveSettings() {
        try {
            const settings = {
                voiceEnabled: this.voiceEnabled,
                soundEnabled: this.soundEnabled,
                skeletonVisible: this.skeletonVisible
            };
            localStorage.setItem('trainingSettings', JSON.stringify(settings));
            console.log('💾 Settings saved:', settings);
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    }

    async initPose() {
        return new Promise((resolve) => {
            this.pose = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                }
            });

            this.pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.pose.onResults((results) => this.onPoseResults(results));

            this.pose.initialize().then(() => {
                console.log('📸 MediaPipe Pose initialized');
                resolve();
            });
        });
    }

    setupEventListeners() {
        // Start/Stop button
        document.getElementById('btn-start').addEventListener('click', () => {
            if (this.isRunning) {
                this.stop();
            } else {
                this.start();
            }
        });

        // Camera flip
        document.getElementById('btn-camera-flip').addEventListener('click', () => {
            this.flipCamera();
        });

        // Settings
        document.getElementById('btn-settings').addEventListener('click', () => {
            document.getElementById('settings-panel').classList.remove('hidden');
        });

        document.getElementById('btn-close-settings').addEventListener('click', () => {
            document.getElementById('settings-panel').classList.add('hidden');
        });

        // Settings toggles
        document.getElementById('voice-enabled').addEventListener('change', (e) => {
            this.voiceEnabled = e.target.checked;
            this.audio.setVoice(this.voiceEnabled);
            this.saveSettings();
        });

        document.getElementById('sound-enabled').addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.audio.setSound(this.soundEnabled);
            this.saveSettings();
        });

        document.getElementById('skeleton-visible').addEventListener('change', (e) => {
            this.skeletonVisible = e.target.checked;
            this.saveSettings();
        });

        // iOS audio unlock
        if (platform.isIOS) {
            document.addEventListener('touchstart', () => {
                this.audio.init();
            }, { once: true });
        }

        // Onboarding tutorial (first-time users)
        this.onboardingStep = 1;
        const nextBtn = document.getElementById('btn-onboarding-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextOnboardingStep());
        }

        // Check if first time user
        if (!localStorage.getItem('onboardingComplete')) {
            document.getElementById('onboarding-panel')?.classList.remove('hidden');
        }

        // Error overlay retry button
        document.getElementById('btn-retry')?.addEventListener('click', () => {
            this.hideErrorOverlay();
            this.start();
        });

        // Session summary close button
        document.getElementById('btn-close-summary')?.addEventListener('click', () => {
            document.getElementById('session-summary')?.classList.add('hidden');
        });

        // Recording button
        document.getElementById('btn-record')?.addEventListener('click', () => {
            this.toggleRecording();
        });

        // Gallery button
        document.getElementById('btn-gallery')?.addEventListener('click', () => {
            this.openGallery();
        });

        // Close gallery
        document.getElementById('btn-close-gallery')?.addEventListener('click', () => {
            document.getElementById('gallery-modal')?.classList.add('hidden');
        });

        // Close video player
        document.getElementById('btn-close-player')?.addEventListener('click', () => {
            this.closeVideoPlayer();
        });

        // Share video
        document.getElementById('btn-share-video')?.addEventListener('click', () => {
            if (this.currentPlayingVideoId) this.shareVideo(this.currentPlayingVideoId);
        });

        // Delete video
        document.getElementById('btn-delete-video')?.addEventListener('click', () => {
            if (this.currentPlayingVideoId) {
                document.getElementById('confirm-dialog')?.classList.remove('hidden');
            }
        });

        // Confirm delete
        document.getElementById('btn-confirm-ok')?.addEventListener('click', () => {
            if (this.currentPlayingVideoId) {
                this.deleteVideo(this.currentPlayingVideoId);
            }
            document.getElementById('confirm-dialog')?.classList.add('hidden');
        });

        // Cancel delete
        document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
            document.getElementById('confirm-dialog')?.classList.add('hidden');
        });
    }

    nextOnboardingStep() {
        const panel = document.getElementById('onboarding-panel');
        const steps = panel.querySelectorAll('.onboarding-step');
        const dots = panel.querySelectorAll('.dot');
        const btn = document.getElementById('btn-onboarding-next');

        // Hide current step
        steps[this.onboardingStep - 1]?.classList.add('hidden');
        dots[this.onboardingStep - 1]?.classList.remove('active');

        this.onboardingStep++;

        if (this.onboardingStep > 3) {
            // Complete onboarding
            panel.classList.add('hidden');
            localStorage.setItem('onboardingComplete', 'true');
            return;
        }

        // Show next step
        steps[this.onboardingStep - 1]?.classList.remove('hidden');
        dots[this.onboardingStep - 1]?.classList.add('active');

        // Update button text on last step
        if (this.onboardingStep === 3) {
            btn.innerHTML = '<span class="btn-icon">🚀</span><span class="btn-text">开始训练</span>';
        }
    }

    async start() {
        console.log('🚀 Starting training...');

        const btn = document.getElementById('btn-start');
        btn.innerHTML = '<span class="btn-icon">⏹️</span><span class="btn-text">停止训练</span>';
        btn.classList.add('active');

        try {
            // Check for video test mode via URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const videoFile = urlParams.get('video');
            const videoContainer = document.querySelector('.video-container');

            if (videoFile) {
                // Video test mode (no mirror)
                console.log('📹 Video test mode:', videoFile);
                videoContainer.classList.remove('mirrored');
                this.video.src = videoFile;
                this.video.loop = true;
                this.video.muted = true; // Required for autoplay

                // Setup progress bar BEFORE play so listeners catch metadata
                this.setupVideoProgress();

                await this.video.play();
                // Skip full body check for video testing (video may not show full body)
                this.engine.skipFullBodyCheck = true;
                this.engine.transitionTo('IDLE'); // Skip waiting state
                this.updateStatus('视频测试模式', 'active');
                this.showFeedback('📹 视频测试中', 'info');
            } else {
                // Camera mode (mirror for selfie view)
                videoContainer.classList.add('mirrored');
                const constraints = {
                    video: {
                        facingMode: this.useFrontCamera ? 'user' : 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.video.srcObject = stream;
                await this.video.play();
                this.speak('开始训练');
            }

            this.isRunning = true;
            this.sessionStartTime = Date.now();
            this.processFrame();
            this.updateStatus('训练中', 'active');
            this.hideErrorOverlay();

        } catch (err) {
            console.error('Camera error:', err);

            // Show detailed error message
            let errorMsg = '摄像头错误';
            if (err.name === 'NotAllowedError') {
                errorMsg = '请允许摄像头权限';
            } else if (err.name === 'NotFoundError') {
                errorMsg = '未找到摄像头';
            } else if (err.name === 'NotReadableError') {
                errorMsg = '摄像头被占用';
            }

            this.updateStatus(errorMsg, 'error');
            this.showErrorOverlay(errorMsg);

            // Reset button
            const btn = document.getElementById('btn-start');
            btn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">开始训练</span>';
            btn.classList.remove('active');
        }
    }

    setupVideoProgress() {
        const progressBar = document.getElementById('progress-bar');
        const timeCurrent = document.getElementById('time-current');
        const timeTotal = document.getElementById('time-total');
        const progressContainer = document.getElementById('video-progress');

        if (!progressBar || !this.video) return;

        // Show progress bar
        progressContainer.classList.add('visible');

        // Format time as M:SS
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        // Update progress bar as video plays
        let totalUpdated = false;
        this.video.addEventListener('timeupdate', () => {
            if (!this.video.duration || !isFinite(this.video.duration)) return;
            const progress = (this.video.currentTime / this.video.duration) * 100;
            progressBar.value = progress;
            timeCurrent.textContent = formatTime(this.video.currentTime);
            // Fallback: update total time if not yet done
            if (!totalUpdated && isFinite(this.video.duration) && this.video.duration > 0) {
                timeTotal.textContent = formatTime(this.video.duration);
                totalUpdated = true;
                console.log('📊 Total time updated:', timeTotal.textContent);
            }
        });

        // Set total duration - check immediately and on loadedmetadata
        const updateTotal = () => {
            if (this.video.duration && !isNaN(this.video.duration)) {
                timeTotal.textContent = formatTime(this.video.duration);
            }
        };
        updateTotal(); // Check immediately in case metadata already loaded
        this.video.addEventListener('loadedmetadata', updateTotal);
        this.video.addEventListener('durationchange', updateTotal);

        // Seek when user drags slider
        progressBar.addEventListener('input', (e) => {
            const seekTime = (e.target.value / 100) * this.video.duration;
            this.video.currentTime = seekTime;
        });
    }

    stop() {
        console.log('⏹️ Stopping training...');

        this.isRunning = false;

        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }

        const btn = document.getElementById('btn-start');
        btn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">开始训练</span>';
        btn.classList.remove('active');

        this.updateStatus('已停止', '');
        this.skeleton.clear();

        // Show session summary if there was meaningful training
        if (this.sessionStartTime && (this.totalLunges || 0) > 0) {
            this.showSessionSummary();
        }
    }

    showSessionSummary() {
        const summary = document.getElementById('session-summary');
        if (!summary) return;

        // Calculate session stats
        const durationSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const avgSpeed = this.getAverageTime();

        // Populate summary
        const summaryLunges = document.getElementById('summary-lunges');
        const summaryCombo = document.getElementById('summary-combo');
        const summaryAvgSpeed = document.getElementById('summary-avg-speed');
        const summaryDuration = document.getElementById('summary-duration');

        if (summaryLunges) summaryLunges.textContent = this.totalLunges || 0;
        if (summaryCombo) summaryCombo.textContent = Math.max(this.bestCombo || 0, this.combo);
        if (summaryAvgSpeed) summaryAvgSpeed.textContent = avgSpeed ? avgSpeed.toFixed(2) + 's' : '--';
        if (summaryDuration) summaryDuration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        summary.classList.remove('hidden');
    }

    showErrorOverlay(message) {
        const overlay = document.getElementById('error-overlay');
        const msgEl = document.getElementById('error-message');
        if (overlay) {
            if (msgEl) msgEl.textContent = message;
            overlay.classList.remove('hidden');
        }
    }

    hideErrorOverlay() {
        const overlay = document.getElementById('error-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    async flipCamera() {
        this.useFrontCamera = !this.useFrontCamera;
        if (this.isRunning) {
            this.stop();
            await new Promise(r => setTimeout(r, 300));
            this.start();
        }
    }

    processFrame() {
        if (!this.isRunning) return;

        // Throttle: don't send new frame if still processing previous
        if (!this.processingFrame && this.video.readyState >= 2) {
            this.processingFrame = true;
            this.pose.send({ image: this.video }).then(() => {
                this.processingFrame = false;
            }).catch((error) => {
                console.warn('Pose detection error:', error);
                this.processingFrame = false;
            });
        }

        requestAnimationFrame(() => this.processFrame());
    }

    onPoseResults(results) {
        if (!this.isRunning) return;

        // Clear and draw skeleton
        this.skeleton.clear();


        if (results.poseLandmarks && this.skeletonVisible) {
            this.skeleton.render(results.poseLandmarks);
        }

        // Process pose with engine
        const engineResult = this.engine.processPose(
            results.poseLandmarks,
            results.poseWorldLandmarks
        );

        // Only process if we got valid results
        if (engineResult) {
            // Update UI based on state
            this.handleStateChange(engineResult);

            // Check form and provide feedback
            this.checkFormAndFeedback(engineResult);
        }
    }

    handleStateChange(result) {
        const state = result.currentState;

        switch (state) {
            case FencingState.EN_GARDE:
                this.updateStatus('准备姿势 ✅', 'en-garde');
                if (this.lungeStartTime === null) {
                    // Ready to track next lunge
                }
                break;

            case FencingState.LUNGING:
                this.updateStatus('弓步中...', 'lunge');
                if (this.lungeStartTime === null) {
                    this.lungeStartTime = Date.now();
                }
                break;

            case FencingState.RECOVERY:
                this.updateStatus('恢复姿势', '');
                if (this.lungeStartTime !== null) {
                    this.onLungeComplete();
                }
                break;

            case FencingState.IDLE:
                this.updateStatus('准备就绪', '');
                break;

            case FencingState.WAITING_FULL_BODY:
                this.updateStatus('请露出全身', 'warning');
                break;
        }
    }

    checkFormAndFeedback(result) {
        const corrections = result.corrections || [];
        const now = Date.now();

        // Process corrections
        for (const correction of corrections) {
            // Skip if same feedback within cooldown
            if (correction === this.lastFeedback &&
                now - this.lastFeedbackTime < this.feedbackCooldown) {
                continue;
            }

            // Show feedback
            this.showFeedback(correction, 'error');
            this.speak(correction);

            this.lastFeedback = correction;
            this.lastFeedbackTime = now;

            // Reset combo on error
            this.updateCombo(0);
            break; // Only one feedback at a time
        }

        // If in lunge with no corrections, give encouragement
        if (result.currentState === FencingState.LUNGING &&
            corrections.length === 0 &&
            result.quality === 'PERFECT') {
            this.showFeedback('漂亮！✨', 'success');
            this.updateCombo(this.combo + 1);
        }
    }

    onLungeComplete() {
        if (this.lungeStartTime === null) return;

        const duration = (Date.now() - this.lungeStartTime) / 1000;
        this.lungeStartTime = null;

        // Store in history
        this.lungeHistory.push(duration);
        if (this.lungeHistory.length > this.maxHistory) {
            this.lungeHistory.shift();
        }

        // Update speed display
        this.speedCurrent.textContent = duration.toFixed(2) + 's';

        // Compare with last time
        if (this.lastLungeTime !== null) {
            const diff = duration - this.lastLungeTime;

            if (Math.abs(diff) > 0.05) { // Only show if difference > 50ms
                if (diff < 0) {
                    this.speedDiff.textContent = `↓ ${(-diff).toFixed(2)}s 更快!`;
                    this.speedDiff.className = 'speed-diff faster';
                    this.speak(`快了${(-diff).toFixed(1)}秒`);
                } else {
                    this.speedDiff.textContent = `↑ ${diff.toFixed(2)}s`;
                    this.speedDiff.className = 'speed-diff slower';
                }
            } else {
                this.speedDiff.textContent = '⏱️ 持平';
                this.speedDiff.className = 'speed-diff';
            }
        }

        this.lastLungeTime = duration;

        // Track total lunges and save history
        this.totalLunges = (this.totalLunges || 0) + 1;
        this.saveTrainingHistory();
    }

    getAverageTime() {
        if (this.lungeHistory.length === 0) return null;
        const sum = this.lungeHistory.reduce((a, b) => a + b, 0);
        return sum / this.lungeHistory.length;
    }

    showFeedback(text, type) {
        this.feedbackText.textContent = text;
        this.feedbackText.className = `feedback-text visible ${type}`;

        // Auto hide after 2 seconds
        setTimeout(() => {
            this.feedbackText.classList.remove('visible');
        }, 2000);
    }

    updateStatus(text, badgeClass) {
        this.statusText.textContent = text;
        const badge = document.getElementById('status-badge');
        badge.className = `status-badge ${badgeClass}`;
    }

    updateCombo(value) {
        this.combo = value;
        this.comboNumber.textContent = value;

        if (value > 0) {
            this.comboDisplay.classList.add('visible');

            // Remove animation classes first
            this.comboNumber.classList.remove('pop', 'milestone');

            // Force reflow to restart animation
            void this.comboNumber.offsetWidth;

            // Add appropriate animation
            if (value === 5 || value === 10 || value === 20) {
                // Milestone animation
                this.comboNumber.classList.add('milestone');
                this.speak(`连续${value}次！太棒了！`);
            } else {
                this.comboNumber.classList.add('pop');
            }

            if (value >= 3) {
                this.audio.playActionSound('PERFECT');
            }
        } else {
            this.comboDisplay.classList.remove('visible');
        }
    }

    speak(text) {
        if (this.voiceEnabled) {
            this.audio.speak(text, true);
        }
    }

    // ===== Recording =====

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        if (this.isRecording || !this.video.srcObject) return;
        try {
            await this.recorder.start(this.video.srcObject);
            this.isRecording = true;
            document.getElementById('recording-indicator')?.classList.remove('hidden');
            const btn = document.getElementById('btn-record');
            if (btn) btn.querySelector('.btn-label').textContent = '停止';
            this.showFeedback('开始录制', 'success');
        } catch (err) {
            console.error('[Recording] Start failed:', err);
            this.showFeedback('录制失败', 'error');
        }
    }

    async stopRecording() {
        if (!this.isRecording) return;
        try {
            const blob = await this.recorder.stop();
            this.isRecording = false;
            document.getElementById('recording-indicator')?.classList.add('hidden');
            const btn = document.getElementById('btn-record');
            if (btn) btn.querySelector('.btn-label').textContent = '录制';

            if (blob) {
                await this.saveRecording(blob);
            }
        } catch (err) {
            console.error('[Recording] Stop failed:', err);
            this.isRecording = false;
        }
    }

    async saveRecording(blob) {
        const video = {
            blob: blob,
            quality: (this.combo >= 3) ? 'starred' : 'normal',
            duration: this.recorder.getDuration ? this.recorder.getDuration() : 0,
            actionCount: this.totalLunges || 0,
            perfectCount: 0
        };
        try {
            await videoStorage.saveVideo(video);
            this.showFeedback('视频已保存', 'success');
        } catch (err) {
            console.error('[Recording] Save failed:', err);
            this.showFeedback('保存失败', 'error');
        }
    }

    // ===== Gallery =====

    async openGallery() {
        const modal = document.getElementById('gallery-modal');
        if (!modal) return;

        // Clean up previous object URLs
        this.cleanupGalleryUrls();

        modal.classList.remove('hidden');

        try {
            const videos = await videoStorage.getVideos('all');
            const grid = document.getElementById('gallery-grid');
            const empty = document.getElementById('empty-gallery');
            const countEl = document.getElementById('video-count');

            if (countEl) countEl.textContent = `${videos.length} 个视频`;

            if (videos.length === 0) {
                if (empty) empty.style.display = '';
                return;
            }

            if (empty) empty.style.display = 'none';

            // Clear previous items (keep empty-state)
            grid.querySelectorAll('.gallery-item').forEach(el => el.remove());

            videos.forEach(v => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.dataset.id = v.id;

                // Thumbnail
                if (v.thumbnail instanceof Blob) {
                    const url = URL.createObjectURL(v.thumbnail);
                    this.galleryObjectUrls.push(url);
                    item.innerHTML = `<img src="${url}" alt="">`;
                } else {
                    item.innerHTML = `<div class="gallery-placeholder">📹</div>`;
                }

                // Meta
                const date = new Date(v.timestamp || v.id);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                item.innerHTML += `<div class="gallery-meta"><span>${dateStr}</span></div>`;

                item.addEventListener('click', () => this.openVideoPlayer(v.id));
                grid.appendChild(item);
            });
        } catch (err) {
            console.error('[Gallery] Load failed:', err);
        }
    }

    cleanupGalleryUrls() {
        this.galleryObjectUrls.forEach(url => URL.revokeObjectURL(url));
        this.galleryObjectUrls = [];
    }

    async openVideoPlayer(id) {
        const modal = document.getElementById('video-player-modal');
        const videoEl = document.getElementById('playback-video');
        if (!modal || !videoEl) return;

        try {
            const video = await videoStorage.getVideo(id);
            if (!video) return;

            this.currentPlayingVideoId = id;

            // Create object URL for playback
            const url = URL.createObjectURL(video.blob);
            videoEl.src = url;
            videoEl.onloadeddata = () => URL.revokeObjectURL(url);

            // Update meta
            const date = new Date(video.timestamp || id);
            const dateEl = document.getElementById('video-date');
            if (dateEl) dateEl.textContent = date.toLocaleString('zh-CN');

            const durEl = document.getElementById('video-duration');
            if (durEl && video.duration) {
                const secs = Math.round(video.duration / 1000);
                durEl.textContent = `${secs}秒`;
            }

            // Close gallery, open player
            document.getElementById('gallery-modal')?.classList.add('hidden');
            modal.classList.remove('hidden');
        } catch (err) {
            console.error('[Player] Open failed:', err);
        }
    }

    closeVideoPlayer() {
        const modal = document.getElementById('video-player-modal');
        const videoEl = document.getElementById('playback-video');
        if (videoEl) {
            videoEl.pause();
            videoEl.src = '';
        }
        modal?.classList.add('hidden');
        this.currentPlayingVideoId = null;
    }

    async deleteVideo(id) {
        try {
            await videoStorage.deleteVideo(id);
            this.showFeedback('视频已删除', 'success');
            this.closeVideoPlayer();
            this.openGallery(); // Refresh gallery
        } catch (err) {
            console.error('[Gallery] Delete failed:', err);
        }
    }

    async shareVideo(id) {
        try {
            const shareData = await videoStorage.exportForShare(id);
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareData.file] })) {
                await navigator.share({
                    title: 'LittleFencer 训练视频',
                    text: `佩剑训练：${shareData.stats?.actionCount || 0}个动作`,
                    files: [shareData.file]
                });
                this.showFeedback('分享成功', 'success');
            } else {
                // Fallback: download
                const url = URL.createObjectURL(shareData.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = shareData.filename;
                a.click();
                URL.revokeObjectURL(url);
                this.showFeedback('视频已下载', 'success');
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[Share] Failed:', err);
                this.showFeedback('分享失败', 'error');
            }
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    const app = new TrainingMode();
    await app.init();
});
