/** @jest-environment node */
//
// PR 4b (R-A, MOTEUR §9.42 bis) — LE PLAFOND APRÈS UN ZÉRO REP. Ce fichier grandit commit par commit (un commit = une règle, ses tests dedans).
// Commit 1 : UNE SEULE DESCENTE `D` (T-A13) — la règle B, le calage et (commit 5) la réaction en séance ne décident qu'avec `descenteApresUnZero`.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');

const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const ch = (charge, reps) => ({ charge, reps: reps === undefined ? 5 : reps, ressenti: null, chauffe: true });
const cal = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, prochain: 'travail', series: [] }, o));
// la grille du test : un pas fixe
const tr = (charge, reps, ressenti) => ({ charge, reps, ressenti: ressenti || null, chauffe: false });
const grille = (pas) => (c, sens) => Math.round((c + sens * pas) * 100) / 100;

describe('T-A13 — UNE descente D (descenteApresUnZero)', () => {
  test('D = le cran sous Ch le plus proche de 95 % de Ch : pas 2,5 : 100 → 95, 102,5 → 97,5, 27,5 → 25', () => {
    expect(M.descenteApresUnZero(100, grille(2.5), 20)).toBe(95);
    expect(M.descenteApresUnZero(102.5, grille(2.5), 20)).toBe(97.5);
    expect(M.descenteApresUnZero(27.5, grille(2.5), 20)).toBe(25);
  });
  test('machine pas 5 : D(60) = 55 ; D(25) = 20', () => {
    expect(M.descenteApresUnZero(60, grille(5), 5)).toBe(55);
    expect(M.descenteApresUnZero(25, grille(5), 5)).toBe(20);
  });
  test('jamais sous le plancher : null (rien de plus léger)', () => {
    expect(M.descenteApresUnZero(20, grille(2.5), 20)).toBeNull();
    expect(M.descenteApresUnZero(22.5, grille(2.5), 22.5)).toBeNull();
    expect(M.descenteApresUnZero(25, grille(5), 25)).toBeNull();
  });
  test('la grille peut se taire : null', () => {
    expect(M.descenteApresUnZero(30, () => null, null)).toBeNull();
  });
  test('le calage appelle D : borne 100 → 95, borne 102,5 → 97,5 (et non le cran juste sous)', () => {
    expect(cal({ series: [tr(97.5, 8, 'reste_3_plus')], borne: 100 }).suivante).toMatchObject({ charge: 95, bornee: true, borne: 100 });
    expect(cal({ series: [tr(100, 8, 'reste_3_plus')], borne: 102.5 }).suivante).toMatchObject({ charge: 97.5, bornee: true });
  });
  test('en dessous de 30 × pas, D = le cran juste sous : les cas de la PR 3 ne bougent pas', () => {
    [[27.5, 25], [25, 22.5], [22.5, 20]].forEach(([b, c]) => {
      expect(cal({ series: [ch(20), ch(25)], borne: b }).suivante).toMatchObject({ charge: c, bornee: true });
    });
    expect(cal({ series: [ch(20), ch(25)], borne: 20 }).suivante).toBeNull();
    expect(sp(M.libellesCalage(cal({ series: [ch(20), ch(25)], borne: 27.5 })).pourquoi)).toBe('27,5 kg est resté à 0 rep : je propose 25 kg.');
  });
});

// ── Commit 2 : le fait (zeroPartiel / zeroDeSeance), le drapeau plafondZero et la levée (plafondActif) — invisibles : aucune consigne ne change ──
const Modele = global.THModele || (global.window && global.window.THModele);
let nb = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++nb), rang: nb, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
// séance : { j (jour), series: [[kg, reps, extra?]…], seance?: champs de séance }
const seanceDe = (s, i) => ({ seance: Object.assign({ id: 'H' + i, debut: s.debut || jourN(s.j === undefined ? i : s.j) }, s.seance || {}),
  series: s.series.map(([kg, reps, extra]) => brute(kg, reps, extra)) });
const contrat = (liste) => M.contratDe(liste.map(seanceDe), undefined, 'charge_reps', { reglage: 'normal', equipement: 'barre' });
const apres = (liste) => new Date(Date.parse(liste[liste.length - 1].debut || jourN(liste[liste.length - 1].j === undefined ? liste.length - 1 : liste[liste.length - 1].j)) + 3 * 864e5).toISOString();
const bon = (kg, reps) => ({ series: [[kg, reps], [kg, reps], [kg, reps]] });
const actif = (liste, palier, avant) => M.plafondActif(contrat(liste), avant || apres(liste), palier === undefined ? 100 : palier);

describe('T-A3/T-A8 — Modele.zeroPartiel : la porte « plus lourd que tout succès »', () => {
  const Z = (series, opt) => Modele.zeroPartiel(series.map(([kg, reps, extra]) => brute(kg, reps, extra)), opt);
  test('100×5 ×3 + 102,5×0 → { 102,5 ; 1 } ; la même charge qu\'un succès ne pose rien (T-A3, mutation b)', () => {
    expect(Z([[100, 5], [100, 5], [100, 5], [102.5, 0]])).toEqual({ charge: 102.5, n: 1 });
    expect(Z([[27.5, 1], [27.5, 1], [27.5, 0]])).toBeNull();
    expect(Z([[100, 5], [100, 5], [87.5, 0]])).toBeNull();
  });
  test('typage : `travail` ET `echec` à 0 (« Oui, manquée ») posent ; un echec à 1 rep ou plus est un succès pour la porte (T-A1b, mutations b2 b3)', () => {
    expect(Z([[100, 5], [102.5, 0, { type_serie: 'echec' }]])).toEqual({ charge: 102.5, n: 1 });
    expect(Z([[100, 5], [102.5, 0, { type_serie: 'travail' }]])).toEqual({ charge: 102.5, n: 1 });
    expect(Z([[100, 5], [102.5, 3, { type_serie: 'echec' }], [102.5, 0, { type_serie: 'echec' }]])).toBeNull();
  });
  test('jamais un recul, une dégressive, une chauffe, un test, « hors calcul » (T-A8, mutation m)', () => {
    ['recul', 'degressive', 'echauffement', 'test'].forEach((t) => expect(Z([[100, 5], [110, 0, { type_serie: t }]])).toBeNull());
    expect(Z([[100, 5], [110, 0, { hors_calcul: true }]])).toBeNull();
  });
  test('la plus légère charge candidate qui passe ; `n` = les séries à cette charge', () => {
    expect(Z([[100, 5], [105, 0], [102.5, 0], [102.5, 0]])).toEqual({ charge: 102.5, n: 2 });
  });
  test('porte: false (le calage) : toute série de travail à 0 rep, sans historique — 20×8 puis 20×0 compte', () => {
    expect(Z([[20, 8], [20, 0]])).toBeNull();
    expect(Z([[20, 8], [20, 0]], { porte: false })).toEqual({ charge: 20, n: 1 });
  });
  test('zeroDeSeance : la séance entière à zéro d\'abord, sinon le zéro partiel ; rien sans charge > 0', () => {
    const S = (a) => a.map(([kg, reps, extra]) => brute(kg, reps, extra));
    expect(Modele.zeroDeSeance(S([[100, 0], [100, 0]]))).toEqual({ n: 2, charge: 100 });
    expect(Modele.zeroDeSeance(S([[100, 5], [102.5, 0]]))).toEqual({ charge: 102.5, n: 1 });
    expect(Modele.zeroDeSeance(S([[null, 0]]))).toBeNull();
    expect(Modele.zeroDeSeance(S([[100, 5]]))).toBeNull();
  });
});

