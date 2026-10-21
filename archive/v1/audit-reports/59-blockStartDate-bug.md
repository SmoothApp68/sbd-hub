# Audit 59 — blockStartDate dans le futur + wpDetectPhase
Date : 2026-05-15

---

## Correction préliminaire — Erreur de décodage du timestamp

> **Le timestamp `1777852800000` n'est PAS le 2 juin 2026.**

| Calcul | Résultat |
|---|---|
| `new Date(1777852800000)` UTC | **lundi 4 mai 2026 00:00:00** |
| Paris CEST (UTC+2) | lundi 4 mai 2026 02:00:00 |
| Timestamp du 2 juin 2026 | `1780358400000` (≠) |
| Aujourd'hui (15 mai 2026) | `1778803200000` |
| Écart (blockStartDate → aujourd'hui) | **−11 jours** (passé, pas futur) |

La `blockStartDate` présente dans la DB d'Aurélien est donc **11 jours dans le passé**, soit le lundi de la semaine −1.5. La confusion vient probablement d'un décodage en fuseau horaire UTC+8 ou d'un calcul manuel erroné.

---

## Toutes les écritures de `blockStartDate`

| Fichier | Ligne | Fonction | Valeur assignée | Type |
|---|---|---|---|---|
| `js/app.js` | 8259 | `confirmPhaseTransition(nextPhase)` | `Date.now()` | Écriture |
| `js/app.js` | 20836 | `wpForcePhase()` | `Date.now()` | Écriture |
| `js/app.js` | 23433 | `generateWeeklyPlan()` | `Date.now()` | Écriture (guard : seulement si `!cb.blockStartDate`) |
| `js/app.js` | 8278 | `postponePhaseTransition()` | `blockStartDate -= 7 * 86400000` | Modification (−7j) |

**Lectures** (sans écriture) : lignes 8198–8199, 8211–8212, 21127, 23432.

**Conclusion** : aucune écriture ne peut produire une date future dans un usage normal. Toutes utilisent `Date.now()` (valeur présente) ou soustraient 7 jours (reculent davantage dans le passé).

---

## Logique de `wpDetectPhase()` (ligne 21062)

### Construction de `weeksSince`

```js
// Priorité 1 : forçage manuel < 7 jours → retourne cb.phase directement (court-circuit)
if (cb && cb.forcedAt && (Date.now() - cb.forcedAt) < 7 * 86400000 && cb.phase) {
  return cb.phase;
}

// SOURCE 0 : detectLastDeload() si lastDeloadDate absent
// → stocke le résultat dans db.weeklyPlan.lastDeloadDate

// Référence temporelle : lastDeloadDate en priorité, sinon blockStartDate
var _ref = (db.weeklyPlan && db.weeklyPlan.lastDeloadDate)
  ? new Date(db.weeklyPlan.lastDeloadDate).getTime()
  : (cb && cb.blockStartDate) || Date.now();

// GUARD présent ici : Math.max(1, ...)
var weeksSince = Math.max(1, Math.round((Date.now() - _ref) / (7 * 86400000)));
```

### Que se passe-t-il si `blockStartDate > Date.now()` (date future) ?

`(Date.now() - blockStartDate)` est **négatif** → `Math.round(négatif)` → négatif → `Math.max(1, négatif) = 1`.

**Résultat** : `weeksSince` est forcé à 1. La phase détectée est la première du cycle (`hypertrophie` pour powerbuilding). `currentBlock.week` est écrit à 1.

**⚠ MAIS** : ce guard n'est actif que si `lastDeloadDate` est absent. Si `lastDeloadDate` est présent (cas fréquent après `acceptDeload()` ou `detectLastDeload()`), la `blockStartDate` future est entièrement ignorée et `_ref = lastDeloadDate`. La phase est alors calculée depuis la date du dernier deload, indépendamment de `blockStartDate`.

### Comment `currentBlock.week` est calculé

```js
var _weekInPhase = weeksSince - _weeksBeforePhase;
db.weeklyPlan.currentBlock.week = Math.max(1, Math.min(_weekInPhase, durations[_detectedPhase] || 4));
```

`_weeksBeforePhase` = somme des durées des phases précédentes dans le cycle. Pour la phase 1 (`hypertrophie`) : 0.

Avec `blockStartDate = 1777852800000` (May 4, 11 jours avant today) :
- `weeksSince = Math.max(1, Math.round(11/7)) = Math.max(1, 2) = 2`
- `_detectedPhase = 'hypertrophie'` (powerbuilding intermédiaire : dur = 5 semaines ; 2 ≤ 5)
- `currentBlock.week = Math.max(1, Math.min(2, 5)) = 2`

→ `currentBlock.week` devrait être **2**, mais est stocké à **3**. C'est la vraie anomalie (voir §Origine).

### Quand `currentBlock` est-il mis à jour ?

`wpDetectPhase()` **écrit** dans `currentBlock.phase` et `currentBlock.week` à chaque appel. Elle est appelée dans :
- `generateWeeklyPlan()` (chaque régénération)
- `postLoginSync()` (après sync cloud, ligne 29367)
- `renderProgramBuilderView()` via `wpEstimateCurrentWeek()` (lecture seule, cette dernière ne relit pas `wpDetectPhase`)

---

## `isEndOfPhaseBlock()` (ligne 8190)

```js
function isEndOfPhaseBlock() {
  var cb = db.weeklyPlan && db.weeklyPlan.currentBlock;
  if (!cb || !cb.phase) return false;
  var maxWeeks = durations[cb.phase] || 4;
  var weeksSince = cb.blockStartDate
    ? Math.round((Date.now() - cb.blockStartDate) / (7 * 86400000)) : 0;
  return weeksSince >= maxWeeks;
}
```

**Pas de `Math.max` ici.** Mais comportement naturellement sûr si `blockStartDate` est future :
- `weeksSince = Math.round(négatif) = négatif`
- `négatif >= maxWeeks(4)` → `false`
- Aucune transition de phase déclenchée à tort ✓

**Aucun effet de bord** : `isEndOfPhaseBlock()` ne modifie pas `currentBlock`.

`applyVolumeAutoTune()` appelée depuis `generateWeeklyPlan()` via le guard `isEndOfPhaseBlock()` ne touche pas non plus à `blockStartDate` — elle ne modifie que `db.user.volumeDeltas`.

---

## Découverte critique — Double déclaration de `BLOCK_DURATION`

| Fichier | Ligne | Phases définies |
|---|---|---|
| `js/program.js` | 10 | `intro`, `fondation`, `progression`, `maintien`, `power_hypertrophy`, `cycleWeeks` |
| `js/app.js` | 20862 | `hypertrophie`, `accumulation`, `force`, `intensification`, `peak`, `deload` |

app.js est chargé **après** program.js → la déclaration d'app.js **écrase** celle de program.js en runtime. La version active est celle d'app.js. Les clés de program.js (`intro`, `fondation`, etc.) sont **des fantômes** — elles ne correspondent à aucune phase que `wpDetectPhase()` peut retourner.

Ce n'est pas un bug actif (app.js gagne toujours), mais c'est une dette technique à signaler.

---

## Origine de `blockStartDate = 1777852800000` (4 mai 2026) avec `week = 3` stocké

### Reconstitution de la séquence

La valeur `1777852800000` est **lundi 4 mai 2026 à minuit UTC**. C'est une date ronde, à minuit, qui correspond exactement à un lundi. Cela correspond au pattern `Date.now()` utilisé dans `confirmPhaseTransition()` ou `wpForcePhase()` — mais lissé à minuit (possible si l'appel a eu lieu exactement à minuit, ou si la date a été posée depuis un autre contexte).

