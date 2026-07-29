# Audit de câblage — Vague 5 : SOCIAL + JEUX

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Phase 1 : 89 éléments inventoriés. Phase 2 : 89 verdicts. Phase 5 : 89 statuts runtime.**

| Périmètre | Bornes |
|---|---|
| Jeux | `index.html:3151-3202` (`#tab-game`) — sous-onglets `jeux-profil-joueur`, `jeux-rangs`, `jeux-badges` |
| Social | `index.html:3203-3300+` (`#tab-social`) — `feed-amis`, `feed-communaute`, `feed-challenges`, `feed-classement`, `social-friends` |
| Générateurs | `renderGamificationTab`, `getAllBadges`, `initSocialTab`, `showFeedSub`, `renderFeed`, `renderLeaderboard`, `renderChallengesTab`, `renderFriendsTab` |
| États | **17** = 3 sous-onglets Jeux × (défaut, XP élevé) + vierge + 5 sous-onglets Social × (défaut, avec amis) + vierge |

| Source | Éléments |
|---|---|
| markup | 69 |
| runtime | 20 |
| **total** | **89** |

⚠️ **Réserve majeure sur cette vague** : Social est la surface la plus dépendante du réseau, et le
réseau est **intégralement stubbé** (les vraies données ne doivent jamais être touchées). Les réponses
REST renvoient `[]`. Tout ce qui dépend d'une lecture Supabase réussie est donc **⊘ NON TESTABLE** et
signalé comme tel. C'est la vague dont la couverture runtime est la plus faible — je le dis d'emblée.

---

## LES CONSTATS

### J1 — 🔴 `renderFriendsTab` lève une exception — fix #5 du scope de lancement, CONFIRMÉ à l'exécution

```
appel direct de renderFriendsTab() → ERREUR : Cannot read properties of null (reading 'style')
document.getElementById('socialFriendsBadge') → null
```
L'élément `socialFriendsBadge` **n'existe dans aucun des 17 états** — il n'est ni dans le markup, ni
généré. La fonction déréférence `.style` sur ce `null` et s'interrompt.

C'est exactement le **fix #5** de CLAUDE.md §17 (« Garde `renderFriendsTab` », `supabase.js:3224`),
listé comme bloquant pour la bêta. **Cet audit le confirme au runtime** : l'exception se produit, elle
n'est pas rattrapée, et elle interrompt la fonction avant la suite de son rendu.

**Confiance : certain** sur l'exception. **Ce que je n'affirme pas** : l'étendue exacte de ce qui n'est
pas rendu ensuite — sous réseau stubbé, la suite de la fonction dépend de lectures Supabase.

### J2 — ⚠️ Le code d'invitation reste « --- » sur le chemin naturel

| Moment | `#myFriendCode` | `db.friendCode` |
|---|---|---|
| ouverture de l'onglet (400 ms) | `---` | `null` |
| après 2,9 s | `---` | `null` |
| après un appel **direct** à `renderFriendsTab()` | `89G2SF` | *(généré)* |

Mécanique lue dans le code :
```js
ensureProfile().catch(...);                                   // supabase.js:1720 — fire-and-forget
var fcEl = document.getElementById('myFriendCode');
if (fcEl) fcEl.textContent = db.friendCode || '---';          // supabase.js:1724 — SYNCHRONE
```
L'affichage est posé **synchroniquement** depuis `db.friendCode`, qui est `null` au premier passage.
Le seul rafraîchissement se trouve dans `renderFriendsTab` (supabase.js:3462), **après** un `await` sur
`ensureFriendCode()` — c'est-à-dire dans la fonction qui lève l'exception J1.

⚠️ **Réserve** : sous réseau stubbé, `profiles` renvoie `[]`, donc `ensureFriendCode` ne peut de toute
façon rien relire (`ensureFriendCode: wrote code but cannot read it back (RLS?)` observé en console).
La part imputable au stub et la part imputable au code **ne sont pas séparables sur ce banc**.
Le point vérifiable est le premier : **l'affichage initial ne dépend que de `db.friendCode`**.

`invite_codes` est une table **distincte** de `profiles.friend_code`, utilisée en écriture
(`supabase.js:2313`) et en suppression (`4386`, `4402`), jamais en lecture pour cet affichage.
Son existence en base est une **question Supabase** (fin de rapport).

### J3 — 🔴 Trois sous-sections Social héritées, invisibles mais toujours aiguillées

