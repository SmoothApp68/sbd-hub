# Audit A.0 — Tuyauterie onboarding / builder
Date : 2026-05-15
SW : trainhub-v239

---

## AXE 1 — doGenerateProgram()

### ⚠️ FONCTION MORTE — jamais appelée

`doGenerateProgram()` (app.js:1932) est définie mais **n'est appelée nulle part** — ni dans app.js, ni dans index.html, ni dans aucun fichier JS du projet. C'est du code mort. Le chemin réel de génération SBD passe par `obSaveStep6()` → `obGenerateProgram()` → `_obGenerateProgramCore()`.

### Code exact (ligne 1932–1946)

```js
function doGenerateProgram() {
  const generated = generateProgram(obGoals, obFreq, obMat, obDuration, obInjuries, obCardio, obCompDate, obCompType, db.user.level);
  db.generatedProgram = generated;
  db.user.programParams = { goals: obGoals.map(g=>g.id), freq: obFreq, mat: obMat, duration: obDuration, injuries: obInjuries, cardio: obCardio, compDate: obCompDate, compType: obCompType, level: db.user.level };
  db.routine = {};
  db.routineExos = db.routineExos || {};
  generated.forEach(d => {
    db.routine[d.day] = d.isRest ? '😴 Repos' : (d.isCardio ? '🏃 '+d.label : d.label);
    if (!d.isRest && d.exos && d.exos.length > 0) {
      db.routineExos[d.day] = d.exos.map(id => EXO_DB[id] ? EXO_DB[id].name : id);
    }
  });
  renderObGeneratedProgram(generated);
  gotoObStep('7');
}
```

### selectedDays présent : **NON**

`db.user.programParams` ne contient pas `selectedDays`. Champs écrits : `goals`, `freq`, `mat`, `duration`, `injuries`, `cardio`, `compDate`, `compType`, `level`.

### saveDB() appelée : **NON**
### generateWeeklyPlan() appelée : **NON**
### syncToCloud() appelée : **NON**
### Dernière instruction : `gotoObStep('7')`

---

## AXE 2 — obGenerateProgram()

### Relation avec doGenerateProgram : **AUCUNE**

`obGenerateProgram()` (app.js:1813) ne délègue PAS à `doGenerateProgram()`. Elle appelle `_obGenerateProgramCore()` directement.

### Callers

| Ligne | Contexte |
|---|---|
| 1577 | `obSaveProfile()` — fast path : profil auto-configuré, jours auto-définis |
| 1696 | `obSaveStep5()` — path non-SBD (musculation, bien-être) |
| 1714 | `obSaveStep6()` — path SBD (powerbuilding/powerlifting) |

### Code exact `_obGenerateProgramCore()` — écriture programParams (ligne 1866)

```js
db.user.programParams = { goals: [goalObj.id], freq: obFreq, mat: obMat, duration: obDuration, injuries: obInjuries, cardio: obCardio, level: db.user.level };
```

### selectedDays présent : **NON**

`selectedDays` absent de l'objet `programParams` écrit par `_obGenerateProgramCore`.

### saveDB() appelée : **OUI** (ligne 1875, dans `_obGenerateProgramCore`)
### generateWeeklyPlan() appelée : **NON**
### Relation obGenerateProgram ↔ obFinish : **AUCUNE**

Ces deux fonctions sont indépendantes. `obGenerateProgram()` génère le programme et affiche le résultat (step 7). `obFinish()` est déclenchée séparément par le bouton "C'est parti !" (onclick="obFinish()", index.html:2269). L'une n'appelle pas l'autre.

---

## AXE 3 — obFinish()

### Commentaire selectedDays : **OUI** (ligne 2558)

```js
// Persist selectedDays into programParams — engine reads from here, not from the closure.
```

### Code présent juste après (lignes 2559–2562) : **OUI**

```js
if (Array.isArray(obSelectedDays) && obSelectedDays.length) {
  if (!db.user.programParams) db.user.programParams = {};
  db.user.programParams.selectedDays = obSelectedDays.slice();
}
```

Ce bloc est bien présent et fonctionnel. `selectedDays` EST persisté dans `obFinish()`.

### generateWeeklyPlan() appelée dans obFinish() : **NON**

### Séquence complète des appels dans obFinish()

