#!/usr/bin/env node
// 158 — rend lisible par l'API REST ce qu'un job de banc a produit : les journaux de GitHub
// ne se téléchargent pas partout, les annotations si (`check-runs/ID/annotations`).
//   node .github/annoter.js TITRE fichier [fichier…]   (les fichiers absents sont ignorés)
const fs = require('fs');
const [titre, ...fichiers] = process.argv.slice(2);
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
for (const f of fichiers) {
  if (!fs.existsSync(f)) continue;
  const l = fs.readFileSync(f, 'utf8').split('\n');
  const cles = l.filter((x) => /contrôles ·|en échec|tout passe|\[exception\]|❌|✅|^Tests:|^Test Suites:|BANC RÉDUIT|s au total/.test(x));
  const echecs = l.filter((x) => /❌|✗|\[exception\]|FAIL |●/.test(x)).slice(0, 40);
  const queue = l.slice(-25);
  const msg = ['[' + f + ']', ...cles.slice(-25), '--- échecs ---', ...echecs, '--- fin ---', ...queue].join('\n').slice(0, 9000);
  console.log('::notice title=' + titre + '::' + esc(msg));
}
