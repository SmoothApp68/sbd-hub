# READY-C2-a — Harnais de caractérisation des saisies (avant fusion)

Base : `main` = `95629f6` (post-diagnostic C2). Fichier : `tests/unit/c2-harness.test.js`.
Infrastructure : pattern Phase A à l'identique (vm-extraction de la vraie source depuis
app.js/import.js, `extractFn` + nouveau `extractVar` pour la constante `BLOCK_DURATION`,
stubs instrumentés, observe-then-assert). **Aucune modification de source nécessaire** :
toutes les fonctions cibles sont top-level → zéro exposition ajoutée, zéro fonction intestable.

## Résultat

```
Test Suites: 5 passed, 5 total
Tests:       106 passed, 106 total   (60 existants + 46 nouveaux, 0 rouge, 0 skip)
```

## Comportements figés (46 tests)

| Fonction | Tests | Comportements figés |
|---|---|---|
| `calculateReadiness` | 5 | Helms exact : (5,5,5,5)=53 ; (1,1,1,1)=33 ; **(10,10,10,10)=78 — pas 100** (soreness inversé 11−x) ; (10,10,10,1)=100 (clamp atteint) ; entrées paires ×2 (2,4,6,8)=34 |
| `getReadinessLoadAdjustment` | 2 | table complète 90/80/70/60/50/40 → 1.03/1.00/0.97/0.93/0.90/0.85/0.80 + frontières 89/79/69/59/49 |
| `_wpComputeWorkWeightPenalties` | 7 | sleep≤2 ET date du jour → 0.95 (sleep 3 → 1.0 ; date périmée → 1.0 ; null → 1.0) ; rhrAlert warning/danger/inconnu → 0.95/0.80/1.0 ; cumul 2+danger = 0.76 ; **rhrAlert lu SANS contrôle de date** (une alerte d'hier pénalise encore) |
| `wpDetectPhase` | 9 | wellbeing (s+m)/2 <45 % → 'deload' auto (frontière : 40 déclenche, 50 non) ; motivation absente → branche sautée ; 2 scores readiness <50 → 'force' (0 ou 1 → non) ; **priorité deload > force** (early return) ; effet de bord sync `currentBlock.phase/week` figé |
| `getStressVolumeModifier` | 4 | motivation≤2 ET sleep≤3 → 0.80 ; frontières (2+4, 3+3 → 1.0) ; null → 1.0 ; test `fossile_stress_inerte` (voir Surprise 1) |
| `shouldDeload` critère 1 | 5 | 40 <45 → needed/trigger 'srs' ; 50 → false ; sans wellbeing → false ; <3 logs → false même à sleep 1 |
| `hasTodayReadiness`/`getTodayReadiness` | 5 | entrée du jour / `_readinessSkipDate` jour vs −30 h ; **`double_saisie_possible_actuellement`** : `todayWellbeing` rempli ne ferme PAS le gate |
| `computeAdaptiveSRSThreshold` + Fast-Track | 6 | <10 → {45, fixed} ; σ=0 → seuil = moyenne (quirk) ; μ70/σ14.1 → 49 stable ; Fast-Track 85 → +5 kg ; 84.4 → +2.5 |
| `convertWorkoutToSession` | 2 | **`readiness_non_persiste_actuellement`** : `activeWorkout.readiness` absent de la session (C2-b inversera ce test sciemment) ; sanity titre/durée/volume |
| extraction | 1 | self-check des sources |

## Surprises (écarts diagnostic/prompt ↔ réel observé)

1. **`fossile_stress_inerte` — la prémisse du prompt était fausse au niveau fonction.**
   Attendu : « stress≥4 seul ne déclenche RIEN ». Observé : `getStressVolumeModifier`
   retourne **0.80** dès que `todayWellbeing.stress ≥ 4`, même avec motivation/sleep à 5.
   Le fossile est au niveau **système** (aucun écrivain ne pose ce champ — diagnostic Q5.5),
   pas au niveau fonction : si C2-b/c écrit un jour un champ `stress`, la réduction
   s'activera silencieusement. Le test fige la vérité (0.80) avec la nuance dans son nom.
2. **Frontière Fast-Track = 84.5, pas 85.** `computeAdaptiveSRSThreshold` retourne
   `mean: Math.round(mean)` ; le Fast-Track compare la moyenne ARRONDIE au seuil 85 →
   moyenne réelle 84.9 → 85 → **+5 kg**. Le cas « 84.9 vs 85 » demandé par le prompt donne
   +5 des deux côtés ; la vraie frontière est 84.4→+2.5 / 84.5→+5. Figé tel quel.
3. **`calculateReadiness(10,10,10,10) = 78`**, pas un max : le « tout au max » de l'UI
   (sliders à fond) produit un score moyen-haut car soreness 10 = très courbaturé (inversé).
   Le 100 n'est atteignable qu'avec soreness ≤ ~2. Cohérent mais contre-intuitif pour le
   futur mapping emoji (un utilisateur « tout à 5 » en emoji 1-5 ×2 = (10,10,10,10) → 78).
4. **`rhrAlert` est lu sans contrôle de fraîcheur** (contrairement au sommeil qui exige
   `date === aujourd'hui`) : une alerte RHR posée par un import Garmin ancien continue de
   pénaliser −5/−20 % tant que `todayWellbeing` n'est pas réécrit. Figé par test ; à
   trancher en C2-c (relogement RHR).
5. **Seuil adaptatif avec σ=0 → seuil = moyenne** : un utilisateur parfaitement régulier
   (12× le même score) aura un seuil deload égal à sa moyenne — n'importe quel jour
   « normalisé » sous sa moyenne déclenche la recommandation. Pas de plancher ressenti
   avant 30 (le `Math.max(30, …)` ne protège que les σ énormes).

## Fonctions intestables

Aucune. Les 9 cibles du prompt sont toutes top-level et vm-extractibles sans toucher
app.js/engine.js/import.js (le pattern Phase A suffit ; `BLOCK_DURATION` extrait comme
constante réelle via `extractVar` — même doctrine vraie-source).

## Non couvert volontairement

- `wpDetectPhase` branches amont (compDate/bien_etre/forcedAt/détection deload logs) :
  hors périmètre C2 (saisies) — les tests neutralisent ces chemins par le seed.
- `shouldDeload` critères 2+ (volume drop, RPE) : hors périmètre saisies ; les seeds des
  tests critère-1 sont calibrés pour ne pas les réveiller (observé avant figé).
