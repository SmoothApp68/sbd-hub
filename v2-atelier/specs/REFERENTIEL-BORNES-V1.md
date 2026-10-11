# Référentiel de bornes scientifiques — v1

**Amendé le 3 septembre 2026 :** ajout du §1.5, *la fenêtre muette et sa condition de portée*. C'est la seule modification ; le reste du document est inchangé depuis le 23 août.

**Projet :** TrainHub v2 (reboot)
**Date :** 23 août 2026
**Statut :** Phase 1 — critères de validation externes. **Aucun algorithme n'est écrit tant que ce document n'est pas validé.**

---

## 0. Pourquoi ce document existe

Le piège que ce référentiel neutralise : quand je fais tourner un algo sur des profils simulés et que je dis « ça, c'est aberrant », je ne fais que remplacer ton intuition par la mienne. Ça ne rend pas l'algo solide, ça déplace le juge.

Donc les bornes sont écrites **avant** les tests, sourcées, et figées. Quand une simulation échoue, le verdict n'est pas « Claude trouve ça bizarre », c'est « la sortie est en dehors de la fourchette publiée par [source] ».

### Trois natures de bornes

| Type | Ce que ça contraint | Effet en cas de violation |
|---|---|---|
| **Bornes de sortie** | Ce que l'algo produit sur 12/24/52 semaines simulées | `FAIL` — l'algo est faux |
| **Bornes d'instrument** | Le bruit des mesures dont l'algo se nourrit (e1RM, RIR) | `FAIL` — l'algo sur-interprète du bruit |
| **Bornes d'interdit** | Ce que l'algo n'a pas le droit d'affirmer | `FAIL` — l'app ment à l'utilisateur |

### Trois niveaux de sévérité

- **`HORS-LITTÉRATURE`** → échec dur. La sortie contredit des données publiées. L'algo est cassé.
- **`HORS-CONVENTION`** → avertissement. Hors de la pratique courante mais non contredit par les données. C'est un **choix produit**, à documenter explicitement.
- **`INDÉCIDABLE`** → la science ne tranche pas. L'app doit faire un choix assumé et **loggé comme tel**, jamais déguisé en fait scientifique.

### Règle du praticien assidu *(méta-règle, prioritaire)*

> **La majorité de la littérature est bâtie sur des sujets peu ou pas entraînés.** Dans la méta-régression Nuzzo (le plus gros corpus disponible sur reps/%1RM), 40 % des sujets étaient non-entraînés. Toute borne, tout seuil, toute alerte calibrée sur ce socle **ne s'applique pas telle quelle à un powerbuilder à 20 séances / 28 jours**.
>
> Toute alerte doit être passée sur le profil « Aurélien réel » (98 kg, S145/B140/D170, ~75 k kg/sem, 20-21 séances/28j) **avant** d'être considérée comme calibrée. Si elle s'allume sur ce profil, elle est présumée fausse jusqu'à preuve du contraire.

Cette règle n'est pas théorique : c'est le diagnostic post-mortem de tout le chantier Coach v329→v343. Insolvency/Banqueroute, MRV, surcharges articulaires, ratios « Critique », 4035 kcal — **une seule racine**, cinq symptômes. Les chiffres étaient souvent justes ; l'alarme était calibrée pour quelqu'un d'autre.

---

## 1. Bornes de sortie — Progression de force

C'est la borne mère. Si l'algo simulé fait progresser un profil hors de ces fourchettes, tout le reste est sans objet.

### 1.1 Données de référence

**Latella et al. 2024, *Sports Medicine*** (DOI 10.1007/s40279-023-01962-6) — la meilleure source disponible, et de loin.
Modélisation de croissance à effets mixtes sur la base IPF (OpenPowerlifting), filtrée raw + open : **9 259 athlètes uniques, 46 066 observations, jusqu'à ~17 ans de carrière**, minimum 3 compétitions par athlète.

- Gains les plus forts en tout début de participation : **+7,5 à +12,5 % au-dessus du niveau initial sur la 1ʳᵉ année**
- **~+20 % au-dessus du niveau initial après 10 ans**
- Masters femmes (>59 ans) : encore en gain, ~+2,5 à +5 %/an
- Masters hommes (>69 ans) : perte ~−0,35 %/an (≈ 1/3 du rythme des sédentaires)

⚠️ **Lecture correcte :** ces gens **s'entraînaient déjà** en arrivant en compétition. Cette courbe est celle du **pratiquant entraîné**, pas celle du débutant.

**Ferrari et al. 2025, *Sports Medicine – Open*** (DOI 10.1186/s40798-025-00903-z) — réplication indépendante, 8 907 athlètes IPF européens, 54 064 entrées 2012-2024. Modèle prédictif à 5 variables (sexe, âge, poids de corps, force relative initiale, ancienneté) atteignant R² = 0,90–0,94. Même forme de courbe : très forte 1ʳᵉ année, aplatissement continu ensuite.

