# Audit 7 Axes — TrainHub v239 — Mai 2026
## LECTURE SEULE — Aucun fix, aucun commit dans ce document

---

## AXE 1 — Cohérence e1RM : source de vérité

### Trois sources, zéro synchronisation garantie

| Source | Où | Utilisée par |
|---|---|---|
| `db.bestPR` | localStorage | `generateCoachAlgoMessage`, `calcTDEE`, affichage PR |
| `exo.maxRM` | `db.logs[].exercises[].maxRM` | `recalcBestPR`, `calcAndStoreLiftRanks`, `computeStrengthRatios` (app.js) |
| Recalcul depuis `allSets` | `getTopE1RMForLift` (engine.js:2489) | `computeStrengthRatiosDetailed`, `analyzeAthleteProfile` |

### Deux fonctions de ratios parallèles — interfaces incompatibles

**`computeStrengthRatios()`** (app.js:14025) — utilise `matchExoName` + scan `exo.maxRM` :
```js
ratios.squat_deadlift = { value: squat/deadlift, ideal: [0.80, 0.85], label: '...' }
```
Appelée par : `renderStrengthRatios`, `wpApplyImbalanceCorrections` (ligne 22345), `generateCoachAlgoMessage`.

**`computeStrengthRatiosDetailed()`** (engine.js:2514) — utilise `getTopE1RMForLift` (double source : maxRM + recalcul allSets) :
```js
return { squat_dead: ..., squat_bench: ..., bench_dead: ..., raw: { squat, bench, deadlift } }
```
Appelée par : `analyzeAthleteProfile` uniquement.

**Divergences de noms** : `squat_dead` ≠ `squat_deadlift`. `wpApplyImbalanceCorrections` lit `ratios.squat_deadlift.value` (clé de la version app.js), `analyzeAthleteProfile` lit `ratios.squat_dead` (clé engine.js). Ce sont bien deux fonctions différentes — pas un alias.

**Risque** : Un utilisateur peut avoir des corrections d'imbalance actives (via `computeStrengthRatios`) mais des sections Coach silencieuses (via `computeStrengthRatiosDetailed`) si les sources divergent. La version app.js est moins robuste (scanne uniquement `maxRM`, ignore les sessions sans `maxRM` stocké).

### `recalcBestPR` (app.js:1252)

```js
db.logs.forEach(log => {
  log.exercises.forEach(exo => {
    if (!type || !exo.maxRM || exo.maxRM <= 0) return;
    if (exo.maxRM > db.bestPR[type]) db.bestPR[type] = exo.maxRM;
  });
});
```

Lit uniquement `exo.maxRM`. Si une séance importée (CSV Hevy) ne stocke pas `maxRM` ou si l'exercice est nommé différemment (pas reconnu par `getSBDType`), le PR est sous-estimé dans `db.bestPR`.

### `getTopE1RMForLift` (engine.js:2489)

Scanne `maxRM` ET recalcule depuis `allSets` via `wpCalcE1RM`. Plus robuste, mais **aucun fallback vers `db.bestPR`**. Peut sous-estimer si les logs récents ne contiennent pas de sets avec reps+poids valides.

### Verdict AXE 1

