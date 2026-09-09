package com.argus.localcore

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** All engine operations and listener state changes are serialized on the main thread. */
class OfflineTtsController(private val activity: MainActivity, private val emit: (JSONObject) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs = activity.getSharedPreferences("argus_voice_output", Context.MODE_PRIVATE)
    private val audio = activity.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val session = SpeechSession()
    private var engine: TextToSpeech? = null
    private var ready = false
    private var foreground = false
    private var destroyed = false
    private var generation = 0
    private var selected = ""
    private var voices = emptyList<Voice>()
    private var focus: AudioFocusRequest? = null
    private var timeout: Runnable? = null
    private var initTimeout: Runnable? = null
    @Volatile private var cachedState = "{}"

    fun snapshot(): String = cachedState
    fun resume() { foreground = true; initialize() }
    fun pause() { foreground = false; stop(message = "Spoken reply stopped because Argus left the foreground.") }
    fun destroy() { pause(); destroyed = true; releaseEngine(); handler.removeCallbacksAndMessages(null) }

    fun initialize() {
        if (destroyed || !foreground) return
        stop()
        releaseEngine()
        val token = generation
        publish("Starting Android speech output…")
        try {
            engine = TextToSpeech(activity.applicationContext) { status -> handler.post {
                if (destroyed || token != generation) return@post
                initTimeout?.let(handler::removeCallbacks)
                initTimeout = null
                if (status != TextToSpeech.SUCCESS) { releaseEngine(); publish("Android speech output could not start. Check text-to-speech settings, then refresh."); return@post }
                try {
                    ready = true
                    val tts = engine ?: return@post
                    tts.setAudioAttributes(attributes)
                    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(id: String) { handler.post { if (session.accepts(id)) event("speaking", id, "Speaking with the selected offline voice.") } }
                        override fun onDone(id: String) { handler.post { finish(id, "done", "Spoken reply finished.") } }
                        @Deprecated("Android compatibility callback")
                        override fun onError(id: String) { onError(id, TextToSpeech.ERROR) }
                        override fun onError(id: String, code: Int) { handler.post {
                            finish(id, "error", if (code == TextToSpeech.ERROR_NOT_INSTALLED_YET)
                                "This voice is not fully installed. Open text-to-speech settings, install its data and refresh."
                                else "Speech output failed (code $code). The reply is still available as text.")
                        } }
                        override fun onStop(id: String, interrupted: Boolean) { handler.post { finish(id, "stopped", "Spoken reply stopped.") } }
                    })
                    refreshVoices()
                } catch (_: Exception) {
                    releaseEngine()
                    publish("Android could not inspect its speech voices. Check text-to-speech settings and refresh.")
                }
            } }
            initTimeout = Runnable {
                if (token == generation && !ready) { releaseEngine(); publish("Speech output took too long to start. Check Android text-to-speech settings and refresh.") }
            }.also { handler.postDelayed(it, 10_000) }
        } catch (_: Exception) { releaseEngine(); publish("No usable Android speech-output engine was found. Check text-to-speech settings.") }
    }

    private fun candidate(voice: Voice) = OfflineVoiceCandidate(voice.name, voice.locale.toLanguageTag(),
        voice.isNetworkConnectionRequired, voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED), voice.quality)

    private fun preferenceKey() = "voice:${engine?.defaultEngine.orEmpty()}"

    private fun refreshVoices() {
        val tts = engine ?: return
        voices = runCatching { tts.voices.orEmpty().filter { OfflineVoicePolicy.eligible(candidate(it)) }
            .sortedWith(compareBy<Voice> { it.locale.displayName }.thenBy { it.name }) }.getOrDefault(emptyList())
        selected = OfflineVoicePolicy.choose(voices.map(::candidate), prefs.getString(preferenceKey(), null), Locale.getDefault().toLanguageTag()).orEmpty()
        publish(when {
            voices.isEmpty() -> "No installed offline voice is available in the current engine. Open text-to-speech settings to install a voice or choose an engine, then refresh."
            selected.isBlank() -> "Choose an installed offline voice below. Your previous or phone-language voice is unavailable."
            else -> "An installed offline voice is selected. Tap Test voice or Speak Reply to hear it."
        })
    }

    fun selectVoice(name: String) {
        if (!ready || destroyed) return
        stop()
        if (voices.none { it.name == name }) { publish("That offline voice is unavailable. Refresh voices and choose again."); return }
        selected = name
        prefs.edit().putString(preferenceKey(), name).apply()
        publish("Offline voice selected. Tap Test voice to check it.")
    }

    fun speak(id: String, text: String) {
        if (destroyed) return
        if (!foreground) { event("error", id, "Open Command before starting a spoken reply."); return }
        if (activity.offlineSpeech.isCapturing()) { event("error", id, "Finish or cancel speech input before playing a reply."); return }
        if (text.isBlank() || text.length > TextToSpeech.getMaxSpeechInputLength()) {
            event("error", id, "This reply is empty or too long to speak. Read it on screen."); return
        }
        stop()
        val tts = engine
        val voice = if (ready) runCatching { tts?.voices?.firstOrNull { it.name == selected && OfflineVoicePolicy.eligible(candidate(it)) } }.getOrNull() else null
        if (tts == null || voice == null) { event("error", id, "Choose an installed offline voice and try again. Argus has not switched to online speech output."); return }
        try {
            // Recheck on every utterance. Never call setLanguage(), which may select another voice/download data.
            check(tts.setVoice(voice) == TextToSpeech.SUCCESS)
            val activeVoice = tts.voice
            check(activeVoice != null && activeVoice.name == voice.name && OfflineVoicePolicy.eligible(candidate(activeVoice)))
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change ->
                    if (change < 0 && session.accepts(id)) stop(id, "Spoken reply stopped because another app needs audio.")
                }, handler).build()
            focus = request
            if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                releaseFocus(); event("error", id, "Audio is in use. Try the spoken reply again in a moment."); return
            }
            session.begin(id)
            event("starting", id, "Preparing the spoken reply…")
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) != TextToSpeech.SUCCESS) {
                finish(id, "error", "Android could not queue this reply. Read it on screen or try again."); return
            }
            timeout = Runnable { if (session.accepts(id)) stop(message = "Spoken reply stopped after the playback time limit.") }
                .also { handler.postDelayed(it, 120_000) }
        } catch (_: Exception) {
            if (session.accepts(id)) finish(id, "error", "The selected offline voice could not speak. Check voice settings and try again.")
            else { releaseFocus(); event("error", id, "The selected offline voice is unavailable. Refresh voices and try again.") }
        }
    }

    fun stop(id: String? = null, message: String = "Spoken reply stopped.") {
        val active = session.current() ?: return
        if (id != null && id != active) return
        // Invalidate first: stop() may synchronously/asynchronously emit a terminal callback.
        session.finish(active)
        clearTimeout()
        runCatching { engine?.stop() }
        releaseFocus()
        event("stopped", active, message)
    }

    private fun finish(id: String, type: String, message: String) {
        if (!session.finish(id)) return
        clearTimeout()
        if (type == "error") runCatching { engine?.stop() }
        releaseFocus()
        event(type, id, message)
    }

    private fun clearTimeout() { timeout?.let(handler::removeCallbacks); timeout = null }
    private fun releaseFocus() { focus?.let { runCatching { audio.abandonAudioFocusRequest(it) } }; focus = null }
    private fun releaseEngine() {
        generation++
        initTimeout?.let(handler::removeCallbacks); initTimeout = null
        runCatching { engine?.shutdown() }
        engine = null; ready = false; voices = emptyList(); selected = ""
    }
    private fun event(type: String, id: String, message: String) {
        if (!destroyed) emit(JSONObject().put("type", type).put("sessionId", id).put("message", message))
    }
    private fun publish(message: String) {
        val state = JSONObject().put("status", "completed").put("type", "capabilities").put("ready", ready)
            .put("available", ready && selected.isNotBlank()).put("selectedVoice", selected)
            .put("voices", JSONArray(voices.map { JSONObject().put("id", it.name)
                .put("label", "${it.locale.displayName} — ${it.name}").put("language", it.locale.toLanguageTag()) }))
            .put("message", message).put("mediaVolume", audio.getStreamVolume(AudioManager.STREAM_MUSIC))
        cachedState = state.toString()
        if (!destroyed) emit(state)
    }
}
