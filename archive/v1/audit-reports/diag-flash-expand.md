# Diagnostic — Flash ancien interface + "+2 exercices" non cliquable

## 🚨 CAUSE RACINE UNIQUE — `app.min.js` obsolète depuis v232

**Tous les fix v233 → v236 sont invisibles en production** car `index.html` charge `app.min.js`, pas `app.js`, et `app.min.js` n'a pas été régénéré depuis v232.

---

## Preuve définitive (4 indices)

### 1. `index.html` charge `app.min.js`

```html
<!-- index.html:3339 -->
<script defer src="js/app.min.js"></script>
```

Aucune référence à `js/app.js` dans `index.html`. **Le navigateur ne charge jamais `app.js`.**

### 2. `package.json` n'a aucun script de minification

```json
"scripts": {
  "test": "jest",
  "test:playwright": "npx playwright test",
  "test:report": "npx playwright show-report"
}
```

Pas de `build`, pas de `minify`, pas de `prepare`. **`app.min.js` est édité manuellement.**

### 3. Timestamps de fichiers

```
-rw-r--r-- 1429495 May 14 17:40  js/app.js          ← v236 modifié récemment
-rw-r--r-- 1428584 May 14 10:28  js/app.min.js      ← bloqué au v232 (9h plus tôt)
```

### 4. Historique git des commits récents

| Commit | Files touched | Note |
|---|---|---|
| `56c14d7` v232 | `app.js`, **`app.min.js`**, `service-worker.js` | ✅ Min synchronisé |
| `4e5f062` v233-v234 | `app.js`, `service-worker.js` | ❌ Min PAS touché |
| `9b6547a` v235 | `app.js`, `service-worker.js` | ❌ Min PAS touché |
| `316b811` v236 | `app.js`, `service-worker.js` | ❌ Min PAS touché |

---

## Q1 — Ordre d'initialisation du tab Plan

Flow normal :

```
showSeancesSub('s-plan')          [app.min.js:2860]
  └─ #programmeV2Content cleared
  └─ renderProgramBuilder()        [app.min.js:10791]
       └─ v232 condition stricte : weeklyPlan.days.length > 0
            ├─ TRUE  → renderProgrammeV2() into #programmeV2Content
            └─ FALSE → hasProgram check → renderProgramTab() into #programBuilderContent
```

Mais **`app.min.js:10796-10797`** :
```js
if (typeof renderProgrammeV2 === 'function'
    && db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0) {
```

→ état **v232**, ne contient PAS le fix v236 qui supprime cette condition.

---

## Q2 — Render avant `postLoginSync` ?

Sequence au boot :

```
1. Page load → activeSeancesSub = 's-go' par défaut
2. Init → restore last tab (setTimeout 0)
3. _applyLastTabSub('s-plan') → showSeancesSub('s-plan')
4. → renderProgramBuilder() (v232 dans min.js)
5. db.weeklyPlan chargé depuis localStorage (peut être null si premier lancement
   OU contenir une version stale)
6. Si condition v232 stricte échoue → renderProgramTab() écrit dans #programBuilderContent
7. ⏳ postLoginSync() async → syncFromCloud() → met à jour db.weeklyPlan
8. postLoginSync ligne 28857 → renderProgrammeV2() écrit dans #programmeV2Content
```

**Le bug DOM** (`index.html:2400-2401`) :

```html
<div id="s-plan" class="seances-sub" style="display:none;">
  <div id="programmeV2Content"></div>       ← V2 ici
  <div id="programBuilderContent"></div>    ← OLD ici (sibling, pas overlay)
</div>
```

Les deux divs sont **siblings**, **tous deux visibles**. Quand les deux contiennent du HTML, ils **s'empilent verticalement**. Le user voit l'OLD en bas + V2 en haut — d'où l'illusion du "flash, puis V2 par-dessus".

---

## Q3 — "+X exercices" non cliquable : code minifié

**`app.min.js:10246-10251`** :
```js
if (_more > 0) {
  _exoRows += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">'
    + '<div style="width:5px;height:5px;border-radius:50%;background:#a78bfa;'
    + 'opacity:0.2;flex-shrink:0;"></div>'
    + '<span style="color:var(--sub2,#666);font-size:12px;">+' + _more + ' exercices</span>'
    + '</div>';
}
```

**❌ Aucun `onclick`. Aucun `_todayCardExpanded`. ❌**

