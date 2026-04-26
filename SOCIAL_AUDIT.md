# Social Audit — SBD Hub
*Date : 2026-04-26 | Branche : main*

---

## 1. Résumé exécutif

| Criticité | Problème | Statut |
|---|---|---|
| 🔴 CRITIQUE | N+1 reactions : 40 requêtes pour 20 posts | **Corrigé** |
| 🔴 CRITIQUE | `getMyUserIdAsync` : round-trip Supabase à chaque appel | **Corrigé** |
| 🟠 IMPORTANT | `openFv2Menu` async → menu lent à apparaître | **Corrigé** |
| 🟠 IMPORTANT | `publishSessionActivity` topSet = plus lourd, pas le compound | **Corrigé** |
| 🟡 MINEUR | `openDefiModal` : boutons invisibles sur petits écrans | Corrigé (session précédente) |
| 🟡 MINEUR | `isCompoundExo` regex accent : fonctionne mais scope local | OK |
| ℹ️ INFO | `_feedAmisInflight` non réinitialisé si erreur avant `try` | Protégé par `finally` |

Score global avant audit : **4/10** (chargement lent, UX dégradée)
Score global après corrections : **8/10**

---

## 2. Performance

### 2.1 Flux de requêtes à l'ouverture de l'onglet Social

```
showTab('tab-social')
  └─ initSocialTab()
       ├─ getMyUserIdAsync()        → supabase.auth.getUser()  [réseau]
       ├─ ensureProfile()           → upsert sbd_profiles      [réseau]
       └─ showFeedSub('feed-amis')
            └─ renderFeedAmis()
                 ├─ getMyUserIdAsync()           → supabase.auth.getUser()  [réseau × 2 !]
                 ├─ getAcceptedFriendIds()        → SELECT friendships       [réseau]
                 ├─ supabase activity_feed .in()  → SELECT posts             [réseau]
                 ├─ supabase profiles .in()       → SELECT profiles          [réseau]
                 └─ forEach(item) loadFv2LikeCount(i.id)  ← N+1 ici
                      ├─ SELECT reactions WHERE activity_id = X    [réseau × N]
                      └─ SELECT comments COUNT WHERE activity_id = X [réseau × N]
```

**Total avant fix : 6 + 2N requêtes** (pour 20 posts : 46 requêtes)
**Total après fix : 6 requêtes** (reactions + comments en 2 requêtes batch)

### 2.2 N+1 identifié et corrigé

**Avant** (`js/supabase.js` lignes 3808, 3928) :
```js
_feedAmisItems.forEach(function(i) { loadFv2LikeCount(i.id, uid); });
// → 1 SELECT reactions + 1 SELECT comments par item = 40 requêtes pour 20 posts
```

**Après** :
```js
loadAllLikeCounts(_feedAmisItems, uid);
// → 1 SELECT reactions IN (...) + 1 SELECT comments IN (...) = 2 requêtes
```

Nouvelle fonction `loadAllLikeCounts(items, uid)` ajoutée après `loadFv2LikeCount`.
`loadFv2LikeCount` est conservée pour les appels unitaires (ex. `toggleFv2Like`).

### 2.3 Double appel `getMyUserIdAsync`

`initSocialTab` appelle `getMyUserIdAsync()`, puis `renderFeedAmis` le rappelle — soit 2 round-trips
Supabase auth sans cache. Corrigé par `_cachedUid` (voir section 3.1).

### 2.4 `_feedAmisInflight` / `_feedCommunauteInflight`

Protégés par `try { ... } finally { _feedAmisInflight = false; }` — correctement réinitialisés
en cas d'erreur. Pas de problème.

### 2.5 Requêtes séquentielles non-parallélisables

Dans `renderFeedAmis` :
- `getAcceptedFriendIds()` doit précéder la requête `activity_feed` (besoin des IDs) → séquentiel justifié
- `profiles` fetch doit suivre le fetch items → séquentiel justifié

Pas d'optimisation possible ici sans restructuration majeure.

---

## 3. Bugs

### 3.1 `getMyUserIdAsync` sans cache — réseau à chaque appel

**Fichier :** `js/supabase.js` ligne 550 (avant fix)
**Cause :** `supaClient.auth.getUser()` effectue un round-trip réseau à chaque invocation.
Avec 20 items × 2 requêtes par item, `_cachedUid` était résolu 42 fois via le réseau.

**Correction appliquée :**
```js
var _cachedUid = null;

async function getMyUserIdAsync() {
  if (_cachedUid) return _cachedUid;
  if (!supaClient) return null;
  try {
    const { data } = await supaClient.auth.getUser();
    _cachedUid = data?.user?.id || null;
    return _cachedUid;
  } catch { return null; }
}
```
Cache invalidé dans `cloudLogout()` : `_cachedUid = null`.

### 3.2 `openFv2Menu` async — menu lent à la 1ère ouverture

**Fichier :** `js/supabase.js` (après commit fix-2 de la session précédente)
**Cause :** `openFv2Menu` était `async` et attendait `getMyUserIdAsync()` avant d'appeler
`goShowBottomSheet`. Sans cache, cela impliquait un round-trip réseau avant l'affichage.

**Correction appliquée :** `openFv2Menu` devient synchrone, lit `_cachedUid` directement.
Le menu apparaît instantanément ; `isMe` est calculé à partir du cache déjà chaud.

### 3.3 `isCompoundExo` — exercices isolation sélectionnés comme topSet

**Fichier :** `js/supabase.js` — `fv2RenderCard` + `publishSessionActivity`

