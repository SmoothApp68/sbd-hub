# Moteur de progression — v2

**Projet :** TrainHub v2
**Date :** 24 août 2026
**Statut :** validé en session vocale.
**Remplace intégralement :** `REGLE-PROGRESSION-V1.md`, `REGLE-PROGRESSION-V1.1.md`, `REGLE-PROGRESSION-V1.2.md`
**Dépend de :** `CADRAGE-V2.md` (prime en cas de contradiction), `REFERENTIEL-BORNES-V1.md`, `REGLE-VOLUME-V1.md`, `SCHEMA-V2.md`, `CATALOGUE-EXERCICES-V4.md`, `REGLES-DE-COMPTAGE-V1.md`

---

## 0. Pourquoi un document unique

Trois specs empilées, chacune ne réécrivant que ce qui bougeait, avec des renvois croisés du type « les §2 à §12 de la v1.1 restent en vigueur ». C'est exactement la maladie dont on est parti en abandonnant les 31 000 lignes de la v1 : personne ne peut dire, en ouvrant un fichier, ce qui fait foi.

**Ce document est le seul qui fait foi sur le moteur de progression.** Les trois précédents deviennent des archives. Rien n'y est perdu : tout ce qu'ils contenaient est repris ici, corrigé quand c'était faux.

Il couvre tout ce qui lit tes séries et en tire une décision. Il ne couvre **pas** la fabrication de programmes, qui est un chantier à part (§20).

### Nouveautés par rapport à la v1.2

| # | Apport | Section |
|---|---|---|
| 1 | **Montée en charge** — propriété mesurée par exercice, pas règle globale | §5 |
| 2 | **Descente de fin** — deux mécanismes opposés, un signe pour les séparer | §6 |
| 3 | **Palier, stagnation et modèle par exercice ET par format** | §8 |
| 4 | **Chaque variante est un exercice à part entière** | §8.4 |
| 5 | **Correction de deux garde-fous faux** — la chauffe et les RPE existent bien | §21.4, §21.5 |
| 6 | **Max estimé : domaine, fourchette, statut** | §16 |
| 7 | **Règle dure du tri par rang** réaffirmée avec un cas réel | §1.2 |
| 8 | **L'ancre lourde permanente** contre la périodisation en blocs | §19 |

### Corrections apportées après revue externe

| # | Correction | Section |
|---|---|---|
| 9 | **Détection de la chauffe non taguée** — le tag est absent 86 % du temps | §4.1 |
| 10 | **Le compte de reps de référence exclut la rampe** — 4,7 % de descentes mal classées | §6.5 |
| 11 | **La marche 4 ne peut plus proposer de monter** — trois garde-fous | §14.2 |
| 12 | **Signalement de péremption du poids de corps** à 3 mois | §1.3 |
| — | Trace de la revue, y compris ce qui a été **écarté** | §22.4 |

### Corrections apportées après passage au banc d'essai

| # | Correction | Section |
|---|---|---|
| 13 | **La cible est une consigne, pas une prévision** — double progression stricte à deux états, remplace la déduction par le mode des reps historiques | §9.1 |
| 14 | **La cible ne se corrige pas par la charge** — tentative mesurée puis rejetée sur les cinq profils | §9.5 |
| 15 | **Circularité §4.1 / §7** — la chauffe probable et le palier se définissent l'un par l'autre ; résolution en deux passes | §7.3 |
| 16 | **La largeur ne peut pas bloquer le système** — elle s'autorégule, chercher sa valeur exacte est une erreur de conception | §9.1.2 |
| 17 | **Deux garde-fous** — jamais de montée hors record de charge ; l'ancienneté du palier en repli quand rien ne dépasse | §9.1.3 |
| 18 | **Sous prescription, la double progression redevient la règle principale** — le dépassement n'était qu'un substitut, conservé pour la transition | §9.1.4 |
| 19 | **Douze pistes rejetées par la mesure**, dont l'e1RM-PR et la règle 2-pour-2 | §9.5 |
| 20 | **La largeur suit la zone de reps, en cloche** — pas de progression en reps sous 3, plafond à 20 ; la zone appartient au couple exercice-format, pas à la personne | §9.1.2 |
| 21 | **Progrès = record de charge OU record de reps** — l'ancien compteur déclarait bloqué qui suivait la méthode | §12.2 |
| 22 | **Seuil de stagnation à 4 séances**, constante et non percentile personnel ; le compteur déclenche un changement de méthode, pas l'action | §12.3, §12.4 |
| 23 | **La famille est le niveau de repli** quand l'exercice seul est trop rare — rattrape jusqu'à 18 points de couverture | §13.3 |
| 24 | **La rotation d'exercices n'a pas d'effet mesurable sur la progression** — rien à conseiller sur la sélection | §13.4 |
| 25 | **L'ordre des exercices dans la séance** — chantier ouvert : la fatigue dépend de ce qui précède sur le même muscle. Mesure obligatoire avant toute règle | §12 bis |

---

# PARTIE A — FONDATIONS

## 1. Les quatre règles dures

Ce sont les règles qui ne se négocient jamais, quel que soit le module. Chacune vient d'un dégât réel.

### 1.1 Ne jamais demander, toujours déduire, laisser corriger

L'app ne pose pas de question dont la réponse est déjà dans les données. Le format cible, le pas de la salle, le poids de corps, la nature d'une séance : tout se déduit. L'utilisateur corrige d'un tap si c'est faux, et **la correction devient la vérité**.

Une seule exception dans tout le moteur : la marche 5 de l'escalier (§14), qui change *ce que* l'utilisateur entraîne et ne peut donc pas se décider sans lui.

### 1.2 Aucune lecture de séries sans tri explicite sur le rang

> **Toute lecture de séries se fait avec un tri explicite sur `sets.rang`. Jamais l'ordre d'insertion, jamais l'ordre de retour d'une requête.**

Deux dégâts réels, à un mois d'écart :

- Un affichage non trié a produit le profil `[4, 4, 5, 3]` au lieu de `[5, 4, 4, 3]`. Même total, conclusion opposée : une descente 5-4-4-3 est une courbe de fatigue normale, un profil erratique ne l'est pas.
- **Le 21 août 2026 au soulevé hex**, l'analyse a conclu « 3ᵉ série descendue à 120 kg, palier non tenu ». L'ordre réel était `120 → 130 → 130 → 130` : une montée en charge, et le palier de 130 parfaitement tenu. La proposition est passée de « rester à 130 » à **135 × 10**. Erreur détectée par les captures d'écran de l'utilisateur, pas par la vérification.

Le second cas est plus grave que le premier parce que la règle existait déjà et n'a pas été appliquée. Elle est donc rappelée ici, avec son cas d'espèce.

### 1.3 La règle du suspendu

> **Suspendu = 100 % du poids de corps daté. Dès qu'un appui touche le sol = zéro.**

| Catégorie | Traitement | Séries |
|---|---|---|
| Suspendu (tractions, dips, relevés suspendus, L-sit) | charge = poids de corps interpolé à la date | **534** |
| Lesté (tractions lestées, élastique) | poids de corps + lest | 3 |
| Appui au sol (planche, pompes, gainage, crunch, hyperextension) | pas de charge | ~2 000 |
| Cardio / endurance | pas de charge, hors modélisation | ~400 |

Poids de corps daté : 113 pesées entre le 25/01/2023 et le 18/03/2026, de 84,5 à 98,55 kg. Interpolation linéaire entre les deux pesées encadrantes, report de la dernière valeur connue au-delà. **Valeur figée à 97,4 kg** pour toute la période postérieure au 18/03/2026 ; une nouvelle pesée déclenche le recalcul.

**Péremption.** Le report est sûr sur quelques semaines, faux sur un an — une recomposition sans pesée fait dériver silencieusement tout le tonnage des mouvements suspendus.

> **Au-delà de 3 mois sans pesée, l'app le signale une fois, sans insister, et marque les charges suspendues de cette période comme approximatives.**

Registre descriptif : *« Ta dernière pesée date de mars. Les tractions sont comptées à 97,4 kg depuis. »* Aucune relance répétée, aucun blocage.

Effet mesuré de cette règle : le fichier de travail passe de 12 532 à **14 245 séries**, et le tonnage de 6 887 à **7 367 tonnes**. 480 tonnes étaient invisibles — les tractions à 97,4 kg × 5 sont parmi les séries les plus lourdes de l'historique et n'apparaissaient nulle part.

### 1.4 Le critère de classement est la charge, jamais le lieu

> **Une séance charge du muscle, ou non. Ça se déduit des exercices.**

| Type | Visible au journal | Compte dans les statistiques d'entraînement |
|---|---|---|
| Musculation (charge + séries + reps) | ✅ | ✅ |
| Poids de corps suspendu | ✅ | ✅ |
| Poids de corps au sol | ✅ | ✅ séance, ❌ tonnage |
| Cardio / endurance | ✅ | ❌ |

Des tractions faites à la maison sont de la musculation. Un tapis roulant en salle n'en est pas. Compter la natation dans « 20 séances / 28 jours » diluerait la règle de volume et le compteur de stagnation avec des activités qui ne chargent rien.

---

## 2. Les trois étages de la donnée

| Étage | Contenu | Règle |
|---|---|---|
| **Observé** | ce que l'utilisateur a saisi | jamais recalculé, jamais réécrit |
| **Déduit** | palier, format, pas de salle, seuil de stagnation, modèle | recalculable à tout moment, écrit en append-only |
| **Affirmé** | ce que l'app a dit ou proposé | immuable, horodaté, versionné |

L'étage « affirmé » est la table `predictions` du schéma v2. Chaque estimation produite par un module s'y écrit avec sa date, son module d'origine et sa version, pour être comparée plus tard à ce qui s'est réellement produit. C'est ce qui a manqué à la v1 : personne ne savait que les 4035 kcal, le mur de rouge et les ratios « Critique » étaient faux avant la vérification sur device.

---

# PARTIE B — LIRE UNE SÉANCE-EXERCICE

## 3. Le profil de série

Pour une séance et un exercice donnés, le **profil** est la liste des répétitions des séries au palier, **dans l'ordre réel d'exécution**.

Exemple, couché du 22/08/2026 à 122,5 kg : profil `[5, 4, 4, 3]`.

### 3.1 Comparaison rang par rang, jamais en total

Le total de reps est **interdit** comme critère de progrès. Il confond deux choses différentes : faire moins de reps, et faire moins de séries.

| Séance | S1 | S2 | S3 | S4 | Total |
|---|---|---|---|---|---|
| 04/08 | 4 | 4 | 3 | 3 | 14 |
| 12/08 | 3 | 4 | 3 | — | 10 |
| 22/08 | **5** | 4 | **4** | 3 | 16 |

Le total du 12/08 suggère un effondrement. En réalité seule la 4ᵉ série est absente. Rang par rang, la baisse porte sur la seule série 1.

> **Une série absente est absente, pas une régression.** La comparaison ne porte que sur les rangs présents dans les deux séances.

---

## 4. Types de séries

