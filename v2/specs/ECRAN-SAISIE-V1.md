# ÉCRAN DE SAISIE — V1

Spec de l'écran de séance de TrainHub v2. Consigne les décisions des sessions
des 7 et 8 septembre 2026. En cas de contradiction, `CADRAGE-V2.md` prime.

Statut : conception validée sur maquette. Aucune implémentation.

---

## 1. Architecture d'entrée

Bibliothèque de routines enregistrables, **plus** possibilité d'une séance vide
où l'on note exercice par exercice. On entre par où on veut.

**1.1** — Une routine stocke les exercices, l'ordre, le nombre de séries et les
reps visées. **Elle ne stocke pas les charges.** Une charge écrite dans une
routine est périmée dès qu'on progresse, et c'est précisément ce que le moteur
sait calculer.

**1.2** — Le différenciateur face à Hevy n'est pas la routine, c'est la gestion
de l'écart : remplacer, ajouter, sauter, réordonner en un geste, pas un menu
imbriqué.

**Mesure fondatrice** — prédire la séance entière échoue (1 à 42 % de séances
déjà vues à l'identique selon le profil), prédire l'exercice suivant marche
(41 à 67 % du premier coup). L'architecture suit cette asymétrie.

---

## 2. Le bloc comme unité

**2.1** — L'unité de l'écran est le **bloc**, pas l'exercice. Un exercice normal
est un bloc d'un seul. Un superset est un bloc de 2 à 6. Même objet, même carte,
même code. Pas de « mode superset », pas de conversion.

**2.2** — `groupe_superset` existe déjà en base. Rien à migrer.

**Mesure** — le superset n'est pas une pratique générale, c'est celle d'Aurélien
(48,7 % de ses séries, contre 0,6 % chez Jordan). Taille des blocs chez Aurélien :
2 exos 53,7 %, 3 exos 24,2 %, 4 exos 12,2 %, 5 exos 7,5 %, 6 exos 1,3 %. Chez les
autres, 90 à 96 % à deux exercices. **Le layout gère N exercices, pas des paires.**

### Affichage par tours

**2.3** — **Dans un superset**, les séries s'affichent entrelacées : A1, B1, C1,
A2, B2, C2. Le nom de l'exercice n'apparaît qu'une fois, dans une légende A/B/C en
tête de bloc — ce qui règle le problème de largeur sur téléphone.

> ⚠️ **Précisé le 11/09/2026 : l'entrelacement et les lettres ne valent QUE pour
> les supersets.** Un bloc d'un seul exercice numérote ses séries `1, 2, 3`, sans
> lettre — il n'y a rien à alterner. La première maquette avait étendu les lettres
> à tous les blocs ; c'était faux et illisible.

**2.4** — Les étiquettes A1/B1/C1 **ne sont jamais stockées**. Elles se
recalculent à l'affichage. La base ne contient que « cette série appartient à cet
exercice, qui appartient à ce bloc, à cette position ». Même mécanisme que la
dégressive et le rest-pause.

Conséquence : tous les cas de figure tombent d'eux-mêmes — séries inégales entre
exercices, tours incomplets, chauffe avant l'enchaînement. Il n'y a pas de grille
à remplir.

**2.5** — L'échauffement porte la lettre de son exercice et se place juste avant
la première série de travail de cet exercice. La chauffe de C se pose entre B1 et
C1. Les échauffements ne sont **jamais** surlignés.

> ⚠️ **Précisé le 13/09/2026 après essai sur device.** « Jamais surlignés » porte sur
> **l'éclairage du tour**, pas sur la validation. **Un échauffement validé passe au vert
> comme une série normale** : une chauffe faite doit se voir comme faite. La règle a été
> appliquée trop largement au chantier 27, sur les blocs simples comme sur les supersets.

> ⚠️ **CORRIGÉ le 13/09/2026 — dans un superset, les chauffes s'entrelacent aussi.**
>
> « Juste avant la première série de travail de son exercice » a été écrit en pensant à un
> exercice isolé, où cela veut dire « en tête ». Dans un superset, cette règle disperse les
> chauffes et produit, constaté sur device :
>
> ```
> A  A  A1  B  B  B1  C  C1  D1        ← ce que ça donne : faux
> ```
>
> Elle fait quitter une machine puis y revenir — exactement ce qu'un superset cherche à éviter.
>
> **Les chauffes forment leurs propres tours, comme le travail :**
>
> ```
> A  B  C  D          ← tour de chauffe 1, les quatre exercices
> A  B                ← tour de chauffe 2, ceux qui ont deux chauffes
> A1 B1 C1 D1         ← tour de travail 1
> A2 B2 C2 D2         ← tour de travail 2
> ```
>
> C'est le geste réel : un premier passage léger sur toutes les machines, puis un second plus
> lourd sur celles qui en ont besoin.
>
> Même mécanique que les tours de travail à séries inégales — un tour de chauffe ne contient
> que les exercices qui ont une chauffe à ce rang. Rien de nouveau à implémenter.
>
> **Les chauffes n'entrent pas dans le compteur de tours.** Le « 2/3 » compte les tours de
> travail : faire ses quatre chauffes ne met pas à « 1/3 ».
>
> **Hors superset, rien ne change** : la règle d'origine donne déjà le bon résultat.

**2.6** — L'éclairage porte sur le tour entier, pas sur une ligne isolée. Dans un
enchaînement, on ne valide pas A1 avant d'attaquer B1.

**2.7** — Le tour avance automatiquement quand toutes les séries de travail du
tour sont validées, dans n'importe quel ordre. Un tour incomplet (C n'a que deux
séries) n'attend pas un C3 inexistant. **Dévalider ne fait pas reculer le tour** —
asymétrie assumée.

**2.8** — Un tap sur le nom d'un exercice donne son historique et ses stats. C'est
ce qui compense le regroupement par exercice perdu à l'affichage.

---

## 3. Charge suggérée

**3.1** — **La charge suggérée n'est pas une colonne.** Le palier et la cible de
reps s'écrivent une seule fois, dans l'en-tête du bloc, à côté du nom de
l'exercice.

**3.2** — Les séries de rampe et d'échauffement ne reçoivent aucune suggestion.
Elles dépendent du jour, de la fatigue, du matériel disponible. Elles ne se
prédisent pas, et le §7.3 du moteur dit déjà qu'elles ne votent pas pour le
palier. Les suggérer serait inventer.

**3.3** — Un exercice sans palier établi **le dit** (« pas assez de séances ») au
lieu d'afficher un chiffre inventé. Sans alarme.

**3.4** — La colonne « précédent » reste ligne par ligne. Elle est factuelle, et
c'est elle qui porte l'information de rampe : si la dernière fois c'était
100, 110, 120, 120, ça s'affiche en face de chaque ligne. Le moteur n'a rien à
prédire, l'historique le montre.

**Bénéfice de mise en page** — supprimer la colonne suggérée libère 54 px de
largeur, redistribués sur les champs kg et reps. Décisif à 380 px.

### 3 ter — Les quatre mesures, et pourquoi la grille ne peut pas être unique

⚠️ **Défaut trouvé le 11/09/2026, après vérification sur device.** Toute la grille avait été
dessinée pour `charge × reps`. **Le catalogue définit quatre mesures**, et 15 % de l'historique
n'entre pas dans la première.

| `exercises.mesure` | Exercices | Séries de travail | Ce qu'une série enregistre |
|---|---|---|---|
| `charge_reps` | 173 | 22 056 | charge et répétitions |
| `reps` | 45 | **2 300** | répétitions seules — pompes, tractions, dips |
| `temps` | 12 | **1 275** | une durée — planche, gainage |
| `distance_temps` | 7 | 501 | durée et distance — rando, course, natation, tapis |

**4 076 séries de travail ne s'enregistrent pas en charge × reps.** Une planche à
« 0 kg × 45 » est absurde, et c'est ce que la grille unique produisait.

**Les données sont propres** : chaque mesure ne remplit que ses colonnes. Les pompes n'ont
jamais de charge, le tapis roulant jamais de répétitions. Rien à nettoyer, seulement à
afficher.

#### 3 ter.1 Quatre gabarits, tous vérifiés à 360 px

| Mesure | Colonnes | Place restante |
|---|---|---|
| `charge_reps` | № · préc. · **kg** · reps · effort · ✓ | 79 px pour les kg |
| `reps` | № · préc. · **reps** · effort · ✓ | 128 px |
| `temps` | № · préc. · **durée** · ✓ | **173 px** — pas d'effort |
| `distance_temps` | № · préc. · **durée** · **distance** · ✓ | 82 px chacune |

Chaque gabarit est plus confortable que le précédent : une colonne de moins à chaque fois.

**Le type de mesure est rappelé sous le nom de l'exercice**, en petit. Sans ça, une ligne à
deux colonnes au milieu de lignes à trois désoriente.

#### 3 ter.2 L'effort suit la mesure — RIR ou RPE

> **La colonne d'effort n'existe que là où il y a des répétitions** — `charge_reps` et
> `reps`. Sur `temps` et `distance_temps`, **aucune colonne, aucune question**.

**Pourquoi, et c'est une décision, pas un oubli.** La piste d'un RPE sur les exercices
chronométrés a été explorée et **écartée** : elle produisait deux notations différentes dans
la même colonne, sur deux lignes voisines de la même séance — `−1` sur un développé, `9` sur
une planche. Illisible.

Et transposer la question ne marchait pas davantage : sur un gainage on s'arrête souvent parce
qu'on a décidé de s'arrêter, pas parce qu'on ne tient plus. La proximité de l'échec y a moins
de sens qu'ailleurs.

> **On ne demande pas une donnée qu'on ne sait pas formuler correctement.** À rouvrir si
> l'usage montre que ça manque — avec une vraie question, pas une transposition.

**L'affichage suit ce que l'utilisateur saisit.** RPE saisi → RPE affiché. Ressenti saisi →
ressenti affiché. Si les deux coexistent, chacun dans sa forme. Aucune traduction, aucune
règle de plus : **on montre ce qui est stocké.**

**Conséquence sur le moteur :** il ne recevra jamais d'effort sur `temps` et
`distance_temps`. Sans gêne — la double progression sur une durée regarde les secondes, pas
la proximité de l'échec.

#### 3 ter.2 bis La saisie d'une durée — par décalage

**Le problème, mesuré sur les vraies séries :** l'unité utile varie d'un facteur mille selon
l'exercice.

| Exercice | Durées réelles |
|---|---|
| L-Sit Hold | 5 à 10 s |
| Planche | 10 s à 2 min |
| Escaliers | 30 s à 8 min |
| Pilates | 15 min à 1 h |
| **Escalade** | **1 h 30 à 2 h** |
| Randonnée | jusqu'à **6 h 35** |

Un champ unique en secondes ferait taper `7200` pour deux heures d'escalade et `10` pour un
L-sit. Un choix d'unité ferait basculer à chaque exercice.

> **Saisie par décalage, comme un pavé de chronométrage.** Les chiffres entrent par la droite
> et poussent les autres vers la gauche. `5` puis `0` → `00:50`. `2·0·0·0·0` → `02:00:00`.

**Aucune règle à deviner, aucune conversion, aucun choix d'unité.** Le même geste vaut pour
dix secondes et pour six heures, et rien ne peut se tromper d'échelle.

**Les heures ne s'affichent que si elles existent** : `00:50` pour une planche, `02:00:00`
pour une escalade. Cinq caractères inutiles sur un gainage de dix secondes, c'est cinq de
trop.

**La distance garde un champ simple avec son unité.** Elle n'a qu'une base de dix et une
seule unité utile : taper `8,76` en kilomètres est aussi rapide que `8760` en mètres, et plus
lisible. Le décalage n'apporte rien là où il n'y a pas trois groupes et une base de soixante.

Affichage : mètres sous 1 000, kilomètres au-delà — déjà en place depuis le chantier 12.

> ⚠️ **Anomalie relevée, non traitée :** le tapis roulant porte une distance maximale de
> **650 000 m**, soit 650 km. Saisie erronée, probablement des kilomètres tapés en mètres.
> À vérifier, sans urgence.
>
> Relevé au chantier 25 : **la distance n'a aucune borne** — ni pavé, ni compteur de chiffres,
> ni contrainte en base ; seul le négatif est rejeté. C'est par ce chemin qu'une valeur
> aberrante entre, et un plafond de durée seul ne le ferme pas.

#### 3 ter.2 ter Tranché à l'implémentation — chantier 25

**Une seule borne, et c'est la valeur : 9:59:59.** Au-delà, le chiffre n'entre pas.

> **Le pavé ne doit jamais produire une durée qu'il ne sait pas reprendre.** Les groupes bruts
> accepteraient 99 minutes et 99 secondes : « 99999 » vaudrait 10 h 40 min 39 s, dont la forme
> canonique fait **six** chiffres. En rouvrant la série, le champ afficherait la bonne heure et
> refuserait ensuite tout nouveau chiffre. Invisible en CI, visible sur device à la réédition.

Un compteur de chiffres serait **redondant** — au-dessus de cinq chiffres, le premier groupe
vaut au moins dix heures, donc la borne de valeur a déjà refusé. Le banc de mutation l'a
prouvé : le remplacer par 99 ne faisait tomber aucun test. Un garde-fou qu'aucune mutation ne
tue est un garde-fou mort (leçon de `palier.js`).

**L'affichage est toujours une horloge valide**, à chaque frappe. Le tampon garde les chiffres
tapés ; la valeur vaut exactement ce qu'ils disent (`HH×3600 + MM×60 + SS`, sans troncature) ;
et l'écran la rend en horloge, donc minutes et secondes y sont sous 60 par construction.
Taper `6` puis `3` affiche `01:03` — 63 secondes, dites en horloge.

**Le tampon est un ÉTAT, il ne se déduit pas de la valeur.** « 6350 » et « 10350 » valent la
même durée mais ne se poursuivent pas pareil : `6·3·5·0·0` donne 6 h 35, alors que repartir de
la forme canonique donnerait 1 h 03 min 50. Le tampon vit donc dans le champ tant qu'on tape,
et se recompose depuis la valeur au rendu suivant — sans perte, la valeur étant exacte.

**La colonne « précédent » passe aussi en horloge.** Dire « 45 s » à trois millimètres d'un
champ qui dit « 00:45 » serait deux écritures du même chiffre sur la même ligne. La grille de
saisie est une horloge ; le journal — cartes, détail, résumés — reste en prose et garde
`formatDuree`. Les deux ne se rencontrent jamais.

**Il n'y a plus qu'une unité de durée.** Le `duree_min` du chantier 24 et son facteur 60 ont
disparu avec la règle « l'unité suit la mesure » qu'ils servaient.

#### 3 ter.3 Ce que ça change ailleurs

**La page d'exercice.** La table par nombre de répétitions n'a aucun sens pour une durée. Sur
`temps`, c'est une table **par nombre de séries** : la plus longue en une série, en deux, en
trois — la fatigue accumulée y joue le rôle des répétitions.

**Le moteur.** `distance_temps` est **hors périmètre** (`CADRAGE-V2` §2 ter) : l'app les
affiche, le moteur ne les lit pas — aucune suggestion. Sur `reps` et `temps`, la double
progression garde tout son sens : on ajoute des répétitions ou des secondes.

