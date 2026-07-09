# Audit 66 — Modèle des FAMILLES d'exercices : diagnostic (read-only)

> Éclaire la décision A/B avant de trancher les ~60 noms sans mapping (audit 65).
> Question : comment l'app relie-t-elle aujourd'hui les variantes d'un même mouvement
> (Tirage Poitrine poulie/machine/prise large ; Développé Couché barre/haltère ; Curl barre/
> haltère/poulie) ? Read-only, lectures réelles engine.js/app.js/exercises.js.

---

## ⚠️ VERDICT CENTRAL

**Une notion de « famille » EXPLICITE existe déjà** — mais elle est limitée aux gros lifts, et
c'est exactement la structure conçue pour l'**Option A** (variantes distinctes reliées par un
RATIO, jamais fusionnées). Partout ailleurs, le regroupement est **implicite** (muscle / type /
substitutions ad hoc). Et la frontière « synonyme d'orthographe » vs « variante de famille » est
aujourd'hui **brouillée dans `nameAlt`** — c'est la cause du bug signalé en audit 64/65.

---

## A. Mécanismes de regroupement existants

### A1. `EXERCISE_TRANSFER_MATRIX` (engine.js:2391) — LA famille explicite ⭐
Structure : `{ 'Nom Précis': { family: 'squat'|'hinge'|'bench'|'ohp', ratio: <coef vs parent> } }`.
Couvre **~26 exercices**, uniquement des variantes de gros lifts (Squat/Hinge/Bench/OHP).
Exemples : `Front Squat {squat, 0.80}`, `Goblet Squat {squat, 0.55}`, `Développé Incliné (Barre)
{bench, 0.82}`, `Développé Couché (Haltères) {bench, 0.85}`.

**Sémantique** : `ratio` = force relative attendue vs le parent de la famille (ratio 1.00). Le lien
n'est PAS « c'est le même exercice » mais « c'est le même pattern, à un coefficient de charge près ».

**Consommateurs** (3 fonctions, engine.js:2432-2468) :
- `estimateE1RMFromTransfer` : estime l'e1RM d'un exo SANS historique via un exo de **même
  `family`**, en appliquant `target.ratio / source.ratio`. Refuse si familles différentes (2436).
