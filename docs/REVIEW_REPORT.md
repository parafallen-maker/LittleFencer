# LittleFencer 项目 Review 报告

## 概述

完成了 Android 和 iOS 两个项目的代码审查和功能增强。两个平台功能对齐，并添加了新特性。

---

## P2.2 更新 (2026-01-31)

### 1. iOS MediaPipe SDK 支持

**新增文件:**
- `Podfile` - CocoaPods 配置

**修改文件:**
- `PoseDetector.swift` - 支持双后端切换

**使用方式:**
```bash
cd LittleFencer-iOS
pod install
open LittleFencer.xcworkspace
```

**功能特点:**
- 自动检测 MediaPipe SDK 可用性
- 原生 33 点姿态检测（如果 MediaPipe 可用）
- Vision Framework fallback（19→33 点映射）
- GPU 加速支持（自动或强制）

### 2. 独立弓步检测器 (LungeDetector)

**新增文件:**
- Android: `LungeDetector.kt`
- iOS: `LungeDetector.swift`

**检测逻辑:**
- 4 阶段状态机: IDLE → ARM_EXTENDING → LUNGING → LANDING
- 强调"臂先出"原则
- 质量评估: 手臂伸展、后腿伸直、前膝弯曲、躯干正直
- 时间窗口: 150-800ms

**TTS 反馈:**
- "Arm first! Extend fully."
- "Push back leg straight!"
- "Bend front knee more."
- "Stay upright!"

### 3. Android GPU 加速配置

**修改文件:**
- `PoseDetector.kt`

**新增枚举:**
```kotlin
enum class GpuAccelerationMode {
    AUTO,       // 自动选择（默认）
    GPU_ONLY,   // 强制 GPU
    CPU_ONLY    // 强制 CPU
}
```

**使用方式:**
```kotlin
val poseDetector = PoseDetector(
    context = this,
    resultListener = { result -> ... },
    gpuMode = GpuAccelerationMode.AUTO,
    onDelegateInitialized = { isGpu ->
        Log.d("GPU", "Using GPU: $isGpu")
    }
)
```

---

## 修复的问题 (之前)

### Android 项目

1. **缺少 AudioFeedbackManager import** (FencingStateEngine.kt)
   - 问题: 引用 `AudioFeedbackManager.PHRASE_*` 但未导入
   - 修复: 添加 `import com.littlefencer.app.feedback.AudioFeedbackManager`

2. **SaberAction.LUNGING 枚举缺失** (ActionModels.kt)
   - 问题: 代码中引用 `SaberAction.LUNGING` 但枚举未定义
   - 修复: 添加 `LUNGING` 枚举值

### iOS 项目

1. **README.md 与代码不一致**
   - 问题: 文档中列出 parryTierce/Quarte/Quinte，但代码只有 parry
   - 修复: 更新 README 反映实际 SaberAction 枚举

## 架构对比

| 组件 | Android | iOS | 状态 |
|------|---------|-----|------|
| **姿态检测** | MediaPipe (33点) | Vision Framework (19→33映射) | ✅ 对齐 |
| **状态机** | FencingStateEngine | FencingStateEngine | ✅ 对齐 |
| **动作管理器** | ActionDetectorManager | ActionDetectorManager | ✅ 对齐 |
| **前进步检测器** | AdvanceDetector | AdvanceDetector | ✅ 对齐 |
| **后退步检测器** | RetreatDetector | RetreatDetector | ✅ 对齐 |
| **弓步检测器** | LungeDetector | LungeDetector | ✅ 新增 |
| **前进弓步检测器** | AdvanceLungeDetector | AdvanceLungeDetector | ✅ 对齐 |
| **跳步弓步检测器** | BalestraLungeDetector | BalestraLungeDetector | ✅ 对齐 |
| **飞弓步检测器** | FlungeDetector | FlungeDetector | ✅ 对齐 |
| **格挡还击检测器** | ParryRiposteDetector | ParryRiposteDetector | ✅ 对齐 |
| **音频反馈** | AudioFeedbackManager | AudioFeedbackManager | ✅ 对齐 |
| **视频录制** | VideoRecorder | VideoRecorder | ✅ 对齐 |
| **视频画廊** | GalleryActivity | GalleryView | ✅ 对齐 |

## SaberAction 枚举对比

