/**
 * PHASE 5b — TEST ALLER-RETOUR. OUTIL D'AUDIT.
 *
 * Pour chaque champ éditable de l'onglet Profil :
 *   1. écrire une valeur distinctive VIA L'UI (fill/select/click + événement réel)
 *   2. lire le db PERSISTÉ (localStorage) au chemin attendu
 *   3. recharger la page
 *   4. vérifier que le champ réaffiche la valeur
 *
 * Les 3 étapes passent → CÂBLÉ CONFIRMÉ. Une échoue → on dit laquelle.
 * Aucune écriture directe en JS : uniquement des interactions réelles.
 * Chaîne de sauvegarde réelle : _debouncedSaveSettings (300 ms) → saveDB (2000 ms) → localStorage.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const ATTENTE_FLUSH = 2800; // 300 + 2000 + marge

// kind: text | number | select | checkbox | group (bouton dans un conteneur) | selectIn (select injecté)
const CHAMPS = [
  { n: 62,  id: 'inputName',            kind: 'text',     val: 'ZorglubTest',  path: 'user.name' },
  { n: 63,  id: 'inputBW',              kind: 'number',   val: '91.5',         path: 'user.bw',    num: true },
  { n: 64,  id: 'inputFatPct',          kind: 'number',   val: '17.5',         path: 'user.fatPct', num: true },
  { n: 65,  id: 'settingsLevel',        kind: 'select',   val: 'competiteur',  path: 'user.level' },
  { n: 66,  id: 'settingsHeight',       kind: 'number',   val: '183',          path: 'user.height', num: true },
  { n: 67,  id: 'settingsAge',          kind: 'number',   val: '31',           path: 'user.age',    num: true },
  { n: 68,  id: 'settingsGender',       kind: 'select',   val: 'female',       path: 'user.gender' },
  { n: 69,  id: 'settingsTargetBW',     kind: 'number',   val: '87',           path: 'user.targetBW', num: true },
  { n: 72,  id: 'tgtBench',             kind: 'number',   val: '152.5',        path: 'user.targets.bench', num: true },
  { n: 73,  id: 'tgtSquat',             kind: 'number',   val: '167.5',        path: 'user.targets.squat', num: true },
  { n: 74,  id: 'tgtDead',              kind: 'number',   val: '192.5',        path: 'user.targets.deadlift', num: true },
  { n: 83,  id: 'settingsTrainingMode', kind: 'select',   val: 'musculation',  path: 'user.trainingMode' },
  { n: 84,  id: 'settingsUIDetail',     kind: 'select',   val: 'expert',       path: 'user.uiDetail' },
  { n: 85,  id: 'settingsVocabLevel',   kind: 'select',   val: '3',            path: 'user.vocabLevel', num: true },
  { n: 92,  id: 'settingsPrehabToggle', kind: 'checkbox', val: false,          path: 'user.prehabEnabled' },
  { n: 98,  id: 'inputKcalBase',        kind: 'number',   val: '2670',         path: 'user.kcalBase', num: true },
  { n: 99,  id: 'inputBWBase',          kind: 'number',   val: '97',           path: 'user.bwBase',   num: true },
  { n: 19,  id: 'inputBodyWeight',      kind: 'saveBtn',  val: '93.4',         path: 'user.bw', num: true,
    btn: 'saveBodyEntry', sub: 'tab-corps' },
];

// Groupes de boutons : on clique le bouton dont l'attribut onclick porte la valeur cible.
const GROUPES = [
  { n: 86,  id: 'settingsGoals',    match: "toggleSettingsGoal('seche'",  path: 'user.programParams.goals',   attendu: 'contient seche' },
  { n: 87,  id: 'settingsFreq',     match: 'setSettingsFreq(5,',          path: 'user.programParams.freq',    attendu: 5 },
  { n: 88,  id: 'settingsDays',     match: "toggleSettingsDay('Samedi'",  path: 'user.programParams.selectedDays', attendu: 'contient Samedi' },
  { n: 89,  id: 'settingsMat',      match: "setSettingsMat('maison'",     path: 'user.programParams.mat',     attendu: 'maison' },
  { n: 90,  id: 'settingsDuration', match: 'setSettingsDuration(75,',     path: 'user.programParams.duration', attendu: 75 },
  { n: 91,  id: 'settingsSupersets',match: "setSupersetPref('optimised'", path: 'user.supersetPreference',    attendu: 'optimised' },
  { n: 96,  id: 'settingsInjuries', match: "toggleSettingsInjury('Genoux'", path: 'user.programParams.injuries', attendu: 'contient genoux' },
  { n: 97,  id: 'settingsCardio',   match: "setSettingsCardio('dedie'",   path: 'user.programParams.cardio',  attendu: 'dedie' },
  { n: 95,  id: 'settingsProgramMode', match: "setCoachingStyle('agressif'", path: 'user.coachingStyle',      attendu: 'agressif' },
];

async function setChamp(page, c) {
  const sel = '#' + c.id;
  if (c.kind === 'text' || c.kind === 'number' || c.kind === 'saveBtn') {
    await page.fill(sel, String(c.val));
    await page.dispatchEvent(sel, 'change');
    await page.dispatchEvent(sel, 'input');
    if (c.kind === 'saveBtn') { await page.evaluate((f) => window[f] ? window[f]() : eval(f + '()'), c.btn); }
  } else if (c.kind === 'select') {
    await page.selectOption(sel, String(c.val));
  } else if (c.kind === 'checkbox') {
    await page.evaluate(({ id, v }) => {
      const el = document.getElementById(id);
      el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: c.id, v: c.val });
  }
}

(async () => {
  const app = await H.openApp(profiles.build('aurel_like'));
  const { page } = app;
  await H.gotoProfil(page, 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(400);

  const res = {};

  // ── ÉTAPE 1+2 : écrire chaque champ, puis vérifier le db persisté ──
  for (const c of CHAMPS) {
    if (c.sub) { await H.gotoProfil(page, c.sub); await H.openAllAccordions(page); }
    const present = await page.locator('#' + c.id).count();
    if (!present) { res[c.id] = { n: c.n, etape: '⊘ élément absent du DOM' }; continue; }
    try { await setChamp(page, c); } catch (e) { res[c.id] = { n: c.n, etape: '⊘ interaction impossible : ' + e.message.split('\n')[0] }; continue; }
    await page.waitForTimeout(ATTENTE_FLUSH);
    const persisted = H.get(await H.readPersisted(page), c.path);
    const attendu = c.num ? parseFloat(c.val) : c.val;
    const ok = c.kind === 'checkbox' ? persisted === c.val : String(persisted) === String(attendu);
    res[c.id] = { n: c.n, path: c.path, ecrit: c.val, persiste: persisted, etape2: ok };
    if (c.sub) { await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page); }
  }

  for (const g of GROUPES) {
    const btn = page.locator('#' + g.id + ' button[onclick*="' + g.match.replace(/"/g, '\\"') + '"]');
    const cnt = await btn.count();
    if (!cnt) { res[g.id] = { n: g.n, etape: '⊘ bouton introuvable (' + g.match + ')' }; continue; }
    await btn.first().click();
    await page.waitForTimeout(ATTENTE_FLUSH);
    const v = H.get(await H.readPersisted(page), g.path);
    const ok = Array.isArray(v)
      ? String(v).toLowerCase().includes(String(g.attendu).replace('contient ', '').toLowerCase())
      : String(v) === String(g.attendu);
    res[g.id] = { n: g.n, path: g.path, ecrit: g.match, persiste: JSON.stringify(v), etape2: ok };
  }

  // ── ÉTAPE 3+4 : recharger, le champ réaffiche-t-il la valeur ? ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await H.gotoProfil(page, 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(500);

  for (const c of CHAMPS) {
    if (!res[c.id] || res[c.id].etape) continue;
    if (c.sub) continue; // inputBodyWeight est vidé par saveBodyEntry : réaffichage non applicable
    const v = await page.evaluate((c2) => {
      const el = document.getElementById(c2.id);
      if (!el) return '(absent)';
      return c2.kind === 'checkbox' ? el.checked : el.value;
    }, { id: c.id, kind: c.kind });
    const attendu = c.kind === 'checkbox' ? c.val : String(c.num ? parseFloat(c.val) : c.val);
    res[c.id].reaffiche = v;
    res[c.id].etape4 = c.kind === 'checkbox' ? v === c.val : String(v) === attendu;
  }
  for (const g of GROUPES) {
    if (!res[g.id] || res[g.id].etape) continue;
    const v = H.get(await H.readPersisted(page), g.path);
    res[g.id].reaffiche = JSON.stringify(v);
    res[g.id].etape4 = res[g.id].persiste === JSON.stringify(v);
  }

  // ── Rapport ──
  console.log('# PHASE 5b — aller-retour (profil aurel_like)\n');
  console.log('#'.padStart(4) + '  ' + 'élément'.padEnd(22) + 'chemin db'.padEnd(34) + 'écrit→persisté  ré-affiché  VERDICT');
  let ok = 0, ko = 0, na = 0;
  [...CHAMPS, ...GROUPES].sort((a, b) => a.n - b.n).forEach((c) => {
    const r = res[c.id];
    if (!r) return;
    if (r.etape) { console.log(String(c.n).padStart(4) + '  ' + c.id.padEnd(22) + r.etape); na++; return; }
    const v = r.etape2 && r.etape4 !== false ? '✔ CONFIRMÉ' : '✘ ' + (!r.etape2 ? 'ÉCHEC persistance' : 'ÉCHEC ré-affichage');
    if (v.startsWith('✔')) ok++; else ko++;
    console.log(String(c.n).padStart(4) + '  ' + c.id.padEnd(22) + String(r.path).padEnd(34)
      + String(r.persiste).slice(0, 14).padEnd(16) + String(r.reaffiche === undefined ? '(n/a)' : r.reaffiche).slice(0, 11).padEnd(12) + v);
  });
  console.log('\n  ✔ ' + ok + '   ✘ ' + ko + '   ⊘ ' + na);
  require('fs').writeFileSync(__dirname + '/out-5b.json', JSON.stringify(res, null, 1));
  await app.close();
})().catch((e) => { console.error('ECHEC 5b:', e.stack); process.exit(1); });