- `findBestTransferSource` : cherche le meilleur exo connu de la même famille comme source.
- `getTransferRatio` (lu par app.js:29925, remplacement d'exo) : historique réel prioritaire,
  fallback matrice si même famille.

→ **C'est déjà l'Option A en miniature** : variantes distinctes (chacune garde son e1RM/ses logs),
reliées par `family`, avec un ratio qui rend les charges COMPARABLES sans les fusionner.
Limite : couverture SBD seulement ; **aucun accessoire** (Curl, Écarté, Tirage, Élévations…).

### A2. `getSBDType` (engine.js) — classifieur de lift de compétition, PAS une famille
Regex → `'squat'|'bench'|'deadlift'|null`. **Exclut volontairement les variantes** (`VARIANT_KEYWORDS`
+ garde `!incline !haltere !decline !hack !goblet !bulgare…`). Ne renvoie rien pour les accessoires.
C'est un classifieur bestPR/DOTS, pas un modèle de famille.

### A3. Muscle-mapping — lien IMPLICITE trop grossier
`EXO_DATABASE` porte `primaryMuscles`/`secondaryMuscles` (pas de champ `muscleGroup` top-level) ;
`getMuscleGroup(name)` (engine.js:684) est une **regex sur le nom**, cachée. Deux variantes matériel
du même mouvement partagent bien leur muscle (cable_fly/machine_fly/dumbbell_fly → Pecs) — MAIS le
Développé Couché aussi → Pecs. Le muscle regroupe trop large pour être une « famille de mouvement ».

### A4. Substitutions — familles DE FACTO, mais ad hoc et directionnelles
- `STALENESS_SUBSTITUTES` (engine.js:5339, ~25 clés) : rotation anti-stagnation. **Contient déjà des
  familles-matériel** : `'Écarté Machine' → ['Écarté Machine (Pec Deck)', 'Écarté Câbles', 'Écarté
  Haltères']` ; `'Tractions' → ['Tirage Vertical', 'Tirage Poulie Haute']`. C'est le regroupement
  matériel le plus proche d'une « famille » côté accessoires — mais hand-authored, incomplet,
  directionnel (A→[B,C] pas symétrique garanti), et keyed par noms mixtes précis/génériques (bug 65).
- `MORPHO_SUBSTITUTIONS` (long_femurs→Low Bar Squat…), `BEGINNER_SUBSTITUTES` (Squat (Barre)→Goblet
  Squat), substitutions blessures/senior : proposent un exo alternatif pour un SLOT donné, à visée
  spécifique (morpho/niveau/blessure). Ce sont des liens de famille orientés-usage, pas une relation
  « ces exos sont le même mouvement ».

### A5. `EXERCISE_CATEGORIES` / `getExoCategory` — pattern grossier
`EXERCISE_CATEGORIES` (engine.js:5237) : `'fixed'|'variation'|...` pour la rotation de blocs SBD.
`getExoCategory` (app.js:19640) : regex → `'big'|'compound'|'isolation'`. Utile pour le volume, trop
grossier pour distinguer des variantes d'une même famille.

### A6. `nameAlt` / `WP_SYNONYMS` / `EXO_SYNONYMS` — SYNONYMES, pas familles (mais frontière brouillée)
Vocation : relier des **orthographes/langues du MÊME exercice** (« Bench Press » = « Développé
Couché (Barre) »). PAS des variantes matériel. **MAIS** audit 64 a montré des replis abusifs qui
sont en réalité des relations de FAMILLE encodées à tort comme synonymes :
- `Squat Pause` rangé en `nameAlt` de `Squat Barre` (variante ≠ synonyme)
- `Tirage Poitrine (Poulie)` en `nameAlt` de `Tirage Vertical Prise Large` (deux mouvements
  différents — anomalie confirmée audit 65)
→ La confusion synonyme/variante est déjà DANS les données. Distinguer les deux est un prérequis
quelle que soit l'option retenue.

## B. Y a-t-il une notion de « famille » explicite ?

- **Champ `family`/`pattern`/`movement`/`baseExercise` dans `EXO_DATABASE` : NON** (grep = 0).
  Les 1008 entrées n'ont que `equipment`, `category` (compound/isolation), `primaryMuscles`.
- **Seul `family` explicite = `EXERCISE_TRANSFER_MATRIX`** (A1), hors EXO_DATABASE, keyé par nom,
  couverture SBD. Tout le reste est implicite (muscle/type) ou ad hoc (substitutions).
- **Substitution par MATÉRIEL manquant** (question B8) : existe UNIQUEMENT dans le générateur
  LEGACY d'onboarding via `EXO_DB.alts:[{name,mat}]` + `filtMat` (app.js:1666) — `EXO_DB` est le
  vocabulaire n°3 (audit 65), séparé d'EXO_DATABASE. **Le générateur MODERNE (weeklyPlan/
  WP_SESSION_TEMPLATES) ne fait AUCUNE substitution matériel** : il émet des noms de template fixes.
  Donc le cas d'usage « pas de poulie → propose la machine » n'est couvert que dans le vieux flux.

## C. Impact sur le suivi de charge / stats

- **Charges NON comparables entre variantes** : confirmé par le design même de la matrice (ratios
  Front 0.80 / Goblet 0.55 / Incliné 0.82…). Une machine et une poulie du même mouvement n'ont pas
  la même charge absolue (bras de levier, courbe de résistance).
- **Traitement actuel = strictement séparé par nom** : e1RM/PR via `db.logs` par nom
  (`getAllBestE1RMs`), registres DUP `db.exercises[nom].zones`, sparklines par nom. Chaque variante
  a sa propre progression de charge. Le système APRE/DUP **suppose 1 nom = 1 progression**.
