#!/usr/bin/env node
// tests/banc/texte-visible.js — un habillage ne retire rien (56-1, « la forge »).
//
//   node tests/banc/texte-visible.js                      ce commit, contre origin/main
//   node tests/banc/texte-visible.js --base <ref>         contre un autre commit
//   node tests/banc/texte-visible.js --captures DOSSIER   et les captures à 390 px, avant/après
//   node tests/banc/texte-visible.js --polices DOSSIER    rendu « comme le téléphone » (voir plus bas)
//   node tests/banc/texte-visible.js --json FICHIER       les deux relevés et les écarts, en JSON
//
// LA RÈGLE QU'IL PROUVE : même information, même ordre, même visibilité ; une
// taille ne peut que rester égale ou grandir. Il joue la section « forge » du
// banc d'écran (`seance-ecran.js`) DEUX FOIS, avec le même banc : contre le
// `v2/` du commit de base (extrait par `git archive`, servi par `BANC_V2`), et
// contre le `v2/` de ce commit. Chaque écran (séance, feuilles, routines,
// Progression, page d'exercice, profil, semaine), à 360 et à 390 px, donne la
// liste ordonnée de ses textes affichés ; les deux listes doivent :
//
//   · avoir les MÊMES textes, dans le MÊME ordre (les chiffres d'un chronomètre
//     sont masqués : ils changent d'une exécution à l'autre) ;
//   · une taille de police égale ou plus grande, texte par texte ;
//   · une opacité égale ou plus grande ;
//   · aucun texte coupé qui ne l'était pas ;
//   · aucun contraste sous 4,5:1 (3:1 pour un grand texte) qui ait baissé.
//
// Un écart fait échouer le programme (code de retour 1) et se lit en clair.
//
// ⚠️ C'EST L'OUTIL D'UN HABILLAGE, PAS UN CONTRÔLE DE CHAQUE PR : un chantier
// qui change un texte exprès le verra ici, et c'est normal. Il ne tourne donc
// pas dans `tout.js`.
//
// LES POLICES DE LA MACHINE. Le banc rend avec les polices du conteneur
// (DejaVu Sans, très large), pas avec celles du téléphone (Roboto). Une police
// plus large coupe PLUS : « avant » coupe donc plus qu'il ne le ferait sur
// l'appareil, et un habillage qui couperait sur l'appareil passerait ici.
// `--polices DOSSIER` (des .ttf, Roboto par exemple) fait rendre les deux
// passages avec ce dossier en tête de la police système : c'est alors la
// comparaison de l'appareil.

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const Sections = require('./seance-sections.js');

const R = path.join(__dirname, '../..');
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const BASE_REF = val('--base') || 'origin/main';
const CAPTURES = val('--captures');
const POLICES = val('--polices');
const JSON_F = val('--json');
const SECTION = 'forge';

