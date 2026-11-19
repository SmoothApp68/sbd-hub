#!/usr/bin/env node
// Les pages PUBLIQUES (19/11/2026) : /confidentialite, /mentions-legales, /sante — lisibles sans compte, sans JavaScript,
// à une adresse stable (demandées par Garmin Connect Developer Program et le Google Play Store).
//
// UNE SEULE SOURCE DE TEXTE : `THMentions.pages` (v2/js/mentions.js), la même que Profil › À propos. Ce script ne rédige
// rien : il met ces blocs dans une page HTML. Les fichiers générés sont COMMITÉS (v2/confidentialite.html, …) et
// `tests/unit/v2-pages-publiques.test.js` échoue s'ils ne sont plus ce que ce script produit : après tout changement de
// mentions.js, relancer `node v2-atelier/outils/pages-publiques.js`.
//
// Pourquoi des fichiers `.html` : Cloudflare Pages les sert à `/confidentialite` (le `.html` est retiré : `/x.html` → 308 → `/x`)
// AVANT la règle de repli SPA de `_redirects`. Pourquoi statique : un relecteur ou un robot lit le texte sans exécuter l'app.
// Le service worker n'est pas touché : une app INSTALLÉE ouvre sa coquille pour toute navigation (comportement inchangé) ;
// depuis l'app, ces textes s'ouvrent dans la feuille (Profil › À propos, écran de connexion).
'use strict';
const fs = require('fs');
const path = require('path');
const Mentions = require('../../v2/js/mentions.js');

const RACINE = 'https://sbd-hub.pages.dev';
// cle de THMentions.pages → adresse publique. `credits` reste dans l'app (licences, pas une politique).
const PAGES = [
  { cle: 'confidentialite', chemin: 'confidentialite', titre: 'Confidentialité' },
  { cle: 'mentions', chemin: 'mentions-legales', titre: 'Mentions légales' },
  { cle: 'sante', chemin: 'sante', titre: 'Santé' }
];

function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fabriquer(chemin) {
  const p = PAGES.filter((x) => x.chemin === chemin)[0];
  if (!p) throw new Error('page publique inconnue : ' + chemin);
  const page = Mentions.page(p.cle);
  const blocs = page.blocs.map((b) =>
    '    <div class="mentions-bloc">' + (b.titre ? '<b>' + echapper(b.titre) + '</b>' : '') + '<p>' + echapper(b.texte) + '</p></div>').join('\n');
  const autres = PAGES.map((x) => x.chemin === chemin ? '<span>' + echapper(x.titre) + '</span>'
    : '<a href="/' + x.chemin + '">' + echapper(x.titre) + '</a>').join(' · ');
  return '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="theme-color" content="#0A0C10">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; font-src \'self\'; img-src \'self\'; base-uri \'none\'; form-action \'none\'">\n' +
    '<title>' + echapper(page.titre) + ' — TrainHub</title>\n' +
    '<link rel="canonical" href="' + RACINE + '/' + p.chemin + '">\n' +
    '<link rel="icon" href="/icons/icon-192.png">\n<link rel="stylesheet" href="/styles.css">\n</head>\n' +
    '<body class="page-publique">\n<main class="page-publique-corps">\n' +
    '  <div class="entree-marque">Train<b>Hub</b></div>\n' +
    '  <h1>' + echapper(page.titre) + '</h1>\n  <div class="mentions-page">\n' + blocs + '\n  </div>\n' +
    '  <p class="page-publique-pied">' + autres + '</p>\n' +
    '  <p class="page-publique-pied"><a href="/">Ouvrir TrainHub</a></p>\n</main>\n</body>\n</html>\n';
}

if (require.main === module) {
  PAGES.forEach((p) => fs.writeFileSync(path.join(__dirname, '../../v2', p.chemin + '.html'), fabriquer(p.chemin)));
  console.log('pages publiques écrites : ' + PAGES.map((p) => p.chemin + '.html').join(', '));
}
module.exports = { fabriquer, PAGES, RACINE };
