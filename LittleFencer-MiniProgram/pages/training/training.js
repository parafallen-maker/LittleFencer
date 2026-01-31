/**
 * 训练页面 - LittleFencer 小程序
 * 核心：摄像头 + Vision Kit 姿态检测 + 视频录制
 */

const app = getApp();

Page({
  data: {
    // 摄像头状态
    cameraReady: false,
    cameraPosition: 'front', // front | back
    cameraError: null,
    
    // 训练状态
    isTraining: false,
    currentState: 'idle', // idle | engarde | lunge | recovery
    stateText: '准备中',
    
    // 录制状态
    isRecording: false,
    recordingDuration: 0,
    
    // 统计数据
    actionCount: 0,
    perfectCount: 0,
    comboCount: 0,
    maxCombo: 0,
    
    // 反馈信息
    feedbackText: '',
    feedbackType: '', // success | error | info
    
    // 骨骼点数据
    skeletonPoints: [],
    skeletonVisible: true,
    
    // 定时器
    sessionDuration: 0
  },

  // 相机上下文
  cameraContext: null,
  // Vision Kit 会话
  visionSession: null,
  // 定时器
  sessionTimer: null,
  recordingTimer: null,

  onLoad() {
    console.log('[Training] 页面加载');
    this.initCamera();
  },

  onReady() {
    console.log('[Training] 页面就绪');
  },

  onShow() {
    // 页面显示时恢复相机
    if (this.data.cameraReady && this.data.isTraining) {
      this.startVisionKit();
    }
  },

  onHide() {
    // 页面隐藏时暂停
    this.stopVisionKit();
    if (this.data.isRecording) {
      this.stopRecording();
    }
  },

  onUnload() {
    this.stopTraining();
    this.stopRecording();
    this.cleanup();
  },

  /**
   * 初始化相机
   */
  initCamera() {
    this.cameraContext = wx.createCameraContext();
    console.log('[Training] 相机上下文创建完成');
  },

  /**
   * 相机初始化成功
   */
  onCameraReady(e) {
    console.log('[Training] 相机就绪');
    this.setData({ cameraReady: true, cameraError: null });
  },

  /**
   * 相机错误
   */
  onCameraError(e) {
    console.error('[Training] 相机错误:', e.detail);
    this.setData({ 
      cameraReady: false,
      cameraError: e.detail.errMsg || '相机初始化失败'
    });
    
    wx.showModal({
      title: '相机错误',
      content: '无法访问相机，请检查权限设置',
      showCancel: false
    });
  },

  /**
   * 切换摄像头
   */
  onFlipCamera() {
    const newPosition = this.data.cameraPosition === 'front' ? 'back' : 'front';
    this.setData({ cameraPosition: newPosition });
    console.log('[Training] 切换摄像头:', newPosition);
  },

  /**
   * 开始/停止训练
   */
  onToggleTraining() {
    if (this.data.isTraining) {
      this.stopTraining();
    } else {
      this.startTraining();
    }
  },

  /**
   * 开始训练
   */
  startTraining() {
    if (!this.data.cameraReady) {
      wx.showToast({ title: '相机未就绪', icon: 'none' });
      return;
    }

    console.log('[Training] 开始训练');
    
    this.setData({
      isTraining: true,
      currentState: 'idle',
      stateText: '请摆出 En Garde 姿势',
      actionCount: 0,
      perfectCount: 0,
      comboCount: 0,
      maxCombo: 0,
      sessionDuration: 0
    });

    // 启动 Vision Kit
    this.startVisionKit();
    
    // 启动计时器
    this.sessionTimer = setInterval(() => {
      this.setData({
        sessionDuration: this.data.sessionDuration + 1
      });
    }, 1000);

    this.showFeedback('训练开始！摆出 En Garde 姿势', 'info');
  },

  /**
   * 停止训练
   */
  stopTraining() {
    console.log('[Training] 停止训练');
    
    // 停止录制（如果正在录制）
    if (this.data.isRecording) {
      this.stopRecording();
    }
    
    // 停止 Vision Kit
    this.stopVisionKit();
    
    // 清除计时器
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }

    // 保存统计
    this.saveSessionStats();

    this.setData({
      isTraining: false,
      currentState: 'idle',
      stateText: '训练结束'
    });

    // 显示训练总结
    this.showTrainingSummary();
  },

  /**
   * 启动 Vision Kit
   */
  startVisionKit() {
    // 检查 Vision Kit 支持
    if (!wx.isVKSupport || !wx.isVKSupport('body')) {
      console.warn('[Training] Vision Kit 不支持人体检测');
      this.showFeedback('当前设备不支持姿态检测', 'error');
      return;
    }

    try {
      this.visionSession = wx.createVKSession({
        track: { body: { mode: 1 } }, // mode 1: 单人检测
        version: 'v1',
        gl: null // 不需要 WebGL
      });

      this.visionSession.on('updateAnchors', (anchors) => {
        this.processBodyAnchors(anchors);
      });

      this.visionSession.start((err) => {
        if (err) {
          console.error('[Training] Vision Kit 启动失败:', err);
          this.showFeedback('姿态检测启动失败', 'error');
        } else {
          console.log('[Training] Vision Kit 启动成功');
        }
      });
    } catch (e) {
      console.error('[Training] Vision Kit 初始化失败:', e);
    }
  },

  /**
   * 停止 Vision Kit
   */
  stopVisionKit() {
    if (this.visionSession) {
      this.visionSession.stop();
      this.visionSession = null;
      console.log('[Training] Vision Kit 已停止');
    }
  },

  /**
   * 处理人体关键点
   */
  processBodyAnchors(anchors) {
    if (!anchors || anchors.length === 0) {
      this.setData({ skeletonPoints: [] });
      return;
    }

    const body = anchors[0];
    if (!body || !body.points) return;

    // 转换关键点为绘制数据
    const points = body.points.map((p, idx) => ({
      x: p.x,
      y: p.y,
      score: p.score,
      index: idx
    }));

    this.setData({ skeletonPoints: points });

    // 分析姿态
    this.analyzePose(points);
  },

  /**
   * 分析姿态（简化版状态机）
   */
  analyzePose(points) {
    // 这里实现简化版的姿态分析
    // Vision Kit 返回 17 个关键点，需要映射到我们的状态判断

    // 简化示例：基于关键点位置判断状态
    // 实际实现需要根据 Vision Kit 的具体关键点索引进行计算

    const currentState = this.data.currentState;
    let newState = currentState;
    let isCorrect = true;

    // TODO: 实现具体的姿态判断逻辑
    // 1. 检测 En Garde 姿势
    // 2. 检测 Lunge 动作
    // 3. 检测 Recovery 回位

    // 示例状态转换逻辑
    if (currentState === 'idle') {
      // 检测是否进入 En Garde
      if (this.checkEnGarde(points)) {
        newState = 'engarde';
        this.showFeedback('很好！En Garde 姿势正确', 'success');
      }
    } else if (currentState === 'engarde') {
      // 检测是否开始 Lunge
      if (this.checkLungeStart(points)) {
        newState = 'lunge';
      }
    } else if (currentState === 'lunge') {
      // 检测 Lunge 质量
      const quality = this.checkLungeQuality(points);
      if (quality.completed) {
        this.recordAction(quality.isPerfect);
        newState = 'recovery';
      }
    } else if (currentState === 'recovery') {
      // 检测是否回到 En Garde
      if (this.checkEnGarde(points)) {
        newState = 'engarde';
        this.showFeedback('准备下一个动作', 'info');
      }
    }

    if (newState !== currentState) {
      this.setData({
        currentState: newState,
        stateText: this.getStateText(newState)
      });
    }
  },

  /**
   * 检测 En Garde 姿势（简化版）
   */
  checkEnGarde(points) {
    // TODO: 实现实际的 En Garde 检测逻辑
    // 基于肩、肘、膝、踝的角度判断
    return false; // 示例返回
  },

  /**
   * 检测 Lunge 开始
   */
  checkLungeStart(points) {
    // TODO: 检测前脚开始移动
    return false;
  },

  /**
   * 检测 Lunge 质量
   */
  checkLungeQuality(points) {
    // TODO: 检测弓步质量
    return { completed: false, isPerfect: false };
  },

  /**
   * 获取状态显示文字
   */
  getStateText(state) {
    const texts = {
      idle: '准备中',
      engarde: 'En Garde ✓',
      lunge: '弓步中...',
      recovery: '回位中...'
    };
    return texts[state] || '准备中';
  },

  /**
   * 记录动作
   */
  recordAction(isPerfect) {
    let { actionCount, perfectCount, comboCount, maxCombo } = this.data;
    
    actionCount++;
    comboCount++;
    
    if (isPerfect) {
      perfectCount++;
      this.showFeedback('完美！ Perfect! 🌟', 'success');
    } else {
      this.showFeedback('不错！继续加油', 'info');
    }

    maxCombo = Math.max(maxCombo, comboCount);

    this.setData({
      actionCount,
      perfectCount,
      comboCount,
      maxCombo
    });

    // 触发震动反馈
    wx.vibrateShort({ type: 'medium' });
  },

  /**
   * 重置 Combo
   */
  resetCombo() {
    this.setData({ comboCount: 0 });
  },

  /**
   * 显示反馈
   */
  showFeedback(text, type = 'info') {
    this.setData({
      feedbackText: text,
      feedbackType: type
    });

    // 3秒后清除
    setTimeout(() => {
      this.setData({ feedbackText: '' });
    }, 3000);
  },

  /**
   * 开始/停止录制
   */
  onToggleRecording() {
    if (this.data.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  /**
   * 开始录制
   */
  startRecording() {
    if (!this.cameraContext) {
      wx.showToast({ title: '相机未就绪', icon: 'none' });
      return;
    }

    console.log('[Training] 开始录制');
    
    this.cameraContext.startRecord({
      timeoutCallback: () => {
        // 达到最大录制时长
        this.stopRecording();
      },
      success: () => {
        this.setData({ 
          isRecording: true,
          recordingDuration: 0
        });
        
        // 启动录制计时
        this.recordingTimer = setInterval(() => {
          this.setData({
            recordingDuration: this.data.recordingDuration + 1
          });
          
          // 最长 60 秒
          if (this.data.recordingDuration >= 60) {
            this.stopRecording();
          }
        }, 1000);
        
        this.showFeedback('开始录制', 'info');
      },
      fail: (err) => {
        console.error('[Training] 录制启动失败:', err);
        wx.showToast({ title: '录制启动失败', icon: 'none' });
      }
    });
  },

  /**
   * 停止录制
   */
  stopRecording() {
    if (!this.data.isRecording) return;

    console.log('[Training] 停止录制');
    
    // 清除计时器
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    this.cameraContext.stopRecord({
      success: (res) => {
        console.log('[Training] 录制完成:', res.tempVideoPath);
        
        this.setData({ isRecording: false });
        
        // 保存视频
        this.saveVideo(res.tempVideoPath);
      },
      fail: (err) => {
        console.error('[Training] 停止录制失败:', err);
        this.setData({ isRecording: false });
      }
    });
  },

  /**
   * 保存视频
   */
  saveVideo(tempPath) {
    wx.showActionSheet({
      itemList: ['保存到相册', '稍后保存'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 保存到相册
          wx.saveVideoToPhotosAlbum({
            filePath: tempPath,
            success: () => {
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: (err) => {
              console.error('[Training] 保存失败:', err);
              if (err.errMsg.includes('auth')) {
                wx.showModal({
                  title: '需要权限',
                  content: '请允许保存到相册的权限',
                  success: (res) => {
                    if (res.confirm) {
                      wx.openSetting();
                    }
                  }
                });
              }
            }
          });
        } else {
          // 保存到云存储（稍后实现）
          this.saveVideoToCloud(tempPath);
        }
      }
    });
  },

  /**
   * 保存视频到云存储
   */
  async saveVideoToCloud(tempPath) {
    try {
      wx.showLoading({ title: '上传中...' });
      
      const fileName = `videos/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
      
      const res = await wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: tempPath
      });
      
      wx.hideLoading();
      console.log('[Training] 视频上传成功:', res.fileID);
      
      // 保存视频记录到数据库
      await this.saveVideoRecord(res.fileID);
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      
    } catch (err) {
      wx.hideLoading();
      console.error('[Training] 上传失败:', err);
      wx.showToast({ title: '上传失败', icon: 'none' });
    }
  },

  /**
   * 保存视频记录
   */
  async saveVideoRecord(fileID) {
    const db = wx.cloud.database();
    
    await db.collection('videos').add({
      data: {
        fileID: fileID,
        duration: this.data.recordingDuration,
        actionCount: this.data.actionCount,
        perfectCount: this.data.perfectCount,
        maxCombo: this.data.maxCombo,
        createTime: db.serverDate()
      }
    });
  },

  /**
   * 保存训练统计
   */
  saveSessionStats() {
    const stats = {
      actionCount: this.data.actionCount,
      perfectCount: this.data.perfectCount,
      maxCombo: this.data.maxCombo,
      trainingTime: Math.floor(this.data.sessionDuration / 60)
    };
    
    app.updateTodayStats(stats);
    console.log('[Training] 统计已保存:', stats);
  },

  /**
   * 显示训练总结
   */
  showTrainingSummary() {
    const { actionCount, perfectCount, maxCombo, sessionDuration } = this.data;
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = sessionDuration % 60;
    
    wx.showModal({
      title: '🎉 训练完成！',
      content: `时长: ${minutes}分${seconds}秒\n动作数: ${actionCount}\n完美: ${perfectCount}\n最高连击: ${maxCombo}`,
      confirmText: '分享成绩',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          // 跳转到分享卡片生成
          wx.navigateTo({
            url: `/pages/challenge/challenge?action=share&stats=${JSON.stringify({
              actionCount, perfectCount, maxCombo, duration: sessionDuration
            })}`
          });
        }
      }
    });
  },

  /**
   * 清理资源
   */
  cleanup() {
    this.stopVisionKit();
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
    }
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: `我刚完成了 ${this.data.actionCount} 个动作，最高 ${this.data.maxCombo} 连击！`,
      path: '/pages/index/index'
    };
  }
});
