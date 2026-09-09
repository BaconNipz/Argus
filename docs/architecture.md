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

## On-device Speech Input

`OfflineSpeechController` owns microphone sessions on Android's main thread. It checks `isOnDeviceRecognitionAvailable` and creates only `createOnDeviceSpeechRecognizer` instances on API 31+. There is no generic recognizer or browser speech-recognition fallback. API 33+ supports explicit language-support checks and user-requested model downloads.

Each capture has a unique session ID. Both Kotlin and JavaScript reject stale and terminal-session callbacks. A recording is stopped after at most 30 seconds, with a further 10-second bound for a final result; cancel, background and destroy release the recognizer. The controller does not persist audio or transcripts.

`speech.js` reduces native events into capture status and review text. Receiving a transcript never invokes the command parser or action dispatcher. The user chooses Use text, may edit it in Command, then chooses Run Command. Existing external-action approval rules still apply. The selected speech language is stored in the existing settings store; database schema remains 4.

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
