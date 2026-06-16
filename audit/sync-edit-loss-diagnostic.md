# SYNC — Diagnostic d'une perte de données à l'édition d'un log (Phase 1)

> **Branche** : `audit/sync-edit-loss-diagnostic` · **Base** : `main` · **Version concernée** : SW v288.
> **Statut** : diagnostic seul. Aucun code modifié, aucune donnée écrite, aucune correction implémentée.
> **Symptôme** : un renommage de séance existante (titre → « Quads - Test de modif ») s'affiche puis disparaît partout (mémoire, localStorage, blob cloud, `workout_sessions`). Le blob a été réécrit (`updated_at` a avancé) **sans** le renommage.
> **Méthode** : investigation menée depuis le symptôme, sans cause imposée. La conclusion ci-dessous est celle vers laquelle convergent les faits.

---

## TL;DR — cause racine

La perte vient de **`syncFromCloud()` qui, lors d'un *merge*, choisit la version d'un log par son `timestamp` de séance (l'heure de l'entraînement), avec le cloud qui gagne les égalités** (`js/supabase.js:520-528`). Or **une édition n'augmente pas le `timestamp`** (il reste égal — et `saveSessionEdits` le tronque même à la minute, le rendant souvent *plus petit*). Donc, dès qu'un merge s'exécute, **l'édition locale non encore poussée est silencieusement remplacée par la version périmée du cloud**, puis re-persistée localement et re-poussée → disparition partout.

Trois facteurs rendent ce merge fréquent et la perte quasi déterministe :
1. **`keepAlive()` arme le merge** : il fait `UPDATE … SET updated_at = now()` **sans pousser de données** ni mettre à jour `_lastCloudPush` (`js/supabase.js:4285-4295`), donc `cloud.updated_at > _lastCloudPush` → la porte du merge s'ouvre au pull suivant, **même sur un seul appareil**.
2. **`_computeDataHash` est aveugle aux éditions d'anciens logs** (`js/supabase.js:237-261`) → l'édition n'est jamais poussée (`syncToCloud` court-circuite) → elle ne vit qu'en local, maximalement exposée.
3. **`saveSessionEdits` tronque le `timestamp` à la minute** (`js/app.js:29557-29559`) → le log édité local devient `≤` au cloud → le tie-breaker choisit le cloud à coup sûr.

Certitude : **élevée** sur le mécanisme (entièrement lisible dans le code). L'élément déclencheur exact de l'incident (keepAlive vs 2ᵉ appareil vs push commit-mais-timeout) ne peut être tranché sans logs serveur — les trois mènent au même merge ; le plus probable est **keepAlive** (systémique, mono-appareil, à chaque démarrage).

---

## Q1 — Flux d'écriture local d'une édition (le renommage)

