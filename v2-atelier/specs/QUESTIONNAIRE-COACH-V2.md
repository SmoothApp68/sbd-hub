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
| 3a | **Ce que je sais** (si historique en base) | montré : nombre de séances et depuis quand, rythme sur 12 semaines, durée habituelle (la médiane des séances de musculation des 12 semaines qui ont une heure de fin — précisé le 16/10/2026, audit du 16/10, la règle « à la salle » du 119 : une randonnée ou une séance d'escalade ne la tirent plus ; le nombre de séances et le rythme comptent toujours les sorties), maximums aux barres, autres activités (sorties de l'historique) ; un seul bouton, « Continuer » : ce sont des faits de tes séances, et la durée se corrige à l'écran 7 (précisé le 07/10/2026 : « Je corrige » n'avait rien à écrire qui ait un lecteur) | rien (lu dans les séances) |
| 3b | **Sans historique** | ancienneté (moins d'un an · 1 à 3 ans · 3 à 5 ans · plus de 5 ans : les valeurs de la colonne existante, contrainte `profiles_anciennete_ok`, précisé le 07/10/2026) ; séances par semaine (2 à 6+) ; durée (45 · 60 · 75 · 90 · plus ; **« Plus » ouvre juste dessous « Combien de minutes ? »**, de 95 à 300 — la borne de
la base —, et la durée tapée s'écrit ; décidé par Aurélien le 22/10/2026, audit du 16/10, 03 #11 : « Des gens voudront
peut-être s'entraîner 4 h » ; 120 min serait inventé. Sans minutes tapées, « Plus » n'écrit rien pour la durée) | `anciennete`, `seances_par_semaine`, `duree_seance_min` (existantes) |
| 4 | **Toi** (facultatif) | sexe (homme · femme · préfère ne pas dire) ; année de naissance ; taille ; poids | `sexe`, `date_naissance` (1er janvier de l'année), `taille_cm` (existantes) ; le poids = **une pesée** du jour dans `body_weight_log`, écrite seulement si la valeur diffère de la dernière pesée ; l'année ne réécrit `date_naissance` que si elle change (une date complète déjà saisie est gardée ; précisé le 07/10/2026) |
| 5 | **Ton but** | objectif (Force · Muscle · Les deux · Forme et santé) ; phase (Prise de masse · Maintien ou recomposition · Sèche · Je ne sais pas = **phase vide**, que le coach compte comme maintien ; le récapitulatif dit « Maintien (par défaut) » — décidé le 08/10/2026 : un seul état pour une même réponse, et pas de rappel de phase à qui n'en a pas déclaré) | `profiles.objectif` (nouvelle) ; `phase`, `phase_depuis` (existantes) |
| 6 | **Priorités** | jusqu'à 3 : exercices (squat, couché, soulevé, militaire, tractions) ou muscles (les 6 groupes du radar) · Pas de priorité. **En sèche**, le coach dit : « En sèche, je garde surtout tes charges : une priorité musculaire attendra ta prochaine prise de masse. Un exercice prioritaire, oui. » | `profiles.priorites` (text[], slugs d'exercice ou groupes de `ZONE_DE`, nouvelle) |
| 7 | **Temps et matériel** | le temps est montré (« environ 75 min ») : C'est mon maximum · J'ai de la marge · Moins en ce moment (choisi, il fait apparaître juste dessous les durées 45 · 60 · 75 · 90 min, pré-cochée sur la durée visée si elle est déclarée et sous l'estimation ; sans durée choisie, « Continuer » reste actif mais rien n'est écrit pour la durée — décidé le 08/10/2026 : sans durée, la réponse n'a pas de lecteur) · Ça varie ; matériel : Salle complète · Salle basique · Maison équipée · Maison minimale · Poids du corps | `profiles.temps_reponse` (nouvelle) ; `duree_seance_min` (montrée, modifiable) ; `materiel` (existante) |
| 8 | **Ton programme** | Garder ce que je fais · Je crée mes routines · Construis-le-moi | `profiles.programme_choix` (nouvelle) — **décidé le 08/10/2026 (60-3)** : l'écran n'apparaît **que si la personne n'a aucune routine** (qui a déjà ses routines les garde : lui proposer ses anciennes séances serait du bruit — la simulation retrouvait les routines d'avant le programme actuel d'Aurélien et d'Alexis). Trois choix : « **Garder ce que je fais** » (seulement avec au moins une séance en base ; ouvre l'écran 8a), « **Je crée mes routines moi-même** » et « **Construis-le-moi** » (ouvre l'écran 8b ; 60-4). Une question à un seul choix n'apprend rien (60-3b) : avec « Construis-le-moi », l'écran a toujours au moins deux choix, il apparaît donc pour toute personne sans routine, même sans séance (précisé le 08/10/2026, 60-4). Pas de carte pour qui a déjà rempli le questionnaire : le bouton de Routines (ECRAN-SAISIE §7 quindecies.7) sert à tout le monde |
| 8a | Programme déduit | les séances qui reviennent → routines proposées | routines (§5) |
| 8b | Construis-le-moi | jours réalistes (2 à 6 ; pré-remplis par le rythme de 3a ou la réponse de 3b ; **audit du 16/10/2026, prompt 116** : une valeur déclarée hors 2-6 — le Profil permet 1 à 14 — est pré-cochée bornée, mais n'est **pas réécrite** tant que la personne ne touche pas les puces ; le programme se construit sur la valeur bornée) ; **une zone à ménager ?** (épaule · dos · genou · coude · hanche · aucune). **Les exercices aimés / jamais sont retirés** (décidé le 08/10/2026) : l'historique dit déjà ce qu'on fait le plus, et le refus se fait face à l'exercice, dans l'aperçu (« Je n'en veux pas », §5 bis) | `seances_par_semaine` ; `profiles.zones_a_menager` (text[], v2_065) ; le programme : §5 bis |
| 9 | **Ton coach** | Me ménager · Normal · Me pousser · Juste un carnet | `rythme_progression` (prudent / normal / franc) ; « Juste un carnet » = `intention = 'entretien'` rendu silencieux (§4) |
| 10 | **Ce que j'ai compris** | récapitulatif, chaque ligne modifiable | `questionnaire_fait_le` |

## 3 bis. Le premier jour — décidé le 29/10/2026 (187)

Le parcours devient : Bienvenue · **Tu t'entraînes depuis combien de temps ?** (Je commence · Moins d'un an · 1 à 3 ans · 3 à 5 ans · Plus de 5 ans ; « Je commence » écrit `anciennete = moins_1_an` et `historique_declare = debutant`) · **Tes séances sont notées quelque part ?** (dès qu'on n'est plus débutant : « Oui, dans Hevy ou Strong » importe en place, avec le code d'import existant, puis reprend à « Ce que je sais » ; « Dans mes notes » : *Bientôt* ; « Non ») · Ce que je sais (si historique en base) · **Où tu t'entraînes ?** (les salles et leur sous-ligne ; « Ajuster Ma salle », replié : les crans des haltères, `profiles.ma_salle` — les petits disques et la barre de traction n'ont pas encore de clé, voir le rapport 187) · **Une zone à ménager ?** (pour tout le monde, `zones_a_menager`) · **Une série récente ?** (facultatif, si 1 an ou plus et aucune séance en base : squat · couché · soulevé · militaire en charge × reps, qui devient la charge de départ des barres du programme) · Toi · Ton but · Priorités · **Ton temps** (une seule fois : la durée n'est plus dite comme un fait ; les jours ne sont plus demandés deux fois) · Ton programme · Ton coach (**Me ménager · Normal · Me pousser**, les valeurs en base restent prudent / normal / franc) · Ce que j'ai compris.

Le récapitulatif dit vrai, exercice par exercice : « je te propose tes charges » s'il existe un historique ou une série récente ; sinon « **à ta première séance, on trouve ta charge ensemble** » (le calage, MOTEUR §9.21). Les anciens écrans « Tes données » (trois réponses) et « Sans historique » disparaissent.

## 4. Les lecteurs : qui lit quelle réponse

| Réponse | Lue par | Quand |
|---|---|---|
| Phase | escalier, série de plus, phrases, paris (déjà) ; **rappel à 6 semaines** (bandeau sur Saisie, lu depuis `phase_confirmee_le`, sinon `phase_depuis`) | 60-2b (précisé le 07/10/2026 : il lit `phase_confirmee_le`, ajoutée par v2_065) |
| Temps | « J'ai peu de temps » : `duree_seance_min` devient la cible proposée (à la place de 45 / 60 en dur) ; « Moins en ce moment » : la carte proposée d'office quand l'estimation dépasse ; « Ça varie » : l'estimation en couleur du coach à côté de « J'ai peu de temps » — **pas de question avant « Démarrer »** (décidé le 08/10/2026 ; MOTEUR §9.18) | 60-1 (la cible, #382) ; 60-2b (« Moins en ce moment », « Ça varie ») |
| Matériel | **range, ne cache jamais** : catalogue, « Machine prise », générateur. Salle complète : tout · Salle basique : tout sauf machines guidées et Smith · Maison équipée : barre, haltères, disques, kettlebell, élastique, poids du corps · Maison minimale : haltères, kettlebell, élastique, poids du corps · Poids du corps : poids du corps, élastique. Un exercice déjà dans l'historique n'est jamais rétrogradé | 60-1 |
| Juste un carnet | `intention = 'entretien'` : **aucune** phrase, proposition, carte ni bandeau du coach (dégressive et décharge comprises) ; l'invariant I13 le garde (`sansCoach`) | 60-1 |
| But d’entraînement (ex-« Objectif », 173) | zone proposée pour le premier bloc d'un programme (Force, Les deux : Lourd ; Muscle, Forme : Mix) ; générateur (reps) ; fondement des paris (gelé pour la séance, I40) | 60-2b |
| Priorités | un **exercice prioritaire** est coché d'office dans « Faire de ce dossier un programme » (MOTEUR §9.22) ; un **muscle prioritaire**, hors sèche, a de la place pour la série de plus jusqu'à son plus haut volume (MOTEUR §14.6) ; générateur. *La carte « zone de force » est abandonnée le 08/10/2026 : simulée sur les cinq historiques, aucune barre n'est travaillée à 10-12 reps d'habitude, elle ne se serait déclenchée chez personne — notée pour le générateur* | 60-2b |
| Âge, taille, poids, ancienneté, sexe | sans historique : prudence des charges de départ (générateur, séances de calage) ; poids : poids du corps, force rapportée au poids ; sexe : repères de force, classement. **Audit du 16/10/2026 (prompt 116)** : l'âge et la taille n'ont encore aucun lecteur (le programme construit ne pose jamais de charge, §5 bis) ; l'écran « Toi » le dit : « Je ne m'en sers pas encore. Avec ton poids, elle pourra aider à choisir tes charges de départ. » (la taille). **Delta du 30/10/2026 (191) : l'année de naissance A UN LECTEUR** — la prudence de montée (MOTEUR §9.1.2, delta 191 : plafond des sauts à +10 % dès 65 ans, un cran à la fois pour un débutant de 50 ans et plus ; absente, aucune règle). L'écran « Toi » et la feuille « Date de naissance » du Profil le disent : « Elle règle la prudence de tes montées de charge, jamais ta charge de départ. » (l'ancienne phrase « Je ne m'en sers pas encore. Elle pourra régler la prudence de tes charges de départ. » tombe) ; l'âge ne règle pas la charge de départ | générateur, jeu |
| Historique déclaré | le parcours (3a ou 3b) ; « Oui, dans une autre app » sans séances en base : l'écran 3b, avec « Tu pourras importer tes séances depuis Profil, « Importer depuis Hevy ». Ces trois réponses suffisent pour commencer. » (l'import : ECRAN-PROFIL §2.4 quater, chantier 69 ; révisé le 11/10/2026) | 60-2a |
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

