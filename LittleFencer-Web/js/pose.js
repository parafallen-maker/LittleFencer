/**
 * Pose Detector
 * MediaPipe Pose wrapper for real-time pose detection
 * With iOS/Safari compatibility optimizations
 */

import { platform } from './platform.js';

export class PoseDetector {
    constructor() {
        this.pose = null;
        this.videoElement = null;
        this.isRunning = false;
        this.onResults = null;
        this.animationFrameId = null;
        this.lastProcessTime = 0;
        this.processingInterval = platform.getProcessingInterval();
        this.frameSkipCount = 0;
        this.maxFrameSkip = platform.isIOS ? 2 : 1; // Skip more frames on iOS
    }
    
    /**
     * Initialize pose detector
     */
    async init(onProgress) {
        console.log('[Pose] Initializing MediaPipe Pose...');
        console.log('[Pose] Platform:', platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Desktop');
        
        // Wait for MediaPipe to load
        if (typeof Pose === 'undefined') {
            throw new Error('MediaPipe Pose library not loaded');
        }
        
        // Create Pose instance
        this.pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        });
        
        // Get platform-optimized options
        const options = platform.getMediaPipeOptions();
        console.log('[Pose] Using options:', options);
        
        // Configure pose options
        this.pose.setOptions(options);
        
        // Set results callback
        this.pose.onResults((results) => {
            if (this.onResults) {
                this.onResults(results);
            }
        });
        
        // Initialize (download model)
        try {
            await this.pose.initialize();
        } catch (err) {
            console.error('[Pose] MediaPipe initialization error:', err);
            // On iOS, sometimes we need to retry
            if (platform.isIOS) {
                console.log('[Pose] Retrying initialization for iOS...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.pose.initialize();
            } else {
                throw err;
            }
        }
        
        if (onProgress) {
            onProgress(1.0);
        }
        
        console.log('[Pose] MediaPipe Pose initialized');
    }
    
    /**
     * Set video element for pose detection
     */
    setVideoElement(videoElement) {
        this.videoElement = videoElement;
    }
    
    /**
     * Start pose detection loop
     */
    start() {
        if (!this.videoElement) {
            throw new Error('Video element not set');
        }
        
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastProcessTime = 0;
        this.frameSkipCount = 0;
        this.processLoop();
        
        console.log('[Pose] Started');
    }
    
    /**
     * Processing loop using requestAnimationFrame
     * With throttling for iOS performance
     */
    async processLoop() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        const elapsed = now - this.lastProcessTime;
        
        // Throttle processing on iOS to maintain performance
        if (elapsed >= this.processingInterval && this.videoElement.readyState >= 2) {
            // Additional frame skipping for iOS
            this.frameSkipCount++;
            if (this.frameSkipCount >= this.maxFrameSkip) {
                this.frameSkipCount = 0;
                
                try {
                    await this.pose.send({ image: this.videoElement });
                    this.lastProcessTime = now;
                } catch (err) {
                    // iOS Safari can throw errors during pose processing
                    if (platform.isIOS && err.message?.includes('texture')) {
                        console.warn('[Pose] iOS texture error, skipping frame');
                    } else {
                        console.warn('[Pose] Frame processing error:', err);
                    }
                }
            }
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.processLoop());
    }
    
    /**
     * Stop pose detection
     */
    stop() {
        this.isRunning = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        console.log('[Pose] Stopped');
    }
    
    /**
     * Process single frame
     */
    async processFrame(imageElement) {
        if (!this.pose) return null;
        
        return new Promise((resolve) => {
            const originalCallback = this.onResults;
            this.onResults = (results) => {
                this.onResults = originalCallback;
                resolve(results);
            };
            this.pose.send({ image: imageElement });
        });
    }
}

/**
 * MediaPipe Landmark indices
 */
export const PoseLandmark = {
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_PINKY: 17,
    RIGHT_PINKY: 18,
    LEFT_INDEX: 19,
    RIGHT_INDEX: 20,
    LEFT_THUMB: 21,
    RIGHT_THUMB: 22,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31,
    RIGHT_FOOT_INDEX: 32
};
