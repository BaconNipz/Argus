export const CURRENT_ANDROID_BUILD = {
  appId: "com.argus.localcore",
  versionCode: 3,
  versionName: "0.3.0"
};

export function normalizeUpdateManifest(payload) {
  const safe = payload && typeof payload === "object" ? payload : {};
  return {
    appId: String(safe.appId || CURRENT_ANDROID_BUILD.appId),
    versionCode: Number(safe.versionCode || 0),
    versionName: String(safe.versionName || ""),
    apkUrl: String(safe.apkUrl || ""),
    sha256: String(safe.sha256 || ""),
    releaseDate: String(safe.releaseDate || ""),
    notes: Array.isArray(safe.notes) ? safe.notes.map(String) : []
  };
}

export function isUpdateNewer(manifest, current = CURRENT_ANDROID_BUILD) {
  return Number(manifest.versionCode || 0) > Number(current.versionCode || 0);
}

export async function fetchUpdateManifest(manifestUrl = "./update.json", fetcher = fetch) {
  const response = await fetcher(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Update check failed with HTTP ${response.status}.`);
  }
  return normalizeUpdateManifest(await response.json());
}

export async function checkForUpdate(manifestUrl = "./update.json", current = CURRENT_ANDROID_BUILD, fetcher = fetch) {
  const manifest = await fetchUpdateManifest(manifestUrl, fetcher);
  if (manifest.appId !== current.appId) {
    throw new Error(`Update manifest appId mismatch: ${manifest.appId}.`);
  }
  return {
    current,
    manifest,
    updateAvailable: isUpdateNewer(manifest, current)
  };
}
