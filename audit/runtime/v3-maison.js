/** VAGUE 3 — recensement PROFOND de la Maison (tab-dash). OUTIL D'AUDIT. */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const cfg = require('./cfg-v3-maison-coach');

async function blocs(page) {
  return page.evaluate(() => {
    const root = document.getElementById('tab-dash');
    if (!root) return { erreur: 'absent' };
    const out = [];
    root.querySelectorAll('.card, .dash-card, [class*="card"], section').forEach((el) => {
      const r = el.getBoundingClientRect();
      const t = (el.innerText || '').trim().split('\n').filter(Boolean);
      if (!t.length || r.height === 0) return;
      if (el.parentElement && el.parentElement.closest('.card')) return; // éviter les imbrications
      out.push(t[0].slice(0, 60));
    });
    return { cartes: [...new Set(out)], texte: (root.innerText || '').trim().slice(0, 400) };
  });
}

(async () => {
  console.log('# VAGUE 3 — Maison, recensement profond\n');
  const vus = new Map();
  for (const etat of cfg.etats.filter((e) => e.nom.startsWith('maison'))) {
    const db = etat.profil ? profiles.build(etat.profil) : profiles.build('aurel_like');
    if (etat.mut) etat.mut(db);
    const app = await H.openApp(db);
    const { page } = app;
    await page.evaluate(() => showTab('tab-dash'));
    await page.waitForTimeout(1400);
    const r = await blocs(page);
    (r.cartes || []).forEach((t) => { if (!vus.has(t)) vus.set(t, new Set()); vus.get(t).add(etat.nom); });
    console.log('## ' + etat.nom + '  → ' + (r.cartes || []).length + ' blocs');
    (r.cartes || []).forEach((t) => console.log('     • ' + t));
    await app.close();
  }
  console.log('\n# SYNTHÈSE MAISON');
  [...vus.entries()].sort((a, b) => a[1].size - b[1].size).forEach(([t, s]) =>
    console.log('  ' + String(s.size).padStart(2) + ' états · ' + t + (s.size <= 2 ? '   → ' + [...s].join(' ; ') : '')));
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
