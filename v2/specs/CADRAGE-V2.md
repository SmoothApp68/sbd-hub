# Cadrage TrainHub v2 — décisions fondatrices

**Date :** 23 août 2026
**Statut :** validé par Aurélien en session vocale.
**Portée :** ce document prime sur les autres en cas de contradiction. Il fixe *pour qui* on construit et *ce que le système a le droit d'affirmer*. Les autres documents fixent *les bornes chiffrées*.

---

## 1. La cible

**Le pratiquant assidu de musculation, sans coach.** Quelqu'un qui s'entraîne régulièrement, qui charge une barre, qui progresse, et qui n'a personne pour lire ses données.

**Pas le compétiteur de powerlifting.** Il a déjà un coach. Ce n'est pas un marché à prendre.

Conséquence directe : toute donnée de référence issue de compétiteurs est suspecte par défaut. Elle n'est utilisable que si la grandeur mesurée est indépendante du niveau.

### Ce que ça invalide et ce que ça garde

| Objet | Statut | Raison |
|---|---|---|
| **Ratios** (S/B, S/D) | ✅ **Gardé** | Un rapport entre deux mouvements dépend de la morphologie et du pattern d'entraînement, presque pas du niveau. Transférable à un non-compétiteur. |
| **Force absolue, totaux, DOTS** | ❌ **Rétrogradé** | Population inadaptée. Vérifié : aucune tranche « douce » n'existe dans OpenPowerlifting (premières compétitions = seulement −5 % vs pics de carrière). Démoralisant et hors sujet. |
| **Bornes de progression** (§1 référentiel) | ✅ Gardé | Issues d'études longitudinales sur pratiquants, pas de classements de compétition. |
| **Bornes d'instrument** (e1RM, RIR, reps/%1RM) | ✅ Gardé | Ce sont des propriétés de la mesure, pas de la population. |

### Post-mortem de la dérive

Le chantier OpenPowerlifting a été mené sur des compétiteurs parce que la donnée était disponible et propre — pas parce qu'elle correspondait à la cible. Le rapport signalait lui-même le biais de population sans en tirer la conclusion.

C'est **exactement** le mécanisme du chantier Coach v329→v343 : calibrer sur une population, appliquer à une autre. Le fait que ça se soit reproduit une fois le diagnostic posé montre que la vigilance ne suffit pas — d'où ce document.

**Règle :** avant toute table de référence, nommer la population qui l'a produite et vérifier qu'elle ressemble à la cible.

---

## 2. Périmètre : musculation uniquement, et pourquoi

Question posée : élargir au bien-être, aux cours collectifs, au pilates, voire à la randonnée / course / escalade ?

**Décision : non pour l'instant, et pas pour une raison de priorité.**

Le moteur de l'app apprend de **séries chargées et répétées**. Le pilates et les cours collectifs n'ont ni charge, ni série, ni progression comparable — l'algo n'aurait littéralement rien à manger. Le résultat ne serait pas une app plus large, mais une app dont la moitié est muette.

Randonnée, course et escalade sont différents : il y a bien charge et progression, mais ce sont d'autres modèles physiologiques, exigeant un référentiel scientifique entièrement distinct.

**Positif :** la musculation classique est un public énorme, qui mesure des charges, qui progresse, et qui est mal servi. Le moteur fonctionne déjà pour lui.

---

## 2 quater. Un test ne prouve rien si l'environnement rend les cas équivalents

Doctrine dégagée le 10/09/2026, après **trois occurrences du même piège en deux jours**.

| Occurrence | Ce que le banc rendait indistinguable |
|---|---|
| Fuseau horaire | Runner en UTC : `getDay()` valait `getUTCDay()`. Le test qui protégeait le rangement par jour passait sans rien prouver |
| Pile d'historique profonde | Sur navigateur de bureau, il reste toujours des entrées sous celles de l'app : « ancre posée » et « ancre absente » donnaient le même résultat |
| Réinstallation de l'ancre | Même cause : sur pile profonde, la deuxième absorption réussit que l'ancre soit réinstallée ou non |