| Type | Compte dans le palier | Compte dans le tonnage | Compte dans le modèle |
|---|---|---|---|
| **Échauffement** | ❌ | ❌ | ❌ |
| **Travail** | ✅ | ✅ | ✅ |
| **Dégressive** | ❌ | ✅ | ❌ |
| **Ratée** | ❌ | ✅ | ✅ (série à l'échec = information) |
| **Exploration** | ❌ (voir §7) | ✅ | ✅ |

Le type est **saisi**, pas déduit : l'écran de saisie permet de le changer en tapant le numéro de série. Répartition réelle dans l'historique importé : 15 465 séries normales, **1 027 échauffements**, 153 dégressives, 59 ratées.

**L'app v2 conserve le type « échauffement ».** Une spec antérieure affirmait qu'il n'existait aucune série de chauffe dans les données — c'était faux (§21.4). Le supprimer aurait pollué tous les records et toutes les médianes.

Le **contenu** de l'échauffement (combien de séries, à quelle charge) relève du chantier coaching, pas de ce document.

> ✅ **Arbitré le 11/09/2026 — le tableau ci-dessus fait foi, le banc avait un trou.**
> `banc_etage1.py` n'écartait que `warmup` et `dropset` : une série **ratée** entrait donc
> dans les séries de travail et **votait** pour le palier. Mesuré sur les 97 séance-exercices
> qui en contiennent une : **93 ont cet échec au-dessus de la plus lourde série de travail** —
> c'est la définition d'un échec, on charge plus que ce qu'on tient (§6.4 le mesure à 105 %).
> Le laisser voter remontait le palier au-dessus de la réalité de façon systématique.
> Cas réel du 28/08/2026, développé militaire haltère : `92×1, [ratée] 100×0, 92×1` rendait
> « palier 100 × 0 » — l'app affirmait qu'on avait tenu 100 kg le jour de l'échec à 100 kg.
> **Coût mesuré de la correction : 0,1 point de taux de reconnaissance au plus**, sur les cinq
> profils. Corrigé dans `v2/banc/banc_etage1.py` et dans `v2/js/palier.js`.

---

### 4.1 La chauffe non taguée — trou mesuré

Le tag existe, mais il n'est pas systématique. Mesuré sur l'historique importé :

| | Part des séance-exercices |
|---|---|
| Au moins une série taguée chauffe | **14,2 %** (28,0 % sur les 12 derniers mois) |
| Squat barre | 60,0 % |
| Développé couché barre | 73,6 % |
| Soulevé de terre barre | 83,8 % |
| Hack squat machine | 41,9 % |

Sur les **2 960 séance-exercices sans aucune chauffe taguée** et ayant au moins trois séries, **9,9 % commencent par une série à 75 % ou moins de la charge la plus lourde**. C'est une série d'échauffement enregistrée comme série de travail. Squat barre, presse à cuisses, adduction et abduction hanche en tête.

Ces séries polluent trois choses : la médiane de charge de travail, le décompte du palier, et le compte de reps de référence du §6.

> **Règle : une série de travail dont la charge est ≤ 75 % de la plus lourde de la séance-exercice, et située avant la première série au palier, est marquée `chauffe_probable`. Elle est écartée du palier et des médianes, conservée dans le tonnage, et affichée avec un tap de correction.**

Le seuil de 75 % est un **choix produit**, pas un résultat mesuré. Il est placé nettement en dessous de l'écart typique d'une montée en charge (un cran, soit 2 à 5 %) pour ne jamais confondre les deux.

**Ceci ne remplace pas le tag.** Une série taguée est traitée par son tag, toujours. La détection ne s'applique qu'en son absence.

> ⚠️ **Réserve signalée le 11/09/2026, non corrigée — les charges NÉGATIVES.** Le catalogue
> en contient : une assistance se note en négatif (muscle up assisté, tirage assisté),
> **42 séance-exercices sur 6 385, six exercices**. Sur elles, « ≤ 75 % de la plus lourde »
> ne veut rien dire : avec −30 comme plus lourde, le seuil vaut −22,5, et toute charge plus
> négative — c'est-à-dire **plus assistée, donc plus facile** — passe sous le seuil, mais une
> charge moins assistée aussi selon l'ordre. Le banc Python a le même défaut ; le portage le
> reproduit fidèlement. À traiter quand l'assistance aura un chantier — la règle devra
> raisonner sur la difficulté, pas sur le signe de la charge.

---

## 5. La montée en charge — propriété mesurée par exercice

### 5.1 Le constat

Sur 3 414 séance-exercices ayant au moins trois séries de travail, triées par rang :

| Motif | Part |
|---|---|
| 1ʳᵉ série plus légère que les suivantes (**montée**) | **47,0 %** |
| Dernière série plus légère (**descente**) | 15,0 % |
| Toutes les séries à charge identique (**plat**) | 44,7 % |

47 % en moyenne, donc aucune règle globale n'est défendable. Mais la moyenne cache l'essentiel : **la fréquence va de 0 % à 91 % selon l'exercice**, et le clivage n'est pas aléatoire.

| Exercice | n séances | Montée |
|---|---|---|
| Hip thrust machine | 32 | 91 % |
| Presse à cuisses | 63 | 87 % |
| Hack squat | 37 | 84 % |
| Squat barre | 102 | 75 % |
| Soulevé de terre barre | 64 | 73 % |
| Développé couché barre | 112 | 66 % |
| Extension jambes | 104 | 61 % |
| *— frontière —* | | |
| Développé couché haltère | 135 | 50 % |
| Extension triceps poulie | 102 | 36 % |
| Développé militaire barre | 102 | 24 % |
| Élévation latérale haltère | 187 | 19 % |
| Curl biceps haltère | 51 | 8 % |
| Écarté haltère | 127 | 6 % |
| Élévation frontale haltère | 122 | 2 % |
| Rowing debout barre | 55 | 0 % |

**Lecture :** gros mouvements et machines lourdes → montée quasi systématique. Isolations légères → charge posée et gardée (l'élévation frontale haltère est plate 96 % du temps).

### 5.2 Règle

> **La montée en charge est une propriété mesurée par exercice, au même titre que le modèle charge/reps. Seuil : 8 séances sur cet exercice avant de conclure. En dessous, aucune hypothèse.**

Trois états possibles par exercice :

| État | Condition | Conséquence sur le palier |
|---|---|---|
| **Monte** | ≥ 60 % des séances | la 1ʳᵉ série n'est pas retenue pour juger le palier |
| **Indéterminé** | 35 – 60 %, ou moins de 8 séances | toutes les séries sont retenues, comportement par défaut |
| **Ne monte pas** | ≤ 35 % | toutes les séries sont retenues |

Les seuils 35 / 60 sont un **choix produit**, pas un résultat mesuré : la distribution est continue, pas bimodale. Ils sont placés là où l'erreur est symétrique, et ils sont paramétrables.

### 5.3 Couverture

66 exercices sur 114 atteignent 8 séances, ce qui couvre **97,0 % des séries de travail**. Les 48 exercices restants sont des essais uniques ou des variantes abandonnées : ils restent en état « indéterminé » sans jamais bloquer quoi que ce soit.

### 5.4 La rampe — nommer la chose

La série de montée qui reste **au-dessus** du seuil de chauffe probable du §4.1 porte désormais un nom dans le projet : c'est une **rampe**. La séance qui en contient une est un **palier avec rampe**.

Le nom a été choisi parce qu'il ne ressemble à aucun terme de salle existant : aucun risque de le confondre avec l'échauffement, contrairement à « série d'approche » qui avait été envisagé.

> **Une rampe est une série de travail entière.** Elle compte dans le volume, dans le tonnage, dans l'historique, et elle s'affiche sans aucune marque particulière. La seule chose qu'elle ne fait pas, c'est servir à juger le palier du jour.

Le mot « écartée » employé dans les versions précédentes était faux dans son ampleur : il laissait entendre qu'on jetait la série, alors qu'on se contente de ne pas la faire voter.

**Où elle se produit vraiment — et la montée du §5.1 n'est pas la même mesure.** Le §5.1 compte toutes les premières séries plus légères, sans distinguer leur distance au palier. La rampe ne retient que celles qui en restent proches. La différence est nette :

| Exercice | Séances avec rampe | Séances en chauffe probable (≤ 75 %) |
|---|---|---|
| Adduction hanche | **75 %** | 8 |
| Abduction hanche | **70 %** | 4 |
| Hip thrust machine | 47 % | 11 |
| Développé couché barre | 38 % | 20 |
| Squat barre | 27 % | **38** |
| Développé couché haltère | 20 % | 2 |

Sur le squat, la première série est presque toujours très en dessous du palier : c'est une vraie montée en charge. Sur les machines d'adduction, elle est à 88-90 % : c'est une rampe. **Deux gestes différents derrière une seule statistique**, et c'est la raison pour laquelle le §5.1 seul ne suffisait pas.

### 5.5 La rampe et la fraîcheur

Objection soulevée en séance, et elle est juste : quand une rampe précède le palier, la première série au palier est en réalité la **deuxième série de travail**. Elle n'est pas comparable à une séance attaquée directement au palier.

Mais neutraliser toute séance avec rampe gèlerait l'adduction hanche, où elles représentent trois séances sur quatre.

> **Une séance en palier avec rampe n'est neutralisée que si l'exercice est en état « ne monte pas » (§5.2). Elle ne compte alors ni comme validation pour monter, ni comme séance de stagnation. Dans les états « monte » et « indéterminé », elle est jugée normalement.**

La logique : on ne neutralise pas la rampe, on neutralise **l'exception**. Quand la rampe est l'habitude, toutes les séances ont la même forme et se comparent entre elles sans biais. Quand elle survient sur un exercice où elle n'arrive jamais, cette séance-là est l'intruse.

**Coût mesuré** sur les 3 461 séance-exercices de l'historique :

| État de l'exercice | Séance-exercices | Dont avec rampe | Neutralisées |
|---|---|---|---|
| Monte | 1 396 | 441 | 0 |
| Indéterminé | 961 | 160 | 0 |
| **Ne monte pas** | 1 104 | **37** | **37** |

**37 séances sur 3 461, soit 1,1 %.** Le garde-fou attrape le cas rare sans rien geler. La version naïve — neutraliser toute séance avec rampe — en aurait neutralisé 638, soit 18,4 % de l'historique, et aurait rendu l'adduction hanche incapable de progresser.

---

## 6. La descente de fin — trois mécanismes, et un tag qui en tranche deux

### 6.1 Le constat

Deux exercices font l'inverse de la montée : **rowing assis machine, 65 % de descente** ; **tirage poitrine machine, 60 %**. Une règle qui ne regarderait que la première série casserait sur eux.

Mais « la dernière série est plus légère » recouvre **trois** choses différentes :

1. **Une descente choisie** — alléger pour finir le compte de séries prévu.
2. **Une descente subie** — la fatigue, l'échec sur la série précédente.
3. **Un dégressif** — technique d'intensité assumée : on allège franchement et on repart à l'échec immédiatement.

Les deux premières doivent être séparées par déduction. **La troisième est déclarée par l'utilisateur** et n'a aucun besoin d'être devinée — encore faut-il l'écouter, ce que la v1 de cette règle ne faisait pas (§6.4).

### 6.2 Le signe discriminant

Vérifié sur les **510 cas** où la dernière série redescend en charge :

| | Part |
|---|---|
| La dernière **retrouve** le compte de reps visé → descente choisie | **83,1 %** |
| La dernière reste **sous** le compte → fatigue | 16,9 % |
| dont l'avant-dernière avait déjà raté le compte | 11,4 % |

Par exercice, les deux extrêmes sont nets :

| Exercice | n | Tient les reps | Avant-dernière ratée |
|---|---|---|---|
| **Rowing assis machine** | 71 | **97 %** | **3 %** |
| Tirage poitrine machine | 45 | 84 % | 27 % |
| Rowing poulie assis | 32 | 78 % | 28 % |
| Extension jambes | 24 | 79 % | 12 % |
| Squat barre | 28 | 79 % | 54 % |
| Adduction hanche | 34 | 76 % | 53 % |
| **Abduction hanche** | 31 | **58 %** | **84 %** |

Le rowing assis machine est le cas pur : descente entièrement planifiée, rien de subi. L'abduction hanche est l'inverse : dans 84 % des cas l'avant-dernière avait déjà raté le compte, la descente est une réaction à un échec réel.

### 6.3 Règle

> **Le tag prime sur la déduction.** Une série taguée `degressive` est une descente **choisie**, par déclaration. Une série taguée `echec` est une descente **subie**, par déclaration. Dans les deux cas, aucune inférence n'est appliquée.
>
> **Pour les séries non taguées seulement :** quand la dernière série redescend en charge, l'app regarde l'avant-dernière. Si l'avant-dernière a tenu le compte de reps, la descente est un choix : elle n'est pas retenue pour juger le palier. Sinon, c'est un signal de fatigue et elle est conservée.

### 6.4 Pourquoi le tag doit primer — la mesure

La v1 de cette règle appliquait la déduction à **toutes** les descentes finales, y compris celles que l'utilisateur avait explicitement étiquetées. Résultat mesuré sur 543 descentes finales :

| Dernière série | n | Classées « fatigue » par déduction |
|---|---|---|
| Non taguée | 428 | 9,1 % |
| **Taguée `degressive`** | 113 | **25,7 %** |
| Taguée `echec` | 2 | 100 % *(correct)* |

**29 dégressifs assumés étaient classés en fatigue.** Un sur quatre.

Le mécanisme de l'erreur : un dégressif part bas — médiane **61,6 %** de la charge la plus lourde — et il va à l'échec. Le compte de reps y est donc naturellement inférieur à celui de la série précédente, ce que la déduction lit comme un échec subi.

**Cas réel, séance du 24/08/2026, extension jambes :** `59×15, 59×15, 32×8 [dégressif]`. Compte de référence 15, réalisé 8 → la v1 concluait « fatigue » sur un dégressif volontaire.

**Les deux tags décrivent des gestes opposés, et la base le confirme :**

| Tag | n | Charge médiane / plus lourde du jour | Reps moyennes |
|---|---|---|---|
| `degressive` | 153 | **61,6 %** | 10,5 |
| `echec` | 55 | **105,0 %** | 6,4 |

Le dégressif est nettement plus léger, l'échec est à la charge maximale ou au-dessus. Aucune ambiguïté possible entre les deux, et aucune raison de les deviner.

C'est le **miroir exact du §4.1** : là-bas le tag de chauffe était absent 86 % du temps, il fallait donc déduire. Ici le tag existe et il est fiable — le défaut n'était pas de mal déduire, c'était de déduire alors qu'on savait déjà.

### 6.5 Le compte de reps de référence — interaction avec le §5

Écrit naïvement, « le compte visé = le maximum des séries précédentes » se casse sur les exercices qui montent en charge : la série légère du début fait souvent **plus** de reps que les séries au palier, et elle gonfle la cible.

Mesuré : sur 619 descentes finales, **29 cas, soit 4,7 %, sont classés « fatigue » alors que la descente était choisie**, uniquement à cause de la série de montée.

> **Le compte de reps de référence est le maximum atteint sur les séries **au palier** de la séance-exercice. Les séries de montée (§5), de chauffe (§4) et de chauffe probable (§4.1) en sont exclues avant tout calcul.**

C'est le miroir exact de l'erreur du §1.2 : dans les deux cas, une forme identique en surface recouvre deux mécanismes opposés, et seule la lecture ordonnée les sépare.

---

## 7. Le palier

### 7.1 Le problème

Une séance-exercice sur trois n'a qu'**une seule série** à la charge la plus lourde. Ce sont des **explorations** : on tente le poids du dessus pour voir, sans intention de le tenir. Prendre la charge maximale comme palier fait dire à l'app qu'on est à un palier jamais tenu.

### 7.2 Définition

> **Le palier est la charge la plus lourde tenue sur la majorité des séries de travail de la séance, avec un plancher de 3 séries.**
>
> Formellement : `k ≥ min(3, arrondi_sup(n/2))` où `n` = nombre de séries de travail retenues et `k` = nombre de séries à cette charge.

| Séries de travail | Séries requises au palier |
|---|---|
| 2 | 1 |
| 3 | 2 |
| 4 | 2 |
| 5 et plus | 3 |

Mesuré sur les 3 675 séance-exercices : la règle « 3 séries minimum » reconnaît un palier dans 45,7 % des séances, la majorité pure dans 62,9 %, la **majorité avec plancher à 3 dans 63,9 %**. C'est la seule des trois qui ne dégrade aucune tranche.

### 7.3 L'ordre de calcul — une circularité à trancher

Le §4.1 situe la chauffe probable **avant la première série au palier**. Mais le palier se calcule ici **après** exclusion de la chauffe probable. Chacun a besoin de l'autre : appliqués naïvement, les deux tournent en rond.

> **Résolution en deux passes.** Passe 1 : un palier *provisoire* se calcule sur les séries brutes, à seule fin de situer la frontière de chauffe. Passe 2 : le palier *définitif* se calcule après application des §4.1, §5 et §6.

Le palier provisoire ne sort jamais de ce calcul — il n'est ni affiché, ni stocké, ni comparé. C'est un choix d'implémentation, pas une propriété du modèle : une autre résolution est concevable, mais elle doit être explicite, sans quoi deux développeurs produiront deux paliers différents sur la même séance.

Vérifié au banc : un palier est reconnu sur **93 à 98 %** des séance-exercices selon le profil, sans casse hors du profil d'Aurélien.

### 7.4 Ce qui entre dans `n`

Les séries non retenues par les §5 et §6 ne comptent **ni au numérateur ni au dénominateur** de ce calcul.

**Nuance à ne pas perdre :** contrairement aux séries de chauffe, ce sont des séries de travail entières partout ailleurs — volume, tonnage, historique, affichage. Elles ne votent pas pour le palier, c'est tout. Le §5.4 explique pourquoi cette distinction n'est pas cosmétique.

Exemple, soulevé hex du 21/08/2026 : chauffe `60×10, 100×5`, travail `120×10, 130×10, 130×10, 130×10`. L'exercice est en état « monte » (73 %), donc la série à 120 — une rampe — n'est pas retenue. Reste `n = 3`, `k = 3` à 130 kg. **Palier 130, tenu.**

Sans cette règle, `n = 4` et `k = 3` — le palier était déjà reconnu ici, mais il ne l'aurait pas été sur une séance à cinq séries dont deux de montée.

### 7.5 L'exploration

Toute série plus lourde que le palier est enregistrée comme **exploration**. Elle est conservée, affichée, elle nourrit l'estimation du maximum — mais elle **ne valide rien**.

---

## 8. Le format

### 8.1 Le constat

Un même exercice est travaillé dans deux formats différents qui ne se comparent pas. Sur les douze derniers mois :

| Exercice | Séances courtes (≤ 6 reps) | Séances longues (≥ 9 reps) | Écart |
|---|---|---|---|
| Développé couché barre | 57 séances @ **110 kg** médian | 11 séances @ **90 kg** | **20 kg** |
| Squat barre | 38 @ 110 kg | 6 @ 90 kg | 20 kg |
| Soulevé de terre barre | 42 @ 135 kg | 2 @ 115 kg | 20 kg |
| Développé militaire barre | 24 @ 60 kg | 3 @ 45 kg | 15 kg |

Vingt kilos d'écart. Un compteur de stagnation qui mélange les deux verra une chute de charge là où il y a simplement changement de format, et un palier qui ne se valide jamais.

### 8.2 Règle

> **Le palier, le compteur de stagnation et le modèle charge/reps travaillent par exercice ET par format. Le format se déduit des reps médianes de la séance ; il ne se stocke pas comme un champ de configuration.**

| Format | Reps médianes de la séance-exercice |
|---|---|
| Force | ≤ 6 |
| Mixte | 7 – 8 |
| Hypertrophie | ≥ 9 |

Une séance-exercice se compare aux séances **du même format** sur le même exercice. Les autres sont ignorées, pas traitées comme des régressions.

### 8.3 Pourquoi le format ne se stocke pas

Le stocker imposerait de le demander, ce qui viole la règle §1.1, et il changerait sans que personne ne le mette à jour. Le déduire coûte une médiane et se corrige tout seul.

### 8.4 Chaque variante est un exercice à part entière

> **Une variante n'hérite de rien de son exercice parent. Elle a son propre palier, son propre compteur, son propre modèle.**

Le squat avec pause n'est pas un squat allégé : c'est un exercice dont le max est structurellement plus bas. Dans l'historique, 10 séances entre février et mai 2026, max **100 kg**, contre **145 kg** au squat barre. Les traiter comme un seul exercice ferait lire une chute de 45 kg.

Le champ `parent` du catalogue sert à l'affichage et au regroupement musculaire, **jamais** au calcul du palier ni du modèle.

### 8.5 Le profil de travail déclaré — l'exception au §1.1

Le §8.3 refuse de stocker le format, et ce refus tient. Mais il laisse un trou :
**au jour zéro, il n'y a rien à déduire.** Un utilisateur qui installe l'app n'a
aucune séance, donc aucune reps médiane, donc aucun format.

Il faut distinguer deux objets qui portent des noms voisins :

| Objet | Nature | Où il vit |
|---|---|---|
| **Format** d'une séance-exercice | Déduit des reps médianes (§8.2) | Nulle part, recalculé |
| **Profil de travail** de la personne | Déclaré | `profiles`, avec sa date |

> **Le profil de travail est déclaré par l'utilisateur à l'inscription. Il ne
> décide jamais du format d'une séance passée : il autorise ou interdit au moteur
> de proposer une zone de reps sur un exercice sans historique.**

Il ouvre ou ferme une porte, il ne module pas la suggestion. Quelqu'un qui ne fait
jamais de séries lourdes ne se verra pas proposer du cinq reps sur un exercice
qu'il découvre.

*Ce n'est pas une idée neuve* : la fenêtre muette du référentiel applique déjà
cette distinction sous un autre nom — elle ne vaut que pour les exercices où la
personne fait au moins une série à 3 reps ou moins dans tout son historique. Le
profil déclaré est la version disponible **avant** que cet historique existe.

**8.5.1 — La question posée.** L'étiquette seule (« force », « hypertrophie »)
trie les gens selon ce qu'ils ont lu, pas selon ce qu'ils font. Elle
s'accompagne d'une ou deux lignes disant ce que ça implique en charges, reps et
séries.

**8.5.2 — L'observation le remplace, exercice par exercice**, au seuil habituel de
8 séances. En dessous, la déclaration sert d'amorce. Au-dessus, elle est ignorée
pour cet exercice. La péremption n'est donc pas globale : le squat basculera sur
l'observation bien avant l'élévation latérale, ce qui est le bon comportement.

**8.5.3 — Un changement déclaré reprend la main.** L'utilisateur peut changer son
profil à tout moment ; la déclaration porte une date, et le moteur ne lit plus que
les séances postérieures pour juger de la zone acceptée. L'ancien historique reste
entier pour les paliers et les charges — **aucune donnée n'est perdue** — mais il
ne vote plus.

Sans cette règle, le réglage serait un bouton qui ne fait rien : quelqu'un avec
trois mois d'hypertrophie derrière lui basculerait sur « force » et ne verrait
rien changer.

> **Principe. Le profil de départ est une amorce que l'observation remplace. Un
> changement de profil est une intention explicite, et une intention datée bat une
> observation antérieure à sa date.**

---

# PARTIE C — DÉCIDER

## 9. Validation d'un palier

### 9.1 La cible — une consigne, pas une prévision

> **La cible n'essaie pas de deviner ce qui sera fait. Elle dit quoi faire.** Double progression au sens strict, deux états et rien d'autre :
>
> 1. **Palier non tenu** → même charge, cible = reps du dernier passage **+ 1**.
> 2. **Palier tenu au haut de la fourchette** → charge **+ 1 incrément** (§10), cible = **bas de la fourchette**.

### 9.1.1 La fourchette n'est pas le format

Le format (§8) se **déduit** d'une séance passée pour savoir à quoi la comparer. La fourchette **prescrit** une séance future. Ce sont deux objets distincts, et les confondre casse le moteur de deux façons :

- Un format déduit `mixte` couvre 7 à 8 reps. Une fourchette enfermée dans cette borne n'a qu'une rep de battement — mesuré, **78 % des séances mixtes valideraient dès leur première occurrence**, soit une montée de charge quasi systématique.
- À l'inverse, monter jusqu'au haut d'une fourchette fait franchir la frontière du format. Le moteur changerait silencieusement de référentiel de comparaison au moment même où il demande l'effort.

> **La fourchette est attachée au profil de travail déclaré (§8.5), pas au format déduit.** Le format sert à lire le passé, la fourchette à écrire la consigne suivante.

### 9.1.2 La largeur de la fourchette — ce qu'elle ne décide pas, et ce qu'elle décide

C'est le point qui a coûté une journée entière de calibration inutile, et il doit être écrit en tête du chapitre.

Le haut de la fourchette **n'est pas observable dans l'historique** : sur 1 542 montées de charge des cinq profils, le compte de reps qui précède une montée est identique à celui qui précède une séance ordinaire (10 contre 10 en hypertrophie, 5 contre 5 en force). Personne n'a jamais pratiqué la double progression dans ces données, aucun outil ne le leur ayant demandé. Trois campagnes de calibration ont ensuite échoué sur le même mur : les reps sont **un nombre choisi**, concentré sur sa médiane (53 à 85 % des séances y tombent exactement, 2 à 5 % à médiane+1), de sorte que tout seuil saute de « déclenche presque toujours » à « déclenche presque jamais » avec une rep d'écart.

> **La fourchette s'autorégule, donc sa largeur ne peut pas bloquer le système.** Trop large : une séance de plus pour atteindre le haut, mais une rep gagnée à chaque passage — la progression a lieu quand même. Trop étroite : la charge monte plus vite, et si elle monte trop vite le haut n'est plus tenu, donc le palier reste. **Aucune valeur ne peut enrayer la mécanique.** Chercher la largeur *exacte* est donc une erreur de conception.

**Mais elle n'est pas libre pour autant — nuance essentielle.** La largeur ne décide pas *si* on progresse, elle décide **comment** : fourchette large, la progression passe surtout par les reps ; fourchette étroite, surtout par la charge.

Or les deux ne sont pas équivalents selon l'objectif. En hypertrophie ils le sont — Schoenfeld et al. (2017, 21 études) montrent une croissance équivalente sur une large gamme de charges, dès lors que les séries sont proches de l'échec. En force, non : **la force est spécifique à la charge travaillée.** Gagner des reps à 100 kg ne rend pas fort à 140.

Mesuré sur les cinq profils, la répartition va dans le mauvais sens :

| Format | Progrès en charge | Progrès en reps | Part de la charge |
|---|---|---|---|
| Force | 98 | 169 | **37 %** |
| Mixte | 110 | 99 | 53 % |
| Hypertrophie | 534 | 667 | 44 % |

En format force, **un progrès sur trois seulement passe par la charge** — moins qu'en hypertrophie, alors que c'est le format où elle compte le plus.

> **La largeur de la fourchette est le levier de l'objectif, et elle suit le nombre de reps — pas une étiquette déclarée.**

| Zone (médiane observée sur le couple) | Fourchette | Nature du travail | Appui |
|---|---|---|---|
| **1-2** | **pas de progression en reps** | effort maximal | NSCA — effort unique 1-2 reps |
| **3-5** | bas + 2 | force | NSCA ; Schoenfeld 2021 : la zone 1-5 bat le 8-12 pour le 1RM |
| **6-8** | bas + 3 | charnière force/hypertrophie | charnière des deux zones NSCA |
| **9-12** | bas + 4 | hypertrophie | zone canonique ; les deux voies se valent |
| **13-15** | bas + 3 | hypertrophie légère, isolation | transition |
| **16+** | bas + 2, **plafond à 20** | endurance musculaire, entretien | NSCA — endurance au-delà de 12-15 |

**La courbe est en cloche** : large au milieu, étroite aux deux bouts. C'est au milieu que gagner une rep a le plus de valeur. À 3 reps, une rep de plus vaut +33 % de travail sur la série ; à 16, elle vaut +6 % et coûte du temps.

**Deux règles de bord.**

> **Sous 3 reps, le moteur ne demande jamais une rep de plus.** Il propose le plus petit incrément de charge disponible, rien d'autre. La variabilité journalière de ±18 % (Jovanovic & Flanagan 2014) dépasse l'écart entre une rep et deux : prescrire « une de plus » sur un simple lourd revient à demander un record à chaque séance.

> **Au-delà de 20 reps, la fourchette se ferme.** On ne propose plus d'allonger, on propose de charger. Sinon quelqu'un à 25 reps aux mollets se verrait proposer 29.

**La zone appartient au couple exercice-format, pas à la personne.** C'est le point le plus important du tableau, et il est contre-intuitif : ce n'est pas le powerlifter qui vit à 3-5 reps et le pratiquant loisir à 15+. **Le powerlifter couvre le spectre le plus large** — maximaux à 1-3, force à 3-5, accessoires à 8-12, élévations latérales et gainage à 15+. Une pratique orientée hypertrophie en couvre moins ; une pratique d'entretien reste sur une bande étroite autour de 10-15.

> Un même utilisateur a donc, **le même jour**, un squat en fourchette 3-5 et des élévations latérales en 16-18. Le moteur le gère sans rien demander, puisque la médiane est déjà calculée par couple (exercice, format). Une largeur attachée au profil de travail déclaré aurait imposé la même valeur à tous ses exercices — c'était l'erreur de la première rédaction de ce paragraphe.

Le bas de la fourchette reste la **médiane de reps observée sur le couple** : le moteur ne demande jamais moins que l'habitude. Aucune de ces valeurs n'a besoin d'être exacte — l'autorégulation reste entière, seule l'orientation du progrès change.

**Mesure de contexte.** Répartition des couples exercice-format des cinq profils par zone : 1-2 reps **0,4 %** · 3-5 **2,2 %** · 6-7 **3,1 %** · 8-12 **65,2 %** · 13-15 **15,4 %** · 16+ **13,7 %**. La zone force est marginale dans cette base — les bornes basses viennent donc de la pratique du coaching, pas de la mesure, et sont à revoir si des profils de force arrivent. La zone haute, elle, représente **29 % du travail réel** et était mal servie par la version précédente, qui l'aurait élargie au lieu de la resserrer.

### 9.1.3 Les deux garde-fous

Ce sont les deux seuls résultats de calibration qui ont survécu à la mesure, et ils ne portent pas sur la fourchette mais sur le droit de proposer une montée.

> **Garde-fou 1 — ne jamais proposer de monter si la charge courante n'est pas au record de l'exercice.**

Mesuré : **une montée de charge sur deux chez le profil le plus assidu (51 %) est un retour à une charge déjà utilisée**, pas un record — oscillation, pas progression (Jordan 44 %, Léa 39 %, Alexis 30 %, Mélodie 24 %). Proposer une montée en pleine oscillation revient à pousser dans le vide.

Ce garde-fou a un effet mesuré sur le résultat, pas seulement sur la logique. Conjugué au signal de dépassement, il porte le taux de montées qui **tiennent** (charge réutilisée dans les trois séances suivantes) à 80-92 % selon le profil, contre 70-77 % pour les montées spontanées des mêmes personnes. Et sur 210 séances où il aurait parlé sans être suivi, la personne est montée quand même **deux séances plus tard dans 72 cas** — un tiers des occasions étaient simplement en retard.

> **Garde-fou 2 — quand rien ne dépasse, l'ancienneté du palier prend le relais.**

Un dépassement spontané (une série au-delà de la médiane) est une information involontaire, donc riche. Mais certains profils ne dépassent jamais : Léa tombe pile sur son plan 85 % du temps, et le signal n'existe pas chez elle — la règle de dépassement ne parlait que sur 1 % de ses séances. Le repli est **le plan tenu à la même charge depuis trois séances**, qui la fait passer à 25 % de séances couvertes avec 30 occasions rattrapées.

**Hiérarchie, pas fusion.** Fusionner les deux dégrade le résultat (86 % → 80 % sur le profil assidu). Le repli ne s'active que lorsque le signal de dépassement s'est taise depuis un nombre de séances à calibrer.

**Ce seuil de bascule est le seul paramètre de niveau qui reste** — et il ne se règle pas sur la personne. Vérifié en regroupant 192 exercices des cinq profils par vitesse de progression : le signal de dépassement tient 88 % dans les deux terciles supérieurs, indépendamment de la vitesse, ce qui rejoint Nuzzo et al. (2024) — le statut d'entraînement ne module pas le rapport reps/%1RM. Le niveau doit changer **l'incrément**, que le §10.1 déduit déjà du pas de salle observé, pas le déclencheur.

### 9.1.4 Ce qui change quand l'app prescrit — tranché le 10/09/2026

Les garde-fous du §9.1.3 ont été calibrés sur des données produites **sans aucune consigne**. Le dépassement spontané y existe parce que personne ne recevait de nombre à atteindre. Dès que l'app affiche une cible, l'utilisateur tombera dessus — comme lea, à 85 % — et ce signal disparaîtra.

**Le dilemme était mal posé.** Le dépassement n'est pas un signal à préserver : c'est un **substitut**. Faute de savoir si la personne avait atteint une cible, on regardait si elle dépassait son habitude. Une fois la cible affichée, le détour n'a plus lieu d'être — le moteur sait si les 6 reps demandées ont été faites.

> **Sous prescription, la règle principale est la double progression elle-même (§9.1) : cible atteinte au haut de la fourchette → montée.** Aucun proxy.

Rôle de chaque pièce après cette bascule :

| Pièce | Statut sous prescription |
|---|---|
| Double progression (§9.1) | **règle principale** |
| Garde-fou 1 — au record de charge (§9.1.3) | **conservé** ; ne dépend d'aucune consigne, empêche de pousser en pleine oscillation |
| Garde-fou 2 — ancienneté du palier (§9.1.3) | **repli**, pour qui n'atteint jamais la cible (cas de lea aujourd'hui) |
| Dépassement ≥ médiane+1 (§9.1.3) | **transition uniquement** — s'applique aux exercices dont l'historique est importé et non encore prescrit |

Cette dernière ligne est ce qui permet au moteur de ne pas démarrer muet chez quelqu'un qui arrive avec trois ans de Hevy : il exploite l'historique libre jusqu'à ce que des séances prescrites prennent le relais, exercice par exercice.

**Ce qui reste à vérifier sur les premières données réelles.** La bascule suppose que la cible sera atteinte assez souvent pour faire avancer la double progression. Si les cibles sont manquées bien plus souvent que prévu, c'est la fourchette (§9.1.2) qu'il faudra revoir, pas la règle. **Les premières semaines d'usage sont un test, pas une mise en service.**

### 9.2 Règle

> **Les deux premières séries atteignent la cible. Les suivantes sont tolérées à −1 rep.**

Cible 5 :

| Profil | Verdict | Raison |
|---|---|---|
| `5-5-5-5` | ✅ valide | plateau plat |
| `5-5-4-4` | ✅ valide | 2 premières à la cible, reste à −1 |
| `5-5-4` | ✅ valide | idem, 3 séries |
| `5-4-4-3` | ❌ pas encore | 2ᵉ série sous la cible |
| `5-3-3-3` | ❌ pas encore | 2ᵉ série à −2 |

Les séries 1 et 2 sont les moins fatiguées, donc les plus représentatives de la maîtrise réelle. Une descente au-delà est une courbe de fatigue normale, pas un défaut de maîtrise.

**Le rang se compte après application des §5 et §6.** Sur un exercice qui monte en charge, la « première série » est la première série au palier, pas la première série de l'exercice.

### 9.3 Réserve honnête

Sur l'historique, cette règle aurait envoyé Aurélien à 122,5 kg dès le 14/07 (profil `5-5-5-4`), et 122,5 s'est écroulé à `4-4-3-3` le 04/08. **Une seule observation** — insuffisant pour conclure que la règle est trop permissive. À revérifier avec Jordan, Léa et Alexis.

### 9.4 Ce que la règle ne peut pas voir

Une série à 5 reps dont la dernière est arrachée s'écrit `5` exactement comme une série propre. **Aucune donnée de charge et de reps ne distingue les deux.** La règle est donc volontairement conservatrice : mieux vaut attendre une séance de plus que valider un palier sur des reps grattées. Le filtre de qualité appartient à l'utilisateur, via l'effort renseigné (§17).

### 9.5 Douze pistes rejetées par la mesure

Toutes ont été implémentées et évaluées sur les cinq profils avant d'être écartées. Elles sont consignées pour ne pas être retentées : plusieurs sont des recommandations classiques de la littérature, et l'une d'elles avait déjà été écrite dans cette spec avant d'être invalidée.

Critère de la colonne de droite : **gain de précision** par rapport au hasard, sur la question « la personne est-elle montée à la séance suivante ».

| Piste | Source | Verdict |
|---|---|---|
| Cible de reps conditionnée à la charge (Brzycki/Epley) | §15 de cette spec | justesse 57 % → **8 %** |
| e1RM-PR glissant | Marzagão 2026 (Fitbod) | **pire que le hasard** sur les 5 profils (−4 à −16) |
| Affaissement des reps dans la séance | littérature vélocité / RP | aucun signal (27 % contre 26 %) |
| Règle 2-pour-2 (dernière série, 2 séances) | Baechle & Earle, NSCA | déclenche 11 % ; freine trop l'assidu |
| Confirmation sur deux séances, toutes variantes | idem | divise le déclenchement par deux |
| Seuil sur la dernière série seule | Greyskull LP | +9 sur un profil, ≈0 sur deux |
| Seuil sur la première série seule | — | inférieur au maximum des séries |
| Fourchette calibrée sur la fréquence de montée | — | falaise 75 % → 16 %, rien entre les deux |
| Relâchement de la règle de validation (1 série au lieu de 2) | — | +5 points, coûte la cohérence |
| Fourchette bornée par le format déduit | — | impossible : frontière à 9 reps, 0 % de validation |
| Record à charge constante | double progression classique | 1 à 5 % des séances, gain faible |
| AMRAP spontané (dernière série ≥ médiane+2) | Greyskull, 5/3/1 | équivalent au dépassement simple, jamais meilleur |

**Le fil commun de tous ces échecs.** Chacune de ces pistes essayait de *prédire* le comportement à partir de l'historique. La variable qui décide — la proximité de l'échec — n'est pas dans les données : le RPE est renseigné sur **1 % des séries d'un seul utilisateur et 0 % chez les quatre autres**. La littérature contourne systématiquement ce trou en imposant une série à l'échec (Greyskull, 5/3/1, SBS-RTF) ; la doctrine de cette app l'interdit. La double progression est retenue précisément parce qu'elle **ne prédit rien**.

### 9.6 Pourquoi la cible ne se corrige pas par la charge

Tentative documentée et **rejetée par la mesure**. Puisque la cible tombe moins souvent juste quand le palier a changé (56,6 % contre 72,6 % chez Aurélien, clivage confirmé sur les cinq profils), l'idée était de la conditionner à la charge via le modèle du §15.

Résultat : la justesse s'effondre de 57 % à 8 % chez Aurélien, et dans les mêmes proportions partout ailleurs, quelle que soit la pente retenue.

La raison, sur 1 544 changements de charge : **la variation médiane du nombre de reps est zéro dans toutes les tranches**, y compris au-delà de +10 % de charge. Ce qui change n'est pas la médiane mais la dispersion — écart-type des variations de reps de 1,50 à charge inchangée contre 3,00 à charge changée.

> **Un changement de charge n'abaisse pas la cible, il élargit l'incertitude autour d'elle.** Le moteur n'en déduit rien : c'est exactement le cas où la cible sera le plus souvent ratée, et rater n'est pas un événement (§12).

Ceci vaut pour la déduction de la cible. Le modèle charge/reps du §15 conserve son rôle de filet au premier passage, qui n'est pas affecté.

---

## 10. L'incrément

### 10.1 Règle

> **L'app ne demande jamais de combien monter. Elle déduit le pas de la salle depuis les charges déjà utilisées sur cet exercice.**

Méthode : trier les charges distinctes du top set sur les 24 derniers mois, calculer les écarts consécutifs, retenir **le plus petit écart qui revient au moins 3 fois**. Un écart isolé est du bruit, pas un pas de salle.

| Exercice | Pas déduit | Interprétation |
|---|---|---|
| Développé couché barre | 2,5 kg | 2 disques de 1,25 kg |
| Squat barre | 2,5 kg | idem |
| Soulevé de terre barre | 2,5 kg | idem |
| Développé couché haltère | 4 kg | 2 kg par haltère × 2 |
| Élévation latérale haltère | 2 kg | 1 kg par haltère × 2 |

Les charges d'haltères sont enregistrées en **total des deux** (92 kg = 2 × 46).

### 10.2 Repli sur les machines

Sur les poulies et machines, les charges viennent d'une conversion livres → kilos et produisent des écarts non ronds (0,2 / 0,4 / 1,7 kg). Le plus petit écart récurrent y est faux.

**Détection :** si le pas déduit n'est pas un multiple de 0,5 kg, basculer sur l'écart **médian** et marquer le pas comme approximatif.

### 10.3 Le progrès en pourcentage est interdit

Référentiel §1.3 : +5 kg sur un squat à 135 kg fait +3,7 %, sur un squat à 405 kg fait +1,2 %, et c'est la même quantité de tissu contractile nouveau. **Un algorithme qui progresse en pourcentage fixe sous-charge le débutant et sur-charge l'avancé.** L'incrément est toujours absolu, dérivé du pas de la salle.

---

## 11. Définition du progrès

Une séance progresse par rapport à la précédente du même exercice **et du même format** si :

- la **charge du palier** a augmenté, **ou**
- la charge est identique **et**, rang par rang sur les séries communes, aucune série n'est en baisse **et** au moins une est en hausse (ou une série a été ajoutée).

Charge en baisse → pas un progrès, mais pas nécessairement un problème (§14).

> **Gratter des reps au même poids est une progression à part entière.** C'est la deuxième voie de Plotkin 2022, et elle compte autant que la charge.

---

## 12. Compteur de stagnation

### 12.1 Ce que le compteur déclenche — et ce qu'il ne déclenche pas

> **Le compteur ne déclenche pas l'action, il déclenche le changement de méthode.**

L'utilisateur n'attend jamais. Le moteur lui donne une consigne **à chaque séance** : une rep de plus, ou un cran de charge (§9.1). Ce que le compteur signale, c'est que **la double progression ne suffit plus sur cet exercice** — ce qui appelle un deload, un changement de fourchette ou un changement d'exercice.

C'est pourquoi le seuil peut être plus lent qu'une alarme ordinaire : il fait abandonner une méthode qui fonctionne dans la grande majorité des cas. Et c'est aussi pourquoi **rien ne doit paraître bloqué entre-temps** : le §3.7 de l'écran de saisie affiche le chemin parcouru (« 122,5 kg : 4 reps il y a un mois, 6 aujourd'hui »), qui rend le mouvement visible sans attendre un record.

### 12.2 Définition du progrès — la correction décisive

> **Il y a progrès dès qu'un record est battu sur l'exercice : un record de charge, OU un record de reps à la charge courante.**

La v2.2 ne comptait que la charge. Ce compteur déclarait bloqué quelqu'un passant de 4 à 6 reps à 122,5 kg — c'est-à-dire quelqu'un faisant **exactement ce que la double progression lui demande**. Les deux chapitres se contredisaient.

Effet de la correction, mesuré sur les cinq profils :

| Profil | Durée médiane d'un épisode — charge seule | — charge ou reps |
|---|---|---|
| Aurélien | 5 séances | **2** |
| Jordan | 5 | 2 |
| Léa | 6 | 4 |
| Alexis | 4 | 2 |
| Mélodie | 3 | 1 |

Un vrai blocage dure **2 séances en médiane**, pas 5. L'ancien tableau du §12.1 (90 % des épisodes sous 3 séances) était en outre faussé dans l'autre sens : il comptait comme progrès toute montée de charge, **retours d'oscillation compris** — or une montée sur deux chez le profil assidu est un retour, pas un record (§9.1.3). Il voyait du progrès partout et concluait à des plateaux courts.

### 12.3 Le seuil est un choix, pas une découverte

Chance qu'un exercice reparte seul dans les deux séances suivantes, selon le nombre de séances déjà passées sans aucun progrès (tous profils) :

| Séances bloquées | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Repart seul | 47 % | 40 % | **32 %** | 30 % | 33 % | 30 % | 25 % | 25 % |

> **La courbe s'aplatit dès la troisième séance et ne décroche plus.** Il n'existe aucun point où la donnée dirait « maintenant c'est bloqué pour de bon ». Attendre au-delà de 3 séances n'apporte **aucune information supplémentaire** — c'est du délai pur.

Le seuil n'est donc pas déductible. C'est un arbitrage, et il est tranché du côté du coaching.

### 12.4 Borne opérationnelle

> **Déclenchement à 4 séances consécutives sans aucun progrès** (ni rep, ni kilo), par exercice et par format.

Trois raisons. L'information est stabilisée dès 3 séances, donc attendre plus ne fiabilise rien et coûte des semaines. Une séance de marge au-delà, parce que la performance journalière varie jusqu'à ±18 % (Jovanovic & Flanagan 2014) pour des raisons étrangères à l'entraînement — 3 séances est encore dans le bruit. Et sur un exercice pratiqué tous les cinq jours, 4 séances font environ trois semaines, l'ordre de grandeur retenu par les coachs pour un plateau.

**Coût assumé : 30 % des déclenchements auraient repris seuls.** Acceptable parce que le déclenchement n'est pas une alarme mais une proposition de piste. L'erreur inverse — laisser quelqu'un bloqué un mois de plus pour préserver un taux de justesse — est bien plus coûteuse.

Le seuil est une constante, pas un percentile personnel. Le 9-sur-10 par utilisateur donnait 23 séances chez le profil assidu, soit près de quatre mois sur un exercice : attendre la certitude quand elle n'apporte rien.

### 12.5 Le compteur est en séances, pas en jours

La corrélation entre l'écart médian entre séances et la durée des épisodes est de **−0,006** sur 50 exercices. Un exercice fait tous les 2 jours et un fait tous les 10 jours ont le même seuil.

> **Ce qui fait progresser, c'est la séance, pas le calendrier.**

### 12.6 Reset après coupure — confirmé par la mesure

> **Le compteur repart à zéro si l'écart depuis la séance précédente dépasse 3× l'écart habituel de cet exercice.**

Écart habituel = médiane des écarts entre séances sur cet exercice. Couché : 7 jours → reset à 21 jours. Sur l'ensemble, écart médian 4 jours, 90ᵉ centile 19 jours ; **14,5 % des séances suivent une coupure ainsi définie**.

Effet mesuré : le reset abaisse le taux de reprise spontanée de 4 à 5 points sur toute la plage utile. Il fait donc bien son travail — mais **pas celui qu'on lui prêtait** : il n'explique pas la bosse observée à 6 séances dans la mesure charge-seule, qui lui survit. Après trois semaines sans toucher un mouvement, ne pas progresser n'est pas un blocage, c'est une reprise.

### 12.7 Point ouvert

La mesure charge-seule montrait une remontée nette de la reprise spontanée autour de 6 séances, qui résiste au reset après coupure. Cause non identifiée — cycle de programmation, effet de vague ? Sans conséquence sur le seuil retenu, mais non expliqué.

---

## 12 bis. L'ordre des exercices dans la séance — chantier ouvert le 11/09/2026

Le moteur lit aujourd'hui **chaque exercice isolément**. Il ne sait pas qu'un écarté suit un
développé couché, donc il lit une charge basse comme une régression alors que c'est de la
fatigue accumulée **sur le même muscle**.

> **Deux exercices qui se suivent sur le même muscle fatiguent plus que si un autre muscle
> s'intercale.** Le moteur doit le savoir avant de conclure quoi que ce soit sur une charge.

### 12 bis.1 L'information est déjà là

`sets.rang` donne l'ordre, `exercises.muscles_primaires` donne le muscle. Croiser les deux
donne la **séquence de sollicitation** d'une séance. Rien à ajouter au schéma, rien à
demander à l'utilisateur.

### 12 bis.2 Trois usages, par ordre d'utilité

**1 — Ne pas se tromper.** Une charge basse sur un exercice placé en cinquième position n'est
pas comparable à la même charge en ouverture. C'est de la **non-contradiction**, c'est-à-dire
le rôle que le moteur s'est donné (§11 du banc d'essai).

**2 — Comparer ce qui est comparable.** Un couché en ouverture et un couché après quinze
séries de pectoraux sont deux contextes différents. Le palier et la cible devraient en tenir
compte.

**3 — Proposer un ordre.** Le plus ambitieux, et le dernier. Suppose les deux premiers acquis.

### 12 bis.3 La mesure à faire AVANT toute règle

> **Hypothèse à vérifier sur les cinq profils : la charge tenue baisse-t-elle réellement
> selon la position dans la séance et la proximité musculaire de ce qui précède ?**

C'est exactement le type d'hypothèse qui paraît évidente et que la mesure contredit — comme
l'e1RM-PR (§9.5) ou la règle 2-pour-2. **Aucune règle ne s'écrit avant ce chiffre.**

Ventilation attendue : position dans la séance · nombre de séries déjà faites sur le même
muscle primaire · présence d'un exercice intercalé sur un autre muscle.

### 12 bis.4 La limite doctrinale

> **Décrire, pas réordonner.** « Cette charge est basse parce que le muscle était déjà
> fatigué » décrit. « Réorganise ta séance » impose une organisation — donc la vie de la
> personne, ce que `CADRAGE-V2.md` interdit.

L'usage 3 ne pourra être qu'une **proposition de routine**, jamais un reproche sur une séance
passée.

### 12 bis.5 Place dans l'ordre des chantiers

**Après** le moteur de base et son écran, **avant** la construction de programmes.

C'est un raffinement de ce que le moteur lit, pas une fonctionnalité séparée : il n'a de sens
qu'une fois que le moteur parle, et il conditionne tout ce qui touchera à la construction
d'un programme — dont l'ordre des exercices est la première question.

---

## 13. Contrôle des exercices frères

> **Avant de signaler un blocage, l'app vérifie si un exercice du même pattern progresse.**

Si oui, le message change de nature : ce n'est plus « tu bloques », c'est « ta barre tient pendant que tes haltères montent ».

### 13.1 Le muscle limitant reste descriptif

La v1.1 proposait de désigner un maillon faible par soustraction. **Retiré.** La stagnation est un signal ambigu qui peut vouloir dire cinq choses opposées : c'est le maillon faible, c'est ce qui vient d'être corrigé et repart tout juste, c'est un exercice de fin de séance à faible volume, c'est une butée matérielle, ou c'est un muscle qui attend que les autres rattrapent. Les données ne distinguent pas ces cas.

> **L'app affiche côte à côte ce qui monte et ce qui stagne. Elle ne conclut pas.** Le tableau pose une question, il n'y répond pas.

Réserve affichée avec le tableau : les exercices ne sont pas comparables à égalité — place dans la séance, volume, matériel.

### 13.2 Le tap « où ça bloque » est définitivement retiré

Proposition initiale : demander en un tap si la barre bloque en bas (→ pectoraux) ou au verrouillage (→ triceps). **Réfuté par la littérature :**

- Le point de blocage est déterminé par la **géométrie du système**, pas par la force des muscles (modèle à chaîne articulée, *JFMK* 2025).
- Ce qui sort le lifter du blocage, ce sont les pectoraux et les deltoïdes, pas les triceps (van den Tillaar 2013).
- **Là où la barre s'arrête n'est pas le point le plus faible** — celui-ci est déjà passé (Sheiko Gold).
- Le point est détectable, mais uniquement par la vitesse de la barre. Rien dans la charge et les reps ne le donne.

### 13.3 La famille comme niveau de repli — mesuré le 10/09/2026

Le §13 servait jusqu'ici à nuancer un message de blocage. Une seconde fonction, plus structurante, est confirmée par la mesure : **la famille est le niveau de calcul quand l'exercice seul est trop rare.**

Part des séance-exercices couvertes par un historique d'au moins 8 séances, selon le niveau d'agrégation :

| Profil | Par exercice | Par famille | Exercices → familles |
|---|---|---|---|
| aurel_br | 97 % | 99 % | 151 → 57 |
| jordan | 89 % | 95 % | 62 → 32 |
| lea | 86 % | 95 % | 100 → 42 |
| alexis | 84 % | **97 %** | 93 → 40 |
| melodie | 75 % | **93 %** | 68 → 36 |

Le repli famille rattrape **jusqu'à 18 points** chez le profil le plus dispersé. Les 5 à 7 points restants sont les essais uniques — rien à rattraper, c'est le coût normal de l'exploration.

**Piège de comptage à ne pas refaire.** En comptant des *exercices* plutôt que des *séances*, la dispersion paraît catastrophique : chez melodie, 21 exercices sur 68 n'ont été faits qu'une fois, et alexis ne réalise que 34 % de ses séances sur des exercices vus plus de 20 fois. En séances réelles, la couverture est de 75 à 97 % avant même le repli famille. **Un exercice essayé une fois pèse une séance, pas un tiers du catalogue.**

### 13.4 La rotation d'exercices n'a pas d'effet mesurable sur la progression

Hypothèse testée puis **écartée** : se disperser sur beaucoup d'exercices coûterait des gains, et le moteur aurait à conseiller un recentrage.

Progression annuelle de la charge, exercices d'au moins 6 séances sur au moins 120 jours :

| Profil | Piliers (>20 séances) | Accessoires (6-20) |
|---|---|---|
| aurel_br | +16,3 %/an | +16,0 % |
| jordan | +46,0 % | +26,8 % |
| lea | +36,6 % | +44,9 % |
| alexis | +23,6 % | **+46,6 %** |
| melodie | **+94,4 %** | +25,1 % |

Deux profils progressent mieux sur leurs piliers, deux sur leurs accessoires, un à l'identique. **Aucune direction commune.** Biais à signaler par ailleurs : un accessoire démarre souvent à charge basse, donc son pourcentage part d'un petit dénominateur et gonfle mécaniquement — le +94 % sur cinq exercices n'est pas interprétable.

> **Rien à conseiller sur la sélection d'exercices.** La rotation existe et est massive (un exercice donné est absent de deux semaines actives sur trois), mais elle ne se paie pas en progression et ne prive pas le moteur de matière. Chantier fermé sans règle nouvelle.

Ce que la mesure valide, en revanche : deux populations d'exercices existent bel et bien, séparées par leur durée de vie — **environ 200 jours pour un accessoire contre 720 pour un pilier chez aurel_br, 93 contre 304 chez jordan**, un facteur trois à quatre chez tous. Cette séparation justifie le repli famille du §13.3 ; elle ne justifie aucun conseil.

### 13.5 Transfert isolation → polyarticulaire

Aucune source ne valide la démarche. La littérature dit « identifie tes points faibles », jamais comment les détecter à partir de données, et le principe de spécificité limite le transfert. Reste le tableau descriptif, rien de plus.

---

## 14. L'escalier — une marche à la fois

Quand le compteur dépasse le seuil **et** que le contrôle du §13 ne trouve pas de frère qui progresse, l'app propose **la marche suivante, jamais deux**. Ordre fixe, du moins coûteux au plus engageant.

| # | Marche | Ce que ça change | Statut |
|---|---|---|---|
| **1** | **Rien** | des reps sont encore gagnées | — |
| **2** | **Accepter la décroissance** | le palier se valide sur un profil descendant au lieu d'exiger un plateau plat | Choix produit |
| **3** | **Déplacer une série lourde vers l'assistance** | 3 séries lourdes + 1 série d'assistance en plus. Même compte de séries, moins de fatigue | Soutenu (§14.1) |
| **4** | **Redescendre au dernier palier validé en entier** | charge mesurée dans l'historique, pas un pourcentage | Choix produit assumé |
| **5** | **Changer de format** | change *ce que* l'utilisateur entraîne | **Seule marche où l'app demande** |

### 14.1 Justification de la marche 3

Remmert 2025 : rendements décroissants dès **~2 séries directes par séance** pour la force. Pelland 2025 : au niveau hebdomadaire, supériorité indétectable au-delà d'environ 3 séries fractionnelles. La 4ᵉ série lourde coûte de la fatigue pour un gain de force indétectable.

Mais la supprimer sèchement retire du volume, et le volume fait grossir le muscle. D'où : **déplacer, pas supprimer.**

Observation dans les données, à prendre pour ce qu'elle est — une seule comparaison, pas une preuve :

| Séance | Couché | Incliné haltère qui suit |
|---|---|---|
| 04/08 | 4 séries | 84×8, 84×7, 84×7 (descend) |
| 12/08 | **3 séries** | 84×8, 84×8, **88×4** (monte) |

### 14.2 Le repli n'est pas un pourcentage — et il ne monte jamais

Le « −10 % » est une convention de coach. La marche 4 utilise **le dernier palier validé en entier dans l'historique** — pour Aurélien au couché : 120 kg, validé le 28/07 sur `5-5-5-5`.

**Trois garde-fous, sans lesquels la règle est fausse.** Rien dans sa formulation initiale n'obligeait le repli à descendre : après une blessure ou un long détour sur une autre variante, le dernier palier tenu en entier peut être **au-dessus** du palier où l'utilisateur bloque. La marche 4 lui proposerait alors de monter, au moment précis où il stagne.

> **Le repli est le dernier palier validé en entier qui soit à la fois : (1) strictement inférieur au palier actuel, (2) sur le même exercice et le même format, (3) dans les 3 derniers mois.**
>
> **Si aucun palier ne remplit les trois conditions, la marche 4 est sautée. L'escalier passe directement à la marche 5.**

Sauter plutôt que retomber sur un pourcentage : quand l'historique récent ne contient pas de palier plus bas déjà tenu, l'app n'a aucune base pour en inventer un. La marche 5 pose une question, ce qui est la bonne réponse à une absence de donnée.

La fenêtre de 3 mois est un **choix produit**. Elle vient du même raisonnement que le reset du compteur (§12.4) : au-delà, ce n'est plus le même athlète sur ce mouvement.

Corollaire du référentiel §6.3 : **réduire vaut mieux qu'arrêter** pour un athlète de force (composante d'habileté ; Coleman 2024 — une semaine d'arrêt complet n'améliore rien).

