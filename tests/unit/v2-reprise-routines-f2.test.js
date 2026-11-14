/** @jest-environment node */
//
// F2 (MOTEUR §9.49) — LA REPRISE D'UNE SÉANCE EN COURS RELIT LES ROUTINES.
//
// Après un rechargement, le premier rendu de la séance part avant l'arrivée des routines (`zonesDeRoutine = {}`) : la suite d'un exercice à zone de plan
// redisait la fois d'AVANT (« Prochaine séance : 80 kg × 8 » au lieu de « La prochaine fois : une rep de plus, 90 kg × 6 »). Les correctifs :
//   1. la clé du mémo du plan porte la génération des routines ET leur état « prêtes » ;
//   2. `chargerRoutines` redessine la séance (un seul point, jamais sous la frappe) ;
//   3. un exercice à zone de plan n'a ni consigne figée ni suite tant que les routines ne sont pas prêtes (`routinesPretes`) ;
//   4. I168 le vérifie ; le témoin « routines gardées en mémoire, état en échec » (prêtes) passe ; INDÉFINI = prêtes.
// La suite du moteur sur `zonesDeRoutine = {}` reste fausse (c'est le fait que l'app ne doit plus lui demander) : le premier test le fige.

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js'); require('../../v2/js/palier.js'); require('../../v2/js/profil.js'); require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
let n = 0;
const ser = (l) => l.map(([kg, r, ex], i) => Object.assign({ id: 's' + (++n), rang: i + 1, charge_kg: kg, reps: r, rpe: null, ressenti: null, type_serie: 'travail',
  exercise_slug: 'dc', au_max_reserve: null, validee_a: '2026-11-14T10:30:00Z', source: 'app' }, ex || {}));
const mk = (id, d, l, rid) => ({ seance: Object.assign({ id, debut: d }, rid ? { routine_id: rid } : {}), series: ser(l) });
const H = () => [mk('H0', '2026-11-04T18:00:00+01:00', [[90, 5], [90, 5], [90, 5]], 'R'), mk('H1', '2026-11-11T18:00:00+01:00', [[90, 5], [90, 4]], 'R')];
const JOUR = [[90, 5], [90, 5], [90, 5], [90, 5, { ressenti: 'reste_0', au_max_reserve: 0 }]];
const APRES = '2026-11-14T11:00:00+01:00';
const opts = (zr) => ({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, zonePlan: 'hypertrophie', zonesDeRoutine: zr });
const suite = (zr) => M.suiteDExercice(H(), { seance: { debut: '2026-11-14T10:00:00+01:00', routine_id: 'R' }, series: ser(JOUR) }, undefined, APRES, opts(zr));

// L'objet que `consigneDe` fige : `{ consigne, plan, … }` (la zone de plan est `plan`, hors de la consigne elle-même).
const consigne = () => M.consigneDExercice(H(), undefined, '2026-11-14T10:00:00+01:00', Object.assign(opts({ R: 'hypertrophie' }), { zonePlanOrigine: 'routine' }));
const planAvec = (extra) => {
  const k = consigne();
  const s = suite({ R: 'hypertrophie' });
  const entrees = Object.assign({
    seance: { id: 'T', debut: '2026-11-14T10:00:00+01:00', edition: false, routine_id: 'R', exercices: [{ exercise_slug: 'dc', series: ser(JOUR) }] },
    consignes: { dc: k }, paris: [], suites: { dc: { consigne: s.apres.consigne, cranSuivant: s.cranSuivant } } }, extra || {});
  return { plan: T.planDeSeance(entrees), entrees };
};
const i168 = (r) => r.erreurs.filter((e) => /^I168/.test(e));

describe('F2 — la suite du moteur sans les routines est fausse : l\'app ne la lui demande plus', () => {
  test('FAIT : avec les routines, 90 kg × 6 ; sans (zonesDeRoutine = {}), le report « nouvelle zone » 80 kg × 8', () => {
    const avec = suite({ R: 'hypertrophie' }).apres.consigne, sans = suite({}).apres.consigne;
    expect([avec.ligne.charge, avec.ligne.vise]).toEqual([90, 6]);
    expect([sans.ligne.charge, sans.ligne.vise]).not.toEqual([90, 6]);
  });
});

