/**
 * Video Storage Manager
 * IndexedDB-based storage for training videos
 */

const DB_NAME = 'LittleFencerDB';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

class VideoStorageManager {
    constructor() {
        this.db = null;
        this.isReady = false;
    }
    
    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('[Storage] Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('[Storage] IndexedDB initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create videos store
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('quality', 'quality', { unique: false });
                    store.createIndex('starred', 'starred', { unique: false });
                    console.log('[Storage] Created videos store');
                }
            };
        });
    }
    
    /**
     * Save a video
     */
    async saveVideo(videoData) {
        if (!this.isReady) await this.init();
        
        // Generate thumbnail if not provided and blob exists
        let thumbnail = videoData.thumbnail;
        if (!thumbnail && videoData.blob) {
            try {
                const thumbBlob = await this.generateThumbnail(videoData.blob);
                if (thumbBlob) {
                    thumbnail = URL.createObjectURL(thumbBlob);
                }
            } catch (e) {
                console.warn('[Storage] Could not generate thumbnail:', e);
            }
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const video = {
                id: videoData.id || Date.now(),
                blob: videoData.blob,
                thumbnail: thumbnail || null,
                duration: videoData.duration || 0,
                quality: videoData.quality || 'normal',
                starred: videoData.starred !== undefined ? videoData.starred : (videoData.quality === 'starred'),
                actionType: videoData.actionType || 'unknown',
                actionCount: videoData.actionCount || 0,
                perfectCount: videoData.perfectCount || 0,
                timestamp: videoData.timestamp || Date.now(),
                metadata: videoData.metadata || {}
            };
            
            const request = store.put(video);
            
            request.onsuccess = () => {
                console.log('[Storage] Video saved:', video.id);
                resolve(video);
            };
            
            request.onerror = () => {
                console.error('[Storage] Failed to save video:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Get all videos
     */
    async getAllVideos() {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('timestamp');
            
            const request = index.openCursor(null, 'prev'); // Newest first
            const videos = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    videos.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(videos);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Get videos by filter
     */
    async getVideos(filter = 'all') {
        const allVideos = await this.getAllVideos();
        
        switch (filter) {
            case 'starred':
                return allVideos.filter(v => v.starred || v.quality === 'starred');
            case 'normal':
                return allVideos.filter(v => !v.starred && v.quality !== 'starred');
            default:
                return allVideos;
        }
    }
    
    /**
     * Get a single video by ID
     */
    async getVideo(id) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Update video (e.g., toggle star)
     */
    async updateVideo(id, updates) {
        const video = await this.getVideo(id);
        if (!video) return null;
        
        const updatedVideo = { ...video, ...updates };
        return this.saveVideo(updatedVideo);
    }
    
    /**
     * Toggle star status
     */
    async toggleStar(id) {
        const video = await this.getVideo(id);
        if (!video) return null;
        
        video.starred = !video.starred;
        return this.saveVideo(video);
    }
    
    /**
     * Delete a video
     */
    async deleteVideo(id) {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log('[Storage] Video deleted:', id);
                resolve(true);
            };
            
            request.onerror = () => {
                console.error('[Storage] Failed to delete video:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Get video count
     */
    async getVideoCount() {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Get starred video count
     */
    async getStarredCount() {
        const videos = await this.getVideos('starred');
        return videos.length;
    }
    
    /**
     * Clear all videos
     */
    async clearAll() {
        if (!this.isReady) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('[Storage] All videos cleared');
                resolve(true);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Generate thumbnail from video blob
     */
    async generateThumbnail(blob) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            
            video.onloadeddata = () => {
                // Seek to 0.5 seconds or 10% of duration
                video.currentTime = Math.min(0.5, video.duration * 0.1);
            };
            
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((thumbnailBlob) => {
                    URL.revokeObjectURL(video.src);
                    resolve(thumbnailBlob);
                }, 'image/jpeg', 0.7);
            };
            
            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                resolve(null);
            };
            
            video.src = URL.createObjectURL(blob);
        });
    }
    
    /**
     * Export video for sharing
     */
    async exportForShare(id) {
        const video = await this.getVideo(id);
        if (!video || !video.blob) return null;
        
        // Create a File object for sharing
        const extension = video.blob.type.includes('mp4') ? 'mp4' : 'webm';
        const filename = `LittleFencer_${new Date(video.timestamp).toISOString().slice(0,10)}_${video.id}.${extension}`;
        
        const file = new File([video.blob], filename, { type: video.blob.type });
        
        return {
            file,
            filename,
            stats: {
                actionCount: video.actionCount || 0,
                perfectCount: video.perfectCount || 0,
                duration: video.duration || 0
            }
        };
    }
}

// Singleton instance
export const videoStorage = new VideoStorageManager();
