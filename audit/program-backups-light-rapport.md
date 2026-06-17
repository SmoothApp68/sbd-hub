# PROGRAMME — Allègement des backups (rapport)

> **Branche** : `feat/program-backups-light` · **Base** : `main` (`0b147e3`)
> **But** : ne plus stocker `weeklyPlan`/`mesoWeeks` (dérivé) dans les backups de programme ; restaurer la STRUCTURE et recalculer les charges sur les PR actuels.
> **Statut** : code + tests verts. Aucune action Supabase (migration des backups en base + timeout = Claude chat, après vérif réelle).
> **Réf.** : `audit/program-backups-diagnostic.md` (verdict : `mesoWeeks` dérivé, régénérable, rien d'irremplaçable).

---

## Validation croisée — aucun désaccord

Aucun risque non couvert détecté. Un point de conception explicité (timeline) ci-dessous, et la rétrocompat legacy traitée. La crainte « un backup dont la restauration aurait besoin du `weeklyPlan` figé » est gérée : le seul lecteur de `backup.weeklyPlan` était `restoreCustomProgramBackup` ; on bascule sur la régénération quand un template existe, et on **conserve** le `weeklyPlan` figé pour les backups SANS template (rétrocompat).

**Décision de conception (timeline)** : à la restauration d'un backup à template, on ne restaure **pas** de `currentBlock` figé. La phase/semaine du mésocycle **suit la timeline courante** (`wpDetectPhase`, ancré sur l'historique/date), et `db.weeklyPlan.days` est régénéré sur les PR actuels. C'est le choix le moins surprenant (continuité de l'athlète) et non destructif. `wpDetectPhase` (app.js:22613) est robuste à un `currentBlock` absent (gardes `cb && …`, fallback `Date.now()`), et `calculateParametersForCustomPlan` (app.js:25024) auto-crée `db.weeklyPlan` → aucune régression de crash.

---

## Changements (`js/app.js`)

### Création — `_snapshotCurrentProgram` (≈ app.js:12466)
Refactorée autour de helpers **purs** :
- `_backupHasTemplate(backup)` — discriminant FIABLE = présence de `customProgramTemplate` (et **non** `programMode`, qui peut valoir `'auto'` même pour un programme à template).
- `_buildBackupSnapshot(weeklyPlan, routine, template, programMode, now)` — **avec** template → objet **sans** clé `weeklyPlan` ; **sans** template → conserve `weeklyPlan` figé.
- `_snapshotCurrentProgram` ne deep-copie `weeklyPlan` **que** s'il n'y a pas de template (évite la copie inutile de ~95 ko).

### Restauration — `restoreCustomProgramBackup` (≈ app.js:12770)
- Backup **avec** template → restaure `customProgramTemplate` + `routine` + force `programMode = 'custom'`, re-sync les labels de `routine` depuis le template, puis `calculateParametersForCustomPlan()` → **charges recalculées sur PR actuels**. **Plus de `db.weeklyPlan = backup.weeklyPlan`** (suppression de la double-écriture inutile signalée au diagnostic).
- Backup **sans** template (legacy/auto) → comportement inchangé : `db.weeklyPlan = deepCopy(backup.weeklyPlan)`.

### Migration locale — `_migrateLightenBackups(backups)` (pur) + appel orchestrateur (≈ app.js:14584)
Au chargement, allège les backups en localStorage qui ont un template (retire `weeklyPlan`). Idempotent, défensif (laisse intacts les backups sans template). `saveDB()` si ≥1 modifié → au prochain sync, le blob poussé est léger. C'est le **chemin le plus simple** : le code local allège, la sync propage (cohérent avec le fait que `customProgramBackups` est dans le blob synchronisé).

### Compatibilité lecture (4.3)
`previewBackup` (app.js:13301) et la liste (≈13462) lisent **déjà uniquement** `customProgramTemplate` → aucun crash sur `weeklyPlan` absent. Grep confirmé : les seuls accès à `backup.weeklyPlan` restants sont `_lightenBackup` (gardé) et la branche legacy de `restoreCustomProgramBackup`.

