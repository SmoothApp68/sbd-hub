// 19/11/2026 — la carte « Chauffe » tient sur une ligne : la raison se replie (le même texte `.pc-detail`), les gestes restent visibles.
const fs = require('fs'), path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
describe('carte « Chauffe » sur une ligne', () => {
  test('la raison se replie sous « Pourquoi cette chauffe ? », après les gestes ; les autres cartes gardent leur détail visible', () => {
    const src = lire('js/rendu.js');
    expect(src).toMatch(/resume: 'Pourquoi cette chauffe \?'/);
    expect(src).toMatch(/el\('details', 'pc-raison'\)/);
    // sans `resume`, le détail reste AVANT les gestes (reprise, au max, lest, marche… inchangés)
    expect(src).toMatch(/else if \(p\.detail\) n\.appendChild\(el\('div', 'pc-detail', p\.detail\)\)/);
    expect(src.match(/resume:/g)).toHaveLength(1);
  });
  test('la mise en page : phrase et gestes sur une ligne qui passe à la ligne, raison pleine largeur, lien de 44 px', () => {
    const css = lire('styles.css');
    expect(css).toMatch(/\.proposition-exercice\.proposition-chauffes\{display:flex;flex-wrap:wrap/);
    expect(css).toMatch(/\.proposition-chauffes \.pc-raison\{flex:1 0 100%\}/);
    expect(css).toMatch(/\.proposition-chauffes \.pc-raison summary\{[^}]*padding:12px 0;margin:-8px 0/);
  });
});
