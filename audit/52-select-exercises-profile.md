# selectExercisesForProfile() — v209

## Source : validation Gemini — 7 règles universelles déterministes

## Architecture

`selectExercisesForProfile(exercises, profile)` est un filtre **déterministe
unique** appliqué juste avant le `return` de `wpGeneratePowerbuildingDay()`.
Il remplace les blocs hardcodés disséminés dans la chaîne de génération.

`buildProfileForSelection()` construit le profil à partir de `db.user` :
`{ duration, mode, injury, goals, age, stats }`. `stats` calcule
automatiquement `squatBenchRatio` et `deadliftSquatRatio` depuis `db.bestPR`.

---

## Les 7 règles

### RÈGLE 1 — Durée → plafond exercices

| Durée | Max exos |
|---|---|
| ≤ 45 min | 4 |
| ≤ 60 min | 5 |
| ≤ 75 min | 6 |
| ≤ 90 min | 7 |
| > 90 min | 7 |

Powerlifting : `-1` (repos 5-7 min plus longs).

Tri prioritaire : `isPrimary (100)` > `isCorrectivePriority (50)` > reste.
Le slice final garde le top `_maxExos`.

### RÈGLE 2 — Ratio tirage/poussée (séries de travail)

| Profil | Ratio cible pull/push |
|---|---|
| Normal | 1.2 |
| Blessure épaule | 1.5 |

Si non atteint :
- Épaule → `Face Pull` (3×15-20, RPE 7)
- Sinon → `Rowing Poulie Assis` (3×10-12, RPE 8)

Détection push/pull combinée : `muscleGroup` + match par nom.

### RÈGLE 3 — Powerlifting : retrait des exercices esthétiques

Liste retirée : `Écarté Machine`, `Écarté Haltères`, `Curl Concentré`,
`Leg Extension` — **sauf** si `isCorrectivePriority === true`.

### RÈGLE 4 — 45 min : optimisation setup

- Retire `Deadlift` lourd (sauf `isPrimary`)
- Ajoute `RDL (Soulevé Roumain)` 3×10-12 si pas déjà présent
- Tag `_preferMachine: true` sur tous les exos

### RÈGLE 5 — Correctifs de ratios (seuils par mode)

| Ratio | PL | Musc | Bien-être |
|---|---|---|---|
| `squatBenchRatio`    | 1.25 | 1.10 | 1.00 |
| `deadliftSquatRatio` | 1.15 | 1.00 | 0.90 |
| `rowBenchRatio`      | 1.10 | 1.00 | 1.00 |
| `ohpBenchRatio`      | 0.60 | 0.65 | 0.50 |

Sous le seuil → ajout ou re-tag :
- `squatBench` → `Leg Extension` (quad_isolation)
- `deadliftSquat` → `RDL` (posterior_chain)
- `rowBench` → `Rowing Barre` (back_compound)
- `ohpBench` → `Face Pull` (shoulder_health)

**Morpho-Logic** : `deadliftSquatRatio > 1.50` → `Mobilité Cheville`
prête en warmup (levier favorable au tirage détecté).

### RÈGLE 6 — Blessure : Hard Cap RPE 7 / 75 % 1RM

Détection par zone (`shoulder`, `knee`, `back`) sur l'exercice :
- `shoulder` : Bench / Développé / OHP / Dips / Larsen / Incliné
- `knee` : Squat / Leg Press / Hack Squat
- `back` : Deadlift / Soulevé / Good Morning

Tagging : `maxRPE: 7`, `maxIntensity: 0.75`, `_injuryCapApplied: true`,
note `⚠️ Cap RPE 7 / 75 % (blessure <zone>)`.

### RÈGLE 6b — Senior (≥ 60 ans)

Tagging : `restMultiplier: 2.0`, `maxRPE: min(maxRPE, 7)`, `_seniorAdapted: true`.

---

## Intégration

```js
// wpGeneratePowerbuildingDay() — juste avant le return
if (typeof selectExercisesForProfile === 'function' && bodyPart !== 'recovery') {
  try {
    var _selProfile = buildProfileForSelection();
    exercises = selectExercisesForProfile(exercises, _selProfile);
  } catch(e) {}
}
```

Le filtre s'applique **après** : `applyShoulderFilter` (v204) →
`applyAgeAdaptations` (v208) → `getStressVolumeModifier` (v208).
Pas de double-comptage : `_injuryCapApplied`, `_seniorAdapted` et
`_preferMachine` sont des **flags additifs**, pas des recalculs.

---

## Tests : 10 invariants Playwright

| Test | Vérifie |
|---|---|
| RULE1-01 | duration=45 musc → ≤ 4 exos |
| RULE1-02 | duration=120 PL → ≤ 6 exos |
| RULE2-01 | injury=shoulder + push-heavy → Face Pull ajouté |
| RULE2-02 | push-heavy musc → Rowing ajouté |
| RULE3-01 | PL → Écarté Machine retiré |
| RULE3-02 | PL + isCorrectivePriority → Leg Extension conservé |
| RULE4-01 | duration=45 → Deadlift retiré, RDL ajouté |
| RULE5-01 | squatBench=1.06 → Leg Extension correctif |
| RULE5-02 | rowBench=0.85 → Rowing Barre correctif |
| RULE6-01 | injury=shoulder + Bench → maxRPE=7 |

> Tests Playwright : `tests/audit-select-exercises-profile-v209.spec.js` (10 tests).

## SW v208 → v209
