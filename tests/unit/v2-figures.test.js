/** @jest-environment node */
//
// 149 — C : LES FIGURES EN SECONDES (MOTEUR §9.17 ter ; décisions d'Aurélien du 23/10/2026, maquettes
// `maquette-figures-c-v1.html` et `-v2.html`).
//
// A  le catalogue lit le seuil (`echelle_seuil_s`), une échelle de figures se lit sur le catalogue, une habileté
//    y est proposable ;
// B  Franc : une séance suffit, pour toutes les cartes « marche suivante » et la carte du lest ;
// C  la règle des secondes (`planDeSeance`) : la tenue max, la durée visée, la carte en secondes, les invariants ;
// D  les écrans lisent.

process.env.TZ = 'Europe/Paris';

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const clone = (o) => JSON.parse(JSON.stringify(o));

// Un extrait du catalogue après v2_108 : le front lever (5 marches), le L-sit, et les tractions (échelle en reps).
const fiche = (slug, nom, echelle, rang, seuil, extra) => Object.assign({
  slug, nom, mesure: 'temps', charge: 'aucune', nature: 'habilete', habilete: true, actif: true,
  echelle, echelle_rang: rang, echelle_seuil_s: seuil
}, extra || {});
const LISTE = [
  fiche('front_lever_groupe', 'Front Lever Groupé', 'front_lever', 1, 20),
  fiche('front_lever_groupe_avance', 'Front Lever Groupé Avancé', 'front_lever', 2, 12),
  fiche('front_lever_une_jambe', 'Front Lever Une Jambe', 'front_lever', 3, 10),
  fiche('front_lever_jambes_ecartees', 'Front Lever Jambes Écartées', 'front_lever', 4, 10),
  fiche('front_lever', 'Front Lever', 'front_lever', 5, null),
  fiche('l_sit_hold', 'L-Sit', 'l_sit', 3, 30),
  fiche('l_sit_parallettes', 'L-Sit (Parallettes)', 'l_sit', 3, 30),
  fiche('v_sit', 'V-Sit', 'l_sit', 4, null),
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', charge: 'aucune', nature: 'force', actif: true, echelle: 'tractions', echelle_rang: 3 },
  { slug: 'tractions_archer', nom: 'Tractions Archer', mesure: 'reps', charge: 'aucune', nature: 'habilete', habilete: true, actif: true, echelle: 'tractions', echelle_rang: 4 },
  { slug: 'gainage', nom: 'Gainage', mesure: 'temps', charge: 'aucune', nature: 'force', actif: true }
];
const INDEX = {};
LISTE.forEach((x) => { INDEX[x.slug] = x; });

