/** @jest-environment node */
//
// 245 (F3) — L'ÉCHELLE DES POMPES ET LES TENUES DE STREET (MOTEUR §9.17 bis, §9.35, I133).
//   (a) le diamant et la prise serrée entrent dans l'échelle, jamais proposés sur une zone coude à ménager ;
//   (b) depuis une aide, 0 rep stricte au premier essai : la marche d'en dessous tout de suite ;
//   (c) une tenue (mesure `temps`) n'est jamais la marche suivante ni celle d'en dessous d'un exercice en reps.

process.env.TZ = 'Europe/Paris';
global.self = global;

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const G = require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');
const S = require('../../v2/js/seance.js');

const esp = (x) => String(x || '').replace(/[  ]/g, ' ');
const ex = (slug, rang, extra) => Object.assign({ slug, nom: slug, echelle: 'pompes', echelle_rang: rang, mesure: 'reps', charge: 'aucune', nature: 'force' }, extra || {});
// L'échelle future (migration de Claude.ai) : pompes au rang 3, déclinées et lestées au 4, prise serrée au 4, diamant au 5, archer au 6.
const INDEX = {
  pompes: ex('pompes', 3),
  pompes_declinees: ex('pompes_declinees', 4),
  pompes_prise_serree: ex('pompes_prise_serree', 4),
  pompes_diamant: ex('pompes_diamant', 5),
  pompes_archer: ex('pompes_archer', 6, { nature: 'habilete' }),
  // Les dips : une tenue au rang 1 (soutien), des reps ensuite.
  dips_torse: ex('dips_torse', 2, { echelle: 'dips_torse' }),
  dips_assistes: ex('dips_assistes', 1, { echelle: 'dips_torse', charge: 'assistance' }),
  soutien_barres_paralleles: ex('soutien_barres_paralleles', 1, { echelle: 'dips_torse', mesure: 'temps' })
};
const coude = (s) => s === 'pompes_diamant' || s === 'pompes_prise_serree';

describe('245 F3 (a) — prise serrée et diamant dans l’échelle des pompes', () => {
  test('la marche suivante des pompes : le rang 4 (déclinées et prise serrée), puis le diamant au rang 5', () => {
    expect(Mo.marcheSuivante(INDEX, 'pompes').cible.sort()).toEqual(['pompes_declinees', 'pompes_prise_serree']);
    expect(Mo.marcheSuivante(INDEX, 'pompes_declinees').cible).toEqual(['pompes_diamant']);
  });
  test('DISCRIMINANT — un coude à ménager : ni le diamant, ni la prise serrée ne sont proposés', () => {
    expect(Mo.marcheSuivante(INDEX, 'pompes_declinees', { ecartee: coude })).toBeNull();
    expect(Mo.marcheSuivante(INDEX, 'pompes', { ecartee: coude }).cible).toEqual(['pompes_declinees']);
  });
  test('I133 : sur tout l’index, aucune marche écartée ni d’une autre mesure', () => {
    expect(Mo.verifierI133(INDEX, { ecartee: coude })).toEqual([]);
  });
});

describe('245 F3 (a) — seul le COUDE écarte une marche, et seulement le motif triceps (05/11/2026)', () => {
  const ecartee = (zones) => (slug) => G.zonesQuiEcartentLaMarche(slug, zones).length > 0;
  test('DISCRIMINANT — coude à ménager : le diamant et la prise serrée sont écartés', () => {
    expect(ecartee(['coude'])('pompes_diamant')).toBe(true);
    expect(ecartee(['coude'])('pompes_prise_serree')).toBe(true);
    expect(Mo.marcheSuivante(INDEX, 'pompes_declinees', { ecartee: ecartee(['coude']) })).toBeNull();
  });
  test('DISCRIMINANT — dos à ménager : les tractions assistées restent proposées (aucune autre zone n’écarte de marche)', () => {
    const idx = {
      tractions_assistees: ex('tractions_assistees', 1, { echelle: 'tractions', charge: 'assistance' }),
      tractions: ex('tractions', 2, { echelle: 'tractions' })
    };
    ['dos', 'epaule', 'genou', 'hanche'].forEach((z) => {
      expect(ecartee([z])('tractions')).toBe(false);
      expect(ecartee([z])('pompes_diamant')).toBe(false);
      expect(Mo.marcheSuivante(idx, 'tractions_assistees', { ecartee: ecartee([z]) }).cible).toEqual(['tractions']);
    });
  });
  test('coude à ménager : un exercice hors du motif triceps (un curl) n’écarte pas de marche', () => {
    expect(ecartee(['coude'])('pompes')).toBe(false);
  });
});

