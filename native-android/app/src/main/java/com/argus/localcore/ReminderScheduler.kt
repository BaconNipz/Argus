package com.argus.localcore

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.graphics.drawable.Icon
import android.os.Build
import android.provider.Settings
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.TimeUnit

class ReminderScheduler(context: Context) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("argus_reminders", Context.MODE_PRIVATE)
    private val manager = app.getSystemService(NotificationManager::class.java)
    private val work = WorkManager.getInstance(app)

    init {
        // Existing channels keep the user's settings. Never delete/recreate a channel to raise importance.
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Argus reminders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Reminders and routines you enable in Argus"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            setSound(Settings.System.DEFAULT_NOTIFICATION_URI, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            enableVibration(true)
        })
    }

    fun notificationsEnabled(): Boolean =
        (Build.VERSION.SDK_INT < 33 || app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE

    fun state(): JSONObject = synchronized(LOCK) {
        val records = all()
        // Recover a persisted schedule if the process stopped between saving it and enqueueing work.
        for (record in records) {
            ensureScheduled(record)
        }
        JSONObject().put("status", "completed").put("notificationsEnabled", notificationsEnabled())
            .put("notificationSettings", alertSettings())
            .put("reminders", JSONArray(records))
    }

    private fun alertSettings(): JSONObject {
        val channel = manager.getNotificationChannel(CHANNEL)
        val audio = app.getSystemService(AudioManager::class.java)
        val sound = channel?.sound
        val hasSound = sound != null && (sound != Settings.System.DEFAULT_NOTIFICATION_URI ||
            RingtoneManager.getActualDefaultRingtoneUri(app, RingtoneManager.TYPE_NOTIFICATION) != null)
        return JSONObject().put("importance", channel?.importance ?: NotificationManager.IMPORTANCE_NONE)
            .put("soundConfigured", hasSound).put("vibration", channel?.shouldVibrate() == true)
            .put("ringerMode", when (audio.ringerMode) {
                AudioManager.RINGER_MODE_NORMAL -> "normal"
                AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
                else -> "silent"
            }).put("notificationVolume", audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION))
            .put("doNotDisturb", manager.currentInterruptionFilter in listOf(
                NotificationManager.INTERRUPTION_FILTER_PRIORITY, NotificationManager.INTERRUPTION_FILTER_NONE,
                NotificationManager.INTERRUPTION_FILTER_ALARMS))
    }

    fun testNotification(): JSONObject {
        require(notificationsEnabled()) { "Enable Argus notifications before sending a test alert." }
        postNotification("argus-alert-test", "Argus test alert", "This uses the same sound and banner settings as your reminders.")
        return JSONObject().put("status", "completed").put("message", "Test alert sent to Android. If it was quiet, review the alert status below.")
    }

    fun schedule(input: JSONObject): JSONObject = synchronized(LOCK) {
        require(notificationsEnabled()) { "Enable Argus notifications before scheduling a reminder." }
        val id = checkedId(input.optString("id"))
        val title = input.optString("title").trim()
        val note = input.optString("note").trim()
        val repeat = input.optString("repeat", "once")
        require(title.isNotBlank() && title.length <= 120) { "Enter a reminder title of 1–120 characters." }
        require(note.length <= 500) { "Keep the reminder note under 500 characters." }
        require(repeat in listOf("once", "daily", "weekly")) { "Choose once, daily or weekly." }
        val due = Instant.parse(input.getString("nextRunAt"))
        require(due.toEpochMilli() > System.currentTimeMillis()) { "Choose a future date and time." }
        val zone = ZoneId.of(input.optString("timeZone", ZoneId.systemDefault().id))
        val previous = read(id)
        val record = JSONObject().put("id", id).put("title", title).put("note", note).put("repeat", repeat)
            .put("timeZone", zone.id).put("wallTime", due.atZone(zone).toLocalTime().toString())
            .put("nextRunAt", due.toString()).put("enabled", true).put("status", "scheduled")
            .put("revision", UUID.randomUUID().toString())
            .put("notificationToken", "").put("snoozeToken", "").put("snoozedUntil", "")
            .put("createdAt", previous?.optString("createdAt") ?: input.optString("createdAt", Instant.now().toString()))
            .put("updatedAt", Instant.now().toString()).put("lastFiredAt", previous?.optString("lastFiredAt").orEmpty())
            .put("lastResult", "Scheduled on this phone. Android may delay delivery to save battery.")
        save(record)
        try {
            work.cancelUniqueWork(snoozeWorkName(id)).result.get()
            manager.cancel(id, NOTIFICATION_ID)
            enqueue(record, ExistingWorkPolicy.REPLACE)
        } catch (error: Exception) {
            record.put("enabled", false).put("status", "paused").put("lastResult", "Scheduling failed. Please enable again.")
            save(record)
            throw error
        }
        JSONObject().put("status", "completed").put("reminder", record)
    }

    fun cancel(input: JSONObject): JSONObject = synchronized(LOCK) {
        val id = checkedId(input.optString("id"))
        val record = read(id)
        // Change persisted state before cancellation so an already-starting worker becomes a no-op.
        if (record != null) {
            clearOccurrence(record)
            record.put("enabled", false).put("status", "paused").put("updatedAt", Instant.now().toString())
                .put("lastResult", "Paused. No further notifications are scheduled.")
            save(record)
        }
        work.cancelUniqueWork(workName(id)).result.get()
        work.cancelUniqueWork(snoozeWorkName(id)).result.get()
        manager.cancel(id, NOTIFICATION_ID)
        if (input.optBoolean("delete")) check(prefs.edit().remove(id).commit())
        JSONObject().put("status", "completed").put("reminder", record ?: JSONObject.NULL)
    }

    fun clear(): JSONObject = synchronized(LOCK) {
        // Workers always re-read these records under the same lock before notifying.
        check(prefs.edit().clear().commit())
        work.cancelAllWorkByTag(TAG).result.get()
        manager.cancelAll()
        JSONObject().put("status", "completed")
    }

    fun actOnNotification(input: JSONObject): JSONObject = synchronized(LOCK) {
        val id = checkedId(input.optString("id"))
        val record = read(id) ?: return@synchronized ignoredAction()
        val action = input.optString("action")
        val current = ReminderActionState(record.optString("revision"), record.optString("notificationToken"),
            record.getString("repeat"), record.optBoolean("enabled"), Instant.parse(record.getString("nextRunAt")).toEpochMilli(),
            record.optString("status"))
        val result = ReminderActionPolicy.apply(current, input.optString("revision"), input.optString("notificationToken"), action, System.currentTimeMillis())
        if (result == null) {
            // Also repairs the save/enqueue window after a process restart; it cannot revive paused records.
            ensureScheduled(record)
            return@synchronized ignoredAction()
        }
        if (action == "snooze" && !notificationsEnabled()) return@synchronized JSONObject().put("status", "blocked")
            .put("message", "Enable notifications before snoozing this reminder.")
        val before = JSONObject(record.toString())
        val now = Instant.now().toString()
        record.put("notificationToken", "").put("enabled", result.enabled).put("status", result.status)
            .put("nextRunAt", Instant.ofEpochMilli(result.nextRunAt).toString())
            .put("snoozedUntil", result.snoozedUntil?.let { Instant.ofEpochMilli(it).toString() } ?: "")
            .put("snoozeToken", if (action == "snooze") UUID.randomUUID().toString() else "")
            .put("lastAction", action).put("lastActionAt", now).put("updatedAt", now)
            .put("lastResult", if (action == "snooze") "Snoozed for 10 minutes. Any regular repeat keeps its usual time."
                else if (record.getString("repeat") == "once") "Marked done. This one-off reminder is complete."
                else "This occurrence is done. The routine remains scheduled for its next regular time.")
        save(record) // Consume the notification token before changing Android work or dismissing its card.
        try {
            if (action == "snooze") enqueueSnooze(record, ExistingWorkPolicy.REPLACE)
            else work.cancelUniqueWork(snoozeWorkName(id)).result.get()
            if (hasRegularSchedule(record)) enqueue(record, ExistingWorkPolicy.KEEP)
        } catch (error: Exception) {
            // Any partially enqueued snooze now carries a token that no longer matches.
            save(before)
            throw error
        }
        manager.cancel(id, NOTIFICATION_ID)
        JSONObject().put("status", "completed").put("reminder", record).put("message", record.getString("lastResult"))
    }

    private fun ignoredAction(): JSONObject = JSONObject().put("status", "ignored")
        .put("message", "That alert has already been handled or replaced. Current reminders are unchanged.")

    fun fire(id: String, revision: String, expectedTime: String) = synchronized(LOCK) {
        val record = read(id) ?: return@synchronized
        if (!hasRegularSchedule(record) || record.optString("revision") != revision || record.optString("nextRunAt") != expectedTime) return@synchronized
        val scheduled = Instant.parse(expectedTime).toEpochMilli()
        val now = System.currentTimeMillis()
        if (scheduled > now) {
            // A backwards clock change must not cause an early notification.
            enqueue(record, ExistingWorkPolicy.APPEND_OR_REPLACE)
            return@synchronized
        }
        if (!notificationsEnabled()) {
            clearOccurrence(record)
            record.put("enabled", false).put("status", "paused")
                .put("lastResult", "Notification permission was off when this was due. Enable notifications and reschedule.")
            save(record)
            return@synchronized
        }
        val hadSnooze = record.optString("snoozedUntil").isNotBlank()
        clearOccurrence(record)
        record.put("notificationToken", UUID.randomUUID().toString()).put("occurrenceAt", expectedTime)
        save(record)
        if (hadSnooze) work.cancelUniqueWork(snoozeWorkName(id)).result.get()
        try {
            postNotification(id, record.getString("title"), record.optString("note").ifBlank { "Tap to open Argus routines." }, record)
        } catch (_: SecurityException) {
            clearOccurrence(record)
            record.put("enabled", false).put("status", "paused").put("lastResult", "Notifications were blocked. Review Android notification settings.")
            save(record)
            return@synchronized
        }
        val next = ReminderSchedule.next(scheduled, record.getString("repeat"), record.getString("timeZone"), record.getString("wallTime"), now)
        record.put("lastFiredAt", Instant.ofEpochMilli(now).toString()).put("updatedAt", Instant.now().toString())
            .put("lastResult", "Notification posted to Android.").put("enabled", next != null)
            .put("status", if (next == null) "notified" else "scheduled")
        if (next != null) record.put("nextRunAt", Instant.ofEpochMilli(next).toString())
        save(record)
        if (next != null) enqueue(record, ExistingWorkPolicy.APPEND_OR_REPLACE)
    }

    fun fireSnooze(id: String, revision: String, expectedTime: String, token: String) = synchronized(LOCK) {
        val record = read(id) ?: return@synchronized
        if (!record.optBoolean("enabled") || record.optString("revision") != revision || token.isBlank() ||
            record.optString("snoozeToken") != token || record.optString("snoozedUntil") != expectedTime) return@synchronized
        val now = System.currentTimeMillis()
        if (ReminderActionPolicy.regularTakesPriority(record.getString("repeat"), Instant.parse(record.getString("nextRunAt")).toEpochMilli(), now)) {
            // A newer regular occurrence supersedes an older snooze, including after a long battery delay.
            clearOccurrence(record)
            record.put("status", "scheduled")
            save(record)
            fire(id, revision, record.getString("nextRunAt"))
            return@synchronized
        }
        if (Instant.parse(expectedTime).toEpochMilli() > now) {
            enqueueSnooze(record, ExistingWorkPolicy.APPEND_OR_REPLACE)
            return@synchronized
        }
        if (!notificationsEnabled()) {
            clearOccurrence(record)
            record.put("enabled", false).put("status", "paused").put("lastResult", "Snooze was due but notifications were off. Enable notifications and reschedule.")
            save(record)
            return@synchronized
        }
        record.put("notificationToken", UUID.randomUUID().toString())
        save(record)
        try {
            postNotification(id, record.getString("title"), record.optString("note").ifBlank { "Snoozed reminder. Tap to open Argus routines." }, record)
        } catch (_: SecurityException) {
            clearOccurrence(record)
            record.put("enabled", false).put("status", "paused").put("lastResult", "Notifications were blocked. Review Android notification settings.")
            save(record)
            return@synchronized
        }
        record.put("snoozedUntil", "").put("snoozeToken", "").put("enabled", record.getString("repeat") != "once")
            .put("status", if (record.getString("repeat") == "once") "notified" else "scheduled")
            .put("lastFiredAt", Instant.ofEpochMilli(now).toString()).put("updatedAt", Instant.now().toString())
            .put("lastResult", "Snoozed notification posted. Choose Snooze or Done for this occurrence.")
        save(record)
        if (hasRegularSchedule(record)) enqueue(record, ExistingWorkPolicy.KEEP)
    }

    private fun postNotification(id: String, title: String, note: String, record: JSONObject? = null) {
        val intent = Intent(app, MainActivity::class.java).apply {
            data = Uri.parse("argus://reminder/$id")
            putExtra("argus_reminder", id)
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(app, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = Notification.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_argus).setContentTitle(title).setContentText(note)
            .setContentIntent(pending).setAutoCancel(true)
            // A new daily/weekly occurrence should alert even when yesterday's card was not dismissed.
            .setOnlyAlertOnce(false)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_REMINDER)
        if (record != null) {
            for ((operation, label) in listOf("snooze" to "Snooze 10 min", "done" to "Done")) {
                val actionIntent = Intent(app, ReminderActionReceiver::class.java).apply {
                    action = if (operation == "snooze") ReminderActionReceiver.ACTION_SNOOZE else ReminderActionReceiver.ACTION_DONE
                    // Intent extras do not define PendingIntent identity: include all authority in the URI.
                    data = Uri.Builder().scheme("argus").authority("reminder-action").appendPath(id)
                        .appendPath(record.getString("revision")).appendPath(record.getString("notificationToken")).appendPath(operation).build()
                    putExtra("id", id).putExtra("revision", record.getString("revision"))
                        .putExtra("notificationToken", record.getString("notificationToken"))
                }
                val actionPending = PendingIntent.getBroadcast(app, 0, actionIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                builder.addAction(Notification.Action.Builder(Icon.createWithResource(app, R.drawable.ic_argus), label, actionPending).build())
            }
        }
        manager.notify(id, NOTIFICATION_ID, builder.build())
    }

    private fun enqueue(record: JSONObject, policy: ExistingWorkPolicy) {
        val due = Instant.parse(record.getString("nextRunAt")).toEpochMilli()
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay((due - System.currentTimeMillis()).coerceAtLeast(0), TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString("id", record.getString("id"))
                .putString("revision", record.getString("revision")).putString("due", record.getString("nextRunAt")).build())
            .addTag(TAG).build()
        work.enqueueUniqueWork(workName(record.getString("id")), policy, request).result.get()
    }

    private fun enqueueSnooze(record: JSONObject, policy: ExistingWorkPolicy) {
        val due = Instant.parse(record.getString("snoozedUntil")).toEpochMilli()
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay((due - System.currentTimeMillis()).coerceAtLeast(0), TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString("id", record.getString("id"))
                .putString("revision", record.getString("revision")).putString("due", record.getString("snoozedUntil"))
                .putString("snoozeToken", record.getString("snoozeToken")).build()).addTag(TAG).build()
        work.enqueueUniqueWork(snoozeWorkName(record.getString("id")), policy, request).result.get()
    }

    private fun hasRegularSchedule(record: JSONObject): Boolean = record.optBoolean("enabled") &&
        (record.optString("repeat") != "once" || record.optString("snoozedUntil").isBlank())

    private fun ensureScheduled(record: JSONObject) {
        if (hasRegularSchedule(record)) enqueue(record, ExistingWorkPolicy.KEEP)
        if (record.optBoolean("enabled") && record.optString("snoozedUntil").isNotBlank() && record.optString("snoozeToken").isNotBlank())
            enqueueSnooze(record, ExistingWorkPolicy.KEEP)
    }

    private fun clearOccurrence(record: JSONObject) {
        record.put("notificationToken", "").put("snoozeToken", "").put("snoozedUntil", "")
    }

    private fun all(): List<JSONObject> = prefs.all.values.mapNotNull { value ->
        runCatching { JSONObject(value as String) }.getOrNull()
    }
    private fun read(id: String): JSONObject? = prefs.getString(id, null)?.let { JSONObject(it) }
    private fun save(record: JSONObject) { check(prefs.edit().putString(record.getString("id"), record.toString()).commit()) }
    private fun checkedId(id: String): String {
        require(id.matches(Regex("rem-[a-zA-Z0-9-]{1,80}"))) { "Invalid reminder ID." }
        return id
    }
    private fun workName(id: String) = "$TAG:$id"
    private fun snoozeWorkName(id: String) = "$TAG:$id:snooze"

    companion object {
        const val CHANNEL = "argus_reminders"
        const val TAG = "argus-local-reminder"
        private const val NOTIFICATION_ID = 1
        private val LOCK = Any()
    }
}
