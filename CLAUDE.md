# CLAUDE.md — SBD Hub

> Constitution du dépôt, lue à chaque session. Respecte-la sauf instruction explicite contraire d'Aurélien.
> **Ce fichier peut être mis à jour au fil du projet — tiens-le à jour quand une convention change.**

## Projet

**SBD Hub** : PWA de powerlifting/powerbuilding (français), pour Aurélien et un petit groupe d'utilisateurs réels. Vanilla JS, pas de bundler, hébergée sur GitHub Pages. Cible : Android Chrome.

- **Repo** : `SmoothApp68/sbd-hub` (privé).
- **Stack** : vanilla JS (`js/app.js` ~31k lignes, `js/supabase.js`, `js/engine.js`, `js/program.js`, `js/coach.js`, `js/stats.js`, `js/joints.js`, `js/import.js`, `js/exercises.js`, `js/sentry-init.js`), Supabase (PostgreSQL, eu-west-1, free tier), Chart.js, Service Worker, Sentry, Gemini Flash (Edge Function `coach-ai`, premium).
- **PWA** : Service Worker avec `CACHE_NAME` versionné (`vNNN`). **Tout changement fonctionnel doit bumper le SW.**

## ⚠️ Division du travail (CRITIQUE)

Il existe **deux Claude** sur ce projet, avec des rôles séparés :

1. **Claude.ai (chat + MCP Supabase)** — fait **TOUT** ce qui touche Supabase : requêtes SQL, migrations, vérification des données, RLS. C'est là que vivent les diagnostics data et les décisions coaching (avec Gemini).
2. **Toi, Claude Code** — fais **TOUT** le travail repo : commits, PRs, tests, refactors. **Tu n'as PAS accès à Supabase.**

**Conséquence** : si une tâche nécessite une action ou une vérification Supabase (lire des données, patcher une ligne, vérifier une RLS), tu ne peux pas la faire — **signale-le explicitement** dans ton rapport et indique à Aurélien de router cette partie via Claude.ai. Ne tente jamais d'accéder à Supabase directement.

Les prompts de tâche arrivent en `.md` (préparés côté Claude.ai). Ton rôle : les exécuter dans le repo avec rigueur.

## Méthode (non négociable)

- **Diagnostic-first** : jamais « diagnostiquer ET fixer » d'un coup. Phase 1 = diagnostic **read-only** (aucune modification) → valider la cause → Phase 2 = fix **minimal**. Un diagnostic qui se termine par un STOP ne modifie rien.
- **1 prompt = 1 commit atomique.** Commits séparés quand un prompt demande plusieurs changements distincts.
- **Grep les vrais noms avant d'écrire du code** — les audits et la mémoire dérivent. Le code réel est la source de vérité. (Voir « Noms vérifiés » plus bas, mais re-vérifie toujours.)
- **Ne touche JAMAIS aux RLS.**
- **Render lecture seule** : le rendu du Coach ne doit produire **aucune écriture** en base (`db` identique après deux renders). C'est une invariante — préserve-la.

## Checks obligatoires avant de livrer

1. `node -c` sur les 5 fichiers JS principaux (app, supabase, engine, program, + celui touché).
2. `npm test` **vert** (ajoute/inverse les tests dans le **même commit** que le fix — un test qui ne teste pas ce qu'il prétend est pire qu'aucun test ; vérifie que la fixture déclenche vraiment le chemin visé).
3. **Bump le Service Worker** (`CACHE_NAME` → version suivante).
4. Livre en **PR — NE MERGE PAS.** Aurélien vérifie sur **device** avant de merger. **Cette règle n'est pas optionnelle** : un lot mergé sans vérif device a déjà laissé passer des bugs que les tests verts ne voyaient pas (facteur calorique volatile, e1RM affiché au lieu du PR). Les tests verts ne remplacent pas la vérif device sur vraies données.

## La chaîne à 4 voix (pour le coaching/algo)

Claude.ai (data Supabase) → toi, Claude Code (implémentation) → Gemini (validation coaching/seuils) → Aurélien (décision finale + vérif device). Ne court-circuite pas Gemini ni la vérif device sur les sujets de coaching : c'est ce qui garantit la justesse.

## Architecture & modèle de données

