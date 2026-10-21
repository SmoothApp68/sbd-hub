# AGENT 09 — Générateur de profils de test réalistes

> Domaine : bibliothèque de profils synthétiques `db` qui **ressemblent à de vrais
> utilisateurs**, réutilisable par les tests et par l'agent 10.
> Périmètre d'écriture : `tests/fixtures/profiles/` + ce rapport. **Aucune** modif
> applicative, **aucun** commit, **aucun** accès Supabase.
> Généré le mercredi 15 juillet 2026 (SW v350, branche `main`).

---

## 0. ✅ DIVERGENCE DE CHEMIN — RÉSOLUE

> **Résolution orchestrateur** : la bibliothèque a été **déplacée en `tests/fixtures/profiles/`** (convention réelle du repo). Re-validation `loadDB` **9/9 OK** depuis le nouveau chemin. Toute mention `test/…` ci-dessous se lit `tests/…`. À figer dans les prompts des agents 10→20 : utiliser `tests/fixtures/profiles/`.

Le prompt impose **littéralement** le dossier `test/fixtures/profiles/` — **`test/`
au singulier**. Or le repo utilise **`tests/`** (pluriel) pour toutes ses specs
(`tests/*.spec.js`, `tests/unit/*.test.js`) et Jest est configuré sur
`testMatch: ["**/tests/**/*.test.js"]` (jest.config.js / js/jest.config.js).

**Conséquence** : j'ai créé un **nouveau dossier `test/` (singulier)**, distinct de
`tests/`. Il n'est **pas** ramassé par `npm test` (le glob vise `tests/`, pas
`test/`). J'ai respecté le prompt à la lettre et **n'ai touché à rien** dans
`tests/`. Deux résolutions possibles, à trancher par Aurélien / l'orchestrateur :

1. **Renommer** `test/` → `tests/fixtures/profiles/` pour cohérence + ramassage
   Jest (recommandé si les tests doivent en dériver directement).
2. **Étendre `testMatch`** pour inclure `test/` (déconseillé : deux racines de
   test qui se ressemblent = piège de maintenance).

Tant que ce n'est pas tranché, les fixtures sont importables **par chemin
explicite** (`require('../../test/fixtures/profiles')`) mais **pas
auto-découvertes**. Rien d'autre dans le repo n'a été modifié.

---

## 1. FICHIERS CRÉÉS (chemins exacts)

Tous sous `/home/user/sbd-hub/tests/fixtures/profiles/` :

| Fichier | Rôle |
|---|---|
| `generator.js` | **Cœur** : builders bas-niveau (`workSet`, `warmupLegacy`, `warmupTyped`, `dropSet`, `failSet`, `exercise`, `session`, `checkin`, `bodyEntry`), assembleur (`baseUser`, `blankProfile`, `recomputeBestPR`) et le **générateur paramétrable** `generateProfile(opts)`. |
| `vierge.js` | Profil : compte créé, onboarding non fait, 0 donnée. |
| `debutant.js` | Profil : onboarding fait, 3 séances, 1 lift, PR = onboarding. |
| `aurel_like.js` | **Profil de référence** (562 séances, tous les pièges). |
| `retour_apres_pause.js` | Profil : historique riche ancien + 6 mois d'arrêt + 2 séances. |
| `mono_lift.js` | Profil : uniquement du bench (dénominateurs de ratios absents). |
| `donnees_sales.js` | Profil : noms inconnus, 0 kg/0 reps, timestamp futur, doublon, unités douteuses. |
| `extreme_bas.js` | Profil : 40 kg de PdC, charges minuscules, femme + cycle. |
| `extreme_haut.js` | Profil : 300 kg squat, ~15 séances/sem, élite lourd. |
| `progression_nette.js` | Profil : progresse **vraiment** (cas nominal). |
| `index.js` | Registre + `build(name, now)` / `buildAll(now)` / `meta` + CLI (`list`, `dump`). |
| `validate.js` | **Harness de validation** : passe chaque profil dans le **vrai loadDB** extrait d'app.js + caractérisation via fonctions réelles. |
| `snapshots/*.json` | 9 snapshots JSON **figés à 2026-07-15T05:42Z** (aperçu / seed direct localStorage). Générés par `node index.js dump`. Les builders now-relatifs restent la source de vérité. |