**La carte « Passer en cycles »** (décidée le 08/10/2026, question 4 ; MOTEUR §9.22). *(193-2 : un programme de Force ou Les deux construit par les familles, §5 bis.1, crée sa phase à la création — son dossier est déjà un programme, la carte ne vient pas.)* Le générateur crée des routines
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

### 5 bis.1 Les familles de force — décidé le 31/10/2026 (chantier 193-2)

> **Force et Les deux ne se construisent plus avec le gabarit des autres objectifs. Trois couches : le schéma de chaque ligne,
> la semaine (la même barre, une zone par jour), les phases (cinq semaines, la dernière allégée).** Maquette
> `maquette-programmes-force-v2.html`. Cas : `tests/unit/fixtures/cas-193-2-programmes-force.json` (22 programmes, 11 cas de 60-6
> rejoués avec leur raison) ; test `v2-generateur-force.test.js`. Le gabarit seul (comptes **sans historique**) : le chemin
> historique (`completer`) est la 193-2b.

**Quand.** `objectif` = `force` ou `les_deux`, **une barre à disposition** (le squat ET le couché à la barre sont faisables : matériel,
catalogue ; « Je n'en veux pas » ne l'enlève pas, il se remplace). Sinon le gabarit d'avant, inchangé — comme pour Muscle, Forme et
sans objectif. `Generateur.FAMILLES[objectif][jours]` (2 à 6 jours) ; `famille: false` en entrée rejoue l'ancien gabarit (les tests de 60-6).