Dans les trois cas, les tests étaient nombreux, verts, et **vérifiés par mutation du code**.
La mutation tombait bien. Le défaut n'était ni dans la rigueur ni dans la couverture.

> **Le banc était plus permissif que l'appareil réel, et rendait deux comportements
> équivalents.** Un test ne vaut que par la configuration dans laquelle il s'exécute.

**Ce qu'il faut exiger, en plus de la mutation :**

1. Identifier **la configuration où les deux comportements diffèrent** — pile vide, fuseau
   décalé, réseau coupé, écran étroit — et y faire tourner le test.
2. Vérifier l'**asymétrie** : une mutation doit faire tomber le test dans la configuration
   discriminante **et le laisser passer** dans la configuration permissive. Si les deux
   tombent, ou si aucun ne tombe, le banc n'est pas au point.

Ceci ne remplace pas la règle existante — **la vérification sur device réel reste
irremplaçable**. Elle la précise : quand un test et l'appareil se contredisent, c'est presque
toujours que le test tourne dans un environnement plus clément.

---

## 2 sexies. Les specs ne s'envoient plus, elles se lisent — arrêté le 12/09/2026

Les specs vivent dans `v2/specs/`. **Un prompt Claude Code n'en joint plus le corps** : il
donne le **delta daté** de la section qui change, et Claude Code va lire le reste dans le
dépôt.

> Le §7 bis.5 de `ECRAN-SAISIE-V1.md` a été **perdu cinq fois** par des envois en bloc.
> Rejouer une spec entière à chaque prompt, c'est réintroduire la version qu'on avait
> corrigée entre-temps.

Conséquences, dans les deux sens :

- **Le prompt** ne porte que ce qui est nouveau, daté, et dit où l'insérer.
- **Claude Code** commence par lire la spec dans `v2/specs/`, y intègre le delta, et
  **signale tout écart** entre ce que le prompt suppose et ce que le dépôt contient. Une
  section citée qui n'existe pas est un écart à rapporter, pas un détail à contourner.

---

## 2 septies. L'effort de vérification se calibre sur le risque — arrêté le 12/09/2026

Le §2 quater dit **comment** prouver : la configuration discriminante, et la mutation qui
tombe d'un côté et passe de l'autre. Il ne dit pas **combien**.

> **Le risque d'un chantier se mesure à ce qu'il touche.** Un chantier qui écrit en base —
> nouvelle colonne envoyée, nouvelle table écrite, file d'attente modifiée — mérite une
> reconnaissance longue et une revue adversariale. Un chantier d'affichage n'en a pas besoin.

**Et la campagne de mutations porte sur les lignes que le commit touche**, pas sur toute la
suite. Les autres ont déjà été prouvées à leur chantier ; les remuter à chaque fois coûte des
heures et n'apprend rien.

**Corollaire de forme : on ne rapporte qu'une fois tous les travaux terminés.** Au chantier
25, deux passages de revue tournaient encore quand la PR a été annoncée livrée — et ils ont
trouvé cinq défauts de plus, dont une garde qui ne couvrait qu'une branche sur deux de
`poser`. Une PR annoncée pendant qu'une vérification tourne est une PR annoncée trop tôt.

---

## 2 undecies. Câbler, jamais dupliquer — doctrine posée le 15/09/2026

> **Le principal, pour un correctif comme pour une fonctionnalité : ne pas créer du neuf à
> chaque fois, mais câbler ce qui existe et trouver les liens logiques — pour ne dupliquer ni
> une information, ni une règle.**

**Ce n'est pas une préférence de style. C'est la cause commune de tous les défauts sérieux de
la semaine du 9 au 15 septembre.**

