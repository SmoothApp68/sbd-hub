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
// Les reps de l'historique du rowing : 10 (la ligne vaut mieux que le 8 des autres) — la carte reprend 10, pas un nombre fixe.
const base = () => {
  const sem = {}; for (let i = 0; i < 12; i++) sem[i] = semaine(i);
  const b = construire(sem);
  b.series.forEach((x) => { if (x.exercise_slug === 'rowing_assis_machine') x.reps = 10; });
  return b;
};
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

const trouve = (slug, a) => ajouts(a || analyse()).filter((p) => p.slug === slug)[0];
const routineDe = (id) => ROUTINES.filter((x) => x.id === id)[0];
const ecrit = (p) => R.ajoutDExercice(routineDe(p.routine_id), p.slug, p.series, { reps: p.reps, cat: CAT });
const BAS = ['r-ba', 'r-bb'];

describe('224 — la routine : le bon côté, la bonne famille, puis la plus fréquentée', () => {
  test('le rowing va dans « Jeudi — Haut B » (le tirage vertical y est : même famille, la plus fréquentée), jamais dans une routine du bas', () => {
    const p = trouve('rowing_assis_machine');
    expect(p.routine_id).toBe('r-hb');
    expect(BAS).not.toContain(p.routine_id);
  });
  test('le militaire n’entre jamais dans une routine du bas', () => {
    const p = trouve('developpe_militaire_barre');
    expect(p.routine_id).toBe('r-hb');
  });
  test('⚠️ aucune routine du bon côté : pas de proposition « ajouter » (profil sans routine du haut qui n’a pas le rowing)', () => {
    const a = analyse({ routines: [BAS_A, BAS_B, DOS] });
    expect(ajouts(a).filter((p) => p.slug === 'rowing_assis_machine')).toEqual([]);
    const sans = analyse({ routines: [BAS_A, BAS_B] });
    expect(propositions(sans).filter((p) => p.type === 'ajouter')).toEqual([]);
  });
  test('un exercice du bas va dans une routine du bas, jamais dans une routine du haut', () => {
    const lignes = (id, nom, l) => rt(id, nom, l);
    const HAUT = lignes('r-h', 'Haut', [['developpe_couche_barre', 4], ['tractions', 3]]);
    const BAS1 = lignes('r-b1', 'Bas 1', [['squat_barre', 4]]);
    const a = Eq.analyser(entree(base(), { catalogue: CAT, routines: [HAUT, BAS1] , priorites: ['squat_barre'] }));
    ajouts(a).forEach((p) => { if (['leg_curl', 'leg_extension', 'hip_thrust', 'souleve_de_terre_roumain', 'presse_machine'].indexOf(p.slug) >= 0) expect(p.routine_id).toBe('r-b1'); });
  });
});

describe('224 — la place : après la famille, avant les finitions, jamais après un cardio final', () => {
  test('le rowing arrive juste après le tirage vertical, avant le tapis final', () => {
    const v = ecrit(trouve('rowing_assis_machine'));
    const slugs = v.map((x) => x.exercise_slug);
    expect(slugs).toEqual(['tapis', 'developpe_incline_halteres', 'tirage_vertical', 'rowing_assis_machine', 'elevations_laterales', 'extension_triceps', 'tapis']);
  });
  test('sans exercice de la famille, avant les finitions de fin de séance (le tapis du début n’est pas une finition)', () => {
    const v = ecrit(trouve('developpe_militaire_barre'));
    const slugs = v.map((x) => x.exercise_slug);
    expect(slugs).toEqual(['tapis', 'developpe_incline_halteres', 'tirage_vertical', 'elevations_laterales', 'extension_triceps', 'developpe_militaire_barre', 'tapis']);
    expect(slugs[slugs.length - 1]).toBe('tapis');
  });
  test('placeDAjout : une suite de finitions (cardio, exercice au temps, gainage) ferme la routine ; un superset reste entier', () => {
    const r = { id: 'x', nom: 'X', exercices: [
      { exercise_slug: 'developpe_couche_barre', series: [{ type_serie: 'travail' }], groupe_superset: 1 },
      { exercise_slug: 'tractions', series: [{ type_serie: 'travail' }], groupe_superset: 1 },
      { exercise_slug: 'curl', series: [{ type_serie: 'travail' }], groupe_superset: null },
      { exercise_slug: 'planche', series: [{ type_serie: 'travail', duree_s: 45 }], groupe_superset: null },
      { exercise_slug: 'tapis', series: [{ type_serie: 'travail', duree_s: 600 }], groupe_superset: null }
    ] };
    expect(R.placeDAjout(r, 'rowing_assis_machine', CAT)).toEqual({ index: 2, apres: 'tractions', avant: 'curl' });         // après le dernier grand dorsal
    expect(R.placeDAjout(r, 'extension_triceps', CAT)).toEqual({ index: 3, apres: 'curl', avant: 'planche' });             // aucun triceps principal : avant la planche et le tapis
    expect(R.placeDAjout(r, 'oiseau', CAT)).toEqual({ index: 3, apres: 'curl', avant: 'planche' });
    expect(R.placeDAjout({ exercices: [] }, 'oiseau', CAT)).toEqual({ index: 0, apres: null, avant: null });
    // Sans catalogue, les séries au temps suffisent à reconnaître les finitions ; sans elles, la fin de la routine.
    expect(R.placeDAjout(r, 'oiseau', null).index).toBe(3);
    expect(R.placeDAjout({ exercices: r.exercices.slice(0, 3) }, 'oiseau', null).index).toBe(3);
  });
  test('la famille trouvée dans les finitions finales est ramenée avant elles', () => {
    const r = { id: 'x', nom: 'X', exercices: [
      { exercise_slug: 'curl', series: [{ type_serie: 'travail' }] },
      { exercise_slug: 'planche', series: [{ type_serie: 'travail', duree_s: 45 }] }
    ] };
    expect(R.placeDAjout(r, 'planche', CAT).index).toBe(1);
  });
});

