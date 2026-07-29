/**
 * PHASE 5c — TEST DE CONSOMMATION. OUTIL D'AUDIT.
 *
 * Un champ peut être écrit, persisté, ré-affiché… et ne piloter aucune sortie.
 * Ici on modifie une valeur puis on vérifie que la SORTIE DÉPENDANTE bouge À L'ÉCRAN.
 * Si elle ne bouge pas, le champ est stocké mais pas consommé.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const txt = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); return el ? el.textContent.trim() : '(absent)';
}, sel);

async function ouvrirCorps(page) {
  await H.gotoProfil(page, 'tab-corps');
  await H.openAllAccordions(page);
  await page.waitForTimeout(400);
}

(async () => {
  console.log('# PHASE 5c — la sortie dépendante bouge-t-elle ?\n');

  // ── F4 : les deux chaînes caloriques, dans la MÊME carte ──────────────────
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await ouvrirCorps(page);
    const avant = {
      objectif: await txt(page, '#nutriCible'),
      tdee: await txt(page, '#nutriTDEELabel'),
      restantes: await txt(page, '#nutriKcalRestantes'),
      protCible: await txt(page, '#nutriProtCible'),
    };
    // on ne touche QUE kcalBase/bwBase (entrées de calcCalorieCible), rien d'autre
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.fill('#inputKcalBase', '3000'); await page.dispatchEvent('#inputKcalBase', 'change');
    await page.fill('#inputBWBase', '80');     await page.dispatchEvent('#inputBWBase', 'change');
    await page.waitForTimeout(2800);
    await ouvrirCorps(page);
    const apres = {
      objectif: await txt(page, '#nutriCible'),
      tdee: await txt(page, '#nutriTDEELabel'),
      restantes: await txt(page, '#nutriKcalRestantes'),
      protCible: await txt(page, '#nutriProtCible'),
    };
    console.log('## F4 — kcalBase 2300→3000, bwBase →80 (n\'affectent QUE calcCalorieCible)');
    console.log('   « Objectif » (nutriCible)      : ' + avant.objectif + '  →  ' + apres.objectif
      + (avant.objectif !== apres.objectif ? '   ✔ réagit (chaîne calcCalorieCible)' : '   ✘ inerte'));
    console.log('   « TDEE estimé » (nutriTDEELabel): ' + avant.tdee + '  →  ' + apres.tdee
      + (avant.tdee === apres.tdee ? '   ← INCHANGÉ (chaîne calcTDEE, indépendante)' : '   a bougé'));
    console.log('   « Restantes »                  : ' + avant.restantes + '  →  ' + apres.restantes);
    console.log('   « Prot cible »                 : ' + avant.protCible + '  →  ' + apres.protCible
      + (avant.protCible !== apres.protCible ? '   (macros dérivées de calcCalorieCible)' : ''));
    const deux = await page.evaluate(() => ({
      calcCalorieCible: typeof calcCalorieCible === 'function' ? calcCalorieCible(getUserBW()) : '(absent)',
      calcTDEE: typeof calcTDEE === 'function' ? calcTDEE(getUserBW(), 0) : '(absent)',
      bw: typeof getUserBW === 'function' ? getUserBW() : '?',
    }));
    console.log('   valeurs brutes : calcCalorieCible=' + deux.calcCalorieCible
      + '  vs  calcTDEE=' + deux.calcTDEE + '   (même bw=' + deux.bw + ')');
    await app.close();
  }

  // ── F17 : fatPct hors bornes moteur (UI accepte jusqu'à 60, Katch exige < 50) ──
  {
    console.log('\n## F17 — fatPct : l\'UI accepte max=60, calcTDEE n\'utilise Katch que si < 50');
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    for (const v of ['15', '49', '55']) {
      await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
      await page.fill('#inputFatPct', v); await page.dispatchEvent('#inputFatPct', 'change');
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({
        stocke: db.user.fatPct,
        tdee: typeof calcTDEE === 'function' ? calcTDEE(getUserBW(), 0) : '?',
        katch: typeof calcTDEEKatchMcArdle === 'function' && db.user.fatPct
          ? calcTDEEKatchMcArdle(getUserBW(), db.user.fatPct, 1.6, 0) : '?',
      }));
      console.log('   fatPct=' + v.padEnd(4) + ' → stocké=' + String(r.stocke).padEnd(6)
        + ' calcTDEE=' + String(r.tdee).padEnd(6) + ' (Katch pur=' + r.katch + ')'
        + (parseFloat(v) >= 50 ? '   ← ≥50 : Katch IGNORÉ, repli Mifflin' : ''));
    }
    await app.close();
  }

  // ── F13 : targetBW pilote-t-il quoi que ce soit ? ──────────────────────────
  {
    console.log('\n## F13 — targetBW : une sortie bouge-t-elle ?');
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await ouvrirCorps(page);
    const snapAvant = await page.evaluate(() => document.getElementById('tab-corps').innerText);
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.fill('#settingsTargetBW', '82'); await page.dispatchEvent('#settingsTargetBW', 'change');
    await page.waitForTimeout(2800);
    await ouvrirCorps(page);
    const snapApres = await page.evaluate(() => document.getElementById('tab-corps').innerText);
    const set = await page.evaluate(() => ({ tb: db.user.targetBW,
      contientDansSettings: document.getElementById('tab-settings').innerText.includes('82') }));
    console.log('   targetBW stocké = ' + set.tb);
    console.log('   onglet Corps identique avant/après ? ' + (snapAvant === snapApres ? 'OUI — aucune sortie ne bouge' : 'NON — quelque chose a changé'));
    if (snapAvant !== snapApres) {
      const a = snapAvant.split('\n'), b = snapApres.split('\n');
      console.log('   lignes différentes : ' + b.filter((l, i) => l !== a[i]).slice(0, 4).join(' | '));
    }
    await app.close();
  }

  // ── F12 : trainingDuration écrase-t-il vraiment programParams.duration ? ───
  {
    console.log('\n## F12 — un blob porteur de trainingDuration=45 prime-t-il sur duration=90 ?');
    const db = profiles.build('aurel_like');
    db.user.programParams = Object.assign({}, db.user.programParams, { duration: 90 });
    db.user.trainingDuration = 45;   // ce que ferait un blob cloud ancien / un import
    const app = await H.openApp(db);
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const btnActif = document.querySelector('#settingsDuration button.active');
      return {
        uiAffiche: btnActif ? btnActif.textContent.trim() : '(aucun bouton actif)',
        paramsDuration: (db.user.programParams || {}).duration,
        trainingDuration: db.user.trainingDuration,
        // reproduction du motif de lecture réel : `trainingDuration || params.duration || 90`
        ceQueLitLeGenerateur: (db.user && db.user.trainingDuration) || (db.user.programParams || {}).duration || 90,
      };
    });
    console.log('   bouton Durée allumé dans les Réglages : ' + r.uiAffiche);
    console.log('   programParams.duration = ' + r.paramsDuration + '   db.user.trainingDuration = ' + r.trainingDuration);
    console.log('   ce que lisent les 6 sites (A || B || 90) = ' + r.ceQueLitLeGenerateur
      + (r.ceQueLitLeGenerateur !== r.paramsDuration ? '   ✔ DIVERGENCE : l\'UI montre ' + r.uiAffiche + ', l\'algo utilise ' + r.ceQueLitLeGenerateur : ''));
    await app.close();
  }

  // ── F14 : la section Records affiche-t-elle un e1RM à l'écran ? ────────────
  {
    console.log('\n## F14 — « Correction des Records » : que lit l\'utilisateur ?');
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const el = document.getElementById('recordsCorrectionList');
      const lignes = el ? el.innerText.split('\n').filter(Boolean).slice(0, 8) : [];
      return { lignes, bestPR: db.bestPR };
    });
    console.log('   db.bestPR (vraies barres) = ' + JSON.stringify(r.bestPR));
    console.log('   premières lignes affichées :');
    r.lignes.forEach((l) => console.log('      ' + l));
    await app.close();
  }
})().catch((e) => { console.error('ECHEC 5c:', e.stack); process.exit(1); });
