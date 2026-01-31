/**
 * Skeleton Renderer
 * Renders pose landmarks on canvas overlay
 */

import { PoseLandmark } from './pose.js';

// Skeleton connections (pairs of landmark indices)
const POSE_CONNECTIONS = [
    // Face
    [PoseLandmark.NOSE, PoseLandmark.LEFT_EYE],
    [PoseLandmark.NOSE, PoseLandmark.RIGHT_EYE],
    [PoseLandmark.LEFT_EYE, PoseLandmark.LEFT_EAR],
    [PoseLandmark.RIGHT_EYE, PoseLandmark.RIGHT_EAR],
    
    // Torso
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER],
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP],
    [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP],
    [PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP],
    
    // Left arm
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    [PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_PINKY],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_INDEX],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_THUMB],
    [PoseLandmark.LEFT_PINKY, PoseLandmark.LEFT_INDEX],
    
    // Right arm
    [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
    [PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_PINKY],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_INDEX],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_THUMB],
    [PoseLandmark.RIGHT_PINKY, PoseLandmark.RIGHT_INDEX],
    
    // Left leg
    [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
    [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL],
    [PoseLandmark.LEFT_HEEL, PoseLandmark.LEFT_FOOT_INDEX],
    [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_FOOT_INDEX],
    
    // Right leg
    [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE],
    [PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
    [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_HEEL],
    [PoseLandmark.RIGHT_HEEL, PoseLandmark.RIGHT_FOOT_INDEX],
    [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_FOOT_INDEX]
];

// Quality colors
const QUALITY_COLORS = {
    perfect: '#4ade80',   // Green
    good: '#4ade80',      // Green
    acceptable: '#fbbf24', // Yellow
    poor: '#ef4444',      // Red
    neutral: '#60a5fa'    // Blue
};

export class SkeletonRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Rendering settings
        this.lineWidth = 4;
        this.pointRadius = 6;
        this.minVisibility = 0.5;
        
        // Animation
        this.lastRenderTime = 0;
        this.smoothedLandmarks = null;
        this.smoothingFactor = 0.5;
    }
    
    /**
     * Render skeleton overlay
     */
    render(landmarks, quality = 'neutral') {
        if (!landmarks || landmarks.length === 0) {
            this.clear();
            return;
        }
        
        // Resize canvas to match video
        this.resizeCanvas();
        
        // Clear previous frame
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Smooth landmarks
        const smoothed = this.smoothLandmarks(landmarks);
        
        // Get color based on quality
        const color = QUALITY_COLORS[quality] || QUALITY_COLORS.neutral;
        
        // Draw connections
        this.drawConnections(smoothed, color);
        
        // Draw landmarks
        this.drawLandmarks(smoothed, color);
    }
    
    /**
     * Clear canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.smoothedLandmarks = null;
    }
    
    /**
     * Resize canvas to match parent
     */
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        
        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
    }
    
    /**
     * Smooth landmarks using exponential moving average
     */
    smoothLandmarks(landmarks) {
        if (!this.smoothedLandmarks) {
            this.smoothedLandmarks = landmarks.map(lm => ({ ...lm }));
            return this.smoothedLandmarks;
        }
        
        const smoothed = landmarks.map((lm, i) => {
            const prev = this.smoothedLandmarks[i];
            return {
                x: prev.x + (lm.x - prev.x) * this.smoothingFactor,
                y: prev.y + (lm.y - prev.y) * this.smoothingFactor,
                z: lm.z,
                visibility: lm.visibility
            };
        });
        
        this.smoothedLandmarks = smoothed;
        return smoothed;
    }
    
    /**
     * Draw skeleton connections
     */
    drawConnections(landmarks, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Add glow effect
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 10;
        
        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];
            
            // Skip if not visible
            if (!start || !end) continue;
            if ((start.visibility || 0) < this.minVisibility) continue;
            if ((end.visibility || 0) < this.minVisibility) continue;
            
            // Convert normalized coordinates to canvas coordinates
            // Mirror X for front camera
            const x1 = (1 - start.x) * this.canvas.width;
            const y1 = start.y * this.canvas.height;
            const x2 = (1 - end.x) * this.canvas.width;
            const y2 = end.y * this.canvas.height;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
    }
    
    /**
     * Draw landmark points
     */
    drawLandmarks(landmarks, color) {
        this.ctx.fillStyle = color;
        
        // Key landmarks to highlight
        const keyLandmarks = [
            PoseLandmark.NOSE,
            PoseLandmark.LEFT_SHOULDER,
            PoseLandmark.RIGHT_SHOULDER,
            PoseLandmark.LEFT_ELBOW,
            PoseLandmark.RIGHT_ELBOW,
            PoseLandmark.LEFT_WRIST,
            PoseLandmark.RIGHT_WRIST,
            PoseLandmark.LEFT_HIP,
            PoseLandmark.RIGHT_HIP,
            PoseLandmark.LEFT_KNEE,
            PoseLandmark.RIGHT_KNEE,
            PoseLandmark.LEFT_ANKLE,
            PoseLandmark.RIGHT_ANKLE
        ];
        
        for (const idx of keyLandmarks) {
            const lm = landmarks[idx];
            if (!lm || (lm.visibility || 0) < this.minVisibility) continue;
            
            // Mirror X for front camera
            const x = (1 - lm.x) * this.canvas.width;
            const y = lm.y * this.canvas.height;
            
            // Draw point with glow
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // White center
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.pointRadius * 0.4, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Reset color
            this.ctx.fillStyle = color;
        }
    }
}
