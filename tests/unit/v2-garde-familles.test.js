/** @jest-environment node */
//
// 49-U7 bis (delta 49-17, 28/09/2026) — CE QUE LA GARDE DU COACH A TROUVÉ.
//
// À sa première passe sur les 46 sections du banc, la garde a vu trois
// familles de défauts anciens. Les règles, jouées ici sur des suites de plans
// vérifiées AVEC LE PLAN D'AVANT, comme la garde et le banc les vérifient :
//
//   A  — un pari s'écrit AVANT que le plan suivant soit calculé (I7, G2) ;
//   A' — une série validée sans pari, qui ne vient pas de l'être, est NON
//        PARIÉE : I7 ne l'exige pas, et personne ne l'écrit après coup ;
//   B  — une série qui cesse d'être une série de travail perd son
//        observation (G3 ; le geste vit dans `app.js`, vérifié au banc) ;
//   C  — une ligne figée ne change jamais TANT QU'ELLE RESTE VALIDÉE (I4, G1).

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
  contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
const DATE = new Date('2026-09-26T10:30:00Z');

// Une séance, ses paris, et CHAQUE plan calculé vérifié avec le plan d'avant.
// `depart` : une séance déjà là (une reprise) — son premier plan n'a pas de
// plan d'avant.
function seanceSimulee(nSeries, depart) {
  let n = 0;
  const id = () => 'x-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'x', id, { series: nSeries || 3 });
  if (depart) se = depart;
  let paris = [];
  let avant = null;
  const erreurs = [];
  const entrees = () => ({ seance: { id: 'S', debut: '2026-09-26T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { x: C }, paris: paris.slice(), suites: {} });
  const api = {
    get seance() { return se; },
    set seance(v) { se = v; },
    get paris() { return paris; },
    set paris(v) { paris = v; },
    erreurs,
    serie: (i) => se.exercices[0].series[i],
    // Un plan CALCULÉ (comme `planActuel`), vérifié avec celui d'avant.
    calculer: (quand) => {
      const e = entrees();
      const p = T.planDeSeance(e);
      T.verifierPlan(p, e, avant).erreurs.forEach((x) => erreurs.push(quand + ' : ' + x));
      avant = p;
      return p;
    },
    // Le pari de la série, lu sur un plan PUR (ni vérifié ni retenu), comme
    // `enregistrerPari` le lit.
    pariPur: (i) => {
      const x = T.planDeSeance(entrees()).exercices[0];
      return x.paris ? x.paris[i] : null;
    },
    saisir: (i, kg, reps) => { se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps }); },
    // L'ORDRE DE 49-17 : valider, enregistrer le pari, PUIS le plan suivant,
    // puis l'observation.
    valider: (i, kg, reps) => {
      api.saisir(i, kg, reps);
      se = S.valider(se, 0, i, DATE);
      const q = api.pariPur(i);
      if (q) paris.push(Object.assign({}, q));
      api.calculer('validation ' + i);
      if (q) api.observer(i);
      api.calculer('observation ' + i);
      return q;
    },
    // L'ANCIEN ORDRE : le plan suivant AVANT le pari.
    validerAncienOrdre: (i, kg, reps) => {
      api.saisir(i, kg, reps);
      se = S.valider(se, 0, i, DATE);
      api.calculer('validation ' + i + ' (ancien ordre)');
      const q = api.pariPur(i);
      if (q) paris.push(Object.assign({}, q));
      if (q) api.observer(i);
      api.calculer('observation ' + i);
      return q;
    },
    observer: (i) => {
      const sid = api.serie(i).id;
      const x = T.planDeSeance(entrees()).exercices[0];
      const rang = x.lignes[i].rang;
      paris = paris.map((q) => (q.fondement.rang === rang && !q.set_observe &&
        (Number(q.fondement.revision) || 0) === (Number((x.paris[i] || q).fondement.revision) || 0)
        ? Object.assign({}, q, { set_observe: sid }) : q));
    },
    // Dévalider : l'observation se vide dans le même geste (§9.11).
    devalider: (i) => {
      const sid = api.serie(i).id;
      se = S.devalider(se, 0, i);
      paris = paris.map((q) => (q.set_observe === sid ? Object.assign({}, q, { set_observe: null }) : q));
      api.calculer('dévalidation ' + i);
    }
  };
  api.calculer('ouverture');
  return api;
}

const du = (inv, liste) => liste.filter((e) => e.indexOf(' : ' + inv + ' — ') > 0);

// ── A — LE PARI AVANT LE PLAN SUIVANT ───────────────────────────────────────
describe('49-U7 bis — A : un pari s’écrit avant que le plan suivant soit calculé (I7, G2)', () => {
  test('⚠️ DISCRIMINANT — le nouvel ordre : aucun plan sans son pari, à chaque validation', () => {
    const s = seanceSimulee(3);
    s.valider(0, 125, 5);
    s.valider(1, 125, 5);
    s.valider(2, 130, 4);
    expect(s.paris).toHaveLength(3);
    expect(s.erreurs).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — l’ancien ordre : le plan de la validation porte la série sans son pari (I7)', () => {
    const s = seanceSimulee(3);
    s.validerAncienOrdre(0, 125, 5);
    expect(du('I7', s.erreurs)).toHaveLength(1);
    expect(du('I7', s.erreurs)[0]).toMatch(/^validation 0 \(ancien ordre\) : I7 — .*porte 0 pari\(s\) de sa révision \(0\)/);
  });

  test('avec une proposition du coach (révision 1) : même règle', () => {
    const s = seanceSimulee(3);
    s.valider(0, 125, 8);
    const q = s.valider(1, 130, 4);
    expect(q.fondement.revision).toBe(1);
    expect(s.erreurs).toEqual([]);
  });
});

// ── A' — NON PARIÉE : JAMAIS DE PARI APRÈS COUP ─────────────────────────────
describe('49-U7 bis — A’ : une série validée hors de l’app ou avant son plan reste non pariée', () => {
  test('⚠️ DISCRIMINANT — séance reprise avec une série validée sans pari : aucune violation, aucun pari', () => {
    // Le décor du banc [D7] : la séance arrive validée, sans pari (un autre
    // appareil, une app tuée, une séance d'avant 49-C). Le PREMIER plan n'a
    // pas de plan d'avant ; les suivants voient la série déjà validée.
    let n = 0;
    const id = () => 'x-s' + (++n);
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'x', id, { series: 3 });
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 125, reps: 5 }), 0, 0, DATE);
    const s2 = seanceSimulee(3, se);
    const reprise = s2.calculer('reprise');
    expect(reprise.exercices[0].lignes[0]).toMatchObject({ validee: true, figee: false });
    s2.calculer('redessin');
    expect(s2.erreurs).toEqual([]);
    expect(s2.paris).toEqual([]);
    // La suite de la séance se parie normalement.
    s2.valider(1, 125, 5);
    expect(s2.paris.map((q) => q.fondement.rang)).toEqual([2]);
    expect(s2.erreurs).toEqual([]);
  });

  test('sans plan d’avant, rien ne « vient » d’être validé : la série sans pari passe', () => {
    const s = seanceSimulee(3);
    s.saisir(0, 125, 5);
    s.seance = S.valider(s.seance, 0, 0, DATE);
    const e = { seance: { id: 'S', debut: '2026-09-26T10:00:00+00:00', edition: false, exercices: s.seance.exercices },
      consignes: { x: C }, paris: [], suites: {} };
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs).toEqual([]);
  });

  test('témoin — une série qui porte un pari se juge toujours : deux paris de sa révision, I7', () => {
    const s = seanceSimulee(3);
    const q = s.valider(0, 125, 5);
    s.paris.push(Object.assign({}, q, { id: 'doublon' }));
    s.calculer('doublon');
    expect(du('I7', s.erreurs).length).toBeGreaterThanOrEqual(1);
  });
});

