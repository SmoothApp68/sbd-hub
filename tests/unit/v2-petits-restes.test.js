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
