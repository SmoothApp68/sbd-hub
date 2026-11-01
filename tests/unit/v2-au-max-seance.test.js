/** @jest-environment node */
//
// 193-6 (MOTEUR §9.30, v2_123) — « AU MAX » côté séance, routines et faits :
//   la marque vient de la routine ; le menu ⋯ ne touche pas la routine ; « + Série » s'insère avant ; la réserve demandée part
//   en base ; l'arrivée ou le retrait de la marque exclut l'exercice de la fatigue (I87) ; « J'ai mal » récent ; « une série de moins ».

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const Moteur = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const R = require('../../v2/js/routines.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/bilan.js');
require('../../v2/js/semaine.js');
const F = require('../../v2/js/faits.js').creer();

let k = 0;
const id = () => 'i' + (++k);
const routine = (marque) => ({
  id: 'R',
  exercices: [{ id: 'RE', exercise_slug: 'x', repos_cible_s: 90, groupe_superset: null, note: null,
    series: [0, 1, 2].map((j) => ({ type_serie: 'travail', reps: 8, au_max: marque && j === 2 })) }]
});

describe('la marque vient de la routine, elle est unique, elle reste la dernière', () => {
  test('exerciceDepuisRoutine copie `au_max` de la ligne de routine', () => {
    const se = S.creer({ id: 'S', userId: 'u', idSerie: id, routine: routine(true) });
    expect(se.exercices[0].series.map((s) => s.au_max)).toEqual([false, false, true]);
    expect(S.creer({ id: 'S', userId: 'u', idSerie: id, routine: routine(false) }).exercices[0].series.every((s) => s.au_max === false)).toBe(true);
  });
  test('le menu ⋯ : poser la marque la retire des autres lignes et n’écrit pas la routine', () => {
    const r = routine(true);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id, routine: r });
    se = S.definirAuMax(se, 0, 1, true);
    expect(se.exercices[0].series.map((s) => s.au_max)).toEqual([false, true, false]);
    se = S.definirAuMax(se, 0, 1, false);
    expect(se.exercices[0].series.some((s) => s.au_max)).toBe(false);
    expect(r.exercices[0].series[2].au_max).toBe(true);   // la routine n’a pas bougé
  });
  test('« + Série » s’insère AVANT la ligne « Au max »', () => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id, routine: routine(true) });
    se = S.ajouterSerie(se, 0, id);
    expect(se.exercices[0].series.map((s) => s.au_max)).toEqual([false, false, false, true]);
  });
  test('la réserve demandée s’écrit à la validation, part en base, et retirer la marque l’efface', () => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id, routine: routine(true) });
    se = S.poserAuMaxReserve(se, 0, 2, 0);
    expect(se.exercices[0].series[2].au_max_reserve).toBe(0);
    expect(S.COLONNES_SET).toContain('au_max_reserve');
    const rows = S.lignes(S.valider(S.modifierSerie(se, 0, 2, { charge_kg: 100, reps: 10 }), 0, 2, new Date('2026-10-31T10:00:00Z')));
    expect(rows.find((r) => r.reps === 10).au_max_reserve).toBe(0);
    expect(rows.filter((r) => r.au_max_reserve !== null)).toHaveLength(1);
    // une série sans marque n’écrit jamais de réserve
    expect(S.poserAuMaxReserve(se, 0, 0, 1).exercices[0].series[0].au_max_reserve).toBeNull();
    // retirée : la réserve s’efface
    const retiree = S.definirAuMax(se, 0, 2, false);
    expect(retiree.exercices[0].series[2].au_max_reserve).toBeNull();
  });
});

describe('routines : la marque passe par le chemin des routines', () => {
  test('enSaisie et normaliserSerie portent `au_max`, `false` compris', () => {
    expect(R.CHAMPS_SERIE).toContain('au_max');
    expect(R.enSaisie({ type_serie: 'travail', reps_visees: 8, au_max: true }).au_max).toBe(true);
    expect(R.enSaisie({ type_serie: 'travail', reps_visees: 8 }).au_max).toBe(false);
    expect(R.normaliserSerie({ type_serie: 'travail', reps: 8, au_max: true }, 'RE', 3, 'u').au_max).toBe(true);
    expect(R.normaliserSerie({ type_serie: 'travail', reps: 8 }, 'RE', 3, 'u').au_max).toBe(false);
  });
});

