# Règle de diagnostic de volume — v2

**Date :** 2 septembre 2026
**Remplace :** `REGLE-VOLUME-V1.md` (23 août 2026)
**Statut :** figée. Sections 1 à 6 inchangées depuis v1. Sections 7 à 9 amendées ou nouvelles.
**Portée :** l'écran volume et tout signalement qui en découle. Ne concerne **pas** la prescription de charge, qui relève du modèle charge/reps (chantier distinct).

**Ce qui change par rapport à v1 :**
- §9 nouveau — le tonnage, ce qu'il mesure et ce qu'il ne mesure pas.
- §7 corrigé — les cinq profils sont désormais en base.
- §10 nouveau — les amplitudes partielles, cas qui n'existait pas en août.

**Ce qui change le 10/09/2026 — calibration sur les cinq profils, §11 réécrit :**
- **La fenêtre se compte en semaines actives**, pas en semaines de calendrier.
- **Reset de la référence après 4 semaines vides**, valeur issue de la littérature sur le désentraînement.
- **Persistance ramenée de 3 fenêtres à 2** — 3 rendait le moteur quasi muet chez deux profils sur cinq.

---

## 1. La règle, en cinq lignes

| Élément | Valeur |
|---|---|
| **Unité comptée** | la série de travail, pondérée **1** en muscle primaire, **0,5** en secondaire, **0,25** en stabilisateur (§1 bis) |
| **Fenêtre** | **3 semaines actives glissantes** — les semaines sans aucune séance ne comptent pas |
| **Référence** | la **propre fourchette historique** de l'utilisateur, jamais un seuil universel |
| **Reset de la référence** | **4 semaines consécutives sans séance** — on ne compare plus à l'avant |
| **Déclenchement** | uniquement si l'écart dure **2 fenêtres consécutives** |
| **Registre** | **descriptif**. Aucune couleur d'alarme, aucun verdict |

---

## 1 bis. Le poids d'un muscle — trois classes (10/10/2026, v2_069)

Une série de travail compte pour un muscle selon **ce que ce muscle fait** dans l'exercice. Trois listes au catalogue,
trois poids, **une seule table** (`THSemaine.POIDS_DES_MUSCLES`, lue par `THSemaine.musclesPonderes`) : le coach
(`volumeParMuscle`, `apportsParMuscle`) et le jeu la lisent ; le générateur v2 la lira :

| Classe | Colonne | Poids | Critère |
|---|---|---|---|
| **Principal** (moteur) | `muscles_primaires` | **1** | il produit le mouvement, sur toute son amplitude |
| **Secondaire** (synergiste) | `muscles_secondaires` | **½** | il aide le mouvement, en raccourcissant et en s'allongeant |
| **Stabilisateur** | `muscles_stabilisateurs` | **¼** | il tient la position ou change peu de longueur (gainage, prise, maintien du dos) |

- **Pourquoi ½** : la méta-analyse de Pelland 2024 compte la série « fractionnée » d'un synergiste pour ½, et c'est ce
  comptage qui prédit le mieux la croissance.
- **Pourquoi ¼** : un muscle qui tient une position isométrique grossit peu sous une charge qui ne l'allonge pas. Au
  squat, les ischio-jambiers changent à peine de longueur et ne grossissent pas (Kubo 2019 : moins de 1 %). Le compter
  ½ gonflait leur volume, le compter 0 effaçait un travail réel. Le quart est un choix prudent, pas une mesure.
- **Ce que la mesure a fait monter** : au squat barre (et ses variantes avec pause, élastique et pin), les fessiers et les
  adducteurs deviennent **principaux** (Kubo 2019, squat complet : +6,7 % et +6,2 %, du même ordre que les quadriceps).
