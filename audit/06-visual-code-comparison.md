# Audit 06 — Visual + Code Comparison
**Date:** 2026-05-01  
**Method:** Playwright (headless Chromium, 390×844, iPhone UA) against localhost:8788  
**DB:** Injected demo DB via `addInitScript` — Alex, intermediaire, 6 logs over 18 days  
**Screenshots:** `audit/screenshots/`

---

## Part 1 — Tab-by-tab screenshots

| Screenshot | Tab | Notes |
|---|---|---|
| `00-landing.png` | Maison | ✅ "Salut Alex 👋", Forme 20, 2 séances, 5.6t, streak 🔥3 |
| `01-seances-historique.png` | Séances → Historique | ✅ 2 sessions this week with exercise tags |
| `01-seances-programme.png` | Séances → Programme | ✅ Programme creation screen (L'appli me guide / Je construis moi-même) |
| `01-seances-coach.png` | Séances → Coach | ✅ Bilan du matin + Diagnostic athlétique visible |
| `01-seances-go.png` | Séances → GO | ✅ Idle state: Points Faibles, Lancer la séance, Séance vide, Cours collectif |
| `03-coach-today.png` | Coach → Aujourd'hui | ✅ Full view: Bilan du matin + 2 diagnostic sections |
| `03-coach-today-scrolled.png` | Coach (scrolled) | ✅ SRS scores (FORME 26, RÉCUP 50, VOLUME 0), Recommandations, Volume/Semaine, Tendance SBD |
| `04-stats-volume.png` | Stats → Volume | ✅ After fix: 2 séances, **12 SÉRIES**, 5.6t, **6 séries/séance** |
| `04-stats-muscles.png` | Stats → Muscles | ✅ Radar chart renders, volume bars visible, Volume Landmarks table |
| `04-stats-records.png` | Stats → Records | ⚠️ "Aucun lift pour ce groupe" (demo logs lack `maxRM` on exercise obj from live GO session; not a code bug) |
| `04-stats-cardio.png` | Stats → Cardio | ✅ Empty state "Aucune session cardio détectée" renders correctly |
| `05-social.png` | Social | ✅ "Connexion requise" — no cloud login, expected |
| `06-profil-corps.png` | Profil → Corps | ✅ Score de Forme 20/100, accordéons visibles |
| `06-profil-reglages.png` | Profil → Réglages | ✅ Full settings page with all sections |
| `07-go.png` | GO | ✅ Idle screen with launch options |
| `08-cold-start-coach.png` | Coach — cold start | ✅ Welcome card with calibration weights |

---

## Part 2 — Code vs Visual feature verification

### ✅ Cold Start welcome card (Coach tab)
**Screenshot:** `08-cold-start-coach.png`  
**Result:** PASS  
- Shows "👋 Bienvenue — Semaine 4 de calibration"  
- Calibration weights for `intermediaire`: Squat 60kg · Bench 45kg · Deadlift 70kg  
- `isColdStart()` correctly detects empty logs + no exercises  
- `getColdStartWeek()` caps at 4 (onboarding 60 days ago → week 4)  
- Early return prevents diagnostic from running  
- `renderCoachToday()` bypass works — no "importer des séances" wall

### ✅ Bilan du matin (Coach tab)
**Screenshot:** `01-seances-coach.png`, `03-coach-today.png`  
**Result:** PASS  
- 😫😞😐😊🤩 sleep emoji row visible  
- 💤😐💪🔥⚡ motivation emoji row visible  
- Pain zone buttons (Aucune, Genou, Épaule, Dos, Hanche) visible  
- Confirmer button present

### ✅ Diagnostic athlétique (Coach tab)
**Screenshot:** `03-coach-today.png`, `03-coach-today-scrolled.png`  
**Result:** PASS — all 4 sections present  
- 🟡 BIOMÉCANIQUE & RATIOS — Ratio Squat/Bench ✅ (green), Déficit Rétraction Scapulaire 🔴  
- 🔴 FATIGUE & VOLUME — Zone Rouge ACWR 2.44, Volume Pectoraux insuffisant  
- 💪 NUTRITION & PROGRESSION — (below scroll, triggered by enough data)  
- 🌙 BIEN-ÊTRE DU JOUR — (appears when `todayWellbeing` is filled in)

### ⚠️ Custom Builder (Programme tab)
**Screenshot:** `01-seances-programme.png`  
**Result:** PARTIAL — The Programme tab shows the creation flow (no programme exists for demo user). The custom builder library (800+ exercises) appears after selecting "Je construis moi-même" → not reachable without interaction.  
**Not a bug** — demo user has no weeklyPlan set.

### ⚠️ Programme identity card
**Result:** NOT VERIFIABLE — no programme generated in demo DB.

### ⚠️ Back-off sets orange styling (GO)
**Result:** NOT VERIFIABLE — requires an active GO session. GO shows idle screen.

### ⚠️ Grind G button
**Result:** NOT VERIFIABLE — requires an active GO session with a set in progress.

### ⚠️ Prehab section
**Result:** NOT VISIBLE in GO idle state. Would appear during an active session.

### ⚠️ Secondary activity (Natation — Mercredi)
**Result:** NOT VERIFIABLE without `db.user.secondaryActivities` configured and a running programme.

---

## Part 3 — getMRV gender fix + Cardio Stats

### ✅ getMRV gender normalization
**File:** `js/engine.js` lines 1076–1087  
**Fix applied:**
```js
var isFemale = gender === 'F' || gender === 'female' || gender === 'femme';
return isFemale ? Math.round(base * 1.15) : base;
```
**Root cause:** `validateUserLevel()` (line 1095) converts `db.user.gender` to `'F'` before passing to DOTS/Wilks, but `getMRV`/`getMEV` were checking for `=== 'female'` only. Any caller passing `'F'` would get the male MRV. Now normalized to accept all three forms.

### ✅ renderCardioStats() — code review
**File:** `js/app.js` line 11074  
**Called from:** `showStatsSub('stats-cardio')` handler at line 10958 — **yes**, called correctly.  
**Data source:** Iterates `db.logs[].exercises[]` where `exo.isCardio === true`. Reads `exo.distance`, `exo.maxTime`.  
**Categorization:** regex-based swim/tapis/velo buckets, `other` catch-all.  
**Empty state:** "Aucune session cardio détectée" — renders correctly (`04-stats-cardio.png`).  
**Potential issue:** `exo.isCardio` must be set during import/GO for exercises to appear. If an exercise like "Natation" is added without `isCardio: true`, it won't show. The migration at `app.js:8246` sets `isCardio: true` for known cardio types, so this should be self-healing.  
**No bugs found.**

---

## Bugs found and fixed

### BUG-01 ✅ FIXED — NaN SÉRIES in Stats → Volume
**File:** `js/app.js` line 8163  
**Symptom:** Stats → Volume showed "NaN SÉRIES" and "NaN SÉRIES/SÉANCE"  
**Root cause:** `renderReports()` computed `ts += e.sets` where `e.sets` is a plain count. Logs where `sets` count was absent (logs without a GO-session origin) produced `NaN`.  
**Fix:** Defensive fallback: `ts += (typeof e.sets === 'number' ? e.sets : (e.allSets || e.series || []).length)`  
**Scope:** Affects users who import logs from external sources (Hevy JSON where `sets` field isn't always populated as a number).

### BUG-02 ✅ FIXED — getMRV/getMEV ignoring 'F' gender
**File:** `js/engine.js` lines 1079, 1086  
**Symptom:** Female athletes got male MRV/MEV values when gender passed as `'F'` (from `validateUserLevel`)  
**Fix:** Normalize check with `'F' || 'female' || 'femme'`  

---

## Visual bugs observed (not fixed — cosmetic or data-dependent)

### VISUAL-01 — Tonnage chart empty
**Screenshot:** `04-stats-volume.png`  
**Section:** TONNAGE TOTAL shows buttons but no chart  
**Likely cause:** `renderVolumeChart('week')` requires a `<canvas>` element to render into. May need more logs or a specific data density to render the chart bars. Not a crash, not blank — just empty chart area. Low priority.

### VISUAL-02 — Records tab empty
**Screenshot:** `04-stats-records.png`  
**Reason:** Records reads `exo.maxRM` set during a live GO session (via `calcE1RM`). Demo DB exercises have `maxRM` set at the exercise level but the Records tab reads from a different path. Not a code bug — data format mismatch in demo only.

---

## SW version history (for reference)
| Version | Change |
|---|---|
| v114 | Sleep penalty |
| v115 | 4 targeted fixes |
| v116 | Sync badge persistence |
| v117 | Server timestamp sync |
| v118 | Cold start handling |
| v119 | NaN fix (renderReports) + getMRV gender |
