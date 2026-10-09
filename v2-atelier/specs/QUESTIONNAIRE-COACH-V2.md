# Le questionnaire du coach — spec v2

**Date :** 07/10/2026 · **Statut :** décidé par Aurélien le 07/10 ; maquette `maquette-questionnaire-v4.html` (« Questionnaire
du coach ») ; recherche `RECHERCHE-QUESTIONNAIRE-2026-10-07.md` ; relevé du dépôt 60-0. **Remplace
`QUESTIONNAIRE-COACH-V1.md`** (27/09), dont les tableaux §3.1 (objectif) et §3.2 (phase) restent la référence des effets.

## 1. Principes

1. **Tout le monde le voit une fois** : compte neuf comme compte existant, **tant qu'il ne l'a jamais rempli** (Aurélien
   compris). « Plus tard » le repousse sans rien perdre.
2. **Rien de ce que les séries savent n'est demandé** : c'est **montré** pour confirmation (fréquence, durée, niveau,
   autres activités). **Ce que la personne a déjà donné est pré-rempli** (phase, rythme, poids de la dernière pesée,
   sexe, taille) : elle vérifie, elle ne retape pas.
3. **Chaque réponse a au moins un lecteur** (§4) ; chaque champ dit **pourquoi** on le demande ; tout est facultatif
   sauf le chemin du programme. Une réponse sans lecteur n'est pas posée.
