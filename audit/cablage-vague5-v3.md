# Audit de câblage — Vague 5 v3 : Social + Jeux (inventaire par UNION)

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Reprise de `audit/cablage-vague5-*.md` (conservé). Méthode : voir `cablage-vague2-seances-v3.md`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Estimation a priori : 130** *(écrite avant tout comptage)*.
> **Inventorié : 129** — 97 éléments à `id` + 32 blocs sans `id`.
> **Phase 1 : 129 · Phase 2 : 129 verdicts · Phase 5 : 129 statuts runtime.**

| Provenance (éléments à `id`) | Nombre |
|---|---|
| A ∩ B — vu dans le code **et** rendu | 72 |
| **A seul — jamais rendu sur les 17 états** | **25** |
| B seul — générateur raté par la source A | 0 |

**Comparaison v2 → v3 : 89 → 129.**

| Périmètre | |
|---|---|
| Zone auditée | index.html:3151-3305 + renderGamificationTab/initSocialTab |
| États runtime | 17 |

## LES 25 ÉLÉMENTS « A SEUL »

Contrairement aux autres vagues, **aucun n'est un rendu inatteignable** : ce sont tous des éléments
dont la condition d'apparition dépend d'une **lecture réseau** ou d'une **interaction non provoquée**.
Le réseau étant intégralement stubbé (les vraies données ne doivent jamais être touchées), ils sont
structurellement hors d'atteinte de ce banc.

| Groupe | Éléments | Produit par | Condition |
|---|---|---|---|
| **Carte de feed (v1)** | `feed-session-detail<n>`, `feed-detail<n>`, `feed-reactions<n>`, `emoji-picker<n>`, `feed-comments<n>` — 5 | `renderFeedCard` supabase.js:2642-2686 | au moins un post dans `activity_feed` |
| **Carte de feed (v2)** | `fv2-like<n>`, `fv2-comment-btn<n>`, `fv2<n>`, `fv2-comments<n>` — 4 | `fv2RenderCard` supabase.js:5092-5110 | idem |
| **Commentaires** | `comment-input<n>`, `comment-row<n>` — 2 | `loadAndRenderComments` 2867 · `loadFv2Comments` 5435 · `appendRealtimeComment` 1601 | commentaires existants |
| **Réactions / menus** | `reaction-picker-`, `fv2-popover-` — 2 | `openReactionPicker` 5360 · `openFv2Menu` 5015 | interaction sur une carte |
| **Défis** | `defi-exercise`, `defi-target`, `defi-deadline` — 3 | `openDefiModal` supabase.js:2364-2371 | ouverture de la modale de défi |
| **Profil social** | `socialEditUsername`, `socialEditBio` — 2 | `renderSocialProfileCard` supabase.js:3402-3410 | profil social créé |
| **Suppression de compte** | `del-erase`, `del-anon`, `del-confirm` — 3 | `showAccountDeletionDialog` supabase.js:4336-4346 | dialogue RGPD ouvert |
| **Badges / titres** | `bdgSec`, `<var:badge>`, `titleList`, `<var:badgeId>` — 4 | `_renderGamBadges` 8664-8688 · `showTitleModal` 7673 · `scrollToBadgeCategory` 7723 | modale de titres, ancre de badge |

**Verdict d'ensemble : ⊘ NON TESTABLE, raison identique — réseau stubbé ou interaction non provoquée.**
Aucun ne peut être déclaré 🔴 sur ce banc, et je ne le fais pas.

**Le cas `del-erase` / `del-anon` / `del-confirm`** mérite d'être signalé : ce sont les trois options
du dialogue de **suppression de compte** (RGPD). Elles n'ont jamais été rendues par l'audit — ni en v2,
ni en v3. La chaîne RGPD reste donc **non vérifiée à l'exécution**, sur les deux passages.