**Couche 1 — le schéma, par ligne.** **Force : des séries égales** (squat et couché Lourd 4 × 4, soulevé Lourd 3 × 3) : l'écart de départ
des reculs (10 %, MOTEUR §9.28) n'est pas réglable, le réglage « force » (≈ −5 %, mêmes reps) viendra plus tard. **Les deux : une grosse
série puis des reculs** (« 1 × 4 · 3 reculs », reps du recul 6 ; soulevé 2 reculs de 5), le reste en hypertrophie (séries égales). Une
ligne porte **un nombre de reps visées** (Lourd 4, Mix 6, Hypertrophie 9), jamais une fourchette : la fourchette vient de la zone posée
sur la ligne et s'affiche dessous (« zone Lourd (3-5) »).

**Couche 2 — la semaine.** La **même barre** passe deux fois (Force : le squat 2 fois, le couché 3 fois dès 3 jours, le soulevé 1 fois
lourd + le roumain ; Les deux : chaque barre 2 fois, le soulevé 1 fois lourd + le roumain), **à deux zones** : la zone du jour est
écrite sur la ligne de la routine (`routine_exercises.zone`, MOTEUR §9.29). Les accessoires restent en Automatique. Deux contraintes
d'ordre seulement : le squat Lourd et le soulevé Lourd ne tombent jamais dans la même séance, ni, dès 4 jours, dans deux séances qui se suivent (Zourdos 2016 : petit effet,
on ne cherche pas l'ordre « idéal »). Le militaire n'est pas une barre de compétition : Force, une fois (Mix, jour D) ; Les deux, deux
fois (Hypertrophie, puis Lourd avec reculs).

**Places liées.** Les deux lignes d'une même barre sont **liées** (`lien`) : même exercice, deux zones. **« Je n'en veux pas » et
« Remplacer » les changent ensemble** (le même remplaçant, chacune garde sa zone) : sinon la fréquence casserait. **Exception assumée à
S6** (une seule place change). Le remplaçant ne doit être dans aucune des séances concernées. La **prise serrée** est la troisième
séance de couché de Force (Hypertrophie), jamais une barre liée ; écartée, Larsen, puis la barre elle-même.

**Une zone à ménager prime** (MOTEUR §9.29) : la place qui charge la zone garde son exercice et toutes ses séries, **sans série lourde** :
Lourd devient Mix (Force) ou Hypertrophie (Les deux), la grosse série et ses reculs redeviennent des séries égales. **Une priorité**
ajoute UNE série à une barre prioritaire — ou UN recul à une grosse série : jamais une seconde grosse série.

**Moins d'un an de pratique** : la même semaine, mais **3 × 5, sans zone, sans reculs, sans prise serrée** (la progression linéaire suffit ;
Moesgaard 2022 : la périodisation aide surtout les entraînés) ; **aucune phase**.

**Couche 3 — la phase.** Après la dernière routine écrite, un bloc de **5 semaines, la dernière allégée** (MOTEUR §9.22), sur les barres
lourdes ; **aucune ligne de zone** (`creerBloc` option `sansZones`) : les zones sont celles des routines. Voir MOTEUR §9.22, « Une phase ».
La carte « Passer en cycles » (ci-dessous) ne concerne pas ces programmes : leur dossier est déjà un programme.

**Le temps.** Le raccourci de la durée (MOTEUR §9.18) retire des reculs avant tout (jamais le dernier), ne coupe **jamais** une grosse
série ni une barre Lourd, ni une zone à ménager, ni une priorité.

**L'aperçu.** Sous « {N} séances par semaine. » : « Dans la semaine : squat 2 fois, couché 3 fois, soulevé 1 fois lourd. » ; Force : « Chaque
jour a sa zone : la même barre passe de Lourd à Mix ou à Hypertrophie. » ; Les deux : « Un jour lourd, une grosse série puis des reculs ; un
jour en hypertrophie, des séries égales. » ; à deux séances et une fois chaque barre : « Avec 2 séances, chaque barre passe une fois. » ;
« Une semaine allégée toutes les 5 semaines : mêmes charges, moins de séries. » ; dès qu'une barre passe deux fois : « Fréquence : environ
3 % de force de plus par séance hebdomadaire ajoutée sur un mouvement (Pelland 2026). » Chaque ligne : « zone Lourd (3-5) » dessous,
« 1 × 4 · 3 reculs » à droite ; la ligne « pourquoi » compte les reculs dans le volume. Aucune de ces phrases pour Muscle, Forme, un
débutant, ni une maison sans barre.

