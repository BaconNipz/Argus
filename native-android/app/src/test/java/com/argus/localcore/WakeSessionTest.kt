package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class WakeSessionTest {
    private fun listening(): WakeSession = WakeSession().apply {
        assertTrue(begin("wake-one", 100L))
        assertTrue(listening("wake-one"))
    }

    @Test fun wakeMustReleaseItsMicrophoneBeforeSpeechCanClaimDetection() {
        val session = listening()
        assertFalse(session.claim("wake-one", 200L, true))
        assertTrue(session.complete("wake-one", "detected", 200L))
        assertTrue(session.claim("wake-one", 201L, true))
        assertFalse(session.busy())
        assertFalse(session.claim("wake-one", 202L, true))
    }

    @Test fun stopDefeatsALatePositiveResultAndBlocksANewStartUntilCleanup() {
        val session = listening()
        assertTrue(session.stop("wake-one"))
        assertFalse(session.begin("wake-two", 200L))
        assertTrue(session.complete("wake-one", "detected", 210L))
        assertEquals("cancelled", session.phase)
        assertFalse(session.claim("wake-one", 211L, true))
        assertTrue(session.begin("wake-two", 220L))
    }

    @Test fun stoppingDuringModelLoadCannotStartListeningLater() {
        val session = WakeSession()
        session.begin("wake-one", 0L)
        session.stop("wake-one")
        assertFalse(session.listening("wake-one"))
        session.complete("wake-one", "error", 30L)
        assertEquals("cancelled", session.phase)
    }

    @Test fun foregroundAndMatchingFreshTokenAreRequiredForHandoff() {
        val session = listening()
        session.complete("wake-one", "detected", 200L)
        assertFalse(session.claim("wake-one", 201L, false))
        assertFalse(session.claim("wake-other", 201L, true))
        assertTrue(session.claim("wake-one", 200L + WakePolicy.HANDOFF_MS - 1L, true))
    }

    @Test fun handoffExpiresAtItsExactDeadline() {
        val session = listening()
        session.complete("wake-one", "detected", 200L)
        assertFalse(session.claim("wake-one", 200L + WakePolicy.HANDOFF_MS, true))
        assertTrue(session.stop("wake-one"))
        session.complete("wake-one", "cancelled", 6000L)
        assertFalse(session.busy())
    }

    @Test fun detectionAtTheFiveMinuteLimitExpires() {
        val session = listening()
        session.complete("wake-one", "detected", 100L + WakePolicy.WINDOW_MS)
        assertEquals("expired", session.phase)
        assertFalse(session.claim("wake-one", session.deadline, true))
    }

    @Test fun cancellationAfterDetectionStillRevokesTheHandoff() {
        val session = listening()
        session.complete("wake-one", "detected", 200L)
        session.stop("wake-one")
        assertFalse(session.claim("wake-one", 201L, true))
        session.complete("wake-one", "cancelled", 202L)
        assertEquals("cancelled", session.phase)
    }

    @Test fun staleAndDuplicateCompletionCannotChangeCurrentAuthority() {
        val session = listening()
        session.complete("wake-one", "cancelled", 200L)
        session.begin("wake-two", 210L)
        assertFalse(session.listening("wake-one"))
        assertFalse(session.stop("wake-one"))
        assertFalse(session.complete("wake-one", "detected", 220L))
        session.listening("wake-two")
        session.complete("wake-two", "detected", 230L)
        assertFalse(session.complete("wake-two", "detected", 240L))
        assertTrue(session.claim("wake-two", 250L, true))
    }

    @Test fun detectionWithoutActualListeningIsAnError() {
        val session = WakeSession()
        session.begin("wake-one", 100L)
        session.complete("wake-one", "detected", 200L)
        assertEquals("error", session.phase)
    }

    @Test fun sensitivityHasTwoBoundedChoicesAndNoArbitraryThresholdInput() {
        assertEquals(WakeSensitivity(2f, 0.25f), WakePolicy.sensitivity("standard"))
        assertEquals(WakeSensitivity(4f, 0.1f), WakePolicy.sensitivity("sensitive"))
        for (value in listOf("", "0", "always", "Standard")) {
            assertThrows(IllegalArgumentException::class.java) { WakePolicy.sensitivity(value) }
        }
        assertThrows(IllegalArgumentException::class.java) { WakeSession().begin("wake-", 0L) }
    }
}
