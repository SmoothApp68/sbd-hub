/** @jest-environment node */
//
// 253 (X2, MOTEUR §9.40, décision d'Aurélien du 06/11/2026) — LA VEILLE D'UNE ACTIVITÉ DURE : « <barre> plus léger aujourd'hui », une variante de la
// consigne du jour (JAMAIS une zone) : mêmes reps, charge du plan × 0,95 au cran le plus proche (au moins un cran sous le plan, au plus −10 %), réserve
// affichée min(plan + 2, 3). Une séance volontairement plus légère n'est jamais lue comme un raté, une baisse, un pari perdu. I142.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');
require('../../v2/js/semaine.js');

const nb = (t) => String(t).replace(/[  ]/g, ' ');
const fiche = (equipement, mesure, prim, extra) => Object.assign({ equipement, mesure, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] }, extra || {});
const CAT = {
  football: fiche('aucun', 'temps', [], { slug: 'football', nom: 'Football', nature: 'cardio', hors_salle: true }),
  squat_barre: fiche('barre', 'charge_reps', ['quadriceps', 'fessiers'], { slug: 'squat_barre', nom: 'Squat (Barre)', nature: 'force' }),
  developpe_couche_barre: fiche('barre', 'charge_reps', ['pectoraux'], { slug: 'developpe_couche_barre', nom: 'Développé couché (Barre)', nature: 'force' })
};
const consigne = (charge, reps, pas, zone) => ({ consigne: { etat: 'progression', zone: zone || 'lourd', palier: charge, n: 3, ligne: { charge, vise: reps }, haut: null }, contexte: { cran: charge + pas, haut: null }, pas });

// `faits` : { squat_barre: [[charge, reps], …], developpe: [[charge, reps], …] } — les séries validées.
function monter(faits, opts) {
  const o = opts || {};
  let k = 0; const id = () => 'a-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = o.reps || 5; });
  se = S.ajouterExercice(se, 'developpe_couche_barre', id, { series: 3 });
  se.exercices[1].series.forEach((s) => { s.reps_visees = 5; });
  let minute = 0;
  [['squat_barre', 0], ['developpe', 1]].forEach(([cle, i]) => {
    ((faits || {})[cle] || []).forEach(([ch, reps], j) => {
      se = S.modifierSerie(se, i, j, { charge_kg: ch, reps });
      se = S.valider(se, i, j, new Date(Date.UTC(2026, 10, 4, 10, 0, 0) + (++minute) * 150000));
    });
  });
  return se;
}
function entrees(se, extra, o) {
  const c = o || {};
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-04T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes: { squat_barre: consigne(c.charge || 152.5, c.reps || 5, c.pas || 2.5), developpe_couche_barre: consigne(100, 5, 2.5, 'lourd') },
    reglage: c.reglage || 'normal', paris: [], objectif: 'force', catalogue: CAT, menagerProfil: [],
    activiteVeille: { seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-03' }, veilleChoix: 'leger'
  }, extra || {});
}
const plan = (faits, extra, o) => { const se = monter(faits, o); const e = entrees(se, extra, o); return { se, e, p: T.planDeSeance(e) }; };
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };
const i142 = (p, e) => T.verifierPlan(p, e).erreurs.filter((x) => /I142/.test(x));

