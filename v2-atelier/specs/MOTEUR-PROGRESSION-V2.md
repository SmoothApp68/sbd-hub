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

**Amendé le 07/10/2026 (chantier 60).** « Une seule exception » était dépassé depuis longtemps : le réglage de rythme, la phase, la carte du lest et le changement de schéma demandent tous quelque chose. La règle devient : **on ne demande que ce que les séries ne savent pas, et ce qui est demandé a un lecteur** (QUESTIONNAIRE-COACH-V2 §1). Ce que les séries savent — fréquence, durée, niveau, autres activités — est **montré** pour confirmation, jamais redemandé. Le questionnaire du coach pose ses questions une fois ; en séance, les seules questions restent les cartes qui changent *ce que* la personne entraîne (le changement de schéma, §14.5 ; la carte du lest, §9.17).

### 1.2 Aucune lecture de séries sans tri explicite sur le rang

> **Toute lecture de séries se fait avec un tri explicite sur `sets.rang`. Jamais l'ordre d'insertion, jamais l'ordre de retour d'une requête.**

Deux dégâts réels, à un mois d'écart :

- Un affichage non trié a produit le profil `[4, 4, 5, 3]` au lieu de `[5, 4, 4, 3]`. Même total, conclusion opposée : une descente 5-4-4-3 est une courbe de fatigue normale, un profil erratique ne l'est pas.
- **Le 21 août 2026 au soulevé hex**, l'analyse a conclu « 3ᵉ série descendue à 120 kg, palier non tenu ». L'ordre réel était `120 → 130 → 130 → 130` : une montée en charge, et le palier de 130 parfaitement tenu. La proposition est passée de « rester à 130 » à **135 × 10**. Erreur détectée par les captures d'écran de l'utilisateur, pas par la vérification.

Le second cas est plus grave que le premier parce que la règle existait déjà et n'a pas été appliquée. Elle est donc rappelée ici, avec son cas d'espèce.

**Et quand le rang manque — 20/09/2026.** La règle disait la moitié : trier sur `sets.rang`. Elle ne disait pas ce qui se passe quand **il n'y a pas de rang** — le cas d'une série en mémoire, pas encore écrite en base, où `rang` se calcule à l'écriture.

> **Rang absent : l'ordre reçu fait foi. Jamais un départage sur autre chose — ni l'identifiant, ni l'instant de validation, ni l'ordre d'insertion.**

Le départage de `Palier.trier` tombait sur `localeCompare` de l'identifiant, un UUID tiré au hasard à la création de la ligne. Le constat de fin de bloc lisait donc la séance du jour dans un ordre qu'aucun geste de l'utilisateur n'avait produit : **au squat du 20/09/2026**, `120 → 130 → 130 → 130` (5, 4, 4 au palier) s'est lu « 4-5-4 ». C'est le cas d'espèce du soulevé hex ci-dessus, par l'autre bout — là l'ordre était ignoré, ici il n'existait pas. Un départage « pour la forme » n'est pas de la stabilité : c'est du hasard rendu déterministe.

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
| **Monte** | ≥ 60 % des séances | la 1ʳᵉ série n'est pas retenue pour juger le palier, **si elle est plus légère que le palier provisoire** (§7.3) |
| **Indéterminé** | 35 – 60 %, ou moins de 8 séances | toutes les séries sont retenues, comportement par défaut |
| **Ne monte pas** | ≤ 35 % | toutes les séries sont retenues |

Les seuils 35 / 60 sont un **choix produit**, pas un résultat mesuré : la distribution est continue, pas bimodale. Ils sont placés là où l'erreur est symétrique, et ils sont paramétrables.

**Contre quoi se juge la première série — corrigé le 19/09/2026.** Elle n'est écartée que si elle est plus légère que le **palier provisoire** de la passe 1 (§7.3). Jamais parce qu'elle est plus légère que la plus lourde des séries suivantes : celle-ci peut être une exploration (§7.5), et la prendre pour repère écartait une série tenue au palier.

Cas qui a révélé le défaut, confirmé sur appareil : couché du 15/09/2026, `125×4, 125×5, 130×3`. La première série était écartée parce que plus légère que 130 ; il restait deux séries, et le §7.2 retenait la plus lourde : **palier 130**, faux. Jugée contre le palier provisoire (125, tenu sur deux séries), elle est retenue : **palier 125**. Recettes : squat du 2 février 2026 = 125 ; soulevé hex du 21/08/2026 = 130, le 120 restant une rampe (§7.4).

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

> **Résolution en deux passes.** Passe 1 : un palier *provisoire* se calcule sur les séries brutes, à deux fins seulement : situer la frontière de chauffe (§4.1) et juger la rampe (§5.2). Passe 2 : le palier *définitif* se calcule après application des §4.1, §5 et §6.

Le palier provisoire ne sort jamais de ce calcul — il n'est ni affiché, ni stocké, ni comparé à une autre séance. C'est un choix d'implémentation, pas une propriété du modèle : une autre résolution est concevable, mais elle doit être explicite, sans quoi deux développeurs produiront deux paliers différents sur la même séance.

Vérifié au banc le 19/09/2026, après correction de la rampe (§5.2) : un palier est reconnu sur **90 à 92 %** des séance-exercices selon le profil (Aurélien 90,9 %, Léa 92,4 %, Mélodie 90,5 %, Alexis 90,0 %), et sur **73,5 %** chez Jordan. L'ancien chiffre (93 à 98 %) comptait des faux paliers. Les paliers perdus sont presque tous des pyramides, tenues sur une seule série à chaque charge : le moteur s'y tait plutôt que d'annoncer un palier jamais tenu. Jordan pyramide beaucoup : à regarder avant de lui ouvrir le moteur.

### 7.4 Ce qui entre dans `n`

Les séries non retenues par les §5 et §6 ne comptent **ni au numérateur ni au dénominateur** de ce calcul.

**Nuance à ne pas perdre :** contrairement aux séries de chauffe, ce sont des séries de travail entières partout ailleurs — volume, tonnage, historique, affichage. Elles ne votent pas pour le palier, c'est tout. Le §5.4 explique pourquoi cette distinction n'est pas cosmétique.

Exemple, soulevé hex du 21/08/2026 : chauffe `60×10, 100×5`, travail `120×10, 130×10, 130×10, 130×10`. L'exercice est en état « monte » (73 %), donc la série à 120 — une rampe — n'est pas retenue. Reste `n = 3`, `k = 3` à 130 kg. **Palier 130, tenu.**

Sans cette règle, `n = 4` et `k = 3` — le palier était déjà reconnu ici, mais il ne l'aurait pas été sur une séance à cinq séries dont deux de montée.

### 7.5 L'exploration

Toute série plus lourde que le palier est enregistrée comme **exploration**. Elle est conservée, affichée, elle nourrit l'estimation du maximum. **Elle sert de test** (§9.7, tranché le 19/09/2026) : si elle atterrit au moins au bas de la zone, la charge testée avance à la séance suivante ; en dessous, le test est noté, sans effet sur le palier. Elle ne change jamais le palier du jour, qui reste défini par le §7.2.

---

### 7.6 Une séance sans charge répétée — décidé le 28/09/2026 (chantier 49)

> **Une séance sans palier (§7.2) n'efface pas la charge de travail : elle prend pour charge de travail la plus lourde charge qu'elle a tenue dans la zone** (reps comptées au moins au bas de la zone, §9.1.2). **Si aucune série de travail n'est dans la zone, elle est neutre** : la consigne suivante repart de la séance d'avant. **Une séance neutre reste une présence** (précisé le 29/09/2026) : elle ne compte pas pour la charge (palier, niveau validé, zone, habitude), mais **elle compte pour le rythme et les absences** — l'écart habituel et la dernière présence (§9.9, la reprise) se calculent sur toutes les séances datées de l'exercice, neutres comprises. On ne conclut jamais à une absence de plusieurs mois quand l'exercice a été fait la semaine d'avant.

Les séries à cette charge comptent comme les séries au palier de la séance (elles votent pour le niveau validé, §9.1.1) ; le palier du §7.2, quand il existe, reste la règle. La consigne de la séance suivante se calcule comme d'habitude, à partir de cette charge de travail (§9.3).

**Mesure S1** (cinq historiques). Une séance sans charge répétée est le plus souvent une pyramide (100, 105, 110) : on a progressé, pas régressé. Pour choisir la charge de départ, quatre candidates comparées à ce que la personne a fait **la séance suivante** (309 cas) :

| Charge de départ | Ce qui est fait ensuite, en médiane | La moitié entre | À ±5 % | Moins |
|---|---|---|---|---|
| Le palier d'avant | 108 % | 100 et 120 % | 27 sur 100 | 17 sur 100 |
| La plus lourde de la séance | 96 % | 88 et 100 % | 33 sur 100 | 47 sur 100 |
| **La plus lourde tenue dans la zone** | **100 %** | **93 et 109 %** | **36 sur 100** | 29 sur 100 |
| La dernière série de travail | 100 % | 90 et 105 % | 34 sur 100 | 41 sur 100 |

Effet, simulé sur tout l'historique (`coach49.py`) : les consignes en silence passent de **11,1 à 1,4 sur 100** ; après une séance sans charge répétée, plus aucun silence (518 cas), et ce que la personne fait vaut **100 % de la consigne proposée en médiane** (la moitié entre 97 et 108 %). Le §7.3 notait déjà que les paliers perdus sont presque tous des pyramides et que le moteur s'y taisait : c'est ce silence que cette règle remplace. *(Relevé par Claude Code dans #327 et #328 : les constats sans « suite » après une séance à trois charges différentes.)*

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

> **Le palier et le modèle charge/reps travaillent par exercice ET par format ; le compteur de stagnation, par exercice ET par zone (§12.2 bis, corrigé le 25/09/2026). Le format se déduit du niveau validé de la séance (§9.2) ; il ne se stocke pas comme un champ de configuration.**

| Format | Niveau validé de la séance-exercice (§9.2) |
|---|---|
| Force | ≤ 6 |
| Mixte | 7 – 8 |
| Hypertrophie | ≥ 9 |

Une séance-exercice se compare aux séances **du même format** sur le même exercice. Les autres sont ignorées, pas traitées comme des régressions.

**Précisé le 19/09/2026 (48b-5a), remplace la précision de 48b-2.** Le format se lit sur le **niveau validé** (§9.2), en reps comptées ; sans série au palier, pas de format. Pourquoi : la médiane des séries retenues se laissait emporter par une seule série — 125 × 8 puis 125 × 5 donnaient 6,5, « mixte », pour une séance de force, et la zone se tirait alors de vieilles séances à 100 kg. Le niveau validé se fie aux deux premières séries et ignore une série isolée.

### 8.3 Pourquoi le format ne se stocke pas

Le stocker imposerait de le demander, ce qui viole la règle §1.1, et il changerait sans que personne ne le mette à jour. Le déduire coûte une médiane et se corrige tout seul.

### 8.4 Chaque variante est un exercice à part entière

> **Une variante n'hérite de rien de son exercice parent. Elle a son propre palier, son propre compteur, son propre modèle.**

*Exception étroite, 03/10/2026 (§9.17)* : la **version lestée** d'un exercice au poids du corps (`parent` = l'exercice libre, `charge = ajoutee`) **démarre sa première ligne** de la dernière séance de l'exercice libre — 2,5 kg, au bas de la zone — au lieu de « Première fois ici ». Elle n'en hérite **ni le palier, ni le compteur, ni le modèle**.

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

**Précisé le 19/09/2026 (MOTEUR §9.1.1), pour la zone de reps : l'amorce est une porte.** Sous 8 séances, la déclaration autorise ou interdit une zone ; la zone elle-même se déduit de l'habitude dès la première séance avec un palier. Seul un exercice jamais fait n'a que la déclaration.

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

> **La cible n'essaie pas de deviner ce qui sera fait. Elle dit quoi faire.** Double progression à l'intérieur d'une zone de reps (§9.1.2), deux états et rien d'autre :
>
> 1. **Haut de la zone pas encore atteint** → même charge, cible = **niveau validé + 1** (§9.2), sans dépasser le haut de la zone (sauf zone étirée, §9.7).
> 2. **Haut de la zone atteint** → le moteur propose un **test** : **un cran** (§10) sur la dernière série, cible = **bas de la zone**. La charge avance ensuite série par série, selon la règle du test (§9.7).
>
> La condition exacte de « haut atteint », la taille du saut et le sort d'un test réussi dépendent du **réglage de rythme** (§9.8). Tranché le 19/09/2026 : la version précédente montait toutes les séries d'un coup, cible au bas d'une fourchette.

### 9.1.1 La fourchette n'est pas le format

Le format (§8) se **déduit** d'une séance passée pour savoir à quoi la comparer. La fourchette **prescrit** une séance future. Ce sont deux objets distincts, et les confondre casse le moteur de deux façons :

- Un format déduit `mixte` couvre 7 à 8 reps. Une fourchette enfermée dans cette borne n'a qu'une rep de battement — mesuré, **78 % des séances mixtes valideraient dès leur première occurrence**, soit une montée de charge quasi systématique.
- À l'inverse, monter jusqu'au haut d'une fourchette fait franchir la frontière du format. Le moteur changerait silencieusement de référentiel de comparaison au moment même où il demande l'effort.

> **La zone n'est pas le format, et elle ne vient pas du profil de travail déclaré.** Le format sert à lire le passé, la zone à écrire la consigne suivante (§9.1.2). *Révisé le 19/09/2026 : la première rédaction attachait la fourchette au profil de travail déclaré.*

**Qui décide de la zone d'un exercice — ordre fixé le 19/09/2026 :**

1. le **plan** d'un programme, quand il en existera un (§9.10) ;
2. la **correction** de l'utilisateur sur cet exercice (`zones_exercice`, ECRAN-SAISIE §3.8) ;
3. l'**habitude observée**, dès la première séance avec un palier (§9.1.2), calculée sur les séances postérieures au dernier changement de profil déclaré (§8.5.3) ;
4. le **profil de travail déclaré**, pour un exercice jamais fait (§8.5).

**Dans le code, au 19/09/2026 : seuls les rangs 2 et 3 existent.** Le plan (rang 1) viendra avec les programmes ; le profil de travail déclaré (rang 4) n'est encore ni stocké ni calculé. Sans correction ni habitude, un exercice n'a pas de zone, et le moteur se tait.

**Le rang 2 est branché — 20/09/2026 (48b-7).** La correction est la ligne la plus récente de `zones_exercice` pour l'exercice (par `corrigee_a`) ; une zone vide ramène à la déduction. **Elle l'emporte sur tout**, zone figée d'un étirement comprise, et sur la règle de bord : une zone choisie sous 3 reps d'habitude suit la règle de sa zone. Elle tient jusqu'à ce que l'utilisateur la change. Le fondement porte alors `correction.zoneDeduite` — la zone d'après l'habitude, ou rien — pour que la feuille « Pourquoi » la dise.

Le profil déclaré garde son rôle du §8.5 : une porte, pas une suggestion. Sur un exercice de moins de 8 séances, il autorise ou interdit une zone ; il ne choisit jamais la zone à la place de l'observation.

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

> **La largeur est le levier de l'objectif, et elle suit le nombre de reps — pas une étiquette déclarée.**

**Tranché le 19/09/2026 : cinq zones remplacent la fourchette en cloche.**

| Zone | Reps | Nature du travail | Appui |
|---|---|---|---|
| **Lourd** | 3-5 | force | NSCA ; Schoenfeld 2021 : la zone 1-5 bat le 8-12 pour le 1RM |
| **Mix** | 6-8 | charnière force/hypertrophie | charnière des deux zones NSCA |
| **Hypertrophie** | 8-10 | hypertrophie | zone canonique |
| **Volume** | 10-12 | hypertrophie, accessoires | zone canonique ; les deux voies se valent (Schoenfeld 2017) |
| **Séries longues** | 15-20 | isolation légère, endurance musculaire | NSCA — endurance au-delà de 12-15 |

**Menu fixe**, proposé par Aurélien. Il couvre **97 habitudes sur 100** sur les cinq profils (banc M7). Réserve : cinq pratiquants d'un même entourage.

**La zone est une intention, et la double progression se fait à l'intérieur.** C'est la correction d'un défaut de la cloche : elle plaçait l'habitude au bas de la fourchette et faisait monter les reps au-dessus. Au squat, elle demandait `125 × 6`, donc des séries de 6 à 7 reps sur un mouvement lourd, alors que ce paragraphe cite lui-même Schoenfeld 2021 pour la force à 1-5 reps.

**Déduite, jamais demandée (§1.1).** L'**habitude** est la médiane des reps de **toutes les séries au palier** sur les **8 dernières séances** du couple exercice-format — le couple est désigné par le format de **2 des 3 dernières séances** (à égalité entre trois formats, celui de la plus récente ; §8.2) —, **arrondie à l'entier supérieur**, et calculée sur les seules séances antérieures à celle qu'on prescrit (§9.12). Pourquoi 8 séances : sur tout l'historique, 7 des 23 exercices actifs d'Aurélien étaient mal rangés (banc M12) ; la science pondère le récent (Williams et al. 2017), et les coachs changent de reps au rythme de cycles de 3 à 6 semaines.

**Pourquoi 2 séances sur 3 — décidé le 19/09/2026 après simulation** (`banc_consigne48.py`). Avec la dernière séance seule, une séance isolée — une décharge à 10 reps — faisait basculer la zone. Avec la majorité des 8 dernières, un nouveau bloc — le squat passé de 7 reps à 5 le 31/08 — restait ignoré cinq séances. Deux sur trois : une séance isolée ne fait jamais basculer, un nouveau bloc est suivi dès sa 2ᵉ séance.

**La table de rangement — précisée le 19/09/2026, et c'est la seule règle** (celle du banc, qui a servi à toutes les mesures) :

| Habitude | Zone |
|---|---|
| 1 ou 2 | aucune zone : règle de bord ci-dessous |
| 3 à 5 | Lourd |
| 6 ou 7 | Mix |
| 8 ou 9 | Hypertrophie |
| 10 à 12 | Volume |
| 13 et plus | Séries longues |

Deux zones se chevauchent (8 appartient à Mix et à Hypertrophie) : c'est la table qui range, pas l'appartenance à l'intervalle. Une habitude de 8 range en Hypertrophie ; l'utilisateur peut toujours choisir Mix (ECRAN-SAISIE §3.8).

**Corrigeable d'un geste.** L'utilisateur touche l'étiquette de zone dans l'en-tête du bloc (ECRAN-SAISIE §3.8) et choisit dans le menu, sans saisie libre. La correction vaut **pour l'exercice, toutes routines confondues**, et elle devient la vérité (§1.1). Elle s'écrit dans `zones_exercice` (append-only) ; une zone vide rend la main à la déduction. **Priorité (amendée le 05/10/2026, chantier 53) : la déclaration la plus récente l'emporte, puis la déduction.** Un bloc pose ses zones **à son début**, comme des lignes datées de `zones_exercice` (`origine = 'bloc'`) ; une correction de la personne pendant le bloc est plus récente, donc **elle l'emporte** — la personne décide (§1.1). Une seule notion, une seule lecture (`zoneEnVigueur`, `correctionAu`) : pas de troisième étage. Pas de zone par jour (`routine_exercises`) : l'ondulation (deux zones d'une même barre dans une semaine) reste notée pour plus tard.

**15-20 reste une zone, pas une cible nue.** « Vise 15 » serait inatteignable après un gros saut ; avec un bas, le moteur repart de là où l'on atterrit.

**Deux règles de bord.**

> **Sous 3 reps, le moteur ne demande jamais une rep de plus.** Il propose le plus petit incrément de charge disponible, rien d'autre. La variabilité journalière de ±18 % (Jovanovic & Flanagan 2014) dépasse l'écart entre une rep et deux : prescrire « une de plus » sur un simple lourd revient à demander un record à chaque séance.

> **Jamais au-delà de 30 reps.** La zone Séries longues s'arrête à 20, mais une zone étirée (§9.7) peut monter plus haut, jamais au-delà de 30. Mesuré (banc M15) : sur les crans de plus de 10 %, 41 tests ratés sur 100 exigeraient plus de 20 reps pour regagner les reps perdues, aucun plus de 30. Au-delà, on ne propose plus d'allonger, on propose de charger.

**La zone appartient au couple exercice-format, pas à la personne.** C'est le point le plus important du tableau, et il est contre-intuitif : ce n'est pas le powerlifter qui vit à 3-5 reps et le pratiquant loisir à 15+. **Le powerlifter couvre le spectre le plus large** — maximaux à 1-3, force à 3-5, accessoires à 8-12, élévations latérales et gainage à 15+. Une pratique orientée hypertrophie en couvre moins ; une pratique d'entretien reste sur une bande étroite autour de 10-15.

> Un même utilisateur a donc, **le même jour**, un squat en zone Lourd et des élévations latérales en Séries longues. Le moteur le gère sans rien demander, puisque la médiane est déjà calculée par couple (exercice, format). Une largeur attachée au profil de travail déclaré aurait imposé la même valeur à tous ses exercices — c'était l'erreur de la première rédaction de ce paragraphe.

L'habitude range l'exercice dans une zone ; c'est ensuite la zone qui fixe le bas et le haut. Avec le rangement retenu, l'habitude tombe au bas de sa zone ou dedans : le moteur ne demande pas moins que ce que la personne fait déjà. Aucune de ces valeurs n'a besoin d'être exacte — l'autorégulation reste entière, seule l'orientation du progrès change.

**Mesure de contexte.** Répartition des couples exercice-format des cinq profils par zone : 1-2 reps **0,4 %** · 3-5 **2,2 %** · 6-7 **3,1 %** · 8-12 **65,2 %** · 13-15 **15,4 %** · 16+ **13,7 %**. La zone force est marginale dans cette base — les bornes basses viennent donc de la pratique du coaching, pas de la mesure, et sont à revoir si des profils de force arrivent. La zone haute, elle, représente **29 % du travail réel** et était mal servie par la version précédente, qui l'aurait élargie au lieu de la resserrer.

### 9.1.3 Les deux garde-fous

> **Statut au 19/09/2026 — plus en vigueur, conservé pour mémoire.** Ces deux garde-fous avaient été calibrés sur un historique sans consigne. **Le garde-fou 1 disparaît avec la règle de transition (§9.1.4)**, dont il n'était que le complément : sous consigne, il produisait des cibles absurdes (tirage visage : « 24,8 × 21 », une rep de plus au-delà du plafond, parce que la charge n'était pas au record du 1ᵉʳ/09). **Le garde-fou 2 est sans objet sous consigne** : le moteur demande une rep de plus à chaque séance, et qui ne l'atteint jamais relève du compteur de stagnation (§12) et de l'escalier (§14). Les mesures ci-dessous restent vraies.

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

> **Sous prescription, la règle principale est la double progression elle-même (§9.1) : haut de la zone atteint → test d'un cran (§9.7).** Aucun proxy.

Rôle de chaque pièce après cette bascule — **révisé le 19/09/2026** :

| Pièce | Statut sous prescription |
|---|---|
| Double progression dans la zone (§9.1, §9.1.2) | **règle principale** |
| Règle du test (§9.7) | **fait avancer la charge**, série par série |
| Réglage de rythme (§9.8) | règle la condition de montée, le saut, le sort d'un test réussi |
| Garde-fou 1 — au record de charge (§9.1.3) | **retiré** avec la transition |
| Garde-fou 2 — ancienneté du palier (§9.1.3) | **sans objet** sous consigne |
| Dépassement ≥ médiane+1 (transition) | **supprimé** |

**Pourquoi la transition est supprimée.** Elle devait éviter un moteur muet au premier jour. Mesuré (banc M13) : elle n'ajoute presque rien aux zones, et ce qu'elle ajoute, ce sont surtout des exercices d'isolation dont les reps ont dérivé par choix (écarté machine, triceps corde passés à 15 reps) : elle prenait une dérive de pratique pour un progrès. Les tests la remplacent : on part du palier actuel et l'on sonde par une série test, là où elle montait toutes les séries d'un coup. C'est ce que recommandent la science (autorégulation par série test, Zhang et al. 2021) et les coachs (démarrer prudemment, Wendler).

**Ce qui reste à vérifier sur les premières données réelles.** La bascule suppose que la cible sera atteinte assez souvent pour faire avancer la double progression. Si les cibles sont manquées bien plus souvent que prévu, c'est le rangement en zones (§9.1.2) ou le réglage de rythme (§9.8) qu'il faudra revoir, pas la règle. Chaque consigne écrite dans `predictions` porte sa zone et son réglage (§9.11) : c'est ce qui rend cette vérification possible. **Les premières semaines d'usage sont un test, pas une mise en service.**

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

**Le niveau validé — défini le 19/09/2026.** C'est le plus haut nombre de reps *c* tel que les deux premières séries au palier font au moins *c*, et les suivantes au moins *c* − 1. Une série marquée « max » compte ses reps (§17.4, révisé le 11/10/2026 — 74) ; ce qui l'empêche de faire monter la consigne suivante est au §17.4. Exemples : `5-5-4-4` → niveau 5 ; `4-5` → niveau 4 ; `12-12-11` → niveau 12. C'est ce niveau que la consigne suivante augmente d'une rep (§9.1), et c'est lui qui dit si le haut de la zone est atteint.

Avec **une seule série au palier**, le niveau est son nombre de reps compté ; **sans série au palier**, il n'y a pas de niveau.

### 9.2 bis La chute de fin de séance — décidé le 30/09/2026 (chantier 49)

> **Une dernière série qui s'effondre après des séries stables ne dit rien du niveau ; elle dit que la fatigue est arrivée. Elle ne tire pas le niveau vers le bas, et la séance suivante ne teste rien de plus lourd.**

**Définition.** La **dernière** série de travail au palier est une **chute** si **au moins deux séries la précèdent**, toutes à la même charge et **à une rep près de la première** (reps comptées, §17.4), et si elle perd **au moins 4 reps et au moins 30 %** par rapport à la première. Exemples : `10-10-6` → chute ; `12-12-11-7` → chute ; `8-7-4` → chute ; `10-4-4` → pas de chute (les séries d'avant ne sont pas stables : c'est la première qui sort du lot) ; `15-15-11` → pas de chute (−27 %) ; `10-10-7` → pas de chute (−3 reps) ; `10-5` → pas de chute (une seule série avant).

**Ce qu'elle change.**
1. **Le niveau validé se calcule sans elle** : `10-10-6` → niveau 10 (et non 7). La zone déduite de l'habitude et le compteur de stagnation lisent ce niveau-là.
2. **À la séance suivante, aucun nouveau test** : un test proposé, un retest ou un retest d'un cran devient **« tenir »** — la ligne au palier, au niveau validé (borné au haut de la zone), sans ligne haute. Une échelle déjà en cours (§9.7 : garde, étend, rejoint, attend) n'est pas touchée.
3. **La réaction en séance n'est pas touchée** (§9.14) : si la personne fait 3 reps de plus que visé, le coach réagit — la séance en cours fait foi.

**Pourquoi.** Les séries 1 et 2 sont les plus représentatives (§9.2) ; une chute qui survient après elles est une courbe de fatigue, pas un défaut de maîtrise — la même logique que la tolérance à −1, poussée jusqu'au bout. Mais une chute annonce une fatigue qui peut durer (19 % de rechutes à la séance suivante, contre 3 %) : la prudence est de ne pas tester plus lourd tout de suite. Les coachs ne montent pas une charge juste après un effondrement ; la science ne dit pas autre chose (la fatigue aiguë se dissipe en 24 à 72 heures, pas toujours d'une séance à l'autre).

**Phrase** (voix du coach) : dans l'en-tête de la séance suivante, en gris, « Mardi : 80 kg × 10, 10, 6. Je ne compte pas la dernière série : on tient 80 kg × 10. » — un fait, puis sa conséquence.

### 9.3 Réserve honnête

Sur l'historique, cette règle aurait envoyé Aurélien à 122,5 kg dès le 14/07 (profil `5-5-5-4`), et 122,5 s'est écroulé à `4-4-3-3` le 04/08. **Une seule observation** — insuffisant pour conclure que la règle est trop permissive. À revérifier avec Jordan, Léa et Alexis.

**Revérifié le 19/09/2026 sur les cinq profils**, avec le critère « la montée tient-elle » (BANC §12.4 : la charge atteinte est réutilisée dans les trois séances suivantes). Réglage Normal : **79 montées sur 100 tiennent** (386 montées suivies), contre **80 sur 100** pour les montées spontanées des mêmes personnes (1 153). La règle n'est pas plus permissive que leur propre pratique.

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

**Soldé le 19/09/2026.** Ces douze pistes avaient été jugées sur un critère d'imitation — « la personne est-elle montée à la séance suivante » —, que le banc a depuis retiré (BANC §12.3). Rejouées sur le critère « la montée tient-elle » (BANC §12.4) : la **confirmation sur deux séances** et le **2-pour-2** tiennent, et servent de base au réglage Prudent (§9.8) ; les fourchettes sont remplacées par les zones (§9.1.2) ; le reste est exclu par la doctrine. Ne pas les retenter.

### 9.6 Pourquoi la cible ne se corrige pas par la charge

Tentative documentée et **rejetée par la mesure**. Puisque la cible tombe moins souvent juste quand le palier a changé (56,6 % contre 72,6 % chez Aurélien, clivage confirmé sur les cinq profils), l'idée était de la conditionner à la charge via le modèle du §15.

Résultat : la justesse s'effondre de 57 % à 8 % chez Aurélien, et dans les mêmes proportions partout ailleurs, quelle que soit la pente retenue.

La raison, sur 1 544 changements de charge : **la variation médiane du nombre de reps est zéro dans toutes les tranches**, y compris au-delà de +10 % de charge. Ce qui change n'est pas la médiane mais la dispersion — écart-type des variations de reps de 1,50 à charge inchangée contre 3,00 à charge changée.

> **Un changement de charge n'abaisse pas la cible, il élargit l'incertitude autour d'elle.** Le moteur n'en déduit rien : c'est exactement le cas où la cible sera le plus souvent ratée, et rater n'est pas un événement (§12).

Ceci vaut pour la déduction de la cible. Le modèle charge/reps du §15 conserve son rôle de filet au premier passage, qui n'est pas affecté.

### 9.7 La règle du test — tranchée le 19/09/2026

Énoncé d'Aurélien : « L'exploration sert de test à la montée d'une charge. Si on atterrit dans la fourchette et pas en dessous, on réessaye la prochaine fois de refaire ça une série de plus, ou garder en dernière série mais en grattant des reps. »

> **Une série plus lourde que le palier est un test. S'il atterrit au moins au bas de la zone, la charge testée avance d'une série à la fois ; sinon, il est noté et le palier reprend la main.**

| Où atterrit le test | Séance suivante (réglage Normal) |
|---|---|
| **Sous le bas** de la zone | Test raté : noté, palier inchangé. Le palier reprend la double progression ; au haut de la zone, le moteur reteste **d'un seul cran** |
| **Au bas** | La charge testée est **gardée** sur la dernière série ; on gratte des reps |
| **Dedans** | Elle est **étendue d'une série** |
| **Au haut** | Normal : étendue. Franc : tout passe, sauf en zone Lourd. Prudent : c'est là, et seulement là, que la série précédente la rejoint (§9.8) |

Le palier bascule de lui-même quand la charge testée tient la majorité des séries (§7.2).

**L'échelle — décidée le 19/09/2026.** La nouvelle charge entre par la dernière série et gagne les séries **de la dernière vers la première**, une par séance. Après la bascule, les séries restées à l'ancien palier continuent de monter une par séance jusqu'à toutes ; les rampes plus légères que l'ancien palier et les chauffes ne bougent pas. **Les reps d'un test se comptent comme celles du palier** (§17.4) : une série à RPE 10 ou « reste 0 » compte ses reps, et le test qui la suit ne monte pas sur elle (74). Pourquoi la dernière série : l'ordre des séries lourdes ne change pas les gains (pyramides montantes et descendantes font jeu égal) ; c'est la pratique d'Aurélien, celle de l'APRE et de la méthode DeLorme, et l'écran garde un seul langage.

**Un test raté se reprend d'un seul cran — validé le 19/09/2026**, même si le test raté valait deux crans (couché : 130 raté → le moteur proposera 127,5). **Si même un cran échoue**, parce que la salle ne fait pas plus petit, la zone **s'étire** : le palier gratte des reps au-delà du haut, et le moteur reteste quand il a regagné les reps perdues au test. Curl marteau : `32 × 8` raté en zone Volume 10-12 — au-delà d'une paire de 20 kg, les haltères vont de 4 en 4 (2 kg par main), le cran ne peut pas être plus petit → on reteste 32 quand le palier fait 28 × 16 (12 + 4 perdues). Jamais au-delà de 30 reps (§9.1.2).

**Pendant l'étirement, la zone reste celle du premier test raté** — décidé le 19/09/2026 après simulation : sinon les reps étirées entrent dans l'habitude et font glisser l'exercice vers une zone plus haute (le curl marteau passait de Volume en Séries longues), et le retest se jugerait contre la mauvaise zone. Les reps perdues se comptent contre le niveau validé du jour du test. L'épisode se clôt au retest réussi ou au changement de palier.

**Garde-fou — en zone Lourd, au plus une série de plus par séance**, même en Franc. Remarque d'Aurélien : plus c'est lourd, plus c'est dur d'enchaîner les séries. Ses données ne le confirment pas (14 cas lourds seulement, banc M5) : c'est un garde-fou, pas une règle centrale.

