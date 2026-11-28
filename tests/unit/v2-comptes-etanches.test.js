/** @jest-environment node */
//
// P0 (28/11/2026, synthèse de la vague 3, §1.1) — CHANGER DE COMPTE SUR LE MÊME TÉLÉPHONE NE LAISSE RIEN DU PRÉCÉDENT.
//
// LE CONSTAT. La session du compte A se termine sans « Quitter » (mot de passe changé ailleurs, jeton révoqué), puis
// B se connecte sur le même téléphone :
//   · scénario 1, sans panne : les réglages d'appareil de A pilotaient le coach de B — ses « Non merci » des chauffes
//     (4 semaines sans chauffe), son « plus léger » du jour, le son, la bascule effort ;
//   · scénario 2, le stockage ne répond pas à ce moment-là : `entrerVraiment` avalait l'erreur
//     (`catch (e) { console.warn('Cache local indisponible') }`) et l'entrée continuait. B voyait l'historique, les
//     routines et la séance de A, restés en mémoire.
// L'état du compte se vidait à la main à quatre endroits (`garantirProprietaire`, `nouvelleGeneration`,
// `deconnecter`, la déconnexion du SDK), avec des listes différentes.
//
// Le bac exécute les VRAIES fonctions d'entrée et de remise à zéro d'`app.js`, extraites du source, avec un cache de
// papier et un stockage d'appareil de papier ; tout le reste est un bouchon (un nom inconnu du bac rend une promesse
// résolue). Les deux scénarios échouaient sur `main` (49650ad1) ; ils passent avec `viderEtatDuCompte`.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const Quitter = require('../../v2/js/quitter.js');

function extraire(nom) {
  const re = new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm');
  const m = APP.match(re);
  return m ? m[0] : null;
}

// Un stockage d'appareil (localStorage, sessionStorage) de papier.
function stockage(depart) {
  const m = new Map(Object.entries(depart || {}));
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] || null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    cles: () => Array.from(m.keys()).sort()
  };
}

// Ce que A a laissé sur le téléphone : ses réglages, et la session de B qui vient d'entrer.
const DE_A = {
  'th-v2-refus-chauffes': JSON.stringify({ squat: { n: 2, seance: 's-a' } }),
  'th-v2-veille-du-jour': JSON.stringify({ jour: '2026-11-28', choix: 'leger', heure: 7 }),
  'th-v2-sourdine': '1',
  'th-v2-effort': 'rpe',
  'th-v2-faits-seulement': '1',
  'th-v2-dossiers-replies': JSON.stringify({ 'Bas du corps': true }),
  'th-v2-avis-vus': JSON.stringify({ 'Squat 130 kg × 4': 1 }),
  'th-v2-pourquoi-ouvert': '1',
  'th-silhouette': 'femme',
  // propres à A (son identifiant dans le nom) : jamais lues pour B, elles restent pour son retour
  'th-v2-decalage-poids-A': '3',
  'th-v2-questionnaire-vu-A': '1',
  // de l'appareil : la session qui entre, l'installation repoussée
  'th-v2-auth': '{"access_token":"jeton-de-B"}',
  'th-v2-installer-plus-tard': '1700000000000',
  'th-mouvement-version-squat': 'v2'
};
const REGLAGES_DE_A = ['th-v2-refus-chauffes', 'th-v2-veille-du-jour', 'th-v2-sourdine', 'th-v2-effort',
  'th-v2-faits-seulement', 'th-v2-dossiers-replies', 'th-v2-avis-vus', 'th-v2-pourquoi-ouvert', 'th-silhouette'];

