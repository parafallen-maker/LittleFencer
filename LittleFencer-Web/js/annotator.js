/**
 * LittleFencer - Action Annotator Tool (Optimized Workflow)
 * 用于标注击剑训练视频中的动作
 * 
 * 工作流程:
 * 1. 选择动作类型 → 标记起点 → 标记终点
 * 2. 显示确认面板: ✅可用(自动保存并播放下一段) / ❌丢弃(跳过)
 */

class ActionAnnotator {
    constructor() {
        // DOM Elements
        this.video = document.getElementById('videoPlayer');
        this.skeletonCanvas = document.getElementById('skeletonOverlay');
        this.skeletonCtx = this.skeletonCanvas.getContext('2d');

        // State
        this.annotations = [];
        this.skeletonData = null;
        this.currentAction = 'lunge';
        this.markingStart = null;
        this.pendingAnnotation = null; // 待确认的标注
        this.fps = 30;
        this.isPlaying = false;

        // Action colors
        this.actionColors = {
            en_garde: '#4CAF50',
            lunge: '#FF5722',
            advance: '#2196F3',
            retreat: '#9C27B0'
        };

        this.actionNames = {
            en_garde: '准备姿势',
            lunge: '弓步',
            advance: '前进步',
            retreat: '后退步'
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.updateStats();

        // Select default action
        document.querySelector('[data-action="lunge"]').classList.add('active');

        console.log('✅ ActionAnnotator initialized (Optimized Workflow)');
    }

    bindEvents() {
        // Import/Export
        document.getElementById('importBtn').addEventListener('click', () => this.showImportModal());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());

        // Modal
        document.getElementById('cancelImportBtn').addEventListener('click', () => this.hideImportModal());
        document.getElementById('selectVideoBtn').addEventListener('click', () => {
            document.getElementById('videoInput').click();
        });
        document.getElementById('selectSkeletonBtn').addEventListener('click', () => {
            document.getElementById('skeletonInput').click();
        });
        document.getElementById('confirmImportBtn').addEventListener('click', () => this.confirmImport());

        // File inputs
        document.getElementById('videoInput').addEventListener('change', (e) => this.onVideoSelected(e));
        document.getElementById('skeletonInput').addEventListener('change', (e) => this.onSkeletonSelected(e));

        // Video controls
        document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('prevFrameBtn').addEventListener('click', () => this.prevFrame());
        document.getElementById('nextFrameBtn').addEventListener('click', () => this.nextFrame());

        // Video events
        this.video.addEventListener('loadedmetadata', () => this.onVideoLoaded());
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('play', () => {
            this.isPlaying = true;
            document.getElementById('playPauseBtn').textContent = '⏸ 暂停';
        });
        this.video.addEventListener('pause', () => {
            this.isPlaying = false;
            document.getElementById('playPauseBtn').textContent = '▶️ 播放';
        });

        // Timeline click
        document.getElementById('timeline').addEventListener('click', (e) => this.onTimelineClick(e));

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectAction(btn.dataset.action));
        });

        // Mark buttons
        document.getElementById('markStartBtn').addEventListener('click', () => this.markStart());
        document.getElementById('markEndBtn').addEventListener('click', () => this.markEnd());

        // Confirmation buttons (新增)
        document.getElementById('confirmValidBtn').addEventListener('click', () => this.confirmValid());
        document.getElementById('confirmDiscardBtn').addEventListener('click', () => this.confirmDiscard());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // ===== Import/Export =====

    showImportModal() {
        document.getElementById('importModal').style.display = 'flex';
    }

    hideImportModal() {
        document.getElementById('importModal').style.display = 'none';
    }

    onVideoSelected(e) {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('videoFileName').textContent = file.name;
            this.videoFile = file;
            this.updateConfirmButton();
        }
    }

    onSkeletonSelected(e) {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('skeletonFileName').textContent = file.name;
            this.skeletonFile = file;
        }
    }

    updateConfirmButton() {
        document.getElementById('confirmImportBtn').disabled = !this.videoFile;
    }

    async confirmImport() {
        if (!this.videoFile) return;

        // Load video
        const videoURL = URL.createObjectURL(this.videoFile);
        this.video.src = videoURL;

        // Load skeleton data if provided
        if (this.skeletonFile) {
            try {
                const text = await this.skeletonFile.text();
                const parsed = JSON.parse(text);
                // Imported files are untrusted: only accept the expected shape
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.skeleton_sequence)) {
                    this.skeletonData = parsed;
                    console.log('✅ Skeleton data loaded:', parsed.skeleton_sequence.length, 'frames');
                } else {
                    this.skeletonData = null;
                    console.error('Invalid skeleton data: missing skeleton_sequence array');
                    alert('骨骼数据格式不正确（缺少 skeleton_sequence 数组），已忽略');
                }
            } catch (err) {
                console.error('Failed to parse skeleton data:', err);
                alert('骨骼数据解析失败，已忽略');
            }
        }

        // Reset annotations
        this.annotations = [];
        this.updateAnnotationsList();
        this.updateStats();

        this.hideImportModal();
    }

    exportData() {
        if (this.annotations.length === 0) {
            alert('没有标注数据可导出');
            return;
        }

        // 生成标准化文件名
        const videoName = this.videoFile?.name?.replace(/\.[^/.]+$/, '') || 'unknown';
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `${videoName}_${timestamp}.json`;

        const data = {
            // 元数据
            version: '1.0',
            video_id: this.videoFile?.name || 'unknown',
            video_source: this.videoFile?.name || 'unknown',
            fps: this.fps,
            duration_ms: Math.floor(this.video.duration * 1000),
            total_frames: Math.floor(this.video.duration * this.fps),

            // 标注数据
            annotations: this.annotations.map(ann => ({
                id: ann.id,
                action: ann.action,
                start_frame: ann.start_frame,
                end_frame: ann.end_frame,
                duration_frames: ann.end_frame - ann.start_frame,
                start_time_ms: Math.floor(ann.start_frame / this.fps * 1000),
                end_time_ms: Math.floor(ann.end_frame / this.fps * 1000)
            })),

            // 骨骼数据 (用于训练)
            skeleton_sequence: this.skeletonData?.skeleton_sequence || null,
            has_skeleton: !!this.skeletonData?.skeleton_sequence,

            // 导出信息
            exported_at: new Date().toISOString(),
            annotation_count: this.annotations.length
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);

        console.log(`✅ Exported ${this.annotations.length} annotations to ${filename}`);
        console.log('📋 放置到 datasets/annotations/raw/ 目录供训练使用');
    }

    // ===== Video Controls =====

    onVideoLoaded() {
        console.log('Video loaded:', this.video.duration, 'seconds');
        this.resizeCanvas();
        const totalFrames = Math.floor(this.video.duration * this.fps);
        document.getElementById('totalFrames').textContent = totalFrames;
        this.detectFPS();
    }

    resizeCanvas() {
        const rect = this.video.getBoundingClientRect();
        this.skeletonCanvas.width = rect.width;
        this.skeletonCanvas.height = rect.height;
    }

    detectFPS() {
        this.fps = 30;
    }

    onTimeUpdate() {
        const currentFrame = Math.floor(this.video.currentTime * this.fps);
        const currentTime = this.formatTime(this.video.currentTime);
        const progress = (this.video.currentTime / this.video.duration) * 100;

        document.getElementById('currentFrame').textContent = currentFrame;
        document.getElementById('currentTime').textContent = currentTime;
        document.getElementById('timelineProgress').style.width = progress + '%';

        this.drawSkeleton(currentFrame);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    togglePlay() {
        if (this.video.paused) {
            this.video.play();
        } else {
            this.video.pause();
        }
    }

    prevFrame() {
        this.video.pause();
        this.video.currentTime = Math.max(0, this.video.currentTime - 1 / this.fps);
    }

    nextFrame() {
        this.video.pause();
        this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 1 / this.fps);
    }

    onTimelineClick(e) {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        this.video.currentTime = percent * this.video.duration;
    }

    // ===== Skeleton Drawing =====

    drawSkeleton(frameIndex) {
        this.skeletonCtx.clearRect(0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);

        if (!this.skeletonData?.skeleton_sequence) return;

        const frameData = this.skeletonData.skeleton_sequence[frameIndex];
        if (!frameData?.landmarks) return;

        const landmarks = frameData.landmarks;
        const w = this.skeletonCanvas.width;
        const h = this.skeletonCanvas.height;

        const connections = [
            [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
            [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
        ];

        this.skeletonCtx.strokeStyle = '#00ff00';
        this.skeletonCtx.lineWidth = 2;

        connections.forEach(([i, j]) => {
            if (landmarks[i] && landmarks[j]) {
                const p1 = landmarks[i];
                const p2 = landmarks[j];
                if (p1.visibility > 0.5 && p2.visibility > 0.5) {
                    this.skeletonCtx.beginPath();
                    this.skeletonCtx.moveTo(p1.x * w, p1.y * h);
                    this.skeletonCtx.lineTo(p2.x * w, p2.y * h);
                    this.skeletonCtx.stroke();
                }
            }
        });

        this.skeletonCtx.fillStyle = '#ff0000';
        landmarks.forEach(point => {
            if (point.visibility > 0.5) {
                this.skeletonCtx.beginPath();
                this.skeletonCtx.arc(point.x * w, point.y * h, 4, 0, Math.PI * 2);
                this.skeletonCtx.fill();
            }
        });
    }

    // ===== Action Selection =====

    selectAction(action) {
        this.currentAction = action;
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.action === action);
        });
    }

    // ===== Marking =====

    markStart() {
        const currentFrame = Math.floor(this.video.currentTime * this.fps);
        this.markingStart = currentFrame;

        // Keep markStartBtn enabled for re-clicking to override
        document.getElementById('markEndBtn').disabled = false;

        document.getElementById('currentMarking').style.display = 'block';
        document.getElementById('markingAction').textContent = this.actionNames[this.currentAction];
        document.getElementById('markingStart').textContent = currentFrame;
    }

    markEnd() {
        if (this.markingStart === null) return;

        const endFrame = Math.floor(this.video.currentTime * this.fps);

        if (endFrame <= this.markingStart) {
            alert('终点帧必须在起点帧之后');
            return;
        }

        // 暂存待确认标注
        this.pendingAnnotation = {
            id: Date.now(),
            start_frame: this.markingStart,
            end_frame: endFrame,
            action: this.currentAction
        };

        // 显示确认面板
        this.showConfirmPanel();
    }

    showConfirmPanel() {
        const ann = this.pendingAnnotation;
        const info = `${this.actionNames[ann.action]}: 帧 ${ann.start_frame} → ${ann.end_frame}`;
        document.getElementById('confirmInfo').textContent = info;
        document.getElementById('confirmSelector').style.display = 'block';

        // 暂停视频以便确认
        this.video.pause();
    }

    hideConfirmPanel() {
        document.getElementById('confirmSelector').style.display = 'none';
        this.pendingAnnotation = null;

        // 重置标记状态
        this.markingStart = null;
        document.getElementById('markStartBtn').disabled = false;
        document.getElementById('markEndBtn').disabled = true;
        document.getElementById('currentMarking').style.display = 'none';
    }

    confirmValid() {
        if (!this.pendingAnnotation) return;

        // 保存标注
        this.annotations.push(this.pendingAnnotation);
        this.annotations.sort((a, b) => a.start_frame - b.start_frame);

        console.log('✅ 保存标注:', this.pendingAnnotation);

        // 更新UI
        this.updateAnnotationsList();
        this.updateTimelineMarkers();
        this.updateStats();

        // 自动保存到localStorage (防止数据丢失)
        this.autoSave();

        // 隐藏确认面板并播放下一段
        this.hideConfirmPanel();
        this.playNextSegment();
    }

    confirmDiscard() {
        if (!this.pendingAnnotation) return;

        console.log('❌ 丢弃标注:', this.pendingAnnotation);

        // 隐藏确认面板并播放下一段
        this.hideConfirmPanel();
        this.playNextSegment();
    }

    playNextSegment() {
        // 自动播放视频继续
        setTimeout(() => {
            this.video.play();
        }, 300);
    }

    autoSave() {
        // 自动保存到localStorage
        const key = `annotations_${this.videoFile?.name || 'temp'}`;
        const data = {
            video_id: this.videoFile?.name || 'unknown',
            annotations: this.annotations,
            saved_at: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log('💾 Auto-saved to localStorage');
    }

    deleteAnnotation(id) {
        this.annotations = this.annotations.filter(a => a.id !== id);
        this.updateAnnotationsList();
        this.updateTimelineMarkers();
        this.updateStats();
        this.autoSave();
    }

    // ===== UI Updates =====

    updateAnnotationsList() {
        const list = document.getElementById('annotationsList');
        list.innerHTML = '';

        this.annotations.forEach(ann => {
            const li = document.createElement('li');
            li.className = 'annotation-item';
            li.style.borderColor = this.actionColors[ann.action];
            // Coerce interpolated values: only whitelisted action names and
            // real numbers may reach innerHTML.
            const actionName = this.actionNames[ann.action] || '未知动作';
            const startFrame = Number(ann.start_frame) || 0;
            const endFrame = Number(ann.end_frame) || 0;
            const annId = Number(ann.id) || 0;
            li.innerHTML = `
                <div>
                    <span class="action-name" style="color: ${this.actionColors[ann.action] || '#999'}">
                        ${actionName}
                    </span>
                    <span class="frame-range">帧 ${startFrame} - ${endFrame}</span>
                </div>
                <button class="delete-btn" data-id="${annId}">🗑</button>
            `;

            li.querySelector('.delete-btn').addEventListener('click', () => {
                this.deleteAnnotation(ann.id);
            });

            list.appendChild(li);
        });

        document.getElementById('annotationCount').textContent = this.annotations.length;
    }

    updateTimelineMarkers() {
        const container = document.getElementById('annotationMarkers');
        container.innerHTML = '';

        if (!this.video.duration) return;

        const totalFrames = this.video.duration * this.fps;

        this.annotations.forEach(ann => {
            const marker = document.createElement('div');
            marker.className = 'annotation-marker';
            marker.style.backgroundColor = this.actionColors[ann.action];
            marker.style.left = (ann.start_frame / totalFrames * 100) + '%';
            marker.style.width = ((ann.end_frame - ann.start_frame) / totalFrames * 100) + '%';
            container.appendChild(marker);
        });
    }

    updateStats() {
        const stats = { en_garde: 0, lunge: 0, advance: 0, retreat: 0 };

        this.annotations.forEach(ann => {
            if (stats[ann.action] !== undefined) {
                stats[ann.action]++;
            }
        });

        document.getElementById('statEnGarde').textContent = stats.en_garde;
        document.getElementById('statLunge').textContent = stats.lunge;
        document.getElementById('statAdvance').textContent = stats.advance;
        document.getElementById('statRetreat').textContent = stats.retreat;
    }

    // ===== Keyboard Shortcuts =====

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // 如果确认面板显示中，特殊处理
        if (this.pendingAnnotation) {
            switch (e.key) {
                case 'Enter':
                case 'y':
                case 'Y':
                    e.preventDefault();
                    this.confirmValid();
                    return;
                case 'Escape':
                case 'n':
                case 'N':
                    e.preventDefault();
                    this.confirmDiscard();
                    return;
            }
        }

        switch (e.key) {
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.prevFrame();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextFrame();
                break;
            case '[':
                this.markStart();
                break;
            case ']':
                if (!document.getElementById('markEndBtn').disabled) {
                    this.markEnd();
                }
                break;
            case '1':
                this.selectAction('en_garde');
                break;
            case '2':
                this.selectAction('lunge');
                break;
            case '3':
                this.selectAction('advance');
                break;
            case '4':
                this.selectAction('retreat');
                break;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.annotator = new ActionAnnotator();

    // Keyboard shortcut help panel toggle
    const helpBtn = document.getElementById('shortcutHelpBtn');
    const helpPanel = document.getElementById('shortcutPanel');
    const closeBtn = document.getElementById('closeShortcutPanel');

    if (helpBtn && helpPanel) {
        helpBtn.addEventListener('click', () => {
            helpPanel.classList.toggle('hidden');
        });
        closeBtn?.addEventListener('click', () => {
            helpPanel.classList.add('hidden');
        });

        // Toggle help with '?' key
        document.addEventListener('keydown', (e) => {
            if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                helpPanel.classList.toggle('hidden');
            }
        });
    }
});
