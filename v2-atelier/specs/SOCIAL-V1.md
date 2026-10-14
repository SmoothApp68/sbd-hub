# SOCIAL-V1 — le social, étage 1 : abonnements, fil, profil avec calendrier

> Décisions d'Aurélien du 12/10/2026 (prompt 87), complétées le 13/10/2026 (visibilité des séances, niveau publié,
> jeu éteint). Texte de Claude.ai, repris tel quel. Maquette : `v2-atelier/maquettes/maquette-social-etage1-v2.html`.
> Base : migration `v2_078_social_abonnements` (écrite par Claude.ai, lancée par Aurélien).

## 1. Les trois cercles

Abonnements façon Instagram, trois cercles :

| Cercle | Voit |
|---|---|
| Inconnu | pseudo, blason, niveau du jeu |
| Abonné accepté (un sens) | fil : titre, date, records (médailles), tonnage ; réagir ; calendrier du profil (jours, résumé au toucher) |
| Mutuel | + détail des séances (exercices, séries, charges) ; bouton « Inviter dans un groupe » (grisé sinon, avec « Abonnez-vous l'un à l'autre pour l'inviter » — l'invitation elle-même est l'étage 3, le bouton seulement ici, inactif même en mutuel avec « Bientôt ») |
| Jamais | poids de corps, santé, notes, RPE, ressenti, douleur |

## 2. Les règles

- Compte privé par défaut (chaque abonnement s'approuve ; public = acceptation d'office).
- Bloquer et retirer un abonné en silence ; bloquer efface tout lien.
- Le nombre de réactions n'est visible que par l'auteur.
- Fil : séances terminées des 30 derniers jours, liste chronologique, puis « Tu es à jour » ; jamais une séance en
  cours ; jamais une séance `visibilite = 'private'`.
- Pas de commentaires, pas de notification push (un badge sur l'onglet pour les demandes).
- Un seul onglet « Jeu & amis » : le fil est un sous-onglet à côté du jeu, pas un onglet de plus.
- Coach et bilans ne lisent jamais rien du social.

## 3. La base (v2_078)

Tables `abonnements`, `blocages`, `reactions_seance`, colonne `profiles.compte_prive`. Les autres ne lisent que par
les fonctions RPC : `social_profil(pseudo)`, `social_rechercher(debut)`, `social_fil()`,
`social_records_seance(session)`, `social_calendrier(user, de, a)` (≤ 62 jours), `social_detail_seance(session)`
(mutuels), `social_mes_reactions(session)`, `social_liens()` (mes demandes reçues et envoyées, abonnés, abonnements,
bloqués, avec pseudo et niveau).

Écritures directes par le client : insert/delete `abonnements`, update statut → `accepte` (le suivi seulement),
insert/delete `blocages`, insert/delete `reactions_seance`, update `profiles.compte_prive`.

Le tonnage des fonctions est celui de `Bilan.volumeKg` (`faits.js`) : séries de travail, charge > 0, reps > 0,
arrondi au centième. Les médailles affichées se choisissent par la règle de `faits.js` sur les lignes rendues par
`social_records_seance` (une médaille par série médaillée, `set_id`).

## 4. Décisions du 13/10/2026

- **Visibilité des séances** : le défaut de `sessions.visibilite` passe à `mutuels`, et toutes les séances `private`
  existantes passent à `mutuels` (le v2 n'avait jamais écrit cette colonne : le défaut `private` n'était le choix de
  personne). La confidentialité se règle au niveau du compte (`compte_prive`). `private` voudra dire « séance
  masquée », un choix explicite à venir (noté pour plus tard). `public` vaut `mutuels` pour l'instant. Le v2 n'écrit
  toujours pas `visibilite`.
- **Niveau publié** : colonnes `profiles.jeu_niveau` (integer) et `jeu_titre` (text), publiées par l'app depuis
  `etatDuJeu` (fin de séance et ouverture de l'onglet Jeu, par le chemin du profil, seulement si elles changent).
  `social_profil` et `social_rechercher` rendent `niveau` (et `titre`), nuls si `jeu_actif = false`. Sans titre,
  l'écran n'affiche que le niveau.
- **Blason** : le gabarit de la maquette, d'une couleur dérivée du pseudo (le jeu v2 n'a pas de blason).
- **Jeu éteint** : l'onglet reste, réduit au fil et aux amis ; il s'appelle « Amis » quand le jeu est éteint,
  « Jeu & amis » sinon. Le social est volontaire et indépendant du jeu, il reste accessible sans adresse cachée.
- **Pas de « Classements »** à l'étage 1 : ce sera l'étage 2.
- **Lien d'invitation** : `/a/<pseudo>` ouvre le profil (une route de l'app).

## 5. Étage 2 — décisions du 14/10/2026 (prompt 89)

> Décisions d'Aurélien du 14/10/2026. Maquette : `v2-atelier/maquettes/maquette-social-etage2-guilde-v2.html`,
> écrans 1 à 3 (le 4, la guilde, est le prompt suivant). Base : migration **proposée**
> `v2-atelier/migrations-proposees/v2_079_social_etage2.sql` (relue et lancée par Claude.ai).

- **Mutuels seulement** (`social_mutuel`). Jamais de vainqueur, de couronne ni de rouge. Le coach et les bilans n'en
  lisent rien.
- **Profil d'un mutuel**, de haut en bas : blason et niveau ; son mois en deux chiffres (séances, tonnage) ; son
  calendrier (étage 1, 87) ; « Ses exercices », les plus faits sur 6 mois, avec la meilleure charge et le nombre de
  séances, chacun ouvrant sa page ; en bas, un bouton discret « Se comparer sur la période ».
- **Page d'exercice d'un ami** : meilleure charge, meilleure série (charge × reps), courbe de la meilleure charge par
  mois sur 6 mois. « Se comparer » superpose ta courbe (pointillés or) et montre côte à côte la meilleure charge, la
  meilleure série et les séances sur 6 mois.
- **« Se comparer sur la période »** (ce mois / 3 mois / l'année) : séances, tonnage, séries, reps, puis les
  exercices en commun avec la meilleure charge de chacun. Pour les exercices à la barre, tri et ordre « à poids de
  corps égal », sans afficher le chiffre DOTS.
- **« Entre amis »**, en bas de TA page d'exercice, pour les exercices à la barre seulement : tes mutuels et toi,
  triés à poids de corps égal (DOTS par sexe), avec les vrais kilos de la meilleure charge. Un « i » donne : « On
  compare la force rapportée au poids de corps (formule DOTS) : un plus léger qui soulève autant passe devant. Ton
  poids ne quitte jamais ton téléphone. Sans pesée, on n'apparaît pas. » Affiché à partir de 2 personnes avec un
  score (toi compris) ; sans sexe au profil ou sans pesée : absent de cette liste.
- **Le poids de corps ne sort JAMAIS du téléphone** : le score DOTS se calcule sur l'appareil (meilleure charge des
  faits, dernière pesée datée) et seul le score est publié, avec la charge, par exercice. La fonction DOTS vit dans
  un seul module (registre NOTIONS : `social.js`, `scoreDots`).

### 5.1 Ce que le code en a fait (89)

- **Une série comptée** : `travail`, charge > 0, reps > 0 — la règle de `Bilan.volumeKg`. Mes séries viennent de
  `faits.seriesComptees`, celles d'un ami des fonctions de la base ; les deux passent par les mêmes fonctions de
  `social.js` (`resumeExercice`, `periodeDesLignes` / `periodeDeLaBase`, `comparaisonPeriode`).
- **« 6 mois »** : le mois en cours et les 5 d'avant (la courbe a 6 points, un par mois).
- **Meilleure série** : le plus gros produit charge × reps ; à égalité, la plus lourde.
- **Séances d'une période** : les séances qui ont au moins une série comptée. Périodes : du 1er du mois, d'il y a
  3 mois (jour suivant), du 1er janvier — à aujourd'hui.
- **« Tri et ordre à poids de corps égal » dans « Se comparer »** (interprétation, à valider) : les exercices à la
  barre en commun viennent d'abord ; dans chacun, les deux personnes sont rangées par leur score publié (lifetime,
  `scores_force`), celui qui est devant à poids de corps égal en premier ; sans les deux scores, toi d'abord. Le
  score n'est jamais affiché.
