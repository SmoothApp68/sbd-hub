// ============================================================
// utils.js — Fonctions utilitaires partagées pour sbd-hub
// ============================================================

import { STORAGE_KEY } from './constants.js';

/**
 * Génère un identifiant unique aléatoire.
 * @returns {string} ID de 9 caractères
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Formate une date en chaîne courte (JJ/MM).
 * @param {number} timestamp - Timestamp
 * @returns {string} Date formatée (ex: "13/04")
 */
export function formatDate(timestamp) {
  const d = new Date(timestamp);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * Retourne une chaîne "il y a X temps".
 * @param {number|Date} input - Timestamp ou objet Date
 * @returns {string} Chaîne formatée (ex: "il y a 2j")
 */
export function timeAgo(input) {
  if (!input) return 'récemment';
  var ms;
  if (typeof input === 'number') {
    ms = input;
  } else if (input instanceof Date) {
    ms = input.getTime();
  } else {
    ms = new Date(input).getTime();
  }
  if (isNaN(ms)) return 'récemment';
  var diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0) return 'récemment';
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'j';
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Affiche une notification toast.
 * @param {string} msg - Message à afficher
 */
export function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/**
 * Affiche une modale de confirmation.
 * @param {string} msg - Message
 * @param {string} confirmText - Texte du bouton de confirmation
 * @param {string} confirmColor - Couleur du bouton (ex: "var(--green)")
 * @param {Function} onConfirm - Callback si confirmé
 * @param {Function|string} onCancelOrText - Callback ou texte du bouton d'annulation
 */
export function showModal(msg, confirmText, confirmColor, onConfirm, onCancelOrText) {
  var cancelLabel = typeof onCancelOrText === 'string' ? onCancelOrText : 'Annuler';
  var onCancel = typeof onCancelOrText === 'function' ? onCancelOrText : null;
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `<div class="modal-box">
    <p style="margin:0 0 16px;font-size:14px;">${msg}</p>
    <div class="modal-actions">
      <button class="modal-cancel" style="background:var(--sub);color:#000;">${cancelLabel}</button>
      <button class="modal-confirm" style="background:${confirmColor};color:#000;">${confirmText}</button>
    </div>
  </div>`;
  document.body.appendChild(o);
  o.querySelector('.modal-cancel').onclick = () => {
    o.remove();
    if (onCancel) onCancel();
  };
  o.querySelector('.modal-confirm').onclick = () => {
    o.remove();
    onConfirm();
  };
}

/**
 * Nettoie les caches et marque la DB comme modifiée.
 */
export function clearCaches() {
  if (typeof _cache !== 'undefined') {
    _cache.exoType.clear();
    _cache.muscleGroup.clear();
    _cache.muscleContribs.clear();
    _cache.sbdType.clear();
    _cache.exoDay.clear();
    _exoNameCache = null;
    _cache._sortedLogs = null;
    _cache._version++;
    if (typeof _accDirty !== 'undefined') {
      _accDirty.records = true;
      _accDirty.keylifts = true;
      _accDirty.prog = true;
    }
  }
}

/**
 * Sauvegarde la DB en localStorage (avec debounce).
 */
export function saveDB() {
  clearCaches();
  if (window._saveDBDirty) {
    if (window._saveDBTimer) clearTimeout(window._saveDBTimer);
    window._saveDBTimer = setTimeout(function() {
      window._saveDBTimer = null;
      _flushDB();
    }, 2000);
    if (typeof debouncedCloudSync === 'function') debouncedCloudSync();
  }
  window._saveDBDirty = true;
}

/**
 * Sauvegarde immédiate de la DB.
 */
export function saveDBNow() {
  clearCaches();
  if (window._saveDBTimer) {
    clearTimeout(window._saveDBTimer);
    window._saveDBTimer = null;
  }
  window._saveDBDirty = true;
  _flushDB();
  if (typeof debouncedCloudSync === 'function') debouncedCloudSync();
}

/**
 * Écrit effectivement la DB dans localStorage.
 */
export function _flushDB() {
  if (!window._saveDBDirty) return;
  window._saveDBDirty = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

// Flush before leaving/hiding the page
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') _flushDB();
});

