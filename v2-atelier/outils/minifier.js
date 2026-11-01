#!/usr/bin/env node
// v2-atelier/outils/minifier.js — la minification au déploiement (203-2, mesure #541).
//
// POURQUOI. Mesure #541 (processeur ×4, 4G, gzip) : première visite, accueil 14,2 s -> 10,1 s (-29 %), octets
// -58 %. Le dépôt reste lisible (commentaires français compris) ; la sortie minifiée n'existe que dans la
// construction Cloudflare, EN PLACE, dans le dossier publié.
//
// CE QUE FAIT LE SCRIPT. esbuild (`minify`, sans `mangleProps` : les API `THxxx.*` se lisent entre fichiers par leur
// nom ; pas de source maps) sur v2/js/*.js et v2/styles.css. Ni vendor/ (déjà empaqueté, avec son `integrity`), ni
// service-worker.js (estamper-sw.js le lit par regex), ni index.html.
//
// ORDRE. minifier PUIS estamper : le numéro de cache porte sur les octets réellement servis. `estamper-sw.js`
// appelle ce module avant de calculer l'empreinte, donc la commande de build Cloudflare ne change pas.
//
// ÉCHEC FERMÉ. Code 1 (et rien d'écrit) si esbuild manque, si un fichier ne se minifie pas, si une sortie est
// vide. Toutes les sorties sont calculées AVANT la première écriture : jamais un dossier à moitié minifié.
// Un build en échec laisse l'ancien déploiement en ligne (CLAUDE.md §4 bis).
//
// Usage : node v2-atelier/outils/minifier.js [dossier-publié]     (défaut : v2/ à la racine du dépôt)
'use strict';

const fs = require('fs');
const path = require('path');

function chargerEsbuild() {
  try { return require('esbuild'); }
  catch (e) {
    try { return require(path.join(__dirname, '..', '..', 'node_modules', 'esbuild')); }
    catch (e2) { throw new Error("esbuild est introuvable (devDependency du package.json racine : « npm install » manque ?)"); }
  }
}

// Les fichiers à minifier du dossier publié : js/*.js et styles.css. [{ chemin, loader }]
function cibles(dossier) {
  const liste = [];
  const js = path.join(dossier, 'js');
  if (!fs.existsSync(js)) throw new Error('dossier js/ introuvable dans ' + dossier);
  fs.readdirSync(js).sort().forEach(function (f) { if (/\.js$/.test(f)) liste.push({ chemin: path.join(js, f), loader: 'js' }); });
  const css = path.join(dossier, 'styles.css');
  if (!fs.existsSync(css)) throw new Error('styles.css introuvable dans ' + dossier);
  liste.push({ chemin: css, loader: 'css' });
  if (liste.length < 2) throw new Error('aucun fichier js/ à minifier dans ' + dossier);
  return liste;
}

// Minifie EN PLACE. Rend { fichiers, avant, apres }.
function minifier(dossier) {
  const esbuild = chargerEsbuild();
  const sorties = cibles(dossier).map(function (c) {
    const src = fs.readFileSync(c.chemin, 'utf8');
    let code;
    try { code = esbuild.transformSync(src, { minify: true, loader: c.loader, legalComments: 'none', target: 'es2020' }).code; }
    catch (e) { throw new Error('minification impossible : ' + path.basename(c.chemin) + ' (' + String(e.message).split('\n')[0] + ')'); }
    if (!code || !code.trim()) throw new Error('sortie vide : ' + path.basename(c.chemin));
    if (c.loader === 'js' && /sourceMappingURL/.test(code)) throw new Error('carte source dans la sortie : ' + path.basename(c.chemin));
    return { chemin: c.chemin, src: src, code: code };
  });
  const bilan = { fichiers: sorties.length, avant: 0, apres: 0 };
  sorties.forEach(function (s) {
    fs.writeFileSync(s.chemin, s.code);
    bilan.avant += Buffer.byteLength(s.src); bilan.apres += Buffer.byteLength(s.code);
  });
  return bilan;
}

function principal(argv) {
  const dossier = path.resolve(argv[2] || path.join(__dirname, '..', '..', 'v2'));
  try {
    const b = minifier(dossier);
    console.log('Minifié : ' + b.fichiers + ' fichiers, ' + (b.avant / 1024).toFixed(0) + ' ko -> ' + (b.apres / 1024).toFixed(0) + ' ko (' + dossier + ')');
    return 0;
  } catch (e) {
    console.error('MINIFICATION IMPOSSIBLE : ' + e.message);
    return 1;
  }
}

if (require.main === module) process.exit(principal(process.argv));
module.exports = { minifier, cibles };
