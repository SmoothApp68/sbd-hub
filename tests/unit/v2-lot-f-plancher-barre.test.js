/** @jest-environment node */
//
// Lot F, A1 (20/11/2026, MOTEUR §9.26 ter, décision d'Aurélien, I241) — LE PLANCHER DE RÉSERVE PAR BARRE. Sur un exercice à la barre
// (`Generateur.familleDeBarre`), la réserve AFFICHÉE ne descend jamais sous le plancher de sa barre, quel que soit le réglage : squat, couché,
// militaire 1, soulevé 2 (`Moteur.PLANCHER_DE_BARRE`, lue aussi par `auMaxDe`). Le test par la réserve reste sur la TABLE ; « facile » se lit contre
// l'affichée (I234). Exemptée : la semaine de mesure. Chaque test ci-dessous échoue sur main.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/semaine.js');

const SQUAT = 'squat_barre', SOULEVE = 'souleve_de_terre_barre', MILITAIRE = 'developpe_militaire_barre';
let n = 0;
const brute = (kg, reps, ressenti, slug) => ({
  id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: slug || SQUAT
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, correction: 'hypertrophie' };
function histoire(kg, repsHabituelles, derniere) {
  const dates = ['09-13', '09-06', '08-30', '08-23', '08-16'];
  return dates.map((d, i) => ({ seance: { id: 'H' + i, debut: jour(d) },
    series: [brute(kg, repsHabituelles), brute(kg, repsHabituelles),
      i === 0 ? brute(kg, derniere.reps, derniere.ressenti) : brute(kg, repsHabituelles)] }));
}
const consigneDe = (groupes, options) => M.consigneDExercice(groupes, undefined, AVANT, Object.assign({}, OPTIONS, options || {}));
const consigne = (groupes, options) => consigneDe(groupes, options).consigne;
const sp = (s) => String(s).replace(/[  ]/g, ' ');

describe('la table et la fonction', () => {
  test('squat, couché, militaire 1 ; soulevé 2 ; pas une barre : rien', () => {
    expect(M.PLANCHER_DE_BARRE).toEqual({ squat: 1, couche: 1, militaire: 1, souleve: 2, jambes_tendues: 1 });   // 27/11/2026 : + le mouvement du roumain (v2-plancher-roumain.test.js)
    expect(M.plancherDeBarre(SQUAT)).toBe(1);
    expect(M.plancherDeBarre('developpe_couche_barre')).toBe(1);
    expect(M.plancherDeBarre(MILITAIRE)).toBe(1);
    expect(M.plancherDeBarre(SOULEVE)).toBe(2);
    expect(M.plancherDeBarre(null)).toBeNull();
    expect(M.plancherDeBarre(undefined)).toBeNull();
  });
  test('reserveAffichee : la table relevée au plancher de la barre, à tous les rôles ; la table (reserveVisee) n’en sait rien', () => {
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: SQUAT })).toBe(1);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: SOULEVE })).toBe(2);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage: 'normal', famille: SQUAT })).toBe(1);
    expect(M.reserveAffichee({ zone: 'lourd', role: 'ligne', reglage: 'normal', famille: SQUAT })).toBe(2);
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: null })).toBe(0);
    expect(M.reserveVisee({ zone: 'hypertrophie', role: 'ligne', reglage: 'franc', famille: SQUAT })).toBe(0);
    // la ligne de test d'une protégée reste sans chiffre (D-B1)
    expect(M.reserveAffichee({ zone: 'hypertrophie', role: 'test', reglage: 'franc', famille: SQUAT, protegee: true })).toBeNull();
  });
  test('les frères à la barre suivent leur barre ; la machine, non (Generateur.familleDeBarre)', () => {
    expect(G.familleDeBarre(SQUAT, {})).toBe(SQUAT);
    expect(G.familleDeBarre('presse', { presse: { equipement: 'machine' } })).toBeNull();
  });
});

