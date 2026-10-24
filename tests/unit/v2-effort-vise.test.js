/** @jest-environment node */
//
// 154 — L'EFFORT VISÉ (MOTEUR §9.26, décisions d'Aurélien du 23/10/2026 18 h 53 et du 24/10/2026 1 h 05).
//
//   A  la table `reserveVisee` (5 zones × 3 réglages, le test −1, les bornes, `null` hors coach) ;
//   C  la règle, dans la consigne : R ≥ V + 2 → le test ; R < V → pas de montée sur sa foi ; R = V ou V + 1 → rien ;
//      en Franc, la même réponse vaut la preuve « effort facile » ;
//   B  le plan : la réserve visée de l'exercice, les puces, la phrase d'après, le fondement du pari, I56 à I58.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const P = require('../../v2/js/palier.js');
const T = require('../../v2/js/plan.js');

const ZONES = ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'];

describe('154 A — la table de la réserve visée', () => {
  const attendu = {
    prudent: { lourd: 3, mix: 3, hypertrophie: 2, volume: 2, series_longues: 2 },
    normal: { lourd: 2, mix: 2, hypertrophie: 1, volume: 1, series_longues: 1 },
    franc: { lourd: 1, mix: 1, hypertrophie: 0, volume: 0, series_longues: 0 }
  };
  Object.keys(attendu).forEach((reglage) => {
    ZONES.forEach((zone) => {
      test(reglage + ' × ' + zone + ' = ' + attendu[reglage][zone], () => {
        expect(M.reserveVisee({ zone, role: 'ligne', reglage })).toBe(attendu[reglage][zone]);
      });
    });
  });

  test('une ligne de test : celle de sa zone moins 1, jamais sous 0', () => {
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'test', reglage: 'normal' })).toBe(0);
    expect(M.reserveVisee({ zone: 'lourd', role: 'test', reglage: 'normal' })).toBe(1);
    expect(M.reserveVisee({ zone: 'lourd', role: 'haut', reglage: 'prudent' })).toBe(2);
    expect(M.reserveVisee({ zone: 'volume', role: 'test', reglage: 'franc' })).toBe(0);
  });

  test('bornée à [0, 3]', () => {
    ZONES.forEach((zone) => ['prudent', 'normal', 'franc'].forEach((reglage) => ['ligne', 'test'].forEach((role) => {
      const v = M.reserveVisee({ zone, role, reglage });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
    })));
  });

  test('`null` sans zone, sans coach, sur une chauffe, une dégressive, une durée', () => {
    expect(M.reserveVisee({ zone: null, role: 'ligne', reglage: 'normal' })).toBeNull();
    expect(M.reserveVisee({ role: 'ligne' })).toBeNull();
    expect(M.reserveVisee({ zone: 'mix', role: 'hors', reglage: 'normal' })).toBeNull();
    expect(M.reserveVisee({ zone: 'mix', role: 'echauffement', reglage: 'normal' })).toBeNull();
    expect(M.reserveVisee({ zone: 'mix', role: 'degressive', reglage: 'normal' })).toBeNull();
    expect(M.reserveVisee({ zone: 'inconnue', role: 'ligne', reglage: 'normal' })).toBeNull();
    expect(M.reserveVisee()).toBeNull();
  });
});

describe('154 — la lecture de la réserve d’une série (palier.js)', () => {
  test('reste_N → N, 3 et + → 3, un RPE → 10 − RPE borné, à l’échec → 0, rien → null', () => {
    expect(P.reserveDeSerie({ ressenti: 'reste_0' })).toBe(0);
    expect(P.reserveDeSerie({ ressenti: 'reste_1' })).toBe(1);
    expect(P.reserveDeSerie({ ressenti: 'reste_2' })).toBe(2);
    expect(P.reserveDeSerie({ ressenti: 'reste_3_plus' })).toBe(3);
    expect(P.reserveDeSerie({ rpe: 8 })).toBe(2);
    expect(P.reserveDeSerie({ rpe: 6 })).toBe(3);
    expect(P.reserveDeSerie({ rpe: 10 })).toBe(0);
    expect(P.reserveDeSerie({ ressenti: null, rpe: null })).toBeNull();
    expect(P.reserveDeSerie(null)).toBeNull();
  });
});

// ── La règle, sur une consigne ──────────────────────────────────────────────
let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };

