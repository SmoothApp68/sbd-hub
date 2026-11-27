// 27/11/2026 — Couleurs lisibles par tous : le jade, le numéro d'une série faite, l'onglet souligné, la dégressive grise.
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const jeton = (n) => { const m = css.match(new RegExp('--' + n + ':\\s*(#[0-9A-Fa-f]{6})')); if (!m) throw new Error(n); return m[1]; };
const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Machado 2009, sévérité 1, RVB linéaire ; ΔE2000 via Lab.
const M = { deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  trit: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
const rgb = (h) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
const sim = (h, m) => { const c = rgb(h); return m ? m.map((l) => Math.min(1, Math.max(0, l[0] * c[0] + l[1] * c[1] + l[2] * c[2]))) : c; };
const lab = ([r, g, b]) => { const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116); return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
function de2000(l1, l2) { const rad = Math.PI / 180, [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; }; const h1 = hp(b1, ap1), h2 = hp(b2, ap2);
  let dh = h2 - h1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = h1 + h2; if (Cp1 * Cp2 === 0) hm = h1 + h2; else if (Math.abs(h1 - h2) <= 180) hm /= 2; else hm = (hm + (hm < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH)); }
const ecart = (a, b, m) => de2000(lab(sim(a, m)), lab(sim(b, m)));

describe('couleurs lisibles — contrastes', () => {
  const reussi = jeton('reussi'), faite = jeton('fond-serie-faite'), carte = jeton('panneau');
  test('le jade et son fond', () => {
    expect(reussi.toUpperCase()).toBe('#3DDBB4');
    expect(faite.toUpperCase()).toBe('#1B3135');
    expect(ratio(reussi, carte)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(reussi, faite)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(jeton('sur-accent'), reussi)).toBeGreaterThanOrEqual(4.5); // le numéro plein, la coche
    expect(ratio(jeton('texte-3'), faite)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(jeton('trait-controle'), faite)).toBeGreaterThanOrEqual(3);
  });
  test('l\'ambre est gardé, la dégressive est grise', () => {
    expect(jeton('accent').toUpperCase()).toBe('#FFB938');
    expect(jeton('degressive').toUpperCase()).toBe('#A9B3C1');
    expect(ratio(jeton('degressive'), carte)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('couleurs lisibles — daltonismes (ΔE2000 ≥ 15 entre « fait » et les autres sens)', () => {
  const reussi = jeton('reussi');
  ['accent', 'manque', 'chauffe', 'medaille'].forEach((autre) => {
    test('fait contre ' + autre, () => {
      const c = jeton(autre);
      [null, M.deut, M.prot, M.trit].forEach((m) => expect(ecart(reussi, c, m)).toBeGreaterThanOrEqual(15));
    });
  });
  test('la dégressive grise se sépare de l\'ambre', () => {
    [null, M.deut, M.prot, M.trit].forEach((m) => expect(ecart(jeton('degressive'), jeton('accent'), m)).toBeGreaterThanOrEqual(15));
  });
});

describe('couleurs lisibles — les repères en forme', () => {
  test('le numéro d\'une série faite redevient plein, plus précis que la règle de 265', () => {
    expect(css).toMatch(/\.bloc-seance \.serie\.fait \.no-serie:not\(\.c\):not\(\.d\)\{background:var\(--reussi\);border-color:var\(--reussi\);color:var\(--sur-accent\)\}/);
    expect(css.indexOf('.bloc-seance .serie.fait .no-serie')).toBeGreaterThan(css.indexOf('.bloc-seance .no-serie:not(.c):not(.d){'));
  });
  test('8 px avant la coche, pris sur PRÉC.', () => {
    expect(css).toMatch(/\.g-charge_reps\{grid-template-columns:30px 54px 1fr 44px 44px 48px\}/);
    expect(css).toMatch(/\.ok-serie\{width:44px;justify-self:end\}/);
  });
  test('un trait sous… au-dessus de l\'onglet actif, et le pointillé du meilleur', () => {
    expect(css).toMatch(/\.onglet\.actif\{color:var\(--accent\);background:linear-gradient\(var\(--accent\),var\(--accent\)\) no-repeat center top\/28px 3px\}/);
    expect(css).toMatch(/\.pc-meilleur\{[^}]*stroke-dasharray:5 3/);
  });
});
