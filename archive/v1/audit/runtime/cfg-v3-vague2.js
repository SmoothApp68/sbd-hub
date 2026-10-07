/** VAGUE 2 v3 — Séances. Inventaire par UNION A ∪ B. OUTIL D'AUDIT. */
'use strict';
module.exports = {
  nom: 'VAGUE 2 — Séances (v3, union)',
  // Estimation a priori (écrite AVANT de compter) : 5 sous-vues.
  //  Plan : timeline semaine + 7 cartes de jour + aperçu + bandeau de phase/bloc + boutons
  //         d'action (régénérer, éditer, appliquer, swipe méso) ................ ~35
  //  GO   : en-tête (timer, compteurs ×3) + carte d'exercice complète (nom, charge, reps,
  //         RPE, séries, échauffement, annotations coach, notes, galettes, why, grind,
  //         abandon) × famille + barre de repos + fin de séance (récap/débrief) ... ~45
  //  Log  : navigation semaine + cartes de séance + détail dépliable + menu ....... ~20
  //  Coach: conteneurs + badge + sous-nav ......................................... ~8
  //  Analyse : conteneur + contenu ................................................ ~5
  estimation: 113,
  sourceA: {
    zoneHtml: [2488, 2538],
    racines: ['showSeancesSub', 'renderGoTab', 'renderProgrammeV2', 'renderSessionCards',
      'renderMesoSwipe', 'renderCoachTab', 'renderAnalyseTab', 'renderWeekSessions',
      'goStartRestTimer', 'goSwitchView', 'goTogglePlan', 'renderProgramViewer',
      // ajoutés après contrôle « B seul » : générateurs de la carte d'exercice GO que la
      // fermeture n'atteignait pas (appelés via des helpers intermédiaires)
      'renderGoExoCard', 'renderWhyButton', '_goRpeSliderHTML', 'buildGoIdleHtml',
      'renderGoActiveView'],
    profondeur: 3,
  },
  sourceB: 'out-v2-elements.json',
  sortieUnion: 'out-v3-union-vague2.json',
};
