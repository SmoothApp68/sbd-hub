#!/usr/bin/env node
//
// v2/banc/serveur-pages.js — un serveur qui IMITE Cloudflare Pages.
//
// ══ POURQUOI CE FICHIER EXISTE ═════════════════════════════════════════════
//
// Le chantier 18 a livré un service worker validé par un banc dont le serveur
// renvoyait `index.html` avec un 200 pour absolument tout, `/index.html`
// compris. Cloudflare, lui, REDIRIGE `/index.html` vers `/` en 308.
//
// Le banc testait donc un hébergeur qui n'existe pas — et le seul comportement
// qu'il n'avait pas copié était précisément celui qui casse l'application. Le
// chantier 19 a mesuré le coût : `ERR_FAILED` sur toutes les navigations, en
// ligne, sur un appareil où le service worker était installé, sans autre sortie
// que d'effacer les données du site à la main.
//
//   UN BANC QUI N'IMITE PAS LA PRODUCTION NE PROUVE RIEN SUR LA PRODUCTION.
//
// Ce serveur vit donc dans le dépôt, pas dans un scratchpad de session : le
// prochain chantier qui touche au service worker doit le retrouver.
//
// ══ CE QU'IL REPRODUIT ═════════════════════════════════════════════════════
//
//   1. CANONICALISATION — `GET /index.html` répond 308 vers `/`. C'est le
//      comportement documenté de Pages, et la cause du défaut du chantier 19.
//      Vaut pour tout fichier `.html`.
//   2. REPLI SPA — tout chemin sans fichier correspondant rend `index.html`
//      avec un 200, comme la règle `/* /index.html 200` de `v2/_redirects`.
//      C'est ce qui fait marcher `/semaine/2026-08-24`.
//   3. FICHIERS RÉELS D'ABORD, avec leur type MIME.
//
// ══ USAGE ══════════════════════════════════════════════════════════════════
//
//   node v2/banc/serveur-pages.js [racine] [port] [--sans-canonicalisation]
//
// `--sans-canonicalisation` sert de TÉMOIN : c'est la configuration dans
// laquelle la garde `redirected` et son absence sont indistinguables. Un banc
// qui ne tourne que dans ce mode ne prouve rien.
//
// Un chemin de pilotage, jamais servi comme un fichier :
//   · `/__journal`  rend le journal des requêtes (utile à la main).
//
// Pour simuler un DÉPLOIEMENT, pas de pilote : on écrit dans le dossier servi.
// Le serveur relit le fichier à chaque requête, l'origine ne bouge pas — c'est
// ce que fait le scénario 5 de `tests/banc/sw-navigation.js`, et c'est plus
// proche d'un vrai déploiement qu'un changement de racine.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function creer(options) {
  const opts = options || {};
  const racine = path.resolve(opts.racine || path.join(__dirname, '..'));
  const canonicalise = opts.canonicalise !== false;
  const journal = [];

  const serveur = http.createServer((req, res) => {
    const chemin = decodeURIComponent(String(req.url).split('?')[0]);

    if (chemin === '/__journal') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(journal.join('\n'));
    }

    // 1. CANONICALISATION. C'est LA ligne qui distingue ce serveur d'un serveur
    //    statique ordinaire, et c'est elle qui a fait tomber le chantier 18.
    if (canonicalise && /\.html$/.test(chemin)) {
      const sans = chemin.replace(/(index)?\.html$/, '').replace(/\/$/, '') || '/';
      journal.push('308 ' + chemin + ' -> ' + sans);
      res.writeHead(308, { Location: sans });
      return res.end();
    }

    // 2. Fichiers réels d'abord.
    let fichier = path.join(racine, chemin === '/' ? 'index.html' : chemin);
    let repli = false;
    if (!fichier.startsWith(racine) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      // 3. Repli SPA — le `/* /index.html 200` de `v2/_redirects`.
      fichier = path.join(racine, 'index.html');
      repli = true;
    }
    journal.push((repli ? 'REPLI ' : '200   ') + chemin);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream',
      // Le service worker est servi avec un cache long DÉLIBÉRÉMENT : c'est le
      // cas défavorable, et il est vérifié (chantier 19) que la mise à jour
      // passe quand même — `updateViaCache` vaut 'imports' par défaut, ce qui
      // fait contourner le cache HTTP pour le script principal.
      'Cache-Control': chemin === '/service-worker.js'
        ? 'public, max-age=86400' : 'no-cache'
    });
    fs.createReadStream(fichier).pipe(res);
  });

  serveur.journal = journal;
  return serveur;
}

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => a !== '--sans-canonicalisation');
  const serveur = creer({
    racine: args[0],
    canonicalise: process.argv.indexOf('--sans-canonicalisation') < 0
  });
  const port = Number(args[1]) || 8788;
  serveur.listen(port, () => {
    process.stderr.write('serveur-pages prêt sur ' + port +
      (process.argv.indexOf('--sans-canonicalisation') < 0
        ? ' (canonicalisation Cloudflare ACTIVE)\n' : ' (TÉMOIN, sans canonicalisation)\n'));
  });
}

module.exports = { creer: creer, TYPES: TYPES };
