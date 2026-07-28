/** Config d'inventaire — VAGUE 2 : onglet Séances (Coach/Plan/GO/Log/Analyse). OUTIL D'AUDIT. */
'use strict';
const H = require('./harness');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const jour = () => JOURS[new Date().getDay()];

function planRiche(db) {
  const j = jour();
  db.weeklyPlan = { currentBlock: { phase: 'intensification', week: 2, totalWeeks: 4 }, days: [
    { day: j, rest: false, exercises: [
      { name: 'Squat (Barre)', isPrimary: true, restSeconds: 180,
        coachNote: '📈 +2.5 kg cette semaine', gripNote: 'prise large', tempoEcc: 3,
        isDoubleProgression: true, targetReps: 5, targetRepsMax: 8,
        sets: [{ weight: 50, reps: 8, isWarmup: true }, { weight: 67.5, reps: 5, isWarmup: true },
          { weight: 85, reps: 3, isWarmup: true }, { weight: 100, reps: 2, isWarmup: true },
          { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 },
          { weight: 95, reps: 8, isBackoff: true }] },
      { name: 'Développé Couché (Barre)', isPrimary: true, restSeconds: 150,
        sets: [{ weight: 60, reps: 5, isWarmup: true }, { weight: 100, reps: 5 }, { weight: 100, reps: 5 }] },
      { name: 'Rowing Barre', restSeconds: 90, _interferenceNote: 'volume tiré élevé',
        sets: [{ weight: 70, reps: 10 }, { weight: 70, reps: 10 }, { weight: 70, reps: 10 }] },
    ] },
  ] };
  db.routineExos = db.routineExos || {};
  db.routineExos[j] = ['Squat (Barre)', 'Développé Couché (Barre)', 'Rowing Barre'];
  db.routine = db.routine || {};
  db.routine[j] = '🦵 Squat & Jambes';
  return db;
}

module.exports = {
  nom: 'VAGUE 2 — Séances',
  conteneur: '#tab-seances',
  sortie: 'out-v2-elements.json',
  prepare: async (page) => {
    await page.evaluate(() => { if (typeof showTab === 'function') showTab('tab-seances'); });
    await page.waitForTimeout(300);
  },
  etats: [
    { nom: 'log (défaut)', action: async (p) => { await p.evaluate(() => showSeancesSub('s-log')); } },
    { nom: 'coach', action: async (p) => { await p.evaluate(() => showSeancesSub('s-coach')); } },
    { nom: 'coach-historique', action: async (p) => {
      await p.evaluate(() => { showSeancesSub('s-coach'); if (typeof showCoachSub === 'function') showCoachSub('coach-history'); }); } },
    { nom: 'plan (sans programme)', action: async (p) => { await p.evaluate(() => showSeancesSub('s-plan')); } },
    { nom: 'plan (programme riche)', mut: planRiche, action: async (p) => { await p.evaluate(() => showSeancesSub('s-plan')); } },
    { nom: 'analyse', action: async (p) => { await p.evaluate(() => showSeancesSub('s-analyse')); } },
    { nom: 'GO au repos', action: async (p) => { await p.evaluate(() => showSeancesSub('s-go')); } },
    { nom: 'GO séance active (plan riche)', mut: planRiche, settle: 1400, action: async (p) => {
      await p.evaluate(() => { showSeancesSub('s-go'); try { _goDoStartWorkout(true); } catch (e) {} }); } },
    { nom: 'GO série validée', mut: planRiche, settle: 1400, action: async (p) => {
      await p.evaluate(() => {
        showSeancesSub('s-go');
        try { _goDoStartWorkout(true); } catch (e) {}
        try { if (typeof goCompleteSet === 'function') goCompleteSet(0, 0); } catch (e) {}
        if (typeof renderGoTab === 'function') renderGoTab();
      }); } },
    { nom: 'GO repos en cours', mut: planRiche, settle: 1400, action: async (p) => {
      await p.evaluate(() => {
        showSeancesSub('s-go');
        try { _goDoStartWorkout(true); } catch (e) {}
        try { if (typeof goStartRestTimer === 'function') goStartRestTimer(120, 0); } catch (e) {}
        if (typeof renderGoTab === 'function') renderGoTab();
      }); } },
    { nom: 'GO séance vide (sans programme)', settle: 1200, action: async (p) => {
      await p.evaluate(() => { showSeancesSub('s-go'); try { _goDoStartWorkout(false); } catch (e) {} }); } },
    { nom: 'profil débutant', profil: 'debutant', action: async (p) => { await p.evaluate(() => showSeancesSub('s-plan')); } },
    { nom: 'profil vierge', profil: 'vierge', action: async (p) => { await p.evaluate(() => showSeancesSub('s-log')); } },
    { nom: 'deload', mut: (db) => { planRiche(db); db.weeklyPlan.currentBlock.phase = 'deload'; return db; },
      action: async (p) => { await p.evaluate(() => showSeancesSub('s-plan')); } },
  ],
};
