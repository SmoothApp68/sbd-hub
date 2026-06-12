# READY-C2 — Phase 1 : Diagnostic des saisies readiness / bien-être

> Base analysée : `main` = `6d9af92` (v282, post-READY-C1). Lecture seule — aucune
> modification de code. Les numéros de ligne se réfèrent à cet état.

---

## Q1 — Consommateurs des 4 clés de stockage

### `db.readiness` — entrées `{ date, sleep, energy, motivation, soreness, score }` (sliders 1-10, score /100 Helms)

**Écrivains**
| Réf | Fonction | Écrit |
|---|---|---|
| app.js:957 | `submitReadiness` | push `{date, sleep, energy, motivation, soreness, score}` |
| app.js:617 | init module (top niveau) | `db.readiness = db.readiness \|\| []` |

**Lecteurs**
| Réf | Fonction | Champ(s) lu(s) | Rôle |
|---|---|---|---|
| app.js:629 | `hasTodayReadiness` | `r.date` | gate du modal pré-séance (avec `user._readinessSkipDate`) |
| app.js:647 | `getTodayReadiness` | `r.date` (entrée entière) | alimente la bannière |
| app.js:977-985 | `getReadinessBannerHtml` | `r.score, r.sleep, r.energy, r.soreness`, **`r.stress` (INEXISTANT)** | bannière GO + Programme |
| app.js:9009 | `computeFormScoreComposite` | `r.score, r.date` (7 j, pondéré 20 %) | score de forme Dashboard |
| app.js:19593 | `generateWeeklyReport` | `r.score, r.date` (moyenne semaine) | « 😴 READINESS MOYENNE » |
| app.js:20093 | `computeAdaptiveSRSThreshold` | `r.score, r.date` (30 dernières) | seuil deload adaptatif **+ LP Fast-Track (21515 : moyenne ≥85 → +5 kg/séance)** |
| app.js:20274 | `checkWisdomBadge_Recovery` | `r.score, r.date` (3 dernières >80) | badge XP |
| app.js:22699-22700 | `wpDetectPhase` | `r.score` (<50 ×2 sur 7) | peut **forcer la phase 'force'** (cap APRE 0.92) |
| coach.js:754 | `computeSRS` | `r.score, r.ts\|\|r.date` (7 j) | subjScore = 15-20 % du SRS |

**Champ inexistant lu** : `r.stress` (app.js:979-980, déjà connu) → « 🧠 Stress : undefined/5 » dans le détail dépliable.

### `db.readinessHistory` — `{ ts, sleep, energy, motivation, soreness, score }`, cap 90

**Écrivains** : app.js:959-961 `submitReadiness` (push + slice(-90)).
**Lecteurs** : **un seul** — import.js:1501 `generateAlgoWeeklyReport` (`.slice(-5)`, `.score` : tendance −15 → alerte fatigue). La « source unique » désignée par C2 n'a aujourd'hui qu'un consommateur.

### `db.todayWellbeing` — `{ date, sleep 1-5, motivation 1-5, pain, savedAt }` ⊕ `{ rhr, rhrAlert }` (Garmin)

