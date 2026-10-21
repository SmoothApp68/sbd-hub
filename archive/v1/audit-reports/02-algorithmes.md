# Audit 2/4 — Algorithmes

> Tests exécutés via `node audit/test-algos.js`. 24 cas couverts, **22 OK / 2 KO**.
> (Les fonctions ont été copiées depuis `js/engine.js` et `js/app.js` ligne par ligne, avec un mock `db` minimal.)

## Résultats des tests

| # | Fonction (source)                            | Input                                         | Attendu                                          | Obtenu                                | OK ? |
|---|----------------------------------------------|-----------------------------------------------|--------------------------------------------------|----------------------------------------|------|
|  1| `wpCalcE1RM` (app.js:13842) — RPE-adj       | `(140, 3, 8)`                                 | ~157.5 (modèle Brzycki + reps-to-failure)        | **157.5**                              | OK   |
|  2| `wpCalcE1RM` — Brzycki pur (rpe=null)       | `(140, 3, null)`                              | ~148.2                                           | **148.2**                              | OK   |
|  3| `computeBackOffSets` (engine.js:1868)        | `(140, 9, 8, 3)` overshoot                    | 12% reduction → arrondi 2.5 → 122.5kg, 3 sets    | weight=**122.5**, reps=5, rpe=6.5      | OK   |
|  4| `computeBackOffSets` — undershoot           | `(140, 6, 8, 3)`                              | +2.5% → 142.5kg + suggestion `bonus_set` à 147.5 | weight=**142.5**, suggestion OK        | OK   |
|  5| `processGrind` (engine.js:1921)              | `{rpe:7, grind:true}`                         | rpe ramené à 9                                   | **9**                                  | OK   |
|  6| `processGrind`                               | `{rpe:9.5, grind:true}`                       | rpe inchangé 9.5                                 | **9.5**                                | OK   |
|  7| `getSetRPELabel` (engine.js:1932)            | `{rpe:9, grind:true}`                         | `"9G"`                                           | `"9G"`                                 | OK   |
|  8| `getSetRPELabel`                             | `{rpe:9.5, grind:true}`                       | `"9.5G"`                                         | `"9.5G"`                               | OK   |
|  9| `getSetRPELabel` — sans `processGrind`       | `{rpe:7, grind:true}`                         | `"9G"` (selon spec « min 9 »)                    | **`"7G"`**                             | **KO** |
| 10| `calcMacrosCibles` (engine.js:1143) recompo  | `(2500, 98)` goal=recompo, gender=unspecified | prot≈235 / carb≈228 / fat≈72 / kcal=2500          | `{prot:235, carb:228, fat:72, kcal:2500}` | OK |
| 11| `calcMacrosCibles` bien-être                 | `(2200, 80)` mode=bien_etre                   | prot=128 / carb=275 / fat=73 / kcal=2200          | `{prot:128, carb:275, fat:73, kcal:2200}` | OK |
| 12| `calcMacrosCibles` masse                     | `(2800, 80)` goal=masse                       | prot=156 / carb≈414 / fat=58 / kcal=2800          | `{prot:156, carb:414, fat:58, kcal:2800}` | OK |
| 13| `getMRV` (engine.js:1035)                    | `('chest', 'M')`                              | 20                                                | **20**                                 | OK   |
| 14| `getMRV`                                     | `('chest', 'F')`                              | 23 (selon spec test)                              | **20**                                 | **KO** |
| 15| `getMRV` (vrai contrat)                      | `('chest', 'female')`                         | 23                                                | **23**                                 | OK   |
| 16| `getPrehabKey` (engine.js:2049)              | `('bench', 40, [])`                           | `"bench_low_readiness"`                           | OK                                     | OK   |
| 17| `getPrehabKey`                               | `('squat', 70, [{zone:'genou',active:true}])` | `"squat_knee_injury"`                             | OK                                     | OK   |
| 18| `getPrehabKey`                               | `('deadlift', 70, [])`                        | `"deadlift_standard"`                             | OK                                     | OK   |
| 19| `checkNutritionStagnation` (engine.js:1725) — masse stable | 14 j @ 80kg, `programParams.goals=['masse']` | `{adjust:150, type:'increase'}`             | OK                                     | OK   |
| 20| `checkNutritionStagnation` — masse descendant | 14 j -1kg                                    | `null`                                           | `null`                                 | OK   |
| 21| `checkNutritionStagnation` — sans `programParams` | 14 j @ 80kg, `db.user.goal='masse'`       | fallback `'maintien'` → null (BUG potentiel)     | `null`                                 | OK*  |
| 22| `getSetRPELabel` — vide                      | `{}`                                          | `"—"`                                            | `"—"`                                  | OK   |
| 23| `getSetRPELabel`                             | `{rpe:8}`                                     | `"8"`                                            | `"8"`                                  | OK   |
| 24| `getSetRPELabel` — grind sans rpe            | `{grind:true}`                                | comportement à observer                          | `"—G"`                                 | OK** |

\* OK fonctionnellement (le fallback est exécuté), mais le résultat révèle un **bug logique**.
** Comportement « cosmétique » potentiellement étrange — voir bugs ci-dessous.

## Bugs trouvés

