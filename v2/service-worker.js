// v2/service-worker.js — service worker du socle v2.
//
// Hébergement : Cloudflare Pages sert `v2/` **à la racine du domaine**. Le service
// worker est donc servi depuis `/service-worker.js` et son scope est `/` — il n'y
// a plus de préfixe `/sbd-hub/`, et le v1 n'est plus servi du tout.
//
// Règle du socle : AUCUNE réponse Supabase n'est mise en cache. Un service worker
// trop zélé qui sert des données périmées coûte cher à diagnostiquer.
//
// ══ LA RÈGLE À RETENIR DE TOUT CE FICHIER ══════════════════════════════════
//
//   AUCUN `await` SANS ISSUE DANS LE GESTIONNAIRE `fetch`.
//
// Un service worker qui pend dans `respondWith` est le SEUL cas vraiment
// irrécupérable : la navigation ne finit jamais, la trappe de sortie ci-dessous
// pend avec elle, et la mise à jour du service worker peut ne jamais aboutir.
// Tout `await` doit porter sur quelque chose qui se règle — un `fetch` (qui
// échoue), une opération de cache — jamais sur une promesse qui peut ne jamais
// se résoudre. Un service worker cassé se remplace ; un service worker figé
// s'efface à la main, dans les réglages du téléphone.
//
// ══ POURQUOI LA COQUILLE EST SERVIE DEPUIS LE CACHE ════════════════════════
//
// Réseau d'abord tient tant que le réseau ÉCHOUE : `fetch` rejette aussitôt et
// le repli joue. Ça ne tient pas quand le réseau RÉPOND MAL — un wifi de salle
// qui s'associe sans donner d'accès ne fait pas échouer `fetch`, il le fait
// PENDRE, et c'est alors l'app entière qui pend. La coquille est versionnée par
// CACHE_V2 : la servir depuis le cache est sans risque, et une nouvelle version
// prend la main par le cycle install/activate, pas par une requête.
//
// ══ ET POURQUOI LA RÉPONSE EN CACHE DOIT ÊTRE VALIDÉE ══════════════════════
//
// Parce que servir la coquille en cache sans la vérifier a rendu l'app
// INACCESSIBLE EN LIGNE (chantier 19). Voir `utilisable` et `desempoisonner`.

const CACHE_V2 = 'trainhub-v2-133';

// Le chemin de la trappe de sortie. Tapé à la main dans la barre d'adresse
// quand tout le reste est cassé : il doit rester court et mémorisable.
const CHEMIN_SORTIE = '/__sw-off';

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
  './js/moteur.js',
  './js/routines.js',
  './js/attente.js',
  './js/seance.js',
  './js/plan.js',
  './js/periode.js',
  './js/poids.js',
  './js/calendrier.js',
  './js/profil.js',
  './js/routeur.js',
  './js/sortie.js',
  './js/cache.js',
  './js/rendu.js',
  './js/rejeu.js',
  './js/app.js'
];

// Les deux fichiers sans lesquels « hors ligne » ne veut rien dire : la page et
// le script qui la fait vivre. Leur absence fait échouer l'installation, pour
// qu'elle soit retentée, plutôt que de laisser croire à une coquille complète.
const INDISPENSABLES = ['./index.html', './js/app.js'];

// ── LA GARDE ────────────────────────────────────────────────────────────────
//
// ⚠️ `redirected` EST LA SEULE PROPRIÉTÉ QUI ATTRAPE CE CAS. Ne la retire pas,
// et ne « simplifie » pas ce test en `!!r` ou en `r.ok`.
//
// La réponse empoisonnée est un **200**, elle est **`ok`**, elle est de type
// **`basic`**, et son corps est le bon octet pour octet. Rien d'autre ne la
// distingue d'une réponse saine. Un test sur le statut passe à côté ; un test
// sur `r.ok` passe à côté. Mesuré au chantier 19 :
//
//     /index.html → { status: 200, ok: true, type: 'basic', redirected: true }
//     /           → { status: 200, ok: true, type: 'basic', redirected: false }
//
// C'est un piège qui se réintroduit tout seul à la première relecture pressée.
function utilisable(r) {
  return !!r && r.ok && r.status === 200 &&
         !r.redirected && r.type !== 'error' && r.type !== 'opaqueredirect';
}

