/** @jest-environment node */
//
// FICHE DE SPÉCIALITÉ (26/11/2026) — `Modele.SPECIALITES` et `Modele.specialiteDe` : ce que le but d'entraînement change, à UN seul endroit.
//
// La TABLE DE VÉRITÉ ci-dessous est écrite en dur, champ par champ et clé par clé : c'est le seul endroit où vivent les littéraux (les invariants R4,
// I148, I125, I100 et I40 gardent le leur : un invariant qui lirait la table vérifierait la table avec elle-même). Les colonnes : force, muscle,
// les_deux, forme, calisthenie, sans_reponse. Pas de commentaire de mesure ici : la valeur est celle du code d'avant la fiche, à l'identique.
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
const Modele = global.THModele || require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');

const CLES = ['force', 'muscle', 'les_deux', 'forme', 'calisthenie', 'sans_reponse'];
const L = 'lourd', M = 'mix', H = 'hypertrophie';
// champ → valeurs, dans l'ordre de CLES
const VERITE = {
  'programme.gabarit': ['familles', 'standard', 'familles', 'corps_entier', 'calisthenie', 'standard'],
  'programme.reps': [[5, 7, 12], [8, 9, 12], [5, 9, 12], [9, 12, 15], [8, 9, 12], [8, 9, 12]],
  'programme.seriesPrincipal': [4, 3, 4, 3, 3, 3],
  'programme.menageLourd': [M, M, H, M, M, M],
  'programme.pause': [true, false, false, false, false, false],
  'programme.cycles': [true, false, true, false, false, false],
  'programme.ratios': [true, false, true, false, false, false],
  'programme.entretienForce': [false, true, false, false, true, true],
  'blocs.menu': ['force', 'complet', 'complet', 'force', 'force', 'force'],
  'blocs.premier': [L, M, L, M, M, M],
  'blocs.suivant': ['intensifier', 'alterner', 'intensifier', 'mix', 'intensifier', 'intensifier'],
  'blocs.grosseParDefaut': [false, false, true, false, false, false],
  'blocs.grosseSurHypProposee': [false, true, false, false, false, false],
  'mots.deForce': [true, false, true, false, false, false],
  'seance.proteger': [{ barre: 'charge', autre: 'charge' }, { barre: 'volume', autre: 'volume' }, { barre: 'charge', autre: 'volume' },
    { barre: 'rien', autre: 'rien' }, { barre: 'rien', autre: 'rien' }, { barre: 'rien', autre: 'rien' }],
  'seance.prudente': [false, false, false, true, false, false],
  'seance.protegee': [false, false, false, true, false, false],
  'chauffes.douces': [false, false, false, true, false, false],
  'habiletes': [false, false, false, false, true, false],
  'semaineDeForme': [false, false, false, true, false, false]
};
const lire = (f, chemin) => chemin.split('.').reduce((o, k) => o[k], f);

describe('la fiche : la table', () => {
  test('gelée à chaque niveau', () => {
    const geler = (o, nom) => {
      if (o === null || typeof o !== 'object') return;
      expect(Object.isFrozen(o)).toBe(true);
      Object.keys(o).forEach((k) => geler(o[k], nom + '.' + k));
    };
    geler(Modele.SPECIALITES, 'SPECIALITES');
  });
  test('six fiches, les clés attendues', () => {
    expect(Object.keys(Modele.SPECIALITES).sort()).toEqual(CLES.slice().sort());
  });
  test('les clés des cinq buts sont celles de la base (Profil.OBJECTIFS) et celles du plan (OBJECTIFS_DU_PLAN)', () => {
    const buts = CLES.filter((k) => k !== 'sans_reponse').sort();
    expect(Profil.OBJECTIFS.map((o) => o.cle).sort()).toEqual(buts);
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/plan.js'), 'utf8');
    const m = src.match(/var OBJECTIFS_DU_PLAN = \[([^\]]*)\]/);
    expect(m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort()).toEqual(buts);
  });
});

describe('la fiche : specialiteDe', () => {
  const ENTREES = [['force', 'force'], ['muscle', 'muscle'], ['les_deux', 'les_deux'], ['forme', 'forme'], ['calisthenie', 'calisthenie'],
    [null, 'sans_reponse'], [undefined, 'sans_reponse'], ['', 'sans_reponse'], ['inconnu', 'sans_reponse'], ['toString', 'sans_reponse'], ['sans_reponse', 'sans_reponse']];
  test.each(ENTREES)('%p → la fiche %p', (entree, cle) => {
    expect(Modele.specialiteDe(entree)).toBe(Modele.SPECIALITES[cle]);
  });
});

