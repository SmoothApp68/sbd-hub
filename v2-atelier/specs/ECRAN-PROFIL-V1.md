# ECRAN-PROFIL-V1 — profil, connexion, onboarding

Arrêté le 15 et 16 septembre 2026. Maquettes validées : `maquette-profil.html`,
`maquette-connexion.html`.

> **Un seul critère gouverne chaque champ : quelque chose le lit, ou le lira au chantier 1.
> Rien n'est demandé « au cas où ».**

---

## 1. Ce qu'on n'importe pas de la v1

La v1 collectait tout — `sbd_profiles.data->'user'` porte une cinquantaine de clés sur les
quatre profils : âge, sexe, taille, poids, objectifs, matériel, fréquence, jours, durée,
blessures, activités secondaires, style de coaching, niveau de vocabulaire, scores
articulaires, TDEE.

> **On ne reprend pas ces réponses.** Le questionnaire v1 a été conçu pour nourrir un coach
> qu'on a rejeté — celui d'Insolvency, MRV, surcharges articulaires et 4 035 kcal. Ses champs
> existent parce que ce modèle en avait besoin, pas parce qu'ils décrivent bien un pratiquant.

Exemple : `jointHealth` stocke genou 14 050, coude 7 607. Ce sont les nombres qui produisaient
les fausses alertes. Personne ne sait ce qu'ils valent.

**La liste v1 sert d'inventaire de ce qui a été jugé utile un jour.** Chaque champ est tranché
sur ses mérites. Les cinq utilisateurs ressaisissent — deux minutes.

**Une trouvaille à garder** : la v1 stockait `level: "avance"` **et** `_realLevel:
"intermediaire"` sans jamais le montrer. Elle avait constaté l'écart. **Ici on l'assume.**

---

## 2. L'écran profil — six blocs

### 2.1 Ce que le moteur lit déjà

| Champ | Colonne | Pourquoi |
|---|---|---|
| Âge (date de naissance) | `profiles.date_naissance` — **vide sur les 5** | entrée du référentiel |
| Sexe | `profiles.sexe` | entrée du référentiel |
| Poids | `body_weight_log`, 116 pesées | référentiel + poids du corps |
| Taille | `profiles.taille_cm` | référentiel |

> **14/10/2026 (prompt 92).** Le poids se saisit aussi depuis le Profil (ligne Poids), par le même chemin que le questionnaire.

**Le pas de progression n'est pas demandé** (sauf « Ma salle », §2.4 quinquies, 15/10/2026 : les barres fixes et les
haltères que la salle a, pour qui veut les déclarer). Mesuré le 16/09 sur l'historique d'aurel_br :
machines 7 kg, barres 5, haltères 4, poulies 2,2. **Il dépend du matériel, pas de la
personne**, et il se lit dans les charges. On ne demande pas ce qu'on peut observer. Quand
l'historique ne donne pas le pas, le moteur applique le repli du MOTEUR §10.2 : barre et Smith
2,5 kg ; haltères +2 kg sous une paire de 20 kg, +4 kg à partir de 20 ; ailleurs, pas de chiffre. Décidé
le 19/09/2026 : le pas le plus fréquent (5 kg à la barre) était trop grand pour les charges
légères, et le plus petit saut est le plus prudent.

### 2.2 Ce que le chantier 1 lira

| Champ | Note |
|---|---|
| ~~Discipline~~ | **Retirée de l'écran le 07/10/2026** (#382) : rien ne la lisait. L'**objectif** du questionnaire la remplace (QUESTIONNAIRE-COACH-V2). La valeur reste en base, lue par personne |
| Matériel | **range les exercices, ne les cache jamais** (#382) : dans le catalogue et dans « Machine prise », ce que le matériel n'a pas passe après ; un exercice déjà fait n'est jamais rétrogradé. Phrase : « Je range les exercices selon ton matériel : ce que tu n'as pas passe après, jamais caché. » |
| Ancienneté | **en fourchette**, pas une date — « depuis quand régulièrement ». On peut s'entraîner depuis cinq ans et rester débutant |
| ~~Niveau déclaré~~ | **Retiré de l'écran le 07/10/2026** (#382) : rien ne le lisait. La valeur reste en base |
| Niveau mesuré | **retiré le 18/09** — voir §2.4 ter. Un percentile de force sur une population de compétiteurs n'est pas transposable ; à rouvrir au chantier 1 |

### 2.3 Progresser ou entretenir — une intention, pas une discipline

> **« Bien-être » n'est pas une discipline.** Quelqu'un qui s'entraîne pour se maintenir fait
> la même musculation — il ne veut simplement pas qu'on le pousse.

Deux crans : **Progresser · Juste un carnet** (« Entretenir » jusqu'au 07/10/2026 ; la valeur en base reste
`entretien`). Avec « Juste un carnet », **le coach se tait entièrement** : ni proposition, ni phrase, ni dégressive,
ni chauffes, ni bandeau de décharge, ni semaine allégée, ni fin de bloc (MOTEUR I13). Phrase du POURQUOI : « Je me
tais : aucune proposition, aucune phrase. Tes séries restent pré-remplies avec ta routine et ta dernière séance. »
Le repos, la structure, les records et le suivi restent.

**Un réglage explicite, dans le profil, et rien d'autre pour l'instant** — les alternatives
sont écartées dans `CADRAGE-V2` §2 terdecies.

**Le réglage de rythme — tranché le 19/09/2026** (MOTEUR §9.8, maquette v2). Sous
l'intention, un bloc « Ton rythme », **visible seulement en Progresser**. Trois choix,
chacun avec sa phrase :

| Choix | Phrase affichée |
|---|---|
| Prudent | « Monte quand toutes tes séries touchent le haut de ta zone, deux séances de suite. » |
| **Normal** (défaut) | « Monte quand tes deux premières séries touchent le haut de ta zone. » |
| Franc | « Dès qu'une série touche le haut de ta zone, la charge monte, et deux crans d'un coup quand tu dépasses nettement. » |

Dessous : « La prochaine consigne en tient compte. » Aucun argument chiffré à l'écran.
En **« Juste un carnet »**, le bloc disparaît, comme les étiquettes de zone et les consignes.
Colonne : `profiles.rythme_progression` (`v2_046`).

**Présentation — tranchée le 19/09/2026** : le même sélecteur à boutons que l'intention, juste
au-dessus (Prudent · Normal · Franc). Sous lui, la phrase du choix affiché, qui change quand on
touche un autre bouton, puis « La prochaine consigne en tient compte. ». La maquette v2 montrait
une liste avec les trois phrases visibles : le sélecteur l'emporte, pour que l'écran garde un seul
langage. Sans valeur en base, le choix affiché est Normal.

### 2.4 Ta semaine — pour le chantier 5

*Renommé le 19/09/2026 : « rythme » désigne désormais le réglage de progression (§2.3). Libellé à l'écran : « Ta semaine ».*

Séances par semaine et durée. **Les jours sont retirés de l'écran le 07/10/2026** (#382 : rien ne les lisait ; la
valeur reste en base). **La durée a un lecteur** : quand l'estimation d'une routine la dépasse, « J'ai peu de temps »
propose de tenir en cette durée (MOTEUR §9.18). Phrase : « Quand ta routine dépasse ce temps, je te propose de la
raccourcir. » Les séances par semaine attendent le générateur de programme.

