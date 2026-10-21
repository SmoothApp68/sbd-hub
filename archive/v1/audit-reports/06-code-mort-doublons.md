# AUDIT 06 — Code mort, Doublons & Dette

> Agent 06 (vague 4, RELANCE) · branche `claude/agent09-profils-fixtures` · SW `trainhub-v350` · READ-ONLY strict.
> Généré le 2026-07-15, ~11h40–12h00 UTC. Un seul fichier écrit : `audit/06-code-mort-doublons.md`.
> Domaine : **code mort, doublons fonctionnels, copier-coller divergent, constantes magiques, tests obsolètes, dette.**
> S'appuie sur l'inventaire de l'agent 00 (`audit/00-inventaire-references.md`) pour le code mort « brut » — ma valeur ajoutée = la **carte des doublons DIVERGENTS** (concepts implémentés 2-3× qui ont divergé).

## Blocages rencontrés

Aucun blocage bloquant. READ-ONLY respecté (aucune modif hors ce fichier ; aucun git ; aucun Supabase).
- `npm test` **non lancé** (analyse statique read-only, `node_modules` non installé). Le gate jest n'est donc pas prouvé vert ici. À relancer par Aurélien sur un env avec deps.

## Résumé exécutif

**~9 doublons cartographiés, dont 4 DIVERGENTS confirmés (P2, potentiel P1).** Le gisement confirme l'insight de la nuit : **corrections appliquées côté Coach mais NON propagées aux surfaces Stats/Corps.**
1. **Calorique/macros** : le Coach dit ~2672 kcal (P 2.2/L 0.9, `calcTDEE`), l'onglet Corps dit ~2300 kcal (P 2.4/L 0.73, `calcCalorieCible`/`calcMacrosCibles`). Pire : le **Forme Score juge l'adhérence contre 2300** → suivre la reco du Coach échoue le contrôle d'adhérence du Forme Score.
2. **Ratios de force** : `STRENGTH_RATIO_TARGETS` (Coach) ≠ `computeStrengthRatios` (Stats), et la prescription programme (`wpApplyImbalanceCorrections`) est **cross-wired** (valeurs d'un système, seuils de l'autre).
3. **Push/Pull** : TROIS implémentations (fenêtres 30j/1sem/14j, méthodes sets vs volume-kg, pondérations différentes).
4. **Filtre warm-up** : le correctif « double test `setType==='warmup'` » propagé à 4 fonctions (e1RM, joints, landmarks) mais **PAS** à `computeWeeklyVolume`, `analyzeAthleteProfile` (push/pull) ni `detectVolumeSpike` → volume potentiellement gonflé sur ces surfaces.

Code mort confirmé : `calibrateTDEE`, `detectMomentum`, `checkRecompoProgress`, `computeWilks`, générateurs `program.js`. `calcCalorieCible` = **hardcodé aurel_br** (2300 kcal / 98 kg en dur → faux pour tout autre user).

---

## TABLEAU DES DOUBLONS