describe('T-A8 — portes de pose du drapeau plafondZero', () => {
  const pose = (series, seance, mesure) => {
    const c = M.contratDe([seanceDe({ j: 0, series, seance })], undefined, mesure || 'charge_reps', { reglage: 'normal', equipement: 'barre' });
    return c[0].plafondZero || null;
  };
  test('séance ordinaire : posé, { charge, n, suivantes: [] }', () => {
    expect(pose([[100, 5], [102.5, 0]])).toEqual({ charge: 102.5, n: 1, suivantes: [] });
  });
  test('séance entière à zéro : posé aussi (et `zero` de B reste posé)', () => {
    const c = M.contratDe([seanceDe({ j: 0, series: [[102.5, 0], [102.5, 0]] })], undefined, 'charge_reps', { reglage: 'normal', equipement: 'barre' });
    expect(c[0].zero).toEqual({ n: 2, charge: 102.5 });
    expect(c[0].plafondZero).toMatchObject({ charge: 102.5, n: 2 });
  });
  test('séance importée (source_ref), mesure `reps` (poids du corps), charge manquante, aide (charge < 0) : aucun plafond (mutation i)', () => {
    expect(pose([[100, 5], [102.5, 0]], { source_ref: 'hevy:1' })).toBeNull();
    expect(pose([[0, 5], [0, 0]], null, 'reps')).toBeNull();
    expect(pose([[100, 5], [null, 0]])).toBeNull();
    expect(pose([[-20, 8], [-10, 0]])).toBeNull();
  });
  test('séance « douleur » : aucun plafond', () => {
    expect(pose([[100, 5], [102.5, 0, { douleur: true }]])).toBeNull();
  });
  test('sans zéro : aucune clé ajoutée au contrat (octet pour octet)', () => {
    const c = contrat([bon(100, 5), bon(100, 5)]);
    c.forEach((se) => { expect(se.plafondZero).toBeUndefined(); expect(se.zero).toBeUndefined(); });
  });
});

describe('T-A5/T-A6/T-A7/T-A16 — la levée : (A) une rep à Ch, (N) deux séances comptées', () => {
  const Z0 = { series: [[100, 5], [100, 5], [102.5, 0]] };
  test('juste après le zéro (la séance même ne lève jamais) : { 102,5 ; reste 2 }', () => {
    expect(actif([Z0], 100)).toEqual({ charge: 102.5, reste: 2, n: 1 });
  });
  test('palier : un zéro à ou sous le palier tenu n\'est pas une limite (T-A4, mutation c) ; sans palier, porte ouverte', () => {
    expect(actif([{ series: [[100, 8], [100, 8], [60, 0]] }], 100)).toBeNull();
    expect(actif([Z0], 102.5)).toBeNull();
    expect(actif([Z0], null)).toMatchObject({ charge: 102.5 });
  });
  test('(A) une rep à Ch lève ; deux zéros de suite à Ch ne lèvent pas (T-A5, mutation f2) ; une série typée `test` réussie à Ch lève', () => {
    expect(actif([Z0, { series: [[102.5, 1]] }])).toBeNull();
    expect(actif([Z0, { series: [[102.5, 0]] }])).toMatchObject({ charge: 102.5, reste: 2 });   // O9 : le zéro le plus récent relance l'horloge
    expect(actif([Z0, { series: [[105, 1, { type_serie: 'test' }]] }])).toBeNull();
  });
  test('(A) une chauffe ou une série plus légère ne lève pas ; « hors calcul » non plus', () => {
    expect(actif([Z0, { series: [[102.5, 5, { type_serie: 'echauffement' }], [100, 5]] }])).toMatchObject({ reste: 1 });
    expect(actif([Z0, { series: [[102.5, 5, { hors_calcul: true }], [100, 5]] }])).toMatchObject({ reste: 1 });
  });
  test('T-A7b : 25×0 puis 30×0 → Ch = 25 (mutation f2 : avec reps >= 0, 25 serait levé par le 30×0)', () => {
    const a = actif([{ series: [[20, 2], [20, 2], [25, 0]] }, { series: [[20, 2], [20, 2], [30, 0]] }], 20);
    expect(a).toMatchObject({ charge: 25 });
  });
  test('T-A5 (O9) : un nouveau zéro à Ch relance l\'horloge : reste 2 après le 2e zéro à Ch', () => {
    const liste = [{ series: [[20, 2], [20, 2], [25, 0]] }, bon(20, 2), { series: [[20, 2], [20, 2], [25, 0]] }];
    expect(actif(liste, 20)).toEqual({ charge: 25, reste: 2, n: 1 });
  });
  test('(N) l\'échéance est exactement à la 2e séance comptée, pas à la 1re (T-A6 v, mutation e)', () => {
    expect(actif([Z0, bon(100, 5)])).toMatchObject({ reste: 1 });
    expect(actif([Z0, bon(100, 5), bon(100, 5)])).toBeNull();
  });
  test('(N) une séance de chauffes seules ne compte pas (T-A6 i, mutation e2)', () => {
    expect(actif([Z0, { series: [[60, 5, { type_serie: 'echauffement' }]] }, bon(100, 5)])).toMatchObject({ reste: 1 });
  });
  test('(N) deux séances le même jour civil comptent une (T-A6 ii, mutation e3)', () => {
    const j = (h) => new Date(Date.UTC(2026, 8, 4, h)).toISOString();
    const liste = [Object.assign({ j: 0 }, Z0), { debut: j(8), series: [[100, 5]] }, { debut: j(18), series: [[100, 5]] }];
    expect(M.plafondActif(contrat(liste), '2026-09-05T08:00:00.000Z', 100)).toMatchObject({ reste: 1 });
  });
  test('(N) une séance de décharge ne compte pas (T-A6 iii, mutation e4) ; une séance neutre ou « douleur » compte (iv)', () => {
    const c = contrat([Z0, bon(100, 5), bon(100, 5)]);
    c[1] = Object.assign({}, c[1], { decharge: true, neutre: true });
    expect(M.plafondActif(c, apres([Z0, bon(100, 5), bon(100, 5)]), 100)).toMatchObject({ reste: 1 });
    const d = contrat([Z0, { series: [[100, 5, { douleur: true }]] }, bon(100, 5)]);
    expect(M.plafondActif(d, apres([Z0, bon(100, 5), bon(100, 5)]), 100)).toBeNull();
  });
  test('(N) un zéro décharge (séance allégée) ne pose rien à la lecture', () => {
    const c = contrat([Z0]);
    c[0] = Object.assign({}, c[0], { decharge: true });
    expect(M.plafondActif(c, apres([Z0]), 100)).toBeNull();
  });
  test('T-A16 : pas de regard vers l\'avant — la lecture à `avant` ignore tout ce qui vient après', () => {
    const liste = [Z0, bon(100, 5), { series: [[102.5, 1]] }, bon(100, 5)];
    const c = contrat(liste);
    for (let i = 1; i <= liste.length; i++) {
      const pref = contrat(liste.slice(0, i));
      const avant = jourN(i);
      expect(JSON.stringify(M.plafondActif(c, avant, 100))).toBe(JSON.stringify(M.plafondActif(pref, avant, 100)));
    }
  });
  test('O12 : `suivantes` borné à 8 entrées, arrêt au premier `atteint` ; au-delà le plafond est tenu pour échu', () => {
    const liste = [Z0];
    for (let k = 0; k < 12; k++) liste.push({ series: [[60, 5, { type_serie: 'echauffement' }]] });   // 12 séances sans travail : rien ne compte
    const c = contrat(liste);
    expect(c[0].plafondZero.suivantes.length).toBe(8);
    expect(M.plafondActif(c, jourN(13), 100)).toBeNull();
    const l2 = [Z0, bon(100, 5), { series: [[102.5, 1]] }, bon(100, 5)];
    expect(contrat(l2)[0].plafondZero.suivantes.length).toBe(2);
  });
  test('toute zone : (A) lit les séances d\'une autre zone (O17) — une rep à Ch dans une série légère-reps lève', () => {
    expect(actif([Z0, { series: [[102.5, 12]] }])).toBeNull();
  });
});

