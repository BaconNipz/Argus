package com.argus.localcore

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class ArgusBridge(private val activity: Activity) {
    @JavascriptInterface
    fun getBridgeInfo(): String {
        return JSONObject()
            .put("version", "0.5.0-native-scaffold")
            .put("host", "android")
            .put("capabilities", JSONArray(listOf("share_intake", "open_url", "apk_update", "file_picker")))
            .put("message", "Native Android shell scaffold is attached.")
            .toString()
    }

    @JavascriptInterface
    fun dispatchAction(actionJson: String): String {
        val action = JSONObject(actionJson)
        val capability = action.optString("capability")
        val payload = action.optJSONObject("payload") ?: JSONObject()

        return when (capability) {
            "open_url" -> openUrl(payload)
            "apk_update" -> openUrl(payload)
            else -> JSONObject()
                .put("status", "queued")
                .put("message", "Native scaffold received ${capability.ifBlank { "unknown" }}.")
                .toString()
        }
    }

    private fun openUrl(payload: JSONObject): String {
        val url = payload.optString("url")
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return JSONObject()
                .put("status", "blocked")
                .put("message", "open_url requires an http or https URL.")
                .toString()
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        activity.startActivity(intent)
        return JSONObject()
            .put("status", "completed")
            .put("message", "Opened URL.")
            .toString()
    }
}
