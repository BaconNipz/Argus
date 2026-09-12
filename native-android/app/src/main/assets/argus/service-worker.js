const CACHE_NAME = "argus-v0.15.0";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./argus-core.js",
  "./command-language.js",
  "./command-access.js",
  "./wake-phrase.js",
  "./background-voice.js",
  "./phone-actions.js",
  "./backup.js",
  "./routines.js",
  "./speech.js",
  "./speech-output.js",
  "./notification-status.js",
  "./android-bridge.js",
  "./db.js",
  "./updater.js",
  "./update.json",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.endsWith("/share-target")) {
    requestUrl.pathname = requestUrl.pathname.replace(/share-target$/, "index.html");
    requestUrl.searchParams.set("shared", "1");
    event.respondWith(Response.redirect(requestUrl.toString(), 303));
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
