# READY-C2-hotfix-2 — Le check-in n'arrivait pas au cloud (hash de sync aveugle)

Branche : `fix/sync-hash-readiness-history` · Base : `main` (v286) ·
Commit : `19045a4` (fix 1 fonction + test + bump v287). 138/138 verts.

## Bug (prod, vérifié Supabase)

Après le hotfix `saveDBNow` (v286), le check-in persiste en localStorage (gate OK
au reload) mais n'arrive PAS dans Supabase : `readinessHistory` figé à ses 3 anciennes
entrées (dernière du 30 mai), alors que `updated_at` bouge (keepAlive). Local bon,
cloud vide.

## Cause racine (confirmée, source v286)

`syncToCloud()` (supabase.js:255) déduplique : `if (db._lastSyncHash === _computeDataHash(db)) return …`.
`_computeDataHash` signait une liste FIXE de champs incluant `(d.readiness||[]).length`
mais **jamais `d.readinessHistory`**. Depuis C2-b, un check-in écrit dans
`readinessHistory` et **ne touche plus `readiness`** → le hash restait identique →
`syncToCloud` court-circuitait (« Déjà à jour »). Tout check-in depuis C2-b était
**invisible à la sync** (perte cloud silencieuse). Angle mort introduit par C2 : la
source unique n'a pas été ajoutée au hash.

## Étape 0 — Quel fichier est servi ? (point le plus à risque)

**Vérifié AVANT de coder.** `index.html:3397` charge **`js/supabase.js`** (la source),
pas le `.min`. (Le `js/supabase-cdn.min.js` ligne 27 est le SDK Supabase, autre chose.)
Le Service Worker précache aussi `js/supabase.js` (service-worker.js:13). C'est la
bascule actée en P0 (chargement de la source + retrait du `.min` du précache).

→ **Le fix va dans `js/supabase.js` seul.** `js/supabase.min.js` (154 Ko, daté du
10 juin) est un **orphelin** : non référencé par `index.html`, absent du précache SW,
aucun process de build dans `package.json`. Seule autre occurrence dans le repo :
un **commentaire** de test (`audit/14-crash-hunting.spec.js:144`), pas un chargement.
**Non touché** (édition manuelle d'un `.min` orphelin = risque sans bénéfice). Il est
candidat à suppression (signalé ci-dessous). Le risque « fix appliqué au mauvais
fichier » est donc écarté : la source EST servie.

## Correctif (atomique, une fonction)

Dans `_computeDataHash` (supabase.js), ajout au tableau :
```js
var lastRh = (d.readinessHistory && d.readinessHistory[d.readinessHistory.length - 1]) || null;
// …
(d.readinessHistory || []).length,
(lastRh && lastRh.ts) || 0,   // ts : détecte un check-in du même jour qui remplace l'entrée
```
`(d.readiness||[]).length` conservé (l'ancien store reste lu en fallback). Périmètre :
cette seule fonction. `syncToCloud`/`syncFromCloud`/`.min` non touchés.

## Tests (tests/unit/sync-hash.test.js — vraie source vm-extraite)

```
Test Suites: 6 passed, 6 total
Tests:       138 passed, 138 total   (132 + 6, 0 rouge)
```
- extraction : la fonction servie inclut bien `readinessHistory` ;
- `hash_sensible_au_checkin` : 1 entrée `readinessHistory` en plus → hash différent ;
- même longueur mais `ts` de dernière entrée différent (remplacement du même jour) → différent ;
- sans `readinessHistory` → pas de crash, hash stable/déterministe ;
- toujours sensible aux autres champs (logs) — fix non destructif ; idempotence.

## Vérification end-to-end (Playwright, app + supabase.js réels chargés)

Après un check-in réel (score 85) via `saveDailyCheckin()` :
```json
{ "hashChanged": true, "readinessLen": { "before": 1, "after": 1 },
  "rhLen": { "before": 1, "after": 2 }, "guardWouldPass": true }
```
→ `readiness.length` **inchangé** (1→1, l'ancien store gelé — la raison exacte de
l'aveuglement de l'ancien hash), `readinessHistory` **grandit** (1→2), et le **hash
change** → le guard `db._lastSyncHash === t` est faux → `syncToCloud` **ne
court-circuite plus** et part faire l'upsert. Zéro pageerror.

## ⚠️ Vérification Supabase finale (à faire — Claude chat)

La preuve locale ferme la boucle côté code. **Confirmation prod requise** : après un
check-in réel en prod (v287, SW mis à jour), **relire `sbd_profiles.data->'readinessHistory'`
du profil** (Aurélien) et vérifier qu'une **nouvelle entrée du jour** y apparaît (et non
plus le gel au 30 mai). C'est la confirmation que les deux hotfix (local `saveDBNow` +
cloud `_computeDataHash`) ferment ensemble la boucle de persistance.

## Signalement sans agir — chantier « fiabilité de persistance »

Le hash de dédup est **fragile par conception** : toute donnée hors de sa liste fixe est
invisible à la sync. Champs `db` connus **hors hash** (donc à risque du même bug) :
`garminHealth` (créé en C2-c), `gamification`, `social`, `reports`, `savedRoutines`,
et tout futur champ. À verser au chantier fiabilité, avec le motif `saveDB()` ponctuel
(7 sites listés en hotfix-1) et le mystère `visibilitychange:hidden → _flushDB` non
fiable sur mobile.
**Piste à évaluer (ne RIEN implémenter ici)** : remplacer le hash sélectif par un
mécanisme sans liste manuelle — p. ex. `JSON.stringify(db).length` + un compteur de
version incrémenté à chaque `saveDB`/`saveDBNow`, ou un dirty-flag de sync. Cela
supprimerait toute une classe de « champ oublié dans le hash ».

Orphelin à nettoyer : `js/supabase.min.js` (non servi depuis P0) — candidat suppression
au chantier fiabilité / nettoyage repo.
