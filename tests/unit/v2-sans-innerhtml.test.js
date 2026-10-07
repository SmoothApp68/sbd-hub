/** @jest-environment node */
//
// 59-2 — LA GARDE CONTRE `innerHTML`.
//
// Tout le rendu de la v2 passe par `Rendu.el` (`createElement` + `textContent`)
// : un nom d'exercice, de routine, un pseudo, une note arrivent dans la page
// comme du TEXTE, jamais comme du HTML. Relevé du 07/10/2026 : aucun
// `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write` dans
// `v2/js/` ni dans `v2/index.html`.
//
// Cette garde le verrouille. Un usage n'est permis que s'il reçoit une CHAÎNE
// CONSTANTE (aucune variable), et s'il est inscrit dans `PERMIS` avec son
// fichier et sa raison. Tout autre usage fait échouer le test, avec son
// fichier et sa ligne : une donnée (de la base ou de la saisie) s'écrit en
// `textContent`.

const fs = require('fs');
const path = require('path');

const V2 = path.join(__dirname, '../../v2');

// `{ fichier, texte, raison }` — `texte` : la ligne exacte, sans les blancs du
// bord. Vide au 07/10/2026 : la v2 n'en a aucun besoin.
const PERMIS = [];

// Les commentaires deviennent des blancs ; les sauts de ligne restent (les
// numéros de ligne sont ceux de l'éditeur). Les chaînes restent telles quelles :
// c'est ce qui permet de dire si l'argument est constant.
function sansCommentaires(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else if (c === '<' && src.startsWith('<!--', i)) {
      while (i < n && !src.startsWith('-->', i)) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '   '; i += 3;
    } else if (c === '"' || c === '\'' || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; } out += src[i]; i++; }
      if (i < n) { out += q; i++; }
    } else { out += c; i++; }
  }
  return out;
}

const MOTIF = /\.\s*(innerHTML|outerHTML)\b|\binsertAdjacentHTML\s*\(|\bdocument\s*\.\s*write(ln)?\s*\(|\[\s*(['"`])(innerHTML|outerHTML)\3\s*\]/g;

function usages(nom, src) {
  const code = sansCommentaires(src);
  const lignes = code.split('\n');
  const out = [];
  lignes.forEach((l, i) => {
    if (new RegExp(MOTIF.source).test(l)) out.push({ fichier: nom, ligne: i + 1, texte: l.trim() });
  });
  return out;
}

// Une chaîne constante : après le `=` ou dans l'appel, un seul littéral sans
// `${…}` ni concaténation.
function constante(texte) {
  const m = /(?:=|\()\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)?\s*;?\s*$/.exec(texte) ||
            /(?:=|\()\s*`([^`$]*)`\s*\)?\s*;?\s*$/.exec(texte);
  return !!m;
}

function fichiers() {
  const out = fs.readdirSync(path.join(V2, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => ({ nom: 'js/' + f, src: fs.readFileSync(path.join(V2, 'js', f), 'utf8') }));
  out.push({ nom: 'index.html', src: fs.readFileSync(path.join(V2, 'index.html'), 'utf8') });
  return out;
}

describe('59-2 — aucune donnée n’entre dans la page comme du HTML', () => {
  const tous = [].concat(...fichiers().map((f) => usages(f.nom, f.src)));

  test('⚠️ tout usage de innerHTML, outerHTML, insertAdjacentHTML, document.write est sur la liste — sinon nommé ici', () => {
    const hors = tous.filter((u) => !PERMIS.some((p) => p.fichier === u.fichier && p.texte === u.texte));
    expect(hors.map((u) => u.fichier + ':' + u.ligne + ' — ' + u.texte)).toEqual([]);
  });

  test('la liste ne permet que des chaînes constantes, chacune avec sa raison, et chacune sert', () => {
    PERMIS.forEach((p) => {
      expect([p.fichier, constante(p.texte)]).toEqual([p.fichier, true]);
      expect([p.fichier, typeof p.raison === 'string' && p.raison.length > 10]).toEqual([p.fichier, true]);
      expect([p.fichier, tous.some((u) => u.fichier === p.fichier && u.texte === p.texte)]).toEqual([p.fichier, true]);
    });
  });

  test('le relevé du 07/10/2026 : zéro usage dans la v2', () => {
    expect(tous.length).toBe(0);
  });

  test('la garde voit vraiment un usage — les quatre formes —, et pas un commentaire', () => {
    const vus = (src) => usages('x.js', src).length;
    expect(vus('b.innerHTML = nom;')).toBe(1);
    expect(vus("n.outerHTML = '<b>' + x + '</b>';")).toBe(1);
    expect(vus("n.insertAdjacentHTML('beforeend', ligne);")).toBe(1);
    expect(vus('document.write(x);')).toBe(1);
    expect(vus("n['innerHTML'] = x;")).toBe(1);
    expect(vus('// b.innerHTML = nom;')).toBe(0);
    expect(vus('/* n.insertAdjacentHTML(a, b) */')).toBe(0);
    expect(vus('var t = "x.innerHTML";')).toBe(1);   // une chaîne qui le NOMME se voit aussi : prudence
    expect(constante("b.innerHTML = '';")).toBe(true);
    expect(constante("b.innerHTML = '<i>x</i>';")).toBe(true);
    expect(constante('b.innerHTML = nom;')).toBe(false);
    expect(constante("b.innerHTML = '<b>' + nom + '</b>';")).toBe(false);
    expect(constante('b.innerHTML = `<b>${nom}</b>`;')).toBe(false);
  });
});
