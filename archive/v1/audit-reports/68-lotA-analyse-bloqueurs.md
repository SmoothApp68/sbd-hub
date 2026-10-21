# Audit 68 — Lot A : analyse d'application du CSV + BLOQUEURS structurels

> Exécution du Lot A (audit 67). CSV source de vérité : `audit/mapping_nomenclature_lotA.csv`
> (161 lignes, 30 familles, 30 fusions — byte-identique à l'upload d'Aurélien).
> Analyse read-only du CSV contre le vrai `EXO_DATABASE` (1008 entrées). **Aucune mutation
> d'`exercises.js` dans ce commit** : l'analyse révèle des conflits que le CSV seul ne tranche pas.

## Plan calculé (résolution CSV → EXO_DATABASE)

| Catégorie | Nb | Nature |
|---|---|---|
| `family` sur entrée EXACT (name déjà précis) | 50 | ✅ déterministe |
| « Inversion » name↔nameAlt (précis en nameAlt) | 49 | ⚠️ dont 21 entrées entassées (voir bloqueur) |
| Création de canonique manquant | 32 | ⚠️ (le prompt en anticipait 7) |
| Fusion côté EXO_DATABASE (source→alias/suppr) | 30 | partiellement OK |
| Suppression doublons `edb_*` | 45 | ✅ déterministe (prompt en anticipait 48) |

Écart prompt↔réalité (7 créations attendues → 32 ; 48 edb → 45) : le CSV a été rédigé contre un
modèle idéalisé « 1 nom = 1 entrée », pas contre la structure réelle d'`EXO_DATABASE`.

## 🔴 BLOQUEUR CENTRAL — 21 entrées « entassées » (≥2 canoniques CSV dans UNE entrée)

`EXO_DATABASE` range plusieurs **canoniques CSV distincts** (lignes sans `fusion_vers` = exercices
séparés à conserver) dans la MÊME entrée, via `name` + `nameAlt`. « Inverser name↔nameAlt » ne
fonctionne que s'il y a UN seul canonique par entrée. Ici il faut **SPLITTER** 1 entrée en N — ce
que ni le CSV ni le prompt ne spécifient (quelle métadonnée — image, muscleGroup, bwFactor,
trackingType, instructions — va à quel split ?).

| Entrée (id) | name actuel | Canoniques CSV distincts à en extraire |
|---|---|---|
| `reverse_fly` | Oiseau Penché (Haltère) | **4** : Oiseau Penché (Haltère) + Oiseau (Haltère) + Oiseau (Machine) + Oiseau (Poulie) |
| `front_raise` | Élévation Frontale | **4** : Frontale (Haltère) + (Barre) + (Poulie) + Disque Frontale |
| `seated_row_machine` | Tirage Horizontal Machine | **4, 2 FAMILLES** : Tirage Horizontal Machine (row) + Rowing Assis (Machine) (row) + Tirage Machine Convergente (row) + **Tirage Poitrine (Machine) (pulldown)** |
| `pull_up_pronation` | Tractions Pronation | **3** : Tractions Pronation + Tractions + Tractions (Lesté) |
| `squat_barbell` | Squat Barre | 2 : Squat (Barre) + Squat avec pause (barre) |
| `ohp_dumbbell` | Développé Militaire (Haltères) | **2, cross** : Militaire (Haltère) (=assis) + Presse Épaules Assis (Machine) |
| `ohp_barbell` | Développé Militaire (Barre) | 2 : Militaire (Barre) + Militaire Assis (Barre) |
| `lat_pulldown_wide` | Tirage Vertical Prise Large | 2 : Tirage Vertical Prise Large + Tirage Poitrine (Poulie) |
| `lat_pulldown_close` | Tirage Vertical Prise Serrée | 2 : Tirage Vertical Prise Serrée + Tirage Poitrine Un Bras |
| `lat_pulldown_machine` | Tirage Machine Convergente | 2 : Tirage Machine Convergente + Tirage Poitrine (Machine) |
| `ez_curl` | Curl Barre EZ | 2 : Curl Biceps (Barre EZ) + Curl Biceps (Barre) |
| `bench_press_barbell` | Développé Couché (Barre) | 2 : DC (Barre) + Spoto Bench |
| `deadlift_conventional` | Soulevé de Terre Conventionnel | 2 : Conventionnel + Soulevé De Terre avec pause |
| `hip_thrust_barbell` | Hip Thrust (Barre) | 2 : Hip Thrust (Barre) + Hip Thrust (Machine) |
| `tricep_pushdown` | Extension Triceps Poulie Haute | 2 : Poulie Haute + Extension Triceps (Poulie) |
| `tricep_kickback` | Kickback Triceps | 2 : Kickback Triceps + Kickbacks Poulie |
| `hanging_knee_raise` | Relevé de Genoux Suspendu | 2 : Suspendu + Relevé de Genoux |
| `hanging_leg_raise` | Relevé de Jambes Suspendu | 2 : Suspendu + Barres Parallèles |
| `lateral_raise` | Élévation Latérale (Haltère) | 2 : (Haltère) + Élévation Latérale Complète |
| `clapping_push_up` | Pompes Claquées | 2 : Claquées + Pompes - Prise Serrée |
| `cable_row` | Rowing Poulie Assis (V-Grip) | 2 : V-Grip + Rowing Poulie Assis |

