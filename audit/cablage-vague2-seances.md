# Audit de câblage — Vague 2 : onglet SÉANCES (Coach · Plan · GO · Log · Analyse)

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Méthode identique à la vague 1 (`audit/cablage-vague1-profil-v2.md`), étendue — voir « inventaire ».

## CONTRÔLE D'EXHAUSTIVITÉ

> **Phase 1 : 54 éléments inventoriés. Phase 2 : 54 verdicts. Phase 5 : 54 statuts runtime.**
> Vérifié mécaniquement (le générateur de table lève une exception sur tout élément sans verdict).

| Périmètre | Bornes |
|---|---|
| Markup statique | `index.html:2488` → `index.html:2538` (`<div id="tab-seances">` → `</div>`) — **50 lignes seulement** |
| Markup généré | `renderGoTab`, `renderProgrammeV2`, `renderSessionCards`, `renderMesoSwipe`, `renderCoachTab`, `renderAnalyseTab` (js/app.js) |
| Conteneur runtime | `#tab-seances`, énuméré dans **14 états** (5 sous-vues × profils × séance active/terminée/repos/deload) |

### Changement de méthode, imposé par la surface

En vague 1, le markup statique portait 160 des 176 éléments. Ici c'est l'inverse :

| Source | Éléments |
|---|---|
| markup statique (`index.html`) | **18** |
| **généré au runtime** | **36** |
| **total** | **54** |

Un `grep 'id="'` sur `index.html` aurait donc manqué **67 %** de la surface. L'inventaire est
désormais produit **par le DOM réel** (`audit/runtime/inventaire-dom.js`) : l'app est exécutée dans
14 états et les ids réellement présents sont énumérés, puis unis.

**Règle de comptage, appliquée uniformément** : les ids générés en boucle (`grind-btn-0-1`,
`wrap-sc2-3-1782…`) sont regroupés en UNE famille, avec leur cardinalité observée notée `×n`. Sans
cette règle, le contrat N=N=N dépendrait du nombre de séances de la fixture. Les ids aléatoires
(`sg<random>`, `ectip<random>` — dégradés et infobulles SVG, app.js:10404-10405) sont regroupés de même.

**Ce que je n'ai pas pu vérifier** : le widget de fréquence cardiaque (`go-fc-widget`, #31) dépend
d'un capteur Bluetooth / Garmin, hors banc. Aucune donnée Supabase consultée.

---

## LES CONSTATS

### G1 — 🔴 « Appliquer ce jour au programme » casse le démarrage de séance ET l'onglet Corps

**Reproduit de bout en bout.** Deux boutons réels de la vue Plan écrivent des **objets** dans un
tableau que le reste du code lit comme des **chaînes** :

```js
// app.js:27379 — bouton « Appliquer ce jour au programme » (app.js:27347)
db.routineExos[day] = dayData.exercises;      // ← des OBJETS {name, sets, …}
// app.js:27391 — bouton « Appliquer toutes les suggestions » (app.js:27369)
db.routineExos[d.day] = d.exercises;          // ← idem
```
alors que les deux autres écrivains y mettent des chaînes :
```js
// app.js:3984 — Réglages → Mon Programme (saveRoutine)
db.routineExos[day] = editingExos[day] || [];            // noms
// app.js:14084 — génération guidée
db.routineExos[d.day] = d.exercises.map(e => typeof e === 'string' ? e : (e && e.name) || 'Exercice');
```

`getProgExosForDay` (engine.js:890) rend le tableau **tel quel**, puis `_goDoStartWorkout` (app.js:28513)
passe chaque entrée à `matchExoName`, qui appelle `s.toLowerCase()`.

**Mesuré, dans une même session :**

| Étape | `db.routineExos[jour]` | Démarrage de séance |
|---|---|---|
| état sain (chaînes) | `["Squat (Barre)"]` | ✔ `Squat (Barre)` avec **5 séries** |
| après « Appliquer ce jour » | `[{"name":"Squat (Barre)","isPrimary":true,"sets":[…]}]` | ✘ **CRASH** `s.toLowerCase is not a function` |

