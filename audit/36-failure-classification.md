# Détection Échec + Classification Fatigue — v186

## Architecture

Trois étages dans `goCheckAutoRegulation` :
1. **Règle 0** (Drop volontaire) : charge baisse > 10% → ignore (mark `isDropSet`).
2. **classifyFatigue()** : fonction autonome, inférence bayésienne sans FC ni RPE.
3. **Règle 7** : intégration de classifyFatigue + fallback objectif (compat v185).

## Précisions Gemini validées

| Scénario | Classification | Confidence |
|---|---|---|
| Aurélien Squat, ACWR 1.34, -2 reps S2 | neural | 0.85 |
| Débutant Bench, -2 reps progressif | muscular | 0.60 |
| Dead J1 -3 reps, ACWR 1.45, SRS 42 | neural critique | 0.90 |
| 100/5 → 100/3 sans contexte | (fallback) warning | — |
| 100/5 → 90/3 (épuisement) | (fallback) danger + strike | — |

## Seuils UX

| Confidence | UX |
|---|---|
| < 0.60 (sans signal fort) | silence |
| 0.60 — 0.79 | pastille colorée + warning |
| ≥ 0.80 (neural) | message Coach danger + strike LP |

**Signaux objectifs forts** (bypassent le filtre confidence) :
- `_isExhaustion` : charge ↓ ET reps ↓ → danger + strike + blockAPREIncrease
- `_isCriticalFail` : -3 reps ou plus → danger + strike + blockAPREIncrease
- `_isImplicitFail` sans RPE noté : warning fallback (compat v185)

## Détails par fix

### FIX 1 — Règle 0 Drop volontaire vs Échec
Drop intentionnel = charge -10%+. Détecté → `set.isDropSet = true`, `setType = 'dropset'`, return null.
Pseudo-drop (charge -5% + reps chutent) = échec déguisé → continue vers Règle 7.

### FIX 2 — classifyFatigue() bayésienne
Inputs : `setIndex`, `repDrop`, `srsScore`, `acwr`, `level`.

Output : `{ type, confidence, signals }`.

Branches :
- **Overload** : `setIndex===0 && repDrop>=3` → conf 0.90
- **Neural (early)** : `setIndex<=1 && repDrop>=2 && (srsLow OR acwrHigh)` → conf 0.75 ou 0.90 (les deux)
- **Avancé override** : `level=avance && repDrop>=2 && acwrHigh` → neural conf 0.80
- **Muscular (late)** : `setIndex>1 && repDrop>=1 && !srsLow` → conf 0.60 (débutant) ou 0.70

### FIX 3 — Règle 7 enhanced
Filtre les drop sets + warmups, calcule SRS/ACWR/level/setIndex, appelle classifyFatigue, enrichit `set.fatigueType/Confidence/Signals`.

Logique de message :
1. Si neural conf ≥ 0.80 → danger + strike (+ msg phase peak distinct)
2. Si overload → danger
3. Si muscular → warning (msg positif en hypertrophie)
4. Sinon si critical/exhaustion → danger + strike (fallback objectif)
5. Sinon → warning fallback (échec implicite sans RPE)

`blockAPREIncrease = neural || _isCriticalFail || _isExhaustion`.

### FIX 4 — Enrichissement set au moment de validation
Dans `goToggleSetComplete`, après `set.completed = true` :
- `set.setIndex` : position parmi work sets (0-based)
- `set.isTopSet` : true si première work set
- `set.targetReps` : reps cible du plan ou fallback `set.reps`
- `set.fatigueType` : null par défaut

### FIX 5 — Visual fatigue labels
- `getSetStyle` : pastille rouge (neural ≥0.60) ou orange (muscular ≥0.60)
- `getSetLabel` : 🔴 SNC / 🟠 Muscu / ⚠️ Surcharge

### FIX 6 — Fatigue report dans saveAlgoDebrief
Construit `session.fatigueReport[]` par exo (compte neural/muscular).
Tip Coach : « 🧠 X série(s) avec fatigue nerveuse → récupération prioritaire » ou « 💪 X séries avec fatigue musculaire → stimulus hypertrophique solide ».

## Tests Playwright (12/12)

| ID | Description | Résultat |
|---|---|---|
| DROP-01 | charge -10%+ → isVoluntaryDrop=true, silence | ✅ |
| DROP-02 | charge -5% + reps chutent → pas un drop, signal danger | ✅ |
| DROP-03 | charge stable + -2 reps → warning échec implicite | ✅ |
| CLASS-01 | setIndex=0, repDrop=3 → overload conf=0.90 | ✅ |
| CLASS-02 | setIndex=1, repDrop=2, SRS=42, ACWR=1.45 → neural conf=0.90 | ✅ |
| CLASS-03 | setIndex=3, repDrop=1, SRS=65 → muscular conf=0.70 | ✅ |
| CLASS-04 | débutant, setIndex=2, repDrop=2 → muscular conf=0.60 | ✅ |
| CLASS-05 | avancé, ACWR=1.4, repDrop=2 → neural conf=0.80 | ✅ |
| UX-01 | low conf + RPE noté → silence | ✅ |
| UX-02 | conf=0.75 neural → warning + fatigueType | ✅ |
| UX-03 | conf=0.90 neural → danger + blockAPREIncrease | ✅ |
| UX-04 | muscular + hypertrophie → "c'est ici que tu progresses" | ✅ |

## Régression v185 : 12/12

Aucune régression sur la suite v185. Les FIX6b/c originaux (danger + strike sur -3 reps / épuisement) sont préservés via le fallback objectif.

## Service Worker

`trainhub-v185` → `trainhub-v186`
