/**
 * PHASE 5a bis — VARIANTES DE PROFIL. OUTIL D'AUDIT.
 *
 * Les 3 profils de base (aurel_like / vierge / debutant) laissent 9 éléments hors DOM.
 * Ce script fabrique les états qui DEVRAIENT les débloquer, pour distinguer :
 *   « inatteignable par construction »  vs  « simplement pas couvert par mes profils ».
 * Chaque variante part d'un profil réel de tests/fixtures/profiles, muté au minimum.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const CIBLES = {
  femme: ['settingsCycleBlock', 'settingsCycleDetails', 'settingsCycleLastDate', 'settingsCycleLength',
          'settingsMenstrualSection', 'menstrualStartDate', 'menstrualCycleLength'],
  weightcut_actif: ['settingsWeightCut', 'wc-start-weight', 'wc-target-weight', 'wc-current-weight',
                    'wc-competition-date', 'toggle-creatine'],
  goal_competition: ['settingsWeightCut', 'toggle-creatine'],
  debutant_morpho: ['settingsMorphoSection'],
  sous_onglet_stats: ['tab-corps', 'tab-settings', 'tab-profil-badges'],
};

const VARIANTES = {
  femme: (db) => { db.user.gender = 'female'; return db; },
  femme_cycle_on: (db) => {
    db.user.gender = 'female';
    db.user.cycleTracking = { enabled: true, lastPeriodDate: '2026-07-10', cycleLength: 28 };
    return db;
  },
  weightcut_actif: (db) => {
    db.user.weightCut = { active: true, startWeight: 100, targetWeight: 93, currentWeight: 98,
                          competitionDate: '2026-09-15' };
    return db;
  },
  goal_competition: (db) => {
    db.user.programParams = db.user.programParams || {};
    db.user.programParams.goals = ['competition'];
    return db;
  },
  debutant_morpho: (db) => { db.user.level = 'debutant'; return db; },
};

async function probe(page, ids) {
  return page.evaluate((list) => {
    const o = {};
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) { o[id] = 'ABSENT DU DOM'; return; }
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display === 'none') o[id] = 'display:none' + (el.style.display === 'none' ? ' (inline)' : '');
      else if (r.width === 0 && r.height === 0) o[id] = 'boîte 0×0';
      else o[id] = 'VISIBLE ' + Math.round(r.width) + '×' + Math.round(r.height);
    });
    return o;
  }, ids);
}

(async () => {
  const allIds = [...new Set(Object.values(CIBLES).flat())];
  console.log('# PHASE 5a bis — variantes de profil\n');

  for (const [nom, mut] of Object.entries(VARIANTES)) {
    const db = mut(profiles.build('aurel_like'));
    const app = await H.openApp(db);
    await H.gotoProfil(app.page, 'tab-settings');
    await app.page.waitForTimeout(400);
    await H.openAllAccordions(app.page);
    const res = await probe(app.page, allIds);
    console.log('## variante « ' + nom + ' »');
    Object.entries(res).forEach(([id, st]) => {
      const mark = st.startsWith('VISIBLE') ? '  ✔' : '  ✘';
      console.log(mark + ' ' + id.padEnd(28) + st);
    });
    // Preuve complémentaire : le gate lui-même, évalué dans la page
    const gate = await app.page.evaluate(() => ({
      gender: db.user.gender,
      goals: (db.user.programParams && db.user.programParams.goals) || null,
      wcActive: !!(db.user.weightCut && db.user.weightCut.active),
      showWC: !!((db.user.programParams && (db.user.programParams.goals || []).includes('competition'))
        || (db.user.weightCut && db.user.weightCut.active)),
      level: db.user.level,
    }));
    console.log('     état du gate : ' + JSON.stringify(gate));
    console.log('');
    await app.close();
  }

  // Le cas showProfilSub('tab-profil-stats') — reproduction exacte du parcours utilisateur
  console.log('## reproduction : showProfilSub(\'tab-profil-stats\') (5 sites d\'appel réels)');
  const app = await H.openApp(profiles.build('aurel_like'));
  const { page } = app;
  await H.gotoProfil(page, 'tab-corps');
  const avant = await probe(page, ['tab-corps', 'tab-settings', 'tab-profil-badges']);
  console.log('   avant : ' + JSON.stringify(avant));
  await page.evaluate(() => { showTab('tab-profil'); showProfilSub('tab-profil-stats'); });
  await page.waitForTimeout(400);
  const apres = await probe(page, ['tab-corps', 'tab-settings', 'tab-profil-badges']);
  console.log('   après : ' + JSON.stringify(apres));
  const sect = await page.evaluate(() => ({
    actives: document.querySelectorAll('.profil-sub-section.active').length,
    lastTabLS: (() => { try { return JSON.parse(localStorage.getItem('sbd_lastTab') || '{}'); } catch (e) { return 'illisible'; } })(),
    lastTabDb: (db.gamification && db.gamification.lastTab) || null,
    contenuVisible: Array.from(document.querySelectorAll('#tab-profil > div'))
      .filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.id || e.className).slice(0, 5),
  }));
  console.log('   sous-sections actives : ' + sect.actives);
  console.log('   sbd_lastTab (localStorage) : ' + JSON.stringify(sect.lastTabLS));
  console.log('   db.gamification.lastTab    : ' + JSON.stringify(sect.lastTabDb));
  console.log('   blocs de hauteur non nulle restants dans #tab-profil : ' + JSON.stringify(sect.contenuVisible));

  // Persistance : rechargement complet, l'état est-il rejoué ?
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const apresReload = await page.evaluate(() => ({
    tabCourant: document.querySelector('.content-section.active') && document.querySelector('.content-section.active').id,
    actives: document.querySelectorAll('.profil-sub-section.active').length,
  }));
  console.log('   APRÈS RECHARGEMENT → onglet=' + apresReload.tabCourant + '  sous-sections actives=' + apresReload.actives);
  await app.close();
})().catch((e) => { console.error('ECHEC 5a-bis:', e.stack); process.exit(1); });
