import { ARGUS_VERSION, normalizeImportPayload } from "./argus-core.js";
import { BACKUP_STORES, decodeBackupAttachment, resetImportedAction, validateBackup } from "./backup.js";

export const DB_NAME = "argus-local-core";
export const DB_VERSION = 4;
export const STORES = BACKUP_STORES;

let dbPromise;

export function openArgusDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function getStore(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listRecords(storeName) {
  const db = await openArgusDb();
  const records = await requestToPromise(getStore(db, storeName).getAll());
  return records.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function putRecord(storeName, record) {
  await writeStore(storeName, (store) => store.put(record));
  return record;
}

export async function deleteRecord(storeName, id) {
  await writeStore(storeName, (store) => store.delete(id));
}

export async function clearStore(storeName) {
  await writeStore(storeName, (store) => store.clear());
}

async function writeStore(storeName, operation) {
  const db = await openArgusDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error("Local storage write was cancelled."));
    tx.onerror = () => reject(tx.error);
    try { operation(tx.objectStore(storeName)); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export async function exportArgusData() {
  const data = {
    format: "argus-backup",
    appVersion: ARGUS_VERSION,
    schema: DB_VERSION,
    exportedAt: new Date().toISOString()
  };

  const db = await openArgusDb();
  const snapshot = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readonly");
    const records = {};
    for (const store of STORES) {
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => { records[store] = request.result; };
    }
    tx.oncomplete = () => resolve(records);
    tx.onabort = () => reject(tx.error || new Error("Backup snapshot was interrupted."));
    tx.onerror = () => reject(tx.error);
  });
  for (const store of STORES) {
    const records = snapshot[store];
    data[store] = [];
    for (const record of records) {
      data[store].push(await serializeRecordForExport(record));
    }
  }

  return data;
}

export async function prepareArgusImport(payload) {
  validateBackup(payload);
  const normalized = normalizeImportPayload(payload);
  // Decode files before starting a transaction, so a bad backup cannot clear stores halfway.
  const prepared = {};
  for (const store of STORES) {
    prepared[store] = [];
    for (const record of normalized[store]) {
      if (record && record.id) {
        const restored = await deserializeRecordForImport(record);
        prepared[store].push(store === "actions" ? resetImportedAction(restored) : restored);
      }
    }
  }
  return prepared;
}

export async function importArgusData(payload) {
  return replaceArgusData(await prepareArgusImport(payload));
}

export async function replaceArgusData(prepared) {
  const db = await openArgusDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error("Backup import was cancelled."));
    tx.onerror = () => reject(tx.error);
    try {
      for (const store of STORES) {
        tx.objectStore(store).clear();
        for (const record of prepared[store]) tx.objectStore(store).put(record);
      }
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

async function blobToDataUrl(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") return "";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function serializeRecordForExport(record) {
  const copy = { ...record };
  if (copy.blob && typeof copy.blob.arrayBuffer === "function") {
    copy.blobDataUrl = await blobToDataUrl(copy.blob);
    delete copy.blob;
  }
  return copy;
}

async function deserializeRecordForImport(record) {
  const copy = { ...record };
  if (copy.blobDataUrl !== undefined) {
    copy.blob = decodeBackupAttachment(copy.blobDataUrl);
  }
  delete copy.blobDataUrl;
  return copy;
}
