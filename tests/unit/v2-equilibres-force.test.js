/** @jest-environment node */
//
// 193-2 (commit 6) — LES ÉQUILIBRES d'un programme de famille (188-1) : le programme que le générateur construit pour Force 4 jours et
// Les deux 4 jours, FAIT pendant 8 semaines (lundi, mardi, jeudi, vendredi), ne fait parler AUCUNE carte d'équilibre quand la personne
// n'a pas de priorité. Avec les trois barres en priorité (squat, couché, soulevé), seule la carte « priorités » parle : c'est un
// fait vrai du programme (le soulevé passe une fois, en peu de séries), la personne l'a demandé (décidé le 31/10/2026).
const fs = require('fs');
const path = require('path');
require('./helpers-equilibres.js');                        // charge les modules (TZ Europe/Paris)
const Eq = require('../../v2/js/equilibres.js');
const G = require('../../v2/js/generateur.js');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
const MOUVEMENTS = { squat_barre: 'squat', developpe_couche_barre: 'developpe_couche', souleve_de_terre_barre: 'souleve_de_terre',
  developpe_militaire_barre: 'developpe_militaire', souleve_de_terre_roumain_barre: 'jambes_tendues' };
const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), muscles_stabilisateurs: [], nom: slug,
      mouvement: MOUVEMENTS[slug] || null };
  });
  Object.keys(F.catalogue_ajouts).forEach((slug) => {
    const [equipement, primaires, secondaires, mouvement] = F.catalogue_ajouts[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), muscles_stabilisateurs: [], nom: slug,
      mouvement: MOUVEMENTS[slug] || mouvement };
  });
  return c;
};
const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const JOURS = [0, 1, 3, 4];                                // lun mar jeu ven
const iso = (w, dj) => new Date(2026, 9, 26 - 7 * w + dj, 18, 0, 0).toISOString();

// Les huit semaines du programme généré : chaque série (grosse série, reculs, séries égales) est faite, à reps égales.
function huitSemaines(rts, priorites, cat) {
  const seances = [], series = [];
  let c = 0;
  for (let w = 1; w <= 8; w++) {
    rts.forEach((rt, j) => {
      const id = 's' + (++c);
      seances.push({ id, debut: iso(w, JOURS[j]), routine_id: 'r' + j, gestes: [] });
      let rang = 0;
      rt.exercices.forEach((x) => {
        for (let i = 0; i < x.series + (x.reculs || 0); i++) {
          series.push({ id: id + x.exercise_slug + i, session_id: id, exercise_slug: x.exercise_slug, type_serie: 'travail', reps: 8,
            charge_kg: 50, douleur: false, rang: rang++ });
        }
      });
    });
  }
  const routines = rts.map((rt, j) => ({ id: 'r' + j, nom: rt.nom, jours: null, exercices: rt.exercices.map((x, i) => ({
    exercise_slug: x.exercise_slug, rang: i, series: Array.from({ length: x.series + (x.reculs || 0) }, () => ({ type_serie: 'travail' })) })) }));
  return Eq.analyser({ jour: '2026-10-26', reglage: 'franc', catalogue: cat, seances, series, routines, priorites, programmeDuCoach: true,
    seancesParSemaine: 4, volume: {}, ecartes: [], cartes: {} });
}

describe('193-2 — les équilibres d’un programme de famille, 8 semaines faites', () => {
  const cat = catalogue();
  const TROIS_BARRES = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre'];
  ['force', 'les_deux'].forEach((objectif) => {
    const rts = G.generer(cat, Object.assign({}, BASE, { objectif, jours: 4 }));

    test(objectif + ' 4 jours, sans priorité : aucune carte d’équilibre ne parle', () => {
      const r = huitSemaines(rts, [], cat);
      expect(r.cartes.map((x) => x.cle)).toEqual([]);
      expect(r.constats.filter((x) => x.parle).map((x) => x.cle)).toEqual([]);
    });

    test(objectif + ' 4 jours, les trois barres en priorité : seule la carte « priorités » parle', () => {
      const r = huitSemaines(rts, TROIS_BARRES, cat);
      expect(r.cartes.map((x) => x.cle)).toEqual(['priorites']);
    });
  });

  test('pureté : deux appels, la même sortie', () => {
    const e = Object.assign({}, BASE, { objectif: 'les_deux', jours: 4 });
    expect(JSON.stringify(G.generer(cat, JSON.parse(JSON.stringify(e))))).toBe(JSON.stringify(G.generer(cat, JSON.parse(JSON.stringify(e)))));
  });
});
