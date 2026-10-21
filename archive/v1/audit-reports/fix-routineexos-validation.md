# Validation du fix « routineExos ne stocke que des noms » — protocole en 7 étapes

Branche `claude/fix-routineexos-crash` · PR #248 · **non mergée**.
Bancs : `audit/runtime/fix-routineexos-preuve.js` et `audit/runtime/fix-routineexos-contre-preuve.js`
(réseau Supabase intégralement stubbé — aucune donnée réelle touchée).

**Dispositif AVANT/APRÈS** — deux arbres, le *même* script exécuté à l'identique dans chacun :

| | arbre | code |
|---|---|---|
| AVANT | worktree détaché sur `origin/main` (`e1f2977`) | fix absent, banc présent |
| APRÈS | `claude/fix-routineexos-crash` | fix appliqué |

Le script ne référence aucun symbole introduit par le fix (`normalizeExoName`), sans quoi le run
AVANT échouerait pour une raison qui n'est pas le bug.

---

## Honnêteté sur l'ordre des étapes

Le protocole demande repro → test rouge → fix. L'ordre réel a été :

- **Étape 1 faite avant le fix, mais pendant l'audit** : le crash a été découvert et reproduit au
  runtime par `audit/runtime/v2-applyday-e2e.js` (vague 2), pas par une passe dédiée à ce fix.
- **Étape 2 faite après le fix**, puis vérifiée rouge **rétroactivement** sur un worktree propre au
  code d'avant. L'exigence de preuve (« le test échoue sur le code non modifié ») est satisfaite ;
  la chronologie, non. Les runs AVANT ci-dessous ont tous été rejoués pour ce rapport.

---

## Étape 1 — PREUVE AVANT (runtime, code de `main`)

```
 PREUVE RUNTIME — AVANT — code de main (e1f2977), fix absent   (profil : aurel_like, jour : Mercredi)

S0 — CHEMIN NOMINAL (routineExos sain, chaînes)
   db.routineExos[Mercredi] : entrées de type string
   séance : 3 exercice(s) — ["Squat (Barre)","Développé Couché (Barre)","Rowing Barre"]

S1 — LE BUG : bouton « Appliquer ce jour au programme » (wpApplyDay)
   db.routineExos[Mercredi] : entrées de type object
   valeur brute : [{"name":"Squat (Barre)","isPrimary":true,"sets":[{"weight":60,"reps":8,"isWarmu…
   getProgExosForDay rend : ["object","object","object"]
   séance : CRASH — s.toLowerCase is not a function

S2 — SURFACES ADJACENTES, sur ce même db
   renderCorpsTab       : LÈVE — n.toLowerCase is not a function
   renderDash           : rendu OK
   renderProgramViewer  : rendu OK

S3 — ÉDITEUR DE ROUTINE (Réglages) : charger puis SAUVEGARDER
   editingExos[Mercredi] chargé      : ["object","object","object"]
   « [object Object] » à l'écran      : 0
   db.routineExos[Mercredi] réécrit  : ["object","object","object"]
   après sauvegarde de la routine — séance : CRASH — s.toLowerCase is not a function

S4 — BUILDER : re-polluer, reprendre (pbEditExisting) puis SAUVEGARDER
   _pbState.dayExercises["🏊 Récupération / Cardio"] chargé : ["object","object","object"]
   db.routineExos[Mercredi] réécrit            : ["object","object","object"]
   après sauvegarde du builder — séance : CRASH — s.toLowerCase is not a function

   erreurs JS non capturées durant la session 1 : 0

S5 — BLOB DÉJÀ POLLUÉ AU BOOT (utilisateur ayant cliqué « Appliquer » avant le fix)
   db.routineExos[Mercredi] au boot : entrées de type object
   séance : CRASH — s.toLowerCase is not a function
   renderCorpsTab       : LÈVE — n.toLowerCase is not a function
   erreurs JS non capturées durant la session 2 : 0
```

### Ce que ce run corrige dans ma description initiale

J'ai écrit dans la PR que `renderSettingsRoutineEditor` et `pbEditExisting` « affichaient
[object Object] ». **C'est faux, mesuré : 0 occurrence à l'écran.** Les deux rendus protègent déjà
le libellé (`app.js:3893` et `app.js:13923` : `typeof e === 'string' ? e : e.name`).

