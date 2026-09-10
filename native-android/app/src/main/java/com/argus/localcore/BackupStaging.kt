package com.argus.localcore

import java.io.File
import java.util.Base64
import java.util.UUID

data class BackupExportState(val id: String, val status: String, val filename: String, val bytes: Long, val message: String = "")

// Short bridge chunks avoid passing an entire attachment-heavy backup through one call.
class BackupStaging(private val directory: File) {
    private var file: File? = null
    private var current: BackupExportState? = null
    init {
        directory.mkdirs()
        val abandonedBefore = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        directory.listFiles()?.filter { it.name.startsWith("argus-backup-") && it.lastModified() < abandonedBefore }?.forEach { it.delete() }
    }

    @Synchronized fun begin(filename: String, bytes: Long): BackupExportState {
        require(current?.status !in listOf("staging", "choosing", "writing")) { "Finish the current backup first." }
        require(bytes in 1..MAX_BYTES) { "Backups must be between 1 byte and 64 MiB." }
        require(Regex("argus-backup-[0-9T-]+\\.json").matches(filename)) { "Invalid backup filename." }
        file?.delete()
        file = File.createTempFile("argus-backup-", ".json", directory)
        current = BackupExportState(UUID.randomUUID().toString(), "staging", filename, bytes)
        return current!!
    }

    @Synchronized fun state(id: String): BackupExportState {
        val value = current
        require(value != null && value.id == id) { "Backup saving was interrupted. Please try again." }
        return value
    }

    @Synchronized fun append(id: String, offset: Long, data: String) {
        val value = state(id)
        require(value.status == "staging" && data.length <= 65536) { "Invalid backup chunk." }
        val target = requireNotNull(file)
        require(offset == target.length()) { "Backup chunks arrived out of order." }
        val bytes = Base64.getDecoder().decode(data)
        require(bytes.isNotEmpty() && bytes.size <= 49152 && offset + bytes.size <= value.bytes) { "Backup chunk exceeds its expected size." }
        target.appendBytes(bytes)
    }

    @Synchronized fun prepare(id: String): BackupExportState {
        val value = state(id)
        require(value.status == "staging" && file?.length() == value.bytes) { "The backup is incomplete; no document was opened." }
        current = value.copy(status = "choosing")
        return current!!
    }

    @Synchronized fun startWriting(id: String): File {
        val value = state(id)
        require(value.status == "choosing") { "This backup picker is no longer active." }
        current = value.copy(status = "writing")
        return requireNotNull(file)
    }

    @Synchronized fun finish(id: String, status: String, message: String = "") {
        val value = state(id)
        require(status in listOf("saved", "cancelled", "failed"))
        if (value.status in listOf("saved", "cancelled", "failed")) return
        require(status != "saved" || value.status == "writing")
        current = value.copy(status = status, message = message)
        file?.delete()
        file = null
    }

    @Synchronized fun destroy() {
        current?.let { finish(it.id, "cancelled", "Backup saving was interrupted.") }
        file?.delete()
    }

    companion object { const val MAX_BYTES = 64L * 1024 * 1024 }
}
