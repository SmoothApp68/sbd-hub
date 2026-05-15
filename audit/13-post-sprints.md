# Audit 13 — Validation post-sprints A/B/C + Fixes
Date : 2026-05-15
SW : trainhub-v239

---

## AXE 1 — Syntaxe

**`node -c` :** `engine.js` ✅ · `app.js` ✅ · `coach.js` ✅ · `program.js` ✅

**`console.log` non guardés :** 0 — les 7 occurrences retournées par grep sont toutes à l'intérieur de blocs `if (DEBUG)` ou `if (window.DEBUG_STREAK === true)`. Grep sans contexte donnait faux-positifs. ✅

**`VOLUME_LANDMARKS` / `VOLUME_LANDMARKS_FR` :** 0 occurrence fonctionnelle. Uniquement des commentaires tombeau (`// VOLUME_LANDMARKS supprimé`). ✅

**`doGenerateProgram` :** défini à `app.js:1971` mais **jamais appelé nulle part**. Code mort confirmé. → Signalé hors scope.

---

## AXE 2 — Sprint C (EWMA / Stress articulaire / Insolvency)

### C1 EWMA : ✅ OK

- `updateEWMAForExo()` appelée dans `goFinishWorkout()` (ligne 28616-28625) pour chaque exercice de la séance, après `saveDBNow()`, avec un `saveDB()` explicite après la boucle EWMA. ✅
- `getSmoothedE1RM()` utilisée dans `computeStrengthRatiosDetailed()` (engine.js:2527-2529) avec fallback `getTopE1RMForLift()`. ✅
- `calcAndStoreLiftRanks()` N'utilise PAS `getSmoothedE1RM()` — travaille depuis les logs/bestPR pour les classements. ✅ (cohérent : les rangs doivent refléter le PR réel, pas l'EWMA lissé)

### C2 Stress articulaire : ✅ OK

- `getJointStressAlerts()` appelée dans `analyzeAthleteProfile()` à `engine.js:2911-2912`. ✅
- Section "🦴 Santé Articulaire" conditionnelle : `if (jointStressAlerts.length > 0)` à engine.js:2917. ✅ — silencieuse si aucune alerte.
- `INJURY_PROFILES` intact à engine.js:135, non modifié par les sprints. ✅
- Distinction Hard Lock (INJURY_PROFILES) / Smart Manager (JOINT_STRESS_TABLE) correctement maintenue. ✅

### C3 Insolvency : ✅ OK avec une note d'ordre

- `analyzeAthleteProfileWithInsolvency()` est bien l'appelant dans `app.js:17330` (remplace `analyzeAthleteProfile()` directement). ✅
- `_insolvencyLevel` utilisé dans `wpGeneratePowerbuildingDay()` à lignes 22394-22396 (orange: -1 série, red/critical: -2 séries sur accessoires). ✅
- `computeSRS()` inchangée — définie à `coach.js:509`, aucune modification dans les sprints. ✅
- **Note d'ordre :** L'Insolvency modulator agit **pendant la construction** de la liste d'exercices (dans le `.forEach` accessoires, lignes 22394-22396) — pas en post-loop. L'ordre post-loop réel est : `wpApplyImbalanceCorrections()` → `applyMorphoAdaptations()` → `wpApplySupersets()`. Architecturalement correct (insolvency réduit `sc` à la construction, imbalance/morpho ajustent la liste construite).
- Garde-fou `_insolvencyCheck.level === 'critical'` dans `generateWeeklyPlan()` (ligne 23223) : force `phase = 'deload'` indépendamment de `wpDetectPhase()`. Coexiste sans conflit avec `shouldDeload()` — les deux sont des chemins de décision indépendants. `shouldDeload()` est appelé dans `renderCoachTodayHTML()` (ligne 17572) pour l'affichage, pas dans `generateWeeklyPlan()`. ✅

---

## AXE 3 — Sprint B (Morpho)

