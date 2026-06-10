# LittleFencer Web ⚔️

AI 驱动的青少年佩剑训练助手 — Web PWA 版本

> **版本：** 3.1 | **更新日期：** 2026-06-10 | **代码量：** 约 8,600 行 JS

## 🚀 快速开始

### 启动本地服务器

```bash
cd LittleFencer-Web
chmod +x serve.sh
./serve.sh
```

或使用 Python 直接启动：

```bash
python3 -m http.server 8080
```

然后在浏览器打开: http://localhost:8080

### 在手机上使用

1. 确保手机和电脑在同一 WiFi 网络
2. 查看终端输出的局域网地址（如 `http://192.168.1.100:8080`）
3. 在手机浏览器打开该地址
4. 点击"添加到主屏幕"即可像 App 一样使用

## ✨ 功能特性

- 📷 **实时姿态检测** — MediaPipe Pose 33 个关键点，3 级信号过滤管线
- ⚔️ **7 种动作识别** — 弓步、前进步、后退步、前进弓步、跳步弓步、飞弓步、格挡反攻
- 🎯 **质量评估** — 4 级评分（完美/良好/可接受/需改进），基于 FIE 国际击剑联合会标准
- 🗣️ **语音反馈** — 中文 TTS 即时纠正（手臂先动、后腿伸直、膝盖弯曲……）
- 🔊 **音效反馈** — Web Audio API 生成音效，无需外部音频文件
- 📹 **视频录制** — MediaRecorder 录制训练视频，IndexedDB 本地存储
- 🔥 **连击系统** — 连击计数器激励持续标准动作
- 🧠 **DTW 模板匹配** — 动态时间规整对比标准模板，关键帧触发优化性能
- 📱 **PWA 离线支持** — Service Worker 缓存，可安装到主屏幕

## 🎮 使用说明

1. **打开页面** — 选择主界面（`index.html`）或训练模式（`training.html`）
2. **站好位置** — 确保全身在画面中，距离约 2-3 米
3. **等待检测** — 系统需要全身 9 个关键点可见（头、肩、髋、膝、脚）且连续 10 帧稳定
4. **摆出预备姿势** — En Garde 预备姿势，系统识别后显示绿色骨骼
5. **执行动作** — 弓步（手臂先出）、前进步、后退步等
6. **查看反馈** — 语音纠正 + 骨骼颜色变化 + 连击计数

## 📁 项目结构

```
LittleFencer-Web/
├── index.html              # 主页面（完整训练 UI + 视频库）
├── training.html           # 训练模式（专注练习 + 速度追踪）
├── standards.html          # 技术标准参考（FIE 标准）
├── annotator.html          # 动作标注工具（教练用）
├── manifest.json           # PWA 配置
├── sw.js                   # Service Worker（离线缓存）
├── serve.sh                # 开发服务器脚本
├── css/
│   ├── style.css           # 主页样式
│   ├── training.css        # 训练模式样式
│   ├── standards.css       # 标准页样式
│   └── annotator.css       # 标注工具样式
├── js/
│   ├── app.js              # 主应用入口（720 行）
│   ├── training-mode.js    # 训练模式入口（1003 行）
│   ├── engine.js           # 击剑状态机 + FIE 标准（871 行）
│   ├── camera.js           # 摄像头管理
│   ├── pose.js             # MediaPipe Pose 封装
│   ├── skeleton.js         # 骨骼渲染（Canvas + CSS 镜像）
│   ├── feedback.js         # 语音/音效反馈
│   ├── recorder.js         # 视频录制
│   ├── storage.js          # IndexedDB 视频存储
│   ├── ui.js               # UI 管理 + 视频库
│   ├── filters.js          # 信号过滤（OneEuro/异常值剔除/置信度加权）
│   ├── dtw.js              # DTW 动态时间规整
│   ├── keyframeDetector.js # 关键帧检测器
│   ├── templateRecorder.js # 模板录制（教练用）
│   ├── annotator.js        # 视频标注逻辑
│   ├── platform.js         # 平台适配（iOS/Safari）
│   ├── utils.js            # 几何工具函数
│   ├── config.js           # ⭐ 全部检测阈值/门控/存储配额（唯一调参入口）
│   └── detectors/
│       └── index.js        # 7 个动作检测器
└── assets/
    ├── icons/              # PWA 启动图标（512px PNG）
    ├── images/             # 徽章/引导页/空状态图（WebP）
    └── screenshots/        # PWA 应用截图
```

