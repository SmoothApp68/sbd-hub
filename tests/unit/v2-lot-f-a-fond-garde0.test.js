/** @jest-environment node */
//
// Lot F, étape 1 (20/11/2026, MOTEUR §9.14 ter delta, TT-AFOND-G0 corrigé par CONTRA-AFOND-G0, I243) — « à fond » à GARDE 0 des lignes : une série
// à fond à la charge de sa ligne fait suivre TOUTE la suite à cette charge (r − 1 dans la zone ; au bas de la zone : bas, jamais r + 1), jamais au-dessus
// d'une visée déjà baissée (monotonie) ; au bas de la zone ou dessous, la parole est cédée à la réaction au raté (D, L). La garde ≥ 1 ne change pas.
// Par le vrai chemin (planDeSeance + verifierPlan). Chaque test discriminant échoue sur main.
process.env.TZ = 'Europe/Paris';
global.window = global;
require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const Plan = require('../../v2/js/plan.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const CAT = { x: { nom: 'Presse', equipement: 'machine', mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['quadriceps'] } };
const cons = { etat: 'progression', zone: 'hypertrophie', palier: 70, niveau: 9, n: 4, ligne: { charge: 70, vise: 10 }, haut: null };

function seanceAvec(faites, n) {
  let k = 0; const id = () => 'x-s' + (++k);
  let se = Seance.creer({ id: 'S', userId: 'u', idSerie: id }); se = Seance.ajouterExercice(se, 'x', id, { series: n || 4 });
  faites.forEach((f, t) => {
    se = Seance.modifierSerie(se, 0, t, { charge_kg: f[0], reps: f[1] });
    se = Seance.definirEffort(se, 0, t, { rpe: f[2], ressenti: null });
    se = Seance.valider(se, 0, t, new Date('2026-10-11T10:' + (30 + 3 * t) + ':00Z'));
  });
  return se;
}
function jouer(faites, reglage, extra) {
  const se = seanceAvec(faites, (extra && extra.n) || 4);
  const e = Object.assign({ seance: { id: 'S', debut: '2026-10-11T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: { consigne: cons, contexte: { cran: 2.5, haut: null } } }, reglage, paris: [], objectif: 'muscle', catalogue: CAT }, extra || {});
  delete e.n;
  const p = Plan.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: Plan.verifierPlan(p, e, null).erreurs };
}
const restantes = (x) => x.lignes.filter((l) => l.type === 'travail' && !l.validee).map((l) => [l.charge, l.vise]);
// Le chemin réel de l'app, série par série : les paris posés par le plan d'avant, observés sur la série validée (`set_observe`), figent les lignes
// validées (`Seance.figeesDe`) ; les paris non observés restent posés.
function jouerFige(faites, reglage, extra) {
  const ex = Object.assign({}, extra || {});
  let observes = [];
  let r = jouer([], reglage, Object.assign({}, ex, { paris: [] }));
  for (let t = 1; t <= faites.length; t++) {
    const ids = seanceAvec(faites.slice(0, t), ex.n || 4).exercices[0].series.map((q) => q.id);
    const avant = Object.keys(r.x.paris).map((k) => r.x.paris[k]).filter(Boolean);
    const pt = avant.find((q) => Number(q.fondement.rang) === t);
    if (pt) observes.push(Object.assign({ id: 'pari-' + t }, pt, { set_observe: ids[t - 1] }));
    const libres = avant.filter((q) => Number(q.fondement.rang) > t).map((q, i) => Object.assign({ id: 'pn-' + t + '-' + i }, q));
    r = jouer(faites.slice(0, t), reglage, Object.assign({}, ex, { paris: observes.concat(libres) }));
  }
  return r;
}

describe('garde 0 (Franc, une machine), la série dans la zone, au-dessus du bas', () => {
  test('1. 70 × 9 à fond, 4 séries : toute la suite vise 8, une voix (main : 8, 10, 10)', () => {
    const r = jouer([[70, 9, 10]], 'franc');
    expect(r.x.gardeDeLigne).toBe(0);
    expect(restantes(r.x)).toEqual([[70, 8], [70, 8], [70, 8]]);
    expect(sp(r.x.message.phrase)).toBe('70 kg × 9, sans marge : la suite vise 8.');
    expect(r.x.rate).toBeNull();
    expect(r.erreurs).toEqual([]);
  });
  test('une seule ligne qui suit : « la suivante »', () => {
    const r = jouer([[70, 10, 9], [70, 10, 9], [70, 9, 10]], 'franc');
    expect(restantes(r.x)).toEqual([[70, 8]]);
    expect(sp(r.x.message.phrase)).toBe('70 kg × 9, sans marge : la suivante vise 8.');
    expect(r.erreurs).toEqual([]);
  });
});

describe('garde 0, au bas de la zone ou dessous : la réaction au raté parle', () => {
  test('3. 70 × 8 à fond (le bas) : D, la suite vise 8, jamais 9 (main : « vise 7 »)', () => {
    const r = jouer([[70, 8, 10]], 'franc');
    expect(r.x.message).toBeNull();
    expect(r.x.rate && r.x.rate.cas).toBe('D');
    restantes(r.x).forEach(([c, v]) => { if (c === 70) expect(v).toBe(8); });
    expect(r.erreurs).toEqual([]);
  });
  test('2. 70 × 7 à fond (sous le bas) : L parle, la suite à 70 kg vise le bas, 8 (main : « vise 6 », L tu ; CONTRA-723 B2 : avant, 10)', () => {
    const r = jouer([[70, 7, 10]], 'franc');
    expect(r.x.message).toBeNull();
    expect(r.x.rate && r.x.rate.cas).toBe('L');
    expect(restantes(r.x)).toEqual([[70, 8], [70, 8], [70, 8]]);
    expect(r.erreurs).toEqual([]);
  });
  test('la réaction muette, par le plan (CONTRA-723 B2, C3) : deux L ignorés puis 70 × 7 à fond — le message garde la parole, la suite vise 8, jamais 10', () => {
    const r = jouerFige([[70, 7, 10], [70, 7, 10], [70, 7, 10]], 'franc', { n: 5 });
    expect(r.x.rate).toBeNull();
    expect(sp(r.x.message.phrase)).toBe('70 kg × 7, sans marge : la suite vise 8.');
    expect(restantes(r.x)).toEqual([[70, 8], [70, 8]]);
    expect(r.erreurs).toEqual([]);
  });
  test('le vérificateur : sous le bas, une ligne laissée à sa visée est une erreur I243', () => {
    const r = jouer([[70, 7, 10]], 'franc');
    const lignes = r.x.lignes.map((l) => (l.validee || l.type !== 'travail' ? l : Object.assign({}, l, { vise: 10, source: 'consigne' })));
    const faux = Object.assign({}, r.p, { exercices: [Object.assign({}, r.x, { lignes })] });
    expect(Plan.verifierPlan(faux, r.e, null).erreurs.some((m) => /^I243/.test(m))).toBe(true);
  });
});

describe('après un 0 rep, les bornes « à fond » tiennent (CONTRA-723 B1) : la réaction au zéro parle, la suite ne remonte pas', () => {
  test('70 × 9 à fond puis 70 × 0 : la suite à 70 kg vise 8, jamais 10 ; aucun message « à fond » (une voix)', () => {
    const r = jouerFige([[70, 9, 10], [70, 0, null]], 'franc');
    expect(r.x.message).toBeNull();
    expect(r.x.rate && r.x.rate.cas).toBe('Z2');
    expect(restantes(r.x)).toEqual([[70, 8], [70, 8]]);
    expect(r.erreurs).toEqual([]);
  });
  test('70 × 9 à fond puis 75 × 0 (plus lourd) : les lignes à 70 kg visent 8, Z parle seule', () => {
    const r = jouerFige([[70, 9, 10], [75, 0, null]], 'franc', { n: 5 });
    expect(r.x.message).toBeNull();
    expect(r.x.rate && r.x.rate.cas).toBe('Z2');
    expect(restantes(r.x)).toEqual([[70, 8], [70, 8], [70, 8]]);
    expect(r.erreurs).toEqual([]);
  });
});

describe('la monotonie (I243) : une suite ne remonte jamais au-dessus d’une visée déjà baissée', () => {
  test('9 à fond puis 9 à RPE 8 : la suite reste à 8 (main : remontait à 10)', () => {
    const r = jouer([[70, 9, 10], [70, 9, 8]], 'franc');
    restantes(r.x).forEach(([c, v]) => { if (c === 70) expect(v).toBeLessThanOrEqual(8); });
    expect(r.erreurs).toEqual([]);
  });
  test('9 à fond puis 8 à fond (le bas) : la suite reste à 8, jamais 9 ni 10', () => {
    const r = jouer([[70, 9, 10], [70, 8, 10]], 'franc');
    restantes(r.x).forEach(([c, v]) => { if (c === 70) expect(v).toBe(8); });
    expect(r.erreurs).toEqual([]);
  });
  test('avec les paris figés de la séance (le chemin réel de l’app)', () => {
    const r1 = jouer([[70, 9, 10]], 'franc');
    // les paris posés au plan d'avant, observés sur les séries validées (`set_observe`) : `Seance.figeesDe` en fait des lignes figées
    const ids = seanceAvec([[70, 9, 10], [70, 8, 10]]).exercices[0].series.map((q) => q.id);
    const paris = Object.keys(r1.x.paris).map((k) => r1.x.paris[k]).filter(Boolean)
      .map((p, i) => Object.assign({ id: 'pari-' + i }, p, Number(p.fondement.rang) <= 2 ? { set_observe: ids[Number(p.fondement.rang) - 1] } : {}));
    const r2 = jouer([[70, 9, 10], [70, 8, 10]], 'franc', { paris });
    expect(r2.x.lignes.filter((l) => l.validee).length).toBe(2);
    restantes(r2.x).forEach(([c, v]) => { if (c === 70) expect(v).toBeLessThanOrEqual(8); });
    expect(r2.erreurs).toEqual([]);
  });
  test('le vérificateur : une ligne remontée au-dessus de la borne est une erreur I243', () => {
    const r = jouer([[70, 9, 10]], 'franc');
    const lignes = r.x.lignes.map((l) => (l.validee || l.type !== 'travail' ? l : Object.assign({}, l, { vise: 10, source: 'consigne' })));
    const faux = Object.assign({}, r.p, { exercices: [Object.assign({}, r.x, { lignes })] });
    expect(Plan.verifierPlan(faux, r.e, null).erreurs.some((m) => /^I243/.test(m))).toBe(true);
  });
});

describe('la garde ≥ 1 ne change pas (étape 1 seulement)', () => {
  test('4. Normal, 70 × 9 à fond : la suivante seule vise 8, « sans marge »', () => {
    const r = jouer([[70, 9, 10]], 'normal');
    expect(r.x.gardeDeLigne).toBe(1);
    expect(restantes(r.x)).toEqual([[70, 8], [70, 10], [70, 10]]);
    expect(sp(r.x.message.phrase)).toBe('70 kg × 9, sans marge : la suivante vise 8.');
    expect(r.erreurs).toEqual([]);
  });
});
