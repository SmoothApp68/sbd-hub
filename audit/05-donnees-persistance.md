# AUDIT 05 — Modèle de données & Persistance

> Agent 05 (vague 3), branche `claude/agent09-profils-fixtures`, SW v350.
> Domaine : structures `db`, lecteurs/écrivains, sync localStorage↔Supabase, migrations, clés.
> Read-only strict. Généré le mercredi 15 juillet 2026 (~08h20 UTC).
> **Aveugle à Supabase** (vrais utilisateurs) : les vérifs data → section dédiée en fin.
> M'appuie sur `audit/09-profils.md` (carte du format `db` + findings F1–F7) : je **vérifie/complète**
> côté LECTEURS/ÉCRIVAINS, je ne re-dérive pas le format.

## Blocages rencontrés

Aucun blocage. READ-ONLY respecté : **un seul fichier écrit** (`audit/05-donnees-persistance.md`),
aucun `git`, aucun accès Supabase, aucune modif applicative/test/config. Limite structurelle
(non bloquante) : je ne peux pas **exécuter** les chemins de login/sync ni lire la base — les
conséquences runtime des findings P0/P1 ci-dessous sont **prouvées au niveau du code** mais leur
déclenchement effectif chez les vrais users demande une vérif device + une requête Supabase (listées).

## Résumé exécutif

15 findings : **1 P0, 3 P1, 5 P2, 3 P3, 3 P4**. Le point le plus grave (**P0-1**) : le **droit à
l'oubli RGPD ne supprime pas la copie orpheline `SBD_HUB`** (écrite à chaque record d'XP,
app.js:4388), et comme `'SBD_HUB'` est dans les `FALLBACK_KEYS` de migration (app.js:113), le
**prochain démarrage RESSUSCITE le profil « supprimé »** (données santé incluses, dans un état
périmé). En sync, deux risques de perte : (**P1-1**) le login email `db = prof.data` persiste un
blob **sans logs** → le boot suivant jette tout le profil (fallback `defaultDB`) et la ré-hydratation
est court-circuitée ; (**P1-2**) le merge de pull ne conserve du local que `logs/exercises/bestPR`
et **écrase le reste avec le cloud**, ce qui viole cross-device les invariants « XP ne descend
jamais / badges jamais révoqués » et perd les check-ins non poussés. Enfin (**P1-3**) le logger GO
écrit les warm-ups en `setType:'warmup'` **sans** `isWarmup`, et une série de compteurs de volume
diagnostic filtrent `!s.isWarmup` seul → **warm-ups comptés comme séries de travail** (le pattern
« condamne le powerbuilder assidu »).

---

## CARTE DES DONNÉES (structures clés — écrivain / lecteur / risque)

> Format complet champ-par-champ : voir `audit/09-profils.md §3`. Ici : focus **persistance & flux**.
> Clé canonique `SBD_HUB_V29` (`STORAGE_KEY`, engine.js:11). Blob cloud = `sbd_profiles.data`
> **sans `logs`** (`_buildSyncedBlob` supabase.js:284-288) ; logs dans `workout_sessions`.

