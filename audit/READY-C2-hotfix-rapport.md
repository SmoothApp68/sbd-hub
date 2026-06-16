# READY-C2-hotfix — Persistance synchrone du check-in quotidien

Branche : `fix/checkin-persist-now` · Base : `main` = `9fe3ebf` (v285, C2-d) ·
Commit : `e19003c` (1 ligne de fix + 1 test + bump v286). 132/132 verts.

## Bug (prod, reproduit)

L'utilisateur valide un check-in, voit le toast « ✅ Check-in : XX/100 », mais après
fermeture/réouverture l'entrée a disparu : ni en localStorage, ni dans Supabase.

## Cause racine (confirmée par lecture du code v285)

`saveDailyCheckin()` pousse l'entrée dans `db.readinessHistory` **en mémoire** puis
appelle `saveDB()`. Or `saveDB()` (app.js:332) **débounce l'écriture à 2 s** :
```js
function saveDB() {
  clearCaches(); _saveDBDirty = true;
  if (_saveDBTimer) return;
  _saveDBTimer = setTimeout(function(){ _saveDBTimer = null; _flushDB(); }, 2000);
  ...
}
```
`_flushDB()` (le seul à faire `localStorage.setItem(STORAGE_KEY, …)`) ne part qu'à
l'échéance. Si l'app est fermée/backgroundée dans la fenêtre de 2 s — cas typique
« je valide puis je range mon téléphone » — le flush n'a pas lieu, l'écriture mémoire
est perdue au reload. Les garde-fous `beforeunload`/`visibilitychange:hidden →
_flushDB` ne sont pas fiables en PWA mobile et n'ont pas sauvé l'écriture.

## Correctif (atomique, une ligne)

Dans `saveDailyCheckin()` : `saveDB();` → **`saveDBNow();`**.
`saveDBNow()` (app.js:346) annule le timer, flush **synchroniquement** (`_flushDB` →
`localStorage.setItem`) puis `debouncedCloudSync()`. C'est l'outil des actions
ponctuelles (déjà utilisé par `sobFinish()`). Périmètre : cette seule ligne — ni
`saveDB`/`saveDBNow`/`_flushDB`, ni les autres appelants, ni refactor.

## Test de non-régression

`checkin_persiste_immediatement` (tests/unit/c2-harness.test.js) exécute la **vraie**
chaîne `saveDailyCheckin → saveDBNow → _flushDB` (sources vm-extraites) avec :
- un stub `localStorage` instrumenté ;
- un stub **`setTimeout` qui throw s'il est appelé** → garantit que rien n'est différé ;
- aucun `advanceTimersByTime`.

Assertions : `setItem(STORAGE_KEY)` appelé **1×** synchronement ; le `db` sérialisé
contient l'entrée `readinessHistory` du jour avec le bon `score` ; `debouncedCloudSync`
déclenché 1×. Un 2ᵉ test prouve qu'un check-in incomplet (3/4) → `null` → **zéro**
persistance. Le test C2-b « saveDB appelé 1× » devient « saveDBNow 1× » (même commit,
règle du commit vert). Suite : **132/132** (130 + 2).

## Preuve de persistance immédiate (Playwright, end-to-end)

Seed vierge (`readinessHistory: []`), remplissage 4/4 par vrais clics, clic Confirmer,
puis lecture de `localStorage` **immédiatement après le clic** (aucune attente) :
```json
{ "persistedImmediately": { "hasEntry": true, "score": 68, "count": 1 },
  "afterReload":          { "hasCheckin": true, "cardPresent": false, "historyLen": 1 } }
```
→ l'entrée est écrite **avant tout délai**, **survit au rechargement**, et le gate
`hasTodayCheckin()` masque alors la carte « Check-in du jour ». Zéro pageerror.

## Signalement sans agir — chantier « fiabilité de persistance » (à cadrer)

Même motif « `saveDB()` ponctuel suivi d'un toast / fermeture de modal » → même risque
de perte sur fermeture rapide. **NON modifiés ici.** Sites confirmés (v286) :

| Site | Fonction | Action ponctuelle |
|---|---|---|
| app.js:1360 | `grantHealthConsent` | consentement santé accordé |
| app.js:1373 | `revokeHealthConsent` | consentement santé révoqué |
| app.js:1798 | `obFinishWelcomeBack` | fin onboarding « welcome back » |
| app.js:3237 | `saveRoutine` | sauvegarde programme/routine |
| app.js:6835 | `showTitleModal` (onclick inline) | changement de titre actif |
| app.js:7205 | `setGhostMode` | bascule mode privé/ghost |
| app.js:4761 | `showClassQuiz` | enregistrement quiz cours collectif |

(Sur 152 appels `saveDB()` au total, la grande majorité sont des toggles rapides où le
débounce est **souhaitable** — seuls les one-shot critiques ci-dessus sont concernés.)

Le futur chantier devra, AVANT de basculer ces sites en `saveDBNow`, élucider **pourquoi
`visibilitychange:hidden → _flushDB` n'a pas suffi sur mobile** (Service Worker qui tue
la page ? handler non enregistré ? ordre d'événements iOS ?). Sinon `saveDBNow` ne fait
que **réduire** la fenêtre de perte (2 s → durée du flush sync), il ne la **ferme** pas
totalement pour les écritures qui suivraient. Diagnostic dédié recommandé.