describe('F2 — la clé du mémo du plan (app.js) porte les routines', () => {
  test('lecture ET écriture portent generationRoutines et l\'état « prêtes »', () => {
    const lecture = /planMemo\.routinesGen === generationRoutines/.test(APP) && /planMemo\.routinesPretes === routinesPretes\(\)/.test(APP);
    const ecriture = /routinesGen: generationRoutines, routinesPretes: routinesPretes\(\)/.test(APP);
    expect(lecture).toBe(true);
    expect(ecriture).toBe(true);
  });
  test('routinesPretes = lues OU gardées en mémoire (un échec tardif ne les vide pas)', () => {
    const m = /function routinesPretes\(\) \{\s*return ([^;]+);/.exec(APP);
    expect(m && m[1].replace(/\s+/g, ' ')).toMatch(/^(etatRoutines\.code === 'ok' \|\| \(routines \|\| \[\]\)\.length > 0|\(routines \|\| \[\]\)\.length > 0 \|\| etatRoutines\.code === 'ok')$/);
  });
  test('consigneDe et suiteDe se taisent sur une zone de plan sans routines prêtes, avant tout cache', () => {
    expect(APP).toMatch(/if \(options\.zonePlan && !routinesPretes\(\)\) return null;[\s\S]{0,400}MOTEUR §13\.6/);
    expect(APP).toMatch(/if \(options\.zonePlan && !routinesPretes\(\)\) return null;\s*var cleOptions/);
  });
  test('un seul point de re-rendu : le succès de chargerRoutines ; il ne passe ni par apresGeste ni par redessinerSiSaisieFinie', () => {
    const corps = /async function chargerRoutines\(\) \{[\s\S]*?\n  \}\n/.exec(APP)[0];
    expect(corps).toMatch(/if \(!etaientPretes\) relireLaSeanceAvecLesRoutines\(\);/);
    const relire = /function relireLaSeanceAvecLesRoutines\(\) \{[\s\S]*?\n  \}\n/.exec(APP)[0];
    expect(relire).toMatch(/champDuJournalActif\(\)/);
    expect(relire).toMatch(/feuille \|\| voileOuvert/);
    expect(relire).toMatch(/chrono\.question/);
    expect(relire).not.toMatch(/apresGeste|redessinerSiSaisieFinie/);
  });
});

describe('F2 — jamais « La routine change » sans que la routine change (app.js)', () => {
  test('poserZoneDePlanDe refuse sans écrire quand la ligne de routine est introuvable ; la feuille grise le choix', () => {
    const corps = /async function poserZoneDePlanDe\([\s\S]*?\n  \}\n/.exec(APP)[0];
    expect(corps).toMatch(/if \(!ligne\) return;[\s\S]*poserRoutineVoulue/);
    expect(APP).toMatch(/routineIndisponible: ligneDeRoutineDe\(slug\) \? null : PHRASE_ROUTINE_ILLISIBLE/);
  });
  test('la carte « Oui, dans ma routine » refuse une routine illisible au lieu de poser la marque sur la ligne seule', () => {
    expect(APP).toMatch(/if \(seance\.routine_id && !rt\) return;/);
  });
});

describe('F2 — I168 : routines pas prêtes, le coach se tait sur ce qu\'elles décident', () => {
  test('TÉMOIN : prêtes (true) ou indéfini → le plan complet passe, constat compris', () => {
    [undefined, true].forEach((v) => {
      const { plan, entrees } = planAvec(v === undefined ? {} : { routinesPretes: v });
      expect(plan.exercices[0].zonePlan).toBeTruthy();
      expect(String(plan.exercices[0].constat && plan.exercices[0].constat.suite).replace(/[\u00a0\u202f]/g, ' ')).toMatch(/La prochaine fois : une rep de plus, 90 kg × 6/);
      expect(plan.exercices[0].suiteMuette).toBe(false);
      expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);
    });
  });
  test('DISCRIMINANT : pas prêtes + une suite donnée → I168 (suite et constat)', () => {
    const { plan, entrees } = planAvec({ routinesPretes: false });
    const e = i168(T.verifierPlan(plan, entrees));
    expect(e.length).toBe(2);
    expect(e.join(' ')).toMatch(/une suite est donnée/);
    expect(e.join(' ')).toMatch(/un constat est dit/);
    expect(plan.exercices[0].suiteMuette).toBe(true);
  });
  test('pas prêtes + l\'app se tait (suite nulle) : plan muet, aucune I168, l\'en-tête d\'avant ne revient pas', () => {
    const { plan, entrees } = planAvec({ routinesPretes: false, suites: { dc: null } });
    const x = plan.exercices[0];
    expect(x.constat).toBeNull();
    expect(x.suiteMuette).toBe(true);
    expect(i168(T.verifierPlan(plan, entrees))).toEqual([]);
  });
  test('un exercice non fini n\'est pas muet (rien à dire de la suite) ; sans zone de plan non plus', () => {
    const enCours = planAvec({ routinesPretes: false, suites: { dc: null },
      seance: { id: 'T', debut: '2026-11-14T10:00:00+01:00', edition: false, routine_id: 'R', exercices: [{ exercise_slug: 'dc', series: ser(JOUR.slice(0, 2)).concat(ser([[90, 5]]).map((q) => Object.assign(q, { validee_a: null }))) }] } });
    expect(enCours.plan.exercices[0].suiteMuette).toBe(false);
    const sansZone = planAvec({ routinesPretes: false, consignes: { dc: Object.assign({}, consigne(), { plan: null }) } });
    expect(sansZone.plan.exercices[0].suiteMuette).toBe(false);
  });
  test('la carte « Au max » ne se propose pas routines pas prêtes sur une séance de routine (forgée : I168)', () => {
    const { plan, entrees } = planAvec({ routinesPretes: false, suites: { dc: null } });
    plan.exercices[0].propositionAuMax = { iSerie: 3, boutons: ['Oui, dans ma routine'] };
    expect(i168(T.verifierPlan(plan, entrees)).join(' ')).toMatch(/Au max/);
  });
  test('I168 est inscrite au CLAUDE.md et à la spec', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../CLAUDE.md'), 'utf8')).toMatch(/I168/);
    expect(fs.readFileSync(path.join(__dirname, '../../v2-atelier/specs/MOTEUR-PROGRESSION-V2.md'), 'utf8')).toMatch(/I168/);
  });
});
