// v2/service-worker.js — service worker du socle v2.
//
// Scope : /sbd-hub/v2/ (dérivé de l'emplacement du fichier). Le service worker
// du v1 a le scope /sbd-hub/ et fait du cache-first sur tout le statique : il
// intercepterait donc /sbd-hub/v2/*. Le service worker le plus spécifique gagne
// une fois actif, mais les copies déjà déposées par le v1 survivraient — d'où la
// purge ciblée à l'activation.
//
// Règle du socle : AUCUNE réponse Supabase n'est mise en cache. Un service
// worker trop zélé qui sert des données périmées coûte cher à diagnostiquer.

const CACHE_V2 = 'trainhub-v2-001';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './vendor/supabase.js',
  './js/config.js',
  './js/client.js',
  './js/auth.js',
  './js/donnees.js',
  './js/modele.js',
  './js/rendu.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  // Le socle est en cours d'amorçage : on veut toujours la version fraîche,
  // sans étape « mise à jour disponible ».
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_V2).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.map(async (nom) => {
      if (nom === CACHE_V2) return;
      // Caches v2 périmés : suppression complète.
      if (nom.startsWith('trainhub-v2-')) return caches.delete(nom);
      // Caches du v1 : on ne supprime QUE les entrées /v2/ qu'il a pu happer
      // avant que ce service worker ne prenne son scope. Le v1 reste intact.
      const cache = await caches.open(nom);
      const requetes = await cache.keys();
      await Promise.all(requetes
        .filter((r) => new URL(r.url).pathname.includes('/v2/'))
        .map((r) => cache.delete(r)));
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Jamais de cache sur les données : Supabase, Edge Functions, non-GET.
  if (url.hostname.includes('supabase.co') ||
      url.pathname.startsWith('/functions/v1/') ||
      req.method !== 'GET') {
    return;
  }

  // Shell v2 uniquement. Hors de notre scope, on laisse passer.
  if (!url.pathname.includes('/v2/')) return;

  // Réseau d'abord, cache en repli : le socle doit montrer le code du jour,
  // et rester ouvrable hors réseau (pas d'écran blanc).
  event.respondWith((async () => {
    try {
      const reponse = await fetch(req);
      if (reponse && reponse.status === 200) {
        const copie = reponse.clone();
        caches.open(CACHE_V2).then((cache) => cache.put(req, copie));
      }
      return reponse;
    } catch (e) {
      const cache = await caches.open(CACHE_V2);
      const cached = await cache.match(req);
      if (cached) return cached;
      const repli = await cache.match('./index.html');
      if (repli && req.mode === 'navigate') return repli;
      throw e;
    }
  })());
});
