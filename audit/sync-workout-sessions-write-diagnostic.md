# DIAGNOSTIC — `workout_sessions` figé au 16 juin (dual-write défaillant)

> **Branche** : audit (lecture seule) · **AUCUN code de comportement modifié.**
> Symptôme (vérif Claude.ai, non rediscuté) : séances du 23/06 présentes en local + dans `activity_feed`, blob mis à jour (sans `logs`), mais `workout_sessions` figé au **16/06**.
> Rappel : **NE PAS** ajouter `syncToCloud()` ; la purge des logs reste **GELÉE** tant que l'écriture `workout_sessions` n'est pas fiable.

---

## Cause la plus probable (1 phrase)
**Le dual-write `workout_sessions` est la SEULE écriture qui n'a aucun déclencheur immédiat à la fin de séance** : il dépend du `syncToCloud` debouncé (2 s) et part en **fire-and-forget APRÈS le toast « Synchronisé ! » et le push du blob**, avec 2 allers-retours réseau supplémentaires (select + upsert) → il est tué quand l'utilisateur referme l'app peu après avoir loggé (« app laissée ouverte quelques secondes ») ; alors que `publishSessionActivity` (feed) et le push du blob, eux, partent/aboutissent plus tôt.

---

## A. Déclenchement du dual-write
- `syncLogsToSupabase` (supabase.js:419-500) appelé **depuis UN SEUL endroit** : `syncToCloud:323` (grep call sites = `:323` + la def `:419`). **Aucun appel direct à la fin de séance.**
- Ordre dans `syncToCloud` (supabase.js:309-323) :
  1. `await upsert(sbd_profiles…)` (blob, **awaité**, `:311`) → c'est ce qui met `updated_at` au 23/06 ✅
  2. `db._lastSyncHash = _hash` + `localStorage.setItem` (`:316-319`)
  3. `showToast('Synchronisé !')` (`:320`) — **succès affiché AVANT le dual-write**
  4. `syncLogsToSupabase(user.id).catch(…)` (`:323`) — **NON awaité (fire-and-forget)**.
- → Le blob est poussé et le toast s'affiche **avant** que le dual-write ne fasse ses 2 round-trips. `syncToCloud` retourne immédiatement après `:323`.