- `applyMorphoAdaptations()` appelée **après** `wpApplyImbalanceCorrections()` : lignes 22497 (imbalance) puis 22501-22502 (morpho). ✅
- Hiérarchie BLESSURE > MORPHO : `isExerciseProtected()` dans `applyMorphoAdaptations()` (engine.js:3500-3508) vérifie les zones blessées avant toute substitution morpho. ✅
- Migration guard : `if (db.user.morpho === undefined) db.user.morpho = null;` à app.js:13314. ✅
- Bypass débutant dans `applyMorphoAdaptations()` : `if (level === 'debutant') return exercises;` à engine.js:3461. ✅
- Morpho-Card Dashboard : condition `db.user.onboarded && _morphoLevel !== 'debutant' && (db.user.morpho === null || db.user.morpho === undefined)` à app.js:17100-17101. ✅

---

## AXE 4 — Fix-Hardcoded

- `getMRV()` et `getMEV()` lisent depuis `getMuscleVolumeTarget()` → `MUSCLE_VOLUME_TARGETS` (engine.js:1192-1207). Aucune référence à l'ancienne `VOLUME_LANDMARKS`. ✅
- `getInitLoadCoeff()` lit `db.user._realLevel || db.user.level` (engine.js:3329). ✅
- `MUSCLE_TO_VL_KEY` : 0 occurrence fonctionnelle — uniquement le commentaire tombeau à engine.js:279. ✅
- `getMuscleVolumeTarget('Épaules')` : normalisation NFD → `'épaules'` → `'epaules'` → `MUSCLE_DISPLAY_TO_KEY['epaules']` = `'epaules'` → `MUSCLE_VOLUME_TARGETS.epaules` = `{MEV:6, MAV_low:10, MAV_high:16, MRV:20}`. ✅

**Note :** `MUSCLE_DISPLAY_TO_KEY` contient des entrées ('abdos', 'mollets', 'trapezes', 'avant_bras') qui n'ont pas de cible dans `MUSCLE_VOLUME_TARGETS`. `getMuscleVolumeTarget()` retourne `null` pour ces muscles — les appelants gèrent `null` via `|| {}` ou `|| 15`. Comportement attendu et intentionnel.

---

## AXE 5 — FIX 6 LP

- `LP_EXIT_RATIOS` défini à engine.js:4782. ✅
- `checkMultiLiftLPExit()` défini à engine.js:4787. ✅
- Appel dans `checkLPEnd()` à engine.js:1830-1831. ✅
- Ancien check gender-neutre `(squat >= bw*1.0 || bench >= bw*0.8)` supprimé. ✅
- `isInLP()` et `LP_CONFIG.dotsSeuil` inchangés. ✅

**⚠️ Déviation spec (mineure) :** Le spec spécifiait que `checkMultiLiftLPExit()` serait appelé **avant** la vérification de stagnation. L'implémentation l'appelle **après**. Conséquence : si stagnation détectée (2 lifts × 3 séances), la sortie se fait avec `reason: 'stagnation'` même si les seuils force sont aussi franchis. Fonctionnellement acceptable — stagnation est un signal de sortie aussi valide — mais la raison retournée diffère du message prévu.

---

## AXE 6 — Tests algorithmiques

| Test | Résultat | Note |
|---|---|---|
| T1 — `calcInsolvencyIndex([])` | ✅ Géré | Guard ligne 372 : `if (!logs \|\| logs.length === 0) return { index: 0, level: 'ok', details: {} }` |
| T2 — `applyMorphoAdaptations()` morpho=null | ✅ Géré | `if (!morpho) return exercises` ligne 3459 — null ET undefined catchés |
| T3 — `checkMultiLiftLPExit()` bw=0 | ✅ Géré | `var bw = (db.user && db.user.bw) \|\| 0` → `if (bw <= 0) return { exit: false }` |
| T4 — `getJointStressAlerts([])` | ✅ Géré | `calcWeeklyJointStress([])` retourne `{lombaires:0,...}` — tous < seuils → `[]` |
| T5 — `updateEWMAForExo()` deload=true | ✅ Géré | `if (isDeloadSession) return;` ligne 3793 — retour immédiat |
| T6 — `getMuscleVolumeTarget('Épaules')` | ✅ Géré | NFD normalize → 'epaules' → MUSCLE_DISPLAY_TO_KEY['epaules'] = 'epaules' → MUSCLE_VOLUME_TARGETS.epaules ✅ |

