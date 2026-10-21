# SYNC — Lot 1 « bleed-stop » : rapport d'implémentation

> **Branche** : `fix/sync-edit-loss-lot1` · **Base** : `main`
> **Objectif** : arrêter la perte d'édition. Traite M2 + M3 + la base de M1 (poser l'horloge d'édition). La réécriture complète du merge (M1 plein, union, tombstones, fusion du reste de `db`) reste le **Lot 2**.
> **Réfs** : `audit/sync-edit-loss-diagnostic.md`, `audit/sync-edit-loss-fix-proposal.md`.

---

## Validation croisée (§3)

**Aucun désaccord** avec P1/P3/P4 de la proposition. Implémentation conforme. Deux précisions de mise en œuvre, sans changement de fond :
- **Valeur d'`editedAt` à la création/import** : on initialise `editedAt = timestamp` (et non `Date.now()`), pour que la baseline d'un log neuf/importé soit déterministe et cohérente entre appareils ; **seule une vraie édition** la pousse à `Date.now()` (donc au-dessus du `timestamp`). Cela aligne création, import et migration rétrocompat sur la même convention.
- **Hash P4** : on signe `max(editedAt||timestamp)` sur tous les logs (terme `_maxLogEditedAt`), pas `db.lastModified` (qui pousserait 808 ko à chaque sauvegarde cosmétique). Ciblé et suffisant.

Rappel de périmètre : ce lot **ne corrige pas encore** le départage du merge (toujours par `timestamp`, M1 plein = Lot 2). Mais en garantissant que (a) l'édition pousse (P4) et (b) le heartbeat n'arme plus le merge (P3), la fenêtre de perte est **fortement réduite** dès ce lot.

---

## Changements (fichier:fonction)

### P1 — Horloge d'édition `editedAt` posée à chaque mutation
| Site | Fichier:ligne | Changement |
|---|---|---|
| Création canonique | `createSession` `js/import.js:70` | ajout `editedAt: t` dans l'objet log (couvre la fin de séance GO via `convertWorkoutToSession` `app.js:30751`) |
| Édition manuelle | `saveSessionEdits` `js/app.js:29597` | **déjà** `editedAt = Date.now()` (vérifié : posé avant la réécriture `db.logs[idx]`) — inchangé |
| Import Hevy | `executeImport` `js/import.js:762` | `session.editedAt = session.timestamp || Date.now()` avant `unshift` |
| Import CSV | `_doImportCSV` `js/app.js:10494` | idem avant `db.logs.push` |
| Correction de record | `editRecord` `js/app.js:~17865` | `log.editedAt = Date.now()` quand un exo du log est modifié |
| Suppression de record | `deleteRecord` `js/app.js:~17893` | `log.editedAt = Date.now()` quand un exo est retiré (diff de longueur) |
| Rétrocompat | `_migrateLogEditedAt(db.logs)` (nouveau, `js/app.js`) appelé dans l'orchestrateur de migrations (`app.js:~14513`) | tout log sans `editedAt` reçoit `timestamp` |
| **Exception garantie** | `compressOldLogs` `js/supabase.js:4300` | **ne touche PAS `editedAt`** (vérifié + test dédié) — la compression lossy ne doit jamais « gagner » un merge |

### P3 — `keepAlive` ne touche plus `sbd_profiles.updated_at`
- `keepAlive(userIdArg)` `js/supabase.js:4285` : remplace l'`UPDATE sbd_profiles SET updated_at` par un **`upsert` sur `public.heartbeats` `{ user_id, last_seen }`** (`onConflict: 'user_id'`). `userIdArg` optionnel (réutilise l'uid du boot, évite un 2ᵉ `auth.getUser()` → verrou gotrue).
- Call-site `js/app.js:14590` : `keepAlive(user.id)` (uid déjà en main dans le `.then(user => …)` de `cloudSignIn`).
- Effet : `sbd_profiles.updated_at` ne bouge plus que sur un **vrai push de données** → la vanne de merge de `syncFromCloud` (`cloudTs > _lastCloudPush`) ne s'ouvre plus à cause du heartbeat.

### P4 — Une édition change le hash → déclenche le push
- `_computeDataHash` `js/supabase.js:237` : ajout du terme `_maxLogEditedAt = max(log.editedAt || log.timestamp)` au tableau signé (champs existants conservés). Toute édition (même d'un log ancien) change le hash → `syncToCloud` ne court-circuite plus (`:271`) → l'édition atteint le blob **et** `workout_sessions` (le dual-write `syncLogsToSupabase` tourne en fin de `syncToCloud`, et `_wsLogHash` détecte le contenu modifié).

### Hors-scope (signalé, non touché)
Merge `syncFromCloud` (départage par `editClock`/union/tombstones/fusion du reste de `db`) = **Lot 2** ; archivage des logs hors blob = chantier séparé ; pas de purge de blob ni de modif du `statement_timeout`.

---

## Tests

Fonctions **pures vm-extraites de la vraie source** (pattern P3-b) — `tests/unit/sync-lot1.test.js` :
- **P4 `_computeDataHash`** : `hash_sensible_a_edition` (éditer un log NON-récent change le hash), édition du log récent aussi, idempotence, régression `logs.length`, robustesse log sans `editedAt`.
- **P1 `_migrateLogEditedAt`** : sans `editedAt` → reçoit `timestamp` (+ compte) ; avec → inchangé ; `null` traité comme absent ; vide/undefined → 0.
- **Invariant compression** : `compression_ne_touche_pas_editedAt` (vieux log compressé mais `editedAt` préservé ; log récent non compressé).

```
Test Suites: 8 passed, 8 total
Tests:       165 passed, 165 total   (153 existants + 12 nouveaux)
```
`node -c` OK sur `supabase.js`, `app.js`, `import.js`, `service-worker.js`. **SW bumpé v288 → v289** (`service-worker.js` + `js/app.js:267`).

---

## Vérifs réelles à confier à Claude (chat)

Rejouer l'incident (renommer une séance **ancienne**, puis basculer d'appareil / forcer un pull) et confirmer :
1. **`sbd_profiles.updated_at` ne bouge plus au seul boot** (sans édition) — le heartbeat ne l'avance plus.
2. **`heartbeats.last_seen`** se met bien à jour au boot pour ce `user_id` (et le projet free-tier reste « réveillé »).
3. **L'édition est poussée et survit** : après le renommage, `sbd_profiles.data->'logs'` **et** la ligne `workout_sessions` correspondante portent le **nouveau** titre, et le renommage **survit à un pull** (`syncFromCloud`).
4. (Bonus) Vérifier qu'un log édité porte un `editedAt > timestamp` côté cloud (preuve que l'horloge est bien propagée pour le Lot 2).

> Limite connue (assumée, Lot 2) : tant que le merge départage par `timestamp`, un scénario multi-appareils où un pull au mauvais moment précède le push pourrait encore écraser une édition. P3+P4 réduisent fortement la fenêtre ; la correction définitive (départage par `editClock`) est le Lot 2.
