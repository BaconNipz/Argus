package com.argus.localcore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class ReminderScheduleTest {
    private fun ms(value: String) = Instant.parse(value).toEpochMilli()

    @Test fun onceDoesNotRepeat() {
        assertNull(ReminderSchedule.next(ms("2026-09-09T00:00:00Z"), "once", "UTC", "09:00", ms("2026-09-09T00:01:00Z")))
    }

    @Test fun dailyKeepsAdelaideWallTimeAcrossDaylightSaving() {
        // 09:00 Adelaide, on the days either side of the October clock change.
        assertEquals(ms("2026-10-03T22:30:00Z"), ReminderSchedule.next(ms("2026-10-02T23:30:00Z"), "daily", "Australia/Adelaide", "09:00", ms("2026-10-02T23:35:00Z")))
    }

    @Test fun weeklyKeepsDayAndSkipsMissedOccurrences() {
        assertEquals(ms("2026-09-30T09:00:00Z"), ReminderSchedule.next(ms("2026-09-09T09:00:00Z"), "weekly", "UTC", "09:00", ms("2026-09-25T12:00:00Z")))
    }

    @Test fun delayDoesNotMoveTomorrowsTime() {
        assertEquals(ms("2026-09-12T09:00:00Z"), ReminderSchedule.next(ms("2026-09-09T09:00:00Z"), "daily", "UTC", "09:00", ms("2026-09-11T11:00:00Z")))
    }

    @Test fun gapTimeReturnsToChosenTimeTheFollowingDay() {
        assertEquals(ms("2026-10-04T16:00:00Z"), ReminderSchedule.next(ms("2026-10-03T17:00:00Z"), "daily", "Australia/Adelaide", "02:30", ms("2026-10-03T17:01:00Z")))
    }
}
