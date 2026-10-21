# Audit 70 — Lot B-2 Phase 1 : surface inline + substitutions + legacy (read-only)

> Suite du Lot B (mergé, PR #231). Le Lot B a corrigé les **4 templates** émetteurs.
> En **exécutant** la génération (Playwright, 162 profils × 6 phases), on a découvert que le
> générateur émet ENCORE des génériques via des sources NON couvertes par le diagnostic 69 :
> littéraux inline + maps de substitution (blessure/débutant/morpho) + chemin legacy `EXO_DB`.
> **Aucun code. STOP — rapport + arbitrages avant Phase 2.**

## Résidu observé (chemin moderne `generateWeeklyPlan`, après Lot B)
Sur profil standard, le plan reste précis SAUF 2–3 noms selon le profil :
`Développé Incliné (Haltères)`, `Machine Convergente` (profil épaule), `Soulevé de Terre Roumain (Haltères)` (débutant).

## A. Littéraux INLINE dans le générateur moderne (`wpGeneratePowerbuildingDay`)
| Emplacement | émet | → cible précise |
|---|---|---|
| `app.js:23723` (bench2 override) | `Développé Incliné (Haltères)` | Développé Couché Incliné (Haltère) ✅ |
| `app.js:23729` (fallback variant) | `Squat Pause` | Squat avec pause (barre) ✅ |
| `app.js:23364` (règle 45 min) | `Soulevé de Terre Roumain (RDL)` | Soulevé de Terre Roumain (Barre) ✅ |
| `app.js:23417` (correction ratio) | `Soulevé de Terre Roumain (RDL)` | Soulevé de Terre Roumain (Barre) ✅ |

→ Déterministes, cibles précises existantes. (23729/23364/23417 ne se déclenchent que sur
certains chemins ; à corriger pour couverture complète.)

## B. Maps de SUBSTITUTION (blessure / débutant / morpho) — valeurs émises dans le plan
### B1. `BEGINNER_SUBSTITUTES` (engine.js:1827)
| clé | valeur | statut |
|---|---|---|
| Squat (Barre) | Goblet Squat | précis ✅ |
| Développé Couché (Barre) | Développé Couché (Haltères) | précis ✅ |
| Soulevé de Terre (Barre) | **Soulevé de Terre Roumain (Haltères)** | ❌ **GAP CATALOGUE** — pas de « RDL (Haltère) » précis |

### B2. `SHOULDER_HEAVY_ALTERNATIVES` (app.js:20915)
| valeur | statut |
|---|---|
| Floor Press / Extension Triceps Corde | précis ✅ |
| `Machine Convergente` | → Développé Convergent Machine ✅ (nameAlt) |
| `Élévations Latérales Machine` | ❌ pas de cible (« Élévation Latérale (Machine) » absent) |
| `DB Press paumes face à face` | ❌ pas de cible (substitut Larsen) |

### B3. `MORPHO_SUBSTITUTIONS` (engine.js:3443) — substitutions morphotype
| valeur | statut |
|---|---|
| Floor Press | précis ✅ |
| `Sumo Deadlift` | → Soulevé de Terre Sumo ✅ (nameAlt) |
| `Chest Supported Row` | → Seal Row ✅ (nameAlt) |
| `Low Bar Squat` | ❌ pas de cible (variante technique squat) |
| `Block Pulls (10cm)` | ❌ pas de cible |

## C. Chemin LEGACY (`pbGenerateProgram` / `EXO_DB` app.js:1606)
Générateur d'onboarding legacy (nom de branche : `legacy-onboarding-diagnostic`). Table `EXO_DB`
à noms génériques (`Squat barre`, `Leg Press`, `Romanian Deadlift`, `Soulevé de terre`…) + `alts`
génériques (`Goblet Squat`, `Roumain haltères`…). `pbGenerateProgram` construit un aperçu puis
délègue à `generateWeeklyPlan()`. **Question de fond : déprécier/rebrancher ce chemin, ou le
renommer ?** — décision d'architecture, pas un simple remplacement.

## D. GAPS CATALOGUE à trancher (décision Aurélien — probablement créer les variantes, façon Lot A)
1. **Soulevé de Terre Roumain (Haltère)** — substitut débutant du deadlift. NE PAS rabattre sur
   « (Barre) » (collapse de variante ; pour un débutant, RDL haltère léger ≠ RDL barre).
2. **Élévation Latérale (Machine)** — substitut épaule.
3. **Low Bar Squat** — variante technique (morpho fémurs longs).
4. **Block Pulls (10cm)** — variante deadlift (morpho torse court).
5. **DB Press paumes face à face** — substitut Larsen (existe-t-il déjà sous un autre nom ?).

## E. Recommandation de découpage
- **B-2a (sûr, déterministe)** : littéraux inline A + valeurs de substitution ayant une cible
  précise (Machine Convergente, Sumo Deadlift, Chest Supported Row).
- **B-2b (catalogue)** : créer les variantes manquantes (section D) — périmètre Lot A, à cadrer.
- **B-2c (architecture)** : statut du chemin legacy `EXO_DB` / `pbGenerateProgram` (section C).

---
**STOP. Aucun code. Attente du GO + arbitrages (gaps D, découpage E) avant toute Phase 2.**