// Cinq séances au même palier, les plus récentes d’abord ; la dernière porte `derniere` (reps de la 3e série, ressenti).
function histoire(kg, repsHabituelles, derniere) {
  const dates = ['09-13', '09-06', '08-30', '08-23', '08-16'];
  return dates.map((d, i) => {
    const series = [brute(kg, repsHabituelles), brute(kg, repsHabituelles),
      i === 0 ? brute(kg, derniere.reps, derniere.ressenti) : brute(kg, repsHabituelles)];
    return { seance: { id: 'H' + i, debut: jour(d) }, series };
  });
}
const consigne = (groupes, options) =>
  M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {})).consigne;

describe('154 C — la règle, dans la consigne', () => {
  test('prémisse : sans réponse, 9 reps en hypertrophie (haut 10), la ligne monte d’une rep', () => {
    const k = consigne(histoire(40, 9, { reps: 9 }));
    expect(k).toMatchObject({ etat: 'progression', zone: 'hypertrophie', palier: 40 });
    expect(k.fondement.effortVise).toBeUndefined();
  });

  test('R = V + 2 (3 en réserve pour 1 visée) : la séance suivante pose le test, sous le haut de la zone', () => {
    const k = consigne(histoire(40, 9, { reps: 9, ressenti: 'reste_3_plus' }));
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBe(42.5);
    expect(k.fondement.effortVise).toEqual({ effet: 'test', charge: 40, reps: 9, reserve: 3, visee: 1 });
  });

  test('R = V + 1 : rien ne change', () => {
    const k = consigne(histoire(40, 9, { reps: 9, ressenti: 'reste_2' }));
    expect(k.etat).toBe('progression');
    expect(k.fondement.effortVise).toBeUndefined();
  });

  test('R = V : rien ne change', () => {
    const k = consigne(histoire(40, 9, { reps: 9, ressenti: 'reste_1' }));
    expect(k.etat).toBe('progression');
    expect(k.fondement.effortVise).toBeUndefined();
  });

  test('reps sous la visée (7 reps, bas de la zone 8) : la réserve ne compte pas', () => {
    const k = consigne(histoire(40, 9, { reps: 7, ressenti: 'reste_3_plus' }));
    expect(k.fondement.effortVise).toBeUndefined();
    expect(k.etat).toBe('progression');
  });

  test('R < V au haut de la zone : pas de montée sur sa foi (même charge, jamais de ligne haute)', () => {
    // Témoin : au haut de la zone (10), sans réponse, le test est proposé.
    const sans = consigne(histoire(40, 10, { reps: 10 }));
    expect(sans.etat).toBe('test_propose');
    // Avec « 0 en réserve » pour 1 visée : on garde.
    const k = consigne(histoire(40, 10, { reps: 10, ressenti: 'reste_0' }));
    expect(k.etat).toBe('progression');
    expect(k.haut).toBeNull();
    expect(k.fondement.effortVise).toEqual({ effet: 'garde', charge: 40, reps: 10, reserve: 0, visee: 1 });
  });

  test('R = V au haut de la zone : la montée a lieu comme avant', () => {
    expect(consigne(histoire(40, 10, { reps: 10, ressenti: 'reste_1' })).etat).toBe('test_propose');
  });

  test('un RPE vaut la réserve 10 − RPE', () => {
    const g = histoire(40, 9, { reps: 9 });
    g[0].series[2].rpe = 7;   // 3 en réserve
    expect(consigne(g).fondement.effortVise).toMatchObject({ effet: 'test', reserve: 3 });
  });

  test('Franc : la même réponse vaut la preuve « effort facile » — le double cran est permis', () => {
    // Franc, hypertrophie : visée 0, 2 en réserve suffisent. 60 kg : deux crans de 2,5 = 8,3 % (≤ 10 %).
    const g = histoire(60, 9, { reps: 9, ressenti: 'reste_2' });
    const franc = consigne(g, { reglage: 'franc' });
    expect(franc.etat).toBe('test_propose');
    expect(franc.haut.charge).toBe(65);
    expect(franc.fondement.preuve).toBe('facile');
    expect(franc.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 2, visee: 0 });
    // Normal, la même réponse (2 en réserve pour 1 visée) ne dit rien.
    expect(consigne(g).etat).toBe('progression');
  });

  test('Prudent : visée + 1, donc il faut plus de réserve (jamais 2 en réserve en hypertrophie)', () => {
    const k = consigne(histoire(40, 9, { reps: 9, ressenti: 'reste_3_plus' }), { reglage: 'prudent' });
    expect(k.fondement.effortVise).toBeUndefined();
  });

  test('la phrase du test cite la série et la réserve ; celle de la garde dit « sans marge »', () => {
    const t = consigne(histoire(40, 9, { reps: 9, ressenti: 'reste_3_plus' }));
    const dit = M.libellesConsigne(t).gris.replace(/[  ]/g, ' ');
    expect(dit).toBe('On essaie 42,5 kg : la dernière fois, 40 kg × 9 avec 3 en réserve.');
    const g = consigne(histoire(40, 10, { reps: 10, ressenti: 'reste_0' }));
    expect(M.libellesConsigne(g).gris.replace(/[  ]/g, ' ')).toBe('40 kg × 10, sans marge. On garde 40 kg la prochaine fois.');
  });

  test('les phrases d’après la réponse (VOIX-DU-COACH)', () => {
    const f = (s) => s.replace(/[  ]/g, ' ');
    expect(f(M.phraseEffortVise({ effet: 'test', charge: 34, reps: 9, reserve: 3, visee: 1 }, 36)))
      .toBe('34 kg × 9, il t’en restait 3. Au-dessus de ce que je visais : la prochaine fois, on essaie 36 kg.');
    expect(f(M.phraseEffortVise({ effet: 'garde', charge: 130, reps: 5, reserve: 0, visee: 2 }, null)))
      .toBe('130 kg × 5, sans marge. On garde 130 kg la prochaine fois.');
    expect(M.phraseEffortVise(null, 36)).toBeNull();
  });
});

