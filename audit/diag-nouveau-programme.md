# Diagnostic — "Nouveau programme" → ancien affichage — v232

## Symptôme

Clic "Nouveau programme" → affichage de l'ancienne vue (renderProgramBuilderView) au lieu du redesign v231 (renderProgrammeV2).

---

## Cause racine exacte

### Ligne de code : `js/app.js:23331`

```js
// Fin de generateWeeklyPlan() — après db.weeklyPlan = plan; (ligne ~23317)
if (typeof renderProgramBuilderView === 'function') {
  renderProgramBuilderView(document.getElementById('programBuilderContent'));
}
```

`generateWeeklyPlan()` appelle **`renderProgramBuilderView()`** pour rafraîchir l'UI après génération.

### Le problème

`renderProgramBuilderView()` (ligne 12103) est l'**ancien renderer** — il construit sa propre vue HTML tabulaire. Il n'a pas de logique de délégation vers `renderProgrammeV2`.

`renderProgramBuilder()` (ligne 10791) est le **nouveau renderer** — depuis v232, il délègue vers `renderProgrammeV2` si `db.weeklyPlan.days.length > 0` :

```js
// v232 — délègue à renderProgrammeV2 si un plan existe
if (typeof renderProgrammeV2 === 'function'
    && db.weeklyPlan && Array.isArray(db.weeklyPlan.days) && db.weeklyPlan.days.length > 0) {
  renderProgrammeV2();
  return;
}
```

### Séquence d'appels après clic "Nouveau programme"

```
onclick="generateWeeklyPlan()"   (ligne 10443)
  └─ generateWeeklyPlan()         (ligne 22890)
       ├─ db.weeklyPlan = plan;   (ligne ~23317) ← plan valide avec days.length > 0
       └─ renderProgramBuilderView(container)  (ligne 23331) ← ANCIEN renderer appelé
            └─ Affiche l'ancienne vue tabulaire
```

### Quand db.weeklyPlan est-il vide ?

Le plan n'est **jamais vide** lors du rendu. `db.weeklyPlan = plan` est assigné **avant** l'appel au renderer (ligne 23317 → 23331). Le bug n'est pas un race condition — c'est simplement le mauvais renderer qui est appelé.

---

## Fix minimal suggéré (sans l'implémenter ici)

Dans `generateWeeklyPlan()`, remplacer (ligne 23331) :

```js
if (typeof renderProgramBuilderView === 'function') {
  renderProgramBuilderView(document.getElementById('programBuilderContent'));
}
```

par :

```js
if (typeof renderProgramBuilder === 'function') {
  renderProgramBuilder();
} else if (typeof renderProgramBuilderView === 'function') {
  renderProgramBuilderView(document.getElementById('programBuilderContent'));
}
```

`renderProgramBuilder()` détecte que `db.weeklyPlan.days.length > 0` et délègue vers `renderProgrammeV2()`. L'ancien renderer reste comme fallback de sécurité.

---

## Note connexe — Charges Squat Pause nulles

Supabase confirme `weights = [null, null, null]` pour l'exercice "Squat Pause" sur Jeudi (Aurélien). Ce bug est indépendant du problème d'affichage : les charges null viennent d'un plan généré avant que `WP_SYNONYMS['Squat Pause']` soit en place. La régénération via "Nouveau programme" devrait corriger les charges — mais tant que le renderer appelé est `renderProgramBuilderView`, l'utilisateur ne voit pas le nouveau plan.