## PHASE 2 — 97 VERDICTS (éléments à `id`)
| # | Élément | Provenance | Origine | Rendu atteignable ? | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1 | `tab-game` | A∩B | index.html:3151 | oui | ✅ CÂBLÉ | ✔ visible |
| 2 | `jeux-profil-joueur` | A∩B | index.html:3161 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `gamLevelCard` | A∩B | index.html:3162 | oui | ✅ CÂBLÉ | ✔ visible |
| 4 | `gamXPSources` | A∩B | index.html:3163 | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `gamChallenges` | A∩B | index.html:3164 | oui | ✅ CÂBLÉ | ✔ visible |
| 6 | `gamMonthlyChallenges` | A∩B | index.html:3165 | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `gamHeatmap` | A∩B | index.html:3166 | oui | ✅ CÂBLÉ | ✔ visible |
| 8 | `jeux-rangs` | A∩B | index.html:3169 | oui | ✅ CÂBLÉ | ✔ visible |
| 9 | `anatomyCard` | A∩B | index.html:3170 | oui | ✅ CÂBLÉ | ✔ visible |
| 10 | `btn-body-front` | A∩B | index.html:3173 | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `btn-body-back` | A∩B | index.html:3174 | oui | ✅ CÂBLÉ | ✔ visible |
| 12 | `btn-body-gender` | A∩B | index.html:3175 | oui | ✅ CÂBLÉ | ✔ visible |
| 13 | `body-figure-container` | A∩B | index.html:3177 | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `muscle-list` | A∩B | index.html:3178 | oui | ✅ CÂBLÉ | ✔ visible |
| 15 | `antagonistAlerts` | A∩B | index.html:3179 | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `gamSBDRanks` | A∩B | index.html:3181 | oui | ✅ CÂBLÉ | ✔ visible |
| 17 | `gamStrengthContent` | A∩B | index.html:3182 | oui | ✅ CÂBLÉ | ✔ visible |
| 18 | `jeux-badges` | A∩B | index.html:3185 | oui | ✅ CÂBLÉ | ✔ visible |
| 19 | `gamRecentBadges` | A∩B | index.html:3186 | oui | ✅ CÂBLÉ | ✔ visible |
| 20 | `gamNextBadges` | A∩B | index.html:3187 | oui | ✅ CÂBLÉ | ✔ visible |
| 21 | `gamBadgesOverview` | A∩B | index.html:3188 | oui | ✅ CÂBLÉ | ✔ visible |
| 22 | `gamBadgesSections` | A∩B | index.html:3189 | oui | ✅ CÂBLÉ | ✔ visible |
| 23 | `gamLeaderboard` | A∩B | index.html:3194 | oui | ✅ CÂBLÉ | ✔ visible |
| 24 | `tab-social` | A∩B | index.html:3203 | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `feedPills` | A∩B | index.html:3205 | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `socialJeuxBadgeDot` | A∩B | index.html:3220 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 27 | `feed-amis` | A∩B | index.html:3224 | oui | ✅ CÂBLÉ | ✔ visible |
| 28 | `feedAmisContent` | A∩B | index.html:3225 | oui | ✅ CÂBLÉ | ✔ visible |
| 29 | `feedAmisLoadMore` | A∩B | index.html:3226 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 30 | `feedAmisInvite` | A∩B | index.html:3229 | oui | ✅ CÂBLÉ | ✔ visible |
| 31 | `feed-communaute` | A∩B | index.html:3233 | oui | ✅ CÂBLÉ | ✔ visible |
| 32 | `feedCommunauteContent` | A∩B | index.html:3234 | oui | ✅ CÂBLÉ | ✔ visible |
| 33 | `feedCommunauteLoadMore` | A∩B | index.html:3235 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 34 | `feed-challenges` | A∩B | index.html:3241 | oui | ✅ CÂBLÉ | ✔ visible |
| 35 | `feedChallengesContent` | A∩B | index.html:3242 | oui | ✅ CÂBLÉ | ✔ visible |
| 36 | `feed-classement` | A∩B | index.html:3246 | oui | ✅ CÂBLÉ | ✔ visible |
| 37 | `feedClassementContent` | A∩B | index.html:3247 | oui | ✅ CÂBLÉ | ✔ visible |
| 38 | `social-feed` | A∩B | index.html:3252 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 39 | `feedPinnedSection` | A∩B | index.html:3253 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 40 | `feedContent` | A∩B | index.html:3254 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 41 | `feedLoadMore` | A∩B | index.html:3255 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 42 | `social-leaderboard` | A∩B | index.html:3256 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 43 | `lbExerciseFilter` | A∩B | index.html:3258 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 44 | `lbPodium` | A∩B | index.html:3259 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 45 | `lbTable` | A∩B | index.html:3260 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 46 | `lbEmpty` | A∩B | index.html:3261 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 47 | `social-challenges` | A∩B | index.html:3264 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 48 | `challengesCreateBtn` | A∩B | index.html:3265 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 49 | `challengeTemplates` | A∩B | index.html:3266 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 50 | `challengesActiveList` | A∩B | index.html:3267 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 51 | `challengesFinishedList` | A∩B | index.html:3268 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 52 | `social-friends` | A∩B | index.html:3271 | oui | ✅ CÂBLÉ | ✔ visible |
| 53 | `socialProfileCard` | A∩B | index.html:3272 | oui | ✅ CÂBLÉ | ✔ visible |
| 54 | `chev-ca-social-profile` | A∩B | index.html:3276 | oui | ✅ CÂBLÉ | ✔ visible |
| 55 | `ca-social-profile` | A∩B | index.html:3278 | oui | ✅ CÂBLÉ | ✔ visible |
| 56 | `socialProfileContent` | A∩B | index.html:3278 | oui | ✅ CÂBLÉ | ✔ visible |
| 57 | `myFriendCode` | A∩B | index.html:3283 | oui | ✅ CÂBLÉ | ✔ visible |
| 58 | `friendCodeInput` | A∩B | index.html:3289 | oui | ✅ CÂBLÉ | ✔ visible |
| 59 | `friendSearchInput` | A∩B | index.html:3293 | oui | ✅ CÂBLÉ | ✔ visible |
| 60 | `friendAutocomplete` | A∩B | index.html:3295 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 61 | `pendingRequestsSection` | A∩B | index.html:3298 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 62 | `pendingRequestsList` | A∩B | index.html:3298 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 63 | `friendsListCard` | A∩B | index.html:3299 | oui | ✅ CÂBLÉ | ✔ visible |
| 64 | `friendsListTitle` | A∩B | index.html:3299 | oui | ✅ CÂBLÉ | ✔ visible |
| 65 | `friendsList` | A∩B | index.html:3299 | oui | ✅ CÂBLÉ | ✔ visible |
| 66 | `notifSection` | A∩B | index.html:3300 | oui | ✅ CÂBLÉ | ✔ visible |
| 67 | `notifList` | A∩B | index.html:3300 | oui | ✅ CÂBLÉ | ✔ visible |
| 68 | `blockedSection` | A∩B | index.html:3301 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 69 | `blockedList` | A∩B | index.html:3301 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 70 | `socialEditUsername` | A seul | supabase.js:3402 [renderSocialProfileCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 71 | `socialEditBio` | A seul | supabase.js:3410 [renderSocialProfileCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 72 | `sg<n>` | A∩B | app.js:8458 [_renderGamStrengthCards] | oui | ✅ CÂBLÉ | ✔ visible |
| 73 | `bdgSec<n>` | A∩B | app.js:8633 [_renderGamBadges] | oui | ✅ CÂBLÉ | ✔ visible |
| 74 | `bdgSec` | A seul | app.js:8664 [_renderGamBadges] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 75 | `<var:badge>` | A seul | app.js:8676 [_renderGamBadges] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 76 | `lb2Body` | A∩B | supabase.js:5744 [renderFeedClassementV2] | oui | ✅ CÂBLÉ | ✔ visible |
| 77 | `feed-session-detail<n>` | A seul | supabase.js:2642 [renderFeedCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 78 | `feed-detail<n>` | A seul | supabase.js:2675 [renderFeedCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 79 | `feed-reactions<n>` | A seul | supabase.js:2676 [renderFeedCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 80 | `emoji-picker<n>` | A seul | supabase.js:2679 [renderFeedCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 81 | `feed-comments<n>` | A seul | supabase.js:2686 [renderFeedCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 82 | `del-erase` | A seul | supabase.js:4336 [showAccountDeletionDialog] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 83 | `del-anon` | A seul | supabase.js:4340 [showAccountDeletionDialog] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 84 | `del-confirm` | A seul | supabase.js:4346 [showAccountDeletionDialog] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 85 | `titleList` | A seul | app.js:7673 [showTitleModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 86 | `<var:badgeId>` | A seul | app.js:7723 [scrollToBadgeCategory] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 87 | `fv2-like<n>` | A seul | supabase.js:5092 [fv2RenderCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 88 | `fv2-comment-btn<n>` | A seul | supabase.js:5093 [fv2RenderCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 89 | `fv2<n>` | A seul | supabase.js:5098 [fv2RenderCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 90 | `fv2-comments<n>` | A seul | supabase.js:5110 [fv2RenderCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 91 | `defi-exercise` | A seul | supabase.js:2364 [openDefiModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 92 | `defi-target` | A seul | supabase.js:2370 [openDefiModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 93 | `defi-deadline` | A seul | supabase.js:2371 [openDefiModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 94 | `fv2-popover-` | A seul | supabase.js:5015 [openFv2Menu] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 95 | `reaction-picker-` | A seul | supabase.js:5360 [openReactionPicker] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 96 | `comment-input<n>` | A seul | supabase.js:2867 [loadAndRenderComments] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 97 | `comment-row<n>` | A seul | supabase.js:5423 [loadFv2Comments] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |

**Décompte** : ✅ CÂBLÉ 50 · ✅ CÂBLÉ (conditionnel) 32 · ❓ NE SAIS PAS 15 = **97**.

## PHASE 2 bis — 32 BLOCS SANS `id` (extraits significatifs)

| # | Bloc | Occ. | Visible | Contenu | Verdict |
|---|---|---|---|---|---|
| 98 | `div.bdg-sec-head` | 17 | oui | « 🔮 Quêtes secrètes 6/8 ▾ » | ✅ CÂBLÉ |
| 99 | `div.bdg-sec-body` | 16 | **non** | « 🔒 ??? Quête secrète non révélée » | ✅ conditionnel (accordéon replié) |
| 100 | `div.mc` (carte de métrique) | 6 | oui | « 📊 Sources d'XP » | ✅ CÂBLÉ |
| 101 | `button.stats-sub-pill` | 5 | oui | « Amis » | ✅ CÂBLÉ |
| 102 | `div.gam-separator` | 4 | oui | « ✦ ─── ✦ » | ➖ COSMÉTIQUE |
| 103 | `div.sg-page` (page de force) | 4 | oui | « Leg Curl Assis · e1RM 79kg · 0.81× BW » | ⚠️ **e1RM affiché** |
| 104 | `span.voir-plus-btn` | 3 | oui | « voir + » | ✅ CÂBLÉ |
| 105 | `div.subkeys-panel` | 3 | **non** | « Pectoraux hauts 7.9t Sculpté » | ✅ conditionnel |
| 106 | `div.sbd-rank-detail-tier` | 3 | oui | « Guerrier » | ✅ CÂBLÉ |
| 107 | `div.sbd-rank-detail-e1rm` | 3 | oui | « 158 kg » | ⚠️ **e1RM affiché** |
| 108 | `div.sbd-rank-detail-pct` | 3 | oui | « Top 43% mondial » | ✅ CÂBLÉ |
| 109 | `button.feed-load-more` | 3 | **non** | « Voir plus » | ⊘ réseau |
| 110 | `div.card` | 3 | oui | « Classement » | ✅ CÂBLÉ |
| 111 | `div.lvl-card.lvl-card-v2` | 1 | oui | « 🏛️ » | ✅ CÂBLÉ |
| 112 | `div.quest-card` | 1 | oui | « ⚡ Quêtes de la semaine » | ✅ CÂBLÉ |
| 113 | `div.quest-arc` | 1 | oui | « 🏔 Arcs du mois » | ✅ CÂBLÉ |
| 114 | `div.quest-card` | 1 | oui | « ⚡ Quêtes de la semaine » | ✅ CÂBLÉ |
| 115 | `div.quest-arc` | 1 | oui | « 🏔 Arcs du mois » | ✅ CÂBLÉ |
| 116 | `div.mc-title` | 1 | oui | « 💪 Muscles » | ✅ CÂBLÉ |
| 117 | `div.sg-dot.active` | 1 | oui | «  » | ✅ CÂBLÉ |
| 118 | `div.bdg-overview` | 1 | oui | « 53 / 159Badges débloquésCommun 16/18Peu  » | ✅ CÂBLÉ |
| 119 | `div.bc-scroll` | 1 | oui | « 🔮 Secrètes 6/8🎯 Séances 10/12💪 Volume » | ✅ CÂBLÉ |
| 120 | `div.bdg-sec-body.open` | 1 | oui | « Commun🎯Première MarqueundefinedPremière » | ✅ CÂBLÉ |
| 121 | `div.feed-empty` | 1 | oui | « 🤝 » | ✅ CÂBLÉ |
| 122 | `div.fv2-invite-card` | 1 | oui | « Code ami » | ✅ CÂBLÉ |
| 123 | `div.corps-acc-head` | 1 | oui | « 👤 » | ✅ CÂBLÉ |
| 124 | `div.corps-acc-info` | 1 | oui | « Mon Profil » | ✅ CÂBLÉ |
| 125 | `div.corps-acc-sub` | 1 | oui | « Pseudo, bio, vie privée » | ✅ CÂBLÉ |
| 126 | `button.btn` | 1 | oui | « Ajouter » | ✅ CÂBLÉ |
| 127 | `div.ch2-create` | 1 | oui | « ➕ » | ✅ CÂBLÉ |
| 128 | `div.lb2-period-pills` | 1 | oui | « Cette semaine » | ✅ CÂBLÉ |
| 129 | `div.lb2-category-pills` | 1 | oui | « Volume 🏋️ » | ✅ CÂBLÉ |

**Décompte total : 97 + 32 = 129 verdicts.**

### 🔴 Deux surfaces d'affichage de l'e1RM découvertes par l'union

Les blocs `div.sg-page` (« e1RM 79kg · 0.81× BW ») et `div.sbd-rank-detail-e1rm` (« 158 kg ») affichent
l'e1RM dans l'onglet **Jeux** — surfaces que ni la v2 (pas de recensement de blocs) ni les vagues 1-4
n'avaient relevées. Cela porte le total à **6 surfaces d'affichage de l'e1RM** (CLAUDE.md §7).

## PHASES 3 et 5

Inchangées — voir `audit/cablage-vague5-social-jeux.md`. Les constats **J1** (`renderFriendsTab` lève
une exception, fix #5 confirmé), **J2** (code d'invitation « --- »), **J3** (3 sous-sections héritées)
et **J4** (quiz archétype fonctionnel, réfuté) restent valides.

## Angles morts

- **19 conteneurs à condition réseau** (v2) + **25 éléments A-seul** (v3) : la couverture runtime de
  cette vague reste la plus faible des quatre, pour la même raison — réseau stubbé par construction.
- **La chaîne de suppression de compte (RGPD) n'a été rendue sur aucun des deux passages.**
- Aucun device Android réel.