- Conséquence : une « famille » qui **consoliderait les charges** (moyenne/somme d'un curl barre à
  40 kg et d'un curl haltère à 18 kg/main) serait **trompeuse et casserait l'APRE**. Une famille qui
  **relie sans fusionner** (via ratio, comme la matrice) est en revanche cohérente.

---

## CONCLUSION — pour la décision d'Aurélien

### Ce qui EXISTE déjà comme regroupement
| Mécanisme | Type | Portée | Sémantique |
|---|---|---|---|
| `EXERCISE_TRANSFER_MATRIX` | **famille explicite + ratio** | ~26 SBD variants | « même pattern, charge = parent × ratio » |
| `getSBDType` | classifieur | squat/bench/dead | lift de compétition (bestPR/DOTS) |
| muscle-mapping | implicite | tous | trop large (muscle ≠ mouvement) |
| `STALENESS_SUBSTITUTES` & subs | famille de facto | ~25 + ad hoc | rotation/adaptation orientée-usage |
| `getExoCategory`/`EXERCISE_CATEGORIES` | pattern grossier | tous | big/compound/isolation |
| `nameAlt`/`WP_SYNONYMS`/`EXO_SYNONYMS` | synonymes | large | orthographe/langue (frontière brouillée) |

### Y a-t-il une « famille » explicite ?
**Oui, une seule** : `EXERCISE_TRANSFER_MATRIX` (family + ratio), limitée aux gros lifts. Ailleurs :
liens implicites (muscle/type) ou substitutions ad hoc. **Aucun champ famille dans EXO_DATABASE.**

### Les deux options, au vu de l'existant

**Option A — variantes distinctes reliées par famille (RECOMMANDÉE au vu de l'existant)**
- Structure à ÉTENDRE = `EXERCISE_TRANSFER_MATRIX` : elle porte déjà `family` + `ratio` et
  l'infrastructure de lecture (transfert e1RM, substitution). L'étendre aux ~60 accessoires donne :
  substitution matériel, estimation de charge inter-variantes, stats consolidables PAR RATIO — sans
  toucher au suivi de charge (chaque variante garde e1RM/zones/logs propres). C'est la continuité
  naturelle du modèle déjà en place.
- Coût : authorer les entrées famille/ratio des accessoires. **Risque spécifique** : les ratios
  d'accessoires sont FLOUS (un ratio machine-fly ↔ cable-fly n'a pas de valeur consensuelle comme
  Front Squat 0.80). Option de repli : famille SANS ratio fiable (ratio ~1.0 ou champ `family` seul
  pour la substitution, sans estimation de charge croisée sur les accessoires).
- Risque global : FAIBLE (structure additive, read-only, comme `WP_SYNONYMS`). Ne casse rien.
- Prérequis partagé : nettoyer `nameAlt` (sortir les variantes-familles encodées à tort en
  synonymes — Squat Pause, Tirage Poitrine Poulie) pour que synonyme et variante soient distincts.

**Option B — fusion en un seul exercice (DÉCONSEILLÉE)**
- Casse : (1) le suivi de charge (charges non comparables → e1RM/APRE/DUP corrompus, ≠ des doublons
  vrais du Lot 2 qui étaient le MÊME mouvement) ; (2) la matrice de transfert (ses ratios n'ont plus
  de sens si les variantes n'existent plus) ; (3) les stats par variante et les sparklines ; (4) la
  substitution matériel (plus de variante cible à proposer).
- Ne résout pas le problème de nomenclature — il le masque en perdant de l'information (quel
  matériel a été utilisé). Fortement déconseillé, sauf pour de VRAIS doublons (même mouvement, même
  matériel) qui relèvent déjà de `mergeExerciseData` (Lot 2), pas d'une « famille ».

### Lien avec les ~60 noms (audit 65)
Beaucoup des « génériques sans mapping » sont en réalité des **têtes de famille** (« Dips », « Tirage
Vertical », « Élévations Latérales », « Extension Triceps ») dont le template ne précise pas la
variante matériel. Le choix A/B détermine leur traitement : sous **Option A**, on choisit un
représentant précis par défaut ET on déclare la famille (les autres variantes restent des exos à
part liés) ; sous **Option B**, on les fusionnerait — au prix décrit ci-dessus.

---

**STOP — diagnostic seul, aucun code. Ce rapport éclaire A/B ; la décision revient à Aurélien et
conditionnera le traitement des ~60 noms.**
