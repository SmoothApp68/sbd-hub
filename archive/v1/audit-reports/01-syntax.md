# Audit 1/4 — Syntaxe et qualité code

## Syntaxe JS : 5/5 fichiers OK

| Fichier            | `node -c` |
|--------------------|-----------|
| `js/app.js`        | OK        |
| `js/engine.js`     | OK        |
| `js/coach.js`      | OK        |
| `js/program.js`    | OK        |
| `js/supabase.js`   | OK        |

Aucune erreur de parsing.

## Taille des fichiers

| Fichier            | Lignes  |
|--------------------|---------|
| `js/app.js`        | 19 139  |
| `js/engine.js`     |  2 066  |
| `js/coach.js`      |    384  |
| `js/program.js`    |    428  |
| `js/supabase.js`   |  4 914  |
| `index.html`       |  3 787  |
| **Total**          | **30 718** |

`js/app.js` à 19 k lignes est un god-file qui concentre l'essentiel de la logique UI, gamification, body, charts, programme, etc. À découper en modules à terme.

## console.log trouvés : 11

Dont 5 protégés par `if (DEBUG)` (acceptables).
Les **6 logs non gardés** restants à nettoyer ou conditionner :

| Fichier | Ligne | Préfixe / contenu                                        |
|---------|------:|----------------------------------------------------------|
| app.js  |   117 | `[Migration] Données migrées de … vers …`               |
| app.js  |  2690 | `[calcStreak] logs=… dropped=…`                          |
| app.js  |  2696 | `[calcStreak] first 5 weeks: …`                          |
| app.js  |  2697 | `[calcStreak] last 5 weeks: …`                           |
| app.js  |  7986 | `renderVolumeChart period vl.length= db.logs.length=`    |
| app.js  |  9045 | `Programme manuel sauvegardé: { … }`                     |
| app.js  |  9093 | `Programme généré sauvegardé: { … }`                     |

Le log de migration (l. 117) est utile à conserver mais devrait passer derrière `DEBUG`. Les logs `[calcStreak]` non-gardés (l. 2690, 2696, 2697) semblent oubliés alors que les autres lignes du même bloc utilisent `if (DEBUG)`. Les deux logs « Programme … sauvegardé » sont du debug visible en prod.

## TODO/FIXME trouvés : 1

| Fichier | Ligne | Note                                                                                 |
|---------|------:|--------------------------------------------------------------------------------------|
| app.js  |   191 | `TODO : soit retirer du formulaire, soit câbler dans wpCheckActivityConflicts.`     |

TODO honnête : `db.user.secondaryActivities` est collecté en onboarding mais jamais lu. Voir section « Champs DB orphelins ».

Aucun `FIXME`, `HACK`, `XXX`.

## Ancien nom app trouvé : 2 occurrences

| Fichier | Ligne | Contenu                                            |
|---------|------:|----------------------------------------------------|
| app.js  | 19039 | `ctx.fillText('SBD Hub', 400, 360);`              |
| app.js  | 19047 | `text: 'Nouveau record sur SBD Hub ! 💪'`          |

Aucune trace de « SBD Elite » / « Elite Tracker » / « EliteTracker ». Les deux occurrences sont l'identité actuelle « SBD Hub » (carte de partage + texte de partage), à conserver. Aucune marque legacy résiduelle.

## Dead code identifié

44 fonctions définies dans `js/app.js` n'apparaissent **qu'une seule fois** dans tout le code (JS + `index.html`) — c.-à-d. uniquement leur ligne de définition. Aucun appel direct, callback, attribut `onclick`, ni dispatch dynamique (pas de `window[name]`/`eval`). Ce sont des candidats sûrs à la suppression.