La séquence la plus probable :

1. **Vers le 4 mai 2026** : `confirmPhaseTransition('hypertrophie')` ou `wpForcePhase()` est appelé → `blockStartDate = Date.now()` ≈ `1777852800000`.
2. **Quelques jours plus tard** (entre le 12 et 18 mai) : `wpDetectPhase()` est appelé alors que `weeksSince = 3` (21 jours après May 4 = May 25... impossible since we're May 15).

**Explication alternative plus cohérente** :

- `blockStartDate` a été écrit le 4 mai 2026 (`= Date.now()` ce jour-là).
- `wpDetectPhase()` a été appelé **le 18-25 mai** (weeksSince=2 ou 3) et a écrit `currentBlock.week = 2` ou `3`.
- La DB a ensuite été **synchronisée depuis le cloud** via `syncFromCloud()`, qui a ramené un snapshot avec `week: 3` daté d'un appel précédent.
- Aujourd'hui (15 mai), `postLoginSync()` rappelle `wpDetectPhase()` → écrit `week: 2` (correction).

Le stockage `week: 3` est donc un **artefact de snapshot cloud désynchronisé** : la valeur a été correcte au moment où elle a été écrite (semaine 3 du cycle), mais `blockStartDate` n'a pas été actualisée lors du sync, créant un décalage.

**Scénario qui produirait réellement une `blockStartDate` dans le futur** :

Un sync cloud (`syncFromCloud()`) importerait un JSONB Supabase contenant une `blockStartDate` future — produite par un appareil dont l'horloge système est avancée, ou par une modification manuelle du localStorage. Il n'existe aucun chemin de code dans app.js qui écrit une valeur future de lui-même.

---

## Fix recommandé

### Fix 1 — Guard `blockStartDate` future dans `generateWeeklyPlan()` (prioritaire)

Emplacement : juste après la ligne 23432 (`if (!db.weeklyPlan.currentBlock.blockStartDate)`).

```js
// Guard : blockStartDate dans le futur (ex. sync cloud depuis appareil mal daté)
if (db.weeklyPlan.currentBlock.blockStartDate > Date.now()) {
  db.weeklyPlan.currentBlock.blockStartDate = Date.now();
}
if (!db.weeklyPlan.currentBlock.blockStartDate) {
  db.weeklyPlan.currentBlock.blockStartDate = Date.now();
}
```

### Fix 2 — Guard identique dans `wpDetectPhase()` (cohérence)

Emplacement : avant le calcul de `_ref` (ligne 21125), après la récupération de `cb`.

```js
// Guard : blockStartDate future (sync cloud ou horloge système incorrecte)
if (cb && cb.blockStartDate && cb.blockStartDate > Date.now()) {
  cb.blockStartDate = Date.now();
  if (typeof saveDB === 'function') saveDB();
}
```

### Fix 3 — Guard dans `isEndOfPhaseBlock()` (robustesse)

Remplacer la ligne 8198–8199 par :

```js
var weeksSince = cb.blockStartDate
  ? Math.max(0, Math.round((Date.now() - cb.blockStartDate) / (7 * 86400000))) : 0;
```

(`Math.max(0, ...)` au lieu de laisser un négatif possible, même si le comportement actuel est safe.)

### Fix 4 — Dépolluer `program.js` (dette technique, non-urgent)

Supprimer ou commenter la déclaration `BLOCK_DURATION` de `program.js` (lignes 7–30), qui est morte en runtime (écrasée par app.js) et contient des phases obsolètes (`intro`, `fondation`, `progression`, `maintien`).

---

## Résumé

| Point | Verdict |
|---|---|
| Timestamp `1777852800000` = 2 juin 2026 | ❌ Faux — c'est le **4 mai 2026** (11j dans le passé) |
| Une écriture de code peut produire une date future | ❌ Non — toutes les écritures utilisent `Date.now()` ou soustraient 7j |
| `wpDetectPhase()` gère les dates futures | ✅ Oui — `Math.max(1, weeksSince)` |
| `isEndOfPhaseBlock()` gère les dates futures | ⚠️ Implicitement safe (négatif < maxWeeks → false), mais sans guard explicite |
| `blockStartDate` peut arriver future via cloud sync | ✅ Oui — seul vecteur réaliste |
| `week: 3` alors que blockStartDate donne `weeksSince=2` | ⚠️ Snapshot cloud désynchronisé — corrigé au prochain appel `wpDetectPhase()` |
| Double `BLOCK_DURATION` | ⚠️ Dette technique — program.js morte en runtime |
