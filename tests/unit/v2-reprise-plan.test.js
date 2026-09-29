/** @jest-environment node */
//
// 49-U5 — la réaction revue (MOTEUR §9.9, §9.14, delta 49-13 du 27/09/2026) :
//   1. le repli de la reprise longue ne descend jamais de plus de 10 % sous le
//      dernier palier (sinon le dernier palier, sans rep de plus) — étape de
//      la consigne figée ;
//   2. la réaction reste active pendant une reprise ; en reprise longue sous
//      le dernier palier, la proposition ramène au palier ;
//   3. un test prévu plus loin dans le bloc : la proposition prend sa charge
//      (une seule montée par bloc), le « plus loin » lu sur le rôle PRÉVU —
//      invariant I14.
//
// LES FICHIERS DE CAS FONT FOI. `cas-49u5-reprise.json` (9 cas) et
// `cas-49u2-fantome.json` v2 (45 cas) sortent du simulateur unique du coach
// (`coach49.py`, Claude.ai, 27/09/2026). Un cas qui semble faux se rapporte ;
// il ne se corrige pas ici.
//
// ⚠️ LE VRAI CHEMIN. Chaque cas est rejoué par `planDeSeance` sur une séance
// de `seance.js`, chaque validation écrit son pari comme l'app (lu dans le
// plan, puis `set_observe`), et `verifierPlan` tourne à CHAQUE étape, avec le
// plan d'avant (I4) — I14 et le repli compris.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const REPRISE = require('./fixtures/cas-49u5-reprise.json');
const FANTOME = require('./fixtures/cas-49u2-fantome.json');

const cent = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
const esp = (t) => (t === null || t === undefined ? t : t.replace(/[  ]/g, ' '));

function consigneDuCas(k) {
  if (k.zone !== null) {
    const table = M.zoneParCle(k.zone.nom);
    expect(table).not.toBeNull();
    expect([table.bas, table.haut]).toEqual([k.zone.bas, k.zone.haut]);
  }
  return { etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
    n: k.n, ligne: k.ligne, haut: k.haut };
}

// Une séance de `n` séries de travail, validées dans l'ordre `ordre` (des
// index), chaque validation écrivant son pari comme l'app. Rend le plan et les
// erreurs de `verifierPlan` à chaque étape (0, 1, … séries validées).
function jouer(consigne, contexte, n, faites, ordre) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: n });
  const paris = [];
  const entrees = () => ({ seance: { id: 'S', debut: '2026-09-26T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: { consigne, contexte } }, reglage: 'normal', paris: paris.slice() });
  const etapes = [];
  let avant;
  const ord = ordre || faites.map((f, i) => i);
  for (let t = 0; t <= ord.length; t++) {
    const e = entrees();
    const p = T.planDeSeance(e);
    etapes.push({ plan: p, x: p.exercices[0], erreurs: T.verifierPlan(p, e, avant).erreurs });
    avant = p;
    if (t === ord.length) break;
    const i = ord[t];
    se = S.valider(S.modifierSerie(se, 0, i, { charge_kg: faites[i].charge, reps: faites[i].reps }), 0, i,
      new Date('2026-09-26T10:30:00Z'));
    const q = T.planDeSeance(entrees()).exercices[0].paris[i];
    if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
  }
  return etapes;
}

const vue = (x) => ({
  lignes: x.lignes.map((l) => ({ role: l.role, charge: cent(l.charge), vise: l.vise })),
  fantomes: x.lignes.map((l) => (l.fantome
    ? { charge: cent(l.fantome.charge), reps: l.fantome.reps, source: l.fantome.source } : null)),
  message: x.message ? x.message.type : null
});
const arrondi = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? cent(v) : v)));

