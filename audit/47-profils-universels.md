# Adaptations profils universels — v204

## Source : validation Gemini — filtre universel prod

## Systèmes livrés

### SYSTÈME 1 — isShoulderHeavy (blessure épaule auto-replace)

`SHOULDER_HEAVY_EXOS` : Bench (Barre), Développé Militaire, OHP, Dips,
Larsen Press, Développé Incliné (Haltères).

`SHOULDER_HEAVY_ALTERNATIVES` (Gemini-validé) :
- Bench Press (Barre) → **Floor Press**
- Développé Militaire / OHP → **Élévations Latérales Machine**
- Dips → **Extension Triceps Corde**
- Larsen Press → **DB Press paumes face à face**
- Développé Incliné (Haltères) → **Machine Convergente**

`hasShoulderInjury()` : lit `db.user.injuries[*].zone` actives, match
`/epaule|shoulder|épaule/i`.

`applyShoulderFilter(exercises)` : map les exercices, conserve `_originalName`
+ `_injuryAdapted: true` + note Coach `🩹 Adapté blessure épaule`.

**Intégration** : appelé avant les deux `return` de `wpGeneratePowerbuildingDay()`
(chemin principal ligne ~20227 et chemin alternatif ligne ~20469), après
supersets si présents.

---

### SYSTÈME 2 — Incréments proportionnels (getDPIncrement v2)

Nouvelle signature `getDPIncrement(exoName, currentWeight)`. Le caller dans
`wpDoubleProgressionWeight` passe `lastWeight`.

Logique : `pct2 = currentWeight × 0.02`, puis `Math.max(floor, wpRound25(pct2))` :

| Catégorie | Floor | Exemple à 100kg | Exemple à 25kg |
|---|---|---|---|
| Compound lower (Squat, Presse) | 5.0kg | 5.0 (vs 2.0) | 5.0 |
| Compound upper (Rowing, DB Press) | 2.5kg | 2.5 | 2.5 |
| Isolation upper (Curl, Élévations) | 1.0kg | 2.0 | 1.0 |
| Isolation lower (Leg Ext, Leg Curl) | 2.5kg | 2.5 | 2.5 |
| Core / Abdos | 0 (reps) | 0 | 0 |

Fallback sur l'ancienne logique kg fixes si `currentWeight` absent.

**Bénéfice profils légers** : Léa à 15kg sur Curl → +1kg (vs +1kg fixe avant,
mais désormais cohérent avec progression non-binaire).

---

### SYSTÈME 3 — LP Pure pour débutants

Dans `wpDoubleProgressionWeight()`, court-circuit avant le wave loading :

```js
if (_isMainLift && _level === 'debutant' && _lpActive) {
  if (allSetsComplete) return { weight: +2.5, coachNote: '✅ +2.5kg — continue comme ça !' };
  return { weight: maintenir, coachNote: 'Valide toutes les séries avant de monter le poids.' };
}
```

Pas de strikes, pas de deload local. Premiers mois sans complexité.
Transition naturelle vers wave loading quand l'user passe `intermediaire`
(ou que `lpActive` bascule à `false` via les 3-strikes existants).

---

### SYSTÈME 4 — Alerte "Plateau de Saisie"

`detectSaisiePlateau()` : lit les 3 dernières séances avec `volume > 0`,
calcule `maxDev = max(|v − avg| / avg)`. Si `maxDev < 0.02` (variation < 2%)
→ user en pilote automatique.

Injecté dans le bloc TOP 3 ALERTES (`coach-alert--warning`) de
`renderCoachTodayHTML()`, juste avant le wildcard Mode Instinct :

> 🔄 3 séances identiques détectées — tu sembles en pilote automatique.
> On change un exercice pour relancer la progression ?

---

## Tests : 24/24 invariants statiques

| Test | Description | Status |
|---|---|---|
| SHOULDER-01..04 | Constantes + fonctions | ✅ |
| SHOULDER-05..08 | 4 mappings critiques | ✅ |
| SHOULDER-09..10 | Filter appelé avant les 2 returns | ✅ |
| INCR-01..05 | Signature + 2% + planchers | ✅ |
| LP-01..05 | Branch debutant + messages | ✅ |
| CHURN-01..04 | Detect + seuil 2% + alerte | ✅ |

> Tests Playwright : `tests/audit-profils-universels-v204.spec.js` (8 tests).
> Validation finale via 24 invariants Node.js statiques.

## SW v203 → v204
