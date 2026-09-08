# Argus v0.3

Argus is a phone-first, local-first personal assistant and OSINT workbench designed for a Samsung Galaxy S23 Ultra. The core rule is simple: Argus should work without a mandatory subscription, cloud server, or paid AI API.

The current working build is an installable offline web app core, with the first native Android shell scaffold now prepared under `native-android/`. Argus v0.3 adds the APK build and update path so the project can produce installable Android builds once it is opened in Android Studio or run through CI.

## What v0.1 Does

- Runs as a responsive mobile app from the `dist/` build.
- Works offline after first load through a service worker.
- Stores data locally in IndexedDB.
- Captures memory notes, investigations, OSINT source links, tool entries and voice notes.
- Queues draft Android/automation actions for confirmation before dispatch.
- Exports and imports the whole local Argus dataset as JSON.
- Includes a share-target route for later Android share-sheet intake.
- Includes a Kotlin Android shell scaffold for Android Studio.
- Includes a GitHub Actions workflow for building APK artifacts.
- Includes update manifest support so newer APKs can be queued for install.
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
