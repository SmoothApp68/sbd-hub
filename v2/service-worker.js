// v2/service-worker.js — service worker du socle v2.
//
// Hébergement : Cloudflare Pages sert `v2/` **à la racine du domaine**. Le service
// worker est donc servi depuis `/service-worker.js` et son scope est `/` — il n'y
// a plus de préfixe `/sbd-hub/`, et le v1 n'est plus servi du tout.
//
// Règle du socle : AUCUNE réponse Supabase n'est mise en cache. Un service worker
// trop zélé qui sert des données périmées coûte cher à diagnostiquer.

const CACHE_V2 = 'trainhub-v2-006';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/supabase.js',
  './js/config.js',
  './js/client.js',
  './js/auth.js',
  './js/donnees.js',
  './js/modele.js',
  './js/sync.js',
  './js/semaine.js',
  './js/routeur.js',
  './js/sortie.js',
  './js/cache.js',
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
    // Suppression des caches v2 périmés. Rien à purger côté v1 : il n'est plus
    // servi, donc son service worker ne peut plus rien intercepter.
    const noms = await caches.keys();
    await Promise.all(noms.map((nom) => (nom === CACHE_V2 ? null : caches.delete(nom))));
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

  // Notre propre origine uniquement. Le scope étant devenu `/`, un filtre sur un
  // segment de chemin ne servirait plus à rien — il ne matcherait même plus.
  if (url.origin !== self.location.origin) return;

  // Les URL de vue (/semaine/…, /seance/…) ne sont pas des fichiers : le serveur
  // y répond par la coquille. On la sert donc directement, et surtout on ne la
  // met PAS en cache sous l'URL demandée — sinon chaque semaine visitée créerait
  // une entrée, et une coquille périmée survivrait à une mise à jour.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch (e) {
        const cache = await caches.open(CACHE_V2);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

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
