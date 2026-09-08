package com.argus.localcore

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webChromeClient = WebChromeClient()
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                flushPendingShare()
            }
        }
        webView.addJavascriptInterface(ArgusBridge(this), "ArgusAndroid")

        setContentView(webView)
        pendingSharedText = extractSharedText(intent)
        webView.loadUrl("https://appassets.androidplatform.net/assets/argus/index.html")
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingSharedText = extractSharedText(intent)
        flushPendingShare()
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
}
