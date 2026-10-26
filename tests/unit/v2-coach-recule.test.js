/** @jest-environment node */
//
// 174 — LE COACH SAIT RECULER (MOTEUR §9.1.2, décision d'Aurélien du 26/10/2026).
//
//   1  sous 3 reps, une barre ratée fait reculer d'un cran, aux reps VISÉES ;
//   2  une réserve notée sous la visée garde la charge UNE séance ; 0 en réserve ne fait JAMAIS reculer ;
//   3  trois séances sans monter au-dessus du meilleur : on repart de P × 0,95 arrondi au cran ;
//   4  une séance allégée ne compte pas ; une reprise remet à zéro ;
//   5  les phrases, I65.
//
// Chaque cas passe par `consigneDExercice`, comme l'app : contrat, séances allégées, puis la consigne. Les fixtures
// montent par pas de 2,5 kg (le cran se lit sur l'historique) et leurs reps (≤ 2) rangent l'exercice SANS zone.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();   // une séance tous les 3 jours

// `liste` : chronologique, `[kg, reps | [reps…], ressenti?]`.
function groupes(liste) {
  return liste.map(([kg, reps, ressenti], i) => ({
    seance: { id: 'H' + i, debut: jourN(i) },
    series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r, j, tout) =>
      brute(kg, r, j === tout.length - 1 ? ressenti : null))
  }));
}
const avantDe = (liste, jours) => new Date(Date.parse(jourN(liste.length - 1)) + (jours || 3) * 864e5).toISOString();
const consigne = (liste, options) =>
  M.consigneDExercice(groupes(liste), undefined, avantDe(liste), Object.assign({}, OPTIONS, options || {})).consigne;

// Une montée régulière jusqu'à 140 (pas de 2,5) : le cran est connu, l'exercice est sans zone (2 reps).
const MONTEE = [[130, 2], [132.5, 2], [135, 2], [137.5, 2]];
const GRIS = (k) => M.libellesConsigne(k).gris;
const plat = (s) => s.replace(/[  ]/g, ' ');

describe('174 — la séance d\'avant a fait toutes les reps visées', () => {
  test('140 × 2 réussi, sans réserve notée → le cran au-dessus, aux mêmes reps (comme avant)', () => {
    const k = consigne(MONTEE.concat([[140, 2]]));
    expect(k.etat).toBe('bord');
    expect(k.zone).toBeNull();
    expect(k.ligne).toEqual({ charge: 142.5, vise: 2 });
  });

  test('140 × 2 réussi à 0 en réserve → on garde 140 ; refait pareil → 142,5', () => {
    const k1 = consigne(MONTEE.concat([[140, 2, 'reste_0']]));
    expect(k1.etat).toBe('bord_garde');
    expect(k1.ligne).toEqual({ charge: 140, vise: 2 });
    expect(plat(GRIS(k1))).toBe('140 kg × 2, sans marge. On garde 140 kg ; la prochaine fois, on retente au-dessus.');
    const k2 = consigne(MONTEE.concat([[140, 2, 'reste_0'], [140, 2, 'reste_0']]));
    expect(k2.etat).toBe('bord');
    expect(k2.ligne).toEqual({ charge: 142.5, vise: 2 });
  });

  test('0 en réserve n\'entraîne JAMAIS un recul : même avec un RPE 10, les reps faites sont les visées', () => {
    const rpe = groupes(MONTEE.concat([[140, 2]]));
    rpe[rpe.length - 1].series.forEach((s) => { s.rpe = 10; });
    ['reste_0', 'reste_1', 'reste_2'].forEach((r) => {
      const k = consigne(MONTEE.concat([[140, 2, r]]));
      expect(['bord', 'bord_garde']).toContain(k.etat);
      expect(k.ligne.charge).toBeGreaterThanOrEqual(140);
    });
    const k = M.consigneDExercice(rpe, undefined, avantDe(MONTEE.concat([[140, 2]])), OPTIONS).consigne;
    expect(['bord', 'bord_garde']).toContain(k.etat);
    expect(k.ligne.charge).toBeGreaterThanOrEqual(140);
  });

  test('une réserve au niveau de la visée (2) ne garde pas', () => {
    const k = consigne(MONTEE.concat([[140, 2, 'reste_2']]));
    expect(k.etat).toBe('bord');
    expect(k.ligne.charge).toBe(142.5);
  });
});