> ✅ **Vérifié au chantier 24, avant d'écrire l'affichage : ce n'est PAS un troisième
> défaut.** `palier.analyser` rend une **absence propre** sur les trois mesures sans charge —
> `palier: null`, `reps: null`, `meilleure: null`, `erreur: 'aucune-serie-de-travail'`, zéro
> série retenue. Pas un zéro traité comme une valeur, pas un plantage.
>
> La raison est dans le code et elle est délibérée : `utilisable()` écarte toute série sans
> charge **ni** reps, et le commentaire le dit déjà — « les exercices mesurés en durée ou en
> distance n'ont donc aucun palier, et c'est correct, ils n'en ont pas ».
>
> **Une nuance à retenir :** le code d'erreur est le MÊME que celui d'une séance qui n'aurait
> contenu que des échauffements. Le moteur ne distingue pas « cet exercice n'a pas de palier
> par nature » de « cette séance n'en avait pas ce jour-là ». L'affichage ne déduit donc jamais
> la mesure d'un code d'erreur : il la lit dans `exercises.mesure`.

#### 3 ter.4 Deux points ouverts venus du catalogue

**L'assistance compte à l'envers** — le poids soulage au lieu de charger. Elle casse le seuil
des 75 % du §4.1 du moteur, **signalé au chantier 17 et non corrigé**. 128 séries, 10
exercices.

**Le tonnage suspendu** : le catalogue dit qu'un exercice suspendu compte 100 % du poids de
corps daté. Or tractions, dips barres et muscle-up sont en `reps` — **sans charge saisie, mais
avec un tonnage réel**.

**Une séance de gainage seul est classée « sortie »** *(trouvé au chantier 24, non corrigé)*.
`estExerciceSortie` retient `charge = 'aucune'` **et** `mesure ∈ {temps, distance_temps}` : une
séance qui ne contiendrait que des planches est résumée en durée, comme une randonnée, et perd
son aperçu d'exercices. Le correctif toucherait aussi Pilates et Escalade, qui sont bien des
sorties — à trancher avec la page d'exercice, pas ici.

**Une durée de zéro seconde disparaît de l'affichage** *(trouvé au chantier 25, non corrigé)*.
`formatMesure` et `resumerSeance` testent `if (serie.duree_s)` — un test de vérité, pas de
nullité. Une série à 0 s existe en base et devient muette au détail. Même famille que « 0 comme
null », à traiter d'un coup pour les quatre mesures.

### 3 bis — La grille de saisie, arrêtée le 11/09/2026

> ⚠️ **Ce qui suit décrit le gabarit `charge_reps`.** Les trois autres mesures ont leur propre
> grille — voir le §3 ter, qui prime.

**Six colonnes, vérifiées à 360 px** (et non 380, la largeur réelle de l'appareil) :

```
30px   62px        1fr          44px    40px     40px
 №    PRÉCÉDENT     KG          REPS   EFFORT     ✓
```

Colonnes fixes 216 px + gouttières 25 + marges 24 = 265. **Il reste 79 px pour les kilos**,
le pire cas étant `122,5`. Ça ne tient que parce que la suggestion n'est **pas** une colonne
(§3.1) — les 54 px libérés sont ceux-là.

**3 bis.1 — Le numéro porte le type de la série.** Un appui ouvre un menu court : travail,
échauffement, dégressive, tentative manquée, supprimer. Le numéro change d'apparence —
`C`, `D`, `✕`. Les quatre valeurs de `sets.type_serie` sont couvertes **sans un champ de
plus**. Dans un superset, la chauffe de A s'appelle `Ac` et se place avant `A1` (§2.5).

**3 bis.2 — La colonne EFFORT accepte deux formes.** Un RPE chiffré, ou un ressenti en
répétitions restantes affiché `−1`, `−2`, `−0`. **L'affichage suit ce qui a été saisi**, sans
traduction.
⚠️ **Elle n'existe que sur `charge_reps` et `reps`** — voir §3 ter.2.

> **Pourquoi pas le RPE seul :** aurel_br l'a saisi sur **136 séries en trois ans, soit 1 %**.
> Une colonne permanente pour une case presque toujours vide gaspille un dixième de la
> largeur. « Il m'en restait une » se répond sans apprentissage, un 8,5 s'apprend.

`sets.rpe` et `sets.ressenti` sont **deux colonnes distinctes en base**, toutes deux prévues.
`sets_ressenti_ok` attend exactement `reste_3_plus`, `reste_2`, `reste_1`, `reste_0`.

La feuille pose la question en langage courant par défaut, avec une **bascule vers le RPE**
qui se retient. Le RPE est une **grille de huit boutons, jamais un curseur** : viser 8,5 sur
un curseur à 360 px avec les mains moites est perdu d'avance.

**3 bis.3 — Les valeurs fantômes.** Les champs non saisis affichent en gris ce que la routine
ou le moteur propose. On valide sans rien taper quand c'est juste.

**3 bis.4 — Le retour haptique.** Une vibration à la validation confirme « même avec les mains
moites ». **L'optimisation la moins chère qui soit : aucun pixel.**
⚠️ **Spécifié mais absent** — vérifié sur device le 11/09, aucune vibration à la validation.
**Diagnostic du chantier 23 :** l'appel était bien fait, mais sur **18 ms** — une durée où un
moteur à masse excentrée a seulement fini de démarrer. Porté à **35 ms** à la validation et
**120 ms** à l'échéance du repos, qui doit se sentir à travers une poche. L'API elle-même est
présente et appelée, vérifié au banc en navigateur réel.

**3 bis.7 — La ligne validée passe en vert.** La coche seule est trop discrète à bout de bras,
entre deux séries. **Toute la ligne** change de fond : on voit d'un coup d'œil où l'on en est,
sans lire.

**3 bis.8 — Le chronomètre de repos.** À l'échéance, **un son court et unique, accompagné
d'une vibration unique**. Pas de décompte qui presse, pas d'alarme au dépassement, rien qui se
répète — le §7 ter.3 tient : il informe, il ne commande pas.

**Deux commandes** : **−15 s / +15 s**, parce qu'une cible mal réglée est le cas courant, et
une **sourdine** qui se retient d'une séance à l'autre.

Arbitré au chantier 23 : le réglage vaut pour **le repos en cours**, jamais pour la routine —
corriger la routine depuis la salle serait une décision prise en trois secondes et gardée pour
toujours. Une cible à **zéro ne sonne jamais** : zéro veut dire « pas de cible », pas « tout de
suite ». Repousser la cible au-delà du temps écoulé **réarme** l'échéance — c'est une échéance
nouvelle, posée à la main, pas une répétition. Et la **sourdine coupe le son, pas la
vibration** : on met son téléphone en silencieux dans une salle, on ne renonce pas pour autant
à savoir que le repos est fini.

Le son est **synthétisé** (880 Hz, 200 ms, Web Audio) : pas de fichier binaire au dépôt, pas de
CDN, rien à précacher.

> ⚠️ **Et la barre de repos ne doit RIEN recouvrir — corrigé au chantier 25, voir §3 bis.9.**

**3 bis.5 — Glissement latéral pour supprimer une série.** Geste horizontal sur une ligne,
comme partout ailleurs. Il n'entre pas en conflit avec le défilement vertical.
⚠️ À tester tôt sur device : c'est la famille de geste qui a coûté trois chantiers.

**3 bis.6 — Pas d'indicateur de position.** Les cases cochées disent déjà où l'on en est.

**3 bis.9 — Rien d'interactif ne reste sous une barre fixe.** Constaté sur device au chantier
24 : la barre de repos recouvrait « + Série » et « Ajouter un exercice ». On ne pouvait plus
rien ajouter pendant un repos — c'est-à-dire pendant les deux minutes où l'on a justement le
temps de le faire.

> **Le chronomètre informe, il ne commande pas (§7 ter.3). Masquer une commande, c'est
> commander.**

Deux hauteurs étaient écrites en dur et toutes deux fausses : la réserve du bas valait 88 px
alors que la barre d'onglets fait **69 px plus l'encoche**, et la barre de repos se posait à
`bottom: 56px`, donc **par-dessus** les 13 px hauts des onglets qu'elle masquait (z-index 50
contre 10). Elle emportait aussi, entièrement, le seul message d'erreur de la séance.

**Les deux hauteurs sont MESURÉES** et exposées en `--h-onglets` et `--h-repos`. Une hauteur
mesurée suit tout : l'encoche, le repli des commandes à 360 px, une barre qu'on rendrait plus
haute demain. C'est la première mesure DOM de la v2 — assumée, pour ne pas remplacer une
constante fausse par une autre.

> ⚠️ **Le banc ne voit que la moitié du défaut** : `env(safe-area-inset-bottom)` vaut zéro
> dans un Chromium de bureau. La part qui dépend de l'encoche ne se constate que sur appareil,
> en PWA installée. Même schéma qu'au chantier 18 (`CLAUDE.md` §4 bis).

**3.5** — **La destination s'affiche, jamais le délai.** L'en-tête de bloc peut
nommer le palier suivant — « prochain palier : 125 kg × 5 » — parce que ce
chiffre est de l'arithmétique : charge courante + incrément déduit (§10.1 du
moteur), reps = bas de la fourchette (§9.1.2).

> **Interdit : « possible dans 3 séances ».** Un délai est une prédiction, et la
> prédiction a échoué douze fois au banc d'essai. Mesuré sur les cinq profils, un
> épisode sans nouveau record dure **5 séances en médiane mais 23 au neuvième
> décile** chez le profil assidu : l'incertitude est plus grande que la valeur
> annoncée. Un « 3 séances » démenti transforme une pause normale en promesse
> trahie, et contredit le principe « la cible est une intention, pas un
> engagement ».

**3.6** — La proximité se dit en **travail restant**, pas en temps : « il te
manque une rep à 122,5 ». Vrai, vérifiable, et impossible à démentir par la
séance suivante.

**3.7** — **Préféré au précédent : le chemin parcouru plutôt que le chemin
restant.** « 122,5 kg : 4 reps il y a un mois, 6 aujourd'hui. » C'est la règle
centrale du cadrage appliquée à l'écran — descriptif oui, prescriptif jamais sur
l'historique. Et c'est ce qui rend un plateau lisible **sans jamais employer le
mot stagnation** : la personne voit qu'elle avance, ou qu'elle n'avance plus,
sans qu'un verdict soit prononcé.

**Mesures** — la charge bouge d'une série à l'autre bien plus souvent que prévu
(identique seulement 35,8 % du temps chez Jordan, 35,9 % chez Mélodie). Et les
montées ne sont pas toutes de la rampe : chez Aurélien et Jordan, ~45 % des
montées arrivent après la 3ᵉ série, ce qui exclut l'échauffement non tagué. Les
deux mécanismes coexistent, en proportions différentes selon la personne.

---

## 4. Profil de travail déclaré

Origine : au jour zéro, un nouvel utilisateur n'a aucune donnée à lire.

**4.1** — Le **format d'une séance-exercice** continue de se déduire des reps
médianes (§8 du moteur). Inchangé.

**4.2** — Le **profil de travail** (force, hypertrophie, etc.) est **déclaré par
l'utilisateur à l'inscription**, au moment de la collecte des autres infos. La
question s'accompagne d'une ou deux lignes expliquant ce que ça implique en
charges, reps et séries — le vocabulaire seul trierait les gens selon ce qu'ils
ont lu, pas selon ce qu'ils font.

**4.3** — Il vit sur le **profil utilisateur**, jamais sur la séance. Règle
générale : ne jamais écrire une déclaration ni une déduction dans l'étage observé.

**4.4** — L'observation le remplace **exercice par exercice**, au seuil habituel
de 8 séances. En dessous, la déclaration sert d'amorce. Au-dessus, elle est
ignorée pour cet exercice.

**4.5** — L'utilisateur peut changer son profil à tout moment. **Un changement
déclaré reprend la main sur l'observation antérieure à sa date.** La déclaration
porte une date ; le moteur ne lit plus que les séances postérieures pour juger du
format. L'ancien historique reste entier pour les paliers et les charges — aucune
donnée perdue — mais il ne vote plus sur « où cette personne veut travailler ».

Principe : le profil de départ est une amorce que l'observation remplace ; un
changement de profil est une **intention explicite**, et une intention datée bat
une observation antérieure à sa date.

**4.6** — Le profil ouvre ou ferme une porte, il ne module pas la suggestion. Il
interdit ou autorise au moteur de proposer une zone de reps sur un exercice sans
historique. Il ne prescrit pas un format.

*Précédent* — la fenêtre muette du référentiel appliquait déjà cette distinction
sous un autre nom : elle ne s'applique qu'aux exercices où la personne fait au
moins une série à 3 reps ou moins dans tout son historique.

---

## 5. Déviation

**5.1 — Décision d'architecture.** Le moteur **ne raisonne que sur l'historique
de l'exercice** et ignore ce qui a été sauté. Si l'on remplace le squat par la
presse à cuisses, la presse propose son propre palier, sans rien savoir du squat
sauté.

Trois raisons, par ordre de solidité :

- modéliser l'effet du squat sauté demanderait de mesurer un ordre d'exercices,
  or le `rang` importé n'est pas une chronologie — **la donnée n'existe pas** ;
- même si elle existait, l'effet est une fatigue résiduelle, que le référentiel
  classe en indécidable. On inventerait un coefficient ;
- la colonne « précédent » montre déjà ce qui s'est passé. Si l'on est plus frais,
  on met plus, et la suite s'adapte. **Le moteur n'a pas besoin de le prévoir, il
  a besoin de ne pas le contredire.**

Conséquence : la déviation est de **l'édition de liste**, pas du calcul. Le moteur
ne sait même pas qu'il y a eu déviation.

**5.2** — Les cinq gestes se réduisent :
- **Sauter** n'existe pas. Un exercice sans série validée n'est pas dans la séance
  enregistrée. Rien à construire.
- **Ajouter** est le bouton qui remplit une séance vide, réutilisé en cours de route.
- **Remplacer** est un ajouter suivi d'un sauter, en gardant la position. Un
  raccourci, pas une mécanique.
- **Réordonner** est le seul à avoir une conséquence réelle : il change les tours.
- **Transformer une série** (dégressive, rest-pause) relève des modificateurs, pas
  de cet écran.

### 5 bis — Le menu de bloc est accessible EN SÉANCE

Corrigé le 11/09/2026. Le §5.3 faisait du mode Modifier le passage obligé pour tout geste de
déviation.

> **Remplacer un exercice arrive en pleine séance, quand la machine est prise.** Basculer en
> mode édition puis revenir, c'est trois gestes pour un.

Le **menu trois points du bloc** porte donc les gestes des §5.5 et §5.6 — remplacer, ajouter
après, déplacer, grouper en superset, supprimer le bloc — **sans quitter la saisie**. Plus
« voir la progression », qui réalise le §2.8.

**Le mode Modifier reste** pour ce qu'il fait mieux : le **réordonnancement multiple**, et la
vue d'ensemble repliée qui manque pendant qu'on s'entraîne.

### Mode édition

**5.3** — Un bouton **Modifier** replie tous les blocs sur leur légende A/B/C. Les
séries disparaissent, une ligne d'avancement remplace le palier.

> ⚠️ **Corrigé au §5 bis :** le mode Modifier n'est **plus le passage obligé**. Les
> gestes de déviation sont accessibles depuis le menu trois points du bloc, en
> pleine séance. Le mode Modifier sert au réordonnancement multiple et à la vue
> d'ensemble.

