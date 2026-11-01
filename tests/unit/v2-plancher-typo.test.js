/**
 * 209 — Plancher typographique : aucune règle `font-size` sous 12 px dans v2/styles.css, sauf liste
 * justifiée ci-dessous (vide aujourd'hui). Une exception s'écrit ici, avec sa raison.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'styles.css'), 'utf8');
const EXCEPTIONS = []; // [{ contient: 'sélecteur', raison: '…' }]

test('aucun font-size sous 12px dans styles.css', () => {
  const fautes = [];
  css.split('\n').forEach((ligne, i) => {
    const re = /font-size:\s*([0-9.]+)(px|rem)/g; let m;
    while ((m = re.exec(ligne))) {
      const px = m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
      if (px < 12 && !EXCEPTIONS.some((e) => ligne.indexOf(e.contient) >= 0)) fautes.push((i + 1) + ': ' + ligne.trim().slice(0, 100));
    }
    const sh = /font:\s*[^;}]*?\b([0-9.]+)px\//.exec(ligne);
    if (sh && parseFloat(sh[1]) < 12) fautes.push((i + 1) + ': ' + ligne.trim().slice(0, 100));
  });
  expect(fautes).toEqual([]);
});

test('« ← Retour » : un seul libellé dans index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'index.html'), 'utf8');
  const boutons = html.match(/<button id="btn-retour[^>]*>[^<]*<\/button>/g) || [];
  expect(boutons.length).toBeGreaterThan(10);
  boutons.forEach((b) => expect(b).toMatch(/>← Retour</));
});
