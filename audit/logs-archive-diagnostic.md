# Archivage des logs — Phase 1 : DIAGNOSTIC (lecture seule)

> **Statut** : diagnostic uniquement. Aucune modification de code, aucune migration, aucune écriture Supabase n'a été faite dans cette phase.
> **Périmètre Claude Code** : lecture du repo. Toutes les actions Supabase sont déléguées à Claude (chat) — voir §7.
> **Date** : 2026-06-16 · **Repo** : `SmoothApp68/sbd-hub`

---

## 0. Résumé exécutif (à lire avant tout)

**Le poids mort à éliminer est dans le BLOB Supabase (`sbd_profiles.data->'logs'`), PAS dans le localStorage.**

`db.logs` (2,45 Mo, 532 sessions) vit aujourd'hui à **deux endroits** :
1. **localStorage** (`SBD_HUB_V29`, via `JSON.stringify(db)`) — source de lecture locale de toute l'app.
2. **Le blob `sbd_profiles.data`** — uploadé en entier à chaque `syncToCloud()` → cause du timeout 57014.

Les ~210 lecteurs de `db.logs` dans le code lisent le **tableau local**, pas le blob. Donc **si on garde `db.logs` complet en localStorage et qu'on retire seulement `logs` du blob synchronisé, la quasi-totalité des lecteurs reste inchangée.** La table `workout_sessions` (532 lignes, déjà fidèle) devient la source de vérité cloud pour réhydrater `db.logs` sur un nouvel appareil.

**Conséquence stratégique majeure** : le débat « cache des récents vs historique complet » est tranché par les algos. Les deux passes d'analyse (engine.js + app.js) convergent : le coaching a besoin de **l'historique complet** (ACWR 28 j, détection de plateau all-time, LP, deload, `recalcBestPR`, `getAllBestE1RMs`, badges comptant toutes les séances, heatmap 52 semaines, navigation hebdo de l'onglet Séances all-time). Un « cache des 30-60 derniers jours » casserait massivement. **Stratégie recommandée Phase 3 : garder `db.logs` complet en localStorage, le retirer uniquement du blob synchronisé, réhydrater depuis `workout_sessions` quand le local est vide.** La surface de changement se réduit alors à la **couche de sync** (3-4 points) + **1 lecture cross-user** (détail séance d'un ami).

