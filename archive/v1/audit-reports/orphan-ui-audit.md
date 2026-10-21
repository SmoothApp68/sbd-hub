# AUDIT — Code orphelin & décalage code/UI (fonctionnalités inaccessibles)

> **Branche** : `audit/orphan-ui-audit` · **Base** : `main` · **Diagnostic SEUL** (aucune modif, aucun fix).
> Méthode : analyse statique (histogramme définition↔appels sur tout le repo) **+** traçage manuel des routeurs à `return` anticipé (que l'histogramme ne peut pas voir).

---

## Résumé exécutif

- **1 PERTE RÉELLE à fort impact** : la restauration des **backups de programme** (« 📦 Versions sauvegardées » : Restaurer / Prévisualiser / Supprimer) est **inaccessible** — c'est le déclencheur de l'audit, confirmé.
- **1 PERTE RÉELLE à impact moyen** : créer un **défi entre amis** est cassé (le bouton de choix de métrique appelle une fonction inexistante `selectChallengeMetric`).
- **5 vues `render*` orphelines** supplémentaires, presque toutes **abandons volontaires** (remplacées par les vues v2 / `renderCoachHistory`), donc dette de code morte plutôt que pertes.
- **3 fonctions définies en double** (l'une masque l'autre ; la copie `app.js` gagne car chargée en dernier).
- **~84 fonctions totalement non référencées** (helpers/formules moteur jamais appelés) : nettoyage, **0 impact utilisateur**.
- **~9 références `typeof X==='function'` vers des fonctions absentes** : no-ops silencieux (features discrètement désactivées, pas de crash).

**Ampleur** : le problème de pertes accessibles n'est PAS généralisé. La grosse perte (backups) vient d'**une seule refonte** (`v237`) qui a court-circuité l'ancienne vue sans reporter sa section backups. Une seconde perte (défis) est indépendante (glue manquante). Le reste est du code mort (résidu de refontes), sans régression UI directe.

---

## Méthode (Q métho)

1. Histogramme : pour chaque `function NAME(` (1221 défs, 1218 noms distincts dans `app/program/engine/import/coach/supabase/joints`), compté les occurrences de `NAME(` sur **tout** le repo (calls JS + `onclick` dans les templates + `index.html`). `total == nb_def` ⇒ jamais appelée avec parenthèses.
2. Filtre faux positifs : recomptage des références **nues** (`\bNAME\b`) → distingue « jamais référencée » des callbacks/`.map(NAME)`/`typeof`.
3. **Traçage manuel des routeurs** : l'histogramme ne détecte PAS une fonction dont le seul appel est dans du code **inatteignable** (après un `return`). D'où le suivi des bascules `vN→vN+1`.
4. Correction en cours d'analyse : `js/exercises.js` (453 ko) avait été omis au départ → plusieurs « undefined » étaient en fait définis là (`getExoImageUrl`, `getExoPlaceholderIcon`) → réintégré.

---

## Q1 — Fonctions de rendu orphelines

### Q1.a — Le routeur à `return` anticipé (la cause du bug déclencheur)
`renderProgramBuilder()` (**app.js:12119**) :
```js
// v237 — délègue toujours à renderProgrammeV2, cache l'ancien container
if (typeof renderProgrammeV2 === 'function') { … renderProgrammeV2(); return; }   // app.js:12137-12142
```
`renderProgrammeV2` existe toujours ⇒ **tout le code en dessous est mort** : l'écran de choix initial, `renderProgramTab()`, et surtout **tout chemin vers `renderProgramBuilderView()`**.

`renderProgramBuilderView()` (**app.js:13494**) — appelée seulement depuis :
- 13693 / 13963 / 14035 / 14046 → appels internes au cluster builder-view (eux-mêmes morts) ;
- **22533** : `if (typeof generateWeeklyPlan==='function') generateWeeklyPlan(); else renderProgramBuilderView(...)` — la branche `else` n'est **jamais** prise (`generateWeeklyPlan` existe toujours).
→ `renderProgramBuilderView` est **totalement inatteignable** (orphelin « v237 », invisible à l'histogramme car ses call-sites existent mais sont en code mort).

### Q1.b — Orphelins détectés par l'histogramme (jamais référencés)
95 fonctions jamais appelées avec `()` ; après filtre des références nues, **84 totalement non référencées** (n'apparaissent qu'à leur propre `function NAME(`). Les `render*` parmi elles :

| Fonction | Def | Verdict |
|---|---|---|
| `renderProgramBuilderView` | 13494 | **ORPHELIN** (via Q1.a, pas via histogramme) |
| `renderWeeklySummary` | 8665 | ORPHELIN-MORT |
| `renderTodayProgram` | 8737 | ORPHELIN-MORT |
| `renderProgramIdentityCard` | 13376 | ORPHELIN-MORT (seul appelant = `tests/diag-s1-visual.spec.js` — un test exerce du code mort) |
| `renderCoachDayDetail` | 19460 | ORPHELIN-MORT |
| `renderCoachReports` | 19795 | ORPHELIN-MORT (stub legacy → `renderCoachHistory()`) |
| `renderWpExercise` | 26206 | **FAUX POSITIF** — LIVE via `.map(renderWpExercise)` dans `renderWeeklyPlanUI()` (26149), elle-même appelée par `generateWeeklyPlan`/`wpSelectDay` |

Long tail (non-`render*`, 78 fonctions) : formules moteur & helpers jamais appelés dans l'app — `brzyckiE1RM`, `epleyE1RM`, `lombardi1RM`, `computeWilks`, `getMEV`, `getMRV`, `getMRVWithCycleAdjust`, `computeNextLoad`, `estimateE1RMFromTransfer`, `findBestTransferSource`, `getRepRange`, `getRestSeconds`, `getWarmupSets`, `getWorkSets`, `getPeakPhase`, `generateMuscuWeek`, `generatePBSession`, `generatePLMesocycle`, `buildSessionFromAI`, `doGenerateProgram`, `getExerciseDay`, `isFatigued`, `parseCSVRow`, `getMyUserId`, etc., **plus** des handlers UI jamais câblés : `showMagicStart`, `startInstinctSession`, `showActivityQuickLog`, `showDataGapBanner`, `goShowAutoRegSuggestion`, `showOnboardingComplete`, `setGhostMode`, `coachSelectDay`, `selectCardio`, `toggleInjury`, `svgToggleView`, `updateSocialBadge`, `toggleSession`, `toggleScExo`. → **ABANDON / code mort** (aucun `onclick` même en code mort ne les référence ⇒ ce ne sont pas des « boutons cassés », juste des défs résiduelles).

---

## Q2 — Fonctionnalités perdues dans la refonte (v1 court-circuitée par v2)

**`renderProgramBuilderView` (v1, morte) vs `renderProgrammeV2` (live)** — ce que la v2 NE reporte PAS :

| Section / action (dans la v1 morte) | Réf. | Présent dans `renderProgrammeV2` ? |
|---|---|---|
| **📦 « Versions sauvegardées »** (liste des 15 backups) | 13575-13578 | **NON** |
| Bouton **Prévisualiser** (`previewBackup`) | 13605 | **NON** |
| Bouton **Restaurer** (`restoreCustomProgramBackup`) | 13608 | **NON** |
| Bouton **Supprimer** un backup (`deleteCustomProgramBackup`) | 13611 | **NON** |

→ **PERTE RÉELLE** : l'utilisateur ne peut plus **restaurer / prévisualiser / supprimer** un backup de programme. Les fonctions (`restoreCustomProgramBackup` 12849, `previewBackup` 13434, `deleteCustomProgramBackup` 13480) **existent et fonctionnent** ; seul l'unique écran qui les expose est mort. C'est aussi pourquoi ces 3 fonctions n'apparaissent PAS comme orphelines à l'histogramme (référencées dans des `onclick` de code mort).

**Autres vues mortes (Q1.b)** — comparées au live :
- `renderCoachReports` → délègue à `renderCoachHistory()` (live) : **ABANDON** pur, rien de perdu.
- `renderTodayProgram` / `renderWeeklySummary` (cartes « programme du jour » / « résumé hebdo ») → équivalents rendus ailleurs (dashboard / `renderProgrammeV2`) : **ABANDON probable** (à confirmer visuellement, impact faible).
- `renderProgramIdentityCard` (nom du programme + état sync + jours) → recouvert par l'en-tête de `renderProgrammeV2` : **ABANDON probable**.
- `renderCoachDayDetail` (détail jour : séries/RPE/réel-vs-prévu) → vue de détail riche non rattachée ; recouvert partiellement par `renderCoachToday`/meso view : **ABANDON probable** (vérifier qu'aucun détail unique n'est perdu).

---

## Q3 — Handlers `onclick` morts & références vers fonctions inexistantes

### PERTE RÉELLE (bouton visible → fonction inexistante)
- **`selectChallengeMetric`** — appelée **uniquement** dans un `onclick` (**app.js:7342**) du modal « ⚔️ Nouveau Défi » (`showChallengePicker`, 7332, **atteignable** depuis l'état vide des défis, 7306). La fonction **n'existe nulle part**. Effet : taper une métrique fait `closeModal()` puis lève une `ReferenceError` → **le défi n'est jamais créé**. La fonction de création existe pourtant (`createChallenge`, supabase.js:4189) : c'est la **glue qui manque**. → **création de défi entre amis cassée**.

### Références inertes (`typeof X==='function'` vers fonction absente → no-op silencieux)
Pas de crash (le garde protège), mais **feature discrètement désactivée** :
| Référence absente | Site | Effet |
|---|---|---|
| `loadFromCloud` | app.js:31833 | branche de chargement cloud morte (probable ancien nom de `syncFromCloud`) |
| `syncSupabase` | app.js:31796 | sync alternative jamais exécutée (ancien nom de `syncToCloud`) |
| `saveSessionToSupabase` | index.html:3551 | rejeu de l'`offlineQueue` ne sync rien par ce chemin |
| `purgeVeryOldLogs` | app.js:26337 | purge des très vieux logs jamais exécutée |
| `renderActiveWorkout` | app.js:1488 | re-render séance active après restauration IDB : no-op |
| `computeE1RMTrend` | engine.js:1264 | tendance e1RM laissée à sa valeur par défaut |
| `wpGetExerciseMeta` | app.js:23748 | méta exercice non récupérée (fallback) |
| `_getFriendLogs` | app.js:7114 | logs d'amis non chargés par ce chemin |
| `getMuscleStyle` | app.js:16177 | style muscle → fallback |

### Dormant (derrière un flag jamais vrai en web)
- `syncHealthConnectData` (app.js:17499) sous `if ('health' in navigator)` → branche jamais atteinte sur navigateurs actuels (feature Health Connect non finie). Non bloquant.

### Faux positifs écartés (NE PAS toucher)
`setsInRange` (const local 15601), `getCardioStyle` (const local 15505), `_readinessOnComplete` (variable-callback `let`, 969), `getExoImageUrl`/`getExoPlaceholderIcon` (définies dans `js/exercises.js`), `renderWpExercise` (via `.map`), `buildUserAccessoryPool` (cité dans **un commentaire** 11146, aucun appel réel).

---

## Q4 — Définitions multiples (shadowing)

3 noms définis 2×. **En scope global, le script chargé en dernier gagne** ; `js/app.js` est chargé en dernier (`index.html` ordre : engine → exercises → supabase → import → coach → program → **app**). Donc **la copie `app.js` gagne** à chaque fois ; l'autre est **morte**.

| Nom | Copie morte | Copie gagnante (app.js) | Risque |
|---|---|---|---|
| `upsertReport` | import.js:9 (3 args) | **app.js:19659** (4 args, + `weekKey`) | Signatures **différentes** ; vérifier que la 4-args couvre bien tous les usages debrief+weekly |
| `saveAlgoDebrief` | import.js:1552 | **app.js:19817** | **Le plus risqué** : DEUX implémentations complètes — divergence possible ; confirmer que l'app.js est l'intentionnelle |
| `getLeaderboardPeriodKey` | engine.js:5101 | **app.js:4235** | Vérifier équivalence (clé de période leaderboard) |

> Aucun bug actif détecté (la copie attendue gagne), mais ce sont exactement les configs qui ont déjà causé des bugs ici. À dédupliquer (supprimer la copie morte après confirmation d'équivalence).

---

## Q5 — Classement central

| Candidat | Classement | Ce qui est perdu / état | Réparation probable |
|---|---|---|---|
| `renderProgramBuilderView` + section backups | **PERTE RÉELLE** (élevée) | Restaurer/Prévisualiser/Supprimer un backup de programme inaccessible | Reporter la section « Versions sauvegardées » dans `renderProgrammeV2` (les fonctions existent) |
| `selectChallengeMetric` (onclick mort) | **PERTE RÉELLE** (moyenne) | Création de défi entre amis cassée à l'étape métrique | Implémenter le handler (relier le picker à `createChallenge`) |
| `loadFromCloud`/`syncSupabase`/`saveSessionToSupabase`/`purgeVeryOldLogs`/`renderActiveWorkout`/`computeE1RMTrend`/`wpGetExerciseMeta`/`_getFriendLogs`/`getMuscleStyle` | À TRANCHER (inerte) | Fonctions anticipées mais absentes (no-op) | Soit retirer le garde mort, soit (ré)implémenter si la feature est voulue (ex. purge logs, offline replay) |
| `renderCoachReports` | ABANDON | Remplacée par `renderCoachHistory()` | Supprimer le stub |
| `renderTodayProgram`,`renderWeeklySummary`,`renderProgramIdentityCard`,`renderCoachDayDetail` | ABANDON probable | Recouvertes par les vues v2 (à confirmer) | Supprimer après confirmation visuelle |
| 78 helpers/formules non référencés (Q1.b long tail) | ABANDON / code mort | Aucun (jamais branchés) | Nettoyage progressif |
| `upsertReport`/`saveAlgoDebrief`/`getLeaderboardPeriodKey` (doublons) | À DÉDUPLIQUER | Copie morte masquée | Supprimer la copie perdante après vérif d'équivalence |
| `renderWpExercise`, `setsInRange`, `getCardioStyle`, locals, exercises.js fns | FAUX POSITIF | — | Ne rien faire |
| `syncHealthConnectData` | DORMANT | Feature non finie derrière flag | Laisser / finir plus tard |

---

## Q6 — Priorisation des réparations

1. **🔴 Restauration des backups de programme** (PERTE élevée) — l'utilisateur a 15 sauvegardes et **ne peut plus les restaurer**. Réparation peu risquée : réinjecter la section « Versions sauvegardées » (liste + 3 boutons, code déjà existant) dans la vue live `renderProgrammeV2`. **Lot 1.**
2. **🟠 Création de défi entre amis** (PERTE moyenne) — `selectChallengeMetric` manquant ; relier `showChallengePicker` → `createChallenge`. **Lot 2.**
3. **🟡 Références inertes utiles** — décider au cas par cas : `purgeVeryOldLogs` (poids du blob, lié au chantier sync), `saveSessionToSupabase` (rejeu offline) méritent un vrai branchement ou un retrait ; les `loadFromCloud`/`syncSupabase` sont d'anciens noms à supprimer. **Lot 3.**
4. **⚪ Hygiène** — dédup des 3 doublons (Q4) ; suppression des vues/handlers morts (Q1.b) après confirmation que les vues v2 couvrent tout. **Lot 4 (non urgent).**

---

## Conclusion

- **Pertes réelles accessibles : 2** — backups de programme (élevée) et défis entre amis (moyenne).
- **Cause principale isolée** : la bascule **v237** (`renderProgramBuilder` → `renderProgrammeV2` avec `return`) a abandonné la section backups sans la reporter. Ce n'est PAS un phénomène massif : aucune autre vue v2 ne s'est révélée amputer une section accessible (les autres orphelins `render*` sont des abandons propres).
- **Le reste** est de la dette : ~84 fonctions mortes, ~9 références inertes, 3 doublons. Impact utilisateur nul, mais à nettoyer pour éviter de futurs « boutons morts ».
- **Garde-fou recommandé** (hors scope) : ces pertes étaient invisibles aux tests unitaires (qui appellent les fonctions directement) ; seul un test de **navigation** (Playwright : ouvrir l'écran, vérifier que la section/bouton est présent ET que son handler existe) les aurait attrapées. À considérer pour les écrans clés.

### Vérifs à confier à Claude (chat) / produit
- Confirmer visuellement que `renderProgrammeV2` n'affiche réellement aucune entrée backups (cohérent avec le code).
- Décider du sort des références inertes orientées-données : `purgeVeryOldLogs` (allègement blob), `saveSessionToSupabase` (offline queue) — features voulues ou à retirer ?
- Valider que la copie `app.js` est bien l'intentionnelle pour `saveAlgoDebrief` / `upsertReport` / `getLeaderboardPeriodKey` avant dédup.

*Fin du diagnostic. Aucune modification de code. Réparations cadrées en lots (1 = backups, 2 = défis).*
