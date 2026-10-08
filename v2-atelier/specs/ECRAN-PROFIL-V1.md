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

**Le pas de progression n'est pas demandé.** Mesuré le 16/09 sur l'historique d'aurel_br :
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
  montre à côté de « J'ai peu de temps ». » ; « C'est mon maximum », « J'ai de la marge » : pas de phrase, rien ne
  les lit encore.

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