Consommation type (tests / agent 10) :

```js
const profiles = require('../../test/fixtures/profiles');
const db = profiles.build('aurel_like');            // now-relatif
const db2 = profiles.build('aurel_like', FIXED_NOW); // déterministe
localStorage.setItem('SBD_HUB_V29', JSON.stringify(db)); // seed comme les specs actuelles
```

---

## 2. VALIDATION loadDB — profil par profil (OK/KO)

**Méthode** : « loadDB » n'est pas une fonction nommée — c'est l'IIFE
`let db = (() => {…})()` d'app.js (~lignes 83-270, `defaultDB` inclus). `validate.js`
l'**extrait de la source réelle** et l'exécute dans un `vm` avec un `localStorage`
stubbé contenant le blob sous `SBD_HUB_V29`. C'est **le** point de décision
« accepter le blob » vs « retomber sur `defaultDB()` ». Détection de fallback via
la sentinelle `_fixtureName` (absente de `defaultDB()`).

**Résultat : 9/9 OK** — pour le blob du builder ET pour le snapshot JSON figé.

| Profil | Chargement | Séances | TDEE | bestPR (recalc) | predictPR(deadlift) |
|---|---|---|---|---|---|
| vierge | **OK** | 0 | 2300 (fallback bw=0) | 0/0/0 | Pas assez de données (0 pts) |
| debutant | **OK** | 3 | 2530 | 50/70/90 (= onboarding) | Pas assez de données |
| **aurel_like** | **OK** | 562 | **2672** ✓ | **140/145/170** ✓ | **« Pas de progression », currentE1RM 169** ✓ |
| retour_apres_pause | **OK** | 53 | 2390 | 120/160/200 | « Objectif déjà atteint » (points anciens) |
| mono_lift | **OK** | 15 | 2498 | 150/0/0 | Pas assez de données |
| donnees_sales | **OK** | 7 | 4524 | **80/315/0** (outlier !) | 1 pt |
| extreme_bas | **OK** | 8 | 1706 | 22/37/45 | plateau 48 |
| extreme_haut | **OK** | 76 | 4543 | 200/300/340 | plateau 320 |
| progression_nette | **OK** | 18 | 2021 | 60/105/127.5 | **reachable, +1.76 kg/sem** ✓ |

Invariants vérifiés au chargement de chaque profil : pas de fallback `defaultDB`,
`db.user` présent, `db.logs` tableau, `onboardingVersion` **normalisé en nombre**
(le cloud a pu stocker `"4"`), `injuries` normalisé en tableau d'objets,
`coachingStyle` défauté. **Aucune exception, aucun KO.**

> Le harness prouve non seulement le **chargement** mais le **réalisme** : aurel
> reproduit exactement les 4 chiffres deadlift distincts — registre e1RM **188.5**
> (capacité) ≠ bestPR **170** (barre réelle) ≠ maxRM log récent **169** (plat) ≠
> cible 175. C'est le scénario racine du bug « stable autour de 169 au lieu de 170 ».

---

## 3. CARTE DU FORMAT `db` (rétro-ingénieré du code réel)

Sources : IIFE de chargement (app.js:110-270), `defaultDB` (app.js:83-109),
init défensive post-IIFE (app.js:~384-631), `createSession`/`createExercise`/
`finalizeSessionFromSeries` (import.js:70-174), `saveDailyCheckin` (app.js:22420),
`updateEWMAForExo`/`setZoneE1RM` (engine.js:3972/4945), `_normalizeCheckinEntry`
(app.js:684).

### 3.1 Racine `db.*`

