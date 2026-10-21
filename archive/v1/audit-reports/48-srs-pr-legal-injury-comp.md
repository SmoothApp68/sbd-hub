# SRS adaptatif + e1RM auto + Légal + Alerte blessure + e1RM display — v205

## Source : validation Gemini finale — valeurs exactes

## Systèmes livrés

### SYSTÈME 1 — SRS Adaptatif (baseline personnelle + cycle menstruel)

**`computeAdaptiveSRSThreshold()`** :
- < 10 sessions readiness → `mode='fixed'`, `threshold=45` (conservateur)
- 10-30 sessions → `mode='provisional'`, baseline provisoire glissante
- ≥ 30 sessions → `mode='stable'`, `threshold = mean - 1.5σ`
- Minimum absolu : 30 (jamais inférieur)

**`getCyclePhaseModifier()`** — Gemini valeurs exactes :
| Phase du cycle | Jours | Modificateur |
|---|---|---|
| Folliculaire | J1-J11 | +0 (force normale) |
| Ovulation | J12-J14 | -5 (tolérance plus haute) |
| Lutéale | J15-J24 | +5 (baisse récupération) |
| Pré-menstruelle | J25-fin | **+10** (récupération au plus bas) |

**`getEffectiveSRS(rawScore)`** : `rawScore + getCyclePhaseModifier()`

**`shouldDeload()`** patché : utilise `_srsThresholdToUse` (adaptatif vs fixe selon mode)
et compare `getEffectiveSRS(_normalized)` pour le critère 1.

---

### SYSTÈME 2 — Détection auto PR (Brzycki ≤ 8 reps)

**`calcBrzycki(weight, reps)`** : `null` si `reps > 8` (limite fiabilité Gemini).

**`detectNewPR(exoName, weight, reps)`** — SBD uniquement :
- `e1RM > currentPR × 1.05` → `showPRConfirmation()` modale (500ms délai)
- `e1RM > currentPR` mais `< +5%` → mise à jour silencieuse `db.bestPR`
- Reps > 8 → `calcBrzycki` retourne `null`, pas de détection

**`showPRConfirmation(prData)`** : modale avec charge, reps, e1RM estimé, bouton "Valider" + "Erreur".

**`confirmNewPR(liftKey, e1rm)`** : persiste dans `db.bestPR`, toast 4s.

**Intégration** : appelé dans `goToggleSetComplete()` après le bloc PR Type A existant,
uniquement sur les séries non-warmup.

---

### SYSTÈME 3 — Alerte blessure persistante (D'Jo pattern)

**`checkInjuryPersistence()`** : filtre `injuries` actives, `level ≥ 2`,
`since ≥ 14 jours`, non `rehabMode`, non `medicallyCleared`.

**Alerte rendue** dans `renderCoachTodayHTML()` (section 1c) : carte rouge
avec deux boutons :
- **"Adapter mon programme"** → `activateRehabMode(zone)` : `inj.rehabMode = true` + `renderProgramTab()`
- **"J'ai vu un médecin"** → `acknowledgeInjury(zone)` : `inj.medicallyCleared = true` + timestamp

Message exact Gemini : "ne montre pas de signe d'amélioration depuis 2 semaines.
Continuer risque de transformer une gêne en déchirure."

---

### SYSTÈME 4 — Consentement légal onboarding (RGPD France)

**`renderConsentStep()`** : HTML avec 2 cases **DÉCOCHÉES par défaut** :
1. Aptitude à l'effort physique intense
2. Traitement données d'entraînement (lien Politique de Confidentialité)

**`validateConsent()`** : vérifie les 2 cases → toast erreur si non cochées.
Si valides → `consentHealth + medicalConsent = true` + `saveDB()` → `nextOnboardingStep()`.

**`nextOnboardingStep()`** : ferme l'overlay `ob-consent-overlay` → appelle `_obGenerateProgramCore()`.

**Gate `obGenerateProgram()`** : si `!consentHealth || !medicalConsent` et pas déjà montré
(`_obConsentShown=false`) → inject overlay `ob-consent-overlay` modal. Sinon → génération directe.

**`_obGenerateProgramCore()`** : corps de l'ancienne `obGenerateProgram()`.

---

### SYSTÈME 5 — e1RM indicatif si reps > 8

**`getE1RMDisplay(weight, reps)`** :
- `reps ≤ 8` : `calcBrzycki()` → `{ value, label: 'e1RM estimé', reliable: true }`
- `reps > 8` : cap 8 reps → `{ value, label: 'Estimation indicative', reliable: false }`

Évite les mises à jour silencieuses de PR depuis des séries à hautes reps peu fiables.

---

## Tests : 30/30 invariants statiques

| Groupe | Tests | Status |
|---|---|---|
| SRS-01..09 | Adaptive threshold + cycle modifier + shouldDeload hook | ✅ |
| PR-01..07 | calcBrzycki + detectNewPR + modales + goToggleSetComplete | ✅ |
| INJURY-01..06 | checkInjuryPersistence + rehabMode + acknowledge | ✅ |
| CONSENT-01..05 | renderConsentStep + validateConsent + gate + nextStep | ✅ |
| E1RM-01..03 | getE1RMDisplay reliable/indicative | ✅ |

> Tests Playwright : `tests/audit-srs-pr-legal-injury-v205.spec.js` (10 tests).
> Validation finale via 30 invariants Node.js statiques.

## SW v204 → v205
