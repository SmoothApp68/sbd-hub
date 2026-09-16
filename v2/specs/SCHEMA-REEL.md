# Schéma réel — état au 10 septembre 2026

**Régénéré depuis la base**, projet Supabase `swwygywahfdenyzotrce` (eu-west-1).
Dernière migration appliquée : **`v2_040_temps_de_repos`**.

> ⚠️ **Ce document remplace `SCHEMA-V2_2.md`**, qui décrivait un état antérieur aux
> routines et n'a plus valeur de référence. En cas de doute, la base fait foi — pas ce
> fichier. Il est régénéré, pas rédigé.

> **Mis à jour le 11/09/2026.** Dernière migration : **`v2_040_temps_de_repos`**.
> Prochain numéro libre : **`v2_041`**.

**Volumétrie :** 1 221 séances · 28 103 séries · 237 exercices · 255 alias · 116 pesées ·
6 profils dont 5 avec des séances · routines vides.

---

## Pièges à connaître avant d'écrire du code

**`validee_a` n'a plus de valeur par défaut** (`v2_039`). C'est délibéré.

> `rang` = **ordre d'affichage**. `validee_a` = **chronologie réelle**.
> `validee_a` s'écrit **à la validation de la série, jamais à son insertion**.

Le `DEFAULT now()` a été retiré parce qu'il rendait la règle impossible à tenir : si l'app
pré-crée les lignes vides d'une routine au démarrage d'une séance, chaque ligne aurait reçu
l'horodatage de la création. La chronologie serait fausse dès le premier jour, les tests
passeraient, et le moteur travaillerait sur une histoire inventée.

**`validee_a` est NULL sur les 28 103 séries importées.** Ne construis rien qui le suppose
renseigné.

**Deux colonnes sont générées** et ne doivent jamais être écrites :
`sessions.salle_norme` et `sets.elastique_norme` — repliage minuscules, accents, espaces,
traits d'union et apostrophes.

**`sets.groupe_superset`** porte le regroupement en blocs : 9 376 séries de travail y sont
rattachées. Anomalie connue à ne pas corriger : 13 blocs ne contiennent qu'un seul exercice.

**`sets_validee_si_saisie` interdit d'insérer une série non validée** quand `source = 'app'`.
Pré-créer les lignes vides d'une routine au démarrage d'une séance est donc **mécaniquement
impossible** — la base garantit ce qu'une convention ne pouvait que demander.

**`sessions.statut` vaut `'terminee'` PAR DÉFAUT**, et accepte `'en_cours'`. Une séance créée
au démarrage sans statut explicite serait donc immédiatement réputée terminée, et polluerait
l'historique et le moteur. **Écrire `en_cours` explicitement.**

**`sets.ressenti`** accepte `reste_3_plus`, `reste_2`, `reste_1`, `reste_0` — du RIR, plus
simple à donner qu'un RPE chiffré. **Aucun écran ne l'utilise encore**, alors que `sets.rpe`
n'est renseigné que sur 136 séries (0,5 %), toutes d'un seul utilisateur.

**Les identifiants sont des `uuid` avec `gen_random_uuid()` en défaut.** L'app peut donc les
**fabriquer côté client**, ce qui rend la synchronisation **idempotente** : la même ligne
envoyée deux fois écrase la même ligne. C'est ce qui rend l'écriture hors ligne faisable sans
résolution de conflit.

**Les étiquettes A1/B1/C1 ne sont jamais stockées** — elles se recalculent à l'affichage.
Même chose pour la dégressive, le rest-pause, le numéro de tour et la période
d'entraînement. Doctrine : une étiquette qui se déduit ne se stocke jamais.

---

## `sessions` — 1 221 lignes

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid NOT NULL | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | |
| `debut` | timestamptz NOT NULL | **attention au fuseau** pour tout regroupement par jour ou semaine |
| `fin` | timestamptz | renseignée sur les 1 221 |
| `titre`, `note` | text | texte utilisateur — **jamais interpolé dans du HTML** |
| `source` | text NOT NULL | `'app'` |
| `source_ref` | text | référence d'import |
| `statut` | text NOT NULL | `'terminee'` |
| `visibilite` | text NOT NULL | `'private'` |
| `routine_id` | uuid | → `routines(id)`, `ON DELETE SET NULL`. Ex-`program_day_id`, jamais alimentée |
| `fc_moyenne`, `fc_max`, `calories` | integer | **0 renseignée** — aucune source |
| `salle` | text | 1–60 caractères, non vide |
| `salle_norme` | text | **GÉNÉRÉE** |

## `sets` — 28 103 lignes

| Colonne | Type | Notes |
|---|---|---|
| `id`, `session_id`, `user_id` | uuid NOT NULL | |
| `exercise_slug` | text NOT NULL | → `exercises(slug)` |
| `charge_kg` | numeric | |
| `reps` | integer | |
| `duree_s` | integer | 1 776 renseignées (gainages, randos) |
| `distance_m` | numeric | randos |
| `type_serie` | text NOT NULL | `travail` 26 132 · `echauffement` 1 458 · `degressive` 387 · `echec` 126 |
| `validee_a` | timestamptz | **aucun défaut** — voir ci-dessus |
| `rang` | integer NOT NULL | ordre d'affichage |
| `groupe_superset` | integer | bloc |
| `poids_corps_kg` | numeric | |
| `ressenti` | text | |
| `rpe` | numeric(3,1) | **136 renseignées sur 28 103** (0,5 %), un seul utilisateur |
| `note` | text | texte utilisateur |
| `modifie_a` | timestamptz | |
| `elastique` | text | |
| `elastique_norme` | text | **GÉNÉRÉE** |
| `tempo_descente`, `tempo_pause`, `tempo_montee` | smallint | |
| `repos_s` | integer | **`v2_040`** — repos RÉEL avant cette série, 0 à 3600 s. Mesuré par le chronomètre **à partir de la validation** de la série précédente, donc le temps d'exécution n'y entre pas. **NULL sur les 28 103 importées** : l'export Hevy ne porte pas le repos |