### 2.4 bis Mes exercices — le vrai manque

**Constaté le 18/09 en regardant ce que fait Hevy** : son profil porte la liste de **tous les
exercices jamais faits**, avec la dernière séance, et un tap ouvre la page de l'exercice.

> **Chez nous, la page d'exercice s'atteint depuis une séance en cours et depuis Progression.
> Donc pour voir l'historique de son couché, il faut démarrer une séance.**

**Une liste dans le profil règle ça, et elle ne coûte rien** : les 237 exercices et leurs
dernières dates sont en base. Tri par dernière utilisation, recherche par nom.


### 2.4 quinquies Ma salle — décidé le 15/10/2026 (prompt 108) — **barres fixes, haltères et « barre chargée » REMPLACÉS le 24/10/2026 (163)**

> **24/10/2026, décision d'Aurélien.** « Ma salle » ne garde que les élastiques (§2.4 sexies) : les sections barres fixes, haltères (par tranches) et la bascule « barre chargée » sont retirées de la feuille. La ligne n'est dans le Profil que si un exercice à l'élastique est dans une routine, l'historique ou la séance en cours ; sa valeur dit « Élastiques » / « mini-bandes ». La phrase de la feuille : « Tes élastiques, du plus fort au plus léger. Rien d'autre à déclarer : le coach lit tes charges dans ton historique. » Ce qui suit est **remplacé**, gardé pour l'historique.


Maquette validée par Aurélien le 15/10/2026 : `v2-atelier/maquettes/maquette-salle-objectif-v1.html`, écran 1
(Profil → Ma salle) et écran 2 (en séance). Le moteur : MOTEUR §10 bis.

**Les décisions, mot pour mot :**

- Seulement pour qui le déclare ; non renseigné, rien ne change (on suppose qu'on peut ajouter des disques).
- Profil → « Ma salle », une fois : barres fixes EZ et droites (poids cochés, ex. 10, 15, 20, 25, 30 kg), haltères (jusqu'à X kg, de Y en Y). Les machines : pas pour l'instant.
- Le coach ne propose jamais une charge que la salle n'a pas, pour les exercices à barre fixe (barre EZ, barre droite légère : utilise la donnée du catalogue qui dit le matériel, et dis laquelle ; une barre olympique chargée de disques n'est pas concernée) et aux haltères : ses propositions sont arrondies aux charges déclarées (même logique que le repli sur les machines du §10.2).
- Quand le programme demande plus que la salle n'a : le coach fait progresser en reps à la charge maximale, puis en séries, et le dit : « 30 kg, la plus lourde de ta salle : on monte en reps. » Jamais une charge introuvable.
- La dégressive à barre fixe : « Prends la barre de 20 kg. » au lieu de « Enlève … de chaque côté ».
- Cas réel d'Aurélien (Basic-Fit) : curl EZ, barres de 10 à 30 kg de 5 en 5 ; au-dessus de 30 impossible.

**L'écran (108).** Une ligne **« Ma salle »** dans « CE QUE JE FAIS », sous « Matériel », avec la phrase « Non
renseigné : le coach suppose qu'on peut ajouter des disques, comme aujourd'hui. » ; sa valeur dit ce qui est déclaré
(« EZ, droite, haltères ») ; non renseignée, « à renseigner », comme toute ligne vide du Profil. Un tap ouvre **une feuille** (le même voile que les autres) :

- **Barres fixes** — « Les barres déjà chargées de ta salle. Le coach ne te proposera que ces charges-là. » ; **Barre EZ**
  (puces 10 à 40 kg, de 5 en 5) et **Barre droite** (10 à 30 kg) : on coche ; « ＋ » ouvre un champ pour un autre poids
  (1 à 100 kg, au demi-kilo), qui devient une puce cochée.
- **Haltères** — « Jusqu'à » **par haltère** (le libellé le dit : « Jusqu'à (par haltère, en kg) ») et « De … en … »
  (1, 2, 2,5 ou 5 kg). Les séries notent la paire (MOTEUR §10.1) : le moteur convertit, l'écran parle comme la salle.
  **Par tranches (16/10/2026, prompt 123, audit du 16/10)** — demande d'Aurélien, mot pour mot : « Ok ma salle, par
  contre pour les petites haltères de 1 à 10 c'est de 1 en 1 ». **Une ligne par tranche** (la mise en page de la ligne
  d'avant, « Jusqu'à (par haltère, en kg) » puis « De … en … ») ; **« + Une tranche »** ajoute une ligne vide, à l'écart
  de la précédente (au plus 3) ; **« Retirer cette tranche »** sous chaque ligne dès qu'il y en a deux. Les tranches se
  rangent par « jusqu'à » à « Valider » ; une tranche sans charge (10 puis 11 de 2 en 2) ne ferme pas la feuille :
  « Haltères : chaque « jusqu'à » entre 1 et 100 kg, plus lourd que le précédent ; un écart de 0,5 à 10 kg, pas plus
  grand que sa tranche. » (une seule tranche : la phrase d'avant).
- **« Pas d'haltères »** (123, le point resté ouvert au 116 : vider le champ ne les efface plus, il fallait un geste
  explicite) — une puce sous « Haltères », allumée quand aucun haltère n'est déclaré ; la toucher retire les haltères du
  brouillon (« Valider » écrit la salle sans haltères) ; taper un « jusqu'à » l'éteint.
- **Valider** écrit la déclaration ; **Annuler** n'écrit rien ; **Effacer** (seulement si une salle est déclarée) écrit
  le vide — non renseignée, rien ne change. Une valeur hors bornes ne ferme pas la feuille : une phrase le dit (les
  bornes doublent la contrainte de la base, §5.7).
- **Un « Jusqu'à » vidé ou illisible n'efface pas les haltères déclarés** (audit du 16/10/2026, prompt 116) : la
  feuille reste ouverte, le plus lourd déclaré revient dans le champ (l'écart choisi est gardé), et une phrase dit
  pourquoi : « « Jusqu'à » vide ou illisible : tes haltères restent à 40 kg. » Le champ est numérique : une faute de
  frappe s'y lit vide, et « Valider » écrivait la salle sans haltères, sans un mot.
  *Ligne par ligne (123)* : avec autant de lignes que de tranches déclarées, chaque « jusqu'à » vide reprend celui de sa
  tranche (une tranche : la phrase ci-dessus ; plusieurs : « « Jusqu'à » vide ou illisible : je remets 10 kg. ») ; une
  tranche ajoutée et laissée vide, ou une ligne vide à côté d'une ligne remplie sans rien de déclaré : la feuille reste
  ouverte, rien n'est repris, « « Jusqu'à » vide ou illisible : remplis-le, ou retire la tranche. » Toutes vides et rien
  de déclaré : pas d'haltères (inchangé).

**En base** : `profiles.ma_salle` (jsonb, migration `v2_088`, `NULL` = non renseignée) :
`{ "barres_ez": [10, 15, 20, 25, 30], "barres_droites": [10, 15, 20, 25, 30], "halteres": { "max": 40, "pas": 2 } }`.
Depuis 123 (`v2_095`), `halteres` est aussi une liste de 1 à 3 tranches : `[{ "jusqua": 10, "pas": 1 }, { "jusqua": 40,
"pas": 2 }]`. Une tranche unique s'écrit toujours `{ max, pas }` (lue par toutes les apps, acceptée avant `v2_095`) ;
deux ou trois, la liste. Avant `v2_095`, la liste est refusée : la salle d'avant est gardée et le Profil le dit (MOTEUR
§10 bis, « Ce que le code en a fait (123) »).
Une colonne plutôt que quatre : une seule écriture par « Valider », une seule colonne facultative tant que la migration
n'est pas lancée (le profil se lit et s'écrit sans elle, le mécanisme du prompt 104), et une forme imbriquée (deux
listes et une plage) qu'une contrainte valide entière.


