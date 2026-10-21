# Audit de câblage — Vague 1 v3 : PROFIL (Corps · Réglages · RGPD) — inventaire par UNION

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Dernière passe de l'audit. `audit/cablage-vague1-profil-v2.md` (176 éléments) est **conservé**.

---

## ⚠️ EN TÊTE — LA CHAÎNE RGPD DE SUPPRESSION DE COMPTE

Les deux passages précédents la déclaraient **jamais rendue**. **Ce n'est plus le cas, et mon constat
précédent était faux.** Vérifié à l'exécution, par un **clic réel** sur le bouton :

```
Réglages → Zone de Danger → « 🗑️ Supprimer définitivement mon compte » (visible, 298×69)
  → clic → modale : « ⚠️ Supprimer ton compte ? Toutes tes données (séances, programme,
                      profil) seront définitivement effacées. Cette action est irréversible. »
                      [ Annuler ]  [ Supprimer définitivement ]
```

**Pourquoi je l'avais manquée** : `requestAccountDeletion` (app.js:1862) passe par `showModal`, pas par
un overlay à `id`. Mes sondes cherchaient `del-erase` / `del-anon` / `del-confirm` — qui appartiennent à
une **fonction différente**.

**Deux chaînes distinctes, que j'avais conflatées** (vérifié : `requestAccountDeletion !== showAccountDeletionDialog`) :

