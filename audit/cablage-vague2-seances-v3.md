# Audit de câblage — Vague 2 v3 : onglet SÉANCES (inventaire par UNION)

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Reprise de `audit/cablage-vague2-seances.md` (conservé) avec l'inventaire corrigé.

## POURQUOI CETTE REPRISE

La v2 inventoriait **par le DOM seul**. Un élément jamais rendu sur les états testés n'entrait donc
jamais dans l'inventaire — et n'obtenait aucun verdict. C'est précisément l'angle mort du verdict
🔴 RENDU INATTEIGNABLE : **Weight Cut (vague 1) n'aurait pas été trouvé par cette méthode.**

L'inventaire est désormais l'**UNION de deux sources indépendantes** :

| Source | Ce qu'elle voit | Outil |
|---|---|---|
| **A — statique** | markup d'`index.html` + handlers inline + **ids produits par le CODE** des fonctions de rendu (template literals, concaténations, `createElement`) | `audit/runtime/source-a.js` |
| **B — dynamique** | DOM réel capturé sur 14 états | `audit/runtime/inventaire-dom.js` |

## CONTRÔLE D'EXHAUSTIVITÉ

> **Estimation a priori : 113 éléments.** *(Plan ~35 · GO ~45 · Log ~20 · Coach ~8 · Analyse ~5,
> écrite avant tout comptage.)*
> **Inventorié : 91.** Écart **−19 %** → sous le seuil d'alerte de 30 %, jugé cohérent.
> **Phase 1 : 91 · Phase 2 : 91 verdicts · Phase 5 : 91 statuts runtime.**

| Provenance | Nombre | Lecture |
|---|---|---|
| **A ∩ B** | **50** | vu dans le code **et** rendu |
| **A seul** | **41** | ⚠️ **jamais rendu sur les 14 états** — c'est la zone que la v2 ne pouvait pas voir |
| **B seul** | **0** | ✔ la source A ne rate plus rien |

**Comparaison v2 → v3 : 54 → 91 éléments (+37, +69 %).**

### Comment « B seul » est passé de 13 à 0

Le prompt impose de **corriger la source A**, pas d'ajouter à la main. Trois correctifs successifs :

1. **Appariement des ids dynamiques.** La source A ne connaît que le préfixe littéral (`'wrap-' + id`),
   la source B voit l'id complet (`wrap-sc2-3-1782…`). Sans appariement par préfixe, le même élément
   comptait deux fois — une fois « A seul », une fois « B seul ».
2. **Fermeture d'appels trop courte.** À profondeur 2, `renderGoExoCard`, `renderWhyButton` et
   `_goRpeSliderHTML` n'étaient pas atteints → 13 « B seul ». Racines ajoutées explicitement.
3. **Familles de suffixe variable.** `why-btn-squat_barre_` et `why-btn-rowing_barre` sont **un**
   élément, pas deux : le suffixe est un nom d'exercice encodé.

### Barrière inter-surfaces (correctif de méthode)

À profondeur 3 sans barrière, la fermeture ramenait `renderSettingsProfile` (Réglages, vague 1),
`_renderGamBadges` (Jeux, vague 5) et `renderMuscleVolumeContent` (Stats) — soit ~20 éléments **hors
périmètre** qui gonflaient artificiellement le compte à 110. `source-a.js` embarque désormais une
liste d'arrêt aux racines de rendu des autres surfaces (`ARRET_PAR_DEFAUT`). **Sans elle, le contrôle
d'exhaustivité aurait été trompeusement « cohérent ».**

## RÈGLE DE COMPTAGE (identique aux 4 vagues)

1 élément = 1 id unique **ou** 1 famille. Sont regroupés en familles :
- suffixes sériés (`grind-btn-0-1`, `wrap-sc2-3-<ts>`) → `×n` noté ;
- ids aléatoires (`sg<random>`, `ectip<random>` — dégradés et infobulles SVG, app.js:10404-10405) ;
- suffixes porteurs d'une donnée (nom d'exercice encodé : `why-btn-<exo>`).

---

## LA SECTION QUI N'EXISTAIT PAS EN v2 — LES 41 ÉLÉMENTS « A SEUL »