Raison : deux poignées de glissement simultanées à 380 px, l'une déplaçant six
lignes et l'autre une seule, se confondent au pouce. En repliant, la cible mesure
une ligne dans les deux cas.

Bénéfice secondaire, décisif : une séance repliée en cinq lignes est la vue
d'ensemble qui manque pendant qu'on s'entraîne. Un seul écran fait deux jobs.

**5.4** — Un tap sur une carte repliée l'ouvre et donne accès aux poignées et aux
menus de ses exercices. Le menu du bloc agit sur le bloc ; l'exercice se manipule
au niveau de l'exercice.

**5.5 — Menu du bloc** (trois points en haut à droite) : Grouper en superset,
Déplacer, Supprimer le bloc.

**5.6 — Menu d'un exercice** (dans un bloc ouvert) : Sortir du superset,
Remplacer, Supprimer. « Sortir » est masqué — pas grisé — sur un bloc d'un seul.

**5.7 — Grouper** est une opération sur une **paire**. Le menu passe en mode
sélection : les autres blocs s'allument et deviennent tapables, on tape celui à
joindre. Un tap de plus, aucune ambiguïté, et ça marche à n'importe quelle
distance dans la liste.

**5.8 — Dégrouper** agit sur **un exercice**, jamais sur le bloc entier. Sortir un
exercice le place dans son propre bloc, **juste après le bloc d'origine**. Il ne
remonte pas en fin de séance.

**5.9** — Un superset tombé à un seul exercice cesse d'être un superset. Rien de
spécial à faire : c'est un bloc d'un seul, il perd son trait. Ça règle au passage
l'anomalie des 13 blocs à un exercice repérée dans les données importées.

**5.10** — À la fusion, les exercices du second bloc prennent la suite de
l'alphabet du premier. Au dégroupage, chacun redevient A. Rien n'est stocké, tout
se recalcule (cf. 2.4).

**5.11** — Le menu et le geste font **exactement les mêmes choses**. Seule
exception légitime : **Supprimer**, qui n'a pas d'équivalent gestuel — un geste
destructeur ne doit pas être accessible au glissement.

**Non mesurable** — les routines Hevy n'ont jamais été importées, on n'a que les
séances faites. Tout ce chapitre est tranché au jugement, pas à la donnée.

---

## 6. Routine après une séance déviée

**6.1** — Après l'enregistrement d'une séance, on demande si l'on met à jour la
routine ou si on la garde telle quelle.

**6.2** — On ne demande **que si la séance a réellement dévié** : exercice
remplacé, ajouté, sauté, ordre changé, groupement modifié. Une séance conforme
n'ouvre aucune question. Sinon la question devient un bruit qu'on tape sans lire.

**6.3** — On ne propose de reporter que les **écarts de structure, jamais les
charges** (cf. 1.1). Et pas le nombre de séries fait ce jour-là : une séance
écourtée par manque de temps amputerait la routine pour toujours.

---

## 7. Chronologie — `rang` et `validee_a`

**Problème posé** : `rang` voulait dire deux choses. Ordre d'affichage pour les
28 103 séries importées (Hevy a aplati les tours : les séries sont groupées par
exercice, seulement 18 à 37 % d'alternance réelle), vraie chronologie pour les
séances saisies dans l'app.

**7.1 — Résolu sans migration de structure.** `validee_a` est **NULL sur les
28 103 séries importées**, et se remplit **au moment où la série est validée** pour
toute séance saisie dans l'app. Les deux colonnes pour les deux sens existent déjà.

> ⚠️ **Corrigé le 10/09/2026.** Cette section disait que `validee_a` « vaut `now()`
> par défaut ». C'était vrai de la structure, et c'était un piège : la migration
> **`v2_039` a retiré le `DEFAULT now()`** précisément pour rendre impossible le
> défaut décrit au §7.4 ci-dessous. Avec un défaut, une ligne pré-créée au démarrage
> d'une séance recevait l'horodatage de la création. La base garantit désormais ce que
> seule une discipline de code garantissait. Référence : `SCHEMA-REEL.md`.

- **`rang`** = ordre d'affichage.
- **`validee_a`** = chronologie.

**7.2** — Pas de colonne `tour`. Un numéro de tour stocké serait une étiquette
déduite écrite en base — exactement ce qu'on s'interdit (cf. 2.4). `validee_a` est
un **fait** : l'heure à laquelle la coche a été tapée. Le tour s'en recalcule.

**7.3** — Pas de discrimination par `source` non plus : `validee_a is null` dit à
lui seul si la chronologie existe. Une série importée n'a pas de tours, on
l'affiche dans l'ordre de `rang`.

**7.4 — Contrainte d'implémentation, facile à rater.** `validee_a` doit se
remplir **à la validation, pas à l'insertion**. Si l'app pré-crée les lignes vides
d'une routine au démarrage de la séance, toutes porteront l'heure de démarrage et
la chronologie sera fausse. Passe tous les tests, ne se voit que sur device réel.

**7.5** — Dévalider puis revalider **réécrit** `validee_a`. Sinon la série garde
sa place d'origine dans les tours alors qu'elle a été refaite plus tard.

---

## 7 bis. Navigation par onglets et direction artistique — cadré le 10/09/2026

Deux chantiers d'interface distincts, souvent confondus. Ils ne se traitent ni au même
moment ni de la même façon.

### 7 bis.1 Les onglets sont structurels — à faire tôt

L'app n'a aujourd'hui qu'une surface. Dès qu'il y en aura trois ou quatre, une barre de
navigation devient nécessaire — et **elle conditionne la mise en page de tous les écrans**.
Posée après coup, elle oblige à reprendre chacun d'eux : hauteur utile réduite, zone
d'action en bas déjà occupée, marges à revoir.

> **La barre d'onglets se pose avant l'écran de saisie, pas après.**

Le routeur d'URL (chantiers 8 à 10) la rend simple à poser : chaque onglet est une vue
existante, avec son URL.

Découpage proposé, à valider : **Séances · Saisie · Statistiques · Profil**.

L'**entrée par exercice** — voir §7 bis.3 — trouve sa place dans Statistiques, ou comme
onglet à part entière si elle se révèle centrale à l'usage.

### 7 bis.2 La direction artistique — fondations d'abord, finition après

Elle compte : c'est une app ouverte trois à cinq fois par semaine. Mais elle se travaille
**sur des écrans qui existent**. La faire maintenant, puis ajouter la saisie et les
statistiques, reviendrait à la refaire deux fois.

**Exception — ce qui est coûteux à changer plus tard se décide maintenant :**

| À poser avec les onglets | À garder pour la fin |
|---|---|
| palette de couleurs | illustrations |
| échelle typographique | animations et transitions |
| échelle d'espacements | micro-interactions |
| rayons, épaisseurs, élévations | finition écran par écran |

Ces fondations se posent **en une fois**, avant les écrans, parce que chaque écran les
consomme. Le reste se pose **après**, parce qu'il les suppose.

**Contrainte connue : 360 px de large.** Les maquettes ont été faites à 380. C'est le point
de rupture des noms longs du catalogue (237 entrées, ambiguïtés réelles) — en cas de
conflit, noms sur deux lignes plutôt que troncature.

### 7 bis.3 Retrouver une séance ancienne — le calendrier n'est pas la réponse

Constaté à l'usage : l'historique fait **167 semaines**. Reculer semaine par semaine est
infaisable, et une vue mensuelle en grille ne fait que diviser le problème par quatre — 36
appuis pour remonter trois ans.

> **Le besoin n'est pas de se déplacer dans le temps, mais de retrouver quelque chose.**
> Personne ne cherche « la semaine du 12 août 2024 ». On cherche « mon meilleur couché »,
> « à quoi ressemblait mon bloc de force », « quand j'ai arrêté le soulevé ».

Trois réponses, par ordre de valeur :

1. **L'entrée par exercice.** Choisir un exercice, voir toutes ses séances de la plus
   récente à la plus ancienne, avec les charges. Trois ans en un défilement. **C'est aussi
   la maille du moteur** — palier, format, progression, stagnation raisonnent tous par
   couple (exercice, format). Cette vue prépare directement le terrain du coaching.
2. **La recherche par titre.** Les séances en ont — « Pecs - Dos », « Alpes du
   Liechtenstein ». Un mot suffit à retrouver le bon endroit, quelle que soit l'ancienneté.
3. **Le saut direct** à un mois et une année, pour le cas rare où la date est connue.

**La vue mensuelle garde un sens, mais pas celui-là : elle montre le rythme, pas le
chemin.** Un point par jour travaillé, lisible d'un coup d'œil.

> ⚠️ Si elle est faite, elle ne dit **rien** des trous : pas de couleur d'alerte, pas de
> série de jours rouges, pas de compteur de régularité. `CADRAGE-V2.md` §3.1 bis — le
> système ne commente jamais l'assiduité. Un point, ou rien.

### 7 bis.4 Jetons de design — validés le 11/09/2026

Maquette de référence : `maquette-A-validee.html`. **Les valeurs ci-dessous font foi** ; la
maquette les illustre.

| Rôle | Valeur | Usage |
|---|---|---|
| `--fond` | `#15171A` | fond d'écran. Graphite, **pas noir** — le noir pur vibre sur OLED |
| `--panneau` | `#1D2025` | surfaces posées sur le fond |
| `--panneau-2` | `#24272D` | surface au-dessus d'une surface |
| `--trait` | `#2E323A` | séparations |
| `--texte` / `--texte-2` / `--texte-3` | `#E8EAED` / `#959BA5` / `#676D77` | **trois niveaux, pas plus** |
| `--accent` | `#F2B705` | voir la règle ci-dessous |
| `--reussi` / `--manque` | `#5FA97A` / `#C4564A` | **sens uniquement**, jamais décoratif |

**Espacements** : échelle de 4 — 4, 8, 12, 16, 24, 32.
**Rayons** : deux valeurs hiérarchisées — 6 px dans une surface, 12 px pour une surface.
**Type** : une seule famille, **pile système, aucun CDN**. Chiffres toujours en
`font-variant-numeric: tabular-nums` pour que les colonnes s'alignent d'une ligne à l'autre.

> **Règle de l'accent — la plus importante.** Le jaune ne sert qu'à **deux** choses :
> l'onglet actif, et **la suggestion du moteur**. Aucun bouton jaune ailleurs. Si l'accent
> est partout, plus rien ne ressort le jour où le moteur dit « 122,5 kg, vise 6 » — et c'est
> la seule voix qui doit percer.

**Ce qui est proscrit** : cartes arrondies identiques partout avec la même ombre · libellés
en majuscules espacées · dégradés · animations à l'apparition de chaque élément · flèches
dans les boutons.

### 7 bis.5 Résumé de séance — la carte dit ce qu'on a fait

La carte affichait « 6 exercices, 19 séries » : un comptage, pas un contenu.

> **Chaque carte de séance affiche les trois premiers exercices, dans l'ordre de la séance,
> avec leur MEILLEURE SÉRIE.** Puis « et N autres exercices ».

> ⚠️ **Corrigé le 11/09/2026 après vérification sur device.** Cette section disait « leur
> palier et le meilleur compte de reps atteint à ce palier ». **C'était une mauvaise
> traduction de la demande** — Aurélien parlait de la meilleure série depuis le début.
>
> Deux cas mesurés en base qui l'ont révélé :
>
> | Séance | Séries de travail | Palier affiché | Attendu |
> |---|---|---|---|
> | Hack Squat, 24/08 | 122,6×10 · 122,6×10 · 122,6×10 · **127,6×10** | 122,6 × 10 | **127,6 × 10** |
> | Développé Couché Haltère, 29/08 | 84×10 · 84×10 · 84×10 · **88×8** | 84 × 10 | **88 × 8** |
>
> Le palier était **juste** dans les deux cas : c'est la charge tenue sur la majorité des
> séries, et c'est la grandeur du moteur. **Elle ne change pas.** Mais ce n'est pas ce qu'on
> veut lire dans un journal : une dernière série plus lourde à reps pleines est une
> performance, pas une exploration.

**Définition retenue de « meilleure série » :** la **charge la plus lourde tenue sur au moins
la moitié des reps de la série la plus longue**.

Elle retient 127,6 × 10 et 88 × 8. Elle écarte une exploration à 140 × 1 quand les séries de
travail sont à 10 reps. Elle ne dépend d'aucune formule et se calcule sur les seules séries de
travail retenues par le §7 du moteur.

> **Le palier et la meilleure série sont deux grandeurs distinctes, et les deux sont vraies.**
> Le palier sert au moteur — il décide de la suite. La meilleure série sert au journal — elle
> dit ce qui a été fait. Ne pas en faire une seule.

> ⚠️ **Un paragraphe de l'ancienne définition subsistait ici — retiré le 11/09/2026.** Il
> disait « meilleure série = palier × meilleures reps au palier », ce que les deux alinéas
> ci-dessus corrigent précisément. Laissé en place, il aurait fait revenir le défaut à la
> prochaine lecture.
>
> **Retiré de nouveau le 12/09, puis aux chantiers 23, 24 et 25 — CINQ fois, et rétabli
> chaque fois depuis le dépôt** (`CADRAGE-V2.md` §2 sexies). Le paragraphe est plus tenace que
> la correction. `v2/js/palier.js` (`meilleureSerie`) implémente la définition ci-dessus depuis
> le chantier 18 — la charge la plus lourde tenue sur au moins la moitié des reps de la série
> la plus longue.

**Trois, pas plus** : les séances font 8,1 exercices en moyenne. **L'ordre porte
l'intention** — le mouvement principal vient en premier. Le premier exercice est en texte
clair, les deux suivants en gris : un seul pivot par carte.

Charges **alignées à droite en chiffres tabulaires**, pour que les colonnes se superposent
d'une séance à l'autre.

**Point de rupture connu à 360 px** : les noms longs du catalogue (« Curl Poignets Paumes
vers le Haut Assis ») se tronquent. Acceptable en l'état. L'alternative — un nom court par
exercice — coûte une colonne en base et 237 saisies ; à n'envisager que si l'usage le
réclame.

### 7 bis.6 Pas de barres de progression pour le volume

Le bilan par muscle est un **relevé pointillé**, pas une série de barres.

> Une barre suggère une jauge à remplir, donc un objectif. **Il n'y en a pas.** Quelqu'un
> qui voit sa barre de mollets à 20 % conclut qu'il devrait la remplir — c'est exactement ce
> que `REGLE-VOLUME-V2.md` interdit de laisser croire : rien ne peut être signalé sur une
> semaine isolée.

Le relevé dit la même chose sans suggérer de seuil.

### 7 bis.7 Réserve — tout ceci est jugé sur écran de bureau

**Aucune de ces décisions n'a été vue à bout de bras dans une salle mal éclairée.** La
lisibilité du gris sur graphite, la taille des chiffres, la troncature des noms : tout se
tranche là-bas.

C'est la même règle que pour les tests (`CADRAGE-V2.md` §2 quater) : l'écran de
développement est plus clément que l'appareil réel. Ces fondations sont **assez solides pour
être implémentées et corrigées ensuite** — ce qui est l'état attendu de fondations visuelles,
faites pour être ajustées quand les écrans arrivent.

### 7 bis.9 Répartition Séances / Progression — arbitré le 11/09/2026

L'onglet Séances faisait **deux métiers** : un journal (qu'ai-je fait) et une analyse
(comment se répartit mon volume). Le relevé par muscle occupait ~250 px avant la première
séance ; sur une semaine à six séances, une seule était visible sans défiler.

