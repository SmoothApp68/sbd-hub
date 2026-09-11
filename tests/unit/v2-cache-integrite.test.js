// L'intégrité du cache
// (environnement jsdom : `sync.js` garde le motif IIFE fragile signalé depuis
//  le chantier 8 — `self` absent en environnement node. Hors périmètre ici.)
// : le cliquet du chantier 14.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : **l'interruption en
// cours d'écriture**. Une synchronisation qui aboutit ne distingue rien — tout
// marchait déjà avant ce chantier quand rien ne coupait. C'est la coupure, et
// elle seule, qui sépare « le cache se répare » de « le cache se fige ».

const Sync = require('../../v2/js/sync.js');

const SERVEUR = 28103;

// Le parcours réel, en machine à états : on ne modélise que ce qui décide.
// `interrompreA` : nombre d'enregistrements réellement persistés avant la
// fermeture de l'app ; null = l'écriture va au bout.
function appareil(depart) {
  return Object.assign({ magasin: 0, curseur: null, marque: null, attendu: null }, depart || {});
}

function ouverture(etat, options) {
  const o = options || {};
  const serveur = o.serveur === undefined ? SERVEUR : o.serveur;

  // 1. Démarrage : faut-il reprendre une passe complète ?
  if (Sync.doitReprendre(etat.marque, etat.magasin, etat.attendu)) etat.curseur = null;

  // 2. Requête : sans curseur on ramène tout, avec curseur l'incrémental ne
  //    ramène rien de neuf (les 28 103 séries partagent 6 horodatages).
  const voulu = etat.curseur === null ? serveur : etat.magasin;

  // 3. Écriture : `put` est un upsert, le magasin ne recule pas — sauf coupure.
  etat.magasin = o.interrompreA !== undefined && o.interrompreA !== null
    ? Math.min(voulu, o.interrompreA)
    : voulu;

  // 4. Le compte AUTORISE : on relit le magasin, pas une variable.
  const commit = Sync.decisionDeCommit(etat.magasin, serveur);
  if (commit.autorise) {
    etat.curseur = 'pose';
    etat.marque = { version: Sync.VERSION_SYNC };
    if (commit.attendu !== null) etat.attendu = { series: commit.attendu };
  }
  return etat;
}

describe('le cliquet est cassé — écriture interrompue', () => {
  test('CENTRAL : interrompue à mi-parcours, l’ouverture suivante complète le cache', () => {
    const a = appareil();
    ouverture(a, { interrompreA: 8500 });
    expect(a.magasin).toBe(8500);
    expect(a.curseur).toBeNull();        // le commit a été REFUSÉ
    expect(a.marque).toBeNull();

    ouverture(a);
    expect(a.magasin).toBe(SERVEUR);     // le cache s'est complété tout seul
    expect(a.curseur).toBe('pose');
  });

  test('ASYMÉTRIE — sans interruption, la même séquence aboutit du premier coup', () => {
    const a = appareil();
    ouverture(a);
    expect(a.magasin).toBe(SERVEUR);
    expect(a.curseur).toBe('pose');
  });

  test('la pile de cinq ouvertures ne reste plus figée à 8 500', () => {
    // Le relevé du chantier 14 devenu test : trois ouvertures tranquilles
    // laissaient le cache à 8 500. Plus maintenant.
    const a = appareil();
    const releve = [];
    ouverture(a); releve.push(a.magasin);                       // 1 · complète
    ouverture(a, { interrompreA: 8500 }); releve.push(a.magasin); // 2 · interrompue
    ouverture(a); releve.push(a.magasin);                       // 3
    ouverture(a); releve.push(a.magasin);                       // 4
    ouverture(a); releve.push(a.magasin);                       // 5
    expect(releve).toEqual([SERVEUR, 8500, SERVEUR, SERVEUR, SERVEUR]);
  });

  test('deux interruptions de suite ne font pas descendre le cache', () => {
    const a = appareil();
    ouverture(a);
    ouverture(a, { interrompreA: 20000 });
    ouverture(a, { interrompreA: 12000 });
    expect(a.curseur).toBeNull();
    ouverture(a);
    expect(a.magasin).toBe(SERVEUR);
  });
});

describe('l’appareil existant se répare sans intervention', () => {
  test('cache amputé, curseur posé, marque de l’ANCIENNE version → repris', () => {
    // Exactement l'état sur device : 8 500 séries, curseur posé, formeSync v2,
    // et aucun attendu enregistré (il n'existait pas).
    const a = appareil({ magasin: 8500, curseur: 'pose', marque: { version: 2 }, attendu: null });
    expect(Sync.doitReprendre(a.marque, a.magasin, a.attendu)).toBe(true);
    ouverture(a);
    expect(a.magasin).toBe(SERVEUR);
    expect(a.marque.version).toBe(Sync.VERSION_SYNC);
    expect(a.attendu).toEqual({ series: SERVEUR });
  });

  test('sans incrément de version, un cache d’avant n’aurait AUCUNE raison de reprendre', () => {
    // C'est ce qui rend l'incrément indispensable : pas d'attendu enregistré,
    // donc le filet du §2.3 n'a rien à comparer.
    expect(Sync.cacheEstCourt(8500, null)).toBe(false);
    expect(Sync.VERSION_SYNC).toBeGreaterThan(2);
  });
});

