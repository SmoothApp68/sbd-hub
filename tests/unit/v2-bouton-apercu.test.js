/** @jest-environment node */
//
// 60-5 — LE BOUTON PRINCIPAL DE L'APERÇU EST À L'AMBRE DE LA FORGE (constat d'Aurélien, sur téléphone : « Créer ces N
// routines » passait inaperçu).
//
// LA CAUSE : le bouton portait déjà `.principal` (l'ambre, les capitales condensées), mais il vit dans un
// `.feuille-menu`, dont `.feuille-menu button { background: transparent; border: none; text-align: left;
// font-family: inherit }` est PLUS SPÉCIFIQUE (une classe et un élément) que `.principal` (une classe) : il se lisait
// comme une ligne de menu. La règle ajoutée est au moins aussi spécifique, et elle ne parle que par les jetons.
//
// Le style CALCULÉ, la couleur réelle et le contraste mesuré dans la page se prouvent au banc (`seance-ecran.js`,
// « [R60] G »). Ici : la règle existe, elle l'emporte sur celle du menu, elle n'écrit aucune couleur en dur, et
// l'état « Création… » reste lisible.

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const regle = (selecteur) => {
  const i = CSS.indexOf(selecteur + '{');
  if (i < 0) return null;
  return CSS.slice(i + selecteur.length + 1, CSS.indexOf('}', i));
};

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const jeton = (nom) => new RegExp('--' + nom + ':\\s*(#[0-9a-fA-F]{6})').exec(CSS)[1];

describe('« Créer ces N routines » : l’ambre de la forge, par les jetons', () => {
  const R = regle('.feuille-menu button.principal.apercu-creer');

  test('la règle existe et son sélecteur l’emporte sur `.feuille-menu button` (3 classes + un élément contre 1 + 1)', () => {
    expect(R).not.toBeNull();
    expect(CSS).toContain('.feuille-menu button{width:100%;text-align:left');   // la règle qui aplatissait
  });

  test('⚠️ DISCRIMINANT — fond `--accent`, texte `--sur-accent`, centré, capitales condensées, 44 px — par les jetons', () => {
    expect(R).toContain('background:var(--accent)');
    expect(R).toContain('color:var(--sur-accent)');
    expect(R).toContain('border:1px solid var(--accent)');
    expect(R).toContain('text-align:center');
    expect(R).toContain('height:44px');
    expect(R).toContain('font-family:var(--pile-c)');
    expect(R).toContain('text-transform:uppercase');
  });

  test('aucune couleur recopiée dans la règle : ni hexadécimal, ni rgb()', () => {
    expect(R).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(regle('.feuille-menu button.principal.apercu-creer.inerte')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  test('le contraste du texte sur l’ambre est d’au moins 4,5:1 — les jetons eux-mêmes', () => {
    expect(contraste(jeton('sur-accent'), jeton('accent'))).toBeGreaterThanOrEqual(4.5);
  });

  test('« Création… » (désactivé) reste lisible : l’opacité de la règle `.inerte` du menu (.38) est relevée, et tient 4,5:1', () => {
    const inerte = regle('.feuille-menu button.principal.apercu-creer.inerte');
    expect(inerte).toContain('opacity:.65');
    expect(CSS).toContain('.feuille-menu button.inerte{opacity:.38}');              // ce que la règle relève
    const a = 0.65, fond = '#181b20';
    const m = (fg, bg) => '#' + [1, 3, 5].map((k) => Math.round(a * parseInt(fg.slice(k, k + 2), 16) + (1 - a) * parseInt(bg.slice(k, k + 2), 16))
      .toString(16).padStart(2, '0')).join('');
    expect(contraste(m(jeton('sur-accent'), fond), m(jeton('accent'), fond))).toBeGreaterThanOrEqual(4.5);
  });

  test('le bouton du rendu porte bien les deux classes (`principal apercu-creer`) dans un `.feuille-menu`', () => {
    const RENDU = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(RENDU).toMatch(/classe: 'principal apercu-creer'/);
  });
});