### 14.3 Une correction utilisateur n'est jamais retentée

Si l'utilisateur retire une série, l'app **ne la repropose pas** — ni sur minuteur, ni jamais. Trois raisons, par ordre de solidité :

1. **Il n'y a presque rien à récupérer** (Remmert 2025, Pelland 2025).
2. **Un délai de re-proposition serait un choix produit déguisé en fait scientifique.** La science ne dit rien sur le bon moment pour retester.
3. **C'est le piège du niveau 3 du cadrage.** Une app qui prescrit puis observe les conséquences de ses propres consignes ne s'optimise pas, elle se confirme.

Le filet existe déjà : si le retrait fait descendre le volume sous la fourchette personnelle pendant 3 fenêtres, la règle de volume le signale.

---

# PARTIE D — LE MODÈLE CHARGE / REPS

## 15. Forme et constantes

Rôle du modèle : **proposer une charge de départ** quand la double progression n'a pas de séance précédente à lire — premier passage, reprise après interruption, changement de matériel. Ce n'est pas le cœur du moteur, c'est son filet.

Forme retenue, Brzycki généralisée : `reps = 1 + (1 − L/Lmax)/k`

| Exercice | Lmax | k | Lecture |
|---|---|---|---|
| Développé couché barre | 130,0 | **0,0385** | perd 1 rep tous les 3,8 % de charge |
| Squat barre | 130,0 | **0,0513** | 1 rep tous les 5,1 % |
| Soulevé de terre barre | 162,5 | **0,0500** | 1 rep tous les 5,0 % |
| Développé militaire barre | 67,5 | 0,0700 | 1 rep tous les 7,0 % |
| Développé couché haltère | 88,0 | 0,0303 | 1 rep tous les 3,0 % |
| Développé militaire haltère | 80,0 | 0,0500 | 1 rep tous les 5,0 % |
| Tirage poitrine poulie | 73,0 | 0,0213 | 1 rep tous les 2,1 % |

