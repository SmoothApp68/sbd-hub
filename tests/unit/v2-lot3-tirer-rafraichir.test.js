/**
 * Lot 3 (25/11/2026), changement 6 — « Rafraîchir » quitte l'en-tête de Séances ; le geste « tirer vers le bas » le remplace.
 * Il n'y a pas de « ⋯ » sur cet écran : le geste est la sortie manuelle de l'état « Données locales » (jamais retirée sans être
 * remise ailleurs). Il appelle la MÊME fonction (`rafraichir`), garde un retour visible, et ne touche pas à l'état de synchronisation.
 */
const fs = require('fs');
const path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
const APP = lire('js/app.js'), HTML = lire('index.html');

test('plus de bouton « Rafraîchir » dans l\'en-tête de Séances ; l\'état et sa ligne d\'aide y sont', () => {
  expect(HTML).not.toMatch(/btn-rafraichir/);
  expect(HTML).not.toMatch(/>Rafraîchir</);
  const tete = HTML.slice(HTML.indexOf('<section id="vue-liste"'), HTML.indexOf('id="barre-seances"'));
  expect(tete).toMatch(/id="etat-sync"/);
  expect(tete).toMatch(/id="aide-tirage"[^>]*hidden>Tire la liste vers le bas pour mettre à jour\./);
  expect(tete).toMatch(/id="tirage"[^>]*hidden>/);
});
test('⚠️ l\'ancien gestionnaire est devenu `rafraichir`, mot pour mot, et le tirage l\'appelle (une seule copie)', () => {
  const i = APP.indexOf('async function rafraichir()');
  expect(i).toBeGreaterThan(0);
  const corps = APP.slice(i, APP.indexOf('\n  }\n', i));
  expect(corps).toMatch(/libelle: 'Synchronisation…'/);
  expect(corps).toMatch(/await synchroniser\(\);\s*await chargerProfil\(\);/);
  expect(corps).toMatch(/if \(vues\.questionnaire\.hidden\) afficherSemaine\(\);/);
  expect(APP.split('await synchroniser();').length - 1).toBeGreaterThanOrEqual(1);
  expect(APP).toMatch(/Promise\.resolve\(\)\.then\(rafraichir\)/);
  expect(APP.split('libelle: \'Synchronisation…\'').length - 1).toBeLessThanOrEqual(2);
});
test('le geste : en haut de page, un doigt, vers le bas, seuil de 70 px ; le retour est visible (Tire, Relâche, Mise à jour…)', () => {
  expect(APP).toMatch(/var SEUIL_TIRAGE_PX = 70;/);
  expect(APP).toMatch(/e\.touches\.length !== 1 \|\| !enHaut\(\)/);
  expect(APP).toMatch(/'Relâche pour mettre à jour' : 'Tire pour mettre à jour'/);
  expect(APP).toMatch(/montrerTirage\('Mise à jour…', 0, true\)/);
  expect(APP).toMatch(/\{ passive: false \}/);
  expect(APP).toMatch(/lectureManuelle/);
});
test('⚠️ l\'état de synchronisation dit toujours vrai : `Attente.deciderEtat` prime, la ligne d\'aide ne le remplace pas', () => {
  expect(APP).toMatch(/var decide = Attente\.deciderEtat\(etat, attente\);\s*Rendu\.rendreEtat\(noeud, decide\);/);
  expect(APP).toMatch(/aide\.hidden = !decide \|\| decide\.code === 'a-jour' \|\| decide\.code === 'sync'/);
  const sync = fs.readFileSync(path.join(__dirname, '../../v2/js/sync.js'), 'utf8');
  expect(sync).toMatch(/libelle: 'Données locales'/);     // le mot de l'état ne change pas (le changement 4 est annulé)
});