function portLibre() {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.unref();
    s.on('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

// Une configuration de polices où le dossier donné passe devant tout le reste.
function configPolices(dossier, tmp) {
  const f = path.join(tmp, 'fonts.conf');
  const familles = fs.readdirSync(dossier).filter((x) => /\.(ttf|otf)$/i.test(x));
  if (!familles.length) throw new Error('--polices : aucun .ttf/.otf dans ' + dossier);
  const prefere = (nom) => '<alias binding="strong"><family>' + nom + '</family><prefer><family>Roboto</family></prefer></alias>';
  fs.writeFileSync(f, '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>' +
    '<include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>' + path.resolve(dossier) + '</dir>' +
    '<cachedir>' + path.join(tmp, 'cache') + '</cachedir>' +
    ['sans-serif', 'system-ui', 'DejaVu Sans'].map(prefere).join('') + '</fontconfig>');
  return f;
}

function jouer(programme, env) {
  return portLibre().then((port) => new Promise((ok) => {
    const journal = [];
    const p = spawn(process.execPath, [programme], {
      env: Object.assign({}, process.env, { BANC_PORT: String(port) }, env),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    p.stdout.on('data', (d) => journal.push(String(d)));
    p.stderr.on('data', (d) => journal.push(String(d)));
    p.on('exit', (code) => ok({ code, journal: journal.join('') }));
  }));
}

const GRAND = (x) => x.px >= 24 || (x.px >= 18.66 && x.w >= 700);
const SEUIL = (x) => (GRAND(x) ? 3 : 4.5);

// Les écarts d'un écran : base contre ce commit, texte par texte.
function comparer(nom, a, b) {
  const ecarts = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y || x.t !== y.t) {
      ecarts.push({ ecran: nom, i, quoi: 'texte', base: x ? x.t + ' (' + x.k + ')' : '∅', mien: y ? y.t + ' (' + y.k + ')' : '∅' });
      // Un texte en plus ou en moins décale tout le reste : on s'arrête au premier.
      break;
    }
    if (y.px < x.px - 0.01) ecarts.push({ ecran: nom, i, quoi: 'taille', t: x.t, k: y.k, base: x.px, mien: y.px });
    if (y.o < x.o - 0.01) ecarts.push({ ecran: nom, i, quoi: 'opacité', t: x.t, k: y.k, base: x.o, mien: y.o });
    if (y.coupe && !x.coupe) ecarts.push({ ecran: nom, i, quoi: 'coupé', t: x.t, k: y.k });
    if (x.c !== null && y.c !== null && y.c < SEUIL(y) && y.c < x.c - 0.05) {
      ecarts.push({ ecran: nom, i, quoi: 'contraste', t: x.t, k: y.k, base: x.c, mien: y.c });
    }
  }
  return ecarts;
}

async function principal() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'texte-visible-'));
  const sha = execFileSync('git', ['rev-parse', '--short', BASE_REF], { cwd: R }).toString().trim();
  const ici = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: R }).toString().trim();
  const sale = execFileSync('git', ['status', '--porcelain', '--', 'v2'], { cwd: R }).toString().trim();
  // Le v2/ de la base, extrait tel quel.
  const dossierBase = path.join(tmp, 'base');
  fs.mkdirSync(dossierBase);
  execFileSync('sh', ['-c', 'git archive ' + JSON.stringify(sha) + ' v2 | tar -x -C ' + JSON.stringify(dossierBase)], { cwd: R });

  const banc = Sections.lireBanc();
  const programme = Sections.ecrireProgramme(banc, Sections.choisir(banc, [SECTION]), tmp);
  const env = {};
  if (POLICES) env.FONTCONFIG_FILE = configPolices(POLICES, tmp);
  const capt = (q) => {
    if (!CAPTURES) return {};
    const d = path.join(CAPTURES, q);
    fs.mkdirSync(d, { recursive: true });
    return { BANC_CAPTURES: d };
  };
  const fBase = path.join(tmp, 'base.json'), fMien = path.join(tmp, 'mien.json');
  console.log('Texte visible : ' + ici + (sale ? ' (+ modifications non commitées)' : '') + ' contre ' + sha +
    (POLICES ? ', polices de ' + POLICES : ', polices du conteneur') + '…');
  const [jb, jm] = await Promise.all([
    jouer(programme, Object.assign({ BANC_V2: path.join(dossierBase, 'v2'), BANC_TEXTE: fBase }, env, capt('avant'))),
    jouer(programme, Object.assign({ BANC_TEXTE: fMien }, env, capt('apres')))
  ]);
  const lire = (f, j, q) => {
    if (!fs.existsSync(f)) {
      console.log('\n❌ pas de relevé « ' + q + ' » — le journal :\n' + j.journal.slice(-3000));
      process.exit(2);
    }
    return JSON.parse(fs.readFileSync(f, 'utf8')).ecrans;
  };
  const base = lire(fBase, jb, 'base'), mien = lire(fMien, jm, 'ce commit');
  // Le banc de CE commit doit passer ; celui de la base peut échouer sur les
  // contrôles propres à ce commit — seul son relevé compte.
  if (jm.code !== 0) console.log('\n⚠️ la section « forge » échoue sur ce commit :\n' +
    jm.journal.split('\n').filter((l) => /❌/.test(l)).join('\n'));

  const noms = Array.from(new Set(Object.keys(base).concat(Object.keys(mien))));
  const ecarts = [];
  noms.forEach((nom) => {
    if (!base[nom] || !mien[nom]) { ecarts.push({ ecran: nom, quoi: 'écran', base: !!base[nom], mien: !!mien[nom] }); return; }
    comparer(nom, base[nom], mien[nom]).forEach((e) => ecarts.push(e));
  });
  console.log('\n' + noms.length + ' écrans relevés (' + noms.map((n) => n + ' ' + (mien[n] || []).length).join(' · ') + ')');
  const total = noms.reduce((s, n) => s + (mien[n] || []).length, 0);
  console.log(total + ' textes comparés.');
  if (ecarts.length) {
    console.log('\n❌ ' + ecarts.length + ' écart(s) :');
    ecarts.forEach((e) => console.log('   ' + JSON.stringify(e)));
  } else {
    console.log('\n✅ zéro écart : mêmes textes, même ordre, aucune taille ni opacité en baisse, rien de coupé en plus, aucun contraste dégradé sous le seuil.');
  }
  // Les contrastes de CE commit sous le seuil, pour le rapport (pas un écart s'ils n'ont pas baissé).
  const faibles = {};
  noms.forEach((n) => (mien[n] || []).forEach((x) => {
    if (x.c === null || x.c >= SEUIL(x)) return;
    const k = x.k + ' — ' + x.c + ' (o ' + x.o + ')';
    faibles[k] = (faibles[k] || 0) + 1;
  }));
  if (Object.keys(faibles).length) {
    console.log('\nTextes sous 4,5:1 (3:1 en grand) sur ce commit — classe, contraste, opacité héritée :');
    Object.keys(faibles).sort().forEach((k) => console.log('   ' + k + ' ×' + faibles[k]));
  }
  if (JSON_F) fs.writeFileSync(JSON_F, JSON.stringify({ base: sha, ici, ecarts, releves: { base, mien } }, null, 1));
  process.exit(ecarts.length || jm.code !== 0 ? 1 : 0);
}

principal().catch((e) => { console.error(e); process.exit(2); });
