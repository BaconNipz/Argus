# Argus Architecture

## Product Shape

Argus is an Android-first personal assistant, OSINT notebook and automation hub. The primary device target is a Samsung Galaxy S23 Ultra. The app must remain useful without a PC, subscription, remote server or paid AI API.

## Core Layers

| Layer | Responsibility | Current Status |
| --- | --- | --- |
| Interface | Fast phone UI for capture, review and command flow | Offline PWA plus OSINT Workbench and Command screen |
| Local Core | Data model, module registry, import/export, privacy defaults | Implemented |
| Local Storage | Memory, investigations, evidence, tool records, voice notes and events | IndexedDB |
| Capability Modules | OSINT, memory, voice, automation and assistant tools | Ready, stubbed and planned modules |
| Android Shell | Local assets, share intake, files, URL actions and reminders | Kotlin WebView shell and WorkManager |
| Local AI Runtime | Optional local LLM, transcription, embeddings and ranking | Planned |

The first speech-input adapter uses Android's existing on-device recognition service. An Argus-bundled speech model and an LLM remain separate future components.

## Data Stores

Argus uses these local object stores:

| Store | Purpose |
| --- | --- |
| `memory` | Notes, observations, copied snippets and user context |
| `investigations` | OSINT cases with saved sources and working notes |
| `evidence` | Local evidence files, notes, metadata and case attachments |
| `tools` | Local registry of Argus capabilities and external/manual tools |
| `voiceNotes` | Local audio captures and optional transcripts |
| `actions` | Confirm-first drafts for native Android or manual actions |
| `reminders` | Saved routines and mirrored Android scheduling/delivery state (schema 4) |
| `settings` | Device-local preferences |
| `events` | Simple audit trail for local actions |

## Command Layer

The first command layer is a deterministic local parser. It recognises simple commands for memory capture, case creation, source saving, local search and safe action drafts. It does not call cloud AI, does not infer hidden intent and does not dispatch Android actions directly.

External actions such as opening URLs are converted into records in the `actions` store. The user must approve and dispatch them through the Android bridge flow.

Reminder commands open the Routines form without choosing a time or enabling a schedule. Saved reminders start paused. The Enable button is the user's explicit scheduling action.

## Local Reminder Scheduling

Android owns active schedules in private SharedPreferences and WorkManager. IndexedDB stores drafts and mirrors native status when the app starts or resumes. One unique work chain per reminder prevents duplicate pending schedules; revision and due-time checks make replaced or cancelled workers no-ops. A native lock serialises posting, editing and cancellation.

Each occurrence is a delayed one-time worker. Daily and weekly repeats calculate the next calendar date in the saved time zone, preserving wall-clock time across daylight saving and skipping missed repeats. Jobs have no network requirement, polling loop, exact-alarm permission or foreground service. They are approximate notifications, subject to Android battery scheduling and force-stop restrictions.

Import and wipe cancel native work before replacing local data. JSON restore strips scheduler authority and restores reminders paused. Native schedule preferences are excluded from Android backup/device transfer so schedules are not silently enabled on another phone. Native records take precedence over a stale IndexedDB mirror; missing native schedules become paused drafts.

The WebView keeps external pages outside the bridge-bearing view. Content Security Policy restricts executable scripts to bundled assets and blocks frames and objects. Native generic action dispatch checks approval as well as the web UI.

Reminder alerts use the existing `argus_reminders` notification channel. New channels request `IMPORTANCE_HIGH`, the system notification sound and vibration. Existing channel preferences are preserved; Argus links directly to channel settings instead of replacing the channel. Each recurring occurrence uses `setOnlyAlertOnce(false)`, so an undismissed earlier card does not suppress its alert. The test button uses the same notification builder without creating a schedule. Status reads current importance, sound, vibration, ringer mode, notification volume and Do Not Disturb; it cannot confirm that Samsung displayed a banner.

## Reminder Notification Actions

Each posted reminder has a fresh notification token scoped to its current native revision. Explicit immutable broadcast PendingIntents include the reminder ID, revision, token and operation in their URI identity. A non-exported `ReminderActionReceiver` uses a short asynchronous handoff to WorkManager; `ReminderActionWorker` performs the state transition under the same native lock as scheduling and cancellation. The first valid action consumes the alert token. Duplicate or stale actions cannot dismiss or change a newer alert.

