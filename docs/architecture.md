# Argus Architecture

## Product Shape

Argus is an Android-first personal assistant, OSINT notebook and automation hub. The primary device target is a Samsung Galaxy S23 Ultra. The app must remain useful without a PC, subscription, remote server or paid AI API.

## Core Layers

| Layer | Responsibility | v0.1 Status |
| --- | --- | --- |
| Interface | Fast phone UI for capture, review and command flow | Offline PWA |
| Local Core | Data model, module registry, import/export, privacy defaults | Implemented |
| Local Storage | Memory, investigations, tool records, voice notes and events | IndexedDB |
| Capability Modules | OSINT, memory, voice, automation and assistant tools | Stubbed and extensible |
| Android Shell | Deep phone permissions and background services | Planned |
| Local AI Runtime | Optional local LLM, transcription, embeddings and ranking | Planned |

## Data Stores

Argus v0.1 uses these local object stores:

| Store | Purpose |
| --- | --- |
| `memory` | Notes, observations, copied snippets and user context |
| `investigations` | OSINT cases with saved sources and working notes |
| `tools` | Local registry of Argus capabilities and external/manual tools |
| `voiceNotes` | Local audio captures and optional transcripts |
| `settings` | Device-local preferences |
| `events` | Simple audit trail for local actions |

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

