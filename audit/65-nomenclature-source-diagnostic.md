# Audit 65 — Nomenclature-source : diagnostic (read-only)

> Suite des Lots 1-2 (synonymes/fusion, prod v306-v307). Prépare la correction À LA SOURCE :
> que le générateur produise directement les noms précis. Méthode : classifieur automatique
> (script scratchpad, non commité) — chargement d'`EXO_DATABASE` réel (1008 entrées, 960 noms
> uniques) + extraction de 24 structures de noms d'app.js/engine.js, classification de chaque
> nom en dur : EXACT (= `EXO_DATABASE.name`) / ALT (= `nameAlt` seulement) / ABSENT.
> Chiffres bruts : 386 chaînes candidates → 146 EXACT, 61 ALT, 179 ABSENT (dont ~40 faux
> positifs du walker : clés de config, libellés descriptifs — filtrés à la main ci-dessous).

---

## ⚠️ VERDICT CENTRAL — le prérequis est plus lourd que prévu

**« Nom précis » ≠ `EXO_DATABASE.name` aujourd'hui.** Sur les 25 cibles précises uniques de
l'annexe validée :
- **6 seulement** sont des `EXO_DATABASE.name` (Développé Couché (Barre), Planche, Abduction
  Hanche, Tapis Roulant, Hip Thrust (Machine)…)
- **15 sont des `nameAlt`** — le plus souvent d'une entrée dont le `name` est LE GÉNÉRIQUE :
  Squat (Barre)→name:'Squat Barre' ; Extension Jambes→name:'Leg Extension' ; Adduction
  Hanche→name:'Adduction Machine' ; Écarté (Machine)→name:'Écarté Machine' ; Tractions→
  name:'Tractions Pronation' ; Extension Mollets Debout (Machine)→name:'Mollets Debout' ;
  Oiseau (Machine)/(Poulie)→name:'Oiseau Penché (Haltère)' (!) ; Leg Curl Allongé (Machine)→
  name:'Leg Curl Couché' ; Tirage vers Visage→name:'Face Pull' ; etc.
- **4 sont ABSENTES** de la base : Extension Dos (Hyperextension), Développé Couché Décliné
  (Barre), Curl Poignets Paumes vers le Haut Assis, Curl Marteau (Haltère).

