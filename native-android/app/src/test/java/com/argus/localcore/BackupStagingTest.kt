package com.argus.localcore

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Base64

class BackupStagingTest {
    @get:Rule val folder = TemporaryFolder()
    private fun encoded(value: String) = Base64.getEncoder().encodeToString(value.toByteArray(Charsets.UTF_8))

    @Test fun exactBytesMustBePreparedBeforeWritingAndSuccess() {
        val staging = BackupStaging(folder.newFolder())
        val content = "{\"note\":\"café 🌿\"}"
        val initial = staging.begin("argus-backup-2026-09-10.json", content.toByteArray(Charsets.UTF_8).size.toLong())
        staging.append(initial.id, 0, encoded(content))
        assertEquals("choosing", staging.prepare(initial.id).status)
        val file = staging.startWriting(initial.id)
        assertEquals(content, file.readText(Charsets.UTF_8))
        staging.finish(initial.id, "saved")
        assertEquals("saved", staging.state(initial.id).status)
        assertFalse(file.exists())
    }

    @Test fun incompleteChunksNeverOpenAPicker() {
        val staging = BackupStaging(folder.newFolder())
        val initial = staging.begin("argus-backup-2026.json", 4)
        staging.append(initial.id, 0, encoded("ab"))
        assertThrows(IllegalArgumentException::class.java) { staging.prepare(initial.id) }
        assertEquals("staging", staging.state(initial.id).status)
    }

    @Test fun duplicateOutOfOrderAndOversizedChunksAreRejected() {
        val staging = BackupStaging(folder.newFolder())
        val initial = staging.begin("argus-backup-2026.json", 4)
        staging.append(initial.id, 0, encoded("ab"))
        assertThrows(IllegalArgumentException::class.java) { staging.append(initial.id, 0, encoded("ab")) }
        assertThrows(IllegalArgumentException::class.java) { staging.append(initial.id, 3, encoded("a")) }
        assertThrows(IllegalArgumentException::class.java) { staging.append(initial.id, 2, encoded("xyz")) }
        staging.append(initial.id, 2, encoded("cd"))
        staging.prepare(initial.id)
        assertEquals("abcd", staging.startWriting(initial.id).readText())
    }

    @Test fun onlyOneOperationCanRunAndOldIdsCannotWriteNewFiles() {
        val staging = BackupStaging(folder.newFolder())
        val first = staging.begin("argus-backup-2026.json", 2)
        assertThrows(IllegalArgumentException::class.java) { staging.begin("argus-backup-2027.json", 2) }
        staging.finish(first.id, "cancelled")
        val second = staging.begin("argus-backup-2027.json", 2)
        assertThrows(IllegalArgumentException::class.java) { staging.append(first.id, 0, encoded("ab")) }
        staging.append(second.id, 0, encoded("{}"))
        assertEquals("choosing", staging.prepare(second.id).status)
    }

    @Test fun cancellationAndFailureCannotBecomeSavedLater() {
        val staging = BackupStaging(folder.newFolder())
        val initial = staging.begin("argus-backup-2026.json", 2)
        staging.append(initial.id, 0, encoded("{}"))
        staging.prepare(initial.id)
        staging.startWriting(initial.id)
        staging.finish(initial.id, "cancelled")
        staging.finish(initial.id, "saved")
        assertEquals("cancelled", staging.state(initial.id).status)
    }

    @Test fun filenamesAndTotalSizesAreBounded() {
        val staging = BackupStaging(folder.newFolder())
        assertThrows(IllegalArgumentException::class.java) { staging.begin("../../private.json", 2) }
        assertThrows(IllegalArgumentException::class.java) { staging.begin("argus-backup-2026.json", 0) }
        assertThrows(IllegalArgumentException::class.java) { staging.begin("argus-backup-2026.json", BackupStaging.MAX_BYTES + 1) }
    }

    @Test fun destroyingAnOperationClearsItsPrivateStagedCopy() {
        val directory = folder.newFolder()
        val staging = BackupStaging(directory)
        val initial = staging.begin("argus-backup-2026.json", 2)
        staging.append(initial.id, 0, encoded("{}"))
        staging.destroy()
        assertEquals("cancelled", staging.state(initial.id).status)
        assertEquals(0, directory.listFiles()!!.size)
    }
}
