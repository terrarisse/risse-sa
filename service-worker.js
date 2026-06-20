const CACHE_NAME = 'risse-app-v8';
const URLS = [
  './',
  './index.html',
  './login.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './machine/index.html',
  './rapport/index.html',
  './bons/index.html',
  './chantiers/index.html',
  './ressources/index.html',
  './carnet/index.html',
  './calculatrice/index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then(clientsList => {
        // Prévient toutes les pages ouvertes qu'une nouvelle version vient
        // de prendre le relais, pour qu'elles forcent la déconnexion + reload.
        clientsList.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      })
  );
});

// Network first → cache fallback
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
