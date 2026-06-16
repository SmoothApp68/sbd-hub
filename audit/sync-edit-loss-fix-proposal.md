# SYNC — Proposition de correctif : perte d'édition à la synchronisation (Phase 2)

> **Branche** : `audit/sync-edit-loss-fix-proposal` · **Base** : `main`
> **Statut** : proposition écrite. Aucun code applicatif modifié, aucune écriture de données.
> **Réf. diagnostic** : `audit/sync-edit-loss-diagnostic.md` (cause racine + numéros de ligne).
> **Réf. chantier voisin** : dual-write fiable `workout_sessions` déjà mergé (P3-b — `computeWorkoutSessionsSyncPlan` / `_wsLogHash`).

---

## 0. Principe directeur

La cause racine est que la réconciliation utilise le **`timestamp` de séance** comme s'il s'agissait d'une horloge de version. Il faut **une vraie horloge d'édition par log**, un **merge non destructif** qui s'appuie dessus, et **fermer les deux vannes** qui rendent le merge fréquent et les éditions invisibles au push (keepAlive + hash). La contrainte produit (**même compte, plusieurs appareils en alternance**) interdit « le local gagne toujours » : on réconcilie sur « modifié le plus récemment », jamais sur la fraîcheur du local.

Conséquence transversale importante : l'horloge d'édition (P1) sert **à la fois** au merge du blob **et** au dual-write `workout_sessions` (P3-b/P3-c), et le déclenchement du push (P4) est le **prérequis commun** pour que l'édition atteigne l'un OU l'autre.

---

## P1 — Horloge d'édition par log

**Champ retenu : `log.editedAt` (epoch ms), posé à CHAQUE mutation d'un log.** Raisons :
- Le champ existe déjà (`saveSessionEdits` le pose, `js/app.js:29597`) — il est juste ignoré par le merge ; on le généralise au lieu d'inventer un nouveau schéma.
- Horloge murale (ms) suffisante pour de l'usage **alterné** (jamais simultané à la seconde, cf. §2). Un compteur `rev` monotone serait plus robuste au décalage d'horloge mais nécessite de connaître le `rev` précédent et gère mal deux incréments concurrents → sur-ingénierie pour ce modèle d'usage. On note le décalage d'horloge comme risque résiduel (mitigé par P3+P4 qui réduisent la fenêtre de merge).

**Sites où poser `editedAt = Date.now()` (tous les écrivains de `db.logs`, cf. diagnostic Q2 initial) :**
| Site | Fichier:ligne | Action |
|---|---|---|
| Création (canonique) | `createSession` `js/import.js:70` | initialiser `editedAt: t` (= `timestamp` de création) |
| Fin de séance GO | `goFinishWorkout` `js/app.js:31028` | `session.editedAt` posé via createSession ; sinon `Date.now()` au push |
| Édition manuelle | `saveSessionEdits` `js/app.js:29597` | déjà posé ✅ |
| Import CSV | `_doImportCSV` `js/app.js:10494` | `editedAt` sur chaque log importé |
| Import Hevy | `executeImport` `js/import.js:762` | idem |
| Renommage/suppr. exo dans tous les logs | `js/app.js:17863`, `:17893` | bumper `editedAt` des logs touchés |
| Nettoyage exos blacklistés | `cleanupExistingLogs` `js/app.js:10066` | bumper `editedAt` des logs touchés |

