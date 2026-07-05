const CACHE_NAME = 'risse-app-v9';
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
  './chantiers/plan/index.html',
  './ressources/index.html',
  './carnet/index.html',
  './calculatrice/index.html',
  './assets/pdf-templates/01.pdf',
  './assets/pdf-templates/02.pdf',
  './assets/pdf-templates/03.pdf',
  './assets/pdf-templates/04.pdf',
  './assets/pdf-templates/05.pdf',
  './assets/pdf-templates/06.pdf',
  './assets/pdf-templates/07.pdf',
  './assets/pdf-templates/08.pdf',
  './assets/pdf-templates/09.pdf',
  './assets/pdf-templates/10.pdf',
  './assets/pdf-templates/11.pdf',
  './assets/pdf-templates/12.pdf',
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

// Network first → cache fallback (uniquement pour les requêtes GET —
// l'API Cache ne supporte pas les autres méthodes, ex. les écritures Firestore en POST)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // laisse passer normalement, pas d'interception

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
