# CLAUDE.md — SBD Hub / TrainHub

> Constitution du dépôt, lue à chaque session. Respecte-la sauf instruction explicite contraire d'Aurélien.
> **Fichier vivant — tiens-le à jour quand une convention ou une valeur du code change.**
> Fusion de l'ancien « Contexte Complet TrainHub » (détail algos/données/historique) et de la constitution
> « SBD Hub » (état v349). En cas de conflit : **le code est la source de vérité, pas ce fichier.**
> Les valeurs marquées `[À VÉRIFIER]` n'ont pas été confirmées par grep — re-grep avant de t'y fier.

---

## 1. IDENTITÉ

**TrainHub** = nom **produit**. **SBD Hub** = nom du **repo** (`SmoothApp68/sbd-hub`, privé). Ne pas les opposer.

PWA fitness de powerlifting/powerbuilding (français), pour Aurélien et un petit groupe d'utilisateurs réels.
- URL : https://smoothapp68.github.io/sbd-hub — cible : Android Chrome.
- Positionnement : « Data-Driven Powerbuilding — l'algorithme de force piloté par votre physiologie ».
- Modèle : Freemium + Premium (gate IA en place, Stripe à venir).

---

## 2. ⚠️ DIVISION DU TRAVAIL (CRITIQUE)

Deux Claude, rôles séparés :
1. **Claude.ai (chat + MCP Supabase)** — fait **TOUT** ce qui touche Supabase : SQL, migrations, vérif des données, RLS. Diagnostics data + décisions coaching (avec Gemini) vivent là.
2. **Toi, Claude Code** — fais **TOUT** le travail repo : commits, PR, tests, refactors. **Tu n'as PAS accès à Supabase.**

**Conséquence** : si une tâche exige une action/vérification Supabase (lire des données, patcher une ligne, vérifier une RLS), **signale-le explicitement** dans ton rapport et route cette partie via Claude.ai. Ne tente jamais d'accéder à Supabase directement. Les prompts de tâche arrivent en `.md` (préparés côté Claude.ai) — ton rôle : les exécuter avec rigueur.

---

## 3. MÉTHODE (non négociable)

- **Diagnostic-first** : jamais « diagnostiquer ET fixer » d'un coup. Phase 1 = diagnostic **read-only** (aucune modif) → valider la cause → Phase 2 = fix **minimal**. Un diagnostic qui finit par STOP ne modifie rien.
- **1 prompt = 1 commit atomique.** Commits séparés si un prompt demande plusieurs changements distincts. Push après chaque commit.
- **Grep les vrais noms avant d'écrire du code** — audits et mémoire dérivent. Le code réel fait foi.
- **Ne touche JAMAIS aux RLS.**
- **Render pur** : le rendu du Coach ne produit **aucune écriture** en base (`db` identique après deux renders). Invariante. (Dette connue : `blockStartDate` muté au render, préexistant v230.)
- **Ne génère PAS de prompt/PR non demandé.** Un chantier à la fois ; noter-pour-plus-tard plutôt que scope-creep. Signale les problèmes hors-scope sans les corriger.

### La chaîne à 4 voix (coaching/algo)
Claude.ai (data Supabase) → toi, Claude Code (implémentation) → Gemini (validation coaching/seuils) → Aurélien (décision finale + vérif device). Ne court-circuite ni Gemini ni la vérif device sur les sujets de coaching.

---

## 4. CHECKS OBLIGATOIRES AVANT DE LIVRER

1. `node -c` sur les fichiers JS touchés (au minimum `app`, `engine`, + celui modifié).
2. **`npm test` vert.** Ajoute/inverse les tests dans le **même commit** que le fix ; vérifie que la fixture déclenche vraiment le chemin visé (un test qui ne teste pas ce qu'il prétend est pire qu'aucun test).
3. **Bump le Service Worker** : `CACHE_NAME` (`service-worker.js:1`) → version suivante. Actuel : **`trainhub-v350`**. Plus de littéral `SW_VERSION` depuis v321 — version dérivée du SW via `getSWVersion` (app.js:3597).
4. **Livre en PR — NE MERGE JAMAIS.** Aurélien vérifie sur **device** sur vraies données avant de merger. **Non optionnel** : un lot mergé sur CI verte seule a déjà laissé passer des bugs que les tests ne voyaient pas (facteur calorique volatile, e1RM affiché au lieu du PR).

