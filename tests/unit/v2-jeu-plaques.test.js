/** @jest-environment node */
//
// 273 — LES CAPS EN PLAQUES et LE CARNET DE JALONS (`jeu.js`, `faits.js`). Barre droite : 60, 100, 140, 180…
// (« N plaques ») ; tout le reste : un cap tous les 50 kg. Chauffes et reculs ne comptent pas. Le carnet est une
// lecture datée, du plus récent au plus ancien, sans aucun compte de séances.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Faits = require('../../v2/js/faits.js');
const Jeu = require('../../v2/js/jeu.js');

const AUJ = new Date(2026, 9, 9);
const jourDe = (ilYa) => new Date(2026, 9, 9 - ilYa, 18, 0, 0);
const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'curl_biceps_barre_ez', nom: 'Curl Biceps (Barre EZ)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  { slug: 'developpe_couche_haltere', nom: 'Développé Couché (Haltères)', mesure: 'charge_reps', charge: 'externe', equipement: 'haltere', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'presse_a_cuisses', nom: 'Presse à Cuisses', mesure: 'charge_reps', charge: 'machine', equipement: 'machine', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'traction_assistee', nom: 'Traction Assistée', mesure: 'charge_reps', charge: 'assistance', equipement: 'machine', muscles_primaires: ['grand_dorsal'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

function corpus(specs, journal) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null, titre: 'S' + i });
    parSeance[id] = sp.series.map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k,
      validee_a: sp.debut.toISOString() }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => INDEX, journal: journal || [] };
}
const s = (slug, kg, reps, extra) => Object.assign({ exercise_slug: slug, charge_kg: kg, reps }, extra || {});
const caps = (c) => Jeu.etatDuJeu(Faits.creer().faitsDuJeu(c, AUJ)).succes.ids.filter((id) => id.indexOf('cap-') === 0);
const de = (slug, kg, reps, extra) => caps(corpus([{ debut: jourDe(3), series: [s(slug, kg, reps || 1, extra)] }])).filter((id) => id.indexOf('cap-' + slug + '-') === 0);

describe('273 — les caps en plaques', () => {
  test('barre droite : 59 rien, 60 une plaque, 100, 139, 140 trois plaques', () => {
    expect(de('squat_barre', 59)).toEqual([]);
    expect(de('squat_barre', 60)).toEqual(['cap-squat_barre-60']);
    expect(de('squat_barre', 100)).toEqual(['cap-squat_barre-60', 'cap-squat_barre-100']);
    expect(de('squat_barre', 139)).toEqual(['cap-squat_barre-60', 'cap-squat_barre-100']);
    expect(de('squat_barre', 140)).toEqual(['cap-squat_barre-60', 'cap-squat_barre-100', 'cap-squat_barre-140']);
  });
  test('le libellé en plaques : 60 → 1, 100 → 2, 140 → 3', () => {
    expect([60, 100, 140, 180].map((k) => Jeu.plaquesDuCap(INDEX.squat_barre, 'squat_barre', k))).toEqual([1, 2, 3, 4]);
    expect(Jeu.plaquesDuCap(INDEX.presse_a_cuisses, 'presse_a_cuisses', 100)).toBeNull();
    expect(Jeu.plaquesDuCap(INDEX.curl_biceps_barre_ez, 'curl_biceps_barre_ez', 100)).toBeNull();
  });
  test('haltères : la paire, 2 × 25 = 50 → le cap 50 ; 2 × 22,5 = 45 → aucun', () => {
    expect(de('developpe_couche_haltere', 50)).toEqual(['cap-developpe_couche_haltere-50']);
    expect(de('developpe_couche_haltere', 45)).toEqual([]);
  });
  test('machine : 140 → les caps 50 et 100 ; la barre EZ est « le reste »', () => {
    expect(de('presse_a_cuisses', 140)).toEqual(['cap-presse_a_cuisses-50', 'cap-presse_a_cuisses-100']);
    expect(de('curl_biceps_barre_ez', 60)).toEqual(['cap-curl_biceps_barre_ez-50']);
  });
  test('une chauffe à 60 est exclue, un recul aussi, une aide n’est pas une charge', () => {
    expect(de('squat_barre', 60, 5, { type_serie: 'echauffement' })).toEqual([]);
    expect(de('squat_barre', 100, 3, { type_serie: 'recul' })).toEqual([]);
    expect(de('traction_assistee', 80, 5)).toEqual([]);
  });
  test('un cap se gagne dès 1 rep, sans fenêtre de 12 mois', () => {
    const c = corpus([{ debut: new Date(2024, 0, 10, 18), series: [s('presse_a_cuisses', 100, 1)] }]);
    expect(caps(c)).toEqual(['cap-presse_a_cuisses-50', 'cap-presse_a_cuisses-100']);
  });
  test('descriptionDuSucces : les ids des deux règles, jamais 40 ni 55', () => {
    ['cap-squat_barre-60', 'cap-squat_barre-100', 'cap-presse_a_cuisses-150', 'cap-squat_barre-180'].forEach((id) =>
      expect(Jeu.descriptionDuSucces(id).categorie).toBe('cap'));
    ['cap-squat_barre-40', 'cap-squat_barre-55', 'cap-squat_barre-120'].forEach((id) => expect(Jeu.descriptionDuSucces(id)).toBeNull());
  });
});

