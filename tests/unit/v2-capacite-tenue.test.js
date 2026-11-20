/** @jest-environment node */
//
// « Capacité tenue » (20/11/2026, MOTEUR §9.26 delta, décision d'Aurélien : variante A de TT-CAPACITE-BARRES, la règle vaut aussi sur les barres ;
// I252, I252 bis, I254). Une série de travail dont les reps SAISIES + la réserve notée atteignent les reps visées + la réserve visée AFFICHÉE (plancher
// de barre compris) a fait ce qui était prévu : aucune garde « sans marge ». Exclusions : après un zéro, population protégée, reprise longue.
// Les cas sont ceux de TT-CAPACITE-BARRES §2 (Franc, la fois suivante) : 4 séances d'habitude puis la séance jouée.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const P = require('../../v2/js/plan.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
let n = 0;
const brute = (kg, reps, res, slug) => ({ id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: res || null, type_serie: 'travail', exercise_slug: slug });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const HAB = ['08-16', '08-23', '08-30', '09-06'];
const JOUEES = ['09-13', '09-20', '09-27'];
const AVANT = ['09-20', '09-27', '10-04'];
// 4 séances d'habitude (3 × kg × hab), puis les séances jouées : [kg, reps des deux premières, reps de la dernière, ressenti de la dernière, kg de la dernière ?]
function histoire(slug, kg, hab, jouees, debut) {
  const g = (debut || HAB).map((x, i) => ({ seance: { id: 'H' + i, debut: jour(x) }, series: [0, 1, 2].map(() => brute(kg, hab, null, slug)) }));
  jouees.forEach((s, i) => g.push({ seance: { id: 'J' + i, debut: jour(JOUEES[i]) },
    series: [brute(s[0], s[1], null, slug), brute(s[0], s[1], null, slug), brute(s[4] || s[0], s[2], s[3], slug)] }));
  return g;
}
const SLUG = { squat: 'squat_barre', souleve: 'souleve_de_terre_barre', couche: 'developpe_couche_barre', curl: 'curl_machine' };
const FAM = { squat: 'squat_barre', souleve: 'souleve_de_terre_barre', couche: 'developpe_couche_barre', curl: null };
function consigne(b, kg, hab, jouees, o) {
  const x = o || {};
  const groupes = x.groupes || histoire(SLUG[b], kg, hab, jouees, x.debut);
  return M.consigneDExercice(groupes, undefined, x.avant || jour(AVANT[jouees.length - 1]),
    Object.assign({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', edition: false, reglage: 'franc', famille: FAM[b] }, x.options || {})).consigne;
}
const etat = (k) => k.etat + ' ' + (k.ligne ? k.ligne.charge + '×' + k.ligne.vise : '-') + (k.haut && k.haut.charge != null ? ' test ' + k.haut.charge + '×' + k.haut.vise : '');
const garde = (k) => !!(k.fondement && k.fondement.effortVise && k.fondement.effortVise.effet === 'garde');

describe('I252 — le prédicat (une seule notion)', () => {
  test('reps saisies + réserve ≥ reps visées + visée affichée ; exclusions nommées', () => {
    expect(M.capaciteTenue({ reps: 6, reserve: 0, vise: 5, visee: 1 })).toBe(true);
    expect(M.capaciteTenue({ reps: 5, reserve: 0, vise: 5, visee: 1 })).toBe(false);
    expect(M.capaciteTenue({ reps: 6, reserve: 0, vise: 5, visee: 2 })).toBe(false);
    expect(M.capaciteTenue({ reps: 6, reserve: 1, vise: 5, visee: 2 })).toBe(true);
    ['apresZero', 'protegee', 'repriseLongue'].forEach((cle) => expect(M.capaciteTenue({ reps: 9, reserve: 0, vise: 5, visee: 1, [cle]: true })).toBe(false));
    expect(M.capaciteTenue({ reps: 9, reserve: null, vise: 5, visee: 1 })).toBe(false);
  });
  test('C2 bis — `aFondSurLaCible` en est le cas « garde 0 » (reps visées = le bas de la zone)', () => {
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 0, reps: 8, bas: 8 })).toBe(true);
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 0, reps: 7, bas: 8 })).toBe(false);
    expect(M.aFondSurLaCible({ gardeAffichee: 1, reserve: 0, reps: 9, bas: 8 })).toBe(false);
  });
});