describe('le filet — un magasin plus court que l’attendu reprend', () => {
  test('magasin < attendu → on reprend', () => {
    expect(Sync.doitReprendre({ version: Sync.VERSION_SYNC }, 20000, { series: 28103 })).toBe(true);
  });

  test('magasin = attendu, ou au-dessus → on ne reprend pas', () => {
    expect(Sync.doitReprendre({ version: Sync.VERSION_SYNC }, 28103, { series: 28103 })).toBe(false);
    expect(Sync.doitReprendre({ version: Sync.VERSION_SYNC }, 28200, { series: 28103 })).toBe(false);
  });

  test('un attendu absent ou aberrant ne déclenche rien', () => {
    [null, undefined, {}, { series: 'beaucoup' }, { series: NaN }, { series: -1 }].forEach((att) => {
      expect(Sync.cacheEstCourt(10, att)).toBe(false);
    });
  });
});

describe('le compte autorise, il ne constate plus', () => {
  test('magasin ≠ serveur → rien n’est écrit', () => {
    const d = Sync.decisionDeCommit(14319, 28103);
    expect(d.autorise).toBe(false);
    expect(d.attendu).toBeNull();
    expect(d.manquantes).toBe(13784);
  });

  test('magasin = serveur → curseur, marque et attendu', () => {
    const d = Sync.decisionDeCommit(28103, 28103);
    expect(d.autorise).toBe(true);
    expect(d.attendu).toBe(28103);
    expect(d.manquantes).toBe(0);
  });

  test('un compte serveur injoignable autorise, mais n’enregistre aucun attendu', () => {
    // On ne bloque pas un appareil sur 15 Mo à retélécharger à chaque
    // ouverture ; on n'inscrit pas non plus une preuve qu'on n'a pas.
    [null, undefined, NaN, 'beaucoup'].forEach((c) => {
      const d = Sync.decisionDeCommit(14319, c);
      expect(d.autorise).toBe(true);
      expect(d.verifiable).toBe(false);
      expect(d.attendu).toBeNull();
    });
  });
});

// ── Atomicité des écritures (§2.1) ─────────────────────────────────────────
//
// Une transaction IndexedDB est atomique : tout passe, ou rien ne passe. Le
// défaut du chantier 14 venait de ce que `clear()` et les 57 `put()` vivaient
// dans des transactions SÉPARÉES — la coupure laissait le magasin à moitié
// plein. Ce qu'on vérifie ici, c'est le NOMBRE de transactions, parce que
// c'est lui qui décide si une interruption peut laisser un état intermédiaire.
describe('remplacerTout — vider et écrire dans UNE transaction', () => {
  let journal;

  function fausseBase() {
    journal = [];
    const magasin = (nom, tx) => ({
      clear() { journal.push({ tx, op: 'clear', magasin: nom }); },
      put(e) { journal.push({ tx, op: 'put', magasin: nom, id: e.id }); },
      delete(k) { journal.push({ tx, op: 'delete', magasin: nom, id: k }); },
      count() { const r = {}; setTimeout(() => { r.result = 0; r.onsuccess && r.onsuccess(); }, 0); return r; },
      createIndex() { return {}; }
    });
    let n = 0;
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({ createIndex() {} }),
      transaction() {
        const tx = ++n;
        const t = { objectStore: (nom) => magasin(nom, tx) };
        setTimeout(() => { t.oncomplete && t.oncomplete(); }, 0);
        return t;
      }
    };
    return {
      open() {
        const req = {};
        setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess({ target: { result: db } }); }, 0);
        return req;
      }
    };
  }

  let Cache;
  beforeEach(() => {
    jest.resetModules();
    global.indexedDB = fausseBase();
    require('../../v2/js/cache.js');
    Cache = global.THCache;
  });

  test('clear et put partagent la MÊME transaction', async () => {
    await Cache.remplacerTout('seances', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const ops = journal.filter((j) => j.magasin === 'seances');
    expect(ops.map((o) => o.op)).toEqual(['clear', 'put', 'put', 'put']);
    expect(new Set(ops.map((o) => o.tx)).size).toBe(1);   // ← une seule transaction
  });

  test('un magasin vidé sans rien à écrire tient aussi en une transaction', async () => {
    await Cache.remplacerTout('exercices', []);
    expect(new Set(journal.map((o) => o.tx)).size).toBe(1);
  });

  test('les séries ne passent PAS par un clear — `put` est un upsert', async () => {
    await Cache.ecrireLot('series', [{ id: '1' }, { id: '2' }]);
    expect(journal.filter((j) => j.op === 'clear')).toHaveLength(0);
    expect(journal.filter((j) => j.op === 'put')).toHaveLength(2);
  });

  test('ce que la purge retire est supprimé explicitement du magasin', async () => {
    await Cache.supprimer('series', ['x', 'y']);
    expect(journal.filter((j) => j.op === 'delete').map((j) => j.id)).toEqual(['x', 'y']);
  });
});

// ── Le compte se lit dans le MAGASIN, pas en mémoire ───────────────────────
//
// C'est toute la différence entre constater et autoriser : une variable en
// mémoire ne prouve rien sur ce qui a atteint le disque.
describe('compterMagasin — la preuve vient du disque', () => {
  test('il interroge réellement le magasin', async () => {
    jest.resetModules();
    let interroge = null;
    global.indexedDB = {
      open() {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({ createIndex() {} }),
          transaction: () => ({
            objectStore: (nom) => ({
              count() {
                interroge = nom;
                const r = {};
                setTimeout(() => { r.result = 4242; r.onsuccess && r.onsuccess(); }, 0);
                return r;
              }
            })
          })
        };
        const req = {};
        setTimeout(() => { req.result = db; req.onsuccess && req.onsuccess({ target: { result: db } }); }, 0);
        return req;
      }
    };
    require('../../v2/js/cache.js');
    const n = await global.THCache.compterMagasin('series');
    expect(interroge).toBe('series');      // il a bien ouvert le magasin des séries
    expect(n).toBe(4242);                  // et il rend ce que le magasin répond
  });
});
