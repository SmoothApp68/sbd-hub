# LOT 1 — Rebranchement « 📦 Versions sauvegardées » (rapport)

> **Branche** : `feat/restore-backups-ui` · **Base** : `main` (`feecad9`)
> **Statut** : code + Jest (190) + test Playwright de navigation verts. Aucune action Supabase, aucune donnée touchée.
> **Réf.** : `audit/orphan-ui-audit.md` (PERTE #1).

---

## Ce qui a été fait (pur rebranchement UI)

La section backups n'était rendue que dans `renderProgramBuilderView()` (morte depuis la bascule v237). Rebranchée dans la vue **réellement affichée** `renderProgrammeV2()`.

1. **Helper unique** `buildBackupsListHtml()` (app.js, avant `renderProgrammeV2`) : renvoie les **rows** de backups avec les 3 boutons câblés sur `previewBackup` / `restoreCustomProgramBackup` / `deleteCustomProgramBackup` (inchangées). Source de vérité partagée.
2. **`renderProgramBuilderView`** : le `forEach` inline (≈13574-13616) a été **remplacé** par un appel au helper (dé-duplication ; même rendu, plus de copie).
3. **Bloc repliable** `buildBackupsCollapsibleHtml()` + `toggleBackupsList()` : titre « 📦 Versions sauvegardées (N) » cliquable, liste **repliée par défaut** (chevron ▸/▾), discret (séparateur `border-top`).
4. Injecté dans `renderProgrammeV2()` :
   - **en bas de la vue mésocycle** (placement validé par Aurélien), `h += buildBackupsCollapsibleHtml()` avant `container.innerHTML` ;
   - **et dans l'état « pas de programme »** (early return) — *décision à valider* (voir ci-dessous) : c'est précisément l'écran où l'on veut restaurer un backup. Même helper, replié, n'apparaît que si des backups existent.
5. **Tolérance backups allégés** : le helper et `previewBackup` lisent uniquement `customProgramTemplate` (jamais `bk.weeklyPlan`) → aucun accès susceptible de planter sur les backups v291 sans `weeklyPlan`. Si `db.customProgramBackups` est vide → le bloc ne s'affiche pas (helper renvoie `''`).
6. `renderProgramBuilderView` laissée orpheline pour le reste (suppression = dette séparée, hors scope).

**Non touché** (conforme au prompt) : `previewBackup` / `restoreCustomProgramBackup` / `deleteCustomProgramBackup`, la sync, le blob, Supabase, le reste de `renderProgrammeV2`.

### Point à valider par Aurélien
J'ai ajouté le bloc **aussi dans l'état « pas de programme actif »** (en plus de la vue mésocycle validée). Raison : un utilisateur qui a réinitialisé son programme n'aurait sinon aucun moyen de restaurer un backup. C'est low-risk (replié, conditionné à l'existence de backups). À dire si tu préfères le limiter à la seule vue mésocycle.

---

## Vérification — test de navigation (la leçon du bug v237)

`tests/restore-backups-ui.spec.js` (Playwright) — navigue réellement onglet **Séances → sous-vue Plan** (`showTab('tab-seances')` + `showSeancesSub('s-plan')`), injecte un backup factice, rend `renderProgrammeV2()`, déplie, puis vérifie :
- (a) le bloc « Versions sauvegardées » est **présent ET visible** dans `#programmeV2Content` ;
- (b) la liste dépliée contient le backup + bouton **Restaurer** + boutons `previewBackup`/`deleteCustomProgramBackup` ;
- (c) **les 3 handlers `onclick` sont des fonctions réellement définies** (anti-ReferenceError — exactement ce que les tests unitaires ne voyaient pas).

```
✓ tests/restore-backups-ui.spec.js › Programme : section Versions sauvegardées rebranchée + handlers définis (618ms)
1 passed
```
Jest existant : **190 passed, 11 suites**. `node -c` OK (`app.js`, `service-worker.js`). Bump SW **v292 → v293**.

---

## Écarts roadmap ↔ réel (à mettre à jour — signalé, non corrigé)
- **`PROJECT-STATUS.md` n'existe pas** dans le repo (référencé par plusieurs prompts). Soit le créer, soit cesser de le référencer.
- **`ROADMAP.md:41`** : « TÂCHE 4 : Backup programme v2 (déjà implémenté) » coché `[x]`. C'est trompeur : la feature **était implémentée mais devenue inaccessible** (régression v237) jusqu'à ce lot. Roadmap à amender (régression + rebranchement).
- La note obsolète « Cloud sync broken / add syncToCloud() after saves » signalée par le prompt **n'a pas été trouvée** dans `ROADMAP.md` ni `ARCHITECTURE.md` (grep négatif) — possiblement déjà retirée ou dans `TODO.md`. **Sync non touchée** dans ce lot, conforme.

---

## À vérifier en réel (Aurélien)
Sur la vue **Programme** (Séances → Plan), en bas : déplier « 📦 Versions sauvegardées » →
1. la liste de tes backups apparaît, boutons 👁 / Restaurer / 🗑 visibles ;
2. **Restaurer** un ancien backup → la **structure d'exercices** revient ET les **charges sont recalculées sur tes PR actuels** (pas les poids figés d'origine — cf. lot « backups allégés ») ;
3. 👁 Prévisualiser affiche la structure ; 🗑 supprime bien l'entrée.
