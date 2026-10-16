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

- **Décision d'Aurélien du 14/10/2026 (après la PR #421)** : le défi de la semaine est FIGÉ une fois la semaine lancée.
  Seule exception : l'administrateur peut encore le changer tant qu'aucun membre n'a terminé de séance cette semaine-là.
  **Précision du 14/10/2026 (v2_083, prompt 92)** : seule compte une séance terminée APRÈS la création de la guilde
  (`coalesce(fin, debut) > guildes.cree_le`). Une guilde créée en cours de semaine, après des séances de ses membres, garde
  donc son défi modifiable jusqu'à la prochaine séance terminée. Figé, l'écran le dit à l'administrateur : « Défi figé : la
  semaine a commencé. Tu en choisiras un lundi. »

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
  par l'administrateur **tant qu'aucun membre n'a terminé de séance** dans la semaine en cours (heure de Paris, toute
  séance terminée) ; ensuite il est figé : l'écran retire le choix (`defi_modifiable` de `guilde_semaine`,
  `Social.defiModifiable`) et la base refuse (`guilde_semaine_lancee`, exception `guilde_defi_fige`). Choisir le
  premier défi après une séance terminée est aussi refusé : le défi (1) court alors seul.
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
invitations, défis : des fonctions SECURITY DEFINER (`guilde_choisir_defi` refuse dès que la semaine est lancée) (`search_path` figé, `authenticated` seulement). Une politique ajoutée,
`reactions_guilde` (insertion), via `guilde_peut_reagir` ; aucune sur sessions, sets, records.

## 7. Groupe — décisions du 14/10/2026 (prompt 91)

> Décisions d'Aurélien du 14/10/2026, reportées mot pour mot. Maquettes : `v2-atelier/maquettes/maquette-social-groupe-v1.html`
> (4 écrans) et `v2-atelier/maquettes/maquette-groupe-direct-interactive.html` (la carte en direct). Base : migration
> **proposée** `v2-atelier/migrations-proposees/v2_082_groupe.sql` (relue et lancée par Claude.ai, après v2_080 et v2_081).

