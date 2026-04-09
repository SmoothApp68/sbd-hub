# DIAGNOSTIC COMPLET — Générateur de Programme Training Hub

**Date :** 2026-04-09
**Fichiers audités :** `js/app.js`, `js/engine.js`, `index.html`
**Auteur :** Audit automatisé (Claude)

---

## 1.1 — Audit de `generateProgram()` (Onboarding)

### 1.1a — Couverture de l'EXO_DB

**Liste complète des exercices dans EXO_DB** (app.js:186–231) :

| ID | Nom | Matériel | Muscle | Nb alts |
|---|---|---|---|---|
| `squat` | Squat barre | salle | Jambes | 4 (Goblet, Squat halt, Bulgare, BW) |
| `leg_press` | Leg Press | salle | Jambes | 3 (Hack Squat, Fentes, Step-up) |
| `fente` | Fentes avant | salle, halteres | Jambes | 3 (Bulgares, Step-up, Marchées) |
| `leg_curl` | Leg Curl couché | salle | Jambes | 3 (RDL halt, Hip Thrust, Good Morning) |
| `rdl` | Romanian Deadlift | salle, halteres | Jambes | 3 (Leg Curl, Hip Thrust, Pont fessier) |
| `hip_thrust` | Hip Thrust | salle, halteres | Jambes | 3 (Pont fessier, Leg Curl, Kickback) |
| `deadlift` | Soulevé de terre | salle | Jambes/Dos | 3 (Roumain halt, Trap bar, Good Morning) |
| `leg_ext` | Leg Extension | salle | Jambes | 3 (Bulgare, Sissy Squat, Step-up) |
| `mollet` | Mollets debout | salle, halteres | Mollets | 2 (Mollets assis, Mollets escalier) |
| `bench` | Bench Press barre | salle | Pecs | 3 (Dév halt, Dév incliné, Pompes lestées) |
| `bench_halt` | Développé haltères | halteres, salle | Pecs | 3 (Bench barre, Pompes, Dév incliné halt) |
| `incline_bench` | Développé incliné barre | salle | Pecs | 2 (Dév incliné halt, Pompes pieds surélevés) |
| `ecarte` | Écarté poulie basse | salle | Pecs | 2 (Écarté halt, Pompes diamant) |
| `pompe` | Pompes | maison, halteres, salle | Pecs | 3 (Diamant, Pieds surélevés, Bench) |
| `dips_pec` | Dips (pecs) | salle, maison | Pecs | 2 (Dév décliné halt, Pompes pieds surélevés) |
| `row_barre` | Rowing barre | salle | Dos | 3 (Rowing halt 1 bras, Rowing TRX, Tirage horiz) |
| `traction` | Tractions | salle, maison | Dos | 3 (Lat Pulldown, Traction élastique, Rowing inversé) |
| `lat_pull` | Lat Pulldown | salle | Dos | 3 (Tractions, Traction élastique, Tirage poulie haute) |
| `row_halt` | Rowing haltère 1 bras | halteres, salle | Dos | 3 (Rowing barre, Rowing inversé, Tirage horiz) |
| `rowing_inv` | Rowing inversé | maison, salle | Dos | 3 (Rowing halt, Tractions, Lat Pulldown) |
| `face_pull` | Face Pull | salle | Épaules/Dos | 2 (Oiseau halt, Élév postérieure) |
| `shrug` | Shrugs barre | salle, halteres | Dos | 2 (Shrugs halt, Élév épaules) |
| `ohp` | Développé militaire barre | salle | Épaules | 3 (Dév milit halt, Arnold, Pompes Pike) |
| `ohp_halt` | Développé militaire haltères | halteres, salle | Épaules | 3 (Arnold, Dév milit barre, Pompes Pike) |
| `elev_lat` | Élévation latérale | halteres, salle | Épaules | 2 (Élév lat câble, Upright Row) |
| `elev_front` | Élévation frontale | halteres, salle | Épaules | 2 (Élév front câble, Dév milit halt) |
| `curl_barre` | Curl barre | salle, halteres | Biceps | 3 (Curl halt, Curl marteau, Curl câble) |
| `curl_halt` | Curl haltères | halteres, salle | Biceps | 3 (Curl barre, Curl marteau, Curl concentré) |
| `skull` | Skull Crusher | salle, halteres | Triceps | 3 (Ext triceps câble, JM Press, Dips triceps) |
| `tri_cable` | Extension triceps câble | salle | Triceps | 3 (Skull Crusher, Dips triceps, Ext triceps halt) |
| `dips_tri` | Dips triceps | salle, maison | Triceps | 3 (Ext triceps câble, Skull Crusher, Kickback) |
| `crunch` | Crunch | maison, salle, halteres | Abdos | 3 (Crunch câble, Relevé genoux, Ab Wheel) |
| `planche` | Planche | maison, salle, halteres | Abdos | 2 (Gainage latéral, Planche toucher) |
| `releve_genoux` | Relevé de genoux suspendu | salle, maison | Abdos | 2 (Relevé jambes sol, Crunch) |
| `russian_twist` | Russian Twist | maison, halteres, salle | Abdos | 2 (Rotation câble, Crunch oblique) |
| `cardio_hiit` | HIIT / Intervalles | maison, salle, halteres | Cardio | 3 (Course, Vélo, Corde à sauter) |
| `cardio_liss` | Cardio modéré (LISS) | maison, salle, halteres | Cardio | 3 (Marche rapide, Natation, Elliptique) |

**Total : 37 exercices** dans EXO_DB.

#### Groupes musculaires orphelins ?

⚠️ **Problème mineur** — Les groupes musculaires suivants n'ont AUCUN exercice dédié comme entrée principale dans EXO_DB :
- **Avant-bras** : aucun curl poignet / farmer walk. Pas bloquant car c'est un muscle secondaire travaillé via curls et rows.
- **Lombaires** : aucun hyperextension / good morning en entrée principale. Le `deadlift` couvre partiellement (muscle "Jambes/Dos") mais pas spécifiquement. Good Morning apparaît uniquement comme alternative du `leg_curl`.

Les groupes **Biceps**, **Triceps**, **Épaules**, **Abdos**, **Mollets** ont tous au moins un exercice dédié. ✅

#### Exercices dans BLOCS mais pas dans EXO_DB (ou l'inverse) ?

✅ **OK** — Tous les IDs utilisés dans les BLOCS (lignes 671–716) existent dans EXO_DB. Vérification exhaustive :
- BLOCS force/masse/seche/recompo/maintien/reprise : tous les IDs (`bench`, `ohp`, `incline_bench`, `tri_cable`, `deadlift`, `row_barre`, `lat_pull`, `traction`, `curl_barre`, `face_pull`, `squat`, `leg_press`, `rdl`, `mollet`, `leg_curl`, `elev_lat`, `crunch`, `russian_twist`, `bench_halt`, `ecarte`, `dips_pec`, `row_halt`, `curl_halt`, `shrug`, `fente`, `hip_thrust`, `leg_ext`, `ohp_halt`, `pompe`, `rowing_inv`, `planche`, `cardio_hiit`, `cardio_liss`) existent dans EXO_DB.

