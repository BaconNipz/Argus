package com.argus.localcore

import android.app.KeyguardManager
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

// A separate lightweight session process launches the assistant activity through Android.
class ArgusVoiceSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = object : VoiceInteractionSession(this) {
        override fun onPrepareShow(args: Bundle?, showFlags: Int) {
            super.onPrepareShow(args, showFlags)
            setUiEnabled(false)
        }
        override fun onShow(args: Bundle?, showFlags: Int) {
            super.onShow(args, showFlags)
            if (getSystemService(KeyguardManager::class.java).isKeyguardLocked) { finish(); return }
            val token = args?.getString(BackgroundWake.EXTRA).orEmpty()
            val intent = Intent(this@ArgusVoiceSessionService, MainActivity::class.java)
                .setAction(if (token.isEmpty()) CommandLaunchQueue.ACTION else BackgroundWake.ACTION)
                .putExtra(BackgroundWake.EXTRA, token)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            runCatching { startAssistantActivity(intent) }.onFailure { finish() }
        }
    }
}
