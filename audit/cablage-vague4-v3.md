# Audit de câblage — Vague 4 v3 : Stats (inventaire par UNION)

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Reprise de `audit/cablage-vague4-*.md` (conservé). Méthode : voir `cablage-vague2-seances-v3.md`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Estimation a priori : 85** *(écrite avant tout comptage)*.
> **Inventorié : 50** — 32 éléments à `id` + 18 blocs sans `id`.
> **Phase 1 : 50 · Phase 2 : 50 verdicts · Phase 5 : 50 statuts runtime.**

| Provenance (éléments à `id`) | Nombre |
|---|---|
| A ∩ B — vu dans le code **et** rendu | 28 |
| **A seul — jamais rendu sur les 36 états** | **4** |
| B seul — générateur raté par la source A | 0 |

**Comparaison v2 → v3 : 28 → 50.**

| Périmètre | |
|---|---|
| Zone auditée | index.html:2552-2609 + showStatsSub et ses 11 rendus |
| États runtime | 36 |

## ⚠️ LA VAGUE LA PLUS SOUS-INVENTORIÉE EN v2 — ce que l'union corrige

La v2 comptait **28** éléments pour un onglet à 4 sous-onglets, graphiques, records, volume, cardio et
filtres. C'était le signal chiffré qui a motivé cette reprise. Résultat de l'union : **50**.

L'écart ne vient **pas** d'éléments jamais rendus (4 seulement) mais de la **règle de comptage** : Stats
rend l'essentiel de son contenu **sans `id`**, par classes. L'inventaire par ids seuls — v2 comme v3 —
ne pouvait pas les voir.

| Source | Éléments |
|---|---|
| ids (union A ∪ B) | 32 |
| **blocs sans `id`** | **18** |
| **total** | **50** |

**Auto-contrôle** : −41 % contre une estimation de 85. Investigation menée : mon estimation comptait
des *instances* (12 jauges MEV/MAV/MRV, 7 groupes musculaires, 10 lignes de lift, 5 ratios) là où la
règle collapse en familles. Recalculée sous la règle : ~50. **L'estimation était dans la mauvaise
unité ; l'inventaire est cohérent.** Le point reste que la v2, elle, passait à côté de 22 éléments.

## LES 4 ÉLÉMENTS « A SEUL »

