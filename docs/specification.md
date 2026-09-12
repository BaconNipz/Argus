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

## v0.4 Scope

Argus v0.4 turns the foundation into a more useful local assistant and OSINT workbench:

- Local search across memory, cases, sources, evidence, tools, voice notes and action drafts.
- Structured memory types and sensitivity labels.
- Memory review counts for stale, duplicate and sensitive notes.
- OSINT lead builder for usernames, emails, domains, URLs and image-metadata notes.
- Case templates with repeatable local checklists.
- Source type and reliability labels.
- Evidence records with local file attachments, notes and tags.
- Android WebView file picker support for evidence attachment.

## v0.4.1 Scope

Argus v0.4.1 stabilises the early Android release update path:

- Keep Android signing keys out of source control.
- Publish signed release APK assets when signing secrets are configured.
- Keep debug fallback APKs available only for early testing.
- Preserve private release signing behind GitHub Actions secrets.

## v0.5 Scope

Argus v0.5 adds the first local OSINT workbench layer:

- Case review summaries for sources, evidence and support gaps.
- Evidence timeline across case creation, source capture and evidence records.
- Source relationship labels such as reference, same-identity, corroborates and contradicts.
- Optional observed timestamps for sources and evidence.
- Local link analysis between cases, targets, sources, domains, entities and evidence.
- No automated scraping or cloud AI requirement.

## v0.6 Scope

Argus v0.6 adds the first local command layer:

- Phone-friendly Command screen.
- Rule-based local command parser.
- Commands for memory capture, case creation, source saving and local search.
- URL-opening and reminder commands routed into the confirm-first action queue.
- Optional spoken command replies through browser or Android text-to-speech.
- Offline speech-to-text remains an adapter target for a later native/local model slice.

## v0.7 Scope

- Routines screen for one-off, daily and weekly reminders.
- Android notification permission handling and links to Android notification settings.
- Explicit Enable to schedule a saved reminder; pause and deletion cancel pending work.
- WorkManager runs local background notifications without a network requirement or continuous service.
- Saved time-zone calendar repeats preserve the chosen wall-clock time.
- Delivery status mirrors into IndexedDB; tapping a notification opens Routines.
- Backup restore leaves reminders paused; import/wipe cancels existing native schedules.
- Notification triage, arbitrary automation chains and offline transcription remain later work.

## v0.8 Scope

- Push-to-talk spoken command capture through Android's dedicated on-device speech-recognition API.
- Explicit microphone permission, recognizer availability, language selection and optional language-pack setup.
- Review recognised text, then copy it into the command editor and run it explicitly.
- No automatic parsing or dispatch on a speech callback.
- Foreground-only bounded sessions, recognizer teardown and cancelled/stale callback rejection.
- No Argus-owned audio file is created for command capture.
- Browser and unsupported-device users retain typed commands.
- Existing voice-note recording is separate; saved audio-file transcription and a bundled speech engine remain future work.

## v0.9 Scope

- Reminder categories request banner priority, sound and vibration on first creation; existing Android category preferences remain intact.
- Repeating reminders can alert again when their previous card is still visible.
- Direct reminder-category settings, alert diagnostics and a test-notification button.
- Command reply playback through installed Android voices marked as offline, with voice picker, test and stop controls.
- No implicit voice download or online synthesis fallback. Android settings manage engine and voice installation.
- Playback stops on microphone capture, navigation, backgrounding or audio focus loss; late callbacks cannot restart it.

## v0.10 Scope

- Snooze 10 min and Done actions on newly posted reminder notifications, with matching Routines controls.
- Done affects the current occurrence; Pause remains the control for stopping future repeats.
- Snoozes have their own pending work and do not shift the routine's regular time.
- A newer regular occurrence supersedes a delayed snooze of an older occurrence.
- Notification actions validate revision and alert tokens, consume authority once and reject stale callbacks.
- Import, wipe, pause, edit and deletion cannot leave an old action capable of reactivating a reminder.
- No new permissions, cloud service or database schema change.

## v0.11 Scope

- Native document backup export with ordered chunks, size limits, cancellation and written-file verification.
- Validated backup review with attachment decoding before confirmed transactional restore.
- Paused restored reminders and fresh approval for pending actions.
- Broader English command phrases, app navigation, local summaries and explicit read-back controls.
- Supported relative/calendar reminder times prefill the editor for review; they never enable scheduling automatically.
- Ambiguous, invalid, past and nonexistent local times need correction.
- “Hey Argus” can prefix text after tap-to-speak; background wake activation remains a separate future component.

## v0.12 Scope

- Dynamic Android Command shortcut with optional user-confirmed home-screen pinning.
- Quick Settings tile with locked-device unlock and Android 13+ add-tile prompt support.
- Navigation-only launch intents. No automatic speech capture, text execution or external action.
- A once-only token handoff after database startup and active backup/command operations.
- New intents supersede old pending requests; activity recreation preserves only unconsumed requests.
- Warm launches reuse MainActivity and retain the in-memory command draft.
- No new requested permissions, wake detector, foreground microphone service or database schema change.

## Current Boundaries

- No cloud AI integration.
- No paid API integration.
- No stealth collection, covert monitoring or bypassing platform permissions.
- No automated scraping or account actions yet.
- Android compilation runs in GitHub Actions; this workspace does not contain the Android SDK.

## v0.13 Scope

An experimental, explicitly armed foreground “Hey Argus” detector. The English sherpa-onnx KWS model and runtime ship inside the ARM64 APK. One session lasts at most five minutes and keeps the screen awake. A hit releases the wake microphone before a one-use, five-second handoff to existing on-device transcription. Commands still require review and explicit execution; external actions retain their approval flow. Stop, navigation, backgrounding, locking and destruction cancel the session. No persistence, auto-rearm, background microphone service or additional permission is introduced. Device recognition/noise/battery results gate any expansion beyond this prototype.

## v0.14 Scope

An explicitly enabled background wake listener, remembered after setup and shown in an ongoing microphone foreground-service notification. The user may select Argus as Android's digital assistant; its system voice session requests an assistant activity after detection. Without that role, a fresh notification tap opens capture. Only an expiring native ticket can start automatic command recording, and the app must be visible and the phone unlocked. The process-wide audio gate releases wake capture before speech and excludes spoken output from wake listening. Supported local commands can run automatically after wake; unknown commands remain review text, reminder commands remain drafts and external actions retain their approval queue. New native listening preferences are excluded from both backup routes. Lock/screen-off pauses wake capture, notification Pause persists, and OS force-stop/restart constraints are documented. Microphone-volume feedback separates signal level from recognition success.

## v0.14.1 Wake Feedback And Handoff Repair

Phone feedback reported silent wake detections and command handling delayed until manual app opening. The patch adds a separate alerting wake notification, a command-ready beep with two vibrations, and setup diagnostics. The selected, system-bound assistant service first requests the existing Argus activity directly; one assistant-session fallback is available if it stays hidden. Fresh requests are replayed after native focus/WebView startup until claimed or expired. Setup-control focus no longer blocks capture; unfinished content remains protected. See `docs/releases/v0.14.1.md`. Samsung launch, sound and haptic behaviour still need phone validation.
