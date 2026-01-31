package com.littlefencer.app.feedback

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.media.ToneGenerator
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

/**
 * AudioManager - Handles audio feedback for training.
 * Agent C (Artist) - Task C2
 * 
 * Provides:
 * - TTS for corrections ("Knee out!", "Arm first!")
 * - SFX for status (ding for good, buzz for bad)
 * - Uses system ToneGenerator as fallback when no custom sounds available
 */
class AudioFeedbackManager(private val context: Context) {

    private var tts: TextToSpeech? = null
    private var soundPool: SoundPool? = null
    private var toneGenerator: ToneGenerator? = null
    private var isTtsReady = false

    // Sound effect IDs (will be 0 if not loaded)
    private var soundDing: Int = 0
    private var soundBuzz: Int = 0
    private var soundTick: Int = 0
    private var soundPerfect: Int = 0

    companion object {
        private const val TAG = "AudioFeedbackManager"
        
        // Common TTS phrases (cached for quick access)
        const val PHRASE_EN_GARDE = "En Garde"
        const val PHRASE_NICE_LUNGE = "Nice lunge!"
        const val PHRASE_KNEE_OUT = "Knee out!"
        const val PHRASE_ARM_FIRST = "Arm first!"
        const val PHRASE_TOO_HIGH = "Too high!"
        const val PHRASE_GOOD_JOB = "Good job!"
        
        // Enhanced saber coaching phrases
        const val PHRASE_BEND_MORE = "Bend more!"
        const val PHRASE_TOO_LOW = "Too low!"
        const val PHRASE_BACK_LEG = "Push back leg!"
        const val PHRASE_STAY_UPRIGHT = "Stay upright!"
        const val PHRASE_HEAD_UP = "Head up!"
        const val PHRASE_BLADE_LEVEL = "Blade level!"
        const val PHRASE_KNEE_OVER_ANKLE = "Knee forward!"
        const val PHRASE_WIDER_STANCE = "Wider stance!"
        const val PHRASE_FASTER_RECOVERY = "Faster recovery!"
    }

    /**
     * Initialize audio systems.
     * Call this in onCreate.
     */
    fun initialize() {
        initializeTts()
        initializeSoundPool()
        initializeToneGenerator()
    }

    private fun initializeTts() {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = tts?.setLanguage(Locale.US)
                if (result == TextToSpeech.LANG_MISSING_DATA || 
                    result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "TTS language not supported, trying Chinese")
                    tts?.setLanguage(Locale.CHINESE)
                }
                // Set speech rate slightly faster for quick feedback
                tts?.setSpeechRate(1.2f)
                isTtsReady = true
                Log.d(TAG, "TTS initialized")
            } else {
                Log.e(TAG, "TTS initialization failed")
            }
        }
    }

    private fun initializeSoundPool() {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(4)
            .setAudioAttributes(audioAttributes)
            .build()

        // Try to load custom sound effects from raw resources
        // If files don't exist, use ToneGenerator as fallback
        try {
            val rawClass = Class.forName("${context.packageName}.R\$raw")
            
            rawClass.getField("ding").getInt(null).let { resId ->
                soundDing = soundPool?.load(context, resId, 1) ?: 0
            }
            rawClass.getField("buzz").getInt(null).let { resId ->
                soundBuzz = soundPool?.load(context, resId, 1) ?: 0
            }
            rawClass.getField("tick").getInt(null).let { resId ->
                soundTick = soundPool?.load(context, resId, 1) ?: 0
            }
            rawClass.getField("perfect").getInt(null).let { resId ->
                soundPerfect = soundPool?.load(context, resId, 1) ?: 0
            }
            Log.d(TAG, "Custom sounds loaded from res/raw/")
        } catch (e: Exception) {
            Log.d(TAG, "Using system tones as fallback (no custom sounds)")
        }
    }

    private fun initializeToneGenerator() {
        try {
            toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 80)
            Log.d(TAG, "ToneGenerator initialized")
        } catch (e: Exception) {
            Log.e(TAG, "ToneGenerator initialization failed", e)
        }
    }

    /**
     * Speak a correction or feedback phrase.
     */
    fun speak(text: String) {
        if (isTtsReady) {
            tts?.speak(text, TextToSpeech.QUEUE_ADD, null, text.hashCode().toString())
        }
    }

    /**
     * Play a short sound effect.
     * Falls back to system tones if custom sounds aren't loaded.
     */
    fun playSfx(type: SfxType) {
        val soundId = when (type) {
            SfxType.DING -> soundDing
            SfxType.BUZZ -> soundBuzz
            SfxType.TICK -> soundTick
            SfxType.PERFECT -> soundPerfect
        }
        
        if (soundId != 0) {
            soundPool?.play(soundId, 1.0f, 1.0f, 1, 0, 1.0f)
        } else {
            // Fallback to system tones
            val toneType = when (type) {
                SfxType.DING -> ToneGenerator.TONE_PROP_ACK
                SfxType.BUZZ -> ToneGenerator.TONE_PROP_NACK
                SfxType.TICK -> ToneGenerator.TONE_CDMA_PIP
                SfxType.PERFECT -> ToneGenerator.TONE_CDMA_CONFIRM
            }
            toneGenerator?.startTone(toneType, 150)
        }
    }

    /**
     * Play feedback for good posture.
     */
    fun playGoodFeedback() {
        playSfx(SfxType.DING)
    }

    /**
     * Play feedback for bad posture.
     */
    fun playBadFeedback() {
        playSfx(SfxType.BUZZ)
    }

    /**
     * Play feedback for perfect move.
     */
    fun playPerfectFeedback() {
        playSfx(SfxType.PERFECT)
        speak(PHRASE_NICE_LUNGE)
    }

    /**
     * Play metronome tick for rhythm training.
     */
    fun playMetronomeTick() {
        playSfx(SfxType.TICK)
    }

    /**
     * Release all audio resources.
     * Call this in onDestroy.
     */
    fun release() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        
        soundPool?.release()
        soundPool = null
        
        toneGenerator?.release()
        toneGenerator = null
        
        Log.d(TAG, "Audio resources released")
    }

    enum class SfxType {
        DING,   // Good action
        BUZZ,   // Bad action
        TICK,   // Metronome
        PERFECT // Perfect move
    }
}