describe('la consigne (vrai moteur, 100 kg, zone Hypertrophie 8-10, trois séries égales)', () => {
  const franc = { reglage: 'franc' };
  test('1. Franc, squat, 100 × 10 noté « sans marge » : la charge reste (main : test 102,5)', () => {
    const g = histoire(100, 10, { reps: 10, ressenti: 'reste_0' });
    expect(consigne(g, franc).etat).toBe('test_propose');                         // témoin : sans la barre
    const k = consigne(g, Object.assign({ famille: SQUAT }, franc));
    expect(k.etat).toBe('progression');
    expect(k.fondement.effortVise).toMatchObject({ effet: 'garde', reserve: 0, visee: 1, viseeTable: 0 });
  });
  test('2. Franc, soulevé : R 1 garde ; R 2 un cran sans preuve ; « 3 ou + » deux crans, preuve facile', () => {
    const k1 = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_1' }), Object.assign({ famille: SOULEVE }, franc));
    expect(k1.etat).toBe('progression');
    expect(k1.fondement.effortVise).toMatchObject({ effet: 'garde', visee: 2 });
    const k2 = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_2' }), Object.assign({ famille: SOULEVE }, franc));
    expect(k2.etat).toBe('test_propose');
    expect(k2.haut.charge).toBe(102.5);
    expect(k2.fondement.preuve).toBeFalsy();
    expect(k2.fondement.effortVise.preuveFacile).toBeUndefined();
    const k3 = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_3_plus' }), Object.assign({ famille: SOULEVE }, franc));
    expect(k3.haut.charge).toBe(105);
    expect(k3.fondement.preuve).toBe('facile');
  });
  test('Franc, 9 reps, R 2 : un cran au lieu de deux (le coût principal, CONTRA-TT3-A1 D)', () => {
    const g = histoire(100, 9, { reps: 9, ressenti: 'reste_2' });
    expect(consigne(g, franc).haut.charge).toBe(105);
    expect(consigne(g, Object.assign({ famille: SQUAT }, franc)).haut.charge).toBe(102.5);
  });
  test('3. Normal, soulevé, 10 reps : R 1 garde (main : test) ; R 2 test, témoin inchangé', () => {
    const k1 = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_1' }), { famille: SOULEVE });
    expect(k1.etat).toBe('progression');
    expect(k1.fondement.effortVise).toMatchObject({ effet: 'garde', visee: 2, viseeTable: 1 });
    expect(consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_2' }), { famille: SOULEVE }).etat).toBe('test_propose');
  });
  test('4. témoin du périmètre : une machine (famille null) en Franc reste comme avant', () => {
    const g = histoire(100, 10, { reps: 10, ressenti: 'reste_2' });
    const k = consigne(g, Object.assign({ famille: null, equipement: 'machine' }, franc));
    expect(k.fondement.effortVise.visee).toBe(0);
    expect(k.fondement.preuve).toBe('facile');
  });
  test('5. Franc, soulevé, bord 150 × 2 noté 1 : la charge reste (main : 152,5)', () => {
    const g = [0, 1, 2].map((i) => ({ seance: { id: 'B' + i, debut: jour(['09-13', '09-06', '08-30'][i]) },
      series: [brute(150, 2, null, SOULEVE), brute(150, 2, i === 0 ? 'reste_1' : null, SOULEVE)] }));
    expect(consigne(g, { reglage: 'franc', correction: null }).etat).toBe('bord');
    expect(consigne(g, { reglage: 'franc', correction: null, famille: SOULEVE }).etat).toBe('bord_garde');
  });
  test('8. la phrase : jamais « ce que je visais » ET « Tu avais de la marge » ; la cause est dite ; l’accord « le 1 visé »', () => {
    const k = consigneDe(histoire(100, 8, { reps: 8, ressenti: 'reste_2' }), Object.assign({ famille: SOULEVE }, franc));
    const p = sp(JSON.stringify(M.pourquoiConsigne(k.consigne, 'franc', AVANT)));
    expect(p).toMatch(/laissait 2 en réserve, ce que je visais ; avec Me pousser, c’est assez pour tester le cran au-dessus/);
    expect(/ce que je visais/.test(p) && /Tu avais de la marge/.test(p)).toBe(false);
    const k2 = consigneDe(histoire(100, 9, { reps: 9, ressenti: 'reste_2' }), Object.assign({ famille: SQUAT }, franc));
    const p2 = sp(JSON.stringify(M.pourquoiConsigne(k2.consigne, 'franc', AVANT)));
    expect(p2).toMatch(/plus que le 1 visé\s*:\s*on teste/);
    expect(p2).not.toMatch(/les 1 visées/);
  });
  test('le report de zone lit l’affichée de la barre (plus léger, voulu)', () => {
    const r0 = M.reportDeZone({ seances: [{ debut: jour('09-13'), palier: 180, niveau: 5, reserve: 1 }], avant: AVANT, zoneAvant: 'lourd', zone: 'hypertrophie',
      reglage: 'franc', cran: (c, s) => c + 2.5 * s });
    const r1 = M.reportDeZone({ seances: [{ debut: jour('09-13'), palier: 180, niveau: 5, reserve: 1 }], avant: AVANT, zoneAvant: 'lourd', zone: 'hypertrophie',
      reglage: 'franc', famille: SOULEVE, cran: (c, s) => c + 2.5 * s });
    expect(r1.charge).toBeLessThan(r0.charge);
  });
});

describe('« Au max » disparaît (20/11/2026, I251) : la table des planchers n’a plus qu’un lecteur, la visée affichée', () => {
  test('7. `auMaxDe` n’existe plus ; militaire 1, soulevé 2 restent la constante de `plancherDeBarre`', () => {
    expect(M.auMaxDe).toBeUndefined();
    expect(M.plancherDeBarre(SOULEVE)).toBe(M.PLANCHER_DE_BARRE.souleve);
    expect(M.plancherDeBarre(MILITAIRE)).toBe(M.PLANCHER_DE_BARRE.militaire);
  });
});

// ── Le plan (planDeSeance + verifierPlan) ─────────────────────────────────────────────────────────────────────────
const CATALOGUE = {
  [SQUAT]: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['quadriceps'], mouvement: 'squat' },
  [SOULEVE]: { nom: 'Soulevé de terre', equipement: 'barre', mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['ischio_jambiers'], mouvement: 'souleve' }
};
function jouer(slug, cons, faites, reglage, extra) {
  let k = 0; const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id }); se = S.ajouterExercice(se, slug, id, { series: cons.n || 3 });
  faites.forEach((f, t) => {
    se = S.modifierSerie(se, 0, t, { charge_kg: f[0], reps: f[1] });
    se = S.definirEffort(se, 0, t, { rpe: f[2], ressenti: null });
    se = S.valider(se, 0, t, new Date('2026-09-20T18:' + (30 + 3 * t) + ':00Z'));
  });
  const e = Object.assign({ seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
    consignes: { [slug]: { consigne: cons, contexte: { cran: 2.5, haut: null } } }, reglage, paris: [], objectif: 'muscle', catalogue: CATALOGUE }, extra || {});
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: T.verifierPlan(p, e, null).erreurs };
}
const progression = { etat: 'progression', zone: 'hypertrophie', palier: 100, niveau: 9, n: 3, ligne: { charge: 100, vise: 10 }, haut: null };

