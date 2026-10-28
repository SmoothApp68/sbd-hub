'use strict';
// node lancer.js --niveau N --profils P01,X07 --semaines 16 --graine 1 --sortie DOSSIER
const fs = require('fs'); const path = require('path');
const { PROFILS } = require('./profils.js'); const { jouerProfil } = require('./pilote-moteur.js'); const J = require('./journal.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const niveau = arg('niveau', 'N'); const ids = arg('profils', '').split(',').filter(Boolean); const sem = Number(arg('semaines', 16));
const graines = arg('graine', '1').split(',').map(Number); const sortie = arg('sortie', '/home/claude/nuit/audit-fil/simulation');
if (niveau !== 'N') { console.error('niveau B : voir pilote-app.js'); process.exit(2); }
const cibles = PROFILS.filter((p) => !ids.length || ids.includes(p.id)); const resume = {};
cibles.forEach((p) => graines.forEach((g) => {
  const t = Date.now(); const r = jouerProfil(p, g, sem);
  J.ecrire(sortie, p, g, r.lignes);
  resume[p.id + '-g' + g] = { seances: r.lignes.length, violations: r.lignes.reduce((a, l) => a + l.violations.filter((v) => !/^I10 suite/.test(v.msg)).length, 0), i10suite: r.lignes.reduce((a, l) => a + l.violations.filter((v) => /^I10 suite/.test(v.msg)).length, 0), vide: r.vide || false, ms: Date.now() - t };
  console.log(p.id, 'g' + g, JSON.stringify(resume[p.id + '-g' + g]));
}));
fs.writeFileSync(path.join(sortie, 'resume-N.json'), JSON.stringify(resume, null, 1));