**⚠️ Exception explicite — `compressOldLogs` (`js/supabase.js:4300`) NE DOIT PAS bumper `editedAt`.** C'est une optimisation locale **lossy** (ne garde que le best set) ; si elle bumpait l'horloge, la version compressée « gagnerait » le merge et **écraserait la version complète du cloud**. La compression reste un détail local (et devient caduque après l'archivage, les logs quittant le blob).

**Rétrocompat (logs existants sans `editedAt`)** : migration one-shot dans `migrateDB()` → `log.editedAt = log.editedAt || log.timestamp`. Ainsi un ancien log a `editedAt = timestamp` (sa date de séance), et toute édition future pose `editedAt = Date.now() > timestamp` → l'édition gagne. Le merge lit `editedAt` avec fallback : `(log.editedAt || log.timestamp || 0)`.

---

## P2 — Merge non destructif et correct

**Cible : la réconciliation des logs dans `syncFromCloud` (`js/supabase.js:516-537`).** Réécrire la règle par-id pour départager sur l'**horloge d'édition** :

```text
// pseudo-code — fonction PURE extractible/testée (cf. P6)
function reconcileLogs(localLogs, cloudLogs, tombstones):
  map = {}
  for log in cloudLogs: if log.id: map[log.id] = log
  for log in localLogs:
    if not log.id: garder (no-id) ; continue
    cur = map[log.id]
    if !cur OR editClock(log) > editClock(cur): map[log.id] = log   // édition la plus récente gagne
    // égalité d'horloge → on garde cur (cloud) : départage déterministe, quasi jamais atteint
  result = values(map) + noIdLogs
  // tombstones : retirer les id supprimés dont la suppression est postérieure à l'édition retenue
  for id, delAt in tombstones: if map[id] && delAt > editClock(map[id]): drop id
  return result.sort(by timestamp desc)

editClock(log) = log.editedAt || log.timestamp || 0
```

Points clés vs l'existant :
- **Union par `id`** conservée (n'efface pas les séances que l'autre appareil a en plus — préserve le fix A2-F1) ; cas §2-(4) couvert.
- **Départage par `editClock`** au lieu de `timestamp` (ligne fautive `js/supabase.js:522`) → une édition (même `timestamp` égal/inférieur) gagne ; cas §2-(1) et §2-(3) couverts.
- **Égalité d'horloge → cloud** (déterministe). Avec des ms et l'usage alterné, pratiquement jamais atteint.

**Suppressions (tombstones) — sinon résurrection.** Aujourd'hui une suppression locale (`deleteSessionFromList` `js/app.js:16150`, `seDeleteSession` `:29531`, `deleteLog` `js/import.js:1007`) retire le log du local ; au merge, l'union le **ressuscite** depuis le cloud. Proposer un registre `db.deletedLogs = { [id]: deletedAt }` (posé à chaque suppression), pris en compte dans `reconcileLogs` (drop si `deletedAt > editClock(versionRetenue)`). Purge des tombstones après confirmation cloud (ou TTL). **Note d'ordre** : une fois l'archivage P3-c en place (logs hors blob), les suppressions passent par `workout_sessions` (déjà géré par P3-b, avec garde-fou anti-wipe) → le besoin de tombstones **dans le blob** disparaît. Tant que les logs sont dans le blob, les tombstones sont nécessaires pour ne pas régresser.

**Le reste de `db` (le problème dépasse `logs`).** Aujourd'hui `_mergedData = Object.assign({}, cloudData)` puis seuls `logs`, `exercises`, `bestPR` sont repris du local (`js/supabase.js:532-535`) — donc **toute autre clé non poussée est perdue** (réglages `user`, `weeklyPlan`, `gamification`, `social`, `activityLogs`, `readinessHistory`…). Et `exercises`/`bestPR` utilisent un grossier `db.X || cloud.X` (« local si truthy »), lui-même non *edit-aware*.

Proposition pragmatique (pas de CRDT complet — sur-ingénierie pour une PWA vanilla/free-tier) :
1. **S'appuyer d'abord sur P4** : si toute modification locale pousse vite et fiablement, alors quand un merge survient (cloud réellement plus récent), prendre le cloud pour les **réglages scalaires** est correct (c'est l'état du dernier appareil). La fenêtre de perte se réduit à « édité puis pull avant push ».
2. **Fusion explicite des collections append-only / monotones** (au lieu de « cloud écrase ») :
   - `earnedBadges`, `xpHighWaterMark` → déjà monotones (union / max).
   - `activityLogs`, `readinessHistory`, `reports` → **union par clé** (id/ts), jamais d'écrasement.
   - `exercises`, `bestPR` → fusion par max e1RM/PR (et non `local || cloud`), pour ne pas perdre les PR faits sur l'autre appareil.
3. **Réglages scalaires** (`db.user.*`, `weeklyPlan`) : last-write-wins au niveau blob (gate corrigée P3). Un LWW par-clé fin est laissé en **amélioration future** documentée.

---

## P3 — `keepAlive` ne doit plus armer le merge

**Problème** : `keepAlive` (`js/supabase.js:4285-4295`) fait `UPDATE sbd_profiles SET updated_at = now()` sans pousser de données ni toucher `_lastCloudPush` → `cloud.updated_at > _lastCloudPush` → la vanne interne du merge (`js/supabase.js:494-499`) s'ouvre au pull suivant.

**Proposition (défense en profondeur) :**
1. **Primaire — découpler le heartbeat de `updated_at`** : le heartbeat anti-pause (free tier) ne doit pas écrire `sbd_profiles.updated_at`, car cette colonne sert d'horloge « dernière écriture de données » du gate. Cibler un emplacement dédié : colonne `last_seen` ou table `heartbeats(user_id, seen_at)`. Alors `updated_at` ne bouge que sur de vraies écritures de blob → le gate ne s'ouvre que sur du vrai changement. *(petite migration → Claude chat, cf. §Besoins)*
2. **Interim sans schéma** : quand C'EST cet appareil qui ping, lire l'`updated_at` renvoyé et le stocker dans `_lastCloudPush` (`keepAlive` ferait `.select('updated_at')` puis `localStorage.setItem('_lastCloudPush', …)`) → notre propre heartbeat ne nous fait plus croire que le cloud est en avance. (Ne couvre pas le heartbeat d'un AUTRE appareil — d'où le besoin du merge non destructif P2 comme filet.)
3. **Filet** : une fois P2 en place, un merge déclenché par un keepAlive (contenu identique) devient un **no-op** (aucune version ne change) → l'arme est désamorcée même si le gate s'ouvre.

---

## P4 — Une édition doit déclencher un push

**Problème** : `_computeDataHash` (`js/supabase.js:237-261`) ne signe que `logs.length`, `logs[0].timestamp` et des compteurs ; `db.lastModified` n'est jamais assigné. Éditer un log non-`logs[0]` ne change pas le hash → `syncToCloud` court-circuite (`:271`) → ni blob ni `workout_sessions` mis à jour.

**Proposition** : ajouter au hash un terme qui change sur toute édition de log :
```text
maxLogEditedAt = max over logs of (log.editedAt || log.timestamp || 0)
```
Signer `maxLogEditedAt` (1 passe, ~instantané) **en plus** des termes actuels. Comme P1 pose `editedAt` à chaque mutation, toute édition change `maxLogEditedAt` → le hash change → `syncToCloud` pousse, et **en cascade** `syncLogsToSupabase` (`js/supabase.js:301`) tourne → l'édition atteint aussi `workout_sessions` (rappel : `_wsLogHash` hashe `JSON.stringify(log)`, donc le titre/`editedAt` modifié y est détecté → upsert de la ligne).

**Pourquoi pas « poser `db.lastModified` à chaque `_flushDB` »** : ça ferait pousser le blob (808 ko avant archivage) à chaque sauvegarde même cosmétique → trop coûteux. Le terme ciblé `maxLogEditedAt` ne déclenche un push que sur de vraies éditions de logs. (Pour les éditions de clés non-logs — réglages/gamification —, élargir le hash à `garminHealth`/`gamification`/`body`/`social` : **amélioration secondaire**, même principe.)

---

## P5 — Interaction avec l'archivage (P3-c/d/e)

- **L'horloge d'édition est partagée par les deux couches.** Dans le blob (avant archivage) elle pilote `reconcileLogs` (P2). Dans `workout_sessions` (après archivage) elle doit piloter la **réconciliation à l'hydratation** (P3-c) : pour un `id` présent en local ET en cloud avec contenus différents, garder `editClock` le plus récent — exactement la même règle. À câbler dans la future fonction d'hydratation `syncFromCloud`/`workout_sessions`.
- **Où vit la réconciliation, à terme ?** Côté **`workout_sessions`** (1 ligne/log) une fois l'archivage fait : c'est plus granulaire et évite de charrier 2,45 Mo. Le blob ne réconciliera plus que les **clés non-logs** (P2 §reste de db). Donc :
  - Avant archivage : `reconcileLogs` vit dans le merge du blob (P2).
  - Après archivage : logs hors blob → la règle `editClock` migre dans l'hydratation `workout_sessions` ; les tombstones blob deviennent inutiles (deletes gérés par P3-b).
- **Pas de contradiction** : P1+P4 sont neutres vis-à-vis de l'archivage (ils rendent juste les éditions visibles/poussées). P3 (keepAlive) est indépendant. Seul P2-tombstones est temporaire (utile uniquement tant que les logs sont dans le blob).

---

## Ordre d'implémentation recommandé

1. **P1 (horloge `editedAt` partout + migration) + P4 (signer `maxLogEditedAt`) + P3 (keepAlive)** — lot « bleed-stop », petit et indépendant. Effet immédiat : les éditions poussent (donc atteignent blob ET `workout_sessions`), keepAlive cesse d'armer le merge. **À faire en premier, ne PAS attendre l'archivage.**
2. **P2 (merge non destructif `reconcileLogs` par `editClock` + fusion des collections + tombstones)** — corrige la réconciliation du blob tant que les logs y sont.
3. **Archivage P3-c/d/e** — déplace les logs vers `workout_sessions` ; réutilise `editClock` à l'hydratation ; rend les tombstones blob caducs.

**Justification de l'ordre** : la perte de données est active *maintenant* ; le lot 1 l'arrête avec un risque minimal et sans dépendre du chantier lent (archivage, lié à la taille du blob). Faire l'horloge d'abord rend aussi l'hydratation de l'archivage correcte d'emblée.

---

## P6 — Risques & tests

Tests **purs** (vm-extraction de la vraie source, comme `tests/unit/dualwrite-plan.test.js`) sur `reconcileLogs` + `editClock` + `_computeDataHash` (signe `maxLogEditedAt`).

Scénarios (les 4 du §2 + bords) :
1. **Édition non perdue** : local édité (`editedAt` récent) vs cloud ancien, même `id`, `timestamp` égal/inférieur → **local gagne**. (Le test qui aurait attrapé le bug.)
2. **Nouvel appareil / local vide** → hydratation = cloud (rien à écraser).
3. **A édite, B périmé resync** : la version au `editedAt` le plus récent gagne, pas « le local de B ».
4. **Union nouvelles séances** : s1 créé sur A, s2 sur B → merge contient **s1 ET s2** (aucune perte).
Bords : 5. **rétrocompat** (log sans `editedAt` des deux côtés, un seul édité → l'édité gagne via fallback) ; 6. **suppression** (tombstone postérieur → log non ressuscité) ; 7. **égalité d'horloge** → départage déterministe (cloud).

**Pire risque de régression de cette proposition** :
- (a) **Perte d'une nouvelle séance** si on dérive vers « local gagne » au lieu de l'union → attrapé par le test 4 (s1+s2 présents).
- (b) **Duplication de logs** si la clé d'union est mal posée (no-id concaténés en double, ou re-merge instable) → test d'**idempotence** : `reconcile(reconcile(x)) == reconcile(x)`, et « pas de doublon d'`id` ».
- (c) **Résurrection d'un log supprimé** si tombstones absents/incomplets → test 6 ; à défaut de tombstones, **documenter** la limite (et s'appuyer sur l'archivage + P3-b qui gèrent les deletes côté `workout_sessions`).
- (d) **Propagation d'une compression lossy** si `compressOldLogs` bumpait `editedAt` → garde-fou P1 (ne pas bumper) + test : log compressé local (editedAt non bumpé) vs complet cloud → **le complet est conservé**.

---

## Ce dont j'ai besoin de Claude (chat) — vérifs/actions Supabase

1. **P3 schéma heartbeat** : créer `sbd_profiles.last_seen` (ou table `heartbeats`) pour que `keepAlive` n'écrive plus `updated_at`. Confirmer que le ping anti-pause free-tier reste efficace via cette cible.
2. **Confirmer la sémantique de `updated_at`** : qu'il est bien mis à jour par l'`upsert` du blob (trigger `now()` ou applicatif) — pour s'assurer que, heartbeat mis à part, `updated_at` = « dernière écriture de données ».
3. **Backfill `editedAt`** (optionnel) : décider si on initialise `editedAt = timestamp` sur les logs existants côté serveur (`workout_sessions.data` et blob) ou seulement via la migration cliente. La migration cliente suffit ; un backfill serveur évite juste un premier merge ambigu sur un 2ᵉ appareil pas encore migré.
4. **Vérif post-déploiement** : après le lot 1, rejouer l'incident (renommer une séance ancienne, basculer d'appareil) et confirmer que `sbd_profiles.data` ET `workout_sessions` portent le nouveau titre.

---

*Fin de la proposition Phase 2. Aucun code applicatif modifié, aucune donnée écrite. Implémentation en Phase 3 après validation croisée.*
