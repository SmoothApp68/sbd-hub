/**
 * VAGUE 3 — recensement des CARTES du Coach et de la Maison. OUTIL D'AUDIT.
 *
 * Les cartes du Coach n'ont pas d'id : un inventaire par id les manquerait toutes.
 * On énumère donc les blocs de premier niveau rendus dans #coach-today / #tab-dash,
 * identifiés par leur TITRE visible, sur un large éventail de profils et d'états.
 * Objectif : repérer une carte qui ne s'affiche JAMAIS (rendu inatteignable).
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const cfg = require('./cfg-v3-maison-coach');

async function cartes(page, sel) {
  return page.evaluate((s) => {
    const root = document.querySelector(s);
    if (!root) return { erreur: 'conteneur absent' };
    const out = [];
    // Blocs de premier niveau : enfants directs porteurs de contenu
    Array.from(root.querySelectorAll(':scope > div, :scope > .card, :scope > section')).forEach((el) => {
      const r = el.getBoundingClientRect();
      const t = (el.innerText || '').trim().split('\n').filter(Boolean);
      if (!t.length) return;
      out.push({ titre: t[0].slice(0, 70), lignes: t.length, h: Math.round(r.height),
        visible: r.height > 0 && getComputedStyle(el).display !== 'none', classe: (el.className || '').slice(0, 40) });
    });
    return { html: root.innerHTML.length, texte: (root.innerText || '').trim().length, cartes: out };
  }, sel);
}

const ETATS = cfg.etats;

(async () => {
  console.log('# VAGUE 3 — recensement des cartes\n');
  const vus = new Map();   // titre -> Set(états)
  const parEtat = [];

  for (const etat of ETATS) {
    const db = etat.profil ? profiles.build(etat.profil) : profiles.build('aurel_like');
    if (etat.mut) etat.mut(db);
    const app = await H.openApp(db);
    const { page } = app;
    const err = [];
    page.on('pageerror', (e) => err.push(String(e.message).split('\n')[0]));
    try {
      if (etat.action) await etat.action(page);
      await page.waitForTimeout(etat.settle || 1200);
      const sel = etat.conteneur === '#s-coach' ? '#coach-today' : '#tab-dash';
      const r = await cartes(page, sel);
      const noms = (r.cartes || []).filter((c) => c.visible).map((c) => c.titre);
      noms.forEach((t) => { if (!vus.has(t)) vus.set(t, new Set()); vus.get(t).add(etat.nom); });
      parEtat.push({ etat: etat.nom, sel, html: r.html, texte: r.texte, nb: noms.length, noms, err: err.slice(0, 2) });
      console.log('## ' + etat.nom + '   [' + sel + ']  html=' + r.html + 'o  texte=' + r.texte + 'c  cartes=' + noms.length);
      noms.forEach((t) => console.log('     • ' + t));
      if (err.length) console.log('     ⚠ erreurs JS : ' + err.slice(0, 2).join(' | ').slice(0, 160));
    } catch (e) {
      console.log('## ' + etat.nom + '  ÉCHEC : ' + e.message.split('\n')[0]);
    }
    await app.close();
  }

  console.log('\n\n# SYNTHÈSE — chaque carte, et où elle apparaît');
  const tri = [...vus.entries()].sort((a, b) => a[1].size - b[1].size);
  tri.forEach(([titre, etats]) => {
    console.log('  ' + String(etats.size).padStart(2) + ' états · ' + titre);
    if (etats.size <= 2) console.log('        → ' + [...etats].join(' ; '));
  });
  require('fs').writeFileSync(__dirname + '/out-v3-cartes.json',
    JSON.stringify({ parEtat, cartes: [...vus.entries()].map(([t, s]) => ({ titre: t, etats: [...s] })) }, null, 1));
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