**Une barre qu'on charge (24/10/2026, décision d'Aurélien, prompt 159, maquette `maquette-barre-ez-chargee-v1.html`).** Sous les puces de chaque barre, une bascule : « J'ai aussi une barre EZ qu'on charge avec des disques » (et « … une barre droite … »). Décochée par défaut ; elle s'écrit `barre_ez_chargee` / `barre_droite_chargee` (`true` seulement, `false` ne s'écrit pas). Cochée, les charges de cette barre continuent au-delà de la plus lourde barre fixe par crans de 2,5 kg (MOTEUR §10 bis). Une app d'avant 159 qui réécrit Ma salle perd la clé (pas de parade).
### 2.4 sexies Mes élastiques — décidé le 17/10/2026, précisé le 21/10/2026 (chantier B3, prompt 132)

Dans Ma salle (§2.4 quinquies), **deux listes**, chacune rangée **de la plus forte à la plus légère** en les glissant
(maquette `maquette-elastiques-v2.html`, écran 1) :
- **Grands élastiques** (`ma_salle.elastiques`, v2_099) : `{nom, kg?}` — le kg est **facultatif**, et ne sert qu'à
  rattacher un ancien historique noté en kg (MOTEUR §10 ter) ;
- **Mini-bandes** (`ma_salle.mini_bandes`, v2_102) : `{nom}` seulement — la tension d'une mini-bande n'a pas de chiffre
  fiable.
10 au plus chacune ; un nom de 1 à 30 caractères, sans espace au bord ; deux élastiques d'une même liste n'ont jamais
le même nom.

**« J'ai noté une aide à l'élastique : en kg / par son nom »** (`ma_salle.elastiques_par_nom`) : un choix, comme RPE
ou reps restantes, réglable à tout moment. Il ne vaut **que pour l'élastique qui aide** (tractions, dips, muscle-up,
nordique). Un élastique qui fait **résistance** se note **toujours** par son nom ; une machine d'aide, toujours en kg.

Sans élastique déclaré, rien ne change : l'aide se tape en kg, et un exercice en résistance se note en reps seules.

### 2.4 quater Importer depuis Hevy — décidé le 11/10/2026 (chantier 69)

> **Chacun apporte ses séances Hevy lui-même** : en collant le texte que Hevy partage (une séance ou plusieurs à la
> suite), ou en donnant l'export CSV (tout l'historique). Le déroulé est celui du v1 — coller, voir un aperçu,
> importer. Deux choses changent : **une séance déjà là n'est jamais remplacée**, et **un nom inconnu n'est jamais
> deviné**.

