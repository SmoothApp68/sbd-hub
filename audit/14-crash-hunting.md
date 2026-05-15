# Audit 14 — Tests dynamiques offensifs : crash hunting réel
Date : 2026-05-15
SW : trainhub-v239
Méthode : Playwright (Chromium headless, 414×896) + injection localStorage `SBD_HUB_V29`
Harness : `audit/14-crash-hunting.spec.js` · Résultats bruts : `audit/14-crash-hunting-results.json` · Screenshots : `audit/shots-14/` (32 PNG)

> **Test artifact uniquement — aucune modification de `js/*.js`.** Le harness route
> `engine.min.js` → contenu de `engine.js` pour exécuter le **vrai code des sprints**
> (la prod charge un `engine.min.js` périmé — voir Finding #1), et exécute un passage
> `S2-PROD` *sans* ce swap pour mesurer la réalité de production.

---

## ⚠️ Caveat méthodologique (lire en premier)

Le **premier run** bloquait `supabase.min.js` en plus du CDN. Cela supprimait
`cloudSyncEnabled` / `checkAuthGate`, provoquant des **fausses erreurs** :
`generateWeeklyPlan … 'powerbuilding_avance'`, `Cannot access 'BW_FALLBACK_KG'
before initialization`, `cloudSyncEnabled is not defined`.

**Ces crashes étaient 100 % des artefacts du test, PAS des bugs produit.**

Le run corrigé ne bloque que le SDK CDN Supabase (`supabase-cdn.min.js`) — suffisant
pour que `supabase.createClient` échoue → `supaClient=null` → `checkAuthGate()`
retourne tôt (pas d'écran login) — tout en gardant `cloudSyncEnabled` et les helpers
définis. **Run corrigé : `pageerr=0`, `genPlan: days=7` partout, aucune vraie erreur
console** (seuls subsistent l'avertissement Chrome bénin `navigator.vibrate` et le
`net::ERR_FAILED` attendu du CDN bloqué). Tout le rapport ci-dessous se fonde sur le
run corrigé.

Limitation connue : l'overlay d'onboarding ne s'affiche pas pour S1 (cold start) car
le first-run UI est gated derrière l'auth email (contournée hors-ligne) — limitation
d'environnement de test, pas un bug produit.

---

## 🔴 Finding #1 — Bundle `engine.min.js` PÉRIMÉ (P0, bloquant déploiement)

**Le plus grave de l'audit. Confirmé statiquement ET dynamiquement.**

- `index.html:3385` et `service-worker.js:12` chargent `js/engine.min.js`, **figé au
  commit `48921577` (v213, 2026-05-12)** — soit **avant la totalité des sprints A/B/C,
  Fix-Hardcoded, Sprint 3 et FIX 6**.
- `engine.js` : 214 KB, modifié 15 mai. `engine.min.js` : 112 KB, 14 mai, v213.
  **Aucun script de build dans `package.json`** — les `.min.js` sont régénérés à la
  main et ne l'ont pas été depuis v213.
- Preuve dynamique (S2-PROD, sans swap) : `engineLoaded:false`.
  `checkMultiLiftLPExit`, `updateEWMAForExo`, `applyMorphoAdaptations`,
  `getJointStressAlerts`, `getSmoothedE1RM`, `calcBaseCapacity` → tous `fn-absent`.
- `Math.max(1,.73)` (bug "corrigé" Sprint 3 FIX 4) **toujours présent** dans le min.
  `VOLUME_LANDMARKS` (supprimé par Fix-Hardcoded) **toujours présent** dans le min.

**Rayon d'impact :**

| Sprint | Code | Statut prod réel |
|---|---|---|
| B — Morpho substitutions | `applyMorphoAdaptations`, `MORPHO_SUBSTITUTIONS` (engine.js) | 🔴 MORT — jamais appelé (typeof guard → no-op) |
| C1 — EWMA | `updateEWMAForExo`, `getSmoothedE1RM` (engine.js) | 🔴 MORT — EWMA jamais calculé |
| C2 — Stress articulaire | `JOINT_STRESS_TABLE`, `getJointStressAlerts` (engine.js) | 🔴 MORT — alertes jamais émises |
| C3a — Récupération | `calcBaseCapacity`, `RECOVERY_LATENCY` (engine.js) | 🔴 MORT — fallback 1.0 |
| C3b — Insolvency intégration | `calcInsolvencyIndex` (coach.js) | 🟡 PARTIEL — vit (coach.js live) mais dégradé : `calcBaseCapacity`→1.0, `getJointStressAlerts`→[] |
| Fix-Hardcoded | `getMuscleKey`, `getMuscleVolumeTarget` (engine.js) | 🔴 MORT — ancien `VOLUME_LANDMARKS` actif |
| Sprint 3 FIX 4/5 | `calcMacrosCibles`, `getLPIncrement` (engine.js) | 🔴 MORT — `Math.max(1,.73)` toujours là |
| FIX 6 | `checkMultiLiftLPExit` (engine.js) | 🔴 MORT — ancien `checkLPEnd` genre-neutre actif |

`app.js` (chargé non-minifié, ligne 3392) et `coach.js` (ligne 3391) **sont à jour
et vivants** — mais leurs appels `if (typeof X === 'function')` vers les fonctions
engine manquantes **échouent silencieusement** (no-op / fallback).

**Preuve UX visuelle** (DB identique baseDB, logs=[]) :
- `s2-coach.png` (engine.js swap) : Morpho-Card + Bilan matin + Budget Récupération + Diagnostic complet
- `s2-PROD-coach.png` (min périmé) : *« Importe des séances pour activer le Coach »* — placeholder cold-start

➡️ **Même utilisateur, même données, deux apps différentes.**

**Fix recommandé :** régénérer `engine.min.js` depuis `engine.js`, bumper `CACHE_NAME`
du service-worker, ajouter un script `build` dans `package.json` + une étape CI qui
vérifie `engine.min.js` ≥ `engine.js` (mtime/hash) pour empêcher la récidive.

---

## Scénarios

### Scénario 1 — Cold Start absolu
**Erreurs console :** aucune réelle (warn `navigator.vibrate` bénin).
**Comportement :** dashboard rendu sans crash, `generateWeeklyPlan` → 7 jours
(`bw=0` → `BW_FALLBACK_KG=80`). Onboarding non affiché (gating auth email hors-ligne — caveat).
**Valeurs :** `insolvency {index:0,level:'ok'}` (guard logs vides), `jointAlerts []`,
`diagnostic sections=1`, `NaNvisible:false`.
**Screenshots :** s1-boot/coach/dash/plan.png
**Verdict :** ✅ Correct — cold start robuste, aucun crash.

### Scénario 2 — Aurélien-like (avancé, 0 log, morpho=null)
**Erreurs :** aucune. **Comportement :** Coach complet, **Morpho-Card visible**
(morpho=null, non-débutant, onboarded ✅), plan généré (7 jours).
**Valeurs :** `insolvency {index:0,level:'ok'}` (0 log), `jointAlerts []`,
`lpExit {exit:false}` — correct : `recalcBestPR()` (init:13274) dérive bestPR des
logs ; logs vides → PR dérivés=0 → `checkMultiLiftLPExit` checked=0 → exit:false.
`smoothSquat:null` (voir Finding #3). `diagnostic sections=1`.
**Screenshots :** s2-*.png
**Verdict :** ✅ Correct (Morpho-Card OK, FIX 6 logique correcte).

### Scénario 3 — NaN injecté dans e1RM
**Erreurs :** aucune. **Comportement :** aucun crash, **aucun NaN visible dans l'UI**.
`getSmoothedE1RM` gère null/NaN/0 → null. `computeStrengthRatiosDetailed` → raw=0
(pas de throw). `insolvency {index:0}` (guard logs vides).
**Valeurs :** `NaNvisible:false`. Bug audit-13 **B1** (passthrough NaN) **NON déclenché** —
nécessite logs non vides + `calcWeeklyFatigueCost` NaN ; le guard logs-vides le masque.
Reste latent / théorique.
**Screenshots :** s3-*.png
**Verdict :** ✅ Correct — robuste face aux e1RM corrompus.

### Scénario 4 — Morpho tous flags true (contradictoire)
**Erreurs :** aucune. **Comportement :** `applyMorphoAdaptations` →
`"Low Bar Squat"`. Résolution **déterministe first-key-wins** (`Object.keys(morpho)` →
`long_femurs` en premier → substitution squat). Aucun crash, aucun nom corrompu.
**Observation design :** les morphotypes contradictoires (long_femurs +
short_arms_long_torso) se résolvent silencieusement par ordre de clé objet, pas par
la hiérarchie documentée (BLESSURE>IMBALANCE>MORPHO ne régit que l'inter-systèmes).
Sûr mais non documenté → finding mineur.
**Screenshots :** s4-*.png
**Verdict :** ⚠️ Comportement correct mais résolution de conflit intra-morpho non documentée.

### Scénario 5 — Insolvency Index zone critique (semaine lourde)
**Erreurs :** aucune. **Comportement :** Coach complet, `diagnostic sections=6`
(Santé Articulaire + Bilan Récupération apparaissent ✅).
**Valeurs :** `insolvency {index:5.78, level:'critical'}`,
`fatigueCost:170.8, baseCapacity:1.1, recoveryBudget:30, jointMalus:0.6`,
`redJoints:[Lombaires,Genoux,Hanches]`. `jointAlerts` lombaires=332.5,
genoux=122.5, hanches=280 (tous red). `lpExit 2/2 exit:true`.
**🔴 Finding #2 (P1) :** index = **5.78** soit **4.1× le seuil critique (1.4)**.
Gemini avait pré-flaggé « vérifier que l'index ne s'envole pas » → **il s'envole**.
Calcul : 170.8 / (1.1 × 0.30 × 100=33) = 5.17 + 0.6 = 5.78. `recoveryBudget` plancher
0.30 (srsScore 26 → 0.26 → floor) amplifie. `level` cap correctement à 'critical'
(pas de dégât logique) **mais** la note coach affiche `_insolvency.index.toFixed(2)`
→ « Index Insolvency 5.78 » : UX alarmante, non calibrée.
**Screenshots :** s5-coach.png (rendu propre, Morpho-Card + Diagnostic, 0 NaN)
**Verdict :** ⚠️ Fonctionnel mais index non borné — calibration à corriger.

### Scénario 6 — Stress articulaire zone rouge (lombaires)
**Erreurs :** aucune. **Comportement :** `diagnostic sections=6`, section
🦴 Santé Articulaire active.
**Valeurs :** `jointAlerts` lombaires=156.5 (red, seuil 100), hanches=99.4 (orange).
`insolvency {index:2.48, level:'critical'}` (Finding #2 encore : 2.48 > 1.4).
Magnitudes plausibles vu le volume (Squat 6×, Dead 6×, GM 4×, Rowing 5×).
Rendu conditionnel correct (6 sections avec logs vs 1 sans).
**Screenshots :** s6-coach.png (propre)
**Verdict :** ✅ Détection stress articulaire fonctionnelle (+ Finding #2 confirmé).

### Scénario 7 — Alexis-like (débutant, seuils sous LP)
**Erreurs :** aucune. **Comportement :** plan généré (7 jours).
**Valeurs :** `lpExit {exit:false}` ✅ (45<56, 60<77, 80<91 → 0/3 → reste en LP).
`applyMorphoAdaptations` → inchangé (morpho=null ET débutant : double bypass ✅).
Morpho-Card **non affichée** (débutant ✅). `insolvency {index:0}`, `sections=1`.
**Screenshots :** s7-*.png
**Verdict :** ✅ Correct — bypass débutant + seuils LP corrects.

### Scénario 2-PROD — réalité production (engine.min.js périmé)
**Comportement :** `engineLoaded:false`, toutes fns sprint `fn-absent`. Coach affiche
le placeholder « Importe des séances ». Voir **Finding #1**.
**Verdict :** 🔴 Tout le code engine des sprints est inerte en production.

---

## Bugs trouvés

| # | Scénario | Sévérité | Description | Fix recommandé |
|---|---|---|---|---|
| **1** | S2-PROD + statique | 🔴 **P0** | `engine.min.js` figé à v213 — Sprint B/C1/C2/C3a, Fix-Hardcoded, Sprint-3 FIX4/5, FIX 6 = code mort en prod ; insolvency dégradée | Régénérer `engine.min.js`, bumper SW, ajouter build script + garde CI |
| **2** | S5, S6 | 🟠 **P1** | Insolvency Index non borné : 5.78 / 2.48 (≫ seuil critique 1.4). `level` cap OK mais `index.toFixed(2)` affiché dans la note coach → UX alarmante | Borner l'affichage (`Math.min(index, critical×1.5)`) ou re-normaliser la formule ; revoir le plancher `recoveryBudget` 0.30 |
| **3** | S2, S3 | 🟡 **P2** | `computeStrengthRatiosDetailed` (engine.js:2527) : chaîne `getSmoothedE1RM()‖getTopE1RMForLift()‖0` ignore `bestPR`/`exercises.e1rm`. User avec PRs mais sans séance GO loggée → ratios vides (Diagnostic sections=1). Incohérent avec `computeStrengthRatios` (app.js, live) qui a le fallback `‖ e1rm()` | Aligner la chaîne de fallback de `computeStrengthRatiosDetailed` sur celle d'app.js (ajouter `‖ bestPR`) |
| 4 | S4 | ℹ️ Mineure | Conflit intra-morpho résolu silencieusement par ordre de clé objet (non documenté) | Documenter dans CLAUDE.md ou prioriser explicitement les morphotypes |
| 5 | S3 (latent) | ℹ️ Théorique | Audit-13 **B1** (passthrough NaN dans `calcInsolvencyIndex`) non déclenché ici mais non corrigé — guard logs-vides le masque | Ajouter `‖ isNaN(fatigueCost)` au guard (déjà recommandé audit 13) |

---

## Verdict global

| Axe | Résultat |
|---|---|
| Stabilité runtime (code sprint réel, engine.js) | ✅ 0 crash, 0 pageerror sur 7 scénarios pathologiques |
| Robustesse inputs (NaN/null/0/contradictoire) | ✅ Tous gérés gracieusement, 0 NaN visible UI |
| Logique FIX 6 (LP multi-lift) | ✅ Correcte (vérifiée via dérivation recalcBestPR) |
| Morpho / Joint stress / rendu conditionnel | ✅ Fonctionnels |
| **Déploiement** | 🔴 **CASSÉ — bundle engine.min.js périmé (Finding #1)** |
| Calibration Insolvency | 🟠 Index non borné (Finding #2) |

**Le code des sprints est sain et robuste à l'exécution. Le problème n'est pas le
code — c'est qu'il n'est pas déployé.** Finding #1 est bloquant et doit être traité
avant toute autre chose : tant que `engine.min.js` n'est pas régénéré, **aucun**
livrable Sprint B/C/Fix-Hardcoded/FIX 6 côté engine n'a d'effet en production, et
les audits fonctionnels (dont l'audit 13) valident du code qui ne tourne pas.

**Score brut du code sprint : 9.0/10** (robuste, 2 findings calibration/fallback).
**Score effectif en production : 2/10** (engine sprint inerte — Finding #1).