| Structure | Type | Nullable ? | Formats coexistants | Écrit par | Lu par | Risque persistance |
|---|---|---|---|---|---|---|
| `db.logs[]` | array | présent requis (sinon `defaultDB`, app.js:132) | ordre non garanti (push vs unshift, cf. F3) ; **hors blob** | GO finalize (app.js:31753+), import.js, hydrate/reconcile | partout | **P0/P1** split blob/logs : profil sans logs → jeté au boot ; hydratation court-circuitable |
| `db.exercises{}` | objet | `{}` défauté (app.js:159) | registre DUP `zones{}` (migré) | `setZoneE1RM`/EWMA | wpComputeWorkWeight, ratios | conservé au merge (local prioritaire) ; migrateDUP one-shot |
| `db.bestPR` | `{bench,squat,deadlift}` | défauté | jamais `row/ohp` (OK, jamais indexé ainsi) | `recalcBestPR` (app.js:1759) | affichage Records, ratios | **P2** F1 pas de garde outlier ; **P2** desync bestPR(blob)↔logs(hors blob) |
| `db.readinessHistory[]` | array | `[]` | `readiness[]` (legacy) + `todayWellbeing` (obsolète) | `saveDailyCheckin` (app.js:22437, append) | `getTodayCheckin`/`getCheckinHistory` | **P1** écrasé par cloud au pull ; **P2** F4 arithmétique null ; **P3** doublons même jour |
| `db.readiness[]` | array | `[]` | miroir legacy | plus écrit (C2-d) | fallback `getTodayCheckin` (app.js:706) | lu-seul ; toujours dans hash+blob |
| `db.activityLogs[]` | array | `[]` (app.js:180) | `{source:'manual'/'garmin'/'ghost'}` | flux activités | TRIMP, cardio | **P1** écrasé par cloud au pull (non protégé) |
| `db.body[]` | array | `[]` (app.js:135) | — | pesées | TDEE, graphes | **P1** écrasé par cloud au pull |
| `db.gamification` | objet | `{}` défauté | `xpHighWaterMark` **sous** gamification | app.js:4386 | XP, leaderboard | **P1** écrasé par cloud au pull → **XP peut descendre** ; **P2** absent du hash |
| `db.earnedBadges{}` | objet | `{}` (app.js:182) | **top-level** (≠ `gamification.earnedBadges`) | app.js:4283/4296/14670 | badges | **P1** écrasé par cloud au pull → **badge révocable** cross-device |
| `db.weeklyPlan` | objet\|null | null | `.days[].exercises[].sets` = **ARRAY** (≠ logs num, F7) | générateur, migrateWeeklyPlanSets | Coach, Plan | écrasé par cloud au pull (dérivés strippés) |
| `exo.sets` (logs) | **NUMBER** | — | **num (logs) vs array (programme)** (F7) | createExercise | compteurs (gardés `Array.isArray`) | **P2** landmine si nouveau lecteur oublie le garde |
| `exo.allSets[]` | array | — | **`setType` (GO/import) vs `isWarmup` (legacy/programme)** (L1) | GO/import/CSV | compteurs volume | **P1** lecteurs `!s.isWarmup` seuls ratent les warm-ups GO |
| `exo.series[]` | array | — | warm-ups **exclus** à l'écriture (app.js:31768) | GO/import | e1RM/PR/sparklines | sûr (pré-filtré) |
| `exo.repRecords{}` | objet | — | **clé = reps en string** (`"5"`) | finalize | `_exoMaxRealWeight` #1 | sûr (itéré `Object.keys`) |
| clés device-local | string | — | `_lastCloudPush`/`_lastCloudSync`/`_wsSyncedHashes`/`sbd_lastTab`/`SBD_ACTIVE_WORKOUT` | supabase.js/app.js | guards sync | **P0/P3** non purgés à la suppression compte ; `_lastCloudPush` périmé casse l'hydratation |
| **orphan `SBD_HUB`** | full db | — | copie complète (logs inclus) | **app.js:4388** (hot-path XP) | `FALLBACK_KEYS` app.js:113 | **P0** survit à l'erasure + ressuscite le profil |

---

## Findings

### [P0] Le droit à l'oubli ne supprime pas — et RESSUSCITE — la copie orpheline `SBD_HUB`
- **Où** : écriture `js/app.js:4388` · fallback `js/app.js:113` · suppression `js/app.js:1675`
- **Code** :
  ```js
  // app.js:4386-4388 — hot-path XP, à chaque nouveau record d'XP
  db.gamification.xpHighWaterMark = xp;
  try { localStorage.setItem('SBD_HUB', JSON.stringify(db)); } catch(e) {}   // FULL db → clé 'SBD_HUB'
  // app.js:113 — migration au boot
  const FALLBACK_KEYS = ['SBD_HUB_V28', 'SBD_HUB_V27', 'SBD_HUB_V26', 'SBD_HUB'];
  // app.js:1675 — requestAccountDeletion (RGPD Art.17)
  try { localStorage.removeItem('SBD_HUB_V29'); } catch(e) {}                 // ne retire QUE V29
  ```
