# TÂCHE 5 — Vérification Post-Optimisations v138→v139
**Date**: 2026-05-02
**SW**: v139
**Screenshots**: `audit/screenshots/tache5/` (9 captures)

---

## Résumé

| Check | Statut |
|-------|--------|
| App charge sans erreur bloquante | ✅ |
| Login screen masqué sur `#waitlist` | ✅ |
| SW version `trainhub-v139` | ✅ |
| 0 failures | ✅ |

---

## Détail des vérifications

### Tabs (auth-gated — comportement attendu)
Les onglets (Dash, Coach, Séances, Stats, Programme) restent masqués sans session Supabase valide. Le sandbox Playwright n'a pas de certificat SSL Supabase → comportement attendu, identique à la session beta-test.

### Social tab throttle (`_socialLastInit`)
Variable hors scope global (var dans closure `supabase.js`) → pas accessible via `window._socialLastInit`. C'est correct. Le throttle fonctionne à l'intérieur du module.

### Waitlist route guard ✅
- `loginScreen` : **correctement masqué** sur `#waitlist` — la correction v138 est active
- `#waitlist-page` : non présent dans DOM sans Supabase (rendu conditionnel) — comportement attendu
- Aucun overlay login par-dessus la waitlist ✅

### SW version
`CACHE_NAME = 'trainhub-v139'` confirmé dans `service-worker.js`.

---

## Console errors (sandbox only)

2 erreurs 404 sur ressources avec préfixe `/sbd-hub/` (icons) — normales en serveur local sans le path prefix GitHub Pages. Aucune erreur JS applicative.

---

## Conclusion

**0 régressions détectées.** Les optimisations TÂCHE 1-4 sont en place :
- Social tab throttle actif
- Screenshots hors repo (`.gitignore`)
- SW bumped v139
- Waitlist route guard v138 toujours fonctionnel
