/**
 * 210 — L'ambre (--accent) ne signale que l'action principale et l'actif : bouton principal, onglet/période actif,
 * cible du jour, records. Ce test échoue si le nombre de lignes qui lisent `var(--accent)` dépasse le plafond
 * (relevé après 210), et si les usages retirés reviennent. Ajouter un usage = justifier ici et monter le plafond.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'styles.css'), 'utf8');
const PLAFOND = 103; // relevé après 210 ; +1 en 211 : le point du « Pourquoi ? » jamais ouvert (un signal voulu)

const lignes = css.split('\n');
const usages = lignes.filter((l) => /var\(--accent\)/.test(l));

test('usages de --accent sous le plafond', () => { expect(usages.length).toBeLessThanOrEqual(PLAFOND); });

test('ni étiquettes, ni titres de section du récap, ni puces de zone à l\'ambre', () => {
  ['.fig-eti{', '.recap-groupe.coach{', '.puce-zone{', '.puce-zone.choisie{', '.puce-zone.choisie::before{'].forEach((sel) => {
    const i = css.indexOf(sel); expect(i).toBeGreaterThanOrEqual(0);
    const bloc = css.slice(i, css.indexOf('}', i));
    expect(bloc).not.toMatch(/var\(--accent\)/);
  });
});

test('un seul bouton secondaire : .btn-sec', () => {
  expect(css).toMatch(/\.btn-sec,[^{]*\{[^}]*border-radius:12px[^}]*min-height:44px/);
});
