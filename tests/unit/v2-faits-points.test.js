/** @jest-environment node */
//
// 206 — LES FAITS `pointsDeLExercice` et `exercicesLesPlusFaits` (`v2/js/faits.js`) : la matière des courbes de Progression
// et de la page d'exercice. Un point par séance, du plus ancien au plus récent ; max estimé (Epley) de la meilleure série
// de 10 reps ou moins ; meilleures reps au poids du corps ; meilleures secondes sur un maintien.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', equipement: 'poids_du_corps', muscles_primaires: ['dos'] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps', equipement: 'poids_du_corps', muscles_primaires: [] }
];
const jour = (a, m, j) => new Date(a, m, j, 18, 0, 0);

// `specs` : de la plus RÉCENTE à la plus ancienne, comme `c.seances`.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null });
    parSeance[id] = (sp.series || []).map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}
const S = (slug, charge, reps, extra) => Object.assign({ exercise_slug: slug, charge_kg: charge, reps }, extra || {});

describe('206 — Faits.pointsDeLExercice', () => {
  test('un point par séance, du plus ancien au plus récent, le max estimé Epley de la meilleure série', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 130, 5), S('squat_barre', 120, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 100, 8)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.mesure).toBe('charge');
    expect(p.points.map((x) => x.seance)).toEqual(['s1', 's0']);
    expect(p.points[1].valeur).toBeCloseTo(130 * (1 + 5 / 30), 6);
    expect(p.points[1].charge).toBe(130);
    expect(p.points[1].reps).toBe(5);
    expect(p.points[0].valeur).toBeCloseTo(100 * (1 + 8 / 30), 6);
  });

  test('⚠️ une série de plus de 10 reps, une chauffe, une série sans charge ne comptent pas', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 60, 15), S('squat_barre', 200, 1, { type_serie: 'echauffement' }), S('squat_barre', null, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 100, 10), S('squat_barre', 60, 11)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.points).toHaveLength(1);
    expect(p.points[0].seance).toBe('s1');
    expect(p.points[0].reps).toBe(10);
  });

  test('poids du corps : les meilleures reps ; maintien : les meilleures secondes', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('tractions', null, 14), S('tractions', null, 9), S('planche', null, null, { duree_s: 75 }), S('planche', null, null, { duree_s: 60 })] },
      { debut: jour(2026, 9, 21), series: [S('tractions', null, 12)] }
    ]);
    const f = Faits.creer();
    const t = f.pointsDeLExercice(c, 'tractions');
    expect(t.mesure).toBe('reps');
    expect(t.points.map((x) => x.valeur)).toEqual([12, 14]);
    const pl = f.pointsDeLExercice(c, 'planche');
    expect(pl.mesure).toBe('temps');
    expect(pl.points.map((x) => x.valeur)).toEqual([75]);
  });

  test('le drapeau record suit la médaille de la séance, pas le seul max estimé', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 100, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 120, 5)] },
      { debut: jour(2026, 9, 14), series: [S('squat_barre', 110, 5)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.points.map((x) => x.record)).toEqual([false, true, false]);  // 110 (la première fois : rien à battre), 120 (record), 100 (non)
  });

  test('exercice inconnu ou jamais fait : rien', () => {
    const c = corpus([{ debut: jour(2026, 9, 28), series: [S('squat_barre', 100, 5)] }]);
    expect(Faits.creer().pointsDeLExercice(c, 'inconnu')).toEqual({ mesure: null, points: [] });
    expect(Faits.creer().pointsDeLExercice(c, 'tractions').points).toEqual([]);
  });
});

describe('206 — Faits.exercicesLesPlusFaits', () => {
  test('les plus faits sur 8 semaines, à égalité le plus récent ; les séances plus anciennes ne comptent pas', () => {
    const now = jour(2026, 10, 1);
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 100, 5), S('developpe_couche_barre', 80, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 100, 5)] },
      { debut: jour(2026, 9, 14), series: [S('developpe_couche_barre', 80, 5), S('tractions', null, 8)] },
      { debut: jour(2026, 0, 5), series: [S('tractions', null, 8), S('tractions', null, 8)] }
    ]);
    const f = Faits.creer();
    expect(f.exercicesLesPlusFaits(c, now, 8, 4)).toEqual(['squat_barre', 'developpe_couche_barre', 'tractions']);
    expect(f.exercicesLesPlusFaits(c, now, 8, 2)).toEqual(['squat_barre', 'developpe_couche_barre']);
  });
});