// ── Le plan ──────────────────────────────────────────────────────────────────
function simulateur(consigneObj, ressentiFinal, options) {
  let k = 0;
  const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const o = options || {};
  const api = {
    entrees: () => {
      const travail = se.exercices[0].series.filter((x) => S.typeDe(x) === 'travail');
      const fini = travail.length && travail.every((x) => S.partEnBase(x));
      const e = { seance: { id: 'S', debut: AVANT, edition: !!o.edition, exercices: se.exercices },
        consignes: { dc: consigneObj }, paris: [], reglage: o.reglage,
        suites: {} };
      if (fini) {
        const dernier = travail[travail.length - 1];
        const groupes = histoire(40, 9, { reps: dernier.reps, ressenti: dernier.ressenti });
        e.suites = { dc: { consigne: consigne(groupes, { reglage: o.reglage }), cranSuivant: 42.5 } };
      }
      return e;
    },
    plan: () => T.planDeSeance(api.entrees()),
    exo: () => api.plan().exercices[0],
    verifier: () => { const e = api.entrees(); return T.verifierPlan(T.planDeSeance(e), e, null); },
    series: () => se.exercices[0].series,
    validerTout: () => {
      [0, 1, 2].forEach((i) => {
        se = S.modifierSerie(se, 0, i, { charge_kg: 40, reps: 9 });
        se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
      });
    },
    repondre: (ressenti) => { api.series()[2].ressenti = ressenti; }
  };
  return api;
}

