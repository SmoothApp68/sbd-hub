//
// Aide de fixtures — chantier 43.
//
// Depuis `v2_042_routine_sets`, un exercice de routine porte UNE LIGNE PAR
// SÉRIE PROGRAMMÉE, comme une séance. Les fixtures écrivaient un entier
// (`series: 3`) parce que c'était tout ce que la base savait dire ; elles
// décrivent maintenant des lignes.
//
// ⚠️ ELLES SONT AU VOCABULAIRE DE LA SAISIE, comme celles que `app.js` fabrique
// au chargement (`normaliserRoutine` → `Routines.enSaisie`) : `reps`, pas
// `reps_visees`. On passe donc par `enSaisie` plutôt que d'écrire les noms à la
// main — une aide de test qui recopie une correspondance finit par la
// contredire, et c'est exactement ce que `CIBLES` existe pour empêcher.
//
// ⚠️ CETTE AIDE NE FABRIQUE QUE DES SÉRIES DE TRAVAIL IDENTIQUES — c'est
// exactement ce que l'ancien entier voulait dire, et rien de plus. Une fixture
// qui a besoin d'une chauffe ou d'une dégressive les écrit à la main : c'est la
// configuration discriminante du chantier, et la cacher derrière une aide la
// rendrait invisible.
const Routines = require('../../v2/js/routines.js');

function progTravail(n, reps) {
  const lignes = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    lignes.push(Object.assign(Routines.enSaisie({
      id: 'rs-' + (i + 1),
      type_serie: 'travail',
      reps_visees: reps === undefined ? null : reps
    }), { rang: i + 1 }));
  }
  return lignes;
}

module.exports = { progTravail };
