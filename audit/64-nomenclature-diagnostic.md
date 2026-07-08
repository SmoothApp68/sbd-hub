# Audit 64 — Nomenclature des exercices : diagnostic (read-only)

> Objectif final validé : unifier l'app sur une nomenclature précise unique (type « Squat (Barre) »).
> Impact mesuré côté Supabase : ~5 568 séances orphelines pour 26 exercices du programme
> (Squat 600, Bench 682, Planche 697…). Ce rapport cartographie A→E, ne code rien.
> Lignes relevées sur l'état du repo à ce jour (post-v305) — elles bougent à chaque édition d'app.js.

---

## A. D'où viennent les noms génériques du programme ?

**Écrits EN DUR dans les templates de la couche weeklyPlan (app.js) et engine.js** — pas dérivés
d'`EXO_DATABASE` :

| Source | Fichier:ligne | Exemples émis |
|---|---|---|
| `SBD_VARIANTS` (main lifts par phase) | app.js:~20075 | « High Bar Squat », « Bench Press (Barre) », « Soulevé de Terre (Barre) » |
| `WP_SESSION_TEMPLATES` (accessoires par séance PB) | app.js:~20380-20530 | « Leg Extension », « Mollets (Machine) », « Développé Incliné (Haltères) », « Rowing Poulie Assis (Prise Large) », « Gainage (Planche) », « Oiseau Machine », « Adduction Machine » |
| `WP_PPL_TEMPLATES` (splits PPL/UL) | app.js:~20560-20610 | « Leg Curl Allongé », « Hip Thrust (Machine) », « Fentes » |
| `WP_ACCESSORIES_BY_PHASE` / `PHASE_ACCESSORY_MAP` | app.js:~20380+ | idem |
| engine.js — listes cardio (:1869), injections (:2015), substitutions blessures/senior (:2282+), arbre calisthenics | engine.js | « Tapis roulant », « Leg Curl allongé », « High Bar Squat » |

Le générateur legacy onboarding (`generateProgram`, app.js:~2297) a en plus SON propre jeu de noms
via `EXO_DB` (app.js:~1594 : « Squat barre », « Bench Press barre »…) — troisième vocabulaire.

## B. La source de vérité des noms — combien de référentiels ?

**5 référentiels majeurs + ~10 maps satellites :**

1. **`EXO_DATABASE`** (js/exercises.js, ~1000 entrées) — `name` + `nameAlt[]` + `id`. Les noms
   sont *majoritairement* précis (« Développé Couché (Barre) », « Hip Thrust (Machine) ») **mais
   pas toujours** : `squat_barbell.name = 'Squat Barre'` alors que l'historique réel utilise
   « Squat (Barre) » (qui n'est qu'un `nameAlt`) ; `machine_fly.name = 'Écarté Machine'` alors que
   l'historique utilise « Écarté (Machine) » (nameAlt). **Le canonique d'EXO_DATABASE ≠ le canonique
   historique pour plusieurs des 26.** Bonus trouvé : DEUX entrées portent `name:'Squat Barre'`
   (doublon de canonique dans la base).
2. **Templates weeklyPlan** (A ci-dessus) — les noms génériques.
3. **`WP_SYNONYMS`** (app.js:20611-20750, **47 clés**) — table d'alias existante,
   clé = nom générique normalisé → tableau de variantes historiques.
4. **`WP_EXO_META`** (app.js:~22941, clés = noms normalisés) — méta algo (mechanic/equipment/
   muscleGroup) pour `getDPIncrement`, warmups, etc.
5. **`EXO_DB`** onboarding legacy (app.js:~1594) — vocabulaire propre.

Satellites keyed-by-name (à suivre lors de tout renommage) : matrice de transfert (engine.js:2378),
map slot/type (engine.js:5131+), antagonistes (engine.js:5242), variantes DP (app.js:~24740),
ratios BW (app.js:~20890), régressions (app.js:~21100), `KNEE_INJURY_SUBSTITUTES`,
`SHOULDER_HEAVY_ALTERNATIVES`, `SENIOR_ADAPTATIONS`, `PIVOT_WEEK_SWAPS`, `EXO_IMAGE_MAP` (par id, robuste).

## C. Le matching existant

Trois mécanismes DISTINCTS, à couverture inégale — c'est la cause profonde du symptôme :

1. **`wpFindBestMatch`** (app.js:~20770) + `wpNormalizeName` : 3 niveaux (exact normalisé →
   `WP_SYNONYMS` avec reverse-lookup → premier mot significatif). Consommé par la double
   progression ET les sparklines.
