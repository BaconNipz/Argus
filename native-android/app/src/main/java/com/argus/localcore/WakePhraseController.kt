package com.argus.localcore

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

// Foreground-only, explicitly armed, one-detection prototype. Audio stays in short memory buffers.
class WakePhraseController(private val activity: MainActivity, private val emit: (JSONObject) -> Unit) {
    private class Operation(val id: String, val deadline: Long) {
        val stop = AtomicBoolean(false)
        @Volatile var reason = "Wake listening stopped."
    }

    private val handler = Handler(Looper.getMainLooper())
    private val session = WakeSession()
    private var operation: Operation? = null
    private var foreground = false
    private var destroyed = false
    private var deadlineTask: Runnable? = null
    private var handoffTask: Runnable? = null
    private var message = "Wake mode is off. Start a five-minute test when you are ready."
    private var micDb = -100.0
    private var micPeak = 0.0
    private var lastAudioMs = 0L
    private var lastElapsedMs = 0L
    private var selectedSensitivity = "standard"
    private val modelAvailable = runCatching {
        activity.assets.list("wake-model").orEmpty().toSet().containsAll(
            setOf("encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt", "keywords.txt"))
    }.getOrDefault(false)
    @Volatile private var cachedState = "{}"

    init { publish() }

    fun snapshot(): String = cachedState
    fun isBusy(): Boolean = operation != null || session.busy()
    fun resume() { foreground = true; publish() }
    fun pause() { foreground = false; cancel(message = "Wake mode stopped because Argus left the foreground.") }

    fun destroy() {
        pause()
        destroyed = true
        handler.removeCallbacksAndMessages(null)
    }

    fun start(id: String, sensitivity: String) {
        if (destroyed) return
        val tuning = WakePolicy.sensitivity(sensitivity)
        val unavailable = when {
            !foreground -> "Keep Argus open to start a wake test."
            !modelAvailable -> "The wake model is missing. Install the complete v0.13 Android build."
            activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED -> "Allow microphone access in Speak a command first."
            activity.offlineSpeech.isCapturing() -> "Finish the current speech capture first."
            BackgroundWake.running -> "Pause background Hey Argus before the five-minute test."
            isBusy() -> "Stop the current wake test before starting another."
            else -> null
        }
        if (unavailable != null) {
            emit(JSONObject().put("type", "wake_rejected").put("sessionId", id).put("message", unavailable))
            return
        }
        if (!session.begin(id, SystemClock.elapsedRealtime())) return
        activity.offlineTts.stop(message = "Spoken reply stopped for wake listening.")
        activity.setVoiceScreenAwake("wake", true)
        selectedSensitivity = sensitivity
        lastAudioMs = 0
        lastElapsedMs = 0
        message = "Loading the offline wake model…"
        val op = Operation(id, session.deadline)
        operation = op
        deadlineTask = Runnable { cancel(id, "The five-minute wake test ended. Tap Listen for Hey Argus to start another.") }
            .also { handler.postDelayed(it, WakePolicy.WINDOW_MS) }
        publish()
        thread(name = "ArgusWake", isDaemon = true) { listen(op, tuning) }
    }

    fun cancel(id: String? = null, message: String = "Wake mode stopped. The microphone is being released.") {
        if (id != null && id != session.id) return
        if (!session.stop(session.id)) return
        this.message = message
        clearTimers()
        activity.setVoiceScreenAwake("wake", false)
        val op = operation
        if (op != null) {
            op.reason = message
            op.stop.set(true)
            // The worker uses non-blocking reads and owns all native/audio resources.
        } else session.complete(session.id, "cancelled", SystemClock.elapsedRealtime())
        publish()
    }

    fun startCommand(wakeId: String, speechId: String, language: String) {
        if (destroyed || operation != null || !session.claim(wakeId, SystemClock.elapsedRealtime(), foreground)) {
            activity.emitSpeechEvent(JSONObject().put("type", "error").put("sessionId", speechId)
                .put("message", "That wake request expired or was cancelled. Tap Start listening or start another wake test."))
            return
        }
        clearTimers()
        message = "Hey Argus heard. Wake mode is off while you speak and review the command."
        publish()
        try { activity.offlineSpeech.start(speechId, language, wakeReadyCue = true) }
        finally { activity.setVoiceScreenAwake("wake", false) }
    }

    private fun listen(op: Operation, tuning: WakeSensitivity) {
        val read = WakeAudioReader.read(activity.applicationContext, op.id, tuning,
            stopped = { op.stop.get() || SystemClock.elapsedRealtime() >= op.deadline },
            listening = { handler.post {
                if (!destroyed && operation === op && foreground && session.listening(op.id)) {
                    message = "Listening for Hey Argus. Pause after the phrase and wait for the vibration."
                    publish()
                }
            } }, level = { rms, peak -> handler.post {
                if (!destroyed && operation === op) { micDb = rms; micPeak = peak; publish() }
            } })
        val result = if (read.error.isNotEmpty()) "error" else if (read.detected) "detected" else "expired"
        val detail = if (read.detected) "Hey Argus heard." else read.error
        handler.post {
            if (destroyed || operation !== op) return@post
            operation = null
            deadlineTask?.let(handler::removeCallbacks)
            deadlineTask = null
            lastAudioMs = read.audioMs
            lastElapsedMs = read.elapsedMs
            session.complete(op.id, if (op.stop.get()) "cancelled" else result, SystemClock.elapsedRealtime())
            message = when {
                op.stop.get() -> op.reason
                session.phase == "expired" -> "The five-minute wake test ended. Start another when ready."
                session.phase == "error" -> "Wake listening could not continue. Check microphone access and try again."
                else -> detail
            }
            if (session.phase == "detected" && foreground) {
                handoffTask = Runnable { cancel(op.id, "The wake handoff expired. Start a new test or tap Start listening.") }
                    .also { handler.postDelayed(it, WakePolicy.HANDOFF_MS) }
            } else activity.setVoiceScreenAwake("wake", false)
            publish()
        }
    }

    private fun clearTimers() {
        deadlineTask?.let(handler::removeCallbacks)
        handoffTask?.let(handler::removeCallbacks)
        deadlineTask = null
        handoffTask = null
    }

    private fun publish() {
        if (destroyed) return
        val value = JSONObject().put("type", "wake_state").put("sessionId", session.id).put("phase", session.phase)
            .put("available", modelAvailable).put("message", message).put("sensitivity", selectedSensitivity)
            .put("micDb", micDb).put("micPeak", micPeak)
            .put("windowSeconds", WakePolicy.WINDOW_MS / 1000).put("audioMs", lastAudioMs).put("elapsedMs", lastElapsedMs)
        cachedState = value.toString()
        emit(value)
    }

}