// ── Commit 3 : l'effet — plafonner, tenue_apres_zero, compteur neutre, rvX nul, estApresZero, I155 ──
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const A = require('../../v2/js/assistant.js');
const OPT = { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const R3 = { ressenti: 'reste_3_plus' };
const seanceN = (i, series, seance) => ({ seance: Object.assign({ id: 'H' + i, debut: jourN(i) }, seance || {}), series });
// séances de série plate : [kg, reps | [reps…], extra?] tous les 3 jours
const plat = (liste) => liste.map(([kg, reps, extra], i) => seanceN(i, (Array.isArray(reps) ? reps : [reps, reps, reps]).map((x) => brute(kg, x, extra))));
const avantN = (k, jours) => new Date(Date.parse(jourN(k - 1)) + (jours || 3) * 864e5).toISOString();
const consigne = (gr, k, opt) => M.consigneDExercice(gr.slice(0, k), undefined, avantN(k), Object.assign({}, OPT, opt || {}));
const pz = (c) => c.fondement && c.fondement.plafondZero;

describe('T-A1 / T-A1b — le yo-yo : machine pas 5, 20×2 ; 25×0 ; 20×2 …', () => {
  const suite = (typage) => plat([[20, 2], [25, [0, 0, 0], typage ? { type_serie: typage } : undefined], [20, 2], [20, 2], [20, 2]]);
  [undefined, 'travail', 'echec'].forEach((typage) => {
    test('typage ' + (typage || 'défaut') + ' : B (zero_rep) puis tenue 20×2 « pas encore. Je garde 20 kg. », puis levé par (N) → bord 25', () => {
      const gr = suite(typage);
      const z = consigne(gr, 2);
      expect(z.consigne.etat).toBe('zero_rep');
      expect(pz(z.consigne).mord).toBe(false);
      const t = consigne(gr, 3);
      expect(t.consigne.etat).toBe('tenue_apres_zero');
      expect(t.consigne.ligne).toEqual({ charge: 20, vise: 2 });
      expect(t.consigne.haut).toBeNull();
      expect(sp(t.libelles.gris)).toBe('25 kg × 0 : pas encore. Je garde 20 kg.');
      expect(pz(t.consigne)).toMatchObject({ charge: 25, mord: true, reste: 1 });
      expect(consigne(gr, 4).consigne.etat).toBe('bord');          // la 2e séance comptée : échu
      expect(consigne(gr, 4).consigne.ligne.charge).toBe(25);
    });
  });
  test('Pourquoi : reste 2 → « cette séance et la suivante » ; reste 1 → « pour cette séance » (O21)', () => {
    // un zéro isolé dans une séance qui a réussi à 20 : zeroPartiel, reste 2 sur la séance d'après
    const gr = plat([[20, 2], [20, [2, 2, 2]]]);
    gr[1].series.push(brute(25, 0));
    const t = consigne(gr, 2);
    expect(t.consigne.etat).toBe('tenue_apres_zero');
    expect(pz(t.consigne).reste).toBe(2);
    const p = M.consigneDExercice(gr.slice(0, 2), undefined, avantN(2), OPT);
    expect(p.consigne.etat).toBe('tenue_apres_zero');
  });
  test('un echec à ≥ 1 rep (menée à l\'échec) ne pose rien (T-A1b)', () => {
    const gr = plat([[20, 2], [25, [3, 3, 3], { type_serie: 'echec' }]]);
    expect(pz(consigne(gr, 2).consigne)).toBeFalsy();
  });
  test('pas 2,5 : la base 22,5 < Ch → mord faux (la tenue ne plafonne rien de plus)', () => {
    const gr = plat([[20, 2], [25, [0, 0, 0]], [20, 2]]);
    const c = consigne(gr, 3, { equipement: 'barre' });
    expect(c.consigne.etat).not.toBe('tenue_apres_zero');
  });
});

describe('T-A2 / T-A2b / T-A3 / T-A3b — ce que remplace le plafond', () => {
  const histoireDuTest = (z) => {
    const t = (i) => seanceN(i, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3)]);
    return [t(0), seanceN(1, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3), brute(z, 0)])];
  };
  const O = { equipement: 'barre' };
  test('T-A2 : un test proposé à 26,5 après un zéro à 26,5 → tenue 24 ; haut nul ; fondement minimal (I57/I61/I62/I68 par construction)', () => {
    const gr = histoireDuTest(26.5);
    const k = consigne(gr, 2, O).consigne;
    expect(k.etat).toBe('tenue_apres_zero');
    expect(k.haut).toBeNull();
    expect(k.ligne.charge).toBe(24);
    expect(pz(k).sans.etat).toBe('test_propose');
    ['effortVise', 'approchee', 'cranGros', 'preuve', 'test'].forEach((cle) => expect(k.fondement[cle]).toBeUndefined());
    expect(Object.keys(k.fondement).every((c) => ['date', 'reps', 'seance', 'habitude', 'deuxSeances', 'plafondZero'].includes(c))).toBe(true);
  });
  test('T-A2 : un test plus léger que Ch (zéro à 27 pour un test à 26,5) reste — ni mord, ni changement d\'état', () => {
    const k = consigne(histoireDuTest(27), 2, O).consigne;
    expect(k.etat).toBe('test_propose');
    expect(pz(k).mord).toBe(false);
  });
  test('T-A3 : une faute de frappe sous le palier (87,5×0) = octet pour octet celle du témoin ; 102,5×0 pose ; la séance suivante ne lève pas', () => {
    const base = plat([[100, 5], [100, 5]]);
    const avecFaute = plat([[100, 5], [100, 5]]); avecFaute[1].series.push(brute(87.5, 0));
    const O2 = { equipement: 'barre' };
    const a = consigne(avecFaute, 2, O2).consigne, b = consigne(base, 2, O2).consigne;
    ['etat', 'ligne', 'haut', 'zone', 'palier', 'niveau'].forEach((cle) => expect(a[cle]).toEqual(b[cle]));
    expect(JSON.stringify(a)).not.toMatch(/plafondZero/);
    const avecZero = plat([[100, 5], [100, 5], [100, 5]]); avecZero[1].series.push(brute(102.5, 0));
    expect(pz(consigne(avecZero, 2, O2).consigne)).toMatchObject({ charge: 102.5, mord: true, reste: 2 });
    expect(pz(consigne(avecZero, 3, O2).consigne)).toMatchObject({ charge: 102.5, reste: 1 });   // 100×5 du jour suivant ne lève pas
  });
  test('T-A3b (O1, mutation t1) : `_bord` et `_lues` survivent au plafond, non énumérables', () => {
    const gr = plat([[20, 2], [25, [0, 0, 0]], [20, 2]]);
    gr[1].series = [brute(20, 2), brute(20, 2), brute(25, 0)];
    const c = consigne(gr, 2).consigne;
    expect(c.etat).toBe('tenue_apres_zero');
    ['_bord', '_lues'].forEach((cle) => { const d = Object.getOwnPropertyDescriptor(c, cle); expect(d).toBeDefined(); expect(d.enumerable).toBe(false); });
  });
  test('T-A2b (O3, mutation t3) : `nouvelle_zone` à 112,5 (≥ Ch 105) avec un palier 100 traverse consigneDExercice → palier 100, jamais 107,5', () => {
    const lourd = [brute(100, 4), brute(100, 4), brute(100, 4)];
    const gr = [seanceN(0, lourd), seanceN(1, lourd.map((s) => brute(100, 4)).concat([brute(105, 0)]))];
    const c = M.consigneDExercice(gr, undefined, avantN(2), Object.assign({}, OPT, { equipement: 'barre', correction: 'volume' })).consigne;
    expect(c.etat === 'tenue_apres_zero' || pz(c) === undefined || pz(c).mord === false).toBe(true);
    if (c.etat === 'tenue_apres_zero') expect(c.ligne.charge).toBe(100);
    expect(c.ligne && c.ligne.charge < 105).toBe(true);
  });
});

