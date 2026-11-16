/** @jest-environment node */
//
// PR 2 « SANS COACH PAR EXERCICE » (MOTEUR §9.20 et §9.41 bis, I202 et I203) — « Sans coach cette fois » est une marque de SILENCE, plus un fait de
// douleur. UNE fonction (`Seance.marquerSansCoach`, `marquerDouleur` n'en est qu'un appel), UN prédicat (`Seance.occurrenceSansCoach`) pour le
// silence et la neutralité ; la douleur garde ses lecteurs de fait.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');

const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'],
  muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
const CAT = { squat_barre: SQ };
const consigne = (charge) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: 5, n: 3, ligne: { charge, vise: 5 }, haut: null, fondement: {} });
let n0 = 0;
const id = () => 'z' + (++n0);
const seanceDe = () => {
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  return S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
};
const tape = (se, iSerie, charge) => S.modifierSerie(se, 0, iSerie, { charge_kg: charge });
const entrees = (se, extra) => Object.assign({
  seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes || [] },
  consignes: { squat_barre: { consigne: consigne(90), libelles: M.libellesConsigne(consigne(90)), pas: null } },
  catalogue: CAT, reglage: null, paris: [], suites: {}, e1rms: { squat_barre: 140 }
}, extra || {});
const plan = (se, extra) => { const e = entrees(se, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs }; };
const sansCoach = (se) => S.marquerSansCoach(se, 0, { douleur: false });