⚠️ **Problème mineur** — Exercices dans EXO_DB jamais utilisés dans aucun BLOC :
- `dips_tri` (Dips triceps) — jamais dans un BLOC. L'utilisateur ne le verra pas dans un programme généré.
- `elev_front` (Élévation frontale) — idem.
- `releve_genoux` (Relevé genoux suspendu) — idem.
- `skull` (Skull Crusher) — idem.

Ces 4 exercices sont "dormants" : ils existent dans la DB mais ne sont jamais sélectionnés par le générateur.

#### Couverture des alternatives par matériel ?

⚠️ **Problème mineur** — Certains exercices `mat:['salle']` n'ont PAS d'alternative `maison` :
- `face_pull` : alts = Oiseau haltères, Élév postérieure (haltères seulement, pas de maison)
- `elev_lat` : alts = Élév lat câble (salle), Upright Row (salle) — **aucune alt maison**
- `elev_front` : alts = Élév front câble (salle), Dév milit halt (haltères) — **aucune alt maison**

→ Un utilisateur "maison" qui aurait `elev_lat` dans son programme (via BLOCS force/masse) verrait `filtMat()` retourner l'ID original sans substitution, car aucune alt maison n'existe. La fonction `filtMat` (ligne 303–318) retourne l'ID original si aucune alt compatible n'est trouvée → l'exercice EXO_DB[id].mat ne contient pas 'maison' → **l'exercice sera affiché avec un nom "salle" même si l'user est en mode maison**.

---

### 1.1b — Logique des BLOCS

La fonction `generateProgram()` enrichie (app.js:646–763) définit des BLOCS locaux `B` pour CHAQUE objectif. **Contrairement à la version simple (lignes 250–296) qui est aussi dans le fichier mais ne semble pas appelée en production** (la version enrichie ligne 646 reçoit tous les paramètres dont `duration`, `injuries`, `level`).

#### BLOCS par objectif :

**force** (ligne 672–680) : `push`, `pull`, `legs`, `full_a`, `full_b`, `sbd`, `faibles` — ✅ 7 blocs complets

**masse** (ligne 681–689) : `push`, `pull`, `legs`, `full_a`, `full_b`, `upper`, `lower` — ✅ 7 blocs complets

**seche** (ligne 690–696) : `push`, `pull`, `legs`, `full_a`, `cardio` — ✅ 5 blocs (pas de full_b ni upper/lower, mais suffisant avec le mix cardio)

**recompo** (ligne 697–704) : `push`, `pull`, `legs`, `full_a`, `full_b`, `cardio` — ✅ 6 blocs

**maintien** (ligne 705–710) : `full_a`, `full_b`, `full_c`, `cardio` — ✅ 4 blocs (full body only, pas de split PPL, cohérent avec l'objectif)

**reprise** (ligne 711–716) : `full_a`, `full_b`, `cardio` — ✅ 3 blocs (exercices doux, sans squat ni deadlift dans full_a)

#### Objectifs sans blocs / fallback silencieux ?

✅ **OK** — Les 6 objectifs possibles (`force`, `masse`, `seche`, `recompo`, `maintien`, `reprise`) ont TOUS des blocs définis explicitement dans `B` (ligne 671–716).

Le fallback `const Bg = B[g1] || B.maintien` (ligne 718) ne s'active que si `g1` ne correspond à aucune clé. Avec les 6 IDs de `obGoals` (ligne 173–179), ce cas ne peut arriver sauf corruption.

✅ **OK** — Recompo, maintien et reprise ont bien leurs propres blocs, ils ne retombent PAS sur force.

#### `filtSafe()` peut-il retourner un tableau vide ?

❌ **Bug critique** — **Oui**, `filtSafe()` peut retourner un tableau vide.

Code (ligne 653–655) :
```js
function filtSafe(ids, m) {
  return filtMat(ids.filter(id => !excluded.has(id)), m).slice(0, exosN);
}
```

Scénario de reproduction : Utilisateur avec blessures `epaules` + `dos` + `genoux`, objectif `force`, fréquence 3j.

Le bloc `legs` force contient : `['squat','leg_press','rdl','mollet','leg_curl']`
- `squat` → exclu par `genoux`
- `leg_press` → exclu par `genoux`
- `rdl` → exclu par `dos`
- `mollet` → OK ✅
- `leg_curl` → OK ✅

→ Résultat : 2 exercices sur 5 survivent. Ce n'est pas vide ici.

Mais le bloc `push` force contient : `['bench','ohp','incline_bench','tri_cable','elev_lat']`
- `bench` → non exclu (poignets ne sont pas cochés)
- `ohp` → exclu par `epaules`
- `incline_bench` → exclu par `epaules`
- `tri_cable` → OK
- `elev_lat` → exclu par `epaules`

→ 2 exos survivent (`bench`, `tri_cable`).

Le vrai risque d'un tableau vide apparaît si on combine `epaules` + `poignets` :
- Bloc `push` force : `bench` (exclu poignets), `ohp` (exclu épaules), `incline_bench` (exclu épaules), `tri_cable` (OK), `elev_lat` (exclu épaules) → **1 seul exo** (`tri_cable`).
- Pas totalement vide, mais un jour "Push — Force" avec un seul exercice (Extension triceps câble) est absurde.

Si en plus le matériel est `maison` et que `tri_cable` n'a pas d'alt maison → `filtMat` retourne l'ID quand même (pas vide mais incohérent).

**Conséquence si vide** : Le jour aurait `exos: []`, `exosSets: []`, mais `isRest: false` et un label "Push — Force". L'utilisateur verrait un jour d'entraînement avec 0 exercice.

---

### 1.1c — Répartition des splits

#### Séquences par fréquence (app.js:720–727) pour chaque objectif :

**FORCE** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, full_b |
| 3 | legs, push, pull |
| 4 | legs, push, pull, sbd |
| 5 | legs, push, pull, sbd, faibles |
| 6 | legs, push, pull, sbd, faibles, full_a |

**MASSE** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, full_b |
| 3 | push, pull, legs |
| 4 | upper, lower, push, pull |
| 5 | push, pull, legs, upper, lower |
| 6 | push, pull, legs, push, pull, legs |

**SECHE** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, cardio |
| 3 | full_a, cardio, full_a |
| 4 | push, pull, legs, cardio |
| 5 | push, pull, legs, cardio, full_a |
| 6 | push, pull, legs, cardio, full_a, cardio |

**RECOMPO** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, full_b |
| 3 | push, pull, legs |
| 4 | full_a, full_b, cardio, full_a |
| 5 | push, pull, legs, cardio, full_b |
| 6 | push, pull, legs, cardio, full_b, cardio |

**MAINTIEN** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, full_b |
| 3 | full_a, full_b, full_c |
| 4 | full_a, full_b, full_c, cardio |
| 5 | full_a, full_b, full_c, cardio, full_a |
| 6 | full_a, full_b, full_c, cardio, full_a, full_b |

**REPRISE** :
| Fréq | Jours |
|---|---|
| 1 | full_a |
| 2 | full_a, full_b |
| 3 | full_a, cardio, full_b |
| 4 | full_a, cardio, full_b, cardio |
| 5 | full_a, cardio, full_b, cardio, full_a |
| 6 | full_a, cardio, full_b, cardio, full_a, cardio |

#### Équilibre musculaire ?

⚠️ **Problème mineur** — En **force 3j** (legs/push/pull), la distribution est :
- **Legs** : squat, leg_press, rdl, mollet, leg_curl → 5 exos jambes
- **Push** : bench, ohp, incline_bench, tri_cable, elev_lat → pecs + épaules + triceps
- **Pull** : deadlift, row_barre, lat_pull, traction, curl_barre, face_pull → dos + biceps

Le **dos** est travaillé 2× (deadlift en legs/dos + pull complet) vs les **pecs** 1× (push uniquement). C'est en fait un avantage pour le dos, qui est correct en powerlifting. ✅

⚠️ **Problème mineur** — En **sèche 3j** : `full_a, cardio, full_a`. Le même bloc `full_a` est répété 2× dans la semaine ! Les exercices sont identiques les deux jours (`squat, pompe, rowing_inv, crunch, cardio_hiit`). **Aucune variation**, l'utilisateur fait exactement la même séance Lundi et Vendredi.

⚠️ **Problème mineur** — En **masse 6j** : `push, pull, legs, push, pull, legs`. Les blocs J1 et J4 sont identiques (même `push`), idem J2/J5 et J3/J6. Un vrai PPL 6j devrait avoir des variations volume/intensité (PPL1 lourd / PPL2 léger). Ici c'est du copier-coller.

⚠️ **Problème mineur** — En **recompo 4j** : `full_a, full_b, cardio, full_a`. full_a est répété 2× sur 4 jours. full_b n'apparaît qu'1×. Déséquilibré.

#### Jours avec 0 exercice après filtrage ?

Voir section 1.1b ci-dessus : c'est possible en théorie avec des blessures multiples combinées à un matériel restrictif, mais rare en pratique. Le code ne vérifie pas ce cas.

---

### 1.1d — Gestion du niveau

#### `filtLevel()` (app.js:658–664)

Exclut pour les débutants (`complexity === 'low'`) : `deadlift`, `squat`, `ohp`, `skull`, `rdl`.

⚠️ **Problème mineur** — L'exclusion est brutale mais le remplacement est **implicite** : quand ces IDs sont filtrés, les exercices restants dans le bloc prennent leur place. Par exemple :
- Bloc `legs` force débutant : `['squat','leg_press','rdl','mollet','leg_curl']` → après filtLevel : `['leg_press','mollet','leg_curl']`
- Bloc `full_a` force débutant : `['squat','bench','row_barre','ohp','curl_barre']` → après filtLevel : `['bench','row_barre','curl_barre']` — **seulement 3 exos** pour un full body, dont aucun mouvement jambes !

❌ **Bug critique** — Un débutant en force full body (1-2j/sem) n'a **aucun exercice jambes** dans `full_a` : squat et ohp sont exclus, il reste bench, row_barre, curl_barre. Le programme full body n'a pas de jambes. Il faudrait que `leg_press` ou `fente` remplace automatiquement `squat`.

⚠️ **Problème mineur** — `skull` est exclu pour les débutants mais **n'apparaît dans aucun BLOC** (c'est un exercice "dormant" dans EXO_DB). Cette exclusion est sans effet.