| Défaut | La règle écrite deux fois |
|---|---|
| D2, D3 (ch. 34) | une liste de colonnes **écrites**, une autre **lues** — `user_id`, `ressenti`, `repos_s` effacés à la première correction |
| C1 (ch. 39) | `Seance.compter().travail` écrit au ch. 22, **lu par personne** — trois chiffres pour une même séance sur cinq écrans |
| ch. 38 → 39 | le fantôme corrigé, **la colonne à côté non** — les deux se contredisaient à l'écran |
| C2 (15/09) | « porte du volume » appliqué à la barre, **pas à la carte** — 25 contre 23 sur la même séance |
| D9 (ch. 38) | l'alignement par indice, présent à **deux** endroits de rendu |

**Et à l'inverse, ce qui a tenu est ce qui n'existait qu'une fois :**

- **`construireBlocs`** — l'écran de saisie appelle la fonction qui rend déjà le détail
  (ch. 27). *« Écrire un second entrelaceur, c'était garantir qu'ils divergent un jour ; là,
  ils ne peuvent pas. »*
- **La liste lue dérivée de la liste écrite** par construction (ch. 34), plus
  `verifierColonnes()` qui lève au démarrage si l'écart réapparaît.
- **Les deux entonnoirs de bornes** (ch. 36) — `nombreOuNul`/`entierOuNul` et
  `borne`/`seriesValides`, plutôt qu'un registre qui recopierait les CHECK de la base et
  dériverait le jour où une contrainte bouge.

### Les trois questions à se poser avant d'écrire

1. **Cette règle existe-t-elle déjà quelque part ?** Si oui, l'appeler — jamais la réécrire.
2. **Si je la corrige ici, y a-t-il un second endroit qui dit la même chose ?** C'est la
   question que les chantiers 38 et 39 ont ratée, deux fois de suite.
3. **Puis-je faire dériver plutôt que recopier ?** Une liste construite depuis une autre ne
   peut pas diverger ; deux listes maintenues à la main divergeront.

> **Corollaire, déjà appliqué** : une garde qui double une garde qui fait déjà le travail ne
> protège de rien et laisse croire l'inverse. Retirée à chaque fois qu'une mutation l'a
> désignée (ch. 27, 28, 30, 34, 36).

---

## 2 ter. Périmètre du moteur ≠ périmètre de l'affichage

Le §2 exclut du périmètre la randonnée, le pilates, l'escalade et la course. Cette exclusion
porte sur ce que le **moteur** lit, pas sur ce que l'**app** montre.

> **La v2 les affiche, le moteur ne les lit pas.**

Une séance de rando reste une séance de la personne : la masquer serait mentir sur son
historique. Mais elle n'entre ni dans le volume par muscle, ni dans le palier, ni dans le
compteur de stagnation — elle n'a pas de charge et fausserait tous les compteurs.

Mesuré au 10/09/2026 : **64 séances sur 1 221** relèvent de ce cas, détectées par
`exercises.charge = 'aucune'` et `mesure ∈ {temps, distance_temps}`. Une séance mixte
(« Rando avec Léa + Pull ») reste une séance de musculation à part entière.

---

## 2 bis. Règle permanente des prompts Claude Code

> **Le code v1 est une archive, jamais une base.** `app.js` et ses 31 000 lignes ne sont ni
> réparés, ni étendus, ni pris pour modèle. Tout se réécrit en v2.

**Tout prompt Claude Code doit le dire explicitement.** Le risque est concret et il s'est
déjà matérialisé : un prompt qui demande de chercher un motif dans le dépôt (`grep`) fera
remonter du code v1 — code mort, surfaces non câblées, gestionnaires à moitié écrits.
Claude Code peut alors légitimement croire qu'il doit **réparer** l'existant au lieu
d'écrire du neuf.

Formule à inclure dans chaque prompt, au voisinage de toute instruction de recherche :

> Le code v1 (`app.js`) est abandonné et ne sert que d'archive. Ce chantier s'écrit en v2.
> Le grep sert à **constater** l'existant, jamais à le réparer. Si tu trouves un
> gestionnaire v1 qui traite ce sujet, signale-le et ignore-le.

