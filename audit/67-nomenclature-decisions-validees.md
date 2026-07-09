# Audit 67 — Décisions nomenclature VALIDÉES (spec d'exécution Lots A→D)

> Décisions arrêtées par Aurélien à partir des vraies données Supabase (workout_sessions,
> 163 exos ≥2 séances). **Ce document est le contrat d'exécution** des Lots A→D (audit 65) —
> les sessions futures s'y réfèrent. Modèle retenu : **A-light**.

## Modèle A-light — principes actés
1. `family` = **pattern de mouvement** (bench, squat, fly, row, curl…) → transfer matrix / substitution.
2. `muscleGroup` = **muscle ciblé** → stats volume (déjà en place, **hors périmètre**, non touché).
3. Variantes **matériel** (barre/haltère/machine/poulie) = exercices **DISTINCTS**, reliés par `family`
   (chacune garde e1RM/logs/charge propres).
4. Variantes **angle/prise** (incliné/décliné, poulie basse/haute) = **DISTINCTES**.
5. Doublons **orthographe / FR-EN** du MÊME mouvement+matériel = **FUSIONNÉS** (`mergeExerciseData` + synonymes).
6. Ratios de charge : **gros lifts seulement** (A-light) ; `family` seul sur accessoires.
7. **Nommage des familles = par MOUVEMENT, jamais par muscle** (bench, fly, curl, triceps-extension,
   lateral-raise, row, squat, hinge…).
8. **Règle transversale : « câble » = « poulie »** → toujours unifier vers `(Poulie)`.
9. **Défauts métier** : barre non précisé = **DEBOUT** ; haltère non précisé = **ASSIS** (validé overhead).

## Arbitrages structurants
- **Deadlift** : canonique « Soulevé de Terre (Barre) » (146) ; variantes distinctes ; doublon EN
  « Romanian Deadlift (Barre) » → « Soulevé de Terre Roumain (Barre) ».
- **Doublons `edb_*`** : garder l'entrée curée, supprimer le doublon `edb_*` (0 séance ne les
  référence — matching par nom, pas par id). *(rappel audit 65 : 48 couples curée/`edb_*`.)*
- **Tirage Poitrine (Poulie)** : canonique autonome, retirer le repli abusif vers lat pulldown.

## 28 familles couvrant les 163 exos ≥2 séances
fly · bench · shrug · rear-delt · curl · wrist · triceps-extension · dips · overhead-press ·
lateral-raise · front-raise · row · pulldown · traction · pullover · squat · leg-press · hinge ·
hip-thrust · glute-kickback · leg-extension · leg-curl · calf · plank · leg-raise · rotation ·
push-up · cardio · olympic · conditioning.

> **Le détail par famille (canoniques, variantes distinctes, FUSIONS/RENOMMAGES avec sessionsCount)
> est le message de décision d'Aurélien — source de vérité pour les Lots B et l'étape 4 (fusions).**
> Repris intégralement ci-dessous pour archivage.

