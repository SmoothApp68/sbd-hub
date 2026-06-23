# Retrait des « Défis » de l'onglet Jeux — Diagnostic (Phase 1, lecture seule)

> **Branche** : `audit/remove-challenges-from-games` · **Base** : `main` (Lot B #219 mergé : `574863a` ✓).
> **Lecture seule** — aucun code modifié. STOP après ce rapport, en attente de validation Aurélien.

---

## ⚠️ Décision centrale à trancher (Phase 2)

Retirer la section Défis de l'onglet Jeux est **mécaniquement simple**, MAIS cela **orpheline TOUTE la chaîne du picker construite au Lot A** (« ⚔️ Nouveau défi » → 5 métriques → durée → `createChallenge`). **L'onglet Social n'utilise PAS ce picker** : il crée via `showCreateChallengeModal` (formulaire brut titre/type/exercice/cible/durée) + les templates rapides.

→ Si on supprime le code mort (Phase 3), **Social perd l'accès au picker convivial** (le plus belle UX de création, faite au Lot A) et ne garde que le formulaire brut. **Trois options** (cf. Q4) — à choisir par Aurélien.

---

## Q1 — Quelle fonction rend la section « Défis » dans Jeux ?

**`renderFriendChallenges()` — `js/app.js:7293`** remplit le conteneur **`#gamChallengesSection`** (7294).
- **Appelée (LIVE)** par **`renderGamificationTab()`** (le render de `tab-game`) à **`js/app.js:7433`** (dernière ligne de l'orchestrateur, après `_renderLeaderboard()`).
- **Appelée (MORT)** par **`acceptFriendChallenge()`** à **`js/app.js:7224`** — mais `acceptFriendChallenge` (système 1v1 `friend_challenges`) est **déjà du code mort** depuis Lot A (plus aucun rendu de `friend_challenges`). Cet appelant ne compte pas.

→ Le seul appel vivant à retirer est **`renderFriendChallenges()` ligne 7433** dans `renderGamificationTab`.

## Q2 — « Nouveau défi », liste compacte, « Voir tous les défis → » : où ?

**Tout est généré DANS `renderFriendChallenges`** (un seul bloc, `7293-7334`) :
- **Bouton « ⚔️ Nouveau défi »** : `7304-7306`, `onclick="showChallengePicker()"`.
- **Liste compacte** des défis en cours : `7307-7329` (requêtes `challenge_participants` + `social_challenges`, rows `7321-7329`).
- **Lien « Voir tous les défis → »** : `7330-7331`, `onclick="showTab('tab-social')"`.

→ Retirer l'appel `renderFriendChallenges()` (7433) **suffit** à faire disparaître les trois d'un coup (le conteneur reste vide). Supprimer la fonction elle-même est l'étape « code mort » (Q4).

## Q3 — Le scoring est-il préservé ? **OUI** ✓

`refreshMyChallengeScores()` (Lot B) est branché en tête de **DEUX** surfaces, **toutes deux côté Social** :
- `renderChallengesTab` — `js/supabase.js:4169` ;
- `renderFeedChallengesV2` — `js/supabase.js:5206`.

**`renderFriendChallenges` (Jeux) n'appelle PAS `refreshMyChallengeScores`** (vérifié : sa requête `social_challenges` ne sélectionne que `id,title,type,target_exercise,end_date`, aucun recalcul). → **Retirer la section Jeux ne touche pas au scoring** ; il continue de tourner depuis Social. ✅ Aucune action de préservation nécessaire (le hook n'est pas dans la zone retirée).

## Q4 — Code devenu mort après retrait (à recenser, NE PAS supprimer en P1)

Après retrait de l'appel 7433, la **chaîne complète du picker** (app.js) n'a plus aucun appelant vivant — `showChallengePicker` n'est appelé QUE depuis `renderFriendChallenges:7304` :

| Fonction / const | Déf. | Seul appelant |
|---|---|---|
| `renderFriendChallenges` | app.js:7293 | `renderGamificationTab` (7433, retiré) + `acceptFriendChallenge` (7224, déjà mort) |
| `showChallengePicker` | app.js:7398 | `renderFriendChallenges` (7304) |
| `selectChallengeMetric` | app.js:7377 | onclick depuis `showChallengePicker` (7407) |
| `createChallengeFromMetric` | app.js:7390 | onclick depuis `selectChallengeMetric` (7382) |
| `_buildChallengeTemplate` | app.js:7349 | `createChallengeFromMetric` (7391) + **test** |
| `_showChallengeSheet` | app.js:7358 | `showChallengePicker` (7411) + `selectChallengeMetric` (7386) |
| `CHALLENGE_METRIC_MAP` | app.js:7339 | `_buildChallengeTemplate` (7350) + `selectChallengeMetric` (7378) |

**Tests qui dépendent du picker** (à retirer/adapter si suppression) :
- `tests/unit/challenges-metric-map.test.js` (teste `_buildChallengeTemplate`).
- `tests/challenges-create.spec.js` (Playwright : `showChallengePicker` → métrique → durée → `createChallenge`).

**3 options pour ce code orphelin (décision Aurélien) :**
- **(A) Supprimer** toute la chaîne + les 2 tests. Social ne garde que `showCreateChallengeModal` (formulaire brut) + templates. → Code propre, mais **perte de l'UX picker**.
- **(B) Laisser en place** (mort mais inoffensif) en attendant une tâche « brancher le picker dans Social ». → Reporte la décision, un peu de code mort.
- **(C) Recâbler le picker dans Social** : remplacer les entrées `showCreateChallengeModal()` (`supabase.js:4252` et `5211`) par `showChallengePicker()`. → Garde la belle UX, la déplace dans Social. **Dépasse le strict « retrait »** mais meilleur produit.

> Recommandation : **(C)** si tu veux garder le picker (le mieux produit), sinon **(A)** pour un retrait net. Éviter (B) (dette).

## Q5 — Conteneur DOM

`<div id="gamChallengesSection"></div>` — **`index.html:3135`**, dans `#tab-game` (3086-3144). **Seul écrivain = `renderFriendChallenges` (app.js:7294)** ; aucun autre code ne cible cet id (grep `gamChallengesSection` = 2 hits : la div + le render). → **Supprimable** proprement (ou laissé vide sans effet).

---

## Périmètre Phase 3 proposé (selon décision Q4)

**Commun à toutes les options :**
1. Retirer `renderFriendChallenges();` (app.js:7433) dans `renderGamificationTab`.
2. Retirer `<div id="gamChallengesSection"></div>` (index.html:3135).

**Si option A (suppression) :**
3. Supprimer `renderFriendChallenges` + la chaîne picker (Q4) + l'appel mort dans `acceptFriendChallenge` (7224) ; supprimer `tests/unit/challenges-metric-map.test.js` et `tests/challenges-create.spec.js`.

**Si option C (recâblage Social) :**
3. Remplacer `showCreateChallengeModal()` (supabase.js:4252, 5211) par `showChallengePicker()` ; supprimer `renderFriendChallenges` (Jeux) ; conserver picker + tests.

**Tests Phase 3 (toutes options)** : Playwright — onglet Jeux sans section Défis (ni liste ni bouton), 0 `ReferenceError` ; onglet Social : défis + création toujours fonctionnels.

## À router vers Claude.ai / device (rappel)
- Device : onglet Jeux sans section Défis ; onglet Social intact (liste, création, scoring `× PDC`).
- Le scoring s'écrit toujours (`current_value`) depuis Social (`renderChallengesTab`/`renderFeedChallengesV2`) — inchangé par ce retrait.

---

## Phase 3 — RÉALISÉ (décision Aurélien : **option C** — « on enlève de Jeux mais on garde dans Social »)

**Changements (1 commit atomique, SW v296→v297) :**
1. `renderGamificationTab` : retrait de l'appel `renderFriendChallenges();` (app.js, ex-7433).
2. **`renderFriendChallenges` supprimée** (app.js, ex-7293-7334) + retrait de son appel mort dans `acceptFriendChallenge` (ex-7224).
3. `index.html` : bloc « ⚔️ Défis » + `<div id="gamChallengesSection">` retirés de `#tab-game`.
4. **Picker recâblé dans Social** : `renderFeedChallengesV2` → bouton « Créer un challenge » (supabase.js:5211) pointe désormais sur **`showChallengePicker()`** (au lieu de `showCreateChallengeModal()`). La chaîne Lot A (showChallengePicker / selectChallengeMetric / createChallengeFromMetric / _buildChallengeTemplate / _showChallengeSheet / CHALLENGE_METRIC_MAP) + ses 2 tests sont **conservés**.

**Scoring intact** : `refreshMyChallengeScores` reste branché dans `renderChallengesTab` (supabase.js:4169) et `renderFeedChallengesV2` (5206). Zone non touchée.

**Tests** : Jest **13 suites / 207 verts** ; Playwright `challenges-create.spec.js` mis à jour — vérifie (a) le picker crée toujours `{type:'weight',exercise:'Squat',duration:14}`, (c) `#gamChallengesSection` **absent**, `renderFriendChallenges` **undefined**, `showChallengePicker` **conservé**. `node -c` OK (5 fichiers).

**Code nouvellement mort (signalé, NON supprimé — hors scope)** : `showCreateChallengeModal` (supabase.js:4252) n'a plus d'appelant (son unique caller 5211 a été recâblé) → candidat à un nettoyage séparé. `acceptFriendChallenge`/`sendFriendChallenge`/`friend_challenges` restent du code mort 1v1 (Lot A).

**À vérifier device/Supabase (Claude.ai)** : onglet Jeux sans section Défis ; onglet Social → « Créer un challenge » ouvre le **picker 5 métriques** (et non le formulaire brut) ; scoring `× PDC` toujours écrit depuis Social.

*Fin du chantier (Phase 1 diag + Phase 3 option C).*