function bac(options) {
  const o = options || {};
  const journal = { syncs: 0, rendus: 0, entree: [], vidages: 0, changements: 0, warn: [] };
  const ls = stockage(DE_A), ss = stockage({ 'th-v2-maj-auto': '1' });
  const meta = { proprietaire: { userId: 'A' } };
  const echec = () => Promise.reject(Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }));
  const cache = {
    lireMeta: (c) => (o.stockageMuet ? echec() : Promise.resolve(meta[c] === undefined ? null : meta[c])),
    ecrireMeta: (c, v) => { meta[c] = v; return Promise.resolve(); },
    lireTout: () => (o.stockageMuet ? echec() : Promise.resolve([])),
    lireBrouillon: () => (o.stockageMuet ? echec() : Promise.resolve(null)),
    lireAttente: () => (o.stockageMuet ? echec() : Promise.resolve([])),
    changerDeCompte: () => { journal.changements++; return Promise.resolve({ rendue: [], gardees: {}, rendues: {} }); },
    viderTout: () => { journal.vidages++; return Promise.resolve(); },
    estBloquee: () => false
  };
  const element = () => ({ hidden: true, textContent: '', value: '', checked: false, disabled: false });
  const elements = {};
  const base = {
    console: { warn: (...a) => journal.warn.push(a.join(' ')), log: () => {} },
    JSON, Object, Array, Promise, Date, Math, String, Number, Error,
    racine: { localStorage: ls, sessionStorage: ss, location: { pathname: '/', search: '' },
              THFaits: { creer: () => ({ oublierDates: () => {} }) } },
    Cache: cache,
    Quitter,
    Sync: { cacheAppartientA: (m, id) => !!m && m.userId === id, deciderEtat: () => ({}), ranger: (x) => x },
    Attente: {},
    Auth: { deconnecter: () => Promise.resolve(), sessionPersistee: () => null },
    Plan: { veilleDuJour: (lu) => lu, refusChauffesDe: () => null },
    Routeur: { analyser: () => ({ vue: 'liste', params: {} }), interditAvecSession: () => false, estVueDuJeu: () => false,
               RACINE: 'liste', CONNEXION: 'connexion', PROFIL: 'profil' },
    Rendu: { message: () => {} },
    Seance: { verifierColonnes: () => {} },
    faits: { oublierDates: () => {} },
    sortie: { apresNavigation: () => {} },
    vues: { detail: element(), routine: element(), seance: element(), questionnaire: element(), recap: element(),
            groupe: element(), ami: element() },
    social: { ami: null, jeton: 0, horloge: 0, confirmes: [] },
    grp: { file: [] },
    $: (id) => (elements[id] = elements[id] || element()),
    texteErreur: (e) => String(e && e.message),
    ouvrirQuestionnaireSiDu: () => false,
    ecranTenu: () => true,
    jeuVisible: () => true,
    idDeSession: (s) => (s && s.user && s.user.id) || null,
    rendreEntree: (mode) => { journal.entree.push(mode); },
    rendreRoute: () => { journal.rendus++; },
    synchroniser: () => { journal.syncs++; return Promise.resolve(); },
    // la mémoire de A, au moment où B se présente
    local: { seances: [{ id: 's-a' }], series: [{ id: 'serie-a' }], exercices: [], alias: [], pesees: [{ id: 'p-a' }],
             zones: [], modes: [], predictions: [{ id: 'pari-a' }], sousConsigne: {}, parisLegers: [], escalier: [],
             parSeance: null, blocs: [], programme: [], records: [], connues: {}, objectifs: [], objectifsDispo: null,
             parisObjectif: [], semaineChoix: [] },
    routines: [{ id: 'routine-a', nom: 'Haut A' }],
    seance: { id: 'en-cours-a' },
    attente: [{ cle: 'sessions:s-a' }],
    notesEnCours: { squat: 'genou A' },
    sourdine: true, modeRPE: true, refusChauffes: { squat: { n: 2, seance: 's-a' } },
    dossiersReplies: { 'Bas du corps': true }, avisVus: { x: 1 },
    profil: { id: 'A' },
    generation: 0, generationRoutines: 0,
    sessionActive: { user: { id: 'A' } }, entreeFaitePour: null, compteEnMemoire: 'A', departs: 0,
    CLE_SOURDINE: 'th-v2-sourdine', CLE_REFUS_CHAUFFES: 'th-v2-refus-chauffes',
    CLE_DOSSIERS_REPLIES: 'th-v2-dossiers-replies', CLE_AVIS_VUS: 'th-v2-avis-vus'
  };
  // Tout nom que le bac ne connaît pas est un bouchon : une fonction qui rend une promesse résolue, et dont chaque
  // propriété est un bouchon (`Assistant.oublier()`) — sauf `then`, pour qu'attendre un bouchon ne pende jamais.
  const bouchon = () => new Proxy(function () { return Promise.resolve(); }, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : bouchon())
  });
  const ctx = vm.createContext(new Proxy(base, {
    has: () => true,
    get: (t, k) => {
      if (k in t) return t[k];
      if (typeof k === 'symbol' || k === 'undefined') return undefined;
      return bouchon();
    }
  }));
  ['entrerVraiment', 'garantirProprietaire', 'viderEtatDuCompte', 'oublierLaMemoireDuCompte', 'arreterLEntree',
   'sessionTerminee', 'localVide', 'nouvelleGeneration', 'stockageSur', 'lireSourdine', 'lireModeRPE',
   'lireRefusChauffes', 'lireAvisVus', 'lireDossiersReplies', 'gardesDuCompte', 'preparerGardesDuCompte']
    .forEach((n) => { const src = extraire(n); if (src) vm.runInContext(src, ctx); });
  const phrase = APP.match(/^  var PHRASE_STOCKAGE_MUET = .*;$/m);
  if (phrase) vm.runInContext(phrase[0], ctx);
  const entrer = (id) => { base.__s = { user: { id } }; return vm.runInContext('entrerVraiment(__s)', ctx); };
  return { base, ctx, ls, ss, journal, elements, entrer };
}

