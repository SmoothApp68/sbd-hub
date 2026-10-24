#!/usr/bin/env node
// 158 — rend lisible par l'API REST ce qu'un job de banc a produit : les journaux de GitHub
// ne se téléchargent pas partout, les annotations si (`check-runs/ID/annotations`).
//   node .github/annoter.js TITRE fichier [fichier…]   (les fichiers absents sont ignorés)
const fs = require('fs');
const [titre, ...fichiers] = process.argv.slice(2);
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
const dire = (t, lignes, max) => console.log('::notice title=' + t + '::' + esc(lignes.join('\n').slice(0, max || 9000)));
for (const f of fichiers) {
  if (!fs.existsSync(f)) continue;
  const l = fs.readFileSync(f, 'utf8').split('\n');
  const nom = f.split('/').pop();
  const resume = l.filter((x) => /contrôles ·|tout passe|^Tests:|^Test Suites:|BANC RÉDUIT|s au total|══ TOUT|^   [✅❌] (npm|banc)/.test(x));
  const idx = []; l.forEach((x, i) => { if (/❌|\[exception\]/.test(x)) idx.push(i); });
  dire(titre + ' · ' + nom + ' · résumé (' + idx.length + ' ❌)', ['[' + f + ']', ...resume.slice(-15)], 4000);
  if (idx.length) {
    const i0 = idx[0];
    dire(titre + ' · ' + nom + ' · autour du 1er ❌', l.slice(Math.max(0, i0 - 25), i0 + 6).map((x) => x.slice(0, 400)), 8000);
    dire(titre + ' · ' + nom + ' · les ❌', idx.slice(0, 30).map((i) => l[i].slice(0, 260)), 8000);
  }
  // Les titres de section, pour situer la panne dans la durée.
  dire(titre + ' · ' + nom + ' · sections', l.filter((x) => /^══ /.test(x)).map((x) => x.slice(0, 90)), 9000);
}
