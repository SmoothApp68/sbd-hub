/**
 * INVENTAIRE PAR UNION A ∪ B. OUTIL D'AUDIT (v3).
 *
 * SOURCE A — statique : markup d'index.html + ids produits par le CODE des fonctions de
 *            rendu de la surface (source-a.js). Voit ce qui n'est JAMAIS rendu.
 * SOURCE B — dynamique : DOM réel capturé sur N états (inventaire-dom.js).
 *
 * L'ÉCART EST LE DÉTECTEUR :
 *   A seul → candidat 🔴 RENDU INATTEIGNABLE (à investiguer : quelle condition le garde ?)
 *   B seul → un générateur que la source A a raté → CORRIGER la source A, pas bricoler
 *
 * RÈGLE DE COMPTAGE (identique aux 4 vagues) :
 *   1 élément = 1 id unique OU 1 famille d'ids sériés/aléatoires.
 *   Familles : suffixe numérique/timestamp/uuid, préfixes aléatoires connus
 *   (`ectip`, `sg`, `rc`, `bwg` — app.js:10404-10405), et marqueur `<var>` de la source A.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./source-a');
const { famille } = require('./inventaire-dom');

/** Normalise un id (des deux sources) vers sa famille, pour que A et B soient comparables. */
// Préfixes dont le suffixe est une donnée variable (nom d'exercice encodé, aléatoire SVG).
// Sans ce regroupement, `why-btn-squat_barre_` et `why-btn-rowing_barre` compteraient pour
// deux éléments distincts côté B, et ne s'apparieraient pas au `why-btn-<n>` de la source A.
const PREFIXES_FAMILLE = ['why-btn-', 'why-answer-', 'plates-', 'grind-btn-', 'abandoned-btn-',
  'rpe-val-', 'rpe-legend-', 'sg', 'ectip', 'bwg', 'rc',
  // v3 : suffixe = zone de douleur ou index de note (checkin-coach-pain-Genou, -sleep-3…)
  'checkin-coach-pain-', 'checkin-coach-sleep-', 'checkin-coach-energy-',
  'checkin-coach-motivation-', 'checkin-coach-fresh-', 'mg-', 'chev-mg-',
  // suffixe numérique SANS séparateur (bdgSec0, bdgSec1…) — famille() ne le voit pas
  'bdgSec', 'sgPage', 'questCard'];

function norm(id) {
  if (!id) return id;
  if (id.endsWith('<var>')) id = id.slice(0, -5).replace(/-$/, '') + '<n>';
  else if (id.startsWith('<var:')) return id;
  else id = famille(id).replace(/<ts>|<uuid>/g, '<n>').replace(/<n>-<n>/g, '<n>');
  for (const p of PREFIXES_FAMILLE) {
    if (id.startsWith(p) && id.length > p.length) return p + '<n>';
    if (id === p.replace(/-$/, '') + '<alea>' || id === p.replace(/-$/, '') + '<n>') return p.replace(/-$/, '') + (p.endsWith('-') ? '-<n>' : '<n>');
  }
  return id;
}

