/** @jest-environment node */
//
// 169 — JAMAIS BLOQUÉ : l'effort visé, v2 (MOTEUR §9.26, décision d'Aurélien du 25/10/2026, 10 h 25).
//
//   1  Prudent vise 2 en Lourd et en Mix (la table) ;
//   2  la garde au haut de la zone ne dure qu'une séance : la suivante, au haut à la même charge avec R < V, pose le test ;
//   3  les phrases (1re fois, 2e fois) ; 4  les puces seulement où la règle joue ; 5  la visée du test = V − 1 ; 6  I62 à I64.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'j' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const AVANT = '2026-10-30T18:00:00+00:00';
const DATES = ['10-23', '10-16', '10-09', '10-02', '09-25', '09-18'];   // de la plus récente à la plus ancienne
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const plat = (s) => s.replace(/[  ]/g, ' ');

// `seances` : de la plus récente à la plus ancienne, chacune `{ reps: [..], ressenti }` (le ressenti est celui de la DERNIÈRE série).
function histoire(kg, seances) {
  return seances.map((s, i) => ({
    seance: { id: 'H' + i, debut: jour(DATES[i]) },
    series: s.reps.map((r, j) => brute(kg, r, j === s.reps.length - 1 ? s.ressenti : null))
  }));
}
const consigne = (groupes, options) => M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {})).consigne;
const fond = (k) => k.fondement.effortVise;
const sains = (kg, reps, nb) => Array.from({ length: nb }, () => ({ reps: [reps, reps, reps] }));

// Deux séances à 5-5-5 (Prudent déclenche), la dernière porte la réponse ; avant : des séances sans réponse.
function lourd(dernier, avantDernier, options) {
  return consigne(histoire(100, [Object.assign({ reps: [5, 5, 5] }, dernier), Object.assign({ reps: [5, 5, 5] }, avantDernier || {})]
    .concat(sains(100, 5, 4))), Object.assign({ reglage: 'prudent' }, options || {}));
}

describe('169 — la table : Prudent vise 2 en Lourd et en Mix', () => {
  test('Prudent Lourd = Mix = 2, sa ligne de test 1 ; les autres cases ne bougent pas', () => {
    expect(M.reserveVisee({ zone: 'lourd', role: 'ligne', reglage: 'prudent' })).toBe(2);
    expect(M.reserveVisee({ zone: 'mix', role: 'ligne', reglage: 'prudent' })).toBe(2);
    expect(M.reserveVisee({ zone: 'lourd', role: 'test', reglage: 'prudent' })).toBe(1);
    ['hypertrophie', 'volume', 'series_longues'].forEach((z) => expect(M.reserveVisee({ zone: z, role: 'ligne', reglage: 'prudent' })).toBe(2));
    expect(M.reserveVisee({ zone: 'lourd', role: 'ligne', reglage: 'normal' })).toBe(2);
    expect(M.reserveVisee({ zone: 'lourd', role: 'ligne', reglage: 'franc' })).toBe(1);
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc' })).toBe(0);
  });
});