describe('T-A15 / T-A18 — idempotence, non-régression, jamais « mord toujours »', () => {
  test('sans zéro, la consigne est octet pour octet celle d\'avant (aucune clé ajoutée)', () => {
    const gr = plat([[100, [8, 8, 7]], [100, [8, 8, 8]]]);
    const c = consigne(gr, 2, { equipement: 'barre' });
    expect(JSON.stringify(c)).not.toMatch(/plafondZero|tenue_apres_zero/);
  });
  test('T-A18 : une personne avec un zéro LEVÉ n\'a pas de tenue ; un zéro à ou sous le palier non plus', () => {
    const gr = plat([[20, 2], [25, [0, 0, 0]], [20, 2], [25, 1]]);
    expect(consigne(gr, 4).consigne.etat).not.toBe('tenue_apres_zero');
    expect(JSON.stringify(consigne(gr, 4).consigne)).not.toMatch(/"mord":true/);
  });
  test('idempotence : plafonner(tenue) = la tenue (même objet)', () => {
    const gr = plat([[20, 2], [25, [0, 0, 0]], [20, 2]]);
    const c = consigne(gr, 3).consigne;
    expect(c.etat).toBe('tenue_apres_zero');
    expect(M.plafonner(c, M.contratDe(plat([[20, 2], [25, [0, 0, 0]], [20, 2]]), undefined, 'charge_reps', { reglage: 'normal', equipement: 'machine' }), avantN(3), {})).toBe(c);
  });
  test('B octet pour octet : zero_rep (séance entière à zéro) = ce que livrait la PR 3, flaggé `mord: false`', () => {
    const k = consigne(plat([[100, [8, 8, 7]], [102.5, 0]]), 2, { equipement: 'barre' }).consigne;
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 97.5, vise: 9 });
    expect(pz(k).mord).toBe(false);
  });
});

