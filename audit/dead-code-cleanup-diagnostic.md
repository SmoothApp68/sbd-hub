# DIAGNOSTIC — Nettoyage code mort (Lot A Challenges + Lot B app.js)

> **Phase 1 — LECTURE SEULE. Aucune suppression.** Ancrage : `ROADMAP.md` + `ARCHITECTURE.md`.
> Point de départ : `audit/01-syntax.md` (mai 2026), **re-vérifié intégralement à frais** (le code a
> beaucoup évolué : Lots Challenges, sync #221/#222, et un nettoyage antérieur — ROADMAP TÂCHE 8).
>
> **Méthode** : pour chaque candidat, comptage par **frontière de mot** (`grep -w`) dans les
> **8 fichiers réellement chargés** par `index.html` (`engine, exercises, supabase, import, program,
> joints, coach, app`) **+ `index.html`**. `supabase.min.js`/`chart.min.js`/`supabase-cdn.min.js`
> **ne sont pas chargés** (vendor/build stale) → exclus du comptage.
> **Dispatch dynamique** : sweep global = **0** `window[...]`, **0** `globalThis[...]`, **0** `eval(`,
> **0** `new Function(`, **0** `setAttribute('on…')`. Tous les `.onclick =` sont des handlers anonymes
> sur des éléments DOM (aucun ne nomme un candidat). → **Il n'existe aucun appel par nom dynamique** :
> un compteur `grep -w = 1` (la def) prouve donc l'absence totale d'appelant (y compris onclick HTML,
> car un onclick généré en JS contiendrait le nom → compteur > 1).

---

## ⚠️ Corrections majeures vs audit de mai (re-vérif à frais)

1. **La majorité du « dead code » de mai est DÉJÀ SUPPRIMÉE** (26 des ~44 fonctions = **0 occurrence**,
   plus le bloc onboarding `obNext`/`obSkip`/`getObSteps` entier, plus 4 des 5 champs `db.user`).
   Le nettoyage antérieur (TÂCHE 8) les a déjà retirées. **Rien à faire dessus.**
2. **`getWeekKey` est VIVANT** (def app.js:8002 **+ usage app.js:20527**) — l'audit le disait mort
   (doublon de `_getWeekKey`). **Faux aujourd'hui → garder.**
3. **`wpRpeForPhase` est VIVANT** (def app.js:23106 **+ usage app.js:25255**). **Garder.**
4. **`db.user._realLevel` est VIVANT** — l'audit disait « 0 lecture ». Re-vérif : **lu 3×** dans
   `engine.js:3350, 3366, 3788` (`db.user._realLevel || db.user.level`). **Ne PAS retirer.**
5. **Lot B « champs db.user » = MOOT** : `cardioPreference`, `nutritionStrategy`,
   `reverseDigestActive`, `liftLevels` → **0 occurrence** (déjà retirés) ; `_realLevel` → vivant.
   **Commit 3 du prompt est sans objet.**
6. **Lot A est dans `app.js`**, pas `supabase.js` (le prompt situait `accept/sendFriendChallenge` côté
   `supabase.js`). `showCreateChallengeModal` est bien dans `supabase.js` (mais l.**4365**, pas 4252).

---

## LOT A — Résidus Challenges

| Fonction | Fichier:ligne def | # occ js | # occ html | dispatch dyn. ? | VERDICT |
|---|---|---|---|---|---|
| `showCreateChallengeModal` | supabase.js:4365 | 1 def **+ 1 commentaire** (app.js:7316) | 0 | non | **MORT confirmé** |
| `sendFriendChallenge` | app.js:7205 | 1 (def) | 0 | non | **MORT confirmé** |
| `acceptFriendChallenge` | app.js:7220 | 1 (def) | 0 | non | **MORT confirmé** |
| `renderFriendChallenges` | — | 0 (déjà retirée, PR #220) | 0 | non | DÉJÀ SUPPRIMÉ |

- `showCreateChallengeModal` (48 L, supabase.js:4365-4412) : ancienne modale « Créer un défi »,
  **remplacée par `showChallengePicker`**. Seule autre trace = un **commentaire** app.js:7316
  (« pattern showCreateChallengeModal ») → à reformuler en Phase 3 (sinon référence morte).
- `sendFriendChallenge` (14 L, 7205-7218) + `acceptFriendChallenge` (6 L, 7220-7225) : système **1v1
  abandonné**, seul code client touchant la table `friend_challenges` (insert l.7211 + update l.7222,
  **tous deux internes à ces 2 fonctions**). 0 appelant. ⚠️ La **table Supabase `friend_challenges`
  reste côté serveur** — hors périmètre (pas de RLS/DB touchés) ; elle devient simplement inutilisée.

**Lot A — SÛR à supprimer : 3 fonctions, ~68 L** (supabase.js ~48 L + app.js ~20 L).

---

## LOT B — Fonctions `app.js`

### B.1 — MORT confirmé (1 occ = def seule, 0 HTML, 0 dispatch) → **SÛR à supprimer**

| # | Fonction | Ligne def | Lignes | Note |
|---|---|---|---:|---|
| 1 | `toggleInjury` | 2333 | 10 | handler legacy onboarding `ob*` (écrit `obInjuries`, jamais appelé) |
| 2 | `selectCardio` | 2344 | 5 | handler legacy onboarding `ob*` (écrit `obCardio`, jamais appelé) |
| 3 | `renderWeeklySummary` | 8691 | 68 | |
| 4 | `renderTodayProgram` | 8763 | 36 | |
| 5 | `toggleSession` | 16355 | 4 | helper accordéon DOM (open/close) |
| 6 | `toggleScExo` | 16359 | 7 | helper accordéon DOM |
| 7 | `getSetStyle` | 19414 | 12 | |
| 8 | `getSetLabel` | 19427 | 9 | |
| 9 | `coachSelectDay` | 19520 | 4 | |
| 10 | `renderCoachDayDetail` | 19525 | 141 | grosse vue « détail jour coach » morte |
| 11 | `renderCoachReports` | 19860 | 4 | |
| 12 | `getPersonalProgressionRate` | 20044 | 21 | |
| 13 | `mapTrainingModeToGoal` | 20076 | 4 | |
| 14 | `getWorkSets` | 20081 | 11 | |
| 15 | `getRepRange` | 20093 | 11 | |
| 16 | `getRestSeconds` | 20105 | 11 | |
| 17 | `getWarmupSets` | 20119 | 47 | |
| 18 | `goShowAutoRegSuggestion` | 28771 | 22 | |

**Sous-total B.1 : 18 fonctions, ~427 L** (toutes dans `app.js`).

> Note (1)(2) : `toggleInjury`/`selectCardio` écrivent les globaux `obInjuries`/`obCardio` que
> `doGenerateProgram` (l.2350) lit encore. Comme ces 2 fonctions ne sont **jamais appelées**, les
> retirer **ne change rien au runtime** (les globaux gardent déjà leur valeur init). Un nettoyage
> complet du sous-système `ob*`/`doGenerateProgram` est **plus large → hors périmètre ici**.
> Note générale : ces 18 fonctions sont des **feuilles** (aucune ne s'appelle l'une l'autre — sinon
> compteur > 1). Leur retrait peut rendre de **nouveaux** helpers orphelins (2ᵉ ordre) → à re-scanner
> après coup, sans risque de correctness.

### B.2 — VIVANT (garder, rayé de la liste)

| Fonction | def | usage réel | VERDICT |
|---|---|---|---|
| `getWeekKey` | app.js:8002 | app.js:20527 | **VIVANT** |
| `wpRpeForPhase` | app.js:23106 | app.js:25255 | **VIVANT** |

### B.3 — DÉJÀ SUPPRIMÉ (0 occurrence — rien à faire)

`calcLiftWeight`, `checkProgressionSuggestions`, `getObSteps`, `getPerfIncrement`, `getStreakFreezes`,
`obNext`, `obSkip`, `onMuscleGroupClick`, `pbSliderInit`, `previewManualImport`, `progAddDay`,
`progRemoveDay`, `regenerateWeeklyPlan`, `renderCoachBriefing`, `renderDeloadBanner`, `renderDotsWilks`,
`renderFormScoreDash`, `renderMuscleHeatmap2D`, `renderProgressionSuggestions`, `renderReadinessSparkline`,
`renderRecentPRs`, `selectPath`, `toggleLiftCard`, `wpCheckPainScore`, `wpIsIsolation`, `wpRound05`
→ **26 fonctions déjà retirées.**

---

## LOT B — Champs `db.user` orphelins

| Champ | Écritures | Lectures | VERDICT |
|---|---:|---:|---|
| `_realLevel` | 3 (engine.js:1244/1246, init app.js:84/165) | **3** (engine.js:3350, 3366, 3788) | **VIVANT — garder** |
| `cardioPreference` | 0 | 0 | DÉJÀ SUPPRIMÉ |
| `nutritionStrategy` | 0 | 0 | DÉJÀ SUPPRIMÉ |
| `reverseDigestActive` | 0 | 0 | DÉJÀ SUPPRIMÉ |
| `liftLevels` | 0 | 0 | DÉJÀ SUPPRIMÉ |

→ **Aucun champ à retirer. Commit 3 sans objet.**

---

## LISTE FINALE « SÛR à supprimer » (MORT confirmé uniquement)

**Lot A (3) :**
- `supabase.js` : `showCreateChallengeModal` (4365-4412, 48 L) + reformuler le commentaire app.js:7316.
- `app.js` : `sendFriendChallenge` (7205-7218, 14 L), `acceptFriendChallenge` (7220-7225, 6 L).

**Lot B fonctions (18, toutes `app.js`)** : les 18 du tableau B.1.

| Cible | Fonctions | Lignes estimées |
|---|---:|---:|
| `supabase.js` | 1 | ~48 |
| `app.js` (Lot A) | 2 | ~20 |
| `app.js` (Lot B) | 18 | ~427 |
| **TOTAL** | **21** | **~495 L** |

**Aucun champ `db.user` à retirer.** Aucune action Supabase/RLS. Aucune dépendance de migration sur les
champs (les 4 candidats champs sont déjà absents ; `_realLevel` reste, sa migration app.js:165 est
légitime puisqu'il est lu).

---

## DOUTEUX / à trancher par Aurélien
- **Aucun DOUTEUX bloquant** : les 21 cibles sont MORT au sens strict (1 occ, 0 HTML, 0 dispatch dyn.).
- Décision d'opportunité : (a) **reformuler** le commentaire app.js:7316 lors du retrait de
  `showCreateChallengeModal` ; (b) le nettoyage plus large du sous-système `ob*`/`doGenerateProgram`
  est **hors périmètre** (à planifier séparément si souhaité).

---

## Plan Phase 3 (proposé, après validation)
- **Commit 1 — Lot A** (`supabase.js` + `app.js`) : retirer les 3 fonctions + reformuler le commentaire ;
  `node -c` 5 fichiers ; Playwright Social/picker intact.
- **Commit 2 — Lot B** (`app.js`) : retirer les 18 fonctions (par groupes cohérents : onboarding `toggle/select`,
  accordéon, coach, programme-gen, render*) ; `node -c` + Jest verts à chaque groupe.
- **Commit 3 — champs `db.user` : SUPPRIMÉ DU PLAN** (rien à retirer).
- SW bump groupé en fin. Vérif device : onboarding (`sob*`), GO, Stats, Social, Programme — 0 bouton
  mort, 0 `ReferenceError`.

**STOP. Aucune suppression effectuée. En attente de validation Aurélien de la liste « SÛR à supprimer ».**
