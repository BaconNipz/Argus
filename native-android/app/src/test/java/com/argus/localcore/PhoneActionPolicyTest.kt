package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test
import java.net.URLDecoder

class PhoneActionPolicyTest {
    private fun plan(kind: String, value: String, approved: Boolean = true, foreground: Boolean = true, unlocked: Boolean = true) =
        PhoneActionPolicy.plan(kind, value, approved, foreground, unlocked)

    @Test fun dialerShowsDigitsWithoutCalling() {
        val spec = plan("dial_number", "+61 (8) 1234-5678")
        assertEquals("android.intent.action.DIAL", spec.action)
        assertEquals("tel:+61812345678", spec.uri)
        assertEquals("", spec.text)
        assertEquals("tel:123", plan("dial_number", "123").uri)
    }
    @Test fun namesServiceCodesExtensionsAndMalformedNumbersAreRejected() {
        listOf("Mum", "*123#", "123;456", "123,456", "123 ext 2", "tel:123", "12+34", "++123", "12", "1".repeat(16), "１２３", "one two three", "123\n456").forEach { value ->
            assertThrows(value, IllegalArgumentException::class.java) { plan("dial_number", value) }
        }
    }
    @Test fun mapsEncodesEveryPartOfTheSearchAsOneQuery() {
        val query = "Café 🌿 & q=other#Intent;action=CALL;end / +"
        val spec = plan("map_search", query)
        assertEquals("android.intent.action.VIEW", spec.action)
        assertTrue(spec.uri.startsWith("geo:0,0?q="))
        val encoded = spec.uri.removePrefix("geo:0,0?q=")
        assertFalse(encoded.contains("&"))
        assertFalse(encoded.contains("#"))
        assertFalse(encoded.contains(" "))
        assertEquals(query, URLDecoder.decode(encoded, "UTF-8"))
    }
    @Test fun sharedTextRetainsUnicodeLineBreaksAndPunctuation() {
        val text = "I’m at Café 🌿.\nMeet at 5:30?\tThank you!"
        val spec = plan("share_text", text)
        assertEquals("android.intent.action.SEND", spec.action)
        assertEquals(text, spec.text)
        assertEquals("", spec.uri)
    }
    @Test fun allPhoneActionsNeedApprovalForegroundAndUnlock() {
        listOf("map_search" to "Adelaide Oval", "dial_number" to "12345", "share_text" to "Hello").forEach { (kind, value) ->
            assertThrows(IllegalArgumentException::class.java) { plan(kind, value, approved = false) }
            assertThrows(IllegalArgumentException::class.java) { plan(kind, value, foreground = false) }
            assertThrows(IllegalArgumentException::class.java) { plan(kind, value, unlocked = false) }
        }
    }
    @Test fun emptyOverlongAndControlTextCannotBecomeAnIntent() {
        listOf("map_search" to 500, "dial_number" to 80, "share_text" to 4000).forEach { (kind, limit) ->
            listOf("", "   ", "x".repeat(limit + 1), "bad\u0000text", "bad\u007ftext").forEach { value ->
                assertThrows(IllegalArgumentException::class.java) { plan(kind, value) }
            }
        }
        assertThrows(IllegalArgumentException::class.java) { plan("map_search", "first\nsecond") }
        assertEquals(4000, plan("share_text", "x".repeat(4000)).text.length)
    }
    @Test fun unknownActionsAreRejected() {
        assertThrows(IllegalArgumentException::class.java) { plan("call_number", "12345") }
        assertThrows(IllegalArgumentException::class.java) { PhoneActionPolicy.field("send_sms") }
    }
    @Test fun repeatedHandoffIsSuppressedButChangedDraftHasItsOwnAttempt() {
        val history = PhoneActionHistory()
        assertTrue(history.begin("first-reviewed-action"))
        assertFalse(history.begin("first-reviewed-action"))
        assertTrue(history.begin("edited-reviewed-action"))
        assertFalse(history.begin("edited-reviewed-action"))
    }
    @Test fun failedHandoffCanBeReviewedAndRetried() {
        val history = PhoneActionHistory()
        assertTrue(history.begin("first-reviewed-action"))
        history.failed("first-reviewed-action")
        assertTrue(history.begin("first-reviewed-action"))
    }
}