Chacun est présent dans le code et **n'a été rendu sur aucun des 14 états**. Le triage remonte, pour
chaque élément, la fonction qui le produit puis ses appelants, jusqu'à un point d'entrée d'interface
(`audit/runtime/triage-aseul.js`).

### Groupe 1 — Overlays et panneaux à ouverture explicite : **23 éléments, point d'entrée UI trouvé**

| Fonction | Éléments | Point d'entrée |
|---|---|---|
| `goOpenSearch` | `goSearchOverlay`, `goSearchInput`, `goEquipBtn(+Label)`, `goMuscleBtn(+Label)`, `goEquipPanel`, `goMusclePanel`, `goSearchResults` — **9** | handler généré app.js:28797, 31527 |
| `goShowPlateCalc` | `plateCalcOverlay`, `plateCalcWeight`, `plateCalcBarSelect`, `plateCalcResult` — **4** | handler généré app.js:29294 |
| `renderExoLibrary` | `exoLibraryPanel`, `exoLibSearch` | app.js:13382, 13388, 13396 |
| `goOpenWizard` | `goWizardOverlay`, `goWizardContent` | app.js:32001 |
| `openAdjustSession` | `adjustSessionOverlay` | app.js:12508, 12838 |
| `showGarminCSVImport` | `garmin-csv-input` | app.js:18406 |
| `showGlossaryModal` | `glossaryModal` | app.js:1213, 1246 |
| `editLiftTarget` | `editTgtInput` | app.js:20595 |
| `openSessionPhotoPicker` | `photoPickerOverlay` | app.js:30801, 30816 |
| `renderProgrammeV2` | `pgmDaysContainer` | app.js:11434 |

**Verdict : ✅ CÂBLÉ (conditionnel).** Ils ne sont pas inatteignables — mes 14 états ne les ont pas
ouverts. **C'est une limite de ma couverture d'états, pas un défaut de l'app**, et la v2 les aurait
purement et simplement omis de l'inventaire.

### Groupe 2 — Rendu dans un conteneur masqué : **2 éléments, 🔴 CONFIRMÉ**

`prog-chev<n>` et `prog-body<n>` (app.js:15073-15074, `renderProgramViewer`).

```js
function renderProgramViewer() {                       // app.js:15054
  const card   = document.getElementById('programViewerCard');   // ← n'existe NULLE PART
  const viewer = document.getElementById('programViewer');       // ← dans le bloc display:none
```
- **`programViewerCard` n'existe dans aucun fichier** (0 occurrence hors de cette ligne).
- **`programViewer`** est l'un des 14 conteneurs du bloc `<div style="display:none;">` d'`index.html:2469`
  (« IDs conservés pour compatibilité ») — relevé en **vague 3, H6**.

`renderProgramViewer` a **5 appelants réels** (`obFinish` app.js:3728, `refreshUI` 8730/8734/8737…) :
elle **s'exécute** et construit son HTML, dans un conteneur qui ne peut pas s'afficher.
**Cross-confirmation entre deux vagues** : la vague 3 avait trouvé le conteneur, la vague 2 v3 trouve
ce qu'on y écrit.

### Groupe 3 — Conditions non couvertes par mes états : **16 éléments**

