package com.argus.localcore

import java.util.Locale

data class OfflineVoiceCandidate(val name: String, val language: String, val networkRequired: Boolean,
    val notInstalled: Boolean, val quality: Int = 0)

object OfflineVoicePolicy {
    fun eligible(voice: OfflineVoiceCandidate): Boolean = !voice.networkRequired && !voice.notInstalled

    fun choose(voices: List<OfflineVoiceCandidate>, saved: String?, language: String): String? {
        val offline = voices.filter(::eligible)
        // If a saved voice disappears, ask the user to choose again instead of silently changing it.
        if (!saved.isNullOrBlank()) return offline.firstOrNull { it.name == saved }?.name
        val locale = Locale.forLanguageTag(language)
        return offline.filter { Locale.forLanguageTag(it.language).language == locale.language }
            .sortedWith(compareByDescending<OfflineVoiceCandidate> { it.language.equals(language, ignoreCase = true) }
                .thenByDescending { it.quality }.thenBy { it.name }).firstOrNull()?.name
    }
}
