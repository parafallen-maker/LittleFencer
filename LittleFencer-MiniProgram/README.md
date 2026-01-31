# LittleFencer 微信小程序

> 青少年佩剑训练助手 - 微信小程序版

## 📁 项目结构

```
LittleFencer-MiniProgram/
├── app.js                 # 小程序入口
├── app.json               # 小程序配置
├── app.wxss               # 全局样式
├── project.config.json    # 项目配置
├── sitemap.json           # 站点地图
│
├── pages/                 # 页面
│   ├── index/             # 首页
│   ├── training/          # 训练页（核心）
│   ├── gallery/           # 视频画廊
│   ├── challenge/         # 好友挑战
│   ├── rank/              # 排行榜
│   └── profile/           # 个人中心
│
├── components/            # 自定义组件
│   ├── skeleton/          # 骨骼渲染组件
│   ├── combo-counter/     # Combo 计数器
│   ├── action-card/       # 动作卡片
│   ├── video-player/      # 视频播放器
│   └── share-card/        # 分享卡片
│
├── utils/                 # 工具函数
├── services/              # 云服务接口
└── assets/                # 静态资源
    ├── images/
    └── icons/
```

## 🚀 快速开始

### 1. 准备工作

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 注册微信小程序账号，获取 AppID
3. 开通云开发

### 2. 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 选择本项目目录
4. 填写你的 AppID

### 3. 配置云开发

1. 点击「云开发」按钮
2. 创建云开发环境
3. 复制环境 ID
4. 修改 `app.js` 中的 `cloudEnvId`

### 4. 创建数据库集合

在云开发控制台创建以下集合：

- `users` - 用户信息
- `videos` - 视频记录
- `training_records` - 训练记录
- `challenges` - 挑战记录
- `rankings` - 排行榜

## 📱 核心功能

### 训练页面
- 📷 摄像头实时预览
- 🦴 Vision Kit 姿态检测
- 🎯 动作识别与计数
- 🔥 Combo 连击系统
- ⏺️ 视频录制

### 视频画廊
- 📹 视频列表展示
- ▶️ 视频播放
- 📤 分享功能
- 💾 保存到相册
- 🗑️ 删除管理

### 社交功能
- 🎮 好友挑战
- 🏆 排行榜
- 📊 训练统计
- 🎴 成就卡片分享

## ⚠️ 注意事项

1. **Vision Kit 兼容性**：仅支持部分机型，需要做好降级处理
2. **云开发配额**：注意免费额度限制
3. **隐私权限**：需要正确申请相机、相册权限

## 📝 开发计划

查看 [todos-miniprogram.md](../docs/todos-miniprogram.md) 获取详细开发任务

## 🔗 相关资源

- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [Vision Kit 文档](https://developers.weixin.qq.com/miniprogram/dev/api/ai/visionkit/)
- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