// ── LES 9 CAS DE LA REPRISE ─────────────────────────────────────────────────
describe('49-U5 — les 9 cas de la reprise, à chaque étape, par le vrai chemin', () => {
  test('prémisse : 9 cas, du simulateur unique, dont 3 au repli plafonné', () => {
    expect(REPRISE.cas).toHaveLength(9);
    expect(REPRISE.source).toMatch(/coach49\.py/);
    const plafonnes = REPRISE.cas.filter((c) => c.consigne.ligne.charge !== c.consigne_figee_attendue.ligne.charge);
    expect(plafonnes.map((c) => c.id)).toEqual(['P007', 'P008', 'P009']);
  });

  REPRISE.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const etapes = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites);
      expect(etapes).toHaveLength(c.attendu.length);
      c.attendu.forEach((a, t) => {
        const o = vue(etapes[t].x);
        expect({ etape: t, lignes: o.lignes }).toEqual({ etape: t, lignes: arrondi(a.lignes) });
        expect({ etape: t, fantomes: o.fantomes }).toEqual({ etape: t, fantomes: arrondi(a.fantomes) });
        expect({ etape: t, message: o.message }).toEqual({ etape: t, message: a.message });
        expect({ etape: t, erreurs: etapes[t].erreurs }).toEqual({ etape: t, erreurs: [] });
      });
      // L'étape de la consigne figée.
      const f = c.consigne_figee_attendue;
      expect(etapes[0].x.consigne).toMatchObject({ etat: f.etat, zone: f.zone.nom, palier: f.palier, n: f.n,
        ligne: f.ligne, haut: f.haut });
    });
  });

  test('⚠️ DISCRIMINANT — P007 : la consigne à 15 pour un palier de 20 (−25 %) est jouée à 20', () => {
    const c = REPRISE.cas.find((x) => x.id === 'P007');
    expect(c.consigne.ligne.charge).toBe(15);
    const x = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites)[0].x;
    expect(x.lignes.map((l) => l.charge)).toEqual([20, 20, 20]);
    expect(x.consigne.ligne).toEqual({ charge: 20, vise: 15 });
  });

  test('⚠️ DISCRIMINANT — P005 : en reprise longue, 60 × 13 fait parler le coach, qui ramène au palier', () => {
    const c = REPRISE.cas.find((x) => x.id === 'P005');
    const x = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites)[1].x;
    expect(x.lignes[1]).toMatchObject({ role: 'coach', charge: 65, proposee: true });
    expect(esp(x.message.phrase)).toBe('60 kg × 13, 3 de plus que visé : on retrouve ta charge de travail, je passe ta série 2 à 65 kg, vise 6 à 8.');
  });
});

// ── LE FANTÔME v2 : LES INVARIANTS À CHAQUE ÉTAPE ───────────────────────────
describe('49-U5 — les 45 cas du fantôme v2 passent verifierPlan à chaque étape (I14, repli)', () => {
  test('prémisse : 45 cas', () => expect(FANTOME.cas).toHaveLength(45));
  FANTOME.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const etapes = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites);
      c.attendu.forEach((a, t) => {
        expect({ etape: t, lignes: vue(etapes[t].x).lignes }).toEqual({ etape: t, lignes: arrondi(a.lignes) });
        expect({ etape: t, erreurs: etapes[t].erreurs }).toEqual({ etape: t, erreurs: [] });
      });
    });
  });
});

// ── RÈGLE 1 À LA SOURCE : `consignePour` SUR UNE MACHINE À GROS CRAN ────────
describe('49-U5 — règle 1 à la source : la consigne d’une reprise longue garde le palier', () => {
  const se = (d, kg) => ({ debut: d, palier: kg,
    series: [1, 2, 3].map(() => ({ charge_kg: kg, reps: 12, rpe: null, role: 'palier' })) });
  // Curl pupitre : palier 32, la charge connue juste dessous 23 (−28 %).
  const H = [se('2026-03-01T18:00:00+00:00', 23), se('2026-03-08T18:00:00+00:00', 32), se('2026-03-15T18:00:00+00:00', 32)];
  const AVANT = '2026-09-26T10:00:00+00:00';

  test('prémisse : plus de 12 semaines, et le cran dessous est 23 — l’ancienne règle y reprenait', () => {
    expect(M.repriseDe(H, AVANT)).toBe('longue');
    // `chargeVoisine` lit des vues de séance (`votantes`), comme `consignePour`.
    const vues = H.map((x) => Object.assign({}, x, { votantes: x.series }));
    expect(M.chargeVoisine(vues, AVANT, 32, 'machine', -1)).toBe(23);
  });

  test('⚠️ DISCRIMINANT — la consigne reprend à 32, sans rep de plus, et le dit', () => {
    const k = M.consignePour(H, AVANT, { reglage: 'normal', equipement: 'machine' });
    expect([k.etat, k.palier, k.ligne]).toEqual(['reprise_longue', 32, { charge: 32, vise: 12 }]);
    // §20.2 (49-U9) — la reprise longue plafonnée se distingue enfin de la courte.
    expect(esp(M.libellesConsigne(k).gris)).toBe('Longue pause : on reprend à ta charge de travail, sans rep de plus.');
    expect(esp(M.pourquoiConsigne(k, 'normal').etat))
      .toBe('Longue pause : on reprend à ta charge de travail, sans rep de plus. Le cran d\'en dessous descendait de plus de 10 %.');
  });

  test('témoin — un petit cran (125 → 122,5, −2 %) reste un cran sous le palier', () => {
    const B = [se('2026-03-01T18:00:00+00:00', 122.5), se('2026-03-08T18:00:00+00:00', 125), se('2026-03-15T18:00:00+00:00', 125)];
    const k = M.consignePour(B, AVANT, { reglage: 'normal', equipement: 'barre' });
    expect([k.etat, k.ligne.charge]).toEqual(['reprise_longue', 122.5]);
    expect(esp(M.libellesConsigne(k).gris)).toMatch(/^Longue pause : on reprend un cran en dessous, à 122,5 kg/);
  });

  test('la limite : 10 % tout rond reste permis, au-delà le palier', () => {
    const c = (l) => M.consigneFigee({ etat: 'reprise_longue', zone: 'volume', palier: 100, n: 3,
      ligne: { charge: l, vise: 12 }, haut: null }).ligne.charge;
    expect([c(90), c(89.5), c(null)]).toEqual([90, 100, null]);
    // Les autres états ne passent jamais par ce repli.
    const courte = { etat: 'reprise_courte', zone: 'volume', palier: 100, n: 3, ligne: { charge: 50, vise: 12 }, haut: null };
    expect(M.consigneFigee(courte)).toBe(courte);
  });
});

