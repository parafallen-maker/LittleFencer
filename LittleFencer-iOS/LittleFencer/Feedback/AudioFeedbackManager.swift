import AVFoundation
import AVFAudio
import AudioToolbox

/// Audio feedback manager using AVSpeechSynthesizer and System Sounds
/// Provides TTS for corrections and SFX for status feedback
class AudioFeedbackManager: ObservableObject {
    
    // MARK: - TTS Phrases (matching Android)
    
    // Basic phrases
    static let PHRASE_EN_GARDE = "En Garde"
    static let PHRASE_NICE_LUNGE = "Nice lunge!"
    static let PHRASE_KNEE_OUT = "Knee out!"
    static let PHRASE_ARM_FIRST = "Arm first!"
    static let PHRASE_TOO_HIGH = "Too high!"
    static let PHRASE_GOOD_JOB = "Good job!"
    
    // Enhanced saber coaching phrases
    static let PHRASE_BEND_MORE = "Bend more!"
    static let PHRASE_TOO_LOW = "Too low!"
    static let PHRASE_BACK_LEG = "Push back leg!"
    static let PHRASE_STAY_UPRIGHT = "Stay upright!"
    static let PHRASE_HEAD_UP = "Head up!"
    static let PHRASE_BLADE_LEVEL = "Blade level!"
    static let PHRASE_KNEE_OVER_ANKLE = "Knee forward!"
    static let PHRASE_WIDER_STANCE = "Wider stance!"
    static let PHRASE_FASTER_RECOVERY = "Faster recovery!"
    
    // P2.1 New Action Phrases
    static let PHRASE_NICE_ADVANCE = "Good advance!"
    static let PHRASE_NICE_RETREAT = "Good retreat!"
    static let PHRASE_NICE_PARRY = "Good parry!"
    static let PHRASE_NICE_RIPOSTE = "Nice riposte!"
    static let PHRASE_FLUNGE_ALERT = "Flunge!"
    static let PHRASE_RULE_VIOLATION = "Back foot passed!"
    
    // Combo phrases
    static let PHRASE_FIVE_COMBO = "Five combo! Keep it up!"
    static let PHRASE_TEN_COMBO = "Ten combo! You're on fire!"
    
    // MARK: - Properties
    
    private var speechSynthesizer: AVSpeechSynthesizer?
    private var isTtsReady = false
    
    /// Queue for managing speech to avoid overlap
    private var speechQueue: [String] = []
    private var isSpeaking = false
    
    // MARK: - Sound Effect Types
    
    enum SfxType {
        case ding       // Good action
        case buzz       // Bad action/correction needed
        case tick       // Metronome tick
        case perfect    // Perfect move celebration
    }
    
    // System sound IDs (iOS built-in sounds)
    private let soundDing: SystemSoundID = 1057      // Short positive sound
    private let soundBuzz: SystemSoundID = 1053      // Vibration-like error
    private let soundTick: SystemSoundID = 1104      // Tick sound
    private let soundPerfect: SystemSoundID = 1025   // Celebration sound
    
    // MARK: - Initialization
    
    func initialize() {
        initializeTts()
        configureAudioSession()
        print("AudioFeedbackManager initialized")
    }
    
    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
            try audioSession.setActive(true)
        } catch {
            print("Audio session configuration error: \(error)")
        }
    }
    
    private func initializeTts() {
        speechSynthesizer = AVSpeechSynthesizer()
        speechSynthesizer?.delegate = self
        isTtsReady = true
        print("TTS initialized")
    }
    
    // MARK: - TTS
    
    /// Speak a correction or feedback phrase
    func speak(_ text: String) {
        guard isTtsReady, let synthesizer = speechSynthesizer else { return }
        
        // Add to queue and process
        speechQueue.append(text)
        processNextSpeech()
    }
    
    private func processNextSpeech() {
        guard !isSpeaking, !speechQueue.isEmpty else { return }
        guard let synthesizer = speechSynthesizer else { return }
        
        let text = speechQueue.removeFirst()
        isSpeaking = true
        
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.2
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0
        
        synthesizer.speak(utterance)
    }
    
    /// Speak without queuing (immediate, interrupts current)
    func speakImmediately(_ text: String) {
        guard let synthesizer = speechSynthesizer else { return }
        
        // Stop current speech
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        
        speechQueue.removeAll()
        isSpeaking = false
        
        speak(text)
    }
    
    // MARK: - Sound Effects
    
    /// Play a sound effect
    func playSfx(_ type: SfxType) {
        let soundID: SystemSoundID
        switch type {
        case .ding:
            soundID = soundDing
        case .buzz:
            soundID = soundBuzz
        case .tick:
            soundID = soundTick
        case .perfect:
            soundID = soundPerfect
        }
        AudioServicesPlaySystemSound(soundID)
    }
    
    /// Play feedback for good posture
    func playGoodFeedback() {
        playSfx(.ding)
    }
    
    /// Play feedback for bad posture
    func playBadFeedback() {
        playSfx(.buzz)
    }
    
    /// Play feedback for perfect move
    func playPerfectFeedback() {
        playSfx(.perfect)
    }
    
    /// Play metronome tick
    func playMetronomeTick() {
        playSfx(.tick)
    }
    
    // MARK: - Haptic Feedback
    
    /// Trigger haptic feedback (for supported devices)
    func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }
    
    /// Trigger success haptic
    func triggerSuccessHaptic() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }
    
    /// Trigger error haptic
    func triggerErrorHaptic() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }
    
    // MARK: - Cleanup
    
    func release() {
        speechSynthesizer?.stopSpeaking(at: .immediate)
        speechSynthesizer = nil
        speechQueue.removeAll()
        isSpeaking = false
        isTtsReady = false
        print("AudioFeedbackManager released")
    }
}

// MARK: - AVSpeechSynthesizerDelegate

extension AudioFeedbackManager: AVSpeechSynthesizerDelegate {
    
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        isSpeaking = false
        processNextSpeech()
    }
    
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        isSpeaking = false
        processNextSpeech()
    }
}
