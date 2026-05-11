# v193 — Cardio matrix + Safe-corrective eviction + Dynamic titles + Bien-être guards

## Fix 6 — `getCardioDuration()` matrice (mode × phase)
- Respecte `db.user.programParams.cardio` ('aucun'/'dedie'/'integre') en PRIORITÉ ABSOLUE
- Matrice : `powerbuilding/powerlifting` 5-20 min, `musculation` 10-25, `seche` 15-45, `bien_etre` 45 stable
- Cap par temps restant ; < 5 min → 0
- Tag `evictionCategory: 'cardio'` injecté sur le set cardio

## Fix 7 — Pile d'éviction Safe-Corrective dans `adaptSessionForDuration`
Ordre : `cardio` (sauf sèche : pos 5) → `calves` → `forearms` → `abs` → `adductors` → `secondary`.
- `isCorrectivePriority` JAMAIS supprimé
- `isPrimary` JAMAIS supprimé
- Fallback : isolation non-protégée si dépassement persiste

## Fix 8 — Titres dynamiques
`generateWeeklyPlan` compose `<block label> · <DUP label>` :
- Lundi : `Squat — Force & Volume · Force / Hypertrophie`
- Vendredi : `Bench 2 — Volume · Volume / Hypertrophie`
- Samedi : `Squat 2 — Volume Jambes · Technique & Vitesse`

## Bien-être — pas de deload, pas de peak
- `shouldDeload(_, 'bien_etre')` → `{needed:false}`
- `wpDetectPhase()` retourne `'accumulation'` quand `db.user.trainingMode === 'bien_etre'`

## Tests : 10/10
- CARDIO-01..06 (matrice + setting user + plafond temps) ✅
- EVICTION-01 (Leg Extension correctif conservé, Mollets supprimé) ✅
- TITLE-01 (Samedi : `Squat 2 — Volume Jambes · Technique & Vitesse`) ✅
- BIEN-ETRE-01 (shouldDeload disabled) ✅
- BIEN-ETRE-02 (phase = accumulation) ✅

## SW bumpé → v193
