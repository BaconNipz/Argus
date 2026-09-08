# APK Build And Update Path

Argus can become an installable Android APK through the native project in `native-android/`.

## What Android Requires

Android updates are strict:

| Requirement | Why It Matters |
| --- | --- |
| Same `applicationId` | Android must recognise it as the same app |
| Higher `versionCode` | Android rejects downgrades |
| Same signing key | Android rejects updates signed by a different key |
| User install confirmation | Normal apps cannot silently install APKs |

For Argus, the package name is:

```text
com.argus.localcore
```

## Build Locally With Android Studio

1. Run the local web build:

```bash
node scripts/build.mjs
node scripts/sync-native-assets.mjs
```

2. Open `native-android/` in Android Studio.
3. Let Android Studio install the requested Gradle and Android SDK tools.
4. Build a debug APK for quick phone testing.
5. Build a signed release APK once you have a private persistent signing key.

## Build With GitHub Actions

The workflow at `.github/workflows/android-apk.yml` builds:

- `argus-debug-apk` on every manual workflow run, push to `main`, or `argus-v*` tag.
- `argus-release-apk` when signing secrets are configured.
- A release asset on pushes to `main` at `argus-v<versionName>`.
- A generated `update.json` release asset with the APK URL and SHA-256 checksum.

## Release Signing

Argus must not commit signing keys into source control. Keystores are ignored under:

```text
native-android/keystore/*.jks
```

To create the private release key locally:

```bash
ARGUS_KEYSTORE_PASSWORD="choose a long private password" bash scripts/generate-release-keystore.sh
```

The script prints the four GitHub Actions secrets to add to `BaconNipz/Argus`:

Required release signing secrets:

| Secret | Meaning |
| --- | --- |
| `ARGUS_KEYSTORE_BASE64` | Base64 encoded `.jks` keystore |
| `ARGUS_KEYSTORE_PASSWORD` | Keystore password |
| `ARGUS_KEY_ALIAS` | Key alias |
| `ARGUS_KEY_PASSWORD` | Key password |

The `.jks` file and passwords must be backed up privately. Losing them means future updates cannot install over old signed releases.

Debug APKs are installable and useful for v0.x testing, but they are not a reliable update chain because CI debug keys can change. Signed release APKs are the proper path for repeat updates because Android requires all updates for the same installed app to use the same signing key.

## Update Manifest

Argus checks an update manifest shaped like:

```json
{
  "appId": "com.argus.localcore",
  "versionCode": 5,
  "versionName": "0.4.1",
  "apkUrl": "https://example.com/argus.apk",
  "sha256": "APK_SHA256_HERE",
  "releaseDate": "2026-09-08",
  "notes": ["Short release note"]
}
```

Argus defaults to the latest release manifest:

```text
https://github.com/BaconNipz/Argus/releases/latest/download/update.json
```

For manual update manifest generation, write the manifest with:

```bash
node scripts/write-update-manifest.mjs native-android/app/build/outputs/apk/preview/app-preview.apk https://example.com/argus.apk public/update.json
```

If a newer version is found, Argus queues an APK update action for confirmation.
