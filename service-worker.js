const COREO_CACHE = 'coreo-dark-variant-v0511-chase-recovery-20260710';
const COREO_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './js/maze.js',
  './js/control.js',
  './js/camera.js',
  './js/render3d.js',
  './js/fx.js',
  './js/enemy.js',
  './js/main.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/player.png',
  './assets/enemy.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(COREO_CACHE).then((cache) => cache.addAll(COREO_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== COREO_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(COREO_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
