- **`sbd_profiles`** : une ligne par user, colonne `data` (JSONB unique). `bestPR` au 1er niveau du blob = **vraies barres** (squat/bench/deadlift). Check-in sous `data.readiness`/`readinessHistory` (`{sleep, energy, soreness, motivation, score, pain}`, `pain` nullable).
- **`workout_sessions`** : colonnes dédiées (`timestamp`, `volume`, `title`, `short_date`, `duration`, `exercise_count`) + `data` JSONB. Détail des exercices dans `data.exercises[]` : `{name, sets(count), maxRM(=e1RM Brzycki), series[], allSets[{rpe,reps,weight,setType}], repRecords}`. **Work sets** : `setType === 'normal'`.
- Autres tables : `heartbeats`, `social_challenges` (pas de colonne `status` — l'état dérive de `end_date`), `challenge_participants`, `ai_rate_limits`.

### Philosophie PR vs e1RM (IMPORTANTE)

- **e1RM = indicateur/tendance, JAMAIS un record.** Ne l'affiche jamais comme un chiffre à l'utilisateur. Il sert uniquement en **coulisse** (ex. calcul d'une pente/date de projection).
- **Le PR ne compte qu'en vraies barres** (`bestPR`, via `recalcBestPR`/`_exoMaxRealWeight`, plancher onboarding) **ou** `repRecords`. Partout où un chiffre est **affiché ou comparé** à l'utilisateur → utilise `bestPR`, pas l'e1RM.
- `db.exercises[].e1rm` (registre DUP) = capacité courante qui pilote les charges prescrites — distinct du pic historique montré dans Records.

## Noms vérifiés (re-grep avant usage — peut dériver)

- e1RM : `calcE1RM` (Brzycki, app.js:1720) + `wpCalcE1RM` (RPE-aware). `getBestE1RMForLift` (S/B/D). `getTopE1RMForLift` (engine.js:2562, regex, inclut OHP/row).
- `getSBDType` (engine.js:806/819) — classe un exercice en `'squat'|'bench'|'deadlift'|null`. **Exclut** RDL/stiff-leg via `/roumain|romanian|\brdl\b|jambes?\s+tendues?|stiff.?leg/`. Exclut aussi les haltères pour le bench. **C'est le matcher canonique des lifts de compétition — utilise-le, pas `matchExoName` + libellé générique.**
- `matchExoName` (engine.js:998) — matcher générique. ⚠️ **Angle mort** : « Jambes Tendues » (stiff-leg français) **absent** de `_DIFF_ROOTS` → matche à tort « Soulevé de Terre ». **Ne PAS y toucher sans audit complet** (rayon global : import, records, synonymes, matching programme).
- `predictPR(liftType, target)` (app.js:9255) — résout le lift via `getSBDType`. Retourne `reachable`, `reason`, `weeks`, `currentE1RM`, `dataPoints`, `weeklyGain`. Logique interne inchangée : toute correction d'affichage vit à l'appelant.
- `getDPIncrement` — incréments réalistes (squat/dead +5, bench +2.5).
- Calorique : `getDailyCaloricTarget` (app:15300) → `calcTDEE` (engine:1141). `calcTDEE` lit `db.user.goal` (recompo −500, sèche −500/−750, masse +250/300, maintien 0). Facteur d'activité sur fréquence **28j** (borné, `min(4, ancienneté historique en semaines)`), pas la fenêtre 7j.
- Coach AI : `canUseAI`/`askCoachAI`/`buildCoachPrompt`/`showPaywall`. `renderWhyButton`/`openCoachQuestion`.
- Arbitre d'intensité : `collectIntensityContext`/`computeIntensityVerdict`, `computeSRS` (coach.js). L'arbitre est **la seule voix du verdict d'intensité** — aucune carte ne doit prescrire un repos/deload concurrent hors arbitre.
- Diagnostic : `calcWeeklyJointStress` (engine:3894, fenêtre 7j), `STRENGTH_RATIO_TARGETS`, `detectVolumeSpike`, `classifyStagnation` (engine:3367).
- Constantes : `BW_FALLBACK_KG = 80`, `getUserBW` (supabase.js:6252), `ONBOARDING_VERSION` (engine.js:12, =4).
- **N'existent PAS** : `wpCalcE1RM` en tant que record, `canUseAICoaching`, `askCoachWhy`, `buildUserAccessoryPool`, `calibrateTDEE` (mort), `PROJECT-STATUS.md`.

## Seuils Diagnostic (calibrés Gemini — rouge = risque de blessure imminent SEULEMENT)

Le fil rouge du projet : les seuils par défaut étaient calibrés pour un pratiquant occasionnel (~3 séances légères/sem) et affolaient un powerbuilder assidu. Les chiffres sont souvent justes, l'alarme sur-calibrée. Seuils validés :
- Ratios : Squat/Bench danger < 0.85 ; Squat/Deadlift danger < 0.65 ou > 1.25 ; Row/Bench danger < 0.65 (vrai indicateur santé épaules).
- Charge articulaire : orange 130 / rouge **180** pts/sem (pas 70/100).
- Volume spike : danger > **+30 %** (pas +15 %).
- Push/Pull : zone saine 0.8–1.2 (sets 30j, élévations latérales neutres).
- Libellés dédramatisés, ton non-punitif partout (la stagnation n'est pas un échec, comme le deload est une arme).

## Aurélien — attentes

- Délègue architecture/coaching (« c'est toi le coach ») **mais** attend une reco claire + rationale, pas des questions ouvertes. Choisit toujours l'option la plus optimale et sûre.
- Valide les maquettes/specs avant implémentation. Un chantier à la fois ; noter-pour-plus-tard plutôt que scope-creep.
- **Ne génère PAS de prompt/PR non demandé.** Ne merge jamais à sa place.

## Données de référence (aurel_br)

98 kg / 182 cm / 28 ans / H. `goal=recompo`, `mode=powerbuilding`, `level=avance`, `coachingStyle=agressif`. PR vraies barres : squat **145** / bench **140** / deadlift **170**. S/B réel 1.04. Volume hebdo ~75k, ~20 séances/28j, ACWR ~1.26, cible calorique recompo **~2672** (P216/L88/G254). Deadlift loggé dans des séances titrées « Ischios Fessiers » (nom exercice « Soulevé de Terre (Barre) »).

## Backlog (par priorité)

1. 🔴 **Chantier couleur global** : rouge = alertes only. Sortir le rouge des records, barres volume insuffisant, ratios. Repenser les phases de bloc (force = bordeaux #8b1a1a / hyper = violet #7c6bff / deload = cyan #64D2FF). Diagnostic inventaire de tous les rouges → palette (Gemini) → maquette → impl.
2. **Morpho → seuils ratios** : brancher l'« Analyse morphologique » existante (carte Configurer) pour assouplir dynamiquement S/B, S/D (bras courts = bench avantagé = S/B bas normal). Diagnostiquer d'abord ce qu'elle collecte.
3. **Fiabiliser la pente/trend e1RM** (`getE1RMTrend`/`wpCalcE1RM`/`predictPR` — e1RM varie avec les reps). Socle commun sur-atteinte + projections ; si fiable un jour, la sur-atteinte pourra alimenter l'arbitre (en entrée, pas en verdict).
4. **Auditer l'angle mort `matchExoName`** (« Jambes Tendues »/stiff-leg) sur les autres surfaces à libellé générique (`getRealRecords`, matching programme). Ne pas toucher `matchExoName` sans audit complet.
5. **Freeze-at-render global** (Home app.js:11079, gamification 7227/7509, leaderboard 8269).
6. **RPE simplifié + incitation** (collecte low-friction facile/moyen/difficile en fin de séance, incitation par valeur jamais punition).
7. **Disciplines mixtes / accents secondaires** (discipline principale + accents modulant, pas multi-`trainingMode`).
8. **Découplage onboarding / cloud+email** (l'onboarding complet dépend de cloud+email pour s'afficher).
9. **Freemium/paywall** (#1 lancement) : gate IA existe (Gemini), reste Stripe. Ne pas créer `db.user.totalXP`.
10. **Onglet Analyse** (pausé, option B FC-indépendante : Intensité Relative, Répartition séries/pattern, Densité encadrée).
11. Réglages dégraisser (11 accordéons) · Plan unifier 2 builders · Corps SVG genré `renderBodyFigure`.

### Cleanups
Doublon séance Supabase 09/07 « Épaules / Bras » (hors repo, à supprimer via Claude.ai) · `detectMomentum` orphelin · `calibrateTDEE` mort · `supabase.min.js` orphelin · `blockStartDate` muté au render (préexistant v230) · specs Playwright `audit-*.spec.js` (ancien markup) · band picker regex.
