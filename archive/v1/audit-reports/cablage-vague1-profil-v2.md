# Audit de câblage EXHAUSTIF — Vague 1 : onglet Profil (v2)

> **READ-ONLY STRICT.** Aucune modification de code. Aucun fix, aucune proposition, aucune priorisation,
> aucun jugement de gravité. État des lieux, point.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Remplace `audit/cablage-vague1-profil.md` (v1), qui explorait au lieu d'énumérer et a raté des sections.

---

## CONTRÔLE D'EXHAUSTIVITÉ

> **Phase 1 : 176 éléments inventoriés. Phase 2 : 176 verdicts rendus. Phase 5 : 176 statuts runtime.**
> Les trois nombres sont identiques. **Aucune ligne sans statut runtime.**

**Zone auditée, vérifiable :**

| Périmètre | Bornes exactes |
|---|---|
| Markup de l'onglet Profil | `index.html:2610` (`<div id="tab-profil">`) → `index.html:3149` (`</div><!-- /tab-profil -->`) |
| Sections injectées au runtime | `js/app.js:18080-18375`, à l'intérieur de `renderSettingsProfile()` (`js/app.js:17947`) |

**Décompte de l'inventaire :**

| Source | Éléments |
|---|---|
| ids du markup (`index.html:2610-3149`) | **160** (160 occurrences, 160 uniques — aucun doublon) |
| ids injectés au runtime (jamais dans le markup) | **16** |
| **TOTAL — contrat phase 1** | **176** |

Mesures annexes (comptées, non numérotées dans la table car rattachées à leur élément) :
handlers inline du markup : **74**, appelant **44** fonctions distinctes — *les 44 existent, aucun handler mort*
(vérifié : chaque identifiant appelé a une définition `function X` dans `js/`).

**Correction de méthode par rapport à la v1** : l'inventaire markup seul est **insuffisant**.
`renderSettingsProfile()` injecte 7 sections entières par `createElement` — dont **toute la section RGPD** —
qui n'apparaissent dans aucun grep de `index.html`. La v1 les a manquées par construction.
La phase 1 a donc été étendue au markup généré. Ce piège n'était pas dans la liste des 6 ; il s'y ajoute (n°7).

