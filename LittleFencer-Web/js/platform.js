/**
 * Platform Detection & Compatibility
 * Handles iOS/Safari specific optimizations
 */

class PlatformDetector {
    constructor() {
        this.userAgent = navigator.userAgent || '';
        this.platform = navigator.platform || '';
        this.vendor = navigator.vendor || '';

        // Detect platform
        this._detectPlatform();
    }

    _detectPlatform() {
        // iOS detection
        this.isIOS = /iPad|iPhone|iPod/.test(this.userAgent) ||
            (this.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Safari detection
        this.isSafari = /^((?!chrome|android).)*safari/i.test(this.userAgent) ||
            (this.vendor.includes('Apple') && !this.userAgent.includes('CriOS'));

        // Chrome on iOS
        this.isIOSChrome = this.isIOS && /CriOS/.test(this.userAgent);

        // Android detection
        this.isAndroid = /Android/.test(this.userAgent);

        // Mobile detection
        this.isMobile = this.isIOS || this.isAndroid || /Mobile/.test(this.userAgent);

        // PWA mode detection
        this.isPWA = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;

        // WebGL support check
        this.hasWebGL = this._checkWebGL();

        // WebGL2 support (better for MediaPipe)
        this.hasWebGL2 = this._checkWebGL2();

        console.log('[Platform] Detected:', {
            isIOS: this.isIOS,
            isSafari: this.isSafari,
            isAndroid: this.isAndroid,
            isMobile: this.isMobile,
            isPWA: this.isPWA,
            hasWebGL: this.hasWebGL,
            hasWebGL2: this.hasWebGL2
        });
    }

    _checkWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    _checkWebGL2() {
        try {
            const canvas = document.createElement('canvas');
            return !!canvas.getContext('webgl2');
        } catch (e) {
            return false;
        }
    }

    /**
     * Get optimized camera constraints for platform
     */
    getCameraConstraints() {
        const base = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        if (this.isIOS) {
            // iOS Safari requires specific constraints
            return {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: false
            };
        }

        return base;
    }

    /**
     * Get optimized MediaPipe settings for platform
     */
    getMediaPipeOptions() {
        // Optimized for accuracy (use heavier model + higher confidence)
        const base = {
            modelComplexity: 2,  // Heavy model for best accuracy (0=lite, 1=full, 2=heavy)
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.7,  // Higher threshold for quality
            minTrackingConfidence: 0.7
        };

        if (this.isIOS || !this.hasWebGL2) {
            // Use full model on iOS (compromise between speed and accuracy)
            return {
                ...base,
                modelComplexity: 1,  // Full model (not lite)
                smoothLandmarks: true,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7
            };
        }

        return base;
    }

    /**
     * Check if platform needs fallback pose detection
     */
    needsFallback() {
        // iOS Safari without WebGL2 may have issues
        return this.isIOS && this.isSafari && !this.hasWebGL2;
    }

    /**
     * Get recommended frame processing interval
     */
    getProcessingInterval() {
        if (this.isIOS) {
            return 50; // ~20 FPS for iOS to reduce load
        }
        return 33; // ~30 FPS for other platforms
    }

    /**
     * Check if can install PWA
     */
    canInstallPWA() {
        // iOS doesn't support beforeinstallprompt
        if (this.isIOS) {
            return false;
        }
        return 'BeforeInstallPromptEvent' in window || 'onbeforeinstallprompt' in window;
    }

    /**
     * Get install instructions for platform
     */
    getInstallInstructions() {
        if (this.isIOS) {
            return {
                title: '添加到主屏幕',
                steps: [
                    '点击底部的分享按钮 ⬆️',
                    '滑动找到"添加到主屏幕"',
                    '点击"添加"确认'
                ],
                icon: '📲'
            };
        }

        return {
            title: '安装应用',
            steps: [
                '点击浏览器地址栏的安装图标',
                '或点击菜单中的"安装应用"'
            ],
            icon: '⬇️'
        };
    }
}

// Singleton instance
export const platform = new PlatformDetector();

/**
 * iOS Safari specific video element setup
 */
export function setupVideoForIOS(videoElement) {
    if (!platform.isIOS) return;

    // Required attributes for iOS
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.setAttribute('muted', '');
    videoElement.muted = true;

    // Prevent fullscreen on iOS
    videoElement.style.objectFit = 'cover';

    // Handle iOS video sizing
    videoElement.addEventListener('loadedmetadata', () => {
        // Force layout recalculation on iOS
        setTimeout(() => {
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
        }, 100);
    });
}

/**
 * Request wake lock for screen (prevent dimming during training)
 */
export async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            const wakeLock = await navigator.wakeLock.request('screen');
            console.log('[Platform] Wake lock acquired');
            return wakeLock;
        } catch (err) {
            console.log('[Platform] Wake lock failed:', err);
        }
    }
    return null;
}

/**
 * iOS-specific audio context handling
 * iOS requires user interaction to start audio
 */
export function unlockAudioForIOS(audioContext) {
    if (!platform.isIOS) return Promise.resolve();

    return new Promise((resolve) => {
        const unlock = async () => {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('click', unlock);
            resolve();
        };

        document.addEventListener('touchstart', unlock, { once: true });
        document.addEventListener('click', unlock, { once: true });

        // Also try to unlock immediately if already interacted
        if (audioContext.state !== 'suspended') {
            resolve();
        }
    });
}

/**
 * Check and request necessary permissions
 */
export async function checkPermissions() {
    const permissions = {
        camera: 'unknown',
        microphone: 'unknown'
    };

    if ('permissions' in navigator) {
        try {
            const cameraResult = await navigator.permissions.query({ name: 'camera' });
            permissions.camera = cameraResult.state;
        } catch (e) {
            // Some browsers don't support camera permission query
        }
    }

    return permissions;
}
