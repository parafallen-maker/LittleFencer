/**
 * Keyframe Detector [P1]
 * Detects motion start/end events for efficient DTW triggering
 * Only runs DTW matching when significant motion is detected
 */

export class KeyframeDetector {
    constructor(options = {}) {
        this.velocityThreshold = options.velocityThreshold || 0.02;      // Motion start threshold
        this.stillnessThreshold = options.stillnessThreshold || 0.008;   // Motion end threshold
        this.minMotionFrames = options.minMotionFrames || 5;             // Min frames for valid motion

        this.state = 'STILL';  // STILL, MOVING
        this.motionFrameCount = 0;
        this.stillFrameCount = 0;
        this.requiredStillFrames = 3;
    }

    /**
     * Update detector with current velocities
     * @param {Object} velocityTracker - JointVelocityTracker instance
     * @param {number[]} keyJoints - Joint indices to monitor (e.g., wrist, ankle)
     * @returns {string|null} Event: 'MOTION_START', 'MOTION_END', or null
     */
    update(velocityTracker, keyJoints = [15, 16, 27, 28]) {
        // Calculate total velocity from key joints
        let totalVelocity = 0;
        for (const jointIdx of keyJoints) {
            const vel = velocityTracker.getVelocity(jointIdx);
            totalVelocity += vel.magnitude || 0;
        }
        const avgVelocity = totalVelocity / keyJoints.length;

        let event = null;

        if (this.state === 'STILL') {
            if (avgVelocity > this.velocityThreshold) {
                this.motionFrameCount++;
                if (this.motionFrameCount >= 2) {
                    this.state = 'MOVING';
                    this.stillFrameCount = 0;
                    event = 'MOTION_START';
                    console.log('[Keyframe] 🏃 动作开始');
                }
            } else {
                this.motionFrameCount = 0;
            }
        } else if (this.state === 'MOVING') {
            this.motionFrameCount++;

            if (avgVelocity < this.stillnessThreshold) {
                this.stillFrameCount++;
                if (this.stillFrameCount >= this.requiredStillFrames) {
                    this.state = 'STILL';
                    if (this.motionFrameCount >= this.minMotionFrames) {
                        event = 'MOTION_END';
                        console.log(`[Keyframe] ⏹️ 动作结束 (${this.motionFrameCount}帧)`);
                    }
                    this.motionFrameCount = 0;
                }
            } else {
                this.stillFrameCount = 0;
            }
        }

        return event;
    }

    /**
     * Get current state info
     */
    getState() {
        return {
            state: this.state,
            motionFrames: this.motionFrameCount,
            stillFrames: this.stillFrameCount
        };
    }

    /**
     * Check if currently in motion
     */
    isMoving() {
        return this.state === 'MOVING';
    }

    reset() {
        this.state = 'STILL';
        this.motionFrameCount = 0;
        this.stillFrameCount = 0;
    }
}
