# Validation de la migration `db.routineExos` — protocole en 7 étapes

Branche `claude/fix-routineexos-crash` · commit séparé du fix du crash · **non poussé**
tant que le reset de `main` n'est pas confirmé.

Banc : `audit/runtime/migration-routineexos-preuve.js`, exécuté à l'identique sur deux arbres —
worktree détaché sur `87d7611` (migration absente) et l'arbre de travail (migration appliquée).
Réseau Supabase intégralement stubbé.

---

## Pourquoi cette migration passe AVANT le fix 2 (hash)

`routineExos` n'est pas signé par `_computeDataHash` aujourd'hui, mais il **est** dans le blob poussé
(`_buildSyncedBlob` = tout `db` moins `logs`). Le fix 2 le rendra signé, donc poussable de manière
fiable. Sans nettoyage préalable, on pousserait les objets vers Supabase : on propagerait la
corruption au lieu de la contenir en local.

Et le boot seul ne suffit pas — **mesuré** :

```
AVANT, M5 — adoption d'un blob cloud pollué (_applyCloudBlob, supabase.js:337)
   avant adoption (local propre) : ["string","string"]
   après adoption               : ["object","object"]
   repartirait au cloud          : [{"name":"Squat (Barre)","isPrimary":true,…
```

`db = cloudBlob` en OVERWRITE écrase le db migré au boot. D'où les **trois** points d'appel :
boot (`app.js`), `_applyCloudBlob` (`supabase.js:337`), merge de pull (`supabase.js:992`).

---

## Étapes 1 & 5 — preuve runtime AVANT / APRÈS

| scénario | AVANT | APRÈS |
|---|---|---|
| **M1** blob pollué au boot | mémoire `["object","object"]` · persisté `["object","object"]` | **`["string","string"]`** · persisté **`["string","string"]`** |
| **M2** blob déjà propre | `["string","string"]`, inchangé | `["string","string"]`, **inchangé (no-op)** |
| **M3** legacy chaîne | `"Développé couché, prise serrée"` intacte | **identique — non convertie** |
| **M4** blob mixte | `["string","object","object"]` | **`["string","string"]`** (l'entrée sans nom retirée) |
| **M5** adoption cloud polluée | après adoption `["object","object"]` · **repartirait au cloud : objets** | après adoption **`["string","string"]`** · **repartirait : `["Squat (Barre)","Rowing Barre"]`** |
| **M6** §6.3 carte GO, legacy chaîne | **LÈVE `todayExos.map is not a function`** | **« 2 exercices prévus »** |

Note factuelle sur M1 : la migration **n'appelle pas `saveDB`** ; le persisté devient propre parce
que le boot sauvegarde de toute façon ensuite. C'est ce qui est mesuré, pas une garantie du code.

### §6.3 — c'était plus grave que je ne l'avais dit

J'avais annoncé « le compteur affiche le nombre de caractères ». **Faux** : `exoCount` n'est jamais
atteint, `todayExos.map` lève avant — donc `buildGoIdleHtml()` lève et **toute la carte GO ne se rend
pas** sur le format legacy chaîne. Le passage par `getProgExosForDay` corrige le crash ; le compte
affiché (2) reflète le split legacy du lecteur, défaut pré-existant inchangé.

---

## Étapes 2 & 4 — rouge puis vert

`tests/unit/routine-exos-migration.test.js`, exécuté sur le worktree au code d'avant :

```
Tests:       18 failed, 2 passed, 20 total
```

Les 2 verts d'avance sont volontaires : « le nom à virgule serait détruit par une conversion »
(caractérisation du lecteur actuel, vraie des deux côtés) et « `buildGoIdleHtml` existe ».

Après la migration : **`Tests: 20 passed, 20 total`**.

---

## Étape 3 — le fix

```js
// js/engine.js — à côté de normalizeExoName
function normalizeRoutineExosInPlace(d) {
  if (!d || !d.routineExos || typeof d.routineExos !== 'object') return false;
  let change = false;
  Object.keys(d.routineExos).forEach(function(jour) {
    const v = d.routineExos[jour];
    if (!Array.isArray(v)) return;                 // chaîne legacy / autre : intact
    const norm = v.map(normalizeExoName).filter(Boolean);
    if (norm.length !== v.length || norm.some(function(x, i) { return x !== v[i]; })) {
      d.routineExos[jour] = norm;
      change = true;
    }
  });
  return change;
}
```

Trois appels : `app.js` (bloc top-level, avec les migrations `_migratedFreezeV*`),
`supabase.js:_applyCloudBlob`, `supabase.js` merge de pull. Plus `buildGoIdleHtml` → `getProgExosForDay`.
`CACHE_NAME` → `trainhub-v379`.

> **`migrateDB()` n'existe pas** (0 occurrence dans `js/`). Les migrations réelles sont des blocs
> top-level d'`app.js`. CLAUDE.md §6 décrit un pattern disparu — à corriger dans le fichier vivant.

---

## Étape 6 — non-régression

- **Suite complète** : `Test Suites: 53 passed` · `Tests: 855 passed, 855 total`.
- **`node -c`** : `app.js`, `engine.js`, `supabase.js`, `service-worker.js` — OK.
- **No-op prouvé sur blob propre** (M2) : contenu inchangé, et en unitaire la **même référence**
  de tableau est conservée — aucune réécriture, donc aucun push parasite.
- **Le fix du crash rejoué** (banc `fix-routineexos-preuve.js`) : S0 nominal 3 exercices,
  S1 3 exercices, S2 Corps rendu OK, S5 blob pollué → **type `string` dès le boot** (c'est la
  différence visible : la migration a nettoyé avant même la lecture) et 3 exercices.
- **0 erreur JS non capturée** dans tous les runs.

---

## Étape 7 — revue adversariale

**1. Quel cas la migration ne couvre PAS ?**
- **Le 4e point de remplacement de `db`** : `app.js:1342`, `db = sanitizeDB(_restoreData)`
  (restauration d'une sauvegarde). Non couvert — et de toute façon **déjà cassé** : `sanitizeDB`
  n'est définie nulle part (P1 signalé, tranche suivante). Un blob restauré depuis un fichier
  pourrait donc rester pollué ; le lecteur défensif le tolère.
- **Valeur ni tableau ni chaîne** (objet nu à la place du tableau du jour) : laissée telle quelle,
  le lecteur rend `[]`. Assumé : aucun écrivain n'en produit, et réécrire une forme inconnue serait
  plus risqué que l'ignorer.
- **Format legacy chaîne** : non touché, décision assumée (voir 5c).
- **Concurrence / état transitoire** : la migration est synchrone, au boot avant tout pull, et sur
  l'adoption avant la persistance. Pas de fenêtre.

**2. Quelles données existantes sont déjà dans le mauvais état ?**
C'est l'objet même du commit. Mesuré : M1 (blob local pollué), M4 (mixte), M5 (blob cloud pollué
venu d'un appareil pas à jour). Les trois sont nettoyés. Le lecteur défensif reste en place comme
seconde ligne pour le point 1 non couvert.

**3. Qu'est-ce que je casse pour quelqu'un dont ça marchait ?**
- Blob propre : **no-op mesuré**, même référence, aucun octet réécrit (M2 + test unitaire).
- Legacy chaîne : **intacte octet pour octet** (M3 + test).
- Le fix précédent : rejoué, identique.
- **La seule perte réelle, assumée** : les entrées sans nom exploitable (`{sets:[]}`, `null`,
  `{name:42}`) sont **supprimées**. Elles s'affichaient « Exercice » dans l'éditeur de routine.
  Elles ne matchent aucun exercice et ne sont consommables par personne — mais c'est une
  suppression de donnée utilisateur, minuscule et réelle. Test dédié qui la documente.
  Alternative écartée : les remplacer par `'Exercice'` comme le fait `app.js:14084` — ça
  fabriquerait une ligne qui ne matche rien et que l'utilisateur devrait supprimer à la main.

**4. La migration masque-t-elle le problème ?**
Non — c'est l'inverse : c'est la correction de la **donnée**, là où le lecteur défensif ne
corrigeait que le **symptôme**. Les deux sont gardés volontairement (ceinture + bretelles),
justifiés par le point d'entrée non couvert (restauration) et par un éventuel appareil tiers.

**5. Comment démontrer que cette migration est mauvaise ?**
- **a) « Un no-op qui n'en est pas un. »** Vrai et à dire : `'  Squat  '` est considéré comme
  *à changer* (rognage) → réécriture + `true`. « Déjà propre » signifie donc « déjà rogné ». Sans
  conséquence sur le matching (`matchExoName` normalise les espaces), mais ce n'est pas
  littéralement zéro écriture sur tous les blobs.
- **b) « Elle ne couvre pas la restauration. »** Exact, cf. point 1 — assumé et signalé.
- **c) « Il fallait aussi convertir le legacy chaîne, sinon la migration est à moitié faite. »**
  C'est l'attaque la plus séduisante et elle est **fausse** : convertir figerait le split sur
  virgule. Mesuré — `'Développé couché, prise serrée'` est lu comme 2 entrées, mais **stocké
  entier** ; le convertir détruirait le nom sans retour possible. Une migration ne doit pas rendre
  irréversible une perte qui ne l'est pas encore.