// ── RÈGLE 2 — EN REPRISE LONGUE SOUS LE PALIER, LA PROPOSITION Y RAMÈNE ─────
describe('49-U5 — règle 2 : la reprise longue ramène d’abord au palier', () => {
  const s = (kg, reps) => ({ charge_kg: kg, reps, rpe: null, ressenti: null });

  test('⚠️ DISCRIMINANT — sous le palier, le cran connu (48,75) n’est pas le palier (50) : on propose 50', () => {
    const c = { etat: 'reprise_longue', zone: 'hypertrophie', palier: 50, n: 3, ligne: { charge: 47.5, vise: 9 }, haut: null };
    const r = M.reactionPour(c, [s(47.5, 12)], { cran: 48.75, haut: null });
    expect(r.message).toMatchObject({ type: 'propose', charges: [50], retrouve: true });
    expect(r.plan[1]).toMatchObject({ charge: 50, source: 'coach' });
  });

  test('à partir du palier (repli plafonné), la proposition habituelle : le cran du dessus', () => {
    const c = { etat: 'reprise_longue', zone: 'hypertrophie', palier: 50, n: 3, ligne: { charge: 50, vise: 9 }, haut: null };
    const r = M.reactionPour(c, [s(50, 12)], { cran: 52.5, haut: null });
    expect(r.message).toMatchObject({ type: 'propose', charges: [52.5] });
    expect(r.message.retrouve).toBeUndefined();
  });
});

// ── RÈGLE 3 — LE « PLUS LOIN » SE LIT SUR LE RÔLE PRÉVU ─────────────────────
describe('49-U5 — règle 3 : un test figé reste un test prévu', () => {
  // Mix 6-8 : 60 × 10 deux fois, puis le test à 65 ; le cran connu est 62,5.
  const C = { etat: 'attend', zone: 'mix', palier: 65, n: 2, ligne: { charge: 60, vise: 10 },
    haut: { charge: 65, vise: 6, k: 1 } };
  const CTX = { cran: 62.5, haut: null };
  const F = [{ charge: 60, reps: 13 }, { charge: 65, reps: 6 }, { charge: 65, reps: 6 }];

  test('témoin — dans l’ordre : 60 × 13, la proposition est 65, la charge du test', () => {
    const x = jouer(C, CTX, 3, F)[1].x;
    expect(x.lignes.map((l) => l.role + ':' + l.charge)).toEqual(['ligne:60', 'coach:65', 'test:65']);
  });

  test('⚠️ DISCRIMINANT — le test validé AVANT (figé) : la proposition prend toujours sa charge, 65, pas 62,5', () => {
    const etapes = jouer(C, CTX, 3, F, [2, 0]);
    const x = etapes[2].x;
    expect(x.lignes[2]).toMatchObject({ role: 'test', figee: true, validee: true });
    expect(x.lignes[1]).toMatchObject({ role: 'coach', charge: 65, proposee: true });
    etapes.forEach((e) => expect(e.erreurs).toEqual([]));
  });

  test('sans test prévu, rien ne change : le cran du dessus', () => {
    const sans = Object.assign({}, C, { n: 3, haut: null });
    const x = jouer(sans, CTX, 3, F)[1].x;
    expect(x.lignes[1]).toMatchObject({ role: 'coach', charge: 62.5 });
  });
});