| Concept | Implémentation A | Implémentation B (+C) | Divergent ? | Autorité | Risque |
|---|---|---|---|---|---|
| **Cible calorique** | `getDailyCaloricTarget` app.js:15316 → `calcTDEE` engine.js:1144 (~2672, goal+fréq) | `calcCalorieCible` engine.js:1355 (2300×bw/98, **hardcodé**) | 🔴 OUI (~370 kcal) | `calcTDEE` (corrigé v343-345) | **P2** — Corps + Forme Score montrent une cible périmée |
| **Macros** | `getDailyCaloricTarget` : P 2.2 / L 0.9 g/kg (app.js:15337) | `calcMacrosCibles` engine.js:1361 : P 2.4(recompo)/1.95 · L 0.73(H)/1.0(F) | 🔴 OUI | non tranché (comment 15335 prétend « harmonisé » — **faux**) | **P2** |
| **Adhérence nutrition (Forme Score c4)** | juge vs `calcCalorieCible` (2300) + `bw×1.95` prot (app.js:15916-17) | Coach prescrit `calcTDEE` (2672) + `bw×2.2` | 🔴 OUI | — | **P1** — la cible du Coach échoue son propre contrôle d'adhérence |
| **Ratios de force** | `STRENGTH_RATIO_TARGETS` engine.js:43 (Coach `analyzeAthleteProfile`) | `computeStrengthRatios` app.js:15618 (Stats Muscles) | 🔴 OUI (bench/squat, squat/dead, row/bench) | `STRENGTH_RATIO_TARGETS` (canonique §10) | **P2** — 2 plages idéales + cross-wiring prescription |
| **Push/Pull** | `analyzeAthleteProfile` engine.js:2874 (sets 30j, zone 0.8–1.2) | `computeStrengthRatios` app.js:15638 (vol-kg 1sem, épaules×0.5, [0.80,1.10]) **+** `analyzeMuscleBalance` program.js:144 (sets 14j, pulls-vert×0.5, warn>1.4) | 🔴 OUI (3 méthodes) | non tranché | **P2** |
| **Filtre warm-up (comptage sets)** | 4 fn corrigées : `getTopE1RMForLift`:2577, `getVolumeByMuscleGroup`:2713, `calcWeeklyJointStress`:3925, `buildE1rmHistory`:5675 (`isWarmup===true \|\| setType==='warmup'`) | Non corrigées : `computeWeeklyVolume`:1705 (`.type`≠`.setType`), `analyzeAthleteProfile`:2882, `detectVolumeSpike`:4696, `checkVolumePR`:2020… (`!s.isWarmup` seul) | 🔴 OUI | double test (§11 : work = `setType==='normal'`) | **P2** (P1 si volume gonflé, cf. Supabase Q) |
| **e1RM (formules)** | `calcE1RM` app.js:1729 (Brzycki) · `wpCalcE1RM` app.js:22489 (RPE) · `getTopE1RMForLift` engine.js:2562 | `epleyE1RM`/`brzyckiE1RM`/`lombardi1RM` program.js:61-71 (**MORTES**) | copies mortes | app/engine (§14 : NE PAS FUSIONNER) | **P4** — vivantes [VOULU] ; program.js = dette |
| **Momentum** | `calcMomentum` engine.js:1401 (vivant, Home/coach) | `detectMomentum` engine.js:4754 (**0 appelant**) | — | `calcMomentum` | **P4** — orphelin |
| **Maps parent muscle** | `getMuscleGroupParent` engine.js:693 (labels FR → 'Jambes'…) | `MUSCLE_PARENT_MAP` app.js:6396 (IDs EN → parents FR) **+** `getMuscleGroupRadar` app.js:16605 (axes radar) | vocabulaires ≠ | — | **P4** — fragmentation (3 granularités jambes) |
| **Fenêtre temporelle logs** | `getLogsInRange(days)` app.js:1841 (borne haute+basse) | ~17 filtres inline `Date.now()-Nj` (10 app.js + 7 engine.js) | méthodes ≠ (date-source) | `getLogsInRange` | **P4** — copier-coller |

---

## TABLEAU CODE MORT (mon domaine — confirme/complète agent 00)

| Symbole | Fichier:ligne | Appelants trouvés | Verdict |
|---|---|---|---|
| `calibrateTDEE` | engine.js:1218 | **0** (def + 1 commentaire) | 🔴 MORT — safe à supprimer (§8 confirmé) |
| `detectMomentum` | engine.js:4754 | **0** | 🔴 MORT — orphelin, doublon inerte de `calcMomentum` |
| `checkRecompoProgress` | engine.js:1294 | **0** | 🔴 MORT — + fallback e1RM à clés non conformes (`'Bench Press'.history`) |
| `computeWilks` | engine.js:1663 | **0** (seul def ; `computeDOTS` partout) | 🔴 MORT — Wilks supplanté par DOTS |
| `estimateE1RMFromTransfer` | engine.js:2460 | **0** | 🔴 MORT |
| `getTDEEForDay` | — | **0** (déjà retiré) | ✅ supprimé (commentaire engine.js:1213) |
| `epleyE1RM` / `brzyckiE1RM` / `lombardi1RM` | program.js:61/66/71 | **0** hors def | 🔴 MORT — générateurs program.js supplantés par `wpGenerate*` |
| `generatePLMesocycle`/`generatePBSession`/`generateMuscuWeek` + 7 autres | program.js (cf. agent 00) | **0** | 🔴 MORT — program.js à moitié mort |
| `calcInsolvencyIndex` / `calcWeeklyFatigueCost` / `getSFRForExo` / `SFR_TABLE` | coach.js:329-376 | inerte (`analyzeAthleteProfileWithInsolvency`:614 = pass-through) | 🟡 **[VOULU]** — gardé volontairement (§backlog), NE PAS supprimer |
| `getCyclePhase`/`getMRVWithCycleAdjust`/`getRestWithCycleAdjust` | engine.js:1239/3311/3320 | 0 | 🟡 **[VOULU]** abandon (cycle sur VOLUME, §8) — mais code resté |
| `calcCalorieCible` | engine.js:1355 | **3** (Corps/Forme/macroHistory) | ⚠️ VIVANT mais **hardcodé aurel_br** (2300/98) — cf. finding P1 |
| `js/supabase.min.js` (154 KB) | fichier | **0** (non chargé) | 🔴 ORPHELIN |
| `js/babel.config.js`/`jest.config.js`/`jest.setup.js` | js/ | 0 (doublons des racines) | 🔴 ORPHELIN |
| ~72 fn orphelines + test-only | (voir agent 00 §P4) | 0 en prod | agent 00 les a listées — non recomptées ici |

