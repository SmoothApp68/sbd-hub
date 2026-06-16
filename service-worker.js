const CACHE_NAME = 'trainhub-v287';
const IMAGE_CACHE_NAME = 'trainhub-images-v1';
const ASSETS_TO_CACHE = [
  '/sbd-hub/',
  '/sbd-hub/index.html',
  '/sbd-hub/manifest.json',
  '/sbd-hub/icons/icon-192.png',
  '/sbd-hub/icons/icon-512.png',
  '/sbd-hub/js/chart.min.js',
  '/sbd-hub/js/supabase-cdn.min.js',
  '/sbd-hub/js/app.js',
  '/sbd-hub/js/engine.js',
  '/sbd-hub/js/supabase.js',
  '/sbd-hub/js/exercises.js',
  '/sbd-hub/js/import.js',
  '/sbd-hub/js/program.js',
  '/sbd-hub/js/joints.js',
  '/sbd-hub/js/coach.js',
  '/sbd-hub/assets/body-front.svg',
  '/sbd-hub/assets/body-back.svg',
  '/sbd-hub/assets/body-front-female.svg',
  '/sbd-hub/assets/body-back-female.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME && n !== IMAGE_CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne jamais cacher : Supabase, APIs Google, Edge Functions, requêtes non-GET.
  // Laisser le navigateur faire le réseau par défaut (données toujours fraîches).
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.startsWith('/functions/v1/') ||
    req.method !== 'GET'
  ) {
    return;
  }

  // Images d'exercices → cache séparé, cache-first
  if (url.href.includes('raw.githubusercontent.com') && url.href.includes('/exercises/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((response) => {
            if (response.ok) cache.put(req, response.clone());
            return response;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // Shell statique (HTML/JS/CSS/SVG/icons) → CACHE-FIRST + stale-while-revalidate :
  // servir le cache immédiatement (plus de stall sur wifi lent qui "pend"), puis
  // revalider en arrière-plan. Le bump de CACHE_NAME force le rafraîchissement.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      });
      if (cached) {
        networkFetch.catch(() => {}); // revalidation silencieuse (offline-safe)
        return cached;
      }
      return networkFetch; // premier chargement non caché → réseau
    })
  );
});

// Push notifications
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : { title: 'TrainHub', body: 'Notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/sbd-hub/icons/icon-192.png',
      badge: '/sbd-hub/icons/icon-192.png',
      vibrate: [100, 50, 100]
    })
  );
});
