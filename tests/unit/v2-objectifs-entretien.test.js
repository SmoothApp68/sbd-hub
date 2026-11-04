/** @jest-environment node */
//
// 225 (MOTEUR §9.38) — LES OBJECTIFS EN ENTRETIEN : la lecture (`Profil.objectifsDe`), l'écriture (`preparerChamps`, le CHECK de v2_129
// ne doit jamais refuser une ligne) et le générateur (force : une grosse série lourde par barre ; calisthénie : une figure ; forme : un
// cardio facile). Jamais de bloc, jamais pour le principal.
const fs = require('fs');
const path = require('path');
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Profil = require('../../v2/js/profil.js');
const G = require('../../v2/js/generateur.js');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  Object.keys(F.catalogue_ajouts).forEach((slug) => {
    const [equipement, primaires, secondaires, mouvement] = F.catalogue_ajouts[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), mouvement };
  });
  return c;
};
const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {}, jours: 3 };
const lignes = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));
const SQUAT = 'squat_barre', COUCHE = 'developpe_couche_barre';

describe('225 — Profil.objectifsDe : une seule lecture', () => {
  test('colonne absente ou illisible : aucun', () => {
    expect(Profil.objectifsDe({ objectif: 'muscle' })).toEqual([]);
    expect(Profil.objectifsDe({ objectif: 'muscle', objectifs_entretien: 'force' })).toEqual([]);
    expect(Profil.objectifsDe(null)).toEqual([]);
  });
  test('jamais le principal, jamais une valeur inconnue, trois au plus, sans doublon', () => {
    expect(Profil.objectifsDe({ objectif: 'muscle', objectifs_entretien: ['muscle', 'force', 'force', 'yoga', 'forme'] })).toEqual(['force', 'forme']);
    expect(Profil.objectifsDe({ objectif: null, objectifs_entretien: ['force', 'muscle', 'forme', 'calisthenie'] })).toEqual(['force', 'muscle', 'forme']);
  });
  test('« Force et muscle » (les_deux) couvre déjà force et muscle', () => {
    expect(Profil.objectifsDe({ objectif: 'les_deux', objectifs_entretien: ['force', 'muscle', 'forme'] })).toEqual(['forme']);
    expect(Profil.optionsEntretien({ objectif: 'les_deux' }).map((o) => o.cle)).toEqual(['forme', 'calisthenie']);
    expect(Profil.optionsEntretien({ objectif: 'force' }).map((o) => o.cle)).toEqual(['muscle', 'forme', 'calisthenie']);
  });
  test('le libellé « Force et muscle » ne change que l’affichage', () => {
    expect(Profil.OBJECTIFS.find((o) => o.cle === 'les_deux').libelle).toBe('Force et muscle');
    expect(Profil.OBJECTIFS.map((o) => o.cle)).toEqual(['force', 'muscle', 'les_deux', 'forme', 'calisthenie']);
  });
  test('basculer : ajoute, retire, plafonne à trois', () => {
    let l = Profil.basculerEntretien([], 'force', 'muscle');
    l = Profil.basculerEntretien(l, 'forme', 'muscle');
    l = Profil.basculerEntretien(l, 'calisthenie', 'muscle');
    expect(l).toEqual(['force', 'forme', 'calisthenie']);
    expect(Profil.basculerEntretien(l, 'muscle', 'muscle')).toEqual(['force', 'forme', 'calisthenie']);   // le principal ne s'entretient pas
    expect(Profil.basculerEntretien(l, 'muscle', 'les_deux')).toEqual(['forme', 'calisthenie']);        // et « Force et muscle » couvre force
    expect(Profil.basculerEntretien(l, 'forme', 'muscle')).toEqual(['force', 'calisthenie']);
  });
});

describe('225 — l’écriture ne produit jamais une ligne que le CHECK refuserait', () => {
  const quand = new Date('2026-11-04T10:00:00Z');
  test('la liste est écrite quand elle change, rien quand elle est la même', () => {
    expect(Profil.preparerChamps({ objectif: 'muscle' }, { objectifs_entretien: ['force'] }, quand).objectifs_entretien).toEqual(['force']);
    expect(Profil.preparerChamps({ objectif: 'muscle', objectifs_entretien: ['force'] }, { objectifs_entretien: ['force'] }, quand).objectifs_entretien).toBeUndefined();
  });
  test('un principal qui devient un objectif entretenu le retire de la liste, dans la même écriture', () => {
    const c = Profil.preparerChamps({ objectif: 'muscle', objectifs_entretien: ['force', 'forme'] }, { objectif: 'force' }, quand);
    expect(c.objectif).toBe('force');
    expect(c.objectifs_entretien).toEqual(['forme']);
    const d = Profil.preparerChamps({ objectif: 'muscle', objectifs_entretien: ['force', 'forme'] }, { objectif: 'les_deux' }, quand);
    expect(d.objectifs_entretien).toEqual(['forme']);
  });
  test('un principal qui change sans toucher la liste n’écrit pas la liste', () => {
    const c = Profil.preparerChamps({ objectif: 'muscle', objectifs_entretien: ['forme'] }, { objectif: 'force' }, quand);
    expect(c.objectifs_entretien).toBeUndefined();
  });
  test('champsEcrits : une liste filtrée, null accepté, un scalaire refusé', () => {
    expect(Profil.champsEcrits({ objectif: 'muscle', objectifs_entretien: ['muscle', 'force', 'x'] }).objectifs_entretien).toEqual(['force']);
    expect(Profil.champsEcrits({ objectifs_entretien: null }).objectifs_entretien).toBeNull();
    expect(Profil.champsEcrits({ objectifs_entretien: 'force' }).objectifs_entretien).toBeUndefined();
  });
});

