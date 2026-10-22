#!/usr/bin/env node
// tests/banc/charge.js — rejouer un banc SOUS CHARGE, plusieurs fois de suite (135).
//
//   node tests/banc/charge.js [--fois 10] [--ralenti 20] [--bruleurs 3] -- node tests/banc/routines-ecran.js
//
// La charge, en deux parts, pour reproduire une machine partagée (deux ou trois agents, six navigateurs pour
// deux cœurs) :
//   · `--bruleurs N` : N boucles de calcul, et le banc avec elles, épinglés sur le premier cœur (`taskset -c 0`,
//     s'il existe) — le banc (son faux serveur, Playwright) n'a plus qu'une part d'un cœur ;
//   · `--ralenti F`  : chaque page du banc a son processeur ralenti F fois par Chrome (`charge-ralentir.js`).
// Configuration discriminante relevée au 135 : `--ralenti 20 --bruleurs 3` faisait échouer le banc des
// routines d'avant (10 puis 9 contrôles en échec, deux passages sur deux) ; `--ralenti 6`, non.
//
// Chaque passage a son port (`BANC_PORT`) et son journal ; le code de retour est non nul si un passage échoue.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const sep = args.indexOf('--');
if (sep < 0 || sep === args.length - 1) {
  console.error('usage : node tests/banc/charge.js [--fois N] [--ralenti F] [--bruleurs N] -- commande…');
  process.exit(2);
}
const opt = (nom, def) => { const i = args.indexOf(nom); return i >= 0 && i < sep ? Number(args[i + 1]) : def; };
const FOIS = opt('--fois', 10), RALENTI = opt('--ralenti', 20), BRULEURS = opt('--bruleurs', 3);
const commande = args.slice(sep + 1);
const taskset = spawnSync('sh', ['-c', 'command -v taskset']).status === 0;
const epingle = (cmd) => (taskset ? ['taskset', '-c', '0'].concat(cmd) : cmd);

(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'charge-'));
  const bruleurs = [];
  for (let i = 0; i < BRULEURS; i++) {
    const c = epingle([process.execPath, '-e', 'for(;;){}']);
    bruleurs.push(spawn(c[0], c.slice(1), { stdio: 'ignore' }));
  }
  const arreter = () => bruleurs.forEach((b) => { try { b.kill(); } catch (e) { /* déjà parti */ } });
  process.on('exit', arreter);
  console.log('charge : ' + BRULEURS + ' brûleur(s)' + (taskset ? ' sur le cœur 0' : '') + ', pages ralenties ×' + RALENTI +
    ', ' + FOIS + ' passage(s) — journaux dans ' + dossier);
  let verts = 0;
  for (let k = 1; k <= FOIS; k++) {
    const journal = path.join(dossier, 'passage-' + k + '.txt');
    const sortie = fs.openSync(journal, 'w');
    const debut = Date.now();
    const c = epingle(commande);
    const code = await new Promise((ok) => {
      const p = spawn(c[0], c.slice(1), { stdio: ['ignore', sortie, sortie], cwd: path.join(__dirname, '../..'),
        env: Object.assign({}, process.env, { BANC_RALENTI: String(RALENTI), BANC_PORT: String(19300 + k),
          NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require ' + path.join(__dirname, 'charge-ralentir.js')).trim() }) });
      p.on('exit', (x) => ok(x));
    });
    fs.closeSync(sortie);
    const texte = fs.readFileSync(journal, 'utf8');
    const echecs = (texte.match(/❌/g) || []).length;
    if (code === 0) verts++;
    console.log('   ' + (code === 0 ? '✅' : '❌') + ' passage ' + k + ' · ' + Math.round((Date.now() - debut) / 1000) + ' s · ' +
      echecs + ' ❌' + (code === 0 ? '' : ' · ' + journal));
  }
  arreter();
  console.log('\n' + verts + ' / ' + FOIS + ' passage(s) verts sous charge');
  process.exit(verts === FOIS ? 0 : 1);
})();
