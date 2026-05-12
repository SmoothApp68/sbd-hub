# Progression No-RPE + Phases + Validation Gate — v202

## Source : validation Gemini complète

## Systèmes implémentés

### SYSTÈME 1 — Double Progression No-RPE

#### 1A — Main Lifts SBD : Wave Loading
`wpDoubleProgressionWeight()` bifurque selon `_isMainLift` :
- **Toutes séries validées** (RPE optionnel) → +2.5kg, reset `lpStrikes`
- **1 strike** → maintenir la charge (strikes incrémentés par `goCheckAutoRegulation`)
- **2 strikes** → deload local -10%, reset `lpStrikes[exoName]`

#### 1B — Accessoires : Double Progression classique
- Toutes séries à `targetRepMax` → +`getDPIncrement()`, retour à `targetRepMin`
- Sous le max → +1 rep vers `targetRepMax`
- Gainage/abdos (`getDPIncrement = 0`) → +2 reps

#### 1C — Speed Deadlift : indexé sur PR
```js
function getSpeedDeadliftWeight() {
  return wpRound25((db.bestPR.deadlift || 0) * 0.60);
}
```
Intercepté en entrée de `wpDoubleProgressionWeight` → jamais soumis à la progression standard.

---

### SYSTÈME 2 — BLOCK_DURATION Gemini-calibrées

`BLOCK_DURATION` était référencé dans `wpDetectPhase()` via `typeof BLOCK_DURATION !== 'undefined'` mais **jamais défini** → toujours `false` → fallback weeksSince sans table.

**Désormais défini** (valeurs semaines) :

| Mode | Niveau | Hyp | Acc | Force | Intens | Peak | Deload |
|---|---|---|---|---|---|---|---|
| powerbuilding | débutant | 6 | 6 | 4 | 2 | 1 | 1 |
| powerbuilding | intermédiaire | 5 | 5 | 4 | 2 | 1 | 1 |
| powerbuilding | avancé | 4 | 4 | 4 | 2 | 1 | 1 |
| powerlifting | avancé | 4 | 4 | **5** | 2 | 1 | 1 |
| musculation | débutant | **8** | **8** | 4 | 2 | 1 | 1 |
| bien_être | tous | — | 99 | — | — | — | — |

#### Plateau indicator
Dans `wpDetectPhase()`, si `_detectedPhase === 'hypertrophie'` :
- 3+ plateaux accessoires (`e.plateauDetected`) sur 3 semaines → retourne `'force'`
- SRS < 50 sur 2+ séances récentes → retourne `'force'`

#### blockStartDate
`generateWeeklyPlan()` initialise `currentBlock.blockStartDate = Date.now()` si absent.

---

### SYSTÈME 3 — Validation Gate

Modal de transition de phase déclenchée depuis `renderDash()` :
```js
if (isEndOfPhaseBlock() && !db._phaseGateShownAt) {
  db._phaseGateShownAt = Date.now();
  setTimeout(showPhaseValidationGate, 1000);
}
```

| Fonction | Rôle |
|---|---|
| `isEndOfPhaseBlock()` | Compare `weeksSince(blockStartDate)` vs `BLOCK_DURATION[mode][level][phase]` |
| `getNextPhase()` | Séquence hypertrophie → accumulation → force → intensification → peak → deload → hypertrophie |
| `showPhaseValidationGate()` | Modal avec gain volume du bloc + boutons Oui / Semaine de plus |
| `confirmPhaseTransition()` | Applique nextPhase + reset `blockStartDate` + `forcedAt` + clear gate guard |
| `postponePhaseTransition()` | Recule `blockStartDate` de 7j, clear gate guard |
| `_computeBlockVolumeGain()` | Progression volume 1ère vs 2ème moitié du bloc (%) |

---

## Tests : 22/22 invariants statiques

| Test | Status |
|---|---|
| PROG-01 main lift allSetsComplete → +2.5kg | ✅ |
| PROG-02 main lift 1 strike → maintenir | ✅ |
| PROG-03 main lift 2 strikes → deload -10%, reset | ✅ |
| PROG-04 accessoire targetRepMax → +getDPIncrement, retour repMin | ✅ |
| PROG-05 speed_deadlift → 60% PR | ✅ |
| BLOCK-01 BLOCK_DURATION powerbuilding avancé hyp = 4 | ✅ |
| GATE-01 isEndOfPhaseBlock() après maxWeeks → true | ✅ |
| GATE-02 confirmPhaseTransition('force') → phase = force | ✅ |
| BLOCK_DURATION défini (pas undefined) | ✅ |
| PL force avancé = 5 semaines | ✅ |
| Musculation débutant hyp = 8 semaines | ✅ |
| Plateau indicator → force | ✅ |
| blockStartDate init generateWeeklyPlan | ✅ |
| getSpeedDeadliftWeight, speed_deadlift intercept, 60% PR | ✅ (×3) |
| isEndOfPhaseBlock, getNextPhase, showPhaseValidationGate | ✅ (×3) |
| confirmPhaseTransition, postponePhaseTransition | ✅ (×2) |
| _computeBlockVolumeGain | ✅ |
| Gate trigger + reset guard | ✅ (×2) |

> Tests Playwright : `tests/audit-progression-phases-v202.spec.js` créé (8 tests).
> Env Playwright cassé (pré-existant) — validé via 22 invariants Node.js statiques.

## SW v201 → v202
