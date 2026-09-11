import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "dist");

const files = [
  ["src/index.html", "index.html"],
  ["src/styles.css", "styles.css"],
  ["src/app.js", "app.js"],
  ["src/argus-core.js", "argus-core.js"],
  ["src/command-language.js", "command-language.js"],
  ["src/command-access.js", "command-access.js"],
  ["src/wake-phrase.js", "wake-phrase.js"],
  ["src/background-voice.js", "background-voice.js"],
  ["src/backup.js", "backup.js"],
  ["src/routines.js", "routines.js"],
  ["src/speech.js", "speech.js"],
  ["src/speech-output.js", "speech-output.js"],
  ["src/notification-status.js", "notification-status.js"],
  ["src/android-bridge.js", "android-bridge.js"],
  ["src/db.js", "db.js"],
  ["src/updater.js", "updater.js"],
  ["public/manifest.webmanifest", "manifest.webmanifest"],
  ["public/service-worker.js", "service-worker.js"],
  ["public/update.json", "update.json"],
  ["public/icons/icon.svg", "icons/icon.svg"]
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const [from, to] of files) {
  const target = join(dist, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, from), target);
}

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
console.log(`Built Argus v${pkg.version} into ${dist}`);
