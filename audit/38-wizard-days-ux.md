# Wizard — Sélection jours 3 modes + Fix labels v191

## Modes implémentés
- **Manuel** : inchangé — user clique chaque jour, `pbToggleDay()` ✅
- **Algo libre** : `pbAlgoPickDays()` → `_pbOptimizeDays()` avec exclusion des jours bloqués par `db.user.activityTemplate` ✅
- **Algo contraint** : `_pbState.blockedDays` + `pbToggleBlockedDay()`, recalcul auto à chaque toggle ✅

## Fix labels powerbuilding
- Routine alignée avec le split via `_wpGetSplitLabels(mode, freq)` appelée en tête de `generateWeeklyPlan()` ✅
- Élimine la collision `/accessoire/i` qui faisait compresser Vendredi en repos ✅

## Tests : 8/8
- DAYS-01 : Algo libre 5j → Lun/Mar/Jeu/Ven/Sam ✅
- DAYS-02 : Algo libre + natation Mercredi → évite Mer ✅
- DAYS-03 : Contraint + bloquer Sam → exclu du selectedDays ✅
- DAYS-04 : Contraint + 3 jours bloqués → algo compense avec dispos ✅
- DAYS-05 : Manuel → comportement existant inchangé ✅
- DAYS-06 : Changement de mode → selectedDays recalculé ✅
- DAYS-07 : Routine labels powerbuilding_5 corrects par jour ✅
- DAYS-08 : Lundi premier du split → bloc Squat assigné à Lundi ✅

## SW bumpé → v191
