# Audit — Sous-onglet Programme

**Périmètre :** `js/app.js` — fonctions liées au builder et à la vue programme  
**Date :** 2026-04-29  
**Branche :** main

---

## 1. Écran initial — "Comment tu veux créer ton programme ?"

### Quand s'affiche-t-il ?

`renderProgramBuilder()` affiche l'écran de choix **uniquement si** :
- `_customBuilderState` est `null` (pas d'édition en cours)
- `_pbState` est `null` (pas de wizard guidé/manuel en cours)
- `hasProgram` est **falsy**

### Condition `hasProgram` exacte (lignes 8878–8881)

```js
var hasProgram =
  (db.generatedProgram && db.generatedProgram.length > 0)          // wizard guidé
  || (db.manualProgram && db.manualProgram.dayNames && db.manualProgram.dayNames.length > 0) // wizard manuel (legacy)
  || (db.routine && Object.keys(db.routine).length > 0)            // routine définie
  || (db.user.programMode === 'custom' && db.customProgramTemplate); // mode custom
```

Le critère `weeklyPlan` n'est **pas** dans `hasProgram` : `weeklyPlan` peut exister
sans déclencher la vue programme (et peut ne pas exister même si un programme custom
est sauvegardé).

### Ordre de priorité dans `renderProgramBuilder()`

1. `_customBuilderState` non-null → `renderCustomBuilder()` (édition en cours)
2. `hasProgram && !_pbState` → `renderProgramBuilderView()` + bouton "Modifier les exercices" si custom
3. `_pbState` non-null → `renderProgramBuilderStep()` (wizard en cours)
4. Sinon → écran de choix initial

---

## 2. "L'appli me guide" — `pbStartGuided()` + `pbGenerateProgram()`

### Flux complet (5 étapes)

`pbStartGuided()` (ligne 8929) initialise :
```js
_pbState = { mode: 'guided', step: 1, days: 4, goal: 'hypertrophie',
  equipment: ['barbell','dumbbell','machine','cable'], duration: 60,
  level: db.user.level || 'intermediaire' }
```

| Étape | Question | Valeur stockée dans `_pbState` |
|---|---|---|
| 1 | Nombre de jours (2–6) | `_pbState.days` |
| 2 | Objectif (force/hypertrophie/mixte/remise_en_forme) | `_pbState.goal` |
| 3 | Équipement (multi-sélection) | `_pbState.equipment[]` |
| 4 | Durée par séance (30–90 min) | `_pbState.duration` |
| 5 | Niveau (débutant/intermédiaire/avancé) → **déclenche `pbGenerateProgram()`** | `_pbState.level` |

### Ce que fait `pbGenerateProgram()` (ligne 9560)

1. Mappe le goal → `goalMap = { force:'force', hypertrophie:'masse', mixte:'force', remise_en_forme:'bien_etre' }`
2. Persiste `db.user.level` et `db.user.programParams.duration`
3. Définit `window.obSelectedDays` à partir d'une table hardcodée (Lun/Mer/Ven pour 3j, etc.)
4. Appelle `generateProgram(goals, days, equipment, duration, [], [], null, null, level)` → `db.generatedProgram`
5. Construit `db.routine` depuis le résultat
6. Remplit `db.routineExos`
7. Appelle `generateWeeklyPlan()` (en try/catch)
8. `saveDBNow()`, toast, `renderProgramBuilder()`

### 🔴 Bug : `selectedDays` non persisté

`pbGenerateProgram()` ne persiste **jamais** `db.user.programParams.selectedDays`.
Elle utilise une table de jours hardcodée via `window.obSelectedDays`, mais ne
l'écrit pas dans `programParams`. Si `generateWeeklyPlan()` lit ensuite
`params.selectedDays`, il trouve `undefined` et replie sur `allDays.slice(0, freq)`.
Les jours choisis par l'user au step 1 ne sont donc **pas mémorisés** dans le profil.

---

## 3. "Je construis moi-même" — `showCustomBuilderChoice()` + `pbStartCustomBuilder()`

### Les 2 chemins dans `showCustomBuilderChoice()` (ligne 8939)

- Si **aucun** jour non-repos dans `db.weeklyPlan.days` → `pbStartCustomBuilder(false)` directement (page blanche)
- Sinon → modal DOM custom (deux boutons) :
  - "📋 Partir de mon programme actuel" → `pbStartCustomBuilder(true)`
  - "📄 Page blanche" → `pbStartCustomBuilder(false)`
  - Clic en dehors ferme la modal

### `pbStartCustomBuilder(true)` — 3 branches (ligne 8966)

| Condition | Comportement |
|---|---|
| `fromExisting && db.customProgramTemplate` | Deep-clone du template custom existant |
| `fromExisting && db.weeklyPlan.days` | Conversion `weeklyPlan.days` → template (filtre warmup/prehab, détecte slot via `wpGetExoMeta`) |
| Sinon (page blanche) | Template vide avec un bloc de 8 semaines, 0 sessions |

**Conversion depuis `weeklyPlan.days` :** filtre `isWarmup` et `isPrehab`, détecte
`defaultSlot` via `e.isPrimary` ou `meta.mechanic === 'isolation'`. Le `dayIndex` est
résolu avec `allDaysFull.indexOf(d.day)` et replie sur l'index de position si absent.

### 🟠 Incohérence : `showCustomBuilderChoice` teste `weeklyPlan.days` mais `pbStartCustomBuilder(true)` peut tomber sur la branche template

Si `db.customProgramTemplate` existe mais que `db.weeklyPlan.days` n'a pas de jours
non-repos, `showCustomBuilderChoice` lance directement `pbStartCustomBuilder(false)` —
l'user ne peut pas choisir "Partir de mon programme actuel" même si un template custom
existe déjà.

---

## 4. Bouton "Modifier ✏️" dans la vue programme

### `pbEditExisting()` (ligne 10156)

Toujours appelé par `onclick="pbEditExisting()"` dans le header de
`renderProgramBuilderView()`, **quel que soit** `db.user.programMode`.

**Ce qu'il fait :**
1. Lit `getRoutine()` pour construire `dayNames` et `dayExercises`
2. Lit `db.routineExos`, puis `db.generatedProgram` en fallback
3. Initialise `_pbState = { mode: 'manual', step: 3, ... }` → wizard manuel étape 3
4. Appelle `renderProgramBuilder()` → ouvre le builder de séances textuelles

### 🔴 Bug : `pbEditExisting()` ignore `programMode === 'custom'`

En mode custom, le bouton "Modifier ✏️" lance le wizard manuel texte (choix de noms
de séance + exercices libres), alors que l'interface dédiée est `renderCustomBuilder()`.
Le bouton "✏️ Modifier les exercices" en tête de page est bien câblé sur
`pbStartCustomBuilder(true)`, mais "Modifier ✏️" dans le header le court-circuite.

**Comportement attendu :** en mode custom, `pbEditExisting()` devrait appeler
`pbStartCustomBuilder(true)`.

---

## 5. "Réinitialiser le programme" — `pbResetProgram()` (ligne 10179)

```js
function pbResetProgram() {
  if (!confirm('Réinitialiser le programme ? Tu pourras en créer un nouveau.')) return;
  db.generatedProgram = null;
  db.routine          = null;
  db.manualProgram    = null;
  db.routineExos      = null;
  db.weeklyPlan       = null;
  db.user.programParams = {};
  saveDBNow();
  _pbState = null;
  renderProgramBuilder();
}
```

### Ce qui est effacé ✅
`generatedProgram`, `routine`, `manualProgram`, `routineExos`, `weeklyPlan`,
`programParams`, `_pbState`

### 🔴 Ce qui N'est PAS effacé
- `db.customProgramTemplate` → le template custom survit à la réinitialisation
- `db.user.programMode` → reste `'custom'` si c'était le mode en cours

**Conséquence :** après reset, `hasProgram` est vrai (condition custom toujours vraie)
et l'app n'affiche **jamais** l'écran de choix initial. L'user est coincé en mode custom
sans possibilité de repartir de zéro via ce bouton.

### Confirmation
Oui : `confirm()` natif avant de tout effacer.

---

## 6. Bouton "OK" / Régénérer — `wpForcePhase()` + `renderProgramBuilderView()`

### Bouton "OK" dans la vue programme

Le select de phase + bouton OK appellent `wpForcePhase()` (non listé dans l'audit
mais présent dans la codebase). Cette fonction force `db.weeklyPlan.currentBlock`
et appelle `generateWeeklyPlan()`.

### `_wpIsStaleVsRoutine()` (ligne 9611)

Appelée **au début de `renderProgramBuilderView()`** à chaque rendu. Retourne `true`
si `weeklyPlan` est vide, ou si les titres `weeklyPlan.days[].title` ne correspondent
plus aux labels de `db.routine`. En cas de `true`, `generateWeeklyPlan()` est
déclenchée silencieusement avant l'affichage.

### 🔴 Risque d'écrasement du programme custom

`_wpIsStaleVsRoutine()` retourne `true` quand `weeklyPlan` est vide — ce qui se
produit juste après `saveCustomTemplate()` si `calculateParametersForCustomPlan()`
n'a pas encore rempli `weeklyPlan.days`.

Si la vérification de `isCustom` n'est pas faite dans `generateWeeklyPlan()`, les
exercices custom seraient écrasés. **La protection est en place** :
`generateWeeklyPlan()` vérifie `programMode === 'custom'` et redirige vers
`calculateParametersForCustomPlan()`. Mais `_wpIsStaleVsRoutine()` ne tient
**pas compte** du flag `weeklyPlan.isCustom` : si `weeklyPlan.days` est vide, elle
retourne `true` même en mode custom, déclenchant `generateWeeklyPlan()` une seconde
fois (redondant mais non destructif).

---

## 7. Cohérence Custom vs Auto

### `saveCustomTemplate()` → `calculateParametersForCustomPlan()` ✅

`saveCustomTemplate()` appelle bien `calculateParametersForCustomPlan()` via
`typeof calculateParametersForCustomPlan === 'function'`. C'est safe.

### Changement de phase en mode custom ✅

En mode custom, `generateWeeklyPlan()` redirige toujours vers
`calculateParametersForCustomPlan()`, qui relit `db.customProgramTemplate` et
recalcule. Les exercices du template ne sont jamais touchés — seuls les
paramètres (poids, séries, RPE) changent en fonction de `wpDetectPhase()`.

### Mode auto après sauvegarde d'un template custom

`setProgramMode('auto')` change `db.user.programMode` mais ne vide pas
`db.customProgramTemplate`. Si l'user repasse en auto puis déclenche
`generateWeeklyPlan()`, le mode auto s'exécute normalement et écrase
`db.weeklyPlan` — le template custom est préservé en base mais n'est plus utilisé.

### `weeklyPlan.isCustom` flag

Écrit par `calculateParametersForCustomPlan()`. **Aucune fonction ne le lit**
actuellement (ni `renderProgDaysList`, ni `_wpIsStaleVsRoutine`, ni les
renderers). Le flag est en place pour usage futur mais pas encore utilisé pour
protéger les exercices.

---

## 8. Réglages — Mode programme & Coaching

### Toggle Auto/Custom dans les réglages vs `showCustomBuilderChoice()`

**Différence de comportement :**

| Action | Comportement |
|---|---|
| Réglages → "🛠 Custom" (`setProgramMode('custom')`) | Change uniquement `db.user.programMode` — n'ouvre pas le builder, n'initialise pas `customProgramTemplate` |
| "Je construis moi-même" → `showCustomBuilderChoice()` | Ouvre le builder, crée/édite le template |

**Conséquence :** activer "Custom" dans les réglages sans être passé par le builder
laisse `db.customProgramTemplate = null`, ce qui casse `calculateParametersForCustomPlan()`
(retour immédiat à la ligne 15834) et bloque l'affichage du programme car `hasProgram`
est évalué à `false` (null template).

### `coachProfile` — utilisation réelle

`coachProfile` est lue dans **exactement 3 endroits**, tous dans
`calculateParametersForCustomPlan()` :

| Ligne | Effet de `coachProfile !== 'silent'` |
|---|---|
| 15879 | Note fatigue penalty sur main_lift déplacé |
| 15884 | Badge "Volume adapté (phase)" sur accessoires réduits |
| 15902 | Alerte MRV si > 3 main_lifts dans la séance |

**`coachProfile` n'est jamais lue dans :**
- `coach.js` / `coachGetFullAnalysis()`
- `renderCoachTodayHTML()`
- `generateWeeklyPlan()` (mode auto)
- Aucune autre fonction

Les profils `'full'` et `'guardrail'` sont traités **identiquement** — la
distinction `guardrail` (sécurité seulement) vs `full` (tout activé) n'est pas
implémentée. Seul `'silent'` a un effet.

**`coachEnabled`** est initialisé dans `defaultDB()` et la migration, mais
**n'est jamais lue** dans le code.

---

## 🔴 Bugs trouvés

| # | Localisation | Description |
|---|---|---|
| B1 | `pbGenerateProgram()` L9574 | `selectedDays` non persisté dans `programParams` — les jours du wizard guidé sont perdus après `generateWeeklyPlan()` |
| B2 | `pbEditExisting()` L10156 | Ignore `programMode === 'custom'` → lance le wizard manuel au lieu de `pbStartCustomBuilder(true)` |
| B3 | `pbResetProgram()` L10179 | Ne réinitialise ni `customProgramTemplate` ni `programMode` → après reset, l'app ne revient jamais à l'écran de choix initial en mode custom |
| B4 | `setProgramMode('custom')` L12419 | N'ouvre pas le builder et ne crée pas de template → `customProgramTemplate` reste `null`, `calculateParametersForCustomPlan()` ne fait rien |

---

## 🟠 Incohérences

| # | Description |
|---|---|
| I1 | `showCustomBuilderChoice()` teste `weeklyPlan.days` pour proposer "partir du programme actuel", mais `pbStartCustomBuilder(true)` préfère d'abord `customProgramTemplate` — si un template existe et que `weeklyPlan` est vide, la modal ne s'ouvre pas |
| I2 | `weeklyPlan.isCustom` est écrit mais jamais lu — la protection contre l'écrasement repose entièrement sur `programMode`, pas sur ce flag |
| I3 | `coachProfile = 'guardrail'` et `coachProfile = 'full'` ont le même comportement — la distinction n'est pas implémentée |
| I4 | `coachEnabled` est déclaré dans `defaultDB()` et migré mais jamais lu |
| I5 | `pbStartManual()` existe toujours (L8934) mais n'est plus appelé nulle part — dead code depuis le remplacement par `showCustomBuilderChoice()` |

---

## ✅ Ce qui fonctionne bien

- La condition `hasProgram` couvre correctement les 4 modes (généré, manuel legacy, routine, custom)
- `saveCustomTemplate()` → `calculateParametersForCustomPlan()` est bien chaîné
- En mode custom, changement de phase → exercices préservés ✅
- `generateWeeklyPlan()` redirige vers `calculateParametersForCustomPlan()` en mode custom ✅
- `cancelCustomBuilder()` remet à zéro proprement les 3 variables d'état
- `_wpIsStaleVsRoutine()` détecte les weeklyPlan périmés avant affichage
- Confirmation native avant reset

---

## Recommandations (par priorité)

1. **[P1 — Bug B3]** `pbResetProgram()` : ajouter `db.customProgramTemplate = null; db.user.programMode = 'auto';`
2. **[P1 — Bug B2]** `pbEditExisting()` : si `db.user.programMode === 'custom'`, appeler `pbStartCustomBuilder(true)` au lieu du wizard manuel
3. **[P2 — Bug B4]** `setProgramMode('custom')` : si `!db.customProgramTemplate`, proposer d'ouvrir le builder ou afficher un message d'information
4. **[P2 — Bug B1]** `pbGenerateProgram()` : persister `window.obSelectedDays` dans `db.user.programParams.selectedDays`
5. **[P3 — I3]** Implémenter la distinction `guardrail` (activer uniquement les alertes de sécurité MRV/blessure) vs `full` (tout activer) dans `coachGetFullAnalysis()` et `renderCoachTodayHTML()`
6. **[P3 — I4]** Supprimer `coachEnabled` ou le câbler dans `coachGetFullAnalysis()`
7. **[P3 — I5]** Supprimer `pbStartManual()` (dead code)