## `exercises` — 237 lignes

| Colonne | Type | Notes |
|---|---|---|
| `slug` | text NOT NULL | clé |
| `nom` | text NOT NULL | libellé affiché |
| `famille` | text NOT NULL | **niveau de repli** quand l'exercice seul est trop rare |
| `charge`, `mesure` | text NOT NULL | nature de la charge et de la mesure |
| `parent` | text | variante d'un exercice |
| `muscles_primaires` | text[] NOT NULL | **pondération 1** dans le volume |
| `muscles_secondaires` | text[] NOT NULL | **pondération 0,5** |
| `coef_pdc`, `masse_depart_kg`, `masse_depart_reglable` | | poids de corps et masse machine |
| `compte_tonnage` | boolean NOT NULL | `false` par défaut |
| `equipement` | text | signature de parc, pas de lieu |
| `actif` | boolean NOT NULL | |

## `routines` / `routine_exercises` — vides (`v2_037`)

**La routine porte la structure, jamais les charges.** Les charges viennent du moteur.

`routines` : `user_id`, `nom` (1–60 car., unique par utilisateur parmi les non archivées),
`note`, `archivee_a` (archivage, pas suppression).

`routine_exercises` : `routine_id`, `exercise_slug`, `rang` (unique par routine, ≥ 0),
`groupe_superset` (même mécanisme que `sets`), `note`, **`repos_cible_s`** (`v2_040` — repos
**prescrit**, 5 à 1800 s, NULL = non prescrit, et NULL = « désactivé »).

> ⚠️ **`series` et `reps_visees` existent encore sur cette table et NE SONT PLUS NI LUES NI
> ÉCRITES** (chantier 43, `v2_042_routine_sets`). Deux entiers ne savaient dire qu'« il y a N
> séries identiques » : ni une rampe d'échauffement, ni des reps qui varient, ni une charge
> cible par série. Elles restent en base, avec leur `CHECK` et leur défaut, pour les lignes
> anciennes — le code les ignore. **Ne pas les relire.**

`routine_sets` (`v2_042_routine_sets`) — **une ligne par série programmée.** C'est là que vit
la structure d'une routine depuis le chantier 43 : 6 routines · 38 exercices · 143 séries à la
migration, dont 18 échauffements et 9 dégressives.

| colonne | contrainte |
|---|---|
| `routine_exercise_id` | NOT NULL → `routine_exercises`, **ON DELETE CASCADE** |
| `user_id` | **NOT NULL → `profiles(id)`** — ⚠️ contrairement à `routine_exercises`, qui n'en a pas |
| `rang` | NOT NULL, **≥ 1** — ⚠️ pas ≥ 0 comme `routine_exercises.rang` |
| `type_serie` | défaut `'travail'` · `travail` \| `echauffement` \| `degressive` \| `echec` |
| `reps_visees` | NULL ou 1–100 |
| `charge_cible_kg` | `numeric` NULL — **une CIBLE, jamais une charge observée** (ECRAN-SAISIE §7 quindecies.3) |
| `duree_cible_s` | NULL ou 1–35999 |
| `distance_cible_m` | NULL ou 0–100000 |

`routine_sets_rang_unique` (`routine_exercise_id`, `rang`) est **DIFFÉRABLE** — contrairement à
`routine_exos_rang_uniq`. C'est ce qui permet de remplacer les lignes d'un exercice en bloc
(DELETE puis INSERT) plutôt que de les renuméroter en place.

## Autres tables

`profiles` (6) · `body_weight_log` (116) · `exercise_alias` (255) ·
`user_exercise_model` (59) · `predictions` (0) · `sbd_profiles` et `workout_sessions`
(**archive v1, ne pas toucher**).

---

## RLS

**Toutes les tables l'ont actif.** Motif dominant : une policy unique `FOR ALL` sur le rôle
`authenticated`, `USING` = `WITH CHECK`, avec `auth.uid()` enveloppé dans un `SELECT`
(évite la réévaluation par ligne).

`routine_exercises` n'a pas de `user_id` : sa propriété est héritée de `routines` via un
`EXISTS`, avec le même `WITH CHECK` — c'est lui qui empêche de rattacher une ligne à la
routine d'autrui. `routine_sets`, elle, **porte son `user_id`** : le client doit donc le
renseigner à l'écriture (il n'a pas de défaut), là où une ligne de `routine_exercises` n'a
rien à dire de son propriétaire.

> **Le cloisonnement est le travail du RLS, pas du client.** Ne filtre pas sur `user_id`
> côté application : ça masquerait un RLS défaillant au lieu de le révéler.

---

## Règle de travail

**Claude.ai fait tout le Supabase** — migrations, RLS, vérification de données — via MCP.
**Lecture du schéma autorisée** pour Claude Code, afin de ne jamais coder sur des noms non
vérifiés. **Écriture, migration et RLS : jamais.**

Toujours `list_migrations` avant de nommer une migration : la numérotation a historiquement
déraillé. Prochain numéro libre au 11/09/2026 : **`v2_041`**.
