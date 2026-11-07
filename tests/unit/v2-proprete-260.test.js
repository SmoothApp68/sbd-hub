/**
 * 260 — Propreté, lot 2 (visible, sûr) : cibles à 44 px, contour des contrôles à 3:1, anneau de focus, un seul bouton
 * secondaire, jetons fusionnés. Lit v2/styles.css et v2/js/rendu.js : ce que l'audit du 06/11 a mesuré ne revient pas.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'styles.css'), 'utf8');
const rendu = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'js', 'rendu.js'), 'utf8');

const jeton = (nom) => { const m = css.match(new RegExp('--' + nom + ':\\s*(#[0-9A-Fa-f]{6})')); if (!m) throw new Error('jeton ' + nom); return m[1]; };
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const regle = (sel) => { const i = css.indexOf('\n' + sel + '{'); if (i < 0) throw new Error('règle ' + sel); return css.slice(i, css.indexOf('}', i)); };

describe('260-b — le contour d\'un contrôle tient 3:1 (WCAG 1.4.11)', () => {
  test('--trait-controle contre la surface 2, la carte, le fond et une série faite', () => {
    const c = jeton('trait-controle');
    ['panneau-2', 'panneau', 'fond'].forEach((s) => expect(contraste(c, jeton(s))).toBeGreaterThanOrEqual(3));
    expect(contraste(c, '#1D312F')).toBeGreaterThanOrEqual(3);
  });
  test('les contours des numéros de chauffe et de calage aussi (carte)', () => {
    ['trait-chauffe', 'trait-calage'].forEach((t) => expect(contraste(jeton(t), jeton('panneau'))).toBeGreaterThanOrEqual(3));
  });
  test('boutons, champs et cases lisent --trait-controle à la place du filet', () => {
    expect(css).toMatch(/button:not\([^)]*\),\s*input,select,textarea,\.ch-serie,\.rp-serie,\.eff-serie\{\s*--trait:var\(--trait-controle\)/);
  });
  test('un anneau de focus visible sur les boutons, champs et résumés, et sur la case de saisie', () => {
    expect(css).toMatch(/:is\(button,input,select,textarea,summary[^)]*\)[^{]*:focus-visible[^{]*\{outline:2px solid var\(--anneau-focus\)/);
    expect(css).toMatch(/\.ch-serie:has\(input:focus-visible\)[^{]*\{outline:2px solid var\(--anneau-focus\)/);
  });
});

describe('260-a — cibles de toucher à 44 px', () => {
  test('la grille de saisie : numéro, champs, effort, coche, « + Série », bouton principal', () => {
    ['.no-serie', '.ch-serie,.rp-serie', '.eff-serie', '.ok-serie'].forEach((sel) => expect(regle(sel)).toMatch(/height:44px/));
    expect(regle('.ajout-serie button')).toMatch(/height:44px/);
    expect(regle('.principal')).toMatch(/height:44px/);
    expect(css).toMatch(/\.g-charge_reps\{grid-template-columns:30px 58px 1fr 44px 44px 44px;column-gap:8px\}/);
  });
  test('les points de la courbe : un disque de toucher d\'au moins 44 px une fois la courbe à 360 px', () => {
    const r = Number((rendu.match(/'courbe-cible', \{ cx: p\.x, cy: p\.y, r: (\d+)/) || [])[1]);
    expect(r).toBeGreaterThanOrEqual(25);
  });
  test('les liens de séance de l\'Historique et les sous-onglets', () => {
    expect(regle('.exo-jour-s')).toMatch(/padding:14px 0;margin:-14px 0/);
    expect(regle('.sous-onglet')).toMatch(/min-height:44px/);
  });
});

describe('260-d — un jeton par rôle', () => {
  test('les jetons fusionnés ne reviennent pas', () => {
    ['trait-selection', 'trait-choisi', 'reflet-haut', 'jauge', 'molette-eteint', 'trait-focus', 'filet-liste', 'filet-question', 'radar-axe',
      'radar-grille', 'sync-a-jour', 'presence', 'accent-fond-choisi', 'accent-fond-levier', 'eq-barre-b', 'bh-contour', 'precedent']
      .forEach((t) => expect(css).not.toMatch(new RegExp('--' + t + '\\b(?!-)')));
  });
  test('le vert d\'une série faite : une seule valeur, posée en dur (--reussi à 11 % sur --panneau)', () => {
    expect(css).toMatch(/--fond-serie-faite:#1D312F;/);
    expect(css).not.toMatch(/--fond-serie-faite:color-mix/);
  });
});
