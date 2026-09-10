package com.argus.localcore

data class ReminderActionState(
    val revision: String,
    val notificationToken: String,
    val repeat: String,
    val enabled: Boolean,
    val nextRunAt: Long,
    val status: String,
    val snoozedUntil: Long? = null
)

object ReminderActionPolicy {
    const val SNOOZE_MS = 10 * 60 * 1000L

    fun apply(current: ReminderActionState, revision: String, token: String, action: String, now: Long): ReminderActionState? {
        if (token.isBlank() || revision != current.revision || token != current.notificationToken) return null
        if (current.status !in listOf("notified", "scheduled")) return null
        if (current.repeat != "once" && !current.enabled) return null
        return when (action) {
            "done" -> current.copy(notificationToken = "", snoozedUntil = null,
                enabled = current.repeat != "once" && current.enabled,
                status = if (current.repeat == "once") "completed" else "scheduled")
            "snooze" -> {
                val due = Math.addExact(now, SNOOZE_MS)
                current.copy(notificationToken = "", enabled = true, status = "snoozed", snoozedUntil = due,
                    nextRunAt = if (current.repeat == "once") due else current.nextRunAt)
            }
            else -> null
        }
    }

    fun regularTakesPriority(repeat: String, nextRunAt: Long, now: Long): Boolean = repeat != "once" && nextRunAt <= now
}
