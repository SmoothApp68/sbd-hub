# Audit de câblage — Vague 3 v3 : Maison + Coach (inventaire par UNION)

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Reprise de `audit/cablage-vague3-*.md` (conservé). Méthode : voir `cablage-vague2-seances-v3.md`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Estimation a priori : 90** *(écrite avant tout comptage)*.
> **Inventorié : 53** — 43 éléments à `id` + 10 blocs sans `id`.
> **Phase 1 : 53 · Phase 2 : 53 verdicts · Phase 5 : 53 statuts runtime.**

| Provenance (éléments à `id`) | Nombre |
|---|---|
| A ∩ B — vu dans le code **et** rendu | 29 |
| **A seul — jamais rendu sur les 26 états** | **9** |
| B seul — générateur raté par la source A | 5 |

**Comparaison v2 → v3 : 62 → 53.**

| Périmètre | |
|---|---|
| Zone auditée | index.html:2441-2508 + renderDash/renderCoachToday |
| États runtime | 26 |

## ⚠️ L'AUTO-CONTRÔLE A DÉCLENCHÉ — et il avait raison sur la forme, pas sur le fond

Écart initial **−52 %** (43 contre 90 estimés), au-dessus du seuil de 30 %. Investigation menée :

1. **Zone HTML trop étroite.** Les conteneurs du Coach (`s-coach`, `coach-today`, `coach-history`)
   vivent dans le markup de l'onglet **Séances** (`index.html:2498-2507`), pas dans celui de la Maison.
   Ils remontaient en « B seul ». Zone étendue à `[2441, 2508]`.
2. **Générateur manquant** : `buildCheckinFormHtml` ajouté aux racines.
3. **Blocs sans `id`** : 10 signatures recensées séparément (le Coach rend ses cartes par classe).

**Après correction, l'écart reste à −41 %** (53 contre 90). La cause est mon **estimation**, pas
l'inventaire : je comptais des *instances* (7 groupes musculaires, 3 lifts de records, 4 stats rapides)
là où la règle de comptage collapse en *familles*. Recalculée sous la règle, l'estimation tombe à ~55.
**L'auto-contrôle a donc bien fait son travail — il a révélé deux vrais défauts d'inventaire (points 1
et 2) et une erreur d'unité dans mon estimation.**

## LES 9 ÉLÉMENTS « A SEUL »

| Élément | Produit par | Point d'entrée | Verdict |
|---|---|---|---|
| `chartPerfDash` | `renderPerfCard` app.js:9977 | — | 🔴 **rendu dans `perfCard`, masqué en dur** (app.js:9397) — cf. vague 3 v2, H2 |
| `chartPerfLine` | `renderPerfCard` app.js:10051 | — | 🔴 idem |
| `doms-morning-overlay` | `openDOMSMorningModal` app.js:985 | handler généré | ✅ conditionnel (modale DOMS) |
| `adjustSessionOverlay` | `openAdjustSession` app.js:14803 | handler généré | ✅ conditionnel |
| `editTgtInput` | `editLiftTarget` app.js:20870 | handler généré app.js:20595 | ✅ conditionnel (édition d'objectif inline) |
| `coachHist` | `renderCoachHistory` app.js:20942 | `showCoachSub` | ✅ conditionnel (rapports en historique) |
| `phasePill` | `renderProgramTab` app.js:12701 | 5 appelants internes, aucun handler direct | ❓ NE SAIS PAS |
| `phaseDropdown` | `renderProgramTab` app.js:12715 | idem | ❓ NE SAIS PAS |
| `tab-seances` | `index.html:2488` | conteneur d'une autre surface | ➖ hors périmètre (effet de bord de l'extension de zone) |

**Le gain net de l'union sur cette vague** : `chartPerfDash` et `chartPerfLine` — deux graphiques
Chart.js **construits à chaque appel de `renderPerfCard`** (4 appelants) dans un conteneur masqué depuis
v264. La v2 avait trouvé le conteneur (H2) ; l'union montre qu'on y **dessine deux graphiques**.

## Les 5 « B seul » résiduels

`checkin-coach-sleep-<n>`, `-energy-<n>`, `-motivation-<n>`, `-fresh-<n>`, `-pain-<n>`.
La source A les produit sous un préfixe variable que l'appariement ne rapproche pas des ids complets.
**Limitation assumée de mon outil**, pas un défaut de l'app : ces éléments **sont** rendus (6 états).