Le vrai défaut est ailleurs, et il est pire : ce qui n'est pas protégé, c'est la **sauvegarde**.
`saveRoutine` (3982) et `pbSaveManualProgram` (13995) réécrivent tel quel ce que l'écran a chargé →
**le passage dans l'éditeur re-propage les objets**, y compris quand l'utilisateur y va justement
pour réparer son programme. S3 et S4 le montrent : réécrit `["object","object","object"]`, séance
toujours en CRASH après sauvegarde.

Le crash de `renderCorpsTab` (`n.toLowerCase`) est la portée croisée déjà connue de l'audit.

---

## Étape 2 — TEST ROUGE (sur le code non modifié)

`tests/unit/routine-exos-types.test.js`, exécuté dans le worktree AVANT.

**RED A — arbre AVANT tel quel** → `Tests: 17 failed, 1 passed, 18 total`

Ce chiffre est cependant **trompeur** : `getProgExosForDay` / `normalizeExoName` / `matchExoName`
n'étant pas encore exportés par `engine.js`, une partie des échecs vient de l'import, pas du
comportement. J'ai donc isolé :

**RED B — arbre AVANT + la seule ligne d'export ajoutée** (aucun changement de comportement) :

```
    ✕ wpApplyDay : routineExos[jour] ne contient que des chaînes
    ✕ wpApplyAll : tous les jours non-repos, chaînes uniquement
    ✕ un exercice sans nom exploitable est écarté, pas écrit tel quel
    ✓ matchExoName sur un objet nu lève TypeError (la cause du crash)
    ✕ après wpApplyDay, ce que lit getProgExosForDay traverse matchExoName
    ✕ un blob DÉJÀ pollué (profil existant) est réparé à la lecture
    ✓ jour absent → tableau vide
    ✓ routineExos absent → tableau vide
    ✓ format legacy chaîne → split conservé (non-régression)
    ✓ tableau de chaînes → inchangé (non-régression)
    ✕ objet nu (ni tableau ni chaîne) → tableau vide, pas de crash
    ✓ ne renvoie jamais une référence sur le tableau stocké
    ✕ chaîne → trim
    ✕ objet exercice → son nom
    ✕ objet sans nom → chaîne vide (filtrée en aval)
    ✕ null / undefined / nombre → chaîne vide
    ✕ renderSettingsRoutineEditor : editingExos ne contient que des chaînes
    ✕ pbEditExisting : dayExercises ne contient que des chaînes
Tests:       12 failed, 6 passed, 18 total
```

Lecture honnête de ces 12 rouges :
- **8 échouent pour la raison comportementale visée** — les 3 écrivains, les 2 de la chaîne
  écrivain→lecteur→`matchExoName`, le `.split` sur objet nu, et les 2 lecteurs.
