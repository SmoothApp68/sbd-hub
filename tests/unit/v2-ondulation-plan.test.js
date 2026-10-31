/** @jest-environment node */
//
// 193-3 (commit 3) — L'ONDULATION DANS LE PLAN (MOTEUR §9.29, §9.22) : la ligne « Ta routine fixe… » du « Pourquoi », l'étiquette,
// I79 (une zone de plan n'est jamais remplacée en silence), I80 (première fois : le report, jamais un palier d'une autre zone),
// I81 (un exercice à zone de plan est hors bloc ce jour-là) ; et ce que la 193-3 ne change pas (paris, records, fatigue, reculs).

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let nn = 0;
const brute = (kg, reps) => ({ id: 'r' + (++nn), rang: nn, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'squat_barre' });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const J = (m, d) => Date.UTC(2026, m, d, 17);
const grp = (liste) => liste.map((s, i) => ({ seance: { id: 'H' + i + '-' + s.d, debut: new Date(s.d).toISOString() },
  series: [0, 1, 2, 3].map(() => brute(s.kg, s.reps)) }));
const dup = (semaines) => {
  const s = [];
  for (let w = 0; w < semaines; w++) { s.push({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }); s.push({ kg: 110 + 2.5 * w, reps: 7, d: J(8, 10 + w * 7) }); }
  return s;
};
const BLOC = { id: 'b1', dossier: 'Force', zone: 'mix', debut: '2026-10-12', semaines: 4, decharge: false, statut: 'en_cours', exercices: ['squat_barre'], precedent: null };

// Une séance du jeudi 22/10 à 17 h, squat avec zone de plan (ou non), la consigne calculée par le moteur.
function jeudi(o) {
  const opt = o || {};
  const jour = opt.jour || J(9, 22);
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'squat_barre', id, { series: 4 });
  se = Object.assign({}, se, { exercices: se.exercices.map((x) => Object.assign({}, x, { zone_plan: opt.zonePlan === undefined ? 'mix' : opt.zonePlan })) });
  const debut = new Date(jour).toISOString();
  const calc = M.consigneDExercice(grp(opt.histoire || dup(6)), undefined, debut, Object.assign({}, OPT, { zonePlan: se.exercices[0].zone_plan, menagee: opt.menagee === true }));
  const e = { seance: { id: 'S1', debut, edition: false, exercices: se.exercices },
    consignes: { squat_barre: Object.assign({}, calc, { repli: null }) }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { squat_barre: 'Squat (Barre)' }, seriesRoutine: { squat_barre: 4 }, marches: [] },
    programme: { blocs: opt.blocs || [], lignes: [] } };
  if (opt.menagee === true) e.zonesMenagees = { squat_barre: { zones: ['genou'], choisie: null } };
  return { e, p: T.planDeSeance(e), calc };
}