> 🔧 **调参说明**：检测灵敏度、各动作阈值、置信度门控、视频存储上限全部在 [js/config.js](js/config.js)，实地调优只改这一个文件。

## 🧪 核心技术

### 信号处理管线

```
MediaPipe 原始输出
  → 第一级: OutlierRejector（剔除物理上不可能的跳变）
  → 第二级: ConfidenceWeightedFilter（低置信度 = 更多平滑）
  → 第三级: OneEuroFilter（静止时平滑、运动时低延迟）
  → 速度追踪器（统一速度计算，传递给所有检测器）
```

### 全身检测策略

- 必须满足 **9 个关键点**同时可见（头、双肩、双髋、双膝、双脚踝）
- 每个点要求：置信度 ≥ 0.7 **且**坐标在画面 5%-95% 范围内
- 连续 **10 帧**稳定后才开始动作检测

### 动作检测器

| # | 检测器 | 动作 | 核心检测指标 |
|---|--------|------|-------------|
| 1 | 弓步检测器 | 弓步 | 4 阶段状态机，手臂先出原则 |
| 2 | 前进步检测器 | 前进步 | 髋部重心速度 + 预备姿势验证 |
| 3 | 后退步检测器 | 后退步 | 髋部重心速度（反向） |
| 4 | 前进弓步检测器 | 前进弓步 | 前进步→弓步复合检测 |
| 5 | 跳步弓步检测器 | 跳步弓步 | 跳跃 + 弓步 |
| 6 | 飞弓步检测器 | 飞弓步 | 前冲 + 髋部上升 |
| 7 | 格挡反攻检测器 | 格挡反攻 | 手腕上升 → 手臂伸展 |

## 🛠️ 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| **运行时** | ES Modules（原生） | 无构建步骤，无打包器 |
| **姿态检测** | MediaPipe Pose（CDN） | WASM/WebGL，33 关键点 |
| **信号过滤** | 自研 3 级管线 | OneEuro + 异常值剔除 + 置信度加权 |
| **语音反馈** | Web Speech API | 中文 TTS |
| **音效** | Web Audio API | OscillatorNode 生成音调 |
| **视频录制** | MediaRecorder API | H.264/WebM |
| **离线支持** | Service Worker | 缓存优先策略 |
| **数据存储** | IndexedDB | 视频 Blob + 元数据 |

## 📱 浏览器兼容性

| 浏览器 | 支持状态 |
|--------|---------|
| Chrome 桌面/移动端 | ✅ 完全支持 |
| Safari iOS 14.5+ | ✅ 支持 |
| Firefox | ✅ 支持 |
| Edge | ✅ 支持 |
| 微信内置浏览器 | ⚠️ 部分支持 |

> iOS Safari 需 14.5+ 版本才支持 MediaRecorder API

## 🔧 开发

### 本地 HTTPS（可选）

某些浏览器要求 HTTPS 才能访问摄像头：

```bash
brew install mkcert && mkcert -install
mkcert localhost 127.0.0.1 ::1
npx http-server -S -C localhost+2.pem -K localhost+2-key.pem
```

### 调试日志

打开浏览器开发者工具查看分模块日志：

| 前缀 | 模块 |
|------|------|
| `[App]` | 应用生命周期 |
| `[Camera]` | 摄像头 |
| `[Pose]` | 姿态检测 |
| `[ENGINE]` | 状态机 + 可见性 |
| `[Filter]` | 信号过滤 |
| `[Keyframe]` | 关键帧检测 |
| `[DTW]` | 模板匹配 |
| `[Feedback]` | 语音/音效 |
| `[Recorder]` | 视频录制 |
| `[Storage]` | IndexedDB |
| `[VISIBILITY]` | 全身检测状态 |

## 📄 开源协议

MIT 协议

## 📚 文档

- [产品需求文档（PRD）](../docs/prd.md)
- [架构与实现（含固化技术路线）](../docs/architecture.md)
- [MVP 缺陷与漏洞清单](../docs/mvp-defects.md)
- [验收测试清单](../docs/acceptance_checklist.md)
- [功能路线图](../docs/roadmap.md)