describe('174 — une barre ratée fait reculer d\'un cran, aux reps visées', () => {
  test('140 × 1 sur 2 visées → 137,5 × 2', () => {
    const k = consigne(MONTEE.concat([[140, [1, 1, 1]]]));
    expect(k.etat).toBe('bord_recul');
    expect(k.zone).toBeNull();
    expect(k.ligne).toEqual({ charge: 137.5, vise: 2 });
    expect(k.fondement.bord).toEqual({ charge: 140, faites: 1, visees: 2 });
    expect(plat(GRIS(k))).toBe('140 kg × 1 sur 2 visées. On repart d\'un cran plus bas, aux mêmes reps ; on remonte dès que les deux passent.');
  });

  test('DISCRIMINANT — les reps visées, pas les reps faites : 1 rep faite, la consigne en vise 2', () => {
    const k = consigne(MONTEE.concat([[140, [2, 1, 1]]]));
    expect(k.etat).toBe('bord_recul');
    expect(k.ligne.vise).toBe(2);
  });

  test('la rep manquée sur une SEULE série suffit', () => {
    const k = consigne(MONTEE.concat([[140, [2, 2, 1]]]));
    expect(k.etat).toBe('bord_recul');
  });

  test('après le recul, 137,5 × 2 réussi → le cran au-dessus (140), les reps visées sont tenues', () => {
    const k = consigne(MONTEE.concat([[140, [1, 1, 1]], [137.5, 2]]));
    expect(k.etat).toBe('bord');
    expect(k.ligne).toEqual({ charge: 140, vise: 2 });
  });

  test('un recul qui rate encore reste aux reps VISÉES de la première consigne', () => {
    const k = consigne(MONTEE.concat([[140, [1, 1, 1]], [137.5, [1, 1, 1]]]));
    expect(k.etat).toBe('bord_recul');
    expect(k.ligne).toEqual({ charge: 135, vise: 2 });
  });

  test('retrouver son meilleur après un recul n\'est pas une séance qui stagne', () => {
    const k = consigne(MONTEE.concat([[140, 2], [140, [1, 1, 1]], [137.5, 2], [140, 2]]));
    expect(k.etat).toBe('bord');
    expect(k.ligne.charge).toBe(142.5);
  });

  test('sans consigne reçue (première séance du couple), rien n\'est jugé : la règle d\'avant', () => {
    const k = consigne([[140, [1, 1, 1]]]);
    expect(k.etat).toBe('bord');
  });
});

describe('174 — trois séances sans monter : on repart de P × 0,95, arrondi au cran', () => {
  const SANS = (nb) => MONTEE.concat([[140, 2]]).concat(Array.from({ length: nb }, () => [140, 2]));

  test('140 × 2 depuis trois séances → 132,5 (140 × 0,95 = 133, au cran le plus proche)', () => {
    const k = consigne(SANS(3));
    expect(k.etat).toBe('bord_vague');
    expect(k.ligne).toEqual({ charge: 132.5, vise: 2 });
    expect(plat(GRIS(k))).toBe('140 kg × 2 depuis 3 séances. On repart de 132,5 kg pour reprendre de l\'élan.');
  });

  test('deux séances sans monter : pas encore', () => {
    expect(consigne(SANS(2)).etat).toBe('bord');
  });

  test('une séance plus haute que le meilleur remet à zéro', () => {
    const k = consigne(SANS(2).concat([[142.5, 2], [142.5, 2]]));
    expect(k.etat).toBe('bord');
  });

  test('DISCRIMINANT — une séance allégée au milieu ne compte pas', () => {
    const liste = SANS(2).concat([[140, 2]]);    // trois sans monter : la vague…
    expect(consigne(liste).etat).toBe('bord_vague');
    // … sauf si l'une d'elles tombe dans une semaine allégée (la 165 : neutre, ni comptée ni jugée).
    const jourAllege = jourN(MONTEE.length + 2).slice(0, 10);
    const k = consigne(liste, { periodesAllegees: [{ debut: jourAllege, fin: jourAllege }] });
    expect(k.etat).toBe('bord');
  });

  test('après la vague, la séance à 132,5 repart de ce niveau : pas de seconde vague', () => {
    const k = consigne(SANS(3).concat([[132.5, 2]]));
    expect(k.etat).toBe('bord');
    expect(k.ligne.charge).toBe(135);
  });

  test('une reprise remet le compte à zéro', () => {
    const liste = SANS(3);
    const k = M.consigneDExercice(groupes(liste), undefined, avantDe(liste, 60), OPTIONS).consigne;
    expect(['reprise_courte', 'reprise_longue']).toContain(k.etat);
  });
});