describe('253 X2 — la règle (Moteur.veilleLegere)', () => {
  test('152,5 × 5 : 145 × 5, la zone ne bouge pas ; sans marge au plan : 2 en réserve', () => {
    const l = M.veilleLegere({ charge: 152.5, reps: 5, reserve: 0, pas: 2.5, equipement: 'barre' });
    expect(l).toMatchObject({ charge: 145, reps: 5, reserve: 2, plan: { charge: 152.5, reps: 5, reserve: 0 } });
    expect(l.baisse).toBeCloseTo(0.049, 2);
  });
  test('la réserve affichée est min(plan + 2, 3) : plan à 2 → 3, plan à 1 → 3, plan à 3 → 3', () => {
    [[2, 3], [1, 3], [3, 3], [0, 2]].forEach(([plan, aff]) => expect(M.veilleLegere({ charge: 152.5, reps: 5, reserve: plan, pas: 2.5, equipement: 'barre' }).reserve).toBe(aff));
  });
  test('reps hautes (12) : les mêmes reps, la même baisse', () => {
    expect(M.veilleLegere({ charge: 100, reps: 12, reserve: 2, pas: 2.5, equipement: 'barre' })).toMatchObject({ charge: 95, reps: 12, reserve: 3 });
  });
  test('au moins UN cran sous le plan : 5 % de 60 kg avec un cran de 5 kg → 55', () => {
    expect(M.veilleLegere({ charge: 60, reps: 5, reserve: 2, pas: 5, equipement: 'barre' })).toMatchObject({ charge: 55 });
  });
  test('la baisse ne fait pas descendre d’un cran sans dépasser −10 % : pas de variante', () => {
    // 40 kg, cran de 5 : 38 → 40 (le plus proche) → forcé un cran plus bas : 35 = −12,5 % → rien
    expect(M.veilleLegere({ charge: 40, reps: 5, reserve: 2, pas: 5, equipement: 'barre' })).toBeNull();
    // une charge ou des reps inconnus, un cran inconnu : rien
    expect(M.veilleLegere({ charge: null, reps: 5, pas: 2.5, equipement: 'barre' })).toBeNull();
    expect(M.veilleLegere({ charge: 100, reps: null, pas: 2.5, equipement: 'barre' })).toBeNull();
  });
  test('le plafond de −10 % : jamais plus', () => {
    for (const [ch, pas] of [[100, 10], [60, 5], [152.5, 2.5], [200, 5], [75, 2.5]]) {
      const l = M.veilleLegere({ charge: ch, reps: 5, reserve: 2, pas, equipement: 'barre' });
      if (l) { expect(l.charge).toBeLessThanOrEqual(ch - pas + 1e-9); expect(l.charge).toBeGreaterThanOrEqual(ch * 0.9 - 1e-9); }
    }
  });
});