**Cas cross-famille les plus sensibles** : `seated_row_machine` (row + pulldown) et `lat_pulldown_
machine` contiennent tous deux « Tirage Poitrine (Machine) » (→ « Tirage Poitrine (Machine) » a
DEUX entrées propriétaires possibles) ; `ohp_dumbbell` mêle haltère et machine.

## Autres points à trancher

1. **Métadonnées des splits/créations** : les 32 créations + les splits doivent recevoir
   muscleGroup/equipment/trackingType/image. Le CSV ne les fournit pas. Politique proposée
   (déterministe, à valider) : chaque split **hérite des métadonnées de l'entrée-source** ; l'image
   (`EXO_IMAGE_MAP` par id) reste sur la variante correspondant à l'`equipment` d'origine, les autres
   splits → pas d'image (placeholder) tant qu'un id d'image n'est pas fourni ; `trackingType='weight'`
   par défaut (sauf cardio/PDC). **Sans validation, c'est de l'interprétation libre.**
2. **Doublons `name` hors edb_** (26 relevés) dont certains couples curée/curée (`plank`+`edb_plank`,
   `push_up`+`edb_pushups`… = edb, OK) mais aussi `push_up_clap`+`clapping_push_up`,
   `gainage_tape_epaule`+`plank_shoulder_tap`, `clean_jerk`+`edb_clean_and_press` — à confirmer
   comme fusions (non listés dans le CSV).
3. **« Straight-arm (Poulie) »** (pullover) : nom canonique déjà marqué « à confirmer » (audit 67).
4. **`family` catalogue hors-CSV** : ~845 entrées sans ligne CSV → laissées SANS `family` (le prompt
   autorise « omis »), à couvrir plus tard (analogie ou CSV étendu). Signalé, non bloquant.

## Ce qui est SÛR et déterministe (exécutable immédiatement si tu le souhaites)
- **`family` sur les 50 entrées EXACT** (name déjà = canonique CSV) — sans risque, même si l'entrée
  sera splittée plus tard (le split hérite).
- **Suppression des 45 `edb_*`** doublonnant une entrée curée (0 séance ne les référence, vérifié
  Supabase — matching par nom). Vérif préalable : aucun `edb_*` n'a de métadonnée meilleure que la
  curée (à confirmer entrée par entrée avant suppression).
- Les créations/inversions/fusions des entrées **NON entassées** (28 des 49 inversions, les 30
  fusions sur entrées à 1 canonique).

## Décision demandée à Aurélien (avant toute mutation d'`exercises.js`)
**Choisir une voie :**
- **(a)** Valider la politique de split/métadonnées (§1) → j'exécute le Lot A complet, splits inclus,
  en commits atomiques (family → edb → inversions simples → splits → créations → fusions), tests à
  chaque groupe.
- **(b)** N'exécuter que le **sous-ensemble sûr** maintenant (family sur 50 exact + suppression edb_*),
  et traiter les 21 splits dans un lot séparé une fois la politique tranchée.
- **(c)** Étendre le CSV avec, pour chaque canonique, l'**id EXO_DATABASE source** + l'image cible,
  pour rendre le split 100 % déterministe (zéro interprétation).

**STOP — aucune mutation d'`exercises.js`. Analyse commitée (doc + CSV). Attente du choix (a/b/c).**
