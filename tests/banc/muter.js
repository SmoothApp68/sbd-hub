#!/usr/bin/env node
// tests/banc/muter.js — le banc de mutation rapide.
//
// Une mutation : un remplacement dans UN fichier, appliqué dans une COPIE du
// dépôt à l'état COMMITÉ (`HEAD`), puis ses tests unitaires ciblés et SON banc —
// réduit pour le banc de séance, entier pour les trois autres. Jamais le banc de
// séance complet. Plusieurs mutations tournent en même temps, chacune dans sa
// copie et sur son port.
//
// ── Le lot (`--lot mutations.json`) : une liste d'objets ─────────────────────
//
//   [{ "nom": "a",                         facultatif (défaut : le nom du fichier)
//      "fichier": "v2/js/attente.js",      le fichier muté, relatif à la racine
//      "ancien": "…", "nouveau": "…",      le remplacement ; « ancien » doit
//                                          apparaître EXACTEMENT une fois
//      "banc": "seance",                   le banc qui doit la tuer (voir plus bas)
//      "sections": ["7-G-sexies"],         banc « seance » : les sections jouées
//      "scenario": 3,                      banc « sw-navigation » : un seul scénario
//      "unitaires": ["tests/unit/…"],      les tests jest ciblés (facultatif)
//      "attendu": "tuee" }, …]             « tuee » (défaut) ou « survit » (témoin)
//
//   « banc » vaut :
//     seance           tests/banc/seance-ecran.js, RÉDUIT aux « sections »
//                      (`--lister` de seance-rapide.js les donne) — obligatoires
//     profil-creation  tests/banc/profil-creation.js, entier
//     routines         tests/banc/routines-ecran.js, entier
//     sw-navigation    tests/banc/sw-navigation.js, entier ou le seul « scenario »
//     aucun            les tests unitaires seuls
//   Il peut aussi être une LISTE de ces noms. Absent : « seance » s'il y a des
//   « sections », « aucun » sinon.
//
// ── En ligne de commande, une seule mutation ─────────────────────────────────
//
//   node tests/banc/muter.js --fichier v2/js/attente.js \
//        --ancien "return code === '23503' || code === AUCUNE_LIGNE;" \
//        --nouveau "return code === '23503';" \
//        --banc seance --sections 7-G-sexies \
//        --unitaires tests/unit/v2-file-orpheline.test.js --nom a
//
// ── Les copies ───────────────────────────────────────────────────────────────
//
// Chaque copie est un `git archive HEAD` extrait dans un dossier temporaire
// (hors du dépôt, jamais sous `.claude/`), avec un lien vers `node_modules`.
// Pas de `git worktree` : rien n'est écrit dans `.git`, et la copie ne contient
// que les fichiers suivis — pas de `.claude/worktrees`, qui ralentit jest ×15
// et fait échouer `v2-garde-reseau`. `--garder` laisse les copies (pour lire un
// journal) ; sinon elles sont effacées.
//
// ── Le verdict ───────────────────────────────────────────────────────────────
//
// TUÉE si un test ciblé ou le banc échoue ; SURVIT sinon. Le rapport dit, par
// mutation, le verdict, les contrôles qui l'ont tuée (tests jest et lignes ❌
// du banc), et les durées. Une mutation dont « ancien » n'apparaît pas
// exactement une fois n'est pas appliquée : signalée, jamais comptée tuée.
// Code de sortie 0 si chaque mutation rend son « attendu ».

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const Rapide = require('./seance-rapide.js');

const RACINE = path.join(__dirname, '../..');

const BANCS = {
  'profil-creation': 'tests/banc/profil-creation.js',
  routines: 'tests/banc/routines-ecran.js',
  'sw-navigation': 'tests/banc/sw-navigation.js'
};
const NOMS_DE_BANC = ['seance', 'aucun'].concat(Object.keys(BANCS));

// Le dossier des copies : le dossier temporaire du système, sauf s'il tombe
// dans le dépôt ou sous un `.claude/` — alors `/tmp`.
function dossierDesCopies() {
  const t = path.resolve(os.tmpdir());
  const r = path.resolve(RACINE);
  const dedans = t === r || t.indexOf(r + path.sep) === 0 || t.split(path.sep).indexOf('.claude') >= 0;
  return dedans ? '/tmp' : t;
}

function copier(nom) {
  const dossier = fs.mkdtempSync(path.join(dossierDesCopies(), 'mutation-' + String(nom).replace(/[^\w-]/g, '_') + '-'));
  const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'],
    { cwd: RACINE, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('tar', ['-x', '-C', dossier], { input: archive, stdio: ['pipe', 'ignore', 'pipe'] });
  const modules = path.join(RACINE, 'node_modules');
  if (!fs.existsSync(modules)) throw new Error('pas de node_modules à la racine (' + modules + ') : npm ci d’abord');
  fs.symlinkSync(fs.realpathSync(modules), path.join(dossier, 'node_modules'));
  return dossier;
}

function lancer(dossier, args, env) {
  return new Promise((ok) => {
    let sortie = '';
    const debut = Date.now();
    const p = spawn(process.execPath, args, {
      cwd: dossier, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env || {})
    });
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    p.on('exit', (code) => ok({ code, sortie, duree: Date.now() - debut }));
  });
}

