package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class SpeechPolicyTest {
    @Test fun olderOrUnsupportedDevicesCannotEnableOnDeviceRecognition() {
        assertFalse(SpeechPolicy.canUseOnDevice(30, true))
        assertFalse(SpeechPolicy.canUseOnDevice(35, false))
        assertTrue(SpeechPolicy.canUseOnDevice(31, true))
    }

    @Test fun cancellationRejectsLateResultsAndProtectsTheNextSession() {
        val session = SpeechSession()
        assertTrue(session.begin("one"))
        assertFalse(session.begin("two"))
        assertTrue(session.finish("one"))
        assertTrue(session.begin("two"))
        assertFalse(session.accepts("one"))
        assertFalse(session.finish("one"))
        assertTrue(session.accepts("two"))
    }

    @Test fun duplicateTerminalEventsCannotCompleteTwice() {
        val session = SpeechSession()
        session.begin("one")
        assertTrue(session.finish("one"))
        assertFalse(session.finish("one"))
        assertNull(session.current())
    }

    @Test fun transcriptSelectionIgnoresEmptyAlternativesAndLimitsSize() {
        assertEquals("remember this", SpeechPolicy.firstTranscript(listOf(" ", " remember this ", "alternate")))
        assertEquals("", SpeechPolicy.firstTranscript(null))
        assertEquals(4000, SpeechPolicy.firstTranscript(listOf("x".repeat(5000))).length)
    }

    @Test fun permissionAndLanguageFailuresGiveSpecificNextSteps() {
        assertTrue(SpeechPolicy.errorMessage(9).contains("permission"))
        assertTrue(SpeechPolicy.errorMessage(12).contains("another language"))
        assertTrue(SpeechPolicy.errorMessage(13).contains("not installed"))
        assertTrue(SpeechPolicy.errorMessage(2).contains("not switched to online"))
    }
}