/**
 * Retourne la date du jour au format YYYY-MM-DD.
 * @returns {string}
 */
export function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calcule le 1RM estimé (formule Epley).
 * @param {number} weight - Poids soulevé (kg)
 * @param {number} reps - Nombre de répétitions
 * @returns {number} 1RM estimé (kg)
 */
export function calcE1RM(weight, reps) {
  if (reps <= 0) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Formate un texte selon le niveau de détail de l'utilisateur.
 * @param {string} key - Clé de traduction
 * @param {*} value - Valeur à formater
 * @param {*} opts - Options supplémentaires
 * @returns {string} Texte formaté
 */
export function t(key, value, opts) {
  var level = window.db ? (window.db.user.level || 'intermediaire') : 'intermediaire';
  var mode = window.db ? (window.db.user.trainingMode || 'powerlifting') : 'powerlifting';
  var detail = window.db ? (window.db.user.uiDetail || 'auto') : 'auto';
  if (detail === 'simple') level = 'debutant';
  else if (detail === 'expert') level = 'competiteur';

  var isBeginner = (detail === 'auto') ? (level === 'debutant' || mode === 'bien_etre') : (detail === 'simple');
  var isAdvanced = (detail === 'auto') ? (level === 'avance' || level === 'competiteur') : (detail === 'expert');

  if (key === 'rpe') {
    if (isBeginner) {
      if (value <= 5) return 'Très facile 😌';
      if (value <= 6) return 'Effort léger 😌';
      if (value <= 7) return 'Effort modéré 😊';
      if (value <= 8) return 'Effort soutenu 💪';
      if (value <= 9) return 'Effort intense 🔥';
      return 'Maximum 🔥🔥';
    }
    if (isAdvanced) return 'RPE ' + value;
    return 'RPE ' + value + ' (' + Math.max(0, 10 - Math.round(value)) + ' reps en réserve)';
  }
  if (key === 'sets_reps') {
    var s = value, r = opts;
    if (isBeginner) return s + ' séries de ' + r + ' répétitions';
    return s + '×' + r;
  }
  if (key === 'deload') {
    if (isBeginner) return 'Semaine de récupération 🧘';
    return 'Semaine de deload';
  }
  if (key === 'mesocycle') {
    if (isBeginner) return 'Cycle de ' + (value || 4) + ' semaines';
    return 'Mésocycle';
  }
  if (key === 'progressive_overload') {
    if (isBeginner) return 'On augmente un peu chaque semaine';
    return 'Surcharge progressive';
  }
  if (key === 'compliance') {
    if (isBeginner) return value + ' séances sur ' + (opts || '?') + ' prévues 👏';
    return 'Compliance : ' + Math.round(value) + '%';
  }
  return String(value);
}

/**
 * Vérifie si une fonctionnalité doit être affichée selon le niveau de l'utilisateur.
 * @param {string} feature - Nom de la fonctionnalité
 * @returns {boolean}
 */
export function shouldShow(feature) {
  var level = window.db ? (window.db.user.level || 'intermediaire') : 'intermediaire';
  var mode = window.db ? (window.db.user.trainingMode || 'powerlifting') : 'powerlifting';
  var detail = window.db ? (window.db.user.uiDetail || 'auto') : 'auto';
  if (detail === 'simple') level = 'debutant';
  else if (detail === 'expert') level = 'competiteur';

  var rules = {
    dots_wilks:      ['avance', 'competiteur'],
    e1rm_detail:     ['intermediaire', 'avance', 'competiteur'],
    rpe_number:      ['intermediaire', 'avance', 'competiteur'],
    sbd_total:       ['intermediaire', 'avance', 'competiteur'],
    mev_mav_mrv:     ['avance', 'competiteur'],
    strength_ratios: ['intermediaire', 'avance', 'competiteur'],
    volume_numbers:  ['intermediaire', 'avance', 'competiteur'],
    ipf_score:       ['avance', 'competiteur'],
    mesocycle_label: ['avance', 'competiteur'],
    tonnage_detail:  ['intermediaire', 'avance', 'competiteur'],
  };
  var allowed = rules[feature];
  if (!allowed) return true;
  return allowed.indexOf(level) >= 0;
}