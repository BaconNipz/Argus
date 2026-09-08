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
4. Build a debug APK for quick testing.
5. Build a signed release APK once you have a persistent signing key.

## Build With GitHub Actions

The workflow at `.github/workflows/android-apk.yml` builds:

- `argus-debug-apk` on every manual workflow run, push to `main`, or `argus-v*` tag.
- `argus-release-apk` when signing secrets are configured.

Required release signing secrets:

| Secret | Meaning |
| --- | --- |
| `ARGUS_KEYSTORE_BASE64` | Base64 encoded `.jks` keystore |
| `ARGUS_KEYSTORE_PASSWORD` | Keystore password |
| `ARGUS_KEY_ALIAS` | Key alias |
| `ARGUS_KEY_PASSWORD` | Key password |

The debug APK is installable, but signed release APKs are the proper path for repeat updates.

## Update Manifest

Argus checks an update manifest shaped like:

```json
{
  "appId": "com.argus.localcore",
  "versionCode": 3,
  "versionName": "0.3.0",
  "apkUrl": "https://example.com/argus.apk",
  "sha256": "APK_SHA256_HERE",
  "releaseDate": "2026-09-08",
  "notes": ["Short release note"]
}
```

After building and uploading an APK somewhere reachable by the phone, write the manifest with:

```bash
node scripts/write-update-manifest.mjs native-android/app/build/outputs/apk/release/app-release.apk https://example.com/argus.apk
```

Then publish `public/update.json` or paste its URL into Argus Settings. If a newer version is found, Argus queues an APK update action for confirmation.