describe('P0 — scénario 1 : A part sans « Quitter », B entre sur le même téléphone (sans panne)', () => {
  test('⚠️ DISCRIMINANT — aucun réglage d’appareil de A ne pilote le coach de B', async () => {
    const b = bac();
    await b.entrer('B');
    expect(REGLAGES_DE_A.filter((k) => b.ls.getItem(k) !== null)).toEqual([]);
    // relus pour B après l'entrée : ceux d'un appareil neuf
    expect(b.base.sourdine).toBe(false);
    expect(b.base.modeRPE).toBe(false);
    expect(vm.runInContext('lireRefusChauffes()', b.ctx)).toEqual({});
  });

  test('ce qui est à l’appareil, ou nommé pour A, reste (la session de B, le retour de A)', async () => {
    const b = bac();
    await b.entrer('B');
    ['th-v2-auth', 'th-v2-installer-plus-tard', 'th-mouvement-version-squat', 'th-v2-decalage-poids-A',
     'th-v2-questionnaire-vu-A'].forEach((k) => expect([k, b.ls.getItem(k)]).toEqual([k, DE_A[k]]));
    expect(b.ss.getItem('th-v2-maj-auto')).toBe('1');
  });

  test('la mémoire de A est partie, et les magasins ont changé de compte', async () => {
    const b = bac();
    await b.entrer('B');
    expect(b.base.local.seances).toEqual([]);
    expect(b.base.local.predictions).toEqual([]);
    expect(b.base.routines).toEqual([]);
    expect(b.base.seance).toBe(null);
    expect(b.base.attente).toEqual([]);
    expect(b.base.notesEnCours).toEqual({});
    expect(b.journal.changements).toBe(1);
  });

  test('le même compte qui revient ne perd rien de ses réglages', async () => {
    const b = bac();
    b.base.compteEnMemoire = null;
    await b.entrer('A');
    expect(REGLAGES_DE_A.filter((k) => b.ls.getItem(k) === null)).toEqual([]);
    expect(b.journal.changements).toBe(0);
  });
});

describe('P0 — scénario 2 : B entre et le stockage du téléphone ne répond pas', () => {
  test('⚠️ DISCRIMINANT — B ne voit ni l’historique, ni les routines, ni la séance de A', async () => {
    const b = bac({ stockageMuet: true });
    await b.entrer('B');
    expect(b.base.local.seances).toEqual([]);
    expect(b.base.local.series).toEqual([]);
    expect(b.base.routines).toEqual([]);
    expect(b.base.seance).toBe(null);
    expect(b.base.attente).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — l’entrée est ARRÊTÉE, avec une phrase, jamais en silence', async () => {
    const b = bac({ stockageMuet: true });
    await b.entrer('B');
    expect(b.journal.syncs).toBe(0);
    expect(b.journal.rendus).toBe(0);
    expect(b.journal.entree).toEqual(['connexion']);
    expect(b.elements['erreur-connexion'].textContent).toMatch(/stockage du téléphone ne répond pas/);
    expect(b.base.sessionActive).toBe(null);
    expect(b.base.entreeFaitePour).toBe(null);
  });

  test('⚠️ la mémoire de A est vidée AVANT la moindre attente du disque', () => {
    const b = bac();
    b.base.Cache.lireMeta = () => new Promise(() => {});   // le disque ne répond jamais
    b.entrer('B');                                          // pas attendu : on regarde l'instant d'après
    expect(b.base.local.seances).toEqual([]);
    expect(b.base.routines).toEqual([]);
    expect(b.base.seance).toBe(null);
  });

  test('base tenue par un autre onglet (117) : l’app démarre sur le réseau, sans rien de A en mémoire', async () => {
    const b = bac({ stockageMuet: true });
    b.base.Cache.estBloquee = () => true;
    await b.entrer('B');
    expect(b.journal.syncs).toBe(1);
    expect(b.base.local.seances).toEqual([]);
    expect(b.base.routines).toEqual([]);
  });
});