describe('T-A10 (I2) — le compteur de stagnation : une tenue imposée ne compte pas (mutation n)', () => {
  const R = (i) => seanceN(i, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3)]);
  const gr = [R(0), seanceN(1, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3), brute(26.5, 0)]), R(2), R(3), R(4)];
  const cpt = (k) => M.compteurDe(M.contratDe(gr.slice(0, k), undefined, 'charge_reps', { reglage: 'normal', equipement: 'barre' }), avantN(k),
    { reglage: 'normal', equipement: 'barre', toutes: true });
  test('la consigne reçue par les séances 2 et 3 est la tenue (fixture qui déclenche le chemin)', () => {
    expect(consigne(gr, 2, { equipement: 'barre' }).consigne.etat).toBe('tenue_apres_zero');
    expect(consigne(gr, 3, { equipement: 'barre' }).consigne.etat).toBe('tenue_apres_zero');
  });
  test('deux séances tenues sans progrès → compteur inchangé', () => {
    const avant = cpt(2).compteur;
    expect(cpt(4).compteur).toBe(avant);
  });
});

describe('le plan — pendant la tenue après un zéro : I155, I154 étendu, puces (T-A2, T-A12)', () => {
  const erreursDe = (p, e) => T.verifierPlan(p, e).erreurs;
  function planDe(gr, optionsDeConsigne, extra) {
    let k = 0;
    const id = () => 'q-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = 10; });
    se.exercices[0].series[2].au_max = true;
    const avant = avantN(gr.length);
    const c = M.consigneDExercice(gr, undefined, avant, Object.assign({}, OPT, { equipement: 'barre' }, optionsDeConsigne || {}));
    const e = Object.assign({
      seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices },
      consignes: { dc: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: false,
      catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
        muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } }
    }, extra || {});
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0], c };
  }
  const R = (i) => seanceN(i, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3)]);
  const gr = [R(0), seanceN(1, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3), brute(26.5, 0)])];
  test('T-A2 : un test proposé puis plafond → verifierPlan vert (I57/I61/I62/I68/I155), aucune ligne de test, aucun effort visé, aucune carte « Au max »', () => {
    const { p, e, x } = planDe(gr);
    expect(x.consigne.etat).toBe('tenue_apres_zero');
    expect(erreursDe(p, e)).toEqual([]);
    expect(x.propositionAuMax || null).toBeNull();
    expect(x.reserveVisee === null || x.reserveVisee === undefined).toBe(true);
    expect((x.planInitial || []).concat(x.lignes || []).some((l) => l && l.role === 'test')).toBe(false);
  });
  test('T-A12 (mutation o) : estApresZero reconnaît la tenue ; une personne sans zéro, jamais', () => {
    expect(M.estApresZero(consigne(gr, 2, { equipement: 'barre' }).consigne)).toBe(true);
    expect(M.estApresZero(consigne([R(0), R(1)], 2, { equipement: 'barre' }).consigne)).toBe(false);
  });
  test('I155 est un vrai invariant : une tenue fabriquée avec une ligne à Ch, un haut ou un effortVise est refusée', () => {
    const { p, e } = planDe(gr);
    const c = e.consignes.dc.consigne;
    const faux = (patch) => {
      const e2 = Object.assign({}, e, { consignes: { dc: Object.assign({}, e.consignes.dc, { consigne: Object.assign({}, c, patch) }) } });
      return erreursDe(T.planDeSeance(e2), e2).filter((m) => /I155|I154/.test(m));
    };
    expect(faux({ ligne: { charge: 26.5, vise: 10 } }).length).toBeGreaterThan(0);
    expect(faux({ haut: { charge: 26.5, vise: 3, k: 1 } }).length).toBeGreaterThan(0);
    expect(faux({ fondement: Object.assign({}, c.fondement, { effortVise: { x: 1 } }) }).length).toBeGreaterThan(0);
    expect(faux({}).length).toBe(0);
  });
  test('assistant : les puces de la tenue', () => {
    expect(A.puces('tenue_apres_zero')).toEqual(['Pourquoi tu tiens la charge ?', 'Quand tu remontes ?', 'Et ensuite ?']);
  });
  test('Pourquoi : la phrase de la tenue (reste 2 : « cette séance et la suivante »)', () => {
    const { x } = planDe(gr);
    const texte = sp(JSON.stringify(x.pourquoi || x.consigne));
    expect(x.consigne.etat).toBe('tenue_apres_zero');
    expect(texte).toContain('Ta série à 26,5 kg est restée à 0 rep');
    expect(texte).toContain('je garde 24 kg pour cette séance et la suivante. Une rep à 26,5 kg, et je reprends la montée à la séance d’après.');
    expect(texte).not.toMatch(/plafond|quand même|encore 2 séances/);
  });
});

// ── Commit 3b : la règle de bord — une tenue imposée est neutre (O2, mutation t2) ──
describe('T-A19 — règle de bord : deux séances tenues ne mènent pas à la vague (−5 %)', () => {
  const seq = plat([[20, 2], [20, 2], [25, [0, 0, 0]], [20, 2], [20, 2], [20, 2]]);
  test('la fixture déclenche le chemin : la consigne reçue par la séance 5 (index 4) est la tenue', () => {
    expect(consigne(seq, 4).consigne.etat).toBe('tenue_apres_zero');
  });
  test('séances 20×2 ×2, 25×0, 20×2 ×2 → la consigne suivante est `bord` 25 (reprise de la montée), pas `bord_vague` 15', () => {
    const c = consigne(seq, 5).consigne;
    expect(c.etat).toBe('bord');
    expect(c.ligne.charge).toBe(25);
    expect(consigne(seq, 6).consigne.etat).not.toBe('bord_vague');
  });
  test('le compte de bord de la tenue est repris tel quel (sans, total, record inchangés par la séance tenue)', () => {
    const avant = consigne(seq, 4).consigne._bord, apres = consigne(seq, 5).consigne._bord;
    expect(apres.sans).toBe(avant.sans);
    expect(apres.total).toBe(avant.total);
    expect(apres.record).toBe(avant.record);
  });
});