- **4 échouent parce que `normalizeExoName` n'existe pas encore** (helper nouveau).
- **6 passent avant ET après** : ce sont les gardes de non-régression (split legacy, tableau de
  chaînes inchangé, absence, pas d'aliasing) et le garde-fou `TypeError`. Ils *doivent* passer des
  deux côtés — ils vérifient ce que le fix ne doit pas casser.

Message d'échec exact du test central :

```
  ● la chaîne écrivain → lecteur → matchExoName ne crashe plus › un blob DÉJÀ pollué (profil existant) est réparé à la lecture

    expect(received).toEqual(expected) // deep equality

    - Expected  -  1
    + Received  + 11

      Array [
    -   "Squat (Barre)",
    +   Object {
    +     "name": "Squat (Barre)",
    +     "sets": Array [ Object { "weight": 100 } ],
    +   },
        "Presse à Cuisses",
    +   Object { "sets": Array [] },
      ]
```

---

## Étape 3 — LE FIX

```diff
--- a/js/engine.js
+++ b/js/engine.js
+function normalizeExoName(e) {
+  if (typeof e === 'string') return e.trim();
+  if (e && typeof e === 'object' && typeof e.name === 'string') return e.name.trim();
+  return '';
+}
+
 function getProgExosForDay(day) {
   const saved = (db.routineExos || {})[day];
   if (!saved) return [];
-  return Array.isArray(saved) ? saved.filter(Boolean) : saved.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
+  if (Array.isArray(saved)) return saved.map(normalizeExoName).filter(Boolean);
+  if (typeof saved === 'string') return saved.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
+  return [];
 }

--- a/js/app.js   (wpApplyDay 27379 · wpApplyAll 27391)
-  db.routineExos[day]   = dayData.exercises;
+  db.routineExos[day]   = dayData.exercises.map(normalizeExoName).filter(Boolean);
-  db.routineExos[d.day] = d.exercises;
+  db.routineExos[d.day] = d.exercises.map(normalizeExoName).filter(Boolean);

--- a/js/app.js   (renderSettingsRoutineEditor 3855 · pbEditExisting 15020)
-  editingExos[day] = savedExos[day] ? (Array.isArray(…) ? […] : ….split(…)) : [];
+  editingExos[day] = getProgExosForDay(day);
-  var exos = (db.routineExos && db.routineExos[day]) ? db.routineExos[day] : [];
+  var exos = getProgExosForDay(day);
```

Plus la ligne d'export de test dans `engine.js` et le bump `CACHE_NAME` → `trainhub-v378`.

---

## Étape 4 — TEST VERT

```
###### GREEN — branche, suite ciblée
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

---

## Étape 5 — PREUVE APRÈS (mêmes scénarios, mêmes termes)

```
 PREUVE RUNTIME — APRÈS — branche claude/fix-routineexos-crash, fix appliqué   (profil : aurel_like, jour : Mercredi)

S0 — CHEMIN NOMINAL (routineExos sain, chaînes)
   db.routineExos[Mercredi] : entrées de type string
   séance : 3 exercice(s) — ["Squat (Barre)","Développé Couché (Barre)","Rowing Barre"]

S1 — LE BUG : bouton « Appliquer ce jour au programme » (wpApplyDay)
   db.routineExos[Mercredi] : entrées de type string
   valeur brute : ["Squat (Barre)","Développé Couché (Barre)","Rowing Barre"]…
   getProgExosForDay rend : ["string","string","string"]
   séance : 3 exercice(s) — ["Squat (Barre)","Développé Couché (Barre)","Rowing Barre"]

S2 — SURFACES ADJACENTES, sur ce même db
   renderCorpsTab       : rendu OK
   renderDash           : rendu OK
   renderProgramViewer  : rendu OK

S3 — ÉDITEUR DE ROUTINE (Réglages) : charger puis SAUVEGARDER
   editingExos[Mercredi] chargé      : ["string","string","string"]
   « [object Object] » à l'écran      : 0
   db.routineExos[Mercredi] réécrit  : ["string","string","string"]
   après sauvegarde de la routine — séance : 3 exercice(s) — […]

S4 — BUILDER : re-polluer, reprendre (pbEditExisting) puis SAUVEGARDER
   _pbState.dayExercises["🏊 Récupération / Cardio"] chargé : ["string","string","string"]
   db.routineExos[Mercredi] réécrit            : ["string","string","string"]
   après sauvegarde du builder — séance : 3 exercice(s) — […]

   erreurs JS non capturées durant la session 1 : 0

S5 — BLOB DÉJÀ POLLUÉ AU BOOT
   db.routineExos[Mercredi] au boot : entrées de type object
   séance : 3 exercice(s) — ["Squat (Barre)","Développé Couché (Barre)","Rowing Barre"]
   renderCorpsTab       : rendu OK
   erreurs JS non capturées durant la session 2 : 0
```

### Comparaison directe

| | AVANT | APRÈS |
|---|---|---|
| S1 séance après « Appliquer » | **CRASH `s.toLowerCase is not a function`** | **3 exercices** |
| S2 `renderCorpsTab` | **LÈVE `n.toLowerCase is not a function`** | **rendu OK** |
| S3 routineExos réécrit par l'éditeur | `["object","object","object"]` | `["string","string","string"]` |
| S4 routineExos réécrit par le builder | `["object","object","object"]` | `["string","string","string"]` |
| S5 blob déjà pollué, séance | **CRASH** | **3 exercices** |
| S0 chemin nominal | 3 exercices | **3 exercices (identique)** |

---

## Étape 6 — NON-RÉGRESSION

- **Suite complète** : `Test Suites: 52 passed` · `Tests: 835 passed, 835 total`.
- **`node -c`** : `js/app.js`, `js/engine.js`, `service-worker.js` — OK.
- **Chemin nominal, testé au runtime** (pas supposé) : S0, `routineExos` déjà sain en chaînes →
  **3 exercices, mêmes noms, avant comme après**.
- **Surfaces adjacentes** : S2 — `renderCorpsTab` passe de *lève* à *rendu OK* ; `renderDash` et
  `renderProgramViewer` rendus OK dans les deux runs (ils étaient déjà indemnes).
- **Autre profil** : les mêmes S0/S1 rejoués sur le profil `debutant` → AVANT 3 exercices puis
  CRASH ; APRÈS 3 exercices puis 3 exercices. Aucun chemin de ce fix n'est conditionné au profil
  (ni genre, ni niveau, ni tier, ni réseau) — `normalizeExoName`, `getProgExosForDay` et les deux
  écrivains ne contiennent aucun branchement de ce type.
- **0 erreur JS non capturée** dans les deux sessions, avant comme après.

---

## Étape 7 — REVUE ADVERSARIALE

Banc dédié : `audit/runtime/fix-routineexos-contre-preuve.js`, joué sur les deux arbres.

### 1. Quel cas mon fix ne couvre PAS ?

**Attaque A2, 9 entrées tordues** — `{name:42}`, `{name:{}}`, `[['Squat (Barre)']]`, `null`, `0`,
`''`, `'   '`, `{name:'  Squat (Barre)  '}`, `'Développé Couché (Barre)'` :

| | AVANT | APRÈS |
|---|---|---|
| `getProgExosForDay` | rend 6 entrées dont 3 objets et un `'   '` | `["Squat (Barre)","Développé Couché (Barre)"]` |
| démarrage séance | **CRASH** | **2 exercices** |

Couvert : tout ce qui n'est pas une chaîne ou un `{name: <chaîne>}` est **écarté**, pas transmis.

**Ce qui n'est pas couvert, et que j'assume :**
- **Un nom légitime est perdu si son porteur est mal formé** — `{name: 42}` ou `[['Squat']]`
  disparaissent au lieu de lever. Assumé : aucun écrivain du dépôt ne produit ces formes (inventaire
  exhaustif ci-dessous), et échouer bruyamment sur le blob d'un utilisateur serait pire que d'ignorer
  une entrée absurde.
- **Tableau vide / jour absent / `routineExos` absent** → `[]`, comme avant (tests dédiés, verts des
  deux côtés).
- **Concurrence** : `wpApplyAll` écrit dans le callback de `showModal`. Si `db.weeklyPlan` était
  remplacé entre l'ouverture de la modale et la confirmation, on écrirait le nouveau plan. Inchangé
  par le fix, et sans conséquence de type.
- **Doublons** : ni avant ni après, `routineExos` ne dédoublonne. Non traité, hors sujet.

### 2. Quelles données EXISTANTES sont déjà dans le mauvais état ? Le lecteur les tolère-t-il ?

Oui — c'est **la raison d'être du lecteur défensif**. S5 le prouve sur un blob pollué **au boot**
(l'utilisateur qui a cliqué « Appliquer » avant le fix) : AVANT **CRASH** + `renderCorpsTab` lève ;
APRÈS **3 exercices** + Corps rendu OK, sans aucune intervention de l'utilisateur.

**Mais le fix ne NETTOIE pas le stockage** — attaque A4 :

```
   en mémoire  : ["object"]
   PERSISTÉ    : ["object"]   ← ce qui part aussi dans le blob de sync
   relu par getProgExosForDay : ["Squat (Barre)"]        (APRÈS)
```

Les objets restent donc dans `SBD_HUB_V29` et dans le blob de sync tant que l'utilisateur ne
repasse pas par l'éditeur ou le builder (qui, eux, réécrivent des chaînes — S3/S4). C'est toléré
partout, mais ce n'est pas propre. **Recommandation signalée, non appliquée** (voir plus bas).

### 3. Qu'est-ce que je casse pour quelqu'un dont ça marchait ?

- **Cas nominal** (`routineExos` en chaînes, l'immense majorité) : S0, **3 exercices avant et après,
  mêmes noms**. Rien ne change — `normalizeExoName` sur une chaîne rend la chaîne (`trim`).
- **Format legacy chaîne** (`'Squat; Bench'`) : branche `split` **inchangée**, test de
  non-régression vert des deux côtés.
- **Autre profil** : rejoué sur `debutant`, identique.
- **Hors-ligne / premium / genre** : aucun de ces chemins n'est conditionné à la session, au tier ou
  au profil.
- **Le seul écart de comportement volontaire** : `filter(Boolean)` écarte désormais les exercices
  sans nom exploitable, là où l'ancien `[...savedExos[day]]` de l'éditeur gardait les entrées
  falsy. Une entrée sans nom n'a aucun consommateur (elle ne matche rien) ; l'écarter réduit un
  compteur d'exercices dans un cas déjà cassé. Assumé.
- **Un `trim()` est ajouté** aux noms : `'  Squat  '` devient `'Squat'`. `matchExoName` normalisait
  déjà les espaces, donc aucun matching ne change ; seul l'affichage brut est plus propre.

### 4. Mon fix masque-t-il le problème au lieu de le corriger ?

**Partiellement, et c'est délibéré — mais il faut le dire.** Le fix a deux moitiés de nature
différente :

- **Côté écrivain, c'est la cause** : `wpApplyDay`/`wpApplyAll` produisaient le mauvais type. Corrigé
  à la source, pas contourné. Aucun `try/catch` n'a été ajouté nulle part.
- **Côté lecteur, c'est bien une tolérance** : elle rend inoffensif un mauvais type au lieu de le
  faire échouer. Sans elle, les blobs déjà écrits resteraient cassés (S5) — donc elle est
  nécessaire. Son coût réel : **un futur écrivain qui écrirait des objets ne crasherait plus, il
  fonctionnerait silencieusement.** Le garde est alors uniquement le test des écrivains, qui ne
  couvre que les deux corrigés.

Contre-mesure retenue : l'inventaire **exhaustif** des écritures de `db.routineExos` (grep sur
`js/`), pour vérifier qu'aucun autre écrivain ne produit d'objets :

| ligne | écrivain | produit |
|---|---|---|
| `app.js:3183` | template (`EXO_DB[id].name`) | chaînes ✔ |
| `app.js:3982` | `saveRoutine` ← `editingExos` (corrigé) | chaînes ✔ |
| `app.js:13995` | `pbSaveManualProgram` ← `_pbState.dayExercises` | chaînes ✔ (alimenté par `pbEditExisting` corrigé, ou par `addProgExo`/`pbAddExoToDay` qui poussent `val.trim()`) |
| `app.js:14082` | génération guidée | chaînes ✔ (déjà normalisé) |
| `app.js:27379` | `wpApplyDay` | **corrigé** ✔ |
| `app.js:27391` | `wpApplyAll` | **corrigé** ✔ |
| `app.js:15038` | reset programme | `null` ✔ |

`db.manualProgram` est écrit (13990) mais jamais relu dans `_pbState` ; le builder « custom » utilise
`_customBuilderState`, qui n'écrit pas `routineExos`. **Inventaire clos : plus aucun écrivain d'objets.**

### 5. Si je devais démontrer que ce fix est mauvais, comment m'y prendrais-je ?

Quatre angles, tous instruits :

**a) « Le fix détruit de l'information. »** C'est l'attaque la plus forte : `weeklyPlan.days[].exercises`
porte `sets` (charges, reps) et `isPrimary` ; les réduire à des noms jetterait la prescription du
Coach. Si `routineExos` était censé porter la séance complète, mon fix cimenterait une perte.
**Réfuté au runtime (A1)** — les charges sont lues depuis `weeklyPlan`, pas depuis `routineExos`
(`_goDoStartWorkout` résout `planDay` séparément, app.js:28486) :

```
   AVANT le clic (routineExos = chaînes) :        APRÈS le clic « Appliquer ce jour » :
      Squat (Barre) → 60kg×8, 115kg×5,               Squat (Barre) → 60kg×8, 115kg×5,
                      115kg×5, 115kg×5                               115kg×5, 115kg×5
      Développé Couché (Barre) → 95kg×5, 95kg×5      Développé Couché (Barre) → 95kg×5, 95kg×5
```

Charges **identiques au kilo près**. Aucune information utile n'est perdue : `routineExos` est un
index de noms, la prescription vit ailleurs.

**b) « Le fix est dans la mauvaise couche : il fallait une migration. »** L'argument tient en partie
(A4 : le blob persisté reste pollué). Mais une migration **seule** ne protégerait ni les blobs
arrivant du cloud, ni un écrivain futur — alors que le lecteur défensif, lui, couvre les deux. La
bonne réponse est « les deux », et la migration est signalée ci-dessous plutôt qu'ajoutée ici
(scope minimal, un chantier à la fois).

**c) « Les tests ne prouvent rien parce qu'ils ont été écrits après. »** Vrai sur la chronologie,
faux sur la preuve : RED B les exécute sur un arbre propre au code d'avant, 12 rouges dont 8
comportementaux, avec le diff d'assertion. Et les 6 verts des deux côtés sont, par construction,
des gardes de non-régression.

**d) « Le `filter(Boolean)` masque une anomalie amont. »** Si `weeklyPlan` produisait des exercices
sans nom, on les ferait disparaître silencieusement au lieu de le signaler. Assumé : le générateur
`wpGenerate*` nomme toujours ses exercices ; et un exercice anonyme n'est de toute façon consommable
par personne.

---

## Ce que j'ai signalé sans agir

1. **Aucune migration du blob déjà pollué** (A4). Un `migrateDB()` d'une ligne nettoierait le
   stockage et le blob de sync :
   `if (db.routineExos) Object.keys(db.routineExos).forEach(d => { const v = db.routineExos[d]; if (Array.isArray(v)) db.routineExos[d] = v.map(normalizeExoName).filter(Boolean); });`
   Non appliqué : hors du périmètre « écrivain + lecteur » demandé, et le lecteur défensif rend le
   symptôme inoffensif entre-temps. À trancher.
2. **`routineExos` n'est pas signé par `_computeDataHash`** (cf. `audit/CHAMPS-NON-SIGNES.md`) : une
   correction locale de `routineExos` peut ne pas déclencher de push cloud. C'est exactement le
   fix 2 de la tranche 1 — pas touché ici.
3. **`app.js:27894` (`todayExos` du récap GO)** lit encore `db.routineExos[today]` en direct. Le
   libellé est protégé, mais sur le format legacy **chaîne**, `exoCount = todayExercises.length ||
   todayExos.length` compte les **caractères** et affiche « 31 exercices prévus ». Pré-existant,
   sans rapport avec le crash. Non touché.
4. **Le split du format legacy casse les noms contenant une virgule** (A3, identique avant/après) :
   `'Développé couché, prise serrée'` → `["Développé couché","prise serrée"]`. Pré-existant, branche
   inchangée par le fix. Non touché.
5. **`renderExoEditor` (3893) et `renderProgramBuilder` (13923) portent chacun un fallback
   `typeof e === 'string' ? e : e.name`** devenu inutile côté données saines. Ce sont les vestiges
   qui masquaient le bug à l'écran (0 « [object Object] ») pendant que la sauvegarde le propageait.
   Nettoyables une fois la migration faite. Non touché.
6. **Rappel post-bêta déjà noté** : `showProfilSub('tab-profil-badges')` fait
   `innerHTML = gameEl.innerHTML` → duplication de tout l'onglet Jeux dans le DOM du Profil → ids en
   double.

---

## Verdict

Bug reproduit au runtime avant le fix, disparu au runtime après, dans les mêmes termes
(**CRASH → 3 exercices**, **Corps lève → Corps rendu OK**). Rouge/vert démontré sur arbre propre.
835 tests verts. Quatre tentatives de mise en défaut instruites, dont une (« perte des charges »)
réfutée au runtime et une (« pas de migration ») **retenue et signalée**.

**PR #248 non mergée — vérification device par Aurélien avant merge.**
