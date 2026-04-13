// ============================================================
// utils.js — Fonctions utilitaires partagées pour sbd-hub
// ============================================================

import { STORAGE_KEY } from './constants.js';

/**
 * Calcule le timestamp du début de la semaine (Lundi) pour une date donnée.
 * @param {number|Date|string} date 
 * @returns {number} Timestamp du lundi à 00:00:00
 */
export function _getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? 6 : day - 1); // Lundi est le premier jour
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

/**
 * Génère un identifiant unique aléatoire.
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Formate une date en JJ/MM.
 */
export function formatDate(timestamp) {
  const d = new Date(timestamp);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * Retourne une chaîne "il y a X temps".
 */
export function timeAgo(input) {
  if (!input) return 'récemment';
  let ms;
  if (typeof input === 'number') ms = input;
  else if (input instanceof Date) ms = input.getTime();
  else ms = new Date(input).getTime();

  if (isNaN(ms)) return 'récemment';
  let diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0) return 'récemment';
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'j';
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Notification Toast
 */
export function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/**
 * Modale de confirmation
 */
export function showModal(msg, confirmText, confirmColor, onConfirm, onCancelOrText) {
  let cancelLabel = typeof onCancelOrText === 'string' ? onCancelOrText : 'Annuler';
  let onCancel = typeof onCancelOrText === 'function' ? onCancelOrText : null;
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
  o.querySelector('.modal-cancel').onclick = () => { o.remove(); if (onCancel) onCancel(); };
  o.querySelector('.modal-confirm').onclick = () => { o.remove(); onConfirm(); };
}

/**
 * Sauvegarde et synchronisation
 */
export function saveDB() {
  if (window._saveDBDirty) {
    if (window._saveDBTimer) clearTimeout(window._saveDBTimer);
    window._saveDBTimer = setTimeout(() => {
      window._saveDBTimer = null;
      _flushDB();
    }, 2000);
  }
  window._saveDBDirty = true;
}

export function saveDBNow() {
  if (window._saveDBTimer) {
    clearTimeout(window._saveDBTimer);
    window._saveDBTimer = null;
  }
  window._saveDBDirty = true;
  _flushDB();
}

export function _flushDB() {
  if (!window._saveDBDirty || !window.db) return;
  window._saveDBDirty = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

// Listeners de sauvegarde automatique
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _flushDB();
});

export function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function calcE1RM(weight, reps) {
  if (reps <= 0) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Traduction et adaptation selon le niveau (UI)
 */
export function t(key, value, opts) {
  const db = window.db;
  if (!db) return String(value);

  let level = db.user.level || 'intermediaire';
  const mode = db.user.trainingMode || 'powerlifting';
  const detail = db.user.uiDetail || 'auto';

  if (detail === 'simple') level = 'debutant';
  else if (detail === 'expert') level = 'competiteur';

  const isBeginner = (detail === 'auto') ? (level === 'debutant' || mode === 'bien_etre') : (detail === 'simple');
  const isAdvanced = (detail === 'auto') ? (level === 'avance' || level === 'competiteur') : (detail === 'expert');

  if (key === 'rpe') {
    if (isBeginner) {
      if (value <= 5) return 'Très facile 😌';
      if (value <= 7) return 'Effort modéré 😊';
      if (value <= 9) return 'Effort intense 🔥';
      return 'Maximum 🔥🔥';
    }
    return isAdvanced ? `RPE ${value}` : `RPE ${value} (${Math.max(0, 10 - Math.round(value))} RIR)`;
  }
  
  if (key === 'sets_reps') return isBeginner ? `${value} séries de ${opts} reps` : `${value}×${opts}`;
  return String(value);
}

export function shouldShow(feature) {
  const db = window.db;
  if (!db) return true;
  let level = db.user.level || 'intermediaire';
  const rules = {
    dots_wilks: ['avance', 'competiteur'],
    mev_mav_mrv: ['avance', 'competiteur'],
    ipf_score: ['avance', 'competiteur']
  };
  const allowed = rules[feature];
  return !allowed || allowed.indexOf(level) >= 0;
}
