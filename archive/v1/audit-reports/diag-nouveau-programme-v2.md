# Diagnostic — "Nouveau programme" → ancien affichage après v235

## Symptôme persistant

Après le fix v235 (remplacement de `renderProgramBuilderView()` par `renderProgramBuilder()` dans `generateWeeklyPlan()`), le clic "Nouveau programme" affiche toujours l'ancienne vue.

---

## Q1 — Le fix v235 est-il bien appliqué ?

**OUI.** Ligne 23346 de `js/app.js` :

```js
if (typeof renderProgramBuilder === 'function') {
  renderProgramBuilder();
}
```

Le fix est en place. `renderProgramBuilderView()` n'est plus appelé depuis `generateWeeklyPlan()`.

---

## Q2 — Appels restants à `renderProgramBuilderView()`

5 appels subsistent, tous hors du chemin `generateWeeklyPlan()` :

| Ligne | Fonction | Contexte |
|---|---|---|
| 12310 | `pgmSwapDays()` | Après drag-drop swap de jours |
| 12580 | `progToggleCompet()` | Après activation mode compétition |
| 12652 | `progConfirmRemoveDay()` | Après suppression d'un jour |
| 12663 | `beEditIntention()` | Après édition intention hebdo |
| 20571 | `wpForcePhase()` | Fallback si `generateWeeklyPlan` indisponible |

Ces 5 appels ne sont pas sur le chemin "Nouveau programme" — ils n'expliquent pas le bug actuel.

---

## Q3 — Quel bouton "Nouveau programme" est cliqué ?

Il existe **deux** boutons "Nouveau programme" dans l'application :

### Bouton A — dans `renderProgrammeV2()` (ligne 10449)
```js
onclick="generateWeeklyPlan()"
```
→ Déclenche la génération d'un nouveau plan, puis appelle `renderProgramBuilder()` → délègue à `renderProgrammeV2()`. **Chemin correct.**

### Bouton B — dans `renderProgramTab()` (ligne 10759)
```js
onclick="pbStartGuided()"
```
→ Lance l'assistant de création guidé (wizard), affiche une interface étape par étape dans `#programBuilderContent`. **Chemin complètement différent — ancienne interface.**

**Le symptôme survient quand c'est le Bouton B qui est rendu**, ce qui se produit quand `renderProgramTab()` est appelé au lieu de `renderProgrammeV2()`.

---

## Q4 — Pourquoi `renderProgramBuilder()` appelle `renderProgramTab()` ?

Logique complète de `renderProgramBuilder()` (ligne 10799) :

```js
function renderProgramBuilder() {
  if (_customBuilderState) { renderCustomBuilder(); return; }
  if (_pbState) { renderProgramBuilderStep(...); return; }

  // Délègue vers renderProgrammeV2 SI weeklyPlan valide
  if (typeof renderProgrammeV2 === 'function'
      && db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0) {
    var _pbc = document.getElementById('programBuilderContent');
    if (_pbc) _pbc.innerHTML = '';
    renderProgrammeV2();
    return;
  }

  // Sinon, check si un programme "quelconque" existe
  var hasProgram = (db.generatedProgram && db.generatedProgram.length > 0)
                || (db.manualProgram && ...)
                || (db.routine && Object.keys(db.routine).length > 0)
                || ...;

  if (hasProgram) {
    renderProgramTab();  // ← ANCIENNE INTERFACE
    return;
  }

  // ... écran choix initial
}
```

### Condition de délégation vers `renderProgrammeV2()`

```js
db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0
```

Cette condition échoue dans **deux scénarios** :

**Scénario A — `db.weeklyPlan` est null ou undefined**
- Utilisateur en première utilisation, jamais généré de plan
- Ou `db.weeklyPlan` a été réinitialisé

**Scénario B — `db.weeklyPlan.days` est vide (`[]`)**
- Edge case : `generateWeeklyPlan()` a produit un plan avec 0 jours
- Condition : `days.length > 0` → false

Dans les deux scénarios, `renderProgramBuilder()` tombe dans le bloc `hasProgram`. Si l'utilisateur a un ancien programme (`db.routine`, `db.generatedProgram`, etc.), `hasProgram = true` → **`renderProgramTab()` est appelé** → bouton "Nouveau programme" → `pbStartGuided()`.

---

## Q5 — Navigation onglet `s-plan`

`showSeancesSub('s-plan')` (ligne ~2860) :
```js
case 's-plan':
  var oldPgm = document.getElementById('programmeV2Content');
  if (oldPgm) oldPgm.innerHTML = '';
  renderProgramBuilder();
  break;
```

À chaque ouverture de l'onglet programme, `renderProgramBuilder()` est appelé. Si `db.weeklyPlan` est null (première visite, ou après reset), la condition échoue, `renderProgramTab()` est rendu.

---

## Cause racine exacte (v235)

### Le vrai problème : condition trop stricte dans `renderProgramBuilder()`

```js
// Condition actuelle — échoue si weeklyPlan null ou days vide
db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0
```

Quand `db.weeklyPlan` est null → condition false → `hasProgram` check → si `db.routine` existe → `renderProgramTab()` → bouton "Nouveau programme" → `pbStartGuided()` → ancienne interface.

### Séquence complète du bug

```
Utilisateur ouvre onglet Programme
  └─ showSeancesSub('s-plan')
       └─ renderProgramBuilder()
            ├─ db.weeklyPlan === null  →  condition false
            ├─ hasProgram === true (db.routine existe)
            └─ renderProgramTab()  ←  ANCIENNE INTERFACE
                 └─ Bouton "Nouveau programme"
                      └─ onclick="pbStartGuided()"  ←  WIZARD, PAS generateWeeklyPlan
```

Ce chemin n'a **rien à voir** avec le fix v235. Le v235 corrigeait l'appel *après* `generateWeeklyPlan()`. Mais si l'utilisateur n'a pas encore `db.weeklyPlan` (ou l'a perdu), `renderProgrammeV2()` n'est jamais appelé, et le bouton vu n'est jamais celui qui appelle `generateWeeklyPlan()`.

---

## Fix minimal suggéré (sans l'implémenter ici)

Dans `renderProgramBuilder()`, remplacer la condition :

```js
// AVANT
if (typeof renderProgrammeV2 === 'function'
    && db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0) {
  var _pbc = document.getElementById('programBuilderContent');
  if (_pbc) _pbc.innerHTML = '';
  renderProgrammeV2();
  return;
}
```

par :

```js
// APRÈS — délègue vers renderProgrammeV2 dès qu'on n'est pas en wizard
if (typeof renderProgrammeV2 === 'function') {
  var _pbc = document.getElementById('programBuilderContent');
  if (_pbc) _pbc.innerHTML = '';
  renderProgrammeV2();
  return;
}
```

`renderProgrammeV2()` gère déjà le cas "pas de plan" — elle affiche une interface d'onboarding ou un bouton "Générer" qui appelle `generateWeeklyPlan()`. La condition `days.length > 0` dans `renderProgramBuilder()` était donc redondante et bloquante.

---

## Résumé

| Version | Fix appliqué | Problème résiduel |
|---|---|---|
| v234 | — | `generateWeeklyPlan()` appelait `renderProgramBuilderView()` (vieux renderer) |
| v235 | `generateWeeklyPlan()` → `renderProgramBuilder()` ✓ | `renderProgramBuilder()` → condition trop stricte → `renderProgramTab()` → vieux bouton `pbStartGuided()` |

Le fix v235 était correct mais incomplet : il corrigeait l'appel *post-génération*, pas l'entrée initiale dans l'onglet programme quand `db.weeklyPlan` est absent.
