package com.argus.localcore

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class ReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val id = inputData.getString("id") ?: return Result.failure()
        val revision = inputData.getString("revision") ?: return Result.failure()
        val due = inputData.getString("due") ?: return Result.failure()
        return try {
            ReminderScheduler(applicationContext).fire(id, revision, due)
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}
