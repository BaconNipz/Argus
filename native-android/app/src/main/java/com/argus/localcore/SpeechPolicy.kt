package com.argus.localcore

object SpeechPolicy {
    fun canUseOnDevice(api: Int, available: Boolean): Boolean = api >= 31 && available

    fun firstTranscript(candidates: List<String>?): String =
        candidates?.firstOrNull { it.isNotBlank() }?.trim()?.take(4000).orEmpty()

    fun errorMessage(code: Int): String = when (code) {
        1, 2, 4, 11 -> "The on-device speech service failed. Try again or type your command. Argus has not switched to online recognition."
        3 -> "The microphone could not be opened. Check microphone access and close any other recording app."
        5 -> "Speech input stopped before a result was available. Try again."
        6 -> "No speech was heard. Tap Start listening and try again."
        7 -> "That speech was not recognised. Try again or type your command."
        8 -> "The speech service is busy. Wait a moment and try again."
        9 -> "Microphone permission is missing. Allow it in Argus app permissions."
        10 -> "The speech service has received too many requests. Wait before trying again."
        12 -> "This language is not supported by the on-device service. Choose another language."
        13 -> "This offline language pack is not installed. Check or download the selected language, then try again."
        else -> "Offline speech input could not finish (code $code). You can still type your command."
    }
}

// Invalidating a session makes late Android callbacks harmless after cancellation or a restart.
class SpeechSession {
    private var active: String? = null
    fun begin(id: String): Boolean {
        if (active != null) return false
        active = id
        return true
    }
    fun accepts(id: String): Boolean = active == id
    fun finish(id: String): Boolean {
        if (!accepts(id)) return false
        active = null
        return true
    }
    fun current(): String? = active
}