Trace : `norm (engine.js:1008) ← matchExoName (engine.js:1015) ← app.js:28513 ← _goDoStartWorkout (28507)`.

**Conséquences mesurées** :
- `activeWorkout` reste à **0 exercice** (titre présent, contenu vide) ;
- un brouillon partiel est auto-sauvegardé dans `SBD_ACTIVE_WORKOUT` (1 exercice) ;
- **`renderCorpsTab` casse aussi** — `n.toLowerCase is not a function` — parce que l'onglet Corps
  appelle `getProgExosForDay` (app.js:16687) pour son libellé de type de jour. **Un bouton de la vague 2
  casse une surface de la vague 1.**
- `renderDash` et `renderProgramViewer` survivent (vérifié).

**Confiance : certain** — mécanique tracée et exécutée. *Je n'ai pas mesuré la fréquence d'usage réelle
de ces deux boutons.*

### G2 — ⚠️ La séance est construite depuis `routineExos`, pas depuis le plan

C'est la mécanique du constat « les séries prescrites n'arrivent pas dans la séance ».
`_goDoStartWorkout` (app.js:28464) itère sur `getProgExosForDay(jour)` — donc sur **`db.routineExos`** —
et ne va chercher dans `db.weeklyPlan` que **les séries**, retrouvées **par nom** (`matchExoName`).

Le plan n'est donc jamais la source de vérité de *ce qui compose* la séance : il ne fournit que le
détail des exercices dont le nom figure déjà dans `routineExos`.

**5 scénarios exécutés, même jour, même fixture :**

| # | `routineExos[jour]` | Plan | Séance obtenue |
|---|---|---|---|
| A | absent | absent | **0 exercice** |
| B | `[]` | Squat, **7 séries** (4 échauffements + 3 travail) | **0 exercice** — le plan est ignoré |
| C | `["Squat (Barre)"]` | idem | ✔ **7 séries**, échauffements compris |
| D | `["Squat avec pause (barre)"]` | `"Squat (Barre)"`, 3 séries | ✘ **1 série vide `0 kg × 0`** |
| E | `["Squat (Barre)"]` | `sets: 4` (nombre, format hérité) | 4 séries à 0 kg *(normalisé par `migrateWeeklyPlanSets`)* |

Le cas **D** est celui d'un utilisateur dont le coach prescrit une variante (« Squat avec pause (barre) »,
nom canonique du dépôt) que `matchExoName` ne rapproche pas de l'entrée du plan : repli historique, puis
**une série vide**. Le cas **B** est plus large : un plan complet et correct produit une séance **vide**
si `routineExos` ne contient rien pour ce jour.

**Confiance : certain** sur la mécanique. **Ce que je n'affirme pas** : laquelle de ces branches
correspond au cas vécu en device — cela dépend du contenu réel de `routineExos` et de `weeklyPlan` du
compte, qui est une question Supabase (voir fin de rapport).

### G3 — ⚠️ Le sous-onglet GO n'a pas de pilule

La barre de navigation (`index.html:2490-2496`) comporte **4 pilules** — Coach, Plan, Log, Analyse —
pour **5** sous-vues. `s-go` n'en a aucune ; il n'est atteignable que par les **9 appels programmés**
de `showSeancesSub('s-go')` (app.js:3829, 9030, 9107, 9643, 11459, 11534, 12821, 16896, 17132).

À rapprocher de `db.user.navMode` — écrit une seule fois par la migration (app.js:236, `= 'A'`) et
**jamais lu** (donnée morte relevée en vague 1) : le commentaire du code dit « Option A : séance inline
sur Maison, onglet GO masqué ». Le masquage est donc **codé en dur**, pas piloté par le champ prévu
pour ça. Contrairement à `tab-profil-badges` (vague 1, F2 : zéro appelant), GO **est** atteint.

### G4 — La séance en cours ne quitte jamais l'appareil

