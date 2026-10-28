//
// 175 (commit 5) — l'espace des milliers dans les nombres que Progression affiche : « 1 265 t », pas « 1265 t ».
// L'espace fine insécable (U+202F) du formateur existant (`Modele.nombreGroupe`) ; aucun second formateur.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');
require('../../v2/js/bilan.js');

const FINE = ' ';
function sommaire(mois, zones) {
  const cible = document.createElement('div');
  window.THRendu.rendreSommaire(cible, {
    mois: Object.assign({ titre: 'Septembre', kg: 13000, series: 40, records: 14, paris: { verifies: 30, tenus: 27 }, surChoix: () => {} }, mois || {}),
    records: { dernier: null, surChoix: null },
    volume: { quand: '19-25 oct.', zones: zones || [{ libelle: 'Pectoraux', series: 12 }], surChoix: () => {} },
    poids: { resume: null, surChoix: () => {} },
    exercices: { quand: '0 exercice', lignes: [] }
  });
  return cible;
}

describe('175 — « 1 265 t » : l\'espace fine insécable des milliers', () => {
  test('les tonnes du mois : 1 265 t, le chiffre héros garde son nombre entier', () => {
    const c = sommaire({ kg: 1265000 });
    const l = c.querySelector('.bloc-heros');
    expect(l.textContent).toBe('1' + FINE + '265 t soulevées · 14 records · 27 paris tenus sur 30');
    expect(l.querySelector('.bh-premier .bh-n').textContent).toBe('1' + FINE + '265 t');
  });
  test('DISCRIMINANT — sous 1 000, rien ne change : « 13 t », « 999 t », « 7,5 t »', () => {
    expect(sommaire({ kg: 13000 }).querySelector('.bh-n').textContent).toBe('13 t');
    expect(sommaire({ kg: 999000 }).querySelector('.bh-n').textContent).toBe('999 t');
    expect(sommaire({ kg: 7500 }).querySelector('.bh-n').textContent).toBe('7,5 t');
  });
  test('les séries de travail (un mois au poids du corps), les records, les paris, le volume par muscle', () => {
    const c = sommaire({ kg: 0, series: 1234, records: 1500, paris: { verifies: 2000, tenus: 1800 } },
      [{ libelle: 'Dos', series: 1100 }]);
    expect(c.querySelector('.bloc-heros').textContent)
      .toBe('1' + FINE + '234 séries de travail · 1' + FINE + '500 records · 1' + FINE + '800 paris tenus sur 2' + FINE + '000');
    expect(c.querySelector('.bloc-zone b').textContent).toBe('1' + FINE + '100');
  });
  test('le bilan : « 1 265,3 t » passe par le même formateur', () => {
    expect(window.THBilan.tonnesDuRecap(1265300)).toBe('1' + FINE + '265,3 t');
    expect(window.THBilan.tonnesDuRecap(14200)).toBe('14,2 t');
  });
});