describe('169 — Prudent Lourd, 100 kg 5-5-5 deux fois', () => {
  test('prémisse : la zone est Lourd (3-5), le déclencheur Prudent joue sans réponse', () => {
    const k = lourd({});
    expect(k.zone).toBe('lourd');
    expect(k.etat).toBe('test_propose');
  });
  test('R = 3 monte, R = 2 monte (c’était bloqué à 3), non noté monte', () => {
    expect(lourd({ ressenti: 'reste_3_plus' }).etat).toBe('test_propose');
    expect(lourd({ ressenti: 'reste_2' }).etat).toBe('test_propose');
    expect(lourd({ ressenti: 'reste_2' }).fondement.effortVise).toBeUndefined();
  });
  test('R = 1 garde, R = 0 garde : une fois', () => {
    ['reste_1', 'reste_0'].forEach((r) => {
      const k = lourd({ ressenti: r });
      expect(k.etat).toBe('progression');
      expect(k.haut).toBeNull();
      expect(fond(k)).toMatchObject({ effet: 'garde', charge: 100, reps: 5, auHaut: true, deja: false });
    });
  });
  test('R = 1 puis, la séance suivante au haut, R = 1 : le test est posé (la sortie)', () => {
    const k = lourd({ ressenti: 'reste_1' }, { ressenti: 'reste_1' });
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBeGreaterThan(100);
    expect(fond(k)).toMatchObject({ effet: 'test', sortie: true, deja: true, charge: 100, reserve: 1, visee: 2 });
    expect(k.fondement.preuve).toBeUndefined();
  });
  test('R = 0 puis R = 0 : pareil ; R = 0 puis R = 1 : pareil (R < V les deux fois)', () => {
    expect(fond(lourd({ ressenti: 'reste_0' }, { ressenti: 'reste_0' }))).toMatchObject({ effet: 'test', sortie: true });
    expect(fond(lourd({ ressenti: 'reste_1' }, { ressenti: 'reste_0' }))).toMatchObject({ effet: 'test', sortie: true });
  });
  test('la séance d’avant sans réponse, ou avec R ≥ V : la garde reste une première fois', () => {
    expect(fond(lourd({ ressenti: 'reste_1' }, {}))).toMatchObject({ effet: 'garde', deja: false });
    expect(fond(lourd({ ressenti: 'reste_1' }, { ressenti: 'reste_2' }))).toMatchObject({ effet: 'garde', deja: false });
  });
  test('la séance d’avant à une autre charge : la garde reste une première fois', () => {
    const g = histoire(100, [{ reps: [5, 5, 5], ressenti: 'reste_1' }, { reps: [5, 5, 5], ressenti: 'reste_1' }].concat(sains(100, 5, 4)));
    g[1].series.forEach((s) => { s.charge_kg = 97.5; });
    const k = consigne(g, { reglage: 'prudent' });
    expect(fond(k)).toBeUndefined();   // le déclencheur Prudent (deux séances au même palier) ne joue plus : rien ne s’écrit
  });
});

describe('169 — Normal, Hypertrophie : 30 kg × 10 à l’échec', () => {
  const hyper = (dernier, avantDernier) => consigne(histoire(30, [Object.assign({ reps: [10, 10, 10] }, dernier), Object.assign({ reps: [10, 10, 10] }, avantDernier || {})]
    .concat(sains(30, 9, 4))));
  test('1re fois : on garde, et la phrase dit la sortie', () => {
    const k = hyper({ ressenti: 'reste_0' });
    expect(k.zone).toBe('hypertrophie');
    expect(fond(k)).toMatchObject({ effet: 'garde', auHaut: true, deja: false });
    expect(plat(M.libellesConsigne(k).gris)).toBe('30 kg × 10, sans marge. On garde 30 kg : encore une fois au haut de ta zone et je teste plus lourd.');
  });
  test('avec 1 en réserve pour 2 visées (Prudent) : la phrase 1 dit la réserve notée', () => {
    const k = lourd({ ressenti: 'reste_1' });
    expect(plat(M.libellesConsigne(k).gris)).toBe('100 kg × 5, avec 1 en réserve. On garde 100 kg : encore une fois au haut de ta zone et je teste plus lourd.');
  });
  test('2e fois : le test est posé, la phrase le dit', () => {
    const k = hyper({ ressenti: 'reste_0' }, { ressenti: 'reste_0' });
    expect(k.etat).toBe('test_propose');
    expect(fond(k)).toMatchObject({ effet: 'test', sortie: true });
    // En tête de la séance où le test se fait : « aujourd'hui » ; à la fin de la séance d'avant : « Prochaine fois ».
    expect(plat(M.libellesConsigne(k).gris)).toBe('Deux fois 30 kg × 10 au haut de ta zone : aujourd’hui, on teste ≈ 32,5 kg × 6.');
    expect(plat(M.phraseEffortVise(fond(k), k.haut))).toBe('Deux fois 30 kg × 10 au haut de ta zone. Prochaine fois : on teste ≈ 32,5 kg × 6.');
  });
  test('le « Pourquoi » dit la même chose, sans jargon', () => {
    const premiere = M.pourquoiConsigne(hyper({ ressenti: 'reste_0' }), 'normal', AVANT);
    expect(plat(premiere.etat)).toMatch(/On garde 30 kg : encore une fois au haut de ta zone et je teste plus lourd\./);
    const k = hyper({ ressenti: 'reste_0' }, { ressenti: 'reste_0' });
    const p = plat(M.pourquoiConsigne(k, 'normal', AVANT).etat);
    expect(p).toMatch(/Deux séances de suite, 30 kg × 10 au haut de ta zone, sans la marge visée : on teste le cran au-dessus/);
    expect(p).not.toMatch(/RIR|RPE|palier/);
  });
  test('sous le haut de la zone : inchangé (R < V retient, jamais de test, la phrase ne promet rien)', () => {
    const k = hyper({ reps: [10, 10, 9], ressenti: 'reste_0' }, { reps: [10, 10, 9], ressenti: 'reste_0' });
    expect(k.etat).not.toBe('test_propose');
    if (fond(k)) {
      expect(fond(k).sortie).toBeUndefined();
      expect(fond(k).auHaut).toBe(false);
      expect(plat(M.phraseEffortVise(fond(k), null))).toBe('30 kg × 9, sans marge. On garde 30 kg la prochaine fois.');
    }
  });
  test('Franc, Hypertrophie (V = 0) : rien ne bloque, la sortie ne joue jamais', () => {
    const k = consigne(histoire(30, [{ reps: [10, 10, 10], ressenti: 'reste_0' }, { reps: [10, 10, 10], ressenti: 'reste_0' }].concat(sains(30, 9, 4))), { reglage: 'franc' });
    expect(fond(k)).toBeUndefined();   // V = 0 : une réserve notée ne peut pas être sous la visée
  });
  test('Franc, Lourd (V = 1) : R = 0 garde, puis la sortie pose UN cran (jamais un double cran)', () => {
    const k = consigne(histoire(100, [{ reps: [5, 5, 5], ressenti: 'reste_0' }, { reps: [5, 5, 5], ressenti: 'reste_0' }].concat(sains(100, 5, 4))), { reglage: 'franc' });
    expect(fond(k)).toMatchObject({ effet: 'test', sortie: true });
    expect(k.fondement.preuve).toBeUndefined();
    expect(k.haut.charge).toBe(102.5);
  });
});

