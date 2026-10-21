# Secondary Activities — Complete Diagnosis
Date: 2026-05-02  
Scope: js/engine.js, js/coach.js, js/app.js, index.html

---

## 1. How Secondary Activities Are Currently Stored

### Two Separate Arrays — Radically Different Shapes

The codebase has two distinct storage locations for secondary activities that are **not interchangeable**:

#### A. `db.user.secondaryActivities` — Onboarding strings only
- **Shape**: `string[]` — e.g. `['running', 'swimming', 'yoga']`
- **Set by**: `obSaveStep4()` at `app.js:1488`, which copies `_obSecondaryActivities` (populated by `obToggleSecondary()` at `app.js:1476`)
- **Keys used** (from `index.html:2159-2164`): `'running'`, `'cycling'`, `'swimming'`, `'yoga'`, `'team_sport'`, `'martial_arts'`
- **Migration guard**: `app.js:173` initializes as `[]` if missing
- **Default**: `[]` in the root user object at `app.js:83`
- **Fast-flow (q3)**: Hard-coded to `[]` at `app.js:1375` — new users who go through the quick onboarding never set activities at all

#### B. `db.user.activities` — Settings objects
- **Shape**: `{ type: string, intensity: number, duration: number, days: string[], fixed: boolean }[]`
- **Set by**: `addSettingsActivity()` at `app.js:12596`, `updateActivity()` at `app.js:12603`, `removeActivity()` at `app.js:12614`
- **Keys used** (from `ACTIVITY_TYPES` at `app.js:12511`): `'natation'`, `'course'`, `'trail'`, `'randonnee'`, `'velo'`, `'yoga'`, `'pilates'`, `'ski'`, `'arts_martiaux'`, `'sports_collectifs'`, `'autre'`
- **Migration guard**: `app.js:175` initializes as `[]` if missing
- **Day constraint**: UI allows only a **single day** per activity entry (select → `[value]`), despite the internal `days: string[]` array at `app.js:12605-12606`

#### C. `db.weeklyActivities` — Ad-hoc logged activities
- **Shape**: supposed to be `{ type, day, date, duration, intensity }[]`
- **Migration guard**: `app.js:176` initializes as `[]`
- **Written**: **Never.** No code path calls `.push()` on `db.weeklyActivities`. It is always an empty array.
- **Read by**: `computeWeeklyActivityScore()` at `engine.js:1670`, `wpCheckActivityConflicts()` at `app.js:16177`

### Conclusion
There are three storage locations. `secondaryActivities` and `activities` serve different parts of the system. `weeklyActivities` is initialized but never populated, making the conflict-detection system partially blind.

---

## 2. TRIMP Calculation for Each Activity Type

### `calcActivityTRIMP(activity)` — `engine.js:3194`

```
TRIMP = duration × (intensity × 1.6) × cSpec × trailBonus
```

- `intensity` is a 1–5 scale, converted to RPE by `× 1.6` (giving RPE 1.6–8.0)
- `cSpec` = `ACTIVITY_SPEC_COEFFICIENTS[type]` at `engine.js:3154`:
  - `natation: 0.8` | `course: 1.2` | `trail: 1.4` | `randonnee: 1.0`
  - `velo: 1.0` | `yoga: 0.5` | `pilates: 0.5` | `ski: 1.3`
  - `arts_martiaux: 1.6` | `sports_collectifs: 1.5` | `autre: 1.0`
- `trailBonus = 1 + (elevGain / 1000)` only when `type === 'trail'` and `elevGain` is set

**Short-circuit**: `RECOVERY_ACTIVITIES = ['yoga', 'pilates']` always return 0 regardless of intensity (`engine.js:3168, 3202`). This is intentional.

**Recovery threshold**: `rpe < RECOVERY_RPE_THRESHOLD (3)` — i.e. intensity 1 also returns 0 (`engine.js:3169, 3202`).

### What works correctly
- Coefficient lookup and arithmetic are mathematically sound
- Trail elevation bonus is implemented
- Recovery activity short-circuit is consistent

### What is incomplete / broken

**Critical: Key mismatch between onboarding and coefficients**

