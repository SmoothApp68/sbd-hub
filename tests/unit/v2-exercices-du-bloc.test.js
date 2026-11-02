// 223 — LES EXERCICES DU BLOC : la feuille « Ajuster le bloc » ne propose que les barres lourdes (+ priorités + exercices du bloc
// précédent) et coche ceux du bloc précédent. Une fonction, trois entrées (programme neuf, bloc suivant, bloc en cours).
process.env.TZ = 'Europe/Paris';
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const COUCHE = 'developpe_couche_barre', SQUAT = 'squat_barre', SOULEVE = 'souleve_de_terre_barre';
const fiche = (equipement, prim, sec) => ({ equipement, muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: [] });
const CAT = {
  [COUCHE]: fiche('barre', ['pectoraux'], ['triceps', 'deltoides_anterieurs']),
  [SQUAT]: fiche('barre', ['quadriceps', 'fessiers'], ['adducteurs']),
  [SOULEVE]: fiche('barre', ['ischio_jambiers', 'fessiers'], ['bas_du_dos']),
  tapis_roulant: fiche('machine', [], []), poulie_haute: fiche('poulie', ['grand_dorsal'], ['biceps']),
  presse_a_cuisses: fiche('machine', ['quadriceps'], ['fessiers']), planche: fiche('poids_du_corps', ['abdominaux'], []),
  curl_barre: fiche('barre', ['biceps'], []),
  curl_machine: fiche('machine', ['biceps'], [])
};
const DOSSIER = ['tapis_roulant', COUCHE, 'poulie_haute', SQUAT, 'presse_a_cuisses', SOULEVE, 'planche'];
const BLOC_LOURD = { id: 'b0', dossier: 'Sèche', zone: 'lourd', debut: '2026-09-28', semaines: 5, decharge: true,
  exercices: [COUCHE, SQUAT, SOULEVE], statut: 'en_cours' };

describe('223 — exercicesCandidatsDuBloc', () => {
  test('la fonction existe', () => { expect(typeof M.exercicesCandidatsDuBloc).toBe('function'); });
  test('le bloc suivant d’un bloc Lourd rend bien ses trois barres (la cause n’est pas là)', () => {
    expect(M.blocSuivant(BLOC_LOURD).exercices).toEqual([COUCHE, SQUAT, SOULEVE]);
    expect(M.blocSuivant(BLOC_LOURD, M.blocAPhases(BLOC_LOURD, [])).exercices).toEqual([COUCHE, SQUAT, SOULEVE]);
  });
  test('programme NEUF (aucun bloc précédent) : candidats = les barres, coches = les barres par défaut', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, []);
    expect(r.candidats).toEqual([COUCHE, SQUAT, SOULEVE]);
    expect(r.coches).toEqual([COUCHE, SQUAT, SOULEVE]);
  });
  test('BLOC SUIVANT (dossier mixte, bloc Lourd fini) : candidats = barres seules, coches = les trois du bloc précédent', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, M.blocSuivant(BLOC_LOURD).exercices);
    expect(r.candidats).toEqual([COUCHE, SQUAT, SOULEVE]);
    expect(r.coches).toEqual([COUCHE, SQUAT, SOULEVE]);
  });
  test('BLOC EN COURS : les exercices du bloc restent candidats et cochés', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, BLOC_LOURD.exercices);
    expect(r.candidats).toEqual([COUCHE, SQUAT, SOULEVE]);
    expect(r.coches).toEqual([COUCHE, SQUAT, SOULEVE]);
  });
  test('un exercice du bloc précédent hors barre reste candidat et coché, à sa place dans le dossier', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, [COUCHE, 'presse_a_cuisses']);
    expect(r.candidats).toEqual([COUCHE, SQUAT, 'presse_a_cuisses', SOULEVE]);
    expect(r.coches).toEqual([COUCHE, 'presse_a_cuisses']);
  });
  test('un exercice du bloc précédent sorti du dossier reste candidat (à la fin) et coché', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, [COUCHE, 'curl_machine']);
    expect(r.candidats).toEqual([COUCHE, SQUAT, SOULEVE, 'curl_machine']);
    expect(r.coches).toEqual([COUCHE, 'curl_machine']);
  });
  test('une priorité du questionnaire hors barre est candidate et cochée par défaut', () => {
    const r = M.exercicesCandidatsDuBloc(DOSSIER, CAT, ['presse_a_cuisses', 'zone_lourd'], []);
    expect(r.candidats).toEqual([COUCHE, SQUAT, 'presse_a_cuisses', SOULEVE]);
    expect(r.coches).toEqual([COUCHE, SQUAT, 'presse_a_cuisses', SOULEVE]);
  });
  test('un bloc précédent sans exercices retombe sur les barres par défaut (jamais une feuille sans coche)', () => {
    expect(M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, []).coches).toEqual([COUCHE, SQUAT, SOULEVE]);
    expect(M.exercicesCandidatsDuBloc(DOSSIER, CAT, null, undefined).coches).toEqual([COUCHE, SQUAT, SOULEVE]);
  });
  test('une barre d’isolation est proposée mais jamais cochée par défaut ; la machine ne l’est pas', () => {
    const r = M.exercicesCandidatsDuBloc(['curl_barre', 'curl_machine', COUCHE], CAT, null, []);
    expect(r.candidats).toEqual(['curl_barre', COUCHE]);
    expect(r.coches).toEqual([COUCHE]);
  });
  test('un dossier sans barre : aucun candidat, rien de coché, pas d’exception', () => {
    expect(M.exercicesCandidatsDuBloc(['tapis_roulant', 'planche'], CAT, null, [])).toEqual({ candidats: [], coches: [] });
    expect(M.exercicesCandidatsDuBloc(null, null, null, null)).toEqual({ candidats: [], coches: [] });
  });
});
