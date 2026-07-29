/** Config d'inventaire — VAGUE 3 : Maison (tab-dash) + Coach (coach-today / coach-history). OUTIL D'AUDIT. */
'use strict';

const J = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const jour = () => J[new Date().getDay()];

const bloc = (phase, week) => (db) => {
  db.weeklyPlan = db.weeklyPlan || { days: [] };
  db.weeklyPlan.currentBlock = { phase, week, totalWeeks: 4, startDate: Date.now() - week * 7 * 86400000 };
  return db;
};
const checkin = (score, pain) => (db) => {
  const t = new Date().toISOString().slice(0, 10);
  db.readinessHistory = db.readinessHistory || [];
  db.readinessHistory.push({ ts: Date.now(), date: t, sleep: score, energy: score, soreness: score,
    motivation: score, score: score * 20, pain: pain || null });
  db.readiness = db.readiness || [];
  db.readiness.push({ date: t, sleep: score, energy: score, soreness: score, motivation: score, score: score * 20 });
  return db;
};
const blessure = (db) => { db.user.injuries = [{ zone: 'epaule', level: 2, active: true, since: '2026-07-01' }]; return db; };
const acwrHaut = (db) => {   // volume aigu très supérieur au chronique
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    db.logs.unshift({ id: 'spike' + i, timestamp: now - i * 43200000, date: new Date(now - i * 43200000).toISOString().slice(0, 10),
      shortDate: '28/07', title: 'Séance charge', volume: 22000, duration: 5400,
      exercises: [{ name: 'Squat (Barre)', maxRM: 160,
        allSets: Array.from({ length: 8 }, () => ({ weight: 140, reps: 5, rpe: 9, setType: 'normal' })) }] });
  }
  return db;
};
const femmeCycle = (db) => {
  db.user.gender = 'female'; db.user.menstrualEnabled = true;
  db.user.menstrualData = { lastPeriodStart: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), cycleLength: 28 };
  return db;
};

module.exports = {
  nom: 'VAGUE 3 — Maison + Coach',
  conteneur: '#tab-dash',   // par défaut ; chaque état Coach surcharge via etat.conteneur
  sortieBlocs: 'out-v3-blocs.json', sortie: 'out-v3-elements.json',
  prepare: async () => {},
  etats: [
    // ── Maison ──
    { nom: 'maison · profil riche', action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · vierge', profil: 'vierge', action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · débutant', profil: 'debutant', action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · retour après pause', profil: 'retour_apres_pause', action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · données sales', profil: 'donnees_sales', action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · check-in bas + douleur', mut: checkin(1, 'epaule'), action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · check-in haut', mut: checkin(5), action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · deload', mut: bloc('deload', 4), action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
    { nom: 'maison · femme + cycle', mut: femmeCycle, action: async (p) => { await p.evaluate(() => showTab('tab-dash')); } },
// ── Coach (conteneur surchargé) ──
    { nom: 'coach · profil riche', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · vierge', profil: 'vierge', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · débutant', profil: 'debutant', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · mono-lift', profil: 'mono_lift', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · extreme haut', profil: 'extreme_haut', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · extreme bas', profil: 'extreme_bas', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · progression nette', profil: 'progression_nette', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · retour après pause', profil: 'retour_apres_pause', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · données sales', profil: 'donnees_sales', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · ACWR élevé', mut: acwrHaut, conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1400 },
    { nom: 'coach · blessure active', mut: blessure, conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · deload', mut: bloc('deload', 4), conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · peak', mut: bloc('peak', 3), conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · check-in bas + douleur', mut: checkin(1, 'epaule'), conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · femme + cycle', mut: femmeCycle, conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach'); }); }, settle: 1200 },
    { nom: 'coach · voir plus déplié', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach');
        const b = document.querySelector('#coach-today [onclick*="ShowMore"],#coach-today [onclick*="showMore"]');
        if (b) b.click(); }); }, settle: 1400 },
    { nom: 'coach · historique', conteneur: '#s-coach', action: async (p) => {
      await p.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-coach');
        if (typeof showCoachSub === 'function') showCoachSub('coach-history'); }); }, settle: 1200 },
  ],
};
