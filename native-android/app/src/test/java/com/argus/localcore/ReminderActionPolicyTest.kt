package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ReminderActionPolicyTest {
    private val now = Instant.parse("2026-09-10T09:00:00Z").toEpochMilli()
    private val once = ReminderActionState("revision-one", "alert-one", "once", false, now, "notified")
    private val daily = once.copy(repeat = "daily", enabled = true, status = "scheduled", nextRunAt = now + 86_400_000)

    private fun act(state: ReminderActionState, action: String) = ReminderActionPolicy.apply(state, state.revision, state.notificationToken, action, now)

    @Test fun doneCompletesAOneOffWithoutSchedulingAnything() {
        val result = act(once, "done")!!
        assertFalse(result.enabled)
        assertEquals("completed", result.status)
        assertEquals("", result.notificationToken)
        assertNull(result.snoozedUntil)
    }

    @Test fun doneLeavesDailyAndWeeklyTimesUntouched() {
        for (repeat in listOf("daily", "weekly")) {
            val current = daily.copy(repeat = repeat)
            val result = act(current, "done")!!
            assertTrue(result.enabled)
            assertEquals("scheduled", result.status)
            assertEquals(current.nextRunAt, result.nextRunAt)
        }
    }

    @Test fun snoozeOneOffCreatesOnePendingAlertTenMinutesFromHandling() {
        val result = act(once, "snooze")!!
        assertTrue(result.enabled)
        assertEquals("snoozed", result.status)
        assertEquals(now + 600_000, result.nextRunAt)
        assertEquals(now + 600_000, result.snoozedUntil!!)
        assertEquals("", result.notificationToken)
    }

    @Test fun snoozeDoesNotShiftTheRoutineEvenAcrossTheNextOccurrence() {
        for (repeat in listOf("daily", "weekly")) {
            val current = daily.copy(repeat = repeat, nextRunAt = now + 300_000)
            val result = act(current, "snooze")!!
            assertEquals(current.nextRunAt, result.nextRunAt)
            assertEquals(now + 600_000, result.snoozedUntil!!)
        }
    }

    @Test fun consumedAlertCannotBeSnoozedOrCompletedAgain() {
        for (firstAction in listOf("done", "snooze")) {
            val result = act(once, firstAction)!!
            for (secondAction in listOf("done", "snooze")) {
                assertNull(ReminderActionPolicy.apply(result, once.revision, once.notificationToken, secondAction, now + 1000))
            }
        }
    }

    @Test fun editedOrSupersededAlertsCannotChangeNewerState() {
        assertNull(ReminderActionPolicy.apply(daily.copy(revision = "new-revision"), daily.revision, daily.notificationToken, "snooze", now))
        assertNull(ReminderActionPolicy.apply(daily.copy(notificationToken = "new-alert"), daily.revision, daily.notificationToken, "done", now))
        assertNull(ReminderActionPolicy.apply(daily, daily.revision, "", "done", now))
    }

    @Test fun pausedAndRestoredRecordsCannotBeRevivedByNotificationActions() {
        assertNull(act(daily.copy(enabled = false, status = "paused"), "snooze"))
        assertNull(act(once.copy(status = "paused", notificationToken = ""), "snooze"))
        assertNull(act(daily.copy(enabled = false), "snooze"))
        assertNull(act(once, "unexpected"))
    }

    @Test fun newerRegularOccurrenceWinsOverAnOldSnoozeIncludingLongDelays() {
        assertFalse(ReminderActionPolicy.regularTakesPriority("daily", now + 1, now))
        assertTrue(ReminderActionPolicy.regularTakesPriority("daily", now, now))
        assertTrue(ReminderActionPolicy.regularTakesPriority("weekly", now - 86_400_000, now))
        assertFalse(ReminderActionPolicy.regularTakesPriority("once", now - 86_400_000, now))
    }
}