// ── C — I4 TANT QUE LA LIGNE RESTE VALIDÉE ──────────────────────────────────
describe('49-U7 bis — C : une ligne figée ne change jamais tant qu’elle reste validée (I4, G1)', () => {
  test('⚠️ DISCRIMINANT — dévalidation puis revalidation sous une autre révision : aucune violation', () => {
    const s = seanceSimulee(3);
    s.valider(1, 125, 5);                  // la série 2 : révision 0
    s.devalider(1);                        // défigée — plus « figée avant, plus maintenant »
    s.valider(0, 125, 8);                  // le coach propose la ligne 2
    const q1 = s.valider(1, 130, 4);       // revalidée sous la proposition : révision 1
    expect(q1.fondement.revision).toBe(1);
    expect(s.paris.map((q) => q.fondement.rang + ':' + (q.fondement.revision || 0))).toEqual(['2:0', '1:0', '2:1']);
    expect(s.erreurs).toEqual([]);
  });

  test('témoin — une ligne figée ET validée qui change de charge d’un plan au suivant : I4', () => {
    const s = seanceSimulee(3);
    s.valider(0, 125, 5);
    const a = s.calculer('avant');
    const b = JSON.parse(JSON.stringify(a));
    expect(b.exercices[0].lignes[0]).toMatchObject({ figee: true, validee: true });
    b.exercices[0].lignes[0].charge = 127.5;
    expect(T.verifierPlan(b, undefined, a).erreurs.filter((e) => /^I4 — /.test(e)))
      .toEqual([expect.stringMatching(/charge 125 → 127.5/)]);
    const c = JSON.parse(JSON.stringify(a));
    c.exercices[0].lignes[0].figee = false;
    expect(T.verifierPlan(c, undefined, a).erreurs.filter((e) => /^I4 — /.test(e)))
      .toEqual([expect.stringMatching(/figée avant, plus maintenant/)]);
  });
});

