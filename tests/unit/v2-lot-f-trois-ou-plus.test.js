/** @jest-environment node */
//
// Lot F, « 3 ou + vaut le seuil » (20/11/2026, MOTEUR §9.26 quater, décision d'Aurélien, I242) — la saisie de la réserve plafonne à « 3 ou + » : quand
// le seuil (visée + 2) dépasse la grille, la case du haut vaut le seuil. UNE fonction, `Moteur.reserveAtteintLeSeuil(R, visee, { reglage })`, lue par le
// moteur (test par la réserve, « facile ») et par I57, I161, I233, I234. Exclue en Prudent. Chaque test discriminant échoue sur main.

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
const P = require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');

let n = 0;
const brute = (kg, reps, ressenti, rpe) => ({ id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: rpe === undefined ? null : rpe,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'presse' });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
function histoire(kg, reps, derniere) {
  return ['09-13', '09-06', '08-30', '08-23', '08-16'].map((d, i) => ({ seance: { id: 'H' + i, debut: jour(d) },
    series: [brute(kg, reps), brute(kg, reps), i === 0 ? brute(kg, reps, derniere.ressenti, derniere.rpe) : brute(kg, reps)] }));
}
const consigneDe = (g, o) => M.consigneDExercice(g, undefined, AVANT, Object.assign({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
  reglage: 'normal', edition: false }, o || {}));
const consigne = (g, o) => consigneDe(g, o).consigne;
const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('la fonction', () => {
  test('visée 0 → 2, 1 → 3, 2 → 3, 3 → jamais ; R > visée est indispensable', () => {
    expect(M.reserveAtteintLeSeuil(2, 0)).toBe(true);
    expect(M.reserveAtteintLeSeuil(1, 0)).toBe(false);
    expect(M.reserveAtteintLeSeuil(3, 1)).toBe(true);
    expect(M.reserveAtteintLeSeuil(2, 1)).toBe(false);
    expect(M.reserveAtteintLeSeuil(3, 2)).toBe(true);
    expect(M.reserveAtteintLeSeuil(2, 2)).toBe(false);
    expect(M.reserveAtteintLeSeuil(3, 3)).toBe(false);
    expect(M.reserveAtteintLeSeuil(null, 1)).toBe(false);
  });
  test('Prudent : le seuil reste visée + 2, sans borne de grille', () => {
    expect(M.reserveAtteintLeSeuil(3, 2, { reglage: 'prudent' })).toBe(false);
    expect(M.reserveAtteintLeSeuil(3, 1, { reglage: 'prudent' })).toBe(true);
  });
  test('7. la grille : RESERVE_GRILLE_MAX = le plafond de Palier.reserveDeSerie = « 3 ou + » de la saisie', () => {
    expect(M.RESERVE_GRILLE_MAX).toBe(3);
    expect(P.reserveDeSerie({ type_serie: 'travail', reps: 5, rpe: 5 })).toBe(M.RESERVE_GRILLE_MAX);
    expect(P.reserveDeSerie({ type_serie: 'travail', reps: 5, rpe: null, ressenti: 'reste_3_plus' })).toBe(M.RESERVE_GRILLE_MAX);
    expect(S.RESSENTIS).toContain('reste_3_plus');
  });
  test('7 bis. plus aucun « + RESERVE_ECART » hors de la fonction (moteur et plan)', () => {
    const moteur = fs.readFileSync(path.join(__dirname, '../../v2/js/moteur.js'), 'utf8');
    const plan = fs.readFileSync(path.join(__dirname, '../../v2/js/plan.js'), 'utf8');
    const corps = moteur.slice(moteur.indexOf('function reserveAtteintLeSeuil'), moteur.indexOf('function reserveAtteintLeSeuil') + 400);
    const hors = moteur.replace(corps, '').split('\n').filter((l) => /\+\s*RESERVE_ECART/.test(l) && !/^\s*\/\//.test(l));
    expect(hors).toEqual([]);
    expect(plan.split('\n').filter((l) => /RESERVE_ECART/.test(l) && !/^\s*\/\//.test(l))).toEqual([]);
  });
});

describe('la consigne', () => {
  test('1. Normal Lourd 140 × 4 « 3 ou + » : le test 142,5 (main : progression)', () => {
    const k = consigne(histoire(140, 4, { ressenti: 'reste_3_plus' }), { correction: 'lourd' });
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBe(142.5);
    expect(k.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 3, visee: 2 });
  });
  test('2. Normal Lourd : R 2 rien ; RPE 7 test ; RPE 7,5 rien (borne de la grille)', () => {
    expect(consigne(histoire(140, 4, { ressenti: 'reste_2' }), { correction: 'lourd' }).etat).toBe('progression');
    expect(consigne(histoire(140, 4, { rpe: 7 }), { correction: 'lourd' }).etat).toBe('test_propose');
    expect(consigne(histoire(140, 4, { rpe: 7.5 }), { correction: 'lourd' }).etat).toBe('progression');
  });
  test('Normal Mix 100 × 6 « 3 ou + » : test 102,5', () => {
    expect(consigne(histoire(100, 6, { ressenti: 'reste_3_plus' }), { correction: 'mix' }).haut.charge).toBe(102.5);
  });
  test('3. Prudent Hypertrophie et Lourd, « 3 ou + » une seule séance : aucune montée (la règle exclue)', () => {
    expect(consigne(histoire(100, 8, { ressenti: 'reste_3_plus' }), { reglage: 'prudent', correction: 'hypertrophie' }).etat).toBe('progression');
    expect(consigne(histoire(140, 4, { ressenti: 'reste_3_plus' }), { reglage: 'prudent', correction: 'lourd' }).etat).toBe('progression');
  });
  test('8. la phrase : « 3 en réserve ou plus, au-dessus des 2 visées » ; à 2, jamais « ou plus »', () => {
    const k = consigneDe(histoire(140, 4, { ressenti: 'reste_3_plus' }), { correction: 'lourd' });
    const p = sp(JSON.stringify(M.pourquoiConsigne(k.consigne, 'normal', AVANT)));
    expect(p).toMatch(/laissait 3 en réserve ou plus, au-dessus des 2 visées\s*:\s*on teste/);
    const k2 = consigneDe(histoire(100, 8, { ressenti: 'reste_2' }), { reglage: 'franc', correction: 'hypertrophie' });
    expect(sp(JSON.stringify(M.pourquoiConsigne(k2.consigne, 'franc', AVANT)))).not.toMatch(/ou plus/);
  });
});

// Le plan et I57 : un test à R = 3 en Normal Lourd ne lève aucune fausse erreur (main : « test avec 3 pour 2 visées (table) »).
describe('les invariants relisent la même fonction', () => {
  test('I57, I161 : aucun faux positif sur un test par la réserve à la case du haut', () => {
    const k = consigne(histoire(140, 4, { ressenti: 'reste_3_plus' }), { correction: 'lourd' });
    let c = 0; const id = () => 's' + (++c);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id }); se = S.ajouterExercice(se, 'presse', id, { series: 3 });
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { presse: { consigne: k, contexte: { cran: 2.5, haut: null } } },
      reglage: 'normal', paris: [], objectif: 'muscle',
      catalogue: { presse: { nom: 'Presse', equipement: 'machine', mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['quadriceps'] } } };
    const p = T.planDeSeance(e);
    expect(T.verifierPlan(p, e, null).erreurs.filter((x) => /^I57|^I161|^I234|^I233/.test(x))).toEqual([]);
  });
  // CONTRA-723 C3 — par le chemin du moteur (`parReserve`, `Math.max(visee, demandee)`), pas la fonction seule.
  test('4. Franc Hypertrophie, « Au max » demandé 3, noté « 3 ou + » : le test, sans preuve « facile » ; demandé 2 : la preuve tient', () => {
    const auMax = (dem) => { const h = histoire(100, 8, { ressenti: 'reste_3_plus' }); h[0].series[2].au_max_reserve = dem;
      return consigne(h, { reglage: 'franc', correction: 'hypertrophie' }); };
    const k3 = auMax(3);
    expect(k3.etat).toBe('test_propose');
    expect(k3.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 3, visee: 0, demandee: 3 });
    expect(k3.fondement.effortVise.preuveFacile).toBeUndefined();
    const k2 = auMax(2);
    expect(k2.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 3, demandee: 2, preuveFacile: true });
  });
});

