# Ajuster ma séance + Slider RPE + Warning charge — v203

## Source : validation Gemini UX complète

## Features livrées

### FEATURE 1 — "Ajuster ma séance" (remplace "Modifier les exercices")

#### 1A — Bouton renommé
`renderProgramTab()` footer : "Modifier les exercices" → **"Ajuster ma séance"** ; onclick → `openAdjustSession()` (au lieu de `pbEditExisting()`).

#### 1B — Vue tabs par jour
`openAdjustSession()` crée un overlay modal avec :
- Tabs jours d'entraînement (≤ 3 chars + uppercase, ex. "LUN")
- Pour chaque exercice : nom + ligne `N×reps @ poidskg`
- Bouton ✏️ Changer (exo non-protégé) OU 🔒 Principal/Correctif (isPrimary/isCorrectivePriority)

#### 1C — Alternatives
Table `EXERCISE_ALTERNATIVES` (13 exercices × 3 alternatives Gemini-validées) :
- Presse à Cuisses → Hack Squat / Belt Squat / Sissy Squat Machine
- Leg Extension → Sissy Squat Machine / Presse Bulgare / Leg Press Unilat.
- Rowing Poulie → Rowing Haltère / Rowing Barre / Tirage Horizontal Câble
- Dips → Extension Triceps Corde / Pushdown Barre / Dips Machine
- + 9 autres mappings (Bench, Leg Curl, Élévations, Face Pull, etc.)

#### 1D — Persistance Option C (Gemini Q4)
Après sélection d'une alternative, pop-up "Appliquer ce changement pour..." :
- **Cette séance uniquement** (dépannage ponctuel) → modifie `db.weeklyPlan.days[?]` du jour concerné
- **Tout le cycle actuel** (mémorisation préférence) → modifie tous les jours + écrit dans `db.exercisePreferences[oldExo] = { replacement, changedAt, count }`

#### 1E — Warning isPrimary (clic sur 🔒)
Modal avec 3 raisons + réponses Coach :
- 🏋️ **Équipement indisponible** → ouvre les alternatives normalement (variante proche, aujourd'hui seulement)
- 🩹 **Blessure / Douleur** → toast "Coach adapte ta prochaine séance" + `db.user.injuries.push(exoName)`
- 🔄 **Envie de changement** → toast contextuel "Semaine X/Y — termine le bloc pour valider tes gains avant de changer de pilier" (lecture `BLOCK_DURATION[mode][level][phase]`)

---

### FEATURE 2 — Slider RPE "Effort ressenti"

`_goRpeSliderHTML(setIdx, exoIdx, currentRpe)` :
- `<input type="range" min="1" max="10" step="0.5">`
- Label adaptatif : `vocabLevel ≥ 3` → "RPE", sinon "Effort ressenti"
- Légende dynamique en-dessous : `_RPE_LEGENDS[Math.round(val)]` (😴 Très facile → 🔥 Échec total)

`goUpdateRpe(exoIdx, setIdx, val)` :
- Update affichage val + légende
- Sync vers `activeWorkout.exercises[exoIdx].sets[setIdx].rpe`
- Sync vers l'input number du tableau (cohérence)
- `goAutoSave()` automatique

Intégration : injecté comme `<tr class="go-rpe-slider-row"><td colspan="N">` sous chaque série de travail **non complétée** (warmup ignoré, types `weight`/`reps` uniquement).

---

### FEATURE 3 — Warning orange si charge > 15% du plan

**Stockage** : à l'init de `activeWorkout` depuis `weeklyPlan`, copie `ps.weight → set.plannedWeight` (référence figée, non modifiable par l'utilisateur).

**Détection** : dans `goToggleSetComplete()` (avant les autres traitements), au moment où `set.completed = true` :
```js
var _dev = Math.abs(_actualW - _plannedW) / _plannedW;
if (_dev > 0.15) {
  showToast('🟠 Charge ±X% vs plan (Ykg). L\'algo recalcule ton 1RM estimé.', 4000);
  set.flags.push('high_variance');
}
```

**Non-bloquant** : toast informatif seulement, la série est validée normalement. Le flag `high_variance` permet le traitement downstream (Coach peut prendre en compte la dérive pour le calcul e1RM).

Warmups ignorés (`set.type !== 'warmup'`). Try/catch défensif.

---

## Tests : 25/25 invariants statiques OK

| Test | Description | Status |
|---|---|---|
| ADJUST-01 | openAdjustSession() → overlay #adjustSessionOverlay | ✅ |
| ADJUST-02 | isPrimary → 🔒 (pas ✏️) | ✅ |
| ADJUST-03 | isCorrectivePriority → 🔒 | ✅ |
| ADJUST-04 | Presse → 3 alts dont Hack Squat | ✅ |
| ADJUST-05 | _adjustConfirm permanent=true → exercisePreferences | ✅ |
| ADJUST-06 | _adjustConfirm permanent=false → 1 seul jour | ✅ |
| RPE-01 | Slider + _RPE_LEGENDS dynamiques | ✅ |
| CHARGE-01 | Charge +21% → toast + flag high_variance | ✅ |

> Tests Playwright `tests/audit-adjust-rpe-warning-v203.spec.js` (8 tests).
> Validation finale via 25 invariants Node.js statiques.

## SW v202 → v203
