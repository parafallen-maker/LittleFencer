import Photos
import UIKit

/// Video item model
struct VideoItem: Identifiable {
    let id: String
    let asset: PHAsset
    let displayName: String
    let duration: TimeInterval
    let creationDate: Date
    let category: VideoCategory
    
    var url: URL? {
        // For playing, iOS handles this via PHAsset
        nil
    }
    
    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    var relativeDate: String {
        let now = Date()
        let diff = now.timeIntervalSince(creationDate)
        
        switch diff {
        case ..<60:
            return "刚刚"
        case ..<3600:
            return "\(Int(diff / 60)) 分钟前"
        case ..<86400:
            return "\(Int(diff / 3600)) 小时前"
        case ..<604800:
            return "\(Int(diff / 86400)) 天前"
        default:
            let formatter = DateFormatter()
            formatter.dateFormat = "MM-dd"
            return formatter.string(from: creationDate)
        }
    }
    
    /// Generate thumbnail asynchronously
    func generateThumbnail(completion: @escaping (UIImage?) -> Void) {
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = true
        
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: 256, height: 256),
            contentMode: .aspectFill,
            options: options
        ) { image, _ in
            DispatchQueue.main.async {
                completion(image)
            }
        }
    }
}

/// Repository for fetching videos from Photos library
class VideoRepository {
    
    private let albumName = "LittleFencer"
    
    /// Fetch videos filtered by category
    func fetchVideos(category: VideoCategory, completion: @escaping ([VideoItem]) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            guard status == .authorized || status == .limited else {
                completion([])
                return
            }
            
            DispatchQueue.global(qos: .userInitiated).async {
                let videos = self.queryVideos(category: category)
                DispatchQueue.main.async {
                    completion(videos)
                }
            }
        }
    }
    
    private func queryVideos(category: VideoCategory) -> [VideoItem] {
        let fetchOptions = PHFetchOptions()
        fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        fetchOptions.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue)
        
        let fetchResult = PHAsset.fetchAssets(with: fetchOptions)
        
        var videos: [VideoItem] = []
        
        fetchResult.enumerateObjects { asset, _, _ in
            // Get filename from asset resources
            let resources = PHAssetResource.assetResources(for: asset)
            guard let filename = resources.first?.originalFilename else { return }
            
            // Filter by LittleFencer prefix
            guard filename.hasPrefix("LittleFencer_") else { return }
            
            // Determine category from filename
            let videoCategory: VideoCategory
            if filename.contains("Perfect_") {
                videoCategory = .perfect
            } else if filename.contains("Practice_") {
                videoCategory = .practice
            } else {
                videoCategory = .practice
            }
            
            // Apply category filter
            if category != .all && category != videoCategory {
                return
            }
            
            let item = VideoItem(
                id: asset.localIdentifier,
                asset: asset,
                displayName: filename,
                duration: asset.duration,
                creationDate: asset.creationDate ?? Date(),
                category: videoCategory
            )
            
            videos.append(item)
        }
        
        return videos
    }
    
    /// Fetch category counts
    func fetchCategoryCounts(completion: @escaping ([VideoCategory: Int]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let allVideos = self.queryVideos(category: .all)
            
            let counts: [VideoCategory: Int] = [
                .all: allVideos.count,
                .perfect: allVideos.filter { $0.category == .perfect }.count,
                .practice: allVideos.filter { $0.category == .practice }.count
            ]
            
            DispatchQueue.main.async {
                completion(counts)
            }
        }
    }
    
    /// Delete a video
    func deleteVideo(_ video: VideoItem, completion: @escaping (Bool) -> Void) {
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.deleteAssets([video.asset] as NSFastEnumeration)
        } completionHandler: { success, error in
            if let error = error {
                print("Delete error: \(error.localizedDescription)")
            }
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }
}