describe('149 A — le catalogue lit le seuil', () => {
  test('seuilDeLaMarche : un entier > 0, sinon null', () => {
    expect(Mo.seuilDeLaMarche(INDEX.front_lever_groupe)).toBe(20);
    expect(Mo.seuilDeLaMarche(INDEX.front_lever)).toBeNull();
    expect(Mo.seuilDeLaMarche(INDEX.tractions)).toBeNull();
    expect(Mo.seuilDeLaMarche({ echelle_seuil_s: 0 })).toBeNull();
    expect(Mo.seuilDeLaMarche({ echelle_seuil_s: 12.5 })).toBeNull();
    expect(Mo.seuilDeLaMarche({ echelle_seuil_s: '20' })).toBeNull();
    expect(Mo.seuilDeLaMarche(null)).toBeNull();
  });
  test('estEchelleDeFigures : toutes les marches en secondes, lu sur le catalogue', () => {
    expect(Mo.estEchelleDeFigures(INDEX, 'front_lever')).toBe(true);
    expect(Mo.estEchelleDeFigures(INDEX, 'l_sit')).toBe(true);
    expect(Mo.estEchelleDeFigures(INDEX, 'tractions')).toBe(false);
    expect(Mo.estEchelleDeFigures(INDEX, 'gainage')).toBe(false);
    expect(Mo.estEchelleDeFigures(INDEX, null)).toBe(false);
    expect(Mo.estUneFigure(INDEX, 'front_lever_groupe')).toBe(true);
    expect(Mo.estUneFigure(INDEX, 'tractions')).toBe(false);
    expect(Mo.estUneFigure(INDEX, 'gainage')).toBe(false);
  });
  test('une échelle dont une marche est en reps n’est pas une échelle de figures', () => {
    const idx = clone(INDEX);
    idx.front_lever_une_jambe.mesure = 'reps';
    expect(Mo.estEchelleDeFigures(idx, 'front_lever')).toBe(false);
  });
  test('une habileté est proposable DANS une figure', () => {
    expect(Mo.marcheSuivante(INDEX, 'front_lever_groupe')).toEqual(
      { type: 'marche', cible: ['front_lever_groupe_avance'], proposable: true });
    expect(Mo.marcheSuivante(INDEX, 'l_sit_hold')).toEqual({ type: 'marche', cible: ['v_sit'], proposable: true });
    expect(Mo.marcheSuivante(INDEX, 'front_lever')).toBeNull();
  });
  test('… et toujours pas depuis les tractions vers l’archer', () => {
    expect(Mo.marcheSuivante(INDEX, 'tractions')).toEqual(
      { type: 'habilete', cible: ['tractions_archer'], proposable: false });
  });
});

describe('149 A — la lecture du catalogue nettoie le seuil', () => {
  const LIGNES = [
    { slug: 'a', nom: 'A', echelle: 'front_lever', echelle_rang: 1, echelle_seuil_s: 20 },
    { slug: 'b', nom: 'B', echelle: 'front_lever', echelle_rang: 5, echelle_seuil_s: null },
    { slug: 'c', nom: 'C', echelle: 'tractions', echelle_rang: 3, echelle_seuil_s: null },
    { slug: 'd', nom: 'D', echelle: 'front_lever', echelle_rang: 2, echelle_seuil_s: 0 },
    { slug: 'e', nom: 'E', echelle: 'front_lever', echelle_rang: 2, echelle_seuil_s: '12' },
    { slug: 'f', nom: 'F', echelle: null, echelle_rang: null, echelle_seuil_s: 15 },
    { slug: 'g', nom: 'G' }
  ];
  const charger = () => {
    let n = 0;
    globalThis.THSeance = S;
    globalThis.THClient = { obtenir: () => ({ from() {
      const c = { select() { return c; }, eq() { return c; }, gt() { return c; }, or() { return c; }, order() { return c; },
        limit() { return c; }, range() { return c; },
        then(res, rej) { n += 1; return Promise.resolve({ data: n === 1 ? LIGNES.map((l) => Object.assign({}, l)) : [], error: null }).then(res, rej); } };
      return c;
    } }) };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    return require('../../v2/js/donnees.js');
  };
  afterEach(() => { delete globalThis.THClient; });
  test('un entier > 0 sur une échelle est gardé ; tout le reste est ABSENT (jamais null, 0 ou texte)', async () => {
    const cat = await charger().tousLesExercices();
    const par = {}; cat.forEach((e) => { par[e.slug] = e; });
    expect(par.a.echelle_seuil_s).toBe(20);
    expect(par.b).not.toHaveProperty('echelle_seuil_s');
    expect(par.c).not.toHaveProperty('echelle_seuil_s');
    expect(par.d).not.toHaveProperty('echelle_seuil_s');
    expect(par.e).not.toHaveProperty('echelle_seuil_s');
    expect(par.f).not.toHaveProperty('echelle_seuil_s');
    expect(par.f).not.toHaveProperty('echelle');
    expect(par.g).not.toHaveProperty('echelle_seuil_s');
  });
});

