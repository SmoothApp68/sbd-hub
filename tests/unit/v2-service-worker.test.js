/** @jest-environment node */
//
// v2/service-worker.js — la garde et le désempoisonnement (chantier 20).
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : **la réponse redirigée**.
// Elle est un 200, elle est `ok`, son type est normal, son corps est le bon
// octet pour octet. `redirected` est la SEULE propriété qui la distingue d'une
// réponse saine — mesuré au chantier 19 :
//
//     /index.html → { status: 200, ok: true, type: 'basic', redirected: true }
//     /           → { status: 200, ok: true, type: 'basic', redirected: false }
//
// Sur une réponse NON redirigée — c'est-à-dire sur un serveur qui ne
// canonicalise pas, ou hors ligne — la garde et son absence sont
// INDISTINGUABLES. C'est exactement pourquoi le défaut a survécu au chantier 18,
// dont le banc coupait le serveur.

const SW = require('../../v2/service-worker.js');

// `redirected` est en lecture seule sur une Response construite : le seul moyen
// d'obtenir en Node l'objet que le navigateur produit derrière un 308 est de
// masquer l'accesseur. Tout le reste de la réponse est réel.
function marquer(r) {
  Object.defineProperty(r, 'redirected', { value: true, configurable: true });
  const cloner = r.clone.bind(r);
  // Dans un navigateur, le clone d'une réponse redirigée est redirigé lui aussi.
  // Sans ça, le double mentirait : une mise en cache de `reponse.clone()` sans
  // désempoisonnement passerait pour propre, et le banc validerait le défaut.
  Object.defineProperty(r, 'clone', { value: () => marquer(cloner()), configurable: true });
  return r;
}

function redirigee(corps, init) {
  return marquer(new Response(corps, init));
}

const COQUILLE = '<!doctype html><html lang="fr"><body><div id="vue"></div></body></html>';

describe('utilisable — la garde', () => {
  test('REJETTE la réponse redirigée, qui est par ailleurs parfaitement valide', () => {
    const r = redirigee(COQUILLE, { status: 200, statusText: 'OK' });

    // Tout ce qu'un test pressé regarderait dit « bonne réponse » :
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.type).not.toBe('error');

    // …et pourtant elle rend l'app inaccessible si on la sert à une navigation.
    expect(SW.utilisable(r)).toBe(false);
  });

  test('ACCEPTE la même réponse sans la marque — la garde ne rejette pas tout', () => {
    const r = new Response(COQUILLE, { status: 200, statusText: 'OK' });
    expect(r.redirected).toBe(false);
    expect(SW.utilisable(r)).toBe(true);
  });

  test('rejette l’absence : undefined, null, une entrée de cache manquante', () => {
    expect(SW.utilisable(undefined)).toBe(false);
    expect(SW.utilisable(null)).toBe(false);
  });

  test('rejette ce qui n’est pas un 200 plein : 206 partiel, 304, 404, 500', () => {
    for (const status of [206, 304, 404, 500]) {
      const r = new Response(status === 304 ? null : COQUILLE, { status });
      expect(SW.utilisable(r)).toBe(false);
    }
  });

  test('rejette les types opaques : `error` et `opaqueredirect`', () => {
    // Ces types ne se construisent pas en Node ; `utilisable` est un prédicat
    // pur, on lui donne la forme exacte que le navigateur produit.
    const erreur = { ok: false, status: 0, redirected: false, type: 'error' };
    const opaque = { ok: false, status: 0, redirected: false, type: 'opaqueredirect' };
    expect(SW.utilisable(erreur)).toBe(false);
    expect(SW.utilisable(opaque)).toBe(false);

    // Le piège : un `opaqueredirect` qu'on aurait cru bon parce qu'on ne
    // regarde que le type.
    const menteur = { ok: true, status: 200, redirected: false, type: 'opaqueredirect' };
    expect(SW.utilisable(menteur)).toBe(false);
  });
});

