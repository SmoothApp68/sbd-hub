# Audit — Titre "Force/Deload" + RPE 6 + charges + structure semaine
Date : 2026-05-15

---

## AXE 1 — Origine "Deload" dans le titre

### Chaîne de construction du titre

`wpDeriveTitle(exercises)` (ligne 21821) construit le titre à partir des groupes
musculaires des exercices — il ne contient **jamais** le mot "Deload". Ce n'est pas la
source.

Le vrai chemin :

```
generateWeeklyPlan() [ligne 23415]
  → wpDetectPhase()  → retourne 'deload' (voir conditions ci-dessous)
  → OU garde Insolvency [ligne 23423] → _insolvencyCheck.level === 'critical' → phase = 'deload'

  → wpGeneratePowerbuildingDay(dayKey, ..., phase='deload', ...)
    → _gwpDupSeq = ['force','force','force','volume','vitesse']  (powerbuilding avancé 5j)
    → J1 Squat   : getDUPForce('deload')  → label 'Force / Deload'  ← ici
    → J2 Bench   : getDUPForce('deload')  → label 'Force / Deload'
    → J3 Dead    : getDUPForce('deload')  → label 'Force / Deload'
    → J4 Bench2  : getDUPVolume('deload') → label 'Volume / Deload'
    → J5 Squat2  : getDUPVitesse('deload','avance') → label 'Récupération Active'
```

**Source exacte** (ligne 19132) :
```js
deload: { sets:[2,3], reps:[8,12], intensity:[0.60,0.65], rpe:[6,7], rest:[120,120], label:'Force / Deload' }
```

### Condition qui force `phase = 'deload'`

**Voie 1 — wpDetectPhase()** (ligne 21085-21088) :
```js
var _normPh = (_wbPh.sleep + _wbPh.motivation) / 2 / 5 * 100;
if (_normPh < 45) return 'deload';
```
Si `sleep <= 2` ET `motivation <= 2` → score < 45 → retourne 'deload' immédiatement.

