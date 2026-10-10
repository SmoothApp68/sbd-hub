/** @jest-environment node */
//
// 66B — LES GESTES DE « LE COACH RELIT TA SEMAINE » SUR UNE ROUTINE (QUESTIONNAIRE §5 ter.4 bis), en fonctions pures
// de `routines.js` : `retraitDeSeries` (« Retirer ces séries ») et `miseEnTete` (« En faire ma priorité »). Chacune
// rend la liste VOULUE complète d'une routine — celle que la file reçoit — ou `null` si la routine ne correspond
// plus à la proposition. L'entrée n'est jamais modifiée.

global.self = global;
require('../../v2/js/modele.js');
const Routines = require('../../v2/js/routines.js');

// Une série : 'c' chauffe, 't' travail, 'x' sans type (vaut travail), 'd' dégressive.
const TYPES = { c: 'echauffement', t: 'travail', d: 'degressive' };
const serie = (code, i) => (code === 'x' ? { id: 's' + i, reps: 10 } : { id: 's' + i, type_serie: TYPES[code], reps: 10 });
const exo = (id, slug, codes, groupe) => ({ id, exercise_slug: slug, groupe_superset: groupe === undefined ? null : groupe,
  repos_cible_s: 90, note: null, series: codes.split('').map(serie) });
const types = (e) => e.series.map((s) => s.type_serie || 'x').join(',');
const copie = (x) => JSON.parse(JSON.stringify(x));

describe('66B — retraitDeSeries (« Retirer ces séries »)', () => {
  const routine = () => ({ id: 'r1', nom: 'Bas', exercices: [
    exo('e1', 'squat_barre', 'cctttt'),
    exo('e2', 'extension_mollets_debout_machine', 'cttttd'),
    exo('e3', 'leg_curl_assis', 'ttt')
  ] });

  test('retire les DERNIÈRES séries de travail jusqu’à `a` ; les chauffes et la dégressive restent', () => {
    const r = routine();
    const v = Routines.retraitDeSeries(r, [{ exercise_slug: 'extension_mollets_debout_machine', de: 4, a: 2 }]);
    expect(v.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(types(v[1])).toBe('echauffement,travail,travail,degressive');
    // Les PREMIÈRES séries de travail restent (s1, s2), les dernières partent (s3, s4).
    expect(v[1].series.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's5']);
    // Le reste de la routine, intact.
    expect(v[0]).toEqual(r.exercices[0]);
    expect(v[2]).toEqual(r.exercices[2]);
  });

  test('une série sans type compte comme du travail (`Modele.estTravail`)', () => {
    const r = { id: 'r1', exercices: [exo('e1', 'curl_biceps_haltere', 'cxxx')] };
    const v = Routines.retraitDeSeries(r, [{ exercise_slug: 'curl_biceps_haltere', de: 3, a: 1 }]);
    expect(v[0].series.map((s) => s.id)).toEqual(['s0', 's1']);
  });

  test('deux exercices au même slug : celui qui a EXACTEMENT `de` séries de travail ; le premier s’il y en a deux', () => {
    const r = { id: 'r1', exercices: [exo('a', 'crunch', 'tt'), exo('b', 'crunch', 'tttt'), exo('c', 'crunch', 'tttt')] };
    const v = Routines.retraitDeSeries(r, [{ exercise_slug: 'crunch', de: 4, a: 3 }]);
    expect(v.map((e) => e.series.length)).toEqual([2, 3, 4]);
  });

  test('`de` qui ne correspond plus (la routine a changé) → `null` ; un slug absent → `null`', () => {
    expect(Routines.retraitDeSeries(routine(), [{ exercise_slug: 'extension_mollets_debout_machine', de: 5, a: 3 }])).toBeNull();
    expect(Routines.retraitDeSeries(routine(), [{ exercise_slug: 'absent', de: 3, a: 2 }])).toBeNull();
    // Une ligne bonne et une mauvaise : rien.
    expect(Routines.retraitDeSeries(routine(), [{ exercise_slug: 'leg_curl_assis', de: 3, a: 2 },
      { exercise_slug: 'extension_mollets_debout_machine', de: 9, a: 2 }])).toBeNull();
  });

  test('l’ordre et les groupes de superset intacts ; l’entrée jamais modifiée', () => {
    const r = { id: 'r1', exercices: [exo('e1', 'squat_barre', 'ttt'), exo('e2', 'curl_biceps_haltere', 'tttt', 1),
      exo('e3', 'extension_triceps_poulie_haute', 'tttt', 1)] };
    const avant = copie(r);
    const v = Routines.retraitDeSeries(r, [{ exercise_slug: 'curl_biceps_haltere', de: 4, a: 2 }]);
    expect(v.map((e) => [e.id, e.groupe_superset])).toEqual([['e1', null], ['e2', 1], ['e3', 1]]);
    expect(r).toEqual(avant);
  });
});

