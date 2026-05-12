# Fix generateWeeklyPlan — days populated for powerbuilding avancé — v213 → v214

## Symptôme

Pour le profil `powerbuilding`, niveau `avancé`, `freq=5`, `phase=hypertrophie`,
`selectedDays=[Lundi, Mardi, Jeudi, Vendredi, Samedi]` :

- `generateWeeklyPlan()` était appelée plusieurs fois (coachNotes accumulées)
- `weeklyPlan.days` existait mais chaque jour d'entraînement avait `exercises: []`
- L'app affichait les titres des séances (depuis `db.routine`) mais "Aucun détail disponible"
  lors de l'ouverture d'une séance

---

## Analyse Root Cause

### Crash silencieux dans `wpGeneratePowerbuildingDay()`

`wpGeneratePowerbuildingDaySafe()` encapsule `wpGeneratePowerbuildingDay()` et retourne
`{ exercises: [] }` sur toute exception. Le crash se produisait à l'intérieur de
`wpGeneratePowerbuildingDay()` sans être détecté avant le wrapper Safe.

**Crash primaire** — `computeStrengthRatios()` (app.js ~13689), appelé sans try/catch à la
ligne ~21573 :

```js
// AVANT — crash si un log a exercises:undefined
db.logs.forEach(log => {
  log.exercises.forEach(exo => {  // TypeError si log.exercises est undefined
```

N'importe quel log malformé (import raté, entrée fantôme, migration incomplète) provoquait
un `TypeError: Cannot read properties of undefined (reading 'forEach')`. Ce crash était
propagé jusqu'au wrapper Safe qui renvoyait `exercises: []` pour tous les jours.

**Bug secondaire (latent)** — Leg Overreach (app.js ~21663), actif après ≥2 macrocycles :

```js
// AVANT — NaN si exo.sets est un Array (ce qu'il est dans le format DUP)
sets: Math.round((exo.sets || 3) * multiplier)
// Array || 3 → Array (truthy), Math.round(Array * float) → NaN
```

### Accumulation de coachNotes

`generateProgram()` (onboarding) push des notes sur `db.weeklyPlan.coachNotes`. Comme
`generateWeeklyPlan()` ne réinitialisait pas ce tableau, chaque appel cumulait les notes
de l'appel précédent sur l'ancien objet `db.weeklyPlan`.

### Pourquoi les titres apparaissaient sans les exercices

`db.routine` est rempli à la ligne ~22218 (avant que le plan crashe et soit sauvegardé),
tandis que `db.weeklyPlan = plan` n'intervient qu'à la ligne ~22551. `renderProgDaysList`
lit les titres depuis `db.routine` mais les exercices depuis `db.weeklyPlan.days`.

---

## Correctifs

### FIX1 — Guard null sur `log.exercises` dans `computeStrengthRatios()` (app.js ~13693)

```js
// AVANT
db.logs.forEach(log => {
  log.exercises.forEach(exo => {

// APRÈS
db.logs.forEach(log => {
  (log.exercises || []).forEach(exo => {
```

### FIX2 — try/catch défensif autour de l'appel `computeStrengthRatios()` (app.js ~21573)

```js
// AVANT
var _imbalanceRatios = typeof computeStrengthRatios === 'function' ? computeStrengthRatios() : null;

// APRÈS
var _imbalanceRatios = null;
try { _imbalanceRatios = typeof computeStrengthRatios === 'function' ? computeStrengthRatios() : null; } catch(e) {}
```

### FIX3 — Leg Overreach : `exo.sets` Array → count (app.js ~21672, ~21683)

```js
// AVANT
sets: Math.round((exo.sets || 3) * _overreach.legsVolumeMultiplier)

// APRÈS
var _setSrc = Array.isArray(exo.sets) ? exo.sets.length : (exo.sets || 3);
sets: Math.round(_setSrc * _overreach.legsVolumeMultiplier)
```

Idem pour la branche Upper Day.

### FIX4 — Reset `coachNotes` en début de `generateWeeklyPlan()` (app.js ~22183)

```js
db.weeklyPlan.currentBlock.phase = phase;
db.weeklyPlan.coachNotes = [];   // ← nouveau : reset à chaque régénération
```

---

## Tests Playwright

| Test | Vérifie |
|---|---|
| WP-01 | `generateWeeklyPlan()` powerbuilding avancé freq=5 → 5 jours d'entraînement, aucun avec `exercises:[]` |
| WP-02 | `computeStrengthRatios()` ne crash pas quand `log.exercises` est `undefined` ou `null` |

> Fichier : `tests/audit-generateweeklyplan-v214.spec.js` (2 tests)

## SW

SW reste `trainhub-v213` — pas de changement d'assets.
