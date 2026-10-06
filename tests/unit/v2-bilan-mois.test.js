/** @jest-environment node */
//
// 55-1 — LE BILAN DU MOIS (MOTEUR §9.23, ECRAN-SAISIE §7 bis.14).
//
//   1. `bilanDuMois` sur les deux cas du fichier (septembre, octobre) :
//      séances, séries de travail, volume, jours, paris, temps ;
//   2. la phrase des paris (« Sur 10 paris vérifiés, le coach en a tenu 9. ») ;
//   3. le temps du mois n'apparaît que si TOUTES les séances ont une fin ;
//   4. les séries par muscle principal, à côté du mois d'avant ;
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
      expect({ seances: b.seances, series: b.series, volume_kg: b.volume_kg, jours: b.jours,
               paris_verifies: b.paris_verifies, paris_tenus: b.paris_tenus, temps_min: b.temps_min })
        .toEqual(c.attendu);
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

describe('§9.23 — le temps du mois : toutes les séances ont une fin, sinon rien', () => {
  test('la somme de fin − début, en minutes', () => {
    expect(B.tempsDuMois([{ debut: '2026-09-01T18:00', fin: '2026-09-01T19:00' },
      { debut: '2026-09-15T18:00', fin: '2026-09-15T19:10' }])).toBe(130);
  });
  test('⚠️ une seule séance sans fin, et le temps disparaît', () => {
    expect(B.tempsDuMois([{ debut: '2026-09-01T18:00', fin: '2026-09-01T19:00' },
      { debut: '2026-09-15T18:00', fin: null }])).toBeNull();
    expect(B.tempsDuMois([])).toBeNull();
    expect(B.texteTemps(130)).toBe('2 h 10');
    expect(B.texteTemps(45)).toBe('45 min');
  });
});

describe('§9.23 — les séries par muscle principal, et le mois d\'avant', () => {
  const cat = [{ slug: 'couche', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
               { slug: 'tirage', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'] }];
  const s = (slug, type) => ({ exercise_slug: slug, type_serie: type || 'travail', charge_kg: 50, reps: 10 });
  const seances = [
    { debut: '2026-08-10T18:00', fin: '2026-08-10T19:00', series: [s('couche'), s('couche')] },
    { debut: '2026-09-10T18:00', fin: '2026-09-10T19:00', series: [s('couche'), s('couche'), s('couche'), s('tirage'), s('couche', 'echauffement')] }
  ];
  test('une série compte pour ses muscles principaux seulement (jamais les secondaires), à côté du mois d\'avant', () => {
    const b = B.bilanDuMois({ mois: '2026-09', seances, paris: [], exercices: cat });
    expect(b.muscles.map((m) => [m.muscle, m.series, m.avant])).toEqual([['pectoraux', 3, 2], ['grand_dorsal', 1, 0]]);
    expect(b.exercices).toEqual([{ slug: 'couche', series: 3 }, { slug: 'tirage', series: 1 }]);
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
