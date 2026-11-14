/** @jest-environment node */
//
// PR 4a « première séance sûre » — LE PLANCHER DE RÉSERVE (MOTEUR §9.26 bis, décision d'Aurélien du 12/11/2026).
// Pour les 65 ans et plus connus, les débutants et l'objectif Forme, la réserve visée AFFICHÉE ne descend jamais sous 2.
// Deux fonctions : `reserveVisee` (la table : le déclencheur du test) et `reserveAffichee` (le plancher : l'affichage, la garde).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');
require('../../v2/js/semaine.js');

const ZONES = ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'];
const REGLAGES = ['prudent', 'normal', 'franc'];

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
function histoire(kg, repsHabituelles, derniere) {
  const dates = ['09-13', '09-06', '08-30', '08-23', '08-16'];
  return dates.map((d, i) => ({ seance: { id: 'H' + i, debut: jour(d) },
    series: [brute(kg, repsHabituelles), brute(kg, repsHabituelles),
      i === 0 ? brute(kg, derniere.reps, derniere.ressenti) : brute(kg, repsHabituelles)] }));
}
const consigne = (groupes, options) =>
  M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {})).consigne;
// PR 5a-bis (I167) : la suite simulée dit la fois d'APRÈS la séance du jour — sa consigne est datée du jour, comme `suiteDExercice` la rend.
const suiteDuJour = (c) => Object.assign({}, c, { fondement: Object.assign({}, c.fondement, { date: AVANT }) });
const sansEspaces = (s) => s.replace(/[  ]/g, ' ');

describe('PR 4a — la population protégée (un seul prédicat)', () => {
  test('65 ans et plus connus, débutant, objectif Forme — jamais deviné', () => {
    expect(M.populationProtegee({ plus65: true })).toBe(true);
    expect(M.populationProtegee({ debutant: true })).toBe(true);
    expect(M.populationProtegee({ objectif: 'forme' })).toBe(true);
    expect(M.populationProtegee({ plus65: null, debutant: false, objectif: 'muscle' })).toBe(false);
    expect(M.populationProtegee({ plus65: 'oui' })).toBe(false);
    expect(M.populationProtegee({})).toBe(false);
    expect(M.populationProtegee()).toBe(false);
  });
  test('le plancher est une constante : 2', () => { expect(M.RESERVE_PLANCHER).toBe(2); });
});

describe('PR 4a — reserveAffichee : la table hors population, le plancher dedans', () => {
  test('T-R1 hors population : la table, octet pour octet, une ligne de test comprise', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => ['ligne', 'test', 'haut', 'coach', 'hors'].forEach((role) => {
      const o = { zone, role, reglage };
      expect(M.reserveAffichee(o)).toBe(M.reserveVisee(o));
      expect(M.reserveAffichee(Object.assign({ protegee: false }, o))).toBe(M.reserveVisee(o));
    })));
  });
  test('protégée : jamais sous 2, jamais au-dessus de 3, la table au-dessus de 2 est gardée', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => {
      const t = M.reserveVisee({ zone, role: 'ligne', reglage });
      const a = M.reserveAffichee({ zone, role: 'ligne', reglage, protegee: true });
      expect(a).toBe(Math.min(3, Math.max(2, t)));
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(3);
    }));
  });
  test('protégée : Franc Hypertrophie (table 0) affiche 2 ; Normal Lourd (2) reste 2', () => {
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', protegee: true })).toBe(2);
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc' })).toBe(0);
    expect(M.reserveAffichee({ zone: 'lourd', role: 'ligne', reglage: 'normal', protegee: true })).toBe(2);
  });
  test('T-R3 protégée : une ligne de test ou haute n’affiche aucun chiffre (null), la table reste lisible', () => {
    ZONES.forEach((zone) => REGLAGES.forEach((reglage) => ['test', 'haut'].forEach((role) => {
      expect(M.reserveAffichee({ zone, role, reglage, protegee: true })).toBeNull();
      expect(M.reserveVisee({ zone, role, reglage })).not.toBeNull();
    })));
  });
  test('sans zone, sans coach, une chauffe : null, protégée ou non', () => {
    expect(M.reserveAffichee({ zone: null, role: 'ligne', protegee: true })).toBeNull();
    expect(M.reserveAffichee({ zone: 'mix', role: 'hors', protegee: true })).toBeNull();
    expect(M.reserveAffichee({ zone: 'mix', role: 'echauffement', protegee: true })).toBeNull();
    expect(M.reserveAffichee()).toBeNull();
  });
  test('plancherDeReserve : null reste null, hors population la table', () => {
    expect(M.plancherDeReserve(null, true)).toBeNull();
    expect(M.plancherDeReserve(0, false)).toBe(0);
    expect(M.plancherDeReserve(0, true)).toBe(2);
    expect(M.plancherDeReserve(1, true)).toBe(2);
    expect(M.plancherDeReserve(3, true)).toBe(3);
  });
});