<!-- BEGIN décisions par famille (verbatim Aurélien) -->
### fly
- Écarté (Haltère) canon (132) · Écarté (Machine) canon (52) ← FUSION Butterfly (Pec Deck) 9 + Écarté Machine (Pec Deck) 3 · Écarté (Poulie) ← FUSION Écartés Poulie 34 + Écartés à la poulie assis 8 · Écartés Poulie Basse 96 DISTINCT.
### bench
Toutes variantes angle×matériel DISTINCTES. DC (Barre) 180 / (Haltère) 186 / (Machine) ← RENOMME Chest Press (Machine) 3 + Chest Press Convergent (Machine) 2 · DC Incliné (Barre) 65 / (Haltère) 83 / (Machine Smith) 27 · DC Décliné (Barre) 36 / (Haltère) 10 / (Machine) 9 · Spoto Bench 3 · FUSION « Développé Incliné (Haltères) » 3 → DC Incliné (Haltère).
### shrug
Shrug (Haltère) 58 ← FUSION Shrugs Haltères 3 · (Poulie) 4 / (Barre) 2 / (Machine Smith) 2.
### rear-delt
Oiseau (Machine) 51 / (Haltère) 43 / (Poulie) 19 / Oiseau Penché (Haltère) 14 — TOUS DISTINCTS.
### curl
Curl Biceps (Barre) 81 / (Haltère) 74 / (Poulie) 50 / (Barre EZ) 23 ← FUSION Curl Barre EZ 27 · Curl Pupitre (Machine) 15 / Curl Marteau (Haltère) 33 / Curl Marteau Oblique 5.
### wrist
Curl Poignets Paumes vers le Haut Assis 24 / Extension Poignets Assis (Barre) 19.
### triceps-extension
Ext. Triceps Poulie Haute 126 / Corde 28 / (Haltère) 29 / (Poulie) 18 · Skullcrusher (Haltère) 17 / (Barre) 5 · Kickback Triceps 10 / Kickbacks Poulie 2 · FUSION « Extension Triceps Au-Dessus » 2 → « Extension des triceps au-dessus de la tête (câble) » 5.
### dips  (family commune, muscleGroup distingue la cible)
triceps : Dips Triceps 66, Machine Dips Assis 12 · pecs : Dips Torse 40, Dips Banc 4, Dips Torse (Assisté) 2.
### overhead-press  (barre=debout, haltère=assis par défaut)
Militaire (Barre)[debout] 108 ← FUSION Militaire Debout (Barre) 9 · Militaire Assis (Barre) 4 · Militaire (Haltère)[assis] 96 ← FUSION Militaire (Haltères) 2 · Presse Épaules Assis (Machine) 35 / Arnold (Haltère) 17.
### lateral-raise
Élév. Lat. (Haltère) 223 · (Poulie) 29 ← FUSION Élév. Lat. Câble 2 · un bras (Poulie) ← FUSION « à un bras (câble) » 2 + « Single Arm Lateral Raise (Cable) » 1 · Élév. Lat. Complète 8 DISTINCTE.
### front-raise
Élév. Front. (Haltère) 137 / (Barre) 25 / (Poulie) 20 / Disque Frontale 30.
### row
Rowing Poulie Assis 133 ← FUSION Tirage Horizontal Câble 15 · Assis (Machine) 119 · Debout (Barre) 56 / Penché (Barre) 2 · Haltère 44 · Poulie Assis (V-Grip) ← FUSION « Seated Cable Row - V Grip (Cable) » 34 + « Tirage assis poulie prise en V » 3 · Poulie Assis - Prise Large 24 · Tirage Horizontal Machine 9 / Convergente 3 / Iso-Lateral Low Row 1.
### pulldown
Tirage Poitrine (Poulie) 66 canon autonome · Un Bras 49 ← FUSION « Tirage un bras » 5 · Tirage Vertical Prise Serrée 12 [machine] / Tirage Poitrine - Prise Serrée (Poulie) 4 · Tirage Vertical Prise Large 4 / Tirage Poitrine (Machine) 7.
### traction  (PDC + lesté = même mouvement)
Tractions 97 canon / Pronation 30 / Supination 24 · (Lesté) 2 / Élastiques 3 · Muscle Up 3.
### pullover  (bras tendus, distinct de pulldown)
Pull-Over (Haltère) ← RENOMME « Pull-Over » 105 · Straight-arm (Poulie) ← FUSION Pullover (Câble) 20 + Tirage Poitrine Bras Tendus (Poulie) 69 — **nom canonique à confirmer**.
### squat
Squat (Barre) 148 ← FUSION Squat Barre 28 · avec pause (barre) 7 · Hack Squat (Machine) 66 · Belt Squat (Machine) 2 / Split Squat Bulgare 5 / Step Up Haltère 4 / (Poids du Corps) 4.
### leg-press
Presse à Cuisses 12 — SORTIE de squat (ratio 2-2.5× trop différent).
### hinge
Soulevé de Terre (Barre) 146 canon · Jambes Tendues 78 / Roumain (Barre) 34 ← doublon EN Romanian Deadlift (Barre) · Sumo / Conventionnel / avec pause · Flexion Buste Avant (Barre) 5 = good morning.
### hip-thrust
Hip Thrust (Machine) 48 ← FUSION Poussée de hanches (machine) 12 · (Barre) 10 · Relevé de Bassin (Barre) 5 DISTINCT · Une Jambe (Haltère) ← RENOMME « Single Leg Hip Thrust (Dumbbell) » 2.
### glute-kickback
Kickbacks Fessier (Machine) 17 ← FUSION Rear Kick (Machine) 4 · Kickbacks Poulie 2.
### leg-extension
Extension Jambes 150 ← FUSION Leg Extension 3 · Extensions Une Jambe 8 DISTINCTE.
### leg-curl
Leg Curl Assis 38 / Allongé (Machine) 7.
### calf
Ext. Mollets Debout (Machine) 33 / Assis 5.
### plank
Planche 251 / Latérale 63 / Gainage Tape Épaule 43 / L-Sit Hold 3.
### leg-raise
Relevé Genoux 21 / Genoux Suspendu 8 / Barres Parallèles 12 / Jambes Allongé 4 / Jambes Suspendu 6.
### rotation
Rotation Russe (Lesté) 2.
### push-up
Pompes 141 / Diamant 3 / Claquées 2 / Prise Serrée 2.
### cardio
Tapis Roulant 292 / Natation 11 / Randonnée 8 / Escaliers 17 / Course à Pieds 4 / Cyclisme 2 / Vélo Machine 4 (vélo appart ≠ cyclisme route).
### olympic
Épaulé-jeté 17.
### conditioning
Burpee 7.
<!-- END décisions par famille -->

