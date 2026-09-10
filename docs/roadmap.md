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

## v0.9 Reminder Alerts And Offline Spoken Replies

- High-importance sound/vibration defaults for new reminder categories, and repeat occurrences can alert again.
- Preserve existing category preferences; open the exact category settings for sound and pop-up changes.
- Show sound-mode, volume and Do Not Disturb checks, plus an immediate test notification.
- Native Android text-to-speech with installed offline voice selection, test and stop controls.
- Reject network-only or not-installed voices, handle audio focus and stop output for capture/backgrounding.
- User confirmed reminder delivery in v0.7/v0.8; v0.9 sound, banners and spoken output still need phone validation.

## v0.10 Reminder Notification Actions

- Snooze 10 min and Done buttons on newly posted reminder notifications and active alerts in Routines.
- Separate snooze scheduling so daily/weekly reminder times do not drift.
- Done completes a one-off or handles the current repeat occurrence while keeping the routine enabled.
- New regular occurrences supersede older snoozes.
- Revision/alert tokens protect edited, paused, deleted and already-handled reminders from old actions.
- Restore remains paused and removes all active alert/snooze authority.
- User reported v0.9 working on the phone; v0.10's new action behaviour still needs device validation.

## v0.11 Phone Backups And Broader Commands

- Save through Android's local document picker, with chunked transfer and readback verification.
- Review backup counts and validate attachments before confirmed data replacement.
- Restore reminders paused and reset pending action approvals.
- Accept polite phrasing, optional “Hey Argus” prefixes and several aliases per command family.
- Add app navigation, local summaries and read-back commands.
- Interpret supported English reminder times as drafts for explicit review, save and enable.
- Show command interpretation before running it. Ambiguous times remain unset.
- Keep tap-to-speak; dedicated offline wake detection needs a separate device/battery prototype.
- New file-picker and command behavior still needs phone validation.

## Following slices

- Add Android intents for safe actions.
- Add notification triage.
- Add clipboard/share workflows.
- Add background checks with clear battery limits.
- Use device feedback to choose whether an Argus-bundled offline speech engine is needed alongside the system adapter.
- Add a convenient shortcut to Command and evaluate a separately opt-in offline wake-detector prototype.
- Validate backup restoration across development builds on the phone and refine format/error handling from feedback.

Release signing still needs the four private GitHub Actions secrets. Debug builds remain a temporary testing path.
