/**
 * 视频画廊页面 - LittleFencer 小程序
 */

const app = getApp();

Page({
  data: {
    videos: [],
    loading: true,
    currentFilter: 'all', // all | starred | recent
    
    // 当前播放的视频
    currentVideo: null,
    showPlayer: false
  },

  onLoad() {
    this.loadVideos();
  },

  onShow() {
    this.loadVideos();
  },

  /**
   * 加载视频列表
   */
  async loadVideos() {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('videos')
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      
      this.setData({
        videos: res.data,
        loading: false
      });
      
    } catch (err) {
      console.error('[Gallery] 加载失败:', err);
      this.setData({ loading: false });
      
      // 使用示例数据
      this.setData({
        videos: []
      });
    }
  },

  /**
   * 切换筛选
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ currentFilter: filter });
    this.loadVideos();
  },

  /**
   * 播放视频
   */
  onPlayVideo(e) {
    const video = e.currentTarget.dataset.video;
    this.setData({
      currentVideo: video,
      showPlayer: true
    });
  },

  /**
   * 关闭播放器
   */
  onClosePlayer() {
    this.setData({
      showPlayer: false,
      currentVideo: null
    });
  },

  /**
   * 删除视频
   */
  async onDeleteVideo(e) {
    const video = e.currentTarget.dataset.video;
    
    const res = await wx.showModal({
      title: '确认删除',
      content: '确定要删除这个视频吗？'
    });
    
    if (res.confirm) {
      try {
        const db = wx.cloud.database();
        await db.collection('videos').doc(video._id).remove();
        
        // 删除云存储文件
        await wx.cloud.deleteFile({ fileList: [video.fileID] });
        
        wx.showToast({ title: '已删除', icon: 'success' });
        this.loadVideos();
        
      } catch (err) {
        console.error('[Gallery] 删除失败:', err);
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }
  },

  /**
   * 分享视频
   */
  onShareVideo(e) {
    const video = e.currentTarget.dataset.video;
    // 跳转到分享页面
    wx.navigateTo({
      url: `/pages/challenge/challenge?action=share&videoId=${video._id}`
    });
  },

  /**
   * 保存到相册
   */
  async onSaveToAlbum(e) {
    const video = e.currentTarget.dataset.video;
    
    try {
      wx.showLoading({ title: '下载中...' });
      
      // 从云存储下载
      const res = await wx.cloud.downloadFile({ fileID: video.fileID });
      
      // 保存到相册
      await wx.saveVideoToPhotosAlbum({ filePath: res.tempFilePath });
      
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      
    } catch (err) {
      wx.hideLoading();
      console.error('[Gallery] 保存失败:', err);
      
      if (err.errMsg && err.errMsg.includes('auth')) {
        wx.showModal({
          title: '需要权限',
          content: '请允许保存到相册',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadVideos();
    wx.stopPullDownRefresh();
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '我的佩剑训练视频集锦',
      path: '/pages/gallery/gallery'
    };
  }
});
