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
    expect(M.carteMarche(entree('franc', une)).titre).toBe("9 reps sur toutes tes séries aujourd'hui.");
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
    expect(M.carteMarche(e('franc')).titre).toMatch(/× 12 sur toutes tes séries aujourd'hui\.$/);
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
    expect(plan.exercices[0].carteMarche.titre).toMatch(/sur toutes tes séries aujourd'hui\.$/);
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
    g.exercices[0].carteMarche.titre = "12 reps sur toutes tes séries aujourd'hui.";
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
    expect(plan.exercices[0].carteLest.titre).toBe("8 reps sur toutes tes séries aujourd'hui.");
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

// ═══ C. LA RÈGLE DES SECONDES (planDeSeance) ═════════════════════════════════
describe('149 C — la durée visée (50 / 60 / 70 %, arrondi, plancher 2 s)', () => {
  test('les parts du réglage : Prudent 50, Normal 60, Franc 70 ; défaut Normal', () => {
    expect(M.partDeLaTenue('prudent')).toBe(50);
    expect(M.partDeLaTenue('normal')).toBe(60);
    expect(M.partDeLaTenue('franc')).toBe(70);
    expect(M.partDeLaTenue(undefined)).toBe(60);
    expect(M.partDeLaTenue('autre')).toBe(60);
  });
  test('22 s → 11 / 13 / 15 ; l’arrondi est à la seconde la plus proche', () => {
    expect(['prudent', 'normal', 'franc'].map((r) => M.dureeVisee(22, r))).toEqual([11, 13, 15]);
    expect(['prudent', 'normal', 'franc'].map((r) => M.dureeVisee(18, r))).toEqual([9, 11, 13]);
    expect(M.dureeVisee(15, 'franc')).toBe(11);       // 10,5 → 11 (au plus proche, la moitié vers le haut)
    expect(M.dureeVisee(5, 'normal')).toBe(3);
  });
  test('le plancher : 2 s — 4 s → 2 / 2 / 3, 1 s → 2 s', () => {
    expect(['prudent', 'normal', 'franc'].map((r) => M.dureeVisee(4, r))).toEqual([2, 2, 3]);
    expect(M.dureeVisee(1, 'prudent')).toBe(2);
  });
  test('sans tenue max valide : pas de durée', () => {
    expect(M.dureeVisee(null, 'normal')).toBeNull();
    expect(M.dureeVisee(0, 'normal')).toBeNull();
    expect(M.dureeVisee('x', 'normal')).toBeNull();
  });
});

describe('149 C — les phrases de la tenue (voix du coach, un fait)', () => {
  test('avant la tenue max : le max de la dernière fois, ou la première fois', () => {
    expect(M.phraseDeLaTenueMax({ dernier: 20 })).toBe('Ton max la dernière fois : 20 s. Essaie de faire mieux, proprement.');
    expect(M.phraseDeLaTenueMax({ dernier: null })).toBe('Première fois ici : autant que tu peux, proprement.');
    expect(M.phraseDeLaTenueMax({})).toBe('Première fois ici : autant que tu peux, proprement.');
  });
  test('après : battu, pas battu, égal, première fois', () => {
    expect(M.phraseDesTenues({ max: 22, dernier: 20, vise: 13 })).toBe('22 s : 2 s de plus que la dernière fois. Tes tenues : 13 s.');
    expect(M.phraseDesTenues({ max: 18, dernier: 20, vise: 11 })).toBe('18 s aujourd\'hui. Tes tenues : 11 s.');
    expect(M.phraseDesTenues({ max: 20, dernier: 20, vise: 12 })).toBe('20 s aujourd\'hui. Tes tenues : 12 s.');
    expect(M.phraseDesTenues({ max: 22, dernier: null, vise: 13 })).toBe('22 s aujourd\'hui. Tes tenues : 13 s.');
  });
  test('sous 5 s : la marche d’en dessous (au rang 1, pas de seconde phrase)', () => {
    expect(M.phraseDesTenues({ max: 4, dernier: null, vise: 3, dessous: 'Front Lever Groupé' }))
      .toBe('4 s aujourd\'hui. Tes tenues : 3 s. Sous 5 s, les coachs travaillent la marche d\'en dessous : Front Lever Groupé.');
    expect(M.phraseDesTenues({ max: 4, dernier: null, vise: 3, dessous: null })).toBe('4 s aujourd\'hui. Tes tenues : 3 s.');
    // 5 s pile n'est pas « sous 5 s »
    expect(M.phraseDesTenues({ max: 5, dernier: null, vise: 3, dessous: 'X' })).toBe('5 s aujourd\'hui. Tes tenues : 3 s.');
  });
  test('aucun point d’interrogation, aucun « bravo »', () => {
    [M.phraseDeLaTenueMax({ dernier: 20 }), M.phraseDesTenues({ max: 22, dernier: 20, vise: 13 })]
      .forEach((t) => { expect(t).not.toMatch(/\?|bravo|félicitations/i); });
  });
});

// Un front lever groupé / avancé / un gainage dans le plan.
const CAT = {
  front_lever_groupe: { equipement: null, muscles_primaires: ['abdominaux'], mesure: 'temps', leste: null },
  front_lever_groupe_avance: { equipement: null, muscles_primaires: ['abdominaux'], mesure: 'temps', leste: null },
  planche: { equipement: null, muscles_primaires: ['abdominaux'], mesure: 'temps', leste: null }
};
const marchePour = (slug) => {
  const m = Mo.marcheSuivante(INDEX, slug);
  if (!m || !m.proposable) return null;
  const c = INDEX[m.cible[0]];
  return { marche: m, nomCible: c.nom, aide: false, cibleHabilete: c.nature === 'habilete', cibleFaiteLe: null };
};
// `faites` : la durée de chaque série (null = vide, à faire) ; une valeur = validée.
function figPlan(opts) {
  const o = Object.assign({ slug: 'front_lever_groupe', reglage: 'normal', tenues: [], faites: [null, null, null, null],
    dessous: null, seuil: 20, extra: null, reponses: {} }, opts || {});
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, o.slug, id, { series: o.faites.length });
  o.faites.forEach((d, i) => {
    if (d !== null) se.exercices[0].series[i] = Object.assign({}, se.exercices[0].series[i], { duree_s: d, validee_a: '2026-10-21T10:0' + i + ':00Z' });
  });
  const ech = marchePour(o.slug);
  const e = Object.assign({
    seance: { id: 'S1', debut: '2026-10-21T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: {}, reglage: o.reglage, paris: [], suites: {},
    catalogue: { [o.slug]: Object.assign({}, CAT[o.slug] || CAT.front_lever_groupe) },
    intention: 'progresser', modes: {}, lestReponse: null,
    echelles: ech ? { [o.slug]: ech } : {},
    figures: { [o.slug]: { tenues: o.tenues, dessous: o.dessous, seuil: o.seuil } },
    marcheReponses: o.reponses
  }, o.extra || {});
  const plan = T.planDeSeance(e);
  return { e, plan, x: plan.exercices[0], erreurs: T.verifierPlan(plan, e).erreurs };
}
const vises = (x) => x.lignes.map((l) => l.vise === undefined ? undefined : l.vise);
const fant = (x) => x.lignes.map((l) => (l.prerempli ? l.prerempli.duree_s : undefined));
const etiq = (x) => x.lignes.map((l) => l.etiquette || null);

describe('149 C — la tenue max, la première ligne de travail', () => {
  test('avant la tenue max : la première ligne est « max », son fantôme est le max de la dernière fois', () => {
    const { x, erreurs } = figPlan({ tenues: [18, 20] });
    expect(x.lignes.map((l) => l.tenue)).toEqual(['max', 'tenue', 'tenue', 'tenue']);
    expect(etiq(x)).toEqual(['max', 'après ton max', null, null]);
    expect(fant(x)).toEqual([20, null, null, null]);
    expect(vises(x)).toEqual([null, null, null, null]);
    expect(x.lignes[0].phraseAvant).toBe('Ton max la dernière fois : 20 s. Essaie de faire mieux, proprement.');
    expect(x.lignes[0].phraseApres).toBeNull();
    expect(x.figure).toMatchObject({ dernier: 20, max: null, vise: null, premiere: false, battu: null });
    expect(x.lignes.every((l) => l.role === 'hors')).toBe(true);
    expect(erreurs).toEqual([]);
  });
  test('première fois : pas de fantôme, « Première fois ici »', () => {
    const { x, erreurs } = figPlan({ tenues: [] });
    expect(fant(x)).toEqual([null, null, null, null]);
    expect(x.lignes[0].phraseAvant).toBe('Première fois ici : autant que tu peux, proprement.');
    expect(x.figure.premiere).toBe(true);
    expect(erreurs).toEqual([]);
  });
  test('la tenue max validée à 22 s (Normal) : les trois lignes suivantes à 13 s, la phrase sous la tenue max', () => {
    const { x, erreurs } = figPlan({ tenues: [18, 20], faites: [22, null, null, null] });
    expect(vises(x)).toEqual([null, 13, 13, 13]);
    expect(fant(x)).toEqual([20, 13, 13, 13]);
    expect(etiq(x)).toEqual(['max', null, null, null]);
    expect(x.lignes[0].phraseAvant).toBeNull();
    expect(x.lignes[0].phraseApres).toBe('22 s : 2 s de plus que la dernière fois. Tes tenues : 13 s.');
    expect(x.figure).toMatchObject({ max: 22, vise: 13, part: 60, battu: true, sous: false });
    expect(erreurs).toEqual([]);
  });
  test('pas battu : la cible se calcule sur le max DU JOUR (18 s → 11 s)', () => {
    const { x, erreurs } = figPlan({ tenues: [20], faites: [18, null, null, null] });
    expect(vises(x)).toEqual([null, 11, 11, 11]);
    expect(x.lignes[0].phraseApres).toBe('18 s aujourd\'hui. Tes tenues : 11 s.');
    expect(x.figure.battu).toBe(false);
    expect(erreurs).toEqual([]);
  });
  test('les trois réglages : 22 s → 11 / 13 / 15', () => {
    ['prudent', 'normal', 'franc'].forEach((r, k) => {
      const { x, erreurs } = figPlan({ reglage: r, tenues: [20], faites: [22, null, null, null] });
      expect(vises(x)).toEqual([null, [11, 13, 15][k], [11, 13, 15][k], [11, 13, 15][k]]);
      expect(erreurs).toEqual([]);
    });
  });
  test('une tenue suivante PLUS LONGUE ne change pas la cible (une seule tenue max, la première)', () => {
    const { x, erreurs } = figPlan({ tenues: [20], faites: [22, 30, null, null] });
    expect(vises(x)).toEqual([null, 13, 13, 13]);
    expect(x.figure.max).toBe(22);
    expect(erreurs).toEqual([]);
  });
  test('le nombre de lignes vient de la routine : deux lignes, ou six, le coach n’en pose ni n’en retire', () => {
    [2, 6].forEach((n) => {
      const f = Array(n).fill(null); f[0] = 22;
      const { x, erreurs } = figPlan({ tenues: [20], faites: f });
      expect(x.lignes).toHaveLength(n);
      expect(vises(x)).toEqual([null].concat(Array(n - 1).fill(13)));
      expect(erreurs).toEqual([]);
    });
  });
  test('4 s : cible 2 s en Prudent et Normal, 3 s en Franc ; sous 5 s, la marche d’en dessous (si elle existe)', () => {
    const a = figPlan({ slug: 'front_lever_groupe_avance', reglage: 'normal', tenues: [], faites: [4, null, null], dessous: 'Front Lever Groupé' });
    expect(vises(a.x)).toEqual([null, 2, 2]);
    expect(a.x.lignes[0].phraseApres).toBe(
      '4 s aujourd\'hui. Tes tenues : 2 s. Sous 5 s, les coachs travaillent la marche d\'en dessous : Front Lever Groupé.');
    expect(a.x.figure.sous).toBe(true);
    expect(a.erreurs).toEqual([]);
    const f = figPlan({ slug: 'front_lever_groupe_avance', reglage: 'franc', faites: [4, null, null], dessous: 'Front Lever Groupé' });
    expect(vises(f.x)).toEqual([null, 3, 3]);
    const r1 = figPlan({ reglage: 'normal', faites: [4, null, null, null], dessous: null });
    expect(r1.x.lignes[0].phraseApres).toBe('4 s aujourd\'hui. Tes tenues : 2 s.');
    expect(r1.erreurs).toEqual([]);
  });
  test('une chauffe devant la tenue max : la tenue max reste la première ligne de TRAVAIL', () => {
    let n = 0; const id = () => 'c' + (++n);
    const base = figPlan({ tenues: [20] });
    const se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    const avec = S.ajouterExercice(se, 'front_lever_groupe', id, { series: 3 });
    avec.exercices[0].series[0] = Object.assign({}, avec.exercices[0].series[0], { type_serie: 'echauffement' });
    const e = Object.assign({}, base.e, { seance: { id: 'S1', debut: '2026-10-21T10:00:00Z', edition: false, exercices: avec.exercices } });
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].lignes.map((l) => l.tenue || null)).toEqual([null, 'max', 'tenue']);
    expect(T.verifierPlan(plan, e).erreurs).toEqual([]);
  });
  test('aucun pari, aucune consigne, aucune chauffe, aucune dégressive, aucune question de réserve', () => {
    const { x } = figPlan({ tenues: [20], faites: [22, null, null, null] });
    expect(x.consigne).toBeNull();
    expect((x.paris || []).filter(Boolean)).toEqual([]);
    expect(x.chauffes).toBeNull();
    expect(x.degressive).toBeNull();
    expect(x.questionReserve).toBeNull();
    expect(x.escalier || null).toBeNull();
  });
});

