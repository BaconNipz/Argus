# Argus Native Android Shell

Argus v0.14 uses a native Kotlin WebView shell, WorkManager reminders with notification actions, on-device speech input and offline voice output. APKs and native unit tests build through GitHub Actions or Android Studio; the development workspace does not contain the Android SDK.

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
- Native local reminders through WorkManager 2.10.1, with permission checks and once/daily/weekly schedules.
- Reminder status, pause/delete controls and notification-tap routing.
- A bundled-content WebView boundary, confirmation dialogs and approval checks in native dispatch.
- Backup rules that exclude active native schedule preferences from transfer/restore.
- `OfflineSpeechController` for Android 12+ on-device recognition and Android 13+ language-pack checks/download requests.
- A review-only speech bridge with unique capture sessions, explicit permission and lifecycle cancellation.
- Reminder sound/banner diagnostics, direct channel settings, high-importance defaults for new channels and a test-alert button.
- `OfflineTtsController` for installed offline voices, audio focus, capture/background cancellation and no browser speech fallback.
- `ReminderActionReceiver` and `ReminderActionWorker` for immutable Snooze/Done actions, validated against current native records.
- Separate snooze work with regular-occurrence precedence, cancellation and duplicate-action protection.

Prepare the wake dependency first (see below). Native tests: `gradle -p native-android testDebugUnitTest assembleDebug` from the repository root. See `docs/releases/v0.10.0.md` for behaviour and physical-device checks.

## v0.11 Document Backups

`BackupStaging` accepts bounded ordered chunks into private cache storage. `BackupDocumentController` opens `ACTION_CREATE_DOCUMENT`, writes on a worker thread, and reopens the result to verify byte count and SHA-256 before reporting success. The WebView opens restore/evidence files with `ACTION_OPEN_DOCUMENT`. Both pickers request local documents; no broad storage permission is added. Interrupted or failed saves must be repeated. Backups are unencrypted JSON up to 64 MiB. See `docs/releases/v0.11.0.md` for use, restore behavior and the wake-phrase decision.

## v0.12 Command Access

`CommandAccessController` publishes the dynamic `argus-command` launcher shortcut and handles explicit pin/tile setup requests on the activity thread. Pin acceptance is not proof of placement; pinned shortcuts are checked separately. Android 13+ returns tile setup results, with a bounded wait and manual setup guidance on errors or older versions.

`CommandTileService` requires the system's `BIND_QUICK_SETTINGS_TILE` binding permission, uses an explicit immutable activity PendingIntent on API 34+, and calls `unlockAndRun` if locked. The tile is an inactive entry point, not a listening toggle. It has no microphone or foreground-service code. Both entry points use an explicit `OPEN_COMMAND` action with `NEW_TASK | SINGLE_TOP | CLEAR_TOP` to reuse MainActivity. A system picker above the activity may be cancelled when the task is brought forward.

`CommandLaunchQueue` accepts only that action, generates its own token and never reads intent extras. The WebView consumes a matching token only when visible, started and not busy with a backup/routine/command operation. Native consumption also requires the resumed activity. Other new intents invalidate pending Command launches. Saved-instance state carries only an unconsumed request; recreating an already-consumed intent does not replay it. A warm launch retains the typed draft; process death/recreation does not persist unsaved drafts. See `docs/releases/v0.12.0.md` for phone tests.

Before opening the native project, run:

```bash
node scripts/build.mjs
node scripts/sync-native-assets.mjs
python3 scripts/prepare-wake-runtime.py
```

Then open `native-android/` in Android Studio.

For repeat install-over-install updates, configure a private release keystore through GitHub Actions secrets or Android Studio signing settings. Debug APKs are useful for quick testing, but Android treats each different signing key as a different update chain.

## v0.13 Foreground Wake Phrase

`WakePhraseController` owns one explicitly armed 5-minute AudioRecord session on a worker thread, using sherpa-onnx 1.13.8 and the English GigaSpeech 3.3M KWS model. It processes 16 kHz mono samples in memory. Its worker releases AudioRecord, the model stream and the engine before publishing detection. `WakeSession` grants a matching one-use handoff for five seconds only while the activity is resumed. Stop/pause/destroy revoke that authority. Web navigation and visibility changes also cancel; no wake state is persisted or automatically rearmed.

After a hit, the existing dedicated Android on-device recognizer captures a command for review. Both engines stop spoken replies before microphone use; native guards prevent overlap. The window stays awake during active wake/capture and clears that flag on cancellation, completion or pause. There is no wake service, boot receiver or additional permission.

The preparation script requires Python 3.11+ and curl. It downloads fixed public release artifacts, verifies byte length and SHA-256, and extracts only named regular-file model members. Downloads are needed on the build machine, not the user's phone. AAR/cache/model binaries are ignored by Git. Use `--cache-dir PATH` to reuse already verified artifacts. Model provenance and licence notices ship inside the APK. CI runs preparation before native unit tests and assembly. This build packages only `arm64-v8a`, matching the S23 Ultra; it is not an x86 emulator build.

See `docs/releases/v0.13.0.md` for limits and physical-device validation. The small synthetic check is evidence that the model loads and can detect the phrase, not a real-world accuracy or battery measurement.

## v0.14 Background Voice

`BackgroundWakeService` is an unexported microphone foreground service. `BackgroundWake` owns remembered enable/sensitivity/autorun preferences and a single expiring native ticket. A detection is offered only after `WakeAudioReader` releases its recorder and model. A 20-second unclaimed ticket grants one foreground/unlocked command capture and a maximum 60-second command lease. Completion, cancellation or expiry releases the lease before another wake cycle. Stop persists off; microphone/notification errors stop the service until a later eligible start. Lock/screen-off pauses audio without a wake lock.

`ArgusVoiceInteractionService` is selected through Android's assistant role prompt and requests a `VoiceInteractionSession` without assist/screenshot data. The separate session process uses `startAssistantActivity` to open Command. `ArgusRecognitionService` fulfils assistant metadata and delegates only to the dedicated on-device recognizer; it never uses the generic default recognizer. All exported voice services require the corresponding system binding permission. No overlay, accessibility, boot receiver or privileged background-start permission is requested.

`VoiceAudioGate` serialises keyword capture, command capture, the assistant recognition adapter and offline speech output. Manual speech briefly holds the background reader and waits for its microphone to close. The volume meter receives only RMS/peak values; sample audio is never persisted or sent to the WebView. The web app protects unfinished typed commands, consumes a capture result once and routes only known local actions or existing reviewed drafts. The new enabled preferences are excluded from Android backup/transfer and are paused before local data restore/wipe.

See `docs/releases/v0.14.0.md` for setup and limitations. Assistant role availability, Samsung's launch behaviour and real microphone/battery performance need physical-device validation.

## v0.14.1 Wake Feedback And Handoff Repair

Phone feedback reported silent wake detections and command handling delayed until manual app opening. The patch adds a separate alerting wake notification, a command-ready beep with two vibrations, and setup diagnostics. The selected, system-bound assistant service first requests the existing Argus activity directly; one assistant-session fallback is available if it stays hidden. Fresh requests are replayed after native focus/WebView startup until claimed or expired. Setup-control focus no longer blocks capture; unfinished content remains protected. See `docs/releases/v0.14.1.md`. Samsung launch, sound and haptic behaviour still need phone validation.