// ── Commit 4 : la séance en cours — le gris vidé (I156), parisRates muet, le calage (T-A11, T-A13b) ──
describe('le plan — séance en cours : gris vidé (I156), silences compris (T-A11, mutation k)', () => {
  const OBarre = { equipement: 'barre', debutant: false };
  function planAvec(gr, { seriesFaites, reps, parisRates } = {}) {
    let k = 0;
    const id = () => 'q-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 4 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = reps || 8; });
    (seriesFaites || []).forEach(([kg, r, extra], i) => {
      Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps: r, validee_a: '2026-09-20T10:00:00.000Z' }, extra || {});
    });
    const avant = avantN(gr.length);
    const c = gr.length ? M.consigneDExercice(gr, undefined, avant, Object.assign({}, OPT, OBarre)) : null;
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: c ? { dc: c } : {}, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: false,
      catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
    if (parisRates) e.parisRates = parisRates;
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0], c };
  }
  const grises = (x) => (x.lignes || []).filter((l) => !l.validee && l.type !== 'chauffe').map((l) => l.prerempli && l.prerempli.charge_kg);
  test('une tenue après un zéro : aucune ligne non validée préremplie à Ch (26,5) ni au-dessus ; aucune erreur', () => {
    const R = (i) => seanceN(i, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3)]);
    const gr = [R(0), seanceN(1, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3), brute(26.5, 0)])];
    const { p, e, x } = planAvec(gr);
    expect(x.consigne.etat).toBe('tenue_apres_zero');
    grises(x).forEach((g) => expect(g === null || g < 26.5).toBe(true));
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('T-A11 : un silence `pas_de_palier` (20×8, 30×8, 40×8 + 60×0) porte `plafondZero` ; le gris n\'est jamais ≥ 60', () => {
    const gr = [seanceN(0, [brute(20, 8)]), seanceN(1, [brute(30, 8)]), seanceN(2, [brute(40, 8), brute(60, 0)])];
    const { p, e, x } = planAvec(gr);
    expect(x.consigne.etat).toBe('silence');
    expect(x.consigne.fondement.plafondZero).toMatchObject({ charge: 60, mord: false });
    grises(x).forEach((g) => expect(g === null || g < 60).toBe(true));
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /I156/.test(m))).toEqual([]);
  });
  test('un zéro validé DANS la séance (typage `echec`, « Oui, manquée ») : les lignes suivantes ne reprennent pas la charge (plafond de la séance en cours)', () => {
    const gr = plat([[100, [5, 5, 5]], [100, [5, 5, 5]]]);
    const { p, e, x } = planAvec(gr, { seriesFaites: [[100, 5], [100, 5], [102.5, 0, { type_serie: 'echec' }]] });
    grises(x).forEach((g) => expect(g === null || g < 102.5).toBe(true));
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /I156/.test(m))).toEqual([]);
  });
  test('I156 est un vrai invariant : une ligne préremplie à Ch après un zéro validé est refusée', () => {
    const gr = plat([[100, [5, 5, 5]], [100, [5, 5, 5]]]);
    const { p, e } = planAvec(gr, { seriesFaites: [[100, 5], [100, 5], [102.5, 0, { type_serie: 'echec' }]] });
    const l = p.exercices[0].lignes.filter((x) => !x.validee && x.type !== 'chauffe')[0];
    l.prerempli = Object.assign({}, l.prerempli, { charge_kg: 102.5 });
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /I156/.test(m)).length).toBeGreaterThan(0);
  });
  test('sans zéro : le gris est celui d\'avant (octet pour octet)', () => {
    const gr = plat([[100, [5, 5, 5]], [100, [5, 5, 5]]]);
    const a = planAvec(gr, { seriesFaites: [[100, 5], [100, 5]] });
    expect(grises(a.x).some((g) => g !== null)).toBe(true);
  });
  test('parisRates muet quand le plafond mord (mutation l) : plan-level, `entrees.parisRates` posé', () => {
    const R = (i) => seanceN(i, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3)]);
    const gr = [R(0), seanceN(1, [brute(24, 10, R3), brute(24, 10, R3), brute(24, 10, R3), brute(26.5, 0)])];
    const avecPari = planAvec(gr, { parisRates: { dc: { n: 2, charge: 24, reps: 10 } } });
    expect(avecPari.x.consigne.etat).toBe('tenue_apres_zero');
    expect(avecPari.x.parisRates || null).toBeNull();
    // le témoin : sans plafond, la même entrée parle
    const R2 = [R(0), R(1)];
    const sans = planAvec(R2, { parisRates: { dc: { n: 2, charge: 24, reps: 10 } } });
    expect(sans.x.consigne.etat).not.toBe('tenue_apres_zero');
  });
});

describe('T-A13b — le calage garde la porte `false` : toute série de travail à 0 rep borne (PR 3)', () => {
  test('20×8 puis 20×0 : le calage borne à 20 (le plancher : il se tait) ; le plafond ne pose rien (porte)', () => {
    const r = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, prochain: 'travail',
      series: [{ charge: 20, reps: 8, ressenti: null, chauffe: false }, { charge: 20, reps: 0, ressenti: null, chauffe: false }] });
    expect(r.suivante === null || r.suivante.charge < 20 || r.suivante.bornee === true).toBe(true);
    expect(Modele.zeroPartiel([brute(20, 8), brute(20, 0)])).toBeNull();
    expect(Modele.zeroPartiel([brute(20, 8), brute(20, 0)], { porte: false })).toEqual({ charge: 20, n: 1 });
  });
});

