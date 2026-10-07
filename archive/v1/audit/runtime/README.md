# Banc d'audit runtime — phase 5

**Ce dossier est un OUTIL D'AUDIT.** Rien ici n'appartient à l'application : aucun fichier de `js/`,
`index.html` ou `service-worker.js` n'importe quoi que ce soit de ce dossier, et ne doit jamais le faire.

## Garanties

- **Aucun réseau ne sort.** `harness.js` intercepte toute requête hors `127.0.0.1`. Supabase (auth,
  REST, Edge Functions) reçoit des réponses synthétiques. **Les données des vrais utilisateurs ne sont
  jamais touchées.**
- **Aucune écriture dans le dépôt** hors `out-*.json` (résultats, régénérables).
- Service Worker bloqué (`serviceWorkers: 'block'`) : pas de cache qui masquerait la source.

## Prérequis

Chromium préinstallé (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, build 1194) piloté par
**`@playwright/test` 1.56.0**. ⚠️ `require('playwright')` (1.59 dans `package.json`) attend le build
1217, absent — utiliser `@playwright/test`. Ne pas lancer `npx playwright install`.
`http-server` du `playwright.config.js` n'étant pas installé, `harness.js` embarque son propre serveur
statique.

## Ordre d'exécution

```
node audit/runtime/smoke.js              # l'app boote-t-elle sous le banc ?
node audit/runtime/5a-visibilite.js      # visibilité des 176 éléments, 3 profils → out-5a.json
node audit/runtime/5a-variantes.js       # profils qui déverrouillent les sections gatées
node audit/runtime/5a-conditionnels.js   # masqué par conception vs vraiment inatteignable
node audit/runtime/5a-clipping.js        # mesure du rognage par max-height
node audit/runtime/5a-persistance-tab.js # le sous-onglet inexistant survit-il au rechargement ?
node audit/runtime/5b-allerretour.js     # 27 champs : écrire → persister → recharger → réafficher
node audit/runtime/5b-bis-isoles.js      # re-tests en isolation + champs injectés au runtime
node audit/runtime/5c-consommation.js    # la sortie dépendante bouge-t-elle ?
node audit/runtime/5d-hash-sync.js       # signature de sync + pushs interceptés
node audit/runtime/consolide.js          # fusionne → out-runtime.json (176 statuts)
```

`consolide.js` a besoin de `out-5a.json` : lancer `5a-visibilite.js` avant.

## Fichiers

| Fichier | Rôle |
|---|---|
| `harness.js` | serveur statique, stub réseau, session synthétique, semis de profil, helpers |
| `elements.json` | les 176 éléments inventoriés en phase 1 (le contrat) |
| `out-runtime.json` | les 176 statuts runtime consolidés |

## Pièges du banc (corrigés, à ne pas réintroduire)

1. `db` est un `let` de portée lexicale globale (app.js:108) — **pas** sur `window`.
2. `addInitScript` rejoue à **chaque** navigation : sans sentinelle, un `reload()` réécrase le profil.
3. La garde anti-fuite RC4 purge un blob dont le `ownerUid` ne correspond pas à la session — d'où le
   tatouage du blob dans `openApp` (option `stampOwner: false` pour observer le comportement brut).