- **« À la barre »** : `exercises.equipement = 'barre'` (mesure charge × reps).
- **DOTS** : coefficients IPF par sexe, poids borné 40–210 kg (homme), 40–150 kg (femme), au centième.
- **Publication des scores** (`scores_force`, écrite par son propriétaire seul) : à l'ouverture du fil, de « Entre
  amis » et de « Se comparer », et à la fin d'une séance — seulement ce qui a changé depuis l'ouverture de l'app.
  Sans sexe précisé ou sans pesée : mes scores sont retirés quand on sait qu'il y en a.
- **Routes** : `/a/<pseudo>/exercice/<slug>` et `/a/<pseudo>/comparer` ; le retour d'une sous-page ramène au profil.

### 5.2 La base (v2_079, proposée)

Table `scores_force` (`user_id`, `exercise_slug`, `score`, `charge_kg`, `maj_le` — aucune colonne de poids), une
politique `FOR ALL` propriétaire. Fonctions (SECURITY DEFINER, `search_path` figé, `authenticated` seulement,
mutuels seulement) : `social_exercices_ami(user)`, `social_series_exercice(user, slug)`,
`social_periode(user, de, a)` (≤ 366 jours ; une ligne par exercice et une ligne de total, `exercise_slug` nul),
`social_scores_force(slug)` (les miens et ceux de mes mutuels). Aucune politique ajoutée sur sessions, sets, records.

