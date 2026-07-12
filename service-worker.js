const CACHE_NAME = 'trainhub-v328';
const IMAGE_CACHE_NAME = 'trainhub-images-v1';
const ASSETS_TO_CACHE = [
  '/sbd-hub/',
  '/sbd-hub/index.html',
  '/sbd-hub/manifest.json',
  '/sbd-hub/icons/icon-192.png',
  '/sbd-hub/icons/icon-512.png',
  '/sbd-hub/js/chart.min.js',
  '/sbd-hub/js/supabase-cdn.min.js',
  '/sbd-hub/js/sentry.min.js',
  '/sbd-hub/js/sentry-init.js',
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
  // Pas de skipWaiting() automatique : on laisse le nouveau SW en "waiting" pour
  // surfacer "mise à jour disponible" dans les réglages. L'activation se fait sur
  // tap utilisateur (message SKIP_WAITING) → controllerchange → reload.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Canal version + activation à la demande. La page demande GET_VERSION au SW
// ACTIF (source de vérité) ; SKIP_WAITING active le SW en attente sur tap.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'GET_VERSION') {
    const payload = { type: 'VERSION', version: CACHE_NAME };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    else if (event.source && event.source.postMessage) event.source.postMessage(payload);
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME && n !== IMAGE_CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
});

// ── Negative-cache des images ratées (TTL) ───────────────────────────────────
const NEG_TTL_404 = 7 * 24 * 3600 * 1000; // 404 : 7 jours (n'existera pas de sitôt)
const NEG_TTL_429 = 6 * 3600 * 1000;       // 429 / réseau : 6 h (temporaire)
// Sentinelle stockée en cache à la place d'une image en échec (marquée par en-têtes).
function negCacheSentinel(status) {
  return new Response('', { status: 504, headers: {
    'X-Neg-Cache': '1', 'X-Neg-Status': String(status), 'X-Neg-Time': String(Date.now())
  } });
}
// La sentinelle est-elle encore dans son TTL ? (sinon on refetch)
function negCacheFresh(resp) {
  const status = parseInt(resp.headers.get('X-Neg-Status') || '0', 10);
  const t = parseInt(resp.headers.get('X-Neg-Time') || '0', 10);
  const ttl = status === 429 ? NEG_TTL_429 : NEG_TTL_404;
  return (Date.now() - t) < ttl;
}
// Fetch une image : cache la 200, ou negative-cache l'échec (404/429/réseau) + rend un 404 à l'app.
function fetchAndCacheImage(cache, req) {
  return fetch(req).then((response) => {
    if (response.ok) { cache.put(req, response.clone()); return response; }
    cache.put(req, negCacheSentinel(response.status)); // échec HTTP → negative-cache
    return new Response('', { status: 404 });
  }).catch(() => {
    cache.put(req, negCacheSentinel(429)); // erreur réseau → TTL court
    return new Response('', { status: 404 });
  });
}

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

  // Images d'exercices → cache séparé, cache-first pour les 200. Negative-cache
  // (avec TTL) pour les échecs : sans ça, chaque 404/429 re-tapait le host à CHAQUE
  // ouverture du picker → 429 récurrents. 404 = TTL long (l'image n'existe pas),
  // 429/erreur réseau = TTL court (rate-limit temporaire → on réessaie après).
  if (url.href.includes('raw.githubusercontent.com') && url.href.includes('/exercises/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) {
            if (cached.headers.get('X-Neg-Cache') === '1') {
              if (negCacheFresh(cached)) return new Response('', { status: 404 }); // encore en échec → onerror app
              return cache.delete(req).then(() => fetchAndCacheImage(cache, req)); // TTL expiré → réessai
            }
            return cached; // vraie image 200 en cache
          }
          return fetchAndCacheImage(cache, req);
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
