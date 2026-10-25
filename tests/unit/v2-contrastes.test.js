'use strict';
// 170 — les contrastes des jetons de couleur, lus dans styles.css (aucune valeur recopiée ici).
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const racine = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));

function jeton(nom) {
  const m = racine.match(new RegExp('--' + nom + ':\\s*(#[0-9a-fA-F]{6})\\b'));
  if (!m) throw new Error('jeton introuvable : --' + nom);
  return m[1];
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const textes = ['texte', 'texte-2', 'texte-3', 'accent', 'reussi', 'manque', 'chauffe'];
const surfaces = ['fond', 'panneau', 'panneau-2'];

describe('170 — contrastes WCAG des jetons', () => {
  for (const t of textes) {
    for (const s of surfaces) {
      test('--' + t + ' sur --' + s + ' >= 4,5:1', () => {
        expect(ratio(jeton(t), jeton(s))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  test('--sur-accent sur --accent >= 4,5:1', () => {
    expect(ratio(jeton('sur-accent'), jeton('accent'))).toBeGreaterThanOrEqual(4.5);
  });
  test('les jetons des lots 2-3 sont déclarés', () => {
    expect(jeton('donnees')).toBe('#6AA8FF');
    expect(jeton('record')).toBe('#B79CFF');
    expect(racine).toMatch(/--reflet:\s*rgba\(255,255,255,\.07\)/);
  });
});