describe('desempoisonner — la reconstruction', () => {
  test('retire la marque et rend le corps IDENTIQUE, octet pour octet', async () => {
    const sale = redirigee(COQUILLE, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Repere': 'garde' }
    });

    const propre = await SW.desempoisonner(sale);

    expect(propre.redirected).toBe(false);
    expect(SW.utilisable(propre)).toBe(true);
    expect(propre.status).toBe(200);
    expect(propre.statusText).toBe('OK');
    expect(propre.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(propre.headers.get('X-Repere')).toBe('garde');

    // Le corps : comparé en octets, pas en texte — c'est la garantie qui compte.
    const attendus = new Uint8Array(await new Response(COQUILLE).arrayBuffer());
    const obtenus = new Uint8Array(await propre.arrayBuffer());
    expect(obtenus.length).toBe(attendus.length);
    expect(Array.from(obtenus)).toEqual(Array.from(attendus));
  });

  test('laisse passer TELLE QUELLE une réponse saine — pas de copie inutile', async () => {
    const saine = new Response(COQUILLE, { status: 200 });
    const rendue = await SW.desempoisonner(saine);
    expect(rendue).toBe(saine); // la même instance, corps non consommé
  });

  test('laisse passer l’absence sans lever — le gestionnaire doit rester sans piège', async () => {
    await expect(SW.desempoisonner(null)).resolves.toBeNull();
    await expect(SW.desempoisonner(undefined)).resolves.toBeUndefined();
  });
});

describe('la coquille mise en cache à l’installation', () => {
  test('les indispensables font partie du SHELL — sinon l’installation échouerait toujours', () => {
    for (const url of SW.INDISPENSABLES) expect(SW.SHELL).toContain(url);
  });

  // 56-1 (la forge) — hors ligne, l'app garde ses polices : chaque fichier de
  // `v2/fonts/` est dans la coquille, et chaque police que la feuille de style
  // appelle aussi. Une police oubliée ici retomberait sur la police système,
  // sans bruit, à la première séance sans réseau.
  test('les polices de la feuille de style sont toutes dans la coquille, servies par l’app', () => {
    const fs = require('fs');
    const path = require('path');
    const V2 = path.join(__dirname, '../../v2');
    const fichiers = fs.readdirSync(path.join(V2, 'fonts')).filter((f) => /\.woff2$/.test(f));
    const css = fs.readFileSync(path.join(V2, 'styles.css'), 'utf8');
    const appelees = Array.from(css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)).map((m) => m[1]);
    expect(fichiers.length).toBe(7);
    expect(appelees.slice().sort()).toEqual(fichiers.map((f) => '/fonts/' + f).sort());
    for (const f of fichiers) expect(SW.SHELL).toContain('./fonts/' + f);
    expect(fs.existsSync(path.join(V2, 'fonts/OFL.txt'))).toBe(true);
    // Aucune police en ligne : ni Google Fonts, ni autre origine.
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import/);
  });

  test('la trappe de sortie reste courte et tapable à la main', () => {
    expect(SW.CHEMIN_SORTIE).toBe('/__sw-off');
    expect(SW.CHEMIN_SORTIE.startsWith('/')).toBe(true);
  });

  test('la page de sortie est construite en mémoire, sans rien fetcher', () => {
    const page = SW.PAGE_SORTIE(['3 cache(s) de l’application', 'service worker désinscrit'], false);
    expect(page).toContain('Données effacées');
    expect(page).toContain('3 cache(s) de l’application');
    expect(page).toContain('service worker désinscrit');
    // Aucune ressource externe : la page doit s'afficher quand tout est cassé.
    expect(page).not.toMatch(/<script|<link[^>]+href|src=/i);
  });

  test('elle AVERTIT quand des données locales sont parties, et se tait sinon', () => {
    expect(SW.PAGE_SORTIE(['1 cache(s)'], true)).toContain('pas encore monté');
    expect(SW.PAGE_SORTIE(['1 cache(s)'], false)).not.toContain('pas encore monté');
  });
});

