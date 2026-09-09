package com.argus.localcore

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class ArgusBridge(private val activity: MainActivity) {
    private val reminders = ReminderScheduler(activity)
    @JavascriptInterface
    fun getBridgeInfo(): String {
        return JSONObject()
            .put("version", "0.7.0-native")
            .put("host", "android")
            .put("capabilities", JSONArray(listOf("share_intake", "open_url", "apk_update", "file_picker", "local_reminder")))
            .put("message", "Android shell attached. Local reminders are available in Routines.")
            .toString()
    }

    @JavascriptInterface
    fun dispatchAction(actionJson: String): String = guarded {
        val action = JSONObject(actionJson)
        require(action.optString("status") == "approved") { "Approve the action before dispatch." }
        val capability = action.optString("capability")
        val payload = action.optJSONObject("payload") ?: JSONObject()

        when (capability) {
            "open_url" -> openUrl(payload)
            "apk_update" -> openUrl(payload)
            else -> JSONObject()
                .put("status", "blocked")
                .put("message", if (capability == "local_reminder") "Choose a time in Routines to schedule this reminder." else "This capability is not implemented yet.")
                .toString()
        }
    }

    @JavascriptInterface
    fun getReminderState(ignored: String): String = guarded { reminders.state().toString() }

    @JavascriptInterface
    fun scheduleReminder(payload: String): String = guarded { reminders.schedule(JSONObject(payload)).toString() }

    @JavascriptInterface
    fun cancelReminder(payload: String): String = guarded { reminders.cancel(JSONObject(payload)).toString() }

    @JavascriptInterface
    fun clearReminders(ignored: String): String = guarded { reminders.clear().toString() }

    @JavascriptInterface
    fun requestReminderPermission(ignored: String): String = guarded {
        activity.runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), MainActivity.NOTIFICATION_PERMISSION_CODE)
            } else {
                activity.refreshReminderUi()
            }
        }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun openNotificationSettings(ignored: String): String = guarded {
        activity.runOnUiThread {
            activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName))
        }
        JSONObject().put("status", "completed").toString()
    }

    private fun guarded(block: () -> String): String = try { block() } catch (error: Exception) {
        JSONObject().put("status", "blocked").put("message", error.message ?: "Android could not complete this action.").toString()
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