**Le couché est le plus raide** : ses reps chutent plus vite quand la charge monte. Cohérent avec le profil bras courts documenté au cadrage. Un `k` unique aurait rendu les trois barres indiscernables.

### 15.1 Comparaison des formes — testé, tranché

Quatre équations ajustées à un paramètre par exercice, évaluées en marche avant sur les 8 dernières séances :

| Formule | Erreur médiane | Sur séries ≥ 10 reps |
|---|---|---|
| **Brzycki généralisée** | **2,00 rep** | **2,67** |
| Epley généralisée | 2,64 | 3,62 |
| Exponentielle à plateau | 3,11 | 4,32 |
| Puissance (Lombardi) | 5,81 | 7,35 |

Changer d'équation ne résout rien : ce qui manque n'est pas la forme de la courbe, c'est la distance à l'échec (§17).

### 15.2 Exclusion du poids de corps non lesté

Les tractions donnent `k = 0,0116`, trois fois plus plat que tout le reste, parce que **la charge ne varie pas**. Sans variation de charge, la relation charge/reps n'est pas identifiable.

> **Les mouvements au poids de corps non lesté sont exclus du modèle.** Ils restent intégralement dans le tonnage, le volume et la double progression.

---

## 16. Le maximum estimé — domaine, forme, statut

