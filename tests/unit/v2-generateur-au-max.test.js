/** @jest-environment node */
//
// 193-2 (reprise, après 193-5 et 193-6) — LES RECULS À PLUS DE REPS ET LA DERNIÈRE SÉRIE « AU MAX » DU PROGRAMME CONSTRUIT.
//
// « Les deux », jours Lourd : une grosse série puis 2 reculs à plus de reps (193-5 : leur charge se cale sur le max du jour) —
// couché et militaire 1 × 4 puis 2 × 8, squat 1 × 4 puis 2 × 6, soulevé 1 × 4 puis 2 × 5. La dernière série « Au max » est posée par
// défaut là où `Moteur.auMaxDe` le dit (jamais une table en double ici) : muscle et les_deux, partout ; force, les accessoires ;
// forme et sans objectif, rien.
const fs = require('fs');
const path = require('path');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const G = require('../../v2/js/generateur.js');

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
const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const entree = (o) => Object.assign(clone(BASE), o);
const lignes = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));
const cat = catalogue();
const SQUAT = 'squat_barre', COUCHE = 'developpe_couche_barre', SOULEVE = 'souleve_de_terre_barre', MILITAIRE = 'developpe_militaire_barre';

describe('193-2 — « Les deux » : une grosse série puis 2 reculs à PLUS de reps', () => {
  const REPS_RECUL = {}; REPS_RECUL[COUCHE] = 8; REPS_RECUL[MILITAIRE] = 8; REPS_RECUL[SQUAT] = 6; REPS_RECUL[SOULEVE] = 5;
  [2, 3, 4, 5, 6].forEach((jours) => {
    test('Les deux ' + jours + ' jours : chaque grosse série est « 1 × 4 puis 2 × (8, 6, 5) », au-dessus des reps de la grosse série', () => {
      const grosses = lignes(G.generer(cat, entree({ objectif: 'les_deux', jours }))).filter((x) => x.reculs > 0);
      expect(grosses.length).toBeGreaterThan(0);
      grosses.forEach((x) => {
        expect([x.series, x.reps, x.reculs]).toEqual([1, 4, 2]);
        expect(x.reps_recul).toBe(REPS_RECUL[x.exercise_slug]);
        expect(x.reps_recul).toBeGreaterThan(x.reps);                 // la condition de 193-5 : le recul se cale sur le max du jour
      });
    });
  });
  test('l’aperçu dit « 1 × 4 · 2 reculs × 8 » (le couché), « × 6 » (le squat), « × 5 » (le soulevé)', () => {
    const rs = G.generer(cat, entree({ objectif: 'les_deux', jours: 4 }));
    const dit = (l) => l.series + ' × ' + l.reps + ' · ' + l.reculs + ' reculs × ' + l.reps_recul;
    expect(rs.map((rt) => dit(rt.exercices[0]))).toEqual(['1 × 4 · 2 reculs × 8', '1 × 4 · 2 reculs × 6',
      '1 × 4 · 2 reculs × 8', '1 × 4 · 2 reculs × 5']);
  });
});