> **Séances répond à « qu'est-ce que j'ai fait ». Progression répond à « comment ça se
> répartit ».** Ces deux questions ne se posent pas au même moment : l'une en salle ou le
> soir, l'autre le dimanche.

**Dans Séances — une ligne de rappel, deux lignes de haut.** Les six zones en trois colonnes
sur deux rangs, avec un chevron qui mène à Progression **sur la même semaine**. ~40 px au
lieu de ~250. Quatre séances visibles au lieu d'une.

Pas de ligne de rappel quand la semaine est vide : rien à rappeler.

**Dans Progression — le relevé complet**, avec toute la hauteur disponible.

**La barre de semaine est identique dans les deux onglets**, calendrier compris. Passer de
l'un à l'autre conserve la semaine affichée.

### 7 bis.10 Le relevé par muscle — zones, dépliage, fenêtre

**Six zones, pas dix-huit muscles.** Mesuré sur 52 semaines : le premier muscle pèse 11 % du
volume, les six premiers 52 %, les douze premiers 86 %. **Il n'y a pas de longue traîne** —
masquer la moitié basse cacherait 48 % du volume, pas du bruit. On regroupe, on ne tronque
pas : la somme des six zones vaut exactement celle des dix-huit muscles.

| Zone | Muscles |
|---|---|
| Jambes | quadriceps, ischio-jambiers, fessiers, mollets, adducteurs, abducteurs |
| Dos | grand dorsal, haut du dos, trapèzes, bas du dos |
| Bras | biceps, triceps, avant-bras |
| Épaules | deltoïdes antérieur, latéral, postérieur |
| Poitrine | pectoraux |
| Tronc | abdominaux |

**Trois niveaux, un seul cran d'indentation.** La zone déplie ses muscles **en place**,
légèrement en retrait — une zone ouverte à la fois. Le troisième niveau **n'est pas
imbriqué** : toucher un muscle ouvre une **fenêtre**.

Trois niveaux d'indentation dans une carte écrasent les noms à 360 px et font sauter la mise
en page. C'est l'erreur des trois premières tentatives.

**La fenêtre** répond à « d'où vient ce 11,5 » : chaque exercice porte son apport, le jour, et
le nombre de séries réelles. C'est là que se lit l'écart entre 5 séries et 2,5 points — un
muscle secondaire compte pour un demi-point. La note l'explique **une fois, en bas**, pas à
chaque ligne. Fermeture au bouton, au voile, et au **bouton retour d'Android**.

### 7 bis.11 Navigation entre semaines

**Flèches conservées**, plus le **balayage horizontal**, plus la **date ouvrable**.

**Le calendrier sélectionne des lignes, pas des jours.** On choisit une semaine : toucher
n'importe quel jour du 24 au 30 sélectionne la ligne entière. Seule façon d'éviter le « j'ai
touché mercredi, pourquoi toute la semaine ».

**Un point par séance** — deux séances le même jour, deux points. Le rythme du mois se lit
d'un coup d'œil. Les jours du mois voisin restent visibles mais éteints, **avec leurs
points** : une semaine à cheval se choisit quand même.

« Cette semaine » est dans **la barre de semaine**, où il apparaît dès qu'on quitte la
semaine courante et disparaît quand on y revient. Il est **aussi** dans le pied du calendrier.

> ⚠️ **Corrigé le 11/09/2026 et implémenté.** Cette section a dit qu'il vivait au pied du
> calendrier **seul** — mauvaise décision : dès qu'on recule de deux ou trois semaines on veut
> revenir, et ouvrir le calendrier pour ça est un détour.

> ⚠️ **Aucune couleur d'alerte, aucun compteur de régularité, rien sur les jours vides.**
> `CADRAGE-V2.md` §3.1 bis — le système ne commente jamais l'assiduité. Un point, ou rien.

⚠️ **Point technique fragile :** le balayage horizontal doit cohabiter avec le défilement
vertical. Même famille de geste que le glissement des blocs, qui a coûté un chantier entier.
**À tester sur device tôt, pas à la fin.**

### 7 bis.12 Piste écartée — la silhouette anatomique

Une silhouette face/dos teintée selon le volume a été essayée et **rejetée**. L'idée est
bonne dans son principe — dix-huit chiffres deviennent une image, et c'est la langue du
domaine. L'exécution ne l'est pas : une anatomie crédible ne se fabrique pas à coups de
formes géométriques en SVG.

**À ne rouvrir qu'avec un vrai dessin** — bibliothèque d'icônes anatomiques ou illustration
commandée. Pas à main levée.

### 7 bis.13 Piste écartée — le flux continu

Supprimer la navigation par semaine au profit d'un défilement continu avec en-têtes collants
a été proposé et **rejeté**. La navigation par semaine avec flèches et calendrier est
conservée.

### 7 bis.14 Progression — un sommaire, pas des sous-onglets

Une barre de sous-onglets coûte un rang permanent, et suppose des sections de même nature.
Faux ici : le volume et le poids se lisent d'un coup d'œil, **l'entrée par exercice est un
parcours**.

> **Progression est une page de sommaire.** Des blocs empilés, chacun donnant sa réponse en
> deux lignes, chacun s'ouvrant sur une vue complète.

Blocs prévus : **Volume par muscle** (fait) · **Poids de corps** (114 pesées en base depuis
janvier 2023, rien ne les affiche) · **Par exercice**.

L'écran est utile **sans rien toucher**, et chaque bloc arrive quand il est prêt.

**La barre de semaine n'appartient pas au sommaire** : le volume est hebdomadaire, le poids
et les records ne le sont pas. Elle vit dans la vue Volume.

### 7 bis.15 La vue d'un exercice

Cinq vues de courbe, sélecteur en pastilles, trois périodes (3 mois · 1 an · tout).

| Vue | Forme | Note |
|---|---|---|
| **Charge de travail** | courbe | **par défaut** — la grandeur du moteur, aucun calcul |
| Meilleure série | courbe | répond à « je progresse » quand la charge ne bouge pas |
| Reps totales | courbe | utile en hypertrophie |
| Tonnage | **barres** | quantité produite, pas niveau atteint |
| 1RM estimé | courbe **pointillée** hors plage | voir ci-dessous |

> **Le 1RM estimé n'est pas la vue par défaut, et c'est un choix mesuré.** Il n'est fiable
> qu'entre **3 et 10 reps à effort constant** ; la médiane d'aurel_br est à 10-12 reps et
> **57 exercices sont travaillés dans plusieurs formats** — ce que la littérature désigne
> comme la première cause d'estimation fausse. Le banc l'avait déjà écarté comme prédicteur
> (§9.5 du moteur). Il reste offert, avec sa réserve affichée.

**Trois repères sous la courbe**, tous vérifiables sans formule : dernière séance · record de
charge avec sa date · meilleure série au palier courant.

**Mises en garde dans l'interface, pas dans une documentation.** Le tonnage rappelle qu'il se
compare à lui-même et jamais d'un exercice à l'autre (§9 de la règle de volume). L'estimation
dit sa plage de validité.

> **Aucune vue ne porte de ligne d'objectif, de zone colorée « bien / insuffisant », ni de
> projection. Une courbe décrit, elle ne juge pas.**

### 7 bis.16 Records de série — et la correction d'un défaut de Hevy

Le meilleur poids **pour chaque nombre de répétitions**. Factuel, sans formule, et répond à
« je vise 8 reps, mon record c'est quoi ».

> **Table cumulée — « au moins n reps » — jamais brute.**

Hevy affiche la table brute, donc trouée. Sur le soulevé hex d'aurel_br : 7 reps → 150 kg,
mais 6 reps → 120 et 5 reps → 100. **Elle paraît cassée** — or qui a fait 150 × 7 a
forcément pu faire 150 × 5. Vérifié sur son couché : la table brute donne 42,5 kg à 14 reps
alors qu'il a fait 80 × 15.

**La ligne de la cible courante est mise en avant** : on voit immédiatement si on est sur le
point de battre quelque chose.

**Cas à traiter :** une série à **0 répétition** existe (140 kg au couché). Ce n'est pas une
anomalie, c'est une **tentative manquée**. Le modèle prévoit déjà `type_serie = 'echec'`
(126 séries en base). Une tentative ne compte pas comme record, et l'affichage doit la
montrer comme telle — « 140 kg, tentative » — jamais une ligne muette à zéro.
→ L'écran de saisie devra permettre de marquer un échec. Point ouvert.

### 7 bis.17 Le radar de répartition

Les six zones sur un hexagone, **période courante contre période précédente**. Donne le sens
de la variation sans rien affirmer. Sous le radar, quatre cartes de contexte : séances,
séries, et les deux zones principales.

**Hevy utilise exactement les six mêmes zones** — confirmation indépendante du regroupement
du §7 bis.10.

> ⚠️ **Différence maintenue avec Hevy : pas de flèches vertes ou rouges sur les variations.**
> Mesuré : août 14 séances contre 19 en juillet. **L'app ne connaît pas la raison.**
> `CADRAGE-V2.md` §3.1 bis — deux périodes se comparent, elles ne se jugent pas.

**Contre-exemple à ne pas copier :** le graphe « séries par muscle » de Hevy superpose
**dix-huit courbes colorées** sur un écran de téléphone, illisible sans une liste de cases à
cocher. C'est précisément pourquoi on regroupe en six zones **avant** de tracer.

### 7 bis.18 Le démarrage ne doit rien attendre du réseau

Consigné après le diagnostic du chantier 18, complété par celui des chantiers 19-20.

**Symptôme mesuré sur device** : hors réseau, l'app affichait un écran noir, ou un écran de
connexion infranchissable. **Une heure sans réseau suffit — c'est-à-dire une séance en salle.**

**Cause :** le service worker servait bien la coquille. C'est le **démarrage qui attendait
`getSession()`**, lequel part en rafraîchissement réseau dès que le jeton est périmé. Hors
réseau, deux issues, les deux reproduites : la requête **pend** → écran noir ; elle **échoue**
→ écran de connexion.

> **Une sonde synchrone sur le jeton stocké décide seule de ce qu'on affiche.** Le SDK répond
> après et ne bloque rien. C'est la garde que le v1 avait et que la v2 avait perdue.

**Suite — le cache d'abord a ensuite cassé l'app EN LIGNE.** Passer la coquille en
cache-d'abord tenait quand le réseau *pend*, mais Cloudflare Pages canonicalise `/index.html`
en **308 vers `/`** : la réponse mise en cache porte `redirected: true`, et **une réponse
redirigée ne peut pas satisfaire une navigation** — `ERR_FAILED`, réseau présent.

Corrigé au chantier 20 : garde `utilisable()` avec le test sur `redirected`, réseau en porte
de sortie, réempaquetage à l'entrée du cache, et trappe `/__sw-off`.

> ⚠️ **La réponse empoisonnée est 200, `ok`, `basic`. Seul `redirected` la distingue** — un
> test sur le statut passe à côté. Et **aucun `await` sans issue dans le gestionnaire
> `fetch`** : un service worker qui pend est le seul cas irrécupérable.

### 7 bis.8 Ordre recommandé — mis à jour le 11/09/2026

> ⚠️ **Avant d'envoyer ce document à Claude Code : comparer avec la version du dépôt**
> (`CADRAGE-V2.md` §2 sexies). Trois corrections datées du 11/09 ont déjà été perdues une fois
> par une régénération locale, dont deux qui décrivaient du code en production.

**Fait** — ancre d'historique · onglets et fondations visuelles · vue hebdomadaire et
calendrier · Progression (sommaire, volume, poids, radar) · palier en JS · bibliothèque de
routines.

**Reste, dans cet ordre :**

| # | Chantier | Note |
|---|---|---|
| 1 | **Séance en cours** | le plus risqué : l'écriture hors ligne s'y pose entière |
| 2 | **Blocs et supersets à l'écran** | entrelacement, tours, légende A/B/C |
| 3 | **Déviation** | menu de bloc en séance, puis mode Modifier et glissement |
| 4 | **Page d'exercice** (§7 quater) | atteinte depuis la séance et depuis Progression |
| 5 | **Le moteur qui parle** | cible, suggestion, stagnation |
| 6 | Direction artistique complète | après que les écrans existent |

> **Le chantier 1 est le plus risqué du projet.** Une séance se fait en salle, souvent sans
> réseau, et **perdre une séance en cours serait le pire défaut possible**.
>
> Ce qui le rend faisable : `sessions.id` et `sets.id` sont des **`uuid`**. L'app peut donc
> les fabriquer elle-même, ce qui fait de la synchronisation une **réécriture idempotente** —
> la même série envoyée deux fois écrase la même ligne. Pas de conflit à résoudre, pas
> d'identité provisoire à réconcilier.
>
> Et la base verrouille déjà le piège principal : `sets_validee_si_saisie` **interdit
> d'insérer une série non validée** quand `source = 'app'`. Pré-créer les lignes vides d'une
> routine est mécaniquement impossible.

---

## 7 ter. Le temps de repos — chronomètre automatique

Décision du 11/09/2026, après vérification de ce que font les autres outils : **le temps de
repos figure dans toutes les structures de routine**, sans exception — nom et ordre de
l'exercice, séries, reps, **et intervalle de repos**.

Et ce n'est pas une donnée théorique : **Aurélien l'a saisie pendant trois ans dans Hevy.**
Elle est perdue à l'import, l'export CSV ne la porte pas.

### 7 ter.1 Pourquoi on ne le déduit pas

L'écart entre deux validations contient le repos **plus le temps d'exécution**. Une série de 5
au squat et une de 20 aux mollets n'ont pas la même durée. Et les supersets brouillent le
calcul sur **48,7 %** des séries de travail d'aurel_br.

> **Le chronomètre part à la VALIDATION d'une série** et mesure jusqu'à la validation
> suivante. Le temps d'exécution n'entre pas dans la valeur : elle est juste **par
> construction**.

### 7 ter.2 Deux valeurs distinctes

| Où | Colonne | Sens |
|---|---|---|
| Routine | `repos_cible_s` | le repos **prescrit** pour cet exercice — 5 à 1800 s, NULL = non prescrit |
| Série | `repos_s` | le repos **réel** avant cette série — 0 à 3600 s |

Migration **`v2_040`**, appliquée et vérifiée.

`sets.repos_s` est **NULL sur les 28 103 séries importées** — ne construire aucune règle qui
le suppose renseigné, même raisonnement que pour `validee_a`.

### 7 ter.3 Le comportement à l'écran

Le chronomètre **démarre seul** à la validation d'une série et s'affiche pendant le repos.
C'est ce que font toutes les apps sérieuses, et c'est ce qui rend la mesure fiable sans rien
demander.

La valeur enregistrée est **corrigeable à la main** — pour les cas où on s'est interrompu, où
on a discuté, où on a attendu une machine.

> **Le chronomètre informe, il ne commande pas.** Pas d'alarme si le repos dépasse la cible,
> pas de blocage de la série suivante, aucun décompte qui presse. Un modificateur sert à se
> taire au bon moment.

### 7 ter.4 Point ouvert — les alternatives d'exercice

Toutes les structures de routine consultées prévoient un **remplacement** quand la machine est
prise. La matière existe à moitié : `exercises.famille` groupe les mouvements équivalents, et
le §13 du moteur s'en sert déjà comme niveau de repli.

Chantier à part, pas un champ de plus sur la routine.

---