#### `getSetsReps()` (app.js:621–643)

Schémas par combinaison niveau × objectif :

| Niveau | Force/Recompo | Masse/Sèche | Maintien/Reprise |
|---|---|---|---|
| debutant | 2×6 | 2×15 | 2×12 |
| intermediaire | 3×5 | 3×12 | 3×9 |
| avance | 4×3 | 4×10 | 4×6 |
| competiteur | 4×2 | 4×8 | 4×4 |

✅ **OK** — Les combinaisons sont globalement cohérentes :
- Débutant force = 2×6 → correct, volume bas, reps modérées pour apprendre
- Compétiteur masse = 4×8 → correct, volume haut + reps hypertrophie
- Débutant masse = 2×15 → ⚠️ 2 séries à 15 reps est très faible en volume pour de l'hypertrophie. 3×12 serait plus standard.

⚠️ **Problème mineur** — Un compétiteur en force fait 4×2 : **seulement 8 reps totales**. C'est très peu de volume, même pour un peak. En force-athlétique on verrait plutôt 5×3 ou 4×3 en phase d'intensification. Mais c'est une question de philosophie d'entraînement.

---

### 1.1e — Gestion des blessures

#### `INJURY_EXCLUSIONS` (app.js:611–618)

| Zone | Exercices exclus |
|---|---|
| `epaules` | ohp, ohp_halt, elev_lat, elev_front, incline_bench, dips_pec, dips_tri, face_pull, upright_row |
| `genoux` | squat, leg_press, leg_ext, fente, hack_squat, step_up, sissy |
| `dos` | deadlift, rdl, row_barre, row_halt, good_morning, shrug |
| `poignets` | bench, bench_halt, curl_barre, skull, row_barre |
| `nuque` | lat_pull, traction, shrug, face_pull |
| `hanches` | deadlift, rdl, hip_thrust, fente, squat |

⚠️ **Problème mineur** — `hack_squat`, `step_up`, `sissy`, `good_morning`, `upright_row` dans les exclusions n'existent PAS comme IDs dans EXO_DB. Ce sont des "phantom exclusions" sans effet. Pas un bug, mais du code mort qui peut induire en erreur.

⚠️ **Problème mineur** — `epaules` exclut `face_pull` alors que le face pull est souvent **recommandé** en rééducation d'épaule (renforcement de la coiffe des rotateurs). C'est une sur-exclusion potentielle.

⚠️ **Problème mineur** — `poignets` exclut `bench` et `bench_halt` : un utilisateur avec douleur aux poignets ne peut faire AUCUN développé couché. Avec `poignets` + objectif `force`, le bloc Push perd bench, mais garde ohp et incline_bench. C'est incohérent : si les poignets empêchent le bench, ils empêchent aussi le développé incliné (même pattern de prise).

#### Simulation : épaules + genoux, force 3j/sem

Blocs après exclusion :
- **legs** : `['squat','leg_press','rdl','mollet','leg_curl']` → squat (genoux ❌), leg_press (genoux ❌) → **reste : rdl, mollet, leg_curl** = 3 exos
- **push** : `['bench','ohp','incline_bench','tri_cable','elev_lat']` → ohp (épaules ❌), incline_bench (épaules ❌), elev_lat (épaules ❌) → **reste : bench, tri_cable** = 2 exos
- **pull** : `['deadlift','row_barre','lat_pull','traction','curl_barre','face_pull']` → face_pull (épaules ❌) → **reste : deadlift, row_barre, lat_pull, traction, curl_barre** = 5 exos

✅ **Viable** — Le programme est déséquilibré (2 exos push vs 5 pull) mais pas vide. Le jour push serait très court (bench + extension triceps câble uniquement).

---

### 1.1f — Cardio et compétition

#### Chemins cardio (app.js:741–749)

Trois options : `integre`, `dedie`, `aucun`.

**`integre`** (ligne 742–744) : Ajoute `cardio_liss` (15min) à la fin de chaque jour d'entraînement qui n'est pas déjà un jour cardio et qui n'a pas déjà de cardio. ✅ Fonctionne correctement.

**`dedie`** (ligne 746–748) : Les jours de repos (sauf Dimanche) deviennent "Cardio léger" avec `cardio_liss` (30-40min) + `planche` (3×60s). ✅ Fonctionne.

**`aucun`** : Aucune branche spécifique → aucun cardio ajouté. ✅ Fonctionne par omission.

✅ **OK** — Les trois chemins produisent des résultats bien différents.

