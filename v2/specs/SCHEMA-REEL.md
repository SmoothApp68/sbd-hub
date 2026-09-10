# Schéma réel — état au 10 septembre 2026

**Régénéré depuis la base**, projet Supabase `swwygywahfdenyzotrce` (eu-west-1).
Dernière migration appliquée : **`v2_039_validee_a_sans_defaut`**.

> ⚠️ **Ce document remplace `SCHEMA-V2_2.md`**, qui décrivait un état antérieur aux
> routines et n'a plus valeur de référence. En cas de doute, la base fait foi — pas ce
> fichier. Il est régénéré, pas rédigé.

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

`routine_exercises` : `routine_id`, `exercise_slug`, `rang` (unique par routine), `series`
(1–20, défaut 3), `reps_visees` (1–100, **indicatif** — le moteur recalcule la cible),
`groupe_superset` (même mécanisme que `sets`).

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
routine d'autrui.

> **Le cloisonnement est le travail du RLS, pas du client.** Ne filtre pas sur `user_id`
> côté application : ça masquerait un RLS défaillant au lieu de le révéler.

---

## Règle de travail

**Claude.ai fait tout le Supabase** — migrations, RLS, vérification de données — via MCP.
**Lecture du schéma autorisée** pour Claude Code, afin de ne jamais coder sur des noms non
vérifiés. **Écriture, migration et RLS : jamais.**

Toujours `list_migrations` avant de nommer une migration : la numérotation a historiquement
déraillé. Prochain numéro libre au 10/09/2026 : **`v2_040`**.
