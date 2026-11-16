/** @jest-environment node */
//
// 16/11/2026 — REPRISE SANS RYTHME (MOTEUR §9.9, §12.6). Une seule séance antérieure de l'exercice (écart habituel `null`) :
// une absence STRICTEMENT supérieure à 84 jours (`SEUIL_REPRISE_LONGUE`) = reprise LONGUE ; jusqu'à 84 jours inclus, aucune reprise ;
// jamais de reprise courte devinée. Cas réel : UNE séance de hip thrust il y a 7 mois → aucune reprise → le coach proposait un test
// au cran au-dessus.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, slug) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: slug });
const JOUR = 86400000;
const AVANT = '2026-11-16T17:00:00Z';
const ilYa = (j) => new Date(Date.parse(AVANT) - j * JOUR).toISOString();
const histoire = (j, slug) => [{ seance: { id: 'H1', debut: ilYa(j) }, series: [brute(100, 10, slug), brute(100, 10, slug), brute(100, 10, slug)] }];
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc', edition: false };
const calc = (g) => M.consigneDExercice(g, undefined, AVANT, OPT);

describe('une seule séance antérieure : la reprise sans rythme', () => {
  test('84 jours : aucune reprise ; 85 jours : reprise longue (jamais courte)', () => {
    expect(calc(histoire(84, 'hip_thrust')).consigne.etat).not.toBe('reprise_longue');
    expect(calc(histoire(84, 'hip_thrust')).consigne.etat).not.toBe('reprise_courte');
    expect(calc(histoire(85, 'hip_thrust')).consigne.etat).toBe('reprise_longue');
    expect(calc(histoire(210, 'hip_thrust')).consigne.etat).toBe('reprise_longue');
  });
  test('le plan complet : 7 mois sans l’exercice, UNE séance → reprise_longue, aucun test au-dessus', () => {
    const r = calc(histoire(210, 'hip_thrust'));
    let k = 0; const id = () => 'x-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'hip_thrust', id, { series: 3 });
    const FICHE = { nom: 'Hip thrust', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['fessiers'], muscles_secondaires: [], muscles_stabilisateurs: [] };
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { hip_thrust: { consigne: r.consigne, contexte: r.contexte } },
      reglage: 'franc', paris: [], catalogue: { hip_thrust: FICHE } };
    const p = T.planDeSeance(e);
    expect(r.consigne.etat).toBe('reprise_longue');
    expect(r.consigne.haut).toBeNull();                       // aucun test au cran au-dessus
    expect(p.exercices[0].consigne.etat).toBe('reprise_longue');
    expect(p.exercices[0].consigne.haut).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('zéro séance antérieure : aucune reprise (inchangé)', () => {
    expect(M.repriseDe([], AVANT)).toBe('aucune');
  });
  test('la fatigue : la même règle (coupureDansLaFatigue)', () => {
    const d = (j) => ilYa(j);
    expect(M.coupureDansLaFatigue([d(100), d(0)], '2026-11-10', '2026-11-16')).toBe(true);
    expect(M.coupureDansLaFatigue([d(84), d(0)], '2026-11-10', '2026-11-16')).toBe(false);
  });
});
