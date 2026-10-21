# Audit 60 — Auto-Tuner tourne en boucle malgré les guards
Date : 2026-05-15

---

## Guard actuel (code exact — `calcVolumeAutoTune()`, coach.js:434)

```js
var logs4w = logs.filter(function(l) { return l.timestamp > now - fourWeeks; });
// Minimum 8 séances sur 14j calendaires — évite les faux positifs cold start
if (logs4w.length < 8) return {};
var oldestLog = logs4w.reduce(function(min, l) { return l.timestamp < min ? l.timestamp : min; }, Date.now());
if ((Date.now() - oldestLog) < 14 * 86400000) return {};
```

Les deux guards portent uniquement sur le **volume de données** (nb séances, ancienneté).
Ils ne contiennent **aucun garde sur la fréquence de déclenchement** (pas de timestamp "last ran").

---

## Condition réelle pour Aurélien

| Guard | Valeur estimée | Bloqué ? |
|---|---|---|
| `logs4w.length < 8` | Aurélien a 514 logs au total. Avec une fréquence 4×/semaine, ≈16 séances sur 28j | **NON — 16 >> 8** |
| `oldestLog` < 14j | Il s'entraîne depuis des mois → log le plus ancien des 28j = il y a ~28j | **NON — 28j > 14j** |

Les deux guards passent → `calcVolumeAutoTune()` s'exécute entièrement à chaque appel.

---

## Pourquoi `isEndOfPhaseBlock()` retourne TRUE en boucle

C'est la **cause racine principale**.

### Code de `isEndOfPhaseBlock()` (app.js:8190)

```js
function isEndOfPhaseBlock() {
  var cb = db.weeklyPlan && db.weeklyPlan.currentBlock;
  if (!cb || !cb.phase) return false;
  var maxWeeks = durations[cb.phase] || 4;
  var weeksSince = cb.blockStartDate
    ? Math.max(0, Math.round((Date.now() - cb.blockStartDate) / (7 * 86400000))) : 0;
  return weeksSince >= maxWeeks;
}
```

### Qui écrit `blockStartDate` ?

| Fonction | Condition | Valeur |
|---|---|---|
| `confirmPhaseTransition()` | Clic utilisateur sur "Oui" dans le modal de phase | `Date.now()` |
| `wpForcePhase()` | Sélection manuelle dans les réglages | `Date.now()` |
| `generateWeeklyPlan()` (ligne 23441) | **Seulement si `!cb.blockStartDate`** | `Date.now()` |

**`generateWeeklyPlan()` ne reset JAMAIS `blockStartDate` si elle est déjà définie.**

### Scénario de boucle