**Barbell Medicine (synthèse)** — populations non-entraînées : **+15 à +30 % sur 1RM en 12 semaines**. Pratiquants bien entraînés : de l'ordre de **+2 à +6 % par an** sur les mêmes mouvements.

### 1.2 Bornes opérationnelles

| Profil | Fenêtre | Gain plausible | `HORS-LITTÉRATURE` si | Confiance |
|---|---|---|---|---|
| Non-entraîné (<1 an de charge progressive) | 12 sem. | +15 à +30 % | > +40 % | **A** |
| Entraîné, 1ʳᵉ année structurée | 12 mois | +7,5 à +12,5 % | > +20 % | **A** |
| Entraîné confirmé (2-5 ans) | 12 mois | +2 à +6 % | > +15 % | **A** |
| Avancé (≥10 ans) | 12 mois | +0,3 à +2 % | > +8 % | **B** |
| Tout profil | 1 semaine | — | > +3 % soutenu sur 12 sem. | **A** |

**Corollaire haut/bas du corps :** Latella 2022 (*Med Sci Sports Exerc*) documente des vitesses de gain différentes entre haut et bas du corps. Un algo qui applique le même taux au développé couché et au squat est faux par construction. Les gains relatifs sur presse sont systématiquement plus lents.

### 1.3 Conséquence de design — le problème du dénominateur

Point soulevé par Barbell Medicine et qui a des conséquences directes sur le code :

> +5 kg sur un squat à 135 kg = +3,7 %. +5 kg sur un squat à 405 kg = +1,2 %. **C'est la même quantité de tissu contractile nouveau.**

**Donc : un algorithme qui progresse en pourcentage fixe est mathématiquement incohérent avec la physiologie.** Il sous-charge le débutant et sur-charge l'avancé. Le référentiel impose que l'incrément soit exprimé en **absolu, modulé par le niveau**, pas en pourcentage constant.

### 1.4 Test de réalité sur ton propre cas

Squat 145 → objectif 200 = **+38 %**. Depuis un statut « avancé » (2-6 %/an), c'est un horizon de **7 à 15 ans**, pas de deux blocs.
Deadlift : e1RM 186 → 220 = +18 %, soit ~4 à 8 ans au même rythme.

Ce n'est pas décourageant, c'est le contraire : ça définit ce que l'app a le droit de te promettre. **Toute projection de l'app qui te met le squat à 200 en moins de 3 ans est un mensonge, et le référentiel doit la faire échouer au banc d'essai.** C'est exactement le genre de sortie qu'aucun test unitaire vert n'attrape.

### 1.5 La fenêtre muette — *ajouté le 3 septembre 2026*

**Le problème.** Les bornes du §1.2 supposent qu'on dispose d'une mesure de force. Sur du journal d'entraînement, cette supposition est fausse la plupart du temps.

Vérifié sur le profil réel d'Aurélien : **treize alarmes `HORS-LITTÉRATURE` s'allument**, toutes protégées par la méta-règle du praticien assidu. Aucune ne signale un vrai problème.

**La cause.** Le maximum observé sur une fenêtre n'est pas une mesure de force : il dépend de ce que la personne a **choisi de faire**. Un trimestre passé en séries de dix ne dit rien de la force maximale, et sa comparaison au trimestre précédent ne mesure que le changement de programmation.

Mesure à l'appui, sur sept trimestres : un trimestre **sans aucune tentative sous 4 répétitions** ne montre que **85,5 %** du meilleur trimestre voisin, contre **96,7 %** avec.

**La règle.**

> Un maximum observé n'est une mesure de force que si la fenêtre contient au moins **2 séances** de l'exercice et au moins **une tentative sous 4 répétitions**.
> Sinon la fenêtre est **muette** — ni progression, ni régression, aucune conclusion.

**L'amendement — la condition de portée.**

Telle qu'énoncée ci-dessus, la règle déclenchait **123 fois chez Jordan et 219 fois chez Léa**. Sur quoi ? Des curls et des élévations latérales.

> **La règle ne s'applique qu'aux exercices où la personne réalise au moins une série de 3 répétitions ou moins dans _tout_ son historique.**

Sur une élévation latérale, l'absence de triple n'est pas un manque de mesure : **c'est la nature de l'exercice**. Personne ne fait de triple à l'élévation latérale, et une règle qui l'exige transforme une pratique normale en anomalie.

Effet mesuré de la restriction :

| | Sans condition de portée | Avec |
|---|---|---|
| Jordan | 123 | **14** |
| Léa | 219 | **29** |

**Généralisation, à retenir pour toute borne future.**

> Une règle calibrée sur la mauvaise population d'exercices se déclenche mécaniquement, quel que soit le soin apporté à ses seuils.

