# BANC D'ESSAI DU MOTEUR — V1

Statut : spec validée, non implémentée.
Prime sur : rien. Subordonné à `CADRAGE-V2.md` et `MOTEUR-PROGRESSION-V2.md`.

---

## 1. Pourquoi

La spec du moteur fait plus de mille lignes — paliers, formats, incréments,
stagnation, montée en charge, escalier. Chaque borne a été mesurée
séparément sur les données. **L'enchaînement complet n'a jamais été exécuté
une seule fois.**

C'est précisément la situation qui a produit les faux signaux du Coach v1 :
des chiffres justes, une alarme sur-calibrée. La méta-règle du praticien
assidu exige que toute borne soit testée sur le profil « Aurélien réel »
avant validation. Le banc d'essai est l'outil qui rend cette phrase
exécutable au lieu de la laisser à l'état d'intention.

En Python et hors du dépôt, pour deux raisons : itérer sur les bornes en
quelques secondes sans toucher au code de l'app, et faire tourner les cinq
profils d'un coup. **Les règles calibrées sur Aurélien casseront sur Jordan,
Léa, Alexis et Mélodie** — c'est le seul endroit où on peut le voir avant
les utilisateurs.

---

## 2. Ce que le banc ne mesure pas

### 2.1 L'écart entre la cible et le réel n'est pas une erreur du moteur

Quel que soit son signe.

Une séance peut être écourtée parce qu'on s'entraîne avec quelqu'un,
alourdie parce qu'on est en forme, ratée parce qu'on a fait dix heures de
route la veille ou parce qu'une douleur n'a pas été notée. **Aucune de ces
causes n'est dans la base, et aucune n'y sera jamais complètement.**

Un banc d'essai qui compterait les écarts mesurerait donc la vie de la
personne, pas le moteur. C'est le même piège que les facteurs confondus de
la règle centrale du cadrage, déplacé d'un cran.

### 2.2 Rater la cible n'est pas un événement

Le moteur définit un objectif et l'anime. Si l'objectif n'est pas atteint,
il le repropose. Il ne se passe rien d'autre.

**Conséquence directe sur le compteur de stagnation (§12 du moteur)** : il ne
doit pas se déclencher parce qu'une cible a été manquée, mais seulement
quand la personne plafonne réellement — plusieurs séances sans amélioration
d'aucune sorte. Ce n'est pas la même chose, et la confusion des deux est
l'hypothèse la plus probable derrière les fausses alarmes de la v1.

### 2.3 Doctrine — la cible est une intention, pas un engagement

Elle se lit « voilà ce qu'il faudra essayer la prochaine fois », pas comme
un contrat. **Si l'écran affiche un échec quand la cible est manquée, il
contredit le moteur.** Contrainte d'interface, pas seulement de calcul.

---

## 3. Le critère principal — le délai d'atteinte

Le moteur émet une cible à une date. On cherche la première séance
ultérieure du même exercice qui l'atteint, et on compte **le nombre de
séances écoulées**.

Aucune séance n'a besoin d'être jugée bonne ou mauvaise. On mesure un délai.

La mécanique existe déjà : c'est la table de prédictions prévue au cadrage.
Le banc l'écrit, puis la relit.

### 3.1 Lecture

| Médiane du délai | Diagnostic |
|---|---|
| ~2 séances | calibré |
| élevée (≫ 5) | trop ambitieux — la cible ne sert à rien |
| 1 systématiquement | trop timide — le moteur freine |

Par exercice **et** par personne. Une médiane globale masquerait exactement
ce qu'on cherche à voir.

### 3.2 Deux pièges qui font mentir le chiffre

**Geler la cible à sa date d'émission.** Si le moteur révise à la baisse à la
séance suivante et qu'on compare au réel avec la cible révisée, on mesure
une cible plus facile : le délai paraît bon alors que rien n'a été prédit.