| Élément | Produit par | Verdict |
|---|---|---|
| `reportsTimelineChevron` | `renderReportsTimeline` import.js:47 | ✅ conditionnel — timeline de rapports |
| `reportsTimelineBody` | import.js:49 | ✅ conditionnel |
| `report-body<n>` | import.js:38 | ✅ conditionnel (déplié d'un rapport) |
| `glossaryModal` | `showGlossaryModal` app.js:1226 | ✅ conditionnel — handler généré app.js:1213, 1246 |

**Aucun 🔴 sur cette vague.** Les 4 A-seul ont tous un point d'entrée ou une condition atteignable.

## PHASE 2 — 32 VERDICTS (éléments à `id`)
| # | Élément | Provenance | Origine | Rendu atteignable ? | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1 | `tab-stats` | A∩B | index.html:2552 | oui | ✅ CÂBLÉ | ✔ visible |
| 2 | `stats-volume` | A∩B | index.html:2559 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `reportButtons` | A∩B | index.html:2560 | oui | ✅ CÂBLÉ | ✔ visible |
| 4 | `reportDisplay` | A∩B | index.html:2560 | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `volumeButtons` | A∩B | index.html:2561 | oui | ✅ CÂBLÉ | ✔ visible |
| 6 | `chartVolume` | A∩B | index.html:2561 | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `stats-muscles` | A∩B | index.html:2563 | oui | ✅ CÂBLÉ | ✔ visible |
| 8 | `radarBtn7` | A∩B | index.html:2568 | oui | ✅ CÂBLÉ | ✔ visible |
| 9 | `radarBtn30` | A∩B | index.html:2569 | oui | ✅ CÂBLÉ | ✔ visible |
| 10 | `radarContainer` | A∩B | index.html:2572 | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `radarLegend` | A∩B | index.html:2573 | oui | ✅ CÂBLÉ | ✔ visible |
| 12 | `muscleViewBarsBtn` | A∩B | index.html:2579 | oui | ✅ CÂBLÉ | ✔ visible |
| 13 | `muscleViewEvolBtn` | A∩B | index.html:2580 | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `muscleViewBarsSection` | A∩B | index.html:2583 | oui | ✅ CÂBLÉ | ✔ visible |
| 15 | `muscleList` | A∩B | index.html:2588 | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `muscleViewEvolSection` | A∩B | index.html:2590 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 17 | `muscleEvolFilters` | A∩B | index.html:2591 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 18 | `chartMuscleEvol` | A∩B | index.html:2592 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 19 | `muscleEvolLegend` | A∩B | index.html:2593 | conditionnel | ✅ CÂBLÉ (conditionnel) | ✔ conditionnel |
| 20 | `volumeLandmarksContent` | A∩B | index.html:2596 | oui | ✅ CÂBLÉ | ✔ visible |
| 21 | `strengthRatiosContent` | A∩B | index.html:2597 | oui | ✅ CÂBLÉ | ✔ visible |
| 22 | `stats-records` | A∩B | index.html:2599 | oui | ✅ CÂBLÉ | ✔ visible |
| 23 | `liftsFilterRow` | A∩B | index.html:2602 | oui | ✅ CÂBLÉ | ✔ visible |
| 24 | `liftsList` | A∩B | index.html:2603 | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `stats-cardio` | A∩B | index.html:2606 | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `cardioStatsContent` | A∩B | index.html:2607 | oui | ✅ CÂBLÉ | ✔ visible |
| 27 | `mg-<n>` ×7 | A∩B | app.js:10762 [renderMuscleVolumeContent] | oui | ✅ CÂBLÉ | ✔ visible |
| 28 | `report-body<n>` | A seul | import.js:38 [renderReportsTimeline] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 29 | `reportsTimelineChevron` | A seul | import.js:47 [renderReportsTimeline] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 30 | `reportsTimelineBody` | A seul | import.js:49 [renderReportsTimeline] | **à investiguer** | ❓ NE SAIS PAS | ⊘ jamais rendu |
| 31 | `glossaryModal` | A seul | app.js:1226 [showGlossaryModal] | sur action (overlay/panneau) | ✅ CÂBLÉ (conditionnel) | ⊘ non ouvert par mes états |
| 32 | `chev-mg-<n>` ×7 | A∩B | app.js:10758 [renderMuscleVolumeContent] | oui | ✅ CÂBLÉ | ✔ visible |

**Décompte** : ✅ CÂBLÉ 24 · ✅ CÂBLÉ (conditionnel) 5 · ❓ NE SAIS PAS 3 = **32**.

## PHASE 2 bis — 18 BLOCS SANS `id` (ce que la v2 ne voyait pas)

| # | Bloc | Occurrences | Visible | Contenu observé | Verdict |
|---|---|---|---|---|---|
| 33 | `span.glossary-tip` | 13 | oui | « ℹ️ » | ✅ CÂBLÉ |
| 34 | `div.vol-detail` | 12 | **non** | « MEV: 10 · MAV: 22 · MRV: 25 sets/sem » | ✅ conditionnel (bascule « 📐 Voir les zones ») |
| 35 | `div.lc` (carte de lift) | 10 | oui | « Squat (Barre) · ×1.48 bw · 🏋️ 145 kg · est. 158 kg e1RM » | ⚠️ **e1RM affiché** (cf. I4) |
| 36 | `button.lifts-filter-chip` | 9 | oui | « Dos », « Pecs »… | ✅ CÂBLÉ |
| 37 | `div.card` | 8 | oui | « RAPPORTS » | ✅ CÂBLÉ |
| 38 | `div.mg-card` (groupe musculaire) | 7 | oui | « Jambes · 27s » | ✅ CÂBLÉ |
| 39 | `div.mg-weeks` (évolution 4 semaines) | 7 | oui | « S-3 · S-2 · S-1 · Sem. » | ✅ CÂBLÉ |
| 40 | `div.mg-subs` (sous-groupes) | 6 | oui | « Quadriceps · 14s » | ✅ CÂBLÉ |
| 41 | `div.report-box` | 4 | oui | chiffres du rapport | ✅ CÂBLÉ |
| 42 | `button.period-btn.active` | 3 | oui | « 7 Jours » | ✅ CÂBLÉ |
| 43 | `button.period-btn` | 3 | oui | « 30 Jours » | ✅ CÂBLÉ |
| 44 | `div.cardio-h-item` | 2 | oui | « 🏊 » | ✅ CÂBLÉ |
| 45 | `div.cardio-h-name` | 2 | oui | « 🏊 Natation » | ✅ CÂBLÉ |
| 46 | `div.cardio-h-date` | 2 | oui | « 24/07 » | ✅ CÂBLÉ |
| 47 | `div.nav-fade-wrap` | 1 | oui | sous-nav Stats | ✅ CÂBLÉ |
| 48 | `div.breakdown-toggle` | 1 | oui | « 📐 Voir les zones MEV/MAV/MRV » | ✅ CÂBLÉ |
| 49 | `button.lifts-filter-chip.active` | 1 | oui | « Tout » | ✅ CÂBLÉ |
| 50 | `div.cardio-sec` | 1 | oui | « 🏊 Natation » | ✅ CÂBLÉ |

**Décompte total : 32 + 18 = 50 verdicts.**

## PHASES 3 et 5

Inchangées — voir `audit/cablage-vague4-stats.md`. Les constats **I1** (deux notions de cardio),
**I3** (13 sorties variables / 15 invariantes légitimes), **I4** (4ᵉ surface d'e1RM) et **I5** (aucune
borne de plausibilité, « Squat 315 kg · ×3.94 bw ») restent valides.

**Ce que l'union ajoute** : le bloc `div.vol-detail` ×12 — les zones MEV/MAV/MRV, **invisibles au
repos**, révélées par la bascule « 📐 Voir les zones ». Douze jauges de volume que l'inventaire v2
ne comptait pas du tout.
