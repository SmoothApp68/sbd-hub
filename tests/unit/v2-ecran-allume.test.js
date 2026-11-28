/** @jest-environment node */
//
// 26/11/2026 — L'ÉCRAN RESTE ALLUMÉ EN SÉANCE (`ecran.js`) : un faux `navigator.wakeLock`, un faux document.
// Demande au démarrage, libération à la fin, reprise au retour de la page, réglage éteint = aucune demande, API absente = aucune erreur.

global.self = global;
const Ecran = require('../../v2/js/ecran.js');

const vider = () => new Promise((r) => setImmediate(r));

function monde(options) {
  options = options || {};
  const verrous = [];
  const ecouteurs = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener(nom, f) { (ecouteurs[nom] = ecouteurs[nom] || []).push(f); },
    emettre(nom) { (ecouteurs[nom] || []).forEach((f) => f()); }
  };
  const nav = options.sansApi ? {} : {
    wakeLock: {
      demandes: 0,
      request(type) {
        this.demandes++;
        if (options.refus) return Promise.reject(new Error('NotAllowedError'));
        const v = { type, released: false, rel: [],
          addEventListener(n, f) { this.rel.push(f); },
          release() { this.released = true; this.rel.forEach((f) => f()); return Promise.resolve(); } };
        verrous.push(v);
        return Promise.resolve(v);
      }
    }
  };
  let reglage = options.reglage !== false;
  const ecran = Ecran.creer({ navigateur: nav, document: doc, actif: () => reglage });
  return { nav, doc, verrous, ecran, regler(v) { reglage = v; } };
}

describe('L’écran reste allumé en séance', () => {
  test('la séance démarre : un verrou « screen » est demandé, une seule fois', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    m.ecran.synchroniser(true);
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(1);
    expect(m.verrous[0].type).toBe('screen');
    expect(m.ecran.tenu()).toBe(true);
  });

  test('hors séance : aucune demande', async () => {
    const m = monde();
    m.ecran.synchroniser(false);
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(0);
  });

  test('la séance finit : le verrou est relâché', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    await vider();
    m.ecran.synchroniser(false);
    expect(m.verrous[0].released).toBe(true);
    expect(m.ecran.tenu()).toBe(false);
  });

  test('la séance finit avant la réponse du navigateur : le verrou arrivé est aussitôt relâché', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    m.ecran.synchroniser(false);
    await vider();
    expect(m.verrous[0].released).toBe(true);
    expect(m.ecran.tenu()).toBe(false);
  });

  test('page cachée puis visible, séance en cours : le verrou est repris', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    await vider();
    m.doc.visibilityState = 'hidden';
    m.verrous[0].release();            // le navigateur le relâche tout seul
    m.doc.emettre('visibilitychange');
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(1);
    m.doc.visibilityState = 'visible';
    m.doc.emettre('visibilitychange');
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(2);
    expect(m.ecran.tenu()).toBe(true);
  });

  test('page visible de nouveau mais séance finie : rien n’est repris', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    await vider();
    m.ecran.synchroniser(false);
    m.doc.emettre('visibilitychange');
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(1);
  });

  test('réglage éteint : aucune demande, ni au départ ni au retour de la page', async () => {
    const m = monde({ reglage: false });
    m.ecran.synchroniser(true);
    m.doc.emettre('visibilitychange');
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(0);
  });

  test('réglage éteint en pleine séance : le verrou est relâché', async () => {
    const m = monde();
    m.ecran.synchroniser(true);
    await vider();
    m.regler(false);
    m.ecran.synchroniser(true);
    expect(m.verrous[0].released).toBe(true);
  });

  test('API absente : aucune erreur', async () => {
    const m = monde({ sansApi: true });
    expect(() => { m.ecran.synchroniser(true); m.doc.emettre('visibilitychange'); m.ecran.synchroniser(false); }).not.toThrow();
    await vider();
    expect(m.ecran.tenu()).toBe(false);
  });

  test('navigateur absent : aucune erreur', () => {
    const e = Ecran.creer({});
    expect(() => e.synchroniser(true)).not.toThrow();
  });

  test('demande refusée : silence, et une nouvelle tentative reste possible', async () => {
    const m = monde({ refus: true });
    m.ecran.synchroniser(true);
    await vider();
    expect(m.ecran.tenu()).toBe(false);
    m.doc.emettre('visibilitychange');
    await vider();
    expect(m.nav.wakeLock.demandes).toBe(2);
  });
});
