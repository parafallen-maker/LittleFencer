package com.littlefencer.app.gallery

import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.provider.MediaStore
import android.util.Size
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.littlefencer.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

/**
 * VideoAdapter - RecyclerView adapter for displaying video grid.
 * Uses efficient thumbnail loading with caching.
 */
class VideoAdapter(
    private val onVideoClick: (VideoRepository.VideoItem) -> Unit,
    private val onVideoLongClick: (VideoRepository.VideoItem) -> Unit
) : ListAdapter<VideoRepository.VideoItem, VideoAdapter.VideoViewHolder>(VideoDiffCallback()) {

    // Simple in-memory thumbnail cache
    private val thumbnailCache = ConcurrentHashMap<Long, Bitmap>()
    private val loadingSet = ConcurrentHashMap.newKeySet<Long>()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VideoViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_video, parent, false)
        return VideoViewHolder(view)
    }

    override fun onBindViewHolder(holder: VideoViewHolder, position: Int) {
        val video = getItem(position)
        holder.bind(video)
    }

    inner class VideoViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val thumbnail: ImageView = itemView.findViewById(R.id.videoThumbnail)
        private val duration: TextView = itemView.findViewById(R.id.videoDuration)
        private val categoryBadge: ImageView = itemView.findViewById(R.id.categoryBadge)
        private val dateText: TextView = itemView.findViewById(R.id.videoDate)

        fun bind(video: VideoRepository.VideoItem) {
            // Set placeholder first
            thumbnail.setImageResource(R.drawable.ic_video_library)
            
            // Load thumbnail asynchronously with caching
            loadThumbnail(video)
            
            // Set duration text
            duration.text = video.getFormattedDuration()
            
            // Set date
            dateText.text = video.getRelativeDate()
            
            // Set category badge
            when (video.category) {
                VideoRepository.VideoCategory.PERFECT -> {
                    categoryBadge.visibility = View.VISIBLE
                    categoryBadge.setImageResource(R.drawable.ic_star)
                }
                else -> {
                    categoryBadge.visibility = View.GONE
                }
            }
            
            // Click listeners
            itemView.setOnClickListener { onVideoClick(video) }
            itemView.setOnLongClickListener {
                onVideoLongClick(video)
                true
            }
        }
        
        private fun loadThumbnail(video: VideoRepository.VideoItem) {
            // Check cache first
            thumbnailCache[video.id]?.let { cached ->
                thumbnail.setImageBitmap(cached)
                return
            }
            
            // Avoid duplicate loading
            if (!loadingSet.add(video.id)) return
            
            CoroutineScope(Dispatchers.Main).launch {
                val bitmap = withContext(Dispatchers.IO) {
                    try {
                        // Use ContentResolver to load thumbnail efficiently
                        itemView.context.contentResolver.loadThumbnail(
                            video.uri,
                            Size(256, 256),
                            null
                        )
                    } catch (e: Exception) {
                        null
                    }
                }
                
                loadingSet.remove(video.id)
                
                bitmap?.let {
                    thumbnailCache[video.id] = it
                    // Only update if still bound to same video
                    if (bindingAdapterPosition != RecyclerView.NO_POSITION &&
                        getItem(bindingAdapterPosition).id == video.id) {
                        thumbnail.setImageBitmap(it)
                    }
                }
            }
        }
    }

    /**
     * Clear thumbnail cache to free memory
     */
    fun clearCache() {
        thumbnailCache.values.forEach { it.recycle() }
        thumbnailCache.clear()
    }

    class VideoDiffCallback : DiffUtil.ItemCallback<VideoRepository.VideoItem>() {
        override fun areItemsTheSame(
            oldItem: VideoRepository.VideoItem,
            newItem: VideoRepository.VideoItem
        ): Boolean = oldItem.id == newItem.id

        override fun areContentsTheSame(
            oldItem: VideoRepository.VideoItem,
            newItem: VideoRepository.VideoItem
        ): Boolean = oldItem == newItem
    }
}