describe('P0 — la session qui se termine seule (le SDK) : la mémoire part, le disque reste', () => {
  test('⚠️ DISCRIMINANT — plus rien de A en mémoire ; ni le cache ni les réglages ne sont touchés', () => {
    const b = bac();
    expect(extraire('sessionTerminee')).not.toBe(null);
    vm.runInContext('sessionTerminee()', b.ctx);
    expect(b.base.local.seances).toEqual([]);
    expect(b.base.routines).toEqual([]);
    expect(b.base.seance).toBe(null);
    expect(b.base.sessionActive).toBe(null);
    expect(b.journal.vidages + b.journal.changements).toBe(0);
    expect(REGLAGES_DE_A.filter((k) => b.ls.getItem(k) === null)).toEqual([]);
    expect(b.journal.entree).toEqual(['connexion']);
  });
});

describe('P0 — une seule fonction vide l’état du compte', () => {
  test('les quatre chemins passent par `viderEtatDuCompte`, et aucun ne vide à la main', () => {
    ['garantirProprietaire', 'deconnecter', 'sessionTerminee', 'arreterLEntree'].forEach((n) => {
      const src = extraire(n) || '';
      expect([n, /viderEtatDuCompte\(/.test(src)]).toEqual([n, true]);
      expect([n, /\b(?:routines|attente) = \[\]|\bseance = null|\blocal = \{/.test(src)]).toEqual([n, false]);
    });
    // le rappel du SDK délègue à `sessionTerminee`
    const rappel = APP.match(/Auth\.surChangement\(function \(session, evenement\) \{[\s\S]*?\n    \}\);/);
    expect(rappel && rappel[0]).toMatch(/sessionTerminee\(\)/);
    expect(rappel[0]).not.toMatch(/profil = null|sessionActive = null/);
    // et `Cache.viderTout` / `Cache.changerDeCompte` ne s'appellent que de là
    const appels = APP.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /Cache\.(?:viderTout|changerDeCompte)\(/.test(l));
    const corps = extraire('viderEtatDuCompte');
    expect(appels.every(([, l]) => corps.indexOf(l) >= 0)).toBe(true);
  });

  test('la mémoire d’un compte vide naît de la même fabrique que celle du démarrage', () => {
    expect(APP).toMatch(/\n  var local = localVide\(\);/);
    const f = extraire('localVide');
    ['seances', 'series', 'exercices', 'alias', 'pesees', 'zones', 'modes', 'predictions', 'sousConsigne', 'parisLegers',
     'escalier', 'parSeance', 'blocs', 'programme', 'records', 'connues', 'objectifs', 'objectifsDispo', 'parisObjectif',
     'semaineChoix'].forEach((k) => expect([k, new RegExp('\\b' + k + ':').test(f)]).toEqual([k, true]));
  });
});

describe('P0 — les clés de l’appareil : ce qui est au compte part, par défaut', () => {
  test('une clé `th-v2…` inconnue (ajoutée demain) est au compte : effacée au changement', () => {
    expect(Quitter.cleDuCompte('th-v2-reglage-de-demain')).toBe(true);
    expect(Quitter.cleDuCompte('th-v2-auth')).toBe(false);
    expect(Quitter.cleDuCompte('th-v2-auth-code-verifier')).toBe(false);
    expect(Quitter.cleDuCompte('th-v2-annonce-bilan:A:mois:2026-10')).toBe(false);
    expect(Quitter.cleDuCompte('th-silhouette')).toBe(true);
    expect(Quitter.cleDuCompte('th-mouvement-version-squat')).toBe(false);
    expect(Quitter.cleDuCompte('autre-site')).toBe(false);
  });

  test('chaque clé de l’appareil et chaque préfixe par compte existent bien dans le code servi', () => {
    const v2 = path.join(__dirname, '../../v2/js');
    const src = fs.readdirSync(v2).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n');
    Quitter.CLES_DE_L_APPAREIL.concat(Quitter.PREFIXES_PAR_COMPTE.map((p) => p.replace(/:$/, '')))
      .forEach((k) => expect([k, src.split("'" + k).length - 1 > 0]).toEqual([k, true]));
  });

  test('« Quitter » efface aussi le sexe du dessin des muscles', () => {
    const ls = stockage({ 'th-silhouette': 'femme', 'th-v2-auth': 'x', 'th-mouvement-version-squat': 'v2' });
    Quitter.effacerStockages([ls]);
    expect(ls.cles()).toEqual(['th-mouvement-version-squat']);
  });
});

// Une base locale de papier dont la liste des magasins est RÉELLE (`objectStoreNames`) : elle contient un magasin que
// `MAGASINS` ignore (`routines`, que prépare une PR parallèle), pour prouver que les magasins sont parcourus.
function basePapier(noms) {
  const magasins = {};
  const cles = { brouillon: 'cle', attente: 'cle', meta: 'cle' };
  const tx = (portee) => {
    let enVol = 0, fini = false;
    const t = {};
    const terminer = () => { if (!enVol && !fini) { fini = true; setTimeout(() => t.oncomplete && t.oncomplete(), 0); } };
    const requete = (valeur) => {
      enVol++;
      const req = {};
      setTimeout(() => { req.result = valeur(); if (req.onsuccess) req.onsuccess(); enVol--; terminer(); }, 0);
      return req;
    };
    t.objectStore = (nom) => {
      if ([].concat(portee).indexOf(nom) < 0) throw new Error('NotFoundError : ' + nom + ' hors de la transaction');
      const m = magasins[nom] = magasins[nom] || new Map();
      const cle = (v) => v[cles[nom] || 'id'];
      return {
        get: (k) => requete(() => m.get(k)),
        getAll: () => requete(() => Array.from(m.values())),
        put: (v) => { m.set(cle(v), v); },
        clear: () => { m.clear(); },
        delete: (k) => { m.delete(k); }
      };
    };
    setTimeout(terminer, 0);
    return t;
  };
  const liste = Object.assign(noms.slice(), { item: (i) => noms[i], contains: (n) => noms.indexOf(n) >= 0 });
  const db = { objectStoreNames: liste, transaction: tx };
  return { magasins, indexedDB: { open() { const req = {}; setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess(); }, 0); return req; } } };
}

