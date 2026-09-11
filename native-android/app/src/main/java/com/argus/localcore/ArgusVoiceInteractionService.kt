package com.argus.localcore

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession

// Android binds this only after the user selects Argus as the digital assistant.
class ArgusVoiceInteractionService : VoiceInteractionService() {
    private var destroyed = false
    override fun onReady() {
        super.onReady()
        if (destroyed) return
        active = this
        setDisabledShowContext(VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT)
        BackgroundWake.ensureStarted(this)
    }
    override fun onShutdown() { if (active === this) active = null; super.onShutdown() }
    override fun onDestroy() { destroyed = true; if (active === this) active = null; super.onDestroy() }
    override fun onShowSessionFailed(args: Bundle) {
        BackgroundWake.update("detected", "Android could not open Command. Tap the Hey Argus notification to continue.")
    }
    companion object {
        private var active: ArgusVoiceInteractionService? = null
        fun showWake(context: Context, token: String): Boolean {
            val service = active ?: return false
            if (!BackgroundWake.assistantActive(context) || !BackgroundWake.unlocked(context)) return false
            return runCatching {
                service.showSession(Bundle().apply { putString(BackgroundWake.EXTRA, token) }, 0)
                true
            }.getOrDefault(false)
        }
    }
}
