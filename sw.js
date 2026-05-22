const CACHE_NAME = 'shotmate-v4';

// File da mettere in cache per il funzionamento offline
const ASSETS_TO_CACHE = [
  './',
  './login.html',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json'
];

// INSTALL: metti in cache i file principali
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache aperta, aggiungo i file principali...');
        // addAll fallisce se un file non esiste, usiamo add singolo per sicurezza
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Non riesco a cachare:', url, err);
          }))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: elimina le vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Elimino vecchia cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH: strategia "Network First, poi Cache come fallback"
// Perfetto per app con Firebase (dati sempre freschi, ma funziona anche offline)
self.addEventListener('fetch', (event) => {
  // Ignora le richieste non-GET e le richieste a Firebase/Google (non cachare autenticazione)
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  const isFirebase = url.hostname.includes('firebase') || 
                     url.hostname.includes('firestore') ||
                     url.hostname.includes('googleapis') ||
                     url.hostname.includes('gstatic');

  if (isFirebase) {
    // Per Firebase: vai sempre in rete, niente cache
    event.respondWith(fetch(event.request));
    return;
  }

  // Per tutto il resto: prova la rete, se fallisce usa la cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Aggiorna la cache con la risposta fresca
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        // Rete non disponibile: usa la cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Se non c'è nemmeno in cache, restituisci la login come fallback
          return caches.match('./login.html');
        });
      })
  );
});