> ⚠️ Aucune suppression recommandée sans grep final : les orphelins « test-only » (agent 00) et les `window.X=fn` câblés en onclick sont des **points d'entrée** — vérifier `window.`/onclick/`.test.js` avant purge.

---

## Findings

### [P1] Cible calorique & adhérence incohérentes entre Coach et Corps/Forme (chantier `calcTDEE` non propagé)
- **Où** : `js/app.js:15316` (`getDailyCaloricTarget`→`calcTDEE`) vs `js/engine.js:1355` (`calcCalorieCible`) vs `js/app.js:15916` (Forme Score adhérence)
- **Code** :
  ```js
  // Coach (app.js:15321,15337) : cible = calcTDEE(...) ≈ 2672 ; P = bw*2.2 ; L = bw*0.9
  // Corps ring (app.js:16142-16144) : cible = calcCalorieCible(bw) ≈ 2300 ; macros = calcMacrosCibles → P bw*2.4, L bw*0.73
  // Forme Score c4 (app.js:15916) : const tdee = db.user.tdee || calcCalorieCible(bw); // juge l'adhérence vs 2300
  ```
- **Problème** : trois chiffres pour la même journée. Le chantier « justesse calorique » (v343-345) a corrigé `calcTDEE` (goal unique, fréquence 28j) et l'a branché **uniquement** sur `getDailyCaloricTarget` (1 seul appelant : la carte Coach app.js:19772). L'onglet **Corps** (l'anneau nutrition, la surface la plus vue) et le **Forme Score** utilisent toujours l'ancien `calcCalorieCible` (2300 en dur pour 98 kg) + `calcMacrosCibles` (P 2.4 / L 0.73). Conséquence coach : un user qui mange les 2672 kcal recommandés par le Coach a `|2672-2300|/2300 = 16 % > 10 %` → **jugé NON-adhérent par son propre Forme Score** (composante Nutrition plombée). Le commentaire app.js:15335 affirme « Macros harmonisées avec `calcMacrosCibles` : P 2.2 g/kg, L 0.9 g/kg » — **faux** : `calcMacrosCibles` calcule P 2.4 / L 0.73.
- **Devrait** : une seule source. Router Corps + Forme Score sur `calcTDEE`/`getDailyCaloricTarget`, ou factoriser `calcMacrosCibles` avec les mêmes ratios. Aligner le contrôle d'adhérence sur la cible réellement prescrite.
- **Confiance** : certain (code lu ligne à ligne ; valeurs 2300/2672 dérivées des formules).
- **[VOULU?]** : non — vestige non propagé (le comment 16127 prouve qu'un 3e étage « cycling maison » a DÉJÀ été retiré ici, mais `calcCalorieCible` est resté).

### [P1] `calcCalorieCible` hardcodée sur aurel_br (2300 kcal / 98 kg)
- **Où** : `js/engine.js:1355-1360`
- **Code** :
  ```js
  function calcCalorieCible(bw) {
    const kcalBase = db.user.kcalBase || 2300;
    const bwBase   = db.user.bwBase   || 98;
    if (!bw || bw <= 0) return kcalBase;
    return Math.round(kcalBase * (bw / bwBase));
  }
  ```
- **Problème** : `kcalBase=2300` et `bwBase=98` sont les valeurs d'aurel_br (98 kg). Pour tout autre utilisateur sans `db.user.kcalBase`/`bwBase` renseignés, la cible est une **simple homothétie du profil d'Aurélien** : Léa à 60 kg → 2300×60/98 = **1408 kcal** (absurde, ignore taille/âge/genre/objectif/%gras que `calcTDEE` gère). Multi-user cassé sur toute surface utilisant `calcCalorieCible`.
- **Devrait** : `calcTDEE` (déjà per-user). Supprimer `calcCalorieCible` ou le brancher sur `calcTDEE`.
- **Confiance** : certain.
- **[VOULU?]** : non — reliquat mono-utilisateur pré-`calcTDEE`.

### [P2] Deux systèmes de ratios de force + prescription cross-wired
- **Où** : `js/engine.js:43-48` (`STRENGTH_RATIO_TARGETS`) vs `js/app.js:15633-15636` (`computeStrengthRatios`) ; consommateur mixte `js/app.js:23766` (`wpApplyImbalanceCorrections`)
- **Code** :
  ```js
  // engine.js:44 : squat_bench ideal [1.10,1.35]  → équivaut bench/squat [0.74,0.91]
  // app.js:15634 : bench_squat  ideal [0.60,0.70]                     ← DIVERGE
  // engine.js:45 : squat_dead ideal [0.75,1.05] ; app.js:15633 squat_deadlift [0.80,0.85] ← DIVERGE
  // engine.js:48 : row_bench  ideal [0.80,1.00] ; app.js:15636 row_bench [0.90,1.00]       ← DIVERGE
  // app.js:25112-25113 : _imbalanceRatios = computeStrengthRatios(); wpApplyImbalanceCorrections(..., _imbalanceRatios, ...)
  // app.js:23792 : if (ratios.bench_squat.value > 1/_t.squat_bench.alert)  ← valeur système B, seuil système A
  ```
- **Problème** : la carte Stats Muscles (`computeStrengthRatios`) affiche ses propres plages idéales, qui **divergent** du canonique `STRENGTH_RATIO_TARGETS` utilisé par le diagnostic Coach (`analyzeAthleteProfile`). Un bench/squat de 0.85 est « ✅ » côté Coach (car 1/0.85=1.18 dans [1.10,1.35]) mais « ⚠️ Trop haut » côté Stats (>0.70). Pire, `wpApplyImbalanceCorrections` mélange les deux : il lit les **valeurs** de `computeStrengthRatios` (clés `bench_squat`/`squat_deadlift`) mais les **seuils** de `STRENGTH_RATIO_TARGETS` — le commentaire 23768 « cohérence diagnostic Coach = prescription programme » est donc partiellement faux (orientation de ratio et plages ≠).
- **Devrait** : une seule table de ratios (le canonique `STRENGTH_RATIO_TARGETS`), lue par les 3 surfaces (Coach, Stats, prescription). Supprimer les plages hardcodées de `computeStrengthRatios`.
- **Confiance** : certain (valeurs + cross-wiring lus).
- **[VOULU?]** : partiellement — la carte Stats est peut-être calibrée à part, mais l'incohérence de verdict n'est pas voulue.

> Note secondaire (P3) : les commentaires de `wpApplyImbalanceCorrections` citent des seuils périmés (« row_bench.alert = 0.85 » alors que engine=0.80 ; « squat_bench.alert = 1.20 » alors que =1.10 ; « squat_dead.danger = 0.78 » alors que =0.65). Le **code lit le const** (pas de bug fonctionnel) mais les commentaires trompent le prochain lecteur.

### [P2] Trois calculs Push/Pull divergents
- **Où** : `js/engine.js:2874-2898` (`analyzeAthleteProfile`) · `js/app.js:15638-15640` (`computeStrengthRatios`) · `js/program.js:144-172` (`analyzeMuscleBalance`)
- **Code** :
  ```js
  // engine.js:2884  : sets par PUSH_KEYS/PULL_KEYS sur 30j, zone saine 0.8–1.2
  // app.js:15638    : pushVol = pecs + epaules*0.5 + triceps ; pullVol = dos + biceps ; vol-kg 1 sem ; ideal [0.80,1.10]
  // program.js:154  : pull vertical ×0.5 (SFR) ; warn si ratio > 1.4, info si < 0.7
  ```
- **Problème** : trois fenêtres (30j / 1 sem / 14j — `analyzeMuscleBalance` appelé avec `days=14` coach.js:161), trois méthodes (sets vs volume-kg), trois pondérations (épaules ×0.5 côté Stats, pulls verticaux ×0.5 côté program, aucune côté Coach) et trois seuils (0.8–1.2 / 0.80–1.10 / 0.7–1.4). Deux d'entre eux (`analyzeAthleteProfile` + `analyzeMuscleBalance`) alimentent la **même surface Coach** → alertes potentiellement contradictoires. Le commentaire engine.js:2867 confirme qu'UN 4e bloc push/pull redondant a déjà été retiré — le nettoyage n'est pas allé au bout.
- **Devrait** : un seul calculateur push/pull paramétré (fenêtre, pondération), consommé par les 3 surfaces.
- **Confiance** : certain.
- **[VOULU?]** : non — dette de non-consolidation.

### [P2] Correctif filtre warm-up non propagé → volume potentiellement gonflé
- **Où** : `js/engine.js:1705` (`computeWeeklyVolume`), `:2882` (`analyzeAthleteProfile` push/pull), `:4696` (`detectVolumeSpike`) — vs les 4 fonctions corrigées (2577/2713/3925/5675)
- **Code** :
  ```js
  // FIX appliqué (engine.js:2577,2713,3925,5675) :  s.isWarmup === true || s.setType === 'warmup'
  // computeWeeklyVolume (1705) :  !s.isWarmup && s.type !== 'warmup'      // ← teste .type, PAS .setType
  // analyzeAthleteProfile (2882) / detectVolumeSpike (4696) : !s.isWarmup  // ← isWarmup seul
  ```
- **Problème** : les sets loggés portent `setType` (import.js:268, 944-976 poussent `{weight,reps,setType,rpe}` **sans** `isWarmup` ni `.type`). Le commentaire engine.js:2709-2711 documente exactement le bug : « l'ancien filtre `!s.isWarmup` comptait les échauffements comme séries effectives (volume gonflé) ». Le correctif (double test `setType==='warmup'`) a été propagé aux fonctions e1RM / stress articulaire / landmarks, mais **PAS** à `computeWeeklyVolume` (source du radar Stats + du push/pull `computeStrengthRatios`), ni au push/pull du diagnostic Coach, ni à `detectVolumeSpike` (fonction **calibrée**, §10 : détection +20 %/danger +30 %). Un warm-up loggé `{setType:'warmup'}` y est **compté comme série de travail** → volume gonflé, spike faux-positif possible.
- **Devrait** : filtre unique `s.isWarmup === true || s.setType === 'warmup'` (idéalement un helper `isWorkSet(s)`) partout.
- **Confiance** : certain (code inconsistant) ; **probable** sur le gonflement réel (dépend de la présence d'`isWarmup` sur les sets loggés en base → question Supabase).
- **[VOULU?]** : non — propagation incomplète.

### [P4] `program.js` à moitié mort — copies e1RM/générateurs jamais appelées
- **Où** : `js/program.js` (`epleyE1RM`:61, `brzyckiE1RM`:66, `lombardi1RM`:71, `generatePLMesocycle`:237, `generatePBSession`:267, `generateMuscuWeek`:317, +4)
- **Problème** : `brzyckiE1RM` (program.js:66) est une **2e implémentation** de la formule Brzycki déjà présente dans `calcE1RM` (app.js:1729) — mais program.js est mort (générateurs supplantés par `wpGenerate*`). CLAUDE.md §8 affirme que ces e1RM sont « combinées pour la génération » — divergence doc/code (déjà relevée par agent 00).
- **Devrait** : purger les générateurs + formules e1RM mortes de program.js (garder les analyseurs vivants : `recommendSplit`, `analyzeMuscleBalance`, `getVolumeStatus`…).
- **Confiance** : certain. **[VOULU?]** : non.

### [P4] Copier-coller de fenêtre temporelle (~17 sites) vs `getLogsInRange`
- **Où** : 10 occurrences app.js + 7 engine.js de `Date.now() - N*86400000` inline, alors que `getLogsInRange(days)` (app.js:1841) existe et est utilisé 16×.
- **Problème** : dette de copier-coller. Divergence subtile : `getLogsInRange` borne haut ET bas (`>= lim && <= now`) et lit `l.timestamp` ; certains filtres inline lisent `new Date(l.date||l.timestamp)` (computeWeeklyVolume:1697) ou ne bornent que le bas → comportements légèrement différents sur les logs à timestamp futur/absent.
- **Devrait** : centraliser sur `getLogsInRange` (ou un helper engine équivalent).
- **Confiance** : certain (comptage grep). **[VOULU?]** : non.

### [P4] Trois vocabulaires de mapping muscle → parent
- **Où** : `getMuscleGroupParent` engine.js:693 (labels FR → 'Jambes'/'Dos'…) · `MUSCLE_PARENT_MAP` app.js:6396 (IDs EN `chest_upper`/`lats` → parents FR) · `getMuscleGroupRadar` app.js:16605 (→ axes radar, garde Quads/Ischio/Fessiers séparés, **Mollets→Ischio**).
- **Problème** : trois granularités pour les jambes (1 'Jambes' vs 4 parents vs axes radar), sur deux vocabulaires (FR labels vs EN ids). Risque de dérive si un muscle est ajouté à un seul des trois. `getMuscleGroupRadar` fold **Mollets→Ischio** (discutable — croise le domaine matching, non investigué ici).
- **Devrait** : dériver les vues (parent, radar) d'une seule table source.
- **Confiance** : certain (3 maps lues). **[VOULU?]** : partiel — granularités par usage justifiées, mais la fragmentation du vocabulaire est de la dette.

---

## Constantes magiques (seuils pilotant une décision/affichage)

| Littéral | Où | Rôle | Risque |
|---|---|---|---|
| `2300` / `98` | engine.js:1356-1357 (`calcCalorieCible`) | base kcal + poids **d'aurel_br** | 🔴 hardcode mono-user (cf. P1) |
| `0.10` | app.js:15921-15922 (Forme Score adhérence) | tolérance ±10 % kcal/prot | seuil d'adhérence non nommé |
| `vol>10?1.3:vol>6?1.1:1.0` | app.js:15398 (`getMuscleRecoveryStatus`) | multiplicateur récup selon volume | 3 seuils magiques enfouis |
| `* 0.5` | engine.js:1140 (`calcTDEEKatchMcArdle`) | kcal cardio = TRIMP × 0.5 | facteur non nommé |
| `bw * 33` | engine.js:1190 (`calcTDEE` fallback) | TDEE de secours | facteur non nommé |
| `1.7 / 1.6 / 1.3` | engine.js:1168 (`calcTDEE`) | facteurs d'activité (6+ / 3-5 / <3 séances) | seuils fréquence enfouis |
| `1.15` / `1.1` | engine.js:1256/1263 (`getMRV`/`getMEV`) | bonus volume femmes | OK mais non nommé |
| `mrv / 7 * 2` | engine.js:1740 (`computeMuscleFatigue`) | normalisation fatigue | dénominateur magique |
| `RING_CIRCUM=440` | app.js:16151 (`renderCorpsTab`) | circonférence anneau SVG | cosmétique |

> Le projet vient de recalibrer une dizaine de seuils : chaque littéral ci-dessus est un seuil qu'on **oubliera de recalibrer** car invisible. Le pire est `2300/98` (hardcode user). Les seuils diagnostic majeurs (`STRENGTH_RATIO_TARGETS`, `VOLUME_SPIKE_THRESHOLD`, joint stress) sont, eux, correctement nommés en constantes — bon point.

---

## Dette structurelle (inventaire, PAS de reco de refacto — un chantier à la fois)

| Fonction | Où | Lignes | Note |
|---|---|---|---|
| `renderCoachTodayHTML` | app.js:19364 | **847** | **[VOULU]** ne pas découper avant bêta — mais CLAUDE.md dit « 438L » : **doc périmée** (a doublé) |
| `wpGeneratePowerbuildingDay` | app.js:24664 | 665 | générateur PB (cœur algo) |
| `generateWeeklyPlan` | app.js:26158 | 547 | générateur plan |
| `renderSettingsProfile` | app.js:17352 | 430 | UI réglages (§17 backlog : dégraisser) |
| `analyzeAthleteProfile` | engine.js:2784 | 399 | diagnostic Coach (contient ratios + push/pull dupliqués) |
| `renderWeekCard` / `generateProgram` / `renderGoExoCard` | app.js:8343/2732/28471 | 319/304/290 | monstres UI/génération |
| `wpComputeWorkWeight` | app.js:22776 | 287 | **[VOULU]** (§8 refacto en 3 parties déjà faite) |

- **Mutation au render** (§9, connu) : `blockStartDate` muté au render (préexistant v230) — **[VOULU]** dette connue, non régressée ici. Pas d'autre écriture-au-render détectée dans mon périmètre (les surfaces nutrition lisent `db.body`/`db.user` sans écrire).

---

## Tests obsolètes (bref — agent 08 couvre le domaine tests en profondeur)

- **29 `tests/audit-*.spec.js`** versionnés (v154→v230) : hors gate `npm test` (`jest.config testMatch=**/*.test.js` ; ce sont des Playwright). Markup figé à d'anciennes versions → faux sentiment de sécurité s'ils sont un jour relancés. `audit/*.spec.js`/`*.js` idem (harnais historiques).
- Aucun `.test.js` (gate jest) ne référence une fonction fantôme confirmée (vérifié par agent 00). Le gate n'est donc pas cassé par les orphelins.
- ⚠️ **Test qui teste du code mort** : les orphelins « test-only » listés par agent 00 (`getE1RMDisplay`, `hasPRData`, `generateWisdomChallenges`…) sont couverts par des tests unitaires mais **morts en prod** → le vert de ces tests ne protège rien de vivant. À trancher : câbler ou supprimer (fonction + test ensemble).

---

## Angles morts de cet audit

- `npm test` non exécuté (env sans deps) : le vert du gate jest n'est pas prouvé, seulement l'absence de référence-fantôme.
- Détection d'appelants par grep textuel (non-AST) : un dispatch dynamique par nom construit (`window[x]()`) échapperait. Les orphelins valent « 0 référence textuelle ».
- **Data-dépendant** : la prévalence réelle du gonflement de volume (P2 warm-up) dépend de la présence d'`isWarmup` sur les sets loggés en base → question Supabase ci-dessous.
- CSS mort non inventorié (312 KB inline index.html) — hors budget temps (agent 00 a noté `.wp-*`).
- Doublons **intra-app.js** de rendu (cartes nutrition dupliquées entre onglets) non exhaustivement diffés ligne à ligne.

## Hors-domaine (signalé, non investigué)

- **Matching** : `getMuscleGroupRadar` mappe Mollets→Ischio (app.js:16607) ; `computeStrengthRatios` utilise `matchExoName` (angle mort stiff-leg, §9) pour ohp/row. → agent matching.
- **Coach/algo** : les 3 push/pull et 2 ratios produisent des verdicts ; l'impact coaching (contradiction d'alertes) relève de l'agent logique-coach.
- **Sync** : `mergeExerciseData` testé/0-appelant (agent 00 P2) → agent sync.
- **Nutrition/calorique** : la justesse des valeurs 2300 vs 2672 (laquelle est « vraie » pour aurel_br) relève de l'agent calculs/pertinence — moi je constate la divergence, pas laquelle a raison.

## À VÉRIFIER CÔTÉ SUPABASE

1. **Sets loggés & warm-up** : les sets dans `workout_sessions.data.exercises[].allSets[]` portent-ils un champ `isWarmup` (booléen) EN PLUS de `setType`, ou seulement `setType` ? Si seulement `setType`, alors `computeWeeklyVolume`/`analyzeAthleteProfile`/`detectVolumeSpike` (filtre `!s.isWarmup`) **comptent les échauffements comme séries de travail** → volume/spike gonflés. Requête : `select data->'exercises'->0->'allSets' from workout_sessions where user_id='6e2936e7-...' limit 5;` — inspecter les clés d'un set warm-up.
2. **`db.user.kcalBase` / `bwBase`** : ces champs sont-ils renseignés pour les users autres qu'Aurélien ? S'ils sont vides, `calcCalorieCible` renvoie une homothétie du profil d'Aurélien (2300×bw/98). Requête : `select id, data->'user'->>'kcalBase', data->'user'->>'bwBase', data->'user'->>'bw' from sbd_profiles;`
3. **Cible affichée vs mangée** : pour aurel_br, la cible « vraie » (recompo) est-elle 2672 (calcTDEE) ou 2300 (calcCalorieCible) ? (Décision coaching Gemini/Aurélien — je constate la divergence, pas le bon chiffre.)

---

STOP. Audit Code mort, Doublons & Dette terminé. Rapport : `audit/06-code-mort-doublons.md`. Aucune modification, aucun commit.
