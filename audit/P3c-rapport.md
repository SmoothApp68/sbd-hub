# ARCHIVAGE LOGS — Phase 3-c : `logs` hors du blob + réhydratation (rapport)

> **Branche** : `feat/logs-out-of-blob` · **Base** : `main` (`5c62323`)
> **But** : retirer `logs` du payload de `syncToCloud` (blob ~815 ko → ~150 ko → fin des `57014`) et savoir réhydrater `db.logs` depuis `workout_sessions` quand le local est vide.
> **Statut** : code + tests verts. Aucune action Supabase (purge/timeout = Claude chat, après vérif réelle).
> **Réfs** : `audit/logs-archive-diagnostic.md`, `audit/P3b-dualwrite-rapport.md`.

---

## Validation croisée (§4) — un risque signalé, NON corrigé (Lot 2)

D'accord avec 3.1/3.2/3.3. **Un risque important à acter** (hors-scope ici, à traiter au Lot 2) :

> **Propagation incrémentale multi-appareils des NOUVELLES séances.** Avant ce lot, une séance créée sur l'appareil A se propageait à l'appareil B via le merge du blob (union par id de `cloudData.logs`). Une fois `logs` retiré du blob, le pull ne réconcilie plus les logs : l'hydratation (3.2) ne s'enclenche que si le **local est vide**. Donc une nouvelle séance créée sur A **n'apparaîtra pas** sur B tant que B a un local peuplé. La table `workout_sessions` contient bien la séance (dual-write), mais le **pull ne la lit pas** sauf hydratation local-vide.

Pourquoi c'est néanmoins un **net progrès** et pas une régression nette : aujourd'hui la sync est **totalement cassée** (le blob time-out en boucle → rien ne se synchronise). Après ce lot : le blob (réglages, gamification…) se synchronise de nouveau, les éditions atteignent `workout_sessions`, et un appareil neuf récupère tout l'historique par hydratation. Le seul manque vs l'idéal est la **réconciliation incrémentale** des logs sur un local déjà peuplé.

**Recommandation Lot 2** : câbler une réconciliation `workout_sessions` ↔ `db.logs` à CHAQUE pull (pas seulement local-vide) — union additive par id + départage par `editClock` (du lot sync) + tombstones pour les suppressions. C'est exactement le « merge non destructif » prévu au Lot 2 ; il referme ce gap.

Autre piège connu **non aggravé** ici (déjà documenté, Lot 2) : le merge prend tout le reste de `db` depuis le cloud (`Object.assign({}, cloudData)` puis ré-applique seulement `logs`/`exercises`/`bestPR`). Non touché.

---

## Changements (`js/supabase.js`)

### 3.1 — `logs` retiré du payload
- Nouvelle fonction **pure** `_buildSyncedBlob(d, weeklyPlanToSync)` : `Object.assign({}, d, {gamification, weeklyPlan})` puis `delete out.logs` (shallow copy → `d.logs` **non muté**). 
- `syncToCloud` : `const dataToSync = _buildSyncedBlob(db, _weeklyPlanToSync);` (remplace le spread `{ ...db, … }`).
- `_computeDataHash` **inchangé** : il signe toujours `maxLogEditedAt` sur `db.logs` (lot 1) → une édition change le hash → `syncToCloud` pousse → `syncLogsToSupabase` (dual-write) écrit l'édition dans `workout_sessions`. Le hash opère sur `db`, pas sur le payload ; retirer `logs` du payload ne le casse pas (test dédié).
- Vérifié : aucun autre endroit ne réinjecte `logs` dans le payload.

