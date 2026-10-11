# Le jeu — spec V1

**Date :** 09/10/2026 · **Statut :** décidé par Aurélien les 06, 09 et 10/10 ; maquette `maquette-jeu-v5.html` ; mesures
`JEU-V1-MESURES-2026-10-09.md` (projet) ; référence `tests/unit/fixtures/jeu_ref.py` ; cas `tests/unit/fixtures/cas-jeu-v1.json`.
Remplace, pour la construction, `GAMIFICATION-V3.md` et sa révision du 09/10 (projet), qui restent la trace des choix.

## 1. Principes

1. **Un seul fil, sans boucle.** Les faits (`faits.js`) nourrissent le coach ET le jeu ; **le coach ne lit jamais le jeu**,
   et le jeu ne lit jamais le coach (ni plan, ni consigne, ni pari). Le coach ne parle jamais du jeu.
2. **Le jeu ne calcule pas de nouveau fait.** Il compte ce que les faits disent déjà : les séances, les séries de travail
   (`Modele.estTravail`), les muscles du catalogue et leur zone (`Semaine.zoneDuMuscle`, le regroupement du radar), le
   lundi d'une séance (`Semaine.bornesSemaine`, heure locale de l'appareil), les records du journal
   (`recordsDuJournal`, MOTEUR §9.23), les maximums des barres (`ceQueJeSais`), les exercices faits (`compterExercices`).
3. **Tout se recalcule** depuis l'historique ; rien n'est stocké que l'interrupteur (`profiles.jeu_actif`, v2_068, `NOT NULL DEFAULT true`).
   Les gels aussi : leur règle est une fonction pure des semaines.
4. **Pur** : `etatDuJeu(entree)` ne lit ni l'horloge (le jour est passé : `aujourdhui`), ni le DOM, ni le réseau.
5. **L'XP ne vient que de l'entraînement réel.** Supprimer une séance de test la retire du jeu : c'est une correction.
6. **Pas de rouge, pas de « dernier », pas de phrase sur l'assiduité.** Une série de semaines qui s'arrête ne se dit pas ;
   la meilleure reste.

## 2. La série de semaines et les gels

