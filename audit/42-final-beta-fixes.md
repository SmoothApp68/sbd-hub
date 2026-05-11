# Fix Final Bêta v196

## Verdict Gemini : 4 points bloquants corrigés

### Bug 1 — Cardio 34 min hardcodé ✅
Second chemin d'injection cardio (`wpGetCardioForProfile` ligne 18943) court-circuitait la matrice v193 via `getProgressiveCardioDuration` qui montait à 34 min. Désormais routé via `getCardioDuration(mode, phase, goals, remainingMin)` — powerbuilding × hypertrophie cappé à 20 min. Retourne `null` si user a réglé `cardio: 'aucun'/'dedie'`.

### Bug 2 — Leg Extension non protégé sur Lundi ✅
`generateWeeklyPlan` flagge maintenant Leg Extension / Hack Squat / Sissy Squat avec `isCorrectivePriority=true` quand `squatBenchRatio < 1.20 + level avancé + powerbuilding`. La pile d'éviction `adaptSessionForDuration` (v193) les protège.

### Bug 3 — Squat Pause en position 5 ✅
`generateWeeklyPlan` réordonne maintenant `dayData.exercises` :
`primary → technical variations (paused/spoto/tempo/pin/deficit/dead-stop) → reste`.

### Bug 4 — Bench 2 = mêmes exos que Bench 1 ✅
Quand `phase=hypertrophie + tpl.mainLift=bench + dupProfileKey=volume`, le main lift de Bench 2 devient **Développé Incliné (Haltères)** 10-12 reps RPE 7.5 au lieu de Larsen Press (Bench 1).

## Résultat pour Aurélien (avancé, hypertrophie, S/B=1.057, PB 5j)

| Jour | Title | Primary | Cardio |
|---|---|---|---|
| Lundi | Squat — Force & Volume · Force / Hypertrophie | Squat (Barre) | 20 min |
| Mardi | Bench — Force & Volume · Force / Hypertrophie | Larsen Press | 20 min |
| Jeudi | Deadlift — Force & Volume · Force / Hypertrophie | Soulevé de Terre (Barre) | 20 min |
| Vendredi | Bench 2 — Volume · Volume / Hypertrophie | **Développé Incliné (Haltères)** | 20 min |
| Samedi | Squat 2 — Volume Jambes · Technique & Vitesse | High Bar Squat | 20 min |

Leg Extension flaggé `isCorrectivePriority` sur Lundi → protégé de toute compression.

## Tests : 6/6
- CARDIO-01 : powerbuilding × hypertrophie → cardio ≤ 20 min sur tous les jours ✅
- CARDIO-02 : `cardio: 'aucun'` → aucun cardio généré ✅
- CORRECTIVE-01 : Leg Extension sur Lundi → `isCorrectivePriority=true` ✅
- CORRECTIVE-02 : `adaptSessionForDuration` → Leg Extension conservé (compression) ✅
- TECHVAR-01 : Squat Pause sur Deadlift day → position 2 (après primary) ✅
- BENCH2-01 : Vendredi (Bench 2 volume) → Développé Incliné, pas Larsen ✅

## SW bumpé → v196
## PRÊT POUR BÊTA ✅
