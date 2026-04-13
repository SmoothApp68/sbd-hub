// js/data/db.js
import { STORAGE_KEY } from '../constants.js';

// Cache pour loadDB
let _dbCache = null;

/**
 * Structure par défaut de la DB.
 */
export function defaultDB() {
  return {
    user: {
      name: '', bw: 0, targets: { bench: 100, squat: 120, deadlift: 140 },
      level: 'intermediaire', gender: 'unspecified', onboarded: false,
      kcalBase: 2300, bwBase: 80, trainingMode: null
    },
    routine: null, logs: [], bestPR: { bench: 0, squat: 0, deadlift: 0 },
    reports: [], body: [], lastSync: 0, keyLifts: [],
    weeklyChallenges: null, monthlyChallenges: null,
    secretQuestsCompleted: [], questHistory: [], questStreak: 0,
    seenBadges: [], unlockedTitles: [], activeTitle: null,
    passwordMigrated: false, friendCode: null, friends: [],
    social: {
      profileId: null, username: '', bio: '',
      visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' },
      onboardingCompleted: false, usernameChangedAt: null
    },
    readiness: [], challenges: [], readinessHistory: []
  };
}

/**
 * Charge la DB depuis localStorage (avec cache et migrations).
 */
export function loadDB() {
  if (_dbCache) return _dbCache; // Retourne le cache si disponible
  try {
    const FALLBACK_KEYS = ['SBD_HUB_V28', 'SBD_HUB_V27', 'SBD_HUB_V26', 'SBD_HUB'];
    if (!localStorage.getItem(STORAGE_KEY)) {
      for (const k of FALLBACK_KEYS) {
        const old = localStorage.getItem(k);
        if (old) {
          try {
            const parsed = JSON.parse(old);
            if (parsed.logs && parsed.user) {
              localStorage.setItem(STORAGE_KEY, old);
              console.log('[Migration] Données migrées de', k, 'vers', STORAGE_KEY);
              break;
            }
          } catch(e) {}
        }
      }
    }
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) {
      _dbCache = defaultDB();
      return _dbCache;
    }
    const p = JSON.parse(s);
    // Validation et mise à jour des champs manquants
    if (!p.reports) p.reports = [];
    if (!p.routine) p.routine = null;
    if (!p.body) p.body = [];
    if (!p.keyLifts) p.keyLifts = [];
    if (p.user.name === undefined) p.user.name = '';
    if (p.user.onboarded === undefined) p.user.onboarded = true;
    if (!p.user.gender) p.user.gender = 'unspecified';
    if (p.user.trainingMode === undefined) p.user.trainingMode = 'powerlifting';
    if (!p.monthlyChallenges) p.monthlyChallenges = null;
    if (!p.secretQuestsCompleted) p.secretQuestsCompleted = [];
    if (!p.questHistory) p.questHistory = [];
    if (p.questStreak === undefined) p.questStreak = 0;
    if (!p.seenBadges) p.seenBadges = [];
    if (!p.unlockedTitles) p.unlockedTitles = [];
    if (p.activeTitle === undefined) p.activeTitle = null;
    if (!p.social) p.social = { profileId: null, username: '', bio: '', visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' }, onboardingCompleted: false, usernameChangedAt: null };
    if (!p.social.visibility) p.social.visibility = { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' };
    if (p.passwordMigrated === undefined) p.passwordMigrated = false;
    if (!p.friendCode) p.friendCode = null;
    if (!p.friends) p.friends = [];
    if (!p.readiness) p.readiness = [];
    if (!p.challenges) p.challenges = [];
    if (!p.readinessHistory) p.readinessHistory = [];
    
    // Chiffrement des données sensibles (exemple basique)
    if (p.friendCode) p.friendCode = btoa(p.friendCode); // Encodage base64 pour l'exemple
    if (p.user.password) p.user.password = btoa(p.user.password); // Si jamais il y a un mot de passe
    
    _dbCache = p;
    return _dbCache;
  } catch {
    _dbCache = defaultDB();
    return _dbCache;
  }
}

/**
 * Sauvegarde la DB dans localStorage (avec debounce et chiffrement).
 */
let _saveDBTimer = null;
let _saveDBDirty = false;
export function saveDB() {
  _saveDBDirty = true;
  if (_saveDBTimer) return;
  _saveDBTimer = setTimeout(_flushDB, 2000);
}

export function saveDBNow() {
  if (_saveDBTimer) { 
    clearTimeout(_saveDBTimer); 
    _saveDBTimer = null; 
  }
  _saveDBDirty = true;
  
  // AJOUTE CETTE LIGNE : On synchronise le cache interne avec la variable db
  _dbCache = db; 
  
  _flushDB();
}

// js/data/db.js
function _flushDB() {
  // On retire la condition "if (!_saveDBDirty) return;" 
  // car saveDBNow est justement là pour forcer la main.
  if (!_dbCache) return; 

  _saveDBDirty = false; // On reset le flag
  try {
    const dbCopy = JSON.parse(JSON.stringify(_dbCache));
    
    // Sécurité pour atob
    if (dbCopy.friendCode) {
      try { dbCopy.friendCode = atob(dbCopy.friendCode); } catch(e) {}
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dbCopy));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

// Écouteurs d'événements pour sauvegarde automatique
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _flushDB();
});

// Export de la DB actuelle (pour compatibilité avec app.js)
export let db = loadDB();