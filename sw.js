const CACHE = "vinteddash-v1";
const ASSETS = [
  "/VintedDashBoard/index.html",
  "/VintedDashBoard/css/style.css",
  "/VintedDashBoard/js/app.js",
  "/VintedDashBoard/manifest.json",
  "/VintedDashBoard/icons/icon.svg",
  "/VintedDashBoard/icons/icon-192.png",
  "/VintedDashBoard/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});