| # | Fonction                    | Ligne def | Note                                                        |
|---|-----------------------------|----------:|-------------------------------------------------------------|
| 1 | `calcLiftWeight`            | 11401     |                                                             |
| 2 | `checkProgressionSuggestions` | (app.js) |                                                             |
| 3 | `coachSelectDay`            | 12476     | Remplacée par dispatcher coach actuel                       |
| 4 | `getObSteps`                |   959     |                                                             |
| 5 | `getPerfIncrement`          | (app.js)  |                                                             |
| 6 | `getPersonalProgressionRate`| (app.js)  |                                                             |
| 7 | `getRepRange`               | (app.js)  |                                                             |
| 8 | `getRestSeconds`            | (app.js)  |                                                             |
| 9 | `getSetLabel`               | (app.js)  |                                                             |
|10 | `getSetStyle`               | (app.js)  |                                                             |
|11 | `getStreakFreezes`          |  2796     |                                                             |
|12 | `getWarmupSets`             | (app.js)  |                                                             |
|13 | `getWeekKey`                |  6091     | Doublon de `_getWeekKey` (l. 2859), seul `_getWeekKey` est utilisé |
|14 | `getWorkSets`               | (app.js)  |                                                             |
|15 | `goShowAutoRegSuggestion`   | (app.js)  |                                                             |
|16 | `mapTrainingModeToGoal`     | (app.js)  |                                                             |
|17 | `obNext`                    |   971     | Remplacée par `sobNext` (supabase.js:3237) — seul `sobNext` est référencé dans `index.html` |
|18 | `obSkip`                    |  1063     | Remplacée par flux `sobNext`                                |
|19 | `onMuscleGroupClick`        |  3903     |                                                             |
|20 | `pbSliderInit`              | (app.js)  |                                                             |
|21 | `previewManualImport`       | (app.js)  |                                                             |
|22 | `progAddDay`                |  9544     | Stub d'une ligne forwardant vers `pbEditExisting` — devenu inutile |
|23 | `progRemoveDay`             | (app.js)  |                                                             |
|24 | `regenerateWeeklyPlan`      | (app.js)  |                                                             |
|25 | `renderCoachBriefing`       | 12723     |                                                             |
|26 | `renderCoachDayDetail`      | (app.js)  |                                                             |
|27 | `renderCoachReports`        | (app.js)  |                                                             |
|28 | `renderDeloadBanner`        | (app.js)  |                                                             |
|29 | `renderDotsWilks`           | (app.js)  |                                                             |
|30 | `renderFormScoreDash`       | (app.js)  |                                                             |
|31 | `renderMuscleHeatmap2D`     |  6766     |                                                             |
|32 | `renderProgressionSuggestions` | (app.js) |                                                            |
|33 | `renderReadinessSparkline`  | (app.js)  |                                                             |
|34 | `renderRecentPRs`           |  6722     |                                                             |
|35 | `renderTodayProgram`        |  6503     |                                                             |
|36 | `renderWeeklySummary`       | (app.js)  |                                                             |
|37 | `selectCardio`              |  1318     |                                                             |
|38 | `selectPath`                | (app.js)  |                                                             |
|39 | `toggleInjury`              | (app.js)  |                                                             |
|40 | `toggleLiftCard`            | (app.js)  |                                                             |
|41 | `toggleScExo`               | (app.js)  |                                                             |
|42 | `toggleSession`             | (app.js)  |                                                             |
|43 | `wpCheckPainScore`          | (app.js)  |                                                             |
|44 | `wpIsIsolation`             | (app.js)  |                                                             |
|45 | `wpRound05` / `wpRpeForPhase` | (app.js)|                                                             |

> Méthode : pour chaque `^function NAME(` extrait, on compte le nombre d'occurrences brutes du token dans `js/*.js` + `index.html`. Toutes les fonctions ci-dessus sortent à `1` occurrence (la définition seule). Vérification croisée : aucun usage en `window[…]`, `globalThis[…]`, `eval(…)` dans la base.

**Estimation gain** : suppression d'environ 600–1 200 lignes de `js/app.js` selon la taille moyenne de ces 44 fonctions (le top 5 inspecté — `renderRecentPRs`, `renderMuscleHeatmap2D`, `renderTodayProgram`, `renderCoachBriefing`, `selectCardio` — fait à lui seul plusieurs dizaines de lignes chacune).

> Cas particulier : `obNext` / `obSkip` / `getObSteps` / `selectCardio` ont été remplacés par le flux Supabase onboarding (`sobNext` etc.). Tout le bloc `obXxx` (l. 869–1316 environ) est candidat à un nettoyage groupé.

## Champs DB orphelins

Champs `db.user.X` ajoutés dans `defaultDB()` / migration `migrateDB` (`js/app.js:81–193`) mais **jamais lus** dans `js/app.js`, `js/engine.js`, `js/coach.js`, `js/program.js`, `js/supabase.js` :

| Champ                    | Écritures | Lectures | État                                                                          |
|--------------------------|----------:|---------:|-------------------------------------------------------------------------------|
| `user._realLevel`        | 3         | 0        | Écrit dans `engine.js:1068, 1070` + init `app.js:168`. Aucun lecteur.        |
| `user.cardioPreference`  | 1         | 0        | Init seul. Champ promis non câblé.                                            |
| `user.nutritionStrategy` | 1         | 0        | Init seul. Aucun lecteur (la stratégie active n'est lue qu'indirectement via `nutritionStrategyStartDate`). |
| `user.reverseDigestActive` | 1       | 0        | Init seul.                                                                    |
| `user.liftLevels`        | 1         | 0        | Init seul (objet vide), jamais alimenté ni lu.                                |
| `user.secondaryActivities` | 2       | 2        | TODO honnête au-dessus : lectures sont uniquement la persistance/onboarding, pas d'usage moteur. |
| `user.tdeeAdjustment`    | 4         | 1        | Une seule lecture — usage limité, à valider.                                  |

À retirer ou câbler — actuellement, ils gonflent le payload localStorage / cloud sans valeur fonctionnelle.

## Score : 7 / 10

**Points positifs**
- Syntaxe propre sur les 5 fichiers (5/5).
- Aucune marque legacy résiduelle dans le code.
- Très peu de TODO/FIXME (1 seul, et il est documenté).

**Points à corriger**
- `js/app.js` à 19 139 lignes — découpage à planifier (-2 pts).
- 44 fonctions mortes (~600–1 200 lignes) dont un bloc onboarding entier (`obNext`/`obSkip`/`getObSteps`) remplacé mais non supprimé (-1 pt).
- 7 logs `console.log` non gardés en prod (calcStreak, programme manuel/généré, renderVolumeChart) (-0,5 pt).
- 5 champs `db.user` complètement orphelins (cardioPreference, nutritionStrategy, reverseDigestActive, liftLevels, _realLevel) qui occupent l'espace de stockage utilisateur sans être lus (-0,5 pt).
