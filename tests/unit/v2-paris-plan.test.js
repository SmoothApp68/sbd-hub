/** @jest-environment node */
//
// 49-U3 — les paris et les lignes figées se lisent dans le plan (MOTEUR
// §9.13 bis, §9.11, §9.13 ; invariants I4, I7, I8).
//
// ⚠️ LA RÉFÉRENCE EST CE QUE L'APP ÉCRIVAIT AVANT. `paris-49u3-reference.json`
// a été produit par le code de `main` au commit 28f846c (avant 49-U3) : chaque
// cas de réaction (`reaction-49r1.json`) et de fantôme (`cas-49u2-fantome.json`)
// rejoué validation par validation, le pari écrit comme `noterPari` l'écrivait
// — `lignesDePari` relançant la réaction sur le plan d'après la validation,
// avec le préfixe des séries faites avant, le rang et le rôle de la
// couverture —, les séries portant leur RPE (comme en séance), les lignes
// figées relues dans ces paris entre deux validations. Ce commit déplace le CALCUL dans le plan ; il ne doit pas
// changer une virgule de ce qui s'écrit. Une différence se rapporte, elle ne
// se corrige pas ici.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const REF = require('./fixtures/paris-49u3-reference.json');
const REACTION = require('./fixtures/reaction-49r1.json');
const FANTOME = require('./fixtures/cas-49u2-fantome.json');

const consigneDuCas = (k) => ({ etat: k.etat, zone: k.zone === null ? null : k.zone.nom,
  palier: k.palier, n: k.n, ligne: k.ligne, haut: k.haut });
const OPTIONS = { slug: 'x', seance: 'S', reglage: 'normal' };

// Rejoue un cas : à chaque validation, le pari que le PLAN porte pour la série
// (`paris[iSerie]`), observé sur elle — ce qui fige sa ligne pour la suite.
function parisDuPlan(k, contexte, n, faites) {
  const consigne = consigneDuCas(k);
  const paris = [];
  const parSerie = [];
  let figees = {};
  for (let t = 0; t < faites.length; t++) {
    const apres = T.rejouer(consigne, contexte, n, faites.slice(0, t + 1), figees, OPTIONS);
    const q = apres.paris[t];
    parSerie.push(q ? [q] : []);
    if (q) paris.push(Object.assign({}, q, { set_observe: 'r' + (t + 1) }));
    const g = S.figeesDe(paris, apres.series, consigne);
    figees = {};
    Object.keys(g).forEach((x) => { figees[Number(x.slice(1)) - 1] = g[x]; });
  }
  return parSerie;
}

describe('49-U3 — le pari du plan est, champ par champ, celui que l’app écrivait', () => {
  test('prémisse : la référence couvre les 55 cas de réaction et les 45 de fantôme, et plus de 300 paris', () => {
    expect(REF.reaction).toHaveLength(55);
    expect(REF.fantome).toHaveLength(45);
    const nb = (l) => l.reduce((a, c) => a + c.validations.reduce((b, v) => b + v.paris.length, 0), 0);
    expect(nb(REF.reaction) + nb(REF.fantome)).toBeGreaterThan(300);
    // Les trois sortes de pari y sont : la consigne (révision 0), la série
    // proposée (1), la montée tenue (2).
    const revs = new Set();
    REF.reaction.concat(REF.fantome).forEach((c) => c.validations.forEach((v) =>
      v.paris.forEach((p) => revs.add(p.fondement.revision || 0))));
    expect([...revs].sort()).toEqual([0, 1, 2]);
  });

  REF.reaction.forEach((ref, i) => {
    const c = REACTION.reaction[i];
    test('réaction ' + ref.id, () => {
      expect(c.id).toBe(ref.id);
      const vu = parisDuPlan(c.consigne, c.contexte, c.faites.length, c.faites);
      ref.validations.forEach((v, t) => expect({ serie: t, paris: vu[t] }).toEqual({ serie: t, paris: v.paris }));
    });
  });

  REF.fantome.forEach((ref, i) => {
    const c = FANTOME.cas[i];
    test('fantôme ' + ref.id, () => {
      expect(c.id).toBe(ref.id);
      const vu = parisDuPlan(c.consigne, c.contexte, c.series, c.faites);
      ref.validations.forEach((v, t) => expect({ serie: t, paris: vu[t] }).toEqual({ serie: t, paris: v.paris }));
    });
  });
});

