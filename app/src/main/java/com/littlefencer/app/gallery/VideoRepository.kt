package com.littlefencer.app.gallery

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * VideoRepository - Queries LittleFencer videos from MediaStore.
 * 
 * Supports filtering by category based on filename prefix:
 * - Perfect_: Good form videos (⭐ 精彩集锦)
 * - Practice_: Videos with form issues (📝 待改进)
 */
class VideoRepository(private val context: Context) {

    /**
     * Video category for filtering
     */
    enum class VideoCategory {
        ALL,        // All videos
        PERFECT,    // Good form (filename contains "Perfect_")
        PRACTICE    // Needs improvement (filename contains "Practice_")
    }

    /**
     * Video item data class
     */
    data class VideoItem(
        val id: Long,
        val uri: Uri,
        val displayName: String,
        val duration: Long,      // Duration in milliseconds
        val size: Long,          // File size in bytes
        val dateAdded: Long,     // Unix timestamp
        val category: VideoCategory
    ) {
        /**
         * Get formatted duration string (mm:ss)
         */
        fun getFormattedDuration(): String {
            val seconds = (duration / 1000) % 60
            val minutes = (duration / 1000) / 60
            return String.format("%d:%02d", minutes, seconds)
        }

        /**
         * Get formatted file size
         */
        fun getFormattedSize(): String {
            return when {
                size < 1024 -> "$size B"
                size < 1024 * 1024 -> "${size / 1024} KB"
                else -> String.format("%.1f MB", size / (1024.0 * 1024.0))
            }
        }

        /**
         * Get relative date string
         */
        fun getRelativeDate(): String {
            val now = System.currentTimeMillis()
            val diff = now - (dateAdded * 1000)
            return when {
                diff < 60 * 1000 -> "刚刚"
                diff < 60 * 60 * 1000 -> "${diff / (60 * 1000)} 分钟前"
                diff < 24 * 60 * 60 * 1000 -> "${diff / (60 * 60 * 1000)} 小时前"
                diff < 7 * 24 * 60 * 60 * 1000 -> "${diff / (24 * 60 * 60 * 1000)} 天前"
                else -> {
                    val sdf = java.text.SimpleDateFormat("MM-dd", java.util.Locale.getDefault())
                    sdf.format(java.util.Date(dateAdded * 1000))
                }
            }
        }
    }

    /**
     * Query all LittleFencer videos from MediaStore.
     * 
     * @param category Filter by category, or ALL for all videos
     * @return List of VideoItem sorted by date (newest first)
     */
    suspend fun getVideos(category: VideoCategory = VideoCategory.ALL): List<VideoItem> = 
        withContext(Dispatchers.IO) {
            val videos = mutableListOf<VideoItem>()
            
            val projection = arrayOf(
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.DURATION,
                MediaStore.Video.Media.SIZE,
                MediaStore.Video.Media.DATE_ADDED
            )
            
            // Filter by LittleFencer folder
            val selection = "${MediaStore.Video.Media.RELATIVE_PATH} LIKE ?"
            val selectionArgs = arrayOf("%${Environment.DIRECTORY_DCIM}/LittleFencer%")
            
            val sortOrder = "${MediaStore.Video.Media.DATE_ADDED} DESC"
            
            val cursor: Cursor? = context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )
            
            cursor?.use {
                val idColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val durationColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val sizeColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val dateColumn = it.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
                
                while (it.moveToNext()) {
                    val id = it.getLong(idColumn)
                    val name = it.getString(nameColumn)
                    val duration = it.getLong(durationColumn)
                    val size = it.getLong(sizeColumn)
                    val dateAdded = it.getLong(dateColumn)
                    
                    val uri = Uri.withAppendedPath(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        id.toString()
                    )
                    
                    // Determine category from filename
                    val videoCategory = when {
                        name.contains("Perfect_", ignoreCase = true) -> VideoCategory.PERFECT
                        name.contains("Practice_", ignoreCase = true) -> VideoCategory.PRACTICE
                        else -> VideoCategory.PRACTICE  // Default old videos to Practice
                    }
                    
                    // Apply category filter
                    if (category == VideoCategory.ALL || category == videoCategory) {
                        videos.add(VideoItem(
                            id = id,
                            uri = uri,
                            displayName = name,
                            duration = duration,
                            size = size,
                            dateAdded = dateAdded,
                            category = videoCategory
                        ))
                    }
                }
            }
            
            videos
        }

    /**
     * Get video counts by category.
     */
    suspend fun getVideoCounts(): Map<VideoCategory, Int> = withContext(Dispatchers.IO) {
        val allVideos = getVideos(VideoCategory.ALL)
        mapOf(
            VideoCategory.ALL to allVideos.size,
            VideoCategory.PERFECT to allVideos.count { it.category == VideoCategory.PERFECT },
            VideoCategory.PRACTICE to allVideos.count { it.category == VideoCategory.PRACTICE }
        )
    }

    /**
     * Delete a video from MediaStore.
     * 
     * @param uri Video URI to delete
     * @return true if deletion was successful
     */
    suspend fun deleteVideo(uri: Uri): Boolean = withContext(Dispatchers.IO) {
        try {
            val rowsDeleted = context.contentResolver.delete(uri, null, null)
            rowsDeleted > 0
        } catch (e: Exception) {
            false
        }
    }
}