---

## 5. STACK & ORDRE DE CHARGEMENT

Vanilla JS (pas de bundler, pas de framework, **pas de modules ES6**, **aucun CDN externe** — tout bundlé localement). GitHub Pages. Supabase (PostgreSQL, eu-west-1, free tier). Chart.js bundlé. Service Worker (offline complet). Sentry. Gemini Flash (Edge Function `coach-ai`, premium).

### Ordre RÉEL de chargement (index.html)
En `<head>` (defer) : `supabase-cdn.min.js` → `sentry.min.js` → `sentry-init.js`.
En fin de body (index.html:3422-3429, defer) :
```
engine.js → exercises.js → supabase.js → import.js → program.js → joints.js → coach.js → app.js
```
- `js/app.js` (~31,5k lignes) **TOUJOURS EN DERNIER. Règle absolue.**
- `js/coach.js` (arbitre d'intensité, `computeSRS`), `js/engine.js` (calculs purs), `js/program.js` (génération programme).
- ⚠️ **`js/stats.js` et `js/social.js` N'EXISTENT PAS** (stats + social vivent dans app.js). Le système de modales/toasts vit aussi dans app.js (pas de `js/ui.js`).
- Orphelin (cleanup) : `js/supabase.min.js` (le SDK actif est `supabase-cdn.min.js`).

---

## 6. RÈGLES DE DÉVELOPPEMENT

### Ne jamais faire
- Modifier une zone d'app.js sans l'avoir lue en entier.
- Refactoriser une fonction de calcul sans tests (`wpComputeWorkWeight`, `computeSRS`, `calcTDEE`…).
- Ajouter une dépendance CDN externe · créer un module ES6 · hardcoder des données utilisateur.
- Double-compter le tonnage (`MUSCLE_PARENT_MAP`, app.js:6396, gère l'accumulation correctement).
- **Faire dépendre une prescription d'un appel IA.** Le coaching de base est **100 % algorithmique** : l'algo décide les charges. **Gemini = couche premium de réponse** (répond aux questions user), **jamais dans la chaîne de décision.** (`canUseAI`/`askCoachAI`/`buildCoachPrompt`/`showPaywall`.)
- **`confirm()`/`alert()` natifs ou overlays artisanaux** → voir §UI overlays.

### Toujours faire
- `node -c` + `npm test` vert après chaque modif. Lire la zone AVANT de modifier. Un commit par changement, push après.
- Bumper `CACHE_NAME` après chaque feature précachée.
- Signaler les problèmes hors-scope sans les corriger.

### UI overlays (système unifié v313-320, ne pas régresser)
- Toute modale / feuille / confirmation / toast passe par : `showModal` · `showInfoModal` · `showConfirm({…danger, onConfirm})` · `showSheet({…})` · `showToast` (app.js:1328-1451).
- **Jamais** de `confirm()`/`alert()` natif, **jamais** d'overlay `createElement` artisanal.
- Cœur `_uiOpen`/`_uiClose`/`closeAllOverlays` (app.js:1379-1421) : pile LIFO, scroll-lock, Échap, tap-dehors.
- Fond des box : `var(--surface-solid)` (#1A1A2E, opaque). Z-index : vars `--z-nav/-banner/-overlay/-critical/-toast`.

### Pattern migrations DB
```js
// Dans migrateDB() (app.js) :
if (db.user.newField === undefined) db.user.newField = defaultValue;
```

---

## 7. PHILOSOPHIE PR vs e1RM (IMPORTANTE — racine de bugs réels)

- **e1RM = indicateur / tendance, JAMAIS un record.** Ne l'affiche **jamais** comme un chiffre à l'utilisateur. Il ne sert qu'en **coulisse** (pente, date de projection, pilotage des charges prescrites via `db.exercises[].e1rm`).
- **Le PR ne compte qu'en vraies barres** (`db.bestPR`, via `recalcBestPR` / `_exoMaxRealWeight`, plancher `onboardingPRs`) **ou** `repRecords`. Partout où un chiffre est **affiché ou comparé** à l'utilisateur → utilise `bestPR`, pas l'e1RM.
- `db.exercises[].e1rm` (registre DUP) = capacité courante qui pilote les charges prescrites — distinct du pic historique montré dans Records.
- Bugs typiques de la confusion : « stable autour de 169 kg » au lieu de 170 ; faux « ✅ objectif atteint » déclenché par un e1RM gonflé par du rep-work.

---

## 8. ALGORITHMES CLÉS

### `wpComputeWorkWeight(liftType, bodyPart)` (app.js:22715)
Refactorisée en 3 parties : `_wpComputeWorkWeightPenalties` (app.js:22483, calcule les multiplicateurs) + `_wpApplyWorkWeightBounds` (app.js:22586, applique dans l'ordre) + l'orchestrateur. Wrapper sûr : `wpComputeWorkWeightSafe` (app.js:25326).

**Ordre réel des pénalités / caps** (comment canonique app.js:22582, vérifié dans `_wpApplyWorkWeightBounds`) :
1. Base APRE depuis e1RM zone DUP + phase (`PHASE_MULT` : intro 0.90 / accumulation 0.95 / intensification 1.00 / peak 1.05 / deload 0.60).
2. Correction neuro transition hypertro→force : ×0.95 en S1 du bloc Force uniquement.
3. Cap APRE progression +5 %/sem sur les mains lifts.
4. **Sleep Penalty** : ×0.95 si `sleep ≤ 2/5` ce jour (checkin).
5. **RHR Penalty** : ×0.80 (danger) / ×0.95 (warning) — valide uniquement le jour de l'import Garmin.
6. **Weight Cut LPF** (`calcWeightCutPenalty`).
7. **Activity Penalty** : ×0.97 si flag volume secondaire (seuil DOTS-dépendant).
8. **Plancher combiné 60 %** : jamais < 60 % de la base pré-pénalité. ⚠️ **[DEAD — audit 01]** : `_prepenaltyBase` n'est **jamais écrit** (grep exhaustif) → `ctx.prepenaltyBase` toujours `undefined` → **ce plancher ne s'exécute pas actuellement** (app.js:23017). À réparer (écrire `_prepenaltyBase`) ou assumer sa suppression.
9. **APRE cap par phase** (`APRE_PHASE_CAPS` : intro 0.80 / accumulation 0.85 / hypertrophie 0.85 / force 0.92 / intensification 0.95 / peak 1.00 / deload 0.75 / recuperation 0.70).
10. **Weight Cut APRE block** : ×0.98 de l'e1RM courant si cut actif.
11. **Kill Switch compétition** : ×0.85 si déficit >2.5 % PdC ET ≤3j avant compétition.
12. **Mental Recovery** : ×0.97 (−3 %) après un fail rep.
13. **Return-to-Play** : facteur < 1 selon jours d'absence.
14. **Plancher cycle femme 70 %** de la base APRE.
15. **Hard Cap 102.5 %** e1RM · **Kill Switch cumulé** : `cumulPenalty < 0.70` → `forceActiveRecovery` (app.js:22940).

> ⚠️ **Cycle menstruel** : depuis Gemini v184, `C_cycle` s'applique sur le **VOLUME (sets)** via `getCycleCoeff()` dans `wpGeneratePowerbuildingDay`, **plus sur la charge** (la charge reste pleine pour préserver le stimulus neuro). Ne pas régresser vers une pénalité de charge.

### DUP — registres e1RM séparés (ne pas fusionner)
```js
getDUPZone(reps)  // engine.js:4914 : ≤5 → 'force', 6-12 → 'hypertrophie', >12 → 'vitesse'
// Zone Force ×1.00 · Hypertrophie ×0.94 · Vitesse ×0.88  (engine.js:4954-4955)
// getZoneE1RM(exo, zone) · applyDUPTethering (tethering ±15% entre zones [À VÉRIFIER le %])
```

### `calcE1RM` — formules distinctes selon l'usage (NE PAS FUSIONNER)
```js
// app.js:1729 — Brzycki simple (cap 20 reps), utilisée partout dans app.js :
function calcE1RM(w, r) { r = Math.min(r, 20); return r <= 1 ? w : Math.round(w / (1.0278 - 0.0278 * r)); }
// program.js:61-66 — epleyE1RM ET brzyckiE1RM séparées. ⚠️ [DEAD — audit 00] : les générateurs
// program.js (generatePLMesocycle/PBSession/MuscuWeek) ne sont PLUS appelés (supplantés par
// wpGenerate* dans app.js) → ces e1RM ne pilotent plus la génération réelle.
// wpCalcE1RM (app.js:22428) — RPE-aware, pour l'algo de charge. (JAMAIS un record.)
```

### SRS (Sport Readiness Score) — `computeSRS` (coach.js:672)
Basé ACWR via **TRIMP Force** (acute ÷15 / chronic ÷60). Cold-start → score 75. Guard : ACWR = 1.0 tant que chronic < 3 séances. HRV z-score intégré quand ≥7 jours dispo (capé ±3).
`[À VÉRIFIER]` pondérations exactes (sans HRV : ~ACWR 60 % / Readiness 20 % / Trend 20 % ; avec HRV : ~ACWR 40 % / HRV 30 % / Readiness 15 % / Trend 15 %) — non re-confirmées ligne à ligne.

### TRIMP (Training Impulse)
```js
// Force : Σ(sets × reps × RPE² × C_slot) ÷ 15  (normalisé Bannister)  [À VÉRIFIER C_slot]
// C_slot : main_lift 1.5, accessory 1.2, isolation 1.0
// Cardio : durée × RPE × C_spec
ACTIVITY_SPEC_COEFFICIENTS  // engine.js:4274 — VALEURS RÉELLES (recalibrées, ≠ ancien doc) :
//   natation 0.8 · course 1.1 · trail 1.3 · randonnee 0.5 · velo 0.9 · yoga 0.3 · pilates 0.5
//   ski 1.3 · arts_martiaux 1.4 · sports_collectifs 1.3 · escalade 1.2 · rucking 1.1
//   crossfit 1.5 · hyrox 1.4 · padel 1.1 · tennis 1.1 · (liste étendue)
```

### LP → APRE (3 Strikes)
```
Strike 1 (RPE ≥ cap) → retry même poids · Strike 2 → deload · Strike 3 → transition APRE (lpActive=false)
isInLP() : DOTS total SBD < seuil ET durée < 12 semaines.  État : db.user.lpActive / db.user.lpStrikes
```

### Calorique — `getDailyCaloricTarget` (app.js:15316) → `calcTDEE` (engine.js:1144)
- `calcTDEE` lit **`db.user.goal`** (un seul comptage) : `GOAL_KCAL` = recompo **−500** · seche **−600** · masse **+300** · maintien **0** · reprise **0** · force **+150**. (`PHASE_KCAL` retiré : plus de +300 hypertrophie appliqué à tous.)
- Facteur d'activité **plafonné 1.6** (3-5 séances/sem) **/ 1.7** (6+) / 1.3 (<3), basé sur la **fréquence 28j**. Diviseur « semaines couvertes » = `min(4, ancienneté de l'HISTORIQUE complet en semaines)` — **PAS** la fenêtre 7j ni la plus ancienne séance de la fenêtre (qui faisaient osciller le résultat).
- Base : Katch-McArdle si %gras connu, sinon Mifflin-St Jeor (taille+âge), sinon `bw × 33 × facteur`.
- Pas de bonus « jour de séance » (double comptage supprimé). Macros (`getDailyCaloricTarget`) : **P 2.2 g/kg, L 0.9 g/kg, reste glucides**. Réf. aurel_br : ~2672 kcal stable.
- `getTDEEForDay` supprimée (morte). `calibrateTDEE` (engine.js:1218) existe mais **dead code (0 appelant)** — cleanup.

---

## 9. INVARIANTES (ne pas régresser)

- **Arbitre d'intensité = SEULE voix du verdict d'intensité.** `collectIntensityContext` (app.js:18827) → `computeIntensityVerdict` (app.js:18637). Aucune carte ne doit prescrire repos/deload/décharge/intensification **hors arbitre** (survivants déjà purgés : Insolvency « Banqueroute », volume MRV étiqueté /sem, « sur-atteinte → 3 jours de repos »).
- **Matching des lifts SBD** : `getSBDType` (engine.js:824, `_getSBDTypeRaw` 809) est le **matcher canonique** — classe en `'squat'|'bench'|'deadlift'|null`. Exclut RDL/jambes tendues/stiff-leg via `/roumain|romanian|\brdl\b|jambes?\s+tendues?|stiff.?leg/` et les haltères pour le bench. **Utilise-le, pas `matchExoName` + libellé générique.** `predictPR` (app.js:9262) résout le lift via `getSBDType`.
- **Angle mort `matchExoName`** (engine.js:998, matcher générique) : « Jambes Tendues » (stiff-leg FR) **absent** de `_DIFF_ROOTS` → matche à tort « Soulevé de Terre ». **Ne PAS y toucher sans audit complet** (rayon global : import, records, synonymes, matching programme).
- **Render pur** (cf. §3) : Home (app.js:11079), gamification (7227/7509), leaderboard (8269) — freeze-at-render à généraliser.

---

## 10. SEUILS DIAGNOSTIC (calibrés Gemini — ROUGE = risque de blessure imminent SEULEMENT)

**Fil rouge du projet** : les seuils par défaut étaient calibrés pour un pratiquant occasionnel (~3 séances légères/sem) et condamnaient structurellement un powerbuilder assidu. Les chiffres sont souvent justes, l'alarme sur-calibrée. (Bugs réels : « Banqueroute », volume MRV 30j étiqueté /sem, articulaire 100 pts, S/B « Critique » à 1.04, 4035 kcal.)

`STRENGTH_RATIO_TARGETS` (engine.js:44) — valeurs réelles :
- **Squat/Bench** : idéal [1.10, 1.35], danger **< 0.85**.
- **Squat/Deadlift** : idéal [0.75, 1.05], danger **< 0.65 ou > 1.25**.
- **Bench/Deadlift** : idéal [0.65, 0.70], danger < 0.58.
- **OHP/Bench** : idéal [0.60, 0.65], danger < 0.50.
- **Row/Bench** : idéal [0.80, 1.00], danger **< 0.65** (vrai indicateur santé épaules).

- **Charge articulaire** (`calcWeeklyJointStress`, engine.js:3915, fenêtre 7j) : orange **130** / rouge **180** pts/sem (pas 70/100).
- **Volume spike** (`detectVolumeSpike`, engine.js:4680) : **détection** ≥ **+20 %** (`VOLUME_SPIKE_THRESHOLD = 0.20`, engine.js:4678) · **danger** > **+30 %** (`spike.increase > 30`, engine.js:2995).
- **Push/Pull** : zone saine **0.8–1.2** (sets 30j, élévations latérales neutres). *(Note : `app.js:15640` utilise `ideal:[0.80,1.10]` pour la carte volume — cohérence à surveiller.)*
- **Stagnation** : `classifyStagnation` (engine.js:2723). Libellés dédramatisés, ton non-punitif (la stagnation n'est pas un échec, le deload est une arme).

---

## 11. STRUCTURE DES DONNÉES

### localStorage — clé canonique **`SBD_HUB_V29`**
`STORAGE_KEY='SBD_HUB_V29'` (engine.js:11) : load/save partout (app.js:114/129/370, import.js, supabase.js). Migration depuis SBD_HUB_V26/27/28. Droit à l'oubli : `removeItem('SBD_HUB_V29')` (app.js:1675).
> 🔴 **P0 RGPD** `[CORRIGÉ audit 05 — était : « clé sans _V29, jamais relue → écriture orpheline bénigne »]` : `app.js:4388` écrit un db **complet** (santé + logs) sous `'SBD_HUB'` à chaque gain d'XP ; la suppression de compte (`app.js:1675`) n'efface que `SBD_HUB_V29` ; **`'SBD_HUB'` ∈ `FALLBACK_KEYS` (`app.js:113`) → relue au boot → le profil « supprimé » ressuscite.** Droit à l'oubli défait localement — à corriger en priorité.

```js
db = {
  user: {
    name, age, bw, height, gender, goal, // goal pilote calcTDEE
    // Onboarding refondu v337 : niveau + discipline SÉPARÉS + coachingStyle.
    // 'onboardingProfile' OBSOLÈTE ; ONBOARDING_PROFILES supprimée (app.js:1848).
    level,               // 'debutant'|'intermediaire'|'avance'  [À VÉRIFIER libellés exacts]
    mode,                // discipline (ex : 'powerbuilding')
    coachingStyle,       // 'prudent'|'classique'|'agressif' (choix obligatoire)  [À VÉRIFIER libellés]
    programParams: { freq, goal, level, intensity, goals[] },
    onboardingPRs, barWeight, units, tier,   // 'free'|'premium'
    lpActive, lpStrikes, activityTemplate,
    menstrualEnabled, weightCut, tdeeAdjustment,
    consentHealth, medicalConsent
  },
  logs: [],              // séances, plus récent en index 0
  exercises: { 'Squat (Barre)': { e1rm, shadowWeight, lastRPE, zones:{force,hypertrophie,vitesse} } },
  bestPR: { squat, bench, deadlift },   // VRAIES BARRES (jamais l'e1RM)
  weeklyPlan, activityLogs: [],
  gamification: { earnedBadges:{}, xpHighWaterMark:0 },  // XP ne descend jamais, badges jamais révoqués
  garminHealth, _ghostLogAnswered
}
ONBOARDING_VERSION = 4 (engine.js:12) · BW_FALLBACK_KG = 80 (app.js:6472) · getUserBW (app.js:6476)
```

### Supabase — tables **réellement référencées dans le repo** (`.from(...)`)
`sbd_profiles` (JSONB `data`, sync bidirectionnelle ; `bestPR` au 1er niveau = vraies barres ; check-in sous `data.readiness`/`readinessHistory` : `{sleep,energy,soreness,motivation,score,pain}`, `pain` nullable) · `workout_sessions` (colonnes dédiées `timestamp/volume/title/short_date/duration/exercise_count` + `data` JSONB ; détail dans `data.exercises[]` : `{name, sets, maxRM(=e1RM Brzycki), series[], allSets[{rpe,reps,weight,setType}], repRecords}` ; **work sets = `setType==='normal'`**) · `profiles` · `public_profiles` · `leaderboard_entries` · `leaderboard_snapshots` · `social_challenges` (pas de colonne `status` — l'état dérive de `end_date`) · `challenge_participants` · `friendships` · `heartbeats` · `error_logs` (télémétrie ; **jamais de données sensibles**) · `activity_feed` · `comments` · `reactions` · `notifications` · `push_subscriptions` · `invite_codes` · `reserved_usernames` · `bug_reports` · `waitlist`.
> `ai_rate_limits` : mentionnée côté data mais **non référencée dans le repo JS** (edge-function `coach-ai` ?) `[À VÉRIFIER via Claude.ai]`. Les tables `activity_logs`/`friend_challenges`/`user_consents`/`menstrual_logs` des anciens docs **ne sont plus référencées** dans le code.

---

## 12. FONCTIONS REFACTORISÉES (ne pas recombiner)

- **`renderGamificationTab`** (app.js:7569) — orchestrateur + sous-fonctions `_buildGamContext` / `_renderGam*` / `_renderLeaderboard` / `renderFriendChallenges`.
- **`getAllBadges`** (app.js:3911) — orchestrateur : `_computeBadgeStats` (1 pass) + `_build*Badges` (session/volume/durée/PR/SBD/streak/exercice/skill/status/collector) + `_applyWellnessTheme`.

---

## 13. GAMIFICATION · ACTIVITÉS SECONDAIRES · RGPD

**Gamification** : ~98 badges. Types `achiever` (permanent) / `status` (peut se griser, XP conservé). `db.gamification.earnedBadges` jamais révoqués ; `xpHighWaterMark` : XP ne descend jamais. Statuts : consistency (12 séances/mois), warrior (4/sem), volume_king (TRIMP>800/sem), early_bird (5 séances <9h/mois), comeback (reprise après 10j), pr_month (3 PRs/mois).

**Activités secondaires (v142)** : Template (prévu) ≠ Logs (réel), **ne pas mélanger**. `db.user.activityTemplate` vs `db.activityLogs` (source `'manual'|'garmin'|'ghost'`). `ACTIVITY_KEY_MAP` (onboarding→interne). Seuil `removeAccessories` adaptatif : DOTS<250 → 300 TRIMP · 250-400 → 450 · >400 → 600.

**RGPD & sécurité** : consentement santé (`db.user.consentHealth`, modal bloquante) + médical (`medicalConsent`). Droit à l'oubli : `delete_user_complete_data()` (RPC). Export JSON : `exportUserData()`. Backup séance IndexedDB par série. CSP dans index.html. **Toutes les tables avec RLS** — ne touche jamais aux RLS. 0 référence copyright.

---

## 14. NOMS VÉRIFIÉS (re-grep avant usage — peut dériver ; lignes confirmées v349)

- e1RM : `calcE1RM` (app.js:1729, Brzycki) · `wpCalcE1RM` (app.js:22428, RPE-aware) · `getBestE1RMForLift` (app.js:1780, S/B/D) · `getTopE1RMForLift` (engine.js:2562, regex, inclut OHP/row) · `epleyE1RM`/`brzyckiE1RM` (program.js:61/66).
- Lifts : `getSBDType` (engine.js:824) · `matchExoName` (engine.js:998, angle mort) · `predictPR` (app.js:9262 → retourne `reachable/reason/weeks/currentE1RM/dataPoints/weeklyGain`, seuil plateau 0.05 kg/sem) · `getDPIncrement` (app.js:22135, squat/dead +5, bench +2.5).
- Calorique : `getDailyCaloricTarget` (app.js:15316) → `calcTDEE` (engine.js:1144) · `calcTDEEKatchMcArdle` (engine.js:1137).
- Arbitre/readiness : `collectIntensityContext`/`computeIntensityVerdict` (**app.js** 18827/18637, PAS coach.js) · `computeSRS` (coach.js:672).
- Diagnostic : `calcWeeklyJointStress` (engine.js:3915) · `STRENGTH_RATIO_TARGETS` (engine.js:44) · `detectVolumeSpike` (engine.js:4680) · `classifyStagnation` (engine.js:2723).
- Constantes : `BW_FALLBACK_KG=80` (app.js:6472) · `getUserBW` (**app.js:6476**, pas supabase.js) · `ONBOARDING_VERSION=4` (engine.js:12) · `MUSCLE_PARENT_MAP` (app.js:6396) · `ACTIVITY_SPEC_COEFFICIENTS` (engine.js:4274) · `VOLUME_SPIKE_THRESHOLD=0.20` (engine.js:4678).
- Coach IA : `canUseAI`/`askCoachAI`/`buildCoachPrompt`/`showPaywall` · `renderWhyButton`/`openCoachQuestion`.
- **N'existent PAS** (ou morts) : `wpCalcE1RM` comme record · `canUseAICoaching` · `askCoachWhy` · `buildUserAccessoryPool` · `getTDEEForDay` (supprimée) · `calibrateTDEE` (existe engine.js:1218 mais **dead code**) · `PROJECT-STATUS.md` · `js/stats.js` · `js/social.js` · `js/ui.js`.

---

## 15. DONNÉES DE RÉFÉRENCE (aurel_br) — fournies via Claude.ai, non vérifiables côté repo

- 98 kg / 182 cm / 28 ans / H. `goal=recompo`, `mode=powerbuilding`, `level=avance`, `coachingStyle=agressif`.
- **VRAIES PR barres (`db.bestPR`)** : squat **145** / bench **140** / deadlift **170**. S/B réel **1.04**.
- e1RM (indicateurs coulisse, **PAS des records**) : squat ~157 / deadlift ~186-200. **Ne jamais les afficher comme PR.**
- Volume hebdo ~75k · ~20 séances/28j · ACWR ~1.26 · cible recompo **~2672 kcal** (P216/L88/G254).
- Deadlift loggé dans des séances titrées « Ischios Fessiers » (exercice « Soulevé de Terre (Barre) »).

### Identifiants Supabase (⚠️ corrigés — l'ancien doc attribuait l'ID de Léa à Aurélien)
- **Aurélien = `user_id 6e2936e7-de11-4f19-89b1-d1eb5968ba35`** (aurel_br).
- Autres users réels : Jordan (`0f1a1bf5…`) · **Léa (`9ed88c34…`)** · Alexis (`430d35d6…`) · Alex.
> Toute action sur ces lignes passe par **Claude.ai** (tu n'as pas accès à Supabase).

---

## 16. AURÉLIEN — ATTENTES

Délègue architecture/coaching (« c'est toi le coach ») **mais** attend une **reco claire + rationale**, pas des questions ouvertes ; choisit l'option la plus optimale et sûre. Valide les maquettes/specs avant implémentation. Un chantier à la fois. **Ne génère pas de prompt/PR non demandé. Ne merge jamais à sa place.**

---

## 17. BACKLOG (par priorité)

1. 🔴 **Chantier couleur global** : rouge = alertes only. Sortir le rouge des records, barres volume insuffisant, ratios. Phases de bloc (force = bordeaux #8b1a1a / hyper = violet #7c6bff / deload = cyan #64D2FF). Diagnostic inventaire → palette (Gemini) → maquette → impl.
2. **Morpho → seuils ratios** : brancher l'« Analyse morphologique » (carte Configurer) pour assouplir S/B, S/D (bras courts = bench avantagé). Diagnostiquer d'abord ce qu'elle collecte.
3. **Fiabiliser la pente/trend e1RM** (`getE1RMTrend`/`wpCalcE1RM`/`predictPR`). Socle commun sur-atteinte + projections.
4. **Auditer l'angle mort `matchExoName`** (« Jambes Tendues »/stiff-leg) sur `getRealRecords`, matching programme. Ne pas toucher `matchExoName` sans audit complet.
5. **Freeze-at-render global** (Home 11079, gamification 7227/7509, leaderboard 8269).
6. **RPE simplifié + incitation** (collecte low-friction facile/moyen/difficile en fin de séance, jamais punition).
7. **Disciplines mixtes / accents secondaires** (principale + accents modulant, pas multi-`trainingMode`).
8. **Découplage onboarding / cloud+email** (l'onboarding complet dépend de cloud+email pour s'afficher).
9. **Freemium/paywall** (#1 lancement) : gate IA existe (Gemini), reste Stripe. Ne pas créer `db.user.totalXP`.
10. **Onglet Analyse** (pausé, option B FC-indépendante : Intensité Relative, Répartition séries/pattern, Densité).
11. Réglages dégraisser (11 accordéons) · Plan unifier 2 builders · Corps SVG genré `renderBodyFigure`.

### Cleanups
Doublon séance Supabase 09/07 « Épaules / Bras » (hors repo, via Claude.ai) · `detectMomentum` orphelin · `calibrateTDEE` mort · `supabase.min.js` orphelin · `blockStartDate` muté au render (v230) · 🔴 `setItem('SBD_HUB')` app.js:4388 = **P0 RGPD** (résurrection post-suppression via FALLBACK_KEYS, cf. §11) · specs Playwright `audit-*.spec.js` (ancien markup) · band picker regex.

---

## 18. HISTORIQUE (Service Worker)

| SW | Feature principale |
|---|---|
| v128-v135 | Total Load Management, TRIMP, HRV, LP 3-Strikes, RGPD, DUP registres, PCr, Volume Spike, Tapering, Return-to-Play |
| v136-v150 | Warm-up, kg/lbs, cartes partage + waitlist, activités unifiées (Template+Logs), seuil adaptatif, badges status, refactos `renderGamificationTab`/`getAllBadges`, télémétrie error_logs |
| v151-v279 | Périodisation blocs, DUP macro/micro, deload auto, profils universels, calisthenics, SRS/PR légal, calibration débutant, weight cut, cycle menstruel, Bluetooth FC, churn, notifs J1-J30 |
| v280-v299 | Sentry, cardio stats (fusion logs+activityLogs), sparklines e1RM, sync cross-device (fusion non-destructive), retrait Défis onglet Jeux |
| v300-v312 | Nomenclature exercices (splits/fusions/family, templates → noms précis), polish modales 240ms |
| v313-v321 | Chantier overlays A (cœur `_uiOpen/_uiClose`, `showSheet`, `showConfirm`, 16 dialogues routés, `--surface-solid`, scroll-lock réel) · garde-fou version SW (`getSWVersion`) |
| **v322-v349** | Chantier Coach : **render pur**, calculs justes, Potentiel de Performance, **arbitre d'intensité** + profil agressivité + return-to-play + pain + deload cyan · **onboarding refondu v337** (niveau/discipline/coachingStyle séparés) · welcome-back boot local v338 · budget de blocs v340 · purge des contradictions v341 · ordre du Coach v342 · **justesse calorique + seuils** v343 (round 2 v344, round 3 v345 : diviseur 28j + projections) · fix matching deadlift v346 · message 6-cas + paliers en **PR réel** v348-v349 |
| **v350** | Objectifs SBD éditables depuis le Coach (✎ inline, multi-user) + bump SW v350 |

### Scores experts (historique, v149 — non actualisés)
Gemini pondéré 9.4/10 · Claude Code (Playwright) 8.5/10 · Gemini Architecture 8.5 · Algorithmes 9.8 · Gamification 9.6.