describe('149 C — le coach actif seulement (I13 ne s’ouvre que pour les figures)', () => {
  test('« Juste un carnet » (le profil), Entretenir (l’exercice), Édition : ni étiquette, ni fantôme, ni phrase, ni durée', () => {
    const cas = [
      figPlan({ tenues: [20], faites: [22, null, null, null], extra: { intention: 'entretien' } }),
      figPlan({ tenues: [20], faites: [22, null, null, null], extra: { modes: { front_lever_groupe: 'entretien' } } }),
      figPlan({ tenues: [20], faites: [22, null, null, null], extra: { seance: { id: 'S1', debut: '2026-10-21T10:00:00Z', edition: true,
        exercices: figPlan({ faites: [22, null, null, null] }).e.seance.exercices } } })
    ];
    cas.forEach((c) => {
      expect(c.x.figure).toBeNull();
      expect(c.x.lignes.some((l) => l.tenue || l.etiquette || l.phraseAvant || l.phraseApres || l.vise !== undefined)).toBe(false);
      expect(c.x.phrases).toEqual([]);
      expect(c.x.carteMarche || null).toBeNull();
      expect(c.erreurs).toEqual([]);
    });
  });
  test('« J’ai mal » : sans coach pour cette occurrence', () => {
    const base = figPlan({ tenues: [20], faites: [null, null, null, null] });
    const se = S.marquerDouleur(Object.assign(S.creer({ id: 'S1', userId: 'u', idSerie: () => 'd' + Math.random() }), { exercices: base.e.seance.exercices }), 0);
    expect(S.occurrenceDouloureuse(se.exercices[0])).toBe(true);
    const e = Object.assign({}, base.e, { seance: Object.assign({}, base.e.seance, { exercices: se.exercices }) });
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].figure).toBeNull();
    expect(plan.exercices[0].lignes.some((l) => l.tenue)).toBe(false);
    expect(T.verifierPlan(plan, e).erreurs).toEqual([]);
  });
  test('le gainage, le cardio, les étirements : rien ne change — aucune durée, aucune phrase du coach (I13)', () => {
    const plan = (slug) => {
      let n = 0; const id = () => 'g' + (++n);
      let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
      se = S.ajouterExercice(se, slug, id, { series: 3 });
      se.exercices[0].series[0] = Object.assign({}, se.exercices[0].series[0], { duree_s: 40, validee_a: '2026-10-21T10:01:00Z' });
      const e = { seance: { id: 'S1', debut: '2026-10-21T10:00:00Z', edition: false, exercices: se.exercices }, consignes: {},
        reglage: 'normal', paris: [], suites: {}, catalogue: { [slug]: { equipement: null, muscles_primaires: ['abdominaux'], mesure: 'temps', leste: null } },
        intention: 'progresser', modes: {}, lestReponse: null, echelles: {}, figures: {}, marcheReponses: {} };
      const p = T.planDeSeance(e);
      return { x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs };
    };
    ['gainage', 'etirement_ischio', 'tapis_course'].forEach((slug) => {
      const { x, erreurs } = plan(slug);
      expect(x.figure).toBeNull();
      expect(x.lignes.some((l) => l.tenue || l.etiquette || l.vise !== undefined)).toBe(false);
      expect(x.phrases).toEqual([]);
      expect(erreurs).toEqual([]);
    });
  });
  test('un exercice de durée donné comme figure à tort (hors échelle de figures) : I52 le dit', () => {
    const { e, plan } = figPlan({ tenues: [20], faites: [22, null, null, null] });
    const f = clone(plan);
    const sans = clone(e); sans.figures = {};
    expect(T.verifierPlan(f, sans).erreurs.some((t) => /^I52 .*pas sur une échelle de figures/.test(t))).toBe(true);
  });
});

