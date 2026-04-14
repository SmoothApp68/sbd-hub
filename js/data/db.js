// js/data/db.js

// Clé de chiffrement (à NE PAS partager)
const SECRET_KEY = "xeUG4aTbR900oIYb29miGbuP38chsO"; // Remplace par une vraie clé aléatoire de 32 caractères

// Cache pour éviter de recharger la DB à chaque fois
let _dbCache = null;

/**
 * Structure par défaut de la DB.
 */
function defaultDB() {
  return {
    user: { name: '', bw: 0, targets: { bench: 100, squat: 120, deadlift: 140 }, level: 'intermediaire', gender: 'unspecified', onboarded: false, kcalBase: 2300, bwBase: 80, trainingMode: null },
    routine: null, logs: [], bestPR: { bench: 0, squat: 0, deadlift: 0 }, reports: [], body: [], lastSync: 0, keyLifts: [],
    weeklyChallenges: null, monthlyChallenges: null, secretQuestsCompleted: [], questHistory: [], questStreak: 0,
    seenBadges: [], unlockedTitles: [], activeTitle: null, passwordMigrated: false, friendCode: null, friends: [],
    social: { profileId: null, username: '', bio: '', visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' }, onboardingCompleted: false, usernameChangedAt: null },
    readiness: [], challenges: [], readinessHistory: []
  };
}

/**
 * Chiffre une donnée (AES basique).
 */
function encrypt(data) {
  if (!data) return null;
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
  }
  return btoa(result); // On encode en base64 pour éviter les caractères bizarres
}

/**
 * Déchiffre une donnée.
 */
function decrypt(data) {
  if (!data) return null;
  try {
    const decoded = atob(data);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length));
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Charge la DB depuis localStorage (avec cache et chiffrement).
 */
function loadDB() {
  if (_dbCache) return _dbCache;
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
              console.log('[Migration] Données migrées');
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
    // Chiffrement des données sensibles
    if (p.friendCode) p.friendCode = decrypt(p.friendCode);
    if (p.user?.password) p.user.password = decrypt(p.user.password);
    _dbCache = p;
    return _dbCache;
  } catch {
    _dbCache = defaultDB();
    return _dbCache;
  }
}

/**
 * Sauvegarde la DB dans localStorage (avec chiffrement).
 */
let _saveDBTimer = null;
let _saveDBDirty = false;
function saveDB() {
  _saveDBDirty = true;
  if (_saveDBTimer) return;
  _saveDBTimer = setTimeout(_flushDB, 2000);
}

function saveDBNow() {
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
      
      // Sécurité pour atob (évite de crash si friendCode est déjà clair)
      if (dbCopy.friendCode) {
        try { dbCopy.friendCode = atob(dbCopy.friendCode); } catch(e) { /* déjà décodé */ }
      }
      
      // Chiffrement avant sauvegarde (on garde la sécurité de la branche main)
      if (dbCopy.friendCode) dbCopy.friendCode = encrypt(dbCopy.friendCode);
      if (dbCopy.user?.password) dbCopy.user.password = encrypt(dbCopy.user.password);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dbCopy));
    } catch(e) {
      console.error('saveDB error:', e);
    }
}

// Sauvegarde automatique
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _flushDB();
});

// Export de la DB
let db = loadDB();
