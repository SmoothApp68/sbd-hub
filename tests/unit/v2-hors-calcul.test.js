/** @jest-environment node */
//
// 185 — « NON, NE COMPTE PAS » (`sets.hors_calcul`, v2_116) ET LE 0 REP (MOTEUR §9.2, décision d'Aurélien du 29/10/2026).
//
// Deux familles, chacune éprouvée sur sa configuration discriminante :
//   · une série `hors_calcul` reste au journal et au détail, mais n'entre ni dans les records, ni dans le palier, le niveau, les
//     crans voisins, ni dans le plan (I70) : la consigne est la MÊME avec ou sans elle ;
//   · un 0 rep ne fait plus jamais un « niveau validé 0 » (la boucle de singles A1), et une tentative manquée à la charge de
//     travail (ou en dessous) compte dans la stagnation, une au-dessus non.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const Palier = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null,
  type_serie: 'travail', exercise_slug: 'sq' }, extra || {});
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map((ser, i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: ser.map(([kg, r, extra]) => brute(kg, r, extra)) }));
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const consigne = (liste, o) => M.consigneDExercice(groupes(liste), undefined, avantDe(liste), Object.assign({}, OPT, o || {})).consigne;

describe('185 — la série hors_calcul n’est pas du travail', () => {
  test('`estTravail` la refuse, quel que soit son type ; le mot « hors calcul » la dit', () => {
    expect(Modele.estTravail(brute(100, 5))).toBe(true);
    expect(Modele.estTravail(brute(100, 5, { hors_calcul: true }))).toBe(false);
    expect(Modele.estTravail(brute(100, 5, { type_serie: 'echec', hors_calcul: true }))).toBe(false);
    expect(Modele.estHorsCalcul(brute(100, 5, { hors_calcul: true }))).toBe(true);
    expect(Modele.estHorsCalcul(brute(100, 5, { hors_calcul: false }))).toBe(false);
    expect(Modele.motDEchec(brute(100, 5, { hors_calcul: true }))).toBe('hors calcul');
  });
  test('le palier la range à part : jamais parmi les séries de travail, jamais le palier du jour', () => {
    const r = Palier.analyser([brute(100, 5), brute(100, 5), brute(100, 5), brute(155, 5, { hors_calcul: true })], undefined, { mesure: 'charge_reps' });
    expect(r.palier).toBe(100);
    expect(r.series.filter((d) => d.role === 'hors_calcul')).toHaveLength(1);
    expect(r.series.filter((d) => d.serie.charge_kg === 155)[0].role).toBe('hors_calcul');
    expect(Palier.roleDuTag(brute(155, 5, { hors_calcul: true }))).toBe('hors_calcul');
  });
  test('la seule série d’une séance, hors calcul : aucune série de travail', () => {
    const r = Palier.analyser([brute(155, 5, { hors_calcul: true })], undefined, { mesure: 'charge_reps' });
    expect(r.palier).toBeNull();
  });
});

describe('185 — la consigne est la même avec ou sans la série hors calcul', () => {
  const base = [[[100, 5], [100, 5], [100, 5]], [[100, 5], [100, 5], [100, 5]], [[100, 5], [100, 5], [100, 5]]];
  const avecFaute = base.map((s) => s.slice());
  avecFaute[2] = avecFaute[2].concat([[155, 5, { hors_calcul: true }]]);
  test('DISCRIMINANT : sans la marque, la même série de 155 kg change la consigne (le palier suit)', () => {
    const sansMarque = base.map((s) => s.slice());
    sansMarque[2] = sansMarque[2].concat([[155, 5]]);
    expect(JSON.stringify(consigne(sansMarque))).not.toBe(JSON.stringify(consigne(base)));
  });
  test('avec la marque : la consigne est exactement celle de l’historique sans cette série', () => {
    expect(JSON.stringify(consigne(avecFaute))).toBe(JSON.stringify(consigne(base)));
  });
  test('une séance entière hors calcul est ignorée du niveau et du palier', () => {
    const horsCalcul = base.concat([[[155, 5, { hors_calcul: true }], [155, 5, { hors_calcul: true }], [155, 5, { hors_calcul: true }]]]);
    const c0 = consigne(base), c1 = consigne(horsCalcul);
    expect(c1.palier).toBe(c0.palier);
    expect(c1.ligne && c1.ligne.charge).toBe(c0.ligne && c0.ligne.charge);
  });
  test('le cran voisin ne lit pas une charge hors calcul : 102,5 kg n’est pas un cran de la salle', () => {
    // `chargeVoisine` lit des vues (`votantes`) : celles du contrat, les séries au palier.
    const contrat = (liste) => M.contratDe(groupes(liste), undefined, 'charge_reps', { equipement: 'barre' })
      .map((se) => ({ debut: se.debut, palier: se.palier, votantes: se.series.filter((x) => x.role === 'palier') }));
    const seance102 = (extra) => [[102.5, 5, extra], [102.5, 5, extra], [102.5, 5, extra]];
    const avec = base.concat([seance102({ hors_calcul: true })]);
    const sans = base.concat([seance102()]);
    const av = avantDe(avec);
    const voisinAvec = M.chargeVoisine(contrat(avec), av, 100, 'machine', 1);
    const voisinBase = M.chargeVoisine(contrat(base), av, 100, 'machine', 1);
    expect(voisinAvec).toBe(voisinBase);
    // …et la même séance SANS la marque donne bien 102,5 comme cran voisin.
    expect(M.chargeVoisine(contrat(sans), av, 100, 'machine', 1)).toBe(102.5);
  });
});

