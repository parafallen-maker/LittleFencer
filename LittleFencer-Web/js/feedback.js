/**
 * Audio Feedback Manager
 * Handles TTS voice feedback and sound effects
 * With iOS/Safari compatibility
 */

import { platform, unlockAudioForIOS } from './platform.js';

export class AudioFeedbackManager {
    constructor() {
        this.synth = null;
        this.voice = null;
        this.isSpeaking = false;
        this.speechQueue = [];
        this.soundEnabled = true;
        this.voiceEnabled = true;
        this.isAudioUnlocked = false;
        
        // Audio context for sound effects
        this.audioContext = null;
        this.sounds = {};
    }
    
    /**
     * Initialize audio feedback
     */
    async init() {
        // Initialize TTS
        if ('speechSynthesis' in window) {
            this.synth = window.speechSynthesis;
            
            // Wait for voices to load
            await this.loadVoices();
            
            console.log('[Feedback] TTS initialized');
        } else {
            console.warn('[Feedback] TTS not supported');
        }
        
        // Initialize Audio Context
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Handle iOS audio unlock requirement
            if (platform.isIOS) {
                console.log('[Feedback] iOS detected, setting up audio unlock...');
                this.setupIOSAudioUnlock();
            } else {
                await this.generateSounds();
                this.isAudioUnlocked = true;
            }
            
            console.log('[Feedback] Audio context initialized');
        } catch (error) {
            console.warn('[Feedback] Audio context failed:', error);
        }
    }
    
    /**
     * Setup iOS audio unlock on user interaction
     */
    setupIOSAudioUnlock() {
        const unlockHandler = async () => {
            if (this.isAudioUnlocked) return;
            
            try {
                // Resume audio context
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                // Generate sounds after unlock
                await this.generateSounds();
                
                // Play a silent buffer to fully unlock
                const buffer = this.audioContext.createBuffer(1, 1, 22050);
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
                
                this.isAudioUnlocked = true;
                console.log('[Feedback] iOS audio unlocked');
                
                // Remove listeners
                document.removeEventListener('touchstart', unlockHandler);
                document.removeEventListener('touchend', unlockHandler);
                document.removeEventListener('click', unlockHandler);
            } catch (err) {
                console.warn('[Feedback] iOS audio unlock failed:', err);
            }
        };
        
        document.addEventListener('touchstart', unlockHandler, { passive: true });
        document.addEventListener('touchend', unlockHandler, { passive: true });
        document.addEventListener('click', unlockHandler, { passive: true });
    }
    
    /**
     * Load available voices
     */
    async loadVoices() {
        return new Promise((resolve) => {
            const loadVoicesHandler = () => {
                const voices = this.synth.getVoices();
                
                // Try to find Chinese voice
                // iOS Safari has specific voice names
                this.voice = voices.find(v => v.lang === 'zh-CN') ||
                             voices.find(v => v.lang.includes('zh')) ||
                             voices.find(v => v.lang.includes('cmn')) ||
                             voices.find(v => v.name.includes('Chinese')) ||
                             voices[0];
                
                if (this.voice) {
                    console.log('[Feedback] Using voice:', this.voice.name, this.voice.lang);
                }
                
                resolve();
            };
            
            // iOS Safari loads voices synchronously
            if (platform.isIOS || this.synth.getVoices().length > 0) {
                loadVoicesHandler();
            } else {
                this.synth.onvoiceschanged = loadVoicesHandler;
                
                // Fallback timeout
                setTimeout(resolve, 1000);
            }
        });
    }
    
    /**
     * Generate sound effects using Web Audio API
     */
    async generateSounds() {
        // Perfect sound - ascending arpeggio
        this.sounds.perfect = this.createArpeggio([523.25, 659.25, 783.99], 0.15, 0.8);
        
        // Good sound - two-note chime
        this.sounds.good = this.createArpeggio([523.25, 659.25], 0.12, 0.6);
        
        // Acceptable sound - single tone
        this.sounds.acceptable = this.createTone(440, 0.15, 0.5);
        
        // Error sound - low buzz
        this.sounds.error = this.createTone(220, 0.2, 0.4);
        
        // Click sound
        this.sounds.click = this.createClick();
    }
    
    /**
     * Create an arpeggio sound buffer
     */
    createArpeggio(frequencies, noteDuration, volume) {
        const sampleRate = this.audioContext.sampleRate;
        const totalDuration = noteDuration * frequencies.length;
        const buffer = this.audioContext.createBuffer(1, sampleRate * totalDuration, sampleRate);
        const data = buffer.getChannelData(0);
        
        frequencies.forEach((freq, index) => {
            const startSample = Math.floor(index * noteDuration * sampleRate);
            const endSample = Math.floor((index + 1) * noteDuration * sampleRate);
            
            for (let i = startSample; i < endSample; i++) {
                const t = (i - startSample) / sampleRate;
                const envelope = Math.exp(-t * 10) * volume;
                data[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
            }
        });
        
        return buffer;
    }
    
    /**
     * Create a single tone sound buffer
     */
    createTone(frequency, duration, volume) {
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 8) * volume;
            data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
        }
        
        return buffer;
    }
    
    /**
     * Create a click sound buffer
     */
    createClick() {
        const sampleRate = this.audioContext.sampleRate;
        const duration = 0.05;
        const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 100) * 0.5;
        }
        
        return buffer;
    }
    
    /**
     * Play a sound buffer
     */
    playBuffer(buffer) {
        if (!this.audioContext || !this.soundEnabled || !buffer) return;
        
        // Resume audio context if suspended (needed for mobile)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
    }
    
    /**
     * Play action sound based on quality
     */
    playActionSound(quality) {
        switch (quality) {
            case 'PERFECT':
                this.playBuffer(this.sounds.perfect);
                break;
            case 'GOOD':
                this.playBuffer(this.sounds.good);
                break;
            case 'ACCEPTABLE':
                this.playBuffer(this.sounds.acceptable);
                break;
            case 'POOR':
                this.playBuffer(this.sounds.error);
                break;
        }
    }
    
    /**
     * Play click sound
     */
    playClick() {
        this.playBuffer(this.sounds.click);
    }
    
    /**
     * Speak text using TTS
     */
    speak(text, priority = false) {
        if (!this.synth || !this.voiceEnabled) return;
        
        // If priority, cancel current speech
        if (priority) {
            this.synth.cancel();
            this.speechQueue = [];
        }
        
        // Add to queue
        this.speechQueue.push(text);
        
        // Process queue
        this.processQueue();
    }
    
    /**
     * Process speech queue
     */
    processQueue() {
        if (this.isSpeaking || this.speechQueue.length === 0) return;
        
        const text = this.speechQueue.shift();
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (this.voice) {
            utterance.voice = this.voice;
        }
        
        utterance.rate = 1.2;  // Slightly faster
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
            this.isSpeaking = true;
        };
        
        utterance.onend = () => {
            this.isSpeaking = false;
            this.processQueue();
        };
        
        utterance.onerror = () => {
            this.isSpeaking = false;
            this.processQueue();
        };
        
        this.synth.speak(utterance);
    }
    
    /**
     * Cancel current speech
     */
    cancel() {
        if (this.synth) {
            this.synth.cancel();
            this.speechQueue = [];
            this.isSpeaking = false;
        }
    }
    
    /**
     * Enable/disable sound
     */
    setSound(enabled) {
        this.soundEnabled = enabled;
    }
    
    /**
     * Enable/disable voice
     */
    setVoice(enabled) {
        this.voiceEnabled = enabled;
        if (!enabled) {
            this.cancel();
        }
    }
}