#### Compétition `_compInfo` (app.js:755–758)

```js
if (compDate) {
  const weeksOut = Math.round((new Date(compDate) - Date.now()) / 604800000);
  plan._compInfo = { date: compDate, weeksOut, type: compType };
}
```

L'info compétition est **stockée** mais n'influence **PAS la structure du programme** (pas de périodisation construction/force/peak/deload automatique). Elle est uniquement affichée comme note textuelle dans `renderObGeneratedProgram` (ligne 911–919).

Les phases affichées (ligne 915–918) :
- > 12 semaines → "Phase de construction"
- > 6 semaines → "Phase de force"
- > 2 semaines → "Peak"
- ≤ 2 semaines → "Deload"

⚠️ **Problème mineur** — C'est purement **informatif**. Le programme généré est identique avec ou sans date de compétition. Les blocs d'exercices, sets×reps, et la structure ne changent pas. Le `_compInfo` n'est qu'un texte de conseil.

---

### 1.1g — Import manuel (`parseManualProgram`)

#### Code (app.js:861–882)

```js
function parseManualProgram(text) {
  const result = {};
  const dayAliases = { /* lun→Lundi, mon→Lundi, monday→Lundi, etc. */ };
  const lines = text.split('\n');
  lines.forEach(line => {
    const m = line.match(/^([^:：]+)[：:]\s*(.+)$/);
    if (!m) return;
    const dayRaw = m[1].trim().toLowerCase().replace(/[^a-záàâäéèêëîïôöùûüÿ]/g,'');
    const content = m[2].trim();
    const day = dayAliases[dayRaw];
    if (day) result[day] = content;
  });
  return result;
}
```

#### Tests edge case :

| Input | Résultat | Verdict |
|---|---|---|
| `lundi: repos` | `{Lundi: "repos"}` | ✅ OK — la ligne est parsée, "repos" est le contenu |
| `Lundi : Squat, bench` | `{Lundi: "Squat, bench"}` | ✅ OK — le `:` avec espace est capté par la regex |
| `Monday: Push day` | `{Lundi: "Push day"}` | ✅ OK — "monday" est dans dayAliases |
| Lignes vides | Ignorées par la regex (pas de match `^([^:：]+)[：:]`) | ✅ OK |
| `lundi repos` (sans deux-points) | **Pas de match** — la ligne est silencieusement ignorée | ⚠️ Problème mineur — aucun feedback utilisateur |
| `Lun: Squat` | dayRaw = "lun" → dayAliases["lun"] = "Lundi" | ✅ OK |
| `mar : Dos, Biceps` | dayRaw = "mar" → "Mardi" | ✅ OK |
| `Dim: OFF` | dayRaw = "dim" → "Dimanche", result = `{Dimanche: "OFF"}` | ✅ OK |

⚠️ **Problème mineur** — Le parser supporte le format `jour: contenu` mais le contenu est stocké comme **string brute** dans `db.routine[day]`, pas comme liste d'exercices structurée. Le résultat de `parseManualProgram` est stocké dans `db.routine` (ligne 497) : `db.routine = parsed`.

❌ **Bug critique** — `parseManualProgram` ne peuple PAS `db.routineExos`. Le code (ligne 496–499) :
```js
const parsed = parseManualProgram(text);
db.routine = parsed;  // Labels seulement !
saveDB();
obFinish();
```

`db.routine` reçoit `{Lundi: "Squat, bench", ...}` — c'est le **label** du jour. Mais `db.routineExos` n'est JAMAIS rempli. Or `generateWeeklyPlan()` utilise `getProgExosForDay(day)` qui lit `db.routineExos[day]`. **Résultat : un import manuel ne permet PAS de générer un weekly plan**, sauf si l'utilisateur va manuellement dans les réglages pour ajouter les exercices.

**MAIS** — il y a un fallback dans `generateWeeklyPlan` (ligne 6131–6135) : si `exoNames` est vide, il cherche la session Hevy la plus récente du même jour. Donc si l'utilisateur a importé des séances Hevy, le weekly plan fonctionnera malgré tout. Si c'est un nouvel utilisateur sans historique, le weekly plan sera vide pour tous les jours.

---

## 1.2 — Audit de `generateWeeklyPlan()` (Weekly Plan)

### 1.2a — Source des exercices

#### D'où viennent les exercices ? (app.js:6127–6135)

```js
exoNames = getProgExosForDay(day);  // Priorité 1 : db.routineExos[day]
if (!exoNames.length) {              // Priorité 2 : dernière séance Hevy du même jour
  const recent = [...db.logs]
    .filter(l => l.day === day && l.exercises.length > 0)
    .sort((a,b) => b.timestamp - a.timestamp)[0];
  if (recent) exoNames = recent.exercises.filter(e => !e.isCardio).slice(0,8).map(e => e.name);
}
```

✅ **OK** — Double source avec fallback. `getProgExosForDay()` (engine.js:529–533) lit `db.routineExos[day]`, gère les formats tableau et string.

#### Si `db.routineExos` est vide pour certains jours ?

✅ **OK** — Le fallback sur la dernière séance Hevy fonctionne. Si aucune séance n'existe non plus pour ce jour, `exoNames` reste `[]` et le jour apparaît sans exercice (la boucle `exoNames.forEach` ne s'exécute pas).

⚠️ **Problème mineur** — Le jour aura `exercises: []` mais `rest: false` si le label routine n'est pas "repos". L'utilisateur verra un jour non-repos avec 0 exercice et 0 suggestion.

#### Si un exercice n'a AUCUN historique dans `db.logs` ?

Code (app.js:6140) : `const hist = resolveRecentRecord(exoName);`

`resolveRecentRecord` (ligne 6024–6049) cherche dans les 90 derniers jours puis fallback sur `resolveRecord` (all-time). Si aucun match → retourne `null`.

Pour un exercice `weight` sans historique (ligne 6189) : `computeWorkWeight(null, ...)` → `hist?.repRecords` = undefined → `allRecs` = [] → `bestE1rm` = max(0, ...[] = -Infinity) → **`bestE1rm = 0`** → retourne `null`.

Résultat (ligne 6207–6208) : `{ name, type:'weight', sets:[], noData:true }`. L'UI affiche : "⚠️ Pas encore de données — importe une séance Hevy pour cet exercice."

✅ **OK** — Géré proprement avec le flag `noData`.

---

### 1.2b — Calcul des charges (`computeWorkWeight`)

#### Trace complète : Squat, e1RM = 140kg, semaine 2 (wi=1), niveau intermédiaire

**LOAD_PCT** (app.js:5956–5958) :
- wi = 1 → `[0.88, 0.92, 0.96][1]` = 0.92
- LVL.loadOfs pour intermédiaire = 0.00
- **LOAD_PCT = 0.92** ✅

**computeWorkWeight** (app.js:6055–6078) :
- `computeExoTrend("Squat")` → supposons n=4, kgPerWeek = +0.8 → adj = 0 (entre -0.5 et 1.5, pas de bonus)
- `bestE1rm` = max(140, ...) = **140**
- `epleyTarget` = 140 × (1.0278 - 0.0278 × 5) = 140 × 0.8888 = **124.43**
- `workWeight` = round05(124.43 × 0.92 + 0) = round05(114.48) = **114.5kg**

Résultat final pour ce Squat S2 : **114.5kg × 5 reps @ RPE 8** ✅ Cohérent.