// CONTRA-723 C1 — la phrase de fin d'exercice (`annonceDe('effort', …, 'apres')`) dit la même chose que le gris et le Pourquoi.
describe('la phrase d’après la réponse', () => {
  const apres = (ev, haut) => sp(M.annonceDe('effort', { ev, haut, moment: 'apres' }));
  test('« 3 ou + » se dit « 3 ou plus » ; 2 au-dessus d’une visée de 0, sans « ou plus »', () => {
    expect(apres({ effet: 'test', charge: 100, reps: 10, reserve: 3, visee: 1 }, { charge: 105 }))
      .toBe('100 kg × 10, il t’en restait 3 ou plus. Au-dessus de ce que je visais : la prochaine fois, on essaie 105 kg.');
    expect(apres({ effet: 'test', charge: 100, reps: 10, reserve: 2, visee: 0 }, { charge: 105 }))
      .toBe('100 kg × 10, il t’en restait 2. Au-dessus de ce que je visais : la prochaine fois, on essaie 105 kg.');
  });
  test('soulevé en Franc noté 2 (la visée relevée à 2) : la cause est dite, jamais « c’est ce que je visais » seul comme raison', () => {
    const k = consigneDe(histoire(100, 10, { ressenti: 'reste_2' }), { reglage: 'franc', correction: 'hypertrophie', famille: 'souleve_de_terre_barre' });
    const ev = k.consigne.fondement.effortVise;
    expect(ev).toMatchObject({ effet: 'test', reserve: 2, visee: 2 });
    expect(apres(ev, k.consigne.haut))
      .toBe('100 kg × 10, il t’en restait 2 : c’est ce que je visais ; avec Me pousser, c’est assez pour tester. La prochaine fois, on essaie 102,5 kg.');
  });
});
