# LittleFencer ⚔️

**青少年佩剑训练助手** - AI-Powered Fencing Training Assistant for Youth

<p align="center">
  <img src="docs/banner.png" alt="LittleFencer Banner" width="600">
</p>

## 📖 简介

LittleFencer 是一款基于 AI 姿态识别的青少年佩剑（Saber）训练辅助 App。通过手机摄像头实时分析训练者的动作姿态，提供即时的语音和视觉反馈，帮助青少年击剑爱好者在家中进行科学、有效的基础动作训练。

### ✨ 核心特性

- **🪞 智能数字镜子** - 实时显示骨骼叠加层，绿色表示正确姿势，红色提示需要纠正
- **🎯 AI 姿态分析** - 基于 MediaPipe 的实时姿态检测，分析膝盖角度、手臂伸展、躯干倾斜等关键指标
- **🗣️ 语音教练** - TTS 语音即时反馈，如"膝盖外展！"、"手臂先动！"、"保持直立！"
- **📹 精彩回放** - 自动录制训练动作，支持"行车记录仪"模式预缓冲
- **🏆 视频分类** - 自动将录像分为"⭐ 精彩"和"📝 待改进"两类
- **🔥 连击系统** - Combo 计数器激励持续完成标准动作

## 🎮 功能模块

### Phase 1: 数字镜子 (Mirror)
- CameraX 前置摄像头预览
- MediaPipe Pose Landmarker 33点骨骼检测
- 实时骨骼渲染叠加层

### Phase 2: 裁判与摄影师 (Judge & Cameraman)
- 状态机检测：IDLE → EN_GARDE → LUNGING → RECOVERY
- 动作质量评估与实时纠正
- 自动录制精彩动作到系统相册

### Phase 3: 游戏化 (Game)
- 音效反馈（正确/错误/完美）
- 粒子特效庆祝
- Combo 连击计数
- 分享按钮与视频库

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| **平台** | Android 12+ (API 31) |
| **语言** | Kotlin |
| **相机** | CameraX (Preview + ImageAnalysis + VideoCapture) |
| **AI 姿态** | MediaPipe Tasks Vision (pose_landmarker_lite.task) |
| **音频** | TextToSpeech + SoundPool + ToneGenerator |
| **视频编码** | CameraX VideoCapture + MediaCodec (pre-padding) |
| **存储** | MediaStore API (DCIM/LittleFencer/) |
| **DI** | Hilt |
| **架构** | Single Activity + 模块化 Managers |

## 📁 项目结构

```
app/src/main/java/com/littlefencer/app/
├── MainActivity.kt              # 主训练界面
├── LittleFencerApp.kt          # Application (Hilt)
├── camera/
│   └── CameraManager.kt        # CameraX 管理
├── pose/
│   └── PoseDetector.kt         # MediaPipe 姿态检测
├── logic/
│   └── FencingStateEngine.kt   # 击剑状态机
├── feedback/
│   └── AudioFeedbackManager.kt # 语音/音效反馈
├── recorder/
│   ├── VideoRecorder.kt        # CameraX 录像
│   ├── FrameRingBuffer.kt      # 预缓冲环形队列
│   └── VideoEncoder.kt         # MediaCodec 编码
├── gallery/
│   ├── GalleryActivity.kt      # 视频库界面
│   ├── VideoRepository.kt      # MediaStore 查询
│   └── VideoAdapter.kt         # RecyclerView 适配器
├── ui/
│   └── SkeletonOverlayView.kt  # 骨骼渲染视图
└── utils/
    ├── GeometryUtils.kt        # 几何计算工具
    └── MediaPipeLandmarks.kt   # 关键点常量
```

## 🚀 快速开始

### 环境要求
- Android Studio Hedgehog (2023.1.1) 或更高版本
- JDK 17+
- Android SDK 34
- 支持 Camera2 API 的 Android 设备 (API 31+)

### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/parafallen-maker/LittleFencer.git
cd LittleFencer

# 构建 Debug APK
./gradlew assembleDebug

# 安装到设备
./gradlew installDebug
```

### 权限说明
App 需要以下权限：
- `CAMERA` - 摄像头预览和姿态检测
- `RECORD_AUDIO` - 录像时录制声音
- `READ_MEDIA_VIDEO` - 访问视频库 (Android 13+)

## 📱 使用指南

1. **站位** - 将手机放置在身前 2-3 米处，确保全身入镜
2. **准备** - 摆出 En Garde（预备）姿势，等待绿色骨骼显示
3. **训练** - 执行弓步动作，系统会自动检测并评分
4. **回看** - 精彩动作自动保存，可在视频库中查看和分享

## 🎯 检测指标

| 指标 | 标准范围 | 反馈 |
|------|----------|------|
| 前膝角度 | 90° - 120° | "Bend more!" / "Too low!" |
| 后腿伸直 | > 155° | "Push back leg!" |
| 站距宽度 | 1.2x - 2.0x 肩宽 | "Wider stance!" |
| 躯干倾斜 | < 20° | "Stay upright!" |
| 头部位置 | 不低于肩 | "Head up!" |

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [MediaPipe](https://developers.google.com/mediapipe) - Google 的跨平台 ML 框架
- [CameraX](https://developer.android.com/training/camerax) - Jetpack 相机库
- 所有击剑教练和青少年运动员的反馈

---

<p align="center">
  Made with ❤️ for young fencers
</p>
