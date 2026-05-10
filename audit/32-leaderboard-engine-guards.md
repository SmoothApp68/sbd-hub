# Fix Leaderboard + Engine Guards — v181 → v182

**Date** : 2026-05-10
**Branche** : `claude/audit-ble-watch-app-7O2cs`
**Source** : audit Claude avec données Supabase réelles

---

## BUG 1 — DOTS = 0 et XP weekly = XP alltime (CRITIQUE)

### Diagnostic
`syncLeaderboard()` (supabase.js:193) référençait deux fonctions inexistantes :
- `calcLeaderboardMetrics()` → retournait `{}` → DOTS=0, XP=0 pour tous les users
- `getLeaderboardPeriodKey()` → retournait `''` → upserts qui s'écrasent entre semaines

De plus, la même `metrics.xp` était utilisée pour `weekly` ET `alltime` → leaderboard hebdo affichait l'XP cumulé total.

### Avant fix
```
DOTS de tous les users     : 0
XP weekly == XP alltime    : true (toujours)
period_key (weekly/monthly): '' (vide)
```

### Après fix
- DOTS calculé via `computeDOTS(squat+bench+dead, bw, gender)` — ex Aurélien : **327**
- `xp_week` = somme des `xpReward` des challenges hebdo complétés
- `period_key` au format `YYYY-WNN` (ISO 8601) ou `YYYY-MM`

### Commits
1. `fix(leaderboard): implement calcLeaderboardMetrics() — DOTS/XP/volume réels`
2. `fix(leaderboard): implement getLeaderboardPeriodKey() — weekly/monthly periods`
3. `fix(leaderboard): xp_week distinct from xp_alltime in syncLeaderboard`

---

## BUG 2 — engine.js : 0 try/catch sur fonctions GO critiques (CRITIQUE)

### Diagnostic
`wpComputeWorkWeight()`, `wpBuildWarmups()`, `wpGeneratePowerbuildingDay()` (toutes dans `app.js`, **pas** `engine.js`) — aucune protection contre logs malformés (import CSV Hevy raté, séance libre incomplète).

Risque : crash → GO bloqué → perte de séance → désinstallation.

### Fix
Trois wrappers `*Safe()` ajoutés à `app.js`, juste après `wpGeneratePowerbuildingDay`.
Fallbacks :
- `wpComputeWorkWeightSafe` : fallback `shadowWeight` ou 60 kg + log dans `error_logs`
- `wpGeneratePowerbuildingDaySafe` : fallback `{exercises: []}` (l'utilisateur voit une séance vide au pire, pas un crash)
- `wpBuildWarmupsSafe` : fallback warmups génériques `50/70/85% × 5/3/2` reps

### Call sites remplacés (12 au total)
- 9 appels internes à `wpGeneratePowerbuildingDay` basculés sur Safe variants
- 3 appels externes (`generateProgram` flow, ligne 19403) basculés sur Safe variants
- Les 3 appels restants sont à l'intérieur des Safe wrappers eux-mêmes (intentionnel)

### Commits
4. `fix(engine): safe wrappers for wpComputeWorkWeight/GeneratePowerbuildingDay/BuildWarmups`
5. `fix(app): use safe wrappers in GO tab — prevent crash on malformed logs`

---

## Tests Playwright — 23/23

### BUG 1 — Leaderboard Metrics (12 tests)

| Test | Résultat |
|---|---|
| LB-01 calcLeaderboardMetrics définie | ✅ |
| LB-02 DOTS > 0 avec bestPR valide (327) | ✅ |
| LB-03 xp_week (175) calculé depuis challenges complétés | ✅ |
| LB-04 xp (alltime) lit gamification.xp (5000) | ✅ |
| LB-05 xp_week !== xp | ✅ |
| LB-06 weekly key format YYYY-WNN | ✅ |
| LB-07 monthly key format YYYY-MM | ✅ |
| LB-08 alltime key === 'alltime' | ✅ |
| LB-09 sessions_week compte derniers 7j seulement | ✅ |
| LB-10 volume_week somme derniers 7j | ✅ |
| LB-11 sessions_month compte derniers 30j | ✅ |
| LB-12 supabase.js utilise metrics.xp_week | ✅ |

### BUG 2 — Safe Wrappers (11 tests)

| Test | Résultat |
|---|---|
| ENG-01 wpComputeWorkWeightSafe définie | ✅ |
| ENG-02 wpGeneratePowerbuildingDaySafe définie | ✅ |
| ENG-03 wpBuildWarmupsSafe définie | ✅ |
| ENG-04 Safe wrapper retourne nombre sur lift inconnu | ✅ |
| ENG-05 Safe wrapper retourne object avec exercises[] sur params null | ✅ |
| ENG-06 Safe wrapper retourne tableau sur weight=0 | ✅ |
| ENG-07 Safe wrapper résiste aux args undefined | ✅ |
| ENG-08 0 erreur console pendant chargement normal | ✅ |
| ENG-09 wpComputeWorkWeightSafe dans app.min.js | ✅ |
| ENG-10 wpGeneratePowerbuildingDaySafe dans app.min.js | ✅ |
| ENG-11 wpBuildWarmupsSafe dans app.min.js | ✅ |

**Total : 23/23 — 100%**

---

## Build

- `js/app.js` : SW_VERSION = `'trainhub-v182'`
- `js/app.min.js` : régénéré avec terser 5.47.1 (800 KB)
- `service-worker.js` : CACHE_NAME `trainhub-v181` → `trainhub-v182`

---

## Note d'architecture

Le prompt mentionnait `engine.js` comme cible des wrappers Safe, mais `wpComputeWorkWeight` / `wpBuildWarmups` / `wpGeneratePowerbuildingDay` vivent en réalité dans **app.js** (engine.js contient `computeDOTS`, `STORAGE_KEY`, et autres constantes — 0 fonction `wp*`). Les wrappers ont donc été ajoutés à `app.js` à proximité des fonctions sources.
