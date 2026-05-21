const CACHE_NAME = 'shotmate-v2';
const ASSETS = [
  './',
  './login.html',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json'
];

// Fase di installazione: salva i file principali nella memoria del telefono
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aperta e file in fase di salvataggio');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting()) // Forza l'attivazione immediata senza aspettare il riavvio
  );
});

// Fase di attivazione: pulisce le vecchie versioni della cache se aggiorni l'app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Vecchia cache eliminata:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Gestione delle richieste: serve i file salvati se offline, altrimenti li scarica dalla rete
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se il file è in cache lo restituisce, altrimenti lo richiede a internet
        return response || fetch(event.request).catch(() => {
          // Fallback di sicurezza se internet manca del tutto e il file non è in cache
          if (event.request.mode === 'navigate') {
            return caches.match('./login.html');
          }
        });
      })
  );
});