### SW
Bump `trainhub-v290 → v291` (`service-worker.js` + `js/app.js:267`).

---

## Forme cible EXACTE d'un backup allégé (pour Claude chat — migration en base)

```jsonc
{
  "savedAt":       <ms>,
  "firstUsedAt":   <ms>,
  "lastUsedAt":    <ms>,
  "sessionCount":  <int>,
  "programMode":   "auto" | "custom",      // conservé tel quel (non fiable, informatif)
  "routine":       { "Lundi": "...", ... } | null,
  "customProgramTemplate": { id, name, blocks:[{ sessions:[{ dayIndex, label, exercises:[{ name, slot, customNote, ... }] }] }], coachProfile, currentBlockIndex, currentBlockStartDate, ... }
  // ❌ PLUS de "weeklyPlan" (donc plus de mesoWeeks)
}
```

**Règle de migration en base (idempotente)** : pour chaque entrée de `data->'customProgramBackups'` qui possède un `customProgramTemplate` non-null → **retirer la clé `weeklyPlan`**. Les entrées sans `customProgramTemplate` → **ne pas toucher** (le `weeklyPlan` figé est leur seule structure). Discriminant = présence de `customProgramTemplate`, PAS `programMode`. (Fait vérifié : les 15 backups ont tous un template → tous allégeables.)

Équivalent conceptuel SQL (à adapter par Claude chat) : pour chaque élément du tableau, si `elem ? 'customProgramTemplate'` et `elem->'customProgramTemplate' <> 'null'` → `elem - 'weeklyPlan'`.

---

## Tests

`tests/unit/program-backups-light.test.js` — fonctions pures vm-extraites :
- `backup_leger_si_template` / `backup_garde_weeklyplan_si_pas_template` (`_buildBackupSnapshot`).
- `_backupHasTemplate` (présent/absent/null).
- `_lightenBackup` : retire `weeklyPlan` si template + idempotent (même ref) + défensif (legacy intact).
- `_migrateLightenBackups` : allège les bons, laisse les legacy, compte, idempotent, vide/undefined → 0.

```
Test Suites: 10 passed, 10 total
Tests:       184 passed, 184 total   (175 existants + 9 nouveaux)
```
`node -c` OK sur `app.js`, `service-worker.js`. SW v290 → v291.

---

## Séquence de sécurité & vérifs réelles à confier à Claude (chat)

**Ordre (code d'abord, purge en base ensuite) :**
1. **Déployer** ce code.
2. **Vérifier en réel** : l'utilisateur restaure un **ancien** backup (encore lourd en base) → confirmer qu'il récupère la **structure** (mêmes exercices/organisation/notes) avec des **charges recalculées** sur ses PR actuels (pas les poids figés d'origine). Vérifier aussi qu'un **nouveau** backup créé après déploiement n'a **plus** de `weeklyPlan`.
3. **Alléger les 15 backups en base** (Claude chat) selon la règle ci-dessus (retirer `weeklyPlan` des backups à template). La migration locale au chargement le fait aussi côté client ; la migration en base accélère/garantit le résultat même sans relogin.
4. **Vérifier la taille** : `customProgramBackups` ~1,7 Mo → ~110 ko ; blob global → ~150 ko.
5. **Remettre** le `statement_timeout` du rôle `authenticated` 30 s → **8 s** (une fois le blob durablement léger, logs + backups sortis).

> Tant que la restauration régénérée n'est pas confirmée en réel, **ne pas** supprimer les `weeklyPlan`/`mesoWeeks` des backups existants en base (filet de sécurité).

---

## Hors-scope signalé (non traité)
- **Backups auto sans snapshot de `programParams`** : un éventuel futur backup vraiment « auto » (sans template) régénérerait depuis les params actuels — non concerné ici (les 15 ont un template ; la branche legacy conserve leur `weeklyPlan`).
- **Template vide** (`blocks: []`) : `_backupHasTemplate` le considère « à template » (présence de la clé) → il serait allégé puis régénéré en plan vide. N'existe pas en base ; à surveiller si un backup à template vide apparaissait.
