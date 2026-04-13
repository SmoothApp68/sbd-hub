// ============================================================
// utils.js — Fonctions utilitaires partagées pour sbd-hub
// ============================================================


// _cache and clearCaches are defined in engine.js (loaded first)

/**
 * Calcule le timestamp du début de la semaine (Lundi).
 */
function _getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? 6 : day - 1);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Formate une date en JJ/MM.
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * Formate les secondes en format lisible (ex: 1m30s)
 */
function formatTime(sec) {
  if (!sec || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return h + 'h' + String(m).padStart(2, '0') + 'm' + String(s).padStart(2, '0') + 's';
  return m > 0 ? m + 'm' + s + 's' : s + 's';
}

function timeAgo(input) {
  if (!input) return 'récemment';
  let ms = (typeof input === 'number') ? input : new Date(input).getTime();
  if (isNaN(ms)) return 'récemment';
  let diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 84400) return Math.floor(diff / 3600) + 'h';
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast-notification';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 100);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 500);
  }, 2500);
}

function showModal(msg, confirmText, confirmColor, onConfirm, onCancelOrText) {
  let cancelLabel = typeof onCancelOrText === 'string' ? onCancelOrText : 'Annuler';
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `<div class="modal-box">
    <p style="margin:0 0 16px;font-size:14px;">${msg}</p>
    <div class="modal-actions">
      <button class="modal-cancel">${cancelLabel}</button>
      <button class="modal-confirm" style="background:${confirmColor}">${confirmText}</button>
    </div>
  </div>`;
  document.body.appendChild(o);
  o.querySelector('.modal-cancel').onclick = () => o.remove();
  o.querySelector('.modal-confirm').onclick = () => { o.remove(); onConfirm(); };
}

// --- SAUVEGARDE ---
function _flushDB() {
  if (!window._saveDBDirty || !window.db) return;
  window._saveDBDirty = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

function saveDB() {
  clearCaches();
  window._saveDBDirty = true;
  if (window._saveDBTimer) return;
  window._saveDBTimer = setTimeout(() => {
    window._saveDBTimer = null;
    _flushDB();
  }, 2000);
}

function saveDBNow() {
  clearCaches();
  if (window._saveDBTimer) { clearTimeout(window._saveDBTimer); window._saveDBTimer = null; }
  window._saveDBDirty = true;
  _flushDB();
}

// Listeners auto
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushDB(); });

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function calcE1RM(weight, reps) {
  if (!weight || reps <= 0) return weight || 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// --- TRADUCTION & LOGIQUE UI ---
function t(key, value, opts) {
  const db = window.db;
  if (!db) return String(value);
  let level = db.user.level || 'intermediaire';
  if (db.user.uiDetail === 'simple') level = 'debutant';
  const isBeginner = (level === 'debutant');

  if (key === 'rpe') {
    if (isBeginner) {
      if (value <= 6) return 'Léger 😌';
      if (value <= 8) return 'Soutenu 💪';
      return 'Max 🔥';
    }
    return `RPE ${value}`;
  }
  if (key === 'sets_reps') return isBeginner ? `${value} séries de ${opts}` : `${value}×${opts}`;
  return String(value);
}

function shouldShow(feature) {
  const db = window.db;
  if (!db) return true;
  const level = db.user.level || 'intermediaire';
  const rules = {
    dots_wilks: ['avance', 'competiteur'],
    mev_mav_mrv: ['avance', 'competiteur']
  };
  const allowed = rules[feature];
  return !allowed || allowed.includes(level);
}