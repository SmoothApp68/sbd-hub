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
