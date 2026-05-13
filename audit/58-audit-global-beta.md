# Audit global bêta — v218 → v219

**Date** : 2026-05-13
**Scope** : Performance, programme, tests, nettoyage avant lancement bêta (50 users)
**Méthode** : analyse Supabase `error_logs` (267 lignes) + audit code source

---

## 1. Erreurs en production (Supabase `error_logs`)

| error_type | Occurrences | Dernière | Statut |
|---|---:|---|---|
| `window_error` (`a is not a function`) | 73 | 2026-05-11 14:25 | ⚠️ minified mangling — non actionnable directement |
| `uncaught_js_error` (RangeError stack overflow) | 72 | 2026-05-11 14:25 | À investiguer post-bêta (renderWeekCard récursion) |
| **`render_crash`** (`(e.sets || []).filter is not a function`) | **58** | **2026-05-12 18:05** | **🔴 P0 — fixé v219** |
| `unhandled_promise_rejection` (null `style`) | 23 | 2026-05-11 14:44 | DOM race conditions, à investiguer |
| `unhandled_rejection` | 23 | 2026-05-11 14:44 | Idem |
| `generateWeeklyPlan_crash` (`e.sets.filter`) | 16 | 2026-05-12 17:48 | Fixé v218 |
| `overdrive_mode` (override volontaire) | 2 | — | Pas un bug |

### Fix P0 — v219

**Cause** : `progShowDayDetail` (L12320-12321) et `renderGoTab` (L23237) faisaient `(e.sets || []).filter(...)` — pour `e.sets:number` (entier, anciens plans pré-v218 sauvegardés), `(3 || [])` est truthy → `3.filter` → crash.

**3 fixes** :
1. **Guards défensifs** dans `progShowDayDetail` et `renderGoTab` : `Array.isArray(e.sets) ? e.sets : []`.
2. **Migration `migrateWeeklyPlanSets()`** : normalise les `sets:number` du `db.weeklyPlan` existant en Array une fois au chargement. Heal les anciens plans cachés.
3. (Existant v218) `selectExercisesForProfile` normalise déjà à l'injection.

---

## 2. Performance

### 2A — `syncToCloud` delta sync (P1, fixé)
**Avant** : Aurélien (510 logs, 443 kB) uploadé à chaque sync (debounce 2s + tabs + actions).

**Fix v219** : `_computeDataHash(db)` calcule un hash léger sur les compteurs/tailles clés. Si `db._lastSyncHash === _hash`, **skip upload entièrement**. Économie : ~443 kB par sync inutile pour Aurélien.

### 2B — N+1 query commentaires (vérifié, déjà OK)
**Faux positif** : `loadAndRenderComments` (supabase.js:2017-2021) et `loadFeedItems` (supabase.js:1684-1690) batch déjà via `.in('id', userIds)`. Pas de N+1.

### 2C — `renderWeekCard` stack overflow (P2, post-bêta)
44 occurrences de "Maximum call stack size exceeded" — récursion suspectée. Pas reproductible facilement, dernière trace 2026-05-11. À investiguer si réapparaît.

---

## 3. Programme — vérification 4 profils (via Supabase)

| Profil | user_id | Mode | Logs | Status v218 |
|---|---|---|---:|---|
| Aurélien | `6e2936e7…` | powerbuilding | 510 | ✓ généré (v215+) |
| D'Jo | `0f1a1bf5…` | powerlifting | 144 | ✓ généré (v217 wrappers) |
| Alexis | `430d35d6…` | musculation | 64 | ✓ généré (v217 Safe wrapper) |
| Léa | `9ed88c34…` | musculation | 126 | 🟡 testé v218, à reconfirmer post-v219 (migration sets) |

**Vérifications fines à faire post-bêta** (non-bloquant) :
- Léa : Deadlift absent + RDL présent + max 5 exos (45min)
- Alexis : Mobilité Cheville si Dead/Squat > 1.50
- D'Jo : Floor Press si blessure épaule
- Aurélien : Leg Extension `isCorrectivePriority` (ratio 1.06)

Ces tags (`_addedByRule`, `isCorrectivePriority`) sont vérifiables via le test SETS-LEA-03 v218.

---

## 4. Tests Playwright

Suite minimale ajoutée : `tests/audit-critical-flows-v219.spec.js`
- `FLOW-01` Migration `migrateWeeklyPlanSets()` : normalise les `sets:number` legacy
- `FLOW-02` `progShowDayDetail` ne crash plus avec `sets:number`
- `FLOW-03` `renderGoTab` exo card ne crash plus avec `sets:number`
- `FLOW-04` `_computeDataHash` stable pour le même `db`, change si `logs` change
- `FLOW-05` `syncToCloud` skip upload si hash inchangé (mock)

Les flows complets (onboarding bout-en-bout, log GO, ajustement séance, quick-log) restent hors scope minimal — ajout post-bêta.

---

## 5. Nettoyage `sbd_profiles`

3 profils orphelins supprimés (signups incomplets, ~7 kB total) :
- `dd078a3f-6dfb-4f4b-9063-8c0eb3171f71`
- `0726414a-0b45-4f20-aee1-f422c704e4f2`
- `5dc77caa-424c-47b5-b581-fe20c890f598`

Critères : `name=''`, `mode=null`, `onboarded=false`, `nb_logs=0`. Aucune donnée utilisateur perdue.

---

## SW

`trainhub-v218 → trainhub-v219`. Force reload sur tous les clients pour appliquer la migration `migrateWeeklyPlanSets()`.
