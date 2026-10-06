# Schéma réel — état au 6 octobre 2026

**Régénéré depuis la base**, projet Supabase `swwygywahfdenyzotrce` (eu-west-1).
Dernière migration appliquée : **`v2_058_blocs_programmes`**. Prochain numéro libre : **`v2_059`**.

> ⚠️ **Ce document remplace `SCHEMA-V2_2.md`**, qui décrivait un état antérieur aux
> routines et n'a plus valeur de référence. En cas de doute, la base fait foi — pas ce
> fichier. Il est régénéré, pas rédigé.

> **Régénéré le 06/10/2026 depuis la base** (Claude.ai). Cette version reprend celle du 21/09 (`v2_047`) et
> ajoute, juste en dessous, **tout ce qui a changé de `v2_048` à `v2_058`** : colonnes, table nouvelle, contraintes,
> règles d'accès, volumétrie. Les sections par table plus bas datent du 21/09 ; quand elles divergent du bloc
> « Depuis le 21/09 », **c'est ce bloc qui fait foi**.

**Volumétrie régénérée le 06/10/2026 :** **1 260 séances · 29 036 séries** · 237 exercices (232 actifs, **100 avec un
mouvement**) · 117 pesées · **5 profils** · **10 routines (0 rangée en dossier) · 78 exercices de routine · 269 séries
programmées** · **82 prédictions** (toutes `moteur.consigne`) · **17 zones corrigées** (0 posée par un bloc) ·
**0 mode par exercice** · **0 bloc** · 0 série marquée douleur.

**Séries par type :** travail 26 861 · échauffement 1 588 · dégressive 434 · échec 128.
**Séances par source :** hevy 1 249 · app 11. **Séries par source :** hevy 28 861 · app 175.
**Séances saisies dans l'app avec `routine_id` :** 4 sur 10 (les autres sont des séances libres ou antérieures au
rattachement) — **la note « routine_id n'est pas rempli par les séances v2 » était fausse** : il l'est quand la séance
part d'une routine. La séance importée de Hevy le 02/10 a été rattachée à sa routine à la main.

## Depuis le 21/09 — migrations `v2_048` à `v2_058`

| Migration | Date | Ce qu'elle fait |
|---|---|---|
| `v2_048_sets_type_efface_observation` | 28/09 | Déclencheur `sets_efface_observation_type` : une série de travail qui change de type perd l'observation de ses paris, comme une série supprimée (MOTEUR §9.11, delta 49-17) |
| `v2_049_sets_type_efface_observation_sans_echec` | 29/09 | Variante : « échec » restait une série de travail (delta 49-18) — **annulée par `v2_050`** |
| `v2_050_sets_type_efface_observation_echec` | 29/09 | Une série de travail qui devient échauffement, dégressive **ou échec** perd l'observation de ses paris (delta 49-19) |
| `v2_051_profil_phase` | 30/09 | `profiles.phase` (`prise_de_masse` / `maintien` / `seche`, NULL = maintien) et `phase_depuis` |
| `v2_052_predictions_observation_escalier` | 01/10 | `predictions_observation_coherente` : une observation sans `set_observe` est permise pour `module = 'escalier'` |
| `v2_053_exercises_mouvement` | 03/10 | `exercises.mouvement` (text, NULL = sans frère) : 100 exercices, 22 mouvements (MOTEUR §13.6) |
| `v2_054_poids_du_corps` | 04/10 | `profiles.lest_reponse` (`oui` / `non` / NULL) et `lest_reponse_le` ; **table `modes_exercice`** (MOTEUR §9.17) |
| `v2_055_lest_pompes_et_regle_modes` | 04/10 | `pompes_lestees.parent = 'pompes'` ; la règle de `modes_exercice` réservée à `authenticated` |
| `v2_056_sets_douleur_occurrence` | 05/10 | `sets.douleur` (boolean NOT NULL, défaut false) et `sets.occurrence` (uuid, NULL pour les séances importées ou anciennes) (MOTEUR §9.20, §9.19) |
| `v2_057_routines_dossier` | 05/10 | `routines.dossier` (text, NULL = hors dossier ; CHECK `routines_dossier_ok` : sans espace autour, 1 à 40 caractères) (ECRAN-SAISIE, Organiser) |
| `v2_058_blocs_programmes` | 05/10 | **Table `blocs`** ; `zones_exercice.origine` (`personne` / `bloc`) et `zones_exercice.bloc_id` ; `predictions_observation_coherente` accepte aussi `module = 'programme'` (MOTEUR §9.22, §9.1.2, §19.2) |