// ── I4, I7, I8 — verifierPlan voit chaque violation ─────────────────────────
//
// Une séance juste (le cas F044 : 50 × 8, refus à 50 × 6, test à 55 × 7),
// chaque pari écrit comme l'app l'écrit, puis des copies forgées : chacune
// viole un invariant d'une seule façon.
describe('49-U3 — I4, I7, I8 : verifierPlan voit chaque violation', () => {
  const F044 = FANTOME.cas.find((x) => x.id === 'F044');
  const consigne = consigneDuCas(F044.consigne);
  let n = 0;
  const id = () => 'x-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: 4 });
  const paris = [];
  const entrees = () => ({ seance: { id: 'S', debut: '2026-09-26T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: { consigne, contexte: F044.contexte } }, reglage: 'normal', paris: paris.slice() });
  const plans = [];
  const valider = (i, kg, reps) => {
    se = S.valider(S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps }), 0, i, new Date('2026-09-26T10:30:00Z'));
    const q = T.planDeSeance(entrees()).exercices[0].paris[i];
    if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
    plans.push(T.planDeSeance(entrees()));
  };
  valider(0, 50, 8);
  valider(1, 50, 6);
  valider(2, 55, 7);
  const e = entrees();
  const p = T.planDeSeance(e);
  const copie = (x) => JSON.parse(JSON.stringify(x));
  const erreursDe = (inv, v) => v.erreurs.filter((x) => x.indexOf(inv + ' —') === 0);

  test('prémisse : trois paris écrits, un par série faite, et le plan juste passe — avec chaque paire de plans', () => {
    expect(paris.map((q) => q.fondement.rang + ':' + q.fondement.role + ':' + q.fondement.charge))
      .toEqual(['1:ligne:50', '2:coach:52.5', '3:haut:55']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    for (let k = 1; k < plans.length; k++) expect(T.verifierPlan(plans[k], undefined, plans[k - 1]).erreurs).toEqual([]);
    expect(p.exercices[0].lignes.slice(0, 3).every((l) => l.figee)).toBe(true);
  });

  test('⚠️ DISCRIMINANT — I7 : un pari qui dit un autre rôle que la ligne', () => {
    const f = copie(e); f.paris[1].fondement.role = 'ligne';
    expect(erreursDe('I7', T.verifierPlan(p, f)).join(' ')).toMatch(/dit « ligne » pour une ligne « coach »/);
  });

  test('I7 : un pari qui dit une autre charge, ou une autre visée', () => {
    const f = copie(e); f.paris[2].fondement.charge = 52.5;
    expect(erreursDe('I7', T.verifierPlan(p, f)).join(' ')).toMatch(/porte 52.5 pour une ligne à 55/);
    const g = copie(e); g.paris[0].valeur_predite = 6;
    expect(erreursDe('I7', T.verifierPlan(p, g)).join(' ')).toMatch(/vise 6 pour une ligne qui vise 5/);
  });

  test('I7 : une série faite sans pari, ou avec deux', () => {
    const f = copie(e); f.paris.splice(1, 1);
    expect(erreursDe('I7', T.verifierPlan(p, f)).join(' ')).toMatch(/rang 2\) porte 0 pari/);
    const g = copie(e); g.paris.push(Object.assign({}, g.paris[0], { id: 'double', set_observe: null }));
    expect(erreursDe('I7', T.verifierPlan(p, g)).join(' ')).toMatch(/rang 1\) porte 2 pari/);
  });

  test('I7 : un pari observé sur une série qui n’est pas une ligne validée ; un pari non observé sans ligne est permis', () => {
    const f = copie(e); f.paris.push(Object.assign({}, f.paris[0], { id: 'orphelin',
      fondement: Object.assign({}, f.paris[0].fondement, { rang: 9 }), set_observe: 'inconnue' }));
    expect(erreursDe('I7', T.verifierPlan(p, f)).join(' ')).toMatch(/observé sur une série qui n'est pas une ligne validée/);
    // Série validée puis supprimée : son pari reste, non observé (49-11).
    const g = copie(e); g.paris.push(Object.assign({}, g.paris[0], { id: 'reste',
      fondement: Object.assign({}, g.paris[0].fondement, { rang: 9 }), set_observe: null }));
    expect(erreursDe('I7', T.verifierPlan(p, g))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — I8 : deux lignes au même rang', () => {
    const f = copie(p); f.exercices[0].lignes[3].rang = 2;
    expect(erreursDe('I8', T.verifierPlan(f)).join(' ')).toMatch(/le rang 2 est porté par les séries 1 et 3/);
  });

  test('⚠️ DISCRIMINANT — I4 : une ligne figée qui change d’un plan au suivant', () => {
    const cas = [
      ['rang', (l) => { l.rang = 7; }, /rang 2 → 7/],
      ['rôle', (l) => { l.role = 'ligne'; }, /rôle coach → ligne/],
      ['charge', (l) => { l.charge = 50; }, /charge 52.5 → 50/],
      ['visée', (l) => { l.vise = 5; }, /visée 3 → 5/],
      ['dégel', (l) => { l.figee = false; }, /figée avant, plus maintenant/]
    ];
    cas.forEach(([, forger, motif]) => {
      const apres = copie(p);
      forger(apres.exercices[0].lignes[1]);
      expect(erreursDe('I4', T.verifierPlan(apres, undefined, p)).join(' ')).toMatch(motif);
    });
    // Témoin : la ligne NON figée (série 4) peut changer.
    const libre = copie(p); libre.exercices[0].lignes[3].charge = 60;
    expect(erreursDe('I4', T.verifierPlan(libre, undefined, p))).toEqual([]);
  });
});