## 7 quinquies. Une séance `en_cours` n'est pas une séance — constaté le 11/09/2026

Vérifié sur device : pendant qu'une séance est en cours, elle apparaît **partout comme une
séance terminée**.

| Endroit | Constat |
|---|---|
| Liste de l'onglet Séances | elle s'affiche, cochée comme validée |
| Carte de séance | elle porte son résumé d'exercices et son compte de séries |
| Totaux de la semaine | ses séries y sont comptées |
| Relevé par muscle | ses séries y sont comptées |
| Onglet Saisie | elle est bien signalée « en cours » — seul endroit correct |

L'écriture est juste : `statut = 'en_cours'` est bien posé, et l'abandon supprime la séance.
**C'est la lecture qui ignore le statut.**

> **Toute lecture de `sessions` doit filtrer sur `statut = 'terminee'`**, sauf la reprise de
> séance, qui est le seul endroit à vouloir l'inverse.

**Pourquoi ce n'est pas cosmétique.** Une séance en cours comptée dans les totaux fausse le
relevé par muscle, donc la règle de volume, donc — quand il parlera — le moteur. Et elle le
fait **pendant** qu'on s'entraîne, c'est-à-dire au moment où l'on regarde ces chiffres.

C'est précisément ce que le statut explicite devait empêcher (`SCHEMA-REEL.md`, piège n° 2) :
la valeur est écrite, personne ne s'en sert.

### 7 quinquies.1 Corrigé au chantier 23 — et où le filtre se pose exactement

> ⚠️ **« Toute lecture » veut dire la LECTURE, pas le TRANSPORT.** La distinction n'est pas
> une nuance : appliquée à la requête, la règle casse la synchronisation.

`toutesLesSeances()` ne sert pas qu'à l'affichage. C'est elle qui répond à « quelles séances
**existent** ? », et c'est à cette liste que `purgerSeriesOrphelines` se fie pour effacer les
séries d'une séance supprimée, sous l'autorité du compte `compterSeances`.

Filtrée sur `terminee` au serveur, elle répondait à une autre question. Deux conséquences, les
deux mesurées au banc :

| Ce qu'on filtre | Ce qui casse |
|---|---|
| la requête **et** le compte | les séries montées de la séance en cours sont purgées du cache alors que le serveur les compte encore → curseur bloqué, « N séries manquantes », 15 Mo retéléchargés **à chaque synchronisation, pendant la séance** |
| la requête **seule** | la liste devient plus courte que le compte → `verifierCompletude` la déclare incomplète → **la purge s'éteint** et les séries d'une séance supprimée restent en cache indéfiniment |

> **Le filtre vit donc à UN seul endroit : `rangerSeances()` (app.js)**, là où la liste du
> serveur devient le corpus qu'on lit — et, une ligne avant l'écriture du cache, ce qu'on
> persiste. C'est un goulot : les trois seuls chemins qui modifient `local.seances` y passent,
> et les sept lectures qui en dérivent (semaine, sommaire, période, relevé par muscle,
> calendrier, détail, colonne « précédent ») sont filtrées par construction. Filtrer à chaque
> point de lecture aurait demandé d'y penser au huitième — c'est ainsi que le défaut est né.

L'ordre compte aussi : **la purge passe avant le rangement.** Elle répond à « cette séance
existe-t-elle encore ? », pas à « est-elle terminée ? ».

Seule exception, inchangée : `seancesEnCours()`, qui interroge `statut = 'en_cours'` pour la
reprise.

---

## 7 septies. Notes, repos en séance, et fin de séance — arrêté le 12/09/2026

### 7 septies.1 La note d'exercice existe déjà — elle se duplique

**Vérifié en base, et c'est ce qui tranche le modèle.** Sur **196 couples séance-exercice**
portant une note, **185 ont exactement la même note sur toutes leurs séries**, et 188 l'ont
sur toutes sans exception.

> **La note de Hevy est une note d'exercice, dupliquée sur chaque série à l'export.** Elle est
> déjà en base, simplement stockée de façon redondante.

**Aucune table intermédiaire n'est nécessaire.** Une note posée sous le nom d'un exercice
s'écrit **sur toutes les séries de cet exercice dans cette séance** — cohérent avec les 185
couples importés.

**Les notes de série restent possibles** : 11 couples (5 %) portent des notes réellement
différentes d'une série à l'autre. Le cas existe, il ne se supprime pas.

**La note suit l'exercice quand on le réutilise** : réutiliser une routine ou copier une
séance recopie la note. `routine_exercises.note` existe déjà et n'a jamais servi.

**Emplacement** : sous le nom de l'exercice, au voisinage du repos cible.

### 7 septies.2 Le repos se modifie en séance

Le repos cible d'un exercice se change **pendant la séance**, d'un appui sur la valeur affichée
sous le nom.

> **La question « met-on à jour la routine ? » se pose à la fin**, comme pour les écarts de
> structure (§6) — pas au moment du geste.

Le repos reste par ailleurs modifiable **dans la routine elle-même**.

### 7 septies.3 Le chronomètre s'arrête à l'échéance

> **Il s'arrête**, y compris après un raccourcissement par le −15 s. Il ne continue pas à
> compter au-delà.

**La vibration d'échéance est un défaut à corriger** : vérifiée sur device **écran allumé**,
elle ne se déclenche pas. Ce n'est donc pas la limite Chrome sur écran éteint.

### 7 septies.4 L'écran de fin de séance

Il n'existe pas. Quatre champs, tous déjà en base :

| Champ | État |
|---|---|
| `sessions.titre` | renseigné à l'import |
| `sessions.note` | **421 séances sur 1 222** |
| `sessions.salle` | **vide sur les 1 222** — colonne créée par `v2_036`, jamais renseignée |
| partenaire de séance | **n'existe pas** |

**Le partenaire, en version simple d'abord.** Un nom saisi sur la séance, rien de plus.

> Ça rend lisible une variance aujourd'hui inexplicable : le banc d'essai notait qu'une séance
> peut être écourtée parce qu'on s'entraîne avec quelqu'un.

**La version partagée — une séance vivant sur deux comptes — est un autre sujet** : à qui elle
appartient, dans quel historique elle compte, qui possède les séries. C'est du social, et
`SOCIAL-ET-DEFIS-NOTES` exige de le traiter **en dernier**, après la règle d'accès.

C'est aussi ici que se pose la question du §6 : une déviation de structure ou de repos
met-elle à jour la routine ?

---

## 7 sexies. La file d'attente ne perd rien en silence — corrigé au chantier 25

Défaut trouvé au banc d'écran en tapant une durée **chiffre par chiffre**. Chaque frappe pose
une intention d'écriture et déclenche une vidange ; l'une d'elles part sur le réseau pendant
qu'une autre se pose. La suite, en quatre temps :

1. la vidange prend une **copie** de l'entrée (trois séries) et part ;
2. pendant l'aller-retour, un geste pose la **même clé** avec une intention plus récente
   (quatre séries) — la compression remplace le contenu de l'entrée ;
3. la requête revient, **réussie** ;
4. `retirer(clé)` jetait l'entrée **entière**, donc la quatrième série avec.

> **La série n'était pas perdue sur l'appareil — le brouillon la gardait — mais elle ne montait
> plus JAMAIS, et l'état de synchronisation affichait « À jour ».** Une perte silencieuse,
> c'est-à-dire exactement ce que la file existe pour empêcher.

**Le défaut est antérieur au chantier 25** : chaque caractère d'un champ pose déjà une
intention, donc « 122,5 » ouvrait la fenêtre cinq fois depuis le chantier 22.

> ⚠️ **Pourquoi aucun banc ne l'avait vu : il saisissait par `fill()`**, qui pose la valeur
> d'un bloc et n'émet qu'UN événement. **Personne ne tape comme ça.** Un humain émet un
> événement par caractère. Le banc tape maintenant pour de vrai.

**La garde :** chaque pose incrémente une `version` sur l'entrée, et on ne retire que si
l'entrée est restée **celle qu'on a envoyée**. Sinon elle reste en file, et le tour suivant
l'envoie.

---

## 7 quater. La page d'exercice — une seule, atteinte de partout

> **ÉTAT AU CHANTIER 40 (16/09/2026) — livrée, avec trois manques nommés.**
>
> Sont en place : la page unique et ses trois portes d'entrée (nom d'exercice en séance, nom
> d'exercice au détail, ligne de Progression), le bandeau de séance et « Reprendre », les deux
> sous-onglets et leurs URL, la fiche des records, la table par nombre de répétitions avec ses
> lignes déduites, et l'historique par jour.
>
> **Ne sont PAS en place, et ce n'est pas un oubli :**
>
> 1. **La courbe et ses cinq vues** (Charge · Meilleure série · Reps totales · Tonnage · 1RM
>    estimé), avec son sélecteur de période. Ce sont **cinq grandeurs neuves**, dont une —
>    « 1RM estimé » — qui est du moteur, et le moteur est hors périmètre (`CADRAGE-V2` §2 ter).
>    Le chantier 40 ne demandait que quatre lectures, toutes existantes.
> 2. **La table par nombre de SÉRIES sur `temps`** (« la plus longue en une série, en deux, en
>    trois »). La phrase se lit de deux façons — le plus long maintien cumulé sur N séries, ou
>    le plus long N-ième maintien — et on n'invente pas une spec. Sur `temps`, la page montre
>    la meilleure série et pas de table.
> 3. **La colonne d'effort dans l'historique** (RPE ou reps restantes, par série). L'historique
>    **réutilise `rendreBloc`**, le rendu du détail de séance, comme le chantier 40 le
>    demandait ; ce rendu n'a pas de colonne d'effort. L'y ajouter changerait aussi le détail
>    de séance — un autre chantier, pas celui-ci.

Décision du 11/09/2026. Le §2.8 dit qu'un tap sur le nom d'un exercice donne son historique.
Cette page est maintenant définie.

> **Une seule page d'exercice, atteinte depuis la séance, depuis Progression, depuis une carte
> de séance.** Une implémentation, un comportement, et le bouton retour ramène d'où l'on vient
> — le routeur le fait déjà.

### 7 quater.1 Le bandeau de séance

Quand on y arrive **depuis une séance en cours**, un bandeau la garde visible en haut :
« Pecs – Dos · en cours » et un bouton **Reprendre**. On consulte sans avoir l'impression
d'avoir quitté.

### 7 quater.2 Deux sous-onglets, pas quatre

| Onglet | État |
|---|---|
| **Résumé** | courbe et ses cinq vues · records · table par nombre de répétitions |
| **Historique** | les 20 dernières séances, puis « voir plus » |
| ~~Instructions~~ | **pas de matière** : `exercises` porte nom, famille, muscles, équipement — aucun texte, aucune image. 237 fiches à écrire, images à licencier |
| ~~Classement~~ | c'est le social, explicitement en dernier (`CADRAGE-V2` §2 quinquies) |

> **Ajouter un onglet plus tard ne coûte rien ; un onglet vide coûte la confiance.**

### 7 quater.3 La table par nombre de répétitions

**C'est elle qui dit le niveau réel** — « mon record c'est 140 » ne veut rien dire sans le
nombre de répétitions.

> ⚠️ **Ne vaut que pour `charge_reps` et `reps`.** Sur `temps`, la table est **par nombre de
> séries** — la plus longue en une série, en deux, en trois. Sur `distance_temps`, il n'y a
> pas de table : ces exercices sont hors du périmètre du moteur (§3 ter.3).

> **Affichage brut, lignes déduites grisées.** On voit ce qu'on a réellement fait, et ce qu'on
> pourrait revendiquer, visuellement distingué.

Une ligne est **déduite** quand un meilleur résultat existe à plus de répétitions : qui a fait
80 × 15 a forcément pu faire 80 × 14. Grisée, en italique, marquée « déduit ».

Mesuré sur le développé couché d'aurel_br : **une seule ligne déduite sur quinze**, celle des
14 reps. Le brut y donnerait 42,5 kg de février 2024 alors qu'il a fait 80 × 15 en juillet
2025.

**La date de chaque record est affichée, et elle change la lecture** : le record à 8 reps
(110 kg) date de novembre 2025, celui à 6 reps d'hier. Sans la date, on ne sait pas lequel est
à jour.

La ligne de la **cible courante** est mise en avant.

### 7 quater.4 L'historique

Les **20 dernières séances**, puis « voir plus ». Chacune avec **toutes ses séries** : chauffe
en retrait, tentative marquée `✕`, effort en RPE **ou** en répétitions restantes selon ce qui
a été saisi.

Plus le **repos moyen**, la **note de séance** s'il y en a une, et le **titre de la séance**,
qui mène au détail complet pour qui veut le contexte des autres exercices.

**Un record atteint ce jour-là est signalé** — c'est ce qui donne envie de défiler.

---

## 7 octies. Gestes sur une séance — manquants, constaté le 13/09/2026

**Aucun des quatre gestes que toute application de suivi propose n'existe.**

| Geste | État | Note |
|---|---|---|
| **Supprimer** | absent | **le plus urgent** — deux séances ont dû être supprimées en base le 13/09 parce que l'app ne sait pas le faire |
| **Modifier** | absent | corriger une séance passée |
| **Refaire** | absent | voir ci-dessous |
| **Partager** | absent | social, donc en dernier |

> **« Refaire » ne copie pas dans l'historique : il démarre une nouvelle séance** avec la même
> structure. C'est une **troisième entrée vers la saisie**, à côté de la routine et de la
> séance vide (§1).
>
> Le mot « copier » induit en erreur — il laisse croire qu'une séance est dupliquée dans le
> journal. **« Refaire cette séance »** dit ce que ça fait.

Conséquence utile : comme c'est un **démarrage**, il reprend la structure et **les notes**,
jamais les charges. Même règle qu'une routine — le moteur décide des charges (§1, §7 septies.1).

---

## 7 nonies. Le bandeau de séance en cours — décidé, COMPOSANT ÉCRIT, non branché

> 🔧 **Mise à jour du 17/09/2026 (chantier 45).** Le composant existe :
> `Rendu.rendreBandeauReprise`, écrit pour le brouillon de routine (§7 octodecies.3) et
> **conçu pour servir aux deux**. Ce qui varie est donné par l'appelant — le quoi, le sujet,
> l'ancienneté, le libellé de la seconde action. Il reste à la séance : décider l'emplacement
> (ci-dessous, toujours non tranché), calculer le sujet et l'ancienneté depuis `seance.debut`,
> câbler « Reprendre » et « Terminer », et poser la pastille sur l'onglet Saisie.

Une séance en cours survit à tout (chantier 22) et se reprend au lancement. Mais **c'est
l'utilisateur qui va la chercher** dans l'onglet Saisie.

> **Un bandeau la signale : titre, durée écoulée, séries validées. Deux actions — reprendre,
> ou terminer.**

**Pourquoi un bandeau plutôt qu'une ouverture forcée sur la séance :** ouvrir de force suppose
qu'on sait ce que veut l'utilisateur. Un bandeau montre et laisse choisir.

Et il **règle le problème du seuil sans en fixer un** : une séance ouverte depuis trois jours
affiche « depuis 3 jours », ce qui se lit tout seul comme un oubli.

**Emplacement — non tranché.** En tête de l'onglet Séances (on peut le rater en ouvrant
Progression), ou au-dessus de la barre d'onglets sur tous les écrans (toujours visible, mais
un rang permanent tant qu'une séance est ouverte). Le second existe déjà dans la maquette de
la page d'exercice et ne gênait pas.