describe('la marque : une fonction, un prédicat', () => {
  test('marquerSansCoach pose la marque sur l’occurrence et sur TOUTES ses séries ; aucune douleur n’est écrite', () => {
    const se = sansCoach(seanceDe());
    expect(se.exercices[0].sans_coach).toBe(true);
    expect(se.exercices[0].series.every((s) => s.sans_coach === true)).toBe(true);
    expect(se.exercices[0].douleur).not.toBe(true);
    expect(S.occurrenceDouloureuse(se.exercices[0])).toBe(false);
    expect(S.occurrenceSansCoach(se.exercices[0])).toBe(true);
    expect(S.occurrenceSansCoachChoisie(se.exercices[0])).toBe(true);
  });

  test('l’envoi : sans_coach part toujours (false compris), la douleur reste à false', () => {
    const avant = S.lignes(S.valider(S.modifierSerie(seanceDe(), 0, 0, { charge_kg: 100, reps: 5 }), 0, 0, new Date('2026-10-20T10:05:00Z')));
    expect(avant[0].sans_coach).toBe(false);
    const se = sansCoach(S.valider(S.modifierSerie(seanceDe(), 0, 0, { charge_kg: 100, reps: 5 }), 0, 0, new Date('2026-10-20T10:05:00Z')));
    const l = S.lignes(se);
    expect(l.every((r) => r.sans_coach === true && r.douleur === false)).toBe(true);
    expect(l[0].charge_kg).toBe(100);
    expect(l[0].reps).toBe(5);
  });

  test('marquerDouleur n’est qu’un appel de marquerSansCoach (douleur: true) : la même séance, aucune marque sans_coach en plus', () => {
    const base = seanceDe();
    const a = S.marquerDouleur(base, 0);
    const b = S.marquerSansCoach(base, 0, { douleur: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.exercices[0].sans_coach).toBeUndefined();
    expect(S.occurrenceSansCoach(a.exercices[0])).toBe(true);
    expect(S.occurrenceSansCoachChoisie(a.exercices[0])).toBe(false);
  });

  test('le prédicat : la marque du geste OU la douleur, relues des séries d’une séance reprise', () => {
    expect(S.occurrenceSansCoach(null)).toBe(false);
    expect(S.occurrenceSansCoach({ series: [{}, {}] })).toBe(false);
    expect(S.occurrenceSansCoach({ series: [{}, { sans_coach: true }] })).toBe(true);
    expect(S.occurrenceSansCoach({ series: [{ douleur: true }] })).toBe(true);
    expect(S.occurrenceSansCoachChoisie({ series: [{ douleur: true, sans_coach: true }] })).toBe(false);
  });

  test('retirerSansCoach est l’inverse exact ; une occurrence non marquée revient inchangée', () => {
    const base = seanceDe();
    const r = S.retirerSansCoach(sansCoach(base), 0);
    expect(S.occurrenceSansCoach(r.exercices[0])).toBe(false);
    expect(r.exercices[0].series.every((s) => s.sans_coach === false)).toBe(true);
    expect(S.retirerSansCoach(base, 0)).toBe(base);
  });

  test('I203 — « Remettre le coach » ne touche JAMAIS une douleur', () => {
    const se = S.marquerDouleur(seanceDe(), 0);
    expect(S.retirerSansCoach(se, 0)).toBe(se);
    const les2 = S.marquerDouleur(sansCoach(seanceDe()), 0);
    expect(S.retirerSansCoach(les2, 0)).toBe(les2);
    expect(S.occurrenceDouloureuse(S.retirerSansCoach(les2, 0).exercices[0])).toBe(true);
  });

  test('les gestes sans_coach / coach_remis s’écrivent par noterGeste, avec le slug', () => {
    let se = S.noterGeste(seanceDe(), { geste: 'sans_coach', slug: 'squat_barre' });
    se = S.noterGeste(se, { geste: 'coach_remis', slug: 'squat_barre' });
    expect(se.gestes.map((g) => g.geste)).toEqual(['sans_coach', 'coach_remis']);
    expect(S.noterGeste(seanceDe(), { geste: 'sans_coach' }).gestes || []).toEqual([]);
  });

  test('sans_coach est une colonne de `sets` envoyée et relue', () => {
    expect(S.COLONNES_SET).toContain('sans_coach');
  });
});

describe('le plan — le silence', () => {
  test('avant la marque le coach parle ; après, aucune consigne, ligne, pari, message, carte ; I202 et les invariants tiennent', () => {
    const avant = plan(seanceDe());
    expect(avant.x.consigne).toBeTruthy();
    expect(avant.x.sansCoach).toBe(false);
    const apres = plan(sansCoach(seanceDe()));
    expect(apres.x.sansCoach).toBe(true);
    expect(apres.x.douleur).toBe(false);
    expect(apres.x.consigne).toBeFalsy();
    expect(apres.x.lignes.filter((l) => l.role !== 'hors')).toEqual([]);
    expect((apres.x.paris || []).some(Boolean)).toBe(false);
    expect(apres.x.message).toBeFalsy();
    expect(apres.x.carteReprise).toBeNull();
    expect(apres.x.calage).toBeNull();
    expect(apres.erreurs).toEqual([]);
  });

  test('le calage de la première fois se tait (aucun « On trouve ta charge »)', () => {
    const SILENCE = { etat: 'silence', raison: 'premiere_fois', palier: null, niveau: null, n: 0, ligne: null, haut: null, fondement: {} };
    const ext = { consignes: { squat_barre: { consigne: SILENCE, libelles: M.libellesConsigne(SILENCE), pas: null } }, e1rms: {} };
    const avant = plan(seanceDe(), ext);
    const apres = plan(sansCoach(seanceDe()), ext);
    expect(apres.x.calage).toBeNull();
    expect(apres.erreurs).toEqual([]);
    // le test discrimine : sans la marque, le calage existe
    expect(avant.x.calage).toBeTruthy();
  });

  test('« + Chauffe » depuis la 1re charge tapée reste possible (x.surDemande) sous la marque', () => {
    const r = plan(sansCoach(tape(seanceDe(), 0, 100)));
    expect(r.x.proposition).toBeNull();
    expect(r.x.surDemande.reference).toBe(100);
    expect(r.x.surDemande.lignes).toEqual([[50, 8], [80, 3]]);
    expect(r.erreurs).toEqual([]);
  });

  test('I202 — un message, un pari, une carte ou un calage sur une occurrence sans coach est refusé', () => {
    const r = plan(sansCoach(seanceDe()));
    const cas = [['message', { texte: 'x' }], ['paris', [{ id: 'p' }]], ['carteLest', { x: 1 }], ['calage', { phrase: 'x' }], ['carteReprise', { titre: 't', phrase: 'p', choix: [] }]];
    cas.forEach((c) => {
      const p = JSON.parse(JSON.stringify(r.p));
      p.exercices[0][c[0]] = c[1];
      expect(T.verifierPlan(p, r.e).erreurs.some((m) => /I202/.test(m))).toBe(true);
    });
  });

  test('I33 reste celui de la douleur : une douleur est aussi sans coach, et son plan est valide', () => {
    const r = plan(S.marquerDouleur(seanceDe(), 0));
    expect(r.x.douleur).toBe(true);
    expect(r.x.sansCoach).toBe(true);
    expect(r.x.consigne).toBeFalsy();
    expect(r.erreurs).toEqual([]);
  });

  test('I203 — « Remettre le coach » rend le plan IDENTIQUE à celui d’avant la marque', () => {
    [seanceDe(), tape(seanceDe(), 0, 100)].forEach((base) => {
      const avant = plan(base);
      const remis = plan(S.retirerSansCoach(sansCoach(base), 0));
      expect(JSON.stringify(remis.p)).toBe(JSON.stringify(avant.p));
      expect(remis.erreurs).toEqual(avant.erreurs);
    });
  });

  test('I203 — sur une douleur, « Remettre le coach » ne change rien au plan', () => {
    const se = S.marquerDouleur(seanceDe(), 0);
    const a = plan(se), b = plan(S.retirerSansCoach(se, 0));
    expect(JSON.stringify(b.p)).toBe(JSON.stringify(a.p));
    expect(b.x.douleur).toBe(true);
  });

  test('le plan est pur : deux plans de la même entrée sont identiques', () => {
    const se = sansCoach(seanceDe());
    expect(JSON.stringify(plan(se).p)).toBe(JSON.stringify(plan(se).p));
  });
});

describe('le moteur — la neutralité, sans fait de douleur', () => {
  test('seanceSansCoach lit sets.sans_coach ET sets.douleur ; seanceDouloureuse ne lit que la douleur', () => {
    expect(M.seanceDouloureuse([{ sans_coach: true }])).toBe(false);
    expect(M.seanceDouloureuse([{ douleur: true }])).toBe(true);
  });
});
