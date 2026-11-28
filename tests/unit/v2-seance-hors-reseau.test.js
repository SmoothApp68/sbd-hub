//
// Sans réseau, à froid : on peut démarrer une routine (copie du téléphone) ou une séance vide.
//
// Défaut établi par lecture (28/11/2026) : les routines n'avaient aucun magasin local (`Donnees.mesRoutines` = requête directe) et
// `rendreSaisie` faisait un `return` sur l'échec AVANT la liste — « Séance vide » (branchée seulement par `rendreListeRoutines`)
// disparaissait donc aussi. On rejoue les VRAIES fonctions d'app.js (extraites) dans un bac à sable, avec le vrai `rendu.js`.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
const { bac } = require('./aide-bac-app.js');
const Routines = require('../../v2/js/routines.js');

const ligneRoutine = (id, nom) => ({ id, nom, dossier: null, rang: 1, routine_exercises: [] });

function saisie(etat) {
  document.body.innerHTML = '<div id="liste-routines"></div>';
  const demarres = [];
  const vrais = Object.assign({
    seance: null, routines: [], Routes: {}, Routeur: { SAISIE: 'saisie' },
    etatRoutines: { code: 'echec', message: 'Pas de réseau.' },
    Rendu: window.THRendu, Routines, doc: document,
    $: (id) => document.getElementById(id),
    modeModifier: false, ecranCourant: 'saisie', local: { exercices: [], seances: [] },
    demarrerSeance: (r) => { demarres.push(r); },
    demarrerRoutineParId: (id) => { demarres.push(id); },
    chargerRoutines: async () => false,
    dossiersDeProgramme: () => [], routinesDuDossier: () => [], programmeDuDossier: () => null,
    tempsDeLaRoutine: () => null, dossiersReplies: {}, brouillonLocal: null
  }, etat || {});
  const f = bac(vrais, ['rendreSaisie']);
  f.rendreSaisie();
  return { cible: document.getElementById('liste-routines'), demarres, vrais };
}
const boutons = (c) => Array.from(c.querySelectorAll('button')).map((b) => b.textContent.trim());

describe('à froid, sans réseau, sans copie locale des routines', () => {
  test('« Séance vide » reste proposée (elle ne dépend pas des routines)', () => {
    const { cible, demarres } = saisie();
    expect(boutons(cible)).toContain('Séance vide');
    Array.from(cible.querySelectorAll('button')).find((b) => /^Séance vide$/.test(b.textContent.trim())).click();
    expect(demarres).toEqual([null]);
  });
  test('le message d’échec et « Réessayer » restent', () => {
    const { cible } = saisie();
    expect(cible.textContent).toMatch(/Pas de réseau\./);
    expect(boutons(cible)).toContain('Réessayer');
  });
});

