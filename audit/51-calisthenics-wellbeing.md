# Calisthenics + Bien-être Senior — v208

## Source : validation Gemini — SkillTree + senior + stress

## Systèmes livrés

### SYSTÈME 1 — SkillTree Calisthenics

**`CALISTHENICS_SKILL_TREE`** : 4 mouvements (push, pull, core, legs) × jusqu'à 10 steps.

Chaque step : `{ step, name, repsTarget, type, holdSec?, startKg?, assistKg? }`.
Types : `bw`, `weighted`, `assisted`, `hold`, `skill`, `explosive`.

**`getCalisthenicCurrentStep(movement)`** : retourne `{ step, reps }` (défaut step 1, reps 0).

**`validateCalisthenicStep(movement, repsAchieved)`** :
- Si `repsAchieved >= step.repsTarget` → débloque step+1 (toast "🔓 ... débloqué : <nextName> !")
- Sinon → mémorise les reps partielles dans `db.calisthenicProgress[movement]`

**DUP Calisthenics** : `DUP_SEQUENCE.calisthenics` avec sous-niveaux :

| Niveau | Freq | Séquence |
|---|---|---|
| debutant | 3 | hypertrophie, hypertrophie, skill |
| debutant | 4 | hypertrophie, skill, hypertrophie, skill |
| intermediaire | 4 | force, hypertrophie, skill, hypertrophie |
| intermediaire | 5 | force, hypertrophie, skill, hypertrophie, force |
| avance | 5 | force, force, skill, hypertrophie, force |
| avance | 6 | force, force, skill, hypertrophie, force, vitesse |

`skill` = tentative du step suivant (reps basses, technique).
`hypertrophie` = step actuel en reps hautes.

---

### SYSTÈME 2 — Bien-être Senior

**`SENIOR_ADAPTATIONS`** (Gemini validé) :
```js
{
  restMultiplier: 2.0,
  preferMachines: true,
  unilateralPerSession: true,
  maxRPE: 7,
  maxSetsPerExo: 3,
  cardioMax: 20
}
```

**`applyAgeAdaptations(exercises)`** : active si `db.user.age >= 60`.
- Double `set.restSeconds` (ou `exo.rest` scalaire)
- Cape `targetRPE` et `rpe` à 7
- Stamp `exo._seniorAdapted = true`

Appliqué dans `wpGeneratePowerbuildingDay()` juste après `applyShoulderFilter()`.

---

### SYSTÈME 3 — Auto-réduction stress

**`getStressVolumeModifier()`** :
- `_wb.stress >= 4` (champ explicite) → 0.80
- `_wb.motivation <= 2 && _wb.sleep <= 3` (proxy) → 0.80
- Sinon → 1.0

Appliqué dans `wpGeneratePowerbuildingDay()` après senior :
- Mappe chaque `exo` avec `_stressAdapted: true`, `_volumeMod`, `coachNote: '🧘 Volume réduit (-20%)...'`

---

### SYSTÈME 4 — Mode Instinct universel

**`startInstinctSession(mode)`** :
- mode `bien_etre` ou `calisthenics` → "Séance Plaisir 🌟"
- Sinon → "Mode Instinct 🎲"
- Flags : `db._instinctMode = true`, `db._lastInstinctSession = Date.now()`
- Délègue à `goStartWorkout(false)` (séance libre)
- Toast 5s avec label + description

---

## Tests : 8 invariants Playwright

| Groupe | Tests | Status |
|---|---|---|
| CALI-01..03 | currentStep + validate + DUP debutant 3d | ✅ |
| SENIOR-01..02 | adapt vs no-op selon âge | ✅ |
| STRESS-01..02 | modifier 0.80 vs 1.0 | ✅ |
| INSTINCT-01 | flags + toast | ✅ |

> Tests Playwright : `tests/audit-calisthenics-wellbeing-v208.spec.js` (8 tests).

## SW v207 → v208
