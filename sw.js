const CACHE_NAME = 'shotmate-v5';
const BASE = '/SHOTMATE';

const ASSETS_TO_CACHE = [
  BASE + '/',
  BASE + '/login.html',
  BASE + '/index.html',
  BASE + '/style.css',
  BASE + '/main.js',
  BASE + '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Non riesco a cachare:', url, err);
          }))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isExternal = url.hostname.includes('firebase') ||
                     url.hostname.includes('firestore') ||
                     url.hostname.includes('googleapis') ||
                     url.hostname.includes('gstatic') ||
                     url.hostname.includes('icons8') ||
                     url.hostname.includes('openstreetmap') ||
                     url.hostname.includes('nominatim') ||
                     url.hostname.includes('unpkg');

  if (isExternal) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          return caches.match(BASE + '/login.html');
        });
      })
  );
});