### 16.1 Domaine

L'erreur du modèle explose avec le nombre de reps :

| Reps observées | Erreur |
|---|---|
| 3 – 6 | 0,4 à 0,9 rep |
| 8 | 1,4 |
| 10 | 2,0 |
| 12 | 3,0 |

Ça confirme empiriquement la borne du référentiel §2 : **e1RM exploitable ≤ 8 reps**. Au-delà, l'estimation n'est pas affichée.

### 16.2 Trois règles d'affichage

> **1. Calculé uniquement sur les séries de 8 reps ou moins.**
> **2. Sorti en fourchette, jamais en nombre sec.**
> **3. Présenté comme une estimation, jamais comme un record.**

Contrôle contre les barres réelles : couché 134,0 estimé vs 140 réel ; squat 141,1 vs 145 ; soulevé 172,5 vs 170. Erreur ~4 %, soit **le niveau du bruit irréductible du 1RM lui-même** (Grgic 2020, CV médian 4,2 %). Il n'y a plus rien à gratter.

### 16.3 Le défaut de Hevy, à ne pas reproduire

Hevy affiche « Meilleur 1RM : 186,67 kg » au soulevé hex. Ce nombre est calculé par Epley sur une série de **10 reps**, hors du domaine où la formule tient, sur le mouvement où toutes les équations se plantent le plus (LeSuer 1997).