describe('I252 — les cas de TT-CAPACITE-BARRES (Franc, la fois suivante)', () => {
  test('squat Lourd, visée 5 garde 1 : 100 × 6 sans marge → test 102,5 (main : garde)', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 6, 'reste_0']]);
    expect(etat(k)).toBe('test_propose 100×5 test 102.5×3');
    expect(garde(k)).toBe(false);
    expect(k.fondement.capacite).toEqual({ charge: 100, reps: 6, reserve: 0, vise: 5, visee: 1, barre: 1 });
  });
  test('squat : 100 × 5 sans marge → garde (capacité non tenue)', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 5, 'reste_0']]);
    expect(k.etat).toBe('progression');
    expect(garde(k)).toBe(true);
    expect(k.fondement.capacite).toBeUndefined();
  });
  test('squat : 100 × 7 sans marge → test', () => {
    expect(consigne('squat', 100, 4, [[100, 5, 7, 'reste_0']]).etat).toBe('test_propose');
  });
  test('témoins : squat 100 × 5 / 100 × 6 avec 1 → test, sans fait de capacité', () => {
    [5, 6].forEach((r) => { const k = consigne('squat', 100, 4, [[100, 5, r, 'reste_1']]); expect(k.etat).toBe('test_propose'); expect(k.fondement.capacite).toBeUndefined(); });
  });
  test('soulevé Lourd, visée 5 garde 2 : 180 × 6 sans marge → garde (6 < 5 + 2) ; 180 × 7 sans marge → test 182,5', () => {
    const k6 = consigne('souleve', 180, 4, [[180, 5, 6, 'reste_0']]);
    expect(garde(k6)).toBe(true);
    const k7 = consigne('souleve', 180, 4, [[180, 5, 7, 'reste_0']]);
    expect(etat(k7)).toBe('test_propose 180×5 test 182.5×3');
    expect(k7.fondement.capacite).toMatchObject({ reps: 7, reserve: 0, vise: 5, visee: 2, barre: 2 });
  });
  test('couché Hypertrophie, visée 10 garde 1 : 80 × 11 sans marge → test 82,5 ; 80 × 10 sans marge → garde', () => {
    const k = consigne('couche', 80, 9, [[80, 10, 11, 'reste_0']]);
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBe(82.5);
    expect(garde(consigne('couche', 80, 9, [[80, 10, 10, 'reste_0']]))).toBe(true);
  });
  test('curl machine témoin, 30 × 11 sans marge : test, inchangé (visée 0, R = V)', () => {
    const k = consigne('curl', 30, 9, [[30, 10, 11, 'reste_0']], { options: { equipement: 'machine' } });
    expect(k.etat).toBe('test_propose');
    expect(k.fondement.capacite).toBeUndefined();
  });
});

describe('I252 bis — la capacité lit les reps SAISIES (le calcul prudent 68B ne rétablit pas la garde)', () => {
  test('100 × 6 sans marge : 68B compte 5, la capacité compte 6 : le plafond §17.4 rend le test du calcul prudent', () => {
    expect(M.consigneDExercice).toBeDefined();
    const k = consigne('squat', 100, 4, [[100, 5, 6, 'reste_0']]);
    expect(k.etat).toBe('test_propose');
    // la ligne garde 100 kg et dit « sans marge » au fondement (un fait), jamais comme cause devant la ligne qui monte (I162)
    const p = sp(M.pourquoiConsigne(k, 'franc').etat || '');
    expect(p).not.toMatch(/sans marge/);
  });
});

