//
// 273 (social 3) — l'ÉCRAN : l'aperçu avant d'enregistrer
// (nom, liste, « Pas dans ta salle : … » + « Changer », l'aide, « Enregistrer la routine »). Environnement jsdom.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/social.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const apercu = (extra) => {
  const cible = document.createElement('div');
  Rendu().rendreApercuRoutine(cible, Object.assign({ nom: 'Haut du corps (Léa)', dossier: null, erreur: '', titre: 'En faire une routine',
    aide: 'Tu pourras tout modifier ensuite, comme toute routine.', libelleCreer: 'Enregistrer la routine',
    lignes: [{ nom: 'Squat', series: [{ type_serie: 'travail', reps_visees: 5 }], repos: 180, origine: 'par défaut' },
      { nom: 'Curl', series: [{ type_serie: 'travail', reps_visees: 10 }], repos: 90, origine: 'par défaut', manque: 'haltères', surChanger: () => {} }],
    surNom: () => {}, surDossier: () => {}, surCreer: () => {}, surAnnuler: () => {} }, extra || {}));
  return cible;
};

describe('l\'aperçu de la routine d\'un mutuel', () => {
  test('le titre, l\'aide et le bouton disent la même chose que la maquette', () => {
    const c = apercu();
    expect(c.querySelector('.feuille-t').textContent).toBe('En faire une routine');
    expect(c.querySelector('.feuille-aide').textContent).toBe('Tu pourras tout modifier ensuite, comme toute routine.');
    expect(c.textContent).toContain('Enregistrer la routine');
    expect(c.textContent).not.toContain('Créer la routine');
  });
  test('un exercice absent de ma salle est signalé sous son nom, avec « Changer » ; les autres non', () => {
    const c = apercu();
    const m = c.querySelectorAll('.apercu-manque');
    expect(m).toHaveLength(1);
    expect(m[0].textContent).toBe('Pas dans ta salle : haltèresChanger');
  });
  test('l\'aperçu d\'une séance à moi reste celui d\'avant', () => {
    const c = apercu({ titre: undefined, aide: undefined, libelleCreer: undefined, lignes: [] });
    expect(c.querySelector('.feuille-t').textContent).toBe('Nouvelle routine : aperçu');
    expect(c.textContent).toContain('Créer la routine');
  });
});