// ── LA TRAPPE EFFACE TOUT, ET ELLE REND TOUJOURS LA MAIN (chantier 35, D4) ──
//
// CONFIGURATION DISCRIMINANTE : **une base IndexedDB qui reste BLOQUÉE**. Une
// page de l'app encore ouverte tient une connexion ; `deleteDatabase` part alors
// en `blocked` et n'appelle NI `onsuccess` NI `onerror` — jamais. Un `await`
// dessus ferait pendre la trappe, c'est-à-dire la seule sortie d'un appareil
// cassé (règle en tête de `service-worker.js`).
//
// Avec une base qui répond, la version avec délai et la version sans sont
// INDISTINGUABLES. Le seul banc qui les sépare est celui-ci.
describe('la trappe /__sw-off', () => {
  const vraiCaches = global.caches;
  const vraiIDB = global.indexedDB;
  const vraiSelf = global.self;
  let efface;

  const papierCaches = (noms) => ({
    keys: async () => noms.slice(),
    delete: async (n) => { efface.caches.push(n); return true; }
  });
  // `mode` : 'ok' répond, 'bloquee' ne répond JAMAIS, 'erreur' échoue.
  const papierIDB = (bases, mode) => ({
    databases: bases === null ? undefined : async () => bases.map((n) => ({ name: n })),
    deleteDatabase: (nom) => {
      const d = {};
      // 'muette' : le navigateur ne rappelle JAMAIS — le pire cas, celui que
      // seul le délai peut dénouer. 'bloquee' : il appelle `onblocked`, et la
      // trappe doit rendre TOUT DE SUITE sans attendre le délai.
      if (mode !== 'muette') {
        setTimeout(() => {
          if (mode === 'bloquee') { if (d.onblocked) d.onblocked(); return; }
          efface.bases.push(nom);
          if (mode === 'erreur') { if (d.onerror) d.onerror(); }
          else if (d.onsuccess) d.onsuccess();
        }, 0);
      }
      return d;
    }
  });

  beforeEach(() => {
    efface = { caches: [], bases: [], desinscrit: 0 };
    global.self = { registration: { unregister: async () => { efface.desinscrit++; return true; } } };
  });
  afterEach(() => {
    global.caches = vraiCaches; global.indexedDB = vraiIDB; global.self = vraiSelf;
  });

  test('elle efface les caches ET les bases, se désinscrit, et le dit', async () => {
    global.caches = papierCaches(['trainhub-v2-030', 'trainhub-v2-032']);
    global.indexedDB = papierIDB(['trainhub-v2'], 'ok');
    const page = await (await SW.seDesinstaller()).text();
    expect(efface.caches).toEqual(['trainhub-v2-030', 'trainhub-v2-032']);
    expect(efface.bases).toEqual(['trainhub-v2']);
    expect(efface.desinscrit).toBe(1);
    expect(page).toContain('2 cache(s)');
    expect(page).toContain('trainhub-v2');
    expect(page).toContain('file d’envoi');
    expect(page).toContain('pas encore monté');
  });

  test('⚠️ UNE BASE MUETTE POUR TOUJOURS NE FAIT PAS PENDRE LA TRAPPE', async () => {
    global.caches = papierCaches(['trainhub-v2-032']);
    global.indexedDB = papierIDB(['trainhub-v2'], 'muette');
    const debut = Date.now();
    const page = await (await SW.seDesinstaller()).text();
    // Elle rend, et elle rend en QUELQUES SECONDES — pas « un jour ». Le
    // plafond est absolu : mesuré contre `DELAI_IDB`, il suivrait un délai
    // porté à une heure et ne prouverait plus rien.
    expect(Date.now() - debut).toBeLessThan(8000);
    expect(SW.DELAI_IDB).toBeLessThanOrEqual(5000);
    expect(efface.desinscrit).toBe(1);
    // Et elle ne ment pas : la base est nommée comme NON effacée.
    expect(page).toContain('NON effacées');
    expect(page).toContain('ferme les autres onglets');
    expect(page).not.toContain('pas encore monté');
  }, 15000);

  // ⚠️ `onblocked` EST LE CAS RÉEL — un autre onglet de TrainHub tient la base.
  // Le navigateur le SIGNALE : la trappe doit rendre tout de suite, sans faire
  // patienter l'utilisateur le temps du délai devant un écran vide.
  test('une base signalée `blocked` rend TOUT DE SUITE, sans attendre le délai', async () => {
    global.caches = papierCaches([]);
    global.indexedDB = papierIDB(['trainhub-v2'], 'bloquee');
    const debut = Date.now();
    const page = await (await SW.seDesinstaller()).text();
    expect(Date.now() - debut).toBeLessThan(SW.DELAI_IDB);
    expect(efface.bases).toEqual([]);
    expect(page).toContain('NON effacées');
  }, 15000);

  test('sans `indexedDB.databases()`, elle efface quand même la base connue', async () => {
    global.caches = papierCaches([]);
    global.indexedDB = papierIDB(null, 'ok');
    await SW.seDesinstaller();
    expect(efface.bases).toEqual(SW.BASES_CONNUES);
  });

  test('une liste de bases VIDE retombe sur la base connue, jamais sur rien', async () => {
    global.caches = papierCaches([]);
    global.indexedDB = papierIDB([], 'ok');
    await SW.seDesinstaller();
    expect(efface.bases).toEqual(SW.BASES_CONNUES);
  });

  test('caches en échec : elle répond quand même, et efface le reste', async () => {
    global.caches = { keys: async () => { throw new Error('quota'); }, delete: async () => true };
    global.indexedDB = papierIDB(['trainhub-v2'], 'ok');
    const page = await (await SW.seDesinstaller()).text();
    expect(page).toContain('effacement partiel');
    expect(efface.bases).toEqual(['trainhub-v2']);
    expect(efface.desinscrit).toBe(1);
  });
});

