# DÉFIS AUTOMATIQUES — Diagnostic (Phase 1)

> **Branche** : `audit/auto-challenges-diagnostic` · **Base** : `main` · **Lecture seule** (aucune modif, aucune écriture).
> **Réfs** : `ROADMAP.md`, `ARCHITECTURE.md` lus. **`PROJECT-STATUS.md` est référencé dans les préférences mais N'EXISTE PAS dans le repo** (à créer ou cesser de référencer). La note roadmap « Cloud sync broken » est obsolète — sync non concernée ici.

---

## ⚠️ Découverte structurante : il existe DEUX systèmes de défis (à ne pas confondre)

| | **A. `social_challenges`** (ouvert) | **B. `friend_challenges`** (1v1) |
|---|---|---|
| Tables | `social_challenges` + `challenge_participants` | `friend_challenges` (valeurs intégrées) |
| Modèle | **Ouvert** : N participants rejoignent (`joinChallenge`), « qui fait le plus » | **1v1** : challenger vs challenged, accept en 24 h |
| Création | `createChallenge()` (supabase.js:4194), `showCreateChallengeModal()` (4145), templates (3972) | **`sendFriendChallenge(friendUserId, metric, periodDays)`** (app.js:7205) |
| Métriques (vocab) | `volume / reps / weight / frequency` (CHALLENGE_TYPES, supabase.js:3964) | `volume / sessions / squat_e1rm / bench_e1rm / dead_e1rm / dots` (app.js:7309) |
| Valeur par joueur | `challenge_participants.current_value` | `friend_challenges.challenger_value` / `challenged_value` |
| Rendu | `renderChallengesTab()` (3980) / `renderChallengeCard()` (4091) | `renderFriendChallenges()` (app.js:7293, section `gamChallengesSection`) |
| Scoring actuel | **manuel** (`updateSocialChallengeProgress` 4299) | **inexistant** : aucun writer de `challenger_value`/`challenged_value` (grep) → tout 1v1 actif affiche « Toi : 0 vs Adversaire : 0 » |
| État | fonctionnel (sauf scoring manuel) | send/accept/render OK, **scoring jamais branché** |

**Le picker cassé appartient au système B (1v1), pas au A.** `showChallengePicker()` (app.js:7332) est ouvert depuis l'état vide de `renderFriendChallenges()` (« Défier un ami », app.js:7306) ; ses 5 métriques == `friend_challenges.metric` (7309). Le maillon manquant `selectChallengeMetric` devait : *métrique choisie → choisir l'ami → choisir la durée → `sendFriendChallenge(...)`*.

