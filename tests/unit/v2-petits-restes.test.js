/**
 * @jest-environment node
 */
// 144 — les petits restes : un test par point, dans l'ordre du prompt.
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..', '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

describe('144-1 — le nom du produit', () => {
  test('l\'onglet dit « TrainHub », le manifeste aussi', () => {
    expect(lire('v2/index.html')).toMatch(/<title>TrainHub<\/title>/);
    const m = JSON.parse(lire('v2/manifest.webmanifest'));
    expect(m.name).toBe('TrainHub');
    expect(m.short_name).toBe('TrainHub');
  });
  test('CLAUDE.md nomme la cible iPhone', () => {
    expect(lire('CLAUDE.md')).toMatch(/Android Chrome et iPhone \(Safari, écran d'accueil\)/);
  });
});

describe('144-2 — la durée d\'une séance va jusqu\'à 300 min', () => {
  const Profil = require('../../v2/js/profil.js');
  test('210, 240 et 300 sont proposées, dans l\'ordre, dans la borne de la base', () => {
    [210, 240, 300].forEach((d) => expect(Profil.DUREES).toContain(d));
    expect(Profil.DUREES.slice().sort((a, b) => a - b)).toEqual(Profil.DUREES);
    expect(Math.max.apply(null, Profil.DUREES)).toBe(Profil.DUREE_MAX);
  });
});
