/** @jest-environment node */
//
// 55-1 — LE BILAN DU MOIS (MOTEUR §9.23, ECRAN-SAISIE §7 bis.14).
//
//   1. `bilanDuMois` sur les deux cas du fichier (septembre, octobre) :
//      séances, séries de travail, volume, jours, paris, temps ;
//   2. la phrase des paris (« Sur 10 paris vérifiés, le coach en a tenu 9. ») ;
//   3. le temps du mois n'apparaît que si TOUTES les séances ont une fin ;
//   4. les séries par muscle (comme le bloc Volume), à côté du mois d'avant ;
//   5. le mois écoulé, et les routes du bilan et des records.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const B = require('../../v2/js/bilan.js');
const R = require('../../v2/js/routeur.js');
const F = require('./fixtures/cas-55-1-records.json');

const COL = F.colonnes_serie;
const serieDe = (t) => ({ exercise_slug: t[COL.indexOf('slug')], type_serie: t[COL.indexOf('type')],
  charge_kg: t[COL.indexOf('kg')], reps: t[COL.indexOf('reps')] });
const seanceDe = (se) => ({ debut: se.debut, fin: se.fin, series: se.series.map(serieDe) });

describe('§9.23 — le bilan du mois, sur les cas du fichier', () => {
  F.autres.bilan_du_mois.forEach((c) => {
    test(c.mois, () => {
      const b = B.bilanDuMois({
        mois: c.mois,
        seances: c.seances.map(seanceDe),
        paris: c.paris.map((p) => ({ date: p.seance_debut, predite: p.predite, observee: p.observee }))
      });
      // 124 (audit du 16/10/2026, 04 #13, #14) — le bilan du mois ne rend plus `jours`, `temps_min` ni les paris (le
      // code mort de l'ancien bilan ; les paris du mois ont un fil, la période) : les autres chiffres du fichier de cas,
      // qui reste tel quel, tiennent toujours.
      expect({ seances: b.seances, series: b.series, volume_kg: b.volume_kg })
        .toEqual({ seances: c.attendu.seances, series: c.attendu.series, volume_kg: c.attendu.volume_kg });
      ['jours', 'temps_min', 'paris_verifies', 'paris_tenus', 'exercices'].forEach((k) => expect(b).not.toHaveProperty(k));
    });
  });
});

describe('§9.23 — la phrase des paris', () => {
  F.autres.phrase_paris.forEach((c) => {
    test(c.verifies + ' vérifiés, ' + c.tenus + ' tenus', () => {
      expect(B.phraseParis(c.verifies, c.tenus)).toBe(c.attendu);
    });
  });
});

describe('§9.23 — le temps du mois', () => {
  // 124 (audit du 16/10/2026, 04 #13) — la règle « tout ou rien » de l'ancien bilan (`tempsDuMois`) contredisait celle
  // des heures à la salle (97) et n'était plus lue : retirée, avec `exercicesLesPlusFaits`. Le format reste.
  test('124 — l’ancienne règle du temps et les exercices les plus faits sont retirés ; le format du temps reste', () => {
    expect(B.tempsDuMois).toBeUndefined();
    expect(B.exercicesLesPlusFaits).toBeUndefined();
    expect(B.texteTemps(130)).toBe('2 h 10');
    expect(B.texteTemps(45)).toBe('45 min');
  });
});

describe('§9.23 (H2, #371) — les séries par muscle, comptées comme le bloc Volume, et le mois d\'avant', () => {
  const cat = [{ slug: 'couche', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
               { slug: 'tirage', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'] }];
  const s = (slug, type) => ({ exercise_slug: slug, type_serie: type || 'travail', charge_kg: 50, reps: 10 });
  const seances = [
    { debut: '2026-08-10T18:00', fin: '2026-08-10T19:00', series: [s('couche'), s('couche')] },
    { debut: '2026-09-10T18:00', fin: '2026-09-10T19:00', series: [s('couche'), s('couche'), s('couche'), s('tirage'), s('couche', 'echauffement')] }
  ];
  test('⚠️ DISCRIMINANT — un principal compte la série entière, un secondaire pour moitié, à côté du mois d\'avant', () => {
    const b = B.bilanDuMois({ mois: '2026-09', seances, paris: [], exercices: cat });
    expect(b.muscles.map((m) => [m.muscle, m.series, m.avant])).toEqual(
      [['pectoraux', 3, 2], ['triceps', 1.5, 1], ['grand_dorsal', 1, 0], ['biceps', 0.5, 0]]);
    expect(b).not.toHaveProperty('exercices');   // 124 : l'ancien « plus faits » (par séries), retiré
  });
  test('la même fonction que le bloc Volume : les chiffres sont identiques', () => {
    const S = require('../../v2/js/semaine.js');
    const b = B.bilanDuMois({ mois: '2026-09', seances, paris: [], exercices: cat });
    expect(b.muscles.map((m) => [m.muscle, m.series])).toEqual(
      S.volumeParMuscle(seances[1].series, cat).map((m) => [m.muscle, m.series]));
  });
});

describe('§9.23 — le mois écoulé, et ses routes', () => {
  test('le mois écoulé est celui d\'avant aujourd\'hui, jusqu\'au dernier jour du mois suivant', () => {
    expect(B.moisEcoule(new Date(2026, 9, 6))).toBe('2026-09');
    expect(B.moisEcoule(new Date(2026, 9, 31, 23, 0))).toBe('2026-09');
    expect(B.moisEcoule(new Date(2026, 0, 3))).toBe('2025-12');
    expect(B.moisPrecedent('2026-01')).toBe('2025-12');
    expect(B.moisSuivant('2026-12')).toBe('2027-01');
  });
  test('/progression/mois et /progression/records, avec ou sans mois', () => {
    expect(R.analyser('/progression/mois')).toEqual({ vue: 'mois', params: {} });
    expect(R.analyser('/progression/mois/2026-09')).toEqual({ vue: 'mois', params: { mois: '2026-09' } });
    expect(R.analyser('/progression/records/2026-08')).toEqual({ vue: 'records', params: { mois: '2026-08' } });
    expect(R.analyser('/progression/mois/2026-13').repli).toBe('mois-invalide');
    expect(R.construire('mois', { mois: '2026-09' })).toBe('/progression/mois/2026-09');
    expect(R.construire('records', {})).toBe('/progression/records');
    expect(R.ongletDe('mois')).toBe('progression');
  });
});
