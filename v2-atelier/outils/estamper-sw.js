#!/usr/bin/env node
// v2-atelier/outils/estamper-sw.js — le numéro de cache fabriqué au déploiement (178, diagnostic 172).
//
// POURQUOI. `CACHE_V2` (v2/service-worker.js) est le nom sous lequel la coquille (`SHELL`) est mise en cache. Une
// nouvelle version de la coquille n'arrive chez l'utilisateur que si les OCTETS de service-worker.js changent
// (le navigateur ne relance `install` que pour cela). Numéro inchangé alors que la coquille change = l'app
// installée reste sur l'ancienne coquille, sans erreur et sans fin : le pire défaut. Le bump à la main s'oubliait,
// et deux PR ouvertes ensemble se disputaient la ligne.
//
// CE QUE FAIT LE SCRIPT. Il remplace la valeur de `CACHE_V2` DANS LE DOSSIER PUBLIÉ (v2/ de la construction
// Cloudflare) par `trainhub-v2-` + les 10 premiers caractères de sha256 de :
//   · le chemin et les octets de CHAQUE fichier de `SHELL` (la liste est lue dans le service worker lui-même :
//     ajouter un fichier à la coquille change l'empreinte sans rien d'autre à penser) ;
//   · les octets de service-worker.js dont la ligne `CACHE_V2` est neutralisée (modifier le code du service
//     worker change l'empreinte ; le numéro lui-même n'y entre pas, donc relancer le script donne le même résultat).
// Le numéro change donc si et seulement si ce qui est servi depuis le cache change.
//
// ÉCHEC FERMÉ. Le script sort en code 1 (et ne touche à rien) si : le littéral `const CACHE_V2 = '…';` n'apparaît
// pas EXACTEMENT une fois, si `SHELL` est introuvable ou vide, ou si un fichier de `SHELL` manque. Un échec de
// construction laisse l'ancien déploiement en ligne : jamais un service worker estampillé à moitié.
//
// Le fichier du dépôt reste valide SANS le script (local, bancs, tests) : son littéral est la valeur de repli.
//
// Usage : node v2-atelier/outils/estamper-sw.js [dossier-publié]     (défaut : v2/ à la racine du dépôt)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PREFIXE = 'trainhub-v2-';
const LITTERAL = /const CACHE_V2 = '[^']*';/g;
const NEUTRE = "const CACHE_V2 = '';";

function lireSW(dossier) {
  const chemin = path.join(dossier, 'service-worker.js');
  if (!fs.existsSync(chemin)) throw new Error('service-worker.js introuvable dans ' + dossier);
  return { chemin: chemin, texte: fs.readFileSync(chemin, 'utf8') };
}

// La liste `SHELL`, lue dans le texte du service worker (commentaires de ligne écartés).
function coquilleDe(texte) {
  const m = /const SHELL = \[([\s\S]*?)\n\];/.exec(texte);
  if (!m) throw new Error('tableau SHELL introuvable dans service-worker.js');
  const chemins = [];
  m[1].split('\n').forEach(function (ligne) {
    const l = ligne.replace(/^\s*\/\/.*$/, '');
    const r = /'([^']+)'/g;
    let x;
    while ((x = r.exec(l))) chemins.push(x[1]);
  });
  if (!chemins.length) throw new Error('SHELL est vide');
  return chemins;
}

function empreinte(dossier) {
  const sw = lireSW(dossier);
  const nb = (sw.texte.match(LITTERAL) || []).length;
  if (nb !== 1) throw new Error("le littéral « const CACHE_V2 = '…'; » doit apparaître exactement une fois (trouvé : " + nb + ')');
  const h = crypto.createHash('sha256');
  coquilleDe(sw.texte).forEach(function (rel) {
    // './' est la page d'accueil : le dossier lui-même, servi par index.html.
    const fichier = rel === './' ? 'index.html' : rel.replace(/^\.\//, '');
    const chemin = path.join(dossier, fichier);
    if (!fs.existsSync(chemin) || !fs.statSync(chemin).isFile()) throw new Error('fichier de la coquille manquant : ' + rel);
    h.update('fichier:' + rel + '\n');
    h.update(fs.readFileSync(chemin));
    h.update('\n');
  });
  h.update('service-worker.js\n');
  h.update(sw.texte.replace(LITTERAL, NEUTRE));
  return h.digest('hex').slice(0, 10);
}

// Écrit le numéro dans le service worker du dossier. Rend le numéro posé.
function estamper(dossier) {
  const numero = PREFIXE + empreinte(dossier);
  const sw = lireSW(dossier);
  const neuf = sw.texte.replace(LITTERAL, "const CACHE_V2 = '" + numero + "';");
  fs.writeFileSync(sw.chemin, neuf);
  return numero;
}

function principal(argv) {
  const dossier = path.resolve(argv[2] || path.join(__dirname, '..', '..', 'v2'));
  try {
    console.log('SW estampillé : ' + estamper(dossier) + ' (' + path.join(dossier, 'service-worker.js') + ')');
    return 0;
  } catch (e) {
    console.error('ESTAMPILLE IMPOSSIBLE : ' + e.message);
    return 1;
  }
}

if (require.main === module) process.exit(principal(process.argv));
module.exports = { empreinte, estamper, coquilleDe, PREFIXE };
