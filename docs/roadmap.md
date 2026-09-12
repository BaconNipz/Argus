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

## v0.12 Command Access

- Publish a Command shortcut in Android launchers that support app shortcuts.
- Offer a home-screen pin request from Command, with honest request/pinned status.
- Open Command from an Argus Quick Settings tile, with unlock required on locked devices.
- Offer Android 13+ tile setup prompts and manual Edit instructions on older devices.
- Wait for local startup and active backup/command operations; consume a launch once and reject stale requests.
- Preserve a typed draft during a warm launch; never start the microphone or execute intent text.
- Launcher, tile, lock-screen and interrupted-picker behavior still needs phone validation.

## v0.13 Foreground Hey Argus Prototype

- Explicitly arm one offline wake test for up to five minutes while Command stays open.
- Bundle the pinned runtime/model in an ARM64 APK, with checksums and licence notices.
- Offer Standard / More sensitive settings; keep the screen awake during listening.
- Release wake audio before one-use on-device command capture, with recognised-text review unchanged.
- Cancel on Stop, leaving Command, locking, backgrounding, timeout or activity destruction.
- Measure real voice detection, accidental triggers, handoff and battery use on the phone before considering longer sessions.

## v0.14 Background Voice And Assistant Setup

- Remember an explicitly enabled microphone foreground service with an ongoing Pause notification.
- Provide Android digital-assistant selection and a system voice session that opens Command after a wake detection.
- Keep notification-tap fallback when Argus is not the selected assistant.
- Use one-use expiring wake tickets, shared audio ownership and foreground/unlock checks for command capture.
- Optionally execute supported local spoken commands; retain reviewed reminder and external-action drafts.
- Show microphone-level diagnostics and default to the existing More sensitive setting in the new setup.
- Pause while locked/screen-off and respect a persistent Pause choice; exclude enable settings from backups.
- User confirmed v0.13 detects the phrase but misses their voice often. Accuracy and battery use remain device work.

## Following slices

- Expand the reviewed Android actions from v0.15 using phone feedback.
- Add notification triage.
- Expand explicit share workflows; consider clipboard capture only with a user control.
- Add background checks with clear battery limits.
- Use device feedback to choose whether an Argus-bundled offline speech engine is needed alongside the system adapter.
- Use v0.14 phone feedback to tune wake recognition and validate default-assistant launch, microphone recovery and battery use before screen-off listening.
- Validate backup restoration across development builds on the phone and refine format/error handling from feedback.

Release signing still needs the four private GitHub Actions secrets. Debug builds remain a temporary testing path.

## v0.14.1 Wake Feedback And Handoff Repair

Phone feedback reported silent wake detections and command handling delayed until manual app opening. The patch adds a separate alerting wake notification, a command-ready beep with two vibrations, and setup diagnostics. The selected, system-bound assistant service first requests the existing Argus activity directly; one assistant-session fallback is available if it stays hidden. Fresh requests are replayed after native focus/WebView startup until claimed or expired. Setup-control focus no longer blocks capture; unfinished content remains protected. See `docs/releases/v0.14.1.md`. Samsung launch, sound and haptic behaviour still need phone validation.

## v0.15 Reviewed Phone Actions

- Maps place/address searches, explicit numbers in the dialer and chosen text in Android’s share chooser.
- Natural command variants and a simple editor with full review cards.
- Save as draft, approve, then open; changes reset approval and restored pending actions need fresh approval.
- Validate typed payloads on both sides of the bridge; reject contact names, service codes and extensions.
- Require an unlocked, focused Argus activity for native handoff and suppress repeated taps.
- Record “handed off” separately from completion; Argus cannot observe a call or sent message.
- No additional Android permissions; v0.14.1 wake behavior stays available for ongoing phone testing.
- Actual map/dialer/share apps still need phone validation. See `docs/releases/v0.15.0.md`.
