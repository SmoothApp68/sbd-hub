/** @jest-environment node */
//
// 193-1 (commit 4) — LE PLAN DES SÉRIES DE RECUL (MOTEUR §9.28, I78, I1 et I7 amendés).
//
// Le vrai chemin : une séance de `seance.js`, `planDeSeance`, `verifierPlan` (I1, I4, I7, I78) et `verifierPhrases` (I26) à
// chaque étape. Une grosse série de 150 × 4 et trois reculs visés à 6 : les reculs suivent la grosse série du jour.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CONSIGNE = { etat: 'progression', zone: 'lourd', palier: 150, n: 1, ligne: { charge: 150, vise: 6 }, haut: null };

function seance(reculs, nbGrosses) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'sq', id, { series: (nbGrosses === undefined ? 1 : nbGrosses) + reculs });
  se.exercices[0].series.forEach((s, i) => {
    if (i >= (nbGrosses === undefined ? 1 : nbGrosses)) { s.type_serie = 'recul'; s.reps_visees = 6; } else s.reps_visees = 6;
  });
  return se;
}

function entrees(se, extra) {
  return Object.assign({
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { sq: { consigne: Object.assign({}, CONSIGNE, { zone: 'lourd' }), contexte: { cran: 152.5, haut: null } } },
    reglage: 'normal', paris: [],
    catalogue: { sq: { equipement: 'barre', mesure: 'charge_reps', pas: 2.5 } }
  }, extra || {});
}

