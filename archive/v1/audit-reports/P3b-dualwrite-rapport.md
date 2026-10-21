# Phase 3-b — Dual-write FIABLE vers `workout_sessions` (rapport)

> **Branche** : `feat/logs-dualwrite-reliable` · **Base** : `main`
> **Périmètre** : rendre le dual-write `db.logs → workout_sessions` fidèle (insertions + **éditions** + **suppressions**), sans toucher la lecture locale ni le blob.
> **Statut** : code + tests verts poussés. Aucune action Supabase faite (déléguée à Claude chat, voir §6).
> **Réf. diagnostic** : `audit/logs-archive-diagnostic.md` (§3, §6).

---

## 1. Ce qui a changé (fichiers)

| Fichier | Changement |
|---|---|
| `js/supabase.js` | `syncLogsToSupabase()` réécrit (append-only → fidèle). Ajout de 2 fonctions **pures** : `_wsLogHash()` et `computeWorkoutSessionsSyncPlan()`. Call-site `syncToCloud` passe `user.id`. |
| `tests/unit/dualwrite-plan.test.js` | 15 tests unitaires (vm-extraction de la vraie source). |
| `service-worker.js` / `js/app.js` | Bump SW `trainhub-v287 → v288` (règle PROMPT_RULES #4 : `supabase.js` est précaché). |

**Non touché (hors scope, conforme §5 du prompt)** : `syncToCloud` *payload* (P3-c), `syncFromCloud` (P3-c), `loadFeedSessionDetail` (P3-d), lecture locale de `db.logs`, purge du blob / timeout (P3-e, Claude chat).

---

## 2. Stratégie de détection des éditions (le point sensible)

**Contrainte** : ne PAS réécrire les 532 lignes à chaque sync (c'est exactement l'opération lourde qu'on fuit), tout en propageant fidèlement une édition.

**Choix retenu : carte locale de hash de contenu, device-local, HORS blob.**
- À chaque sync réussie, on mémorise pour chaque `session_id` un hash de contenu du log dans `localStorage['_wsSyncedHashes']` (`{ [session_id]: hash }`).
- Au passage suivant, on recalcule le hash de chaque log local et on compare :
  - hash **changé** depuis le dernier push → le log a été édité → **upsert** (réécrit `data` + colonnes dérivées).
  - hash **identique** → inchangé → **rien**.
- Hash = `_wsLogHash()` : djb2 32-bit sur `JSON.stringify(log)`. Pur, déterministe, ~instantané, **100 % local** (CPU, zéro réseau).

**Pourquoi pas les autres pistes :**
- *Relire le `data` jsonb cloud pour comparer* → re-télécharge ~2,45 Mo à chaque sync = précisément le problème qu'on élimine. Rejeté.
- *Comparer les colonnes légères (volume/duration/exercise_count)* → heuristique : une édition qui ne touche ni le volume ni la durée (ex. une note, un RPE) passerait inaperçue. Rejeté (fidélité incomplète).
- *Marqueur `_dirty` posé aux sites d'écriture* (`seSubmitSession`, etc.) → obligerait à modifier plusieurs sites dans `app.js`/`import.js` et à dé-polluer le `data` écrit. Plus intrusif, pour un résultat équivalent. Rejeté au profit du hash local, **entièrement contenu dans `supabase.js`**.

**Pourquoi `localStorage` séparé et pas une clé de `db`** : la carte est un état **propre à l'appareil** (reflète ce que CE device a poussé). La mettre dans `db` la ferait transiter par le blob synchronisé (~16 ko de bloat qu'on cherche à réduire, + confusion multi-appareils). Une clé `localStorage` dédiée est cohérente avec l'existant (`_lastCloudPush`, `_lastCloudSync`, `_lastLeaderboardSync`).

**1er run post-backfill (532 lignes déjà en cloud, carte locale vide)** : règle d'**adoption** — un `id` présent côté cloud mais **inconnu** de la carte locale est considéré « déjà synchronisé » : on **adopte** son hash courant **sans le réécrire**. Résultat : le tout premier passage après déploiement ne réécrit **aucune** des 532 lignes ; il se contente d'initialiser la carte. Les éditions sont détectées à partir de là. → évite le « gros write » initial redouté.

> **Limite assumée (signalée)** : si une ligne cloud avait un contenu *divergent* du local pour un `id` jamais tracké, l'adoption ne le corrigerait pas. Or le backfill a été produit à partir des mêmes logs (diagnostic : 532/532 identiques, `allSets` inclus), donc l'hypothèse tient. Une réécriture forcée ponctuelle reste possible côté Claude chat si besoin (vider `_wsSyncedHashes` ⇒ re-hash, mais toujours pas de réécriture tant que le contenu n'a pas changé). 

---

## 3. Mécanique des suppressions + garde-fou anti-wipe

`computeWorkoutSessionsSyncPlan()` calcule `toDelete` = `session_id` présents **côté cloud** mais **absents** de `db.logs`. La passe `delete` cible `eq('user_id', uid).in('session_id', batch)` → **uniquement les lignes du user courant**, jamais celles des amis.

**Garde-fou anti-wipe (dans la fonction pure, donc testé) :**
1. **Non hydraté** → `toDelete = []` si `db._workoutSessionsSynced !== true` **OU** `db.logs.length === 0`. (`syncLogsToSupabase` court-circuite déjà sur `db.logs` vide ; la règle vit aussi dans le plan pour être testable.) Raison renvoyée : `not_hydrated`.
2. **Volume anormal** → `toDelete = []` si on s'apprête à supprimer **> 20 % des lignes cloud** *et* **> 5 lignes** (plancher absolu pour ne pas bloquer une suppression normale dans une petite base). Raison : `threshold_exceeded`, + `console.warn` côté orchestrateur (compte réel conservé dans `deleteCandidateCount`). → décision manuelle (Claude chat).

**Scénario rendu impossible** : `db.logs` transitoirement vide (chargement raté, bug) → la table cloud (qui devient source de vérité) **n'est jamais wipée**.

**Limite assumée (signalée)** : vider **toute** sa bibliothèque (suppression légitime de 100 %) n'est **pas** propagé (anti-wipe l'emporte). C'est volontaire ; à traiter manuellement si le cas se présente.

**Persistance tout-ou-rien** : `_wsSyncedHashes` et `_workoutSessionsSynced` ne sont écrits **qu'après succès complet** des upserts ET deletes. Un échec réseau partiel ⇒ aucun état persisté ⇒ retry propre au prochain passage.

---

## 4. Concurrence / verrous gotrue

`syncLogsToSupabase(userIdArg)` reçoit désormais l'uid depuis `syncToCloud` (`syncLogsToSupabase(user.id)`), supprimant le **2e** `auth.getUser()` qui partait en parallèle du premier (cause connue des `lock stolen`). Fallback `getUser()` conservé si la fonction est appelée sans argument. Aucune nouvelle source de sync concurrente introduite.

---

## 5. Tests (règle du commit vert)

VM-extraction de la **vraie source** `js/supabase.js` (jamais de réimplémentation — PROMPT_RULES #6). Fonctions testées : `_wsLogHash`, `computeWorkoutSessionsSyncPlan`.

```
Test Suites: 7 passed, 7 total
Tests:       153 passed, 153 total   (138 existants + 15 nouveaux)
```

Couverture des 15 nouveaux tests (`tests/unit/dualwrite-plan.test.js`) :
- `_wsLogHash` : déterministe, sensible au contenu, `null → '0'`.
- **upsert** : nouveau → upsert ; édité (hash changé) → upsert ; inchangé → rien ; **adopté** (1er run, hash inconnu) → pas de réécriture + tracé dans `nextHashes` ; `nextHashes` couvre tous les logs locaux.
- **delete** : supprimé localement → `toDelete` ; cas combiné (nouveau + édité + inchangé + supprimé).
- **garde-fou** : `pas_de_wipe_si_local_non_hydrate` (synced=false), `pas_de_wipe_si_local_vide`, seuil `threshold_exceeded` (> 20 % & > 5), suppression normale autorisée (1/10).

Tous les fichiers touchés passent `node -c`. SW bumpé v287→v288.

---

## 6. Vérifs Supabase à faire par Claude (chat) après déploiement

> Rappel : Claude Code n'a pas d'accès Supabase. Ces étapes sont pour le chat.

1. **Édition réelle** : modifier une séance existante dans l'app (ex. changer un poids), laisser syncer, puis vérifier côté `workout_sessions` que la ligne `(user_id, session_id)` a son `data` + colonnes dérivées (volume, etc.) **à jour** (et qu'**une seule** ligne a été réécrite, pas 532 — surveiller via `updated_at`/logs si dispo).
2. **Suppression réelle** : supprimer 1 séance dans l'app, laisser syncer, vérifier que la ligne `workout_sessions` correspondante a **disparu** (zéro fantôme), et qu'aucune autre n'a bougé.
3. **Fidélité globale** : confirmer `workout_sessions` (user principal) = **exactement** les `id` de `db.logs` — viser **532/532** (ou le compte courant), 0 manquant, 0 en trop.
4. **Garde-fou** : vérifier dans les logs qu'aucune suppression de masse n'a eu lieu ; au besoin, provoquer un cas > 20 % et confirmer l'**abstention** + le `console.warn`.
5. **Pré-requis avant P3-c/P3-e** : tant que (1)–(3) ne sont pas vertes en réel, **ne pas** retirer `logs` du blob ni purger `data->'logs'` (la réhydratation future en dépend).

---

## 7. Hors-scope rencontré (signalé, non traité)

- `_computeDataHash` (supabase.js:237) ignore toujours `garminHealth`, `gamification`, `body`, `reports`, `social`, `keyLifts` — dette pré-existante (cf. diagnostic §6). Non touché.
- Sites `saveDB()`/`saveDBNow()` dispersés — cohérence de persistance, autre chantier. Non touché.
- Deux chemins d'import (`app.js:_doImportCSV` vs `import.js:executeImport`) écrivent dans `db.logs` — leurs séances seront correctement reflétées par ce dual-write (insert), mais la redondance reste à clarifier (autre chantier).
- Ordre de `db.logs` non garanti (`goFinishWorkout` fait `push` sans tri) — sans impact ici (le plan ne dépend pas de l'ordre) ; à garder en tête pour la réhydratation P3-c (trier desc).