describe('149 C — la carte « marche suivante » en secondes', () => {
  const carte = (o) => figPlan(Object.assign({ faites: [null, null, null, null] }, o));
  test('Normal : la tenue max du jour ET celle de la séance d’avant au seuil (20 s) — « 22 s tenues, deux séances de suite. »', () => {
    const { x, erreurs } = carte({ tenues: [20], faites: [22, null, null, null] });
    expect(x.carteMarche).toMatchObject({
      titre: '22 s tenues, deux séances de suite.',
      detail: 'La marche au-dessus : Front Lever Groupé Avancé. Je te propose d\'en faire 2 tenues avant, autant de secondes que tu peux.',
      oui: 'Ajouter Front Lever Groupé Avancé', non: 'Pas maintenant', cible: 'front_lever_groupe_avance',
      secondes: true, seuil: 20, aide: false, type: 'marche', proposable: true
    });
    expect(x.carteMarche.tenues).toEqual([20, 22]);
    expect(erreurs).toEqual([]);
  });
  test('19 s : pas de carte ; 20 s pile : la carte (le seuil est inclus)', () => {
    expect(carte({ tenues: [20], faites: [19, null, null, null] }).x.carteMarche).toBeNull();
    expect(carte({ tenues: [19], faites: [22, null, null, null] }).x.carteMarche).toBeNull();
    expect(carte({ tenues: [20], faites: [20, null, null, null] }).x.carteMarche).not.toBeNull();
  });
  test('Normal : une seule séance au seuil ne suffit pas ; Prudent non plus', () => {
    expect(carte({ tenues: [], faites: [25, null, null, null] }).x.carteMarche).toBeNull();
    expect(carte({ reglage: 'prudent', tenues: [10], faites: [25, null, null, null] }).x.carteMarche).toBeNull();
  });
  test('Franc : UNE séance suffit — la tenue max du jour ; « 21 s tenues aujourd\'hui. »', () => {
    const { x, erreurs } = carte({ reglage: 'franc', tenues: [10], faites: [21, null, null, null] });
    expect(x.carteMarche).toMatchObject({ titre: '21 s tenues aujourd\'hui.', niveau: 21 });
    expect(erreurs).toEqual([]);
    expect(carte({ reglage: 'franc', tenues: [], faites: [21, null, null, null] }).x.carteMarche).not.toBeNull();
    expect(carte({ reglage: 'franc', tenues: [30], faites: [19, null, null, null] }).x.carteMarche).toBeNull();
  });
  test('la carte lit la tenue max du jour : tant qu’elle n’est pas validée, pas de carte', () => {
    expect(carte({ tenues: [25, 25], faites: [null, null, null, null] }).x.carteMarche).toBeNull();
  });
  test('« Ajouter » ou « Pas maintenant » déjà répondu : pas de carte (une fois)', () => {
    ['oui', 'non'].forEach((r) => {
      const c = carte({ tenues: [20], faites: [22, null, null, null], reponses: { front_lever_groupe: { r, le: '2026-10-20T10:00:00Z' } } });
      expect(c.x.carteMarche).toBeNull();
      expect(c.erreurs).toEqual([]);
    });
  });
  test('la marche proposée faite il y a moins de 28 jours : pas de carte', () => {
    const base = carte({ tenues: [20], faites: [22, null, null, null] });
    const e = clone(base.e);
    e.echelles.front_lever_groupe.cibleFaiteLe = '2026-10-11T10:00:00Z';
    expect(T.planDeSeance(e).exercices[0].carteMarche).toBeNull();
  });
  test('sans seuil au catalogue (le sommet d’une échelle, ou colonne vide) : pas de carte', () => {
    expect(carte({ tenues: [20], faites: [22, null, null, null], seuil: null }).x.carteMarche).toBeNull();
  });
  test('le sommet de l’échelle n’a pas de suivante', () => {
    expect(figPlan({ slug: 'front_lever', tenues: [20], faites: [22, null], seuil: null,
      extra: { catalogue: { front_lever: CAT.front_lever_groupe } } }).x.carteMarche || null).toBeNull();
  });
  test('un L-sit vers le V-sit : une habileté proposée dans la figure', () => {
    const { x, erreurs } = figPlan({ slug: 'l_sit_hold', tenues: [31], faites: [32, null, null], seuil: 30,
      extra: { catalogue: { l_sit_hold: CAT.front_lever_groupe } } });
    expect(x.carteMarche).toMatchObject({ cible: 'v_sit', nom: 'V-Sit', titre: '32 s tenues, deux séances de suite.' });
    expect(erreurs).toEqual([]);
  });
  test('la carte seule dans la séance : une par exercice', () => {
    const { plan } = carte({ tenues: [20], faites: [22, null, null, null] });
    expect(plan.exercices.filter((q) => q.carteMarche).length).toBe(1);
  });
});

