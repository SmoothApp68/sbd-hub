#!/usr/bin/env node
// tests/banc/tout.js — `npm test` et les quatre bancs, en même temps.
//
//   node tests/banc/tout.js                 npm test + banc des routines + banc du service worker
//                                           + banc de la création du profil (60-2b)
//                                           + banc de vitesse (231)
//                                           + banc d'écran de séance (complet, parallèle)
//   node tests/banc/tout.js --sequentiel    le banc d'écran en séquentiel (la référence)
//
// Chacun sur son port, chacun dans son journal ; on attend les six, on dit
// lequel a échoué et où lire pourquoi. À lancer sur l'état COMMITÉ.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { prendre } = require('./verrou.js');

const RACINE = path.join(__dirname, '../..');

function lancer(nom, args, env) {
  return Promise.resolve().then(() => new Promise((ok) => {
    const journal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tout-')), nom.replace(/\W+/g, '-') + '.txt');
    const sortie = fs.openSync(journal, 'w');
    const debut = Date.now();
    const p = spawn(process.execPath, args, {
      cwd: RACINE, stdio: ['ignore', sortie, sortie],
      env: Object.assign({}, process.env, { BANC_PORT: '0' }, env || {})   // 168 : chaque banc demande son port au système
    });
    p.on('exit', (code) => {
      fs.closeSync(sortie);
      const texte = fs.readFileSync(journal, 'utf8');
      const fin = texte.split('\n').filter((l) => /tout passe|en échec|^Tests:|^Test Suites:|contrôles ·/.test(l)).slice(-3);
      ok({ nom, code, duree: Date.now() - debut, journal, fin, texte });
    });
  }));
}

if (require.main === module) (async () => {
  await prendre();   // 168 : un seul banc à la fois ; les cinq lancés ici jouent sous ce verrou
  const seq = process.argv.indexOf('--sequentiel') >= 0;
  const debut = Date.now();
  // 231 : le banc de vitesse MESURE du temps — il joue SEUL d'abord (cinq navigateurs à côté fausseraient la médiane), puis les autres en parallèle.
  // PR 4b (R-A, O12) : un 2e profil — un zéro rep toutes les 10 séances — joue seul lui aussi, juste après le premier.
  lancer('banc de vitesse', [path.join(__dirname, 'vitesse.js')]).then((v1) => lancer('banc de vitesse (zéros)', [path.join(__dirname, 'vitesse.js'), '--zeros']).then((v2) => [v1, v2])).then((v) => Promise.all([
    lancer('npm test', [path.join(RACINE, 'node_modules/jest/bin/jest.js')]),
    lancer('banc des routines', [path.join(__dirname, 'routines-ecran.js')]),
    lancer('banc du service worker', [path.join(__dirname, 'sw-navigation.js')]),
    lancer('banc de la création du profil', [path.join(__dirname, 'profil-creation.js')]),
    // 271 — l'animation du mouvement : montage, arrêt, un seul contexte WebGL sur 10 allers-retours, hors ligne, mouvement réduit
    lancer('banc du mouvement', [path.join(__dirname, 'mouvement.js')]),
    lancer('banc d’écran de séance', [path.join(__dirname, 'seance-rapide.js')].concat(seq ? ['--sequentiel'] : []))
  ]).then((r) => v.concat(r))).then((r) => {
    console.log('\n══ TOUT (sur l’état commité) ══');
    r.forEach((x) => {
      console.log('   ' + (x.code === 0 ? '✅' : '❌') + ' ' + x.nom + ' · ' + Math.round(x.duree / 1000) + ' s · ' +
        x.fin.join(' · ').replace(/\s+/g, ' ').trim() + (x.code === 0 ? '' : '\n        journal : ' + x.journal));
    });
    // 231 : un banc de vitesse en échec montre son tableau (geste / médiane / plafond) dans la sortie, donc dans le journal GitHub.
    r.filter((x) => x.code !== 0 && x.nom.indexOf('banc de vitesse') === 0).forEach((x) => {
      const i = x.texte.indexOf('══ VITESSE');
      console.log('\n' + (i >= 0 ? x.texte.slice(i) : x.texte.split('\n').slice(-40).join('\n')));
    });
    console.log('\n   ' + Math.round((Date.now() - debut) / 1000) + ' s au total');
    process.exit(r.every((x) => x.code === 0) ? 0 : 1);
  });
})();