| Élément | Condition | Statut |
|---|---|---|
| `go-hr-display` | `typeof _currentHR !== 'undefined' && _currentHR` (app.js:28776) — **capteur FC Bluetooth** | ⊘ hors banc |
| `readinessModal`, `checkin-save-btn-modal`, `checkin<n>` | `showReadinessModal` — check-in du jour absent | ✅ conditionnel *(la carte « ☀️ Check-in du jour » a été observée en vague 3)* |
| `checkin-save-btn-coach` | `renderMorningCheckin` retourne `''` si `hasTodayCheckin()` (app.js:23071) | ✅ conditionnel |
| `doms-modal-overlay` | `showDOMSModal`, appelée par `goStartWorkout` (app.js:28401, 28405) | ✅ conditionnel |
| `live-coach-banner` | `showLiveCoachBanner`, appelée par `goToggleSetComplete` / `toggleGrind` | ✅ conditionnel |
| `prOverlayB` | `showPROverlay`, appelée par `goFinishWorkout` (app.js:32723) — **PR battu** | ✅ conditionnel |
| `goResultsItems`, `goResultsSentinel` | `goRenderSearchResults`, dans le panneau de recherche | ✅ conditionnel |
| `coachHist` | `renderCoachHistory` — rapports en historique | ✅ conditionnel |
| `v2BackupsChevron`, `v2BackupsList` | `buildBackupsCollapsibleHtml` — sauvegardes de programme existantes | ✅ conditionnel |
| `phasePill`, `phaseDropdown` | `renderProgramTab` — **5 appelants**, tous internes (`_setPhase`, `renderProgramBuilder`, `_adjustConfirm`, `activateRehabMode`) | ❓ **NE SAIS PAS** — aucun point d'entrée UI direct trouvé ; à investiguer |
| `frt<n>` | `buildGoIdleHtml` (app.js:28073-28074) | ❓ NE SAIS PAS |

---

## PHASE 2 — 91 VERDICTS

