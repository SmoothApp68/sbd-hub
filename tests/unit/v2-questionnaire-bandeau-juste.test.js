/** @jest-environment node */
// Décision du 27/11/2026 (n° 59) — le bandeau « Ton questionnaire n'est pas terminé » et la ligne « Terminer mon questionnaire »
// ne s'affichent que s'il manque une réponse NÉCESSAIRE au chemin de la personne (`Questionnaire.questionnaireAAchever`).
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/poids.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
require('../../v2/js/moteur.js');
const Q = require('../../v2/js/questionnaire.js');

// Un profil au sortir du parcours court : `questionnaire_fait_le` reste vide.
const court = (plus) => Object.assign({ questionnaire_fait_le: null, anciennete: '1_a_3_ans', historique_declare: 'non_note',
  programme_choix: 'construis', seances_par_semaine: 4 }, plus || {});

describe('le bandeau ne parle que d’une réponse utile', () => {
  test('parcours court complet, sans routine : pas de bandeau (avant : toujours)', () => {
    expect(Q.questionnaireAAchever(court(), false)).toBe(false);
  });
  test('parcours court complet, « Garder ce que je fais » ou « Je crée mes routines » : pas de bandeau, les jours ne sont pas nécessaires', () => {
    expect(Q.questionnaireAAchever(court({ programme_choix: 'deduit', seances_par_semaine: null }), false)).toBe(false);
    expect(Q.questionnaireAAchever(court({ programme_choix: 'moi', seances_par_semaine: null }), false)).toBe(false);
  });
  test('débutant : « depuis quand » suffit', () => {
    expect(Q.questionnaireAAchever(court({ anciennete: null, historique_declare: 'debutant' }), false)).toBe(false);
  });
  test('compte qui a déjà ses routines : le programme n’est pas nécessaire', () => {
    expect(Q.questionnaireAAchever(court({ programme_choix: null, seances_par_semaine: null }), true)).toBe(false);
  });
  test('routines pas encore lues (null) : on ne suppose pas un programme manquant', () => {
    expect(Q.questionnaireAAchever(court({ programme_choix: null }), null)).toBe(false);
  });

  test('DISCRIMINANT — « depuis quand » manque : bandeau', () => {
    expect(Q.questionnaireAAchever({ questionnaire_fait_le: null }, false)).toBe(true);
    expect(Q.questionnaireAAchever(court({ anciennete: null, historique_declare: null }), true)).toBe(true);
  });
  test('DISCRIMINANT — « Où sont tes séances notées » manque (ni débutant ni notées) : bandeau', () => {
    expect(Q.questionnaireAAchever(court({ historique_declare: null }), false)).toBe(true);
  });
  test('DISCRIMINANT — sans routine, le programme manque : bandeau', () => {
    expect(Q.questionnaireAAchever(court({ programme_choix: null, seances_par_semaine: null }), false)).toBe(true);
  });
  test('DISCRIMINANT — « Construis-le-moi » sans jours : bandeau', () => {
    expect(Q.questionnaireAAchever(court({ seances_par_semaine: null }), false)).toBe(true);
  });

  test('questionnaire rempli ou profil inconnu : jamais de bandeau', () => {
    expect(Q.questionnaireAAchever({ questionnaire_fait_le: '2026-11-27T09:00:00.000Z' }, false)).toBe(false);
    expect(Q.questionnaireAAchever({}, false)).toBe(false);
    expect(Q.questionnaireAAchever(null, false)).toBe(false);
  });
});
