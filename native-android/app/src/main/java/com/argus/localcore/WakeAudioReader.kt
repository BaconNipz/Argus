package com.argus.localcore

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import com.k2fsa.sherpa.onnx.*
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

data class WakeAudioResult(val detected: Boolean, val error: String, val audioMs: Long, val elapsedMs: Long)

// Only the worker calling read() owns engine, stream and recorder. No audio is persisted.
object WakeAudioReader {
    fun read(context: Context, owner: String, tuning: WakeSensitivity, stopped: () -> Boolean,
             listening: () -> Unit, level: (Double, Double) -> Unit): WakeAudioResult {
        if (!VoiceAudioGate.acquire(owner)) return WakeAudioResult(false, "Another Argus audio operation is active.", 0, 0)
        var engine: KeywordSpotter? = null
        var stream: OnlineStream? = null
        var recorder: AudioRecord? = null
        var samples = 0L
        var detected = false
        var error = ""
        val started = SystemClock.elapsedRealtime()
        try {
            if (!stopped()) {
                engine = KeywordSpotter(context.assets, KeywordSpotterConfig(
                    featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
                    modelConfig = OnlineModelConfig(transducer = OnlineTransducerModelConfig(
                        "wake-model/encoder.onnx", "wake-model/decoder.onnx", "wake-model/joiner.onnx"),
                        tokens = "wake-model/tokens.txt", modelType = "zipformer2", numThreads = 1, provider = "cpu"),
                    keywordsFile = "wake-model/keywords.txt", keywordsScore = tuning.score,
                    keywordsThreshold = tuning.threshold, maxActivePaths = 4, numTrailingBlanks = 2))
                stream = engine.createStream()
                check(stream.ptr != 0L)
                val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                check(minimum > 0)
                recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, maxOf(6400, minimum * 2))
                check(recorder.state == AudioRecord.STATE_INITIALIZED)
                if (!stopped()) {
                    recorder.startRecording()
                    check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING)
                    listening()
                    val buffer = ShortArray(1600)
                    var checked = 0L
                    var sumSquares = 0.0
                    var peak = 0.0
                    var meterSamples = 0
                    while (!stopped()) {
                        val read = recorder.read(buffer, 0, buffer.size, AudioRecord.READ_NON_BLOCKING)
                        check(read >= 0)
                        if (read == 0) { Thread.sleep(15); continue }
                        samples += read
                        val wave = FloatArray(read) { i ->
                            val sample = buffer[i] / 32768f
                            sumSquares += sample * sample
                            peak = max(peak, kotlin.math.abs(sample.toDouble()))
                            sample
                        }
                        meterSamples += read
                        val now = SystemClock.elapsedRealtime()
                        if (now - checked >= 1000) {
                            if (Build.VERSION.SDK_INT >= 29 && recorder.activeRecordingConfiguration?.isClientSilenced == true) {
                                error = "Android silenced this microphone. Pause Hey Argus and close other recording apps before retrying."
                                break
                            }
                            level(20 * log10(max(0.00001, sqrt(sumSquares / maxOf(1, meterSamples)))), peak)
                            sumSquares = 0.0; peak = 0.0; meterSamples = 0; checked = now
                        }
                        stream.acceptWaveform(wave, 16000)
                        while (!stopped() && engine.isReady(stream)) {
                            engine.decode(stream)
                            if (engine.getResult(stream).keyword == "hey_argus") { detected = true; break }
                        }
                        if (detected) break
                    }
                }
            }
        } catch (_: Throwable) {
            error = "Wake listening could not continue. Check microphone privacy, permissions and other recording apps."
        } finally {
            runCatching { recorder?.stop() }; runCatching { recorder?.release() }
            runCatching { stream?.release() }; runCatching { engine?.release() }
            VoiceAudioGate.release(owner)
        }
        return WakeAudioResult(detected && !stopped(), error, samples / 16, SystemClock.elapsedRealtime() - started)
    }
}
