package com.argus.localcore

data class WakeSensitivity(val score: Float, val threshold: Float)

object WakePolicy {
    const val WINDOW_MS = 300_000L
    const val HANDOFF_MS = 5_000L
    fun sensitivity(value: String): WakeSensitivity = when (value) {
        "standard" -> WakeSensitivity(2.0f, 0.25f)
        "sensitive" -> WakeSensitivity(4.0f, 0.1f)
        else -> throw IllegalArgumentException("Choose Standard or More sensitive.")
    }
}

// Main-thread policy. Microphone cleanup happens before complete() allows a handoff.
class WakeSession {
    var id = ""
        private set
    var phase = "idle"
        private set
    var deadline = 0L
        private set
    private var handoffDeadline = 0L

    fun busy(): Boolean = phase in setOf("starting", "listening", "stopping", "detected")

    fun begin(value: String, now: Long): Boolean {
        require(value.matches(Regex("wake-[a-zA-Z0-9-]{1,80}"))) { "Invalid wake session." }
        if (busy()) return false
        id = value
        phase = "starting"
        deadline = now + WakePolicy.WINDOW_MS
        handoffDeadline = 0
        return true
    }

    fun listening(value: String): Boolean {
        if (id != value || phase != "starting") return false
        phase = "listening"
        return true
    }

    fun stop(value: String): Boolean {
        if (id != value || !busy()) return false
        phase = "stopping"
        return true
    }

    fun complete(value: String, result: String, now: Long): Boolean {
        require(result in setOf("detected", "expired", "cancelled", "error"))
        if (id != value || phase !in setOf("starting", "listening", "stopping")) return false
        phase = when {
            phase == "stopping" -> "cancelled"
            result == "detected" && now >= deadline -> "expired"
            result == "detected" && phase != "listening" -> "error"
            else -> result
        }
        handoffDeadline = if (phase == "detected") now + WakePolicy.HANDOFF_MS else 0
        return true
    }

    fun claim(value: String, now: Long, foreground: Boolean): Boolean {
        if (!foreground || id != value || phase != "detected" || now >= handoffDeadline) return false
        phase = "consumed"
        handoffDeadline = 0
        return true
    }
}
