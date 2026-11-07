/**
 * 210 — L'ambre (--accent) ne signale que l'action principale et l'actif : bouton principal, onglet/période actif,
 * cible du jour, records. Ce test échoue si le nombre de lignes qui lisent `var(--accent)` dépasse le plafond
 * (relevé après 210), et si les usages retirés reviennent. Ajouter un usage = justifier ici et monter le plafond.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'styles.css'), 'utf8');
const PLAFOND = 108; // relevé après 210 ; +1 en 211 : le point du « Pourquoi ? » jamais ouvert (un signal voulu) ; +1 en 260-b : le jeton --anneau-focus (l'anneau de focus lit l'ambre par ce seul jeton) ; +3 en 250 (maquette notes-ia v4) : le liseré des lignes « Dans tes notes » (un même liseré pour toutes, rien de présélectionné), la coche ✓ et « Annuler » (deux actions) ; +1 en 265 (maquette séance v4) : le filet de la ligne du coach qui propose ses chauffes (sa voix, un seul liseré)

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
  // 260-c : rayon 10 (--r-bouton), 44 px, 15 px ; la règle canonique absorbe les six variantes de l'audit du 06/11.
  expect(css).toMatch(/\.btn-sec,[^{]*\{[^}]*border-radius:var\(--r-bouton\)[^}]*min-height:44px[^}]*font-size:15px/);
  const regle = css.match(/\.btn-sec,[^{]*\{/)[0];
  ['.barre-fl', '.repos-b', '.ajout-serie button', '.courbe-per-b', '.discret', '.rate-bouton'].forEach((sel) => expect(regle).toContain(sel));
});
