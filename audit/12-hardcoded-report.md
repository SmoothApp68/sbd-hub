# Audit 12 — Valeurs hardcodées non-adaptatives
Date : 2026-05-15  
SW : trainhub-v239  
Fichiers audités : engine.js, app.js, coach.js, program.js, index.html  
Branche : claude/diagnose-program-display-U2WwA

---

## Violations critiques 🔴

| Fichier | Fonction | Ligne | Code | Problème | Suggestion |
|---|---|---|---|---|---|
| program.js | `VOLUME_LANDMARKS` | 37–48 | `'Dos': { mev:10, mav:20, mrv:26 }` | **Doublon** de `MUSCLE_VOLUME_TARGETS` dans engine.js avec valeurs différentes pour les mêmes muscles (ex : Dos MRV 26 vs 25). Deux sources de vérité divergentes pour la même donnée. | Supprimer `VOLUME_LANDMARKS` dans program.js, importer `MUSCLE_VOLUME_TARGETS` depuis engine.js |
| index.html | `_tryActivateGodMode()` | 3476 | `const ADMIN_EMAIL = 'aurelien.cofypro@gmail.com'` | Email personnel hardcodé en clair dans le code. Si l'admin change d'email ou si un autre admin est ajouté, le code doit être modifié. | Stocker dans variable d'environnement ou vérifier uniquement via `profiles.is_admin` Supabase (déjà fait en 2e check) |

---

## Violations mineures ⚠️

