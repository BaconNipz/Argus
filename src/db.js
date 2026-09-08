import { normalizeImportPayload } from "./argus-core.js";

export const DB_NAME = "argus-local-core";
export const DB_VERSION = 2;
export const STORES = ["memory", "investigations", "tools", "voiceNotes", "actions", "settings", "events"];

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
  const db = await openArgusDb();
  await requestToPromise(getStore(db, storeName, "readwrite").put(record));
  return record;
}

export async function deleteRecord(storeName, id) {
  const db = await openArgusDb();
  await requestToPromise(getStore(db, storeName, "readwrite").delete(id));
}

export async function clearStore(storeName) {
  const db = await openArgusDb();
  await requestToPromise(getStore(db, storeName, "readwrite").clear());
}

export async function exportArgusData() {
  const data = {
    schema: DB_VERSION,
    exportedAt: new Date().toISOString()
  };

  for (const store of STORES) {
    data[store] = await listRecords(store);
  }

  return data;
}

export async function importArgusData(payload) {
  const normalized = normalizeImportPayload(payload);

  for (const store of STORES) {
    await clearStore(store);
    for (const record of normalized[store]) {
      if (record && record.id) {
        await putRecord(store, record);
      }
    }
  }
}