**Emplacement durable :** cette règle a vocation à vivre dans le `CLAUDE.md` du dépôt, pour
ne pas dépendre de sa répétition dans chaque prompt. Tant qu'elle n'y est pas, elle est
répétée dans chaque prompt sans exception.

---

## 2 quinquies. Ordre des chantiers de coaching — arbitré le 11/09/2026

Cet ordre remplace celui du §6, dépassé par l'avancement.

| # | Chantier | Pourquoi là |
|---|---|---|
| 1 | **Le moteur parle** — palier, cible, suggestion à l'écran | Tout le reste en dépend. L'app décrit aujourd'hui, elle ne conseille rien |
| 2 | **Écran de saisie** | La saisie produit les données prescrites, sans lesquelles le §9.1.4 du moteur ne peut pas être vérifié |
| 3 | **Entrée par exercice** (Progression) | Même maille que le moteur ; résout aussi « retrouver une séance ancienne » |
| 4 | **Ordre des exercices dans la séance** (§12 bis du moteur) | Raffinement de ce que le moteur lit. Sans valeur avant que le moteur parle |
| 5 | **Construction de programmes** | Suppose 1 à 4. L'ordre des exercices en est la première question |
| 6 | **Gamification** | Spec prête, mais demande une migration de tables |
| 7 | **Social et défis** | Son propre document l'exige en dernier |
| — | **Fatigue et temps de repos** | Bloqué : `validee_a` est NULL sur tout l'historique importé. S'ouvre avec les premières séances saisies |
| — | **Nutrition et TDEE** | Reporté explicitement par Aurélien |

**Fermés sans règle** : fréquence (§11.7 de la règle de volume) · état de démarrage
(§3.1 bis) · sélection et rotation d'exercices (§13.4 du moteur).

> **Le fil conducteur :** l'app sait aujourd'hui **montrer**. Le chantier 1 la fait
> **conseiller**. Les chantiers 4 et 5 la feraient **construire**. On ne saute pas d'étape :
> construire un programme sans savoir lire une séance produirait des recommandations sans
> fondement — exactement ce que la v1 faisait.

---

## 3. Ce que le système a le droit d'affirmer

### 3.1 Descriptif oui, prescriptif jamais (sur les données historiques)

Question posée : peut-on tirer des 1 221 séances la logique d'entraînement idéale — « Aurélien a le mieux progressé en 5 séances/semaine avec tel split » ?

**Techniquement possible. Scientifiquement indéfendable.** Deux raisons :

- **Facteurs confondus.** Un seul individu, une seule vie. Passer de 4 à 6 séances s'accompagne d'un changement d'alimentation, de sommeil, de programme, et d'une année d'expérience en plus. Impossible d'attribuer l'effet.
- **Fouille de données.** Sur trois ans, il existe des dizaines de découpages possibles. Certains sembleront brillants par pur hasard. Chercher « ce qui a marché » garantit de trouver quelque chose, y compris quand il n'y a rien.

**Ce qui est autorisé :**
1. **Descriptif assumé** — ce qui a été fait, quand, combien, et comment les barres ont bougé pendant ces périodes. Aucune causalité affirmée. Déjà précieux, jamais vu par l'utilisateur.
2. **Confrontation à la littérature** — la science ne valide pas le résultat, elle indique quel mécanisme est plausible. Exemple : Pelland 2025 montre que la fréquence n'a pas d'effet propre à volume égalisé. Donc si 6 séances semblent battre 4, l'explication probable est *plus de volume total*, pas un nombre magique.
3. **Convergence entre profils** — un même schéma chez Aurélien, Jordan et Léa, avec des vies et des corps différents, commence à ressembler à un signal.

**Interdit :** « fais 5 séances parce que ça a marché pour toi ». C'est un mensonge à l'air scientifique — le pire type.

