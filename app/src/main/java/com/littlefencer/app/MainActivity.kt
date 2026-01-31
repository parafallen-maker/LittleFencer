package com.littlefencer.app

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.PointF
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.littlefencer.app.camera.CameraManager
import com.littlefencer.app.feedback.AudioFeedbackManager
import com.littlefencer.app.logic.FencingStateEngine
import com.littlefencer.app.pose.PoseDetector
import com.littlefencer.app.recorder.FrameRingBuffer
import com.littlefencer.app.recorder.VideoEncoder
import com.littlefencer.app.recorder.VideoRecorder
import com.littlefencer.app.ui.SkeletonOverlayView
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * MainActivity - The "Smart Digital Mirror" entry point.
 * Manages camera preview, permissions, and UI in full-screen landscape mode.
 * 
 * Integration Point: Connects CameraManager -> PoseDetector -> SkeletonOverlayView
 *                   + AudioFeedbackManager for audio cues
 *                   + (Future) FencingStateEngine for action detection
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private lateinit var cameraManager: CameraManager
    private lateinit var previewView: PreviewView
    private lateinit var repCounter: TextView
    private lateinit var statusText: TextView
    private lateinit var skeletonOverlay: SkeletonOverlayView
    private lateinit var comboContainer: View
    private lateinit var comboCounter: TextView
    private lateinit var shareButton: ImageButton
    private lateinit var poseDetector: PoseDetector
    private lateinit var audioManager: AudioFeedbackManager
    private lateinit var fencingEngine: FencingStateEngine
    private lateinit var videoRecorder: VideoRecorder
    
    // P1: Pre-padding buffer for "dashcam mode"
    private lateinit var frameRingBuffer: FrameRingBuffer
    private lateinit var videoEncoder: VideoEncoder
    private val coroutineJob = SupervisorJob()
    private val coroutineScope = CoroutineScope(Dispatchers.Main + coroutineJob)

    private var repCount = 0
    private var comboCount = 0  // Consecutive good reps
    private var isEnGarde = false
    private var currentSkeletonColor = SkeletonOverlayView.COLOR_GOOD
    private var lastRecordingUri: android.net.Uri? = null  // Last saved video URI for sharing
    private var currentRepHasErrors = false  // Track if current rep had form errors

    companion object {
        private const val TAG = "MainActivity"
        private val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        
        // En Garde detection thresholds (simplified - Agent B will refine in B3)
        private const val EN_GARDE_KNEE_MIN = 90f
        private const val EN_GARDE_KNEE_MAX = 130f
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.entries.all { it.value }
        if (allGranted) {
            startCameraPreview()
        } else {
            Toast.makeText(this, "Camera permission required", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Enable full-screen immersive mode
        enableImmersiveMode()
        
        // Keep screen on during training
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_main)

        // Initialize views
        previewView = findViewById(R.id.previewView)
        repCounter = findViewById(R.id.repCounter)
        statusText = findViewById(R.id.statusText)
        skeletonOverlay = findViewById(R.id.skeletonOverlay)
        comboContainer = findViewById(R.id.comboContainer)
        comboCounter = findViewById(R.id.comboCounter)
        shareButton = findViewById(R.id.shareButton)
        
        // Setup button click listeners
        shareButton.setOnClickListener { shareLastRecording() }
        findViewById<ImageButton>(R.id.galleryButton).setOnClickListener { openGallery() }

        // Initialize managers
        cameraManager = CameraManager(this)
        audioManager = AudioFeedbackManager(this)
        audioManager.initialize()
        
        // Initialize Video Recorder (Task A2)
        videoRecorder = VideoRecorder(this)
        
        // Initialize P1: Pre-padding buffer (3 seconds @ 30fps = 90 frames)
        frameRingBuffer = FrameRingBuffer(maxFrames = 90, targetFps = 30)
        videoEncoder = VideoEncoder(this)

        // Initialize Fencing State Engine (Task B3)
        fencingEngine = FencingStateEngine(
            onStateChanged = { oldState, newState -> onFencingStateChanged(oldState, newState) },
            onFormFeedback = { feedback -> onFormFeedback(feedback) },
            onRepCompleted = { isGood -> onRepCompleted(isGood) }
        )

        // Initialize PoseDetector with result callback and frame listener for pre-padding
        poseDetector = PoseDetector(
            context = this,
            resultListener = { result -> onPoseResult(result) },
            errorListener = { error -> onPoseError(error) },
            frameListener = { bitmap, timestampMs -> 
                // Feed frames to ring buffer for pre-padding capture
                frameRingBuffer.addFrame(bitmap, timestampMs)
            }
        )

        // Check permissions and start camera
        if (allPermissionsGranted()) {
            startCameraPreview()
        } else {
            permissionLauncher.launch(REQUIRED_PERMISSIONS)
        }
    }

    private fun enableImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = 
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun allPermissionsGranted() = REQUIRED_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(baseContext, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun startCameraPreview() {
        updateStatus("Initializing camera...")
        
        // Create VideoCapture use case
        val videoCapture = videoRecorder.createVideoCapture()
        
        // Set callback for recording completion
        videoRecorder.onRecordingFinished = { success, uri ->
            runOnUiThread {
                if (success && uri != null) {
                    lastRecordingUri = uri
                    shareButton.visibility = View.VISIBLE
                    // Animate share button appearance
                    shareButton.alpha = 0f
                    shareButton.animate()
                        .alpha(1f)
                        .setDuration(300)
                        .start()
                    Toast.makeText(this, "Highlight saved! 🎬 Tap to share", Toast.LENGTH_SHORT).show()
                }
            }
        }
        
        // Start camera with PoseDetector analyzer and VideoCapture
        cameraManager.startCamera(
            lifecycleOwner = this,
            previewView = previewView,
            analyzer = poseDetector,
            videoCapture = videoCapture
        )
        
        updateStatus("Waiting for En Garde...")
    }

    /**
     * Called when PoseDetector returns landmark results.
     * Feeds landmarks to FencingStateEngine and updates skeleton overlay.
     */
    private fun onPoseResult(result: PoseLandmarkerResult) {
        if (result.landmarks().isEmpty()) {
            fencingEngine.reset()
            runOnUiThread {
                skeletonOverlay.clearSkeleton()
                if (isEnGarde) {
                    isEnGarde = false
                    updateStatus("Waiting for En Garde...")
                }
            }
            return
        }

        val landmarks = result.landmarks()[0]
        val points = landmarks.map { landmark ->
            PointF(landmark.x(), landmark.y())
        }

        // Feed landmarks to FencingStateEngine for analysis
        val frameTimeMs = System.currentTimeMillis()
        fencingEngine.processFrame(points, frameTimeMs)

        // Update skeleton overlay with current color (set by onFormFeedback)
        runOnUiThread {
            skeletonOverlay.updateSkeleton(points, currentSkeletonColor)
        }

        Log.v(TAG, "Pose detected with ${points.size} landmarks")
    }

    /**
     * Called when FencingStateEngine transitions between states.
     */
    private fun onFencingStateChanged(oldState: FencingStateEngine.FencingState, newState: FencingStateEngine.FencingState) {
        Log.d(TAG, "State: $oldState → $newState")
        
        runOnUiThread {
            when (newState) {
                FencingStateEngine.FencingState.IDLE -> {
                    isEnGarde = false
                    updateStatus("Stand in En Garde position")
                    if (videoRecorder.isRecording()) {
                        stopAndSaveRecording()
                    }
                }
                FencingStateEngine.FencingState.EN_GARDE -> {
                    isEnGarde = true
                    if (oldState == FencingStateEngine.FencingState.IDLE) {
                        updateStatus("En Garde! ⚔️ Ready...")
                        audioManager.speak(AudioFeedbackManager.PHRASE_EN_GARDE)
                        audioManager.playGoodFeedback()
                    } else if (oldState == FencingStateEngine.FencingState.RECOVERY) {
                        // Action cycle complete! Save pre-padded video
                        updateStatus("Good recovery! ✓")
                        savePrePaddedVideo()
                    }
                }
                FencingStateEngine.FencingState.LUNGING -> {
                    updateStatus("Lunging... 🗡️")
                    startRecording()
                }
                FencingStateEngine.FencingState.RECOVERY -> {
                    updateStatus("Recovering...")
                }
            }
        }
    }

    /**
     * Called when FencingStateEngine provides form feedback.
     */
    private fun onFormFeedback(feedback: FencingStateEngine.FormFeedback) {
        currentSkeletonColor = if (feedback.isGoodForm) {
            SkeletonOverlayView.COLOR_GOOD
        } else {
            SkeletonOverlayView.COLOR_BAD
        }

        feedback.message?.let { message ->
            audioManager.speak(message)
            audioManager.playBadFeedback()
            // Mark current rep as having errors for video classification
            currentRepHasErrors = true
        }
    }

    /**
     * Called when a complete rep is detected.
     */
    private fun onRepCompleted(isGoodRep: Boolean) {
        incrementRepCount()
        
        runOnUiThread {
            if (isGoodRep) {
                // Increment combo for good rep
                comboCount++
                updateComboDisplay()
                
                skeletonOverlay.triggerCenterSparkles()
                audioManager.playPerfectFeedback()
                
                // Extra celebration for combo milestones
                if (comboCount == 5) {
                    audioManager.speak("Five combo! Keep it up!")
                } else if (comboCount == 10) {
                    audioManager.speak("Ten combo! You're on fire!")
                }
            } else {
                // Reset combo on bad rep
                comboCount = 0
                updateComboDisplay()
                audioManager.playBadFeedback()
            }
        }

        stopAndSaveRecording()
    }

    /**
     * Update the combo counter display.
     */
    private fun updateComboDisplay() {
        if (comboCount >= 2) {
            comboContainer.visibility = View.VISIBLE
            comboCounter.text = "${comboCount}x"
            
            // Animate combo counter
            comboCounter.animate()
                .scaleX(1.2f)
                .scaleY(1.2f)
                .setDuration(100)
                .withEndAction {
                    comboCounter.animate()
                        .scaleX(1.0f)
                        .scaleY(1.0f)
                        .setDuration(100)
                        .start()
                }
                .start()
        } else {
            comboContainer.visibility = View.GONE
        }
    }

    /**
     * Start video recording for action capture.
     */
    private fun startRecording() {
        if (!videoRecorder.isRecording()) {
            // Reset error tracking for this rep
            currentRepHasErrors = false
            
            // Start recording with initial category based on current form
            val category = if (currentSkeletonColor == SkeletonOverlayView.COLOR_GOOD) {
                VideoRecorder.VideoCategory.PERFECT
            } else {
                VideoRecorder.VideoCategory.PRACTICE
            }
            
            if (videoRecorder.startRecording(category)) {
                Log.d(TAG, "Recording started with category: $category")
            }
        }
    }

    /**
     * Stop recording (video saves automatically to gallery).
     */
    private fun stopAndSaveRecording() {
        if (videoRecorder.isRecording()) {
            videoRecorder.stopRecording()
            Log.d(TAG, "Recording stopped")
        }
    }
    
    /**
     * P1: Save pre-padded video from ring buffer.
     * Drains all buffered frames and encodes them to MP4.
     */
    private fun savePrePaddedVideo() {
        val frames = frameRingBuffer.drainFrames()
        if (frames.isEmpty()) {
            Log.d(TAG, "No pre-padding frames to save")
            return
        }
        
        Log.d(TAG, "Saving ${frames.size} pre-padded frames...")
        
        coroutineScope.launch {
            val success = videoEncoder.encodeAndSave(frames, "LittleFencer_Action")
            
            // Recycle bitmaps after encoding
            frames.forEach { frame ->
                if (!frame.bitmap.isRecycled) {
                    frame.bitmap.recycle()
                }
            }
            
            if (success) {
                Log.d(TAG, "Pre-padded video saved successfully!")
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Action captured! 🎬", Toast.LENGTH_SHORT).show()
                    // Show share button
                    shareButton.visibility = View.VISIBLE
                }
            } else {
                Log.e(TAG, "Failed to save pre-padded video")
            }
        }
    }

    private fun onPoseError(error: String) {
        Log.e(TAG, "PoseDetector error: $error")
        runOnUiThread {
            Toast.makeText(this, "AI Error: $error", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        
        // Cancel coroutine scope to prevent leaks
        coroutineJob.cancel()
        
        cameraManager.stopCamera()
        if (::poseDetector.isInitialized) {
            // Close MediaPipe on background thread to avoid blocking UI
            Thread { poseDetector.close() }.start()
        }
        if (::audioManager.isInitialized) {
            audioManager.release()
        }
        if (::videoRecorder.isInitialized) {
            videoRecorder.release()
        }
        if (::frameRingBuffer.isInitialized) {
            frameRingBuffer.release()
        }
    }

    // Public methods for other components to update UI
    fun updateRepCount(count: Int) {
        repCount = count
        runOnUiThread {
            repCounter.text = count.toString()
        }
    }

    fun incrementRepCount() {
        updateRepCount(repCount + 1)
        audioManager.playGoodFeedback()
    }

    fun updateStatus(message: String) {
        runOnUiThread {
            statusText.text = message
        }
    }

    /**
     * Trigger perfect move feedback (sparkles + audio).
     * Called by FencingStateEngine when a perfect action is detected.
     */
    fun onPerfectMove() {
        runOnUiThread {
            skeletonOverlay.triggerCenterSparkles()
        }
        audioManager.playPerfectFeedback()
        incrementRepCount()
    }

    /**
     * Share the last recorded video via Android share sheet.
     */
    private fun shareLastRecording() {
        val uri = lastRecordingUri
        if (uri == null) {
            Toast.makeText(this, "No recording to share", Toast.LENGTH_SHORT).show()
            return
        }

        val shareIntent = android.content.Intent().apply {
            action = android.content.Intent.ACTION_SEND
            putExtra(android.content.Intent.EXTRA_STREAM, uri)
            type = "video/mp4"
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(android.content.Intent.EXTRA_SUBJECT, "Check out my fencing move! ⚔️")
            putExtra(android.content.Intent.EXTRA_TEXT, "Watch my training highlight from LittleFencer! 🤺")
        }

        val chooser = android.content.Intent.createChooser(shareIntent, "Share your fencing move")
        startActivity(chooser)
        
        Log.d(TAG, "Sharing video: $uri")
    }

    /**
     * Open the gallery activity to view all training videos.
     */
    private fun openGallery() {
        val intent = android.content.Intent(this, com.littlefencer.app.gallery.GalleryActivity::class.java)
        startActivity(intent)
    }
}
