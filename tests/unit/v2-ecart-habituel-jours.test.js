/** @jest-environment node */
//
// 19/11/2026 — L'ÉCART HABITUEL SE COMPTE EN JOURS CIVILS DISTINCTS (MOTEUR §9.9, comme §9.42 bis : deux séances le même jour
// comptent une). Avant : deux séances de l'exercice le même jour donnaient un écart ~0,1 ; la médiane tombait à ~0 et toute
// absence devenait une reprise courte (cas réel, fixture K009 du compteur : une fausse reprise remettait le compteur à zéro).

process.env.TZ = 'Europe/Paris';
require('../../v2/js/periode.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const s = (iso) => ({ debut: iso });
// Un rythme hebdomadaire du 7 septembre au 12 octobre 2026, avec DEUX séances le même jour (matin et midi) à 2 reprises.
const HISTOIRE = [
  s('2026-09-07T07:16:00Z'), s('2026-09-07T11:37:00Z'),
  s('2026-09-14T07:00:00Z'), s('2026-09-14T11:00:00Z'),
  s('2026-09-21T07:00:00Z'), s('2026-09-28T07:00:00Z'), s('2026-10-05T07:00:00Z'), s('2026-10-12T07:00:00Z')
];

describe('l’écart habituel en jours civils distincts', () => {
  test('deux séances le même jour comptent une : la médiane est 7 jours, jamais ~0', () => {
    expect(M.ecartHabituel(HISTOIRE, '2026-10-20T07:00:00Z')).toBe(7);
  });
  test('un seul jour distinct (deux séances le même jour) : pas d’écart habituel', () => {
    expect(M.ecartHabituel([s('2026-09-07T07:16:00Z'), s('2026-09-07T11:37:00Z')], '2026-09-20T07:00:00Z')).toBeNull();
  });
  test('2 séances le même jour puis retour 4 jours plus tard : aucune reprise', () => {
    expect(M.repriseDe(HISTOIRE, '2026-10-16T07:00:00Z')).toBe('aucune');
    // le défaut d’avant : la même histoire, sans regroupement, donnait ~0 et une reprise courte
    const sansRythme = [s('2026-09-07T07:16:00Z'), s('2026-09-07T11:37:00Z'), s('2026-09-09T07:00:00Z'), s('2026-09-09T11:00:00Z'), s('2026-09-11T07:00:00Z')];
    expect(M.repriseDe(sansRythme, '2026-09-15T07:00:00Z')).toBe('aucune');
  });
  test('2 séances le même jour puis 7 semaines d’absence : reprise courte (49 j > 3 × 7, ≤ 84 j)', () => {
    expect(M.repriseDe(HISTOIRE, '2026-12-01T07:00:00Z')).toBe('courte');
  });
  test('2 séances le même jour puis plus de 84 jours d’absence : reprise longue', () => {
    expect(M.repriseDe(HISTOIRE, '2027-02-01T07:00:00Z')).toBe('longue');
  });
  test('coupureDansLaFatigue = repriseDe sur les mêmes histoires (une notion, une fonction)', () => {
    const debuts = HISTOIRE.map((x) => x.debut);
    const avecRetour = (jour) => debuts.concat([jour + 'T07:00:00Z']);
    // retour 4 jours plus tard : aucune coupure ; 7 semaines : une coupure
    expect(M.coupureDansLaFatigue(avecRetour('2026-10-16'), '2026-10-16', '2026-10-16')).toBe(false);
    expect(M.coupureDansLaFatigue(avecRetour('2026-12-01'), '2026-12-01', '2026-12-01')).toBe(true);
    // une seule séance d’un jour puis 100 jours : sans rythme, reprise longue (16/11/2026)
    expect(M.coupureDansLaFatigue([ '2026-01-05T07:16:00Z', '2026-01-05T11:37:00Z', '2026-04-20T07:00:00Z' ], '2026-04-20', '2026-04-20')).toBe(true);
  });
  test('coupureDansLaFatigue = repriseDe sur 200 histoires tirées avec des séances le même jour', () => {
    let g = 1911; const al = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
    for (let h = 0; h < 200; h++) {
      let t = Date.UTC(2026, 0, 1, 7); const liste = [];
      const n = 3 + Math.floor(al() * 12);
      for (let i = 0; i < n; i++) {
        liste.push({ debut: new Date(t).toISOString() });
        if (al() < 0.35) liste.push({ debut: new Date(t + 4 * 3600000).toISOString() });
        t += Math.round((1 + al() * 20) * 86400000);
      }
      const dernier = liste[liste.length - 1].debut, jour = M.jourCivil(dernier);
      const attendu = liste.some((x, i) => i > 0 && M.repriseDe(liste.slice(0, i), x.debut) !== 'aucune');
      expect(M.coupureDansLaFatigue(liste.map((x) => x.debut), '2026-01-01', jour)).toBe(attendu);
    }
  });
});