---

## Étape 1 (audit 65, 5ᵉ arbitrage) — patterns/libellés HORS PÉRIMÈTRE : CONFIRMÉ

Vérifié dans le code que ces structures ne portent PAS des noms d'exercices trackés à renommer :

| Structure | Consommation réelle | Verdict |
|---|---|---|
| `SLOT_PROMOTION_BLACKLIST` (engine.js) | app.js:12643 — **`indexOf` substring** sur `exo.name.toLowerCase()` | **PATTERNS** ('Curl', 'Écarté', 'Shrugs'…). Renommer casserait le matching. **NE PAS TOUCHER.** |
| `CARDIO_STRATEGIES` / `CARDIO_BY_EQUIPMENT` | engine.js:1909-1910 — keyed par **goal/matériel**, valeurs = `{type, desc, reason}` **libellés descriptifs** | Pas des exos trackés. **HORS PÉRIMÈTRE.** |
| `PREHAB_ROUTINES` | engine.js:2382 — libellés de drills (« Face Pull léger », « Hip Circle »…) | Descriptif, non tracké. **HORS PÉRIMÈTRE.** |
| `ISOLATION_EXOS` (app.js:20571) | **0 consommateur** (def-only, grep) | Mort/def-only — ni renommer ni supprimer dans ce chantier ; à signaler pour un nettoyage code-mort séparé. |

→ **Étape 1 close** : ces 4 structures restent hors périmètre du renommage nomenclature.

## Points à confirmer / vigilance AVANT Lot A (signalés, non tranchés ici)

1. **Vocabulaire `family` unique** : `EXERCISE_TRANSFER_MATRIX` (engine.js:2391) utilise déjà
   `family: 'squat'|'hinge'|'bench'|'ohp'`. Le nouveau modèle nomme `overhead-press` (≠ `ohp`). Lot A
   doit **aligner les deux** (le champ `family` d'EXO_DATABASE et celui de la matrice) pour éviter
   deux vocabulaires de familles divergents. Squat/hinge/bench sont déjà cohérents.
2. **Inversions name↔nameAlt (Lot A)** : plusieurs canoniques cibles sont aujourd'hui des `nameAlt`
   d'une entrée au `name` générique (Écarté (Machine)→name 'Écarté Machine' ; Extension Jambes→name
   'Leg Extension' ; Tirage vers Visage→name 'Face Pull' ; etc., cf. audit 65). Lot A doit inverser
   `name`↔`nameAlt` AVANT que les fusions/templates s'appuient dessus. Cohérent avec la découpe.
3. **`migrateExerciseNames` / `PROTECTED`** (Lot 1) : après les inversions du Lot A et les fusions de
   l'étape 4, re-vérifier que le set `PROTECTED` (import.js) et les groupes `WP_SYNONYMS` restent
   cohérents avec les nouveaux canoniques (sinon la migration au boot re-diverge).
4. **« Straight-arm (Poulie) »** : nom canonique du pullover-poulie **à confirmer par Aurélien**
   (déjà marqué dans les décisions).
5. **`getSBDType`** classe tout `souleve+terre` en `deadlift` (bestPR) : « Soulevé de Terre Roumain
   (Barre) » y tomberait — comportement préexistant, à valider comme voulu ou non lors du Lot B.

---

**STOP.** Spec archivée. Étape 1 confirmée. Aucun code de comportement modifié dans ce commit.
Lots A→D = sessions d'exécution futures, sur décision d'Aurélien.
