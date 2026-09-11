package com.argus.localcore

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject
import java.util.Locale

class OfflineSpeechController(private val activity: MainActivity, private val emit: (JSONObject) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private val session = SpeechSession()
    private var recognizer: SpeechRecognizer? = null
    private var probe: SpeechRecognizer? = null
    private var probeGeneration = 0
    private var captureTimeout: Runnable? = null
    private var resultTimeout: Runnable? = null
    private var probeTimeout: Runnable? = null
    private var foreground = false
    private var destroyed = false
    @Volatile private var cachedState = "{}"

    init { refreshState() }

    fun snapshot(): String = cachedState
    private var pendingStart: String? = null
    private var audioOwner: String? = null
    fun isCapturing(): Boolean = session.current() != null || pendingStart != null

    fun resume() { foreground = true; refreshState() }

    fun pause() {
        foreground = false
        cancel(message = "Speech capture cancelled because Argus left the foreground.")
        releaseProbe()
    }

    fun destroy() {
        pause()
        destroyed = true
        handler.removeCallbacksAndMessages(null)
    }

    fun refreshState() {
        if (destroyed) return
        val available = Build.VERSION.SDK_INT >= 31 && runCatching { SpeechRecognizer.isOnDeviceRecognitionAvailable(activity) }.getOrDefault(false)
        val state = JSONObject().put("type", "capabilities").put("status", "completed")
            .put("available", SpeechPolicy.canUseOnDevice(Build.VERSION.SDK_INT, available))
            .put("microphoneGranted", activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
            .put("deviceLanguage", Locale.getDefault().toLanguageTag())
            .put("modelDownloadSupported", Build.VERSION.SDK_INT >= 33 && available)
            .put("message", when {
                Build.VERSION.SDK_INT < 31 -> "Offline speech input requires Android 12 or later. You can type commands on this device."
                !available -> "No on-device speech service is available. Check Android voice settings or type your command."
                else -> "On-device speech service available. Language-pack availability is checked separately."
            })
        cachedState = state.toString()
        emit(state)
    }

    fun start(id: String, language: String, wakeReadyCue: Boolean = false) {
        if (destroyed) return
        if (!foreground || !BackgroundWake.unlocked(activity)) { event("error", id, message = "Open and unlock Argus before starting speech input."); return }
        if (pendingStart != null) { event("error", id, message = "A speech start is already pending."); return }
        activity.offlineTts.stop(message = "Spoken reply stopped for microphone capture.")
        if (VoiceAudioGate.busy() && BackgroundWake.running && !activity.wakePhrase.isBusy() && session.current() == null) {
            pendingStart = id
            BackgroundWake.localHoldUntil = android.os.SystemClock.elapsedRealtime() + 40_000L
            val deadline = android.os.SystemClock.elapsedRealtime() + 4000L
            handler.post(object : Runnable {
                override fun run() {
                    if (pendingStart != id) return
                    if (!foreground || destroyed || android.os.SystemClock.elapsedRealtime() >= deadline) {
                        pendingStart = null; BackgroundWake.localHoldUntil = 0L
                        event("error", id, message = "The microphone did not become available. Pause Hey Argus and try again.")
                    } else if (VoiceAudioGate.busy()) handler.postDelayed(this, 50L)
                    else { pendingStart = null; start(id, language, wakeReadyCue) }
                }
            })
            return
        }
        if (activity.wakePhrase.isBusy()) { event("error", id, message = "Stop wake listening and wait for the microphone to be released first."); return }
        if (session.current() != null) { event("error", id, message = "A speech session is already running."); return }
        refreshState()
        if (!JSONObject(cachedState).optBoolean("available")) { event("error", id, message = JSONObject(cachedState).getString("message")); return }
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            event("error", id, message = "Allow microphone access, then tap Start listening again.")
            return
        }
        if (!VoiceAudioGate.acquire(id)) { event("error", id, message = "Another Argus audio operation is active."); return }
        audioOwner = id
        if (Build.VERSION.SDK_INT < 31 || !session.begin(id)) { VoiceAudioGate.release(id); audioOwner = null; return }
        activity.setVoiceScreenAwake("speech", true)
        activity.offlineTts.stop(message = "Spoken reply stopped for microphone capture.")
        releaseProbe()
        try {
            val engine = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity)
            recognizer = engine
            var readyCueSent = false
            engine.setRecognitionListener(object : SpeechListenerAdapter() {
                override fun onReadyForSpeech(params: Bundle?) {
                    if (!session.accepts(id)) return
                    event("listening", id)
                    if (wakeReadyCue && !readyCueSent) {
                        readyCueSent = true
                        runCatching {
                            activity.getSystemService(android.os.Vibrator::class.java)?.vibrate(
                                android.os.VibrationEffect.createOneShot(60, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                        }
                    }
                }
                override fun onPartialResults(results: Bundle?) {
                    if (session.accepts(id)) event("partial", id, text = SpeechPolicy.firstTranscript(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)))
                }
                override fun onEndOfSpeech() { processing(id) }
                override fun onError(error: Int) { finish(id, "error", message = SpeechPolicy.errorMessage(error)) }
                override fun onResults(results: Bundle?) {
                    val text = SpeechPolicy.firstTranscript(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
                    finish(id, if (text.isBlank()) "error" else "result", text, if (text.isBlank()) SpeechPolicy.errorMessage(7) else "Review the recognised text.")
                }
            })
            engine.startListening(recognitionIntent(language))
            captureTimeout = Runnable { stop(id) }.also { handler.postDelayed(it, 30_000) }
        } catch (_: Exception) {
            finish(id, "error", message = "The on-device recognizer could not start. Check Android voice settings or type your command.")
        }
    }

    fun stop(id: String) {
        if (!session.accepts(id)) return
        processing(id)
        try { recognizer?.stopListening() }
        catch (_: Exception) { finish(id, "error", message = "Speech input could not finish. Please try again.") }
    }

    fun cancel(id: String? = null, message: String = "Speech capture cancelled. Your typed command is unchanged.") {
        val pending = pendingStart
        if (pending != null && (id == null || id == pending)) {
            pendingStart = null; BackgroundWake.localHoldUntil = 0L
            event("cancelled", pending, message = message)
        }
        val active = session.current() ?: return
        if (id != null && id != active) return
        if (!session.finish(active)) return
        releaseRecognizer()
        event("cancelled", active, message = message)
    }

    private fun processing(id: String) {
        if (!session.accepts(id)) return
        captureTimeout?.let(handler::removeCallbacks)
        captureTimeout = null
        event("processing", id)
        if (resultTimeout == null) {
            resultTimeout = Runnable { finish(id, "error", message = "The speech service took too long. Please try again or type your command.") }
                .also { handler.postDelayed(it, 10_000) }
        }
    }

    private fun finish(id: String, type: String, text: String = "", message: String = "") {
        if (!session.finish(id)) return
        releaseRecognizer()
        event(type, id, text, message)
    }

    private fun releaseRecognizer() {
        activity.setVoiceScreenAwake("speech", false)
        captureTimeout?.let(handler::removeCallbacks)
        resultTimeout?.let(handler::removeCallbacks)
        captureTimeout = null
        resultTimeout = null
        val old = recognizer
        recognizer = null
        runCatching { old?.cancel() }
        runCatching { old?.destroy() }
        audioOwner?.let(VoiceAudioGate::release); audioOwner = null
        BackgroundWake.localHoldUntil = 0L
        BackgroundWake.cooldownUntil = android.os.SystemClock.elapsedRealtime() + 5000L
    }

    fun checkLanguage(language: String, download: Boolean = false) {
        if (destroyed || !foreground || session.current() != null) return
        refreshState()
        if (Build.VERSION.SDK_INT < 33 || !JSONObject(cachedState).optBoolean("available")) {
            model(language, "unknown", "This device cannot check or download a language pack here. Use Android voice settings.")
            return
        }
        releaseProbe()
        val generation = probeGeneration
        try {
            val engine = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity)
            probe = engine
            engine.setRecognitionListener(SpeechListenerAdapter())
            probeTimeout = Runnable {
                if (generation == probeGeneration) {
                    model(language, "unknown", "The speech service did not return a language check. You can retry or use Android voice settings.")
                    releaseProbe()
                }
            }.also { handler.postDelayed(it, 15_000) }
            if (download) {
                engine.triggerModelDownload(recognitionIntent(language))
                model(language, "download_requested", "Language download requested from Android. It may need internet access or a system confirmation. Use Check language afterwards.")
                probeTimeout?.let(handler::removeCallbacks)
                probeTimeout = Runnable { if (generation == probeGeneration) releaseProbe() }.also { handler.postDelayed(it, 60_000) }
            } else {
                model(language, "checking", "Checking the selected offline language…")
                engine.checkRecognitionSupport(recognitionIntent(language), activity.mainExecutor, object : RecognitionSupportCallback {
                    override fun onSupportResult(support: RecognitionSupport) {
                        if (generation != probeGeneration || destroyed) return
                        val installed = support.installedOnDeviceLanguages.any { it.equals(language, true) }
                        val pending = support.pendingOnDeviceLanguages.any { it.equals(language, true) }
                        val supported = support.supportedOnDeviceLanguages.any { it.equals(language, true) }
                        model(language, when { installed -> "installed"; pending -> "pending"; supported -> "downloadable"; else -> "unsupported" }, when {
                            installed -> "This language pack is installed for on-device recognition."
                            pending -> "Android reports that this language pack is waiting to download."
                            supported -> "This language is supported but its offline pack needs downloading."
                            else -> "Android did not list this language for offline use. Choose another language or check Android voice settings."
                        })
                        releaseProbe()
                    }
                    override fun onError(error: Int) {
                        if (generation != probeGeneration || destroyed) return
                        model(language, "unknown", "Android could not check this language (code $error). An on-device recognition attempt is still available.")
                        releaseProbe()
                    }
                })
            }
        } catch (_: Exception) {
            model(language, "unknown", "The on-device service could not check or download this language. Try Android voice settings.")
            releaseProbe()
        }
    }

    private fun releaseProbe() {
        probeGeneration++
        probeTimeout?.let(handler::removeCallbacks)
        probeTimeout = null
        val old = probe
        probe = null
        runCatching { old?.destroy() }
    }

    private fun recognitionIntent(language: String) = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }

    private fun event(type: String, id: String, text: String = "", message: String = "") {
        if (!destroyed) emit(JSONObject().put("type", type).put("sessionId", id).put("text", text).put("message", message))
    }
    private fun model(language: String, state: String, message: String) {
        if (!destroyed) emit(JSONObject().put("type", "model").put("language", language).put("state", state).put("message", message))
    }
}

open class SpeechListenerAdapter : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onError(error: Int) {}
    override fun onResults(results: Bundle?) {}
    override fun onPartialResults(partialResults: Bundle?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
}
