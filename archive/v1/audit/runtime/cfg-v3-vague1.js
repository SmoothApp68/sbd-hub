/** VAGUE 1 v3 — Profil. Inventaire par UNION. OUTIL D'AUDIT. */
'use strict';
module.exports = {
  nom: 'VAGUE 1 — Profil (v3, union)',
  // Estimation a priori, raisonnée à partir du rapport v2 : 176 éléments recensés (160 markup
  // + 16 injectés), auxquels s'ajoutent (a) le CONTENU des 7 sections injectées, jamais
  // détaillé en v2 — ~40 ; (b) les blocs sans `id` (lignes de macros, historique de poids,
  // zones de blessure, activités, thèmes, records, glossaire) — ~40. Soit ~256.
  estimation: 256,
  sourceA: {
    zoneHtml: [2610, 3149],
    racines: ['renderCorpsTab', 'fillSettingsFields', 'renderSettingsProfile', 'renderRGPDSection',
      'renderInjuriesEditor', 'renderSettingsActivities', 'renderKeyLiftsEditor',
      'renderRecordsCorrectionList', 'renderGlossaryPage', 'renderTierSection', 'renderStorageGauge',
      'renderAppVersionLine', 'renderFormeScore', 'renderTrainingLoad', 'renderWeightTrend',
      'renderMacroHistory', 'renderBodyWeightChart', 'renderMuscleHeatmap', 'fillTargetSettings',
      'openMorphoSettings', 'showProfilSub',
      // ajouté après contrôle « B seul » : éditeur de routine des Réglages (app.js:3877)
      'renderSettingsRoutineEditor'],
    profondeur: 2,
    arret: ['renderGoTab', 'renderCoachTab', 'renderDash', 'showSeancesSub', 'renderGamificationTab',
      'renderProgrammeV2', 'showFeedSub', 'initSocialTab'],
  },
  sourceB: 'out-v1-elements.json',
  sortieUnion: 'out-v3-union-vague1.json',
};