describe('225 — le générateur : force en entretien', () => {
  const cat = catalogue();
  const avec = (o) => G.generer(cat, Object.assign({}, BASE, o));
  test('Muscle + force : UNE grosse série lourde par barre et par semaine, suivie de reculs à plus de reps', () => {
    const rs = avec({ objectif: 'muscle', objectifs_entretien: ['force'] });
    const zonees = lignes(rs).filter((l) => l.zone === 'lourd');
    expect(zonees.length).toBeGreaterThanOrEqual(1);
    const parBarre = {};
    zonees.forEach((l) => { parBarre[l.motif] = (parBarre[l.motif] || 0) + 1; expect(l.series).toBe(1); expect(l.reps).toBe(4); expect(l.reculs).toBeGreaterThanOrEqual(1); expect(l.reps_recul).toBeGreaterThan(4); });
    Object.keys(parBarre).forEach((m) => expect(parBarre[m]).toBe(1));
    zonees.forEach((l) => expect(cat[l.exercise_slug].equipement).toBe('barre'));
  });
  test('sans la préférence, le programme est celui d’avant, au champ près', () => {
    const a = avec({ objectif: 'muscle' }), b = avec({ objectif: 'muscle', objectifs_entretien: [] }), c = avec({ objectif: 'muscle', objectifs_entretien: ['muscle'] });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(lignes(a).some((l) => l.zone)).toBe(false);
  });
  test('Force et Les deux en principal ont déjà leur famille : l’entretien « force » n’y change rien', () => {
    ['force', 'les_deux'].forEach((o) => {
      expect(JSON.stringify(avec({ objectif: o, objectifs_entretien: ['force'] }))).toBe(JSON.stringify(avec({ objectif: o })));
    });
  });
  test('un débutant n’a pas de grosse série (le geste d’abord)', () => {
    expect(lignes(avec({ objectif: 'muscle', anciennete: 'moins_1_an', objectifs_entretien: ['force'] })).some((l) => l.zone)).toBe(false);
  });
  test('muscle en entretien sous un principal Force : aucune ligne ne change', () => {
    expect(JSON.stringify(avec({ objectif: 'force', objectifs_entretien: ['muscle'] }))).toBe(JSON.stringify(avec({ objectif: 'force' })));
  });
});

describe('225 — le générateur : calisthénie et forme en entretien', () => {
  const cat = Object.assign(catalogue(), {
    front_lever_groupe: { slug: 'front_lever_groupe', equipement: 'aucun', mesure: 'temps', muscles_primaires: ['grand_dorsal'], muscles_secondaires: [], echelle: 'front_lever', echelle_rang: 1, echelle_seuil_s: 8 },
    rameur: { equipement: 'machine', mesure: 'distance_temps', muscles_primaires: [], muscles_secondaires: [], nature: 'cardio' }
  });
  const avec = (o) => G.generer(cat, Object.assign({}, BASE, o));
  test('calisthénie : UNE figure, en tête de la première séance, en secondes', () => {
    const rs = avec({ objectif: 'muscle', objectifs_entretien: ['calisthenie'] });
    const figs = lignes(rs).filter((l) => l.entretien === 'calisthenie');
    expect(figs.length).toBe(1);
    expect(rs[0].exercices[0]).toBe(figs[0]);
    expect(figs[0].reps).toBeNull();
    expect(figs[0].duree_s).toBeGreaterThan(0);
    expect(figs[0].series).toBe(2);
  });
  test('calisthénie : jamais avec une zone coude ou épaule à ménager', () => {
    expect(lignes(avec({ objectif: 'muscle', menager: ['epaule'], objectifs_entretien: ['calisthenie'] })).some((l) => l.entretien)).toBe(false);
  });
  test('forme : UN cardio facile, en fin de la dernière séance', () => {
    const rs = avec({ objectif: 'muscle', objectifs_entretien: ['forme'] });
    const c = lignes(rs).filter((l) => l.entretien === 'forme');
    expect(c.length).toBe(1);
    expect(c[0].exercise_slug).toBe('rameur');
    expect(rs[rs.length - 1].exercices[rs[rs.length - 1].exercices.length - 1]).toBe(c[0]);
    expect(c[0].duree_s).toBe(900);
  });
  test('sans rameur ni vélo au catalogue : rien n’est inventé', () => {
    const sans = Object.assign({}, cat); delete sans.rameur;
    expect(lignes(G.generer(sans, Object.assign({}, BASE, { objectif: 'muscle', objectifs_entretien: ['forme'] }))).some((l) => l.entretien)).toBe(false);
  });
  test('l’objectif principal n’est jamais entretenu : forme principal + forme entretenu = le programme de forme', () => {
    expect(JSON.stringify(avec({ objectif: 'forme', objectifs_entretien: ['forme'] }))).toBe(JSON.stringify(avec({ objectif: 'forme' })));
  });
});
