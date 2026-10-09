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
3. **Tout se recalcule** depuis l'historique ; rien n'est stocké que l'interrupteur (`profiles.jeu_actif`, PR suivante).
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
  dans la zone, sinon **½ point** si un muscle secondaire y est — **une fois par zone**, la plus forte contribution, jamais
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
| `catalogue` | `{ slug: { charge, mesure, muscles_primaires, muscles_secondaires } }` |
| `journal` | les lignes de `recordsDuJournal(c)` (seul `set_id` est lu) |
| `maximums` | `ceQueJeSais(c, aujourdhui, BARRES_DU_JEU).maximums` |
| `exercicesFaits` | `compterExercices(c).faits` |

Sortie : `{ semaines, muscles, xp, niveau, succes, titres, titre, cadres, cadre, prochains, plusProche }` (forme exacte
dans le fichier de cas).
