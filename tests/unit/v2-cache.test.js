/** @jest-environment node */
//
// 134 (I-02, audit iPhone du 21/10/2026) — LA BASE LOCALE SE ROUVRE APRÈS UNE COUPURE.
//
// LE CONSTAT : `cache.js` ne remettait `_db` à `null` que sur `versionchange`. Quand WebKit tue le processus
// d'IndexedDB (l'app en arrière-plan), la connexion se ferme anormalement : `close`, puis chaque transaction échoue
// (`InvalidStateError` à l'ouverture, ou « Connection to Indexed Database server lost » en cours). `ouvrir()`
// rendait la connexion morte pour toujours : la file et le brouillon ne s'écrivaient plus jusqu'au prochain
// lancement, et la séance affichait « Sauvegarde impossible sur cet appareil ».
//
// LE BANC : un faux IndexedDB en mémoire, avec un « disque » (`disque[magasin]`) qui survit aux connexions. Le banc
// décide comment la connexion meurt : un `close` délivré, ou une connexion morte sans `close` (la transaction
// échoue). Une réouverture est acceptée. Ce sont les premiers tests propres de `cache.js`.

function fauxIndexedDB() {
  const disque = {};
  const journal = { ouvertures: 0, fermetures: 0, refus: 0 };
  let refusRestants = 0;          // les prochaines ouvertures de transaction qui échouent (connexion morte)
  let perteEnCours = 0;           // les prochaines transactions qui s'interrompent en cours
  const connexions = [];

  function magasin(nom) {
    disque[nom] = disque[nom] || new Map();
    const m = disque[nom];
    const req = (valeur) => { const r = {}; setTimeout(() => { r.result = valeur; if (r.onsuccess) r.onsuccess(); }, 0); return r; };
    return { m, req };
  }

  function connexion() {
    const db = {
      morte: false,
      objectStoreNames: { contains: () => true },
      createObjectStore() { return { createIndex() {} }; },
      close() { journal.fermetures++; db.morte = true; },
      transaction(noms) {
        if (noms.indexOf('inconnu') >= 0) { const e = new Error('No objectStore named inconnu'); e.name = 'NotFoundError'; throw e; }
        if (db.morte || refusRestants > 0) {
          if (refusRestants > 0) refusRestants--;
          journal.refus++;
          const e = new Error('The database connection is closing.');
          e.name = 'InvalidStateError';
          throw e;
        }
        const ecritures = [];
        const perdre = perteEnCours > 0 ? (perteEnCours--, true) : false;
        const tx = {
          error: null,
          objectStore(nom) {
            if (noms.indexOf(nom) < 0) throw new Error('magasin hors transaction : ' + nom);
            const { m, req } = magasin(nom);
            const cle = (e) => e.cle !== undefined ? e.cle : e.id;
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
        setTimeout(() => {
          if (perdre) {
            // Atomique : rien de ce qui était posé n'atteint le disque.
            const e = new Error('Connection to Indexed Database server lost. Refresh the page to try again');
            e.name = 'UnknownError';
            tx.error = e;
            if (tx.onabort) tx.onabort();
            return;
          }
          ecritures.forEach((f) => f());
          if (tx.oncomplete) tx.oncomplete();
        }, 5);
        return tx;
      }
    };
    connexions.push(db);
    return db;
  }

  return {
    disque, journal, connexions,
    refuser(n) { refusRestants = n; },
    perdreEnCours(n) { perteEnCours = n; },
    // WebKit tue le processus : la connexion meurt, et `close` est délivré.
    couperAvecClose() { const db = connexions[connexions.length - 1]; db.morte = true; if (db.onclose) db.onclose(); },
    // … ou meurt sans que `close` soit encore arrivé.
    couperSansClose() { connexions[connexions.length - 1].morte = true; },
    indexedDB: {
      open() {
        journal.ouvertures++;
        const req = {};
        setTimeout(() => {
          req.result = connexion();
          if (journal.ouvertures === 1 && req.onupgradeneeded) req.onupgradeneeded({ target: { result: req.result } });
          req.onsuccess();
        }, 0);
        return req;
      }
    }
  };
}

const surDisque = (f, magasin, cle) => {
  const m = f.disque[magasin];
  return m && m.has(cle) ? m.get(cle).valeur : undefined;
};

describe('cache.js — la base locale se rouvre après une coupure (I-02)', () => {
  let f, C;
  beforeEach(() => {
    jest.resetModules();
    f = fauxIndexedDB();
    global.indexedDB = f.indexedDB;
    require('../../v2/js/cache.js');
    C = global.THCache;
  });
  afterEach(() => { delete global.indexedDB; delete global.THCache; });

  test('le chemin normal : la file et le brouillon atteignent le disque, une seule ouverture', async () => {
    await C.ecrireAttente([{ cle: 'a1', op: 'seance' }]);
    await C.ecrireBrouillon('seance', { id: 's1', series: 2 });
    expect(Array.from(f.disque.attente.keys())).toEqual(['a1']);
    expect(surDisque(f, 'brouillon', 'seance')).toEqual({ id: 's1', series: 2 });
    expect(f.journal.ouvertures).toBe(1);
  });

  test('⚠️ DISCRIMINANT — `close` délivré : la connexion est oubliée, l’écriture suivante rouvre et atteint le disque', async () => {
    await C.ecrireBrouillon('seance', { id: 's1', series: 1 });
    f.couperAvecClose();
    await C.ecrireAttente([{ cle: 'a1', op: 'seance' }, { cle: 'a2', op: 'series' }]);
    await C.ecrireBrouillon('seance', { id: 's1', series: 2 });
    expect(f.journal.ouvertures).toBe(2);
    // `close` a suffi : aucune transaction n'a été tentée sur la connexion morte (sans `onclose`, le nouvel essai
    // rattraperait l'écriture, mais après un refus).
    expect(f.journal.refus).toBe(0);
    expect(Array.from(f.disque.attente.keys())).toEqual(['a1', 'a2']);
    expect(surDisque(f, 'brouillon', 'seance')).toEqual({ id: 's1', series: 2 });
    expect(await C.lireBrouillon('seance')).toEqual({ id: 's1', series: 2 });
  });

  test('⚠️ DISCRIMINANT — connexion morte sans `close` (`InvalidStateError`) : un nouvel essai, sur une connexion neuve', async () => {
    await C.ecrireBrouillon('seance', { id: 's1', series: 1 });
    f.couperSansClose();
    await C.ecrireBrouillon('seance', { id: 's1', series: 3 });
    expect(f.journal.ouvertures).toBe(2);
    expect(surDisque(f, 'brouillon', 'seance')).toEqual({ id: 's1', series: 3 });
    // Et la suivante reste sur la connexion neuve.
    await C.ecrireAttente([{ cle: 'a1' }]);
    expect(f.journal.ouvertures).toBe(2);
    expect(Array.from(f.disque.attente.keys())).toEqual(['a1']);
  });

  test('⚠️ DISCRIMINANT — « Connection to Indexed Database server lost » en cours : rien d’écrit, puis rejoué une fois', async () => {
    await C.ecrireAttente([{ cle: 'a0' }]);
    f.perdreEnCours(1);
    await C.ecrireAttente([{ cle: 'a1' }, { cle: 'a2' }]);
    expect(f.journal.ouvertures).toBe(2);
    expect(Array.from(f.disque.attente.keys())).toEqual(['a1', 'a2']);
  });

  test('UN seul nouvel essai : s’il échoue aussi, l’erreur remonte (c’est elle qui fait dire « Sauvegarde impossible »)', async () => {
    await C.ecrireBrouillon('seance', { id: 's1', series: 1 });
    f.couperSansClose();
    f.refuser(5);   // la connexion neuve échoue aussi
    await expect(C.ecrireBrouillon('seance', { id: 's1', series: 2 })).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(f.journal.ouvertures).toBe(2);
    expect(surDisque(f, 'brouillon', 'seance')).toEqual({ id: 's1', series: 1 });
  });

  test('une autre erreur ne se rejoue pas', async () => {
    await expect(C.ecrireBrouillon('seance', { id: 's1' }).then(() => C.lireTout('inconnu'))).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(f.journal.ouvertures).toBe(1);
  });
});
