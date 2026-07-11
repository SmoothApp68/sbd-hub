# APP_AUDIT — Audit global (visuel + chiffres + logique)

> **Audit read-only** (aucun code modifié). Point de départ : le tour manuel d'Aurélien.
> Chaque trouvaille : écran, fichier:ligne, gravité, effort, et risque du fix
> (🟢 = visuel/sûr · 🟡 = touche la logique).
> Le **Coach** est CARTOGRAPHIÉ en section dédiée (chantier séparé, pas de fix proposé ici).

---

## Verdict express sur la liste d'Aurélien

| # | Observation | Verdict |
|---|---|---|
| (a) | Home : jour sélectionné ≠ jour actuel | **Partiellement infirmé** : la timeline surligne bien le jour réel et il est cliquable (app.js:10791-10828). MAIS la carte séance en dessous peut montrer un AUTRE jour (jour de repos → prochain jour d'entraînement, app.js:10867) → sensation de décalage. Voir 🟠-2. |
| (b) | « Records personnels » = e1RM, pas les vrais records | **Confirmé au niveau data** : la carte lit `db.bestPR` (app.js:11037)… mais `db.bestPR` est lui-même rempli d'**e1RM estimés** (recalcBestPR app.js:1721-1729 ← calcE1RM ; detectNewPR app.js:27918-27922 ← Brzycki). Voir 🔴-2. |
| (c) | Séances devrait ouvrir sur Log | **Confirmé** : défaut = `'s-coach'` (app.js:3267). Voir 🟡-1. |
| (d) | Coach trop rempli / contradictoire | **Confirmé** : jusqu'à ~28-30 blocs simultanés, contradictions réelles. Voir section Coach. |
| (e) | « Modifier le plan » peu découvrable | **Partiellement infirmé** : « Modifier le planning » + « ⚡ Nouveau programme » sont visibles dans Séances→Plan (app.js:11735-11742). MAIS deux boutons « Nouveau programme » routent vers deux builders différents. Voir 🟠-7. |
| (f) | Courbes Log incomprises | **Expliqué** : la courbe = e1RM de l'exercice PRINCIPAL de la séance, affichée seulement s'il a ≥ 2 séances historiques avec e1RM valide (app.js:16136-16140, gate app.js:9635). Voir 🟡-5. |
| (g) | PR affichés quand il n'y en a pas | **Confirmé — bug systémique** sur 3 chemins + le badge Log. Voir 🔴-1. |
| (h) | Analyse « bug complètement » | **Infirmé comme crash** : le code est défensif, pas de plantage. En réalité l'onglet est **quasi-vide sans données FC** (tout le contenu dépend de `hrPeak`, app.js:26196-26236) → perçu comme cassé. Voir 🟡-6. |
| (i) | Stats Volume 7/30 jours vs 10/30 séances | **Nuancé** : chaque carte est correctement libellée (Rapports = jours, index.html:2499 ; Tonnage = séances, index.html:2500) mais les deux coexistent sur le même écran avec le même token interne → confusion réelle. Voir 🟠-1. |
| (i) | Stats muscles/records/cardio OK | **Confirmé OK** : radar 7j/30j (app.js:16326), muscles 7j/28j libellé juste (app.js:9902), records 365j fixe (app.js:16544), cardio 30j (app.js:15482). |
| (j) | Corps de base améliorable | **Confirmé** : heatmap artisanale à 17 ellipses, face avant uniquement, pas de variante femme, n'utilise PAS les vrais SVG (app.js:8907-8959). Le beau SVG genré face/dos vit dans… Jeux→Rangs (app.js:5143). Voir 🟡-7. |
| (k) | Réglages très chargés | **Confirmé** : 11 accordéons dont « Profil Athlète » avec ~20+ contrôles + doublons. Voir 🟡-8 et 🟠-8. |
| — | Social / Jeux | Vérifiés au passage : pas de casse détectée (une bizarrerie mineure : le toggle genre du SVG Jeux ne persiste pas, 🟠-9). |

---

## 🔴 BUGS (comportement cassé / faux)

| # | Écran | Description | Fichier:ligne | Gravité | Effort | Risque |
|---|---|---|---|---|---|---|
| 1 | GO + fin de séance + Log | **PR fantômes — systémique.** Tous les chemins PR comparent des **e1RM estimés** entre eux, jamais le vrai poids soulevé : faire plus de reps à un poids PLUS LÉGER déclenche « PR ». (A) toast en série : `calcE1RM(set)` vs meilleur e1RM (28002-28014). (B) modale SBD `detectNewPR` : Brzycki vs `bestPR`, **tire au tout premier set SBD** (currentPR=0 → `e1rm > 0` vrai, 27915) ET **écrase silencieusement `db.bestPR`** avec l'e1RM de n'importe quelle série sous-maximale (27918-27922). (C) célébration fin de séance : `maxRM` vs `maxRM` (31529). (D) badge 🏆 du Log : tire à la **première occurrence** de tout exercice (`_pb[name]||0`=0, 16123) + clé par nom exact (les synonymes créent des faux PR). Note : `exo.repRecords` (vrais records par reps) existe (10068, 10437) mais n'est **jamais utilisé** pour les célébrations. | app.js:28002-28014, 27904-27924, 31515-31556, 16121-16124 | Haute (visible à chaque séance) | Moyen (logique concentrée, 4 sites) | 🟡 |
| 2 | Home « Records personnels » | **`db.bestPR` contaminé par l'e1RM.** La carte lit bien `db.bestPR` (11037), mais ce champ est alimenté par des estimations : `recalcBestPR` ← `exo.maxRM` ← `calcE1RM` (1721-1729, 10437) et le ratchet silencieux de `detectNewPR` (27918-27922). Résultat : « Records personnels » affiche des e1RM, pas des barres réellement soulevées. Fix lié au 🔴-1 (même racine : distinguer *record réel* et *e1RM estimé* dans le modèle de données). | app.js:11037, 1721-1729, 27918-27922 | Haute | Moyen (migration douce de bestPR) | 🟡 |
| 3 | Séances → Log | **Crash latent** : `_buildSparkSVG` itère `log.exercises` sans garde (9628). Un log sans tableau `exercises` (import partiel, donnée corrompue) → TypeError qui casse le rendu des cartes du Log. | app.js:9628 | Moyenne (conditionnelle) | Trivial (1 garde) | 🟢 |
| 4 | Coach (render) | **Effets de bord dans le rendu** : `renderCoachTodayHTML` **écrit dans db et `saveDB()` en plein render** — nudge compétition (19081-19082), **ajustement TDEE appliqué silencieusement** (19255-19257), mention suppléments (19281). Rouvrir l'onglet Coach modifie des données utilisateur. | app.js:19081-19082, 19255-19257, 19281 | Haute (data) | Moyen | 🟡 (→ chantier Coach) |

## 🟠 INCOHÉRENCES chiffres / logique

| # | Écran | Description | Fichier:ligne | Gravité | Effort | Risque |
|---|---|---|---|---|---|---|
| 1 | Stats → Volume | Deux cartes sur le même écran, même token interne `week`/`month`, fenêtres différentes : Rapports = **7/30 jours calendaires** (10021, `getLogsInRange`) vs Tonnage Total = **10/30 dernières séances** (9885-9886, `slice(-limit)`). Pour un pratiquant 3×/sem, « week » = 7 jours d'un côté et ~23 jours de l'autre. Libellés individuellement corrects mais juxtaposition trompeuse. | app.js:9884-9886, 10021 ; index.html:2499-2500 | Moyenne | Petit (harmoniser sur jours OU expliciter) | 🟡 |
| 2 | Home | La timeline surligne **aujourd'hui** (10791-10792) mais la carte séance montre le jour de `getActiveProgramDay()` = prochain jour d'entraînement si aujourd'hui est repos (10740-10761, 10867). Les deux composants « désignent » des jours différents sans l'expliquer. | app.js:10792 vs 10867 | Moyenne | Petit | 🟢 |
| 3 | Home « Records » | Deux systèmes d'e1RM divergents calculés côte à côte dans `renderRecordsPersonnels` : `db.bestPR` (calcE1RM/Brzycki) ET `db.exercises[..].e1rm` (wpCalcE1RM, RPE-aware) — le second est calculé puis **jamais affiché** (code mort qui masque la divergence). | app.js:11000-11009, 11037 | Basse | Trivial (supprimer ou réconcilier) | 🟢 |
| 4 | Séances → Log | Le badge PR est keyé par **nom exact** (16070, 16123) alors que la sparkline du même écran utilise `matchExoName` (synonymes, 9629) — deux politiques de matching sur la même carte. | app.js:16070 vs 9629 | Basse | Petit | 🟡 |
| 5 | Home stats compactes | Tonnage hebdo à sources mixtes : `l.volume` si présent, sinon recalcul depuis `allSets/series` — agrégat hétérogène selon l'âge du log. | app.js:10951-10959 | Basse | Petit | 🟡 |
| 6 | GO vs Log | Deux formules e1RM coexistent selon l'écran (calcE1RM Brzycki simple vs wpCalcE1RM RPE-aware) → le même set peut afficher deux « e1RM » différents selon où on regarde. (Connu de CLAUDE.md §4, mais alimente les incohérences 🔴-1/2/🟠-3.) | app.js:1720, 21950 | Moyenne | (traiter via 🔴-1/2) | 🟡 |
| 7 | Séances → Plan | Deux boutons « Nouveau programme » routent vers **deux builders différents** : `generateWeeklyPlan()` (11739-11741) vs `pbStartGuided()` wizard (12064-12067, écran legacy). | app.js:11739, 12064 | Basse | Petit | 🟡 |
| 8 | Réglages | Doublons de contrôles : fréquence/jours d'entraînement définis à **3 endroits** (Réglages `settingsFreq/Days` 17078-17096, wizard `_pbState` 12211-12224, éditeur routine 3124-3136) ; poids de corps saisi à 2 endroits (`inputBW` index.html:2697 vs `saveBodyEntry` index.html:2609) ; `trainingMode` vs `programMode/coachProfile` sémantiques recouvrantes (17169). | voir lignes | Moyenne | Moyen | 🟡 |
| 9 | Jeux → Rangs | `switchBodyGender` (5280-5285) ne fait que basculer l'affichage local, ne lit/n'écrit pas `db.user.gender` → le SVG peut contredire le genre du profil. | app.js:5280-5285 | Basse | Trivial | 🟢 |

## 🟡 UX / DESIGN

| # | Écran | Description | Fichier:ligne | Gravité | Effort | Risque |
|---|---|---|---|---|---|---|
| 1 | Séances | Ouvre sur **Coach** par défaut (`activeSeancesSub = 's-coach'`). Souhaité : **Log**. (Un restore cloud du dernier sous-onglet existe déjà, 3630-3638.) | app.js:3267 | Moyenne | Trivial | 🟢 |
| 2 | Home | Jour de repos : timeline marque aujourd'hui 💤 pendant que la carte montre un autre jour — ajouter un libellé « Prochaine séance : Jeudi » suffirait à lever la confusion (lié 🟠-2). | app.js:10855-10867 | Moyenne | Petit | 🟢 |
| 3 | Séances → Analyse | Onglet **quasi-vide sans montre FC** : tout le contenu utile dépend de `hrPeak` (26196-26236). Perçu comme « ça bug ». Placeholder à enrichir (expliquer quoi brancher, ou déplacer les 4 liens outils ailleurs, ou masquer l'onglet sans FC). | app.js:26178-26236 | Moyenne | Petit | 🟢 |
| 4 | Séances → Log | Condition d'affichage des courbes jamais communiquée (exo principal + ≥2 historiques). Une mention « courbe dispo après 2 séances » ou une courbe placeholder rendrait ça prévisible. | app.js:16136-16140, 9635 | Basse | Petit | 🟢 |
| 5 | Réglages | Surcharge confirmée : 11 accordéons, « Profil Athlète » concentre ~20+ contrôles (identité + programme + coaching + blessures + cycle). Split en 2-3 accordéons thématiques + dédoublonnage (🟠-8). | index.html:2693-3039 ; app.js:17036-17215 | Moyenne | Moyen | 🟢 |
| 6 | Profil → Corps | Heatmap artisanale (17 ellipses, face avant, unisexe) alors que des SVG anatomiques genrés face/dos existent et sont déjà câblés dans Jeux (5143-5325). Réutiliser `renderBodyFigure` avec coloration fatigue = upgrade visuel majeur à coût modéré. | app.js:8907-8959 vs 5143 | Basse | Moyen | 🟢 |
| 7 | Séances → Plan | Unifier les deux « Nouveau programme » (🟠-7) et harmoniser le libellé (« Modifier le planning » vs attente « Modifier le plan »). | app.js:11735-11742 | Basse | Petit | 🟢 |
| 8 | Coach | Surcharge structurelle : jusqu'à ~28-30 sections empilées sans priorisation globale (seul un `slice(0,3)` local, 19107). → Chantier Coach dédié (carte ci-dessous). | app.js:18617-19347 | Haute | Gros | 🟡 |

---

## SECTION DÉDIÉE — CARTE DU COACH (aucun fix proposé)

**Entrée** : `renderCoachTab()` (18133) → `renderCoachToday()` (18166) → **`renderCoachTodayHTML()` (18617-19347, ~730 lignes** — le « 438L » de CLAUDE.md est périmé). Deux court-circuits : profil `silent` (18619) et cold-start (18624-18657).

### Les 30 blocs (ordre d'affichage)

| # | Bloc | Fonction | Entrées | Condition | Ligne |
|---|---|---|---|---|---|
| 1 | Cold-start + charges calibration | inline | flag cold-start, level | `isColdStart()` (early return) | 18624 |
| 2 | Carte morpho | inline | onboarded, level, morpho | morpho null, ≠débutant | 18665 |
| 3 | Kill-switch / Mode compétition | inline | `db._killSwitchActive` | actif | 18682 |
| 4 | Bilan du matin (check-in) | `renderMorningCheckin` | `hasTodayCheckin()` | pas de check-in aujourd'hui | 18703 |
| 5 | Ghost-log activités d'hier | `getMissingActivityLogs` | template, activityLogs | manquants + non répondu | 18705 |
| 6 | Conseil activité (1 carte **par** activité) | `getActivityRecommendation` | template, interférences | template non vide | 18735 |
| 7 | Churn / réactivation | `detectChurn` (26702) | récence | churning | 18769 |
| 8 | Deload proactif | `getWeeksSinceDeload` (22395) | semaines, level | > seuil 8/10/14 | 18778 |
| 9 | Budget Récupération (TRIMP) | `computeSRS` + loads | TRIMP, loads | load > 0 | 18798 |
| 10 | Interférence croisée | `getCrossInterferencePenalties` | activité d'hier | zones > 0 | 18832 |
| 11 | Tendon tracker | `evaluateJointAlerts` | alertes articulaires | alerte `danger` | 18850 |
| 12 | Momentum (« pousse ! ») | `detectMomentum` (engine:4775) | PRs 7 derniers jours | ≥ 2 PRs | 18860 |
| 13 | Régularité | `getRegularityMessage` (18247) | streak | palier atteint | 18872 |
| 14 | Return-to-play | `getAbsencePenalty` (engine:4809) | jours d'absence | > 7 j | 18883 |
| 15 | Diagnostic Athlétique (multi-alertes) | `analyzeAthleteProfile*` | ratios, volume | diagnosis non vide | 18892 |
| 16 | Auto-tuner volume | `renderAutoTunerCard` | suggestions volume | — | 18923 |
| 17 | Rotation staleness | `renderStalenessRotationCard` | rotation accessoires | — | 18928 |
| 18 | Discovery + Hip-thrust | `renderDiscoveryCards` | exos non essayés | — | 18933 |
| 19 | PhysioManager (cycle) | `getCurrentMenstrualPhase` | phase cycle | activé + phase connue | 18939 |
| 20 | Refeed OU macros nutrition | `getRefeedRecommendation` / `getDailyCaloricTarget` | TDEE, SRS | — | 18966 |
| 21 | Batterie Nerveuse | `getBatteryDisplay(SRS)` (18227) | `computeSRS().score` | toujours | 19035 |
| 22 | Jauges Récup + Volume | inline | heures depuis séance ; volReport | toujours | 19017 |
| 23 | Top-3 alertes adaptatives | inline + `detectSaisiePlateau` | jour, ratios, plateau | profil full/guardrail (slice 3) | 19047 |
| 24 | Blessure persistante | `checkInjuryPersistence` | blessures ≥ 2 sem | alertes | 19109 |
| 25 | Peaking compétition | `generateCompPeakingPlan` | compDate | compDate définie | 19134 |
| 26 | Alerte Deload | `shouldDeload` (20005) | check-in, volume, RPE | needed | 19152 |
| 27 | Recommandations (jusqu'à ~8 lignes) | inline + 6 analyseurs | plan, volume, équilibre, SBD, nutrition, suppléments | toujours (1..N) | 19161 |
| 28 | Volume/semaine par muscle | inline + `getMuscleVolumeTarget` | volReport | présent | 19300 |
| 29 | Tendance SBD | `calcMomentum` | `db.bestPR` | toujours | 19322 |
| 30 | Suggestion Back-Off | `renderBackOffSuggestion` (19349) | lift du jour + top set loggé | conditions remplies | 19342 |

### Contradictions / redondances / logiques douteuses (constatées, non corrigées)

**Conseils opposés simultanés**
- **Momentum (12)** « pousse, 65% de chance de PR » peut cohabiter avec **Deload proactif (8)**, **Alerte deload (26)** et un Diagnostic `danger` (15) — déclencheurs indépendants (PRs 7j vs SRS/semaines/volume).
- **Cycle « ovulatoire : tente un PR »** (19952) vs deload/batterie basse — alors que `computeSRS` applique déjà un `cycleCoeff` (coach.js:800) : le même cycle baisse la batterie ET pousse au max.
- Alerte « garde tes réserves, deadlift demain » (19064) vs Momentum « pousse » vs Back-Off « tente +1 rep » (19398-19401) — trois consignes d'intensité contradictoires possibles dans le même render.

**Même métrique, deux formules**
- « Récupération » ×2 : Batterie (21) = `computeSRS().score` vs jauge Récup (22) = `min(100, heures/48×100)` — wall-clock pur, sans readiness. Désaccord routinier sous des labels quasi identiques (19026 vs 18227).
- Le SRS est affiché deux fois (Refeed 18983 + Batterie) et recalculé ≥ 3 fois par render (18805, refeed, 19018).

**Données douteuses / mortes**
- Momentum compte `exo.newPR || exo.isPR` (engine:4775 zone) — flags dont l'écriture au save n'est pas garantie → bloc potentiellement mort ou périmé.
- `fatigueScore = 100 - srs.score` (19020) calculé, jamais utilisé.
- **ACWR épinglé à 1.0 sous 3 logs chroniques** (coach.js:742) : la composante à 60% du SRS est neutralisée pour la plupart des nouveaux utilisateurs — la « Batterie » n'est en pratique pilotée que par check-in + trend.
- Alertes (23) **hardcodées sur un split précis** (« Mardi = rowing », « Mercredi → deadlift demain », 19064-19071) au lieu de lire `db.weeklyPlan` → peut contredire le vrai plan.

**Redondances**
- Le deload est mentionné dans **jusqu'à 4 blocs** (8, 26, ligne reco 19205, Diagnostic 15).
- Le volume hebdo apparaît 3 fois (jauge 22, recos 27, barres 28) ; Tendance SBD (29) et barres muscles (28) doublonnent Stats ; nutrition (20) doublonne la surface nutrition ; ghost-log (5) et conseils activité (6) se recouvrent.

**Effets de bord dans le render** → 🔴-4 (écritures db + `saveDB()` aux lignes 19081, 19255-19257, 19281).

### Verdict Coach
**Surchargé ET incohérent** : ~28-30 sections empilables sans arbitrage global (aucune priorisation inter-blocs, un seul `slice(0,3)` local), au moins 3 paires de conseils opposés possibles le même jour, 2 définitions de « récupération », 4 mentions deload, des seuils hardcodés sur un split fictif et des mutations d'état pendant le rendu. Base factuelle posée pour un chantier dédié : (1) purifier le render (zéro écriture), (2) un arbitre central d'intensité (un seul message pousser/maintenir/lever le pied), (3) budget de blocs par render, (4) une seule définition de récupération.

---

## ORDRE D'ATTAQUE RECOMMANDÉ (impact / effort / risque)

1. **🔴-1 + 🔴-2 — PR & records réels** (impact max, le bug le plus visible en séance ; moyen, 🟡) : définir *record réel* (poids top set / repRecords) vs *e1RM estimé*, corriger les 4 sites de détection + le badge Log + assainir `db.bestPR` (migration douce). Un seul chantier cohérent.
2. **Quick wins UI 🟢 (1 session)** : 🟡-1 défaut Log (1 ligne), 🔴-3 garde sparkline (1 ligne), 🟠-3 code mort e1rm, 🟡-2 libellé « Prochaine séance : X » sur Home, 🟡-4 mention condition courbes.
3. **🟠-1 — Stats Volume** (petit, 🟡 léger) : harmoniser les fenêtres sur les jours OU séparer visuellement les deux cartes avec leurs unités.
4. **🟡-3 — Analyse** (petit, 🟢) : placeholder riche sans FC (ou repositionnement du contenu).
5. **🟡-5 + 🟠-8 — Réglages** (moyen, 🟢/🟡) : dégraisser l'accordéon Profil Athlète, dédoublonner freq/jours/poids.
6. **🟠-7/🟡-7 — Plan** (petit) : unifier les deux « Nouveau programme ».
7. **🟡-6 — Corps du Profil** (moyen, 🟢) : réutiliser `renderBodyFigure` (SVG genré face/dos) avec coloration fatigue.
8. **Chantier Coach dédié (dernier, gros, 🟡)** : sur la base de la carte ci-dessus — purge des effets de bord (🔴-4 en premier, isolable), arbitre d'intensité, budget de blocs, unification récupération/deload.

---

*Audit réalisé le 2026-07-11 (SW v324). Sources : lecture code js/app.js, js/coach.js, js/engine.js, index.html — aucune modification.*
