# Calisthenics comme mode à part dans l'onboarding — v212 → v213

## Contexte

En v211, le mode `calisthenics` existait dans l'algorithme (DUP_SEQUENCE, SkillTree) mais
n'était accessible en onboarding qu'indirectement — sélectionner `maison` comme équipement
dans la Q3 du fast-flow déclenchait une bascule silencieuse vers `calisthenics`.

Problème : l'user ne voyait jamais le mode dans la grille, et la bascule inverse (`salle` →
`musculation`) annulait un éventuel choix explicite de `calisthenics` fait dans la step-2
du full onboarding.

---

## Changements v213

### 1 — Bouton dans `ob-mode-grid` (`index.html`)

Ajout d'un 5e bouton dans la grille des modes (step-2 full onboarding) :

```html
<div class="ob-mode-btn" onclick="selectTrainingMode('calisthenics')">
  <div class="ob-mode-icon">🤸</div>
  <div class="ob-mode-name">Calisthenics</div>
  <div class="ob-mode-desc">Tractions, dips, muscle-up, progressions poids du corps</div>
</div>
```

La grille reste en `grid-template-columns: 1fr 1fr` — le 5e bouton occupe la colonne gauche
de la 3e ligne, centré naturellement.

### 2 — `modeMap` mis à jour (`js/app.js` ligne ~1443)

```js
var modeMap = { musculation:0, powerbuilding:1, powerlifting:2, bien_etre:3, calisthenics:4 };
```

Permet le pré-select visuel du bon bouton lors de la réouverture de l'onboarding pour un
user déjà en mode calisthenics.

### 3 — `obQ3SelectMat()` — garde `_obSelectedMode` (`js/app.js` ligne ~1540)

**Avant :**
```js
} else if (db.user.trainingMode === 'calisthenics') {
  db.user.trainingMode = 'musculation';
}
```

**Après :**
```js
} else if (db.user.trainingMode === 'calisthenics' && _obSelectedMode !== 'calisthenics') {
  db.user.trainingMode = 'musculation';
}
```

Si l'user a cliqué sur le bouton Calisthenics dans la grille (`_obSelectedMode === 'calisthenics'`),
choisir ensuite `salle` ou `haltères` ne bascule plus vers `musculation`. La bascule automatique
`maison → calisthenics` reste intacte pour les users qui arrivent par le fast-flow Q3.

### 4 — `TRAINING_MODES.calisthenics` (`js/engine.js`)

Ajout de l'entrée complète dans le registre `TRAINING_MODES` :

```js
calisthenics: {
  id: 'calisthenics',
  label: 'Calisthenics',
  icon: '🤸',
  desc: 'Tractions, dips, muscle-up, progressions poids du corps',
  features: {
    show1RM: false, showIPF: false, showSBDCards: false,
    showStrengthLevel: true, showPlateauDetection: true,
    showCompetition: false, showWeeklyPlan: true,
    showBWRatio: false, showSkillTree: true, useBWFactors: true,
    defaultKeyLifts: [],
    primaryMetrics: ['skill_level', 'sessions_count', 'streak', 'volume_total'],
    programStyle: 'calisthenics',
    badgeTheme: 'volume'
  }
}
```

Garantit que `modeFeature('showSBDCards')` → `false` et `modeFeature('showSkillTree')` → `true`
pour les users en mode calisthenics.

---

## Tests : 2 invariants Playwright

| Test | Vérifie |
|---|---|
| CALI-01 | `selectTrainingMode('calisthenics')` → `_obSelectedMode === 'calisthenics'` ET `db.user.trainingMode === 'calisthenics'` |
| CALI-02 | Après choix calisthenics dans grille, `obQ3SelectMat('salle', null)` ne réinitialise PAS vers musculation |

> Tests : `tests/audit-calisthenics-mode-onboarding-v213.spec.js` (2 tests).

## SW v212 → v213
