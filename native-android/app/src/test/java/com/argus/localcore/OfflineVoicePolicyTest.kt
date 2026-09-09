package com.argus.localcore

import org.junit.Assert.*
import org.junit.Test

class OfflineVoicePolicyTest {
    private val local = OfflineVoiceCandidate("local-au", "en-AU", false, false, 300)
    private val cloud = OfflineVoiceCandidate("cloud-au", "en-AU", true, false, 500)
    private val missing = OfflineVoiceCandidate("missing-au", "en-AU", false, true, 500)

    @Test fun networkAndNotInstalledVoicesAreExcludedEvenWhenPreferred() {
        val voices = listOf(cloud, missing, local)
        assertEquals(local.name, OfflineVoicePolicy.choose(voices, null, "en-AU"))
        assertNull(OfflineVoicePolicy.choose(voices, cloud.name, "en-AU"))
        assertNull(OfflineVoicePolicy.choose(voices, missing.name, "en-AU"))
        assertNull(OfflineVoicePolicy.choose(listOf(cloud, missing), null, "en-AU"))
    }

    @Test fun savedOfflineVoiceWinsAndMissingSavedVoiceRequiresAChoice() {
        val us = local.copy(name = "local-us", language = "en-US")
        assertEquals(us.name, OfflineVoicePolicy.choose(listOf(local, us), us.name, "en-AU"))
        assertNull(OfflineVoicePolicy.choose(listOf(local), "removed-voice", "en-AU"))
    }

    @Test fun automaticSelectionPrefersPhoneLocaleThenSameLanguageWithoutChangingLanguage() {
        val us = local.copy(name = "local-us", language = "en-US", quality = 500)
        assertEquals(local.name, OfflineVoicePolicy.choose(listOf(us, local), null, "en-AU"))
        assertEquals(us.name, OfflineVoicePolicy.choose(listOf(us), null, "en-AU"))
        assertNull(OfflineVoicePolicy.choose(listOf(local, us), null, "fr-FR"))
    }

    @Test fun equivalentVoiceSelectionIsStableAcrossEngineListOrder() {
        val second = local.copy(name = "local-au-b")
        assertEquals(local.name, OfflineVoicePolicy.choose(listOf(second, local), null, "en-AU"))
        assertEquals(local.name, OfflineVoicePolicy.choose(listOf(local, second), null, "en-AU"))
    }
}