describe('routines : poser la marque, la série de plus, le mot de la ligne', () => {
  const rt = (marque) => ({ id: 'R', exercices: [{ id: 'RE', exercise_slug: 'x', series: [
    { type_serie: 'echauffement', reps: 10 }, { type_serie: 'travail', reps: 8 }, { type_serie: 'travail', reps: 8 },
    { type_serie: 'recul', reps: 10, au_max: marque }] }] });
  test('marquerAuMax : la dernière série de travail ou de recul, une seule, et on la retire', () => {
    const v = R.marquerAuMax(rt(false), 'x', true);
    expect(v[0].series.map((q) => !!q.au_max)).toEqual([false, false, false, true]);
    const w = R.marquerAuMax({ id: 'R', exercices: [{ id: 'RE', exercise_slug: 'x', series: [
      { type_serie: 'travail', reps: 8, au_max: true }, { type_serie: 'travail', reps: 8 }] }] }, 'x', true);
    expect(w[0].series.map((q) => !!q.au_max)).toEqual([false, true]);
    expect(R.marquerAuMax(rt(true), 'x', false)[0].series.some((q) => q.au_max)).toBe(false);
    expect(R.marquerAuMax(rt(true), 'absent', true)).toBeNull();
  });
  test('la série de plus se place AVANT la ligne « Au max » et ne la copie pas', () => {
    const r = { id: 'R', exercices: [{ id: 'RE', exercise_slug: 'x', series: [
      { type_serie: 'travail', reps: 8 }, { type_serie: 'travail', reps: 8, au_max: true }] }] };
    const v = R.ajoutDeSerie(r, 'x');
    expect(v[0].series.map((q) => !!q.au_max)).toEqual([false, false, true]);
  });
  test('200-4 — « Au max » seulement à l’échec ; en gardant N reps, le mot dit « garde N »', () => {
    const Mo = require('../../v2/js/modele.js');
    expect(Mo.motDEchec({ type_serie: 'travail', au_max_reserve: 0 })).toBe('Au max');
    expect(Mo.motDEchec({ type_serie: 'travail', au_max_reserve: 1 })).toBe('garde 1');
    expect(Mo.motDEchec({ type_serie: 'recul', au_max_reserve: 2 })).toBe('recul · garde 2');
  });

  test('le mot de la ligne : « Au max », « recul · au max »', () => {
    const Mo = require('../../v2/js/modele.js');
    expect(Mo.motDEchec({ type_serie: 'travail', au_max: true })).toBe('Au max');
    expect(Mo.motDEchec({ type_serie: 'recul', au_max_reserve: 0 })).toBe('recul · au max');
    expect(Mo.motDEchec({ type_serie: 'recul' })).toBe('recul');
    expect(Mo.motDEchec({ type_serie: 'travail' })).toBeNull();
  });
});

describe('une série de moins (189) garde la ligne « Au max »', () => {
  test('la ligne du milieu part', () => {
    const lignes = [{ iSerie: 0, type: 'travail', validee: false }, { iSerie: 1, type: 'travail', validee: false },
                    { iSerie: 2, type: 'travail', validee: false, auMax: { reserve: 0 } }];
    const plan = { exercices: [{ iExo: 0, lignes, consigne: { serieDeMoins: { routine: 3, series: 2 } } }] };
    expect(T.lignesAEnlever(plan, 0)).toEqual([{ iExo: 0, iSerie: 1 }]);
  });
});

describe('faits : « J’ai mal » récent et la fatigue (I87)', () => {
  const seances = [
    { id: 'a', debut: '2026-10-01T10:00:00Z' }, { id: 'b', debut: '2026-10-08T10:00:00Z' }, { id: 'c', debut: '2026-10-15T10:00:00Z' }
  ];
  const sets = (marqueDeC) => ({
    a: [{ exercise_slug: 'x', charge_kg: 100, reps: 8, type_serie: 'travail' }],
    b: [{ exercise_slug: 'x', charge_kg: 100, reps: 8, type_serie: 'travail', douleur: true }],
    c: [{ exercise_slug: 'x', charge_kg: 100, reps: 8, type_serie: 'travail' },
        { exercise_slug: 'x', charge_kg: 100, reps: 12, type_serie: 'travail', au_max_reserve: marqueDeC ? 0 : null }]
  });
  const corpus = (m) => ({ seances, seriesDe: (i) => sets(m)[i] || [] });
  test('douleursParExercice : les 42 derniers jours', () => {
    expect(F.douleursParExercice(corpus(), '2026-10-20')).toEqual({ x: ['2026-10-08'] });
    expect(F.douleursParExercice(corpus(), '2026-12-30')).toEqual({});
  });
  test('l’arrivée de la marque met le jour de la séance dans `blocs` ; sans bascule, rien', () => {
    const avec = F.entreeFatigue(corpus(true), { jour: '2026-10-20', zones: [] }).exercices.find((e) => e.slug === 'x');
    expect(avec.blocs).toEqual(['2026-10-15']);
    const sans = F.entreeFatigue(corpus(false), { jour: '2026-10-20', zones: [] }).exercices.find((e) => e.slug === 'x');
    expect(sans.blocs).toEqual([]);
  });
});