---

## AXE 7 — Champs orphelins

| Champ | Statut | Note |
|---|---|---|
| `cardioPreference` | 🔴 Orphelin | 0 référence dans app.js/engine.js/coach.js |
| `nutritionStrategy` | 🔴 Orphelin | `nutritionStrategyStartDate` existe (utilisé dans engine.js:1933) mais `nutritionStrategy` lui-même : 0 référence |
| `reverseDigestActive` | 🔴 Orphelin | 0 référence |
| `liftLevels` | 🔴 Orphelin | 0 référence |

Statut identique à l'audit 01 — ces champs n'ont pas été câblés dans les sprints récents. Hors scope de correction ici.

---

## AXE 8 — Service Worker

`program.js` et `coach.js` sont présents dans `ASSETS_TO_CACHE` du service-worker.js :
- Ligne 16 : `'/sbd-hub/js/program.js'` ✅
- Ligne 18 : `'/sbd-hub/js/coach.js'` ✅

Le problème signalé dans l'audit 03c est résolu.

---

## AXE 9 — Crash Hunting

### 9A — Inputs pathologiques

| Fonction | Input pathologique | Comportement actuel | Verdict |
|---|---|---|---|
| `calcInsolvencyIndex` | `computeSRS()` retourne `undefined` | `(srs && typeof srs.score === 'number')` → false → `srsScore = 70` (fallback) | ✅ Géré |
| `calcInsolvencyIndex` | `calcWeeklyFatigueCost()` retourne `NaN` | `NaN <= 0` est `false` → passe le guard → `rawIndex = NaN` → `finalIndex = NaN`, `level = 'ok'` (NaN >= seuils = false) | ⚠️ Bug silencieux — `index: NaN` retourné, mais level='ok' donc aucun effet sur le coach |
| `calcJointStressForExo` | `charge=0, e1rm=0` | `(e1rm > 0 && charge > 0)` est false → `intensity = 0.75` (fallback) | ✅ Géré |
| `calcJointStressForExo` | `nbSets=0` | `base * intensity * 0 * coeff = 0` pour chaque joint | ✅ Résultat 0 — pas de division par zéro |
| `calcJointStressForExo` | `exoName = "Développé Couché (Barre)"` | NFD normalize + parenthèses tolérées (indexOf) | ✅ Géré |
| `applyMorphoAdaptations` | `exercises = undefined`, `morpho ≠ null` | Guard `if (!morpho)` ne couvre pas ce cas → `exercises.map(...)` crasherait | ⚠️ Crash potentiel si morpho est renseigné et exercises=undefined. En pratique jamais atteint (wpGeneratePowerbuildingDay garantit un array). Risque théorique. |
| `applyMorphoAdaptations` | Exercice sans `.name` | `(exo.name \|\| '').toLowerCase()` | ✅ Géré |
| `applyMorphoAdaptations` | `morpho = {}` | `Object.keys({})` = `[]` → boucle vide → exercices inchangés | ✅ Géré |
| `checkMultiLiftLPExit` | `getSmoothedE1RM` retourne 0 pour tous | `checked = 0` → guard `if (checked === 0) return { exit: false }` | ✅ Géré |
| `checkMultiLiftLPExit` | `db.bestPR = undefined` | `var pr = db.bestPR \|\| {}` → `pr.squat = undefined` → `undefined \|\| 0 = 0` → checked=0 → guard | ✅ Géré |
| `checkMultiLiftLPExit` | `db.user.bw = null` | `(db.user.bw) \|\| 0` → `null \|\| 0 = 0` → `bw <= 0` catch | ✅ Géré |
| `updateEWMAForExo` | `currentE1RM = NaN` | `!NaN = true` → guard initial retourne immédiatement | ✅ Géré |
| `updateEWMAForExo` | `exoName = ""` | `!""` = true → guard retourne | ✅ Géré |
| `updateEWMAForExo` | `db.exercises = []` | `[][exoName]` = undefined → `db.exercises[exoName] = {}` assigne une propriété à un Array (légal JS, pas un crash) | ⚠️ Bug silencieux — array corrompu, mais guard ne vérifie pas le type. Quasi-impossible en production (migration DB initialise exercises en Object). |
| `getMuscleVolumeTarget` | `muscleName = 0` | `getMuscleKey(0)` → `if (!muscleName)` : `!0 = true` → `return null` | ✅ Géré |
| `getMuscleVolumeTarget` | `muscleName = undefined` | `if (!muscleName) return null` | ✅ Géré |

