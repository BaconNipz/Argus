package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class WakeLaunchPolicyTest {
    private fun decide(token: String = "background-one", pending: String = token,
                       enabled: Boolean = true, unlocked: Boolean = true, visible: Boolean = false,
                       selected: Boolean = true, bound: Boolean = true) =
        WakeLaunchPolicy.decide(token, pending, enabled, unlocked, visible, selected, bound)

    @Test fun selectedAndConnectedAssistantCanOpenCommand() {
        assertEquals(WakeLaunchDecision.OPEN_COMMAND, decide())
    }
    @Test fun missingOrExpiredWakeCannotOpenTheApp() {
        assertEquals(WakeLaunchDecision.IGNORE, decide(token = "", pending = ""))
        assertEquals(WakeLaunchDecision.IGNORE, decide(pending = ""))
        assertEquals(WakeLaunchDecision.IGNORE, decide(pending = "background-new"))
    }
    @Test fun pausedOrLockedWakeCannotOpenTheApp() {
        assertEquals(WakeLaunchDecision.IGNORE, decide(enabled = false))
        assertEquals(WakeLaunchDecision.IGNORE, decide(unlocked = false))
    }
    @Test fun anotherDefaultAssistantRequiresNotificationTap() {
        assertEquals(WakeLaunchDecision.TAP_NOTIFICATION, decide(selected = false))
    }
    @Test fun selectedButUnboundAssistantWaitsForSystemConnection() {
        assertEquals(WakeLaunchDecision.WAIT_FOR_ASSISTANT, decide(bound = false))
        assertEquals(WakeLaunchDecision.OPEN_COMMAND, decide(bound = true))
    }
    @Test fun visibleCommandDoesNotNeedAnotherActivityLaunch() {
        assertEquals(WakeLaunchDecision.ALREADY_VISIBLE, decide(visible = true))
        assertEquals(WakeLaunchDecision.ALREADY_VISIBLE, decide(visible = true, selected = false, bound = false))
    }
}