describe('224 — les séries : 2 de travail, avec les reps de l’historique', () => {
  test('2 séries (« commencer petit »), jamais les 6 de la routine Dos', () => {
    expect(trouve('rowing_assis_machine').series).toBe(2);
    expect(trouve('developpe_militaire_barre').series).toBe(2);
  });
  test('chaque série porte les reps visées de la dernière séance de l’exercice (10 pour le rowing, 8 pour le militaire) — jamais une ligne sans reps', () => {
    const p = trouve('rowing_assis_machine');
    expect(p.reps).toBe(10);
    const v = ecrit(p);
    const ligne = v.filter((x) => x.exercise_slug === 'rowing_assis_machine')[0];
    expect(ligne.series).toHaveLength(2);
    expect(ligne.series.every((s) => s.type_serie === 'travail' && s.reps === 10 && s.charge_kg === null)).toBe(true);   // la charge reste au moteur
    ajouts(analyse()).forEach((x) => { expect(x.reps).toBeGreaterThanOrEqual(1); });
  });
  test('un exercice sans aucune rep dans l’historique : pas de proposition (jamais « -x- »)', () => {
    const b = base();
    b.series.forEach((x) => { if (x.exercise_slug === 'rowing_assis_machine') x.reps = null; });
    const a = Eq.analyser(entree(b, { catalogue: CAT, routines: ROUTINES }));
    expect(ajouts(a).filter((p) => p.slug === 'rowing_assis_machine')).toEqual([]);
  });
});

describe('224 — la carte dit tout avant le geste, le « Fait » dit la même chose', () => {
  test('« Ajouter Rowing assis (machine), 2 × 10, à « Jeudi — Haut B », après Tirage vertical. »', () => {
    const p = trouve('rowing_assis_machine');
    expect(p.libelle).toBe('Ajouter Rowing assis (machine), 2 × 10, à « Jeudi — Haut B », après Tirage vertical.');
  });
  test('le texte de la carte = la place réelle de l’écriture', () => {
    ajouts(analyse()).forEach((p) => {
      const v = ecrit(p);
      const i = v.findIndex((x) => x.exercise_slug === p.slug);
      if (p.apres) expect(v[i - 1].exercise_slug).toBe(p.apres); else expect(i).toBe(0);
      if (p.avant) expect(v[i + 1].exercise_slug).toBe(p.avant); else expect(i).toBe(v.length - 1);
    });
  });
  test('le « Fait : … » dit la même chose', () => {
    const p = trouve('rowing_assis_machine');
    const nommes = Object.keys(CAT).reduce((o, k) => Object.assign(o, { [k]: Object.assign({ slug: k }, CAT[k]) }), {});
    expect(Eq.faitDAjout(nommes, { slug: p.slug, series: p.series, reps: p.reps, nomRoutine: p.nomRoutine, apres: p.apres, avant: p.avant }))
      .toBe('Fait : Rowing assis (machine), 2 × 10, est dans « Jeudi — Haut B », après Tirage vertical.');
  });
  test('en dernier : le texte le dit', () => {
    const nommes = { a: { nom: 'A' } };
    expect(Eq.faitDAjout(nommes, { slug: 'a', series: 2, reps: 8, nomRoutine: 'R', apres: null, avant: null })).toBe('Fait : A, 2 × 8, est dans « R », en dernier.');
  });
});
