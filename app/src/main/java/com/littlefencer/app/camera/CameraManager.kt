package com.littlefencer.app.camera

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.VideoCapture
import androidx.camera.video.Recorder
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * CameraManager - Handles CameraX setup and lifecycle.
 * Agent A (Systems Engineer) - Task A1
 * 
 * Supports:
 * - Preview (camera feed display)
 * - ImageAnalysis (AI pose detection)
 * - VideoCapture (action recording)
 */
class CameraManager(private val context: Context) {

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    companion object {
        private const val TAG = "CameraManager"
    }

    /**
     * Starts the camera preview with image analysis and optional video capture.
     * @param lifecycleOwner Activity or Fragment lifecycle owner
     * @param previewView The PreviewView to display camera feed
     * @param analyzer Optional ImageAnalysis.Analyzer for frame processing (e.g., MediaPipe)
     * @param videoCapture Optional VideoCapture use case for recording
     */
    fun startCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        analyzer: ImageAnalysis.Analyzer? = null,
        videoCapture: VideoCapture<Recorder>? = null
    ) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()

            // Preview Use Case
            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

            // Image Analysis Use Case (for AI processing)
            imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also { analysis ->
                    analyzer?.let {
                        analysis.setAnalyzer(cameraExecutor, it)
                    }
                }

            // Select back camera
            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                // Unbind all use cases before rebinding
                cameraProvider?.unbindAll()

                // Build use case list
                if (videoCapture != null) {
                    // Bind with VideoCapture (Preview + Analysis + Video)
                    cameraProvider?.bindToLifecycle(
                        lifecycleOwner,
                        cameraSelector,
                        preview,
                        imageAnalyzer,
                        videoCapture
                    )
                    Log.d(TAG, "Camera started with VideoCapture")
                } else {
                    // Bind without VideoCapture (Preview + Analysis only)
                    cameraProvider?.bindToLifecycle(
                        lifecycleOwner,
                        cameraSelector,
                        preview,
                        imageAnalyzer
                    )
                    Log.d(TAG, "Camera started (no VideoCapture)")
                }

            } catch (exc: Exception) {
                Log.e(TAG, "Use case binding failed", exc)
            }

        }, ContextCompat.getMainExecutor(context))
    }

    /**
     * Stops the camera and releases resources.
     */
    fun stopCamera() {
        cameraProvider?.unbindAll()
        cameraExecutor.shutdown()
        Log.d(TAG, "Camera stopped")
    }

    /**
     * Returns the executor for image analysis (useful for MediaPipe).
     */
    fun getAnalysisExecutor(): ExecutorService = cameraExecutor
}
