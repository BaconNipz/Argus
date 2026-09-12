package com.argus.localcore

import java.net.URLEncoder

data class PhoneActionSpec(val action: String, val uri: String = "", val text: String = "")

object PhoneActionPolicy {
    fun field(capability: String): String = when (capability) {
        "map_search" -> "query"
        "dial_number" -> "number"
        "share_text" -> "text"
        else -> throw IllegalArgumentException("Unsupported phone action.")
    }
    fun plan(capability: String, input: String, approved: Boolean, foreground: Boolean, unlocked: Boolean): PhoneActionSpec {
        require(approved) { "Approve this action first." }
        require(foreground && unlocked) { "Open and unlock Argus before opening another app." }
        field(capability)
        val value = input.trim()
        val limit = when (capability) { "dial_number" -> 80; "map_search" -> 500; else -> 4000 }
        require(value.isNotEmpty() && value.length <= limit) { "Phone action text is empty or too long." }
        require(value.none { (it.code < 32 && !(capability == "share_text" && it in listOf('\n', '\r', '\t'))) || it.code == 127 }) { "Remove control characters from this action." }
        return when (capability) {
            "dial_number" -> {
                require(value.matches(Regex("[+0-9 ()-]+"))) { "Use digits; contact names, extensions and service codes are not supported." }
                val number = value.replace(Regex("[ ()-]"), "")
                require(number.matches(Regex("\\+?[0-9]{3,15}"))) { "Use 3–15 digits with an optional leading country code." }
                PhoneActionSpec("android.intent.action.DIAL", "tel:$number")
            }
            "map_search" -> PhoneActionSpec("android.intent.action.VIEW", "geo:0,0?q=" + URLEncoder.encode(value, "UTF-8").replace("+", "%20"))
            else -> PhoneActionSpec("android.intent.action.SEND", text = value)
        }
    }
}

// Suppress repeated taps for the same reviewed handoff during this process lifetime.
// Editing the payload changes the key. Restored pending actions still require fresh approval.
class PhoneActionHistory {
    private val sent = linkedSetOf<String>()
    @Synchronized fun begin(key: String): Boolean {
        if (key in sent) return false
        sent.add(key)
        if (sent.size > 128) sent.remove(sent.first())
        return true
    }
    @Synchronized fun failed(key: String) { sent.remove(key) }
}