describe('la ligne du « Pourquoi » et l\'étiquette', () => {
  test('sous-histoire : « Ta routine fixe cet exercice en Mix », sans chiffre, citée à I26', () => {
    const { e, p, calc } = jeudi();
    const x = p.exercices[0];
    expect(calc.etiquette).toBe('Mix · ta routine');
    expect(x.pourquoi.plan).toMatch(/^Ta routine fixe cet exercice en Mix\. Je ne lis que tes séances en Mix/);
    expect(/\d/.test(x.pourquoi.plan)).toBe(false);
    expect(x.zonePlan.mode).toBe('zone');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('première fois : le report, une seule fois, dit', () => {
    const lourd = [0, 1, 2, 3].map((w) => ({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }));
    const { e, p } = jeudi({ histoire: lourd, jour: J(9, 1) });
    const x = p.exercices[0];
    expect(x.consigne.etat).toBe('nouvelle_zone');
    expect(x.pourquoi.plan).toMatch(/Pas encore de séance en Mix : je pars de ta dernière séance, avec le report de zone que tu connais, une seule fois/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('périmée : la phrase dit l\'ancienneté sans durée', () => {
    const couche = [{ kg: 100, reps: 7, d: J(5, 4) }, { kg: 100, reps: 7, d: J(5, 11) }]
      .concat([0, 1, 2, 3, 4].map((w) => ({ kg: 127.5 + 2.5 * w, reps: 3, d: J(8, 17 + w * 7) })));
    const { e, p } = jeudi({ histoire: couche });
    const x = p.exercices[0];
    expect(x.zonePlan.perimee).toBe(true);
    expect(x.pourquoi.plan).toMatch(/est ancienne et tu as travaillé cet exercice depuis/);
    expect(/semaine|jour|mois/.test(x.pourquoi.plan)).toBe(false);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('Automatique (zone_plan null) : rien de la 193-3 dans le plan', () => {
    const { e, p, calc } = jeudi({ zonePlan: null });
    const x = p.exercices[0];
    expect(x.zonePlan).toBeNull();
    expect('plan' in x.pourquoi).toBe(false);
    expect('plan' in calc).toBe(false);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

describe('juste pour aujourd\u2019hui', () => {
  test('l\u2019étiquette et la phrase le disent ; ce n\u2019est plus « ta routine »', () => {
    const c = M.consigneDExercice(grp(dup(6)), undefined, new Date(J(9, 22)).toISOString(),
      Object.assign({}, OPT, { zonePlan: 'lourd', zonePlanOrigine: 'aujourdhui' }));
    expect(c.etiquette).toBe('Lourd · aujourd\u2019hui');
    expect(M.pourquoiPlan(c.plan)).toMatch(/^Tu as choisi Lourd pour aujourd.hui seulement/);
    expect(c.plan.origine).toBe('aujourdhui');
  });
});

describe('I79, I80, I81', () => {
  test('I79 forgée : la consigne porte une autre zone que celle de la routine', () => {
    const { e, p } = jeudi();
    p.exercices[0].consigne = Object.assign({}, p.exercices[0].consigne, { zone: 'lourd' });
    expect(T.verifierPlan(p, e).erreurs.some((x) => /^I79/.test(x))).toBe(true);
  });
  test('I80 forgée : première fois en Mix mais un palier ordinaire', () => {
    const lourd = [0, 1, 2, 3].map((w) => ({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }));
    const { e, p } = jeudi({ histoire: lourd, jour: J(9, 1) });
    p.exercices[0].consigne = Object.assign({}, p.exercices[0].consigne, { etat: 'progression' });
    expect(T.verifierPlan(p, e).erreurs.some((x) => /^I80/.test(x))).toBe(true);
  });
  test('I81 forgée : un exercice à zone de plan dans un bloc', () => {
    const { e, p } = jeudi();
    p.programme = Object.assign({}, p.programme, { enBloc: { squat_barre: true } });
    expect(T.verifierPlan(p, e).erreurs.some((x) => /^I81/.test(x))).toBe(true);
  });
  test('I79 à I81 tiennent sur toutes les histoires, toutes les zones de plan', () => {
    const corpus = require('./fixtures/ondulation-corpus.js').histoires();
    let vus = 0;
    corpus.filter((h) => h.groupes.length).forEach((h) => {
      ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'].forEach((z) => {
        const dernier = Date.parse(h.groupes[h.groupes.length - 1].seance.debut);
        [3, 40, 100].forEach((jours) => {
          const avant = new Date(dernier + jours * 864e5).toISOString();
          const c = M.consigneDExercice(h.groupes, undefined, avant, Object.assign({}, OPT, { zonePlan: z }));
          if (!c || !c.consigne || !c.plan) return;
          vus++;
          const plan = { programme: { enBloc: {} }, exercices: [{ iExo: 0, slug: 'squat_barre', zonePlan: c.plan, consigne: c.consigne }] };
          const erreurs = [];
          T.verifierOndulation(plan, erreurs);
          expect(erreurs).toEqual([]);
        });
      });
    });
    expect(vus).toBeGreaterThan(200);
  });
});

describe('le bloc et la zone de plan (MOTEUR §9.22)', () => {
  test('le jour de la zone de plan, le squat est hors du bloc ; sans zone de plan, il y est', () => {
    const avec = jeudi({ blocs: [BLOC] });
    expect(avec.p.programme.enBloc).toEqual({});
    expect(T.verifierPlan(avec.p, avec.e).erreurs).toEqual([]);
    const sans = jeudi({ blocs: [BLOC], zonePlan: null });
    expect(sans.p.programme.enBloc).toEqual({ squat_barre: true });
  });
  test('« Changer de schéma » n\'est plus tue par le bloc ce jour-là (le bloc ne le couvre pas)', () => {
    const avec = jeudi({ blocs: [BLOC] });
    expect(avec.p.programme.enBloc.squat_barre).toBeUndefined();
  });
});

describe('ce que la 193-3 ne change pas', () => {
  test('une correction d\'exercice (zones_exercice, un bloc) ne déplace pas la zone du plan, ni le plan', () => {
    const lignes = [{ id: 'z1', exercise_slug: 'squat_barre', zone: 'lourd', corrigee_a: '2026-10-01T08:00:00.000Z', origine: 'bloc', bloc_id: 'b1' }];
    const c = M.consigneDExercice(grp(dup(6)), undefined, new Date(J(9, 22)).toISOString(),
      Object.assign({}, OPT, { zonePlan: 'mix', correction: 'lourd', correctionsDeZone: lignes }));
    expect(c.consigne.zone).toBe('mix');
    expect(c.plan.mode).toBe('zone');
  });
  test('les paris d\'un exercice à zone de plan : un pari par ligne couverte, rang de la couverture, comme sans plan', () => {
    const a = jeudi().p.exercices[0], b = jeudi({ zonePlan: null }).p.exercices[0];
    expect(a.paris.length).toBe(b.paris.length);
    expect(a.paris.filter(Boolean).length).toBeGreaterThan(0);
    a.paris.filter(Boolean).forEach((q) => { expect(q.exercise_slug || 'squat_barre').toBe('squat_barre'); });
  });
});

describe('la zone à ménager prime sur la zone de la routine (I79 étendu)', () => {
  const lundis = dup(6).filter((x, i) => i % 2 === 0);
  test('squat Lourd en routine + genou à ménager : la règle de ménagement s\'applique, rien de lourd, la phrase le dit', () => {
    const { e, p } = jeudi({ zonePlan: 'lourd', menagee: true, histoire: lundis });
    const x = p.exercices[0];
    expect(x.consigne.zone).not.toBe('lourd');
    expect(x.zonePlan.suspendue).toBe(true);
    expect(x.pourquoi.plan).toMatch(/zone que tu m.as demandé de ménager/);
    expect(/\d/.test(x.pourquoi.plan)).toBe(false);
    // exactement ce que dit la règle de ménagement SANS zone de plan (le plan suspendu ne rajoute aucune erreur)
    const sans = jeudi({ zonePlan: null, menagee: true, histoire: lundis });
    expect(sans.p.exercices[0].consigne.zone).toBe(x.consigne.zone);
    expect(sans.p.exercices[0].consigne.palier).toBe(x.consigne.palier);
    expect(T.verifierPlan(p, e).erreurs).toEqual(T.verifierPlan(sans.p, sans.e).erreurs);
    expect(T.verifierPlan(p, e).erreurs.some((m) => /^I79|^I80|^I81/.test(m))).toBe(false);
  });
  test('I79 forgée : suspendue mais la consigne porte Lourd', () => {
    const { e, p } = jeudi({ zonePlan: 'lourd', menagee: true, histoire: lundis });
    p.exercices[0].consigne = Object.assign({}, p.exercices[0].consigne, { zone: 'lourd' });
    p.exercices[0].menagee = Object.assign({}, p.exercices[0].menagee, { choisie: null });
    expect(T.verifierPlan(p, e).erreurs.some((x) => /^I79/.test(x))).toBe(true);
  });
});