**Voie 2 — garde Insolvency dans generateWeeklyPlan()** (lignes 23423-23429) :
```js
var _insolvencyCheck = calcInsolvencyIndex(db.logs || []);
if (_insolvencyCheck.level === 'critical' && phase !== 'deload') {
  phase = 'deload';
  showToast('🚨 Insolvency critique — Deload forcé.');
}
```
Avec l'ancienne calibration BaseCapacity (avancé = 1.10), fatigueCost ÷ (1.10 × 0.65 × 100) ≈ 1.4 → critique.
Après fix (avancé = 1.30), le seuil critique nécessite fatigueCost > 112 (60% au-dessus d'une semaine normale). Possible pour un powerbuilder très chargé.

### Lien avec le cap RPE 6

Le cap RPE 6 est déclenché par `phase === 'deload'`, **PAS par** `dayKey === 'technique'`.

```js
// ligne 22406 — dans wpGeneratePowerbuildingDay, APRÈS wpComputeWorkWeightSafe()
if (phase === 'deload') { weight = wpRound25(weight * 0.80); setsCount = Math.ceil(setsCount / 2); rpe = 6; }

// ligne 22807 — SÉPARÉ, uniquement si dayKey === 'technique'
if (dayKey === 'technique') {
  exercises = exercises.map(function(exo) {
    return Object.assign({}, exo, { rpe: Math.min(parseFloat(exo.rpe) || 6, 6) });
  });
}
```

Ces deux mécanismes sont indépendants. Le `dayKey === 'technique'` n'est jamais atteint pour
Aurélien (son Samedi est dayKey='squat', voir AXE 4). Le RPE 6 observé vient uniquement de
`phase === 'deload'`.

---

## AXE 2 — Nombre de séries

### wpSetsForPhase() en phase 'deload'

```js
// ligne 21291-21294
function wpSetsForPhase(phase, slot) {
  if (slot === 'isolation') return 3;
  return { hypertrophie: 4, ..., deload: 2, ... }[phase] || 3;
}
```

En hypertrophie → 4 séries. Mais si phase='deload' :

**Ligne 22366** : `var setsCount = wpSetsForPhase(phase)` → wpSetsForPhase('deload') = 2.
ET **ligne 22406** : `setsCount = Math.ceil(setsCount / 2)` → Math.ceil(2/2) = 1 (ou 2 si DUP override).

Avec DUP force/deload → `_dupProfile.sets = [2,3]` → override : `setsCount = Math.round((2+3)/2) = 2`.
Résultat final : **2 séries** — cohérent avec l'observation.

### getDLSetsReps() en S1

```js
if (w <= 1) return { sets: 5, reps: 5, rpe: 7.5, restSeconds: 300 };
```

S1 → 5 séries × 5 reps, RPE 7.5. Ce n'est utilisé QUE si `dayKey === 'deadlift' && !_dupProfile`
(ligne 22382). En avancé, `_dupProfile` est toujours défini → getDLSetsReps n'est **jamais appelé**.

### Modulateur Insolvency

Lignes 22537-22542 — accessoires uniquement (`!acc.isPrimary`) :
```js
if (_insolvencyLevel === 'orange') { sc = Math.max(1, sc - 1); }
else if (_insolvencyLevel === 'red' || _insolvencyLevel === 'critical') { sc = Math.max(1, sc - 2); }
```

Ce modulateur ne touche **pas** le lift principal (isPrimary=true). Les 2 séries viennent
uniquement de la phase deload.

Avec BaseCapacity = 1.3 (post-fix), pour srsScore = 65, fatigueCost = 100 :
- index = 100 / (1.3 × 0.65 × 100) = 100/84.5 = **1.18 → red** (pas critique, mais toujours rouge)
- Les accessoires perdent -2 séries → `_insolvencyLevel = 'red'` encore présent si fatigue haute

### Modulateur DOMS

`getDOMSAdjustment()` (ligne 22584) ne s'applique que si `db.body[]` est renseigné **aujourd'hui**.
Si DOMS non saisies ou déjà remplies : `domsAdj.volumeReduction === 0 && domsAdj.intensityFactor === 1.0`
→ retour précoce → **aucun effet**. Non impliqué dans les 2 séries.

---

## AXE 3 — Charges trop basses (Squat 62.5kg)

### Source d'e1RM dans wpComputeWorkWeight()

Ordre exact (lignes 20585-20587) :
```js
var e1rmRef = (typeof getZoneE1RM === 'function' ? getZoneE1RM(realName, dupZone) : 0)
           || (db.exercises && db.exercises[realName] && db.exercises[realName].e1rm)
           || (history.length > 0 ? history[0].e1rm : 0) || 0;
```

Avec phase='deload' → `getActiveZoneForPhase()` consulte `wpDetectPhase()` → retourne 'deload'
→ `zoneMap['deload'] = 'hypertrophie'` → **dupZone = 'hypertrophie'**.

History filtrée sur reps 6-12 (zone hypertrophie). Si les logs récents d'Aurélien montrent
Squat à ~85kg × 8 reps → `wpCalcE1RM(85, 8, 7.5) = 85/(1.0278-0.0278×8) = 85/0.806 ≈ 105`.
e1rmRef ≈ 105-110.

### Plancher 60% e1RM — actif ou non ?

**Lignes 20729-20733** (dans wpComputeWorkWeight) :
```js
var _isAdvancedLevel = db.user && (db.user.level === 'avance' || db.user.level === 'competiteur');
if (_isAdvancedLevel && _isMainLift && e1rmRef > 0) {
  var _e1rmFloor = Math.round(e1rmRef * 0.60 / 2.5) * 2.5;
  if (baseWeight < _e1rmFloor) baseWeight = _e1rmFloor;
}
```

Le plancher s'applique bien (avancé ✓, isMainLift ✓). Avec e1rmRef = 105 :
- floor = Math.round(105 × 0.60 / 2.5) × 2.5 = Math.round(63/2.5) × 2.5 = 25 × 2.5 = **62.5kg**

Si baseWeight APRE ≈ 78kg (logs hypertrophie à ~75kg + progression) :
- 78 > 62.5 → plancher **non activé** → baseWeight = 78kg
- wpComputeWorkWeight() retourne 78kg

### Déduction deload appliquée APRÈS le plancher (bug confirmé)

**Ligne 22406** dans wpGeneratePowerbuildingDay() — après l'appel à wpComputeWorkWeightSafe() :
```js
if (phase === 'deload') { weight = wpRound25(weight * 0.80); setsCount = ...; rpe = 6; }
```

78 × 0.80 = 62.4 → **wpRound25 = 62.5kg** ✓ (correspond exactement à l'observation)

**Le plancher 60% est contourné** : il protège dans wpComputeWorkWeight() mais le deload
-20% est appliqué DANS wpGeneratePowerbuildingDay() APRÈS le retour de la fonction. Le résultat
final (62.5kg) passe en dessous du plancher théorique (62.5kg = floor coïncide ici mais avec
e1rmRef > 130 le plancher serait plus haut et tout autant contourné).

Exemple avec e1rmRef = 135 → floor = 80kg → si APRE donne 85 → deload = 68kg → **sous le
plancher** de 80kg.

---

## AXE 4 — Samedi "Squat 2 — Volume Jambes"

### Template assigné au Samedi dans le split 5j

`_wpGetSplitLabels('powerbuilding', 5)` (ligne 23373) retourne :
```js
['Squat — Force & Volume','Bench — Force & Volume','Deadlift — Force & Volume','Bench 2 — Volume','Squat 2 — Volume Jambes']
```

Samedi = J5 → routine label = **'Squat 2 — Volume Jambes'**.

Routing label → dayKey (ligne 23597) :
```js
if (/squat|jambe|quad|leg/i.test(label)) dayKey = 'squat';
```

'Squat 2 — Volume Jambes' → match → **dayKey = 'squat'**. Pas 'technique'.

DUP J5 pour avancé 5j = `'vitesse'` → `getDUPVitesse('hypertrophie', 'avance')` :
```js
hypertrophie: { sets:[4,6], reps:[2,3], intensity:[0.60,0.65], rpe:[6,7], label:'Technique & Vitesse' }
```

C'est une séance technique légère (charge 60-65%, vitesse d'exécution) — sémantiquement
correct pour une S2 squat avancé, mais le **titre "Squat 2 — Volume Jambes"** vient du label
de routine affiché dans l'UI (`dayData.dupProfileKey`, ligne 23607), pas du titre derivé.

### Pourquoi pas un dayKey 'technique' ?

Le dayKey 'technique' n'est assigné que par cette condition (lignes 23600-23601) :
```js
else if (/point|faible|technique.*sbd|sbd.*tech/i.test(label)) {
  dayKey = allDays.indexOf(day) % 2 === 0 ? 'weakpoints' : 'technique';
}
```

'Squat 2 — Volume Jambes' ne matche pas ce pattern → jamais dayKey='technique'. Pour
obtenir une vraie séance technique (cap RPE 6 via ligne 22807), il faudrait que la routine
label contienne "technique SBD" ou "point faible".

---

## AXE 5 — Tapis roulant dans toutes les séances

### Condition exacte (lignes 22712-22717)

```js
var _cardioBlockedPhases = ['peak', 'intensification'];
var _cardioBlockedBodies = ['lower'];
var _cardioBlocked = _cardioBlockedPhases.indexOf(phase) >= 0
                  && _cardioBlockedBodies.indexOf(bodyPart) >= 0;
if ((params.cardio || '') === 'integre' && bodyPart !== 'recovery' && !_cardioBlocked) {
  exercises.push(_cardioBlock);
}
```

**En phase 'hypertrophie'** : `_cardioBlockedPhases.indexOf('hypertrophie') = -1` →
`_cardioBlocked = false` → cardio ajouté sur **tous** les jours, y compris lower (squat/deadlift).

**En phase 'deload'** : idem, 'deload' non dans la liste → cardio ajouté partout.

### Comportement voulu ou bug ?

**Comportement voulu** — conforme à la décision Gemini. Le cardio intégré est acceptable en
hypertrophie (charge modérée, pas de pic neural). Bloqué uniquement en peak/intensification
sur lower body pour préserver la fraîcheur neuromusculaire.

Cependant : ajouter du tapis roulant APRÈS une séance Squat ou Deadlift heavy en hypertrophie
augmente la charge axiale et peut nuire à la récupération. Ce n'est pas un bug de code mais
un point de design discutable (hors scope du présent audit).

---

## Causes racines identifiées (priorisées)

| # | Problème | Cause | Impact |
|---|---|---|---|
| 1 | Tous les titres "Force / Deload", RPE 6, 2 séries | `phase = 'deload'` forcé par garde Insolvency (`_insolvencyCheck.level === 'critical'`) dans generateWeeklyPlan ou wellbeing < 45 dans wpDetectPhase | **Catastrophique** — tout le plan cassé |
| 2 | Charges trop basses (62.5kg) | Deload ×0.80 appliqué dans wpGeneratePowerbuildingDay() APRÈS retour de wpComputeWorkWeight() → contourne le plancher 60% e1RM | **Majeur** — plancher théoriquement inutile en deload forcé |
| 3 | Samedi "Volume Jambes" au lieu de séance technique | Label 'Squat 2 — Volume Jambes' → dayKey='squat', jamais 'technique'. DUP 'vitesse' correct mais le label d'interface affiche la routine label, pas le titre derivé | **Mineur** — comportement attendu par l'algo |
| 4 | Tapis roulant sur séances lower | Cardio intégré non bloqué en hypertrophie — décision Gemini validée | **Design** — pas un bug |

---

## Findings hors scope (signalés sans correction)

- **Insolvency sur `db.logs || []` total** dans generateWeeklyPlan (ligne 23423) vs
  **Insolvency sur 7j** dans calcVolumeAutoTune — incohérence : l'un utilise tous les logs,
  l'autre filtre sur 7j. Si l'Insolvency totale est critique mais la semaine en cours est
  légère, le deload est forcé à tort.

- **`_insolvencyCheck.level === 'critical'`** dans generateWeeklyPlan utilise `calcInsolvencyIndex(db.logs || [])`
  qui passe TOUS les logs à `calcWeeklyFatigueCost()` — la fonction est normalement conçue
  pour une semaine (7j). Si `calcWeeklyFatigueCost()` filtre en interne sur 7j, passer 514
  logs est sans danger mais inutilement coûteux. Si elle ne filtre pas → fatigueCost gonflé.

- **wpDetectPhase() appelée deux fois par génération** : une fois dans generateWeeklyPlan
  (ligne 23415) et une fois dans getActiveZoneForPhase() (via wpComputeWorkWeight ligne 20408).
  Double calcul, risque d'incohérence si une des deux donne un résultat différent (wellbeing
  changeant entre les deux appels — peu probable mais possible).