**Les deux, 2 et 3 jours** (hors maquette, validés avec les règles : squat et couché 2 fois dès 3 jours, une fois chacun à 2 jours, dit dans l'en-tête ; le squat Lourd et le soulevé Lourd jamais le même jour).

| | Les deux · 2 jours | Les deux · 3 jours |
|---|---|---|
| A | Squat Lourd 1 × 4 · 3 reculs ; tractions 3 × 9 ; militaire 3 × 9 ; leg curl 3 × 12 | Squat Lourd 1 × 4 · 3 reculs ; couché Hyper. 3 × 9 ; tractions 3 × 9 ; élévation latérale 3 × 15 |
| B | Couché Lourd 1 × 4 · 3 reculs ; soulevé Lourd 1 × 4 · 2 reculs ; rowing poulie 3 × 10 ; curl EZ 3 × 12 | Couché Lourd 1 × 4 · 3 reculs ; squat Hyper. 3 × 9 ; roumain Hyper. 3 × 8 ; rowing poulie 3 × 10 |
| C | — | Soulevé Lourd 1 × 4 · 2 reculs ; militaire 3 × 9 ; curl EZ 3 × 12 ; relevé de genoux suspendu 3 × 15 |

**Doutes tranchés.** Les citations (Pelland 2026, Williams 2017, Helms 2018, Zourdos 2016, Moesgaard 2022, Bell 2023) ont été relues le 31/10/2026 ;
les charges ne sont jamais des pourcentages prévus (Helms 2018 : au moins aussi bien que les %), le coach règle chaque jour sur les
séries et le ressenti. Hors de cette PR : 193-2b (les comptes avec historique), 193-4 (la semaine de test toutes les 2 phases), la puissance.

## 5 ter. Le coach relit ta semaine — décidé le 10/10/2026 (66)

> **Pour qui a des routines, le générateur ne réécrit rien : il relit la semaine, dit ce qu'il voit, et propose. La
> personne décide, proposition par proposition.**

Référence `relire66.py` ; cas `cas-66-relire.json` (10 cas, dont Aurélien et Alexis au 10/10/2026). Maquette
`maquette-relire-semaine-v4.html` (l'ordre des barres de la spec prime sur la maquette : Squat, Couché, Soulevé,
Militaire).

### 5 ter.1 Un coach, un fil

**Une seule fonction pure**, `Generateur.relireSemaine(entree)`, sous la garde (`GARDEES`), produit tout ce que l'écran
montre ; l'écran ne calcule rien. Elle **lit** des faits et n'en calcule aucun :
- `volume` : **le fait du coach**, par muscle — `Moteur.placeDeVolume` sur `Semaine.semainesDeVolume` (MOTEUR §14.6),
  le même que la série de plus : `{ muscle: { moyenne, seuil, max, fenetres } | null }` ;
- `barres` : le fait des barres (§5 ter.2), déclaré dans `faits.js` ;
- `routines` : les routines du dossier relu, telles qu'en base ;
- `catalogue`, `profil` (`sexe`, `objectif`, `phase`), `priorites` (`profiles.priorites`), `aujourdhui`.
Les poids d'un muscle sont ceux de `Semaine.musclesPonderes` (1 / ½ / ¼, REGLE-VOLUME §1 bis) ; « polyarticulaire »
est `Moteur.estPolyarticulaire` ; « sortie » est `Modele.estExerciceSortie`. Accepter une priorité écrit
`profiles.priorites`, que le coach de séance lit déjà (§14.6) : aucune seconde règle.

**Invariants de la relecture** (`Generateur.verifierRelecture`, vérifiés sur chaque relecture, en test et par la garde
de développement) : **R1** une proposition de retrait ne fait que retirer, et jamais sous 1 série ; **R2** aucun
retrait hors sèche ; **R3** toute proposition porte un « oui » et un « non » — celles de la semaine comme la priorité de
« Ton historique » ; **R4** pas de repère de ratio hors Force et
Les deux.

### 5 ter.2 Le fait des barres — `faits.barresDuBilan(c, aujourdhui)`

Pour chacune des quatre barres (`squat_barre`, `developpe_couche_barre`, `souleve_de_terre_barre`,
`developpe_militaire_barre`), absente si elle n'a aucune série de travail :
- `record` : `{ charge, date }` — la charge la plus lourde **réellement soulevée** (au moins 1 rep), et le jour où elle
  l'a été : celui que rend **`Modele.recordsDeLExercice(...).lourde`** (à la charge la plus lourde, la série au plus de
  reps), la même que la page de l'exercice et que
  « Ce que je sais » (jamais un estimé) ;
- `recent` : la meilleure série de travail des **28 derniers jours** (la plus lourde, puis le plus de reps, puis la plus
  récente) `{ charge, reps, date }`, ou `null` ;
- **Les 26 dernières semaines** : du lundi d'il y a 25 semaines (le lundi de la semaine d'`aujourdhui`, moins 25
  semaines) à la fin d'`aujourdhui` — 26 semaines du calendrier, jamais 27 (décidé le 10/10/2026 : une fenêtre de
  182 jours en touche 27 sauf un dimanche). `semaines`, `lourdes` et `variantes` la lisent toutes les trois.
- `semaines` : le nombre de semaines (lundi → dimanche, heure locale) **des 26 dernières semaines**, de 0 à 26, qui ont au moins une
  série de travail de la barre ;
- `lourdes` : ses séries de travail de **1 à 6 reps** sur les 26 dernières semaines ;
- `variantes` : les séries de travail, sur les 26 dernières semaines, des **variantes à la barre** — ses frères
  (`Modele.freresDe`, la seule lecture de `mouvement`) dont l'équipement est la barre : même `mouvement`,
  `equipement = 'barre'`, autre exercice (le squat avec pause pour le squat, le spoto pour le couché).
« Série de travail » : `Modele.estTravail`.

### 5 ter.3 Ton historique