describe('185 — les records ignorent la série hors calcul (le journal est immuable)', () => {
  const seance = (series) => ({ debut: '2026-09-20T18:00:00.000Z', series });
  const passee = { debut: '2026-09-10T18:00:00.000Z', series: [brute(125, 5)] };
  test('une série de travail au-dessus du meilleur fait un record', () => {
    expect(Modele.recordsBattus([passee], seance([brute(155, 5)]), 0, { equipement: 'barre' }).length).toBeGreaterThan(0);
  });
  test('DISCRIMINANT : la même série marquée hors calcul n’en fait aucun', () => {
    expect(Modele.recordsBattus([passee], seance([brute(155, 5, { hors_calcul: true })]), 0, { equipement: 'barre' })).toEqual([]);
  });
  test('et elle ne sert pas de base à battre : une série à 150 kg après elle bat 125, pas 155', () => {
    const r = Modele.recordsBattus([passee], seance([brute(155, 5, { hors_calcul: true }), brute(150, 5)]), 1, { equipement: 'barre' });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('185 — I70 : le plan n’a aucune entrée pour une série hors calcul', () => {
  function plan(horsCalcul) {
    let k = 0;
    const id = () => 'x' + (++k);
    const hist = groupes([[[100, 5], [100, 5], [100, 5]], [[100, 5], [100, 5], [100, 5]], [[100, 5], [100, 5], [100, 5]]]);
    const avant = new Date(Date.UTC(2026, 8, 20, 18)).toISOString();
    const c = M.consigneDExercice(hist, undefined, avant, OPT);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'sq', id, { series: 3 });
    se = S.modifierSerie(se, 0, 0, { charge_kg: 100, reps: 5 });
    se = S.valider(se, 0, 0, new Date('2026-09-20T18:30:00Z'));
    se = S.modifierSerie(se, 0, 1, { charge_kg: 155, reps: 5 });
    se = S.valider(se, 0, 1, new Date('2026-09-20T18:35:00Z'));
    if (horsCalcul) se = S.marquerHorsCalcul(se, 0, 1, true);
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { sq: c }, paris: [], suites: {} };
    return { e, p: T.planDeSeance(e) };
  }
  test('hors calcul : sa ligne est « hors », sans série faite, ni pari, ni indice ; la ligne suivante reste celle du coach', () => {
    const { e, p } = plan(true);
    const x = p.exercices[0];
    expect(x.lignes[1].role).toBe('hors');
    expect(x.lignes[1].faite).toBeUndefined();
    expect(x.indices).toEqual([0, 2]);
    expect(x.lignes[2].charge).toBe(100);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('DISCRIMINANT : sans la marque, la même série est une ligne faite et la suite se cale sur elle', () => {
    const { p } = plan(false);
    expect(p.exercices[0].lignes[1].role).not.toBe('hors');
    expect(p.exercices[0].indices).toEqual([0, 1, 2]);
  });
  test('I70 se voit : un plan fabriqué qui garde la série hors calcul parmi les lignes faites est refusé', () => {
    const { e, p } = plan(true);
    const faux = JSON.parse(JSON.stringify(p));
    faux.exercices[0].lignes[1].role = 'ligne';
    faux.exercices[0].lignes[1].faite = { charge: 155, reps: 5 };
    faux.exercices[0].indices = [0, 1, 2];
    const v = T.verifierPlan(faux, e);
    expect(v.erreurs.filter((m) => /^I70/.test(m)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('185 — le 0 rep ne fait jamais un niveau validé 0 (A1, A6)', () => {
  test('`niveauValide` : un 0 sort du niveau (8, 0, 6 → 6), et rien de plus de zéros ne donne null', () => {
    expect(M.niveauValide([{ reps: 8 }, { reps: 0 }, { reps: 6 }])).toBe(6);
    expect(M.niveauValide([{ reps: 0 }])).toBeNull();
    expect(M.niveauValide([{ reps: 0 }, { reps: 0 }])).toBeNull();
    expect(M.niveauValide([{ reps: 8 }, { reps: 8 }, { reps: 8 }])).toBe(8);
  });
  test('`25 × 8, 0, 6` : la consigne vise 7 reps (6 + 1), jamais « 25 kg × 1 »', () => {
    const c = consigne([[[20, 10], [20, 10], [20, 9]], [[22.5, 10], [22.5, 9], [22.5, 8]], [[25, 8], [25, 0], [25, 6]]], { equipement: 'poulie' });
    expect(c.ligne.charge).toBe(25);
    expect(c.ligne.vise).toBe(7);
  });
  test('la boucle de singles A1 a disparu : la personne qui suit l’écran ne monte pas en reps de 1', () => {
    let hist = [[[20, 10], [20, 10], [20, 9]], [[22.5, 10], [22.5, 9], [22.5, 8]], [[25, 8], [25, 0], [25, 6]]];
    const cap = (kg) => Math.max(0, Math.round(8 + (34 - kg) / 1.2));
    for (let i = 0; i < 8; i++) {
      const c = consigne(hist, { equipement: 'poulie' });
      const l = (c && c.ligne) || { charge: 25, vise: 8 };
      expect(l.vise).toBeGreaterThan(1);
      const r = Math.min(l.vise, cap(l.charge));
      hist = hist.concat([[[l.charge, r], [l.charge, r], [l.charge, r]]]);
    }
    const dernier = consigne(hist, { equipement: 'poulie' });
    expect((dernier.ligne || { charge: 25 }).charge).toBeLessThanOrEqual(34);
  });
  test('une série hors_calcul à 0 rep n’est pas non plus un niveau', () => {
    const c = consigne([[[25, 8], [25, 8], [25, 8]], [[25, 8], [25, 8], [25, 8]], [[25, 8], [25, 8], [25, 0, { hors_calcul: true }]]]);
    const c0 = consigne([[[25, 8], [25, 8], [25, 8]], [[25, 8], [25, 8], [25, 8]], [[25, 8], [25, 8]]]);
    expect(JSON.stringify(c)).toBe(JSON.stringify(c0));
  });
});

describe('185 — la tentative manquée et la stagnation (MOTEUR §9.2)', () => {
  const compteur = (liste) => {
    const seances = M.contratDe(groupes(liste), undefined, 'charge_reps', { equipement: 'barre' }).map((se) => Object.assign({}, se, { sousConsigne: true }));
    return M.compteurDe(seances, avantDe(liste), { toutes: true, equipement: 'barre', reglage: 'normal' });
  };
  const manquee = (kg) => [kg, 0, { type_serie: 'echec' }];
  const base = [[[100, 5], [100, 5], [100, 5]], [[100, 5], [100, 5], [100, 5]]];
  test('le décor : un gain de niveau (5 → 6 reps) au même palier est un progrès, le compteur retombe à 0', () => {
    const c = compteur(base.concat([[[100, 6], [100, 6], [100, 6]]]));
    expect(c.compteur).toBe(0);
  });
  test('DISCRIMINANT : la même séance avec une tentative manquée AU palier compte dans la stagnation', () => {
    const c = compteur(base.concat([[[100, 6], [100, 6], [100, 6], manquee(100)]]));
    expect(c.compteur).toBeGreaterThanOrEqual(1);
  });
  test('une tentative manquée EN DESSOUS du palier compte aussi', () => {
    const c = compteur(base.concat([[[100, 6], [100, 6], [100, 6], manquee(90)]]));
    expect(c.compteur).toBeGreaterThanOrEqual(1);
  });
  test('une tentative manquée AU-DESSUS de la charge de travail est ignorée : le gain reste un gain', () => {
    const c = compteur(base.concat([[[100, 6], [100, 6], [100, 6], manquee(110)]]));
    expect(c.compteur).toBe(0);
  });
});