## 6. Guilde — décisions du 14/10/2026 (prompt 90)

> Décisions d'Aurélien du 14/10/2026, reportées mot pour mot. Maquette : `v2-atelier/maquettes/maquette-social-etage2-guilde-v2.html`,
> écran 4. Base : migration **proposée** `v2-atelier/migrations-proposees/v2_080_guilde.sql` (relue et lancée par Claude.ai,
> après v2_079).

- Mes amis = la liste des mutuels ; la guilde est permanente ; le groupe de séance (éphémère) est un AUTRE chantier : ne le fais pas.
- Jusqu'à 30 membres. Tout membre invite, mais seulement un de ses abonnés mutuels. Une guilde par personne.
- Pas de chef affiché. Le créateur administre : nom, blason, retirer un membre, choisir le défi, transmettre l'administration. S'il part, l'administration passe au membre le plus ancien ; une guilde sans membre disparaît. Chacun part quand il veut, sans que les autres soient prévenus.
- Nom : 3 à 24 caractères, unique (comparaison sans casse ni accents, sans unaccent : translate(lower(btrim(…)), …)). Blason : un des gabarits du jeu/social, couleur au choix ; aucune image envoyée.
- Rangs choisis par chacun, sans aucun pouvoir, plusieurs membres peuvent avoir le même, modifiables à tout moment : Squatteur · Bencheur · Terreur · Pousseur · Tireur · Chargeur · Gymbro · Motiveur · Novice (par défaut). Affichage d'un membre : « jordan · Squatteur · <titre du jeu> ». Les rangs ne se gagnent jamais (seuls les titres du jeu se gagnent).
- Onglets de la guilde : Semaine (défi + « La guilde cette semaine » : séances, records, tonnage), Fil (séances des membres, mêmes règles et mêmes fonctions que le fil de 87), Progression (classement du mois : part des exercices avec au moins un record sans dépasser la charge proposée par le coach ; un exercice compte s'il a au moins 2 séances dans le mois ; remise à zéro le 1er ; score seul, pas de vainqueur ni de rouge), Membres.
- Défi : un à la fois, coopératif, choisi chaque lundi par l'administrateur parmi des défis sûrs : (1) chacun fait ses séances prévues ; (2) des records battus sans dépasser la charge proposée ; (3) variété : N exercices différents à tous. Sans choix, le défi (1) part seul. Jamais sur la charge ou le tonnage. Une jauge commune.
- Jeu éteint : on reste membre avec son rang, sans XP.
- Pas de messagerie dans la guilde ; réactions seulement. Pas de direct.
- Le coach et les bilans ne lisent rien de la guilde.

### 6.1 Décisions de Claude.ai du 14/10/2026 (jugement technique délégué par Aurélien)

- **1a. Record SANS proposition** (séance importée, ou série sans pari) : il COMPTE. Un record AVEC proposition ne compte que
  s'il est à la charge proposée ou en dessous. Pourquoi : la règle de sûreté sert à ne jamais pousser à dépasser une
  consigne ; sans consigne, il n'y a rien à dépasser. Exclure les membres sans coach viderait le social, car presque tous
  les amis importent depuis Hevy aujourd'hui. Même règle pour le classement Progression et pour le défi (2).
- **1b. Proposition sans chiffre** (« le cran au-dessus ») : règle « suivie » de MOTEUR §12, toute charge au-dessus du palier
  compte.
- **1c. Révisions** : le pari relié à la série par `set_observe`.
- **1d. Types de record qui comptent** : `charge_a_reps`, `reps_a_charge`, `charge_max`, `cap`, `duree_s`, `distance_m`.
  Exclus : `un_rm_estime` (une estimation, pas un fait) et `volume_seance` (pousserait au volume). Une série « à fond »
  compte (c'est un fait).
- **2. Séances prévues** (défi 1) : `profiles.seances_par_semaine`. S'il est vide (3 profils sur 8 aujourd'hui : alexis,
  jordan, lea), la médiane hebdomadaire de l'historique, avec la même fonction que faits.js:618 (`habitudes`), sans la
  recopier. Chaque membre est plafonné à ses séances prévues. Calcul sur l'appareil, puis publication du score déjà
  calculé, comme `scores_force`.

### 6.2 Ce que le code en a fait (90)

- **Le record qui compte** : `faits.recordsSansDepasser` — une ligne du journal des six types, comptée **une fois par
  série** (une médaille par série, comme le fil). Sa série sans pari de consigne relié (`set_observe`, module ≠
  `escalier`) compte ; avec, le pari de la plus haute `fondement.revision` ; compte si la charge faite ≤ la charge
  proposée (au centième) ; `fondement.charge` nul (le cran sans chiffre) ou série sans charge : compte.
- **Mes nombres** : `faits.scoresDeGuilde` → `guilde_scores` (`semaine`, `seances`, `prevues`, `records_semaine`, `mois`,
  `exercices`, `exercices_record`), publiés à l'ouverture de la guilde et à la fin d'une séance quand on me sait membre,
  seulement s'ils ont changé. Séances de la semaine : celles qui portent une série de travail, du lundi au dimanche (heure
  locale). Séances prévues : le profil (1 à 14), sinon `habitudes(c).seances_par_semaine`, sinon 0.
