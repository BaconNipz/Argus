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
            .put("version", "0.13.0-native")
            .put("host", "android")
            .put("capabilities", JSONArray(listOf("share_intake", "open_url", "apk_update", "file_picker", "document_backup", "local_reminder", "offline_speech", "offline_tts", "command_access", "wake_phrase")))
            .put("message", "Android shell attached. Reminder alerts and on-device speech input/output are available to check.")
            .toString()
    }

    @JavascriptInterface
    fun getCommandAccessState(ignored: String): String = activity.commandAccess.snapshot()

    @JavascriptInterface
    fun getWakeState(ignored: String): String = activity.wakePhrase.snapshot()

    @JavascriptInterface
    fun startWakeListening(payload: String): String = guarded {
        val input = JSONObject(payload)
        val id = checkedWakeId(input, "sessionId")
        val sensitivity = input.getString("sensitivity")
        WakePolicy.sensitivity(sensitivity)
        activity.runOnUiThread { activity.wakePhrase.start(id, sensitivity) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun stopWakeListening(payload: String): String = guarded {
        val id = checkedWakeId(JSONObject(payload), "sessionId")
        activity.runOnUiThread { activity.wakePhrase.cancel(id) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun startSpeechFromWake(payload: String): String = guarded {
        val input = JSONObject(payload)
        val wakeId = checkedWakeId(input, "wakeId")
        val speechId = checkedSpeechId(input)
        val language = checkedSpeechLanguage(input)
        activity.runOnUiThread { activity.wakePhrase.startCommand(wakeId, speechId, language) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun refreshCommandAccess(ignored: String): String = guarded {
        activity.runOnUiThread { activity.commandAccess.refresh(publish = true) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun pinCommandShortcut(ignored: String): String = guarded {
        activity.runOnUiThread { activity.commandAccess.requestPin() }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun addCommandTile(ignored: String): String = guarded {
        activity.runOnUiThread { activity.commandAccess.requestTile() }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun getPendingCommandLaunch(ignored: String): String = activity.pendingCommandLaunch()

    @JavascriptInterface
    fun consumeCommandLaunch(payload: String): String = guarded {
        val id = JSONObject(payload).getString("requestId")
        JSONObject().put("consumed", activity.consumeCommandLaunch(id)).toString()
    }

    @JavascriptInterface
    fun beginBackupExport(payload: String): String = guarded { activity.backupDocuments.begin(JSONObject(payload)).toString() }
    @JavascriptInterface
    fun appendBackupExport(payload: String): String = guarded { activity.backupDocuments.append(JSONObject(payload)).toString() }
    @JavascriptInterface
    fun finishBackupExport(payload: String): String = guarded { activity.backupDocuments.finish(JSONObject(payload)).toString() }
    @JavascriptInterface
    fun getBackupExportState(payload: String): String = guarded { activity.backupDocuments.state(JSONObject(payload)).toString() }
    @JavascriptInterface
    fun cancelBackupExport(payload: String): String = guarded { activity.backupDocuments.cancel(JSONObject(payload)).toString() }

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
    fun actOnReminderNotification(payload: String): String = guarded { reminders.actOnNotification(JSONObject(payload)).toString() }

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
            val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, ReminderScheduler.CHANNEL)
            runCatching { activity.startActivity(intent) }.onFailure {
                runCatching { activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)) }
            }
        }
        JSONObject().put("status", "completed").toString()
    }

    @JavascriptInterface
    fun testReminderNotification(ignored: String): String = guarded { reminders.testNotification().toString() }

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

    @JavascriptInterface
    fun getTtsState(ignored: String): String = activity.offlineTts.snapshot()

    @JavascriptInterface
    fun refreshTtsVoices(ignored: String): String = guarded {
        activity.runOnUiThread { activity.offlineTts.initialize() }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun selectTtsVoice(payload: String): String = guarded {
        val name = JSONObject(payload).getString("voiceId")
        require(name.isNotBlank() && name.length <= 500) { "Choose an installed offline voice." }
        activity.runOnUiThread { activity.offlineTts.selectVoice(name) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun speakOffline(payload: String): String = guarded {
        val input = JSONObject(payload)
        val id = checkedTtsId(input)
        val text = input.getString("text").trim()
        require(text.isNotBlank() && text.length <= android.speech.tts.TextToSpeech.getMaxSpeechInputLength()) { "This reply is empty or too long to speak." }
        activity.runOnUiThread { activity.offlineTts.speak(id, text) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun stopTts(payload: String): String = guarded {
        val id = checkedTtsId(JSONObject(payload))
        activity.runOnUiThread { activity.offlineTts.stop(id) }
        JSONObject().put("status", "requested").toString()
    }

    @JavascriptInterface
    fun openTtsSettings(ignored: String): String = guarded {
        activity.runOnUiThread {
            runCatching { activity.startActivity(Intent("com.android.settings.TTS_SETTINGS")) }.onFailure {
                activity.emitTtsEvent(JSONObject().put("type", "notice")
                    .put("message", "Open your phone Settings and search for Text-to-speech to manage voices."))
            }
        }
        JSONObject().put("status", "requested").toString()
    }

    private fun checkedTtsId(input: JSONObject): String = input.getString("sessionId").also {
        require(it.matches(Regex("tts-[a-zA-Z0-9-]{1,80}"))) { "Invalid speech-output session." }
    }

    private fun checkedWakeId(input: JSONObject, key: String): String = input.getString(key).also {
        require(it.matches(Regex("wake-[a-zA-Z0-9-]{1,80}"))) { "Invalid wake session." }
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