```
1.  check ob-medical-consent → showToast + return si non coché
2.  db.user.medicalConsent = true
3.  db.user.medicalConsentDate = new Date().toISOString()
4.  db.user.onboarded = true
5.  db.user.onboardingVersion = ONBOARDING_VERSION
6.  if (!db.user.onboardingDate) db.user.onboardingDate = ...
7.  // Persist selectedDays into programParams
    if (Array.isArray(obSelectedDays) && obSelectedDays.length)
      db.user.programParams.selectedDays = obSelectedDays.slice()
8.  validateUserLevel()
9.  autoPopulateKeyLifts()
10. saveDB()                          ← db.weeklyPlan NON écrit ici
11. hideOnboarding()
12. refreshUI()                       ← renderDash() + renderProgramViewer()
13. renderProgramViewer()             ← affiche db.generatedProgram uniquement
14. showToast('Bienvenue ...')
15. if (!db._magicStartDone)
      setTimeout(showMagicStart, 400) ← Magic Start modal (voir AXE 6)
16. setTimeout(async) → social onboarding check
```

**`db.weeklyPlan` n'est jamais écrit dans obFinish().**

---

## AXE 4 — pbGenerateProgram()

### selectedDays présent : **OUI** (ligne 11915)

```js
db.user.programParams.selectedDays = pickedDays;
```

Avec `pickedDays` calculé à la ligne 11912–11914 :

```js
var pickedDays = (s.selectedDays && s.selectedDays.length === s.days)
  ? s.selectedDays.slice()
  : _pbDefaultDaysForFreq(s.days);
```

### Écriture programParams : **par champs individuels** (pas en bloc)

```js
if (!db.user.programParams) db.user.programParams = {};
db.user.programParams.duration = s.duration;
db.user.programParams.freq = s.days;
db.user.programParams.mat = mat;
db.user.programParams.selectedDays = pickedDays;
db.user.programParams.goals = [primaryGoalId].concat(secondaryGoals);
```

### generateWeeklyPlan() appelée : **OUI** (ligne 11961–11963)

```js
if (typeof generateWeeklyPlan === 'function') {
  try { generateWeeklyPlan(); } catch (e) { console.warn('generateWeeklyPlan failed:', e); }
}
```

Appelée **après** `saveDBNow()` (ligne 11960). `db.weeklyPlan` est écrit ici.

### Tous les champs db.user.* écrits dans pbGenerateProgram()

| Champ | Ligne |
|---|---|
| `db.user.trainingMode` | 11894 (conditionnel) |
| `db.user.level` | 11906 |
| `db.user.programParams.duration` | 11908 |
| `db.user.programParams.freq` | 11909 |
| `db.user.programParams.mat` | 11910 |
| `db.user.programParams.selectedDays` | 11915 |
| `db.user.programParams.goals` | 11922 |
| `db.user.onboarded = true` | 11968 (si `_isFirstProgram`) |
| `db.user.onboardingDate` | 11969 (si `_isFirstProgram`) |

---

## AXE 5 — pbSaveManualProgram()

### db.user.programParams écrit : **NON**

Aucune écriture de `db.user.programParams` dans cette fonction.

### generateWeeklyPlan() appelée : **NON**

### db.routine et db.routineExos mis à jour avant saveDB() : **OUI**

```js
db.routine = routine;          // ligne 11858 — construit à partir de s.dayNames
db.manualProgram = { dayNames: s.dayNames, dayExercises: s.dayExercises };  // 11860
if (!db.routineExos) db.routineExos = {};
s.dayNames.forEach(function(dayName, i) {
  db.routineExos[allDays[i]] = s.dayExercises[dayName] || [];  // 11865
});
_pbState = null;
saveDBNow();  // ligne 11869 ← après toutes les mutations
```

Séquence correcte : mutations avant saveDBNow(). Mais **aucun `generateWeeklyPlan()`** → après la sauvegarde, `renderProgramBuilder()` → `renderProgrammeV2()` → vérifie `db.weeklyPlan` → si null, affiche "Génère ton programme pour commencer" avec le bouton ⚡. L'utilisateur doit cliquer manuellement pour générer le weeklyPlan.

---

## AXE 6 — Flux réel onboarding → weeklyPlan

### Path SBD (powerbuilding / powerlifting)