→ La nomenclature « précise » validée est celle de l'HISTORIQUE (Hevy), pas celle
d'`EXO_DATABASE`. **Corriger les templates sans corriger EXO_DATABASE d'abord recréerait un
3ᵉ décalage** (noms de programme introuvables dans la base → perte images/trackingType/recherche
GO, et `migrateExerciseNames` renommerait les nouveaux logs à l'envers si non protégés).
**Lot A (EXO_DATABASE) est un prérequis dur du Lot B (templates).**

## B4. Doublons de `name` dans EXO_DATABASE : pas 1 mais **48**

`name:'Squat Barre'` ×2 = `squat_barbell` (entrée curée : nameAlt riches, defaultRest 180,
instructions FR) + `edb_barbell_squat` (import free-exercise-db). Le motif est **systémique** :
48 noms canoniques portés par deux entrées chacun, toujours le couple « entrée curée » +
« entrée `edb_*` » (Pompes, Rowing Barre, Face Pull, Leg Extension, Adduction Machine, Curl
Marteau, Planche, Good Morning…). Impact : lookups par nom non déterministes entre les deux
entrées (recherche GO, images via EXO_IMAGE_MAP par id divergent, trackingType potentiellement
différent) ; `migrateExerciseNames` non affectée (même libellé). La « bonne » entrée est
vraisemblablement la curée (nameAlt fournis, métadonnées FR) ; les `edb_*` homonymes sont des
candidats à fusion/suppression — **à trancher au Lot A** (48 cas, pas 1).

Bonus du même ordre : le deadlift a DEUX canoniques curés distincts (`Soulevé de Terre` ET
`Soulevé de Terre Conventionnel`), les templates écrivent un 3ᵉ libellé (`Soulevé de Terre
(Barre)`, ABSENT de la base).

## A. Noms génériques en dur, par source (filtrés : vrais noms d'exercices uniquement)

Trois catégories de structures — le traitement diffère :

### A1. Templates qui ÉCRIVENT dans les programmes (→ Lot B, cœur du chantier)
| Source | Génériques avec mapping validé | Génériques SANS mapping connu (à trancher) |
|---|---|---|
| `SBD_VARIANTS` (app.js) | High Bar Squat, Bench Press (Barre) | **Soulevé de Terre (Barre)** (base : 'Soulevé de Terre Conventionnel' ? 'Soulevé de Terre' ?) |
| `WP_SESSION_TEMPLATES` | Mollets (Machine), Leg Curl Allongé, Oiseau Machine, Squat Pause, Soulevé de Terre Pause, Développé Incliné (Haltères), Rowing Poulie Assis (Prise Large), Face Pull→(déjà précis via Tirage vers Visage en valeur ?) | Gainage (Planche), Tirage Vertical, Shrugs, Extension Triceps, Élévations Latérales, Dips Torse (ALT de « Dips (Pecs) »), Spoto Bench, Tirage Poitrine (Poulie) (ALT de « Tirage Vertical Prise Large » ?!) |
| `WP_PPL_TEMPLATES` | Leg Extension, Adduction Machine, Mollets (Machine), Curl Marteau, Écarté Machine, Face Pull, Leg Curl Allongé, Hip Thrust (Machine)✓, Tractions | Squat, Développé Couché, Développé Militaire (Haltères), Rowing Barre/Haltères, Extension Triceps (Câble), Élévations Latérales, Fentes, Presse à Cuisses, Dips, Soulevé de Terre Roumain (RDL), Roue Abdominale, Tirage Vertical, Rowing Poulie Assis (V-Grip)✓ |
| `WP_ACCESSORIES_BY_PHASE` / `PHASE_ACCESSORY_MAP` | Leg Curl Allongé, Squat Pause, Oiseau Machine, Extension Mollets Debout (Machine)✓(ALT), Extension Jambes✓(ALT) | Hack Squat (Machine), Élévations Latérales, Extension Triceps, Fentes Bulgares, Mollets Lourds, Gainage Lesté, OHP (Barre), Shrugs, Dips Torse, Tirage Poitrine (Poulie) |
| `EXO_DB` legacy (onboarding, app.js:~1594) | — vocabulaire n°3 complet ('Squat barre', 'Bench Press barre', 'Développé haltères', 'Fentes avant'…) | tout EXO_DB (≈70 noms) — flux legacy welcome-back uniquement |

### A2. Maps de LOOKUP keyed-by-name (doivent SUIVRE le renommage du Lot B, sinon les lookups cassent)
`EXERCISE_CATEGORIES` (engine, High Bar Squat/Squat Pause/Mollets (Machine)/Leg Curl Allongé…),
`EXERCISE_TRANSFER_MATRIX` (High Bar Squat, Paused Squat/Bench, Larsen, Close Grip…),
`STALENESS_SUBSTITUTES` (~25 noms mixtes), `SBD_BLOCK_VARIATIONS` (Pin Squat, Paused Bench 3s,
Spoto Bench…), `PIVOT_WEEK_SWAPS` (High Bar/Low Bar Squat…), `BEGINNER_SUBSTITUTES`,
`MORPHO_SUBSTITUTIONS` (Low Bar Squat, Block Pulls…), `ANTAGONIST_PAIRS`,
`KNEE_INJURY_*`/`SHOULDER_HEAVY_*` (Dips, Larsen Press, Développé Incliné Haltères…),
+ déjà connus : `WP_EXO_META`, ratios BW, variantes DP, régressions LP.

### A3. PATTERNS et LIBELLÉS — hors périmètre renommage (à confirmer)
`ISOLATION_EXOS`, `SLOT_PROMOTION_BLACKLIST` (sous-chaînes de matching : 'Curl', 'Écarté',
'Shrugs'…) ; `CARDIO_STRATEGIES`/`CARDIO_BY_EQUIPMENT`/`CARDIO_INJURY_ALTERNATIVES` et
`PREHAB_ROUTINES` (libellés descriptifs, pas des exercices trackés : « Circuit HIIT 15min »,
« Face Pull léger », « Vélo stationnaire ou Marche »…). Les renommer n'apporte rien — les
matchers par regex les gèrent.

## C. Surface d'impact d'une correction à la source

**C5 — Qui écrit ces noms dans les données ?**
1. `generateWeeklyPlan` → `db.weeklyPlan.days[].exercises[].name` (blob).
2. **`_goDoStartWorkout` → `activeWorkout` → `convertWorkoutToSession` → `db.logs`** : chaque
   séance GO est LOGGÉE sous les noms du plan. **C'est l'argument massue pour le Lot B : tant que
   la source n'est pas corrigée, l'historique se pollue en continu dans les deux vocabulaires**
   (le Lot 1 compense en lecture mais n'arrête pas l'hémorragie à l'écriture).
3. Fallback `wpEstimateWeight`/`setZoneE1RM`/`shadowWeight` quand aucun historique ne matche →
   clés `db.exercises` génériques (l'origine des doublons fusionnés au Lot 2).
4. `db.routine`/`db.routineExos` (labels de jours + noms).

**Migration des programmes existants (Lot C) : PROBABLEMENT ÉVITABLE.** Arguments :
- le `weeklyPlan` est régénéré à chaque semaine/bloc → converge naturellement vers les noms
  précis dès le Lot B déployé, sans toucher aux blobs ;
- les vieux logs génériques restent résolus par le Lot 1 (groupes bidirectionnels : un
  programme « Squat (Barre) » retrouve l'historique « High Bar Squat » et inversement) ;
- les nouvelles clés `db.exercises` génériques accumulées d'ici là se traitent avec
  `mergeExerciseData` (Lot 2, outillé).
→ Recommandation : PAS de migration Supabase ; garder `WP_SYNONYMS` comme pont permanent
vieux-logs ↔ nouveaux-noms. Zone rouge évitée sauf constat contraire post-déploiement.

**C6 — Les 4 référentiels de synonymes après correction :**
| Référentiel | Rôle | Après Lots A+B |
|---|---|---|
| `WP_SYNONYMS` (+`wpSynonymGroupOf`) | pont générique↔précis pour les lecteurs | **GARDER** (pont permanent vers les vieux logs) ; les clés devenues identité pourront être élaguées (Lot D) |
| `EXO_SYNONYMS` (engine:884) | FR↔EN pour `matchExoName` | GARDER (sert l'import/les logs anglophones) — dédup partielle possible Lot D |
| `nameAlt` (EXO_DATABASE) | canonicalisation import Hevy | GARDER, mais PURGÉ au Lot A (replis de variantes pause/décliné, inversions name↔alt) |
| Mapping import (lookup `migrateExerciseNames`) | dérivé de nameAlt | suit le Lot A automatiquement ; re-vérifier `PROTECTED` (Lot 1) après inversion des `name` |

## D. Découpe en lots proposée (Aurélien tranche)

| Lot | Contenu | Zone | Ordre |
|---|---|---|---|
| **A — EXO_DATABASE d'abord** | Promouvoir les 15 précis de `nameAlt` → `name` (l'ancien name devient nameAlt) ; créer les 4 entrées manquantes ; trancher les **48 doublons** curée/`edb_*` ; purger les replis de variantes des nameAlt ; unifier le double canonique deadlift ; re-vérifier l'interaction `migrateExerciseNames`/`PROTECTED` | **Jaune** (code, mais pilote la migration de noms au boot → tests serrés) | 1 |
| **B — Templates générateur** | A1 + A2 : remplacer ~80 littéraux génériques par les noms précis (les maps de lookup DOIVENT suivre en même temps que les templates, commit par commit) ; EXO_DB legacy en dernier (flux welcome-back seulement, faible priorité) | **Jaune→orange** (change les noms écrits dans les futurs weeklyPlan/logs) | 2 |
| **C — Migration blobs** | probablement **AUCUNE** (cf. C5) ; seule action éventuelle : fusions `db.exercises` ponctuelles via `mergeExerciseData` | **Rouge** (Supabase, Claude.ai) — à n'ouvrir que sur constat | 4 (si besoin) |
| **D — Déduplication synonymes** | élaguer les clés WP_SYNONYMS devenues identité, dédup partielle EXO_SYNONYMS | Jaune, cosmétique | 3 |

## Cas ambigus à trancher par Aurélien (avant Lot A/B)

1. **~60 noms de templates SANS mapping validé** (colonne droite du tableau A1 + maps A2) —
   les plus fréquents : Soulevé de Terre (Barre), Low Bar Squat, Dips (→ Dips (Pecs) ou
   (Triceps) selon le contexte du template !), Élévations Latérales (→ (Haltère) ? Câble ?),
   Extension Triceps (→ Poulie Haute ? (Haltère) ?), Tirage Vertical (→ Prise Large ?),
   Shrugs (→ Shrugs Barre ? Shrug (Haltère) ?), Gainage (Planche) (→ Planche), Hack Squat
   (Machine) (base : 'Hack Squat (Machine)' existe ? à vérifier au Lot A), Larsen Press,
   Spoto Bench, Paused Squat/Bench, Close Grip Bench, OHP (Barre), Mollets Lourds,
   Gainage Lesté, Fentes Bulgares, Soulevé de Terre Roumain (RDL).
2. **Politique des 48 doublons** curée/`edb_*` : fusionner (garder la curée, rediriger l'id
   edb en nameAlt/id-alias) ou renommer les edb_* ? Volumétrie non triviale.
3. **Anomalie à confirmer** : `Tirage Poitrine (Poulie)` est aujourd'hui un `nameAlt` de
   « Tirage Vertical Prise Large » — un tirage poitrine poulie n'est pas un lat pulldown
   prise large ; probable repli abusif de plus dans nameAlt.
4. Double canonique deadlift ('Soulevé de Terre' vs 'Soulevé de Terre Conventionnel').
5. A3 (patterns/libellés) : confirmer qu'on ne les renomme pas.

---

**STOP — diagnostic seul, aucun code. Attente des arbitrages d'Aurélien (cas ambigus 1-5 et
validation de la découpe A→B→D, C seulement si besoin) avant toute implémentation.**
