/**
 * VAGUE 4 — TEST DE CONSOMMATION des Stats. OUTIL D'AUDIT.
 *
 * Le piège dominant de cette surface : une valeur affichée avec un repli, identique quelles que
 * soient les données sources. On capture donc la valeur RENDUE de chaque conteneur, pour 9 profils
 * aux historiques très différents, et on repère ceux dont la sortie NE BOUGE JAMAIS.
 * Un conteneur invariant sur 9 historiques distincts est soit statique, soit piloté par un repli.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const ELS = require('./out-v4-elements.json');

const SUBS = ['stats-volume', 'stats-muscles', 'stats-records', 'stats-cardio'];
const PROFILS = ['aurel_like', 'vierge', 'debutant', 'mono_lift', 'donnees_sales',
  'extreme_haut', 'extreme_bas', 'progression_nette', 'retour_apres_pause'];

(async () => {
  console.log('# VAGUE 4 — consommation : la sortie bouge-t-elle avec les données ?\n');
  const valeurs = {};   // id -> { profil: texte }
  const contexte = {};

  for (const prof of PROFILS) {
    const app = await H.openApp(profiles.build(prof));
    const { page } = app;
    contexte[prof] = await page.evaluate(() => ({
      logs: (db.logs || []).length, bestPR: db.bestPR,
      exos: Object.keys(db.exercises || {}).length,
    }));
    for (const sub of SUBS) {
      await page.evaluate((s) => { showTab('tab-stats'); showStatsSub(s); }, sub);
      await page.waitForTimeout(1200);
      // ⚠️ Ne capturer QUE la sous-section active. Sinon on relit un conteneur d'une AUTRE
      // sous-section, encore porteur de son markup statique — c'est ce qui m'a fait prendre
      // le placeholder « Aucune session cardio détectée » pour une sortie invariante.
      const t = await page.evaluate((s2) => {
        const out = {};
        const sec = document.getElementById(s2);
        if (!sec) return out;
        sec.querySelectorAll('[id]').forEach((el) => {
          const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90);
          if (txt) out[el.id] = txt;
        });
        const secTxt = (sec.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90);
        if (secTxt) out[s2] = secTxt;
        return out;
      }, sub);
      Object.entries(t).forEach(([id, txt]) => {
        valeurs[id] = valeurs[id] || {};
        valeurs[id][prof] = txt;      // une seule sous-section peut produire cet id
      });
    }
    await app.close();
    process.stderr.write('  ' + prof + ' ok (' + contexte[prof].logs + ' séances)\n');
  }

  console.log('## Contexte des profils');
  PROFILS.forEach((p) => console.log('   ' + p.padEnd(20) + contexte[p].logs + ' séances · '
    + Object.keys(contexte[p].exos ? {} : {}).length + JSON.stringify(contexte[p].bestPR)));

  console.log('\n## Conteneurs et variabilité de leur rendu');
  const invariants = [], variables = [];
  Object.entries(valeurs).forEach(([id, parProfil]) => {
    const distincts = new Set(Object.values(parProfil));
    const ligne = { id, n: distincts.size, profils: Object.keys(parProfil).length,
      exemple: [...distincts][0] };
    if (distincts.size === 1) invariants.push(ligne); else variables.push(ligne);
  });
  console.log('\n### ✔ Sortie VARIABLE selon les données (' + variables.length + ')');
  variables.sort((a, b) => b.n - a.n).forEach((v) =>
    console.log('   ' + v.id.padEnd(26) + v.n + ' valeurs distinctes / ' + v.profils + ' profils'));
  console.log('\n### ⚠ Sortie INVARIANTE sur les ' + PROFILS.length + ' profils (' + invariants.length + ')');
  invariants.forEach((v) =>
    console.log('   ' + v.id.padEnd(26) + '« ' + v.exemple.slice(0, 60) + ' »'));

  require('fs').writeFileSync(__dirname + '/out-v4-consommation.json',
    JSON.stringify({ contexte, valeurs }, null, 1));
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
