package com.argus.localcore

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

// Assistant metadata requires a recognition service. Delegate only to Android's dedicated
// on-device engine, never the generic/default recognizer (which could recurse into this one).
class ArgusRecognitionService : RecognitionService() {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var current: Callback? = null
    private val owner = "assistant-recognition-adapter"
    private val timeout = Runnable { endError(SpeechRecognizer.ERROR_SPEECH_TIMEOUT) }

    override fun onStartListening(intent: Intent, listener: Callback) {
        if (current != null || !VoiceAudioGate.acquire(owner)) { listener.error(SpeechRecognizer.ERROR_RECOGNIZER_BUSY); return }
        if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            VoiceAudioGate.release(owner); listener.error(SpeechRecognizer.ERROR_CLIENT); return
        }
        current = listener
        try {
            val engine = SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
            recognizer = engine
            engine.setRecognitionListener(object : SpeechListenerAdapter() {
                override fun onReadyForSpeech(params: Bundle?) { if (current === listener) listener.readyForSpeech(params ?: Bundle()) }
                override fun onBeginningOfSpeech() { if (current === listener) listener.beginningOfSpeech() }
                override fun onRmsChanged(rmsdB: Float) { if (current === listener) listener.rmsChanged(rmsdB) }
                override fun onEndOfSpeech() { if (current === listener) listener.endOfSpeech() }
                override fun onError(error: Int) { if (current === listener) endError(error) }
                override fun onResults(results: Bundle?) {
                    if (current !== listener) return
                    release(); listener.results(results ?: Bundle())
                }
            })
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE) ?: java.util.Locale.getDefault().toLanguageTag())
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true))
            handler.postDelayed(timeout, 30_000L)
        } catch (_: Exception) { endError(SpeechRecognizer.ERROR_CLIENT) }
    }
    override fun onStopListening(listener: Callback) { if (current === listener) runCatching { recognizer?.stopListening() } }
    override fun onCancel(listener: Callback) { if (current === listener) release() }
    private fun endError(error: Int) { val target = current; release(); runCatching { target?.error(error) } }
    private fun release() {
        current = null; handler.removeCallbacks(timeout)
        runCatching { recognizer?.cancel() }; runCatching { recognizer?.destroy() }; recognizer = null
        VoiceAudioGate.release(owner)
    }
    override fun onDestroy() { release(); super.onDestroy() }
}
