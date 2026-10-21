# Diagnostic S1 — v230 (Sonnet 4.6) — RAPPORT

> **Statut** : Diagnostic + reproduction visuelle. **AUCUN FIX APPLIQUÉ.**
> Le bug est reproduit en local avec un test Playwright (2 scénarios A/B).

---

## TL;DR

Le bug **S1 affiché au lieu de S2** est reproductible.

**Cause racine** : Si `localStorage.SBD_HUB_V29.weeklyPlan.lastDeloadDate` est **absent** au moment du **premier rendu du header**, `wpDetectPhase()` tombe en fallback `blockStartDate` (4 mai → 1.3 sem → **S1**). Le fix v229/v230 `postLoginSync → wpDetectPhase` corrige bien `currentBlock.week=2` *après* le sync cloud, **mais l'UI n'est jamais re-render après ce sync** → l'affichage reste figé sur l'état initial (S1).

---

## ÉTAPE 1 — Ligne exacte qui affiche "S1"

**`js/app.js:11738`** dans `renderProgramIdentityCard()` :

```js
11724:  var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : '';
11725:  // v228 — lire currentBlock.week (semaine du bloc) et non weeklyPlan.week (compteur générations)
11726:  var week = (db.weeklyPlan && db.weeklyPlan.currentBlock && db.weeklyPlan.currentBlock.week) || '?';
        ...
11737:  var phaseLabel = phase ? (phase.charAt(0).toUpperCase() + phase.slice(1)) : '';
11738:  var weekLabel = phaseLabel ? phaseLabel + ' · S' + week : 'S' + week;
```

→ `weekLabel = 'Hypertrophie · S' + week` → si `week = 1`, on voit `Hypertrophie · S1`.

Notez deux choses importantes :
- L11724 appelle `wpDetectPhase()` qui **écrit** `currentBlock.week` (effet de bord) **avant** que L11726 lise la valeur.
- L11726 a un fallback `|| '?'` mais on n'a JAMAIS observé `'?'` dans les tests : `wpDetectPhase` écrit toujours une valeur si `currentBlock` existe (ce qui est le cas dès le 1er load via `loadDB`).

---

## ÉTAPE 2 — Ordre exact des appels après ⚡

`generateWeeklyPlan()` à `app.js:22625`. Lignes (relatives à la fonction) :

| L (rel) | Code | Effet sur `currentBlock.week` |
|---|---|---|
| **23** | `var phase = wpDetectPhase() \|\| 'hypertrophie';` | **ÉCRIT** `currentBlock.week` (si cb existe déjà) |
| 24-25 | `if (!db.weeklyPlan) … if (!cb) cb = {};` | Crée si manquant |
| 26 | `cb.phase = phase;` | Pas de touche à `.week` |
| 29-31 | `if (!cb.blockStartDate) cb.blockStartDate = Date.now();` | Pas de touche à `.week` ; **mais** crée un nouveau `blockStartDate` si absent |
| 405-409 | `var plan = { days, _generationCount, weekStreak, phase, mode, isDeload, generated_at };` | `plan` n'a PAS de `currentBlock` |
| 423-426 | `_prevCurrentBlock = db.weeklyPlan.currentBlock;` (référence) | Snapshot par référence |
| **427** | `db.weeklyPlan = plan;` | **Écrase** `db.weeklyPlan` mais l'ancien `currentBlock` est toujours pointé par `_prevCurrentBlock` |
| 428 | `if (_prevCurrentBlock) db.weeklyPlan.currentBlock = _prevCurrentBlock;` | **Restaure** la référence → `currentBlock.week` conservé |
| 434 | `saveDB();` | Persiste |

### Réponse à la question clé du diagnostic

> *Est-ce que `generateWeeklyPlan()` appelle `wpDetectPhase()` AVANT ou APRÈS avoir écrit `db.weeklyPlan = plan` ?*