### 9B — Séquences incohérentes

| Scénario | Comportement observé | Risque réel |
|---|---|---|
| Mode powerbuilding→powerlifting en cours de cycle | `wpGeneratePowerbuildingDay()` continue d'être appelée pour les séances PL (même template). `applyMorphoAdaptations()` détecte `isPowerlifting` → notes uniquement, pas de substitutions. `calcBaseCapacity()` lit `trainingMode` directement depuis `db.user` → reflète le changement immédiatement. | Faible — la régénération du plan (bouton "Recalculer") est l'action normale attendue. Pas de crash. |
| EWMA après import Hevy massif | `updateEWMAForExo()` appelée uniquement dans `goFinishWorkout()`. Les séances importées n'alimentent PAS l'EWMA. `getSmoothedE1RM()` retombe sur `getTopE1RMForLift()` si `ewmaE1rm` absent. Si l'utilisateur a des séances mixtes (importées + GO), l'EWMA ne reflète que les séances GO. | **Moyen — comportement non documenté.** L'EWMA sous-estime la performance réelle pour les gros importeurs Hevy. Workaround naturel : l'EWMA se construit au fil des séances GO. |
| Morpho partiellement renseignée (Q1+Q3 Oui, fermeture avant confirmation) | `_obMorphoAnswers = { long_femurs: true, long_arms: true }`. `obSaveQ4()` : `!!undefined = false` → sauvegarde `{ long_femurs:true, short_arms_long_torso:false, long_arms:true, short_torso:false }`. "Non répondu" et "Répondu Non" indistinguables. | Faible — comportement accepté (spec validée `!!undefined === false`). Pas de crash. Choix de design documenté dans CLAUDE.md. |
| Insolvency cold start absolu (0 log) | `calcInsolvencyIndex([])` → guard → `{ index:0, level:'ok' }`. `calcWeeklyJointStress([])` → `{lombaires:0,...}`. `getJointStressAlerts([])` → `[]`. Section articulaire silencieuse. | ✅ Aucun risque |
| `db.user.age` non renseigné | `calcBaseCapacity()` : `db.user.age \|\| 0 = 0` → `age > 40` = false. Même avec `"abc"` → `"abc" > 40` = false (coercion JS). | ✅ Aucun risque |
| Double génération de plan | `generateWeeklyPlan()` désactive `btn` pendant le calcul. Tout synchrone → pas de race condition. | ✅ Aucun risque |

### 9C — Race conditions

**`saveDB()` après EWMA dans `goFinishWorkout()` :** `saveDBNow()` à la ligne 28543 persiste le log, puis `updateEWMAForExo()` calcule l'EWMA, puis `saveDB()` (debounced) persiste l'EWMA. Si le navigateur ferme entre les deux `save`, l'`ewmaE1rm` est perdu. Le prochain `goFinishWorkout()` repartira de la session précédente comme base EWMA — dégradation d'une séance, pas de corruption. **Non documenté mais comportement acceptable.**

**Sync cloud pendant Insolvency :** `syncToCloud()` et `calcInsolvencyIndex()` sont toutes deux synchrones → pas de race condition possible. Confirmé : aucune des nouvelles fonctions (EWMA, joints, insolvency, morpho) n'est `async`. ✅

### 9D — Régressions fonctions existantes

| Fonction | Signature | Fichier:ligne | Inchangée |
|---|---|---|---|
| `shouldDeload(logs, trainingMode)` | `(logs, trainingMode)` | app.js:18730 | ✅ |
| `wpDetectPhase()` | `()` | app.js:20931 | ✅ |
| `computeSRS()` | `()` | coach.js:509 | ✅ |
| `wpApplyImbalanceCorrections(exercises, dayKey, ratios)` | `(exercises, dayKey, ratios)` | app.js:21273 | ✅ |

