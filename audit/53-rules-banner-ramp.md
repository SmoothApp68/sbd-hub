# Règles 8/9 + Data-Gap Banner + Beginner Ramp — v210

## Source : validation Gemini — extensions de selectExercisesForProfile() v209

## Systèmes livrés

### RÈGLE 8 — Ratio Ischios/Quads (prévention LCA)

Détection : `_stats.legCurlE1RM / _stats.legExtE1RM < 0.75`.

Action : ajoute `Leg Curl Assis` correctif (3×12-15, RPE 8, rest 90s)
si aucun exercice Nordic/Leg Curl n'est déjà présent. Tagging :
`isCorrectivePriority: true`, `evictionCategory: 'corrective'`,
`_addedByRule: 8`, note "Correctif ratio Ischios/Quads < 0.75 — prévention LCA".

`buildProfileForSelection()` lit `db.exercises['Leg Curl Assis']` (ou
`'Leg Curl'`, `'Leg Curl allongé'`) et `db.exercises['Leg Extension']`
pour alimenter `_prStats.legCurlE1RM` et `_prStats.legExtE1RM`.

---

### RÈGLE 9 — Face Pull / Bench (rotateurs externes)

Détection : somme des séries des Bench Press marqués `isPrimary` ≥ 3.

Action : 1 série Face Pull (15-20 reps, RPE 7, rest 60s) ajoutée par
tranche de 3 séries de Bench, si aucun Face Pull n'est déjà présent.
Tagging : `evictionCategory: 'secondary'`, `_addedByRule: 9`, note
"Stabilité rotateurs — 1 série par 3 séries de Bench".

---

### Helper — `showDataGapBanner()`

Lit `db.user.onboardingDate`. Si `Date.now() - onboardingDate ≤ 7j`
→ retourne un HTML inline (string) :

> 🧠 **Semaine 1** — Phase d'apprentissage de l'algorithme. Tes charges
> s'affineront dès la semaine prochaine.

Sinon → string vide. À injecter dans la home tab pendant la 1ère
semaine post-onboarding.

---

### Helper — `getBeginnerRampIncrement(exoName, sessionCount)`

Pour les débutants pendant leurs 3 premières séances :
- `sessionCount >= 3` → `null` (retour à LP standard)
- `sessionCount < 3` → `getDPIncrement(exoName, 0) * 2`

Permet de calibrer rapidement la vraie limite avant que la progression
LP standard prenne le relais.

---

## Tests : 8 invariants Playwright

| Test | Vérifie |
|---|---|
| RULE8-01 | legCurl/legExt = 0.50 → Leg Curl correctif ajouté |
| RULE8-02 | legCurl/legExt = 0.80 → aucun ajout par règle 8 |
| RULE9-01 | Bench primary 5 sets → Face Pull (≥1 set) ajouté |
| RULE9-02 | Pas de Bench primary → aucun Face Pull par règle 9 |
| BANNER-01 | onboardingDate -3j → bandeau Semaine 1 rendu |
| BANNER-02 | onboardingDate -30j → string vide |
| RAMP-01 | sessionCount=1 → increment doublé |
| RAMP-02 | sessionCount=3 → null (LP standard) |

> Tests Playwright : `tests/audit-rules-banner-ramp-v210.spec.js` (8 tests).

## SW v209 → v210
