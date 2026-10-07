/** @jest-environment node */
//
// 60-1 — LE TEMPS (QUESTIONNAIRE-COACH-V2 §4, MOTEUR §9.18).
//
// La durée déclarée au profil (`duree_seance_min`) devient la cible proposée par
// « J'ai peu de temps » quand la routine la dépasse : « Tenir en 60 min ».
// Sinon, les deux cibles d'avant (45 et 60). Avant 60-1, la colonne n'était lue
// par rien (relevé 60-0) et les cibles étaient écrites en dur dans `app.js`.
//
// ⚠️ DEUX NIVEAUX. La règle est une fonction pure du moteur (`ciblesDeTemps`),
// éprouvée ici ; son BRANCHEMENT est dans `app.js` (`ciblesPlusCourtes`,
// `ouvrirPeuDeTemps`), qu'on extrait et qu'on exécute : un `profil` qu'on
// oublierait de passer à la règle, ou une feuille qui ne dirait pas « Tenir
// en… », échoue ici et non sur un téléphone.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const MIN = 60;
const NB = /[  ]/g;

describe('60-1 — ciblesDeTemps : la durée déclarée, sinon 45 et 60', () => {
  test('témoin : sans durée déclarée, les deux cibles d’avant, celles qui sont plus courtes que la routine', () => {
    expect(M.ciblesDeTemps(75 * MIN, null)).toEqual([{ min: 45, declaree: false }, { min: 60, declaree: false }]);
    expect(M.ciblesDeTemps(50 * MIN, null)).toEqual([{ min: 45, declaree: false }]);
    expect(M.ciblesDeTemps(40 * MIN, null)).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — la durée déclarée, plus courte que la routine, devient LA cible (à la place de 45 et 60)', () => {
    expect(M.ciblesDeTemps(75 * MIN, 60)).toEqual([{ min: 60, declaree: true }]);
    expect(M.ciblesDeTemps(75 * MIN, 30)).toEqual([{ min: 30, declaree: true }]);
    // 50 : ni 45 ni 60 d'avant — une valeur que la liste en dur ne contient pas.
    expect(M.ciblesDeTemps(90 * MIN, 50)).toEqual([{ min: 50, declaree: true }]);
  });

  test('une routine qui tient dans la durée déclarée ne propose rien de plus : les cibles d’avant', () => {
    // 90 min déclarées, routine de 75 : elle tient. Le geste reste celui d'avant.
    expect(M.ciblesDeTemps(75 * MIN, 90)).toEqual([{ min: 45, declaree: false }, { min: 60, declaree: false }]);
    // Exactement la durée de la routine : elle ne la dépasse pas.
    expect(M.ciblesDeTemps(75 * MIN, 75)).toEqual([{ min: 45, declaree: false }, { min: 60, declaree: false }]);
  });

  test('une durée qui ne tient pas n’est pas une cible : vide, texte, hors bornes de la base, pas un entier', () => {
    [undefined, null, '', 'abc', 5, 9, 301, 400, 59.5, NaN, -60, 0].forEach((v) => {
      expect(M.ciblesDeTemps(75 * MIN, v)).toEqual([{ min: 45, declaree: false }, { min: 60, declaree: false }]);
    });
    // Les bornes de `profiles_rythme_borne` (10 à 300) sont dedans.
    expect(M.ciblesDeTemps(400 * MIN, 10)).toEqual([{ min: 10, declaree: true }]);
    expect(M.ciblesDeTemps(400 * MIN, 300)).toEqual([{ min: 300, declaree: true }]);
  });

  test('une durée en texte numérique (un cache, un PostgREST) se lit comme un nombre', () => {
    expect(M.ciblesDeTemps(75 * MIN, '60')).toEqual([{ min: 60, declaree: true }]);
  });

  test('les libellés : « 45 min », et « Tenir en 60 min » pour la durée de la personne', () => {
    expect(M.libelleCibleTemps({ min: 45, declaree: false }).replace(NB, ' ')).toBe('45 min');
    expect(M.libelleCibleTemps({ min: 60, declaree: true }).replace(NB, ' ')).toBe('Tenir en 60 min');
  });

  test('les cibles par défaut sont définies une fois', () => {
    expect(Array.from(M.CIBLES_TEMPS_PAR_DEFAUT)).toEqual([45, 60]);
    expect(APP).not.toMatch(/CIBLES_TEMPS\s*=/);
  });
});