Snoozes use separate unique work and their own token/due-time checks. Repeats retain `nextRunAt` as the next regular occurrence; one-offs expose the snooze time there. A new regular occurrence invalidates an older snooze. If a delayed snooze runs after the next regular time, it delegates to regular delivery instead of posting the old occurrence. Done clears the current card, finishes a one-off, and leaves a repeating schedule enabled. Native state includes optional `notificationToken`, `snoozeToken`, `snoozedUntil`, `lastAction` and `lastActionAt` fields without changing IndexedDB schema 4.

Pausing/editing/deleting clears alert authority and cancels regular and snooze work. All work, including action handoffs, shares the cancellation tag used by import/wipe. Restore uses an explicit field allowlist, omits active tokens and restores paused drafts. Native mirrors explicitly clear absent token fields so older or missing native records cannot leave usable-looking actions in local storage. Routines actions use the exact token from the tapped button rather than replacing it with authority from a newly refreshed alert.

## On-device Speech Input

`OfflineSpeechController` owns microphone sessions on Android's main thread. It checks `isOnDeviceRecognitionAvailable` and creates only `createOnDeviceSpeechRecognizer` instances on API 31+. There is no generic recognizer or browser speech-recognition fallback. API 33+ supports explicit language-support checks and user-requested model downloads.

Each capture has a unique session ID. Both Kotlin and JavaScript reject stale and terminal-session callbacks. A recording is stopped after at most 30 seconds, with a further 10-second bound for a final result; cancel, background and destroy release the recognizer. The controller does not persist audio or transcripts.

`speech.js` reduces native events into capture status and review text. Receiving a transcript never invokes the command parser or action dispatcher. The user chooses Use text, may edit it in Command, then chooses Run Command. Existing external-action approval rules still apply. The selected speech language is stored in the existing settings store; database schema remains 4.

## Offline Speech Output

`OfflineTtsController` initializes the system text-to-speech engine, lists voices with `isNetworkConnectionRequired == false` and no `KEY_FEATURE_NOT_INSTALLED`, and stores the chosen voice per engine in native preferences. Automatic selection stays within the phone's language; a missing saved voice requires another explicit choice. Before each utterance, the controller rechecks the voice, calls `setVoice` and verifies the resulting voice. It does not call `setLanguage`, trigger downloads or fall back to browser synthesis.

Engine callbacks are posted onto the main thread. Unique utterance IDs reject stale callbacks; audio focus, a two-minute playback limit, Stop, microphone capture, navigation and backgrounding end playback. Engine initialization has a ten-second timeout and generation checks; destruction releases the engine. Command responses are passed to speech only after the user taps Speak Reply; no text/audio is persisted by this adapter. Native voices are trusted according to Android engine metadata, so offline behaviour is part of phone validation. The browser retains text replies.

## Module Boundary

Each module should follow this contract:

| Field | Meaning |
| --- | --- |
| `id` | Stable module identifier |
| `name` | Human-readable module name |
| `category` | Area such as memory, OSINT, voice or automation |
| `status` | `ready`, `stub`, `planned` or `blocked` |
| `localFirst` | Whether the module can operate without cloud services |
| `requiresAndroidBridge` | Whether the native shell is needed for full power |

This keeps early features honest. A module can exist as a stub, but it should not pretend to have phone permissions or AI capability before the native bridge exists.

## Android-Native Direction

The web core should remain portable, but the final Argus app should gain an Android shell with:

- Local asset hosting so the app can boot without internet.
- A permission broker for camera, microphone, files, notifications, contacts, location and sensors.
- Intent handlers for share-sheet intake and action dispatch.
- Background workers for scheduled local checks.
- Optional local model engines for transcription, summarisation, embeddings and command planning.
- A strict rule that cloud services are opt-in accelerators, never a requirement for core operation.

## Privacy Rules

1. Store user data locally by default.
2. Export in plain JSON so the user can back up or move their data.
3. Keep AI providers behind explicit adapters.
4. Allow modules to be disabled or removed without corrupting the local database.
5. Prefer one-off/local tools before recurring paid services.