describe('273 — le carnet de jalons', () => {
  const journal = [
    { set_id: 's1-0', session_id: 's1', exercise_slug: 'developpe_couche_barre', type: 'charge_max', charge: 100, reps: 3, valeur: 100, battu_le: jourDe(5).toISOString() },
    { set_id: 's1-0', session_id: 's1', exercise_slug: 'developpe_couche_barre', type: 'charge_a_reps', charge: 100, reps: 3, battu_le: jourDe(5).toISOString() },
    { set_id: 's2-0', session_id: 's2', exercise_slug: 'presse_a_cuisses', type: 'charge_max', charge: 300, reps: 8, battu_le: jourDe(1).toISOString() }
  ];
  const c = corpus([
    { debut: jourDe(20), series: [s('squat_barre', 60, 5), s('squat_barre', 100, 3)] },
    { debut: jourDe(10), series: [s('squat_barre', 140, 3), s('squat_barre', 100, 5)] },
    { debut: jourDe(5), series: [s('developpe_couche_barre', 100, 3)] },
    { debut: jourDe(1), series: [s('presse_a_cuisses', 300, 8)] }
  ], journal);
  const lignes = Jeu.carnet(Faits.creer().faitsDuJeu(c, AUJ));

  test('trié du plus récent au plus ancien, la date d’un cap est celle de la première série qui l’a atteint', () => {
    const t = lignes.map((l) => Date.parse(l.date));
    expect(t).toEqual(t.slice().sort((a, b) => b - a));
    const sq = lignes.filter((l) => l.sorte === 'cap' && l.slug === 'squat_barre');
    expect(sq.map((l) => [l.kg, l.plaques, l.charge, l.reps, l.date === jourDe(20).toISOString() ? 'tôt' : 'tard'])).toEqual([
      [140, 3, 140, 3, 'tard'], [100, 2, 100, 3, 'tôt'], [60, 1, 60, 5, 'tôt']]);
  });
  test('le cap en or d’une machine : 300 kg × 8, le dernier cap de la presse (50 à 300)', () => {
    const p = lignes.filter((l) => l.slug === 'presse_a_cuisses' && l.sorte === 'cap');
    expect(p.length).toBe(6);
    expect(p[0]).toMatchObject({ kg: 300, plaques: null, charge: 300, reps: 8 });
  });
  test('les records des grandes barres seulement (le couché ici), pas ceux de la presse ni les autres types', () => {
    const r = lignes.filter((l) => l.sorte === 'record');
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ slug: 'developpe_couche_barre', charge: 100, reps: 3 });
  });
  test('aucun compte de séances, aucune série de semaines : seulement des caps et des records', () => {
    expect(new Set(lignes.map((l) => l.sorte))).toEqual(new Set(['cap', 'record']));
    expect(JSON.stringify(lignes)).not.toMatch(/seances|semaines|serie/);
  });
});
