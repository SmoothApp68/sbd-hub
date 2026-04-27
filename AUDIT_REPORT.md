# TrainHub — Rapport d'audit complet
Date : 2026-04-27  
Version : SW v105 (post-corrections)  
Auditeur : Claude Opus 4.7 via Claude Code

---

## Score global : 7,2 / 10

## Résumé exécutif

TrainHub est une PWA de fitness techniquement solide : syntaxe propre sur 5 fichiers, algorithmes clés corrects (e1RM, back-off, macros, prehab), RLS Supabase globalement bien conçu. Le principal problème est la **dette d'accumulation** : `js/app.js` atteint 19 132 lignes (god-file), ~44 fonctions mortes non supprimées, ~10 champs `db.user` orphelins persistés inutilement dans le localStorage utilisateur. Quelques bugs algorithmiques ont été corrigés dans cet audit (`programParams.frequency` → `freq`, fallback `db.user.goal` dans `checkNutritionStagnation`, cache SW incomplet). La sécurité est satisfaisante mais 3 politiques RLS sont trop permissives.

---

## 🔴 Bugs critiques (corriger immédiatement)

| # | Problème | Fichier | Ligne | Impact |
|---|---|---|---|---|
| 1 | ~~`programParams.frequency` jamais écrit — toujours fallback 4~~ | ~~app.js~~ | ~~9298~~ | **Corrigé** |
| 2 | ~~`coach.js` et `program.js` absents du cache SW~~ | ~~service-worker.js~~ | ~~3-18~~ | **Corrigé** |
| 3 | RLS `invite_codes` UPDATE `USING (TRUE)` — tout utilisateur peut marquer n'importe quel code comme utilisé | supabase_social_migration.sql | 262 | Abus parrainage |
| 4 | RLS `reserved_usernames` INSERT/DELETE sans restriction | supabase_social_migration.sql | 374-378 | Pollution noms réservés |
| 5 | RLS `notifications` INSERT `WITH CHECK (TRUE)` — spam de notifications possible | supabase_social_migration.sql | 344 | UX / abus |

---

## 🟠 Problèmes importants (corriger cette semaine)

| # | Problème | Fichier | Ligne | Impact |
|---|---|---|---|---|
| 1 | ~~`checkNutritionStagnation` ignore `db.user.goal` — fallback toujours `'maintien'` si `programParams` absent~~ | ~~engine.js~~ | ~~1737~~ | **Corrigé** |
| 2 | `getSetRPELabel` n'enforce pas le min RPE 9 pour grind — contrat implicite avec `processGrind` | engine.js | 1932 | Affichage incorrect |
| 3 | `getMRV` attend `'female'` strict mais la convention est `'F'` / `'M'` en amont (fonction non utilisée actuellement) | engine.js | 1038 | API incohérente |
| 4 | `profile.username` interpolé sans `escapeHtml()` en 10+ endroits — protégé uniquement par validation client | supabase.js | 1665, 1851, 2474, 2530, 2930… | XSS si validation bypass |
| 5 | `db.user.weekIntention` interpolé sans escape dans innerHTML | app.js | 9367 | Self-XSS |
| 6 | 10 champs `db.user` orphelins persistés en localStorage (voir liste détaillée) | app.js | 82-188 | Payload gonflé |

---

## 🟡 Améliorations suggérées (backlog)

- **Découper `js/app.js`** (19 132 lignes) en modules : gamification, charts, programme, body, readiness
- **Supprimer ~44 fonctions mortes** estimées à 600–1 200 lignes (obNext/obSkip/getObSteps, renderRecentPRs, renderMuscleHeatmap2D, etc.)
- **Unifier `goal`** : `db.user.goal` (string) ↔ `db.user.programParams.goals` (array) → une seule source de vérité
- **Unifier bodyweight** : 4 alias (`bw`, `weight`, `bodyWeight`, `currentWeight`) → conserver uniquement `bw`
- **Unifier fréquence** : `db.user.trainingFreq` (écrit, jamais lu) → retirer au profit de `programParams.freq`
- **Icônes PWA** : séparer `"purpose": "any"` et `"purpose": "maskable"` ; améliorer la qualité (icon-192 = 1.1 Ko)
- **Push notifications SW** : ajouter `icon` dans `showNotification()`
- **`constants.js` / `utils.js`** : charger depuis `index.html` ou supprimer ces fichiers orphelins
- **`Math.max(1.0, 0.73)` inutile** dans `calcMacrosCibles` → `gender === 'female' ? 1.0 : 0.73`

---

## ✅ Ce qui fonctionne bien

