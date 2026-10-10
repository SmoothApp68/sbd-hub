/** @jest-environment node */
//
// 66C — LES HABITUDES (`v2/js/faits.js` `habitudes`, QUESTIONNAIRE-COACH-V2 §5 quater.2) : séances par semaine,
// taille d'une séance, reps et séries habituelles par exercice, sur la fenêtre du programme déduit.
//
// Chaque test est DISCRIMINANT : il échoue si la règle qu'il nomme est fausse — une séance à un seul exercice comptée,
// la signature recopiée sans l'échec, la médiane paire arrondie vers le bas, une semaine vide comptée zéro, le cardio
// ou une chauffe comptés, la fenêtre arrêtée à aujourd'hui.

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
require('../../v2/js/routines.js');
const Faits = require('../../v2/js/faits.js');

const fiche = (slug, mesure, charge, prim) => ({ slug, nom: slug, mesure, charge, equipement: 'machine',
  muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] });
const CATALOGUE = [
  fiche('presse', 'charge_reps', 'machine', ['quadriceps']),
  fiche('curl', 'charge_reps', 'machine', ['biceps']),
  fiche('rowing', 'charge_reps', 'machine', ['grand_dorsal']),
  fiche('tractions', 'reps', 'aucune', ['grand_dorsal']),
  fiche('tapis', 'temps', 'aucune', [])
];

// Une séance : `debut` (Date), ses séries `[slug, reps, type]`.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null });
    parSeance[id] = sp.series.map(([slug, reps, type], k) => ({ id: id + '-' + k, session_id: id, rang: k + 1,
      exercise_slug: slug, charge_kg: 50, reps, type_serie: type || 'travail', duree_s: slug === 'tapis' ? 600 : null }));
    parSeance[id].forEach((x) => series.push(x));
  });
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}
const habitudes = (specs) => Faits.creer().habitudes(corpus(specs));
// Le lundi 7 septembre 2026 + `j` jours, à 18 h.
const jour = (j, h) => new Date(2026, 8, 7 + j, h === undefined ? 18 : h);
const S = (slug, n, reps, type) => Array.from({ length: n }, () => [slug, reps, type]);

describe('66C — faits.habitudes (§5 quater.2)', () => {
  test('sans séance comptée : `null` ; une séance à UN seul exercice ne compte pas', () => {
    expect(Faits.creer().habitudes(corpus([]))).toBeNull();
    expect(habitudes([{ debut: jour(0), series: S('presse', 4, 10) }])).toBeNull();
  });

  test('la signature du déduit : deux exercices dont un seulement en ÉCHEC comptent ; la taille, elle, ne compte que le travail', () => {
    const h = habitudes([{ debut: jour(0), series: S('presse', 3, 10).concat(S('curl', 2, 8, 'echec')) }]);
    expect(h).not.toBeNull();
    expect(h.taille_de_seance).toBe(3);
    expect(h.series).toEqual({ presse: 3 });
    // Sans l'échec, une séance à un seul exercice : rien.
    expect(habitudes([{ debut: jour(0), series: S('presse', 3, 10).concat(S('curl', 2, 8, 'echauffement')) }])).toBeNull();
  });

  test('séances par semaine : la médiane PAIRE arrondie vers le haut (3 et 4 séances → 4)', () => {
    const deux = (j) => ({ debut: jour(j), series: S('presse', 3, 10).concat(S('curl', 3, 10)) });
    const h = habitudes([deux(0), deux(1), deux(2), deux(7), deux(8), deux(9), deux(10)]);
    expect(h.seances_par_semaine).toBe(4);
  });

  test('une semaine sans séance COMPTÉE n’entre pas dans la médiane (pas un zéro)', () => {
    const deux = (j) => ({ debut: jour(j), series: S('presse', 3, 10).concat(S('curl', 3, 10)) });
    // Une séance la 1ʳᵉ semaine, trois la 2ᵉ, et la 3ᵉ semaine une séance à un seul exercice (qui ne compte pas) :
    // la médiane de 1 et 3 vaut 2 ; avec un zéro pour la 3ᵉ semaine, elle tomberait à 1.
    const h = habitudes([deux(0), deux(7), deux(8), deux(9), { debut: jour(14), series: S('presse', 3, 10) }]);
    expect(h.seances_par_semaine).toBe(2);
  });

  test('le cardio n’entre ni dans la taille ni dans les reps ; une chauffe jamais ; les reps à 0 non plus', () => {
    const h = habitudes([{ debut: jour(0), series: S('tapis', 2, null).concat(S('presse', 1, 5, 'echauffement'),
      S('presse', 3, 10), S('curl', 2, 12), [['curl', 0, 'travail']], S('tractions', 2, 6)) }]);
    expect(h.taille_de_seance).toBe(8);
    expect(h.reps).toEqual({ curl: 12, presse: 10, tractions: 6 });
    expect(h.series).toEqual({ curl: 3, presse: 3, tractions: 2 });
    expect(Object.keys(h.reps)).not.toContain('tapis');
  });

  test('reps et séries : la médiane sur les séances comptées, arrondie comme le déduit', () => {
    const h = habitudes([
      { debut: jour(0), series: S('presse', 3, 10).concat(S('curl', 2, 8)) },
      { debut: jour(2), series: S('presse', 4, 11).concat(S('curl', 3, 8)) }
    ]);
    // presse : reps 10,10,10,11,11,11,11 → 11 ; séries 3 et 4 → 3,5 → 4. curl : séries 2 et 3 → 3.
    expect(h.reps.presse).toBe(11);
    expect(h.series).toEqual({ curl: 3, presse: 4 });
    // Taille : 5 et 7 → 6.
    expect(h.taille_de_seance).toBe(6);
  });

  test('la fenêtre finit à la DERNIÈRE séance, pas aujourd’hui : 84 jours en arrière, la 85ᵉ veille non', () => {
    const vieux = (d, n) => ({ debut: d, series: S('presse', n, 10).concat(S('curl', n, 10)) });
    // La dernière séance : le 1ᵉʳ mars 2025 (plus de 18 mois avant aujourd'hui) — les habitudes existent quand même.
    const h = habitudes([vieux(new Date(2025, 2, 1, 18), 2),
      // 83 jours avant : dans la fenêtre ; 84 jours avant : hors fenêtre (elle compte la dernière).
      vieux(new Date(2025, 2, 1 - 83, 18), 2), vieux(new Date(2025, 2, 1 - 84, 18), 9)]);
    expect(h).not.toBeNull();
    expect(h.series).toEqual({ curl: 2, presse: 2 });
    expect(h.taille_de_seance).toBe(4);
  });

  test('la signature est celle du programme déduit, lue au même endroit (`Routines.signatureDeSeance`)', () => {
    const R = globalThis.THRoutines;
    const mesures = { presse: 'charge_reps', curl: 'charge_reps', tapis: 'temps' };
    expect(R.signatureDeSeance({ series: [{ exercise_slug: 'presse', type_serie: 'travail' },
      { exercise_slug: 'curl', type_serie: 'echec' }] }, mesures)).toEqual({ presse: true, curl: true });
    expect(R.signatureDeSeance({ series: [{ exercise_slug: 'presse', type_serie: 'travail' },
      { exercise_slug: 'tapis', type_serie: 'travail' }] }, mesures)).toBeNull();
  });
});
