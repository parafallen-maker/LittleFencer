/**
 * UI Manager
 * Handles all UI interactions and updates
 * With iOS/Safari compatibility
 */

import { ActionDisplayNames } from './detectors/index.js';
import { platform } from './platform.js';

// Badge definitions
const BADGES = {
    first_rep: {
        image: 'assets/images/badge_first_rep.png',
        title: '🎉 首次完成！',
        desc: '完成了第一个动作'
    },
    combo_5: {
        image: 'assets/images/badge_combo_5.png',
        title: '🔥 5连击！',
        desc: '连续完成5个动作'
    },
    combo_10: {
        image: 'assets/images/badge_combo_10.png',
        title: '⚡ 10连击！',
        desc: '连续完成10个动作'
    },
    perfect_10: {
        image: 'assets/images/badge_perfect_10.png',
        title: '🏆 完美大师！',
        desc: '累计10个完美动作'
    }
};

export class UIManager {
    constructor(app) {
        this.app = app;
        
        // Elements
        this.elements = {};
        
        // Timeouts
        this.feedbackTimeout = null;
        this.actionTimeout = null;
        
        // Onboarding state
        this.currentSlide = 0;
        this.hasSeenOnboarding = localStorage.getItem('littlefencer_onboarding_done') === 'true';
        
        // Badge tracking
        this.earnedBadges = JSON.parse(localStorage.getItem('littlefencer_badges') || '[]');
        
        // iOS install prompt tracking
        this.hasShownIOSInstallPrompt = localStorage.getItem('littlefencer_ios_install_shown') === 'true';
    }
    
    /**
     * Initialize UI
     */
    init() {
        // Cache elements
        this.elements = {
            statusBadge: document.getElementById('status-badge'),
            statusText: document.getElementById('status-text'),
            actionOverlay: document.getElementById('action-overlay'),
            actionName: document.getElementById('action-name'),
            actionQuality: document.getElementById('action-quality'),
            comboContainer: document.getElementById('combo-container'),
            comboCount: document.getElementById('combo-count'),
            feedbackToast: document.getElementById('feedback-toast'),
            recordingIndicator: document.getElementById('recording-indicator'),
            fpsValue: document.getElementById('fps-value'),
            actionCount: document.getElementById('action-count'),
            perfectCount: document.getElementById('perfect-count'),
            durationValue: document.getElementById('duration-value'),
            galleryModal: document.getElementById('gallery-modal'),
            galleryGrid: document.getElementById('gallery-grid'),
            btnStart: document.getElementById('btn-start'),
            btnRecord: document.getElementById('btn-record'),
            btnCamera: document.getElementById('btn-camera'),
            btnSound: document.getElementById('btn-sound'),
            btnGallery: document.getElementById('btn-gallery'),
            btnCloseGallery: document.getElementById('btn-close-gallery'),
            // Onboarding elements
            onboarding: document.getElementById('onboarding'),
            btnOnboardingNext: document.getElementById('btn-onboarding-next'),
            btnOnboardingSkip: document.getElementById('btn-onboarding-skip'),
            // Badge popup
            badgePopup: document.getElementById('badge-popup'),
            badgeImage: document.getElementById('badge-image'),
            badgeTitle: document.getElementById('badge-title'),
            badgeDesc: document.getElementById('badge-desc')
        };
        
        // Setup event listeners
        this.setupEventListeners();
        this.setupOnboarding();
        
        // Show iOS install prompt if applicable
        this.checkIOSInstallPrompt();
    }
    
    /**
     * Check and show iOS install prompt
     */
    checkIOSInstallPrompt() {
        // Only show on iOS Safari, not in PWA mode, and not shown before
        if (platform.isIOS && !platform.isPWA && !this.hasShownIOSInstallPrompt) {
            // Delay showing the prompt
            setTimeout(() => {
                this.showIOSInstallPrompt();
            }, 3000);
        }
    }
    
