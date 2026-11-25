/** @jest-environment node */
//
// YO-YO-ZERO (validé le 21/11/2026, MOTEUR §9.42 bis delta 25/11/2026) — le jeton du jour sans (UN seul par charge de travail) :
//   1. le retour imposé ne le relève jamais ;
//   2. une séance ORDINAIRE réussie le relève, quelle que soit sa charge ;
//   3. un zéro qui donne la règle B le consomme (aussi quand le zéro suivant est au-dessus de P : le palier change).
// Défaut d'avant : 140 × 4 → 0 → jour sans → légère → retour 140 × 3 (relevait le jeton) → 140 × 4 → 0 → jour sans… la vraie baisse (B) ne venait jamais.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const M = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/plan.js');
const sp = (t) => String(t == null ? '' : t).replace(/[  ]/g, ' ');

const g = (kg, reps, t, rpe) => ({ charge_kg: kg, reps, type_serie: t || 'travail', rpe: rpe === undefined ? null : rpe });
const JOUR0 = Date.UTC(2026, 5, 1, 18);
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
// `liste` : des séances (3 séries) ; `ecarts` : (facultatif) les jours d'écart AVANT chaque séance (4 par défaut).
const histoire = (liste, ecarts) => {
  let t = JOUR0;
  return liste.map((series, i) => {
    t += ((ecarts && ecarts[i] !== undefined ? ecarts[i] : 4)) * 864e5;
    return { seance: { id: 'Y' + i, debut: new Date(t).toISOString() }, series: series.map((s, j) => Object.assign({ id: 'y' + i + '_' + j, rang: j, ressenti: null, exercise_slug: 'squat' }, s)) };
  });
};
const K = (liste, ecarts, apres) => {
  const h = histoire(liste, ecarts);
  const avant = new Date(Date.parse(h[h.length - 1].seance.debut) + (apres || 4) * 864e5).toISOString();
  return M.consigneDExercice(h, undefined, avant, OPT).consigne;
};
const gris = (k) => sp(M.libellesConsigne(k).gris);
const jourSans = (k) => !!(k.fondement && k.fondement.zeroRep && k.fondement.zeroRep.jourSans);
const ligne = (k) => (k.ligne ? [k.ligne.charge, k.ligne.vise] : null);

const trois = (c, r, rpe) => [g(c, r, 'travail', rpe), g(c, r, 'travail', rpe), g(c, r, 'travail', rpe)];
const b3 = () => trois(140, 3);
const f4 = () => trois(140, 4);
const z = (c) => trois(c || 140, 0, undefined).map((s) => Object.assign(s, { type_serie: 'echec' }));
const l = () => trois(132.5, 4);
const retour = () => trois(140, 3);

describe('YO-YO-ZERO — le cycle 0 / légère / retour / 0 ne fige plus le squat', () => {
  test('le 1er zéro à 140 × 4 : un jour sans (inchangé)', () => {
    const k = K([b3(), b3(), z()]);
    expect(jourSans(k)).toBe(true);
    expect(gris(k)).toMatch(/pour cette séance\.$/);
  });
  test('le 2e zéro, après la légère et le retour imposé 140 × 3 réussi : la règle B (« Je baisse à 132,5 kg. »), plus un 2e jour sans', () => {
    const k = K([b3(), b3(), z(), l(), retour(), z()]);
    expect(k.etat).toBe('zero_rep');
    expect(jourSans(k)).toBe(false);
    expect(gris(k)).toBe('140 kg × 0 : pas encore. Je baisse à 132,5 kg.');
    expect(ligne(k)).toEqual([132.5, 4]);
  });
  test('après la règle B, 132,5 × 4 fait : la montée repart (132,5 × 5), plus de retour à 140', () => {
    const k = K([b3(), b3(), z(), l(), retour(), z(), trois(132.5, 4)]);
    expect(k.etat).not.toBe('retour_jour_sans');
    expect(ligne(k)).toEqual([132.5, 5]);
  });
  test('le yo-yo complet (8 zéros, 4 séances par tour) : jamais plus d\'un jour sans entre deux règles B', () => {
    let liste = [b3(), b3()];
    const etats = [];
    for (let tour = 0; tour < 4; tour++) {
      liste = liste.concat([z()]);
      etats.push(jourSans(K(liste)) ? 'S' : 'B');
      liste = liste.concat([l(), retour()]);
    }
    expect(etats.slice(0, 2)).toEqual(['S', 'B']);
    expect(etats).not.toContain('SS');
    expect(etats.join('')).not.toMatch(/SS/);
  });
});

