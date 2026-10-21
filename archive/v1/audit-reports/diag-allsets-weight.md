# Diagnostic — wpComputeWorkWeight : sets vs allSets

## Conclusion principale

**L'hypothèse est incorrecte.** `wpComputeWorkWeight` lit correctement `exo.allSets`, jamais `exo.sets`. Les charges nulles de Squat Pause ne viennent pas de ce bug — elles sont un artefact de plan stale généré pendant une phase deload + Kill Switch actif.

---

## Q1 — Comment wpComputeWorkWeight lit les poids des logs

**Ligne 20162** :
```js
var allWorkSets = (exo.allSets || exo.series || []).filter(function(s) {
  var isWarm = s.isWarmup === true || s.setType === 'warmup';
  return !isWarm && parseFloat(s.weight) > 0 && parseInt(s.reps) > 0;
});
```

→ La fonction lit **`exo.allSets`** (array), jamais `exo.sets` (nombre). L'hypothèse est fausse.

Cascades :
- `allWorkSets` filtre les warmups (`setType === 'warmup'`) et garde les séries avec poids > 0 et reps > 0
- `zoneSets` filtre par plage de reps selon la zone DUP (force/hypertrophie/vitesse)
- `workSets = zoneSets.length > 0 ? zoneSets : allWorkSets` — fallback sur toutes les séries travail si aucune n'est dans la zone
- `maxSet` = la série avec le poids le plus lourd → `history.push({weight, reps, rpe, e1rm})`

---

## Q2 — Comment wpDoubleProgressionWeight lit les logs

**Ligne 19891** :
```js
var _swork = (_sexo.allSets || _sexo.series || []).filter(function(s) {
  var isWarm = s.isWarmup === true || s.setType === 'warmup';
  return !isWarm && parseFloat(s.weight) > 0;
});
```

→ Même pattern. `allSets` lu correctement, `sets` (nombre) jamais utilisé.

---

## Q3 — Structure réelle des logs (données Supabase confirmées)

Squat (Barre) — log du 11 mai 2026 :

```
allSets (8 entrées) :
  warmup: 20kg×12 (setType:"warmup")
  warmup: 50kg×8  (setType:"warmup")
  warmup: 70kg×6  (setType:"warmup")
  warmup: 90kg×4  (setType:"warmup")
  normal: 105kg×7  @ RPE 8.0  (setType:"normal")  ← work sets
  normal: 105kg×7  @ RPE 8.5
  normal: 100kg×7  @ RPE 8.0
  normal: 100kg×7  @ RPE 8.0

sets: 4  (nombre — compte des séries travail uniquement)
series[0]: {date:..., reps:7, weight:105}
```

Le filtre `setType === 'warmup'` dans `wpComputeWorkWeight` élimine correctement les 4 échauffements. Les 4 séries travail (setType:"normal") passent. `maxSet.weight = 105`. Retour : ~105-107.5 kg.

---

## Q4 — Origine exacte des charges null pour Squat Pause (Jeudi)

Plan actuel en Supabase :
```json
"name": "Squat Pause",
"sets": [
  {"rpe":7.5,"reps":4,"weight":null,"isWarmup":false},
  {"rpe":7.5,"reps":4,"weight":null,"isWarmup":false},
  {"rpe":7.5,"reps":4,"weight":null,"isWarmup":false}
]
```

**Signatures du bug** :
- 3 séries travail (pas 5) — correspond à un deload tronqué
- 0 warmup (alors que `wpBuildWarmupsSafe` doit en générer)
- weight: null (JSON serialization de NaN)

### Chaîne causale complète

```
generateWeeklyPlan() — phase 'deload'
  └─ wpGeneratePowerbuildingDay(jeudi_squat_pause)
       └─ tpl.mainLift === 'squat_pause'
            ├─ sqW = wpComputeWorkWeightSafe('squat', 'lower')
            │      └─ wpComputeWorkWeight() → _cumulPenalty < 0.70
            │              → return { forceActiveRecovery: true, reason: '...' }  ← objet !
            │
            ├─ pauseWeight = wpRound25(sqW * 0.85)
            │              = wpRound25({forceActiveRecovery:true} * 0.85)
            │              = wpRound25(NaN)   ← object × number = NaN
            │              = NaN
            │
            ├─ wpBuildWarmupsSafe(NaN, 3, 'Squat Pause', 1, [])
            │        → wpBuildWarmups(NaN, ...)
            │             if (!workWeight || workWeight < 40) return [];   ← !NaN = true
            │        → []  (aucun warmup)
            │
            └─ wpBuildMainSets(NaN, 3, 5, 8)
                     → 5 séries avec weight: NaN

  └─ Deload post-processing (ligne 23298-23307)
       .filter : max 3 séries travail → 5 NaN → 3 NaN

  └─ db.weeklyPlan = plan → saveDB() → syncToCloud()
       JSON.stringify({weight: NaN}) = {"weight":null}
       → Supabase reçoit weight: null
```

