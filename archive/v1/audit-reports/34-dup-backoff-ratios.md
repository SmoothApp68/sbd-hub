# v184 — DUP universel + Back-off + Ratios + Léa fix

**Date** : 2026-05-10
**Branche** : `claude/audit-ble-watch-app-7O2cs`
**Source** : validation Gemini sur 5 profils universels

---

## 5 fixes

| # | Fix | Localisation |
|---|---|---|
| 1 | DUP_SEQUENCE par mode × niveau + getDUPKey | `app.js:16856` + `:18694` |
| 2 | Back-off calibré par niveau | `engine.js:2106` |
| 3 | Ratios antagonistes DL/Sq + OHP/Bench + Pull/Push (volume) | `engine.js:analyzeAthleteProfile` |
| 4 | C_cycle découplé : volume (sets) au lieu de charge | `app.js:wpComputeWorkWeight` + `wpGeneratePowerbuildingDay` |
| 5 | ACWR > 1.3 → Squat remplacé par Leg Press (powerbuilding) | `app.js:generateProgram` |

---

## Profils validés

| Profil | DUP séquence | Back-off | Ratios | Notes |
|---|---|---|---|---|
| Aurélien (PB avancé 5j) | `force/volume/force/volume/vitesse` | RPE > 9 → -15% +2 reps | Sq/Bench, DL/Sq, OHP/Bench actifs | — |
| Débutant J1 | `volume/volume/volume` | INTERDIT (jamais) | — | LP pure |
| Léa (muscu lutéale + cut) | `volume/force/volume/force` | RPE > 8.5 → -10% | — | C_cycle 0.88 → sets, weightCut → charge |
| D'Jo (PL avancé 5j) | `force/vitesse/force/vitesse/force` | RPE > 9 | — | aucun bloc volume |
| Hybride CrossFit (ACWR > 1.3 + activité) | profil volume RPE forcé `[6,7]` | RPE > 8.5 | Pull/Push (volume) | — |

---

## Fix 1 — DUP_SEQUENCE par mode × niveau

```js
DUP_SEQUENCE = {
  debutant:                    { 2..5: ['volume',...] },
  bien_etre:                   { 2..5: ['vitesse','volume',...] },
  musculation:                 { 2..5: ['volume','force',...] },
  powerbuilding_intermediaire: { 2..5: ['force','volume',...] },
  powerbuilding_avance:        { 2..5: ['force','volume','force','volume','vitesse'] },
  powerlifting:                { 2..6: ['force','vitesse',...] }
};
function getDUPKey(mode, level) { ... }
```

Hybride CrossFit : si `ACWR > 1.3` ET `activityTemplate` non vide ET DUP courant = volume → forcer `rpe = [6, 7]`.

## Fix 2 — Back-off calibré

| Niveau | Seuil RPE | Réduction | Reps |
|---|---|---|---|
| Débutant | — | jamais (return null) | — |
| Intermédiaire | RPE > 8.5 | -10% | base (pas d'extra) |
| Avancé | RPE > 9.0 | -15% | +2 reps |

Phase Peak/Deload → toujours null (intensité pure ou repos).

## Fix 3 — Ratios antagonistes additionnels

Ajoutés dans `analyzeAthleteProfile` :
- **DL/Sq < 1.10** → "chaîne postérieure en retard, +1 session ischios/dos"
- **OHP/Bench < 0.60** → "déséquilibre épaules/pecs, remplacer 1 séance Bench par OHP"
- **Pull/Push (volume hebdo) < 1.0** → "tu pousses plus que tu ne tires, doubler le volume rowing/face pull"

Exclu débutants pour DL/Sq.

## Fix 4 — Léa : C_cycle volume vs weightCut charge

**Avant** : C_cycle (0.88 lutéale) × weightCut (-5%) = `75 × 0.88 × 0.95 = 62.7 kg` → stimulus écrasé.

**Après** :
- **Charge** : `75 × 0.95 = 71.3 kg` (weightCut uniquement)
- **Volume** : `4 × 0.88 = 3.52 → floor = 3 séries` (cycle uniquement)

Stimulus neuromusculaire préservé, récupération adaptée à la phase hormonale.

## Fix 5 — ACWR-based exercise swap

`isPB && ACWR > 1.3` →
- `pbBlocks.sq_hyp` : Squat → Leg Press / RDL / Hip Thrust
- `pbBlocks.sq2_spec`, `pbBlocks.sq2_hyp` : variantes Leg Press uniquement
- Note Coach : `"ACWR X.XX > 1.3 — Squat remplacé par Leg Press (charge axiale réduite)"`

---

## Tests Playwright — 16/16

| Suite | Résultat |
|---|---|
| DUP-01 à DUP-05 — séquences mode×level | ✅ 5/5 |
| BO-01 à BO-04 — back-off level-aware | ✅ 4/4 |
| RATIO-01 à RATIO-03 — antagonist alerts | ✅ 3/3 |
| LEA-01 à LEA-03 — C_cycle découplé | ✅ 3/3 |
| ACWR-01 — fatigue-based exercise swap | ✅ 1/1 |

**Total : 16/16 — 100%**

---

## 5 commits

1. `feat(algo): DUP_SEQUENCE by mode×level — Gemini validated sequences`
2. `fix(algo): back-off sets calibrated by level — debutant=never, avance=RPE>9`
3. `feat(coach): antagonist ratios — DL/Sq + OHP/Bench + Pull/Push alerts`
4. `fix(algo): decouple C_cycle (volume) from weightCut (charge) — Gemini recommendation`
5. `feat(algo): fatigue-based exercise selection — Squat→LegPress if ACWR>1.3`

## Build

- `SW_VERSION` : `trainhub-v183` → `trainhub-v184`
- `service-worker.js` : `CACHE_NAME = 'trainhub-v184'`
- `js/app.min.js` : régénéré (terser 5.47.1, 821 KB)
- `js/engine.min.js` : régénéré (111 KB)
