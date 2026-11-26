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

describe('lot 5 n° 6 (26/11/2026) — la carte du calage sans case quand la ligne 1 est une série de travail', () => {
  test('la carte ne dessine champ, « kg » et « Partir de là » que si le plan ne met pas la réponse en ligne ; la case de la ligne 1 est cernée d’ambre', () => {
    const src = lire('js/rendu.js'), css = lire('styles.css'), app = lire('js/app.js');
    expect(src).toMatch(/if \(!hab\.enLigne\) \{\s*var champ = el\('input', 'habituelle-champ'\)/);
    expect(src).toMatch(/vue\.reponseCalage\(iExo, iSerie\)\) caseSerie\.classList\.add\('reponse-calage'\)/);
    expect(css).toMatch(/\.reponse-calage\{[^}]*outline:2px solid var\(--anneau-focus\)/);
    expect(app).toMatch(/enLigne: k\.saisieEnLigne === true/);
    // l'écran ne décide rien : il lit le plan (`saisieEnLigne`, `ligne.reponseCalage`)
    expect(app).toMatch(/x\.calage\.saisieEnLigne[\s\S]{0,120}l\.reponseCalage === true|l\.reponseCalage === true/);
  });
});
