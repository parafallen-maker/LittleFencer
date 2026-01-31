package com.littlefencer.app.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import android.util.Log
import androidx.annotation.VisibleForTesting
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PoseDetector(
    private val context: Context,
    private val resultListener: (PoseLandmarkerResult) -> Unit,
    private val errorListener: (String) -> Unit = {},
    private val frameListener: ((Bitmap, Long) -> Unit)? = null  // P1: For pre-padding buffer
) : ImageAnalysis.Analyzer {

    private var poseLandmarker: PoseLandmarker? = null
    // Background executor for MediaPipe setup (optional if lightweight, but good practice)
    private val backgroundExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    init {
        // Initialize MediaPipe asynchronously
        backgroundExecutor.execute {
            setupPoseLandmarker()
        }
    }

    private fun setupPoseLandmarker() {
        // Try GPU first, fallback to CPU if GPU fails
        if (!tryCreateWithDelegate(Delegate.GPU)) {
            Log.w(TAG, "GPU delegate failed, falling back to CPU")
            if (!tryCreateWithDelegate(Delegate.CPU)) {
                errorListener("MediaPipe failed to initialize on both GPU and CPU")
            }
        }
    }

    private fun tryCreateWithDelegate(delegate: Delegate): Boolean {
        val baseOptions = BaseOptions.builder()
            .setModelAssetPath("pose_landmarker_lite.task")
            .setDelegate(delegate)
            .build()

        val options = PoseLandmarker.PoseLandmarkerOptions.builder()
            .setBaseOptions(baseOptions)
            .setMinPoseDetectionConfidence(0.5f)
            .setMinPosePresenceConfidence(0.5f)
            .setMinTrackingConfidence(0.5f)
            .setRunningMode(RunningMode.LIVE_STREAM)
            .setResultListener(this::returnLivestreamResult)
            .setErrorListener(this::returnLivestreamError)
            .build()

        return try {
            poseLandmarker = PoseLandmarker.createFromOptions(context, options)
            Log.d(TAG, "PoseLandmarker initialized with $delegate delegate")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize with $delegate delegate", e)
            false
        }
    }

    override fun analyze(imageProxy: ImageProxy) {
        if (poseLandmarker == null) {
            imageProxy.close()
            return
        }

        val frameTime = SystemClock.uptimeMillis()

        // Convert ImageProxy to Bitmap
        val bitmap = imageProxy.toBitmap()
        
        // Handle rotation if necessary
        val rotatedBitmap = if (imageProxy.imageInfo.rotationDegrees != 0) {
            val rotated = rotateBitmap(bitmap, imageProxy.imageInfo.rotationDegrees.toFloat())
            // Recycle original bitmap after rotation (no longer needed)
            if (rotated != bitmap) {
                bitmap.recycle()
            }
            rotated
        } else {
            bitmap
        }

        val mpImage = BitmapImageBuilder(rotatedBitmap).build()

        detectAsync(mpImage, frameTime)
        
        // P1: Provide frame to pre-padding buffer listener (makes a copy internally)
        // IMPORTANT: Call frameListener BEFORE recycling, as it needs to copy the bitmap
        frameListener?.invoke(rotatedBitmap, frameTime)
        
        // Recycle bitmap after both MediaPipe and FrameRingBuffer have copied it
        // Note: Both systems copy the bitmap data internally, safe to recycle now
        rotatedBitmap.recycle()
        
        // Important: Close the proxy so CameraX can deliver the next frame
        imageProxy.close()
    }

    @VisibleForTesting
    fun detectAsync(mpImage: MPImage, frameTime: Long) {
        poseLandmarker?.detectAsync(mpImage, frameTime)
    }

    private fun returnLivestreamResult(result: PoseLandmarkerResult, input: MPImage) {
        // Pass result up to the listener (MainActivity)
        resultListener(result)
    }

    private fun returnLivestreamError(error: RuntimeException) {
        errorListener(error.message ?: "Unknown MediaPipe error")
    }
    
    private fun rotateBitmap(source: Bitmap, degrees: Float): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(degrees)
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    fun close() {
        poseLandmarker?.close()
        poseLandmarker = null
        backgroundExecutor.shutdown()
    }

    companion object {
        private const val TAG = "PoseDetector"
    }
}
