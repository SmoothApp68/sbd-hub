// 19/11/2026 — zones de toucher de 44 px : le dessin ne change pas, la zone de toucher grandit.
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
describe('zones de toucher de 44 px (friction n° 6)', () => {
  test('les pastilles et le rond « ＋ » gardent leur dessin et gagnent une zone invisible', () => {
    expect(css).toMatch(/\.s-onglet,\.s-plus\{position:relative\}/);
    expect(css).toMatch(/\.s-onglet::after\{content:"";position:absolute;inset:-8px -2px\}/);
    expect(css).toMatch(/\.s-plus::after\{content:"";position:absolute;inset:-4px\}/);
    // 28 + 2 × 8 = 44 ; 36 + 2 × 4 = 44
    expect(css).toMatch(/\.s-plus\{width:36px;height:36px/);
  });
  test('les lignes-liens et « Détail » prennent leur minimum de 44 px', () => {
    expect(css).toMatch(/\.coach-lien\{min-width:44px\}/);
    expect(css).toMatch(/\.dossier-tete,\.dossier-badge,\.demarrer,\.j-porte\{min-height:44px\}/);
  });
});
