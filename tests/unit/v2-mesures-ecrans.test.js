//
// 119 (audit du 16/10/2026) — LES ÉCRANS QUI MONTRENT UNE DURÉE OU UNE DISTANCE : ce qui s'affiche dépend de la
// mesure. Environnement jsdom (PAS de docblock `node`) : `modele.js` et `rendu.js` se terminent par `this`.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const sommaire = (mois) => {
  const cible = document.createElement('div');
  Rendu().rendreSommaire(cible, { mois: Object.assign({ titre: 'Septembre', surChoix: () => {} }, mois),
    volume: { quand: '', zones: [] }, poids: {}, exercices: { quand: '', lignes: [] } });
  return cible.querySelector('.bloc-ligne').textContent;
};

describe('119 — F8 : le bloc du mois écoulé, sans tonnes', () => {
  test('un mois au poids du corps dit ses séries de travail, pas « Pas encore de série »', () => {
    expect(sommaire({ kg: 0, series: 24 })).toBe('24 séries de travail');
    expect(sommaire({ kg: 0, series: 1 })).toBe('1 série de travail');
  });
  test('sans série de travail (rien, ou des sorties seules) : « Pas encore de série de travail »', () => {
    expect(sommaire({ kg: 0, series: 0 })).toBe('Pas encore de série de travail');
  });
  test('avec des tonnes : les tonnes, comme avant', () => {
    expect(sommaire({ kg: 52000, series: 80 })).toMatch(/soulevées$/);
  });
});