- **La jauge** : (1) Σ min(séances, prévues) sur Σ prévues (« 11 séances sur 17 prévues, à vous quatre ») ; (2) Σ records
  publiés sur N ; (3) exercices différents de la semaine, à tous, sur N — calculés par la base (une union ne s'additionne
  pas d'une personne à l'autre). N au choix : 2, 3, 5, 8, 10 (records) ; 5, 8, 10, 12, 15 (variété). Le défi est modifiable
  par l'administrateur pendant la semaine en cours (interprétation de « choisi chaque lundi », à valider).
- **« La guilde cette semaine »** (fait brut de la base) : séances terminées non privées des membres avec une série de travail,
  leurs séries médaillées (six types, une par série), et le tonnage de `Bilan.volumeKg`.
- **Progression** : ordre par part décroissante, puis par nombre d'exercices ; « 5 sur 6 » ; sans exercice compté, « — »
  en bas. Numéros de ligne comme la maquette ; ni couronne, ni rouge, ni vainqueur.
- **Blason** : le seul gabarit du social (`bouclier`), huit couleurs. Plus de gabarits : noté pour plus tard.
- **Membres** : « toi · Terreur », « jordan · Squatteur · Athlète » ; le titre seulement s'il est publié (nul jeu éteint).
  L'administrateur voit « Transmettre » et « Retirer » (deux touches), et « Modifier le nom et le blason ». « Quitter la
  guilde » demande « Oui, quitter ». Personne n'est prévenu d'un départ.
- **Inviter** : `Social.invitables` — mes abonnés mutuels (je le suis, il me suit) qui ne sont pas membres. Les invitations
  reçues s'affichent quand je n'ai pas de guilde (« Rejoindre » / « Refuser », en silence).
- **Fil** : `guilde_fil` rend les colonnes de `social_fil` (les autres membres, terminées, non privées, 30 jours) ; même
  rendu (`Rendu.rendreFil`), mêmes médailles (`faits.medaillesDuSocial` sur `guilde_records_seance`). On réagit à la
  séance d'un membre même sans le suivre (politique `reactions_guilde`).
- **Route** : `/jeu/guilde`, un sous-onglet « Guilde » à côté de « Fil ».

### 6.3 La base (v2_080, proposée)

Tables `guildes` (nom unique par `nom_cle` = `translate(lower(btrim(nom)), …)`), `guilde_membres` (**clé primaire =
la personne** : une guilde par personne), `guilde_invitations`, `guilde_defis` (contrainte `guilde_defis_type` : `seances`,
`records`, `variete`), `guilde_scores` (aucune colonne de poids). Déclencheurs : 30 membres au plus (ligne de la guilde
verrouillée) ; seul le rang change ; au départ, la guilde sans membre disparaît et l'administration passe au plus ancien
(`entre_le`, puis `user_id`) — aussi quand un compte est supprimé ; l'administrateur est toujours un membre ; une invitation
vient d'un membre et vise un de ses **mutuels** (`social_mutuel`). Aucune écriture ni lecture directe sur guildes, membres,
invitations, défis : des fonctions SECURITY DEFINER (`search_path` figé, `authenticated` seulement). Une politique ajoutée,
`reactions_guilde` (insertion), via `guilde_peut_reagir` ; aucune sur sessions, sets, records.
