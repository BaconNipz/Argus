package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class BackgroundVoicePolicyTest {
    @Test fun audioMustBeReleasedByItsActualOwnerBeforeHandoff() {
        assertTrue(VoiceAudioGate.acquire("wake-test"))
        try {
            assertFalse(VoiceAudioGate.acquire("speech-test"))
            VoiceAudioGate.release("old-session")
            assertTrue(VoiceAudioGate.busy())
        } finally { VoiceAudioGate.release("wake-test") }
        assertTrue(VoiceAudioGate.acquire("speech-test"))
        VoiceAudioGate.release("wake-test")
        assertTrue(VoiceAudioGate.busy())
        VoiceAudioGate.release("speech-test")
        assertFalse(VoiceAudioGate.busy())
    }

    @Test fun duplicateAcquisitionDoesNotGrantTwoAudioOwners() {
        assertTrue(VoiceAudioGate.acquire("one"))
        try { assertFalse(VoiceAudioGate.acquire("one")) } finally { VoiceAudioGate.release("one") }
    }

    @Test fun matchingFreshTicketCanBeClaimedOnlyOnce() {
        val t = BackgroundWakeTicket()
        assertTrue(t.offer("background-one", 100L))
        assertFalse(t.offer("background-two", 110L))
        assertFalse(t.claim("background-other", 120L, true, true))
        assertTrue(t.claim("background-one", 120L, true, true))
        assertFalse(t.claim("background-one", 121L, true, true))
    }

    @Test fun hiddenAndLockedAppCannotClaimMicrophoneCapture() {
        val t = BackgroundWakeTicket(); t.offer("background-one", 0L)
        assertFalse(t.claim("background-one", 1L, false, true))
        assertFalse(t.claim("background-one", 1L, true, false))
        assertTrue(t.claim("background-one", 1L, true, true))
    }

    @Test fun lateNotificationTapCannotStartCaptureAfterTwentySeconds() {
        val t = BackgroundWakeTicket(); t.offer("background-one", 0L)
        assertFalse(t.claim("background-one", 20_000L, true, true))
        assertFalse(t.active(20_001L))
    }

    @Test fun commandLeaseCannotBlockWakeForever() {
        val t = BackgroundWakeTicket(); t.offer("background-one", 0L)
        t.claim("background-one", 100L, true, true)
        assertTrue(t.active(60_099L))
        assertFalse(t.active(60_100L))
        assertTrue(t.offer("background-two", 60_101L))
    }

    @Test fun staleCompletionCannotClearANewerWake() {
        val t = BackgroundWakeTicket(); t.offer("background-one", 0L)
        assertTrue(t.finish("background-one"))
        t.offer("background-two", 100L)
        assertFalse(t.finish("background-one"))
        assertEquals("background-two", t.token)
    }

    @Test fun pauseInvalidatesEvenAnAlreadyClaimedTicket() {
        val t = BackgroundWakeTicket(); t.offer("background-one", 0L)
        t.claim("background-one", 1L, true, true); t.clear()
        assertFalse(t.active(2L))
        assertFalse(t.claim("background-one", 2L, true, true))
        assertFalse(t.finish("background-one"))
    }

    @Test fun externalStringsCannotCreateWakeAuthority() {
        for (value in listOf("", "background-", "background-one\n", "speech-one", "background-${"x".repeat(81)}")) {
            assertThrows(IllegalArgumentException::class.java) { BackgroundWakeTicket().offer(value, 0L) }
        }
    }
}