describe('253 X2 — le plan : la variante est la consigne du jour, pas une zone', () => {
  test('152,5 × 5 → 145 × 5 sur les trois lignes, la zone reste Lourd, la phrase du Pourquoi est exacte', () => {
    const { e, p } = plan({});
    const x = p.exercices[0];
    expect(x.consigne.zone).toBe('lourd');
    expect(x.lignes.filter((l) => l.type === 'travail').map((l) => [l.charge, l.vise])).toEqual([[145, 5], [145, 5], [145, 5]]);
    expect(nb(x.entete.jaune[0])).toBe('145 kg × 5');
    expect(x.veilleLegere).toMatchObject({ charge: 145, reps: 5, plan: { charge: 152.5, reps: 5 } });
    expect(nb(x.pourquoi.veille)).toBe('Plan : 152,5 kg × 5. Aujourd’hui : 145 kg × 5, 3 en réserve : tu as noté football hier.');
    expect(e.seance.exercices[0].zone_plan).toBeUndefined();
    propre(p, e);
  });
  test('plan RIR 2 (Normal, Lourd) : « 3 en réserve » (le plafond)', () => {
    expect(M.reserveVisee({ zone: 'lourd', role: 'ligne', reglage: 'normal' })).toBe(2);
    expect(nb(plan({}).p.exercices[0].pourquoi.veille)).toMatch(/145 kg × 5, 3 en réserve/);
  });
  test('le développé couché (haut du corps) n’est jamais touché ; le squat seul porte la variante', () => {
    const { p } = plan({});
    expect(p.exercices[1].veilleLegere).toBeNull();
    expect(p.exercices[1].lignes.filter((l) => l.type === 'travail').every((l) => l.charge === 100)).toBe(true);
  });
  test('pas de « Au max », pas de pari, pas de réserve visée de table ni d’effort visé sur la barre', () => {
    const { p } = plan({});
    const x = p.exercices[0];
    expect(x.auMax).toBeNull(); expect(x.propositionAuMax).toBeNull();
    expect(x.lignes.every((l) => !l.auMax)).toBe(true);
    expect((x.paris || []).every((q) => q === null)).toBe(true);
    expect(x.reserveVisee).toBeNull(); expect(x.effortVise).toBeNull();
  });
  test('une barre où −5 % ne fait pas un cran (40 kg, cran de 5) : aucune proposition ; « garder » respecté', () => {
    const se = monter({});
    const e = entrees(se, { veilleChoix: null }, { charge: 40, pas: 5 });
    const p = T.planDeSeance(e);
    expect(p.veilleActivite).toBeNull();
    expect(p.exercices[0].lignes.filter((l) => l.type === 'travail').every((l) => l.charge === 40)).toBe(true);
    expect(T.planDeSeance(entrees(se, { veilleChoix: 'leger' }, { charge: 40, pas: 5 })).exercices[0].veilleLegere).toBeNull();
  });
  test('la proposition porte les mêmes chiffres que la variante (UNE fonction)', () => {
    const se = monter({}), e = entrees(se, { veilleChoix: null }), p = T.planDeSeance(e);
    expect(p.veilleActivite.legere).toMatchObject({ charge: 145, reps: 5 });
    expect(nb(p.veilleActivite.pourquoi)).toMatch(/^Plan : 152,5 kg × 5\. Aujourd’hui : 145 kg × 5, 3 en réserve : tu as noté football hier\./);
    const q = T.planDeSeance(entrees(se, { veilleChoix: 'leger' }));
    expect(q.exercices[0].veilleLegere.charge).toBe(p.veilleActivite.legere.charge);
  });
  test('« Changer » rend le plan : sans réponse, la charge du plan revient et la question aussi', () => {
    const se = monter({}), p = T.planDeSeance(entrees(se, { veilleChoix: null }));
    expect(p.exercices[0].veilleLegere).toBeNull();
    expect(p.exercices[0].lignes.filter((l) => l.type === 'travail').every((l) => l.charge === 152.5)).toBe(true);
    expect(p.veilleActivite).not.toBeNull();
  });
  test('« Garder le plan » : la charge du plan, aucune variante', () => {
    const se = monter({}), p = T.planDeSeance(entrees(se, { veilleChoix: 'garder' }));
    expect(p.exercices[0].veilleLegere).toBeNull();
    expect(p.exercices[0].lignes[0].charge).toBe(152.5);
  });
  test('ne s’applique pas : Édition, « Juste un carnet », semaine de test, consigne déjà allégée ou avec un test', () => {
    const se = monter({});
    const ed = entrees(se); ed.seance.edition = true;
    expect(T.planDeSeance(ed).exercices[0].veilleLegere).toBeNull();
    expect(T.planDeSeance(entrees(se, { intention: 'entretien' })).exercices[0].veilleLegere).toBeNull();
    const rep = entrees(se, { veilleChoix: null }); rep.consignes.squat_barre.consigne.repli = { ligne: [140, 6] };
    expect(T.planDeSeance(rep).veilleActivite).toBeNull();
    const test = entrees(se, { veilleChoix: null }); test.consignes.squat_barre.consigne.etat = 'test_propose'; test.consignes.squat_barre.consigne.haut = { charge: 155, vise: 3 };
    expect(T.planDeSeance(test).veilleActivite).toBeNull();
  });
  test('le plan ne modifie jamais ses entrées (render pur)', () => {
    const se = monter({}), e = entrees(se), avant = JSON.stringify(e);
    T.planDeSeance(e);
    expect(JSON.stringify(e)).toBe(avant);
  });
});