- **Une ligne par barre présente**, dans l'ordre Squat, Couché, Soulevé, Militaire : le **record** (or, la médaille) ;
  le détail « {mois} · {série récente} {quand} · {n} semaines sur 26, {k} séries lourdes (+ {v} en variante) » —
  chaque morceau absent se tait (pas de série récente, pas de semaine, pas de série lourde, pas de variante) ;
  « {mois} » est `Modele.moisAnnee` (« avril 2026 »), la série récente `Modele.chargeFois` (« 130 kg × 4 »),
  « {quand} » `Modele.quand` (« aujourd'hui », « lundi » de 1 à 6 jours, sinon « le 14 sept. »). Une **jauge** : le
  record rapporté au plus lourd des records affichés (`Modele.arrondi(x, 2)`).
- **« pas encore dépassé »** suit le mois quand le record a **au moins 12 mois** et que la barre a été travaillée sur
  les 26 dernières semaines (« octobre 2025, pas encore dépassé »). Jamais « stagne », jamais de rouge.
- **La barre en retard — Force et Les deux seulement, sexe connu.** Squat ÷ couché (les deux records, les deux barres
  travaillées sur 26 semaines) **en dessous du repère de « Ton parcours »** — moins de 95 % de **1,21 (homme)** ou
  **1,52 (femme)**, carnets d'entraînement de pratiquants (ECRAN-SAISIE §7 bis.14 ter ; une seule table et une seule
  lecture dans l'app, celles de `parcours.js` ; décidé le 12/10/2026, remplace les moyennes de compétition de van den
  Hoek et al. 2024). La ligne du squat dit « en retard sur ton couché » ; la carte du coach : « Ton squat vaut 1,04
  fois ton couché. Chez les pratiquants, le squat vaut environ 1,21 fois le couché. » (femmes : « 1,52 ») ; en gris :
  « Ces repères viennent de carnets d'entraînement, et ta morphologie peut jouer. Ce qu'on voit chez toi : le couché
  {n} semaines sur 26, le squat {m}. »
  — **les faits côte à côte, jamais « parce que »**. Puis la proposition « **Faire du squat ta priorité ?** » (« Il
  passe en premier dans ses séances. » quand il y a un déplacement) : elle ajoute `squat_barre` à `profiles.priorites`
  et, dans chaque routine où le squat **ou sa variante à la barre** n'est pas le premier exercice qui porte du volume,
  le place en tête (D10 : le prioritaire d'abord). Le squat déjà prioritaire : pas de proposition, et le gris finit par
  « C'est déjà ta priorité. ». **Trois priorités déjà prises** (`Profil.PRIORITES_MAX` ; la base en refuse une
  quatrième, et `Profil.basculerPriorite` rendrait la liste inchangée — un « oui » qui ne ferait rien) : pas de
  proposition, et le gris finit par « Tes trois priorités sont déjà prises : tu peux en changer dans ton profil. »
  (décidé le 10/10/2026, 66B). Aucun autre ratio en V1 (rien de sourcé pour le militaire ; l'excès inverse n'est pas
  un retard).
- **Muscle, Forme ou sans objectif : pas de verdict sur les barres** ; le retard se lit **par muscle** : parmi
  pectoraux, grand dorsal, deltoïdes latéral et postérieur, biceps, triceps, quadriceps, ischio-jambiers, fessiers,
  abdominaux, ceux dont le **plus haut volume** (le `max` du fait du coach) reste **sous 2 séries par semaine** :
  « Ton deltoïde latéral et ton deltoïde postérieur sont presque jamais travaillés : moins de 2 séries par semaine,
  même à ton plus haut. » (accord par `Moteur.motsDesMuscles`). Pas de proposition en V1.

### 5 ter.4 Ta semaine

En tête : le nombre de séances (de routines) et de séries de travail (hors sorties ; `Modele.estTravail` : un type
absent vaut « travail », les chauffes, dégressives et échecs ne comptent pas — la même règle que partout). Puis **ce qui est vérifié** (une
liste grise, seulement ce qui est vrai) et **ce qui ne l'est pas** (des constats, sans rouge) :
- **le lourd en premier** : dans chaque routine qui a une barre (ou une variante à la barre), aucune isolation (non
  polyarticulaire) avant elle — sinon le constat « Dans « {routine} », une isolation passe avant la barre. » ;
- **le tronc à la fin** : les exercices dont le seul principal est abdominaux viennent après tous les autres (les
  sorties ne comptent pas) ; les deux ensemble : « le lourd en premier, le tronc à la fin » ;
- « {n} supersets dans ta semaine » (les groupes de superset, routine par routine) ;
- **par séance** : le plus haut volume d'un muscle dans une routine ; jusqu'à 11 : « au plus 10,8 séries d'un muscle
  par séance » ; au-delà, le constat « Quadriceps : 19 séries dans « Jambes ». Au-delà d'environ 11, une série de plus
  rapporte peu. » (Remmert, Pelland et al. 2025) ;
- « {t} séries de tirage pour {p} de poussée » : séries directes — tirage, un principal grand dorsal ou haut du dos ;
  poussée, pectoraux principal, ou le militaire et ses variantes à la barre.

**En sèche seulement** (N3) : un muscle dont la semaine dépasse **1,3 × son plus haut volume** (le `max` du fait du
coach) reçoit une proposition : « En sèche, tes mollets dépassent ton plus haut volume habituel : 9 séries par semaine
pour 6,4. » — « Retirer 3 séries ? Tes barres ne bougent pas. » Les séries se retirent **une à une**, sur les
**isolations** dont ce muscle est principal et qui ont au moins 2 séries — la plus chargée d'abord (à égalité : la
première routine, puis le premier exercice) —, jusqu'à repasser **sous ou au plus haut volume** ; jamais un
polyarticulaire, jamais sous 1 série. Les muscles se traitent dans l'ordre de la table (`MUSCLES`), chacun sur la
semaine déjà allégée des précédents. Hors sèche : **aucun retrait** (la série de plus fait le reste, §14.7).

Les nombres : `Modele.nombreTexte(x, 1)` (le ratio : 2 décimales) ; 0 et 1 au singulier.

### 5 ter.4 bis L'écran et les gestes — décidé le 10/10/2026 (66B)

> **L'écran ne calcule rien : il assemble l'entrée à partir des faits existants, appelle `relireSemaine`, et rend sa
> sortie. Un « oui » écrit par les chemins qui existent déjà ; un « non » n'écrit rien.**

**Où.** Dans Saisie (la liste des routines), une rangée discrète « Le coach relit ce dossier » sous l'en-tête de
chaque dossier qui a au moins une routine non archivée ; sans dossier (`Routines.parDossier` rend `null`), une seule
rangée « Le coach relit ta semaine », près de « Retrouver mes séances qui reviennent ». Elle ouvre une vue plein écran
(sa route, son retour « ‹ Routines » ou « ‹ Routines · {dossier} »). Un dossier = une semaine : ses routines non
archivées, dans l'ordre de la bibliothèque.

**L'entrée** (assemblée dans `app.js`, aucun fait recalculé autrement) :
- `routines` : celles du dossier, telles que `normaliserRoutine` les tient (`{ id, nom, exercices: [{ exercise_slug,
  groupe_superset, series }] }`) ;
