# Audit 4 — Programme Builder, Onboarding, Réglages Profil

Audit en lecture seule des sections demandées. Aucune correction appliquée.

---

## 1. Programme Builder

### 1.1 Champs morts (écrits, jamais relus)

`pbGenerateProgram()` (app.js:9066) écrit quatre champs au niveau racine `db.user.*` qui sont **soit jamais relus, soit shadowés par `db.user.programParams.*`** :

| Champ | Écrit | Lectures hors écriture | État |
|---|---|---|---|
| `db.user.trainingFreq` | app.js:9075 | aucune | 🔴 mort |
| `db.user.trainingGoal` | app.js:9077 | aucune | 🔴 mort |
| `db.user.equipment` | app.js:9078 | aucune | 🔴 mort |
| `db.user.trainingDuration` | app.js:9076 | app.js:14795, 15086, 15470, 15619 (4 lectures) | ⚠️ vivant mais doublon avec `programParams.duration` |

Le moteur (`generateWeeklyPlan`, splits, etc.) lit exclusivement depuis `db.user.programParams.{freq,mat,duration,goals,injuries,cardio,selectedDays}`. Donc les écritures de `pbGenerateProgram` ne propagent rien au moteur.

### 1.2 Le chemin guidé n'appelle pas `generateWeeklyPlan()`

`pbStartGuided()` → étape 5 → `pbGenerateProgram()` (9066) :

