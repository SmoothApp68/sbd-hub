/**
 * SCAN STATIQUE — générateurs orphelins.
 * OUTIL D'AUDIT, read-only. N'exécute pas l'app, ne modifie rien.
 *
 * Motif recherché (celui de renderWeeklyPlanUI / wpApplyDay) :
 *   un getElementById d'un id qui n'est JAMAIS créé, gardé par un `if (!x) return`
 *   silencieux — la fonction sort sans rien faire et sans le dire.
 *
 * Méthode : ids LUS ∖ ids CRÉÉS.
 *   LUS    : getElementById('X') · querySelector('#X') · querySelectorAll('#X')
 *   CRÉÉS  : index.html (id="X") + tout littéral id="X" / id='X' dans js/
 *            + .id = 'X' + setAttribute('id','X')
 *   Les créations dynamiques (id="${v}", id="' + v + '") sont collectées à part comme
 *   PRÉFIXES : un id lu qui commence par un préfixe connu n'est PAS déclaré orphelin
 *   (on ne peut pas trancher statiquement) — il sort en « indéterminé ».
 *
 * La preuve d'orphelinat est ici STATIQUE (le littéral n'existe nulle part, donc aucun
 * chemin ne peut le créer) ; le banc runtime la confirme sur les états réels.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JS_FILES = ['app.js', 'engine.js', 'supabase.js', 'coach.js', 'program.js',
                  'import.js', 'joints.js', 'exercises.js'];

function lire(p) { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } }

const HTML = lire('index.html');
const SRC = {};
JS_FILES.forEach((f) => { SRC[f] = lire(path.join('js', f)); });

// ── ids CRÉÉS ────────────────────────────────────────────────────────────────
const crees = new Set();
const prefixes = new Set();

function collecterCreations(txt) {
  // id="litteral"  /  id='litteral'  /  id=\"litteral\" (échappé dans une chaîne JS)
  for (const m of txt.matchAll(/\bid\s*=\s*\\?["']([^"'${\\]+)\\?["']/g)) crees.add(m[1].trim());
  // id="prefixe-${...}" ou id="prefixe' + v  → préfixe seulement
  for (const m of txt.matchAll(/\bid\s*=\s*\\?["']([^"'$\\]*)\$\{/g)) if (m[1]) prefixes.add(m[1]);
  for (const m of txt.matchAll(/\bid\s*=\s*\\?["']([^"'\\]*?)\\?["']\s*\+/g)) if (m[1]) prefixes.add(m[1]);
  // el.id = 'X'   /   setAttribute('id','X')
  for (const m of txt.matchAll(/\.id\s*=\s*["']([^"'${]+)["']/g)) crees.add(m[1].trim());
  for (const m of txt.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["']([^"'${]+)["']/g)) crees.add(m[1].trim());
  // Overlays du système unifié : showSheet/showModal/... ({ id: 'X' }) → _uiOpen fait
  // `if (opts.id) overlay.id = opts.id` (app.js:1522). L'id n'apparaît donc JAMAIS
  // comme littéral `id="X"` : sans ça, tout overlay nommé serait déclaré orphelin.
  // Fenêtre de 30 lignes après l'appel, pour ne pas ramasser les `id:` des tables de
  // données (EXO_DB, badges…) qui ne sont pas des ids DOM.
  const lignes = txt.split('\n');
  lignes.forEach((l, i) => {
    if (!/show(Sheet|Modal|Confirm|InfoModal)\s*\(|_uiOpen\s*\(/.test(l)) return;
    lignes.slice(i, i + 30).join('\n').replace(/\bid\s*:\s*["']([^"'${]+)["']/g,
      (_, id) => { crees.add(id.trim()); return _; });
  });
}
collecterCreations(HTML);
JS_FILES.forEach((f) => collecterCreations(SRC[f]));

// ── ids LUS ──────────────────────────────────────────────────────────────────
const lus = [];   // { id, fichier, ligne, brut }
function collecterLectures(fichier, txt) {
  const lignes = txt.split('\n');
  lignes.forEach((l, i) => {
    for (const m of l.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g))
      lus.push({ id: m[1], fichier, ligne: i + 1, brut: l.trim() });
    for (const m of l.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)["']/g))
      lus.push({ id: m[1], fichier, ligne: i + 1, brut: l.trim() });
  });
}
JS_FILES.forEach((f) => collecterLectures('js/' + f, SRC[f]));

// ── Différence ───────────────────────────────────────────────────────────────
const couvertParPrefixe = (id) => [...prefixes].some((p) => p && id.startsWith(p));

const manquants = new Map();       // id → [lectures]
const indetermines = new Map();    // id couvert par un préfixe dynamique
lus.forEach((r) => {
  if (crees.has(r.id)) return;
  const cible = couvertParPrefixe(r.id) ? indetermines : manquants;
  if (!cible.has(r.id)) cible.set(r.id, []);
  cible.get(r.id).push(r);
});

// ── Le motif : la lecture est-elle gardée par un `if (!x) return` silencieux ? ─
function fonctionEnglobante(txt, ligne) {
  const lignes = txt.split('\n');
  for (let i = ligne - 1; i >= 0; i--) {
    const m = lignes[i].match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (m) return { nom: m[1], ligne: i + 1 };
  }
  return null;
}

function corpsFonction(txt, ligneDebut) {
  const lignes = txt.split('\n');
  let profondeur = 0, demarre = false, out = [];
  for (let i = ligneDebut - 1; i < lignes.length; i++) {
    out.push(lignes[i]);
    for (const c of lignes[i]) {
      if (c === '{') { profondeur++; demarre = true; }
      else if (c === '}') { profondeur--; }
    }
    if (demarre && profondeur === 0) break;
  }
  return out.join('\n');
}

const resultats = [];
for (const [id, lectures] of manquants) {
  lectures.forEach((r) => {
    const txt = SRC[r.fichier.replace('js/', '')] || '';
    const fn = fonctionEnglobante(txt, r.ligne);
    let garde = null;
    if (fn) {
      const corps = corpsFonction(txt, fn.ligne);
      // La variable qui reçoit la lecture
      const mv = r.brut.match(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/);
      const v = mv ? mv[1] : null;
      if (v) {
        // `if (!v) return;` ou `if (!a || !v) return;` — sortie SILENCIEUSE
        const re = new RegExp('if\\s*\\([^)]*!\\s*' + v.replace(/\$/g, '\\$') + '\\b[^)]*\\)\\s*(?:\\{\\s*)?return\\b[^;]*;');
        const g = corps.match(re);
        if (g) garde = g[0].trim();
      }
    }
    resultats.push({ id, fichier: r.fichier, ligne: r.ligne, fonction: fn ? fn.nom : '(hors fonction)',
                     ligneFonction: fn ? fn.ligne : null, garde, brut: r.brut.slice(0, 110) });
  });
}

// ── Sortie ───────────────────────────────────────────────────────────────────
const avecGarde = resultats.filter((r) => r.garde);
const sansGarde = resultats.filter((r) => !r.garde);

console.log('ids créés (littéraux)      : ' + crees.size);
console.log('préfixes dynamiques        : ' + prefixes.size);
console.log('lectures d\'id (littérales) : ' + lus.length + '  → ids distincts : ' + new Set(lus.map((r) => r.id)).size);
console.log('ids lus JAMAIS créés       : ' + manquants.size);
console.log('ids indéterminés (préfixe) : ' + indetermines.size);
console.log('');
console.log('══ MOTIF EXACT — lecture d\'un id absent + garde `if (!x) return` silencieuse ══');
avecGarde.forEach((r) => {
  console.log('  #' + r.id);
  console.log('     ' + r.fichier + ':' + r.ligne + '  dans ' + r.fonction + '() ligne ' + r.ligneFonction);
  console.log('     garde : ' + r.garde);
});
console.log('\n══ ids absents SANS garde de sortie (autre motif — signalé, pas investigué) ══');
const parId = {};
sansGarde.forEach((r) => { (parId[r.id] = parId[r.id] || []).push(r.fichier + ':' + r.ligne + ' ' + r.fonction + '()'); });
Object.keys(parId).sort().forEach((id) => console.log('  #' + id + '  → ' + parId[id].join(' · ')));

console.log('\n══ indéterminés (id couvert par un préfixe dynamique) ══');
[...indetermines.keys()].sort().forEach((id) => console.log('  #' + id));

fs.writeFileSync(path.join(__dirname, 'out-orphelins.json'),
  JSON.stringify({ avecGarde, sansGarde, indetermines: [...indetermines.keys()] }, null, 2));
console.log('\n→ audit/runtime/out-orphelins.json');
