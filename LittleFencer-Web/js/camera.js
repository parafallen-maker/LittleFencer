/**
 * Camera Manager
 * Handles camera access and stream management
 * With iOS/Safari compatibility
 */

import { platform, setupVideoForIOS } from './platform.js';

export class CameraManager {
    constructor() {
        this.videoElement = null;
        this.stream = null;
        this.facingMode = 'user'; // 'user' for front, 'environment' for back
        this.isStarted = false;
    }
    
    /**
     * Initialize camera manager
     */
    async init() {
        this.videoElement = document.getElementById('video');
        
        if (!this.videoElement) {
            throw new Error('Video element not found');
        }
        
        // Apply iOS-specific video setup
        setupVideoForIOS(this.videoElement);
        
        // Check camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera not supported on this device');
        }
        
        console.log('[Camera] Initialized for', platform.isIOS ? 'iOS' : 'standard platform');
    }
    
    /**
     * Start camera stream
     */
    async start() {
        if (this.isStarted) return;
        
        try {
            // Get platform-optimized constraints
            const baseConstraints = platform.getCameraConstraints();
            const constraints = {
                ...baseConstraints,
                video: {
                    ...baseConstraints.video,
                    facingMode: this.facingMode
                }
            };
            
            console.log('[Camera] Requesting with constraints:', constraints);
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Video load timeout'));
                }, 10000);
                
                this.videoElement.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    
                    // iOS requires explicit play call
                    const playPromise = this.videoElement.play();
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => resolve())
                            .catch(err => {
                                // iOS may block autoplay
                                console.warn('[Camera] Autoplay blocked:', err);
                                resolve(); // Still resolve, user can tap to play
                            });
                    } else {
                        resolve();
                    }
                };
                
                this.videoElement.onerror = (err) => {
                    clearTimeout(timeout);
                    reject(err);
                };
            });
            
            // iOS Safari needs a moment to stabilize
            if (platform.isIOS) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            this.isStarted = true;
            console.log('[Camera] Started successfully');
            
        } catch (error) {
            console.error('[Camera] Failed to start:', error);
            
            // Provide more helpful error messages
            if (error.name === 'NotAllowedError') {
                throw new Error('请允许访问摄像头权限');
            } else if (error.name === 'NotFoundError') {
                throw new Error('找不到摄像头设备');
            } else if (error.name === 'NotReadableError') {
                throw new Error('摄像头被其他应用占用');
            } else if (platform.isIOS && error.name === 'OverconstrainedError') {
                // iOS may not support some constraints, try with basic ones
                console.log('[Camera] Retrying with basic constraints for iOS...');
                return this.startWithBasicConstraints();
            }
            
            throw new Error(`无法访问摄像头: ${error.message}`);
        }
    }
    
    /**
     * Fallback for iOS with basic constraints
     */
    async startWithBasicConstraints() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode },
                audio: false
            });
            
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();
            
            this.isStarted = true;
            console.log('[Camera] Started with basic constraints');
            
        } catch (error) {
            throw new Error(`无法访问摄像头: ${error.message}`);
        }
    }
    
    /**
     * Stop camera stream
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        
        this.isStarted = false;
        console.log('[Camera] Stopped');
    }
    
    /**
     * Flip camera (front/back)
     */
    async flip() {
        // Stop current stream
        this.stop();
        
        // Toggle facing mode
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        
        // Update video transform for mirroring
        if (this.facingMode === 'user') {
            this.videoElement.style.transform = 'scaleX(-1)';
        } else {
            this.videoElement.style.transform = 'scaleX(1)';
        }
        
        // Restart with new facing mode
        await this.start();
        
        console.log('[Camera] Flipped to:', this.facingMode);
    }
    
    /**
     * Get current stream
     */
    getStream() {
        return this.stream;
    }
    
    /**
     * Get video dimensions
     */
    getDimensions() {
        return {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
    }
    
    /**
     * Check if camera is available
     */
    static async isAvailable() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(device => device.kind === 'videoinput');
        } catch {
            return false;
        }
    }
}
