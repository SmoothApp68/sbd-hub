# Audit 3a — Champs db.user

## Table complète

| Champ | defaultDB | migrateDB | Lectures | Problème |
|---|:---:|:---:|:---:|---|
| `name` | ✓ | ✓ | 12+ | — |
| `bw` | ✓ | — | 31+ | — |
| `height` | ✓ | ✓ | 3 | — |
| `age` | ✓ | ✓ | 3 | — |
| `gender` | ✓ | ✓ | 8 | — |
| `level` | ✓ | — | 16 | — |
| `targets` | ✓ | — | 14 | — |
| `trainingMode` | ✓ | ✓ | 21 | — |
| `onboarded` | ✓ | ✓ | 3 | — |
| `onboardingVersion` | ✓ | ✓ | 2 | — |
| `goal` | ✓ | ✓ | 5 | ⚠️ Doublon avec `programParams.goals[0]` (audit 2) |
| `kcalBase` | ✓ | — | 2 | — |
| `bwBase` | ✓ | — | 2 | — |
| `targetBW` | ✓ | ✓ | 1 | — |
| `cycleTracking` | ✓ | ✓ | 9 | — |
| `injuries` | ✓ | ✓ | 9 | — |
| `secondaryActivities` | ✓ | ✓ | 2 | ⚠️ Doublon avec `activities`, jamais lu par le moteur |
| `tdeeAdjustment` | ✓ | ✓ | 1 | — |
| `_realLevel` | ✓ | ✓ | **0** | 🔴 Écrit 3× (engine.js), jamais relu |
| `liftLevels` | ✓ | ✓ | **0** | 🔴 Init seul `{}`, jamais peuplé ni lu |
| `activities` | — | ✓ | 11 | ⚠️ Doublon avec `secondaryActivities` |
| `lpBridgeActive` | — | ✓ | 2 | — |
| `lpBridgeWeek` | — | ✓ | 1 | — |
| `cardioPreference` | — | ✓ | **0** | 🔴 Init seul, jamais écrit/lu ensuite |
| `nutritionStrategy` | — | ✓ | **0** | 🔴 Init seul (confondu avec `nutritionStrategyStartDate`) |
| `nutritionStrategyStartDate` | — | ✓ | 2 | — |
| `reverseDigestActive` | — | ✓ | **0** | 🔴 Init seul, jamais utilisé |
| `supersetPreference` | — | ✓ | 4 | — |
| `prehabEnabled` | — | ✓ | 4 | — |
| `uiDetail` | — | — | 3 | ⚠️ Écrit via `onchange` inline HTML (index.html:2555), pas dans migrateDB |
| `trainingFreq` | — | — | **0** | 🔴 Écrit 1× (l.9059), jamais lu — `programParams.freq` est utilisé |
| `trainingGoal` | — | — | **0** | 🔴 Écrit 1× (l.9061), jamais lu |
| `trainingDays` | — | — | 1 | ⚠️ Lu en fallback (l.5304), jamais écrit en JS |
| `trainingDuration` | — | — | 4 | ⚠️ Écrit 1× onboarding, lu dans le coach |
| `selectedSplit` | — | — | 1 | ⚠️ Écrit 1×, lu 1× (l.9306) — non migré |
| `pbAccent` | — | — | **0** | 🔴 Écrit 1× (l.9271), jamais relu |
| `equipment` | — | — | **0** | 🔴 Écrit 1× (l.9062), jamais relu |
| `weekIntention` | — | — | 2 | — (UI only) |
| `quizDone` | — | — | 1 | — |
| `_suppsMentionedAt` | — | — | 1 | — (timestamp coach) |
| `_lastNutrAdjustment` | — | — | 1 | — (timestamp nutr) |
| `protTarget` | — | — | 1 | ⚠️ Lu en fallback (l.10422), jamais écrit |
| `tdee` | — | — | 1 | ⚠️ Lu en fallback (l.10421), jamais écrit |
| `tier` | — | — | 1 | ⚠️ Lu (l.11566), jamais écrit en JS (vient de Supabase) |
| `bodyWeight` | — | — | 3 | ⚠️ Alias legacy de `bw`, jamais écrit |
| `weight` | — | — | 3 | ⚠️ Alias legacy de `bw`, jamais écrit |
| `currentWeight` | — | — | 2 | ⚠️ Alias legacy de `bw`, jamais écrit |
| `isCreator` | — | — | 1 | ⚠️ Lu (l.11558 `isCreator === true`), jamais écrit normalement |
| `email` | — | — | 4 | ⚠️ Lu depuis auth, écrit 1× seulement au reset |
| `supabaseId` | — | — | **0** | 🔴 Écrit 1× au reset (`''`), jamais relu |
| `programParams` | — | — | 27 | — (structure principale du programme) |

## Champs orphelins (écrits mais 0 lecture fonctionnelle)

| Champ | Lignes | Action recommandée |
|---|---|---|
| `_realLevel` | engine.js:1068,1070 | Brancher dans `validateUserLevel` ou supprimer |
| `liftLevels` | app.js:167 | Supprimer (remplacé par `level` + `programParams`) |
| `cardioPreference` | app.js:183 | Brancher dans le coach ou supprimer le champ |
| `nutritionStrategy` | app.js:184 | Supprimer (fonctionnellement mort) |
| `reverseDigestActive` | app.js:186 | Supprimer |
| `trainingFreq` | app.js:9059 | Supprimer — doublon non lu de `programParams.freq` |
| `trainingGoal` | app.js:9061 | Supprimer — doublon non lu de `programParams.goals` |
| `pbAccent` | app.js:9271 | Supprimer ou brancher dans l'UI |
| `equipment` | app.js:9062 | Supprimer ou migrer vers `programParams.mat` |
| `supabaseId` | app.js:19113 | Supprimer du reset (inutile) |

## Champs dupliqués

| Groupe | Champs | Problème |
|---|---|---|
| Bodyweight | `bw`, `bodyWeight`, `weight`, `currentWeight` | 4 aliases ; seul `bw` est canonique — les 3 autres sont des reliques |
| Goal | `user.goal`, `programParams.goals[0]` | 2 représentations du même concept (string vs array) — désync possible |
| Activités | `activities`, `secondaryActivities` | Distinction jamais documentée ; `secondaryActivities` jamais relu par le moteur |
| Fréquence | `user.trainingFreq`, `programParams.freq` | `trainingFreq` écrit mais jamais lu ; `programParams.freq` est l'actif |