- Mes amis = liste ; guilde = permanente ; groupe = éphémère, le temps d'une séance (comme dans Dofus), à distance ET à la salle.
- Lancé depuis sa séance en cours ; on invite des abonnés mutuels. 2 à 6 personnes. Un groupe à la fois par personne. Rejoindre est possible tant que le groupe vit.
- Rejoindre : « Suivre la séance de X » (la liste d'exercices de X copiée au moment où l'on rejoint ; les charges restent celles de SON coach ; si X ajoute un exercice ensuite, une ligne propose « jordan a ajouté Leg Curl · Ajouter ? ») / une de mes routines / séance vide / « Pas maintenant ». Chacun garde SA séance : aucune donnée de séance mélangée. La routine décide de la structure, le moteur décide de la charge.
- Le direct (la dernière série validée de chacun : exercice, charge × reps, il y a N min) est réservé aux membres du groupe : ni abonnés ni guilde. Rafraîchi environ toutes les 20 s par une lecture (pas de temps réel). Le direct est une décoration, jamais une dépendance : hors réseau, la séance continue normalement ; le groupe se met à jour au retour du réseau, les messages partent alors.
- Messages : rapides tout faits (« On y va ? », « Je commence », « Dernière série ! »), émojis, et texte libre ≤ 140 caractères ; membres seulement ; effacés à l'extinction du groupe ; une ligne discrète en haut de la séance, jamais un overlay ; bouton « Muet » ; le blocage s'applique (deux personnes qui se bloquent ne peuvent être dans le même groupe).
- Fin : chacun voit d'abord le récap de SA séance, puis, quand toutes les séances du groupe sont terminées, le récap du « combat » : tout ce qui a été fait ensemble, score collectif (tonnage, séries, records — les records du journal des records, même règle que partout ; XP cumulée si le jeu est allumé), la part de chacun en faits, SANS classement ni vainqueur. Le récap compte TOUT ce que chacun a fait dans sa séance, même avant d'avoir rejoint (décision d'Aurélien). Le groupe s'éteint à la fermeture du récap de groupe. Un membre sans série validée depuis 45 min compte comme terminé (règle de la séance vivante : réutilise-la, ne la recopie pas).
- La séance garde la trace « Faite en groupe avec jordan, lea » et le récap du groupe reste lisible depuis le détail de la séance (il faut donc garder un récap figé, pas les messages).
- Le coach et les bilans ne lisent rien du groupe ; le plan de séance n'est jamais modifié par le groupe.

### 7.1 Ce que le code en a fait (91)

- **Le groupe naît à la première invitation**, depuis la séance en cours (« S'entraîner ensemble », en haut de la séance) ;
  l'écran d'invitation liste mes abonnés mutuels (`Social.invitablesDuGroupe`), « Inviter » / « Annuler ».
- **Les invitations** (pas de notification push) s'affichent en haut de Séances et de Saisie, et en haut de la séance en
  cours ; « Pas maintenant » ne retire rien : l'invitation reste tant que le groupe vit (interprétation).
- **Rejoindre avec une séance déjà en cours** : un seul choix, « Avec ma séance en cours », plus « Pas maintenant »
  (interprétation : on ne commence pas une seconde séance).
- **« Suivre la séance de X »** : une séance vide, puis chaque exercice de la liste de X posé par le geste du catalogue
  (séries de départ de MON habitude, semaine allégée, série de plus) ; la copie est gardée dans le brouillon de la séance
  (`seance.groupe.suivi`, comme `raccourcie`), jamais en base. Un exercice que X ajoute ensuite est proposé UNE fois
  (« Ajouter » / « Non »).
- **Le direct** : les 20 dernières séries validées des AUTRES membres (chauffes comprises), dans leur séance du groupe ;
  la carte montre une pastille par membre (point vert : une série validée il y a moins de 3 min), les 2 plus récentes,
  « Tout voir (N) » / « Réduire », et la ligne des messages (toujours là, vide ou cachée par « Muet ») : la carte garde sa
  hauteur de 2 à 6 membres. Relu toutes les 20 s en séance ou dans un groupe (app visible), et tout de suite en touchant
  l'onglet de la séance. Une lecture qui échoue ne dit rien.
- **Hors réseau** : un message attend en mémoire (« 1 message partira au retour du réseau. ») et part à la lecture
  suivante qui réussit. La séance n'attend jamais le groupe. *(Remplacé par §7.3 : le message est gardé sur le
  téléphone, il survit à un rechargement.)*
- **« Terminé »** : `Social.membreTermine` appelle `Seance.estVivante` (45 min) sur les faits rendus par la base (statut,
  début, dernière série validée) ; une séance pas encore arrivée en base vaut « commencée à l'entrée dans le groupe ».
- **La fin** : à « Terminer », mon XP de la séance part au groupe (`Jeu.apport(...).xp`, nulle jeu éteint). À la
  fermeture de MON récap, si toutes les séances sont terminées, le récap du groupe s'ouvre ; sinon Séances dit « Groupe ·
  jordan s'entraîne encore », puis « Le récap du groupe est prêt · Voir ».
- **Le récap du « combat »** : « Ensemble · mercredi 14 oct. », les pseudos dans l'ordre d'arrivée, tonnage
  (`Bilan.volumeKg`), séries de travail, records (une médaille par série médaillée du journal, la règle du fil et du
  récap), « +N XP ensemble » si mon jeu est allumé (la somme des XP publiées, celles des jeux éteints tues par la base),
  puis la part de chacun (« 1,8 t · 3 séries · 1 record »). Ni rang, ni vainqueur.
- **« Fermer »** fige mon récap (`groupe_recaps`) et me sort ; le dernier qui ferme éteint le groupe (messages et
  invitations effacés). **Une séance abandonnée** quitte le groupe sans récap (`groupe_quitter`).
- **Le détail de la séance** : « Faite en groupe avec jordan, lea » (en ligne), qui rouvre le récap figé.
- **Bloquer en plein groupe** fait partir celui qui bloque, en silence (sa séance continue) — interprétation de « deux
  personnes qui se bloquent ne peuvent être dans le même groupe ».
- **Le coach et les bilans** ne lisent rien du groupe : `plan.js` n'est pas touché ; le groupe n'écrit jamais dans une
  série ni dans un plan.

### 7.2 La base (v2_082, proposée)

Tables `groupes`, `groupe_membres` (clé `(groupe_id, user_id)` ; index unique `groupe_membres_un_a_la_fois` sur la
personne tant que son récap n'est pas fermé ; une séance dans un seul groupe ; colonnes : séance, liste d'exercices, XP,
`ferme`), `groupe_invitations`, `groupe_messages` (1 à 140 caractères, cascade avec le groupe), `groupe_recaps` (le récap
figé, lisible par son propriétaire seul). Déclencheurs : 6 membres au plus (ligne du groupe verrouillée), jamais avec
quelqu'un qu'on bloque, plus d'entrée une fois un récap fermé, jamais la séance d'un autre ; seuls la liste, l'XP et
`ferme` changent ; l'extinction quand tous ont fermé ; une invitation vient d'un membre et vise un de ses **mutuels**
(`social_mutuel`) ; un blocage (nouveau déclencheur sur `blocages`) fait partir celui qui bloque. Aucune écriture ni
lecture directe : des fonctions SECURITY DEFINER, `search_path` figé, `authenticated` seulement (`groupe_creer`,
`groupe_inviter`, `groupe_annuler_invitation`, `groupe_repondre`, `groupe_quitter`, `groupe_publier`, `groupe_envoyer`,
`groupe_fermer`, `groupe_moi`, `groupe_etat`, `groupe_direct`, `groupe_messages_lire`, `groupe_invitations_recues`,
`groupe_invitations_envoyees`, `groupe_recap`, `groupe_recap_seance`). Aucune politique ajoutée, ni sur les tables du
groupe ni sur sessions, sets, records ; aucune colonne interdite rendue.

### 7.3 Décisions du 15/10/2026 (prompt 106)

> Décisions d'Aurélien du 15/10/2026, reportées mot pour mot. Base : migration **proposée**
> `v2-atelier/migrations-proposees/v2_087_groupe_fin.sql` (relue et lancée par Claude.ai, après v2_082). Elles
> remplacent, au §7, « effacés à l'extinction du groupe » et « Le groupe s'éteint à la fermeture du récap de groupe ».

1. « Un message de groupe écrit hors ligne est gardé sur le téléphone (il survit à un rechargement de l'app) et part au retour du réseau. »
2. « Le groupe est terminé dès que toutes les séances sont finies (règle de la séance vivante : sans série validée depuis 45 min, un membre compte comme terminé). Chacun peut lancer ou rejoindre un autre groupe dès que SA séance est finie, sans attendre les autres. Le récap du « combat » reste à vie dans chaque séance (« Faite en groupe avec … »). Les messages s'effacent quand tout le monde a fermé le récap, ou au plus tard 24 h après la fin du groupe. »

### 7.4 Ce que le code en a fait (106)

- **Le message gardé** : chaque message part dans une file `{ id, groupe_id, texte, le }` écrite dans le cache de
  l'appareil (le brouillon `groupe-messages`, comme la séance) AVANT le premier essai d'envoi, relue au démarrage
  (`chargerCache`, filtrée par `Social.fileDeMessages` : un cache abîmé ne casse rien), vidée par « Quitter » et par un
  autre compte qui entre. Elle part au retour du réseau (l'évènement `online`, la lecture du groupe toutes les 20 s,
  l'ouverture d'un écran du groupe), un envoi à la fois, dans l'ordre. L'identifiant est fabriqué par l'app : renvoyé
  après un rechargement, le message ne se double pas. Il part pour le groupe où il a été écrit : si ce groupe est fini
  depuis 24 h, ou si je l'ai quitté, la base refuse ; le message est retiré et le refus se dit (« Ce groupe est
  terminé. »). Le réseau absent, il attend : rien n'est perdu. « 1 message partira au retour du réseau. » compte ceux
  du groupe montré.
- **Libre pour un autre groupe** (`Social.libreDuGroupe`) : sans place dans un groupe ; ou une AUTRE séance en cours
  (une seule séance à la fois : celle du groupe est finie) ; ou, sans séance en cours, la règle de la séance vivante
  sur ma ligne (`membreTermine`). Libre, les invitations d'un autre groupe se montrent (Séances, Saisie, la séance),
  même si le récap du groupe d'avant n'est pas encore prêt (« Groupe · jordan s'entraîne encore » reste à côté).
- **Le groupe de CETTE séance** : la carte du direct, la liste publiée, l'XP de fin et la sortie d'une séance
  abandonnée ne concernent que la séance du groupe (ma ligne de `groupe_etat`, `session_id`). Une séance suivante n'en
  hérite rien : elle peut lancer (« S'entraîner ensemble ») ou rejoindre. Avant de lancer ou de rejoindre, la file
  d'envoi part (`vidanger`), pour que la base sache ma séance précédente finie.
- **Le récap** : il se lit depuis le détail de la séance dès que MA séance est finie (« Faite en groupe avec … »), tel
  qu'il est tant que le groupe existe — même si je suis parti vers un autre groupe sans le fermer —, et figé ensuite.

### 7.5 La base (v2_087, proposée)

- `groupes.fini_le` : posée une fois, par l'**entretien**, quand toutes les séances sont finies — la plus tardive des
  fins ; une séance est finie (`groupe_fin_de_seance`) à sa fin si elle est `terminee`, sinon 45 min après son activité
  (dernière série validée, à défaut son début, à défaut l'entrée dans le groupe) : la règle de `Social.membreTermine`,
  au même seuil que `Seance.MINUTES_VIVANTE` (un test lit la migration). Une fois posée, elle ne bouge plus.
- **L'entretien** (`groupe_entretien`, interne) passe au début de CHAQUE fonction du groupe, lectures comprises
  (devenues VOLATILE), par n'importe qui : il pose les fins, retire les invitations des groupes finis et efface les
  messages des groupes finis depuis 24 h. Ni cron, ni Edge Function. On n'entre plus dans un groupe fini
  (`groupe_eteint`).
- **Un groupe à la fois** : l'index `groupe_membres_un_a_la_fois` reste. Lancer et rejoindre ferment d'abord ma place
  dans le groupe précédent si MA séance y est finie (`groupe_liberer`, interne), sinon `groupe_deja_dans_un`. Un
  refus annule tout (ma place reste ouverte).
- **Le récap** : figé à la fermeture du sien (v2_082) et, pour tous ceux qui restent, à l'extinction (`groupe_figer`,
  interne) ; pas à la fin même — une XP publiée un peu après la fin d'une séance compte encore. `groupe_recap_seance`
  rend le récap figé, sinon, tant que le groupe existe, celui du moment.
- **Le message** : `groupe_envoyer(p_texte, p_groupe, p_id)` (les deux derniers à défaut nul : l'appel d'une app
  d'avant reste valide) — refusé pour un autre groupe que le mien (`groupe_pas_membre`), refusé 24 h après la fin
  (`groupe_eteint`), une seule fois par identifiant.
- Toujours aucune politique, ni sur les tables du groupe ni sur sessions, sets, records ; les fonctions internes
  (`groupe_fin_de_seance`, `groupe_fini_le`, `groupe_recap_json`, `groupe_figer`, `groupe_entretien`, `groupe_liberer`)
  ne sont appelables par personne ; les autres, par `authenticated` seulement.

## 8. Un geste social fait hors ligne — décision du 15/10/2026 (prompt 107)

> Décision d'Aurélien du 15/10/2026, reportée mot pour mot.

« Un geste social fait hors ligne est gardé sur le téléphone et part au retour du réseau, comme les séances ; il n'est jamais perdu en silence. Si la base le refuse au retour (le compte est devenu privé, un blocage entre-temps…), l'app le dit en une phrase. »

### 8.1 Ce que le code en a fait (107)

- **La file d'envoi des séances** (`attente.js`), réutilisée telle quelle, avec une table de plus, `social` (op `geste`) :
  elle est déjà sur disque (IndexedDB), relue au démarrage, vidée au retour du réseau (`online`) et dans l'ordre de pose,
  et l'état de synchronisation la compte déjà. Une seconde file aurait recopié tout cela. Ce qui lui est propre :
  **un refus de la base ne la bloque jamais** — l'entrée sort, au lieu de rester « refusée » en tête (un geste social ne
  retient pas une séance) ; ce qui est un refus, ce qui est « déjà fait » et ce qui se réessaie se décide dans
  `Social.issueDuGeste`.
- **Les gestes** : s'abonner (profil, recherche, « Suivre en retour »), accepter, refuser une demande, retirer un abonné,
  retirer l'abonnement ou annuler la demande, bloquer, débloquer, réagir et retirer sa réaction (fil et fil de la
  guilde), et les gestes de la guilde (créer, modifier, inviter, rejoindre ou refuser une invitation, retirer un membre,
  transmettre, choisir le défi, choisir son rang, partir). **« Compte privé »** est un champ du profil : il part par le
  chemin du profil, local d'abord et rejoué au retour du réseau, comme avant. **Le groupe de séance** n'entre pas dans la
  file : il n'existe que pendant la séance et réseau présent (créer, inviter, rejoindre lisent l'état du groupe) ; un
  refus s'y dit déjà en haut de la séance, et ses messages ont leur propre attente (§7.1).
- **L'écran** montre le geste aussitôt comme fait (la lecture de la base, plus les gestes qu'elle ne contient pas
  encore), avec une ligne discrète « En attente du réseau » (ou « · en attente du réseau » après l'état d'un profil)
  tant qu'il n'est pas parti. Hors réseau, une lecture qui échoue dit « Il faut le réseau pour voir … ».
- **Idempotence** : rejoué (la réponse perdue), un geste ne se double pas — un abonnement, un blocage ou une réaction
  « déjà là » vaut « fait », pas un refus.
- **Un geste qui annule le précédent n'envoie que l'état final** : un geste sur un état (mon abonnement à quelqu'un, son
  abonnement à moi, ma réaction à une séance, mon rang, le défi, le nom de la guilde) remplace celui qui attend sur le
  même état, en fin de file. S'abonner puis se désabonner hors ligne n'envoie que le retrait. Bloquer, qui efface les
  liens, et les autres gestes de la guilde ont chacun leur envoi, dans l'ordre.
- **Refusé au retour** (bloqué entre-temps, guilde complète, nom pris…) : l'écran social ouvert le dit en une phrase
  (« « S'abonner à olga » n'a pas pu se faire. », ou les mots de la guilde), puis se relit et montre l'état réel. **Le
  compte devenu privé** n'est pas un refus de la base (l'abonnement arrive en demande) ; l'écran avait dit « tu le
  suis », il le dit : « Le compte de melodie est devenu privé : ta demande attend son accord. »