describe('le plan : un seul chiffre par barre', () => {
  test('6. squat en Franc : garde des lignes 1, en-tête « garde-en 1 », la réaction reçoit le plancher (I232, I216)', () => {
    const c = consigne(histoire(100, 9, { reps: 9 }), { reglage: 'franc', famille: SQUAT });
    const r = jouer(SQUAT, c, [], 'franc');
    expect(r.x.gardeDeLigne).toBe(1);
    expect(r.x.reserveAffichee).toBe(1);
    expect(r.x.reserveVisee).toBe(0);
    expect(r.erreurs).toEqual([]);
  });
  test('la porte du cran lit la garde de la barre : squat en Franc, 100 × 9 à RPE 10 devant un test, la porte se ferme (main : garde 0, ouverte)', () => {
    const avecTest = Object.assign({}, progression, { etat: 'test_propose', n: 4, haut: { charge: 102.5, vise: 8, k: 1 } });
    const r = jouer(SQUAT, avecTest, [[100, 9, 10]], 'franc');
    expect(r.x.gardeDeLigne).toBe(1);
    expect(r.x.porteDuCran && r.x.porteDuCran.raison).toBe('echec');
    expect(r.erreurs).toEqual([]);
    // témoin : la même série sur une machine (pas une barre) garde la porte ouverte
    const CAT = Object.assign({}, CATALOGUE, { presse: { nom: 'Presse', equipement: 'machine', mesure: 'charge_reps', polyarticulaire: true, muscles_primaires: ['quadriceps'] } });
    const rm = jouer('presse', avecTest, [[100, 9, 10]], 'franc', { catalogue: CAT });
    expect(rm.x.gardeDeLigne).toBe(0);
    expect(rm.x.porteDuCran).toBeNull();
  });
  test('soulevé en Normal Hypertrophie : en-tête 2 et garde des lignes 2, le même chiffre (main : 1 et 2)', () => {
    const r = jouer(SOULEVE, progression, [], 'normal');
    expect(r.x.reserveAffichee).toBe(2);
    expect(r.x.gardeDeLigne).toBe(2);
    expect(r.erreurs).toEqual([]);
  });
  test('la ligne du Pourquoi, une fois, quand la barre relève la table (le soulevé en Normal compris)', () => {
    const r = jouer(SOULEVE, progression, [], 'normal');
    expect(r.x.plancher && sp(r.x.plancher.phrase)).toBe('Sur cette barre, je vise 2 en réserve. Tu notes ce que tu veux.');
    // « Au max » disparaît (I251) : la phrase n'annonce jamais d'échec.
    const rf = jouer(SQUAT, progression, [], 'franc');
    expect(rf.x.auMax).toBeUndefined();
    expect(sp(rf.x.plancher.phrase)).toBe('Sur cette barre, je vise 1 en réserve, même avec Me pousser. Tu notes ce que tu veux.');
    expect(jouer(SQUAT, progression, [], 'normal').x.plancher).toBeNull();     // Normal Hypertrophie : table 1 = plancher, rien à dire
  });
  test('« Au max » disparaît (I251) — une marque `au_max` sur la ligne (une version d’avant) ne change ni la phrase, ni les paris (avant, CONTRA-723 C2 et C4 : la phrase d’échec et le pari de la table)', () => {
    let k = 0; const id = () => 'p-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id }); se = S.ajouterExercice(se, SQUAT, id, { series: 3 });
    se.exercices[0].series[2].au_max = true;
    const e = { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { [SQUAT]: { consigne: progression, contexte: { cran: 2.5, haut: null } } }, reglage: 'franc', paris: [], objectif: 'muscle', catalogue: CATALOGUE };
    const p = T.planDeSeance(e), x = p.exercices[0];
    expect(x.auMax).toBeUndefined();
    expect(sp(x.plancher.phrase)).toBe('Sur cette barre, je vise 1 en réserve, même avec Me pousser. Tu notes ce que tu veux.');
    expect(Object.keys(x.paris).map((i) => x.paris[i]).some((q) => q && q.fondement && q.fondement.au_max)).toBe(false);
    expect(T.verifierPlan(p, e, null).erreurs).toEqual([]);
    expect(sp(M.phraseDeLaBarre(1, 'franc'))).toBe('Sur cette barre, je vise 1 en réserve, même avec Me pousser. Tu notes ce que tu veux.');
  });
  test('ligne de test d’un squat en Normal Hypertrophie : 1 (main : 0)', () => {
    const avecTest = Object.assign({}, progression, { etat: 'test_propose', haut: { charge: 102.5, vise: 8, k: 1 } });
    const r = jouer(SQUAT, avecTest, [], 'normal');
    expect(r.x.reserveVisee).toBe(0);
    expect(r.x.reserveAffichee).toBe(1);
    expect(r.erreurs).toEqual([]);
  });
  test('11. une consigne figée d’avant (visée 0, squat en Franc) : aucune fausse erreur (I64, I241 ne lit que le plan du jour)', () => {
    const avant = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_2' }), { reglage: 'franc' });
    expect(avant.fondement.effortVise.visee).toBe(0);
    const r = jouer(SQUAT, avant, [], 'franc');
    expect(r.erreurs.filter((x) => /^I64|^I57|^I235/.test(x))).toEqual([]);
  });
});