// Les tests jest ciblés ; « tues » : les tests en échec (« ● suite › test »).
async function jest(dossier, fichiers) {
  if (!fichiers || !fichiers.length) return null;
  const r = await lancer(dossier, [path.join(dossier, 'node_modules/jest/bin/jest.js')].concat(fichiers));
  const tues = [];
  r.sortie.split('\n').forEach((l) => {
    const m = l.match(/^\s+● (.+)$/);
    if (m && !/^Console$/.test(m[1].trim()) && tues.indexOf(m[1].trim()) < 0) tues.push(m[1].trim());
  });
  if (r.code !== 0 && !tues.length) tues.push('jest, code ' + r.code + ' — ' + ((r.sortie.match(/^Tests:.*$/m) || [''])[0] || 'aucun test joué'));
  return { vert: r.code === 0, tues, resume: (r.sortie.match(/^Tests:.*$/m) || [''])[0].trim(), duree: r.duree };
}

// Un banc entier (ou un scénario du service worker), sur un port libre.
async function bancEntier(dossier, nomBanc, m) {
  const port = await Rapide.portLibre();
  const args = [path.join(dossier, BANCS[nomBanc])];
  if (nomBanc === 'sw-navigation' && m.scenario) args.push(String(m.scenario));
  const r = await lancer(dossier, args, { BANC_PORT: String(port) });
  const tues = r.sortie.split('\n').filter((l) => /^\s*❌/.test(l) && !/^\s*❌ en échec\s*$/.test(l) &&
    !/vérification\(s\) en échec/.test(l)).map((l) => l.replace(/^\s*❌\s*/, '').trim());
  if (r.code !== 0 && !tues.length) tues.push('le banc s’est arrêté, code ' + r.code + ' — ' + r.sortie.trim().split('\n').slice(-1)[0]);
  if (!fs.existsSync(path.join(dossier, 'journaux'))) fs.mkdirSync(path.join(dossier, 'journaux'));
  const journal = path.join(dossier, 'journaux', nomBanc + '.txt');
  fs.writeFileSync(journal, r.sortie);
  return { nom: nomBanc, vert: r.code === 0, tues, duree: r.duree, journal };
}

async function bancSeance(dossier, m) {
  const debut = Date.now();
  const r = await Rapide.reduit(m.sections, { banc: path.join(dossier, 'tests/banc/seance-ecran.js') });
  const vert = Rapide.resumer(r).vert;
  const tues = r.fusion.controles.filter((c) => !c.ok).map((c) => c.nom)
    .concat(r.couverture.map((e) => 'couverture : ' + e));
  if (!vert && !tues.length) tues.push('banc de séance en échec (erreur de page ou préalable) — ' + r.resultats[0].journal);
  return { nom: 'seance [' + m.sections.join(',') + ']', vert, tues, duree: Date.now() - debut, journal: r.resultats[0].journal };
}

function bancsDe(m) {
  const b = m.banc === undefined ? (m.sections && m.sections.length ? 'seance' : 'aucun') : m.banc;
  return (Array.isArray(b) ? b : [b]).filter((x) => x !== 'aucun');
}

function valider(m) {
  if (!m.fichier || m.ancien === undefined || m.nouveau === undefined) return '« fichier », « ancien » et « nouveau » sont requis';
  const b = m.banc === undefined ? [] : (Array.isArray(m.banc) ? m.banc : [m.banc]);
  const inconnu = b.filter((x) => NOMS_DE_BANC.indexOf(x) < 0);
  if (inconnu.length) return 'banc inconnu : ' + inconnu.join(', ') + ' (connus : ' + NOMS_DE_BANC.join(', ') + ')';
  if (bancsDe(m).indexOf('seance') >= 0 && !(m.sections && m.sections.length)) return 'le banc « seance » demande des « sections »';
  if (m.attendu !== undefined && ['tuee', 'survit'].indexOf(m.attendu) < 0) return '« attendu » vaut « tuee » ou « survit »';
  if (!bancsDe(m).length && !(m.unitaires && m.unitaires.length)) return 'ni banc ni tests unitaires : rien ne peut la tuer';
  return null;
}

