// Offline cache for the installed app. The build (vite.config.ts) writes its version and
// file list into this worker, so every deploy changes sw.js: the browser installs the new
// worker, which caches the new files and drops the old cache. Until then the old worker
// keeps serving the old version, which is what makes the app work offline.
// Paths are relative to the worker's folder, so the app works at a domain root or in a subfolder.
const PREFIX = "nt-";
const VERSION = "1792740674098";
const FILES = ["assets/index-DgBVdXGb.js","assets/html2canvas-DONuLduB.js","assets/index.es-CXt5Pqlm.js","assets/jspdf.es.min-LL3Fw5IT.js","assets/purify.es-Dqk5qvad.js","assets/svg2pdf.es.min-XkaAZwvU.js","assets/PTSerif-Bold-B6NPSmF9.ttf","assets/PTSerif-Regular-HIZd4K6A.ttf","assets/index-DYzK3-O2.css"];
const at = (p) => new URL(p, self.location.href).href;
const EXTRA = [
  "./", "index.html", "manifest.webmanifest",
  "icons/icon.svg", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
  ...["G3","Bb3","Db4","E4","G4","Bb4","Db5","E5","G5","Bb5","Db6","E6","G6","Bb6","Db7","E7"].map((n) => `samples/violin-plain/${n}.mp3`),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PREFIX + VERSION);
      // "reload" skips the HTTP cache, so a file that kept its name is fetched fresh.
      await cache.addAll([...EXTRA, ...FILES].map((p) => new Request(at(p), { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== PREFIX + VERSION).map((k) => caches.delete(k)));
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
