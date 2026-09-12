package com.argus.localcore

enum class WakeLaunchDecision { IGNORE, ALREADY_VISIBLE, TAP_NOTIFICATION, WAIT_FOR_ASSISTANT, OPEN_COMMAND }

object WakeLaunchPolicy {
    fun decide(token: String, pending: String, enabled: Boolean, unlocked: Boolean,
               visible: Boolean, selected: Boolean, bound: Boolean): WakeLaunchDecision = when {
        token.isBlank() || token != pending || !enabled || !unlocked -> WakeLaunchDecision.IGNORE
        visible -> WakeLaunchDecision.ALREADY_VISIBLE
        !selected -> WakeLaunchDecision.TAP_NOTIFICATION
        !bound -> WakeLaunchDecision.WAIT_FOR_ASSISTANT
        else -> WakeLaunchDecision.OPEN_COMMAND
    }
}