#### L'ajustement `adj` (progression trend)

Code (app.js:6059–6063) :
```js
if (trend.n >= 3) {
  if (trend.kgPerWeek > 1.5)       adj = round05(Math.min(trend.kgPerWeek * 0.4, 5));
  else if (trend.kgPerWeek < -0.5) adj = round05(Math.max(trend.kgPerWeek * 0.5, -5));
}
```

- Progression forte (ex: +3 kg/sem) → adj = round05(min(3×0.4, 5)) = round05(1.2) = **+1.0kg**
- Progression très forte (+15 kg/sem — probablement une erreur de données) → adj = round05(min(15×0.4, 5)) = **+5.0kg** max → plafonné ✅
- Régression (-2 kg/sem) → adj = round05(max(-2×0.5, -5)) = round05(-1.0) = **-1.0kg**
- Régression extrême (-12 kg/sem) → adj = **-5.0kg** max → plafonné ✅

✅ **OK** — L'ajustement est plafonné à ±5kg. Pas de charges absurdes possibles.

⚠️ **Problème mineur** — Le `progFactor` du niveau (LVL.progFactor = 0.6/1.0/1.3/1.6) n'est **jamais appliqué** à `adj`. Il est défini dans la structure LVL (ligne 5919) mais n'est utilisé nulle part dans `computeWorkWeight`. Code mort / intention non implémentée.

#### Avec UNE seule séance dans l'historique ?

`computeExoTrend` retourne `{ kgPerWeek: 0, lastE1rm: X, n: 1 }` (ligne 5972). `adj = 0` car `trend.n < 3`. Le calcul se fait uniquement sur le `bestE1rm` du seul record → fonctionne. ✅

#### Avec reps très hautes (20 reps à 60kg) ?

`calcE1RM(60, 20)` = 60 / (1.0278 - 0.0278 × 20) = 60 / (1.0278 - 0.556) = 60 / 0.4718 = **127.2kg**

La formule d'Epley est notoirement **imprécise au-delà de 10 reps**. Un e1RM de 127kg estimé depuis 60kg×20 est probablement **surestimé de 10-15%**. Mais ce n'est pas un bug du code, c'est une limitation connue d'Epley.

⚠️ **Problème mineur** — Pas de cap sur les reps utilisées pour l'e1RM. Un set de 30 reps à 40kg donnerait un e1RM de 284kg (absurde). Le code utilise `hist.repRecords` qui peut contenir des reps très élevées.

---

### 1.2c — Catégorisation des exercices (`getExoCategory`)

Code (app.js:5928–5933) :

```js
function getExoCategory(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/squat|deadlift|souleve|bench\s*(press|barre|couche)?|developpe\s*couche/.test(n)) return 'big';
  if (/overhead|militaire|\bohp\b|rowing\b|tirage|row\b|traction|pull.?up|chin.?up|\bdips?\b|rdl|roumain|hip\s*thrust|pouss[ée]e\s*de\s*hanche|leg\s*press|presse\s*(a\s*)?cuisses|fentes?|\blunge|good\s*morning/.test(n)) return 'compound';
  return 'isolation';
}
```

#### Test de 10 exercices courants :

| Exercice | Catégorie retournée | Verdict |
|---|---|---|
| Squat (Barre) | `big` (match "squat") | ✅ Correct |
| Bench Press (Barre) | `big` (match "bench press") | ✅ Correct |
| Soulevé de Terre | `big` (match "souleve") | ✅ Correct |
| Rowing Barre | `compound` (match "rowing") | ✅ Correct — bien compound, pas big |
| Dips | `compound` (match "dips") | ✅ Correct |
| Hip Thrust | `compound` (match "hip thrust") | ✅ Correct |
| Curl Biceps (Barre) | `isolation` (aucun match big/compound) | ✅ Correct |
| Élévation Latérale | `isolation` | ✅ Correct |
| Développé Incliné (Barre) | `isolation` ← ❌ | ❌ **Bug critique** — "developpe incline" ne matche pas "developpe couche" ni "bench". Le développé incliné barre est catégorisé **isolation** alors que c'est un mouvement composé lourd ! |
| Développé Militaire | `compound` (match "militaire") | ✅ Correct |

❌ **Bug critique** — `getExoCategory` ne reconnaît pas le **développé incliné** (ni "incline bench" ni "développé incliné"). Il est catégorisé `isolation` → reçoit le schéma 15/12/12/12 reps au lieu de 10/8/6/5 (compound) ou 5/5/3/2 (big). Un développé incliné à 15 reps en semaine 1, c'est de l'endurance, pas de la force.

⚠️ **Problème mineur** — `bench` seul (sans "press"/"barre"/"couche") matche `big` via la regex `bench\s*(press|barre|couche)?`. Le `?` rend le suffixe optionnel. Donc "Bench" tout seul = big. OK mais attention : "Bench Dips" matcherait aussi "bench" → catégorisé big au lieu de compound. Toutefois le `\bdips?\b` dans compound est testé APRÈS big, donc "Bench Dips" serait effectivement `big`. ⚠️ Edge case rare.

---

### 1.2d — Schéma de périodisation (SCHEME)

Code (app.js:5936–5941) :
```js
const SCHEME = {
  big:       { reps:[5, 5, 3, 2], sets:[4,4,4,3], rpe:[7,  8,  8.5,9  ], rest:210 },
  compound:  { reps:[10,8, 6, 5], sets:[3,4,4,3], rpe:[7,  7.5,8,  8.5], rest:150 },
  isolation: { reps:[15,12,12,12], sets:[3,4,4,3], rpe:[7,  7,  7.5,7  ], rest:90  },
};
```

#### Analyse science du sport :

**Big (5/5/3/2)** :
- S1: 4×5 RPE7 → volume modéré, bonne base ✅
- S2: 4×5 RPE8 → même volume, intensité augmentée ✅
- S3: 4×3 RPE8.5 → volume réduit, intensité haute ✅
- S4: 3×2 RPE9 → peak, volume minimal ✅
- **Verdict** : Schéma powerlifting classique, cohérent pour un bloc de force. Pour un bodybuilder, 5 reps max c'est peu de volume mécanique — mais le code applique ce schéma uniquement aux "big 3" (SBD), pas à tous les exercices. ✅

**Compound (10/8/6/5)** :
- Bonne ondulation descendante des reps avec montée du RPE. ✅
- S1 3 séries → S2 4 séries → S3 4 séries → S4 3 séries : le volume monte puis redescend. ✅

**Isolation (15/12/12/12)** :
- ⚠️ **Problème mineur** — Quasi aucune progression en reps sur les semaines 2-4 (12/12/12). La seule variation est le passage de 15→12 en S1→S2. Le RPE est quasi constant (7/7/7.5/7). Les sets passent de 3→4→4→3. La stimulation est très faible pour l'isolation — pas de surcharge progressive claire.

#### RPE : monte-t-il correctement ?

✅ **OK** — Big : 7 → 8 → 8.5 → 9. Compound : 7 → 7.5 → 8 → 8.5. Isolation : 7 → 7 → 7.5 → 7. Montée progressive pour les mouvements lourds, stable pour l'isolation. Cohérent.

#### Semaine 4 : "peak" ou "deload" ?

Le code appelle S4 "Peak" dans les notes (ligne 5948–5950) : `'Peak — RPE max autorisé, tout sur la table.'`