describe('174 — l\'exercice au poids du corps et l\'aide gardent la règle d\'avant', () => {
  test('une aide (charge négative) : le cran, sans recul', () => {
    const k = M.consignePour(
      [{ debut: jourN(0), palier: -20, series: [1, 2, 3].map(() => ({ charge_kg: -20, reps: 1, rpe: null, role: 'palier' })) },
       { debut: jourN(1), palier: -20, series: [1, 2, 3].map(() => ({ charge_kg: -20, reps: 1, rpe: null, role: 'palier' })) }],
      jourN(2), { reglage: 'normal', equipement: 'machine', correction: null });
    expect(['bord_recul', 'bord_garde', 'bord_vague']).not.toContain(k.etat);
  });
});

describe('174 — dans le plan : la phrase est citée, I65 voit chacune de ses violations', () => {
  const plan = (liste) => {
    let k = 0;
    const id = () => 'q-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    const c = M.consigneDExercice(groupes(liste), undefined, avantDe(liste), OPTIONS);
    const avant = avantDe(liste);
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {} };
    return { e, plan: T.planDeSeance(e) };
  };
  const verifier = (liste, mut) => {
    const { e, plan: p } = plan(liste);
    const pl = JSON.parse(JSON.stringify(p));
    if (mut) mut(pl.exercices[0]);
    return T.verifierPlan(pl, e, null).erreurs.join('\n');
  };
  const RATE = MONTEE.concat([[140, [1, 1, 1]]]);

  test('le plan d\'un recul, d\'une garde et d\'une vague est sain (I1 à I65)', () => {
    expect(verifier(RATE)).toBe('');
    expect(verifier(MONTEE.concat([[140, 2, 'reste_0']]))).toBe('');
    expect(verifier(MONTEE.concat([[140, 2], [140, 2], [140, 2], [140, 2]]))).toBe('');
  });
  test('la consigne du plan est bien un recul (la fixture déclenche le chemin)', () => {
    expect(plan(RATE).plan.exercices[0].consigne.etat).toBe('bord_recul');
  });
  test('I65 — un recul qui monte', () => {
    expect(verifier(RATE, (x) => { x.consigne.ligne.charge = 142.5; })).toMatch(/I65/);
  });
  test('I65 — un recul qui vise les reps faites', () => {
    expect(verifier(RATE, (x) => { x.consigne.ligne.vise = 1; })).toMatch(/I65/);
  });
  test('I65 — un recul sans barre ratée', () => {
    expect(verifier(RATE, (x) => { x.consigne.fondement.bord.faites = 2; })).toMatch(/I65/);
  });
  test('I65 — une vague qui monte', () => {
    expect(verifier(MONTEE.concat([[140, 2], [140, 2], [140, 2], [140, 2]]), (x) => { x.consigne.ligne.charge = 145; })).toMatch(/I65/);
  });
  test('I65 — une garde qui change la charge', () => {
    expect(verifier(MONTEE.concat([[140, 2, 'reste_0']]), (x) => { x.consigne.ligne.charge = 142.5; })).toMatch(/I65/);
  });
});
