package com.littlefencer.app.recorder

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Date

/**
 * VideoRecorder - Handles video recording using CameraX VideoCapture API.
 * Agent A (Systems Engineer) - Task A2
 * 
 * P0 Strategy: Direct recording (no buffer).
 * - Start recording when action begins (Lunge detected)
 * - Stop recording when action ends (Recovery complete)
 * - Save directly to MediaStore (Gallery)
 * 
 * Uses CameraX VideoCapture for proper camera integration.
 */
class VideoRecorder(private val context: Context) {

    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private var isRecordingActive = false
    
    // Callback for recording events - returns success and optional URI
    var onRecordingFinished: ((Boolean, android.net.Uri?) -> Unit)? = null

    companion object {
        private const val TAG = "VideoRecorder"
    }

    /**
     * Create the VideoCapture use case.
     * Must be called during camera setup and bound to lifecycle.
     */
    fun createVideoCapture(): VideoCapture<Recorder> {
        val qualitySelector = QualitySelector.from(
            Quality.HD,  // 720p for balance of quality and performance
            androidx.camera.video.FallbackStrategy.higherQualityOrLowerThan(Quality.HD)
        )

        val recorder = Recorder.Builder()
            .setQualitySelector(qualitySelector)
            .build()

        videoCapture = VideoCapture.withOutput(recorder)
        return videoCapture!!
    }

    /**
     * Get the VideoCapture use case for binding to camera.
     */
    fun getVideoCapture(): VideoCapture<Recorder>? = videoCapture

    // Pending category for the current recording (set when stopping)
    private var pendingCategory: VideoCategory = VideoCategory.PRACTICE
    
    /**
     * Video category for classification
     */
    enum class VideoCategory {
        PERFECT,   // Good form (⭐ 精彩)
        PRACTICE   // Needs improvement (📝 待改进)
    }

    /**
     * Start recording video to MediaStore (Gallery).
     * @param category Initial category hint (can be updated when stopping)
     * @return true if recording started successfully
     */
    @androidx.annotation.OptIn(androidx.camera.video.ExperimentalPersistentRecording::class)
    fun startRecording(category: VideoCategory = VideoCategory.PRACTICE): Boolean {
        if (isRecordingActive) {
            Log.w(TAG, "Already recording")
            return false
        }

        val capture = videoCapture ?: run {
            Log.e(TAG, "VideoCapture not initialized")
            return false
        }
        
        pendingCategory = category

        // Create output options for MediaStore
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val prefix = if (category == VideoCategory.PERFECT) "Perfect" else "Practice"
        val fileName = "LittleFencer_${prefix}_$timestamp"

        val contentValues = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, 
                Environment.DIRECTORY_DCIM + "/LittleFencer")
        }

        val mediaStoreOutput = MediaStoreOutputOptions.Builder(
            context.contentResolver,
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        )
            .setContentValues(contentValues)
            .build()

        try {
            // Prepare recording
            var pendingRecording = capture.output
                .prepareRecording(context, mediaStoreOutput)
            
            // Only enable audio if permission is granted
            val hasAudioPermission = ContextCompat.checkSelfPermission(
                context, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            
            if (hasAudioPermission) {
                pendingRecording = pendingRecording.withAudioEnabled()
            } else {
                Log.w(TAG, "RECORD_AUDIO permission not granted, recording without audio")
            }

            activeRecording = pendingRecording.start(
                ContextCompat.getMainExecutor(context),
                createVideoRecordEventListener()
            )

            isRecordingActive = true
            Log.d(TAG, "Recording started: $fileName")
            return true

        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied for recording", e)
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            return false
        }
    }

    /**
     * Stop the current recording.
     */
    fun stopRecording() {
        if (!isRecordingActive) {
            Log.w(TAG, "Not recording")
            return
        }

        activeRecording?.stop()
        activeRecording = null
        isRecordingActive = false
        Log.d(TAG, "Recording stop requested")
    }

    /**
     * Check if currently recording.
     */
    fun isRecording(): Boolean = isRecordingActive

    /**
     * Create listener for video recording events.
     */
    private fun createVideoRecordEventListener(): Consumer<VideoRecordEvent> {
        return Consumer { event ->
            when (event) {
                is VideoRecordEvent.Start -> {
                    Log.d(TAG, "Recording started")
                }
                is VideoRecordEvent.Finalize -> {
                    isRecordingActive = false
                    if (event.hasError()) {
                        Log.e(TAG, "Recording failed: ${event.error}")
                        onRecordingFinished?.invoke(false, null)
                    } else {
                        val uri = event.outputResults.outputUri
                        Log.d(TAG, "Recording saved: $uri")
                        onRecordingFinished?.invoke(true, uri)
                    }
                }
                is VideoRecordEvent.Status -> {
                    // Optional: Update recording duration UI
                    val stats = event.recordingStats
                    Log.v(TAG, "Recording: ${stats.recordedDurationNanos / 1_000_000}ms")
                }
                is VideoRecordEvent.Pause -> {
                    Log.d(TAG, "Recording paused")
                }
                is VideoRecordEvent.Resume -> {
                    Log.d(TAG, "Recording resumed")
                }
            }
        }
    }

    /**
     * Release all resources.
     */
    fun release() {
        stopRecording()
        videoCapture = null
    }
}

