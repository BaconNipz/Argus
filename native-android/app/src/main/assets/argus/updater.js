export const CURRENT_ANDROID_BUILD = {
  appId: "com.argus.localcore",
  versionCode: 15,
  versionName: "0.14.0"
};

export const DEFAULT_UPDATE_MANIFEST_URL =
  "https://github.com/BaconNipz/Argus/releases/latest/download/update.json";

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

export async function fetchUpdateManifest(manifestUrl = DEFAULT_UPDATE_MANIFEST_URL, fetcher = fetch) {
  const response = await fetcher(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Update check failed with HTTP ${response.status}.`);
  }
  return normalizeUpdateManifest(await response.json());
}

export async function checkForUpdate(
  manifestUrl = DEFAULT_UPDATE_MANIFEST_URL,
  current = CURRENT_ANDROID_BUILD,
  fetcher = fetch
) {
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
