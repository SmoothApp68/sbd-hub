# SYNC CLOUD — Diagnostic de finition (Phase 1, lecture seule)

> **Branche** : `main` (lecture seule) · **AUCUN code modifié, AUCUN commit** (ce fichier est un livrable de référence, non commité).
> Sync **stabilisé**, pas cassé. Restant : (A) purge blob, (B) merge cross-device non-destructif, (C) revert `statement_timeout`.
> Rappel : **NE JAMAIS** « ajouter `syncToCloud()` après les saves » (locks gotrue). Le correctif réel = taille blob + hash + merge.

---

## Résumé exécutif — bug réel vs « pas encore propagé »

| Point | Verdict | Sévérité |
|---|---|---|
| A1 — `logs` exclu à l'écriture | ✅ **Correct** (un seul writer, rien ne réintroduit) | — |
| A2 — réhydratation local vide | ✅ **Correct** (couvre cold-start/nouvel appareil) | — |
| A3 — `logs` résiduels dans blobs hérités | 🟡 **Pas un bug** : purge **passive** (au prochain push) ; comptes inactifs gardent l'ancien blob | purge serveur = Claude.ai, **gatée** |
| B5(ii) — sessions cross-device sur local peuplé | 🔴 **BUG RÉEL** : `workout_sessions` n'est PAS réconcilié dans un local non-vide → l'appareil B ne reçoit jamais les nouvelles séances de A | **élevée** (multi-appareils) |
| B4/B5(iii) — tie-breaker merge logs par `timestamp` | 🟠 Réel mais **inerte post-purge** (mord seulement si `cloudData.logs` présent = blobs résiduels) | moyenne (transition) |
| B6 — clés dérivées/transientes dans le payload | 🟠 **Dette** : bloat + conflits potentiels (`keyLifts`, flags device, etc.) | basse |
| C — `statement_timeout` 30s→8s | 🟡 OK à revert (blob léger, requêtes paginées <8s) | action Claude.ai |

---

## A. Purge du blob (logs résiduels)