- **Une semaine active** : au moins une séance terminée dont le début tombe dans la semaine (lundi 00:00 au dimanche 23:59,
  heure locale de l'appareil). Une séance sans série de travail compte aussi.
- On parcourt les semaines de la première semaine active à celle d'`aujourdhui` (ou à la dernière semaine active si elle
  est plus tard), de lundi en lundi **en dates locales** (passage à l'heure d'été ou d'hiver compris). **Ni la semaine
  d'`aujourdhui` ni les suivantes ne sont « manquées »** : active, une semaine compte ; vide, elle attend (une séance
  datée dans le futur par l'horloge d'un appareil ne fait pas manquer les semaines d'avant elle). Une séance sans début
  lisible est ignorée.
- **La série** = le nombre de semaines actives d'affilée. Une semaine manquée **consomme un gel** s'il y en a un (la
  série continue, la semaine gelée ne s'ajoute pas à sa longueur) ; sinon la série retombe à 0.
- **Un gel se gagne** quand la série atteint **12**, puis **38, 64, 90…** semaines actives (12 + 26 k). **Deux au plus**
  en réserve : un gel gagné quand la réserve est pleine est perdu. Les gels ne survivent pas à une série qui retombe
  (la réserve est vide à ce moment-là, par construction).
- Sorties : `actives` (nombre de semaines actives de toute la vie), `serie`, `meilleure` (la plus longue série, gels
  compris), `reserve`, `gelsGagnes`, `gelsUtilises` (les lundis protégés, `AAAA-MM-JJ`), `prochainGel` (semaines actives
  qu'il manque avant le prochain gel ; `null` si la réserve est pleine).

## 3. Les muscles

- **Sept muscles**, dans **l'ordre du jeu** : Poitrine, Dos, Épaules, Bras, Jambes, Tronc, Cardio (clés `poitrine`,
  `dos`, `epaules`, `bras`, `jambes`, `tronc`, `cardio`). Les six premiers sont les six zones de `Semaine.ZONES` (mêmes
  clés, même regroupement des muscles) ; leur **ordre** est celui du jeu, qui n'est ni celui de `ZONES` ni celui du radar.
- **Une série de travail** donne, à **chaque** zone qu'elle touche, **1 point** si un muscle principal de l'exercice est
  dans la zone, sinon **½ point** si un muscle secondaire y est, sinon **¼ point** si un muscle stabilisateur y est (v2_069) — **une fois par zone**, la plus forte contribution, jamais
  additionnées (un squat donne 1 à Jambes, pas 3). Un muscle hors des six zones ne donne rien.
- **Cardio** : un exercice **de sortie** (`Modele.estExerciceSortie` : sans charge, mesuré en temps ou en distance-temps)
  **sans muscle principal** (`!Semaine.porteDuVolume`) donne **1 point par minute** de ses séries de travail
  (`duree_s ÷ 60`), et **rien aux zones**, même par ses muscles secondaires. Le pilates entre ici tant qu'il n'a pas de muscle au catalogue (8 séries en base au 09/10) : il en
  sortira tout seul le jour où il en aura un.
- **Pas de plafond de volume** en V1.
- **Niveau d'un muscle** = ⌊√(points ÷ 3)⌋, plafonné à **50** (7 500 points). **0** sous 3 points (« pas encore »).
  Le niveau n coûte 3 n² points ; `prochain` = points qu'il manque pour le niveau suivant (`null` à 50).

## 4. L'XP et le niveau global

- **XP** = **20** par série médaillée (lignes du journal, **une par série** quel que soit le nombre de types battus :
  on compte les `set_id` distincts) + **165** par semaine active + les **points de succès** (§5).
- **Réserve** = Σ min(points du muscle, 7 500) sur les sept muscles + **0,5 × XP**.
- **Niveau** = ⌊√(réserve ÷ 7,25)⌋, plafonné à **100** (le plafond est 72 500 = 7 × 7 500 + 0,5 × 40 000).
- **Après 100** : **Ω** = ⌊(réserve − 72 500) ÷ 7 250⌋ (Ω0 = juste 100 ; un Ω de plus tous les 7 250 points), sur le
  profil seulement.
- `prochain` = réserve qu'il manque pour le niveau suivant (ou l'Ω suivant après 100).
- Le sens, à dire seulement quand le plafond joue : « 100 = l'investissement d'un pratiquant très assidu sur plusieurs
  années. Tous les muscles à 50, c'est le titre Complet. »

## 5. Les succès

Rareté → points : **commun** 10 · **rare** 25 · **exceptionnel** 50 · **majeur** 100. Chaque succès a un identifiant stable.

| Catégorie | Identifiant | Paliers (rareté) | Ce qui compte |
|---|---|---|---|
| Séances | `seances-N` | 10 c · 50 c · 100 r · 250 r · 500 e · 1 000 m | séances terminées |
| Série de semaines | `serie-N` | 4 c · 12 c · 26 r · 52 e · 104 m | **meilleure** série |
| Records | `records-N` | 10 c · 50 c · 100 r · 250 r · 500 e · 1 000 e · 2 500 m | séries médaillées (§4) |
| Randonnée | `rando-N` | 50 c · 100 r · 250 e · 500 m (km) | Σ `distance_m` des séries de travail de `randonnee` ÷ 1 000 |
| Grande sortie | `rando-sortie-20` | rare | une série de travail de `randonnee` de plus de 20 000 m |
| Découverte | `decouverte-N` | 10 c · 25 c · 50 r · 100 e | exercices faits (`compterExercices().faits`) |
| Muscle | `muscle-<clé>-N` | 10 c · 20 c · 30 r · 40 e · 50 m | niveau du muscle (7 × 5 = 35) |
| Tous les muscles | `tous-N` | 10 c · 20 r · 30 e · 40 e · 50 m | le plus petit des sept niveaux |
| Cap rond | `cap-<slug>-K` | commun, chacun | pour chaque entrée de `maximums`, dans son ordre : charge ≥ K, K = 40, 60, 80… |

**Les barres** des caps ronds sont celles que `faitsDuJeu` demande à `ceQueJeSais`, une seule liste, dans `faits.js`
(`BARRES_DU_JEU`) : `developpe_couche_barre`, `squat_barre`, `souleve_de_terre_barre`, `developpe_militaire_barre`. Le
module du jeu ne la recopie pas : il traite les maximums qu'il reçoit.

**L'ordre de `succes.ids`** : les catégories séances, série, records, randonnée, découverte (chacune en paliers
croissants), puis `rando-sortie-20`, puis les muscles (dans l'ordre de §3, paliers croissants), puis `tous-N`, puis les
caps ronds.

**Plus tard (hors V1)** : force au poids de corps (seuils par sexe à fixer), insolite, secrets, objectifs (Parcours et
Étapes). « Le sans-faute » est retiré (il lisait les paris du coach).

## 6. Titres et cadres

- **Titres** : tous les muscles ≥ 10 **Équilibré** (`equilibre`) · ≥ 20 **Polyvalent** (`polyvalent`) · ≥ 30 **Athlète**
  (`athlete`) · ≥ 40 **Accompli** (`accompli`) · ≥ 50 **Complet** (`complet`) ; **Collectionneur** (`collectionneur`) à
  50 succès. Un titre n'a pas de points (les points sont ceux du succès `tous-N`).
- **Titre affiché** (automatique en V1) : le plus haut des titres de muscles ; à défaut Collectionneur ; sinon aucun.
- **Cadres** : `vitrine` (10 succès) · `niveau` (un succès rare ou plus) · `or` (un succès exceptionnel ou plus) ·
  `grave` (le titre Athlète). **Cadre affiché** : le plus haut, dans l'ordre vitrine < niveau < or < gravé.
- Un titre ou un cadre se recalcule comme le reste : aucun n'est stocké.

## 7. Le plus proche

Pour l'accueil du jeu, `prochains` liste, pour chaque muscle sous 50, son niveau suivant, et pour chaque catégorie de §5
(séances, série, records, randonnée, découverte), son palier suivant : `{ type, cle, cible, reste, fait }` où `fait` est la
part déjà faite **du palier en cours** (de 0 à 1 : pour un muscle, entre le coût du niveau atteint et celui du suivant ;
pour une catégorie, entre le palier précédent — 0 au premier — et le suivant). `plusProche` = l'entrée dont `fait` est le
plus grand ; à égalité, l'ordre de la liste (les muscles d'abord, dans l'ordre de §3, puis les catégories dans l'ordre
ci-dessus). **Pour la série**, le palier suivant est celui au-dessus de la **meilleure** série, mais `reste` et `fait` se
comptent sur la **série en cours** (seule elle peut l'atteindre ; `fait` ne descend pas sous 0). `reste` est toujours en
unités de la catégorie (points, séances, semaines, séries médaillées, km, exercices).

## 8. Ce que le module reçoit et rend

`THJeu.etatDuJeu(entree)` — `entree` est assemblée par `faitsDuJeu(c, aujourdhui)`, sur l'instance des faits
(`THFaits.creer()`) :

| Champ | Contenu |
|---|---|
| `aujourdhui` | une `Date` (le jour de l'ouverture, jamais l'horloge dans le module) |
| `seances` | `[{ id, debut }]`, les séances terminées |
| `series` | `[{ session_id, exercise_slug, type_serie, duree_s, distance_m }]`, **seulement celles des séances de `seances`** (le cache peut porter des séries d'une séance en cours) |
| `catalogue` | `{ slug: { charge, mesure, muscles_primaires, muscles_secondaires, muscles_stabilisateurs } }` (la troisième liste absente vaut vide) |
| `journal` | les lignes de `recordsDuJournal(c)` (seul `set_id` est lu) |
| `maximums` | `ceQueJeSais(c, aujourdhui, BARRES_DU_JEU).maximums` |
| `exercicesFaits` | `compterExercices(c).faits` |

**La séance en cours** (64B, la feuille « Terminer ») : `faitsDuJeu(c, aujourdhui, enCours)`, `enCours = { seance, ligne,
lignes }` (la séance en cours, sa ligne de séance terminée et ses séries **au format des lignes écrites**, par les
convertisseurs qui les écrivent — aucun nouveau). L'entrée est alors celle qu'on aurait si la séance était terminée,
**champ par champ** : `seances` + `{ id, debut }` de la séance ; `series` = celles de `c.series` **hors** cette séance (le
cache peut en porter) + `lignes` ; `journal` = `recordsDuJournal(c)` + `journalDuJour(c, seance)` (les records que la
feuille affiche) ; `maximums` et `exercicesFaits` calculés sur un corpus qui **inclut** la séance (sinon un cap rond ou
une découverte gagnés pendant la séance n'apparaîtraient qu'après « Terminer »). Rien n'est écrit. Sans `enCours`, rien
ne change.

Sortie : `{ semaines, muscles, xp, niveau, succes, titres, titre, cadres, cadre, prochains, plusProche }` (forme exacte
dans le fichier de cas).

## 9. Les écrans (64B, maquette `maquette-jeu-v6.html`)

### 9.1 L'interrupteur

- `profiles.jeu_actif` ; **absent** (cache ancien, profil pas encore lu) = **actif**. Il s'écrit comme les autres champs
  du profil (`champsEcrits`, la file d'envoi) et l'écran suit **tout de suite**, sans attendre le réseau.
- **Éteint** : pas d'onglet Jeu, pas de bloc « Le jeu » à la fin de séance, pas d'hexagone ni de titre ni de vitrine au
  Profil ; une route `/jeu…` s'ouvre comme une route inconnue. Seul reste l'interrupteur. Rien n'est effacé.

### 9.2 L'onglet Jeu

- Un **cinquième onglet**, entre Progression et Profil, icône hexagone, nom « Jeu », route `/jeu`. Trois sous-vues,
  `/jeu/muscles`, `/jeu/succes`, `/jeu/deblocages` : l'onglet Jeu reste allumé, le retour d'Android remonte à `/jeu`.
- **L'accueil**, trois blocs puis trois portes :
  1. **le niveau** : l'hexagone (couleur du niveau global : gris < 25, bleu 25–49, violet 50–74, or ≥ 75), « Niveau N »,
     le titre affiché s'il y en a un, une jauge (part faite du niveau en cours), « niveau N+1 dans R points » (R arrondi
     à l'entier supérieur). À 100 : « Niveau 100 », jauge pleine, sans « prochain » (l'Ω ne se montre qu'au Profil,
     §4). À 0 : hexagone « 0 », « niveau 1 dans R points » ;
  2. **la série** : « S semaines d'affilée », « gels : r sur 2 », « Meilleure série : M semaines ». Série à 0 : seule la
     meilleure se dit (jamais « 0 semaine », jamais « série perdue ») ; aucune semaine active : le bloc n'apparaît pas ;
  3. **le plus proche** : les **trois** entrées de `prochains` dont `fait` est le plus grand (à égalité, l'ordre de la
     liste ; la première est `plusProche`). Muscle : « Tronc, niveau 23 · dans 7 points » (Cardio : « min ») ;
     catégorie : « Séances : 1 000 · dans 387 séances », « Série : 26 semaines · dans 3 semaines », « Records : 2 500 ·
     dans 412 records », « Randonnée : 250 km · dans 93 km », « Découverte : 25 exercices · dans 4 exercices ». Les
     restes s'arrondissent à l'entier supérieur ;
  4. trois lignes qui ouvrent **Muscles** (« 7 »), **Succès** (« N · P points »), **Déblocages** (« cadres, gels »).
- **Muscles** : les sept dans l'ordre du jeu (§3, jamais trié) ; hexagone du niveau (gris < 10, bleu 10–29, violet
  30–49, or 50), jauge, « niveau n+1 dans R points » (« min » pour Cardio ; à 50 : « niveau maximal ») ; une phrase :
  « Une série de travail donne 1 point au muscle qu'elle travaille, ½ à celui qui aide, ¼ à celui qui stabilise. Cardio : 1 point par minute. »
- **Libellés** : un succès se nomme par sa catégorie et son palier (« 1 000 séances », « 104 semaines », « Épaules
  niveau 40 », « Tous les muscles à 30 », « Grande sortie : 20 km ») ; un cap rond par le nom court de l'exercice, comme
  la médaille (« Cap rond : développé couché 140 kg »). **Singulier** quand le nombre vaut 1 (« dans 1 point »,
  « 1 semaine d'affilée », « +1 point »).
- **Succès** : par catégorie de §5, « obtenus / total · prochain : palier » (les caps ronds : le nombre seul ; une
  catégorie complète : sans « prochain ») ; la légende des quatre raretés et leurs points ; les **titres**, obtenus
  (« ✓ ») ou non, avec, pour le premier titre de muscles non obtenu, le muscle le plus bas (« Tronc à 22 ») ; le titre
  affiché marqué « affiché ».
- **Déblocages** : les quatre cadres, obtenus ou non, avec leur condition, et lequel est affiché ; les gels : réserve,
  « prochain gel dans N semaines » ou « réserve pleine », et les semaines protégées (« semaine du 4 août 2025 »).

### 9.3 Le Profil

Trois ajouts, rien d'autre ne bouge : l'**hexagone du niveau** à la place de l'initiale, entouré du **cadre affiché**
(vitrine : liseré acier ; niveau : liseré acier épais ; or : liseré or ; gravé : double liseré or) ; le **titre** avec
le niveau sous le nom (« Polyvalent · niveau 87 » ; après 100 : « niveau 100 · Ωk ») ; la **vitrine** ; et, en bas, le bloc **Le jeu** avec
l'interrupteur « Activer le jeu » et sa phrase.

**La vitrine est automatique** (V1) : les trois succès les plus rares ; à rareté égale, celui qui vient le plus tard
dans `succes.ids`. Moins de trois : ce qu'il y a ; aucun : pas de vitrine. Chaque case : l'hexagone à la couleur de sa
rareté, le libellé, un bord neutre (le cadre est celui de l'hexagone du nom, pas des cases). Phrase : « Tes trois succès
les plus rares. »

### 9.4 La fin de séance

Dans le récap de fin de séance (ECRAN-SAISIE §7 septies.4 bis ; dans la feuille « Terminer » jusqu'au 11/10/2026), après les records et les paris du coach : un bloc **Le jeu**, ce que la séance ajoute — `etatDuJeu` sans elle,
puis avec elle (§8, `enCours`), comparés par `apport(avant, apres)` :
- « XP · +N » si N > 0 ;
- le niveau global, s'il monte (« Niveau 88 · +1 » ; l'Ω ne se montre pas ici) ;
- chaque muscle dont le niveau monte, dans l'ordre du jeu (« Épaules, niveau 43 · +1 ») ;
- chaque succès gagné, dans l'ordre de `succes.ids`, avec sa rareté (« Succès : Épaules niveau 40 · exceptionnel ») ;
- si aucune de ces lignes n'a lieu d'être : « Muscles · +N points » (somme des points gagnés, arrondie à l'entier
  supérieur).

Sans aucune ligne (rien gagné), ou si le calcul échoue : **pas de bloc du tout** — jamais un bloc vide, et jamais une
erreur qui empêche « Terminer » ou « Abandonner ». Le bloc se recalcule quand les séries validées de la séance changent,
pas à la frappe d'un titre ou d'une note.

### 9.5 Ce que le module ajoute

Trois fonctions pures de `jeu.js`, tirées des **mêmes tables** que `etatDuJeu` (aucune recopiée) :
- `descriptionDuSucces(id)` → `{ categorie, cle, palier, rarete, points }` (`cle` : la clé du muscle ou le slug du cap) ;
- `vitrine(etat)` → les identifiants de §9.3, au plus trois ;
- `apport(avant, apres)` → `{ xp, niveau: { de, a } | null, muscles: [{ cle, de, a }], succes: [id], points }`.

### 9.6 La forme

La forge (anthracite, acier, or des records, Barlow). **Aucun ambre dans les écrans du jeu** : l'ambre est la voix du
coach. Seule exception, la barre d'onglets : l'onglet Jeu s'allume comme les autres. Couleurs des raretés : les
variables de la forge `--rarete-1` à `--rarete-3` (commun gris, rare bleu, exceptionnel violet) ; **majeur = l'or des
records** (`--medaille`), jamais une teinte proche de l'ambre. Pas de rouge, pas de « dernier », pas de phrase sur
l'assiduité, pas de « bravo ».