```
obSaveStep5()
  → [obSelectedDays.length === obFreq ?] OUI → gotoObStep('6')
    → obSaveStep6()
      → saveDB() [PRs + targets sauvegardés]
      → obGenerateProgram()
        → _obGenerateProgramCore() [animation 1.6s]
          → generateProgram([goalObj], obFreq, ...) → result
          → db.generatedProgram = result          ← ✅ écrit
          → db.user.programParams = { goals, freq, mat, duration, injuries, cardio, level }
                                                   ← ⚠️ selectedDays ABSENT ici
          → db.routine = {...}                     ← ✅ écrit
          → db.routineExos = {...}                 ← ✅ écrit
          → saveDB()
          → affiche step 7 + bouton "C'est parti !" visible
          → db.weeklyPlan : NON écrit
```

```
[user clicks "C'est parti !"]
→ obFinish()
  → db.user.onboarded = true
  → db.user.programParams.selectedDays = obSelectedDays.slice()  ← ✅ persisté ici
  → saveDB()
  → refreshUI()
    → renderDash() + renderProgramViewer()
    → db.weeklyPlan : NON écrit (renderProgramViewer lit db.generatedProgram)
  → renderProgramViewer()  ← affiche db.generatedProgram seulement
  → setTimeout(showMagicStart, 400)
```

```
[Magic Start modal — "📋 Programme complet"]
→ handleMagicChoice('programme')
  → generateWeeklyPlan()       ← ✅ db.weeklyPlan écrit ICI (premier et unique appel)
  → saveDB()
  → showTab('tab-seances')
  → setTimeout → showSeancesSub('s-plan') → renderProgramBuilder()
    → renderProgrammeV2()      ← affiche le weeklyPlan
```

**`db.weeklyPlan` est écrit UNIQUEMENT si l'utilisateur clique "Programme complet" dans Magic Start.**
Si l'utilisateur clique "Séance libre", "Importer depuis Hevy" ou "Passer", `db.weeklyPlan` reste null.

### Path non-SBD (musculation, bien-être)

Identique mais obSaveStep5() appelle directement `obGenerateProgram()` (sans passer par step 6).

### Path pbGenerateProgram() (Programme Builder)

```
pbGenerateProgram()
  → db.user.programParams.selectedDays = pickedDays  ← ✅ écrit
  → generateProgram(...)
  → db.generatedProgram = result
  → db.routine = {...}
  → saveDBNow()
  → generateWeeklyPlan()        ← ✅ db.weeklyPlan écrit immédiatement
  → renderProgramBuilder()
```

C'est le seul chemin qui écrit `db.weeklyPlan` **sans passer par Magic Start**.

### Path pbSaveManualProgram()

```
pbSaveManualProgram()
  → db.routine = {...}
  → db.routineExos = {...}
  → saveDBNow()
  → renderProgramBuilder() → renderProgrammeV2()
    → "Génère ton programme pour commencer" [⚡ button]
  → db.weeklyPlan : NON écrit (user doit cliquer ⚡)
```

---

## AXE 7 — Variable `obSelectedDays` : durée de vie et scope

### Déclaration

```js
let obSelectedDays = [];  // app.js:1387 — let module-level (lexical scope, pas var)
```

Déclarée avec `let` au niveau module. **Pas accessible via `window.obSelectedDays`** par défaut (contrairement à `var`). `pbGenerateProgram()` contourne ce problème en assignant aussi `window.obSelectedDays = pickedDays` (ligne 11929) pour compatibilité, mais `obSelectedDays` lexical est assigné directement (ligne 11928) car dans le même fichier.

### Initialisations / réinitialisations

| Ligne | Contexte |
|---|---|
| 1387 | Déclaration initiale : `[]` |
| 1398 | `showOnboarding()` → reset à `[]` à chaque ouverture de l'onboarding |
| 1575 | `obSaveProfile()` → auto-rempli : `['Lundi','Mercredi','Vendredi']` ou `['Lundi','Mardi','Jeudi','Vendredi']` |
| 2317 | `renderDayPicker()` → reset à `[]` avant de re-rendre le picker |
| 2340 / 2348 | `toggleDayPick(day)` → toggle un jour |
| 11928 | `pbGenerateProgram()` → `obSelectedDays = pickedDays` |

### Accessibilité au moment de doGenerateProgram() / obFinish()

- **obFinish() (ligne 2545)** : `obSelectedDays` est accessible et valide si l'utilisateur a complété l'étape de sélection des jours (step 5). Puisque `obSaveStep5()` bloque l'avancement si `obSelectedDays.length !== obFreq`, au moment où `obFinish()` est appelée, `obSelectedDays` est garanti non-vide **si le chemin normal a été suivi**.
- **doGenerateProgram()** : Fonction morte — la question ne se pose pas.