    /**
     * Show iOS PWA install instructions
     */
    showIOSInstallPrompt() {
        const instructions = platform.getInstallInstructions();
        
        // Create prompt element
        const prompt = document.createElement('div');
        prompt.className = 'ios-install-prompt';
        prompt.innerHTML = `
            <div class="ios-install-content">
                <div class="ios-install-icon">${instructions.icon}</div>
                <div class="ios-install-text">
                    <h3>${instructions.title}</h3>
                    <p>安装到主屏幕获得更好体验</p>
                    <ol>
                        ${instructions.steps.map(step => `<li>${step}</li>`).join('')}
                    </ol>
                </div>
                <button class="ios-install-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        // Add close handler
        prompt.querySelector('.ios-install-close').addEventListener('click', () => {
            prompt.remove();
            localStorage.setItem('littlefencer_ios_install_shown', 'true');
            this.hasShownIOSInstallPrompt = true;
        });
        
        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (prompt.parentNode) {
                prompt.remove();
            }
        }, 15000);
    }
    
    /**
     * Setup onboarding
     */
    setupOnboarding() {
        if (!this.hasSeenOnboarding && this.elements.onboarding) {
            this.elements.onboarding.classList.remove('hidden');
            
            // Next button
            this.elements.btnOnboardingNext?.addEventListener('click', () => {
                this.nextSlide();
            });
            
            // Skip button
            this.elements.btnOnboardingSkip?.addEventListener('click', () => {
                this.completeOnboarding();
            });
            
            // Dots
            document.querySelectorAll('.onboarding-dots .dot').forEach(dot => {
                dot.addEventListener('click', (e) => {
                    this.goToSlide(parseInt(e.target.dataset.slide));
                });
            });
        }
    }
    
    /**
     * Go to next onboarding slide
     */
    nextSlide() {
        if (this.currentSlide < 2) {
            this.goToSlide(this.currentSlide + 1);
        } else {
            this.completeOnboarding();
        }
    }
    
    /**
     * Go to specific slide
     */
    goToSlide(index) {
        this.currentSlide = index;
        
        // Update slides
        document.querySelectorAll('.onboarding-slide').forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });
        
        // Update dots
        document.querySelectorAll('.onboarding-dots .dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
        
        // Update button text
        if (this.elements.btnOnboardingNext) {
            this.elements.btnOnboardingNext.textContent = index === 2 ? '开始训练' : '下一步';
        }
    }
    
    /**
     * Complete onboarding
     */
    completeOnboarding() {
        this.elements.onboarding?.classList.add('hidden');
        localStorage.setItem('littlefencer_onboarding_done', 'true');
        this.hasSeenOnboarding = true;
    }
    
    /**
     * Show badge popup
     */
    showBadge(badgeId) {
        const badge = BADGES[badgeId];
        if (!badge || this.earnedBadges.includes(badgeId)) return;
        
        // Record badge
        this.earnedBadges.push(badgeId);
        localStorage.setItem('littlefencer_badges', JSON.stringify(this.earnedBadges));
        
        // Show popup
        if (this.elements.badgePopup) {
            this.elements.badgeImage.src = badge.image;
            this.elements.badgeTitle.textContent = badge.title;
            this.elements.badgeDesc.textContent = badge.desc;
            this.elements.badgePopup.classList.remove('hidden');
            this.elements.badgePopup.classList.add('show');
            
            // Auto hide after 3 seconds
            setTimeout(() => {
                this.elements.badgePopup.classList.remove('show');
                setTimeout(() => {
                    this.elements.badgePopup.classList.add('hidden');
                }, 500);
            }, 3000);
        }
    }
    
    /**
     * Check and award badges based on stats
     */
    checkBadges(stats) {
        if (stats.actionCount === 1) {
            this.showBadge('first_rep');
        }
        if (stats.comboCount === 5) {
            this.showBadge('combo_5');
        }
        if (stats.comboCount === 10) {
            this.showBadge('combo_10');
        }
        if (stats.perfectCount === 10) {
            this.showBadge('perfect_10');
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Start/Stop button
        this.elements.btnStart.addEventListener('click', () => {
            this.app.toggle();
        });
        
        // Record button
        this.elements.btnRecord.addEventListener('click', () => {
            this.app.toggleRecording();
        });
        
        // Camera flip button
        this.elements.btnCamera.addEventListener('click', () => {
            this.app.flipCamera();
        });
        
        // Sound toggle button
        this.elements.btnSound.addEventListener('click', () => {
            const enabled = this.app.toggleSound();
            this.elements.btnSound.querySelector('.btn-icon').textContent = enabled ? '🔊' : '🔇';
        });
        
        // Gallery button
        this.elements.btnGallery.addEventListener('click', () => {
            this.showGallery();
        });
        
        // Close gallery button
        this.elements.btnCloseGallery.addEventListener('click', () => {
            this.hideGallery();
        });
        
        // Gallery tabs
        document.querySelectorAll('.gallery-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gallery-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.loadGalleryItems(e.target.dataset.tab);
            });
        });
        
        // Close modals on backdrop click
        this.elements.galleryModal.addEventListener('click', (e) => {
            if (e.target === this.elements.galleryModal) {
                this.hideGallery();
            }
        });
        
        // Video player modal controls
        this.setupVideoPlayerControls();
    }
    
    /**
     * Setup video player modal controls
     */
    setupVideoPlayerControls() {
        const playerModal = document.getElementById('video-player-modal');
        const btnClosePlayer = document.getElementById('btn-close-player');
        const btnToggleStar = document.getElementById('btn-toggle-star');
        const btnShareVideo = document.getElementById('btn-share-video');
        const btnDeleteVideo = document.getElementById('btn-delete-video');
        const playbackVideo = document.getElementById('playback-video');
        
        // Close player
        btnClosePlayer?.addEventListener('click', () => {
            this.hideVideoPlayer();
        });
        
        // Close on backdrop click
        playerModal?.addEventListener('click', (e) => {
            if (e.target === playerModal) {
                this.hideVideoPlayer();
            }
        });
        
        // Toggle star
        btnToggleStar?.addEventListener('click', async () => {
            if (!this.currentVideoId) return;
            const video = await this.app.toggleVideoStar(this.currentVideoId);
            if (video) {
                this.updateStarButton(video.starred);
                this.showFeedback(video.starred ? '已添加到精彩' : '已取消精彩', 'success');
                this.loadGalleryItems(this.currentFilter || 'starred');
            }
        });
        
        // Share video
        btnShareVideo?.addEventListener('click', async () => {
            if (!this.currentVideoId) return;
            await this.app.shareVideo(this.currentVideoId);
        });
        
        // Delete video
        btnDeleteVideo?.addEventListener('click', () => {
            this.showDeleteConfirmDialog();
        });
        
        // Setup confirm dialog
        this.setupConfirmDialog();
    }
    
    /**
     * Setup confirm dialog
     */
    setupConfirmDialog() {
        const confirmDialog = document.getElementById('confirm-dialog');
        const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
        const btnConfirmOk = document.getElementById('btn-confirm-ok');
        
        btnConfirmCancel?.addEventListener('click', () => {
            confirmDialog?.classList.add('hidden');
        });
        
        btnConfirmOk?.addEventListener('click', async () => {
            if (this.pendingDeleteId) {
                const success = await this.app.deleteVideo(this.pendingDeleteId);
                if (success) {
                    this.showFeedback('视频已删除', 'success');
                    this.hideVideoPlayer();
                    this.loadGalleryItems(this.currentFilter || 'starred');
                }
                this.pendingDeleteId = null;
            }
            confirmDialog?.classList.add('hidden');
        });
        
        // Close on backdrop
        confirmDialog?.addEventListener('click', (e) => {
            if (e.target === confirmDialog) {
                confirmDialog.classList.add('hidden');
            }
        });
    }
    
    /**
     * Show delete confirmation dialog
     */
    showDeleteConfirmDialog() {
        this.pendingDeleteId = this.currentVideoId;
        document.getElementById('confirm-dialog')?.classList.remove('hidden');
    }
    
    /**
     * Set training state
     */
    setTrainingState(isRunning) {
        const btn = this.elements.btnStart;
        const icon = btn.querySelector('.btn-icon');
        const label = btn.querySelector('.btn-label');
        
        if (isRunning) {
            btn.classList.add('active');
            icon.textContent = '⏹️';
            label.textContent = '停止';
        } else {
            btn.classList.remove('active');
            icon.textContent = '▶️';
            label.textContent = '开始';
        }
    }
    
    /**
     * Set recording state
     */
    setRecordingState(isRecording) {
        const btn = this.elements.btnRecord;
        const indicator = this.elements.recordingIndicator;
        
        if (isRecording) {
            btn.classList.add('recording');
            indicator.classList.remove('hidden');
        } else {
            btn.classList.remove('recording');
            indicator.classList.add('hidden');
        }
    }
    
    /**
     * Set status display
     */
    setStatus(state, data) {
        const badge = this.elements.statusBadge;
        const text = this.elements.statusText;
        const icon = badge.querySelector('.status-icon');
        
        // Reset classes
        badge.classList.remove('en-garde', 'lunging');
        
        switch (state) {
            case 'IDLE':
                icon.textContent = '🎯';
                text.textContent = '准备中';
                break;
                
            case 'EN_GARDE':
                icon.textContent = '⚔️';
                text.textContent = 'En Garde';
                badge.classList.add('en-garde');
                break;
                
            case 'LUNGING':
                icon.textContent = '🗡️';
                text.textContent = '弓步!';
                badge.classList.add('lunging');
                break;
                
            case 'RECOVERY':
                icon.textContent = '↩️';
                text.textContent = '回收';
                break;
                
            case 'ADVANCING':
                icon.textContent = '➡️';
                text.textContent = '前进';
                break;
                
            case 'RETREATING':
                icon.textContent = '⬅️';
                text.textContent = '后退';
                break;
        }
    }
    
    /**
     * Show action detection result
     */
    showAction(action, quality) {
        const overlay = this.elements.actionOverlay;
        const nameEl = this.elements.actionName;
        const qualityEl = this.elements.actionQuality;
        
        // Clear previous timeout
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
        }
        
        // Set content
        nameEl.textContent = ActionDisplayNames[action] || action;
        
        // Quality emoji
        const qualityEmoji = {
            'PERFECT': '⭐',
            'GOOD': '✅',
            'ACCEPTABLE': '👍',
            'POOR': '❌'
        };
        
        qualityEl.textContent = qualityEmoji[quality] || '';
        qualityEl.className = 'action-quality';
        
        if (quality === 'PERFECT') {
            qualityEl.classList.add('perfect');
        }
        
        // Show
        overlay.classList.add('show');
        
        // Hide after delay
        this.actionTimeout = setTimeout(() => {
            overlay.classList.remove('show');
        }, 1500);
    }
    
    /**
     * Set combo count
     */
    setCombo(count) {
        const container = this.elements.comboContainer;
        const countEl = this.elements.comboCount;
        
        countEl.textContent = count;
        
        if (count > 0) {
            container.classList.add('show');
            
            // Fire animation at milestones
            if (count === 5 || count === 10 || count % 10 === 0) {
                container.classList.add('fire');
                setTimeout(() => container.classList.remove('fire'), 300);
            }
        } else {
            container.classList.remove('show');
        }
    }
    
    /**
     * Show feedback toast
     */
    showFeedback(message, type = 'info') {
        const toast = this.elements.feedbackToast;
        
        // Clear previous timeout
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }
        
        // Set content
        toast.textContent = message;
        toast.className = 'feedback-toast';
        
        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'success') {
            toast.classList.add('success');
        }
        
        // Show
        toast.classList.add('show');
        
        // Hide after delay
        this.feedbackTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    /**
     * Update FPS display
     */
    updateFps(fps) {
        this.elements.fpsValue.textContent = fps;
    }
    
    /**
     * Update duration display
     */
    updateDuration(duration) {
        this.elements.durationValue.textContent = duration;
    }
    
    /**
     * Update stats display
     */
    updateStats(stats) {
        this.elements.actionCount.textContent = stats.actionCount;
        this.elements.perfectCount.textContent = stats.perfectCount;
    }
    
    /**
     * Show gallery modal
     */
    async showGallery() {
        this.elements.galleryModal.classList.remove('hidden');
        this.currentFilter = 'starred';
        await this.updateGalleryStats();
        await this.loadGalleryItems('starred');
    }
    
    /**
     * Hide gallery modal
     */
    hideGallery() {
        this.elements.galleryModal.classList.add('hidden');
    }
    
    /**
     * Update gallery stats
     */
    async updateGalleryStats() {
        const stats = await this.app.getGalleryStats();
        const videoCountEl = document.getElementById('video-count');
        const starredCountEl = document.getElementById('starred-count');
        
        if (videoCountEl) videoCountEl.textContent = `${stats.total} 个视频`;
        if (starredCountEl) starredCountEl.textContent = `${stats.starred} 个精彩`;
    }
    
    /**
     * Load gallery items
     */
    async loadGalleryItems(filter) {
        const grid = this.elements.galleryGrid;
        this.currentFilter = filter;
        
        // Show loading state
        grid.innerHTML = `
            <div class="loading-spinner">
                <span>加载中...</span>
            </div>
        `;
        
        const videos = await this.app.getGalleryVideos(filter);
        
        if (videos.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📹</span>
                    <p>还没有${filter === 'starred' ? '精彩' : ''}录制视频</p>
                    <p class="empty-hint">点击录制按钮开始</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = videos.map(video => `
            <div class="gallery-item" data-id="${video.id}">
                ${video.thumbnail 
                    ? `<img src="${video.thumbnail}" alt="视频缩略图" class="thumbnail">`
                    : `<div class="thumbnail" style="background: var(--secondary);"></div>`
                }
                <div class="play-icon">▶️</div>
                <span class="video-date">${this.formatDate(video.timestamp)}</span>
                <div class="overlay">
                    <span class="quality-badge">${video.starred ? '⭐' : '📝'}</span>
                    <span class="duration">${this.formatDuration(video.duration)}</span>
                </div>
            </div>
        `).join('');
        
        // Add click handlers for playback
        grid.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const videoId = parseInt(item.dataset.id);
                this.openVideoPlayer(videoId);
            });
        });
    }
    
    /**
     * Open video player modal
     */
    async openVideoPlayer(videoId) {
        const video = await this.app.getVideoById(videoId);
        if (!video) {
            this.showFeedback('视频加载失败', 'error');
            return;
        }
        
        this.currentVideoId = videoId;
        
        const playerModal = document.getElementById('video-player-modal');
        const playbackVideo = document.getElementById('playback-video');
        const videoDate = document.getElementById('video-date');
        const videoDuration = document.getElementById('video-duration');
        const videoActions = document.getElementById('video-actions');
        const videoPerfects = document.getElementById('video-perfects');
        
        // Create object URL for video blob
        if (this.currentVideoUrl) {
            URL.revokeObjectURL(this.currentVideoUrl);
        }
        this.currentVideoUrl = URL.createObjectURL(video.blob);
        playbackVideo.src = this.currentVideoUrl;
        
        // Update info
        if (videoDate) videoDate.textContent = this.formatFullDate(video.timestamp);
        if (videoDuration) videoDuration.textContent = this.formatDuration(video.duration);
        if (videoActions) videoActions.textContent = video.actionCount || 0;
        if (videoPerfects) videoPerfects.textContent = video.perfectCount || 0;
        
        // Update star button
        this.updateStarButton(video.starred);
        
        // Show modal
        playerModal?.classList.remove('hidden');
    }
    
    /**
     * Hide video player modal
     */
    hideVideoPlayer() {
        const playerModal = document.getElementById('video-player-modal');
        const playbackVideo = document.getElementById('playback-video');
        
        // Stop playback
        playbackVideo?.pause();
        playbackVideo.src = '';
        
        // Clean up object URL
        if (this.currentVideoUrl) {
            URL.revokeObjectURL(this.currentVideoUrl);
            this.currentVideoUrl = null;
        }
        
        this.currentVideoId = null;
        playerModal?.classList.add('hidden');
    }
    
    /**
     * Update star button state
     */
    updateStarButton(isStarred) {
        const starIcon = document.getElementById('star-icon');
        const btnToggleStar = document.getElementById('btn-toggle-star');
        
        if (starIcon) {
            starIcon.textContent = isStarred ? '⭐' : '☆';
        }
        if (btnToggleStar) {
            btnToggleStar.classList.toggle('active', isStarred);
        }
    }
    
    /**
     * Format date for gallery item (short format)
     */
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
    
    /**
     * Format full date for video player
     */
    formatFullDate(timestamp) {
        const date = new Date(timestamp);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        return `${month}月${day}日 ${hours}:${mins}`;
    }
    
    /**
     * Format duration in seconds to mm:ss
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}