| Champ | Type | Nullabilité / notes |
|---|---|---|
| `user` | objet | **REQUIS truthy** sinon `loadDB` → `defaultDB()`. |
| `logs` | tableau | **REQUIS présent** (`[]` accepté : `![]===false`). |
| `exercises` | objet `{ [nom]: registre }` | registre DUP e1RM (§3.4). |
| `bestPR` | `{ bench, squat, deadlift }` | **VRAIES barres** (jamais l'e1RM). |
| `readinessHistory` | tableau (§3.3) | store canonique des check-ins ; slice(-90). |
| `readiness` | tableau | **legacy**, lu en fallback transitoire seulement. |
| `activityLogs` | tableau | `{date,type,duration,intensity,trimp,source}`. |
| `body` | tableau | `{ts,date,weight,bw,kcal,prot,…}`. |
| `weeklyPlan` | objet \| null | `.currentBlock.{phase,week,blockStartDate}`, `.days[]`. |
| `routine` | objet \| null | `{ Jour: titre }`. |
| `earnedBadges` | objet | jamais révoqués. |
| `gamification` | objet | `.xpHighWaterMark` (XP ne descend jamais), `.earnedBadges`. |
| `macrocycles` | `{current,history}` | peuplé au boot depuis `weeklyPlan.currentBlock` si absent. |
| autres | — | ~90 champs défensifs `if (x===undefined) x=…` (reports, keyLifts, notificationsSent, garminHealth, rhrHistory, smartStreak, `_ghostLogAnswered`, `_cloudUpdatedAt`, `updatedAt`…). |

### 3.2 Séance `db.logs[]` (format canonique `createSession` + `finalize`)

```
{ id, timestamp(ms), date("dd/mm/yyyy" fr-FR), shortDate("dd/mm"),
  day(fr), title, type, volume(num), duration(sec), editedAt,
  exercises: [ Exercice ],  readiness?(objet), hrData?, isGroupClass? }
```

**Exercice** (`createExercise`) :

| Champ | Type | Notes / PIÈGES |
|---|---|---|
| `name` | string | matcher canonique = `getSBDType(name)`, **pas** le titre de séance. |
| `exoType` | `'weight'|'reps'|'time'|'cardio'` | |
| `muscleGroup` | string \| null | non requis par les lecteurs critiques. |
| **`sets`** | **NUMBER** (compteur) dans les logs | ⚠️ **mais ARRAY** dans les exos de *programme* (`weeklyPlan.days[].exercises`) — cf. finding F7. |
| `maxRM` / `maxRMDate` | num / ts | e1RM Brzycki (cap 20). **Indicateur, jamais un PR.** |
| `maxReps`,`maxTime`,`distance`,`totalReps` | num | selon `exoType`. |
| `repRecords` | `{ "<reps>": poidsMax }` | clé = **nombre de reps en string**. Source #1 de `_exoMaxRealWeight`. |
| `series` | `[{weight,reps,date}]` | **work sets curés** (normaux, non-abandon). Pilote e1RM/PR/sparklines. |
| `allSets` | `[{weight,reps,setType,rpe,…}]` | **tous** les sets bruts (warm-up inclus). Source #2. |
| `isCardio/isReps/isTime` | bool | dérivés de `exoType`. |
| `isPrimary` | bool (optionnel) | main lift du jour. |

**Set** (élément de `allSets`) :

```
{ weight(num), reps(num), setType('normal'|'warmup'|'dropset'|'failure'|'backoff'), rpe(num|null) }
  + optionnels : isWarmup, isAbandoned, isDropSet, isBackOff, grind, grindTech, hrPeak, hrAtLog…
```

### 3.3 Check-in `db.readinessHistory[]` (`saveDailyCheckin` app.js:22437)

```
{ ts, date("yyyy-mm-dd" ISO), sleep(1-10), energy(1-10),
  motivation(1-10), soreness(1-10), score(0-100), pain(string|null) }
```
- `pain === null` = **choix explicite « aucune douleur »** (`!!pain` déclenchait
  un faux « Douleur signalée » chez l'arbitre — d'où le null volontaire).
- ⚠️ Champs **partiels** : `_normalizeCheckinEntry` fait de l'arithmétique brute
  (`e.energy/2`) → `null/2 = 0`, `undefined/2 = NaN` (cf. finding F4).

### 3.4 Registre DUP `db.exercises[nom]` (`setZoneE1RM`/`updateEWMAForExo`)

```
{ e1rm, shadowWeight, ewmaE1rm, ewmaSessionCount, ewmaUpdatedAt, lastRPE,
  fiveRepCalibrated?, _prepenaltyBase?,
  zones: { force:        { e1rm, shadowWeight, sessionsCount },
           hypertrophie: { e1rm, shadowWeight, sessionsCount },
           vitesse:      { e1rm, shadowWeight, sessionsCount } } }
```
`e1rm` = **capacité courante** qui pilote `wpComputeWorkWeight` — **distincte** du
pic historique (Records) et de `bestPR` (barre réelle). Tethering ±15 % force↔hyper.

### 3.5 FORMATS COEXISTANTS (les landmines demandées)

| # | Landmine | Détail | Où le code gère les deux |
|---|---|---|---|
| L1 | **warm-up ×2 formats** | `{isWarmup:true}` (booléen legacy, betatester spec) **ET** `{setType:'warmup'}` (string, GO/import réels) | `s.isWarmup === true \|\| s.setType === 'warmup'` (engine.js:2577, 3925 ; app.js…) |
| L2 | **sets ×2 endroits** | `series[]` (work sets curés) **ET** `allSets[]` (brut) | `_exoMaxRealWeight` app.js:1733 (repRecords→allSets→series) |
| L3 | **`sets` num vs array** | **NUMBER** (compteur) dans `db.logs` ; **ARRAY** de `{weight,reps,isWarmup}` dans les exos de programme | branche explicite `Array.isArray(exo.sets)` app.js:8442-8455 |
| L4 | **`repRecords` clé string** | `{ "5": 100 }` — clé = nombre de reps **en string** | itéré via `Object.keys` |
| L5 | **deadlift double-exclusion** | `getSBDType` exclut RDL/jambes tendues/stiff-leg **et** le bench haltères | regex `_getSBDTypeRaw` engine.js:809-822 |
| L6 | **ordre `db.logs`** | GO/CSV `push` (récent **en dernier**) ; Hevy `unshift` (récent **en premier**) ; CLAUDE.md §11 dit « index 0 » | la plupart des lecteurs re-trient ; **F3** ne le fait pas |

Le générateur produit **volontairement** L1 (alterné), L2 (les deux peuplés), L4,
L5 (aurel : RDL en 1er + bench haltères), et documente L3/L6. `db.logs` est trié
**récent en index 0** (convention §11 + chemin import). Un futur test qui vise
**F3** devra produire l'ordre inverse (récent en dernier) — trivial à paramétrer.

---

## 4. PROFILS CRÉÉS — ce que chacun stresse

| Profil | Séances | Ce qu'il stresse (chaque item a caché un bug réel ou est un cas nominal) |
|---|---|---|
| **vierge** | 0 | Cold-start extrême **sans** fallback `defaultDB` ; migrations sur blob minimal ; robustesse au vide (0 NaN/crash). |
| **debutant** | 3 | LP actif ; **plancher `onboardingPRs`** (bestPR = déclaré, jamais dépassé) ; ratios indisponibles (1 lift) ; cold-start SRS. |
| **aurel_like** | 562 | **(A)** trou fenêtre 28j (1re à J-22) → diviseur TDEE ; **(B)** deadlift dans « Ischios Fessiers » ; **(C)** RDL **en 1er** + soulevé barre → predictPR ; **(D)** bench haltères vs barre ; **(E)** warm-ups **2 formats** ; **(F)** rpe null ; **(G)** check-ins partiels pain=null ; **(H)** **deadlift plat 160×3 → e1RM 169 vs bestPR 170**. |
| **retour_apres_pause** | 53 | Return-to-Play (6 mois off) ; **diviseur TDEE** (ancienneté ≫ fenêtre) ; ACWR reprise ; **persistance bestPR** ancien ; badge comeback. |
| **mono_lift** | 15 | Ratios à dénominateur/numérateur **absent** (0 vs null) → **fausse alerte danger** ; bestPR partiel. |
| **donnees_sales** | 7 | Robustesse parsing ; **exclusion séance future** des fenêtres ; dédup ; `getSBDType` sur bruit ; **absence de garde-fou outlier** (315 kg). |
| **extreme_bas** | 8 | Bornes basses TDEE/macros ; force **relative** vs absolue ; barre 15 kg ; cycle → volume. |
| **extreme_haut** | 76 | **Cap facteur d'activité TDEE** (15 séances/sem) ; densité extrême (plusieurs séances/jour) ; alerte articulaire **vraie** ; niveau Elite. |
| **progression_nette** | 18 | **CAS NOMINAL** : predictPR reachable, trend haussier, « objectif atteint » **légitime**, pas de faux spike. |

**Générateur paramétrable** `generateProfile(opts)` : `sessions`, `daysSpan`,
`holes[]`, `holeAtWindowStart` + `firstWindowGap`, `progression` (kg/sem), `bw`,
`start` (charges), `warmupMix`, `nullRpeEvery`, `user`. Permet de dériver de
nouveaux profils sans réécrire de fixture.

---

## 5. ÉCARTS avec les fixtures existantes du repo (cœur de la valeur)

Fixture idéalisée de référence : `tests/audit-seances-betatester.spec.js` →
`buildLogs()` (lignes 57-95) + profils A/B/C. Ce que les fixtures actuelles
**n'ont JAMAIS représenté** :

| Réalité | Fixtures actuelles | Bug réel resté invisible |
|---|---|---|
| **Trous irréguliers**, dont trou en **début de fenêtre 28j** | 20 séances étalées **pile** `i*1.5` j, aucun trou (`buildLogs`) | Diviseur calorique volatile **2870↔2672** (le trou en tête de fenêtre rétrécissait le diviseur). |
| **Warm-ups** présents, **2 formats** | **0 warm-up** ; `isWarmup:false` partout, jamais `setType:'warmup'` | Un filtre `!s.isWarmup` seul comptait les warm-ups typés comme du travail. |
| `series[]` **ET** `repRecords{}` peuplés | ni `series`, ni `repRecords` (juste `allSets` + `maxRM`) | `_exoMaxRealWeight` (repRecords prioritaire) jamais exercé sur son chemin #1. |
| **RDL listé en 1er** + soulevé barre | un seul « Soulevé de Terre » (sans variante, sans « (Barre) ») | `predictPR` `.find()` tombait sur le RDL → mauvais poids (fix v346). |
| **Bench haltères** à côté du barre | jamais | exclusion `!haltere` de `getSBDType` non testée. |
| **Séance titrée sans le lift** (« Ischios Fessiers ») | titres explicites (« Squat », « Bench ») | reconnaissance par titre au lieu du nom d'exo. |
| **rpe null** épars | rpe **toujours** numérique | NaN dans moyennes RPE / e1RM RPE-aware. |
| **e1RM ≠ bestPR réel** (registre 188 vs barre 170) | `bestPR` ≈ `e1rm` cohérents, jamais divergents | Faux « objectif atteint » / « stable autour de 169 » (e1RM gonflé pris pour un record). |
| **Check-ins partiels, pain=null**, dans `readinessHistory` | `todayWellbeing` (**store obsolète** depuis C2-b), jamais `readinessHistory`, jamais pain | `!!pain` faux positif ; `null/2=0` (worst-case silencieux). |
| **Champs onboarding refondus** (`level`/`trainingMode`/`coachingStyle` séparés, `onboardingVersion:4`) | `onboardingProfile` (**champ obsolète**), `programParams.level:'intermediate'` (anglais) | migrations v337 non couvertes ; libellés anglais non canoniques. |
| **Mono-lift / dirty / extrêmes / vraie progression** | absents | ratios à dénominateur absent, outliers, bornes, cas nominal — **rien** de tout ça. |
| **Historique réel ~550 séances** (≈ 1 Mo) | ≤ 20 séances | volumétrie / perf de render / quota localStorage jamais approchés (snapshot aurel = **1023 Ko**, proche du plafond ~5 Mo). |

En une phrase : les fixtures actuelles **étalent l'idéal** ; ces profils
**reproduisent le désordre réel** qui a caché les bugs.

---

## 6. Ce que ces profils permettent de tester (et qui ne l'est pas aujourd'hui)

- **Stabilité du diviseur calorique** face à un trou en tête de fenêtre 28j
  (`aurel_like` → 2672 prouvé ; variante `retour_apres_pause` → historique ≫
  fenêtre). Le test `caloric-target.test.js` le fait déjà **en construisant des
  logs à la main** ; ces profils fournissent un **contexte complet réutilisable**.
- **predictPR** : plateau vs progression réels — `aurel_like` (deadlift plat 169)
  **et** `progression_nette` (reachable +1.76 kg/sem) : la paire panne **+** nominal.
- **RDL-first / bench haltères / titre sans lift** : régression `getSBDType`/
  `predictPR` sur données réalistes (aujourd'hui : `pr-real-records.test.js` teste
  des exos isolés, pas une séance mixte ordonnée RDL-d'abord).
- **Ratios sur lifts absents** (`mono_lift`) : distinguer « 0 loggé » de « faible ».
- **Séance future exclue des fenêtres glissantes** (`donnees_sales`) : garde-fou
  `getLogsInRange` (`l.timestamp <= Date.now()`) — **prouvé** (future à J+3 exclue).
- **Bornes** TDEE/force (`extreme_bas`/`extreme_haut`) et **cap facteur d'activité**.
- **Check-ins partiels** dans le **bon store** (`readinessHistory`) avec `pain=null`.
- **Volumétrie réelle** (aurel 562 séances) : perf de render, quota localStorage.

---

## 7. FINDINGS

> Sévérité : **P0** ment/danger/casse · **P1** chiffre faux/seuil absurde ·
> **P2** incohérence entre surfaces · **P3** cosmétique/ton · **P4** dette invisible.
> Tous les findings ci-dessous sont **prouvés** par le harness ou par lecture directe.

### F1 — Aucun garde-fou outlier / unités : un poids aberrant empoisonne bestPR **et** les ratios · **P1** · confiance : certain · [VOULU? partiel]
`recalcBestPR` (app.js:1759) et `computeStrengthRatiosDetailed` (engine.js:2589)
n'ont **aucune** borne de plausibilité.
```js
// app.js:1765-1766
const w = _exoMaxRealWeight(exo);
if (w > db.bestPR[type]) db.bestPR[type] = w;   // 315 kg accepté tel quel
```
**Preuve** : `donnees_sales` (315 « kg » au squat = 315 lbs mal saisis, PdC 80 kg)
→ `bestPR.squat = 315`, ratio **S/B = 3.93×**, TDEE gonflé. Une seule saisie
lbs-en-kg **empoisonne durablement** records + ratios + charges prescrites.
**Attendu** : borne douce (ex. rejeter un set > 3.5× PdC ou > 1.5× le record
courant sans confirmation) ou flag « à vérifier ». `[VOULU?]` l'absence de garde
est un choix historique, mais l'effet (poison permanent) est un risque réel.

### F2 — Ratios/e1RM retombent sur `bestPR` (plancher `onboardingPRs`) même pour un lift jamais loggé · **P2** (→ P1 si ça déclenche un « danger ») · confiance : certain · [VOULU?]
`getSmoothedE1RM` fallback 3 lit `db.bestPR[liftType]` :
```js
// engine.js:4051-4053
if (bestEwma <= 0 && db.bestPR) {
  var prVal = db.bestPR[liftType];
  if (prVal && prVal > 0) return prVal;
}
```
**Preuve** : `debutant` (ne logge que du squat) → ratios `raw` `bench:50, deadlift:90`
= exactement ses `onboardingPRs`. `mono_lift` (bench only, squat déclaré = 0) →
`squat_bench = 0/150 = 0` → risque de classer « danger S/B < 0.85 » sur un athlète
qui n'a **jamais squatté**. **Attendu** : distinguer « pas de squat loggé »
(ratio **null**, carte muette) de « squat réellement faible ». `[VOULU?]` seeder
les ratios depuis les PR déclarés peut être voulu, mais l'alerte danger sur donnée
absente ne l'est probablement pas.

### F3 — `checkActiveWashoutNeeded` lit `db.logs[0].timestamp` alors que l'ordre de `db.logs` n'est pas garanti · **P2** (potentiel P1) · confiance : probable
```js
// engine.js:2307-2309
var refDate = lastEvent ? new Date(lastEvent.generated_at).getTime()
  : ((db.logs && db.logs.length) ? db.logs[0].timestamp : null);
```
GO/CSV font `db.logs.push` (récent **en dernier**, app.js:32004/10704) ; Hevy fait
`db.logs.unshift` (récent **en premier**, import.js:764). Donc `logs[0]` est le
plus récent **ou** le plus ancien selon la provenance de la dernière séance. Si
`logs[0]` est une séance d'il y a 2 ans (chemin `push`), `weeksSince ≥ 16` →
**faux « washout nécessaire »**. **Attendu** : `Math.max(...logs.map(l=>l.timestamp))`
au lieu de `logs[0]`. Je n'ai pas tracé jusqu'au rendu final la conséquence
utilisateur exacte (d'où « probable » et pas « certain »).

### F4 — `_normalizeCheckinEntry` fait de l'arithmétique sur des champs manquants → 0 (worst) ou NaN · **P2** · confiance : certain
```js
// app.js:689-692
sleep5: e.sleep / 2, energy5: e.energy / 2, motivation5: e.motivation / 2,
fraicheur5: (11 - e.soreness) / 2
```
**Preuve** : entrée partielle `energy:null` → `energy5 = null/2 = 0` (lu comme
**énergie minimale**) ; champ **absent** (`undefined`) → `energy5 = NaN` (sérialisé
`null`, et `NaN <= 2` toujours faux → seuils silencieusement ignorés). Les
check-ins partiels sont **fréquents** (l'utilisateur saute des champs). **Attendu** :
traiter `null/undefined` comme **inconnu** (propager `null`, exclure du calcul),
pas comme « pire état » ni NaN. Aurel (`aurel_like`) contient de tels partiels.

### F5 — Écriture en base **au chargement** (`saveDB()` dans le bloc de boot) · **P4** · confiance : certain · [VOULU?]
```js
// app.js:589-606  (init post-IIFE, one-shot)
if (!db._routineFixed) { … db._routineFixed = true; saveDB(); }
```
Charger n'importe lequel de ces profils (sans `_routineFixed`) **déclenche une
écriture** au boot. Cohérent avec la dette connue « `blockStartDate` muté au
render » (CLAUDE.md §9). `[VOULU?]` correctif one-shot assumé, mais c'est une
écriture au chargement à garder en tête pour l'invariante « render pur ».

### F6 — Écriture orpheline `localStorage.setItem('SBD_HUB', …)` · **P4** · confiance : certain (déjà au backlog)
app.js:4388 écrit sous la clé **`SBD_HUB`** (sans `_V29`), jamais relue. Déjà
signalé CLAUDE.md §11/§17 — re-confirmé ici, non corrigé (hors périmètre).

### F7 — `exo.sets` : NUMBER (logs) vs ARRAY (programme), 3ᵉ format coexistant · **P4** (landmine, pas un bug) · confiance : certain
`createExercise`/`finalize` posent `exo.sets = series.length` (**nombre**), mais
les exos de **programme** (`weeklyPlan.days[].exercises`) portent `sets` = **tableau**
de `{weight,reps,isWarmup}` — cf. la branche `Array.isArray(exo.sets)` (app.js:8442)
et le commentaire « Main lifts: sets is an array ». Aucun bug tant qu'on ne mélange
pas les deux structures, mais **un auteur de fixture qui confond les deux produit
des données cassées**. Le générateur pose correctement un **nombre** pour les logs.

### Gardes-fous confirmés **bons** (non-findings, mais couverture prouvée)
- `getLogsInRange` exclut bien la séance **future** (`donnees_sales`, J+3 exclue).
- `getSBDType` exclut bien **RDL / jambes tendues / bench haltères / typos**
  (`aurel_like` RDL-en-1er donne quand même bestPR.deadlift = 170 via le barre).
- `calcTDEE` mesure le diviseur sur **l'ancienneté de l'historique**, pas la
  fenêtre (`aurel_like` → **2672** malgré le trou J-22, `retour_apres_pause` OK).
- `predictPR` distingue **plateau** (aurel deadlift 169) de **progression réelle**
  (progression_nette, reachable).

---

## 8. À VÉRIFIER CÔTÉ SUPABASE (je suis aveugle à la base — questions précises)

Ces profils sont **synthétiques**. Pour les caler sur la réalité (et pour l'agent
qui a accès data via **Claude.ai**), quelques vérifications utiles — **aucune n'est
bloquante** pour la livraison des fixtures :

1. **bestPR réel d'aurel_br** — CLAUDE.md §15 dit **145/140/170** (barres), mais
   `tests/unit/pr-real-records.test.js` utilise un « profil aurel-like » à
   **148/140/186**. Lequel reflète les vraies barres en base ?
   > Requête suggérée : `select (data->'bestPR') from sbd_profiles where user_id='6e2936e7-de11-4f19-89b1-d1eb5968ba35';`
2. **Densité réelle 28j** — j'ai calé ~20 séances / fenêtre avec 1re à J-22. La
   distribution réelle (jours pleins, trous) ressemble-t-elle à ça ?
   > `select short_date, title from workout_sessions where user_id='6e2936e7-…' and timestamp > now() - interval '28 days' order by timestamp;`
3. **Titres de séances deadlift** — confirmer que le deadlift est bien loggé sous
   des titres SANS « deadlift/soulevé » (« Ischios Fessiers ») et que l'exo est
   « Soulevé de Terre (Barre) ».
   > `select title, jsonb_path_query(data,'$.exercises[*].name') from workout_sessions where user_id='6e2936e7-…' and (data::text ilike '%soulevé de terre%');`
4. **Coexistence RDL + soulevé barre dans une même séance**, et l'**ordre** réel
   (RDL avant/après). Mon fixture met le RDL **en premier** (pire cas) — est-ce
   représentatif ?
5. **Check-ins partiels** — les vraies entrées `data.readinessHistory` ont-elles
   des champs manquants / `pain:null`, ou sont-elles toujours complètes ? (calibre
   la sévérité de **F4**).
   > `select jsonb_array_length(data->'readinessHistory') from sbd_profiles where user_id='6e2936e7-…';` + inspection d'une entrée.
6. **Valeur du registre e1RM deadlift** (`data.exercises['Soulevé de Terre (Barre)'].e1rm`)
   vs bestPR : confirmer la divergence ~188 (capacité) vs 170 (barre) que je
   reproduis.
7. **Outliers en base** (finding F1) — existe-t-il des poids aberrants (> 3.5× PdC)
   déjà stockés chez de vrais users (ex. saisie lbs-en-kg) ?
   > à balayer sur `workout_sessions.data.exercises[*].series[*].weight`.

---

## 9. POINTS BLOQUANTS

**Aucun bloquant.** 9/9 profils chargent via le vrai loadDB (builder **et**
snapshot JSON). Le seul point à remonter est **la divergence `test/` vs `tests/`**
(section 0) : les fixtures sont fonctionnelles et importables par chemin, mais pas
auto-découvertes par `npm test` tant que l'emplacement n'est pas tranché.
Aucune modification applicative, aucun test existant touché, aucun commit, aucun
accès Supabase.
