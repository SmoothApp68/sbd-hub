/** VAGUE 1 v3 — Profil (Corps · Réglages · RGPD). Source B + blocs. OUTIL D'AUDIT. */
'use strict';
const femme = (db) => { db.user.gender = 'female'; return db; };
const femmeCycle = (db) => { femme(db);
  db.user.cycleTracking = { enabled: true, lastPeriodDate: '2026-07-10', cycleLength: 28 };
  db.user.menstrualEnabled = true;
  db.user.menstrualData = { lastPeriodStart: '2026-07-10', cycleLength: 28 }; return db; };
const wcActif = (db) => { db.user.weightCut = { active: true, startWeight: 100, targetWeight: 93,
  currentWeight: 98, competitionDate: '2026-09-15' }; return db; };
const goalCompet = (db) => { db.user.programParams = db.user.programParams || {};
  db.user.programParams.goals = ['competition']; return db; };
const debutantNiveau = (db) => { db.user.level = 'debutant'; return db; };
const avecBlessures = (db) => { db.user.injuries = [{ zone: 'genou', level: 2, active: true, since: '2026-07-01' }];
  db.user.programParams = Object.assign({}, db.user.programParams, { injuries: ['genoux'] }); return db; };
const avecActivites = (db) => { db.user.activities = [{ type: 'natation', intensity: 3, duration: 45, days: [], fixed: false }]; return db; };

const ouvrir = async (p, sub) => {
  await p.evaluate((s) => { showTab('tab-profil'); showProfilSub(s); }, sub);
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    ['ca-forme','ca-load','ca-heatmap','ca-joints','ca-poids','ca-nutri','ca-force','ca-coach']
      .forEach((id) => { const e = document.getElementById(id);
        if (e && !e.classList.contains('open') && typeof toggleCorpsAcc === 'function') toggleCorpsAcc(id); });
    ['acc-profil','acc-keylifts','acc-prog','acc-import','acc-cloud','acc-backup','acc-records',
     'acc-glossary','acc-tier','acc-notif','acc-danger']
      .forEach((id) => { const e = document.getElementById(id);
        if (e && !e.classList.contains('open') && typeof toggleAcc === 'function') toggleAcc(id); });
  });
};

const etats = [];
[['aurel_like', null], ['vierge', null], ['debutant', null], ['donnees_sales', null]].forEach(([prof]) => {
  ['tab-corps', 'tab-settings'].forEach((sub) => etats.push({
    nom: prof + ' · ' + sub, profil: prof, settle: 1500, action: async (p) => ouvrir(p, sub) }));
});
[['femme', femme], ['femme+cycle', femmeCycle], ['weightCut actif', wcActif],
 ['goal competition', goalCompet], ['niveau débutant', debutantNiveau],
 ['avec blessures', avecBlessures], ['avec activités', avecActivites]].forEach(([nom, mut]) => {
  etats.push({ nom: nom + ' · réglages', mut, settle: 1600, action: async (p) => ouvrir(p, 'tab-settings') });
});
etats.push({ nom: 'anonyme · réglages', opts: { anonymous: true }, settle: 1600,
  action: async (p) => { await p.evaluate(() => { const l = document.getElementById('loginScreen'); if (l) l.style.display = 'none'; });
    await ouvrir(p, 'tab-settings'); } });
etats.push({ nom: 'badges (forcé)', settle: 1500, action: async (p) => {
  await p.evaluate(() => { showTab('tab-profil'); showProfilSub('tab-profil-badges'); }); } });

module.exports = { nom: 'VAGUE 1 — Profil', conteneur: '#tab-profil',
  sortie: 'out-v1-elements.json', sortieBlocs: 'out-v1-blocs.json', etats };
