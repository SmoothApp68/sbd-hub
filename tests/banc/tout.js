#!/usr/bin/env node
// tests/banc/tout.js — `npm test` et les quatre bancs, en même temps.
//
//   node tests/banc/tout.js                 npm test + banc des routines + banc du service worker
//                                           + banc de la création du profil (60-2b)
//                                           + banc d'écran de séance (complet, parallèle)
//   node tests/banc/tout.js --sequentiel    le banc d'écran en séquentiel (la référence)
//
// Chacun sur son port, chacun dans son journal ; on attend les cinq, on dit
// lequel a échoué et où lire pourquoi. À lancer sur l'état COMMITÉ.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { portLibre } = require('./seance-rapide.js');

const RACINE = path.join(__dirname, '../..');

function lancer(nom, args, env) {
  return portLibre().then((port) => new Promise((ok) => {
    const journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tout-')), nom.replace(/\W+/g, '-') + '.txt');
    const sortie = fs.openSync(journal, 'w');
    const debut = Date.now();
    const p = spawn(process.execPath, args, {
      cwd: RACINE, stdio: ['ignore', sortie, sortie],
      env: Object.assign({}, process.env, { BANC_PORT: String(port) }, env || {})
    });
    p.on('exit', (code) => {
      fs.closeSync(sortie);
      const texte = fs.readFileSync(journal, 'utf8');
      const fin = texte.split('\n').filter((l) => /tout passe|en échec|^Tests:|^Test Suites:|contrôles ·/.test(l)).slice(-3);
      ok({ nom, code, duree: Date.now() - debut, journal, fin });
    });
  }));
}

if (require.main === module) {
  const seq = process.argv.indexOf('--sequentiel') >= 0;
  const debut = Date.now();
  Promise.all([
    lancer('npm test', [path.join(RACINE, 'node_modules/jest/bin/jest.js')]),
    lancer('banc des routines', [path.join(__dirname, 'routines-ecran.js')]),
    lancer('banc du service worker', [path.join(__dirname, 'sw-navigation.js')]),
    lancer('banc de la création du profil', [path.join(__dirname, 'profil-creation.js')]),
    lancer('banc d’écran de séance', [path.join(__dirname, 'seance-rapide.js')].concat(seq ? ['--sequentiel'] : []))
  ]).then((r) => {
    console.log('\n══ TOUT (sur l’état commité) ══');
    r.forEach((x) => {
      console.log('   ' + (x.code === 0 ? '✅' : '❌') + ' ' + x.nom + ' · ' + Math.round(x.duree / 1000) + ' s · ' +
        x.fin.join(' · ').replace(/\s+/g, ' ').trim() + (x.code === 0 ? '' : '\n        journal : ' + x.journal));
    });
    console.log('\n   ' + Math.round((Date.now() - debut) / 1000) + ' s au total');
    process.exit(r.every((x) => x.code === 0) ? 0 : 1);
  });
}