// ── LE BANC DE PAPIER ───────────────────────────────────────────────────────
//
// `installer`, `servirCoquille` et `servirRessource` lisent `caches` et `fetch`
// dans la portée globale. On leur donne donc un cache de papier et un réseau de
// papier — et on les fait jouer sans navigateur, en CI, à chaque `npm test`.
// Le banc navigateur (`tests/banc/sw-navigation.js`) reste la preuve ; celui-ci
// est le filet qui tourne tous les jours.

function clef(c) { return typeof c === 'string' ? c : c.url; }

function cacheDePapier(entrees) {
  const magasin = new Map(Object.entries(entrees || {}));
  return {
    magasin: magasin,
    match: async (c) => magasin.get(clef(c)),
    put: async (c, r) => { magasin.set(clef(c), r); }
  };
}

// Un réseau qui CANONICALISE, comme Cloudflare Pages : tout ce qu'il rend est
// marqué `redirected`. C'est la configuration discriminante, au banc de papier.
function reseauDePapier(options) {
  const o = options || {};
  const journal = [];
  const faux = async (cible) => {
    const url = clef(cible);
    journal.push(url);
    if (o.muet) throw new TypeError('Failed to fetch');
    if (o.manquants && o.manquants.indexOf(url) !== -1) return new Response('', { status: 404 });
    if (o.partiels && o.partiels.indexOf(url) !== -1) {
      // 200 ≠ ok : un 206 est `ok`, et pourtant ce n'est pas un fichier entier.
      return redirigee('morceau', { status: 206, statusText: 'Partial Content' });
    }
    return redirigee('contenu de ' + url, { status: 200, statusText: 'OK' });
  };
  faux.journal = journal;
  return faux;
}

function installerBanc(cache, reseau) {
  global.caches = { open: async () => cache };
  global.fetch = reseau;
}

describe('installer — ce qui entre dans le cache', () => {
  const vraiFetch = global.fetch;
  afterEach(() => { global.fetch = vraiFetch; delete global.caches; });

  test('DÉSEMPOISONNE à l’entrée : aucune entrée mise en cache n’est redirigée', async () => {
    const cache = cacheDePapier();
    installerBanc(cache, reseauDePapier());

    await SW.installer();

    expect(cache.magasin.size).toBe(SW.SHELL.length);
    for (const [url, r] of cache.magasin) {
      expect([url, r.redirected]).toEqual([url, false]);
      expect([url, SW.utilisable(r)]).toEqual([url, true]);
    }
  });

  test('un indispensable MANQUANT fait échouer l’installation — elle sera retentée', async () => {
    const cache = cacheDePapier();
    installerBanc(cache, reseauDePapier({ manquants: ['./js/app.js'] }));

    await expect(SW.installer()).rejects.toThrow(/coquille incomplète/);
  });

  test('un indispensable PRÉSENT mais INVALIDE fait échouer l’installation aussi', async () => {
    // L'état trouvé sur l'appareil au chantier 19 : le cache se croyait complet.
    // Une entrée présente ne suffit pas ; elle doit être servable.
    const cache = cacheDePapier();
    installerBanc(cache, reseauDePapier({ partiels: ['./index.html'] }));

    await expect(SW.installer()).rejects.toThrow(/coquille incomplète/);
    expect(cache.magasin.has('./index.html')).toBe(true); // présente, et pourtant refusée
  });

  test('un fichier ACCESSOIRE manquant n’empêche PAS l’installation', async () => {
    // Entrée par entrée, pas `addAll` : un seul fichier manqué sur un réseau
    // capricieux laissait l'app sans aucun cache.
    const cache = cacheDePapier();
    installerBanc(cache, reseauDePapier({ manquants: ['./icons/icon-512.png'] }));

    await expect(SW.installer()).resolves.toBeUndefined();
    expect(cache.magasin.has('./icons/icon-512.png')).toBe(false);
    expect(cache.magasin.has('./index.html')).toBe(true);
  });
});

