/**
 * Centralized tunable configuration
 *
 * All detector thresholds live here so they can be tuned (or A/B tested)
 * in one place instead of being scattered across detector classes.
 * Units: normalized image coordinates [0,1] unless noted otherwise.
 */

// Landmarks that detectors rely on (shoulders/elbows/wrists/hips/knees/ankles).
// The engine's full-body gate covers 9 points at 0.7; detectors additionally
// need arms, so we gate the full set at a lower bar before running detection.
export const DetectionGate = {
    requiredLandmarks: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28],
    minVisibility: 0.5
};

// Action arbitration: after any action is reported, all detectors reset and
// detection pauses briefly so one physical motion can't be double-reported
// (e.g. advance-lunge echoing as a separate lunge on the next frame).
export const ArbitrationConfig = {
    COOLDOWN_MS: 600
};

// Idle-state baseline refresh: detectors that diff against a baseline
// (hip height, wrist height, arm extension) slowly track the current pose
// while idle, so shifting stance doesn't leave a stale baseline behind.
// Per-frame EMA factor; 0.05 ≈ converges in ~1s at 30fps.
export const BaselineConfig = {
    EMA_ALPHA: 0.05
};

export const DetectorConfig = {
    lunge: {
        ARM_EXTENSION_START: 0.20,   // arm extension delta to enter ARM_EXTENDING
        ARM_EXTENSION_FULL: 0.30,    // arm extension delta considered "fully extended"
        BACK_KNEE_MIN_STRAIGHT: 150, // degrees
        FRONT_KNEE_LUNGE_MAX: 110,   // degrees
        STANCE_WIDTH_LUNGE: 1.8,     // ankle width / hip width ratio
        MIN_LUNGE_DURATION: 150,     // ms
        MAX_LUNGE_DURATION: 1500     // ms
    },

    advance: {
        MIN_DISTANCE: 0.04,          // minimum hip center travel
        MAX_DURATION: 800,           // ms
        VELOCITY_START: 0.012,       // velocity to start detection (per second)
        VELOCITY_STOP: 0.006,        // velocity to confirm stop
        KNEE_MIN: 80,                // degrees, En Garde validity
        KNEE_MAX: 140,               // degrees
        STABLE_FRAMES: 3             // low-velocity frames to confirm stop
    },

    retreat: {
        MIN_DISTANCE: 0.04,
        MAX_DURATION: 800,
        VELOCITY_START: 0.012,
        VELOCITY_STOP: 0.006,
        KNEE_MIN: 80,
        KNEE_MAX: 140,
        STABLE_FRAMES: 3
    },

    advanceLunge: {
        MOVEMENT_THRESHOLD: 0.04,    // front ankle forward travel to enter ADVANCING
        TOTAL_TIMEOUT: 2000          // ms, whole-action timeout
    },

    balestraLunge: {
        JUMP_THRESHOLD: 0.03,        // hip rise to count as airborne
        AIRBORNE_TIMEOUT: 1000,      // ms
        LANDING_TIMEOUT: 1000        // ms, time allowed to chain into a lunge
    },

    flunge: {
        ARM_DELTA_START: 0.2,        // arm extension delta to enter EXTENDING
        HIP_RISE_FLYING: 0.04,       // hip rise to count as flying
        HIP_RISE_LANDED: 0.02,       // hip rise below this = landed
        FEET_Y_TOLERANCE: 0.1,       // both feet at similar height
        EXTENDING_TIMEOUT: 1500,     // ms
        FLYING_TIMEOUT: 1000,        // ms
        MIN_DURATION: 200            // ms
    },

    parryRiposte: {
        PARRY_THRESHOLD: 0.08,       // wrist rise to count as a parry
        RIPOSTE_ARM_EXTENSION: 0.7,  // absolute arm extension for the riposte
        PARRY_TIMEOUT: 1500,         // ms
        MIN_DURATION: 200            // ms
    }
};

export const StorageConfig = {
    // Hard cap on stored training videos. When exceeded, the oldest
    // non-starred videos are pruned automatically (starred ones are kept).
    maxVideos: 50,
    // How many old videos to prune when an IndexedDB write hits
    // QuotaExceededError before retrying the write once.
    quotaPruneCount: 5
};