| Onboarding key (HTML)  | Expected by `ACTIVITY_SPEC_COEFFICIENTS` | Outcome |
|------------------------|------------------------------------------|---------|
| `'running'`            | `'course'`                               | Falls through to default `1.0` (not `1.2`) |
| `'cycling'`            | `'velo'`                                 | Falls through to default `1.0` ✓ (same) |
| `'swimming'`           | `'natation'`                             | Falls through to default `1.0` (not `0.8`) |
| `'yoga'`               | `'yoga'`                                 | Matches ✓ |
| `'team_sport'`         | `'sports_collectifs'`                    | Falls through to default `1.0` (not `1.5`) |
| `'martial_arts'`       | `'arts_martiaux'`                        | Falls through to default `1.0` (not `1.6`) |

Three keys are wrong: running/course, swimming/natation, team_sport/sports_collectifs, martial_arts/arts_martiaux.

**Critical: Wrong array used in TDEE calculation**

`estimateTDEE()` at `engine.js:1036-1039` reads `db.user.secondaryActivities` (the string array from onboarding) and calls `calcActivityTRIMP(a)` on each string `a`. Inside `calcActivityTRIMP`, `a.type` is `undefined` for a string, so `cSpec` always falls back to `1.0`, `a.duration` is `undefined` → defaults to `45`, and `a.intensity` is `undefined` → defaults to `3`. The calculation produces a **fabricated TRIMP** (45 × 4.8 × 1.0 = 216) for every selected onboarding activity regardless of what it actually is.

---

## 3. How TRIMP Feeds Into ACWR (`computeSRS`, `calcWeeklyTRIMPForce`)

### `calcWeeklyTRIMPForce(logs)` — `coach.js:289`

Computes SBD-only TRIMP from logged sessions over the past 7 days:
```
TRIMP_SBD = Σ(reps × RPE² × cSlot) / 15
```
- `cSlot`: primary=1.5, isolation=1.0, other=1.2
- Warmup and back-off sets excluded
- Division by 15 normalizes to Bannister cardio TRIMP scale (comment at `coach.js:304`)

### `calcChronicTRIMPForce(logs)` — `coach.js:308`

Same formula over 28 days, then divided by 60 (= weekly average ÷4, normalized ÷15).

### `computeSRS()` — `coach.js:353`

Combines SBD TRIMP with external activity load:
```
acute  = acuteSBD  + acuteExt
chronic = chronicSBD + chronicExt + 1
ACWR = acute / chronic
```

`acuteExt` and `chronicExt` are calculated by `getActivityEffVol()` at `coach.js:366`, which:
1. Reads `db.weeklyActivities` (always empty — see §1C)
2. Reads `db.user.activities` fixed activities and estimates occurrences

`computeActivityScore()` at `engine.js:1618` is used for external load:
```
score = duration × intensityMult × impactFactor
```
with a 0.7 coefficient applied before adding to ACWR.

### ACWR Scoring — `coach.js:392`
- 0.8–1.2 → score 100 (optimal powerbuilding zone)
- 1.2–1.4 → linear decay 100→60
- Otherwise → `max(0, 100 - |1.0 - acwr| × 160)`

### Final score weights — `coach.js:434-440`
- **With HRV**: ACWR 40%, HRV 30%, Readiness 15%, Trend 15%
- **Without HRV**: ACWR 60%, Readiness 20%, Trend 20%

### What works correctly
- SBD TRIMP formula is mathematically correct
- ACWR normalization and zone bounds are sensible
- Critical cap (score ≤ 40 when ACWR > 1.6 or TRIMP > 600) is implemented (`coach.js:463-476`)
- Recovery bonus from yoga/pilates the day before adds +5% (`coach.js:451-454`)

### What is incomplete / inconsistent

- **`db.weeklyActivities` is always empty**, so `acuteExt` / `chronicExt` are always 0 from logged activities. Only fixed activities in `db.user.activities` contribute.
- **`computeActivityScore()` and `calcActivityTRIMP()` use different formulas** for the same activities. `computeActivityScore` uses `ACTIVITY_IMPACT_FACTORS` + `ACTIVITY_INTENSITY_MULT`; `calcActivityTRIMP` uses `ACTIVITY_SPEC_COEFFICIENTS` + `intensity * 1.6`. These are not normalized to the same scale — no documentation explains the relationship.
- The `+ 1` guard in `chronic = chronicSBD + chronicExt + 1` prevents division by zero but also skews ACWR for new users.

---

## 4. How Penalty Flags Work (`getActivityPenaltyFlags`, `getSecondaryTRIMPLast24h`)

### `getSecondaryTRIMPLast24h()` — `engine.js:3212`

