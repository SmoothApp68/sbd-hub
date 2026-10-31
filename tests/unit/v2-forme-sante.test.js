/** @jest-environment node */
//
// 197 (MOTEUR §9.36) — FORME ET SANTÉ : le générateur (corps entier, 2 à 3 séances), 65 ans et plus (équilibre, puissance posée par le plan,
// I110 à I112), la semaine (`faits.semaineDeForme`), les phrases (aucune promesse médicale).
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');

const fiche = (equipement, mesure, prim, sec) => ({ equipement, mesure, muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: [] });
const CAT = {
  squat_goblet_haltere: fiche('haltere', 'charge_reps', ['quadriceps', 'fessiers'], ['adducteurs']),
  squat_poids_du_corps: fiche('aucun', 'reps', ['quadriceps', 'fessiers'], ['adducteurs']),
  rowing_haltere: fiche('haltere', 'charge_reps', ['grand_dorsal'], ['biceps', 'haut_du_dos']),
  pompes_inclinees: fiche('aucun', 'reps', ['pectoraux'], ['triceps', 'deltoide_anterieur']),
  souleve_de_terre_roumain_haltere: fiche('haltere', 'charge_reps', ['ischio_jambiers', 'fessiers'], ['bas_du_dos']),
  planche: fiche('aucun', 'temps', ['abdominaux'], []),
  equilibre_une_jambe: fiche('aucun', 'temps', ['mollets'], []),
  squat_barre: fiche('barre', 'charge_reps', ['quadriceps', 'fessiers'], ['adducteurs']),
  developpe_couche_barre: fiche('barre', 'charge_reps', ['pectoraux'], ['triceps', 'deltoide_anterieur'])
};
const BASE = { objectif: 'forme', jours: 3, materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const lignes = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));

describe('197 — le générateur « Forme et santé »', () => {
  test('3 jours : trois séances corps entier, jamais plus de 3 (même à 5 jours)', () => {
    expect(G.generer(CAT, BASE).map((r) => r.nom)).toEqual(['Corps entier A', 'Corps entier B', 'Corps entier C']);
    expect(G.generer(CAT, Object.assign({}, BASE, { jours: 5 })).length).toBe(3);
    expect(G.generer(CAT, Object.assign({}, BASE, { jours: 2 })).length).toBe(2);
  });
  test('squat ou fente, charnière, poussée, tirage, gainage ; 2-3 séries ; pas d’échec', () => {
    const r = G.generer(CAT, BASE)[0];
    const slugs = r.exercices.map((x) => x.exercise_slug);
    expect(slugs).toEqual(expect.arrayContaining(['squat_goblet_haltere', 'rowing_haltere', 'pompes_inclinees', 'souleve_de_terre_roumain_haltere', 'planche']));
    r.exercices.forEach((x) => { expect(x.series).toBeGreaterThanOrEqual(2); expect(x.series).toBeLessThanOrEqual(3); expect(x.au_max).toBeUndefined(); });
  });
  test('le gainage est une durée, pas des reps', () => {
    const p = G.generer(CAT, BASE)[0].exercices.filter((x) => x.exercise_slug === 'planche')[0];
    expect(p.reps).toBeNull();
    expect(p.duree_s).toBe(30);
  });
  test('sans porté au catalogue, la place saute sans rien inventer (relevé du 31/10)', () => {
    expect(lignes(G.generer(CAT, BASE)).length).toBe(3 * 5);
  });
  test('un autre objectif garde son gabarit (Force : pas de corps entier de forme)', () => {
    const f = G.generer(CAT, Object.assign({}, BASE, { objectif: 'force' }));
    expect(lignes(f).some((x) => x.exercise_slug === 'planche')).toBe(false);
  });
  test('65 ans et plus : un exercice d’équilibre par séance ; sinon aucun', () => {
    G.generer(CAT, Object.assign({}, BASE, { plus65: true })).forEach((r) => {
      expect(r.exercices.filter((x) => x.exercise_slug === 'equilibre_une_jambe').length).toBe(1);
    });
    [false, null, undefined].forEach((v) => {
      expect(lignes(G.generer(CAT, Object.assign({}, BASE, { plus65: v }))).some((x) => x.exercise_slug === 'equilibre_une_jambe')).toBe(false);
    });
  });
});

describe('197 — 65 ans et plus, lu sur la date de naissance', () => {
  const ref = new Date('2026-10-31T12:00:00Z');
  test('64 ans faux, 65 ans vrai, sans date : null (rien de deviné)', () => {
    expect(Profil.plus65DuProfil({ date_naissance: '1961-11-01' }, ref)).toBe(false);
    expect(Profil.plus65DuProfil({ date_naissance: '1961-10-31' }, ref)).toBe(true);
    expect(Profil.plus65DuProfil({}, ref)).toBeNull();
    expect(Profil.plus65DuProfil(null, ref)).toBeNull();
  });
});