**Consigne à deux charges.** Quand un test est gardé ou proposé, la consigne porte deux charges, sur deux lignes : « 125 kg, vise 5 », puis « 130 kg en dernière série, vise 4 » (ECRAN-SAISIE §3.1).

**Cas réels (banc M8, réglage Normal, habitude sur 8 séances) :**

| Exercice | Dernière séance | Consigne |
|---|---|---|
| Couché barre | 125×4, 125×5, **130×3** (au bas de Lourd) | 125 kg, vise 5 — puis 130 kg en dernière série, vise 4 |
| Squat barre | 120×5, 125×5, 125×5, **130×5** à RPE 10 (compté 4 : dans Lourd) | 130 kg sur les 2 dernières séries, vise 4 — et 125 kg sur la deuxième, vise 5 ; la première, une rampe, ne bouge pas |
| Rowing poulie en V | 93×10, 93×10, **100×10** (au bas de Volume) | 93 kg, vise 11 — puis 100 kg en dernière série, vise 11 |
| Couché haltères | 88×10 ×3, **92×6** (sous Volume) | 88 kg, vise 11 |
| Curl barre EZ | 30×12 ×3 (haut de Volume) | 30 kg, vise 12 — puis 32,5 kg en dernière série, vise 10 (repli de la barre, §10.2) |

**Parentés dans le métier** : la double progression dynamique (chaque série progresse pour son compte), les Joker sets de Wendler (une série plus lourde les bons jours), l'APRE de Mann (charge ajustée sur les reps d'une série test). **Ce que fait Aurélien après un test réussi** (515 tests, banc M5), sur 100 : gardé sur une série 35, abandonné 30, passé sur toutes 22, étendu d'une série 12.

### 9.8 Les réglages de rythme — tranchés le 19/09/2026

> **Le réglage agit sur trois choses : quand la charge monte, de combien, et ce que devient un test réussi. Jamais sur le vocabulaire** (CADRAGE §2 terdecies).