| Fonction | Rôle | Rendu vérifié |
|---|---|---|
| `requestAccountDeletion` app.js:1862 | **suppression de compte RGPD** — double confirmation, puis Edge Function `delete-account` (RPC `delete_user_complete_data` + suppression de l'auth user) | ✔ **CONFIRMÉ** — modale ouverte par clic réel |
| `showAccountDeletionDialog` supabase.js:4336 | **« Quitter la communauté »** — suppression du *profil social* : effacement total **ou** anonymisation | ✔ **CONFIRMÉ** — dialogue rendu (298×90 par option) : « Effacement total · Posts, commentaires, réactions, profil — tout disparaît » / « Anonymisation · Le profil disparaît mais les commentaires restent sous "Utilisateur supprimé" » |

**Aucune suppression n'a été déclenchée** : je me suis arrêté à l'affichage, sans jamais cliquer la
confirmation. La garde `if (!_dec.purge)` (app.js:1895 — « ne purger le local QUE si les données serveur
sont parties ») est **lue dans le code, non exercée**.

> **Ce qui reste non vérifié** : le comportement **au-delà** de la première confirmation — appel de
> l'Edge Function, `_deleteAccountDecision`, purge locale. Il faudrait une vraie suppression sur un
> vrai compte, ce que ce banc s'interdit. **C'est la seule partie de la chaîne RGPD encore non testée**,
> et elle ne peut l'être qu'avec un compte jetable en base (question Supabase en fin de rapport).

---

## CONTRÔLE D'EXHAUSTIVITÉ

> **Estimation a priori : 256** *(raisonnée depuis la v2 : 176 recensés + ~40 pour le CONTENU des 7
> sections injectées, jamais détaillé + ~40 blocs sans `id`)*.
> **Inventorié : 260** — 210 éléments à `id` + 50 blocs sans `id`. Écart **+2 %** → cohérent.
> **Phase 1 : 260 · Phase 2 : 260 verdicts · Phase 5 : 260 statuts runtime.**

| Provenance (éléments à `id`) | Nombre |
|---|---|
| **A ∩ B** — vu dans le code **et** rendu | **183** |
| **A seul** — jamais rendu sur les 17 états | **3** |
| **B seul** — hors périmètre (voir ci-dessous) | **24** |

**Comparaison v2 → v3 : 176 → 260 éléments (+84, +48 %).**

| Périmètre | |
|---|---|
| Zone markup | `index.html:2610-3149` |
| Fonctions de rendu | 127 (fermeture depuis 22 racines, barrière inter-surfaces active) |
| États runtime | **17** — 4 profils × 2 sous-onglets, + femme, femme+cycle, weightCut actif, `goals=['competition']`, niveau débutant, avec blessures, avec activités, session anonyme, badges forcés |

### Honnêteté sur l'auto-contrôle de cette vague

L'estimation a été **raisonnée à partir du rapport v2**, et la source B a été exécutée **avant** que je
l'écrive. Le contrôle a priori est donc **moins indépendant** ici que sur les vagues 2 à 5, où
l'estimation précédait tout comptage. Je le signale plutôt que de présenter un « +2 % » comme une
validation forte.

### Les 24 « B seul » : la recopie de l'onglet Jeux

`jeux-profil-joueur`, `gamLevelCard`, `gamXPSources`, `gamChallenges`, `gamMonthlyChallenges`,
`gamHeatmap`, `jeux-rangs`, `anatomyCard`, `btn-body-front`, `btn-body-back`, `btn-body-gender`,
`body-figure-container`, `muscle-list`, `antagonistAlerts`, `gamSBDRanks`, `gamStrengthContent`,
`sg<n>`, `jeux-badges`, `gamRecentBadges`, `gamNextBadges`, `gamBadgesOverview`, `gamBadgesSections`,
`bdgSec<n>`, `gamLeaderboard`.

Ce ne sont pas des générateurs ratés par la source A : ce sont des éléments de **l'onglet Jeux**,
présents dans le DOM du Profil parce que `showProfilSub('tab-profil-badges')` fait
`badgesContainer.innerHTML = gameEl.innerHTML` (app.js:4205) — **il duplique l'onglet Jeux entier**.
17 blocs sans `id` viennent de la même recopie.

→ **41 éléments (24 ids + 17 blocs) sont marqués ➖ hors périmètre.** Périmètre Profil net : **219**.

*Rappel : ce sous-onglet reste 🔴 RENDU INATTEIGNABLE (vague 1 v2, F2) — aucune pilule, aucun appelant.
Je n'ai pu l'observer qu'en le forçant.*

### Corrections apportées à la source A (« B seul » : 59 → 24, tous hors périmètre)

1. **Motif `id="prefixe-${var}"` non détecté** — `id="prog-section-${day}"` (app.js:3877). Un générateur
   entier (l'éditeur de routine des Réglages, 5 familles × 7 jours = 35 ids) passait inaperçu.
   *C'est le même type d'oubli que `id="${mgId}"` en vague 4.*
2. **Racine manquante** : `renderSettingsRoutineEditor` ajoutée.
3. **Familles à suffixe « nom de jour »** : `prog-section-Lundi` … `prog-add-Dimanche` regroupés.

---

## LES 3 ÉLÉMENTS « A SEUL »

| Élément | Produit par | Point d'entrée UI | Verdict |
|---|---|---|---|
| `consentHealthOverlay` | `showConsentModal` app.js:1558 | handler généré app.js:1633 | ✅ CÂBLÉ (conditionnel) — modale de consentement santé |
| `glossaryModal` | `showGlossaryModal` app.js:1226 | app.js:1213, 1246 | ✅ CÂBLÉ (conditionnel) |
| `garmin-csv-input` | `showGarminCSVImport` app.js:18435 | app.js:18406 | ✅ CÂBLÉ (conditionnel) |

**Aucun nouveau 🔴 sur cette vague.** Les trois ont un point d'entrée réel ; mes 17 états ne les ont
pas ouverts. C'est cohérent avec le fait que la v2 croisait déjà markup + runtime : **le gros du travail
d'inventaire était déjà fait, et Weight Cut y avait bien été trouvé.**

**Ce que la v3 ajoute est ailleurs** : dans le **contenu** des sections (les 183 A∩B contre 176
inventoriés en v2) et dans les **50 blocs sans `id`**, que la v2 ne comptait pas du tout.

---

## PHASE 2 — 210 VERDICTS (éléments à `id`)

| # | Élément | Provenance | Origine | Rendu atteignable ? | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1 | `tab-profil` | A∩B | index.html:2610 | oui | ✅ CÂBLÉ | ✔ visible |
| 2 | `tab-corps` | A∩B | index.html:2615 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `formeScoreTag` | A∩B | index.html:2619 | oui | ✅ CÂBLÉ | ✔ visible |
| 4 | `chev-ca-forme` | A∩B | index.html:2620 | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `ca-forme` | A∩B | index.html:2622 | oui | ✅ CÂBLÉ | ✔ visible |
| 6 | `formeScoreContent` | A∩B | index.html:2622 | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `formeScoreTooltip` | A∩B | index.html:2623 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 8 | `chev-ca-load` | A∩B | index.html:2638 | oui | ✅ CÂBLÉ | ✔ visible |
| 9 | `ca-load` | A∩B | index.html:2640 | oui | ✅ CÂBLÉ | ✔ visible |
| 10 | `trainingLoadContent` | A∩B | index.html:2640 | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `chev-ca-heatmap` | A∩B | index.html:2647 | oui | ✅ CÂBLÉ | ✔ visible |
| 12 | `ca-heatmap` | A∩B | index.html:2649 | oui | ✅ CÂBLÉ | ✔ visible |
| 13 | `muscleHeatmapContent` | A∩B | index.html:2649 | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `chev-ca-joints` | A∩B | index.html:2656 | oui | ✅ CÂBLÉ | ✔ visible |
| 15 | `ca-joints` | A∩B | index.html:2658 | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `jointHealthContent` | A∩B | index.html:2658 | oui | ✅ CÂBLÉ | ✔ visible |
| 17 | `chev-ca-poids` | A∩B | index.html:2665 | oui | ✅ CÂBLÉ | ✔ visible |
| 18 | `ca-poids` | A∩B | index.html:2667 | oui | ✅ CÂBLÉ | ✔ visible |
| 19 | `inputBodyWeight` | A∩B | index.html:2670 | oui | ✅ CÂBLÉ | ✔ visible |
| 20 | `weightTrendDisplay` | A∩B | index.html:2673 | oui | ✅ CÂBLÉ | ✔ visible |
| 21 | `chartBodyWeight` | A∩B | index.html:2674 | oui | ✅ CÂBLÉ | ✔ visible |
| 22 | `weightHistory` | A∩B | index.html:2675 | oui | ✅ CÂBLÉ | ✔ visible |
| 23 | `chev-ca-nutri` | A∩B | index.html:2684 | oui | ✅ CÂBLÉ | ✔ visible |
| 24 | `ca-nutri` | A∩B | index.html:2686 | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `nutriCard` | A∩B | index.html:2687 | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `nutriRingFill` | A∩B | index.html:2691 | oui | ✅ CÂBLÉ | ✔ visible |
| 27 | `nutriKcalRestantes` | A∩B | index.html:2694 | oui | ✅ CÂBLÉ | ✔ visible |
| 28 | `nutriKcalSub` | A∩B | index.html:2696 | oui | ✅ CÂBLÉ | ✔ visible |
| 29 | `nutriDayTypeLabel` | A∩B | index.html:2699 | oui | ✅ CÂBLÉ | ✔ visible |
| 30 | `nutriMangees` | A∩B | index.html:2701 | oui | ✅ CÂBLÉ | ✔ visible |
| 31 | `nutriCible` | A∩B | index.html:2702 | oui | ✅ CÂBLÉ | ✔ visible |
| 32 | `nutriBrulees` | A∩B | index.html:2703 | oui | ✅ CÂBLÉ | ✔ visible |
| 33 | `nutriCarbLabel` | A∩B | index.html:2705 | oui | ✅ CÂBLÉ | ✔ visible |
| 34 | `nutriCarbBar` | A∩B | index.html:2705 | oui | ✅ CÂBLÉ | ✔ visible |
| 35 | `nutriProtLabel` | A∩B | index.html:2706 | oui | ✅ CÂBLÉ | ✔ visible |
| 36 | `nutriProtBar` | A∩B | index.html:2706 | oui | ✅ CÂBLÉ | ✔ visible |
| 37 | `nutriFatLabel` | A∩B | index.html:2707 | oui | ✅ CÂBLÉ | ✔ visible |
| 38 | `nutriFatBar` | A∩B | index.html:2707 | oui | ✅ CÂBLÉ | ✔ visible |
| 39 | `nutriTDEELabel` | A∩B | index.html:2708 | oui | ✅ CÂBLÉ | ✔ visible |
| 40 | `nutriProtCible` | A∩B | index.html:2708 | oui | ✅ CÂBLÉ | ✔ visible |
| 41 | `inputProt` | A∩B | index.html:2712 | oui | ✅ CÂBLÉ | ✔ visible |
| 42 | `inputCarb` | A∩B | index.html:2712 | oui | ✅ CÂBLÉ | ✔ visible |
| 43 | `inputFat` | A∩B | index.html:2712 | oui | ✅ CÂBLÉ | ✔ visible |
| 44 | `inputKcal` | A∩B | index.html:2712 | oui | ✅ CÂBLÉ | ✔ visible |
| 45 | `macroHistoryDisplay` | A∩B | index.html:2715 | oui | ✅ CÂBLÉ | ✔ visible |
| 46 | `chev-ca-force` | A∩B | index.html:2724 | oui | ✅ CÂBLÉ | ✔ visible |
| 47 | `ca-force` | A∩B | index.html:2726 | oui | ✅ CÂBLÉ | ✔ visible |
| 48 | `bodyMetricsGrid` | A∩B | index.html:2728 | oui | ✅ CÂBLÉ | ✔ visible |
| 49 | `metricIPFCard` | A∩B | index.html:2729 | oui | ✅ CÂBLÉ | ✔ visible |
| 50 | `metricIPF` | A∩B | index.html:2729 | oui | ✅ CÂBLÉ | ✔ visible |
| 51 | `metricIPFsub` | A∩B | index.html:2729 | oui | ✅ CÂBLÉ | ✔ visible |
| 52 | `metricRatioCard` | A∩B | index.html:2730 | oui | ✅ CÂBLÉ | ✔ visible |
| 53 | `metricRatio` | A∩B | index.html:2730 | oui | ✅ CÂBLÉ | ✔ visible |
| 54 | `metricRatioSub` | A∩B | index.html:2730 | oui | ✅ CÂBLÉ | ✔ visible |
| 55 | `plateauAlerts` | A∩B | index.html:2732 | oui | ✅ CÂBLÉ | ✔ visible |
| 56 | `chev-ca-coach` | A∩B | index.html:2741 | oui | ✅ CÂBLÉ | ✔ visible |
| 57 | `ca-coach` | A∩B | index.html:2743 | oui | ✅ CÂBLÉ | ✔ visible |
| 58 | `coachAlgoContent` | A∩B | index.html:2744 | oui | ✅ CÂBLÉ | ✔ visible |
| 59 | `tab-settings` | A∩B | index.html:2749 | oui | ✅ CÂBLÉ | ✔ visible |
| 60 | `chev-acc-profil` | A∩B | index.html:2754 | oui | ✅ CÂBLÉ | ✔ visible |
| 61 | `acc-profil` | A∩B | index.html:2756 | oui | ✅ CÂBLÉ | ✔ visible |
| 62 | `inputName` | A∩B | index.html:2757 | oui | ✅ CÂBLÉ | ✔ visible |
| 63 | `inputBW` | A∩B | index.html:2758 | oui | ✅ CÂBLÉ | ✔ visible |
| 64 | `inputFatPct` | A∩B | index.html:2759 | oui | ✅ CÂBLÉ | ✔ visible |
| 65 | `settingsLevel` | A∩B | index.html:2763 | oui | ✅ CÂBLÉ | ✔ visible |
| 66 | `settingsHeight` | A∩B | index.html:2775 | oui | ✅ CÂBLÉ | ✔ visible |
| 67 | `settingsAge` | A∩B | index.html:2783 | oui | ✅ CÂBLÉ | ✔ visible |
| 68 | `settingsGender` | A∩B | index.html:2790 | oui | ✅ CÂBLÉ | ✔ visible |
| 69 | `settingsTargetBW` | A∩B | index.html:2801 | oui | ✅ CÂBLÉ | ✔ visible |
| 70 | `settingsTargetsBlock` | A∩B | index.html:2807 | oui | ✅ CÂBLÉ | ✔ visible |
| 71 | `tgtUnitLabel` | A∩B | index.html:2809 | oui | ✅ CÂBLÉ | ✔ visible |
| 72 | `tgtBench` | A∩B | index.html:2812 | oui | ✅ CÂBLÉ | ✔ visible |
| 73 | `tgtSquat` | A∩B | index.html:2814 | oui | ✅ CÂBLÉ | ✔ visible |
| 74 | `tgtDead` | A∩B | index.html:2816 | oui | ✅ CÂBLÉ | ✔ visible |
| 75 | `tgtPrHint` | A∩B | index.html:2819 | oui | ✅ CÂBLÉ | ✔ visible |
| 76 | `settingsCycleBlock` | A∩B | index.html:2823 | oui | ✅ CÂBLÉ | ✔ visible |
| 77 | `settingsCycleEnabled` | A∩B | index.html:2825 | oui | ✅ CÂBLÉ | ✔ visible |
| 78 | `settingsCycleDetails` | A∩B | index.html:2828 | oui | ✅ CÂBLÉ | ✔ visible |
| 79 | `settingsCycleLastDate` | A∩B | index.html:2830 | oui | ✅ CÂBLÉ | ✔ visible |
| 80 | `settingsCycleLength` | A∩B | index.html:2834 | oui | ✅ CÂBLÉ | ✔ visible |
| 81 | `settingsInjuriesList` | A∩B | index.html:2846 | oui | ✅ CÂBLÉ | ✔ visible |
| 82 | `settingsActivities` | A∩B | index.html:2858 | oui | ✅ CÂBLÉ | ✔ visible |
| 83 | `settingsTrainingMode` | A∩B | index.html:2866 | oui | ✅ CÂBLÉ | ✔ visible |
| 84 | `settingsUIDetail` | A∩B | index.html:2876 | oui | ✅ CÂBLÉ | ✔ visible |
| 85 | `settingsVocabLevel` | A∩B | index.html:2886 | oui | ✅ CÂBLÉ | ✔ visible |
| 86 | `settingsGoals` | A∩B | index.html:2895 | oui | ✅ CÂBLÉ | ✔ visible |
| 87 | `settingsFreq` | A∩B | index.html:2900 | oui | ✅ CÂBLÉ | ✔ visible |
| 88 | `settingsDays` | A∩B | index.html:2905 | oui | ✅ CÂBLÉ | ✔ visible |
| 89 | `settingsMat` | A∩B | index.html:2910 | oui | ✅ CÂBLÉ | ✔ visible |
| 90 | `settingsDuration` | A∩B | index.html:2915 | oui | ✅ CÂBLÉ | ✔ visible |
| 91 | `settingsSupersets` | A∩B | index.html:2920 | oui | ✅ CÂBLÉ | ✔ visible |
| 92 | `settingsPrehabToggle` | A∩B | index.html:2929 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 93 | `settingsPrehabSlider` | A∩B | index.html:2930 | oui | ✅ CÂBLÉ | ✔ visible |
| 94 | `settingsPrehabKnob` | A∩B | index.html:2931 | oui | ✅ CÂBLÉ | ✔ visible |
| 95 | `settingsProgramMode` | A∩B | index.html:2937 | oui | ✅ CÂBLÉ | ✔ visible |
| 96 | `settingsInjuries` | A∩B | index.html:2942 | oui | ✅ CÂBLÉ | ✔ visible |
| 97 | `settingsCardio` | A∩B | index.html:2947 | oui | ✅ CÂBLÉ | ✔ visible |
| 98 | `inputKcalBase` | A∩B | index.html:2951 | oui | ✅ CÂBLÉ | ✔ visible |
| 99 | `inputBWBase` | A∩B | index.html:2952 | oui | ✅ CÂBLÉ | ✔ visible |
| 100 | `chev-acc-keylifts` | A∩B | index.html:2962 | oui | ✅ CÂBLÉ | ✔ visible |
| 101 | `acc-keylifts` | A∩B | index.html:2964 | oui | ✅ CÂBLÉ | ✔ visible |
| 102 | `keyLiftsEditor` | A∩B | index.html:2966 | oui | ✅ CÂBLÉ | ✔ visible |
| 103 | `chev-acc-prog` | A∩B | index.html:2975 | oui | ✅ CÂBLÉ | ✔ visible |
| 104 | `acc-prog` | A∩B | index.html:2977 | oui | ✅ CÂBLÉ | ✔ visible |
| 105 | `routineEditor` | A∩B | index.html:2979 | oui | ✅ CÂBLÉ | ✔ visible |
| 106 | `chev-acc-import` | A∩B | index.html:2987 | oui | ✅ CÂBLÉ | ✔ visible |
| 107 | `acc-import` | A∩B | index.html:2989 | oui | ✅ CÂBLÉ | ✔ visible |
| 108 | `hevyPaste` | A∩B | index.html:2992 | oui | ✅ CÂBLÉ | ✔ visible |
| 109 | `importSummary` | A∩B | index.html:2994 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 110 | `importDetails` | A∩B | index.html:2994 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 111 | `aiImportAnalysis` | A∩B | index.html:2995 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 112 | `csvFileInput` | A∩B | index.html:3000 | oui | ✅ CÂBLÉ | ✔ visible |
| 113 | `csvPreview` | A∩B | index.html:3001 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 114 | `csvImportBtn` | A∩B | index.html:3002 | oui | ✅ CÂBLÉ | ✔ visible |
| 115 | `csvProgress` | A∩B | index.html:3003 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 116 | `csvProgressBar` | A∩B | index.html:3004 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 117 | `csvProgressText` | A∩B | index.html:3005 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 118 | `chev-acc-cloud` | A∩B | index.html:3015 | oui | ✅ CÂBLÉ | ✔ visible |
| 119 | `acc-cloud` | A∩B | index.html:3017 | oui | ✅ CÂBLÉ | ✔ visible |
| 120 | `cloudStatus` | A∩B | index.html:3018 | oui | ✅ CÂBLÉ | ✔ visible |
| 121 | `emailLoginSection` | A∩B | index.html:3019 | oui | ✅ CÂBLÉ | ✔ visible |
| 122 | `authModeTabs` | A∩B | index.html:3020 | oui | ✅ CÂBLÉ | ✔ visible |
| 123 | `authModeLogin` | A∩B | index.html:3021 | oui | ✅ CÂBLÉ | ✔ visible |
| 124 | `authModeSignup` | A∩B | index.html:3022 | oui | ✅ CÂBLÉ | ✔ visible |
| 125 | `inputEmail` | A∩B | index.html:3024 | oui | ✅ CÂBLÉ | ✔ visible |
| 126 | `inputPassword` | A∩B | index.html:3025 | oui | ✅ CÂBLÉ | ✔ visible |
| 127 | `inputPasswordConfirm` | A∩B | index.html:3026 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 128 | `authSubmitBtn` | A∩B | index.html:3027 | oui | ✅ CÂBLÉ | ✔ visible |
| 129 | `forgotPasswordBtn` | A∩B | index.html:3029 | oui | ✅ CÂBLÉ | ✔ visible |
| 130 | `syncIndicator` | A∩B | index.html:3031 | oui | ✅ CÂBLÉ | ✔ visible |
| 131 | `lastSyncDisplay` | A∩B | index.html:3032 | oui | ✅ CÂBLÉ | ✔ visible |
| 132 | `changePasswordSection` | A∩B | index.html:3035 | oui | ✅ CÂBLÉ | ✔ visible |
| 133 | `newPassword` | A∩B | index.html:3037 | oui | ✅ CÂBLÉ | ✔ visible |
| 134 | `newPasswordConfirm` | A∩B | index.html:3038 | oui | ✅ CÂBLÉ | ✔ visible |
| 135 | `chev-acc-backup` | A∩B | index.html:3047 | oui | ✅ CÂBLÉ | ✔ visible |
| 136 | `acc-backup` | A∩B | index.html:3049 | oui | ✅ CÂBLÉ | ✔ visible |
| 137 | `restoreFileInput` | A∩B | index.html:3055 | oui | ✅ CÂBLÉ | ✔ visible |
| 138 | `restorePreview` | A∩B | index.html:3056 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 139 | `restoreBtn` | A∩B | index.html:3057 | oui | ✅ CÂBLÉ | ✔ visible |
| 140 | `storageGauge` | A∩B | index.html:3064 | oui | ✅ CÂBLÉ | ✔ visible |
| 141 | `chev-acc-records` | A∩B | index.html:3069 | oui | ✅ CÂBLÉ | ✔ visible |
| 142 | `acc-records` | A∩B | index.html:3071 | oui | ✅ CÂBLÉ | ✔ visible |
| 143 | `recordsCorrectionList` | A∩B | index.html:3073 | oui | ✅ CÂBLÉ | ✔ visible |
| 144 | `chev-acc-glossary` | A∩B | index.html:3080 | oui | ✅ CÂBLÉ | ✔ visible |
| 145 | `acc-glossary` | A∩B | index.html:3082 | oui | ✅ CÂBLÉ | ✔ visible |
| 146 | `glossaryPageContent` | A∩B | index.html:3084 | oui | ✅ CÂBLÉ | ✔ visible |
| 147 | `acc-tier-card` | A∩B | index.html:3089 | oui | ✅ CÂBLÉ | ✔ visible |
| 148 | `chev-acc-tier` | A∩B | index.html:3091 | oui | ✅ CÂBLÉ | ✔ visible |
| 149 | `acc-tier` | A∩B | index.html:3093 | oui | ✅ CÂBLÉ | ✔ visible |
| 150 | `tierWelcomeSection` | A∩B | index.html:3094 | oui | ✅ CÂBLÉ | ✔ visible |
| 151 | `tierBadgesSection` | A∩B | index.html:3095 | oui | ✅ CÂBLÉ | ✔ visible |
| 152 | `themeSelector` | A∩B | index.html:3097 | oui | ✅ CÂBLÉ | ✔ visible |
| 153 | `chev-acc-notif` | A∩B | index.html:3104 | oui | ✅ CÂBLÉ | ✔ visible |
| 154 | `acc-notif` | A∩B | index.html:3106 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 155 | `push-status-label` | A∩B | index.html:3109 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 156 | `chev-acc-danger` | A∩B | index.html:3117 | oui | ✅ CÂBLÉ | ✔ visible |
| 157 | `acc-danger` | A∩B | index.html:3119 | oui | ✅ CÂBLÉ | ✔ visible |
| 158 | `appVersionLine` | A∩B | index.html:3138 | oui | ✅ CÂBLÉ | ✔ visible |
| 159 | `tab-profil-badges` | A∩B | index.html:3144 | oui | ✅ CÂBLÉ | ✔ visible |
| 160 | `profil-badges-content` | A∩B | index.html:3145 | oui | ✅ CÂBLÉ | ✔ visible |
| 161 | `settingsMenstrualSection` | A∩B | app.js:18136 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 162 | `menstrualStartDate` | A∩B | app.js:18157 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 163 | `menstrualCycleLength` | A∩B | app.js:18162 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 164 | `settingsHealthConnect` | A∩B | app.js:18177 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 165 | `settingsWeightCut` | A∩B | app.js:18208 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 166 | `wc-start-weight` | A∩B | app.js:18228 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 167 | `wc-target-weight` | A∩B | app.js:18231 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 168 | `wc-current-weight` | A∩B | app.js:18235 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 169 | `wc-competition-date` | A∩B | app.js:18239 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 170 | `toggle-creatine` | A∩B | app.js:18258 [renderSettingsProfile] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 171 | `settingsBarWeightSection` | A∩B | app.js:18276 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 172 | `settings-bar-weight` | A∩B | app.js:18296 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 173 | `settingsHybridSection` | A∩B | app.js:18310 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 174 | `toggle-hybrid` | A∩B | app.js:18323 [renderSettingsProfile] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 175 | `settingsRGPDSection` | A∩B | app.js:18334 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 176 | `settingsMorphoSection` | A∩B | app.js:18347 [renderSettingsProfile] | oui | ✅ CÂBLÉ | ✔ visible |
| 177 | `bwg<n>` ×11 | A∩B | app.js:16767 [renderBodyWeightChart] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 178 | `muscleFatigueTooltip` | A∩B | app.js:9719 [renderMuscleHeatmap] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 179 | `consentHealthOverlay` | A seul | app.js:1558 [showConsentModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 180 | `glossaryModal` | A seul | app.js:1226 [showGlossaryModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 181 | `prog-section-<n>` | A∩B | app.js:3877 [renderExoEditor] | oui | ✅ CÂBLÉ | ✔ visible |
| 182 | `prog-chev-<n>` | A∩B | app.js:3887 [renderExoEditor] | oui | ✅ CÂBLÉ | ✔ visible |
| 183 | `prog-body-<n>` | A∩B | app.js:3890 [renderExoEditor] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 184 | `prog-exo-list-<n>` | A∩B | app.js:3891 [renderExoEditor] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 185 | `prog-add-<n>` | A∩B | app.js:3902 [renderExoEditor] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 186 | `garmin-csv-input` | A seul | app.js:18435 [showGarminCSVImport] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 187 | `jeux-profil-joueur` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 188 | `gamLevelCard` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 189 | `gamXPSources` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 190 | `gamChallenges` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 191 | `gamMonthlyChallenges` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 192 | `gamHeatmap` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 193 | `jeux-rangs` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 194 | `anatomyCard` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 195 | `btn-body-front` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 196 | `btn-body-back` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 197 | `btn-body-gender` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 198 | `body-figure-container` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 199 | `muscle-list` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 200 | `antagonistAlerts` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 201 | `gamSBDRanks` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 202 | `gamStrengthContent` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 203 | `sg<n>` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 204 | `jeux-badges` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 205 | `gamRecentBadges` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 206 | `gamNextBadges` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 207 | `gamBadgesOverview` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 208 | `gamBadgesSections` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 209 | `bdgSec<n>` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 210 | `gamLeaderboard` | B seul |  | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |

## PHASE 2 bis — 50 BLOCS SANS `id` (ce que la v2 ne comptait pas)

| # | Bloc | Occ. | Visible | Contenu | Périmètre | Verdict |
|---|---|---|---|---|---|---|
| 211 | `button.settings-toggle-btn` | 35 | oui | « 💪 Masse » | Profil | ✅ CÂBLÉ |
| 212 | `div.glossary-item` | 19 | oui | « RPE (Rate of Perceived Exertion)ℹ️ » | Profil | ✅ CÂBLÉ |
| 213 | `div.bdg-sec-head` | 17 | non | « 🔮 Quêtes secrètes 6/8▾ » | **recopie Jeux** | ➖ hors périmètre |
| 214 | `button.btn` | 16 | oui | « OK » | Profil | ✅ CÂBLÉ |
| 215 | `div.bdg-sec-body` | 16 | non | « 🔒???Quête secrète non révélée🔒?? » | **recopie Jeux** | ➖ hors périmètre |
| 216 | `div.weight-history-item` | 10 | oui | « 29/07 » | Profil | ✅ CÂBLÉ |
| 217 | `div.acc-card` | 10 | oui | « 👤Profil Athlète▾ » | Profil | ✅ CÂBLÉ |
| 218 | `div.corps-acc` | 8 | oui | « ⚡ » | Profil | ✅ CÂBLÉ |
| 219 | `div.prog-day-section-header` | 7 | oui | « 🦵 Lundi » | Profil | ✅ CÂBLÉ |
| 220 | `div.prog-exo-add-row` | 7 | non | « + Ajouter » | Profil | ✅ conditionnel |
| 221 | `button.settings-toggle-btn.active` | 7 | oui | « 🏋️ Force » | Profil | ✅ CÂBLÉ |
| 222 | `div.mc` | 6 | oui | « 📊 Sources d'XP » | **recopie Jeux** | ➖ hors périmètre |
| 223 | `div.gam-separator` | 4 | oui | « ✦ ─── ✦ ─── ✦ » | **recopie Jeux** | ➖ hors périmètre |
| 224 | `div.sg-page` | 4 | non | « Leg Curl AssisÉlie1RM 79kg · 0.81× » | **recopie Jeux** | ➖ hors périmètre |
| 225 | `div.nutri-macro-bar` | 3 | oui | « Glucides » | Profil | ✅ CÂBLÉ |
| 226 | `span.voir-plus-btn` | 3 | non | « voir + » | **recopie Jeux** | ➖ hors périmètre |
| 227 | `div.subkeys-panel` | 3 | non | « Pectoraux hauts7.9tSculptéPectorau » | **recopie Jeux** | ➖ hors périmètre |
| 228 | `div.sbd-rank-detail-tier` | 3 | non | « Guerrier » | **recopie Jeux** | ➖ hors périmètre |
| 229 | `div.sbd-rank-detail-e1rm` | 3 | non | « 158 kg » | **recopie Jeux** | ➖ hors périmètre |
| 230 | `div.sbd-rank-detail-pct` | 3 | non | « Top 43% mondial » | **recopie Jeux** | ➖ hors périmètre |
| 231 | `div.sg-dot` | 3 | non | «  » | **recopie Jeux** | ➖ hors périmètre |
| 232 | `div.nav-fade-wrap` | 2 | oui | « ⚖️ Corps » | Profil | ✅ CÂBLÉ |
| 233 | `div.corps-acc-inner` | 2 | oui | « OK » | Profil | ✅ CÂBLÉ |
| 234 | `div.body-metric-label` | 2 | oui | « IPF GL POINTS » | Profil | ✅ CÂBLÉ |
| 235 | `div.corps-acc-info` | 1 | oui | « Score de Forme ⓘ » | Profil | ✅ CÂBLÉ |
| 236 | `div.forme-score-wrap` | 1 | oui | « 65 » | Profil | ✅ CÂBLÉ |
| 237 | `div.tl-numbers` | 1 | oui | « 5 » | Profil | ✅ CÂBLÉ |
| 238 | `div.tl-gauge-bg` | 1 | oui | «  » | Profil | ✅ CÂBLÉ |
| 239 | `div.tl-gauge-labels` | 1 | oui | « Repos » | Profil | ✅ CÂBLÉ |
| 240 | `span.tl-status` | 1 | oui | « ✓ Zone optimale » | Profil | ✅ CÂBLÉ |
| 241 | `div.weight-trend-row` | 1 | oui | « 97.9 kg » | Profil | ✅ CÂBLÉ |
| 242 | `div.weight-avg` | 1 | oui | « 97.9 kg » | Profil | ✅ CÂBLÉ |
| 243 | `div.weight-avg-sub` | 1 | oui | « Moyenne 7 jours » | Profil | ✅ CÂBLÉ |
| 244 | `div.nutri-ring-wrap` | 1 | oui | « 0 » | Profil | ✅ CÂBLÉ |
| 245 | `div.nutri-three-cols` | 1 | oui | « 2650 » | Profil | ✅ CÂBLÉ |
| 246 | `div.nutri-targets-row` | 1 | oui | « TDEE estimé: 2672 kcal » | Profil | ✅ CÂBLÉ |
| 247 | `div.macro-row` | 1 | oui | « PROT (G) » | Profil | ✅ CÂBLÉ |
| 248 | `div.macro-hist-wrap` | 1 | oui | « J » | Profil | ✅ CÂBLÉ |
| 249 | `div.ai-response-content` | 1 | oui | « 💤 RÉCUPÉRATION » | Profil | ✅ CÂBLÉ |
| 250 | `div.ai-timestamp` | 1 | oui | « Coach Algo • Calcul instantané • S » | Profil | ✅ CÂBLÉ |
| 251 | `div.acc-header` | 1 | oui | « ⭐Statut & Thèmes▾ » | Profil | ✅ CÂBLÉ |
| 252 | `button.btn.btn-secondary` | 1 | oui | « 🔄 Nettoyer le feed (migration) » | Profil | ✅ CÂBLÉ |
| 253 | `div.lvl-card.lvl-card-v2` | 1 | oui | « 🏛️ » | **recopie Jeux** | ➖ hors périmètre |
| 254 | `div.quest-card` | 1 | oui | « ⚡ Quêtes de la semaine » | **recopie Jeux** | ➖ hors périmètre |
| 255 | `div.quest-arc` | 1 | oui | « 🏔 Arcs du mois » | **recopie Jeux** | ➖ hors périmètre |
| 256 | `div.mc-title` | 1 | non | « 💪 Muscles » | **recopie Jeux** | ➖ hors périmètre |
| 257 | `div.sg-dot.active` | 1 | non | «  » | **recopie Jeux** | ➖ hors périmètre |
| 258 | `div.bdg-overview` | 1 | non | « 53 / 159Badges débloquésCommun 16/ » | Profil | ✅ conditionnel |
| 259 | `div.bc-scroll` | 1 | non | « 🔮 Secrètes 6/8🎯 Séances 10/12💪  » | Profil | ✅ conditionnel |
| 260 | `div.bdg-sec-body.open` | 1 | non | « Commun🎯Première MarqueundefinedPr » | **recopie Jeux** | ➖ hors périmètre |
**Décompte total : 210 + 50 = 260 verdicts.** Dont **41 ➖ hors périmètre** (recopie de l'onglet Jeux).
**Périmètre Profil net : 219.**

### Ce que les blocs sans `id` révèlent

| Bloc | Occ. | Ce que ça mesure |
|---|---|---|
| `button.settings-toggle-btn` | **35** | tous les groupes de boutons des Réglages (objectifs, fréquence, jours, matériel, durée, supersets, blessures, cardio) — **35 boutons que l'inventaire v2 ne comptait pas** |
| `div.glossary-item` | **19** | les 19 entrées du Glossaire — la v2 notait « accordéon non audité champ par champ » |
| `button.btn` | 16 | boutons d'action des accordéons |
| `div.weight-history-item` | 10 | lignes de l'historique de poids |
| `div.acc-card` | 10 | les 10 cartes d'accordéon des Réglages |
| `div.corps-acc` | 8 | les 8 accordéons du sous-onglet Corps |
| `div.prog-day-section-header` | 7 | en-têtes de jour de l'éditeur de routine |
| `div.prog-exo-add-row` | 7 | « + Ajouter » par jour — **invisibles** au repos |
| `div.nutri-macro-bar` | 3 | barres Glucides / Protéines / Lipides |

**Le Glossaire (19 entrées) et les 35 boutons de réglage** étaient explicitement listés comme
« non audités champ par champ » dans la note de couverture de la v2. Ils le sont désormais.

---

## PHASE 3 — CROISEMENT INVERSE

**Inchangée.** L'union porte sur les *éléments d'interface*, pas sur les *champs* : le balayage des
58 champs de `db.user` et des clés de premier niveau reste celui de `cablage-vague1-profil-v2.md` §3.
Ses conclusions tiennent : `targetBW` donnée morte · `coachEnabled`, `navMode`, `medicalConsentDate`,
`_swipeResults` données mortes · `plannedTestDate`, `trainingDuration`, `tdee`,
`nutritionStrategyStartDate`, `plan`, `streak`, `lastModified` champs fantômes ·
`db.exercises[].e1rm` pilote les charges sans aucune interface de correction.

---

## PHASE 5 — RUNTIME

17 états, banc `audit/runtime/`, réseau **intégralement stubbé**, Service Worker bloqué, fixtures
tatouées (garde anti-fuite RC4).

| Statut | Nombre |
|---|---|
| ✔ visible au repos | 137 |
| ✔ conditionnel (révélé par l'état ou l'action) | 49 |
| ⊘ jamais rendu sur mes états (3 A-seul) | 3 |
| ➖ hors périmètre (recopie Jeux) | 41 |
| autres (blocs conditionnels) | 30 |
| **Total** | **260** |

**Aucune ligne sans statut.**

Les constats **F1 à F19** de la v2 restent valides et ne sont pas répétés — ils portent sur la chaîne
de données et sur des éléments déjà inventoriés. **F19 (Weight Cut, porte circulaire) est confirmé une
troisième fois** : `settingsWeightCut` et ses 5 champs n'apparaissent que dans l'état « weightCut actif »
semé artificiellement, jamais sur les profils réels.

---

## Angles morts de cette vague

- **Au-delà de la première confirmation de suppression de compte** : Edge Function, `_deleteAccountDecision`,
  purge locale — non exercés (aucune suppression déclenchée sur ce banc).
- **Les 3 overlays A-seul** (consentement santé, glossaire, import Garmin) : existence et point d'entrée
  établis, contenu interne non audité.
- **L'auto-contrôle a priori est moins indépendant ici** (estimation écrite après l'exécution de la
  source B) — cf. supra.
- **Aucun device Android réel.** Aucune donnée Supabase consultée.

## À VÉRIFIER CÔTÉ SUPABASE

1. **Chaîne RGPD complète** — la seule partie non testable sur ce banc. Sur un **compte jetable** :
   le bouton « Supprimer définitivement » efface-t-il bien `sbd_profiles`, `workout_sessions`,
   `profiles`, `activity_feed`, `comments`, `reactions`, `friendships` — et l'auth user ?
   (`delete_user_complete_data()` + Edge Function `delete-account`.)
2. La garde `if (!_dec.purge)` (app.js:1895) empêche-t-elle réellement la purge locale quand le serveur
   échoue ? À vérifier en provoquant un échec côté Edge Function.
