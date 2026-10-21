# Fix DUP × Macrocycle v192

## Principe (Gemini validation)
"Le DUP ne dicte pas l'intensité absolue — il dicte la **fluctuation autour de la moyenne définie par le macrocycle**."

Avant v192 : `DUP_PARAMS.force` = toujours 3-5 reps à 80-85% quelle que soit la phase macrocycle. Le microcycle écrasait le macrocycle.

## Fixes

### Fix 1 — `getDUPForce/Volume/Vitesse(macroPhase, level)` ✅
Profils adaptatifs par phase :
- **force** : 5-8 reps (hypertrophie) → 3-5 (force) → 1-3 (peak)
- **volume** : 8-12 reps (hypertrophie) → 3-5 (peak taper)
- **vitesse** : 2-3 reps standard ; débutant → 8-10 reps technique

### Fix 2 — `DUP_SEQUENCE.powerbuilding_avance` (Gemini Option A) ✅
Avancé : triple Force consécutive sur S/B/D.
- 5j : `force/force/force/volume/vitesse`
- 4j : `force/force/volume/vitesse`
- 3j : `force/force/volume`

### Fix 3 — Wiring `dupProfileKey` dans `generateWeeklyPlan` ✅
Une séquence DUP résolue par semaine, key passé par jour à `wpGeneratePowerbuildingDaySafe`, résolu via `getDUPForce/Volume/Vitesse(phase, level)`. Stocké comme `dayData.dupProfileKey`.

### Fix 4 — Cardio plafonné à 20 min ✅
Cardio en fin de séance : 20 / 15 / 10 / 0 min selon temps restant (vs 45 min hardcodé).

### Fix 5 — Plancher accessoires 8 reps (5 pour variations techniques) ✅
Liste tech : Paused Squat, Spoto Press, Pin Squat, Dead Squat, Close Grip Bench, Pause Bench. Primaire exempté.

## Résultat pour Aurélien (avancé, phase Hypertrophie, PB 5j)

| Jour | Slot DUP | Reps | Poids (Bench 140 PR) |
|---|---|---|---|
| Lundi (Squat) | force | 7 | 75-80% e1RM |
| Mardi (Bench) | force | 7 | 75-80% e1RM |
| Jeudi (Dead) | force | 7 | 75-80% e1RM |
| Vendredi (Bench 2) | volume | 10 | 65-70% e1RM |
| Samedi (Squat 2) | vitesse | — | 60-65% e1RM |

## Tests : 10/10
- DUP-01..03 : getDUPForce returns correct reps/intensity per phase ✅
- DUP-04 : getDUPVolume('peak') reps [3,5] (taper) ✅
- DUP-05 : getDUPVitesse('hypertrophie','debutant') → Technique ✅
- DUP-06 : Bench force × hypertrophie → 7 reps ✅
- DUP-07 : Bench 2 volume × hypertrophie → 10 reps (≠ Bench 1) ✅
- DUP-08 : isCorrectivePriority — n/a (spec vague, skipped) ✅
- DUP-09 : Cardio max 20 min ✅
- DUP-10 : Accessoires reps ≥ 8 (5 pour tech variations) ✅

## SW bumpé → v192