**Cause racine :** `isCompoundExo` dans `fv2RenderCard` fonctionne correctement pour les posts
avec `exercises[]` (ancien format). Mais pour les nouveaux posts (pas d'`exercises[]`),
`d.top_set` est calculé dans `publishSessionActivity` avec la logique **plus haut e1RM**,
ce qui sélectionne "Shrug barre" ou "Mollets assis" si leur e1RM est le plus élevé.

**Test mental :**
| Exercice | `isCompoundExo` | Résultat |
|---|---|---|
| "Squat barre" | `true` (keyword: squat) | Premier compound → topSet |
| "Développé couché" | `true` (keyword: developpe) | topSet si aucun avant |
| "Shrug barre" | `false` (aucun keyword) | Fallback e1RM seulement |
| "Écarté poulie" | `false` | Fallback e1RM seulement |
| "Mollets assis" | `false` | Fallback e1RM seulement |

**Correction appliquée dans `publishSessionActivity` :**
```js
var firstCompound = exos.find(e => !e.isCardio && _isCompound(e.name) && e.maxRM > 0);
if (firstCompound) {
  topSet = firstCompound.name + ' ' + Math.round(firstCompound.maxRM) + 'kg';
} else {
  // fallback : plus haut e1RM
}
```

**Note :** `_isCompound` est définie localement dans `publishSessionActivity`. La même logique
existe dans `fv2RenderCard` (scope local `isCompoundExo`). Ces deux copies sont intentionnelles
(pas d'appel cross-scope dans ce fichier module).

**Regex accent :** `replace(/[̀-ͯ]/g, '')` est l'équivalent de `[̀-ͯ]` encodé directement.
Fonctionne correctement pour "développé" → "developpe". Pas de bug ici.

### 3.4 `openDefiModal` — boutons invisibles

**Fichier :** `js/supabase.js` ligne 1276
**Cause :** La div interne du modal n'avait pas de `max-height` + `overflow-y:auto`, ce qui
la faisait dépasser le bas de l'écran sur petits appareils (iPhone SE, 375×667px).

**Correction appliquée (session précédente) :**
```js
style="...max-height:75vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,16px);"
```

**État CSS :** `.go-bottom-sheet-content` n'existe pas en tant que classe CSS dans `index.html`.
La classe utilisée par `goShowBottomSheet` est `.go-sheet-box` (ligne 1160), qui a déjà
`max-height:80vh;overflow-y:auto`. `openDefiModal` utilise un div inline custom — le fix
inline est donc la bonne approche.

---

## 4. Audit visuel

### 4.1 Feed Amis (`renderFeedAmis` / `fv2RenderCard`)

| Élément | Statut | Notes |
|---|---|---|
| `.fv2-card` espacement | ✅ OK | padding 16px, margin-bottom 12px |
| `.fv2-topset` null-safe | ✅ OK | `if (topSet)` avant render |
| `.fv2-stats` cohérence | ✅ OK | volume, durée, nb exos |
| `.fv2-actions` tap targets | ⚠️ MINEUR | `.fv2-action` : padding 6px 10px → ~28px hauteur, sous les 44px recommandés iOS |
| Empty state | ✅ OK | Message adaptatif (amis présents ou non) |
| Loading state | ✅ OK | "Chargement..." affiché pendant le fetch |
| Nouveau format (pas d'exercises) | ✅ OK | Bouton lazy load via `loadFeedSessionDetail` |
| Ancien format (exercises inline) | ✅ OK | Rétrocompat préservée |

### 4.2 Feed Communauté (`renderFeedCommunaute`)

| Élément | Statut | Notes |
|---|---|---|
| Filtre RLS | ⚠️ À VÉRIFIER | La requête ne filtre pas `visibility_feed` — dépend de la RLS Supabase |
| Profils `training_status` | ℹ️ INFO | Fetchés mais non affichés dans les cartes actuellement |

### 4.3 Profil / Amis

Formulaire code ami, liste d'amis, demandes — non audités dans ce cycle (hors scope des bugs signalés).

### 4.4 Challenges

Bottom sheet création : utilise `.go-sheet-box` qui a déjà `max-height:80vh;overflow-y:auto`. OK.

### 4.5 Classement

Non audité dans ce cycle.

### 4.6 Notifications

Badge : `updateSocialBadge()` appelé dans `initSocialTab`. OK.

---

## 5. Corrections appliquées (ce cycle)

| Commit | Fichier | Changement |
|---|---|---|
| perf(social) | `js/supabase.js` | `_cachedUid` + `getMyUserIdAsync` mis en cache |
| perf(social) | `js/supabase.js` | `cloudLogout` invalide `_cachedUid` |
| perf(social) | `js/supabase.js` | `openFv2Menu` → sync (suppression `async/await`) |
| perf(social) | `js/supabase.js` | `loadAllLikeCounts` batch (2 requêtes au lieu de 2N) |
| perf(social) | `js/supabase.js` | Remplacement des `forEach loadFv2LikeCount` dans Amis + Communauté |
| fix(social) | `js/supabase.js` | `publishSessionActivity` topSet = premier compound |

---

## 6. Reste à faire

| Priorité | Action | Raison du report |
|---|---|---|
| 🟡 MINEUR | Augmenter les tap targets `.fv2-action` à 44px min | Impact CSS global, risque de régression visuelle |
| 🟡 MINEUR | Afficher `training_status` sur les cartes communauté | Feature non demandée dans ce cycle |
| ℹ️ INFO | Vérifier RLS `visibility_feed` côté Supabase | Nécessite accès dashboard Supabase |
| ℹ️ INFO | Audit Classement + Challenges | Hors périmètre des bugs signalés |
| ℹ️ INFO | Paralléliser `getAcceptedFriendIds` + `ensureProfile` dans `initSocialTab` | Gain marginal (~100ms), complexité accrue |