1. Gets `db.user.activities` (settings objects only)
2. Identifies "yesterday" using `new Date().getDay()` (JS day index, 0=Sunday)
3. Converts to French day name (`dayNames` array)
4. Sums `calcActivityTRIMP(act)` for all `fixed` activities whose `days` array includes yesterday's name

### `getActivityPenaltyFlags()` — `engine.js:3590`

Returns `{ trimp24h, flags[] }` where flags can be:

| Trigger | Flag type | Effect |
|---------|-----------|--------|
| trimp24h ≥ 400 (HEAVY) | `volume` | `reduction: 1`, `removeAccessories: true` |
| trimp24h ≥ 300 (MODERATE) | `volume` | `reduction: 0.5` |
| Today: arts_martiaux in peak/intensification | `warning` | Text warning |
| Today: natation intensity > 6 | `shoulder` | `reduction: 0.20` on shoulder accessories |

Note: `intensityThreshold: 6` in `ACTIVITY_INTERFERENCE_RULES` (`engine.js:3173-3177`) is never reachable because `intensity` is stored as 1–5. The natation shoulder penalty flag is thus **dead code**.

### How penalty flags are applied

**In APRE weight calculation** — `app.js:15810-15813`:
```js
var _volFlag = _actPenalties.flags.find(f => f.type === 'volume' && f.reduction >= 1);
var _actMult = _volFlag ? 0.97 : 1.0;
```
- Only a `reduction >= 1` (HEAVY threshold) triggers the multiplier, and then it is only **0.97** (3% reduction) despite the flag saying "removeAccessories"
- The `reduction: 0.5` (MODERATE) flag **has no effect** — `_actMult` remains `1.0`
- Accessories are not actually removed — `removeAccessories: true` is never read anywhere

**In SRS computation** — `coach.js:459-476`:
- If `activityFlags.trimp24h > 600` (CRITICAL), score is capped at 40 and `forceActiveRecovery: true`

**In Coach tab display** — `app.js:13749-13776`:
- "Budget Récupération" card appears when `trimp24h > 0` or `flags.length > 0`

### What is incorrect

- `RECOVERY_RPE_THRESHOLD = 3` (`engine.js:3169`) means intensity 1 (RPE 1.6) returns 0 TRIMP, but so does intensity 1 exactly (1×1.6 = 1.6 < 3). Intensity 2 (RPE 3.2) does contribute. The condition is `rpe < 3`, so intensity 2 (3.2) ≥ 3 — it contributes. This is correct but not obvious.
- The natation intensity check at `engine.js:3622` compares `act.intensity > rule.intensityThreshold (6)`. Since `intensity` is 1–5, this is unreachable — the shoulder flag is **never triggered**.
- `removeAccessories: true` is set on HEAVY flags but never consumed anywhere in the codebase.
- MODERATE volume flag (`reduction: 0.5`) is never applied to weights — it is rendered in the UI only.

---

## 5. How Activities Appear in the Programme (Automatic Injection on Secondary Days)

### `_injectSecondaryActivities(days)` — `app.js:12543`

Called at `app.js:17533` inside `generateWeeklyPlan()`, **after** all training days and deload adjustments have been computed.

Logic:
1. Reads `db.user.activities` (settings objects with `fixed: true`)
2. For each `fixed` activity, for each `dayName` in `act.days`:
   - Finds the matching day in `days[]` array
   - **Only injects if the day is a rest day** (`existing.rest === true`)
   - Sets `rest: false`, title to `emoji + label`, `isSecondaryActivity: true`
   - Creates a single exercise entry of type `'cardio'` with `durationMin` and `rpe = act.intensity`

### What works correctly
- Injection is correctly placed after training days and deload — no risk of overwriting a training day
- `isSecondaryActivity: true` flag is set on both the day and the exercise object
- Elevation gain annotation is included in `coachNote` if present

### What is incomplete / inconsistent

- **Injection reads `db.user.activities` but penalty flags read `db.user.activities` too.** These are consistent — but the onboarding `db.user.secondaryActivities` is **never used** for injection. The activities set during onboarding (step 4) are cosmetic: they influence nothing in the programme display.
- **Onboarding never creates `db.user.activities` entries.** A user who selects "Natation" during onboarding gets `secondaryActivities: ['swimming']` but `activities: []`. The injection, TRIMP, and penalty systems all read `activities` — they see nothing.
- Activities only occupy **rest days**. If a user has swimming on Wednesday and Wednesday is a training day, the injection silently skips it with no feedback.
- The settings UI allows only **one day per activity** (app.js:12605-12606: `days = [value]`). Despite `days: string[]` being an array, multi-day assignments are not supported in the UI.