// ── LE DÉSEMPOISONNEMENT ────────────────────────────────────────────────────
//
// Cloudflare Pages CANONICALISE les URL : `GET /index.html` répond **308 vers
// `/`**. `fetch` suit la redirection et rend un 200 parfaitement valide — mais
// marqué `redirected: true`.
//
// Or une requête de NAVIGATION a `redirect: "manual"`, et la spec interdit d'y
// répondre par une réponse redirigée : le navigateur la convertit en erreur
// réseau. Résultat mesuré au chantier 19 : `ERR_FAILED` sur `/` ET sur
// `/semaine/…`, RÉSEAU PRÉSENT, sur un appareil où le service worker était
// installé. Seule sortie : effacer les données du site à la main.
//
// On reconstruit donc la réponse à partir de son corps. La copie est identique
// au même octet près (7 839 octets mesurés des deux côtés), sans la marque.
// C'est le correctif retenu partout où ce défaut est connu.
async function desempoisonner(reponse) {
  if (!reponse || !reponse.redirected) return reponse;
  const corps = await reponse.blob();
  return new Response(corps, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: reponse.headers
  });
}

// ── LA TRAPPE DE SORTIE ─────────────────────────────────────────────────────
//
// Câblée en TÊTE du gestionnaire `fetch`, avant tout le reste. Elle vide les
// caches, se désinscrit, et répond par une page construite EN MÉMOIRE — jamais
// fetchée, donc incapable d'échouer.
//
// Ses limites, qui sont réelles :
//   · elle demande de TAPER une URL. Personne ne la trouvera tout seul ;
//   · un service worker qui ne s'ANALYSE pas n'est jamais installé : il
//     n'intercepte rien, la trappe est inutile — mais le problème aussi, car
//     l'ancien service worker reste en place ;
//   · un service worker qui PEND est le seul cas irrécupérable. La trappe
//     pendrait avec lui. D'où la règle en tête de fichier.
//
// Elle est une SECONDE LIGNE, pas la première : mesuré au chantier 19, un
// commit de correction atteint bien un appareil cassé, au deuxième
// rechargement, même avec un cache HTTP d'un an sur le script.
//
// ⚠️ ELLE EFFACE TOUT, ET ELLE LE DIT (chantier 35, D4). Elle ne vidait que les
// caches : la base IndexedDB — séances, séries, brouillon de séance en cours et
// FILE D'ÉCRITURE — survivait intacte. Or c'est précisément là que se loge ce
// qui empêche l'app de s'ouvrir : un brouillon illisible, une file bloquée. Une
// trappe qui laisse en place la moitié qui casse n'est pas une sortie.
//
// Et parce qu'elle efface pour de bon, elle RÉPOND CE QU'ELLE A EFFACÉ : le
// nombre de caches, les bases, et l'avertissement qui compte — ce qui n'était
// pas encore monté est perdu.
const LIGNE = (t) => '<li>' + t + '</li>';
const PAGE_SORTIE = (items, avertir) =>
  '<!doctype html><html lang="fr"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>TrainHub — données effacées</title>' +
  '<style>body{background:#15171A;color:#E8EAED;font:16px/1.6 system-ui,sans-serif;' +
  'margin:0;padding:32px 20px}h1{font-size:19px;margin:0 0 12px}' +
  'p{color:#959BA5;margin:0 0 12px}code{color:#E8EAED}' +
  'ul{color:#E8EAED;margin:0 0 16px;padding-left:20px}li{margin:0 0 4px}' +
  '.avert{color:#F2B705}' +
  'a{display:inline-block;margin-top:8px;color:#F2B705;font-weight:600}</style>' +
  '<h1>Données effacées</h1>' +
  '<p>Ce qui a été retiré de cet appareil :</p>' +
  '<ul>' + items.map(LIGNE).join('') + '</ul>' +
  (avertir
    ? '<p class="avert">Ce qui n’était pas encore monté sur le serveur est perdu. ' +
      'Le reste redescendra à la prochaine connexion.</p>'
    : '') +
  '<p>Recharge l’application. Elle réinstallera une version propre.</p>' +
  '<a href="/">Ouvrir TrainHub</a></html>';

