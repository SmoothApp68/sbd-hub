/** @jest-environment node */
//
// Prompt 131 (ECRAN-SAISIE §3 ter.5, écran 5) — le fait « Ce qui manque à tes séances » (`faits.ceQuiManque`) et ce
// que le profil en écrit (`completer_refus`, « Je ne sais plus »).

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Faits = require('../../v2/js/faits.js');

const CAT = [
  { slug: 'randonnee', nom: 'Randonnée', mesure: 'distance_temps', charge: 'aucune', champs_series: ['denivele_m'] },
  { slug: 'escaliers', nom: 'Escaliers', mesure: 'temps', charge: 'aucune', champs_series: ['etages'] },
  { slug: 'velo_machine', nom: 'Vélo d’Appartement', mesure: 'distance_temps', charge: 'aucune', champs_series: [] },
  { slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune', champs_series: [] },
  { slug: 'squat', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'absolue', champs_series: [] }
];
const index = {};
CAT.forEach((e) => { index[e.slug] = e; });

function corpus(seances) {
  const series = [];
  seances.forEach((s) => s.series.forEach((x, k) => series.push(Object.assign({ id: s.id + '-' + k, session_id: s.id,
    type_serie: 'travail', rang: k + 1, charge_kg: null, reps: null, duree_s: null, distance_m: null, denivele_m: null,
    etages: null }, x))));
  return { seances: seances.map((s) => ({ id: s.id, debut: s.debut, statut: s.statut || 'terminee' })), series,
    exercices: CAT, catalogue: () => index, seriesDe: (id) => series.filter((x) => x.session_id === id), journal: [] };
}
const SEANCES = () => [
  { id: 'a', debut: '2026-09-27T08:00:00Z', series: [{ exercise_slug: 'randonnee', duree_s: 13200, distance_m: 14100 }] },
  { id: 'b', debut: '2026-10-12T08:00:00Z', series: [
    { exercise_slug: 'randonnee', duree_s: 11100, distance_m: 11800 },
    { exercise_slug: 'randonnee', type_serie: 'echauffement', duree_s: 600 },     // une chauffe : jamais listée
    { exercise_slug: 'squat', charge_kg: 100, reps: 5 }] },
  { id: 'c', debut: '2026-10-14T08:00:00Z', series: [
    { exercise_slug: 'escaliers', duree_s: 1200 },
    { exercise_slug: 'escaliers', duree_s: 600, etages: 30 },                    // déjà complète
    { exercise_slug: 'velo_machine', duree_s: 1800 },
    { exercise_slug: 'course', duree_s: 1800 }] },                               // la course n'est pas listée
  { id: 'd', debut: '2026-10-20T08:00:00Z', statut: 'en_cours', series: [{ exercise_slug: 'randonnee', duree_s: 600 }] },
  { id: 'e', debut: '2026-08-01T08:00:00Z', series: [{ exercise_slug: 'randonnee', duree_s: 9000, denivele_m: 400 }] }
];

describe('131 — le fait « Ce qui manque à tes séances »', () => {
  test('groupé par (exercice, colonne), le plus récent d’abord ; la chauffe, la séance en cours, ce qui est complet : non', () => {
    const g = Faits.creer().ceQuiManque(corpus(SEANCES()), []);
    expect(g.map((x) => x.cle)).toEqual(['escaliers:etages', 'velo_machine:distance_m', 'randonnee:denivele_m']);
    const r = g[2];
    expect(r.lignes.map((l) => l.serieId)).toEqual(['b-0', 'a-0']);
    expect([r.champ, r.colonne, r.seances]).toEqual(['denivele_m', 'denivele_m', 2]);
    expect(g[0].lignes.map((l) => l.serieId)).toEqual(['c-0']);
    expect(g[1].champ).toBe('distance_km');
  });
  test('⚠️ DISCRIMINANT — un groupe refusé (« Je ne sais plus ») n’y est plus ; les autres restent', () => {
    const g = Faits.creer().ceQuiManque(corpus(SEANCES()), ['randonnee:denivele_m']);
    expect(g.map((x) => x.cle)).toEqual(['escaliers:etages', 'velo_machine:distance_m']);
  });
  test('tout complété : rien (la carte disparaît)', () => {
    const s = SEANCES();
    s[0].series[0].denivele_m = 900; s[1].series[0].denivele_m = 800;
    s[2].series[0].etages = 72; s[2].series[2].distance_m = 12600;
    expect(Faits.creer().ceQuiManque(corpus(s), [])).toEqual([]);
  });
  test('une correction (la même quantité de séries, une valeur de plus) se voit tout de suite', () => {
    const f = Faits.creer(), c = corpus(SEANCES());
    expect(f.ceQuiManque(c, []).length).toBe(3);
    c.series.filter((x) => x.id === 'c-0')[0].etages = 72;
    expect(f.ceQuiManque(c, []).map((x) => x.cle)).toEqual(['velo_machine:distance_m', 'randonnee:denivele_m']);
  });
});

describe('131 — `completer_refus` au profil', () => {
  test('une liste de « slug:colonne » part ; autre chose, non ; les doublons tombent', () => {
    expect(Profil.champsEcrits({ completer_refus: ['randonnee:denivele_m', 'randonnee:denivele_m', 3, ''] }))
      .toEqual({ completer_refus: ['randonnee:denivele_m'] });
    expect(Profil.champsEcrits({ completer_refus: 'randonnee:denivele_m' })).toEqual({});
  });
});
