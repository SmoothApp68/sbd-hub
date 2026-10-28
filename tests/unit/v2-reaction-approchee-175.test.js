/** @jest-environment node */
//
// 175 (commit 6) — `phraseReaction` : quand la charge de la série est approchée (163, « ≈ »), la réaction l'écrit devant la
// charge, comme la consigne le fait. Le plan pose `approchee` sur le message (jamais l'écran, jamais un recalcul).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const SLUG = 'leg_curl_assis';
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = '2026-10-20T10:00:00+00:00';
let n = 0;
const brute = (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: SLUG });
const seance = (id, md, kg, reps) => ({ seance: { id, debut: jour(md) }, series: [brute(kg, reps), brute(kg, reps), brute(kg, reps)] });
const HIST = () => [seance('S3', '10-16', 30, 12), seance('S2', '10-09', 30, 12), seance('S1', '10-02', 30, 12)];
const O = { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser', reglage: 'normal', edition: false };
const NB = ' ';
const esp = (t) => String(t || '').replace(/[  ]/g, ' ');

function planAvec(faites, hist) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.ajouterExercice(S.creer({ id: 'S1', userId: 'u', idSerie: id }), SLUG, id, { series: 3 });
  faites.forEach(([kg, reps], i) => {
    se = S.valider(S.modifierSerie(se, 0, i, { charge_kg: kg, reps }), 0, i, new Date('2026-10-20T10:0' + i + ':00Z'));
  });
  const c = M.consigneDExercice(hist || HIST(), undefined, AVANT, O);
  const e = {
    seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [SLUG]: c },
    catalogue: { [SLUG]: { equipement: 'machine', nom: 'Leg Curl Assis (Machine)', muscles_primaires: ['ischio_jambiers'],
      muscles_secondaires: [], muscles_stabilisateurs: [], mesure: 'charge_reps', salle: null } },
    reglage: 'normal', paris: [], suites: {}, phase: 'maintien', debutant: false, volume: {},
    escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { [SLUG]: 3 }, marches: [], remplacants: {} }
  };
  const p = T.planDeSeance(e);
  return { c, e, p, msg: p.exercices[0].message };
}

describe('175 — la réaction écrit « ≈ » devant une charge approchée', () => {
  test('la phrase : `approchee` précède la charge, sans lui rien ne change', () => {
    const m = { type: 'haut', rang: 2, charge: 35, reps: 12 };
    expect(esp(M.phraseReaction(Object.assign({ approchee: true }, m), 'volume'))).toBe('≈ 35 kg × 12 : le haut de ta zone.');
    expect(esp(M.phraseReaction(m, 'volume'))).toBe('35 kg × 12 : le haut de ta zone.');
  });
  test('⚠️ DISCRIMINANT — la série à 35 kg (jamais faite : « ≈ ») : la réaction du plan écrit « ≈ 35 kg »', () => {
    const { c, e, p, msg } = planAvec([[35, 12]]);
    expect(c.consigne.haut).toMatchObject({ charge: 35, approchee: true });
    expect(msg && msg.type).toBe('elan');
    expect(msg.phrase).toBe('≈' + NB + '35' + NB + 'kg' + NB + '×' + NB + '12, au-dessus de ta charge de travail' + NB + ': la suite reste à 35' + NB + 'kg.');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('un « pas encore » sur la charge approchée l’écrit aussi', () => {
    const { msg } = planAvec([[30, 12], [35, 6]]);
    expect(msg && msg.type).toBe('pas_encore_soi');
    expect(msg.phrase.indexOf('≈' + NB + '35' + NB + 'kg' + NB + '×' + NB + '6')).toBe(0);
  });
  test('DISCRIMINANT — une charge déjà notée (35 kg fait à la séance d’avant) : la même réaction, sans « ≈ »', () => {
    const hist = [seance('S4', '10-18', 35, 8)].concat(HIST());
    const { c, e, p, msg } = planAvec([[35, 12]], hist);
    expect(c.consigne.ligne.approchee).toBeUndefined();
    expect(msg && msg.phrase).toBeTruthy();
    expect(msg.phrase).not.toContain('≈');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});