---

## 6. How the User Logs a Secondary Activity (UI)

### Configuration path (persistent, scheduled)

Settings tab → "Activités complémentaires" section (`index.html:2694-2704`):
- `addSettingsActivity()` adds a new entry with defaults (`natation`, intensity 2, 60min, no day)
- `renderSettingsActivities()` renders type/intensity/duration/day dropdowns
- `updateActivity()` saves changes; `removeActivity()` removes
- **The day picker is a single `<select>` — only one day assignable per entry**
- These persist in `db.user.activities`

### Onboarding path (type selection only, no detail)

Onboarding step 4 (`index.html:2154-2168`, `app.js:1476-1491`):
- Six buttons: Course, Vélo, Natation, Yoga, Sport collectif, Arts martiaux
- Saved as string list in `db.user.secondaryActivities`
- **No intensity, duration, or day assignment at this step**
- **These entries are never read by any computation engine**

### Ad-hoc logging (not implemented)

`db.weeklyActivities` is initialized at `app.js:176` and read in `computeWeeklyActivityScore()` and `wpCheckActivityConflicts()`. However:
- There is **no UI to add entries** to `db.weeklyActivities`
- There is **no function that pushes to `db.weeklyActivities`**
- The array is always empty at runtime

### What the user actually experiences

A user cannot log "I did a 45-min run today" as a one-off event. The only interaction is:
1. Onboarding: pick activity types (stored but unused by all engines)
2. Settings: configure scheduled activities with day/duration/intensity (used by all engines but UI is limited to one day per entry)

There is no workout-log-style entry for secondary activities. The conflict detection and ACWR boost from `weeklyActivities` are always zero.

---

## 7. How Garmin Data Maps to Activities (`calcTRIMPFromGarminZones`)

### `calcTRIMPFromGarminZones(zonesData, activityType)` — `engine.js:3253`

```js
GARMIN_ZONE_WEIGHTS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 }
TRIMP = Σ(minutes_in_zone × zone_weight) × cSpec
```

Where `cSpec` is looked up from `ACTIVITY_SPEC_COEFFICIENTS[activityType]`.

### What the Garmin integration actually does

The `parseGarminCSV()` function at `app.js:13178` only extracts **resting heart rate (RHR)** from the CSV. It:
- Parses lines matching patterns for `resting_heart_rate` or `fc_repos`
- Stores results in `db.rhrHistory`
- Sets `db.garminConnected = true` and `db.garminLastSync`
- Calls `analyzeRHR()` to generate an alert

The Garmin integration does **not** import:
- Heart rate zones (zone 1–5 minutes)
- Activity type
- Session duration or intensity

### Critical finding: `calcTRIMPFromGarminZones` is orphaned

`calcTRIMPFromGarminZones()` is defined at `engine.js:3253` but **called nowhere in the codebase**. `grep` across all four main files returns only the definition. It was designed to receive a `zonesData` object (`{ '1': minutes, '2': minutes, ... }`) but no import path produces such an object. The function is dead code.

### RHR penalty path (what does work)

The only Garmin → workout effect is via RHR:
- `analyzeRHR()` at `app.js:13220` computes delta vs 7-day average
- Stores `db.todayWellbeing.rhrAlert` with levels `'warning'` (diff ≥ 5bpm) or `'danger'` (diff ≥ 10bpm)
- `app.js:15801-15808` applies a multiplier: danger → 0.80, warning → 0.95 on the weight prescription

---

## 8. The "Budget Récupération" Card in the Coach Tab

### Where it lives

In `renderCoachTodayHTML()` at `app.js:13748-13776`, block "0b. BUDGET RÉCUPÉRATION".

### What it displays