describe('245 F3 (c) — une tenue n’est jamais proposée à un exercice en reps', () => {
  test('DISCRIMINANT — depuis une aide, la marche suivante des dips assistés est la stricte (jamais le soutien)', () => {
    expect(Mo.marcheSuivante(INDEX, 'dips_assistes').cible).toEqual(['dips_torse']);
  });
  test('DISCRIMINANT — la marche d’en dessous des dips n’est pas le soutien (une tenue)', () => {
    expect(Mo.marcheDEnDessous(INDEX, 'dips_torse').slug).toBe('dips_assistes');
    const sans = Object.assign({}, INDEX); delete sans.dips_assistes;
    expect(Mo.marcheDEnDessous(sans, 'dips_torse')).toBeNull();
  });
  test('un exercice en secondes garde ses propres marches (les figures)', () => {
    const fig = { a: ex('a', 1, { echelle: 'f', mesure: 'temps' }), b: ex('b', 2, { echelle: 'f', mesure: 'temps' }) };
    expect(Mo.marcheSuivante(fig, 'a').cible).toEqual(['b']);
    expect(Mo.marcheDEnDessous(fig, 'b').slug).toBe('a');
  });
  test('I133 — sur un index SANS marche assistée, le soutien (une tenue) n’est ni suivant ni « en dessous » des dips', () => {
    const sans = Object.assign({}, INDEX); delete sans.dips_assistes;
    expect(Mo.verifierI133(sans, { ecartee: coude })).toEqual([]);
    expect(Mo.marcheDEnDessous(sans, 'dips_torse')).toBeNull();
    // une tenue au-dessus d'une marche en reps : jamais la suivante
    const haut = { a: ex('a', 1, { echelle: 'e' }), t: ex('t', 2, { echelle: 'e', mesure: 'temps' }) };
    expect(Mo.marcheSuivante(haut, 'a')).toBeNull();
    expect(Mo.verifierI133(haut)).toEqual([]);
  });
  test('I133 attrape une marche de mesure différente', () => {
    const forge = Object.assign({}, INDEX, { dips_torse: ex('dips_torse', 2, { echelle: 'dips_torse', mesure: 'temps' }) });
    // la stricte en secondes, ses voisins en reps : la fonction ne les croise plus ; l'index forgé reste cohérent.
    expect(Mo.verifierI133(forge)).toEqual([]);
    expect(Mo.memeMesure(INDEX.dips_torse, INDEX.soutien_barres_paralleles)).toBe(false);
  });
});

describe('245 F3 (b) — depuis une aide, 0 rep stricte au premier essai : la marche d’en dessous tout de suite', () => {
  const SLUG = 'tractions';
  const FIN = '2026-10-21T10:00:00+00:00';
  let n = 0;
  const bw = (reps) => ({ id: 'b' + (++n), rang: n, charge_kg: null, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: SLUG });
  const OPTG = { mesure: 'reps', equipement: 'poids_du_corps', intention: 'progresser', reglage: 'franc', edition: false, salle: null };
  function planDe(premier, marches) {
    const g = [{ seance: { id: 'G0', debut: '2026-10-14T18:00:00+00:00' }, series: [bw(0), bw(0)] }];
    const c = M.consigneDExercice(g, undefined, FIN, OPTG);
    c.compteur = c.compteur || { compteur: 0, meilleur: { palier: 0, niveau: 0 }, blocages: [] };
    let q = 0;
    const id = () => 's' + (++q);
    const se = S.ajouterExercice(S.creer({ id: 'S1', userId: 'u', idSerie: id }), SLUG, id, { series: 3 });
    const e = {
      seance: { id: 'S1', debut: FIN, edition: false, exercices: se.exercices },
      consignes: { [SLUG]: c },
      catalogue: { [SLUG]: { equipement: 'poids_du_corps', nom: 'Tractions', muscles_primaires: ['dos'], muscles_secondaires: [],
        muscles_stabilisateurs: [], mesure: 'reps' } },
      reglage: 'franc', paris: [], suites: {}, phase: 'maintien', debutant: false,
      volume: { dos: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } },
      escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { [SLUG]: 3 }, marches: marches || [], remplacants: {},
        dessous: { [SLUG]: { slug: 'tractions_assistees', nom: 'Tractions assistées' } }, premierEssai: premier ? { [SLUG]: true } : {} }
    };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0] };
  }
  test('DISCRIMINANT — premier essai raté à 0 : la carte de la marche d’en dessous, d’emblée, et les invariants tiennent', () => {
    const { p, e, x } = planDe(true);
    expect(x.escalier).toMatchObject({ marche: M.MARCHE_DESSOUS, compteur: 0, declenchement: true, premierEssai: true,
      dessous: { slug: 'tractions_assistees', nom: 'Tractions assistées' } });
    expect(esp(x.escalier.carte.phrase)).toBe('Pas une rep sans aide, au premier essai.');
    expect(x.escalier.carte.cible).toBe('tractions_assistees');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('sans le fait (plusieurs essais, ou pas venu d’une aide) : aucune carte', () => {
    expect(planDe(false).x.escalier).toBeFalsy();
  });
  test('une marche déjà proposée à cet exercice ne revient pas', () => {
    const deja = [{ exercice: SLUG, marche: M.MARCHE_DESSOUS, seance: 'AUTRE', reponse: 'refusee', jour: '2026-10-18' }];
    expect(planDe(true, deja).x.escalier).toBeFalsy();
  });
});
