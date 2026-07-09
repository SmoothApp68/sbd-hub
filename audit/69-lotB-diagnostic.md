# Audit 69 — Lot B Phase 1 : diagnostic templates générateur (read-only)

> Corriger la SOURCE des noms génériques : les templates du weeklyPlan émettent encore des noms
> génériques (« High Bar Squat », « Mollets (Machine) »…). Classifieur contre le NOUVEL
> `EXO_DATABASE` (post-Lot A, noms précis). **Aucun code. STOP — attente du GO avant Phase 2.**

## Sources confirmées (positions actuelles)
- Templates (émettent dans le plan) : `SBD_VARIANTS` (app.js:20073), `WP_SESSION_TEMPLATES` (20432),
  `WP_PPL_TEMPLATES` (20507), `WP_ACCESSORIES_BY_PHASE` (20324), `PHASE_ACCESSORY_MAP` (20416, **déjà tout précis ✅**).
- Maps de lookup keyed-by-name (doivent SUIVRE le renommage) : `WP_EXO_META` (app.js:22969),
  `EXERCISE_TRANSFER_MATRIX` (engine.js:2391), `EXERCISE_CATEGORIES` (5237), `STALENESS_SUBSTITUTES`
  (5339), `ANTAGONIST_PAIRS` (2039), `BEGINNER_SUBSTITUTES`/`MORPHO_SUBSTITUTIONS`/`SBD_BLOCK_VARIATIONS`.

## A. Corrections DÉTERMINISTES (générique → précis via nameAlt EXO_DATABASE) — 7
| Template émet | → nom précis |
|---|---|
| Bench Press (Barre) | Développé Couché (Barre) |
| Développé Incliné (Haltères) / Développé Incliné Haltères | Développé Couché Incliné (Haltère) |
| Développé Militaire Haltères | Développé Militaire (Haltère) |
| Fentes | Fentes Avant |
| Leg Extension | Extension Jambes |
| Rowing Poulie Assis (Prise Large) | Rowing Poulie Assis - Prise Large |
| Tirage vers Visage | Face Pull |

## B. ⚠️ PIÈGE DE COLLAPSE — 2 cas où l'auto-résolution POINTE VERS LE MAUVAIS EXERCICE
Ces génériques sont des `nameAlt` du lift PLEIN, mais le template veut la variante PAUSE :
| Template émet | auto-résout (FAUX) | cible CORRECTE (variante) |
|---|---|---|
| **Squat Pause** | → Squat (Barre) ❌ | **Squat avec pause (barre)** |
| **Soulevé de Terre Pause** | → Soulevé de Terre Conventionnel ❌ | **Soulevé De Terre avec pause** |
→ À mapper MANUELLEMENT vers la variante pause. NE PAS laisser l'auto-résolution collapser.
(Idem `SBD_BLOCK_VARIATIONS` contient « Pin Squat », « Paused Bench 3s » — variantes à cibler précisément.)

## C. Génériques SANS cible CSV — décision de variante-matériel requise (~18)
Cible **proposée** (canonique EXO_DATABASE le plus cohérent) — à VALIDER par Aurélien :
| Générique template | cible proposée | note |
|---|---|---|
| High Bar Squat | Squat (Barre) | (déjà résolu par synonymes Lot 1) |
| Squat | Squat (Barre) | générique |
| Développé Couché | Développé Couché (Barre) | générique |
| OHP (Barre) | Développé Militaire (Barre) | |
| Soulevé de Terre Roumain (RDL) | Soulevé de Terre Roumain (Barre) | |
| Fentes Bulgares | Split Squat Bulgare | |
| Leg Curl Allongé | Leg Curl Allongé (Machine) | |
| Mollets (Machine) | Extension Mollets Debout (Machine) | |
| Élévations Latérales | Élévation Latérale (Haltère) | défaut haltère ? |
| Rowing Haltères | Rowing Haltère | |
| Extension Triceps Câble | Extension Triceps (Poulie) | câble=poulie |
| Gainage (Planche) | Planche | |
| **Dips** | Dips Triceps **ou** Dips Torse ? | ⚠️ dépend du slot (triceps vs pecs) |
| **Shrugs** | Shrug (Haltère) **ou** Shrug (Barre) ? | ⚠️ défaut matériel |
| **Extension Triceps** | Extension Triceps Poulie Haute ? | ⚠️ défaut (poulie/haltère/corde) |
| **Tirage Vertical** | Tirage Vertical Prise Large **ou** Tirage Poitrine (Poulie) ? | ⚠️ machine vs poulie |
| **Mollets Lourds** | Extension Mollets Debout (Machine) ? | ⚠️ descripteur d'intensité, pas un exo |
| **Gainage Lesté** | Planche ? | ⚠️ descripteur, pas de canonique « lesté » |

⚠️ = décision d'Aurélien (les autres, cible proposée applicable telle quelle si validée).

## D. Maps de lookup à mettre à jour EN MÊME TEMPS (sinon lookup cassé)
Elles référencent les anciens noms comme CLÉS ou VALEURS. À traiter dans le même commit logique :
- `WP_EXO_META` (clés normalisées) : ajouter/renommer les clés vers les noms précis (`squat pause`,
  `leg extension`, `bench press`, `mollets debout`, `souleve de terre roumain`…). NB : `wpGetExoMeta`
  a un pont synonymes (Lot 1) → dégradé gracieux, mais mieux vaut les clés précises pour le pas exact.
- `EXERCISE_TRANSFER_MATRIX` : « High Bar Squat », « Paused Squat/Bench », « Larsen Press »,
  « Close Grip Bench », « Développé Incliné (Barre) », « Développé Militaire (Haltères) » → précis.
  ⚠️ conserver les `family`/`ratio` ; anti-collapse pause≠plein.
- `EXERCISE_CATEGORIES` (22), `STALENESS_SUBSTITUTES` (24, valeurs = substituts), `ANTAGONIST_PAIRS` (noms) :
  remplacer chaque ancien nom par le précis (via nameAlt).
- **Bruit à IGNORER** (pas des noms d'exos) : clés muscle/mécanique (`quad`,`hams`,`chest`,`back`,
  `mechanic`,`equipment`,`muscleGroup`…), libellés cardio descriptifs (`CARDIO_STRATEGIES`,
  `CARDIO_BY_EQUIPMENT` : « Elliptique », « KB Swings », « Marche rapide extérieur »…), `PREHAB_ROUTINES`.
  Confirmé hors périmètre (audit 67, étape 1).

## E. Note architecture (rappel)
weeklyPlan régénéré chaque cycle → corriger les templates suffit, **0 migration de blob** ; les
anciens plans restent résolus en lecture (synonymes Lot 1). Zéro donnée touchée au Lot B.

---

## Décisions demandées à Aurélien avant Phase 2
1. Valider les cibles **proposées** (colonne C non-⚠️) telles quelles ?
2. Trancher les **6 ⚠️** : Dips (triceps/torse selon slot), Shrugs (haltère/barre), Extension Triceps
   (variante défaut), Tirage Vertical (machine/poulie), Mollets Lourds / Gainage Lesté (descripteurs
   → mapper vers la variante de base, ou laisser tels quels ?).
3. Confirmer l'anti-collapse pause : Squat Pause → « Squat avec pause (barre) », SdT Pause →
   « Soulevé De Terre avec pause » (jamais le lift plein).

**STOP. Aucun code. Attente du GO + arbitrages 1-3 avant la Phase 2 (correction templates + maps).**