2. **`matchExoName`** (engine.js:988, avec cache) : normalisation + mots significatifs + racines
   différenciantes (`_DIFF_ROOTS` : incline, pause, sumo…). Consommé par GO (« Dernière fois »
   `goGetPreviousSets`, liaison plan↔activeWorkout). **N'utilise PAS `WP_SYNONYMS`.**
3. **Import Hevy** : lookup exact normalisé sur `EXO_DATABASE.name/nameAlt` (import.js:425-427)
   + **`migrateExerciseNames()`** (import.js:1726, appelée AU BOOT app.js:14456, garde
   `db.migrationV1`) qui **RENOMME les logs** vers `EXO_DATABASE.name` — les « flèches vertes ».

**Couverture actuelle des 26 mappings validés par `WP_SYNONYMS`** : ~20/26 déjà présents
(Leg Extension, Adduction/Abduction, Tapis roulant, Mollets (Machine), Gainage planche, Développé
incliné haltères, Tractions, Hyperextension, Écarté machine, Hip Thrust, Oiseau machine, Shrugs,
Leg Curl allongé, Face pull→Tirage vers Visage, Curl marteau, Squat Pause, Soulevé de Terre Pause,
Rowing poulie assis…). **ABSENTS : « High Bar Squat », « Bench Press (Barre) », « Curl Barre EZ »,
« Oiseau Poulie », « Curl Poignet », « Développé Décliné (Barre) » (comme clé).** Les deux premiers
sont précisément les plus gros orphelins mesurés (Squat 600, Bench 682) — les main lifts
`SBD_VARIANTS` n'ont jamais été ajoutés à la table. Et même pour les 20 couverts, seuls les
consommateurs de `wpFindBestMatch` en profitent — `matchExoName` (« Dernière fois ») et les
lookups stricts restent orphelins.

### C6 — Conflits identifiés (⚠️ à trancher AVANT d'ajouter les 26 mappings)

1. **Conflit de direction avec `migrateExerciseNames`** : la migration renomme l'historique VERS
   `EXO_DATABASE.name`. Or pour au moins 3 cas, l'annexe va dans l'AUTRE sens :
   `'Squat (Barre)'` est un nameAlt de `name:'Squat Barre'` ; `'Écarté (Machine)'` un nameAlt de
   `name:'Écarté Machine'`. Si `db.migrationV1` est absent/réinitialisé sur un device, la migration
   renommerait l'historique à l'opposé de la nomenclature cible. **Toute stratégie doit d'abord
   aligner `EXO_DATABASE.name` sur le canonique choisi, ou neutraliser cette migration.**
2. **Repli de variantes** : `squat_barbell.nameAlt` contient « Squat avec pause (barre) » ET
   « Squat Pause » → l'import/migration FOND le squat pause dans le squat plein — alors que
   l'annexe (et `WP_SYNONYMS`) les traitent comme des exercices distincts. Idem côté synonymes :
   « Developpe Couche Decline (Barre) » est rangé comme VALEUR du groupe « Developpe couche » →
   `wpFindBestMatch` peut matcher un bench plat sur un historique décliné. Variantes pause/décliné =
   points de fusion accidentelle à purger quel que soit le choix.
3. « Écarté Machine (Pec Deck) » (annexe) est aussi un `nameAlt` de `machine_fly` — cohérent,
   pas de conflit, mais confirme le chevauchement des deux systèmes (WP_SYNONYMS ↔ nameAlt) qui
   encodent la même connaissance deux fois.

## D. Surface de lecture (qui bénéficie / qui risque)