C'est la même famille d'erreur que le piège du percentile documenté au §4 de `REGLE-VOLUME-V2.md` : là-bas, un seuil relatif à soi-même ne contrôle pas son taux de déclenchement ; ici, une règle sans domaine de validité s'applique là où elle n'a pas de sens. **Dans les deux cas, les chiffres étaient justes et l'alarme sur-calibrée** — la racine unique de tous les faux signaux du Coach v1.

⚠️ **Limite assumée.** Les seuils — 2 séances, 4 répétitions, 3 répétitions pour la portée, l'ampleur de l'écart — reposent sur **sept trimestres d'un seul utilisateur**. La direction est solide, les nombres ne le sont pas. **À recalibrer sur les cinq profils**, désormais tous en base.

---

## 2. Bornes d'instrument — e1RM

L'e1RM n'est pas une donnée, c'est une **mesure bruitée**. Le référentiel définit la taille du bruit, donc le seuil en dessous duquel l'algo n'a pas le droit de conclure quoi que ce soit.

### 2.1 Ce que dit la littérature

**Corrélation ≠ exactitude.** Toutes les équations classiques (Brzycki, Epley, Lander, Lombardi, Mayhew, O'Connor, Wathen) corrèlent très fortement avec le 1RM réel (r > 0,95, souvent > 0,98). Ça ne veut pas dire qu'elles sont justes — ça veut dire qu'elles se trompent dans le même sens.

**L'erreur explose avec les répétitions.**
- Mayhew et al. 2008 (103 femmes, avant/après 12 semaines) : les équations sont plus exactes en dessous de 10 reps.
- Reynolds et al. 2006 (70 sujets) : le test à 5RM donne la meilleure prédiction (R² = 0,993 au développé couché, 0,974 à la presse) ; l'exactitude se dégrade nettement quand le nombre de reps monte.
- Au-delà de ~30 reps, Brzycki et Lander produisent une erreur inacceptable (>75 % sur presse à cuisses / triceps) ; Epley et Wathen restent dans 13-22 %.

**Le biais est spécifique à l'exercice.** LeSuer et al. 1997 (67 sujets, SBD) : **toutes** les équations sous-estiment significativement le soulevé de terre. Une équation universelle est donc fausse par construction sur au moins un des trois mouvements.

**Brzycki vs Epley (comparaison directe, back squat, OpenSIUC) :** Epley le plus exact appliqué à un 3RM ; Brzycki le plus exact appliqué à un 5RM ; Epley sur-estime nettement à partir d'un 5RM.

**Validation Brzycki au développé couché** (footballeurs universitaires entraînés) : r = 0,96, **erreur-type ±4,9 kg**.

**Et le 1RM lui-même est bruité.** Revue systématique de fidélité test-retest : limites d'agrément à 95 % de **±3-5 kg au développé couché, ±10-15 kg au squat**. C'est-à-dire que même la *vraie* mesure bouge de 10 kg au squat sans qu'il se soit rien passé.

### 2.2 Bornes opérationnelles

| Borne | Valeur | Sévérité |
|---|---|---|
| Fenêtre de reps où l'e1RM est exploitable | **≤ 8 reps** (idéal 3-6) | `A` |
| Fenêtre tolérée avec avertissement | 9-12 reps | `B` |
| Au-delà de 12 reps | **e1RM non affiché**, ou marqué indicatif non exploitable | `A` |
| Bande d'erreur attendue | ±5 % (couché) à ±10 % (squat / SDT) | `A` |
| **Variation minimale interprétable** | **> ±5 %** ou **> ±5 kg**, le plus grand des deux | `A` |
| Équation unique tous exercices | interdite — biais SDT documenté | `B` |

**`HORS-LITTÉRATURE` :** tout algorithme qui déclenche une décision (progression, alerte, changement de bloc) sur une variation d'e1RM inférieure à la bande de bruit ci-dessus.

### 2.3 Ce que ça valide et ce que ça remet en cause

✅ **Validé :** la philosophie PR B déjà livrée (e1RM = indicateur / tendance, jamais un « record ») est **exactement** ce que la littérature impose. Les 5 déclencheurs de PR fantômes corrigés étaient des sur-interprétations de bruit. Décision confirmée par les données, pas par le feeling.

⚠️ **À rouvrir :** `calcE1RM` utilise Brzycki. Brzycki est le moins bon des candidats au-delà de 5 reps et n'est pas spécifique à l'exercice. **Action banc d'essai :** comparer Brzycki / Epley / Wathen / Mayhew sur les 557 séances réelles d'aurel_br + les 334 des autres users, mouvement par mouvement, et retenir celle qui minimise l'erreur sur les cas où une vraie barre a été soulevée peu après. On a la donnée pour trancher empiriquement au lieu de choisir par tradition.

---

## 3. Bornes d'instrument — RIR / RPE

### 3.1 Ce que dit la littérature

**Biais systématique : les gens se sous-estiment.**
Steele et al. 2017 (141 participants) : sous-prédiction systématique des reps jusqu'à l'échec — **~1 à 2 reps** chez les expérimentés, **~4 à 5 reps** chez les moins expérimentés. Autrement dit, quand un débutant dit « je suis à l'échec », il lui reste souvent 4-5 reps.

Méta-analyse exploratoire Halperin et al. 2022 (12 études, 414 participants) : sous-estimation moyenne d'environ 1 rep.

**L'exactitude dépend de la proximité de l'échec.**
Hackett et al. : nettement meilleure entre 0 et 5 RIR (optimale autour de 1 RIR) qu'entre 7 et 10 RIR.
Refalo et al. 2023 (24 pratiquants entraînés, développé couché) : très bonne exactitude absolue à 1 et 3 RIR, légère tendance à la sous-prédiction. **Aucune relation trouvée avec le sexe, les années d'expérience, ni la force relative.**

**L'exactitude dépend aussi de la longueur de la série.** Une série de 12 à 3 RIR est bien plus dure à évaluer qu'une série de 5 à 3 RIR. Les notations sont systématiquement moins fiables sur les séries longues, ce qui limite l'usage du RIR aux charges modérées à lourdes.

**Validité de construit :** Zourdos et al. 2016 — corrélation vitesse/RPE de r = −0,88 (expérimentés) et −0,77 (novices). L'échelle mesure bien quelque chose de réel.

### 3.2 Bornes opérationnelles

| Borne | Valeur | Sévérité |
|---|---|---|
| RIR exploitable comme signal | **RIR ≤ 4** et série **≤ 10 reps** | `A` |
| Biais attendu à corriger | **−1 rep** (utilisateur entraîné) | `A` |
| Biais attendu, utilisateur novice | **−3 à −5 reps** | `A` |
| Résolution maximale de l'échelle | l'algo **ne doit pas** distinguer RIR 6 de RIR 8 | `A` |
| Auto-ajustement de charge sur RIR novice seul | **interdit** | `B` |

**`HORS-LITTÉRATURE` :** toute logique qui traite le RIR comme une mesure continue fiable de 0 à 10, ou qui prend une décision différente entre RIR 5 et RIR 7.

### 3.3 Ce que ça valide

✅ Ton instinct sur le **chantier RPE simplifié** (collecte low-friction *facile / moyen / difficile*) est scientifiquement le bon choix, et pas seulement pour la friction : **les gens ne peuvent physiquement pas résoudre les gradations fines loin de l'échec.** Une échelle à 3 crans près de l'échec est plus honnête qu'une échelle à 10 crans dont 6 sont du bruit.

Recommandation dérivée : les 3 crans doivent mapper sur la zone où l'instrument fonctionne — quelque chose comme *« il me restait 3+ » / « il me restait 1-2 » / « je n'aurais pas fait une de plus »*. Pas sur une échelle d'effort ressenti diffuse.

---

## 4. Bornes de charge — relation reps / %1RM

C'est la borne la plus sous-estimée, et celle qui a déjà mordu : le 122,5 kg × 7 prescrit au développé couché qui s'est révélé être un RPE 10 réel, c'est **exactement** cette défaillance.

### 4.1 Ce que dit la littérature

**Nuzzo et al. 2023, *Sports Medicine*** (PMID 37792272) — méta-régression, **962 tests de reps-jusqu'à-l'échec, >7 000 individus, 92 études**. C'est la première mise à jour rigoureuse d'un tableau de charges qui datait de la fin des années 80 et reposait sur deux études d'un seul groupe.

Résultats clés :
- **À 70 % du 1RM : ~14,8 reps en moyenne, tous exercices confondus** (le tableau classique dit 12)
- **Développé couché** : ~14,1 reps à 70 %, 8,8 à 80 %, 6,2 à 85 %
- **Presse à cuisses** : ~19,0 reps à 70 % — **~5 reps d'écart avec le couché à charge relative identique**
- La variation interindividuelle **augmente quand la charge relative baisse**
- **Le seul modérateur significatif est l'exercice.** Ni le sexe, ni l'âge, ni le statut d'entraînement n'expliquent l'écart de façon exploitable.

**L'ampleur de la variation individuelle.**
Cooke et al. 2019 (pratiquants entraînés, squat à 70 % 1RM) : **14 ± 4 reps, étendue réelle 6 à 28**. Six sujets ≥ 20 reps, onze sujets ≤ 10 reps. Retirer les extrêmes ne réduit presque pas la dispersion.

Sur développé couché guidé, la variation interindividuelle du % de série complété à reps fixes atteint un CV médian de ~24 %.

**Ce qui explique la variation : inconnu.** Le typage musculaire corrèle faiblement (r ≈ 0,40) et n'est pas mesurable en pratique. La masse corporelle a une relation inverse non significative (p = 0,095). C'est l'une des grandes questions ouvertes de la discipline.

### 4.2 Bornes opérationnelles

| Borne | Valeur | Sévérité |
|---|---|---|
| Table %1RM → reps universelle | **interdite comme vérité**, tolérée comme point de départ initial uniquement | `A` |
| Étendue individuelle attendue à 70 % 1RM | **6 à 28 reps** | `A` |
| Table unique pour tous les exercices | `HORS-LITTÉRATURE` — écart couché/presse ≈ 5 reps à 70 % | `A` |
| Tableau Baechle/Earle classique | **non valide** comme référence (trop conservateur, mal sourcé) | `A` |
| Marge de sécurité sur AMRAP observé | **retirer 1 à 2 reps** du max constaté pour l'usage quotidien | `B` |

**`HORS-LITTÉRATURE` :** toute prescription qui suppose qu'un %1RM donné correspond au même nombre de reps pour deux utilisateurs, ou pour deux exercices chez le même utilisateur.

### 4.3 Conséquence de design majeure

> **L'algorithme doit construire une table de charges *individuelle et par exercice*, dérivée des séries réelles de l'utilisateur, et non appliquer une table de population.**

C'est faisable et c'est exactement là qu'est ton avantage concurrentiel : **tu as 891 séances réelles en base.** Hevy a les données mais ne fait pas ça. La table individuelle par exercice, extrapolée depuis les séries proches de l'échec réellement effectuées, c'est le cœur algorithmique de TrainHub v2.

Point de méthode : la pente %1RM→reps de Nuzzo sert à **extrapoler** la table individuelle à partir d'un ou deux points mesurés. On n'utilise pas ses moyennes, on utilise sa forme de courbe.

### 4.4 Bornes du moteur de progression — ajoutées le 19/09/2026

| Borne | Valeur | Appui | Statut |
|---|---|---|---|
| Zones de reps | Lourd 3-5, Mix 6-8, Hypertrophie 8-10, Volume 10-12, Séries longues 15-20 | NSCA ; Schoenfeld 2017, 2021 ; 97 habitudes sur 100 (5 profils) | choix produit appuyé |
| Plafond d'une zone étirée | 30 reps | banc M15 | choix produit |
| Fenêtre de l'habitude | 8 dernières séances du couple exercice-format | Williams et al. 2017 ; mésocycles de 3 à 6 semaines | choix produit appuyé |
| Saut par montée | 1 cran ; 2 en Franc avec preuve, si deux crans restent sous 10 % de la charge | ACSM 2009 : +2 à 10 %, plus faible pour les petits groupes musculaires ; APRE (Mann 2010) | convention publiée |
| Reprise après coupure | jusqu'à 12 semaines : même charge, sans rep de plus ; au-delà : un cran dessous | Izquierdo et al. 2007 ; Mujika & Padilla 2000 ; banc M14 | choix produit appuyé |

**Statut** au sens du §0 : la science ne fixe pas ces valeurs exactes (`INDÉCIDABLE`) ; ce sont des choix assumés et loggés comme tels, sauf la fourchette de saut, qui suit une convention publiée. **Méta-règle du praticien assidu appliquée** : chaque borne a été jouée sur le profil d'Aurélien (20 séances sur 28 jours) avant d'être retenue (MOTEUR §9.7 à §9.9, BANC §14).

---

## 5. Bornes de volume

### 5.1 Ce que dit la littérature

**Pelland et al. 2025, *Sports Medicine*** (DOI 10.1007/s40279-025-02344-w) — méta-régressions multi-niveaux, **67 études, 2 058 participants, 220 effets hypertrophie + 490 effets force**. La référence actuelle.

- Volume et hypertrophie : relation dose-réponse positive, **rendements décroissants**
- Volume et force : relation positive mais **rendements décroissants beaucoup plus marqués**, avec plateau fonctionnel
- Pente marginale hypertrophie : **+0,24 % par série supplémentaire** (IC crédible 95 % : 0,15–0,33) au volume moyen de 12,25 séries fractionnelles/semaine. L'estimation antérieure de Schoenfeld était de 0,38 %/série.
- **Force : supériorité indétectable au-delà d'environ 3 séries fractionnelles hebdomadaires** et d'une fréquence fractionnelle de 3
- **Fréquence : aucun effet significatif sur l'hypertrophie à volume égalisé.** Le choix de fréquence peut se faire par préférence.

**Remmert et al. 2025** (volume par séance) : rendements décroissants dès ~2 séries directes pour la force, ~11 séries fractionnelles pour l'hypertrophie.

### 5.2 Bornes opérationnelles

| Borne | Valeur | Sévérité |
|---|---|---|
| MEV / MAV / **MRV** comme nombres durs | **non soutenus par la littérature** — heuristique de coach (Israetel), pas une quantité mesurée | `A` |
| Bénéfice marginal par série | **fraction de %** — jamais matière à alerte | `A` |
| Alerte « volume insuffisant » | autorisée seulement **très en dessous** de ~10 séries fractionnelles/sem./muscle | `B` |
| Alerte « volume excessif » | **`HORS-LITTÉRATURE`** — aucun seuil de bascule démontré dans les plages étudiées | `A` |
| Pénalité de volume orientée force | plafonner l'ambition, pas alerter : au-delà de quelques séries dures/sem./mouvement, gains indétectables | `A` |
| Fréquence comme levier d'hypertrophie | **`INDÉCIDABLE`** → préférence utilisateur, jamais prescription autoritaire | `A` |

### 5.3 Ce que ça valide

✅ **La suppression d'Insolvency / « Banqueroute » en v341 était scientifiquement correcte**, et pas seulement empiriquement. Il n'existe pas de démonstration d'un seuil de volume au-delà duquel les gains s'effondrent chez un pratiquant entraîné. Un index qui « ampute les accessoires » sur une base de sur-volume punit un comportement que la littérature ne condamne pas.

✅ **Le retrait du bloc MRV du Diagnostic était correct** au-delà même du bug d'unité : le nombre affiché n'avait pas de référent mesurable.

⚠️ **Backlog #7 (« Recalibrer Insolvency Index, dénominateur = volume chronique individuel ») :** reste défendable **uniquement comme entrée descriptive** de l'arbitre, jamais comme verdict. Voir §6.

---

## 6. Bornes d'interdit — Fatigue, ACWR, deload

### 6.1 ACWR — le plus important des interdits

**Impellizzeri et al. 2019** (demande formelle de rétractation/erratum au *BJSM* concernant la figure Blanch & Gabbett) et **Impellizzeri et al. 2020, *IJSPP*** (« Conceptual Issues and Fundamental Pitfalls ») :

- **Aucune preuve ne soutient l'usage de l'ACWR dans un système de gestion de charge, ni pour des recommandations visant à réduire le risque de blessure.**
- Les propriétés statistiques du ratio le rendent intrinsèquement imprécis et compliquent son interprétation.
- La figure du « sweet spot » a été republiée au moins 7 fois, dont dans le consensus CIO où elle était présentée comme un modèle **validé** — ce qu'elle n'a jamais été. Ses auteurs ont demandé une correction.
- Découpage de données continues en catégories arbitraires ; quand Wang et al. 2020 retraitent en continu sans les valeurs extrêmes, **la relation disparaît**.
- Le coup fatal : un ratio charge aiguë / charge chronique **tirée au hasard** est *autant* associé à la blessure que le ratio réel.
- Instabilité mathématique quand la charge chronique est basse → ACWR artificiellement gonflé.

**Ce qui reste défendable :** la **variabilité semaine-à-semaine** est un prédicteur plus solide que la magnitude absolue de charge hebdomadaire, et les mesures de charge interne type sRPE complètent utilement la charge externe.

### 6.2 Bornes opérationnelles

| Borne | Statut |
|---|---|
| Présenter l'ACWR (ou tout ratio aigu/chronique) comme **prédicteur de blessure** | **`INTERDIT`** |
| Afficher une « zone de danger » / « sweet spot » 0,8–1,3 | **`INTERDIT`** |
| Seuil « spike > +30 % = danger » | **`HORS-LITTÉRATURE` en tant que risque.** Descriptif uniquement, sans vocabulaire de risque |
| Afficher charge aiguë vs chronique en **monitoring descriptif** | ✅ autorisé |
| Utiliser la **variabilité inter-semaines** comme signal | ✅ autorisé, confiance `B` |

⚠️ **Impact direct sur l'existant :** l'app affiche aujourd'hui un ACWR (« sain ~1,26 ») et un seuil de spike à +30 %. Les chiffres ne sont pas faux — c'est leur **statut** qui l'est. Il faut les sortir du registre de l'alerte pour les remettre dans celui de l'observation. C'est le même mouvement que la philosophie PR B appliquée à la fatigue : **indicateur, jamais verdict.**

### 6.3 Deload — convention, pas science

**Bell et al. 2022** (*Front Sports Act Living*, perceptions des coachs) et **Rogerson/Nolan et al. 2024** (*Sports Medicine – Open*, enquête transversale sur athlètes force/physique) :

- Durée typique déclarée : **6,4 ± 1,7 jours**, intégrée toutes les **5,6 ± 2,3 semaines**
- Réductions typiques : **30-50 % de volume, 10-20 % d'intensité**
- Motifs cités : gestion de la fatigue (92 %), préparation du cycle suivant (65 %)
- Les auteurs soulignent explicitement la **sous-représentation du deload dans la littérature publiée** et l'**absence de définition opérationnelle claire**

**Coleman/Schoenfeld et al. 2024** (*PeerJ*, 39 sujets, 9 semaines) : une semaine d'**arrêt complet** à mi-programme n'a pas amélioré les résultats ; le groupe en continu s'en est au moins aussi bien tiré. Hypothèse des auteurs : une réduction de volume/intensité serait préférable à une cessation.

**Détraînement :** dès 5 jours d'arrêt, la force isométrique au développé couché baisse sans changement de masse maigre. La force a une composante **d'habileté** → pour un athlète de force, réduire vaut mieux qu'arrêter.

| Borne | Statut |
|---|---|
| Fréquence de deload (toutes les ~5-6 sem.) | **`HORS-CONVENTION` si absent, `INDÉCIDABLE` scientifiquement** — choix produit à assumer |
| Durée 5-7 jours | Convention documentée, confiance `C` |
| Deload = arrêt complet | **déconseillé** pour un profil force (confiance `B`) |
| Présenter le deload comme **scientifiquement requis** | **`INTERDIT`** |

---

## 7. Zones grises — ce que la science ne tranche pas

À traiter comme `INDÉCIDABLE`. L'app peut choisir, mais doit **logger le choix comme choix**, jamais l'habiller en fait.

| Sujet | État |
|---|---|
| MEV/MAV/MRV par groupe musculaire | Heuristique de coach, non mesurée |
| Cause de la variation individuelle reps@%1RM | **Inconnue** — question ouverte majeure de la discipline |
| Timing optimal du deload | Inconnu |
| Questionnaires de readiness → performance | Lien faible, à documenter en v2 du référentiel |
| Cycle menstruel → programmation | **Non traité dans cette passe.** Preuves réputées faibles/inconsistantes — à sourcer avant toute implémentation touchant le profil de Léa |
| Morphologie → ratios de force attendus | **Non traité.** Voir §8 |

---

## 8. Trou identifié — les ratios S/B/D

Les seuils actuels de l'app (S/B danger < 0,85, S/D < 0,65 ou > 1,25, Row/Bench < 0,65) ont été recalibrés avec Gemini en v343. **Cette passe de recherche n'a trouvé aucune norme de niveau littérature pour ces ratios.** Ils relèvent aujourd'hui du folklore de salle, même recalibré.

**Proposition — et c'est peut-être le meilleur coup du chantier :**

> Ne pas chercher ces ratios dans la littérature. **Les dériver directement d'OpenPowerlifting.**

La base contient ~1,25 M d'entrées sur ~310 500 lifters uniques, avec sexe, âge, poids de corps et les trois barres. On peut en sortir la **distribution réelle** des ratios S/B et S/D par sexe et par classe de poids, et donc des percentiles empiriques au lieu de seuils inventés.

Effet : un utilisateur n'est plus « Critique » parce qu'un coach a écrit 0,85 quelque part, mais « dans les 12 % de lifters au ratio S/B le plus bas de sa catégorie » — ce qui est **vrai, vérifiable, et non dramatisant**. Ça règle simultanément le backlog #1 (sortir le rouge) et le backlog #2 (morpho → seuils), puisqu'une morphologie atypique se traduit alors par un percentile, pas par une alerte.

C'est un chantier data pur, côté Claude.ai. À planifier après validation de ce référentiel.


**Décidé le 11/10/2026 (chantier 75)** : pas d'OpenPowerlifting — ce sont des compétiteurs (squat ≈ 1,5 × couché),
pas notre cible. Les repères de « Ton parcours » (ECRAN-SAISIE §7 bis.14 ter) viennent des **standards StrengthLog**,
tirés de carnets d'entraînement (5 700 à 17 300 personnes par mouvement et par sexe), moyenne des niveaux
intermédiaire et avancé : hommes squat / couché 1,21 · militaire / couché 0,57 · soulevé / squat 1,25 ; femmes 1,52 ·
0,63 · 1,25. Le repère suit le sexe du profil ; sans sexe précisé, pas de repère. Seuls les rapports sont repris ; « en dessous »
sous 95 % du repère, jamais de rouge ni d'alerte. Les seuils de la v1 (S/B < 0,85…) restent abandonnés.

---

## 9. Utilisation au banc d'essai

Chaque borne ci-dessus devient une assertion Python. Le banc d'essai n'est pas du code de production : c'est un simulateur qui fait tourner l'algo candidat sur des profils synthétiques et vérifie que les sorties restent dans les fourchettes.

### Profils minimaux à simuler

| Profil | Paramètres | Ce qu'il teste |
|---|---|---|
| Débutant H | 0 an, 75 kg, 3 séances/sem | Progression rapide sans divergence |
| Débutante F | 0 an, 60 kg, 3 séances/sem | Pas d'hypothèse masculine cachée |
| Intermédiaire H | 3 ans, 85 kg, 4 séances/sem | Le cas médian |
| **« Aurélien réel »** | 98 kg, S145/B140/D170, 5 séances/sem, ~75 k kg/sem | **Règle du praticien assidu — aucune alerte ne doit s'allumer sans cause réelle** |
| Avancée F | 6 ans, 63 kg, 5 séances/sem | Plafonnement correct + profil de Léa |
| Irrégulier | 2 séances/sem, absences de 2-3 sem. | Retour au jeu, pas de punition |
| Blessé/douleur | pain déclaré sur un pattern | L'algo contourne sans s'effondrer |

Horizons : **12, 24 et 52 semaines**. Un algo qui tient 12 semaines et diverge à 52 est un algo cassé qu'on n'a pas assez torturé.

### Ce qu'on cherche activement à faire casser

1. Charges qui divergent (progression linéaire infinie)
2. Progression qui sort des fourchettes du §1
3. Décisions prises sur des variations d'e1RM sous le seuil de bruit (§2)
4. Prescriptions qui supposent une table %1RM universelle (§4)
5. Alertes qui s'allument sur le profil « Aurélien réel » (méta-règle)
6. Deload jamais déclenché, ou déclenché en permanence
7. Vocabulaire de risque sur des métriques non prédictives (§6)

---

## 10. Ce que ce référentiel ne couvre pas encore

À produire en **v2** avant de coder la couche correspondante :

- **Nutrition / TDEE** : Mifflin-St Jeor vs Katch-McArdle, facteurs d'activité, vitesses réalistes de prise/perte, faisabilité de la recomposition. *(Le chantier v343 a corrigé le double comptage calorique, mais les bornes n'ont pas été sourcées.)*
- **Standards de force absolus** par poids de corps / sexe — via DOTS / IPF GL Points, dérivables d'OpenPowerlifting comme au §8
- **Ratios S/B/D** — chantier §8
- **Spécificités femmes** : vitesses de gain, écart haut/bas du corps, cycle menstruel
- **Détraînement / retour au jeu** : cinétique de perte et de reprise
- **Readiness** : validité prédictive des questionnaires subjectifs

