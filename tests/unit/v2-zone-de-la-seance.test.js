/** @jest-environment node */
//
// 54-1 — LA ZONE D'UNE SÉANCE, UNE SEULE LECTURE (MOTEUR §12.2 bis, delta F1).
// « La zone d'une séance se lit à sa fin — une seule fonction pour le report
// (§9.10), le compteur et le repli de l'escalier : une zone changée pendant la
// séance est celle de cette séance. »
//
// Le décor : la personne est en Lourd ; pendant la séance C (10 h – 11 h), elle
// passe en Mix à 10 h 30. Puis un plateau en Mix.

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const h = (jour, heure, min) => new Date(Date.UTC(2026, 8, 10 + jour, heure, min || 0)).toISOString();
const LIGNES = [
  { id: 'z1', exercise_slug: 'x', zone: 'lourd', corrigee_a: h(-20, 9) },
  { id: 'z2', exercise_slug: 'x', zone: 'mix', corrigee_a: h(0, 10, 30) }      // PENDANT la séance C
];
// [jour, charge, reps] ; chaque séance de 10 h à 11 h.
const PLAN = [[-14, 100, 5], [0, 100, 6], [3, 105, 7], [6, 105, 6], [9, 105, 6], [12, 105, 6], [15, 105, 6]];
const AVANT = h(18, 10);
const IC = 1;   // la séance C dans PLAN

// Au format du contrat (le compteur), et au format des groupes (la consigne).
const contrat = PLAN.map(([j, kg, r]) => ({ debut: h(j, 10), fin: h(j, 11), palier: kg,
  series: [r, r, r].map((x) => ({ charge_kg: kg, reps: x, rpe: null, role: 'palier', origine: 'palier' })) }));
let rang = 0;
const groupes = PLAN.map(([j, kg, r]) => ({ seance: { id: 'S' + j, debut: h(j, 10), fin: h(j, 11) },
  series: [r, r, r].map((x) => ({ id: 'x' + (++rang), rang, charge_kg: kg, reps: x, rpe: null, ressenti: null,
    type_serie: 'travail', exercise_slug: 'x' })) }));
const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal',
  correction: 'mix', correctionsDeZone: LIGNES, seancesSousConsigne: groupes.map((g) => g.seance.id) };

describe('54-1 — la zone d’une séance se lit à sa fin, une seule fois', () => {
  test('⚠️ DISCRIMINANT — la fonction unique : C est en Mix (changée à 10 h 30), pas en Lourd', () => {
    expect(M.zoneDeLaSeance(contrat, IC, AVANT, { reglage: 'normal', equipement: 'barre', corrections: LIGNES })).toBe('mix');
    // Une séance SANS heure de fin se lit 3 h au plus après son début (55-1) :
    // 10 h 30 y est encore.
    const sansFin = contrat.map((s) => Object.assign({}, s, { fin: undefined }));
    expect(M.zoneDeLaSeance(sansFin, IC, AVANT, { reglage: 'normal', equipement: 'barre', corrections: LIGNES })).toBe('mix');
  });

  test('⚠️ DISCRIMINANT — le compteur : C jugée en Mix, et la séance suivante ne remet PAS à zéro', () => {
    const r = M.compteurDe(contrat, AVANT, { reglage: 'normal', equipement: 'barre', corrections: LIGNES, toutes: true });
    const parDebut = {};
    r.verdicts.forEach((v) => { parDebut[v.debut] = v; });
    expect(parDebut[h(0, 10)].zone).toBe('mix');
    expect(parDebut[h(3, 10)].zone).toBe('mix');
    expect(parDebut[h(3, 10)].remise_a_zero).toBe(false);
    expect(r.compteur).toBe(4);
  });

  test('⚠️ DISCRIMINANT — le report : la séance d’après C ne reporte pas une seconde fois', () => {
    const r = M.consigneDExercice(groupes.slice(0, 2), null, h(3, 10), O);
    expect(r.consigne.zone).toBe('mix');
    expect(r.consigne.etat).not.toBe('nouvelle_zone');
  });

  test('⚠️ DISCRIMINANT — le repli de l’escalier : C (en Mix à sa fin) est la séance du repli', () => {
    const r = M.consigneDExercice(groupes, null, AVANT, O);
    expect(r.compteur.compteur).toBe(4);
    expect(r.repli).not.toBe(null);
    expect([r.repli.palier, r.repli.debut]).toEqual([100, h(0, 10)]);
  });
});

// ══ 55-1 (G2) — UNE SÉANCE SANS HEURE DE FIN : 3 H AU PLUS ══════════════════
describe('55-1 — une séance sans heure de fin finit 3 h au plus après son début (MOTEUR §12.2 bis, G2)', () => {
  const F = require('./fixtures/cas-55-1-records.json');
  const loc = (iso) => new Date(iso).getTime();
  F.autres.fin_effective.forEach((c) => {
    test('fin_effective — ' + c.titre, () => {
      expect(M.finEffective(c.seance, c.suivante, null)).toBe(loc(c.attendu));
    });
  });

  test('⚠️ DISCRIMINANT — une zone changée 5 h après une séance sans fin compte pour la SUIVANTE', () => {
    // C (jour 0, 10 h) sans heure de fin ; la zone passe en Mix à 15 h, la
    // séance d'après est au jour 3. Sans la borne, C se lisait jusqu'au jour 3.
    const lignes = [{ id: 'y1', exercise_slug: 'x', zone: 'lourd', corrigee_a: h(-20, 9) },
                    { id: 'y2', exercise_slug: 'x', zone: 'mix', corrigee_a: h(0, 15) }];
    const sansFin = contrat.map((s, i) => Object.assign({}, s, { fin: i === IC ? null : s.fin }));
    expect(M.zoneDeLaSeance(sansFin, IC, AVANT, { reglage: 'normal', equipement: 'barre', corrections: lignes })).toBe('lourd');
    expect(M.zoneDeLaSeance(sansFin, IC + 1, AVANT, { reglage: 'normal', equipement: 'barre', corrections: lignes })).toBe('mix');
    // Et à 12 h 30 (2 h 30 après le début), elle compte encore pour C.
    const tot = [lignes[0], Object.assign({}, lignes[1], { corrigee_a: h(0, 12, 30) })];
    expect(M.zoneDeLaSeance(sansFin, IC, AVANT, { reglage: 'normal', equipement: 'barre', corrections: tot })).toBe('mix');
  });

  test('la version de la consigne : 10 (55-1)', () => { expect(M.VERSION_CONSIGNE).toBe(10); });
});