### 3.1 bis Le moteur ne commente jamais l'assiduité — ajout du 10/09/2026

Le §3.1 interdit d'affirmer une causalité sur l'entraînement. **L'assiduité est un cas plus strict encore : le système n'en dit rien du tout.**

**Ce qui a produit cette règle.** En examinant les douze premières semaines des cinq profils, un motif frappant est apparu : jordan avait démarré à 5,3 séances par semaine active, puis était retombé à 2,9. Conclusion tirée trop vite — « un démarrage intense ne dure pas, il ne faut pas le récompenser ». **La vraie cause était la perte de son permis et de son emploi.** Elle n'est pas dans la base et n'y sera jamais.

C'est exactement l'argument du §2.1 du banc d'essai, transposé : un moteur qui interprète une baisse d'assiduité mesure la vie de la personne, pas son entraînement. Mais la portée est plus large que pour la charge, car sur l'assiduité les causes extérieures **dominent** — travail, transport, santé, famille — et l'app n'en voit aucune.

> **Ce motif est précisément celui qu'un modèle apprendrait comme « surestimation initiale ». Il aurait tort, et il aurait tort silencieusement.**

**Conséquence sur le démarrage.** Ce que les données montrent sans interprétation : ce qui distingue un début difficile n'est pas l'intensité mais **la part de semaines où l'on vient**. Quand ils viennent, alexis fait 3,0 séances par semaine au début et 3,2 ensuite ; lea 3,0 puis 3,1. Le volume par séance ne change pas.

| Profil | Semaines actives sur les 12 premières | Séances / semaine active — début | après |
|---|---|---|---|
| jordan | 12 / 12 | 5,3 | 2,9 |
| melodie | 10 / 12 | 2,6 | 2,0 |
| alexis | 6 / 12 | 3,0 | 3,2 |
| lea | 4 / 12 | 3,0 | 3,1 |
| aurel_br | **2 / 12** | 2,5 | **4,4** |

Et le contre-exemple décisif est aurel_br : **2 semaines actives sur ses 12 premières**, et le profil le plus assidu des cinq trois ans plus tard. Rien dans les données ne distingue, au moment où ça se joue, un démarrage lent d'un abandon.

**La forme retenue : une condition de silence, pas un module.**

L'« état de démarrage » n'est pas un module qui parle, ni un état affiché. C'est la formulation commune des seuils d'historique que chaque module possède déjà — 8 séances pour l'état d'un exercice, 12 semaines pour un muscle. Tant qu'un module n'a pas de quoi calculer, il se tait, et le dit factuellement quand on l'interroge (« pas assez de séances », §3.3 de l'écran de saisie).

Pendant cette période, l'utilisateur a le journal de bord : ses séances, ses charges précédentes, sa progression. Le coaching s'allume de lui-même quand il y a de quoi.

**Portée : permanente, pas seulement au démarrage.** Le moteur ne commente pas davantage une baisse d'assiduité chez un compte de trois ans. Commenter l'assiduité, c'est quitter la musculation pour la motivation — un autre métier, celui des notifications culpabilisantes.

**Leçon de méthode, à garder.** Cinq profils suffisent à calibrer un seuil technique. Ils ne suffisent pas à interpréter un comportement. Sur les charges, la donnée peut corriger une hypothèse ; sur les vies, non.

### 3.2 Le vrai gisement : les seuils de détection

Plutôt que chercher le programme idéal, utiliser les 1 221 séances pour répondre à : **combien de séances faut-il avant de pouvoir affirmer qu'un utilisateur progresse réellement, plutôt que de bouger dans le bruit ?**

C'est mesurable sur les données réelles, et c'est précisément ce dont l'algo a besoin pour cesser de crier au loup.

---

## 4. Les trois niveaux d'apprentissage

Trois choses ressemblent à « le système s'auto-alimente » et n'ont rien à voir. Les distinguer est structurant.

### Niveau 1 — apprendre l'individu ✅ à faire, sans réserve

