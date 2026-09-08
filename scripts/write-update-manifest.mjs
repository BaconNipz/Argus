import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_ANDROID_BUILD } from "../src/updater.js";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const [apkPath, apkUrl, outputPath = "public/update.json"] = process.argv.slice(2);

if (!apkPath || !apkUrl) {
  console.error("Usage: node scripts/write-update-manifest.mjs <apk-path> <apk-url> [output-path]");
  process.exit(1);
}

const apk = await readFile(apkPath);
const sha256 = createHash("sha256").update(apk).digest("hex");

const manifest = {
  appId: CURRENT_ANDROID_BUILD.appId,
  versionCode: CURRENT_ANDROID_BUILD.versionCode,
  versionName: CURRENT_ANDROID_BUILD.versionName,
  apkUrl,
  sha256,
  releaseDate: new Date().toISOString().slice(0, 10),
  notes: [`Argus ${CURRENT_ANDROID_BUILD.versionName} APK update.`]
};

const targetPath = isAbsolute(outputPath) ? outputPath : join(root, outputPath);

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote update manifest for ${CURRENT_ANDROID_BUILD.versionName}`);
console.log(`sha256 ${sha256}`);
