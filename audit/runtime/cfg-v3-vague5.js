/** VAGUE 5 v3 — Social + Jeux. Inventaire par UNION. OUTIL D'AUDIT. */
'use strict';
module.exports = {
  nom: 'VAGUE 5 — Social + Jeux (v3, union)',
  // Estimation a priori : Jeux (profil joueur : XP, rang, barre, titres, stats ~20 ;
  // rangs : échelle ~12 ; badges : ~98 badges regroupés en familles + sections ~25) ~57 ;
  // Social (feed + pinned + load-more ~12 · amis + demandes + bloqués + autocomplete ~15 ·
  // défis actifs/terminés + templates + création ~15 · classement podium/table/filtre ~12 ·
  // profil social username/bio/visibilité/code ~15) ~69.
  estimation: 130,
  sourceA: {
    zoneHtml: [3151, 3305],
    racines: ['renderGamificationTab', 'getAllBadges', 'initSocialTab', 'showFeedSub',
      'renderFeed', 'renderLeaderboard', 'renderChallengesTab', 'renderFriendsTab',
      'showJeuxSub', 'renderSocialProfileCard', 'initNotifications'],
    profondeur: 3,
    arret: ['renderDash', 'renderCoachTab', 'renderGoTab', 'showStatsSub'],
  },
  sourceB: 'out-v5-elements.json',
  sortieUnion: 'out-v3-union-vague5.json',
};