- `volume` : **le même fait que la série de plus** — `Semaine.semainesDeVolume(…, avant)` puis `Moteur.placeDeVolume`
  par muscle. Les deux lignes de `volumeDeLaSeance` deviennent une seule fonction appelée par les deux (`avant` : le
  début de la séance pour la série de plus, maintenant pour l'écran) — câbler, jamais dupliquer ;
- `barres` : `faits.barresDuBilan(corpus, aujourdhui)` ;
- `catalogue` : le catalogue indexé de l'app ; `priorites` : `Profil.prioritesDe(profil)` ;
- `profil` : `{ sexe, objectif: Profil.objectifDe(profil), phase: Profil.phaseDe(profil) }` ;
- `aujourdhui` : le jour civil local.
`verifierRelecture` passe sur chaque relecture par la garde de développement (`Plan.creerGarde`, comme
`verifierProgramme`).

**L'en-tête.** « Le coach relit ta semaine » ; dessous « {s} séance(s) · {n} série(s) » (la sortie : `semaine.seances`,
`semaine.series`), et en sèche « · en sèche depuis {quand} » (`profiles.phase_depuis`, `Modele.quand`), « · en sèche »
sans date. 0 et 1 au singulier.

**Ton historique.** Une ligne par barre de la sortie : le nom, le record en or (la médaille), le détail en gris, la
jauge ; `retard` ajoute « · en retard sur ton couché » au nom, sans couleur d'alerte. Sous les lignes, s'il y en a au
moins deux : « La jauge : chaque record comparé au plus lourd. » Puis, s'il existe, la carte du coach (ambre) : la
phrase, le gris, et la proposition avec ses deux boutons ; ou la phrase des muscles peu travaillés (une carte sans
bouton). Section absente si la sortie n'a ni barre, ni ratio, ni muscle peu travaillé.

**Ta semaine.** Les vérifications (liste grise, ✓), les constats (texte simple, jamais de rouge), puis chaque
proposition de retrait : la phrase, la question, les lignes « {exercice} · {routine} : ~~de~~ a », les deux boutons.
Pas de graphique de volume en V1 : la sortie ne porte pas les nombres de l'habitude, et la phrase les dit déjà.

**Les gestes.** Chaque proposition a son « oui » et son « non » (R3), libellés par la sortie.
- **« Non merci »** : rien n'est écrit ; la carte se replie sur « Rien ne change. » pour toute la durée de cette
  ouverture de l'écran (une relecture refaite après un autre geste la garde repliée). Rouvrir l'écran est demander une
  nouvelle relecture : la proposition peut revenir.
- **« Retirer ces séries »** : pour chaque ligne, l'exercice de la routine `routine_id` dont le slug est
  `exercise_slug` et qui a **exactement `de`** séries de travail (le premier, s'il y en a deux) ; on retire ses
  **dernières** séries de travail jusqu'à `a`, les chauffes restent. Si une ligne ne trouve pas son exercice (la routine a
  changé), **rien n'est écrit** et l'écran dit « Ta semaine a changé depuis : je la relis. », puis relit.
- **« En faire ma priorité »** : `squat_barre` ajouté à `profiles.priorites` (`Profil.basculerPriorite`, écrit par
  `poserProfil` comme le reste du profil), puis chaque déplacement : dans la routine `routine_id`, le bloc de l'exercice
  `exercise_slug` (lui seul, ou tout son groupe de superset contigu) passe juste avant le bloc de l'exercice `avant`.
  Un déplacement qui ne trouve pas ses exercices : rien n'est écrit, même message.
- **Les écritures de routine** passent par la file, comme le report de charge (`ROUTINE_EXOS` / `PLAN` avec la liste
  voulue complète) : hors ligne, elles partent au retour du réseau ; la routine en mémoire change tout de suite.
- **Après un « oui »** : l'écran relit (nouvelle entrée, nouvelle sortie) et se redessine ; une ligne grise dit ce qui a
  été fait, en tête de la section du geste : « Séries retirées. » ou « Le squat est ta priorité. ». La relecture fait
  foi : la carte disparaît d'elle-même (le muscle ne dépasse plus ; le squat est déjà prioritaire).

### 5 ter.5 Ce qui vient après (66B, 66C)

**66B** : fait, §5 ter.4 bis. Ce qui était annoncé : l'écran (ouvert depuis Routines, sur le dossier relu), le choix du dossier, l'assemblage de l'entrée, les
gestes (« oui » écrit les séries retirées, la priorité, les déplacements). **66C** : sans routines, le programme déduit
complété (N4) ; à rang égal, l'ordre habituel (N5) ; ses paires de superset seulement, d'autres si le temps manque (N6).
→ Remplacé le 10/10/2026 par **§5 quater** (règles refondées sur la science et la pratique des coachs).

## 5 quater. Le générateur v2 — décidé le 10/10/2026 (66C, 66D)

> **Une règle vient de la science ou de la pratique des coachs, jamais de nos profils. Les séances d'une personne sont
> l'entrée de son programme ; ce qui n'a ni science ni pratique est une convention de l'app, dite telle** (Aurélien,
> 10/10). Sources et force de chaque règle : `FICHE-REGLES-GENERATEUR-V2-2026-10-10.md` (projet).

### 5 quater.1 Le squelette (G1)

Des routines → la relecture (§5 ter), jamais une réécriture. Pas de routine et un historique (le fait du coach a ses
fenêtres, MOTEUR §14.6) → **le programme déduit** (§5) **complété** (5 quater.3). Sans historique → le gabarit (§5 bis).
« Garder ce que je fais » reste le programme déduit tel quel. *(Le branchement de « Construis-le-moi » et l'aperçu :
66D.)*

### 5 quater.2 Les habitudes — `faits.habitudes(c)`

Sur la fenêtre du programme déduit (`fenetreDeLaPersonne` : les 84 jours qui finissent à la dernière séance). Une
séance **compte** si elle a au moins deux exercices mesurés en charge × reps ou en reps avec une série de travail ou
d'échec — **la signature du programme déduit** (`seancesQuiReviennent`), lue au même endroit, jamais recopiée. Les séries
comptées ensuite (taille, reps, séries) : `Modele.estTravail` ; les sorties (cardio) ne comptent jamais.
Médiane : la valeur du milieu, la moyenne des deux du milieu pour un nombre pair, arrondie au plus proche, .5 vers le
haut (comme le programme déduit).
- `seances_par_semaine` : la médiane, sur les semaines (lundi → dimanche, heure locale) qui ont au moins une séance
  comptée, du nombre de séances comptées ;
