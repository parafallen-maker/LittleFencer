/**
 * Video Recorder
 * Handles video recording using MediaRecorder API
 */

export class VideoRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.chunks = [];
        this.isRecording = false;
        this.startTime = null;
        this.stream = null;
    }
    
    /**
     * Start recording
     */
    async start(stream) {
        if (this.isRecording) return;
        
        this.stream = stream;
        this.chunks = [];
        
        // Determine supported MIME type
        const mimeType = this.getSupportedMimeType();
        
        if (!mimeType) {
            throw new Error('No supported video MIME type found');
        }
        
        try {
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 2500000 // 2.5 Mbps
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.chunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onerror = (event) => {
                console.error('[Recorder] Error:', event.error);
                this.isRecording = false;
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.startTime = Date.now();
            
            console.log('[Recorder] Started recording');
            
        } catch (error) {
            console.error('[Recorder] Failed to start:', error);
            throw error;
        }
    }
    
    /**
     * Stop recording and return blob
     */
    async stop() {
        if (!this.isRecording) return null;
        
        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder.mimeType;
                const blob = new Blob(this.chunks, { type: mimeType });
                
                this.isRecording = false;
                this.chunks = [];
                
                console.log('[Recorder] Stopped, blob size:', blob.size);
                
                resolve(blob);
            };
            
            this.mediaRecorder.stop();
        });
    }
    
    /**
     * Get recording duration in seconds
     */
    getDuration() {
        if (!this.startTime) return 0;
        return (Date.now() - this.startTime) / 1000;
    }
    
    /**
     * Get supported MIME type
     */
    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        
        return null;
    }
    
    /**
     * Check if recording is supported
     */
    static isSupported() {
        return 'MediaRecorder' in window;
    }
}
