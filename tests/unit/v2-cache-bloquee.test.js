/** @jest-environment node */
//
// 117 (audit du 16/10/2026, 06 #7) — UNE AUTRE PAGE QUI GARDE L'ANCIENNE VERSION NE FAIT PLUS ATTENDRE L'APP.
//
// LE CONSTAT (lecture de `cache.js` et de la spec IndexedDB) : `indexedDB.open` ne gérait ni `onblocked` ni
// `onversionchange`. Le jour où `VERSION` monte, une page restée ouverte avec l'ancienne garde sa connexion :
// l'ouverture de la nouvelle passe en `blocked` et attend sans fin — et `entrerVraiment` avec elle : aucun écran.
//
// Une base de papier : `open` rend une requête dont le banc décide le sort (bloquée, réussie, plus tard).

function papier() {
  const journal = { ouvertures: 0, fermetures: 0, requetes: [] };
  const db = () => ({
    objectStoreNames: { contains: () => true },
    close() { journal.fermetures++; },
    transaction() {
      const t = { objectStore: () => ({ count() { const r = {}; setTimeout(() => { r.result = 0; r.onsuccess(); }, 0); return r; } }) };
      return t;
    }
  });
  return {
    journal,
    indexedDB: {
      open() { journal.ouvertures++; const req = { reussir() { req.result = db(); req.onsuccess(); } }; journal.requetes.push(req); return req; }
    }
  };
}

describe('la base locale : ni attente sans fin, ni connexion qui bloque les autres', () => {
  let p;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    p = papier();
    global.indexedDB = p.indexedDB;
    require('../../v2/js/cache.js');
  });
  afterEach(() => { jest.useRealTimers(); delete global.indexedDB; delete global.THCache; });

  test('⚠️ DISCRIMINANT — bloquée par une autre page : l’ouverture est REJETÉE après le délai, l’app démarre et le sait', async () => {
    const C = global.THCache;
    const ouverture = C.ouvrir();
    let issue = null;
    ouverture.then(() => { issue = 'ouverte'; }, (e) => { issue = e.code; });
    p.journal.requetes[0].onblocked();
    jest.advanceTimersByTime(C.DELAI_BLOQUE_MS - 1);
    await Promise.resolve();
    expect(issue).toBeNull();
    jest.advanceTimersByTime(1);
    await Promise.resolve(); await Promise.resolve();
    expect(issue).toBe('IDB_BLOQUEE');
    expect(C.estBloquee()).toBe(true);
  });

  test('hors service pour cette page : les appels suivants échouent aussitôt, sans rouvrir ; une connexion tardive est refermée', async () => {
    const C = global.THCache;
    const o = C.ouvrir().catch((e) => e.code);
    p.journal.requetes[0].onblocked();
    jest.advanceTimersByTime(C.DELAI_BLOQUE_MS);
    expect(await o).toBe('IDB_BLOQUEE');
    await expect(C.ouvrir()).rejects.toMatchObject({ code: 'IDB_BLOQUEE' });
    expect(p.journal.ouvertures).toBe(1);
    // L'autre page se ferme enfin : la connexion arrive, mais cette page a démarré sans son cache.
    p.journal.requetes[0].reussir();
    expect(p.journal.fermetures).toBe(1);
    await expect(C.lireMeta('x')).rejects.toMatchObject({ code: 'IDB_BLOQUEE' });
  });

  test('⚠️ DISCRIMINANT — une autre page demande une version plus haute : la connexion d’ici se ferme, et se rouvrira au besoin', async () => {
    const C = global.THCache;
    const o = C.ouvrir();
    p.journal.requetes[0].reussir();
    const db = await o;
    expect(typeof db.onversionchange).toBe('function');
    db.onversionchange();
    expect(p.journal.fermetures).toBe(1);
    const o2 = C.ouvrir();
    expect(p.journal.ouvertures).toBe(2);
    p.journal.requetes[1].reussir();
    await o2;
    expect(C.estBloquee()).toBe(false);
  });

  test('deux appels pendant l’ouverture partagent la même requête', async () => {
    const C = global.THCache;
    const a = C.ouvrir(), b = C.ouvrir();
    expect(p.journal.ouvertures).toBe(1);
    p.journal.requetes[0].reussir();
    expect(await a).toBe(await b);
  });

  test('une ouverture débloquée À TEMPS réussit normalement', async () => {
    const C = global.THCache;
    const o = C.ouvrir();
    p.journal.requetes[0].onblocked();
    jest.advanceTimersByTime(C.DELAI_BLOQUE_MS - 10);
    p.journal.requetes[0].reussir();
    await expect(o).resolves.toBeTruthy();
    jest.advanceTimersByTime(100);
    expect(C.estBloquee()).toBe(false);
  });
});