### 3.2 — Réhydratation depuis `workout_sessions`
- `hydrateLogsFromCloud(userIdArg)` (async) : ne s'exécute que si `_shouldHydrateLogs(db.logs)` (local vide) ; charge `workout_sessions.data` **paginé par `.range()` (batches de 200)**, reconstruit via `_logsFromSessionRows`, `saveDBNow()`, `recalcBestPR()`, `refreshUI()`.
- Helpers **purs** : `_logsFromSessionRows(rows)` (map `data` + tri `timestamp` desc) et `_shouldHydrateLogs(localLogs)` (vide/absent → true).
- **Choix de pagination** : batches de 200 (3 pages pour 532 lignes). Justification : reste sous la limite par défaut de PostgREST et borne la mémoire/le payload par requête, pour un coût négligeable (hydratation = événement rare, nouvel appareil). On boucle `range(from, from+199)` jusqu'à recevoir < 200 lignes.
- **Garde anti-écrasement** : `_shouldHydrateLogs` empêche d'écraser un local peuplé (le local fait foi — cf. lot 1).
- uid réutilisé (passé par l'appelant) pour éviter un 2ᵉ `auth.getUser()` (verrou gotrue).

### 3.3 — Merge adapté à l'absence de `cloudData.logs`
- Le merge existant gère déjà un `cloudData.logs` absent : `_cloudLogsArr = []` → `_mergedLogs = logs locaux` → **local préservé** (non réécrit). Conservé tel quel (pas de réécriture = Lot 2).
- **Gardé `_didMergeLogs`** : `(cloudData.logs != null) && (_mergedLogs.length > _cloudLogs)`. Sans cette garde, `cloudData.logs` absent rendrait `_didMergeLogs` toujours vrai → re-push (`setTimeout syncToCloud`) + toast « Séances offline synchronisées » **à chaque pull**. La garde neutralise ce bruit une fois les logs hors blob, tout en préservant l'ancien comportement pendant la transition (blob contenant encore les anciens logs).
- **Hydratation branchée dans le pull** : après le merge, si `_shouldHydrateLogs(db.logs)` (local vide), `await hydrateLogsFromCloud(user.id)`. Couvre le boot « nouvel appareil » (`app.js` appelle `syncFromCloud` quand `db.logs.length === 0`).

### SW
Bump `trainhub-v289 → v290` (`service-worker.js` + `js/app.js:267`).

### Hors-scope (signalé, non touché)
Réconciliation incrémentale multi-appareils (Lot 2) ; merge non destructif du reste de `db` (Lot 2) ; purge du blob & `statement_timeout` (Claude chat).

---

## 3.4 — Séquence de sécurité (ordre = protection des données)

**Code d'abord, purge ensuite.** Ce lot **ne touche pas** au `logs` déjà présent dans le blob cloud. Effet du déploiement : les futurs push n'incluent plus `logs`. Comme l'`upsert` **remplace** la colonne `data`, le **premier push réussi** d'un appareil réécrit déjà un blob sans `logs`. La purge explicite par Claude chat (`data - 'logs'`) reste utile pour les profils qui ne pushent pas tout de suite et pour récupérer l'espace immédiatement — mais **uniquement après** vérification réelle de l'hydratation (sinon un appareil neuf qui se réinstalle entre purge et déploiement pourrait perdre l'accès à l'historique). Ordre : **déployer ce code → vérifier hydratation en réel → purger → remettre timeout 8 s**.

---

## Tests

`tests/unit/logs-out-of-blob.test.js` — fonctions pures vm-extraites :
- **`payload_sans_logs`** : `_buildSyncedBlob` n'a pas la clé `logs` ; reste de `db` préservé ; ne mute pas `db.logs` ; gamification par défaut.
- **`_computeDataHash`** reste sensible à une édition (logs hors blob ne casse pas le déclenchement du push).
- **`_logsFromSessionRows`** : tri desc, ignore lignes sans `data`, vide/undefined → [], complétude 532.
- **`_shouldHydrateLogs`** : `pas_hydratation_si_local_peuple` (non vide → false) ; vide/absent → true.

```
Test Suites: 9 passed, 9 total
Tests:       175 passed, 175 total   (165 existants + 10 nouveaux)
```
`node -c` OK sur `supabase.js`, `app.js`, `service-worker.js`. SW v289 → v290.

---

## Vérifs réelles + actions à confier à Claude (chat)

**Après déploiement de ce code (avant toute purge) :**
1. **Blob allégé** : déclencher un push (ex. une édition) et vérifier que `sbd_profiles.data` poussé **ne contient plus `logs`** (taille effondrée ~150 ko).
2. **Fin des `57014`** : confirmer dans les logs que le push du blob et les check-in/éditions **passent enfin** (plus de `canceling statement due to statement timeout`).
3. **Réhydratation** : sur un appareil de test, **vider le localStorage** (local vide) puis recharger connecté → `db.logs` doit se recharger depuis `workout_sessions` (532), trié, et l'onglet Séances s'afficher.
4. **Édition survit** : renommer une séance, laisser syncer, vérifier le nouveau titre dans `workout_sessions` (via dual-write), puis re-pull → titre conservé.

**Ensuite seulement (Claude chat) :**
5. **Purger** `data->'logs'` du blob (`UPDATE sbd_profiles SET data = data - 'logs' WHERE …`) après re-confirmation de la couverture (532/532 dans `workout_sessions`).
6. **Remettre** le `statement_timeout` du rôle `authenticated` de 30 s → **8 s**.

> ⚠️ Rappel du risque Lot 2 (cf. §Validation croisée) : tant que la réconciliation incrémentale `workout_sessions`→`db.logs` n'est pas câblée au pull, une nouvelle séance créée sur un appareil n'apparaît pas sur un autre appareil au local déjà peuplé. À planifier au Lot 2.
