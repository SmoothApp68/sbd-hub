/** @jest-environment node */
// « Au max » disparaît (20/11/2026, MOTEUR §9.30, I251) — les comportements que la garde textuelle (v2-architecture, « I251 ») ne voit pas.
//   · D2 (CONTRA-728) : une marque `au_max_reserve` portée par une série (une version d'avant, la semaine de test) ne change plus le cran : une série
//     notée « reste 0 » est à fond, marque ou non (avant : l'exemption « Au max » de `Palier.cranDeSerie` rendait `null`).
//   · CONTRA-728 (3) : la série de la semaine de test en mode « série », posée en DERNIÈRE série de travail de la barre et notée à fond, ne fait pas
//     garder le coach : la consigne suivante est celle d'une séance sans elle (plus légère) ou celle de la capacité tenue (à la charge du palier).
process.env.TZ = 'Europe/Paris';
global.window = global;
const Palier = require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');

describe('D2 — le cran ne lit plus la marque « Au max »', () => {
  test('« reste 0 » est à fond, avec ou sans `au_max_reserve` (0, 1 ou 2), avec ou sans `au_max`', () => {
    const s = (extra) => Object.assign({ charge_kg: 100, reps: 8, rpe: null, ressenti: 'reste_0', type_serie: 'travail' }, extra);
    expect(Palier.cranDeSerie(s({}))).toBe('max');
    expect(Palier.cranDeSerie(s({ au_max_reserve: 0 }))).toBe('max');
    expect(Palier.cranDeSerie(s({ au_max_reserve: 0, au_max: true }))).toBe('max');
    expect(Palier.cranDeSerie(s({ au_max_reserve: 2, ressenti: null, rpe: 10 }))).toBe('max');
  });
});

describe('la série de test en dernière position', () => {
  let n = 0;
  const jour = (x) => '2026-' + x + 'T10:00:00.000Z';
  const b = (kg, reps, res, extra) => Object.assign({ id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: res === undefined ? null : res,
    type_serie: 'travail', exercise_slug: 'squat' }, extra || {});
  const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', edition: false, reglage: 'normal' };
  const consigne = (derniere) => {
    const h = ['09-13', '09-06', '08-30', '08-23', '08-16'].map((x, i) => ({ seance: { id: 'H' + i, debut: jour(x) },
      series: [b(100, 5, 'reste_2'), b(100, 5, 'reste_2'), b(100, 5, 'reste_2')].concat(i === 0 && derniere ? [derniere] : []) }));
    return M.consigneDExercice(h, undefined, jour('09-20'), OPT).consigne;
  };
  const TEST = { au_max_reserve: 0, au_max: true };
  test('plus légère que le palier (≈ 85 %, 85 × 9 à fond) : la même consigne que sans elle', () => {
    const sans = consigne(null), avec = consigne(b(85, 9, 'reste_0', TEST));
    expect(avec.etat).toBe(sans.etat);
    expect(avec.ligne).toEqual(sans.ligne);
    expect(avec.haut).toEqual(sans.haut);
    expect(avec.fondement.effortVise && avec.fondement.effortVise.effet).not.toBe('garde');
  });
  test('à la charge du palier, au-dessus de la visée et à fond (100 × 7 pour 5 en gardant 2) : la capacité tenue, le test, aucune garde', () => {
    const k = consigne(b(100, 7, 'reste_0', TEST));
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBe(102.5);
    expect(k.fondement.effortVise && k.fondement.effortVise.effet).not.toBe('garde');
  });
});
