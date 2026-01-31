import SwiftUI
import Photos

/// Video gallery view with category tabs
struct GalleryView: View {
    @Binding var isPresented: Bool
    @StateObject private var viewModel = GalleryViewModel()
    @State private var selectedCategory: VideoCategory = .all
    @State private var selectedVideo: VideoItem?
    @State private var showDeleteConfirmation = false
    @State private var videoToDelete: VideoItem?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Category Tabs
                CategoryTabsView(
                    selectedCategory: $selectedCategory,
                    counts: viewModel.categoryCounts
                )
                .onChange(of: selectedCategory) { _ in
                    viewModel.loadVideos(category: selectedCategory)
                }
                
                // Content
                ZStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .scaleEffect(1.5)
                    } else if viewModel.videos.isEmpty {
                        EmptyStateView(category: selectedCategory)
                    } else {
                        VideoGridView(
                            videos: viewModel.videos,
                            onVideoTap: { video in
                                playVideo(video)
                            },
                            onVideoLongPress: { video in
                                selectedVideo = video
                            }
                        )
                    }
                }
            }
            .navigationTitle("我的训练视频")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { isPresented = false }) {
                        Image(systemName: "chevron.left")
                            .foregroundColor(.white)
                    }
                }
            }
            .background(Color(hex: "121212"))
        }
        .preferredColorScheme(.dark)
        .onAppear {
            viewModel.loadVideos(category: selectedCategory)
        }
        .actionSheet(item: $selectedVideo) { video in
            ActionSheet(
                title: Text(video.displayName),
                buttons: [
                    .default(Text("分享")) { shareVideo(video) },
                    .destructive(Text("删除")) {
                        videoToDelete = video
                        showDeleteConfirmation = true
                    },
                    .cancel()
                ]
            )
        }
        .alert("删除视频", isPresented: $showDeleteConfirmation) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) {
                if let video = videoToDelete {
                    viewModel.deleteVideo(video)
                }
            }
        } message: {
            Text("确定要删除这个训练视频吗？")
        }
    }
    
    private func playVideo(_ video: VideoItem) {
        // Open video with system player
        if let url = video.url {
            UIApplication.shared.open(url)
        }
    }
    
    private func shareVideo(_ video: VideoItem) {
        guard let url = video.url else { return }
        
        let activityVC = UIActivityViewController(
            activityItems: [url, "看看我的击剑训练! ⚔️ 来自 LittleFencer 🤺"],
            applicationActivities: nil
        )
        
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            rootVC.present(activityVC, animated: true)
        }
    }
}

// MARK: - Supporting Views

struct CategoryTabsView: View {
    @Binding var selectedCategory: VideoCategory
    let counts: [VideoCategory: Int]
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach([VideoCategory.all, .perfect, .practice], id: \.self) { category in
                TabButton(
                    title: category.displayName,
                    count: counts[category] ?? 0,
                    isSelected: selectedCategory == category
                ) {
                    selectedCategory = category
                }
            }
        }
        .background(Color(hex: "1E1E1E"))
    }
}

struct TabButton: View {
    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Text("\(title) (\(count))")
                    .font(.subheadline)
                    .foregroundColor(isSelected ? .white : .gray)
                
                Rectangle()
                    .fill(isSelected ? Color.green : Color.clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
        }
    }
}

struct VideoGridView: View {
    let videos: [VideoItem]
    let onVideoTap: (VideoItem) -> Void
    let onVideoLongPress: (VideoItem) -> Void
    
    let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]
    
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(videos) { video in
                    VideoThumbnailView(video: video)
                        .onTapGesture {
                            onVideoTap(video)
                        }
                        .onLongPressGesture {
                            onVideoLongPress(video)
                        }
                }
            }
            .padding(8)
        }
    }
}

struct VideoThumbnailView: View {
    let video: VideoItem
    @State private var thumbnail: UIImage?
    
    var body: some View {
        ZStack {
            // Thumbnail
            if let thumbnail = thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .aspectRatio(16/9, contentMode: .fill)
                    .clipped()
            } else {
                Color(hex: "2A2A2A")
                    .aspectRatio(16/9, contentMode: .fill)
                    .overlay(
                        Image(systemName: "film")
                            .foregroundColor(.gray)
                            .font(.largeTitle)
                    )
            }
            
            // Overlay
            VStack {
                HStack {
                    // Category badge
                    if video.category == .perfect {
                        Image(systemName: "star.fill")
                            .foregroundColor(Color(hex: "FFD700"))
                            .padding(6)
                            .background(Color.black.opacity(0.6))
                            .clipShape(Circle())
                    }
                    Spacer()
                }
                
                Spacer()
                
                HStack {
                    // Date
                    Text(video.relativeDate)
                        .font(.caption2)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    // Duration
                    Text(video.formattedDuration)
                        .font(.caption2)
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.black.opacity(0.7))
                        .cornerRadius(4)
                }
            }
            .padding(8)
            
            // Play button
            Image(systemName: "play.circle.fill")
                .font(.system(size: 44))
                .foregroundColor(.white.opacity(0.8))
        }
        .cornerRadius(8)
        .onAppear {
            loadThumbnail()
        }
    }
    
    private func loadThumbnail() {
        video.generateThumbnail { image in
            self.thumbnail = image
        }
    }
}

struct EmptyStateView: View {
    let category: VideoCategory
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "film.stack")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text(emptyMessage)
                .foregroundColor(.gray)
            
            Text("开始训练后，精彩动作会自动保存在这里")
                .font(.caption)
                .foregroundColor(.gray.opacity(0.6))
        }
    }
    
    private var emptyMessage: String {
        switch category {
        case .all: return "还没有训练视频"
        case .perfect: return "还没有精彩动作"
        case .practice: return "还没有待改进的动作"
        }
    }
}

// MARK: - ViewModel

class GalleryViewModel: ObservableObject {
    @Published var videos: [VideoItem] = []
    @Published var categoryCounts: [VideoCategory: Int] = [.all: 0, .perfect: 0, .practice: 0]
    @Published var isLoading = false
    
    private let repository = VideoRepository()
    
    func loadVideos(category: VideoCategory) {
        isLoading = true
        
        repository.fetchVideos(category: category) { [weak self] videos in
            DispatchQueue.main.async {
                self?.videos = videos
                self?.isLoading = false
            }
        }
        
        repository.fetchCategoryCounts { [weak self] counts in
            DispatchQueue.main.async {
                self?.categoryCounts = counts
            }
        }
    }
    
    func deleteVideo(_ video: VideoItem) {
        repository.deleteVideo(video) { [weak self] success in
            if success {
                DispatchQueue.main.async {
                    self?.videos.removeAll { $0.id == video.id }
                    // Refresh counts
                    self?.repository.fetchCategoryCounts { counts in
                        DispatchQueue.main.async {
                            self?.categoryCounts = counts
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    GalleryView(isPresented: .constant(true))
}