**Ordre dans `wpGeneratePowerbuildingDay()` :**
```
22344 → _insolvency calculé (avant la boucle accessories)
22394 → Insolvency modulator appliqué (DANS la boucle accessories, sur sc)
22497 → wpApplyImbalanceCorrections(exercises, dayKey, ratios)
22501 → applyMorphoAdaptations(exercises, dayKey)
22505 → wpApplySupersets(exercises, pref)
```
Hiérarchie correcte : BLESSURE > IMBALANCE > MORPHO > SUPERSETS. Insolvency agit à la phase de construction (set count), pas post-construction. ✅

### Bugs identifiés (priorité correction)

| # | Sévérité | Fonction | Description | Fix suggéré |
|---|---|---|---|---|
| B1 | ⚠️ Mineure | `calcInsolvencyIndex` | `calcWeeklyFatigueCost()` retournant NaN passe le guard `<= 0`, produit `index: NaN`. Level = 'ok' donc aucun effet coach, mais le retour est incohérent. | Ajouter `\|\| isNaN(fatigueCost)` dans le guard : `if (!fatigueCost \|\| fatigueCost <= 0 \|\| isNaN(fatigueCost)) return { index: 0, level: 'ok', details: {} }` |
| B2 | ℹ️ Théorique | `applyMorphoAdaptations` | `exercises = undefined` avec `morpho ≠ null` → crash `.map()`. Jamais déclenché en production mais manque un guard. | Ajouter `if (!exercises \|\| !Array.isArray(exercises)) return exercises \|\| [];` après le guard morpho. |
| B3 | ℹ️ Design | `updateEWMAForExo` | `db.exercises` de type Array (legacy) → assignment silencieux, pas de crash mais état incohérent. | Ajouter `if (!db.exercises \|\| Array.isArray(db.exercises)) db.exercises = {};` |
| B4 | 📋 Spec | `checkLPEnd` | `checkMultiLiftLPExit()` appelé après stagnation (pas avant comme spécifié). | Déplacer l'appel avant le bloc stagnation si priorité spec requise. |
| B5 | 🗑 Code mort | `doGenerateProgram` | Défini à app.js:1971, jamais appelé. | Supprimer (hors scope bêta). |

---

## Findings hors scope

1. **Code mort `doGenerateProgram`** (app.js:1971) — défini uniquement, jamais appelé.
2. **4 champs orphelins `db.user`** : `cardioPreference`, `nutritionStrategy`, `reverseDigestActive`, `liftLevels` — câblage post-bêta.
3. **EWMA import Hevy** — les séances importées n'alimentent pas l'EWMA. Comportement connu, workaround naturel (GO séances seules construisent l'EWMA). À documenter dans CLAUDE.md.
4. **`MUSCLE_DISPLAY_TO_KEY` lacunes** — abdos/mollets/trapezes/avant-bras présents dans la map mais absents de `MUSCLE_VOLUME_TARGETS`. `getMuscleVolumeTarget()` retourne null pour ces muscles. Intentionnel mais source de nulls silencieux dans le volume coach.
5. **SW version v239** vs v150 (dernière entry CLAUDE.md) — CLAUDE.md section 11 "Versions & Historique" n'est plus à jour. À bumper.

---

## Score global estimé

**9.1 / 10**

**Justification :**
- Syntaxe : 4/4 fichiers propres, 0 console.log non guardé ✅
- Intégration C1/C2/C3 : chaînes complètes branchées, fallbacks corrects ✅
- Morpho : hiérarchie blessure > morpho respectée, guards null en place ✅
- Fix-Hardcoded : `VOLUME_LANDMARKS` complètement éradiqué, `getMuscleKey()` centralisé ✅
- FIX 6 LP : logique correcte, spec-deviation mineure sur l'ordre ⚠️
- Crash hunting : 2 bugs mineurs (B1 NaN passthrough, B2 guard exercises=undefined) — aucun n'est déclenché en production normale
- Architecture : ordre des transformations dans `wpGeneratePowerbuildingDay` cohérent avec la hiérarchie voulue
- Déductions : -0.5 spec deviation FIX 6, -0.4 bugs B1+B2 identifiés non bloquants
