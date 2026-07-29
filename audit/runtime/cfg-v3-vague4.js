/** VAGUE 4 v3 — Stats. Inventaire par UNION. OUTIL D'AUDIT. */
'use strict';
module.exports = {
  nom: 'VAGUE 4 — Stats (v3, union)',
  // Estimation a priori : 4 sous-onglets. Volume (2 groupes de boutons de période + rapport +
  // graphe) ~12 · Muscles (radar + légende + 2 boutons période + bascule barres/évolution +
  // 7 groupes musculaires × chevron/ligne + sous-groupes + landmarks MEV/MAV/MRV × 12 muscles +
  // ratios de force ×5) ~50 · Records (filtre 10 catégories + liste de lifts) ~12 ·
  // Cardio (4 catégories × métriques + historique) ~11.
  estimation: 85,
  sourceA: {
    zoneHtml: [2552, 2609],
    racines: ['showStatsSub', 'renderReports', 'renderVolumeChart', 'renderRadarImproved',
      'renderMuscleChart', 'renderVolumeLandmarks', 'renderStrengthRatios', 'renderLifts',
      'renderCardioStats', 'renderMuscleList', 'renderMuscleVolumeContent', 'renderReportsTimeline'],
    profondeur: 3,
    arret: ['renderDash', 'renderCoachTab', 'renderGoTab', 'renderGamificationTab'],
  },
  sourceB: 'out-v4-elements.json',
  sortieUnion: 'out-v3-union-vague4.json',
};