**Ne pas jeter les cibles jamais atteintes.** Sinon on ne mesure que les
succès, et un moteur délirant obtiendrait un score parfait sur les trois
fois où il a eu raison. Ces cibles sont censurées à droite, pas absentes :
elles se traitent comme une durée de survie — on sait qu'elles ont dépassé
N séances sans savoir quand, ni si, elles auraient abouti.

---

## 4. Les trois défauts constatables

Complémentaires du délai. Ils ne demandent aucun jugement sur une séance et
se comptent en fréquence.

**Absurdité.** Le moteur propose une charge jamais approchée, ou inférieure à
ce qui vient d'être fait. Pas de débat : c'est faux.

**Bavardage.** Une alarme de stagnation qui se déclenche toutes les trois
séances est inutilisable même si chaque déclenchement est techniquement
correct. Défaut central de la v1.

**Mutisme.** Rien pendant vingt séances sur un exercice travaillé
régulièrement. La règle existe mais ne sert jamais.

---

## 5. Ce que le banc rejoue

Les séances des cinq profils, dans l'ordre chronologique, sans jamais lire
l'avenir. À chaque séance : faire tourner le moteur sur l'historique
disponible **à cet instant**, enregistrer ce qu'il aurait dit, avancer.

Sortie : une ligne par cible émise — personne, exercice, date, contenu de la
cible, et après coup le délai ou la censure.

---

## 6. Ce que veut dire « atteindre »

**On réutilise la règle de validation de palier du §9.1 du moteur, telle
quelle** : les deux premières séries à la cible de reps, les suivantes
tolérées à −1. Une cible est atteinte à la première séance ultérieure du
même exercice où la charge cible est portée **et** cette règle est
satisfaite.

Pourquoi pas autre chose :

- **La charge seule** est atteignable trivialement en lâchant les reps. Le
  banc enregistrerait un succès en une séance et le moteur paraîtrait
  parfaitement calibré.
- **Une seule série à charge × reps** est le défaut inverse : une série
  réussie et trois qui s'effondrent n'est pas un palier tenu, et le moteur ne
  proposera pas la suite comme si ça l'était.
- Surtout, **une définition différente de celle du moteur ferait mesurer au
  banc autre chose que ce que le moteur fait.** Les deux dériveraient
  silencieusement.

### 6.1 Test de recette obligatoire

Cette règle a déjà mal tourné une fois. Le §812 du moteur documente le squat
du 2 février : `125×4 · 125×4 · 125×4`, cible 4 — trois séries à la cible, et
une pénalité n'en comptait qu'une sur trois.

**Si le banc hérite de ce bug, tous les délais seront artificiellement longs**
et on conclurait que le moteur est trop ambitieux alors que c'est le compteur
qui est cassé. Ce cas se vérifie avant toute autre exécution.

### 6.2 Seuil de censure

**10 séances de l'exercice.** Environ un mois et demi sur un exercice
bihebdomadaire. Au-delà, la cible n'anime plus rien : ce qui compte n'est
plus le délai exact mais le fait qu'elle n'a pas abouti.

---

## 7. Périmètre — tous les exercices, résultats ventilés