## B. Flag de garde `_workoutSessionsSynced` — **écarté**
- Lu uniquement en `:441` (`{ synced: db._workoutSessionsSynced === true }`) ; dans `computeWorkoutSessionsSyncPlan`, `o.synced` ne gate **que les SUPPRESSIONS** (`:395` `if (o.synced !== true || logs.length === 0) { …; toDelete = []; }`). **Il ne saute JAMAIS les upserts.** Donc le flag n'explique pas l'arrêt des écritures. (Suspect n°1 du prompt → infirmé par le code.)
- `toUpsert` : `if (!cloudSet[id]) toUpsert.push(log)` (`:379`). Une **nouvelle** séance (id absent de `workout_sessions`, table figée au 16/06) tombe **toujours** dans `!cloudSet[id]` → elle DEVRAIT être upsertée. `cloudSet` vient d'un **SELECT frais** à chaque passage (`:430-433`, jamais caché) → pas de liste périmée. → La logique du plan est correcte ; le problème est en **amont** (le dual-write ne tourne pas jusqu'au bout) ou en **aval** (l'upsert échoue).

## C. Échec silencieux
- `syncLogsToSupabase(user.id).catch(function(e){ console.error('log sync failed:', e); })` (`:323`) → **fire-and-forget**, l'erreur ne va QUE dans la console.
- Dans la fonction : `if (selErr) { console.error(...); return; }` (`:434`) et `if (up.error) { console.error(...); allOk = false; break; }` (`:472`) → toute erreur **SELECT ou UPSERT est avalée** (console seulement), invisible à l'UI et à la télémétrie. Une erreur RLS/contrainte/type sur l'INSERT ferait échouer le batch **silencieusement**.
- Champs envoyés à l'upsert (`:454-465`) : `user_id, session_id (=log.id), short_date, title, timestamp (ISO), volume, duration, exercise_count, data (log entier)` ; batches de 50 ; `onConflict: 'user_id,session_id'` (`:471`).

## D. Divergence `activity_feed` ✅ vs `workout_sessions` ❌ — **l'indice clé**
- **`activity_feed`** : `publishSessionActivity(session)` est appelé **directement dans `goFinishWorkout`** (app.js:31275, `try { publishSessionActivity(session); } catch(e){}`), **à l'instant de la fin de séance** (t=0). Il insère dans `activity_feed` (`postToFeed` → supabase.js:2560/2495).
- **`workout_sessions`** : aucun appel à la fin de séance. La fin de séance fait `saveDBNow()` → `debouncedCloudSync()` (**2 s de debounce**, app.js:402) → `syncToCloud` → fire-and-forget `syncLogsToSupabase` (**t = 2 s+**, après le push blob).
- → **Même flux de fin de séance, deux temporalités** : le feed part à t=0 (utilisateur encore dans l'app, écran de résumé/célébration) ; le dual-write part à t≥2 s, **après** le toast de succès, quand l'utilisateur a souvent déjà refermé/backgroundé l'app → ses round-trips sont coupés. C'est exactement ce qui sépare les deux écritures.

## E. Corrélation temporelle (git log)
- Le code du dual-write n'a **PAS changé** depuis sa création : `syncLogsToSupabase`, `_workoutSessionsSynced`, l'appel `:323`, le `onConflict` → touchés uniquement par `c6cc87a` (P3-b « dual-write fiable ») et `ca0e69f` (append-only A2-F1). **Aucun commit autour du 16/06 n'a modifié cette zone.**
- → Le « gel au 16/06 » n'est **pas** une régression de code récente du dual-write. Le 16/06 correspond très probablement au **dernier passage qui a abouti** — vraisemblablement le **backfill initial des 532 séances** (P3-b/P3-c) : une opération longue (532 lignes, batches de 50 = 11 upserts) pendant laquelle l'app est restée occupée assez longtemps pour finir. Depuis, les sessions « log + ferme vite » tuent systématiquement le fire-and-forget → table figée à l'instantané du backfill.

---

## Hypothèses classées par probabilité
1. **(forte) Fire-and-forget non terminé** — le dual-write part trop tard (debounce 2 s + après le toast) et n'est pas awaité ; l'app se referme avant la fin de ses 2 round-trips. Cohérent avec : blob mis à jour (push awaité) + feed écrit (t=0) + `workout_sessions` figé + 16/06 = dernier passage long (backfill). Code stable (git).
2. **(à départager) Échec SILENCIEUX de l'upsert** — une erreur RLS / contrainte / type sur l'INSERT `workout_sessions`, avalée par le `.catch` + `console.error`. Donnerait un gel **net** (chaque upsert échoue). Discriminant : présence d'erreurs dans les **logs Supabase**.
3. **(faible) Échec du SELECT `session_id`** (`:434` early-return) — mais les lectures fonctionnent par ailleurs (feed, blob).

> Discriminant #1 vs #2 (à faire côté Claude.ai) : **logs Supabase**. Des erreurs `workout_sessions` (RLS 42501, contrainte 23505/42P10, type 22P02) depuis le 16/06 → hypothèse #2. **Aucune** tentative/erreur d'upsert côté serveur → hypothèse #1 (le client n'atteint jamais le serveur).

---

## Correctifs candidats (NON codés — Phase ultérieure)
Tous visent la **même faiblesse structurelle** : le dual-write est la seule écriture sans déclencheur immédiat, fire-and-forget, non retentée, silencieuse.
- **Déclencher `syncLogsToSupabase(uid)` DIRECTEMENT à la fin de séance** (dans `goFinishWorkout`, comme `publishSessionActivity`), à t=0, **avec l'uid** (évite un 2ᵉ `getUser` → pas de lock gotrue). ⚠️ ce n'est PAS ajouter `syncToCloud()` — c'est le dual-write, pas le push blob. Le fire-and-forget de `:323` peut rester en filet.
- **Flusher le dual-write en attente** sur `visibilitychange:hidden` / `pagehide` (ex. `navigator.sendBeacon` ou `fetch(..., {keepalive:true})`) pour survivre à la fermeture.
- **Retenter** un dual-write échoué (aujourd'hui, si chaque sync est tué, jamais retenté ; ne pas poser `_workoutSessionsSynced`/`_wsSyncedHashes` tant que l'upsert n'a pas réussi — déjà le cas, mais sans relance proactive).
- **Observabilité** : remonter l'erreur d'upsert (télémétrie `error_logs`) au lieu d'un simple `console.error`.

## À vérifier côté Claude.ai / Supabase
1. **Logs Supabase** : erreurs sur `workout_sessions` (upsert) depuis le 16/06 ? (départage #1/#2).
2. **Contrainte unique** `(user_id, session_id)` : présente **en continu** depuis avant le 16/06 ? (si ajoutée récemment, le `onConflict` aurait pu échouer avant).
3. **RLS INSERT/UPSERT** sur `workout_sessions` (own-only) inchangée.
4. ⚠️ **Purge GELÉE** : ne rien purger tant que l'écriture n'est pas fiabilisée (la table est le seul filet des séances absentes).

*Fin du diagnostic. Aucun correctif. En attente de validation Aurélien (+ logs Supabase pour départager #1/#2).*