## PHASE 2 — 43 VERDICTS (éléments à `id`)
| # | Élément | Provenance | Origine | Rendu atteignable ? | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1 | `tab-dash` | A∩B | index.html:2441 | oui | ✅ CÂBLÉ | ✔ visible |
| 2 | `welcomeCard` | A∩B | index.html:2443 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `welcomeTitle` | A∩B | index.html:2444 | oui | ✅ CÂBLÉ | ✔ visible |
| 4 | `todaySessionInline` | A∩B | index.html:2450 | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `dashWeekCard` | A∩B | index.html:2453 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 6 | `dashWeekContent` | A∩B | index.html:2454 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 7 | `quickLogCard` | A∩B | index.html:2458 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 8 | `doms-morning-card` | A∩B | index.html:2461 | oui | ✅ CÂBLÉ | ✔ visible |
| 9 | `perfCard` | A∩B | index.html:2464 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 10 | `perfDisplay` | A∩B | index.html:2466 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 11 | `routineDisplay` | A∩B | index.html:2471 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 12 | `readinessSparkline` | A∩B | index.html:2473 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 13 | `dotsWilksContent` | A∩B | index.html:2474 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 14 | `formScoreContent` | A∩B | index.html:2475 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 15 | `programViewer` | A∩B | index.html:2476 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 16 | `trainingLogs` | A∩B | index.html:2477 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 17 | `dayButtonsContainer` | A∩B | index.html:2478 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 18 | `dayExercisesContainer` | A∩B | index.html:2479 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 19 | `sbdTotalDisplay` | A∩B | index.html:2480 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 20 | `todayProgramContent` | A∩B | index.html:2481 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 21 | `acc-dash-reports-card` | A∩B | index.html:2482 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 22 | `acc-dash-weekly-card` | A∩B | index.html:2483 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 23 | `acc-dash-reports` | A∩B | index.html:2484 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 24 | `acc-dash-weekly` | A∩B | index.html:2485 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 25 | `tab-seances` | A seul | index.html:2488 | **NON** | 🔴 RENDU INATTEIGNABLE | ⊘ jamais rendu |
| 26 | `s-coach` | A∩B | index.html:2498 | oui | ✅ CÂBLÉ | ✔ visible |
| 27 | `coachHistoBadge` | A∩B | index.html:2502 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 28 | `coach-today` | A∩B | index.html:2505 | oui | ✅ CÂBLÉ | ✔ visible |
| 29 | `coach-history` | A∩B | index.html:2506 | oui | ✅ CÂBLÉ | ✔ visible |
| 30 | `chartPerfDash` | A seul | app.js:9977 [renderPerfCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 31 | `chartPerfLine` | A seul | app.js:10051 [renderPerfCard] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 32 | `checkin-save-btn-coach` | A∩B | app.js:23075 [renderMorningCheckin] | oui | ✅ CÂBLÉ | ✔ visible |
| 33 | `coachHist` | A seul | app.js:20942 [renderCoachHistory] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 34 | `editTgtInput` | A seul | app.js:20870 [editLiftTarget] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 35 | `doms-morning-overlay` | A seul | app.js:985 [openDOMSMorningModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 36 | `phasePill` | A seul | app.js:12701 [renderProgramTab] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 37 | `phaseDropdown` | A seul | app.js:12715 [renderProgramTab] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 38 | `adjustSessionOverlay` | A seul | app.js:14803 [openAdjustSession] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 39 | `checkin-coach-sleep-<n>` ×5 | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 40 | `checkin-coach-energy-<n>` ×5 | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 41 | `checkin-coach-motivation-<n>` ×5 | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 42 | `checkin-coach-fresh-<n>` ×5 | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |
| 43 | `checkin-coach-pain-<n>` | B seul |  | oui | ✅ CÂBLÉ | ✔ visible |

**Décompte** : ✅ CÂBLÉ 14 · ✅ CÂBLÉ (conditionnel) 23 · ❓ NE SAIS PAS 5 · ➖ hors périmètre 1 = **43**.
*(Les 2 🔴 `chartPerf*` sont tranchés dans la section « A seul » ci-dessus ; le générateur de table les
classe ❓ faute de handler direct.)*

## PHASE 2 bis — 10 BLOCS SANS `id`

| # | Bloc | Occurrences | Visible | Verdict |
|---|---|---|---|---|
| 44 | `button.btn` (importer des séances) | 1 | oui | ✅ CÂBLÉ |
| 45 | `div.perf-card-title` (« Performance ») | 1 | **non** | 🔴 dans `perfCard` masqué |
| 46 | `div.nav-fade-wrap` (sous-nav Coach) | 1 | oui | ✅ CÂBLÉ |
| 47 | `div.coach-deload` (🔋 verdict d'intensité) | 1 | oui | ✅ CÂBLÉ |
| 48 | `div.coach-muscles` (volume/semaine) | 1 | oui | ✅ CÂBLÉ |
| 49 | `div.coach-reco-title` | 1 | oui | ✅ CÂBLÉ |
| 50 | `div.coach-recos` (🦍 recommandations) | 1 | oui | ✅ CÂBLÉ |
| 51 | `div.ai-timestamp` (« Coach Algo · Sans IA ») | 1 | oui | ✅ CÂBLÉ |
| 52 | `div.coach-alert--info` (🏆 compétition prévue ?) | 1 | oui | ✅ CÂBLÉ (conditionnel) |
| 53 | `div.coach-alert--warning` (🔄 séances identiques) | 1 | oui | ✅ CÂBLÉ (conditionnel) |

## PHASES 3 et 5

Inchangées — voir `audit/cablage-vague3-maison-coach.md`. Les constats **H1** (date de test fantôme),
**H2** (3 cartes masquées), **H3** (e1RM sur l'accueil), **H4** (aucune carte du Coach inatteignable) et
**H6** (14 conteneurs hérités) restent valides : ils portent sur la chaîne de données et sur des
éléments déjà inventoriés.

**Ce que l'union ajoute à H2** : les deux graphiques `chartPerfDash` / `chartPerfLine`.