// Une fois la trappe tirée, ce service worker N'INTERCEPTE PLUS RIEN.
//
// Sans ce verrou, la trappe ne tient pas sa promesse : la désinscription
// n'écarte le service worker que lorsque toutes les pages qu'il contrôle sont
// fermées, et d'ici là il continue de répondre. Mesuré au banc — la requête de
// favicon que Chrome émet sur la page de sortie était interceptée, mise en
// cache, et RECRÉAIT le cache qu'on venait d'effacer.
let retire = false;

// Les bases connues, quand le navigateur refuse d'en donner la liste.
// `indexedDB.databases()` n'existe pas partout ; la trappe doit marcher quand
// même, et elle ne sert à rien si elle n'efface pas CELLE-CI.
const BASES_CONNUES = ['trainhub-v2'];

// ⚠️ `deleteDatabase` EST LE SEUL APPEL DE CE FICHIER QUI PEUT NE JAMAIS
// RENDRE LA MAIN, et c'est exactement ce que la règle en tête de fichier
// interdit. Une page de l'app encore ouverte tient une connexion : la demande
// part alors en `blocked` et RESTE EN ATTENTE, sans succès ni erreur, jusqu'à
// la fermeture de l'autre onglet. Un `await` dessus ferait pendre la trappe —
// c'est-à-dire la seule sortie qui reste à un appareil cassé.
//
// D'où les QUATRE issues, dont une qui ne dépend de personne : succès, erreur,
// `blocked`, et un délai. Elle rend donc toujours, et toujours sous DELAI_IDB.
const DELAI_IDB = 3000;

function supprimerBase(nom) {
  return new Promise((resoudre) => {
    let rendu = false;
    // Le minuteur s'ÉTEINT dès qu'une autre issue a rendu : un service worker
    // qu'on réveille pour une requête ne doit pas traîner un timer par base
    // effacée, et un test qui en laisserait un ouvert ne rendrait pas la main.
    let minuteur = null;
    const finir = (etat) => {
      if (rendu) return;
      rendu = true;
      if (minuteur !== null) clearTimeout(minuteur);
      resoudre({ nom, etat });
    };
    minuteur = setTimeout(() => finir('bloquee'), DELAI_IDB);
    let demande;
    try { demande = indexedDB.deleteDatabase(nom); }
    catch (e) { return finir('erreur'); }
    demande.onsuccess = () => finir('effacee');
    demande.onerror = () => finir('erreur');
    demande.onblocked = () => finir('bloquee');
  });
}

async function nomsDesBases() {
  if (typeof indexedDB === 'undefined' || !indexedDB) return [];
  // ⚠️ PAS DE GARDE SUR `typeof databases === 'function'` : le `catch` la
  // couvre déjà — appeler ce qui n'existe pas lève, et on retombe sur les bases
  // connues. La campagne de mutations a montré la garde INTUABLE, donc morte
  // (leçon de `palier.js`, chantier 17 : elle protégeait de rien et laissait
  // croire l'inverse).
  try {
    const liste = await indexedDB.databases();
    const noms = (liste || []).map((d) => d && d.name).filter(Boolean);
    // La liste peut être vide sans que ce soit vrai (navigation privée, sandbox) :
    // on retombe sur ce qu'on sait exister plutôt que de n'effacer rien.
    return noms.length ? noms : BASES_CONNUES.slice();
  } catch (e) {
    return BASES_CONNUES.slice();
  }
}

