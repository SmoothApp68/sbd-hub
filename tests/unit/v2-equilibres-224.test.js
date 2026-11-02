/** @jest-environment node */
//
// 224 — QUAND UNE CARTE AJOUTE UN EXERCICE : AU BON ENDROIT, DANS LA BONNE ROUTINE, AVEC SES REPS (MOTEUR §9.27, amendé 224).
// La semaine d'Aurélien relevée le 31/10 : cinq routines (haut A, bas A, haut B, bas B, dos), du tapis au début et à la fin de
// plusieurs d'entre elles. Chaque fixture déclenche vraiment le chemin qu'elle nomme.

const H = require('./helpers-equilibres.js');
const { Eq, construire, entree } = H;
const R = require('../../v2/js/routines.js');

const fiche = (nom, prim, sec, schema, mouvement, equipement) => ({
  nom, muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: [],
  schema_mouvement: schema || null, mouvement: mouvement || null, equipement: equipement || 'machine'
});
const CAT = Object.assign({}, H.CAT, {
  rowing_assis_machine: fiche('Rowing assis (machine)', ['grand_dorsal', 'haut_du_dos'], ['biceps'], 'tirer_horizontal', null, 'machine'),
  tirage_vertical: fiche('Tirage vertical', ['grand_dorsal'], ['biceps'], 'tirer_vertical', null, 'poulie'),
  tirage_poitrine_machine: fiche('Tirage poitrine (machine)', ['grand_dorsal'], ['biceps'], 'tirer_vertical', null, 'machine'),
  presse_machine: fiche('Presse à cuisses', ['quadriceps', 'fessiers'], [], 'accroupir', null, 'machine'),
  planche: Object.assign(fiche('Planche', ['abdominaux'], [], 'gainage', null, 'poids_du_corps'), {})
});

// Une routine avec ses reps visées et, pour certains exercices, des séries au temps.
function rt(id, nom, lignes) {
  return { id, nom, exercices: lignes.map((l, i) => ({ exercise_slug: l[0], rang: i,
    series: Array.from({ length: l[1] }, () => (l[2] === 'temps' ? { type_serie: 'travail', duree_cible_s: 600 } : { type_serie: 'travail', reps_visees: l[2] === undefined ? 8 : l[2] })) })) };
}
const HAUT_A = rt('r-ha', 'Lundi — Haut A', [['developpe_couche_barre', 4], ['developpe_incline_halteres', 3], ['tractions', 3], ['developpe_militaire_barre', 2], ['elevations_laterales', 3], ['curl', 2]]);
const BAS_A = rt('r-ba', 'Mardi — Bas A (Squat)', [['tapis', 1, 'temps'], ['squat_barre', 4], ['presse_machine', 3], ['leg_extension', 3], ['leg_curl', 3]]);
const HAUT_B = rt('r-hb', 'Jeudi — Haut B', [['tapis', 1, 'temps'], ['developpe_incline_halteres', 3], ['tirage_vertical', 3], ['elevations_laterales', 3], ['extension_triceps', 2], ['tapis', 1, 'temps']]);
const BAS_B = rt('r-bb', 'Vendredi — Bas B', [['souleve_de_terre_roumain', 3], ['hip_thrust', 3], ['leg_curl', 3], ['leg_extension', 2]]);
const DOS = rt('r-do', 'Samedi — Dos', [['tractions', 3], ['rowing_assis_machine', 6, 10], ['tirage_poitrine_machine', 4, 12], ['oiseau', 3]]);
const ROUTINES = [HAUT_A, BAS_A, HAUT_B, BAS_B, DOS];

// 12 semaines : Bas A, Haut B, Bas B chaque semaine ; Haut A une semaine sur deux ; Dos une semaine sur trois (peu de tirage horizontal).
function semaine(i) {
  const s = [
    { routine: 'r-ba', exos: { squat_barre: 4, presse_machine: 3, leg_extension: 3, leg_curl: 3 } },
    { routine: 'r-bb', exos: { souleve_de_terre_roumain: 3, hip_thrust: 3, leg_curl: 3, leg_extension: 2 } }
  ];
  s.push({ routine: 'r-hb', exos: { developpe_incline_halteres: 3, tirage_vertical: 3, elevations_laterales: 3, extension_triceps: 2 } });
  if (i % 2 === 0) s.push({ routine: 'r-ha', exos: { developpe_couche_barre: 14, developpe_incline_halteres: 5, tractions: 2, developpe_militaire_barre: 2, elevations_laterales: 3, curl: 2 } });
  if (i % 3 === 0) s.push({ routine: 'r-do', exos: { tractions: 3, rowing_assis_machine: 6, tirage_poitrine_machine: 4, oiseau: 3 } });
  return s;
}
const base = () => { const sem = {}; for (let i = 0; i < 12; i++) sem[i] = semaine(i); return construire(sem); };
const analyse = (extra) => Eq.analyser(entree(base(), Object.assign({ catalogue: CAT, routines: ROUTINES, priorites: ['developpe_militaire_barre'] }, extra || {})));
const propositions = (a) => {
  const out = [];
  a.constats.forEach((c) => {
    (c.propositions || []).forEach((p) => out.push(p));
    (c.causes || []).forEach((x) => { if (x.proposition) out.push(x.proposition); (x.autres || []).forEach((p) => out.push(p)); });
  });
  return out.filter((p) => p && (p.type === 'ajouter' || p.type === 'repartir'));
};
const ajouts = (a) => {
  const out = [];
  propositions(a).forEach((p) => { if (p.type === 'ajouter') out.push(p); else (p.ajouts || []).forEach((x) => out.push(x)); });
  return out;
};
module.exports = { ROUTINES, CAT, analyse, ajouts, propositions, base, rt };

describe('224 — reproduction (les défauts, avant le fix)', () => {
  const trouve = (slug) => ajouts(analyse()).filter((p) => p.slug === slug)[0];
  const ecrit = (p, rid) => {
    const r = ROUTINES.filter((x) => x.id === (p.routine_id || rid))[0];
    return R.ajoutDExercice(r, p.slug, p.series || 1);
  };
  test('1. le rowing va dans une routine du bas (la plus fréquentée, sans regarder le côté)', () => {
    expect(trouve('rowing_assis_machine').routine_id).toBe('r-ba');
  });
  test('1 bis. le militaire va dans la même routine du bas', () => {
    expect(trouve('developpe_militaire_barre').routine_id).toBe('r-ba');
  });
  test('2. l’exercice arrive en fin de routine, après le tapis final', () => {
    const p = trouve('rowing_assis_machine');
    const v = ecrit(p);
    expect(v[v.length - 1].exercise_slug).toBe('rowing_assis_machine');
  });
  test('3. des séries sans reps visées', () => {
    const v = ecrit(trouve('rowing_assis_machine'));
    expect(v[v.length - 1].series.every((s) => s.reps === null)).toBe(true);
  });
  test('4. 6 séries : la médiane des séries par séance dans l’historique (la routine Dos en fait 6), transplantée telle quelle', () => {
    expect(trouve('rowing_assis_machine').series).toBe(6);
  });
});