- **d) « Elle tourne à chaque boot. »** Coût : 7 jours × quelques exercices, comparaison de
  chaînes. Négligeable, et l'idempotence est testée.
- **e) « Elle masquera un futur écrivain fautif. »** Même critique que pour le lecteur défensif.
  Contre-mesure : l'inventaire des 7 sites d'écriture de `routineExos` est clos (rapport du fix
  précédent, §4) — aucun ne produit d'objets.

---

## Signalé sans agir

1. 🔴 **`sanitizeDB` est appelée (`app.js:1342`) et définie nulle part** — 0 occurrence dans `js/`
   et `index.html`, alors qu'`import.js:63` porte « NE PAS modifier ces structures sans mettre à
   jour `sanitizeDB()` ». La restauration d'une sauvegarde lève un `ReferenceError`. C'est le filet
   de sécurité utilisateur. **En tête de la tranche suivante**, comme demandé.
2. **`migrateDB()` n'existe plus** — CLAUDE.md §6 à corriger.
3. **Le split legacy sur virgule** reste un défaut du lecteur (non touché, volontairement).
4. **Les fallbacks `typeof e === 'string' ? e : e.name`** de `renderExoEditor` (3893) et
   `renderProgramBuilder` (13923) sont maintenant morts côté données saines — nettoyables.
5. **`routineExos` toujours non signé** par `_computeDataHash` : c'est le fix 2, prochain.

---

## Verdict

Les trois états demandés sont couverts et mesurés : **pollué → nettoyé**, **propre → no-op**,
**legacy chaîne → intacte**. Le mixte aussi. Le trou du boot-seul est fermé sur les deux chemins
d'adoption cloud, avec la preuve runtime que sans ça le blob pollué repartait vers Supabase.
855 tests verts. Une perte de donnée assumée et documentée. Un point d'entrée non couvert, signalé.

**Non poussé — en attente de la confirmation du reset de `main`.**