- **Effet mesuré sur l'historique réel** (5 profils) : de 0,7 à 2,7 % des décisions du coach changent (63 sur 3 055
  pour Aurélien). Le jeu : un niveau de moins au plus sur un muscle, sauf le Tronc (jusqu'à deux de moins), qui avait
  reçu les abdominaux à ½ avec v2_067 et les garde à ¼.
- **Un polyarticulaire** compte ses muscles **dans les trois listes** (au moins 3) : aucun exercice ne change de classe.
- La série de plus (MOTEUR §14.6) regarde toujours les seuls muscles **principaux** ; les chauffes (« premier sur ses
  muscles », MOTEUR §9.15) aussi.

---

## 2. Pourquoi pas un seuil universel

Le référentiel §5.2 autorise un signalement de volume insuffisant seulement « très en dessous de ~10 séries par semaine et par muscle ». Testé sur le profil réel d'Aurélien, trois derniers mois :

| Muscle | Séries dures mesurées / sem. |
|---|---|
| pectoraux | 9,5 |
| deltoïde antérieur | 7,0 |
| triceps | 6,7 |
| quadriceps | 5,8 |
| grand dorsal | 5,7 |
| biceps | 4,3 |

**Quasiment tous les muscles seraient passés sous le seuil** — et l'app aurait annoncé un manque de volume à quelqu'un qui s'entraîne 20 fois par 28 jours. C'est le mur de rouge, à l'identique.

**Cause :** 36 % des séries sortent du domaine de validité du modèle charge/reps (isolation en poulie, charges légères). Elles sont réelles, mais non jugeables. Les exclure du décompte revient à effacer un tiers de l'entraînement.

> **Décision : le décompte porte sur toutes les séries de travail, sans filtre de difficulté.** Le modèle charge/reps ne sert pas au comptage de volume. Deux outils, deux métiers.

---

## 3. Pourquoi une fenêtre de 3 semaines

Variabilité naturelle du volume hebdomadaire par muscle, mesurée sur 2 ans :

| Fenêtre | Bruit restant |
|---|---|
| 1 semaine | 63 % |
| 2 semaines | 52 % |
| **3 semaines** | **48 %** |
| 4 semaines | 46 % |
| 6 semaines | 42 % |

Le coude est à 3 semaines. Au-delà, lisser davantage ne gagne presque rien tout en retardant la détection.

**Point capital :** même à 6 semaines il reste 42 % de variation. **Ce n'est pas du bruit de mesure, c'est la vraie variabilité d'entraînement d'Aurélien.** Elle ne disparaîtra jamais. Tout seuil qui ignore cette amplitude produira des faux signaux en permanence.

Exemple concret — pectoraux : médiane 17 séries/semaine, mais une semaine sur dix tombe à 8 et une autre monte à 26. **Passer de 17 à 10 est parfaitement normal.**

---

## 4. Pourquoi la persistance est obligatoire — le piège du percentile

Erreur commise puis corrigée pendant ce chantier, à ne pas refaire :

> **Un seuil défini comme un percentile de l'historique de la personne se déclenche mécaniquement au taux qu'on lui fixe.** Le p10 attrape 10 % des observations. Toujours. Par construction. Il ne peut pas être rare.

Mesuré sur 1 751 observations (17 muscles × 2 ans) :

| Règle | Signalements par semaine |
|---|---|
| Hors fourchette p10–p90, une seule fenêtre | **3,39** |
| Sous le p10, **3 fenêtres consécutives** | **0,50** |

De 3,4 à 0,5 — un signalement toutes les deux semaines, tous muscles confondus. C'est la persistance qui rend la règle vivable, pas la sévérité du seuil.

**Généralisation à retenir pour tous les futurs seuils :** un seuil relatif à soi-même ne contrôle pas son taux de déclenchement. Seule l'exigence de durée le contrôle.

---

## 5. Ce qui reste interdit

| Interdit | Source |
|---|---|
| Alerte « volume excessif » | Référentiel §5.2 — `HORS-LITTÉRATURE`, aucun seuil de bascule démontré |
| MEV / MAV / MRV affichés comme nombres durs | Référentiel §5.2 — heuristique de coach, jamais mesurée |
| Vocabulaire de risque sur le volume | Référentiel §6 |
| Prescrire un volume « parce que ça a marché » | Cadrage §3.1 — facteurs confondus |
| Alerte « muscle non travaillé » | décision produit antérieure, inchangée |
| **Comparer le tonnage de deux exercices différents** | **§9 ci-dessous, mesuré** |

---

## 6. Comment ça s'affiche

Le volume par muscle se montre avec **la fourchette habituelle de la personne en fond**, et sa position dedans. Pas de couleur, pas de note, pas de verdict.

Quand la condition de persistance est remplie, une mention neutre, du type :

> *« Ton volume sur les pectoraux est en dessous de ton habitude depuis trois semaines. »*

Aucune consigne ne l'accompagne. L'app constate, l'utilisateur décide.

---

## 7. Limites assumées — *corrigé le 02/09/2026*

- ~~La règle a été calibrée sur un seul utilisateur.~~ **Fait le 10/09/2026 — voir §11.** Les cinq profils ont servi à recalibrer la fenêtre, le reset et la persistance.
- Un utilisateur **nouveau** n'a pas d'historique : la règle est muette pendant ses premières semaines. C'est voulu — mieux vaut se taire que comparer à un inconnu. Le compte `alex` est le cas de test réel : il n'a jamais utilisé Hevy et démarrera à froid.
- Le décompte ignore la difficulté des séries. Un utilisateur qui garderait le même nombre de séries en les faisant beaucoup plus facilement ne serait pas détecté. **C'est le trou connu**, à combler seulement quand le modèle charge/reps couvrira l'isolation.

---

## 8. Statut du modèle charge/reps — ce qu'il fait et ne fait pas

Écrit en base le 23/08/2026, 60 exercices, `algo_version = 'charge_reps_v1'`.

**Validé :** maximum estimé contre barres réelles — couché 138,2 vs 140, squat 143,9 vs 145, soulevé 178,1 vs 170. Sur les séries marquées à l'échec, marge résiduelle médiane 0,99 rep contre 2,0 pour une approche e1RM classique.

**Non validé :** sa capacité à **prédire**. Tout ce qui précède est un ajustement sur le passé, constaté sur le passé. Prochain chantier.

**Hors périmètre :** le comptage de volume. Ce document.

---

## 9. Le tonnage — nouveau, 02/09/2026

v1 ne disait rien du tonnage. Ce silence a laissé prospérer une distorsion majeure, mesurée ici pour la première fois.

### 9.1 Ce qui a été mesuré

Tonnage moyen produit par **une seule série**, sur l'historique complet d'Aurélien :

| Exercice | Séries | Kg par série |
|---|---|---|
| Presse mollets | 107 | **3 282** |
| Presse à cuisses | 270 | 2 150 |
| Extension mollets debout | 276 | 1 684 |
| Adduction hanche | 423 | 730 |
| Soulevé de terre (barre) | 436 | 590 |
| Développé couché (barre) | 723 | 542 |
| Squat (barre) | 615 | 525 |
| Extension jambes | 430 | 523 |

**Une série de mollets produit six fois plus de tonnage qu'une série de squat.**

Conséquence sur les totaux :

| | Séries | Part du tonnage |
|---|---|---|
| Mollets (2 exercices) | **383** | **10,8 %** |
| Squat + soulevé de terre | **1 051** | **7,7 %** |

Trois fois moins de séries, et davantage de tonnage. Pour une amplitude d'environ cinq centimètres.

### 9.2 La règle

> **Le tonnage ne mesure pas l'effort. Il mesure surtout le choix des exercices.**

| Usage | Statut |
|---|---|
| Un exercice donné, une personne, dans le temps | **Valide.** L'amplitude est constante, la comparaison a un sens |
| Comparer deux exercices entre eux | **Interdit** |
| Total de séance ou de semaine comme base de jugement | **Interdit** |
| Total de séance ou de semaine comme repère descriptif | **Toléré**, sous la condition du §9.3 |

### 9.3 Le cas des ~75 000 kg par semaine

Ce chiffre figure dans le cadrage comme marqueur de stabilité. Il reste affichable, mais **toute variation doit être attribuée au mélange d'exercices avant d'être lue comme une variation d'entraînement**.

Exemple : ajouter deux séries de presse mollets par séance fait monter le total hebdomadaire d'environ 10 % sans qu'une seule série supplémentaire de squat ait été faite. Un moteur qui lirait cette hausse comme une progression se tromperait.

C'est la raison pour laquelle les alarmes MRV du Coach v1 se déclenchaient : elles additionnaient des grandeurs incomparables.

### 9.4 Ce que cette règle évite d'inventer

Aucun coefficient d'amplitude par exercice n'est nécessaire, et aucun ne doit être créé. Il faudrait le fixer arbitrairement pour chacun des 206 exercices du catalogue, sans aucune donnée pour le justifier. **Compter les séries dissout le problème au lieu de le modéliser.**

---

## 10. Les amplitudes partielles — nouveau, 02/09/2026

Cas apparu avec la création de la famille rack pull, pin squat et développé aux planches (migration v2_030).

| Cas | `compte_tonnage` | Motif |
|---|---|---|
| Amplitude partielle — rack pull, pin squat, développé aux planches | **oui** | La barre se déplace. Du travail est produit |
| Maintien supramaximal — walkout, maintien lourd | **non** | La barre ne se déplace pas. Le tonnage serait entièrement fictif |

La distinction n'est pas l'amplitude, qui est une affaire de degré, mais **le déplacement, qui est une affaire de tout ou rien**.

Et par le §9.2, une amplitude partielle n'est **jamais** comparée en tonnage à son exercice parent. Un rack pull se compare à un rack pull. Jamais à un soulevé de terre complet.

### Cas d'école — Jordan, 30 janvier 2026

Quatre séries à 220–260 kg, saisies sous « squat sumo », annotées « Rack pull », et qui étaient en réalité des pin squats à taquets très hauts. Ni le nom ni la note n'étaient exacts ; il a fallu demander à Jordan.

Ces quatre séries pèsent 2 340 kg, soit près d'un cinquième d'une de ses séances typiques (12 243 kg), pour une course d'une quinzaine de centimètres.

**Le tonnage est compté quand même**, parce que l'exclure aurait corrigé un cas en laissant intacts tous les autres exercices à faible amplitude — à commencer par les mollets, qui pèsent bien plus lourd.

---

## 11. Calibration sur les cinq profils — 10/09/2026

Les trois points laissés ouverts par la v2 sont tranchés. Toutes les mesures portent sur les 1 221 séances en base, comptage par muscle via `exercises.muscles_primaires` / `muscles_secondaires`.

### 11.1 Les profils ne sont pas comparables en volume, mais le sont en variation

| Profil | Muscles suivis | Volume moyen / semaine active | Variation d'une semaine à l'autre |
|---|---|---|---|
| aurel_br | 18 | 14,2 séries | **0,64** |
| jordan | 16 | 13,7 | 0,60 |
| alexis | 17 | 8,7 | 0,59 |
| lea | 17 | 6,8 | **0,64** |
| melodie | 17 | 5,9 | 0,57 |

Le volume varie d'un facteur 2,4 entre le premier et le dernier. **La variation relative, elle, est la même pour tous — 0,57 à 0,64.** Chacun oscille d'environ 60 % autour de sa propre moyenne, quels que soient son niveau, sa fréquence et son objectif.

> **Confirmation rétroactive du §2** : un seuil universel serait faux pour quatre profils sur cinq ; la fourchette relative est identique pour les cinq. La référence personnelle n'était pas une prudence, c'était la seule option juste.

Conséquence sur la fenêtre : avec 60 % de variation, un muscle à 14 séries oscille couramment entre 6 et 22 d'une semaine à l'autre. **Une semaine isolée ne dit rien, et cela vaut pour les cinq.** La fenêtre de 3 semaines tient sans paramètre par personne.

### 11.2 Le muscle est le bon niveau d'agrégation — vérifié

Objection examinée : la sélection d'exercices change tout le temps (on retire un exercice, on en substitue un autre), ce qui pourrait polluer le décompte par muscle.

| Profil | Variation par muscle | Variation par exercice | Semaines actives où l'exercice est absent |
|---|---|---|---|
| aurel_br | 0,64 | **1,93** | 68 % |
| lea | 0,64 | 1,66 | 66 % |
| alexis | 0,59 | 1,45 | 61 % |
| jordan | 0,60 | 1,34 | 47 % |
| melodie | 0,57 | 1,32 | 58 % |

**L'exercice est trois fois plus instable que le muscle.** Même en ne retenant que les exercices pratiqués au moins 12 semaines, un exercice donné est absent de **deux semaines actives sur trois**. La rotation n'est pas un artefact, c'est le régime normal — et l'agrégation par muscle est précisément ce qui l'absorbe.

Une réserve subsiste : une substitution peut déplacer du volume entre muscles voisins (pectoraux ↔ deltoïde antérieur). L'effet est noyé — sinon la variation par muscle dépasserait 0,60.

**Note :** cette objection ne concernait pas le tonnage. Le décompte porte sur des **séries**, pas des kilos ; remplacer une poulie par un autre matériel ne change pas le compte. C'est la raison d'être de la décision du §2 et du §9.

### 11.3 La fenêtre se compte en semaines actives

Distribution des semaines, du début à la fin de l'historique :

| Profil | Semaines à zéro séance | Médiane des semaines actives |
|---|---|---|
| aurel_br | 20 % | 5 séances |
| jordan | 16 % | 3 |
| lea | **43 %** | 3 |
| alexis | 34 % | 3 |
| melodie | **45 %** | 2 |

Léa et Mélodie ne s'entraînent pas moins que les autres : elles s'entraînent **par périodes**. Quand elles sont actives, elles font 3 et 2 séances par semaine. Une moyenne calendaire (1,8 et 1,2 séance/semaine) mélange l'entraînement et l'absence d'entraînement et ne décrit personne.

> **La fenêtre glissante se remplit de semaines actives, sans exiger qu'elles soient consécutives.** Une semaine vide n'entre pas dans la fenêtre et ne la casse pas.

### 11.4 Reset de la référence — 4 semaines vides

Les interruptions se répartissent en deux populations nettement séparées : **61 % des trous font 1 ou 2 semaines** (vacances, semaine chargée), et le reste sont de vrais arrêts — jusqu'à 18 semaines chez aurel_br, **33 chez lea**. Quasiment rien entre 3 et 4 semaines.

Deux contraintes opposées se sont présentées :

- Un seuil court remettait le compteur à zéro en permanence chez **alexis**, qui a enchaîné cinq coupures de 3 à 6 semaines entre novembre 2025 et mars 2026 — non par choix de programmation, mais parce qu'il peinait à s'installer dans l'habitude. Un seuil à 3 semaines l'aurait rendu invisible au moteur pendant toute sa phase de démarrage, c'est-à-dire quand il en avait le plus besoin.
- Un seuil long contredit la physiologie. La littérature sur le désentraînement converge : **la force se maintient jusqu'à 3-4 semaines sans entraînement puis se perd progressivement**, la masse musculaire commence à diminuer après 3 semaines, et des réductions de force maximale apparaissent en 3 à 5 semaines d'arrêt. Après huit semaines, comparer au volume d'avant n'a plus de sens physiologique.

> **Résolution : les deux contraintes ne portent pas sur le même objet.** Le seuil de 4 semaines réinitialise la **référence** — on ne compare plus à un état perdu. Il n'interrompt pas le **suivi** : la fenêtre continue de se remplir en semaines actives. Alexis reste suivi, personne n'est comparé à ce qu'il n'a plus.

### 11.5 Persistance ramenée à 2 fenêtres

Épisodes où la moyenne sur 3 semaines actives passe sous le premier quartile historique du muscle :

| Profil | Épisodes | Durée moyenne | Part atteignant 3 fenêtres |
|---|---|---|---|
| aurel_br | 113 | 3,2 | **53 %** |
| lea | 36 | 2,7 | 47 % |
| jordan | 35 | 2,4 | 46 % |
| alexis | 38 | 1,7 | **21 %** |
| melodie | 20 | 1,8 | **20 %** |

La persistance de 3 fenêtres avait été taillée sur aurel_br. Chez alexis et melodie, **une baisse sur cinq seulement l'atteint** : le moteur leur parlerait quatre à sept fois par an contre une trentaine pour aurel_br. Trois fenêtres de 3 semaines actives font 9 semaines actives, soit près de cinq mois de calendrier chez melodie — une baisse réelle a le temps de se corriger avant d'être vue.

> **Persistance : 2 fenêtres consécutives.** Le taux de déclenchement s'aligne autour de la moitié des épisodes chez les cinq, sans paramètre par personne. Deux fenêtres font 6 semaines actives de baisse continue, au-delà du seuil où les pertes commencent.

### 11.6 Réserves à garder en tête

**Pas de mesure de fausse alarme.** Contrairement au compteur de stagnation, une baisse de volume n'a pas de vérité observable — rien dans les données ne dit qu'elle aurait dû être signalée. La calibration repose sur la **cohérence entre profils**, pas sur une précision mesurée. C'est un argument plus faible, et il doit rester visible.

**Les études citées portent sur l'arrêt complet, pas sur une baisse.** Une réduction de volume n'est pas un arrêt : le maintien des acquis demande bien moins que la progression, et une réduction de fréquence de 66 % a suffi à maintenir les gains jusqu'à 18 semaines dans un protocole voisin. Nos seuils sont donc calibrés sur la **borne prudente** — ils signalent plus tôt que la physiologie ne l'exigerait strictement.

### 11.7 La fréquence n'est pas un levier — chantier abandonné

Décision du 10/09/2026, prise avant d'ouvrir le chantier plutôt qu'après l'avoir calibré.

**Littérature.** À volume hebdomadaire égalisé, la fréquence n'a pas d'effet propre sur l'hypertrophie. Deux séances par muscle et par semaine battent une séance, mais l'explication la mieux soutenue est que le volume total monte quand on fractionne — pas que la répartition ait une vertu propre. En force, un petit effet résiduel subsiste, attribué à la pratique technique du mouvement ; il est faible et ne concerne pas la cible de l'app.

**Nos données.** Deux mesures du §11 la condamnent directement :
- La variation du volume hebdomadaire par muscle est de **0,60 chez les cinq**. Une recommandation de fréquence serait noyée sous ce bruit avant d'être formulée.
- Un exercice donné est absent de **deux semaines actives sur trois** (§11.2). Un muscle est déjà sollicité de façon très irrégulière ; prescrire un rythme hebdomadaire par muscle n'a pas de prise sur cette réalité.

**Doctrine.** Une consigne de fréquence est **structurellement prescriptive** : elle impose une organisation de la semaine, c'est-à-dire la vie de la personne. Le moteur peut dire « ce muscle a reçu moins que ton habitude » — factuel, et déjà couvert par cette règle. Il ne peut pas dire « répartis autrement » sans connaître les contraintes qui ne sont pas dans la base.

> **La fréquence est une conséquence du volume, pas un levier.** Rien à calibrer, rien à afficher. Ne pas rouvrir sans élément nouveau.

**L'état de démarrage — traité et clos le 10/09/2026, voir §3.1 bis du cadrage.** Le cas d'alexis l'avait révélé : chez quelqu'un qui peine à installer l'habitude, le sujet n'est pas le volume par muscle, c'est de venir. Conclusion retenue : ce n'est pas un module mais **une condition de silence**. Le seuil d'historique de cette règle (12 semaines par muscle) en fait déjà partie. Et le moteur ne commente jamais l'assiduité, ni au démarrage ni ensuite.

---

## 12. Ce qui reste à faire

1. ~~Recalibrer la persistance sur les cinq profils~~ — **fait (§11.5) : 2 fenêtres.**
2. ~~Vérifier que la fenêtre de 3 semaines tient chez les autres profils~~ — **fait (§11.1) : oui, la variation relative est identique chez les cinq.**
3. Décider si le total hebdomadaire de tonnage est affiché du tout, ou seulement par exercice.
4. ~~Chantier « état de démarrage »~~ — **clos : condition de silence, pas un module** (§3.1 bis du cadrage).
5. ~~Chantier « fréquence »~~ — **abandonné avant ouverture** (§11.7).
