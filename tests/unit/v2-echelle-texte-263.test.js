// 263 — L'ÉCHELLE DE TEXTE : huit tailles (12 · 13 · 14 · 15 · 16 · 18 · 22 · 28 px) pour le texte, et les grands
// chiffres affichés (30 px et plus : chrono, records, image du mois) à part. Avant : 26 tailles, dont des demi-pixels.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const ECHELLE = [12, 13, 14, 15, 16, 18, 22, 28];

test('263 — toute taille de texte en px est sur l’échelle, ou un grand chiffre (≥ 30 px)', () => {
  const tailles = [];
  css.replace(/font-size:\s*([0-9.]+)px/g, (m, v) => { tailles.push(Number(v)); return m; });
  css.replace(/font:\s*(?:\d{3}\s+)?([0-9.]+)px/g, (m, v) => { tailles.push(Number(v)); return m; });
  expect(tailles.length).toBeGreaterThan(400);
  const hors = [...new Set(tailles.filter((t) => ECHELLE.indexOf(t) < 0 && t < 30))];
  expect(hors).toEqual([]);
});
