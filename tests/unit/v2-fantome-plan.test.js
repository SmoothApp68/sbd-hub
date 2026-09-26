/** @jest-environment node */
//
// 49-U2 — le fantôme d'une ligne vient d'une seule source (MOTEUR §9.13 bis,
// étape 4 du plan de séance, invariant I11).
//
// « Tant que l'utilisateur suit le plan, une ligne affiche le plan. Dès qu'il
// valide une autre charge que celle prévue, les lignes suivantes non validées
// recopient sa dernière série faite, charge et reps ensemble — jamais la charge
// d'une source et les reps d'une autre. »
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u2-fantome.json` sort du simulateur unique
// du coach (`coach49.py`, Claude.ai, 26/09/2026) : 45 cas, l'attendu à chaque
// étape (0, 1, … séries validées) — lignes, fantômes, message. Un cas qui
// semble faux se rapporte ; il ne se corrige pas ici.
//
// Les SEULES conversions, de forme et jamais de valeur (les mêmes que
// `v2-reaction.test.js`) : la zone du fichier `{ nom, bas, haut }` devient sa
// clé, après vérification des bornes contre la table ; les nombres se
// comparent au centième.
//
// ⚠️ LES LIGNES FIGÉES PASSENT PAR LE VRAI CHEMIN. À chaque validation, le pari
// s'écrit comme l'app l'écrit (`lignesDePari`, puis `set_observe`), et les
// lignes figées se relisent dans les paris (`figeesDe`). Un rejeu qui
// fabriquerait ses propres lignes figées ne dirait rien de l'app.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const FICHIER = require('./fixtures/cas-49u2-fantome.json');

const cent = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);

function consigneDuCas(c) {
  const k = c.consigne;
  if (k.zone !== null) {
    const table = M.zoneParCle(k.zone.nom);
    expect(table).not.toBeNull();
    expect([table.bas, table.haut]).toEqual([k.zone.bas, k.zone.haut]);
  }
  return { etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier,
    n: k.n, ligne: k.ligne, haut: k.haut };
}

// Rejoue un cas étape par étape : l'état après 0, 1, … séries validées.
function rejouerCas(c) {
  const consigne = consigneDuCas(c);
  const paris = [];
  let figees = {};
  const etapes = [];
  for (let t = 0; t <= c.series; t++) {
    const r = T.rejouer(consigne, c.contexte, c.series, c.faites.slice(0, t), figees);
    etapes.push({
      lignes: r.lignes.map((l) => ({ role: l.role, charge: cent(l.charge), vise: l.vise })),
      fantomes: r.lignes.map((l) => (l.fantome
        ? { charge: cent(l.fantome.charge), reps: l.fantome.reps, source: l.fantome.source } : null)),
      message: r.message ? r.message.type : null,
      brut: r
    });
    if (t === c.series) break;
    // La validation de la série t : son pari, comme `noterPari`.
    const apres = T.rejouer(consigne, c.contexte, c.series, c.faites.slice(0, t + 1), figees);
    M.lignesDePari(consigne, apres.planInitial, apres.faites.slice(0, t), c.contexte, t,
      { slug: 'x', seance: 'S', rang: apres.rangs[t], role: apres.roles[t], rangs: apres.rangs })
      .forEach((l) => paris.push(Object.assign({}, l, { set_observe: 'r' + (t + 1) })));
    const g = S.figeesDe(paris, apres.series, consigne);
    figees = {};
    Object.keys(g).forEach((k) => { figees[Number(k.slice(1)) - 1] = g[k]; });
  }
  return etapes;
}

const arrondi = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'number' ? cent(v) : v)));

describe('49-U2 — les 45 cas du simulateur, à chaque étape', () => {
  test('prémisse : 45 cas, et le fichier est celui de la référence', () => {
    expect(FICHIER.cas).toHaveLength(45);
    expect(FICHIER.source).toMatch(/coach49\.py/);
  });

  FICHIER.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const vu = rejouerCas(c);
      expect(vu).toHaveLength(c.attendu.length);
      c.attendu.forEach((e, t) => {
        const o = vu[t];
        expect({ etape: t, lignes: o.lignes }).toEqual({ etape: t, lignes: arrondi(e.lignes) });
        expect({ etape: t, fantomes: o.fantomes }).toEqual({ etape: t, fantomes: arrondi(e.fantomes) });
        expect({ etape: t, message: o.message }).toEqual({ etape: t, message: e.message });
      });
    });
  });

  test('⚠️ DISCRIMINANT — les cas couvrent les deux sources ET le retour au plan', () => {
    let derniere = 0, retours = 0;
    FICHIER.cas.forEach((c) => {
      c.attendu.forEach((e, t) => {
        e.fantomes.forEach((f) => { if (f && f.source === 'derniere') derniere++; });
        const avant = t > 0 ? c.attendu[t - 1].fantomes : [];
        e.fantomes.forEach((f, i) => {
          if (f && f.source === 'plan' && avant[i] && avant[i].source === 'derniere') retours++;
        });
      });
    });
    expect(derniere).toBeGreaterThan(20);
    expect(retours).toBeGreaterThan(3);
  });
});

describe('49-U2 — F044 : le refus suivi d’un test', () => {
  const c = FICHIER.cas.find((x) => x.id === 'F044');
  const vu = rejouerCas(c);

  test('prémisse : 50 × 8, puis 52,5 proposé sur la série 2', () => {
    expect(vu[1].lignes[1]).toEqual({ role: 'coach', charge: 52.5, vise: 3 });
    expect(vu[1].message).toBe('propose');
  });

  test('refus à 50 : la ligne de test affiche 50 × 6 — la dernière série faite, charge ET reps', () => {
    expect(vu[2].fantomes[2]).toEqual({ charge: 50, reps: 6, source: 'derniere' });
    expect(vu[2].fantomes[3]).toEqual({ charge: 50, reps: 6, source: 'derniere' });
  });

  test('⚠️ plus « 50 × 4 » : jamais la charge tapée avec les reps du test', () => {
    const f = vu[2].fantomes[2];
    expect(f.reps).not.toBe(4);
    // La ligne, elle, reste le test : 55 × 4.
    expect(vu[2].lignes[2]).toEqual({ role: 'test', charge: 55, vise: 4 });
  });

  test('le test fait à 55 : le plan revient sur la série 4', () => {
    expect(vu[3].fantomes[3]).toEqual({ charge: 55, reps: 4, source: 'plan' });
  });
});

// ── I11 — verifierPlan voit chaque violation ────────────────────────────────
//
// Un plan juste, puis des copies forgées : chacune viole I11 d'une seule façon.
describe('49-U2 — I11 : verifierPlan voit chaque violation', () => {
  const F044 = FICHIER.cas.find((x) => x.id === 'F044');
  const consigne = consigneDuCas(F044);
  const obj = { consigne, contexte: F044.contexte };
  let n = 0;
  const id = () => 'x-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: 4 });
  const valider = (i, kg, reps) => {
    se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
    se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
  };
  valider(0, 50, 8);
  valider(1, 50, 6);
  const entrees = () => ({ seance: { id: 'S', debut: '2026-09-26T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: obj }, paris: [] });
  const juste = () => T.planDeSeance(entrees());
  const forger = (fn) => { const p = JSON.parse(JSON.stringify(juste())); fn(p.exercices[0].lignes); return T.verifierPlan(p); };
  const i11 = (v) => v.erreurs.filter((e) => /^I11/.test(e));

  test('prémisse : le plan juste passe, et la série 3 recopie 50 × 6', () => {
    const p = juste();
    expect(T.verifierPlan(p, entrees()).erreurs).toEqual([]);
    expect(p.exercices[0].lignes[2].fantome).toEqual({ charge: 50, reps: 6, source: 'derniere' });
  });

  test('⚠️ DISCRIMINANT — la charge du plan avec les reps de la dernière série (le « 125 × 4 »)', () => {
    const v = forger((l) => { l[2].fantome = { charge: 50, reps: 4, source: 'derniere' }; });
    expect(i11(v).length).toBeGreaterThan(0);
  });

  test('un fantôme du plan après une série qui n’a pas suivi sa ligne', () => {
    const v = forger((l) => { l[2].fantome = { charge: 55, reps: 4, source: 'plan' }; });
    expect(i11(v).join(' ')).toMatch(/n'a pas suivi sa ligne/);
  });

  test('un fantôme « dernière série » après une série qui a suivi sa ligne', () => {
    const v = forger((l) => {
      l[1].faite = { charge: 52.5, reps: 3 };   // la proposition acceptée
      l[2].fantome = { charge: 52.5, reps: 3, source: 'derniere' };
    });
    expect(i11(v).join(' ')).toMatch(/a suivi sa ligne/);
  });

  test('un fantôme du plan qui ne reprend pas sa ligne', () => {
    const v = forger((l) => {
      l[1].faite = { charge: 52.5, reps: 3 };
      l[2].fantome = { charge: 55, reps: 5, source: 'plan' };
    });
    expect(i11(v).join(' ')).toMatch(/pour une ligne 55×4/);
  });

  test('une série faite qui garde un fantôme ; une série à faire qui n’en a pas', () => {
    expect(i11(forger((l) => { l[0].fantome = { charge: 50, reps: 5, source: 'plan' }; })).join(' '))
      .toMatch(/est faite et porte encore un fantôme/);
    expect(i11(forger((l) => { l[3].fantome = null; })).join(' ')).toMatch(/n'a pas de fantôme/);
  });
});
