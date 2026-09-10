package com.argus.localcore

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

object CommandEntry {
    fun intent(context: Context): Intent = Intent(context, MainActivity::class.java).apply {
        action = CommandLaunchQueue.ACTION
        // Reuse the existing WebView and typed draft when the app is already running.
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
}

class CommandTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            label = getString(R.string.command_tile_label)
            contentDescription = getString(R.string.command_tile_description)
            if (Build.VERSION.SDK_INT >= 29) subtitle = getString(R.string.command_shortcut_label)
            if (Build.VERSION.SDK_INT >= 30) stateDescription = getString(R.string.command_tile_description)
            // An entry point, not a microphone toggle or an always-listening indicator.
            state = Tile.STATE_INACTIVE
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        if (isLocked) unlockAndRun { openCommand() } else openCommand()
    }

    @Suppress("DEPRECATION")
    private fun openCommand() {
        runCatching {
            val intent = CommandEntry.intent(this)
            if (Build.VERSION.SDK_INT >= 34) {
                val pending = PendingIntent.getActivity(this, 705, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                startActivityAndCollapse(pending)
            } else {
                startActivityAndCollapse(intent)
            }
        }.onFailure {
            Toast.makeText(this, R.string.command_launch_failed, Toast.LENGTH_LONG).show()
        }
    }
}