describe('197 — la puissance, posée par le plan (I110 à I112)', () => {
  const POLY = { equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'], muscles_stabilisateurs: [] };
  const CAT2 = Object.assign({}, CAT, { squat_barre: CAT.squat_barre, squat_goblet_haltere: POLY });
  function seanceDe(slugs) {
    let k = 0; const id = () => 'f-' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    slugs.forEach((s) => { se = S.ajouterExercice(se, s, id, { series: 2 }); });
    return se;
  }
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: {}, reglage: 'normal', paris: [], objectif: 'forme', catalogue: CAT2, plus65: true, menagerProfil: []
  }, extra || {});
  const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;

  test('65 ans et plus : la phrase sur le premier polyarticulaire léger (jamais la barre)', () => {
    const se = seanceDe(['squat_barre', 'squat_goblet_haltere', 'planche']);
    const p = T.planDeSeance(entrees(se));
    expect(p.puissance.slug).toBe('squat_goblet_haltere');
    expect(p.puissance.texte).toBe('Monte vite, descends en contrôlant.');
    expect(erreurs(p, entrees(se)).filter((x) => /I11[0-2]/.test(x))).toEqual([]);
  });
  test('inconnu, faux, Édition, « Juste un carnet » : rien', () => {
    const se = seanceDe(['squat_goblet_haltere']);
    [null, false, undefined].forEach((v) => expect(T.planDeSeance(entrees(se, { plus65: v })).puissance).toBeNull());
    const ed = entrees(se); ed.seance.edition = true;
    expect(T.planDeSeance(ed).puissance).toBeNull();
  });
  test('une zone à ménager ou une douleur récente écarte l’exercice', () => {
    const se = seanceDe(['squat_goblet_haltere']);
    expect(T.planDeSeance(entrees(se, { menagerProfil: ['genou'] })).puissance).toBeNull();
  });
  test('I110 : une puissance sans âge connu est refusée', () => {
    const se = seanceDe(['squat_goblet_haltere']);
    const p = T.planDeSeance(entrees(se));
    expect(erreurs(p, entrees(se, { plus65: null })).join('|')).toMatch(/I110/);
  });
  test('I111 : une puissance sur une barre est refusée', () => {
    const se = seanceDe(['squat_barre']);
    const p = T.planDeSeance(entrees(se));
    p.puissance = { slug: 'squat_barre', texte: M.FORME_PUISSANCE_PHRASE, pourquoi: M.FORME_PUISSANCE_POURQUOI };
    expect(erreurs(p, entrees(se)).join('|')).toMatch(/I111 — la puissance sur une barre/);
  });
  test('I112 : une promesse médicale est refusée', () => {
    const se = seanceDe(['squat_goblet_haltere']);
    const p = T.planDeSeance(entrees(se));
    p.puissance = Object.assign({}, p.puissance, { pourquoi: 'Protège de l’ostéoporose.' });
    expect(erreurs(p, entrees(se)).join('|')).toMatch(/I112/);
  });
});

describe('197 — la semaine « Forme et santé » (`faits.semaineDeForme`)', () => {
  const CATS = { squat_goblet_haltere: CAT.squat_goblet_haltere, course: { nature: 'cardio', mesure: 'distance_temps', equipement: 'aucun', muscles_primaires: [] } };
  function corpus(seances, series) {
    return { seances, series: [].concat.apply([], Object.keys(series).map((k) => series[k])), seriesDe: (id) => series[id] || [], catalogue: () => CATS };
  }
  const travail = (slug, extra) => Object.assign({ exercise_slug: slug, type_serie: 'travail', validee_a: '2026-10-28T10:00:00Z' }, extra);
  const J = '2026-10-31T12:00:00Z'; // samedi ; lundi = 26/10
  test('renforcement : les jours de musculation ; cardio : minutes, l’intense compte double', () => {
    const seances = [{ id: 'a', debut: '2026-10-27T09:00:00Z' }, { id: 'b', debut: '2026-10-29T09:00:00Z' }, { id: 'c', debut: '2026-10-30T09:00:00Z' }, { id: 'ancienne', debut: '2026-10-20T09:00:00Z' }];
    const series = { a: [travail('squat_goblet_haltere', { reps: 10, charge_kg: 8 })], b: [travail('squat_goblet_haltere', { reps: 10, charge_kg: 8 })],
      c: [travail('course', { duree_s: 1800 }), travail('course', { duree_s: 1200, rpe: 9 })],
      ancienne: [travail('course', { duree_s: 3600 })] };
    const f = Faits.creer().semaineDeForme(corpus(seances, series), J);
    expect(f.renforcement).toEqual({ faites: 2, cible: 2 });
    expect(f.cardio.minutes).toBe(50);
    expect(f.cardio.equivalent).toBe(70);       // 30 + 20 x 2
    expect(f.cardio.intenses).toBe(20);
    expect(f.cardio.reste).toBe(80);
  });
  test('sans RPE, tout est modéré ; au-delà de la cible, le reste est 0 (jamais négatif)', () => {
    const f = Faits.creer().semaineDeForme(corpus([{ id: 'c', debut: '2026-10-30T09:00:00Z' }], { c: [travail('course', { duree_s: 10800 })] }), J);
    expect(f.cardio.equivalent).toBe(180);
    expect(f.cardio.reste).toBe(0);
  });
  test('une semaine vide : zéro partout, rien de négatif', () => {
    const f = Faits.creer().semaineDeForme(corpus([], {}), J);
    expect(f.renforcement.faites).toBe(0);
    expect(f.cardio.reste).toBe(150);
  });
});

describe('197 — les phrases : aucune promesse médicale', () => {
  const interdit = /gu[ée]ri|soign|ost[ée]opor|diab[èe]t|th[ée]rap|maladie|prévent|prevent|récupér/i;
  test('repères, puissance, douleur', () => {
    [M.FORME_REPERES_PHRASE, M.FORME_PUISSANCE_PHRASE, M.FORME_PUISSANCE_POURQUOI, M.FORME_DOULEUR_PHRASE].forEach((t) => expect(t).not.toMatch(interdit));
    expect(M.FORME_DOULEUR_PHRASE).toMatch(/avis d’un médecin ou d’un kiné/);
    expect(M.FORME_REPERES_PHRASE).toMatch(/repères généraux, pas une prescription/);
  });
});