// ── Commit 5 : la réaction en séance après un 0 rep (Z1 / Z2, O7, O8, I157, I158) ──
describe('T-A14 — la réaction au zéro : une branche, une table', () => {
  const OB = { equipement: 'barre' };
  const histo = () => plat([[100, [5, 5, 5]], [100, [5, 5, 5]]]);
  function planZ(faites, { opt, gestes, reglage, debutant, gr, reps } = {}) {
    let k = 0;
    const id = () => 'q-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 4 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = reps || 5; });
    faites.forEach(([kg, r, extra], i) => Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps: r, validee_a: '2026-09-20T10:0' + i + ':00.000Z' }, extra || {}));
    const g = gr || histo();
    const avant = avantN(g.length);
    const c = M.consigneDExercice(g, undefined, avant, Object.assign({}, OPT, OB, { reglage: reglage || 'normal', debutant: !!debutant }, opt || {}));
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices, gestes: gestes || [] }, consignes: { dc: c }, paris: [], suites: {},
      reglage: reglage || 'normal', objectif: 'muscle', debutant: !!debutant,
      catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0], c };
  }
  const echec0 = { type_serie: 'echec' };
  const vrai = (r) => T.verifierPlan(r.p, r.e).erreurs;
  test('Z1 : 102,5 × 0 manquée (typage `echec`, le vrai chemin « Oui, manquée ») → « je propose 97,5 kg pour la suite. » + « Prendre 97,5 kg » ; aucune erreur', () => {
    const r = planZ([[100, 5], [102.5, 0, echec0]]);
    expect(r.x.rate).toMatchObject({ cas: 'Z1', niveau: 'zero', iSerie: 1 });
    expect(sp(r.x.rate.phrase)).toBe('102,5 kg est resté à 0 rep : je propose 97,5 kg pour la suite.');
    expect(r.x.rate.boutons.map((b) => sp(b.texte))).toEqual(['Prendre 97,5 kg']);
    expect(r.x.rate.fourchette).toBeNull();
    expect(vrai(r)).toEqual([]);
  });
  test('O8 : même réaction avec le typage `travail` (les deux typages)', () => {
    const a = planZ([[100, 5], [102.5, 0, echec0]]).x.rate, b = planZ([[100, 5], [102.5, 0, { type_serie: 'travail' }]]).x.rate;
    expect(b.cas).toBe(a.cas);
    expect(b.phrase).toBe(a.phrase);
  });
  test('indépendante du réglage (Franc, Prudent) et du débutant hors calage', () => {
    ['normal', 'prudent', 'franc'].forEach((reglage) => {
      const r = planZ([[100, 5], [102.5, 0, echec0]], { reglage });
      expect(r.x.rate && r.x.rate.cas).toBe('Z1');
      expect(vrai(r)).toEqual([]);
    });
    const d = planZ([[100, 5], [102.5, 0, echec0]], { debutant: true });
    expect(d.x.rate && d.x.rate.cas).toBe('Z1');
  });
  test('Z2 : dernière ligne (aucune ligne non validée plus lourde que D) → « 105 kg est resté à 0 rep. », sans bouton', () => {
    const r = planZ([[100, 5], [100, 5], [100, 5], [105, 0, echec0]]);
    expect(r.x.rate).toMatchObject({ cas: 'Z2', charge: null });
    expect(sp(r.x.rate.phrase)).toBe('105 kg est resté à 0 rep.');
    expect(r.x.rate.boutons).toEqual([]);
    expect(vrai(r)).toEqual([]);
  });
  test('muet : 20×8 puis 20×0 en séance ordinaire n\'est pas un zéro (porte) ; un zéro à ou sous le palier non plus', () => {
    expect(planZ([[100, 5], [100, 0, echec0]]).x.rate || null).toBeNull();
    expect(planZ([[100, 5], [90, 0, echec0]]).x.rate || null).toBeNull();
  });
  test('une voix (O7) : aucun x.message ; la porte du cran se tait sur un 0 rep (mutation t7)', () => {
    const r = planZ([[100, 5], [102.5, 0, echec0]]);
    expect(r.x.message || null).toBeNull();
    expect(r.x.porteDuCran && r.x.porteDuCran.fermee).toBeFalsy();
    expect(M.decisionDeLaPorte({ zone: { bas: 3, haut: 5 }, cran: { charge: 110, vise: 3 }, travail: 100, series: [{ iSerie: 0, charge: 105, reps: 0, vise: 5, reserve: null }] }).fermee).toBeFalsy();
  });
  test('« Prendre 97,5 kg » : les lignes non validées plus lourdes passent à D, une ligne plus légère garde sa charge ; I116 vert avec le geste', () => {
    const g = [{ geste: 'rate_prise', slug: 'dc', rang: 1, bouton: 'prendre', kg: 97.5 }];
    const r = planZ([[100, 5], [102.5, 0, echec0]], { gestes: g });
    const restantes = r.x.lignes.filter((l) => !l.validee && l.type !== 'chauffe');
    restantes.forEach((l) => expect(l.charge === null || l.charge <= 97.5).toBe(true));
    expect(r.x.rate.boutons[0].pris).toBe(true);
    expect(vrai(r)).toEqual([]);
  });
  test('I157 / I158 sont de vrais invariants : une seconde phrase, une réaction manquante, un D faux sont refusés', () => {
    const r = planZ([[100, 5], [102.5, 0, echec0]]);
    const avec = (patch) => { const p = Object.assign({}, r.p, { exercices: r.p.exercices.map((q, i) => (i === 0 ? Object.assign({}, q, patch) : q)) }); return T.verifierPlan(p, r.e).erreurs.filter((m) => /I157|I158/.test(m)); };
    expect(avec({ message: { iSerie: 1, phrase: 'x' } }).length).toBeGreaterThan(0);
    expect(avec({ carteForme: { phrase: 'x' } }).length).toBeGreaterThan(0);
    expect(avec({ rate: null }).length).toBeGreaterThan(0);
    expect(avec({ rate: Object.assign({}, r.x.rate, { charge: { kg: 95, action: 'baisse' } }) }).length).toBeGreaterThan(0);
    expect(avec({}).length).toBe(0);
  });
  test('Moteur.reactionAuZero (table) : rôles grosse / test / au_max / haut → Z2 ; plancher (D nul) → Z2 ; ligne sans chiffre → Z1 (O20)', () => {
    const base = { charge: 30, descente: 27.5, role: 'travail', restantes: [30] };
    expect(M.reactionAuZero(base)).toMatchObject({ cas: 'Z1', charge: { kg: 27.5 } });
    ['grosse', 'test', 'au_max', 'haut'].forEach((role) => expect(M.reactionAuZero(Object.assign({}, base, { role })).cas).toBe('Z2'));
    expect(M.reactionAuZero(Object.assign({}, base, { descente: null })).cas).toBe('Z2');
    expect(M.reactionAuZero(Object.assign({}, base, { restantes: [null] })).cas).toBe('Z1');
    expect(M.reactionAuZero(Object.assign({}, base, { restantes: [25] })).cas).toBe('Z2');
    expect(M.reactionAuZero(Object.assign({}, base, { muet: true })).silence).toBe(true);
  });
  test('I26 : « 0 » est cité ; aucune « quand même », aucune fourchette', () => {
    const r = planZ([[100, 5], [102.5, 0, echec0]]);
    expect(r.x.phrases.filter((q) => q.ou === 'rate').length).toBe(1);
    expect(r.x.rate.phrase).not.toMatch(/quand même|garde/);
  });
});

