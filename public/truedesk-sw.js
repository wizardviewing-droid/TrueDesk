const CACHE = "truedesk-shell";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/_server") ||
    url.pathname.startsWith("/api") ||
    url.pathname === "/truedesk-sw.js"
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const exact = await cache.match(url.pathname);
      if (exact) return exact;
      if (event.request.mode === "navigate") {
        const shell = await cache.match("/");
        if (shell) return shell;
      }
      return fetch(event.request);
    })(),
  );
});
