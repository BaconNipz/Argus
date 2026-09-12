package com.argus.localcore

// Process-wide ownership. Release only after the owner's audio resources are closed.
object VoiceAudioGate {
    private var owner: String? = null
    @Synchronized fun acquire(id: String): Boolean {
        if (owner != null) return false
        owner = id
        return true
    }
    @Synchronized fun release(id: String) { if (owner == id) owner = null }
    @Synchronized fun busy(): Boolean = owner != null
}

class BackgroundWakeTicket {
    var token = ""
        private set
    var claimed = false
        private set
    private var deadline = 0L

    @Synchronized fun offer(id: String, now: Long): Boolean {
        require(id.matches(Regex("background-[a-zA-Z0-9-]{1,80}")))
        if (active(now)) return false
        token = id; claimed = false; deadline = now + 20_000L
        return true
    }
    @Synchronized fun active(now: Long): Boolean {
        if (token.isNotEmpty() && now >= deadline) clear()
        return token.isNotEmpty()
    }
    @Synchronized fun claim(id: String, now: Long, foreground: Boolean, unlocked: Boolean): Boolean {
        if (!active(now) || claimed || token != id || !foreground || !unlocked) return false
        claimed = true; deadline = now + 60_000L
        return true
    }
    @Synchronized fun finish(id: String): Boolean {
        if (id != token || token.isEmpty()) return false
        clear(); return true
    }
    @Synchronized fun clear() { token = ""; claimed = false; deadline = 0L }
}
