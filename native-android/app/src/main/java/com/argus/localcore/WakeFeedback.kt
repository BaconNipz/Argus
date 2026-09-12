package com.argus.localcore

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator

object WakeFeedback {
    const val CHANNEL = "argus_wake_events_v1"
    private val handler = Handler(Looper.getMainLooper())

    fun createChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Hey Argus wake alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Sound, vibration and banner when Hey Argus is detected"
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 100)
                setShowBadge(false)
            })
    }

    // A second, distinct cue means the command recognizer is actually ready.
    // Never change volume, silent mode or Do Not Disturb to play feedback.
    fun ready(context: Context) {
        val notifications = context.getSystemService(NotificationManager::class.java)
        if (notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return
        val audio = context.getSystemService(AudioManager::class.java)
        if (audio.ringerMode == AudioManager.RINGER_MODE_SILENT) return
        runCatching {
            context.getSystemService(Vibrator::class.java)?.vibrate(
                VibrationEffect.createWaveform(longArrayOf(0, 80, 80, 120), -1),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        }
        if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL || audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0) return
        runCatching {
            val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)
            try { tone.startTone(ToneGenerator.TONE_PROP_BEEP, 140) }
            finally { handler.postDelayed({ tone.release() }, 300L) }
        }
    }
}