describe('I241 : le vérificateur', () => {
  test('une réserve affichée sous le plancher de la barre est une erreur ; la semaine de mesure est exemptée', () => {
    const r = jouer(SQUAT, progression, [], 'franc');
    const faux = Object.assign({}, r.p, { exercices: [Object.assign({}, r.x, { reserveAffichee: 0, gardeDeLigne: 0 })] });
    const er = T.verifierPlan(faux, r.e, null).erreurs.filter((x) => /^I241/.test(x));
    expect(er.length).toBeGreaterThanOrEqual(2);
    const test = Object.assign({}, r.p, { exercices: [Object.assign({}, r.x, { reserveAffichee: 0, gardeDeLigne: 0, semaineDeTest: { barre: true } })] });
    expect(T.verifierPlan(test, r.e, null).erreurs.filter((x) => /^I241/.test(x))).toEqual([]);
  });
  test('9. I57 : un test au soulevé (R 2, visée 2, viseeTable 0) passe ; sans viseeTable, l’erreur I57', () => {
    const k = consigne(histoire(100, 10, { reps: 10, ressenti: 'reste_2' }), { reglage: 'franc', famille: SOULEVE });
    expect(k.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 2, visee: 2, viseeTable: 0 });
    const r = jouer(SOULEVE, k, [], 'franc');
    expect(r.erreurs.filter((x) => /^I57/.test(x))).toEqual([]);
    const sans = JSON.parse(JSON.stringify(k)); delete sans.fondement.effortVise.viseeTable;
    expect(jouer(SOULEVE, sans, [], 'franc').erreurs.some((x) => /^I57/.test(x))).toBe(true);
  });
});
