// ============================================================
// app.js — DB, UI, rendering, navigation, init
// ============================================================

import {
  _getWeekStart, 
  generateId, 
  formatDate, 
  formatTime,
  timeAgo, 
  showToast, 
  showModal, 
  getTodayStr, 
  calcE1RM,
  t,
  shouldShow,
  clearCaches,
  saveDB 
} from './utils.js';

import { STORAGE_KEY, DAYS_FULL, DEFAULT_ROUTINE } from './constants.js';

// ============================================================
// DB
// ============================================================
const defaultDB = () => ({
  user: { name: '', bw: 0, targets: { bench: 100, squat: 120, deadlift: 140 }, level: 'intermediaire', gender: 'unspecified', onboarded: false, kcalBase: 2300, bwBase: 80, trainingMode: null },
  routine: null, logs: [], bestPR: { bench: 0, squat: 0, deadlift: 0 }, reports: [], body: [], lastSync: 0,
  keyLifts: [],
  weeklyChallenges: null,
  monthlyChallenges: null,
  secretQuestsCompleted: [],
  questHistory: [],
  questStreak: 0,
  seenBadges: [],
  unlockedTitles: [],
  activeTitle: null,
  passwordMigrated: false,
  friendCode: null,
  friends: [],
  social: {
    profileId: null,
    username: '',
    bio: '',
    visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' },
    onboardingCompleted: false,
    usernameChangedAt: null
  }
});

let db = (() => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return defaultDB();
    const p = JSON.parse(s);
    if (!p.logs || !p.user) return defaultDB();
    return p;
  } catch { return defaultDB(); }
})();

window.db = db;

// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  showToast('Application chargée avec succès !');
});

// Sauvegarde automatique de la base de données
window.addEventListener('beforeunload', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
});

let _saveDBTimer = null;
window._saveDBDirty = false;

function _flushDB() {
  if (!window._saveDBDirty) return;
  window._saveDBDirty = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

export function saveDBNow() {
  clearCaches();
  if (_saveDBTimer) { clearTimeout(_saveDBTimer); _saveDBTimer = null; }
  window._saveDBDirty = true;
  _flushDB();
}

export function saveDB() {
  clearCaches();
  window._saveDBDirty = true;
  if (_saveDBTimer) return;
  _saveDBTimer = setTimeout(_flushDB, 2000);
}

// ============================================================
// FONCTIONS DE BASE
// ============================================================
export function getRoutine() {
  if (db.routine && Object.keys(db.routine).length > 0) return db.routine;
  if (db.generatedProgram && db.generatedProgram.length > 0) {
    const r = {};
    db.generatedProgram.forEach(d => { r[d.day] = d.isRest ? '😴 Repos' : (d.label || d.day); });
    return r;
  }
  return DEFAULT_ROUTINE;
}

export function calcE1RM(weight, reps) {
  if (!weight || reps <= 0) return weight || 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// ============================================================
// EXPORT
// ============================================================
export { db };
