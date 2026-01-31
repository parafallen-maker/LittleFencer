# LittleFencer iOS

**Youth Saber Training Assistant** - AI-Powered Fencing Training Assistant (iOS Version)

## Overview

LittleFencer iOS is a complete Swift/SwiftUI port of the Android version. Uses Apple Vision Framework for pose detection and AVFoundation for camera and video recording.

## Feature Completeness (Android Parity)

| Feature | iOS Status | Notes |
|---------|-----------|-------|
| **Pose Detection** | OK | Vision Framework 19pt -> 33pt mapping |
| **State Machine** | OK | IDLE -> EN_GARDE -> LUNGING -> RECOVERY |
| **Action Detector Manager** | OK | ActionDetectorManager |
| **Advance Detection** | OK | AdvanceDetector |
| **Retreat Detection** | OK | RetreatDetector |
| **Advance-Lunge Detection** | OK | AdvanceLungeDetector |
| **Balestra-Lunge Detection** | OK | BalestraLungeDetector |
| **Flunge Detection** | OK | FlungeDetector (with rule warnings) |
| **Parry-Riposte Detection** | OK | ParryRiposteDetector (3/4/5 positions) |
| **TTS Voice Feedback** | OK | 20+ voice phrases |
| **Haptic Feedback** | OK | Haptic Engine |
| **Video Recording** | OK | With pre-buffer |
| **Video Gallery** | OK | Categorized browsing |

## Tech Stack

| Component | iOS Technology | Android Equivalent |
|-----------|---------------|-------------------|
| **Platform** | iOS 15+ | Android 12+ |
| **Language** | Swift 5.9 | Kotlin |
| **UI** | SwiftUI | XML + View |
| **Camera** | AVFoundation | CameraX |
| **Pose Detection** | Vision Framework | MediaPipe |
| **Audio** | AVSpeechSynthesizer + AudioToolbox | TextToSpeech + SoundPool |
| **Video Recording** | AVCaptureMovieFileOutput | CameraX VideoCapture |
| **Storage** | Photos Framework | MediaStore |

## Project Structure

```
LittleFencer-iOS/
├── Package.swift                    # Swift Package Manager
├── Podfile                          # CocoaPods (optional MediaPipe)
├── LittleFencer/
│   ├── App/
│   │   ├── LittleFencerApp.swift   # App entry point + AppState
│   │   └── ContentView.swift       # Root view
│   ├── Views/
│   │   ├── MainTrainingView.swift  # Main training screen
│   │   ├── SkeletonOverlayView.swift
│   │   └── GalleryView.swift       # Video library
│   ├── Camera/
│   │   └── CameraManager.swift     # AVFoundation camera
│   ├── Pose/
│   │   └── PoseDetector.swift      # Vision pose detection
│   ├── Logic/
│   │   ├── FencingStateEngine.swift # State machine
│   │   ├── ActionModels.swift       # PoseFrame, ActionResult
│   │   ├── ActionDetectorManager.swift
│   │   └── Detectors/
│   │       ├── AdvanceDetector.swift
│   │       ├── RetreatDetector.swift
│   │       ├── AdvanceLungeDetector.swift
│   │       ├── BalestraLungeDetector.swift
│   │       ├── FlungeDetector.swift
│   │       └── ParryRiposteDetector.swift
│   ├── Feedback/
│   │   └── AudioFeedbackManager.swift
│   ├── Recorder/
│   │   └── VideoRecorder.swift     # + FrameRingBuffer
│   ├── Gallery/
│   │   └── VideoRepository.swift
│   ├── Utils/
│   │   └── GeometryUtils.swift
│   ├── Resources/
│   │   └── Assets.xcassets/
│   └── Info.plist
└── README.md
```

## Quick Start

### Requirements
- Xcode 15.0+
- iOS 15.0+
- iOS device with camera support

### Open in Xcode

1. Open Xcode
2. File > Open > Select `LittleFencer-iOS` folder
3. Select your development team (Signing)
4. Connect an iOS device
5. Build and Run (Cmd+R)

### Or use Swift Package Manager

```bash
cd LittleFencer-iOS
swift build
```

## Optional: MediaPipe Native SDK Integration

The iOS version uses Apple Vision Framework (19 points) by default. For native MediaPipe 33-point detection:

### Method 1: CocoaPods

```bash
cd LittleFencer-iOS

# Edit Podfile, uncomment MediaPipe line
# pod 'MediaPipeTasksVision', '~> 0.10.0'

pod install
open LittleFencer.xcworkspace
```

### Method 2: Manual Integration

1. Download iOS Framework from [MediaPipe Releases](https://github.com/google/mediapipe/releases)
2. Drag `MediaPipeTasksVision.xcframework` into Xcode
3. Download `pose_landmarker_lite.task` model file and add to Resources

## Vision vs MediaPipe Landmark Mapping

| MediaPipe 33pt | Vision 19pt | Mapping |
|----------------|-------------|---------|
| 0: NOSE | .nose | Direct |
| 1-6: Eyes | .leftEar/.rightEar | Approximate |
| 7-8: Ears | .leftEar/.rightEar | Direct |
| 11-12: Shoulders | .leftShoulder/.rightShoulder | Direct |
| 13-14: Elbows | .leftElbow/.rightElbow | Direct |
| 15-16: Wrists | .leftWrist/.rightWrist | Direct |
| 17-22: Fingers | .leftWrist/.rightWrist | Approximate |
| 23-24: Hips | .leftHip/.rightHip | Direct |
| 25-26: Knees | .leftKnee/.rightKnee | Direct |
| 27-28: Ankles | .leftAnkle/.rightAnkle | Direct |
| 29-32: Feet | .leftAnkle/.rightAnkle | Approximate |

## Action Detection

### Supported Actions

```swift
enum SaberAction {
    case enGarde        // Ready stance
    case advance        // Forward step
    case retreat        // Backward step
    case lunge          // Lunge attack
    case lunging        // Lunge in progress
    case advanceLunge   // Advance-lunge combo
    case balestraLunge  // Jump-lunge combo
    case flunge         // Flying lunge (saber-specific)
    case parry          // Parry (general)
    case riposte        // Counter-attack
    case recovery       // Recovery to En Garde
}
```

### Detection Pipeline

```
PoseDetector (30fps)
     |
     v
FencingStateEngine (State Machine)
     |
     v
ActionDetectorManager
     |
     v
+----------+----------+----------+----------+----------+----------+
| Advance  | Retreat  | Advance  | Balestra | Flunge   | Parry    |
| Detector | Detector | Lunge    | Lunge    | Detector | Riposte  |
+----------+----------+----------+----------+----------+----------+
     |
     v
AudioFeedbackManager (TTS + Haptic)
```

## License

MIT License

---

Made with love for young fencers