describe('253 X2 — une séance volontairement plus légère n’est JAMAIS lue comme un raté', () => {
  test('(témoin) au poids du plan, 4-4-3 sur une visée de 5 déclenche bien la réaction au raté', () => {
    const { p } = plan({ squat_barre: [[152.5, 4]] }, { veilleChoix: 'garder' });
    expect(p.exercices[0].rate).toBeTruthy();
  });
  test('en « plus léger » : 4, 4 sous la cible → ni réaction au raté, ni cran dessous, ni carte de forme, ni baisse', () => {
    const fait = { squat_barre: [[145, 4], [145, 4]], developpe: [[100, 4], [100, 4], [100, 4]] };
    const { e, p } = plan(fait);
    p.exercices.forEach((x) => { expect(x.rate).toBeNull(); expect(x.parisRates).toBeNull(); });
    expect(p.exercices[0].carteForme).toBeNull();
    expect(p.formeDuJour === null || p.formeDuJour.carte === null).toBe(true);
    propre(p, e);
  });
  test('la forme du jour ne compte pas le squat plus léger parmi les exercices qui flanchent', () => {
    const fait = { squat_barre: [[145, 3], [145, 3], [145, 3]] };
    const { p } = plan(fait);
    expect(p.formeDuJour === null || !p.formeDuJour.carte).toBe(true);
  });
  test('une série du squat plus léger : le geste d’un pari « cran dessous » ne naît pas (les paris sont absents, parisRates ignoré)', () => {
    const se = monter({ squat_barre: [[145, 5]] });
    const p = T.planDeSeance(entrees(se, { parisRates: { squat_barre: { n: 2, charge: 145, reps: 5 } } }));
    expect(p.exercices[0].parisRates).toBeNull();
  });
  test('(témoin) le même fait de paris ratés, au poids du plan, ouvre bien la carte', () => {
    const se = monter({});
    const p = T.planDeSeance(entrees(se, { veilleChoix: 'garder', parisRates: { squat_barre: { n: 2, charge: 152.5, reps: 5 } } }));
    expect(p.exercices[0].parisRates).toBeTruthy();
  });
  test('la séance terminée plus légère est NEUTRE pour la suite : le geste est lu par UNE fonction', () => {
    expect(T.veilleLegereDesGestes([{ geste: 'veille_legere', slug: 'squat_barre' }])).toBe('squat_barre');
    expect(T.veilleLegereDesGestes([{ geste: 'veille_legere', slug: 'squat_barre' }, { geste: 'veille_legere_annulee', slug: 'squat_barre' }])).toBeNull();
    expect(T.veilleLegereDesGestes([{ geste: 'veille_legere', slug: 'squat_barre' }, { geste: 'veille_legere_annulee', slug: 'squat_barre' }, { geste: 'veille_legere', slug: 'squat_barre' }])).toBe('squat_barre');
    expect(T.veilleLegereDesGestes([{ geste: 'forme_ajustee', slug: 'x' }])).toBeNull();
    expect(T.veilleLegereDesGestes(null)).toBeNull();
  });
  test('les deux gestes s’écrivent dans sessions.gestes (Seance.noterGeste), sans autre champ', () => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: () => 'x' });
    se = S.noterGeste(se, { geste: 'veille_legere', slug: 'squat_barre' });
    se = S.noterGeste(se, { geste: 'veille_legere_annulee', slug: 'squat_barre' });
    expect(se.gestes).toEqual([{ geste: 'veille_legere', slug: 'squat_barre' }, { geste: 'veille_legere_annulee', slug: 'squat_barre' }]);
  });
  test('la forme du jour (moteur) se tait après « plus léger » : pas de second allègement', () => {
    const ex = [{ iExo: 0, nom: 'a', fini: true, demarre: true, sous: 2, n: 3, baissee: false }, { iExo: 1, nom: 'b', fini: true, demarre: true, sous: 2, n: 3, baissee: false }];
    expect(M.reactionAuRate({ niveau: 'seance', exercices: ex, restants: 2, veille: { choix: 'leger', nom: 'Football' } }).silence).toBeTruthy();
  });
});