| Élément | markup | 17 états | Aiguillage |
|---|---|---|---|
| `social-feed` | index.html:3252 | `display:none` partout | `showFeedSub` supabase.js:**1672** → `renderFeed()` |
| `social-leaderboard` | index.html:3256 | `display:none` partout | supabase.js:**1673** → `renderLeaderboard()` |
| `social-challenges` | index.html:3264 | `display:none` partout | supabase.js:**1675** → `renderChallengesTab()` |

Les sous-onglets **réellement** utilisés sont `feed-amis` / `feed-communaute` / `feed-challenges` /
`feed-classement` / `social-friends` (les 5 pilules, index.html:3206-3210). Les trois `social-*`
ci-dessus ne sont atteints par **aucune pilule**, et pourtant `showFeedSub` conserve leurs branches.

*Même motif que `tab-profil-badges` (vague 1, F2) : le markup et l'aiguillage survivent, le point
d'entrée a disparu.*

### J4 — ✘ RÉFUTÉ : le quiz archétype est atteignable et fonctionne

C'était un point à vérifier. **Il ne se confirme pas.**
```
showClassQuiz() → #classQuizOverlay présent · display:flex · 844 px · z-index 1300
                  « QUESTION 1 / 7 | Ton objectif principal à la salle ? | … »
QUIZ_QUESTIONS.length = 7
```
Deux points d'entrée réels : Réglages → « 🎲 Changer de classe » (index.html:2955) et la file d'entrée
(app.js:2230). *Mon premier test avait conclu à l'absence d'overlay — il cherchait `.modal-overlay`
alors que le quiz utilise son propre id `#classQuizOverlay`. Défaut de mon test, corrigé.*

### J5 — Les 22 éléments jamais visibles

Au-delà des 3 de J3, **19 autres** ne sont visibles dans aucun des 17 états. Tous sont des états
conditionnels dont la condition dépend d'une **lecture réseau** (feed chargé, amis, défis, classement,
demandes en attente, utilisateurs bloqués) :

`socialJeuxBadgeDot` · `feedAmisLoadMore` · `feedCommunauteLoadMore` · `feedPinnedSection` ·
`feedContent` · `feedLoadMore` · `lbExerciseFilter` · `lbPodium` · `lbTable` · `lbEmpty` ·
`challengesCreateBtn` · `challengeTemplates` · `challengesActiveList` · `challengesFinishedList` ·
`friendAutocomplete` · `pendingRequestsSection` · `pendingRequestsList` · `blockedSection` · `blockedList`

**Verdict : ⊘ NON TESTABLE** — réseau stubbé, données absentes par construction. Je **ne conclus pas**
qu'ils sont inatteignables : je constate que mon banc ne peut pas les atteindre. C'est la limite
assumée de cette vague.

---

## PHASE 2 — 89 VERDICTS (résumé par familles)

| # | Famille | Nombre | Champ db | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|
| 1-3 | Conteneurs d'onglet (`tab-game`, `tab-social`, navs) | 3 | — | oui | ➖ conteneur | ✔ visible |
| 4-6 | Sous-onglets Jeux (`jeux-profil-joueur`, `jeux-rangs`, `jeux-badges`) | 3 | `db.gamification` | oui | ✅ CÂBLÉ | ✔ visible |
| 7-30 | Contenu Jeux — XP, rang, barre de progression, listes de badges, quêtes, titres | 24 | `xpHighWaterMark`, `earnedBadges`, `unlockedTitles`, `activeTitle`, `questHistory` | oui | ✅ CÂBLÉ | ✔ visible |
| 31-35 | Sous-onglets Social actuels (`feed-amis`, `feed-communaute`, `feed-challenges`, `feed-classement`, `social-friends`) | 5 | réseau | oui | ✅ CÂBLÉ | ✔ visible |
| 36-38 | **`social-feed`, `social-leaderboard`, `social-challenges`** | 3 | — | **NON** (aucune pilule) | 🔴 **RENDU INATTEIGNABLE** — cf. J3 | ✔ inatteignable |
| 39-42 | Profil social — `myFriendCode`, username, bio, visibilité | 4 | `db.social`, `db.friendCode` | oui | ⚠️ **DIVERGENT** — cf. J2 | ✔ visible |
| 43-45 | En-têtes, cloche de notifications, compteurs | 3 | `db.notificationsSent` | oui | ✅ CÂBLÉ | ✔ visible |
| 46-64 | **19 conteneurs à condition réseau** (feed, podium, classement, défis, demandes, blocages) | 19 | tables Supabase | ⊘ | ❓ NE SAIS PAS | ⊘ non testable |
| 65-89 | Éléments générés au runtime — cartes de badges, lignes de classement, tuiles de rang | 25 | `db.earnedBadges`, `db.gamification` | oui | ✅ CÂBLÉ | ✔ visible |