Une **pastille sur l'onglet Saisie** l'accompagne dans les deux cas.

---

## 7 quaterdecies. L'éditeur de routine — reps et repos sur la carte

Constaté sur device le 15/09/2026, après le chantier 41. **Livré au chantier 42 (16/09/2026).**

> **« C'est moins intuitif qu'avant de faire une routine. »**

### 7 quaterdecies.1 Les reps visées se saisissent sur la carte

Aujourd'hui il faut **ouvrir la feuille des paramètres** pour remplir un champ qu'on remplit
toujours. C'est un geste de trop sur le geste le plus fréquent de l'écran.

> **Le champ des reps visées vit sur la carte, à côté des séries.** La feuille garde ce qui est
> occasionnel.

Borne inchangée : `routine_exos_reps_bornees` — NULL, ou entre 1 et 100.

> **CE QUE LA CARTE AFFICHE EST CE QUE LA BASE RECEVRA** — la leçon de la mutation M7 du
> chantier 41, généralisée aux trois réglages.
>
> `series` est **NOT NULL** : une valeur hors bornes s'affiche **ramenée dans la plage**
> (21 → 20), parce que `serieBornee` n'a pas d'autre issue. `reps_visees` et `repos_cible_s`
> sont **NULLABLES** : une valeur hors bornes s'affiche **vide**, parce que c'est `null` que
> `normaliserExercice` écrirait. Afficher le plafond montrerait un nombre que personne n'a
> saisi et que la base ne verra jamais.

### 7 quaterdecies.2 Le repos se saisit en mm:ss, pas en secondes

> 🗄️ **DÉPASSÉ PAR LE §7 sexdecies (chantier 44).** Le repos se choisit
> maintenant à la **molette**, aux deux écrans. Ce qui suit reste vrai du **pavé de
> décalage** — il n'a pas disparu, il a changé d'objet : il sert désormais aux **durées
> d'exercice** (planche, rando, gainage), où la valeur est arbitraire. La borne basse décrite
> plus bas ne se refuse plus à l'enregistrement pour le repos : elle n'est simplement pas dans
> la liste.

**C'est une régression de notre fait**, et l'exemple type de la doctrine du câblage
(`CADRAGE-V2` §2 undecies) :

> **Le pavé de décalage existe depuis le chantier 25** (§3 ter.2 bis). `1` `3` `0` → `1:30`.
> L'éditeur de routine ne l'appelle pas et demande des **secondes brutes**.

Personne ne pense « 90 secondes », tout le monde pense « une minute trente ». La règle existe,
elle n'a simplement pas été branchée.

Borne inchangée : `routine_exos_repos_borne`, 5 à 1800 s.

> **LA BORNE S'APPLIQUE À DEUX ENDROITS, ET CE N'EST PAS UNE DUPLICATION.**
>
> Le **haut** se refuse à la frappe : `poserChiffreDuree` reçoit 1 800 s comme plafond, donc le
> chiffre qui ferait dépasser 30:00 n'entre pas. On n'a jamais besoin de passer par 40:00 pour
> écrire 30:00.
>
> Le **bas** ne le peut pas : pour taper `0:45` il faut passer par `0:04`, qui est sous le
> minimum. Un pavé qui refuse ses états de passage est un pavé où l'on ne peut rien taper. Le
> minimum est donc affaire de `valider()`, à l'enregistrement — et son message parle en mm:ss.

Les heures ne s'affichent jamais ici : `formatChrono` n'écrit le groupe des heures qu'au-delà
de l'heure, et la borne haute est à 30 minutes.

### 7 quaterdecies.3 Écarté — la fourchette de reps

Piste proposée puis abandonnée le 15/09 : saisir « 8 à 12 » plutôt qu'un nombre.

> **Une fourchette est une prescription, et la cible de reps appartient au moteur.** Deux
> sources pour la même décision — si la routine dit 8-12 et que le moteur calcule autre chose,
> aucune règle ne dit lequel gagne.

C'est la doctrine du câblage appliquée à une fonctionnalité plutôt qu'à du code. Et ça
demanderait une migration : `reps_visees` est un entier simple.

**Ne pas reproposer.** Si le besoin revient, il se traitera avec le moteur (chantier 1), pas
dans l'éditeur.

---

## 7 vicies. Réorganiser — un mode, un glissement à la poignée

Arrêté le 17/09/2026 après essai d'une maquette interactive (`maquette-reorganiser.html`).
**Livré au chantier 46 (18/09/2026).**

### 7 vicies.1 Le mode, pas le geste

**Deux entrées** : le menu ⋮, ou un **appui long** sur un bloc. Les deux ouvrent le même mode.

> **Dans ce mode, TOUS les blocs deviennent déplaçables** — pas seulement celui par lequel on
> est entré. On en bouge plusieurs, puis **on enregistre**. Annulable tant qu'on n'a pas validé.

**Réorganiser est rarement un geste isolé** : quand on touche à l'ordre, on bouge plusieurs
choses.

> **C'est le mode Modifier du §5.3, étendu** — il replie déjà les blocs et sert au
> réordonnancement multiple. **Pas un second mode.**

**Trois surfaces** : la séance · l'éditeur de routine · **la bibliothèque** (les routines
elles-mêmes). **Monter / descendre disparaissent**, remplacés par ce mode.

### 7 vicies.2 Le geste — glissement à la poignée

Deux variantes éprouvées au pouce sur maquette :

| | |
|---|---|
| **A — glisser par la poignée** | ✅ **retenu.** Un seul geste continu, on voit le bloc bouger |
| B — taper puis choisir sa place | deux appuis quelle que soit la distance, aucun glissement. Écarté : moins direct |

### 7 vicies.3 Ce qui le rend risqué

> ⚠️ **Le glissement vertical a coûté trois chantiers** sur le bouton retour, et le §5.3 mesure
> qu'à 360 px deux poignées se confondent au pouce.

**La poignée isole le geste** — on ne peut glisser que par elle, donc pas de conflit avec le
défilement. **À vérifier explicitement, sur une liste plus longue que l'écran.**

**Un superset se déplace d'un tenant** (chantier 28).

⚠️ `routines_user_rang_uniq` est un index **unique non différable** : un réordonnancement
passe par des positions en collision. Même piège que `routine_exos_rang_uniq`.

### 7 vicies.4 Migration `v2_043` — appliquée le 17/09/2026

`routines.rang`, avec `routines_user_rang_uniq` sur les non-archivées. **Initialisé sur
l'ordre alphabétique actuel** pour que rien ne bouge au premier rendu.

La bibliothèque n'avait aucun ordre — tri par nom ou par date.

### 7 vicies.5 Ce que l'implémentation a précisé — 18/09/2026

**L'index, relevé en base :**

```
CREATE UNIQUE INDEX routines_user_rang_uniq
  ON routines (user_id, rang) WHERE archivee_a IS NULL
```

`rang` est **NULLABLE et sans valeur par défaut**, borné par `routines_rang_positif`
(`rang IS NULL OR rang >= 0`). Trois conséquences, et chacune est une règle :

- **Sans rang, on passe derrière.** Une routine rangée à la main l'a été exprès ; elle ne se
  fait pas doubler par une inconnue. Le nom ne départage plus que les ex æquo.
- **Une routine neuve prend le rang suivant.** Sans ça, `rang` serait écrit par le
  réordonnancement et par personne d'autre : la bibliothèque trierait une moitié par rang et
  l'autre par nom, ce qui n'est pas un ordre.
- **Les archivées ne se rangent pas.** L'index est PARTIEL : elles sont dehors, deux d'entre
  elles peuvent partager un rang, et leur en écrire un pourrait heurter une active.

**Le rang tampon change d'espace de noms, et c'est la seule vraie difficulté.**
`routine_exos_rang_uniq` porte sur `(routine_id, rang)` : le tampon n'a besoin d'être libre que
dans UNE routine. Ici l'index porte sur `(user_id, rang)` : il doit être libre dans **toutes**
les routines de l'utilisateur. `ordonnerDeplacements` (chantier 28) se réutilise tel quel —
c'est une fonction pure — **à condition que `maxRang` soit calculé sur l'ensemble complet**,
archivées comprises. Réordonner une page d'une liste paginée casserait cette garantie.

**Les flèches ↑/↓ du bloc replié RESTENT.** Ce sont « Monter » et « Descendre » du **menu**
qui fusionnent en « Réorganiser… ». Les flèches sont le chemin accessible au clavier et le
filet quand le glissement rate — c'est la doctrine du glissement latéral, et elle vaut deux
fois ici.

**Deux sorties, et chacune dit ce qu'elle fait.** « Terminé » (bandeau) et « Enregistrer »
(pied) gardent ; « Annuler » jette. Un bouton qui porte le mot « Terminé » et jetterait des
déplacements serait un piège à perte de données.

**Le mode ne traverse pas les écrans.** Il portait déjà un défaut plus ancien — il ne se
refermait JAMAIS, pas même en terminant une séance. Maintenant qu'il porte un ordre **non
enregistré**, le laisser ouvert emporterait des déplacements en attente sur un écran qui ne
sait pas les écrire.

**L'éditeur déplace désormais des BLOCS, plus des voisins.** `echanger(i, i±1)` échangeait deux
exercices : sur un superset, ça en sortait une branche. La séance déplace le bloc entier depuis
le chantier 28 — les deux écrans disaient donc deux choses différentes du même geste, et c'est
l'éditeur qui avait tort. Couper un superset reste possible par « Dégrouper » : **un geste qui
le dit**, au lieu d'un effet de bord du déplacement.

> ⚠️ **Ce que le banc ne peut pas dire.** Il pilote le geste à la SOURIS (`page.mouse`), dans un
> contexte sans `hasTouch` : `touch-action` n'y est **jamais exercé**. Le banc prouve qu'un
> glissement hors poignée ne déplace rien, et que la liste déborde vraiment de l'écran
> (765 px pour 760). Que le doigt défile au lieu de déplacer, **seul l'appareil le dira**.

---

## 7 octodecies. Le brouillon de routine — persisté, et le tap rebranché

Arrêté le 17/09/2026 après essai du chantier 44.

### 7 octodecies.1 Le constat

Dans l'éditeur de routine, **taper le nom d'un exercice ne fait rien**. Désactivé volontairement
au chantier 43, avec cet argument :

> *« En séance, le tap ouvre la page de l'exercice et la séance survit — elle est persistée. Le
> brouillon d'une routine ne l'est pas : le tap coûterait une routine en cours d'édition, sans
> un mot. »*

**Le raisonnement est juste, la conclusion non.** Il traite la conséquence comme une fatalité.

> **La réponse est de persister le brouillon, pas de retirer le geste.**

Et c'est précisément là qu'on en a besoin : **consulter l'historique d'un exercice pendant
qu'on construit une routine** est le moment où l'on décide combien de séries y mettre.

### 7 octodecies.2 Le brouillon vit sur l'appareil

Aujourd'hui l'éditeur travaille **en mémoire**. Quitter l'écran perd tout ce qui n'est pas
enregistré.

> **Le brouillon s'écrit sur l'appareil à chaque modification**, comme la séance en cours
> depuis le chantier 22.

Partir voir une page d'exercice, tuer l'app, revenir : le brouillon attend.

**L'enregistrement reste explicite.** Le brouillon protège du départ accidentel ; la routine
n'existe que quand l'utilisateur le dit.

> ⚠️ **Local, jamais en base.** Une routine en cours d'édition n'a rien à faire sur le serveur,
> et `routines_nom_court` ou les bornes de `routine_sets` refuseraient un état transitoire — un
> nom vide le temps de le taper, un exercice sans ligne le temps d'en ajouter une.

### 7 octodecies.3 Un brouillon abandonné se signale

**Il ne disparaît pas et ne s'enregistre pas tout seul.** Au retour dans la bibliothèque, un
bandeau : *« Routine en cours d'édition — reprendre ou abandonner ? »*, avec l'ancienneté.

> **C'est le bandeau du §7 nonies, celui de la séance en cours.** Deux endroits, le même
> mécanisme, donc **le même composant**.

Et il règle le problème du seuil sans qu'on en fixe un : un brouillon de trois jours affiche
« depuis 3 jours », ce qui se lit tout seul comme un oubli.

### 7 octodecies.4 Le tap rebranché

Une fois le brouillon persisté, partir de l'écran est sans danger. **Rien ne justifie plus de
garder le geste inerte.**

Même destination qu'en séance : la page d'exercice (§7 quater), avec retour là où l'on était.

### 7 octodecies.5 Ce que l'implémentation a précisé — 17/09/2026

**Il n'y a qu'UN brouillon à la fois**, et il ne se déverse que dans sa propre routine : ouvrir
la routine X pendant qu'un brouillon de Y attend ne le montre pas, et ne l'efface pas non plus —
le brouillon ne s'écrit **qu'à la modification**, jamais à l'ouverture. ⚠️ **Mais modifier X
remplace alors le brouillon de Y**, sans le dire — et **supprimer X efface aussi le brouillon
de Y**, pour la même raison : il n'y a qu'une case. Le bandeau est le seul rappel ; c'est
acceptable pour un brouillon à la fois, et à rouvrir le jour où il en faudra plusieurs.

**« Abandonner » demande confirmation.** Un brouillon de trois jours ne s'efface pas au premier
tap d'un bandeau — c'est le pire endroit pour un geste irréversible (§6.2).

**Le nom compte comme une modification.** Il vit dans le DOM et non dans le brouillon jusqu'à
l'enregistrement : sans branchement propre, taper un nom puis quitter le perdrait — et c'est le
tout premier geste d'une routine neuve.

---

## 7 novodecies. Le chronomètre s'arme sur un repos désactivé — DÉFAUT

Constaté sur device le 17/09/2026, après le chantier 44.

```
repos désactivé (NULL)  →  valider une série  →  le chronomètre PART
```

**Il compte sans but.** Un repos à `NULL` ne doit rien armer — c'est écrit au §7 sexdecies.3,
et les tests du chantier 44 le vérifiaient.

> **Donc soit le test ne mord pas, soit le branchement en séance ne lit pas la bonne valeur.**
> À diagnostiquer avant de corriger.

Piste : la distinction `NULL` / zéro. Le chantier 44 a noté que « désactiver est un **geste**,
pas une valeur » — la même confusion pourrait vivre en aval.

### 7 novodecies.1 La cause, mesurée — 17/09/2026

**Ni l'une ni l'autre des deux hypothèses, et la piste était fausse.**

| Question | Mesure | Réponse |
|---|---|---|
| Le test mordait-il ? | `chrono.cible` forcée à 1 s dans `app.js` → **1 916 tests verts** | **Non.** Aucun test n'observait l'armement. |
| Le branchement lisait-il la bonne valeur ? | Le banc affichait « cible — », donc `null` | **Oui.** Il la lisait — et armait quand même. |

**L'armement n'était conditionné par rien.** `demarrerChrono(null)` posait un objet non nul,
donc la barre s'affichait ; et comme `reposFige(null, s)` est faux pour tout `s`, l'intervalle
d'une seconde ne s'arrêtait jamais.

Le test du chantier 44 s'appelait *« un repos désactivé vaut NULL en séance, et n'arme aucune
cible »* et ne vérifiait que le **stockage**. Son nom promettait ce que son corps ne faisait
pas.

