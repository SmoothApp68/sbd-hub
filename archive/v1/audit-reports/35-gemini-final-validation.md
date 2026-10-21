# Validation Finale Gemini 7 zones — v185

## Synthèse

12/12 tests Playwright headless Chrome passent.

| Zone | Avant | Après |
|---|---|---|
| 1. Accessoires force.squat | Step-up (mauvaise activation glutéaux) | Bulgarian Split Squat |
| 2. Accessoires force.bench | Pas de Curl Marteau | Curl Marteau ajouté après Face Pull |
| 3. Plateau deadlift | Fenêtre 6 sessions, min 3 | Fenêtre 8, min 4 (récup intercession plus longue) |
| 4. getMissingActivityLogs | Pas de filtrage par jour | Filtrage par `dayName` du jour précédent |
| 5. confirmGhostLog "non" | Pas de bonus de récupération | `db._recoveryBonus.<type>` créé pour le lendemain |
| 5b. wpComputeWorkWeight | Bonus jamais consommé | +2.5kg si bonus actif → key supprimée |
| 6. goCheckAutoRegulation | Pas de détection d'échec implicite | Règle 7 (-2 reps → warning, -3 reps → danger + strike, charge ↓ + reps ↓ → épuisement) |
| 7. wpDetectPlateau actions | Toujours `back_off_10pct` | Squat → `switch_variation`, Bench → `switch_rep_range`, DL → `back_off_10pct` |
| 8. analyzeAthleteProfile | Pas d'alerte ischios/quads | Alerte si ratio < 0.75 (prévention LCA) |

## Détails par fix

### FIX1 — Bulgarian Split Squat
`WP_ACCESSORIES_BY_PHASE.force.squat` : `Step-up` remplacé par `Bulgarian Split Squat` (3×8-10/jambe).
Justification Gemini : Step-up sollicite peu les glutéaux, la stabilité du genou est moins challengeée. Bulgarian Split Squat : meilleure activation gluteus medius + correction asymétries.

### FIX2 — Curl Marteau force.bench
`WP_ACCESSORIES_BY_PHASE.force.bench` : ajout `Curl Marteau` (3×10-12) après `Face Pull`.
Justification : équilibre le travail biceps brachial + brachioradialis souvent négligé en phase force.

### FIX3 — Plateau deadlift fenêtre 8 sessions
`wpDetectPlateau('deadlift')` :
- Fenêtre d'analyse : 6 → 8 sessions (récupération inter-séance plus longue pour le DL).
- Minimum d'historique requis : 3 → 4 séances avant de déclarer plateau.
Squat et Bench restent en fenêtre 6, min 3.

### FIX4 — getMissingActivityLogs filtre par jour
Filtrage : ne propose que les activités prévues le `dayName` du jour précédent.
Si l'utilisateur a `activityTemplate: [{ days: ['Lundi'] }]` et qu'on est mardi, on ne propose le ghost log que pour lundi.
Évite les faux positifs (ex : on propose une session natation un jour où elle n'était pas prévue).

### FIX5 — confirmGhostLog non effectué → bonus
Quand l'utilisateur répond "non, je n'ai pas fait l'activité prévue" :
```js
db._recoveryBonus[type] = {
  date: <demain ISO>,
  bonus: 2.5,
  reason: 'Activité <type> non effectuée — récupération économisée'
}
```
La récupération non utilisée est créditée pour la séance du lendemain.

### FIX5b — wpComputeWorkWeight consomme le bonus
Après le hard cap (102.5% e1RM) et avant le retour final :
```js
if (db._recoveryBonus) {
  var _todayStr = new Date().toISOString().split('T')[0];
  var _hasBonus = Object.values(db._recoveryBonus).some(function(b) {
    return b.date === _todayStr && b.bonus > 0;
  });
  if (_hasBonus) {
    baseWeight = wpRound25(baseWeight + 2.5);
    Object.keys(db._recoveryBonus).forEach(function(k) {
      if (db._recoveryBonus[k].date === _todayStr) delete db._recoveryBonus[k];
    });
  }
}
```
Test FIX5b confirme :
- 1ère exécution : `wWith = 127.5` (bonus appliqué), key supprimée
- 2ème exécution : `wWithout = 125` (pas de bonus, key absente)
- diff = +2.5kg attendu

### FIX6 — Règle 7 goCheckAutoRegulation : échec implicite
Trois variantes :
- **-2 reps charge stable** : warning `isImplicitFailure`, msg « 📉 -X reps sans RPE noté — échec implicite possible. »
- **-3 reps charge stable** : danger `blockAPREIncrease`, strike LP incrémenté.
- **Charge baisse + reps baissent** : danger « épuisement », conversion en back-off recommandée.

### FIX7 — wpDetectPlateau actions par lift
| Lift | Action |
|---|---|
| Squat | `switch_variation` (High Bar / Squat Pause) |
| Bench | `switch_rep_range` (cycle force ↔ hypertrophie) |
| Deadlift | `back_off_10pct` (reset technique) |

### FIX8 — Alerte ischios/quads dans analyzeAthleteProfile
Calcul du ratio sets ischios / sets quadriceps sur la dernière semaine :
- Ratio < 0.75 + ≥ 4 sets quadriceps → alerte warning « Ischios/Quads faible (X.XX < 0.75) »
- Justification : prévention LCA, recommandation 1:1 sets ischios:quads en littérature.

## Tests Playwright (12/12)

| ID | Description | Résultat |
|---|---|---|
| FIX1 | Bulgarian Split Squat in force.squat | ✅ |
| FIX2 | Curl Marteau in force.bench | ✅ |
| FIX3 | wpDetectPlateau deadlift fenêtre 8 + min 4 | ✅ |
| FIX3b | wpDetectPlateau squat fenêtre 6 + min 3 (inchangé) | ✅ |
| FIX4 | getMissingActivityLogs filtre par jour | ✅ |
| FIX5 | confirmGhostLog crée db._recoveryBonus | ✅ |
| FIX5b | wpComputeWorkWeight consomme +2.5kg + supprime key | ✅ |
| FIX6 | -2 reps → warning isImplicitFailure | ✅ |
| FIX6b | -3 reps → danger + strike | ✅ |
| FIX6c | charge ↓ + reps ↓ → danger épuisement | ✅ |
| FIX7 | wpDetectPlateau squat → action switch_variation | ✅ |
| FIX8 | analyzeAthleteProfile retourne sections array | ✅ |

## Service Worker

`trainhub-v184` → `trainhub-v185`
