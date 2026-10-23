/** @jest-environment node */
//
// 134 (I-07, audit iPhone du 21/10/2026) — AUCUN CHAMP DE SAISIE SOUS 16 PX.
//
// Safari iOS zoome sur tout champ dont la police fait moins de 16 px, et ne dézoome pas à la sortie. La garde lit
// `v2/styles.css` : toute règle qui vise un champ (`input`, `textarea`, `select`, ou une classe portée par un champ)
// et y pose une taille de police doit être ≥ 16 px ou lire `--police-champ`. Et `--police-champ` vaut 16 px au moins.
// La mesure dans un navigateur, champ par champ, à 360 px, est dans la description de la PR 134.

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Les classes et identifiants posés SUR un champ (le grep de `v2/index.html` et de `v2/js/rendu.js`).
const SUR_UN_CHAMP = ['#champ-recherche-exo', '.recherche-plein', '.s-champ', '.g-champ', '.imp-zone', '.q-champ-in',
  '.el-champ-nom', '.el-champ-kg'];

function regles() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ selecteur: m[1].trim(), corps: m[2] });
  return out;
}

const visentUnChamp = (sel) => sel.split(',').some((s) => {
  const dernier = s.trim().split(/[\s>+~]+/).pop() || '';
  if (/::?placeholder|::-webkit/.test(dernier)) return false;
  return /^(input|textarea|select)\b/.test(dernier) || SUR_UN_CHAMP.some((c) => dernier.indexOf(c) >= 0);
});

function taillesPosees(corps) {
  const t = [];
  const fs1 = corps.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/g) || [];
  fs1.forEach((d) => t.push(d.replace(/^[;\s]*font-size\s*:\s*/, '').trim()));
  const fo = corps.match(/(?:^|;)\s*font\s*:\s*([^;]+)/g) || [];
  fo.forEach((d) => {
    const v = d.replace(/^[;\s]*font\s*:\s*/, '').trim();
    if (v === 'inherit') return;
    const px = v.match(/(\d+(?:\.\d+)?px|var\(--[a-z-]+\))/);
    if (px) t.push(px[1]);
  });
  return t;
}

describe('I-07 — aucun champ de saisie sous 16 px (Safari iOS)', () => {
  test('`--police-champ` vaut 16 px au moins', () => {
    const m = css.match(/--police-champ\s*:\s*(\d+(?:\.\d+)?)px/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(16);
  });

  test('une règle de base couvre tout champ sans règle propre', () => {
    expect(regles().some((r) => /^input\s*,\s*textarea\s*,\s*select$/.test(r.selecteur) &&
      /font-size\s*:\s*var\(--police-champ\)/.test(r.corps))).toBe(true);
  });

  test('⚠️ DISCRIMINANT — chaque taille posée sur un champ est ≥ 16 px ou lit `--police-champ`', () => {
    const fautes = [];
    let vues = 0;
    regles().filter((r) => visentUnChamp(r.selecteur)).forEach((r) => {
      taillesPosees(r.corps).forEach((t) => {
        vues++;
        if (t === 'var(--police-champ)' || t === 'inherit') return;
        const px = t.match(/^(\d+(?:\.\d+)?)px$/);
        if (!px || Number(px[1]) < 16) fautes.push(r.selecteur + ' → ' + t);
      });
    });
    // La garde lit vraiment quelque chose : la connexion, la carte, les champs du profil, la recherche, l'import,
    // la grille et le questionnaire posent chacun leur taille.
    expect(vues).toBeGreaterThanOrEqual(8);
    expect(fautes).toEqual([]);
  });

  test('`maximum-scale` n’est jamais ajouté (il retirerait le zoom d’accessibilité)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');
    expect(/maximum-scale|user-scalable\s*=\s*no/.test(html)).toBe(false);
  });
});
