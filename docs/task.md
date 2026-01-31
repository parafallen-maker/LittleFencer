# LittleFencer - Development Task Board

> **Last Updated:** 2026-01-31 18:16  
> **Project:** `/Users/Ljc_1/Downloads/LittleFencer`  
> **Docs:** `docs/prd.md`, `docs/implementation_plan.md`

---

## 🚦 Task Protocol

### How to Claim a Task
1. Find an unclaimed task `[ ]` with no blockers.
2. Change `[ ]` to `[→]` and add your Agent ID (e.g., `[→ Agent-A]`).
3. When done, change to `[x]`.

### Status Legend
| Symbol | Meaning |
|:---|:---|
| `[ ]` | Open / Unclaimed |
| `[→ AgentX]` | Claimed by AgentX (In Progress) |
| `[x]` | Completed |
| `[!]` | Blocked |

---

## ✅ All Agent Tasks Complete!

**MVP 代码已全部完成**, P1 增强已完成, **核心佩剑检测已增强**。

### 最新增强: 专业佩剑动作检测 ✅
- **En Garde 姿势检测**: 5项检查 (前膝角度, 后膝伸直, 站位宽度, 躯干直立, 头部位置)
- **Lunge 动作检测**: 7项检查 (手臂先行, 后腿蹬直, 膝不超踝, 前膝稳定, 躯干直立, 头部位置, 剑尖水平)
- **新增教练语音**: Push back leg, Stay upright, Head up, Blade level, Wider stance 等

---

## Phase 1: The "Mirror" (Foundation)

### A1: CameraX Preview
- **Status:** [x] ✅ Completed by Manager/Agent-A
- **Owner:** Agent A (Systems)
- **Depends On:** None
- **Deliverables:**
  - `app/.../camera/CameraManager.kt`
  - Landscape-locked `PreviewView` in `activity_main.xml`
- **Acceptance:**
  - App launches, shows live camera feed in landscape.

---

### B1: MediaPipe Integration
- **Status:** [x] ✅ Completed by Agent B (Coach)
- **Owner:** Agent B (Coach)
- **Depends On:** A1 (needs camera frames)
- **Deliverables:**
  - `app/.../pose/PoseDetector.kt`
  - Download & bundle `pose_landmarker_lite.task` model
- **Acceptance:**
  - `PoseLandmarkerResult` object logged with 33 landmarks per frame.

---

### C1: Skeleton Overlay View
- **Status:** [x] ✅ Completed by Agent-C (awaiting B1 for live data)
- **Owner:** Agent C (Artist)
- **Depends On:** B1 (needs landmark data)
- **Deliverables:**
  - `app/.../ui/SkeletonOverlayView.kt` (Custom View)
- **Acceptance:**
  - Green stickman drawn on screen over camera preview.

---

## Phase 2: The "Judge" & "Cameraman"

### B2: Geometry Utils
- **Status:** [x] ✅ Completed by Agent B
- **Owner:** Agent B
- **Depends On:** B1
- **Deliverables:**
  - `app/.../utils/GeometryUtils.kt` (angle calculation, velocity)

### B3: Fencing State Engine
- **Status:** [x] ✅ Completed by Agent B
- **Owner:** Agent B
- **Depends On:** B2
- **Deliverables:**
  - `app/.../logic/FencingStateEngine.kt` (State Machine)

### A2: Direct Recording (MediaRecorder)
- **Status:** [x] ✅ Completed by Manager/Agent-A
- **Owner:** Agent A
- **Depends On:** A1
- **Deliverables:**
  - `app/.../recorder/VideoRecorder.kt`

### A3: Save to Gallery
- **Status:** [x] ✅ (MediaStore API in VideoRecorder.kt, awaiting B3 trigger)
- **Owner:** Agent A
- **Depends On:** A2, B3 (trigger signal)
- **Deliverables:**
  - Integration with `MediaStore` API

---

## Phase 3: The "Game" (Polish)

### C2: Audio Feedback
- **Status:** [x] ✅ Completed by Agent-C (integrated in MainActivity)
- **Owner:** Agent C
- **Depends On:** B3
- **Deliverables:**
  - `app/.../feedback/AudioManager.kt` (TTS + SFX)

### C3: Visual Effects
- **Status:** [x] ✅ Completed by Agent-C (sparkles + glow + color states)
- **Owner:** Agent C
- **Depends On:** C1, B3
- **Deliverables:**
  - Color states (Green/Red), Particle effects, Combo counter

---

## P1 Enhancements

### B4: Ring Buffer (Dashcam Mode)
- **Status:** [x] ✅ Completed by Agent B
- **Owner:** Agent B
- **Deliverables:**
  - `app/.../recorder/FrameRingBuffer.kt` - 环形缓冲区 (90帧 @ 30fps)
  - `app/.../recorder/VideoEncoder.kt` - MediaCodec/MediaMuxer 编码器

---

## 🚨 待完成任务

### A4: Pre-Padding Video Capture
- **Status:** [x] ✅ Completed by Manager/Agent-A
- **Owner:** Agent A
- **Depends On:** B4 ✅
- **Deliverables:**
  - `PoseDetector.kt` - 添加 frameListener 回调
  - `MainActivity.kt` - 集成 RingBuffer，动作完成时触发 savePrePaddedVideo()
  - 捕获动作前 3 秒 (90帧 @ 30fps)

### C4: Floating Share Button
- **Status:** [x] ✅ Completed by Agent C
- **Owner:** Agent C
- **Deliverables:**
  - `activity_main.xml` - shareButton UI 已添加
  - `MainActivity.kt` - shareLastRecording() 已实现

