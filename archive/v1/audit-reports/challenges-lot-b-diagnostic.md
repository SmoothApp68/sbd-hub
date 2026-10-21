# DÉFIS — Lot B Phase 1 : DIAGNOSTIC du scoring (lecture seule)

> **Branche** : `audit/challenges-lot-b-diagnostic` · **Base** : `main` · **Lecture seule** (aucun code applicatif modifié).
> **Suite de** : Lot A (PR #217, v294). **STOP après ce rapport** — implémentation (Phase 3) seulement après validation Aurélien + Claude.ai.
> **Rappel schéma confirmé** : `social_challenges(id, creator_id, title, description, type, target_value, target_exercise, start_date, end_date, created_at)` — **pas de colonne `status`** (actif/clos dérivé de `end_date` vs `now()`). `type ∈ {frequency, volume, weight}`. Lift → `target_exercise` rempli, `target_value` null.

---

## Q1 — Système cible & surfaces d'affichage

**Lot A a bien unifié vers le « système A »** : table `social_challenges` + `challenge_participants`, vocab `CHALLENGE_TYPES` (supabase.js:3964 → `volume/reps/weight/frequency/custom`), création `createChallenge` (supabase.js:4194). Le 1v1 `friend_challenges` est abandonné (cf. Lot A).

**Il existe DEUX surfaces d'affichage, MÊME source de données** (`social_challenges` + `challenge_participants` + `public_profiles`) :
| Surface | Fonction | Conteneur | Onglet |
|---|---|---|---|
| « classique » | `renderChallengesTab` (supabase.js:3980) → `renderChallengeCard` (4091) | `challengesActiveList`/`challengeTemplates`/`challengesFinishedList` | `#tab-social` |
| « V2 » (riche) | `renderFeedChallengesV2` (supabase.js:5069) | `feedChallengesContent` | `#feed-challenges` (index.html:3149) |

- **V2 lit la même source** : `challenge_participants` (5094), `social_challenges` (5095-5103), `public_profiles` (5126). Statut dérivé de `end_date` vs `now` (5130-5132 : `active = end_date > now`, `finished = end_date <= now`) → **conforme à l'absence de colonne `status`**. Pills 🟢 ACTIF / 🔵 OUVERT / ⚪ TERMINÉ.
- Classement : tri `current_value` desc dans les deux (4099 ; 5146/5184).

> **Implication scoring** : le score vit dans `challenge_participants.current_value`, lu par les **deux** surfaces. Calculer/écrire `current_value` suffit pour les deux. Le **hook de recalcul devra couvrir les deux renders** (Q6).

---

## Q2 — Le scoring existe-t-il ? (et le manuel à retirer)

**Aucun scoring automatique n'existe** : grep `computeMyChallengeScore` / `challengeScore` / `getChallengeRanking` / `scoreChallenge` = **0 résultat**. Le classement n'est qu'un tri de `current_value`.

**Scoring MANUEL existant (à retirer en Phase 3)** :
- `showUpdateChallengeProgress(challengeId)` (supabase.js:4281) — bottom-sheet avec un `<input number>` « Nouvelle valeur ».
- `updateSocialChallengeProgress(challengeId)` (supabase.js:4300) — lit l'input et écrit `challenge_participants.update({current_value: val})` (4305-4307). **C'est la saisie manuelle.**
- Boutons « 📝 Mettre à jour » qui l'appellent : `renderChallengeCard` (supabase.js:4136) **et** `renderFeedChallengesV2` (supabase.js:5168).

→ Phase 3 : remplacer ces 2 boutons + ces 2 fonctions par un calcul auto (`computeMyChallengeScore`) poussé au bon hook.

---

## Q3 — Affichage des scores : le piège `Math.round` (à corriger Phase 3)

Le `current_value` est affiché **arrondi à l'entier** partout :
- `renderChallengeCard` : `Math.round(val)` (supabase.js:**4120**), barre via `target_value` (4115/4121).
- `renderFeedChallengesV2` : `Math.round(myPart.current_value || 0)` (supabase.js:**5160**) et podium terminés `Math.round(p.current_value || 0)` (supabase.js:**5195**).

**Bug à venir** : dès que le scoring écrira un **ratio %PDC** (ex. e1RM/PDC ≈ `1.78`), `Math.round(1.78)` → **« 2 »** → faux/illisible. Aucun `%PDC`/`toFixed` n'est aujourd'hui appliqué à un score de défi (le ratio n'existe pas encore).

→ Phase 3 : formatage **par type** (entiers pour `frequency`/`volume` ; **1–2 décimales** ou **×100 « %PDC »** pour `weight`) aux 3 lignes ci-dessus. **Décision de format à confirmer en Phase 2** (cf. diagnostic Lot précédent : stocker l'e1RM en %PDC×100 = entier propre, OU stocker le ratio et `.toFixed(2)` à l'affichage).

---

## Q4 — Sources de données pour le scoring

**Par participant, chacun calcule SON propre score localement** (approche « calcul local » validée au diagnostic Lot A — préserve la vie privée : le poids de corps n'est exposé nulle part côté serveur ; on n'écrit que le résultat dans `current_value`). On **ne peut pas** calculer le score d'un autre participant (son `db.logs` est privé) → chaque appareil n'écrit que SA ligne.

**Source locale = `db.logs`** (toujours complet en local depuis P3-c). `workout_sessions` (mirroir cloud, `hydrateLogsFromCloud` supabase.js:522) n'est utile qu'à l'hydratation d'un appareil neuf — **pas nécessaire au scoring** (db.logs suffit).

Par métrique, sur la fenêtre **`[start_date, end_date]`** :
- **`frequency`** → nombre de logs `db.logs` avec `start ≤ timestamp ≤ end`.
- **`volume`** → Σ `log.volume` sur la fenêtre (et **÷ `getUserBW()`** pour la version normalisée, à confirmer Phase 2).
- **`weight`** (lift) → **meilleur e1RM** pour `target_exercise` sur la fenêtre.

⚠️ **`getLogsInRange(days)` (app.js:1578) est borné par *jours depuis maintenant*, PAS par une fenêtre absolue** → inadapté à `[start_date, end_date]`. Il faudra **filtrer `db.logs` par timestamps absolus** (la fonction pure de scoring prendra `startTs`/`endTs`).

**e1RM : NE PAS recalculer maison.** `wpCalcE1RM` **n'existe pas** (grep négatif). La fonction canonique est **`calcE1RM(w, r)`** (app.js:**1566**, Brzycki : `r≤1 ? w : round(w/(1.0278-0.0278r))`, cap 20 reps). **Mais** chaque exercice loggé porte déjà son e1RM calculé : `exercise.maxRM` (rempli à la création de séance via `calcE1RM`). → **Option recommandée** : prendre `max(exo.maxRM)` des exercices de la fenêtre dont `getSBDType(exo.name) === getSBDType(target_exercise)` (réutilise l'e1RM déjà stocké, zéro recompute maison). Option B : `calcE1RM` sur les sets. **À trancher Phase 2.**

**Poids de corps** : `getUserBW()` (app.js:**6252**, priorité `bw>bodyWeight>weight>currentWeight`), fallback `BW_FALLBACK_KG = 80` (app.js:**6248**).

---

## Q5 — `getSBDType`

Confirmé : **`getSBDType(name)`** (engine.js:**814**, mémoïsé via `_getSBDTypeRaw`) → mappe un nom d'exercice vers son type S/B/D (`squat`/`bench`/`deadlift`, ou null). Les `target_exercise` posés par Lot A (`Squat` / `Développé couché` / `Soulevé de terre`) seront mappés via `getSBDType` pour matcher les exercices loggés (noms variés). **À vérifier en Phase 3** que `getSBDType('Développé couché')` et `getSBDType('Soulevé de terre')` renvoient bien `bench`/`deadlift` (test unitaire).

---

## Q6 — Hook de recalcul

Le score doit être recalculé puis poussé dans `challenge_participants.current_value` (même écriture que `updateSocialChallengeProgress` 4305-4307, mais avec une valeur calculée). Points d'entrée candidats :

| Hook | Réf. | Avantage | Remarque |
|---|---|---|---|
| **Render onglet défis (V2)** | `renderFeedChallengesV2` supabase.js:5069 | surface principale moderne | recalculer MES défis actifs avant le rendu |
| **Render onglet défis (classique)** | `renderChallengesTab` supabase.js:3980 | seconde surface | idem |
| Fin de séance GO | `goFinishWorkout`/`convertWorkoutToSession` (app.js) | score frais immédiat | écriture réseau à chaque séance |
| Import Hevy | `import.js` (`executeImport`/`_doImportCSV`) | après gros import | rare |

**Recommandation** : un helper partagé `refreshMyChallengeScores()` appelé **au début de `renderFeedChallengesV2` ET `renderChallengesTab`** (les deux surfaces), qui pour chaque défi actif où je suis participant calcule `computeMyChallengeScore` et **n'écrit `current_value` que s'il a changé** (anti-spam réseau, comme le throttle de `syncLeaderboard`). Optionnellement aussi après la fin de séance. **À confirmer Phase 2** (un seul hook render suffit-il, ou faut-il aussi le post-séance ?).

---

## Synthèse pour la Phase 3 (périmètre pressenti, NON implémenté)

1. `computeMyChallengeScore(challenge, logs, bw, nowTs)` **pure** : switch sur `challenge.type` (`frequency`/`volume`/`weight`), fenêtre `[start_date, end_date]` (filtrage timestamps absolus), e1RM via `exo.maxRM`/`getSBDType`, normalisation %PDC isolée dans une fonction pure (`weight` et éventuellement `volume`).
2. Fix d'affichage aux 3 lignes (supabase.js:4120, 5160, 5195) — format par type.
3. Hook `refreshMyChallengeScores()` au render des 2 surfaces (Q6).
4. Retrait du scoring manuel (supabase.js:4281, 4300 + boutons 4136, 5168).
5. Tests Jest (computeMyChallengeScore + normalisation + getSBDType sur noms FR) ; Playwright (onglet défis : score affiché, pas de ReferenceError, ratio bien formaté).

---

## ⚠️ À router vers Claude.ai (vérifs Supabase — hors de ma portée)

1. **Confirmer** qu'une ligne `social_challenges` réelle + ses `challenge_participants` produisent le score attendu une fois `computeMyChallengeScore` branché (sur le compte **aurel_br, 532 séances**).
2. **Confirmer** que `start_date`/`end_date` délimitent correctement la fenêtre de scoring sur un vrai jeu de séances (Lot A écrit `start_date = now()` à la création ; vérifier qu'aucun défi existant n'a un `start_date` null/incohérent).
3. **Trancher** (zones grises produit, Phase 2) : (a) format de stockage des ratios %PDC (×100 entier vs ratio + `.toFixed`) ; (b) `volume` normalisé ÷PDC ou tonnage brut ; (c) e1RM = `exo.maxRM` stocké vs `calcE1RM` recalculé ; (d) hook render seul ou + post-séance.

---

## Écarts roadmap signalés
- `PROJECT-STATUS.md` toujours **absent** du repo (référencé dans les préférences).
- La fonction `wpCalcE1RM` mentionnée dans plusieurs prompts **n'existe pas** — la vraie est `calcE1RM` (app.js:1566). À corriger dans la doc/préférences.

*Fin de la Phase 1. Aucun code applicatif modifié. En attente de validation avant Phase 3.*