A stacked horizontal bar showing:
- **Blue segment**: "Muscu %" — estimated as `300 × (srs.score / 100)`
- **Orange segment**: "Activités %" — `actData.trimp24h` (yesterday's fixed activities TRIMP)
- Below: a list of flags from `getActivityPenaltyFlags()`

### What is wrong with the calculation

```js
var _muscuTRIMP  = Math.round(300 * (_srs.score / 100)); // app.js:13753
var _secTRIMP    = _actData.trimp24h;                     // app.js:13754
var _totalTRIMP  = _muscuTRIMP + _secTRIMP + 1;
```

- `_muscuTRIMP` is **not actual training TRIMP**. It is a proxy derived from the SRS score (300 × score%). SRS is a composite of ACWR, readiness, HRV, and trend — not a raw TRIMP value. A score of 75 → 225 "muscu TRIMP" regardless of whether the user trained.
- The card is labeled "Budget Récupération" but shows a ratio of two disconnected metrics, creating the visual illusion of a meaningful load distribution.
- The card **only appears when `trimp24h > 0 OR flags.length > 0`** (`app.js:13751`). If the user has no `fixed` activities in settings, the card never appears. Most users (who only used onboarding step 4) see no card at all.

### What the user actually experiences

- New user (onboarding only): no card ever shown, no activity-related coach advice
- Settings user with one fixed activity: card appears on the day after that activity's scheduled day
- The bar segments have no fixed scale — a 90% muscu / 10% activités vs 50/50 is entirely a function of that day's SRS score, not actual logged load

---

## Summary Table

| Feature | Status |
|---------|--------|
| Onboarding activity selection (`secondaryActivities`) | Stored but **never used** by any engine |
| Key mapping: onboarding strings vs coefficient keys | **Broken** — 4/6 keys mismatch |
| `db.user.activities` settings UI | Works, but limited to 1 day/entry |
| `calcActivityTRIMP()` formula | Correct for settings objects; **silently wrong** for onboarding strings |
| TDEE uses `secondaryActivities` with `calcActivityTRIMP` | **Type error** — strings passed as activity objects |
| `getSecondaryTRIMPLast24h()` reads `activities` | Correct field, correct formula |
| ACWR external load (`getActivityEffVol`) | Only reads `db.user.activities`; `weeklyActivities` is always empty |
| Penalty flag: HEAVY volume (≥400 TRIMP) | Applied but only 3% weight reduction (not accessory removal) |
| Penalty flag: MODERATE volume (≥300 TRIMP) | **Never applied** to weights, display only |
| Penalty flag: natation shoulder | **Dead code** — intensity threshold 6 unreachable (scale 1–5) |
| `removeAccessories: true` flag | **Never consumed** |
| `_injectSecondaryActivities()` | Correct logic, reads `activities`, only fills rest days |
| Onboarding activities → programme injection | **Not connected** — `secondaryActivities` not injected |
| Ad-hoc activity logging UI | **Does not exist** |
| `db.weeklyActivities` population | **Never written** — always empty |
| `calcTRIMPFromGarminZones()` | **Dead code** — never called |
| Garmin CSV import | Imports RHR only, not heart rate zones |
| Budget Récupération card | Appears only with `activities` entries; muscu % is a proxy not actual TRIMP |

---

## Key Bugs by Severity

### Critical (silent wrong behavior)
1. **`estimateTDEE()` calls `calcActivityTRIMP(string)`** (`engine.js:1038-1039`): `a.type` is undefined, fabricates 216 TRIMP per activity for Katch-McArdle users with fat%. Only affects users who have `db.user.fatPct` set.
2. **Onboarding activity selections do nothing**: all downstream systems read `db.user.activities`, not `db.user.secondaryActivities`. After onboarding step 4, the selections are dead.
3. **Key mismatch**: `'running'` → missing coefficient (defaults to 1.0 instead of 1.2), `'swimming'` → 1.0 instead of 0.8, `'team_sport'` → 1.0 instead of 1.5, `'martial_arts'` → 1.0 instead of 1.6.

### High (functionality missing)
4. **`db.weeklyActivities` is never written**: all ad-hoc activity load is invisible to ACWR and conflict detection.
5. **`removeAccessories: true` is never consumed**: heavy-load penalty does not reduce volume.
6. **MODERATE volume flag (reduction: 0.5) is never applied to weights**: coach message shows but training load is unchanged.
7. **`calcTRIMPFromGarminZones()` is dead code**: heart rate zones from Garmin are neither imported nor used.

### Medium (inconsistency)
8. **Natation shoulder penalty threshold unreachable** (`engine.js:3622`): `act.intensity > 6` with a 1–5 scale.
9. **Settings UI limited to one day per activity**: internal data model supports `days[]` but UI only allows single selection.
10. **Budget Récupération muscu % is not TRIMP**: it is `300 × SRS%`, a composite score proxy.
11. **Two TRIMP formulas** (`calcActivityTRIMP` vs `computeActivityScore`) for the same activities: not normalized, different purposes but used in overlapping contexts without documentation.
