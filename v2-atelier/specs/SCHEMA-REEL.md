# Schéma réel — état au 24 octobre 2026

**Régénéré depuis la base**, projet Supabase `swwygywahfdenyzotrce` (eu-west-1).
Dernière migration appliquée : **`v2_123`** (la dernière série « Au max », 193-6 ; `v2_122` : l'ondulation, 193-3) ; avant elles **`v2_120`** (la série de recul, 193-1) ; avant elle **`v2_119`** (`profiles.ma_salle` : le plus petit disque et la barre de traction, 190 ; appliquée par Claude.ai avant la PR). Prochain numéro libre : **`v2_120`** (`v2_113` et `v2_115` : voir le dépôt/la base avant de s'y fier).
⚠️ **`v2_106` n'a jamais été lancée** (décision du 22/10 : le volume reste un record) : le numéro reste vide.

**Volumétrie (24/10, 2 h 30)** : 1 288 séances · 29 673 séries · 860 exercices (848 actifs) · 961 alias
(`exercise_alias`) · 361 prédictions · 3 647 records · 9 profils · 36 règles d'accès.

## Le 31/10/2026 — `v2_123` (la dernière série « Au max », 193-6)

**`v2_123`** (appliquée par Claude.ai avant la PR) : **`routine_sets.au_max boolean NOT NULL DEFAULT false`** (la ligne de routine est marquée « Au max » ; au plus une par exercice, la dernière série de travail ou de recul) et **`sets.au_max_reserve smallint NULL`** avec la contrainte `sets_au_max_reserve_ok` (`au_max_reserve IS NULL OR au_max_reserve BETWEEN 0 AND 3`). `au_max_reserve` est la réserve **DEMANDÉE** à cette série : 0 = jusqu'à l'échec, 1 à 3 = « en gardant N reps » ; NULL = pas une série « Au max ». C'est une intention écrite à la validation depuis la ligne du plan (comme `repos_s`), jamais une mesure ; la réserve **faite** reste `rpe`/`reserve_reps`. Aucun nouveau type de série : « Au max » est un drapeau, la série reste `travail` ou `recul` (jamais un `echec` écrit automatiquement). Lues par `COLONNES_SET` (`seance.js`) et `COLONNES_ROUTINE_SET` (`donnees.js`). RLS inchangé. Le refus ou l'accord d'une proposition vit dans `profiles.cartes_semaine.au_max` (jsonb existant, pas de SQL).

## Le 31/10/2026 — `v2_122` (l'ondulation, 193-3)