// ═══ B. FRANC : UNE SÉANCE SUFFIT ════════════════════════════════════════════
function seancesDe(slug, kg, reps, jours) {
  let rang = 0;
  const debut = (d) => new Date(Date.parse('2026-10-21T10:00:00Z') - d * 86400000).toISOString();
  return jours.map((d, i) => ({
    seance: { id: 'A' + i, debut: debut(d) },
    series: [0, 1, 2].map(() => ({ id: 'a' + (++rang), rang: rang, charge_kg: kg[i], reps: reps[i], rpe: null,
      ressenti: null, type_serie: 'travail', exercise_slug: slug }))
  }));
}
const AVANT = '2026-10-21T10:00:00Z';
const PDC = (reglage, plus) => Object.assign({ mesure: 'reps', equipement: null, intention: 'progresser', reglage,
  lestPossible: true, lestReponse: null, correction: 'mix', echelle: true }, plus || {});

describe('149 B — Franc : la carte du lest et la carte « marche suivante » lisent la dernière séance', () => {
  // 6 reps, puis 8 : la dernière seule est au haut de la zone Mix (8) ET à 8 reps.
  const seances = () => seancesDe('tractions', [null, null], [6, 8], [14, 7]);
  test('Franc : la carte du lest après UNE séance au seuil ; les niveaux disent la dernière deux fois', () => {
    const k = M.consigneDExercice(seances(), undefined, AVANT, PDC('franc')).consigne;
    expect(k.etat).toBe('carte_lest');
    expect(k.fondement.carteLest.niveaux).toEqual([8, 8]);
    expect(k.fondement.deuxSeances.map((q) => q.niveau)).toEqual([8, 8]);
  });
  test('Normal et Prudent : inchangés — il faut les DEUX', () => {
    ['normal', 'prudent'].forEach((r) => {
      const k = M.consigneDExercice(seances(), undefined, AVANT, PDC(r)).consigne;
      expect(k.etat).not.toBe('carte_lest');
      expect((k.fondement.deuxSeances || []).map((q) => q.niveau)).toEqual([6, 8]);
    });
  });
  test('Franc : sous le seuil à la dernière séance, rien — même si l’avant-dernière y était', () => {
    const k = M.consigneDExercice(seancesDe('tractions', [null, null], [8, 7], [14, 7]), undefined, AVANT, PDC('franc')).consigne;
    expect(k.etat).not.toBe('carte_lest');
  });
  const entree = (reglage, seances) => ({
    marche: { type: 'marche', cible: ['tractions_strictes'], proposable: true }, nomCible: 'Tractions Strictes',
    aide: false, haut: 8, seances, reponse: null, cibleFaiteLe: null, aujourdHui: '2026-10-21T10:00:00Z',
    coachActif: true, reglage
  });
  test('la carte « marche suivante » : une séance en Franc, deux sinon ; les textes disent la règle', () => {
    const une = [{ niveau: 9, charge: 0 }];
    const deux = [{ niveau: 7, charge: 0 }, { niveau: 9, charge: 0 }];
    expect(M.carteMarche(entree('franc', une)).titre).toBe('9 reps sur toutes tes séries aujourd’hui.');
    expect(M.carteMarche(entree('normal', une))).toBeNull();
    expect(M.carteMarche(entree('prudent', une))).toBeNull();
    // Franc lit la dernière seule ; Normal exige les deux.
    expect(M.carteMarche(entree('franc', deux))).not.toBeNull();
    expect(M.carteMarche(entree('normal', deux))).toBeNull();
    const deuxBon = [{ niveau: 8, charge: 0 }, { niveau: 9, charge: 0 }];
    expect(M.carteMarche(entree('normal', deuxBon)).titre).toBe('9 reps sur toutes tes séries, deux séances de suite.');
    expect(M.carteMarche(entree(undefined, deuxBon)).titre).toBe('9 reps sur toutes tes séries, deux séances de suite.');
    // Franc, la dernière sous le seuil : rien.
    expect(M.carteMarche(entree('franc', [{ niveau: 9, charge: 0 }, { niveau: 7, charge: 0 }]))).toBeNull();
  });
  test('Franc : la garde « à la même aide » n’a plus d’objet', () => {
    const e = (r) => Object.assign(entree(r, [{ niveau: 12, charge: -30 }, { niveau: 12, charge: -25 }]), { aide: true });
    expect(M.carteMarche(e('normal'))).toBeNull();
    expect(M.carteMarche(e('franc'))).not.toBeNull();
    expect(M.carteMarche(e('franc')).titre).toMatch(/× 12 sur toutes tes séries aujourd’hui\.$/);
  });
  test('la phrase de la page : « sur une séance » en Franc, « deux séances de suite » sinon', () => {
    const e = { type: 'marche', nomCible: 'Tractions Strictes', nomDepart: 'Tractions Élastique', haut: 8, meilleur: null };
    expect(M.phraseDeLaSuivante(Object.assign({ reglage: 'franc' }, e))).toMatch(/sur toutes tes séries, sur une séance\./);
    expect(M.phraseDeLaSuivante(Object.assign({ reglage: 'franc' }, e))).not.toMatch(/deux séances/);
    expect(M.phraseDeLaSuivante(Object.assign({ reglage: 'normal' }, e))).toMatch(/deux séances de suite\./);
    expect(M.phraseDeLaSuivante(e)).toMatch(/deux séances de suite\./);
    const c = M.phraseDeLaSuivante(Object.assign({ reglage: 'franc', court: true }, e));
    expect(c).toMatch(/sur une séance\./);
  });
  test('les ronds : UN en Franc, deux sinon', () => {
    const sc = [{ niveau: 7, charge: 0 }, { niveau: 9, charge: 0 }];
    expect(M.rondsDeLaSuivante({ haut: 8, seances: sc, reglage: 'franc' })).toEqual([true]);
    expect(M.rondsDeLaSuivante({ haut: 8, seances: sc, reglage: 'normal' })).toEqual([false, true]);
    expect(M.rondsDeLaSuivante({ haut: 8, seances: sc })).toEqual([false, true]);
  });
});