**L'entrée.** Profil, section **« MES DONNÉES »** (juste après « MES EXERCICES »), une ligne **« Importer depuis
Hevy »**. L'écran offre deux choix : « Coller des séances » (un champ, « Lire le texte ») et « Choisir le fichier de
Hevy » (un `.csv`). Les deux mènent au **même aperçu**. L'aperçu lit les noms d'exercices en base : il demande une
connexion (« L'import demande une connexion. »).

**Le texte partagé** (forme relevée le 11/10 sur 5 séances réelles ; c'est celle que lisait le v1) :

```
Pecs - Dos
Le mardi, sept. 22, 2026 à 5:12pm

Développé Couché (Barre)
Série 1: 20 kg x 15 [Échauffement]
Série 8: 130 kg x 4
Tractions
"Max de séries à 7 rep"
Série 1: 7 répétitions
…
@hevyapp
https://hevy.com/workout/4Xt0ZOlgoUw
```

- une séance = un titre, une ligne de date (`Le <jour>, <mois abrégé> <jour>, <année> à <h>:<mm><am|pm>`), des
  exercices, puis `@hevyapp` et le lien `hevy.com/workout/<id>` ; plusieurs séances se suivent ;
- la ligne **entre guillemets** juste sous un nom d'exercice est sa **note** ;
- une série : `<charge> kg x <reps>` · `<reps> répétitions` · une durée (`30s`, `5min 0s`, `5h 25min 5s`) ·
  `<distance> km - <durée>` ; `@ <n> rpe` ; `lbs` se convertit (× 0,45359237, au dixième) ;
- **un signe devant la charge se lit tel qu'il est écrit** (16/10/2026, audit du 16/10, 03 #4) : `+10 kg x 8` (un
  lest) vaut 10 kg, `-20 kg x 8` (une aide) vaut −20 kg — l'aide est rangée en négatif (MOTEUR §9.17). Il n'est
  jamais deviné d'après l'exercice. Aucun partage réel avec un signe n'a encore été relevé (le cas du chantier 69
  n'en contient pas) : la forme est à confirmer sur un vrai partage lesté et un vrai partage assisté ; avant, un seul
  signe faisait refuser tout le texte ;
- **`[Échauffement]` → échauffement ; `[Abandon]` → dégressive** (relevé : 5 fois sur 5, une série plus légère juste
  après la dernière ; l'import du 19 au 25/09 les a rangées ainsi) ; `[Échec]` → échec ; un autre crochet → travail.

**Le CSV** : `title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index,
set_type, weight_kg, reps, distance_km, duration_seconds, rpe` ; dates « 16 juin 2026, 10:24 » (mois abrégés en
français) ; `set_type` normal → travail, warmup → échauffement, dropset → dégressive, failure → échec ; `description`
→ la note de la séance ; `exercise_notes` → la note de l'exercice ; `superset_id` → `groupe_superset`, **un superset
d'un seul exercice n'en est pas un** (ECRAN-SAISIE §5.9) ; une distance ou une durée à 0 est vide.

**Un Hevy réglé en anglais** (16/10/2026, audit du 16/10, 03 #12). L'export CSV ne change de langue que par ses
dates : elles se lisent aussi en anglais — « 16 Jun 2026, 10:24 » (la forme relevée par l'audit) et « Oct 2, 2026,
5:54 PM ». Aucun export anglais réel n'est encore au dépôt : une autre forme reste illisible. Le **texte partagé** en
anglais n'est pas lu (ses mots de série — échauffement, dégressive — n'ont jamais été relevés, et les deviner
rangerait une chauffe en série de travail). Dans les deux cas, une date illisible qui porte un mot anglais ne dit plus
« pas un export » mais « Export en anglais : change la langue de Hevy en français et réexporte. » (CSV) ou « Texte en
anglais : change la langue de Hevy en français et copie-le de nouveau. » (texte).

**Une séance de plus de 5 h — 23/10/2026, décision d'Aurélien (prompt 147).** Une séance du fichier qui dure plus de
5 h (`fin_local − debut_local`, strict) et contient au moins un exercice qui n'est pas une sortie est signalée sur sa
ligne de l'aperçu : « Dure 9 h 42 ». Deux choix, par séance : **« Sans heure de fin »** (par défaut : la séance et ses
séries entrent, `fin` vide ; rien n'est deviné, elle ne compte pas dans les heures, records, volume et paris ne
changent pas) ou **« Garder 9 h 42 »** (elle entre telle quelle). Une séance de sorties seules (une rando de 7 h) :
aucun signal. Un nom pas encore rattaché compte comme un exercice de musculation. `sessions.fin` est nullable (aucune
contrainte) ; les lecteurs (faits, récap, détail, moteur) lisent une fin absente sans planter. La règle « un import ne
remplace jamais une séance » ne change pas.

**L'heure.** Hevy écrit l'heure **locale, sans fuseau**. Elle se lit dans le fuseau du téléphone et part en base en
heure universelle. *(L'import CSV d'août l'avait écrite telle quelle : 1 221 séances décalées de 1 à 2 h, corrigées
par `v2_075` le 11/10, records compris.)*

**La référence d'import** : `sessions.source = 'hevy'` ; `source_ref` = `hevy:<id du lien>` pour le texte,
`hevy:<début local AAAA-MM-JJTHH:MM:SS>` pour le CSV (la forme de l'import d'août).

**Les noms.** Un nom se cherche, sans accents ni casse, dans le catalogue (`exercises.nom`), puis dans **les rattachements de la personne** (`alias_exercice`, `v2_076`), puis dans les noms communs
(`exercise_alias`) *(ordre décidé le 22/10/2026, audit du 16/10, 03 #13 : un rattachement fait par la personne passe
avant un nom commun ajouté plus tard — « Je m'en souviendrai » est une promesse, et une décision de l'utilisateur ne
s'efface jamais en silence)*. Introuvable : il
est **« à rattacher »** — la personne choisit l'exercice dans le catalogue (avec ses filtres, §7 quindecies.10 de
ECRAN-SAISIE), la recherche pré-remplie ; le choix s'écrit dans `alias_exercice` et vaut pour les imports suivants
(« Je m'en souviendrai pour tes prochains imports. »). Ou **« Ne pas importer cet exercice »** : ses séries ne
partent pas, et ce choix-là n'est pas retenu. « Importer » attend que chaque nom soit rattaché ou laissé de côté.

**L'anti-doublon** — chaque séance lue reçoit un verdict, contre **toutes** les séances de la personne :

| Verdict | Quand | Dans l'aperçu |
|---|---|---|
| **déjà là** | même `source_ref`, **ou** même minute de début, quelle que soit l'origine | grisée, « Déjà dans l'app — laissée telle quelle », jamais écrite |
| **sans doute la même** | elle **chevauche** une séance de la personne — chacune commence avant que l'autre finisse ; fin inconnue, d'un côté ou de l'autre : 3 h au plus, MOTEUR §12.2 bis — **et** partage au moins un exercice avec elle (corrigé le 12/10/2026, chantier 81 : « commence pendant » laissait passer la séance démarrée dans Hevy avant l'app — 4 doublons sur l'export d'aurel_br, jusqu'à 50 min d'avance) | **décochée**, « Une séance de l'app commence à 17 h 40 ce jour-là : sans doute la même. » ; cochable |
| **nouvelle** | sinon | cochée |

Deux activités qui se suivent (un run de 8 h à 10 h, un autre à 12 h ; deux séances enchaînées) ne se chevauchent
pas : elles sont importées. Une séance existante n'est **jamais** modifiée ni remplacée.

*Une séance importée puis supprimée revient si on la réimporte (tranché le 22/10/2026, audit du 16/10, 03 #16 : **tel
quel, noté**). Sans trace de la suppression, rien ne distingue « supprimée » de « jamais importée » ; réimporter est un
geste explicite, et l'aperçu montre chaque séance avant « Importer ».*

**Le verdict se refait à chaque rattachement** (16/10/2026, audit du 16/10, 03 #2). Un nom pas encore rattaché n'a
pas d'exercice : la séance faite dans l'app et dans Hevy ne partageait donc rien avec celle de l'app, restait
« nouvelle », cochée, et partait en double une fois le nom rattaché. Après chaque rattachement, chaque ligne de
l'aperçu reprend ses exercices et son verdict ; un verdict qui change prend la case de son nouveau verdict (« sans
doute la même » : décochée), un verdict inchangé garde la case telle que la personne l'a laissée.

**L'aperçu** : « N séances trouvées », la période, une ligne par séance (titre, jour et heure, « 7 exercices · 24
séries » ou le verdict), puis « K exercices à rattacher ». **Rien n'est écrit avant « Importer N séances ».**

**L'écriture** passe par la file d'envoi, comme une séance terminée, jamais par un autre chemin :
- la séance : `statut 'terminee'`, `visibilite` par défaut, `titre`, `note` (la description), `debut`, `fin` (CSV) ;
- ses séries : `source 'hevy'`, `validee_a` vide, `rang` dans l'ordre de lecture, la note de l'exercice sur chacune
  de ses séries ;
- **les identifiants sont tirés du nom** (`import|<personne>|<source_ref>`, et `…|<rang>` pour une série) : un envoi
  rejoué, une importation recommencée ou faite depuis un autre téléphone écrivent la même ligne ;
- **la base est lue avant d'écrire** (16/10/2026, audit du 16/10, 03 #3) : l'aperçu ne voit que le cache de
  l'appareil, et un cache incomplet laissait réécrire — séance et séries — une séance déjà importée ailleurs, puis
  corrigée. Avant chaque paquet, les séances déjà en base (même identifiant tiré du nom, ou même `source_ref`) sont
  « déjà là » et ne sont **jamais** réécrites ; sans réponse de la base, rien ne part (comme hors réseau) ;
- **les records** : une séance importée **plus récente que la dernière séance déjà là** de la personne inscrit ses
  records au journal (comme une séance terminée), dans l'ordre des dates. **Plus ancienne, aucun** : le journal ne se
  réécrit pas, et un record inscrit après coup dans le passé serait faux pour tout ce qui a suivi ;
- **aucun pari du coach** n'est écrit pour une séance importée.

**Après** : « N séances importées. » puis, s'il y a lieu, « K étaient déjà dans l'app, J laissées de côté. » et
« Elles comptent dès maintenant pour ton coach et ta progression. » Un long historique avance par paquets
(« 312 séances sur 601 ») ; interrompu, il reprend : une séance écrite est reconnue.

**Écarté** : l'API de Hevy (ne donne que les séances d'un compte Hevy Pro ; noté pour après la passe sécurité) ;
deviner un nom « au plus près » (le v1 le faisait : une erreur fausserait les charges que le coach prescrit, sans
que rien ne le montre) ; remplacer une séance du même jour et du même titre (le v1 le faisait) ; les pesées de Hevy
(un autre fichier, plus tard).