**`saveSessionEdits()` — `js/app.js:29539`** (déclenché par le bouton « Enregistrer » de l'éditeur de séance, `js/app.js:29367`).

- L'éditeur travaille sur une **copie profonde** : `_editSession = JSON.parse(JSON.stringify(session))` (`openSessionEditor`, `js/app.js:29341`), avec `_editSessionId` = l'`id` dans `db.logs` (`:29339`).
- Titre : `_editSession.title = titleEl.value.trim() || 'Séance'` (`:29548`).
- **Timestamp re-dérivé du formulaire** (toujours, car `seDate`+`seTime` existent) : `new Date(an, mois, jour, heure, minute, 0)` → `_editSession.timestamp = newDate.getTime()` (`:29557-29559`). **Les secondes/millisecondes sont forcées à 0** → pour un simple renommage, le timestamp est *retronqué à la minute*, donc **inférieur ou égal** à l'original.
- Marqueurs d'édition : `_editSession.edited = true` ; `_editSession.editedAt = Date.now()` (`:29596-29597`). **⚠️ Ces champs ne sont lus par AUCUN algorithme de merge.**
- Réécriture : `idx = db.logs.findIndex(id===_editSessionId)` ; `db.logs[idx] = _editSession` (`:29600-29603`).
- Persistance + sync : `saveDBNow()` (`:29605`), puis `recalcBestPR()`, `updateSessionActivity()`, `renderSeancesTab()`.

`saveDBNow()` (`js/app.js:346`) → `_flushDB()` qui pose **`db.updatedAt = Date.now()`** (`js/app.js:359`) — **mais jamais `db.lastModified`** (jamais assigné nulle part dans le repo, cf. grep) — puis `localStorage.setItem(STORAGE_KEY, …)`, puis `debouncedCloudSync()` → `syncToCloud(true)` après 2 s (`js/app.js:402-411`).

> À retenir : l'édition est correctement écrite **en local** ; sa propagation cloud dépend ensuite entièrement du hash (Q3) et de la course pull/push (Q4).

---

## Q2 — Flux de pull et algorithme de merge (`syncFromCloud`)

**`syncFromCloud()` — `js/supabase.js:479`.**

1. Récupère `cloudData` + `cloudTs = updated_at` (`:487-488`).
2. **Porte d'entrée** (`:494-499`) : `lastPush = _lastCloudPush` ; si **`cloudTs <= lastPush`** → « local autoritaire » → `syncToCloud(true)` et retour **sans merge**. Le merge ne s'exécute donc **que si `cloudTs > _lastCloudPush`**.
3. **Merge des logs par `id`** (`:516-528`) :
   ```js
   _cloudLogsArr.forEach(log => { if (log.id) _mergedMap[log.id] = log; });        // cloud d'abord
   _localLogsArr.forEach(log => {
     if (!_mergedMap[log.id] || (log.timestamp||0) > (_mergedMap[log.id].timestamp||0))
       _mergedMap[log.id] = log;                                                    // local SEULEMENT si STRICTEMENT plus récent
   });
   ```
   - Critère de choix pour un même `id` présent des deux côtés : **`log.timestamp` uniquement**.
   - **En cas d'égalité de `timestamp` → le cloud est conservé** (la condition `>` est stricte, et le cloud a été inséré en premier). Aucun autre champ comparé. `editedAt`/`edited`/`title`/`volume` **ignorés**.
4. Reconstruction : `_mergedData = Object.assign({}, cloudData)` puis on **n'écrase depuis le local que `logs`, `exercises`, `bestPR`** (`:532-535`). **Toutes les autres clés de `db` (user, weeklyPlan, gamification, social, settings, body, readiness, activityLogs, …) sont prises TELLES QUELLES depuis le cloud.** Puis `db = _mergedData` (`:536`) et `localStorage.setItem(STORAGE_KEY, …)` (`:561`), `_lastCloudPush = cloudTs` (`:563`).

> **Conséquence directe** : pour le log renommé, le cloud (ancien titre, `timestamp` original) et le local (nouveau titre, `timestamp` tronqué `≤`) ont le **même `id`**. La condition `local.timestamp > cloud.timestamp` est **fausse** → **le cloud (ancien titre) gagne** → le renommage est jeté. `db` est remplacé par la version fusionnée et **re-persisté** : l'édition disparaît aussi du localStorage.

---

## Q3 — Push (`syncToCloud`) et hash (`_computeDataHash`)

**`_computeDataHash(d)` — `js/supabase.js:237-261`** signe :
`logs.length` (`:247`), `logs[0].timestamp` (`lastLog = d.logs[0]`, `:239`/`:248`), nombre d'`exercises`, `xpHighWaterMark`, nb `earnedBadges`, longueurs `activityLogs`/`readiness`/`readinessHistory` + ts dernière, longueurs JSON de `user`/`weeklyPlan`/`bestPR`, et **`d.lastModified || 0`** (`:259`).

- Le **titre** (et notes, reps, RPE…) d'un log **n'est pas dans le hash**.
- `db.lastModified` n'est **jamais assigné** → ce terme vaut toujours `0`.
- `logs[0]` = log le plus récent. **Éditer un log qui n'est pas le plus récent ne change NI `logs.length` NI `logs[0].timestamp` NI aucun autre terme → le hash est INCHANGÉ.**

**`syncToCloud(silent)` — `js/supabase.js:263`** : `if (db._lastSyncHash === _hash) { … return; }` (`:271`). Donc, pour le renommage d'une **séance ancienne**, le hash est inchangé → **`syncToCloud` retourne immédiatement (« Déjà à jour ») : aucun push.** Le blob cloud n'est pas mis à jour, et **`syncLogsToSupabase()` (le dual-write vers `workout_sessions`, appelé en fin de `syncToCloud` à `:301`) n'est jamais exécuté non plus.** → l'édition n'atteint **ni le blob ni `workout_sessions`**.

> Cas limite : si la séance éditée **est** la plus récente (`logs[0]`), la troncature du timestamp change `logs[0].timestamp` → le hash change → push. Le renommage de la séance la plus récente est donc **sûr** ; c'est le renommage d'une séance **plus ancienne** qui est exposé. (Et même un push qui *échoue* sur timeout n'enregistre pas `_lastCloudPush` — voir Q4.)

---

## Q4 — Course pull / push

**Déclencheurs de PUSH** : `saveDB`/`saveDBNow` → `debouncedCloudSync()` (2 s, `js/app.js:410`) → `syncToCloud(true)` ; événement `online` (`js/app.js:413-420`) ; au boot (`js/app.js:14549/14573/14578/14583`).

**Déclencheurs de PULL** (`syncFromCloud`), tous gardés par `cloudTs > db.lastSync + 5000` :
- **Refocus / retour sur l'app** : `visibilitychange` (`js/supabase.js:15-39`, garde `:31`, throttle 1/min `:21`).
- **Boot / login** : si `db.logs.length===0` pull complet (`js/app.js:14538`) ; sinon si `cloudTs > db.lastSync+5000` → merge (`js/app.js:14563-14565`).
- Autres appels : `js/app.js:31676`.

**La fenêtre de perte** — séquence temporelle (mono-appareil) :
1. État stable : cloud = pré-renommage, `updated_at = T0`, `_lastCloudPush = T0`, `db.lastSync ≈ T0`.
2. **`keepAlive()`** (appelé à chaque boot, `js/app.js:14590`) fait `UPDATE sbd_profiles SET updated_at = now()` (`js/supabase.js:4290-4292`) → **`updated_at = T1 > T0`, contenu du blob inchangé, `_lastCloudPush` toujours `T0`** (keepAlive n'y touche pas).
3. L'utilisateur renomme une séance ancienne → écrit en local (Q1) ; `syncToCloud` court-circuite (Q3) → **pas de push**. Cloud toujours pré-renommage.
4. Un **pull** se déclenche (refocus `visibilitychange`, ou prochain boot) : porte externe `cloudTs(T1) > db.lastSync(T0)+5s` ✅ → `syncFromCloud`. Porte interne **`cloudTs(T1) > _lastCloudPush(T0)`** ✅ → **le merge s'exécute**.
5. Merge (Q2) : cloud (ancien titre) bat local (nouveau titre, `timestamp ≤`) sur l'égalité/infériorité du `timestamp` → **renommage jeté**, `db` remplacé et re-persisté (`:561`), `_lastCloudPush = T1`.
6. Plus tard, toute action qui change le hash pousse l'état **réverté** → le blob est réécrit **sans** le renommage (`updated_at` avance). ✅ correspond exactement au fait Supabase observé.

> **Variantes d'enabler menant au même merge** : (b) **2ᵉ appareil/onglet** qui écrit le blob → `updated_at > _lastCloudPush` local ; (c) **push commité côté serveur mais en échec côté client** (le blob ~808 kB / `statement_timeout`) : le `catch` de `syncToCloud` (`js/supabase.js:302-306`) **ne met pas à jour `_lastCloudPush`**, donc l'écriture committée laisse `cloudTs > _lastCloudPush` → merge au pull suivant. keepAlive reste le plus probable car il agit en mono-appareil, sans aucune panne, à chaque démarrage.

---

## Q5 — Chaîne causale (reconstitution pas-à-pas)

1. **Édition locale correcte** : `saveSessionEdits` pose le nouveau titre et **re-tronque le `timestamp` à la minute** (`app.js:29548`, `:29557-29559`), écrit `db.logs[idx]` (`:29602`), persiste (`saveDBNow`/`_flushDB`, `app.js:359-360`).
2. **Édition non poussée** : pour une séance non-`logs[0]`, `_computeDataHash` est inchangé (`supabase.js:237-261`) → `syncToCloud` court-circuite (`:271`) → ni blob ni `workout_sessions` mis à jour (le dual-write `:301` ne tourne pas).
3. **Merge armé** : `keepAlive()` (ou un 2ᵉ appareil / un push timeout) a porté `cloud.updated_at` au-delà de `_lastCloudPush` (`supabase.js:4290-4292`).
4. **Pull → merge** : un `visibilitychange`/boot passe la garde `cloudTs > db.lastSync+5s` puis la garde interne `cloudTs > _lastCloudPush` (`supabase.js:494-499`) → exécution du merge.
5. **Perte** : le tie-breaker par `timestamp` conserve la version cloud périmée (`supabase.js:520-528`, ligne clé `:522`) ; `editedAt` est ignoré → **nouveau titre jeté** ; `db` réverté et re-persisté (`:536`, `:561`).
6. **Propagation de la réversion** : un push ultérieur écrit l'état sans renommage → blob réécrit, `updated_at` avancé (fait observé).

**Cause racine retenue** : le **merge de `syncFromCloud` utilise le `timestamp` de séance comme horloge de version et fait gagner le cloud à égalité** → toute édition locale non poussée est écrasée. **Amplifiée** par (a) `keepAlive` qui arme le merge sans pousser de données, (b) la cécité de `_computeDataHash` aux éditions d'anciens logs (qui empêche le push à temps), (c) la troncature du `timestamp` par `saveSessionEdits`.

---

## Q6 — Portée

**Toute édition d'un log existant qui n'augmente pas son `timestamp`** est exposée au même mécanisme :
- renommage (titre), notes de séance ;
- modification de poids / reps / RPE / type de série sur une séance **passée** ;
- ajout/suppression d'une série (change `volume`, pas `timestamp`).
Seul cas sûr : éditer la **séance la plus récente** (`logs[0]`), car la troncature du timestamp y change le hash et déclenche un push.

**Au-delà des logs** : comme le merge ne ré-applique du local que `logs`, `exercises`, `bestPR` (`supabase.js:532-535`) et prend **tout le reste depuis le cloud**, **toute modification locale non poussée d'une autre clé de `db`** (réglages `db.user`, `targets`, `weeklyPlan`, `gamification`, `social`, `body`, `activityLogs`, consentements…) est **également perdue** si un merge survient avant son push. La cécité du hash (`_computeDataHash` n'inclut pas `garminHealth`, `gamification` complet, `body`, `reports`, `social`, `keyLifts`…) élargit fortement cette surface, car ces changements ne déclenchent pas de push.

---

## Q7 — Interaction avec le chantier d'archivage (signaler sans agir)

Quand `logs` sera retiré du blob cloud (P3-c), `cloudData.logs` deviendra vide/absent. Comportement du merge actuel (`supabase.js:512-537`) :
- `_cloudLogsArr = []` → `_mergedMap` ne contient que les logs **locaux** → `_mergedLogs = logs locaux` → `_mergedData.logs = logs locaux`. **Le tie-breaker lossy sur les logs disparaît de facto** (plus de log cloud pour gagner une égalité) : côté logs, le merge cessera d'écraser les éditions. ✅
- **Mais** : `_didMergeLogs = _mergedLogs.length > 0` deviendra **vrai à chaque merge** → re-push systématique (`setTimeout syncToCloud`, `:539-540`) + toast « Séances offline synchronisées » trompeur. ⚠️
- **Et surtout** : sur un appareil neuf (local vide), `_mergedLogs = []` → `db.logs` vide tant que l'hydratation depuis `workout_sessions` n'est pas branchée (déjà identifié pour P3-c). ⚠️
- **Le problème de fond demeure pour le reste de `db`** : le merge continuera de prendre user/weeklyPlan/gamification/… **depuis le cloud**, donc les éditions non-logs resteront perdables.
- **⚠️ Lien critique avec ce bug** : tant que `_computeDataHash` reste aveugle aux éditions d'anciens logs, **ces éditions n'atteindront pas non plus `workout_sessions`** (le dual-write P3-b ne tourne qu'après un `syncToCloud` non court-circuité). Donc P3-b/P3-c **ne suffisent pas** à eux seuls à corriger la perte d'édition : il faut que l'édition déclenche réellement un push.

---

## Piste de correction (non implémentée)

Donner au merge une **vraie horloge de version par log** (réutiliser `editedAt`/un `rev` monotone) au lieu du `timestamp` de séance, et inclure un signal d'édition dans `_computeDataHash` (p.ex. signer `editedAt`/un compteur de révisions, ou poser réellement `db.lastModified`) pour qu'une édition déclenche systématiquement le push — sans oublier que `keepAlive` ne devrait pas avancer `updated_at` au point d'armer le merge (ou bien le pull devrait comparer le **contenu**, pas seulement `updated_at`).

---

## Vérifs Supabase à confier à Claude (chat) pour confirmer

1. **Historique `updated_at`** du `sbd_profiles` du user : confirmer qu'un `UPDATE updated_at`-seul (keepAlive) s'intercale entre deux pushs de contenu → établit `cloud.updated_at > _lastCloudPush`.
2. **Multi-appareils** : vérifier si plusieurs sessions/`refresh_token` actifs écrivent le blob (un 2ᵉ contexte expliquerait l'avance d'`updated_at`).
3. **Échecs de push** : chercher dans les logs des `57014`/timeouts/500 sur `sbd_profiles` au moment de l'incident (push commité-mais-échoué).
4. **`workout_sessions`** : confirmer que la ligne du log renommé porte encore l'**ancien** titre (cohérent avec « dual-write jamais déclenché car `syncToCloud` court-circuité »).

---

*Fin du diagnostic Phase 1. Aucun code modifié, aucune donnée écrite. Validation attendue avant toute correction (Phase 3).*
