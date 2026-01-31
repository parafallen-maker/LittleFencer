# Implementation Plan: LittleFencer (Android)

> **Version:** 1.0
> **Date:** 2026-01-31
> **Status:** Pending Approval

## 1. Technology Stack Selection
Based on the "Smart Digital Mirror" product form and performance requirements (60FPS + Real-time AI), we have selected a pure Native Android stack.

### 1.1 Core Development
-   **Language:** **Kotlin** (v1.9+)
-   **Minimum SDK:** **API 31** (Android 12)
    -   *Reason:* Guaranteed NPU acceleration support (NNAPI) and Scoped Storage optimizations.
-   **Build System:** Gradle (Kotlin DSL)

### 1.2 Computer Vision & AI
-   **Framework:** **MediaPipe Tasks Vision** (`com.google.mediapipe:tasks-vision`)
-   **Model:** `pose_landmarker_lite.task` (Quantized for Edge)
-   **Delegate:** **GPU** (default for stability) or **NNAPI** (if device supported)
-   **Latency Target:** < 50ms end-to-end

### 1.3 Camera & Video Pipeline
-   **Camera API:** **CameraX** (`androidx.camera`)
    -   *Components:* `Preview` (Display), `ImageAnalysis` (ML Input), `VideoCapture` (optional, likely custom impl for buffer).
-   **Video Buffering:** **Custom RingBuffer** (ByteArray w/ H.264 encoding)
    -   *Note:* Using raw MediaCodec + MediaMuxer for "Always-on" pre-recording to avoid writing constant files to disk.
-   **Storage:** **MediaStore API** (Scoped Storage)
    -   *Destination:* `DCIM/LittleFencer` or `Movies/LittleFencer`.

### 1.4 UI & Architecture
-   **Architectural Pattern:** **MVVM** (Model-View-ViewModel)
-   **UI Toolkit:** **XML Views** (Root) + **Custom Canvas View** (Overlay)
    -   *Reason:* Direct Canvas drawing on a SurfaceView/View is often more performant and predictable for high-frequency (60fps) skeleton drawing than Compose in this specific "Game Loop" scenario.
-   **Concurrency:** **Kotlin Coroutines** + **Flow**
-   **Dependency Injection:** **Hilt** (Optional for MVP, but good for structure).

---

## 2. System Architecture

### 2.1 Data Flow Pipeline
```mermaid
graph TD
    Cam[CameraX Input] -->|YUV_420_888| Analyzer[ImageAnalysis]
    Cam -->|Surface| Prev[PreviewView (Screen)]
    
    subgraph "AI Loop (Async)"
        Analyzer -->|Bitmap/ImageProxy| MP[MediaPipe Graph]
        MP -->|Landmarks| State[GameState Manager]
        State -->|Poses| Overlay[SkeletonOverlayView]
    end
    
    subgraph "Video Loop (Background)"
        Analyzer -->|YUV| Encoder[MediaCodec (H.264)]
        Encoder -->|Encoded Frames| Buffer[RingBuffer (RAM)]
        State --"Trigger Action"--> Writer[MediaMuxer]
        Buffer --"Dump Last 4s"--> Writer
        Writer --> File[Gallery .mp4]
    end
```

### 2.2 Key Modules
1.  **`CameraManager`**: Handles lifecycle, resolution selection (Target 720p/1080p), and frame dispatch.
2.  **`PoseDetector`**: Wraps MediaPipe, handles coordinate normalization and thread management.
3.  **`FencingRulesEngine`**:
    -   Stateless logic to check angles (e.g., `checkEnGarde(pose) -> Boolean`).
    -   Stateful logic for action detection (e.g., `ActionRecognitionStateMachine`).
4.  **`highlightRecorder`**: Manages the circular buffer and async file writing.

---

## 3. Phase 1 Implementation Steps (The "Mirror")

#### [Setup] Project Initialization
- [ ] Create Android Studio Project (No Activity).
- [ ] Configure `build.gradle` (Dependencies: CameraX, MediaPipe, Coroutines).
- [ ] Set up permissions (`CAMERA`, `RECORD_AUDIO`).

#### [Core] Camera & Overlay
- [ ] Implement `MainActivity` with full-screen immersive mode.
- [ ] Set up `PreviewView` for camera feed.
- [ ] Create `OverlayView` class (extends View) for custom drawing.

#### [AI] Integration
- [ ] Initialize `PoseLandmarker`.
- [ ] Connect `ImageAnalysis` analyzer to `PoseLandmarker`.
- [ ] Map normalized coordinates (0.0-1.0) to screen pixel coordinates.
- [ ] Draw "Stickman" on `OverlayView` in sync with camera.

#### [Logic] Basic En Garde Check
- [ ] Implement simple vector math helper (`GeometryUtils`).
- [ ] Add logic: If knees bent > threshold, turn skeleton lines **GREEN**.
