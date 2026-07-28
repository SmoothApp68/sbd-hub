/**
 * PHASE 5a — VISIBILITÉ RÉELLE des 176 éléments inventoriés. OUTIL D'AUDIT.
 *
 * Question posée : l'élément est-il dans le DOM, et l'utilisateur le VOIT-IL ?
 * `isVisible()` de Playwright tient compte de display:none, visibility:hidden et
 * d'une boîte de taille nulle — c'est ce qui distingue « présent » de « vu ».
 *
 * Deux passes par profil :
 *   - accordéons FERMÉS (état d'arrivée sur l'onglet)
 *   - accordéons OUVERTS (ce que l'utilisateur obtient après avoir tapé partout)
 * Un élément invisible dans les DEUX passes est inatteignable par la voie normale.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const ELEMENTS = require('./elements.json');

const PROFILS = process.argv[2] ? [process.argv[2]] : ['aurel_like', 'vierge', 'debutant'];

async function probeAll(page) {
  return page.evaluate((els) => {
    const out = {};
    els.forEach((e) => {
      const el = document.getElementById(e.id);
      if (!el) { out[e.id] = { dom: false, vis: false, why: 'absent du DOM' }; return; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // visible = rendu (offsetParent non nul ou position fixed) ET boîte non nulle
      const hidden = cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
      const zero = r.width === 0 && r.height === 0;
      let why = '';
      if (cs.display === 'none') why = 'display:none' + (el.style.display === 'none' ? ' (INLINE)' : ' (calculé)');
      else if (cs.visibility === 'hidden') why = 'visibility:hidden';
      else if (zero) why = 'boîte 0×0';
      out[e.id] = { dom: true, vis: !hidden && !zero, why, w: Math.round(r.width), h: Math.round(r.height) };
    });
    return out;
  }, els(ELEMENTS));
}
function els(list) { return list.map((e) => ({ id: e.id })); }

(async () => {
  const results = {};
  for (const name of PROFILS) {
    const db = profiles.build(name);
    const app = await H.openApp(db);
    const { page } = app;
    await H.gotoProfil(page, 'tab-corps');
    await H.gotoProfil(page, 'tab-settings');   // force fillSettingsFields → injecte les sections runtime
    await page.waitForTimeout(500);

    const closed = await probeAll(page);
    await H.openAllAccordions(page);
    await H.gotoProfil(page, 'tab-corps');
    const openCorps = await probeAll(page);
    await H.gotoProfil(page, 'tab-settings');
    await H.openAllAccordions(page);
    const openSettings = await probeAll(page);

    results[name] = {};
    ELEMENTS.forEach((e) => {
      const c = closed[e.id], a = openCorps[e.id], b = openSettings[e.id];
      const dom = c.dom || a.dom || b.dom;
      const vis = c.vis || a.vis || b.vis;
      const why = [c, a, b].filter((x) => x.dom && !x.vis).map((x) => x.why)[0] || (dom ? '' : 'absent du DOM');
      results[name][e.id] = { dom, vis, why };
    });
    results[name]._errors = app.errors.filter((e) => !/vibrate|Failed to load resource|Cloud sign-in/.test(e));
    await app.close();
    process.stderr.write('profil ' + name + ' OK\n');
  }

  // ── Rapport ──
  console.log('# PHASE 5a — visibilité réelle (profils : ' + PROFILS.join(', ') + ')\n');
  const invisibles = [];
  ELEMENTS.forEach((e) => {
    const per = PROFILS.map((p) => results[p][e.id]);
    const anyVis = per.some((x) => x.vis);
    const anyDom = per.some((x) => x.dom);
    if (!anyVis) invisibles.push({ e, per, anyDom });
  });
  console.log('Éléments JAMAIS visibles, dans AUCUN profil : ' + invisibles.length + '/' + ELEMENTS.length + '\n');
  invisibles.forEach(({ e, per, anyDom }) => {
    console.log('  #' + e.n + ' ' + e.id + '  [' + e.sec + ']');
    console.log('      DOM=' + anyDom + '  raisons=' + JSON.stringify(PROFILS.reduce((o, p, i) => { o[p] = per[i].why || (per[i].vis ? 'visible' : '?'); return o; }, {})));
  });
  console.log('\n## Détail par profil (visible / DOM / total)');
  PROFILS.forEach((p) => {
    const v = ELEMENTS.filter((e) => results[p][e.id].vis).length;
    const d = ELEMENTS.filter((e) => results[p][e.id].dom).length;
    console.log('  ' + p.padEnd(14) + ' visibles=' + v + '  dans le DOM=' + d + '  /' + ELEMENTS.length);
    if (results[p]._errors.length) console.log('     erreurs JS : ' + results[p]._errors.slice(0, 5).join(' | ').slice(0, 300));
  });
  require('fs').writeFileSync(__dirname + '/out-5a.json', JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ECHEC 5a:', e.stack); process.exit(1); });
