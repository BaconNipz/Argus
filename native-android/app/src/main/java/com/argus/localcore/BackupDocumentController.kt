package com.argus.localcore

import android.app.Activity
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class BackupDocumentController(private val activity: MainActivity) {
    private val staging = BackupStaging(File(activity.cacheDir, "backup-staging"))
    private val executor = Executors.newSingleThreadExecutor()
    private var pickerId: String? = null // Main-thread only.

    fun begin(input: JSONObject) = json(staging.begin(input.getString("filename"), input.getLong("bytes")))
    fun append(input: JSONObject): JSONObject {
        staging.append(input.getString("id"), input.getLong("offset"), input.getString("data"))
        return JSONObject().put("status", "staging")
    }
    fun state(input: JSONObject) = json(staging.state(input.getString("id")))
    fun cancel(input: JSONObject): JSONObject {
        val id = input.getString("id")
        staging.finish(id, "cancelled")
        return json(staging.state(id))
    }
    fun finish(input: JSONObject): JSONObject {
        val value = staging.prepare(input.getString("id"))
        activity.runOnUiThread {
            try {
                check(!activity.isFinishing && !activity.isDestroyed) { "Argus was closed before choosing a file." }
                check(pickerId == null) { "A backup file picker is already open." }
                pickerId = value.id
                activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/json"
                    putExtra(Intent.EXTRA_TITLE, value.filename)
                    putExtra(Intent.EXTRA_LOCAL_ONLY, true)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }, REQUEST_CODE)
            } catch (error: Exception) {
                pickerId = null
                staging.finish(value.id, "failed", "Could not open the Android save picker. Please try again.")
            }
        }
        return json(value)
    }

    fun onResult(resultCode: Int, data: Intent?) {
        val id = pickerId ?: return
        pickerId = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            staging.finish(id, "cancelled")
            return
        }
        executor.execute {
            try {
                require(uri.scheme == "content") { "Choose a document from the Android file picker." }
                val source = staging.startWriting(id)
                val digest = MessageDigest.getInstance("SHA-256")
                val expectedBytes = staging.state(id).bytes
                activity.contentResolver.openOutputStream(uri, "wt").use { output ->
                    requireNotNull(output) { "The selected folder could not be written." }
                    source.inputStream().use { input ->
                        val buffer = ByteArray(49152)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            check(staging.state(id).status == "writing") { "Save was interrupted." }
                            output.write(buffer, 0, count)
                            digest.update(buffer, 0, count)
                        }
                    }
                    output.flush()
                }
                verify(uri, expectedBytes, digest.digest())
                staging.finish(id, "saved", "Backup saved and checked.")
            } catch (error: Exception) {
                runCatching { staging.finish(id, "failed", "Could not save and verify the backup. Your Argus data is unchanged. Any incomplete file should be discarded; try another local folder.") }
            }
        }
    }

    private fun verify(uri: Uri, expectedBytes: Long, expectedDigest: ByteArray) {
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0L
        activity.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Could not reopen the saved backup." }
            val buffer = ByteArray(49152)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                check(total <= expectedBytes) { "Saved file has an unexpected size." }
                digest.update(buffer, 0, count)
            }
        }
        check(total == expectedBytes && digest.digest().contentEquals(expectedDigest)) { "Saved backup differs from the original." }
    }

    fun destroy() { staging.destroy(); executor.shutdownNow() }

    private fun json(value: BackupExportState) = JSONObject().put("id", value.id).put("status", value.status)
        .put("filename", value.filename).put("bytes", value.bytes).put("message", value.message)

    companion object { const val REQUEST_CODE = 704 }
}
