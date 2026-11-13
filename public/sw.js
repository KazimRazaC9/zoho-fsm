/* FieldServe service worker: installable app shell + offline page.
   Job data is private, so pages and API responses are never cached here.

   Built JavaScript (/_next/static) is NOT cached by this worker: the browser's own HTTP cache already
   handles those files correctly. Caching them here once served stale code after a rebuild, which showed up
   as "Server Action ... was not found on the server" on login and logout.

   On a developer machine (localhost) the worker removes itself and its caches: it only gets in the way. */
const VERSION = "fs-v2";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  if (LOCAL) return void self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from older versions (all of them on localhost).
      const stale = (await caches.keys()).filter((k) => LOCAL || !k.startsWith(VERSION));
      await Promise.all(stale.map((k) => caches.delete(k)));
      if (LOCAL) await self.registration.unregister();
      else await self.clients.claim();
      // Pages opened through the old cache still run old code: reload them once.
      if (stale.length > 0) {
        const open = await self.clients.matchAll({ type: "window" });
        for (const client of open) await client.navigate(client.url).catch(() => undefined);
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (LOCAL) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first; when offline show the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Icons never change for a given URL: cache first.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