async function seDesinstaller() {
  const items = [];
  let avertir = false;
  retire = true;

  try {
    const noms = await caches.keys();
    await Promise.all(noms.map((nom) => caches.delete(nom)));
    items.push(noms.length + ' cache(s) de l’application');
  } catch (e) {
    items.push('caches : effacement partiel (' + ((e && e.message) || 'erreur inconnue') + ')');
  }

  try {
    const bases = await nomsDesBases();
    const etats = await Promise.all(bases.map(supprimerBase));
    const effacees = etats.filter((r) => r.etat === 'effacee').map((r) => r.nom);
    const restantes = etats.filter((r) => r.etat !== 'effacee').map((r) => r.nom);
    if (effacees.length) {
      items.push('données locales : ' + effacees.join(', ') +
        ' (séances, séries, séance en cours, file d’envoi)');
      avertir = true;
    }
    // ⚠️ ON LE DIT. Une base encore ouverte par un autre onglet n'est PAS
    // effacée, et laisser croire le contraire renverrait l'utilisateur sur le
    // même mur en pensant avoir tout nettoyé.
    if (restantes.length) {
      items.push('données locales NON effacées (' + restantes.join(', ') +
        ') : ferme les autres onglets de TrainHub et recharge cette page');
    }
  } catch (e) {
    items.push('données locales : effacement partiel (' +
      ((e && e.message) || 'erreur inconnue') + ')');
  }

  try {
    await self.registration.unregister();
    items.push('service worker désinscrit');
  } catch (e) {
    items.push('service worker : désinscription refusée (' +
      ((e && e.message) || 'erreur inconnue') + ')');
  }

  // Même en échec, on répond : une trappe qui lève laisserait l'utilisateur
  // devant la même erreur réseau que celle qu'il essaie de fuir.
  return new Response(PAGE_SORTIE(items, avertir), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

// ── Installation ────────────────────────────────────────────────────────────
//
// Entrée par entrée, pas `addAll` : celui-ci est tout ou rien, et un seul
// fichier manqué sur un réseau capricieux laissait l'app SANS AUCUN cache.
// Et chaque entrée passe par `desempoisonner` — c'est là que la marque est
// retirée, une fois, plutôt qu'à chaque service.
async function mettreEnCache(cache, url) {
  const reponse = await fetch(url, { cache: 'reload' });
  if (!reponse || !reponse.ok) throw new Error('réponse ' + (reponse && reponse.status));
  await cache.put(url, await desempoisonner(reponse));
}

async function installer() {
  const cache = await caches.open(CACHE_V2);
  await Promise.all(SHELL.map((url) => mettreEnCache(cache, url).catch(() => null)));
  const presents = await Promise.all(INDISPENSABLES.map((u) => cache.match(u)));
  // On vérifie que les indispensables sont là ET utilisables : un cache qui
  // contiendrait une coquille invalide vaut un cache vide, en pire — il se
  // croirait complet.
  if (presents.some((r) => !utilisable(r))) throw new Error('coquille incomplète ou invalide');
}

async function activer() {
  // Suppression des caches v2 périmés. Rien à purger côté v1 : il n'est plus
  // servi, donc son service worker ne peut plus rien intercepter.
  const noms = await caches.keys();
  await Promise.all(noms.map((nom) => (nom === CACHE_V2 ? null : caches.delete(nom))));
  await self.clients.claim();
}

// ── Le gestionnaire de requêtes ─────────────────────────────────────────────
function repondre(event) {
  const req = event.request;
  const url = new URL(req.url);

  // Trappe déjà tirée : on ne répond plus, tout va au réseau. Le service worker
  // est en sursis jusqu'à la fermeture des pages qu'il contrôle, et pendant ce
  // sursis il ne doit plus rien remettre en cache.
  if (retire) return;

  // LA TRAPPE, EN PREMIER. Avant le filtre de méthode, avant tout : c'est le
  // seul chemin qui doit fonctionner quand plus rien ne fonctionne.
  if (url.origin === self.location.origin && url.pathname === CHEMIN_SORTIE) {
    event.respondWith(seDesinstaller());
    return;
  }

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
  // y répond par la coquille. On sert donc la coquille en cache — et surtout on
  // ne la met PAS en cache sous l'URL demandée, sinon chaque semaine visitée
  // créerait une entrée et une coquille périmée survivrait à une mise à jour.
  if (req.mode === 'navigate') {
    event.respondWith(servirCoquille(req));
    return;
  }

  event.respondWith(servirRessource(req));
}

async function servirCoquille(req) {
  const cache = await caches.open(CACHE_V2);
  const coquille = await cache.match('./index.html');
  if (utilisable(coquille)) return coquille;

  // LE RÉSEAU EST LA PORTE DE SORTIE. Une entrée absente, vide ou invalide
  // n'enferme personne : le hors-ligne est un repli, jamais un mode par défaut.
  // C'est ce chemin qui manquait — le chantier 18 servait l'entrée sans la
  // regarder, et ne tentait le réseau que si elle était absente.
  try {
    const reponse = await fetch(req);
    if (reponse) return reponse;
  } catch (e) { /* réseau muet : on tombe sur l'erreur explicite ci-dessous */ }
  return Response.error();
}

async function servirRessource(req) {
  const cache = await caches.open(CACHE_V2);
  const enCache = await cache.match(req);
  if (utilisable(enCache)) {
    // Volontairement PAS attendu : une mise à jour en arrière-plan ne doit
    // jamais retarder une réponse qu'on a déjà. Et elle désempoisonne, pour que
    // le cache ne se repollue pas par la bande.
    fetch(req)
      .then((r) => (r && r.status === 200 ? desempoisonner(r).then((n) => cache.put(req, n)) : null))
      .catch(() => {});
    return enCache;
  }
  // Absent ou invalide : réseau. On garde une copie propre, on rend l'originale
  // — une réponse redirigée est parfaitement valide pour une sous-ressource,
  // dont le mode de redirection est `follow`.
  const reponse = await fetch(req);
  if (reponse && reponse.status === 200) {
    desempoisonner(reponse.clone()).then((n) => cache.put(req, n)).catch(() => {});
  }
  return reponse;
}

// Les écouteurs ne s'enregistrent que dans un vrai service worker. Ailleurs —
// banc de test sous Node ou jsdom — le fichier se charge pour exposer ses
// fonctions pures, sans rien intercepter. `caches` n'existe que dans un
// contexte de service worker ou de page.
if (typeof self !== 'undefined' && typeof caches !== 'undefined' &&
    typeof self.addEventListener === 'function') {
  self.addEventListener('install', (event) => {
    // Le socle est en cours d'amorçage : on veut toujours la version fraîche,
    // sans étape « mise à jour disponible ».
    self.skipWaiting();
    event.waitUntil(installer());
  });
  self.addEventListener('activate', (event) => { event.waitUntil(activer()); });
  self.addEventListener('fetch', repondre);
}

// Export pour le banc. `installer`, `servirCoquille` et `servirRessource` lisent
// `caches` et `fetch` dans la portée globale, au moment de l'appel : le banc leur
// donne un cache de PAPIER et un réseau de papier, et les fait jouer sans
// navigateur. Sans ça, la garde d'installation et « le réseau est la porte de
// sortie » ne seraient couverts qu'au banc navigateur, donc jamais en CI.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CACHE_V2: CACHE_V2, CHEMIN_SORTIE: CHEMIN_SORTIE, SHELL: SHELL,
    INDISPENSABLES: INDISPENSABLES,
    utilisable: utilisable, desempoisonner: desempoisonner, PAGE_SORTIE: PAGE_SORTIE,
    installer: installer, servirCoquille: servirCoquille, servirRessource: servirRessource,
    // La trappe est testable en CI : elle ne lit que `caches`, `indexedDB` et
    // `self.registration` dans la portée globale — tous trois remplaçables par
    // du papier. C'est la seule façon de PROUVER qu'elle rend toujours la main,
    // y compris quand `deleteDatabase` reste bloquée pour toujours.
    seDesinstaller: seDesinstaller, supprimerBase: supprimerBase,
    nomsDesBases: nomsDesBases, DELAI_IDB: DELAI_IDB, BASES_CONNUES: BASES_CONNUES
  };
}
