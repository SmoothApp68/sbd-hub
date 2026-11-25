/**
 * Lot 3 (25/11/2026), changement 5 — « Terminer » aussi en bas de la liste des exercices.
 * Une action, deux boutons : celui de la barre du haut et celui du bas appellent la MÊME fonction (`terminerOuEnregistrer`), jamais
 * une copie de la logique ; le bas n'existe pas là où le haut n'existe pas (mode Modifier, « Grouper avec… ») ; il dit
 * « Enregistrer » en correction ; la réserve du bas (`.tel`, `--h-repos`) le garde au-dessus de la barre de repos.
 */
const fs = require('fs');
const path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
const APP = lire('js/app.js'), HTML = lire('index.html'), CSS = lire('styles.css');

test('le bouton du bas est dans la vue de séance, sous « Ajouter un exercice », ambre comme celui du haut', () => {
  const i = HTML.indexOf('id="btn-ajouter-exo-seance"'), j = HTML.indexOf('id="btn-terminer-bas"');
  expect(i).toBeGreaterThan(0);
  expect(j).toBeGreaterThan(i);
  expect(HTML.slice(j - 30, j + 120)).toMatch(/class="principal bloc-large">Terminer</);
  expect(HTML.indexOf('id="vue-seance"')).toBeLessThan(j);
  expect(HTML.indexOf('id="repos"')).toBeGreaterThan(j);
});
test('⚠️ les deux boutons appellent la même fonction, qui est la seule à décider (Enregistrer en correction, la feuille de fin sinon)', () => {
  expect(APP).toMatch(/surTerminer: terminerOuEnregistrer,/);
  expect(APP).toMatch(/\$\('btn-terminer-bas'\)\.addEventListener\('click', terminerOuEnregistrer\)/);
  expect(APP).toMatch(/function terminerOuEnregistrer\(\) \{ if \(enEdition\(\)\) return enregistrerEdition\(\); confirmerFin\(\); \}/);
  expect(APP.split('confirmerFin();').length - 1).toBe(1);        // un seul appel : celui de la fonction
  expect(APP.split('enregistrerEdition();').length - 1).toBe(1);
});
test('le bas se cache avec le haut (Modifier, Grouper) et dit « Enregistrer » en correction', () => {
  expect(APP).toMatch(/bas\.hidden = !!modeModifier \|\| !!selectionGroupe;/);
  expect(APP).toMatch(/bas\.textContent = enEdition\(\) \? 'Enregistrer' : 'Terminer';/);
  expect(CSS).toMatch(/#btn-terminer-bas\[hidden\]\{display:none\}/);
});
test('la réserve du bas compte la barre de repos : le bouton, au bout du défilement, reste au-dessus', () => {
  expect(CSS).toMatch(/\.tel\{padding-bottom:calc\(var\(--h-onglets, 68px\) \+ var\(--e6\) \+ var\(--h-repos, 0px\)/);
});
