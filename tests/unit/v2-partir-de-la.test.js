/** @jest-environment jsdom */
// 18/11/2026 — la carte « Ta charge habituelle ? » ne dit plus « Valider » : « Valider » est réservé à la série (la coche).
const fs = require('fs'), path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
describe('« Partir de là » — le bouton de la carte « Ta charge habituelle ? »', () => {
  test('le bouton de la carte porte « Partir de là », plus « Valider »', () => {
    const src = lire('js/rendu.js');
    expect(src).toMatch(/el\('button', 'principal habituelle-ok', 'Partir de là'\)/);
    expect(src).not.toMatch(/habituelle-ok', 'Valider'/);
  });
  test('le bouton garde sa largeur (le champ cède, pas le bouton)', () => {
    const css = lire('styles.css');
    expect(css).toMatch(/\.habituelle-ok\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.habituelle-champ\{[^}]*min-width:0/);
  });
});
