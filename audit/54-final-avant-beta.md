# Derniers systèmes avant bêta — v211

## Source : validation Gemini raisonnement approfondi — spécifications finales

## Systèmes livrés

### SYSTÈME 1 — Priority Queue 5 niveaux

Remplace le sort basique `isPrimary (100) + isCorrectivePriority (50)`
de `selectExercisesForProfile()` par une hiérarchie validée Gemini :

| Niveau | Score | Catégorie |
|---|---|---|
| 1 — IMMUABLE | 100 | Lifts principaux (SBD / Skill Calisthenics) |
| 2 — PRIORITÉ | 80 | Substituts blessure (épaule/genou) |
| 3 — STRUCTURE | 60 | Accessoires fonctionnels (`_addedByRule=2,9`) |
| 4 — CORRECTIF | 40 | Corrections de ratio (`isCorrectivePriority`, `_addedByRule=5,8`) |
| 5 — ISOLATION | 20 | Esthétique — premier évincé |

Helper `_getExercisePriority(exo)` exposé pour test direct.

---

### SYSTÈME 2 — KneeFilter + TalkTest

**KneeFilter** : `applyKneeFilter(exercises)` détecte `db.user.injuries`
contenant une zone genou et :
- Blacklist : `Sissy Squat`, `Fentes (Grand Pas)`, `Box Jump`, `Jump Squat`, etc.
- Substituts : `Sissy Squat` → `Leg Extension (Amplitude Réduite)`,
  `Box Jump` → `Box Squat (Amplitude Contrôlée)`,
  `Fentes (Grand Pas)` → `Step-up Bas (Haltères)`.
- Tag : `_injurySubstitute: true`, note `🦵 Adapté blessure genou`.

Appelé après `applyShoulderFilter()` dans les deux paths
de `wpGeneratePowerbuildingDay()`.

**TalkTest** : `hasPRData()` + `getTalkTestInstruction(exoName)` —
pour les users sans PRs, retourne l'instruction qualitative
"Prends un poids avec lequel tu peux faire 10 reps tout en étant
capable de discuter sans être essoufflé(e)".

---

### SYSTÈME 3 — Persistance équipement onboarding

`obQ3SelectMat(matId, btn)` étendu :
- Persiste immédiatement `db.user.programParams.mat`
- Si `matId === 'maison'` (poids de corps) → bascule
  `db.user.trainingMode = 'calisthenics'`
- Si l'user revient sur `salle`/`halteres` après être passé en
  calisthenics → restaure `trainingMode = 'musculation'`

Question Q3 existait déjà dans l'onboarding (cf. `#ob-step-q3`).
L'extension v211 corrige le gap : auparavant `mat` n'était sauvegardé
qu'en fin de wizard via `obGenerateProgram()`.

---

### SYSTÈME 4 — Pivot Week

`isPivotWeek()` : `db.weeklyPlan.currentBlock.week % 12 === 0 && > 0`.

`applyPivotWeekSwaps(exercises)` swap 100% des lifts SBD vers
variantes unilatérales / stabilité :

| Original | Swaps |
|---|---|
| `High Bar Squat` | `Goblet Squat`, `Bulgarian Split Squat` |
| `Bench Press (Barre)` | `Développé Haltères (Prise Neutre)`, `Push-ups Anneaux` |
| `Soulevé de Terre` | `Trap Bar Deadlift`, `Kettlebell Swing Lourd` |
| `Curl Biceps` | `Turkish Get-up` |
| `Leg Extension` | `Planche Dynamique (Hollow Body)` |

Tag : `_pivotWeekSwap: true`, `_originalName`, note
`🔄 Pivot Week — diversification motrice`.

`getPivotWeekFrequency()` retourne `3` pendant la pivot week
(hard cap Gemini — SNC doit se déconnecter).

Intégration : `applyPivotWeekSwaps()` appelé en fin de pipeline
dans `wpGeneratePowerbuildingDay()` (après `selectExercisesForProfile`).

---

### SYSTÈME 5 — Leg Overreach (cycle 3 spécialisation jambes)

Trigger : `db.weeklyPlan._completedMacrocycles >= 2`
ET `db.bestPR.squat / db.bestPR.bench <= 1.10`.

`getLegOverreachModifiers()` retourne :
- `legsVolumeMultiplier: 1.30` (+30% volume jambes)
- `upperVolumeMultiplier: 0.80` (-20% upper)
- `benchVolumeMultiplier: 0.60` (-40% bench, maintenance)
- `benchMaxRPE: 8` (intensité maintenue)
- `benchFreqMax: 2` (max 2j bench/semaine)

Application dans `wpGeneratePowerbuildingDay()` :
- `derivedTitle` matche `squat|leg|jambe` → multiplier ×1.30 sur `sets`
- `derivedTitle` matche `bench|push|upper|pectoraux` → multiplier ×0.80
  (×0.60 pour bench spécifiquement, `maxRPE: 8`)

`incrementMacrocycleCounter()` : appelé dans `confirmPhaseTransition()`
quand `nextPhase === 'hypertrophie'` (retour au début du cycle =
fin d'un macrocycle complet).

---

## Tests : 10 invariants Playwright

| Test | Vérifie |
|---|---|
| PRIO-01 | isPrimary → priority 100 |
| PRIO-02 | _addedByRule=2 → 60, _addedByRule=5 → 40, injury → 80, isolation → 20 |
| KNEE-01 | injury=genou → Sissy Squat substitué par Leg Extension amplitude réduite |
| KNEE-02 | injury=genou → Box Jump → Box Squat amplitude contrôlée |
| KNEE-03 | Pas de blessure genou → exercices inchangés |
| TALK-01 | hasPRData()=false → getTalkTestInstruction() non vide |
| PIVOT-01 | currentBlock.week=12 → isPivotWeek()=true |
| PIVOT-02 | currentBlock.week=8 → isPivotWeek()=false |
| PIVOT-03 | applyPivotWeekSwaps() → High Bar Squat remplacé, _pivotWeekSwap=true |
| OVERREACH-01 | _completedMacrocycles=2 + ratio=1.06 → trigger=true, mods×1.30/0.60 |

> Tests Playwright : `tests/audit-final-avant-beta-v211.spec.js` (10 tests).

## SW v210 → v211
