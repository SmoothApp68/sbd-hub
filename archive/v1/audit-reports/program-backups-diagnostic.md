# PROGRAMME — Diagnostic des backups (mesoWeeks régénérable ?) — Phase 1

> **Branche** : `audit/program-backups-diagnostic` · **Base** : `main`
> **Statut** : diagnostic seul. Aucun code modifié, aucune donnée écrite/supprimée.
> **Réfs** : `audit/logs-archive-diagnostic.md`, `audit/P3c-rapport.md` (même chantier d'allègement du blob).

---

## VERDICT CENTRAL

**`mesoWeeks` est régénérable à l'identique-de-structure depuis `customProgramTemplate` (programmes CUSTOM) + PR actuels → OUI.** Et **aucune donnée irremplaçable ne vit dans `mesoWeeks`**.

Preuves (toutes vérifiables dans le code) :
1. **Unique writer** : `db.weeklyPlan.mesoWeeks` n'est écrit QUE par `buildMesoWeeks()` (`js/app.js:25379`, + `=null` débutant `:25342`). Aucun autre site n'écrit dedans (grep `.mesoWeeks` : readers `11274/11518/11562`, writer `25379`, strip-sync `supabase.js:302`).
2. **Recalculé à chaque rendu** : `renderMesoView()` appelle `buildMesoWeeks()` à CHAQUE affichage (`js/app.js:11559-11561`), avec le commentaire explicite « Toujours reconstruire … un mesoWeeks persisté reste figé » (`:11556-11558`). Donc tout ce qu'on y écrirait à la main serait écrasé au prochain rendu.
3. **Déjà exclu de la sync** : `syncToCloud` fait `delete wp.mesoWeeks` avant d'envoyer (`js/supabase.js:302`). Le `weeklyPlan` synchronisé entre appareils n'embarque déjà PAS `mesoWeeks` — l'app le régénère après chaque pull. C'est la preuve en production que `mesoWeeks` est jetable/dérivé.
4. **Dérivation pure** : `buildMesoWeeks` construit chaque semaine à partir de `db.weeklyPlan.days` (semaine active) + helpers, eux-mêmes dérivés (cf. Q2). Le « réel » des semaines complétées est lu **en direct depuis `db.logs`** au rendu, pas stocké (cf. Q3).

**Caveat (go/no-go par backup) :** ceci vaut pour les programmes **CUSTOM** (structure = `customProgramTemplate`). Pour les programmes **AUTO** (sans `customProgramTemplate`), la structure n'a jamais été stockée ailleurs que dans le `weeklyPlan` figé → l'alléger ferait perdre la trace exacte de cette structure (régénération = depuis les `programParams` actuels, pas la structure d'origine). → voir Q5/Q6 : **alléger seulement les backups qui ont un `customProgramTemplate` exploitable.**

---

## Q1 — Création, restauration, preview, suppression

### Création — `_snapshotCurrentProgram()` `js/app.js:12421-12435`
Capture un snapshot et l'`unshift` dans `db.customProgramBackups` (cap 15, `:12433-12434`). Contenu :
```js
{ savedAt, firstUsedAt, lastUsedAt, sessionCount, programMode,
  weeklyPlan: deepCopy(db.weeklyPlan),                 // ← contient mesoWeeks (~95 ko) : LE poids
  routine: deepCopy(db.routine),                        // ~378 o
  customProgramTemplate: deepCopy(db.customProgramTemplate) } // ~6,5 ko (null si mode auto)
```
**Pourquoi `mesoWeeks` y est aujourd'hui** : non intentionnel — le snapshot copie `db.weeklyPlan` EN ENTIER (`:12429`), or `db.weeklyPlan.mesoWeeks` y est présent à ce moment (il n'est supprimé qu'au moment de la sync, `supabase.js:302`, pas dans l'objet vivant). Le poids est donc un effet de bord de la deep-copy intégrale du `weeklyPlan`.
Appelé depuis : `generateWeeklyPlan()` (`:25426`, sauf `_skipNextPlanSnapshot`) et `restoreCustomProgramBackup()` (`:12732`, snapshot anti-undo avant restauration).

### Restauration — `restoreCustomProgramBackup(index)` `js/app.js:12724-12755`
Ré-applique **verbatim** : `db.weeklyPlan = deepCopy(backup.weeklyPlan)` (`:12735`) → **repose le `mesoWeeks` figé ET les poids figés**. Restaure aussi `routine` (`:12736`) et `customProgramTemplate` (`:12737`). En mode custom, re-synchronise `db.routine` depuis `template.blocks[0].sessions` (`:12739-12745`) puis `calculateParametersForCustomPlan()` (`:12746`).
> **C'est exactement le comportement que la décision produit veut changer** : restore = poids figés du passé, alors qu'on veut régénérer sur les PR actuels. Ironie : la branche custom appelle DÉJÀ `calculateParametersForCustomPlan()` (`:12746`) qui **recalcule `weeklyPlan.days` sur les PR actuels** — mais juste APRÈS avoir écrasé `db.weeklyPlan` par la version figée (`:12735`). Le recalcul écrase donc partiellement le figé (pour custom), sauf que `db.weeklyPlan` figé reste la base. (Comportement à clarifier en Phase 2/3 — signalé, non corrigé.)

### Preview — `previewBackup(index)` `js/app.js:13301-13345`
Lit **uniquement `backup.customProgramTemplate`** (`tmpl.blocks[0].sessions[].exercises[].name`, `s.label`, `s.dayIndex`). N'ouvre JAMAIS `weeklyPlan`/`mesoWeeks`. Si `tmpl` absent (auto) → « Programme auto — pas de détail disponible » (`:13325`).

### Suppression — `deleteCustomProgramBackup(index)` `js/app.js:13347-13358`
`splice(index,1)` + `saveDB()`. Ne lit rien du contenu hormis `savedAt` (date).

### Liste — renderer `js/app.js:13442-13474`
Affiche méta (`savedAt/firstUsedAt/lastUsedAt/sessionCount`) + `bk.customProgramTemplate.name` (`:13462`). Ne lit pas `weeklyPlan`/`mesoWeeks`.

> **Conclusion Q1** : le `weeklyPlan.mesoWeeks` stocké n'est consommé QUE par `restoreCustomProgramBackup` (`:12735`). Preview et liste n'en dépendent pas. Le poids dominant est donc lu par un seul chemin, celui qu'on veut justement faire régénérer.

---

## Q2 — `mesoWeeks` régénérable ?

`buildMesoWeeks()` `js/app.js:25331-25380` construit les `blockDuration+1` semaines à partir de :
- `db.weeklyPlan.days` (semaine **active**, `:25355`) ;
- `currentBlock.week`/`phase` (`:25337-25338`, resync via `wpDetectPhase` `:25336`) ;
- `db.user.level`/`trainingMode` + `BLOCK_DURATION` (`:25339-25345`).

Statuts dérivés (`:25348-25351`) → days par helper :
- **active** → `db.weeklyPlan.days` (référence directe).
- **projected** → `buildProjectedWeek(offset)` `:25262-25289` : deep-copy de `weeklyPlan.days` + SBD primaires `+2.5 kg × offset` (`:25267,25276-25282`).
- **completed** → `buildCompletedWeekDays(w)` `:25231-25235` = `buildProjectedWeek(w-currentWeek)` (charges *prévues*) ; le **réel** est lu au rendu via `getMesoLogForDay()` `:25212-25226` qui interroge `db.logs` par fenêtre de date.
- **deload** → `buildDeloadWeekDays()` `:25291-25329` : depuis `weeklyPlan.days` ×0.6, reps capées, isolation retirée.
- summaries via `buildWeekSummary()` `:25138`.

Et `db.weeklyPlan.days` lui-même est régénéré :
- **custom** : `calculateParametersForCustomPlan()` `:25024-25113` → mappe `customProgramTemplate.blocks[idx].sessions[].exercises[]` (`name`, `slot`, `customNote`) en days, **poids calculés sur les PR actuels** via `wpComputeWorkWeightSafe()` (`:25045`), sets/reps/rpe selon la phase (`:25054-25056`).
- **auto** : `generateWeeklyPlan()` `:25415+` depuis `programParams` + `routine` + PR.

**Entrées nécessaires pour reconstruire un `mesoWeeks` complet et cohérent, et leur disponibilité hors du `mesoWeeks` figé :**

| Entrée | Source | Dispo sans le mesoWeeks figé ? |
|---|---|---|
| Choix/ordre des exercices, slots, notes (custom) | `customProgramTemplate.blocks[].sessions[].exercises[]` | **Oui** (dans le backup, `:12431`) |
| Labels de jours / jours de repos | `customProgramTemplate` (re-sync routine `:12742-12744`) | **Oui** |
| Poids de travail | `wpComputeWorkWeightSafe` sur **PR actuels** (`db.exercises`/`bestPR`) | **Oui** (PR actuels, c'est voulu) |
| Phase / semaine active | `wpDetectPhase()` ancré sur `currentBlockStartDate` (`:25031,25336`) | **Oui** (date) |
| Durée de bloc | `BLOCK_DURATION[mode][level][phase]` | **Oui** (constante) |
| Réel des semaines complétées | `db.logs` (live `getMesoLogForDay`) | **Oui** (historique) |

→ **Toutes les entrées sont disponibles hors du `mesoWeeks` figé**, pour les programmes custom. Le commentaire `:11556-11558` confirme la nature *calculée* : un `mesoWeeks` persisté est considéré périmé et systématiquement reconstruit.

---

## Q3 — Irremplaçable dans `mesoWeeks` ?

**Non.** Analyse de chaque composante :
- **`status`** (`active/completed/projected/deload`) : recalculé depuis `currentWeek` (`:25348-25351`). Dérivé.
- **`days`** : active = ref de `weeklyPlan.days` ; projected/completed/deload = reconstruits (helpers ci-dessus). Aucun stockage propre.
- **`summary`** : recalculé (`buildWeekSummary`/`buildCompletedWeekSummary`).
- **`weekNumber`/`blockDuration`** : dérivés (boucle + `BLOCK_DURATION`).
- **Réel des semaines passées** : lu en direct depuis `db.logs` (`getMesoLogForDay` `:25223`), **jamais** matérialisé dans `mesoWeeks`.
- **Ajustements manuels** : il n'existe **aucun chemin** qui écrit un échange d'exercice/une série dans `db.weeklyPlan.mesoWeeks` (unique writer = `buildMesoWeeks`). Les éditions manuelles de structure passent par le **builder → `customProgramTemplate`** (`:12706`), où `customNote` est même conservé (`:25069`). Un édit écrit dans `mesoWeeks` serait de toute façon détruit au prochain `renderMesoView` (`:11559`).
- **Choix non déterministe (ε-greedy accessoires)** : pertinent pour le mode **auto** uniquement, et il vit dans `weeklyPlan.days`/la génération, pas dans une couche propre à `mesoWeeks`. Pour custom, les exercices sont fixés par le template (déterministe).

→ **Aucun irremplaçable dans `mesoWeeks`. Go pour l'option régénération (programmes custom).**

---

## Q4 — Contenu de `customProgramTemplate`

Construit par le builder : `db.customProgramTemplate = deepCopy(_customBuilderState)` (`js/app.js:12706`). Forme (init `:12239-12277`) :
```js
{ id, name, createdAt, updatedAt,
  coachProfile, currentBlockIndex, currentBlockStartDate,
  blocks: [ { id, name, durationWeeks, deloadAfter,
      sessions: [ { dayIndex, label,
          exercises: [ { id, name, slot, defaultSlot, customNote, addedAt } ] } ] } ] }
```
Il contient **bien** le choix des exercices (`name`), leur organisation (`dayIndex`, `label`, ordre), leur rôle (`slot` → pilote sets/reps/rpe par phase) et les **notes manuelles** (`customNote`). La « montée en gamme/progression » n'est PAS stockée (elle est recalculée : phase via `wpDetectPhase`, DUP, projection `+2.5 kg/sem`, poids sur PR actuels) → régénérer reproduit la même logique de progression sur les capacités du moment. **C'est exactement la « structure » que l'utilisateur veut préserver.**

> Limite : pour le mode **auto**, `customProgramTemplate` est `null` (jamais construit) → la structure n'existe que dans le `weeklyPlan` figé du backup (cf. Q5/Q6).

---

## Q5 — Forme cible d'un backup « léger » (proposition, non implémentée)

**À conserver :**
- `customProgramTemplate` (la structure complète — custom). ~6,5 ko.
- méta : `savedAt, firstUsedAt, lastUsedAt, sessionCount, programMode`.
- `routine` : optionnel (re-dérivable du template au restore `:12742-12744`) — à garder pour le mode auto où il n'y a pas de template.

**À jeter :** `weeklyPlan` (et donc `mesoWeeks`) — régénérable. Gain ≈ **114 ko → ~7 ko** par backup (×15 ≈ 1,7 Mo → ~110 ko).

**Restauration régénérée (esquisse, Phase 3) :**
1. `db.user.programMode = backup.programMode` ; `db.customProgramTemplate = deepCopy(backup.customProgramTemplate)` ; `db.routine = deepCopy(backup.routine)` (ou re-sync depuis template).
2. **Régénérer** `db.weeklyPlan.days` sur les PR actuels :
   - custom → `calculateParametersForCustomPlan()` (`:25024`).
   - auto → `generateWeeklyPlan()` (`:25415`).
3. `buildMesoWeeks()` (`:25331`) dérive `mesoWeeks` à l'affichage (déjà automatique via `renderMesoView`).
> Net : on supprime la ligne `db.weeklyPlan = deepCopy(backup.weeklyPlan)` (`:12735`) au profit d'une régénération. La branche custom appelle déjà `calculateParametersForCustomPlan()` (`:12746`) — il suffit de ne plus partir du `weeklyPlan` figé.

---

## Q6 — Migration des 15 backups existants (signaler, ne pas migrer)

- **Backups CUSTOM** (avec `customProgramTemplate` exploitable) : la forme cible (Q5) est **dérivable du backup existant** — le `customProgramTemplate` y est déjà (`:12431`) ; il suffit de retirer `weeklyPlan`/`mesoWeeks`. Aucune perte de structure.
- **Backups AUTO** (`customProgramTemplate === null`) : leur structure ne vit QUE dans le `weeklyPlan` figé. **Les alléger perdrait la structure** (preview montre déjà « pas de détail disponible » `:13325`). → **go/no-go par backup** : ne pas alléger ceux sans template, OU décider qu'un backup auto se régénère depuis les `programParams` (perte assumée de l'exact picking d'origine, incluant l'aléa ε-greedy).
- **Backups custom anciens incomplets** : possible que de très vieux backups custom aient un `customProgramTemplate` partiel (avant que le builder ne stocke tous les champs). → **à vérifier par Claude chat** (inspection des 15 backups).

**À confier à Claude (chat)** pour trancher la migration : pour chacun des 15 backups, vérifier la présence et la complétude de `customProgramTemplate.blocks[].sessions[].exercises[]` (≥1 session, exercices nommés, slots) ; lister ceux en `programMode: 'auto'`/`template null`.

---

## Q7 — Hors-scope (signalé, non traité)

- **Table `program_backups` (vide)** : **aucune référence dans le code** (`grep program_backups` sur `js/*` = 0 hit). C'est une table orpheline. Elle serait une cible pertinente UNIQUEMENT si l'on choisissait d'**archiver** les backups lourds hors blob (façon `workout_sessions`) plutôt que de les régénérer. La décision produit (régénérer la structure, pas figer les poids) rend la régénération préférable : un backup léger (~7 ko) ne justifie pas une table dédiée ni une sync séparée. → la garder en réserve, ne rien y écrire.
- **Restore custom à double écriture** (`:12735` figé puis `:12746` recalcul) : incohérence mineure à clarifier en Phase 3 (signalé Q1).
- **Mode auto sans snapshot de `programParams`** : un backup auto ne stocke pas les `programParams` du moment → une régénération auto utiliserait les params actuels. Si on veut un jour restaurer fidèlement un programme auto, il faudrait snapshotter `programParams` (hors-scope ici).

---

## Synthèse pour Claude (chat) — vérifs Supabase

1. **Confirmer l'absence de saisie manuelle dans `mesoWeeks`** : inspecter en profondeur `customProgramBackups[i].weeklyPlan.mesoWeeks[w].days[d].exercises[]` d'un backup réel et vérifier qu'on n'y trouve QUE des données calculées (poids/sets/reps/rpe/coachNote générés), aucune note ou structure absente du `customProgramTemplate` correspondant. (Le code prouve l'unique writer `buildMesoWeeks` ; cette inspection est une confirmation empirique.)
2. **Auditer les 15 backups** : combien ont `customProgramTemplate` non-null et complet (`blocks[0].sessions[].exercises[]` peuplés) vs `programMode:'auto'`/template null. → détermine lesquels sont allégeables sans perte (Q6).
3. **Mesurer le gain** : taille `customProgramBackups` après projection « template + méta seulement » (attendu ~110 ko vs ~1,7 Mo).

---

*Fin du diagnostic Phase 1. Aucun code modifié, aucune donnée écrite/supprimée. Verdict : `mesoWeeks` régénérable (custom), rien d'irremplaçable — GO pour l'option régénération, avec go/no-go par backup sur le mode auto.*
