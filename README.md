# LittleFencer ⚔️

**青少年佩剑训练助手** - AI-Powered Fencing Training Assistant for Youth

<p align="center">
  <img src="docs/banner.png" alt="LittleFencer Banner" width="600">
</p>

[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue.svg)](/)
[![Android](https://img.shields.io/badge/Android-12%2B-green.svg)](/)
[![iOS](https://img.shields.io/badge/iOS-15%2B-lightgrey.svg)](/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📖 简介

LittleFencer 是一款基于 AI 姿态识别的青少年佩剑（Saber）训练辅助 App。通过手机摄像头实时分析训练者的动作姿态，提供即时的语音和视觉反馈，帮助青少年击剑爱好者在家中进行科学、有效的基础动作训练。

**支持 Android 和 iOS 双平台！**

### ✨ 核心特性

- **🪞 智能数字镜子** - 实时显示骨骼叠加层，绿色表示正确姿势，红色提示需要纠正
- **🎯 AI 姿态分析** - 基于 MediaPipe (Android) / Vision Framework (iOS) 的实时姿态检测
- **⚔️ 7种动作识别** - 支持前进步、后退步、弓步、前进弓步、跳步弓步、飞弓步、格挡反攻
- **🗣️ 语音教练** - TTS 语音即时反馈，如"膝盖外展！"、"手臂先动！"、"保持直立！"
- **📹 精彩回放** - 自动录制训练动作，支持"行车记录仪"模式预缓冲
- **🏆 视频分类** - 自动将录像分为"⭐ 精彩"和"📝 待改进"两类
- **🔥 连击系统** - Combo 计数器激励持续完成标准动作

## 🎮 功能模块

### 动作检测器 (Action Detectors)

| 动作 | 英文名 | 检测原理 |
|------|--------|---------|
| 前进步 | Advance | 前脚先动，重心前移 |
| 后退步 | Retreat | 后脚先动，重心后移 |
| 弓步 | Lunge | 4阶段状态机：手臂伸展→发力→落地→恢复 |
| 前进弓步 | Advance-Lunge | 前进步 + 弓步组合 |
| 跳步弓步 | Balestra-Lunge | 双脚跳跃 + 弓步 |
| 飞弓步 | Flunge | 佩剑特有，空中攻击 |
| 格挡反攻 | Parry-Riposte | 防守后快速反击 |

### Phase 1: 数字镜子 (Mirror)
- CameraX / AVFoundation 前置摄像头预览
- MediaPipe / Vision Framework 33/19点骨骼检测
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

### Android

| 组件 | 技术 |
|------|------|
| **平台** | Android 12+ (API 31) |
| **语言** | Kotlin |
| **相机** | CameraX (Preview + ImageAnalysis + VideoCapture) |
| **AI 姿态** | MediaPipe Tasks Vision (pose_landmarker_lite.task) |
| **音频** | TextToSpeech + SoundPool |
| **DI** | Hilt |

### iOS

| 组件 | 技术 |
|------|------|
| **平台** | iOS 15+ |
| **语言** | Swift 5.0 |
| **UI** | SwiftUI |
| **相机** | AVFoundation |
| **AI 姿态** | Vision Framework (VNDetectHumanBodyPoseRequest) |
| **音频** | AVSpeechSynthesizer |

## 📁 项目结构

```
LittleFencer/                    # Android 项目
├── app/src/main/java/com/littlefencer/app/
│   ├── MainActivity.kt          # 主训练界面
│   ├── camera/CameraManager.kt  # CameraX 管理
│   ├── pose/PoseDetector.kt     # MediaPipe 姿态检测
│   ├── logic/
│   │   ├── FencingStateEngine.kt    # 击剑状态机
│   │   ├── ActionModels.kt          # 动作模型定义
│   │   ├── ActionDetectorManager.kt # 检测器管理
│   │   └── detectors/               # 7种动作检测器
│   ├── feedback/AudioFeedbackManager.kt
│   ├── recorder/VideoRecorder.kt
│   └── gallery/GalleryActivity.kt
│
LittleFencer-iOS/                # iOS 项目 (同级目录)
├── LittleFencer.xcodeproj
└── LittleFencer/
    ├── App/                     # SwiftUI App 入口
    ├── Views/                   # UI 视图
    ├── Camera/CameraManager.swift
    ├── Pose/PoseDetector.swift  # Vision Framework
    ├── Logic/
    │   ├── FencingStateEngine.swift
    │   ├── ActionModels.swift
    │   ├── ActionDetectorManager.swift
    │   └── Detectors/           # 7种动作检测器
    ├── Feedback/AudioFeedbackManager.swift
    └── Recorder/VideoRecorder.swift
```

## 🚀 快速开始

### Android

#### 环境要求
- Android Studio Hedgehog (2023.1.1) 或更高版本
- JDK 17+
- Android SDK 34
- 支持 Camera2 API 的 Android 设备 (API 31+)

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/user/LittleFencer.git
cd LittleFencer

# 构建 Debug APK
./gradlew assembleDebug

# 安装到设备
./gradlew installDebug
```

### iOS

#### 环境要求
- Xcode 15.0 或更高版本
- macOS Ventura 或更高
- iOS 15+ 真机设备（相机功能需要真机）

#### 构建步骤

```bash
# iOS 项目在同级目录
cd ../LittleFencer-iOS

# 使用 Xcode 打开
open LittleFencer.xcodeproj

# 或命令行构建
xcodebuild -scheme LittleFencer -sdk iphoneos build
```

### 权限说明

#### Android
- `CAMERA` - 摄像头预览和姿态检测
- `RECORD_AUDIO` - 录像时录制声音
- `READ_MEDIA_VIDEO` - 访问视频库 (Android 13+)

#### iOS
- `NSCameraUsageDescription` - 摄像头访问
- `NSMicrophoneUsageDescription` - 麦克风访问
- `NSPhotoLibraryAddUsageDescription` - 保存视频到相册

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
