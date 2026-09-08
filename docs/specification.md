# Argus Project Specification

## Fixed Starting Point

Argus is a personal Android assistant and OSINT workbench. The first target device is the user's Samsung Galaxy S23 Ultra. The project should start small and grow module by module.

## Non-Negotiable Constraints

- Android-first and comfortable on a phone screen.
- Local-first by default.
- No mandatory cloud server.
- No mandatory paid AI API or subscription.
- Core operation must remain possible on the phone alone.
- PC or cloud acceleration can be added later, but only as optional acceleration.
- The user is comfortable granting broad phone permissions when the native Android version needs them.

## Intended Capability Families

| Capability | Direction |
| --- | --- |
| Local assistant core | Capture, remember, search, organise and route work locally |
| OSINT workbench | Cases, sources, evidence notes, repeatable research checklists |
| Memory | Local notes first, later structured people/projects/sources/tasks |
| Voice | Local voice notes first, later offline transcription and spoken replies |
| Phone automation | Android intents, notifications, clipboard/share flows and routines |
| Device sensors | Camera, microphone, GPS, files, media, Bluetooth/NFC and sensor access where useful |
| Local AI | Optional on-device models for summarising, search, command parsing and speech |
| Safety layer | Confirm-before-action for external, destructive or sensitive actions |

## v0.1 Scope

Argus v0.1 establishes the architecture and delivers the first working local build:

- Offline installable app shell.
- Local IndexedDB storage.
- Memory capture.
- Investigation board.
- Source-link capture.
- Tool/capability registry.
- Voice-note recording.
- JSON export/import.
- Documentation for the future native Android bridge.

## v0.2 Scope

Argus v0.2 begins the Android bridge prototype:

- Local action queue for phone/automation requests.
- Confirm-before-dispatch workflow.
- Native bridge detection in the web core.
- JavaScript bridge contract for `window.ArgusAndroid`.
- Kotlin Android shell scaffold.
- Local asset sync into the Android project.
- Android share-sheet intake scaffold.

## v0.3 Scope

Argus v0.3 begins the installable/updateable APK path:

- GitHub Actions workflow for APK artifacts.
- Optional signed release APK configuration.
- Update manifest support.
- In-app update check from Settings.
- APK update actions routed through the local confirmation queue.
- Documentation for version codes, package identity and signing-key continuity.

## v0.1 Non-Goals

- No cloud AI integration.
- No paid API integration.
- No stealth collection, covert monitoring or bypassing platform permissions.
- No automated scraping or account actions yet.
- No APK from this environment because the Android SDK is not installed here.
