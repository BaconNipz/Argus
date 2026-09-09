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
            .put("version", "0.8.0-native")
            .put("host", "android")
            .put("capabilities", JSONArray(listOf("share_intake", "open_url", "apk_update", "file_picker", "local_reminder", "offline_speech")))
            .put("message", "Android shell attached. Reminders and on-device speech input are available to check.")
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

    @JavascriptInterface
    fun getSpeechState(ignored: String): String = activity.offlineSpeech.snapshot()

    @JavascriptInterface
    fun startSpeech(payload: String): String = guarded {
        val input = JSONObject(payload)
        val id = checkedSpeechId(input)
        val language = checkedSpeechLanguage(input)
        activity.runOnUiThread { activity.offlineSpeech.start(id, language) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun stopSpeech(payload: String): String = guarded {
        val id = checkedSpeechId(JSONObject(payload))
        activity.runOnUiThread { activity.offlineSpeech.stop(id) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun cancelSpeech(payload: String): String = guarded {
        val id = checkedSpeechId(JSONObject(payload))
        activity.runOnUiThread { activity.offlineSpeech.cancel(id) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun requestSpeechPermission(ignored: String): String = guarded {
        activity.runOnUiThread {
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MainActivity.SPEECH_PERMISSION_CODE)
            } else activity.offlineSpeech.refreshState()
        }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun openSpeechSettings(payload: String): String = guarded {
        val permissions = JSONObject(payload).optBoolean("permissions")
        activity.runOnUiThread {
            val intent = if (permissions) Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
                else Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)
            runCatching { activity.startActivity(intent) }.onFailure {
                activity.emitSpeechEvent(JSONObject().put("type", "notice").put("message", "Android could not open that settings screen. Open it from the phone's Settings app."))
            }
        }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun checkSpeechLanguage(payload: String): String = guarded {
        val language = checkedSpeechLanguage(JSONObject(payload))
        activity.runOnUiThread { activity.offlineSpeech.checkLanguage(language) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun downloadSpeechLanguage(payload: String): String = guarded {
        val language = checkedSpeechLanguage(JSONObject(payload))
        activity.runOnUiThread { activity.offlineSpeech.checkLanguage(language, download = true) }
        JSONObject().put("status", "requested").toString()
    }

    private fun checkedSpeechId(input: JSONObject): String = input.getString("sessionId").also {
        require(it.matches(Regex("speech-[a-zA-Z0-9-]{1,80}"))) { "Invalid speech session." }
    }
    private fun checkedSpeechLanguage(input: JSONObject): String = input.getString("language").also {
        require(it.matches(Regex("[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*"))) { "Choose a valid speech language." }
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