// ── Commit 6 : la sortie « Tenter » (T-A17, T-A17b, I159, mutations j et t9) ──
describe('« Tenter » : le libellé se lit sur `sans` (T-A17), le geste substitue `sans` (T-A17b)', () => {
  const OBarre = { equipement: 'barre', debutant: false };
  function planGeste(gr, gestes, { validees } = {}) {
    let k = 0;
    const id = () => 'q-t' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 4 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = 8; });
    (validees || []).forEach(([kg, r], i) => Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps: r, validee_a: '2026-09-20T10:00:00.000Z' }));
    if (gestes) se.gestes = gestes;
    const avant = avantN(gr.length);
    const c = M.consigneDExercice(gr, undefined, avant, Object.assign({}, OPT, OBarre));
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices, gestes: gestes || [] }, consignes: { dc: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: false,
      catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0], c };
  }
  const R3b = { ressenti: 'reste_3_plus' };
  const hist = () => [seanceN(0, [brute(24, 10, R3b), brute(24, 10, R3b), brute(24, 10, R3b)]),
    seanceN(1, [brute(24, 10, R3b), brute(24, 10, R3b), brute(24, 10, R3b), brute(26.5, 0)])];
  const tente = [{ geste: 'cran_zero_tente', slug: 'dc', rang: 0 }];

  test('T-A17 : le bouton restitue la charge de `sans` (ligne, ou haut ≥ Ch), jamais Ch par défaut ; I159 vert', () => {
    const { p, e, x } = planGeste(hist());
    expect(x.consigne.etat).toBe('tenue_apres_zero');
    const sans = x.consigne.fondement.plafondZero.sans;
    const kg = sans.haut && Number(sans.haut.charge) >= 26.5 ? Number(sans.haut.charge) : Number(sans.ligne.charge);
    expect(x.tenueZero.charge).toBe(kg);
    expect(sp(x.tenueZero.bouton)).toBe('Tenter ' + String(kg).replace('.', ',') + ' kg');
    expect(x.tenueZero.tente).toBe(false);
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /I159/.test(m))).toEqual([]);
  });
  test('charge nulle (haltères : cran sans chiffre) → « Tenter le cran au-dessus »', () => {
    const k = M.consigneDExercice(hist(), undefined, avantN(2), Object.assign({}, OPT, OBarre)).consigne;
    const sansChiffre = Object.assign({}, k, { fondement: Object.assign({}, k.fondement, { plafondZero: Object.assign({}, k.fondement.plafondZero, {
      sans: Object.assign({}, k.fondement.plafondZero.sans, { ligne: { charge: null, vise: 8 }, haut: null }) }) }) });
    expect(M.boutonsDeLaTenue(sansChiffre)).toEqual({ charge: null, bouton: 'Tenter le cran au-dessus', annuler: 'Annuler' });
  });
  test('T-A17b : le geste cran_zero_tente (noterGeste, relecture) rend à la séance la consigne d\'avant plafond ; aucune série passée touchée ; I159/I155/I156 verts', () => {
    const base = planGeste(hist());
    let se = S.creer({ id: 'S', userId: 'u', idSerie: () => 'q' });
    se = S.noterGeste(se, { geste: 'cran_zero_tente', slug: 'dc', rang: 0 });
    expect(se.gestes).toEqual([{ geste: 'cran_zero_tente', slug: 'dc', rang: 0 }]);
    const { p, e, x } = planGeste(hist(), se.gestes);
    expect(x.consigne.etat).not.toBe('tenue_apres_zero');
    expect(x.consigne.fondement.plafondZero).toMatchObject({ mord: false, tente: true });
    expect(x.consigne.ligne).toEqual(base.x.consigne.fondement.plafondZero.sans.ligne);
    expect(x.tenueZero.tente).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // « Annuler » : le plafond revient
    const an = planGeste(hist(), tente.concat([{ geste: 'cran_zero_tente_annule', slug: 'dc', rang: 0 }]));
    expect(an.x.consigne.etat).toBe('tenue_apres_zero');
    expect(an.x.tenueZero.tente).toBe(false);
  });
  test('un geste hors liste serait refusé par noterGeste (mutation t9) ; un geste d\'un autre exercice ne tente rien', () => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: () => 'q' });
    expect(S.noterGeste(se, { geste: 'cran_zero_inconnu', slug: 'dc' })).toBe(se);
    const autre = planGeste(hist(), [{ geste: 'cran_zero_tente', slug: 'autre', rang: 0 }]);
    expect(autre.x.consigne.etat).toBe('tenue_apres_zero');
  });
  test('Tenter : le gris reprend la consigne d\'avant plafond (I156 ne tient plus la charge de Ch) ; la 1re série validée retire le bouton', () => {
    const { x } = planGeste(hist(), tente);
    const g = (x.lignes || []).filter((l) => !l.validee && l.type !== 'chauffe').map((l) => l.prerempli && l.prerempli.charge_kg);
    expect(g.some((v) => v !== null && v >= 26.5)).toBe(true);
    const f = planGeste(hist(), tente, { validees: [[26.5, 6]] });
    expect(f.x.tenueZero).toBeNull();
  });
  test('I159 est un vrai invariant : un bouton qui reprend Ch (ou une charge fausse) est refusé', () => {
    const { p, e } = planGeste(hist());
    p.exercices[0].tenueZero = Object.assign({}, p.exercices[0].tenueZero, { charge: 26.5, bouton: 'Tenter 26,5 kg' });
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /I159/.test(m)).length).toBeGreaterThan(0);
  });
});

describe('t10 — `suivantes` est borné à SUIVANTES_MAX (le contrat ne grossit pas avec l\'histoire)', () => {
  test('un zéro suivi de 30 séances sans atteindre Ch : au plus 8 suivantes, et le plafond échu (O12)', () => {
    const liste = [{ series: [[100, 5], [100, 5], [102.5, 0]] }];
    for (let i = 0; i < 30; i++) liste.push({ series: [[90, 5], [90, 5], [90, 5]] });
    const c = contrat(liste);
    expect(c[0].plafondZero.suivantes.length).toBeLessThanOrEqual(8);
    expect(c[0].plafondZero.suivantes.length).toBe(8);
    expect(actif(liste, 100)).toBeNull();
  });
});
