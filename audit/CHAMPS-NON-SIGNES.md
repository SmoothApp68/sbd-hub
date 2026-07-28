# Champs non signés par `_computeDataHash` — liste cumulative

> Construite au fil des vagues d'audit. **Document d'état, aucune correction n'est faite ici.**
> Objet : recenser tout ce dont la modification **ne change pas** la signature de sync
> (`js/supabase.js:261-312`) et ne déclenche donc **aucun push** — la donnée reste locale et
> disparaît au premier écrasement par le cloud (`_applyCloudBlob`, supabase.js:336-337, adopte
> le blob distant en OVERWRITE).

## Le mécanisme

```js
var _hash = _computeDataHash(db);
if (db._lastSyncHash === _hash) { updateSyncStatus('sync'); return; }   // supabase.js:499-501
```
Le blob poussé est pourtant **`db` entier moins `logs`** (`_buildSyncedBlob`, supabase.js:318-322) :
les clés listées ci-dessous sont donc **transportées mais non signées**. Elles ne partent que si une
*autre* modification, elle signée, fait basculer la signature.

## Les 14 termes signés (référence)

`logs.length` · `logs[0].timestamp` · `max(logs[].editedAt)` · `Object.keys(exercises).length` ·
`xpHighWaterMark` · `Object.keys(earnedBadges).length` · `activityLogs.length` · `readiness.length` ·
`readinessHistory.length` · `readinessHistory[last].ts` · `_sig(user)` · `_sig(weeklyPlan)` ·
`_sig(bestPR)` · `lastModified`.

## Champs NON signés — relevé

| Store | Écrit par | Vague | Statut runtime |
|---|---|---|---|
| **`db.body`** (poids + macros) | `saveBodyEntry` import.js:1596 · `saveMacroEntry` import.js:1610 | 1 | ✔ **CONFIRMÉ** : macros seules → signature inchangée, **0** écriture `sbd_profiles`, alors que la donnée est bien persistée en local. *Le poids échappe au problème : `saveBodyEntry` écrit aussi `db.user.bw`, qui est signé.* |
| **`db.keyLifts`** | `saveKeyLifts` app.js:10125 | 1 | ✔ CONFIRMÉ : signature inchangée, 0 écriture |
| **`db.routine`** + **`db.routineExos`** | `saveRoutine` app.js:3981-3984 · `wpApplyDay` 27379 · `wpApplyAll` 27391 · génération 14084 | 1 et 2 | ✔ CONFIRMÉ : signature inchangée, 0 écriture |
| **`db.gamification.lastTab`** | `_updateLastTab` app.js:679 | 1 | ✔ CONFIRMÉ : signature inchangée malgré l'appel explicite à `debouncedCloudSync()` |
| **`db.lastModified`** | **personne** | 1 | ✔ CONFIRMÉ : vaut `undefined` avant et après une modification → contribue une **constante `0`** au 14ᵉ terme. Le champ réellement horodaté est `db.updatedAt` (app.js:374), qui n'est pas signé. |

## Hors périmètre de synchronisation (cas distinct)

| Élément | Où il vit | Vague | Constat |
|---|---|---|---|
| **`activeWorkout`** (séance en cours) | variable globale + `localStorage['SBD_ACTIVE_WORKOUT']` | 2 | ✔ CONFIRMÉ : **hors `db`** et **hors blob de sync**. Ce n'est pas un champ « non signé » — il n'entre jamais dans le périmètre. Une séance interrompue ne quitte pas l'appareil. |
| `localStorage['selectedTheme']` | localStorage pur | 1 | jamais dans `db` |
| `localStorage['sbd_lastTab']` | doublon local de `db.gamification.lastTab` | 1 | voir ci-dessus |

## Déjà corrigés (rappel)

`db.user`, `db.weeklyPlan`, `db.bestPR` — signaient leur **longueur** (`JSON.stringify(...).length`),
donc aveugles à toute modification de longueur constante. Signés **par contenu** depuis la PR #245
(djb2 sur la chaîne sérialisée).
