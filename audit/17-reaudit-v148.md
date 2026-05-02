# Re-audit TrainHub v148 — Score définitif

## Résumé exécutif
Score précédent : 7.0/10
Score v148 : **7.8/10**

v148 livre les engagements principaux de la roadmap gamification : architecture décomposée (15 sous-fonctions), 6 badges de statut, sections leaderboard et défis présentes dans le DOM. La stabilité est très bonne (0 erreur console, génération du weeklyPlan J1 fiable). Le seul point à surveiller est que le leaderboard/challenges se vident en offline (comportement gracieux mais visible).

---

## Code Review

| Check | Résultat |
|---|---|
| renderGamificationTab lignes | 20 (refactorisé ✅) |
| Sous-fonctions gamification | 15 (vs 6 minimum requis) ✅ |
| Syntaxe (node -c) | ✅ SYNTAX_OK — app.js, engine.js, supabase.js |
| SW version | trainhub-v148 |
| Nouveaux badges status | 6/6 ✅ (status_consistency, status_warrior, status_volume_king, status_early_bird, status_comeback, status_pr_month) |
| DOM gamLeaderboard + gamChallengesSection | ✅ (2 occurrences, dans jeux-badges sub-section) |
| calcE1RM duplication | Aucune — app.js a calcE1RM (ligne 1092) + wpCalcE1RM (ligne 15914) — engine.js a calcE1RMFrom5RepTest — pas de doublon réel |
| Nouveaux fonctions (calcLeaderboardMetrics, syncLeaderboard, sendFriendChallenge, _renderLeaderboard) | ✅ Toutes présentes (engine.js + supabase.js + app.js) |

---

## Tests Playwright

| Test | Statut | Evidence |
|---|---|---|
| weeklyPlan J1 auto-généré | ✅ | weeklyPlan.days.length = 7, keys: days/week/weekStreak/phase/mode/isDeload/generated_at/isRepeatWeek/missedNote |
| Programme tab — contenu présent | ✅ | seances-programme innerHTML non vide, programBuilderContent chargé |
| Gamification tab — rendu OK (gamLevelCard) | ✅ | gamLevelCard.innerHTML.length = 1097 |
| Gamification tab — gamBadgesSections | ✅ | innerHTML.length = 45544 (rich content) |
| Leaderboard section DOM visible | ✅ | gamLeaderboard element exists |
| Leaderboard section contenu | ⚠️ | Vide en offline (supaClient undefined → fallback silencieux correct) |
| Friend Challenges section DOM visible | ✅ | gamChallengesSection element exists |
| Friend Challenges section contenu | ⚠️ | Vide en offline (même raison que leaderboard) |
| GO tab — session vide démarre | ✅ | activeView.display=block, timer actif, header buttons présents |
| GO tab — plate calculator (Galettes) | ⚠️ | Non visible : aujourd'hui = jour de repos dans le plan généré (samedi), pas de bug — Galettes apparaît uniquement avec exercices actifs |
| GO tab — warmup | ✅ | "chauff" présent dans le rendu go-recap-view |
| Coach tab — contenu présent | ✅ | coach-today.innerHTML.length = 1372, message de bienvenue S1 de calibration affiché |
| Console errors app-level | ✅ | 0 erreur (toute la session complète) |

---

## Score par module

| Module | v145 | v148 | Delta | Justification |
|---|---|---|---|---|
| Stabilité / Bugs | 5.5 | 8.0 | +2.5 | 0 TypeError, 0 console error, génération weeklyPlan fiable en J1 |
| Architecture | 6.0 | 7.5 | +1.5 | renderGamificationTab décomposé en 15 sous-fonctions, calcLeaderboardMetrics dans engine, syncLeaderboard dans supabase |
| UX / Features | 7.0 | 7.5 | +0.5 | Coach tab personnalisé dès J1, GO démarre sans crash, gamification riche (45k chars) |
| Gamification | 6.5 | 8.5 | +2.0 | 6/6 badges statut, leaderboard + challenges dans DOM, gamLevelCard rendu (1097 chars), syncLeaderboard dans supabase.js |
| Global | 7.0 | 7.8 | +0.8 | |

---

## Détails techniques complémentaires

### Architecture gamification
- `renderGamificationTab` : 20 lignes (orchestrateur pur) ✅
- 15 sous-fonctions identifiées : `_buildGamContext`, `_renderGamMuscleAnatomy`, `_renderGamWeeklyRecap`, `_renderGamLevelCard`, `_renderGamXPSources`, `_renderGamChallenges`, `_renderGamMonthlyChallenges`, `_renderGamSBDRanks`, `_renderGamStrengthCards`, `_renderGamHeatmap`, `_renderGamBadges`, `_renderLeaderboard`, `sendFriendChallenge`, `acceptFriendChallenge`, `renderFriendChallenges`
- `calcLeaderboardMetrics()` → engine.js ligne 3879
- `getLeaderboardPeriodKey()` → engine.js ligne 3895
- `syncLeaderboard()` → supabase.js ligne 137

### Comportement GO tab — clarification
Le test `_goDoStartWorkout(true)` retourne "Jour de repos" car le plan généré place samedi (day 6) en repos (0 exercises assignés). Ce comportement est **correct** — le plan respecte la fréquence 4j/semaine demandée. `goStartWorkout(false)` (séance vide) démarre bien : timer actif, goActiveView visible, session créée sans erreur.

### Leaderboard/Challenges offline
`_renderLeaderboard()` et `renderFriendChallenges()` vérifient `if (typeof supaClient === 'undefined' || !supaClient) { el.innerHTML = ''; return; }` — comportement gracieux correct. En beta avec Supabase connecté, ces sections se rempliront.

---

## Prêt pour la bêta ?
**OUI avec réserves mineures**

### Conditions bloquantes restantes
Aucune condition bloquante identifiée.

### Non-bloquants à surveiller
1. **Leaderboard vide offline** : Les sections leaderboard et défis s'affichent vides sans connexion Supabase. Envisager un message "Connecte-toi pour voir le classement" plutôt qu'un conteneur vide.
2. **calcE1RM dans app.js** : La fonction `calcE1RM` est définie à la fois dans app.js (ligne 1092, formule Epley) et `wpCalcE1RM` (ligne 15914, formule avec RPE). Les deux sont distinctes et utiles, mais le nom similaire peut prêter à confusion pour la maintenance.
3. **GO tab rest day** : Quand le plan assigne un jour de repos, la page affiche "Jour de repos" même si l'utilisateur veut s'entraîner. Le chemin "Séance vide" est présent mais peu visible.
4. **gamChallengesSection contenu** : Les défis ami-à-ami nécessitent des amis dans la DB Supabase — à tester en conditions beta réelles.

---

## Score global : 7.8/10

*Audit réalisé le 2026-05-02 — Playwright Chromium 1194 — Serveur local localhost:3456*
