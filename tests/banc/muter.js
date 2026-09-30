#!/usr/bin/env node
// tests/banc/muter.js — le banc de mutation rapide.
//
// Une mutation : un remplacement dans UN fichier, appliqué dans un worktree à
// part (sur l'état COMMITÉ, `HEAD`), puis les tests unitaires ciblés et le
// banc RÉDUIT aux sections nommées. Jamais le banc complet. Plusieurs
// mutations tournent en même temps, chacune dans son worktree et sur son port.
//
//   node tests/banc/muter.js --fichier v2/js/attente.js \
//        --ancien "return code === '23503' || code === AUCUNE_LIGNE;" \
//        --nouveau "return code === '23503';" \
//        --sections 7-G-sexies --unitaires tests/unit/v2-file-orpheline.test.js --nom a
//
//   node tests/banc/muter.js --lot mutations.json
//        [{ "nom": "a", "fichier": "…", "ancien": "…", "nouveau": "…",
//           "sections": ["7-G-sexies"], "unitaires": ["tests/unit/…"] }, …]
//
// Verdict : TUÉE si un test ciblé ou le banc réduit échoue ; SURVIT sinon.
// Une mutation dont le texte `ancien` n'apparaît pas EXACTEMENT une fois
// n'est pas appliquée : elle est signalée, pas comptée comme tuée.
// `--garder` laisse les worktrees (pour lire un journal).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const Rapide = require('./seance-rapide.js');

const RACINE = path.join(__dirname, '../..');

function git(args, cwd) {
  return execFileSync('git', args, { cwd: cwd || RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function jest(dossier, fichiers) {
  if (!fichiers || !fichiers.length) return Promise.resolve({ code: 0, sortie: '(aucun test ciblé)' });
  return new Promise((ok) => {
    let sortie = '';
    const p = spawn(process.execPath, [path.join(RACINE, 'node_modules/jest/bin/jest.js')].concat(fichiers),
      { cwd: dossier, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    p.on('exit', (code) => ok({ code, sortie }));
  });
}

async function muter(m, options) {
  const o = options || {};
  const nom = m.nom || path.basename(m.fichier);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-' + String(nom).replace(/[^\w-]/g, '_') + '-'));
  fs.rmdirSync(dossier);
  git(['worktree', 'add', '--quiet', '--detach', dossier, 'HEAD']);
  const debut = Date.now();
  try {
    fs.symlinkSync(path.join(RACINE, 'node_modules'), path.join(dossier, 'node_modules'));
    const cible = path.join(dossier, m.fichier);
    const texte = fs.readFileSync(cible, 'utf8');
    const n = texte.split(m.ancien).length - 1;
    if (n !== 1) {
      return { nom, verdict: 'NON APPLIQUÉE', detail: '« ancien » trouvé ' + n + ' fois dans ' + m.fichier, duree: Date.now() - debut };
    }
    fs.writeFileSync(cible, texte.replace(m.ancien, m.nouveau));
    const unitaires = await jest(dossier, m.unitaires || []);
    const banc = m.sections && m.sections.length
      ? await Rapide.reduit(m.sections, { banc: path.join(dossier, 'tests/banc/seance-ecran.js') })
      : null;
    const bancVert = banc ? Rapide.resumer(banc).vert : true;
    const echecsBanc = banc ? banc.fusion.controles.filter((c) => !c.ok).map((c) => c.nom) : [];
    const lignesJest = (unitaires.sortie.match(/^Tests:.*$/m) || [''])[0];
    return {
      nom,
      verdict: unitaires.code !== 0 || !bancVert ? 'TUÉE' : 'SURVIT',
      unitaires: m.unitaires && m.unitaires.length ? (unitaires.code === 0 ? 'verts' : 'en échec') + ' — ' + lignesJest : '—',
      banc: banc ? (bancVert ? 'vert' : echecsBanc.length + ' contrôle(s) en échec' +
        (banc.couverture.length ? ', couverture : ' + banc.couverture.join(' ; ') : '')) : '—',
      echecsBanc: echecsBanc.slice(0, 5),
      duree: Date.now() - debut
    };
  } finally {
    if (!o.garder) {
      try { git(['worktree', 'remove', '--force', dossier]); } catch (e) { /* déjà parti */ }
    }
  }
}

async function lot(mutations, options) {
  return Promise.all(mutations.map((m) => muter(m, options)));
}

module.exports = { muter, lot };

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const liste = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const mutations = val('--lot')
    ? JSON.parse(fs.readFileSync(val('--lot'), 'utf8'))
    : [{ nom: val('--nom'), fichier: val('--fichier'), ancien: val('--ancien'), nouveau: val('--nouveau'),
      sections: liste(val('--sections')), unitaires: liste(val('--unitaires')) }];
  mutations.forEach((m) => {
    if (!m.fichier || m.ancien === undefined || m.nouveau === undefined) {
      console.error('mutation incomplète : --fichier, --ancien et --nouveau sont requis');
      process.exit(2);
    }
  });
  lot(mutations, { garder: a.indexOf('--garder') >= 0 }).then((r) => {
    console.log('\n══ MUTATIONS (banc réduit, tests ciblés — état commité) ══');
    r.forEach((x) => {
      console.log('   ' + (x.verdict === 'TUÉE' ? '✅' : '❌') + ' ' + x.nom + ' : ' + x.verdict +
        ' · unitaires ' + (x.unitaires || '—') + ' · banc ' + (x.banc || x.detail || '—') +
        ' · ' + Math.round(x.duree / 1000) + ' s');
      (x.echecsBanc || []).forEach((n) => console.log('        ❌ ' + n));
    });
    process.exit(r.every((x) => x.verdict === 'TUÉE') ? 0 : 1);
  }).catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
