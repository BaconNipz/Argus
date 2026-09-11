package com.argus.localcore

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import android.speech.SpeechRecognizer
import org.json.JSONObject
import java.util.UUID

// One process owns the ticket. Intent extras can name it, but cannot create capture authority.
object BackgroundWake {
    const val PREFS = "argus_background_voice"
    const val ACTION = "com.argus.localcore.BACKGROUND_WAKE"
    const val EXTRA = "argus_wake_token"
    private val handler = Handler(Looper.getMainLooper())
    private val ticket = BackgroundWakeTicket()
    private var app: Context? = null
    private var loaded = false
    private var captureOwner: Context? = null
    private var listenerOwner: Any? = null
    @Volatile var enabled = false
        private set
    @Volatile var running = false
    @Volatile var sensitivity = "sensitive"
        private set
    @Volatile var autoRun = true
        private set
    @Volatile var localHoldUntil = 0L
    @Volatile var cooldownUntil = 0L
    @Volatile var generation = 0
    @Volatile var phase = "off"
        private set
    @Volatile private var message = "Set up background Hey Argus when ready."
    @Volatile private var micDb = -100.0
    @Volatile private var micPeak = 0.0
    @Volatile private var screenCheckedAt = -1000L
    @Volatile private var screenAllowsListening = false
    private var listener: (() -> Unit)? = null
    fun attach(owner: Any, callback: () -> Unit) { listenerOwner = owner; listener = callback }
    fun detach(owner: Any) { if (listenerOwner === owner) { listenerOwner = null; listener = null } }

    @Synchronized fun initialize(context: Context) {
        app = context.applicationContext
        if (loaded) return
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        enabled = p.getBoolean("enabled", false)
        sensitivity = p.getString("sensitivity", "sensitive")?.takeIf { it in listOf("standard", "sensitive") } ?: "sensitive"
        autoRun = p.getBoolean("autoRun", true)
        loaded = true
    }

    fun unlocked(context: Context): Boolean = context.getSystemService(PowerManager::class.java).isInteractive &&
        !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

    fun assistantActive(context: Context): Boolean = runCatching {
        VoiceInteractionService.isActiveService(context, ComponentName(context, ArgusVoiceInteractionService::class.java))
    }.getOrDefault(false)

    fun notificationsAllowed(context: Context): Boolean {
        val n = context.getSystemService(NotificationManager::class.java)
        return n.areNotificationsEnabled() && n.getNotificationChannel(BackgroundWakeService.CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun requirements(context: Context): String? = when {
        Build.VERSION.SDK_INT < 31 -> "Background voice commands need Android 12 or later."
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED -> "Allow microphone access first."
        !notificationsAllowed(context) -> "Enable Argus notifications and its Hey Argus category first."
        !SpeechRecognizer.isOnDeviceRecognitionAvailable(context) -> "Set up an available on-device speech service first."
        else -> null
    }

    fun configure(context: Context, wanted: Boolean, mode: String, executeLocal: Boolean) {
        initialize(context)
        WakePolicy.sensitivity(mode)
        if (wanted) requirements(context)?.let { throw IllegalStateException(it) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", wanted).putString("sensitivity", mode).putBoolean("autoRun", executeLocal).apply()
        enabled = wanted; sensitivity = mode; autoRun = executeLocal; generation++
        ticket.clear(); captureOwner = null
        cooldownUntil = SystemClock.elapsedRealtime() + 1000L
        if (wanted) ensureStarted(context) else {
            context.stopService(Intent(context, BackgroundWakeService::class.java))
            update("off", "Hey Argus is paused. It will stay off until you enable it again.")
        }
        publish()
    }

    fun ensureStarted(context: Context) {
        initialize(context)
        if (!enabled || running) return
        val problem = requirements(context)
        if (problem != null) { update("error", problem); return }
        try { context.startForegroundService(Intent(context, BackgroundWakeService::class.java)) }
        catch (_: Exception) { update("error", "Android could not start background listening. Open Command and tap Enable or Retry.") }
    }

    fun requestAssistant(activity: MainActivity) {
        check(activity.commandAccessForeground) { "Open Argus first." }
        if (Build.VERSION.SDK_INT >= 29) {
            val roles = activity.getSystemService(RoleManager::class.java)
            if (roles.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !roles.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
                activity.startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT), 706)
                return
            }
        }
        activity.startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS))
    }

    @Synchronized fun pendingToken(): String = if (ticket.active(SystemClock.elapsedRealtime()) && !ticket.claimed) ticket.token else ""
    @Synchronized fun pending(): Boolean {
        val active = ticket.active(SystemClock.elapsedRealtime())
        if (!active) captureOwner = null
        return active
    }
    @Synchronized fun detection(context: Context): String? {
        if (!enabled || !unlocked(context)) return null
        val token = "background-${UUID.randomUUID()}"
        if (!ticket.offer(token, SystemClock.elapsedRealtime())) return null
        handler.postDelayed({
            synchronized(this) {
                if (!ticket.active(SystemClock.elapsedRealtime())) {
                    cooldownUntil = SystemClock.elapsedRealtime() + 3000
                    listener?.invoke()
                }
            }
        }, 20_100L)
        return token
    }

    @Synchronized fun claim(context: Context, token: String, foreground: Boolean): Boolean {
        if (!enabled || !ticket.claim(token, SystemClock.elapsedRealtime(), foreground, unlocked(context))) return false
        captureOwner = context
        return true
    }

    @Synchronized fun finish(token: String) {
        if (ticket.finish(token)) {
            captureOwner = null
            cooldownUntil = SystemClock.elapsedRealtime() + 5000L
            publish()
        }
    }

    @Synchronized fun cancelClaim(owner: Context? = null) {
        if (owner != null && captureOwner !== owner) return
        if (ticket.claimed) { ticket.clear(); captureOwner = null; cooldownUntil = SystemClock.elapsedRealtime() + 5000L; publish() }
    }

    fun canListen(context: Context): Boolean {
        val now = SystemClock.elapsedRealtime()
        // Audio polling must not make dozens of lock-screen Binder calls per second.
        // Ticket creation/claim still checks the current lock state directly.
        if (now - screenCheckedAt >= 250L) { screenAllowsListening = unlocked(context); screenCheckedAt = now }
        return enabled && screenAllowsListening && !pending() && now >= maxOf(localHoldUntil, cooldownUntil)
    }

    fun update(next: String, detail: String) { phase = next; message = detail; publish() }
    fun level(db: Double, peak: Double) { micDb = db; micPeak = peak; publish() }
    private fun publish() { if (Looper.myLooper() == Looper.getMainLooper()) listener?.invoke() else handler.post { listener?.invoke() } }

    @Synchronized fun snapshot(context: Context): String {
        initialize(context)
        return JSONObject().put("enabled", enabled).put("running", running).put("phase", phase)
            .put("audioBusy", VoiceAudioGate.busy())
            .put("message", message).put("sensitivity", sensitivity).put("autoRun", autoRun)
            .put("assistantActive", assistantActive(context)).put("notificationGranted", notificationsAllowed(context))
            .put("microphoneGranted", context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
            .put("pendingToken", pendingToken()).put("micDb", micDb).put("micPeak", micPeak).toString()
    }
}
