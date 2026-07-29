/** VAGUE 3 v3 — Maison + Coach. Inventaire par UNION. OUTIL D'AUDIT. */
'use strict';
module.exports = {
  nom: 'VAGUE 3 — Maison + Coach (v3, union)',
  // Estimation a priori : Maison (timeline 7 jours + séance du jour + 4 stats rapides +
  // records personnels ×3 lifts + DOMS + welcome + bloc hérité 14) ~45 ; Coach (13 cartes
  // observées × en-têtes/valeurs + arbitre + potentiel + budget + « Voir plus » + check-in) ~45.
  estimation: 90,
  sourceA: {
    // zone étendue : les conteneurs du Coach (#s-coach, #coach-today, #coach-history)
    // vivent dans le markup de l'onglet Séances (index.html:2498-2507) — sans eux, ils
    // remontaient en « B seul ».
    zoneHtml: [2441, 2508],
    racines: ['renderDash', 'renderTodaySessionInline', 'renderPerfCard', 'renderCoachTab',
      'renderCoachToday', 'renderCoachTodayHTML', 'renderMorningCheckin', 'renderCoachHistory',
      'renderQuickLogCard', 'renderDomsMorningCard', 'buildCheckinFormHtml'],
    profondeur: 3,
    arret: ['renderGoTab', 'renderProgrammeV2', 'showSeancesSub', 'renderSessionCards'],
  },
  sourceB: 'out-v3-elements.json',
  sortieUnion: 'out-v3-union-vague3.json',
};