- Appelle `generateProgram(...)` (app.js:9084) qui produit `db.generatedProgram` + `db.routine` + `db.routineExos`.
- **N'appelle pas `generateWeeklyPlan()`** à la fin (9107-9110 : `_pbState=null; saveDBNow(); showToast; renderProgramBuilder()`).
- Conséquence : `db.weeklyPlan` reste périmé. Le seul filet de sécurité est `_wpIsStaleVsRoutine()` ajouté en 9139 dans `renderProgramBuilderView`, qui détecte la dérive et regénère **au prochain affichage** — fragile (dépend d'un rendu) et bruité (regen déclenché par des incohérences mineures de casse/normalisation).
- Idem pour `pbSaveManualProgram()` (9041) : sauve `db.routine` / `db.manualProgram` / `db.routineExos`, **n'appelle pas `generateWeeklyPlan()`**.
- Idem pour le chemin onboarding `obGenerateProgram()` (1235) et `doGenerateProgram()` (1342) : génèrent `db.generatedProgram` mais pas `db.weeklyPlan`.

### 1.3 Câblage `pbGenerateProgram` → `db.routine` / `db.weeklyPlan`

- `db.routine` : ✅ écrit correctement (9088-9090) à partir de `result.forEach(d => routine[d.day] = ...)`.
- `db.weeklyPlan` : 🔴 jamais écrit. Pas d'appel à `generateWeeklyPlan()`. Voir 1.2.
- `db.user.programParams` : 🔴 **jamais écrit par le builder** — pourtant le moteur lit depuis là. Le builder écrit sur `db.user.trainingFreq/Duration/Goal/equipment` (cf. 1.1) qui sont des doublons morts. Conséquence : un programme créé via le builder guidé n'expose `freq` / `mat` / `duration` au moteur que si l'utilisateur a déjà fait l'onboarding ou ouvert les Réglages auparavant.

### 1.4 `renderProgramBuilderView()` vs `renderProgDaysList()`

Fonctions **distinctes**, pas de doublon :

- `renderProgramBuilderView(container)` (9134) : dispatcher haut niveau. Lit `db.user.trainingMode`, gère le sélecteur de phase (`wpForcePhase`), le bouton Modifier/Reset, puis délègue à `renderProgramPowerlifting/Powerbuilding/Musculation/BienEtre`.
- `renderProgDaysList()` (9420) : composant inférieur, rend la liste des 7 jours avec drag-drop. Appelé par les 4 wrappers de mode.

### 1.5 Autres remarques builder

- `pbStartGuided` initialise `_pbState.equipment = ['barbell','dumbbell','machine','cable']` (9860). `pbToggleEquip` permet de modifier. Mais `s.equipment` est passé tel quel à `generateProgram(goals, days, mat, ...)` en 9084 — `mat` côté moteur attend une chaîne (`'salle' | 'halteres' | 'maison'`), pas un tableau. Sans test, suspect d'incompatibilité.
- `pbAddExoToDay` (9025) utilise `prompt()` synchrone — bloque le thread, mauvaise UX mobile, et ne valide pas le nom contre `EXO_DB`.
- `pbResetProgram` (9684) **ne reset pas** `db.weeklyPlan` ni `db.user.programParams` — laisse des résidus.

---

## 2. Onboarding

### 2.1 `obFinish()` & `ONBOARDING_VERSION`

- `ONBOARDING_VERSION = 2` est déclaré dans `js/constants.js:9` **et** `js/engine.js:9` (doublon — sans danger car valeurs identiques).
- `obFinish()` (1863) :
  - Ligne 1864 : `db.user.onboarded = true` ✅
  - Ligne 1865 : `db.user.onboardingVersion = ONBOARDING_VERSION` ✅
- `obFinishWelcomeBack()` (1089) : écrit aussi `onboardingVersion = ONBOARDING_VERSION` mais **pas** `onboarded = true` — ok puisque la migration force `onboarded` à `true` (133) pour les anciens.

### 2.2 Conflit entre `db.user.onboarded` et `needsOnboarding()`

Pas de conflit fonctionnel, mais logique partiellement redondante :

- `needsOnboarding()` (887) : `!db.user.onboarded || !db.user.onboardingVersion || db.user.onboardingVersion < ONBOARDING_VERSION`.
- `defaultDB` (82) : `onboarded:false, onboardingVersion:0`.
- migration 133 : promeut `onboarded=true` si `undefined` (utilisateurs hérités).
- migration 175 : si `onboardingVersion` indéfini, met `1` si `onboarded`, `0` sinon.

Conséquence : pour un utilisateur hérité sans `onboardingVersion`, après migration : `onboarded=true`, `onboardingVersion=1` → `needsOnboarding()` retourne `true` (1 < 2) → `showOnboarding()` envoie sur l'écran welcome-back (915). Cohérent.

⚠️ Le seul cas étrange : si un utilisateur a `onboarded=false, onboardingVersion=2` (impossible en pratique sauf manipulation manuelle), `needsOnboarding()` renvoie `true` parce que `!onboarded` — donc l'écran est rejoué. C'est probablement le comportement voulu mais à confirmer.

### 2.3 Population de `db.user.programParams`

`obSaveStep5` (1196) lit `obSelectedDays` depuis le DOM mais **ne l'écrit pas dans `programParams`**. Les valeurs `selectedDays` sont seulement transmises à `generateProgram()` via la closure d'onboarding.

`obGenerateProgram` (1272) écrit :
```js
db.user.programParams = { goals, freq, mat, duration, injuries, cardio, level };
```
**Manque `selectedDays`** — pourtant le moteur (`generateWeeklyPlan`, app.js:15289) lit `params.selectedDays` et fallback sur `allDays.slice(0, freq)` (Lun→…), qui peut ne pas correspondre aux jours choisis par l'utilisateur.

`doGenerateProgram` (1345) — même payload, même manque de `selectedDays`.

Idem `mat`/`duration` : ils sont bien sauvés. ✅

🔴 **Bug confirmé** : après onboarding, `params.selectedDays` est `undefined`. La 1ère regen de `weeklyPlan` retombe sur le fallback Lundi-Mardi-Mercredi-… au lieu des jours réellement choisis. La cohérence n'est rétablie que si l'utilisateur visite l'écran Réglages et clique sur les jours (11975-11979 écrit alors `programParams.selectedDays`).

### 2.4 Autres remarques onboarding

- `obFinish` (1863) ne déclenche pas `generateWeeklyPlan()`. La 1ère génération arrive paresseusement via `_wpIsStaleVsRoutine()` au 1er rendu de Programme.
- `obSaveStep1` (1106) écrit `db.user.cycleTracking.cycleLength` seulement si la valeur lue est `>= 21 && <= 45`, sinon valeur par défaut conservée. Ok mais silencieux côté UX.

---

## 3. Réglages Profil

### 3.1 Champs UI Settings non lus par le moteur

Tous les champs visibles dans `renderSettingsProfile()` (11765) et `fillSettingsFields()` (11486) ont **au moins un consommateur**. Détail :

| Champ Settings | Stocké dans | Lu par |
|---|---|---|
| `settingsLevel` | `db.user.level` + `programParams.level` | engine, programme, dashboard |
| `settingsGender` | `db.user.gender` | engine, cycle |
| `settingsTrainingMode` | `db.user.trainingMode` | dispatcher mode, viewer |
| `settingsUIDetail` | `db.user.uiDetail` | `t()` (app.js:11), `shouldShow()` (57) ✅ |
| `settingsHeight/Age/TargetBW` | `db.user.{height,age,targetBW}` | onboarding pre-fill, calcul TDEE |
| `settingsKcalBase/BWBase` | `db.user.{kcalBase,bwBase}` | calcul TDEE |
| `settingsGoals` | `programParams.goals` | engine, splits |
| `settingsFreq` | `programParams.freq` | engine, weeklyPlan |
| `settingsDays` | `programParams.selectedDays` | engine, weeklyPlan (15289) |
| `settingsMat` | `programParams.mat` | engine |
| `settingsDuration` | `programParams.duration` | engine, weeklyPlan |
| `settingsInjuries` | `programParams.injuries` | engine |
| `settingsCardio` | `programParams.cardio` | engine |
| `settingsSupersets` | `db.user.supersetPreference` | engine |
| `settingsPrehabToggle` | `db.user.prehabEnabled` | engine prehab |
| `settingsCycleEnabled/Date/Length` | `db.user.cycleTracking` | dashboard, planning |

Aucun champ visible n'est mort. **Pas de zombie côté UI Settings.** ✅

### 3.2 `uiDetail` est-il utilisé ?

Oui — utilisé en lecture aux lignes 11 et 57 (`t()` et `shouldShow()`). Aucun problème.

### 3.3 Incohérences de surface entre Settings et Builder

- `programParams.freq` modifié dans Settings ne déclenche **pas** `generateWeeklyPlan()` automatiquement. La regen attend un rendu de Programme + détection de staleness. Idem `selectedDays`, `mat`, `duration`, `goals`.
- `pbGenerateProgram` (cf. 1.1) écrit sur `db.user.trainingFreq` au lieu de `programParams.freq`, ce qui crée une 2ᵉ source de vérité non synchronisée avec celle des Settings.
- Si l'utilisateur change `freq` dans Settings après avoir utilisé le builder, deux valeurs distinctes existent en DB : `db.user.trainingFreq=4` (builder) et `db.user.programParams.freq=5` (settings). Seule la 2ᵉ est lue par le moteur.

---

## Synthèse — issues à traiter

### 🔴 P0 — bugs fonctionnels

1. **`pbGenerateProgram` n'alimente pas `programParams`** (9075-9078). Écrit sur `db.user.trainingFreq/Goal/equipment` qui ne sont jamais relus → moteur dépend du dernier état Settings/Onboarding.
2. **`obGenerateProgram` et `doGenerateProgram` ne sauvent pas `selectedDays`** dans `programParams` (1272, 1345). `weeklyPlan` regénéré tombera sur le fallback Lun-Mar-Mer-… au lieu des jours choisis par l'utilisateur.
3. **Aucun chemin de génération n'appelle `generateWeeklyPlan()`** à la fin (`pbGenerateProgram`, `pbSaveManualProgram`, `obGenerateProgram`, `doGenerateProgram`). Filet de sécurité actuel : `_wpIsStaleVsRoutine()` au prochain rendu, fragile.

### ⚠️ P1 — cohérence / dette

4. **`db.user.trainingFreq`, `trainingGoal`, `equipment` sont des champs morts** — supprimer du builder ou rediriger vers `programParams`.
5. **`pbResetProgram` ne reset pas `db.weeklyPlan` ni `db.user.programParams`** (9684) — laisse des résidus.
6. **`pbAddExoToDay` utilise `prompt()`** (9025) — bloquant, mauvaise UX mobile, pas de validation contre `EXO_DB`.
7. **Settings ne déclenche pas regen weeklyPlan** — modification de `freq`/`days`/etc. en Settings repose sur la détection de staleness au prochain rendu Programme.
8. **`ONBOARDING_VERSION` déclaré 2 fois** (`constants.js:9`, `engine.js:9`) — risque de divergence si l'un est mis à jour sans l'autre.

### ℹ️ P2 — vérifier

9. **`pbGenerateProgram` passe `s.equipment` (tableau) à `generateProgram(...mat...)`** (9084) qui attend `'salle'|'halteres'|'maison'`. À tester ou vérifier la compatibilité côté moteur.
