// Offline cache for the installed app. On install it caches every built file
// listed in precache-manifest.json, plus samples and fonts, so the editor,
// sound and PDF all work without a connection. A new deploy ships a new
// manifest version, which replaces the old cache.
// Paths are relative to the worker's folder, so the app works at a domain root or in a subfolder.
const PREFIX = "nt-";
const at = (p) => new URL(p, self.location.href).href;
const EXTRA = [
  "./", "index.html", "manifest.webmanifest",
  "icons/icon.svg", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  ...["G3","Bb3","Db4","E4","G4","Bb4","Db5","E5","G5","Bb5","Db6","E6","G6","Bb6","Db7","E7"].map((n) => `samples/violin/${n}.mp3`),
].map(at);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(at("precache-manifest.json"), { cache: "no-store" });
      const { version, files } = await res.json();
      const cache = await caches.open(PREFIX + version);
      await cache.addAll([...EXTRA, ...files.map(at)]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const current = (await caches.keys()).filter((k) => k.startsWith(PREFIX)).sort().pop();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== current).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Network first for the page, so a new version shows up when online.
    event.respondWith(fetch(req).catch(() => caches.match(at("index.html"), { ignoreVary: true, ignoreSearch: true })));
    return;
  }
  // ignoreVary: module scripts carry an Origin header the precache request did not, and servers answer with Vary: Origin.
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
