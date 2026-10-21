# UI — Afficher la version de l'app (servie par le SW) — rapport

> **Branche** : `feat/show-app-version` · **Base** : `main` (`4a496ae`, v291)
> **Statut** : code + tests verts + vérif Playwright OK. Aucune action Supabase.
> **SW** : `trainhub-v291 → v292`.

---

## Exigence centrale respectée

La version affichée est **celle servie par le service worker ACTIF** (son `CACHE_NAME`), obtenue par message au SW — **pas** la constante `SW_VERSION` du code. Si aucun SW ne contrôle la page (1er chargement, dev, navigation privée), on **dégrade proprement** : on affiche la version du **code chargé** en l'**étiquetant comme telle** (« version du code (SW non actif) »), jamais en la faisant passer pour la version servie.

---

## Changements

### `service-worker.js`
- `CACHE_NAME` → `trainhub-v292`.
- **Retiré `self.skipWaiting()` de `install`** : le nouveau SW reste désormais en `waiting` → permet de surfacer « mise à jour disponible ». (Avant : auto-skip → l'update s'appliquait silencieusement au reload suivant, impossible à voir.)
- **Listener `message`** : `GET_VERSION` → répond `{type:'VERSION', version: CACHE_NAME}` via `e.ports[0]` (MessageChannel) sinon `e.source` ; `SKIP_WAITING` → `self.skipWaiting()`.

### `index.html`
- Ligne de version discrète en bas de `#tab-settings` : `<div id="appVersionLine">SBD Hub</div>` (`--sub`, centré, petit).
- Dans l'enregistrement SW existant (`.then(reg => …)`) : listener `updatefound` → quand le nouveau worker passe `installed`, appelle `renderAppVersionLine()` → le bouton « Mettre à jour » apparaît sans recharger.
- Le listener `controllerchange` **existant** (déjà présent, `window.location.reload()`) gère le reload post-activation → réutilisé tel quel pour le flux « tap → SKIP_WAITING → activation → reload ».

### `js/app.js`
- `SW_VERSION` → `trainhub-v292` (commenté : fallback du code, pas la vérité).
- **Helpers purs** (testés) :
  - `_appVersionLabel(cacheName)` : `'trainhub-v291' → 'v291'`.
  - `_swUpdateState(reg)` : `{ available: !!(reg && reg.waiting) }`.
- `_querySWVersion(timeoutMs)` : interroge `navigator.serviceWorker.controller` via `MessageChannel`, timeout 1.5 s, résout `null` si pas de contrôleur / pas de réponse (ancien SW sans handler pendant la transition, dev…).
- `_swApplyUpdate()` : `registration.waiting.postMessage({type:'SKIP_WAITING'})` (→ controllerchange → reload) ; fallback `location.reload()`.
- `renderAppVersionLine()` : peint `#appVersionLine` selon 3 états —
  - SW actif répond → `SBD Hub · vXXX · à jour` (ou `· nouvelle version prête` + bouton **Mettre à jour** si `registration.waiting`).
  - Pas de SW contrôleur mais code connu → `SBD Hub · vXXX · version du code (SW non actif)`.
  - Rien → `SBD Hub · version non disponible`.
- Appelé depuis `showProfilSub('tab-settings')` (après `fillSettingsFields()`).

---

## États affichés (UX mise à jour)

| Situation | Affichage |
|---|---|
| SW actif, pas d'update | `SBD Hub · v292 · à jour` |
| Nouveau SW installé en attente (`registration.waiting`) | `SBD Hub · v292 · nouvelle version prête [Mettre à jour]` |
| Tap « Mettre à jour » | `SKIP_WAITING` → activation → `controllerchange` → reload automatique |
| Pas de SW contrôleur (1er load / dev / privé) | `SBD Hub · v292 · version du code (SW non actif)` |

> Effet « grandeur nature » du bump v291→v292 : à l'ouverture après déploiement, l'ancien SW (v291) contrôle encore ; le nouveau (v292) s'installe et **attend** → l'utilisateur verra « nouvelle version prête » dans Réglages et pourra l'activer d'un tap. (Note transition : tant que le SW **actif** est l'ancien v291, sans handler `GET_VERSION`, `_querySWVersion` peut renvoyer null → fallback « version du code » ; dès que v292 est activé, la réponse SW est exacte.)

---

## Robustesse / fallback
- Aucune dépendance externe, vanilla JS.
- Pas de SW (privé, 1er load) : `renderAppVersionLine` ne plante pas, affiche le fallback étiqueté.
- `#tab-settings` non cassé si SW indisponible (le conteneur a un contenu par défaut « SBD Hub » et est rempli en asynchrone).
- `_querySWVersion` borné par timeout → jamais de blocage.

---

## Tests

**Unitaires** (`tests/unit/app-version.test.js`, vm-extraction de la vraie source) :
- `_appVersionLabel` : v291/v292, suffixes (v42b), vide/null/sans-version → ''.
- `_swUpdateState` : waiting présent → available ; absent/null/undefined → false.

```
Test Suites: 11 passed, 11 total
Tests:       190 passed, 190 total   (184 + 6 nouveaux)
```

**Playwright** (`tests/app-version.spec.js`) — chargé l'app, navigué Profil → Réglages, vérifié `#appVersionLine` visible + contient `vXXX` + « SBD Hub » :
```
✓ tests/app-version.spec.js › Réglages affiche la ligne de version avec un vXXX (778ms)
1 passed
```
Texte rendu capturé (serveur local à la racine, où le SW ne peut pas précacher les chemins `/sbd-hub/...` → pas de contrôleur → fallback) :
```
SBD Hub · v292 · version du code (SW non actif)
```
Cela valide le câblage UI + le fallback honnête. Le chemin **SW-servi** (`· à jour` / `· nouvelle version prête`) nécessite le déploiement réel sous `/sbd-hub/` (précache OK → contrôleur répond `GET_VERSION`) ; il est couvert par le code du handler SW + les tests unitaires de `_appVersionLabel`/`_swUpdateState`.

`node -c` OK sur `js/app.js`, `service-worker.js`.

---

## Vérif réelle à faire après déploiement (manuel)
1. Ouvrir l'app déployée (`/sbd-hub/`), onglet Profil → Réglages : la ligne doit afficher `SBD Hub · v292 · à jour` (SW actif répond).
2. Au prochain bump (v293) : rouvrir → « nouvelle version prête » + bouton ; taper → l'app se recharge sur v293.

---

## Note de comportement (signalée)
Le retrait de `skipWaiting()` change le modèle de mise à jour : **les updates ne s'appliquent plus silencieusement** au reload suivant — elles **attendent un tap** (ou la fermeture de tous les onglets). C'est l'objectif (visibilité + contrôle), et c'est ce qui aurait évité les confusions de cache au debug.
