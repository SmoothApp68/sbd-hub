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

**2.3** — Les séries s'affichent entrelacées : A1, B1, C1, A2, B2, C2. Le nom de
l'exercice n'apparaît qu'une fois, dans une légende A/B/C en tête de bloc — ce
qui règle le problème de largeur sur téléphone.

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

### Mode édition

**5.3** — Un bouton **Modifier** replie tous les blocs sur leur légende A/B/C. Les
séries disparaissent, une ligne d'avancement remplace le palier.

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
