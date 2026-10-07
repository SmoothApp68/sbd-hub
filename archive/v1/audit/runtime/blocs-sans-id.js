/**
 * RECENSEMENT DES BLOCS SANS `id`. OUTIL D'AUDIT (v3).
 *
 * La règle de comptage retenue est : « 1 élément = 1 id unique OU 1 bloc de rendu identifiable
 * sans id (carte, section, ligne de tableau générée) ». L'inventaire par ids seuls manque donc
 * tout ce qui est rendu par CLASSE — ce qui, sur Stats, représente l'essentiel du contenu
 * (jauges de volume, lignes de ratio, lignes de lift, sous-groupes musculaires).
 *
 * Ce script énumère les blocs sans id, regroupés par SIGNATURE DE CLASSE : une signature =
 * un élément (les N instances comptent pour 1, avec leur cardinalité).
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

async function recense(page, conteneur) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const par = new Map();
    root.querySelectorAll('*').forEach((el) => {
      if (el.id) return;                                   // déjà couvert par l'inventaire d'ids
      if (el.closest('[id]') === null) return;
      const cls = (el.className && typeof el.className === 'string') ? el.className.trim() : '';
      if (!cls) return;                                    // pas de signature exploitable
      // Ne compter que le bloc EXTERNE d'un groupe : si le parent porte lui aussi une classe
      // et n'a pas d'id, cet élément en est un sous-élément (`div.lc-rank` dans `div.lc`).
      // Sans ce filtre, une carte de lift compterait pour 9 éléments au lieu d'un.
      const par2 = el.parentElement;
      if (par2 && !par2.id && par2.className && typeof par2.className === 'string'
          && par2.className.trim()) return;
      const r = el.getBoundingClientRect();
      const sig = el.tagName.toLowerCase() + '.' + cls.split(/\s+/).slice(0, 2).join('.');
      if (!par.has(sig)) par.set(sig, { sig, n: 0, visible: false, exemple: '' });
      const e = par.get(sig);
      e.n++;
      if (r.height > 0 && getComputedStyle(el).display !== 'none') e.visible = true;
      if (!e.exemple) e.exemple = (el.innerText || '').trim().split('\n')[0].slice(0, 50);
    });
    return [...par.values()];
  }, conteneur);
}

async function run(cfg) {
  const acc = new Map();
  for (const etat of cfg.etats) {
    const db = etat.profil ? profiles.build(etat.profil) : profiles.build('aurel_like');
    if (etat.mut) etat.mut(db);
    const app = await H.openApp(db);
    const { page } = app;
    try {
      if (etat.action) await etat.action(page);
      await page.waitForTimeout(etat.settle || 1200);
      (await recense(page, etat.conteneur || cfg.conteneur)).forEach((b) => {
        if (!acc.has(b.sig)) acc.set(b.sig, { sig: b.sig, n: 0, visible: false, exemple: b.exemple, etats: 0 });
        const e = acc.get(b.sig);
        e.n = Math.max(e.n, b.n); e.visible = e.visible || b.visible; e.etats++;
        if (!e.exemple) e.exemple = b.exemple;
      });
    } catch (e) { process.stderr.write('  état ' + etat.nom + ' ÉCHEC\n'); }
    await app.close();
  }
  return [...acc.values()].sort((a, b) => b.n - a.n);
}

module.exports = { run };

if (require.main === module) {
  const cfg = require(require('path').resolve(process.argv[2]));
  run(cfg).then((rows) => {
    console.log('\n=== BLOCS SANS ID — ' + cfg.nom + ' ===');
    console.log('signatures distinctes : ' + rows.length);
    rows.forEach((r) => console.log('  ' + String(r.n).padStart(3) + '× ' + r.sig.padEnd(42)
      + (r.visible ? 'vis ' : 'INV ') + '« ' + r.exemple + ' »'));
    require('fs').writeFileSync(require('path').join(__dirname, cfg.sortieBlocs || 'out-blocs.json'),
      JSON.stringify(rows, null, 1));
  }).catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
}