**`v2_122_routine_exercises_zone`** (appliquée par Claude.ai avant la PR) : `routine_exercises.zone text NULL` et la contrainte
`routine_exercises_zone_ok` (`zone IS NULL OR zone IN ('lourd','mix','hypertrophie','volume','series_longues')`). NULL =
« Automatique » : le coach lit la zone dans les séances, comme avant. Un choix **explicite** (l'éditeur de routine, plus tard le
générateur), jamais déduit de `routine_sets.reps_visees`. RLS inchangé (la propriété s'hérite de `routines`). Lue par
`COLONNES_ROUTINE_EXO` (`donnees.js`), écrite par `routines.js` (`CHAMPS_EXERCICE`, `normaliserExercice`) et la file (op `plan`).

## Depuis le 22/10 — migrations `v2_101` à `v2_109` (régénéré depuis la base par Claude.ai le 24/10/2026)

> v2_101 à v2_105 et v2_107 lancées par Aurélien dans l'éditeur SQL le 23/10 au matin ; v2_108 et v2_109 lancées par
> Claude.ai le 23/10 à 16 h 30 (essai `__ESSAI__ = true` puis réel). Toutes essayées d'abord sur une réplique locale
> (Postgres 16) et vérifiées en lecture. Absentes de `list_migrations`.

| Migration | Ce qu'elle fait |
|---|---|
| `v2_101` (mesures) | **`exercises.champs_series`** (text[] NOT NULL, défaut `{}` ; `exercises_champs_series_ok` : ⊂ `{denivele_m, etages}`) — les colonnes de `sets` en plus de la mesure : `{denivele_m}` sur Randonnée, Trail, Ski de randonnée, VTT, Cyclisme ; `{etages}` sur Escaliers ; **`sets.denivele_m`** (integer, 1 à 10 000, facultatif, jamais 0) et **`sets.etages`** (integer, 1 à 2 000) ; Vélo d'appartement, Spinning, Rameur passent en `distance_temps` ; **`profiles.completer_refus`** (text[], « slug:colonne », les « Je ne sais plus » de « Ce qui manque à tes séances ») ; `social_detail_seance` et `groupe_direct` rendent aussi `denivele_m`, `etages`, `elastique` (DROP + CREATE, droits : `authenticated`, `service_role`) |
| `v2_102` (élastiques) | `exercises.charge` accepte **`'elastique'`** (l'élastique fait résistance ; `exercises_charge_elastique_ok` : `equipement = 'elastique'` et `mesure = 'reps'`) ; **`exercises.type_elastique`** (`grand` \| `mini`, `exercises_type_elastique_ok` : obligatoire sur un exercice à l'élastique qui aide ou résiste, `mini` seulement en résistance) ; Leg Curl Nordique Assisté (Élastique) devient une aide ; `ma_salle.mini_bandes` (`[{nom}]`, 10 au plus, sans kg). `sets.elastique` et `sets.elastique_norme` existaient déjà (v2_034) |
| `v2_103` (index) | **`sets_exercise_slug_idx`** sur `sets(exercise_slug)` (les lectures par exercice qui ne partent pas de `user_id`). Notés, non faits : FK `objectifs.pari_id` (l'ordre d'envoi de la file d'abord), FK `groupe_recaps.groupe_id` (abandonnée : la cascade effacerait des récaps figés, D7) |
| `v2_104` (mois sociaux) | Quatre fonctions sociales bornent leurs périodes en heure de Paris (une séance à 0 h 30 le 1ᵉʳ tombait dans le mois d'avant) |
| `v2_105` (bio sociale) | `social_profil` rend une colonne de plus, **`bio`** (en dernier, espaces de bord retirés) — la bio a un lecteur (137) |
| ~~`v2_106`~~ | **jamais lancée** (récap sans volume : abandonné le 22/10) |
| `v2_107` (blocage groupe) | `groupe_etat` ne rend plus un membre lié par un blocage (`social_bloque`) ; `groupe_invitations_recues` cache une invitation vers un groupe où un membre a un blocage avec moi (`groupe_bloque_avec`) ; le déclencheur `groupe_apres_blocage` retire aussi les invitations d'un tiers (142) |
| `v2_108` (figures) | **`exercises.echelle_seuil_s`** (smallint, 1 à 600 ; `exercises_echelle_seuil_ok` : seulement sur un exercice d'échelle) — la tenue qui ouvre la marche suivante ; vide au sommet et pour les échelles en reps ; nouvel exercice **`back_lever_groupe_avance`** ; six échelles de figures : `front_lever` (5 marches), `back_lever` (4), `planche_street` (5), `l_sit` (4), `poirier` (2), `drapeau` (2) — 61 exercices en échelle, 19 seuils (149) |
| `v2_109` (records hors des barres) | `records.type` accepte **`allure`**, **`marche`**, **`denivele_m`**, **`etages`** ; `records.unite` accepte **`s_km`**, **`s_100m`**, **`s_500m`** ; colonne **`records.palier_m`** (integer ; `records_allure_ok` : obligatoire et > 0 pour `allure`, vide sinon ; `allure` : `valeur` > 0 en secondes par unité, **plus bas = mieux**) ; `guilde_semaine` (colonne `medailles`) compte aussi `volume_seance` et les quatre nouveaux types (153) |
| `v2_110` (bornes durée et distance) | `sets_duree_borne` : `duree_s` NULL ou 1 à 86 399 ; `sets_distance_borne` : `distance_m` NULL ou > 0 et ≤ 1 000 000. Un filet plus large que l'app (9:59:59, 400 km), l'import Hevy ne bornant pas. Lancée par Claude.ai le 24/10/2026 (essai puis vrai) |
| `v2_111` (barre chargée, 159) | `profiles.ma_salle` accepte deux clés booléennes, **`barre_ez_chargee`** et **`barre_droite_chargee`** (absentes = non) ; contraintes `profiles_ma_salle_ok` (liste des clés) et `profiles_ma_salle_chargees_ok` (type) |
| `v2_112` (assistant IA, 160) | **`assistant_questions`** (id, cree_a, exercise_slug, etat, question ≤ 500, reponse ≤ 2000, contexte jsonb, bloquee, `raison` ∈ nombre_absent · sante · erreur_modele · vide, modele — **aucun `user_id`** : les questions se gardent 30 jours sans lien avec le compte) ; **`assistant_quota`** (user_id, jour, n) ; **`profiles.assistant_accord_a`** (timestamptz, écrite par l'app, facultative en lecture/écriture) ; RPC **`assistant_prendre_question(p_user, p_max) → int`** (le reste, −1 au quota ; jour en heure de Paris ; `service_role` seulement). RLS active sur les deux tables, **aucune règle** : seule la fonction y accède. **Écart : la fonction SQL ne purge pas** — la purge (questions de plus de 30 jours, quota de plus de 2 jours) est faite par la fonction Edge `demander-coach` (24/10/2026, décision d'Aurélien) |
| `v2_114` (groupe seul, 177, 28/10/2026) | **`groupe_liberer`** : quelqu'un qui est SEUL dans son groupe peut en partir (créer ou rejoindre un autre) même séance en cours ; son groupe vide se fige et disparaît. Avec un autre membre actif, `groupe_deja_dans_un` reste. Appliquée par Claude.ai ; aucune table ni colonne ajoutée |
| `v2_116` (saisie vérifiée, 185, 29/10/2026) | **`sets.hors_calcul`** boolean NOT NULL DEFAULT false : « série gardée au journal, mais exclue des records, des crans et du moteur ». Posée par la réponse « Non, ne compte pas » à la question de vraisemblance (ECRAN-SAISIE, « La question de vraisemblance ») ; lue ET écrite par l'app (`COLONNES_SET`, `lignes()`, toujours envoyée, `false` compris). Appliquée par Claude.ai avant la PR 185 |
| `v2_117` (cran et dépassement, 186, 29/10/2026) | **`sets_type_serie_ok`** accepte un cinquième type, **`test`** (`travail` · `echauffement` · `degressive` · `echec` · `test`) : la « Série de test » du menu ⋯ de la série. Aucune colonne nouvelle ; `routine_sets.type_serie` ne change pas. |
| `v2_118` (ta semaine et tes équilibres, 188-1, 29/10/2026) | **`sessions.gestes`** jsonb NOT NULL DEFAULT `'[]'` (CHECK tableau) : `[{geste, slug, vers?, n?, retires?}]`, `geste` ∈ `raccourci` · `machine_prise` · `remplacement` · `ajout_serie` · `retrait`, écrit par l'app à l'enregistrement de la séance (`COLONNES_SEANCE`, toujours envoyé). **`profiles.cartes_semaine`** jsonb NOT NULL DEFAULT `'{}'` (CHECK objet) : `{cle: {r: 'oui'\|'non', le: 'AAAA-MM-JJ', refus: n}}`, colonne FACULTATIVE à la lecture (`COLONNES_FACULTATIVES`), écrite par la file du profil. Appliquée par Claude.ai avant la PR 188-1 |
| `v2_124` (la mobilité, 194-1, 31/10/2026) | **`profiles.zones_raides`** text[] NULL, CHECK sur chevilles · hanches · ischios · quadriceps · epaules · haut_du_dos ; `NULL` = pas répondu, `{}` = aucune. Lue et écrite par l'app (colonne facultative), jamais par une règle autre que `Moteur.blocDeMobilite`. |
| `v2_119` (Ma salle : le plus petit disque et la barre de traction, 190, 30/10/2026) | `profiles.ma_salle` accepte deux clés de plus (liste blanche de `profiles_ma_salle_ok` élargie ; contrainte séparée `profiles_ma_salle_equipement_ok`) : **`plus_petit_disque`** — le plus petit disque de la salle, en kg **par côté**, de 0,25 à 5 au pas de 0,25, `null` ou absent = inconnu ; **`barre_traction`** — booléen, absent = inconnu. L'app lit le disque pour le cran de la barre (2 × le disque, `THMoteur.pasDeLaBarre`) et la barre de traction pour le générateur, les échanges et les marches d'échelle (`THProfil.demandeUneBarreDeTraction`). « Je ne sais pas » écrit `null` / retire la clé (jamais `false`, jamais 0). Appliquée par Claude.ai avant la PR 190 |
| `v2_120` (la série de recul, 193-1, 30/10/2026) | **`sets_type_serie_ok`** et **`routine_sets_type_ok`** acceptent un sixième type, **`recul`** (`travail` · `echauffement` · `degressive` · `echec` · `test` · `recul` pour `sets` ; `routine_sets` n'accepte pas `test`). Une série plus légère que la grosse série du jour, au repos normal : déclarée par la personne (routine, menu ⋯), jamais déduite ; une série de travail pour le volume et les records, jamais le palier. Aucune colonne nouvelle. |
| `v2_126` (le muscle étiré, 196, 31/10/2026) | **`exercises.accent_allonge`** boolean NOT NULL DEFAULT false : l'exercice charge le muscle étiré (23 exercices marqués). Lu par `donnees.js` (`tousLesExercices`, `false` si la colonne manque), le générateur et l'échange d'exercice (préférence à égalité). Aucune autre colonne : le rest-pause n'est pas stocké (dégressives à charge égale, lues par `Modele.restPauseDe`). Appliquée par Claude.ai avant la PR 196 |

**Reste noté** : `pseudo_libre` ouverte à `anon` (voulu) ; 57 fonctions SECURITY DEFINER (l'API sociale) ; pas de FK
`groupe_recaps.groupe_id` (abandonnée) ni `objectifs.pari_id` (à reprendre) ; « Leaked password protection » (tableau
de bord) ; les six colonnes `profiles.visibility_*` du v1 ; **on ne renomme jamais une donnée de l'app depuis la base**
(23/10, « Recompo » : l'app ne relit pas une routine ou un dossier modifiés côté serveur).

## Depuis le 21/10 — migrations `v2_098` à `v2_100` (régénéré depuis la base par Claude.ai le 21/10/2026)

> Lancées dans l'éditeur SQL par Aurélien, après un essai à blanc sur une réplique locale (l'outil de Claude.ai refuse
> le DDL), puis vérifiées en lecture. Absentes de `list_migrations`.

| Migration | Ce qu'elle fait |
|---|---|
| `v2_098` (catalogue complet) | Préalable `V2-098-AVANT-SUPPRESSIONS` (DELETE de 6 records d'aurel_br sur `oiseau_penche_haltere` et de 7 alias faux ou illisibles). 480 → **859 exercices** (379 ajoutés, chacun avec sa description `claude`), 174 renommages selon « Mouvement Variante (Matériel) » (les slugs ne changent pas ; l'ancien nom devient un alias source `app`), **961 alias** (9 déplacés, 640 ajoutés ; aucun nom ni alias porté par deux exercices, ponctuation ignorée) ; colonne **`exercises.hors_salle`** (boolean NOT NULL, défaut false ; 27 exercices : natation, course, rando, vélo, ski, sports collectifs, escalade, boxe…) ; `schema_mouvement` posé sur 10 gainages (abdos ; Gainage Copenhague : adducteurs) ; fusions : les séries de `gainage` → `planche` (nom « Gainage ») et de `oiseau_penche_haltere` → `oiseau_haltere` ; 7 exercices `actif = false` (les deux fusionnés et 5 jamais utilisés) ; Pilates en `mobilite` |
| `v2_099` (échelle) | **`exercises.echelle`** (text, `^[a-z_]{1,40}$`) et **`echelle_rang`** (smallint 1-20 ; contrainte `exercises_echelle_ok` : les deux vides ensemble ; index partiel `exercises_echelle_idx`) — 36 exercices, 6 échelles (tractions, tractions_supination, dips_torse, dips_triceps, pompes, muscle_up) ; **`exercises.barre_charge_fixe`** (boolean NOT NULL, défaut false ; `exercises_barre_charge_fixe_ok` : seulement si `equipement = 'barre'` ; 21 exercices) — à ne pas confondre avec `barre_fixe` du générateur (la barre de traction) ; `profiles_ma_salle_ok` accepte deux clés de plus, **`elastiques`** (liste de 10 au plus, du plus fort au plus léger, `{nom, kg?}`, contrainte séparée `profiles_ma_salle_elastiques_ok`) et **`elastiques_par_nom`** (boolean) ; **`profiles.marche_reponses`** (jsonb, par exercice de départ `{r: oui|non, le, aide?}`, `profiles_marche_reponses_ok`) |
| `v2_100` (sécurité) | `EXECUTE` retiré à PUBLIC, anon et authenticated sur les fonctions de déclencheur `abonnements_avant_ajout`, `abonnements_avant_modif`, `blocages_apres_ajout` (un déclencheur se déclenche sans ce droit) ; les 7 règles de `abonnements`, `blocages`, `reactions_seance` passent de `public` à **`authenticated`** ; `reactions_ajout` et `reactions_guilde` fusionnées en une règle d'ajout : `user_id = auth.uid() AND (social_peut_reagir(session_id) OR guilde_peut_reagir(session_id))` |

**Reste noté** : `pseudo_libre` ouverte à `anon` (voulu : le pseudo se vérifie avant le compte) ; 57 fonctions SECURITY
DEFINER appelables par les comptes connectés (l'API sociale) ; pas de clé étrangère `groupe_recaps.groupe_id` ni
`objectifs.pari_id` ; pas d'index sur `sets.exercise_slug` ; « Leaked password protection » (tableau de bord).

## Depuis le 17/10 — migrations `v2_091` à `v2_097` (régénéré depuis la base par Claude.ai le 17/10/2026, 13 h)

> Toutes lancées dans l'éditeur SQL (absentes de `list_migrations`) et vérifiées en lecture par Claude.ai.
> ⚠️ Numérotation : le catalogue (v2_096, v2_097) avait d'abord été lancé sous les noms v2_091 et v2_092 ; renuméroté
> le 17/10 (seuls les commentaires des colonnes changent). Les v2_091 à v2_095 ci-dessous sont celles de l'audit.


| Migration | Ce qu'elle fait |
|---|---|
| `v2_091_scores_sans_charge` | `scores_force` vidée ; `charge_kg` facultative et contrainte `scores_force_sans_charge CHECK (charge_kg IS NULL)` ; `social_scores_force` (même signature) ne rend plus la charge d'autrui ; nouvelle `social_meilleures_charges(p_slug)` → `(user_id, charge_max)` (mutuels, séances non privées, 12 mois) |
| `v2_092_comptes_supprimes` | `guildes.admin` et `groupes.createur` nullables, clés étrangères `guildes_admin_fkey` / `groupes_createur_fkey` vers `auth.users` ON DELETE SET NULL ; transmission de la guilde au plus ancien membre ; déclencheur `profiles_apres_suppression_recaps` (le récap figé garde les chiffres, `{ pseudo: null, ancien: true }`) ; `groupe_recap_de` rend `user_id` (jamais rendu à l'app : `groupe_recap_public`) |
| `v2_093_doctrine` | D1 : `groupe_recap_de` ignore `un_rm_estime` ; D3 : `guilde_defis` accepte `series` (défaut, sans nombre), `guilde_scores.series_semaine` (int) et `series_moyenne` (numeric(7,2)), `guilde_semaine` rend `series_faites` et `series_cible` |
| `v2_094_guilde_prive_bloque` | D5 : `guilde_voit_seances(a, b)` ; le fil et les records de guilde ne montrent une séance que d'un compte public ou suivi ; blocage dans la guilde (« un membre », invitation refusée `guilde_bloque`) |
| `v2_095_ma_salle_tranches` | `profiles_ma_salle_ok` réécrite : haltères en `{max, pas}` ou en liste de 1 à 3 tranches `[{jusqua, pas}]` |
| `v2_096` (catalogue) | 338 → **480 exercices**, 328 alias ; colonnes `exercises.nature` (text NOT NULL : `force` 377 · `habilete` 47 · `mobilite` 30 · `cardio` 26 ; `exercises_nature_ok`, `exercises_nature_habilete : habilete = (nature = 'habilete')`), `description` (text), `description_source` (`claude` à relire · `manuel` ; `exercises_description_tracable` : les deux vides ensemble) ; 5 doublons `actif = false`, cités nulle part |
| `v2_097` (descriptions) | une description par exercice, 3 à 6 étapes, une par ligne, au tu, sans numéro ; `exercises_description_ok` : 20 à 1 500 caractères, 3 à 6 lignes, aucune ligne vide |

**Règles d'accès** : aucune modifiée par v2_091 à v2_097 (37 règles au 17/10). Toutes les fonctions ajoutées sont
SECURITY DEFINER, `search_path` figé, fermées à `anon`.

**Noté au 17/10 (corrigé le 21/10 par `v2_100`)** : `EXECUTE` ouvert à `anon` sur `abonnements_avant_ajout`, `blocages_apres_ajout`,
`abonnements_avant_modif` ; règles de `abonnements`, `blocages`, `reactions_seance` sur le rôle `public` ; deux règles
d'ajout permissives sur `reactions_seance` ; pas de clé étrangère `groupe_recaps.groupe_id` ni `objectifs.pari_id` ; pas
d'index sur `sets.exercise_slug`. Une migration de sécurité est décidée (17/10).

## Depuis le 12/10 — migrations `v2_078` à `v2_090` (régénéré depuis la base par Claude.ai le 17/10/2026)

> Lancées dans l'éditeur SQL de Supabase (par Aurélien ou Claude.ai après essai à blanc) : elles **n'apparaissent pas**
> dans `list_migrations`, qui s'arrête à `v2_077`. La base fait foi. Dernière appliquée : **`v2_090`**. Les suivantes : voir le bloc du 17/10 ci-dessus.

| Migration | Ce qu'elle fait |
|---|---|
| `v2_078_social_abonnements` | Tables `abonnements` (suiveur, suivi, statut, cree_le, accepte_le ; 4 règles), `blocages` (bloqueur, bloque, cree_le ; 1 règle), `reactions_seance` (session_id, user_id, cree_le ; 4 règles) ; `profiles.compte_prive` (boolean NOT NULL, défaut true), `jeu_niveau` (int), `jeu_titre` (text), `bio` (text, défaut '') ; `sessions.visibilite` (text NOT NULL, défaut 'mutuels') ; fonctions `social_*` (SECURITY DEFINER) |
| `v2_079_social_etage2` | Table `scores_force` (user_id, exercise_slug, score, charge_kg NOT NULL, maj_le ; 1 règle) ; `social_scores_force`, `social_periode`, `social_calendrier`, `social_series_exercice`, `social_exercices_ami` |
| `v2_080_guilde` | Tables `guildes` (id, nom, nom_cle, blason, couleur, admin, cree_le), `guilde_membres` (user_id, guilde_id, rang, entre_le), `guilde_invitations`, `guilde_defis` (guilde_id, semaine, type, n, choisi_le), `guilde_scores` (user_id, semaine, seances, prevues, records_semaine, mois, exercices, exercices_record, maj_le ; 1 règle) ; fonctions `guilde_*` |
| `v2_081_guilde_defi_fige` | Le défi de la semaine est figé dès la première séance de la semaine (`guilde_semaine_lancee`) |
| `v2_082_groupe` | Tables `groupes` (id, createur, cree_le), `groupe_membres` (groupe_id, user_id, session_id, exercices text[], xp, entre_le, ferme), `groupe_invitations`, `groupe_messages` (id, groupe_id, user_id, texte, cree_le), `groupe_recaps` (user_id, groupe_id, session_id, le, recap jsonb, fige_le) ; fonctions `groupe_*` |
| `v2_083_guilde_defi_nouvelle_guilde` | Une guilde créée en cours de semaine peut choisir son défi |
| `v2_084_routines_jours` | `routines.jours` (smallint[], 1 = lundi … 7), rempli pour les noms « <Jour> — … » |
| `v2_085_semaine_choix` | Table `semaine_choix` (user_id, semaine, routine_id, choix in decaler/repartir/garder/ajouter/non, detail jsonb, cree_le ; clé user_id+semaine+routine_id ; règle propriétaire) |
| `v2_086_bilans_annonces` | `profiles.bilans_annonces` (text[] NOT NULL, défaut '{}', au plus 200) |
| `v2_087_groupe_fin` | `groupes.fini_le` ; `groupe_fin_de_seance`, `groupe_fini_le`, `groupe_recap_json`, `groupe_figer`, `groupe_entretien`, `groupe_liberer`, `groupe_envoyer(p_texte, p_groupe, p_id)` |
| `v2_088_ma_salle` | `profiles.ma_salle` (jsonb, NULL = non déclarée ; contrainte `profiles_ma_salle_ok`) |
| `v2_089_objectifs` | Table `objectifs` (user_id, exercise_slug, charge_kg, reps, pose_le, depart_kg, projection, echeance, pari_id ; clé user_id+exercise_slug ; règle propriétaire `objectifs_miens`) |
| `v2_090_fin_seances_hevy` | **Données** : heure de fin de 7 séances Hevy d'aurel_br (19/09 → 02/10), perdues par les rattrapages manuels d'avant l'import de l'app |

**Règles d'accès.** Les tables de la guilde et du groupe n'ont **aucune règle** : elles ne se lisent et ne s'écrivent
que par des fonctions SECURITY DEFINER (`search_path` figé, fermées à anon). `abonnements`, `blocages`,
`reactions_seance`, `scores_force`, `guilde_scores`, `semaine_choix`, `objectifs` ont leurs règles propriétaire.

**Suppression de compte.** Toutes ces tables cascadent depuis `auth.users` ou `profiles`, **sauf** `guildes.admin` et
`groupes.createur` (aucune clé étrangère au 17/10 ; corrigé par `v2_092`, proposée).

**Volumétrie (17/10)** : `scores_force` 27 lignes (un seul compte) ; les autres tables sociales se comptent en
dizaines au plus.

> ⚠️ **Ce document remplace `SCHEMA-V2_2.md`**, qui décrivait un état antérieur aux
> routines et n'a plus valeur de référence. En cas de doute, la base fait foi — pas ce
> fichier. Il est régénéré, pas rédigé.

> **Régénéré le 07/10/2026 depuis la base** (Claude.ai). Cette version reprend celle du 21/09 (`v2_047`) et
> ajoute, juste en dessous, **tout ce qui a changé de `v2_048` à `v2_065`** : colonnes, tables nouvelles, contraintes,
> règles d'accès, volumétrie. Les sections par table plus bas datent du 21/09 ; quand elles divergent du bloc
> « Depuis le 21/09 », **c'est ce bloc qui fait foi**.

**Volumétrie régénérée le 07/10/2026 :** **1 261 séances · 29 063 séries** · 237 exercices (232 actifs, **100 avec un
mouvement**) · 117 pesées · **5 profils pour 5 comptes de connexion** · **10 routines (5 rangées dans le dossier
« Sèche ») · 78 exercices de routine · 269 séries programmées** · **103 prédictions** · **17 zones corrigées** (0 posée
par un bloc) · **0 mode par exercice** · **0 bloc** · **0 record** (le journal se remplit à la première ouverture de
l'app après #377) · 0 série marquée douleur. Archive v1 : `workout_sessions` 891, `sbd_profiles` 4.

**Séances par source :** hevy 1 249 · app 12.
**Séances saisies dans l'app avec `routine_id` :** elle est remplie quand la séance part d'une routine.

## Depuis le 21/09 — migrations `v2_048` à `v2_065`

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
| `v2_059_routine_exercises_retrait_series_reps` | 06/10 | **Retire `routine_exercises.series` et `reps_visees`** et leurs contraintes : redondantes depuis `routine_sets` (`v2_042`), lues par aucun code v2 (relevé 54-0) |
| `v2_060_profils_verrou_admin` | 07/10 | **Sécurité** : le déclencheur `protect_privileged_profile_columns` protège aussi la **création** d'un profil (hors admin : `is_admin = false`, `tier = 'member'`, `tier_awarded_at` vide ; déclencheur `trg_protect_privileged_profile_columns_insert`) ; la règle `profiles_delete` est **retirée** (un profil ne s'efface plus que par `delete_user_complete_data`) |
| `v2_061_journal_records` | 07/10 | **Table `records`** (journal des records, MOTEUR §9.23) : `user_id` → `profiles`, `set_id` → `sets`, `session_id` → `sessions` (cascade), `exercise_slug`, `type` (8 types), `valeur`, `reps`, `ancien`, `ancien_le`, `sur_douze_mois`, `battu_le` ; **unique (`set_id`, `type`)** ; RLS `records_lecture` (SELECT) et `records_ajout` (INSERT), `user_id = (select auth.uid())` ; déclencheur `records_immuable` (refuse UPDATE) ; déclencheur `sets_efface_records` sur `sets` (type, charge, reps, durée ou distance corrigés → records de la série effacés) |
| `v2_062_records_charge_unite` | 07/10 | `records.charge` (numeric, pour `reps_a_charge` : la charge, 0 au poids du corps) et `records.unite` (text, `kg` ou `reps`, pour `volume_seance`) |
| `v2_063_supprimer_compte` | 07/10 | **`delete_user_complete_data(target_user_id)` réécrite** (SECURITY DEFINER, `search_path = ''`, garde inchangée : soi-même ou un admin). Avant, elle échouait **toujours** (elle effaçait `backup_ws_nomenclature_20260709`, supprimée le 15/09). Elle efface désormais `records`, `predictions`, `user_exercise_model`, `sets`, `sessions`, `routines` (exercices et séries de routine en cascade), `zones_exercice`, `modes_exercice`, `blocs`, `body_weight_log`, l'archive v1 (schéma `archive`, commentaires anonymisés, journaux d'erreur détachés), `workout_sessions`, `sbd_profiles`, `profiles`, les exercices personnels (`exercises.proprietaire`), **puis le compte de connexion `auth.users`** |
| `v2_064_verrous_acces` | 07/10 | **Sécurité, règles d'accès** (décision d'Aurélien) : voir « Règles d'accès » ci-dessous |
| `v2_065_questionnaire` | 07/10 | **Questionnaire du coach** (QUESTIONNAIRE-COACH-V2) : onze colonnes sur `profiles`, toutes NULL tant que la personne n'a pas répondu — `objectif` (`force` · `muscle` · `les_deux` · `forme`) et `objectif_depuis` ; `priorites` (text[], au plus 3 ; `{}` = « Pas de priorité », NULL = pas répondu) ; `temps_reponse` (`max` · `marge` · `moins` · `varie`) ; `historique_declare` (`import` · `non_note` · `debutant`) ; `phase_confirmee_le` ; `questionnaire_fait_le` (timestamptz, **vide = jamais rempli** : c'est lui qui décide d'ouvrir le questionnaire, pas `onboarding_completed`) ; et quatre colonnes réservées à 60-2b et 60-3, **ni écrites ni lues avant elles** : `programme_choix`, `zones_a_menager` (text[]), `zone_force_reponse` et `zone_force_reponse_le`. Appliquée et vérifiée par Claude.ai le 07/10. *(Ligne ajoutée par Claude Code d'après les faits du prompt 60-2a : les types de `objectif_depuis`, `phase_confirmee_le`, `programme_choix` et `zone_force_reponse*` sont déduits de leurs noms, et les contraintes de `programme_choix` et de `zone_force_reponse` ne sont pas relevées ici — la prochaine régénération par Claude.ai fait foi.)* |

**Données corrigées hors migration** (avec répétition à blanc) : 4 séries de `muscle_up_assiste` passées en négatif ;
la séance Hevy du 02/10 importée (27 séries) et rattachée à « Vendredi — Bas B (Soulevé) » ; **07/10 : 862 comptes de
connexion anonymes et 625 lignes `sbd_profiles` « Test User » effacés** (créés le 06/10 par la suite Playwright v1 lancée
contre la vraie base ; aucune donnée v2 ; suite archivée par #380).

### Authentification (réglages du tableau de bord, 07/10)

- **Connexions anonymes coupées.**
- **Site URL** `https://sbd-hub.pages.dev` (était l'ancienne adresse GitHub Pages) ; **Redirect URLs**
  `https://sbd-hub.pages.dev/**` et `https://*.sbd-hub.pages.dev/**` (prévisualisations des PR).
- Protection contre les mots de passe compromis : offre payante seulement, désactivée. Captcha : désactivé (demande une
  PR côté app ; à faire avant toute ouverture au-delà des amis).

### Colonnes ajoutées

| Table | Colonnes |
|---|---|
| `sets` | **`hors_calcul` boolean NOT NULL = false** (`v2_116`, 185) · `douleur` boolean NOT NULL = false · `occurrence` uuid (déjà présentes et non décrites plus bas : `source` text NOT NULL = 'app', `repos_s`, `elastique`, `elastique_norme`, `tempo_descente`, `tempo_pause`, `tempo_montee`, `modifie_a`, `note`, `rpe`) |
| `profiles` | `zones_raides` text[] (`v2_124`) · `phase` text (CHECK) · `phase_depuis` timestamptz · `lest_reponse` text (CHECK `oui`/`non`) · `lest_reponse_le` timestamptz · **`v2_065`** : `objectif` · `objectif_depuis` · `priorites` text[] · `temps_reponse` · `historique_declare` · `programme_choix` (CHECK `deduit` · `moi` · `construis` — relevé au schéma par Claude Code le 08/10/2026, 60-3) · `zones_a_menager` text[] · `zone_force_reponse` · `zone_force_reponse_le` · `phase_confirmee_le` · `questionnaire_fait_le` timestamptz |
| `exercises` | `mouvement` text |
| `routines` | `dossier` text (CHECK `routines_dossier_ok`) |
| `zones_exercice` | `origine` text NOT NULL = 'personne' (CHECK `personne`/`bloc`) · `bloc_id` uuid → `blocs(id)` ON DELETE SET NULL |

### Table nouvelle : `records` — 0 ligne · créée par `v2_061`, complétée par `v2_062`

`id` uuid PK = gen_random_uuid() · `user_id` uuid NOT NULL → `profiles(id)` ON DELETE CASCADE · `set_id` uuid NOT NULL
→ `sets(id)` ON DELETE CASCADE · `session_id` uuid NOT NULL → `sessions(id)` ON DELETE CASCADE · `exercise_slug` text
NOT NULL → `exercises(slug)` · `type` text NOT NULL CHECK (`charge_a_reps`, `reps_a_charge`, `charge_max`, `cap`,
`un_rm_estime`, `volume_seance`, `duree_s`, `distance_m`) · `valeur` numeric NOT NULL · `reps` integer · `ancien`
numeric · `ancien_le` timestamptz · `sur_douze_mois` boolean NOT NULL = false · `battu_le` timestamptz NOT NULL ·
`charge` numeric · `unite` text CHECK (`kg`/`reps`) · `created_at` timestamptz NOT NULL = now().
Contrainte `records_un_par_serie_et_type` UNIQUE (`set_id`, `type`) : un envoi répété ne crée pas de doublon.
Index `records_user_battu_idx (user_id, battu_le)`, `records_user_exercice_idx (user_id, exercise_slug)`.
**Immuable** : déclencheur `records_immuable` (BEFORE UPDATE, refuse). **Effacé avec sa série** : suppression (cascade)
ou correction (déclencheur `sets_efface_records`, AFTER UPDATE OF `type_serie`, `charge_kg`, `reps`, `duree_s`,
`distance_m` ; l'app réécrit ensuite les records de la séance). Écrit à « Terminer » par la file d'envoi ; l'historique
est rempli une fois par l'app (58-2).

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
- ~~`routine_exercises.series` et `reps_visees`~~ : **retirées le 06/10 par `v2_059`**.

### Règles d'accès (état au 07/10, après `v2_064`)

**Toutes les règles de `public` sont en `authenticated` et écrites en `(select auth.uid())`.** Aucune règle `public` ne
reste ; aucune règle de suppression sur `profiles`.

| Table | Règles |
|---|---|
| `sets`, `sessions`, `routines`, `routine_sets`, `predictions`, `zones_exercice`, `modes_exercice`, `blocs`, `body_weight_log`, `user_exercise_model` | une règle `FOR ALL`, propriétaire |
| `routine_exercises` | `FOR ALL`, propriété héritée de `routines` par un `EXISTS` |
| `profiles` | `profiles_lecture` (SELECT), `profiles_creation` (INSERT), `profiles_modif` (UPDATE) : `id = (select auth.uid())` ; colonnes `is_admin`, `tier`, `tier_awarded_at` protégées à la création et à la modification par `protect_privileged_profile_columns` |
| `records` | `records_lecture` (SELECT), `records_ajout` (INSERT) ; ni modification ni suppression |
| `exercises` | lecture du catalogue (`proprietaire IS NULL`) et de ses exercices ; création, modification, suppression de **ses** exercices seulement. **Plus lisible sans connexion.** Le catalogue partagé n'est modifiable par personne |
| `exercise_alias` | lecture par les comptes connectés |
| `sbd_profiles`, `workout_sessions` (v1) | **lecture seule de ses lignes** (`sbd_profiles_lecture`, `workout_sessions_lecture`) ; `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` retirés à `anon` et `authenticated` ; la règle « amis » v1 est retirée |

**Fonctions** :
- `pseudo_libre(nom)` (SECURITY DEFINER) : appelable **sans connexion**, voulu (l'inscription vérifie le pseudo avant
  de créer le compte) ; elle ne dit que « libre » ou « pris ».
- `delete_user_complete_data(uuid)` (SECURITY DEFINER) : comptes connectés ; sa garde n'accepte que soi-même ou un admin.
- `derniere_perf(text[])` : comptes connectés seulement (SECURITY INVOKER, le RLS s'applique).
- Les fonctions de déclencheur (`sets_efface_records`, `records_immuable`, `predictions_refuse_modification`,
  `sets_efface_observation`, `sets_efface_observation_type`, `sets_marque_modification`,
  `protect_privileged_profile_columns`) ne sont **plus appelables par l'API** ; les déclencheurs fonctionnent toujours.

## Depuis le 07/10 — migrations `v2_066` à `v2_077`

> Relevé par Claude.ai depuis la base le 12/10/2026.

| Migration | Ce qu'elle change |
|---|---|
| `v2_066` | `profiles` : `exercices_ecartes` (text[]) · `programme_construit_dossier` · `programme_construit_le` (timestamptz) · `carte_cycles_le` (timestamptz). Catalogue : rowing et tirage à l'élastique. |
| `v2_067` | `abdominaux` ajouté en muscle secondaire sur 36 exercices. |
| `v2_068` | `profiles.jeu_actif` boolean, défaut `true`. |
| `v2_069` | `exercises.muscles_stabilisateurs` text[] ; 176 secondaires y passent, 8 passent en primaires. |
| `v2_070` | Catalogue : exercices au poids du corps et de renforcement. |
| `v2_071` | `exercises.habilete` boolean (14 exercices à `true`). |
| `v2_072` | Rowings divergents (un bras, deux bras) ; leurs séries réattribuées. |
| `v2_073` | Frères (`mouvement`) posés sur le catalogue. |
| `v2_074` | `exercises.schema_mouvement`. |
| `v2_075`, `v2_076` | Voir le bloc du 11/10 ci-dessous. |
| `v2_077` | Données : 3 séances Hevy remises en `source = 'hevy'`. |

**Volumétrie au 12/10** : `sessions` 1 279 (14 app, 1 265 hevy) · `sets` 29 464 · `exercises` 338 (333 actifs ;
203 avec `mouvement`, 271 avec `schema_mouvement`, 14 en habileté) · `pesees` 121 · `profiles` 8 · `routines` 32 ·
`routine_exercises` 217 · `routine_sets` 561 · `predictions` 196 · `records` 3 608 · `blocs` 2 · `zones_exercice` 27 ·
`modes_exercice` 0 · `alias_exercice` 0. Les volumétries datées du 07/10 plus bas sont dépassées.

## Le 11/10/2026 — `v2_075` et `v2_076` (chantier 69)

> Bloc ajouté à la main par Claude.ai, depuis la base. `v2_066` à `v2_074` : voir le bloc précédent.

- **`v2_075_heures_import_hevy`** (données) : les 1 221 séances de l'import CSV d'août (`source_ref` de forme
  `hevy:AAAA-MM-JJTHH:MM:SS`) portaient l'heure locale de Hevy écrite comme heure universelle. `debut` et `fin` relus
  depuis `source_ref` en heure de Paris ; 22 `sets.validee_a` décalés de même ; journal des records : `battu_le`
  (3 376) et `ancien_le` (3 362) ramenés aux nouveaux débuts, `created_at = now()` sur les 3 527 lignes touchées pour
  que les téléphones les relisent (garde `records_immuable` levée le temps de la transaction, rétablie et vérifiée).
  **Toute séance a désormais `debut` en heure universelle vraie.**
- **`v2_076_alias_exercice`** : table **`alias_exercice`** — le nom d'un exercice importé, rattaché par la personne.

| Colonne | Contrainte |
|---|---|
| `id` | uuid, PK, `gen_random_uuid()` |
| `user_id` | NOT NULL, défaut `auth.uid()`, → `profiles(id)` ON DELETE CASCADE |
| `alias` | text NOT NULL, non vide, ≤ 120 |
| `alias_norme` | **GÉNÉRÉE** : `translate(lower(btrim(alias)), 'àâäéèêëîïôöùûüçœ', 'aaaeeeeiioouuuco')` — lue, jamais envoyée |
| `exercise_slug` | text NOT NULL → `exercises(slug)` ON DELETE CASCADE |
| `created_at` | NOT NULL, défaut `now()` |

  Unicité `alias_exercice_unique` (`user_id`, `alias_norme`). RLS : `alias_exercice_owner`, FOR ALL, `authenticated`,
  `user_id = (select auth.uid())` ; aucun droit pour `anon`. Supprimée avec le profil (cascade).
  La même migration ajoute **7 noms communs** à `exercise_alias` (`source 'hevy'`) : Dips Assis (Machine), Dips
  Pectoraux, Dips Pectoraux (Assisté), Dips sur Banc, Développé Épaules Assis (Machine), Squat à la ceinture
  (machine), Touchers d'Épaules (Gainage). `exercise_alias` : lecture seule pour tous (`exercise_alias_read_all`),
  clé primaire `alias` (le nom tel quel, **pas** normalisé).


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
  (Elle restait citée par `delete_user_complete_data`, qui échouait donc toujours : corrigé par `v2_063`.)
- **Compte `alex` supprimé** — 0 séance, 0 série, 0 routine. 5 profils pour 5 comptes auth.
- **Routine de test « Test 1 » supprimée.**
- **Les 12 tables portent désormais un commentaire.** Les v1 sont marquées
  `ARCHIVE — FIGÉE, ne plus écrire` avec leur date de dernière écriture (22/07/2026) ; les v2
  disent ce qu'elles remplacent. Depuis `v2_064`, la base l'impose : les tables v1 sont en lecture seule.

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
  > sans elle a `session_id` vide et **survit à la suppression de sa séance**.
- **Une série supprimée emporte toute son observation.** Trigger **`sets_efface_observation`**
  (`BEFORE DELETE ON sets`) : remet `set_observe`, `valeur_observee` et `observee_a` à NULL sur
  les prédictions qui la désignent — sauf celles dont la séance est déjà supprimée, que la
  cascade emporte.
- **Une observation comptée sans série est impossible.** Contrainte
  **`predictions_observation_coherente`** : `valeur_observee` NULL ou `set_observe` renseigné,
  et `valeur_observee` NULL **si et seulement si** `observee_a` NULL (assouplie pour `escalier`
  par `v2_052` et pour `programme` par `v2_058`).

**La répétition à blanc (9 tests) a trouvé deux pièges avant d'écrire.** PostgreSQL calcule
une colonne générée **après** les déclencheurs `BEFORE` : `predictions_immuable` voyait
`session_id` vide dans `NEW`, et aurait refusé **toutes** les observations — d'où son exclusion
de la comparaison. Et l'ordre des cascades à la suppression d'une séance : les séries partent
avec elle, et `sets_efface_observation` ne doit pas écrire sur une prédiction que la cascade
emporte déjà.

---

## `predictions` — 103 lignes au 07/10 · créée par `v2_006`, verrouillée par `v2_046`, intègre depuis `v2_047`

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

## `zones_exercice` — 17 lignes au 07/10 · créée par `v2_046`

**Étage 1 : déclaré, ajout seulement.** Une ligne = une correction datée de la zone d'un
exercice ; la dernière par (`user_id`, `exercise_slug`) fait foi, une zone vide rend la main
à la déduction. **Pas d'unicité** : c'est voulu.

## `routine_sets` — 269 lignes au 07/10 · créée par `v2_042` le 15/09/2026

**Miroir de `sets` pour les routines.** Une ligne par série programmée. La symétrie est le
point : l'éditeur de routine et l'écran de séance lisent la même forme, donc le même code de
rendu (`CADRAGE-V2` §2 undecies).

| Colonne | Contrainte |
|---|---|
| `routine_exercise_id` | NOT NULL → `routine_exercises`, **ON DELETE CASCADE** |
| `user_id` | **NOT NULL → `profiles(id)`, sans défaut** — ⚠️ contrairement à `routine_exercises`, qui n'en a pas |
| `rang` | NOT NULL, **≥ 1** — ⚠️ pas ≥ 0 comme `routine_exercises.rang` |
| `type_serie` | défaut `'travail'` · `travail` \| `echauffement` \| `degressive` \| `echec` \| **`recul`** (`v2_120`, 193-1) ; pas `test` |
| `au_max` | `boolean` NOT NULL défaut `false` — **`v2_123`** (193-6) : la ligne « Au max » de l'exercice (au plus une, la dernière série de travail ou de recul) |
| `reps_visees` | NULL ou 1–100 |
| `charge_cible_kg` | `numeric` NULL — **une charge de départ, lue seulement la première fois** (MOTEUR §9.21), jamais une charge observée |
| `duree_cible_s` | NULL ou 1–35999 |
| `distance_cible_m` | NULL ou 0–100000 |
| `created_at` | NOT NULL, défaut `now()` |

`routine_sets_rang_unique` (`routine_exercise_id`, `rang`) est **DIFFÉRABLE, initialement
différée** — contrairement à l'unicité de `routine_exercises`. C'est ce qui permet de remplacer
les lignes d'un exercice en bloc (DELETE puis INSERT), ou de réordonner par des positions en
collision, plutôt que de les renuméroter en place.

---

## `sessions` — 1 261 lignes au 07/10

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid NOT NULL | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | → `auth.users`, CASCADE |
| `debut` | timestamptz NOT NULL | **attention au fuseau** pour tout regroupement par jour ou semaine |
| `fin` | timestamptz | une séance sans fin finit 3 h au plus après son début (MOTEUR §12.2 bis) |
| `titre`, `note` | text | texte utilisateur — **jamais interpolé dans du HTML** |
| `source` | text NOT NULL | `'app'` ou `'hevy'` |
| `source_ref` | text | référence d'import |
| `statut` | text NOT NULL | `'terminee'` par défaut, ou `'en_cours'` |
| `visibilite` | text NOT NULL | défaut `'mutuels'` depuis `v2_078` (le bloc « Depuis le 12/10 » fait foi) ; lue par les fonctions sociales (`visibilite <> 'private'`) |
| `routine_id` | uuid | → `routines(id)`, `ON DELETE SET NULL` ; remplie quand la séance part d'une routine |
| `fc_moyenne`, `fc_max`, `calories` | integer | **0 renseignée** — aucune source |
| `salle` | text | 1–60 caractères, non vide ; rare |
| `salle_norme` | text | **GÉNÉRÉE** |

## `sets` — 29 063 lignes au 07/10

| Colonne | Type | Notes |
|---|---|---|
| `id`, `session_id`, `user_id` | uuid NOT NULL | `user_id` → `auth.users`, CASCADE |
| `exercise_slug` | text NOT NULL | → `exercises(slug)` |
| `charge_kg` | numeric | négatif = aide (assistance) |
| `reps` | integer | |
| `duree_s` | integer | gainages, cardio, randos |
| `distance_m` | numeric | randos |
| `type_serie` | text NOT NULL | `travail` · `echauffement` · `degressive` · `echec` · **`test`** (`v2_117`, 186 : la CHECK `sets_type_serie_ok` l'accepte ; une série de test est un max tenté, déclaré par la personne — un record possible, jamais une charge de travail) |
| `validee_a` | timestamptz | **aucun défaut** — voir ci-dessus |
| `rang` | integer NOT NULL | ordre d'affichage |
| `groupe_superset` | integer | bloc |
| `poids_corps_kg` | numeric | |
| `ressenti` | text | très rare |
| `rpe` | numeric(3,1) | **288 renseignées** environ |
| `note` | text | texte utilisateur |
| `modifie_a` | timestamptz | |
| `elastique` | text | |
| `elastique_norme` | text | **GÉNÉRÉE** |
| `tempo_descente`, `tempo_pause`, `tempo_montee` | smallint | |
| `au_max_reserve` | smallint | **`v2_123`** (193-6) — réserve DEMANDÉE à cette série : 0 (jusqu'à l'échec) à 3 (en gardant 3 reps) ; NULL = pas « Au max ». Écrite à la validation depuis la ligne du plan |
| `repos_s` | integer | **`v2_040`** — repos RÉEL avant cette série, 0 à 3600 s, mesuré à partir de la validation de la série précédente. NULL sur les séries importées : l'export Hevy ne porte pas le repos |
| `douleur`, `occurrence` | | voir « Colonnes ajoutées » |
| `hors_calcul` | boolean | **`v2_116`** (185) — NOT NULL, défaut `false`. `true` : la série reste au journal et au détail de la séance, et n'entre ni dans les records, ni dans le palier, le niveau et les crans voisins, ni dans les paris et le jeu |

## `exercises` — 237 lignes

| Colonne | Type | Notes |
|---|---|---|
| `slug` | text NOT NULL | clé |
| `nom` | text NOT NULL | libellé affiché |
| `famille` | text NOT NULL | **niveau de repli** quand l'exercice seul est trop rare |
| `charge`, `mesure` | text NOT NULL | nature de la charge et de la mesure |
| `parent` | text | variante d'un exercice |
| `mouvement` | text | les frères (MOTEUR §13.6), `v2_053` |
| `muscles_primaires` | text[] NOT NULL | **pondération 1** dans le volume |
| `muscles_secondaires` | text[] NOT NULL | **pondération 0,5** |
| `muscles_stabilisateurs` | text[] NOT NULL DEFAULT `'{}'` | **pondération 0,25** (`v2_069`, REGLE-VOLUME §1 bis) |
| `coef_pdc`, `masse_depart_kg`, `masse_depart_reglable` | | poids de corps et masse machine |
| `compte_tonnage` | boolean NOT NULL | `false` par défaut |
| `equipement` | text | signature de parc, pas de lieu |
| `actif` | boolean NOT NULL | |
| `proprietaire` | uuid | NULL = catalogue partagé ; sinon exercice personnel, effacé avec le compte |

## `routines` / `routine_exercises` — 10 et 78 lignes (07/10)

**La routine porte la structure, jamais les charges.** Les charges viennent du moteur.

`routines` : `user_id`, `nom` (1–60 car., unique par utilisateur parmi les non archivées),
`note`, `archivee_a`, **`rang`** (`v2_043`), **`dossier`** (`v2_057`).

> ⚠️ **L'archivage est abandonné** (`ECRAN-SAISIE-V1` §7 duodecies.1) : la suppression le
> remplace depuis le chantier 41. `archivee_a` reste en base mais **n'est plus écrite**.

`routine_exercises` : `routine_id`, `exercise_slug`, `rang` (unique par routine, ≥ 0),
**`zone`** (`v2_122`, 193-3 : NULL ou l'une des cinq clés de zone — la zone que la routine fixe à cet exercice ce jour-là),
`groupe_superset` (même mécanisme que `sets`), **`repos_cible_s`** (`v2_040` — repos
**prescrit**, 5 à 1800 s, **NULL = désactivé**).

> **`series` et `reps_visees` ont été retirées de `routine_exercises` le 06/10/2026 (`v2_059`).** `routine_sets`
> porte une ligne par série : c'est la seule source de la structure d'une routine (`CADRAGE-V2` §2 undecies).

## Autres tables

`profiles` (5) · `body_weight_log` (117) · `exercise_alias` (255) ·
`user_exercise_model` (59, un seul calcul du 23/08, **append-only par doctrine**) ·
`records`, `blocs`, `modes_exercice` : voir leurs sections · `sbd_profiles` (4) et `workout_sessions` (891)
(**archive v1, en lecture seule depuis `v2_064`**).

---

## RLS

**Toutes les tables l'ont actif.** Motif unique depuis `v2_064` : rôle `authenticated`, `auth.uid()` enveloppé dans
un `SELECT` (évite la réévaluation par ligne). Détail : « Règles d'accès (état au 07/10) » plus haut.

> ✅ **Point de l'advisor du 19/09 réglé côté `public`** par `v2_064` (les 5 règles v2 et les 9 règles v1 signalées).
> Restent signalées dans le schéma `archive` (tables v1, 52 règles) : hors API de l'app, sans objet pour la v2.

`routine_exercises` n'a pas de `user_id` : sa propriété est héritée de `routines` via un
`EXISTS`, avec le même `WITH CHECK` — c'est lui qui empêche de rattacher une ligne à la
routine d'autrui. `routine_sets`, elle, **porte son `user_id`** : le client doit donc le
renseigner à l'écriture (il n'a pas de défaut).

> **Le cloisonnement est le travail du RLS, pas du client.** Ne filtre pas sur `user_id`
> côté application : ça masquerait un RLS défaillant au lieu de le révéler.

---

## Règle de travail

**Claude.ai fait tout le Supabase** : lectures via MCP ; **toute écriture** (données, migrations, RLS) par un script
`DO $do$ … $do$` à deux passages (`essai := true` puis `false`) qu'Aurélien lance dans l'éditeur SQL — les écritures
par l'outil de Claude.ai sont annulées d'office depuis le 06/10. Une migration s'inscrit elle-même dans
`supabase_migrations.schema_migrations`. **Lecture du schéma autorisée** pour Claude Code, afin de ne jamais coder sur
des noms non vérifiés. **Écriture, migration et RLS : jamais.** Aucun test du dépôt ne parle à la vraie base (garde
réseau des bancs, #380).

Avant de nommer une migration : lire `claude/ETAT-DU-PROJET.md` et la liste des PR ouvertes (`list_migrations` ne voit pas les migrations lancées dans l’éditeur depuis v2_078). Prochain numéro libre au 17/10/2026 : **`v2_098`**.