- **Problème** : `app.js:4388` écrit un **db complet** (nom, âge, sexe, %gras, blessures, logs…
  = données de santé) sous la clé `'SBD_HUB'` à chaque montée d'XP. La suppression de compte
  (`requestAccountDeletion`) ne retire que `'SBD_HUB_V29'` → la copie `'SBD_HUB'` **reste sur
  l'appareil**. Pire : `'SBD_HUB'` est dans `FALLBACK_KEYS`, donc au **prochain boot** `loadDB`
  ne trouve pas `SBD_HUB_V29`, lit `'SBD_HUB'` (qui a bien `logs`+`user`) et fait
  `setItem(STORAGE_KEY, old)` (app.js:121) → **le profil « supprimé » revient** (dans l'état figé
  au dernier record d'XP, donc périmé). L'utilisateur a confirmé « données définitivement
  effacées » (app.js:1663) : c'est faux. `cloudLogout` (supabase.js:1192) a le même trou de
  rémanence à la déconnexion.
- **Devrait** : (a) ne plus écrire sous `'SBD_HUB'` (utiliser `STORAGE_KEY`, ou supprimer cette
  « optimisation » — la valeur est déjà en mémoire dans `db` et committée au prochain `saveDB`) ;
  (b) `requestAccountDeletion`/`cloudLogout` doivent purger **toutes** les clés SBD
  (`SBD_HUB`, `SBD_HUB_V26/27/28`, `_lastCloudPush`, `_lastCloudSync`, `_wsSyncedHashes`,
  `sbd_lastTab`, `SBD_ACTIVE_WORKOUT`) ou faire `localStorage.clear()` (comme `clearLocalCache`
  app.js:1589).
- **Confiance** : certain (chaîne 100 % lisible dans le code ; agent 09 F6 signalait l'orphelin
  mais **pas** l'axe RGPD-résurrection).
- **[VOULU?]** : non. Le commentaire app.js:4387 (« Persist without full saveDB() in hot path »)
  prouve que la **clé** `'SBD_HUB'` (au lieu de `'SBD_HUB_V29'`) est une **erreur** : la copie de
  secours n'est jamais relue en pratique (V29 existe toujours), donc elle ne remplit même pas son
  rôle — elle ne fait que doubler le stockage et casser l'erasure.

---

### [P1] Login email `db = prof.data` : blob **sans logs** persisté → profil jeté au boot suivant, historique non ré-hydraté
- **Où** : `js/supabase.js:1057-1082` (`loginSubmit`, bouton câblé index.html:1927) ; interaction
  `_buildSyncedBlob` supabase.js:286, `loadDB` app.js:132, guard `syncFromCloud` supabase.js:711
- **Code** :
  ```js
  // supabase.js:1066-1073
  const {data: prof} = await supaClient.from('sbd_profiles').select('data,updated_at')...maybeSingle();
  if (prof && prof.data) {
    db = prof.data;                                   // prof.data n'a AUCUNE clé logs (delete out.logs)
    if (!db.reports) db.reports = [];
    db.lastSync = ...;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));  // persiste un db SANS logs
    await syncToCloud(true);                          // avance _lastCloudPush ≈ now
    refreshUI();
  }
  // puis postLoginSync (app.js:32699) → syncFromCloud → supabase.js:711
  //   var lastPush = _lastCloudPush;  if (cloudTs <= lastPush) { syncToCloud; return; }  // pas d'hydratation
  ```
- **Problème** : chaîne de faits **certains** au niveau code :
  1. `_buildSyncedBlob` fait `delete out.logs` → le blob cloud n'a **pas de clé `logs`**.
  2. `db = prof.data` met `db.logs = undefined`, puis `JSON.stringify` **omet** la clé → localStorage
     contient un profil sans `logs`.
  3. Au **prochain boot**, `loadDB` fait `if (!p.logs || !p.user) return defaultDB()` (app.js:132) :
     `!undefined === true` → **tout le profil local est jeté** et remplacé par `defaultDB()`.
  4. La ré-hydratation qui devrait sauver (`hydrateLogsFromCloud`) n'est atteinte que dans la branche
     **merge** de `syncFromCloud` (`cloudTs > lastPush`). Or `loginSubmit` a fait un `syncToCloud`
     juste avant qui pose `_lastCloudPush ≈ cloudTs` → la branche merge est **sautée** → pas
     d'hydratation, ni en session, ni au boot suivant (tant qu'aucun autre appareil ne pousse).
  Conséquence probable : après une **connexion email sur un appareil qui avait un historique local**
  (session expirée / re-login), l'app affiche 0 séance. Escalade possible en **P0** : si le db réduit
  est repoussé (`syncToCloud`), il **écrase le blob cloud** avec un profil appauvri.
  > Contraste probant : `clearLocalCache` (app.js:1589) fait `localStorage.clear()` → efface
  > `_lastCloudPush` → `syncFromCloud` **hydrate** correctement. C'est précisément le guard
  > `_lastCloudPush` laissé périmé qui casse `loginSubmit`.
- **Devrait** : `loginSubmit` ne doit pas faire un `db = prof.data` brut ; il doit passer par
  `syncFromCloud` (merge + hydrate) **sans** `syncToCloud` préalable, ou appeler explicitement
  `hydrateLogsFromCloud` après avoir garanti `db.logs = []` (jamais `undefined`), et ne persister
  qu'un db avec une clé `logs` présente.
- **Confiance** : mécanisme **certain** (faits 1-4 lisibles) ; **impact live probable** (dépend du
  timing exact des `updated_at` serveur et de l'usage mono/multi-appareil — non exécutable ici).
- **[VOULU?]** : non — `authSubmit` (l'autre handler, index.html:2992) ne fait PAS ce `db=prof.data`
  et délègue à `postLoginSync`, preuve que le chemin propre existe ailleurs.

### [P1] Merge de pull : seuls `logs/exercises/bestPR` survivent du local — XP/badges/check-ins écrasés par le cloud
- **Où** : `js/supabase.js:733-737` (`syncFromCloud`) + déclencheur `js/supabase.js:15-35`
  (visibilitychange) ; invariants CLAUDE.md §13
- **Code** :
  ```js
  // supabase.js:733-737
  var _mergedData = Object.assign({}, cloudData);   // TOUT vient du cloud…
  _mergedData.logs = _mergedLogs;
  _mergedData.exercises = db.exercises || cloudData.exercises;   // …sauf ces 3 champs
  _mergedData.bestPR = db.bestPR || cloudData.bestPR;
  db = _mergedData;
  ```
- **Problème** : au pull (déclenché par retour d'app si `cloudTs > db.lastSync + 5000`,
  supabase.js:31), le db devient le blob cloud **pour tout sauf** `logs/exercises/bestPR`. Donc
  `gamification` (dont `xpHighWaterMark`), `earnedBadges`, `readinessHistory`, `activityLogs`,
  `body`, `user`, `weeklyPlan` sont **remplacés par la version cloud**, sans `Math.max`/union.
  Deux conséquences :
  - **Violation d'invariante cross-device** (CLAUDE.md §13 « XP ne descend jamais, badges jamais
    révoqués ») : si le blob cloud (plus récent en `updated_at`) porte un `xpHighWaterMark` **plus
    bas** ou un `earnedBadges` **incomplet** (écrit par un appareil qui avait lui-même un état
    périmé), le pull **fait descendre l'XP** / **retire des badges**. Le high-water-mark local
    (app.js:4384) ne protège qu'**intra-device**.
  - **Perte de patch non poussé** (le piège connu « debouncedSyncToCloud écrase un localStorage
    périmé avant un pull ») : un check-in (`saveDailyCheckin` → `saveDBNow` → push **débouncé 2 s**)
    ou une activité saisie, s'ils ne sont pas encore poussés quand un pull arrive, sont **écrasés**
    par `db = _mergedData` (le cloud n'a pas encore l'entrée). Fenêtre réelle sous réseau lent /
    multi-appareil / background-foreground rapide.
- **Devrait** : fusion **monotone** des champs à invariante (XP = `max`, `earnedBadges` = union,
  `readinessHistory`/`activityLogs`/`body` = union par clé date/ts comme `_reconcileLogs` le fait
  déjà pour les logs). Le fix-proposal `audit/sync-edit-loss-fix-proposal.md:75` note déjà « XP/badges
  → max/union » : non appliqué au blob.
- **Confiance** : certain sur le code (aucun merge monotone de ces champs) ; **probable** sur le
  déclenchement (exige un 2ᵉ appareil ayant poussé un état régressé — non vérifiable sans la base).
- **[VOULU?]** : partiellement — protéger `logs/exercises/bestPR` est un choix explicite (commentaires
  A2-F1) ; l'**omission** de XP/badges/check-ins de cette protection ne l'est probablement pas
  (contredit une invariante écrite).

### [P1] Warm-ups GO (`setType:'warmup'` sans `isWarmup`) comptés comme séries de travail par plusieurs compteurs de volume
- **Où** : écriture `js/app.js:31776-31789` ; lecteurs incomplets `js/engine.js:2044`, `:2882`,
  `:4696`, `js/app.js:18803` (liste complète dans le tableau L1 plus bas)
- **Code** :
  ```js
  // app.js:31776 — le logger GO n'écrit QUE setType, jamais isWarmup
  exercise.allSets.push({ weight: w, reps: ..., setType: _sType, rpe: ... });  // _sType peut = 'warmup'
  // engine.js:2044 — comptage quad/ischios (detectQuadHamImbalance)
  var sets = (exo.allSets || []).filter(function(s) { return !s.isWarmup; }).length || (exo.sets || 0);
  // engine.js:2882 push/pull · engine.js:4696 volume/muscle/semaine · app.js:18803 contexte intensité
  ```
- **Problème** : une série d'échauffement loggée dans **GO** (le chemin principal de saisie) a
  `setType:'warmup'` et **`isWarmup === undefined`**. Un filtre `!s.isWarmup` seul vaut `!undefined
  === true` → le warm-up est **compté comme série de travail**. Impacte des **diagnostics de
  volume** : déséquilibre quadriceps/ischios (engine.js:2044), ratio push/pull (engine.js:2882),
  volume hebdo par muscle (engine.js:4696), et le contexte d'intensité (app.js:18803, adjacent à
  `collectIntensityContext` app.js:18827). Un powerbuilder assidu fait **beaucoup** de warm-ups sur
  les lourds → gonflement systématique des comptes → **fausses alertes de spike / déséquilibre**
  (exactement le pattern « seuils calibrés pour un pratiquant occasionnel qui condamnent l'assidu »).
  Le fix a été appliqué **au cas par cas** là où un bug est apparu (commentaires engine.js:2709-2713
  et 2576-2577 : « l'ancien filtre `!s.isWarmup` comptait les warm-ups typés comme du travail »)
  mais laissé partout ailleurs.
- **Devrait** : un helper canonique unique `isWorkSet(s)` = `!(s.isWarmup === true || s.setType ===
  'warmup' || s.isBackOff)` utilisé partout, au lieu de ~40 filtres artisanaux divergents.
- **Confiance** : certain (chemin d'écriture GO + lecteurs lus ligne à ligne). `series[]` n'est PAS
  affecté (warm-ups exclus à l'écriture, app.js:31768) — seuls les lecteurs sur **`allSets`** le sont.
- **[VOULU?]** : non (bug latent reconnu dans les commentaires du code).

---

### [P2] Le hash de sync lit `d.xpHighWaterMark` (top-level, toujours `undefined`) au lieu de `d.gamification.xpHighWaterMark`
- **Où** : `js/supabase.js:268` (et `:277` `d.lastModified`)
- **Code** :
  ```js
  // supabase.js:263-277 — _computeDataHash
  d.xpHighWaterMark || 0,        // ← champ réel = d.gamification.xpHighWaterMark → ici toujours 0
  ...
  d.lastModified || 0            // ← 'lastModified' n'est écrit NULLE PART → toujours 0
  ```
- **Problème** : le vrai champ est `db.gamification.xpHighWaterMark` (app.js:185/4386) ; au top-level
  `d.xpHighWaterMark` est **toujours `undefined` → 0**. Le terme XP du hash est donc **mort**. De
  même `d.lastModified` (ligne 277) n'est jamais assigné (grep : 0 écriture) → terme mort. Effet :
  une montée d'XP qui ne change **ni** `logs`, **ni** `earnedBadges.length`, **ni** les autres
  termes (ex. `muscleXP`/`wisdomXP`, ou une quête `secretQuestsCompleted` — non hashée) ne modifie
  pas le hash → `syncToCloud` court-circuite (« Déjà à jour », supabase.js:298) → **XP non
  synchronisée**. Masqué la plupart du temps parce qu'une nouvelle séance change déjà le hash.
- **Devrait** : `(d.gamification && d.gamification.xpHighWaterMark) || 0` ; retirer `d.lastModified`
  ou le brancher.
- **Confiance** : certain (`earnedBadges` est bien top-level, app.js:182/4283 — donc ce terme-là est
  correct ; seul `xpHighWaterMark` est mal chemin-é, vérifié par grep exhaustif).
- **[VOULU?]** : non — incohérence de chemin, confirmée par le fait que les fixtures de test posent
  `xpHighWaterMark` **au top-level** (ex. tests/audit-v154.spec.js:68) et masquent donc le bug.

### [P2] `_normalizeCheckinEntry` fait de l'arithmétique sur des champs potentiellement absents (→ 0 ou NaN)
- **Où** : `js/app.js:691-692` (re-confirme F4 agent 09 côté persistance)
- **Code** :
  ```js
  sleep5: e.sleep / 2, energy5: e.energy / 2, motivation5: e.motivation / 2,
  fraicheur5: (11 - e.soreness) / 2
  ```
- **Problème** : `saveDailyCheckin` (app.js:22421) **exige** les 4 champs, donc les entrées écrites
  **localement** sont complètes. Mais `readinessHistory` arrive aussi **du cloud/d'autres clients/de
  données legacy** : une entrée partielle (`energy:null`) donne `energy5 = null/2 = 0` (lu comme
  énergie **minimale**) et un champ absent donne `NaN` (sérialisé `null`, `NaN <= seuil` toujours
  faux → seuils silencieusement ignorés). Les lecteurs (`getCheckinHistory`) ne re-valident pas.
- **Devrait** : propager `null` pour les champs manquants (les exclure du calcul) plutôt que produire
  `0`/`NaN`.
- **Confiance** : certain (code) ; **sévérité conditionnée** par l'existence d'entrées partielles en
  base (→ question Supabase).
- **[VOULU?]** : non.

### [P2] Désync possible `bestPR` (dans le blob) ↔ `logs` (hors blob) selon l'appareil
- **Où** : `js/supabase.js:284-288` (`bestPR` dans le blob) vs `workout_sessions` (logs) ;
  `recalcBestPR` app.js:1759
- **Problème** : `bestPR` voyage dans `sbd_profiles.data` (blob) tandis que les logs vivent dans
  `workout_sessions`. Un appareil qui reçoit le blob mais **échoue/saute l'hydratation** des logs
  (cf. P1-1) se retrouve avec `bestPR` élevé **sans logs correspondants** (« PR sans log », l'exacte
  incohérence d'intégrité recherchée). Symétriquement, si `recalcBestPR` (app.js:1759, appelé au
  boot) tourne sur des logs vides, il **remet `bestPR` au plancher `onboardingPRs`** (ou 0) →
  `bestPR` **chute** puis peut être repoussé au cloud. `recalcBestPR` est auto-réparateur **si** les
  logs sont présents, destructeur s'ils ne le sont pas encore.
- **Devrait** : ne jamais recalculer/écraser `bestPR` tant que l'hydratation des logs n'est pas
  confirmée ; garder `bestPR` monotone (plancher = ancienne valeur cloud).
- **Confiance** : probable (dépend du timing d'hydratation ; le mécanisme est certain).
- **[VOULU?]** : partiel (recalc depuis logs est voulu ; l'écraser sur logs vides ne l'est pas).

### [P2] `db.logs[0].timestamp` supposé « le plus récent » alors que l'ordre n'est pas garanti
- **Où** : `js/engine.js:2307-2309` (re-confirme F3 agent 09 ; ré-audité côté persistance)
- **Problème** : GO/CSV font `push` (récent **en dernier**), Hevy `unshift` (récent **en premier**,
  import.js:764). `_reconcileLogs`/`_logsFromSessionRows` re-trient **desc** (supabase.js:559/637),
  mais un log ajouté par `push` **après** une hydratation triée casse l'hypothèse. `logs[0]` n'est
  donc pas fiablement le plus récent → un lecteur qui s'y fie (washout) peut mal dater.
- **Devrait** : `Math.max(...logs.map(l => l.timestamp))`.
- **Confiance** : probable. **Note** : agent 09 couvre déjà F3 ; je le garde ici uniquement parce que
  l'ordre de `db.logs` est un fait de persistance transverse.
- **[VOULU?]** : non.

### [P2] `migrateDUPRegisters` filtre `s.isWarmup` seul → warm-ups GO typés comptés dans le registre e1RM
- **Où** : `js/app.js:14629`
- **Code** :
  ```js
  (logExo.allSets || logExo.series || []).forEach(function(s) {
    if (s.isWarmup || s.isBackOff) return;   // rate setType:'warmup' (GO)
  ```
- **Problème** : même angle mort L1 que P1-3, dans une **migration** : les warm-ups GO
  (`setType:'warmup'`, `isWarmup` absent) sont inclus dans le calcul des `zones.{force,hypertrophie,
  vitesse}.e1rm`. Impact atténué (la migration prend un `max`, un warm-up plus léger bat rarement une
  série de travail ; one-shot via `_dupMigrated`), mais la logique est fausse pour tout profil pas
  encore migré / fixtures.
- **Devrait** : `if (s.isWarmup === true || s.setType === 'warmup' || s.isBackOff) return;`.
- **Confiance** : certain.
- **[VOULU?]** : non.

---

### [P3] Doublons de check-in le même jour accumulés dans `readinessHistory`
- **Où** : `js/app.js:22437` (`push` sans dédup) ; lecture `getTodayCheckin` app.js:703-705
- **Problème** : `saveDailyCheckin` fait toujours un `push` (pas un remplacement de l'entrée du jour).
  L'UI est normalement gardée par `hasTodayCheckin` (un seul par jour), mais un **merge cross-device**
  concatène deux entrées de même `date`. `getTodayCheckin` prend la **dernière** (OK), mais
  `getCheckinHistory`/moyennes comptent **les deux** ; le hash mise sur `lastRh.ts` en supposant un
  « remplacement » qui n'a pas lieu. Bloat borné (`slice(-90)`).
- **Devrait** : dédup par `date` à l'écriture (remplacer l'entrée du jour).
- **Confiance** : certain (code). Impact faible.
- **[VOULU?]** : possible (append = journal), mais alors les lecteurs de moyennes devraient dédupliquer.

### [P3] `cloudLogout` laisse l'orphelin `SBD_HUB` (rémanence à la déconnexion)
- **Où** : `js/supabase.js:1192` (`removeItem(STORAGE_KEY)` uniquement)
- **Problème** : facette « déconnexion » du P0 : la copie `SBD_HUB` reste après logout et **repeuple**
  `SBD_HUB_V29` au boot (FALLBACK). Moins grave que l'erasure (données propres de l'utilisateur), mais
  « déconnecté » ne vide pas réellement l'appareil.
- **Devrait** : purge complète (cf. P0).
- **Confiance** : certain.

### [P3] Doublon de handlers de login (`authSubmit` vs `loginSubmit`) aux comportements de sync divergents
- **Où** : `js/supabase.js:848` (`authSubmit`) vs `js/supabase.js:1023` (`loginSubmit`)
- **Problème** : deux fonctions de connexion coexistent, câblées à deux UIs (index.html:2992 vs 1927),
  avec des **flux de sync différents** (`authSubmit` → `postLoginSync` ; `loginSubmit` → `db=prof.data`
  brut, cf. P1-1). Source de divergence de comportement et de findings comme P1-1.
- **Devrait** : un seul chemin de connexion.
- **Confiance** : certain.

---

### [P4] `db.updatedAt` / `db.lastSync` / `db._cloudUpdatedAt` / `_lastCloudPush` / `_lastCloudSync` : modèle de temps redondant et incohérent
- **Où** : app.js:369 (`updatedAt`), supabase.js:320/771 (`lastSync`), 319/772 (`_cloudUpdatedAt`),
  323-324/774-775 (`_lastCloud*`)
- **Problème** : 5 horodatages pour « où en est la sync ». Les guards « le cloud est-il plus récent »
  utilisent des références **différentes** : `db.lastSync` (supabase.js:31 & app.js:14907) mais
  `_lastCloudPush` (supabase.js:711). `_cloudUpdatedAt` est trompeur (= `db.updatedAt` **local**, pas
  l'`updated_at` cloud). Cette incohérence est le terreau des races P1-1/P1-2.
- **Devrait** : un modèle unique (dernier `updated_at` cloud vu vs dernier push).
- **Confiance** : certain (dette, pas un bug isolé).

### [P4] Orphelin `SBD_HUB` : doublement du stockage à chaque record d'XP (accélère le quota)
- **Où** : `js/app.js:4388`
- **Problème** : au-delà du RGPD (P0), écrire une **copie complète** du db (~1 Mo pour aurel, snapshot
  agent 09 = 1023 Ko) à chaque montée d'XP **double** l'empreinte localStorage (SBD_HUB_V29 +
  SBD_HUB ≈ 2 Mo) sous un plafond ~5 Mo ; l'échec `QuotaExceededError` est avalé (`catch(e){}`) donc
  **silencieux** (contrairement à `_flushDB` app.js:375 qui, lui, alerte).
- **Devrait** : supprimer cette écriture (redondante — la valeur est en mémoire et committée au
  prochain `saveDB`).
- **Confiance** : certain.

### [P4] `saveDB()` déclenché au chargement (écriture au boot) — invariante « render pur » adjacente
- **Où** : `js/app.js:605` (`_routineFixed`), + app.js:4805/14836/14846-14847 (`saveDB()` en migration boot)
- **Problème** : re-confirme F5 (agent 09) : charger un profil sans `_routineFixed`/`_dupMigrated`/…
  **écrit** en base au boot. Cohérent avec la dette connue (`blockStartDate` muté au render,
  CLAUDE.md §9). Non un bug de données, mais à garder en tête pour « db identique après deux renders ».
- **Confiance** : certain.
- **[VOULU?]** : oui (migrations one-shot assumées).

---

## Lecteurs incomplets des formats coexistants (synthèse L1 — warm-up)

> `db.exercises`/logs : GO écrit **`setType`** (app.js:31776, `isWarmup` **absent**) ; l'import IA/CSV
> écrit **les deux** (import.js:404, app.js:10538) ; le programme (`weeklyPlan.days[].exercises[].sets`)
> écrit **`isWarmup`**. Un filtre correct doit tester `isWarmup === true || setType === 'warmup'`.

| Lecteur | Fichier:ligne | Filtre | Source lue | Verdict |
|---|---|---|---|---|
| detectQuadHamImbalance | engine.js:2044 | `!s.isWarmup` | logs `allSets` | ❌ rate warm-ups GO |
| push/pull sets | engine.js:2882 | `!s.isWarmup` | logs `allSets` | ❌ |
| volume/muscle/semaine | engine.js:4696 | `!s.isWarmup` | logs `allSets` | ❌ |
| contexte intensité (top set) | app.js:18803 | `!s.isWarmup` | logs `allSets`/`series` | ❌ (atténué : warm-up rarement en dernier) |
| migrateDUPRegisters | app.js:14629 | `s.isWarmup` | logs `allSets` | ❌ (one-shot) |
| RPE moyen / e1RM RPE | engine.js:2551, 2681 | `!s.isWarmup && !s.isBackOff` | logs `allSets` | ❌ (RPE, moins critique) |
| e1RM par zone (curation) | engine.js:2577 | `isWarmup===true \|\| setType==='warmup'` | logs | ✅ |
| e1RM affichage / nb séries | engine.js:2713, 3925, 5675 | double test | logs | ✅ |
| Coach volume muscle | coach.js:470 | double test | logs | ✅ |
| `_exoMaxRealWeight` (allSets) | app.js:1744 | `setType !== 'warmup'` seul | logs `allSets` | ⚠️ rate `isWarmup:true` legacy (mais fallback #2, léger) |
| Home / séries de travail | app.js:11116, 11174, 11483, 11566, 11570 | double test | logs | ✅ |

**Autres formats coexistants** (statut) : `exo.sets` num(logs) vs array(programme) — **gardé**
`Array.isArray` (coach.js:39, app.js:8314, 28454) → landmine, pas un bug live (confirme F7).
`repRecords` clé-string — itéré `Object.keys`, sûr (L4). `series` vs `allSets` — `_exoMaxRealWeight`
(app.js:1733) gère la cascade repRecords→allSets→series (L2). `readiness` vs `readinessHistory` vs
`todayWellbeing` — `getTodayCheckin`/`hasTodayCheckin` (app.js:669-708) lisent bien les trois (✅).

## Migrations — bilan idempotence

- **Idempotentes** (toutes flag-gardées, ré-exécutables sans dégât) : `migrateDUPRegisters`
  (`_dupMigrated`), `migrateBadges` (`_badgesMigrated`, `if (earnedBadges[id]) return` — pas de
  révocation), `migrateActivityData` (`_activityMigrated`), `migrateWeeklyPlanSets`
  (`_weeklyPlanSetsMigrated` — soigne num→array côté programme), `migrateInjuryNames`
  (`_injuryMigrated`), freeze V2/V3/V4 (app.js:460-483), `_migrateLogEditedAt` (idempotent par
  `=== undefined`). Pattern CLAUDE.md `if (x === undefined) x = default` **respecté** dans `loadDB`.
- **Version inconnue (client plus récent)** : `needsOnboarding` (app.js:1946)
  `onboardingVersion < ONBOARDING_VERSION` → une version **supérieure** (5 vs 4) ne re-déclenche PAS
  l'onboarding (pas de re-onboarding destructif). ✅ robuste au futur.
- **`onboardingProfile`** (obsolète v337) : migré **seulement** pour la valeur `'reeducation'`
  (app.js:540-546) ; les autres valeurs legacy ne sont pas converties — mais les vieux profils
  (`onboardingVersion < 4`) sont **forcés de re-onboarder** (niveau/discipline/coachingStyle), donc la
  migration se fait par ré-onboarding. `obProfile` reste **dérivé** et lu (engine.js:5569, app.js:15240
  filtre notif) — pas un orphelin. ✅ pas de trou de migration.
- **Non-idempotent notable** : voir P3 doublons check-in (append). RAS ailleurs.

## Angles morts de cet audit

- **Non exécuté** : impossible de rejouer login/pull/push réels → sévérité live de P1-1/P1-2/P1-3
  (déclenchement) **inférée du code**, pas observée. `verify` device requis.
- **`js/supabase.min.js`** (orphelin, CLAUDE.md §5) non lu ligne à ligne (SDK inactif).
- **IndexedDB** (`clearWorkoutIDB`, `SBD_ACTIVE_WORKOUT`, backup séance par série) survolée — la
  cohérence IDB↔localStorage↔cloud (triple store) mériterait un audit dédié.
- **Edge functions** (`coach-ai`, `anthropic-proxy`, `delete_user_complete_data` RPC) hors repo JS.
- Je n'ai pas quantifié **toutes** les ~40 occurrences de filtres warm-up ; le tableau L1 cible les
  lecteurs sur `allSets` de logs (les seuls exposés au format GO).

## Hors-domaine (signalé, non investigué)

- Champs `db.user` orphelins/dupliqués (`_realLevel`, `liftLevels`, `trainingFreq`, `bw` vs `bodyWeight`/`weight`) — audit 03a le couvre.
- `matchExoName` angle mort « Jambes Tendues » (CLAUDE.md §9) — domaine matching/lifts.
- Calibration des seuils volume/ratios eux-mêmes (au-delà du sur-comptage warm-up) — domaine Coach/algo.
- `blockStartDate` muté au render — domaine render-pur.
- Sécurité : clé `SUPABASE_KEY` en clair (supabase.js:9) — domaine sécurité/RLS.

## À VÉRIFIER CÔTÉ SUPABASE

> Aveugle à la base — questions précises pour calibrer la sévérité (via Claude.ai). Aucune n'est
> bloquante pour ce rapport.

1. **RGPD / orphelin `SBD_HUB` (P0)** — impossible à voir en base (clé localStorage device-local),
   mais **vérif device** : sur un appareil, provoquer un record d'XP, puis « Supprimer mon compte »,
   puis recharger → le profil **revient-il** ? (attendu : oui, bug confirmé). Côté base, confirmer que
   `delete_user_complete_data()` efface bien **toutes** les tables du user.
   > `select tablename from pg_tables where schemaname='public';` puis vérifier la couverture du RPC.
2. **Check-ins partiels (P2 / F4)** — les entrées `data.readinessHistory` de vrais users ont-elles des
   champs manquants ou `pain:null`, ou sont-elles toujours complètes (4 champs) ?
   > `select user_id, jsonb_array_length(data->'readinessHistory') n from sbd_profiles;` + inspecter
   > une entrée : `select jsonb_path_query(data,'$.readinessHistory[*]') from sbd_profiles where user_id='6e2936e7-de11-4f19-89b1-d1eb5968ba35' limit 5;` — chercher un `energy`/`soreness` null/absent.
3. **XP/badges régressables (P1-2)** — comparer `data.gamification.xpHighWaterMark` et le nombre de
   `data.earnedBadges` entre les lignes des users multi-appareils ; un blob récent avec un
   `xpHighWaterMark` **inférieur** à une trace antérieure prouverait la régression cross-device.
   > `select user_id, updated_at, (data->'gamification'->>'xpHighWaterMark') xp, (select count(*) from jsonb_object_keys(data->'earnedBadges')) badges from sbd_profiles order by updated_at desc;`
4. **`bestPR` sans logs (P2)** — existe-t-il des users dont `sbd_profiles.data->'bestPR'` est > 0 mais
   qui ont **0 ligne** dans `workout_sessions` (blob hydraté sans logs) ?
   > `select p.user_id, p.data->'bestPR' bp, count(w.session_id) n from sbd_profiles p left join workout_sessions w on w.user_id=p.user_id group by 1,2 having count(w.session_id)=0 and (p.data->'bestPR') is not null;`
5. **Warm-ups en base (P1-3)** — dans `workout_sessions.data.exercises[*].allSets[*]`, les warm-ups
   portent-ils `setType:'warmup'` **sans** `isWarmup` (chemin GO) ? Quantifier la proportion de
   séries `setType='warmup'` chez aurel pour estimer le sur-comptage.
   > `select count(*) from workout_sessions, jsonb_path_query(data,'$.exercises[*].allSets[*]') s where user_id='6e2936e7-…' and s->>'setType'='warmup' and not (s ? 'isWarmup');`
6. **Login/hydratation (P1-1)** — après une **connexion email** sur un appareil ayant un historique
   local, l'historique reste-t-il affiché ? (vérif device). En base : le blob `sbd_profiles.data`
   contient-il par erreur une clé `logs` non vide pour certains users (signe d'un vieux push pré-P3-c) ?
   > `select user_id, jsonb_typeof(data->'logs'), jsonb_array_length(data->'logs') from sbd_profiles where data ? 'logs';`

---

STOP. Audit données & persistance terminé. Rapport : audit/05-donnees-persistance.md. Aucune modification, aucun commit.
