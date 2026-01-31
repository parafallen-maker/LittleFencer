/**
 * 首页 - LittleFencer 小程序
 */

const app = getApp();

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    todayStats: {
      actionCount: 0,
      perfectCount: 0,
      maxCombo: 0,
      trainingTime: 0
    },
    // 快捷入口
    quickActions: [
      { id: 'training', icon: '⚔️', title: '开始训练', desc: '实时姿态检测' },
      { id: 'challenge', icon: '🎮', title: '好友挑战', desc: '发起PK对战' },
      { id: 'gallery', icon: '📹', title: '我的视频', desc: '训练回放' },
      { id: 'rank', icon: '🏆', title: '排行榜', desc: '看看谁最强' }
    ],
    // 最近成就
    recentBadges: [],
    // 今日挑战
    dailyChallenge: null
  },

  onLoad() {
    this.loadUserInfo();
    this.loadTodayStats();
    this.loadDailyChallenge();
  },

  onShow() {
    // 每次显示时刷新统计
    this.loadTodayStats();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({
        userInfo,
        isLoggedIn: true
      });
    }
  },

  /**
   * 加载今日统计
   */
  loadTodayStats() {
    const stats = app.getTodayStats();
    this.setData({ todayStats: stats });
  },

  /**
   * 加载每日挑战
   */
  loadDailyChallenge() {
    // TODO: 从云端获取每日挑战
    this.setData({
      dailyChallenge: {
        title: '完成 10 个标准弓步',
        progress: 3,
        total: 10,
        reward: '🏅 弓步达人'
      }
    });
  },

  /**
   * 用户登录
   */
  async onLogin() {
    try {
      wx.showLoading({ title: '登录中...' });
      
      await app.login();
      const userInfo = await app.getUserProfile();
      
      this.setData({
        userInfo,
        isLoggedIn: true
      });
      
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      
    } catch (err) {
      wx.hideLoading();
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  /**
   * 快捷入口点击
   */
  onQuickAction(e) {
    const { id } = e.currentTarget.dataset;
    
    switch (id) {
      case 'training':
        wx.switchTab({ url: '/pages/training/training' });
        break;
      case 'challenge':
        wx.navigateTo({ url: '/pages/challenge/challenge' });
        break;
      case 'gallery':
        wx.switchTab({ url: '/pages/gallery/gallery' });
        break;
      case 'rank':
        wx.switchTab({ url: '/pages/rank/rank' });
        break;
    }
  },

  /**
   * 开始训练按钮
   */
  onStartTraining() {
    wx.switchTab({ url: '/pages/training/training' });
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '⚔️ LittleFencer - 一起来练剑！',
      path: '/pages/index/index',
      imageUrl: '/assets/images/share_cover.png'
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '⚔️ 我在用 LittleFencer 练习佩剑，一起来挑战吧！',
      imageUrl: '/assets/images/share_cover.png'
    };
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadTodayStats();
    this.loadDailyChallenge();
    wx.stopPullDownRefresh();
  }
});
