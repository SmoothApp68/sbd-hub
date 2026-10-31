/** @jest-environment node */
//
// 193-5 (MOTEUR §9.28) — LE PLAN DES RECULS SUR LE MAX DU JOUR : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan` I78/I82,
// `verifierPhrases` I26). Réglage Franc : la visée du Lourd est une marge de 1.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const sp = (t) => t.replace(/[  ]/g, ' ');

function seance(reculs, repsGrosse, repsRecul) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'sq', id, { series: 1 + reculs });
  se.exercices[0].series.forEach((s, i) => {
    if (i >= 1) { s.type_serie = 'recul'; s.reps_visees = repsRecul; } else s.reps_visees = repsGrosse;
  });
  return se;
}
function entrees(se, palier, repsGrosse, extra) {
  const consigne = { etat: 'progression', zone: 'lourd', palier: palier, n: 1, ligne: { charge: palier, vise: repsGrosse }, haut: null };
  return Object.assign({
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { sq: { consigne: consigne, contexte: { cran: palier + 2.5, haut: null } } },
    reglage: 'franc', paris: [],
    catalogue: { sq: { equipement: 'barre', mesure: 'charge_reps', pas: 2.5 } }
  }, extra || {});
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

describe('193-5 — le plan : le recul sur le max du jour', () => {
  test('132,5 × 4 puis deux reculs × 8 : 112,5 kg, le fantôme, la phrase, le Pourquoi, le fondement du pari', () => {
    const e = entrees(seance(2, 4, 8), 132.5, 4);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    const R = x.reculs;
    expect(R.mode).toBe('max_du_jour');
    expect(R.charge).toBe(112.5);
    expect(R.max_du_jour).toBe(154);
    expect(R.marge).toBe(1);
    expect(R.correction).toBe(0);
    expect(sp(R.phrase)).toBe('Recul : 112,5 kg, 74 % de ton max du jour.');
    expect(sp(R.pourquoi)).toBe('Ta grosse série, 132,5 kg × 4 en gardant 1 rep, dit que ton max du jour est d’environ 154 kg. ' +
      'Pour 8 reps en en gardant 2, c’est 74 % : 112,5 kg.');
    x.lignes.slice(1).forEach((l) => expect(l.fantome).toEqual({ charge: 112.5, reps: null, source: 'recul' }));
    const f = x.paris[1].fondement;
    expect([f.max_du_jour, f.marge, f.correction, f.ecart > 0.15]).toEqual([154, 1, 0, true]);   // rien de retiré : grosse et écart restent
    expect(f.grosse).toBe(132.5);
    propre(p, e);
  });

  test('squat 135 × 4, reculs × 6 → 122,5 ; soulevé 170 × 4, reculs × 5 → 160', () => {
    const a = T.planDeSeance(entrees(seance(1, 4, 6), 135, 4));
    expect(a.exercices[0].reculs.charge).toBe(122.5);
    const b = T.planDeSeance(entrees(seance(1, 4, 5), 170, 4));
    expect(b.exercices[0].reculs.charge).toBe(160);
  });

  test('RECALCUL : la grosse série validée à 135 × 4 (RPE 9, marge 1) → les reculs suivent (115)', () => {
    let se = seance(2, 4, 8);
    const avant = T.planDeSeance(entrees(se, 132.5, 4)).exercices[0].lignes[1].fantome.charge;
    se = S.modifierSerie(se, 0, 0, { charge_kg: 135, reps: 4 });
    se = S.definirEffort(se, 0, 0, { rpe: 9 });
    se = S.valider(se, 0, 0, new Date('2026-10-31T10:30:00Z'));
    const e = entrees(se, 132.5, 4);
    const p = T.planDeSeance(e);
    expect(avant).toBe(112.5);
    expect(p.exercices[0].reculs.grosse).toBe(135);
    expect(p.exercices[0].lignes[1].fantome.charge).toBe(115);
    expect(p.exercices[0].reculs.marge).toBe(1);
    propre(p, e);
  });

  test('la marge NOTÉE l’emporte sur la visée : la grosse validée à l’échec (marge 0) → max plus bas, recul plus léger', () => {
    let se = seance(1, 4, 8);
    se = S.modifierSerie(se, 0, 0, { charge_kg: 132.5, reps: 4 });
    se = S.definirEffort(se, 0, 0, { rpe: 10 });
    se = S.valider(se, 0, 0, new Date('2026-10-31T10:30:00Z'));
    const e = entrees(se, 132.5, 4);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].reculs.marge).toBe(0);
    expect(p.exercices[0].reculs.charge).toBe(110);
    expect(sp(p.exercices[0].reculs.pourquoi)).toMatch(/132,5 kg × 4 sans marge/);
    propre(p, e);
  });

  test('la correction personnelle : une dernière séance à 12 reps → +2,5 % (117,5 kg pour 135 × 4), dite dans le Pourquoi', () => {
    const prec = { cible: 8, series: [{ charge_kg: 132.5, reps: 4, type_serie: 'travail', rpe: 9 },
      { charge_kg: 112.5, reps: 12, type_serie: 'recul', rpe: 8 }] };
    prec.historique = [JSON.parse(JSON.stringify(prec))];
    const e = entrees(seance(1, 4, 8), 135, 4, { reculs: { sq: prec } });
    const p = T.planDeSeance(e);
    const R = p.exercices[0].reculs;
    expect(R.correction).toBe(0.025);
    expect(R.charge).toBe(117.5);
    expect(sp(R.pourquoi)).toMatch(/Ta dernière série à 112,5 kg a fait 12 reps, 4 de plus que la table ne le prévoyait pour toi : je te compte 2,5 % de plus\.$/);
    propre(p, e);
  });

  test('reculs aux MÊMES reps (6 et 6) : la 193-1, l’écart de 10 %, aucun champ du max du jour', () => {
    const e = entrees(seance(2, 6, 6), 150, 6);
    const p = T.planDeSeance(e);
    const R = p.exercices[0].reculs;
    expect(R.charge).toBe(135);
    expect(R.mode).toBeUndefined();
    expect(sp(R.phrase)).toBe('Recul : 135 kg, 10 % sous ta grosse série.');
    expect(p.exercices[0].paris[1].fondement.max_du_jour).toBeUndefined();
    propre(p, e);
  });

  test('au-delà de 12 (11 reps + marge 2) ou reps de la grosse inconnues : la 193-1', () => {
    const a = T.planDeSeance(entrees(seance(1, 4, 11), 150, 4)).exercices[0].reculs;
    expect(a.mode).toBeUndefined();
    expect(a.charge).toBe(135);
  });

  test('l’écart de la 193-1 ne se lit pas sur une séance à plus de reps', () => {
    const prec = { cible: 8, series: [{ charge_kg: 132.5, reps: 4, type_serie: 'travail' }, { charge_kg: 112.5, reps: 8, type_serie: 'recul' }] };
    prec.historique = [JSON.parse(JSON.stringify(prec))];
    const e = entrees(seance(1, 6, 6), 150, 6, { reculs: { sq: prec } });
    const R = T.planDeSeance(e).exercices[0].reculs;
    expect(R.depart).toBe(true);        // aucune séance aux mêmes reps : 10 % au départ
    expect(R.charge).toBe(135);
  });

  test('I82 : un recul qui n’est pas celui de la table, une correction hors bornes, des reps qui ne dépassent pas la grosse', () => {
    const e = entrees(seance(1, 4, 8), 132.5, 4);
    const base = T.planDeSeance(e);
    const a = JSON.parse(JSON.stringify(base));
    a.exercices[0].reculs.charge = 107.5;
    a.exercices[0].lignes[1].fantome.charge = 107.5;
    expect(T.verifierPlan(a, e).erreurs.join('|')).toMatch(/I82.*n’est pas celui de la table/);
    const b = JSON.parse(JSON.stringify(base));
    b.exercices[0].reculs.correction = 0.2;
    expect(T.verifierPlan(b, e).erreurs.join('|')).toMatch(/I82.*correction/);
    const c = JSON.parse(JSON.stringify(base));
    c.exercices[0].reculs.grosseReps = 8;
    expect(T.verifierPlan(c, e).erreurs.join('|')).toMatch(/I82.*reps plus hautes/);
  });

  test('I78 amendé : en mode max du jour, un écart de 24 % n’est pas une faute ; en 193-1, il en reste une', () => {
    const e = entrees(seance(1, 4, 8), 132.5, 4);
    const a = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    a.exercices[0].reculs.ecart = 0.24;
    expect(T.verifierPlan(a, e).erreurs.join('|')).not.toMatch(/I78.*bornes/);
  });
});