describe('I252 — exclusions : la garde reste', () => {
  test('population protégée (I160) : 100 × 7 sans marge → garde', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 7, 'reste_0']], { options: { protegee: true } });
    expect(k.etat).toBe('progression');
    expect(garde(k)).toBe(true);
  });
  test('reprise longue (I206) : la séance jouée après 13 semaines d’arrêt, 100 × 7 sans marge → garde, marquée `horsCapacite`', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 7, 'reste_0']], { debut: ['05-17', '05-24', '05-31', '06-07'] });
    expect(garde(k)).toBe(true);
    expect(k.fondement.effortVise.horsCapacite).toBe('reprise_longue');
  });
  test('après un zéro : la séance jouée pendant le plafond ne tient pas sa capacité', () => {
    const g = histoire('squat_barre', 100, 4, []);
    g.push({ seance: { id: 'Z', debut: jour('09-10') }, series: [brute(100, 5, null, 'squat_barre'), brute(100, 5, null, 'squat_barre'), brute(102.5, 0, null, 'squat_barre')] });
    g.push({ seance: { id: 'J0', debut: jour('09-13') }, series: [brute(100, 5, null, 'squat_barre'), brute(100, 5, null, 'squat_barre'), brute(100, 7, 'reste_0', 'squat_barre')] });
    const k = consigne('squat', 100, 4, [[0]], { groupes: g, avant: jour('09-20') });
    expect(k.etat === 'test_propose' && k.haut && k.haut.charge >= 102.5).toBe(false);
    expect(k.fondement.capacite).toBeUndefined();
    expect(garde(k)).toBe(true);
    expect(k.fondement.effortVise.horsCapacite).toBe('apres_zero');
  });
});

describe('I252 — deux séances (témoin) : le test vérifie lui-même la preuve', () => {
  test('squat 100 × 6 sans marge, puis le test 102,5 × 4 sans marge : « Le bas de ta zone : il tient », le test reste sur la dernière série', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 6, 'reste_0'], [100, 5, 4, 'reste_0', 102.5]]);
    expect(etat(k)).toBe('garde 100×5 test 102.5×4');
    expect(sp(M.pourquoiConsigne(k, 'franc').etat)).toMatch(/Le bas de ta zone : il tient/);
  });
});

describe('I254 — la ligne de fait en fin d’exercice', () => {
  const cap = (o) => sp(M.annonceDe('effort', { ev: null, capacite: Object.assign({ charge: 100, reps: 7, reserve: 0, vise: 5, visee: 1 }, o), moment: 'apres' }));
  test('« 100 kg × 7, sans marge : 2 de plus que prévu. Sur cette barre, je vise 1 en réserve. »', () => {
    expect(cap({ barre: 1 })).toBe('100 kg × 7, sans marge : 2 de plus que prévu. Sur cette barre, je vise 1 en réserve.');
    expect(cap({ charge: 180, barre: 2, visee: 2 })).toBe('180 kg × 7, sans marge : 2 de plus que prévu. Sur cette barre, je vise 2 en réserve.');
  });
  test('hors barre, ou réserve notée au plancher : pas de seconde phrase ; jamais « je garde », jamais en séance', () => {
    expect(cap({})).toBe('100 kg × 7, sans marge : 2 de plus que prévu.');
    expect(cap({ charge: 180, reserve: 2, visee: 3, barre: 2 })).toBe('180 kg × 7, avec 2 en réserve : 2 de plus que prévu.');
    expect(cap({ barre: 1 })).not.toMatch(/je garde/i);
    expect(M.annonceDe('effort', { ev: null, capacite: { charge: 100, reps: 7, reserve: 0, vise: 5, visee: 1 }, moment: 'aujourdhui' })).toBeNull();
  });
  test('I252 relit une garde contre les entrées : une garde sur une capacité tenue est refusée', () => {
    const k = consigne('squat', 100, 4, [[100, 5, 5, 'reste_0']]);
    const faux = JSON.parse(JSON.stringify(k));
    faux.fondement.effortVise.reps = 7;
    const erreurs = [];
    P.verifierCapacite({ reglage: 'franc', protegee: false, exercices: [{ slug: 'squat_barre', consigne: faux }] }, {}, erreurs);
    expect(erreurs.join(' ')).toMatch(/I252/);
    const ok = [];
    P.verifierCapacite({ reglage: 'franc', protegee: false, exercices: [{ slug: 'squat_barre', consigne: k }] }, {}, ok);
    expect(ok).toEqual([]);
    const exclu = JSON.parse(JSON.stringify(faux)); exclu.fondement.effortVise.horsCapacite = 'reprise_longue';
    const e2 = []; P.verifierCapacite({ reglage: 'franc', protegee: false, exercices: [{ slug: 'squat_barre', consigne: exclu }] }, {}, e2);
    expect(e2).toEqual([]);
  });
});
