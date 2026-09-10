package com.argus.localcore

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Accepts only explicit, immutable PendingIntents created by Argus. */
class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = when (intent.action) {
            ACTION_SNOOZE -> "snooze"
            ACTION_DONE -> "done"
            else -> return
        }
        val id = intent.getStringExtra("id").orEmpty()
        val revision = intent.getStringExtra("revision").orEmpty()
        val token = intent.getStringExtra("notificationToken").orEmpty()
        if (!id.matches(Regex("rem-[a-zA-Z0-9-]{1,80}")) || !revision.matches(TOKEN) || !token.matches(TOKEN)) return
        val app = context.applicationContext
        val pending = goAsync()
        executor.execute {
            try {
                val request = OneTimeWorkRequestBuilder<ReminderActionWorker>()
                    .setInputData(Data.Builder().putString("id", id).putString("revision", revision)
                        .putString("notificationToken", token).putString("action", action).build())
                    .addTag(ReminderScheduler.TAG).build()
                // Snooze and Done for the same alert share a queue key: the first accepted tap wins.
                WorkManager.getInstance(app).enqueueUniqueWork("argus-reminder-action:$id:$revision:$token",
                    ExistingWorkPolicy.KEEP, request).result.get(8, TimeUnit.SECONDS)
            } catch (error: Exception) {
                Log.w("ArgusReminders", "Could not queue a notification action.", error)
            } finally { pending.finish() }
        }
    }

    companion object {
        const val ACTION_SNOOZE = "com.argus.localcore.REMINDER_SNOOZE"
        const val ACTION_DONE = "com.argus.localcore.REMINDER_DONE"
        private val TOKEN = Regex("[a-zA-Z0-9-]{1,80}")
        private val executor = Executors.newSingleThreadExecutor()
    }
}
