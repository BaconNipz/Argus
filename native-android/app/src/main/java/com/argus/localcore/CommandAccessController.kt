package com.argus.localcore

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject

// All setup APIs run on the activity thread. The bridge reads only an immutable snapshot.
class CommandAccessController(private val activity: MainActivity) {
    private val handler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var tileRequest = 0
    private var tileBusy = false
    private var lastPinAt = -1000L
    private var message = "Long-press the Argus app icon for Command, or pin it below."
    private var tileMessage = "To add the tile manually, swipe down twice, tap Edit and drag Argus into your active tiles."
    @Volatile private var current = "{}"

    fun snapshot(): String = current

    private fun shortcut(): ShortcutInfo = ShortcutInfo.Builder(activity, SHORTCUT_ID)
        .setActivity(ComponentName(activity, MainActivity::class.java))
        .setShortLabel(activity.getString(R.string.command_shortcut_label))
        .setLongLabel(activity.getString(R.string.command_shortcut_long_label))
        .setIcon(Icon.createWithResource(activity, R.drawable.ic_argus))
        .setIntent(CommandEntry.intent(activity))
        .build()

    fun refresh(publish: Boolean = false) {
        if (destroyed) return
        var pinSupported = false
        var pinned = false
        var published = false
        runCatching {
            val manager = activity.getSystemService(ShortcutManager::class.java)
            if (manager != null) {
                if (publish && manager.dynamicShortcuts.none { it.id == SHORTCUT_ID } && !manager.isRateLimitingActive) {
                    manager.addDynamicShortcuts(listOf(shortcut()))
                }
                pinSupported = manager.isRequestPinShortcutSupported
                pinned = manager.pinnedShortcuts.any { it.id == SHORTCUT_ID }
                published = manager.dynamicShortcuts.any { it.id == SHORTCUT_ID }
            }
        }.onFailure { message = "Android could not check launcher shortcuts. Try Refresh access, or use the Argus tile." }
        current = JSONObject().put("available", true)
            .put("pinSupported", pinSupported).put("shortcutPinned", pinned).put("shortcutPublished", published)
            .put("tilePromptSupported", Build.VERSION.SDK_INT >= 33)
            .put("tileRequestPending", tileBusy).put("message", message).put("tileMessage", tileMessage).toString()
        activity.emitCommandAccessEvent(current)
    }

    private fun canRequest(): Boolean {
        if (destroyed) return false
        if (activity.commandAccessForeground && !activity.isFinishing && !activity.isDestroyed) return true
        message = "Return to Argus and tap the setup button again."
        refresh()
        return false
    }

    fun requestPin() {
        if (!canRequest()) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastPinAt < 1000) return
        lastPinAt = now
        runCatching {
            val manager = activity.getSystemService(ShortcutManager::class.java)
            message = if (manager?.isRequestPinShortcutSupported != true) {
                "This launcher does not offer a pin prompt. Long-press the Argus app icon and look for Command."
            } else if (manager.requestPinShortcut(shortcut(), null)) {
                // Android returns acceptance, not confirmation; cancellation has no callback.
                "Shortcut requested. Confirm Add in your launcher, then check your home screen. Cancelling leaves it unchanged."
            } else "The launcher did not accept the shortcut request. Try its long-press menu."
        }.onFailure { message = "Android could not request the shortcut. Try its long-press menu or Refresh access." }
        refresh()
    }

    fun requestTile() {
        if (!canRequest() || tileBusy) return
        if (Build.VERSION.SDK_INT < 33) {
            tileMessage = "On this Android version, swipe down twice, tap Edit and drag Argus into your active tiles."
            refresh()
            return
        }
        val manager = activity.getSystemService(StatusBarManager::class.java)
        if (manager == null) {
            tileMessage = "The tile prompt is unavailable. Add Argus from the Quick Settings Edit screen."
            refresh()
            return
        }
        val request = ++tileRequest
        tileBusy = true
        tileMessage = "Choose Add in Android's tile prompt."
        val timeout = Runnable {
            if (!destroyed && tileRequest == request && tileBusy) {
                tileBusy = false
                tileRequest++ // A late result belongs to the expired request.
                tileMessage = "Android has not returned a tile result. Check your tiles, or add Argus from Edit."
                refresh()
            }
        }
        handler.postDelayed(timeout, 45000)
        refresh()
        runCatching {
            manager.requestAddTileService(ComponentName(activity, CommandTileService::class.java),
                activity.getString(R.string.command_tile_label), Icon.createWithResource(activity, R.drawable.ic_command),
                activity.mainExecutor) { result ->
                if (!destroyed && tileRequest == request) {
                    handler.removeCallbacks(timeout)
                    tileBusy = false
                    tileMessage = when (result) {
                        StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> "Argus tile added. Swipe down to find it."
                        StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> "Argus is already in your tiles. Use Edit to move it nearer the top."
                        StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> "The tile was not added. You can try again or add Argus manually from Edit."
                        StatusBarManager.TILE_ADD_REQUEST_ERROR_REQUEST_IN_PROGRESS -> "Android already has a tile request open. Finish that prompt or use Edit."
                        StatusBarManager.TILE_ADD_REQUEST_ERROR_APP_NOT_IN_FOREGROUND -> "Return to Argus and tap Add Quick Settings tile again."
                        else -> "Android could not add the tile (code $result). Use the Quick Settings Edit screen."
                    }
                    refresh()
                }
            }
        }.onFailure {
            handler.removeCallbacks(timeout)
            tileBusy = false
            tileMessage = "Android could not open the tile prompt. Add Argus from the Quick Settings Edit screen."
            refresh()
        }
    }

    fun destroy() {
        destroyed = true
        tileRequest++
        handler.removeCallbacksAndMessages(null)
    }

    companion object { private const val SHORTCUT_ID = "argus-command" }
}