1. À l'onboarding (ou première regénération), `blockStartDate = Date.now()` est écrite via le guard ligne 23441.
2. Les semaines passent. Aurélien ne clique jamais "Oui" dans le modal de phase transition (parce qu'il ne l'a jamais vu, ou l'a ignoré).
3. `blockStartDate` reste figée à la date d'initialisation — elle ne bouge pas.
4. Après `maxWeeks` semaines (5 pour hypertrophie intermédiaire), `weeksSince >= 5` → `isEndOfPhaseBlock()` retourne **TRUE**.
5. Désormais, **chaque appel à `generateWeeklyPlan()` déclenche l'auto-tuner**.

---

## Ordre d'appel dans `generateWeeklyPlan()` — problème d'ordre critique

```
ligne 23415 : wpDetectPhase()        ← calcule la phase depuis lastDeloadDate
ligne 23433 : isEndOfPhaseBlock()    ← TIRE L'AUTO-TUNER ici
ligne 23441 : if (!blockStartDate)   ← TROP TARD — init après le tir
```

`isEndOfPhaseBlock()` est appelé **avant** le guard d'initialisation de `blockStartDate`.
Si `blockStartDate` est absente : weeksSince=0 → retourne false (safe).
Si `blockStartDate` est présente et ancienne : weeksSince peut être très grand → retourne true → auto-tuner tire.

---

## Condition de déclenchement `-1` — code exact + valeurs pour Aurélien

```js
} else if (avgInsolvency >= 1.3 && avgSets > target.MEV) {
  var hasJointAlert = ...;
  if ((hasJointAlert || avgInsolvency >= 1.4) && currentDelta > limits.min) {
    recommendations[muscle] = currentDelta - 1;
  }
}
```

Pour Aurélien (charge élevée, 98kg, SBD ++) :
- `avgInsolvency` (sur 7j) est probablement **>= 1.4** → `hasJointAlert` n'est pas requis
- `avgSets > target.MEV` → avec MEV de base `quads=8, dos=10`, et Aurélien faisant ~16-20 sets/semaine → TRUE

**Le -1 s'applique.**

---

## Boucle de rétroaction négative — séquence exacte

```
Génération 1 :
  isEndOfPhaseBlock() → TRUE (weeksSince=5 ou plus)
  avgInsolvency=1.45 >= 1.3, avgSets(quads)=16 > MEV(8) → delta quads: 0 → -1
  getMuscleVolumeTarget('quads').MEV devient 7 (au lieu de 8)
  saveDB() → volumeDeltas = { quads: -1, dos: -1, ... }

Génération 2 (clic "Recalculer") :
  isEndOfPhaseBlock() → TRUE (blockStartDate inchangée)
  avgInsolvency=1.45 >= 1.3 (la fatigue réelle n'a pas changé — TRIMP-based)
  avgSets(quads)=16 > MEV(7) → toujours TRUE (MEV réduit, seuil plus facile à dépasser)
  delta quads: -1 → -2
  volumeDeltas = { quads: -2, dos: -2, ... }

Génération 3 :
  Identique → delta: -2 → -3
  volumeDeltas = { quads: -3, dos: -3, ... } — correspond exactement au signalement
```

**Amplification** : chaque réduction de MEV via `getMuscleVolumeTarget()` rend la condition `avgSets > target.MEV` plus facile à satisfaire. La fatigue réelle (`calcInsolvencyIndex` → `calcWeeklyFatigueCost` → TRIMP basé sur `s.weight * s.reps * RPE²`) reste inchangée → `avgInsolvency >= 1.3` reste vraie. La boucle s'auto-entretient.

---

## Cause racine

**Double problème :**

**1. `blockStartDate` n'est jamais reset après un tir de l'auto-tuner.**
`generateWeeklyPlan()` ne reset `blockStartDate` que si elle est absente. Une fois la date écrite, elle ne bouge que via `confirmPhaseTransition()` (clic utilisateur). L'auto-tuner ne reset pas `blockStartDate` → `isEndOfPhaseBlock()` reste TRUE à chaque régénération.

**2. Il n'existe pas de cooldown "last auto-tune ran at".**
L'auto-tuner peut tirer plusieurs fois par heure si l'utilisateur clique "Recalculer". Aucun timestamp ne limite sa fréquence à 1 fois par mésocycle.

---

## Fix recommandé

### Fix A — Reset `blockStartDate` après tir de l'auto-tuner (dans `generateWeeklyPlan()`)

```js
if (typeof isEndOfPhaseBlock === 'function' && isEndOfPhaseBlock()
    && typeof applyVolumeAutoTune === 'function') {
  var _tuned = applyVolumeAutoTune(db.logs || []);
  if (_tuned) {
    showToast('📊 Volume ajusté automatiquement selon ta progression.');
    // Reset blockStartDate → nouveau bloc démarre maintenant
    // Sans ce reset, isEndOfPhaseBlock() retournera TRUE à chaque generateWeeklyPlan
    db.weeklyPlan.currentBlock.blockStartDate = Date.now();
  }
}
```

Effet : au prochain `generateWeeklyPlan()`, `weeksSince=0`, `isEndOfPhaseBlock()=false`. L'auto-tuner ne tire plus pendant 4-5 semaines.

### Fix B — Cooldown dédié (garde complémentaire, plus robuste)

Dans `calcVolumeAutoTune()`, ajouter en tête :

```js
var _lastTune = db.weeklyPlan && db.weeklyPlan._autoTuneLastRun;
if (_lastTune && (Date.now() - _lastTune) < 28 * 86400000) return {};
```

Et dans `applyVolumeAutoTune()`, après `saveDB()` :

```js
if (!db.weeklyPlan) db.weeklyPlan = {};
db.weeklyPlan._autoTuneLastRun = Date.now();
```

Ce cooldown de 28j (durée d'un mésocycle minimum) garantit qu'aucune boucle ne peut se produire même si Fix A échoue.

### Priorité

**Fix B seul suffit** et est le plus défensif. Fix A est logiquement correct mais expose un risque si l'auto-tuner retourne `false` (aucun changement) — dans ce cas `blockStartDate` ne serait pas reset. Appliquer les deux pour une protection maximale.

---

## Résumé

| Point | Verdict |
|---|---|
| Guards `logs4w < 8` et `< 14j` bloquent pour Aurélien | **NON** — 514 logs, actif depuis des mois |
| `isEndOfPhaseBlock()` retourne TRUE en boucle | **OUI** — blockStartDate figée, jamais reset après auto-tuner |
| Feedback loop MEV décroissant | **OUI** — réduction MEV rend la condition plus facile à satisfaire |
| `applyVolumeAutoTune()` appelée si `calcVolumeAutoTune()` retourne `{}` | **NON** — `if (!recs || Object.keys(recs).length === 0) return false` |
| Autre endroit où l'auto-tuner est appelé hors `generateWeeklyPlan()` | **NON** — 1 seul call site |
| Fix requis | Cooldown 28j dans `calcVolumeAutoTune()` **+ reset blockStartDate après tir** |
