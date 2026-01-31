package com.littlefencer.app.recorder

import android.graphics.Bitmap
import android.util.Log
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * FrameRingBuffer - Circular buffer for storing recent video frames.
 * 
 * P1 Enhancement: Enables "dashcam mode" pre-padding.
 * - Continuously stores the last N seconds of frames
 * - When action is detected, prepend buffered frames to the recording
 * - Provides seamless capture of action lead-up
 * 
 * Thread-safe implementation for concurrent camera frame input and video encoding output.
 */
class FrameRingBuffer(
    private val maxFrames: Int = DEFAULT_BUFFER_SIZE,
    private val targetFps: Int = DEFAULT_FPS
) {
    
    /**
     * Frame data with timestamp for proper video timing.
     */
    data class TimestampedFrame(
        val bitmap: Bitmap,
        val timestampMs: Long
    )
    
    private val buffer = ArrayDeque<TimestampedFrame>(maxFrames)
    private val lock = ReentrantLock()
    
    // Statistics
    private var totalFramesAdded = 0L
    private var totalFramesDropped = 0L
    
    companion object {
        private const val TAG = "FrameRingBuffer"
        
        // Default: 3 seconds at 30fps = 90 frames
        const val DEFAULT_BUFFER_SIZE = 90
        const val DEFAULT_FPS = 30
        
        // Memory management: Max bitmap size (720p)
        const val MAX_FRAME_WIDTH = 1280
        const val MAX_FRAME_HEIGHT = 720
    }
    
    /**
     * Add a new frame to the buffer.
     * If buffer is full, the oldest frame is removed and recycled.
     * 
     * @param bitmap The frame bitmap (will be copied, caller can recycle original)
     * @param timestampMs Frame timestamp in milliseconds
     */
    fun addFrame(bitmap: Bitmap, timestampMs: Long) {
        lock.withLock {
            // Scale down if necessary to save memory
            val scaledBitmap = if (bitmap.width > MAX_FRAME_WIDTH || bitmap.height > MAX_FRAME_HEIGHT) {
                val scale = minOf(
                    MAX_FRAME_WIDTH.toFloat() / bitmap.width,
                    MAX_FRAME_HEIGHT.toFloat() / bitmap.height
                )
                val newWidth = (bitmap.width * scale).toInt()
                val newHeight = (bitmap.height * scale).toInt()
                Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
            } else {
                // Make a copy so caller can safely recycle original
                bitmap.copy(bitmap.config ?: Bitmap.Config.ARGB_8888, false)
            }
            
            // Remove oldest frame if buffer is full
            if (buffer.size >= maxFrames) {
                val oldFrame = buffer.removeFirst()
                oldFrame.bitmap.recycle()
                totalFramesDropped++
            }
            
            buffer.addLast(TimestampedFrame(scaledBitmap, timestampMs))
            totalFramesAdded++
            
            if (totalFramesAdded % 100 == 0L) {
                Log.v(TAG, "Buffer: ${buffer.size}/$maxFrames frames, dropped: $totalFramesDropped")
            }
        }
    }
    
    /**
     * Get all buffered frames and clear the buffer.
     * Frames are returned in chronological order (oldest first).
     * 
     * @return List of timestamped frames. Caller is responsible for recycling bitmaps.
     */
    fun drainFrames(): List<TimestampedFrame> {
        lock.withLock {
            val frames = buffer.toList()
            buffer.clear()
            Log.d(TAG, "Drained ${frames.size} frames from buffer")
            return frames
        }
    }
    
    /**
     * Get a copy of buffered frames without clearing.
     * 
     * @return List of timestamped frames. Bitmaps are copies, caller must recycle.
     */
    fun peekFrames(): List<TimestampedFrame> {
        lock.withLock {
            return buffer.map { frame ->
                TimestampedFrame(
                    bitmap = frame.bitmap.copy(frame.bitmap.config ?: Bitmap.Config.ARGB_8888, false),
                    timestampMs = frame.timestampMs
                )
            }
        }
    }
    
    /**
     * Get the current number of frames in buffer.
     */
    fun size(): Int = lock.withLock { buffer.size }
    
    /**
     * Check if buffer is empty.
     */
    fun isEmpty(): Boolean = lock.withLock { buffer.isEmpty() }
    
    /**
     * Get the duration of buffered content in milliseconds.
     */
    fun getBufferedDurationMs(): Long {
        lock.withLock {
            if (buffer.size < 2) return 0
            return buffer.last().timestampMs - buffer.first().timestampMs
        }
    }
    
    /**
     * Clear the buffer and recycle all bitmaps.
     */
    fun clear() {
        lock.withLock {
            buffer.forEach { it.bitmap.recycle() }
            buffer.clear()
            Log.d(TAG, "Buffer cleared")
        }
    }
    
    /**
     * Release all resources.
     */
    fun release() {
        clear()
        Log.d(TAG, "Buffer released. Total frames: $totalFramesAdded, dropped: $totalFramesDropped")
    }
    
    /**
     * Get buffer statistics for debugging.
     */
    fun getStats(): BufferStats {
        lock.withLock {
            return BufferStats(
                currentSize = buffer.size,
                maxSize = maxFrames,
                totalAdded = totalFramesAdded,
                totalDropped = totalFramesDropped,
                bufferedDurationMs = getBufferedDurationMs()
            )
        }
    }
    
    data class BufferStats(
        val currentSize: Int,
        val maxSize: Int,
        val totalAdded: Long,
        val totalDropped: Long,
        val bufferedDurationMs: Long
    )
}