### Risque si obSkip()

`obSkip()` n'existe pas dans le code actuel (pas de définition trouvée). Les boutons "Passer" de l'onboarding social (`sobFinish()`) sont différents. La seule fonction de skip trouvée est `handleMagicChoice('skip')` qui ne concerne pas la sélection des jours.

**Il n'existe pas de mécanisme permettant de sauter l'étape de sélection des jours (`obSaveStep5()`) depuis le flux normal sans valider `obSelectedDays.length === obFreq`.** La validation est dans `obSaveStep5()` lui-même (ligne 1681).

**Exception : chemin `obSaveProfile()` (fast path)**
Si `obSaveProfile()` est appelée (line 1575), `obSelectedDays` est auto-rempli avec des jours par défaut avant d'appeler `obGenerateProgram()`. Ce chemin ne passe PAS par `obSaveStep5()` → aucun risque de `obSelectedDays` vide.

---

## Synthèse — Fixes réellement nécessaires

| Fonction | selectedDays manquant | generateWeeklyPlan manquant | Autre problème |
|---|---|---|---|
| `doGenerateProgram` | OUI | OUI | **MORTE** — jamais appelée, ignorable |
| `obGenerateProgram` / `_obGenerateProgramCore` | OUI dans programParams | OUI | selectedDays persisté plus tard par obFinish() → OK pour le moteur |
| `obFinish` | **NON** ✅ (ligne 2558–2561) | OUI — mais couvert par handleMagicChoice() | db.weeklyPlan reste null si user ne clique pas "Programme complet" |
| `pbGenerateProgram` | **NON** ✅ (ligne 11915) | **NON** ✅ (ligne 11961) | Chemin le plus robuste |
| `pbSaveManualProgram` | N/A | OUI | weeklyPlan non régénéré → user doit cliquer ⚡ manuellement |

### État synthétique du flux onboarding normal (SBD)

```
obSaveStep6() → _obGenerateProgramCore()
  → programParams sans selectedDays ← ⚠️ manquant à ce stade
  → saveDB()

obFinish() [bouton "C'est parti"]
  → programParams.selectedDays = obSelectedDays ← ✅ corrigé ici
  → saveDB()
  → db.weeklyPlan null à ce point ← ⚠️

handleMagicChoice('programme') [400ms après, action user]
  → generateWeeklyPlan() ← ✅ weeklyPlan écrit ici
  → selectedDays disponible dans programParams ← ✅
```

**Le flux est fonctionnellement correct** pour les utilisateurs qui complètent le Magic Start. Le seul risque réel est l'utilisateur qui clique "Passer" dans Magic Start — il arrive sur le dashboard avec `db.weeklyPlan = null` et devra cliquer ⚡ manuellement.

---

## Findings hors scope (signaler sans agir)

1. **`doGenerateProgram()` est mort** (jamais appelée). Peut être supprimé sans impact. Attention : il est aussi présent dans `app.min.js` (à synchroniser si suppression).

2. **`app.min.js`** existe en parallèle de `app.js` (même ligne 1932 trouvée dans les deux). Si ce fichier est réellement utilisé en production, toutes les modifications de `app.js` doivent être reflétées dans `app.min.js`. L'index.html charge `js/app.js` (non-minifié).

3. **`_obGenerateProgramCore()` écrit `programParams` sans `selectedDays`** — si `obFinish()` n'est jamais atteinte (ex : crash, fermeture navigateur entre step 7 et le bouton "C'est parti"), `programParams.selectedDays` reste absent. Le moteur `generateProgram()` lit `obSelectedDays` directement (ligne 2044) plutôt que `programParams.selectedDays` — donc la génération initiale est correcte même sans persistance, mais les régénérations ultérieures (via `generateWeeklyPlan()`) liront `programParams.selectedDays` qui peut être null.

4. **`obSelectedDays` est `let` (lexical)** mais `pbGenerateProgram()` l'assigne directement (même fichier → même scope). Ce n'est pas un bug mais une dépendance inter-fonction implicite et fragile sur la fermeture lexicale.

5. **`renderProgramBuilderView()` et son stale check `_wpIsStaleVsRoutine()`** ne sont plus atteints depuis la navigation normale (v237 → `renderProgramBuilder()` → `renderProgrammeV2()`). Le stale check est effectivement inactif dans le chemin par défaut.
