// js/ui/rendering.js
import { TOAST_DURATION } from '../constants.js';

/**
 * Affiche un toast (notification temporaire).
 */
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_DURATION);
}

/**
 * Affiche une modale de confirmation.
 */
function showModal(msg, confirmText, confirmColor, onConfirm, onCancelOrText) {
  var cancelLabel = typeof onCancelOrText === 'string' ? onCancelOrText : 'Annuler';
  var onCancel = typeof onCancelOrText === 'function' ? onCancelOrText : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <p style="margin:0 0 5px;font-size:14px;">${msg}</p>
      <div class="modal-actions">
        <button class="modal-cancel" style="background:var(--sub);color:#000;">${cancelLabel}</button>
        <button class="modal-confirm" style="background:${confirmColor};color:#000;">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-cancel').onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };
  overlay.querySelector('.modal-confirm').onclick = () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  };
}

/**
 * Génère un bouton d'aide pour le glossaire.
 */
function renderGlossaryTip(key) {
  return '<span class="glossary-tip" onclick="event.stopPropagation();showGlossaryModal(\"' + key + '\")">ℹ️</span>';
}

/**
 * Affiche la modale du glossaire.
 */
function showGlossaryModal(key) {
  var g = GLOSSARY[key];
  if (!g) return;
  var existing = document.getElementById('glossaryModal');
  if (existing) existing.remove();
  var body = '<p style="font-size:13px;line-height:1.6;color:var(--text);margin:0 0 12px;">' + g.desc + '</p>';
  if (g.calc) body += '<div style="background:rgba(10,132,255,0.08);border-radius:10px;padding:10px 12px;margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:4px;">📐 Comment c\'est calculé</div><div style="font-size:12px;color:var(--text);line-height:1.5;">' + g.calc + '</div></div>';
  if (g.example) body += '<div style="background:rgba(50,215,75,0.08);border-radius:10px;padding:10px 12px;"><div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px;">💡 Exemple concret</div><div style="font-size:12px;color:var(--text);line-height:1.5;">' + g.example + '</div></div>';
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'glossaryModal';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="modal-box" style="max-width:380px;padding:20px;text-align:left;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;color:var(--text);">' + g.short + '</div>' +
    '<button onclick="document.getElementById(\'glossaryModal\').remove()" style="background:none;border:none;color:var(--sub);font-size:18px;cursor:pointer;padding:0;">✕</button>' +
    '</div>' + body + '</div>';
  document.body.appendChild(overlay);
}

/**
 * Rend la page complète du glossaire.
 */
function renderGlossaryPage() {
  var el = document.getElementById('glossaryPageContent');
  if (!el) return;
  var html = '';
  for (var catKey in GLOSSARY_CATEGORIES) {
    var cat = GLOSSARY_CATEGORIES[catKey];
    html += '<div style="margin-bottom:16px;">' +
      '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">' + cat.icon + ' ' + cat.label + '</div>';
    cat.keys.forEach(function(key) {
      var g = GLOSSARY[key];
      if (!g) return;
      html += '<div class="glossary-item" onclick="showGlossaryModal(\"' + key + '\")">' +
        '<span style="font-size:12px;font-weight:600;color:var(--text);">' + g.short + '</span>' +
        '<span class="glossary-tip">ℹ️</span>' +
        '</div>';
    });
    html += '</div>';
  }
  el.innerHTML = html;
}