describe('PR 4a — la règle dans la consigne : la garde lit le plancher, le test lit la table', () => {
  // Franc, Hypertrophie : table 0. 40 kg, zone 8-10 en hypertrophie (haut 10).
  const franc = { reglage: 'franc' };
  test('T-R2 séparation : R = 2 déclenche le test sur la TABLE (0 + 2), avec ou sans protégée ; le haut est le même', () => {
    const g = histoire(60, 9, { reps: 9, ressenti: 'reste_2' });
    const sans = consigne(g, franc);
    const avec = consigne(g, Object.assign({ protegee: true }, franc));
    expect(sans.etat).toBe('test_propose');
    expect(avec.etat).toBe('test_propose');
    expect(avec.haut).toEqual(sans.haut);
    expect(avec.haut.charge).toBe(65);
    expect(sans.fondement.effortVise).toEqual({ effet: 'test', charge: 60, reps: 9, reserve: 2, visee: 0 });
    expect(avec.fondement.effortVise).toEqual({ effet: 'test', charge: 60, reps: 9, reserve: 2, visee: 2, viseeTable: 0, protegee: true });
  });
  test('T-R1 R = 2 protégé : la phrase dit « c’est ce que je visais » ; R = 3 : « Au-dessus de ce que je visais »', () => {
    const ev2 = { effet: 'test', charge: 34, reps: 9, reserve: 2, visee: 2, viseeTable: 0, protegee: true };
    expect(sansEspaces(M.annonceDe('effort', { ev: ev2, haut: 36, moment: 'apres' })))
      .toBe('34 kg × 9, il t’en restait 2 : c’est ce que je visais. La prochaine fois, on essaie 36 kg.');
    const ev3 = Object.assign({}, ev2, { reserve: 3 });
    expect(sansEspaces(M.annonceDe('effort', { ev: ev3, haut: 36, moment: 'apres' })))
      .toBe('34 kg × 9, il t’en restait 3. Au-dessus de ce que je visais : la prochaine fois, on essaie 36 kg.');
  });
  test('R = 1 sur Franc Hypertrophie, au haut de la zone : non protégé monte (table 0), protégé GARDE (visée 2)', () => {
    const g = histoire(40, 12, { reps: 12, ressenti: 'reste_1' });
    expect(consigne(g, franc).etat).toBe('test_propose');
    const k = consigne(g, Object.assign({ protegee: true }, franc));
    expect(k.etat).toBe('progression');
    expect(k.haut).toBeNull();
    expect(k.fondement.effortVise).toMatchObject({ effet: 'garde', reserve: 1, visee: 2, viseeTable: 0, protegee: true });
  });
  test('non protégé : le fondement n’a ni viseeTable ni protegee (octet pour octet)', () => {
    const k = consigne(histoire(60, 9, { reps: 9, ressenti: 'reste_3_plus' }));
    expect(Object.keys(k.fondement.effortVise).sort()).toEqual(['charge', 'effet', 'reps', 'reserve', 'visee']);
  });
  test('T-R4 garde de bord : un non-débutant protégé qui note 1 garde sa charge ; un débutant jamais', () => {
    // Bord : séances sous 3 reps, Franc (table Lourd 1) — 100 kg × 2 deux séances, R = 1 sur la dernière série.
    const bord = (extra) => {
      const g = [0, 1, 2].map((i) => ({ seance: { id: 'B' + i, debut: jour(['09-13', '09-06', '08-30'][i]) },
        series: [brute(100, 2), brute(100, 2, i === 0 ? 'reste_1' : null)] }));
      return consigne(g, Object.assign({ reglage: 'franc', mesure: 'charge_reps' }, extra));
    };
    expect(bord({}).etat).toBe('bord');
    expect(bord({ protegee: true }).etat).toBe('bord_garde');
    expect(bord({ protegee: true, debutant: true }).etat).toBe('bord');
  });
  test('le drapeau de module suit options.protegee (compteur, rejeu) et se restaure', () => {
    const g = histoire(40, 12, { reps: 12, ressenti: 'reste_1' });
    consigne(g, Object.assign({ protegee: true }, franc));
    expect(consigne(g, franc).etat).toBe('test_propose');
  });
});