describe('193-1 — le plan des reculs', () => {
  test('150 × 4 puis trois reculs : la ligne recul est hors couverture, à 135 kg (10 %), avec son fantôme', () => {
    const e = entrees(seance(3));
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes.map((l) => [l.type, l.role])).toEqual([['travail', 'ligne'], ['recul', 'hors'], ['recul', 'hors'], ['recul', 'hors']]);
    x.lignes.slice(1).forEach((l) => {
      expect(l.recul.charge).toBe(135);
      expect(l.fantome).toEqual({ charge: 135, reps: null, source: 'recul' });
      expect(l.prerempli.charge_kg).toBe(135);
      expect(l.prerempli.reps).toBe(6);
    });
    expect(x.reculs.grosse).toBe(150);
    expect(x.reculs.depart).toBe(true);
    expect(x.reculs.phrase.replace(/[\u00a0\u202f]/g, ' ')).toBe('Recul : 135 kg, 10 % sous ta grosse série.');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(T.verifierPhrases(p)).toEqual([]);
  });

  test('un pari par recul : rôle « recul », rang texte « r1 », « r2 », « r3 », jamais un rang de la couverture', () => {
    const p = T.planDeSeance(entrees(seance(3)));
    const paris = p.exercices[0].paris;
    expect(paris[0].fondement.role).toBe('ligne');
    expect(paris[0].fondement.rang).toBe(1);
    [1, 2, 3].forEach((i) => {
      expect(paris[i].fondement.role).toBe('recul');
      expect(paris[i].fondement.rang).toBe('r' + i);
      expect(paris[i].fondement.charge).toBe(135);
      expect(paris[i].valeur_predite).toBe(6);
      expect(paris[i].grandeur).toBe('reps');
    });
  });

  test('la couverture ne voit pas les reculs : une seule ligne couverte, un seul rang', () => {
    const x = T.planDeSeance(entrees(seance(3))).exercices[0];
    expect(x.lignes.filter((l) => l.role !== 'hors')).toHaveLength(1);
    expect(x.indices).toEqual([0]);
  });

  test('l’écart se LIT sur la dernière séance à reculs : 127,5 sur 150 (15 %), 5 reps pour une cible de 6 → éloigne de 2,5 points (17,5 %)', () => {
    const prec = { cible: 6, series: [{ charge_kg: 150, reps: 6, type_serie: 'travail' },
      { charge_kg: 127.5, reps: 5, type_serie: 'recul' }, { charge_kg: 127.5, reps: 5, type_serie: 'recul' }] };
    const e = entrees(seance(2), { reculs: { sq: prec } });
    const p = T.planDeSeance(e);
    const R = p.exercices[0].reculs;
    expect(R.depart).toBe(false);
    expect(R.ecart).toBeCloseTo(0.175, 6);
    expect(R.charge).toBe(122.5);   // 123,75 : à égalité entre 122,5 et 125, vers le bas
    expect(R.sens).toBe('eloigne');
    expect(R.pourquoi).toMatch(/Je les éloigne/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(T.verifierPhrases(p)).toEqual([]);
  });

  test('la borne : un écart lu de 2 % est relevé à 5 % (142,5 sur 150)', () => {
    const prec = { cible: 6, series: [{ charge_kg: 150, reps: 6, type_serie: 'travail' }, { charge_kg: 147.5, reps: 6, type_serie: 'recul' }] };
    const R = T.planDeSeance(entrees(seance(1), { reculs: { sq: prec } })).exercices[0].reculs;
    expect(R.ecart).toBeCloseTo(0.05, 6);
    expect(R.charge).toBe(142.5);
  });

  test('la grosse série du jour fait foi : validée à 155, les reculs non validés suivent (155 × 0,9 → 140)', () => {
    let se = seance(2);
    se = S.modifierSerie(se, 0, 0, { charge_kg: 155, reps: 3 });
    se = S.valider(se, 0, 0, new Date('2026-10-31T10:30:00Z'));
    const p = T.planDeSeance(entrees(se));
    const x = p.exercices[0];
    expect(x.reculs.grosse).toBe(155);
    expect(x.lignes[1].fantome.charge).toBe(140);
  });

  test('sans grosse série : la ligne recul reste vide et dit pourquoi', () => {
    const e = entrees(seance(2, 0));
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.reculs.charge).toBeNull();
    expect(x.reculs.phrase).toBe('Pas de grosse série pour caler tes reculs.');
    x.lignes.forEach((l) => { expect(l.fantome).toBeUndefined(); expect(l.recul.charge).toBeNull(); });
    expect(x.paris.every((q) => !q)).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('un recul validé garde son pari ; la revalidation ne change pas sa charge de pari', () => {
    let k = 0;
    let se = seance(2);
    const paris = [];
    const vu = [];
    let avant;
    for (let t = 0; t < 3; t++) {
      const e = entrees(se, { paris: paris.slice() });
      const p = T.planDeSeance(e);
      vu.push(T.verifierPlan(p, e, avant).erreurs);
      avant = p;
      se = S.modifierSerie(se, 0, t, t === 0 ? { charge_kg: 150, reps: 4 } : { charge_kg: 135, reps: 6 });
      se = S.valider(se, 0, t, new Date('2026-10-31T10:3' + t + ':00Z'));
      const q = T.planDeSeance(entrees(se, { paris: paris.slice() })).exercices[0].paris[t];
      if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[t].id }));
      k += 1;
    }
    expect(vu.every((er) => er.length === 0)).toBe(true);
    const e = entrees(se, { paris: paris.slice() });
    const p = T.planDeSeance(e);
    expect(paris.map((q) => q.fondement.role)).toEqual(['ligne', 'recul', 'recul']);
    expect(T.verifierPlan(p, e, avant).erreurs).toEqual([]);
    expect(p.exercices[0].reculs.constat).toBe('Tes reculs tiennent 6-6.');
    expect(T.verifierPhrases(p)).toEqual([]);
  });

  test('I78 : un recul à la charge de la grosse série, un écart hors bornes, un pari « ligne » sur un recul sont refusés', () => {
    const e = entrees(seance(2));
    const p = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    const x = p.exercices[0];
    x.reculs.charge = x.reculs.grosse;
    expect(T.verifierPlan(p, e).erreurs.join('|')).toMatch(/I78.*pas sous la grosse série/);
    const q = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    q.exercices[0].reculs.ecart = 0.3;
    expect(T.verifierPlan(q, e).erreurs.join('|')).toMatch(/I78.*bornes 5 à 20/);
    const r = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    r.exercices[0].paris[1].fondement.role = 'ligne';
    expect(T.verifierPlan(r, e).erreurs.join('|')).toMatch(/I78.*pari/);
  });

  test('I1 amendé : un pari sur une chauffe ou une dégressive reste refusé', () => {
    const e = entrees(seance(1));
    const p = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    p.exercices[0].lignes[1].type = 'degressive';
    p.exercices[0].lignes[1].recul = undefined;
    expect(T.verifierPlan(p, e).erreurs.join('|')).toMatch(/I1.*hors couverture, avec un pari/);
  });
});

describe('193-1 — l’observation d’un pari de recul', () => {
  test('une série de recul observe le pari de SON rang texte, et compte ses reps', () => {
    const p = T.planDeSeance(entrees(seance(2))).exercices[0];
    const pari = Object.assign({}, p.paris[1], { id: 'p1', set_observe: null, valeur_observee: null });
    const serie = { id: 'sr', charge_kg: 135, reps: 5, type_serie: 'recul', exercise_slug: 'sq' };
    const a = S.parisAObserver([pari], serie, 'r1', [serie]);
    expect(a).toEqual([pari]);
    expect(S.parisAObserver([pari], serie, 'r2', [serie])).toEqual([]);
    const vue = M.observationDe(pari.fondement, { enBase: true, id: 'sr', charge: 135, reps: 5 });
    expect(vue.set_observe).toBe('sr');
    expect(vue.valeur_observee).toBe(5);
  });
});