| Consommateur | Mécanisme | Si on unifie |
|---|---|---|
| Sparklines (`computeExoSparklineData`) | wpFindBestMatch | ✅ bénéficie immédiatement (symptôme d'origine) |
| Double progression / estimation charge (`wpDoubleProgressionWeight`) | wpFindBestMatch + `db.exercises` | ✅ bénéficie |
| « Dernière fois » GO (`goGetPreviousSets`) | matchExoName (sans synonymes) | ✅ si le matching est routé/enrichi, sinon reste orphelin |
| Auto-reg (`goCheckAutoRegulation`) | égalité `wpNormalizeName` plan↔activeWorkout | Neutre (cohérence interne plan→séance) — ne pas désynchroniser les deux côtés |
| Pas du bouton « Appliquer » (`getDPIncrement`→`wpGetExoMeta`) | clés WP_EXO_META normalisées | ✅ « High Bar Squat » ne résout PAS aujourd'hui → pas par défaut 2.0 kg ; des noms unifiés rendent le pas exact |
| Stats records / e1RM (`db.exercises` keyé PAR NOM) | données | ⚠️ store de DONNÉES : `db.exercises['High Bar Squat']` (shadowWeight, e1RM) existe dans les blobs — un renommage côté programme ré-aiguille les lectures/écritures vers d'autres clés → ZONE ROUGE si on migre les clés |
| bestPR / SBD (`getSBDType`), muscles (`getMuscleGroup`), type (`getExoType`), barre (`isBarbellExercise`) | regex sur nom | ✅ robustes (les regex matchent les deux vocabulaires) |
| Images / démos / trackingType | `exoId` + lookup EXO_DATABASE name/nameAlt | ⚠️ les noms de templates absents d'EXO_DATABASE n'ont ni image ni trackingType précis aujourd'hui ; des noms unifiés les récupèrent |
| keyLifts, titres de séances, défis | noms stockés dans les blobs | ⚠️ données réelles — tout renommage rétroactif = action Supabase |

## E. Stratégies (description, pas de décision)

**Option 1 — Enrichir la résolution (additif, réversible, zéro donnée touchée)**
Ajouter les ~6 clés manquantes à `WP_SYNONYMS` (High Bar Squat, Bench Press (Barre), Curl Barre EZ,
Oiseau Poulie, Curl Poignet, Développé Décliné (Barre)) + compléter les valeurs des clés existantes
avec les cibles exactes de l'annexe ; et **router « Dernière fois »** (matchExoName ou son appelant)
via la même résolution pour que GO en profite. Ampleur : ~15-30 lignes + tests. Risque : faible
(vérifier le repli de variantes C6-2 en ajoutant). Ne corrige pas la cause : les futurs programmes
continueront d'émettre des noms génériques ; l'UI programme affichera toujours « High Bar Squat ».

**Option 2 — Corriger le générateur à la source**
Remplacer les noms dans `SBD_VARIANTS` + templates (+ maps satellites qui les référencent :
WP_EXO_META a déjà les deux formes pour certains, matrice de transfert, antagonistes, substitutions —
à passer en revue un par un, ~40-60 littéraux). Corrige la cause pour les FUTURS plans. MAIS :
(a) les programmes existants dans les blobs gardent les anciens noms → soit régénération forcée du
weeklyPlan (perte d'ajustements en cours de bloc ?), soit période mixte où l'Option 1 reste
nécessaire de toute façon ; (b) `db.exercises` porte des clés génériques accumulées (shadowWeight/
e1RM d'« High Bar Squat ») → sans migration de ces clés, l'APRE repart à froid sur le nouveau nom =
**action Supabase / ZONE ROUGE** ; (c) la table de synonymes doit être conservée pour l'historique.
Ampleur : moyenne-large, risque moyen (cœur du générateur, figé pré-bêta selon CLAUDE.md).

**Option 3 — Unifier `EXO_DATABASE` comme canonique unique et tout en dériver**
Le plus propre à terme : `EXO_DATABASE.name` = nomenclature précise validée (corriger « Squat Barre »
→ « Squat (Barre) », « Écarté Machine » → « Écarté (Machine) », dédoublonner, purger les replis de
variantes des nameAlt), générateur et templates réfèrent des `exoId` et affichent `name`.
MAIS : la plus large surface (5 référentiels + satellites), et **`migrateExerciseNames` renommerait
les logs vers le nouveau canonique au prochain boot des devices dont le flag n'est pas posé** —
c'est précisément le genre d'écriture sur données réelles qui exige vérif Supabase préalable
(couverture des blobs, backup) par Claude.ai. Post-bêta réaliste.

---

## CONCLUSION

- **Référentiels à unifier : 5 majeurs** (EXO_DATABASE, templates weeklyPlan, WP_SYNONYMS,
  WP_EXO_META, EXO_DB legacy) **+ ~10 maps satellites** keyed-by-name + 3 mécanismes de matching
  à couverture inégale (wpFindBestMatch / matchExoName / import-nameAlt).
- **Surface de lecture** : 6 consommateurs bénéficiaires directs, 3 zones de données réelles
  (db.exercises, weeklyPlan existants, logs) qui font basculer les Options 2/3 en zone rouge partielle.
- **Recommandation : Option 1 d'abord** (vague 1, zone verte, débloque immédiatement les 5 568
  séances orphelines pour sparklines + DP + « Dernière fois », réversible), **puis Option 2 en
  vague 2 ciblée** (SBD_VARIANTS + templates, avec revue des satellites et décision Supabase sur
  db.exercises), **Option 3 post-bêta**. Pré-requis transverse quel que soit le choix : trancher
  les conflits C6 (direction de `migrateExerciseNames`, replis de variantes pause/décliné,
  doublon « Squat Barre »).

**STOP — diagnostic seul. Aucun code. Attente de l'arbitrage d'Aurélien sur la stratégie et les
conflits C6 avant toute Phase 2.**
