package com.littlefencer.app.gallery

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.tabs.TabLayout
import com.littlefencer.app.R
import kotlinx.coroutines.launch

/**
 * GalleryActivity - Displays saved training videos with category filtering.
 * 
 * Features:
 * - Tab filtering: All / Perfect (⭐) / Practice (📝)
 * - Grid display with thumbnails
 * - Click to play, long-press for options (share/delete)
 */
class GalleryActivity : AppCompatActivity() {

    private lateinit var toolbar: Toolbar
    private lateinit var tabLayout: TabLayout
    private lateinit var recyclerView: RecyclerView
    private lateinit var emptyState: LinearLayout
    private lateinit var emptyText: TextView
    private lateinit var loadingIndicator: ProgressBar

    private lateinit var videoRepository: VideoRepository
    private lateinit var videoAdapter: VideoAdapter

    private var currentCategory = VideoRepository.VideoCategory.ALL
    
    // Permission launcher for Android 13+
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            loadVideos()
        } else {
            Toast.makeText(this, "需要媒体权限才能查看视频", Toast.LENGTH_LONG).show()
            showEmptyState()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_gallery)

        initViews()
        setupToolbar()
        setupTabs()
        setupRecyclerView()
        
        videoRepository = VideoRepository(this)
        
        // Check permission before loading
        checkPermissionAndLoad()
    }
    
    private fun checkPermissionAndLoad() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ requires READ_MEDIA_VIDEO
            when {
                ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) 
                    == PackageManager.PERMISSION_GRANTED -> {
                    loadVideos()
                }
                shouldShowRequestPermissionRationale(Manifest.permission.READ_MEDIA_VIDEO) -> {
                    // Show explanation dialog
                    AlertDialog.Builder(this, R.style.Theme_LittleFencer_Dialog)
                        .setTitle("需要媒体权限")
                        .setMessage("查看训练视频需要访问设备上的视频文件")
                        .setPositiveButton("授权") { _, _ ->
                            permissionLauncher.launch(Manifest.permission.READ_MEDIA_VIDEO)
                        }
                        .setNegativeButton("取消") { _, _ ->
                            showEmptyState()
                        }
                        .show()
                }
                else -> {
                    permissionLauncher.launch(Manifest.permission.READ_MEDIA_VIDEO)
                }
            }
        } else {
            // Android 12 and below - permission granted at install time via manifest
            loadVideos()
        }
    }

    private fun initViews() {
        toolbar = findViewById(R.id.toolbar)
        tabLayout = findViewById(R.id.tabLayout)
        recyclerView = findViewById(R.id.videoRecyclerView)
        emptyState = findViewById(R.id.emptyState)
        emptyText = findViewById(R.id.emptyText)
        loadingIndicator = findViewById(R.id.loadingIndicator)
    }

    private fun setupToolbar() {
        setSupportActionBar(toolbar)
        toolbar.setNavigationOnClickListener { finish() }
    }

    private fun setupTabs() {
        // Add tabs with counts (will be updated after loading)
        tabLayout.addTab(tabLayout.newTab().setText("全部"))
        tabLayout.addTab(tabLayout.newTab().setText("⭐ 精彩"))
        tabLayout.addTab(tabLayout.newTab().setText("📝 待改进"))

        tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab?) {
                currentCategory = when (tab?.position) {
                    1 -> VideoRepository.VideoCategory.PERFECT
                    2 -> VideoRepository.VideoCategory.PRACTICE
                    else -> VideoRepository.VideoCategory.ALL
                }
                loadVideos()
            }

            override fun onTabUnselected(tab: TabLayout.Tab?) {}
            override fun onTabReselected(tab: TabLayout.Tab?) {}
        })
    }

    private fun setupRecyclerView() {
        videoAdapter = VideoAdapter(
            onVideoClick = { video -> playVideo(video) },
            onVideoLongClick = { video -> showVideoOptions(video) }
        )

        recyclerView.apply {
            layoutManager = GridLayoutManager(this@GalleryActivity, 2)
            adapter = videoAdapter
        }
    }

    private fun loadVideos() {
        loadingIndicator.visibility = View.VISIBLE
        recyclerView.visibility = View.GONE
        emptyState.visibility = View.GONE

        lifecycleScope.launch {
            try {
                // Load videos
                val videos = videoRepository.getVideos(currentCategory)
                
                // Update tab counts
                val counts = videoRepository.getVideoCounts()
                updateTabCounts(counts)

                // Update UI
                loadingIndicator.visibility = View.GONE
                
                if (videos.isEmpty()) {
                    showEmptyState()
                } else {
                    recyclerView.visibility = View.VISIBLE
                    videoAdapter.submitList(videos)
                }
            } catch (e: Exception) {
                loadingIndicator.visibility = View.GONE
                Toast.makeText(this@GalleryActivity, "加载视频失败", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateTabCounts(counts: Map<VideoRepository.VideoCategory, Int>) {
        val allCount = counts[VideoRepository.VideoCategory.ALL] ?: 0
        val perfectCount = counts[VideoRepository.VideoCategory.PERFECT] ?: 0
        val practiceCount = counts[VideoRepository.VideoCategory.PRACTICE] ?: 0

        tabLayout.getTabAt(0)?.text = "全部 ($allCount)"
        tabLayout.getTabAt(1)?.text = "⭐ 精彩 ($perfectCount)"
        tabLayout.getTabAt(2)?.text = "📝 待改进 ($practiceCount)"
    }

    private fun showEmptyState() {
        emptyState.visibility = View.VISIBLE
        recyclerView.visibility = View.GONE
        
        emptyText.text = when (currentCategory) {
            VideoRepository.VideoCategory.PERFECT -> "还没有精彩动作"
            VideoRepository.VideoCategory.PRACTICE -> "还没有待改进的动作"
            else -> "还没有训练视频"
        }
    }

    private fun playVideo(video: VideoRepository.VideoItem) {
        // Open video with system player
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(video.uri, "video/mp4")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "无法播放视频", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showVideoOptions(video: VideoRepository.VideoItem) {
        val options = arrayOf("分享", "删除")
        
        AlertDialog.Builder(this, R.style.Theme_LittleFencer_Dialog)
            .setTitle(video.displayName)
            .setItems(options) { _, which ->
                when (which) {
                    0 -> shareVideo(video)
                    1 -> confirmDelete(video)
                }
            }
            .show()
    }

    private fun shareVideo(video: VideoRepository.VideoItem) {
        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_STREAM, video.uri)
            type = "video/mp4"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_SUBJECT, "看看我的击剑训练! ⚔️")
            putExtra(Intent.EXTRA_TEXT, "来自 LittleFencer 的训练记录 🤺")
        }
        
        startActivity(Intent.createChooser(shareIntent, "分享视频"))
    }

    private fun confirmDelete(video: VideoRepository.VideoItem) {
        AlertDialog.Builder(this, R.style.Theme_LittleFencer_Dialog)
            .setTitle("删除视频")
            .setMessage("确定要删除这个训练视频吗？")
            .setPositiveButton("删除") { _, _ -> deleteVideo(video) }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun deleteVideo(video: VideoRepository.VideoItem) {
        lifecycleScope.launch {
            val success = videoRepository.deleteVideo(video.uri)
            if (success) {
                Toast.makeText(this@GalleryActivity, "已删除", Toast.LENGTH_SHORT).show()
                loadVideos()
            } else {
                Toast.makeText(this@GalleryActivity, "删除失败", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresh when returning from video player (only if permission granted)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) 
                == PackageManager.PERMISSION_GRANTED) {
            loadVideos()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Clear thumbnail cache to free memory
        if (::videoAdapter.isInitialized) {
            videoAdapter.clearCache()
        }
    }
}
