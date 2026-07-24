/* ============================================================================
   Heart2Heart Kenya — service worker.

   Makes the app installable and usable offline. Bump CACHE on a release to
   evict old assets. Cross-origin requests (Supabase auth/API/CDN) are passed
   straight to the network — never cached — so live data is always fresh and
   auth is never served stale.
   ============================================================================ */
const CACHE = "h2h-v5";

// Relative to the SW's scope, so this works under the GitHub Pages subpath too.
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./supabase-config.js",
  "./backend.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Don't let one 404 abort the whole precache.
    await Promise.allSettled(SHELL.map((u) => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only manage our own origin — Supabase and any CDN go straight to network.
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const fromNetwork = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    // stale-while-revalidate: serve cache instantly, refresh in the background
    if (cached) { fromNetwork; return cached; }

    const res = await fromNetwork;
    if (res) return res;

    // Offline and uncached: fall back to the app shell for navigations.
    if (req.mode === "navigate") {
      return (await cache.match("./index.html")) || (await cache.match("./")) ||
        new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("", { status: 504 });
  })());
});