| Fichier | Fonction | Ligne | Code | Problème |
|---|---|---|---|---|
| engine.js | `getLPIncrement()` | ~4266 | `if (gender === 'F' \|\| bw < 65)` | Seuil absolu 65 kg pour séparer "composé léger" / "composé lourd". Ne tient pas compte du niveau, de la morphologie, ou du poids de la barre. Un homme de 64 kg compétiteur reçoit le même incrément qu'un débutant de 55 kg. |
| engine.js | `shouldExitLP()` | ~1818 | `squat >= bw * 1.0 \|\| bench >= bw * 0.8` | Seuils BW-ratio fixes pour déclencher la sortie de LP. Non adaptés au genre (femme avec bench = 0.8×BW est hors LP alors que c'est élite). Pas de fallback selon `level`. |
| engine.js | `analyzeAthleteProfile()` | ~2802 | `dlSqRatio < 1.10` | Seuil hardcodé directement dans la fonction. Incohérent : les autres ratios (squat_bench, row_bench…) utilisent `STRENGTH_RATIO_TARGETS` comme lookup. Aucune entrée `dl_sq` dans cette table. |
| engine.js | `analyzeAthleteProfile()` | ~2810 | `ob < 0.60` | Valeur copiée depuis `STRENGTH_RATIO_TARGETS.ohp_bench.ideal[0]` mais référencée en dur. Si la table change, cette constante reste à 0.60. |
| engine.js | `getMRV()` / `getMEV()` | ~1184, ~1191 | `base * 1.15` / `base * 1.10` | Multiplicateurs féminins universels sans source documentée dans le code. Appliqués à tous les groupes musculaires de façon identique, ignorant que certains muscles répondent davantage au volume chez les femmes (fessiers, ischio) que d'autres (triceps, avant-bras). |
| engine.js | `calcE1RMFrom5RepTest()` | ~3294 | `e1rm * 0.85` | Escompte 15% appliqué au résultat du test 5RM. Pas de commentaire justifiant cette valeur. Non adaptatif au profil. |
| engine.js | `calcStartWeightFromRPE5Test()` | ~4272 | `e1rm * 0.70` | Escompte 30% pour le poids de démarrage LP. Sans source documentée ni adaptation au niveau. |
| program.js | `isFatigued()` | ~193 | `(totalVolume2Weeks / 2) > 20000` | Seuil tonnage absolu 20 000 g/semaine déclenche le flag fatigue. Un athlète de 120 kg en force dépasse ce seuil normalement. Devrait être rapporté au BW ou aux DOTS. |
| app.js | `wpGeneratePowerbuildingDay()` | 22139 | `weight * 0.80; setsCount ÷ 2; rpe = 6` | Deload : -20% charge, ÷2 séries, RPE 6. Valeurs standard industrie (RP Strength) mais sans adaptation au niveau ou à la fatigue détectée. Un athlète en deload préventif (SRS > 60) reçoit le même traitement qu'un athlète en déload forcé (SRS < 40). |
| app.js | `wpApplyImbalanceCorrections()` | ~21164, ~21176, ~21195, ~21207 | `ratio < 0.90`, `ratio > 0.83`, `ratio < 0.80`, `ratio < 0.60` | Seuils de déclenchement des corrections imbalance. Pas dans `STRENGTH_RATIO_TARGETS` (table consultée par `analyzeAthleteProfile`). Duplication de logique avec valeurs légèrement différentes de celles de la table (`row_bench.alert = 0.85` vs `0.90` ici). |
| coach.js | `computeReadinessScore()` | ~481 | `acwr * 0.60 + subj * 0.20 + trend * 0.20` | Pondérations ACWR/Subjectif/Trend fixes. Documentées dans CLAUDE.md mais pas dans le code. Non adaptatives au niveau ou à la disponibilité HRV. |

---

## Points corrects ✅

- **`STRENGTH_RATIO_TARGETS`** (engine.js:37–43) — table lookup externe consultée dynamiquement, valeurs cohérentes avec littérature SBD. ✅
- **`MUSCLE_VOLUME_TARGETS`** (engine.js:46–55) — table RP Strength citée en commentaire, lookup dynamique dans getMRV()/getMEV(). ✅
- **`BLOCK_DURATION[mode][level]`** (program.js) — adaptatif par mode et niveau. ✅
- **`getDLSetsReps(weekInPhase)`** — après FIX 2, adaptatif par `db.user.level`. ✅
- **`isCreator()`** (app.js:15487) — flag booléen en DB (`db.user.isCreator`), pas email hardcodé. ✅
- **`ADMIN_EMAIL` double-check** (index.html:3519–3521) — suivi d'une vérification server-side `profiles.is_admin` Supabase. Ne contrôle pas la prescription. ✅
- **`SFR_TABLE` + `getSFRForExo()`** (coach.js — FIX 1) — lookup par nom d'exercice avec fallback catégorie. ✅
- **`WP_ACCESSORIES_BY_PHASE`** — constantes de pool (valeurs par défaut légitimes), non finales. ✅
- **`WP_SESSION_TEMPLATES`** — idem, valeurs de départ avant adaptation dynamique. ✅
- **RPE cap technique** (app.js — FIX 4) — adaptatif : déclenché uniquement sur `dayKey === 'technique'`. ✅
- **Coefficient 0.5 tirages verticaux** (program.js — FIX 3) — conditionnel sur pattern nom exercice. ✅
- **Coefficients Brzycki** (`0.0278`, `1.0278`) — constantes physiques invariantes. ✅
- **TRIMP diviseurs** (`/ 15`, `/ 60`) — documentés dans CLAUDE.md et dans les commentaires de code. ✅
- **`GENDER_MUSCLE_FACTORS`** (app.js) — table lookup par groupe musculaire, pas coefficient global. ✅
- **`STRENGTH_STANDARDS_FEMALE`** (app.js) — table par catégories de poids, consulted dynamiquement. ✅
- **Badges BW-ratio par genre** (app.js:3394–3396) — adaptatifs par genre avec fallback `male`. ✅

---

## Score par fichier

| Fichier | Critiques | Mineures | Score |
|---|---|---|---|
| engine.js | 0 | 6 | 7.5/10 |
| app.js | 0 | 3 | 8.5/10 |
| coach.js | 0 | 1 | 9/10 |
| program.js | 1 (doublon VOLUME_LANDMARKS) | 1 | 7/10 |
| index.html | 1 (ADMIN_EMAIL) | 0 | 9/10* |

*ADMIN_EMAIL n'influence pas la prescription — impact réel limité à la sécurité.

---

## Recommandations prioritaires

1. **[P1 — program.js]** Supprimer `VOLUME_LANDMARKS` de program.js et le remplacer par un alias vers `MUSCLE_VOLUME_TARGETS` depuis engine.js. Aligner les valeurs MRV/MAV/MEV sur une seule source de vérité. C'est la seule vraie violation critique : deux tables divergentes pour la même donnée biologique.

2. **[P2 — engine.js]** Ajouter `STRENGTH_RATIO_TARGETS.dl_sq = { ideal: [1.10, 1.25], alert: 1.10, danger: 1.00 }` et remplacer le hardcode `dlSqRatio < 1.10` dans `analyzeAthleteProfile()` par une référence à cette table.

3. **[P3 — engine.js]** Dans `wpApplyImbalanceCorrections()` (app.js), aligner les seuils sur `STRENGTH_RATIO_TARGETS` au lieu de les hardcoder. Les valeurs actuelles divergent légèrement (0.90 vs 0.85 pour row/bench).

4. **[P4 — engine.js]** Documenter les coefficients `0.85` (calcE1RMFrom5RepTest) et `0.70` (calcStartWeightFromRPE5Test) avec une source (Israetel / Helms / RP) ou remplacer par une table indexée par `level` (débutant → 0.75, intermédiaire → 0.80, avancé → 0.85).

5. **[P5 — engine.js]** Remplacer `bw < 65` dans `getLPIncrement()` par une condition sur `level` (débutant → incrément léger) ou une table `LP_INCREMENT_BY_LEVEL`. Le poids de corps ne devrait pas piloter seul l'incrément.

6. **[P6 — program.js]** Dans `isFatigued()`, remplacer `> 20000` par `> (db.user.bw || 80) * 250` pour calibrer le seuil tonnage au poids de corps.

7. **[P7 — index.html]** Déplacer `ADMIN_EMAIL` dans une constante `SUPABASE_CONFIG` ou supprimer complètement la vérification email (la vérification `profiles.is_admin` Supabase en ligne 3521 est suffisante).

---

## Résumé exécutif

L'architecture globale est **saine** : les seuils critiques (ratios de force, volumes MEV/MAV/MRV) sont dans des tables de lookup consultées dynamiquement. Aucune condition `userId === '6e29...'` ou `name === 'Aurélien'` n'a été trouvée dans la logique de prescription.

Le problème principal est la **duplication de la table de volumes** entre engine.js et program.js — deux sources de vérité divergentes pour les mêmes muscles. Les autres violations sont des coefficients utilitaires sans documentation de source ou des seuils légèrement décalés entre fonctions qui devraient partager la même table.

**Score adaptatif global : 8.2 / 10**