Comparaison avec **`app.js:10253-10260`** (fix v234) :
```js
if (_more > 0) {
  _exoRows += '<div onclick="_todayCardExpanded=true;if(typeof renderProgrammeV2===\'function\')renderProgrammeV2();" '
    + 'style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">'
    + '<div style="width:5px;height:5px;border-radius:50%;background:#a78bfa;'
    + 'opacity:0.2;flex-shrink:0;"></div>'
    + '<span style="color:#a78bfa;font-size:12px;">+' + _more + ' exercices ▾</span>'
    + '</div>';
}
```

`app.min.js` n'a JAMAIS reçu le fix v234.

---

## Q4 — Screenshots Playwright

**Non nécessaire** — la cause racine est définitive par analyse statique :
1. `diff js/app.js js/app.min.js` montre que min.js manque v233-v236
2. `index.html` charge exclusivement min.js
3. Pas de script de build → min.js ne se met jamais à jour automatiquement

Une vérification rapide DevTools (Network tab) suffit pour confirmer : on voit `app.min.js` chargé (1 428 584 octets, daté du 14 mai 10h28), pas `app.js`.

---

## Mapping symptôme → bug dans `app.min.js`

| Symptôme | Ligne `app.min.js` | État | Fix nécessaire |
|---|---|---|---|
| Flash : ancien interface au boot | 10796-10797 (condition v232 stricte) | Manque v236 | Rebuild min.js |
| Flash : "Nouveau programme" affiche OLD sous V2 | 23331-23332 (`renderProgramBuilderView`) | Manque v235 | Rebuild min.js |
| "+2 exercices" non cliquable | 10246-10251 (pas d'`onclick`) | Manque v234 | Rebuild min.js |
| Squat Pause poids nuls | WP_SYNONYMS, EXO_NAME_SYNONYMS | Manque v233 | Rebuild min.js |

---

## Pourquoi le DOM aggrave le flash

```html
<div id="programmeV2Content"></div>       <!-- contient V2 si rendu -->
<div id="programBuilderContent"></div>    <!-- contient OLD si rendu -->
```

Quand `renderProgramBuilder()` v232 a la condition stricte qui échoue :
1. `renderProgramTab()` écrit l'ANCIENNE interface dans `#programBuilderContent`
2. Puis `postLoginSync` → `renderProgrammeV2()` écrit V2 dans `#programmeV2Content`
3. **Les deux contiennent du HTML → empilés verticalement → user voit OLD en bas + V2 en haut**

Avec v236 (`app.js`), `#programBuilderContent` est toujours vidé avant que V2 ne soit rendu. Mais cette correction n'atteint jamais le user car `app.min.js` est servi.

---

## Fix minimal suggéré (sans l'implémenter ici)

### Option A — Régénérer manuellement `app.min.js` (immédiat)

```bash
cp js/app.js js/app.min.js
```

(Le fichier n'est pas réellement minifié — c'est juste une copie identique d'après les tailles : 1 429 495 vs 1 428 584 octets, différence ≈ 1ko = juste les changements v233-v236.)

Bumper SW v236 → v237 pour invalider le cache. 1 commit.

### Option B — Supprimer `app.min.js` et charger `app.js` directement

```html
<!-- index.html:3339 -->
<script defer src="js/app.js"></script>
```

Puis `git rm js/app.min.js`. Plus simple, plus de risque de désync.

### Option C — Ajouter un script de build

```json
"scripts": {
  "build": "terser js/app.js -o js/app.min.js --compress --mangle"
}
```

À lancer avant chaque commit. Plus invasif, demande tooling.

**Recommandation : Option B** (la plus simple, élimine la classe entière de bugs). Le fichier `app.js` fait 1,4 Mo non-minifié — gzip côté GitHub Pages ramène ça à ~250 ko, comparable à la version "min" actuelle qui n'est pas vraiment minifiée.

---

## TL;DR

Le diagnostic v1 et v2 sur `renderProgramBuilder` étaient corrects sur le code source, mais **inutiles** car les fix sont allés dans `app.js` qui n'est jamais servi. Le user a toujours vu le code v232. Tout devient cohérent : flash de l'ancien interface (v232 strict condition), "+X exercices" non cliquable (v234 manquant), Squat Pause poids nuls (v233 synonymes manquants).

**Une seule action règle tout : synchroniser `app.min.js` avec `app.js`.**