**Écrivains**
| Réf | Fonction | Écrit |
|---|---|---|
| app.js:21594-21600 | `saveCheckin` (Bilan du matin) | objet complet (remplace) : date, sleep, motivation, pain, savedAt |
| app.js:17386-17388 | `showGarminCSVImport` | **merge** `rhr` + `rhrAlert` (crée l'objet si absent) |
| app.js:476 | init module | `= null` si undefined |

**Lecteurs**
| Réf | Fonction | Champ(s) | Rôle |
|---|---|---|---|
| app.js:8195 | `renderWeekCard` | `date` | badge « bilan fait » (Batterie Nerveuse) |
| app.js:20160-20163 | `shouldDeload` (critère 1) | `sleep, motivation` | recommandation deload (affichée Coach) |
| app.js:21403-21407 | `getStressVolumeModifier` | **`stress` (JAMAIS ÉCRIT)**, `motivation`, `sleep` | ×0.80 volume (réel en muscu, flags morts en PB) |
| app.js:21612 | `renderMorningCheckin` | `date` | masque la carte si bilan fait |
| app.js:21743-21747 | `_wpComputeWorkWeightPenalties` | `sleep` (→ sleepMult 0.95), `rhrAlert` (→ 0.95/0.80), `date` | **pénalités de charge réelles** |
| app.js:22550-22554 | `wpDetectPhase` | `sleep, motivation` | **(sleep+motivation)/2/5×100 < 45 → phase 'deload' AUTOMATIQUE** (cap 0.75) |
| app.js:27597, 27613-27614 | `buildChargeExplanation` | `sleep`, `rhrAlert.level` | raisons inline carte GO |
| app.js:30030 | `explainWeight` | objet (sleep…) | modal « pourquoi ce poids » |
| app.js:30767-30771 | `shouldRecordE1RMAsReference` | `sleep`, **`readiness` (JAMAIS ÉCRIT — garde morte)** | exclusion calibration cold-start |
| engine.js:2773, 3065-3077 | `analyzeAthleteProfile` | `sleep, motivation, pain` | section « 🌙 Bien-être du Jour » |
| engine.js:3083 | `analyzeAthleteProfile` | `rhrAlert` | alerte FC repos |
| engine.js:4547-4548 | `generateShareCard` | `sleep`, **`readiness` (JAMAIS ÉCRIT)** | `srsScore = (sleep+undefined)/2*20` → **NaN** si bilan rempli |

**Champs inexistants lus (nouveaux, en plus de `r.stress`)** :
1. `todayWellbeing.readiness` — engine.js:4548 (→ **NaN** affichable sur les cartes de partage) et app.js:30770 (garde `!== undefined` → branche morte silencieuse).
2. `todayWellbeing.stress` — app.js:21404 (documenté 21399 comme « champ explicite », aucun écrivain : la branche stress≥4 est inerte ; seul le ET motivation≤2/sleep≤3 fonctionne).

### `db.wellbeingHistory` — cap 90

**Écrivains** : app.js:21601-21603 `saveCheckin` (unshift+pop) ; init app.js:477.
**Lecteurs** : **AUCUN dans tout le repo** (app, engine, program, coach, stats, social, import, index.html). Store 100 % write-only — 90 entrées synchronisées dans le blob Supabase pour rien.

Hors périmètre js/ : `stats.js`, `social.js`, `index.html` → zéro occurrence des 4 clés. Pas d'Edge Functions dans le repo (`supabase/` absent).

---

## Q2 — Point d'injection du loadAdjustment

**Verdict : appliqué à RIEN. La chaîne est morte de bout en bout.**

`getReadinessLoadAdjustment()` (app.js:927) a exactement 3 appelants :
1. **app.js:953 `submitReadiness`** → stocké dans `activeWorkout.readiness.loadAdjustment` (964). **Aucun lecteur** de ce champ dans le repo. Et la séance terminée ne le conserve pas : `convertWorkoutToSession` (app.js:30683-30745) ne copie **pas** `readiness` (0 occurrence) → le champ meurt avec `activeWorkout`.
2. **app.js:910 `updateReadinessPreview`** → affiche en LIVE dans le modal « Charges ajustées : ±X % » (916) — **promesse non tenue résiduelle**, cousine du toast S1 retiré en C1 (rd-adj-preview, app.js:675).
3. **import.js:1086 `generateAlgoSessionDebrief`** → `session.readiness && getReadinessLoadAdjustment(session.readiness.score)`. Comme `session.readiness` n'existe jamais (cf. point 1), `readinessAdj ≡ 1` : même l'ajustement de la cible de compliance est **mort de fait**.

**La readiness modifie-t-elle indirectement charges/volume ? Oui, par 4 chemins détournés :**
- `db.readiness` → `computeAdaptiveSRSThreshold` → **LP Fast-Track** : moyenne ≥85 → incrément +5 kg au lieu de +2.5 (app.js:21515-21523).
- `db.readiness` → `wpDetectPhase` (22699) : 2 scores <50 → phase 'force' → cap APRE 0.92.
- `db.readiness` → `computeSRS` subjScore → `goCheckAutoRegulation` : SRS<50 → sets ÷2 appliqué (28418-28435) ; SRS → choix prehab (24324).
- `db.todayWellbeing` (bilan, PAS le questionnaire) → pénalités de charge réelles (sleepMult/rhrMult) + bascule deload automatique de `wpDetectPhase` (22550).

**Powerbuilding vs muscu** (confirmé depuis C1) : `getStressVolumeModifier` (todayWellbeing) réduit réellement les sets dans `wpGenerateMuscuDay` (app.js:24825-24835) ; sur le chemin powerbuilding (24349-24360) il ne pose que des flags sans lecteur. Ni l'un ni l'autre ne lit `db.readiness`.

---

## Q3 — Timing génération vs saisie

**Quand le plan est-il calculé ?** Appels `generateWeeklyPlan()` : onboarding (`obSaveQ4` 1917, `obSkipMorpho` 1936), boot/navigation (`handleMagicChoice` 3060 + 3078 — y compris le filet `if (!db.weeklyPlan)`), boutons Programme (`renderProgrammeV2` 11610/11656), builder (`pbGenerateProgram` 13180/13195, `renderProgramBuilderView` 13352/13355), `syncRoutineWithSelectedDays` 14507, `setSettingsFreq` 17696, `wpForcePhase` 22312, `calculateParametersForCustomPlan` 25032. Les **poids sont figés à ce moment-là** (pénalités physio incluses). Au lancement GO, `_goDoStartWorkout` (27080+) **copie** les sets du plan, il ne recalcule rien.

**La saisie readiness arrive APRÈS** : le modal s'ouvre dans `goStartWorkout` (27059), donc après la génération. **Aucun recalcul post-saisie** : ni `submitReadiness` ni `saveCheckin` n'appellent `generateWeeklyPlan()` (vérifié, 0 occurrence) ni n'invalident le plan. Conséquence : même si le loadAdjustment était branché demain dans la génération, il faudrait soit régénérer après saisie, soit l'appliquer au moment de la copie GO — point d'architecture clé pour la Phase 3.

**Cas limite double saisie** : `hasTodayReadiness` (621-629) ne consulte que `user._readinessSkipDate` et `db.readiness`. Un Bilan du matin rempli (→ `todayWellbeing`) **n'empêche pas** le modal readiness au lancement de séance → l'utilisateur ressaisit sommeil et motivation le même jour, sur une autre échelle (1-5 emojis vs 1-10 sliders), vers un autre store.

**Asymétrie de pouvoir notable** : le Bilan (1-5) a des effets automatiques lourds (pénalité −5 %, bascule deload de phase = cap −25 %, stress muscu −20 % volume) ; le questionnaire (1-10, formule Helms soignée) n'a que des effets périphériques (SRS 15-20 %, seuil, badge, phase 'force'). L'inverse de ce que l'UI laisse croire.

---

## Q4 — Surfaces UI affichant readiness/wellbeing

| Surface | Réf | Clé lue | Si `todayWellbeing` disparaît sans migration |
|---|---|---|---|
| Bannière readiness (GO actif + Programme jour) | `getReadinessBannerHtml` 974 → `renderGoActiveView` 27372, `renderWeeklyPlanUI` 25913 | `db.readiness` (jour) | rien (ne la lit pas) |
| Carte « ☀️ Bilan du matin » (Coach) | `renderMorningCheckin` 21610 | `todayWellbeing.date` | carte affichée en permanence |
| Batterie Nerveuse (badge bilan fait) | `renderWeekCard` 8195 | `todayWellbeing.date` | badge toujours « non fait » |
| Section « 🌙 Bien-être du Jour » (diagnostic athlétique) | `analyzeAthleteProfile` engine 3062-3079 | `todayWellbeing` (sleep/motivation/pain) + `rhrAlert` | section muette + **perte alerte RHR** |
| Raisons inline carte GO | `buildChargeExplanation` 27597/27613 | `todayWellbeing` (sleep, rhrAlert) | raisons sommeil/FC muettes |
| Modal « pourquoi ce poids » | `explainWeight` 30030 | `todayWellbeing` | lignes manquantes |
| Carte de partage | `generateShareCard` engine 4547 | `todayWellbeing` (sleep + readiness fantôme) | srsScore null (aujourd'hui : NaN si bilan fait !) |
| Score de forme Dashboard | `computeFormScoreComposite` 9009 | `db.readiness` | rien |
| Rapport hebdo in-app | `generateWeeklyReport` 19593 | `db.readiness` | rien |
| Debrief hebdo import | `generateAlgoWeeklyReport` import:1501 | `db.readinessHistory` | rien |
| Modal readiness (score + adj preview) | `updateReadinessPreview` 903-917 | calcul live | rien |

⚠️ **Point critique pour la dépréciation** : `rhr`/`rhrAlert` sont COLOCALISÉS dans `todayWellbeing` (écrits par l'import Garmin 17386-17388, lus par la pénalité de charge 21747, le diagnostic engine:3083 et 2 affichages). Déprécier `todayWellbeing` impose de **reloger l'alerte RHR** sous peine de casser une pénalité de sécurité réelle.

---

## Q5 — Strate fossile (ancienne version : échelle 1-5, champ `stress`, moyenne /20)

Vestiges confirmés :
1. **Fallback `rd-stress`** — app.js:952 : `getElementById('rd-motivation')?.value || getElementById('rd-stress')?.value` ; l'élément `rd-stress` n'existe plus dans le markup du modal (656-676 : rd-sleep/energy/motivation/soreness, sliders **1-10**) → branche morte.
2. **Affichage `r.stress` + formule /20** — app.js:979-980 : détail dépliable « 🧠 Stress : undefined/5 » + « Score : (s+e+so+st)/20 × 100 » — ne correspond ni aux champs stockés ni à la vraie formule (Helms pondérée ×10, app.js:920-924).
3. **GLOSSARY.readiness** — app.js:1048-1052 : « Moyenne de 4 critères notés de 1 à 5 : sommeil, énergie, douleurs (inversé), stress. Score = (somme/20)×100 » + exemple chiffré assorti. **Triple fossile** : échelle, champ, formule.
4. **`updateReadinessPreview`** — app.js:910-916 : « Charges ajustées : ±X % » (promesse morte restante, cf. Q2).
5. **`todayWellbeing.stress`** — app.js:21399-21404 : branche conditionnelle sur un champ qu'aucun écrivain ne pose.
6. **`todayWellbeing.readiness`** — engine.js:4548 (NaN) et app.js:30770 (garde morte) : probablement un vestige d'un ancien schéma où le bilan portait un sous-score readiness.

**Anciennes entrées prod avec `stress`** : l'archéologie git confirme le risque — les commits `000d805` (« Phase 1: Readiness pré-séance — questionnaire, impact et sparkline ») et `f51730d` (« readiness check pré-séance avec ajustement charges ») matchent `-S "stress: stress"` : l'ancien `submitReadiness` stockait bien un champ `stress`. Des entrées `db.readiness`/`db.readinessHistory` en prod peuvent donc contenir `{stress}` **sans** `motivation` (et inversement pour les récentes). → **À vérifier côté Supabase par Claude (chat)** : inspecter `sbd_profiles.data->'readiness'` (et `readinessHistory`) pour la présence du champ `stress` et l'échelle des valeurs (1-5 vs 1-10) selon l'ancienneté. La Phase 3 devra prévoir la lecture tolérante (`motivation ?? stress`) si confirmé.

---

## Q6 — Hors-scope (signalé, non traité)

1. **`session.readiness` jamais persisté** : `convertWorkoutToSession` ne copie pas `activeWorkout.readiness` → toute analyse post-séance corrélant readiness↔performance est impossible aujourd'hui (et import.js:1086 est mort, cf. Q2). Si C2 veut corréler saisie↔séance, il faudra persister.
2. **`generateShareCard` peut afficher NaN** (engine 4548) dès qu'un bilan est rempli — bug visible utilisateur, indépendant de la fusion.
3. **`db.wellbeingHistory` write-only** : 90 entrées dans le blob `sbd_profiles` synchronisé pour zéro lecteur — poids mort réseau/stockage.
4. **`wpDetectPhase` bascule deload automatique** (22550-22554) sur le MÊME signal que `shouldDeload` critère 1 (20158-20171) mais avec seuil fixe 45 vs seuil adaptatif, et sans acceptation utilisateur — duplication intra-fichier des critères deload, cumulable avec la pénalité sommeil issue de la même saisie (cf. C0 §2).
5. **Asymétrie d'effets bilan vs questionnaire** (Q3) — décision produit à acter en C2 : quelle saisie pilote quoi.

---

## Tableau récapitulatif — action Phase 3 probable par consommateur

| Consommateur | Réf | Lit | Action Phase 3 probable |
|---|---|---|---|
| `submitReadiness` / modal | 949-971, 650-698 | écrit readiness+History | **réécrire** (fusion emoji 1-5 ×2 → moteur Helms, cible readinessHistory) |
| `saveCheckin` / `renderMorningCheckin` | 21591-21640 | écrit todayWellbeing | **réécrire/fusionner** (UI unique, dépréciation du store) |
| `updateReadinessPreview` | 903-917 | calcul live | **réécrire** (retirer « Charges ajustées » tant que non branché) |
| Fallback `rd-stress` | 952 | DOM fantôme | **supprimer** |
| Détail bannière (`r.stress`, /20) | 977-981 | champ fantôme | **réécrire** (champs réels + vraie formule) |
| GLOSSARY.readiness | 1048-1052 | — | **réécrire** |
| `hasTodayReadiness`/`getTodayReadiness` | 621-647 | readiness | **rebrancher** sur readinessHistory |
| `getReadinessBannerHtml` + 2 appelants | 974-986 | readiness (jour) | **rebrancher** |
| `computeFormScoreComposite` | 9009 | readiness 7 j | **rebrancher** |
| `generateWeeklyReport` | 19593 | readiness semaine | **rebrancher** |
| `computeAdaptiveSRSThreshold` (+LP FT 21515) | 20093 | readiness 30 | **rebrancher** (+ lecture tolérante stress/motivation) |
| `checkWisdomBadge_Recovery` | 20274 | readiness 3 | **rebrancher** |
| `wpDetectPhase` (force + deload auto) | 22699, 22550 | readiness + wellbeing | **rebrancher** + décision produit (S9/duplication deload — plutôt C3) |
| `computeSRS` subjScore | coach:754 | readiness 7 j | **rebrancher** |
| `generateAlgoWeeklyReport` | import:1501 | readinessHistory | **intact** (déjà sur la cible) |
| `generateAlgoSessionDebrief` | import:1086 | session.readiness (mort) | **supprimer ou brancher** (selon décision persistance Q6.1) |
| `_wpComputeWorkWeightPenalties` | 21743-21747 | wellbeing.sleep + rhrAlert | **rebrancher** (sleep ← saisie fusionnée ; **reloger rhrAlert**) |
| `shouldDeload` critère 1 | 20158-20171 | wellbeing | **rebrancher** (échelles à harmoniser, cf. C0 S7) |
| `getStressVolumeModifier` | 21401-21407 | wellbeing (+stress fantôme) | **rebrancher** (et trancher le champ stress) |
| `buildChargeExplanation` / `explainWeight` | 27597, 30030 | wellbeing | **rebrancher** |
| `analyzeAthleteProfile` (🌙 + RHR) | engine 2773, 3083 | wellbeing + rhrAlert | **rebrancher** |
| `generateShareCard` | engine 4547-4548 | wellbeing.readiness (NaN) | **réécrire** (champ réel) |
| `shouldRecordE1RMAsReference` | 30767-30771 | wellbeing (.readiness mort) | **réécrire** (champ réel) |
| `renderWeekCard` (badge bilan) | 8195 | wellbeing.date | **rebrancher** |
| Import Garmin (rhr/rhrAlert) | 17386-17388 | écrit wellbeing | **réécrire** (nouveau logement RHR) |
| `db.wellbeingHistory` | 21601-21603 | — | **supprimer** (zéro lecteur) après migration |