describe('66B — miseEnTete (« En faire ma priorité »)', () => {
  test('l’exercice seul passe juste avant `avant` ; un cardio de tête reste en tête', () => {
    const r = { id: 'r1', exercices: [exo('t', 'tapis_roulant', 't'), exo('a', 'presse_a_cuisses', 'ttt'),
      exo('b', 'leg_curl_assis', 'ttt'), exo('s', 'squat_barre', 'cttt')] };
    const avant = copie(r);
    const v = Routines.miseEnTete(r, 'squat_barre', 'presse_a_cuisses');
    expect(v.map((e) => e.id)).toEqual(['t', 's', 'a', 'b']);
    expect(v[1].series).toEqual(r.exercices[3].series);
    expect(r).toEqual(avant);
  });

  test('un superset se déplace EN ENTIER, avec son partenaire', () => {
    const r = { id: 'r1', exercices: [exo('a', 'presse_a_cuisses', 'ttt'), exo('s', 'squat_barre', 'ttt', 2),
      exo('p', 'tractions', 'ttt', 2), exo('b', 'leg_curl_assis', 'ttt')] };
    const v = Routines.miseEnTete(r, 'squat_barre', 'presse_a_cuisses');
    expect(v.map((e) => e.id)).toEqual(['s', 'p', 'a', 'b']);
    // Le groupe tient toujours (renuméroté de la nouvelle adjacence).
    expect(v[0].groupe_superset).not.toBeNull();
    expect(v[0].groupe_superset).toBe(v[1].groupe_superset);
    expect(v[2].groupe_superset).toBeNull();
  });

  test('`avant` dans un superset : l’insertion se fait avant le DÉBUT du groupe', () => {
    const r = { id: 'r1', exercices: [exo('x', 'presse_a_cuisses', 'ttt', 1), exo('a', 'developpe_couche_haltere', 'ttt', 1),
      exo('b', 'leg_curl_assis', 'ttt'), exo('s', 'squat_barre', 'ttt')] };
    const v = Routines.miseEnTete(r, 'squat_barre', 'developpe_couche_haltere');
    expect(v.map((e) => e.id)).toEqual(['s', 'x', 'a', 'b']);
    expect(v[1].groupe_superset).toBe(v[2].groupe_superset);
    expect(v[0].groupe_superset).toBeNull();
  });

  test('introuvable, ou déjà avant : `null` (rien à écrire)', () => {
    const r = { id: 'r1', exercices: [exo('s', 'squat_barre', 'ttt'), exo('a', 'presse_a_cuisses', 'ttt')] };
    expect(Routines.miseEnTete(r, 'squat_barre', 'presse_a_cuisses')).toBeNull();
    expect(Routines.miseEnTete(r, 'absent', 'presse_a_cuisses')).toBeNull();
    expect(Routines.miseEnTete(r, 'squat_barre', 'absent')).toBeNull();
    // Le squat et `avant` dans le même superset : déjà ensemble, rien à faire.
    const g = { id: 'r1', exercices: [exo('a', 'presse_a_cuisses', 'ttt', 1), exo('s', 'squat_barre', 'ttt', 1)] };
    expect(Routines.miseEnTete(g, 'squat_barre', 'presse_a_cuisses')).toBeNull();
  });
});
