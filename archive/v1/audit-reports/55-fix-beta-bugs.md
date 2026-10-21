# Fix bugs bêta critiques — v211 → v212

## Source : audit `audit/beta-test-programmes.md` — 7 bugs bloquants identifiés sur 4 profils réels

## Bugs corrigés

### FIX 1 — `wpGenerateMuscuDay()` applique le pipeline v211 complet

**Avant** : la branche `mode === 'musculation' || mode === 'bodybuilding'`
de `generateWeeklyPlan()` appelait `wpGenerateMuscuDay()` qui n'invoquait
ni `selectExercisesForProfile()`, ni `applyAgeAdaptations()`, ni
`getStressVolumeModifier()`, ni `applyPivotWeekSwaps()`, ni
`getLegOverreachModifiers()`. Léa + Alexis (50% des bêta-testeurs
musculation potentiels) perdaient les 9 règles + Priority Queue +
Pivot Week + Leg Overreach.

**Fix** : ajout du même pipeline qu'en branche powerbuilding dans le
return de `wpGenerateMuscuDay()` (lignes 21863-21923 environ). Bloc
`try/catch` avec log Supabase en cas d'erreur. Détection upper/lower
basée sur `tpl.title` pour les modificateurs Leg Overreach.

---

### FIX 2 — Doublon Upper A Lundi/Samedi (freq=5)

**Avant** : `splitMap` pour freq=4 avait 4 templates. Pour freq=5, le
modulo `tplKeys[tplIdx % tplKeys.length]` recyclait `upper_a` au 5è
jour → Lundi = Samedi exactement (vérifié sur Alexis : 6 exos, mêmes
poids, mêmes reps, mêmes RPE).

**Fix** : branche dédiée `freq === 5` avec 5 templates distincts
(`upper_a`, `lower_a`, `upper_b`, `lower_b`, `full_a`). Safety
loop générique : tant que `tplKeys.length < selectedDays.length`,
compléter avec `full_b` / `full_c`.

---

### FIX 3 — Routine désynchronisée des `selectedDays`

**Avant** : `db.routine` pouvait garder un état stale (par exemple
D'Jo : Lundi/Vendredi = Repos malgré sélection, Dimanche = training
malgré exclusion). Aucun mécanisme de réconciliation.

**Fix** : nouvelle fonction `syncRoutineWithSelectedDays()` qui :
- supprime un titre `Repos` sur un jour sélectionné (force régénération)
- met `😴 Repos` sur un jour non-sélectionné qui aurait gardé un titre
- saveDB() si changement détecté

Appelée à 2 endroits :
- après les autres migrations dans le bloc `init()`
- au début de `generateWeeklyPlan()` après résolution de `selectedDays`

---

### FIX 4 — Préfixe `🔄` persiste après changement de phase

**Avant** : `confirmPhaseTransition('hypertrophie')` ne nettoyait pas
`db.routine`. Les titres `🔄 💪 Upper A` (ajoutés en phase deload
ligne 22384) restaient après transition vers hypertrophie — observé
sur Léa (`week=3, phase=hypertrophie` mais routine encore préfixée).

**Fix** : strip `^🔄\s*` de chaque valeur de `db.routine` dans
`confirmPhaseTransition()` juste avant `saveDB()`.

---

### FIX 5 — Validation goals (max 2 compatibles)

**Avant** : `toggleSettingsGoal()` n'avait aucune validation —
D'Jo avait accumulé 6 goals contradictoires
(`force,masse,seche,recompo,maintien,reprise`).

**Fix** : nouvelle map `INCOMPATIBLE_GOALS` (paires antagonistes
validées Gemini) + helper `isGoalCompatible(newGoal, existingGoals)`.
`toggleSettingsGoal()` rejette via toast :
- "Maximum 2 objectifs simultanés" si déjà 2 goals
- "Objectif incompatible avec ta sélection actuelle" sinon

Pairs incompatibles :

| Goal | Incompatible avec |
|---|---|
| seche | masse, recompo |
| masse | seche, maintien |
| recompo | seche |
| maintien | masse, force, competition |
| reprise | force, competition |
| competition | reprise, maintien |

---

### FIX 6 — `restSeconds:0` sur 2è exo des supersets

**Avant** : `wpApplySupersets()` posait `next.restSeconds = 0` sur le
2è exo, ce qui se rendait littéralement comme "0s" ou ne rendait rien
(la fonction `renderWpExercise()` testait `restSeconds` truthy).

**Fix** :
- `wpApplySupersets()` pose `next.restSeconds = null` au lieu de 0
- `renderWpExercise()` enrichi : si `restSeconds` falsy ET
  `exo.isSecondInSuperset` → afficher `⏩ Enchaîner →`

---

### FIX 7 — Persistance `weeklyPlan.days` vers Supabase

**Avant** : `generateWeeklyPlan()` appelait `syncToCloud()` après
`saveDB()`, mais sans retry. Sur les 4 profils audités, 3/4
(Aurélien, Léa, D'Jo) avaient `weeklyPlan` réduit à
`{currentBlock, lastDeloadDate}` côté Supabase → impossible d'auditer
le runtime côté serveur.

**Fix** : ajout d'un `debouncedCloudSync()` (2s retry) en plus du
`syncToCloud()` immédiat. Garantit la persistance même si l'auth n'est
pas prête au moment de l'appel immédiat.

---

## Tests : 7 invariants Playwright

| Test | Vérifie |
|---|---|
| FIX1-01 | `wpGenerateMuscuDay()` retourne des exercices avec le pipeline complet exécuté |
| FIX1-02 | `selectExercisesForProfile()` en mode 45min retire Deadlift et injecte RDL |
| FIX2-01 | musc freq=5 → titres distincts (≥ 4 uniques sur 5 jours) |
| FIX3-01 | Routine désynchronisée → `syncRoutineWithSelectedDays()` corrige le jour fantôme |
| FIX4-01 | `confirmPhaseTransition()` strip `🔄` de tous les jours |
| FIX5-01 | `toggleSettingsGoal()` rejette seche après masse + bloque > 2 goals |
| FIX6-01 | `wpApplySupersets()` → 2è exo `restSeconds=null` + `isSecondInSuperset=true` |

> Tests : `tests/audit-fix-beta-bugs-v212.spec.js` (7 tests).

## SW v211 → v212