### 🟠 Bug #1 — `getSetRPELabel` n'enforce pas le minimum 9 du Grind
- **Fichier** : `js/engine.js:1932-1936`
- **Symptôme** : un set `{rpe:7, grind:true}` affiché directement (sans passage préalable par `processGrind`) renvoie `"7G"` au lieu de `"9G"` documenté.
- **Cause** : la spec « grind = RPE 9 minimum » est portée par `processGrind`. `getSetRPELabel` ne fait que concaténer `set.rpe + 'G'` sans clamp.
- **Risque** : si une rendering path lit un set persisté avant que `processGrind` y soit passé (ou si quelqu'un construit un set à la main), le label sera incorrect.
- **Reco** : soit clamp dans `getSetRPELabel` (`var r = set.grind ? Math.max(set.rpe || 9, 9) : set.rpe`), soit garantir que `processGrind` est appelé sur tous les sets `grind` avant persist (auditer les chemins d'écriture).

### 🟠 Bug #2 — `getMRV` attend `'female'` mais le projet n'a pas de standard
- **Fichier** : `js/engine.js:1035-1039`
- **Symptôme** : `getMRV('chest', 'F')` renvoie 20 (homme) car le test est strict `gender === 'female'`.
- **Constat aggravant** : `getMRV` n'est appelée **nulle part** dans le code (vérifié via `grep getMRV\\(`). Fonction morte → bug théorique mais sans impact runtime aujourd'hui.
- **Reco** : soit supprimer la fonction (cf. audit 1/4 dead code), soit normaliser le paramètre (`gender === 'female' || gender === 'F'`) et corriger les callers à venir.

### 🟠 Bug #3 — `checkNutritionStagnation` ignore `db.user.goal`
- **Fichier** : `js/engine.js:1737-1738`
- **Symptôme** : la fonction lit **uniquement** `db.user.programParams.goals[0]`. Si l'utilisateur n'a pas (re)généré son programme depuis l'onboarding ou si `programParams.goals` n'a pas été propagé, le goal réel `db.user.goal` (présent depuis `defaultDB`) est ignoré et la fonction retombe sur `'maintien'` (donc `null`).
- **Risque** : la stagnation nutritionnelle n'est **jamais** détectée pour ces utilisateurs.
- **Reco** : fallback explicite : `goal = goals[0] || db.user.goal || 'maintien'`.

### 🔴 Bug #4 — Mismatch `programParams.freq` vs `programParams.frequency`
- **Fichier** : `js/app.js:9298`
- **Symptôme** : `var freq = (db.user.programParams && db.user.programParams.frequency) || 4;`
- **Mais** : l'onboarding (`js/app.js:1254`, `1327`), le formulaire programme (équivalents) et toutes les autres lectures (`engine.js:1855`, `app.js:14090`, `14131`, `14453`) utilisent la clé `freq`. La clé `frequency` n'est **jamais écrite**.
- **Risque** : la fonction concernée (`app.js:9298`) reçoit toujours le défaut `4`, peu importe la fréquence réelle de l'utilisateur. Logique programme partiellement cassée.
- **Reco** : remplacer `programParams.frequency` par `programParams.freq` à la ligne 9298 (ou un fallback `freq || frequency`).

### 🟡 Code smell — `Math.max(1.0, 0.73)` inutile
- **Fichier** : `js/engine.js:1162` dans `calcMacrosCibles`.
- **Code** : `var fatPerKg = gender === 'female' ? Math.max(1.0, 0.73) : 0.73;`
- **Constat** : `Math.max(1.0, 0.73) === 1.0` toujours. La construction `Math.max(...)` n'a aucun effet — vestige d'une ancienne formule.
- **Risque** : aucun fonctionnel, mais c'est un drapeau rouge à la lecture (fait croire à une logique conditionnelle).
- **Reco** : remplacer par `var fatPerKg = gender === 'female' ? 1.0 : 0.73;`.

### 🟡 Code smell — paramètre `e1rmForLift` ignoré dans `processGrind` quand `set.rpe` existe
- **Fichier** : `js/engine.js:1921-1930`
- **Constat** : si `set.rpe` est déjà renseigné, `e1rmForLift` n'est plus utilisé. Comportement attendu, mais à documenter (un appelant pourrait penser que la charge / e1RM influence aussi le clamp).

## Score : 7,5 / 10

**Points positifs**
- Cœur algo solide : `wpCalcE1RM`, `computeBackOffSets`, `processGrind`, `calcMacrosCibles`, `getPrehabKey` retournent les valeurs attendues sur tous les cas testés.
- Logique de back-off (overshoot/undershoot/big undershoot) implémentée avec arrondi 2.5kg cohérent et suggestion `bonus_set` correctement levée.

**Points à corriger**
- `programParams.frequency` jamais écrit, lu une fois — bug fonctionnel certain (-1 pt).
- `checkNutritionStagnation` n'utilise pas `db.user.goal` en fallback — utilisateurs sans `programParams` n'ont jamais d'alerte (-0,75 pt).
- `getSetRPELabel` ne clamp pas le min 9 du grind, contrat implicite avec `processGrind` (-0,5 pt).
- `getMRV` API gender incohérente (`'female'` strict) — atténué par le fait que la fonction est dead code (-0,25 pt).

> Tests reproductibles : `node audit/test-algos.js` (sortie verbeuse + JSON récapitulatif).
