# Regression Audit — Post global-top-bar
*Date : 2026-04-26 | Branche : main | Commit cible : `ea70976`*

---

## Contexte

Le commit `feat(ux): cloche notifs → barre globale fixe sur tous les onglets`
(`ea70976`) a introduit :
- `.global-top-bar` fixe (top:0, height:44px, z-index:999)
- `#notif-panel-global` (top:44px, z-index:998, fixed)
- `body { padding: 15px 15px 100px }` → `padding: 59px 15px 100px`

Régressions reportées :
1. 🔴 Social charge en boucle (ne finit jamais)
2. 🟠 Séances : stats semaine affichent valeurs initiales tant qu'on ne navigue pas
3. 🟠 Jeux : rien ne s'affiche
4. 🟡 Profil : bugs divers

---

## Investigation — Ce qui a été vérifié

### 1. `initSocialTab` & `renderFeedAmis` (js/supabase.js:692, 4015)

**Vérifié :**
- `initSocialTab` n'appelle ni récursion ni `setInterval`/`setTimeout` de boucle.
- `ensureProfile()` est bien en fire-and-forget (commit `8ac7d39`).
- `renderFeedAmis` a un `try { ... } finally { _feedAmisInflight = false; }`
  — le flag est correctement reset, y compris sur les early returns (`if (!uid) return`)
  car ces returns sont à l'intérieur du `try`.

**Faille potentielle identifiée :** si `getMyUserIdAsync()` retourne `null`
(ex : session Supabase expirée), la fonction retourne sans remplacer le skeleton.
Le skeleton reste affiché indéfiniment alors que `_feedAmisInflight` est reset.
L'utilisateur perçoit un chargement infini.

**Fix appliqué :** quand `uid` est null, on remplace le skeleton par un message
"Connexion requise". Idem pour `renderFeedCommunaute`.

```js
if (!uid) {
  if (container && _feedAmisPage === 0) {
    container.innerHTML = '<div class="feed-empty">...Connexion requise...</div>';
  }
  return;
}
```

### 2. `toggleNotifPanel` — fuite de listener (js/supabase.js:2614)

**Bug confirmé :** chaque ouverture du panel ajoute un nouveau listener
`document.addEventListener('click', ...)`. Quand l'utilisateur referme le panel
en re-tapant la cloche (au lieu de cliquer en dehors), le listener n'est PAS retiré.
Au bout de N ouvertures par la cloche, N listeners écoutent.

**Effet de bord :** chaque listener vérifie son état et peut interférer avec
des taps sur d'autres éléments (boutons d'onglets, modals, etc.) — bien que la
condition `!p.contains(e.target) && !btn.contains(e.target)` limite le préjudice.

**Fix appliqué :** `_notifPanelCloseListener` global, retiré explicitement quand
le panel se ferme via toggle. `try/catch` autour de `loadNotifList()` pour éviter
qu'une erreur réseau laisse le listener orphelin.

### 3. `.go-rest-timer` sticky top:0 (index.html:1123)

**Bug visuel confirmé :** l'élément avait `position:sticky; top:0; z-index:100`.
Avec la nouvelle barre fixe (z-index:999, height:44px), le timer de repos en mode GO
se collerait à `top:0` mais serait visuellement masqué par la barre globale.

**Fix appliqué :** `top:0` → `top:44px`. Le timer se colle maintenant juste sous
la barre globale.

### 4. `renderSeancesTab` (js/app.js:10376)

**Vérifié :**
- La fonction est bien appelée par `showTab('tab-seances')` ligne 1861.
- Les éléments DOM (`weekRangeLabel`, `weekIndexLabel`, `prevWeekBtn`, `nextWeekBtn`,
  `weekSessionsContainer`) existent dans `index.html` et sont accédés directement
  sans guard null.
- `getWeekStart` / `getWeekEnd` calculent correctement.
- `currentWeekOffset` est initialisé à `0` ligne 171.

**Conclusion :** je ne trouve PAS de cause root pour la régression "stats semaine -".
Le code lit `db.logs` et écrit dans le DOM. Si le bug existe, il est probablement lié
à un état runtime non visible dans le code statique (ex : `db.logs` vide au premier
render, état localStorage incohérent). Pas de fix appliqué.

### 5. `renderGamificationTab` (js/app.js:5128)

**Vérifié :**
- Fonction appelée ligne 1868 sur `showTab('tab-game')`.
- Lit/écrit dans `gamLevelCard`, `gamXPSources`, `gamChallenges`, `gamHeatmap`,
  etc. — tous présents dans `index.html`.
- Les blocs sont protégés par `try/catch` pour `renderBodyFigure`/`renderMuscleColors`
  ligne 5136.
- Le banner du lundi (ligne 5158) ne s'exécute que les lundis.

**Conclusion :** je ne trouve PAS de cause root pour "Jeux : rien ne s'affiche".
Aucun appel à `scrollIntoView` qui interagirait avec la barre globale.
Pas de fix appliqué.

### 6. `renderCorpsTab` / `fillSettingsFields` (js/app.js:10251, 11081)

**Non audité en détail** — le rapport utilisateur "bugs divers" est trop vague
pour cibler un fix précis sans reproduction.

---

## Corrections appliquées (ce cycle)

| Fichier | Ligne | Changement |
|---|---|---|
| `js/supabase.js` | 4015–4030 | `renderFeedAmis` remplace skeleton par "Connexion requise" si `uid` null |
| `js/supabase.js` | 4291–4306 | `renderFeedCommunaute` même fix |
| `js/supabase.js` | 2614–2650 | `toggleNotifPanel` : listener tracké en global, retiré sur close, try/catch |
| `index.html` | 1123 | `.go-rest-timer` `top:0` → `top:44px` |

---

## Ce qui n'a PAS été corrigé (et pourquoi)

| Problème reporté | Raison du non-fix |
|---|---|
| Séances stats "-" | Cause racine non identifiée à la lecture du code statique. Aucun élément `position:sticky` dans `seances-historique`. `renderSeancesTab` semble correct. Reproduction nécessaire. |
| Jeux rien ne s'affiche | Idem — aucun bloqueur évident dans `renderGamificationTab`. La fonction écrit dans des éléments toujours présents. Reproduction nécessaire. |
| Profil bugs divers | Trop vague. Demander à l'utilisateur de préciser quels bugs (champs vides, écran blanc, navigation cassée…). |

---

## Recommandations

1. **Reproduire les bugs** : ouvrir DevTools, regarder la console pour les erreurs
   réelles sur les onglets Séances et Jeux. Sans la stack trace, l'audit est limité.
2. **Vérifier l'état localStorage** : un `db` corrompu peut faire échouer plusieurs
   renders silencieusement.
3. **Tester en navigation privée** : si les bugs disparaissent, c'est lié à un état
   stocké côté client (localStorage / IndexedDB).

---

## Audit visuel — non effectué

L'audit visuel demandé (passage sur chaque onglet) nécessite une session navigateur
interactive. Les fixes ci-dessus traitent les bugs identifiables à la lecture statique
du code. Une session de test manuelle est recommandée après application des fixes.