La vraie surface de risque Phase 3 n'est donc PAS les 210 lecteurs locaux, mais :
- `syncToCloud` (retirer `logs` du payload) ;
- `syncFromCloud` (le blob n'a plus `logs` → la fusion casse → réhydrater depuis `workout_sessions`) ;
- `loadFeedSessionDetail` (lit les logs **d'un ami** dans SON blob → doit passer à `workout_sessions`) ;
- la propagation des **éditions/suppressions** vers `workout_sessions` (aujourd'hui absente — voir §3 et §6).

---

## Q1 — Inventaire des lecteurs de `db.logs`

`db.logs` est référencé ~213× dans `app.js`, 37× dans `engine.js`, 25× dans `supabase.js`, 16× dans `import.js`, 6× dans `coach.js`, 0× direct dans `program.js` (param uniquement). Il n'existe **pas** de `js/stats.js` ni `js/social.js` : ces fonctions sont dans `app.js`. Le helper central est :

```
app.js:1578  getLogsInRange(days) { const lim = Date.now()-days*86400000; return db.logs.filter(...) }
```
Très utilisé par engine.js/coach.js pour borner une fenêtre récente (7/14/28/30 j).

### 1.a — Stats / graphiques (lecture locale, fenêtre variable)
| Fichier:ligne | Fonction | Pattern | Note |
|---|---|---|---|
| app.js:1204 | `exportDataCSV` | FULL_ITERATION | export CSV all-time |
| app.js:3648 / 3665 / 3679 | `_computeBadgeStats` | FULL + slice(-20) + filter semaine | 1 passe stats badges |
| app.js:8509 / 8809 | `renderSBDProgressionChart` | SORT chrono | courbe SBD all-time |
| app.js:8714 / 8915-16 | `renderMuscleFatigueHeatmap` | FULL_ITERATION + passe à `computeMuscleFatigue`/`computeWeeklyVolume` | |
| app.js:9027-9068 | `calcFormScore`/form | filter 7 j + SORT desc | |
| app.js:9147 | `renderPerformanceChart` | FULL_ITERATION | best e1RM all-time |
| app.js:9269 | `renderProgressionCurve` | SORT + FULL | |
| app.js:9835 / 9891 | cardio time-series | SORT + slice(-10/-30) | |
| app.js:14974 / 15027 | caloric / `renderCardioVolumeCard` | filter 7 j | |
| app.js:15183 / 15273 / 15289 / 15307 | volume landmarks / strength / cardio list | FULL + `computeWeeklyVolume` | |
| app.js:15407-15540 | `calcFormScore` | SORT + filter 28 j | |
| app.js:16311 | `getWeeklyMuscleVolume` | FULL_ITERATION | |
| app.js:18055 | `renderCardioReportDisplay` | filter 7 j | |
| app.js:19825 | `getPersonalProgressionRate` | SORT desc, all-time | **historique complet** |

### 1.b — Progression / e1RM / PR (historique complet majoritaire)
| Fichier:ligne | Fonction | Pattern | Note |
|---|---|---|---|
| app.js:1569 | `recalcBestPR` | FULL_ITERATION | recalcule PR SBD all-time |
| app.js:4423 | `getAllBestE1RMs` | FULL_ITERATION | best maxRM par exo all-time |
| app.js:4856 | `calcAndStoreLiftRanks` | FULL_ITERATION | |
| app.js:6550 / 6686 / 6723 | best avant semaine/mois | FULL_ITERATION | |
| app.js:9675 | `buildRMTable` | FULL_ITERATION | rep records all-time |
| app.js:14456-14459 | normalisation IDs + recalc maxRM | FULL_ITERATION | au chargement |
| app.js:16119 / 16127 | `copySessionToGo` / `shareSessionToFeed` | FIND_BY_ID | |
| app.js:17798-17893 | renommage/suppression exo | FULL_ITERATION (mute les exercises *dans* chaque log) | |
| app.js:19669-19721 | `generateSessionDebrief` | filter + SORT | dernière séance similaire |
| app.js:29176-29336 | photos séance (×5) | FIND_BY_ID | |
| app.js:29600 | `seSubmitSession` | FIND_BY_ID + remplace en place | **éditeur** |
| app.js:31405 | `checkAndShowPRCelebration` | filter (tous sauf la séance) | |
| import.js:833 / 846 | `getPrevRepRecord` / `getPrevMaxReps` | FULL avant timestamp | |
| import.js:517 | `detectAnomalies` | FULL_ITERATION | |

### 1.c — Algo coaching (CRITIQUE — besoin historique vs récent)
| Fichier:ligne | Fonction | Fenêtre | Historique complet ? |
|---|---|---|---|
| app.js:18285 | `detectSaisiePlateau` | 15 dernières, SORT desc | **OUI** (parcourt tout pour trier) |
| app.js:18935 | alerte coach « Instinct » | filter 30 j | NON |
| app.js:18997 | passe `shouldDeload(db.logs, mode)` | all → fenêtre interne | **OUI** (passé entier) |
| app.js:19053 | passe `analyzeMuscleBalance(db.logs,14)` | 14 j interne | NON |
| app.js:21738 | `hadGrindLastSession` | 3 dernières | NON |
| app.js:21759 | `isE1RMStabilized` | 10 dernières | NON |
| app.js:22081 / 22142 | `wpComputeWorkWeight` → `checkLPEnd(db.logs)` | all-time | **OUI** |
| app.js:22299 | `wpDetectPlateau` (`var logs=db.logs`) | all-time | **OUI** |
| app.js:22518 | `detectLastDeload` | all-time (length≥6) | **OUI** |
| app.js:24150 | `calcInsolvencyIndex(db.logs)` | all-time | **OUI** |
| app.js:24296 | alerte charge axiale | filter récent + SORT | NON |
| app.js:24714 | `computeFatigueScore(db.logs)` | ~28 j interne | NON (mais reçoit tout) |
| app.js:25461 | `applyVolumeAutoTune(db.logs)` | interne | NON |
| engine.js:1346 / 1375 / 1601 | `detectPlateau` / `analyzePlateauCauses` / `getMaxRMBeforeDate` | all-time | **OUI** |
| engine.js:1635-1641 | `computeACWR` | aigu 7 j + chronique 28 j | **OUI** (28 j glissant) |
| engine.js:2522-2628 | `shouldDeload` | fenêtres 14 j + SORT all | **OUI** |
| engine.js:2675 / 2744 / 2849 | `calcTRIMPForce` / chronique / hebdo | 7 j / 28 j | **OUI** (chronique 28 j) |
| engine.js:2044 | `calcMuscleGroupTonnage21d` | 21 j | borné mais via db.logs |
| coach.js:69-707 | `coachGetFullAnalysis` | passe `db.logs` à fatigue/deload/balance/TRIMP | **OUI** (délègue aux engines) |
| program.js:138-224 | `analyzeMuscleBalance`/`isFatigued`/`computeFatigueScore` | **paramètre `logs`** (0 accès direct db.logs) | dépend de l'appelant |

> **Verdict §1.c** : les algos qui parcourent tout l'historique (`computeACWR` 28 j, `detectPlateau`, `checkLPEnd`, `calcChronicTRIMPForce`, `recalcBestPR`, `getPersonalProgressionRate`, `calcInsolvencyIndex`) **interdisent un cache « récents seulement »**. → confirme la stratégie « garder `db.logs` complet en local ».

### 1.d — Feed social (dont lectures cross-user via Supabase)
| Fichier:ligne | Fonction | Pattern | Note |
|---|---|---|---|
| supabase.js:2400 | `loadFeedSessionDetail` | `db.logs.find(id)` | **MES** séances → local, OK |
| **supabase.js:2412** | `loadFeedSessionDetail` | `profile.data.logs.find(id)` | ⚠️ **Séances d'un AMI lues dans SON blob `sbd_profiles.data.logs`** |
| supabase.js:2457 | `migrateActivityFeed` | slice(0,30) trié desc | re-poste 30 dernières |
| app.js:16127 | `shareSessionToFeed` | FIND_BY_ID | publie un post |

> **⚠️ Point dur unique** : `supabase.js:2412` est le **seul lecteur qui dépend du blob d'un autre utilisateur**. Une fois `logs` retiré du blob, le détail des séances d'un ami ne sera plus lisible → Phase 3 doit le rediriger vers `workout_sessions` (`select data where user_id = ami and session_id = …`). RLS de `workout_sessions` à vérifier côté Claude chat (voir §7).

### 1.e — Leaderboard
| Fichier:ligne | Fonction | Pattern |
|---|---|---|
| supabase.js:2694 | `updateLeaderboardSnapshot` | `db.logs.forEach` (best maxRM key lifts) |
| supabase.js:3504 / 3509 | comparaison amis | `db.logs.forEach` + `slice(0,30)` |
| app.js:4104 | `calcLeaderboardMetrics` | `db.logs || []` |

Lectures **locales** uniquement → inchangées.

### 1.f — Historique / onglet Séances (rendu) — voir Q4
| Fichier:ligne | Fonction | Pattern |
|---|---|---|
| app.js:15842 | `renderSeancesTab` | filter fenêtre semaine |
| app.js:15864 | idem | filter `[targetWeekStart, targetWeekEnd]` |
| app.js:15907 | idem | `db.logs.slice().sort()` → **passe complète all-time** (best e1RM avant chaque séance) |
| app.js:8593 | `renderStatsHistory` | FULL_ITERATION |
| app.js:10805 | `renderWeekCalendar` | FULL_ITERATION (jours loggés) |

### 1.g — Compression / archivage
| Fichier:ligne | Fonction | Pattern | Note |
|---|---|---|---|
| supabase.js:4192 | `compressOldLogs` | `db.logs.forEach`, mute en place | séances > 6 mois : ne garde que le best set (lossy). 419 déjà `_compressed`. Ancienne mitigation du poids du blob. |
| supabase.js:4250 | `renderStorageGauge` | `db.logs.length` | jauge stockage |

> Aucune table `sessions_archive` dans le code (grep négatif). La seule table dédiée est `workout_sessions`.

### 1.h — Import Hevy (lecture) — voir Q2
| Fichier:ligne | Fonction | Pattern |
|---|---|---|
| import.js:298-299 | `importHevyCSV` | `db.logs.some()` détection doublon (date+titre) |
| import.js:1051 | `saveAlgoDebrief` | filter < timestamp courant + SORT (baseline e1RM) |
| import.js:1640 | `generateMonthlyReport` | filter plage mois |
| import.js:1742 | `migrateExerciseNames` | FULL_ITERATION renommage canonique |
| app.js:10528 | `getExistingRecordsForExercise` | FULL_ITERATION rep records |

---

## Q2 — Écrivains de `db.logs`

| Fichier:ligne | Fonction | Opération | Déclencheur |
|---|---|---|---|
| **app.js:31028** | `goFinishWorkout` | `db.logs.push(session)` | **fin de séance GO** (chemin principal) |
| app.js:30750 | `convertWorkoutToSession` | construit l'objet `session` (pas d'écriture db.logs) | appelé par goFinishWorkout |
| app.js:10494 + 10497 | `_doImportCSV` | `db.logs.push(...)` puis `db.logs.sort(desc)` | import CSV (chemin app.js) |
| import.js:762-763 | `executeImport` | `db.logs.unshift(session)` puis `db.logs.sort(desc)` | import Hevy (chemin import.js) |
| import.js:303 / 312 | `importHevyCSV` | `db.logs = db.logs.filter(...)` (dé-doublonnage) / rollback `db.logs = _backupLogs` | import Hevy |
| app.js:16150 | `deleteSessionFromList` | `db.logs = db.logs.filter(id≠)` | suppression depuis l'onglet Séances |
| app.js:29531 | `seDeleteSession` | `db.logs = db.logs.filter(id≠)` | suppression depuis l'éditeur |
| import.js:1007 | `deleteLog` | `db.logs = db.logs.filter(id≠)` | suppression depuis l'écran import |
| app.js:29600 | `seSubmitSession` | `db.logs[findIndex] = …` | **édition** d'une séance |
| app.js:10066 | `cleanupExistingLogs` | mute exercises dans chaque log | nettoyage exos blacklistés |

> ⚠️ **Deux chemins d'import distincts** (`app.js:_doImportCSV` et `import.js:executeImport`) écrivent tous deux dans `db.logs`. Phase 3 devra les couvrir tous les deux (ou identifier le mort). **À vérifier en Phase 3 lequel est réellement câblé.**
>
> ⚠️ **Pour la Phase 3** : ces points (création, import, édition, suppression) devront aussi se refléter dans `workout_sessions`. Aujourd'hui seule la **création** s'y reflète (via le dual-write append-only, §3) ; **éditions et suppressions ne sont PAS propagées** → voir §6.

---

## Q3 — Synchronisation actuelle blob ↔ `workout_sessions`

### Code existant ciblant `workout_sessions` (grep `workout_sessions` = 2 sites, tous dans supabase.js)
- **`syncLogsToSupabase()` — supabase.js:313-370** — **branché et actif**. Dual-write *append-only* :
  - lit les `session_id` déjà présents côté cloud (supabase.js:320-324) ;
  - n'insère que les logs locaux dont l'`id` n'est pas déjà en base (supabase.js:326-340), par batches de 50 (`upsert onConflict: user_id,session_id`, supabase.js:353-357) ;
  - pose `db._workoutSessionsSynced = true` **seulement si tous les batches réussissent** (supabase.js:363-366).
- **Appelée uniquement depuis `syncToCloud()` — supabase.js:301**, en *fire-and-forget* (`.catch(...)`), **après** l'upsert du blob (supabase.js:289).

### Migration initiale
- **Aucune fonction one-shot dédiée dans le repo** (grep `migrate*WorkoutSessions` / `backfill` / `sessions_archive` négatif). Le **backfill = `syncLogsToSupabase` elle-même** : elle insère *tous* les logs locaux absents du cloud. Les 532 lignes ont donc été peuplées soit par cette fonction (en tournant une fois), soit par Claude chat en SQL. **Elle est re-déclenchable** simplement en appelant `syncToCloud()`.

### Point critique : une nouvelle séance va-t-elle dans `workout_sessions` ?
**Oui, mais conditionnellement.** Chaîne : `goFinishWorkout` (push local + `saveDBNow`) → plus tard `syncToCloud` → `upsert(blob)` (supabase.js:289) → **si succès** → `syncLogsToSupabase` (supabase.js:301) insère la nouvelle séance.

- ⚠️ **Dépendance au blob** : `syncLogsToSupabase` est appelée **après** l'upsert du blob. Avant le fix du timeout, l'upsert du blob jetait (57014) → on partait dans le `catch` (supabase.js:302) → **`syncLogsToSupabase` ne tournait jamais** → la table divergeait. Avec `logs` retiré du blob (Phase 3), le blob redevient petit/rapide → le dual-write tournera de façon fiable. ✅ (effet de bord positif de la Phase 3.)
- ⚠️ **Éditions/suppressions non propagées** : `syncLogsToSupabase` n'insère **que des `id` nouveaux** ; elle ne met jamais à jour ni ne supprime de ligne. Donc une séance **éditée** localement (`seSubmitSession`) ou **supprimée** (`deleteSessionFromList`/`seDeleteSession`/`deleteLog`) **reste inchangée/présente** dans `workout_sessions`. Conséquence Phase 3 : après réhydratation depuis `workout_sessions`, **les séances supprimées ressusciteraient** et les éditions seraient perdues. → action Phase 3 (voir §6 et §7).

---

## Q4 — Pagination de l'historique (onglet Séances)

**`renderSeancesTab()` — app.js:15842-15927.** Modèle = **navigation hebdomadaire**, pas pagination par nombre.

- Filtre `db.logs` sur une fenêtre d'une semaine via `currentWeekOffset` (app.js:15864) :
  ```js
  var allWeekSessions = db.logs.filter(l => l.timestamp >= targetWeekStart && l.timestamp <= targetWeekEnd).sort(...)
  ```
- Rend **toutes** les séances de cette semaine (pas de `slice(0,N)`, app.js:15920-15924), via `renderSessionCard2`.
- **MAIS** fait en plus une **passe chronologique sur TOUT `db.logs`** (app.js:15907 `db.logs.slice().sort()`) pour précalculer le meilleur e1RM *avant* chaque séance (`_prevBestByTs`, badge PR par carte).

> **Implication Phase 3** : la navigation peut remonter à n'importe quelle semaine du passé → nécessite l'historique complet en local. La passe `15907` confirme que l'onglet lit tout l'historique à chaque rendu. **Point d'accroche pour un chargement à la demande** : si Phase 3 voulait *ne pas* tout garder en local, c'est ici (et dans la précompute e1RM) qu'il faudrait charger les semaines anciennes depuis `workout_sessions`. Vu §1.c, ce n'est **pas recommandé** : garder `db.logs` complet en local évite de toucher `renderSeancesTab`.

---

## Q5 — Chaîne de sync et allègement du blob

### `_computeDataHash(d)` — supabase.js:237-261
Signe (entre autres) `(d.logs||[]).length` + `d.logs[0].timestamp` (supabase.js:247-248). Calculé sur le **`db` local** (pas le payload). → Retirer `logs` du *payload* ne casse PAS la détection de changement : tant que `db.logs` local existe, l'ajout d'une séance change le hash et déclenche la sync. ✅
> Note §6 : le hash **ignore** plusieurs clés (`garminHealth`, `gamification` complet, `body`, `reports`, `social`, `keyLifts`) — dette pré-existante, hors scope.

### `syncToCloud(silent)` — supabase.js:263-307 (point d'allègement)
- supabase.js:287 : `const dataToSync = { ...db, gamification:…, weeklyPlan:_weeklyPlanToSync };` → **inclut `logs` en entier**.
- supabase.js:289 : `upsert(payload)` sur `sbd_profiles` → **c'est l'écriture qui dépasse le timeout**.
- **👉 POINT UNIQUE D'ALLÈGEMENT (Phase 3)** : construire `dataToSync` **sans la clé `logs`** (`delete dataToSync.logs;` ou via destructuring `const {logs, ...rest} = db`). C'est *le seul* endroit où `logs` entre dans le blob synchronisé. Garder l'appel `syncLogsToSupabase()` (supabase.js:301) pour le dual-write.

### `syncFromCloud()` — supabase.js:371-474 (point de vigilance majeur)
La fusion (supabase.js:393-433) :
- ancien comportement déjà remplacé : ce n'est **plus** `if (db.logs.length > cloud.logs.length)` mais une **fusion par `id`** (union local+cloud, plus récent par timestamp gagne, supabase.js:404-423) ;
- `_mergedData = Object.assign({}, cloudData); _mergedData.logs = _mergedLogs;` (supabase.js:424-425) → puis `db = _mergedData` (supabase.js:428).

**Comportement si `logs` quitte le blob :**
- `_cloudLogsArr = cloudData.logs` devient **`[]`** (supabase.js:405) → `_mergedLogs` = uniquement les logs **locaux**.
- Sur un **appareil déjà rempli** : `db.logs` local préservé (la fusion garde le local). ✅ mais…
- Sur un **nouvel appareil / cache vidé** : local vide + cloud vide → **`db.logs = []`** → **perte de tout l'historique à l'écran** tant qu'on ne réhydrate pas. ❌
- `_didMergeLogs = _mergedLogs.length > _cloudLogs` (supabase.js:429) sera **vrai dès qu'il y a des logs locaux** (cloud=0) → re-push `syncToCloud` à chaque pull (supabase.js:431-433). Bénin une fois le blob allégé, mais bruyant (toast « séances offline synchronisées »).

> **👉 Action Phase 3 (code)** : dans `syncFromCloud`, si `cloudData.logs` est absent/vide **et** `db.logs` local vide → **réhydrater `db.logs` depuis `workout_sessions`** (`select data … order by timestamp`, mapper `row.data` → log). Il **n'existe aujourd'hui aucune lecture d'hydratation** depuis `workout_sessions` (grep : seuls un `select session_id` de dé-doublonnage et l'`upsert` existent). À écrire. Et neutraliser le faux `_didMergeLogs`/re-push quand le cloud n'a légitimement plus de `logs`.

---

## Q6 — Hors-scope : signalé sans agir

1. **`_computeDataHash` partiel** (supabase.js:237) — ignore `garminHealth`, `gamification` (objet complet), `body`, `reports`, `social`, `keyLifts`. Un changement isolé sur ces clés n'est pas synchronisé. **Confirmé. Autre chantier.**
2. **`saveDB()` ponctuels** — multiples sites `saveDBNow()`/`saveDB()` dispersés (ex. app.js:31041, 10497, 16152, 29532 ; import.js:763, 1007). Cohérence de persistance = autre chantier.
3. **Verrous gotrue concurrents** — non observé directement dans cette passe ; non confirmé ici.
4. **`compressOldLogs` lossy** (supabase.js:4192) — réduit les séances > 6 mois au best set en local. `workout_sessions.data` contient lui le détail complet (`allSets`). Donc une réhydratation depuis `workout_sessions` **ré-augmenterait** les anciennes séances (effet bénéfique mais à connaître). Une fois `logs` hors du blob, `compressOldLogs` perd sa raison d'être (elle visait à réduire le blob). **Signaler, ne pas toucher en Phase 3.**
5. **Deux chemins d'import** (`app.js:_doImportCSV` vs `import.js:executeImport`) — redondance à clarifier (lequel est vivant ?). **Signaler.**
6. **Ordre de `db.logs` non garanti** — `goFinishWorkout` fait `push` (en *fin* de tableau, app.js:31028) **sans tri**, alors que l'import trie desc (app.js:10497, import.js:763) et que de nombreux lecteurs supposent index 0 = plus récent (`db.logs[0]`, `slice(0,30)`). Les lecteurs critiques re-trient localement (renderSeancesTab:15907, etc.), donc pas de bug observé, mais **invariant fragile** : si Phase 3 réhydrate depuis `workout_sessions`, **trier desc par timestamp** à la réhydratation pour rester cohérent. **Signaler.**

---

## (a) Tableau récapitulatif : lecteur → stratégie Phase 3 probable

| Lecteur / zone | Source en Phase 3 | Changement code ? |
|---|---|---|
| Tous les lecteurs locaux de `db.logs` (stats, e1RM/PR, coaching, badges, leaderboard local, calendrier) — §1.a/b/c/e/f/g/h | **Cache local complet** (`db.logs` reste plein en localStorage) | **Inchangé** |
| `renderSeancesTab` (navigation hebdo + passe e1RM all-time) — app.js:15842/15907 | Cache local complet | **Inchangé** |
| Algos historique-complet (`computeACWR`, `detectPlateau`, `checkLPEnd`, `recalcBestPR`, TRIMP chronique…) | Cache local complet | **Inchangé** |
| `syncToCloud` payload — supabase.js:287 | — | **Modifié** : retirer `logs` du blob |
| `syncFromCloud` hydratation — supabase.js:393-433 | **`workout_sessions` à la demande** (si local vide) | **Modifié** : ajouter lecture d'hydratation + tri desc + neutraliser faux re-push |
| `loadFeedSessionDetail` (séance d'un **ami**) — supabase.js:2412 | **`workout_sessions` à la demande** (par `user_id`+`session_id`) | **Modifié** (lecture cross-user) |
| Écrivains création — app.js:31028, import.js:762, app.js:10494 | Local + `workout_sessions` (dual-write existant) | Vérifier déclenchement fiable |
| Écrivains **suppression** — app.js:16150 / 29531 ; import.js:1007 | Doit aussi **supprimer** dans `workout_sessions` | **Modifié** (delete cloud à ajouter) |
| Écrivain **édition** — app.js:29600 (`seSubmitSession`) | Doit **upsert** la ligne `workout_sessions` correspondante | **Modifié** (update cloud à ajouter) |

## (b) Actions Supabase à exécuter par Claude (chat) en Phase 3

1. **Vérifier les RLS de `workout_sessions`** : `SELECT` autorisé pour (i) le propriétaire et (ii) les **amis** (pour `loadFeedSessionDetail` qui lit la séance d'un ami par `user_id`+`session_id`). Aujourd'hui les amis lisaient via `sbd_profiles.data.logs` ; il faut un accès lecture équivalent sur `workout_sessions`, sinon le détail des séances d'amis cassera. Confirmer/ajouter la policy.
2. **Allègement du blob** : une fois le code Phase 3 déployé et la réhydratation validée, **purger `data->'logs'` du blob** pour le user principal (et les autres) — ex. `UPDATE sbd_profiles SET data = data - 'logs' WHERE …` — après avoir confirmé que `workout_sessions` couvre 100 % des `id` (déjà vérifié : 532/532). Vérifier que le blob retombe à ~150 kB.
3. **Re-confirmer la couverture** avant purge : 0 `id` présent dans `data->'logs'` mais absent de `workout_sessions` (déjà mesuré = 0, à re-vérifier juste avant la purge car des séances ont pu être ajoutées entre-temps).
4. **Cohérence éditions/suppressions** : décider du nettoyage des lignes `workout_sessions` orphelines (séances supprimées localement mais encore en base) — soit purge ponctuelle, soit attendre que le code Phase 3 gère les deletes.
5. **Remettre `statement_timeout` du rôle `authenticated` de 30 s → 8 s** une fois le blob allégé et la sync confirmée stable.
6. **Vérifs post-déploiement** : taille du blob, temps de `syncToCloud`, et `get_advisors`/`get_logs` pour confirmer la disparition des erreurs 57014.

---

*Fin du diagnostic Phase 1. Aucune modification de code ni de données n'a été effectuée. Validation par Aurélien attendue avant Phase 3.*
