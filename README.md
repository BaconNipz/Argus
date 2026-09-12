# Argus v0.14.1

Argus is a phone-first, local-first personal assistant and OSINT workbench designed for a Samsung Galaxy S23 Ultra. The core rule is simple: Argus should work without a mandatory subscription, cloud server, or paid AI API.

The current build has an offline web core and a native Android shell under `native-android/`. Argus v0.14 adds opt-in background Hey Argus with a remembered enabled setting and an ongoing Pause notification. Selecting Argus as Android's digital assistant lets it request Command over another app after a detection. Supported local voice commands can run automatically, while reminders and external actions remain reviewed drafts. The listener pauses while the phone is locked or the screen is off. The wake model and runtime remain bundled in the ARM64 APK. Phone backups, broader English commands, reminders and offline speech input/output remain available. The release workflow can publish signed APKs once private signing secrets are configured.

## What Argus Does Now

- Runs as a responsive mobile app from the `dist/` build.
- Works offline after first load through a service worker.
- Stores data locally in IndexedDB.
- Captures memory notes, investigations, OSINT source links, evidence files, tool entries and voice notes.
- Searches across local records from one phone-first Search view.
- Creates OSINT lead cases for usernames, emails, domains, URLs and image notes.
- Labels memory by type and sensitivity, then reviews stale, duplicate and sensitive notes.
- Labels sources by type and reliability.
- Labels source relationships and optional observed timestamps.
- Attaches local evidence files through the Android system file picker in the native APK.
- Reviews cases through a local OSINT Workbench with timeline and link-analysis views.
- Understands several English phrasings for commands, including polite requests, app navigation and local summaries, without cloud AI.
- Captures spoken commands using Android's dedicated on-device recognizer, with a typed fallback on unsupported devices.
- Checks microphone permission and offline language availability, and can request language-pack downloads when supported.
- Keeps recognised speech as review text until you choose to use and run it.
- Offers remembered background wake listening, digital-assistant setup and live microphone-volume feedback.
- Offers opt-in foreground “Hey Argus” listening with Standard / More sensitive settings, explicit Stop and bounded microphone ownership.
- Opens Command from a pinned home-screen shortcut, the app icon's long-press menu or a Quick Settings tile. Recording still starts with an explicit tap.
- Queues URL-opening commands for confirmation before dispatch.
- Interprets supported spoken or typed reminder times, then opens Routines for review, saving and explicit enabling.
- Saves one-off, daily and weekly reminders, with explicit enable, pause, edit and delete controls.
- Uses Android notifications and background scheduling in the APK; browser reminders remain saved drafts.
- Handles reminder occurrences from notifications or Routines with Snooze 10 min and Done, without disabling regular repeats.
- Shows notification permission, sound mode, category sound/banner settings and delivery status, with a test-alert button. Battery saving may delay delivery.
- Restores reminders from backups in a paused state.
- Speaks command replies using an installed voice Android marks as offline, with voice selection, test and stop controls.
- Queues draft Android/automation actions for confirmation before dispatch.
- Saves JSON backups through Android's system document picker and verifies the written bytes. Reviews records and attachments before a confirmed restore.
- Includes a share-target route for later Android share-sheet intake.
- Includes a Kotlin Android shell scaffold for Android Studio.
- Includes a GitHub Actions workflow for building APK artifacts.
- Includes update manifest support so newer APKs can be queued for install.
- Publishes signed release APKs when private signing secrets are configured.
- Keeps cloud AI optional rather than baked into the foundation.

## Run Locally

```bash
npm test
npm run build
npm run sync:android
npm run preview
```

The preview server serves the built app at:

```text
http://127.0.0.1:4173
```

For phone testing, serve `dist/` over `localhost` or HTTPS on the phone, then install it from Chrome using **Add to Home screen**. Service workers do not run from `file://`, so a tiny local server is required for offline install behavior.

## Project Layout

```text
argus/
  src/                 App shell, local storage adapter and Argus core
  public/              Manifest, service worker and app icon
  docs/                Architecture and roadmap notes
  native-android/      Planned native shell boundary
  .github/workflows/   APK build workflow
  scripts/             Build and preview scripts
  tests/               Node tests for the local core
```

## Development Principle

Argus v0.1 is the base camp, not the mountain. Every feature should be added as a module that can run locally first, then optionally gain stronger Android or AI capability through a clear bridge.

Argus v0.2 adds the first bridge boundary. Phone actions are drafted into a local queue first, then confirmed before any native dispatch happens.

Argus v0.3 adds the APK/update path. Android updates require the same package name, a higher version code and the same signing key.

Argus v0.4 adds local memory review and OSINT evidence handling while keeping cloud AI optional.

Argus v0.4.1 adds the signed release update chain. Debug APKs remain useful for quick tests, but real repeat updates need the same private signing key every time.

Argus v0.5 adds the first proper OSINT workbench layer: case health review, evidence timelines and local relationship maps.

Argus v0.6 adds the first command layer. It is intentionally rule-based for now: simple commands work locally, unclear commands are rejected, and any phone/external action still goes through the action queue.

Argus v0.7 adds local notification routines. See [the v0.7 guide](docs/releases/v0.7.0.md) for what changed, how to use it, and what still needs device validation.

Argus v0.8 adds the first on-device speech input adapter. See [the v0.8 guide](docs/releases/v0.8.0.md) for setup, recording controls, language packs and current limits.

Argus v0.9 fixes reminder alert defaults and adds native offline spoken replies. See [the v0.9 guide](docs/releases/v0.9.0.md), including the settings step for existing notification categories.

Argus v0.10 adds notification actions. See [the v0.10 guide](docs/releases/v0.10.0.md) for snooze timing, completion and repeat behaviour.

Argus v0.11 adds phone backup and broader commands. See [the v0.11 guide](docs/releases/v0.11.0.md) for examples, restoring data and the current wake-phrase decision.

Argus v0.12 adds quicker access to Command. See [the v0.12 guide](docs/releases/v0.12.0.md) for shortcut/tile setup, phone checks and current limits.

Argus v0.13 adds a foreground wake-phrase prototype. See [the v0.13 guide](docs/releases/v0.13.0.md) for setup, model checks and the phone tests still needed.

Argus v0.14 adds background voice activation. See [the v0.14 guide](docs/releases/v0.14.0.md) for one-time setup, command execution choices, lifecycle limits and phone testing.

Argus v0.14.1 separates wake acknowledgement from the command-ready cue and repairs the assistant launch and WebView resume handoff. See [the patch guide](docs/releases/v0.14.1.md) for the two cues and a short phone check.
