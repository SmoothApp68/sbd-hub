/** @jest-environment node */
//
// 60-2a — LE FAIT `ceQueJeSais` (`v2/js/faits.js`) : ce que les séances savent de
// la personne, que le questionnaire MONTRE au lieu de le demander
// (QUESTIONNAIRE-COACH-V2 §3, écran « Ce que je sais » ; §1.2).
//
// Le corpus est de papier, daté à partir d'un « aujourd'hui » fixe, pour que
// chaque règle ait son cas :
//   · le rythme ne compte que les 84 derniers jours (une séance de 85 jours ne
//     compte pas — l'historique, lui, la compte) ;
//   · la durée est une MÉDIANE des séances qui ont une heure de fin, arrondie à
//     5 min : une séance sans fin, une fin avant le début et une séance hors
//     fenêtre n'y entrent pas ;
//   · une randonnée est une séance (comme dans l'historique) et une « autre
//     activité » ; une planche, qui porte un muscle, n'en est pas une ;
//   · un maximum aux barres est la charge la plus lourde de TRAVAIL — pas une
//     chauffe.

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

const AUJ = new Date(2026, 9, 7, 12, 0, 0);
const jourDe = (ilYa, h, m) => new Date(2026, 9, 7 - ilYa, h || 18, m || 0, 0);
const MIN = 60000;

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['quadriceps'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'] },
  { slug: 'souleve_de_terre_barre', nom: 'Soulevé de Terre (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['fessiers'] },
  { slug: 'developpe_militaire_barre', nom: 'Développé Militaire (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['deltoide_anterieur'] },
  { slug: 'randonnee', nom: 'Randonnée', mesure: 'distance_temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: [] },
  { slug: 'escalade', nom: 'Escalade (Bloc)', mesure: 'distance_temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: [] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: ['abdominaux'] }
];

// Une séance : `debut`, `fin` (minutes après le début, ou null), ses séries.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(),
      fin: sp.minutes === null || sp.minutes === undefined ? null : new Date(sp.debut.getTime() + sp.minutes * MIN).toISOString() });
    parSeance[id] = (sp.series || []).map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));   // la plus récente d'abord
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}
const BARRES = ['developpe_couche_barre', 'squat_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];
const sq = (kg, reps) => ({ exercise_slug: 'squat_barre', charge_kg: kg, reps });

function historique() {
  const s = [];
  // Cinq séances d'avant la fenêtre : dont une de 300 min, qui ne doit PAS entrer dans la médiane.
  [100, 120, 150, 200, 400].forEach((j, i) => s.push({ debut: jourDe(j), minutes: i === 4 ? 300 : 60, series: [sq(60, 5)] }));
  // La fenêtre de 84 jours : 26 séances. Cinq portent une fin lisible (60, 70, 80, 90, 100 min).
  const durees = [60, 70, 80, 90, 100];
  for (let i = 0; i < 26; i++) {
    const sp = { debut: jourDe(2 + i * 3), minutes: i < 5 ? durees[i] : null, series: [] };
    if (i === 0) sp.series = [sq(100, 5), sq(120, 3), { exercise_slug: 'developpe_couche_barre', charge_kg: 90, reps: 5 },
      { exercise_slug: 'souleve_de_terre_barre', type_serie: 'echauffement', charge_kg: 60, reps: 8 },
      { exercise_slug: 'planche', duree_s: 60 }];
    else if (i % 5 === 1) sp.series = [{ exercise_slug: 'randonnee', duree_s: 7200, distance_m: 9000 }];
    else if (i % 7 === 2) sp.series = [{ exercise_slug: 'escalade', duree_s: 5400 }];
    else sp.series = [sq(80, 8)];
    s.push(sp);
  }
  return s;
}

describe('60-2a — `ceQueJeSais` : ce que les séances savent', () => {
  const faits = Faits.creer();
  const c = corpus(historique());
  const f = faits.ceQueJeSais(c, AUJ, BARRES);

  test('l’historique compte TOUTES les séances (randonnées comprises) et date la première', () => {
    expect(f.seances).toBe(31);
    expect(f.depuis.getTime()).toBe(jourDe(400).getTime());
  });

  test('le rythme : les séances des 84 derniers jours ÷ 12, au plus proche (26 ÷ 12 = 2)', () => {
    expect(f.rythme).toBe(2);
  });

  test('DISCRIMINANT du rythme : la fenêtre est « aujourd’hui et les 83 jours d’avant » — 12 séances à 83 jours comptent, à 84 non', () => {
    const memeJour = (ilYa, n) => Array.from({ length: n }, (_, i) => ({ debut: jourDe(ilYa, 8 + i), minutes: 60 }));
    expect(faits.ceQueJeSais(corpus(memeJour(83, 12)), AUJ, []).rythme).toBe(1);     // dans la fenêtre : 12 ÷ 12
    expect(faits.ceQueJeSais(corpus(memeJour(84, 12)), AUJ, []).rythme).toBeNull();  // hors fenêtre
    expect(faits.ceQueJeSais(corpus(memeJour(84, 12)), AUJ, []).seances).toBe(12);   // mais l’historique les compte
  });

  test('le rythme s’arrondit au plus proche (18 ÷ 12 = 1,5 → 2 ; 17 ÷ 12 → 1) et reste absent sous 1', () => {
    const n = (k) => Array.from({ length: k }, (_, i) => ({ debut: jourDe(1 + i), minutes: 60 }));
    expect(faits.ceQueJeSais(corpus(n(18)), AUJ, []).rythme).toBe(2);
    expect(faits.ceQueJeSais(corpus(n(17)), AUJ, []).rythme).toBe(1);
    expect(faits.ceQueJeSais(corpus(n(5)), AUJ, []).rythme).toBeNull();
  });

  test('la durée habituelle : la MÉDIANE des séances de la fenêtre qui ont une fin, à 5 min (80)', () => {
    expect(f.dureeMin).toBe(80);
  });

  test('la durée ignore une séance sans fin, une fin avant le début et une séance hors fenêtre', () => {
    const specs = [
      { debut: jourDe(2), minutes: 60 }, { debut: jourDe(3), minutes: 70 }, { debut: jourDe(4), minutes: 80 },
      { debut: jourDe(5), minutes: null },                              // sans heure de fin
      { debut: jourDe(6), minutes: -30 },                               // fin avant le début
      { debut: jourDe(200), minutes: 500 }];                            // hors fenêtre
    expect(faits.ceQueJeSais(corpus(specs), AUJ, []).dureeMin).toBe(70);
  });

  test('la durée est arrondie à 5 min (une médiane de 72 → 70, de 73 → 75) et absente sans aucune durée', () => {
    const deux = (a, b) => faits.ceQueJeSais(corpus([{ debut: jourDe(2), minutes: a }, { debut: jourDe(3), minutes: b }]), AUJ, []).dureeMin;
    expect(deux(72, 72)).toBe(70);
    expect(deux(73, 73)).toBe(75);
    expect(faits.ceQueJeSais(corpus([{ debut: jourDe(2), minutes: null }]), AUJ, []).dureeMin).toBeNull();
    expect(faits.ceQueJeSais(corpus([]), AUJ, []).dureeMin).toBeNull();
  });

  test('les maximums : la charge la plus lourde de TRAVAIL de chaque barre faite, dans l’ordre demandé', () => {
    expect(f.maximums).toEqual([
      { slug: 'developpe_couche_barre', charge: 90 },
      { slug: 'squat_barre', charge: 120 }]);
  });

  test('DISCRIMINANT des maximums : une barre dont il n’y a que des chauffes n’y est pas (le soulevé, 60 kg en chauffe)', () => {
    expect(f.maximums.map((m) => m.slug)).not.toContain('souleve_de_terre_barre');
    expect(f.maximums.map((m) => m.slug)).not.toContain('developpe_militaire_barre');
  });

  test('l’ordre des maximums est celui des barres passées', () => {
    expect(faits.ceQueJeSais(c, AUJ, ['squat_barre', 'developpe_couche_barre']).maximums.map((m) => m.slug))
      .toEqual(['squat_barre', 'developpe_couche_barre']);
    expect(faits.ceQueJeSais(c, AUJ, []).maximums).toEqual([]);
    expect(faits.ceQueJeSais(c, AUJ).maximums).toEqual([]);
  });

  test('les autres activités : les sorties des 84 jours, en minuscules, les plus fréquentes d’abord ; la planche n’en est pas une', () => {
    expect(f.autres).toEqual(['randonnée', 'escalade']);
    expect(f.autres.join(',')).not.toMatch(/planche/);
  });

  test('au plus trois autres activités', () => {
    const e = (slug, nom) => CATALOGUE.push({ slug, nom, mesure: 'distance_temps', charge: 'aucune', equipement: 'aucun', muscles_primaires: [] });
    e('natation', 'Natation'); e('course', 'Course à pied (Tapis)');
    try {
      const specs = ['randonnee', 'escalade', 'natation', 'course'].map((slug, i) => ({
        debut: jourDe(2 + i), minutes: 60, series: [{ exercise_slug: slug, duree_s: 3600 }] }));
      specs.push({ debut: jourDe(10), minutes: 60, series: [{ exercise_slug: 'natation', duree_s: 3600 }] });
      const r = faits.ceQueJeSais(corpus(specs), AUJ, []).autres;
      expect(r).toHaveLength(3);
      expect(r[0]).toBe('natation');                       // deux séances : la plus fréquente d'abord
      expect(r).toContain('course à pied');                // le nom court : sans « (Tapis) », en minuscules
    } finally { CATALOGUE.length = 7; }
  });

  test('un compte sans séance : tout est vide, et rien ne plante', () => {
    const r = faits.ceQueJeSais(corpus([]), AUJ, BARRES);
    expect(r).toEqual({ seances: 0, depuis: null, rythme: null, dureeMin: null, maximums: [], autres: [] });
  });

  test('un exercice absent du catalogue n’est ni une sortie ni une barre : sans effet', () => {
    const r = faits.ceQueJeSais(corpus([{ debut: jourDe(2), minutes: 60, series: [{ exercise_slug: 'inconnu', duree_s: 600 }] }]), AUJ, BARRES);
    expect(r.autres).toEqual([]);
    expect(r.maximums).toEqual([]);
  });

  test('c’est la fonction des records de la page d’exercice : même charge que `recordsDeLExercice(...).lourde`', () => {
    const pour = faits.seancesDuSlug(c, 'squat_barre');
    const lourde = Modele.recordsDeLExercice(pour, AUJ, Modele.optionsDeRecord(c.catalogue().squat_barre)).lourde;
    expect(f.maximums.filter((m) => m.slug === 'squat_barre')[0].charge).toBe(lourde.charge);
  });
});