describe('60-1 — le branchement dans app.js', () => {
  const CAT = { a: { mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
                b: { mesure: 'charge_reps', muscles_primaires: ['dos'], muscles_secondaires: [] } };
  const lignes = (n, ch) => Array.from({ length: n + (ch || 0) }, (_, k) => ({ type_serie: k < (ch || 0) ? 'echauffement' : 'travail', reps: 8 }));
  const ROUTINE = { id: 'r', nom: 'Jeudi', exercices: [
    { id: 'x', exercise_slug: 'a', series: lignes(6, 3), repos_cible_s: 240, groupe_superset: null },
    { id: 'y', exercise_slug: 'b', series: lignes(6), repos_cible_s: 240, groupe_superset: null },
    { id: 'z', exercise_slug: 'b', series: lignes(5), repos_cible_s: 180, groupe_superset: null }] };
  const DUREE_S = M.dureeEstimee(M.structureDeRoutine(ROUTINE.exercices, CAT));

  function bac(profil) {
    const feuilles = [], cartes = [];
    const ctx = {
      Moteur: M, profil: profil, local: { blocs: [] }, parisEscalierConnus: () => [], finsAllegeesConnues: () => [],
      catalogueIndexe: () => CAT,
      $: () => ({}), ouvrirVoile: () => {}, fermerVoile: () => {},
      Rendu: { rendreFeuilleTemps: (cible, vue) => { feuilles.push(vue); } },
      montrerCarteRaccourci: (routine, min) => { cartes.push(min); },
      feuilles, cartes
    };
    vm.createContext(ctx);
    ['semaineAllegeeEnCours', 'ciblesPlusCourtes', 'tempsDeLaRoutine', 'ouvrirPeuDeTemps']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    return ctx;
  }

  test('prémisse : la routine du jeudi dure plus de 60 min (sinon rien ne prouve rien)', () => {
    expect(DUREE_S).toBeGreaterThan(60 * MIN);
  });

  test('⚠️ DISCRIMINANT — durée déclarée 60 : la feuille ne propose que « Tenir en 60 min »', () => {
    const c = bac({ duree_seance_min: 60 });
    c.r = ROUTINE;
    expect(vm.runInContext('tempsDeLaRoutine(r).peuDeTemps', c)).toBe(true);
    vm.runInContext('ouvrirPeuDeTemps(r)', c);
    expect(c.feuilles).toHaveLength(1);
    expect(c.feuilles[0].choix.map((x) => x.libelle.replace(NB, ' '))).toEqual(['Tenir en 60 min']);
    c.feuilles[0].choix[0].surClic();
    expect(c.cartes).toEqual([60]);
  });

  test('témoin : sans durée déclarée, la feuille propose 45 min et 60 min, comme avant', () => {
    const c = bac({ duree_seance_min: null });
    c.r = ROUTINE;
    vm.runInContext('ouvrirPeuDeTemps(r)', c);
    expect(c.feuilles[0].choix.map((x) => x.libelle.replace(NB, ' '))).toEqual(['45 min', '60 min']);
  });

  test('sans profil (pas encore chargé, hors ligne au premier démarrage) : les cibles d’avant, sans erreur', () => {
    const c = bac(null);
    c.r = ROUTINE;
    vm.runInContext('ouvrirPeuDeTemps(r)', c);
    expect(c.feuilles[0].choix).toHaveLength(2);
  });

  test('une durée déclarée plus longue que la routine : le geste reste celui d’avant', () => {
    const c = bac({ duree_seance_min: 180 });
    c.r = ROUTINE;
    vm.runInContext('ouvrirPeuDeTemps(r)', c);
    expect(c.feuilles[0].choix.map((x) => x.libelle.replace(NB, ' '))).toEqual(['45 min', '60 min']);
  });
});
