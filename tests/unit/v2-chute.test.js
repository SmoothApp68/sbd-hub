/** @jest-environment node */
//
// 49-U12 — la chute de fin de séance (MOTEUR §9.2 bis, delta 49-27 du
// 30/09/2026). La dernière série au palier qui s'effondre après des séries
// stables ne tire pas le niveau, et la séance suivante ne teste rien de plus
// lourd : un test proposé, un retest ou un retest d'un cran devient « tenir »
// (`tenue_apres_chute`, le nom du fichier de cas, gardé tel quel dans le code).
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u12-chute.json` (23 cas : 15 où la
// consigne change, 8 témoins) sort de `coach49.py` (Claude.ai, 30/09/2026),
// sur les vrais historiques. Un cas qui semble faux se rapporte ; il ne se
// corrige pas ici.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const FICHIER = require('./fixtures/cas-49u12-chute.json');
const NB = ' ';

const tableau = (o, avecK) => (o === null || o === undefined ? null
  : avecK ? [o.charge, o.vise, o.k] : [o.charge, o.vise]);
const forme = (k) => {
  const z = M.zoneParCle(k.zone);
  return { etat: k.etat, zone: z === null ? null : [z.cle, z.bas, z.haut], niveau: k.niveau,
           ligne: tableau(k.ligne, false), haut: tableau(k.haut, true) };
};
const consigne = (c) => M.consignePour(c.seances, c.avant,
  { reglage: c.reglage, equipement: c.equipement, correction: null });

describe('§9.2 bis — les 23 cas du simulateur', () => {
  test('le fichier a 23 cas : 15 changent, 8 témoins', () => {
    expect(FICHIER.cas).toHaveLength(23);
    expect(FICHIER.cas.filter((c) => c.attendu.chute_rang !== null)).toHaveLength(15);
  });

  FICHIER.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const k = consigne(c);
      // La consigne, champ par champ, à l'octet (JSON).
      expect(JSON.stringify(forme(k))).toBe(JSON.stringify(c.attendu.consigne));
      // La chute repérée, par son rang parmi les séries au palier.
      expect(k.fondement.chute ? k.fondement.chute.rang : null).toBe(c.attendu.chute_rang);
    });
  });

  test('les témoins ne changent rien : la consigne est celle d’avant la règle', () => {
    FICHIER.cas.filter((c) => c.attendu.chute_rang === null).forEach((c) => {
      expect(forme(consigne(c))).toEqual(c.sans_la_regle);
    });
  });
});

// Une série au palier, à 80 kg, et son RPE.
const s = (reps, rpe) => ({ charge_kg: 80, reps, rpe: rpe === undefined ? null : rpe, ressenti: null });
const suite = (...reps) => reps.map((r) => s(r));

describe('§9.2 bis — la définition, sur les exemples de la spec', () => {
  test.each([
    ['10-10-6', [10, 10, 6], 3],
    ['12-12-11-7', [12, 12, 11, 7], 4],
    ['8-7-4', [8, 7, 4], 3]
  ])('%s → chute', (nom, reps, rang) => {
    expect(M.chuteDe(suite(...reps))).toBe(rang);
  });

  test.each([
    ['10-4-4 (les séries d’avant ne sont pas stables)', [10, 4, 4]],
    ['15-15-11 (−27 %)', [15, 15, 11]],
    ['10-10-7 (−3 reps)', [10, 10, 7]],
    ['10-5 (une seule série avant)', [10, 5]]
  ])('%s → pas de chute', (nom, reps) => {
    expect(M.chuteDe(suite(...reps))).toBeNull();
  });

  test('toutes à la même charge : une charge différente, pas de chute', () => {
    const l = suite(10, 10, 6);
    l[2] = Object.assign({}, l[2], { charge_kg: 70 });
    expect(M.chuteDe(l)).toBeNull();
  });

  // INVERSÉ LE 11/10/2026 (74) : une série à RPE 10 compte ses reps faites.
  test('en reps COMPTÉES (74) : une série à RPE 10 compte ses reps faites', () => {
    // 10-10-7 : −3, pas de chute — à RPE 10 comme sans (68B comptait le 7 pour
    // 6 : −4, chute).
    expect(M.chuteDe([s(10), s(10), s(7)])).toBeNull();
    expect(M.chuteDe([s(10), s(10), s(7, 10)])).toBeNull();
    // Et la stabilité aussi : 10-9@RPE10-6 → le 9 compte 9, à 1 de la
    // première : la dernière perd 4 et 40 %, c'est une chute (68B : le 9
    // comptait 8, à 2, pas de chute).
    expect(M.chuteDe([s(10), s(9, 10), s(6)])).toBe(3);
    // Contre-épreuve : la chute à RPE 10 reste une chute.
    expect(M.chuteDe([s(10), s(10), s(6, 10)])).toBe(3);
  });

  test('le niveau validé se calcule sans la chute : 10-10-6 → 10 (et non 7)', () => {
    expect(M.niveauValide(suite(10, 10, 6))).toBe(10);
    expect(M.niveauValide(suite(10, 10, 7))).toBe(8);
    expect(M.niveauValide([s(10), s(10), s(6, 10)])).toBe(10);
  });
});

describe('§9.2 bis — la séance d’Aurélien du 29/09 : 80 × 10, 10, 6 à RPE 10', () => {
  const AVANT = '2026-10-01T17:00:00+02:00';
  const seance = (jour, reps, rpe3) => ({ debut: jour + 'T17:00:00+02:00', palier: 80,
    series: reps.map((r, i) => ({ charge_kg: 80, reps: r, rpe: i === 2 ? rpe3 : null, role: 'palier', origine: 'palier' })) });
  const H = [seance('2026-09-15', [10, 10, 10]), seance('2026-09-22', [10, 10, 10]), seance('2026-09-29', [10, 10, 6], 10)];
  const k = M.consignePour(H, AVANT, { reglage: 'normal', equipement: 'haltere', correction: 'hypertrophie' });

  test('tenir : la ligne à 80 kg × 10, sans ligne haute', () => {
    expect(k.etat).toBe('tenue_apres_chute');
    expect(k.ligne).toEqual({ charge: 80, vise: 10 });
    expect(k.haut).toBeNull();
    expect(k.niveau).toBe(10);
  });

  test('l’en-tête dit « 80 kg × 10 », et la phrase grise à l’octet', () => {
    const l = M.libellesConsigne(k, AVANT);
    expect(l.jaune).toEqual(['80' + NB + 'kg' + NB + '×' + NB + '10']);
    expect(l.gris).toBe('Mardi' + NB + ': 80' + NB + 'kg' + NB + '×' + NB + '10, 10, 6. ' +
      'Je ne compte pas la dernière série' + NB + ': on tient 80' + NB + 'kg' + NB + '×' + NB + '10.');
  });

  test('la feuille « Pourquoi » l’explique en une phrase', () => {
    const p = M.pourquoiConsigne(k, 'normal', AVANT);
    expect(p.etat).toBe('Ta dernière série a chuté après des séries stables' + NB + ': c\'est la fatigue, ' +
      'pas ton niveau. Je ne la compte pas, et on tient 80' + NB + 'kg' + NB + '×' + NB + '10 avant de tester plus lourd.');
  });

  test('sans la chute (10-10-10), le coach testait plus lourd : c’est bien la règle qui tient', () => {
    const H2 = [H[0], H[1], seance('2026-09-29', [10, 10, 10])];
    const k2 = M.consignePour(H2, AVANT, { reglage: 'normal', equipement: 'haltere', correction: 'hypertrophie' });
    expect(k2.etat).toBe('test_propose');
    expect(k2.haut).not.toBeNull();
  });

  test('une échelle en cours n’est pas touchée : après un test tenu, pas de « tenir »', () => {
    const avecTest = seance('2026-09-29', [10, 10, 6], 10);
    avecTest.series.push({ charge_kg: 85, reps: 9, rpe: null, role: 'exploration', origine: 'exploration' });
    const k3 = M.consignePour([H[0], H[1], avecTest], AVANT, { reglage: 'normal', equipement: 'haltere', correction: 'hypertrophie' });
    expect(k3.etat).not.toBe('tenue_apres_chute');
  });

  test('la note « série à fond » ne cite pas la chute (elle ne compte pas du tout)', () => {
    // Zone Volume : 10 < 12, progression ; la série à RPE 10 est la chute.
    const kv = M.consignePour(H, AVANT, { reglage: 'normal', equipement: 'haltere', correction: 'volume' });
    expect(kv.etat).toBe('progression');
    expect(kv.fondement.serieAFond).toBeUndefined();
  });
});