describe('YO-YO-ZERO — ce qui ne change pas', () => {
  test('témoin à 4 séances : 0, légère, retour, 140 × 4 RÉUSSI, 0 → un jour sans à chaque fois (la séance ordinaire réussie relève le jeton)', () => {
    const un = [b3(), b3(), z(), l(), retour(), f4(), z()];
    expect(jourSans(K(un))).toBe(true);
    const deux = [...un, l(), retour(), f4(), z()];
    expect(jourSans(K(deux))).toBe(true);
  });
  test('S1 : des mois à 140 × 3 sans jamais × 4, puis 0 : un jour sans (jamais une baisse punitive)', () => {
    const k = K([b3(), b3(), b3(), b3(), b3(), b3(), b3(), b3(), z()]);
    expect(jourSans(k)).toBe(true);
  });
  test('zéro au retour (la légère puis 0 au lieu du retour) : la règle B', () => {
    expect(jourSans(K([b3(), b3(), z(), l(), z()]))).toBe(false);
  });
});

describe('YO-YO-ZERO règle 3 — la règle B consomme le jeton', () => {
  const base = () => [b3(), b3(), z(), l(), retour(), z()];   // 1er zéro : jour sans ; 2e zéro : règle B, 132,5 × 4
  test('S3 : après une B à 132,5, des séances réussies à 132,5, puis 0 à 132,5 : un jour sans à 132,5 (le jeton de 140 est périmé)', () => {
    const k = K([...base(), trois(132.5, 4), trois(132.5, 5), z(132.5)]);
    expect(k.etat).toBe('zero_rep');
    expect(jourSans(k)).toBe(true);
    expect(k.fondement.zeroRep.jourSans).toMatchObject({ tenue: { charge: 132.5 } });
  });
  test('la consommation vaut aussi quand le zéro suivant est AU-DESSUS de P (un essai raté, déjà en B) : le jeton est consommé, le palier change', () => {
    // 2e zéro (B), 132,5 × 4 et × 5 tenus, un essai à 137,5 raté (0), puis 132,5 × 5 tenu, puis 0 à 132,5 : un jour sans (jeton consommé)
    const k = K([...base(), trois(132.5, 4), trois(132.5, 5), z(137.5), trois(132.5, 5), trois(132.5, 5), z(132.5)]);
    expect(k.etat).toBe('zero_rep');
    expect(jourSans(k)).toBe(true);
  });
});

describe('YO-YO-ZERO règle 2 — une séance ordinaire réussie relève le jeton, quelle que soit sa charge (S12 contre S13)', () => {
  // S12 : un jour sans, 100 j de pause, la reprise, 3 séances à 137,5, puis 0 ; S13 : le même sans le zéro d'avant.
  const reprise = () => [trois(137.5, 3), trois(137.5, 3), trois(137.5, 3)];
  test('S12 = S13 : un jour sans (le jeton de 140 d\'avant la pause est relevé par une séance ordinaire réussie à 137,5)', () => {
    const s12 = [b3(), b3(), z(), l(), ...reprise(), z(137.5)];
    const s13 = [b3(), b3(), ...reprise(), z(137.5)];
    const e12 = [4, 4, 4, 4, 100, 4, 4, 4, 4];
    const e13 = [4, 4, 100, 4, 4, 4];
    const k12 = K(s12, e12), k13 = K(s13, e13);
    expect(k13.etat).toBe('zero_rep');
    expect(jourSans(k13)).toBe(true);
    expect(k12.etat).toBe(k13.etat);
    expect(jourSans(k12)).toBe(jourSans(k13));
  });
});
