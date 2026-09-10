export const BACKUP_STORES = ["memory", "investigations", "tools", "voiceNotes", "actions", "reminders", "evidence", "settings", "events"];
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }

export function decodeBackupAttachment(value) {
  if (typeof value !== "string") throw new Error("A backup attachment is invalid.");
  const match = value.match(/^data:([^,;]+(?:;[^,;]+)*);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[2].length % 4 !== 0) throw new Error("A backup attachment is damaged or unsupported.");
  let binary;
  try { binary = atob(match[2]); } catch { throw new Error("A backup attachment is damaged."); }
  if (btoa(binary) !== match[2]) throw new Error("A backup attachment has invalid base64 data.");
  return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1] });
}

function validateRecord(record, label) {
  if (!object(record) || typeof record.id !== "string" || !record.id.trim()) throw new Error(`Invalid record in ${label}.`);
  for (const field of ["tags", "checklist"]) {
    if (record[field] !== undefined && (!Array.isArray(record[field]) || record[field].some(item => typeof item !== "string"))) throw new Error(`Invalid ${field} in ${label}.`);
  }
  for (const field of ["text", "title", "name", "url", "note", "summary", "transcript", "target", "status", "type", "category", "capability"]) {
    if (record[field] !== undefined && typeof record[field] !== "string") throw new Error(`Invalid ${field} in ${label}.`);
  }
  if (record.sources !== undefined) {
    if (!Array.isArray(record.sources)) throw new Error(`Invalid sources in ${label}.`);
    for (const source of record.sources) {
      if (source?.sources !== undefined) throw new Error("Nested source lists are not supported.");
      validateRecord(source, "sources");
    }
  }
  if (record.blob != null) throw new Error("Backup files must contain encoded attachments, not raw blob objects.");
  if (record.blobDataUrl !== undefined && typeof record.blobDataUrl !== "string") throw new Error("Invalid backup attachment.");
}

export function validateBackup(payload) {
  if (!object(payload) || !Number.isInteger(payload.schema) || payload.schema < 1 || payload.schema > 4 ||
      (payload.format !== undefined && payload.format !== "argus-backup") || !Number.isFinite(Date.parse(payload.exportedAt))) {
    throw new Error("Choose an Argus backup from a supported version (schema 1–4).");
  }
  const counts = {};
  let attachments = 0;
  for (const store of BACKUP_STORES) {
    const optional = store === "reminders" && payload.schema < 4 || store === "evidence" && payload.schema < 3 || store === "actions" && payload.schema < 2;
    if (payload[store] === undefined && optional) { counts[store] = 0; continue; }
    if (!Array.isArray(payload[store])) throw new Error(`The backup is missing a valid ${store} list. Nothing has been replaced.`);
    const ids = new Set();
    for (const record of payload[store]) {
      validateRecord(record, store);
      if (ids.has(record.id)) throw new Error(`Duplicate record in ${store}; nothing has been replaced.`);
      ids.add(record.id);
      if (store === "reminders" && !record.id.startsWith("rem-")) throw new Error("Invalid reminder identifier in backup.");
      if (record.blobDataUrl !== undefined) attachments += 1;
    }
    counts[store] = payload[store].length;
  }
  return { counts, attachments, exportedAt: payload.exportedAt, appVersion: payload.appVersion || "Earlier Argus version" };
}

export async function readBackupFile(file) {
  if (!file || file.size > MAX_BACKUP_BYTES) throw new Error("Choose an Argus JSON backup of up to 64 MiB.");
  let payload;
  try { payload = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
  catch { throw new Error("That file is not readable JSON. Nothing has been replaced."); }
  return { payload, summary: validateBackup(payload) };
}

export function resetImportedAction(action) {
  if (["completed", "failed", "cancelled"].includes(action.status)) return { ...action, requiresConfirmation: true };
  return { ...action, status: "draft", requiresConfirmation: true, lastResult: "Restored from backup. Review and approve again before dispatch." };
}

export function nativeBackupAvailable(bridge = globalThis.window?.ArgusAndroid) {
  return typeof bridge?.beginBackupExport === "function";
}

export async function saveNativeBackup(blob, filename, onProgress = () => {}, bridge = window.ArgusAndroid) {
  if (blob.size > MAX_BACKUP_BYTES) throw new Error("This backup exceeds the 64 MiB limit. No file was saved.");
  const call = (method, input = {}) => {
    const result = JSON.parse(bridge[method](JSON.stringify(input)));
    if (["blocked", "failed"].includes(result.status)) throw new Error(result.message || "Android could not save the backup.");
    return result;
  };
  const { id } = call("beginBackupExport", { filename, bytes: blob.size });
  try {
    const chunkSize = 48 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      call("appendBackupExport", { id, offset, data: btoa(binary) });
    }
    call("finishBackupExport", { id });
    onProgress("Choose a folder and tap Save. The backup is unencrypted; choose a location you trust.");
    while (true) {
      const state = call("getBackupExportState", { id });
      if (state.status === "saved" || state.status === "cancelled") return state;
      if (!["choosing", "writing"].includes(state.status)) throw new Error("Backup saving was interrupted. Please try again.");
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  } catch (error) {
    try { call("cancelBackupExport", { id }); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}
