//
// v2 — F6 (27/11/2026) : le résumé « Mon programme » du Profil.
// « Pas encore lu » (null) n'est pas « zéro » : tant que la bibliothèque n'est pas lue, aucune phrase ; « Aucune routine »
// est réservé au vrai zéro.
//
require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
const { profilEcran } = require('./aide-profil-ecran.js');

const programme = (routines) => Profil.resumesDesGroupes({}, { routines })['Mon programme'];

describe('résumé « Mon programme » (F6)', () => {
  test('routines inconnues (null) : aucune phrase', () => {
    expect(programme(null)).toBe('');
  });
  test('routines non fournies (undefined) : aucune phrase non plus', () => {
    expect(programme(undefined)).toBe('');
  });
  test('un vrai zéro : « Aucune routine »', () => {
    expect(programme(0)).toBe('Aucune routine');
  });
  test('une routine, plusieurs routines', () => {
    expect(programme(1)).toBe('1 routine');
    expect(programme(4)).toBe('4 routines');
  });

  // Le vrai `rendreProfilEcran` : avant la lecture (`etatRoutines.code === 'jamais'`), la ligne n'a aucune phrase.
  test('rendu : bibliothèque pas encore lue → pas de « Aucune routine » ; lue et vide → « Aucune routine »', () => {
    expect(profilEcran({}, { etatRoutines: 'jamais' }).vue.resumes['Mon programme']).toBe('');
    expect(profilEcran({}, { etatRoutines: 'charge' }).vue.resumes['Mon programme']).toBe('');
    expect(profilEcran({}, { etatRoutines: 'echec' }).vue.resumes['Mon programme']).toBe('');
    expect(profilEcran({}, { etatRoutines: 'ok' }).vue.resumes['Mon programme']).toBe('Aucune routine');
  });
});