### A1 — `logs` retiré du payload ✅
- **`_buildSyncedBlob(d, weeklyPlanToSync)`** — `js/supabase.js:279-283` : `Object.assign({}, d, …)` puis **`delete out.logs`** (shallow copy → `d.logs` local intact).
- Utilisé par **`syncToCloud`** — `js/supabase.js:309` (`const dataToSync = _buildSyncedBlob(...)`).
- **Unique writer du blob** : `supaClient.from('sbd_profiles').upsert(payload…)` — `js/supabase.js:311` (grep `from('sbd_profiles').(upsert|update|insert)` = **1 seul hit**). → **rien ne réintroduit `logs`** : ni autre save, ni migration. Le merge (B) repeuple `db.logs` en mémoire/localStorage mais ne réécrit JAMAIS le blob (seul `syncToCloud`→`_buildSyncedBlob` l'écrit). ✅

### A2 — réhydratation depuis `workout_sessions` ✅
- **`hydrateLogsFromCloud(userIdArg)`** — `js/supabase.js:522-558` : si `_shouldHydrateLogs(db.logs)` (`:515`, local vide) → paginate `workout_sessions.select('data')` par batches de 200 (`:535-547`) → `_logsFromSessionRows` (`:503`, tri `timestamp` desc) → `db.logs`, `saveDBNow`, `recalcBestPR`, `refreshUI`.
- **Chemins d'init couverts** :
  - `syncFromCloud` après merge si local vide — `js/supabase.js:645-647` ;
  - boot / `cloudSignIn` : `db.logs.length === 0` → `syncFromCloud` — `js/app.js:14756` (+ chemin `cloudTs>db.lastSync+5000` `:14783`) ;
  - refocus : `visibilitychange` → `syncFromCloud` — `js/supabase.js:32`.
  → cold start, nouvel appareil, cache SW vidé passent tous par `syncFromCloud`, qui hydrate si vide. ✅
- **Garde** : `_shouldHydrateLogs` n'hydrate JAMAIS un local peuplé (`:524`) → pas d'écrasement.

### A3 — purge d'une clé `logs` héritée : **passive, pas serveur**
- **Aucun code ne supprime `logs` d'un blob distant à la lecture.** `syncFromCloud` lit `cloudData` (avec `logs` résiduels), merge, et c'est le **prochain `syncToCloud`** qui réécrit un blob sans `logs` (`_buildSyncedBlob`). → purge **WRITE-time**.
- Conséquence (cohérent avec les chiffres base) : aurel_br re-synchronisé = blob purgé (43.9 kB) ; Jordan/Léa/430d **inactifs** = blob lourd hérité tant qu'ils ne re-synchronisent pas. → **« pas encore propagé », pas un bug.**
- **⚠️ Condition critique pour une purge serveur (Claude.ai)** : Jordan (dernier sync **4 mai**) peut **précéder le dual-write P3-b** → ses 144 logs ne sont peut-être **pas** dans `workout_sessions`. Purger `data - 'logs'` à l'aveugle **perdrait l'historique**. → la purge serveur doit être **gatée par compte** : vérifier que `workout_sessions` couvre 100 % des `id` du blob ; si incomplet, **backfill depuis le blob d'abord**, puis purge.

---

## B. Merge cross-device

### B4 — algorithme réel de fusion (`syncFromCloud`, `js/supabase.js:560-662`)
1. **Dédup push** : `_computeDataHash(db)` (`:237-274`, signe `logs.length`, `logs[0].timestamp`, **`maxLogEditedAt`**, compteurs, longueurs JSON de `user`/`weeklyPlan`/`bestPR`, `lastModified`). Si `db._lastSyncHash === _hash` → skip push (`:293`).
2. **Gate pull** : `cloudTs <= lastPush` (`_lastCloudPush`) → local autoritaire, re-push, return (`:575-580`). Le merge ne tourne que si `cloudTs > lastPush`.
   - ✅ `keepAlive` écrit dans **`heartbeats`** (`js/supabase.js` keepAlive), **plus** dans `sbd_profiles.updated_at` → `updated_at` ne bouge que sur un vrai push → **la vanne n'est plus faussement armée** (correctif Lot 1 confirmé).
3. **Merge logs** (`:597-612`) : union par `id`. Cloud chargé d'abord, **local n'écrase que si `log.timestamp > cloud.timestamp`** (`:603`). **Tie-breaker = `timestamp` de séance, PAS `editedAt`.** Logs sans `id` concaténés (`:607`).
4. **Reste du blob** (`:613-616`) : `_mergedData = Object.assign({}, cloudData)` → **tout vient du cloud**, puis on ne ré-applique du local que `logs` (`:614`), `exercises` (`db.exercises || cloud`, `:615`), `bestPR` (`db.bestPR || cloud`, `:616`).

### B5 — pires cas concrets
- **(i) Un appareil ancien réécrit-il `logs` dans le blob ?** **NON.** Tous les appareils exécutent `_buildSyncedBlob` → tout push **retire** `logs`. Les `logs` résiduels (Jordan/Léa) sont des **restes pré-P3-c**, jamais re-poussés. Au prochain sync de ces comptes, `syncToCloud` les strip. ✅
- **(ii) 🔴 BUG RÉEL — sessions cross-device sur local peuplé.** Depuis que `logs` a quitté le blob, la propagation des séances passe par `workout_sessions`. Or **`workout_sessions` n'est lu QUE par `hydrateLogsFromCloud` (local vide)** — grep confirme **aucune** réconciliation `workout_sessions`→`db.logs` sur un local **peuplé**. Scénario : A termine la séance s1 (→ local + `workout_sessions` + push blob sans logs). B (local peuplé) pull → `cloudData.logs` absent → `_mergedLogs` = logs **locaux de B** (s1 absent) → **B ne reçoit jamais s1** (l'hydratation ne se déclenche pas, local non vide). B ne récupère s1 que si son local est **vidé** (réhydratation complète). → **la sync incrémentale multi-appareils des séances est cassée** post-P3-c. (Déjà signalé comme risque dans `audit/P3c-rapport.md`.)
- **(iii) Tie-breaker lossy (`:603`).** Quand `cloudData.logs` est **présent** (blobs résiduels, transition) : une **édition locale non poussée** (même `id`, `timestamp` égal/tronqué) peut être écrasée par la version cloud périmée (le merge garde le cloud à égalité). **Post-purge** (`cloudData.logs` absent) → `_cloudLogsArr=[]` → inerte. Le `maxLogEditedAt` du hash force bien le **push** d'une édition, mais le **merge** ne s'en sert pas. → résiduel transitoire.
- **(iv) Reste de `db` pris du cloud (`:613`).** Une modif locale **non poussée** d'une clé non-logs (réglages `user`, `weeklyPlan`, `gamification`, `social`…) est **écrasée** par le cloud au merge. Pré-existant (hors P3-c).

