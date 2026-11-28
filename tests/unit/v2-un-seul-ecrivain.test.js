/** @jest-environment node */
//
// D1 (lot « aucune perte de séance ») — UN SEUL ONGLET ÉCRIT SUR L'APPAREIL.
//
// LE CONSTAT (scénario A) : la file d'envoi (`attente`), le brouillon de séance, le profil à envoyer, la file du groupe
// et la routine en cours d'édition sont chacun UN enregistrement réécrit en entier depuis la mémoire de la page.
// Deux onglets : le dernier qui écrit gagne, la séance de l'autre disparaît du disque (`remplacerTout` vide puis
// réécrit). Aucun `navigator.locks` ne les séparait.
//
// LE BANC : un faux IndexedDB à UN disque partagé par deux « onglets » (deux chargements de `cache.js`), et un faux
// gestionnaire de verrous Web Locks partagé (exclusif, `ifAvailable`, `signal`).

function fauxDisque() {
  const disque = {};
  const magasin = (nom) => (disque[nom] = disque[nom] || new Map());
  const cle = (e) => (e.cle !== undefined ? e.cle : e.id);
  const connexion = () => ({
    objectStoreNames: { contains: () => true },
    createObjectStore() { return { createIndex() {} }; },
    close() {},
    transaction(noms) {
      const ecritures = [];
      const tx = {
        error: null,
        objectStore(nom) {
          const m = magasin(nom);
          const req = (v) => { const r = {}; setTimeout(() => { r.result = v; if (r.onsuccess) r.onsuccess(); }, 0); return r; };
          return {
            put(e) { ecritures.push(() => m.set(cle(e), JSON.parse(JSON.stringify(e)))); },
            delete(c) { ecritures.push(() => m.delete(c)); },
            clear() { ecritures.push(() => m.clear()); },
            get(c) { return req(m.has(c) ? m.get(c) : undefined); },
            getAll() { return req(Array.from(m.values())); },
            count() { return req(m.size); }
          };
        }
      };
      setTimeout(() => { ecritures.forEach((f) => f()); if (tx.oncomplete) tx.oncomplete(); }, 1);
      return tx;
    }
  });
  let premiere = true;
  return {
    disque,
    indexedDB: {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = connexion();
          if (premiere && req.onupgradeneeded) { premiere = false; req.onupgradeneeded({ target: { result: req.result } }); }
          req.onsuccess();
        }, 0);
        return req;
      }
    }
  };
}

// Un gestionnaire de verrous partagé : un verrou exclusif par nom, tenu tant que le rappel n'a pas fini.
function fauxVerrous() {
  const tenus = new Set();
  return {
    tenus,
    request(nom, options, rappel) {
      if (typeof options === 'function') { rappel = options; options = {}; }
      return new Promise((resoudre, rejeter) => {
        const prendre = () => { tenus.add(nom); Promise.resolve(rappel({ name: nom })).then(resoudre, rejeter); };
        if (!tenus.has(nom)) return prendre();
        if (options.ifAvailable) return Promise.resolve(rappel(null)).then(resoudre, rejeter);
        if (options.signal) {
          options.signal.addEventListener('abort', () => { const e = new Error('abandonné'); e.name = 'AbortError'; rejeter(e); });
        }
      });
    }
  };
}

function onglet(f, verrous) {
  jest.resetModules();
  global.indexedDB = f.indexedDB;
  if (verrous) global.navigator = { locks: verrous }; else delete global.navigator;
  delete global.THCache;
  require('../../v2/js/cache.js');
  return global.THCache;
}

const surDisque = (f, m) => Array.from((f.disque[m] || new Map()).keys());

describe('D1 — un seul onglet écrit (Web Locks)', () => {
  afterEach(() => { delete global.indexedDB; delete global.THCache; delete global.navigator; });

  test('⚠️ DISCRIMINANT (scénario A) — le second onglet, à la mémoire périmée, n’efface pas la séance du premier', async () => {
    const f = fauxDisque(), v = fauxVerrous();
    const A = onglet(f, v);
    const aEcrit = A.devenirEcrivain ? await A.devenirEcrivain(20) : undefined;
    await A.ecrireAttente([{ cle: 'seances:S', table: 'seances', id: 'S' }]);
    const B = onglet(f, v);
    // L'onglet B a lu la file AVANT que A n'y pose S : il repart d'une file vide et pose une pesée.
    if (B.devenirEcrivain) await B.devenirEcrivain(20);
    await B.ecrireAttente([{ cle: 'pesees:P', table: 'pesees', id: 'P' }]).catch(() => {});
    expect(surDisque(f, 'attente')).toEqual(['seances:S']);
    expect(aEcrit).toBe(true);
  });

  test('le second onglet se dit lecteur, et SES écritures sont refusées (LECTEUR), brouillon et profil compris', async () => {
    const f = fauxDisque(), v = fauxVerrous();
    const A = onglet(f, v); await A.devenirEcrivain(20);
    await A.ecrireBrouillon('seance', { id: 'S' });
    await A.ecrireMeta('profil-a-envoyer', { x: 1 });
    const B = onglet(f, v);
    expect(await B.devenirEcrivain(20)).toBe(false);
    expect(B.estLecteur()).toBe(true);
    for (const ecrire of [
      () => B.ecrireAttente([]), () => B.ecrireBrouillon('seance', null), () => B.ecrireMeta('profil-a-envoyer', null),
      () => B.remplacerTout('seances', []), () => B.ecrireLot('seances', [{ id: 'x' }])
    ]) {
      await expect(ecrire()).rejects.toMatchObject({ code: 'LECTEUR' });
    }
    expect(surDisque(f, 'brouillon')).toEqual(['seance']);
    expect(surDisque(f, 'meta')).toEqual(['profil-a-envoyer']);
    expect(await B.lireBrouillon('seance')).toEqual({ id: 'S' });   // il lit toujours
  });

  test('un rechargement : le verrou de l’ancienne page tombe, la nouvelle devient écrivain', async () => {
    const f = fauxDisque(), v = fauxVerrous();
    const A = onglet(f, v); await A.devenirEcrivain(20);
    v.tenus.clear();                      // l'ancienne page est morte
    const B = onglet(f, v);
    expect(await B.devenirEcrivain(20)).toBe(true);
    await B.ecrireAttente([{ cle: 'a:1' }]);
    expect(surDisque(f, 'attente')).toEqual(['a:1']);
  });

  test('sans navigator.locks : la page n’écrit pas (pas de repli sans garantie), et le dit', async () => {
    const f = fauxDisque();
    const A = onglet(f, null);
    expect(await A.devenirEcrivain(20)).toBe(false);
    expect(A.estLecteur()).toBe(true);
    await expect(A.ecrireAttente([{ cle: 'a:1' }])).rejects.toMatchObject({ code: 'LECTEUR' });
  });

  test('« Quitter » (viderTout) reste possible depuis une page lecteur : c’est un geste explicite', async () => {
    const f = fauxDisque(), v = fauxVerrous();
    const A = onglet(f, v); await A.devenirEcrivain(20);
    await A.ecrireAttente([{ cle: 'a:1' }]);
    const B = onglet(f, v); await B.devenirEcrivain(20);
    await B.viderTout();
    expect(surDisque(f, 'attente')).toEqual([]);
  });

  test('avant toute décision, les écritures passent (tests et outils) ; la décision est prise par l’app à l’entrée', async () => {
    const f = fauxDisque();
    const A = onglet(f, null);
    await A.ecrireAttente([{ cle: 'a:1' }]);
    expect(surDisque(f, 'attente')).toEqual(['a:1']);
  });
});