**Tous les exercices entrent dans le banc.** La règle du §9.1 est une double
progression, et la littérature la décrit comme indépendante de l'exercice :
barres, haltères, machines, poids de corps, polyarticulaire ou isolation, un
seul système couvre tout — seules les fourchettes de reps changent (4-6 sur
les mouvements principaux, 8-12 sur l'accessoire). Rien ne justifie de
restreindre le périmètre a priori.

**En revanche les résultats se ventilent par nombre de séances accumulées sur
l'exercice.** Un exercice vu 4 fois et un exercice vu 60 fois ne racontent pas
la même histoire. La ventilation évite d'avoir à décider a priori lesquels
sont des piliers : la donnée le dira.

Raison de fond : les coachs séparent les exercices non par la précision de la
progression mais par leur **durée de vie**. L'usage courant est de faire
tourner les accessoires toutes les 4-6 semaines en gardant les mouvements
principaux constants. **Une cible non atteinte au bout de 10 séances sur un
accessoire n'est donc pas forcément un échec du moteur** — c'est peut-être le
comportement normal d'un exercice qu'on aurait dû changer. Lu en un seul
chiffre, le taux de censure des accessoires polluerait le diagnostic des
piliers.

---

## 8. Ce que la littérature apporte

**La variabilité jour à jour est mesurée et réelle**, ce qui soutient
directement le §2.1. Sur 19 hommes entraînés testés à six moments de la
journée, les variations selon l'heure sont près de trois fois supérieures aux
variations d'un jour à l'autre, et **chaque individu atteint son pic à un
moment différent**. La performance bouge d'elle-même, sans blessure ni route,
et pas de la même façon selon la personne.

**Désaccord tranché depuis** — voir §12.3 et §12.4 du moteur : seuil retenu à
**4 séances**, avec une définition du progrès élargie aux records de reps. Le
raisonnement d'origine reste ci-dessous.

**Point de désaccord assumé.** Le seuil courant pour déclarer une stagnation
sur un accessoire est de 2-3 séances consécutives (une source plus tolérante
demande d'avoir calé, redescendu de 10 %, rebâti, et replafonné au même
endroit). **2-3 séances est très bas** : appliqué tel quel au profil du
praticien assidu, c'est exactement le générateur de fausses alarmes de la v1.
Non tranché — à recalibrer sur les cinq profils, pas à recopier.

---

## 9. Ce que les deux premiers étages ont mesuré

Implémentés et exécutés sur les exports Hevy des cinq profils, en lecture
chronologique stricte (aucune lecture de l'avenir). Fichiers `banc_etage1.py`
et `banc_etage2.py`.

### 9.1 Étage 1 — palier et séries retenues : conforme

§4 · §4.1 · §5 · §6 · §7 enchaînés. La recette du §6.1 passe : squat du
2 février 2026, palier 125 kg, cinq chauffes taguées écartées, trois séries de
travail retenues.

Convergence rassurante : l'état du squat barre ressort à **74 % de montée sur
104 séances**, là où la spec annonçait 75 % sur 102. Deux mesures
indépendantes qui se rejoignent.

Couverture : un palier est reconnu sur **93 à 98 %** des séance-exercices
selon le profil (Jordan le plus bas). Aucune règle ne casse hors du profil
d'Aurélien.

**Piège d'implémentation non documenté dans le moteur — circularité §4.1 / §7.**
Le §4.1 définit la chauffe probable comme située « avant la première série au
palier », mais le palier se calcule au §7 après exclusion de la chauffe
probable. Chacun a besoin de l'autre. Résolu ici en **deux passes** : un palier
provisoire sur les séries brutes sert uniquement à situer la frontière, puis le
palier définitif se calcule après exclusions. Choix d'implémentation, à
consigner dans le moteur — un autre développeur trancherait autrement.

Point à surveiller : **601 séries d'exploration** chez Aurélien, près d'une
séance-exercice sur six. Le §7.4 dit qu'elles ne valident rien — une part non
négligeable des séries les plus lourdes ne fait donc jamais avancer le moteur.

Mélodie n'a **aucun** exercice en état « ne monte pas » : la branche de
neutralisation du §5.5 ne s'exercera jamais sur son profil.

### 9.2 Étage 2 — la fenêtre de la cible

Le §8.2 fonctionne : **57 exercices sur 116** sont travaillés dans plusieurs
formats chez Aurélien. La séparation par format n'est pas théorique.

Le §9.1 ne borne pas l'historique dont la cible est déduite — il prend donc
tout, et se laisse dominer par du passé mort. Part des séances où la cible
égale ce qui a réellement été fait, selon la profondeur de fenêtre :

| Fenêtre | Aurélien | Jordan | Léa | Alexis | Mélodie |
|---|---|---|---|---|---|
| 3 séances | **65,2 %** | **61,6 %** | 82,2 % | **56,7 %** | 41,7 % |
| 5 séances | 64,2 % | 58,2 % | 82,3 % | 55,1 % | **44,7 %** |
| 12 séances | 60,7 % | 59,1 % | 82,6 % | 51,9 % | 43,2 % |
| tout | 55,6 % | 59,1 % | 82,2 % | 51,0 % | 42,9 % |

> **Fenêtre retenue : 3 séances, glissante, par exercice ET par format.**

Elle gagne partout, et le plus chez Aurélien (+10 points) — c'est lui qui a le
plus de passé mort. Léa y est insensible (82 % quelle que soit la profondeur) :
la fenêtre courte ne l'abîme pas, ce qui est la vraie condition pour l'adopter.

### 9.3 Pas de périodes stockées

Les phases d'entraînement se voient dans les données — chez Aurélien, la part
de format force passe de 0 % à > 50 % à l'été 2024, retombe à ~0 % pendant un
an, puis **oscille entre 7 et 33 %** depuis septembre 2025, signature du
powerbuilding (un mélange qui se maintient, pas un bloc dédié).

**Elles ne se stockent pas** — doctrine : une étiquette qui se déduit ne se
stocke jamais. Et la fenêtre glissante de trois séances fait déjà leur travail,
en continu et par exercice, sans avoir besoin de nommer la phase.

Elles servent en revanche à **ventiler les résultats du banc** : un délai
d'atteinte mesuré pendant le bloc force de 2024 et un délai mesuré aujourd'hui
ne se comparent pas.

---

## 10. Ce que le banc a réellement trouvé — et une recommandation retirée

### 10.1 La piste suivie, et pourquoi elle était fausse

Le §9.1 déduit la cible de reps de l'historique de l'exercice dans ce format,
sans jamais la conditionner au palier. Constat de départ, sur les cinq profils :
la cible tombe beaucoup moins souvent juste quand la charge a changé depuis la
séance précédente du même couple.

| Profil | Charge inchangée | Charge changée | Part de séances où elle change |
|---|---|---|---|
| Aurélien | 72,6 % | **56,6 %** | 46 % |
| Jordan | 70,5 % | **53,2 %** | 51 % |
| Léa | 88,6 % | **73,3 %** | 42 % |
| Alexis | 63,0 % | **51,0 %** | 53 % |
| Mélodie | 46,8 % | 39,2 % | 67 % |

Ventilé par période chez Aurélien, ce clivage explique entièrement la
dégradation apparente : à charge inchangée la prévisibilité n'a pas bougé en
deux ans (80,5 → 70,7 → 72,1 → 70,5 %), tandis qu'à charge changée elle
s'effondre (70,4 → 58,1 → 63,1 → **45,7 %**) et que ce cas est devenu
majoritaire (41 % → 51 %).

La conclusion semblait s'imposer : conditionner la cible au palier via le
modèle charge/reps du §15. **Testée avant écriture, elle est catastrophique.**

| Pente appliquée | Aurélien | Jordan | Léa | Alexis | Mélodie |
|---|---|---|---|---|---|
| aucune (état actuel) | 57 % | 53 % | 73 % | 51 % | 39 % |
| 1 rep par 5 % de charge | **8 %** | 15 % | 5 % | 6 % | 6 % |
| 1 rep par 3 % | 4 % | 15 % | 2 % | 4 % | 3 % |

La raison, mesurée sur les 1 544 changements de charge d'Aurélien : **la
variation médiane du nombre de reps est zéro dans toutes les tranches**, y
compris au-delà de +10 % de charge. Il ne compense pas. Passer de 100 à 130 kg
et refaire le même compte de reps, ce sont deux séances de travail différentes,
pas deux points sur une courbe.

> **La recommandation de conditionner la cible à la charge est retirée.**

### 10.2 Ce qui change vraiment : la dispersion, pas la médiane

Variation du nombre de reps entre deux séances du même couple :

| Profil | Charge inchangée | Charge changée |
|---|---|---|
| Aurélien | médiane 0 · écart-type **1,50** | médiane 0 · écart-type **3,00** |
| Jordan | 0 · 1,60 | 0 · 2,90 |
| Léa | 0 · 1,69 | 0 · 2,65 |
| Alexis | 0 · 1,80 | 0 · 2,69 |
| Mélodie | 0 · 2,03 | 0 · **7,49** |

La médiane ne bouge pas, la dispersion double. Quand la charge change, la cible
reste la meilleure estimation possible — elle est simplement moins souvent
atteinte pile. **Ce n'est pas un défaut de calcul, c'est une incertitude qui
augmente.**

Ce qui referme la boucle sur le §2.2 : un changement de charge est précisément
le moment où la cible sera le plus souvent ratée, et le moteur ne doit rien en
conclure — surtout pas incrémenter un compteur de stagnation.

### 10.3 Le vrai enseignement — arrêter de prédire

Trois tentatives de rendre la cible plus juste ont échoué d'affilée. Le
problème n'est pas la méthode, c'est l'objectif : **on essayait de prédire
combien de reps seraient faites.** Rien dans la base ne le permet, et le §2.1
disait déjà pourquoi.

> **La cible n'est pas une prévision, c'est une consigne.** Double progression
> au sens strict : une rep de plus qu'au dernier passage, ou un cran de charge
> et retour en bas de la fourchette.

Conséquences directes :

- La question de la fenêtre (§9.2) devient **sans objet** : la cible ne se
  déduit plus d'un historique de reps. La mesure reste au dossier comme
  diagnostic, pas comme réglage.
- Le taux de justesse (57 %, 73 %…) **cesse d'être un critère** : on ne cherche
  plus à tomber juste. Le critère du §3 — le délai d'atteinte — le remplace
  intégralement.
- L'incrément par exercice est **déjà résolu** par le §10.1 du moteur, qui
  déduit le pas de salle des charges réellement utilisées.

Une seule inconnue subsiste, et elle est bien plus petite que celle qu'on
poursuivait : **le haut de la fourchette**, le compte de reps à partir duquel on
monte la charge. Il s'observe — c'est le compte au-delà duquel la personne n'est
jamais allée sur cet exercice avant de charger. À mesurer à l'étage 3.

### 10.4 Effet secondaire, conservé

L'écart médian entre deux séances du même couple est passé chez Aurélien de
**4 à 7 jours** en deux ans, le catalogue ayant doublé. La justesse décroît avec
l'écart, tous profils confondus : 0-3 j 71,3 % · 4-7 j 68,4 % · 8-14 j 67,6 % ·
15-30 j 54,7 % · 30+ j 49,4 %. Effet réel, subsistant à charge constante. Il ne
concerne plus la cible, mais il concerne **le compteur de stagnation** : deux
séances espacées d'un mois ne se comparent pas comme deux séances espacées de
trois jours.

---

## 11. Le partage des rôles

Le banc a mis à nu une confusion de fond : deux métiers différents étaient
confiés au même objet.

**Décider quoi mettre sur la barre demain.** La double progression suffit,
précisément parce qu'elle ne prédit rien. Elle vaut pour la force comme pour
l'hypertrophie ; seule la fourchette de reps change, le geste est identique.

**Savoir quand parler et quand se taire.** C'est là que sert tout le reste du
moteur. Le palier, le format, l'état de montée, la rampe, la descente de fin :
aucune de ces règles ne produit un conseil. Elles empêchent d'en produire un
mauvais. Sans le §8, le moteur voit une chute de vingt kilos là où il y a
changement de format ; sans le §5, il compte une rampe comme une régression.

> **La double progression décide. Le moteur analytique arbitre et décrit.**

C'est aussi la réponse au positionnement du cadrage. La suggestion de charge est
triviale et tout le monde peut la faire. Ce que personne ne fait correctement,
c'est de ne pas crier au loup — et c'est exactement ce que ces mille lignes
protègent.

---

## 12. Ce que ce banc peut et ne peut pas tester

**Constat qui commande tout le reste :** le moteur v2 *prescrit* (§9.1), alors que les données rejouées ont été produites sans aucune prescription. Hevy ne demande rien. Mesuré : sur 1 542 montées de charge, le compte de reps qui précède une montée est identique à celui qui précède une séance ordinaire, dans les trois formats et chez les cinq personnes. **Personne n'a jamais pratiqué la double progression dans cette base.**

Conséquence : dès que la charge suggérée par le moteur s'écarte de la charge réellement utilisée, l'historique **ne dit plus rien** de ce qui se serait passé. Une simulation en boucle fermée produit un chiffre, mais ce chiffre ne mesure rien.

### 12.1 Le délai d'atteinte est retiré comme critère principal

Le §3 proposait de compter les séances jusqu'à la première qui atteint la cible. Sur ces données, cela mesure **combien de temps la personne a mis à faire spontanément ce que le moteur aurait demandé** — pas combien de temps elle mettrait si on le lui demandait. Ce sont deux quantités différentes, et seule la seconde intéresse.

Le critère reste valide, mais il devient un **critère d'exploitation** : mesurable seulement sur des données produites par l'app, une fois qu'elle prescrit. Il est reporté, pas abandonné.

### 12.2 Ce qui reste testable sur l'historique — un pas en avant seulement

Trois tests survivent, tous en **boucle ouverte** : on lit la vraie séance N, on demande au moteur ce qu'il dirait, et on s'arrête là. On ne rejoue jamais la séance N+1 sous une charge que le moteur aurait modifiée.

**Test 1 — non-contradiction.** Le moteur ne doit jamais proposer une charge inférieure à celle qui vient d'être tenue, ni une cible de reps déjà dépassée dans la même séance, ni une charge jamais approchée sur cet exercice. Ce test est purement logique : il vaut sur n'importe quelles données, prescrites ou non. **C'est le seul test qui puisse être *parfait*, au sens de zéro violation attendue.**

**Test 2 — fréquence de déclenchement.** Le moteur dit « monte » ou « reste » à chaque séance. La fréquence des « monte » se compare à la fréquence réelle des montées de charge, qui est une décision libre de la personne et donc observable. Mesuré : **27 à 33 % des séances** selon le profil de travail, remarquablement stable entre les cinq personnes. C'est ce test qui a calibré les bornes du §9.1.2.

**Test 3 — mutisme et bavardage.** Fréquence des alarmes et des périodes de silence (§4). Ne dépend d'aucune prescription.

### 12.3 Le critère de concordance est retiré

La première version de ce chapitre proposait de comparer la **fréquence** de déclenchement du moteur à la fréquence réelle des montées de charge. C'était insuffisant, et pour une raison de fond.

Une fréquence identique n'est pas un accord : le moteur peut parler aussi souvent que la personne tout en parlant à d'autres moments. Mesuré, l'écart est massif — la règle qui égalait le mieux la fréquence (26 % contre 27 %) n'avait qu'une précision de 32 % contre 26 % au hasard sur le profil assidu.

Corrigé en mesurant la précision, un second problème apparaît, plus grave : **la cible était la décision passée de la personne.** Calibrer là-dessus produit un imitateur, pas un coach. La question posée à la journée entière était « quand Aurélien monte-t-il la charge ? », alors que la question utile est « quand *faudrait-il* monter ? ».

Deux mesures ont tranché.

**Une montée sur deux n'est pas une progression.** Part des montées de charge qui sont un retour à une charge déjà utilisée, non un record : Aurélien **51 %**, Jordan 44 %, Léa 39 %, Alexis 30 %, Mélodie 24 %. Le critère de concordance demandait donc au moteur de prédire, pour moitié, de l'oscillation.

**Osciller coûte de la progression.** Progression annuelle du record de charge, par exercice, tous profils, sur 192 couples :

| Profil | Exercices peu oscillants | Exercices très oscillants |
|---|---|---|
| Aurélien | **+18,0 %/an** (38 % de retours) | +13,6 % (61 %) |
| Jordan | +39,2 % (14 %) | +26,4 % (54 %) |
| Léa | +26,0 % (33 %) | +29,5 % (50 %) |
| Alexis | +22,6 % (21 %) | +18,6 % (71 %) |
| Mélodie | +134,4 % (29 %) | +24,8 % (38 %) |

Quatre profils sur cinq dans le même sens. **Réserve de causalité explicite** : un exercice qui progresse bien n'a pas besoin d'osciller, et un exercice bloqué pousse à revenir en arrière pour reprendre de l'élan. La mesure ne distingue pas les deux directions, et Léa va à contre-courant.

### 12.4 Le critère retenu — la montée tient-elle

> **Une montée « tient » si la charge atteinte est réutilisée dans les trois séances suivantes du couple.** Le banc ne demande plus si le moteur aurait dit la même chose que la personne, mais si ce qu'il aurait proposé aurait tenu.

Ce critère est observable sans prescription, il ne récompense pas l'imitation, et il pénalise directement l'oscillation.

Résultat de la règle retenue (§9.1.3 du moteur) :

| Profil | Montées proposées | Tiennent | Montées spontanées de la personne |
|---|---|---|---|
| Aurélien | 49 | **86 %** | 73 % |
| Jordan | 13 | **92 %** | 77 % |
| Léa | 2 | 100 % | 70 % |
| Alexis | 10 | **80 %** | 72 % |
| Mélodie | 12 | **83 %** | 70 % |

Et la mesure d'occasions manquées, qui est la seule à quantifier un gain de coaching : sur **210 séances** où la règle aurait parlé sans être suivie chez Aurélien, il est monté quand même **deux séances plus tard dans 72 cas**. Un tiers de ces séances n'étaient pas des faux positifs, mais du retard. Jordan 11 sur 21, Mélodie 6 sur 10.

Deux séances de retard sur un exercice pratiqué tous les cinq jours font dix jours par palier. Sur un an, cela recoupe l'écart entre 18 % et 13,6 % mesuré au §12.3 — deux chemins indépendants vers le même ordre de grandeur.

**Ce qui reste inexpliqué** : les 138 autres séances sur 210 où la règle parlait et où la montée n'est jamais venue. Soit faux positifs, soit occasions réellement perdues, la donnée ne tranche pas.

### 12.5 Ce que la simulation ne peut pas dire

Tentative de répondre à « aurait-on progressé plus vite ». La double progression a été simulée sur l'historique, une réussite n'étant accordée que si la capacité **démontrée à cette date** couvrait la demande.

| Profil | Exercices | Écart de charge finale |
|---|---|---|
| Aurélien | 73 | 0,0 % |
| Jordan | 17 | −4,9 % |
| Léa | 20 | 0,0 % |
| Alexis | 15 | 0,0 % |
| Mélodie | 7 | −22,2 % |

**Ce résultat était mathématiquement contraint et ne mesure rien.** Le plafond de capacité est issu de l'entraînement réel, celui avec les oscillations ; la simulation ne peut donc pas créditer la force que la méthode aurait fait gagner. Elle établit un plancher — la méthode n'aurait pas fait régresser — et rien de plus.

> **La comparaison des vitesses de progression ne peut venir que de l'usage** : trois mois sous consigne unique, puis comparaison par exercice avant et après. Même statut que le délai d'atteinte au §12.1 — critère d'exploitation, pas de banc.

---

## 13. Reste ouvert

- ~~Trancher la réserve du §9.1.4~~ — **fait : la double progression redevient principale sous prescription**, le dépassement reste pour la transition
- **Seuil de bascule** entre dépassement et ancienneté de palier — dernier paramètre non calibré
- ~~Seuil de déclenchement de la stagnation~~ — **tranché : 4 séances** (§12.4 du moteur), après correction de la définition du progrès
- Cause de la remontée de reprise spontanée à 6 séances (§12.7 du moteur)
- Rouvrir le délai d'atteinte (§12.1) et la comparaison de vitesses (§12.5) une fois les données prescrites

**Hors périmètre du moteur de charge, et de taille comparable :** volume par muscle et progression en séries, rotation des exercices, deload, fréquence et gestion de la fatigue.
