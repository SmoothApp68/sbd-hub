/** @jest-environment node */
//
// 179 — Sécurité et vérité : ce que le coach écrit est vrai, et ce qui vit dans le plan ne se recopie pas dans l'écran.
// (La douleur de l'assistant a son fichier : `v2-assistant-douleur.test.js`.)

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

describe('179 (C-F8) — le pourcentage de la série de plus est calculé (1 série sur n de la routine)', () => {
  const carte = (n) => M.carteSerieDePlus({ palier: 100, niveau: 8 }, 4, false, [], null, n);
  test.each([[1, 100], [2, 50], [3, 33], [4, 25], [5, 20], [8, 13]])('%i série(s) de routine : %i %%', (n, pct) => {
    expect(carte(n).detail).toContain('environ ' + pct + ' % de travail en plus');
  });
  test('sans nombre de séries lu : pas de pourcentage inventé', () => {
    const d = carte(null).detail;
    expect(d).toContain('du travail en plus');
    expect(d).not.toMatch(/\d+ %/);
  });
});

describe('179 (C-F6) — « peut relancer », jamais « relance souvent »', () => {
  test('les deux détails de schéma', () => {
    expect(M.DETAIL_BORD_SCHEMA === undefined || !/souvent/.test(M.DETAIL_BORD_SCHEMA)).toBe(true);
  });
});

describe('179 (B-B4) — « Alléger N jours » vient du moteur', () => {
  test('libelleAlleger lit la constante de durée', () => {
    expect(M.libelleAlleger()).toMatch(/^Alléger \d+ jours$/);
    expect(M.libelleAlleger()).toBe('Alléger 7 jours');   // la durée vit dans le moteur (DUREE_ALLEGEE_JOURS)
  });
});

describe('179 (B-B8) — un seul prédicat « le coach se tait »', () => {
  test('profil en Entretenir : tout se tait', () => {
    expect(M.coachSeTait('entretien')).toBe(true);
    expect(M.coachSeTait('entretien', 'progresser')).toBe(true);
  });
  test('exercice en Entretenir sous un profil qui progresse : cet exercice se tait', () => {
    expect(M.coachSeTait('progresser', 'entretien')).toBe(true);
    expect(M.coachSeTait('progresser', 'progresser')).toBe(false);
    expect(M.coachSeTait('progresser')).toBe(false);
    expect(M.coachSeTait(null, null)).toBe(false);
  });
});

describe('179 (B-B1) — « muet » est une donnée du plan, pas une recherche dans le texte', () => {
  test('la source de l\'écran ne cherche plus « ne compte » dans une phrase', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(src).toMatch(/l\.muet === true/);
    expect(src).not.toMatch(/ne compte\|/);
  });
  test('le moteur dit « série d\'approche » et jamais « rampe » dans une phrase', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/moteur.js'), 'utf8');
    expect(src).toContain("série d\\'approche, ne compte pas");
    expect(src).not.toMatch(/'rampe, ne compte pas'/);
  });
});

describe('179 (D1) — « en retard » ne s\'écrit plus, le fait reste', () => {
  test('le rendu n\'écrit plus l\'étiquette', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(src).not.toMatch(/en retard sur/);
    expect(src).not.toMatch(/rl-retard/);
  });
  test('le générateur propose une priorité, sans étiquette', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/generateur.js'), 'utf8');
    expect(src).toContain('En faire une priorité ?');
    expect(src).toContain('repère de pratiquants');
    expect(src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')).not.toMatch(/en retard/);
  });
});