describe('149 C — I49 (secondes) et I52 à I55, cassés exprès', () => {
  const sain = (o) => { const r = figPlan(Object.assign({ tenues: [20], faites: [22, null, null, null] }, o || {})); expect(r.erreurs).toEqual([]); return r; };
  const dit = (r, plan, inv, re) => T.verifierPlan(plan, r.e).erreurs.some((t) => t.indexOf(inv + ' ') === 0 && (!re || re.test(t)));
  test('le plan de départ est sain et porte la carte', () => {
    expect(sain().x.carteMarche).not.toBeNull();
  });
  test('I49 — une carte en secondes sous le seuil du catalogue', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].carteMarche.tenues = [20, 19]; f.exercices[0].carteMarche.niveau = 19;
    f.exercices[0].figure.max = 19;
    expect(dit(r, f, 'I49')).toBe(true);
  });
  test('I49 — Normal : une seule séance lue ; Franc : la dernière sous le seuil', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].carteMarche.tenues = [22];
    expect(dit(r, f, 'I49', /deux séances/)).toBe(true);
    const rf = sain({ reglage: 'franc', tenues: [] }); const g = clone(rf.plan);
    g.exercices[0].carteMarche.tenues = [19]; g.exercices[0].carteMarche.niveau = 19; g.exercices[0].figure.max = 19;
    expect(dit(rf, g, 'I49')).toBe(true);
  });
  test('I49 — le seuil n’est pas celui du catalogue', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].carteMarche.seuil = 10;
    expect(dit(r, f, 'I49', /catalogue/)).toBe(true);
  });
  test('I49 — la carte sans la tenue max du jour validée', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].figure.max = null;
    expect(dit(r, f, 'I49', /tenue max du jour/)).toBe(true);
  });
  test('I49 — Franc dit « deux séances de suite » ; Normal ne le dit pas', () => {
    const rf = sain({ reglage: 'franc', tenues: [] }); const g = clone(rf.plan);
    g.exercices[0].carteMarche.titre = '22 s tenues, deux séances de suite.';
    expect(dit(rf, g, 'I49', /règle du réglage/)).toBe(true);
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].carteMarche.titre = '22 s tenues aujourd\'hui.';
    expect(dit(r, f, 'I49', /règle du réglage/)).toBe(true);
  });
  test('I49 — la carte revient après une réponse', () => {
    const r = sain(); const f = clone(r.plan);
    f.marcheReponses = { front_lever_groupe: { r: 'non', le: '2026-10-20T10:00:00Z' } };
    expect(dit(r, f, 'I49')).toBe(true);
  });
  test('I52 — une ligne de tenue en Entretenir, en Édition, sous « J’ai mal », sur une mesure en reps', () => {
    const r = sain();
    const a = clone(r.plan); a.intention = 'entretien';
    expect(dit(r, a, 'I52')).toBe(true);
    const b = clone(r.plan); b.edition = true;
    expect(dit(r, b, 'I52')).toBe(true);
    const c = clone(r.plan); c.exercices[0].mode = 'entretien';
    expect(dit(r, c, 'I52')).toBe(true);
    const d = clone(r.plan); d.exercices[0].douleur = true;
    expect(dit(r, d, 'I52')).toBe(true);
    const e = clone(r.plan); e.exercices[0].mesure = 'reps';
    expect(dit(r, e, 'I52', /secondes/)).toBe(true);
  });
  test('I52 — une ligne de tenue sans la règle ; une figure coachée sans sa règle', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].figure = null;
    expect(dit(r, f, 'I52')).toBe(true);
    const g = clone(r.plan);
    g.exercices[0].lignes.forEach((l) => { delete l.tenue; });
    g.exercices[0].figure = null;
    expect(dit(r, g, 'I52', /sans la règle des secondes \(aucune tenue max\)/)).toBe(true);
  });
  test('I13 — Entretenir : une ligne de tenue est aussi une voix du coach', () => {
    const r = sain(); const f = clone(r.plan);
    f.intention = 'entretien';
    expect(dit(r, f, 'I13')).toBe(true);
  });
  test('I53 — deux tenues max ; la tenue max n’est pas la première ligne de travail ; une chauffe tenue', () => {
    const r = sain();
    const a = clone(r.plan); a.exercices[0].lignes[1].tenue = 'max';
    expect(dit(r, a, 'I53', /2 tenues max/)).toBe(true);
    const b = clone(r.plan); b.exercices[0].lignes[0].tenue = 'tenue'; b.exercices[0].lignes[1].tenue = 'max';
    expect(dit(r, b, 'I53', /première ligne de travail/)).toBe(true);
    const c = clone(r.plan); c.exercices[0].lignes[2].tenue = null;
    expect(dit(r, c, 'I53', /n’est pas une tenue/)).toBe(true);
    const d = clone(r.plan); d.exercices[0].lignes[3].type = 'echauffement';
    expect(dit(r, d, 'I53', /est une tenue/)).toBe(true);
  });
  test('I54 — la cible recalculée sur la plus longue tenue (au lieu de la première) ; la part du mauvais réglage ; sous 2 s', () => {
    const r = sain({ faites: [22, 30, null, null] }); const f = clone(r.plan);
    f.exercices[0].lignes.forEach((l) => { if (l.tenue === 'tenue') { l.vise = 18; l.prerempli.duree_s = 18; } });
    f.exercices[0].figure.vise = 18;
    expect(dit(r, f, 'I54', /le calcul donne 13 s/)).toBe(true);
    const g = clone(r.plan); g.exercices[0].figure.part = 70;
    expect(dit(r, g, 'I54', /part 70/)).toBe(true);
    const h = clone(r.plan); h.exercices[0].figure.max = 25;
    expect(dit(r, h, 'I54', /tenue max du jour est 22 s/)).toBe(true);
  });
  test('I54 — le fantôme d’une tenue n’est pas la cible ; celui de la tenue max n’est pas le max de la dernière fois', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].lignes[2].prerempli.duree_s = 20;
    expect(dit(r, f, 'I54', /fantôme de la tenue 2/)).toBe(true);
    const g = clone(r.plan); g.exercices[0].lignes[0].prerempli.duree_s = 18;
    expect(dit(r, g, 'I54', /fantôme de la tenue max/)).toBe(true);
    const h = clone(r.plan); h.exercices[0].figure.dernier = 25;
    expect(dit(r, h, 'I54', /dernière fois/)).toBe(true);
  });
  test('I54 — avant la tenue max, une durée visée', () => {
    const r = sain({ faites: [null, null, null, null] }); const f = clone(r.plan);
    f.exercices[0].lignes[1].vise = 12;
    expect(dit(r, f, 'I54')).toBe(true);
  });
  test('I55 — un pari, une dégressive, des chauffes, une consigne sur une figure', () => {
    const r = sain();
    const a = clone(r.plan); a.exercices[0].paris = [{ x: 1 }];
    expect(dit(r, a, 'I55', /pari/)).toBe(true);
    const b = clone(r.plan); b.exercices[0].degressive = { phrase: 'x' };
    expect(dit(r, b, 'I55', /dégressive/)).toBe(true);
    const c = clone(r.plan); c.exercices[0].chauffes = { phrase: 'x' };
    expect(dit(r, c, 'I55', /chauffes/)).toBe(true);
    const d = clone(r.plan); d.exercices[0].consigne = { etat: 'x' };
    expect(dit(r, d, 'I55', /consigne/)).toBe(true);
  });
  test('I55 — la phrase n’est pas celle des faits ; deux phrases ; la marche d’en dessous sans raison', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].lignes[0].phraseApres = '22 s : 5 s de plus que la dernière fois. Tes tenues : 13 s.';
    expect(dit(r, f, 'I55', /n’est pas celle des faits/)).toBe(true);
    const g = clone(r.plan); g.exercices[0].lignes[0].phraseAvant = 'Ton max la dernière fois : 20 s. Essaie de faire mieux, proprement.';
    expect(dit(r, g, 'I55', /une seule phrase/)).toBe(true);
    const h = clone(r.plan); h.exercices[0].lignes[0].phraseApres += ' Sous 5 s, les coachs travaillent la marche d\'en dessous : X.';
    expect(dit(r, h, 'I55')).toBe(true);
    const bas = sain({ slug: 'front_lever_groupe_avance', tenues: [], faites: [4, null, null], dessous: 'Front Lever Groupé', seuil: 12 });
    const k = clone(bas.plan); k.exercices[0].lignes[0].phraseApres = '4 s aujourd\'hui. Tes tenues : 2 s.';
    expect(dit(bas, k, 'I55')).toBe(true);
  });
  test('I26 — une phrase de la tenue avec un chiffre écrit à la main', () => {
    const r = sain(); const f = clone(r.plan);
    f.exercices[0].phrases.push({ ou: 'figure.apres', texte: 'Tes tenues : 13 s.', citations: [] });
    expect(T.verifierPlan(f, r.e).erreurs.some((t) => /^I26 /.test(t))).toBe(true);
  });
});
