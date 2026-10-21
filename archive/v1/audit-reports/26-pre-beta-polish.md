# Audit 26 — Pre-Bêta Polish v175 → v176

> Audit Playwright headless (Chrome 1194) — 14 tests A-F
> Objectif : valider les 3 micro-fixes d'affinage avant ouverture bêta
> Score : 14/14 (100 %)

---

## Fixes validés

| Fix | Description | Commit | Tests |
|---|---|---|---|
| FIX 1 | `var SW_VERSION = 'trainhub-v176'` dans app.js — error_logs ne montre plus 'unknown' | `6d389c0` | A-01, A-02, A-03 ✅ |
| FIX 2 | Z1 label `'Repos'` → `'Récup active'` dans `updateHRDisplay()` | `45faf87` | B-01, B-02 ✅ |
| FIX 3 | `handleMagicChoice()` appelle `saveDBNow()` (synchrone) au lieu de `saveDB()` (debounced 2s) | `aaa4ff3` | C-01, C-02 ✅ |

---

## Résultats par test

| Test | Nom | Résultat | Valeur observée |
|---|---|---|---|
| A-01 | SW_VERSION est défini dans app.js | ✅ | `typeof SW_VERSION = string` |
| A-02 | SW_VERSION commence par "trainhub-" | ✅ | `trainhub-v176` |
| A-03 | logErrorToSupabase lirait SW_VERSION correct | ✅ | `trainhub-v176` (non 'unknown') |
| B-01 | Z1 label contient "Récup active" | ✅ | `55 BPM Z1 — Récup active · 29% ✓ Prêt` |
| B-02 | Z1 label ne contient pas "Repos" | ✅ | Absence confirmée |
| C-01 | `_magicStartDone = true` immédiatement en mémoire | ✅ | `db._magicStartDone = true` |
| C-02 | localStorage mis à jour immédiatement (saveDBNow) | ✅ | `localStorage._magicStartDone = true` |
| D-01 | Kill Switch → `getActivityRecommendation()` level forbidden | ✅ | `level=forbidden reason=Mode Préservation actif` |
| D-02 | Kill Switch applique RPE cap ≤ 7 dans `wpGeneratePowerbuildingDay` | ✅ | Constraint code présent |
| E-01 | `buildChargeExplanation()` est définie | ✅ | Fonction disponible |
| E-02 | `buildChargeExplanation()` retourne un résultat non-vide | ✅ | `{"text":"Charge augmentée de 8 % · Récupération basse (SRS ...` |
| F-01 | Bouton "Signaler un problème" présent dans GO idle | ✅ | Bouton trouvé dans DOM |
| F-02 | `goReportIssue()` est définie | ✅ | `function OK` |
| F-03 | 0 erreur console critique (tour des 7 onglets) | ✅ | 0 erreur |

---

## Score global : **14/14 (100 %)**

---

## Détails techniques

### FIX 1 — SW_VERSION
- `var SW_VERSION = 'trainhub-v176';` ajouté en globals app.js (ligne ~254)
- La fonction `logErrorToSupabase()` lisait `typeof SW_VERSION !== 'undefined' ? SW_VERSION : 'unknown'`
- Avant : toutes les entrées `error_logs` avaient `version: 'unknown'`
- Après : `version: 'trainhub-v176'` — diagnostic possible par version

### FIX 2 — Z1 "Récup active"
- `updateHRDisplay()` renomme Z1 de `'Repos'` → `'Récup active'`
- Problème : un user avec HR 55 bpm voyait "Z1 — Repos" alors que la montre est bien connectée
- Fix : label moins ambigu, cohérent avec l'affichage "✓ Prêt" déjà présent à < 65%

### FIX 3 — saveDBNow() dans handleMagicChoice
- `saveDB()` est debounced 2s via `setTimeout` → risque de perte si l'utilisateur ferme l'app dans la foulée
- `saveDBNow()` write synchrone → garantit la persistance du choix Magic Start immédiatement
- Test C-02 vérifie que localStorage est mis à jour **avant** le retour de `handleMagicChoice()`

---

## Régressions vérifiées

- 7 onglets parcourus sans erreur console critique (F-03)
- Fonctions Kill Switch, buildChargeExplanation, goReportIssue toutes opérationnelles
- SW version correctement synchronisée entre service-worker.js et app.js

---

## Version finale

| Fichier | Avant | Après |
|---|---|---|
| `service-worker.js` | `trainhub-v175` | `trainhub-v176` |
| `js/app.js` SW_VERSION | non défini | `'trainhub-v176'` |
| `js/app.min.js` | 806,824 bytes | 806,870 bytes |

---

## Statut bêta : ✅ PRÊT

Les 3 micro-fixes recommandés par l'audit v174 sont validés.
Aucune régression détectée. La télémétrie `error_logs` est désormais
fiable (version taggée), le label Z1 est non-ambigu, et le choix
d'onboarding est persité sans risque de perte.

**Méthode reproductible :**
```bash
cd /home/user && python3 -m http.server 8787 &
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node sbd-hub/audit/26-pre-beta-polish.js
```

**Résultats bruts :** `audit/26-pre-beta-polish-results.json`
