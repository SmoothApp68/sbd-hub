// tests/banc/fixtures/sw-chantier-18.js — LE DÉFAUT, GARDÉ EXPRÈS.
//
// ⚠️ Ce fichier n'est PAS du code d'application. C'est le service worker tel
// qu'il était au chantier 18 (commit 8d32133), conservé comme fixture pour que
// le banc puisse REPRODUIRE l'état cassé au lieu de le décrire.
//
// Ce qu'il fait de travers, en deux endroits :
//   · `cache.add('./index.html')` suit le 308 de canonicalisation de Cloudflare
//     et met en cache une réponse marquée `redirected: true` ;
//   · à la navigation, il sert cette entrée SANS LA REGARDER (`if (coquille)`),
//     et le navigateur convertit une réponse redirigée servie à une navigation
//     en erreur réseau. `ERR_FAILED`, réseau présent, seule sortie : effacer
//     les données du site à la main.
//
// Ne le corrige pas. S'il cesse de casser l'app au scénario 5, c'est le banc
// qui est devenu aveugle — pas le défaut qui a disparu.
//
// Ci-dessous : le fichier d'origine, sans une ligne de changement.
// ────────────────────────────────────────────────────────────────────────────
// v2/service-worker.js — service worker du socle v2.
//
// Hébergement : Cloudflare Pages sert `v2/` **à la racine du domaine**. Le service
// worker est donc servi depuis `/service-worker.js` et son scope est `/` — il n'y
// a plus de préfixe `/sbd-hub/`, et le v1 n'est plus servi du tout.
//
// Règle du socle : AUCUNE réponse Supabase n'est mise en cache. Un service worker
// trop zélé qui sert des données périmées coûte cher à diagnostiquer.
//
// COQUILLE SERVIE DEPUIS LE CACHE D'ABORD (chantier 18). Le réseau d'abord
// tenait tant que le réseau ÉCHOUE — hors ligne, `fetch` rejette tout de suite
// et le repli joue. Il ne tient pas quand le réseau RÉPOND MAL : un wifi de
// salle qui s'associe sans donner d'accès ne fait pas échouer `fetch`, il le
// fait PENDRE, et c'est alors l'app entière qui pend. La coquille est versionnée
// par CACHE_V2 : la servir depuis le cache est sans risque, et une nouvelle
// version prend la main par le cycle install/activate, pas par une requête.
const CACHE_V2 = 'trainhub-v2-017';

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
  './js/palier.js',
  './js/periode.js',
  './js/poids.js',
  './js/calendrier.js',
  './js/routeur.js',
  './js/sortie.js',
  './js/cache.js',
  './js/rendu.js',
  './js/app.js'
];

// Les deux fichiers sans lesquels « hors ligne » ne veut rien dire : la page et
// le script qui la fait vivre. Leur absence fait échouer l'installation, pour
// qu'elle soit retentée, plutôt que de laisser croire à une coquille complète.
const INDISPENSABLES = ['./index.html', './js/app.js'];

self.addEventListener('install', (event) => {
  // Le socle est en cours d'amorçage : on veut toujours la version fraîche,
  // sans étape « mise à jour disponible ».
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_V2);
    // Entrée par entrée, pas `addAll` : celui-ci est tout ou rien, et un seul
    // fichier manqué sur un réseau capricieux laissait l'app SANS AUCUN cache.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)));
    const presents = await Promise.all(INDISPENSABLES.map((u) => cache.match(u)));
    if (presents.some((r) => !r)) throw new Error('coquille incomplète');
  })());
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
  // y répond par la coquille. On sert donc TOUJOURS la coquille en cache, sans
  // même tenter le réseau — et surtout on ne la met PAS en cache sous l'URL
  // demandée, sinon chaque semaine visitée créerait une entrée et une coquille
  // périmée survivrait à une mise à jour.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_V2);
      const coquille = await cache.match('./index.html');
      if (coquille) return coquille;
      // Pas encore de coquille (toute première visite) : le réseau, faute de mieux.
      try { return await fetch(req); } catch (e) { return Response.error(); }
    })());
    return;
  }

  // Coquille : CACHE D'ABORD, et rafraîchissement en arrière-plan. L'app démarre
  // à la vitesse du disque, réseau ou pas, et la copie fraîche est prête pour
  // l'ouverture suivante.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_V2);
    const enCache = await cache.match(req);
    if (enCache) {
      // Volontairement PAS attendu : une mise à jour en arrière-plan ne doit
      // jamais retarder une réponse qu'on a déjà.
      fetch(req).then((r) => {
        if (r && r.status === 200) cache.put(req, r.clone());
      }).catch(() => {});
      return enCache;
    }
    // Absent du cache : réseau, et on garde ce qu'on reçoit.
    try {
      const reponse = await fetch(req);
      if (reponse && reponse.status === 200) cache.put(req, reponse.clone());
      return reponse;
    } catch (e) {
      throw e;
    }
  })());
});