async function muter(m, options) {
  const o = options || {};
  const nom = m.nom || path.basename(m.fichier);
  const attendu = m.attendu || 'tuee';
  const debut = Date.now();
  const faute = valider(m);
  if (faute) return { nom, attendu, verdict: 'NON APPLIQUÉE', detail: faute, controles: [], duree: 0 };
  let dossier = null;
  try {
    dossier = copier(nom);
    const dureeCopie = Date.now() - debut;
    const cible = path.join(dossier, m.fichier);
    const texte = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
    const n = texte === null ? 0 : texte.split(m.ancien).length - 1;
    if (n !== 1) {
      return { nom, attendu, verdict: 'NON APPLIQUÉE', controles: [], duree: Date.now() - debut, dossier,
        detail: texte === null ? m.fichier + ' n’existe pas' : '« ancien » trouvé ' + n + ' fois dans ' + m.fichier };
    }
    fs.writeFileSync(cible, texte.replace(m.ancien, m.nouveau));
    // Jest et les bancs en même temps : chacun sur sa copie de lecture.
    const [unit, bancs] = await Promise.all([
      jest(dossier, m.unitaires || []),
      Promise.all(bancsDe(m).map((b) => (b === 'seance' ? bancSeance(dossier, m) : bancEntier(dossier, b, m))))
    ]);
    const etapes = (unit ? [Object.assign({ nom: 'jest (' + m.unitaires.length + ' fichier(s))' }, unit)] : []).concat(bancs);
    const tuee = etapes.some((e) => !e.vert);
    return {
      nom, attendu, verdict: tuee ? 'TUÉE' : 'SURVIT',
      etapes: etapes.map((e) => ({ nom: e.nom, vert: e.vert, duree: e.duree, tues: e.tues, resume: e.resume, journal: e.journal })),
      controles: [].concat.apply([], etapes.map((e) => e.tues.map((t) => e.nom + ' · ' + t))),
      dureeCopie: dureeCopie, duree: Date.now() - debut, dossier
    };
  } catch (e) {
    return { nom, attendu, verdict: 'NON APPLIQUÉE', detail: 'erreur : ' + String(e && e.message || e).slice(0, 300),
      controles: [], duree: Date.now() - debut, dossier };
  } finally {
    if (dossier && !o.garder) {
      try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* déjà parti */ }
    }
  }
}

async function lot(mutations, options) {
  return Promise.all(mutations.map((m) => muter(m, options)));
}

function conforme(x) {
  return (x.attendu === 'survit' && x.verdict === 'SURVIT') || (x.attendu !== 'survit' && x.verdict === 'TUÉE');
}

function rapport(r, dureeTotale, garder) {
  const s = (ms) => Math.round(ms / 1000) + ' s';
  const l = ['\n══ MUTATIONS (copies de l’état commité · banc de séance réduit · tests ciblés) ══'];
  r.forEach((x) => {
    l.push('\n' + (conforme(x) ? '✅' : '❌') + ' ' + x.nom + ' : ' + x.verdict +
      (x.attendu === 'survit' ? ' (témoin : doit survivre)' : '') + ' · ' + s(x.duree) +
      (x.dureeCopie !== undefined ? ' (copie ' + s(x.dureeCopie) + ')' : ''));
    if (x.detail) l.push('     ' + x.detail);
    (x.etapes || []).forEach((e) => {
      l.push('     ' + (e.vert ? 'vert    ' : 'ÉCHEC   ') + e.nom + ' · ' + s(e.duree) + (e.resume ? ' · ' + e.resume : '') +
        (garder && e.journal ? ' · journal ' + e.journal : ''));
      e.tues.slice(0, 5).forEach((t) => l.push('         tuée par : ' + t));
      if (e.tues.length > 5) l.push('         … et ' + (e.tues.length - 5) + ' autre(s)');
    });
    if (garder && x.dossier) l.push('     copie gardée : ' + x.dossier);
  });
  const tuees = r.filter((x) => x.verdict === 'TUÉE').length;
  const survit = r.filter((x) => x.verdict === 'SURVIT').length;
  l.push('\n   ' + r.length + ' mutation(s) · ' + tuees + ' tuée(s) · ' + survit + ' survivante(s) · ' +
    (r.length - tuees - survit) + ' non appliquée(s) · ' + s(dureeTotale) + ' au total');
  l.push(r.every(conforme) ? '✅ chaque mutation rend son attendu' : '❌ au moins une mutation ne rend pas son attendu');
  return l.join('\n');
}

module.exports = { muter, lot, rapport, conforme, copier, dossierDesCopies, BANCS };

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const liste = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const mutations = val('--lot')
    ? JSON.parse(fs.readFileSync(val('--lot'), 'utf8'))
    : [{ nom: val('--nom'), fichier: val('--fichier'), ancien: val('--ancien'), nouveau: val('--nouveau'),
      banc: val('--banc') ? (liste(val('--banc')).length > 1 ? liste(val('--banc')) : val('--banc')) : undefined,
      sections: liste(val('--sections')), unitaires: liste(val('--unitaires')),
      scenario: val('--scenario') ? Number(val('--scenario')) : undefined, attendu: val('--attendu') }];
  const fautes = mutations.map((m, i) => { const f = valider(m); return f ? 'mutation ' + (m.nom || i + 1) + ' : ' + f : null; }).filter(Boolean);
  if (fautes.length) { fautes.forEach((f) => console.error(f)); process.exit(2); }
  const garder = a.indexOf('--garder') >= 0;
  const debut = Date.now();
  // 168 : le verrou est pris UNE fois pour tout le lot ; les copies jouent dessous (BANC_VERROU_TENU hérité).
  require('./verrou.js').prendre().then(() => lot(mutations, { garder })).then((r) => {
    console.log(rapport(r, Date.now() - debut, garder));
    process.exit(r.every(conforme) ? 0 : 1);
  }).catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
