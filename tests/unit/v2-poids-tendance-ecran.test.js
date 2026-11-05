//
// 246 (commit 4) — LA NOTE DU PARCOURS EN SÈCHE LIT LA MÊME TENDANCE.
//   · tendance → la phrase de `THPoids.phraseDeTendance` (à la place de « N pesées en huit semaines. ») ;
//   · pas de tendance, assez de pesées → « N pesées en huit semaines. » ;
//   · pas assez → « Pas assez de pesées : N en huit semaines. Une par semaine suffit. »
//   · la vue ne calcule rien : `rendu.js` ne lit pas `tendance`, `app.js` la lit.
// Environnement jsdom (PAS de docblock `node`).

const fs = require('fs');
const path = require('path');
require('../../v2/js/routeur.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/seance.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const vue = (pesees) => ({
  parcours: { exercices: [], courbes: [], zones: [], rapports: [], phrase: '', levier: null },
  nomsCourts: {}, priorites: [], phase: 'Recomposition', pesees
});
const note = (pesees) => {
  const c = document.createElement('div');
  Rendu().rendreParcours(c, vue(pesees));
  return [...c.querySelectorAll('.pc-phase .pc-note')].map((n) => n.textContent);
};

describe('246 — la note de pesées de la phase', () => {
  test('une tendance : sa phrase, et plus « N pesées en huit semaines. »', () => {
    const n = note({ nombre: 9, assez: true, tendance: '−0,4 kg par semaine en moyenne, sur les 6 dernières semaines.' });
    expect(n).toEqual(['−0,4 kg par semaine en moyenne, sur les 6 dernières semaines.']);
  });
  test('pas de tendance, assez de pesées : « N pesées en huit semaines. » (inchangé)', () => {
    expect(note({ nombre: 5, assez: true, tendance: null })).toEqual(['5 pesées en huit semaines.']);
  });
  test('pas assez de pesées : l’invitation reste (décision d’Aurélien)', () => {
    expect(note({ nombre: 2, assez: false, tendance: null }))
      .toEqual(['Pas assez de pesées : 2 en huit semaines. Une par semaine suffit.']);
  });
  test('la vue lit `Poids.tendance` dans app.js ; rendu.js ne la calcule pas', () => {
    const rendu = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    expect(rendu).not.toMatch(/\.tendance\(|moindres/);
    expect(app).toMatch(/pesees: \{ nombre: pesees, assez: pesees >= PESEES_SUFFISANTES,\s*tendance: Poids\.phraseDeTendance\(Poids\.tendance\(/);
    expect(app).toMatch(/PESEES_SUFFISANTES n'est pas une seconde tendance/);
  });
});
