# Audit v182 — Leaderboard + Engine Guards

**Date** : 2026-05-10
**Version** : `trainhub-v182`
**Branche** : `claude/audit-ble-watch-app-7O2cs` → mergée sur `main` (PR #153)

---

## Fixes v182 validés

| Fix | Localisation | Test | Résultat |
|---|---|---|---|
| `calcLeaderboardMetrics()` implémentée | `app.js:3391` | LB-01/02/03/04/05 | ✅ |
| `getLeaderboardPeriodKey()` implémentée | `app.js:3446` | LB-06/07 | ✅ |
| `xp_week` distinct de `xp` dans `syncLeaderboard` | `supabase.js:208` | LB-04 | ✅ |
| `wpComputeWorkWeightSafe` | `app.js:18887` | ENG-01 | ✅ |
| `wpGeneratePowerbuildingDaySafe` | `app.js:18913` | ENG-02 | ✅ |
| `wpBuildWarmupsSafe` | `app.js:18925` | ENG-03 | ✅ |
| 0 erreurs console avec logs corrompus | — | ENG-03 | ✅ |

---

## Tests Playwright : 10/10

### LB — Leaderboard Metrics (7 tests)

| Test | Valeur observée | Résultat |
|---|---|---|
| LB-01 `calcLeaderboardMetrics()` définie | fonction globale présente | ✅ |
| LB-02 `dots > 0` avec bestPR 148+116+195 / bw=85 | **306** | ✅ |
| LB-03 `xp_week` = 200 (1 challenge complété × 200 XP) | **200** | ✅ |
| LB-04 `xp_week` ≠ `xp` (200 ≠ 15000) | distinct | ✅ |
| LB-05 `sessions_week` = 2 (J-40 exclu) | **2** | ✅ |
| LB-06 `getLeaderboardPeriodKey('weekly')` format YYYY-WNN | `2026-W19` | ✅ |
| LB-07 `getLeaderboardPeriodKey('monthly')` format YYYY-MM | `2026-05` | ✅ |

### ENG — Safe Wrappers (3 tests)

| Test | Valeur observée | Résultat |
|---|---|---|
| ENG-01 `wpComputeWorkWeightSafe` logs corrompus → nombre | **60** (fallback) | ✅ |
| ENG-02 `wpGeneratePowerbuildingDaySafe` params=null → objet | `{exercises:[]}` | ✅ |
| ENG-03 0 erreur console avec logs corrompus | **0** | ✅ |

---

## Vérifications statiques Section 1

### 1A — `calcLeaderboardMetrics()` (app.js:3391)
- `dots` via `computeDOTS(sq+bn+dl, bw, gender)` — ex bw=85 / total=459 → **306**
- `xp_week` = somme `xpReward` des challenges `completed:true`
- `xp` = `gamification.xp` (alltime)
- `sessions_week` / `volume_week` : filtre `now - timestamp <= 7×86400000`
- `sessions_month` : filtre `now - timestamp <= 30×86400000`

### 1B — `getLeaderboardPeriodKey()` (app.js:3446)
```
weekly  → 2026-W19  ✅ (ISO 8601, calcul UTC-Thursday)
monthly → 2026-05   ✅
alltime → 'alltime' ✅
```

### 1C — `supabase.js:208` XP weekly vs alltime
```
weekly  : metric:'xp', value: metrics.xp_week  ✅
alltime : metric:'xp', value: metrics.xp        ✅
```

### 1D — Safe wrappers (dans `app.js`, pas `engine.js`)
`engine.js` ne contient aucune fonction `wp*` — les wrappers sont en `app.js` proximité des fonctions sources. Conforme à la note d'architecture.

### 1E — 0 appels directs non-safe restants
```
grep résultat : 6 lignes totales
  3 × définitions wpXxxSafe()   (filtrées)
  3 × appels internes aux Safe  (attendu — c'est le corps des wrappers)
  0 × appels directs externes   ✅
9 call sites externes utilisent les Safe variants.
```

---

## Données Supabase — État post-fix (Aurélien)

> Dernière sync en base : **2026-05-04 16:36 UTC** (avant v182)
> Le fix sera effectif à la prochaine ouverture de l'app par Aurélien.

| Métrique | Valeur actuelle en base | Valeur attendue après resync |
|---|---|---|
| `dots` (alltime) | **0** ← bug antérieur | **~294** (474 kg / 98 kg bw) |
| `xp` (weekly 2026-W17) | **115 639** = xp alltime ← bug | XP challenges semaine seulement |
| `xp` (alltime) | **115 639** | inchangé |
| `streak` (alltime) | **96** | inchangé |
| `sessions` (monthly 2026-05) | **17** | inchangé |
| `period_key` weekly | `2026-W17` (format correct) | `2026-W19` (semaine courante) |

**Calcul DOTS Aurélien** : squat 148 + bench 140 + deadlift 186 = **474 kg** / bw 98 kg → `computeDOTS(474, 98, 'M')` = **294**

---

## Note d'architecture

- Les Safe wrappers (`wpComputeWorkWeightSafe`, `wpGeneratePowerbuildingDaySafe`, `wpBuildWarmupsSafe`) ont été ajoutés à `app.js` et non `engine.js`, car les fonctions `wp*` sources vivent dans `app.js`. `engine.js` contient uniquement `computeDOTS`, `STORAGE_KEY` et les constantes de calcul pur.
- 12 call sites remplacés (9 externes + 3 internes aux wrappers).

---

## Build

- `SW_VERSION` : `trainhub-v182`
- `js/app.min.js` : régénéré (terser 5.47.1, 800 KB)
- `service-worker.js` : `CACHE_NAME = 'trainhub-v182'`

---

## Verdict : leaderboard fonctionnel pour la bêta ? **OUI**

Tous les fixes sont en place et testés. Les données Supabase se mettront à jour automatiquement à la prochaine session utilisateur. Aucune correction supplémentaire nécessaire.