### Preuve croisée

| Exercice | Lundi High Bar | Samedi High Bar | Jeudi Squat Pause |
|---|---|---|---|
| `wpComputeWorkWeightSafe` retour | 105 (nombre ✓) | 105 (nombre ✓) | objet Kill Switch ✗ |
| warmups | 4 séries ✓ | 5 séries ✓ | 0 séries (NaN guard) ✗ |
| séries travail | 4 (weight:105) ✓ | 5 (weight:105) ✓ | 3 (weight:null) ✗ |
| setsCount | 5 → inchangé | 5 → inchangé | 5 → deload tronque à 3 ✗ |

Lundi et Samedi n'ont pas déclenché le Kill Switch (cumulPenalty ≥ 0.70). Jeudi a été généré séparément ou à un moment où les pénalités physiologiques cumulées étaient > 30%.

---

## Dualité sets vs allSets dans le codebase

| Contexte | `exo.sets` | `exo.allSets` |
|---|---|---|
| **Exercice de PLAN** | Array `[{weight, reps, isWarmup}, ...]` | Non défini / non utilisé |
| **Exercice de LOG** | Nombre (count de séries travail) | Array `[{weight, reps, setType, rpe}, ...]` |
| `wpComputeWorkWeight` (logs) | Jamais lu | Lu correctement ✓ |
| `projectNextWeekWeights` (plan) | Lu correctement ✓ | Non pertinent |
| `renderDash` (affichage) | Lu si array ✓ | Fallback si array vide |

La dualité est intentionnelle et cohérente. Il n'y a pas de confusion dans le code.

---

## Bug réel identifié

**`wpComputeWorkWeight` peut retourner un objet** (Kill Switch) et les appelants ne le détectent pas.

**Ligne 20358** dans `wpComputeWorkWeight` :
```js
if (_cumulPenalty < 0.70) {
  return { forceActiveRecovery: true, reason: '...' };
}
```

**Ligne 22115** dans `wpGeneratePowerbuildingDay` (squat_pause) :
```js
var sqW = wpComputeWorkWeightSafe('squat', 'lower');  // peut retourner un objet
var pauseWeight = wpRound25(sqW * 0.85);              // NaN si sqW est un objet
```

La même absence de garde s'applique au code du main lift (ligne 22064-22095). Mais `wpBuildWarmupsSafe` a un guard `!workWeight` qui élimine les NaN silencieusement côté warmups. Seul le squat_pause est affecté visiblement car la deload post-processing tronque à 3 séries → 3 séries NaN → `weight:null` en JSON.

---

## Fix minimal suggéré (sans l'implémenter ici)

### Fix A — Guard sur le retour de wpComputeWorkWeightSafe dans squat_pause

```js
// AVANT (ligne 22115-22116) :
var sqW = wpComputeWorkWeightSafe('squat', 'lower');
var pauseWeight = wpRound25(sqW * 0.85);

// APRÈS :
var sqW = wpComputeWorkWeightSafe('squat', 'lower');
if (typeof sqW !== 'number' || isNaN(sqW) || sqW <= 0) sqW = 60; // fallback
var pauseWeight = wpRound25(sqW * 0.85);
```

### Fix B — Guard global dans wpComputeWorkWeightSafe

```js
function wpComputeWorkWeightSafe(liftType, bodyPart) {
  try {
    var result = wpComputeWorkWeight(liftType, bodyPart);
    if (typeof result !== 'number' || isNaN(result) || result <= 0) {
      // Kill Switch triggered — use safe fallback
      return 60;
    }
    return result;
  } catch(e) {
    // ... existing catch
  }
}
```

Fix B est préférable — corrige le problème à la source pour tous les appelants (squat_pause + main lifts).

---

## Action recommandée (immédiate)

**Régénérer le plan** via "⚡ Nouveau programme" dans l'app — maintenant que v237 est en production :
- `wpComputeWorkWeight` trouve Squat (Barre) 105kg via `exo.allSets`
- `pauseWeight = wpRound25(105 * 0.85) = 90kg`
- 5 séries à 90kg + warmups → Squat Pause Jeudi avec charges correctes