describe('154 B — le plan', () => {
  const base = M.consigneDExercice(histoire(40, 9, { reps: 9 }), undefined, AVANT, OPTIONS);

  test('l’en-tête : la réserve visée de l’exercice, 1 en hypertrophie (Normal)', () => {
    const sim = simulateur(base);
    expect(sim.exo().reserveVisee).toBe(1);
    expect(sim.exo().effortVise).toMatchObject({ visee: 1, serie: 2, reponse: null, demande: false });
  });

  test('le fondement de chaque pari couvert porte `reserve_visee` (la ligne : 1, un test : 0)', () => {
    const sim = simulateur(base);
    const x = sim.exo();
    const paris = (x.paris || []).filter(Boolean);
    expect(paris.length).toBeGreaterThan(0);
    paris.forEach((q) => expect(q.fondement.reserve_visee).toBe(q.fondement.role === 'haut' ? 0 : 1));
  });

  test('les puces se posent quand l’exercice est fini et que la dernière série n’a pas de réponse', () => {
    const sim = simulateur(base);
    sim.validerTout();
    expect(sim.exo().effortVise).toMatchObject({ serie: 2, reponse: null, demande: true, phrase: null });
  });

  test('« 3 et + » : la phrase du coach, lue sur la suite ; plus de puces', () => {
    const sim = simulateur(base);
    sim.validerTout();
    sim.repondre('reste_3_plus');
    const e = sim.exo().effortVise;
    expect(e.demande).toBe(false);
    expect(e.reponse).toBe(3);
    expect(e.effet).toBe('test');
    expect(e.phrase.replace(/[  ]/g, ' ')).toBe('40 kg × 9, il t’en restait 3. Au-dessus de ce que je visais : la prochaine fois, on essaie 42,5 kg.');
    expect(sim.verifier().erreurs).toEqual([]);
  });

  test('une réponse qui ne change rien (« 1 ») : pas de phrase', () => {
    const sim = simulateur(base);
    sim.validerTout();
    sim.repondre('reste_1');
    expect(sim.exo().effortVise).toMatchObject({ reponse: 1, demande: false, effet: null, phrase: null });
  });

  test('une réponse déjà donnée (RPE) : pas de puces', () => {
    const sim = simulateur(base);
    sim.validerTout();
    sim.series()[2].rpe = 9;
    expect(sim.exo().effortVise.demande).toBe(false);
  });

  test('pas de coach (Édition) : aucune réserve visée, aucune puce', () => {
    const sim = simulateur(base, null, { edition: true });
    expect(sim.exo().reserveVisee).toBeNull();
    expect(sim.exo().effortVise).toBeNull();
  });

  test('sans consigne (carnet) : aucune réserve visée', () => {
    const sim = simulateur(null);
    expect(sim.exo().reserveVisee).toBeNull();
    expect(sim.exo().effortVise).toBeNull();
  });

  test('Franc : la réserve visée est celle de la table (0 en hypertrophie)', () => {
    expect(simulateur(base, null, { reglage: 'franc' }).exo().reserveVisee).toBe(0);
    expect(simulateur(base, null, { reglage: 'prudent' }).exo().reserveVisee).toBe(2);
  });

  test('le plan d’une séance coachée passe I56 à I58', () => {
    const sim = simulateur(base);
    expect(sim.verifier().erreurs).toEqual([]);
    sim.validerTout();
    expect(sim.verifier().erreurs).toEqual([]);
  });
});

describe('154 — I56 à I58 voient chacun leur violation', () => {
  const base = M.consigneDExercice(histoire(40, 9, { reps: 9 }), undefined, AVANT, OPTIONS);
  const erreurs = (mut) => {
    const sim = simulateur(base);
    sim.validerTout();
    const e = sim.entrees();
    const plan = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    mut(plan.exercices[0]);
    return T.verifierPlan(plan, e, null).erreurs.join('\n');
  };

  test('I56 — une réserve visée qui n’est pas celle de la table', () => {
    expect(erreurs((x) => { x.reserveVisee = 3; })).toMatch(/I56/);
  });
  test('I56 — un effort visé sans réserve visée', () => {
    expect(erreurs((x) => { x.reserveVisee = null; })).toMatch(/I56/);
  });
  test('I56 — l’effort visé sur une autre série que la dernière', () => {
    expect(erreurs((x) => { x.effortVise.serie = 0; })).toMatch(/I56/);
  });
  test('I57 — un test par la réserve sans sa série dans le fondement', () => {
    expect(erreurs((x) => { x.consigne.fondement.effortVise = { effet: 'test', reserve: 3, visee: 1 }; })).toMatch(/I57/);
  });
  test('I57 — un test par la réserve avec seulement visée + 1', () => {
    expect(erreurs((x) => {
      x.consigne.fondement.effortVise = { effet: 'test', charge: 40, reps: 9, reserve: 2, visee: 1 };
    })).toMatch(/I57/);
  });
  test('I58 — une montée retenue avec une réserve au moins égale à la visée', () => {
    expect(erreurs((x) => {
      x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 1, visee: 1 };
    })).toMatch(/I58/);
  });
  test('I58 — une ligne haute malgré une réserve sous la visée', () => {
    expect(erreurs((x) => {
      x.consigne.haut = { charge: 42.5, vise: 8, k: 1 };
      x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 0, visee: 1 };
    })).toMatch(/I58/);
  });
});
