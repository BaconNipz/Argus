package com.argus.localcore

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject

class ReminderActionWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val payload = JSONObject()
        for (key in listOf("id", "revision", "notificationToken", "action")) {
            payload.put(key, inputData.getString(key) ?: return Result.failure())
        }
        return try {
            ReminderScheduler(applicationContext).actOnNotification(payload)
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}
