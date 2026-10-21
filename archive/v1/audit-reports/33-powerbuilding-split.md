# Fix Split Powerbuilding — v182 → v183

**Date** : 2026-05-10
**Branche** : `claude/audit-ble-watch-app-7O2cs`
**Source** : audit Claude Code + consensus Gemini

---

## Diagnostic

| Problème | Cause |
|---|---|
| `isPL` binaire exclut le powerbuilding | `const isPL = goal === 'force' \|\| goal === 'recompo'` (ligne 1960) — `trainingMode='powerbuilding'` ignoré |
| Squat en J5 (Samedi) au lieu de J1 | `ppl_ul` = `[Push, Pull, Legs, Upper, Lower]` — Squat dans Lower (jour 5, post-fatigue) |
| Bench haltères en J1 Push | bloc `B.masse.push` commence par `bench_halt` au lieu de `bench` (barre) |
| Ratio Squat/Bench non intégré | déséquilibre détecté par Coach mais pas par `generateProgram` |

---

## Avant
- `trainingMode='powerbuilding'` → split `ppl_ul` bodybuilder
- Lundi : Push (bench haltères) — Mardi : Pull — Jeudi : Legs — Vendredi : Upper — **Samedi : Lower (Squat)**

## Après
- `trainingMode='powerbuilding'` → split `powerbuilding_5`
- **Lundi : Squat barre — Mardi : Bench barre — Jeudi : Deadlift** — Vendredi : Bench2 — Samedi : Squat 2
- J5 adaptatif selon ratio Squat/Bench

---

## Aurélien — ratio 1.06 < 1.20

→ **Spécialisation Quad activée** (J5)

```
Lundi    → Squat — Force & Volume
           [squat, leg_press, rdl, leg_curl, mollet]

Mardi    → Bench — Force & Volume
           [bench, incline_bench, ecarte, tri_cable, elev_lat]

Jeudi    → Deadlift — Force & Volume
           [deadlift, row_barre, lat_pull, face_pull, curl_barre]

Vendredi → Bench 2 — Volume & Accessoires
           [bench_halt, ohp, elev_lat, tri_cable, curl_halt]

Samedi   → Spécialisation Quad — Rattrapage  ← ratio 1.06 < 1.20
           [squat, leg_press, leg_ext, hip_thrust, mollet]
```

`db.weeklyPlan.coachNotes` → `["Spécialisation Squat activée (ratio 1.06 < 1.20)"]`
`plan._ratioNote` → idem

---

## 4 Commits

1. `refactor(algo): 3-way split routing — powerlifting/powerbuilding/bodybuilding`
2. `feat(algo): powerbuilding blocks — compound first, hypertrophy accessories`
3. `feat(algo): inject squat/bench ratio — squat specialization if ratio < 1.20`
4. `feat(algo): audit trail — ratio-based split decision logged in weeklyPlan`

---

## Tests Playwright — 12/12

| Test | Résultat |
|---|---|
| PB-01 trainingMode='powerbuilding' → routage powerbuilding | ✅ |
| PB-02 5j powerbuilding → séquence powerbuilding_5 | ✅ |
| PB-03 5j powerlifting → powerlifting_5 (inchangé) | ✅ |
| PB-04 5j bodybuilding → ppl_ul (inchangé) | ✅ |
| PB-05 J1 commence par squat (barre) | ✅ |
| PB-06 J2 commence par bench (barre) | ✅ |
| PB-07 ratio 1.06 < 1.20 + avancé → J5 spécialisation quad | ✅ |
| PB-08 ratio 1.43 > 1.20 → J5 standard (pas spec) | ✅ |
| PB-09 ratio < 1.20 + powerlifting → pas de spec (PL inchangé) | ✅ |
| PB-10 4j powerbuilding → powerbuilding_4 | ✅ |
| PB-11 6j powerbuilding → powerbuilding_6 (J6=Pull) | ✅ |
| PB-12 audit trail → ratio mentionné dans note | ✅ |

**Total : 12/12 — 100%**

---

## Routage 3-way

| `g1` | `trainingMode` | Catégorie | Split 5j |
|---|---|---|---|
| `force` | * | PL | `powerlifting_5` |
| `masse` | `powerbuilding` | PB | `powerbuilding_5` |
| `mixte` | * | PB | `powerbuilding_5` |
| `masse` | `musculation` | BB | `ppl_ul` |
| `recompo` | * | BB | `ppl_ul` (recompo n'est plus considéré PL) |

> Note : la condition `goal === 'recompo'` était en fait incohérente avec le branding (`recompo` = recomposition corporelle, pas force pure). v183 retire cet abus.

---

## Build

- `SW_VERSION` : `trainhub-v182` → `trainhub-v183`
- `js/app.min.js` : régénéré avec terser 5.47.1 (819 KB)
- `service-worker.js` : `CACHE_NAME` `trainhub-v183`