Le système apprend **les paramètres de l'utilisateur**, pas les lois de l'entraînement :
- combien de reps il sort réellement à 70 % **par exercice** (la littérature donne 6 à 28 selon les individus — référentiel §4)
- sa vitesse de progression réelle
- son volume habituel
- son niveau de bruit

C'est de la **mesure**, pas de l'inférence. Incassable.

**Effet immédiat :** une alerte de volume ne se compare plus à une norme imaginaire mais au volume réel des 3 derniers mois de la personne. C'est la solution structurelle au « mur de rouge » — et elle rend la question du seuil universel caduque.

### Niveau 2 — apprendre la population ✅ à faire, avec réserve énoncée

Recalibrer les seuils sur les 5 utilisateurs réels plutôt que sur un pratiquant fantôme. Réserve honnête : 5 personnes aux profils proches, donc les seuils colleront à ces 5. **Coller à 5 vrais utilisateurs reste infiniment mieux que coller à personne.**

### Niveau 3 — apprendre « ce qui marche » ⚠️ piège, ne pas faire

Dès que l'app prescrit, elle n'observe plus des données neutres : elle observe **les conséquences de ses propres consignes**. Si elle prescrit 5 séries, que l'utilisateur en fait 5 et progresse, elle conclut que 5 séries marchent — sans jamais avoir observé 3 ni 8, puisqu'elle a cessé de les proposer.

Le système ne s'optimise pas, **il se confirme**. Boucle de rétroaction fermée.

En sortir exigerait de faire varier délibérément, en aveugle, sur un même utilisateur. Faisable en théorie ; à 5 utilisateurs, sans intérêt.

---

## 5. La table de prédictions — décision structurante

**L'idée :** au lieu d'apprendre quel entraînement est le meilleur, le système apprend **à quel point il a raison**.

**Mécanique :** chaque fois qu'un module produit une estimation — charge prescrite, reps attendues, progression prévue, e1RM — il l'écrit avec sa date, son module d'origine et sa version. Plus tard, on compare à ce qui s'est réellement produit.

**Résultat après quelques mois :** un taux d'erreur mesuré, **module par module**. « L'estimation de charge est juste à ±3 kg au couché, ±12 kg au squat. » On sait quel bloc de coaching raconte n'importe quoi — parce que c'est mesuré, pas parce qu'on l'a senti sur l'écran.

**Pourquoi c'est décisif :** c'est exactement ce qui a manqué au chantier Coach. Les 4035 kcal, le mur de rouge, les ratios « Critique » — personne ne savait qu'ils étaient faux jusqu'à la vérification sur device. Avec cette table, l'app le sait avant l'utilisateur.

**Coût :** quasi nul, une table.

**Contrainte :** doit être prévue **dès le schéma**. Ce que le système pourra apprendre plus tard se décide maintenant.

---

## 6. Conséquence sur l'ordre des chantiers

Le schéma v2 n'est pas de la plomberie : **il fixe le plafond de ce que le système pourra jamais apprendre**. Une table de séries normalisée rend calculable la table de charges individuelle du §4 ; une table de prédictions rend mesurable la justesse de l'algo. Aucune des deux ne se rattrape après coup sans migration.

**Ordre retenu :**

1. **Schéma v2** (tables de séries + table de prédictions) — priorité
2. **Bornes nutrition / TDEE** — dernier trou du référentiel, recherche pure
3. **Banc d'essai Python** — après clôture du référentiel

---

## 7. Note de forme

Les visuels sont demandés et pertinents : l'essentiel de ce qui est manipulé (distributions, positions relatives, seuils) se comprend en une seconde sur un graphique et mal en texte. **Illustrer par défaut** dès qu'il s'agit d'une distribution ou d'un flux.

Vocabulaire : « percentile » n'est pas compris tel quel. Formulation à privilégier — *« sur 100 pratiquants alignés du plus faible au plus fort, tu es le Nᵉ »*.
