package com.argus.localcore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class BackgroundWakeService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val cancelled = AtomicBoolean(false)
    private var workerStarted = false
    private var lastStatus = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        active = this
        BackgroundWake.initialize(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Hey Argus listening", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Ongoing offline wake listening and its Pause control"
                setShowBadge(false)
            })
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            BackgroundWake.configure(this, false, BackgroundWake.sensitivity, BackgroundWake.autoRun)
            stopSelf(); return START_NOT_STICKY
        }
        if (!BackgroundWake.enabled || BackgroundWake.requirements(this) != null) { stopSelf(); return START_NOT_STICKY }
        try { startForeground(ID, notification("Starting offline Hey Argus…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) }
        catch (_: Exception) { BackgroundWake.update("error", "Android denied microphone service access. Reopen Command to check setup."); stopSelf(); return START_NOT_STICKY }
        if (!BackgroundWake.enabled || BackgroundWake.requirements(this) != null) { stopSelf(); return START_NOT_STICKY }
        if (workerStarted) return START_NOT_STICKY
        workerStarted = true
        BackgroundWake.running = true
        thread(name = "ArgusBackgroundWake", isDaemon = true) {
            try { runListener() }
            finally { handler.post { stopSelf() } }
        }
        return START_NOT_STICKY
    }

    private fun runListener() {
        val owner = "background-audio-${SystemClock.elapsedRealtime()}"
        while (!cancelled.get() && BackgroundWake.enabled) {
            if (!BackgroundWake.notificationsAllowed(this)) {
                status("error", "Hey Argus notifications were disabled. Enable them in Settings and retry.")
                break
            }
            if (!BackgroundWake.canListen(this) || VoiceAudioGate.busy()) {
                status("waiting", when {
                    !BackgroundWake.unlocked(this) -> "Paused while the screen is off or locked. Listening resumes after unlock."
                    BackgroundWake.pending() -> "Hey Argus heard. Finish the command before the next wake phrase."
                    else -> "Waiting for the current audio or command to finish…"
                })
                Thread.sleep(250)
                continue
            }
            status("starting", "Loading offline wake listening…")
            val generation = BackgroundWake.generation
            val read = WakeAudioReader.read(applicationContext, owner, WakePolicy.sensitivity(BackgroundWake.sensitivity),
                stopped = { cancelled.get() || generation != BackgroundWake.generation || !BackgroundWake.canListen(this) },
                listening = { status("listening", "Listening for Hey Argus while you use your phone.") },
                level = { db, peak -> BackgroundWake.level(db, peak) })
            if (cancelled.get() || !BackgroundWake.enabled) break
            if (read.error.isNotEmpty()) { status("error", read.error); break }
            if (read.detected) {
                BackgroundWake.cooldownUntil = SystemClock.elapsedRealtime() + 3000L
                handler.post {
                    if (cancelled.get()) return@post
                    val token = BackgroundWake.detection(this) ?: return@post
                    val shown = ArgusVoiceInteractionService.showWake(this, token)
                    val detail = if (shown) "Hey Argus heard. Opening Command…" else "Hey Argus heard. Tap this notification to speak."
                    BackgroundWake.update("detected", detail)
                    getSystemService(NotificationManager::class.java).notify(ID, notification(detail, token))
                }
                // Keep the worker idle until the main thread offers the ticket.
                Thread.sleep(500)
            }
        }
    }

    private fun status(phase: String, detail: String) {
        if (lastStatus == detail) return
        lastStatus = detail
        handler.post {
            if (!cancelled.get()) {
                BackgroundWake.update(phase, detail)
                getSystemService(NotificationManager::class.java).notify(ID, notification(detail, BackgroundWake.pendingToken()))
            }
        }
    }

    private fun notification(detail: String, token: String = ""): Notification {
        val open = Intent(this, MainActivity::class.java).setAction(if (token.isEmpty()) CommandLaunchQueue.ACTION else BackgroundWake.ACTION)
            .putExtra(BackgroundWake.EXTRA, token).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val content = PendingIntent.getActivity(this, 740, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 741, Intent(this, BackgroundWakeService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_command).setContentTitle("Hey Argus")
            .setContentText(detail).setStyle(Notification.BigTextStyle().bigText(detail)).setContentIntent(content)
            .setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(Notification.Action.Builder(null, "Pause Hey Argus", stop).build()).build()
    }

    override fun onDestroy() {
        cancelled.set(true)
        if (active === this) {
            active = null
            BackgroundWake.running = false
            BackgroundWake.cancelClaim()
            if (BackgroundWake.phase != "error") BackgroundWake.update("off", "Background listening stopped. Open Command to resume it.")
        }
        handler.removeCallbacksAndMessages(null)
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        private var active: BackgroundWakeService? = null
        const val CHANNEL = "argus_background_voice_v1"
        private const val ID = 740
        private const val STOP = "com.argus.localcore.STOP_BACKGROUND_WAKE"
    }
}