// ── 49-18, 49-19 — R1, ET L'ÉCHEC (H1, E1, E2) ──────────────────────────────
describe('49-18/19 — R1 : une série validée qui quitte le travail sort de I4 ; l’échec est une tentative manquée', () => {
  // Le geste de l'app : le type change, et tout passage de `travail` à un
  // autre type vide l'observation dans le même geste (E1).
  const changerType = (s, i, type) => {
    const sid = s.serie(i).id;
    s.seance = S.changerType(s.seance, 0, i, type);
    if (type !== 'travail') {
      s.paris = s.paris.map((q) => (q.set_observe === sid ? Object.assign({}, q, { set_observe: null }) : q));
    }
    return s.calculer('→ ' + type);
  };

  ['echauffement', 'degressive', 'echec'].forEach((type) => {
    test('⚠️ DISCRIMINANT — R1 : validée, observée, passée en ' + type + ' : aucune violation (ni I4, ni I7)', () => {
      const s = seanceSimulee(3);
      s.valider(0, 125, 5);
      const p = changerType(s, 0, type);
      expect(p.exercices[0].lignes[0]).toMatchObject({ role: 'hors', validee: true });
      expect(s.erreurs).toEqual([]);
    });
  });

  test('témoin — sans H1, la même série passée en chauffe serait « figée avant, plus maintenant »', () => {
    const s = seanceSimulee(3);
    s.valider(0, 125, 5);
    const a = s.calculer('avant');
    const b = changerType(s, 0, 'echauffement');
    const forge = JSON.parse(JSON.stringify(b));
    forge.exercices[0].lignes[0].role = 'ligne';   // restée « de travail », défigée
    expect(T.verifierPlan(forge, undefined, a).erreurs.filter((e) => /^I4 — /.test(e)))
      .toEqual([expect.stringMatching(/figée avant, plus maintenant/)]);
  });

  test('⚠️ DISCRIMINANT — E1 : passée en échec, l’observation est vidée, et aucune violation I7', () => {
    // 49-19 : `echec` est une tentative manquée (hors couverture, ne vote pas).
    // Au quatrième commit (H2, annulé), l'observation restait : I7.
    const s = seanceSimulee(3);
    s.valider(0, 125, 5);
    const p = changerType(s, 0, 'echec');
    expect(s.paris.filter((q) => q.set_observe === s.serie(0).id)).toHaveLength(0);
    expect(p.exercices[0].lignes[0].role).toBe('hors');
    expect(s.erreurs).toEqual([]);
  });
});
