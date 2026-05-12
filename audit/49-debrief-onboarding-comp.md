# Feedback post-séance + Onboarding + Compétition — v206

## Source : spec finale Gemini — valeurs exactes validées

## Features livrées

### FEATURE 1 — Feedback post-séance (Bottom Sheet)

`saveAlgoDebrief()` réécrit complètement. Branche selon `vocabLevel ≥ 3` :

**Mode Expert (vocabLevel ≥ 3)** — 3 lignes :
1. 💪 `Tonnage X kg (+/-N% vs séance précédente)`
2. 📊 `Estimation Force : X kg au [exo] (+delta kg)`
3. 🟢 / 🟠 `SNC : Optimal / Récupération requise — priorise le sommeil ce soir`

**Mode Débutant (vocabLevel < 3)** :
1. 🏆 `Nouveau record : X kg au [exo]` OU ✅ `Séance complétée`
2. 🔥 `Nème séance cette semaine` (si streak ≥ 2)
3. 💬 Encouragement aléatoire (10 textes Gemini-validés)

**Toutes versions** :
- 📅 `Prochaine : [Jour] — [Titre]` (lecture `db.weeklyPlan`)
- Bouton Continuer 👋
- Auto-fermeture 15s

**Détection SNC** : `fatigueType === 'neural' && fatigueConfidence ≥ 0.75`.

**`_showDebriefSheet(lines)`** : Bottom sheet iOS, handle visuel,
`align-items: flex-end`.

**`_getNextSessionTitle()`** : scan `db.weeklyPlan.days` à partir du
lendemain, ignore les jours rest.

---

### FEATURE 2 — Onboarding completion + nudge mensuel

**`showOnboardingComplete()`** : modal centrée 🎉 avec :
- Aperçu première séance (titre + 3 premiers exercices)
- Nudge orange si pas de PR Squat ("Renseigne tes PRs")
- Bouton primaire "Voir mon programme →" (`showTab('tab-seances')`)
- Bouton secondaire "Lancer maintenant 💪" (`goStartWorkout(true)`)

**Wiring** : à la fin de `pbGenerateProgram()`, flag `_isFirstProgram = !db.user.onboarded`
capturé avant `saveDBNow()`. Si vrai → `onboarded=true` + 800ms delay → modal.
Inhérité par `pbGenerateFromSettings()` (qui appelle `pbGenerateProgram()`).

**Nudge mensuel compDate** dans TOP 3 ALERTES :
- `trainingMode === 'powerlifting' && !programParams.compDate && _daysSinceNudge >= 30`
- Texte : "🏆 Compétition prévue ? Renseigne une date…"
- `db._lastCompDateNudge = Date.now()` à chaque affichage
- `openCompDateSettings()` stub → `showTab('tab-seances')`

---

### FEATURE 3 — Programme compétition 12 semaines

**`generateCompPeakingPlan(compDate)`** retourne null si pas de date ou
compDate passée. Schedule Gemini-validé :

| Phase | Durée | Phase macrocycle |
|---|---|---|
| Accumulation | 4 sem | hypertrophie |
| Intensification | 4 sem | intensification |
| Peak | 2 sem | peak |
| Taper | 1 sem | peak |
| Récupération (Comp Week) | 1 sem | deload |

Schedule construit en remontant depuis `compDate` (15 sem total).
Phase courante détectée par `today ∈ [startDate, endDate]`.

**Adaptation blessure épaule** (`hasShoulderInjury()` + `_getCurrentShoulderPain()`) :

| Phase | Bench |
|---|---|
| hypertrophie | Floor Press, RPE 6 max — "Bench supprimé en Accumulation" |
| intensification | Bench si pain < 2/5, sinon Floor Press RPE 7 |
| peak | 1-2 singles uniquement — "valider le total" |

**Barre de Sauvetage** : `60% PR Bench` arrondi 2.5kg.

**Alertes readiness** (≤ J-14) :
- J-3 ou moins : "⚡ J-N : Activation 50-60%. Squat + Dead. **ZÉRO Bench**."
- J-14 à J-4 : "🎯 J-N : Valide tes [safetyBar] kg au Bench"
- Sinon ouverture Squat à 88% PR

**`wpDetectPhase()`** : check compDate en priorité 0 (avant bien_etre).
Si phase comp détectée → met à jour `currentBlock.phase + _compLabel` + retourne.

**Affichage `renderCoachTodayHTML()` section 1d** :
- `readinessAlert` → `coach-alert--warning`
- `benchAdaptation.note` → `coach-alert--info` préfixé 🩹

---

## Tests : 27/27 invariants statiques

| Groupe | Tests | Status |
|---|---|---|
| DEBRIEF-01..10 | Expert vs Débutant, SNC, sheet 15s, next session | ✅ |
| ONBOARD-01..07 | Modal, first-program flag, nudge, openCompDateSettings | ✅ |
| COMP-01..10 | 5 phases, shoulder adaptation, safety bar, alerts, wiring | ✅ |

> Tests Playwright : `tests/audit-debrief-onboarding-comp-v206.spec.js` (8 tests).
> Validation finale via 27 invariants Node.js statiques.

## SW v205 → v206