**AVANT** (L23 vs L427). Et la préservation via `_prevCurrentBlock` (référence d'objet, pas copie) fonctionne correctement : l'objet `currentBlock` mis à jour à L23 par `wpDetectPhase` est ré-attaché à L428 après le `db.weeklyPlan = plan` de L427.

→ **`generateWeeklyPlan()` n'écrase PAS la valeur de `postLoginSync()`.**

---

## ÉTAPE 3 — Reproduction Playwright + screenshots

Test : `tests/diag-s1-visual.spec.js` (2 scénarios, `addInitScript` pour pré-remplir localStorage avant le 1er load).

### Scénario A — localStorage AVEC `lastDeloadDate`

```json
weeklyPlan: {
  lastDeloadDate: "2026-04-27T00:00:00.000Z",
  currentBlock: { phase:"hypertrophie", week:2, blockStartDate: 4 mai }
}
```

**Résultat** :
```
POST-LOAD : cbWeek=2, headerWeek="S2" ✅
APRÈS ⚡  : cbWeek=2, headerWeek="S2" ✅
```
→ Screenshot : `audit/diag-s1-scenarioA.png` (header affiche **Hypertrophie · S2**)

### Scénario B — localStorage SANS `lastDeloadDate` (cas legacy/désync)

Identique à A mais avec `delete db.weeklyPlan.lastDeloadDate`.

**Résultat** :
```
POST-LOAD : cbWeek=1, headerWeek="S1" ❌  ← BUG REPRODUIT
APRÈS ⚡  : cbWeek=1, headerWeek="S1" ❌
```
→ Screenshot : `audit/diag-s1-scenarioB.png` (header affiche **Hypertrophie · S1**)

---

## ÉTAPE 4 — postLoginSync vs generateWeeklyPlan

### `postLoginSync()` (app.js:28569)

```js
async function postLoginSync() {
  try {
    if (typeof syncFromCloud === 'function') await syncFromCloud();
    else if (typeof loadFromCloud === 'function') await loadFromCloud();
    // v230 — Recalculer currentBlock.week depuis lastDeloadDate (ou blockStartDate) après load
    if (typeof wpDetectPhase === 'function' && db.weeklyPlan) {
      try { wpDetectPhase(); if (typeof saveDB === 'function') saveDB(); } catch (e) {}
    }
    ...
  }
}
```

**Aucun `refreshUI()` n'est appelé après ce bloc.** Vérifié :
```
$ awk '/^async function postLoginSync/,/^}/' js/app.js | grep -n "refreshUI\|render\|update"
(aucun résultat)
```

### Chronologie de l'ouverture de la page (Aurélien)

1. **`<script defer src="js/app.min.js">`** s'exécute après parsing HTML.
2. **`let db = (() => {...})()`** (L109) : `db` ← parsé depuis localStorage. À ce moment, `lastDeloadDate` est ce qui est dans localStorage local (potentiellement absent si l'utilisateur n'avait pas encore reçu le sync v225).
3. **Rendu initial** des onglets (Aujourd'hui, Séances...) → `renderProgramIdentityCard()` lit `currentBlock.week`. `wpDetectPhase()` y calcule `weeksSince` :
   - Si `lastDeloadDate` présent → S2 ✅
   - Sinon → fallback `blockStartDate = 4 mai` → S1 ❌
4. **`postLoginSync()` (async)** s'exécute en parallèle :
   - `syncFromCloud()` → `db = cloudData` (Supabase a `lastDeloadDate=2026-04-27`)
   - `wpDetectPhase()` recalcule → `currentBlock.week = 2`
   - `saveDB()` persiste
5. **MAIS le DOM n'est pas re-render.** Le header continue d'afficher `S1` (valeur initiale).

### Pourquoi le clic ⚡ ne corrige pas en Scénario B

`generateWeeklyPlan()` recompute `wpDetectPhase()` **avec l'état courant de `db`**.

En production normale, après postLoginSync, `db.weeklyPlan.lastDeloadDate = '2026-04-27'` → S2. Donc ⚡ devrait afficher S2.

**Mais** : si le `db` en mémoire n'a *jamais* eu `lastDeloadDate` (parce que postLoginSync a échoué, ou que la valeur a été écrasée entre temps), alors :
- `wpDetectPhase()` à L23 utilise le fallback `cb.blockStartDate` (4 mai)
- `weeksSince = round(9j / 7) = 1`
- `currentBlock.week = max(1, min(1, 4)) = 1`
- Header → **S1**

C'est exactement ce que reproduit le **Scénario B**.

---

## SYNTHÈSE & HYPOTHÈSES

### Faits établis

| # | Fait | Évidence |
|---|---|---|
| 1 | La ligne qui affiche S1 est `app.js:11738` | grep |
| 2 | `wpDetectPhase` est appelé AVANT `db.weeklyPlan = plan` dans `generateWeeklyPlan` | L23 vs L427 |
| 3 | La préservation de `currentBlock` via `_prevCurrentBlock` fonctionne (référence d'objet) | Scénario A |
| 4 | `postLoginSync` n'appelle PAS `refreshUI()` après le re-calcul de `currentBlock.week` | grep dans la fn |
| 5 | Si `lastDeloadDate` est absent de `db.weeklyPlan` au moment du rendu, → S1 | Scénario B |

### Hypothèses sur la cause en production (NON-VÉRIFIÉES)

| # | Hypothèse | Plausibilité |
|---|---|---|
| **H1** | `postLoginSync` re-calcule `currentBlock.week=2` mais **l'UI n'est pas refresh** → l'utilisateur voit S1 (état initial avant sync). Après un refresh manuel (F5 ou navigation), il verrait S2. | **Forte** — code grep confirme l'absence de refreshUI |
| H2 | `syncFromCloud` échoue silencieusement (auth, réseau) → `lastDeloadDate` jamais chargé → `wpDetectPhase` retombe sur fallback à chaque appel | Possible mais user dit que `currentBlock.week=2` est en Supabase, donc le sync a forcément réussi à un moment |
| H3 | Service Worker sert un vieux `app.min.js` (pré-v230) → `postLoginSync` n'a pas le v230 fix | Possible si le user n'a pas rechargé hard. Vérifier la version SW dans DevTools. |

---

## LIVRABLES (4 points demandés)

1. **Ligne exacte qui affiche S1** → `app.js:11738`
2. **Ordre exact après ⚡** :
   - `wpDetectPhase()` (L23) → écrit `currentBlock.week` *si* `cb` existait déjà
   - puis `db.weeklyPlan = plan` (L427) → la préservation par référence (L428) restaure `cb` correctement
3. **`generateWeeklyPlan()` écrase-t-il `postLoginSync` ?** → **NON.** Le bug n'est pas un écrasement, c'est un **défaut de re-render** (et un état `db.lastDeloadDate` éventuellement manquant lors du premier rendu).
4. **Screenshots** :
   - `audit/diag-s1-scenarioA.png` → S2 ✅ (cas normal)
   - `audit/diag-s1-scenarioB.png` → S1 ❌ (bug reproduit)

---

## CE QUI RESTE À VÉRIFIER (avant tout fix)

1. **Sur Aurélien, vérifier dans DevTools** : quel est `db.weeklyPlan.lastDeloadDate` **après l'appel `postLoginSync`** ?
   - Si présent → confirme H1 (problème de re-render)
   - Si absent → confirme H2 (sync ne load pas lastDeloadDate)
2. **Sur Aurélien, faire un hard refresh (Ctrl+Shift+R)** :
   - Si le header passe à S2 → confirme H1 (et accessoirement le SW)
   - Si reste à S1 → autre chose
3. **Vérifier la version SW active** : DevTools → Application → Service Workers → `trainhub-v230` ?

**Aucun fix appliqué, en attente de feedback.**