describe('193-2 — la dernière série « Au max », posée par défaut par `Moteur.auMaxDe`', () => {
  const marquees = (rs) => lignes(rs).filter((x) => x.au_max === true);
  const decide = (x, objectif) => M.auMaxDe({ objectif, debutant: false, famille: G.familleDeBarre(x.exercise_slug, cat),
    equipement: cat[x.exercise_slug].equipement, isolation: M.estIsolation({ prim: cat[x.exercise_slug].muscles_primaires,
      sec: cat[x.exercise_slug].muscles_secondaires, stab: [] }), allegee: false, menagee: !!x.menage, douleurRecente: false,
    barreDeJambesApres: false }).pose === 'defaut';

  test('Muscle et Les deux : chaque ligne que la fonction de décision dit « Au max » porte la marque, les autres non', () => {
    ['muscle', 'les_deux'].forEach((objectif) => {
      [2, 3, 4, 5, 6].forEach((jours) => {
        const ls = lignes(G.generer(cat, entree({ objectif, jours })));
        expect(ls.length).toBeGreaterThan(0);
        ls.forEach((x) => expect(!!x.au_max).toBe(decide(x, objectif)));
        expect(ls.filter((x) => x.au_max).length).toBeGreaterThan(ls.length / 2);
      });
    });
  });
  test('Force : les barres lourdes n’ont rien, les accessoires ont la marque (réserve 1)', () => {
    const ls = lignes(G.generer(cat, entree({ objectif: 'force', jours: 4 })));
    ls.filter((x) => G.familleDeBarre(x.exercise_slug, cat) !== null).forEach((x) => expect(x.au_max).toBeUndefined());
    const acc = ls.filter((x) => G.familleDeBarre(x.exercise_slug, cat) === null);
    expect(acc.length).toBeGreaterThan(0);
    acc.forEach((x) => expect(x.au_max).toBe(true));
  });
  test('Forme, sans objectif, objectif inconnu : aucune marque, sur tous les jours et les matériels (maison sans barre comprise)', () => {
    ['forme', undefined, null, 'inconnu'].forEach((objectif) => {
      ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps', null].forEach((materiel) => {
        [2, 3, 4, 5, 6].forEach((jours) => {
          expect(marquees(G.generer(cat, entree({ objectif, materiel, jours })))).toEqual([]);
        });
      });
    });
  });
  test('Muscle sans barre (maison minimale) : seule la table décide — les accessoires à l’échec, rien de plus', () => {
    const ls = lignes(G.generer(cat, entree({ objectif: 'muscle', materiel: 'maison_minimal', jours: 3 })));
    ls.forEach((x) => expect(!!x.au_max).toBe(decide(x, 'muscle')));
  });
  test('le débutant : pas d’échec sur une barre — la fonction de décision lui met la réserve 1, la marque reste posée', () => {
    const ls = lignes(G.generer(cat, entree({ objectif: 'les_deux', jours: 3, anciennete: 'moins_1_an' })));
    expect(ls.some((x) => x.au_max === true)).toBe(true);
  });
  test('pur : deux appels, même sortie', () => {
    const e = entree({ objectif: 'les_deux', jours: 4 });
    expect(JSON.stringify(G.generer(cat, e))).toBe(JSON.stringify(G.generer(cat, e)));
  });
  test('« Je n’en veux pas » et « Remplacer » : la ligne neuve est décidée par la même fonction ; les autres lignes ne bougent pas', () => {
    const e = entree({ objectif: 'muscle', jours: 4 });
    const rs = G.generer(cat, e);
    const k = rs[0].exercices.findIndex((x) => x.role === 'I' || x.role === 'S');
    const apres = G.neVeuxPas(cat, rs, e, 0, k).routines;
    apres[0].exercices.forEach((x) => expect(!!x.au_max).toBe(decide(x, 'muscle')));
    expect(apres[1]).toEqual(rs[1]);
    const rempl = G.remplacePar(cat, rs, e, 0, k, 'curl_biceps_barre_ez');
    expect(rempl[0].exercices[k].exercise_slug).toBe('curl_biceps_barre_ez');
    expect(rempl[0].exercices[k].au_max).toBe(true);
    // Force : une barre remplacée par un accessoire prend la marque, un accessoire remplacé par une barre la perd
    const ef = entree({ objectif: 'force', jours: 3 });
    const rf = G.generer(cat, ef);
    const iAcc = rf[0].exercices.findIndex((x) => x.au_max === true);
    const vers = G.remplacePar(cat, rf, ef, 0, iAcc, COUCHE);
    expect(vers[0].exercices[iAcc].au_max).toBeUndefined();
  });
});

describe('193-2 — routineDeduite : la marque va sur la DERNIÈRE série de travail ou de recul', () => {
  const deduite = (exercices) => ({ nom: 'Séance', exercices });
  test('une grosse série et ses reculs : seul le dernier recul est « Au max »', () => {
    const r = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 1, reps: 4, reculs: 2, reps_recul: 6, au_max: true }]), { exercices: [] });
    expect(r.exercices[0].series.map((x) => x.type_serie)).toEqual(['travail', 'recul', 'recul']);
    expect(r.exercices[0].series.map((x) => !!x.au_max)).toEqual([false, false, true]);
  });
  test('des séries égales : la dernière ; sans `au_max` donné, aucune série ne porte la clé à vrai', () => {
    const avec = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 3, reps: 8, au_max: true }]), { exercices: [] });
    expect(avec.exercices[0].series.map((x) => !!x.au_max)).toEqual([false, false, true]);
    const sans = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 3, reps: 8 }]), { exercices: [] });
    expect(sans.exercices[0].series.some((x) => x.au_max === true)).toBe(false);
  });
  test('deux exercices : chacun sa dernière série', () => {
    const r = R.routineDeduite(deduite([{ exercise_slug: SQUAT, series: 2, reps: 8, au_max: true }, { exercise_slug: COUCHE, series: 2, reps: 8 }]), { exercices: [] });
    expect(r.exercices[0].series.map((x) => !!x.au_max)).toEqual([false, true]);
    expect(r.exercices[1].series.map((x) => !!x.au_max)).toEqual([false, false]);
  });
});
