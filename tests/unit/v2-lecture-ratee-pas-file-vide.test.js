/** @jest-environment node */
//
// D1 (lot « aucune perte de séance ») — UNE LECTURE RATÉE N'EST JAMAIS UNE FILE VIDE.
//
// LE CONSTAT (scénario B) : `chargerSeanceLocale` lisait le brouillon, appelait la passerelle
// `Seance.marquerLeBrouillonDAvant` (du JS qui peut lever) puis lisait la file DANS UN SEUL `try`. Un échec de
// n'importe laquelle des trois posait `seance = null; attente = []` : le premier `poser` écrivait alors
// la file vide par-dessus celle du disque, et la synchronisation effaçait la séance du téléphone.

const fs = require('fs');
const path = require('path');

function fauxDisque({ echecAttente = false, echecBrouillon = false } = {}) {
  const disque = { attente: new Map(), brouillon: new Map() };
  const etat = { echecAttente, echecBrouillon };
  const cle = (e) => (e.cle !== undefined ? e.cle : e.id);
  return {
    disque, etat,
    indexedDB: {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = {
            objectStoreNames: { contains: () => true },
            createObjectStore() { return { createIndex() {} }; },
            close() {},
            transaction() {
              const ecritures = [];
              const tx = {
                objectStore(nom) {
                  const m = (disque[nom] = disque[nom] || new Map());
                  const lire = (v, casse) => {
                    const r = {};
                    setTimeout(() => {
                      if (casse) { r.error = new Error('lecture impossible'); if (r.onerror) r.onerror(); }
                      else { r.result = v; if (r.onsuccess) r.onsuccess(); }
                    }, 0);
                    return r;
                  };
                  return {
                    put(e) { ecritures.push(() => m.set(cle(e), JSON.parse(JSON.stringify(e)))); },
                    delete(c) { ecritures.push(() => m.delete(c)); },
                    clear() { ecritures.push(() => m.clear()); },
                    get(c) { return lire(m.get(c), nom === 'brouillon' && etat.echecBrouillon); },
                    getAll() { return lire(Array.from(m.values()), nom === 'attente' && etat.echecAttente); }
                  };
                }
              };
              setTimeout(() => { ecritures.forEach((f) => f()); if (tx.oncomplete) tx.oncomplete(); }, 1);
              return tx;
            }
          };
          if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: req.result } });
          req.onsuccess();
        }, 0);
        return req;
      }
    }
  };
}

function charger(f) {
  jest.resetModules();
  global.indexedDB = f.indexedDB;
  delete global.THCache; delete global.THAttente;
  require('../../v2/js/cache.js');
  require('../../v2/js/attente.js');
  return { C: global.THCache, A: global.THAttente };
}

const SEANCE = { id: 'S', series: [1, 2] };
const ENTREE = { cle: 'seances:S', table: 'seances', id: 'S', seq: 1 };