### 2.4 ter Le niveau MESURÉ — retiré du profil le 18/09/2026

**Piste explorée puis abandonnée.** Hevy affiche un « Strength Level » qui compare la meilleure
performance aux autres pratiquants du même âge, poids et sexe. Nous avions les données pour
faire mieux — `standards_opl.json`.

> **Le fichier lui-même l'interdit, en majuscules :**
>
> *« Ces percentiles ne doivent JAMAIS s'afficher dans une carte de diagnostic, ni sans nommer
> la population. Pour le diagnostic, utiliser `ratios_opl.json`. »*

**Et la vérification qui l'accompagne est décisive** : restreindre aux **premières
compétitions** ne baisse la médiane que de **5 %**. Il n'existe aucune tranche « douce » de ce
jeu de données — 383 216 compétiteurs, population auto-sélectionnée.

Donc « ton squat te place au 45ᵉ sur 100 » serait **vrai d'une population qui n'est pas la
sienne**. C'est exactement ce que `CADRAGE-V2` interdit : *toute donnée issue de compétiteurs
n'est utilisable que si la grandeur mesurée est indépendante du niveau — les ratios le sont, la
force absolue non.*

**Ce qui reste utilisable, ce sont les ratios.** `ratios_opl.json` l'explique : les percentiles
de ratio résistent au biais parce que numérateur et dénominateur se déplacent ensemble.

> Exemple vrai et solide : un ratio squat/couché de 1,04 place **sous le 2ᵉ percentile** — et
> ça dit quelque chose de réel, un couché décorrélé vers le haut.
> *(Dépassé le 12/10/2026 : l'app ne range plus personne parmi des compétiteurs. Le même 1,04 se lit contre le
> repère des pratiquants, 1,21 — « Ton parcours », ECRAN-SAISIE §7 bis.14 ter.)*

**Un second argument, de l'utilisateur** : un niveau tiré d'un seul mouvement est arbitraire.
*« Je sais que mon bench n'est pas intermédiaire. »* Un pratiquant peut être avancé sur un
mouvement et intermédiaire sur un autre.

> **Le niveau mesuré ne peut donc pas être un percentile de force.** Il devrait se fonder sur
> autre chose — la progression observée, la régularité, l'ancienneté réelle. Ou ne pas exister.

**C'est une question de moteur. Retiré du profil en attendant le chantier 1.** Seul le niveau
**déclaré** reste.

---

### 2.5 L'app

Bio, e-mail de connexion. **Quitter**, qui n'existe nulle part. *(Les **unités**, que rien ne lisait, sont retirées
de l'écran le 07/10/2026, #382 ; la valeur reste en base.)*

**Supprimer mon compte** — obligatoire, discret sous Quitter. La fonction
`delete_user_complete_data` existe en base depuis la v1.

### 2.6 Écarté, avec les raisons

| Champ | Pourquoi |
|---|---|
| Scores articulaires | les nombres des fausses alertes v1 |
| Objectifs de barres | « la destination se calcule » — un objectif saisi serait une seconde destination. **Sa place est la gamification** : un défi personnel, pas une donnée de coaching |
| Blessures | le moteur ne sait pas quoi en faire. **Abandonné le 15/09** |
| Cardio, activités secondaires, TDEE | chantiers bloqués ou reportés |
| Style de coaching, niveau de vocabulaire | décrivent un ton qu'on n'a pas |
| Records de départ | trois ans d'historique les rendent absurdes |
| **Mesures corporelles et photos** | **chantier à part, pas un bloc du profil.** Hevy propose 14 circonférences et une photo par jour, et c'est un vrai usage pour une recomposition. Mais **des photos de soi sont une donnée sensible** : stockage, chiffrement, et la règle qu'elles ne sortent jamais. Ça mérite sa propre conception |
| Rapport mensuel, visuels partageables | Hevy les a ; chez nous c'est la gamification et le social |

*Exception, à l'essai (16/10/2026) : un objectif posé par la personne sur un exercice, avec sa date pariée — sur la page de l'exercice, pas dans le profil (MOTEUR §9.25).*

### 2.7 En base, invisible

Code ami, six réglages de visibilité, gamification (titre, ornement, palier, XP). **Tous en
base, aucun exposé** — c'est du social. Le code ami est **gardé** : c'est le moyen privé de
se connecter, et sa conception appartient au chantier social.

---

## 3. Connexion et inscription

### 3.1 Trois champs, et c'est tout

**Pseudo, e-mail, mot de passe.** Rien d'autre à l'inscription.

> **Chaque question posée avant la première séance est un obstacle.**

**Le pseudo** est unique, vérifié à la frappe, et le refus **propose deux alternatives**. Il
sert d'identifiant lisible partout ; l'e-mail reste privé.

**Précisé le 08/10/2026 (60-3b).** La confirmation d'e-mail est activée sur le projet : le lien s'ouvre souvent dans
une autre page, où la mémoire de l'inscription n'existe plus. Le pseudo voyage donc **avec le compte** : l'inscription
le dépose dans les données du compte (`options.data.pseudo` de `signUp`), et la création de la ligne de profil le
reprend de là quand la mémoire de la page ne l'a plus. **Pris entre-temps** : la ligne se crée sans lui, et la ligne
« Pseudo » du Profil dit « Ce pseudo vient d'être pris : choisis-en un autre. » jusqu'à ce qu'un pseudo soit posé.

