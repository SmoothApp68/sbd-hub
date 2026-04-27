# Audit 3c — PWA

## Service Worker — Cache

| Fichier JS chargé (index.html) | Dans ASSETS_TO_CACHE | Disponible offline ? |
|---|:---:|:---:|
| `js/engine.js` | ✅ | ✅ |
| `js/exercises.js` | ✅ | ✅ |
| `js/supabase.js` | ✅ | ✅ |
| `js/import.js` | ✅ | ✅ |
| `js/app.js` | ✅ | ✅ |
| `js/program.js` | ❌ | 🔴 |
| `js/coach.js` | ❌ | 🔴 |
| CDN chart.js | ❌ | 🟠 (network-first) |
| CDN supabase-js | ❌ | 🟠 (network-first) |

### 🔴 coach.js et program.js absents du cache SW

Ces deux fichiers (384 et 428 lignes) sont chargés par `index.html` mais **pas dans `ASSETS_TO_CACHE`** (`service-worker.js:3-18`).  
L'app ne fonctionne **pas offline** si l'utilisateur n'a jamais visité depuis la mise en cache initiale.  
**Reco** : ajouter `'/sbd-hub/js/program.js'` et `'/sbd-hub/js/coach.js'` dans `ASSETS_TO_CACHE`.

### 🟡 Stratégie SW : network-first puis cache fallback

Correcte pour une SPA. Supabase exclus du cache (ligne 38). Images GitHub cachées séparément. ✅  
Risque : si le réseau échoue ET que le fichier n'est pas encore dans le cache runtime, l'app plante (coach + program).

## manifest.json

| Champ | Valeur | Verdict |
|---|---|---|
| `name` / `short_name` | TrainHub | ✅ |
| `display` | standalone | ✅ |
| `start_url` | `/sbd-hub/index.html` | ✅ (GH Pages) |
| `theme_color` / `background_color` | #0C0C18 | ✅ |
| `lang` | fr | ✅ |
| `categories` | fitness, health, sports | ✅ |
| `icons 192 + 512` | présents | ✅ |
| `purpose` icônes | `"any maskable"` combiné | 🟡 |
| `screenshots` | absent | 🟡 |

### 🟡 `purpose: "any maskable"` sur une seule entrée

La spec PWA recommande deux entrées séparées : une `"any"` et une `"maskable"`, pour éviter que l'icône adaptive masque le contenu sur iOS/Android.  
**Reco** : dupliquer chaque entrée avec `"purpose": "any"` et `"purpose": "maskable"`.

### 🟡 Icônes très légères

`icon-192.png` : 1.1 Ko — probablement un placeholder ou icône basse résolution.  
`icon-512.png` : 3.2 Ko — idem.  
Sur les stores PWA et Android, la qualité visuelle sera médiocre.

## Meta tags iOS

`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` → ✅ présents.

## Push Notifications

Handler `push` présent dans `service-worker.js:68`. Pas d'icône ni badge dans `showNotification()` — l'icône sera absente sur Android.  
**Reco** : ajouter `icon: '/sbd-hub/icons/icon-192.png'` dans les options.

## Fichiers JS non chargés (orphelins)

`js/constants.js` (110 lignes) et `js/utils.js` (141 lignes) existent sur disque mais ne sont pas référencés dans `index.html` ni cachés par le SW.