describe('D1 — une lecture ratée ne se prend jamais pour une file vide', () => {
  afterEach(() => { delete global.indexedDB; delete global.THCache; delete global.THAttente; });

  test('⚠️ DISCRIMINANT (source) — le `catch` de `chargerSeanceLocale` ne repart plus d’une file vide', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const debut = src.indexOf('async function chargerSeanceLocale()');
    const fin = src.indexOf('// §9.13 bis (49-U3)', debut);
    const corps = src.slice(debut, fin);
    expect(corps).not.toMatch(/attente\s*=\s*\[\]/);
    expect(corps).not.toMatch(/seance\s*=\s*null/);
  });

  test('⚠️ DISCRIMINANT — la file illisible : `fileLue` est faux, le brouillon lu reste lu', async () => {
    const f = fauxDisque({ echecAttente: true });
    const { C } = charger(f);
    await C.ecrireBrouillon('seance', SEANCE);
    expect(typeof C.lireLeLocal).toBe('function');
    const r = await C.lireLeLocal();
    expect(r.fileLue).toBe(false);
    expect(r.seanceLue).toBe(true);
    expect(r.seance).toEqual(SEANCE);
    expect(r.erreur).toBeTruthy();
  });

  test('⚠️ DISCRIMINANT — la passerelle qui lève ne vide NI la file NI le brouillon', async () => {
    const f = fauxDisque();
    const { C } = charger(f);
    await C.ecrireBrouillon('seance', SEANCE);
    await C.ecrireAttente([ENTREE]);
    const r = await C.lireLeLocal(() => { throw new Error('passerelle cassée'); });
    expect(r.fileLue).toBe(true);
    expect(r.attente).toEqual([ENTREE]);
    expect(r.seance).toEqual(SEANCE);               // le brouillon brut est gardé
    expect(r.passerelleEnEchec).toBeTruthy();
  });

  test('le brouillon illisible : la file reste lue ; rien n’est présumé vide', async () => {
    const f = fauxDisque({ echecBrouillon: true });
    const { C } = charger(f);
    await C.ecrireAttente([ENTREE]);
    const r = await C.lireLeLocal();
    expect(r.seanceLue).toBe(false);
    expect(r.fileLue).toBe(true);
    expect(r.attente).toEqual([ENTREE]);
  });

  test('lecture normale : la passerelle s’applique au brouillon seulement', async () => {
    const f = fauxDisque();
    const { C } = charger(f);
    await C.ecrireBrouillon('seance', SEANCE);
    const r = await C.lireLeLocal((s) => Object.assign({}, s, { marque: true }));
    expect(r.seance).toEqual({ id: 'S', series: [1, 2], marque: true });
    expect(r.seanceLue && r.fileLue).toBe(true);
  });

  test('`fusionnerLue` : la file relue garde tout le disque, la mémoire plus récente la remplace ou s’y ajoute', () => {
    const { A } = charger(fauxDisque());
    const disque = [ENTREE, { cle: 'pesees:P', table: 'pesees', id: 'P', seq: 2 }];
    const memoire = [{ cle: 'pesees:P', table: 'pesees', id: 'P', seq: 1, version: 2 }, { cle: 'profil:x', seq: 1 }];
    const m = A.fusionnerLue(disque, memoire);
    expect(m.map((e) => e.cle)).toEqual(['seances:S', 'pesees:P', 'profil:x']);
    expect(m[1].version).toBe(2);
    expect(m[2].seq).toBe(3);
    expect(A.fusionnerLue(disque, [])).toEqual(disque);
    expect(A.fusionnerLue([], [ENTREE])).toEqual([ENTREE]);
  });

  describe('le câblage de l’app (`ecrireLaFile`, `reprendreLaLectureLocale`)', () => {
    const vm = require('vm');
    const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const extraire = (nom) => {
      const m = APP.match(new RegExp('^  (?:async )?function ' + nom + '\\(', 'm'));
      if (!m) throw new Error('introuvable : ' + nom);
      const debut = m.index; const fin = APP.indexOf('\n  }\n', debut) + 5;
      return APP.slice(debut, fin);
    };
    function bac(lectures) {
      const ecrites = [];
      const { A } = charger(fauxDisque());
      const ctx = {
        Attente: A, attente: [], seance: null, fileLue: false, seanceLue: true,
        Seance: { marquerLeBrouillonDAvant: (x) => x },
        Cache: {
          lireLeLocal: () => { const r = lectures.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
          ecrireAttente: (f) => { ecrites.push(f.map((e) => e.cle)); return Promise.resolve(); }
        }
      };
      vm.createContext(ctx);
      vm.runInContext([extraire('reprendreLaLectureLocale'), extraire('ecrireLaFile')].join('\n') +
        '\nthis.ecrireLaFile = ecrireLaFile;', ctx);
      return { ctx, ecrites };
    }

    test('⚠️ file non lue et toujours illisible : RIEN n’est écrit (le disque garde sa file)', async () => {
      const { ctx, ecrites } = bac([{ fileLue: false, seanceLue: true, attente: [], seance: null }]);
      ctx.attente = [{ cle: 'pesees:P', seq: 1 }];
      await expect(ctx.ecrireLaFile()).rejects.toMatchObject({ code: 'FILE_NON_LUE' });
      expect(ecrites).toEqual([]);
      expect(ctx.fileLue).toBe(false);
    });

    test('file non lue puis relue : la file du disque et la mémoire s’écrivent ENSEMBLE, rien ne manque', async () => {
      const { ctx, ecrites } = bac([{ fileLue: true, seanceLue: true, attente: [ENTREE], seance: null }]);
      ctx.attente = [{ cle: 'pesees:P', seq: 1 }];
      await ctx.ecrireLaFile();
      expect(ecrites).toEqual([['seances:S', 'pesees:P']]);
      expect(ctx.fileLue).toBe(true);
    });

    test('la relecture qui lève n’écrit rien non plus', async () => {
      const { ctx, ecrites } = bac([new Error('disque')]);
      await expect(ctx.ecrireLaFile()).rejects.toMatchObject({ code: 'FILE_NON_LUE' });
      expect(ecrites).toEqual([]);
    });

    test('file lue : une écriture directe, sans relecture', async () => {
      const { ctx, ecrites } = bac([]);
      ctx.fileLue = true; ctx.attente = [ENTREE];
      await ctx.ecrireLaFile();
      expect(ecrites).toEqual([['seances:S']]);
    });
  });
});