describe('149 B — Franc dans le plan : la carte, I49 et I50 relus selon le réglage', () => {
  const IDX = {
    tractions_elastique: { slug: 'tractions_elastique', nom: 'Tractions Élastique', mesure: 'charge_reps', charge: 'assistance',
      nature: 'force', actif: true, echelle: 'tractions', echelle_rang: 1 },
    tractions: { slug: 'tractions', nom: 'Tractions', mesure: 'reps', charge: 'aucune', nature: 'force', actif: true,
      echelle: 'tractions', echelle_rang: 2 }
  };
  const AIDE = { mesure: 'charge_reps', equipement: 'elastique', intention: 'progresser', lestPossible: false,
    lestReponse: null, echelle: true };
  const entreesDe = (reglage, kg, reps, jours) => {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'tractions_elastique', id, { series: 3 });
    const c = M.consigneDExercice(seancesDe('tractions_elastique', kg, reps, jours), undefined, AVANT, Object.assign({ reglage }, AIDE));
    const m = Mo.marcheSuivante(IDX, 'tractions_elastique');
    return {
      seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { tractions_elastique: c }, reglage, paris: [], suites: {},
      catalogue: { tractions_elastique: { equipement: 'elastique', muscles_primaires: ['dos'], mesure: 'charge_reps', leste: null } },
      intention: 'progresser', modes: {}, lestReponse: null,
      echelles: { tractions_elastique: { marche: m, nomCible: 'Tractions', aide: true, cibleHabilete: false, cibleFaiteLe: null } },
      marcheReponses: {}
    };
  };
  const erreurs = (plan, e) => T.verifierPlan(plan, e).erreurs;
  // Une seule séance au haut de la zone (12) : l'avant-dernière à 10.
  const A = (reglage) => entreesDe(reglage, [-30, -25], [10, 12], [14, 7]);

  test('Franc : la carte après UNE séance, sans erreur d’invariant ; la phrase dit la règle', () => {
    const e = A('franc');
    const plan = T.planDeSeance(e);
    expect(plan.reglage).toBe('franc');
    expect(plan.exercices[0].carteMarche).toMatchObject({ niveau: 12 });
    expect(plan.exercices[0].carteMarche.titre).toMatch(/sur toutes tes séries aujourd’hui\.$/);
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('Normal, Prudent et sans réglage : pas de carte avec une seule séance au haut de la zone', () => {
    ['normal', 'prudent', null].forEach((r) => {
      const plan = T.planDeSeance(A(r));
      expect(plan.exercices[0].carteMarche).toBeNull();
    });
  });
  test('Franc : deux séances à des aides différentes — la carte vient quand même (la même aide n’a plus d’objet)', () => {
    const e = entreesDe('franc', [-30, -25], [12, 12], [14, 7]);
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].carteMarche).not.toBeNull();
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('I49 — Franc : une carte qui dit « deux séances de suite » ; Normal : une carte qui ne le dit pas', () => {
    const e = A('franc');
    const f = clone(T.planDeSeance(e));
    f.exercices[0].carteMarche.titre = '12 reps sur toutes tes séries, deux séances de suite.';
    expect(erreurs(f, e).some((t) => /^I49 .*règle du réglage/.test(t))).toBe(true);
    const en = entreesDe('normal', [-25, -25], [12, 12], [14, 7]);
    const g = clone(T.planDeSeance(en));
    expect(erreurs(g, en)).toEqual([]);
    g.exercices[0].carteMarche.titre = '12 reps sur toutes tes séries aujourd’hui.';
    expect(erreurs(g, en).some((t) => /^I49 .*règle du réglage/.test(t))).toBe(true);
  });
  test('I49 — Franc : la dernière séance sous le haut de la zone', () => {
    const e = A('franc');
    const f = clone(T.planDeSeance(e));
    f.exercices[0].consigne.fondement.deuxSeances = [{ niveau: 12, charge: -25 }, { niveau: 11, charge: -25 }];
    expect(erreurs(f, e).some((t) => /^I49 /.test(t))).toBe(true);
  });
});

describe('149 B — Franc : la carte du lest dans le plan (I29, I50)', () => {
  const entreesLest = (reglage) => {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'tractions', id, { series: 3 });
    const c = M.consigneDExercice(seancesDe('tractions', [null, null], [6, 8], [14, 7]), undefined, AVANT,
      PDC(reglage, { echelle: false }));
    return {
      seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { tractions: c }, reglage, paris: [], suites: {},
      catalogue: { tractions: { equipement: null, muscles_primaires: ['dos'], mesure: 'reps', leste: 'tractions_lestees' } },
      intention: 'progresser', modes: {}, lestReponse: null, echelles: {}, marcheReponses: {}
    };
  };
  const erreurs = (plan, e) => T.verifierPlan(plan, e).erreurs;
  test('Franc : la carte du lest après une séance, son titre dit la règle, aucun invariant ne bronche', () => {
    const e = entreesLest('franc');
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].carteLest).not.toBeNull();
    expect(plan.exercices[0].carteLest.titre).toBe('8 reps sur toutes tes séries aujourd’hui.');
    expect(erreurs(plan, e)).toEqual([]);
  });
  test('Normal : pas de carte du lest avec une seule séance au haut', () => {
    expect(T.planDeSeance(entreesLest('normal')).exercices[0].carteLest).toBeNull();
  });
  test('I50 — Franc : la dernière séance sous le seuil ; Normal : un titre qui ne dit pas « deux séances de suite »', () => {
    const e = entreesLest('franc');
    const f = clone(T.planDeSeance(e));
    f.exercices[0].carteLest.niveaux = [8, 7];
    expect(erreurs(f, e).some((t) => /^I50 /.test(t))).toBe(true);
    const g = clone(T.planDeSeance(e));
    g.exercices[0].carteLest.titre = '8 reps sur toutes tes séries, deux séances de suite.';
    expect(erreurs(g, e).some((t) => /^I50 .*règle du réglage/.test(t))).toBe(true);
  });
});