describe('la fiche : la table de vérité, champ par champ', () => {
  Object.keys(VERITE).forEach((champ) => {
    test(champ, () => {
      CLES.forEach((cle, i) => expect([champ, cle, lire(Modele.SPECIALITES[cle], champ)]).toEqual([champ, cle, VERITE[champ][i]]));
    });
  });
  test('aucun champ de la table n\'échappe à la table de vérité', () => {
    const chemins = [];
    const parcourir = (o, pre) => Object.keys(o).forEach((k) => {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'proteger') parcourir(v, pre + k + '.'); else chemins.push(pre + k);
    });
    parcourir(Modele.SPECIALITES.force, '');
    expect(chemins.sort()).toEqual(Object.keys(VERITE).sort());
  });
});

describe('la fiche : le générateur la lit', () => {
  const G = require('../../v2/js/generateur.js');
  test('Generateur.REPS reste une vue de la table', () => {
    ['force', 'muscle', 'les_deux', 'forme'].forEach((k) => expect(G.REPS[k]).toEqual(Modele.SPECIALITES[k].programme.reps));
  });
  test('la calisthénie ne lit pas programme.reps : un programme identique si le champ change', () => {
    const cat = (() => {
      const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8')), c = {};
      Object.keys(C.catalogue).forEach((s) => { const [e, p, q] = C.catalogue[s]; c[s] = { equipement: e, muscles_primaires: p.slice(), muscles_secondaires: q.slice() }; });
      return c;
    })();
    const entree = () => ({ jours: 3, objectif: 'calisthenie', materiel: 'poids_du_corps', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} });
    const avant = JSON.stringify(G.generer(cat, entree()));
    const origine = Modele.specialiteDe;
    try {
      const copie = Object.assign({}, Modele.SPECIALITES.calisthenie, { programme: Object.assign({}, Modele.SPECIALITES.calisthenie.programme, { reps: [99, 98, 97] }) });
      let appels = 0;
      Modele.specialiteDe = (o) => { if (o === 'calisthenie') appels++; return o === 'calisthenie' ? copie : origine(o); };
      expect(JSON.stringify(G.generer(cat, entree()))).toBe(avant);
      expect(appels).toBeGreaterThan(0);          // la fiche modifiée a bien été lue (le test ne passe pas à vide)
    } finally { Modele.specialiteDe = origine; }
  });
});

describe('la fiche : les blocs la lisent (PR 2)', () => {
  const Mo = require('../../v2/js/moteur.js');
  const bloc = (zone) => ({ id: 'b1', zone, semaines: 4, decharge: true, exercices: ['squat_barre'] });
  const BUTS = [['force', 0], ['muscle', 1], ['les_deux', 2], ['forme', 3], ['calisthenie', 4], [null, 5], ['', 5], ['inconnu', 5]];
  test.each(BUTS)('%p : menu, premier bloc, grosse cochée', (but, i) => {
    expect(Mo.zonesDeBloc(but).indexOf('hypertrophie') >= 0).toBe(VERITE['blocs.menu'][i] === 'complet');
    expect(Mo.zonesDeBloc(but)).toContain('lourd');
    expect(Mo.zoneDuPremierBloc(but)).toBe(VERITE['blocs.premier'][i]);
    expect(Mo.grosseSerieParDefaut(but)).toBe(VERITE['blocs.grosseParDefaut'][i]);
  });
  test.each(BUTS)('%p : le bloc suivant et la grosse série d\'un Hypertrophie proposé', (but, i) => {
    const regle = VERITE['blocs.suivant'][i];
    ['lourd', 'mix', 'hypertrophie'].forEach((z) => {
      const s = Mo.blocSuivant(bloc(z), false, but);
      const attendu = regle === 'alterner' ? (z === 'mix' ? 'hypertrophie' : 'mix') : regle === 'mix' ? 'mix' : (z === 'lourd' ? 'mix' : 'lourd');
      expect([z, s.zone]).toEqual([z, attendu]);
      expect(s.grosse === true).toBe(VERITE['blocs.grosseSurHypProposee'][i] && attendu === 'hypertrophie');
    });
  });
  test.each(BUTS)('%p : « comme le font les programmes de force » ne s\'écrit qu\'où la fiche le dit', (but, i) => {
    const k = Mo.carteFinDeBloc(bloc('hypertrophie'), { exercices: {}, paris: 0, tenus: 0 }, {}, null, false, but);
    expect(/programmes de force/.test(k.suivant)).toBe(VERITE['mots.deForce'][i]);
  });
});
