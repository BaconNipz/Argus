package com.argus.localcore

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.JsResult
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var pendingSharedText: String? = null
    private var pendingReminder: String? = null
    private val commandLaunch = CommandLaunchQueue()
    private val voiceScreenOwners = mutableSetOf<String>()
    @Volatile var commandAccessForeground = false
        private set
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    lateinit var backupDocuments: BackupDocumentController
        private set
    lateinit var offlineSpeech: OfflineSpeechController
        private set
    lateinit var offlineTts: OfflineTtsController
        private set
    lateinit var commandAccess: CommandAccessController
        private set
    lateinit var wakePhrase: WakePhraseController
        private set

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        commandLaunch.initialize(intent?.action, savedInstanceState != null, savedInstanceState?.getString(COMMAND_LAUNCH_STATE))

        webView = WebView(this)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton("Continue") { _, _ -> result?.confirm() }
                    .setNegativeButton("Cancel") { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }.show()
                return true
            }
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val acceptedTypes = fileChooserParams?.acceptTypes?.filter { it.contains("/") }?.toTypedArray() ?: emptyArray()
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = acceptedTypes.singleOrNull() ?: "*/*"
                    if (acceptedTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, acceptedTypes)
                    putExtra(Intent.EXTRA_LOCAL_ONLY, true)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }

                return try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                    true
                } catch (error: Exception) {
                    this@MainActivity.filePathCallback = null
                    filePathCallback?.onReceiveValue(null)
                    false
                }
            }
        }
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == "appassets.androidplatform.net" && uri.path?.startsWith("/assets/argus/") == true) return false
                if (request.isForMainFrame && uri.scheme in listOf("https", "http")) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                flushPendingShare()
                refreshReminderUi()
            }
        }
        backupDocuments = BackupDocumentController(this)
        offlineSpeech = OfflineSpeechController(this, ::emitSpeechEvent)
        offlineTts = OfflineTtsController(this, ::emitTtsEvent)
        commandAccess = CommandAccessController(this)
        wakePhrase = WakePhraseController(this, ::emitWakeEvent)
        webView.addJavascriptInterface(ArgusBridge(this), "ArgusAndroid")

        setContentView(webView)
        pendingSharedText = extractSharedText(intent)
        pendingReminder = intent?.getStringExtra("argus_reminder")
        webView.loadUrl("https://appassets.androidplatform.net/assets/argus/index.html")
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        commandLaunch.accept(intent?.action)
        pendingSharedText = extractSharedText(intent)
        pendingReminder = intent?.getStringExtra("argus_reminder")
        flushPendingShare()
        refreshReminderUi()
    }

    override fun onResume() {
        super.onResume()
        commandAccessForeground = true
        if (::commandAccess.isInitialized) commandAccess.refresh(publish = true)
        if (::offlineSpeech.isInitialized) offlineSpeech.resume()
        if (::offlineTts.isInitialized) offlineTts.resume()
        if (::wakePhrase.isInitialized) wakePhrase.resume()
        refreshReminderUi()
    }

    override fun onPause() {
        commandAccessForeground = false
        if (::wakePhrase.isInitialized) wakePhrase.pause()
        if (::offlineSpeech.isInitialized) offlineSpeech.pause()
        if (::offlineTts.isInitialized) offlineTts.pause()
        voiceScreenOwners.clear()
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onPause()
    }

    override fun onDestroy() {
        commandAccessForeground = false
        if (::wakePhrase.isInitialized) wakePhrase.destroy()
        if (::commandAccess.isInitialized) commandAccess.destroy()
        if (::backupDocuments.isInitialized) backupDocuments.destroy()
        if (::offlineSpeech.isInitialized) offlineSpeech.destroy()
        if (::offlineTts.isInitialized) offlineTts.destroy()
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("ArgusAndroid")
            webView.destroy()
        }
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        commandLaunch.peek()?.let { outState.putString(COMMAND_LAUNCH_STATE, it) }
        super.onSaveInstanceState(outState)
    }

    fun pendingCommandLaunch(): String = JSONObject().apply {
        commandLaunch.peek()?.let { put("requestId", it) }
    }.toString()

    fun consumeCommandLaunch(id: String): Boolean =
        commandAccessForeground && commandLaunch.consume(id)

    fun emitCommandAccessEvent(snapshot: String) {
        if (!::webView.isInitialized || isDestroyed) return
        webView.evaluateJavascript("window.ArgusCommandAccessInbox?.receive($snapshot)", null)
    }

    fun emitSpeechEvent(event: JSONObject) {
        if (!::webView.isInitialized || isDestroyed) return
        webView.evaluateJavascript("window.ArgusSpeechInbox?.receive(${event})", null)
    }

    fun emitTtsEvent(event: JSONObject) {
        if (!::webView.isInitialized || isDestroyed) return
        webView.evaluateJavascript("window.ArgusTtsInbox?.receive(${event})", null)
    }

    fun emitWakeEvent(event: JSONObject) {
        if (!::webView.isInitialized || isDestroyed) return
        webView.evaluateJavascript("window.ArgusWakeInbox?.receive($event)", null)
    }

    fun setVoiceScreenAwake(owner: String, keep: Boolean) {
        if (keep && commandAccessForeground && !isDestroyed) voiceScreenOwners.add(owner)
        else voiceScreenOwners.remove(owner)
        if (voiceScreenOwners.isEmpty()) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_PERMISSION_CODE) refreshReminderUi()
        if (requestCode == SPEECH_PERMISSION_CODE && ::offlineSpeech.isInitialized) offlineSpeech.refreshState()
    }

    fun refreshReminderUi() {
        if (!::webView.isInitialized || isDestroyed) return
        val reminder = pendingReminder
        if (reminder != null) {
            webView.evaluateJavascript("window.ArgusOpenReminder?.(${JSONObject.quote(reminder)})") { result ->
                if (result == "true" && pendingReminder == reminder) pendingReminder = null
            }
        }
        webView.evaluateJavascript("window.dispatchEvent(new Event('argus-native-resume'))", null)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == BackupDocumentController.REQUEST_CODE) {
            backupDocuments.onResult(resultCode, data)
            return
        }
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) return

        val callback = filePathCallback ?: return
        val results = if (resultCode == RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        } else {
            null
        }

        callback.onReceiveValue(results ?: emptyArray())
        filePathCallback = null
    }

    private fun extractSharedText(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") {
            return null
        }

        val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
        return listOf(subject, text)
            .filter { it.isNotBlank() }
            .joinToString(separator = "\n")
            .ifBlank { null }
    }

    private fun flushPendingShare() {
        val sharedText = pendingSharedText ?: return
        val quoted = JSONObject.quote(sharedText)
        webView.evaluateJavascript("window.ArgusNativeInbox?.receiveShare($quoted)", null)
        pendingSharedText = null
    }

    companion object {
        private const val COMMAND_LAUNCH_STATE = "argus.pendingCommandLaunch"
        private const val FILE_CHOOSER_REQUEST_CODE = 701
        const val NOTIFICATION_PERMISSION_CODE = 702
        const val SPEECH_PERMISSION_CODE = 703
    }
}
