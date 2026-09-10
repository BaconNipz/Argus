package com.argus.localcore

import java.util.UUID

// A launch can only select Command. Intent extras never become speech or executable text.
// The token survives recreation until consumed; stale WebView work cannot consume a newer tap.
class CommandLaunchQueue(private val newId: () -> String = { "command-${UUID.randomUUID()}" }) {
    private var pending: String? = null

    @Synchronized fun initialize(action: String?, recreated: Boolean, savedPending: String?) {
        pending = if (recreated) savedPending?.takeIf { it.matches(TOKEN) }
            else if (action == ACTION) newId() else null
    }

    @Synchronized fun accept(action: String?) {
        pending = if (action == ACTION) newId() else null
    }

    @Synchronized fun peek(): String? = pending

    @Synchronized fun consume(expected: String): Boolean {
        if (expected.isEmpty() || pending != expected) return false
        pending = null
        return true
    }

    companion object {
        const val ACTION = "com.argus.localcore.OPEN_COMMAND"
        private val TOKEN = Regex("command-[a-zA-Z0-9-]{1,80}")
    }
}