// ── I14 ET LE REPLI — verifierPlan voit chaque violation ────────────────────
describe('49-U5 — I14 et le repli : verifierPlan voit chaque violation', () => {
  const C = { etat: 'attend', zone: 'mix', palier: 65, n: 2, ligne: { charge: 60, vise: 10 },
    haut: { charge: 65, vise: 6, k: 1 } };
  const juste = jouer(C, { cran: 62.5, haut: null }, 3,
    [{ charge: 60, reps: 13 }, { charge: 65, reps: 6 }, { charge: 65, reps: 6 }])[1].plan;
  const copie = (p) => JSON.parse(JSON.stringify(p));
  const du = (inv, v) => v.erreurs.filter((e) => e.indexOf(inv + ' —') === 0).join(' ');

  test('prémisse : le plan juste passe, la proposition est à 65 avant le test à 65', () => {
    expect(T.verifierPlan(juste).erreurs).toEqual([]);
    expect(juste.exercices[0].reaction.plan[1]).toMatchObject({ source: 'coach', charge: 65 });
  });

  test('⚠️ DISCRIMINANT — I14 : une proposition au cran (62,5) avant le test prévu à 65', () => {
    const p = copie(juste); p.exercices[0].reaction.plan[1].charge = 62.5;
    expect(du('I14', T.verifierPlan(p))).toMatch(/la proposition du coach \(ligne 1, 62.5\) précède un test prévu à 65/);
  });

  test('I14 : une proposition figée garde sa charge — c’est de l’histoire (I4), pas une décision', () => {
    const p = copie(juste); p.exercices[0].reaction.plan[1].charge = 62.5;
    p.exercices[0].planInitial[1].figee = true;
    expect(du('I14', T.verifierPlan(p))).toBe('');
  });

  test('⚠️ DISCRIMINANT — le repli : une consigne, ou une ligne, à plus de 10 % sous le palier', () => {
    const c = REPRISE.cas.find((x) => x.id === 'P007');
    const plan = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites)[0].plan;
    expect(T.verifierPlan(plan).erreurs).toEqual([]);
    const k = copie(plan); k.exercices[0].consigne.ligne.charge = 15;
    expect(du('I15', T.verifierPlan(k))).toMatch(/la consigne reprend à 15, plus de 10 % sous le palier 20/);
    const l = copie(plan); l.exercices[0].lignes[2].charge = 15;
    expect(du('I15', T.verifierPlan(l))).toMatch(/la série 2 reprend à 15, plus de 10 % sous le palier 20/);
  });
});

// ── 49-U7 — LE CRAN SE LIT AU-DESSUS DE LA CHARGE RETENUE ; I3 SANS EXCEPTION ─
//
// Le simulateur a été corrigé le 27/09 : après un repli plafonné, le cran se
// lit au-dessus du palier retenu. P008, P009, F028, F029, F034 et F035 ne
// proposent plus « 20, vise 10 à 12 » (la charge de travail elle-même) mais
// « le cran au-dessus », sans chiffre — et la tolérance de I3 pour une reprise
// longue « au palier » est partie avec eux.
describe('49-U7 — la réaction lit le cran au-dessus de la charge retenue ; I3 sans tolérance', () => {
  const s = (kg, reps) => ({ charge_kg: kg, reps, rpe: null, ressenti: null });
  const C = { etat: 'reprise_longue', zone: 'volume', palier: 20, n: 3, ligne: { charge: 20, vise: 15 }, haut: null };

  test('⚠️ DISCRIMINANT — un cran connu ÉGAL à la charge retenue vaut « le cran au-dessus », sans chiffre', () => {
    const r = M.reactionPour(C, [s(20, 18)], { cran: 20, haut: null });
    expect(r.message).toMatchObject({ type: 'propose', charges: [null] });
    expect(r.plan[1]).toMatchObject({ charge: null, source: 'coach' });
  });

  test('un cran connu PLUS BAS aussi (contexte d’une consigne d’avant le repli, ligne à 15)', () => {
    const r = M.reactionPour(C, [s(20, 18)], { cran: 17.5, haut: null });
    expect(r.message).toMatchObject({ type: 'propose', charges: [null] });
  });

  test('témoin — un cran au-dessus garde son chiffre', () => {
    const r = M.reactionPour(C, [s(20, 18)], { cran: 22.5, haut: null });
    expect(r.message).toMatchObject({ type: 'propose', charges: [22.5] });
  });

  test('⚠️ DISCRIMINANT — I3 : une proposition À la charge du palier, en reprise longue, est vue', () => {
    const c = REPRISE.cas.find((x) => x.id === 'P008');
    const etapes = jouer(consigneDuCas(c.consigne), c.contexte, c.series, c.faites);
    const plan = JSON.parse(JSON.stringify(etapes[1].plan));
    expect(plan.exercices[0].reaction.plan[1]).toMatchObject({ source: 'coach', charge: null });
    expect(T.verifierPlan(plan).erreurs).toEqual([]);
    plan.exercices[0].reaction.plan[1].charge = 20;
    expect(T.verifierPlan(plan).erreurs.filter((e) => e.indexOf('I3 —') === 0).join(' '))
      .toMatch(/proposition 20 pas au-dessus de la charge de travail 20/);
  });
});
