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
import android.os.Build
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
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Argus reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Reminders and routines you enable in Argus"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
    }

    fun notificationsEnabled(): Boolean =
        (Build.VERSION.SDK_INT < 33 || app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE

    fun state(): JSONObject = synchronized(LOCK) {
        val records = all()
        // Recover a persisted schedule if the process stopped between saving it and enqueueing work.
        for (record in records) {
            if (record.optBoolean("enabled")) enqueue(record, ExistingWorkPolicy.KEEP)
        }
        JSONObject().put("status", "completed").put("notificationsEnabled", notificationsEnabled())
            .put("reminders", JSONArray(records))
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
            .put("createdAt", previous?.optString("createdAt") ?: input.optString("createdAt", Instant.now().toString()))
            .put("updatedAt", Instant.now().toString()).put("lastFiredAt", previous?.optString("lastFiredAt").orEmpty())
            .put("lastResult", "Scheduled on this phone. Android may delay delivery to save battery.")
        save(record)
        try {
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
            record.put("enabled", false).put("status", "paused").put("updatedAt", Instant.now().toString())
                .put("lastResult", "Paused. No further notifications are scheduled.")
            save(record)
        }
        work.cancelUniqueWork(workName(id)).result.get()
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

    fun fire(id: String, revision: String, expectedTime: String) = synchronized(LOCK) {
        val record = read(id) ?: return@synchronized
        if (!record.optBoolean("enabled") || record.optString("revision") != revision || record.optString("nextRunAt") != expectedTime) return@synchronized
        val scheduled = Instant.parse(expectedTime).toEpochMilli()
        val now = System.currentTimeMillis()
        if (scheduled > now) {
            // A backwards clock change must not cause an early notification.
            enqueue(record, ExistingWorkPolicy.APPEND_OR_REPLACE)
            return@synchronized
        }
        if (!notificationsEnabled()) {
            record.put("enabled", false).put("status", "paused")
                .put("lastResult", "Notification permission was off when this was due. Enable notifications and reschedule.")
            save(record)
            return@synchronized
        }
        val intent = Intent(app, MainActivity::class.java).apply {
            data = Uri.parse("argus://reminder/$id")
            putExtra("argus_reminder", id)
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(app, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_argus).setContentTitle(record.getString("title"))
            .setContentText(record.optString("note").ifBlank { "Tap to open Argus routines." })
            .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_REMINDER).build()
        try {
            manager.notify(id, NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            record.put("enabled", false).put("status", "paused").put("lastResult", "Notifications were blocked. Review Android notification settings.")
            save(record)
            return@synchronized
        }
        val next = ReminderSchedule.next(scheduled, record.getString("repeat"), record.getString("timeZone"), record.getString("wallTime"), now)
        record.put("lastFiredAt", Instant.ofEpochMilli(now).toString()).put("updatedAt", Instant.now().toString())
            .put("lastResult", "Notification posted to Android.").put("enabled", next != null)
            .put("status", if (next == null) "completed" else "scheduled")
        if (next != null) record.put("nextRunAt", Instant.ofEpochMilli(next).toString())
        save(record)
        if (next != null) enqueue(record, ExistingWorkPolicy.APPEND_OR_REPLACE)
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

    companion object {
        const val CHANNEL = "argus_reminders"
        private const val TAG = "argus-local-reminder"
        private const val NOTIFICATION_ID = 1
        private val LOCK = Any()
    }
}