> **La décision d'armement vit désormais dans une fonction PURE** (`Seance.cibleArmable`), et
> non dans une condition au point d'appel : c'est la seule forme qu'une mutation peut tuer.

**Et la campagne l'a confirmé par l'autre bout.** Remplacer, au point d'appel, `cibleArmable(cible)`
par `cible` brute donne un mutant qui **survit** — et c'est correct : sur le domaine que ce point
d'appel peut réellement recevoir, les deux fonctions sont la même. `repos_cible_s` est normalisé
en amont (`null` quand il est absent, dans `creer`, `ajouterExercice` et la relecture du cache) et
borné par `definirReposCible` à `null` ou 5-1800. **Zéro, le négatif et le non-numérique n'y
arrivent jamais** — c'est exactement pourquoi la décision se teste là où elle est *énoncée*, et
pas là où elle est *câblée*.

**Et valider arrête toujours le repos précédent.** Sans cible, on ne laisse pas courir celui
d'avant : commencer une série met fin au repos, qu'il y ait quelque chose à compter ensuite ou
non.

### 7 novodecies.2 Ce que ça change pour un exercice sans repos prescrit

`NULL` veut dire « désactivé » **et** « jamais prescrit » — une seule valeur pour les deux. La
barre de repos ne s'ouvre donc plus du tout sur un exercice sans repos, et ses commandes
(−15 / +15) ne servent plus à en poser un depuis rien.

> **Ce n'est pas une capacité perdue** : la molette, sous le nom de l'exercice, pose un repos en
> deux taps (§7 sexdecies). Les commandes de la barre gardent leur objet — ajuster une cible
> mal réglée pendant qu'elle court, ce qui est le cas courant.

---

## 7 sexdecies. Choisir un repos — une molette, pas un pavé

Arrêté le 15/09/2026 après essai sur device.

### 7 sexdecies.1 Une duplication trouvée

**Deux systèmes disaient la même chose** : le pavé de décalage dans l'éditeur de routine, et
une liste de choix en séance. Le §2 undecies l'interdit.

> **La molette pour le repos. Le pavé de décalage pour les durées d'exercice.**
>
> Un temps de repos prend un **petit nombre de valeurs sensées**. Une durée d'exercice —
> planche, rando, gainage — est arbitraire. Chacun là où il a du sens.

**Le même composant aux deux endroits** : éditeur de routine et séance. C'est la même question,
donc le même écran.

### 7 sexdecies.2 La progression — 36 valeurs

| Plage | Pas | Valeurs |
|---|---|---|
| 5 s → 2:00 | **5 s** | 24 |
| 2:15 → 5:00 | **15 s** | 12 |

**Resserré où la précision compte** — 90 et 120 secondes ne sont pas la même chose. **Large
au-delà**, où le quart de minute suffit.

### 7 sexdecies.3 Trois sorties

**Valider** pose la valeur centrée · **Annuler** ne touche à rien · **Désactiver** écrit
`NULL`.

> ⚠️ **Désactivé vaut `NULL`, jamais zéro** — `routine_exos_repos_borne` commence à 5 s. Un
> repos désactivé n'arme aucun chronomètre.

### 7 sexdecies.4 Deux points à surveiller

**La molette est glissante**, et le glissement vertical a déjà coûté trois chantiers
(§7 terdecies bis). Elle vit dans une **feuille par-dessus l'écran** : rien ne défile derrière.
C'est ce qui la rend sûre — ne pas la poser en ligne dans la liste.

**Au-delà de 5:00** : la base accepte jusqu'à 30 minutes. Rare. Une dernière entrée pourrait
ouvrir le pavé pour ces cas — **non tranché**, à rouvrir si le besoin se présente.

### 7 sexdecies.5 Ce que l'implémentation a précisé — 16/09/2026

**La borne est dans la liste, plus dans un refus.** Le pavé laissait taper 0:04 et le refusait à
l'enregistrement, avec un message ; la molette ne propose pas 0:04. Il n'y a plus rien à
refuser, et le message de borne du §7 quaterdecies.2 n'a plus d'objet pour le repos.

**Une valeur stockée hors liste se centre sur la plus proche** — 3:20, tapé au pavé avant ce
chantier, ouvre la molette sur 3:15. C'est la leçon de la mutation M7 (chantier 41) appliquée
ici : **la valeur affichée est celle qui sera écrite**. Rien ne se garde en douce.

**Sans repos programmé, la molette se pose sur 1:30.** Il faut bien se poser quelque part, et
c'est le repos le plus courant. Le défaut est **visible**, et rien n'est écrit tant que
« Valider » n'a pas été touché.

---

## 7 septendecies. Deux ajustements du 15/09/2026

### 7 septendecies.1 La carte de routine ne mentionne plus les chauffes

Le chantier 43 affichait « 21 séries + 5 de chauffe ». **Le détail est inutile dans un
résumé** : il se voit en ouvrant la routine.

> **« 7 exercices · 21 séries »** — les séries de travail, comme partout (§C1).

`apercu().nbChauffes` est parti avec son seul lecteur, plutôt que de rester un calcul que
personne ne lit — c'est la leçon de C1 (chantier 39), dans l'autre sens.

### 7 septendecies.2 L'éditeur montre ce qu'on soulève réellement

Aujourd'hui l'éditeur n'affiche **aucune charge** — ni programmée, ni réelle. Alors que la
séance propose ce qui a été fait la dernière fois.

> **En gris sur chaque ligne : la charge réellement soulevée**, celle de la dernière séance,
> même type et même rang (règle du chantier 38).

Ce n'est pas une valeur à arbitrer, c'est une **information de contexte**. La routine dit la
structure, et montre où l'on en est.

> ⚠️ **La charge seulement.** Les reps, elles, SONT la prescription : un gris dessous rendrait
> « champ vide » et « 8 reps programmées » indiscernables. C'est la raison qui tenait le
> chantier 43, et elle vaut toujours pour cette colonne-là.
>
> ⚠️ **Et c'est `Seance.precedent` qui la lit**, la même fonction qu'en séance, alignée par
> `correspondant`. Une seconde lecture d'historique aurait divergé de la première.

### 7 septendecies.3 Où se place `charge_cible_kg` — tranché

Question laissée ouverte au chantier 43 : la charge programmée descend-elle dans le fantôme ?

> **Oui, et en dernier. Le fantôme est une cascade, pas un arbitrage :**
>
> 1. ce qui vient d'être tapé dans la séance (`derniereSaisie`) ;
> 2. la dernière séance sur cet exercice, même type et même rang (chantier 38) ;
> 3. **`charge_cible_kg`**, faute de mieux.

Elle ne s'affiche donc que sur un **exercice jamais fait**, ou repris après des mois. Aucune
concurrence avec la colonne `précédent`, qui montre le passé et non une proposition.

**Quand le moteur parlera, il se placera au-dessus d'elle** — rang 2 bis — pas à côté.

> ⚠️ **Elle est LUE, jamais écrite.** La ligne de séance la porte pour que le fantôme y accède ;
> `sets` n'a pas cette colonne et `COLONNES_SET` ne la laisse pas partir. Une intention n'est
> pas une observation.

---

## 7 unvicies. Le niveau 1 de la cascade — par type, et seulement s'il dévie

Constaté sur device le 17/09/2026, après le chantier 45. **Corrigé au chantier 46.**

```
valider une CHAUFFE à 20 kg
   → 20 kg se propage en fantôme sur TOUTES les séries suivantes,
     séries de travail comprises, qui étaient déjà pré-remplies
```

### 7 unvicies.1 Troisième occurrence de la même règle manquante

`derniereSaisie` — le **niveau 1** de la cascade du §7 septendecies.3 — remontait la dernière
valeur saisie **quel que soit son type**.

> **C'est exactement ce que le chantier 38 a corrigé pour le niveau 2. Le niveau 1 ne l'a
> jamais reçu.**

Le fantôme (38), la colonne « précédent » (39), et maintenant `derniereSaisie` (46) : trois fois
la même règle, appliquée à un endroit sur deux. C'est le §2 undecies du CADRAGE, dans sa forme
la plus coûteuse — non pas du code dupliqué, mais une **règle** dupliquée, dont une copie
dérive.

> **`derniereSaisie` s'applique par type.** Ce qui est tapé sur une chauffe propage aux
> chauffes. Ce qui est tapé sur une série de travail propage aux séries de travail.

Les niveaux 1 et 2 partagent désormais `correspondant`, la même fonction d'alignement — c'est
ce qui garantit qu'ils ne divergeront plus.

### 7 unvicies.2 Et une seconde règle, mesurée

**54 % des séance-exercices d'aurel_br portent une charge qui varie entre les séries**
(2 021 sur 3 730) — typiquement `122,5 · 122,5 · 125`.

Valider la première série écrasait donc la mémoire par rang **plus d'une fois sur deux** : la
3ᵉ ligne proposait 122,5 au lieu de 125, et l'utilisateur qui « valide sans rien taper quand
c'est juste » (§3 bis.3) perdait sa montée.

> **`derniereSaisie` ne prime que lorsqu'elle DIFFÈRE de ce que la séance précédente portait au
> même rang.** Retaper ce qui était déjà proposé n'est pas une déviation : il n'y a rien à
> propager.

**Sans séance précédente, tout dévie** — il n'y a rien à quoi être égal. Le premier jour sur un
exercice, la propagation est donc pleine : c'est le seul fait dont on dispose.

> ⚠️ **Écarté : décaler toute la rampe de l'écart constaté** (130 → 130 → 132,5). Reporter un
> écart sur des séries qu'on n'a pas faites est une **prescription**, donc le territoire du
> moteur. Ici tout reste factuel : 130 tapé propage 130, à plat.

### 7 unvicies.3 Les deux règles se masquent l'une l'autre

Établi en rejouant chaque défaut séparément, au chantier 46.

Une chauffe tapée **à la valeur proposée** ne propage rien **même sans le filtre par type** : la
règle de déviation l'arrête déjà. Le premier jet des tests s'est fait prendre — son test vedette
passait avec le défaut remis en place.

> **Chaque règle se teste là où l'autre est neutre :** le filtre par type sur une chauffe qui
> **dévie** (25 au lieu de 20) · la règle de déviation sur une série de travail **conforme** au
> rang. Cinq tests tombent pour chaque défaut, et les deux ensembles sont **disjoints**.

C'est la quatrième fois que le piège de la configuration non discriminante revient sur ce
sujet (§2 quater) — après « autant de chauffes des deux côtés » (38), « charges constantes »
(38 bis) et « une seule série » (43).

---

## 7 quindecies. L'éditeur de routine EST l'écran de séance

> ⚠️ **Section écrite par Claude Code au chantier 43, d'après l'énoncé du chantier et la
> maquette `93deb7e1`.** Si la formulation d'Aurélien diffère, c'est la sienne qui fait foi —
> celle-ci en est la transcription fidèle, pas un deuxième avis.

### 7 quindecies.1 La règle

> **L'éditeur de routine est l'écran de séance, moins deux colonnes : `précédent` et la coche.
> Rien d'autre ne change.**

Même bloc, même note sous le nom, même bouton de repos, même badge de chauffe, même
entrelacement en superset, même menu ⋮, même « + Série ».

Conséquence de code, et elle n'est pas négociable : **l'éditeur APPELLE le rendu de la séance,
il n'en écrit pas un second.** `Rendu.rendreBlocsSeance`, avec `vue.programme = true`. S'il
existe une seconde `construireBlocs`, un second rendu de ligne, un second pavé de
chronométrage ou un second badge de chauffe, le chantier est raté — c'est le §2 undecies du
CADRAGE appliqué à un écran entier.

Ce que ça **supprime** :

| Parti | Pourquoi |
|---|---|
| Le champ « nombre de séries » | On n'écrit plus « 3 », on ajoute trois lignes — comme en séance. |
| La feuille des paramètres | Tout se tape sur la ligne. C'est la réponse à « c'est moins intuitif qu'avant ». |
| L'entrée de menu « Modifier les paramètres » | Elle n'ouvrirait plus qu'un réglage qui a déjà son bouton sous le nom. |

Ce que ça **permet**, et qu'on ne pouvait pas : une charge cible par série · des reps
différentes par série (5, 5, puis 3) · **des échauffements programmés** (20, 60, 100), qui
n'existaient tout simplement pas dans une routine.

### 7 quindecies.2 Les trois colonnes qui tombent

`PRÉC.` dit ce qui a été fait la fois d'avant ; la coche dit ce qui vient d'être fait. Deux
observations — et **une routine n'observe rien**. `EFFORT` tombe avec elles, pour la même
raison et parce que `routine_sets` n'a pas de colonne où le mettre.

**Le fantôme tombe aussi.** En séance il propose la valeur de la fois d'avant, en gris, pour
qu'on valide sans rien taper (§3 bis.3). Dans l'éditeur, ce qu'on tape EST la prescription :
une valeur grise s'y lirait comme une valeur déjà programmée, et « champ vide » ne se
distinguerait plus de « 125 kg ».

> 🗄️ **Rouvert et nuancé au chantier 44** (§7 septendecies.2) : la **charge** revient en gris —
> celle qu'on a réellement soulevée, pas une prescription. Les **reps**, elles, restent sans
> gris, exactement pour la raison ci-dessus. La règle ne s'est pas inversée, elle s'est
> précisée : elle ne valait que pour la colonne qui porte la prescription.

Les 142 px libérés vont aux champs qu'on remplit : sur `charge_reps`, la case des kg passe de
79 à ~160 px.

**Et le menu ⋮ reste unique par exercice.** Les cinq gestes de l'éditeur portent tous sur un
EXERCICE. Sur un bloc d'un seul, bloc et exercice sont le même objet : le menu du bloc suffit.
Sur un superset, il n'y a **pas** de menu de bloc — sinon la branche A en aurait deux, et le
bloc aucun. C'est le pendant exact de la règle de la séance, qui ne donne un menu d'exercice
QUE dans un bloc à plusieurs : les deux se complètent sans jamais se recouvrir.

**Le tour ne s'affiche pas non plus.** Un superset annonce sa structure — « Superset · 2
tours » — jamais « tour 0/2 », qui annoncerait un retard sur un entraînement qui n'a pas
commencé.

> ⚠️ **Et le nom de l'exercice n'est pas tapable — écart assumé.** En séance, un tap ouvre la
> page de l'exercice (§2.8) et la séance survit : elle est persistée. Le brouillon d'une
> routine ne l'est pas — quitter l'éditeur et revenir le refabrique depuis la routine chargée,
> donc le tap coûterait une routine en cours d'édition, sans un mot. Le nom reste du texte tant
> que le brouillon n'est pas tenu au travers d'une navigation. C'est un chantier, pas une ligne.

### 7 quindecies.3 La charge cible — ce qu'elle est, et ce qu'elle n'est pas

`routine_sets.charge_cible_kg` existe, et l'éditeur la saisit. **C'est une CIBLE, facultative,
qui ne prime JAMAIS sur le moteur.** L'invariant « la routine ne porte aucune charge » se
précise, il ne se relâche pas : ce qui reste interdit, c'est une charge **observée**
(`charge_kg`, un poids, un RM) — une valeur périmée dès qu'on progresse.

> 🗄️ **TRANCHÉ AU CHANTIER 44** (§7 septendecies.3) : elle descend, et **en dernier**. Le
> fantôme est une cascade à trois niveaux — ce qu'on vient de taper, la dernière séance, puis
> la charge cible faute de mieux. Ce n'était donc pas un arbitrage entre deux voix, et la
> concurrence redoutée n'existe pas : elle ne s'affiche que sur un exercice jamais fait.

