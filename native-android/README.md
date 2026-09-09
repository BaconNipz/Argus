# Argus Native Android Shell

Argus v0.2 includes the first native Android shell scaffold. The current environment does not include the Android SDK, so this scaffold is prepared for Android Studio rather than compiled here.

## Target Stack

- Kotlin.
- Jetpack Compose or a local WebView shell depending on which path gives the cleanest bridge.
- Room or SQLDelight if the data layer moves native.
- WorkManager for background jobs.
- AndroidX Biometric for app lock.
- Android intents for share-sheet intake and action dispatch.

## Bridge Contract

The native shell should expose capability calls to the local core through a narrow bridge:

| Capability | Native Owner | Core Owner |
| --- | --- | --- |
| Microphone recording | Android permission and capture | Metadata and storage reference |
| Share-sheet intake | Intent receiver | Memory/source routing |
| Notifications | Permission and scheduling | User-facing routine definitions |
| Location and sensors | Permission and sampling | Explicit module requests |
| Local model runtime | Native process/library | Prompt, retrieval and results policy |
| Contacts/calendar/files | Android providers | Confirmed user workflows |

The rule is that Android owns dangerous permissions and Argus Core owns meaning, routing and records.

## First Native Milestone

Build a native wrapper that:

1. Loads the built `dist/` app from bundled local assets.
2. Opens Argus from the Android share sheet.
3. Sends shared URLs/text into the local capture flow.
4. Persists the same local data without requiring internet.

## Current Scaffold

The scaffold now includes:

- A Kotlin `MainActivity` with a local WebView.
- Local HTTPS-style asset loading through AndroidX WebViewAssetLoader.
- A narrow `ArgusBridge` exposed to JavaScript as `window.ArgusAndroid`.
- Android share-sheet intake for `text/plain`.
- Local asset loading from `app/src/main/assets/argus/index.html`.
- A conservative `open_url` dispatch example.
- Android file chooser support for local evidence attachments.
- Signed release build support through private signing settings.
- The bundled v0.6 command layer, with URL-opening routed through the confirm-first action queue.

Before opening the native project, run:

```bash
node scripts/build.mjs
node scripts/sync-native-assets.mjs
```

Then open `native-android/` in Android Studio.

For repeat install-over-install updates, configure a private release keystore through GitHub Actions secrets or Android Studio signing settings. Debug APKs are useful for quick testing, but Android treats each different signing key as a different update chain.