**Ce que je n'ai pas pu vérifier** : aucune donnée Supabase n'a été consultée (pas d'accès) — questions
en fin de rapport. Rien n'a été ouvert sur un device Android réel : la phase 5 exécute l'app dans
Chromium (viewport 390×844), réseau intégralement stubbé.

> **Mise à jour après la phase 5** : les mentions `SUPPOSÉ` des phases 1-4 ont toutes été tranchées par
> l'exécution. Le détail est en phase 5 ; les verdicts réfutés ont été corrigés **dans la table**, avec
> la mention `✘ RÉFUTE` dans la colonne Runtime. Un constat nouveau, **F19**, n'existait dans aucune
> version statique : c'est l'exécution qui l'a produit.

---

# PHASE 1 — INVENTAIRE MÉCANIQUE

## 1a/1d. Sections et sous-onglets (bornes + décompte d'ids)

**Sous-nav de l'onglet** (`index.html:2611-2614`) : **2 pilules seulement** — `⚖️ Corps`, `⚙️ Réglages`.

| # | Section | Bornes | ids |
|---|---|---|---|
| — | Racine `tab-profil` | 2610-2614 | 1 |
| A1 | Corps · Score de Forme (`ca-forme`) | 2615-2637 | 6 |
| A2 | Corps · Charge d'entraînement (`ca-load`) | 2638-2646 | 3 |
| A3 | Corps · Heatmap musculaire (`ca-heatmap`) | 2647-2655 | 3 |
| A4 | Corps · Santé articulaire (`ca-joints`) | 2656-2664 | 3 |
| A5 | Corps · Poids (`ca-poids`) | 2665-2683 | 6 |
| A6 | Corps · Nutrition (`ca-nutri`) | 2684-2720 | 23 |
| A7 | Corps · Métriques Force (`ca-force`) | 2721-2740 | 10 |
| A8 | Corps · Coach Analyse (`ca-coach`) | 2741-2748 | 3 |
| B1 | Réglages · Profil Athlète (`acc-profil`) | 2749-2957 | 41 |
| B2 | Réglages · Exercices Clés (`acc-keylifts`) | 2958-2972 | 3 |
| B3 | Réglages · Mon Programme (`acc-prog`) | 2973-2984 | 3 |
| B4 | Réglages · Import (`acc-import`) | 2985-3012 | 12 |
| B5 | Réglages · Sync Cloud (`acc-cloud`) | 3013-3044 | 17 |
| B6 | Réglages · Sauvegarde (`acc-backup`) | 3045-3065 | 6 |
| B7 | Réglages · Correction Records (`acc-records`) | 3066-3077 | 3 |
| B8 | Réglages · Glossaire (`acc-glossary`) | 3078-3087 | 3 |
| B9 | Réglages · Statut & Thèmes (`acc-tier`) | 3088-3101 | 6 |
| B10 | Réglages · Notifications Push (`acc-notif`) | 3102-3114 | 3 |
| B11 | Réglages · Zone de Danger (`acc-danger`) | 3115-3136 | 2 |
| B12 | Réglages · Pied (déconnexion + version) | 3137-3143 | 1 |
| C1 | Sous-onglet Badges (`tab-profil-badges`) | 3144-3149 | 2 |
| | | | **160** |

**Sections injectées au runtime** (absentes du markup — `renderSettingsProfile`, app.js:17947) :

| # | Section | Ligne d'injection | Condition d'affichage |
|---|---|---|---|
| R1 | `settingsMenstrualSection` | app.js:18136 | `gender ∈ {F, female, femme}` |
| R2 | `settingsHealthConnect` | app.js:18177 | (inconditionnel) |
| R3 | `settingsWeightCut` | app.js:18208 | `goals` contient `'competition'` **OU** `weightCut.active` — cf. F19 |
| R4 | `settingsBarWeightSection` | app.js:18276 | (inconditionnel) |
| R5 | `settingsHybridSection` | app.js:18310 | (inconditionnel) |
| R6 | `settingsRGPDSection` | app.js:18334 | (inconditionnel) |
| R7 | `settingsMorphoSection` | app.js:18347 | `level !== 'debutant'` |

## 1b. Handlers inline — les 3 qui écrivent `db` directement (piège n°1)

```
index.html:2759  onchange="db.user.fatPct=parseFloat(this.value)||null;saveDB();…"
index.html:2876  onchange="db.user.uiDetail=this.value;saveDB();…"
index.html:2886  onchange="db.user.vocabLevel=parseInt(this.value)||2;saveDB();…"
```
Deux de plus dans le markup **généré** :
```
app.js:18259  onchange="db.user.takesCreatine=this.checked;saveDB();…"
app.js:18324  onchange="db.user.hybridAthlete=this.checked;saveDB();…"
```
Les 71 autres handlers appellent une fonction nommée.

## 1c. Producteurs de HTML (fonction → conteneur)

`renderCorpsTab` (app.js:16666, orchestrateur Corps) · `renderFormeScore` (16520) · `renderTrainingLoad` (16562) ·
`renderMuscleHeatmap` (9648) · `renderJointHealthSection` (joints.js:415) · `renderWeightTrend` (16620) ·
`renderBodyWeightChart` (16750) · `renderMacroHistory` (16584) · `generateCoachAlgoMessage` (via 16739) ·
`fillSettingsFields` (17583) · `renderSettingsProfile` (17947) · `renderInjuriesEditor` (17911) ·
`renderSettingsActivities` (17680) · `fillTargetSettings` (17859) · `renderKeyLiftsEditor` (10094) ·
`renderSettingsRoutineEditor` (3868) · `renderRecordsCorrectionList` (18880) · `renderGlossaryPage` (1236) ·
`renderTierSection` (17742) · `renderRGPDSection` (1614) · `renderStorageGauge` (supabase.js:4936) ·
`renderAppVersionLine` (4153) · `updateCloudUI` (supabase.js:1057) · `showProfilSub` (4189, aiguillage).

---

# PHASE 2 — 176 VERDICTS

**Légende** — ✅ CÂBLÉ · 🔴 DONNÉE MORTE · 🔴 CHAMP FANTÔME · 🔴 RENDU INATTEIGNABLE ·
⚠️ DIVERGENT · ⚠️ FALLBACK MASQUANT · ➖ COSMÉTIQUE (aucune donnée derrière) · ❓ NE SAIS PAS.

> Les chevrons `chev-*` et les corps d'accordéon `ca-*` / `acc-*` sont pilotés génériquement par
> `toggleAcc(id)` (app.js:17565) et `toggleCorpsAcc(id)` (app.js:16653), qui construisent `'chev-'+id`.
> Ils sont donc **atteints par construction** et non par référence littérale — c'est pourquoi un grep
> `getElementById('chev-ca-forme')` renvoie 0 sans que l'élément soit orphelin. Vérifié.

## A. Sous-onglet Corps (1-58)

| # | Élément (`index.html:L`) | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 1 | `tab-profil` 2610 | — | — | `showTab` 4255 | oui | ➖ conteneur | ✔ visible |
| 2 | `tab-corps` 2615 | — | — | `showProfilSub` 4193 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `formeScoreTag` 2619 | (dérivé logs) | `renderFormeScore` 16521 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 4 | `chev-ca-forme` 2620 | — | `toggleCorpsAcc` 16657 | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 5 | `ca-forme` 2622 | — | `toggleCorpsAcc` 16654 | — | oui (ouvert par défaut) | ✅ CÂBLÉ | ✔ visible |
| 6 | `formeScoreContent` 2622 | (dérivé) | `renderFormeScore` 16520 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `formeScoreTooltip` 2623 | — | handler inline 2619 | — | oui | ➖ COSMÉTIQUE | ✔ conditionnel |
| 8 | `chev-ca-load` 2638 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 9 | `ca-load` 2640 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 10 | `trainingLoadContent` 2640 | (dérivé TRIMP) | `renderTrainingLoad` 16562 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `chev-ca-heatmap` 2647 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 12 | `ca-heatmap` 2649 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 13 | `muscleHeatmapContent` 2649 | (dérivé logs) | `renderMuscleHeatmap` 9648 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `chev-ca-joints` 2656 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 15 | `ca-joints` 2658 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `jointHealthContent` 2658 | (dérivé) | `joints.js:415` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 17 | `chev-ca-poids` 2665 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 18 | `ca-poids` 2667 | — | `toggleCorpsAcc` | — | oui (ouvert par défaut) | ✅ CÂBLÉ | ✔ visible |
| 19 | `inputBodyWeight` 2670 | `db.body[].bw` + `db.user.bw` | `saveBodyEntry` import.js:1596-1604 | 54 réf. `user.bw` | oui | ✅ CÂBLÉ | ✔ visible |
| 20 | `weightTrendDisplay` 2673 | `db.body[].bw` | `renderWeightTrend` 16620 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 21 | `chartBodyWeight` 2674 | `db.body[].bw` | `renderBodyWeightChart` 16750 | — | oui (≥2 entrées) | ✅ CÂBLÉ | ✔ visible |
| 22 | `weightHistory` 2675 | `db.body[].bw` | `renderCorpsTab` 16730 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 23 | `chev-ca-nutri` 2684 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 24 | `ca-nutri` 2686 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `nutriCard` 2687 | — | — | — | oui | ➖ COSMÉTIQUE (id jamais référencé) | ✔ visible |
| 26 | `nutriRingFill` 2691 | via `calcCalorieCible` | `renderCorpsTab` 16704 | — | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |
| 27 | `nutriKcalRestantes` 2694 | via `calcCalorieCible` | 16707 | — | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |
| 28 | `nutriKcalSub` 2696 | via `calcCalorieCible` | 16707 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 29 | `nutriDayTypeLabel` 2699 | (dérivé routine) | 16715 | — | oui | ✅ CÂBLÉ (label informatif) | ✔ visible |
| 30 | `nutriMangees` 2701 | `db.body[].kcal` | 16708 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 31 | `nutriCible` 2702 | `calcCalorieCible(bw)` | 16708 | — | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |
| 32 | `nutriBrulees` 2703 | `calcTDEE`/24×h | 16708 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 33 | `nutriCarbLabel` 2705 | `calcMacrosCibles(cible)` | 16712 | — | oui | ⚠️ DIVERGENT (macros dérivées de F4) | ✔ visible |
| 34 | `nutriCarbBar` 2705 | idem | 16711 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 35 | `nutriProtLabel` 2706 | idem | 16712 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 36 | `nutriProtBar` 2706 | idem | 16711 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 37 | `nutriFatLabel` 2707 | idem | 16712 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 38 | `nutriFatBar` 2707 | idem | 16711 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 39 | `nutriTDEELabel` 2708 | **`calcTDEE(bw,tonnage7)`** | 16713 | — | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |
| 40 | `nutriProtCible` 2708 | `calcMacrosCibles` | 16713 | — | oui | ⚠️ DIVERGENT | ✔ visible |
| 41 | `inputProt` 2712 | `db.body[].prot` | `saveMacroEntry` import.js:1619-1620 | 16699 | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 42 | `inputCarb` 2712 | `db.body[].carb` | idem | 16699 | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 43 | `inputFat` 2712 | `db.body[].fat` | idem | 16699 | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 44 | `inputKcal` 2712 | `db.body[].kcal` | idem | 16699 | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 45 | `macroHistoryDisplay` 2715 | `db.body[]` | `renderMacroHistory` 16584 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 46 | `chev-ca-force` 2724 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 47 | `ca-force` 2726 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 48 | `bodyMetricsGrid` 2728 | — | — | — | oui | ➖ COSMÉTIQUE (id jamais référencé) | ✔ visible |
| 49 | `metricIPFCard` 2729 | — | 16717-16718 | `modeFeature('showIPF')` | selon mode | ✅ CÂBLÉ (`showIPF` réel, engine.js:315-435) | ✔ visible |
| 50 | `metricIPF` 2729 | `calcIPFGLTotal` | 16720 | — | modes SBD | ✅ CÂBLÉ | ✔ visible |
| 51 | `metricIPFsub` 2729 | seuils 300/400/500 | 16720 | — | modes SBD | ✅ CÂBLÉ | ✔ visible |
| 52 | `metricRatioCard` 2730 | — | 16723-16724 | `modeFeature('showBWRatio')` | selon mode | ✅ CÂBLÉ | ✔ visible |
| 53 | `metricRatio` 2730 | `ipf/bw` | 16726 | — | modes SBD | ✅ CÂBLÉ | ✔ visible |
| 54 | `metricRatioSub` 2730 | seuils 3/4 | 16726 | — | modes SBD | ✅ CÂBLÉ | ✔ visible |
| 55 | `plateauAlerts` 2732 | `detectPlateau` | 16733-16737 | `showPlateauDetection` | selon mode | ✅ CÂBLÉ | ✔ visible |
| 56 | `chev-ca-coach` 2741 | — | `toggleCorpsAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 57 | `ca-coach` 2743 | — | `toggleCorpsAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 58 | `coachAlgoContent` 2744 | `generateCoachAlgoMessage()` | 16739 | — | oui | ✅ CÂBLÉ | ✔ visible |

## B. Sous-onglet Réglages — Profil Athlète (59-99)

| # | Élément (`index.html:L`) | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 59 | `tab-settings` 2749 | — | — | `showProfilSub` 4193 | oui | ✅ CÂBLÉ | ✔ visible |
| 60 | `chev-acc-profil` 2754 | — | `toggleAcc` 17567 | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 61 | `acc-profil` 2756 | — | `toggleAcc` | — | oui (ouvert par défaut) | ✅ CÂBLÉ | ✔ visible |
| 62 | `inputName` 2757 | `db.user.name` | `updateProfile` 10792 · `saveProfileSettings` 10800 | 21 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 63 | `inputBW` 2758 | `db.user.bw` | `updateProfile` 10793 · 10801 | 54 réf. | oui | ⚠️ **incohérence de garde** — cf. F16 | ✔ visible |
| 64 | `inputFatPct` 2759 | `db.user.fatPct` | **onchange inline** 2759 | `calcTDEE` engine.js:1181 | oui | ⚠️ **bornes divergentes** — cf. F17 | ✔ visible |
| 65 | `settingsLevel` 2763 | `db.user.level` + `programParams.level` | `updateProfileField` 17826-17827 | 67 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 66 | `settingsHeight` 2775 | `db.user.height` | `updateProfileField` 17831 | `calcTDEE` Mifflin 1190 | oui | ✅ CÂBLÉ | ✔ visible |
| 67 | `settingsAge` 2783 | `db.user.age` | `updateProfileField` 17831 | `calcTDEE` Mifflin 1190 | oui | ✅ CÂBLÉ | ✔ visible |
| 68 | `settingsGender` 2790 | `db.user.gender` | `setSettingsGender` 18743 | 36 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 69 | `settingsTargetBW` 2801 | `db.user.targetBW` | `updateProfileField` 17831 | **17589 seul (re-remplit le champ)** | oui | 🔴 **DONNÉE MORTE** — cf. F13 | ✔ visible |
| 70 | `settingsTargetsBlock` 2807 | — | `fillTargetSettings` 17863 | `!db.user.skipPRs` | oui | ✅ CÂBLÉ | ✔ visible |
| 71 | `tgtUnitLabel` 2809 | `db.user.units` | `fillTargetSettings` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 72 | `tgtBench` 2812 | `db.user.targets.bench` | `updateTarget` 17850 | 19 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 73 | `tgtSquat` 2814 | `db.user.targets.squat` | `updateTarget` 17850 | 19 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 74 | `tgtDead` 2816 | `db.user.targets.deadlift` | `updateTarget` 17850 | 19 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 75 | `tgtPrHint` 2819 | `db.bestPR` | `fillTargetSettings` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 76 | `settingsCycleBlock` 2823 | — | `setSettingsGender` 18747 · `fillSettingsFields` 17594 | `gender==='female'` | femmes | ⚠️ **DIVERGENT** — cf. F6 | ✔ conditionnel |
| 77 | `settingsCycleEnabled` 2825 | `db.user.cycleTracking.enabled` | `toggleCycleTracking` 17887 | `getCyclePhaseModifier` 21464 | femmes | ⚠️ **DIVERGENT** — cf. F6 | ✔ conditionnel |
| 78 | `settingsCycleDetails` 2828 | — | 17889 / 17596 | — | femmes | ✅ CÂBLÉ | ✔ conditionnel |
| 79 | `settingsCycleLastDate` 2830 | `cycleTracking.lastPeriodDate` | `updateCycleField` 17896 | 21464, engine 1245/3290 | femmes | ⚠️ DIVERGENT — cf. F6 | ✔ conditionnel |
| 80 | `settingsCycleLength` 2834 | `cycleTracking.cycleLength` | `updateCycleField` 17896 | 21467, engine 1249/3291 | femmes | ⚠️ DIVERGENT — cf. F6 | ✔ conditionnel |
| 81 | `settingsInjuriesList` 2846 | `db.user.injuries[]` (objets) | `setInjuryLevel` 17933 | 27 réf. | oui | ⚠️ **DIVERGENT** — cf. F5 | ✔ visible |
| 82 | `settingsActivities` 2858 | `db.user.activities[]` | `addSettingsActivity` 17707 · `updateActivity` 17713 | 12 réf. | oui | ⚠️ **DIVERGENT** — cf. F7 | ✔ visible |
| 83 | `settingsTrainingMode` 2866 | `db.user.trainingMode` | `updateProfileField` 17829 | 61 réf., `getMode` engine.js:453 | oui | ✅ CÂBLÉ | ✔ visible |
| 84 | `settingsUIDetail` 2876 | `db.user.uiDetail` | **onchange inline** 2876 | `t()` app.js:12 · `shouldShow()` 59 | oui | ✅ CÂBLÉ | ✔ visible |
| 85 | `settingsVocabLevel` 2886 | `db.user.vocabLevel` | **onchange inline** 2886 | `getVocab` engine.js:38 + 5 sites | oui | ✅ CÂBLÉ | ✔ visible |
| 86 | `settingsGoals` 2895 | `programParams.goals[]` | `toggleSettingsGoal` | générateur | oui | ✅ CÂBLÉ | ✔ visible |
| 87 | `settingsFreq` 2900 | `programParams.freq` | `setSettingsFreq` 18795 | générateur, `calcTDEE` | oui | ✅ CÂBLÉ | ✔ visible |
| 88 | `settingsDays` 2905 | `programParams.selectedDays` | `toggleSettingsDay` | générateur | oui | ✅ CÂBLÉ | ✔ visible |
| 89 | `settingsMat` 2910 | `programParams.mat` | `setSettingsMat` | générateur | oui | ✅ CÂBLÉ | ✔ visible |
| 90 | `settingsDuration` 2915 | `programParams.duration` | `setSettingsDuration` 18818 | 6 sites, **précédés de `trainingDuration`** | oui | ⚠️ **FALLBACK/priorité** — cf. F12 | ✔ visible |
| 91 | `settingsSupersets` 2920 | `db.user.supersetPreference` | `setSupersetPref` 18822 | 5 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 92 | `settingsPrehabToggle` 2929 | `db.user.prehabEnabled` | `setPrehabEnabled` 18784 | 14567, 18074 | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 93 | `settingsPrehabSlider` 2930 | — | 18788 | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 94 | `settingsPrehabKnob` 2931 | — | 18789 | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 95 | `settingsProgramMode` 2937 | `programMode`, `coachProfile`, `coachingStyle` | `setProgramMode` 18600 · `setCoachProfile` 18676 · `setCoachingStyle` 18686 | 11 / 11 / 3 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 96 | `settingsInjuries` 2942 | `programParams.injuries[]` (chaînes) | `toggleSettingsInjury` 18868 | 7 réf. | oui | ⚠️ **DIVERGENT** — cf. F5 | ✔ visible |
| 97 | `settingsCardio` 2947 | `programParams.cardio` | `setSettingsCardio` 18819 | générateur | oui | ✅ CÂBLÉ | ✔ visible |
| 98 | `inputKcalBase` 2951 | `db.user.kcalBase` | `updateNutriTargets` 17553 · 10808 | **`calcCalorieCible` engine.js:1360 seul** | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |
| 99 | `inputBWBase` 2952 | `db.user.bwBase` | `updateNutriTargets` 17554 · 10809 | **`calcCalorieCible` engine.js:1361 seul** | oui | ⚠️ **DIVERGENT** — cf. F4 | ✔ visible |

## C. Réglages — autres accordéons (100-158)

| # | Élément (`index.html:L`) | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 100 | `chev-acc-keylifts` 2962 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 101 | `acc-keylifts` 2964 | — | `toggleAcc` + lazy 17576 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 102 | `keyLiftsEditor` 2966 | `db.keyLifts[]` | `saveKeyLifts` 10132-10135 | `renderPerfCard` | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 103 | `chev-acc-prog` 2975 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 104 | `acc-prog` 2977 | — | `toggleAcc` + lazy 17577 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 105 | `routineEditor` 2979 | `db.routine`, `db.routineExos` | `saveRoutine` 3981-3984 | `getRoutine` | oui | ⚠️ **hors sync** — cf. F11 | ✔ visible |
| 106 | `chev-acc-import` 2987 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 107 | `acc-import` 2989 | — | `toggleAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 108 | `hevyPaste` 2992 | `db.logs` | `processHevy` import.js | — | oui | ✅ CÂBLÉ | ✔ visible |
| 109 | `importSummary` 2994 | — | import.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 110 | `importDetails` 2994 | — | import.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 111 | `aiImportAnalysis` 2995 | — | import.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 112 | `csvFileInput` 3000 | — | `previewCSV(this)` (passe `this`) | — | oui | ✅ CÂBLÉ | ✔ visible |
| 113 | `csvPreview` 3001 | — | app.js | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 114 | `csvImportBtn` 3002 | — | app.js | — | oui | ✅ CÂBLÉ | ✔ visible |
| 115 | `csvProgress` 3003 | — | app.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 116 | `csvProgressBar` 3004 | — | app.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 117 | `csvProgressText` 3005 | — | app.js | — | oui | ✅ CÂBLÉ | ⊘ non testable |
| 118 | `chev-acc-cloud` 3015 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 119 | `acc-cloud` 3017 | — | `toggleAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 120 | `cloudStatus` 3018 | session Supabase | `updateCloudUI` supabase.js:1057 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 121 | `emailLoginSection` 3019 | — | supabase.js:1057 | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 122 | `authModeTabs` 3020 | — | — | — | oui | ➖ COSMÉTIQUE (id jamais référencé) | ✔ conditionnel |
| 123 | `authModeLogin` 3021 | — | `switchAuthMode` supabase.js | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 124 | `authModeSignup` 3022 | — | `switchAuthMode` | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 125 | `inputEmail` 3024 | (auth) | `authSubmit` supabase.js | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 126 | `inputPassword` 3025 | (auth) | `authSubmit` | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 127 | `inputPasswordConfirm` 3026 | (auth) | `switchAuthMode` / `authSubmit` | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 128 | `authSubmitBtn` 3027 | — | `switchAuthMode` | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 129 | `forgotPasswordBtn` 3029 | — | supabase.js | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 130 | `syncIndicator` 3031 | — | `updateSyncStatus` supabase.js:1059 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 131 | `lastSyncDisplay` 3032 | `db.lastSync` | supabase.js:1066 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 132 | `changePasswordSection` 3035 | — | supabase.js:1057 | `user.email` | connectés | ✅ CÂBLÉ | ✔ visible |
| 133 | `newPassword` 3037 | (auth) | `changePassword` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 134 | `newPasswordConfirm` 3038 | (auth) | `changePassword` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 135 | `chev-acc-backup` 3047 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 136 | `acc-backup` 3049 | — | `toggleAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 137 | `restoreFileInput` 3055 | — | `previewRestore(this)` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 138 | `restorePreview` 3056 | — | app.js | — | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 139 | `restoreBtn` 3057 | — | app.js | — | oui | ✅ CÂBLÉ | ✔ visible |
| 140 | `storageGauge` 3064 | localStorage | `renderStorageGauge` supabase.js:4936 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 141 | `chev-acc-records` 3069 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 142 | `acc-records` 3071 | — | `toggleAcc` + lazy 17575 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 143 | `recordsCorrectionList` 3073 | `exo.maxRM` (e1RM) + `db.bestPR` | `renderRecordsCorrectionList` 18880 | — | oui | ⚠️ **e1RM affiché** — cf. F14 | ✔ visible |
| 144 | `chev-acc-glossary` 3080 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 145 | `acc-glossary` 3082 | — | `toggleAcc` + lazy 17578 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 146 | `glossaryPageContent` 3084 | (statique) | `renderGlossaryPage` 1236 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 147 | `acc-tier-card` 3089 | — | — | — | oui | ➖ COSMÉTIQUE (id jamais référencé) | ✔ visible |
| 148 | `chev-acc-tier` 3091 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 149 | `acc-tier` 3093 | — | `toggleAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 150 | `tierWelcomeSection` 3094 | `db.user.tier`, `db.isFounder` | `renderTierSection` **app.js:17753** | — | oui | ⚠️ **DIVERGENT** — cf. F9 | ✔ visible |
| 151 | `tierBadgesSection` 3095 | idem | **app.js:17777** | — | oui | ⚠️ **DIVERGENT** — cf. F9 | ✔ visible |
| 152 | `themeSelector` 3097 | `localStorage.selectedTheme` | **app.js:17787** | — | oui | ⚠️ DIVERGENT — cf. F9 | ✔ visible |
| 153 | `chev-acc-notif` 3104 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 154 | `acc-notif` 3106 | — | `toggleAcc` (classe `open`) | **`style="display:none"` inline jamais retiré** | **NON** | 🔴 **RENDU INATTEIGNABLE** — cf. F3 | ✔ inatteignable |
| 155 | `push-status-label` 3109 | — | **aucun** (texte statique) | — | (dans #154) | 🔴 dans une section inatteignable ; jamais mis à jour | ✔ inatteignable |
| 156 | `chev-acc-danger` 3117 | — | `toggleAcc` | — | oui | ➖ COSMÉTIQUE | ✔ visible |
| 157 | `acc-danger` 3119 | — | `toggleAcc` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 158 | `appVersionLine` 3138 | version SW | `renderAppVersionLine` 4153 | — | oui | ✅ CÂBLÉ | ✔ visible |

## D. Sous-onglet Badges (159-160)

| # | Élément | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 159 | `tab-profil-badges` 3144 | — | `showProfilSub` 4200-4206 | — | **NON** | 🔴 **RENDU INATTEIGNABLE** — cf. F2 | ✔ inatteignable |
| 160 | `profil-badges-content` 3145 | copie de `tab-game.innerHTML` | 4205 | — | **NON** | 🔴 inatteignable (dans #159) | ✔ inatteignable |

## E. Sections injectées au runtime (161-176)

| # | Élément (`js/app.js:L`) | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 161 | `settingsMenstrualSection` 18136 | — | `renderSettingsProfile` | `gender ∈ {F,female,femme}` | femmes | ⚠️ **DIVERGENT** — cf. F6 | ✔ conditionnel |
| 162 | `menstrualStartDate` 18157 | `menstrualData.lastPeriodStart` | `saveMenstrualData` 18517 | `getCurrentMenstrualPhase` engine.js:3283 | femmes | ✅ CÂBLÉ | ✔ conditionnel |
| 163 | `menstrualCycleLength` 18162 | `menstrualData.cycleLength` | `saveMenstrualData` 18520 | engine.js:3284 | femmes | ✅ CÂBLÉ | ✔ conditionnel |
| 164 | `settingsHealthConnect` 18177 | `db.garminHealth` | `connectHealthConnect` | 23170, 29044 | oui | ❓ **NE SAIS PAS** — chaîne Garmin non auditée (hors zone) | ✔ visible |
| 165 | `settingsWeightCut` 18208 | `db.user.weightCut` | `toggleWeightCut` 18539 | 50 réf. | **NON — porte circulaire** | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE mon verdict statique** |
| 166 | `wc-start-weight` 18228 | `weightCut.startWeight` | `saveWeightCutData` 18560 | `calcWeightCutPenalty` | **NON** (dans #165) | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE** |
| 167 | `wc-target-weight` 18231 | `weightCut.targetWeight` | `saveWeightCutData` | idem | **NON** (dans #165) | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE** |
| 168 | `wc-current-weight` 18235 | `weightCut.currentWeight` | `saveWeightCutData` | idem | **NON** (dans #165) | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE** |
| 169 | `wc-competition-date` 18239 | `weightCut.competitionDate` | `saveWeightCutData` | Kill Switch compétition | **NON** (dans #165) | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE** |
| 170 | `toggle-creatine` 18258 | `db.user.takesCreatine` | **onchange inline** 18259 | `engine.js:4119` (−1 kg lissé) | **NON** (dans #165) | 🔴 **RENDU INATTEIGNABLE** — cf. F19 | ✘ **RÉFUTE** |
| 171 | `settingsBarWeightSection` 18276 | — | `renderSettingsProfile` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 172 | `settings-bar-weight` 18296 | `db.user.barWeight` | `saveBarWeight` | 6 réf. | oui | ✅ CÂBLÉ | ✔ visible |
| 173 | `settingsHybridSection` 18310 | — | `renderSettingsProfile` | — | oui | ✅ CÂBLÉ | ✔ visible |
| 174 | `toggle-hybrid` 18323 | `db.user.hybridAthlete` | **onchange inline** 18324 | `engine.js:132` (plafond ACWR) | oui | ✅ CÂBLÉ | ✔ conditionnel |
| 175 | `settingsRGPDSection` 18334 | `consentHealth`, `consentHealthDate` | `renderRGPDSection` 1614 | 1616-1618 | oui | ⚠️ **promesse non tenue** — cf. F15 | ✔ visible |
| 176 | `settingsMorphoSection` 18347 | `db.user.morpho` | `openMorphoSettings` 18377 | `MORPHO_SUBSTITUTIONS` / `JOINT_MORPHO_COEFFS` | `level!=='debutant'` | ⚠️ **DIVERGENT** — cf. F18 | ✔ visible |

**Total : 176 verdicts. = 176 éléments inventoriés en phase 1. ✅ Contrat respecté.**

---

# CONSTATS DÉTAILLÉS (F1-F18)

> Référencés depuis la table. Chacun est **vérifié par grep**, avec `fichier:ligne`.

### F1 — `showProfilSub('tab-profil-stats')` : sous-onglet inexistant, appelé 5 fois

**Vérifié.** `grep -c "tab-profil-stats" index.html` → **0**. L'id n'existe dans aucun markup.
5 sites de navigation y renvoient : `app.js:8233`, `8243`, `8245`, `8416`, `27731`
(tuiles Jeux « Vol. total », « Records », « Tonnage », cartes de progression, entrée « Records & corrections »).

Enchaînement dans `showProfilSub` (app.js:4189) :
```js
document.querySelectorAll('.profil-sub-section').forEach(el => el.classList.remove('active')); // 4191
const sec = document.getElementById(id);   // 4193 → null
if (sec) sec.classList.add('active');      // 4194 → ne s'exécute pas
_updateLastTab('profil', id);              // 4196 → 'tab-profil-stats' PERSISTÉ
```
CSS : `.profil-sub-section { display:none; }` / `.profil-sub-section.active { display:block; }` (index.html:91-92).
Aucune des 3 sous-sections n'a `active` → **les trois restent masquées**.

**Persistance** : `_updateLastTab` (app.js:679-685) écrit `localStorage.sbd_lastTab` **et** appelle
`debouncedCloudSync()`. Au boot, `_applyLastTabSub` (app.js:4349) rejoue `showProfilSub(lt.profil)` — après
`showTab(target)`, donc l'état se re-produit à chaque ouverture jusqu'à ce que l'utilisateur tape une pilule.

**Asymétrie relevée** : `tab-game` dispose d'une liste blanche de sous-onglets (`validSubs`, app.js:4250-4251)
qui absorbe une valeur invalide. `tab-profil` n'en a pas.

*Mécanique VÉRIFIÉE par lecture de code · effet à l'écran SUPPOSÉ (non reproduit en device).*

### F2 — `tab-profil-badges` : aucune pilule, aucun appelant

**Vérifié.** Recensement exhaustif des arguments passés à `showProfilSub` dans tout le dépôt :
`tab-settings` ×6 · `tab-profil-stats` ×5 · `tab-corps` ×5 · **`tab-profil-badges` ×0**.
La sous-nav (index.html:2611-2614) ne comporte que 2 pilules (Corps, Réglages).
La branche de rendu `app.js:4200-4206` (qui recopie `tab-game.innerHTML` dans `profil-badges-content`)
n'est donc jamais atteinte.

### F3 — `acc-notif` : accordéon Notifications Push non ouvrable

**Vérifié.** `index.html:3106` : `<div class="acc-body" id="acc-notif" style="display:none;">`.
C'est le **seul** corps d'accordéon de la zone avec un `display:none` **inline**.

`toggleAcc` (app.js:17565-17580) ne bascule que la **classe** `open` ; il ne touche jamais `style.display`.
Le CSS `.acc-body` / `.acc-body.open` (index.html:562-563) n'agit que sur `max-height` et `padding` —
**aucune règle `display`** (vérifié : `grep -E '\.acc-(body|card|header)[^{]*\{[^}]*display'` ne renvoie que
`.acc-header{display:flex…}`). Un `display:none` inline n'est donc jamais annulé.

`grep -rF "acc-notif" js/` → **0 occurrence**. Rien, nulle part, ne retire ce style.
→ Le bouton « 🔔 Activer les notifications push » et `push-status-label` sont **inaccessibles**.

### F4 — Deux chaînes caloriques concurrentes, affichées **dans la même carte**

**Vérifié.** `renderCorpsTab` (app.js:16666) calcule **les deux** :
```js
const baseTdee = calcTDEE(bw, tonnage7);      // 16671 — algorithme complet
const cible    = calcCalorieCible(bw);        // 16694 — règle de trois manuelle
const macros   = calcMacrosCibles(cible, bw); // 16696 — macros dérivées de `cible`
```
et les peint **côte à côte** dans la carte Nutrition :

| Élément affiché | Source |
|---|---|
| Anneau + « Restantes » (`nutriRingFill`, `nutriKcalRestantes`) | `calcCalorieCible` |
| Colonne « Objectif » (`nutriCible`, index.html:2702) | `calcCalorieCible` |
| Ligne « TDEE estimé » (`nutriTDEELabel`, index.html:2708) | **`calcTDEE`** |
| Les 3 barres de macros + « Prot cible » | `calcMacrosCibles(cible)` → donc `calcCalorieCible` |

`calcCalorieCible` (engine.js:1359-1364) :
```js
const kcalBase = db.user.kcalBase || 2300;
const bwBase   = db.user.bwBase   || 98;   // ⚠️ 98 ici…
return Math.round(kcalBase * (bw / bwBase));
```
Elle n'utilise ni l'âge, ni la taille, ni `fatPct`, ni le TRIMP, ni `goal` — contrairement à `calcTDEE`
(engine.js:1144). Ses seuls consommateurs sont `app.js:16468`, `16596`, `16694` (tous dans Corps).

**Défauts divergents** pour la même donnée : `bwBase` vaut **80** dans `defaultDB` (app.js:84) et dans
`fillSettingsFields` (app.js:17586), mais **98** dans `calcCalorieCible` (engine.js:1361).

*Précision vs v1* : la v1 décrivait « Corps vs Coach ». C'est plus resserré que ça — les deux chiffres
sont **dans la même carte, à quelques pixels l'un de l'autre**. Recoupe le fix #2 du scope de lancement
(CLAUDE.md §17), toujours ouvert.

### F5 — Deux UI « blessures » indépendantes, dans le même accordéon

**Vérifié.** Toutes deux dans `acc-profil` :

| | UI n°1 | UI n°2 |
|---|---|---|
| Élément | `settingsInjuriesList` (index.html:2846) | `settingsInjuries` (index.html:2942) |
| Rendu par | `renderInjuriesEditor` (app.js:17911) | `renderSettingsProfile` (app.js:18032) |
| Écrit | `db.user.injuries` = `[{zone, level, active, since}]` | `db.user.programParams.injuries` = `['epaules', …]` |
| Via | `setInjuryLevel` (app.js:17933) | `toggleSettingsInjury` (app.js:18862) |
| Granularité | 4 niveaux (0/1/2/3) | binaire |
| Zones | 7 : genou, epaule, dos, hanche, poignet, **coude**, nuque (app.js:17901-17909) | 6 : Épaules, Genoux, Dos, Poignets, Nuque, Hanches (app.js:18034) — **pas de coude** |
| Consommateurs | 27 réf. (substitutions, prehab, return-to-play, `wpComputeWorkWeight`) | 7 réf. (générateurs, `engine.js:1929`) |

**Aucun pont entre les deux** (grep : aucune écriture croisée). Régler « Genoux → Niveau 2 » dans l'une
n'allume pas « Genoux » dans l'autre, et réciproquement.

**Pollution de type** — `_adjustPrimaryInjury` (app.js:1003-1009), déclenché **hors onglet Profil** :
```js
if (!db.user.injuries) db.user.injuries = [];
if (db.user.injuries.indexOf(exoName) === -1) db.user.injuries.push(exoName);  // 15008
```
Il pousse un **nom d'exercice** (chaîne) dans un tableau qui contient partout ailleurs des objets.
Les consommateurs lisent `i.zone` / `i.active` → `undefined`. `renderInjuriesEditor` filtre sur
`if (inj && inj.zone)` (app.js:17915) → l'entrée est ignorée. La migration du boot
(app.js:216-219) la convertit ensuite en `{zone: '<nom d'exercice>', level:1, active:true}` —
une zone qui ne correspond à aucune clé de `INJURY_ZONES`. Le toast affiché est
« 🩹 Blessure notée. Le Coach adapte ta prochaine séance. » (app.js:15005).
*Écriture hors zone Profil, signalée ici parce qu'elle alimente un store que le Profil affiche.*

### F6 — Deux UI « cycle menstruel », deux stores, deux jeux de consommateurs

**Vérifié.**

| | UI n°1 — « 🌙 Optimisation hormonale » | UI n°2 — « 🌸 Suivi cycle menstruel » |
|---|---|---|
| Élément | `settingsCycleBlock` (index.html:2823) — **markup** | `settingsMenstrualSection` (app.js:18136) — **injecté** |
| Écrit | `db.user.cycleTracking.{enabled,lastPeriodDate,cycleLength}` | `db.user.menstrualEnabled` + `db.user.menstrualData.{lastPeriodStart,cycleLength}` |
| Via | `toggleCycleTracking` 17885 · `updateCycleField` 17894 | `toggleMenstrualTracking` 18500 · `saveMenstrualData` 18512 |
| Consommateurs | `getCyclePhaseModifier` app.js:21464 (modificateur SRS) · `getCyclePhase` engine.js:1244 · **repli de date** engine.js:3289 | `getCycleCoeff` engine.js:3310 · `getMRVWithCycleAdjust` 3319 · `getRestWithCycleAdjust` 3328 |

Le point exact : les trois fonctions qui portent l'ajustement **volume / MRV / repos** commencent toutes par
```js
if (!db.user || !db.user.menstrualEnabled) return 1.0;   // engine.js:3310 (idem 3319, 3328)
```
et **`menstrualEnabled` n'est écrit que par `toggleMenstrualTracking` (app.js:18502)** — jamais par l'UI n°1
(vérifié : les seules écritures de `menstrualEnabled` sont app.js:202 (migration) et 18502).

`getCurrentMenstrualPhase` (engine.js:3277-3292) **fait** le pont pour la *date* : à défaut de
`menstrualData`, il lit `cycleTracking.lastPeriodDate`. Mais ce pont n'est atteint que si
`menstrualEnabled` est déjà vrai.

→ Activer « 🌙 Optimisation hormonale » (UI n°1) alimente le modificateur SRS, **pas** les coefficients
volume/MRV/repos. Le toast affiché est « 🌙 Cycle activé » (app.js:17891).
*Effet partiel, pas nul — la distinction est importante.*

**Note annexe** : `getCyclePhase` (engine.js:1244) a **0 appelant** (grep exhaustif).

### F7 — Trois stores d'activités secondaires

**Vérifié.**

| Store | Écrit par | Consommateurs |
|---|---|---|
| `db.user.activities` | **l'UI Réglages** : `addSettingsActivity` 17707, `updateActivity` 17713, `removeActivity` 17726 | 12 réf. (engine.js:1840/4474/4484/4879/4896, coach.js:696, app.js:17654/24268) |
| `db.user.activityTemplate` | **une seule migration** : `migrateActivityData` (app.js:15251), gardée par `db.user._activityMigrated` (15228) | 13 réf. (app.js:13035/19539/19554/20100/25328/32485/32525/32554/32588, engine.js:4370/4458) |
| `db.user.secondaryActivities` | onboarding seul (app.js:2738, 2948) | `calcTDEE` **branche Katch-McArdle** (engine.js:1182), app.js:2528/15230 |

`migrateActivityData` s'exécute une fois au boot (appelée app.js:15389) puis pose `_activityMigrated = true`.
Après ce passage, **toute activité ajoutée ou retirée dans les Réglages n'atteint plus `activityTemplate`**
(un seul site absorbe les deux : `engine.js:4458`, `activityTemplate || activities`).

Et la branche calorique Katch-McArdle lit `secondaryActivities` (engine.js:1182), que l'UI Réglages
n'écrit jamais :
```js
var weeklyActivities = db.user && db.user.secondaryActivities;   // engine.js:1182
weeklyActivities.forEach(function(a) { weeklyTRIMP += calcActivityTRIMP(a); });
```
CLAUDE.md §13 désigne `activityTemplate` comme le store canonique du Template.

### F8 — `db.user.plan` vs `db.user.tier` : deux champs pour le statut premium

**Vérifié.** Recensement exhaustif de `user.plan` : `app.js:268` (migration), `engine.js:5705`, `engine.js:5841`.
```js
if (!p.user.plan) p.user.plan = 'free';   // app.js:268 — seule écriture locale
```
`canUseAI()` (engine.js:5704-5731) décide du gate IA **sur `plan`** (`'beta'` / `'premium'` → illimité,
sinon quota 1/semaine). Aucun code local ne pose jamais `plan = 'premium'`.

`db.user.tier` est le champ alimenté par le serveur — `fetchAndStoreTier` (index.html:4080) :
`db.user.tier = data.tier` depuis `profiles.tier` — et lu par `renderTierSection` (app.js:17747) et
index.html:4013.

Le commentaire app.js:267 (« NE PAS écraser un plan 'beta' déjà en base (4 users actuels avec
betaExpiresAt:null) ») indique que `plan` est censé arriver **par le blob cloud**, pas par le code local.
`betaExpiresAt` est dans le même cas : lu (engine.js:5706), jamais écrit localement.
*Constat factuel : deux champs, deux origines, un seul consulté par le gate.*
**Question Supabase en fin de rapport.**

### F9 — `renderTierSection` défini deux fois ; la version `index.html` est morte

**Vérifié.** Deux définitions du même nom global :
- `js/app.js:17742` — Founder / Early Adopter / Membre + 3 thèmes (liste en dur)
- `index.html:4012` — `tier-welcome-card` + badges de réussite (`getAchievementBadges`) + `APP_THEMES`

Ordre d'exécution : les blocs `<script>` de index.html:3465 et 3490 sont **inline synchrones**
(vérifié : ni `defer` ni `async`) → ils s'exécutent au parsing. `js/app.js` est chargé en
`<script defer>` (index.html:3464) → il s'exécute **après** le parsing.
→ **la définition de `app.js` écrase celle de `index.html`.**

Conséquence : `getWelcomeMessage`, `getAchievementBadges`, `renderAchievementBadges` (définies dans le bloc
inline) n'ont plus qu'un seul appelant — la fonction morte. La sous-section « Badges » de
Statut & Thèmes n'est jamais rendue. La version affichée est celle d'app.js, cohérente en elle-même.

### F10 — `db.lastModified` : champ fantôme **à l'intérieur du hash de sync**

**Vérifié.** Recensement exhaustif de `lastModified` dans les sources vivantes
(hors `js/supabase.min.js`, orphelin) : **une seule occurrence**, une lecture —
```js
d.lastModified || 0        // js/supabase.js:311, dernier terme de _computeDataHash
```
Rien ne l'écrit nulle part. Le champ contribue donc une **constante `0`** à la signature.
Le champ réellement horodaté par `_flushDB` est `db.updatedAt` (app.js:374), qui n'est **pas** signé.

### F11 — Écritures du Profil absentes de la signature de sync

**Vérifié.** `_computeDataHash` (supabase.js:261-312) signe exactement 14 termes :
`logs.length`, `logs[0].timestamp`, `max(editedAt)`, `Object.keys(exercises).length`, `xpHighWaterMark`,
`Object.keys(earnedBadges).length`, `activityLogs.length`, `readiness.length`, `readinessHistory.length`,
`readinessHistory[last].ts`, `_sig(user)`, `_sig(weeklyPlan)`, `_sig(bestPR)`, `lastModified` (→ cf. F10).

`syncToCloud` court-circuite sur signature inchangée :
```js
var _hash = _computeDataHash(db);
if (db._lastSyncHash === _hash) { updateSyncStatus('sync'); return; }   // supabase.js:499-501
```
Or le blob poussé, lui, est **db entier moins `logs`** (`_buildSyncedBlob`, supabase.js:318-322) —
`db.body`, `db.keyLifts`, `db.routine` en font partie. Ils sont donc **transportés** mais **non signés** :

| Écriture du Profil | Store touché | Signé ? |
|---|---|---|
| Poids du jour (`saveBodyEntry`, import.js:1596) | `db.body` **+ `db.user.bw`** (1604) | ✅ oui, via `_sig(d.user)` |
| Macros (`saveMacroEntry`, import.js:1610) | `db.body` **seul** | ❌ **non** |
| Exercices Clés (`saveKeyLifts`, app.js:10125) | `db.keyLifts` | ❌ **non** |
| Mon Programme (`saveRoutine`, app.js:3972) | `db.routine`, `db.routineExos` | ❌ **non** |
| Tous les champs `db.user.*` des Réglages | `db.user` | ✅ oui |
| Correction des Records | `db.bestPR` | ✅ oui |
| Sous-onglet mémorisé (`_updateLastTab`, app.js:679) | `db.gamification.lastTab` | ❌ **non** |

Pour les lignes ❌, `debouncedCloudSync()` est bien appelé mais `syncToCloud` sort sur signature
identique — sauf si une autre modification (signée) survient et emporte le blob avec elle.
`_applyCloudBlob` (supabase.js:336-337) adopte le cloud en **écrasement** (`db = cloudBlob`).

*Même classe que le défaut corrigé en PR #245 (`_computeDataHash` signait la longueur, pas le contenu),
sur d'autres champs. Mécanique VÉRIFIÉE · perte effective SUPPOSÉE (non reproduite).*

### F12 — `trainingDuration` : champ fantôme prioritaire (confirme la v1)

**Vérifié.** `grep -rnE "trainingDuration\s*="` sur `js/` + `index.html` → **0 écriture**.
6 lectures, toutes **en tête** d'une chaîne de repli :
`app.js:11443`, `25221`, `25265`, `26067`, `27133`, `27342`.
```js
(db.user && db.user.trainingDuration) || params.duration || 90
```
`app.js:27342` lit `trainingDuration || programParams.duration` ; les 5 autres lisent
`trainingDuration || params.duration` (paramètre de fonction). Deux chaînes de repli distinctes.

L'UI Réglages « Durée » (`settingsDuration`, index.html:2915) affiche et écrit `programParams.duration`
(app.js:18021-18029, `setSettingsDuration` 18818) — soit le **second** terme. Tant que le fantôme est vide,
les deux coïncident ; une valeur qui y atterrirait (import, blob cloud ancien) primerait sur les 6 sites
sans que l'UI ne le reflète.

### F13 — `targetBW` : donnée morte

**Vérifié.** 4 occurrences en tout : `app.js:84` (défaut `null`), `app.js:168` (backfill),
`app.js:17831` (écriture via `updateProfileField`, branche `db.user[field] = value`),
`app.js:17589` (`tBwEl.value = db.user.targetBW || ''` — re-remplissage du champ de saisie).
Aucun calcul, aucune décision, aucun affichage ne le consomme.

### F14 — La section « Correction des Records » affiche des e1RM

**Vérifié.** `renderRecordsCorrectionList` (app.js:18880-18940) construit sa liste à partir de
`exo.maxRM` — l'e1RM Brzycki (CLAUDE.md §11 : `maxRM(=e1RM Brzycki)`) — et l'affiche tel quel :
```js
<div …>e1RM: <strong …>${Math.round(r.maxRM)}kg</strong> — ${r.date}…
```
Les records SBD y sont **mélangés** : `db.bestPR[t]` (vraies barres) est injecté dans le même `exoMap`
(app.js:18902-18908) puis rendu sous le **même libellé « e1RM: »**. Un PR réel de 145 kg s'affiche
donc « e1RM: 145kg », à côté d'e1RM calculés.
CLAUDE.md §7 : « e1RM = indicateur / tendance, JAMAIS un record. Ne l'affiche **jamais** comme un chiffre
à l'utilisateur. »
**[VOULU ?]** — la section sert précisément à repérer un import aberrant ; montrer l'e1RM y est peut-être
délibéré, et le libellé est honnête. Constat posé, pas tranché.

### F15 — Révocation du consentement santé : promesse non tenue (confirme la v1)

**Vérifié.** `revokeHealthConsent` (app.js:1591) affiche (app.js:1601) :
> « Retirer ton consentement désactivera les modules HRV, FC repos et suivi menstruel. »

Aucun des trois ne teste `consentHealth` :
- suivi menstruel → `db.user.menstrualEnabled` (app.js:18142, engine.js:3310)
- FC repos / HRV → `db.garminHealth` (app.js:23170, 29044)
- `grep consentHealth` dans ces modules → **0 résultat**

Consommateurs réels de `consentHealth` : `checkRequiredConsents` (1549), garde de génération (3088),
`exportUserData` (1938), affichage RGPD (1616). La révocation change l'affichage de la section et
re-déclenche la modale au `postLoginSync` suivant — rien d'autre.

**Ajout v2 — asymétrie d'export.** Deux exports coexistent :

| Fonction | Contenu | Où |
|---|---|---|
| `exportData` (app.js:1257) | `JSON.stringify(db)` — **tout** | Réglages → Sauvegarde |
| `exportUserData` (app.js:1923) | liste blanche | section RGPD (bouton « 📥 Exporter mes données », app.js:1637) |

La liste blanche de `exportUserData` (app.js:1925-1947) contient : name, height, age, gender, level,
trainingMode, goal, onboardingDate, consentHealth, consentHealthDate, logs, exercises, bestPR, body,
reports, rhrHistory, weeklyLogs.
Elle **omet** : `injuries`, `menstrualEnabled` / `menstrualData`, `cycleTracking`, `weightCut`, `fatPct`,
`bw`, `targetBW`, `medicalConsent` / `medicalConsentDate`, `activityLogs`, `readinessHistory`
(sommeil / énergie / courbatures / douleur).
*C'est l'export estampillé RGPD qui est le plus étroit ; l'export complet est sous « Sauvegarde ».*

**Ajout v2 — `medicalConsentDate`.** Écrit 2 fois (app.js:3026, 3713), **lu 0 fois**.
`consentHealthDate` est affiché (app.js:1617-1618) ; son équivalent médical, jamais.

### F16 — `updateProfile()` : le poids de corps peut tomber à 0

**Vérifié.** Deux chemins écrivent `db.user.bw` depuis les mêmes deux champs, avec des gardes opposées :
```js
function updateProfile() {                        // app.js:10789, onchange de inputName ET inputBW
  const bw = parseFloat(document.getElementById('inputBW').value) || 0;
  db.user.bw = bw;                                // 10793 — pas de garde
}
function saveProfileSettings() {                  // app.js:10796, bouton « 💾 Sauvegarder »
  if (bw > 0) db.user.bw = bw;                    // 10801 — gardé
}
```
Vider le champ Poids déclenche `onchange` → `db.user.bw = 0`. `getUserBW` (app.js:6476) retombe alors
sur `BW_FALLBACK_KG = 80`. 54 sites lisent `user.bw`.

### F17 — `fatPct` : bornes UI et bornes moteur divergentes

**Vérifié.** L'input accepte `min="3" max="60"` (index.html:2759). `calcTDEE` n'emprunte la branche
Katch-McArdle que si `fatPct > 0 && fatPct < 50` (engine.js:1181). Une saisie entre 50 et 60 est acceptée,
stockée, ré-affichée — et **silencieusement ignorée** : le calcul retombe sur Mifflin-St Jeor.

*Le reste de la chaîne `fatPct` est correct — la v1 avait déjà réfuté le soupçon initial : l'écriture
existe bien, en `onchange` inline (index.html:2759), invisible si l'on cherche une fonction nommée.*

### F18 — `morpho` : une clé sur quatre partiellement orpheline (confirme la v1)

**Vérifié.** `obSaveQ4` (app.js:2812-2817) collecte : `long_femurs`, `short_arms_long_torso`,
`long_arms`, `short_torso`.

| Table | Clés attendues | Correspondance |
|---|---|---|
| `MORPHO_SUBSTITUTIONS` engine.js:3424 | les 4 | ✅ complètes |
| `JOINT_MORPHO_COEFFS` engine.js:3412 | `long_femurs`, `long_arms`, `short_torso`, **`long_torso`** | ⚠️ `long_torso` jamais collecté ; `short_arms_long_torso` absent |

- `long_femurs`, `long_arms`, `short_torso` → consommées par **les deux** tables
- `short_arms_long_torso` → substitutions ✅, charge articulaire ❌
- `long_torso` (coefficient hanches ×1.1) → 🔴 **RENDU INATTEIGNABLE** : aucune UI ne produit cette clé

### F19 — Weight Cut : la section n'est ouvrable que si elle est déjà ouverte (constat produit par l'exécution)

**Ce constat n'existe dans aucune version statique de cet audit.** Les phases 1-4 avaient classé
`settingsWeightCut` « inconditionnel » — c'est **faux**, et seule l'exécution l'a montré : la section
est **absente du DOM** dans les 3 profils de base.

Condition réelle (app.js:18202-18203) :
```js
var _showWC = (db.user.programParams && (db.user.programParams.goals || []).includes('competition'))
  || (db.user.weightCut && db.user.weightCut.active);
```
Les deux branches sont vérifiées, par grep exhaustif :

1. **`goals` ne peut pas contenir `'competition'`.** Les ids d'objectifs producibles sont les mêmes 6
   partout — `obGoals` de l'onboarding (`force, masse, seche, recompo, maintien, reprise`) et le groupe
   de boutons des Réglages (app.js:17972-17979, mêmes 6). `'competition'` n'apparaît que dans la table
   de compatibilité `_GOAL_INCOMPATIBLE` (app.js:18698-18700), **jamais comme option sélectionnable**.
2. **`weightCut.active` n'est posé que par `toggleWeightCut`** (app.js:18547), dont l'unique site
   d'invocation est le bouton `onclick="toggleWeightCut()"` **à l'intérieur de la section** (app.js:18219).

→ Porte circulaire : la section n'apparaît que si le weight cut est déjà actif, et il ne peut être
activé que depuis la section.

**Vérifié à l'exécution, dans les deux sens** :

| État semé | `settingsWeightCut` | Champs `wc-*` |
|---|---|---|
| profils de base (aurel_like, vierge, debutant) | **absent du DOM** | absents |
| `weightCut.active = true` | VISIBLE 322×432 | VISIBLE, et l'aller-retour passe (`wc-current-weight` 98 → 96.2, survit au reload) |
| `goals = ['competition']` | VISIBLE 322×83 (le bouton d'activation seul) | absents tant que `active` est faux |

La section **fonctionne** une fois déverrouillée — c'est sa porte d'entrée qui est absente.

**Portée** : `db.user.weightCut` compte **50 références** dans le code (Weight Cut LPF, blocage APRE,
Kill Switch compétition — CLAUDE.md §8, points 6, 10 et 11). `db.user.takesCreatine` (consommé par
`engine.js:4119`) n'a lui aussi d'interface que dans cette section.

**Réserve explicite** : `weightCut` fait partie du blob synchronisé (`_buildSyncedBlob` copie tout `db`
sauf `logs`) — une valeur posée hors application (blob cloud, intervention en base) déverrouillerait la
section. Ce que j'affirme est borné à ceci : **aucun parcours de l'interface ne permet de l'ouvrir.**
---

# PHASE 3 — CROISEMENT INVERSE (données → UI)

**Univers énuméré mécaniquement** : `defaultDB().user` (**42** champs, app.js:84) ∪ les champs
rétro-ajoutés par le backfill de `loadDB` (app.js:108-372) → **union de 58 champs `db.user`**,
plus **25 clés de premier niveau** dans `defaultDB()` et **34** ajoutées par backfill.

## A. `db.user` — champs sans écriture métier (fantômes, ou alimentés hors code local)

| Champ | Écritures | Lectures | Constat |
|---|---|---|---|
| `plannedTestDate` | **aucune** | app.js:11784-11785 | 🔴 CHAMP FANTÔME + ⚠️ FALLBACK MASQUANT : `: new Date(Date.now() + 35*86400000)` → la « date de test prévue » affichée est toujours **aujourd'hui + 35 jours** |
| `nutritionStrategyStartDate` | migration seule (`= null`) | engine.js:1997-1998 (`getNutritionStrategyAdvice`, appelée app.js:20684) | 🔴 CHAMP FANTÔME + ⚠️ FALLBACK : `weeksOnStrategy` vaut toujours **0** |
| `plan` | migration seule (`'free'`) | `canUseAI` engine.js:5705, 5841 | ⚠️ DIVERGENT — cf. F8 (alimenté par le blob cloud, pas par le code) |
| `betaExpiresAt` | **aucune** | `canUseAI` engine.js:5706 | idem F8 |
| `streak` | **aucune** | index.html:4039 seulement | 🔴 CHAMP FANTÔME, dans la fonction morte de F9 |
| `trainingDuration` | **aucune** | 6 sites prioritaires | 🔴 CHAMP FANTÔME — cf. F12 |
| `tdee` | **aucune** | app.js:15873, 16468 (`db.user.tdee \|\| …`) | 🔴 CHAMP FANTÔME (inoffensif : retombe sur le calcul) |
| `skipRPE` | **aucune** | app.js:222 = `delete p.user.skipRPE` | ➖ nettoyage assumé et documenté (v337) — **pas** un fantôme |

## B. `db.user` — champs écrits, jamais lus

| Champ | Écrit par | Constat |
|---|---|---|
| `coachEnabled` | `defaultDB` 84 + backfill 199 | 🔴 DONNÉE MORTE — 2 occurrences en tout, **0 lecture** |
| `navMode` | backfill 236 (`= 'A'`) | 🔴 DONNÉE MORTE — 0 lecture ; le mode est figé en dur |
| `medicalConsentDate` | app.js:3026, 3713 | 🔴 DONNÉE MORTE — cf. F15 |
| `_swipeResults` | app.js:11988 | 🔴 DONNÉE MORTE — 0 lecture (`_swipeCompleted` et `_swipeSeedExercises`, eux, sont lus) |
| `targetBW` | `updateProfileField` 17831 | 🔴 DONNÉE MORTE — cf. F13 |
| `sportsConfig` | backfill 248-252 | ❓ NE SAIS PAS : 1 lecture, dans son propre backfill. À confirmer hors zone. |

## C. `db.user` — champs subis, sans aucune UI de consultation ni de correction

| Champ | Origine | Lectures | Remarque |
|---|---|---|---|
| `_realLevel` | validation de niveau | 6 | niveau « réel » inféré, invisible et non corrigeable |
| `obProfile` | `_deriveObProfile` | 5 | archétype dérivé de l'onboarding |
| `coachProfile` | `setCoachProfile` 18676 | 11 | ✅ éditable (`settingsProgramMode`, #95) |
| `coachingStyle` | `setCoachingStyle` 18686 | 3 | ✅ éditable (#95) |
| `programMode` | `setProgramMode` 18600 | 11 | ✅ éditable (#95) |
| `lpActive` / `lpStrikes` | moteur LP 3-Strikes | 3 / 19 | l'état LP n'est jamais montré |
| `volumeDeltas` | moteur | 9 | — |
| `tdeeAdjustment` | engine.js:1234, 1238, app.js:19907 | 5 | ajustement calorique appris, non consultable |
| `onboardingDate` / `onboardingVersion` | onboarding | 10 / 5 | — |
| `ownerUid` | `_stampOwner` (RC4) | 10 | technique, normal |
| `secondaryActivities` | onboarding seul | 4 | cf. F7 — alimente la branche Katch-McArdle |
| `activityTemplate` | migration unique | 16 | cf. F7 |
| `_swipeCompleted` / `_swipeSeedExercises` | swipe post-onboarding | 2 / 3 | — |
| `aiCreditsWeek` / `aiCreditsWeekStart` | `canUseAI` engine.js:5720-5721 | 3 / 3 | quota IA, non consultable |
| `lpBridgeActive` / `lpBridgeWeek` | app.js:23506-23523 | 3 / 2 | — |
| `morpho` | `openMorphoSettings` 18377 | 9 | ✅ éditable (#176) — cf. F18 |

## D. Clés de premier niveau de `db` — UI dans le Profil ?

| Clé | Voir | Modifier | Consommateurs |
|---|---|---|---|
| `body` | ✅ (Corps : historique + graphe) | ✅ (poids, macros) | 12+ · cf. F11 pour la sync |
| `bestPR` | ✅ (Correction des Records) | ✅ | nombreux |
| `keyLifts` | ✅ (Exercices Clés) | ✅ | `renderPerfCard` · cf. F11 |
| `routine` / `routineExos` | ✅ (Mon Programme) | ✅ | `getRoutine` · cf. F11 |
| `logs` | ✅ (Import, Sauvegarde) | partiel | nombreux |
| **`exercises`** | ❌ | ❌ | **registres e1RM DUP — pilotent les charges prescrites, ni consultables ni corrigeables.** Seul `bestPR` a une UI. |
| `gamification` (hors badges) | ❌ | ❌ | XP, `lastTab`, high-water mark |
| `garminHealth` | partiel (#164) | partiel | HRV / FC repos |
| `weeklyPlan` / `weeklyPlanHistory` / `generatedProgram` | ❌ | ❌ | générateur |
| `reports` | ❌ | ❌ | rapports hebdo |
| `social` / `friends` / `friendCode` | ❌ (onglet Social) | ❌ | hors zone |
| `notificationsSent`, `questHistory`, `seenBadges`, `unlockedTitles`, `activeTitle`, `smartStreak`, `rhrHistory`, `challenges`, `customProgramTemplate`, `customProgramBackups`, `weeklyActivities`, `activityLogs`, `readiness`, `readinessHistory`, `earnedBadges` | ❌ | ❌ | divers |
| flags `_`-préfixés (`_obSeqTunnel`, `_ghostLogAnswered`, `_magicStartDone`, `_cloudUpdatedAt`, `_badgesMigrated`, `_activityMigrated`…) | ❌ | ❌ | techniques, normal |

---

# PHASE 4 — SYNTHÈSE ET PIÈGES

## Décompte des verdicts (176)

Décompte extrait mécaniquement des tables ci-dessus (verdict le plus fort retenu par ligne) :

| Verdict | Nombre | Détail |
|---|---|---|
| ✅ CÂBLÉ | **100** | |
| ⚠️ DIVERGENT / FALLBACK MASQUANT | **37** | |
| ➖ COSMÉTIQUE | **27** | chevrons, conteneurs de mise en page, ids jamais référencés |
| 🔴 RENDU INATTEIGNABLE | **10** | #154-155 (Notifications Push) · #159-160 (Badges) · **#165-170 (Weight Cut — F19, découvert en phase 5)** |
| 🔴 DONNÉE MORTE | **1** | #69 `settingsTargetBW` — *+ 5 autres hors table, en phase 3B* |
| ❓ NE SAIS PAS | **1** | #164 `settingsHealthConnect` |
| **Total** | **176** | = 176 éléments inventoriés ✅ |

Colonne Runtime, sur les mêmes 176 lignes :

| Statut | Nombre |
|---|---|
| ✔ visible au repos | 138 |
| ✔ conditionnel (révélé par l'action ou le profil) | 22 |
| ✔ inatteignable (confirmé après exécution de l'action) | 4 |
| ✘ **RÉFUTE le verdict statique** (les 6 lignes Weight Cut) | 6 |
| ⊘ non testable (raison donnée) | 6 |
| **Total** | **176** |

*Le décompte des verdicts ci-dessus intègre déjà les corrections de la phase 5 : 6 lignes sont passées
de ✅ CÂBLÉ à 🔴 RENDU INATTEIGNABLE (F19).*

Les champs 🔴 qui n'ont **pas** d'élément d'interface (donc absents de la table phase 2) sont recensés
en phase 3 : `coachEnabled`, `navMode`, `medicalConsentDate`, `_swipeResults` (données mortes) ·
`plannedTestDate`, `nutritionStrategyStartDate`, `streak`, `trainingDuration`, `tdee` (champs fantômes) ·
`db.lastModified` (fantôme, clé de premier niveau — F10).

## Les 6 pièges annoncés — recherchés activement

| # | Piège | Trouvé ? |
|---|---|---|
| 1 | **Écritures inline** | ✅ **5** : `fatPct` (index.html:2759), `uiDetail` (2876), `vocabLevel` (2886), `takesCreatine` (app.js:18259), `hybridAthlete` (app.js:18324) |
| 2 | **Fallbacks masquants** | ✅ `plannedTestDate` (→ +35 j), `nutritionStrategyStartDate` (→ 0 semaine), `lastModified` (→ 0 dans le hash), `bwBase \|\| 98` vs défaut 80, `getUserBW` (→ 80 kg), `plan \|\| 'free'`, les 13 `activityTemplate \|\| []` |
| 3 | **Rendus conditionnels jamais satisfaits** | ✅ `acc-notif` (F3), `tab-profil-badges` (F2), `long_torso` (F18) |
| 4 | **Doubles chemins** | ✅ **5** : blessures (F5), cycle (F6), activités ×3 (F7), `plan`/`tier` (F8), caloriques (F4) |
| 5 | **Priorité `A \|\| B` avec A fantôme** | ✅ `trainingDuration \|\| params.duration` ×6 (F12) |
| 6 | **Handlers `addEventListener`** | ❌ aucun dans la zone — les 74 handlers sont inline ; les 44 fonctions appelées existent toutes |

## Piège n°7, ajouté par cet audit

**Le markup généré au runtime.** `renderSettingsProfile` (app.js:17947) injecte **7 sections** par
`createElement` — dont **toute la section RGPD** et **le second bloc cycle menstruel**. Elles sont
invisibles à tout grep de `index.html`. C'est la raison structurelle du trou de la v1, et la méthode
des vagues 2 à 5 doit intégrer cette extension dès la phase 1.

## Piège n°8, ajouté par cet audit

**Le doublon de définition globale.** `renderTierSection` est défini dans `js/app.js` **et** dans un
bloc `<script>` inline de `index.html` (F9). Sans bundler ni modules, le dernier chargé gagne
silencieusement. À chercher systématiquement dans les vagues suivantes : un grep de
`^function <nom>` sur `js/` **plus** `index.html`.

## Divergences constatées avec CLAUDE.md

| CLAUDE.md | Code réel |
|---|---|
| §11 : `db.user.mode` (discipline) | **`db.user.mode` n'existe pas** — 0 écriture, 0 lecture. Le champ réel est `db.user.trainingMode` (10 écritures, 61 lectures, lu par `getMode` engine.js:453) |
| §11 : `level` ∈ `debutant\|intermediaire\|avance` | le sélecteur (index.html:2763-2768) propose une **4ᵉ** valeur : `competiteur` |
| §14 : `getSWVersion` (app.js:3977) | `renderAppVersionLine` est en app.js:4153 ; `_appVersionLabel` / `_swUpdateState` sont les helpers réels |

---

---

# PHASE 5 — VÉRIFICATION RUNTIME

> Aucun verdict ne reste `SUPPOSÉ`. Chaque ligne de la phase 2 porte désormais un statut runtime.

## Outillage et fidélité du banc

| | |
|---|---|
| Navigateur | Chromium **1194** préinstallé, piloté par `@playwright/test` **1.56.0** (le paquet `playwright` 1.59 du `package.json` attend le build 1217, absent — `require('@playwright/test')` est le seul qui démarre) |
| Serveur | serveur statique Node de 20 lignes écrit pour l'audit (`http-server` du `playwright.config.js` **n'est pas installé**) |
| Réseau | **intégralement stubbé.** Tout ce qui ne pointe pas vers `127.0.0.1` est intercepté ; Supabase reçoit des réponses synthétiques. **Aucune requête ne sort, aucune donnée réelle n'est touchée.** |
| Service Worker | `serviceWorkers: 'block'` — pas de cache qui masquerait la source |
| Viewport | 390×844 (cible Android annoncée) |
| Profils | `tests/fixtures/profiles/` (aurel_like, vierge, debutant) + variantes mutées au minimum (femme, femme+cycle, weightCut actif, goals=competition, débutant) |
| Scripts | `audit/runtime/` — **aucun fichier applicatif touché** |

**Note de rigueur — CLAUDE.md §17 est à jour à corriger** : « `npm test` n'a jamais tourné
(`node_modules` absent) » est **faux aujourd'hui** — `node_modules` est présent, Playwright et Jest
sont installés. C'est ce qui a rendu cette phase possible.

### Trois défauts de MON banc, corrigés avant de conclure

Je les documente parce qu'ils ont d'abord produit de faux résultats, et qu'un lecteur doit pouvoir
juger de la fiabilité de ce qui suit.

1. **`db` n'est pas sur `window`.** `let db = …` (app.js:108) crée une liaison lexicale globale :
   `typeof window.db` vaut `'undefined'`. La sonde d'attente échouait ; corrigée en évaluant
   l'identifiant nu.
2. **`addInitScript` rejoue à chaque navigation.** Le premier passage de la phase 5b re-semait le blob
   d'origine **au rechargement**, faisant échouer les 26 tests d'aller-retour pour une raison qui
   n'appartenait pas à l'app. Corrigé par une sentinelle.
3. **La garde anti-fuite RC4 purgeait mes profils.** Avec une session dont l'uid ne correspond pas au
   `ownerUid` du blob, l'app remplace le blob local — **comportement voulu et correct**. Mesuré :
   `{name:'', logs:0, bestPR:{0,0,0}, onboarded:false}` contre `{name:'Aurélien', logs:562,
   bestPR:{140,145,170}}` une fois le blob tatoué. Toutes les passes ont été **rejouées** après
   correction ; c'est cette correction qui a inversé le résultat de persistance de F1 (voir ci-dessous).

## 5a — Visibilité réelle

Sonde : `display`, `visibility`, `opacity`, boîte englobante, en accordéons fermés **puis** ouverts,
sur 3 profils, puis sur 5 variantes ciblées.

| Profil | Éléments visibles | Présents dans le DOM | /176 |
|---|---|---|---|
| aurel_like | 138 | 167 | 176 |
| vierge | 138 | 167 | 176 |
| debutant | 131 | 166 | 176 |

**Hypothèse testée puis RÉFUTÉE** : `.acc-body.open` plafonne à `max-height:5000px` avec
`overflow:hidden` (index.html:562-563) et le contenu des Réglages fait ~9 000 px — je soupçonnais un
rognage. Mesure : `#acc-profil` `clientHeight = scrollHeight = 3531 px`. **Rien n'est rogné.** La
dernière section injectée (`settingsMorphoSection`) est à l'offset 3041 px, largement sous la limite.

### Bilan des statuts

| Statut runtime | Nombre |
|---|---|
| ✔ CONFIRMÉ — visible au repos | 138 |
| ✔ CONFIRMÉ — conditionnel (révélé par l'action ou le profil qui le déverrouille) | 28 |
| ✔ CONFIRMÉ — inatteignable (action déclenchante exécutée, reste invisible) | 4 |
| ⊘ NON TESTABLE (raison donnée) | 6 |
| ❓ sans statut | **0** |

Les 6 non testables, avec leur raison :

| # | Élément | Pourquoi |
|---|---|---|
| 109 | `importSummary` | chemin de révélation présent (`import.js:1004`) mais mon échantillon Hevy n'a pas été parsé |
| 110 | `importDetails` | conteneur enfant de #109 |
| 111 | `aiImportAnalysis` | dépend d'une Edge Function IA — réseau stubbé |
| 115 | `csvProgress` | `csvImportBtn` est resté `disabled` : mon échantillon CSV a été rejeté par `parseCSVData` |
| 116-117 | `csvProgressBar`, `csvProgressText` | idem #115 |
| 164 | `settingsHealthConnect` | dépend de l'appairage Garmin / Health Connect |

### Les 4 inatteignables — confirmés après exécution de leur action déclenchante

- **#154 `acc-notif` / #155 `push-status-label`** — `toggleAcc('acc-notif')` exécuté : reste
  `display:none`, **style inline jamais retiré**. `.acc-body` n'agit que sur `max-height`. **CONFIRMÉ.**
- **#159 `tab-profil-badges` / #160 `profil-badges-content`** — forcés à la main via
  `showProfilSub('tab-profil-badges')` : **deviennent VISIBLES**. Le markup fonctionne ; ce qui manque,
  c'est l'appelant (0 sur 16 invocations de `showProfilSub` dans tout le dépôt) et la pilule.
  **Formulation précise : inatteignable par le parcours, pas cassé.**

## 5a bis — F1 reproduit intégralement

Parcours réel reproduit (`showTab('tab-profil'); showProfilSub('tab-profil-stats')`, tel qu'écrit aux
5 sites d'appel) :

| Observation | Mesure |
|---|---|
| Sous-sections `.active` après l'appel | **0** |
| Blocs de hauteur non nulle restants dans `#tab-profil` | `["nav-fade-wrap"]` — **la barre de pilules seule** |
| `sbd_lastTab` (localStorage) | `{…, "profil":"tab-profil-stats"}` |
| `db.gamification.lastTab` | idem |
| **Après rechargement complet** | onglet `tab-profil`, sous-sections `.active` = **0**, `activeProfilSub = 'tab-profil-stats'` |
| Échappatoire | quitter l'onglet puis y revenir → 1 sous-section active, `activeProfilSub = 'tab-corps'` |

→ **F1 CONFIRMÉ, persistance comprise.** L'écran vide survit au rechargement ; il se répare dès que
l'utilisateur change d'onglet et revient.

⚠️ **Correction d'une erreur intermédiaire de ma part** : un premier passage avait conclu que l'état ne
survivait *pas* au rechargement. C'était le défaut n°3 de mon banc (profil purgé par la garde RC4). Le
résultat ci-dessus, obtenu après correction, est celui qui fait foi — et il **confirme** l'analyse
statique initiale.

*Limite d'instrumentation* : mon traceur d'appels de `showProfilSub` a renvoyé une liste vide, parce que
les appels internes d'`app.js` résolvent la liaison lexicale et non `window.showProfilSub`. L'**ordre**
des appels au boot n'est donc pas prouvé ; seul le **résultat** l'est. Il suffit à établir le constat.

## 5b — Aller-retour (écrire → persister → recharger → réafficher)

Interactions réelles (`fill` + `change`/`input`, `selectOption`, `click`), jamais d'écriture directe en
JS. Chaîne de sauvegarde réelle respectée : `_debouncedSaveSettings` (300 ms) → `saveDB` (2 000 ms) →
`localStorage`.

**25 champs sur 27 ✔ CONFIRMÉS** en passe groupée. Les 2 « échecs » se sont révélés être **des artefacts
de mon propre test**, tous deux re-testés seuls et confirmés :

| # | Champ | Cause de l'échec apparent | En isolation |
|---|---|---|---|
| 63 | `inputBW` | `inputBodyWeight` (#19) écrit le **même** chemin `user.bw` plus loin dans la passe | ✔ 98 → 91.5, survit au reload |
| 88 | `settingsDays` | `setSettingsFreq(5)` exécuté juste avant réajuste `selectedDays` (app.js:18800-18808) | ✔ ajout de « Lundi », survit au reload |

Champs injectés au runtime, testés dans le profil qui les déverrouille :

| # | Champ | Résultat |
|---|---|---|
| 172 | `settings-bar-weight` | ✔ 20 → 15 (c'est un `<select>`, pas un `<input>`) |
| 174 | `toggle-hybrid` | ✔ false → true |
| 77 | `settingsCycleEnabled` (femme) | ✔ false → true |
| 161 | `toggleMenstrualTracking` (femme) | ✔ false → true |
| 168 | `wc-current-weight` (weightCut actif) | ✔ 98 → 96.2 |
| 170 | `toggle-creatine` (weightCut actif) | ✔ false → true |

## 5c — Consommation : la sortie dépendante bouge-t-elle ?

### F4 — les deux chaînes caloriques, mesurées côte à côte

`kcalBase` 2300 → 3000 et `bwBase` → 80 (entrées de `calcCalorieCible` **uniquement**) :

| Élément affiché | Avant | Après |
|---|---|---|
| « Objectif » (`nutriCible`) | 2300 | **3675** ✔ réagit |
| « TDEE estimé » (`nutriTDEELabel`) | 2672 kcal | **2672 kcal** ← inchangé |
| « Restantes » | 0 | 1025 |

Valeurs brutes pour le **même** poids de corps (98 kg) :
`calcCalorieCible = 3675` contre `calcTDEE = 2672`.
Au départ, avant toute manipulation : **Objectif 2300 / TDEE estimé 2672**, dans la même carte.
(2672 est la cible de référence d'aurel_br au CLAUDE.md §15.) **F4 CONFIRMÉ à l'écran.**

### F6 — activer « 🌙 Optimisation hormonale » (UI n°1), profil femme

```
cycleTracking.enabled = true          lastPeriodDate = "2026-07-10"
menstrualEnabled      = false         menstrualData  = null
getCurrentMenstrualPhase() = "luteale"    ← le pont de DATE fonctionne
getCycleCoeff()            = 1            ← AUCUN ajustement de volume
getMRVWithCycleAdjust(20)  = 20           ← MRV inchangé
getCyclePhaseModifier()    = 5            ← le modificateur SRS, lui, RÉAGIT
```
**F6 CONFIRMÉ, avec sa nuance exacte** : effet partiel (SRS), pas nul, et pas l'ajustement
volume/MRV/repos que le libellé laisse attendre.

### F5 — étanchéité des deux UI blessures

Niveau 2 sur « Genoux » via l'UI n°1 (`settingsInjuriesList`) :
```
db.user.injuries               = [{"zone":"genou","level":2,"active":true,"since":"2026-07-28"}]
db.user.programParams.injuries = []
bouton « Genoux » de l'UI n°2 allumé ?  false
```
**F5 CONFIRMÉ** : deux stores étanches, dans le même accordéon.

### F13 — `targetBW`

`targetBW = 82` persisté ; le texte intégral de l'onglet Corps est **identique caractère pour
caractère** avant et après. **DONNÉE MORTE CONFIRMÉE à l'exécution.**

### F12 — `trainingDuration` prime silencieusement

Blob porteur de `trainingDuration = 45` et `programParams.duration = 90` :

| | |
|---|---|
| Bouton allumé dans les Réglages | **1h30** |
| Ce que lisent les 6 sites (`A \|\| B \|\| 90`) | **45** |

**F12 CONFIRMÉ** : l'interface montre 1h30, l'algorithme utilise 45.

### F17 — `fatPct` hors bornes moteur

| Saisi | Stocké | `calcTDEE` | Katch pur |
|---|---|---|---|
| 15 | 15 | 2971 | 3471 |
| 49 | 49 | 1819 | 2319 |
| **55** | **55** | **2672** ← repli Mifflin | 2116 |

L'UI accepte jusqu'à 60 ; au-delà de 50, la valeur est stockée, ré-affichée, et **silencieusement
ignorée** par le calcul. **F17 CONFIRMÉ.**

### F14 — ce que la section « Correction des Records » affiche vraiment

```
db.bestPR (vraies barres) = {"bench":140,"squat":145,"deadlift":170}

  Presse à Cuisses
  e1RM: 347kg — 26/07
  Soulevé de Terre (Barre)
  e1RM: 186kg — 30/12
```
Le deadlift est affiché **186 kg** là où le PR réel est **170 kg**. **F14 CONFIRMÉ à l'écran** — c'est
exactement le motif que CLAUDE.md §7 décrit (« e1RM affiché au lieu du PR »). Le marquage `[VOULU ?]`
reste : la section sert à repérer un import aberrant, et le libellé « e1RM » est honnête.

## 5d — Persistance cloud : la signature bouge-t-elle ?

Mesure de `_computeDataHash(db)` avant/après chaque écriture, **et** comptage des requêtes d'écriture
vers `sbd_profiles` interceptées (delta sur la fenêtre de mesure).

| Écriture de l'onglet Profil | Signature | Écritures `sbd_profiles` |
|---|---|---|
| **témoin** — champ de `db.user` (nom) | ✔ CHANGE | **1** |
| Corps — poids du jour (`saveBodyEntry`) | ✔ CHANGE | **1** *(via `db.user.bw`)* |
| **Corps — macros seules (`saveMacroEntry`)** | ✘ **INCHANGÉE** | **0** |
| **Réglages — Exercices Clés (`saveKeyLifts`)** | ✘ **INCHANGÉE** | **0** |
| **Réglages — Mon Programme (`saveRoutine`)** | ✘ **INCHANGÉE** | **0** |
| **Navigation — sous-onglet mémorisé (`_updateLastTab`)** | ✘ **INCHANGÉE** | **0** |
| Correction des Records (`db.bestPR`) | ✔ CHANGE | **1** |

**Contrôle indispensable — l'écriture locale a bien eu lieu.** Pour écarter la confusion entre « non
signé » et « non écrit », la saisie de macros a été re-mesurée seule :

```
entrée du jour AVANT              : {ts:…, bw:98, kcal:2650, prot:216}
entrée du jour APRÈS (mémoire)    : {ts:…, bw:98, kcal:2605, prot:210, carb:250, fat:85}
entrée du jour APRÈS (localStorage): {ts:…, bw:98, kcal:2605, prot:210, carb:250, fat:85}
signature identique ?  true
```
La donnée est bien écrite **et** persistée localement ; c'est la **signature** qui ne bouge pas.
**F11 CONFIRMÉ.**

**F10 CONFIRMÉ** : `db.lastModified` vaut `undefined` avant **et** après une modification, alors que
`db.updatedAt` passe de `1785269841163` à `1785269843509`. Le 14ᵉ terme de la signature est donc une
**constante `0`**.

Et le blob poussé transporte bien ces clés — `_buildSyncedBlob` → `{aBody:true, aKeyLifts:true,
aRoutine:true, aLogs:false, nbClés:68}`. **Transporté ≠ signé** : elles ne partent que si une *autre*
modification, elle signée, fait basculer la signature.

## Ce que la phase 5 a changé par rapport aux phases 1-4

| | |
|---|---|
| **Constat nouveau** | **F19** — porte circulaire du Weight Cut. Invisible en lecture statique ; produit par l'absence de la section dans le DOM. |
| **Verdict réfuté** | #165-170 : « ✅ CÂBLÉ (inconditionnel) » → **🔴 RENDU INATTEIGNABLE**. 6 lignes corrigées dans la table. |
| **Hypothèse réfutée** | le rognage par `max-height:5000px` : mesuré, **rien n'est rogné** (3531 px). |
| **Nuance ajoutée** | #159-160 : le markup des Badges **fonctionne** (forcé à la main → visible) ; c'est l'appelant qui manque. |
| **Nuance ajoutée** | F6 : effet **partiel** (le SRS réagit, pas le volume/MRV/repos) — chiffres à l'appui. |
| **Confirmés sans changement** | F1, F3, F4, F5, F10, F11, F12, F13, F14, F17. |
| **Faux positifs écartés** | 2 échecs d'aller-retour, imputables à mon test, re-testés et confirmés ✔. |

## Reproduire

```
node audit/runtime/smoke.js              # l'app boote-t-elle sous le banc ?
node audit/runtime/5a-visibilite.js      # visibilité des 176, 3 profils
node audit/runtime/5a-variantes.js       # profils qui déverrouillent les sections gatées
node audit/runtime/5a-conditionnels.js   # masqué par conception vs inatteignable
node audit/runtime/5a-clipping.js        # mesure du rognage (hypothèse réfutée)
node audit/runtime/5a-persistance-tab.js # F1 : survie au rechargement
node audit/runtime/5b-allerretour.js     # 27 champs : écrire → persister → recharger
node audit/runtime/5b-bis-isoles.js      # isolation + champs injectés
node audit/runtime/5c-consommation.js    # la sortie dépendante bouge-t-elle ?
node audit/runtime/5d-hash-sync.js       # signature de sync + push interceptés
node audit/runtime/consolide.js          # fusionne → out-runtime.json (176 statuts)
```

## Ce que ce rapport ne couvre PAS

- **Aucun device Android réel.** La phase 5 exécute l'app dans Chromium à 390×844 ; elle ne remplace
  pas une vérification sur téléphone (perfs, Chart.js asynchrone, Service Worker actif — ce dernier est
  volontairement bloqué sur le banc).
- **Le rendu visuel n'est pas jugé.** La phase 5 mesure présence, visibilité, persistance et
  consommation — pas la lisibilité, le contraste ni la mise en page.
- **Les 6 lignes ⊘** listées en phase 5a : deux d'entre elles (aperçu Hevy, progression CSV) tiennent à
  mes échantillons d'import, pas à l'app ; leur chemin de révélation existe dans le code.
- **Chaîne Garmin / Health Connect** (#164) : `connectHealthConnect` et `db.garminHealth` n'ont pas été
  suivis hors de la zone Profil.
- **Contenu interne** des sections rendues par une autre surface : `renderGamificationTab` (copiée dans
  `profil-badges-content`), `renderMuscleHeatmap`, `renderJointHealthSection` (joints.js) — leurs
  conteneurs sont audités, pas leur logique interne.
- **Vagues 2 à 5** : Séances, Maison + Coach, Stats, Social + Jeux.

## À VÉRIFIER CÔTÉ SUPABASE (je n'y ai pas accès)

1. **`data.user.plan` vs `profiles.tier`** (F8) — le blob `sbd_profiles.data` contient-il un
   `user.plan` ≠ `'free'` pour certains comptes, et concorde-t-il avec `profiles.tier` ?
   `select user_id, data->'user'->>'plan', data->'user'->>'betaExpiresAt' from sbd_profiles;`
   puis `select id, tier from profiles;`
2. **`data.user.trainingDuration`** (F12) — combien de blobs portent une valeur non nulle, et laquelle ?
   `select user_id, data->'user'->>'trainingDuration', data->'user'->'programParams'->>'duration' from sbd_profiles;`
3. **`data.body`** (F11) — les entrées de macros (`prot`/`carb`/`fat` non nuls) sont-elles présentes en base,
   et à quelle fraction des entrées locales attendues ?
   `select user_id, jsonb_array_length(data->'body') from sbd_profiles;`
4. **`data.user.activities` vs `data.user.activityTemplate`** (F7) — les deux tableaux divergent-ils
   pour les utilisateurs réels ?
5. **`data.user.cycleTracking.enabled` vs `data.user.menstrualEnabled`** (F6) — pour les comptes féminins,
   le premier est-il vrai sans le second ?
6. **`data.gamification.lastTab.profil`** (F1) — la valeur `'tab-profil-stats'` est-elle déjà persistée
   pour des comptes réels ?

---

**Aucune modification de code n'a été faite. Aucune recommandation n'est formulée.**