**Or la vision §1** (« défi **ouvert**, les amis **rejoignent**, avec option d'inviter un ami ») décrit le système **A** (ouvert + join). Le 1v1 (B) ne correspond qu'au sous-cas « inviter un ami précis ».

### 🔑 Décision produit n°1 (à confirmer par Aurélien) — quel système porte la vision ?
- **Recommandé** : **bâtir sur A (`social_challenges`, ouvert)**, car §1 veut explicitement « ouvert + les amis rejoignent ». Repointer le picker → `selectChallengeMetric` → **`createChallenge()`** (avec les 5 métriques + durée). L'infra A (join, leaderboard, podium) est déjà fonctionnelle.
- **« Inviter un ami précis »** = soit (a) **réutiliser B (`friend_challenges`)** pour le 1v1 nommé (déjà : opponent + accept), soit (b) ajouter `invited_user_id` à A (évolution schéma). 
- À trancher : garde-t-on B en parallèle (1v1) ou consolide-t-on tout sur A ? (Deux systèmes = doublon/confusion ; mais B a déjà l'« invite nommé + accept ».)

> Le reste du diagnostic est écrit pour l'option recommandée (**A = cœur**), en signalant les points B.

---

## Q1 — Le maillon `selectChallengeMetric`

**Manquant** (confirmé : 0 définition ; seul usage = l'`onclick` app.js:7342). Forme attendue par `createChallenge(templateData)` (supabase.js:4198-4204) :
```js
{ label, type, exercise /*=target_exercise*/, target /*=target_value, nullable*/, duration /*jours → end_date*/ }
```
- Mapping picker → A : `sessions`→`{type:'sessions'}`, `volume`→`{type:'volume'}`, `squat_e1rm`→`{type:'squat_e1rm', exercise:'Squat'}`, idem bench/dead. `target:null` (pas de cible chiffrée : « qui fait le plus »).
- **« Pas de target » géré ✅** : `renderChallengeCard` trie par `current_value` desc (4099) et n'affiche la barre de progression QUE si `challenge.target_value` (4115/4121). Sans target → simple classement. Le classement par `current_value` suffit.
- **Mais** : `createChallenge` ne pose **pas** de `start_date` (insert 4218-4225 : seulement creator_id/title/type/target_value/target_exercise/end_date) → la fenêtre de scoring devra utiliser `created_at` (toujours présent) comme début, OU faire poser `start_date` à la création. À décider (Q2/Q4).
- **Vocabulaire de type** : `CHALLENGE_TYPES` (supabase.js:3964) ne connaît que `volume/reps/weight/frequency/custom`. Les 5 métriques (`sessions/volume/squat_e1rm/bench_e1rm/dead_e1rm`) tomberaient sur `custom` (icône/label/unité génériques 3969) → **il faudra étendre `CHALLENGE_TYPES`** avec ces 5 clés (icône/label/unité) pour un affichage correct.

> Pour l'option B (si maintenue) : `selectChallengeMetric(key)` → ouvrir un sélecteur d'ami (`getAcceptedFriendIds`/profils) + durée → `sendFriendChallenge(friendId, key, days)`.

---

## Q2 — Calcul automatique du score par métrique

Fonction à créer (pure, testable) : **`computeMyChallengeScore(type, exercise, startTs, endTs)`** → renvoie le `current_value` (normalisé selon le type). Briques existantes :

| Métrique | Données / fonction | Calcul (fenêtre `[startTs, endTs]`) |
|---|---|---|
| `sessions` | `db.logs` (filtre date) | **count** des logs dans la fenêtre. **Brut** (pas de normalisation). |
| `volume` | `db.logs[].volume`, `getUserBW()` (app.js:6252) | Σ `volume` des logs dans la fenêtre **÷ BW local**. |
| `squat/bench/dead_e1rm` | `db.logs[].exercises[]`, `getSBDType()` (engine.js:814), `calcE1RM()` (app.js:1092) | meilleur e1RM de l'exo SBD ciblé **dans la fenêtre** **÷ BW local**. |

Précisions :
- **Fenêtre absolue** : `getLogsInRange(days)` (app.js:1578) borne par *jours depuis maintenant* — inadapté à `[start,end]`. → filtrer `db.logs` directement par `l.timestamp >= startTs && l.timestamp <= endTs`.
- **e1RM ciblé** : `getAllBestE1RMs()` (app.js:4501) donne le best **courant** (toutes dates) — pas fenêtré. Pour la fenêtre : itérer les logs de la fenêtre, pour chaque `exercises[]` où `getSBDType(name)===('squat'|'bench'|'deadlift')`, prendre `max(calcE1RM(set.weight, set.reps))` (ou `exo.maxRM`). 
- **Réutilisable** : `calcLeaderboardMetrics()` (app.js:4180) calcule déjà `volume_week` (4194) et `sessions_week` (4228) sur 7 j fixes — même logique à généraliser à une fenêtre arbitraire, mais NE PAS la modifier (elle sert le leaderboard) ; en extraire/dupliquer la logique dans `computeMyChallengeScore`.
- **« courant vs fenêtre » pour e1RM** : décision produit — un défi e1RM « qui pousse le plus lourd pendant la période » = best **dans la fenêtre** (recommandé, équitable). À confirmer.

---

## Q3 — Normalisation %/PDC — l'approche « calcul local » est-elle viable ? **OUI**

**Confirmé faisable et même préférable (vie privée).** Chaque appareil calcule SON score déjà normalisé avec SON `getUserBW()` local et n'écrit que le ratio dans `current_value`. Le BW de personne n'est exposé (cohérent avec le fait que `public_profiles` n'a aucun champ poids — vérifié côté base). Le classement `renderChallengeCard` trie `current_value` desc → compare des ratios déjà normalisés. ✅

**Implications à traiter :**
- **Unité de `current_value`** : devient un **ratio** pour volume (volume÷BW, ex. 20000/80 = 250) et e1RM (e1RM÷BW, ex. 1.78). `sessions` reste un **entier brut**.
- **⚠️ Problème d'affichage (bug latent)** : `renderChallengeCard` affiche `Math.round(val) + unit` (supabase.js:4120) et `renderFriendChallenges` aussi (`Math.round(myVal)`, app.js:7324). **`Math.round(1.78)` = 2** → un ratio e1RM serait écrasé. → **Convention de stockage recommandée** : stocker l'e1RM normalisé en **% PDC ×100** (`Math.round(e1rm/bw*100)` → ex. `178`, affiché « 178 %PDC ») ; volume÷BW arrondi entier (ex. `250`) ; `sessions` entier. + **adapter l'unité par type** dans `CHALLENGE_TYPES` (e1rm → `%PDC`, volume → `×PDC`/`pts`, sessions → `séances`). Un petit ajustement du rendu (formatage par type) sera nécessaire — à acter en Lot B.
- **Cohabitation sessions (brut) vs ratios** dans le même champ `current_value` : **sans risque** — la comparaison est **intra-défi uniquement** (tous les participants d'un défi partagent le même `type`). Confirmé. ✅
- **Précision/arrondi** : ×100 pour e1RM préserve 2 décimales de ratio sous forme d'entier (compatible `Math.round`). 

---

## Q4 — Quand recalculer le score ?

Aucun recalcul auto aujourd'hui (A = manuel, B = inexistant). Recommandation :
- **Hook principal** : à l'**ouverture/rendu** des défis — dans `renderChallengesTab()` (et/ou `renderFriendChallenges()`), pour chaque défi **actif où je suis participant**, calculer `computeMyChallengeScore(...)` et **mettre à jour `current_value` SEULEMENT s'il a changé** (évite les écritures réseau inutiles).
- **Hook secondaire** : après une séance — à la fin de `convertWorkoutToSession`/`goFinishWorkout` (app.js), pousser mon score pour mes défis actifs (les nouvelles données comptent immédiatement).
- **Écriture** : réutiliser le pattern existant `challenge_participants.update({current_value}).eq('challenge_id',…).eq('user_id',…)` (supabase.js:4305-4307). Pour B : `friend_challenges.update({challenger_value|challenged_value})` selon que je suis challenger ou challenged (nécessite de connaître mon rôle).
- **Anti-spam** : comparer au `current_value` connu avant d'écrire ; throttle possible (comme `syncLeaderboard` 5 min). Le calcul local est gratuit ; seule l'écriture est réseau.
- **Remplacement du manuel** : `showUpdateChallengeProgress`/`updateSocialChallengeProgress` (saisie manuelle) deviennent inutiles → à retirer (Lot B) ou neutraliser.

---

## Q5 — Inviter un ami précis (schéma = tâche Claude chat)

- **`social_challenges` n'a aucun champ adversaire** (confirmé base). Options pour « inviter un ami » sur le système A :
  1. **Colonne `invited_user_id`** sur `social_challenges` (la plus simple ; NULL = ouvert, sinon défi visible/poussé à cet ami). **Recommandé.**
  2. **Pré-insérer** l'ami dans `challenge_participants` (current_value 0) → il apparaît invité ; mais pas de notion « invité vs rejoint volontairement ».
  3. Table d'invitations dédiée (overkill ici).
- **Alternative sans schéma** : **réutiliser `friend_challenges`** (système B) pour le cas 1v1 nommé — il a DÉJÀ `challenged_id` + accept. Si on garde B pour l'invite et A pour l'ouvert, **aucune évolution schéma** n'est requise pour l'invite.
- **UI** : après le choix de métrique (+ durée), un **sélecteur d'ami optionnel** (liste via `getAcceptedFriendIds()` + `public_profiles`) — vide = défi ouvert, choisi = invitation.
- **→ Tâche Claude chat** : si option 1 retenue, `ALTER TABLE social_challenges ADD COLUMN invited_user_id uuid` + RLS (l'invité doit pouvoir lire/rejoindre).

---

## Q6 — Durée choisie à la création

Le picker ne demande pas la durée. `createChallenge` gère déjà `duration`→`end_date` (4204/4214-4215) ; `sendFriendChallenge` prend `periodDays` (7205/7210). → **Ajout UI minimal** : dans le flux `selectChallengeMetric` (après la métrique), un petit choix **7 / 14 / 30 j (ou libre)** — réutiliser le `<select>` déjà présent dans `showCreateChallengeModal` (supabase.js:4182-4187 : 3/7/14/30). Passer la valeur dans `templateData.duration`.

---

## Q7 — Hors-scope / risques (signalés, non agis)

- **Deux systèmes parallèles** (A ouvert / B 1v1) → la décision n°1 doit trancher pour éviter de coder deux fois. Le picker mélange les deux mondes (UI 1v1, métriques communes).
- **Scoring B jamais implémenté** : `challenger_value`/`challenged_value` n'ont aucun writer → tout défi 1v1 actif affiche « 0 vs 0 » aujourd'hui (régression silencieuse).
- **Affichage `Math.round`** (4120, 7324) incompatible avec les ratios → à ajuster (Q3).
- **`createChallenge` n'écrit pas `start_date`** → fenêtre de scoring à ancrer sur `created_at` (ou faire poser `start_date`).
- **Vocab de type incohérent** : `CHALLENGE_TYPES` (volume/reps/weight/frequency) ≠ 5 métriques cibles → étendre la map (sinon fallback `custom`).
- **Métrique `dots`** présente dans `friend_challenges.metricLabel` (7309) mais hors des 5 métriques de la vision → décider keep/drop.
- **Système SOLO intact** : `updateChallengeProgress()` (app.js:6708, quêtes hebdo `db.weeklyChallenges`) est un système DIFFÉRENT — **non touché**, confirmé.
- **`PROJECT-STATUS.md` absent** du repo (préférences à corriger).

---

## Plan d'implémentation proposé (lots)

> Sous l'option recommandée (**A = `social_challenges` cœur ouvert**).

### Lot A — Débloquer la création (toi, code)
- Implémenter `selectChallengeMetric(key)` : mappe la métrique → `templateData` (label/type/exercise) + **choix de durée** (Q6) → `createChallenge(templateData)`.
- Étendre `CHALLENGE_TYPES` (supabase.js:3964) avec `sessions/volume/squat_e1rm/bench_e1rm/dead_e1rm` (icône/label/unité).
- Repointer le picker (qui sort de `renderFriendChallenges`) vers le rendu A (`renderChallengesTab`) OU décider de l'entrée UI.
- **Vérif Playwright de navigation** : ouvrir le picker → choisir métrique → défi créé visible (handler défini, pas de ReferenceError).
- *Claude chat* : rien (terrain vierge, aucune donnée).

### Lot B — Scoring automatique + normalisation (toi, code)
- `computeMyChallengeScore(type, exercise, startTs, endTs)` (pure, testée) — Q2/Q3 (e1RM & volume ÷ BW, stockage ×100 pour e1RM ; sessions brut).
- Hook de recalcul (Q4) : au render des défis + après séance ; update `current_value` seulement si changé.
- Adapter l'affichage des valeurs normalisées (unité par type ; ne pas `Math.round` un ratio brut) — supabase.js:4120.
- Retirer/neutraliser le scoring manuel (`showUpdateChallengeProgress`/`updateSocialChallengeProgress`).
- Tests unitaires purs sur `computeMyChallengeScore` (fenêtre, normalisation, sessions brut).
- *Claude chat* : confirmer que `current_value` (numeric) accepte les ratios ×100 ; vérifier RLS update participant.

### Lot C — Invitation d'un ami + schéma (toi + Claude chat)
- *Claude chat* : `social_challenges.invited_user_id` (+ RLS) **OU** décision de réutiliser `friend_challenges`.
- *Toi* : sélecteur d'ami optionnel après la métrique ; filtrage d'affichage (défis qui m'invitent).
- Décider du sort de `friend_challenges` (le garder pour le 1v1 nommé, ou le déprécier au profit de `invited_user_id`).

---

## Décisions produit à confirmer par Aurélien
1. **Système cible** : tout sur `social_challenges` (ouvert) + invite via `invited_user_id` ? OU garder `friend_challenges` pour le 1v1 nommé en parallèle ? (cf. Décision n°1.)
2. **e1RM** : score = meilleur e1RM **réalisé pendant la fenêtre** (recommandé) ou e1RM **courant** au moment du calcul ?
3. **Unité d'affichage** des scores normalisés : « %PDC » pour les e1RM, quoi pour le volume÷BW (« pts » ? « ×PDC » ?).
4. **Métrique `dots`** : la conserver comme 6ᵉ métrique ou la retirer ?
5. **Métrique `volume`** : volume = tonnage `db.logs[].volume` ÷ BW — OK ? (rappel : `_computeSetTonnage` gère déjà le poids du corps pour certains exos.)

*Fin du diagnostic Phase 1. Aucune modification de code, aucune écriture de données.*
