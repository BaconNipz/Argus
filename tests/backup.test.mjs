import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_STORES, MAX_BACKUP_BYTES, decodeBackupAttachment, readBackupFile, saveNativeBackup, validateBackup } from "../src/backup.js";
import { prepareArgusImport } from "../src/db.js";

function backup() {
  return { format: "argus-backup", schema: 4, appVersion: "0.11.0", exportedAt: "2026-09-10T00:00:00Z", ...Object.fromEntries(BACKUP_STORES.map(store => [store, []])) };
}

test("review counts all records and decodes attachments without opening the database", async () => {
  const data = backup();
  data.memory = [{ id: "mem-1", text: "A saved note", tags: ["test"] }];
  data.evidence = [{ id: "ev-1", blobDataUrl: "data:application/octet-stream;base64,AAEC/w==" }];
  data.voiceNotes = [{ id: "voice-1", blobDataUrl: "data:audio/webm;codecs=opus;base64,AQID" }];
  const { summary, payload } = await readBackupFile(new Blob([JSON.stringify(data)]));
  assert.equal(summary.counts.memory, 1);
  assert.equal(summary.attachments, 2);
  const prepared = await prepareArgusImport(payload);
  assert.deepEqual([...new Uint8Array(await prepared.evidence[0].blob.arrayBuffer())], [0, 1, 2, 255]);
  assert.deepEqual([...new Uint8Array(await prepared.voiceNotes[0].blob.arrayBuffer())], [1, 2, 3]);
  assert.equal(prepared.evidence[0].blobDataUrl, undefined);
});

test("restoration strips live reminder authority and previously approved actions", async () => {
  const data = backup();
  data.reminders = [{ id: "rem-1", title: "Tea", enabled: true, status: "snoozed", nextRunAt: "2026-09-11T00:00:00Z", revision: "old", notificationToken: "active", snoozedUntil: "2026-09-10T00:10:00Z" }];
  data.actions = [{ id: "act-1", status: "approved", requiresConfirmation: false }, { id: "act-2", status: "completed" }];
  const prepared = await prepareArgusImport(data);
  assert.equal(prepared.reminders[0].enabled, false);
  assert.equal(prepared.reminders[0].status, "paused");
  assert.equal(prepared.reminders[0].notificationToken, undefined);
  assert.equal(prepared.reminders[0].snoozedUntil, undefined);
  assert.equal(prepared.actions[0].status, "draft");
  assert.equal(prepared.actions[0].requiresConfirmation, true);
  assert.equal(prepared.actions[1].status, "completed");
});

test("damaged data is rejected during preparation before any database replacement", async () => {
  for (const attachment of ["https://example.com/file", "data:image/png;base64,A", "data:image/png;base64,!!!!", "data:image/png;base64,AB=="]) {
    const data = backup();
    data.evidence = [{ id: "ev-1", blobDataUrl: attachment }];
    await assert.rejects(prepareArgusImport(data), /attachment/);
  }
  assert.equal((await decodeBackupAttachment("data:text/plain;base64,").text()), "");
});

test("invalid schemas, missing lists, duplicates and malformed record shapes cannot restore", () => {
  const cases = [
    { ...backup(), schema: 5 }, { ...backup(), schema: "4" }, { ...backup(), format: "other" },
    { ...backup(), memory: undefined }, { ...backup(), exportedAt: "invalid" },
    { ...backup(), memory: [{ id: "a" }, { id: "a" }] },
    { ...backup(), investigations: [{ id: "case-1", sources: {} }] },
    { ...backup(), memory: [{ id: "a", tags: "invalid" }] },
    { ...backup(), evidence: [{ id: "a", blob: {} }] },
    { ...backup(), reminders: [{ id: "not-a-reminder" }] }
  ];
  for (const payload of cases) assert.throws(() => validateBackup(payload));
});

test("legacy schema backups remain readable and unsupported files are bounded", async () => {
  const legacy = { ...backup(), schema: 3 };
  delete legacy.format; delete legacy.appVersion; delete legacy.reminders;
  assert.equal(validateBackup(legacy).counts.reminders, 0);
  await assert.rejects(readBackupFile({ size: MAX_BACKUP_BYTES + 1, text() { throw Error("should not read"); } }), /64 MiB/);
  await assert.rejects(readBackupFile(new Blob(["not json"])), /readable JSON/);
});

test("Android backup transfers Unicode and binary attachments in ordered bounded chunks", async () => {
  const original = new Blob([JSON.stringify({ text: "🌿 café العربية ".repeat(10000), attachment: "data:application/octet-stream;base64,AAEC/w==" })]);
  const chunks = [];
  let expected = 0;
  let finished = false;
  const bridge = {
    beginBackupExport(input) { expected = JSON.parse(input).bytes; return '{"id":"transfer-1","status":"staging"}'; },
    appendBackupExport(input) {
      const value = JSON.parse(input);
      assert.equal(value.offset, chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      const bytes = Buffer.from(value.data, "base64");
      assert.ok(bytes.length <= 49152);
      chunks.push(bytes);
      return '{"status":"staging"}';
    },
    finishBackupExport() { finished = true; assert.equal(Buffer.concat(chunks).length, expected); return '{"status":"choosing"}'; },
    getBackupExportState() { assert.ok(finished); return '{"status":"saved"}'; }
  };
  assert.equal((await saveNativeBackup(original, "argus-backup-2026-09-10.json", () => {}, bridge)).status, "saved");
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(await original.arrayBuffer()));
});

test("picker cancellation is not reported as success and failures release staging", async () => {
  let cancelled = false;
  const bridge = {
    beginBackupExport() { return '{"id":"transfer-1"}'; }, appendBackupExport() { return '{"status":"staging"}'; },
    finishBackupExport() { return '{"status":"choosing"}'; }, getBackupExportState() { return '{"status":"cancelled"}'; },
    cancelBackupExport() { cancelled = true; return '{"status":"cancelled"}'; }
  };
  assert.equal((await saveNativeBackup(new Blob(["{}"]), "argus-backup-2026.json", () => {}, bridge)).status, "cancelled");
  bridge.getBackupExportState = () => '{"status":"failed","message":"Write failed"}';
  await assert.rejects(saveNativeBackup(new Blob(["{}"]), "argus-backup-2026.json", () => {}, bridge), /Write failed/);
  assert.equal(cancelled, true);
});
