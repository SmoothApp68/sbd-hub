const CACHE_NAME = 'trainhub-v173';
const IMAGE_CACHE_NAME = 'trainhub-images-v1';
const ASSETS_TO_CACHE = [
  '/sbd-hub/',
  '/sbd-hub/index.html',
  '/sbd-hub/manifest.json',
  '/sbd-hub/icons/icon-192.png',
  '/sbd-hub/icons/icon-512.png',
  '/sbd-hub/js/chart.min.js',
  '/sbd-hub/js/supabase-cdn.min.js',
  '/sbd-hub/js/app.min.js',
  '/sbd-hub/js/engine.min.js',
  '/sbd-hub/js/supabase.min.js',
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
  // Never cache Supabase requests
  if (event.request.url.includes('supabase.co')) return;

  // Exercise images → cache séparé avec stratégie cache-first
  if (event.request.url.includes('raw.githubusercontent.com') && event.request.url.includes('/exercises/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
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