| Action | Android | iOS |
|--------|---------|-----|
| EN_GARDE | ✅ | ✅ enGarde |
| ADVANCE | ✅ | ✅ advance |
| RETREAT | ✅ | ✅ retreat |
| ADVANCE_LUNGE | ✅ | ✅ advanceLunge |
| LUNGE | ✅ | ✅ lunge |
| LUNGING | ✅ (已修复) | ✅ lunging |
| FLUNGE | ✅ | ✅ flunge |
| BALESTRA_LUNGE | ✅ | ✅ balestraLunge |
| PARRY | ✅ | ✅ parry |
| RIPOSTE | ✅ | ✅ riposte |
| RECOVERY | ✅ | ✅ recovery |

## TTS 语音短语对比

| 短语 | Android | iOS |
|------|---------|-----|
| PHRASE_EN_GARDE | ✅ | ✅ |
| PHRASE_NICE_LUNGE | ✅ | ✅ |
| PHRASE_KNEE_OUT | ✅ | ✅ |
| PHRASE_ARM_FIRST | ✅ | ✅ |
| PHRASE_BEND_MORE | ✅ | ✅ |
| PHRASE_TOO_LOW | ✅ | ✅ |
| PHRASE_BACK_LEG | ✅ | ✅ |
| PHRASE_STAY_UPRIGHT | ✅ | ✅ |
| PHRASE_HEAD_UP | ✅ | ✅ |
| PHRASE_WIDER_STANCE | ✅ | ✅ |
| PHRASE_NICE_ADVANCE | ✅ | ✅ |
| PHRASE_NICE_RETREAT | ✅ | ✅ |
| PHRASE_NICE_PARRY | ✅ | ✅ |
| PHRASE_NICE_RIPOSTE | ✅ | ✅ |
| PHRASE_FLUNGE_ALERT | ✅ | ✅ |
| PHRASE_RULE_VIOLATION | ✅ | ✅ |
| PHRASE_FIVE_COMBO | - | ✅ |
| PHRASE_TEN_COMBO | - | ✅ |

## 代码统计

### Android
- Kotlin 文件: ~20 个
- 依赖: CameraX, MediaPipe Tasks Vision, Hilt
- 最低 SDK: 31 (Android 12)

### iOS
- Swift 文件: 20 个
- 总代码行: ~3,600 行
- 依赖: Vision Framework, AVFoundation
- 最低版本: iOS 15

## 已知限制

1. **iOS MediaPipe SDK 需要手动安装**
   - 运行 `pod install` 后使用 .xcworkspace 打开项目
   - 如果不安装，会自动使用 Vision Framework (精度稍低)

2. **格挡位置细分**
   - 代码只检测通用 "parry"
   - 不区分 3/4/5 号位 (tierce/quarte/quinte)
   - 可在 P3 迭代中添加

## 动作检测器清单 (7个)

| # | 检测器 | 动作 | 描述 |
|---|--------|------|------|
| 1 | AdvanceDetector | 前进步 | 前脚先动 |
| 2 | RetreatDetector | 后退步 | 后脚先动 |
| 3 | **LungeDetector** | 弓步 | **新增** - 臂先出原则 |
| 4 | AdvanceLungeDetector | 前进弓步 | 前进+弓步组合 |
| 5 | BalestraLungeDetector | 跳步弓步 | 跳步+弓步组合 |
| 6 | FlungeDetector | 飞弓步 | 前冲跳跃弓步 |
| 7 | ParryRiposteDetector | 格挡还击 | 防守+攻击组合 |

## 建议的后续改进

1. **P3.1 - 格挡位置识别**
   - 基于手腕高度区分 3/4/5 号位

2. **P3.2 - 训练模式**
   - 添加引导式训练流程

3. **P3.3 - 数据分析**
   - 记录历史训练数据
   - 生成进步报告

## 结论

两个项目功能完整且对齐。本次更新：

### 已完成
- ✅ iOS MediaPipe SDK 集成（CocoaPods）
- ✅ 独立 LungeDetector（两平台）
- ✅ Android GPU 加速配置选项
- ✅ 7 个动作检测器对齐

### 构建说明

**Android:**
```bash
cd LittleFencer
./gradlew assembleDebug
```

**iOS:**
```bash
cd LittleFencer-iOS
pod install  # 可选，安装 MediaPipe
open LittleFencer.xcworkspace
```
