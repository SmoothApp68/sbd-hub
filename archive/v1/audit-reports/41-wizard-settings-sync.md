# Wizard ↔ Réglages — Synchronisation v194

## Fix 1 — equipment pré-rempli depuis `mat` ✅
`pbStartGuided()` lit `pp.mat` via le helper `_pbEquipmentFromMat()` :
- `halteres` → `['dumbbell','cable']`
- `maison` → `['dumbbell','bodyweight']`
- `salle` (défaut) → `['barbell','dumbbell','machine','cable']`

## Fix 2 — Écran raccourci si profil complet ✅
- `_pbHasFullProfile()` → vrai si `freq + mat + goals + selectedDays.length === freq`
- À l'étape 1 du wizard, si profil complet ET pas `_skipShortcut` → `_renderProgramShortcut()` affiche un récap visuel + 2 boutons :
  - ⚡ "Générer avec ces paramètres" → `pbGenerateFromSettings()` (saute les 6 étapes)
  - ✏️ "Modifier les paramètres" → `_skipShortcut=true` → wizard normal

## Fix 3 — Notification de désynchronisation ✅
`_notifyProgramOutdated()` lève un toast 6s cliquable qui relance `pbStartGuided()`. Hooks ajoutés sur :
- `setSettingsMat()`, `setSettingsFreq()`, `setSettingsDuration()`, `setSettingsCardio()`
- `toggleSettingsInjury()`
- `updateProfileField(field, …)` quand `field === 'level' || 'trainingMode'`

`showToast(msg, duration?, onClick?)` étendu sans casser la compat (anciens appels avec `msg` seul fonctionnent).

## Fix 4 — Sync bidirectionnelle ✅ (déjà en place)
`_toggleSingleSelect` écrit dans `db.user.programParams[field]` — `setSettingsFreq/Mat/Duration/Cardio` passent par là. Côté wizard, `pbGenerateProgram` sauve dans `programParams` aussi. Pas de chemin oublié.

## Tests : 8/8
- SYNC-01 : `mat='halteres'` → equipment `['dumbbell','cable']` ✅
- SYNC-02 : `mat='salle'` → equipment inclut `'barbell'` ✅
- SYNC-03 : profil complet → écran raccourci ✅
- SYNC-04 : profil vide → step 1 normal ✅
- SYNC-05 : clic "Modifier" → wizard normal ✅
- SYNC-06 : `pbGenerateFromSettings()` → weeklyPlan généré sans 6 étapes ✅
- SYNC-07 : `setSettingsMat()` → toast outdated affiché ✅
- SYNC-08 : `toggleSettingsInjury()` → toast outdated affiché ✅

## SW bumpé → v194
