/** @jest-environment node */
//
// 253 (X3, MOTEUR §9.40) — LA RÉPONSE DE LA VEILLE VAUT POUR LA JOURNÉE : une nouvelle séance du même jour (après un abandon) reprend la réponse,
// ne repose pas la question, et le dit (« Comme ce matin : squat plus léger. »). I140. 253 (X2) : « plus léger » remplace « Mix » (une variante de la consigne, aucune zone).
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

const fiche = (equipement, mesure, prim, extra) => Object.assign({ equipement, mesure, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] }, extra || {});
const CAT = {
  football: fiche('aucun', 'temps', [], { slug: 'football', nom: 'Football', nature: 'cardio', hors_salle: true }),
  squat_barre: fiche('barre', 'charge_reps', ['quadriceps', 'fessiers'], { slug: 'squat_barre', nom: 'Squat (Barre)', nature: 'force' }),
  developpe_couche_barre: fiche('barre', 'charge_reps', ['pectoraux'], { slug: 'developpe_couche_barre', nom: 'Développé couché (Barre)', nature: 'force' })
};
function seanceDe(slugs) {
  let n = 0; const id = () => 'f-' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((s) => { se = S.ajouterExercice(se, s, id, { series: 3 }); });
  return se;
}
const consigne = (zone) => ({ consigne: { etat: 'progression', zone: { cle: zone }, palier: 152.5, n: 3, ligne: { charge: 152.5, vise: 5 }, haut: null }, pas: 2.5 });
function entrees(se, extra) {
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-04T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { squat_barre: consigne('lourd') }, reglage: 'normal', paris: [], objectif: 'force', catalogue: CAT,
    activiteVeille: { seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-03' },
    veilleChoix: 'leger', veilleReprise: { slug: 'squat_barre', heure: 8 }, menagerProfil: []
  }, extra || {});
}
const i140 = (p, e) => T.verifierPlan(p, e).erreurs.filter((x) => /I140/.test(x));

describe('253 — la phrase du coach (Moteur.phraseDeLaVeilleReprise)', () => {
  test('« Comme ce matin : squat plus léger. » / « Comme ce matin : plan gardé. »', () => {
    expect(M.phraseDeLaVeilleReprise({ choix: 'leger', nom: 'Squat', heure: 8, repris: true })).toBe('Comme ce matin\u00a0: squat plus léger.');
    expect(M.phraseDeLaVeilleReprise({ choix: 'garder', nom: 'Squat', heure: 8, repris: true })).toBe('Comme ce matin\u00a0: plan gardé.');
  });
  test('dans la séance même (X2) : « Squat plus léger aujourd’hui. » / « Plan gardé. » — la même fonction de phrase', () => {
    expect(M.phraseDeLaVeilleReprise({ choix: 'leger', nom: 'Squat' })).toBe('Squat plus léger aujourd’hui.');
    expect(M.phraseDeLaVeilleReprise({ choix: 'garder', nom: 'Squat' })).toBe('Plan gardé.');
  });
  test('à partir de midi, ou sans heure : « tout à l’heure »', () => {
    expect(M.phraseDeLaVeilleReprise({ choix: 'garder', heure: 12, repris: true })).toBe('Comme tout à l’heure\u00a0: plan gardé.');
    expect(M.phraseDeLaVeilleReprise({ choix: 'leger', nom: 'Squat', heure: 15, repris: true })).toBe('Comme tout à l’heure\u00a0: squat plus léger.');
    expect(M.phraseDeLaVeilleReprise({ choix: 'garder', heure: null, repris: true })).toBe('Comme tout à l’heure\u00a0: plan gardé.');
  });
  test('un choix inconnu (dont l’ancien « mix ») : rien', () => {
    [null, {}, { choix: 'autre' }, { choix: 'mix' }].forEach((x) => expect(M.phraseDeLaVeilleReprise(x)).toBeNull());
  });
});