**Données corrigées hors migration** (avec répétition à blanc) : 4 séries de `muscle_up_assiste` passées en négatif
(l'aide se range en négatif : 129 séries sur 129 désormais) ; la séance Hevy du 02/10 importée (27 séries) et rattachée
à « Vendredi — Bas B (Soulevé) ».

### Colonnes ajoutées

| Table | Colonnes |
|---|---|
| `sets` | `douleur` boolean NOT NULL = false · `occurrence` uuid (déjà présentes et non décrites plus bas : `source` text NOT NULL = 'app', `repos_s`, `elastique`, `elastique_norme`, `tempo_descente`, `tempo_pause`, `tempo_montee`, `modifie_a`, `note`, `rpe`) |
| `profiles` | `phase` text (CHECK) · `phase_depuis` timestamptz · `lest_reponse` text (CHECK `oui`/`non`) · `lest_reponse_le` timestamptz |
| `exercises` | `mouvement` text |
| `routines` | `dossier` text (CHECK `routines_dossier_ok`) |
| `zones_exercice` | `origine` text NOT NULL = 'personne' (CHECK `personne`/`bloc`) · `bloc_id` uuid → `blocs(id)` ON DELETE SET NULL |

### Table nouvelle : `modes_exercice` — 0 ligne · créée par `v2_054`

`id` uuid PK = gen_random_uuid() · `user_id` uuid NOT NULL → `profiles(id)` ON DELETE CASCADE · `exercise_slug` text
NOT NULL → `exercises(slug)` · `mode` text NOT NULL CHECK (`progresser` / `entretien`) · `choisi_a` timestamptz NOT NULL
= now() · `created_at` timestamptz NOT NULL = now(). Index `modes_exercice_courant_idx (user_id, exercise_slug,
choisi_a DESC)`. **Patron de `zones_exercice`** : une ligne par changement, la dernière fait foi. RLS :
`modes_exercice_owner` [authenticated, ALL] `user_id = (select auth.uid())`.

### Table nouvelle : `blocs` — 0 ligne · créée par `v2_058`

`id` uuid PK = gen_random_uuid() · `user_id` uuid NOT NULL → `profiles(id)` ON DELETE CASCADE · `dossier` text NOT NULL
(CHECK `blocs_dossier_ok` : sans espace autour, 1 à 40 caractères) · `zone` text NOT NULL CHECK (`lourd` / `mix`) ·
`debut` date NOT NULL · `semaines` integer NOT NULL CHECK 3..6 · `decharge` boolean NOT NULL = true · `exercices` text[]
NOT NULL (au moins 1) · `statut` text NOT NULL = 'en_cours' CHECK (`en_cours` / `termine` / `arrete`) · `precedent` uuid
→ `blocs(id)` ON DELETE SET NULL · `created_at`, `modifie_a` timestamptz NOT NULL = now().
Index unique partiel **`blocs_un_en_cours (user_id, dossier) WHERE statut = 'en_cours'`** : un seul bloc en cours par
dossier. RLS : `blocs_owner` [authenticated, ALL] `user_id = (select auth.uid())`.
**Une zone posée par un bloc** s'écrit dans `zones_exercice` avec `origine = 'bloc'` et `bloc_id` : c'est toujours la
même table, la déclaration la plus récente l'emporte (MOTEUR §9.1.2). Supprimer un bloc ne supprime pas ses zones
(le lien passe à NULL).

### Notes de ménage (06/10)

- **L'alias abîmé de `developpe_couche_decline_barre` est volontaire — ne pas le supprimer.** Le texte
  « Développé Couch�� Décliné (Barre) » est celui de l'export Hevy, abîmé à la source ; l'alias (`hevy_corrompu`)
  permet de le reconnaître à l'import.
- **`routine_exercises.series`** (integer NOT NULL = 3, remplie sur les 78 lignes) et **`routine_exercises.reps_visees`**
  (integer, vide) sont **redondantes** depuis `routine_sets` (`v2_042`), qui fait foi pour la structure d'une routine.
  Aucune vue ni fonction de la base n'en dépend ; la répétition à blanc de leur retrait a réussi le 06/10. **À retirer en
  `v2_059` une fois vérifié qu'aucun code v2 ne les nomme.** D'ici là, le code ne doit ni les lire ni les écrire.

### Règles d'accès (état au 06/10)

- **En `authenticated`, propriétaire** : `sets`, `sessions`, `routines`, `routine_exercises`, **`routine_sets`** (n'est
  plus en `public`), `predictions`, `zones_exercice`, `modes_exercice`, **`blocs`**, `body_weight_log`, `user_exercise_model`.
- **Encore en `public`** (rôle à resserrer à la passe sécurité, les conditions protègent déjà) : `profiles` (4 règles,
  `auth.uid() = id` — écrites sans `(select …)`), `exercises` (4 règles), et les tables v1 `sbd_profiles`,
  `workout_sessions`.
- **Le catalogue n'est pas modifiable par un utilisateur** (vérifié le 05/10) : les droits de colonne `INSERT` /
  `UPDATE` existent, mais `exercises_modif`, `exercises_suppression` et `exercises_creation` exigent `proprietaire =
  auth.uid()` ; un exercice partagé (`proprietaire` NULL) est lisible par tous et modifiable par personne. **Le point
  « catalogue modifiable » de la passe sécurité tombe.**

## Pièges à connaître avant d'écrire du code

**`validee_a` n'a plus de valeur par défaut** (`v2_039`). C'est délibéré.

> `rang` = **ordre d'affichage**. `validee_a` = **chronologie réelle**.
> `validee_a` s'écrit **à la validation de la série, jamais à son insertion**.

Le `DEFAULT now()` a été retiré parce qu'il rendait la règle impossible à tenir : si l'app
pré-crée les lignes vides d'une routine au démarrage d'une séance, chaque ligne aurait reçu
l'horodatage de la création. La chronologie serait fausse dès le premier jour, les tests
passeraient, et le moteur travaillerait sur une histoire inventée.

**`validee_a` est NULL sur les 28 688 séries importées.** Ne construis rien qui le suppose
renseigné.

**Deux colonnes sont générées** et ne doivent jamais être écrites :
`sessions.salle_norme` et `sets.elastique_norme` — repliage minuscules, accents, espaces,
traits d'union et apostrophes.

**`sets.groupe_superset`** porte le regroupement en blocs : **9 484 séries** y sont
rattachées, tous les blocs valides.

> ✅ **Corrigé par `v2_041`** (12/09/2026). 13 blocs ne contenaient qu'un seul exercice — un
> groupe de superset décrit une alternance, avec un seul exercice il ne décrit rien. 49 séries
> sur 12 séances et 3 comptes sont repassées en bloc simple. **Plus aucun orphelin.**

**`sets_validee_si_saisie` interdit d'insérer une série non validée** quand `source = 'app'`.
Pré-créer les lignes vides d'une routine au démarrage d'une séance est donc **mécaniquement
impossible** — la base garantit ce qu'une convention ne pouvait que demander.

**`sessions.statut` vaut `'terminee'` PAR DÉFAUT**, et accepte `'en_cours'`. Une séance créée
au démarrage sans statut explicite serait donc immédiatement réputée terminée, et polluerait
l'historique et le moteur. **Écrire `en_cours` explicitement.**

**`sets.ressenti`** accepte `reste_3_plus`, `reste_2`, `reste_1`, `reste_0` — du RIR, plus
simple à donner qu'un RPE chiffré. **Aucun écran ne l'utilise encore**, alors que `sets.rpe`
n'est renseigné que sur **288 séries** (1 %). `ressenti` : **6 séries**, toutes saisies
dans l'app.

**Les identifiants sont des `uuid` avec `gen_random_uuid()` en défaut.** L'app peut donc les
**fabriquer côté client**, ce qui rend la synchronisation **idempotente** : la même ligne
envoyée deux fois écrase la même ligne. C'est ce qui rend l'écriture hors ligne faisable sans
résolution de conflit.

**Les étiquettes A1/B1/C1 ne sont jamais stockées** — elles se recalculent à l'affichage.
Même chose pour la dégressive, le rest-pause, le numéro de tour et la période
d'entraînement. Doctrine : une étiquette qui se déduit ne se stocke jamais.

---

## Ménage de la base — 15/09/2026

**La base fait 13 Mo sur les 500 du forfait gratuit.** Aucune série orpheline, aucune ligne de
routine orpheline. Ce qui a été fait :

- **`backup_ws_nomenclature_20260709` supprimée** — 881 séances, toutes présentes dans
  `workout_sessions` qui en a 891. **Sous-ensemble strict : elle ne protégeait rien.**
- **Compte `alex` supprimé** — 0 séance, 0 série, 0 routine. 5 profils pour 5 comptes auth.
- **Routine de test « Test 1 » supprimée.**
- **Les 12 tables portent désormais un commentaire.** Les v1 sont marquées
  `ARCHIVE — FIGÉE, ne plus écrire` avec leur date de dernière écriture (22/07/2026) ; les v2
  disent ce qu'elles remplacent.

> **Conservé délibérément** : `workout_sessions` (891 séances) et `sbd_profiles`, 3,6 Mo.
> Elles ne disent **pas** la même chose que la v2 — 891 séances d'origine contre 1 234 après
> découpage. C'est l'archive et le filet de comparaison.

**Import du 15/09** : 13 séances et 301 séries du 31/08 au 15/09, depuis l'export Hevy. Elles
portent `source = 'hevy'` — **ce sont les dernières couvertes par le filet de l'export.**

**5 routines créées** pour `aurel_br`, construites sur les séances d'août-septembre : lundi
quads, mardi pecs-dos, jeudi épaules-bras, vendredi ischios, samedi haut du corps. Plus
« Test superset » conservée pour les essais.

---

## Migrations du 17 et 18/09/2026

**`v2_043_profil_et_ordre_routines`** — sept colonnes de profil (`anciennete` en fourchette,
`intention`, `materiel`, `niveau_declare`, `seances_par_semaine`, `jours_vises`,
`duree_seance_min`) et **`routines.rang`** avec `routines_user_rang_uniq` sur les
non-archivées, initialisé sur l'ordre alphabétique.

**`v2_044_pseudo_unique`** puis **`v2_045_pseudo_libre_param_nom`** — trou trouvé au
chantier 46 : **deux comptes pouvaient prendre le même pseudo**, et rien ne le signalait.
`idx_profiles_username` n'était pas unique, et le RLS empêchait le client de savoir — un
select rendait « zéro ligne » pour un pseudo pris comme pour un libre.

- `profiles_username_uniq` : index unique sur `lower(username)`, hors comptes supprimés ;
- `pseudo_libre(nom text)` en **SECURITY DEFINER** — la seule façon pour un client de savoir,
  sans lui ouvrir la table.

> ⚠️ **L'argument s'appelle `nom`, et ne doit jamais être renommé.** PostgREST résout une RPC
> par le nom de l'argument : `p_pseudo` rendait un `PGRST202` permanent et l'app restait
> silencieuse. Le contrat est fixé par `donnees.js:464` et deux tests.

## Migration du 19/09/2026

**`v2_046_moteur_rythme_zones_verrou`** — chantier 48 (MOTEUR §9.1.2, §9.8, §9.11) :

- **`profiles.rythme_progression`** : `text not null default 'normal'`, contrainte `in ('prudent', 'normal', 'franc')` ; les 5 profils en `normal`. L'intention reste dans `profiles.intention` (`v2_043`).
- **`zones_exercice`** (nouvelle, étage 1 — déclaré, append-only) : `id`, `user_id` (→ `profiles`), `exercise_slug` (→ `exercises.slug`), `zone` (`lourd`, `mix`, `hypertrophie`, `volume`, `series_longues`, ou vide = retour à la déduction), `corrigee_a`, `created_at`. Zone courante = dernière ligne par (`user_id`, `exercise_slug`), index `zones_exercice_courante_idx`. RLS `zones_exercice_owner`, avec `(select auth.uid())`.
- **Verrou d'immuabilité sur `predictions`** : trigger `predictions_immuable` (`BEFORE UPDATE`, fonction `predictions_refuse_modification`), qui refuse toute modification sauf `valeur_observee`, `observee_a`, `set_observe`. Il compare la ligne entière moins ces colonnes : **toute colonne ajoutée plus tard est verrouillée par défaut**. Refus en `check_violation`. Autotesté, trace effacée. *Précisé le 21/09 :* depuis `v2_047`, la colonne calculée `session_id` est aussi exclue de la comparaison — voir ci-dessous ; cela ne desserre rien, puisque `fondement`, sa source, reste comparé.

Vérifié après application : 5 profils en `normal`, 0 prédiction, séries intactes.

## Migration du 21/09/2026

**`v2_047_predictions_integrite`** — fin du chantier 48 (MOTEUR §9.11). Trou trouvé en base
après la vérification de 48c-2 : deux séances de test supprimées avaient laissé **24
prédictions orphelines**, dont 8 « comptées sans série » — la clé de `set_observe`, en
`ON DELETE SET NULL`, ne vidait que le lien et laissait les reps. Trois règles, aucun
changement d'app :

- **Une séance supprimée emporte ses prédictions.** Colonne **`predictions.session_id`**,
  `uuid` **GÉNÉRÉE** (`(fondement ->> 'seance')::uuid`) — ne jamais l'écrire. Clé
  `predictions_session_fk` → `sessions(id)` **ON DELETE CASCADE**, index
  `predictions_session_idx`.
  > ⚠️ **La cascade ne tient que si le fondement porte la clé `seance`.** Une prédiction écrite
  > sans elle a `session_id` vide et **survit à la suppression de sa séance**. Non vérifiable
  > au 21/09 (table vide) : à contrôler sur la première vraie séance.
- **Une série supprimée emporte toute son observation.** Trigger **`sets_efface_observation`**
  (`BEFORE DELETE ON sets`) : remet `set_observe`, `valeur_observee` et `observee_a` à NULL sur
  les prédictions qui la désignent — sauf celles dont la séance est déjà supprimée, que la
  cascade emporte.
- **Une observation comptée sans série est impossible.** Contrainte
  **`predictions_observation_coherente`** : `valeur_observee` NULL ou `set_observe` renseigné,
  et `valeur_observee` NULL **si et seulement si** `observee_a` NULL.

**La répétition à blanc (9 tests) a trouvé deux pièges avant d'écrire.** PostgreSQL calcule
une colonne générée **après** les déclencheurs `BEFORE` : `predictions_immuable` voyait
`session_id` vide dans `NEW`, et aurait refusé **toutes** les observations — d'où son exclusion
de la comparaison. Et l'ordre des cascades à la suppression d'une séance : les séries partent
avec elle, et `sets_efface_observation` ne doit pas écrire sur une prédiction que la cascade
emporte déjà.

Les 24 prédictions orphelines ont été emportées : **`predictions` est vide au 21/09.**

---

## `predictions` — 0 ligne · créée par `v2_006`, verrouillée par `v2_046`, intègre depuis `v2_047`

**Étage 3 : ce que le moteur affirme.** Une ligne par série de travail proposée (MOTEUR §9.11).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid NOT NULL | défaut `gen_random_uuid()`, mais **fabriqué par l'app** (identifiant déterminé, voir MOTEUR §9.11) |
| `user_id` | uuid NOT NULL | → `auth.users`, CASCADE |
| `module`, `module_version` | text NOT NULL | qui a prédit, et dans quelle version |
| `emise_a` | timestamptz NOT NULL | défaut `now()` |
| `exercise_slug` | text | → `exercises(slug)` |
| `grandeur` | text NOT NULL | `reps` pour la consigne |
| `horizon_jours` | integer | |
| `valeur_predite` | numeric NOT NULL | **le pari** |
| `borne_basse`, `borne_haute` | numeric | `predictions_bornes_ordonnees` |
| `fondement` | jsonb | les entrées du calcul ; **porte la clé `seance`** |
| `valeur_observee`, `observee_a`, `set_observe` | | **les seules modifiables après coup** ; `set_observe` → `sets(id)` `ON DELETE SET NULL` |
| `created_at` | timestamptz NOT NULL | arrivée en base |
| `session_id` | uuid | **GÉNÉRÉE** depuis `fondement ->> 'seance'` (`v2_047`) |

Index : `predictions_en_attente_idx` (non observées), `predictions_user_module_idx`,
`predictions_session_idx`. RLS `predictions_owner`, avec `(select auth.uid())`.

> ⚠️ **Commentaire périmé en base** : `predictions.valeur_observee` se dit encore « seul champ
> que l'on a le droit de renseigner après coup ». Depuis `v2_046`, ils sont trois. À corriger
> dans la prochaine migration qui touche la table — la base fait foi pour les colonnes, pas
> pour ses commentaires.

## `zones_exercice` — 6 lignes · créée par `v2_046`

**Étage 1 : déclaré, ajout seulement.** Une ligne = une correction datée de la zone d'un
exercice ; la dernière par (`user_id`, `exercise_slug`) fait foi, une zone vide rend la main
à la déduction. **Pas d'unicité** : c'est voulu. Contenu au 21/09 : 6 corrections de
`aurel_br`, sur deux exercices, toutes du 20/09 (essais de 48b).

## `routine_sets` — 280 lignes · créée par `v2_042` le 15/09/2026

**Miroir de `sets` pour les routines.** Une ligne par série programmée. La symétrie est le
point : l'éditeur de routine et l'écran de séance lisent la même forme, donc le même code de
rendu (`CADRAGE-V2` §2 undecies).

| Colonne | Contrainte |
|---|---|
| `routine_exercise_id` | NOT NULL → `routine_exercises`, **ON DELETE CASCADE** |
| `user_id` | **NOT NULL → `profiles(id)`, sans défaut** — ⚠️ contrairement à `routine_exercises`, qui n'en a pas |
| `rang` | NOT NULL, **≥ 1** — ⚠️ pas ≥ 0 comme `routine_exercises.rang` |
| `type_serie` | défaut `'travail'` · `travail` \| `echauffement` \| `degressive` \| `echec`, les quatre types de `sets` |
| `reps_visees` | NULL ou 1–100 |
| `charge_cible_kg` | `numeric` NULL — **une CIBLE, jamais une charge observée**, facultative : le moteur propose la charge en séance (`ECRAN-SAISIE-V1` §7 quindecies.3) |
| `duree_cible_s` | NULL ou 1–35999 |
| `distance_cible_m` | NULL ou 0–100000 |
| `created_at` | NOT NULL, défaut `now()` |

`routine_sets_rang_unique` (`routine_exercise_id`, `rang`) est **DIFFÉRABLE, initialement
différée** — contrairement à l'unicité de `routine_exercises`. C'est ce qui permet de remplacer
les lignes d'un exercice en bloc (DELETE puis INSERT), ou de réordonner par des positions en
collision, plutôt que de les renuméroter en place.

RLS strictement propriétaire (voir la section RLS).

**Contenu au 19/09** : **11 routines · 79 exercices · 280 séries programmées**, dont
**33 échauffements** — ce que `routine_exercises.series` (un entier) ne pouvait pas décrire.

- `aurel_br` : 6 routines · 44 exercices · 152 séries · 18 chauffes
- `alexis` : 5 routines · 35 exercices · 128 séries · 15 chauffes

---

## `sessions` — 1 249 lignes

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid NOT NULL | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | |
| `debut` | timestamptz NOT NULL | **attention au fuseau** pour tout regroupement par jour ou semaine |
| `fin` | timestamptz | renseignée sur les 1 249 |
| `titre`, `note` | text | texte utilisateur — **jamais interpolé dans du HTML** |
| `source` | text NOT NULL | `'app'` |
| `source_ref` | text | référence d'import |
| `statut` | text NOT NULL | `'terminee'` |
| `visibilite` | text NOT NULL | défaut `'private'` ; **l'import a écrit `'mutuels'`** sur les séances Hevy. Inerte — aucune policy ne lit cette colonne |
| `routine_id` | uuid | → `routines(id)`, `ON DELETE SET NULL`. Ex-`program_day_id`, jamais alimentée |
| `fc_moyenne`, `fc_max`, `calories` | integer | **0 renseignée** — aucune source |
| `salle` | text | 1–60 caractères, non vide. **2 séances renseignées** — l'écran de fin existe depuis le chantier 26 |
| `salle_norme` | text | **GÉNÉRÉE** |

## `sets` — 28 768 lignes

| Colonne | Type | Notes |
|---|---|---|
| `id`, `session_id`, `user_id` | uuid NOT NULL | |
| `exercise_slug` | text NOT NULL | → `exercises(slug)` |
| `charge_kg` | numeric | |
| `reps` | integer | |
| `duree_s` | integer | 1 799 renseignées (gainages, randos) |
| `distance_m` | numeric | randos |
| `type_serie` | text NOT NULL | `travail` 26 665 · `echauffement` 1 550 · `degressive` 425 · `echec` 128 |
| `validee_a` | timestamptz | **aucun défaut** — voir ci-dessus |
| `rang` | integer NOT NULL | ordre d'affichage |
| `groupe_superset` | integer | bloc |
| `poids_corps_kg` | numeric | |
| `ressenti` | text | **6 renseignées**, toutes venues de l'app |
| `rpe` | numeric(3,1) | **288 renseignées** |
| `note` | text | texte utilisateur |
| `modifie_a` | timestamptz | |
| `elastique` | text | |
| `elastique_norme` | text | **GÉNÉRÉE** |
| `tempo_descente`, `tempo_pause`, `tempo_montee` | smallint | |
| `repos_s` | integer | **`v2_040`** — repos RÉEL avant cette série, 0 à 3600 s. Mesuré par le chronomètre **à partir de la validation** de la série précédente, donc le temps d'exécution n'y entre pas. **NULL sur 28 693 séries** : l'export Hevy ne porte pas le repos |

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

## `routines` / `routine_exercises` — 11 et 79 lignes

**La routine porte la structure, jamais les charges.** Les charges viennent du moteur.

`routines` : `user_id`, `nom` (1–60 car., unique par utilisateur parmi les non archivées),
`note`, `archivee_a`, **`rang`** (`v2_043`, avec `routines_user_rang_uniq` sur les
non-archivées).

> ⚠️ **L'archivage est abandonné** (`ECRAN-SAISIE-V1` §7 duodecies.1) : la suppression le
> remplace depuis le chantier 41. `archivee_a` reste en base mais **n'est plus écrite**, et
> **aucune routine ne la porte** au 19/09.

`routine_exercises` : `routine_id`, `exercise_slug`, `rang` (unique par routine, ≥ 0),
`groupe_superset` (même mécanisme que `sets`), **`repos_cible_s`** (`v2_040` — repos
**prescrit**, 5 à 1800 s, **NULL = désactivé**, `ECRAN-SAISIE-V1` §7 sexdecies.3).

> ⚠️ **`series` et `reps_visees` existent encore sur `routine_exercises` et NE SONT PLUS NI
> LUES NI ÉCRITES** (chantier 43, `v2_042_routine_sets`). Deux entiers ne savaient dire qu'« il
> y a N séries identiques » : ni une rampe d'échauffement, ni des reps qui varient, ni une
> charge cible par série. `routine_sets` porte une ligne par série, avec son type. Elles restent
> en base, avec leur `CHECK` et leur défaut, pour les lignes anciennes — le code les ignore.
> **Ne pas les relire**, et les retirer un jour : deux sources pour la même information, ce que
> le `CADRAGE-V2` §2 undecies interdit.

## Autres tables

`profiles` (5) · `body_weight_log` (116) · `exercise_alias` (255) ·
`user_exercise_model` (59, un seul calcul du 23/08, **append-only par doctrine**) ·
`predictions`, `zones_exercice` et `routine_sets` : voir leurs sections · `sbd_profiles` et `workout_sessions`
(**archive v1, ne pas toucher**).

---

## RLS

**Toutes les tables l'ont actif.** Motif dominant : une policy unique `FOR ALL` sur le rôle
`authenticated`, `USING` = `WITH CHECK`, avec `auth.uid()` enveloppé dans un `SELECT`
(évite la réévaluation par ligne).

> ⚠️ **Contredit par l'advisor Supabase le 19/09/2026** : 66 politiques sont signalées pour
> réévaluer `auth.uid()` à chaque ligne. **Recompté le 21/09 par schéma** : 52 dans `archive`
> (tables v1), 2 dans `storage`, **14 dans `public`** — dont 9 sur les tables v1 archivées
> (`sbd_profiles`, `workout_sessions`) et **5 seulement sur des tables v2** : les quatre de
> `profiles` (`profiles_select_own`, `_insert`, `_update`, `_delete`) et `routine_sets_owner`.
> À corriger à la passe sécurité. Les politiques de `v2_046` et `predictions_owner` suivent le
> motif.

`routine_exercises` n'a pas de `user_id` : sa propriété est héritée de `routines` via un
`EXISTS`, avec le même `WITH CHECK` — c'est lui qui empêche de rattacher une ligne à la
routine d'autrui. `routine_sets`, elle, **porte son `user_id`** : le client doit donc le
renseigner à l'écriture (il n'a pas de défaut).

> **Le cloisonnement est le travail du RLS, pas du client.** Ne filtre pas sur `user_id`
> côté application : ça masquerait un RLS défaillant au lieu de le révéler.

---

## Règle de travail

**Claude.ai fait tout le Supabase** — migrations, RLS, vérification de données — via MCP.
**Lecture du schéma autorisée** pour Claude Code, afin de ne jamais coder sur des noms non
vérifiés. **Écriture, migration et RLS : jamais.**

Toujours `list_migrations` avant de nommer une migration : la numérotation a historiquement
déraillé. Prochain numéro libre au 21/09/2026 : **`v2_048`**.
