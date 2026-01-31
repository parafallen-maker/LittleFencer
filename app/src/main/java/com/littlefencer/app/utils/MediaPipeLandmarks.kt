package com.littlefencer.app.utils

/**
 * MediaPipe Pose Landmark indices.
 * 
 * This object contains the standard 33-point body pose landmark indices
 * used by Google's MediaPipe Pose Landmarker model.
 * 
 * Reference: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */
object MediaPipeLandmarks {
    // Face landmarks (0-10)
    const val NOSE = 0
    const val LEFT_EYE_INNER = 1
    const val LEFT_EYE = 2
    const val LEFT_EYE_OUTER = 3
    const val RIGHT_EYE_INNER = 4
    const val RIGHT_EYE = 5
    const val RIGHT_EYE_OUTER = 6
    const val LEFT_EAR = 7
    const val RIGHT_EAR = 8
    const val MOUTH_LEFT = 9
    const val MOUTH_RIGHT = 10

    // Upper body landmarks (11-22)
    const val LEFT_SHOULDER = 11
    const val RIGHT_SHOULDER = 12
    const val LEFT_ELBOW = 13
    const val RIGHT_ELBOW = 14
    const val LEFT_WRIST = 15
    const val RIGHT_WRIST = 16
    const val LEFT_PINKY = 17
    const val RIGHT_PINKY = 18
    const val LEFT_INDEX = 19
    const val RIGHT_INDEX = 20
    const val LEFT_THUMB = 21
    const val RIGHT_THUMB = 22

    // Lower body landmarks (23-32)
    const val LEFT_HIP = 23
    const val RIGHT_HIP = 24
    const val LEFT_KNEE = 25
    const val RIGHT_KNEE = 26
    const val LEFT_ANKLE = 27
    const val RIGHT_ANKLE = 28
    const val LEFT_HEEL = 29
    const val RIGHT_HEEL = 30
    const val LEFT_FOOT_INDEX = 31
    const val RIGHT_FOOT_INDEX = 32

    // Total number of landmarks
    const val TOTAL_LANDMARKS = 33

    /**
     * Skeleton connections for drawing.
     * Each pair represents a line segment between two landmarks.
     */
    val POSE_CONNECTIONS = listOf(
        // Torso
        Pair(LEFT_SHOULDER, RIGHT_SHOULDER),
        Pair(LEFT_SHOULDER, LEFT_HIP),
        Pair(RIGHT_SHOULDER, RIGHT_HIP),
        Pair(LEFT_HIP, RIGHT_HIP),

        // Left Arm
        Pair(LEFT_SHOULDER, LEFT_ELBOW),
        Pair(LEFT_ELBOW, LEFT_WRIST),

        // Right Arm
        Pair(RIGHT_SHOULDER, RIGHT_ELBOW),
        Pair(RIGHT_ELBOW, RIGHT_WRIST),

        // Left Leg
        Pair(LEFT_HIP, LEFT_KNEE),
        Pair(LEFT_KNEE, LEFT_ANKLE),

        // Right Leg
        Pair(RIGHT_HIP, RIGHT_KNEE),
        Pair(RIGHT_KNEE, RIGHT_ANKLE)
    )

    /**
     * Key joint indices for fencing analysis.
     */
    val KEY_JOINTS = listOf(
        LEFT_SHOULDER, RIGHT_SHOULDER,
        LEFT_ELBOW, RIGHT_ELBOW,
        LEFT_WRIST, RIGHT_WRIST,
        LEFT_HIP, RIGHT_HIP,
        LEFT_KNEE, RIGHT_KNEE,
        LEFT_ANKLE, RIGHT_ANKLE
    )
}