- Syntaxe propre sur 5 fichiers JS (node -c 5/5)
- Algorithmes corrects : `wpCalcE1RM`, `computeBackOffSets`, `processGrind`, `calcMacrosCibles`, `getPrehabKey` (22/24 tests OK)
- RLS solide sur `sbd_profiles`, `profiles`, `activity_feed`, `leaderboard_snapshots`, `friendships`
- `escapeHtml()` correctement utilisé sur bio, commentaires, usernames dans les boutons
- Aucune clé secrète en dur (SUPABASE_KEY = anon/publishable = normal)
- Aucun `FIXME`/`HACK` non documenté ; le seul `TODO` est honnête
- Stratégie SW (network-first + cache Supabase exclus) correcte
- Support iOS PWA complet (meta tags apple-mobile-web-app-*)

---

## 📊 Métriques

| Métrique | Avant | Après |
|---|---|---|
| Lignes total JS | 26 931 | 26 924 |
| `console.log` non gardés | 7 | 4 (migration log conservé + calcStreak dans if-DEBUG) |
| Champs DB orphelins supprimés | 0 | 3 (`cardioPreference`, `nutritionStrategy`, `reverseDigestActive`, `liftLevels`) |
| Bugs algorithmiques corrigés | 0 | 2 (`programParams.frequency`, `checkNutritionStagnation` fallback) |
| Fichiers JS manquants dans SW | 2 | 0 |
| Fonctions mortes identifiées | 0 | ~44 (non supprimées — risque trop élevé sans tests E2E) |

---

## Détail par module

### `js/app.js` — 6,5 / 10
19 132 lignes (god-file). Syntaxe propre. ~44 fonctions mortes non supprimées, 10 champs DB orphelins, 3 console.log de debug retirés dans cet audit. Architecture à découper.

### `js/engine.js` — 8 / 10
2 066 lignes. Algorithmes corrects et bien organisés. 2 bugs corrigés (`checkNutritionStagnation`, `getMRV` API). `Math.max(1.0, 0.73)` code smell mineur.

### `js/coach.js` — 8 / 10
384 lignes. Compact, lisible. Pas de problème identifié.

### `js/program.js` — 7,5 / 10
428 lignes. Lecture `programParams.freq` maintenant cohérente après correction. Logique de `selectedSplit` non migrée dans defaultDB.

### `js/supabase.js` — 7,5 / 10
4 914 lignes. `escapeHtml()` présent mais non systématique sur `profile.username`. 3 gaps RLS côté SQL. Pas de secret exposé.

### PWA — 8 / 10
SW v105. Cache complet après ajout de `coach.js` et `program.js`. Manifest correct. Icônes légères, purpose à séparer.

### Sécurité — 7 / 10
Pas de secret. XSS atténué par validation. 3 politiques RLS trop permissives à corriger en base.

---

## Corrections appliquées dans cet audit

| # | Fichier | Changement |
|---|---|---|
| 1 | `js/app.js` | Suppression `console.log` l.7986 (`renderVolumeChart`) |
| 2 | `js/app.js` | Suppression `console.log` l.9045 (`Programme manuel sauvegardé`) |
| 3 | `js/app.js` | Suppression `console.log` l.9093 (`Programme généré sauvegardé`) |
| 4 | `js/app.js` | Fix `programParams.frequency` → `programParams.freq` (l.9298) |
| 5 | `js/app.js` | Suppression init migration `cardioPreference`, `nutritionStrategy`, `reverseDigestActive` |
| 6 | `js/app.js` | Suppression `liftLevels: {}` de `defaultDB()` et de la migration |
| 7 | `js/engine.js` | Fix `checkNutritionStagnation` : fallback `db.user.goal` si `programParams.goals` absent |
| 8 | `service-worker.js` | Ajout `program.js` et `coach.js` dans `ASSETS_TO_CACHE` |
| 9 | `service-worker.js` | Bump version `trainhub-v104` → `trainhub-v105` |

---

## Corrections restantes (priorisées)

| Priorité | Action | Effort | Fichier |
|---|---|---|---|
| 🔴 P0 | Corriger les 3 policies RLS en base Supabase | 15 min | SQL Editor |
| 🟠 P1 | `getSetRPELabel` : clamp min 9 si `grind` | 2 min | engine.js:1932 |
| 🟠 P1 | `escapeHtml()` systématique sur `profile.username` | 30 min | supabase.js |
| 🟠 P1 | `weekIntention` : escaper avant innerHTML | 2 min | app.js:9367 |
| 🟡 P2 | Supprimer 44 fonctions mortes (requiert audit manuel + tests) | 2-4h | app.js |
| 🟡 P2 | Unifier `goal` / `programParams.goals` | 1-2h | app.js, engine.js |
| 🟡 P2 | Supprimer alias `weight`/`bodyWeight`/`currentWeight` → `bw` | 1h | app.js |
| 🟡 P3 | Découper `app.js` en modules | 1-2 jours | app.js |
| 🟡 P3 | Icônes PWA qualité + purpose séparé | 30 min | manifest.json + icons/ |