**Décompte** : ✅ CÂBLÉ 60 · 🔴 RENDU INATTEIGNABLE 3 · ⚠️ DIVERGENT 4 · ❓ NE SAIS PAS 19 ·
➖ COSMÉTIQUE 3 = **89**.
Runtime : ✔ visible 67 · ✔ inatteignable 3 · ⊘ non testable 19 = **89**. Aucune ligne sans statut.

---

## PHASE 3 — CROISEMENT INVERSE

| Champ | UI pour voir | UI pour modifier | Constat |
|---|---|---|---|
| `db.gamification.xpHighWaterMark` | ✅ Jeux | ❌ (dérivé) | ✅ **[VOULU]** — l'XP ne descend jamais |
| `db.earnedBadges` | ✅ Jeux → Badges | ❌ | ✅ **[VOULU]** — jamais révoqués |
| `db.unlockedTitles` / `activeTitle` | ✅ Jeux | ✅ (sélection de titre) | ✅ |
| `db.friendCode` | ✅ Social → Profil | ❌ (généré) | ⚠️ affiché `---` sur le chemin naturel — cf. J2 |
| `db.social.visibility` | ✅ Social → Profil | ✅ | ✅ |
| `db.friends` | ✅ Social → Amis | ✅ (ajout/suppression) | ⊘ non testable (réseau) |
| `db.questHistory` / `questStreak` / `secretQuestsCompleted` | partiel | ❌ | ⚠️ progression de quêtes peu exposée |
| `db.seenBadges` | ❌ | ❌ | technique (pastille « nouveau ») |
| **`db.user.coachEnabled`** | ❌ | ❌ | 🔴 **DONNÉE MORTE** — 2 occurrences en tout (défaut + migration), **0 lecture**. Relevé en vague 1, **confirmé ici** : aucune surface Jeux/Social ne l'expose non plus. |

---

## PHASE 5 — VÉRIFICATION RUNTIME

- **5a** — 17 états. 67 visibles, 3 inatteignables confirmés (J3), 19 ⊘ non testables (réseau).
- **5b** — l'aller-retour n'a pu être exercé que sur les champs locaux (`db.social.username`,
  `visibility`) ; tout le reste écrit **en base**, hors banc. ⊘ pour ces champs.
- **5c** — la consommation est vérifiée sur Jeux : le contenu **change** avec `xpHighWaterMark` et
  `earnedBadges` (états « XP élevé » vs défaut). Sur Social, non vérifiable hors réseau.
- **5d** — `db.gamification.*` (hors `xpHighWaterMark` et `earnedBadges`, tous deux **signés**) n'est
  pas signé : `unlockedTitles`, `activeTitle`, `questHistory`, `questStreak`, `secretQuestsCompleted`,
  `seenBadges`, `smartStreak`, `smartStreakRecord` **ne figurent dans aucun des 14 termes** du hash.
  Reporté dans `audit/CHAMPS-NON-SIGNES.md`.

---

## Angles morts de cette vague

- **Le réseau est stubbé** : 19 des 89 éléments ne peuvent pas être atteints sur ce banc. C'est la
  vague la moins couverte, et de loin.
- **Aucune écriture en base n'a été exercée** (par construction : ne jamais toucher aux vraies données).
- Les **notifications push** (abonnement, réception) sont hors banc.
- **Aucun device Android réel.**

## À VÉRIFIER CÔTÉ SUPABASE

1. **J2** — la table `invite_codes` existe-t-elle ? (l'hypothèse d'un `PGRST205` reste **non vérifiée**
   de mon côté) `select to_regclass('public.invite_codes');`
2. **J2** — `profiles.friend_code` est-il renseigné pour les 5 comptes réels ?
   `select id, friend_code from profiles;`
3. **J1** — la suite de `renderFriendsTab` après l'exception : quelles lectures aurait-elle faites ?
   (à confirmer une fois la garde posée)
4. **J5** — les 19 conteneurs conditionnels : y a-t-il des lignes dans `activity_feed`,
   `leaderboard_entries`, `social_challenges`, `friendships` pour les comptes réels ?
