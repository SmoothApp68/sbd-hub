// js/logic/core.js

/**
 * Retourne la routine active (personnalisée > générée > template).
 */
function getRoutine() {
  // Priorité 1 : routine personnalisée
  if (db.routine && Object.keys(db.routine).length > 0) return db.routine;
  // Priorité 2 : routine générée à l'onboarding
  if (db.generatedProgram && db.generatedProgram.length > 0) {
    const r = {};
    db.generatedProgram.forEach(d => { r[d.day] = d.isRest ? '😴 Repos' : (d.label || d.day); });
    return r;
  }
  // Priorité 3 : template par défaut selon le mode
  const style = modeFeature('programStyle');
  if (style && ROUTINE_TEMPLATES[style]) return ROUTINE_TEMPLATES[style].routine;
  return DEFAULT_ROUTINE;
}

/**
 * Retourne la valeur d'une feature selon le mode d'entraînement.
 */
function modeFeature(key) {
  // Logique à implémenter selon tes besoins (ex: db.user.trainingMode)
  return 'powerlifting'; // Valeur par défaut
}

/**
 * Calcule le score de readiness (Helms 2018, Zourdos 2016).
 */
function calculateReadiness(sleep, energy, motivation, soreness) {
  const sorenessInverted = 11 - soreness;
  return Math.min(100, Math.max(0, Math.round(
    (sleep * 0.35 + energy * 0.25 + motivation * 0.15 + sorenessInverted * 0.25) * 10
  )));
}

/**
 * Ajuste la charge selon le score de readiness (Tuchscherer RPE system).
 */
function getReadinessLoadAdjustment(readinessScore) {
  if (readinessScore >= 90) return 1.03;
  if (readinessScore >= 80) return 1.00;
  if (readinessScore >= 70) return 0.97;
  if (readinessScore >= 60) return 0.93;
  if (readinessScore >= 50) return 0.90;
  if (readinessScore >= 40) return 0.85;
  return 0.80;
}

/**
 * Met à jour l'aperçu du score de readiness dans l'UI.
 */
function updateReadinessPreview(sleep, energy, motivation, soreness) {
  const score = calculateReadiness(sleep, energy, motivation, soreness);
  const adj = getReadinessLoadAdjustment(score);
  const pctStr = adj >= 1 ? '+' + Math.round((adj - 1) * 100) + '%' : Math.round((adj - 1) * 100) + '%';
  const previewEl = document.getElementById('rd-score-preview');
  const adjEl = document.getElementById('rd-adj-preview');
  if (previewEl) {
    previewEl.textContent = 'Score readiness : ' + score + '%';
    previewEl.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--blue)' : 'var(--orange)';
  }
  if (adjEl) adjEl.textContent = adj === 1 ? 'Charges inchangées' : 'Charges ajustées : ' + pctStr;
}