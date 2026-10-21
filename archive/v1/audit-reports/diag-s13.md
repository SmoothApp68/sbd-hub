# Diagnostic S13 — rapport complet

**Date :** 2026-05-13  
**Symptôme :** `renderProgramIdentityCard()` affiche "Powerbuilding · S13" au lieu de "Powerbuilding · S2" après ⚡ Nouveau programme.

---

## 1. Ligne exacte qui écrit "S13"

**`app.js:23022`** — dans `generateWeeklyPlan()`, construction de l'objet `plan` :

```js
var plan = {
  days: days,
  week: (db.weeklyPlanHistory || []).length + 1,   // ← GÉNÈRE 13
  weekStreak: ..., phase: phase, mode: mode, ...
};
```

`db.weeklyPlanHistory` est capped à 12 entrées (L23036). Aurélien a régénéré 12× → `length = 12` → `week = 13`.

**`app.js:23038`** — ce plan écrase `db.weeklyPlan` entier :

```js
db.weeklyPlan = plan;  // ← efface currentBlock ET lastDeloadDate
```

---

## 2. Valeur de `week` au moment du rendu

**`app.js:11725`** — `renderProgramIdentityCard()` lit :

```js
var week = db.weeklyPlan && db.weeklyPlan.week ? db.weeklyPlan.week : '?';
// → db.weeklyPlan.week = 13 (le compteur de générations, PAS la semaine du bloc)
```

**`app.js:11737`** — construit le label :

```js
var weekLabel = phaseLabel ? phaseLabel + ' · S' + week : 'S' + week;
// → "Hypertrophie · S13"
```

Le champ `db.weeklyPlan.week` est un **compteur de générations** (combien de fois le programme a été regénéré), pas la position dans le bloc d'entraînement.

---

## 3. `wpDetectPhase()` écrase-t-elle `currentBlock.week` ?

**Oui — mais sur le mauvais objet, puis le bon objet est écrasé.**

Ordre d'exécution dans `generateWeeklyPlan()` :

1. **L22640** — `wpDetectPhase()` appelé → écrit correctement `db.weeklyPlan.currentBlock.week = 2`  
2. **L23021-23024** — `plan = { week: 13, ... }` créé **sans** `currentBlock` ni `lastDeloadDate`  
3. **L23038** — `db.weeklyPlan = plan` → **efface** `currentBlock.week=2` et `lastDeloadDate`  
4. **saveDB()** → persiste `week=13` en Supabase  
5. **`renderProgramIdentityCard()`** appelle à nouveau `wpDetectPhase()` → ré-écrit `currentBlock.week=2`  
   ...mais le header lit `db.weeklyPlan.week` (= 13), jamais `currentBlock.week`

**Champ écrit par `wpDetectPhase()` :** `db.weeklyPlan.currentBlock.week` (L20628)  
**Champ lu par le header :** `db.weeklyPlan.week` (L11725)  
→ **Deux champs différents, jamais synchronisés.**

---

## 4. Chaîne d'appels complète

```
⚡ Nouveau programme
  └─ onclick → generateWeeklyPlan()  [L22594]
        │
        ├─ wpDetectPhase()  [L22640]  → écrit currentBlock.week=2 ✓
        │
        ├─ ... génération des jours ...
        │
        ├─ plan = { week: weeklyPlanHistory.length+1 }  [L23022]
        │   → week = 12+1 = 13  ← BUG SOURCE 1
        │
        ├─ db.weeklyPlan = plan  [L23038]
        │   → efface currentBlock.week, lastDeloadDate  ← BUG SOURCE 2
        │
        ├─ saveDB()  [L23050]  → sync Supabase avec week=13
        │
        └─ renderWeeklyPlanUI()  [L23052]
              └─ renderProgramBuilderView()
                    └─ renderProgramIdentityCard()  [L11720]
                          │
                          ├─ wpDetectPhase()  [L11724]  → ré-écrit currentBlock.week=2
                          │
                          └─ var week = db.weeklyPlan.week  [L11725]
                                 → lit 13, pas 2  ← AFFICHAGE ERRONÉ
                                 → "Hypertrophie · S13"
```

---

## 5. Deux bugs distincts

| # | Bug | Ligne | Impact |
|---|-----|-------|--------|
| A | `plan.week = weeklyPlanHistory.length + 1` | L23022 | Sémantique erronée : compteur de générations ≠ semaine du bloc |
| B | Header lit `weeklyPlan.week` au lieu de `currentBlock.week` | L11725 | Mauvaise source pour l'affichage |
| C | `db.weeklyPlan = plan` efface `currentBlock` et `lastDeloadDate` | L23038 | lastDeloadDate perdu à chaque génération → SOURCE 0 doit re-détecter à chaque fois |

---

## 6. Fix minimal recommandé

**Une ligne — L11725** :

```js
// AVANT :
var week = db.weeklyPlan && db.weeklyPlan.week ? db.weeklyPlan.week : '?';

// APRÈS :
var week = (db.weeklyPlan && db.weeklyPlan.currentBlock && db.weeklyPlan.currentBlock.week)
  || '?';
```

**Fix complémentaire — L23021-23024** — préserver `lastDeloadDate` et `currentBlock` dans le plan :

```js
var plan = {
  days: days,
  week: (db.weeklyPlan.currentBlock && db.weeklyPlan.currentBlock.week) || 1, // semaine du bloc, pas compteur
  lastDeloadDate: db.weeklyPlan.lastDeloadDate || null,   // préserver
  currentBlock: db.weeklyPlan.currentBlock || null,       // préserver
  weekStreak: ..., phase: phase, mode: mode, ...
};
```

---

## 7. Vérification `totalWeeks` après v227

`totalWeeks` n'apparaît plus dans `app.js` (v227 a supprimé la rotation). Confirmation :

```
grep -n "totalWeeks" js/app.js → (aucun résultat)
```

`wpEstimateCurrentWeek()` (L20292) retourne `db.weeklyPlan.week` si défini — après le fix B, il retournera la valeur correcte de `currentBlock.week`.

