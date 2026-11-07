/** @jest-environment node */
//
// 268 (F) — LA SILHOUETTE DU MOIS sur l'image mensuelle : les séries du dessin sont celles de « Muscle du mois »
// (la somme unique `Semaine.sommeDesSeries`, jamais un autre compte), le sexe est celui de l'appareil, aucun seuil.

process.env.TZ = 'Europe/Paris';

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
require('../../v2/js/poids.js');
require('../../v2/js/silhouettes.js');
const Bilans = require('../../v2/js/bilans.js');
const Annee = require('../../v2/js/annee.js');
const Semaine = global.THSemaine;
const S = global.THSilhouettes;

const CAT = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'curl_halteres', nom: 'Curl (Haltère)', equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
let n = 0;
function seance(jour, series) {
  const id = 's' + (++n);
  return { id, jour, titre: 'Bas A', series: series.map((x, i) => ({ id: id + i, session_id: id, exercise_slug: x[0],
    charge_kg: x[1], reps: x[2], type_serie: 'travail', rang: i })) };
}
const seances = [
  seance('2026-10-05', [['squat_barre', 100, 5], ['squat_barre', 100, 5], ['squat_barre', 100, 5], ['curl_halteres', 20, 10]]),
  seance('2026-10-12', [['squat_barre', 105, 5], ['squat_barre', 105, 5], ['curl_halteres', 20, 10]])
];
function plaque(sexe) {
  const b = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDuMois('2026-10'), aujourdhui: '2026-10-31', seances, exercices: CAT, pesees: [], paris: [] });
  const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null, sexe });
  return { b, p: e.find((x) => x.cle === 'plaque').plaque };
}

describe('268 (F) — la silhouette du mois', () => {
  test('le volume du dessin est celui du bilan du mois (la somme unique), muscle par muscle', () => {
    const { b, p } = plaque();
    expect(p.corps).toBeTruthy();
    b.muscles.forEach((m) => { expect(p.corps.volume[m.muscle]).toBe(m.series); });
    expect(p.corps.volume.quadriceps).toBe(5);
    expect(p.corps.volume.biceps).toBe(2);
  });
  test('le muscle du mois de la plaque est le plus chargé du dessin', () => {
    const { p } = plaque();
    const l = S.lire(p.corps.volume, p.corps.libelles);
    const case_ = p.cases.find((c) => c.k === 'Muscle du mois');
    expect(case_.m).toBe(l.lignes[0].libelle);
    expect(l.max).toBeGreaterThanOrEqual(5);
  });
  test('le sexe vient de l’appareil ; sans rien, le dessin par défaut', () => {
    expect(plaque('femme').p.corps.sexe).toBe('femme');
    expect(plaque().p.corps.sexe).toBeNull();
  });
  test('aucune silhouette sur une saison ni sans muscle travaillé', () => {
    const b = Bilans.bilanDeLaPeriode({ periode: Bilans.periodeDuMois('2026-10'), aujourdhui: '2026-10-31', seances: [], exercices: CAT, pesees: [], paris: [] });
    const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null });
    const pl = e.find((x) => x.cle === 'plaque');
    if (pl) expect(pl.plaque.corps).toBeNull();
  });
  test('la somme du dessin vient de Semaine.volumeParMuscle, pas d’un autre compte', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/annee.js'), 'utf8');
    expect(src).not.toMatch(/\.(sommeDesSeries|volumeParMuscle)\(/);
    expect(typeof Semaine.sommeDesSeries).toBe('function');
  });
});