Formulation retenue à la place : *« Ton maximum estimé : 170 à 190 kg. Tu n'as jamais soulevé ça — ta barre la plus lourde reste 150 kg. »*

Et quand aucune série de la séance n'est sous 8 reps, l'app affiche **un tiret**. C'est exactement là que Hevy invente 173,33 kg.

### 16.4 Les records sont calculés sur les séries de travail

Même défaut chez Hevy sur les records : à 15 reps le record affiché est 20 kg (la barre à vide) et à 5 reps 100 kg (un échauffement). Trois lignes sur sept étaient de la chauffe. Le « meilleur volume de séance » à 7 220 kg compte 4 séries d'échauffement ; le vrai record en séries de travail est **5 100 kg**.

> **Tout record, toute médiane, toute table de charges se calcule sur les séries de travail uniquement.**

### 16.5 La charge de travail

Nouvelle mesure propre à TrainHub, placée en premier sur la fiche d'exercice : **la médiane des séries de travail**. Ni tirée vers le haut par la série la plus lourde, ni vers le bas par la montée en charge. C'est le seul chiffre qui répond à « je soulève combien à cet exercice ».

---

## 17. Le calage par l'effort

### 17.1 Le diagnostic

Le modèle échoue parce qu'il **devine** la distance à l'échec. Une série de 12 arrêtée à 3 reps en réserve et une série de 12 menée à l'échec s'écrivent identiquement — et ne portent pas la même information. La première n'en porte aucune.