**Vérifié à l'exécution** :

| | |
|---|---|
| `activeWorkout` est-il dans `db` ? | **non** (variable globale) |
| Où est-il persisté ? | `localStorage['SBD_ACTIVE_WORKOUT']` — **hors `db`** |
| Est-il dans le blob de sync ? | **non** (`_buildSyncedBlob` part de `db`) |

Une séance interrompue (batterie, crash, changement d'appareil) n'existe que sur le téléphone. À la
**fin** de séance, en revanche, tout est correct : `db.logs` passe de 562 à 563, la signature de sync
**change**, le brouillon local est effacé. *Fait, pas jugement.*

### G5 — Le pont plan → séance (PR #246) fonctionne

Vérifié au runtime sur un plan portant toutes les annotations :
```
Squat (Barre) → {coachNote:"📈 +2.5 kg cette semaine", gripNote:"prise large",
                 tempoEcc:3, isPrimary:true, isDoubleProgression:true}
```
Les 5 champs traversent `_goCarryPlanAnnotations` et arrivent sur la carte GO. **Non-régression
confirmée.**

---

## PHASE 2 — 54 VERDICTS

| # | Élément | Source | Champ db | Écrit par | Lu par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|---|
| 1 | `tab-seances` | markup | — | — | showTab 4255 | oui | ➖ conteneur | ✔ visible |
| 2 | `s-coach` | markup | — | showSeancesSub 4007 | renderCoachTab 4019 | oui | ✅ CÂBLÉ | ✔ visible |
| 3 | `coachHistoBadge` | markup | db.reports[].read | updateCoachHistoBadge 19098 | idem | si rapport non lu | ✅ CÂBLÉ | ✔ conditionnel |
| 4 | `coach-today` | markup | — | renderCoachToday | — | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `coach-history` | markup | db.reports | renderCoachHistory | — | oui | ✅ CÂBLÉ | ✔ visible |
| 6 | `s-plan` | markup | — | showSeancesSub 4007 | renderProgrammeV2 | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `programmeV2Content` | markup | db.weeklyPlan | renderProgrammeV2 | — | oui | ✅ CÂBLÉ | ✔ visible |
| 8 | `programBuilderContent` | markup | db.customProgramTemplate | pbStartCustomBuilder 12628 | — | mode custom | ✅ CÂBLÉ | ✔ conditionnel |
| 9 | `s-go` | markup | — | showSeancesSub 4007 | — | **sans pilule** (9 appels programmés) | ⚠️ DIVERGENT — cf. G3 | ✔ visible |
| 10 | `goIdleView` | markup | db.weeklyPlan + routineExos | renderGoTab | — | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `goActiveView` | markup | activeWorkout | renderGoTab | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 12 | `s-log` | markup | db.logs | showSeancesSub | — | oui (défaut) | ✅ CÂBLÉ | ✔ visible |
| 13 | `prevWeekBtn` | markup | — | navigateWeek(-1) | — | oui | ✅ CÂBLÉ | ✔ visible |
| 14 | `weekRangeLabel` | markup | db.logs | renderWeekSessions | — | oui | ✅ CÂBLÉ | ✔ visible |
| 15 | `weekIndexLabel` | markup | db.logs | renderWeekSessions | — | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `nextWeekBtn` | markup | — | navigateWeek(1) | — | oui | ✅ CÂBLÉ | ✔ visible |
| 17 | `weekSessionsContainer` | markup | db.logs | renderWeekSessions | — | oui | ✅ CÂBLÉ | ✔ visible |
| 18 | `sc-cards-wrap` | **runtime** | db.logs | renderSessionCards | — | oui | ✅ CÂBLÉ | ✔ visible |
| 19 | `wrap-sc2-<n>-<ts>` ×13 | **runtime** | db.logs[i] | renderSessionCards | — | oui | ✅ CÂBLÉ | ✔ visible |
| 20 | `ectip<alea>` ×13 | **runtime** | — | app.js:10405 (infobulle SVG) | — | survol | ➖ COSMÉTIQUE (interne SVG) | ✔ visible |
| 21 | `sg<alea>` ×13 | **runtime** | — | app.js:10404 (dégradé SVG) | — | n/a | ➖ COSMÉTIQUE (defs SVG, 0×0 par nature) | ✔ conditionnel |
| 22 | `menu-sc2-<n>-<ts>` ×13 | **runtime** | — | menu contextuel de carte | — | sur clic ⋯ | ✅ CÂBLÉ | ✔ conditionnel |
| 23 | `det-sc2-<n>-<ts>` ×13 | **runtime** | db.logs[i].exercises | renderSessionCards | — | sur dépliage | ✅ CÂBLÉ | ✔ visible |
| 24 | `s-analyse` | markup | db.logs | showSeancesSub | renderAnalyseTab | oui | ✅ CÂBLÉ | ✔ visible |
| 25 | `meso-swipe-wrap` | **runtime** | db.weeklyPlan.currentBlock | renderMesoSwipe | — | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `meso-progress-bar` | **runtime** | currentBlock.week/totalWeeks | renderMesoSwipe | — | oui | ✅ CÂBLÉ | ✔ visible |
| 27 | `meso-prev-btn` | **runtime** | — | navigation méso | — | oui | ✅ CÂBLÉ | ✔ visible |
| 28 | `meso-nav-label` | **runtime** | currentBlock | renderMesoSwipe | — | oui | ✅ CÂBLÉ | ✔ visible |
| 29 | `meso-next-btn` | **runtime** | — | navigation méso | — | oui | ✅ CÂBLÉ | ✔ visible |
| 30 | `meso-slide-content` | **runtime** | db.weeklyPlan.days | renderMesoSwipe | — | oui | ✅ CÂBLÉ | ✔ visible |
| 31 | `go-fc-widget` | **runtime** | db.garminHealth / Bluetooth | renderGoTab | — | capteur FC | ❓ NE SAIS PAS (capteur hors banc) | ⊘ non testable |
| 32 | `go-t-recap` | **runtime** | — | goSwitchView('recap') | — | fin de séance | ✅ CÂBLÉ | ✔ visible |
| 33 | `go-t-debrief` | **runtime** | — | goSwitchView('debrief') | — | fin de séance | ✅ CÂBLÉ | ✔ visible |
| 34 | `go-recap-view` | **runtime** | activeWorkout | renderGoRecap | — | fin de séance | ✅ CÂBLÉ | ✔ visible |
| 35 | `go-debrief-section` | **runtime** | db.reports (débrief) | app.js:27995 | goSwitchView 28367 | onglet Débrief | ✅ CÂBLÉ | ✔ conditionnel |
| 36 | `go-plan-chev` | **runtime** | — | goTogglePlan 28382 | — | vue au repos | ✅ CÂBLÉ | ✔ conditionnel |
| 37 | `go-plan-body` | **runtime** | db.weeklyPlan.days[].exercises | goTogglePlan 28381 | — | vue au repos | ✅ CÂBLÉ | ✔ conditionnel |
| 38 | `goTimerDisplay` | **runtime** | activeWorkout.startTime | goStartSessionTimer 28620 | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 39 | `goCntTonnage` | **runtime** | activeWorkout.exercises[].sets | renderGoTab | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 40 | `goCntExos` | **runtime** | activeWorkout.exercises | renderGoTab | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 41 | `goCntSets` | **runtime** | activeWorkout.exercises[].sets | renderGoTab | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 42 | `why-btn-squat_barre_` | **runtime** | — | renderWhyButton | openCoachQuestion | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 43 | `why-answer-squat_barre_` | **runtime** | réponse Gemini (premium) | askCoachAI | — | sur clic | ✅ CÂBLÉ | ✔ conditionnel |
| 44 | `plates-<n>` ×3 | **runtime** | db.user.barWeight | calculateur de galettes | — | sur clic | ✅ CÂBLÉ | ✔ conditionnel |
| 45 | `grind-btn-<n>-<n>` ×11 | **runtime** | set.grind | carte de série | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 46 | `abandoned-btn-<n>-<n>` ×11 | **runtime** | set.abandoned | carte de série | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 47 | `rpe-val-<n>-<n>` ×9 | **runtime** | set.rpe | carte de série | TRIMP, wpCalcE1RM | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 48 | `rpe-legend-<n>-<n>` ×9 | **runtime** | set.rpe | t('rpe') app.js:19 | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 49 | `why-btn-d_velopp_couch_barre_` | **runtime** | — | renderWhyButton | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 50 | `why-answer-d_velopp_couch_barre_` | **runtime** | réponse Gemini | askCoachAI | — | sur clic | ✅ CÂBLÉ | ✔ conditionnel |
| 51 | `why-btn-rowing_barre` | **runtime** | — | renderWhyButton | — | séance en cours | ✅ CÂBLÉ | ✔ visible |
| 52 | `why-answer-rowing_barre` | **runtime** | réponse Gemini | askCoachAI | — | sur clic | ✅ CÂBLÉ | ✔ conditionnel |
| 53 | `goRestDisplay` | **runtime** | activeWorkout.restTimer | goStartRestTimer 30215 | — | repos en cours | ✅ CÂBLÉ | ✔ visible |
| 54 | `goRestProgress` | **runtime** | activeWorkout.restTimer | goStartRestTimer | — | repos en cours | ✅ CÂBLÉ | ✔ visible |

**Décompte** : ✅ CÂBLÉ 49 · ⚠️ DIVERGENT 1 · ➖ COSMÉTIQUE 3 · ❓ NE SAIS PAS 1 = **54**.
Runtime : ✔ visible 42 · ✔ conditionnel 11 · ⊘ non testable 1 = **54**. Aucune ligne sans statut.

> Note : les verdicts 🔴 de cette vague ne portent pas sur un *élément d'interface* mais sur la
> **chaîne de données** qui les alimente (G1, G2) — d'où leur absence de la colonne « Verdict »,
> qui qualifie l'élément, et leur présence en constats détaillés.

---

## PHASE 3 — CROISEMENT INVERSE

Les stores que cette surface devrait exposer :

| Store | UI pour voir | UI pour modifier | Consommateurs | Constat |
|---|---|---|---|---|
| `db.weeklyPlan.days[].exercises[].sets` | ✅ vue Plan | ✅ régénération, « Appliquer » | `_goDoStartWorkout` (par nom) | ⚠️ n'entre en séance que via `routineExos` (G2) |
| **`db.routineExos`** | ❌ **aucune vue directe** | ✅ 4 écrivains (2 formats — G1) | `getProgExosForDay` → GO, Corps, Dash | ⚠️ **source réelle de la séance, invisible à l'utilisateur** |
| `db.routine` (libellés de jour) | ✅ vue Plan | ✅ Réglages → Mon Programme | `getRoutine`, titre de séance | ✅ |
| `activeWorkout` | ✅ vue GO | ✅ saisie de séries | fin de séance → `db.logs` | ⚠️ hors `db`, hors sync (G4) |
| `db.logs` | ✅ Log + Analyse | partiel (édition/suppression) | partout | ✅ signé par le hash |
| `db.reports` (débriefs) | ✅ Coach → Historique | ❌ | badge, débrief GO | ✅ |
| `db.weeklyPlan.currentBlock` | ✅ méso-swipe | ❌ (dérivé) | phase, `PHASE_MULT` | ✅ |
| `db.generatedProgram` | ❌ | ❌ | source de `routineExos` (14084) | ⚠️ intermédiaire invisible |
| `db.customProgramTemplate` / `customProgramBackups` | partiel (builder) | ✅ builder | mode custom | ✅ |

**Le point le plus net** : `db.routineExos` **décide du contenu de chaque séance** et n'a **aucune
surface de consultation**. L'utilisateur voit le *plan* ; l'app exécute `routineExos`. Quand les deux
divergent (G2), rien à l'écran ne le signale.

---

## PHASE 5 — VÉRIFICATION RUNTIME

Banc identique à la vague 1 (`audit/runtime/`) : Chromium préinstallé via `@playwright/test` 1.56,
serveur statique maison, **réseau intégralement stubbé**, Service Worker bloqué, fixtures tatouées.

### 5a — visibilité
14 états explorés. 11 éléments jamais visibles au repos ; **tous** se révèlent par leur action :

| Élément | Action | Résultat |
|---|---|---|
| `go-plan-body` / `go-plan-chev` | `goTogglePlan()` (vue au repos) | 0 px → **120 px** ✔ |
| `why-answer-*` (×3) | clic sur `why-btn-*` | `display:none` → **VISIBLE** ✔ |
| `plates-<n>` | clic (bascule `style.display` inline) | → **VISIBLE 21 px** ✔ |
| `go-debrief-section` | `goSwitchView('debrief')` | → **VISIBLE** ✔ |
| `coachHistoBadge` | rapport non lu injecté + `updateCoachHistoBadge()` | → **VISIBLE** ✔ |
| `menu-sc2-*` | menu contextuel de carte | conditionnel ✔ |
| `programBuilderContent` | mode programme « custom » | conditionnel ✔ |

**Aucun rendu inatteignable dans cette vague** — contrairement à la vague 1 (4 cas).

### 5b/5c — aller-retour d'une séance complète
Saisie réelle `117,5 kg × 5 @ RPE 8` sur la première série de travail, puis fin de séance :

| | |
|---|---|
| Séance démarrée | `Squat (Barre):8`, `Développé Couché (Barre):3`, `Rowing Barre:3` |
| Série saisie | `{weight:117.5, reps:5, rpe:8, plannedWeight:115}` ✔ |
| `db.logs` | 562 → **563** ✔ |
| Brouillon `SBD_ACTIVE_WORKOUT` | **effacé** après la fin ✔ |
| Ordre de `db.logs` | décroissant (plus récent en tête) — **vérifié** |

### 5d — signature de sync
| Écriture | Signature | Écritures réseau (delta) |
|---|---|---|
| Fin de séance (`db.logs` +1) | ✔ **CHANGE** | 38 |
| Séance **en cours** (`activeWorkout`) | — hors `db`, donc hors signature | 0 |

**Aucun nouveau champ non signé découvert dans cette vague** : les écritures de Séances passent toutes
par `db.logs` (signé). La séance en cours est un cas distinct — elle n'est pas *non signée*, elle est
**hors périmètre de synchronisation** (G4). Reporté dans `audit/CHAMPS-NON-SIGNES.md` à ce titre.

---

## Angles morts de cette vague

- **`go-fc-widget`** (#31) : capteur Bluetooth / Garmin, non instrumentable sur le banc.
- **Les 14 états** couvrent les sous-vues, les profils et les phases, mais pas toutes les combinaisons
  (express mode, `removeAccessories`, superset, mode calisthenics).
- **Le rendu visuel** n'est pas jugé : présence, visibilité, persistance et consommation seulement.
- **Aucun device Android réel.**

## À VÉRIFIER CÔTÉ SUPABASE

1. **G2** — pour les comptes réels, `data.routineExos` et `data.weeklyPlan.days[].exercises[].name`
   coïncident-ils ? `select user_id, jsonb_object_keys(data->'routineExos') from sbd_profiles;` puis
   comparaison des noms avec `data->'weeklyPlan'->'days'`.
2. **G1** — `data.routineExos[<jour>][0]` est-il une **chaîne** ou un **objet** pour chaque compte ?
   C'est le marqueur direct de l'exposition au crash.
   `select user_id, jsonb_typeof((data->'routineExos'-> 'Lundi') -> 0) from sbd_profiles;`
3. **G2/D** — des noms de variantes (« Squat avec pause (barre) », « … avec pause ») figurent-ils dans
   `routineExos` alors que le plan porte le nom de base ?
