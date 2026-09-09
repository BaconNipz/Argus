package com.argus.localcore

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

object ReminderSchedule {
    fun next(scheduled: Long, repeat: String, zoneName: String, wallTime: String, now: Long): Long? {
        if (repeat == "once") return null
        require(repeat == "daily" || repeat == "weekly")
        val zone = ZoneId.of(zoneName)
        val step = if (repeat == "weekly") 7L else 1L
        var date = Instant.ofEpochMilli(scheduled).atZone(zone).toLocalDate()
        val time = LocalTime.parse(wallTime)
        var next: Long
        do {
            date = date.plusDays(step)
            next = ZonedDateTime.of(date, time, zone).toInstant().toEpochMilli()
        } while (next <= now)
        return next
    }
}