**Couvert depuis, mais à recalibrer :** la fenêtre muette (§1.5) est écrite, ses seuils reposent sur un seul utilisateur alors que les cinq profils sont maintenant en base — 1 221 séances, 28 103 séries.

---

## 11. Décision attendue

Avant que j'écrive une seule ligne d'algorithme, il me faut ton feu vert sur trois points :

1. **Les bornes du §1 sont-elles acceptées telles quelles ?** C'est la contrainte la plus dure : elle interdit à l'app de te promettre 200 au squat avant plusieurs années.
2. **L'interdit ACWR du §6 est-il accepté ?** Il implique de rétrograder une fonctionnalité existante du registre alerte au registre observation.
3. **Le chantier OpenPowerlifting du §8** — on le lance avant les algos (il alimente les bornes de ratios) ou après ?

---

### Sources principales

- Latella C. et al. (2024). *Sports Medicine* 54:753-774. DOI 10.1007/s40279-023-01962-6
- Ferrari L. et al. (2025). *Sports Medicine – Open*. DOI 10.1186/s40798-025-00903-z
- Latella C. et al. (2022). *Med Sci Sports Exerc* 54(5):841-850
- Nuzzo J.L., Pinto M.D., Nosaka K., Steele J. (2023). *Sports Medicine*. PMID 37792272
- Pelland J.C., Remmert J.F., Robinson Z.P., Hinson S.R., Zourdos M.C. (2025). *Sports Medicine*. DOI 10.1007/s40279-025-02344-w
- Remmert J. et al. (2025). *SportRxiv* — per-session volume
- Robinson Z.P. et al. (2024). *Sports Medicine*. DOI 10.1007/s40279-024-02069-2 — proximity to failure
- Impellizzeri F.M. et al. (2020). *IJSPP* 15(6):907 — ACWR pitfalls
- Impellizzeri F.M. et al. (2019). *SportRxiv* — demande de rétractation figure ACWR
- Bell L. et al. (2022). *Front Sports Act Living* 4:1073223 — deload, perceptions coachs
- Rogerson D., Nolan D. et al. (2024). *Sports Medicine – Open*. PMID 38499934 — pratiques de deload
- Coleman M. et al. (2024). *PeerJ* 12:e16777 — deload 1 semaine
- Steele J. et al. (2017) — prédiction des reps à l'échec
- Refalo M.C. et al. (2023). *JSCR* — exactitude RIR intra-série
- Zourdos M.C. et al. (2016). *JSCR* 30(1):267-275 — échelle RPE/RIR
- Cooke D.M. et al. (2019). *JSCR* 33(3):890-895 — variation reps au squat
- LeSuer D.A. et al. (1997) — validité des équations 1RM sur SBD
- Reynolds J.M. et al. (2006) — exactitude prédiction 1RM selon le nombre de reps
- Grgic J. et al. (2020) — fidélité test-retest du 1RM, revue systématique
- Androulakis-Korakakis P. et al. (2021). *Front Sports Act Living*. DOI 10.3389/fspor.2021.713655 — dose minimale efficace
- Barbell Medicine — synthèses « Strength Standards » et « Novice/Intermediate/Advanced »
- Stronger by Science / MASS — revue Zourdos de Nuzzo et al.
