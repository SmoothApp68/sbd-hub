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