- `taille_de_seance` : la médiane du nombre de séries de travail par séance comptée ;
- `reps[slug]` : la médiane des reps (plus de 0) des séries de travail de l'exercice, dans les séances comptées ;
- `series[slug]` : la médiane, sur les séances comptées où il a au moins une série de travail, de son nombre de séries
  de travail.
`null` sans séance comptée. Convention (K) : aucune donnée publiée ne définit « habituel ».

### 5 quater.3 Le complément — `Generateur.completer(entree)`

Une fonction pure, sous la garde. Elle **lit** : `deduit` (`faits.programmeDeduit`), `volume` (le fait du coach par
muscle, lu jusqu'à la semaine de la dernière séance comprise), `habitudes`, `fois` (`faits.historiqueDesExercices`), le
catalogue (dont `habilete`, v2_071), `profil.phase`, `priorites`. Référence `gen66c.py`, cas `cas-66c-generateur.json`.
1. **Les séances (G3)** : les routines cochées ; tant qu'il y en a moins que `seances_par_semaine`, la décochée la plus
   récente (`derniere`) est reprise.
2. **La cible (G2)** : pour un muscle qui a son fait, son 3e quartile (`seuil`, K) ; un muscle d'une **zone
   prioritaire**, hors sèche : son plus haut volume (`max`). Le volume de la semaine se compte par
   `Semaine.musclesPonderes` (1 / ½ / ¼, la méthode « fractionnaire » de Pelland et al. 2026).
3. **Combler (G4)** : tant qu'un muscle est à plus d'une série sous sa cible (K) — le plus grand écart d'abord, à
   égalité l'ordre de `MUSCLES` — d'abord **une série de plus** sur une ligne où il est principal et qui a moins de 5
   séries (K ; la moins chargée, puis la première routine, puis le premier exercice) ; sinon **un exercice** : celui
   qu'il fait le plus (`fois`, puis le slug), où le muscle est principal, absent du programme, avec ses séries
   habituelles bornées à 2-3 (2 s'il ne reste que la place) et ses reps habituelles, dans une séance **du même étage**
   (haut du corps : poitrine, dos sauf le bas du dos, épaules, bras ; bas du corps : jambes et bas du dos ; le tronc
   partout — C), la moins longue puis la première. Un muscle qui ne trouve rien est laissé sous son habitude.
4. **Les bornes de chaque ajout** : aucun muscle au-dessus de son plus haut volume (S + K) ; au plus ~11 séries
   fractionnaires d'un muscle dans une séance (Remmert, Pelland et al. 2025, préprint — s) ; au plus la taille habituelle
   d'une séance + 2 séries (K) ; **jamais une habileté** (`exercises.habilete` — C) ; **jamais une barre lourde** (les
   quatre barres et leurs frères à la barre — C) ; seulement un exercice mesuré en charge × reps ou en reps.
5. **Tirage et poussée (G5)** : tant que les séries directes de tirage sont sous celles de poussée (les définitions de
   la relecture, §5 ter.4), les mêmes gestes pour le grand dorsal, puis le haut du dos, mêmes bornes (C : aucun essai ne
   fixe un ratio).
**Retiré** : le minimum de tronc (aucune preuve ; les barres lourdes le travaillent déjà).

**Sortie** : `{ routines: [{ nom, exercices: [{ exercise_slug, series, reps, chauffes }] }], journal, sous_habitude,
tirage, poussee }` ; le journal dit chaque changement (`reprise`, `serie` avec `de` / `a`, `exercice` avec `series` et
`reps`, et son `motif` : `habitude` ou `tirage`) — l'aperçu de 66D le dira en phrases.
**Invariants** (`Generateur.verifierComplement`) : **V1** rien n'est retiré ; **V2** aucune habileté ajoutée ; **V3**
aucune barre lourde ajoutée ; **V4** aucune séance au-delà de sa taille habituelle + 2 (sauf si elle l'était déjà) ;
**V5** aucun muscle poussé au-dessus de son plus haut volume par un ajout.

### 5 quater.4 L'ordre (G6) — `Generateur.ranger(entree)`

**On ne réordonne pas les séances d'une personne** (5 quater.1 : on part des siennes). Seul un exercice **ajouté** par
le complément (journal `exercice`, dans l'ordre du journal) se range. Son rang : une barre lourde 0, un
polyarticulaire 1 (`Moteur.estPolyarticulaire`), une isolation 2, le tronc 3 (seul principal : les abdominaux) — NSCA,
C ; une sortie (cardio) n'a pas de rang. Il se place **avant le premier exercice, à partir du 2e, de rang strictement
plus grand** que le sien (une sortie à partir du 2e compte comme la fin) ; aucun : à la fin. Le premier exercice de la
séance reste le premier (sa pré-fatigue, son échauffement : son choix). Le gabarit (§5 bis) range déjà ses places
(le prioritaire, puis P, S, I, T) : il ne change pas. Référence `gen66d.py`, cas `cas-66d-generateur.json`.

### 5 quater.4 bis Les supersets (G7) — `Generateur.associer(entree)`

Seulement quand le temps manque : `Moteur.cibleDuProgramme` n'est pas nulle (« C'est mon maximum », « Moins en ce
moment », « Ça varie » ; jamais en « Juste un carnet »). Zhang, Weakley et al. 2025 (méta-analyse, S) : même force,
même masse, séance plus courte. Pour chaque séance, tant que son estimation (`Moteur.dureeEstimee` de la structure
qui sera créée) dépasse la cible : la paire permise qui fait gagner le plus — le premier membre perd son repos,
`séries × (repos − 15 s)` —, à égalité la plus proche, puis la plus haute ; le second membre remonte juste après le
premier ; aucune : la séance reste telle quelle. **Permise** : deux exercices **antagonistes** (tirage et poussée — les
définitions de la relecture, §5 ter.4 —, biceps et triceps, quadriceps et ischio-jambiers, au premier principal ;
S : les paires du même muscle font baisser le volume) **de même classe** (deux polyarticulaires ou deux isolations) ;
jamais le premier exercice ni le premier polyarticulaire de la séance (son repos de 180 s) ; jamais une barre lourde
ni une habileté (C) ; ni une sortie ; mesurés en charge × reps ou en reps ; chacun dans une seule paire. Le raccourci
de la durée (MOTEUR §9.18) joue **ensuite**, inchangé : le superset ne retire aucune série, le raccourci en coupe.
**Sortie** : `{ routines (chaque ligne avec `groupe_superset`, 1, 2… par séance, ou `null`), journal: [{ type:
'superset', routine, a, b, gain_s }, { type: 'duree', routine, de_s, a_s }] }`.
**Invariants** (`Generateur.verifierAssociation`) : **V6** aucune ligne changée (exercice, séries, reps) ; **V7** une
paire est de deux exercices contigus, et aucune sans cible ; **V8** jamais une barre lourde ; **V9** toujours deux
antagonistes.

### 5 quater.5 « Construis-le-moi » et l'aperçu (G8)

**Le choix (G1)** : la personne a un historique quand `faits.habitudes` n'est pas nul, que le programme déduit a au
moins une séance et qu'au moins un muscle a son fait du coach (MOTEUR §14.6) → le programme déduit complété ; sinon le
gabarit (§5 bis), titré **« Ton programme de départ : N séances par semaine. »**. « Refaire mon programme » suit le
même choix. Le nombre de séances visé est **celui de l'écran 8b** (la personne décide) ; ses séances cochées ne sont
jamais retirées.

**Le programme** : `completer` → `ranger` → chaque ligne habillée comme une place du gabarit (`motif` = `motifDe`,
`role` d'après le rang : barre lourde P, polyarticulaire S, isolation I, tronc T ; `menage` et `barre_fixe` comme
`ligne()` ; une ligne ménagée garde toutes ses séries, sans série lourde : ses reps au moins celles d'un secondaire ;
la charnière bornée) → les retouches de la personne (« Je n'en veux pas », « Remplacer ») réappliquées → `associer`
→ le raccourci. Ses chauffes habituelles restent (le gabarit : aucune).

**L'aperçu** (maquette v2) : le titre « N séances par semaine. » ; la voix « Ce sont tes séances des 12 dernières
semaines. », puis celle d'aujourd'hui ; **« Ce que j'ai changé · N »**, une ligne par changement, chacune avec
« Retirer » ; les cartes, chaque ajout marqué ◆, chaque paire de superset groupée. Les phrases, des faits, sans
« parce que » (VOIX) :
- reprise : « {séance} revient. » ;
- séries : « {exercice} : {de} → {a} séries dans {séance}. » (les séries de plus d'un même exercice, pour une même
  clé, en une ligne) ;
- exercice : « {exercice} {séries} × {reps} dans {séance}. » ;
- superset : « {A} et {B} en superset dans {séance} : ≈ {gain arrondi} min de moins. ».
Les nombres d'une ligne sont **ceux de la carte**, après le raccourci de la durée (VOIX : un libellé ne contredit
jamais son chiffre ; décidé le 10/10, 66D bis) : un ajout dit ses séries restantes ; une série de plus dit `{de} →
{séries restantes}`. Un changement que le raccourci a entièrement repris (l'ajout retiré, ou plus aucune série au-delà
de `{de}`) ne se dit pas : il n'y a rien à retirer. La clé, le refus et « Remettre » ne changent pas.

**Retirer ne remplace rien** (décidé le 10/10) : la clé du changement est refusée et tout est recalculé. Clés : un
ajout `habitude` → son muscle (rien n'est ajouté pour lui) ; un ajout `tirage` → le tirage (G5 ne joue pas) ; une
reprise → la séance (aucune autre ne vient à sa place) ; une paire → ses deux exercices, dans cette séance (ni l'un ni
l'autre n'entre dans une autre paire). Une clé refusée se montre en une ligne, avec « Remettre » : « {Muscle} : rien
d'ajouté. », « {séance} ne revient pas. », « Tirage : rien d'ajouté. », « {A} et {B} en séries classiques. ». Rien
n'est écrit au profil (ce n'est pas « Je n'en veux pas »). Sans changement : pas de bloc.
`completer` lit `refus: { muscles, reprises, tirage }` et `ecartes` (jamais un écarté ajouté) ; `associer` lit
`refus_paires: [[séance, a, b]]`.

**La création** : chaque ligne garde son `groupe_superset` jusqu'à la routine écrite (`deduiteDuProgramme` →
`Routines.routineDeduite` → `routineDepuisSeance` : le membre non final, repos du superset) ; ses chauffes aussi.
Une paire dont le raccourci a retiré un membre redevient une série classique.

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
| **66A** | « Le coach relit ta semaine », le calcul (§5 ter) : `faits.barresDuBilan`, `Generateur.relireSemaine` et ses invariants R1-R4 — aucun écran | non |
| **66B** | l'écran et les gestes (§5 ter.4 bis) : la rangée dans Saisie, la vue, l'entrée assemblée, « Retirer ces séries », « En faire ma priorité », « Non merci » ; trois priorités prises : pas de proposition | non |
| **66C** | le générateur v2, le complément (§5 quater.1-3) : `faits.habitudes`, `Generateur.completer` et ses invariants V1-V5, la colonne `habilete` lue — aucun écran | `v2_071` (appliquée le 10/10/2026) |
| **66D** | la fin (§5 quater.4-5) : `ranger`, `associer` et V6-V9, les refus de `completer`, « Construis-le-moi » branché sur l'historique, l'aperçu qui dit chaque changement, les supersets jusqu'à la routine écrite | non |

**Ouverture à Alexis : après 60-2b** (le questionnaire complet et branché, hors programme). 60-3 peut suivre.

## 8. Amendements — faits le 07/10/2026 (deltas 60-2a) et le 08/10/2026 (60-2b, MOTEUR §9.16)

- MOTEUR §1.1 (« ne jamais demander, toujours déduire — une seule exception ») : déjà dépassé par le réglage, la phase
  et le lest ; le questionnaire le remplace par « on ne demande que ce que les séries ne savent pas, et ce qui est
  demandé a un lecteur ».
- ECRAN-PROFIL §4 : le questionnaire est l'ordre et la mise en avant des sections du profil.
- MOTEUR §9.16 : le rappel de phase à 6 semaines n'est plus « au chantier du questionnaire ».