4. **Un seul chemin d'écriture** : le questionnaire présente les sections du profil dans un ordre ; il écrit par
   `ecrireProfil` comme le profil (ECRAN-PROFIL §4 : « l'onboarding, c'est le profil » — le questionnaire en est
   l'ordre et la mise en avant, pas un second écran). Tout se modifie ensuite dans Profil.
5. **Chaque réponse est datée** ; l'objectif et la phase entrent dans le fondement de chaque pari, gelés pour la séance
   comme la phase (§9.16).
6. **La voix** : VOIX-DU-COACH ; le losange ambre explique, ne juge pas ; aucune question sur le corps n'est commentée.

## 2. Le déclencheur

- Colonne `profiles.questionnaire_fait_le` (timestamptz, vide = jamais rempli). **Pas `onboarding_completed`**, qui
  veut dire « profil vu » et vaut déjà « vrai » chez Alexis, Léa, Jordan et Aurélien (relevé 60-0).
- La décision de l'ouvrir se prend **quand la ligne de profil est connue** (au premier démarrage comme aux suivants),
  pas sur le seul cache (relevé 60-0 : le compte neuf n'était routé qu'au second démarrage).
- « Plus tard » : un bandeau discret sur Saisie (le composant du « brouillon oublié ») et une ligne en tête de Profil
  (« Terminer mon questionnaire »), jusqu'à ce qu'il soit rempli. Jamais bloquant. **Il s'ouvre de lui-même une fois
  par appareil** (mémoire locale, par compte) ; ensuite, le bandeau et la ligne seuls (précisé le 07/10/2026).
- Rouvert, il repart du début, chaque écran pré-rempli avec ce qui est déjà en base.
- Rempli = arrivé au récapitulatif (« Commencer »). Chaque écran validé est écrit au fur et à mesure.

## 3. Le parcours (ordre de la maquette v4)

| # | Écran | Réponses | Stockage |
|---|---|---|---|
| 1 | Bienvenue | — | — |
| 2 | **Tes données** | Oui, dans une autre app · Oui, mais pas noté · Je débute | `profiles.historique_declare` (`import` / `non_note` / `debutant`) |
| 3a | **Ce que je sais** (si historique en base) | montré : nombre de séances et depuis quand, rythme sur 12 semaines, durée habituelle, maximums aux barres, autres activités (sorties de l'historique) ; un seul bouton, « Continuer » : ce sont des faits de tes séances, et la durée se corrige à l'écran 7 (précisé le 07/10/2026 : « Je corrige » n'avait rien à écrire qui ait un lecteur) | rien (lu dans les séances) |
| 3b | **Sans historique** | ancienneté (moins d'un an · 1 à 3 ans · 3 à 5 ans · plus de 5 ans : les valeurs de la colonne existante, contrainte `profiles_anciennete_ok`, précisé le 07/10/2026) ; séances par semaine (2 à 6+) ; durée (45 · 60 · 75 · 90 · plus) | `anciennete`, `seances_par_semaine`, `duree_seance_min` (existantes) |
| 4 | **Toi** (facultatif) | sexe (homme · femme · préfère ne pas dire) ; année de naissance ; taille ; poids | `sexe`, `date_naissance` (1er janvier de l'année), `taille_cm` (existantes) ; le poids = **une pesée** du jour dans `body_weight_log`, écrite seulement si la valeur diffère de la dernière pesée ; l'année ne réécrit `date_naissance` que si elle change (une date complète déjà saisie est gardée ; précisé le 07/10/2026) |
| 5 | **Ton but** | objectif (Force · Muscle · Les deux · Forme et santé) ; phase (Prise de masse · Maintien ou recomposition · Sèche · Je ne sais pas = **phase vide**, que le coach compte comme maintien ; le récapitulatif dit « Maintien (par défaut) » — décidé le 08/10/2026 : un seul état pour une même réponse, et pas de rappel de phase à qui n'en a pas déclaré) | `profiles.objectif` (nouvelle) ; `phase`, `phase_depuis` (existantes) |
| 6 | **Priorités** | jusqu'à 3 : exercices (squat, couché, soulevé, militaire, tractions) ou muscles (les 6 groupes du radar) · Pas de priorité. **En sèche**, le coach dit : « En sèche, je garde surtout tes charges : une priorité musculaire attendra ta prochaine prise de masse. Un exercice prioritaire, oui. » | `profiles.priorites` (text[], slugs d'exercice ou groupes de `ZONE_DE`, nouvelle) |
| 7 | **Temps et matériel** | le temps est montré (« environ 75 min ») : C'est mon maximum · J'ai de la marge · Moins en ce moment (choisi, il fait apparaître juste dessous les durées 45 · 60 · 75 · 90 min, pré-cochée sur la durée visée si elle est déclarée et sous l'estimation ; sans durée choisie, « Continuer » reste actif mais rien n'est écrit pour la durée — décidé le 08/10/2026 : sans durée, la réponse n'a pas de lecteur) · Ça varie ; matériel : Salle complète · Salle basique · Maison équipée · Maison minimale · Poids du corps | `profiles.temps_reponse` (nouvelle) ; `duree_seance_min` (montrée, modifiable) ; `materiel` (existante) |
| 8 | **Ton programme** | Garder ce que je fais · Je crée mes routines · Construis-le-moi | `profiles.programme_choix` (nouvelle) — **décidé le 08/10/2026 (60-3)** : l'écran n'apparaît **que si la personne n'a aucune routine** (qui a déjà ses routines les garde : lui proposer ses anciennes séances serait du bruit — la simulation retrouvait les routines d'avant le programme actuel d'Aurélien et d'Alexis). Trois choix : « **Garder ce que je fais** » (seulement avec au moins une séance en base ; ouvre l'écran 8a), « **Je crée mes routines moi-même** » et « **Construis-le-moi** » (ouvre l'écran 8b ; 60-4). Une question à un seul choix n'apprend rien (60-3b) : avec « Construis-le-moi », l'écran a toujours au moins deux choix, il apparaît donc pour toute personne sans routine, même sans séance (précisé le 08/10/2026, 60-4). Pas de carte pour qui a déjà rempli le questionnaire : le bouton de Routines (ECRAN-SAISIE §7 quindecies.7) sert à tout le monde |
| 8a | Programme déduit | les séances qui reviennent → routines proposées | routines (§5) |
| 8b | Construis-le-moi | jours réalistes (2 à 6 ; pré-remplis par le rythme de 3a ou la réponse de 3b) ; **une zone à ménager ?** (épaule · dos · genou · coude · hanche · aucune). **Les exercices aimés / jamais sont retirés** (décidé le 08/10/2026) : l'historique dit déjà ce qu'on fait le plus, et le refus se fait face à l'exercice, dans l'aperçu (« Je n'en veux pas », §5 bis) | `seances_par_semaine` ; `profiles.zones_a_menager` (text[], v2_065) ; le programme : §5 bis |
| 9 | **Ton coach** | Me ménager · Normal · Me pousser · Juste un carnet | `rythme_progression` (prudent / normal / franc) ; « Juste un carnet » = `intention = 'entretien'` rendu silencieux (§4) |
| 10 | **Ce que j'ai compris** | récapitulatif, chaque ligne modifiable | `questionnaire_fait_le` |

## 4. Les lecteurs : qui lit quelle réponse

| Réponse | Lue par | Quand |
|---|---|---|
| Phase | escalier, série de plus, phrases, paris (déjà) ; **rappel à 6 semaines** (bandeau sur Saisie, lu depuis `phase_confirmee_le`, sinon `phase_depuis`) | 60-2b (précisé le 07/10/2026 : il lit `phase_confirmee_le`, ajoutée par v2_065) |
| Temps | « J'ai peu de temps » : `duree_seance_min` devient la cible proposée (à la place de 45 / 60 en dur) ; « Moins en ce moment » : la carte proposée d'office quand l'estimation dépasse ; « Ça varie » : l'estimation en couleur du coach à côté de « J'ai peu de temps » — **pas de question avant « Démarrer »** (décidé le 08/10/2026 ; MOTEUR §9.18) | 60-1 (la cible, #382) ; 60-2b (« Moins en ce moment », « Ça varie ») |
| Matériel | **range, ne cache jamais** : catalogue, « Machine prise », générateur. Salle complète : tout · Salle basique : tout sauf machines guidées et Smith · Maison équipée : barre, haltères, disques, kettlebell, élastique, poids du corps · Maison minimale : haltères, kettlebell, élastique, poids du corps · Poids du corps : poids du corps, élastique. Un exercice déjà dans l'historique n'est jamais rétrogradé | 60-1 |
| Juste un carnet | `intention = 'entretien'` : **aucune** phrase, proposition, carte ni bandeau du coach (dégressive et décharge comprises) ; l'invariant I13 le garde (`sansCoach`) | 60-1 |
| Objectif | zone proposée pour le premier bloc d'un programme (Force, Les deux : Lourd ; Muscle, Forme : Mix) ; générateur (reps) ; fondement des paris (gelé pour la séance, I40) | 60-2b |
| Priorités | un **exercice prioritaire** est coché d'office dans « Faire de ce dossier un programme » (MOTEUR §9.22) ; un **muscle prioritaire**, hors sèche, a de la place pour la série de plus jusqu'à son plus haut volume (MOTEUR §14.6) ; générateur. *La carte « zone de force » est abandonnée le 08/10/2026 : simulée sur les cinq historiques, aucune barre n'est travaillée à 10-12 reps d'habitude, elle ne se serait déclenchée chez personne — notée pour le générateur* | 60-2b |
| Âge, taille, poids, ancienneté, sexe | sans historique : prudence des charges de départ (générateur, séances de calage) ; poids : poids du corps, force rapportée au poids ; sexe : repères de force, classement | générateur, jeu |
| Historique déclaré | le parcours (3a ou 3b) ; « Oui, dans une autre app » sans séances en base : l'écran 3b, avec « L'import dans l'app arrive plus tard. Ces trois réponses suffisent pour commencer. » (import dans l'app : chantier à part) | 60-2a |
| Programme | 8a (la feuille « Tes séances qui reviennent », ECRAN-SAISIE §7 quindecies.7), ou l'éditeur ; 8b au générateur | 60-3, générateur |
| Zones à ménager | générateur seulement (§5 bis) : l'exercice reste, **sans série lourde, toutes ses séries gardées** ; la variante plus tolérée seulement dans les cas évidents (dos) ; jamais interdit, jamais de diagnostic, rien en séance (« J'ai mal » reste là) ; modifiable dans Profil (décidé le 08/10/2026) | 60-4 |

## 5. Le programme déduit (8a)

Sur les 12 dernières semaines : les séances avec au moins une série de travail chargée (sorties, randonnées, escalade
exclues) ; **regroupées par leurs exercices, pas par leur titre** ; un groupe qui revient **au moins 4 fois** devient
une routine : ses exercices présents dans au moins la moitié des séances du groupe, dans leur ordre médian ; séries,
reps et chauffes médianes ; repos par défaut (§9.21) ; pas de supersets dans cette version (règle exacte ci-dessous). Nom proposé : le titre le plus
fréquent du groupe, modifiable. Rien n'est écrit avant « En faire mes routines ».

**La règle exacte — simulée sur les cinq historiques et décidée le 08/10/2026** (`deduit60b.py`, cas
`cas_deduit60.json`) :
- **La fenêtre** : les 84 jours qui finissent à **la dernière séance de la personne** (un historique arrêté en juin se
  lit sur ses 12 dernières semaines, pas sur un vide).
- **La signature** d'une séance : l'ensemble de ses exercices mesurés en reps (charge et reps, ou reps seules) avec au
  moins une série de travail ou d'échec ; moins de 2 exercices : la séance ne compte pas.
- **Le regroupement**, dans l'ordre chronologique : une séance rejoint le groupe dont le profil lui ressemble le plus
  (indice de Jaccard), s'il atteint **0,35** ; sinon elle ouvre un groupe. Le profil d'un groupe : les exercices
  présents dans au moins la moitié de ses séances. Puis **deux passages** de réaffectation avec les profils stabilisés.
  Égalité : le groupe le plus ancien.
- **Une routine** : un groupe d'**au moins 4 séances**. Ses exercices : ceux du profil, dans l'ordre de leur **position
  médiane** (rang de la première série de l'exercice ÷ rang le plus haut de la séance ; égalité : par slug) ; séries de
  travail, reps et chauffes : les **médianes**, arrondies au plus proche (.5 vers le haut) ; la médiane des reps ne
  lit que les séries qui ont **au moins une répétition** (un échec à 0 rep compte comme série, pas comme « 0 reps » :
  36 en base, dont 9 dans les fenêtres de 12 semaines ; précisé le 08/10/2026, 60-5) ; deux séances au même instant
  se départagent par leur identifiant. Repos : la règle de « En
  faire une routine » (ECRAN-SAISIE §7 quindecies.4). Jamais de charge.
- **Le nom** : le titre le plus fréquent du groupe (égalité : le plus récent) ; deux routines au même nom deviennent
  « … A », « … B », dans l'ordre d'affichage (le plus de séances d'abord, puis la dernière séance la plus récente).
- **Récence** : une routine dont la dernière séance précède de **plus de 28 jours** la dernière séance de la personne
  est proposée **décochée**, avec « Pas faite depuis le 9 mai. ». La personne décide.
- **Supersets** : pas dans cette version (chaque exercice est un bloc) ; noté pour plus tard.
- **Les six choix du portage** (08/10/2026, 60-7 ; la référence `deduit60c.py` les suit, cas `cas-60-7-deduit.json`) :
  1. **Titre vide** : une séance sans titre ne compte pas dans le nom ; un groupe sans aucun titre s'appelle « Routine ».
  2. **Espaces** : les titres sont rognés (début et fin) avant d'être comptés.
  3. **Majuscules** : « Pecs » et « pecs » sont le même nom ; les lettres A, B… se posent sur le nom comparé sans casse.
  4. **Ordre d'affichage** : le plus de séances d'abord, puis la dernière séance la plus récente (à l'instant près).
  5. **Jours** : la fenêtre de 84 jours se compte en jours civils locaux (Europe/Paris), pas en 24 h glissantes.
  6. **Séance hors fenêtre de réaffectation** : une séance qui n'atteint pas le seuil reste dans son groupe d'origine.
- Simulation (au 06/10) : Jordan 3 routines (2 cochées), Léa 4 (3), Mélodie 2 (1), Alexis 6 (5), aurel_br 5 (5).

## 5 bis. Le programme construit (8b) — décidé le 08/10/2026 (60-4)

> **Le coach propose un point de départ ; la personne le regarde, refuse ce qu'elle ne veut pas, et le coach décide
> ensuite des charges, séance par séance.**

Référence `gen60.py`, cas `cas_generateur60.json` (17 programmes, dont les cinq historiques ; 64 « Je n'en veux pas » ;
30 cartes). Maquette `maquette-generateur-v1.html`.

**Ce que le générateur décide, et ce qu'il ne décide pas.** Il choisit les **exercices**, leur **ordre**, les **séries
de travail** et les **reps visées**. **Jamais de charge** (le coach : « Première fois ici », MOTEUR §9.21), **jamais de
chauffe** (le coach les propose, §9.15.2), **jamais de repos** (le chemin de « Créer la routine », ECRAN-SAISIE §7
quindecies.4), **jamais de durée** : la durée visée passe ensuite par **la fonction de « J'ai peu de temps »** (MOTEUR
§9.18), seulement si `temps_reponse` vaut « C'est mon maximum », « Moins en ce moment » ou « Ça varie » et qu'une durée
est déclarée ; « J'ai de la marge » : rien n'est raccourci.

**Le gabarit, par jours** (bornés de 2 à 6) : 2-3 corps entier · 4 haut / bas ×2 · 5 haut / bas ×2 + haut du corps ·
6 poussée / tirage / jambes ×2 ; chaque muscle environ deux fois par semaine (Schoenfeld 2016 ; Pelland 2024). Chaque
séance est une liste de **places** : un **motif** (couché, squat, rowing…) et un **rôle** (principal, secondaire,
isolation, tronc). Les gabarits et la liste ordonnée des candidats de chaque motif sont dans la référence.
**Deux jours** (précisé le 08/10/2026, 60-6, après l'audit de 17 profils) : le corps entier A porte squat, couché,
rowing, jambes tendues, mollets, tronc ; le B porte soulevé, militaire, tirage vertical, presse, un second couché
(secondaire) et le curl. Le couché est donc fait deux fois dans la semaine (7 séries de poitrine en Force, contre 4 avant),
les mollets sont travaillés (3 séries, 0 avant). **Le coût, assumé** : plus d'élévations latérales ni de triceps en direct (ils
sont dans les poussées) ; à deux jours, l'épaule n'a que le militaire en direct.

**Le choix d'une place.** Les principaux de la semaine d'abord (ils prennent la barre), puis les secondaires, les
isolations, le tronc ; un exercice n'est pris qu'une fois par semaine tant qu'il y a le choix. Candidats : ceux du
motif **permis par le matériel** (la table de 60-1 ; un exercice déjà fait n'est jamais rétrogradé), hors **écartés** ;
rien : le **motif voisin** (même muscle, autre angle) ; toujours rien : un exercice déjà pris **dans une autre
séance** de la semaine (plutôt qu'un muscle sans travail) — **jamais un exercice déjà dans la même séance** (précisé
le 08/10/2026, 60-6 : mesuré en maison minimale, le même rowing deux fois dans une séance) ; rien du tout : la place
saute. Tri : la variante plus tolérée d'une zone à ménager, puis **l'historique**
(le plus fait sur 12 semaines d'abord, la fenêtre du §5), puis l'élastique d'abord au poids du corps, puis l'ordre du
motif. La maison minimale n'a pas de barre fixe : ni tractions, ni rowing inversé.

**Moins d'un an de pratique** (`profiles.anciennete` = `moins_1_an`, précisé le 08/10/2026, 60-6). Un constat
d'Aurélien sur un profil débutant : des tractions à 12 reps et des relevés de genoux suspendus à 18. Le poids du corps
« lourd » — **tractions, relevé de genoux suspendu, rowing inversé** — n'est alors proposé **qu'en dernier recours** :
quand ni le motif, ni son voisin, ni un exercice déjà pris ailleurs dans la semaine ne donne autre chose (le tirage
à la poulie, l'élastique, le crunch à la poulie passent avant). **Un de ces exercices déjà fait n'est jamais écarté**
(l'historique, §5 : un exercice fait n'est jamais rétrogradé). Aucune autre règle ne change avec l'ancienneté : ni les
séries, ni les reps, ni les charges (le coach les décide séance par séance). *Les plafonds de reps (15, 12…) ne sont
pas posés : aucune source ne les établit.*

**Séries et reps.** Reps par objectif (principal · secondaire · isolation) : Force 5 · 7 · 12 ; Les deux 5 · 9 · 12 ;
Muscle et sans réponse 7 · 9 · 12 ; Forme 9 · 12 · 15 ; +3 en isolation pour les petits muscles (élévations, arrière
d'épaule, mollets, abdos). **Lourd seulement à la barre** : un principal hors barre prend les reps d'un secondaire.
Séries : principal 4 en Force et Les deux, 3 sinon ; secondaire et isolation 3 ; tronc 2. **+1 série** pour un
exercice prioritaire (même en sèche), et pour un muscle prioritaire sur un secondaire, une isolation ou le tronc, **hors
sèche** ; **et sur un principal quand sa zone n'a aucune autre place dans le programme** (précisé le 08/10/2026,
60-6 : « Tronc » prioritaire ne changeait rien ; à deux jours, le militaire est le seul exercice d'épaules en direct :
il prend la série).
L'exercice prioritaire passe en tête de sa séance.

**Zone à ménager** (décidé le 08/10/2026). Une place dont le motif charge la zone (genou : squat, presse, extension ;
dos : charnière, jambes tendues, squat, rowing ; épaule : militaire, couché, élévations ; coude : triceps, curl ;
hanche : hip thrust, squat, charnière) **garde son exercice et toutes ses séries, sans série lourde** (un principal
prend les reps d'un secondaire). **Le raccourci de la durée (MOTEUR §9.18) ne coupe jamais une série d'un exercice
ménagé** (précisé le 08/10/2026, 60-5 : « toutes ses séries gardées » est la règle, le temps se prend ailleurs ; si la
cible n'est alors pas atteignable, l'aperçu affiche la durée réelle, sans prétendre la tenir). La variante plus tolérée
seulement dans les cas évidents : **dos** → belt squat,
soulevé de terre à la barre hexagonale (Swinton 2011), rowing poitrine appuyée. Une charnière ne dépasse **jamais 8
reps** (la fatigue défait la technique). Pourquoi pas moins de séries : le levier d'une articulation sensible est
l'intensité, et retirer des séries coûte du progrès sans bénéfice prouvé (modèle de surveillance de la douleur).

**L'aperçu.** « {N} séances par semaine. » ; en voix du coach : « Je te propose tes charges à chaque séance. Touche un
exercice pour le changer. » ; une phrase par zone à ménager (« Tu ménages ton genou : Squat (Barre), Presse à Cuisses,
Extension Jambes, sans série lourde. Toutes leurs séries restent. ») et, si des exercices demandent une barre fixe
(tractions, rowing inversé) : « {exercices} demande(nt) une barre fixe. Sans barre : touche-le, puis Remplacer. ».
**La phrase se dit dès qu'une de ces lignes est dans le programme, pour tout matériel sauf la salle complète et la
salle basique** (précisé le 08/10/2026, 60-5 : « maison équipée » ne garantit pas une barre fixe ; la condition est
l'exercice, jamais l'étiquette du matériel). **Un matériel non renseigné vaut la salle complète** — c'est ainsi que
le générateur le traite (aucune restriction) — **donc pas de phrase** (précisé le 08/10/2026, 60-6 ; 60-5 l'avait lu
« tout sauf les deux salles »).
Une carte par séance : le nom, « ≈ 69 min » (l'estimation de §9.18, sur la structure), **la ligne « pourquoi »** —
les séries par zone du radar, chaque exercice compté dans la zone de son **premier muscle principal**, la plus grosse
d'abord, à égalité l'ordre du radar (« Poitrine 10 · Dos 6 · Bras 3 · Épaules 3 séries ») — puis chaque exercice avec
séries × reps, et sous un exercice ménagé « sans série lourde · ton genou », sous une barre fixe « demande une barre
fixe ». Toucher un exercice ouvre une feuille : « **Je n'en veux pas** » (« Je le remplace par un exercice du même
mouvement, et je ne te le proposerai plus. »), « **Remplacer** » (le choix de l'éditeur, ECRAN-SAISIE §7
quindecies.8), « Annuler ». Bouton : « **Créer ces {N} routines** », par le chemin de la feuille de 8a (ECRAN-SAISIE
§7 quindecies.7) : un dossier « **Mon programme** » (« Mon programme (2) » s'il existe déjà), la bibliothèque s'ouvre
dessus. Rien n'est écrit avant ce bouton, sauf les écartés (ci-dessous).

**« Je n'en veux pas »** (ECRAN-SAISIE §7 quindecies.9). **Seule la place touchée change** : le coach prend le suivant
du même motif (sinon le voisin, sinon un déjà pris dans une autre séance), **sans jamais reprendre ce qui est déjà
dans cette séance** (rien d'autre : la place disparaît, comme à la création, S2) ; les séries
de la place restent ; l'exercice rejoint `profiles.exercices_ecartes`. Regénérer tout le programme ferait cascader
les choix (mesuré le 08/10/2026 : écarter le couché barre changeait aussi le Haut B). Rien au catalogue : la place
disparaît.

**Refaire mon programme** (Profil). Les questions de 8b, puis l'aperçu ; **un nouveau dossier**, l'ancien reste — une
décision ne s'efface jamais en silence.

**La carte « Passer en cycles »** (décidée le 08/10/2026, question 4 ; MOTEUR §9.22). Le générateur crée des routines
simples. Pour **Force** et **Les deux** seulement : **une fois**, **21 jours** après la création du programme et
après **au moins 6 séances** faites depuis ses routines, ni en « Juste un carnet », ni si le dossier est déjà un
programme : « Tu as fait {N} séances de ton programme. » ({N} : les séances faites depuis ses routines, le fait de
`faits.js` ; le calendrier des 21 jours n'est jamais dit, MOTEUR §9.22, précisé le 08/10/2026, 60-5) ; « Un bloc de 4 semaines en Lourd sur tes barres, la dernière
plus légère : c'est là que la force se gagne. On passe en cycles ? » ; « **Passer en cycles** » ouvre « Faire de ce
dossier un programme » (Lourd, 4 semaines, décharge la dernière) ; « **Pas maintenant** » la ferme pour toujours (le
bouton du dossier reste). La période (Williams 2017 ; Moesgaard 2022 : la périodisation aide surtout la force) ; les
« 3 semaines » sont un choix de coach, sans étude derrière.

**Limites connues, assumées** : au poids du corps, le volume est faible (6 séries de dos par semaine) ; en salle
basique et en maison, pas de machine : pas de leg curl ni de mollets avec charge (chantier « matériel réduit », noté) ;
l'abdo reprend le même exercice sur deux séances quand il n'y en a pas d'autre ; en maison
équipée sans machine, une séance peut porter deux soulevés roumains (barre et haltères). Noté : le mini-chantier
« maison et poids du corps », et « la gestion de la douleur » (la douleur dans le temps, le lien avec la zone à
ménager).

## 6. Retiré de l'écran du profil

`mode_entrainement` (Discipline, absorbée par l'objectif), `niveau_declare`, `jours_vises`, `unites` : retirés de
l'écran (les valeurs restent en base, aucune n'est lue). Les quatre phrases qui promettaient un effet absent
(Discipline, Matériel, Durée « pour un générateur… ») sont réécrites selon ce qui est branché.

## 7. Le découpage

| PR | Contenu | Migration |
|---|---|---|
| **60-1** (#382) | brancher l'existant : temps (la cible), matériel, « Juste un carnet » silencieux ; nettoyage du profil | non |
| **60-2a** | l'écran du questionnaire (§2, §3 sauf 8, 8a, 8b), son déclencheur, « Plus tard », les nouveaux champs dans Profil ; « Juste un carnet » éteint aussi la fin de bloc | `v2_065` (appliquée le 07/10/2026) |
| **60-2b** | les lecteurs : objectif (zone du premier bloc, fondement des paris, I40), priorités (exercice coché dans un programme, plafond de volume d'un muscle prioritaire), rappel de phase à 6 semaines, « Moins en ce moment » et « Ça varie » ; la rangée « programme » éteinte en carnet ; le 403 à la création du profil | non |
| **60-2c** | avant l'ouverture : « Je ne sais pas » écrit une phase vide partout, « Moins » demande combien, « Quitter » compte les réponses de profil non envoyées, le pseudo gardé après « Quitter », la garde I18 en Édition | non |
| **60-3** | le programme déduit (8a) : l'écran 8 sans routines, la feuille « Tes séances qui reviennent » et son bouton dans Routines ; « Remplacer » dans l'éditeur de routine | non |
| **60-4** | le programme construit (8b, §5 bis) : l'écran 8b, le générateur, l'aperçu avec « Je n'en veux pas », les exercices écartés, « Refaire mon programme », la carte « Passer en cycles » | `v2_066` |

**Ouverture à Alexis : après 60-2b** (le questionnaire complet et branché, hors programme). 60-3 peut suivre.

## 8. Amendements — faits le 07/10/2026 (deltas 60-2a) et le 08/10/2026 (60-2b, MOTEUR §9.16)

- MOTEUR §1.1 (« ne jamais demander, toujours déduire — une seule exception ») : déjà dépassé par le réglage, la phase
  et le lest ; le questionnaire le remplace par « on ne demande que ce que les séries ne savent pas, et ce qui est
  demandé a un lecteur ».
- ECRAN-PROFIL §4 : le questionnaire est l'ordre et la mise en avant des sections du profil.
- MOTEUR §9.16 : le rappel de phase à 6 semaines n'est plus « au chantier du questionnaire ».