describe('P0 — le cache : les magasins de la base sont PARCOURUS, pas listés à la main', () => {
  const NOMS = ['seances', 'series', 'exercices', 'pesees', 'meta', 'zones', 'modes', 'brouillon', 'attente', 'records',
                'predictions', 'alias', 'routines'];
  let papier;
  beforeEach(() => {
    jest.resetModules();
    papier = basePapier(NOMS);
    global.indexedDB = papier.indexedDB;
    global.THAttente = require('../../v2/js/attente.js');
    require('../../v2/js/cache.js');
  });
  afterEach(() => { delete global.indexedDB; delete global.THAttente; delete global.THCache; });

  test('⚠️ DISCRIMINANT — un magasin absent de la liste (`routines`) est vidé quand un autre compte entre', async () => {
    const C = global.THCache;
    await C.ecrireLot('routines', [{ id: 'routine-de-A' }]);
    await C.changerDeCompte('A', 'B');
    expect(await C.lireTout('routines')).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — et par « Quitter » (`viderTout`)', async () => {
    const C = global.THCache;
    await C.ecrireLot('routines', [{ id: 'routine-de-A' }]);
    await C.viderTout();
    expect(await C.lireTout('routines')).toEqual([]);
  });

  test('`nomsDesMagasins` : les connus d’abord, puis ceux que la liste ignore', async () => {
    const C = global.THCache;
    const db = await C.ouvrir();
    expect(C.nomsDesMagasins(db)).toEqual(NOMS);
  });
});