describe('169 — une séance allégée ne compte pas', () => {
  // 10-23 (R = 1) · 10-16 (décharge, 5-5-5 avec 3 en réserve : si elle comptait, la garde serait une première fois) · 10-09 (R = 1).
  const sans = () => histoire(100, [{ reps: [5, 5, 5], ressenti: 'reste_1' }, { reps: [5, 5, 5], ressenti: 'reste_3_plus' },
    { reps: [5, 5, 5], ressenti: 'reste_1' }].concat(sains(100, 5, 3)));
  test('la décharge entre les deux séances est neutre : la sortie lit la séance normale suivante', () => {
    const k = consigne(sans(), { reglage: 'normal', periodesAllegees: [{ debut: '2026-10-15', fin: '2026-10-17' }] });
    expect(fond(k)).toMatchObject({ effet: 'test', sortie: true, reserve: 1 });
  });
  test('témoin : sans la période allégée, la séance du milieu compte, et la garde reste une première fois', () => {
    const k = consigne(sans(), { reglage: 'normal' });
    expect(fond(k)).toMatchObject({ effet: 'garde', deja: false });
  });
});

// ── Le plan : les puces seulement où la règle joue ───────────────────────────
function plan(kg, mesure, options) {
  const o = options || {};
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const gr = histoire(kg, sains(kg, 9, 5).map((s, i) => (i === 0 ? { reps: [9, 9, 9], ressenti: null } : s)));
  const c = M.consigneDExercice(gr, undefined, AVANT, Object.assign({}, OPTIONS, o.moteur || {}));
  return { se, c, id };
}
function entreesDe(p, fini) {
  const exos = p.se.exercices;
  if (fini) [0, 1, 2].forEach((i) => {
    p.se = S.modifierSerie(p.se, 0, i, { charge_kg: 0, reps: 9 });
  });
  return { seance: { id: 'S', debut: AVANT, edition: false, exercices: p.se.exercices }, consignes: { dc: p.c }, paris: [], suites: {} };
}

describe('169 — « garde-en N » et les puces : jamais au poids du corps, jamais avec une aide', () => {
  const planDe = (palier) => {
    const p = plan(40, 'charge_reps');
    const c = JSON.parse(JSON.stringify(p.c));
    c.consigne.palier = palier;
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: p.se.exercices }, consignes: { dc: c }, paris: [], suites: {} };
    return T.planDeSeance(e);
  };
  test('palier 40 : la réserve visée existe (le témoin)', () => {
    expect(planDe(40).exercices[0].reserveVisee).toBe(1);
  });
  test('poids du corps (palier 0) : ni réserve visée ni puces', () => {
    const x = planDe(0).exercices[0];
    expect(x.reserveVisee).toBeNull();
    expect(x.effortVise).toBeNull();
  });
  test('avec une aide (palier < 0) : ni réserve visée ni puces', () => {
    const x = planDe(-20).exercices[0];
    expect(x.reserveVisee).toBeNull();
    expect(x.effortVise).toBeNull();
  });
  test('une seule fonction d’éligibilité, lue par le moteur et par le plan', () => {
    expect(M.effortViseEligible(40)).toBe(true);
    expect(M.effortViseEligible(0)).toBe(false);
    expect(M.effortViseEligible(-10)).toBe(false);
    expect(M.effortViseEligible(null)).toBe(false);
  });
  test('moteur : au poids du corps et avec une aide, la règle ne joue pas', () => {
    [0, -20].forEach((kg) => {
      const k = consigne(histoire(kg, [{ reps: [10, 10, 10], ressenti: 'reste_0' }, { reps: [10, 10, 10], ressenti: 'reste_0' }].concat(sains(kg, 10, 3))), { mesure: 'reps' });
      expect(k.fondement.effortVise).toBeUndefined();
    });
  });
});