Testé et écarté : changer d'équation (§15.1), raccourcir la fenêtre (§18.2). Ni l'un ni l'autre ne comble le manque.

### 17.2 Règle

> **À l'ouverture d'un compte, et pendant une durée à déterminer, l'app incite à renseigner l'effort. L'incitation s'étend temporairement aux exercices d'isolation. Elle cesse ensuite.**

| Paramètre | Valeur |
|---|---|
| Portée normale | polyarticulaires |
| Portée pendant le calage | tous exercices |
| Ce qu'on cherche | séries proches de l'échec — 2 reps en réserve ou moins |
| Ce qui ne sert à rien | 3 reps en réserve ou plus |
| Durée | **à mesurer sur données réelles** (§22.1) |

### 17.3 Trois crans, pas dix

> **Boutons : ≤ 7 facile (3 reps ou plus en réserve) / 8-9 dur (1 à 2 reps) / 10 max (plus rien).**

La coupure est à 7 et non à 6 : en RPE de force, 7 signifie trois reps en réserve, 9 une seule.

Justification, référentiel §3 : les gens **ne peuvent physiquement pas** résoudre les gradations fines loin de l'échec. L'exactitude est bonne entre 0 et 2 reps en réserve, mauvaise au-delà de 4, et se dégrade sur les séries longues. Une échelle à 3 crans près de l'échec est plus honnête qu'une échelle à 10 crans dont 6 sont du bruit.

Le chiffre exact reste visible et saisissable en colonne pour ceux qui le connaissent. **Jamais d'effort sur une série de chauffe.**

#### Les demi-points — bandes fermées

Les trois crans ci-dessus sont définis sur des entiers. Une source externe en produit des demi : sur les 93 RPE de l'historique (§21.5), **15 valeurs tombent entre les crans** — huit à 7,5, sept à 9,5. Seize pour cent des données sans case.

> **Bandes retenues : `facile` = RPE < 8 · `dur` = 8 à 9,5 · `max` = 10.**

Répartition obtenue sur les 93 : **19 % facile, 62 % dur, 18 % max.** Aucun cran ne se vide.

**Le 9,5 est le seul arbitrage réel**, parce que le §17.4 fait compter une série `max` avec une rep en moins. Six séance-exercices de l'historique contiennent un 9,5 ; le classer en `max` **fait basculer trois d'entre elles** de « palier tenu » à « palier non tenu », alors que les reps visées étaient faites.

Cas mesuré, squat du 2 février : `125×4 @8,5 · 125×4 @9,5 · 125×4 @9,5`, cible 4 reps. Trois séries de quatre réalisées. Avec la pénalité, l'app en compte **une sur trois** et refuse le palier.

Deux raisons de placer 9,5 dans `dur` :

1. Le cran `max` est défini comme « plus rien en réserve ». À 9,5 il reste quelque chose : la valeur ne remplit pas la définition, l'y forcer serait un abus de langage.
2. L'erreur produite est celle dont ce projet se méfie le plus. Répondre « palier non tenu » à trois séries de quatre à 125 kg appartient à la même famille que l'Insolvency et le mur de rouge : une prudence qui punit quelqu'un qui a fait le travail. Répétée trois séances, elle déclenche la stagnation et fait redescendre l'escalier (§14).

Rien n'est perdu pour autant : la valeur exacte reste stockée à côté du cran. Le cran pilote l'algorithme, la valeur brute permettra de vérifier plus tard — via la table de prédictions — si la pénalité aurait mieux fait.

### 17.4 Mécanique

Le champ se met en surbrillance **30 secondes après la validation de la série**, pendant le repos — l'utilisateur est lucide et n'est plus sous la barre. Tapable avant s'il veut. Un tap. Aucun blocage si ignoré : l'app **ne suppose rien** et applique la validation normale sur les reps brutes.

Une série marquée « max » compte **−1 rep** pour la validation du palier uniquement. Le nombre réel reste enregistré tel quel pour le volume, le tonnage et l'estimation du maximum.

### 17.5 Deux réserves de fond

**Fiabilité.** Le calage sera bon sur les barres, moins bon sur les séries de 15.

**Boucle fermée.** Si l'app pousse durablement vers l'échec pour alimenter son propre modèle, elle observe les conséquences de ses propres consignes — niveau 3 du cadrage, explicitement interdit.

> **L'incitation existe pendant le calage, jamais en permanence.**

### 17.6 Écarté

