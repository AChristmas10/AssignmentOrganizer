/**
 * Do2Date service worker.
 *
 * WHY THIS WAS REWRITTEN
 * ----------------------
 * The previous version was cache-first for everything, with no revalidation.
 * Once a browser had index.html it kept serving that copy essentially forever,
 * so shipping a fix meant bumping "?v=NN" on the script tags by hand — which
 * works for the scripts and does nothing for the HTML that references them.
 * That is what the run of commits titled "Fixed Service Worker" was chasing.
 *
 * The rule now: anything that makes up the app (HTML, JS, CSS) is network-first,
 * so a deploy reaches people on their next load. The cache is the OFFLINE
 * fallback, which is what a student on campus wifi actually needs it for.
 * Fingerprinted or immutable assets — icons, fonts — stay cache-first, because
 * they are the ones where cache-first is free.
 */
const CACHE_NAME = "do2date-v3";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/dates.js",
  "/syllabus.js",
  "/script.js",
  "/games.js",
  "/manifest.json",
];

const PRECACHE = APP_SHELL.concat([
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Individually, not addAll: addAll is atomic, so one failing URL (a font
      // CDN hiccup, a file renamed in a deploy) throws away the entire install
      // and leaves the worker with no cache at all.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch((error) => {
              console.warn("[sw] precache skipped", url, error);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => (name === CACHE_NAME ? null : caches.delete(name)))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Is this a file that makes up the app, as opposed to an asset it loads? */
function isAppShell(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/") return true;
  return /\.(html|js|css|json)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache the syllabus endpoint. It is authenticated, metered, and
  // returns a different answer every time — a cached 429 would be a bug that
  // survives until the student clears their browser data.
  if (url.pathname.startsWith("/api/")) return;

  if (isAppShell(url)) {
    // Network first, cache as backup.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              // A navigation that misses falls back to the cached shell, so a
              // student offline on a deep link still gets the app.
              (request.mode === "navigate" ? caches.match("/index.html") : undefined)
          )
        )
    );
    return;
  }

  // Everything else — icons, fonts — cache first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
