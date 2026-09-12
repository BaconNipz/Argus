package com.argus.localcore

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.security.MessageDigest

object PhoneActionLauncher {
    private val history = PhoneActionHistory()

    fun launch(activity: MainActivity, action: JSONObject): String {
        val capability = action.getString("capability")
        val field = PhoneActionPolicy.field(capability)
        val payload = action.getJSONObject("payload")
        require(payload.length() == 1 && payload.has(field) && payload.get(field) is String) { "Check the phone action details before approval." }
        val spec = PhoneActionPolicy.plan(capability, payload.getString(field), action.optString("status") == "approved",
            activity.commandAccessForeground && activity.hasWindowFocus(), BackgroundWake.unlocked(activity))
        val id = action.getString("id")
        require(id.matches(Regex("act-[a-zA-Z0-9-]{1,100}"))) { "Invalid action identifier." }
        val fingerprint = MessageDigest.getInstance("SHA-256").digest((id + "\n" + spec.action + "\n" + spec.uri + "\n" + spec.text).toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        if (!history.begin(fingerprint)) return result("handed_off", "This action was already handed to Android. Create a new draft to repeat it.")
        try {
            val intent = Intent(spec.action).apply {
                if (spec.uri.isNotEmpty()) data = Uri.parse(spec.uri)
                if (capability == "share_text") { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, spec.text) }
            }
            if (intent.resolveActivity(activity.packageManager) == null) throw ActivityNotFoundException()
            activity.startActivity(if (capability == "share_text") Intent.createChooser(intent, "Share chosen text") else intent)
            return result("handed_off", when (capability) {
                "dial_number" -> "Handed the number to Android's dialer. Press Call there if you want to call."
                "map_search" -> "Handed the place search to Android's map app. Choose the location and any directions there."
                else -> "Opened Android's share chooser. Argus does not know whether you chose an app or sent the text."
            })
        } catch (_: ActivityNotFoundException) {
            history.failed(fingerprint)
            return result("blocked", "No compatible app is available. Install or enable an app for this action, then review and try again.")
        } catch (error: Exception) {
            history.failed(fingerprint)
            return result("blocked", "Android could not open that app. Review the action and try again.")
        }
    }
    private fun result(status: String, message: String): String = JSONObject().put("status", status).put("message", message).toString()
}
