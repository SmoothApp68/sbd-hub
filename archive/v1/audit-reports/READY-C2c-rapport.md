# READY-C2-c — Rapport : rebranchement sur la source unique + relogement RHR

Branche : `feat/ready-c2c-rebranchement` · Base : `main` = `f568ddd` (post-C2-b)
Commits (tous verts, règle PROMPT_RULES appliquée) :
`ff84c6b` PROMPT_RULES.md (règle du commit vert, dédié) · `933eab7` couche d'accès ·
`09a9428` lecteurs db.readiness · `1aa1c63` lecteurs todayWellbeing ·
`db34d50` relogement RHR (+ inversion test dans le même commit) · bump v284 (final).

## Couche d'accès

`getTodayCheckin()` / `getCheckinHistory(n)` (+ `_normalizeCheckinEntry`) sur
`db.readinessHistory`, forme normalisée double-échelle `{date, ts, score, pain,
sleep10…soreness10, sleep5…fraicheur5}` (x5 = x10/2 ; fraicheur5 = (11−soreness10)/2).
Fallback transitoire `db.readiness` du jour dans `getTodayCheckin` (entrées pré-C2-b) ;
pas de fallback `todayWellbeing` (edge jour de déploiement, accepté). Plus AUCUN
lecteur ne parse `readinessHistory` directement.

## Mapping ancien → nouveau (par lecteur)

| Lecteur | Avant | Après | Équivalence |
|---|---|---|---|
| `computeFormScoreComposite` | `db.readiness` 7 j | `getCheckinHistory()` 7 j | identique |
| `generateWeeklyReport` | `db.readiness` semaine | `getCheckinHistory()` | identique |
| `computeAdaptiveSRSThreshold` (+ LP Fast-Track) | `db.readiness` 30 | `getCheckinHistory()` | identique — frontière 84.5 (arrondi) revérifiée par le harnais |
| `checkWisdomBadge_Recovery` | `db.readiness` ×3 | `getCheckinHistory()` | identique |
| `wpDetectPhase` branche readiness | lows all-time → slice(-7) | même expression exacte sur `getCheckinHistory()` | identique |
| `computeSRS` subjScore (coach.js) | `db.readiness` 7 j | `getCheckinHistory()` typeof-gardé | identique |
| `hasTodayReadiness` | skip-flag + scan `db.readiness` | façade : skip-flag OU `hasTodayCheckin()` | élargie (voir note) |
| `getTodayReadiness` | scan `db.readiness` | façade dénormalisée 1-10 sur `getTodayCheckin()` | forme identique pour la bannière |
| `shouldDeload` critère 1 | `todayWellbeing.sleep/motivation` | `sleep5/motivation5` | conditions au caractère près |
| `getStressVolumeModifier` (vivante) | `todayWellbeing` m≤2 ∧ s≤3 | `motivation5≤2 ∧ sleep5≤3` | identique ; **branche stress≥4 intacte sur todayWellbeing** |
| `_wpComputeWorkWeightPenalties` sommeil | `todayWellbeing.date===auj ∧ sleep≤2` | `getTodayCheckin()` (date portée par l'accesseur) `∧ sleep5≤2` | identique |
| `wpDetectPhase` branche wellbeing | `(sleep+motivation)/2/5×100 <45` | `(sleep5+motivation5)/…` | frontière 45 identique |
| `buildChargeExplanation` sommeil | wb + date + sleep≤2 | `sleep5≤2` via accesseur | identique |
| `explainWeight` sommeil | `wellbeing.sleep≤2` | `sleep5≤2` | identique |
| `analyzeAthleteProfile` 🌙 (engine) | wb sleep/motivation/pain | `sleep5/motivation5/pain` typeof-gardé | identique |
| `renderWeekCard` badge bilan | `todayWellbeing.date===auj` | `getTodayCheckin() !== null` | identique (couvre aussi pré-C2-b) |
| `shouldRecordE1RMAsReference` | wb.sleep + **garde morte `.readiness`** | `sleep5≤2` ; garde morte retirée (ligne réécrite) | identique hors garde morte |
| `generateShareCard` (engine) | `(sleep + readiness-fantôme)/2×20` → **NaN** | `getTodayCheckin().score` ou null | le NaN visible meurt ici |
| RHR : pénalité / engine / buildCharge / explainWeight | `todayWellbeing.rhrAlert` sans date | `db.garminHealth.rhrAlert` **si date === aujourd'hui** | ⚠️ seul changement de comportement du lot (acté) |

## Relogement RHR (changement délibéré)

`showGarminCSVImport` écrit `db.garminHealth = { date, rhr, rhrAlert, importedAt }`
(init migrations ajoutée) et ne touche plus `todayWellbeing`. Validité 24 h : une
alerte d'un autre jour ne pénalise plus (−5/−20 %) ni ne s'affiche. Test figé
inversé **dans le même commit**, renommé `rhr_alert_expire_apres_24h`. La
préservation rhr/rhrAlert du merge `saveDailyCheckin` est devenue inerte —
laissée telle quelle (retrait = C2-d). Prod : aucun `rhr` existant (vérifié), zéro migration.

## Tests

```
Test Suites: 5 passed, 5 total
Tests:       129 passed, 129 total   (0 rouge, 0 skip — vert à CHAQUE commit)
```
123 → 129 : +6 tests accesseurs (normalisation paire/impaire, fallback, null, chrono/slice,
équivalence d'échelle sleep10=6→sleep5=3). Fixtures du harnais redirigées vers
`readinessHistory`, **assertions au caractère près** sauf les deux exceptions déclarées :
1. RHR (`rhr_alert_expire_apres_24h`) — inversion actée, même commit.
2. L'assertion **méta** dans `double_saisie_impossible` qui documentait l'ancien
   comportement non-façade de `hasTodayReadiness` (`expect(false)` → `expect(true)`).
   Ce n'était pas un seuil figé mais une ligne de documentation ajoutée en C2-b ;
   la façade rend `hasTodayReadiness` vraie dès qu'un check-in existe — c'est le
   comportement voulu du gate unifié, sémantique « Passer » inchangée.
3. Infrastructure : `algo-mock.test.js` reçoit un stub `getTodayCheckin → null`
   (équivalent exact de son `todayWellbeing: null`) — aucune assertion modifiée.

## Sweep final

Plus aucune lecture directe de `db.readiness`/`todayWellbeing` hors : couche d'accès
elle-même, miroirs d'ÉCRITURE de `saveDailyCheckin` (C2-d), branche fossile stress≥4
(C2-d), contenu de `getReadinessBannerHtml` (C2-d, via façade `getTodayReadiness`).

## Signalements hors-scope

1. `explainWeight.rhrAlert` n'était pas listé au prompt §4 — rebranché quand même
   (sinon il aurait lu un store que Garmin n'écrit plus = affichage mort silencieux).
2. `getCheckinHistory` ignore les entrées `readinessHistory` pré-C2-b SANS champ
   `date` pour `getTodayCheckin` (jamais « du jour ») mais les inclut dans l'historique
   (score/ts présents) — cohérent avec « aucune donnée fossile en prod » vérifié.
3. La CTA « Bilan du matin » de la Batterie Nerveuse (libellé) toujours à renommer (C2-d).
4. `db.rhrHistory` (30 entrées, lecture `analyzeRHR`) reste où il était — hors périmètre.
