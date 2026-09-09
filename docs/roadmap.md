# Argus Roadmap

## v0.1 Local Core

- Offline app shell.
- Local memory notes.
- Investigation board and source links.
- Tool registry.
- Voice-note capture.
- JSON export/import.

## v0.2 Android Bridge Prototype

- Native Android project using Kotlin.
- Bundle the web core as local app assets.
- Add Android share-sheet intake.
- Add local action queue.
- Add conservative native dispatch example for opening confirmed URLs.
- Prepare notification permission and local reminders.
- Prepare secure app lock using Android biometrics where available.

## v0.3 APK Build And Update Path

- Add APK build workflow.
- Add signed release APK configuration hooks.
- Add update manifest.
- Add in-app update checks.
- Queue APK update install actions for confirmation.

## v0.4 Assistant Memory And OSINT Evidence

- Add local full-text search.
- Add memory types: person, project, source, place, account and task.
- Add review tools for stale, duplicate or sensitive memory.
- Add source reliability fields.
- Add screenshot/file attachment evidence records.
- Add local-only investigation templates.
- Add Android system file picker support for evidence attachment.
- Add signed release APK publishing once private signing secrets are configured.

## v0.5 OSINT Workbench

- Add evidence timeline.
- Add link-analysis views.
- Add richer source comparison and case review views.
- Add source relationship labels and observed timestamps.
- Keep graph/review logic local and exportable.
- Add embeddings through a local model adapter if practical on-device.

## v0.6 Command Layer — delivered

- Add command parser with confirm-before-action safety.
- Add spoken responses using Android text-to-speech.
- Keep the first command parser deterministic and local.
- Route unclear or external commands through safe no-op or draft-action paths.

This first release used typed commands and optional speech output. On-device speech input is added in v0.8.

## v0.7 Local Reminders And Routines

- One-off, daily and weekly reminder editor.
- Native Android notification permission and settings controls.
- WorkManager scheduling with pause, edit, cancellation and delivery status.
- Calendar-based repeats, daylight-saving handling and no repeated catch-up notifications.
- Notification taps open Routines.
- Paused backup restore and cancellation before import/wipe.
- Web and native approval checks; bundled-content WebView boundary.
- Development-branch APK builds and native scheduling tests before release.

## v0.8 On-device Speech Input

- Push-to-talk controls in Command.
- Android 12+ dedicated on-device recognizer, with explicit unsupported-device states.
- Microphone permission and Android settings controls.
- Language selection, Android 13+ language checks and user-requested model downloads.
- Partial feedback and recognised-text review; no automatic command execution.
- Cancel/finish controls, foreground-only capture, time limits and stale-callback protection.
- Typed fallback, without switching to an online recognizer.

## Following slices

- Add Android intents for safe actions.
- Add notification triage.
- Add clipboard/share workflows.
- Add background checks with clear battery limits.
- Use device feedback to choose whether an Argus-bundled offline speech engine is needed alongside the system adapter.
- Add native offline speech output with an explicit check that the chosen voice does not require network synthesis.

Release signing still needs the four private GitHub Actions secrets. Debug builds remain a temporary testing path.