**Précisé le 08/10/2026 (60-5).** Depuis le Profil aussi, **un pseudo pris ne se pose pas** : la feuille le vérifie
avant de se fermer ; pris, elle reste ouverte avec le refus et ses deux alternatives, et rien n'est écrit. Sans réponse
(hors ligne, §5.2 : « on ne sait pas »), la feuille se ferme et l'envoi part. **Si la base le refuse quand même**
(pris entre la vérification et l'envoi) : le refus est **définitif pour le pseudo seul** — il quitte l'envoi en
attente, la ligne « Pseudo » dit « Ce pseudo vient d'être pris : choisis-en un autre. », et **tous les autres champs
du profil partent** (une réponse du questionnaire n'attend jamais un pseudo).

### 3.2 Hors ligne

Une session déjà ouverte survit sans réseau — **l'app ne redemande jamais le mot de passe en
salle**. Règle du chantier 22 : le démarrage ne doit rien attendre du réseau.

### 3.3 Écarté

**Google, Apple, magic link** — cinq utilisateurs connus, tous avec un mot de passe. Une
dépendance pour zéro besoin. À rouvrir si l'app s'ouvre au public.

**Confirmation d'e-mail bloquante** — elle existe en base mais ne doit pas empêcher la
première séance. À confirmer plus tard, depuis le profil.

### 3.4 La phrase d'accueil

« Le carnet qui ne raconte pas d'histoires » — le positionnement révisé (`CADRAGE-V2`
§2 decies). À changer si mieux.

### 3.5 Sur iPhone : installer, et les retours de lien — décidé le 22/10/2026 (prompt 138)

> Sur Android, Chrome propose lui-même l'installation : l'app n'en dit rien. Sur iPhone, Safari ne propose rien, et
> il **efface les données d'un site non installé qu'on n'ouvre pas pendant 7 jours** (audit iPhone I-03, I-12). Un
> lien d'e-mail n'ouvre jamais l'app installée : il ouvre Safari, dont le stockage est séparé (I-05). L'app le dit,
> avec le composant de ses bandeaux (le bandeau de reprise). Maquette : `maquette-iphone-installation-v1.html`.

**Quand.** Seulement sur un appareil Apple tactile (iPhone, iPad — un iPad récent se présente comme un Mac : il se
reconnaît à l'écran tactile), dans un navigateur, **hors de l'app installée** (ni `navigator.standalone`, ni
`display-mode: standalone`). Jamais sur Android, jamais dans l'app installée. Une seule fonction pure le décide.

| Écran | Quand | Ce qu'il dit | Revient ? |
|---|---|---|---|
| Encart de la connexion | non connectée | « Sur iPhone, installe TrainHub d'abord. » / « Puis ouvre-le depuis ton écran d'accueil et connecte-toi là. » ; **Comment faire** | tant qu'on n'est pas connectée ; pas de « Plus tard » |
| Feuille « Comment faire » | à la demande | « Installer TrainHub sur ton iPhone » ; 1. Touche le bouton Partager, en bas de Safari. 2. Fais défiler et touche « Sur l'écran d'accueil ». 3. Touche « Ajouter », puis ouvre TrainHub depuis son icône et connecte-toi. ; « Dans Safari, l'iPhone efface les données d'un site qu'on n'ouvre pas pendant 7 jours. Installé, TrainHub garde tes séances. » ; **Fermer** | — |
| Bandeau de Saisie | connectée, hors séance | « Tu utilises TrainHub dans Safari. » / « Installé, il garde tes séances : Safari efface un site qu'on n'ouvre pas pendant 7 jours. » ; **Plus tard** · **Comment faire** | « Plus tard » le cache **7 jours**, sur cet appareil |
| Retour du lien de confirmation | après un lien réussi qui n'est pas une récupération | « C'est fait : ton adresse est confirmée. » / « Ouvre TrainHub depuis ton écran d'accueil et connecte-toi là. Pas encore installé ? Fais-le d'abord. » ; **Continuer ici** · **Comment installer** | une fois par lien |
| Après le nouveau mot de passe (récupération) | le mot de passe changé par un lien | « Ton mot de passe est changé. » / « Ouvre TrainHub depuis ton écran d'accueil et connecte-toi avec le nouveau. » ; **Compris** | une fois |
| Ligne du Profil, « L'app » | toujours, dans ces conditions | « Installer sur l'écran d'accueil » → la feuille | toujours |

**Le retour de lien ne fait plus entrer en silence.** Sur iPhone hors de l'app, un lien de confirmation réussi
s'arrête sur son écran : l'entrée attend « Continuer ici » (la personne décide ; l'app ne la déconnecte jamais de
Safari). La récupération ne change pas : la feuille du mot de passe s'ouvre comme au §5.6, et la phrase vient après.
Partout ailleurs (Android, ordinateur, app installée), rien ne change.

**Le risque connu demeure** : deux copies connectées (Safari et l'app). Une séance démarrée dans l'une refermerait
celle de l'autre au premier envoi ; la règle des 45 minutes (ECRAN-SAISIE §7 duovicies.1 ter) protège une séance
vivante.

**Hors de ce chantier** : l'écran verrouillé pendant le repos et le bip en mode silencieux (I-04) se décideront après
les vérifications sur un vrai iPhone ; le repos qui survit au rechargement est le prompt 136 (I-06).

---

## 4. L'onboarding, c'est le profil

> **Pas de formulaire séparé.** Un nouveau compte arrive sur le profil aux champs vides,
> marqués `à renseigner`. **Même écran, même code** — la doctrine du câblage.

**Quand** : dès la première connexion, avant tout le reste. C'est une règle de routage, pas un
écran.

> ⚠️ **Contournable, obligatoirement.** Un bouton « plus tard » envoie vers la saisie. Sinon
> on recrée l'obstacle — et un utilisateur avec 138 séances d'historique n'a aucune raison de
> répondre à cinq questions avant de voir ce qu'il a fait.

**Le moteur travaille avec ce qu'il a.** Sans âge ni poids, il décrit sans comparer ; dès qu'ils
sont là, il compare. Un profil incomplet n'est pas une erreur, c'est un état.

**Reste à concevoir** : l'ordre des champs quand ils sont présentés une première fois, et ce
que l'app dit pour expliquer pourquoi chacun compte. À faire le 16/09.

### 4 bis. Le questionnaire du coach — décidé le 07/10/2026 (chantier 60)

Le « reste à concevoir » ci-dessus est conçu : c'est le **questionnaire du coach** (`QUESTIONNAIRE-COACH-V2`,
maquette `maquette-questionnaire-v4.html`).

> **Le questionnaire est l'ordre et la mise en avant des sections du profil, pas un second profil.** Il écrit par la
> même fonction que le profil, chaque réponse a un lecteur et dit pourquoi on la demande, et tout se change ensuite
> dans Profil.

- **Le déclencheur** est `profiles.questionnaire_fait_le` vide, décidé quand la ligne de profil est connue — plus
  `onboarding_completed` (§5.5, remplacé). Il concerne aussi les comptes existants.
- **Il s'ouvre de lui-même une fois par appareil** ; « Plus tard » le ferme, puis un bandeau discret sur Saisie et une
  ligne en tête de Profil (« Terminer mon questionnaire ») le proposent jusqu'à ce qu'il soit rempli. Jamais bloquant.
- **Rempli** = « Commencer » sur le récapitulatif. Chaque écran validé est écrit au fur et à mesure ; rouvert, il
  repart du début avec les réponses déjà données.
- **Nouveaux champs du profil** (v2_065) : l'objectif et les priorités (« Ton but »), ce que la personne veut faire de
  son temps (avec la durée). Ce que les séries savent n'y figure pas.

- **Leurs phrases, avec leurs lecteurs (08/10/2026, 60-2b)** — Objectif : « Il choisit la zone de ton premier bloc
  de programme : Lourd pour la force, Mix pour le muscle. » ; Priorités : « Un exercice prioritaire est coché d'office
  dans un programme. Un muscle prioritaire peut recevoir une série de plus jusqu'à ton plus haut volume, hors
  sèche. » ; Temps, selon la réponse : « Moins en ce moment » → « Quand ta routine dépasse ta durée visée, je te
  propose de la raccourcir dès son ouverture. » ; « Ça varie » → « Quand ta routine dépasse ta durée visée, je te le
  montre à côté de « J'ai peu de temps ». » ; « C'est mon maximum », « J'ai de la marge » : pas de phrase (le
  programme construit les lit, QUESTIONNAIRE-COACH-V2 §5 bis).
- **Le programme construit (08/10/2026, 60-4)** — trois lignes, dans la section du matériel : « **Zone à ménager** »
  (épaule · dos · genou · coude · hanche · aucune ; phrase : « Ton programme construit la garde sans série lourde.
  Rien ne change en séance. ») ; « **Exercices écartés** » (la liste, « Reprendre » sur chacun ; vide : la ligne ne
  s'affiche pas ; phrase : « Un exercice écarté n'est plus proposé dans tes programmes. Il reste au catalogue, en fin
  de liste. ») ; « **Refaire mon programme** » (« Je te pose deux questions et je te construis un nouveau dossier.
  Le tien reste tel quel. »).

---

## 5. Ce que l'implémentation a précisé — chantier 46 §2, 18/09/2026

> Livré : `v2/js/profil.js` (règles pures), l'écran profil, la liste de tous les
> exercices, l'écran d'entrée à deux modes, la règle de routage de l'onboarding.
> Ce que la conception n'avait pas tranché, et que le code a dû trancher.

### 5.1 Trois constats de base, vérifiés avant d'écrire une ligne

Relevés sur `pg_constraint`, `pg_trigger`, `pg_policies` et `pg_indexes`, pas
supposés.

| Constat | Conséquence |
|---|---|
| **Aucun trigger sur `auth.users`** | Un compte neuf n'a **pas** de ligne `profiles`. L'app la crée elle-même au premier chargement (`profiles_insert` l'autorise : `auth.uid() = id`) |
| **`profiles.username` n'a aucun index unique** — seulement `idx_profiles_username`, non unique | La base **n'empêche pas** deux pseudos identiques. Le §3.1 « le pseudo est unique » n'est pas tenu côté serveur |
| **`profiles_select_own` est `auth.uid() = id`** ; `public_profiles` est en `security_invoker=on` ; `anon` n'a **aucun** GRANT dessus | Le client **ne peut pas** savoir si un pseudo est pris. Un `select … where username = …` rend « zéro ligne » pour un pseudo PRIS |

> **Les deux derniers demandent une migration et une fonction `SECURITY DEFINER`.
> Écriture, migration et RLS : jamais côté Claude Code.** Routé vers Claude.ai —
> le détail est dans la PR du chantier 46.

### 5.2 Le pseudo a TROIS états, pas deux

`THProfil.verdictPseudo(nom, pris, contexte)` où `pris` vaut `true`, `false` ou
**`null` — « on ne sait pas »**.

> **`null` rend `inconnu`, et l'écran SE TAIT.** Annoncer « libre » sur une
> question qui n'a pas de réponse serait affirmer le contraire de la vérité, et
> c'est exactement le genre de chiffre inventé que `CADRAGE-V2` interdit.

Et **« on ne sait pas » ne retient personne** : le bouton « Créer mon compte »
s'allume. Puisque la base ne peut pas répondre aujourd'hui, exiger un « libre »
explicite rendrait l'inscription impossible.

Côté données, `THDonnees.pseudoPris` appelle une fonction `pseudo_libre(nom)`
qui n'existe pas encore : PostgREST répond `PGRST202`, un disjoncteur retient la
réponse pour la session, et la vérification devient vivante **le jour où la
fonction est créée** — sans une ligne de code de plus.

### 5.3 Les deux alternatives viennent de l'E-MAIL

La maquette propose « melodie » et « mel_d » pour « mel ». **Ces deux-là ne se
devinent pas d'un pseudo seul** — « melodie » est une *expansion*. Elles se
dérivent en revanche exactement de l'adresse saisie sur le même écran :

```
mel + melodie.dupont@exemple.fr
  → « melodie »   (première partie de l'adresse)
  → « mel_d »     (ce qui est tapé + initiale de la partie suivante)
```

Ordre des candidats, et sa raison :

1. la **première** partie de l'adresse ;
2. le pseudo tapé + l'initiale de la partie suivante ;
3. l'adresse **entière** (`melodie_dupont`) — **en dernier recours seulement** :
   un pseudo est un identifiant lisible partout, donc un nom de famille exposé à
   tout le monde. On ne le propose pas d'emblée ;
4. repli numéroté (`mel2`, `mel3`) quand l'adresse ne donne rien.

### 5.4 Ce qu'on a le droit d'écrire : une liste BLANCHE

`profiles` porte `is_admin`, `tier` et `tier_awarded_at`, qu'un trigger
`SECURITY DEFINER` (`protect_privileged_profile_columns`) **remet à leur valeur
d'avant** pour un non-admin. Les envoyer ne casserait rien — elles seraient
ignorées en silence — mais **envoyer une colonne qu'on sait refusée est une
écriture qui ment sur son effet**.

`THProfil.CHAMPS_ECRITS` est donc une liste blanche de quinze colonnes. Une liste
noire laisserait passer toute colonne ajoutée plus tard. `friend_code`,
`xp_high_water_mark` et les six réglages de visibilité n'y sont pas : c'est du
social (§2.7).

**Un geste n'envoie que ses colonnes** (audit du 16/10/2026, prompt 116). Le profil ne se relit qu'au démarrage :
renvoyer la ligne entière en cache réécrivait à son ancienne valeur tout réglage fait sur un autre appareil (ou une
prévisualisation de PR) — Ma salle, la phase, les priorités, « questionnaire rempli ». L'`upsert` ne porte donc que les
colonnes du geste ; les gestes qui attendent (hors réseau, ou derrière un envoi en vol) fusionnent leurs colonnes, la
plus récente l'emportant sur une même colonne. La réponse (la ligne entière de la base) apporte en local ce qui a
changé ailleurs.

### 5.5 La règle de routage, précisément

> **Un profil dont `onboarding_completed` est `false` ouvre sur le profil, quelle
> que soit l'URL demandée.** La décision se prend sur ce qu'on a **en local**,
> donc sans attendre le réseau — et un profil *inconnu* (cache vide, premier
> démarrage hors ligne) ne déclenche **rien** : on n'ouvre pas un formulaire sur
> une supposition.

Le drapeau passe à `true` **en QUITTANT l'écran**, pas seulement par « Plus
tard » : sans ça, quelqu'un qui remplit tout puis touche un onglet retrouverait
le bandeau de bienvenue à chaque ouverture. Les sous-vues du profil n'en sortent
pas — la liste d'exercices est encore le profil.

⚠️ **Poser et rendre sont séparés dans le code**, et ce n'est pas du zèle : le
marquage s'écrit depuis `montrer()`, au moment précis où l'on quitte l'écran. S'il
passait par le rendu, il rappellerait `montrer('profil')` et **ramènerait l'écran
qu'on vient de quitter**.

> **Remplacé le 07/10/2026 (chantier 60, §4 bis).** Le routage vers le profil sur `onboarding_completed` est retiré :
> c'est le questionnaire qui s'ouvre, sur `questionnaire_fait_le` vide, quand la ligne de profil est connue (relevé
> 60-0 : un compte neuf n'était routé qu'au second démarrage, la décision se prenant sur le seul cache). Le principe
> reste : on n'ouvre rien sur une supposition. `onboarding_completed` n'est plus lu pour router.

### 5.6 Le mot de passe est une ligne du profil

La maquette d'inscription promet « Tu le changeras depuis ton profil ». La ligne
existe donc, sous « L'app » — et c'est aussi là qu'atterrit un lien
« mot de passe oublié » : la session de récupération est ouverte, il ne reste
qu'à poser le nouveau mot de passe. **Pas d'écran de plus pour une étape qu'un
écran existant sait déjà faire.**

**Précisé le 11/10/2026 (chantier 70).**
- **Un retour de lien se lit avant tout routage.** Quand l'adresse d'ouverture porte un jeton d'authentification (un
  lien de récupération ou de confirmation : `#access_token=…`, ou une erreur `#error=…`), le démarrage laisse le SDK
  le lire **avant** de choisir un écran ou de réécrire l'adresse. Sans jeton, rien ne change : la sonde synchrone
  décide seule, et le démarrage hors ligne reste immédiat (aucun appel réseau attendu).
- **Arrivé par un lien de récupération** (l'événement `PASSWORD_RECOVERY` du SDK), l'app ouvre **d'elle-même** la
  feuille du mot de passe, titrée « Choisis ton nouveau mot de passe ». Validé : « Mot de passe changé. » en gris dans
  le profil. Fermée sans valider : rien de plus, la ligne reste dans le profil.
- **Un lien expiré ou déjà servi** (`#error=…`, `otp_expired`) : l'écran de connexion dit « Ce lien a expiré ou a déjà
  servi. Redemande-en un avec « Mot de passe oublié ? ». »
- **L'inscription** dit toujours la même chose, que l'adresse ait déjà un compte ou non (ne jamais révéler qui est
  inscrit) : « Compte créé si l'adresse est nouvelle : confirme ton e-mail, puis connecte-toi. Si tu as déjà un compte
  avec cette adresse, aucun mail ne part : utilise « Mot de passe oublié ? ». » — suivi du bouton « Mot de passe
  oublié ? ».
- **L'attente du lien est bornée, et elle se voit** (décision d'Aurélien, 11/10/2026). Dès que l'adresse porte un
  retour de lien, un écran « Ouverture du lien… ». Sans réponse du SDK au bout de **5 s** : l'écran de connexion,
  avec « Le lien n'a pas pu être vérifié. Réessaie, ou redemande-en un avec « Mot de passe oublié ? ». », et
  l'adresse nettoyée. La même phrase quand le SDK répond sans session à un lien qui portait un jeton. Si le SDK
  répond **après** le délai, l'app entre d'elle-même — et ouvre la feuille du mot de passe si c'était un lien de
  récupération. Une session déjà enregistrée sur l'appareil n'est jamais quittée pour autant : on entre avec elle.
  *Sur iPhone, hors de l'app installée, un lien de confirmation réussi s'arrête d'abord sur sa phrase, et la
  récupération finit par la sienne (§3.5, 22/10/2026).*

L'e-mail, lui, se **lit** et ne se change pas d'ici : le changer demande une
confirmation sur les deux adresses, et c'est un geste à part entière.

### 5.7 Trois feuilles pour quinze champs

Un choix dans une liste fermée · une saisie libre · une semaine. Une feuille par
champ aurait été quinze fois la même chose (`CADRAGE-V2` §2 undecies). Elles
vivent dans le **même voile** que les feuilles de séance, donc le retour
d'Android les ferme sans qu'on l'écrive.

- **Le choix VALIDE ET FERME** : une liste fermée n'a pas de « Valider » à part,
  le doigt a déjà dit ce qu'il voulait. *(La feuille des jours, un multi-choix, est
  retirée avec les jours le 07/10/2026, #382 : il reste deux feuilles.)*
- **« Effacer » n'est offert que sur une colonne qui accepte `NULL`.** `sexe` et
  `intention` sont `NOT NULL` (`mode_entrainement` et `unites` aussi, sans écran
  depuis le 07/10/2026) : le proposer promettrait une écriture que Postgres
  refuserait en 23502.
- **Un refus ne ferme pas la feuille.** Les bornes de saisie doublent les CHECK
  de la base — un refus serveur arrive en 23514, code que la file classe
  DÉFINITIF. On refuse **avant**, avec une phrase, plutôt qu'après, avec une
  ligne morte.
- **Et si la base refuse quand même** (audit du 16/10/2026, prompt 116) — une borne qui diverge, un CHECK pas
  relevé : la colonne refusée pour de bon quitte l'envoi, le reste part (l'envoi se refait colonne par colonne), la
  ligne locale reprend la valeur de la base, et le Profil le dit une fois, en gris : « Pas enregistré : Bio. La base
  a refusé cette valeur ; celle d'avant est gardée. » Avant, l'envoi repartait à l'identique à chaque départ, et
  tous les gestes suivants restaient bloqués derrière lui, sans un mot.