| # | Élément | Provenance | Origine | Rendu atteignable ? | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1 | `tab-seances` | A∩B | index.html:2488 | oui | ✅ CÂBLÉ | ✔ visible |
| 2 | `s-coach` | A∩B | index.html:2498 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `coachHistoBadge` | A∩B | index.html:2502 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 4 | `coach-today` | A∩B | index.html:2505 | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `coach-history` | A∩B | index.html:2506 | oui | ✅ CÂBLÉ | ✔ visible |
| 6 | `s-plan` | A∩B | index.html:2510 | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `programmeV2Content` | A∩B | index.html:2511 | oui | ✅ CÂBLÉ | ✔ visible |
| 8 | `programBuilderContent` | A∩B | index.html:2512 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 9 | `s-go` | A∩B | index.html:2516 | oui | ✅ CÂBLÉ | ✔ visible |
| 10 | `goIdleView` | A∩B | index.html:2517 | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `goActiveView` | A∩B | index.html:2518 | oui | ✅ CÂBLÉ | ✔ visible |
| 12 | `s-log` | A∩B | index.html:2522 | oui | ✅ CÂBLÉ | ✔ visible |
| 13 | `prevWeekBtn` | A∩B | index.html:2525 | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `weekRangeLabel` | A∩B | index.html:2527 | oui | ✅ CÂBLÉ | ✔ visible |
| 15 | `weekIndexLabel` | A∩B | index.html:2528 | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `nextWeekBtn` | A∩B | index.html:2530 | oui | ✅ CÂBLÉ | ✔ visible |
| 17 | `weekSessionsContainer` | A∩B | index.html:2532 | oui | ✅ CÂBLÉ | ✔ visible |
| 18 | `s-analyse` | A∩B | index.html:2537 | oui | ✅ CÂBLÉ | ✔ visible |
| 19 | `pgmDaysContainer` | A seul | app.js:12485 [renderProgrammeV2] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 20 | `prog-chev<n>` | A seul | app.js:15073 [renderProgramViewer] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 21 | `prog-body<n>` | A seul | app.js:15074 [renderProgramViewer] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 22 | `plates-<n>` ×3 | A∩B | app.js:29186 [renderGoExoCard] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 23 | `grind-btn-<n>` ×11 | A∩B | app.js:29347 [renderGoExoCard] | oui | ✅ CÂBLÉ | ✔ visible |
| 24 | `abandoned-btn-<n>` ×11 | A∩B | app.js:29348 [renderGoExoCard] | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `why-btn-<n>` | A∩B | app.js:28871 [renderWhyButton] | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `why-answer-<n>` | A∩B | app.js:28881 [renderWhyButton] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 27 | `rpe-val-<n>` ×9 | A∩B | app.js:30138 [_goRpeSliderHTML] | oui | ✅ CÂBLÉ | ✔ visible |
| 28 | `rpe-legend-<n>` ×9 | A∩B | app.js:30145 [_goRpeSliderHTML] | oui | ✅ CÂBLÉ | ✔ visible |
| 29 | `go-t-recap` | A∩B | app.js:27881 [buildGoIdleHtml] | oui | ✅ CÂBLÉ | ✔ visible |
| 30 | `go-t-debrief` | A∩B | app.js:27882 [buildGoIdleHtml] | oui | ✅ CÂBLÉ | ✔ visible |
| 31 | `go-plan-chev` | A∩B | app.js:27945 [buildGoIdleHtml] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 32 | `go-plan-body` | A∩B | app.js:27947 [buildGoIdleHtml] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 33 | `go-debrief-section` | A∩B | app.js:27995 [buildGoIdleHtml] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 34 | `frt<n>` | A seul | app.js:28073 [buildGoIdleHtml] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 35 | `go-recap-view` | A∩B | app.js:28115 [buildGoIdleHtml] | oui | ✅ CÂBLÉ | ✔ visible |
| 36 | `goTimerDisplay` | A∩B | app.js:28715 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 37 | `goCntTonnage` | A∩B | app.js:28749 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 38 | `goCntExos` | A∩B | app.js:28750 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 39 | `goCntSets` | A∩B | app.js:28751 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 40 | `goRestDisplay` | A∩B | app.js:28765 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 41 | `goRestProgress` | A∩B | app.js:28768 [renderGoActiveView] | oui | ✅ CÂBLÉ | ✔ visible |
| 42 | `go-hr-display` | A seul | app.js:28777 [renderGoActiveView] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 43 | `sc-cards-wrap` | A∩B | app.js:16901 [renderSeancesTab] | oui | ✅ CÂBLÉ | ✔ visible |
| 44 | `meso-swipe-wrap` | A∩B | app.js:12357 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 45 | `meso-progress-bar` | A∩B | app.js:12363 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 46 | `meso-prev-btn` | A∩B | app.js:12368 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 47 | `meso-nav-label` | A∩B | app.js:12372 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 48 | `meso-next-btn` | A∩B | app.js:12374 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 49 | `meso-slide-content` | A∩B | app.js:12380 [renderMesoView] | oui | ✅ CÂBLÉ | ✔ visible |
| 50 | `v2BackupsChevron` | A seul | app.js:12447 [buildBackupsCollapsibleHtml] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 51 | `v2BackupsList` | A seul | app.js:12448 [buildBackupsCollapsibleHtml] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 52 | `adjustSessionOverlay` | A seul | app.js:14803 [openAdjustSession] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 53 | `coachHist` | A seul | app.js:20942 [renderCoachHistory] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 54 | `garmin-csv-input` | A seul | app.js:18435 [showGarminCSVImport] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 55 | `go-fc-widget` | A∩B | app.js:27760 [renderFCWidget] | oui | ✅ CÂBLÉ | ✔ visible |
| 56 | `plateCalcOverlay` | A seul | app.js:31238 [goShowPlateCalc] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 57 | `plateCalcWeight` | A seul | app.js:31245 [goShowPlateCalc] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 58 | `plateCalcBarSelect` | A seul | app.js:31249 [goShowPlateCalc] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 59 | `plateCalcResult` | A seul | app.js:31255 [goShowPlateCalc] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 60 | `goSearchOverlay` | A seul | app.js:31687 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 61 | `goSearchInput` | A seul | app.js:31691 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 62 | `goEquipBtn` | A seul | app.js:31695 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 63 | `goEquipBtnLabel` | A seul | app.js:31695 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 64 | `goMuscleBtn` | A seul | app.js:31696 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 65 | `goMuscleBtnLabel` | A seul | app.js:31696 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 66 | `goEquipPanel` | A seul | app.js:31698 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 67 | `goMusclePanel` | A seul | app.js:31699 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 68 | `goSearchResults` | A seul | app.js:31700 [goOpenSearch] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 69 | `phasePill` | A seul | app.js:12701 [renderProgramTab] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 70 | `phaseDropdown` | A seul | app.js:12715 [renderProgramTab] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 71 | `glossaryModal` | A seul | app.js:1226 [showGlossaryModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 72 | `live-coach-banner` | A seul | app.js:30012 [showLiveCoachBanner] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 73 | `readinessModal` | A seul | app.js:784 [showReadinessModal] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 74 | `checkin-save-btn-modal` | A seul | app.js:800 [showReadinessModal] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 75 | `doms-modal-overlay` | A seul | app.js:876 [showDOMSModal] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 76 | `goResultsItems` | A seul | app.js:31999 [goRenderSearchResults] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 77 | `goResultsSentinel` | A seul | app.js:32000 [goRenderSearchResults] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 78 | `exoLibraryPanel` | A seul | app.js:13355 [renderExoLibrary] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 79 | `exoLibSearch` | A seul | app.js:13381 [renderExoLibrary] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 80 | `ectip<n>` ×13 | A∩B | app.js:10413 [_buildSparkSVG] | oui | ✅ CÂBLÉ | ✔ visible |
| 81 | `sg<n>` ×13 | A∩B | app.js:10415 [_buildSparkSVG] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 82 | `editTgtInput` | A seul | app.js:20870 [editLiftTarget] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 83 | `checkin-save-btn-coach` | A seul | app.js:23075 [renderMorningCheckin] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 84 | `checkin<n>` | A seul | app.js:22967 [buildCheckinFormHtml] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 85 | `goWizardOverlay` | A seul | app.js:32134 [goOpenWizard] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 86 | `goWizardContent` | A seul | app.js:32159 [goOpenWizard] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 87 | `photoPickerOverlay` | A seul | app.js:30680 [openSessionPhotoPicker] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 88 | `prOverlayB` | A seul | app.js:33211 [showPROverlay] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 89 | `wrap-sc2-<n>` ×13 | A∩B | app.js:17001 [renderSessionCard2] | oui | ✅ CÂBLÉ | ✔ visible |
| 90 | `menu-sc2-<n>` ×13 | A∩B | app.js:17017 [renderSessionCard2] | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 91 | `det-sc2-<n>` ×13 | A∩B | app.js:17024 [renderSessionCard2] | oui | ✅ CÂBLÉ | ✔ visible |

**Décompte** : ✅ CÂBLÉ 41 · ✅ CÂBLÉ (conditionnel) 32 · ❓ NE SAIS PAS 18 = **91**.
*(La colonne « Verdict » est produite mécaniquement par le triage ; les 18 ❓ sont détaillés en
groupes 2 et 3 ci-dessus — dont 2 tranchés 🔴 après investigation manuelle : `prog-chev<n>`,
`prog-body<n>`.)*
Runtime : ✔ visible 41 · ✔ conditionnel 9 · ⊘ jamais rendu sur mes états 41 = **91**.
**Aucune ligne sans statut.**

---

## PHASE 3 — CROISEMENT INVERSE

Inchangée par rapport à la v2 (l'union porte sur les *éléments*, pas sur les *champs*) — voir
`audit/cablage-vague2-seances.md` §PHASE 3. Le point central y reste : **`db.routineExos` décide du
contenu de chaque séance et n'a aucune surface de consultation.**

## PHASE 5 — RUNTIME

Les 50 éléments A∩B portent le statut mesuré sur les 14 états (banc `audit/runtime/`, réseau
intégralement stubbé). Les 41 A-seul portent `⊘ jamais rendu sur mes états`, avec la raison
(overlay non ouvert · capteur absent · condition non provoquée · conteneur masqué).

**Les constats G1 à G5 de la v2 restent valides et ne sont pas répétés ici** — ils portaient sur la
*chaîne de données*, que ce correctif d'inventaire ne modifie pas :
G1 crash `wpApplyDay` · G2 séance construite depuis `routineExos` · G3 `s-go` sans pilule ·
G4 `activeWorkout` hors sync · G5 pont PR #246 fonctionnel.

## Angles morts

- **Les 23 overlays du groupe 1 n'ont pas été ouverts** : leur contenu interne n'est donc pas audité,
  seulement leur existence et leur point d'entrée. Une vague dédiée aux overlays serait nécessaire.
- `go-hr-display` : capteur Bluetooth, hors banc.
- `phasePill` / `phaseDropdown` / `frt<n>` : ❓ assumés, non tranchés.
- **Aucun device Android réel.**