### 7 quindecies.4 Les deux détails repris de Hevy

> 🗄️ **La FEUILLE décrite ici a été remplacée au chantier 44** (§7 sexdecies) : le pavé de
> décalage a cédé la place à la molette, la même qu'en séance. **La règle, elle, n'a pas
> bougé** — et elle s'est confirmée.

**Le repos se désactive**, exercice par exercice. À **NULL, jamais à zéro** :
`routine_exos_repos_borne` refuse 0, et « 0:00 de repos » voudrait dire « enchaîne sans
souffler » — une prescription. NULL dit « je n'en programme pas », ce qui est l'absence de
prescription.

> ⚠️ **Désactiver est un GESTE, pas une valeur.** « Je n'en veux pas » et « j'efface pour
> retaper » rendent le même `null` au pavé. Seul le geste les sépare, donc c'est le geste qu'on
> transmet — sans quoi vider le pavé pour corriger referme la feuille au premier effacement.
> *(Défaut trouvé au banc, pas en test, le 16/09.)*

**La note de routine et la note de séance sont deux choses.** Celle de la routine
(`routine_exercises.note`) revient à chaque réutilisation — c'est un rappel de technique. Celle
de la séance reste sur la séance. L'éditeur n'édite que la première.

### 7 quindecies.5 La carte de la bibliothèque

« 3 séries × 8 reps » n'a plus de sens : les lignes d'un exercice ne sont plus identiques. La
carte annonce donc **le volume de travail, et les chauffes à part** :

> **6 exercices · 21 séries + 5 de chauffe**

**« + », pas « dont ».** Le nombre annoncé est celui des séries de TRAVAIL
(`THSemaine.compteSeriesTravail`, règle du volume comprise) ; les chauffes n'y sont pas, et
« 26 séries dont 5 de chauffe » serait faux. Les additionner mélangerait deux comptes qui ne se
filtrent pas pareil. Sans chauffe, la mention disparaît — on n'écrit pas « + 0 ».

> 🗄️ **La mention est partie au chantier 44** (§7 septendecies.1). L'ambiguïté de compte était
> réelle et la levée était juste ; **le détail reste inutile dans un résumé**. La carte dit
> « 7 exercices · 21 séries », et rien de plus.

Une dégressive ne compte pas comme une série de travail : elle prolonge la précédente, elle
n'en ouvre pas une nouvelle. C'est déjà la règle du badge (`nbTravail`), et la carte ne s'en
invente pas une seconde.

### 7 quindecies.6 Écarté

**La fourchette de reps** (« 6 à 8 »), pour la raison du §7 quaterdecies.3 — c'est une
prescription, et la cible de reps appartient au moteur. **Le glissement tactile**, pour celle du
§7 terdecies bis — il a son propre chantier. **L'échauffement calculé**, les dossiers, le
profil, la gamification : hors périmètre.

---

## 7 terdecies bis. Le glissement tactile — son propre chantier

Demandé le 15/09 : **« il faut pouvoir gérer les déplacements au doigt, pas qu'ici, mais en
général »**. Légitime — monter et descendre par boutons est plus lent qu'un glissement.

> **À traiter seul, jamais glissé dans un lot.**
>
> C'est la famille de geste qui a coûté **trois chantiers** sur le bouton retour. Et le §5.3 le
> mesure : à 360 px, deux poignées de glissement — l'une déplaçant six lignes, l'autre une
> seule — **se confondent au pouce**. Le glissement latéral de suppression est déjà en place et
> entre en conflit potentiel avec le défilement vertical.

Périmètre le jour venu : l'éditeur de routine **et** le mode Modifier de la séance — les deux
replient leurs blocs et posent le même problème.

---

## 7 undecies. Distinguer les chauffes et séparer les tours — arrêté le 13/09/2026

Constaté sur device : dans un superset, `Ac` et `A1` se ressemblent trop. **La chauffe doit se
lire en une demi-seconde, sans être déchiffrée.**

### 7 undecies.1 Le badge de chauffe

> **Même forme carrée que les séries de travail**, distingué par la **teinte** : bordure et
> texte bleus, fond légèrement plus clair.

La colonne garde son rythme — aucune ligne ne dépasse, ce qui compte sur une colonne qu'on
parcourt verticalement.

**Dans un superset**, le badge porte **la lettre de son exercice** : `A`, `B`, `C`, `D`. On
sait de quel exercice il s'agit sans perdre la distinction de type. **Hors superset**, un `W`.

C'est le motif de LiftTrack, qui marque ses chauffes d'un badge distinct là où les séries de
travail portent leur numéro.

Teintes retenues : `#5B8AC4` sur fond `#1B2129`, bordure `#3A4A5E`.

### 7 undecies.2 Les tours se séparent par un espace, pas par un libellé

**Piste explorée puis écartée :** nommer chaque section — « Échauffement », « Tour 1 »,
« Tour 2 ».

> **Un libellé de tour répète ce que le numéro dit déjà.** `A1`, `B1`, `C1` disent tous
> « tour 1 ». Et il coûtait **cinq rangs** sur un bloc à deux tours de chauffe et trois de
> travail.

La chauffe était un cas différent — le libellé y apportait ce que le numéro ne portait pas.
C'est pourquoi elle garde son badge et les tours non.

> **Retenu : un espace d'environ 11 px et un filet plus clair entre les tours.** Aucun texte
> ajouté. Le blanc sépare aussi bien qu'un mot.

**Ne vaut que pour les supersets.** Dans un exercice seul, les lignes ne s'entrelacent pas :
rien à séparer.

Variante écartée : un compteur seul (`1 / 3`) aligné à droite, sans mot. Il gardait
l'information de progression mais coûtait un rang par tour — et la progression se lit aux
lignes restantes.

### 7 undecies.3 Le compteur de tours — ~~défaut ouvert~~ **résolu le 13/09**

Constaté sur device : le compteur affichait **`1/x` avant toute validation**, et semblait
**passer à `2/x` quand on validait une chauffe**.

> ✅ **Diagnostiqué avant correction, et les deux lectures étaient vraies à moitié.**
>
> Une chauffe **n'a jamais** fait avancer le compteur : elle ne porte pas de tour
> (`tour: null`), donc `toursComplets` l'ignore. Vérifié par balayage exhaustif — **22 272
> configurations** de 0 à 2 chauffes et 0 à 3 séries de travail par exercice, sur des
> supersets de 2 à 4 : aucune ne fait avancer le compteur en validant une chauffe.
>
> Le défaut était **unique et ailleurs** : l'affichage montrait le tour **EN COURS**
> (`tourAtteint + 1`), pas les tours **FAITS**. D'où `1/3` avant d'avoir rien fait — et `2/3`
> une fois le premier tour bouclé, ce qui, enchaîné à une chauffe validée, se lisait comme
> « la chauffe l'a fait avancer ».
>
> **Le compteur affiche désormais les tours faits : `0/3` avant de commencer.**

### 7 undecies.4 Écarté — le défilement automatique

Hevy fait descendre l'écran sur l'exercice suivant du superset après chaque validation.
**Écarté** : un écran qui bouge seul désoriente plus qu'il n'aide.

---

## 7 duodecies. Bibliothèque de routines — suppression, menu, dossiers

Arrêté le 13/09/2026. **Livré au chantier 41 (16/09/2026), sauf .3.**

### 7 duodecies.1 On supprime, on n'archive plus

**Archiver est aujourd'hui irréversible depuis l'app.** Une routine archivée par erreur ne se
récupère que par une écriture en base — c'est arrivé le 13/09.

> **Décision : la suppression remplace l'archivage.** Un geste franc, avec confirmation. Pas
> de corbeille, pas de désarchivage.

**Le schéma protège déjà les données**, vérifié :

| Contrainte | Effet |
|---|---|
| `sessions_routine_fk` | `ON DELETE SET NULL` — **les séances restent intactes**, elles perdent la référence |
| `routine_exercises_routine_id_fkey` | `ON DELETE CASCADE` — les exercices de la routine partent avec elle |

**Ne pas parler de « lien » à l'utilisateur** : une séance passée n'est pas liée à sa routine,
elle en est issue. Supprimer la routine ne touche à rien de ce qui a été fait.

`routines.archivee_a` reste en base — aucune migration, la colonne cesse simplement d'être
écrite.

> **CE QUE L'APP EN FAIT À LA LECTURE — tranché au chantier 41.**
>
> **`archivee_a` ne cache plus rien.** Les routines qui la portent encore reviennent dans la
> bibliothèque, où elles peuvent enfin être supprimées : c'est la seule façon de refermer
> l'incident du 13/09 sans migration. Le sens de la colonne était devenu « disparue », pas
> « rangée ».
>
> **Mais `nomEnConflit` continue de l'honorer**, et ce n'est pas la même règle écrite deux
> fois : `routines_user_nom_actif_uniq` est un index **partiel** (`WHERE archivee_a IS NULL`).
> Une archivée ne réserve réellement pas son nom, et refuser localement ce que la base accepte
> bloquerait un enregistrement pour rien. Deux questions différentes, une seule colonne.

### 7 duodecies.2 Les gestes passent par le menu de la carte

**Constaté sur device.** L'éditeur affiche un bouton « grouper avec le suivant » à même la
carte : un bouton permanent pour un geste occasionnel.

> **Même grammaire que la séance** : tous les gestes de bloc vivent derrière le menu trois
> points. Deux endroits qui font la même chose doivent se piloter pareil, sinon il faut
> l'apprendre deux fois.

Le menu porte : **grouper avec le suivant · dégrouper · monter · descendre · supprimer**.

> **Livré au chantier 41.** Les quatre boutons permanents — monter, descendre, retirer, et le
> lien entre chaque paire — ont disparu. Ce qui n'a pas de sens sur une carte donnée est
> **grisé**, pas absent : les entrées ne bougent pas d'une carte à l'autre.
>
> ⚠️ **Le chantier 43 en a retiré une sixième.** « Modifier les paramètres » ouvrait une
> feuille de trois champs ; séries et reps se tapent maintenant sur la LIGNE, et le repos a
> son propre bouton sous le nom — le même qu'en séance. L'entrée aurait été un second chemin,
> plus long, vers le même réglage. Et la « carte » elle-même a disparu : l'éditeur rend les
> blocs de la séance (§7 quindecies).

### 7 duodecies.3 Les dossiers — une étiquette, pas une structure

Une bibliothèque plate devient illisible dès qu'un programme complet y entre : six à huit
routines qui vont ensemble, mélangées au reste.

> **Retenu pour maintenant : un simple dossier — « Programme force », « Prise de masse ».**
> Un champ sur la routine, rien de plus. Ça résout le rangement sans rien fermer.

**Écarté pour plus tard, explicitement :** un programme qui porte un **ordre et des cycles** —
« semaine 1 : lundi, mercredi, vendredi », avec une progression d'un bloc à l'autre.

> Ce n'est pas un dossier, c'est une structure — et **elle touche au moteur** : un programme
> qui progresse suppose que quelque chose décide de la progression d'un cycle au suivant.
> **À rouvrir quand le moteur parlera**, pas avant. Voir `CADRAGE-V2.md` §2 quinquies,
> chantier 5 « construction de programmes ».

> ⚠️ **NON LIVRÉ, et reporté explicitement** (chantier 41, §4 du prompt) : cinq routines
> tiennent dans une liste, et un dossier demande une migration. Les dossiers viendront avec
> les cycles.

---

## 7 decies. Un groupe de superset a toujours au moins deux exercices

> **Règle invariante, posée le 13/09/2026.**
>
> Un `groupe_superset` portant un seul exercice est un état **invalide**. Il ne décrit aucune
> alternance. Il ne doit être **ni créable, ni atteignable par aucun chemin**.

À faire respecter partout : groupement en séance, groupement dans l'éditeur de routine,
dégroupement, suppression d'un exercice d'un bloc, remplacement.

Le dégroupement **dissout le bloc à deux**. Sortir A d'un superset `A + B` laisserait B seul
dans son groupe — état interdit. Les deux redeviennent des blocs simples.

Le §5.6 dit « dégrouper agit sur un exercice, jamais sur le bloc » : cela vaut **à partir de
trois** exercices. À deux, sortir l'un dissout l'autre par nécessité.

Ce n'est pas théorique. **13 blocs dans cet état ont été trouvés en base** et nettoyés par
`v2_041` — 49 séries, 12 séances, 3 comptes. La règle existe pour ne pas les recréer.

> **Résolu le 13/09 (chantier 29)** : l'éditeur de routine permettait de grouper mais pas de
> dégrouper. Le lien entre deux cartes est une bascule — il se pose et se retire —, et la
> liste lue depuis la base est **normalisée à l'ouverture** : un groupe à un seul exercice
> hérité d'une routine ancienne ne peut plus être réenregistré tel quel.

---

## 8. Reste ouvert

- **Écran de fin de séance** : titre, note, photo, salle.
- **Ajouter une quatrième série** en cours de séance — non prévu par la maquette.
- **Réchauffement tardif** (au tour 3 après une longue pause) : aucune place
  prévue. Jugé acceptable, se saisit comme une série normale.
- **Fin de bloc** : quand le dernier tour est validé, plus rien n'est éclairé. Il
  faut que le bloc suivant s'allume.
- **Glissement tactile sur Android Chrome** en PWA — le geste le plus fragile de
  l'écran, en conflit avec le défilement vertical. Une liste repliée tient sans
  défiler jusqu'à 8-9 blocs ; les séances d'Aurélien font 8,1 exercices. Pile à la
  limite.
- **Menu qui sort de l'écran** en bas de liste (il se pose sous les trois points).
- **Largeur réelle** de l'écran d'Aurélien — maquettes faites à 380 px, l'appareil
  est peut-être à 360. Noms longs = point de rupture. En cas de problème : noms sur
  deux lignes plutôt que troncature (237 entrées au catalogue, ambiguïtés réelles).

---

## 9. Migration de la session précédente à reporter

`v2_036_sessions_salle` — appliquée et vérifiée, **pas encore consignée dans
`SCHEMA-V2_2.md`**. Ajoute à `sessions` : `salle` text (contraintes 1-60
caractères, non vide) et `salle_norme` text généré, qui replie en plus les traits
d'union et apostrophes en espaces par rapport au patron `elastique_norme` — pour
que « Basic-Fit » et « Basic Fit » donnent la même pastille.

**Prochain numéro libre : `v2_037`.** La numérotation a déraillé historiquement
(deux `v2_025`, deux `v2_026`) — toujours `list_migrations` avant de nommer.

---

## 10. Doctrines dégagées

- **Une étiquette qui se déduit ne se stocke jamais** (dégressive, rest-pause,
  A1/B1/C1, tour).
- **Ce que la donnée importée ne sait pas, la saisie en direct peut le savoir** —
  ne pas transposer une limite d'import en limite de produit.
- **Un chiffre qui traîne dans les notes doit être remesuré avant d'être utilisé**
  (les supersets étaient notés à 38 %, mesure réelle 48,7 %).
- **Le moteur n'a pas besoin de prévoir, il a besoin de ne pas contredire.**
- **Une intention datée bat une observation antérieure à sa date.**
- **La destination se calcule, le délai se prédit** — on affiche le prochain palier, jamais le nombre de séances pour l'atteindre