describe('253 — la mémoire du jour (pure)', () => {
  test('la réponse vaut pour son jour civil, pas un autre', () => {
    const m = T.noterVeilleDuJour('2026-11-04', 'leger', 8);
    expect(T.veilleDuJour(m, '2026-11-04')).toEqual({ choix: 'leger', heure: 8 });
    expect(T.veilleDuJour(m, '2026-11-05')).toBeNull();
    expect(T.veilleDuJour(null, '2026-11-04')).toBeNull();
    expect(T.veilleDuJour({ jour: '2026-11-04', choix: 'x' }, '2026-11-04')).toBeNull();
    expect(T.veilleDuJour({ jour: '2026-11-04', choix: 'mix' }, '2026-11-04')).toBeNull();   // l'ancien vocabulaire (« Mix ») n'est plus repris
    expect(T.noterVeilleDuJour('2026-11-04', 'peut-être', 8)).toBeNull();
  });
});

describe('253 — le plan d’une nouvelle séance du jour (I140)', () => {
  test('« plus léger » repris : la question ne revient pas, la ligne le dit, « Changer »', () => {
    const se = seanceDe(['squat_barre', 'developpe_couche_barre']), e = entrees(se), p = T.planDeSeance(e);
    expect(p.veilleActivite).toBeNull();
    expect(p.veilleReprise).toEqual({ choix: 'leger', slug: 'squat_barre', nom: 'Squat', lien: 'Changer', repris: true, phrase: 'Comme ce matin\u00a0: squat plus léger.' });
    expect(i140(p, e)).toEqual([]);
  });
  test('« Garder le plan » repris : « Comme ce matin : plan gardé. »', () => {
    const se = seanceDe(['squat_barre', 'developpe_couche_barre']), e = entrees(se, { veilleChoix: 'garder' });
    const p = T.planDeSeance(e);
    expect(p.veilleActivite).toBeNull();
    expect(p.veilleReprise.phrase).toBe('Comme ce matin : plan gardé.');
    expect(i140(p, e)).toEqual([]);
  });
  test('sans reprise : aucune ligne (la question, elle, reste celle de 225)', () => {
    const se = seanceDe(['squat_barre']), e = entrees(se, { veilleChoix: null, veilleReprise: null, consignes: { squat_barre: consigne('lourd') } });
    const p = T.planDeSeance(e);
    expect(p.veilleReprise).toBeNull();
    expect(p.veilleActivite).not.toBeNull();
  });
  test('rien sans activité notée, rien en Édition, rien en « Juste un carnet »', () => {
    const se = seanceDe(['squat_barre']);
    expect(T.planDeSeance(entrees(se, { activiteVeille: null })).veilleReprise).toBeNull();
    const ed = entrees(se); ed.seance.edition = true;
    expect(T.planDeSeance(ed).veilleReprise).toBeNull();
    expect(T.planDeSeance(entrees(se, { intention: 'entretien' })).veilleReprise).toBeNull();
  });
  test('I140 : la question qui revient malgré la réponse reprise est refusée', () => {
    const se = seanceDe(['squat_barre']), e = entrees(se), p = T.planDeSeance(e);
    p.veilleActivite = { slug: 'squat_barre' };
    expect(i140(p, e).join('|')).toMatch(/I140 — la question de la veille revient/);
  });
  test('I140 : « plus léger » dit alors que la barre porte la charge du plan', () => {
    const se = seanceDe(['squat_barre']), e = entrees(se), p = T.planDeSeance(e);
    p.exercices[0].veilleLegere = null;
    expect(i140(p, e).join('|')).toMatch(/porte la charge du plan/);
  });
  test('I140 : une ligne reprise sans activité notée, sans « Changer » ou hors voix', () => {
    const se = seanceDe(['squat_barre'], true), e = entrees(se), p = T.planDeSeance(e);
    expect(i140(p, Object.assign({}, e, { activiteVeille: null })).join('|')).toMatch(/sans activité notée/);
    expect(i140(Object.assign({}, p, { veilleReprise: Object.assign({}, p.veilleReprise, { lien: null }) }), e).join('|')).toMatch(/sans ..Changer/);
    expect(i140(Object.assign({}, p, { veilleReprise: Object.assign({}, p.veilleReprise, { phrase: 'Bravo !' }) }), e).join('|')).toMatch(/voix du coach/);
    expect(i140(p, Object.assign({}, e, { veilleChoix: 'garder' })).join('|')).toMatch(/ne dit pas la réponse/);
  });
});
