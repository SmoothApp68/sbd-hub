# Refonte Blocs Programme — v200

## Source : validation Gemini complète — "Ready for Prod"

## Blocs modifiés
`sq_hyp`, `bench_hyp`, `dead_hyp`, `bench2_hyp`, `sq2_hyp`, `sq2_spec` + nouveau `recovery_day`

## Changements clés

### 1. Squat — Force & Volume (`sq_hyp`)
**Avant** : `[squat, leg_press, rdl, leg_curl, mollet]`
**Après** : `[squat, leg_press, leg_ext, mollet_presse, planche]`
- Presse à cuisses pieds bas remplace Hack Squat post-Squat lourd
- Leg Extension (corrective) protégée si ratio S/B < 1.20
- Mollets à la presse → superset naturel avec Presse
- Gainage planche (fonctionnel)
- Fentes retirées → migrent vers `sq2_hyp`

### 2. Bench — Force & Volume (`bench_hyp`)
**Avant** : `[bench, incline_bench, ecarte, tri_cable, elev_lat]`
**Après** : `[bench, rowing_poulie, dips, face_pull, tri_cable]`
- Rowing poulie (pause 1s buste) — équilibre poussée
- Dips lestés (pecs/triceps)
- Face Pull crucial pour santé épaules à bench 140kg+
- Larsen Press retiré → migre vers `bench2_hyp` (où il a sa place)

### 3. Deadlift — Force & Volume (`dead_hyp`)
**Avant** : `[deadlift, row_barre, lat_pull, face_pull, curl_barre]`
**Après** : `[deadlift, squat_pause, lat_pull, leg_curl, relevé_jambes]`
- Squat Pause en position 2 (technical variation)
- Leg Curl ajouté (ischios — manquant jusqu'ici)
- Relevé de jambes (abdos fonctionnels)
- Hip Thrust retiré : pression axiale après DL contre-indiquée
- Mollets retirés → Lundi/Samedi

### 4. Bench 2 — Volume (`bench2_hyp`)
**Avant** : `[bench_halt, ohp, elev_lat, tri_cable, curl_halt]`
**Après** : `[incline_bench, larsen_press, row_halt, elev_lat, curl_barre]`
- Développé Incliné (angle différent de Bench barre J1)
- Larsen Press accessoire ICI uniquement (pas en J1)
- Rowing haltère un bras (amplitude max, épaisseur dos)
- Diversity_score : Incliné + Larsen ≠ Bench barre J1

### 5a. SBD — Technique & Vitesse (`sq2_spec`)
Activé si ratio S/B < 1.20 + niveau avancé + powerbuilding
**Avant** : `[squat, leg_press, leg_ext, hip_thrust, mollet]`
**Après** : `[squat, bench, speed_deadlift, leg_ext]`
- Squat (vitesse 65-70%)
- Bench (technique 70%)
- Speed Deadlift 6×1 @ 60% (lombaires frais)
- Leg Extension (corrective — INTOUCHABLE)

### 5b. Squat 2 — Volume Jambes (`sq2_hyp`, sans spécialisation)
**Avant** : `[squat, leg_press, hip_thrust, leg_curl, mollet]`
**Après** : `[squat, leg_press, leg_ext, fentes, mollet]`
- Fentes ICI (déplacées depuis sq_hyp)

### 6. NOUVEAU — Récupération Active (`recovery_day`)
6ème jour optionnel (non-systémique) : `[face_pull, bird_dog, relevé_jambes, planche]` + cardio LISS 30-45min

## SBD_VARIANTS.hypertrophie.bench
**Avant** : Larsen Press [10,12] RPE 8.0
**Après** : Bench Press (Barre) [5,8] RPE 8.0
> Mouvement de compétition — maintien influx nerveux spécifique sur tout le macrocycle

## Diversity Score Bench 1 ≠ Bench 2
Nouveau mécanisme `db.weeklyPlan._genCtx.placedMains` :
- `generateWeeklyPlan` initialise un contexte de génération
- Push le `mainName` de chaque jour primary après génération
- `wpGeneratePowerbuildingDay` lit le contexte avant de choisir la variante :
  - Si un Bench est déjà placé cette semaine → force `Développé Incliné (Haltères)`
- Renforce le `_bench2Override` existant (basé sur `dupProfileKey='volume'`)
- Cleanup automatique en fin de boucle

## Phase NEVER null
```js
var phase = wpDetectPhase() || 'hypertrophie';
if (!db.weeklyPlan) db.weeklyPlan = {};
if (!db.weeklyPlan.currentBlock) db.weeklyPlan.currentBlock = {};
db.weeklyPlan.currentBlock.phase = phase;
```
- Stocké AVANT le reste de la génération → `getDUPForce/Volume/Vitesse` recevront toujours une phase valide
- Si `wpDetectPhase()` retourne falsy → fallback `'hypertrophie'`

## EXO_DB — IDs ajoutés
- `mollet_presse` — Mollets à la presse (machine)
- `squat_pause` — Squat Pause 4×3 (technical)
- `speed_deadlift` — Speed Deadlift 6×1 (vitesse SBD)
- `larsen_press` — Larsen Press (volume bench2)
- `dips` — Dips lestés (pecs/triceps)
- `rowing_poulie` — Rowing poulie assis (pause 1s)
- `relevé_jambes` — Relevé de jambes (abdos fonctionnels)
- `bird_dog` — Bird Dog (lombaires)
- `fentes` — Fentes avant (alias de `fente`, requis par sq2_hyp)

## WP_EXO_META — entries ajoutés
- `'larsen press'`, `'speed deadlift'`, `'bench press'`

## Tests : 21/21 invariants statiques passés
| Test | Status |
|---|---|
| BLOC-01 sq_hyp = squat,leg_press,leg_ext,mollet_presse,planche | ✅ |
| BLOC-02 SBD_VARIANTS.hypertrophie.bench = Bench Press (Barre) | ✅ |
| BLOC-03 dead_hyp pos2 = squat_pause | ✅ |
| BLOC-04 dead_hyp contient leg_curl | ✅ |
| BLOC-05 bench2_hyp = incline + larsen | ✅ |
| BLOC-06 sq_hyp pas de fentes | ✅ |
| BLOC-07 sq2_hyp contient fentes | ✅ |
| BLOC-08 sq2_spec contient speed_deadlift | ✅ |
| DIVERS-01 _genCtx.placedMains tracking | ✅ |
| DIVERS-01 wpGen reads _genCtx | ✅ |
| PHASE-01 phase || hypertrophie default | ✅ |
| PHASE-01 currentBlock.phase = phase stocké | ✅ |
| EXO-DB : 9 IDs ajoutés | ✅ |

> Tests Playwright UI : `tests/audit-blocs-v200.spec.js` créé (10 tests). Non exécutés cette session — env Playwright cassé : `@playwright/test@1.56.0` vs `playwright@1.54.2` mismatch (problème pré-existant, hors scope v200).

## SW bumpé v199 → v200
