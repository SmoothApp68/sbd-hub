# shouldDeload() + Double Progression — v187

## shouldDeload() — 3 critères Gemini

| Critère | Débutant | Intermédiaire | Avancé |
|---|---|---|---|
| SRS Kill Switch | < 40 | < 45 | < 45 |
| Volume drop + RPE | -20% + > 9.0 | -15% + > 8.5 | -15% + > 8.5 |
| Max semaines | 12 | 8 | 6 |

Implémentée comme fonction zombie : appelée dans `renderCoachTodayHTML` (line 15853) et `wpDetectPhase` (line 18119) avant v187, mais jamais définie. La fonction retourne `{ needed: bool, reason?: string, trigger?: 'srs'|'volume_rpe'|'max_weeks' }`.

Fallback `weeksSinceDeload` : si `db.weeklyPlan.lastDeloadDate` absent, estimation depuis le premier log. Permet à shouldDeload de fonctionner immédiatement (pas de cold-start).

## Double Progression — bugs corrigés

### Bug 1 — RPE null bloquait la progression
```js
// AVANT
if (allSetsComplete && lastRpe <= 8) { ... }
// `null <= 8` → false en JS — progression jamais déclenchée
// APRÈS
var rpeValid = (lastRpe === null || lastRpe === undefined || lastRpe <= 8);
if (allSetsComplete && rpeValid) { ... }
```

### Bug 2 — Incrément +2kg fixe, indifférencié

Nouvelle fonction `getDPIncrement(exoName)` :

| Catégorie | Incrément |
|---|---|
| Lower body composé (Squat, Leg Press, Hip Thrust) | +5.0 kg |
| Lower body isolation (Leg Extension, Leg Curl) | +2.5 kg |
| Upper body composé (Rowing, DC haltères) | +2.5 kg |
| Upper body isolation (Curl, Extension triceps) | +1.0 kg |
| Core / abdos / lombaires | reps + 1 (pas de charge) |

### Bug 3 — "Presque complet" → coachNote
```js
// 3×11/3×12 ne progresse plus mais reçoit un feedback
if (almostComplete) {
  return {
    weight: lastWeight, reps: targetRepMax, progressed: false,
    almostComplete: true,
    coachNote: '⏳ Encore une séance pour valider les ' + targetRepMax + ' reps...'
  };
}
```

### Bug 4 — Fréquence de progression
Paramètre `sessionsRequired` :
- 1 séance par défaut (accessoires)
- 2 pour main lifts (caller doit passer `2` lors de l'appel)

```js
function wpDoubleProgressionWeight(exoName, targetRepMin, targetRepMax, sessionsRequired) {
  sessionsRequired = sessionsRequired || 1;
  // ... boucle sur logs, incrémente successCount si allSetsComplete && rpeValid
  if (successCount >= sessionsRequired) { ... progresse ... }
}
```

## acceptDeload() — Stockage de lastDeloadDate

```js
function acceptDeload() {
  db._deloadAccepted = true;
  if (!db.weeklyPlan) db.weeklyPlan = {};
  db.weeklyPlan.lastDeloadDate = new Date().toISOString().split('T')[0];
  saveDB();
}
```

`shouldDeload()` peut alors calculer correctement le critère 3 (max semaines).

## Tests Playwright (10/10)

| ID | Description | Résultat |
|---|---|---|
| DELOAD-01 | SRS<45 → trigger='srs' | ✅ |
| DELOAD-02 | SRS=70 + volume drop + RPE 8.8 → trigger='volume_rpe' | ✅ |
| DELOAD-03 | avancé 7 semaines (maxWeeks=6) → trigger='max_weeks' | ✅ |
| DELOAD-04 | Tout OK, 4 semaines → needed:false | ✅ |
| DELOAD-05 | débutant 8 semaines (maxWeeks=12) → needed:false | ✅ |
| DP-01 | RPE null + allSetsComplete → progressed:true | ✅ |
| DP-02 | Leg Press → +5kg | ✅ |
| DP-03 | Curl Haltères → +1kg | ✅ |
| DP-04 | 3×11/3×12 → almostComplete:true, progressed:false | ✅ |
| DP-05 | almostComplete → coachNote présente | ✅ |

## Régressions v185 + v186 : 24/24

Aucune régression sur les suites de tests précédentes.

## Service Worker

`trainhub-v186` → `trainhub-v187`