| Réglage | La charge monte quand | De combien | Après un test réussi |
|---|---|---|---|
| **Juste un carnet** (`intention = 'entretien'` ; « Entretenir » jusqu'au 07/10/2026) | Jamais : le coach se tait entièrement — ni proposition, ni phrase, ni charge de dégressive, ni chauffes du coach, ni bandeau de décharge, ni semaine allégée, ni carte de fin de bloc (I13, précisé le 07/10/2026, #382) ; les séries restent pré-remplies avec la routine et la dernière séance | — | Noté, sans suite |
| **Prudent** | Toutes les séries au haut de la zone, deux séances de suite (repère NSCA « 2-pour-2 ») | 1 cran | Gardé sur la dernière série jusqu'à y toucher le haut de la zone ; alors la série précédente la rejoint |
| **Normal** (défaut) | Niveau validé au haut de la zone (§9.2), sans séance de confirmation | 1 cran | Étendu d'une série s'il dépasse le bas, gardé s'il y est |
| **Franc** | **Dès qu'une série** touche le haut de la zone (le déclencheur de la double progression dynamique) | **2 crans** si le haut est dépassé de 3 reps, ou si l'effort dit « facile » (logique APRE), **et** si deux crans restent sous 10 % de la charge | Comme Normal ; tout passe d'un coup s'il touche le haut, sauf en zone Lourd |

**Garde-fous du réglage Franc** : jamais plus de 2 crans en une fois ; le double saut exige une preuve (haut dépassé de 3 reps, ou effort « facile », §17.3) ; **deux crans seulement s'ils restent sous 10 % de la charge** — corrigé le 19/09/2026 : l'ancienne limite « un cran sur les grosses barres » était à l'envers. L'ACSM prévoit des hausses plus faibles pour les exercices à petite masse musculaire et plus fortes pour ceux à grande masse ; l'APRE de Mann a été éprouvée au couché et au squat, avec des hausses de 2,5 à 10 kg. Au couché à 125 kg, deux crans font 4 % : permis ; au curl EZ à 30 kg, 17 % : un seul cran. Un cran reste toujours permis, même au-delà de 10 % : c'est le plus petit saut de la salle. En zone Lourd, une série de plus au maximum par séance (§9.7).

**Mesuré (banc M11, critère BANC §12.4, cinq profils).** Combien de fois sur 100 séances le réglage propose de monter, et combien de montées suivies tiennent :

| Réglage | Propose de monter | Tiennent |
|---|---|---|
| Prudent | 12,4 | 80 sur 100 (115 montées) |
| Normal | 27,6 | 79 sur 100 (386) |
| Franc | 33,2 | 81 sur 100 (448) |
| *Montées spontanées, sans consigne* | — | *80 sur 100 (1 153)* |

**Prudent est plus lent, pas plus sûr** : les montées tiennent autant quel que soit le réglage. C'est un fait pour qui conçoit le moteur, pas un argument affiché par l'app.

**Où il vit.** `profiles.intention` (progresser | entretien) décide si le moteur parle de charge ; `profiles.rythme_progression` (prudent | normal | franc, défaut normal, `v2_046`) règle le rythme. Écran : ECRAN-PROFIL §2.3. Chaque consigne écrite dans `predictions` porte son réglage (§9.11) : les premières semaines pourront comparer les réglages entre eux.

**Appui.** Chez des sujets entraînés, régler la charge sur la performance du jour fait mieux que des charges fixes, et APRE arrive en tête (Zhang et al. 2021 ; méta-analyse en réseau de 2025). Réserve : 8 études, 166 sujets, 5 à 10 semaines. L'ACSM (2009) recommande +2 à 10 % quand on dépasse de 1 à 2 reps le nombre visé.

### 9.9 La reprise après une coupure — tranchée le 19/09/2026

> **Après une coupure, le moteur ne demande pas de rep de plus. Au-delà de 12 semaines, il repart un cran sous le dernier palier.**

Coupure au sens du §12.6 : un écart depuis la séance précédente supérieur à 3 fois l'écart habituel de l'exercice.

**Précisé le 19/09/2026 (48b-3).** L'écart habituel est la médiane des **8 derniers** écarts, en jours, entre les séances consécutives de l'exercice antérieures à celle qu'on prescrit (§9.12) — **le rythme actuel, pas celui d'il y a un an** (précisé le 01/10/2026 : un militaire fait deux fois par semaine à l'automne 2025, une fois par semaine depuis, voyait 14 jours d'absence comme une reprise ; la zone se lit déjà sur les 8 dernières séances, même logique). **Une reprise, courte ou longue, ne vise jamais au-dessus du haut de la zone** (précisé le 01/10/2026 : 52,5 kg × 10 en zone Mix 6-8) ; les autres états ne sont pas bornés, l'étirement dépassant la zone exprès ; il faut au moins deux séances pour en avoir un, sinon il n'y a pas de coupure. La coupure est stricte : à 3 fois l'écart habituel pile, il n'y en a pas. La durée qui départage les deux reprises se compte de la dernière séance à celle qu'on prescrit : jusqu'à 84 jours inclus, reprise courte ; au-delà, reprise longue.

| Coupure | Consigne |
|---|---|
| Jusqu'à 12 semaines | Dernier palier, cible = niveau validé, **sans +1** |
| Au-delà de 12 semaines | **Un cran sous** le dernier palier, cible = niveau validé ; la règle du test ramène la charge (§9.7). **Jamais plus de 10 % sous le dernier palier** (27/09/2026) : si le cran le plus proche descend plus bas, la consigne garde le dernier palier, sans rep de plus |

**Précisé le 27/09/2026.** Le « cran » d'une machine peut valoir 15 à 30 % de la charge (curl pupitre : 32 → 23 kg, −28 %), alors que ce repli veut couvrir une perte de 6 à 9 %. Sur les cinq historiques, l'ancien cran descendait de 17 % en médiane (jusqu'à 67 %) dans une reprise longue sur deux (97 sur 181). **Mesure R1** : au retour, la performance vaut 94 à 101 % du niveau d'avant en médiane, la moitié des retours entre environ 84 et 105 % — que la personne se soit arrêtée ou que l'exercice soit sorti d'une rotation pendant que ses muscles travaillaient ailleurs.

**Mesuré (banc M14, coupures de plus de 21 jours, cinq profils)** : la reprise se fait à 100 % du palier en médiane, et la personne le tient dès la première séance 73 à 74 fois sur 100 jusqu'à 12 semaines, 73 fois sur 100 au-delà. **Appui** : pas de perte mesurable jusqu'à une semaine environ ; −6 à 9 % du maximum après 4 semaines d'arrêt complet chez des entraînés (Izquierdo et al. 2007), puis une perte qui s'accélère (Mujika & Padilla 2000). Un recul de 6 à 9 % fait perdre 1 à 2 reps à charge égale : « même charge, sans rep de plus » l'encaisse. Au-delà de 12 semaines, les données se font rares ; la science et les coachs tranchent pour un cran en dessous.

**Ce que l'app dit** : « On reprend à ton dernier palier, sans rep de plus. » / « On reprend un cran sous ton dernier palier, 125 kg. » **Jamais la durée de l'absence** (CADRAGE §3.1 bis) : la date de la dernière séance reste dans la feuille « Pourquoi ».

### 9.10 Phases et blocs — les prises du moteur, décidées le 19/09/2026

> **En powerbuilding, on périodise le côté force (les barres), pas le côté muscle. La phase appartient à chaque exercice, pas à la séance ni au programme.**

Appui : Moesgaard et al. 2022 (35 études, volume égal) — périodiser fait gagner plus de force, seulement chez les entraînés, et n'apporte rien au muscle. Le moteur ne fabrique pas de programmes (§20.1), mais il doit pouvoir en suivre un. **Câbler tôt, remplir tard** — quatre prises :

| Prise | Ce que fait le moteur |
|---|---|
| **Bloc** : la zone d'une barre change pour plusieurs semaines | **La charge se reporte** (câblé le 05/10/2026, chantier 53 — pour tout changement de zone : correction, reprise, bloc) : quand la zone retenue pour la séance diffère de la zone de la dernière séance non neutre (celle de son niveau validé), la charge = **la plus basse** de (a) la dernière charge **tenue dans la zone visée dans les 90 jours** et (b) l'**estimation** depuis le dernier palier, P × (1 + n/30) / (1 + bas/30), **arrondie au cran inférieur** de l'exercice ; la visée = **le bas de la zone**. L'estimation reste en coulisse : la phrase grise dit d'où vient la charge — « Nouvelle zone : Mix. Ta charge déjà tenue en Mix, le 8 déc. : 110 kg × 6. » ou « Nouvelle zone : Mix. Estimée depuis ton 125 kg × 4, un peu en dessous pour démarrer. » ; **quand la charge reportée est plus haute que le dernier palier** (vers une zone de moins de reps), « Nouvelle zone : Mix. Moins de reps, plus de charge : estimée depuis ton 52,5 kg × 10. » (précisé le 05/10/2026, #368 : la phrase dit le vrai sens). **Quand le changement vient d'un début de bloc** (§9.22), la même phrase commence par « Nouveau bloc : Mix. » au lieu de « Nouvelle zone : Mix. » — le reste ne change pas (précisé le 06/10/2026, #369 : même fonction, l'origine de la ligne de zone en paramètre). La zone de la séance précédente se lit **à sa fin**, et c'est **celle de sa consigne**, pas celle de ses reps — **jamais un maximum**. Le compteur de stagnation repart à zéro (§12.2 bis, déjà câblé). Référence : `report_zone53.py`, cas `cas_report53.json` |
| **Ondulation** : deux zones pour une même barre dans la même semaine | Deux paliers avancent en parallèle, sans remise à zéro |
| **Semaine de décharge** | **Déclarée, jamais déduite** (tranché le 25/09/2026) : ni stagnation ni coupure. Une séance plus légère ne dit pas pourquoi elle l'est — décharge, jour sans, douleur ; d'ici à la déclaration, une séance où la consigne n'a pas été suivie est simplement neutre pour le compteur (§12.2 bis). **Déclarée — acceptée depuis l'escalier (§14) ou, plus tard, planifiée par un programme — elle a sa consigne** (précisé le 25/09/2026) : mêmes exercices et même charge, séries −40 %, 2 reps de moins que la visée, aucun test ni montée. L'ancienne règle « aucune proposition de charge » est retirée |
| **Phase** | Notée dans `predictions` avec chaque consigne (§9.11) |

Aujourd'hui, la phase se **déduit** de l'historique. Le futur chantier programmes l'**écrira** : une zone par jour dans `routine_exercises`, avec la priorité plan > correction > déduction (§9.1.2).

### 9.11 Ce que le moteur écrit dans `predictions` — décidé le 19/09/2026

> **Une ligne par série de travail proposée** — corrigé le 20/09/2026 (48c). `set_observe` ne désigne qu'une seule série : une prédiction en désigne une aussi. Depuis le 26/09/2026 (§9.13), une ligne s'écrit **pour chaque série de travail validée** que la consigne couvre, avec son rang : une séance de trois séries en écrit trois, une séance de deux en écrit deux. **Une série validée puis supprimée** vide l'observation de son pari (le trigger `sets_efface_observation` le fait en base) ; le pari reste, non observé : le coach a bien parié au moment de la validation, et un pari non observé ne ment pas (tranché le 26/09/2026, #322).

| Champ | Contenu |
|---|---|
| `grandeur`, `valeur_predite` | `reps` et les reps visées de cette série — **le pari du moteur**. La charge est une prescription qu'on suit ou non, pas une prédiction : elle vit dans le fondement et sert à l'appariement |
| `borne_basse`, `borne_haute` | les bornes de la zone : elles diront plus tard combien de fois le moteur a visé dedans |
| `fondement` (jsonb) | le rang de la série, sa charge, l'état, la zone, le réglage, le palier, le niveau validé, l'identifiant de la séance |
| `valeur_observee`, `observee_a`, `set_observe` | remplis après la séance — les seuls champs modifiables |

**Immuable** : le trigger `predictions_immuable` (`v2_046`) refuse toute modification d'une prédiction, hors ces trois champs. Aucune migration de plus : la table reste générique (CADRAGE §5). L'écriture est un chantier à risque (CADRAGE §2 septies), traité à part.

**Quand — révisé le 26/09/2026.** **À la validation de chaque série de travail couverte, juste avant son observation**, avec ce que sa ligne affichait à ce moment-là (charge, visée, rôle) : c'est ce que l'utilisateur a lu et sur quoi il a agi. Le rang est celui de la série au moment où elle est validée, et il ne change plus (§9.13). Ni à chaque redessin, qui noierait la table, ni la veille au constat, qu'un historique modifié peut encore changer. *(Le 20/09 : à l'affichage de la consigne, une fois par séance et par exercice — des paris pour des séries qui n'ont jamais existé quand la séance en comptait moins que `n`, et des paris qui changeaient de série à chaque ajout ou retrait.)* Rien n'est écrit quand le moteur se tait (silence, Entretenir, mesure sans charge). L'écriture passe par la file d'attente hors ligne, avec un identifiant créé sur l'appareil — **déterminé, pas tiré au hasard** (corrigé le 21/09/2026, 48c-2) : SHA-256 de (séance | exercice | rang), mis en forme d'UUID. *Précisé le 04/10/2026 (#363)* : quand un même exercice figure deux fois dans la séance, **l'occurrence** (son identifiant dans la séance) entre dans le calcul, pour que leurs paris ne se confondent pas ; sans occurrence, l'identifiant ne change pas — les paris déjà écrits restent lisibles. Deux instances de l'app ouvertes dans la même milliseconde avaient noté deux fois le même squat, chacune ayant lu le stockage local avant que l'autre n'écrive. Avec un identifiant déterminé, la seconde écriture est ignorée à destination : l'idempotence vit dans la donnée, pas dans une garde en mémoire.

**Une série qui cesse d'être une série de travail perd son observation — décidé le 28/09/2026.** Changer une série validée en échauffement (ou en dégressive) vide l'observation de son pari, comme la suppression : des reps d'échauffement ne jugent pas un pari de travail. **Une série marquée « échec » est une tentative manquée** (« Tentative manquée » à l'écran, « série ratée » dans Hevy) : elle ne compte pas pour la charge de travail (§7) et n'est pas couverte (§9.13) ; **la passer en échec vide aussi l'observation de son pari**, comme l'échauffement et la dégressive (précisé le 28/09/2026 ; remplace la précision du même jour qui en faisait une série de travail). Le déclencheur en base suit la même règle (migration `v2_050`, qui annule `v2_049`). L'app le fait (sur l'appareil et dans la file) ; la base le garantit aussi (le déclencheur de la suppression s'étend au changement de type).

**L'observation part après son pari — précisé le 28/09/2026 (#329).** Dans la file, l'observation d'un pari est une entrée à part, qui ne part qu'après la création du pari ; elle n'est tenue pour posée qu'une fois la base d'accord ; si sa série n'est pas en base, elle l'attend. « Terminer » renvoie les observations des séries encore validées. Détail : ECRAN-SAISIE §7 sexies.1.

**L'observation — corrigée le 21/09/2026 (48c-2), après la première séance réelle.** À la validation, la série faite **au même rang** est toujours reliée (`set_observe`), quelle que soit sa charge : une exploration dit quelque chose, elle ne doit pas disparaître de la table. Mais ses reps ne deviennent une observation (`valeur_observee`, reps **faites** — révisé le 11/10/2026, 68B : une série à fond n'en perd plus une) **que si la consigne a été suivie** : même charge ; ou, quand la charge proposée est inconnue (« le cran au-dessus »), n'importe quelle charge au-dessus du palier. Comparer « vise 4 à 130 » à « 3 à 135 » ne dirait rien de la visée du moteur. Trois cas se lisent ainsi : suivie (série et reps), **autre chose tenté** (série, sans reps), rien fait à ce rang (ni l'un ni l'autre). Corriger la charge ou dévalider refait ce calcul, et retire ce qui est devenu faux. La série partant avant la prédiction dans la file (`depend`), la clé étrangère de `set_observe` trouve toujours sa série.

**Les révisions — décidé le 25/09/2026 (§9.14).** Une consigne revue en cours de séance est **un nouveau pari**, écrit à côté du premier, jamais à sa place : la table est immuable. Chaque changement du plan porte un **numéro de révision** par séance et par exercice, qui commence à 1 : la proposition du coach, puis, si la montée tient, les séries suivantes passées à la charge montée. Une ligne par série dont la charge change, une seule fois. **Elle s'écrit quand la série déclencheuse est définitive** — à la validation de la série qu'elle concerne, juste avant son observation — et non à l'affichage : l'effort se saisit pendant le repos, jusqu'à 30 secondes après la validation et au-delà (§17.4), et un RPE 10 peut retirer la proposition. Affichée dès la validation, elle disparaît si l'effort la retire, et rien n'a été écrit : une intention retirée n'a jamais été un pari. Sans série suivante (l'exercice s'arrête là), rien ne s'écrit. Un retour au palier ne s'écrit pas : il rend sa valeur au pari de la consigne, qui n'a jamais cessé d'exister.

- **L'identifiant reçoit la révision** : SHA-256 de (séance | exercice | rang | révision), mis en forme d'UUID. **La révision 0 — la consigne de l'ouverture — garde la formule sans révision** : aucun identifiant existant ne change.

- **Quelle révision porte chaque ligne — précisé le 25/09/2026.** Une seule proposition par bloc (§9.14) : dans le plan, **la première ligne dont la source est le coach porte la révision 1** (la série proposée), **les suivantes la révision 2** (les séries passées à la charge montée, une fois la montée tenue). Une ligne de la consigne ou revenue au palier (« retour ») garde la révision 0 : son pari est celui de l'ouverture. La règle se lit sur le plan seul, sans mémoire de l'ordre des événements.
- **Une proposition refusée écrit aussi son pari** (tranché le 25/09/2026, #318) : à la validation de la série qu'elle concerne, comme une proposition prise ; son observation dit « autre chose tenté ». C'est un refus enregistré, pas un oubli : le coach a affiché une affirmation, `predictions` en garde la trace, et l'on saura combien de propositions sont prises, pas seulement si celles qui le sont tiennent.
- **La garde qui empêche d'écrire deux fois un pari porte sur (séance, exercice, rang, révision)** (#318) : plusieurs lignes peuvent porter la révision 2 ; sans le rang, seule la première s'écrirait.
- **Une observation ne change jamais de série tant que la sienne existe et reste validée** (précisé le 26/09/2026, diagnostic « + Série ») : corriger ou dévalider **la même** série refait l'observation ; une autre série qui prend son rang (une série ajoutée, une série supprimée plus haut) ne la remplace pas. Tant que le rang d'une série n'est pas figé à sa validation (§9.13 — à trancher avant l'escalier isolé), une série qui prend le rang d'une observation déjà faite n'est pas observée : mieux vaut un pari non observé qu'un pari faux.
- **Une série n'observe qu'un seul rang** (précisé le 26/09/2026, #321) : sans cette règle, après la suppression d'une série, une autre série qui prend le rang libéré pourrait se rattacher au pari d'un rang dont l'observation vient d'être vidée. Avec la séance en cours qui fait foi (§9.13, 26/09), ces deux gardes restent comme filet.
- **Le fondement** porte la révision, la série déclencheuse (rang, charge, reps saisies, reps comptées, marge), les charges proposées (une ou deux), la source de la borne haute (`programme`, `habitude`, `preconisation`), et tout ce que la consigne y mettait déjà (zone, réglage, palier, niveau validé, séance). `valeur_predite` : le bas de la zone ; `borne_basse` et `borne_haute` : la zone.
- **L'observation** suit la règle du 48c-2 **pour chacun des paris du rang**, jamais pour le premier trouvé (l'ordre de lecture suit l'identifiant haché, donc le hasard) : relié au même rang toujours ; reps faites (68B) seulement si la consigne de **ce** pari a été suivie — pour une proposition à deux charges, l'une ou l'autre. Deux paris sur un même rang se départagent ainsi seuls : celui dont la charge a été faite compte ses reps, l'autre se lit « autre chose tenté ».

**L'intégrité — décidée le 21/09/2026 (`v2_047`).** Deux séances de test supprimées avaient laissé 24 prédictions orphelines, dont 8 « comptées sans série » : la clé de `set_observe` ne vidait que le lien et laissait les reps. Une observation doit dire le vrai, quitte à se taire. Trois règles, tenues par la base et non par l'app :

- **Une séance supprimée emporte ses prédictions.** `predictions.session_id` est une colonne générée depuis `fondement ->> 'seance'`, avec une clé en cascade vers `sessions`. Le fondement **doit** donc porter la clé `seance` : une prédiction écrite sans elle survivrait à sa séance.
- **Une série supprimée emporte toute son observation** — lien, reps et heure (trigger `sets_efface_observation`), et pas seulement le lien.
- **Une observation comptée sans série est impossible** (contrainte `predictions_observation_coherente`) : des reps sans série seraient un fait faux.

Le verrou d'immuabilité ne se desserre pas : `session_id` est exclue de sa comparaison parce que PostgreSQL la calcule après les déclencheurs `BEFORE`, mais `fondement`, sa source, reste verrouillé. Détail et pièges de la migration : `SCHEMA-REEL.md`.

**Comment on jugera, plus tard.** Par exercice, jamais sur une moyenne tous exercices confondus : la relation entre reps et charge relative dépend surtout de l'exercice, au point que la méta-régression de Nuzzo et collègues (2024, 952 tests, 7 289 personnes) publie des tables séparées pour le couché et la presse. Et une erreur d'une rep n'est pas une erreur : les pratiquants eux-mêmes se trompent d'environ une rep sur ce qui leur reste (Halperin et collègues, 2021).

### 9.12 Le moteur ne lit jamais l'avenir — décidé le 19/09/2026

> **Tout calcul qui prescrit — l'habitude, le pas de salle, l'écart habituel, la coupure, le palier de référence — ne lit que les séances antérieures à celle qu'on prescrit.**

Deux raisons. Une séance corrigée après coup (mode Édition) ne doit pas changer la consigne qu'on a lue la veille. Et une consigne écrite dans `predictions` (§9.11) doit pouvoir se recalculer à l'identique. Le banc procède déjà ainsi, séance après séance.

**Exception : l'état de l'exercice** (§5.2), qui décrit une habitude sur tout l'historique. Depuis la correction de la rampe (48a), il ne change presque plus jamais le palier : un sur 6 531 séance-exercices mesurées.

**Les dates se comparent comme des instants, pas comme des textes** (précisé le 19/09/2026, 48b-3) : une même heure peut s'écrire « …Z » ou « …+00:00 », et deux écritures d'un même instant ne se classent pas pareil en texte — assez pour compter la séance qu'on prescrit parmi ses propres antécédents.

### 9.13 La consigne telle que le moteur la rend — décidé le 19/09/2026

`consignePour` rend `{ etat, zone, palier, niveau, n, ligne, haut }`. **La séance en cours fait foi — décidé le 26/09/2026 (chantier 49).** La consigne couvre **toutes les séries de travail de la séance en cours, telles qu'elles sont à chaque instant** : celles de la routine, celles que l'utilisateur ajoute ou retire, celles de « + Série ». `n` n'est plus qu'une proposition de départ (ci-dessous). **Une série validée est figée** : son rang et son rôle (ligne, test, proposition du coach) ne changent plus. Parmi les séries **non validées**, les `k` dernières reçoivent `haut` (charge, vise, k), les autres `ligne` (charge, vise) : ajouter une série non validée déplace le test sur la nouvelle dernière, retirer une série non validée ne touche à rien de ce qui est fait. **Une montée en charge se déclare en échauffement** (dans la routine ou à la saisie) ; une série plus légère notée en travail reçoit la consigne comme les autres — ce n'est pas un refus (un refus ne vise qu'une proposition du coach, §9.14) et son pari dit « autre chose tenté ». *(Remplace l'alignement sur les `n` dernières séries du 19/09 : il laissait une série de la routine hors consigne quand la routine en comptait plus que la dernière séance, écrivait un pari pour une série inexistante quand elle en comptait moins, et faisait glisser les paris à chaque ajout ou retrait. Dans les cinq historiques, 40 séance-exercices sur 100 n'ont pas autant de séries de travail que `n` : 24 en ont plus, 15 moins — `mesure_couverture49.py`.)*

**Le nombre de séries proposé au départ, hors routine — décidé le 26/09/2026.** Quand un exercice est ajouté sans routine, l'app pré-remplit ses séries de travail : **l'habitude d'abord** — le nombre de séries de travail de la dernière séance de l'exercice (`n`) ; **sans historique, l'intention** — 3 en Progresser, 2 en Entretenir (une à deux séries suffisent à maintenir force et muscle, Spiering et al. 2021). Ce n'est qu'un pré-remplissage : l'utilisateur ajoute ou retire librement. Une routine garde ses propres séries. Une charge `null` se dit « le cran au-dessus » (ou « en dessous »), sans chiffre.

États : `progression` · `test_propose` · `garde` · `etend` · `rejoint` · `attend` · `tout_passe` · `retest_un_cran` · `etirement` · `retest` · `reprise_courte` · `reprise_longue` · `bord` · `silence` (première fois, pas de palier). L'appelant ajoute les silences d'Entretenir et des mesures sans charge. Ordre de décision : la reprise, puis l'absence de zone (règle de bord), puis une échelle en cours avant la bascule, puis après la bascule, puis un étirement en cours, enfin le déclencheur du réglage.

Validé sur tout l'historique des cinq profils (`banc_consigne48.py`) : 6 109 consignes par réglage, aucune anomalie ; tests proposés sur 100 séances : Prudent 7, Normal 17, Franc 21.

**Le fondement — ajouté le 19/09/2026 (48b-5b-1).** `consignePour` rend aussi `fondement`, les faits sur lesquels la consigne repose : la date de la dernière séance ; les reps saisies de ses séries au palier ; le test (charge, reps saisies de sa première série, niveau compté, date) et s'il valait un seul cran ; la cible d'un étirement ; la preuve d'un double saut (`haut` ou `facile`) ; le seuil d'une série qui attend ; le palier précédent, après la bascule ; la série à fond (rang parmi les séries au palier, charge, reps saisies, reps comptées, cause `rpe` ou `ressenti`) ; en silence, les charges de la dernière séance. Les phrases de l'en-tête (ECRAN-SAISIE §3.12), la feuille « Pourquoi » (ECRAN-SAISIE §3.10) et la table `predictions` (§9.11) le lisent : **aucune ne recalcule une règle du moteur**.

**Le pont depuis `analyser` — 19/09/2026 (48b-5b-2).** `analyser` ne connaît pas de rôle « palier » : une série au palier y est une série `travail` à la charge du palier. Traduction vers le contrat de `consignePour` : `travail` à la charge du palier → `palier` ; autre `travail` → `travail` ; `exploration` → `exploration` ; `rampe` → `rampe` ; `chauffe`, `chauffe_probable`, `degressive`, `descente_choisie` et `echec` → `autre`. **Une seule fonction fait ce pont**, dans l'ordre des séries de la séance. La date de coupure est le début de la séance ouverte.

**Le fondement enrichi — 20/09/2026 (48b-6a).** Pour la feuille « Pourquoi », le fondement porte aussi : **la dernière séance, série par série** (`seance` : charge, reps, RPE, ressenti, rôle du contrat, et `origine`, le rôle d'`analyser` — chauffe, chauffe probable, dégressive, descente, échec — que le contrat résume en `autre`) ; **l'habitude** (`habitude` : sa valeur, et le nombre de séances qui la fondent, 8 au plus) ; pendant un étirement, **la zone figée** (`zoneFigee` : la date du premier test raté de l'épisode). Le pont transmet `origine` avec chaque série.

### 9.13 bis Le plan de séance : un seul coach — décidé le 26/09/2026 (chantier 49)

> **Un seul calcul décide de tout ce que le coach dit et fait dans une séance. Tout le reste le lit, sans jamais refaire une règle.**

**La fonction.** `planDeSeance(entrées) → plan`, pure : mêmes entrées, même plan ; les entrées ne sont jamais modifiées. Les entrées : la séance en cours (exercices, séries, validées ou non, mode Édition), l'historique antérieur à la séance (§9.12), les états d'exercice, les zones, le réglage, l'intention, le catalogue (mesure, équipement), les paris déjà écrits de la séance. Le plan porte, pour chaque exercice : la consigne (gardée pour le « Pourquoi » et le constat, jamais relue ailleurs) ; **chaque ligne** — rôle (`ligne`, `test`, `coach`, `retour`, `elan`, `hors`), charge, visée, source, révision, figée ou non, à taper ou non, fantôme, pourquoi ; l'en-tête ; la phrase du coach ; le constat ; les paris à écrire. La consigne, la couverture (§9.13), la réaction (§9.14), le fantôme, l'en-tête, le « Pourquoi », le constat et les paris deviennent **des étapes de ce calcul**, dans cet ordre.

**Qui le lit.** La grille, l'en-tête, la feuille « Pourquoi », la phrase du coach, le constat, les paris et l'observation, le pré-remplissage — et, à venir, les chauffes (§9.15), l'escalier (§14) et les programmes. **Aucun ne recalcule une règle du moteur** (règle déjà posée au §9.13 le 19/09, que le code avait perdue couche après couche).

**La consigne est figée pour la séance** dès son premier calcul : une synchronisation, un import ou une séance corrigée ailleurs pendant la séance servent à la séance suivante. Exceptions, toutes des gestes de l'utilisateur : il change lui-même **la zone** de l'exercice, ou **son mode** (Entretenir, §9.17) ; ou il **répond à la carte du lest** (§9.17) — seules les consignes en attente de cette carte se recalculent, puisque la réponse vaut pour la personne et non pour un exercice (précisé le 04/10/2026, #363). Les séries non validées se recalculent ; une série validée ne change jamais. *(Un coach ne change pas d'avis au milieu d'une séance parce qu'une donnée est arrivée en arrière-plan.)*

**Un même exercice deux fois dans la séance** (décidé le 04/10/2026, #363 — un usage réel : le tapis en échauffement puis en cardio, un couché lourd puis léger). Le coach suit **une seule occurrence** : celle qui porte déjà des paris de la séance, sinon la première dans l'ordre — on ne déplace pas le coach d'un exercice déjà commencé. Les autres occurrences sont **libres** : ni ligne du coach, ni pari, ni message ; leurs séries comptent comme d'habitude pour le volume et l'historique. **Le remplaçant** d'un exercice reçoit les lignes que l'exercice remplacé n'a pas encore faites, et rien de plus ; les séries faites restent à l'exercice remplacé.


**Le fantôme d'une ligne vient d'une seule source : la ligne du plan** (décidé le 11/10/2026, 68A ; remplace la recopie de la dernière série, 49-U2). Une ligne non validée affiche sa charge et sa visée — pour une ligne du coach ou d'élan (§9.14 bis), sa charge seule et la fourchette de la zone (les reps se tapent). Quand l'utilisateur s'écarte du plan, **le plan reste affiché et la phrase du coach s'adapte** (§9.14 bis) : on ne recopie plus en silence une charge qui n'était peut-être qu'un essai. Contrepartie assumée : le gris s'enregistre à la validation sans saisie ; qui reste plus léger retape sa charge, et la phrase le lui rappelle. *(Le rowing du 10/10/2026 : consigne 79 × 12, test 81,3 en série 3 ; 73 × 12 puis 79 × 10 — les fantômes passaient à 73, puis le plan revenait sans un mot.)*

**Les invariants — un coach qui ne peut pas se contredire.** Vérifiés sur chaque plan, en test, au banc et, en développement, par une garde : **I1** chaque ligne a un seul rôle, seules les séries de travail sont couvertes ; **I2** aucune ligne du coach ne remplace une ligne de test non figée ; **I3** une proposition du coach n'est jamais plus basse que la charge prévue de la ligne qu'elle remplace, et toujours au-dessus de la charge de travail ; **I4** d'un plan au suivant, une ligne figée ne change jamais (rang, rôle, charge, visée) **tant qu'elle reste une série de travail validée** (précisé le 28/09/2026 : passée en échauffement, en dégressive ou en échec, elle sort de la couverture, comme le permet §9.11) ; dévalidée, elle redevient une ligne du plan et peut être revalidée sous une autre révision (précisé le 28/09/2026 : le code l'interdisait, contre le delta W3) ; **I5** les tests restants valent `k` moins les tests figés, sur les dernières lignes non validées (vérifié depuis le 16/10/2026, audit du 16/10, 01 #7 : il n'était vérifié nulle part ; lu sur le rôle de la couverture, les lignes « non validées » sont celles qui ne sont pas figées — une série validée sans pari reste une ligne du plan —, hors de la ligne de la série de plus, hors semaine allégée) ; **I6** l'en-tête décrit exactement les lignes (nombre de séries par charge, visées, ordre) ; **I7** (précisé le 28/09/2026) **un pari s'écrit avant que le plan suivant soit calculé** : à la validation, le pari de la ligne est enregistré sur l'appareil, puis l'écran se redessine. **Un pari ne s'écrit jamais après coup** : une série validée hors de l'app ou avant son plan (séance reprise d'un autre appareil, séance d'avant 49-C, coach silencieux) reste **non pariée**, et I7 ne l'exige pas. Pour toute autre ligne : chaque ligne validée et couverte a exactement un pari **de la révision qu'elle affichait à sa validation**, qui reprend sa charge, sa visée et son rôle — aucun pari sans ligne ; d'autres révisions du même rang peuvent exister à côté (§9.11 : une consigne revue est un nouveau pari, écrit à côté du premier), chacune observée selon sa charge (précisé le 27/09/2026 : la formulation « exactement un pari » contredisait §9.11 dès qu'une série est dévalidée puis revalidée sous une autre révision) ; **I8** les rangs sont uniques par exercice, un rang figé n'est jamais repris ; **I9** un message vise une ligne qui existe, « propose » implique une ligne du coach juste après, « ton test a avancé » implique que la ligne tenue était un test ; **I10** le constat n'apparaît que lorsque toutes les lignes de travail sont validées et ne contredit pas une montée tenue du jour ; **I11** (révisé le 11/10/2026, 68A) le fantôme d'une ligne non validée est sa ligne : même charge ; les reps sont sa visée, sauf sur une ligne du coach ou d'élan (nulles : on tape ses reps, la grille montre la fourchette) ; **I41** « plus léger que prévu » n'est dit qu'une fois par exercice, et seulement quand la dernière série validée est plus légère que sa ligne (sous un élan : que la ligne du plan qu'il remplaçait), jamais pour une série à la charge de travail faite sur une ligne de test ; **I42** en zone Lourd, au plus une ligne d'élan dans l'exercice ; **I43** une ligne d'élan n'est jamais plus légère que la ligne qu'elle remplace, ne remplace jamais une ligne du coach, ne survit pas à une série validée plus légère qu'elle, et le message « élan » (ou la suggestion d'effort) implique au moins une ligne d'élan posée par la série qu'il commente ; **I44** (68B) une ligne « à fond » (source `a_fond`) est à la charge de la série validée juste avant elle, qui est à fond, et vise ses reps moins une ; **I12** même entrée, même plan ; **I13** en Entretenir (le profil — « Juste un carnet » —, ou l'exercice, §9.17) ou en Édition : aucune ligne du coach, aucun pari, aucun message, ni charge de dégressive (§9.15.3), ni chauffe du coach (§9.15.1 et §9.15.2) ; **au profil seulement**, ni bandeau de décharge planifiée ni fenêtre de semaine allégée (faits du plan entier, §9.22 et §14.4), ni badge ni carte de fin de bloc d'un programme, ni la rangée « Faire de ce dossier un programme » (§9.22 ; la rangée précisée le 08/10/2026 : un bloc créé en carnet serait invisible et impossible à arrêter) — précisé le 07/10/2026 (#382, 60-2a) ; une mesure en durée ou en distance reste hors du coach (CADRAGE §2 ter) : **ni dégressive, ni chauffe, ni phrase du coach, avec ou sans consigne** (précisé le 16/10/2026, audit du 16/10, E6 : une ligne dégressive sur une planche faisait dire « Pas de charge de travail pour caler la dégressive. ») — **le poids du corps en reps, lesté ou assisté, est coaché** (§9.17, 03/10/2026). **I14** une proposition du coach suivie d'un test prévu a la charge de ce test (une seule montée par bloc, §9.14, 27/09/2026) ; **I15** le repli d'une reprise longue ne descend jamais de plus de 10 % sous le dernier palier (§9.9, 27/09/2026) ; **I46** (§10 bis, 108) une salle déclarée en vigueur : aucune charge proposée qu'elle n'a pas. **I47** (§10 bis, 16/10/2026, révisé le 16/10/2026 par 113) au plafond de la salle : seulement la série de plus, la dégressive et un frère plus chargeable, dans l'ordre, une marche par déclenchement — jamais le changement de schéma ni le repli, ni déclenchement de la semaine allégée ; **sauf le repli que la personne choisit** sur la carte de reprise, « Plus léger » après une douleur (§9.20 ; décision d'Aurélien du 16/10/2026, D11, audit du 16/10) : « « Plus léger » (après une douleur) passe avant la règle « pas de repli au plafond de la salle » ; I47 l'exempte. »

**La version du moteur (`VERSION_CONSIGNE`), précisé le 27/09/2026.** Chaque pari enregistre la version des règles qui l'ont produit, pour que le coach puisse comparer la justesse de ses règles d'une version à l'autre. **Elle monte à chaque changement d'une règle de la consigne ou de la réaction** : 1 jusqu'à 49-U5 exclu (les 24 paris du 26/09/2026 et d'avant), **2 à partir de 49-U5** (reprise mesurée, une seule montée par bloc). **Toute fonction future se branche sur le plan et doit passer ces invariants.**

*(Constat du 26/09/2026, séance simulée : la consigne prévoyait un test à 130 sur la série 2 ; la réaction, calculée à part, y a proposé 127,5 ; l'en-tête, rédigé à part, décrivait quatre séries ; la grille en montrait trois. Diagnostic : treize calculs, dont quatre qui refaisaient le travail des autres sans lire leur résultat.)*

### 9.14 La réaction série par série — décidé le 25/09/2026 (chantier 49)

> **Le coach lit chaque série que tu valides. Quand une série faite à la charge proposée dépasse sa visée de 3 reps comptées ou plus, il propose de monter dès la série suivante. Sinon, il se tait.**

Jusqu'ici, la consigne se calculait à l'ouverture de la séance et ne bougeait plus : le test entrait par la dernière série et gagnait une série par séance (§9.7). C'est la moitié de l'APRE (Mann 2010 ; §9.8), qui règle la charge d'une série sur les reps de la précédente, **dans la même séance**. La réaction fait l'autre moitié.

**Quand il parle.** Après une série de travail faite **à la charge du palier proposé**, avant toute montée dans le bloc, quand ses reps comptées (§17.4 : une série à RPE 10 ou « reste 0 » compte une rep de moins) dépassent la visée de cette série de **3 ou plus**. Jamais sur la dernière série de l'exercice : il n'y a rien après. Jamais sur les chauffes, la rampe, les dégressives. En superset, « la série suivante » est la suivante **du même exercice**.

**Ce qu'il propose.** La série suivante, avec **une fourchette de reps** : « 130, vise 3 à 5 » — à une charge qu'on n'a pas encore faite, le coach vise la zone, pas un chiffre. Le pari écrit dans `predictions` est le bas de la zone (§9.11). La charge :

| Borne | Ce qu'elle vaut |
|---|---|
| Basse, toujours | **Un cran** : la charge immédiatement au-dessus du palier, dans l'ordre du §10.2 (la même que celle d'un test). Sans chiffre connu, « le cran au-dessus » — une proposition sur neuf au rejeu —, et toute charge au-dessus du palier vaut acceptation, comme pour l'observation (§9.11) |
| Haute, seulement à 5 reps de marge ou plus | Dans cet ordre : **le programme**, quand il en fixe une (prise vide aujourd'hui, remplie par le chantier programmes, comme les phases du §9.10) ; sinon **ton saut habituel** sur cet exercice ; sinon **deux crans**, s'ils restent sous 10 % du palier (les garde-fous du réglage Franc). Si la borne haute ne dépasse pas la basse, une seule charge est proposée |

Le **saut habituel** est la médiane, sur les séances antérieures de cet exercice (§9.12), des montées en cours de séance — une série de travail plus lourde que la série au palier qui la précède —, rapportée au palier, puis ramenée à la plus petite charge déjà utilisée sur cet exercice qui l'atteint. Il faut au moins 5 montées antérieures, sinon on passe à la source suivante. C'est une habitude décrite, comme le pas de salle : **comment** la personne monte, jamais les seules fois où ça a tenu. Même ordre de priorité que pour les zones : ce que le plan fixe, puis ce que la personne fait, puis la préconisation (§9.1.2).

**Quelle montée il commente — précisé le 25/09/2026.** Seulement **celle qu'il a proposée et que tu as prise**. Un test prévu par la consigne suit la consigne (§9.7) : il se tait. ~~Une montée de ton propre chef est ton choix : il se tait.~~ **Révisé le 11/10/2026 (68A)** : une série plus lourde que sa ligne, de ton propre chef, est suivie de l'élan (§9.14 bis) — dite par un fait, sans « bravo ». Toute montée, quelle qu'elle soit, clôt les propositions du bloc. Rejoué sur l'historique, un coach qui commentait toutes les montées disait « tu as tenté plus tôt que prévu » à des tests exactement prévus : 830 messages faux.

**Ce qui suit la série montée.**

- **Elle tient** (reps comptées au moins au bas de la zone) : la charge montée reste pour les séries suivantes, visée à la zone ; une série que la consigne avait déjà prévue à cette charge garde sa visée. Le coach le dit par un fait (§20). **En zone Lourd, au plus une série de plus** à la charge montée que ce que la consigne prévoyait (le garde-fou du §9.7) : les autres gardent la consigne.
- **Elle ne tient pas** : retour à la charge et à la visée du palier pour les séries suivantes, dit en gris, avec « pas encore » (§20).
- **Une seule montée par bloc.** Après une montée, tenue ou non, le coach ne propose plus rien dans ce bloc.

**Quand il se tait.** *(Le 25/09, #318 : aussi quand la séance comptait moins de séries que la consigne. Retiré le 26/09/2026 : la consigne couvre désormais les séries de la séance en cours, §9.13 — il n'y a plus de séries à aligner sur des rangs.)* Sous la visée ou à 1-2 reps de marge ; **après un refus** — la série proposée validée **à une charge inférieure à la charge proposée** (la borne basse ; le palier ou moins, quand le cran n'a pas de chiffre) ; égale ou supérieure, c'est une acceptation —, jusqu'à la fin du bloc : reproposer serait insister après un non ; en **Entretenir** (ECRAN-PROFIL §2.3), qui coupe le coach, propositions et encouragements compris ; quand le moteur se tait déjà (silence, mesure sans charge, règle de bord sans zone) ; ~~les jours de reprise~~ — **retiré le 27/09/2026 : la réaction reste active pendant une reprise** (`reprise_courte`, `reprise_longue`, §9.9). La consigne de reprise reste sans rep de plus ; mais une série faite à sa charge avec 3 reps comptées de marge ou plus montre que la prudence n'était pas nécessaire, et le coach le dit (mesure R1 : retour à 98 % en médiane). **En reprise longue sous le dernier palier, la proposition ramène d'abord au dernier palier** (« on retrouve ton palier ») ; à partir du palier, la proposition habituelle (le cran du dessus). Sur les cinq historiques, la vraie première série d'une reprise aurait déclenché une proposition 29 fois (15 chez aurel_br, dont les exercices tournent : 383 reprises courtes). Le réglage Prudent, Normal ou Franc ne change rien en version 1.

**Quand la série suivante est déjà un test — décidé le 26/09/2026.** Pas de proposition de charge : le test est déjà la montée. Une série au palier qui dépasse sa visée de 3 reps comptées ou plus, suivie d'une ligne de test, donne une phrase et rien d'autre : « 125 kg × 8, 3 de plus que prévu : ton test à 130 kg arrive dès la série 2, avec de la marge. » Ni la charge ni la visée du test ne changent, ni son pari. Même chose à 5 reps de marge : pas de seconde charge au-dessus d'un test. Appui : dans la pratique des coachs (autorégulation série par série, méthode APRE), quelques reps au-dessus de l'objectif ajoutent environ 2,5 à 5 kg à la série suivante — le test, déjà au cran du dessus, correspond à cet ajustement. *(Avant ce jour, la réaction posait sa proposition sur la série suivante sans regarder son rôle : le 26/09, 127,5 proposé sur une série prévue en test à 130 — une « montée » plus basse que le plan.)*

**Quand un test est prévu plus loin dans le bloc — décidé le 27/09/2026 (#327).** La proposition du coach **prend la charge du test** : le test avance d'une série (« ton test a avancé d'une série »). Une seule montée par bloc : proposer le cran du dessus avant un test plus lourd en ajouterait une seconde, plus petite. Le « plus loin » se lit sur **le rôle prévu par la consigne**, y compris sur une ligne déjà figée ou revenue à la charge de travail, pour que la décision ne change jamais après coup (I4). Sans test prévu, rien ne change : le cran du dessus. *(Constat de #327 : 125, puis 127,5 proposé, puis le test à 130 — trois charges différentes, aucune ne se répète, et la séance suivante ne proposait plus aucune charge, dans 68 constats sur 1 215 plans générés. Appui : quelques reps au-dessus de l'objectif ajoutent 2,5 à 5 kg à la série suivante dans la pratique des coachs ; le test est à +5 kg.)* **Invariant I14** : une proposition du coach suivie d'un test prévu a la charge de ce test.

**Ce qu'il lit.** Les séances antérieures, comme la consigne, **et les séries déjà validées de la séance en cours** — jamais une série seulement tapée. Corriger ou dévalider une série validée refait le calcul. **Une fonction pure** : consigne, séries validées et contexte (cran, seconde charge et sa source, calculés sur les séances antérieures) en entrée ; en sortie, le plan de **toutes** les séries de la consigne — validées comprises, avec la charge qui était proposée à chaque rang, dont la cascade du fantôme a besoin —, le message, la proposition en attente et le numéro de révision. Un effort saisi après coup (§17.4) refait le calcul pour la suite, jamais pour ce qui est déjà écrit. L'écran, la feuille « Pourquoi » et `predictions` lisent sa sortie, aucun ne la recalcule — le moteur ne connaît pas l'écran.

**Mesure** (rejeu de la consigne sur les cinq historiques, 4 679 séries faites à la charge proposée, 991 suivies d'une montée) — part des montées qui tiennent dans la zone :

| Marge de la série d'avant | Montées qui tiennent |
|---|---|
| Aucune (tests prévus d'avance, surtout) | 58 sur 100 (772) |
| 1 ou 2 reps | 69 sur 100 (117) |
| **3 reps ou plus** | **90 sur 100** (102) — après la série 1 : 78 sur 100 (36) ; après la série 2 ou plus tard : 97 sur 100 (66) |

Les montées de l'historique valaient +12 % en médiane, plus qu'un cran : pour le coach, qui propose un cran, ces chiffres sont une borne basse. Le saut habituel est propre à chaque exercice et régulier (sur 56 exercices assez fournis, la moitié des sauts tient dans 4 à 5 points autour de l'habitude ; de +5 % aux haltères à +26 % sur une poulie à plaques) ; les montées de la taille habituelle tiennent aussi bien que les autres (21 sur 25). **Réserve** : dans l'historique, les gens montaient quand ils se sentaient bien ; le coach le proposera aussi à ceux qui n'y auraient pas pensé. Chaque proposition étant un pari (§9.11), les premières semaines le mesureront.

**Confrontation.** L'APRE monte dès 2 reps au-dessus de la visée ; nous à 3. Leur série de référence est poussée jusqu'à l'échec, pas la nôtre, et à 2 reps de marge exactement nos montées ne tiennent que 58 fois sur 100 (33 cas ; 69 sur 100 pour 1 ou 2 reps ensemble). L'APRE décide après deux séries d'approche ; nos données trouvent aussi la décision plus sûre après la série 2. L'APRE baisse la charge après un gros raté ; pas nous (le niveau validé tolère la fatigue, §9.2, et la doctrine est de ne jamais imposer une baisse). Le retour d'information verbal et l'encouragement améliorent la performance chez des pratiquants entraînés (Weakley 2020), et le retour d'information améliore l'adaptation sur 4 à 6 semaines (méta-analyse, Weakley 2023) ; ce qui fait un encouragement efficace est mal connu, d'où le choix de dire un fait plutôt qu'un « bravo » (§20).

#### 9.14 bis Quand la série faite n'est pas celle du plan — décidé le 10-11/10/2026 (68A)

> **Le plan reste affiché ; le coach dit ce qu'il voit, sans question ni jugement. Plus lourd et ça tient : on profite
> de l'élan. Plus léger : une phrase, une fois.** La séance en cours fait foi : l'utilisateur décide, le coach suit.

Ces règles sont des étapes de la réaction (§9.14), sur les séries de travail couvertes ; elles gardent ses silences
(état muet, semaine allégée, poids du corps, Entretenir, Édition, I13) et ne jouent jamais **après un refus** d'une
proposition, jusqu'à la fin du bloc. « Sa ligne » : la ligne du plan à laquelle la série a été validée — `ligne`,
`test`, `retour` ou `elan` ; une série validée sur une ligne du coach reste régie par §9.14 (prise, refus).

- **Plus lourd que sa ligne, et ça tient** (reps comptées ≥ bas de la zone) : **l'élan**. Les lignes suivantes non
  validées plus légères que cette charge passent à cette charge, fourchette de la zone, pari au bas (rôle `elan`, affichée comme une ligne du coach), **tests
  compris** — un test déjà plus lourd ou égal garde la sienne. Jamais une ligne du coach. **Zone Lourd : une seule ligne
  d'élan dans l'exercice** (le garde-fou du §9.7). Un élan peut suivre un élan (84, puis 88 : la suite passe à 88). La
  phrase, si au moins une ligne a changé : « 84 kg × 12, au-dessus de ta charge de travail : la suite reste à 84 kg. »
  (toutes les lignes restantes à cette charge) ; « … : une série de plus à 135 kg. » (une seule) ; « … : 2 séries de
  plus à 84 kg. » (plusieurs, pas toutes). **Si aucune ligne ne change** (la suite est déjà plus lourde) : silence — un
  libellé ne contredit jamais son chiffre. **L'élan dure tant que tu suis** : une série validée plus légère qu'une ligne
  d'élan le termine — les lignes d'élan non validées reviennent à leurs lignes du plan, et la série se compare à la ligne
  du plan que l'élan remplaçait (revenue à ta charge de travail : rien à dire ; plus légère encore : « plus léger »).
  *(Audit du 11/10 : sans cette règle, 84 puis un retour à 79 faisait dire « plus léger que prévu, la suite reste à
  84 » à quelqu'un qui revenait simplement à son plan.)* *(Mesure du 11/10 sur aurel_br : 16 séries plus lourdes de soi-même en deux
  semaines, 15 tiennent ; la série suivante était la même 7 fois sur 9.)*
- **La suggestion d'effort** : à la place de la phrase d'élan, **quand la série tient pile au bas de la zone** (reps
  faites = bas), **sans effort noté**, au plus **une fois par exercice** : « 84 kg × 10, pile au bas de ta fourchette.
  Si c'était à fond, note-le : on revient à 79 kg pour la série suivante. Sinon, on garde 84 kg. » (79 : la charge
  qu'avait la ligne suivante **juste avant cette série** — 82 si un premier élan l'y avait déjà portée.) Ce n'est jamais bloquant ; ignorée, l'élan reste. Noter l'effort après coup
  refait le calcul (§17.4 : aujourd'hui « à fond » compte une rep de moins — la série ne tient plus, retour au plan).
  Seulement là où « à fond » changerait la décision : un rep de marge ou plus au-dessus du bas, on garde le cap quoi
  qu'il arrive. *(≈ 1,5 suggestion par semaine au rejeu.)*
- **Plus lourd que sa ligne, et ça ne tient pas** : les lignes restent celles du plan ; **une fois par exercice** (un
  second essai manqué ne se commente pas : la grille dit déjà la suite) : « 84 kg × 9 : pas encore. La suite reste à
  79 kg × 12. » (en gris, §20). **Quand c'est « à fond » qui la fait passer sous la fourchette** (reps faites ≥ bas,
  reps comptées < bas, §17.4), jamais « pas encore » à côté d'un chiffre dans la fourchette : « 84 kg × 10 à fond : la
  suite reste à 79 kg × 12. »
- **« La suite »** dans une phrase : la ligne suivante telle que la grille la montre — « 79 kg × 12 » pour une ligne
  (charge × visée), « 84 kg, vise 10 à 12 » pour une ligne du coach ou d'élan (charge et fourchette).
- **Plus léger que sa ligne** : les lignes restent celles du plan ; **une fois par exercice** : « 73 kg × 12, plus léger
  que prévu. La suite reste à 79 kg × 12 ; tape 73 kg si tu restes à 73 kg aujourd'hui. » Aucune question, aucune
  raison supposée (un jour sans, ou garder du jus pour le test : le coach ne devine pas). La phrase n'accompagne que la
  dernière série validée : la série suivante remonte, elle disparaît ; une montée par paliers (70, 75, 79) ne dit donc
  rien de plus que cette phrase, une fois. *(Les cinq profils montent en cours d'exercice dans 49 à 80 % des cas.)*
  **Une série à la charge de travail sur une ligne de test n'est pas « plus légère »** : c'est le test remis à plus tard,
  et §9.14 s'applique comme sur une ligne (« ton test arrive… » avec 3 reps de marge ou plus, sinon rien). *(Audit du
  11/10 : 79 × 15 sur une ligne de test à 81,3 donnait « plus léger que prévu » au lieu de la marge.)*
- **Plus de reps à la charge prévue** : inchangé (§9.14 : la proposition, le test qui avance).
- **Avant un test, après des séries plus légères** : rien de plus — l'en-tête dit déjà le test (ECRAN-SAISIE 3.12).
- **Les paris.** Une ligne d'élan validée porte un pari comme une ligne du coach : `valeur_predite` = bas de la zone,
  bornes de la zone, `fondement.role = 'elan'`, `fondement.source = 'elan'`, son déclencheur (la série plus lourde).
  `VERSION_CONSIGNE` monte (la réaction change).
- **Le constat** compte une ligne d'élan tenue comme une montée tenue du jour (I10).
- **La feuille « Pourquoi »** décrit une ligne d'élan sur le patron de la ligne revenue : « on garde 84 kg après
  84 kg × 12 ».

Appui : APRE (Mann 2010), autorégulation série par série (Zhang 2021), les « joker sets » de Wendler (monter quand la
série du jour passe bien) ; la justesse du ressenti près de l'échec (Zourdos 2016) — d'où l'effort demandé seulement là
où il change la décision. Les deux façons de coacher, séries égales et « monte jusqu'à », coexistent : la forme des
séries compte peu pour la masse (Angleri 2017).

#### 9.14 ter « À fond » pendant la séance — décidé le 11/10/2026 (68B)

> **Une série à fond est tenue, mais sans marge : la charge ne monte pas sur sa foi, et la série suivante à la même
> charge en fera sûrement une de moins.**

Une série de travail est « à fond » quand elle porte un RPE de 10 ou le ressenti « reste 0 » (§17.3 ; un RPE de 9,5 ne
l'est pas). Ces règles sont des étapes de la réaction, avec ses silences (§9.14, §9.14 bis).

- **La suivante, une rep de moins.** Après une série à fond à la charge C faite avec r reps, la ligne suivante, si elle
  n'est pas validée, n'est pas une ligne du coach ni d'élan, et est à la même charge C, vise **r − 1 reps quand sa
  visée était plus haute** (jamais moins d'une rep, jamais plus que sa visée) ; seule la ligne suivante change. Son
  pari est une révision (source `a_fond`, `valeur_predite` = r − 1). La phrase : « 79 kg × 12 à fond : la suivante vise
  11. » *(Sur toute la base, après une série à fond suivie d'une série à la même charge : −1,4 rep en moyenne, 14 cas.)*
- **Pas d'élan.** Plus lourd que sa ligne, à fond : la suite reste au plan, même si la série tient. « 84 kg × 12 à fond :
  la suite reste à 79 kg × 12. » (sous la fourchette, sans réserve non plus : « 84 kg × 9 : pas encore. … », §9.14 bis).
- **La proposition prise, à fond.** Les lignes suivantes reviennent à la charge de travail, comme « pas encore », mais
  la phrase dit le fait : « 81,3 kg × 12 à fond : la suite revient à 79 kg × 12. » Le pari de la série est tenu (reps
  faites, §9.11) ; le constat la compte comme une montée tenue du jour (I10).
- **Ni proposition, ni « ton test arrive avec de la marge »** après une série à fond, même à 3 reps de marge.
- **« La suite »** dans une phrase se lit sur les lignes après cette règle : « 81,3 kg × 10 à fond : la suite reste à
  81,3 kg × 9. » quand la ligne suivante, un test à 81,3, vient de passer à 9.
- La dernière série de l'exercice : rien à dire.
- **I44** : une ligne de source `a_fond` est à la charge de la série validée juste avant elle, qui est à fond, et vise
  ses reps moins une.

---

### 9.15 Les chauffes et les dégressives — décidé les 26 et 29/09/2026 (chantier 49)

> **La routine (ou l'utilisateur) décide combien de chauffes et de dégressives ; le coach en calcule la charge, à partir de la charge de travail du jour. Les reps des chauffes sont celles de la routine ; les reps de la dégressive sont celles du coach.** C'est la règle de toute la séance (§9.13 : la routine décide de la structure, le moteur de la charge et des reps), appliquée sans exception : les reps d'une chauffe sont de la préparation, choisies avec Aurélien (10-6-3-1), donc de la structure ; les reps d'une dégressive sont un objectif, qui se déduit des reps du jour, donc de la consigne (précisé le 02/10/2026 : une même ligne disait « Vise 4 à 6 » en gris et portait les reps de la routine — deux voix).

**La charge de référence** est la charge de la consigne figée de la séance (la ligne, pas le test). Si le coach fait monter une série en cours de séance, les chauffes déjà faites ne bougent pas, et les suivantes non plus : elles se calculent sur la consigne figée. Toutes les charges sont arrondies au cran existant (incrément de l'équipement, §10), jamais sous la barre vide, jamais au niveau de la charge de travail ou au-dessus.

#### 9.15.1 La règle des chauffes

**Le nombre de chauffes et leurs reps dépendent de la situation de l'exercice dans la séance ; leurs charges, de la charge de référence.** Validé par Aurélien le 29/09/2026 (sa montée, confrontée à la littérature et à la pratique des coachs) :

| Situation | Chauffes (charge · reps) |
|---|---|
| **Barre, 70 kg et plus, premier exercice sur ses muscles primaires** | barre vide × 10 · ~50 % × 6 · ~70 % × 3 · ~88 % × 1 |
| **Soulevé de terre et variantes au sol** (pas de barre vide) | ~50 % × 5 · ~70 % × 3 · ~88 % × 1 |
| **Barre, moins de 70 kg**, premier exercice sur ses muscles | barre vide × 10 · ~88 % × 2 |
| **Exercice dont les muscles primaires sont déjà sollicités** dans la séance, à la barre dès 70 kg | ~60 % × 5 · ~88 % × 2 |
| **Machine, poulie ou haltères, premier exercice sur ses muscles primaires** | ~60 % × 8 |
| **Isolation ou machine sur des muscles déjà sollicités** | aucune |

**Arrondi** : à la dizaine sur une barre dont la charge de référence atteint 100 kg ; à 5 kg en dessous ; au cran existant sur les machines et les haltères ; à égalité, vers le bas. Jamais sous la barre vide, toujours au moins un cran sous la charge de référence. **Repos** : environ 1 minute entre deux chauffes, 2 minutes avant la première série de travail (le minuteur de la séance l'applique).

**Exemples** (aurel_br, 29/09) : couché ou squat à 125 kg → **20 × 10 · 60 × 6 · 90 × 3 · 110 × 1** ; soulevé à 155 kg → **80 × 5 · 110 × 3 · 140 × 1** ; militaire à 57,5 kg → **20 × 10 · 50 × 2** ; squat avec pause à 100 kg après le soulevé → **60 × 5 · 90 × 2**.

**Les chauffes de la routine** : quand l'exercice a des lignes de chauffe (routine ou saisie) **et qu'il n'est pas en Entretenir** (profil ou exercice : les lignes restent telles que la routine les donne, I13 ; précisé le 07/10/2026), **le coach remplit leurs charges d'office** selon la ligne de la table qui correspond (les reps restent celles de la routine). **Si la routine prévoit moins de lignes que la table**, le coach garde les marches les plus utiles : **une ligne → ~60 %** ; **deux → ~60 % puis ~88 %** ; **trois → ~50 %, ~70 % puis ~88 %** (la barre vide est la première marche à tomber). **Si elle en prévoit plus**, les lignes en trop ne sont pas remplies, et la feuille « Pourquoi » le dit. L'utilisateur peut taper une autre charge : sa saisie fait foi.

#### 9.15.2 Pas de chauffe prévue : le coach propose

Quand l'exercice n'a **aucune** ligne de chauffe, que la table en prévoit, **et que la charge de référence atteint 60 kg à la barre ou 80 kg sur un autre matériel** (en dessous, une chauffe spécifique n'apporte presque rien : l'échauffement général de la séance suffit, précisé le 30/09/2026), **le coach propose** la montée de la table dans une ligne à accepter, jamais des séries insérées d'office (ajouter des séries, c'est la structure, qui appartient à l'utilisateur). **Ajouter** insère les lignes au-dessus des séries de travail, typées échauffement ; **Non merci** retire la proposition pour la séance. **Après trois « Non merci » d'affilée sur un exercice, le coach n'en propose plus** sur celui-ci (§14.3).

#### 9.15.3 Les dégressives

Quand l'exercice a une ligne **dégressive** (routine ou saisie) **et qu'il n'est pas en Entretenir** (profil ou exercice : la ligne reste vide, I13 ; précisé le 07/10/2026, #382), **le coach en remplit la charge** : **la charge de la dernière série de travail du jour moins 20 à 25 %** (au milieu, 22,5 %, arrondi au cran inférieur existant), et affiche **« jusqu'à l'échec »**, en indiquant environ la moitié des reps de la série de travail (par exemple 6-8 après 15). **Les reps pré-remplies de la ligne sont le milieu de cette fourchette** (7 pour « Vise 6 à 8 ») — jamais les reps de la routine ni celles de la fois d'avant : la phrase et la ligne disent le même chiffre (§20 bis). **Pas de repos** : le minuteur ne démarre pas entre la dernière série de travail et la dégressive, et le coach dit « sans repos ». **À la barre** (révisé le 14/10/2026, prompt 94 — remplace « Pas de dégressive à la barre ») : sur un mouvement polyarticulaire lourd (squat, couché, soulevé de terre, militaire et leurs variantes à la barre — les quatre barres et leurs frères à la barre, `mouvement` au catalogue, la définition de la barre lourde du générateur), **le coach ne propose jamais de dégressive de lui-même** ; en revanche, **si la routine ou l'utilisateur en a mis une, il la remplit comme hors barre**, arrondie au cran de la barre (les disques), et la phrase dit quoi enlever : « Enlève 2 × 10 kg : 120 kg. » *Précisé le 15/10/2026 (Claude.ai)* : la baisse reste −22,5 % (doctrine), mais à la barre la charge enlevée de **chaque** côté est **un seul disque standard** (25, 20, 15, 10, 5, 2,5, 1,25 kg), le plus proche de −22,5 % sans descendre sous −30 % ni rester au-dessus de −15 % ; si aucun disque seul ne tombe dans cette fenêtre, la plus petite combinaison de deux disques. La phrase devient « Enlève 15 kg de chaque côté : 110 kg. » (squat 140) ; curl EZ à 20 kg : « Enlève 2,5 kg de chaque côté : 15 kg. » Une isolation à la barre (curl EZ, barre au front…) : le coach la remplit, avec la même phrase. **Une ligne dégressive que le coach ne peut pas remplir ne reste plus vide en silence** : la phrase dit pourquoi (« Pas de charge de travail pour caler la dégressive. », « Trop léger pour une dégressive. »), et deux gestes proposent « En faire une série normale » ou « La retirer ». **Une seule baisse** : le coach ne remplit que la première ligne dégressive qui suit la dernière série de travail. **À la barre fixe d'une salle déclarée** (§10 bis, 108) : la barre déclarée au cran inférieur, « Prends la barre de 20 kg. » au lieu de « Enlève … de chaque côté ».

**La dégressive proposée par le coach — décidé le 16/10/2026** : le coach peut proposer de lui-même une dégressive, comme une marche de l'escalier, après la série de plus — sur une isolation seulement, hors sèche, jamais sur une barre lourde. La règle vit au §14.8 (« La dégressive proposée ») ; acceptée, elle ajoute une ligne dégressive que ce paragraphe remplit. Les « plusieurs baisses (2 à 3) » évoquées le 29/09 sont écartées : une seule baisse. *(Remplace le « Plus tard » du 29/09, précisé le 14/10/2026, 94.)*

#### 9.15.4 Ce qui ne change pas

**Une chauffe et une dégressive ne comptent jamais pour le coach** : ni couverture (§9.13), ni pari, ni réaction, ni stagnation. **Invariants** : **I16** les chauffes d'un exercice ont des charges croissantes et des reps décroissantes, toutes sous la charge de référence ; **I17** (réécrit le 14/10/2026, 94) une dégressive a une charge sous la dernière série de travail ; elle remplit toujours une ligne dégressive posée par la routine ou l'utilisateur — le coach n'en pose jamais, à la barre lourde comme ailleurs (la dégressive proposée du §14.8 se pose par le geste de l'utilisateur, « Ajouter une dégressive », 16/10/2026) ; à la barre, sa phrase dit quoi enlever (« Enlève 2 × … ») ; une ligne qu'il ne remplit pas a sa phrase et ses deux gestes. **I16** vaut aussi pour les chauffes de §9.15.5 : une chauffe de la routine n'est jamais vide en silence (en trop au-delà des marches, ou « Trop léger pour une chauffe de plus. »).

**Mesure et confrontation.** *Chauffes* (cinq historiques, 6 518 séance-exercices) : notées à la barre dès 80 kg, premier exercice sur ses muscles, 59 fois sur 100 ; rampes notées sur barre lourde 50 → 73 % (deux chauffes), 43 → 67 → 83 % (trois), 20 → 53 → 75 → 88 % (quatre). La littérature trouve le meilleur effet quand la dernière chauffe atteint environ 80 % de la charge de travail (Ribeiro et al. 2020 : au squat, 80 % ; au couché, 40 puis 80 %) ; une ou deux chauffes à 40-60 % seules apportent peu ; les coachs montent en 3 ou 4 marches, reps décroissantes. *Dégressives* (aurel_br, 182 dégressives sur 31 exercices) : baisse médiane 38 %, 10 reps en médiane — plutôt une série plus légère de plus ; les méta-analyses (Sødal et al. 2023 ; 2026) trouvent la même hypertrophie et la même force qu'en séries classiques, en deux à trois fois moins de temps, avec des baisses de 20 à 25 %, sans repos, jusqu'à l'échec ; les coachs la placent sur la dernière série, sur machine ou poulie. **La science et la pratique des coachs passent avant l'habitude** (décidé par Aurélien le 29/09, qui remplace « l'habitude d'abord » du 26/09).

#### 9.15.5 La chauffe ajoutée par l'utilisateur — décidé le 14/10/2026

« La routine ou l'utilisateur décide combien de chauffes ; le coach en calcule toujours la charge. » Quand l'exercice porte des lignes de chauffe que la table du §9.15.1 ne prévoit pas (isolation, muscles déjà sollicités, charge sous les seuils du §9.15.2), le coach les remplit quand même, selon leur nombre : 1 chauffe → ~60 % × 8 ; 2 chauffes → ~50 % × 8 puis ~75 % × 4 ; 3 chauffes ou plus → la rampe de la ligne « barre, 70 kg et plus » du §9.15.1 (en reprenant les dernières marches si elles sont moins de 4). Les reps viennent de la routine quand elle en porte, sinon de ces valeurs. Les arrondis, I16 et « jamais sous la barre vide, toujours au moins un cran sous la charge de référence » restent ceux du §9.15.1. Quand la charge de référence est trop basse pour placer une marche distincte, la ligne en trop reste vide, avec la phrase « Trop léger pour une chauffe de plus. ». Entretenir (I13) : inchangé.

*Précisions d'implémentation (94)* : « que la table ne prévoit pas » = la situation « aucune » du §9.15.1 ; une routine qui prévoit plus de lignes qu'une table non vide garde la règle du §9.15.1 (les lignes en trop ne sont pas remplies, la feuille « Pourquoi » le dit). Hors barre, la marche « barre vide » de la rampe devient ~30 % × 10. Au-delà de quatre lignes, les suivantes restent vides, comme au §9.15.1.

#### 9.15.6 La montée de chauffe comparée à la bonne pratique — écarté le 16/10/2026

« Le coach optimise ce qu'on fait, il ne nous encourage pas dans nos erreurs. »

**Plus tard** : Le coach comparera la montée habituelle de la personne (au moins 5 montées notées sur l'exercice) à la bonne pratique : charges croissantes, reps décroissantes, aucun saut de plus de ~25 % de la charge de référence entre deux marches, dernière chauffe vers 85-90 %. Conforme : il la reprend. Sinon : il propose la table et le dit en une phrase (« 60 → 140 : une marche à 110 × 2 entre les deux. »).

Écarté par Aurélien le 16/10/2026 : la chauffe actuelle lui convient sur le téléphone. Le critère « ~25 % » n'était écrit que dans ce “Plus tard” ; la table du §9.15.1 fait des sauts de 30 à 38 %, courants et sans risque avec peu de reps aux dernières marches. La règle en vigueur reste celle du §9.15.1 : la routine décide combien de chauffes, le coach en calcule la charge.

### 9.16 La phase — décidé le 30/09/2026 (chantier 49)

> **La phase est une entrée du plan unique, lue une fois et gelée pour la séance avec la consigne. Elle ne se définit qu'à un seul endroit (`QUESTIONNAIRE-COACH-V1` §3.2), et tout ce qui en dépend la lit là.**

**Les valeurs** : prise de masse, maintien ou recomposition, sèche (`profiles.phase` : `prise_de_masse`, `maintien`, `seche`). **Vide = maintien** (« je ne sais pas » ; le questionnaire et le Profil écrivent tous deux une phase vide pour cette réponse, précisé le 08/10/2026). `profiles.phase_depuis` date la dernière déclaration.

**Style et phase ne se recouvrent pas.** Le style (Prudent, Normal, Franc — « Me ménager, Normal, Me pousser ») règle **l'ampleur** des montées, rien d'autre. La phase règle **ce que le coach attend et quand il intervient**. Aucune règle ne lit l'un pour l'autre.

**Ce que la phase change** (vérifié contre la science, les coachs et les données le 30/09/2026) :

| | Prise de masse | Maintien ou recomposition | Sèche |
|---|---|---|---|
| Tests au haut de la zone, montées en séance | inchangés | inchangés | **inchangés** — la force progresse autant en déficit (Murphy et Koehler 2022) |
| Série de plus (escalier, §14) | permise | **permise** — à l'équilibre, rien ne freine la prise de muscle (Scarpelli et al. 2022 : +20 % de volume) | **non** — vers 500 kcal de déficit, plus de volume ne fait plus grossir le muscle |
| Déclenchement du compteur de stagnation (§12) | 4 séances | 4 séances | **4 séances aussi** : le seuil ne s'adapte pas, les mots si (§12.8). Ce qui change, c'est la réponse : là où l'escalier isolé proposerait une série de plus, le coach **le dit et ne propose rien** — « 80 kg × 10 reste ta meilleure charge de travail depuis 4 séances. En sèche, je ne te propose rien de plus. » — puis passe à la marche suivante au déclenchement d'après |
| Fondement de chaque pari | **la phase gelée de la séance y est enregistrée** | | |

**Gelée pour la séance.** Changer de phase en pleine séance ne change rien à la séance en cours (ni la consigne, ni les paris suivants) : la nouvelle phase vaut à partir de la séance suivante, comme une correction de zone qui ne touche pas une série déjà validée. **Hors ligne**, la dernière phase connue s'applique.

**Ce qui n'existe pas encore** : le compteur de stagnation (§12, qui ne lit la phase **que pour ses mots**) et l'escalier (§14, qui la lit pour sa première marche en zone muscle) lisent la phase dès qu'ils sont câblés ; d'ici là, la phase ne change **que le fondement des paris**. **Le rappel de phase — câblé le 08/10/2026 (60-2b).** Quand une phase est déclarée (`profiles.phase` non vide) et que sa dernière confirmation — `phase_confirmee_le`, sinon `phase_depuis` — date de **42 jours ou plus**, un bandeau sur l'accueil de Saisie, hors séance ouverte et hors « Juste un carnet » : « Sèche depuis le 28 sept. » (la phase, puis la date de `phase_depuis` par le formateur `quand`) ; en gris, « Ta phase règle la série de plus et entre dans chaque pari du coach. » ; boutons « **C'est toujours ça** » (écrit `phase_confirmee_le = maintenant`) et « **Changer** » (ouvre la feuille de la phase du profil ; toute réponse y écrit aussi `phase_confirmee_le`). **Pas de question** (§20.2). Sans phase déclarée, pas de rappel : le maintien par défaut n'a rien à confirmer. Pourquoi 6 semaines : la plupart des phases durent de 8 à 16 semaines ; un rappel plus fréquent deviendrait du bruit.

**Invariant I18** : chaque pari posé porte dans son fondement la phase gelée de sa séance (`prise_de_masse`, `maintien` ou `seche`), la même pour tous les paris d'une séance.

**L'objectif, gelé comme la phase — décidé le 08/10/2026 (60-2b).** L'objectif du questionnaire (`profiles.objectif` : `force`, `muscle`, `les_deux`, `forme`, ou vide) est une entrée du plan, lue une fois et gelée pour la séance avec la phase. **Il ne change aucune consigne** : il entre dans le fondement de chaque pari, pour que les premières semaines puissent comparer la justesse du coach selon ce que la personne cherche.

**Invariant I40** : chaque pari posé porte dans son fondement l'objectif gelé de sa séance (une des quatre valeurs, ou `null` sans réponse), le même pour tous les paris d'une séance.

**Pourquoi maintenant** : c'est ce qui permettra de mesurer, pari par pari, si les montées tiennent moins en sèche **chez un pratiquant avancé** — les études portent surtout sur des moins avancés. Chaque séance de sèche sans phase enregistrée est une donnée perdue pour Apprendre.

### 9.17 Le poids du corps, l'aide et le lest — décidé le 03/10/2026 (chantier 50)

> **Le poids du corps est une charge qui ne bouge pas : il suit exactement la consigne des charges. Seule différence, quand le coach voudrait monter d'un cran et qu'il n'y en a pas : la carte du lest, ou l'étirement.**

**Portée.** Les exercices mesurés en reps sans charge (`mesure = reps` : tractions, dips, extension du dos, pompes, relevés…), lestés (`charge = ajoutee`) et assistés (`charge = assistance`). **Hors V1** : la durée et la distance (CADRAGE §2 ter), l'élastique (pas une charge), la variante plus dure (CADRAGE §2 quinquies).

**Le poids du corps en reps.** La consigne est **celle des charges** (§9.1 à §9.16 : zone d'après l'habitude, niveau validé, progression, réaction, reprise, chute, compteur, escalier, phase), **la charge valant 0** (le poids du corps). En-tête : « Poids du corps × 8 ». **Un test sans cran** (test proposé, retest, retest d'un cran, sans charge au-dessus) devient :
- **la carte du lest**, si les **deux dernières séances** ont un niveau au moins égal au haut de la zone et qu'elle n'a **pas de réponse** — une seule carte, posée **une fois**, sans point d'interrogation (§20.2) : « 8 reps sur toutes tes séries, deux séances de suite. » ; « Au haut de ta zone, un lest te fait continuer en force. Avec une ceinture ou un gilet, je te propose de commencer à 2,5 kg, en revenant à 6 reps. » ; boutons « **J'ai du lest** » / « **Pas de lest** » ; la réponse est datée au profil (`profiles.lest_reponse`, `lest_reponse_le`) ; on tient la ligne ;
- **l'étirement** sinon (« Pas de lest », ou une seule séance au haut) : la ligne au niveau de la dernière séance + 1, **au-delà de la zone**, sans ligne haute (la règle des coachs quand on ne peut pas ajouter de poids : des reps).
Pas de chauffe ni de dégressive au poids du corps. Pas de repli ni de changement de schéma (pas de charge) : à ces marches, le silence. Pas de frère cité entre une charge et des reps.

*Précisé le 04/10/2026 (50-1 bis)* : la page d'un exercice en reps ne dit plus « pas de palier en kilos » ; elle dit, par le formateur, « Ta charge, c'est ton poids du corps : le coach suit tes reps. »

**Le lest.** La version lestée est un autre exercice (`tractions_leste`…) ; « J'ai du lest » l'ajoute à la place de l'exercice libre, et elle **démarre** à **2,5 kg, au bas de la zone** (§8.4, exception étroite) ; ensuite, la mécanique d'une charge, **le saut valant 2,5 kg** (les coachs : le plus petit disque, puis retour au bas de la fourchette). La colonne s'appelle « Lest (kg) ».

**L'aide.** Tapée **en positif** dans la colonne « **Aide (kg)** », rangée **en négatif** en base (la convention, 125 séries sur 129 ; comme Hevy, c'est le type d'exercice qui porte le sens), par **une seule fonction** à côté de `lireNombre` ; affichée « Aide 22,5 kg » ; **moins d'aide, c'est monter** (−25 → −22,5). Sur une aide : **ni chauffes, ni dégressive, ni repli, ni seconde charge, ni double saut** (ces règles en pourcentage n'ont pas de sens sur une aide). *Précisé le 04/10/2026 (50-1 bis)* : **l'éditeur de routine** dit « Aide (kg) » pour un exercice assisté, comme la séance (même grille, même en-tête) ; la **cible d'une aide y reste positive** (`charge_cible_kg` est borné de 0 à 1000, le brouillon garde ce qui est tapé) et la conversion en négatif se fait **à la validation d'une série**, par la même fonction unique — jamais à la frappe dans l'éditeur. La **jauge de la table par reps** d'une aide se lit à l'envers : moins d'aide, barre plus longue.

**Entretenir par exercice** (`modes_exercice`) : un **réglage explicite**, depuis l'étiquette de l'exercice comme sa zone — **jamais proposé par le coach** (CADRAGE, 15/09 : l'intention ne se déduit pas des données). Il fait, **pour cet exercice**, ce que fait « Juste un carnet » au profil (I13) : ni ligne du coach, ni pari, ni message, ni chauffe ni dégressive du coach. Le bandeau de décharge planifiée, la semaine allégée et la fin de bloc, faits du plan entier, ne s'éteignent qu'au profil (précisé le 07/10/2026, #382). Le profil reste l'interrupteur général : en Entretenir au profil, tous les exercices le sont.

**Invariants.** **I28** au poids du corps, jamais une ligne haute avec une charge, **ni une dégressive** (mesure en reps, avec ou sans consigne — précisé le 16/10/2026, audit du 16/10, E6) ; **I29** la carte du lest au plus une fois, et jamais sans deux séances au haut ; **I30** sur une aide, ni chauffes, ni dégressive, ni repli, ni seconde charge, ni double saut ; **I31** un exercice en Entretenir : aucune ligne du coach, aucun pari, aucun message, ni chauffe ni dégressive du coach.

**Référence** : `coach49.py` (`consigne_pdc`, `carte_lest`, `depart_leste`, `aide_saisie`, `aide_affichee`) ; cas `cas_pdc49.json`.

### 9.18 « J'ai peu de temps » — décidé le 04/10/2026 (chantier 51)

> **Le temps se décide avant de commencer, sur la routine. Le coach coupe les dernières séries, pas les muscles ; les charges ne changent pas.**

**Où.** Sur l'écran de la routine, à côté de « Démarrer » : « **J'ai peu de temps** ». La routine affiche sa durée estimée (« Environ 75 min (estimation) »). Le geste ouvre un choix de durée (45 min, 60 min) — **ou, quand la durée déclarée au profil (`duree_seance_min`) est sous l'estimation, un seul choix : « Tenir en {durée} min »** (`ciblesDeTemps`, précisé le 07/10/2026, #382) — puis **une carte à accepter** (§1.1 : le coach propose, la personne décide) : « Pour tenir en 45 min (estimation) », la liste de ce qui change (« Soulevé de terre 3 → 2 séries », « Tapis 7 → 3 min », « Hip thrust : retiré, ses muscles sont déjà travaillés »), puis « Tous tes muscles du jour gardent leurs premières séries : ce sont celles qui comptent le plus. Les charges ne changent pas. » ; boutons « **Raccourcir** » / « **Garder la séance** ». « Raccourcir » démarre la séance avec cette structure : c'est un geste de la personne, la règle « la routine (ou l'utilisateur) décide de la structure » tient. **En séance, il n'y a pas de geste « temps »** : si le temps manque, terminer plus tôt suffit — les exercices non faits sont ignorés, sans compter comme un recul.

**Ce que la personne a dit de son temps** (`profiles.temps_reponse`, précisé le 08/10/2026, 60-2b) — seulement quand une durée visée est déclarée (`duree_seance_min`) et que l'estimation de la routine la dépasse, hors semaine allégée :
- **« Moins en ce moment »** (`moins`) : la carte de « J'ai peu de temps », à la durée visée, **s'ouvre d'elle-même** sur l'écran de la routine, **une fois par routine et par jour** (mémoire locale) ; « Garder la séance » la ferme pour la journée. C'est toujours une carte à accepter.
- **« Ça varie »** (`varie`) : **pas de question avant « Démarrer »** (un geste de plus à chaque séance, qu'on finit par fermer sans lire) ; l'estimation s'écrit en couleur du coach à côté de « J'ai peu de temps », pour que le dépassement se voie.
- **« C'est mon maximum »**, **« J'ai de la marge »** : rien en séance. Le programme construit (QUESTIONNAIRE-COACH-V2 §5 bis, 60-4) passe par cette fonction pour tenir la durée visée avec « C'est mon maximum », « Moins en ce moment » et « Ça varie » ; avec « J'ai de la marge », il n'est pas raccourci. **Les exercices d'une zone à ménager sont exemptés du raccourci** (précisé le 08/10/2026, 60-5, étendu en 60-6) : ni une série (étape 4), ni leur dégressive (étape 3), ni la ligne entière (étape 5) — sans quoi la presse, qui couvre les quadriceps du squat ménagé, aurait pu faire tomber le squat — ; le temps se prend sur les autres ; la cible est « inatteignable » dès que seuls les exemptés restent.

**L'estimation** (une seule fonction, en secondes ; calée sur les séances chronométrées d'Aurélien) : par exercice, +30 (changement) ; cardio ou durée : durée × séries + repos × (séries − 1) ; chauffes : n × 60 + (n − 1) × 60 + 120 (les repos de chauffe de §9.15) ; séries de travail : séries × (60 + repos prévu ; 15 quand le repos est porté par l'autre exercice du superset) ; dégressive : 45. Affichée arrondie à la minute, toujours avec « (estimation) ». **Ces constantes sont des valeurs par défaut** — vérifiées sur les séances chronométrées d'Aurélien, pas réglées sur lui : la référence reste la fourchette personnelle (méta-règle du projet). Quand l'historique chronométré d'une personne le permettra, elles se liront sur ses propres séances, séparément pour chaque personne (noté, pas fait). Les cas de test figent les valeurs par défaut pour vérifier l'**algorithme**, pas pour dire combien de temps dure une série.

**Raccourcir jusqu'à la cible**, dans cet ordre, en recalculant l'estimation à chaque pas et en s'arrêtant dès qu'elle tient :
1. le **cardio de fin** (exercice sans muscle, après le premier rang) est mis à part ;
2. le **cardio de début** (un exercice sans muscle au premier rang) passe à 3 minutes ;
3. les **dégressives** tombent, dans l'ordre de la séance ;
4. **une série de travail en moins**, à chaque tour, sur l'exercice de plus basse priorité — **1** isolation, **2** polyarticulaire (au moins 3 muscles principaux, secondaires et stabilisateurs), **3** le premier exercice qui travaille un muscle — puis celui qui a le plus de séries, puis le plus loin dans la séance ; **planchers** : 2 séries pour les priorités 2 et 3 (pour la force, environ 2 séries par séance portent presque tout le gain), 1 pour l'isolation ;
5. **un exercice entier** ne tombe (avec ses chauffes) que si **chacun de ses muscles principaux** est muscle principal d'un autre exercice gardé — jamais le premier ; plus basse priorité, puis le plus loin, d'abord.
**Les chauffes ne tombent jamais seules**, et **les charges ne changent pas** : les consignes des exercices gardés sont celles de la séance complète. **Une cible inatteignable** (les planchers atteints avant la cible) : la carte montre la version la plus courte possible, **sans prétendre tenir la cible** — « Au plus court : 35 min (estimation) » — et le bouton dit « Raccourcir à 35 min » ; la référence rend `tient = false`.

**Avec le reste du coach** (précisé le 04/10/2026) :
- **Une réduction s'applique une seule fois, sur la routine** (la règle du 02/10 pour le remplacement) : dans une séance raccourcie, la semaine allégée et la série de plus lisent **le nombre de séries de la routine complète**, jamais celui de la séance.
- **Pendant une semaine allégée, « J'ai peu de temps » n'apparaît pas** : la séance est déjà plus courte, et la routine affiche à la place sa durée allégée — « Semaine allégée : environ 50 min (estimation) ». En « Juste un carnet » au profil, il n'y a jamais de semaine allégée : le geste apparaît (précisé le 07/10/2026, #382).
- **La question de fin de séance** (ECRAN-SAISIE §6.3) ne propose jamais de retirer de la routine un exercice enlevé par le raccourcissement.
- **Dans l'estimation, un exercice retiré ou un cardio mis à part ne compte pas**, pas même son changement d'exercice.
- Une séance raccourcie, faite à la charge proposée, compte comme suivie pour le compteur de stagnation (§12.9) : sans progrès, il avance d'une séance.


**Invariant I32** : une séance raccourcie garde, pour chaque muscle principal de la routine, au moins une série de travail ; le premier exercice garde au moins 2 séries de travail et toutes ses chauffes ; aucune charge ne diffère de la consigne de la séance complète.

**Référence** : `simu_raccourcir.py` (`duree`, `raccourcir`) ; cas `cas_raccourcir51.json`.


### 9.19 « Machine prise » — décidé le 04-05/10/2026 (chantier 51)

> **D'abord « Plus tard » : l'exercice prévu, un peu plus loin. Sinon un frère, avec sa propre consigne.**

**Où.** Dans les ⋯ d'un exercice en séance : « **Machine prise** ». Une feuille, deux sortes de choix :
- « **Plus tard** » — « Il passe après {exercice suivant}. Ta consigne ne change pas. » Le bloc de l'exercice passe **juste après le bloc suivant** ; un superset bouge en entier ; le geste se répète. **Absent** pour le dernier bloc, et dès qu'un exercice du bloc a une série de travail validée (on ne coupe pas un exercice commencé ; alors seul le frère reste).
- « **Un frère** : {nom} » — sous chaque frère, son dernier chiffre, **par la même fonction que « Dernière séance » de la page d'exercice** (« Dernière fois : 80 kg × 10, le 12 sept. »), ou « Première fois ici ». **Ordre** : d'abord les frères qui ne sont pas déjà dans la séance ; parmi eux, ceux qui ont un historique, le plus récent d'abord, puis les autres — ce que le matériel du profil permet d'abord, le reste ensuite, chacun par nom (`rangerParMateriel` : rangé, jamais caché ; un exercice déjà fait n'est jamais rétrogradé ; précisé le 07/10/2026, #382) ; un frère déjà dans la séance reste proposé, à la fin (il serait une seconde occurrence, libre, §9.13 bis) ; un frère **écarté** par la personne (ECRAN-SAISIE §7 quindecies.9) reste proposé, tout à la fin, avec la mention « écarté » (précisé le 08/10/2026, 60-4). Choisir un frère est un **remplacement** (§9.13 bis : il reçoit les lignes restantes, avec sa propre consigne, sans rien hériter, §8.4). Sans frère au catalogue : « Pas de frère au catalogue pour cet exercice. » et le bouton habituel « **Remplacer l'exercice** », qui ouvre le catalogue (précisé le 05/10/2026, #365).

**Le coach ne change rien d'autre.** « Plus tard » ne modifie ni la consigne, ni les paris, ni le compteur : la charge ne dépend pas de la position (mesuré chez Aurélien, 2 089 cas) et §12 bis interdit une règle d'ordre sans mesure. Les paris de l'exercice décalé gardent leur fondement ; un effet de la fatigue sur les reps se lira dans leurs observations.

**Deux occurrences voisines d'un même exercice s'affichent en deux blocs** (précisé le 05/10/2026) : un bloc est une occurrence, jamais un regroupement par exercice.

**Référence** : `machine_prise51.py` (`plus_tard`, `freres_proposes`) ; cas `cas_machine_prise51.json`.


### 9.20 « J'ai mal » — décidé le 04-05/10/2026 (chantier 51)

> **Sans coach pour la séance, sans compter comme un recul, et jamais bloqué ensuite : la personne choisit comment reprendre.**

**Où.** Dans les ⋯ d'un exercice en séance : « **J'ai mal** ». Une feuille : « {exercice} : tu as mal » ; « Pour aujourd'hui, {exercice} est sans coach : il ne comptera pas comme un recul. » ; quatre choix — « **Alléger** » (moins lourd, plus de reps : la personne choisit la charge), « **Changer de position** » (amplitude, écart, tempo : ce qui ne fait pas mal), « **Un frère** » (la liste de §9.19), « **Arrêter cet exercice** » (passer au suivant : les lignes restantes ne sont pas faites) ; et **une seule phrase de sécurité**, factuelle : « Si la douleur dépasse 5 sur 10, ou ne redescend pas en 24 heures, demande l'avis d'un professionnel. » **Jamais de diagnostic, de localisation, ni de conseil médical.**

**Ce que fait la marque.** Elle se pose **quand la personne choisit** l'un des quatre choix, jamais à l'ouverture de la feuille : fermer la feuille sans choisir ne marque rien (précisé le 05/10/2026 : un « J'ai mal » touché par erreur ne change rien). Les séries de cette occurrence dans la séance — déjà validées et à venir — portent `douleur` (une donnée de la série ; la charge et les reps validées ne changent pas). L'exercice passe **sans coach pour la séance**, comme en Entretenir (I13, I31) : ni ligne du coach, ni pari, ni message pour ses lignes restantes. **La séance-exercice est neutre** (§7.6, déclarée) : elle ne vote pas pour la charge ; le compteur ne la compte ni ne la juge ; le test, la chute et la carte du lest se lisent sur la dernière séance non neutre ; **sa présence compte pour le rythme** (une reprise se lit avec elle). Les paris déjà écrits restent (table immuable) ; leurs observations aussi.

**La reprise.** À la séance suivante de l'exercice, si **sa dernière séance porte la marque**, une carte, **sans question** (§20.2) : « Ta dernière séance de {exercice} était douloureuse. » ; « On reprend comme tu veux. Tu peux toujours changer d'avis depuis l'étiquette de l'exercice. » ; trois choix :
- « **Comme avant : {consigne}** » — la consigne normale (calculée sans la séance douloureuse) ;
- « **Plus léger, plus de reps : {repli}** » — par les mécanismes existants, **sans règle nouvelle** : une correction de zone vers **la zone suivante en reps** (lourd → mix → hypertrophie → volume → séries longues ; séries longues reste), et la charge par **le report de charge** (§9.10 : la plus basse entre la charge déjà tenue dans la zone suivante sur 90 jours et l'estimation depuis le dernier palier, au cran inférieur, au bas de la zone ; précisé le 05/10/2026, #368 — un seul calcul pour tout changement de zone) — ce choix est donc **toujours proposé** (précisé le 05/10/2026 : « il ne faut pas se bloquer ») ; **quand la charge proposée n'est pas plus basse que celle de « Comme avant »**, le choix s'appelle « **Plus de reps : {charge} × {reps}** » — le coach ne dit pas « plus léger » sans l'être (précisé le 05/10/2026, §20 bis) ;
- « **Sans coach cette fois** » — l'exercice est de nouveau marqué pour la séance.
La carte revient tant que la dernière séance porte la marque ; elle disparaît dès une séance sans elle.

**L'occurrence en base.** Chaque série saisie dans l'app porte l'identifiant de son **occurrence** (`sets.occurrence`) : une séance relue sépare deux occurrences voisines d'un même exercice (§9.19) ; les séances importées ou anciennes (NULL) gardent le regroupement par voisinage.

**Invariants.** **I33** une occurrence marquée « douleur » : aucune ligne du coach, aucun pari, aucun message pour ses lignes restantes ; **I34** une consigne ne lit jamais une séance-exercice marquée pour sa charge (elle est neutre) ; **I35** la carte de reprise n'apparaît que si la dernière séance de l'exercice porte la marque, et n'a pas de point d'interrogation.

**Référence** : `cas_douleur51.py` (`zone_plus_de_reps`, `carte_reprise`, la neutralité sur les séances d'Aurélien) ; cas `cas_douleur51.json`.


### 9.21 La charge de départ — décidée le 05/10/2026 (chantier 52)

> **La routine donne un point de départ ; dès qu'il a des données, le coach décide seul — et le dit.**

Un exercice **jamais fait** par la personne (aucune série de travail dans son historique) et dont la routine porte une **charge de départ** (`charge_cible_kg`, ECRAN-SAISIE §7 quindecies.3) : la consigne part de cette charge, aux reps de la routine, et la phrase grise le dit : « Première fois ici : on part de ta charge de départ, 60 kg. » (par le formateur unique). Sans charge de départ : « Première fois ici » comme aujourd'hui. **Dès la première série validée, l'historique existe : le coach décide seul.** Une charge de départ n'est ni un pari sur un palier, ni une règle : c'est la seule donnée disponible.


### 9.22 Les programmes à cycles — décidés le 05/10/2026 (chantier 53)

> **Un programme fixe la zone de tes barres, la durée du bloc et sa décharge. Il ne choisit jamais un exercice, ne touche pas à leur ordre, et ne décide pas des charges : le coach continue de le faire.**

**Ce qu'est un programme.** Les **blocs** d'un même **dossier** (§7 duodecies.3 d'ECRAN-SAISIE : le dossier reste une étiquette), chaînés (`blocs.precedent`) ; un seul bloc en cours par dossier. « **Faire de ce dossier un programme** » : la zone du premier bloc (**Lourd ou Mix**, §19.2 amendé), sa durée (**4 semaines par défaut**, de 3 à 6), sa décharge (la dernière semaine, oui par défaut), son début (le lundi qui suit, réglable) ; **les exercices du bloc** : par défaut **les barres polyarticulaires** des routines du dossier (au moins 3 muscles principaux, secondaires et stabilisateurs), **plus les exercices prioritaires** du questionnaire (`profiles.priorites`) qui sont dans les routines du dossier, même hors barre (précisé le 08/10/2026, 60-2b : la force se travaille lourde, sur l'exercice qu'on veut améliorer), décochables ; **la zone proposée pour le premier bloc suit l'objectif** : Force ou Les deux → **Lourd** ; Muscle, Forme ou sans réponse → **Mix** (Schoenfeld 2021 : le lourd fait la force, le muscle se gagne sur un large éventail de charges ; précisé le 08/10/2026) — toujours modifiable. Le bloc suivant garde sa règle fixe ; les autres gardent leur zone.

**La carte « Passer en cycles »** (décidée le 08/10/2026, 60-4). Un programme construit (QUESTIONNAIRE-COACH-V2 §5 bis)
est fait de routines simples. Pour l'objectif **Force** ou **Les deux** seulement, une carte sur Saisie, **une seule
fois** : 21 jours après la création du programme (`profiles.programme_construit_le`) et après au moins 6 séances faites
depuis ses routines, ni en « Juste un carnet », ni si son dossier est déjà un programme. Le texte et les boutons :
QUESTIONNAIRE-COACH-V2 §5 bis. « Passer en cycles » ouvre « Faire de ce dossier un programme » sur ce dossier ;
« Pas maintenant » écrit `profiles.carte_cycles_le` et la carte ne revient jamais. Une question, parce que le coach
propose (VOIX-DU-COACH). Le calendrier des 21 jours ne commente pas l'assiduité : il n'est jamais dit.

**La zone.** Au début du bloc, une ligne de zone par exercice du bloc, datée du début, `origine = 'bloc'` (§9.1.2 amendé) : **la charge suit** (§9.10, le report). Une correction de la personne pendant le bloc l'emporte. Le compteur repart à zéro (un changement de zone est un bloc, §12.2 bis). **« Changer de schéma »** (escalier isolé) se tait pour un exercice d'un bloc en cours : le bloc fixe déjà son schéma ; le repli et la série de plus restent.

**Le calendrier.** « Semaine k sur N » = (jour − début) ÷ 7 + 1, **au calendrier** — jamais en séances : le coach ne commente pas l'assiduité. Une coupure en plein bloc ne le prolonge pas (la reprise gère la charge, §9.9).

**La décharge planifiée.** La dernière semaine du bloc est **la semaine allégée** (§14.4 : mêmes charges, 60 % des séries, 2 reps de moins, même fréquence), posée par le programme, **sans carte** — un bandeau : « Semaine 4 sur 4 : la décharge prévue par ton programme. Mêmes charges, moins de séries, loin de l'échec. » ; ses séances sont traitées comme celles d'une semaine allégée (ni comptées ni jugées). **Pas de cumul** (§14.4, une réduction s'applique une fois) : elle saute si une semaine allégée s'est terminée **moins de 14 jours** avant son début ; et la carte d'une semaine allégée se tait des 14 jours qui précèdent la décharge **jusqu'à sa fin**. Ces mots ne la présentent jamais comme scientifiquement requise (la fréquence des décharges n'est pas tranchée par la science).

**La fin du bloc.** Une carte : « Ton bloc Mix est terminé. » puis **le bilan**, en faits, hors semaine de décharge — chaque exercice du bloc, de sa première à sa dernière charge de travail (« Squat : 110 kg × 6 → 117,5 kg × 6 » ; « inchangé » se dit, sans jugement), lue par **la même fonction que le report** (§9.10) — jamais par « Dernière séance », dont la meilleure série peut être un test isolé (précisé le 06/10/2026, #369) — et **les paris du coach** sur les exercices du bloc : « Le coach avait fait 46 paris sur ce bloc : 39 ont tenu. » (tenu = observé ≥ prédit). Puis **le bloc suivant**, par **une règle fixe** tirée des programmes de force (Mix → Lourd → Mix…, mêmes durée et exercices, une décharge à chaque fin) — **jamais déduite du bloc passé** (§20.1) ; « Commencer le bloc Lourd » / « Ajuster le bloc » / « Arrêter le programme ». **La proposition est un pari** (`module = 'programme'`, `grandeur = 'exercices_en_progres'`, valeur prédite = le nombre d'exercices du bloc, observé à la fin du bloc suivant : combien ont progressé), qui entre dans le bilan suivant. La carte du bloc suivant dit la règle sans jargon : « Le suivant, comme le font les programmes de force : Lourd (3-5) sur tes mouvements à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone. »

**Le début, la fin, l'arrêt — précisés le 06/10/2026 (#369).**
- **Le début.** Le premier bloc commence par défaut **le lundi qui suit**, ou **aujourd'hui** si la personne le choisit ; le bloc suivant commence **le jour où elle l'accepte**. **Avant son début, un bloc ne change rien** : ses lignes de zone sont datées de son début, et le coach ne lit pas l'avenir (§9.12) ; le badge dit « dès le lundi 12 oct. ».
- **Entre la fin et le choix.** Rien ne change sans la personne : les zones du bloc restent en vigueur, aucune décharge de plus n'est posée, le badge dit « Bloc Mix terminé » et la carte de fin reste jusqu'au choix.
- **L'arrêt** (corrigé le 06/10/2026, delta 53-2 ter). « Arrêter le programme » **pendant le bloc ou à sa fin** rend à chaque exercice du bloc **la zone d'avant le programme** — celle qui était en vigueur juste avant le début de son **premier** bloc (en remontant `precedent`), y compris « d'après tes séances » s'il n'y en avait pas : une ligne datée de l'arrêt, `origine = 'bloc'`, `bloc_id` du bloc arrêté. **Sauf** pour un exercice dont la personne a corrigé la zone pendant le programme : rien n'est écrit, sa correction reste. La charge suit (§9.10). Sans cela, les barres resteraient pour toujours dans la zone du dernier bloc — et rendre la zone automatique effacerait une décision de la personne d'avant le programme.
- **Un dossier vidé de ses routines garde son programme** (16/10/2026, audit du 16/10, 03 #5). Le badge et « Arrêter le programme » ne s'atteignaient que par l'en-tête d'un dossier de la bibliothèque, qui ne montrait que les dossiers ayant une routine : routines supprimées ou rangées ailleurs, le bloc restait en cours (sa décharge, ses zones) sans aucun moyen de l'arrêter. La bibliothèque montre donc aussi le dossier d'un bloc en cours qui n'a plus de routine, vide, avec son badge (et sa carte de fin) — le geste existant, rien de plus ; en carnet, rien (I13).
- **L'arrêt avant le début** n'écrit rien : les lignes de ce bloc, datées de son début, donc **après** son arrêt, sont **ignorées à la lecture, comme absentes** — jamais lues comme « sans zone ». Une seule lecture des zones le fait, pour tout le moteur.
- **Le pari de programme** s'écrit **quand le bloc proposé commence tel quel** (« Commencer le bloc Lourd ») — jamais à l'affichage de la carte : afficher n'écrit rien. **Un bloc ajusté ne porte pas de pari** : le coach ne parie pas sur ce qu'il n'a pas proposé.
- **L'étiquette de zone** d'un exercice de bloc porte l'origine : « Mix 6-8 · bloc ».

**Invariants.** **I36** un bloc ne change que la zone de ses exercices (ni exercice, ni ordre, ni série, ni charge hors du report) ; **I37** une zone de bloc est Lourd ou Mix, et ne s'applique qu'à une barre ou un exercice coché ; **I38** jamais deux réductions à la fois (décharge planifiée et semaine allégée) ; **I39** « Changer de schéma » absent pour un exercice d'un bloc en cours.

**Référence** : `cycles53.py` ; cas `cas_cycles53.json` ; l'arrêt : `arret53.py`, cas `cas_arret53.json`.


### 9.23 Les records — décidés le 06/10/2026 (chantier 55)

> **Un record est un fait : une série que rien de ton passé ne dépasse. La médaille le dit à la validation, avec le record d'avant et sa date. Jamais un « bravo ».**

**Les records médaillés** (ceux de Hevy, plus l'ancien record) :
- **la charge pour au moins N reps** (N = les reps de la série) : battue si aucune série passée n'a fait cette charge ou plus pour N reps ou plus. Quand la même charge a déjà été faite, le record se dit en reps (« Record à 130 kg : 5 reps. Avant : 4 reps, le 22 nov. 2025. ») ; sinon en charge (« Record à 4 reps : 130 kg. Avant : 125 kg à 4 reps, le 15 sept. »). Au poids du corps : « Record au poids du corps : 9 reps. » ; avec une aide (charge négative) : « 50 kg d'aide » ; moins d'aide est un record ;
- **la charge la plus lourde**, toutes reps confondues ; à la barre, quand elle est un multiple de 10 kg : **le cap rond** (« Premier 150 kg au soulevé. ») ;
- ~~**le 1RM estimé**~~ — **retiré des records le 16/10/2026** (décision d'Aurélien D1, audit du 16/10) : « La force estimée reste, comme progression (page de l'exercice : « Force estimée ≈ 157 kg, d'après 140 × 5 », sa courbe) ; elle sort des records, des médailles, du fil et de l'XP ; les records sont les vraies barres. » Jusque-là, le 1RM estimé (Epley, 3 à 10 reps) était un record médaillé (`un_rm_estime`, « 1RM estimé : ≈ 147 kg. ») : une série moins bonne qu'une autre (100 kg × 10 après 100 kg × 12) pouvait le battre. Plus aucune ligne `un_rm_estime` ne s'écrit dans `records` ; celles d'avant restent (la table est immuable) et **tous les lecteurs les ignorent** (le jeu et le récap de fin de séance par `faits.recordsDuJournal`, le fil par `faits.medaillesDuSocial`, le récap du groupe par `groupe_recap_de`, migration v2_093). La force estimée se lit sur la page de l'exercice (ECRAN-SAISIE §7 bis.15, MOTEUR §16) ;
- **le volume de l'exercice dans la séance** (charge × reps ; au poids du corps, le total de reps), sur la série qui le fait dépasser, une fois, et seulement s'il y a déjà eu une série de cet exercice dans la séance ;
- **la plus longue durée, la plus longue distance** (cardio, gainage).

**Pas de « meilleure série » (charge × reps)** : elle récompense les séries légères et longues (celle d'Aurélien au couché : 60 kg × 20, en 2024) ; en septembre 2026, elle n'ajoutait aucune médaille.

**Ce qui compte.** Seulement les séries **de travail validées** : ni chauffe, ni dégressive, ni échec. Une série se compare aux séances antérieures **et** aux séries déjà validées de la même séance.

**Deux garde-fous.**
- **Pas de médaille à la première séance d'un exercice** : il n'y a rien à battre.
- **Machines, poulies, haltères et Smith** : comparés sur **les 12 derniers mois** — la même liste de matériels et la même fenêtre que §10.2 (un seul câblage) : d'une salle à l'autre, les piles et les haltères changent. La salle ne sert pas : elle ne se déclare qu'à la fin de la séance (relevé 55-0). À la barre et au poids du corps, toute la vie ; la durée et la distance, toute la vie.

**Une médaille par série**, même si elle bat plusieurs records : la phrase les nomme tous, dans cet ordre — le cap rond ou la charge pour N reps, la charge la plus lourde (si elle n'est pas déjà dite), le volume de la séance, la durée et la distance (16/10/2026, D1 : plus le 1RM estimé). La ligne grise dit le record d'avant et sa date (« le 15 sept. », l'année si elle diffère).

**Le journal des records** (chantier 58, 07/10/2026 ; migrations `v2_061` et `v2_062`). Chaque record battu s'écrit **une fois**
dans la table `records` : une ligne par série et par type (§9.23 : charge pour au moins N reps ou reps à charge, charge
la plus lourde, cap rond, volume de la séance, durée, distance ; le 1RM estimé jusqu'au 16/10/2026, D1), avec sa valeur, la charge d'un record « reps à charge »,
l'unité d'un record de volume (kg ou reps), l'ancien record et sa date, « sur 12 mois » pour un matériel de salle, et la date où il a été battu. **La règle reste celle de la médaille** : le
journal ne calcule rien, il garde ce que la fonction des records (le module des faits) a constaté. Il s'écrit **à
« Terminer »**, par la file d'envoi, pour les séries de la séance ; un envoi répété ne crée pas de doublon. L'historique
d'avant le journal est **rempli une seule fois par l'app**, avec la même fonction, au premier démarrage qui trouve le
journal vide pour ce compte. Une ligne écrite **ne se modifie jamais** ; elle disparaît avec sa série (supprimée, ou
corrigée en Édition : type, charge, reps, durée ou distance) ; l'app réécrit alors les records de cette séance. Les lecteurs (le jeu, plus tard le social) lisent le journal, jamais un recalcul.

**Où.** À la validation de la série, **sous la rangée de la série** (la phrase de réaction, au-dessus de la ligne suivante, parle de la suite ; la médaille parle de cette série : les deux cohabitent). Dans le **récap de fin de séance** (ECRAN-SAISIE §7 septies.4 bis, décidé le 11/10/2026 : il remplace « il n'y a pas d'écran de fin de séance »), la liste des records du jour (sans record, pas de bloc : le coach ne commente pas ce qui n'est pas arrivé) ; la feuille « Terminer la séance » ne les montre plus. Dans l'onglet Progression et la vue d'un exercice (ECRAN-SAISIE §7 bis.14 et §7 bis.15).

**Une seule source.** La charge pour au moins N reps se lit sur **la table par reps cumulée** (ECRAN-SAISIE §7 bis.16 : « cumulée, jamais brute ») ; la médaille, le tableau des records, le « record de charge » de la vue d'exercice et le bloc Records de l'onglet lisent tous la même fonction. L'ancien record se lit sur l'historique sans la séance en cours, plus les séries déjà validées de la séance. La date d'un record est le début de sa séance. Les explorations comptent (décision du 02/10/2026).

**Le tableau des records d'un exercice** : la charge pour au moins 1, 3, 5, 8 et 10 reps, à une date donnée, avec le même périmètre que la médaille ; affiché aujourd'hui, il y a 6 mois et il y a 1 an. **Un record ne baisse jamais** : le tableau ne montre jamais de recul, même en sèche ; l'écart s'écrit en couleur du coach quand il monte, rien quand il est nul. Pas de rouge. **Sauf la fenêtre de 12 mois** des machines, poulies, haltères et Smith : leurs records (le tableau, le « record de charge » de la vue d'exercice) se lisent sur 12 mois, et l'affichage le dit (« sur 12 mois ») — un vieux record peut en sortir ; on ne le présente jamais comme un recul (précisé le 06/10/2026, #371).

**Le rapport au poids** : la charge de travail (§8) divisée par la pesée la plus récente **de moins de 14 jours**, au centième ; sinon rien (« Pèse-toi pour voir ce rapport. »).

**Le bilan du mois** : séances, séries de travail, volume (charges positives), jours d'entraînement, records, séries par muscle comparées au mois d'avant — **comptées comme le bloc Volume** (REGLE-VOLUME : un muscle principal compte la série entière, un secondaire pour moitié, un stabilisateur pour un quart ; une seule fonction, précisé le 06/10/2026, #371), exercices les plus faits, et **les paris du coach** vérifiés et tenus (tenu = observé ≥ prédit), dits en « Sur 10 paris vérifiés, le coach en a tenu 9. » — ramenés à 10 dès 10 paris vérifiés (arrondi au plus proche), sinon les chiffres tels quels (« Sur 7 paris vérifiés, le coach en a tenu 6. »), rien sans pari vérifié. **Le temps d'entraînement** n'apparaît que si toutes les séances du mois ont une heure de fin. Aucune couleur de jugement, aucune phrase sur l'assiduité (CADRAGE).

**Référence** : `records55.py` ; cas `cas_records55.json`.


### 9.24 La semaine qui déraille — décidée le 15/10/2026 (chantier 99)

> **Le coach parle du plan, jamais de la personne. La référence est toujours le programme.**

**Les décisions d'Aurélien (15/10/2026), mot pour mot.**
1. Seulement avec un programme à jours prévus. Le coach s'en rend compte à l'ouverture de l'app après le jour manqué, jamais par une notification.
2. Une carte, sans reproche, qui parle du plan, jamais de la personne (« Jambes n'a pas eu lieu mardi. »), avec trois choix : « Jambes aujourd'hui · la suite se décale » / « Répartir ses séries dans la semaine » / « Garder Pull, comme prévu ». Le coach met en avant celui qui garde le mieux le volume de la semaine et dit pourquoi en une ligne ; le choix reste à la personne.
3. Récupération, comptée en jours du calendrier, sans l'heure : jamais les mêmes muscles primaires le lendemain ; possible le surlendemain (J+2) ; débutant (niveau du questionnaire) : J+3. Un choix qui enfreindrait cette règle n'est pas proposé (le décalage comme la répartition).
4. Répartir : les séries de la séance manquée se répartissent sur les séances restantes de la semaine, un exercice choisi pour chaque séance qui ne recharge pas ce que cette séance fatigue déjà (muscles primaires et stabilisateurs, ex. pas de squat ni de soulevé après le rowing penché : lombaires), et dans la durée habituelle de la personne (questionnaire). Priorité au muscle le plus en retard sur son volume habituel de la semaine (relevé par muscle). Ce qui ne rentre pas est laissé.
5. Fin de semaine, plus la place de décaler : « Ajouter à la séance du jour » (un exercice, même règle que 4) ou « Non merci ».
6. Le bloc garde son calendrier (§9.22) ; le décalage ne fait que déplacer une routine dans la semaine ; rien n'est reporté à la semaine suivante.
7. « Garder … comme prévu » est respecté ; la question n'est posée qu'une fois par séance manquée. Deux séances manquées : une seule question, sur le muscle le plus en retard.
8. Jamais : un compteur de séances manquées, un mot sur l'assiduité, une mention dans les bilans.

Une décision de la personne (décaler, répartir) ne s'efface jamais en silence : si elle modifie une routine ou un plan, c'est pour cette semaine seulement, et elle se lit dans la séance (« ajouté : séance manquée de mardi »).

**Répartir, règle corrigée (Aurélien, 15/10/2026).** Elle remplace « ne recharge pas ce que la séance fatigue déjà » dans le cas où la séance d'accueil travaille les mêmes muscles. Dans une séance qui travaille déjà le muscle, le coach peut ajouter des séries de la routine manquée tant que ce muscle reste sous 10 séries dans la séance (séries pondérées comme le relevé), sans dépasser la durée habituelle ni la récupération en jours (J+2, J+3 pour un débutant). Il ne duplique pas un mouvement principal déjà présent : il prend d'abord les exercices de la routine manquée qui ne sont pas déjà dans la séance (exemple réel, programme Sèche d'aurel_br : Bas A manqué, vendredi Bas B reçoit Presse 3 + Extension Jambes 3 + Mollets 1, ~85 min sous 90 ; pas de squat ajouté, le squat avec pause y est déjà). Dans une séance d'un autre groupe, la règle actuelle s'applique (pas d'exercice dont les muscles primaires ou stabilisateurs chargent ce que la séance fatigue déjà). Plusieurs exercices par séance sont maintenant permis dans cette limite.

**Un fil (Aurélien, 15/10/2026).** La référence de la carte et de la répartition est TOUJOURS le programme (les séries que prévoient ses routines), jamais l'historique. Le coach ne dit jamais « moins que d'habitude » et ne propose jamais plus que ce que prévoit la routine manquée. La « semaine » = les routines du programme qui ont un jour.

**Les jours prévus** (`routines.jours`, `v2_084` : `smallint[]`, 1 = lundi … 7 = dimanche, NULL = sans jour). La migration les remplit seulement pour les noms qui commencent exactement par « <Jour> — » ; le générateur les écrit à la création d'un programme, par la même règle (`THDeraille.jourDuNom`), en gardant le préfixe du nom. Lus, écrits et relus comme les autres colonnes de routines ; un renommage ou un réordonnancement ne les touche pas. Une routine sans jour n'est jamais concernée. Pas d'écran pour poser les jours à la main (noté pour plus tard).

**Ce que le code en a fait (99, choix tranchés).**
- **Une séance « a eu lieu »** quand une séance de la semaine (lundi → aujourd'hui, jour civil local) porte sa routine (`sessions.routine_id`) ; une routine prévue deux fois compte ses séances dans l'ordre des jours. Une séance hors routine ne remplace pas une routine prévue, mais compte pour la récupération (ses muscles principaux).
- **Le muscle le plus en retard** : le volume prévu par le programme pour la semaine (la règle du volume, 1, ½, ¼, sur les séries de travail des routines à jour), moins le volume fait cette semaine (`faits.semaineDuProgramme`). C'est la lecture de « volume habituel de la semaine » (décision 4) imposée par le fil : le programme, pas l'historique. La phrase de fin de semaine dit les deux chiffres : « Deltoïde antérieur : 0 série cette semaine ; ton programme en prévoit 10. »
- **Le décalage** : la séance manquée passe aujourd'hui ; chaque séance suivante glisse au jour suivant tant qu'elle se heurte à la précédente, et s'arrête au premier jour libre. Proposé seulement si rien ne passe dimanche et si chaque séance déplacée respecte la récupération (contre les séances faites des 14 derniers jours et les autres séances prévues).
- **La répartition** (règle corrigée du 15/10/2026) : pour chaque séance prévue d'aujourd'hui à dimanche, dans l'ordre des jours, autant d'exercices de la routine manquée que la règle le permet, chacun avec au plus les séries de travail que la routine prévoit (ni chauffe, ni série de plus ; une partie seulement si la durée l'exige). « La séance travaille déjà le muscle » : l'exercice a un muscle principal en commun avec elle ; alors chacun de ces muscles reste ~~**strictement sous 10**~~ **au plus à 11** séries pondérées (1, ½, ¼) dans la séance, ajouts compris. Sinon, aucun de ses muscles principaux ou stabilisateurs n'est déjà principal ou stabilisateur de la séance. **Le plafond se compte ajouts compris** (précisé le 16/10/2026, audit du 16/10, 01 #2) : un muscle principal que la séance **ou un exercice déjà ajouté** travaille reste sous le plafond — lu sur la séance d'origine seulement, Presse 5, Hack 5 et Extension 5 d'une séance Jambes manquée passaient l'un après l'autre dans un Pull (15 séries de quadriceps) ; désormais Presse 5 + Hack 5 + Extension 1 = 11. « Même groupe » et « ce que la séance fatigue » restent ceux de la séance prévue : un ajout ne lève pas la garde de la décision 4 (le leg curl ajouté à un Pull n'y fait pas entrer le soulevé roumain ni le squat après le rowing : lombaires). **Le plafond par séance, unifié le 16/10/2026** (audit du 16/10, 01 #4) : une seule constante, celle du générateur (QUESTIONNAIRE §5 quater, G4 : « au plus ~11 séries », Remmert, Pelland et al. 2025 ; `THGenerateur.PAR_SEANCE`), lue ici et là-bas. Les deux specs se contredisaient (« strictement sous 10 » ici, décision du 15/10 ; « au plus 11 » au générateur) : le générateur l'emporte, **à reconfirmer par Aurélien**. Le cas réel de Bas B (9 séries de quadriceps) ne change pas. « Un mouvement déjà présent » : le même exercice, ou le même `mouvement` au catalogue (le squat et le squat avec pause sont un même mouvement) ; il n'est jamais ajouté. Toujours : la récupération, et l'estimation de la séance (§9.18) sous la durée visée (`duree_seance_min` ; sans durée déclarée, pas de limite). Parmi les candidats, celui du muscle le plus en retard, puis l'ordre de la routine. La fin de semaine (décision 5) garde un exercice.
- **Mis en avant** : celui qui garde le plus de séries de la routine manquée ; à égalité, le décalage. La ligne : « Mis en avant : il garde les 10 séries de Jambes. » ou « … il garde 3 des 10 séries de Jambes. » « Garder » n'est jamais mis en avant.
- **La fin de semaine** : aucune séance prévue après aujourd'hui. Aussi quand ni le décalage ni la répartition ne sont possibles (précisé le 16/10/2026, audit du 16/10, 01 #10 : les deux cas sont une seule carte, qui dit les deux chiffres ; le second omettait la première phrase. Avec les règles d'aujourd'hui il ne trouve d'ailleurs jamais d'exercice : la répartition essaie déjà la séance du jour en premier, avec les mêmes entrées). Sans séance prévue aujourd'hui, ou sans exercice qui passe la règle 4 : pas de carte (une carte sans choix utile serait un reproche).
- **Deux séances manquées** : la question porte sur la routine dont un muscle principal a le plus grand retard ; toutes les séances manquées ouvertes sont marquées comme posées.
- **Le nom montré** est celui de la routine sans son préfixe de jour (« Mardi — Jambes » → « Jambes »).
- **Ce que la personne décide** est en base (`semaine_choix`, v2_085 : `user_id`, `semaine` = le lundi, `routine_id`, `choix` ∈ decaler / repartir / garder / ajouter / non, `detail` jsonb, `cree_le` ; clé (`user_id`, `semaine`, `routine_id`) ; RLS propriétaire) : une ligne par séance manquée de la carte, la séance de la question portant le détail (le planning décalé, les exercices ajoutés). L'app l'écrit par la file d'envoi (un `upsert` sur la clé, jamais en direct), le relit au démarrage (les deux dernières semaines) et le garde aussi en cache local pour le hors-ligne ; la plus récente gagne par clé. Rien n'est écrit dans une routine. Un exercice ajouté porte sa mention dans la séance et n'est jamais proposé à l'écriture dans la routine par la question de fin.
- **En « Juste un carnet »** (profil), le coach se tait : pas de carte.
- **Le module** : `v2/js/deraille.js` (`semaineQuiDeraille`, `decider`, `ajoutsDuJour`, `bandeDeLaSemaine`), pur. La carte vit avant toute séance : elle n'est pas une décision de `planDeSeance`. Un exercice ajouté entre dans la séance comme les autres, et le plan le coache comme les autres.

**Maquette** : `v2-atelier/maquettes/maquette-semaine-deraille-v3.html` (validée le 15/10/2026). **Tests** : `tests/unit/v2-deraille.test.js` ; banc : section `deraille`.


### 9.25 L'objectif — à l'essai, décidé le 16/10/2026

> **« On essaye avec une date, on enlèvera si c'est pas bien. »** (Aurélien, 16/10/2026)

**Les décisions, mot pour mot** (le plafond et la grandeur du pari précisés par Claude.ai le 16/10/2026) :

« La personne pose elle-même un objectif sur un exercice, en charge × reps (« 150 kg × 1 au squat ») ; le coach ne l'impose jamais. Un objectif par exercice ; elle peut le changer ou le retirer.

Le rythme : le meilleur record « charge pour au moins N reps » (N = les reps de l'objectif, à reps égales, jamais un maximum estimé) aujourd'hui, comparé à celui d'il y a un an (ou au plus ancien s'il y a moins d'un an d'historique), en kg par mois ; plafonné par le seuil « hors littérature » du REFERENTIEL-BORNES, selon l'ancienneté déclarée (moins d'un an : 40 % sur 12 semaines ; 1 à 3 ans : 20 % par an ; au-delà ou non renseignée : 15 % par an), converti en kg par mois une fois, à la pose, sur le record d'il y a un an ; ce plafond ne coupe que l'impossible. Il faut au moins 8 semaines d'historique et 3 records à au moins N reps sur l'exercice ; sinon, ou si le rythme est nul : « Pas encore de date. » et aucun pari.

La date : projetée au moment où l'objectif est posé, arrondie à la fin du mois (« Au rythme actuel : fin février. »). Au-delà de 12 mois : « Au rythme actuel : plus d'un an. » et aucun pari. La date affichée est celle du pari, figée : elle ne bouge pas d'une séance à l'autre. Atteint : « Atteint le 12 février. »

C'est un pari, dans `predictions` : module « objectif », grandeur « jours », valeur prédite = le nombre de jours entre la pose et la fin du mois annoncée, écrit quand l'objectif est posé ou changé ; valeur observée = le nombre de jours réellement mis, rattaché à la série qui atteint l'objectif (`set_observe`), écrite quand ça arrive, même après l'échéance. Tenu = observé ≤ prédit ; sans observation passé l'échéance, il est non tenu à la lecture. Un objectif changé ou retiré n'efface pas l'ancien pari : il reste et s'observe comme les autres. Ces paris ne comptent pas dans le total des paris des bilans (« 38/41 ») tant qu'une règle ne l'a pas décidé.

Où : la page de l'exercice (« Mon objectif », jauge depuis le record, la ligne de date), et une ligne dans la story du mois quand l'objectif avance (« Squat : 145 → 147,5 kg, objectif 150. »). Jamais dans les phrases du coach pendant la séance. Jamais « impossible », jamais en rouge.

Exception à « jamais le délai » : la règle d'ECRAN-SAISIE §3.5, §7 bis.15 et ECRAN-PROFIL §2.6 reste en vigueur partout, sauf pour un objectif posé par la personne, à l'essai. »

**Le plafond « moins d'un an », révisé — décision d'Aurélien du 16/10/2026 (D12, audit du 16/10, objectif à l'essai)** : « « moins d'un an » = +40 % sur les 12 premières semaines, puis +20 %/an. » Remplace « moins d'un an : 40 % sur 12 semaines » converti en kg par mois et appliqué jusqu'à 12 mois (≈ 14,5 % par mois, +174 % par an : le plafond ne coupait rien, audit 01 #12). Le plafond a désormais deux temps, comptés depuis la pose : pendant 12 semaines, 40 % du record d'il y a un an sur 84 jours ; ensuite, 20 % par an ; le rythme de chaque temps est le plus petit du rythme personnel et de son plafond. Les autres tranches sont inchangées (1 à 3 ans : 20 % par an ; au-delà ou non renseignée : 15 % par an). Le pari porte les deux temps (`fondement.plafond_apres`, `rythme_apres`) ; le module des paris d'objectif passe en version 2.

**Les trois points tranchés ensuite (Claude.ai, 16/10/2026).** Un objectif déjà atteint est refusé, avec le fait (« Déjà fait : 152,5 kg × 3, le 3 mars. »). En « Juste un carnet », l'objectif et la jauge s'affichent, mais ni la date ni le pari. La contrainte `predictions_observation_coherente` n'est pas étendue : l'observation se rattache toujours à une série.

**L'objectif lit Ma salle (16/10/2026, audit du 16/10, 01 #3 ; choix du prompt 122 : « refuser à la pose avec le fait »).** Un objectif sur un exercice à barre fixe ou aux haltères (§10 bis), au-delà de la plus lourde de la salle déclarée, est refusé à la pose, avec le fait : « Ta salle va jusqu'à 30 kg en barre EZ. », « Ta salle va jusqu'à 2 × 40 kg en haltères. » — sans quoi le pari porterait sur une charge que le coach s'interdit de proposer. Aussi en « Juste un carnet ». Une charge entre deux charges de la salle (27,5 kg entre les barres de 25 et 30) n'est pas refusée : elle s'atteint à 30. La salle en vigueur se juge comme au §10 bis sur la plus lourde série faite : à la barre, au-delà de la plus lourde barre fixe, c'est une barre qu'on charge, et rien n'est refusé. Sans salle déclarée, rien ne change. Un objectif posé avant la déclaration de la salle reste tel quel (la date est figée).

**Ce que le code en a fait (109, choix validés le 16/10/2026).**
- **Le module** : `v2/js/objectif.js` (`projection`, `pariDe`, `vue`, `observationDe`, `estTenu`), pur, déclaré à la garde d'architecture ; l'identifiant du pari, `THMoteur.idDObjectif` : UUID v5 sur `objectif|exercice|instant de la pose` (l'instant, pas le jour : deux poses le même jour sont deux paris). Le record se lit par `Modele.recordsDeLExercice`, la fonction de la médaille et du tableau des records — même périmètre (12 mois pour un matériel de salle).
- **« 3 records à au moins N reps »** : trois hausses de la table cumulée à N reps ou plus sur la vie de l'exercice, la première série comprise. **« 8 semaines d'historique »** : depuis la première séance de l'exercice. **« Le plus ancien »** : la première hausse, quand l'exercice a moins d'un an ou rien à N reps ou plus il y a un an. Un mois = 365,25 / 12 jours. « Au-delà de 12 mois » se juge sur la date projetée ; l'échéance est le dernier jour de son mois ; les jours se comptent au calendrier, du jour de la pose.
- **Une seule ligne de date** sur la carte, selon le cas : « Au rythme actuel : fin février. » (suivie, en gris, de « C'est un pari du coach : on verra s'il tombe juste. », maquette), « Au rythme actuel : plus d'un an. », « Pas encore de date. », ou « Atteint le 12 février. » — un fait, montré aussi en « Juste un carnet ». L'année n'est dite que si le mois annoncé est celui d'aujourd'hui, un an plus tard. Rien en « Juste un carnet » sinon.
- **La jauge** va du record « au moins N reps » de la pose à l'objectif ; sous elle, « Aujourd'hui : 145 kg × 1 » (le record d'aujourd'hui, à au moins N reps). La jauge est dans la couleur du coach, la ligne en texte ordinaire : jamais de rouge.
- **Atteint** : la première série de travail de l'exercice, à la charge de l'objectif ou plus, pour ses reps ou plus, faite après la pose (sa validation, sinon le début de sa séance). L'observation s'écrit à « Terminer » et à la synchronisation (une séance importée), par la file, derrière la séance de la série ; elle n'est jamais retirée par l'app : une série effacée vide l'observation en base (`sets_efface_observation`), et une autre série qui atteint l'objectif la reprend.
- **Le pari** : `exercise_slug` vide (l'exercice dans le fondement, comme l'escalier), pas de `seance` dans le fondement ; il ne vit pas dans `local.predictions` (le circuit des paris de la séance) mais à part. Les bilans ne comptent que les paris de consigne ; le score de guilde les ignore aussi.
- **Les objectifs exclus** : un exercice au poids du corps, avec une aide, en durée ou en distance — un objectif se pose en charge × reps, à charge positive. Le même objectif reposé tel quel ne change rien (la date ne bouge pas).
- **La table** `objectifs` (migration proposée `v2_089`) : `user_id`, `exercise_slug`, `charge_kg`, `reps`, `pose_le`, `depart_kg`, `projection` (`date` / `pas_encore` / `plus_d_un_an` / `carnet`), `echeance`, `pari_id` ; clé (`user_id`, `exercise_slug`), RLS propriétaire ; écrite par la file (un `upsert` sur la clé, ou une suppression). **Sans la migration**, la lecture répond « table absente » (PGRST205) : la carte ne s'affiche pas, rien ne part vers elle.
- **La story du mois** : la ligne « Squat : 145 → 147,5 kg, objectif 150. » attend la story du mois (PR #433, pas encore fusionnée) — notée pour après.

**Maquette** : `v2-atelier/maquettes/maquette-salle-objectif-v1.html`, écrans 3 et 4 (validée le 15/10/2026 ; l'écran 3 n'affiche qu'une ligne de date). **Tests** : `tests/unit/v2-objectif-date.test.js` ; banc : section `mon-objectif`.


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

*Le pas qui n'est pas un multiple de 0,5 kg : voir la précision du 19/09/2026, plus bas.*

**Quelle charge proposer — ordre tranché le 19/09/2026.** Le moteur ne propose que des charges que la salle fait :

1. **pas exact** déduit de l'historique (§10.1) : palier + pas ;
2. pas approximatif : la **charge déjà utilisée juste au-dessus** du palier (élévation latérale poulie : 9 → 11,5, et non 9 + 2,2) ;
3. aucune charge utilisée au-dessus : le **repli du matériel**, lu dans `exercises.equipement` — **barre et Smith : 2,5 kg** (disques de 1,25 kg) ; **haltères**, charge notée pour la paire : **+2 kg sous une paire de 20 kg, +4 kg à partir de 20** (élévations latérales : 18 → 20 → 24 ; curl barre EZ : 30 → 32,5). Décidé le 19/09/2026 : le plus petit saut est le plus prudent ;
4. sinon : « **le cran au-dessus** », sans chiffre.

**Précisé le 19/09/2026 (48b-3) :**

- Le pas se mesure sur **la plus lourde série de chaque séance**, explorations comprises (hors chauffes, dégressives et séries ratées), sur les séances des **24 mois** qui précèdent celle qu'on prescrit (§9.12). Un écart est récurrent s'il revient **au moins 3 fois** ; on retient **le plus petit** écart récurrent, et il n'est exact que s'il est un multiple de 0,5 kg. Sinon, le pas est **approché** : il vaut l'écart médian, et la charge se choisit au rang 2 (la charge déjà utilisée).
- Les « charges déjà utilisées » du rang 2 sont les charges de travail et d'exploration des séances antérieures : **pour chercher plus lourd sur une machine, une poulie ou des haltères, seulement celles des 12 derniers mois** (précisé le 01/10/2026 : un 25 kg du 30/04/2024, sur une autre machine, passait devant le 27 kg de la poulie actuelle — un test à +0,2 kg ; d'une salle à l'autre, les piles et les haltères changent) ; **à la barre, sans limite de date** (les disques sont les mêmes partout) ; **vers le bas, sans limite de date** (le repli a sa propre limite de 10 %). Le rang 1 (pas de salle, 24 mois) et le rang 3 (repli matériel) ne changent pas.
- **Vers le bas, même ordre** (reprise après plus de 12 semaines, §9.9) : le palier moins le pas exact ; sinon la charge déjà utilisée juste en dessous ; sinon le repli du matériel (barre et Smith −2,5 kg ; haltères −2 kg jusqu'à une paire de 20 kg incluse, −4 kg au-delà) ; sinon « un cran en dessous », sans chiffre.

**Précisé le 16/10/2026 (108)** : quand la personne a déclaré sa salle (barres fixes, haltères), la salle décide du cran avant ces quatre rangs — §10 bis.

### 10.3 Le progrès en pourcentage est interdit

Référentiel §1.3 : +5 kg sur un squat à 135 kg fait +3,7 %, sur un squat à 405 kg fait +1,2 %, et c'est la même quantité de tissu contractile nouveau. **Un algorithme qui progresse en pourcentage fixe sous-charge le débutant et sur-charge l'avancé.** L'incrément est toujours absolu, dérivé du pas de la salle.

## 10 bis. Le matériel de la salle — décidé le 15/10/2026 (prompt 108)

Maquette validée par Aurélien le 15/10/2026 : `v2-atelier/maquettes/maquette-salle-objectif-v1.html`, écrans 1 et 2.

**Les décisions, mot pour mot :**

- Seulement pour qui le déclare ; non renseigné, rien ne change (on suppose qu'on peut ajouter des disques).
- Profil → « Ma salle », une fois : barres fixes EZ et droites (poids cochés, ex. 10, 15, 20, 25, 30 kg), haltères (jusqu'à X kg, de Y en Y). Les machines : pas pour l'instant.
- Le coach ne propose jamais une charge que la salle n'a pas, pour les exercices à barre fixe (barre EZ, barre droite légère : utilise la donnée du catalogue qui dit le matériel, et dis laquelle ; une barre olympique chargée de disques n'est pas concernée) et aux haltères : ses propositions sont arrondies aux charges déclarées (même logique que le repli sur les machines du §10.2).
- *Décidé le 16/10/2026 (Claude.ai, délégué par Aurélien ; remplace « Quand le programme demande plus que la salle n'a : le coach fait progresser en reps à la charge maximale, puis en séries ») :* « Quand la charge demandée dépasse la plus lourde de la salle, le coach garde la plus lourde et progresse en reps, jusqu'au haut de la fourchette de la zone ; sur un exercice d'isolation (non polyarticulaire), la fourchette s'étend jusqu'à 15 reps — à cette distance de l'échec, le muscle progresse aussi bien (Schoenfeld et al. 2017, 2021). La zone est gelée au moment où l'exercice atteint la plus lourde de la salle, comme pendant un étirement (§9.7) : les reps prescrites au-delà ne la font pas glisser. Au plafond, le coach maintient : la phrase le dit comme un fait (« 30 kg × 15, la plus lourde de ta salle. »). ~~Tant que l'exercice est à la plus lourde de sa salle, l'escalier ne propose rien sur cet exercice — ni changement de schéma, ni série de plus, ni repli — et ne pose aucun pari ; le compteur continue, sa phrase reste un fait.~~ *(Remplacée le 16/10/2026, 113 : voir la décision suivante.)* Si la personne déclare une barre plus lourde, ou si la charge demandée redescend sous la plus lourde, tout reprend normalement. »
- *Décidé le 16/10/2026 :* « Le gel tombe dès qu'une charge plus lourde est déclarée : la zone suit de nouveau l'habitude, et la charge plus lourde sera testée au haut de la zone en vigueur ; la personne peut corriger la zone si elle veut tester plus tôt. »
- *Décidé par Aurélien le 16/10/2026 (prompt 113 ; « c'est le coach qui décide du programme, donc c'est aussi à lui de suggérer une série de plus ou de moins, toutes les modifs possibles » ; remplace « Tant que l'exercice est à la plus lourde de sa salle, l'escalier ne propose rien sur cet exercice … » et révise I47) :* « Au plafond de la salle (la plus lourde de la salle, au haut de la fourchette), l'escalier propose, une marche par déclenchement, dans cet ordre :
  1. La série de plus (§14.7), dans la limite de la règle de volume du §14.6.
  2. La dégressive (§14.8), aux conditions du §14.8.
  3. Un autre exercice de la même famille, qui permet de charger plus dans la salle déclarée (par exemple « Curl aux haltères : ta salle va jusqu'à 2 × 40 kg. »). Accepté, il remplace l'exercice dans la routine de la personne ; refusé, rien ne change.
  4. Au-delà, le coach maintient, et la phrase reste un fait.

  Le changement de schéma et le repli ne sont jamais proposés au plafond : c'est la salle qui bloque, pas la personne. Une marche sans objet (pas de place de volume, dégressive hors conditions, aucun frère plus chargeable) est sautée. ~~La série de moins garde ses règles, plafond ou non.~~ *(Retiré le 16/10/2026, audit du 16/10, 01 #9 : la phrase renvoyait à une règle qui n'existe ni en spec ni en code — la « série de moins » n'apparaît qu'en mesure, au tableau du §14. « Suggérer une série … de moins » (la décision du 113) reste à écrire : noté pour plus tard.)*
  Le pari, pour la série de plus et la dégressive au plafond : « tu tiens le plafond (la plus lourde × le haut de la fourchette) sur toutes les séries de travail, la nouvelle comprise, avant le prochain déclenchement » (1 ou 0), dans le module escalier, avec `fondement.origine = 'salle_max'`. Pour l'exercice de remplacement : aucun pari d'escalier ; l'exercice nouveau a ses paris ordinaires. Un refus s'écrit comme les autres refus de l'escalier (§14). »

  La carte : la même que la série de plus ou la dégressive, avec cette première phrase au plafond : « 30 kg × 15 depuis 4 séances, et ta salle n'a pas plus lourd. » suivie de la question de la marche (« Une série de plus ? », « Une dégressive après ta dernière série ? », « Passer au curl aux haltères ? »). Boutons du remplacement : « Changer d'exercice » / « Non merci ».
- La dégressive à barre fixe : « Prends la barre de 20 kg. » au lieu de « Enlève … de chaque côté ».
- Cas réel d'Aurélien (Basic-Fit) : curl EZ, barres de 10 à 30 kg de 5 en 5 ; au-dessus de 30 impossible.

**Ce que le code en a fait (108).**

- **La donnée du catalogue** : `exercises.equipement`. `haltere` → les haltères déclarés ; `barre` → une barre fixe, **sauf la barre lourde** (les quatre barres et leurs frères à la barre, `mouvement` au catalogue — la définition du générateur, `estBarreLourde`) : une barre olympique chargée de disques n'est pas concernée. `equipement` ne distingue pas l'EZ de la droite : **le nom au catalogue** le fait (« Curl Biceps (Barre EZ) ») ; sinon, la barre droite. **Garde** : à la barre, un palier au-delà de la plus lourde barre fixe déclarée ne peut venir que d'une barre qu'on charge — la salle n'en dit rien et rien ne change (un rowing à 80 kg ne se plafonne pas à la barre droite de 30).
- **Les haltères se déclarent par haltère** (« jusqu'à 40 kg, de 2 en 2 », comme une salle les range) et les séries les notent **pour la paire** (§10.1) : les charges proposables sont 2 × 2, 2 × 4… 2 × 40 kg.
- **Le cran** (§10.2) : la salle déclarée décide seule — la charge déclarée juste au-dessus (au-dessous pour la reprise longue). Elle passe avant les quatre rangs du §10.2 : une salle déclarée n'a pas de « cran au-dessus » sans chiffre.
- **Les propositions arrondies** : toute charge que le coach pose et que la salle ne fait pas (une charge d'une autre salle, une estimation de nouvelle zone, un report « plus léger ») s'arrondit à la charge déclarée **juste en dessous** (sous la plus légère : la plus légère). Un repli d'escalier (§14.2) à une charge que la salle ne fait pas est **sauté** (se taire, comme un repli sans palier). Une reprise longue sans charge plus légère dans la salle garde la charge de travail.
- **À la charge la plus lourde de la salle**, là où le coach testerait le cran au-dessus (ou monterait la charge, sous 3 reps) : l'état **`salle_max`** — la ligne à cette charge, **une rep de plus que la dernière fois, jusqu'au plafond** (`plafondALaSalle`) : le haut de la zone ; **15 sur une isolation** (moins de 3 muscles au catalogue, la définition `estPolyarticulaire` ; la salle de l'exercice porte alors `isolation: true`) dont la zone s'arrête plus bas ; sans zone (règle de bord), 15 sur une isolation et **pas de plafond** sur un polyarticulaire (une rep de plus, validé le 16/10/2026). Sans ligne haute. Phrase grise : « 30 kg, la plus lourde de ta salle : on monte en reps. » ; feuille « Pourquoi » : « Ta salle n'a pas plus lourd que 30 kg : je ne te propose jamais une charge qu'elle n'a pas. Tu gagnes des reps, une de plus que la dernière fois. » **Au plafond** (le niveau validé de la dernière séance l'atteint ; fondement `salle.plafond`, `salle.maintien`) : la ligne au plafond, « 30 kg × 15, la plus lourde de ta salle. » ; feuille « Pourquoi » : « … Tu es au haut de ta fourchette : on garde la charge. » En séance, **la réaction se tait** (§9.14 : pas de proposition au-delà de la salle, ni « le cran au-dessus » sans chiffre).
- **Le gel de la zone** (`gelALaSalle`) : les dernières séances à la plus lourde de la salle, sans interruption ; la zone est celle de l'habitude lue juste après **la première** d'entre elles (son couple, ses 8 séances d'alors). Le gel le plus ancien l'emporte sur celui d'un étirement ; une zone choisie l'emporte sur les deux. Les rejeux (zone d'une séance passée, compteur, report de §9.10) reçoivent la même salle : la zone d'une séance passée à la plus lourde est la zone gelée, sans quoi le report verrait une « nouvelle zone » que le gel empêche. Sans gel (une barre plus lourde déclarée, une charge demandée plus basse), la zone suit l'habitude.
- ~~**L'escalier se tait** (`aLaPlusLourdeDeLaSalle` : la salle en vigueur, le palier et la charge demandée à la plus lourde) : aucune marche du blocage isolé (ni schéma, ni série de plus, ni repli, ni la phrase de sèche), aucune série de plus active, aucun pari. L'exercice **ne déclenche pas la semaine allégée** (son pari le nommerait), mais **son compteur compte pour les autres** — un fait (validé le 16/10/2026). La phrase du compteur reste dans l'en-tête.~~ *Remplacé le 16/10/2026 (113) : « Ce que le code en a fait (113) », plus bas.*
- **Les chauffes** (§9.15.1, §9.15.5) : la charge déclarée la plus proche de la marche, sous la référence ; la « barre vide » est la barre fixe la plus légère ; aucune charge sous la référence : la ligne reste vide, « Trop léger pour une chauffe de plus. ».
- **La dégressive** (§9.15.3) : la même baisse, −22,5 %, au cran inférieur **que la salle fait** — curl EZ à 30 kg : la barre de 20 kg (25 serait au-dessus des −22,5 %). À la barre fixe : « Prends la barre de 20 kg. Sans repos, jusqu'à l'échec. Vise 5 à 7. » Aux haltères, la phrase hors barre (« Dégressive : 28 kg, sans repos… »). Rien sous la cible : « Trop léger pour une dégressive. » et ses deux gestes.
- **Invariant I46** : pour un exercice dont la salle déclarée est en vigueur, aucune charge que le coach propose n'en sort — la ligne et la ligne haute de la consigne, une proposition de la réaction, le fantôme d'une ligne qu'il couvre, d'une chauffe ou d'une dégressive qu'il remplit ; jamais un test ni une proposition sans chiffre.
- **Invariant I47** (16/10/2026, **révisé le 16/10/2026, 113**) : ~~pour un exercice à la plus lourde de sa salle, aucune marche d'escalier, aucune ligne en plus (série de plus), aucune consigne de repli, et la carte de semaine allégée ne le prend pas pour déclencheur.~~ Pour un exercice **au plafond de sa salle** (la plus lourde, au haut de la fourchette) : seulement les marches 1 à 3 de la décision du 16/10/2026 (série de plus, dégressive, un frère plus chargeable), jamais le changement de schéma ni le repli (ni la phrase de sèche, ni le silence de l'escalier ordinaire) ; aucune consigne de repli ; la carte de semaine allégée ne le prend pas pour déclencheur ; une carte proposée est la première marche, après la dernière proposée, qui a un objet (les marches entre les deux sont sans objet), jamais une marche déjà proposée ; un remplacement va vers un exercice plus chargeable que le plafond. **Exception (D11, décision d'Aurélien du 16/10/2026, audit du 16/10)** : « « Plus léger » (après une douleur) passe avant la règle « pas de repli au plafond de la salle » ; I47 l'exempte. » La consigne de repli que pose « Plus léger, plus de reps » (§9.20 : le repli figé au choix, `seance.reprises[slug]`, à la charge de son repli — I35) est une décision de la personne, pas une marche de l'escalier : I47 ne la juge pas. Le reste d'I47 s'applique (les marches, la semaine allégée).
- **En base** : `profiles.ma_salle` (jsonb, `v2_088`), `NULL` = non renseignée. Tant que la migration n'est pas lancée, la colonne est **facultative** : la base la refuse, elle quitte la lecture et l'écriture pour la session, et le profil se lit et s'écrit normalement.

**« Puis en séries » — retiré le 16/10/2026 (Claude.ai, délégué par Aurélien).** Arrêté et rapporté le 16/10/2026 : la série de plus du §14.7 n'arrive que par l'escalier (compteur, pari « débloqué avant le prochain déclenchement », I23 : jamais en zone force). À la plus lourde de la salle, il n'y a plus de pari tenable, et la routine décide de la structure : la personne peut ajouter une série elle-même. *(Le même jour, la décision de 113 rend la série de plus au coach, au plafond, avec un pari tenable : « tu tiens le plafond ».)*

**Ce que le code en a fait (113).** *Précisions d'implémentation (Claude Code, à relire par Claude.ai).*

- **« Au plafond »** : à la plus lourde de la salle (`aLaPlusLourdeDeLaSalle`) **et** le maintien (`fondement.salle.maintien` : le niveau validé de la dernière séance au plafond des reps) — `auPlafondDeLaSalle`, une définition que le plan, I47 et l'observation lisent. **À la plus lourde sous le plafond** (30 kg × 12, on monte en reps), la décision ne parle pas ; la phrase qui y taisait l'escalier est remplacée, et sa raison (« c'est la salle qui bloque, pas la personne ») ne vaut qu'au plafond : là, la personne peut encore gagner des reps — **l'escalier ordinaire** (§14.5 : série de plus, dégressive, repli à une charge que la salle fait, schéma en zone force) et la semaine allégée comme ailleurs. *Lecture à confirmer.*
- **Une marche par déclenchement, dans l'ordre** (`marcheAuPlafond`) : à un déclenchement (compteur 4, 8, 12…), la première marche **après la dernière proposée** depuis le dernier progrès (acceptée ou refusée, son pari existe) qui a un objet ; une marche sautée ne revient pas (une série de plus sans place au 1er déclenchement n'est plus proposée au 2e, même si la place revient). Déjà proposée au même déclenchement (cette séance, ou une autre au même compteur) : elle reste, avec sa réponse, sans carte. Aucune : le maintien. Entre deux déclenchements : rien.
- **Les objets.** La série de plus : la place du §14.6 sur chaque muscle primaire, hors sèche, hors zone force (§14.7, I23). La dégressive : `degressivePossible` (§14.8 : isolation, sans ligne dégressive dans la routine, hors sèche, zone force, décharge, Entretenir, débutant). Le remplacement : un frère plus chargeable.
- **« La même famille »** se lit comme **les frères** (`Modele.freresDe`, même `mouvement`) : §13.6 bis réserve la famille (`schema_mouvement`) à la feuille « Remplacer » et dit que l'escalier lit les frères, eux seuls. Dans l'ordre de « Remplacer » (`Seance.freresProposes` : le déjà fait d'abord, le plus récent d'abord) ; ni écarté, ni hors du matériel du profil, ni déjà dans la séance ; le premier **plus chargeable** (`remplacantAuPlafond`).
- **« Plus chargeable dans la salle déclarée »** (`plusChargeableALaSalle`) : un frère qui se charge (mesure charge et reps) et dont la salle (`Profil.salleDeLExercice`, la même lecture que pour l'exercice) — déclarée — va au-delà de la plus lourde d'aujourd'hui, dans l'unité des séries (la paire pour des haltères, §10.1 : 2 × 40 = 80 kg contre 30 kg). **Sans salle pour lui** (une machine, une poulie, une barre qu'on charge, un matériel non déclaré) : non plafonné, donc plus chargeable. Au curl EZ d'Aurélien : la barre droite de 30 ne l'est pas, les haltères jusqu'à 2 × 40 le sont.
- **La carte** : « 30 kg × 15 depuis 4 séances, et ta salle n'a pas plus lourd. » puis la question ; le détail de la série de plus et de la dégressive inchangé. Le remplacement : « … Passer à Curl Biceps (Haltère) ? » — **le nom du catalogue, sans article** (le catalogue ne dit pas le genre : « au », « à la », « à l' ») ; détail « Curl Biceps (Haltère) : ta salle va jusqu'à 2 × 40 kg. », ou, sans salle pour lui, « … : aucune limite déclarée dans ta salle. » ; « Changer d'exercice » / « Non merci ».
- **« Changer d'exercice »** : le frère prend la place dans **la routine de la séance**, par le geste de « Remplacer » de l'éditeur (`Routines.exerciceRemplace` : même rang, même superset, mêmes séries et repos, sans charge de départ ; **la note part**, comme dans la séance), écrite par la file (`poserRoutineVoulue`, le chemin de « Le coach relit ta semaine ») ; puis dans la séance ouverte (le geste de « Machine prise »), rattaché à sa nouvelle ligne : la question de fin de séance ne voit pas d'écart. **Une séance libre** (sans routine) : la séance seule. **Aucun pari** à l'acceptation ; **le refus** s'écrit comme les autres (`marche : remplacement`, `reponse : refusee`, `vers`, `origine : salle_max`). *Limite* : une acceptation sans pari n'a pas de mémoire — si l'ancien exercice revient (une autre routine, une séance libre), la marche peut revenir au déclenchement suivant.
- **Le pari** de la série de plus et de la dégressive au plafond : `module = 'escalier'`, la marche, `reponse`, `origine : salle_max`, `plafond : { charge, reps }`, `n_routine` (les séries de la routine). **Son observation** (`observationPlafond`, sur les faits `faits.seancesDeLExercice` et les compteurs figés des paris) : à partir de la séance du pari, dans l'ordre, **0** à la séance dont le compteur à l'ouverture atteint le prochain déclenchement ; **1** à la première séance qui tient le plafond — toutes ses séries de travail à la plus lourde (ou au-delà) et au plafond des reps (ou au-delà), au moins *n* + 1 pour la série de plus (« la nouvelle comprise »), *n* pour la dégressive (une dégressive n'est pas une série de travail ; « la nouvelle comprise » ne peut viser que la série de plus). Refusé, jamais observé.
- **Acceptées, elles durent comme ailleurs** : la série de plus (§14.7) et la dégressive (§14.8) reviennent à chaque séance de l'exercice jusqu'à son prochain progrès.
- **La semaine allégée** : au plafond, l'exercice ne la déclenche pas (son pari « le déclencheur progresse » parierait sur ce que la salle empêche) ; son compteur compte pour les autres.
- **I48** (§14.8) : au plafond, la dégressive suit l'ordre du plafond (dès le 1er déclenchement si la série de plus est sans objet) — « au 2e déclenchement, après une série de plus » ne s'y vérifie pas ; I47 vérifie l'ordre.
- **Démonstration** (prévisualisation, jamais en production) : `?escalier=plafond` — le premier exercice d'isolation chargé de la séance est mis, dans les entrées du plan seulement, au plafond d'une salle inventée (une barre EZ à sa charge de travail, 15 reps), ses muscles avec de la place ; son compteur avance d'un déclenchement à chaque réponse : la série de plus, la dégressive, un frère plus chargeable (« Changer d'exercice » remplace dans la séance seule), puis le maintien. Aucun pari ne s'écrit.

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

L'utilisateur n'attend jamais. Le moteur lui donne une consigne **à chaque séance** : une rep de plus, ou un cran de charge (§9.1). Ce que le compteur signale, c'est que **la double progression ne suffit plus sur cet exercice** — ce qui appelle un deload, un changement de zone ou un changement d'exercice.

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

### 12.2 bis Sous consigne — corrigé le 25/09/2026 (chantier 49)

Le §12.2 a été écrit avant le moteur du chantier 48 : il compte la meilleure série, quand le moteur avance sur le **niveau validé** (§9.2). Deux définitions de « progresser », c'est la duplication que le CADRAGE §2 undecies interdit.

> **Il y a progrès quand le palier monte, ou quand le niveau validé monte au même palier — la même fonction que celle de la consigne. Un test tenu dans la zone (§9.7) compte aussi, s'il fait mieux que le meilleur test précédent. Le tout se juge contre le meilleur (palier, niveau) depuis la dernière remise à zéro, jamais contre les records de toute une vie.**

**Quelles séances comptent.** Seulement celles qui ont reçu une consigne **et** où elle a été suivie : les séries au palier proposé faites à la charge proposée, ou au-dessus. Une séance faite sous la charge proposée n'est **ni un progrès ni une stagnation** : le compteur se tait. Faire plus que demandé sans progresser, c'est avoir essayé ; faire moins, c'est une consigne non tentée, qui ne dit rien de la méthode. Cette frontière n'est pas celle de l'observation (§9.11), qui ne compte les reps qu'à la charge exacte : les deux répondent à deux questions différentes — « le pari du moteur a-t-il été vérifié ? » et « la personne a-t-elle au moins tenté la consigne ? ».

**Par exercice et par zone**, pas par format. Le format n'a que trois cases : des séries de 11 et de 15 tombaient dans la même, et un 66 × 11 bloquait tout ce qui suivait à 15 reps (extension jambes d'Aurélien : 41 séances de stagnation fictive, 13 par zone). Un changement de zone est un bloc (§9.10) et remet le compteur à zéro. **La zone d'une séance se lit à sa fin** — une seule fonction pour le report (§9.10), le compteur et le repli de l'escalier : une zone changée pendant la séance est celle de cette séance (précisé le 06/10/2026, relevé 54-0 : le compteur et le repli la lisaient au début, le report à la fin). La zone **d'aujourd'hui**, pour la séance qui commence, reste la zone en vigueur maintenant. **Une séance sans heure de fin** (6 des 22 séances d'Aurélien en septembre 2026, importées de Hevy) **finit 3 h au plus après son début, et jamais après le début de la suivante** (précisé le 06/10/2026) : sans cette borne, une zone changée entre deux séances comptait pour la précédente.

**Remises à zéro** : une reprise après coupure (§9.9, la même règle que la consigne), un changement de zone.

**Deux pièges trouvés en rejouant.** Compter tout test réussi faisait passer pour un progrès le même test refait à l'identique, séance après séance. Et sans le test, la fausse alarme type revenait : presse d'Aurélien, 275,7 kg avec un test à 295,7 × 12, compteur à 14 parce que 275,7 avait déjà été son palier des mois plus tôt.

**Mesure** (rejeu de la consigne sur les cinq historiques, réglage Normal) — chance qu'un exercice reparte seul dans les deux séances suivantes, selon les séances déjà passées sans progrès :

| Séances bloquées | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Repart seul | 53 % | 45 % | **40 %** | **30 %** | 28 % | 29 % | 25 % | 27 % |

| | 3 blocages sur 4 durent au plus | Exercices à 4 ou plus à l'ouverture |
|---|---|---|
| aurel_br | 3 séances | 7 sur 38 |
| lea | 3 | 2 sur 32 |
| alexis | 2 | 1 sur 38 |
| jordan | 2 | 1 sur 11 |
| melodie | 1 | 0 sur 17 |

Ne compter que les séances suivies retire 28 % des déclenchements (177 → 128). **Réserve** : ces historiques n'ont jamais reçu de consigne. Une séance « suivie » y est une coïncidence de charge, pas une intention : les chiffres bornent ce que le coach aurait pu déclarer, les premières semaines réelles diront ce qu'il déclare.

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

**Confirmé sous consigne le 25/09/2026** (§12.2 bis) : la courbe ne reste plus plate, elle **décroche entre 3 et 4 séances** (40 % puis 30 % de reprises seules). Le seuil de 4 n'est plus seulement un arbitrage, la mesure le soutient. Les programmes pour débutants réagissent plus tôt (GZCLP change de schéma dès la séance qui suit un échec ; le 5×5 baisse la charge après trois échecs) : une borne calée sur des peu entraînés, que le pratiquant assidu n'a pas à reprendre. Ce que la comparaison enseigne vaut pour l'escalier : sa première marche doit être légère.

Le seuil est une constante, pas un percentile personnel. Le 9-sur-10 par utilisateur donnait 23 séances chez le profil assidu, soit près de quatre mois sur un exercice : attendre la certitude quand elle n'apporte rien.

### 12.5 Le compteur est en séances, pas en jours

La corrélation entre l'écart médian entre séances et la durée des épisodes est de **−0,006** sur 50 exercices. Un exercice fait tous les 2 jours et un fait tous les 10 jours ont le même seuil.

> **Ce qui fait progresser, c'est la séance, pas le calendrier.**

### 12.6 Reset après coupure — confirmé par la mesure

> **Le compteur repart à zéro si l'écart depuis la séance précédente dépasse 3× l'écart habituel de cet exercice.**

Écart habituel = médiane des **8 derniers** écarts entre séances sur cet exercice (§9.9, une seule définition). Couché : 7 jours → reset à 21 jours. Sur l'ensemble, écart médian 4 jours, 90ᵉ centile 19 jours ; **14,5 % des séances suivent une coupure ainsi définie**.

Effet mesuré : le reset abaisse le taux de reprise spontanée de 4 à 5 points sur toute la plage utile. Il fait donc bien son travail — mais **pas celui qu'on lui prêtait** : il n'explique pas la bosse observée à 6 séances dans la mesure charge-seule, qui lui survit. Après trois semaines sans toucher un mouvement, ne pas progresser n'est pas un blocage, c'est une reprise.

### 12.7 Point clos le 25/09/2026

La mesure charge seule montrait une remontée de la reprise spontanée autour de 6 séances, qui résistait au reset après coupure. **Elle disparaît avec la définition du §12.2 bis** : c'était un artefact de la mesure charge seule, qui comptait comme progrès les retours d'oscillation. Rien à expliquer de plus.

### 12.8 Sous consigne — décidé le 19/09/2026, détaillé au chantier suivant

- **Le compteur ne compte que les séances qui ont reçu une consigne, et où elle a été suivie** (précisé le 25/09/2026, §12.2 bis). Un historique sans consigne ne dit pas si la personne a essayé ; une consigne non tentée non plus.
- **Le seuil ne s'adapte pas, les mots si** (tranché le 25/09/2026). Le déclencheur reste 4 séances pour tout le monde (§12.4). Ce qui s'adapte, c'est la phrase : « plus long que d'habitude pour toi » ne se dit **que si c'est vrai pour cette personne** — au moins 3 de ses blocages sur 4, terminés sous consigne, ont été plus courts que le seuil. Sans assez de blocages sous consigne (moins de 8, choix produit), la phrase reste neutre : « 122,5 kg × 6 reste ta meilleure charge de travail depuis 4 séances. » (Le mot est précisé le 02/10/2026 : « ton meilleur » prêtait à confusion avec le « Record de charge » de la page d'exercice, qui est la série la plus lourde, essai compris ; le compteur parle de la **charge de travail**, l'expression de la voix du coach.) **Elle cite le meilleur (palier, niveau validé) depuis la dernière remise à zéro, jamais la charge du jour** (corrigé le 30/09/2026) : le compteur mesure le temps écoulé depuis ce meilleur, et la charge du jour peut osciller sous lui (au rejeu : « 88 kg ne bouge plus depuis 5 séances » alors que 88 kg n'avait été fait qu'une fois). Au rejeu, la phrase aurait été vraie chez les cinq profils (§12.2 bis) ; c'est un constat sur eux, pas une garantie.
- **Pourquoi ne pas le calculer sur l'historique** : mesuré (banc M4), 8 exercices d'Aurélien dépasseraient déjà le seuil à l'ouverture (extension jambes 13 séances, presse 10, curls 10, tirage poitrine 7…).

### 12.9 Le compteur dans l'app — câblé le 30/09/2026 (chantier 49)

> **Le compteur est un fait calculé une fois, dans le plan unique, à l'ouverture de chaque exercice ; l'écran le lit.**

- **Quelles séances comptent.** Seulement celles qui **ont reçu une consigne** — dans l'app : une séance qui porte **au moins un pari** sur l'exercice (table `predictions`) — **et** où elle a été **suivie** (séries au palier à la charge proposée ou au-dessus, §12.2 bis). Les séances importées ou d'avant le coach ne comptent pas (§12.8 : pas de calcul sur l'historique).
- **Ce qui se calcule** : par exercice et par zone, le meilleur (palier, niveau validé) depuis la dernière remise à zéro, le nombre de séances suivies sans progrès depuis lui, et les blocages terminés (pour « plus long que d'habitude »). Le niveau est celui du §9.2, chute exclue (§9.2 bis).
- **Ce qui s'affiche** : à **4 séances ou plus**, une phrase grise dans l'en-tête de l'exercice, à l'ouverture, et une ligne dans la feuille « Pourquoi ». Sous 4, rien. La phrase est la même dans toutes les phases : ce que la phase change, c'est la réponse de l'escalier (§9.16, §14), câblé à part.
- **La remise à zéro vaut dès l'ouverture** (précisé le 30/09/2026, #343) : si la séance qui s'ouvre est une **reprise** (§9.9 : la consigne du jour est une reprise) ou **change de zone**, le compteur est à zéro **à l'ouverture** — pas de phrase. Une reprise n'est pas une stagnation, même quand les séances d'avant en étaient une.
- **Le meilleur test se retient à chaque séance où un test est tenu dans la zone** (précisé le 30/09/2026, #343), **même quand le progrès de la séance vient du palier** : sinon, le même test refait à l'identique passe pour un progrès (§12.2 bis).

- **La charge proposée, pour juger qu'une séance est suivie** (précisé le 01/10/2026, #344) : celle de la ligne de la consigne ; **sans ligne basse** (toutes les séries à la charge haute, état « rejoint »), **celle de la ligne haute**. Une séance faite sous la charge proposée n'est pas suivie : ni progrès ni stagnation.
- **La présence, pour la reprise** (rappel de §7.6) : l'écart habituel et la dernière présence comptent **toutes** les séances datées de l'exercice, y compris une séance faite uniquement de chauffes ou de séries ratées.

- **Rien d'autre ne change** : ni la consigne, ni les paris, ni la réaction. Le compteur ne déclenche que des mots, jusqu'à l'escalier.
- **Référence** : `coach49.py` (`deroule_compteur`, `phrase_compteur`) ; cas `cas_compteur49.json`.


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

### 13.6 Les frères dans l'app — câblés le 02/10/2026 (chantier 49)

> **Quand un exercice est bloqué et qu'un frère progresse pendant ce temps, le coach le montre côte à côte, sans conclure ; l'escalier propose sa marche comme d'habitude.**

- **Frères** : les exercices de même `mouvement` au catalogue (`exercises.mouvement`, migration `v2_053`). `NULL` = sans frère. Plus fin que la `famille` (affichage, repli de calcul §13.3).
- **Le blocage** court depuis le dernier progrès de l'exercice bloqué (§12.2 bis). **Un frère progresse pendant le blocage** s'il a un progrès strictement après ce début et avant la séance, **et si son meilleur (palier, niveau validé) a augmenté** — un test tenu qui ne change pas le meilleur n'a rien à montrer. Plusieurs : le progrès le plus récent, puis l'ordre alphabétique. Ses verdicts sont ceux du compteur (§12.9), par la même fonction.
- **La phrase** suit celle du compteur, en gris, chaque fois qu'elle s'affiche (4 séances ou plus) : « Pendant ce temps, Développé couché (haltère) : 40 kg × 10 → 42 kg × 10. » — **sans flèche** si le frère n'a pas de séance avant le blocage, **ou si son « avant » est dans une autre zone** : « Pendant ce temps, Développé couché (haltère) progresse : 42 kg × 10. » Elle passe par le formateur unique (§20 bis) : « avant » et « maintenant » sont des faits passés.
- **La marche de l'escalier reste proposée** (§14) : le transfert d'une variante à l'autre est partiel et asymétrique, et le coach ne conclut pas (§13.1). La personne décide.
- **Pas de cousins** dans les messages : entre mouvements différents, le transfert est plus faible encore (§13.5).

#### 13.6 bis La même famille, dans « Remplacer » — décidé le 11/10/2026 (67A)

> **Les frères d'abord ; puis, au plus 5, les exercices de la même famille.** Les coachs remplacent par schéma de
> mouvement (NSCA ; les mouvements de base de Dan John) ; un frère garde presque le même travail, un exercice de la
> même famille à peu près — d'où l'ordre.

- **Deux niveaux au catalogue.** `mouvement` (les frères, §13.6) : le même mouvement, les mêmes muscles principaux.
  `schema_mouvement` (la famille, `v2_074`) : pousser à l'horizontale, pousser vers le haut, tirer à l'horizontale,
  tirer vers le bas, s'accroupir, se pencher en avant ; les isolations par muscle (mollets, biceps, triceps, épaules
  côté / arrière / avant, pectoraux, quadriceps, ischios, fessiers, adducteurs, abducteurs, abdos, avant-bras,
  trapèzes). Chaque mouvement tient dans une seule famille. `NULL` : jamais proposé par la famille — **une habileté
  (`habilete`), une technique à part (maintien, négative, scapulaire, walkout), un doublon désactivé, ce qui n'est
  pas de la musculation (burpee, épaulé-jeté), la prévention (rotations externes, bird dog, superman)** — C.
- **Où** : seulement la feuille « Machine prise » / « Remplacer » (la séance, l'éditeur de routine, l'aperçu du
  programme). **Jamais** dans un calcul : les variantes à la barre du bilan, la barre lourde du générateur, les
  supersets, le frère qui progresse et l'escalier lisent les frères (`mouvement`), et eux seuls.
- **Lesquels** : `Modele.cousinsDe(index, slug)` (la seule lecture de `schema_mouvement`) — même famille, ni
  l'exercice lui-même ni un de ses frères ; rangés comme les frères (`Seance.freresProposes` : le déjà fait d'abord,
  le plus récent d'abord, le hors matériel après, ceux déjà là à la fin), les écartés à la fin, **puis les 5
  premiers**. Le catalogue garde le reste (« Chercher dans le catalogue »).
- **L'écran** : sous les frères, un intitulé « Même famille », puis chaque exercice avec son nom seul (sans « Un
  frère : ») et la même sous-ligne (« Dernière fois : … » ou « Première fois ici » ; « écarté · » devant). Sans frère,
  la phrase « Pas de frère au catalogue pour cet exercice. » reste, puis la famille. Sans frère ni famille : rien ne
  change.
- **« Je n'en veux pas »** dans l'aperçu du programme et « Plus tard » ne changent pas : ils ne lisent que les frères.

**Référence** : `coach49.py` (`frere_qui_progresse`, `phrase_frere`) ; cas `cas_freres49.json`.


### 13.5 Transfert isolation → polyarticulaire

Aucune source ne valide la démarche. La littérature dit « identifie tes points faibles », jamais comment les détecter à partir de données, et le principe de spécificité limite le transfert. Reste le tableau descriptif, rien de plus.

---

## 14. L'escalier — une marche à la fois

> **Tranché le 25/09/2026 (chantier 49) : l'escalier lit d'abord le contexte, puis propose une marche — une seule, jamais deux.** Un blocage vient rarement d'une seule cause ; la même réponse ne convient pas à tous les blocages.

**Deux contextes, lus sur ce que l'app voit déjà.**
- **Blocage généralisé** : au moins deux **autres** exercices de la personne ont leur compteur à 4 ou plus sur une séance des 7 jours **antérieurs**, le jour même compris — la proposition arrive à l'ouverture de la séance et le moteur ne lit jamais l'avenir (§9.12 ; précisé le 25/09/2026, #319). Signe probable d'une fatigue globale.
- **Blocage isolé** : sinon. Le contrôle des frères (§13) reste fait d'abord : si un exercice du même pattern progresse, le message change de nature (« ta barre tient pendant que tes haltères montent »).

**Blocage généralisé → alléger, une fois pour la séance.** Une seule proposition, à l'ouverture de la séance, pas une par exercice : **une semaine allégée**, pendant 7 jours. Acceptée, c'est **une décharge déclarée** (§9.10) : ni stagnation ni coupure. **Son format, tranché le 25/09/2026 après confrontation à la littérature :**

| | Semaine normale | Semaine allégée |
|---|---|---|
| Exercices, zone, format | ceux de la routine | **les mêmes** |
| Séries de travail | *n* | **60 % arrondi au plus proche**, au moins une : 1 → 1, 2 → 1, 3 → 2, 4 → 2, 5 → 3, 6 → 4 |
| Charge | le palier | **la même** : garder l'intensité est ce qui garde la force |
| Reps | la consigne | **2 de moins que la visée**, jamais moins d'une, loin de l'échec |
| Test, montée en séance (§9.14) | oui | **non** : rien ne monte cette semaine |

Le coach **dit** la consigne allégée (« 125 kg, vise 3 · 2 séries ») : sans elle, chacun baisse la charge à l'instinct — précisément ce qu'il ne faut pas faire. Appui : l'intensité est la variable clé pour garder force et muscle quand le volume baisse fortement (Spiering et al. 2021) ; les coachs réduisent le volume d'une décharge par moins de séries, de reps ou de séances (Bell et al. 2023, consensus Delphi) ; en sport de force, baisse de volume de 30 à 60 %, intensité gardée, ou baisse de charge d'environ 10 % en gardant les reps, ou charge gardée avec plus de reps en réserve (Bell et al. 2025). **Le coach suggère, il ne demande pas pourquoi** (décidé par Aurélien le 25/09) : pas de question sur la semaine, le sommeil ou le stress ; une carte, deux réponses. **Fréquence mesurée** (`mesure_escalier49_generalise.py`, sur les 7 jours antérieurs, une proposition par épisode) : aurel_br 7 fois en 169 semaines (environ 2 par an), lea 3 en 145, alexis 1 en 69, jordan 1 en 50, melodie 0 — un filet rare, pas un rythme ; les décharges planifiées relèvent du chantier programmes.

**Blocage isolé → stimuler cet exercice, selon sa zone.**
1. **Zones muscle** (hypertrophie, volume, séries longues) : **une série de plus** (environ +20 % sur l'exercice), si la règle de volume laisse de la place sur le muscle ; sinon, marche suivante. **« Laisse de la place »** : sur chaque muscle primaire, la moyenne des 3 dernières semaines actives ne dépasse pas les trois quarts de ses moyennes habituelles — symétrique du premier quart de REGLE-VOLUME, qui en sera la source (décidé le 25/09/2026). **La série de plus passe par la consigne** (*n* + 1 séries couvertes), jamais par le bouton « + Série », et **dure jusqu'au prochain progrès de l'exercice** : ensuite, la routine redevient celle de la personne (décidé le 25/09/2026). **Zones force** (lourd, mix) : **changer de schéma de reps** — la seule marche qui pose une question, parce qu'elle change ce que la personne entraîne ; plus de séries aide peu la force.
2. **Redescendre au dernier palier tenu** (§14.2).
3. Au-delà : le coach se tait sur cet exercice et le signale dans le constat de fin de bloc, sans alarme.

**Toujours.** Un levier à la fois ; la marche suivante seulement au déclenchement suivant (4 nouvelles séances suivies sans progrès) ; une marche refusée n'est pas retentée **avant le prochain progrès de l'exercice** (§14.3), le coach passe à la suivante au déclenchement d'après ; **après une semaine allégée refusée ou sans effet, le déclenchement suivant passe à l'escalier isolé, exercice par exercice** (précisé le 25/09/2026, #319). **Chaque proposition est un pari** dans `predictions` : elle affirme **« débloqué avant le prochain déclenchement »** (1 ou 0) ; refusée, elle s'écrit aussi, avec `reponse : refusee` dans son fondement, et **n'est jamais observée** — le refus est enregistré par le pari lui-même (précisé le 01/10/2026 : une observation « autre chose tenté » suppose une série, ce pari n'en a pas). **Identifiant sans rang**, dans un espace de noms à part : le même UUID v5 que les paris de consigne, calculé sur `escalier|séance|exercice|marche` (exercice vide pour la semaine allégée) — il ne peut jamais rencontrer l'identifiant d'un pari de consigne. Son observation ne se rattache à aucune série : la contrainte `predictions_observation_coherente` l'autorise **pour `module = 'escalier'` seulement** (migration `v2_052`, décidée par Aurélien et appliquée le 01/10/2026). La proposition d'une série de plus ou de moins est une **proposition de structure** : la routine reste celle de la personne, qui décide.

**Ce qui n'est pas tranché** : le réglage des marches selon la vitesse de progression de l'exercice (prise vide : les données ne permettent pas de trancher). *La forme de la semaine allégée et de la carte est tranchée le 01/10/2026 (maquette v4, §14.4).*

**Mesure** (cinq historiques, 112 blocages suivis d'au moins 3 séances ; débloqué = le maximum estimé, en coulisse, dépasse de 2 % le meilleur des 8 séances d'avant, dans les 8 séances d'après) :

| Réponse dans les 2 séances suivantes | Blocage isolé | Blocage généralisé |
|---|---|---|
| Rien | 21 sur 100 (14) | 43 sur 100 (21) |
| Une série de plus | **62 sur 100** (8) | 25 sur 100 (8) |
| Une série de moins | 0 sur 100 (4) | **53 sur 100** (17) |
| Charge baissée | 25 sur 100 (8) | 62 sur 100 (8) |
| Pause | 75 sur 100 (8) | 43 sur 100 (7) |

*Rejoué le 25/09/2026 sur les 7 jours antérieurs (#319) ; la première version regardait 7 jours autour — la conclusion ne change pas.* Le blocage généralisé est le plus fréquent (65 sur 112 ; 48 sur 70 chez aurel_br). **Cases de 4 à 26 cas : des tendances, pas des lois** ; le changement de schéma (9 cas, 22 sur 100) n'est pas jugeable, la mesure est biaisée contre lui (le maximum estimé se calcule plus haut sur les séries longues). **Descriptif seulement** : personne ne change de méthode au hasard, et la mesure ne dit jamais « fais X parce que ça a marché ».

**Confrontation.** Coachs : décharger quand plusieurs exercices calent ensemble (échauffements lourds, articulations irritées, motivation en baisse), corriger l'exercice quand il cale seul ; un levier à la fois ; vérifier d'abord technique, sommeil, alimentation, stress ; une décharge réduit le volume de 30 à 50 % une semaine, mêmes exercices. Science : environ +20 % de volume par rapport à l'habitude a mieux fait grossir le muscle de pratiquants entraînés (Scarpelli et al. 2022), sans avantage à une hausse brutale (+120 %, 2026) ; pour la force, un groupe qui gardait son volume a le plus gagné au maximum — d'où « changer de schéma » plutôt que « une série de plus » en zone force. Décharges des pratiquants sérieux : environ 6 jours toutes les 5 à 6 semaines, aussi quand la performance cale (Rogerson et al. 2024).

*L'échelle d'origine, remplacée ci-dessus le 25/09/2026, est conservée pour mémoire.*

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

Le « −10 % » est une convention de coach. Le repli utilise **le dernier palier validé en entier dans l'historique** — pour Aurélien au couché : 120 kg, validé le 28/07 sur `5-5-5-5`.

**Quatre garde-fous, sans lesquels la règle est fausse.** Rien dans sa formulation initiale n'obligeait le repli à descendre : après une blessure ou un long détour sur une autre variante, le dernier palier tenu en entier peut être **au-dessus** du palier où l'utilisateur bloque. Le repli lui proposerait alors de monter, au moment précis où il stagne.

> **Le repli est le dernier palier qui soit à la fois : (1) strictement inférieur au palier actuel, (2) sur le même exercice et la même zone, (3) dans les 3 derniers mois, (4) tenu — son niveau validé (§9.2) a atteint le bas de la zone, (5) à 10 % au plus sous le meilleur — la même limite que le repli de la reprise longue (`PLAFOND_REPLI`, 49-U5 ; ajouté le 01/10/2026 : sans elle, le rejeu proposait 90 kg après un meilleur de 130 kg).** Parmi ceux-là, **le plus récent**. *(Traduit le 25/09/2026 : « validé en entier » et « même format » dataient d'avant les zones du chantier 48 ; l'intention ne change pas — une charge réellement tenue, jamais un pourcentage.)*
>
> **Si aucun palier ne remplit les quatre conditions, le repli est sauté : le coach se tait sur cet exercice** (§14, marche 3 ; précisé le 25/09/2026, #319).

**La condition (1) dans le code — corrigé le 16/10/2026 (audit du 16/10, 01 #5).** Le palier actuel est celui de la consigne (`consigne.palier`). Le code ne bornait le repli que par le meilleur du compteur : or le meilleur peut être au-dessus du palier actuel (des séances suivies à une charge plus basse, après une chute, comptent sans progrès), et un repli entre les deux faisait **monter** la charge. Le repli est désormais strictement sous le plus bas des deux ; la limite de 10 % reste lue sous le meilleur (condition 5). Même borne pour le repli que prend « Plus léger » (§9.20). I22 le vérifie (« un repli ne monte jamais »).

Sauter plutôt que retomber sur un pourcentage : quand l'historique récent ne contient pas de palier plus bas déjà tenu, l'app n'a aucune base pour en inventer un. Se taire est la bonne réponse à une absence de donnée.

La fenêtre de 3 mois est un **choix produit**. Elle vient du même raisonnement que le reset du compteur (§12.4) : au-delà, ce n'est plus le même athlète sur ce mouvement.

Corollaire du référentiel §6.3 : **réduire vaut mieux qu'arrêter** pour un athlète de force (composante d'habileté ; Coleman 2024 — une semaine d'arrêt complet n'améliore rien).

### 14.3 Une correction utilisateur n'est jamais retentée

Si l'utilisateur retire une série, l'app **ne la repropose pas** — ni sur minuteur, ni jamais. Trois raisons, par ordre de solidité :

1. **Il n'y a presque rien à récupérer** (Remmert 2025, Pelland 2025).
2. **Un délai de re-proposition serait un choix produit déguisé en fait scientifique.** La science ne dit rien sur le bon moment pour retester.
3. **C'est le piège du niveau 3 du cadrage.** Une app qui prescrit puis observe les conséquences de ses propres consignes ne s'optimise pas, elle se confirme.

Le filet existe déjà : si le retrait fait descendre le volume sous la fourchette personnelle, la règle de volume le signale, selon ses propres conditions — REGLE-VOLUME fait foi, le nombre de fenêtres ne se recopie pas ici (précisé le 25/09/2026, #319).

### 14.4 La semaine allégée dans l'app — câblée le 01/10/2026 (chantier 49)

> **Une carte, en tête de la séance, quand plusieurs exercices calent ensemble. Acceptée : 7 jours, mêmes exercices, mêmes charges, 60 % des séries, 2 reps de moins, rien ne monte.**

**Le compteur, figé dans chaque pari.** Chaque pari de consigne porte dans son fondement le **compteur de son exercice à l'ouverture** (§12.9). Le blocage généralisé se lit **dans les paris** des 7 jours antérieurs : aucun rejeu, aucune table ; seules comptent les séances sous consigne, comme pour le compteur.

**La détection, à l'ouverture de la séance.** Un exercice de la séance a un **déclenchement** — son compteur à l'ouverture vaut 4, 8, 12… (la marche suivante seulement au déclenchement suivant, §14) — **et au moins deux autres exercices** ont eu un compteur à l'ouverture de 4 ou plus sur une séance de 0 à 7 jours avant, le jour même compris. Plusieurs déclencheurs : le plus grand compteur, puis l'ordre alphabétique. Les exercices **cités** : le déclencheur, puis les autres par compteur décroissant, puis ordre alphabétique.

**La carte** (une seule, en tête de la séance, pas une par exercice) :
- « {les noms} : aucun n'a progressé depuis 4 séances. » — au plus 4 noms ; au-delà, les 3 premiers puis « et N autres exercices » ;
- « Quand tout cale en même temps, c'est souvent de la fatigue. Je te propose une semaine allégée : mêmes exercices, mêmes charges, 60 % des séries, 2 reps de moins, pendant 7 jours. Rien ne monte. »
- deux boutons : **« Alléger 7 jours »** et **« Non merci »**. Pas de question (le coach suggère, il ne demande pas pourquoi).

**Acceptée** — une **décharge déclarée** (§9.10), du jour d'acceptation au 6ᵉ jour suivant compris :
- un bandeau en tête de chaque séance de la période : « Semaine allégée jusqu'au 7 oct. : mêmes charges, moins de séries, loin de l'échec. Rien ne monte. » ;
- **la consigne allégée** de chaque exercice qui a une consigne : la **même charge** que la ligne de la consigne normale ; **reps visées − 2**, au moins 1 ; **séries couvertes = 60 % des séries de travail de la routine, arrondi au plus proche, au moins une** (1 → 1, 2 → 1, 3 → 2, 4 → 2, 5 → 3, 6 → 4) — les premières lignes de la routine, les autres ne sont pas proposées cette semaine ; **aucun test, aucune montée en séance** (§9.14) ; en-tête « 125 kg × 3 » et, en gris, « 2 séries au lieu de 4, cette semaine » ; les chauffes (§9.15) se calent sur cette charge ;
- **les paris de consigne continuent** (ils parient sur la consigne allégée), avec `allegee : true` dans leur fondement ;
- **le compteur ignore les séances de la période** : ni comptées ni jugées (§12.9), comme une séance neutre. Ce sont des présences pour la reprise (§9.9) : elles ne créent aucune coupure.

**Refusée** : séance normale ; un bandeau d'un instant, « Séance normale. Au prochain blocage, je regarderai exercice par exercice. »

**La mémoire.** Une carte, acceptée ou refusée, **ne revient pas tant que son déclencheur n'a pas progressé** (§14.3 : pas retentée avant le prochain progrès) ; aucune carte pendant les 7 jours d'une semaine allégée acceptée. Au déclenchement suivant, faute de carte, l'escalier isolé prend le relais (PR suivantes ; d'ici là, le compteur parle seul).

**Le pari de la semaine allégée** (`module = 'escalier'`), écrit à la réponse : fondement `marche : semaine_allegee`, `reponse : acceptee | refusee`, `declencheur`, `cites`, `debut`, `fin`, `phase`. **Acceptée, il s'observe sans série** : **1** si le déclencheur progresse avant son prochain déclenchement, **0** à son prochain déclenchement (`observee_a` = la séance qui tranche). Refusée, jamais observée (§14).

**Toutes les phases** : un blocage généralisé est d'abord de la fatigue, en sèche comme ailleurs ; la carte et la semaine allégée ne lisent pas la phase.

**Référence** : `coach49.py` (`blocage_generalise`, `phrase_carte`, `consigne_allegee`, `series_allegees`, `fin_allegee`, `deroule_compteur` qui ignore `decharge`) ; cas `cas_allege49.json`.


### 14.5 Le blocage isolé dans l'app — câblé le 01/10/2026 (chantier 49, PR 2a)

> **Un exercice cale seul : une marche à la fois, selon sa zone et la phase. La série de plus (zones muscle) arrive avec la règle de volume (PR 2b, 2c).**

**Quand.** À l'ouverture, un exercice a un **déclenchement** (compteur à 4, 8, 12…) **et** aucune carte de semaine allégée ne s'ouvre pour lui (pas de blocage généralisé, ou carte retenue par la mémoire de §14.4). **Un exercice cité par une carte de semaine allégée de la même séance, acceptée ou refusée, n'a pas de marche isolée dans cette séance** (tranché le 01/10/2026, #346 : sinon une carte surgirait juste après « au prochain blocage »).

**Quelle marche.** Le **n-ième déclenchement isolé** depuis le dernier progrès de l'exercice — n = (compteur − 4) / 4 + 1, moins les déclenchements répondus par une carte de semaine allégée dont il était le déclencheur :

| n | Zones force (Lourd, Mix) | Zones muscle, en sèche | Zones muscle, hors sèche |
|---|---|---|---|
| 1 | **changer de schéma** (la seule question) | **le coach le dit**, sans rien proposer | **la série de plus** si la règle de volume laisse de la place sur chaque muscle primaire (§14.6) ; **sinon le repli tout de suite** (§14.7) |
| 2 | **le repli** (§14.2) | le repli | **le repli** si une série de plus a été proposée depuis le dernier progrès (acceptée ou refusée) ; **sinon le silence** (le repli a déjà eu son tour) |
| 3 et plus | **le silence** | le silence | le silence |

Exception : ~~un exercice à la plus lourde de sa salle n'a pas de marche (§10 bis).~~ *(Révisé le 16/10/2026, 113)* au plafond de sa salle (la plus lourde, au haut de la fourchette), l'escalier du §10 bis : la série de plus, la dégressive, un frère plus chargeable, une marche par déclenchement — jamais le changement de schéma ni le repli.

*Depuis le 16/10/2026 (§14.8)* : en zones muscle hors sèche, quand les conditions de la dégressive proposée sont réunies, n = 2 est la dégressive et le repli recule à n = 3.

**Changer de schéma** — une carte **sous l'exercice** (le composant des propositions d'exercice) : « 125 kg × 5 reste ta meilleure charge de travail depuis 4 séances, et tes autres exercices avancent. » (la fin seulement si aucun autre exercice n'a eu un compteur à 4 ou plus sur 0 à 7 jours ; sinon un point) ; « En force, une série de plus aide peu. Changer de schéma quelques semaines relance souvent la barre, avant d'y revenir. » ; boutons « **Passer à 6-8 reps** » / « **Garder 3-5** » (Lourd → Mix ; Mix → Lourd : « Passer à 3-5 reps » / « Garder 6-8 »). **Oui** = le geste de la correction de zone (48b-7), comme si la personne l'avait choisie ; elle revient depuis l'étiquette ; le compteur repart de zéro (changement de zone). **Non** = rien ne change.

**En sèche, zone muscle** — la phrase grise de l'en-tête devient « 27 kg × 12 reste ta meilleure charge de travail depuis 4 séances. En sèche, je ne te propose rien de plus. » ; pas de carte, pas de pari.

**Le repli** — pas de question : **la consigne de la séance devient celle du repli** (la charge du palier de repli, visée = son niveau validé borné à la zone, **sans ligne haute**), avec en gris « On repart de 120 kg, ta dernière charge tenue : 120 kg × 4, 4, 4, 4 le 3 févr. » (la date par le formateur `quand`). Repli sauté (aucun palier ne remplit les cinq conditions) → silence. Ensuite, la consigne repart normalement de ce qui est fait.

**Le silence** — aucune proposition ; la phrase du compteur quitte l'en-tête et passe une fois dans le constat de fin de bloc (« 80 kg × 10 reste ta meilleure charge de travail depuis 12 séances. »), sans alarme.

**Les paris** (`module = 'escalier'`, identifiant `escalier|séance|exercice|marche` ; **colonne `exercise_slug` vide, l'exercice dans `fondement.exercice`** — tranché le 01/10/2026, #346 : remplie, cinq lecteurs de paris les prendraient pour des paris de consigne) : **schéma**, écrit à la réponse (`reponse : acceptee | refusee`), accepté observé sans série (1 si l'exercice progresse avant son prochain déclenchement, 0 à son prochain déclenchement), refusé jamais observé ; **repli**, écrit à l'ouverture (`reponse : appliquee`), observé de même. La sèche (« le coach le dit ») et le silence ne sont pas des propositions : pas de pari.

**Référence** : `coach49.py` ; cas `cas_isole49.json`.


### 14.6 La place pour une série de plus — la règle de volume, câblée le 01/10/2026 (chantier 49, PR 2b)

> **Un fait par muscle, calculé une fois sur tout l'historique : la moyenne des 3 dernières semaines actives dépasse-t-elle le troisième quart de ses moyennes habituelles ?**

- **Volume d'une semaine, pour un muscle** : les séries de travail de la semaine (lundi à dimanche), **1** si le muscle est primaire de l'exercice, **0,5** s'il est secondaire, **0,25** s'il est stabilisateur (REGLE-VOLUME §1 bis, v2_069) (`THSemaine.volumeParMuscle`). **Toutes les séances comptent**, importées comprises : c'est un fait descriptif de l'historique, pas un jugement sous consigne.
- **Semaine active** : au moins une séance, quel que soit l'exercice. **Fenêtre** : la moyenne des 3 dernières semaines actives, calculée à chaque semaine active ; une semaine vide ne compte pas et ne casse pas la fenêtre (REGLE-VOLUME §11.3).
- **Époque** : 4 semaines vides consécutives ouvrent une nouvelle époque — la référence repart de zéro, le suivi continue (REGLE-VOLUME §11.4).
- **Seuil** : le **troisième quartile** des fenêtres d'avant de la même époque, au **rang le plus proche** (rang ⌈0,75 n⌉ dans les fenêtres triées). **Au moins 6 fenêtres de référence**, sinon **pas de base**.
- **Place** : la dernière fenêtre (les 3 dernières semaines actives **avant** la semaine de la séance) est **inférieure ou égale** au seuil. **Pour un exercice** : il faut de la place sur **chacun de ses muscles primaires** ; un seul muscle sans base ou sans place, et la série de plus n'est pas proposée. **Un muscle prioritaire** (sa zone de `ZONES` est dans `profiles.priorites`, précisé le 08/10/2026, 60-2b) a de la place jusqu'à **son plus haut volume** : la dernière fenêtre est inférieure ou égale au **maximum** des fenêtres de référence de la même époque, au lieu du troisième quartile — jamais au-delà de ce que la personne a déjà fait (la fourchette personnelle), et toujours avec la même base (6 fenêtres au moins). C'est la spécialisation des coachs (plus de volume sur le muscle prioritaire), bornée par l'historique. **En sèche, rien ne change** : la série de plus n'y est jamais proposée (§9.16) (se taire faute de donnée, comme le repli, §14.2).
- **Quatre semaines vides ou plus juste avant la séance** : la séance ouvre une époque qui n'a encore aucune fenêtre — **pas de base** (précisé le 01/10/2026, #347 : on ne compare pas à un état perdu, REGLE-VOLUME §11.4).
- **Rien ne s'affiche** : le fait est une entrée du plan, que lit la série de plus (§14.7).

**Référence** : `coach49.py` ; cas `cas_volume49.json`.


### 14.7 La série de plus dans l'app — câblée le 01/10/2026 (chantier 49, PR 2c)

> **Un exercice de zone muscle cale seul, hors sèche, et son muscle a de la place : le coach propose une série de plus, jusqu'au prochain progrès.**

**La carte**, sous l'exercice (le composant des propositions d'exercice) : « 27 kg × 12 reste ta meilleure charge de travail depuis 4 séances, et tes autres exercices avancent. » (la fin seulement si aucun autre exercice n'a eu un compteur à 4 ou plus sur 0 à 7 jours ; sinon un point) ; « Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. Tes pectoraux restent sous leur volume habituel. » — **ou, quand un muscle n'a de place que parce qu'il est prioritaire** (au-dessus de son troisième quartile, sous son maximum ; précisé le 08/10/2026) : « Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. Tes pectoraux sont ta priorité : je te laisse aller jusqu'à ton plus haut volume. » (les muscles primaires de l'exercice, leurs noms au catalogue ; accord au singulier pour un seul muscle au singulier) ; boutons « **Ajouter une série** » / « **Non merci** ».

**Acceptée** : **une ligne de plus**, après les lignes de la routine, **à la charge et à la visée de la ligne** (jamais un test), entourée de la couleur du coach, avec en gris sous l'en-tête « une série de plus, jusqu'à ton prochain progrès » ; **elle revient à chaque séance de l'exercice jusqu'à son prochain progrès** (§12.2 bis), puis disparaît. La routine ne change pas. Son rang est le rang suivant, jamais un rang déjà pris (I8 ; depuis 49-C, un rang validé est figé). **Refusée** : rien ne change.

**Une marche proposée ne revient pas** (précisé le 01/10/2026, #348) : une marche de l'escalier isolé — **changement de schéma ou série de plus** — proposée depuis le dernier progrès de l'exercice, acceptée ou refusée (son pari existe), **n'est plus proposée** : rouvrir une séance au même déclenchement, ou en ouvrir une autre avant le suivant, ne fait pas revenir la carte. Le déclenchement suivant passe à la marche d'après (§14.5). **Un exercice ajouté en cours de séance** dont la série de plus est active reçoit sa ligne de plus, comme à l'ouverture.

**Le niveau validé** (§9.2), tant que la série de plus est active, **se lit sur les N séries de la routine** : la série ajoutée, faite en fatigue, ne le tire pas vers le bas (12, 12, 12 puis 9 → niveau 12, et non 10). Elle compte pour le volume (§14.6), comme toute série de travail.

**Le pari** (`module = 'escalier'`, `marche : serie_de_plus`, colonne `exercise_slug` vide, l'exercice dans le fondement) : écrit à la réponse (`acceptee` / `refusee`) ; accepté, observé sans série : 1 si l'exercice progresse avant son prochain déclenchement, 0 à ce déclenchement ; refusé, jamais observé. **C'est ce pari qui dit, au déclenchement suivant, qu'une série de plus a été proposée** (deuxième marche : le repli).

**Jamais en sèche** (§9.16) ; **jamais en zone force** (§14.5 : le schéma) ; **jamais sans zone** (précisé le 16/10/2026, audit du 16/10, 01 #6 : une consigne de règle de bord, sans zone, recevait la carte, et son acceptation n'ajoutait aucune ligne ; sans zone, la marche est celle d'un exercice sans place — le repli, s'il y en a un, sinon le silence ; I23 le vérifie).

**Référence** : `coach49.py` ; cas `cas_plus49.json`.


### 14.8 La dégressive proposée — décidé le 16/10/2026 (prompt 111)

> **Décision de Claude.ai, 16/10/2026 (Aurélien a délégué : « pas besoin de maquette, sors tes casquettes »), mot pour mot :**

« Le coach peut proposer une dégressive comme une marche de l'escalier, après la série de plus. Conditions, toutes requises : exercice d'isolation (non polyarticulaire, `estPolyarticulaire` faux — la même définition que la salle) ; la routine (ou la saisie) n'a pas déjà de ligne dégressive sur l'exercice ; ni en sèche (phase), ni en zone force (Lourd, Mix), ni en décharge, ni en Entretenir (I13), ni pour un débutant.
Place dans l'escalier : quand ces conditions sont réunies, la marche qui suit la série de plus (qu'elle ait été acceptée ou refusée) est la dégressive ; le repli recule d'une marche. Sans ces conditions, l'escalier est inchangé.
Forme : une seule baisse, sur la dernière série de travail, remplie par la règle du §9.15.3 (−20 à 25 %, sans repos, jusqu'à l'échec, arrondie aux charges réelles). Les « plusieurs baisses (2 à 3) » évoquées le 29/09 sont écartées.
À l'écran : la même carte et le même geste que la série de plus (§14.7). Première phrase : « 27 kg × 12 reste ta meilleure charge de travail depuis 8 séances. Une dégressive après ta dernière série ? » ; détail : « −20 à 25 %, sans repos, jusqu'à l'échec. La même croissance en moins de temps (Sødal et al. 2023). » Le coach la propose ; acceptée, elle ajoute une ligne dégressive que le §9.15.3 remplit ; elle n'est jamais écrite dans une série. Refusée, l'escalier continue.
Pari : celui de l'escalier, comme la série de plus — module escalier, marche « degressive », affirmation « débloqué avant le prochain déclenchement ». La ligne dégressive elle-même ne porte toujours aucun pari (§9.15.4).
Pourquoi : les méta-analyses ne montrent pas plus de croissance qu'en séries classiques, mais la même en deux à trois fois moins de temps ; c'est une façon de débloquer une charge sans rallonger la séance. »

**La table du §14.5, zones muscle hors sèche, devient** (quand les conditions sont réunies) :

| n | Zones muscle, hors sèche, conditions de la dégressive réunies |
|---|---|
| 1 | la série de plus si la règle de volume laisse de la place (§14.6) ; sinon le repli tout de suite — inchangé |
| 2 | **la dégressive** si une série de plus a été proposée depuis le dernier progrès (acceptée ou refusée) ; sinon le silence (le repli a déjà eu son tour) — inchangé |
| 3 | **le repli** si une dégressive a été proposée depuis le dernier progrès (acceptée ou refusée) ; sinon le silence |
| 4 et plus | le silence |

**Le chiffre de la phrase** est le compteur du déclenchement où tombe la marche : le deuxième déclenchement isolé, donc **8** séances dans le cas courant — plus quand un déclenchement a été répondu par une carte de semaine allégée (n se décale, §14.5) ; la phrase dit toujours le compteur réel.

*Précisions d'implémentation (111, Claude Code — à relire par Claude.ai)* :
- **Le débutant** : « Moins d'un an » d'ancienneté (`profiles.anciennete = 'moins_1_an'`, la règle du générateur, 60-6 ; `Profil.estDebutant`), gelé pour la séance avec la phase (§9.16).
- **La décharge** : la semaine allégée acceptée et la décharge planifiée (§9.22) ; l'escalier isolé y est déjà muet (§14.5).
- **« La routine n'a pas déjà de ligne dégressive »** se lit à l'ouverture et se fige avec la consigne : la ligne qu'ajoute « Ajouter une dégressive » ne fait pas reculer la marche en pleine séance.
- **Comme la série de plus, acceptée, elle dure jusqu'au prochain progrès** : la ligne dégressive revient à chaque séance de l'exercice (et sur l'exercice ajouté en cours de séance) tant que l'exercice n'a pas progressé et que les conditions tiennent (sèche, zone force, décharge, Entretenir ou débutant l'arrêtent) ; elle s'ajoute à l'acceptation et à la création de la séance, jamais au rendu — retirée par la personne, elle ne revient pas dans la séance (§14.3). Lu dans « la même carte et le même geste que la série de plus (§14.7) » et dans le pari « débloqué avant le prochain déclenchement ».
- **Les boutons** : « Ajouter une dégressive » / « Non merci » (le libellé de la série de plus, « Ajouter une série », décrirait mal la ligne).
- **Au poids du corps ou sur une aide** (charge de travail nulle ou négative) : pas de dégressive (§9.17, I30) — le silence, comme le repli.
- **Pari** : `module = 'escalier'`, `fondement.marche = 'degressive'`, `reponse : acceptee | refusee`, `debut` (le début de la séance), `exercise_slug` vide ; observé comme la série de plus (1 au progrès avant le prochain déclenchement, 0 à ce déclenchement ; refusé, jamais observé).

**Invariant I48** : une dégressive proposée (sa carte) ou en cours ne l'est que sur une isolation (`estPolyarticulaire` faux), hors sèche, hors zone force, hors semaine allégée ou décharge, hors Entretenir, jamais pour un débutant ; la carte n'apparaît qu'au deuxième déclenchement isolé, après une série de plus proposée, sur un exercice dont la routine n'a pas de ligne dégressive *(au plafond de la salle, l'ordre est celui du §10 bis, que vérifie I47 — 113)*. *(I47 est pris par « Ma salle », #439.)* **I17** reste vrai : la ligne dégressive est posée par le geste de l'utilisateur, jamais par le coach seul.

**Démonstration** (prévisualisation, jamais en production) : `?escalier=degressive` — le premier exercice d'isolation de la séance qui a une consigne chargée cale depuis 8 séances, avec une série de plus « refusée » inventée : la carte de la dégressive ; les réponses restent en mémoire, aucun pari ne s'écrit.


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

> **Les mouvements au poids de corps non lesté sont exclus du modèle.** Ils restent dans le volume, et progressent par la double progression (§9.17 : la consigne des charges, la charge valant le poids du corps).

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

> **Révisé le 16/10/2026 (décision d'Aurélien D1, audit du 16/10)** : « La force estimée reste, comme progression (page de l'exercice : « Force estimée ≈ 157 kg, d'après 140 × 5 », sa courbe) ; elle sort des records, des médailles, du fil et de l'XP ; les records sont les vraies barres. »
> Ce qui en suit pour les trois règles :
> - **la règle 3 est tenue** : la force estimée n'est ni un record, ni une médaille, ni une ligne du journal `records`
>   (§9.23), ni un record du fil, du récap de groupe ou du jeu (XP, succès) ;
> - **la règle 2 cède à la forme décidée** : « Force estimée ≈ 157 kg, d'après 140 kg × 5 » — un nombre avec « ≈ », et
>   **la série qui le donne** (la fourchette disait l'incertitude ; la série dit d'où vient le chiffre, et l'utilisateur
>   voit qu'il vient de 5 reps ou de 10). Sur la page de l'exercice seulement, hors de « TES RECORDS » ;
> - **la règle 1 cède à la plage de ECRAN-SAISIE §7 bis.15** (3 à 10 reps, une charge soulevée, jamais au poids du
>   corps), plus récente (06/10/2026) et la seule câblée (`Modele.estimable1RM`) : la page dit la meilleure estimation
>   des séries de travail de 3 à 10 reps, sur le périmètre des records (§9.23 : 12 mois pour un matériel de salle). À
>   10 reps, l'erreur mesurée (§16.1 : 2 reps) reste lisible puisque la série est dite. *Si Aurélien veut revenir à
>   8 reps, c'est `UN_RM_REPS_MAX` (`modele.js`), une constante.*
> Pas de courbe sur la page aujourd'hui (aucune vue de courbe n'y est construite) : une courbe demanderait une maquette.

### 16.3 Le défaut de Hevy, à ne pas reproduire

Hevy affiche « Meilleur 1RM : 186,67 kg » au soulevé hex. Ce nombre est calculé par Epley sur une série de **10 reps**, hors du domaine où la formule tient, sur le mouvement où toutes les équations se plantent le plus (LeSuer 1997).

Formulation retenue à la place : *« Ton maximum estimé : 170 à 190 kg. Tu n'as jamais soulevé ça — ta barre la plus lourde reste 150 kg. »*
*(Remplacée le 16/10/2026, D1 : « Force estimée ≈ 157 kg, d'après 140 kg × 5 », sur la page de l'exercice, à côté de ses records en vraies barres.)*

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

### 17.2 bis La question de réserve — décidée le 12/10/2026 (chantier 78)

> **Le coach demande, une fois par exercice, ce qu'il restait sur la dernière série.** Sans la réserve, un pari tenu
> pile ne dit rien : on s'arrête à la cible. Avec elle, le coach voit ce qu'il y avait au-delà.

**Où** : dans la carte de repos qui suit la **dernière série de travail** d'un exercice qui a un pari ce jour-là :
« Dernière série : 130 kg × 5. Il t'en restait combien ? » et quatre boutons **0 · 1 · 2 · 3 ou +** (les valeurs de
`sets.ressenti` : `reste_0` … `reste_3_plus`). Un tap écrit le ressenti de cette série, par le même chemin que la
feuille d'effort (§17.4) ; rien ne bloque, rien ne s'ouvre ; la question part avec la fin du repos ou la série
suivante. Jamais sur une chauffe, une dégressive, un exercice sans pari, ni quand l'effort est déjà noté.

**Quand** — la décision est celle du plan (`planDeSeance`), figée pour la séance comme la consigne. Pour chaque
exercice qui a un pari, sur ses séances depuis le **lancement** (`LANCEMENT_RESERVE`, une date fixe) :
1. **Silence** : si ses 5 dernières séances depuis le lancement n'ont aucune réserve notée sur leur dernière série de
   travail, la question ne vient que les jours de rappel (4).
2. **Écart** : si ses 6 dernières réponses (de tout temps) donnent une réserve moyenne ≥ 2,5 (le coach est trop
   prudent) ou au moins 3 « 0 » (trop optimiste), la question vient à chaque séance.
3. **Calage** : dans les 42 jours qui suivent sa première séance depuis le lancement, la question vient à chaque
   séance.
4. **Rappel** : sinon, une séance sur trois — quand le rang de la séance du jour parmi ses séances depuis le lancement
   (0 pour la première) est un multiple de 3.

Réserve d'une réponse : `reste_N` → N (`reste_3_plus` → 3) ; un RPE → 10 − RPE, borné de 0 à 3.
**Au plus 4 questions par séance** : parmi les exercices retenus, ceux qui ont le moins de réponses dans les 42
derniers jours, puis dans l'ordre du plan ; la liste garde l'ordre du plan.

**Invariant I45** : une question n'est posée que sur la dernière série de travail d'un exercice qui a un pari ; au
plus quatre par plan ; même entrée, mêmes questions (I12).

**Ce qu'on n'en fait pas encore** : rien ne change dans les consignes ni dans les paris (`predictions` reste immuable).
Les réponses servent d'abord à mesurer (« tes séries visées à 5 en contenaient 6,2 ») ; le rythme de progression
personnel (feuille de route n° 9) les lira quand elles seront assez nombreuses.

**Pourquoi ainsi** : l'estimation de la réserve est fiable de 0 à 2-3 reps, floue au-delà (d'où « 3 ou + ») et
s'affine avec l'habitude ; à chaud, au repos, elle est plus juste qu'après coup. Un calage puis un rappel garde les
réponses sincères (une question à chaque séance, toute l'année, finit ignorée) ; c'est la règle du §17.5 : « l'incitation
existe pendant le calage, jamais en permanence ».

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

#### Le ressenti, lu en crans — 19/09/2026

L'écran de saisie propose aussi un **ressenti** en reps restantes, exclusif du RPE : une série porte l'un ou l'autre, jamais les deux. C'est la voie normale de la saisie v2 — sur 28 768 séries, 288 seulement portent un RPE. Il se lit sur les mêmes trois crans :

| Ressenti | Cran |
|---|---|
| reste 3 ou plus (`reste_3_plus`) | `facile` |
| reste 2 (`reste_2`), reste 1 (`reste_1`) | `dur` |
| reste 0 (`reste_0`) | `max` — une rep de moins pour le niveau validé (§9.2, §17.4) |

Même frontière que les bandes du RPE : trois reps en réserve ou plus, c'est un RPE de 7 ou moins ; « reste 0 » ne laisse plus rien, comme un RPE de 10. **Un seul endroit du code traduit une série en cran**, qu'elle porte un RPE ou un ressenti ; tout ce qui a besoin du cran (le niveau validé, la preuve « effort facile » du réglage Franc, §9.8) passe par lui.

### 17.4 Mécanique

Le champ se met en surbrillance **30 secondes après la validation de la série**, pendant le repos — l'utilisateur est lucide et n'est plus sous la barre. Tapable avant s'il veut. Un tap. Aucun blocage si ignoré : l'app **ne suppose rien** et applique la validation normale sur les reps brutes.

~~Une série marquée « max » compte **−1 rep** pour la validation du palier uniquement.~~ **Révisé le 11/10/2026 (68B) : une série « à fond » (RPE 10 ou « reste 0 ») est tenue, mais on ne monte pas sur sa foi.**

- ~~**Ce qui se décide** compte toujours une rep de moins, comme avant~~ — **révisé le 11/10/2026 (74) : une série à
  fond compte ses reps, partout** : le niveau validé, le test, l'échelle, l'observation d'un pari, le bilan. On
  n'enlève pas une rep réellement faite (« un record, c'est une rep à RPE 10 : elle compte »).
- **Après elle, le coach ne monte pas, et ne recule pas à cause d'elle.** Quand la dernière séance d'un exercice a au
  moins une série de travail à fond, sa consigne suivante part du calcul **sur les reps faites**, puis, dans cet ordre :
  1. **Pas de « tout passe »** : si le calcul sur les reps faites donne « tout passe » alors que le **calcul prudent**
     (chaque série à fond compte une rep de moins, la règle de 68B) ne le donne pas, l'état, la ligne et le test sont
     ceux du calcul prudent.
  2. **Pas de test plus lourd** que la charge la plus lourde de cette séance (un test sans charge chiffrée est un cran au-dessus : il compte comme plus lourd) : sinon, l'état et le test sont ceux du
     calcul prudent.
  3. **Pas de rep de plus** : à une charge où une série de cette séance a été faite à fond, la visée (de la ligne
     comme du test) ne dépasse pas le plus grand nombre de reps fait à cette charge dans cette séance.
  4. **Pas de série de test en plus** : si le test est à une charge faite à fond dans cette séance, ses séries ne
     dépassent pas le plus grand de deux nombres — les séries faites à cette charge dans la séance, et celles du
     calcul prudent ; si on le ramène, l'état est celui du calcul prudent.
  Le **niveau** et le **palier** restent ceux des reps faites. Une charge plus légère que celles faites à fond n'est
  pas plafonnée par elles (une série à fond à 100 kg × 3 ne ramène pas la visée de 80 kg × 10).
- *Simulation du 11/10 (v2), sur les 79 séance-exercices notées à fond :* 26 consignes inchangées ; 19 où les reps
  faites changent le niveau ou corrigent un recul sans rien à bloquer ; 34 où une montée est bloquée (rep de plus
  31 fois, test plus lourd 6, « tout passe » 4, série de test en plus 2). **Les reculs injustes de 68B sont
  corrigés** : couché 01/09/2026, test 125 × 3 à RPE 10 → test gardé à 125 × 3 (au lieu de l'étirement à 122,5) ;
  soulevé 10/01/2026, 160 × 3 → test gardé à 160 × 3 (au lieu d'un retest à 145) ; couché 08/09/2026, 122,5 × 6, 5,
  5 à RPE 10 → niveau 5 (au lieu de 4), sans test proposé.
- **Ce qui se dit** ne change pas (68B) : « sans marge », jamais « pas encore » pour des reps faites ; en séance,
  après une série à fond, ni élan ni proposition.

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
>
> *Amendé le 05/10/2026 (chantier 53, §9.22)* : **des blocs, dans la force seulement** — un programme peut faire alterner les barres entre **Lourd (3-5) et Mix (6-8)**, jamais au-delà : l'ancre lourde n'est jamais quittée des semaines entières (la raison 2 ci-dessous tient), et la variation de volume et d'intensité qui aide la force des pratiquants entraînés (§9.10, Moesgaard) est là. Les accessoires ne sont pas périodisés (la périodisation n'aide pas le muscle). Sans programme, rien ne change.

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
| Progrès en reps | « 122,5 kg, ta meilleure séance à cette charge de travail. » |
| Consigne | « 125 kg × 5 » — en jaune, sous le nom (ECRAN-SAISIE §3.1) |
| Consigne à deux charges | « 125 kg × 5 » puis « 130 kg × 4 sur la dernière série » |
| Test gardé | « Ton test à 130 kg, mardi, est au bas de ta zone : on le garde sur la dernière série. » |
| Test réussi dedans | « 130 kg : 3 reps mardi, 4 aujourd'hui, dans ta zone. » + « Prochaine séance : … » |
| Test raté | « 130 kg × 2 : pas encore dans ta zone. » + « Prochaine séance : 125 kg × 5, puis 127,5 kg × 3 sur la dernière série. » |
| Zone étirée | « Ta machine ne permet pas un plus petit cran : ta zone s'étire. On retestera 32 kg quand tu feras 16 reps à 28 kg. » |
| Reprise | « Reprise après une pause : ta charge de travail, sans rep de plus. » — longue : « Longue pause : … » — jamais la durée de l'absence |
| Proposition en séance (§9.14) | « 125 kg × 8, 3 de plus que visé : je passe ta série 2 à 130 kg, vise 3 à 5. » — appliquée d'office, **sans question** ; à 5 reps de marge : « … ta série 2 passe à 125 kg, vise 3 à 5. Ou 130 kg, si tu te sens bien ? » (**la seule question du coach**) — en jaune, dans la grille |
| Montée tenue | « 130 kg × 5, dans ta zone : ton test a avancé d'une série. » — sans test prévu : « 125 kg × 9, dans ta zone : tu montes dès aujourd'hui. » — au haut de la zone : « 130 kg × 5 : le haut de ta zone. » **Un fait, jamais un « bravo »** |
| Montée pas encore tenue | « 130 kg × 2 : pas encore. On revient à 125 kg. » — en gris |
| Proposition refusée, Entretenir | rien |
| Seuil dépassé | « 122,5 kg × 6 reste ta meilleure charge de travail depuis 4 séances : c'est plus long que d'habitude pour toi. » + la marche suivante — « plus long que d'habitude » seulement si c'est vrai pour la personne, sinon « 122,5 kg × 6 reste ta meilleure charge de travail depuis 4 séances. » (§12.8, 25/09/2026 ; formulée le 30/09/2026) |
| Frère qui progresse | « Ta barre tient, mais tes haltères sont montés à 92 kg. » |
| Muscle limitant | « Tes triceps et tes épaules montent, tes pecs seuls stagnent. Piste à vérifier, pas un diagnostic. » |
| Ratio extrême | « Ton squat vaut 1,04 fois ton couché. Chez les pratiquants, le squat vaut environ 1,21 fois le couché. » — un rapport et un repère de pratiquants (ECRAN-SAISIE §7 bis.14 ter), jamais un rang parmi d'autres personnes (corrigé le 12/10/2026 : l'ancienne phrase « dans les 2 % de lifters » comparait à des compétiteurs) |
| Marche 5 atteinte | Une question posée à l'utilisateur (avec le choix entre deux charges, les seules du coach) |

**Aucun rouge. Aucun vocabulaire de risque.** Le seuil est présenté comme une comparaison à ses propres habitudes, jamais à une norme extérieure.

Vocabulaire : l'app ne range jamais une personne parmi d'autres (ni rang, ni percentile, ni « sur 100 pratiquants ») ;
une force se compare à soi-même, un équilibre à un rapport de pratiquants (précisé le 12/10/2026).

### 20.1 Hors périmètre de ce document

La **fabrication de programmes** — variantes lourdes à pause ou à arrêt, rattrapage de points faibles, rotation planifiée — est un chantier distinct. Deux contraintes déjà fixées pour lui :

1. Un programme fabriqué par l'app sort de la **littérature**, jamais de l'historique de l'utilisateur (cadrage §3.1).
2. Chaque programme proposé s'écrit dans `predictions`.

### 20.2 La voix du coach — réécriture du chantier 49 (29/09/2026)

Validée par Aurélien le 29/09/2026 sur le relevé des 82 gabarits (`RELEVE-PHRASES-COACH-2026-09-29`), selon `VOIX-DU-COACH-V1`. **Les règles, qui s'imposent à toute phrase future :**

1. **Un seul format pour les chiffres, charge d'abord, avec « kg »** : `125 kg × 5` ; une série de reps : `125 kg × 4, 4, 4`. **Un seul formateur** (charges, reps, dates), appelé par le moteur et le plan ; aucune phrase ne formate un nombre elle-même.
2. **La date relative** : « aujourd'hui » ; **le nom du jour** (« mardi ») de 1 à 6 jours avant ; au-delà, « le 13 sept. ». **La date de référence est une entrée** (la date de la séance, `avant`), jamais l'horloge : les fonctions restent pures.
3. **« Palier » n'apparaît dans aucune phrase** : « ta charge de travail ». **« Le moteur » n'apparaît dans aucune phrase** : le coach dit « je » quand il agit, « on » pour un plan commun, rien pour un fait.
4. **Phrases courtes, au « tu », un fait puis sa conséquence.** Jamais de « bravo ».
5. **Le coach applique d'office et le dit** (« je passe ta série 2 à 130 kg ») ; **la seule question** est le choix entre deux charges (§9.14, seconde charge). Aucune autre phrase ne se termine par « ? ».
6. **Une seule formulation par fait** (les doublons du relevé fusionnent) ; la reprise courte et la reprise longue plafonnée se distinguent aussi dans l'en-tête.
7. « Ta machine ne permet pas un plus petit cran » remplace « ton cran ne peut pas être plus petit ».
8. **Supprimées** (plus jamais produites depuis 49-U8, §7.6) : la phrase grise, le paragraphe de la feuille et le verdict du constat « pas de palier ».

**Garde de la voix** : un test balaie toutes les phrases produites sur les fichiers de cas et les plans générés, et échoue sur « palier », « le moteur », un « ? » hors du choix entre deux charges, un « × » sans « kg » devant, ou une date au format absolu à 6 jours ou moins. Le texte exact de chaque gabarit est figé par les fichiers de cas (`consigne-48b7`, `constat-48b6b`, `reaction-49r1`) ; la table avant/après de la réécriture est `PHRASES-COACH-REECRITURE-V1` (projet).


---

## 20 bis. La cohérence des phrases — décidée le 01/10/2026 (chantier 49)

> **Chaque chiffre que le coach écrit a une origine dans le plan ; et deux phrases du même plan ne disent jamais deux choses différentes.**

**Chaque chiffre cité porte sa nature**, déclarée par le formateur unique qui l'écrit (`modele.js` : `charge`, `chargeFois`, `serie`, `quand` — jamais un chiffre écrit à la main dans une phrase) :

| Nature | Ce qu'elle doit égaler |
|---|---|
| **cible du jour** (« 92 kg × 11 », « je passe ta série 2 à… », « on tient… ») | une ligne couverte du plan de cet exercice (charge et visée) |
| **fait passé** (« mardi : 80 kg × 10, 10, 6 », « ton meilleur », « ta dernière charge tenue ») | une série réelle de l'historique, à sa date, ou le meilleur du compteur |
| **cible suivante** (« la prochaine fois : … ») | la consigne que le plan donnera à la séance suivante, **par la même fonction** (§9.13 bis) |
| **règle** (« ta zone va jusqu'à 8 », « depuis 4 séances », « 60 % des séries ») | la valeur de la règle dans le plan (zone, compteur, constante) |

**Trois vérifications**, sur chaque plan :
1. **Le jaune colle aux chiffres** : l'en-tête et les phrases jaunes ne citent que des cibles du jour qui sont des lignes du plan.
2. **Le gris colle aux chiffres** : chaque chiffre d'une phrase grise a sa nature et égale sa source.
3. **Le jaune et le gris disent la même chose** : pour un même exercice, deux citations de **même nature** et de **même objet** (la cible du jour d'une même ligne, la cible suivante, le meilleur) ont **les mêmes chiffres**, dans un sens comme dans l'autre ; un mot d'ordre (« première », « dernière ») égale le rang de la série citée.

Plus : **aucune phrase ne contient** `null`, `undefined`, `NaN`, ni un nombre sans unité là où une charge est attendue.

**Où elle tourne** : **I26** dans `verifierPlan` (banc, tests, garde de développement : un écart est un marqueur rouge en prévisualisation, rien en production) ; un test qui balaie toutes les phrases de tous les plans des fichiers de cas et du banc, comme la garde de la voix ; le rejeu (`?rejouer=`) l'affiche pour chaque étape.

**Méthode** : la garde arrive **en mode rapport** — elle liste les écarts qu'elle trouve sur le banc et les fichiers de cas, sans corriger les phrases ; chaque écart se tranche ensuite (la phrase, ou la garde), puis la garde devient bloquante.


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

| Stagnation sous consigne (§12.2 bis, §12.8) | **tranchée le 25/09/2026** : niveau validé, par zone, séances suivies seulement, seuil fixe et mots personnels |
| Réaction série par série (§9.14) | **tranchée le 25/09/2026**, version 1. Ses limites connues, par ordre d'importance : |
| — le ressenti | il ne lit que les reps : 8 reps avec 3 en réserve ou à l'échec ne sont pas la même série. L'app doit collecter le ressenti dès maintenant pour qu'une version 2 s'en serve sur des données réelles |
| — la fatigue normale | il se tait quand ça baisse ; un coach dirait parfois « normal, garde la charge ». À peser : une phrase de plus est une phrase de trop si elle n'apporte rien |
| — une seule montée | pas de deuxième montée dans le bloc : seule la première a été mesurée |
| — le nombre de séries | ajouter ou retirer une série : quatrième sujet du chantier 49, avec l'escalier |
| — l'ordre dans la séance | un exercice après quinze séries sur le même muscle (§12 bis), non mesuré |
| — l'apprentissage | seuil de 3 reps identique pour tous ; à ajuster par exercice sur les paris observés dans `predictions` |
| Escalier (§14) | **tranché le 25/09/2026** : lire le contexte (isolé ou généralisé), alléger si généralisé, stimuler selon la zone si isolé ; réglage selon la vitesse de progression laissé vide ; maquette de la carte et de la semaine allégée à faire |
| Calisthénie : les cinq leviers de progression | non traité, hors chantier 48 |
| Top set suivi de séries allégées (banc M16) | 2 à 5 séances sur 100 ; le moteur y voit un test raté, sans effet — à surveiller |
| Zones, fenêtre de 8 séances, seuils de reprise (3 et 12 semaines) | calés sur cinq profils d'un même entourage et sur la littérature ; à revérifier sur les premières données prescrites |
| Couverture du palier chez Jordan (73,5 %) | pyramides fréquentes : à regarder avant de lui ouvrir le moteur (§7.3) |

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

### 22.8 Amendement du 19/09/2026 — le moteur parle (chantier 48)

Décisions prises avec Aurélien, mesurées au banc (`banc_moteur48.py`, mesures M1 à M16), confrontées à la littérature et au coaching. État complet : `CHANTIER-48-MOTEUR-2026-09-19.md`.

| Où | Avant | Après |
|---|---|---|
| §5.2, §7.3 | Rampe jugée contre la plus lourde des séries suivantes | Jugée contre le palier provisoire (défaut P1, confirmé sur appareil) |
| §7.5 | L'exploration ne valide rien | Elle sert de test (§9.7) |
| §9.1, §9.1.2 | Fourchette en cloche, montée de toutes les séries, plafond 20 | Cinq zones, test d'un cran sur la dernière série, étirement jusqu'à 30 |
| §9.1.3, §9.1.4 | Garde-fous, transition par dépassement | Retirés : les tests remplacent la transition |
| §9.2 | Règle de validation | Niveau validé défini |
| §9.5 | Douze pistes rejetées sur un critère d'imitation | Rejouées sur le critère BANC §12.4, soldées |
| §9.7 à §9.11 | — | Règle du test, réglages, reprise, phases, écriture dans `predictions` |
| §10.2 | Pas approximatif | Ordre des charges proposées |
| §12.8, §20 | Compteur sur tout l'historique ; « depuis 3 séances » | Séances prescrites seulement ; 4 séances |

Sources ajoutées au §23 : Zhang et al. 2021, méta-analyse en réseau de 2025, ACSM 2009, Williams et al. 2017, Izquierdo et al. 2007, Mujika & Padilla 2000, Mann et al. 2010, Moesgaard et al. 2022.

### 22.9 Amendement du 25/09/2026 — la stagnation sous consigne (chantier 49)

Décisions prises avec Aurélien, mesurées en rejouant la consigne sur les cinq historiques (`mesure_stagnation49.py`), confrontées à la pratique des coachs et à la littérature.

| Où | Avant | Après |
|---|---|---|
| §8.2 | Compteur par exercice et par format | Par exercice et par zone |
| §9.10 | Décharge « reconnue » | Déclarée, jamais déduite ; une consigne non suivie est neutre |
| §12.2 bis | Record de charge ou de reps, meilleure série | Niveau validé ou palier, test qui bat le meilleur test, contre le meilleur depuis la remise à zéro |
| §12.4 | Courbe plate dès 3 séances, seuil arbitré | Décrochage entre 3 et 4, seuil soutenu par la mesure |
| §12.7 | Bosse inexpliquée vers 6 séances | Close : artefact de la mesure charge seule |
| §12.8 | Seuil qui s'adaptera | Seuil fixe, phrase personnelle seulement si vraie ; séances suivies seulement |
| §14, §14.2 | Cinq marches, repli « validé en entier » | Marches 1 et 2 absorbées (à confirmer), ordre rouvert, repli dit avec le niveau validé |

Sources ajoutées au §23 : Rogerson et al. 2024. Pratique de coaching confrontée : protocoles d'échec de GZCLP et du 5×5 (programmes pour débutants).

### 22.10 Amendement du 25/09/2026 — la réaction série par série (chantier 49)

Décisions prises avec Aurélien, mesurées en rejouant la consigne sur les cinq historiques (`mesure_reaction49.py`), confrontées à l'APRE, à la littérature sur le retour d'information et au coaching. Maquette : `maquette-reaction-serie-v1.html`.

| Où | Avant | Après |
|---|---|---|
| §9.14 | La consigne ne bouge plus une fois la séance ouverte | Le coach réagit à chaque série validée : 3 reps de marge, un cran, fourchette programme puis habitude puis préconisation |
| §9.11 | Une consigne par séance et par exercice | Des révisions, chacune un pari ; la révision entre dans l'identifiant, la révision 0 garde l'ancienne formule |
| §20 | — | Les phrases de la réaction : proposer, constater un fait, « pas encore » |
| §22.3 | Réaction à mesurer | Tranchée ; six limites notées |

Sources ajoutées au §23 : Weakley et al. 2020 ; Weakley et al. 2023.

### 22.11 Amendement du 25/09/2026 — l'escalier lit le contexte (chantier 49)

| Où | Avant | Après |
|---|---|---|
| §14 | Cinq marches dans un ordre fixe, pour tout blocage | Contexte d'abord : généralisé → semaine allégée (décharge déclarée) ; isolé → une série de plus (zones muscle) ou un autre schéma (zones force), puis repli |
| §9.10 | Décharge : aucune proposition de charge | Décharge déclarée avec sa consigne : même charge, séries −40 %, 2 reps de moins, rien ne monte |
| §22.3 | Ordre des marches rouvert | Tranché ; vitesse de progression laissée vide |

Mesures : `mesure_escalier49.py`, `mesure_escalier49_contexte.py`, `mesure_escalier49_generalise.py`. Sources ajoutées au §23 : Scarpelli et al. 2022 ; l'étude de 2026 sur +20 % contre +120 % ; Spiering et al. 2021 ; Bell et al. 2023 et 2025.

## 23. Sources

- Plotkin D. et al. (2022). *PeerJ* 10:e14142 — progression en charge vs en reps
- Pelland J.C. et al. (2025). *Sports Medicine*. DOI 10.1007/s40279-025-02344-w — volume, rendements décroissants
- Remmert J. et al. (2025). *SportRxiv* — volume par séance
- Grgic J. et al. (2020). *Sports Medicine – Open* 6:31 — fidélité test-retest du 1RM
- Zourdos M.C. et al. (2016). *Nutr Hosp* 33(2):437-443 — variabilité quotidienne du 1RM
- Nuzzo J.L. et al. (2023). *Sports Medicine*. PMID 37792272 — reps/%1RM
- Coleman M. et al. (2024). *PeerJ* 12:e16777 — deload d'une semaine

- Rogerson D. et al. (2024). *Sports Medicine – Open* 10:26. DOI 10.1186/s40798-024-00691-y — pratiques de décharge de 246 athlètes de force et de physique : environ 6 jours toutes les 5 à 6 semaines, surtout planifiées, déclenchées aussi quand la performance cale
- Scarpelli M.C. et al. (2022). *Journal of Strength and Conditioning Research* 36(4):1153-1157 — un volume individualisé (+20 % par rapport à l'habitude) fait plus grossir le muscle de pratiquants entraînés qu'un volume standard
- Spiering B.A. et al. (2021). *Journal of Strength and Conditioning Research* 35(5):1449-1458. DOI 10.1519/JSC.0000000000003964 — l'intensité est la variable clé pour maintenir force et muscle quand volume et fréquence baissent
- Bell L. et al. (2023). *Sports Medicine – Open* 9:87. DOI 10.1186/s40798-023-00633-0 — consensus Delphi sur la décharge
- Bell L. et al. (2025). *Strength and Conditioning Journal*. DOI 10.1519/SSC.0000000000000910 — recommandations pratiques pour la décharge
- *Large increases in resistance training volume do not impair muscle hypertrophy or anabolic-catabolic molecular signaling in trained individuals* (2026), *Journal of Applied Physiology*, DOI 10.1152/japplphysiol.00284.2026 — +120 % d'un coup ne fait pas mieux que +20 %
- Weakley J. et al. (2020). *Journal of Strength and Conditioning Research* 34(11). DOI 10.1519/JSC.0000000000002887 — encouragement verbal, retour verbal et retour visuel améliorent la performance au squat chez des pratiquants entraînés
- Weakley J. et al. (2023). *The Effect of Feedback on Resistance Training Performance and Adaptations: A Systematic Review and Meta-analysis* — le retour d'information améliore l'adaptation, surtout sur 4 à 6 semaines
- LeSuer D.A. et al. (1997) — validité des équations de 1RM sur les trois barres
- van den Tillaar R. (2013) — contribution musculaire à la sortie du point de blocage
- *Journal of Functional Morphology and Kinesiology* (2025). DOI 10.3390/jfmk10030322 — le point de blocage est géométrique
- Elliott, Wilson & Kerr (1989) ; Madsen & McLaughlin (1984) — définition cinématique du blocage
- Sheiko Gold — dissociation entre point de force minimale et point de vitesse minimale
- Steele J. et al. (2017) ; Refalo M.C. et al. (2023) — exactitude de l'effort auto-rapporté
- Androulakis-Korakakis P. et al. (2021). DOI 10.3389/fspor.2021.713655 — dose minimale efficace

- Zhang X. et al. (2021). *Frontiers in Physiology* 12:651112. DOI 10.3389/fphys.2021.651112 — autorégulation contre charges fixes chez des athlètes
- *Autoregulated resistance training for maximal strength enhancement: a systematic review and network meta-analysis* (2025) — APRE en tête des méthodes d'autorégulation
- American College of Sports Medicine (2009). *Progression models in resistance training for healthy adults* — +2 à 10 % quand on dépasse le nombre de reps visé
- Mann J.B. et al. (2010). *Journal of Strength and Conditioning Research* — APRE, charge ajustée sur une série test
- Williams S. et al. (2017). *British Journal of Sports Medicine* — pondérer les séances récentes
- Izquierdo M. et al. (2007) — perte de force après 4 semaines d'arrêt chez des entraînés
- Mujika I. & Padilla S. (2000). *Sports Medicine* — désentraînement
- Moesgaard L. et al. (2022). *Sports Medicine* — périodisation, force et hypertrophie à volume égal