describe('169 — la visée affichée sur la série de test est V − 1', () => {
  const planAvec = (reps) => {
    let k = 0;
    const id = () => 't-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    const c = M.consigneDExercice(histoire(40, [{ reps }].concat(sains(40, 9, 4))), undefined, AVANT, OPTIONS);
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {} };
    return { e, x: T.planDeSeance(e).exercices[0] };
  };
  test('sans test (sous le haut) : la visée est V (1 en hypertrophie)', () => {
    expect(planAvec([9, 9, 9]).x.reserveVisee).toBe(1);
  });
  test('avec une ligne de test (au haut de la zone) : la visée de l’en-tête est V − 1 (0), et I56 le voit', () => {
    const { e, x } = planAvec([10, 10, 10]);
    expect(x.lignes.some((l) => l.role === 'test')).toBe(true);
    expect(x.reserveVisee).toBe(M.reserveVisee({ zone: 'hypertrophie', role: 'test', reglage: 'normal' }));
    expect(x.reserveVisee).toBe(0);
    expect(T.verifierPlan(T.planDeSeance(e), e, null).erreurs).toEqual([]);
  });
});

describe('169 — le plan d’une sortie passe tous les invariants (I57 : pas de réserve exigée ; I62 : un cran, après une garde)', () => {
  test('30 kg × 10 à l’échec deux fois : le test est posé, sans erreur', () => {
    let k = 0;
    const id = () => 'u-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    const c = M.consigneDExercice(histoire(30, [{ reps: [10, 10, 10], ressenti: 'reste_0' }, { reps: [10, 10, 10], ressenti: 'reste_0' }].concat(sains(30, 9, 4))), undefined, AVANT, OPTIONS);
    expect(c.consigne.fondement.effortVise.sortie).toBe(true);
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {} };
    expect(T.verifierPlan(T.planDeSeance(e), e, null).erreurs).toEqual([]);
  });
});

// ── I62 à I64 ────────────────────────────────────────────────────────────────
describe('169 — I62 à I64 voient chacun leur violation', () => {
  const base = () => {
    const p = plan(40, 'charge_reps');
    return p;
  };
  const verifier = (mut) => {
    const p = base();
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: p.se.exercices }, consignes: { dc: p.c }, paris: [], suites: {} };
    const pl = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    mut(pl.exercices[0]);
    return T.verifierPlan(pl, e, null).erreurs.join('\n');
  };
  test('le plan sain n’en lève aucun', () => {
    expect(verifier(() => {})).toBe('');
  });
  test('I62 — une garde au haut de la zone alors que la séance d’avant avait déjà gardé', () => {
    expect(verifier((x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 0, visee: 1, auHaut: true, deja: true }; })).toMatch(/I62/);
  });
  test('I62 — une sortie qui n’est pas un test posé après une première garde', () => {
    expect(verifier((x) => { x.consigne.fondement.effortVise = { effet: 'test', charge: 40, reps: 9, reserve: 0, visee: 1, sortie: true, deja: false }; })).toMatch(/I62/);
  });
  test('I63 — des puces sur un exercice au poids du corps', () => {
    expect(verifier((x) => { x.consigne.palier = 0; })).toMatch(/I63/);
  });
  test('I63 — une aide', () => {
    expect(verifier((x) => { x.consigne.palier = -10; })).toMatch(/I63/);
  });
  test('I64 — la visée du fondement n’est pas celle de la table', () => {
    expect(verifier((x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 0, visee: 3, auHaut: true, deja: false }; })).toMatch(/I64/);
  });
  test('I64 — la charge de l’effort visé n’est pas le palier', () => {
    expect(verifier((x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 50, reps: 9, reserve: 0, visee: 1, auHaut: true, deja: false }; })).toMatch(/I64/);
  });
});