### B6 — clés dérivées/transientes encore dans le payload
`_buildSyncedBlob` **spread `...d`** (tout `db`) sauf `logs` ; `_weeklyPlanToSync` retire `mesoWeeks` + `_volumeSuggestions(/Date)` + `_discoveryInsights` (`:299-308`). ✅ `mesoWeeks` exclu.
**Restent synchronisées (dérivées ou device-local)** — bloat + sources de conflit potentielles :
- **Dérivées (recalculables depuis logs)** : `keyLifts`, `weeklyPlan.days` (pour custom : régénérable depuis template+PR), `exercises`/`bestPR` (e1RM/PR recalculables — déjà mergées spécialement).
- **État device-local qui n'a rien à faire dans le blob** : `_lastSyncHash`, `lastSync`, `_cloudUpdatedAt`, `_workoutSessionsSynced`, `pendingSync`, `activeWorkout` (séance en cours), `_lastDailyHighlight`, `_ghostLogAnswered`… → synchroniser ces flags d'un appareil à l'autre = bruit/incohérence.

---

## C. statement_timeout

- **Aucune référence dans le repo** (grep `statement_timeout` = 0 ; les « 30s » trouvés sont sans rapport : cooldown `coach-ai`, throttle social). → le bump 30s a été fait **côté Supabase uniquement** ; le revert 30s→8s est une **action Claude.ai**.
- **Aucune requête de sync légitime ne dépasse 8s une fois le blob allégé** : upsert blob ~44–150 kB (vs 815 kB qui causait `57014`) → rapide ; `workout_sessions` toujours **paginé** (hydrate batches de 200, dual-write batches de 50, `select session_id` simple). Chaque requête reste largement <8s. → **8s est sûr** après purge des blobs lourds résiduels.

---

## Correctifs Phase 3 candidats (NON codés — pour validation)

1. **🔴 Réconcilier `workout_sessions` dans un local peuplé au pull** (cœur du « merge non-destructif ») : dans `syncFromCloud`, en plus de l'hydratation local-vide, charger les `session_id`(+`editedAt`/hash) de `workout_sessions` et **fusionner** dans `db.logs` (union additive des séances manquantes + version la plus récemment **éditée** ; tombstones pour les suppressions). → répare la sync incrémentale multi-appareils.
2. **🟠 Tie-breaker par horloge d'édition** : remplacer `log.timestamp > cloud.timestamp` (`:603`) par `editClock(log) > editClock(cloud)` (`editedAt || timestamp`) pour la fenêtre de transition (blobs résiduels) et la future réconciliation `workout_sessions`.
3. **🟠 Cesser de synchroniser les clés dérivées/transientes** dans `_buildSyncedBlob` : retirer `keyLifts` + les flags device-local (`_lastSyncHash`, `lastSync`, `_cloudUpdatedAt`, `_workoutSessionsSynced`, `pendingSync`, `activeWorkout`, …) → blob plus léger, moins de conflits.
4. **(optionnel, basse prio)** merge non-destructif du **reste de `db`** (clés non-logs) — fusion par clé/horloge au lieu de « cloud écrase ».

> ⚠️ Aucune de ces pistes n'implique d'ajouter `syncToCloud()` après les saves.

## Actions Supabase à router vers Claude.ai

1. **Purge serveur ciblée des `logs` résiduels** (Jordan `0f1a…`, `430d…`, Léa `9ed8…`) — **GATÉE PAR COMPTE** :
   - pour chaque compte : vérifier que `workout_sessions` contient **tous** les `id` de `data->'logs'` ;
   - si couverture 100 % → `UPDATE sbd_profiles SET data = data - 'logs'` ;
   - **si couverture incomplète** (compte antérieur au dual-write, ex. Jordan 4 mai) → **backfill** `workout_sessions` depuis les `logs` du blob **d'abord**, PUIS purge. **Ne jamais purger à l'aveugle.**
2. **Revert `statement_timeout` 30s → 8s** du rôle `authenticated` — **après** confirmation que les blobs lourds résiduels sont purgés et qu'aucune requête de sync ne dépasse 8s.

---

*Fin de la Phase 1. Aucun code modifié, aucun commit. En attente de validation Aurélien sur la cause/approche avant Phase 3.*
