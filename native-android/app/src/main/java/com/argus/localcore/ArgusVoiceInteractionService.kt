package com.argus.localcore

import android.content.Context
import android.content.Intent
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
        val pending = BackgroundWake.pendingToken()
        if (pending.isNotEmpty()) openWake(this, pending)
    }
    override fun onShutdown() { if (active === this) active = null; super.onShutdown() }
    override fun onDestroy() { destroyed = true; if (active === this) active = null; super.onDestroy() }
    override fun onShowSessionFailed(args: Bundle) {
        BackgroundWake.handoff(args.getString(BackgroundWake.EXTRA).orEmpty(), "Android could not open Command. Tap the Hey Argus wake alert to continue.")
    }
    companion object {
        private var active: ArgusVoiceInteractionService? = null
        private var primaryToken = ""
        private var fallbackToken = ""
        fun isReady(): Boolean = active != null

        fun openWake(context: Context, token: String) {
            val decision = WakeLaunchPolicy.decide(token, BackgroundWake.pendingToken(), BackgroundWake.enabled,
                BackgroundWake.unlocked(context), BackgroundWake.commandVisible(), BackgroundWake.assistantActive(context), active != null)
            when (decision) {
                WakeLaunchDecision.IGNORE -> return
                WakeLaunchDecision.ALREADY_VISIBLE -> BackgroundWake.handoff(token, "Command is open. Preparing speech input…")
                WakeLaunchDecision.TAP_NOTIFICATION -> BackgroundWake.handoff(token, "Select Argus as your digital assistant for automatic opening. Tap the wake alert to speak this time.")
                WakeLaunchDecision.WAIT_FOR_ASSISTANT -> BackgroundWake.handoff(token, "Waiting for Android to connect the selected assistant. Tap the wake alert if Command does not open.")
                WakeLaunchDecision.OPEN_COMMAND -> {
                    if (primaryToken == token) return
                    primaryToken = token
                    BackgroundWake.handoff(token, "Opening Command. Wait for the ready beep and two vibrations.")
                    // Android binds the selected VoiceInteractionService with background activity
                    // launch permission. Launch from that bound service, reusing the normal app task.
                    // An ordinary microphone foreground service does not get this permission.
                    runCatching {
                        active?.startActivity(Intent(context, MainActivity::class.java).setAction(BackgroundWake.ACTION)
                            .putExtra(BackgroundWake.EXTRA, token)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP))
                    }.onFailure { showWake(context, token) }
                }
            }
        }

        fun showWake(context: Context, token: String): Boolean {
            val service = active ?: return false
            if (token == fallbackToken || token != BackgroundWake.pendingToken() || !BackgroundWake.enabled ||
                BackgroundWake.commandVisible() || !BackgroundWake.assistantActive(context) || !BackgroundWake.unlocked(context)) return false
            fallbackToken = token
            BackgroundWake.handoff(token, "Trying Android's assistant window. Wait for the ready cue, or tap the wake alert.")
            return runCatching {
                service.showSession(Bundle().apply { putString(BackgroundWake.EXTRA, token) }, 0)
                true
            }.getOrDefault(false)
        }
    }
}
