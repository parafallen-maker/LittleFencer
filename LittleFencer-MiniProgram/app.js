/**
 * LittleFencer 微信小程序 - 主入口
 * 青少年佩剑训练助手
 */

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    // 训练统计
    todayStats: {
      actionCount: 0,
      perfectCount: 0,
      maxCombo: 0,
      trainingTime: 0
    },
    // 系统信息
    systemInfo: null,
    // 云环境ID (需要替换为实际的云环境ID)
    cloudEnvId: 'your-cloud-env-id'
  },

  onLaunch() {
    console.log('[App] LittleFencer 小程序启动');
    
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true
      });
      console.log('[App] 云开发初始化完成');
    } else {
      console.warn('[App] 当前版本不支持云开发');
    }
    
    // 获取系统信息
    this.getSystemInfo();
    
    // 检查登录状态
    this.checkLoginStatus();
    
    // 检查更新
    this.checkUpdate();
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      console.log('[App] 系统信息:', {
        platform: systemInfo.platform,
        model: systemInfo.model,
        screenWidth: systemInfo.screenWidth,
        screenHeight: systemInfo.screenHeight
      });
    } catch (e) {
      console.error('[App] 获取系统信息失败:', e);
    }
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    wx.checkSession({
      success: () => {
        // session 有效，从本地获取用户信息
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo) {
          this.globalData.userInfo = userInfo;
          this.globalData.isLoggedIn = true;
          console.log('[App] 用户已登录:', userInfo.nickName);
        }
      },
      fail: () => {
        // session 过期，需要重新登录
        this.globalData.isLoggedIn = false;
        console.log('[App] 登录态已过期');
      }
    });
  },

  /**
   * 微信登录
   */
  async login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            console.log('[App] 登录成功, code:', res.code);
            // TODO: 发送 code 到后端换取 openId
            resolve(res.code);
          } else {
            reject(new Error('登录失败'));
          }
        },
        fail: reject
      });
    });
  },

  /**
   * 获取用户信息
   */
  async getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于显示您的训练成绩',
        success: (res) => {
          const userInfo = res.userInfo;
          this.globalData.userInfo = userInfo;
          this.globalData.isLoggedIn = true;
          wx.setStorageSync('userInfo', userInfo);
          console.log('[App] 获取用户信息成功:', userInfo.nickName);
          resolve(userInfo);
        },
        fail: (err) => {
          console.error('[App] 获取用户信息失败:', err);
          reject(err);
        }
      });
    });
  },

  /**
   * 检查小程序更新
   */
  checkUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('[App] 发现新版本');
        }
      });
      
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });
      
      updateManager.onUpdateFailed(() => {
        console.error('[App] 新版本下载失败');
      });
    }
  },

  /**
   * 更新今日统计
   */
  updateTodayStats(stats) {
    const today = this.globalData.todayStats;
    today.actionCount += stats.actionCount || 0;
    today.perfectCount += stats.perfectCount || 0;
    today.maxCombo = Math.max(today.maxCombo, stats.maxCombo || 0);
    today.trainingTime += stats.trainingTime || 0;
    
    // 保存到本地
    wx.setStorageSync('todayStats', {
      date: new Date().toDateString(),
      ...today
    });
  },

  /**
   * 获取今日统计
   */
  getTodayStats() {
    const saved = wx.getStorageSync('todayStats');
    const today = new Date().toDateString();
    
    if (saved && saved.date === today) {
      this.globalData.todayStats = saved;
    } else {
      // 新的一天，重置统计
      this.globalData.todayStats = {
        actionCount: 0,
        perfectCount: 0,
        maxCombo: 0,
        trainingTime: 0
      };
    }
    
    return this.globalData.todayStats;
  }
});