### 5.8 Écarté pendant l'implémentation

| Piste | Pourquoi non |
|---|---|
| **La molette** (§7 sexdecies) pour les séances/semaine et la durée | Elle est faite pour un repos : un petit nombre de valeurs de 5 en 5. Quatorze séances et huit durées se voient mieux d'un coup, dans une liste — et on sait alors laquelle est la sienne |
| **Un `series`/`reps_visees` de profil**, un « pas de progression » saisi | §2.1 : le pas dépend du matériel, pas de la personne, et il se lit dans les charges. On ne demande pas ce qu'on peut observer |
| **Bloquer l'inscription sur un pseudo non vérifié** | Cf. §5.2 — la base ne peut pas répondre, donc ce serait bloquer tout le monde |
| **Un écran d'onboarding séparé** | §4. C'est une règle de routage, pas un écran. Le v1 avait un ordonnanceur d'entrée de plusieurs centaines de lignes pour tenir un tunnel ; ici il n'y a pas de tunnel. *Le questionnaire du 07/10/2026 (§4 bis) n'en est pas un : il présente les champs du profil dans un ordre, écrit par la même fonction, se quitte à tout moment, et tout se change ensuite dans Profil* |

### 5.9 Le niveau MESURÉ reste retiré

Le prompt du chantier 46 demandait « le niveau mesuré ne se stocke pas — il se
calcule sur les charges réelles et s'affiche à côté du déclaré », et son test 8
était « niveau mesuré affiché, non saisissable ».

**Le §2.4 ter de cette spec, daté du 18/09, le retire** — `standards_opl.json`
interdit d'afficher ses percentiles, restreindre aux premières compétitions ne
baisse la médiane que de 5 %, et un niveau tiré d'un seul mouvement est
arbitraire. La spec est postérieure et fait autorité (`CLAUDE.md` §0). **Seul le
niveau déclaré est implémenté ; le test 8 est vide, et il le dit.**
