# Product Requirements Document: LittleFencer (Android Edition)

> **Version:** 2.2 (Smart Mirror & Direct Recording)  
> **Status:** Draft  
> **Last Updated:** 2026-01-31  
> **Platform:** Android Only  
> **Scope:** Sabre (佩剑) Training Only

## 1. Product Vision: The "Smart Digital Mirror"
**LittleFencer** transforms an Android device into an intelligent, always-watching **"Digital Mirror"** for youth sabre fencers.
- **Zero-Touch:** No "Record" button. It watches, analyzes, and saves highlights automatically.
- **High-Viz Feedback:** Designed for viewing from 3 meters away—big skeletons, bright colors, and clear audio.
- **Social-First:** Every cool move is instantly ready to share.

## 2. Core User Scenarios

### 2.1 The "Living Room Dojo" (Solo Practice)
- **User:** Leo (10 years old) practicing lunges at home.
- **Flow:** Leo props the phone on a water bottle -> Strikes an **En Garde** pose -> Phone "Dings" and shows a **Green Skeleton** (Calibrated) -> Leo lunges.
- **Feedback:**
    - **Mistake:** Knee collapses inward -> Skeleton flashes **RED** + Audio: "Knee out!"
    - **Perfect:** Deep lunge, straight back -> Skeleton glows **NEON GREEN** + Screen bursts with **✨Sparkles✨** + Audio: "Nice Lunge!"

### 2.2 The "Action Slicer" (Auto-Clip)
- **Context:** Leo completes a Lunge + Recovery.
- **System Action (P0):** App detects action boundaries (Start → End) and saves that segment directly.
- **P1 Enhancement:** "Dashcam Mode" (rolling buffer) for retrospective capture with pre-padding.
- **Result:** A video clip is **silently saved** to the System Gallery. Leo keeps training.

### 2.3 The "Brag Button" (Instant Share)
- **Context:** Training break. Leo sees a "New Highlight" floating bubble.
- **Action:** Taps bubble -> Android Share Sheet opens.
- **Result:** One tap to send the clip to WeChat/WhatsApp group "Fencing Squad".

## 3. Functional Requirements (MVP)

### 3.1 "Zero-Touch" Training Mode
- **Auto-Calibration:** Detects "En Garde" pose to set floor plane and user height. No manual setup.
- **Always-On Analysis:** 
    - **Green Line:** Good posture (Knee 90°-120°, Arm extended).
    - **Red Line:** Bad posture (Knee <90° or >135°, Arm retracted).
- **Latency:** < 50ms render time for "mirror" feel.

### 3.2 Intelligent Auto-Slicing ("Action Slicer")
- **P0 Mechanism (Direct Recording):**
    - Uses standard `MediaRecorder` / `MediaCodec` for live recording.
    - AI detects action start → begins recording; detects action end → stops and saves.
    - **No buffering / no pre-padding** (misses the split-second before action starts, acceptable for MVP).
- **P1 Enhancement (Dashcam Mode - Deferred):**
    - Ring buffer storing last 10 seconds in RAM for retrospective capture with padding.
- **Storage:** Writes directly to `MediaStore` (System Gallery / DCIM).

### 3.3 Gamified Feedback System
- **Visuals:**
    - **Skeleton Overlay:** High-contrast lines (Neon Green / Bright Red).
    - **Particle Effects:** Explosion of stars/confetti on "Perfect" moves.
- **Audio:**
    - **TTS Corrections:** "Arm first!", "Too high!".
    - **SFX:** "Ding" for good, "Buzz" for bad.
- **Combo Counter:** Big number on screen incrementing for consecutive good reps.

### 3.4 Feature Exclusions
- **No Playback UI:** Users view videos in their own Gallery app.
- **No Cloud:** Zero server costs, zero data privacy liability.
- **No Login:** Install and start.

## 4. Technical Specifications

### 4.1 Technology Stack
-   **Language:** Kotlin (Android Native).
-   **Min SDK:** API 31 (Android 12).
-   **AI Engine:** MediaPipe Tasks Vision (`pose_landmarker_lite`).
-   **Camera:** Android CameraX API.
-   **Video Recording (P0):** Standard `MediaRecorder` (direct recording, no buffer).
-   **Video Recording (P1):** MediaCodec + MediaMuxer (Custom Ring Buffer for "Dashcam").

### 4.2 AI Pipeline
-   **Input:** CameraX `ImageAnalysis` stream (YUV/RGB).
-   **Inference:** GPU/NPU Delegate.
-   **Logic:** Custom Rule-Based State Machine for Action Recognition.

### 4.3 Video Pipelining
-   **P0:** Direct write via `MediaRecorder` → `MediaStore`.
-   **P1:** In-memory circular buffer (approx. 10MB for 10s @ 720p) + MediaMuxer.

### 4.4 Data Persistence
-   **Local Only:** No backend database. Shared Preferences for settings.
- **Permissions:** 
    - `CAMERA` (Essential)
    - `READ_MEDIA_VIDEO` / `WRITE_EXTERNAL_STORAGE` (For saving to Gallery)

## 5. Development Roadmap (Checklist)

### Phase 1: The "Mirror" (Week 1)
- [ ] Project Setup (Kotlin / Android Studio).
- [ ] CameraX Preview (Landscape, High FPS).
- [ ] MediaPipe Pose Integration (Skeleton Overlay).
- [ ] Basic "En Garde" Detection (Static Pose Check).

### Phase 2: The "Judge" & "Cameraman" (Week 2)
- [ ] Algorithmic State Machine (Idle -> En Garde -> Lunge -> Recovery).
- [ ] **Direct Recording Integration (MediaRecorder, No Buffer)**.
- [ ] Rule-Based Triggering (Start/Stop recording on action detection).
- [ ] Save to Gallery via `MediaStore`.

### Phase 3: The "Game" (Week 3)
- [ ] UI Polish (Particle Effects, Big Fonts).
- [ ] Audio/TTS Feedback Manager.
- [ ] Combo Counter Logic.
- [ ] Floating "Share Now" Button.
