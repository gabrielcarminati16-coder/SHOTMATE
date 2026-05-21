const CACHE_NAME = 'shotmate-v1';
const ASSETS = [
  'login.html',
  'index.html',
  'style.css',
  'main.js',
  'manifest.json'
];

// Installa il Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Attiva e gestisce le richieste
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