function unir(cfgA, fichierB) {
  const a = A.sourceA(cfgA);
  const b = fs.existsSync(fichierB) ? JSON.parse(fs.readFileSync(fichierB, 'utf8')) : [];

  const map = new Map();
  const ajoute = (cle, patch) => {
    if (!map.has(cle)) map.set(cle, { cle, dansA: false, dansB: false, origines: [], etats: [],
      visible: false, raisons: [], cardinalite: 0, handlers: [] });
    Object.assign(map.get(cle), patch, {
      origines: [...new Set([...(map.get(cle).origines || []), ...(patch.origines || [])])],
      dansA: map.get(cle).dansA || !!patch.dansA,
      dansB: map.get(cle).dansB || !!patch.dansB,
      visible: map.get(cle).visible || !!patch.visible,
    });
  };

  a.markup.forEach((x) => ajoute(norm(x.id), { dansA: true, origines: ['index.html:' + x.ligne] }));
  a.codeIds.forEach((x) => ajoute(norm(x.id), { dansA: true, origines: [x.ou + ' [' + x.fonction + ']'] }));
  b.forEach((x) => ajoute(norm(x.fam), { dansB: true, visible: x.visible, etats: x.etats,
    raisons: x.raisons, cardinalite: x.cardinalite, handlers: x.handlers }));

  // ── Appariement des ids DYNAMIQUES entre A et B ────────────────────────────
  // La source A ne connaît que le PRÉFIXE littéral (`'wrap-' + id`), la source B voit
  // l'id complet (`wrap-sc2-3-1782…`). Sans cette passe, le même élément apparaîtrait
  // deux fois — une fois « A seul », une fois « B seul » — et gonflerait les deux écarts.
  const cles = [...map.keys()];
  const dynA = cles.filter((k) => k.endsWith('<n>') || k.endsWith('-'));
  dynA.forEach((ka) => {
    const ra = map.get(ka);
    if (!ra || !ra.dansA || ra.dansB) return;
    const prefixe = ka.replace(/<n>$/, '').replace(/-$/, '');
    if (prefixe.length < 3) return;
    const cible = cles.find((kb) => kb !== ka && map.get(kb) && map.get(kb).dansB
      && (kb.startsWith(prefixe + '-') || kb.startsWith(prefixe)));
    if (cible) {
      const rb = map.get(cible);
      rb.dansA = true;
      rb.origines = [...new Set([...(rb.origines || []), ...(ra.origines || [])])];
      map.delete(ka);
    }
  });
  // Fusionner les doublons de forme (`prog-chev-` et `prog-chev<n>` viennent du même code)
  [...map.keys()].forEach((k) => {
    if (!k.endsWith('-')) return;
    const jumeau = k.slice(0, -1) + '<n>';
    if (map.has(jumeau)) {
      const a1 = map.get(k), a2 = map.get(jumeau);
      a2.origines = [...new Set([...(a2.origines || []), ...(a1.origines || [])])];
      a2.dansA = a2.dansA || a1.dansA; a2.dansB = a2.dansB || a1.dansB;
      map.delete(k);
    }
  });

  const rows = [...map.values()].map((r, i) => Object.assign({ n: i + 1 }, r, {
    provenance: r.dansA && r.dansB ? 'A∩B' : r.dansA ? 'A seul' : 'B seul',
  }));
  return { rows, a, b };
}

module.exports = { unir, norm };

if (require.main === module) {
  const cfg = require(path.resolve(process.argv[2]));
  const { rows, a } = unir(cfg.sourceA, path.join(__dirname, cfg.sourceB));
  const c = { 'A∩B': 0, 'A seul': 0, 'B seul': 0 };
  rows.forEach((r) => c[r.provenance]++);
  fs.writeFileSync(path.join(__dirname, cfg.sortieUnion), JSON.stringify(rows, null, 1));
  console.log('\n=== UNION — ' + cfg.nom + ' ===');
  console.log('  estimation a priori : ' + (cfg.estimation || '(non fournie)'));
  console.log('  TOTAL A ∪ B         : ' + rows.length);
  console.log('    A∩B  : ' + c['A∩B'] + '   (vu dans le code ET rendu)');
  console.log('    A seul: ' + c['A seul'] + '   ← JAMAIS RENDU sur les états testés');
  console.log('    B seul: ' + c['B seul'] + '   ← générateur raté par la source A');
  if (cfg.estimation) {
    const ecart = Math.round((1 - rows.length / cfg.estimation) * 100);
    console.log('  écart / estimation  : ' + (ecart > 0 ? '-' + ecart + ' %' : '+' + (-ecart) + ' %')
      + (ecart > 30 ? '   ⚠️ SOUS-INVENTAIRE PROBABLE — chercher la zone manquante' : '   ✔ cohérent'));
  }
  console.log('\n  fonctions de rendu parcourues : ' + a.fonctions.length);
  console.log('\n--- A SEUL (jamais rendu) ---');
  rows.filter((r) => r.provenance === 'A seul').forEach((r) =>
    console.log('  ' + r.cle.padEnd(30) + r.origines.slice(0, 2).join(' · ')));
  console.log('\n--- B SEUL (source A à corriger) ---');
  rows.filter((r) => r.provenance === 'B seul').forEach((r) =>
    console.log('  ' + r.cle.padEnd(30) + 'états=' + (r.etats || []).length));
}