/**
 * PrePaddingVideoRecorder - Enhanced recorder with ring buffer for pre-action capture.
 * 
 * P1 Enhancement: "Dashcam mode" that continuously buffers frames.
 * When an action is detected, the buffered frames are prepended to capture
 * the lead-up to the action.
 * 
 * Usage:
 * 1. Call `bufferFrame()` on every camera frame
 * 2. When action starts, call `startRecordingWithPrePadding()`
 * 3. When action ends, call `stopAndSave()`
 */
class PrePaddingVideoRecorder(private val context: Context) {
    
    private val ringBuffer = FrameRingBuffer(
        maxFrames = PRE_PADDING_FRAMES,
        targetFps = TARGET_FPS
    )
    private val videoEncoder = VideoEncoder(context)
    
    // Frames captured during active recording
    private val activeFrames = mutableListOf<FrameRingBuffer.TimestampedFrame>()
    private var isRecordingActive = false
    
    // Callback for save completion
    var onSaveComplete: ((Boolean) -> Unit)? = null
    
    companion object {
        private const val TAG = "PrePaddingRecorder"
        
        // Pre-padding: 2 seconds at 30fps = 60 frames
        private const val PRE_PADDING_FRAMES = 60
        private const val TARGET_FPS = 30
    }
    
    /**
     * Buffer a frame for potential pre-padding.
     * Call this on every camera frame.
     * 
     * @param bitmap Frame bitmap (will be copied)
     * @param timestampMs Frame timestamp
     */
    fun bufferFrame(bitmap: android.graphics.Bitmap, timestampMs: Long) {
        if (isRecordingActive) {
            // During recording, add to active frames
            val copy = bitmap.copy(bitmap.config ?: android.graphics.Bitmap.Config.ARGB_8888, false)
            activeFrames.add(FrameRingBuffer.TimestampedFrame(copy, timestampMs))
        } else {
            // Not recording, add to ring buffer
            ringBuffer.addFrame(bitmap, timestampMs)
        }
    }
    
    /**
     * Start recording with pre-padding from ring buffer.
     */
    fun startRecordingWithPrePadding() {
        if (isRecordingActive) {
            Log.w(TAG, "Already recording")
            return
        }
        
        isRecordingActive = true
        
        // Drain pre-padding frames from ring buffer
        val prePaddingFrames = ringBuffer.drainFrames()
        activeFrames.addAll(prePaddingFrames)
        
        Log.d(TAG, "Recording started with ${prePaddingFrames.size} pre-padding frames")
    }
    
    /**
     * Stop recording and encode all frames to video.
     */
    suspend fun stopAndSave(): Boolean {
        if (!isRecordingActive) {
            Log.w(TAG, "Not recording")
            return false
        }
        
        isRecordingActive = false
        
        val framesToEncode = activeFrames.toList()
        activeFrames.clear()
        
        Log.d(TAG, "Encoding ${framesToEncode.size} frames")
        
        val success = videoEncoder.encodeAndSave(framesToEncode, "LittleFencer_Action")
        
        // Recycle bitmaps
        framesToEncode.forEach { it.bitmap.recycle() }
        
        onSaveComplete?.invoke(success)
        return success
    }
    
    /**
     * Check if currently recording.
     */
    fun isRecording(): Boolean = isRecordingActive
    
    /**
     * Get buffer statistics.
     */
    fun getBufferStats(): FrameRingBuffer.BufferStats = ringBuffer.getStats()
    
    /**
     * Release all resources.
     */
    fun release() {
        isRecordingActive = false
        activeFrames.forEach { it.bitmap.recycle() }
        activeFrames.clear()
        ringBuffer.release()
        Log.d(TAG, "PrePaddingRecorder released")
    }
}