describe('servirCoquille — le réseau est la porte de sortie', () => {
  const vraiFetch = global.fetch;
  afterEach(() => { global.fetch = vraiFetch; delete global.caches; });

  test('coquille SAINE en cache : servie telle quelle, sans toucher au réseau', async () => {
    const saine = new Response(COQUILLE, { status: 200 });
    const cache = cacheDePapier({ './index.html': saine });
    const reseau = reseauDePapier();
    installerBanc(cache, reseau);

    const rendue = await SW.servirCoquille({ url: 'https://t.test/semaine/2026-08-24' });

    expect(rendue).toBe(saine);
    expect(reseau.journal).toEqual([]); // le réseau qui PEND ne peut pas nous bloquer
  });

  test('coquille EMPOISONNÉE en cache : le réseau reprend la main', async () => {
    // Le défaut du chantier 19, en une assertion : l'entrée est là, elle est
    // 200, elle est `ok` — et la servir rendrait l'app inaccessible.
    const sale = redirigee(COQUILLE, { status: 200 });
    const cache = cacheDePapier({ './index.html': sale });
    const reseau = reseauDePapier();
    installerBanc(cache, reseau);

    const rendue = await SW.servirCoquille({ url: 'https://t.test/' });

    expect(rendue).not.toBe(sale);
    expect(reseau.journal.length).toBe(1);
  });

  test('coquille ABSENTE : le réseau est tenté', async () => {
    const cache = cacheDePapier();
    const reseau = reseauDePapier();
    installerBanc(cache, reseau);

    const rendue = await SW.servirCoquille({ url: 'https://t.test/' });

    expect(rendue.status).toBe(200);
    expect(reseau.journal.length).toBe(1);
  });

  test('rien en cache ET réseau muet : une ERREUR EXPLICITE, jamais une attente sans issue', async () => {
    const cache = cacheDePapier();
    installerBanc(cache, reseauDePapier({ muet: true }));

    const rendue = await SW.servirCoquille({ url: 'https://t.test/' });

    expect(rendue.type).toBe('error'); // Response.error(), pas une promesse pendante
  });
});

describe('servirRessource — servir vite, revalider derrière', () => {
  const vraiFetch = global.fetch;
  afterEach(() => { global.fetch = vraiFetch; delete global.caches; });

  const souffler = () => new Promise((r) => setTimeout(r, 0));

  test('entrée saine : rendue tout de suite, et la revalidation ne repollue pas le cache', async () => {
    const saine = new Response('ancien', { status: 200 });
    const cache = cacheDePapier({ 'https://t.test/js/app.js': saine });
    installerBanc(cache, reseauDePapier());

    const req = { url: 'https://t.test/js/app.js' };
    const rendue = await SW.servirRessource(req);
    expect(rendue).toBe(saine); // pas d'attente du réseau

    await souffler();
    const relue = cache.magasin.get('https://t.test/js/app.js');
    expect(relue).not.toBe(saine);           // remplacée par la version fraîche
    expect(relue.redirected).toBe(false);    // et désempoisonnée
  });

  test('entrée empoisonnée : le réseau est refait, et la copie gardée est propre', async () => {
    const sale = redirigee('vieux', { status: 200 });
    const cache = cacheDePapier({ 'https://t.test/styles.css': sale });
    installerBanc(cache, reseauDePapier());

    const rendue = await SW.servirRessource({ url: 'https://t.test/styles.css' });
    expect(rendue).not.toBe(sale);

    await souffler();
    expect(cache.magasin.get('https://t.test/styles.css').redirected).toBe(false);
  });
});