// ── Le plan ──────────────────────────────────────────────────────────────────
// Une séance d'un exercice (hypertrophie, 40 kg × 9) ; `o` : { reglage, plus65, debutant, objectif }.
function simulateur(consigneObj, o) {
  const opt = o || {};
  let k = 0;
  const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const api = {
    entrees: () => {
      const travail = se.exercices[0].series.filter((x) => S.typeDe(x) === 'travail');
      const fini = travail.length && travail.every((x) => S.partEnBase(x));
      const protegee = M.populationProtegee({ plus65: opt.plus65 === true, debutant: opt.debutant === true, objectif: opt.objectif });
      const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
        consignes: { dc: consigneObj }, paris: [], reglage: opt.reglage, plus65: opt.plus65, debutant: opt.debutant, objectif: opt.objectif,
        reserve: opt.reserve, suites: {} };
      if (fini) {
        const dernier = travail[travail.length - 1];
        e.suites = { dc: { consigne: suiteDuJour(consigne(histoire(40, 9, { reps: dernier.reps, ressenti: dernier.ressenti }),
          { reglage: opt.reglage, protegee, debutant: opt.debutant === true })), cranSuivant: 42.5 } };
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
const lePlan = (reglage, o) => M.consigneDExercice(histoire(40, 9, { reps: 9 }), undefined, AVANT,
  Object.assign({}, OPTIONS, { reglage, protegee: M.populationProtegee(o || {}) }, o && o.debutant ? { debutant: true } : {}));

describe('PR 4a — le plan : l’affichage, le pari, la phrase', () => {
  const plus65Franc = { reglage: 'franc', plus65: true };
  test('T-R1 65+ Franc : table 0, affichée 2, « garde 2 » ; le pari écrit la visée affichée ; plan.protegee', () => {
    const sim = simulateur(lePlan('franc', { plus65: true }), plus65Franc);
    const x = sim.exo();
    expect(sim.plan().protegee).toBe(true);
    expect(x.reserveVisee).toBe(0);
    expect(x.reserveAffichee).toBe(2);
    expect(x.effortVise).toMatchObject({ visee: 2 });
    (x.paris || []).filter(Boolean).forEach((q) => { if (q.fondement.role !== 'haut') expect(q.fondement.reserve_visee).toBe(2); });
    expect(sim.verifier().erreurs).toEqual([]);
  });
  test('non protégé (même réglage) : octet pour octet, 0, aucune phrase du plancher', () => {
    const sim = simulateur(lePlan('franc'), { reglage: 'franc', plus65: false });
    const x = sim.exo();
    expect(sim.plan().protegee).toBe(false);
    expect([x.reserveVisee, x.reserveAffichee]).toEqual([0, 0]);
    expect(x.plancher).toBeNull();
    expect(x.pourquoi.plancher).toBeUndefined();
    expect(sim.verifier().erreurs).toEqual([]);
  });
  test('T-R6 la phrase « je vise 2 » : Franc seulement, une fois, dans le Pourquoi, citée', () => {
    const x = simulateur(lePlan('franc', { plus65: true }), plus65Franc).exo();
    expect(sansEspaces(x.pourquoi.plancher)).toBe('Pour cet exercice, je vise 2 en réserve. Tu notes ce que tu veux.');
    expect(x.phrases.filter((q) => q.ou === 'pourquoi.plancher')).toHaveLength(1);
    // Normal : le plancher relève 1 à 2 mais « Me pousser » n'est pas écrasé : aucune phrase.
    const normal = simulateur(lePlan('normal', { plus65: true }), { reglage: 'normal', plus65: true }).exo();
    expect(normal.reserveAffichee).toBe(2);
    expect(normal.plancher).toBeNull();
    // Franc Lourd (table 1) : relevée à 2, la phrase est vraie aussi.
    expect(M.reserveVisee({ zone: 'lourd', role: 'ligne', reglage: 'franc' })).toBe(1);
  });
  test('débutant (Normal) : 1 devient 2 ; objectif Forme : idem ; 65+ inconnu (plus65 null) : rien', () => {
    expect(simulateur(lePlan('normal', { debutant: true }), { reglage: 'normal', debutant: true }).exo().reserveAffichee).toBe(2);
    expect(simulateur(lePlan('normal', { objectif: 'forme' }), { reglage: 'normal', objectif: 'forme' }).exo().reserveAffichee).toBe(2);
    expect(simulateur(lePlan('normal'), { reglage: 'normal', plus65: null }).exo().reserveAffichee).toBe(1);
  });
  test('T-R1 R = 2 notée (65+ Franc) : le test est posé sur la table, « c’est ce que je visais » ; I160, I161 propres', () => {
    const sim = simulateur(lePlan('franc', { plus65: true }), plus65Franc);
    sim.validerTout();
    sim.repondre('reste_2');
    const e = sim.exo().effortVise;
    expect(e).toMatchObject({ reponse: 2, effet: 'test', visee: 2 });
    expect(sansEspaces(e.phrase)).toBe('40 kg × 9, il t’en restait 2 : c’est ce que je visais. La prochaine fois, on essaie 45 kg.');
    expect(sim.verifier().erreurs).toEqual([]);
  });
  test('R = 3 notée : « Au-dessus de ce que je visais »', () => {
    const sim = simulateur(lePlan('franc', { plus65: true }), plus65Franc);
    sim.validerTout();
    sim.repondre('reste_3_plus');
    expect(sansEspaces(sim.exo().effortVise.phrase)).toMatch(/^40 kg × 9, il t’en restait 3\. Au-dessus de ce que je visais/);
    expect(sim.verifier().erreurs).toEqual([]);
  });
  test('T-R3 la ligne de test d’une population protégée : aucune réserve affichée, aucun effort visé, aucune question, aucun pari de réserve', () => {
    // 40 kg × 12 (Volume) : le haut est touché, la séance porte une ligne de test.
    const test = M.consigneDExercice(histoire(40, 12, { reps: 12 }), undefined, AVANT, Object.assign({}, OPTIONS, { reglage: 'normal', protegee: true }));
    expect(test.consigne.etat).toBe('test_propose');
    const reserve = { lancement: '2026-01-01', passes: {} };
    const prot = simulateur(test, { reglage: 'normal', plus65: true, reserve });
    const x = prot.exo();
    expect(roleTest(x)).toBe(true);
    expect(x.reserveAffichee).toBeNull();
    expect(x.effortVise).toBeNull();
    expect(x.questionReserve).toBeNull();
    (x.paris || []).filter(Boolean).filter((q) => q.fondement.role === 'haut').forEach((q) => expect(q.fondement.reserve_visee).toBeUndefined());
    expect(prot.verifier().erreurs).toEqual([]);
    // Hors population : la ligne de test garde son chiffre (la table − 1).
    const libre = simulateur(test, { reglage: 'normal', plus65: false, reserve }).exo();
    expect(libre.reserveAffichee).toBe(libre.reserveVisee);
    expect(libre.reserveAffichee).not.toBeNull();
    // La fixture déclenche le chemin : hors population, la même ligne de test pose bien la question de réserve (calage, écart ou rappel).
    expect(libre.questionReserve).not.toBeNull();
  });
  test('T-R5 la veille « plus léger » lit la visée relevée (Franc Lourd, 65+ : 2 → 3, le plafond) ; aucune erreur I142, I160', () => {
    const CAT = { squat_barre: { equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [], slug: 'squat_barre', nom: 'Squat (Barre)', nature: 'force' },
      football: { equipement: 'aucun', mesure: 'temps', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [], slug: 'football', nom: 'Football', nature: 'cardio', hors_salle: true } };
    const veille = (plus65) => {
      let k = 0; const id = () => 'a-s' + (++k);
      let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
      se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
      se.exercices[0].series.forEach((s) => { s.reps_visees = 5; });
      const e = { seance: { id: 'S', debut: '2026-11-04T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
        consignes: { squat_barre: { consigne: { etat: 'progression', zone: 'lourd', palier: 152.5, n: 3, ligne: { charge: 152.5, vise: 5 }, haut: null }, contexte: { cran: 155, haut: null }, pas: 2.5 } },
        reglage: 'franc', paris: [], objectif: 'force', plus65, catalogue: CAT, menagerProfil: [],
        activiteVeille: { seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-03' }, veilleChoix: 'leger' };
      return { p: T.planDeSeance(e), e };
    };
    const non = veille(false), oui = veille(true);
    expect(non.p.exercices[0].veilleLegere).toMatchObject({ charge: 145, reserve: 3 });
    expect(oui.p.exercices[0].veilleLegere).toMatchObject({ charge: 145, reserve: 3 });
    expect(T.verifierPlan(oui.p, oui.e).erreurs.filter((x) => /I142|I160|I56/.test(x))).toEqual([]);
  });
});

function roleTest(x) { return (x.lignes || []).some((l) => l.role === 'test'); }

describe('PR 4a — I56, I57, I58, I64, I160, I161 voient chacun leur violation', () => {
  const sim0 = () => simulateur(lePlan('franc', { plus65: true }), { reglage: 'franc', plus65: true });
  const erreurs = (mut, pre) => {
    const sim = sim0();
    if (pre) pre(sim);
    const e = sim.entrees();
    const plan = T.planDeSeance(e);
    mut(plan, plan.exercices[0]);
    return T.verifierPlan(plan, e, null).erreurs.join('\n');
  };
  const apres = (sim) => { sim.validerTout(); sim.repondre('reste_2'); };
  test('plan propre', () => { expect(erreurs(() => {})).toBe(''); expect(erreurs(() => {}, apres)).toBe(''); });
  test('I56 : l’affichée n’est pas celle de la règle', () => { expect(erreurs((p, x) => { x.reserveAffichee = 3; })).toMatch(/I56/); });
  test('I56 : la table touchée', () => { expect(erreurs((p, x) => { x.reserveVisee = 2; })).toMatch(/I56/); });
  test('I57 : un test sous la TABLE + 2', () => {
    expect(erreurs((p, x) => { x.consigne.fondement.effortVise = { effet: 'test', charge: 40, reps: 9, reserve: 1, visee: 2, viseeTable: 0, protegee: true }; x.consigne.etat = 'test_propose'; })).toMatch(/I57/);
  });
  test('I58 : une garde pour une réserve qui n’est pas sous la visée affichée', () => {
    expect(erreurs((p, x) => { x.effortVise = Object.assign({}, x.effortVise, { effet: 'garde', reponse: 2 }); }, apres)).toMatch(/I58/);
  });
  test('I64 : la visée du fondement n’est ni l’affichée ni la table', () => {
    expect(erreurs((p, x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 1, visee: 3, viseeTable: 0, protegee: true }; })).toMatch(/I64/);
    expect(erreurs((p, x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 1, visee: 2, viseeTable: 1, protegee: true }; })).toMatch(/I64/);
  });
  test('I160 : plan.protegee faux, réserve sous le plancher, fondement incohérent', () => {
    expect(erreurs((p) => { p.protegee = false; })).toMatch(/I160/);
    expect(erreurs((p, x) => { x.reserveAffichee = 1; })).toMatch(/I160/);
    expect(erreurs((p, x) => { x.consigne.fondement.effortVise = { effet: 'garde', charge: 40, reps: 9, reserve: 1, visee: 2, viseeTable: 0, protegee: false }; })).toMatch(/I160/);
  });
  test('I161 : « Au-dessus » pour R = visée ; « c’est ce que je visais » pour R > visée', () => {
    expect(erreurs((p, x) => { x.effortVise.phrase = 'x. Au-dessus de ce que je visais : y'; }, apres)).toMatch(/I161/);
    expect(erreurs((p, x) => { x.effortVise.reponse = 3; x.effortVise.phrase = 'x : c’est ce que je visais.'; }, apres)).toMatch(/I161/);
    expect(erreurs((p, x) => { x.effortVise.reponse = 1; x.effortVise.phrase = 'x'; }, apres)).toMatch(/I161/);
  });
});