Une **séance de calage dédiée** (2-3 séries à l'échec à charges espacées) : elle coûte une vraie séance et de la fatigue, et ne peut pas couvrir 60 exercices. L'effort sur séances normales donne la même information à coût nul.

---

## 18. Écriture du modèle en base

### 18.1 État et décision

`user_exercise_model` contient 60 lignes en `charge_reps_v1` (forme Epley). La table est **append-only** avec un champ `parametres` en JSONB libre : aucune migration nécessaire, il suffit d'écrire de nouvelles lignes que l'app lira en priorité.

Les 57 lignes recalculées ont un **bruit médian de 2,2 reps** :

| Exercice | Bruit |
|---|---|
| Développé couché barre | 1,00 rep |
| Squat barre | 1,50 |
| Soulevé de terre barre | 1,69 |
| Rowing poulie assis | 3,44 |
| Leg curl assis | 3,77 |

Écrire un modèle qui se trompe de 3 reps sur la moitié des exercices violerait le référentiel §2 (aucune décision sous la bande de bruit).

> **Décision : on n'écrit pas maintenant. Le modèle sera écrit après la phase de calage, en `charge_reps_v2_brzycki`.**

### 18.2 Pondération temporelle

Balayage complet en validation hors échantillon : optimum à **21 jours de demi-vie, masse effective minimale 8 séries**, pour 1,80 rep d'erreur médiane. Sous ce plancher, la fenêtre s'élargit automatiquement.

| Pondération | Erreur médiane (13 exercices) |
|---|---|
| Fenêtre sèche 120 j | 2,97 reps |
| Demi-vie 8 semaines | 2,57 |
| Demi-vie 6 semaines | 2,22 |
| Demi-vie 4 semaines | 2,06 |
| **Optimum balayé (21 j / masse 8)** | **1,80** |

Deux exercices se dégradent avec une fenêtre courte (couché haltères, hack squat) : ils sont trop peu fréquents, d'où le plancher.

**Retenu comme paramétrage, à revalider après le calage** (§22.2) : ces chiffres ont été obtenus sans aucune donnée d'effort, sur un modèle qui devine la distance à l'échec.

### 18.3 Ce qui est déjà tranché pour l'écriture

| Point | Décision |
|---|---|
| Nom de version | `charge_reps_v2_brzycki` |
| Bruit | **stocké en base** — il est mesuré, il fait partie du modèle |
| Fourchette | **calculée à l'affichage** — largeur ajustable sans recalcul |
| Migration | aucune — table append-only |

---

# PARTIE E — CE QUE L'APP DIT

## 19. L'ancre lourde permanente

Question posée : faut-il alterner des blocs de force et des blocs d'hypertrophie plutôt que rester dans un seul registre ?

### 19.1 Ce que dit la littérature

Quand on compare des programmes périodisés à des programmes qui ne changent jamais, les écarts sont **petits et inconstants sur la force, à peu près nuls sur l'hypertrophie**. La périodisation en blocs a un intérêt réel — arriver au pic un jour donné — mais c'est un intérêt de compétiteur.

Deux mécanismes restent vrais et suffisent :

- **La force est spécifique à la charge.** Sans lourd, le max ne bouge pas, même si le muscle grossit.
- **L'hypertrophie est indifférente à la zone de reps** entre 5 et 30, tant qu'on va près de l'échec.

### 19.2 Position retenue

> **Pas de bascule en blocs. Une ancre lourde permanente, et une rotation d'exercices.**

Trois raisons, dans l'ordre :

1. **La cible n'a pas de date de compétition** (cadrage §1). Le principal argument de la périodisation ne s'applique pas.
2. **Alterner ferait perdre du lourd** pendant des semaines pour le récupérer ensuite.
3. **En recomposition, c'est le lourd qui protège la force** quand l'apport baisse. L'abandonner un mois est le pire moment.

Ce qui mérite de tourner, c'est le **choix des exercices** — pour les articulations et pour la lassitude — pas la zone de reps. C'est là que l'intuition des coachs a raison.

### 19.3 Conséquence sur le moteur

Le §8 le permet déjà : force et hypertrophie **coexistent** sur un même exercice, chacune avec son palier. Le moteur n'a donc rien à cycler. La marche 5 de l'escalier (§14) propose un changement de format sur **un exercice qui bloque**, jamais sur l'ensemble du programme.

**Ce paragraphe est un principe de conception, pas un algorithme.** La fabrication de programmes est un chantier à part (§20).

---

## 20. Registre de communication

Conforme au cadrage : **descriptif, jamais prescriptif sur l'historique.**

| Situation | Formulation |
|---|---|
| Progrès en reps | « 122,5 kg, ta meilleure séance sur ce palier. » |
| Palier validé | « 5-5-5-5 à 120 kg. On passe à 122,5 ? » |
| Exploration | « 135 kg sur une série — noté. Le palier reste 122,5. » |
| Seuil dépassé | « 122,5 ne bouge plus depuis 3 séances — c'est plus long que d'habitude pour toi. » + la marche suivante |
| Frère qui progresse | « Ta barre tient, mais tes haltères sont montés à 92. » |
| Muscle limitant | « Tes triceps et tes épaules montent, tes pecs seuls stagnent. Piste à vérifier, pas un diagnostic. » |
| Ratio extrême | « Ton rapport squat/couché te place dans les 2 % de lifters au squat le plus bas relativement au couché. Ça peut être morphologique. » |
| Marche 5 atteinte | Seule question posée à l'utilisateur |

**Aucun rouge. Aucun vocabulaire de risque.** Le seuil est présenté comme une comparaison à ses propres habitudes, jamais à une norme extérieure.

Vocabulaire : « percentile » n'est pas compris tel quel. Formulation à privilégier — *« sur 100 pratiquants alignés du plus faible au plus fort, tu es le Nᵉ »*.

### 20.1 Hors périmètre de ce document

La **fabrication de programmes** — variantes lourdes à pause ou à arrêt, rattrapage de points faibles, rotation planifiée — est un chantier distinct. Deux contraintes déjà fixées pour lui :

1. Un programme fabriqué par l'app sort de la **littérature**, jamais de l'historique de l'utilisateur (cadrage §3.1).
2. Chaque programme proposé s'écrit dans `predictions`.

---

# PARTIE F — GARDE-FOUS ET TROUS

## 21. Sept erreurs d'analyse, consignées

Toutes ont été commises par l'assistant et rattrapées par l'utilisateur, jamais par la vérification automatique. C'est le fait le plus important de cette liste.

### 21.1 « À charge identique, tu fais entre 5 et 15 reps »

**Faux** — comparaison de séries à trois ans d'écart. Dans une même séance à charge identique, l'écart médian est de **0,0 rep**.
*Leçon :* toute dispersion se mesure à période contrôlée. Sans date, « dispersion » et « progression » sont indiscernables.

### 21.2 « 62 % de comptes ronds = arrêts arbitraires »

**Faux.** La charge est **choisie pour tomber à l'échec au compte visé**. Le compte rond est le résultat d'un calage précis, pas d'un arrêt arbitraire.
*Leçon :* un motif statistique n'est pas une cause. C'est la fouille de données interdite par le cadrage §3.1 — lire un motif et inventer le mécanisme.

### 21.3 « L'écarté machine plafonne à 100 kg »

**Faux** — montées à 107, 113 et 120 kg constatées. Et à 100 kg sur 43 séries, les reps vont de 10 à 15 : **il progressait en reps**.
*Leçon :* faux positif direct, une progression lue comme une stagnation.

### 21.4 « Aucune série de chauffe dans les données »

**Faux.** Répartition réelle : 15 465 normales, **1 027 échauffements**, 153 dégressives, 59 ratées.
*Conséquence :* la phrase de la v1.2 est corrigée ici. **L'app v2 garde le type « échauffement »** (§4), et tous les records se calculent sur les séries de travail (§16.4).

### 21.5 « Aucune donnée de RPE »

**Faux.** **93 séries** portent un RPE : 6,0 ×2 · 7,0 ×8 · 7,5 ×8 · 8,0 ×17 · 8,5 ×22 · 9,0 ×12 · 9,5 ×7 · 10,0 ×17.
*Conséquence :* c'est peu, mais ce n'est pas rien, et c'est concentré près de l'échec — donc exploitable pour amorcer le calage (§17).

**Complément du 25/08/2026 — ces 93 valeurs n'ont jamais atteint la base.** Vérification faite : la colonne `ressenti` est vide sur les **16 704 séries**. L'export contient bien la colonne `rpe`, l'import ne la transporte pas.

Ce n'est **pas un bug à corriger** : le code v1 est abandonné et l'import CSV est une fonctionnalité v2 qui n'existe pas encore. C'est donc une **exigence de spécification**, à faire figurer dans le prompt de construction de l'import, faute de quoi le trou sera recreusé à neuf :

> **L'import écrit le cran dans `ressenti` selon les bandes du §17.3, et conserve la valeur brute dans une colonne voisine. Aucun effort n'est écrit sur une série de chauffe.**

L'enjeu a grandi depuis : tant que l'écran de saisie n'existe pas, l'import est le **seul canal** par lequel une donnée d'effort peut entrer. Chaque séance notée en attendant est perdue sans lui.

**Ce que l'import ne pourra jamais apporter, quelle que soit la voie.** L'API du fournisseur a été examinée le 25/08 : son objet « série » expose `type`, `weightKg`, `reps`, `distanceMeters`, `durationSeconds`, `rpe` — **aucun horodatage par série**. Les heures n'existent qu'au niveau de la séance, comme dans le CSV. La colonne `validee_a`, qui porte le temps de repos réel, ne se remplira donc **qu'avec l'écran de saisie de l'app**. Aucune intégration externe ne la comblera.

*Noté sans être retenu :* cette API expose aussi des identifiants d'exercices stables (qui rendraient inutile la table `exercise_alias` et ses 217 correspondances par texte) et une synchronisation incrémentale sachant exprimer les modifications et les suppressions. Écarté pour l'instant — l'app est construite pour **remplacer** cette source, investir dans son intégration reviendrait à soigner un pont destiné à disparaître.

### 21.6 Dates mal parsées

`pd.to_datetime(start_time, format='mixed')` produit **12 905 valeurs vides** et une fausse date maximale de novembre 2025.
*Règle :* **toujours utiliser la colonne `dt`.** Vraie date maximale : 22 août 2026, zéro valeur vide.

### 21.7 Séries lues sans tri par rang — la plus grave

Détaillée au §1.2. La règle existait déjà et n'a pas été appliquée.

---

## 22. Ce qui n'est pas tranché, et ce qui a été écarté

Nommer un trou ne coûte rien. Le combler à l'intuition coûte trois versions.

### 22.1 Durée de la phase de calage

Ne se tranche pas sur l'historique : 93 séries avec effort renseigné, c'est trop peu pour dire combien de séances il faut pour stabiliser un modèle.

**Ce qu'il faut mesurer :** sur les premières semaines réelles, à partir de combien de séries proches de l'échec l'erreur du modèle cesse de baisser, exercice par exercice. Le calage s'arrête là.

### 22.2 Où couper exactement le domaine du modèle

L'erreur passe de 1,00 rep si on ne garde que les séries ≤ 8 reps à 2,00 si on va jusqu'à 15. Couper à 8 est cohérent avec le référentiel, mais **écarte 36 % des séries d'isolation en poulie**, qui se travaillent rarement sous 8 reps.

**Ce qu'il faut mesurer :** si un domaine élargi par famille d'exercices (8 reps sur les barres, 12 sur l'isolation) fait moins d'erreur globale qu'un domaine unique. Non tranché — et le trou de couverture de l'isolation reste entier tant que ça n'est pas fait.

### 22.3 Autres points ouverts

| Point | État |
|---|---|
| Seuils calibrés sur un seul utilisateur | à revérifier avec Jordan, Léa, Alexis |
| Seuils 35 / 60 % de la montée en charge (§5.2) | choix produit, à revoir sur données multi-utilisateurs |
| Pesée à jour | dernière le 18/03/2026, tout le reste est un report |
| Exercices en durée et cardio | colonnes différentes à prévoir |
| Progression entre exercices (prise serrée → diamant) | distincte du champ `parent`, non traitée |
| Recalcul des seuils v1.1 sur le fichier reconstruit | paliers et incréments portaient sur un fichier amputé de 12 % |

### 22.4 Revue externe du 24/08/2026 — ce qui a été retenu et ce qui ne l'a pas été

Document soumis à une relecture indépendante. Quatre objections, deux retenues, une écartée, une reformulée.

| Objection | Verdict |
|---|---|
| **La marche 4 peut proposer une charge aberrante** si le dernier palier validé est ancien | ✅ **Retenue.** Corrigé au §14.2 — trois garde-fous ajoutés |
| **Le poids de corps figé dérive à long terme** | ✅ **Retenue.** Corrigé au §1.3 — signalement à 3 mois |
| **Le pas de la salle est faussé par les salles de passage** (déplacements, hôtel) | ❌ **Écartée.** Le pas exige un écart récurrent **3 fois sur 24 mois** : quelques séances de passage ne l'atteignent pas. Et le garde-fou existe déjà (§10.2) — tout pas non multiple de 0,5 kg bascule sur la médiane. Ne pas rouvrir sans un cas mesuré |
| **Au démarrage, la règle des 8 séances laisse passer des chauffes en séries de travail** | ⚠️ **Mécanisme faux, problème réel.** La chauffe est **taguée**, pas déduite : la règle du §5 ne la voit jamais. Mais la vérification a montré que le tag lui-même est absent 86 % du temps, y compris dans l'historique existant. Traité au §4.1, qui va plus loin que l'objection |

**Trou trouvé pendant cette revue, signalé par aucune des deux relectures :** l'interaction entre les §5 et §6 — la série de montée gonflait le compte de reps de référence et faisait mal classer 4,7 % des descentes finales. Corrigé au §6.5.

### 22.5 Amendement du 25/08/2026 — la rampe

Déclenché par une séance réelle du 24/08 (« Quads tous terrains »), qui contenait deux fois le cas décrit sans qu'il ait de nom.

| Point | Traitement |
|---|---|
| Le mot **« écartée »** laissait croire qu'une série de montée était jetée | ✅ Remplacé partout par « non retenue pour juger le palier ». §5.2, §6.3, §7.3 |
| Le §7.3 assimilait ces séries aux séries de chauffe | ✅ Nuance ajoutée : ce sont des séries de travail entières partout ailleurs |
| Cette série n'avait **pas de nom**, donc le code risquait de la traiter comme une chauffe | ✅ Baptisée **rampe** (§5.4). « Série d'approche » écarté : trop proche d'échauffement |
| **La première série au palier est en fait la deuxième série de travail** — objection d'Aurélien | ✅ Nouvelle règle §5.5, neutralité restreinte à l'état « ne monte pas » |

**Erreur de Claude corrigée en séance.** Interrogé sur la fréquence de la rampe, Claude a répondu avec les chiffres du §5.1 — squat 75 %, presse 87 % — en concluant que la rampe se produisait surtout sur les gros mouvements. **Faux : ce sont deux mesures différentes.** Le §5.1 compte toutes les premières séries plus légères ; la rampe ne compte que celles proches du palier. Vérification faite : la rampe est un geste d'**isolation** (adduction 75 %, abduction 70 %) alors que les gros mouvements montrent surtout de la vraie chauffe (squat : 38 séances en chauffe probable, le record de l'historique). Même racine que les deux erreurs de la veille : raisonner sur un résumé au lieu d'interroger la base.

**Piège évité de justesse.** La règle de neutralité, prise au pied de la lettre, aurait neutralisé 638 séance-exercices sur 3 461 — 18,4 % de l'historique — et rendu l'adduction hanche définitivement incapable de progresser, puisque trois de ses séances sur quatre comportent une rampe. La restriction à l'état « ne monte pas » ramène le coût à **37 séances, soit 1,1 %**.

### 22.6 Amendement du 25/08/2026 — le dégressif

Déclenché par la même séance. La dernière série de l'extension jambes portait un tag que le document n'avait jamais examiné.

| Point | Traitement |
|---|---|
| Le §6 ne connaissait que **deux** mécanismes de descente | ✅ Un troisième ajouté : le **dégressif**, technique d'intensité déclarée |
| La déduction du §6.3 s'appliquait aussi aux séries **déjà étiquetées** | ✅ Le tag prime désormais sur la déduction. §6.3 réécrit |
| Aucun chiffrage de l'erreur | ✅ Mesuré au §6.4 : **29 dégressifs assumés sur 113 classés en fatigue**, un sur quatre |

**Vérification des tags.** Les quatre valeurs de `type_serie` de l'historique sont `travail` (15 465), `echauffement` (1 027), `degressive` (153) et `echec` (59). Les deux derniers décrivent des gestes opposés et parfaitement séparables : le dégressif est à 61,6 % de la charge la plus lourde du jour (147 cas sur 153 sous 85 %), l'échec est à 105 % (aucun sous 85 %). Contrairement au tag de chauffe, **ces deux-là sont fiables** — d'où la décision de les croire plutôt que de les deviner.

**Symétrie avec le §4.1, et leçon de méthode.** Deux amendements construits sur des tags, dans des directions opposées : au §4.1 le tag de chauffe manque 86 % du temps, il faut donc déduire ; au §6 le tag de dégressif est présent et fiable, il faut donc cesser de déduire. La question à se poser devant toute règle d'inférence n'est pas « est-ce que je devine bien », c'est **« est-ce que j'avais besoin de deviner »**.

### 22.7 Amendement du 25/08/2026 — les demi-points d'effort

| Point | Traitement |
|---|---|
| Les crans du §17.3 étaient coupés sur des entiers, la source produit des demis | ✅ Bandes fermées : `facile` < 8 · `dur` 8 à 9,5 · `max` 10. 19 / 62 / 18 % sur les 93 |
| Le 9,5 était le seul arbitrage coûteux (pénalité d'une rep du §17.4) | ✅ Classé `dur`, sur mesure : en `max` il faisait basculer **3 séance-exercices sur 6** en « palier non tenu » alors que les reps étaient faites |
| Les 93 RPE **n'ont jamais atteint la base** — `ressenti` vide sur 16 704 séries | ✅ Inscrit au §21.5 comme exigence de spécification de l'import, pas comme bug |
| L'API du fournisseur comblerait-elle `validee_a` ? | ❌ **Non.** Vérifié : aucun horodatage par série. Cette colonne n'existera qu'avec l'écran de saisie |

**Deux erreurs de Claude dans la même séquence.** Les 93 RPE ont été présentés comme une découverte alors que le §21.5 les documentait déjà avec la distribution exacte. Et la conclusion « tout noter est moins bon que noter ce qui compte » contredisait le §17.2, qui étend délibérément l'incitation aux exercices d'isolation **pendant la phase de calage** — la séance du 24/08 était donc conforme à la spécification, pas déviante. Même racine que les précédentes : parler avant d'avoir relu.

---

## 23. Sources

- Plotkin D. et al. (2022). *PeerJ* 10:e14142 — progression en charge vs en reps
- Pelland J.C. et al. (2025). *Sports Medicine*. DOI 10.1007/s40279-025-02344-w — volume, rendements décroissants
- Remmert J. et al. (2025). *SportRxiv* — volume par séance
- Grgic J. et al. (2020). *Sports Medicine – Open* 6:31 — fidélité test-retest du 1RM
- Zourdos M.C. et al. (2016). *Nutr Hosp* 33(2):437-443 — variabilité quotidienne du 1RM
- Nuzzo J.L. et al. (2023). *Sports Medicine*. PMID 37792272 — reps/%1RM
- Coleman M. et al. (2024). *PeerJ* 12:e16777 — deload d'une semaine
- LeSuer D.A. et al. (1997) — validité des équations de 1RM sur les trois barres
- van den Tillaar R. (2013) — contribution musculaire à la sortie du point de blocage
- *Journal of Functional Morphology and Kinesiology* (2025). DOI 10.3390/jfmk10030322 — le point de blocage est géométrique
- Elliott, Wilson & Kerr (1989) ; Madsen & McLaughlin (1984) — définition cinématique du blocage
- Sheiko Gold — dissociation entre point de force minimale et point de vitesse minimale
- Steele J. et al. (2017) ; Refalo M.C. et al. (2023) — exactitude de l'effort auto-rapporté
- Androulakis-Korakakis P. et al. (2021). DOI 10.3389/fspor.2021.713655 — dose minimale efficace