Mais les paramètres sont :
- Big S4 : 3×2 RPE9 → c'est bien un **peak** (charges maximales, volume bas)
- Sets baissent : 4→4→4→3 (big), 3→4→4→3 (compound/isolation)

⚠️ **Problème mineur** — Incohérence terminologique : les sets baissent en S4 ce qui ressemble à un **deload** (moins de volume), mais le RPE est au max (9 pour big) ce qui est un **peak**. C'est en fait un taper/peak classique (réduire le volume, garder l'intensité), mais appeler ça "peak" est correct. Pas un vrai deload (qui réduirait aussi l'intensité). Terminologie acceptable.

---

### 1.2e — Ajustement fréquence (`getExoFreqPerWeek`)

Code (app.js:5984–5991) :
```js
function getExoFreqPerWeek(exoName) {
  let freq = 0;
  DAYS_FULL.forEach(day => {
    const dayExos = getProgExosForDay(day);
    if (dayExos.some(e => e === exoName || matchExoName(e, exoName))) freq++;
  });
  return freq || 1; // minimum 1
}
```

#### Ajustement volume (app.js:6152–6153) :
```js
const freq = (exoType === 'weight' || exoType === 'reps') ? getExoFreqPerWeek(exoName) : 1;
const nSets = Math.max(2, sc.sets[wi] + (freq >= 3 ? -1 : freq === 1 ? +1 : 0));
```

- Exercice 3×/sem → -1 série par séance
- Exercice 2×/sem → 0 ajustement
- Exercice 1×/sem → +1 série par séance

**Vérification du volume hebdomadaire total :**

Exemple `big` S1 (base = 4 sets) :
- 3×/sem : (4-1) × 3 = **9 sets/sem**
- 2×/sem : 4 × 2 = **8 sets/sem**
- 1×/sem : (4+1) × 1 = **5 sets/sem**

⚠️ **Problème mineur** — Le volume hebdomadaire n'est PAS constant : 9 vs 8 vs 5 sets. Un exercice fait 1×/sem a presque moitié moins de volume qu'un fait 3×/sem. L'ajustement ±1 série ne compense pas la différence de fréquence.

#### Edge case : exercice 0 fois dans routineExos ?

`getExoFreqPerWeek` retourne `freq || 1` → minimum 1. Pas de crash, pas de division par zéro. ✅

Mais attention : si un exercice n'est PAS dans `db.routineExos` mais arrive dans le weekly plan via le fallback Hevy (session récente), sa fréquence sera comptée à 1 (fallback). C'est correct par défaut.

---

### 1.2f — Gestion du matériel (barbell vs dumbbell)

#### `getEquipmentType()` (engine.js:598–613)

Test avec 10 noms réels :

| Nom exercice | Résultat | Verdict |
|---|---|---|
| Bench Press (Barre) | `barbell` (match "barre") | ✅ |
| Développé Couché (Haltères) | `dumbbell` (match "haltere") | ✅ |
| Lat Pulldown | `cable` (match "lat pulldown" implicite) | ✅ |
| Hack Squat | `machine` (match "hack squat" → machine) | ✅ |
| Tractions | `bodyweight` (match "traction") | ✅ |
| Squat (Barre) | `barbell` (match implicite "squat$") | ✅ |
| Chest Press (Machine) | `machine` (match "machine") | ✅ |
| Curl Marteau | `dumbbell` (match "curl marteau" implicite) | ✅ |
| Rowing Barre | `barbell` (match "rowing barre" implicite) | ✅ |
| Face Pull | `cable` (match "face pull" implicite) | ✅ |

✅ **OK** — La détection est robuste avec double couche (marqueurs explicites puis noms implicites).

#### `DUMBBELL_TO_BARBELL_FACTOR` (engine.js:617)

Valeur : **0.57**

Application (app.js:6191–6193) :
```js
if (workWeight && eqType === 'dumbbell' && workWeight > 60) {
  workWeight = round05(workWeight * DUMBBELL_TO_BARBELL_FACTOR);
}
```

Le facteur **réduit** le poids pour les haltères quand il dépasse 60kg. C'est dans le **bon sens** : un e1RM bench barre de 120kg ne signifie pas 120kg par haltère. Avec le facteur 0.57 : 120 × 0.57 = **68.4kg** → probablement ~34kg par main, ce qui est plus réaliste.

⚠️ **Problème mineur** — Le seuil de 60kg est arbitraire. Un utilisateur très fort avec un vrai e1RM haltère de 65kg (donc ~32.5kg/main) verrait son poids réduit à 37kg (18.5kg/main). Le commentaire dit "probablement des records barre mal attribués" mais ce n'est pas toujours le cas.

⚠️ **Problème mineur** — Le facteur 0.57 est appliqué **au poids total**, pas au poids par main. Si `workWeight` = 100kg pour un exercice dumbbell, le résultat est 57kg. Mais en haltères, on raisonne généralement en poids PAR MAIN. Le facteur devrait peut-être être ~0.35-0.40 (chaque main porte ~35-40% du poids barre). 0.57 semble élevé.

#### Edge case : "Chest Press (Machine)"

`getEquipmentType("Chest Press (Machine)")` → `machine` (match "machine" dans le nom). Le facteur dumbbell n'est PAS appliqué aux machines (condition `eqType === 'dumbbell'`). ✅ Correct.

---

### 1.2g — Échauffements

Code (app.js:6197–6202) :

**Big** (3 paliers) :
- E1 : 40% × workWeight, 8 reps
- E2 : 65% × workWeight, 5 reps
- E3 : 85% × workWeight, 2 reps

**Compound/Isolation** (2 paliers) :
- E1 : 50% × workWeight, 10 reps
- E2 : 75% × workWeight, 5 reps

#### Reps fixes ?

✅ **OK** — Les reps d'échauffement sont bien fixes : 8/5/2 pour big, 10/5 pour compound. C'est un schéma standard d'échauffement progressif.

#### Si poids de travail = 40kg ?

- E1 big : round05(40 × 0.4) = round05(16) = **16kg**, 8 reps
- E2 big : round05(40 × 0.65) = round05(26) = **26kg**, 5 reps
- E3 big : round05(40 × 0.85) = round05(34) = **34kg**, 2 reps

16kg pour un échauffement → c'est la barre à vide (20kg) ou moins. **Réaliste pour un débutant.** ✅

⚠️ **Problème mineur** — Si workWeight = 25kg (débutant très léger), E1 = round05(10) = 10kg. En salle, la barre standard pèse 20kg. Un échauffement à 10kg nécessite une barre EZ ou des haltères, pas la barre olympique. Le code ne vérifie pas que le poids d'échauffement est ≥ poids de la barre.

---

### 1.2h — Types d'exercices spéciaux

#### Exercices "time" (gainage) — app.js:6155–6160

```js
const recSec = hist?.maxTime || 30;
const progSec = Math.round(recSec * (1 + wi * 0.08));
```

Progression : +8% par semaine (wi = 0,1,2,3) :
- S1 : recSec × 1.00 = **60s** (pas de progression S1)
- S2 : recSec × 1.08 = **64.8s** → 65s
- S3 : recSec × 1.16 = **69.6s** → 70s
- S4 : recSec × 1.24 = **74.4s** → 74s

Pour un gainage à 60s de base, après 4 semaines : 74s. Raisonnable. ✅

Pour un gainage à 180s (3min) de base : S4 = 180 × 1.24 = **223s** (3min43). Ambitieux mais pas absurde. ✅

⚠️ **Problème mineur** — Si `hist?.maxTime` est 0 ou absent, fallback à 30s. OK. Mais `wi * 0.08` pour wi=0 donne 0 → S1 = recSec × 1.0 = pas de changement. Correct, la semaine 1 est la baseline.

#### Exercices "reps" (BW) — app.js:6162–6179

Deux chemins :
1. Si `weightedRecs` existe (reps lestées trouvées) → utilise `computeWorkWeight` normalement
2. Sinon (poids de corps pur) → `bwFactors = [0.75, 0.80, 0.85, 0.90]`

Pour un max de 20 tractions :
- Cap à 25 (`Math.min(hist?.maxReps || 0, 25)`) → recMax = 20
- S1 : max(3, round(20 × 0.75)) = max(3, 15) = **15 reps**
- S2 : max(3, round(20 × 0.80)) = **16 reps**
- S3 : max(3, round(20 × 0.85)) = **17 reps**
- S4 : max(3, round(20 × 0.90)) = **18 reps**

✅ **OK** — Progression linéaire de 75% à 90% du max, plafonnée à 25. Raisonnable.

⚠️ **Problème mineur** — Le cap à 25 est appliqué sur `maxReps` seulement. Si quelqu'un a un historique Hevy avec un set de 50 pompes, son `maxReps` sera capté à 25, et il fera 19 pompes en S1 (25×0.75). Acceptable.

#### Exercices "cardio" — app.js:6181–6185

```js
const recMin = hist?.maxTime ? Math.round(hist.maxTime/60) : 20;
exercises.push({ name, type:'cardio', sets:[{ durationMin:recMin, distance:hist?.distance||null }] });
```

✅ **OK** — Un seul set avec durée et distance. Pas de progression prévue sur les 4 semaines (la durée est la même S1-S4). 

⚠️ **Problème mineur** — Aucune progression cardio : la durée est identique chaque semaine. Pour de la sèche, on voudrait typiquement +5min/sem. Mais le code ne différencie pas la durée cardio par semaine.

---

### 1.2i — Notes coach (`buildDayCoachNote`)

Code (app.js:6083–6116).

#### Chemin de décision :

1. **Plateau SBD détecté** → `detectPlateau(sbdType, 3)` pour chaque SBD présent ce jour. Si plateau trouvé → note plateau.
2. **Momentum fort** → `calcMomentum(sbdType)` > 1.5 → note positive.
3. **Tendance exercice composé non-SBD** → `computeExoTrend(exoName)` sur les 4 premiers exercices du jour. Si trend > 1.5 → note progression. Si trend < -1 → note recul.
4. **Fallback** → `WEEK_NOTES[wi]` — note générique de la semaine.

#### `detectPlateau()` et `calcMomentum()` sont-elles accessibles ?

✅ **OK** — Les deux fonctions sont définies dans `engine.js` (lignes 771–797), qui est chargé avant `app.js` dans `index.html`. Elles sont dans le scope global.

`detectPlateau(type, n=3)` (engine.js:771–785) :
- Collecte les n+2 derniers e1RM du type SBD
- Vérifie que la période couvre au moins n×5 jours
- Si `recent[0].rm <= recent[n-1].rm` → plateau (pas de progression sur les n dernières sessions)

✅ **OK** — Logique correcte.

`calcMomentum(type)` (engine.js:786–797) :
- Régression linéaire sur les 10 dernières sessions
- Retourne la pente en kg/semaine
- Si < 3 points → retourne null

✅ **OK** — Logique correcte.

#### Test : aucun SBD, aucune tendance → note générique

Si le jour ne contient que de l'isolation sans historique, tous les chemins échouent → **fallback WEEK_NOTES[wi]**. ✅

---

### 1.2j — Edge cases critiques

#### Utilisateur avec 0 séances dans `db.logs`

- `allBest` = {} (ligne 5994–6006, forEach sur [] = rien)
- `resolveRecentRecord` pour chaque exercice → `null`
- `computeWorkWeight(null, ...)` → `bestE1rm = 0` → retourne `null`
- Chaque exercice → `{ noData: true, sets: [] }`
- `buildDayCoachNote` → `detectPlateau` retourne null, `calcMomentum` retourne null, `computeExoTrend` n=0 → fallback WEEK_NOTES[wi]

✅ **OK** — Le weekly plan se génère sans crash. Tous les exercices montrent "Pas encore de données". C'est fonctionnel mais inutile pour l'utilisateur.

#### Exercices en anglais vs programme en français

Le matching passe par `resolveRecentRecord` → `resolveRecord` (ligne 6013–6018) qui utilise `matchExoName()`.

`matchExoName` (engine.js:619–708) utilise :
1. Normalisation NFD (accents supprimés)
2. Comparaison mot par mot
3. **Table EXO_SYNONYMS** (engine.js:537–594) pour le cross-langue

Exemples de synonymes couverts :
- "Deadlift" ↔ "Soulevé de Terre" ✅
- "Bench Press" ↔ "Développé Couché" ✅
- "Squat (Barre)" ↔ "Squat Barre" ✅
- "Lat Pulldown" ↔ "Tirage Vertical" ✅

✅ **OK** — Le matching FR↔EN fonctionne via EXO_SYNONYMS pour les exercices majeurs.

⚠️ **Problème mineur** — Exercices rares ou noms Hevy très spécifiques pourraient ne pas matcher. Exemple : "Barbell Back Squat" n'est pas dans les synonymes (on a "squat barre", "squat barbell", "back squat" séparément). `matchExoName` devrait quand même matcher via les mots communs "squat" + "barbell"/"back". Vérifié : "back" n'est pas dans DIFF (set de différenciateurs) → le mot "extra" est toléré → **match OK**. ✅

#### Exercice renommé dans Hevy entre deux séances

Si un exercice passe de "Squat (Barre)" à "Barbell Back Squat" entre deux imports :
- `computeExoTrend(exoName)` cherche les logs avec `matchExoName(e.name, exoName)` → les deux noms matchent → les deux séances sont agrégées. ✅
- `allBest` contient les deux clés séparées, mais `resolveRecord` les fusionne via `matchExoName`. ✅

✅ **OK** — Le matching tolère les renommages courants.

#### `matchExoName()` utilisé correctement ?

- Dans `computeExoTrend` (app.js:5967) : `log.exercises.find(e => e.name === exoName || matchExoName(e.name, exoName))` ✅
- Dans `resolveRecord` (app.js:6015) : `Object.keys(allBest).filter(k => matchExoName(k, exoName) || matchExoName(exoName, k))` ✅ — test bidirectionnel
- Dans `getExoFreqPerWeek` (app.js:5988) : `dayExos.some(e => e === exoName || matchExoName(e, exoName))` ✅

✅ **OK** — `matchExoName` est utilisé partout où il faut avec les deux sens de comparaison.

---

## 1.3 — Audit de la cohérence entre les deux systèmes

### Noms de `EXO_DB` vs `db.routineExos` vs Hevy

**`generateProgram()`** stocke les exercices par **ID** (`squat`, `bench_halt`, etc.) dans `db.generatedProgram[day].exos`. Les noms affichés viennent de `EXO_DB[id].name` (ex: "Squat barre", "Développé haltères").

**`db.routineExos`** contient des **noms libres** (strings) saisis par l'utilisateur ou récupérés depuis les logs Hevy (ex: "Squat (Barre)", "Barbell Bench Press").

**`generateWeeklyPlan()`** lit `db.routineExos` (noms libres) et les matche contre `db.logs` via `matchExoName`.

❌ **Bug critique** — **`doGenerateProgram()` ne peuple JAMAIS `db.routineExos`**.

Code de `doGenerateProgram()` (app.js:572–579) :
```js
db.generatedProgram = generated;
db.routine = {};
generated.forEach(d => { db.routine[d.day] = d.isRest ? '😴 Repos' : d.label; });
```

Il remplit `db.routine` (labels) et `db.generatedProgram` (structure complète avec IDs), mais **pas `db.routineExos`**. Or `generateWeeklyPlan()` lit `getProgExosForDay(day)` → `db.routineExos[day]` → **vide**.

**Conséquence** : Après onboarding avec programme généré, `generateWeeklyPlan()` ne trouvera AUCUN exercice via `db.routineExos`. Le fallback (ligne 6131–6135) cherche la dernière séance Hevy du même jour. Si l'utilisateur n'a pas encore d'historique → le weekly plan est **vide pour tous les jours**.

L'utilisateur doit :
1. Soit aller dans Réglages → ajouter manuellement les exercices
2. Soit utiliser "Appliquer toutes les suggestions" (`wpApplyAll`) après un premier weekly plan non-vide (ce qui est un paradoxe : il faut un plan non-vide pour pouvoir l'appliquer)
3. Soit avoir un historique Hevy suffisant pour que le fallback fonctionne

C'est le **bug le plus impactant** du système : les deux générateurs ne communiquent pas via `db.routineExos`.

### Import manuel → Weekly plan possible ?

Comme vu en 1.1g, `parseManualProgram` ne peuple pas `db.routineExos` non plus. L'import stocke `{Lundi: "Squat, bench"}` dans `db.routine` (labels), pas dans `db.routineExos`.

❌ **Bug critique** — Même problème : import manuel → weekly plan vide sauf fallback Hevy.

### `db.user.trainingMode` influence-t-il le weekly plan ?

Le `trainingMode` est lu dans `getMode()` / `modeFeature()` (engine.js:99–104). Dans `generateWeeklyPlan()`, le `trainingMode` n'est PAS directement consulté. Les paramètres qui influencent le plan sont :
- `db.user.level` → LEVEL, LVL (charge offsets, RPE max)
- `db.routineExos` → exercices du jour
- `db.logs` → historique pour les charges

Le `trainingMode` contrôle uniquement :
- `showWeeklyPlan` → affiche ou masque la section (bien_etre = false)
- SCHEME est identique quel que soit le mode

⚠️ **Problème mineur** — Un bodybuilder (`trainingMode = 'bodybuilding'`) reçoit exactement le même SCHEME qu'un powerlifter. Les big 3 sont en 5/5/3/2 reps même pour un bodybuilder. On pourrait s'attendre à un schéma plus orienté hypertrophie (8/8/6/6 pour les big en bodybuilding) mais le code n'en tient pas compte.

---

## Résumé des verdicts

### ❌ Bugs critiques (5)

| # | Section | Description |
|---|---|---|
| 1 | 1.1b | `filtSafe()` peut retourner un jour avec 0-1 exercice en cas de blessures multiples, sans avertissement |
| 2 | 1.1d | Débutant full body perd TOUS les exercices jambes (`squat` et `ohp` exclus par `filtLevel`, aucun remplacement) |
| 3 | 1.1g + 1.3 | `parseManualProgram()` ne peuple pas `db.routineExos` → weekly plan vide |
| 4 | 1.2c | `getExoCategory` catégorise le développé incliné en `isolation` au lieu de `compound` ou `big` → schéma 15/12/12/12 reps absurde |
| 5 | 1.3 | `doGenerateProgram()` ne peuple pas `db.routineExos` → les deux systèmes ne communiquent pas |

### ⚠️ Problèmes mineurs (19)

| # | Section | Description |
|---|---|---|
| 1 | 1.1a | Avant-bras et lombaires sans exercice dédié dans EXO_DB |
| 2 | 1.1a | 4 exercices "dormants" jamais dans aucun BLOC (dips_tri, elev_front, releve_genoux, skull) |
| 3 | 1.1a | `elev_lat` et `face_pull` sans alternative "maison" → user maison reçoit un exo salle |
| 4 | 1.1c | Sèche 3j : full_a dupliqué 2× (aucune variation) |
| 5 | 1.1c | Masse 6j : PPL identique répété 2× (pas de variation intensité/volume) |
| 6 | 1.1c | Recompo 4j : full_a répété 2× sur 4 jours, déséquilibré |
| 7 | 1.1d | Débutant masse = 2×15 : volume trop faible pour hypertrophie |
| 8 | 1.1e | `face_pull` exclu par épaules (sur-exclusion, souvent recommandé en rééducation) |
| 9 | 1.1e | `poignets` exclut bench mais pas incline_bench (incohérent) |
| 10 | 1.1e | IDs fantômes dans INJURY_EXCLUSIONS (hack_squat, step_up, etc.) |
| 11 | 1.1f | Compétition `_compInfo` purement informatif, ne change pas la structure du programme |
| 12 | 1.1g | Format sans deux-points silencieusement ignoré (pas de feedback) |
| 13 | 1.2b | `LVL.progFactor` défini mais jamais utilisé dans computeWorkWeight (code mort) |
| 14 | 1.2b | Pas de cap sur les reps pour le calcul e1RM (30 reps à 40kg → e1RM absurde) |
| 15 | 1.2d | Isolation : quasi aucune progression reps S2-S4 (12/12/12) |
| 16 | 1.2e | Volume hebdomadaire total non constant selon fréquence (9 vs 5 sets) |
| 17 | 1.2f | Seuil dumbbell 60kg arbitraire, peut réduire un vrai poids haltère légitime |
| 18 | 1.2h | Aucune progression cardio sur les 4 semaines |
| 19 | 1.3 | trainingMode ne modifie pas le SCHEME → bodybuilder et powerlifter ont les mêmes reps sur big |

### ✅ Points qui fonctionnent bien

- EXO_DB couvre les 6 grands groupes musculaires avec alternatives multi-matériel
- Les 6 objectifs ont tous leurs BLOCS propres (pas de fallback silencieux)
- `matchExoName()` est robuste avec synonymes FR/EN et tolérance aux variations
- Le calcul de charge `computeWorkWeight` est sain avec plafonnement ±5kg
- Les échauffements progressifs sont correctement structurés (3 paliers big, 2 compound)
- Les types spéciaux (time, reps BW, cardio) sont gérés avec des fallbacks raisonnables
- `detectPlateau()` et `calcMomentum()` sont correctes et accessibles
- Le fallback Hevy pour les exercices sans `routineExos` est une bonne sécurité
- L'arrondi à 0.5kg (`round05`) est appliqué partout
- Le RPE est plafonné par niveau (débutant ≤ 8, intermédiaire ≤ 9, etc.)

---

*Fin du diagnostic. Ce rapport est destiné à un coach spécialiste en programmation sportive pour décision sur les corrections à appliquer.*