**Sévérité : Moyen**. Pas de source unique de vérité. Les trois sources peuvent diverger silencieusement. `db.bestPR` est le moins fiable mais est utilisé dans le rendu visible (PRs affichés à l'utilisateur). Aucun mécanisme de réconciliation automatique entre les trois sources.

---

## AXE 2 — Volume muscle mapping

### Triple source de landmarks, valeurs divergentes

| Constante | Fichier | Clés | Usage |
|---|---|---|---|
| `MUSCLE_VOLUME_TARGETS` | engine.js:46 | 8 clés EN (`quads`, `ischio`, `pecs`, `dos`, `epaules`, `biceps`, `triceps`, `fessiers`) | `getVolumeByMuscleGroup`, `analyzeAthleteProfile` |
| `VOLUME_LANDMARKS` | engine.js:236 | 12 clés EN (`chest`, `back`, `shoulders`, `quads`, `hamstrings`, `glutes`, `biceps`, `triceps`, `calves`, `abs`, `traps`, `forearms`) | Coach tab, `renderStrengthRatios`, app.js:8539/8576 |
| `VOLUME_LANDMARKS_FR` | program.js:36 | 12 clés FR (`Pectoraux`, `Dos`, `Épaules`, …) | app.js:17495, 17604 (coach weekly volume) |

**Exemples de valeurs divergentes (MRV) :**
| Muscle | `MUSCLE_VOLUME_TARGETS` | `VOLUME_LANDMARKS` | `VOLUME_LANDMARKS_FR` |
|---|---|---|---|
| Pecs | 22 | 20 | 22 |
| Dos | 25 (clé `dos`) | 23 (clé `back`) | 26 (clé `Dos`) |
| Épaules | 20 | 18 | 20 |

Un utilisateur peut voir MRV=20 dans un écran et MRV=22 dans un autre pour les mêmes pectoraux.

### Gaps dans `MG_TO_KEY` (mapping muscle → `MUSCLE_VOLUME_TARGETS`)

Les groupes suivants ne sont PAS couverts par le mapping `getVolumeByMuscleGroup` → `MUSCLE_VOLUME_TARGETS` :
- `Mollets` → ignoré (pourtant dans `VOLUME_LANDMARKS.calves` et `MUSCLE_TO_VL_KEY`)
- `Avant-bras` → ignoré
- `Abdos` / `Core` / `Obliques` → ignoré (fonctions abdominales non comptabilisées)
- `Cardio` / `Autre` → ignoré

Ces groupes contribuent au volume réel mais n'apparaissent pas dans les alertes de `analyzeAthleteProfile` Section 2.

### `detectVolumeSpike` vs `getVolumeByMuscleGroup` — deux sources différentes

`detectVolumeSpike` (engine.js:3909) utilise `wpGetExoMeta(exo.name).muscleGroup`.
`getVolumeByMuscleGroup` (engine.js:2617) utilise `getMuscleGroup(exo.name)`.

Ces deux fonctions peuvent retourner des groupes différents pour le même exercice (chemin différent dans la DB exercices). Un exercice peut déclencher une alerte volume spike mais ne pas apparaître dans le suivi MRV/MEV, ou l'inverse.

### Verdict AXE 2

**Sévérité : Moyen**. Trois sources de données de volume avec valeurs divergentes crée de l'incohérence visible pour l'utilisateur. Les gaps dans MG_TO_KEY signifient que le volume mollets, avant-bras et abdos n'est jamais alerté même en cas de dépassement MRV.

---

## AXE 3 — saveDB / sync cloud

### Séquence de persistance

```
mutation db → saveDB() [debounce 2s] → localStorage
                                     └→ debouncedCloudSync() [debounce 2s] → Supabase
```

Délai maximal avant sync cloud : **4 secondes**. En pratique, si l'utilisateur ferme le navigateur dans cette fenêtre, les données restent dans localStorage mais pas en cloud.

### Race condition : `calcAndStoreLiftRanks`

`calcAndStoreLiftRanks()` (app.js:4433) :
1. Modifie `db.exercises` (e1RM ranks)
2. Appelle `saveDB()` (debounced 2s → mise en file)
3. Appelle `syncToCloud(true)` **directement**, sans attendre la debounce saveDB

Conséquence : la sync cloud peut partir avec l'état localStorage non encore écrit par saveDB (si saveDB debounce est en cours pour un appel antérieur). La donnée sync et la donnée localStorage peuvent être désynchronisées brièvement.

### Mutation sans saveDB

`db.user.jointHealth = calcCurrentJointStress()` (app.js:28457) :
```js
if (typeof calcCurrentJointStress === 'function') {
  try { db.user.jointHealth = calcCurrentJointStress(); } catch(e) {}
}
```
Aucun `saveDB()` après cette mutation. `db.user.jointHealth` est calculé et stocké en mémoire mais **perdu au rechargement de page**. `renderJointHealthSection()` recalcule entièrement depuis les logs à chaque appel — le champ `db.user.jointHealth` est écrit mais jamais lu.

### Guard `cloudSyncEnabled`

`saveDB()` vérifie `cloudSyncEnabled` avant la sync cloud. Ce flag est positionné lors du login Supabase. Si la session expire entre deux saves, `cloudSyncEnabled` peut rester `true` et la sync échouer silencieusement dans le catch de `syncToCloud`.

### Verdict AXE 3

**Sévérité : Faible à moyen**. La race condition `calcAndStoreLiftRanks` est réelle mais peu impactante (les rangs sont idempotents — une resync les recalcule). La mutation `jointHealth` sans saveDB est un bug mineur (données non persistées). Le délai 4s est acceptable pour un usage normal.

---

## AXE 4 — Diagnostic Coach : sections manquantes et conditions silencieuses

### `analyzeAthleteProfile()` — 8 sections, conditions d'activation

| Section | Condition d'activation | Fréquence de silence |
|---|---|---|
| 1 — Biomécanique & Ratios | `computeStrengthRatiosDetailed()` retourne des ratios non-null → nécessite logs avec maxRM pour ≥ 2 lifts SBD | Rare si l'utilisateur a des logs |
| 2 — Fatigue & Volume | Toujours activée (ACWR fallback 1.0). Volume seulement si `volumes[key] > 0` | Jamais silencieuse |
| 3 — Nutrition & Progression | `getE1RMTrend('squat', 84)` ≥ 3 points de données **ET** `getWeightTrend(21)` ≥ 4 entrées body weight dans 21j | **Souvent silencieuse** — nécessite track poids régulier |
| 4 — Bien-être du Jour | `db.todayWellbeing` non-null | Silencieuse si check-in quotidien non fait |
| 5 — Garmin / RHR | `db.todayWellbeing.rhrAlert` non-null | Silencieuse sans Garmin |
| 6 — Weight Cut | `db.user.weightCut.active` | Silencieuse hors phase de cut |
| 7 — Progression SBD | `classifyStagnation()` détecte un plateau | Silencieuse si progression normale |
| 8 — Profil Neuromusculaire | `db.exercises[lift].zones` défini (DUP zones stockées) | Silencieuse si DUP non activé |

### `getE1RMTrend` — minimum de données requis

```js
if (points.length < 3) return null;  // engine.js:2562
```
Nécessite 3 sets work (non warmup, non backoff, non dropset) pour le Squat dans les 84 derniers jours. Si l'utilisateur entraîne le Squat < 3 fois en 12 semaines, la Section 3 reste vide.

### `getWeightTrend` — minimum de données requis

```js
if (entries.length < 4) return null;  // engine.js:2537
```
Nécessite 4 entrées de poids corporel dans les 21 derniers jours. Si l'utilisateur ne track pas son poids régulièrement, la Section 3 reste vide.

### Seuil ACWR

`ACWR_ZONES` (engine.js:58) : `green_low=0.80`, `green_high=1.30`, `orange_high=1.50`.
- ACWR 1.4 → "Charge soutenue — vigilance utile" (severity: warning)
- ACWR > 1.5 → "Charge élevée — récupération à prioriser" (severity: danger)
- Athlète hybride (swimming + poids) : seuils montés à 1.00/1.50/1.80

### Divergence `computeStrengthRatios` vs `computeStrengthRatiosDetailed`

Le Coach tab (`generateCoachAlgoMessage`) utilise `computeStrengthRatios()` (app.js). Le Diagnostic Coach (`analyzeAthleteProfile`) utilise `computeStrengthRatiosDetailed()` (engine.js). Un utilisateur peut voir des messages contradictoires entre les deux onglets.

### Verdict AXE 4

**Sévérité : Moyen**. Les sections 3, 4, 7, 8 sont silencieuses dans la majorité des cas d'usage (utilisateur sans tracking poids régulier, sans Garmin, sans stagnation). Le résultat perçu : un Diagnostic Coach pauvre pour les nouveaux utilisateurs. La dépendance croisée deux fonctions de ratios crée un risque de messages contradictoires.

---

## AXE 5 — Santé articulaire : faux positifs et faux négatifs

### Architecture joints.js

`joints.js` est un module autonome chargé après app.js. Il expose :
- `matchExoToJoints(exoName)` — pattern matching 203 exercices → 8 joints
- `calcJointStressForPeriod(startTs, endTs)` — tonnage pondéré par coefficient joint
- `calcJointBaseline()` — moyenne mobile sur 6 fenêtres de 14 jours (3 mois)
- `evaluateJointAlerts()` — compare current vs baseline
- `renderJointHealthSection()` — affiche dans `#jointHealthContent`

### Gate dur : `windows >= 3`

```js
if (baselineData.windows < 3) return [];  // joints.js:353
```

Signifie : **aucune alerte articulaire** si l'utilisateur a moins de 6 semaines de logs (3 × 14j). Pour un utilisateur de 4 semaines qui vient de tripler son volume bench, la section affiche "✅ Aucun stress articulaire anormal détecté" — ce qui est un faux négatif potentiellement dangereux.

### Formule de stress — absence de normalisation

```js
var tonnage = (w > 0 ? w * r : r * 10) * rpeMultiplier;
scores[joint] += tonnage * joint_weight;
```

Le stress est en kg×reps×coeff. Pas de normalisation par bodyweight. Un athlète de 60kg faisant 100kg de bench aura moins de stress calculé qu'un athlète de 120kg faisant 150kg de bench, même si les deux sont à RPE 8. La comparaison baseline/current reste interne à chaque utilisateur (ratio), donc c'est acceptable — mais le seuil absolu `base < 500 || curr < 100` peut filtrer des utilisateurs légers.

### Cardio et impact articulaire

Tapis roulant → joints `['knee', 'ankle']` avec weight=0.4. Ce cardio injecté dans chaque séance (Problème 1 du diagnostic) contribue au stress calculé des genoux et chevilles. Si Aurélien fait 20min tapis × 4 séances/sem, le stress genoux augmente même sans sets de squat supplémentaires.

### `db.user.jointHealth` non persisté

```js
// app.js:28456
if (typeof calcCurrentJointStress === 'function') {
  try { db.user.jointHealth = calcCurrentJointStress(); } catch(e) {}
  // ← PAS de saveDB() ici
}
```
Le champ est calculé mais non sauvegardé. `renderJointHealthSection()` n'utilise pas `db.user.jointHealth` — elle recalcule via `evaluateJointAlerts()`. Le champ stocké est inutile dans l'état actuel.

### Verdict AXE 5

**Sévérité : Moyen**. Le gate `windows >= 3` crée des faux négatifs pour les utilisateurs de moins de 6 semaines. La formule de stress est cohérente en interne mais non normalisée. L'injection cardio (Problème 1) impacte les scores articulaires genou/cheville.

---

## AXE 6 — Nutrition macros : cohérence calcul

### Trace `calcMacrosCibles` pour Aurélien (98kg, powerbuilding)

Paramètres : `goal ≠ 'recompo'`, `trainingMode ≠ 'bien_etre'`, `gender = 'male'`

```js
// engine.js:1289
var protPerKg = goal === 'recompo' ? 2.4 : 1.95;       // → 1.95
var prot = Math.round(bw * protPerKg);                   // → 191g
var fatPerKg = gender === 'female' ? Math.max(1.0, 0.73) : 0.73;  // → 0.73 (male)
var fat = Math.round(bw * fatPerKg);                     // → 72g
var carb = Math.max(0, Math.round((kcalCible - prot*4 - fat*9) / 4));
```

**TDEE** (`calcTDEE`, engine.js:1088) — dépend des données disponibles :

| Données disponibles | Formule | Résultat (Aurélien, 4 sessions/sem, phase hypertrophie) |
|---|---|---|
| Ni height/age ni fatPct | `bw × 33 × activityFactor` | 98×33×1.55 = 5011 + 300 = **5311 kcal** |
| Height + age (Mifflin-St Jeor) | `BMR × activityFactor` | ~3000–3500 + 300 (selon taille/âge) |
| fatPct connu (Katch-McArdle) | `(370 + 21.6×LBM) × activityFactor` | ~3600–4200 + 300 (selon fatPct) |

**Macros calculées par le code actuel (fallback 5311 kcal)** :
- Protéines : **191g** (764 kcal)
- Lipides : **72g** (648 kcal)
- Glucides : **977g** (3900 kcal)

### Divergence avec les valeurs attendues dans le diagnostic

Valeurs citées dans la demande d'audit : 4365 kcal / 196g prot / 155g lipides / 546g carbs.

| Nutriment | Valeur attendue | Code actuel (fallback) | Delta |
|---|---|---|---|
| kcal | 4365 | 5311 | -946 kcal |
| Protéines | 196g (2.0 g/kg) | 191g (1.95 g/kg) | +5g (mineur) |
| Lipides | 155g (1.58 g/kg) | 72g (0.73 g/kg) | **+83g — aucun chemin code** |
| Glucides | 546g | 977g | -431g |

**Conclusion** : Les valeurs attendues (surtout 155g lipides) ne correspondent à **aucun chemin** dans le code actuel de `calcMacrosCibles`. La seule explication est une version antérieure du code avec une formule lipides différente. Le TDEE de 4365kcal est cohérent si height+age donnent un BMR ~2400 avec 5 sessions (improbable à 98kg sans grande taille).

### Bug mineur : `Math.max(1.0, 0.73)` superflu

```js
var fatPerKg = gender === 'female' ? Math.max(1.0, 0.73) : 0.73;
// Math.max(1.0, 0.73) = 1.0 toujours — la comparaison ne sert à rien
```
Le résultat est correct (1.0g/kg femmes, 0.73g/kg hommes) mais le `Math.max` est un vestige d'une version où `fatPerKg` était calculé dynamiquement. Code fonctionnel, lecture confuse.

### Verdict AXE 6

**Sévérité : Élevé**. Les valeurs macro attendues pour Aurélien divergent significativement du code actuel, notamment les lipides (155g attendus vs 72g calculés). Le fallback TDEE (`bw × 33 × activityFactor`) est très élevé pour un powerbuilder qui ne renseigne pas sa taille/âge — produit un total calorique irréaliste. Les utilisateurs sans height+age dans leur profil reçoivent des recommandations nutritionnelles potentiellement fausses.

---

## AXE 7 — Fonctions mortes et dette technique

### Fonctions mortes confirmées

#### `renderProgramTab()` (app.js:10541) — **MORTE depuis v237**

Raison : `renderProgramBuilder()` délègue toujours à `renderProgrammeV2()`. `#programBuilderContent` a `display:none`. `renderProgramTab` n'est jamais appelée.

Contenu mort :
- Ligne 10752 : `<button onclick="openAdjustSession()">Ajuster ma séance</button>` — seul point d'entrée vers `openAdjustSession()` — lui aussi inaccessible
- `progEditDay()` → `pbEditExisting()` : accessible uniquement depuis code mort

Impact : Problème 4 du diagnostic — le bouton "Ajuster ma séance" a disparu de l'UI.

#### `db.user.jointHealth` (write-only)
Champ écrit après chaque séance (app.js:28457) mais jamais lu par les fonctions de rendu. La valeur est calculée, stockée en mémoire, et perdue au rechargement. **Dette effective**.

### Fonctions actives mais dupliquées (dette de cohérence)

#### `computeStrengthRatios()` (app.js:14025) vs `computeStrengthRatiosDetailed()` (engine.js:2514)

Deux fonctions calculant les mêmes ratios avec :
- Des sources de données différentes
- Des clés de retour différentes (`squat_deadlift` vs `squat_dead`)
- Des structures différentes (`{value, ideal, label}` vs nombres bruts)

Aucune n'appelle l'autre. Synchronisation manuelle impossible.

#### Trois sources de volume landmarks

`MUSCLE_VOLUME_TARGETS`, `VOLUME_LANDMARKS`, `VOLUME_LANDMARKS_FR` — trois constantes pour les mêmes données physiologiques avec des valeurs légèrement différentes. Source de divergence UI.

### Fonctions actives non mortes (faussement suspectées)

| Fonction | Statut | Appelée par |
|---|---|---|
| `generateCoachAlgoMessage()` (app.js:13814) | **Vivante** | app.js:14542, app.js:16621 |
| `computeStrengthRatios()` (app.js:14025) | **Vivante** | `renderStrengthRatios`, `wpApplyImbalanceCorrections`, `generateCoachAlgoMessage` |
| `obRenderInjuriesList()` (app.js:1629) | **Vivante** | Wizard onboarding (app.js:1424) |
| `openAdjustSession()` (app.js:12696) | **Vivante mais inaccessible** | Seulement depuis `renderProgramTab` (code mort) |
| `_renderAdjustSessionHTML`, `_adjustSwitchDay`, `_adjustShowAlternatives`, etc. | **Vivantes** | Appelées depuis `openAdjustSession()` |

### Dette technique notable

**`calcMacrosCibles` lipides formula** (engine.js:1308) : `Math.max(1.0, 0.73)` superflu.

**`computeWeeklyVolume`** (engine.js:1620) : Appelée 4 fois dans app.js avec `(db.logs, 1)` — toujours la même semaine. Pas de mise en cache. 4 scans complets des logs à chaque rendu du Coach tab.

**Double scan Push/Pull** dans `analyzeAthleteProfile` (engine.js:2817 et 2841) : deux boucles distinctes sur les logs pour calculer le ratio push/pull — une sur 7j en tonnage (`_weekPull`/`_weekPush`), une sur 30j en sets (`pushSets`/`pullSets`). Les deux alertent séparément — un utilisateur peut recevoir deux alertes push/pull contradictoires dans la même section.

### Verdict AXE 7

**Sévérité : Faible à Moyen**. `renderProgramTab()` est la seule vraie fonction morte avec impact utilisateur (bouton disparu — P4 du diagnostic). Les duplications (`computeStrengthRatios` × 2, landmarks × 3) sont de la dette de cohérence sans impact fonctionnel immédiat. `openAdjustSession()` et ses helpers sont du code vivant mais orphelin — un simple bouton dans V2 les ressuscite.

---

## Tableau récapitulatif

| Axe | Finding principal | Sévérité | Fichier | Ligne |
|---|---|---|---|---|
| **AXE 1 e1RM** | 2 fonctions de ratios parallèles, clés différentes, sources différentes | Moyen | app.js / engine.js | 14025 / 2514 |
| **AXE 2 Volume** | 3 sources de landmarks avec valeurs divergentes ; gaps MG_TO_KEY (mollets, abdos) | Moyen | engine.js / program.js | 46 / 236 / 36 |
| **AXE 3 saveDB** | `jointHealth` écrit sans saveDB ; race condition `calcAndStoreLiftRanks` → `syncToCloud` direct | Faible | app.js | 28457 / 4433 |
| **AXE 4 Coach** | Section 3 (Nutrition) silencieuse sans tracking poids ; Coach et Diagnostic utilisent des fonctions de ratios différentes | Moyen | engine.js | 2972 / 2975 |
| **AXE 5 Joints** | Gate `windows >= 3` → faux négatifs si < 6 semaines de logs | Moyen | joints.js | 353 |
| **AXE 6 Macros** | Lipides calculés 72g vs 155g attendus — aucun chemin code ; TDEE fallback surestimé | Élevé | engine.js | 1289 / 1308 |
| **AXE 7 Mort** | `renderProgramTab` morte depuis v237 ; `openAdjustSession()` inaccessible ; 3 landmarks, 2 fonctions ratios | Faible-Moyen | app.js | 10541 / 10752 |

---

## Priorités recommandées (hors scope fixes déjà identifiés en diag-4-problemes.md)

1. **AXE 6 — Lipides** : Vérifier la formule `calcMacrosCibles` lipides — 0.73g/kg hommes produit ~72g pour Aurélien, très en dessous de la recommandation pour un athlète de force (optimal : 1.0–1.5g/kg). Envisager d'augmenter `fatPerKg` à 1.0 pour les deux genres.

2. **AXE 6 — TDEE fallback** : Le fallback `bw × 33 × activityFactor` double-compte l'activité (33 kcal/kg est déjà pour sédentaire modéré). Pour un utilisateur sans height/age, TDEE de 5311 kcal est irréaliste. Fallback recommandé : `bw × 33` sans `activityFactor`, ou `bw × 40` pour les powerbuilders actifs.

3. **AXE 2 — Unification landmarks** : Choisir une seule source de vérité (`MUSCLE_VOLUME_TARGETS` ou `VOLUME_LANDMARKS`) et aligner les valeurs. Supprimer les doublons.

4. **AXE 1 — Unification ratios** : `computeStrengthRatios()` et `computeStrengthRatiosDetailed()` doivent avoir la même source (idéalement `getTopE1RMForLift`) et le même format. `wpApplyImbalanceCorrections` devrait utiliser la version engine.js.

5. **AXE 5 — Gate joints** : Envisager un mode dégradé pour `windows < 3` : afficher une tendance relative sur la fenêtre disponible avec disclaimer "données insuffisantes pour baseline".

6. **AXE 3 — `jointHealth` saveDB** : Ajouter `saveDB()` après la mutation `db.user.jointHealth`, ou supprimer le champ (inutilisé en lecture).
