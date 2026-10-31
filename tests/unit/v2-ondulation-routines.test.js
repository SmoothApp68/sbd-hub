/** @jest-environment node */
//
// 193-3 (commit 1) — LA ZONE D'UNE LIGNE DE ROUTINE (`routine_exercises.zone`, v2_122). Un choix explicite, NULL = Automatique ;
// jamais déduit des reps visées ; elle voyage avec la ligne (copie, brouillon, report de fin de séance, séance démarrée).

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const S = require('../../v2/js/seance.js');

const serie = (reps) => ({ type_serie: 'travail', reps, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
const ligne = (id, slug, zone, extra) => Object.assign({ id, exercise_slug: slug, rang: 0, repos_cible_s: null, groupe_superset: null,
  note: null, zone, series: [serie(4), serie(4)] }, extra || {});

describe('la colonne zone', () => {
  test('zoneValide : les cinq clés, sinon NULL (jamais deviné)', () => {
    ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'].forEach((z) => expect(R.zoneValide(z)).toBe(z));
    [null, undefined, '', 'Mix', 'constructor', 'pompe', 3].forEach((z) => expect(R.zoneValide(z)).toBeNull());
    expect(R.CHAMPS_EXERCICE).toContain('zone');
  });

  test('normaliserExercice : la zone part avec la ligne ; absente (intention d\'avant), elle ne part pas', () => {
    expect(R.normaliserExercice(ligne('a', 'squat_barre', 'mix'), 'r1', 0).zone).toBe('mix');
    expect(R.normaliserExercice(ligne('a', 'squat_barre', 'zzz'), 'r1', 0).zone).toBeNull();
    const ancienne = ligne('a', 'squat_barre', 'mix'); delete ancienne.zone;
    expect('zone' in R.normaliserExercice(ancienne, 'r1', 0)).toBe(false);
  });

  test('planEcritures : changer la zone est une mise à jour de la ligne ; ne rien changer n\'écrit rien ; une intention sans zone n\'efface pas', () => {
    const avant = [ligne('a', 'squat_barre', 'mix')];
    const plan = (apres) => R.planEcritures(avant, apres, 'r1', 'u1');
    expect(plan([ligne('a', 'squat_barre', 'lourd')]).majs).toEqual([{ id: 'a', champs: { zone: 'lourd' } }]);
    expect(plan([ligne('a', 'squat_barre', null)]).majs).toEqual([{ id: 'a', champs: { zone: null } }]);
    expect(plan([ligne('a', 'squat_barre', 'mix')]).majs).toEqual([]);
    const sansCle = ligne('a', 'squat_barre', 'mix'); delete sansCle.zone;
    expect(plan([sansCle]).majs).toEqual([]);
  });

  test('copie d\'une routine : la zone suit chaque ligne', () => {
    const copie = R.copieDeRoutine({ nom: 'x', exercices: [ligne('a', 'squat_barre', 'mix'), ligne('b', 'developpe_couche', null)] }, 'y');
    expect(copie.exercices.map((e) => e.zone)).toEqual(['mix', null]);
  });
});

describe('la zone dans la séance', () => {
  const routine = { id: 'r1', nom: 'Jeudi', exercices: [ligne('a', 'squat_barre', 'mix'), ligne('b', 'presse', null), ligne('c', 'curl', null)] };

  test('la séance démarrée copie la zone de la ligne dans zone_plan (figée) ; Automatique = null', () => {
    const s = S.creer({ id: 's1', routine, idSerie: () => 'x' + Math.random() });
    expect(s.exercices.map((e) => e.zone_plan)).toEqual(['mix', null, null]);
  });

  test('le report de fin de séance garde la zone de la ligne, pas le « juste pour aujourd\'hui »', () => {
    let s = S.creer({ id: 's1', routine, idSerie: () => 'x' + Math.random() });
    s = Object.assign({}, s, { exercices: s.exercices.map((e, i) => (i === 0 ? Object.assign({}, e, { zone_plan: 'lourd' }) : e)) });
    const v = S.ecartsRoutine(s, routine, { series: false });
    expect(v.voulues.map((x) => x.zone)).toEqual(['mix', null, null]);
  });

  test('une zone inconnue d\'une ligne ne devient jamais zone_plan', () => {
    const r = { id: 'r2', nom: 'X', exercices: [ligne('z', 'curl', 'inconnue')] };
    expect(S.creer({ id: 's2', routine: r, idSerie: () => 'y' }).exercices[0].zone_plan).toBeNull();
  });

  test('un exercice ajouté en séance n\'a pas de zone de routine', () => {
    let s = S.creer({ id: 's1', routine, idSerie: () => 'x' + Math.random() });
    s = Object.assign({}, s, { exercices: s.exercices.concat([{ exercise_slug: 'gainage', routine_exercise_id: null, series: [], groupe_superset: null }]) });
    const v = S.ecartsRoutine(s, routine, { series: false });
    expect(v.voulues[v.voulues.length - 1].zone).toBeNull();
  });
});

describe('« Juste pour aujourd\u2019hui » (la séance seulement)', () => {
  const routine = { id: 'r1', nom: 'Jeudi', exercices: [ligne('a', 'squat_barre', 'mix'), ligne('b', 'presse', null)] };
  const depart = () => S.creer({ id: 's1', routine, idSerie: () => 'x' + Math.random() });
  test('poserZoneDePlan réécrit la zone de CET exercice, sans toucher la séance d\u2019origine ni les autres', () => {
    const s = depart();
    const t = S.poserZoneDePlan(s, 0, 'lourd');
    expect(t.exercices.map((e) => e.zone_plan)).toEqual(['lourd', null]);
    expect(s.exercices.map((e) => e.zone_plan)).toEqual(['mix', null]);
    expect(S.poserZoneDePlan(t, 0, null).exercices[0].zone_plan).toBeNull();
    expect(S.poserZoneDePlan(t, 0, 'inconnue').exercices[0].zone_plan).toBeNull();
    expect(S.poserZoneDePlan(t, 9, 'mix')).toBe(t);
  });
  test('rien ne part en base : ni les séries ni la séance n\u2019ont de zone', () => {
    const t = S.poserZoneDePlan(depart(), 0, 'lourd');
    expect(JSON.stringify(S.lignes(t))).not.toMatch(/zone/);
  });
});