describe('253 X2 — le câblage de l’app (lu dans le source)', () => {
  const fs = require('fs');
  const app = fs.readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('la séance plus légère est neutre : seancesAjusteesALaForme lit Plan.veilleLegereDesGestes (la lecture unique de l’exemption)', () => {
    const corps = app.slice(app.indexOf('function seancesAjusteesALaForme()'), app.indexOf('function seancesAjusteesALaForme()') + 900);
    expect(corps).toMatch(/Plan\.veilleLegereDesGestes\(x\.gestes\) !== null/);
  });
  test('« plus léger » écrit le geste, « Changer » l’annule, aucune zone n’est posée par la veille', () => {
    const surVeille = app.slice(app.indexOf('surVeille: async function'), app.indexOf('repriseVeille: function'));
    expect(surVeille).toMatch(/geste: 'veille_legere'/);
    expect(surVeille).not.toMatch(/poserZoneDePlanDe/);
    const changer = app.slice(app.indexOf('surChangerVeille: async function'), app.indexOf('surChangerVeille: async function') + 700);
    expect(changer).toMatch(/geste: 'veille_legere_annulee'/);
    expect(changer).not.toMatch(/poserZoneDePlanDe/);
    const reprendre = app.slice(app.indexOf('async function reprendreLaVeilleDuJour'), app.indexOf('async function reprendreLaVeilleDuJour') + 900);
    expect(reprendre).toMatch(/geste: 'veille_legere'/);
    expect(reprendre).not.toMatch(/poserZoneDePlanDe/);
  });
});

describe('253 X2 — I142 et les invariants adaptés', () => {
  test('le plan propre passe I123, I124, I129, I140, I142', () => {
    [null, 'leger', 'garder'].forEach((c) => {
      const se = monter({}), e = entrees(se, { veilleChoix: c }), p = T.planDeSeance(e);
      expect(T.verifierPlan(p, e).erreurs.filter((x) => /I12[349]|I14[02]/.test(x))).toEqual([]);
    });
  });
  test('I142 : une charge à moins d’un cran du plan', () => {
    const { e, p } = plan({});
    p.exercices[0].veilleLegere.charge = 152.5; p.exercices[0].lignes.forEach((l) => { if (l.type === 'travail') l.charge = 152.5; });
    expect(i142(p, e).join('|')).toMatch(/n’est pas sous celle du plan|à moins d’un cran/);
  });
  test('I142 : plus de 10 % sous le plan', () => {
    const { e, p } = plan({});
    p.exercices[0].veilleLegere.charge = 130; p.exercices[0].lignes.forEach((l) => { if (l.type === 'travail') l.charge = 130; });
    expect(i142(p, e).join('|')).toMatch(/plus de 10 %/);
  });
  test('I142 : des reps changées, une zone changée, un « Au max », un pari, une réserve fausse', () => {
    let { e, p } = plan({});
    p.exercices[0].veilleLegere.reps = 4;
    expect(i142(p, e).join('|')).toMatch(/les reps ont changé/);
    ({ e, p } = plan({})); p.exercices[0].consigne.zone = 'mix';
    expect(i142(p, e).join('|')).toMatch(/la zone a changé/);
    ({ e, p } = plan({})); p.exercices[0].lignes[0].auMax = { x: 1 };
    expect(i142(p, e).join('|')).toMatch(/Au max/);
    ({ e, p } = plan({})); p.exercices[0].paris = [{ valeur_predite: 5 }];
    expect(i142(p, e).join('|')).toMatch(/un pari écrit/);
    ({ e, p } = plan({})); p.exercices[0].veilleLegere.reserve = 1;
    expect(i142(p, e).join('|')).toMatch(/la réserve affichée est 1/);
  });
  test('I142 : la variante sans que la personne l’ait choisie', () => {
    const { e, p } = plan({});
    expect(i142(p, Object.assign({}, e, { veilleChoix: null })).join('|')).toMatch(/sans que la personne l’ait choisie/);
  });
  test('I123 : la proposition en semaine de test ou allégée est refusée', () => {
    const se = monter({}), e = entrees(se, { veilleChoix: null }), p = T.planDeSeance(e);
    p.allegee = { source: 'x' };
    expect(T.verifierPlan(p, e).erreurs.join('|')).toMatch(/I123 — une proposition de veille en semaine de test ou allégée/);
  });
});
