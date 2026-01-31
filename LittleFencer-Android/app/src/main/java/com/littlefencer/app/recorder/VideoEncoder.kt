package com.littlefencer.app.recorder

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer

/**
 * VideoEncoder - Encodes bitmap frames into MP4 video using MediaCodec.
 * 
 * P1 Enhancement: Used to encode pre-buffered frames into video.
 * - Accepts list of timestamped bitmaps
 * - Encodes to H.264 MP4
 * - Saves to MediaStore (Gallery)
 */
class VideoEncoder(private val context: Context) {
    
    companion object {
        private const val TAG = "VideoEncoder"
        
        // Video encoding parameters
        private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC  // H.264
        private const val BIT_RATE = 4_000_000  // 4 Mbps
        private const val FRAME_RATE = 30
        private const val I_FRAME_INTERVAL = 1  // Keyframe every 1 second
        
        // Color format for input (ARGB -> YUV conversion)
        private const val COLOR_FORMAT = MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
    }
    
    /**
     * Encode a list of frames to MP4 and save to gallery.
     * 
     * @param frames List of timestamped frames to encode
     * @param fileNamePrefix Prefix for the output filename
     * @return true if encoding and saving succeeded
     */
    suspend fun encodeAndSave(
        frames: List<FrameRingBuffer.TimestampedFrame>,
        fileNamePrefix: String = "LittleFencer_PrePad"
    ): Boolean = withContext(Dispatchers.IO) {
        if (frames.isEmpty()) {
            Log.w(TAG, "No frames to encode")
            return@withContext false
        }
        
        val firstFrame = frames.first().bitmap
        val width = firstFrame.width
        val height = firstFrame.height
        
        // Ensure dimensions are even (required by most codecs)
        val adjustedWidth = width - (width % 2)
        val adjustedHeight = height - (height % 2)
        
        Log.d(TAG, "Encoding ${frames.size} frames at ${adjustedWidth}x${adjustedHeight}")
        
        // Create temporary file for encoding
        val tempFile = File(context.cacheDir, "temp_video_${System.currentTimeMillis()}.mp4")
        
        var encoder: MediaCodec? = null
        var muxer: MediaMuxer? = null
        var success = false
        
        try {
            // Configure MediaFormat
            val format = MediaFormat.createVideoFormat(MIME_TYPE, adjustedWidth, adjustedHeight).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, COLOR_FORMAT)
                setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
                setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
                setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL)
            }
            
            // Create encoder
            encoder = MediaCodec.createEncoderByType(MIME_TYPE)
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start()
            
            // Create muxer
            muxer = MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            
            var videoTrackIndex = -1
            var muxerStarted = false
            val bufferInfo = MediaCodec.BufferInfo()
            
            // Calculate frame duration in microseconds
            val frameDurationUs = 1_000_000L / FRAME_RATE
            
            // Encode each frame
            for ((index, frame) in frames.withIndex()) {
                val presentationTimeUs = index * frameDurationUs
                
                // Get input buffer
                val inputBufferIndex = encoder.dequeueInputBuffer(10_000)
                if (inputBufferIndex >= 0) {
                    val inputBuffer = encoder.getInputBuffer(inputBufferIndex)
                    inputBuffer?.let { buffer ->
                        // Convert bitmap to YUV and fill buffer
                        fillInputBuffer(buffer, frame.bitmap, adjustedWidth, adjustedHeight)
                    }
                    
                    encoder.queueInputBuffer(
                        inputBufferIndex,
                        0,
                        adjustedWidth * adjustedHeight * 3 / 2,  // YUV420 size
                        presentationTimeUs,
                        0
                    )
                }
                
                // Drain output buffers
                drainEncoder(encoder, muxer, bufferInfo, videoTrackIndex, muxerStarted).let { (track, started) ->
                    if (track >= 0) videoTrackIndex = track
                    if (started) muxerStarted = true
                }
            }
            
            // Signal end of stream
            val inputBufferIndex = encoder.dequeueInputBuffer(10_000)
            if (inputBufferIndex >= 0) {
                encoder.queueInputBuffer(
                    inputBufferIndex,
                    0,
                    0,
                    0,
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
            }
            
            // Drain remaining output until EOS flag is received
            var drainComplete = false
            while (!drainComplete) {
                val outputBufferIndex = encoder.dequeueOutputBuffer(bufferInfo, 10_000)
                
                when {
                    outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        if (!muxerStarted) {
                            val newFormat = encoder.outputFormat
                            videoTrackIndex = muxer?.addTrack(newFormat) ?: -1
                            muxer?.start()
                            muxerStarted = true
                        }
                    }
                    outputBufferIndex >= 0 -> {
                        val outputBuffer = encoder.getOutputBuffer(outputBufferIndex)
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                            bufferInfo.size = 0
                        }
                        
                        if (bufferInfo.size > 0 && muxerStarted && outputBuffer != null) {
                            outputBuffer.position(bufferInfo.offset)
                            outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                            muxer?.writeSampleData(videoTrackIndex, outputBuffer, bufferInfo)
                        }
                        
                        encoder.releaseOutputBuffer(outputBufferIndex, false)
                        
                        // Check for EOS flag to exit the loop
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                            drainComplete = true
                        }
                    }
                    outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                        // No output available, continue waiting
                        Thread.sleep(10)
                    }
                }
            }
            
            success = true
            Log.d(TAG, "Encoding completed successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Encoding failed", e)
        } finally {
            try {
                encoder?.stop()
                encoder?.release()
                muxer?.stop()
                muxer?.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing encoder/muxer", e)
            }
        }
        
        // Save to MediaStore if encoding succeeded
        if (success && tempFile.exists()) {
            val savedUri = saveToMediaStore(tempFile, fileNamePrefix)
            tempFile.delete()
            return@withContext savedUri != null
        }
        
        tempFile.delete()
        return@withContext false
    }
    
    /**
     * Drain encoder output buffers to muxer.
     */
    private fun drainEncoder(
        encoder: MediaCodec,
        muxer: MediaMuxer?,
        bufferInfo: MediaCodec.BufferInfo,
        trackIndex: Int,
        muxerStarted: Boolean
    ): Pair<Int, Boolean> {
        var currentTrackIndex = trackIndex
        var currentMuxerStarted = muxerStarted
        
        while (true) {
            val outputBufferIndex = encoder.dequeueOutputBuffer(bufferInfo, 0)
            
            when {
                outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!currentMuxerStarted) {
                        val newFormat = encoder.outputFormat
                        currentTrackIndex = muxer?.addTrack(newFormat) ?: -1
                        muxer?.start()
                        currentMuxerStarted = true
                        Log.d(TAG, "Muxer started, track index: $currentTrackIndex")
                    }
                }
                outputBufferIndex >= 0 -> {
                    val outputBuffer = encoder.getOutputBuffer(outputBufferIndex)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                        bufferInfo.size = 0
                    }
                    
                    if (bufferInfo.size > 0 && currentMuxerStarted && outputBuffer != null) {
                        outputBuffer.position(bufferInfo.offset)
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                        muxer?.writeSampleData(currentTrackIndex, outputBuffer, bufferInfo)
                    }
                    
                    encoder.releaseOutputBuffer(outputBufferIndex, false)
                    
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        break
                    }
                }
                else -> break
            }
        }
        
        return Pair(currentTrackIndex, currentMuxerStarted)
    }
    
    /**
     * Convert ARGB bitmap to YUV420 and fill input buffer.
     * This is a simplified conversion - production code should use RenderScript or GPU.
     */
    private fun fillInputBuffer(buffer: ByteBuffer, bitmap: Bitmap, width: Int, height: Int) {
        buffer.clear()
        
        // Scale bitmap if needed
        val scaledBitmap = if (bitmap.width != width || bitmap.height != height) {
            Bitmap.createScaledBitmap(bitmap, width, height, true)
        } else {
            bitmap
        }
        
        val pixels = IntArray(width * height)
        scaledBitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        
        // Convert ARGB to YUV420 (I420 format: Y plane, then U plane, then V plane)
        val ySize = width * height
        val uvSize = ySize / 4
        
        val yPlane = ByteArray(ySize)
        val uPlane = ByteArray(uvSize)
        val vPlane = ByteArray(uvSize)
        
        var uvIndex = 0
        for (y in 0 until height) {
            for (x in 0 until width) {
                val pixel = pixels[y * width + x]
                val r = (pixel shr 16) and 0xFF
                val g = (pixel shr 8) and 0xFF
                val b = pixel and 0xFF
                
                // RGB to YUV conversion
                val yValue = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
                yPlane[y * width + x] = yValue.coerceIn(0, 255).toByte()
                
                // Subsample U and V (every 2x2 block)
                if (y % 2 == 0 && x % 2 == 0 && uvIndex < uvSize) {
                    val uValue = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                    val vValue = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                    uPlane[uvIndex] = uValue.coerceIn(0, 255).toByte()
                    vPlane[uvIndex] = vValue.coerceIn(0, 255).toByte()
                    uvIndex++
                }
            }
        }
        
        buffer.put(yPlane)
        buffer.put(uPlane)
        buffer.put(vPlane)
        
        if (scaledBitmap != bitmap) {
            scaledBitmap.recycle()
        }
    }
    
    /**
     * Save encoded video file to MediaStore.
     */
    private fun saveToMediaStore(file: File, fileNamePrefix: String): android.net.Uri? {
        val timestamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.getDefault())
            .format(java.util.Date())
        val fileName = "${fileNamePrefix}_$timestamp"
        
        val contentValues = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/LittleFencer")
        }
        
        return try {
            val uri = context.contentResolver.insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                contentValues
            )
            
            uri?.let { destUri ->
                context.contentResolver.openOutputStream(destUri)?.use { output ->
                    file.inputStream().use { input ->
                        input.copyTo(output)
                    }
                }
                Log.d(TAG, "Video saved to gallery: $destUri")
            }
            
            uri
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save to MediaStore", e)
            null
        }
    }
}
