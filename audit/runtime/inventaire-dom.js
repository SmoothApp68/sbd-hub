/**
 * INVENTAIRE PAR LE DOM RÉEL. OUTIL D'AUDIT (vagues 2-5).
 *
 * En vague 1 (Profil), le markup statique portait l'essentiel et 16 ids seulement
 * étaient injectés. Sur Séances / Maison / Coach / Stats / Social, c'est l'inverse :
 * l'onglet Séances ne compte que ~30 ids en dur, tout le reste est produit en JS.
 * Un `grep 'id="'` sur index.html y serait STRUCTURELLEMENT faux.
 *
 * Ce script énumère donc les ids RÉELLEMENT présents dans le conteneur de l'onglet,
 * dans plusieurs états (profils × sous-vues × actions), et fait l'union. Il note pour
 * chaque id s'il vient du markup statique (présent dans index.html) ou du runtime.
 *
 * RÈGLE DE COMPTAGE (documentée, appliquée uniformément) : les ids générés en boucle
 * (`exo-0`, `exo-1`, …) sont regroupés en UN élément « famille », avec la cardinalité
 * observée. Sans quoi le contrat N=N=N dépendrait du nombre de séances de la fixture.
 *
 * Usage : node audit/runtime/inventaire-dom.js <config.js>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const HTML = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8');
const MARKUP_IDS = new Set([...HTML.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

// Ids ALÉATOIRES connus (préfixe + Math.random().toString(36)) : ce sont des internes SVG
// ou des ancres d'infobulle, pas des éléments porteurs de donnée. Sans regroupement, chaque
// rendu en créerait un nouveau et gonflerait artificiellement l'inventaire.
const PREFIXES_ALEATOIRES = ['ectip', 'sg', 'rc', 'bwg'];

// Regroupe les ids sériés : suffixe numérique, uuid, timestamp, nom d'exercice encodé.
function famille(id) {
  for (const pfx of PREFIXES_ALEATOIRES) {
    if (new RegExp('^' + pfx + '[0-9a-z]{4,7}$').test(id)) return pfx + '<alea>';
  }
  return id
    .replace(/\d{9,}/g, '<ts>')                    // timestamps
    .replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '<uuid>')
    .replace(/(?<=[-_])\d+$/g, '<n>')              // suffixe numérique
    .replace(/-\d+-/g, '-<n>-')
    .replace(/_\d+_/g, '_<n>_');
}

async function enumereIds(page, conteneur) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out = [];
    root.querySelectorAll('[id]').forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        id: el.id,
        tag: el.tagName.toLowerCase(),
        vis: cs.display !== 'none' && cs.visibility !== 'hidden' && !(r.width === 0 && r.height === 0),
        why: cs.display === 'none' ? ('display:none' + (el.style.display === 'none' ? ' (inline)' : ''))
          : cs.visibility === 'hidden' ? 'visibility:hidden'
            : (r.width === 0 && r.height === 0) ? 'boîte 0×0' : '',
        handlers: ['onclick', 'onchange', 'oninput', 'onblur', 'onsubmit']
          .filter((h) => el.hasAttribute(h)).map((h) => h + '=' + el.getAttribute(h).slice(0, 110)),
      });
    });
    if (root.id) out.unshift({ id: root.id, tag: root.tagName.toLowerCase(), vis: true, why: '', handlers: [] });
    return out;
  }, conteneur);
}

async function run(cfg) {
  const acc = new Map();   // famille -> { ids:Set, tag, visQqPart, whys:Set, handlers:Set, etats:Set }
  for (const etat of cfg.etats) {
    const db = etat.profil ? profiles.build(etat.profil) : profiles.build('aurel_like');
    if (etat.mut) etat.mut(db);
    const app = await H.openApp(db, etat.opts || {});
    const { page } = app;
    try {
      if (cfg.prepare) await cfg.prepare(page, etat);
      if (etat.action) await etat.action(page);
      await page.waitForTimeout(etat.settle || 800);
      const ids = await enumereIds(page, etat.conteneur || cfg.conteneur);
      ids.forEach((e) => {
        const f = famille(e.id);
        if (!acc.has(f)) acc.set(f, { fam: f, ids: new Set(), tag: e.tag, vis: false, whys: new Set(), handlers: new Set(), etats: new Set() });
        const a = acc.get(f);
        a.ids.add(e.id);
        if (e.vis) a.vis = true; else if (e.why) a.whys.add(e.why);
        e.handlers.forEach((h) => a.handlers.add(h));
        a.etats.add(etat.nom);
      });
      process.stderr.write('  état « ' + etat.nom + ' » → ' + ids.length + ' ids\n');
    } catch (e) {
      process.stderr.write('  état « ' + etat.nom + ' » ÉCHEC : ' + e.message.split('\n')[0] + '\n');
    }
    await app.close();
  }

  const rows = [...acc.values()].map((a, i) => ({
    n: i + 1,
    fam: a.fam,
    cardinalite: a.ids.size,
    exemple: [...a.ids][0],
    tag: a.tag,
    source: MARKUP_IDS.has([...a.ids][0]) ? 'markup' : 'runtime',
    visible: a.vis,
    raisons: [...a.whys],
    handlers: [...a.handlers],
    etats: [...a.etats],
  }));
  return rows;
}

module.exports = { run, famille, MARKUP_IDS };

if (require.main === module) {
  const cfg = require(path.resolve(process.argv[2]));
  run(cfg).then((rows) => {
    const out = path.join(__dirname, cfg.sortie);
    fs.writeFileSync(out, JSON.stringify(rows, null, 1));
    const mk = rows.filter((r) => r.source === 'markup').length;
    console.log('\n=== ' + cfg.nom + ' ===');
    console.log('éléments inventoriés : ' + rows.length + '   (markup ' + mk + ' · runtime ' + (rows.length - mk) + ')');
    console.log('jamais visibles       : ' + rows.filter((r) => !r.visible).length);
    console.log('familles sériées      : ' + rows.filter((r) => r.cardinalite > 1).length);
    console.log('→ ' + out);
  }).catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
}
