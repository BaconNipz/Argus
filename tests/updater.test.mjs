import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_ANDROID_BUILD,
  checkForUpdate,
  isUpdateNewer,
  normalizeUpdateManifest
} from "../src/updater.js";

test("normalizes update manifests", () => {
  const manifest = normalizeUpdateManifest({
    versionCode: "6",
    versionName: "0.5.0",
    apkUrl: "https://example.com/argus.apk",
    notes: ["New build"]
  });

  assert.equal(manifest.appId, CURRENT_ANDROID_BUILD.appId);
  assert.equal(manifest.versionCode, 6);
  assert.equal(manifest.versionName, "0.5.0");
});

test("compares Android version codes", () => {
  assert.equal(isUpdateNewer({ versionCode: CURRENT_ANDROID_BUILD.versionCode + 1 }), true);
  assert.equal(isUpdateNewer({ versionCode: CURRENT_ANDROID_BUILD.versionCode }), false);
});

test("checks update manifests with an injectable fetcher", async () => {
  const result = await checkForUpdate(
    "https://updates.example/argus.json",
    CURRENT_ANDROID_BUILD,
    async () => ({
      ok: true,
      async json() {
        return {
          appId: CURRENT_ANDROID_BUILD.appId,
          versionCode: CURRENT_ANDROID_BUILD.versionCode + 1,
          versionName: "next",
          apkUrl: "https://updates.example/argus.apk"
        };
      }
    })
  );

  assert.equal(result.updateAvailable, true);
});

test("rejects update manifests for another app", async () => {
  await assert.rejects(
    () =>
      checkForUpdate("https://updates.example/other.json", CURRENT_ANDROID_BUILD, async () => ({
        ok: true,
        async json() {
          return {
            appId: "com.example.other",
            versionCode: 99
          };
        }
      })),
    /appId mismatch/
  );
});
