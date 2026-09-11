package com.argus.localcore

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
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
        var engine: KeywordSpotter? = null
        var stream: OnlineStream? = null
        var recorder: AudioRecord? = null
        var result = "cancelled"
        var detail = "Wake mode stopped."
        var sampleCount = 0L
        val startedAt = SystemClock.elapsedRealtime()
        try {
            engine = KeywordSpotter(assetManager = activity.assets, config = KeywordSpotterConfig(
                featConfig = FeatureConfig(sampleRate = RATE, featureDim = 80),
                modelConfig = OnlineModelConfig(
                    transducer = OnlineTransducerModelConfig("wake-model/encoder.onnx", "wake-model/decoder.onnx", "wake-model/joiner.onnx"),
                    tokens = "wake-model/tokens.txt", modelType = "zipformer2", numThreads = 1, provider = "cpu", debug = false),
                keywordsFile = "wake-model/keywords.txt", keywordsScore = tuning.score,
                keywordsThreshold = tuning.threshold, maxActivePaths = 4, numTrailingBlanks = 2))
            if (!op.stop.get() && SystemClock.elapsedRealtime() < op.deadline) {
                stream = engine.createStream()
                check(stream.ptr != 0L) { "Could not create the wake stream." }
                val minimum = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                check(minimum > 0) { "Microphone format unavailable." }
                recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 2, 6400))
                check(recorder.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable." }
                if (!op.stop.get()) {
                    recorder.startRecording()
                    check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING)
                    handler.post {
                        if (!destroyed && operation === op && foreground && session.listening(op.id)) {
                            message = "Listening for Hey Argus. Say the phrase, pause, then wait for Listening before your command."
                            publish()
                        }
                    }
                    val buffer = ShortArray(1600)
                    var nextPrivacyCheck = 0L
                    while (!op.stop.get() && SystemClock.elapsedRealtime() < op.deadline) {
                        val now = SystemClock.elapsedRealtime()
                        if (Build.VERSION.SDK_INT >= 29 && now >= nextPrivacyCheck) {
                            check(recorder.activeRecordingConfiguration?.isClientSilenced != true) { "Microphone silenced." }
                            nextPrivacyCheck = now + 1000
                        }
                        val read = recorder.read(buffer, 0, buffer.size, AudioRecord.READ_NON_BLOCKING)
                        check(read >= 0) { "Microphone read failed." }
                        if (read == 0) { Thread.sleep(15); continue }
                        sampleCount += read
                        stream.acceptWaveform(FloatArray(read) { buffer[it] / 32768.0f }, RATE)
                        var detected = false
                        while (!op.stop.get() && engine.isReady(stream)) {
                            engine.decode(stream)
                            if (engine.getResult(stream).keyword == "hey_argus") { detected = true; break }
                        }
                        if (detected) { result = "detected"; detail = "Hey Argus heard."; break }
                    }
                }
            }
            if (!op.stop.get() && result != "detected") {
                result = "expired"
                detail = "The five-minute wake test ended. Start another when ready."
            }
        } catch (_: Throwable) {
            result = "error"
            detail = "Wake listening could not continue. Check microphone access and other recording apps, then try again."
        } finally {
            runCatching { recorder?.stop() }
            runCatching { recorder?.release() }
            runCatching { stream?.release() }
            runCatching { engine?.release() }
        }
        val elapsed = SystemClock.elapsedRealtime() - startedAt
        handler.post {
            if (destroyed || operation !== op) return@post
            operation = null
            deadlineTask?.let(handler::removeCallbacks)
            deadlineTask = null
            lastAudioMs = sampleCount * 1000 / RATE
            lastElapsedMs = elapsed
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
            .put("windowSeconds", WakePolicy.WINDOW_MS / 1000).put("audioMs", lastAudioMs).put("elapsedMs", lastElapsedMs)
        cachedState = value.toString()
        emit(value)
    }

    companion object { private const val RATE = 16000 }
}
