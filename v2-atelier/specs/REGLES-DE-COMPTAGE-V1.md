# Règles de comptage — v1

**Date :** 23 août 2026
**Statut :** décisions prises en session vocale avec Aurélien.

> ⚠️ **En-tête corrigé le 10/09/2026.** Ce document disait « rien n'est écrit en base ».
> **C'est faux depuis le 28 août.** Les muscles primaires et secondaires, `coef_pdc`,
> `masse_depart_kg` et la table `body_weight_log` (116 lignes) existent tous.
>
> **Les noms de colonnes de ce document étaient en anglais et sont faux.** Ils
> précèdent l'écriture du schéma en français. Corrigés ci-dessous :
> `load_kg` → **`charge_kg`**, `weight_kg` → **`poids_kg`**.
>
> Ce document reste la référence pour les **règles de comptage**. Pour l'état réel de
> la base et les noms exacts : **`SCHEMA-REEL.md`**, régénéré depuis la base.
**Portée :** ce document fixe **ce qu'un nombre veut dire** avant que le moindre algorithme le manipule. Il complète `CADRAGE-V2.md` (pour qui on construit) et `REFERENTIEL-BORNES-V1.md` (les bornes chiffrées).

---

## 0. Le problème réglé ici

L'app v1 affiche un volume hebdomadaire en kilos. Ce nombre additionne des choses qui ne sont pas la même chose : 100 kg à la presse à cuisses, c'est deux jambes, un gros levier et un chiffre déjà faussé par l'angle du chariot ; 100 kg au curl, c'est un biceps. Le total obtenu n'a **aucun référent** — ni dans la physiologie, ni dans la littérature.

Et ce nombre sans référent servait à déclencher des alertes.

Six règles en sortent.

---

## 1. Le tonnage en kilos devient décoratif

| | Avant | Après |
|---|---|---|
| Affiché | oui | **oui, gardé** |
| Déclenche une alerte | oui | **jamais** |
| Entre dans une prescription | oui | **jamais** |
| Compare deux exercices | oui | **jamais** |
| Compare un exercice à lui-même | oui | **oui, seul usage sérieux** |

Le tonnage reste à l'écran parce qu'il fait plaisir et qu'il donne une échelle de séance. Il sort du registre du diagnostic.

**Un seul usage qui tient :** le volume-load **à l'intérieur d'un même exercice**, pour suivre une progression. Là on compare des choses comparables, et c'est le seul cadre où la littérature l'utilise.

---

## 2. L'unité de diagnostic devient la série dure par muscle et par semaine

C'est l'unité que la recherche emploie réellement pour doser l'entraînement.

> Source : Baz-Valle et al. 2021 (*JSCR* 35(3):870-878) sur la définition du volume ; Pelland et al. 2025 (*Sports Medicine*, DOI 10.1007/s40279-025-02344-w) sur la dose-réponse — **+0,24 % d'hypertrophie par série supplémentaire** autour de 12,25 séries fractionnelles par semaine.

**Convention retenue :** une série compte **1** pour chaque muscle primaire de l'exercice, **0,5** pour chaque secondaire. C'est la « série fractionnelle » de la littérature.

### Ce que ça donne sur tes données réelles

Calculé sur ton export Hevy complet : 582 séances, 15 677 séries de travail, 132 semaines couvertes.

| Muscle | Séries dures / semaine |
|---|---|
| pectoraux | 29,3 |
| **deltoïde antérieur** | **26,9** |
| triceps | 21,0 |
| grand dorsal | 19,4 |
| trapèzes | 14,9 |
| haut du dos | 14,2 |
| avant-bras | 13,6 |
| quadriceps | 13,6 |
| biceps | 13,5 |
| **deltoïde latéral** | **12,3** |
| ischios | 11,8 |
| abdominaux | 11,6 |
| fessiers | 10,8 |
| bas du dos | 10,0 |
| **deltoïde postérieur** | **8,4** |
| adducteurs | 5,1 |
| mollets | 4,7 |
| abducteurs | 3,0 |
| **cou** | **0** |

**Trois lectures, dont une gênante.**

1. Ton bas du corps tourne autour de 10-14. C'est pile la plage étudiée par la littérature.
2. **Ton épaule avant est à 26,9, ton épaule arrière à 8,4** — un rapport de plus de 3 pour 1. Avant le découpage du §3 bis, une case unique affichait 40,6 et masquait entièrement ce déséquilibre. Aucune étude n'a testé une dose comme 26,9 : les demi-séries s'accumulent sur tous les développés. **Ce n'est pas une alerte, c'est une observation** — le chiffre sort de la zone où la science sait dire quoi que ce soit. On l'affiche, on ne le juge pas.
3. Le seuil « volume insuffisant » du référentiel §5.2 (« très en dessous de 10 séries ») ne s'allumerait **jamais** sur toi, sauf pour les mollets, les abducteurs, et désormais **le deltoïde postérieur qui s'en approche**. C'est exactement le comportement attendu par la méta-règle du praticien assidu : le seuil reste muet sauf là où il y a vraiment quelque chose à voir.

---

## 3. La nomenclature des muscles — 19 cases

Reprise de Hevy, que tu m'as dictée, avec **deux écarts assumés**.

| Haut du corps | Bas du corps |
|---|---|
| abdominaux | abducteurs |
| avant-bras | adducteurs |
| bas du dos | fessiers |
| biceps | ischio-jambiers |
| **cou** | mollets |
| **deltoïde antérieur** | quadriceps |
| **deltoïde latéral** | |
| **deltoïde postérieur** | |
| grand dorsal | |
| haut du dos | |
| **pectoraux** | |
| trapèzes | |
| triceps | |

**Écart 1 :** Hevy dit « torse », on dit **pectoraux**. Plus clair, aucun coût.

**Écart 2 :** l'épaule est **découpée en trois faisceaux** là où Hevy n'a qu'une case. Décision d'Aurélien, voir §3 bis.

**Écart 3 :** Hevy a trois cases fourre-tout — *cardio*, *corps entier*, *autre*. Elles ne sont **pas des muscles** et ne peuvent pas entrer dans un comptage. On les supprime du comptage ; le cardio est déjà une famille à part chez nous.

**Le cou et l'avant-bras sont gardés bien qu'inutilisés**, et c'est le point : la case existe et reste vide tant que rien ne la remplit. C'est la réponse à ta crainte des muscles oubliés — sans inventer un troisième niveau que personne n'a mesuré.

### Deux niveaux, pas trois

| Niveau | Compte | Justification |
|---|---|---|
| **primaire** | 1 | muscle moteur |
| **secondaire** | 0,5 | assistant — série fractionnelle de la littérature |
| ~~tertiaire~~ | — | **aucun référent, refusé** |

Le nombre de secondaires est **libre**. Ton dentelé apparaîtra tout seul comme secondaire du pull-over, des dips, des développés. Il ne sera jamais primaire, ce qui est la vérité anatomique — pas un oubli.

> **Interdit qui va avec :** aucune alerte « muscle non travaillé ». Un schéma du corps montre ce qui a été fait ; il ne réclame rien. Sinon on recrée le mur de rouge, version anatomie.

---

### Pourquoi le découpage s'arrête là

Aurélien a posé la bonne objection : *« si on découpe l'épaule, pourquoi pas le dentelé, le haut du pec, et ainsi de suite ? »*

**Le critère n'est pas la finesse anatomique, c'est double :**

1. Les deux moitiés peuvent-elles réellement **diverger** dans un programme courant ?
2. Existe-t-il des exercices **dédiés** pour rattraper celle qui décroche ?

| Candidat | Test 1 | Test 2 | Verdict |
|---|---|---|---|
| **Deltoïde postérieur** | oui — tout le monde pousse, presque personne ne tire à l'horizontale | oui — oiseaux, tirage vers visage, élévation Y | **découpé** |
| Haut du pectoral | partiellement | oui, mais un développé incliné le couvre déjà | non |
| Dentelé antérieur | oui | non — personne ne le programme isolément | non |
| Chef long du triceps | marginal | non | non |

**Règle qui en découle :** on découpe un muscle quand un déséquilibre est *plausible en pratique* **et** *corrigeable par un exercice existant*. Pas quand l'anatomie le permet.

---

## 3 bis. Le découpage de l'épaule

Une seule case « épaules » mélangeait les développés, qui chargent l'avant, et les oiseaux, qui chargent l'arrière. Résultat : un chiffre de 40,6 séries par semaine qui ne voulait rien dire.

### Ce que le découpage révèle

| Muscle | Séries dures / semaine |
|---|---|
| pectoraux | 29,3 |
| **deltoïde antérieur** | **26,9** |
| triceps | 21,0 |
| grand dorsal | 19,4 |
| trapèzes | 14,9 |
| haut du dos | 14,2 |
| avant-bras | 13,6 |
| quadriceps | 13,6 |
| biceps | 13,5 |
| **deltoïde latéral** | **12,3** |
| ischio-jambiers | 11,8 |
| abdominaux | 11,6 |
| fessiers | 10,8 |
| bas du dos | 10,0 |
| **deltoïde postérieur** | **8,4** |
| adducteurs | 5,1 |
| mollets | 4,7 |
| abducteurs | 3,0 |

**Avant 26,9 contre arrière 8,4 — un rapport de plus de 3 pour 1**, totalement invisible dans l'ancien chiffre unique.

L'explication tient au comptage en secondaire : 46 exercices touchent le deltoïde antérieur (tous les développés couchés, écartés, dips, pompes), contre 13 pour le latéral et 14 pour le postérieur.

### La règle d'affectation

| Type de mouvement | Faisceaux |
|---|---|
| Élévations latérales | latéral |
| Élévations frontales | antérieur |
| Oiseaux, tirage vers visage, élévation Y | postérieur |
| Développés verticaux (militaire, presse épaules, Arnold) | antérieur **+** latéral |
| Rowing debout | latéral **+** postérieur |
| Poussées horizontales (couché, écartés, dips, pompes) | antérieur, en secondaire |
| Tirages horizontaux (rowings) | postérieur, en secondaire |

Les 63 exercices concernés ont tous été réaffectés. Aucun n'est resté sans faisceau, aucune collision primaire/secondaire.

### Un artefact de comptage à connaître

Le total des trois faisceaux vaut **47,6** séries/semaine contre 40,6 pour l'ancienne case unique. Ce n'est **pas** du travail en plus : les développés verticaux comptent désormais sur deux faisceaux au lieu d'une case.

**Conséquence :** ces deux nombres ne sont pas comparables, et aucune tendance historique ne doit franchir la date du découpage sans être recalculée. Le principe de l'étage 1 le permet — rien n'est stocké, tout se recalcule.

---

## 4. Le poids du corps — la règle du suspendu

**Décision d'Aurélien, 23/08 au soir.** Une version antérieure de ce document définissait quatre régimes de coefficients (mesuré 64 %, arrondi 100 %, choix 70 %, hors tonnage). Elle est abandonnée au profit d'une règle unique :

> ## Suspendu, ça compte à 100 %.
> ## Dès qu'un appui touche le sol, ça compte zéro.

| Régime | Coefficient | Exercices | Charge externe |
|---|---|---|---|
| **Suspendu** | **100 %** du poids daté | Tractions (toutes prises), dips barres parallèles, dips torse, muscle-up | Lesté : `+ charge saisie` · Assisté : `− assistance saisie` |
| **Appui au sol** | **0** | Pompes et toutes leurs variantes, dips banc, rowing inversé, squat au poids du corps, gainages, planches, relevés de jambes, abdos, burpee, cardio | Enregistrée, comptée seule. Une pompe lestée de 5 kg pèse 5 kg |

**Effet sur ton historique :** 482 séries suspendues entrent dans le tonnage (177 tractions, 159 dips triceps, 72 tractions supination, 71 dips torse). 677 séries à appui au sol restent à zéro, dont 636 pompes.

### Pourquoi cette règle plutôt que des coefficients

C'est un choix d'Aurélien, contre ma recommandation initiale. L'argument qui l'emporte : **une règle binaire ne se trompe jamais sur le cas ambigu.**

Les coefficients à appui au sol dépendent tous d'un paramètre qu'on n'enregistre pas — la position des pieds sur un dips banc, l'angle du corps sur un rowing inversé (37 % à 30°, 79 % à 75° selon Ronai & Scibek : du simple au double), la hauteur des mains sur une pompe inclinée. Un chiffre qui bouge du simple au double selon un réglage invisible n'est pas une mesure, c'est une illusion de précision.

**Ce qu'on perd, assumé :** 636 séries de pompes pèsent zéro alors qu'Ebben et al. 2011 ont mesuré 64 % sur plateforme de force. C'est le prix de la règle. Le progrès sur ces exercices se lit en **répétitions**, pas en kilos.

**Ce qu'on gagne :** le tonnage TrainHub devient **identique** au tonnage Hevy. Aucun écart à expliquer, aucune surprise pour un utilisateur qui migre.

### Le cas de la charge externe

Dix kilos sur le dos pendant une planche, un disque sur une pompe lestée, un haltère entre les pieds sur un relevé de jambes : **c'est mesuré, c'est exact, on l'enregistre et on le compte.** Mais on n'y ajoute pas de poids de corps. Une pompe lestée à 5 kg vaut 5 kg.

Sur les exercices sans tonnage (gainages, planches), le progrès se lit sur **deux axes** : les secondes ou les répétitions d'un côté, les kilos ajoutés de l'autre.

### Ce que ça change sur tes données

| | Règle actuelle (v1) | **Règle du suspendu** |
|---|---|---|
| Tonnage total 3 ans | 6 977 t | **7 386 t** |
| Moyenne hebdomadaire | 52,9 t | **56,0 t** |

**+5,9 %.** Ce sont tes 482 séries de tractions et de dips qui pesaient zéro kilo jusqu'ici.

> **Historique des chiffres de cette session, laissé visible.** +12 % (quatre régimes, poids fixe à 98 kg — faux, voir §4 bis) → +10,7 % (quatre régimes, poids daté) → +10,8 % (ajout de dips banc et rowing inversé) → **+5,9 % (règle du suspendu, décision finale)**. Trois révisions en une soirée, chacune motivée par une objection d'Aurélien.

> **Écart résolu (23/08, vérification en base).** Les ~75 000 kg affichés par l'app v1 ne sont **pas un bug**. La colonne `volume` de `workout_sessions` totalise **7 262 t sur 557 séances** pour aurel_br, contre **7 386 t** pour le calcul à la règle du suspendu — moins de **2 %** d'écart, imputable aux ~25 séances absentes de la base. Le calcul de la v1 est juste.
>
> L'explication est ailleurs : les **bonnes** semaines sont réellement à **74,5 · 76,5 · 76,2 · 73,8 · 78,8 t** (5 à 7 séances). La moyenne tombe à **56,7 t** parce qu'elle avale les semaines à 2-4 séances (22,8 · 27,6 · 36,5 · 35,2 · 38,9 t). Moyenne réelle : **4,4 séances/semaine**, pic à 144,9 t sur 128 semaines.
>
> ⚠️ **Leçon de design, à appliquer au schéma et aux écrans.** Une **moyenne** hebdomadaire calculée sur un historique irrégulier produit un chiffre que l'utilisateur ne reconnaît pas — il se souvient de ses bonnes semaines, pas de sa moyenne. Préférer la **médiane**, ou une moyenne restreinte aux **semaines pleines**. C'est le même mécanisme que le « mur de rouge » : un chiffre exact mais non reconnaissable détruit la confiance aussi sûrement qu'un chiffre faux.

---

## 4 bis. Le poids de corps est une série temporelle, pas un champ

Le coefficient de 100 % ne sert à rien sans le poids auquel l'appliquer. Et un poids, ça bouge.

### Ce que la base contient aujourd'hui

Une seule valeur : `body[0].bw = 98`, datée du 2 avril 2026. Aucune table de mesures dans Supabase. Trois ans de séances, un point de mesure.

### Ce que l'export Hevy contient

**113 pesées** entre le 25 janvier 2023 et le 18 mars 2026 — dans un fichier séparé de l'export d'entraînement (`measurement_data`), qu'il faut donc importer à part.

| Repère | Poids |
|---|---|
| Janvier 2023 | 93,7 kg |
| Juin 2024 | 85,2 kg |
| **Octobre 2024** | **84,5 kg — le creux** |
| Mars 2026 | 98,6 kg |

**14 kilos d'amplitude.** Appliquer un poids fixe à cet historique n'est pas une approximation, c'est une erreur de mesure de 16 %.

### La règle

> **On prend le dernier poids enregistré avant la séance. S'il n'y en a aucun, on ne compte pas — on n'invente pas.**

Vérifié : sur tes 15 677 séries de travail, **zéro** série se retrouve sans pesée antérieure. Ta première mesure précède ta première séance. La règle couvre tout ton historique sans jamais extrapoler.

### Conséquence sur le schéma

Une table `body_weight_log` — `user_id`, `date`, `poids_kg`, `source` — séparée du profil. Étage 1 : observé, jamais recalculé. Le champ `bw` du blob v1 devient sa première ligne.

### Comment on a établi la règle de Hevy

Vérifié sur deux séances, chiffres comparés à l'écran de l'app :

| Séance | Hevy affiche | Calcul « charge saisie seule » | Écart |
|---|---|---|---|
| 2 sept. 2024 — 11 séries au poids du corps | 13 128,4 kg | 12 430 kg | **698,4 kg** |
| 19 janv. 2025 — 70 reps de pompes, aucune traction | 8 952 kg | 8 952 kg | **0** |

Les 698,4 kg de la première séance valent exactement **8 tractions × 87,3 kg**. Et la pesée du 2 septembre 2024 dit **87,3 kg**. Donc Hevy compte les tractions à 100 % du poids **daté**, et ne compte **rien** sur les pompes — 70 répétitions à zéro kilo.

Aurélien a complété la démonstration en constatant que Hevy affiche également zéro sur le **squat au poids du corps**. Les trois points s'assemblent en la règle du §4.

*(Vérification chiffrée sur les tractions. Les dips n'ont pas pu être isolés dans une séance de test — même traitement présumé, cohérent avec la règle.)*

---

## 4 ter. La famille des pompes

Détaillée par Aurélien à partir de la nomenclature Hevy. Aucune ne compte de tonnage, mais l'attribution musculaire diffère, et l'ordre de difficulté sert de progression.

| Exercice | Muscles principaux | Secondaires |
|---|---|---|
| Pompes à genoux | pectoraux | deltoïde antérieur, triceps |
| Pompes inclinées | pectoraux | deltoïde antérieur, triceps |
| **Pompes** | pectoraux | triceps, deltoïde antérieur |
| Pompes lestées | pectoraux | deltoïde antérieur, triceps · **+ charge saisie** |
| Pompes déclinées | pectoraux | deltoïde antérieur, triceps |
| Pompes prise serrée | pectoraux | deltoïde antérieur, triceps |
| **Pompes diamant** | **triceps** | pectoraux, deltoïde antérieur |
| Pompes claquées | pectoraux | triceps, deltoïde antérieur |
| Pompes planche | pectoraux | deltoïde antérieur, triceps, abdominaux |
| **Pompes en pic** | **deltoïde antérieur** | triceps, pectoraux |
| **Poirier** | **deltoïde antérieur, latéral** | pectoraux, abdominaux, triceps |
| Pompes à une main | pectoraux | deltoïde antérieur, triceps, abdominaux |

### Prise serrée et diamant sont deux exercices distincts

La rév. 3 traitait « Pompes Diamant » comme un simple alias de « Pompes prise serrée ». **Erreur, corrigée sur objection d'Aurélien :** Hevy en fait deux exercices, et l'attribution musculaire diffère — pectoraux en principal pour la prise serrée, **triceps** en principal pour le diamant.

C'est l'application de la règle établie au §6.1 du catalogue : **le nom fait foi.**

Aurélien précise que la prise serrée sert de palier avant le diamant. Cette notion de **progression** est distincte du champ `parent`, qui regroupe les variantes d'un même mouvement. Elle est notée, pas implémentée — voir §9.

### Le petit « i »

À côté du tonnage de séance, une icône déroule la règle appliquée : *« Tractions — 100 % de ton poids du 2 sept. (87,3 kg) · Pompes — non comptées, appui au sol · Planche — non comptée »*. Transparence totale sur une valeur qui reste une convention.

**Ce qu'il n'a plus à faire :** expliquer un écart avec Hevy. La règle du suspendu aligne les deux totaux.

---

## 5. La masse de départ et le calculateur

### Le champ

Toute barre et toute machine a une **masse de départ** : ce qu'on soulève avec zéro disque. Barre olympique 20 kg, barre EZ ~10, Smith 6 à 20 selon le contrepoids, presse à cuisses à disques 34 à 57 selon le modèle, machine à sélecteur 0 (l'affichage est déjà le total).

**Un seul champ, une seule règle. Le cas « pas de masse de base » n'est qu'un zéro.**

| Champ | Rôle |
|---|---|
| `masse_depart_kg` | valeur par défaut du catalogue |
| `masse_depart_reglable` | vrai si elle dépend de la salle — 44 exercices sur 164 |

**Enregistrée brute**, telle que gravée sur la machine. Pas corrigée par l'angle, alors qu'une presse à 45° ne transmet qu'environ 71 % de la masse du chariot. Justification : ce chiffre sert au **chargement**, pas au diagnostic — et le diagnostic ne passe plus par les kilos.

### Le calculateur

**Un seul outil, barre et machine confondues.** Accessible depuis la ligne de série pendant la séance. Tu tapes la charge totale visée, il dit ce qu'il faut ajouter.

```
Presse à cuisses · masse de départ 47,6 kg · cible 127,6 kg
→ ajouter 80 kg  =  2 × 20 kg  +  2 × 20 kg
```

Deux règles d'implémentation qui évitent les bugs classiques :

1. **La charge saisie est toujours le total, masse de départ comprise.** Le calculateur soustrait ; il n'ajoute jamais. Pas de double comptage.
2. **Les disques vont par paires.** 47,6 + 2 × 20 = 87,6, pas 67,6.

C'est un outil de terrain, comme celui de Hevy. Le pré-remplir avec la masse de départ de l'exercice, c'est le plus qu'ils n'ont pas.

---

## 6. Les tables charge ↔ répétitions deviennent individuelles

### Ce que dit la littérature, revérifié

Nuzzo et al. 2023 (*Sports Medicine*, DOI 10.1007/s40279-023-01937-7) : **952 tests jusqu'à l'échec, 7 289 personnes, 269 études**.

- À 70 % du max : **~15 répétitions** en moyenne, pas 12 comme dit la vieille table.
- Étendue réelle au squat : **6 à 28 répétitions** chez des pratiquants entraînés (Cooke et al. 2019).
- **Le seul facteur qui change le résultat, c'est l'exercice.** Ni le sexe, ni l'âge, ni le niveau d'entraînement.

Ton objection en séance — « c'est différent si tu fais de la force ou de l'hypertrophie » — porte sur autre chose : la **zone où tu choisis de t'entraîner**. La table, elle, décrit ton **plafond physique** à une charge donnée. Deux questions distinctes.

### Le piège circulaire

Ton max estimé sort d'une formule. Cette formule **suppose déjà** une table de répétitions.

| Ta série | Max estimé | Ta vraie barre |
|---|---|---|
| 120 × 5 | ~140 kg | 140 ✅ |
| 98 × 10 | ~131 kg | 140 ❌ |

Tes séries lourdes te décrivent bien. Tes séries légères te sous-estiment — parce que la formule t'a pris pour la moyenne. D'où la borne du référentiel §2.2 : **formules exploitables en dessous de 8 répétitions.**

### La règle

> **Le max estimé donne le plafond. La table individuelle donne combien de répétitions à chaque pourcentage de ce plafond.** Les deux vont ensemble, ils ne s'opposent pas.

Sans table individuelle, l'app te prescrit 14 répétitions à 98 kg au couché. Tu en fais 10, tu « échoues », et l'algorithme croit que tu régresses. **C'est exactement le 122,5 × 7 qui t'a mis au tapis.**

### La grille v1 est conservée — c'est ce qui change autour d'elle qui compte

L'app v1 affichait déjà le max estimé et, en dessous, la suite ×2 ×3 ×4 … ×20, avec une coche si réalisé, « manque » si en dessous, « bonus » si au-dessus.

**La grille reste. C'est le statut du « manque » qui change.**

| | v1 | v2 |
|---|---|---|
| Sens d'un manque | une faute — tu es en retard | **une information — voilà ton vrai chiffre à cette charge** |
| Effet | avertissement | **recalibre ta table** |

La grille arrête de juger, elle apprend. Et la forme de courbe de Nuzzo sert uniquement à **extrapoler** entre tes points mesurés — on n'utilise jamais ses moyennes.

---

## 7. Ce que ça impose au schéma v2

| Table | Ajout |
|---|---|
| `exercises` | `muscles_primaires[]`, `muscles_secondaires[]`, `muscles_source` |
| `exercises` | `coef_pdc` (**1.0 ou 0.0** — règle du suspendu, §4), `coef_pdc_source`, `compte_tonnage` |
| `exercises` | `masse_depart_kg`, `masse_depart_reglable` |
| `sets` | rien — `charge_kg` reste la charge totale saisie, jamais dérivée |
| **`body_weight_log`** *(nouvelle)* | `user_id`, `date`, `poids_kg`, `source`. Étage 1. 113 lignes à importer depuis Hevy |
| *(noté, hors périmètre)* | `equipment_id` / notion de salle, pour le décalage de masse de départ |

> **Note sur `coef_pdc`.** Le champ ne prend plus que deux valeurs. Il aurait pu devenir un booléen `est_suspendu` ; on le garde en décimal pour que réintroduire des coefficients fins reste possible sans migration, si la règle binaire s'avère trop grossière à l'usage.

**Le principe de l'étage 1 tient :** aucun tonnage, aucune série fractionnelle, aucun pourcentage n'est stocké. Tout se recalcule depuis `sets` × `exercises` × `body_weight_log`. Changer un coefficient demain recalcule trois ans d'historique, sans migration.

**Et ça vaut aussi pour le poids.** Une pesée ajoutée après coup recalcule les séances concernées. C'est précisément pour ça que le tonnage ne doit jamais être figé dans une colonne.

---

## 8. Ce que j'ai tranché seul — état après la session du 23/08 au soir

Quatre points avaient été décidés faute d'avoir posé la question. Tous ont été revus en séance. **Trois sur quatre ont été réfutés.**

| Point | Ma décision initiale | Issue |
|---|---|---|
| **Dips banc, rowing inversé** | hors tonnage, car « 9 séries en 3 ans » | ❌ **Réfuté.** Compter *les séries d'Aurélien* est exactement le biais que ce document dénonce : ce sont des exercices de progression, davantage utilisés par les femmes, et Léa est une utilisatrice réelle. → Passés dans le tonnage, puis ramenés à zéro par la règle du suspendu (§4), pour une raison différente et meilleure |
| **Épaules en une seule case** | suivi de Hevy | ❌ **Réfuté.** Découpé en trois faisceaux — voir §3 bis. Le déséquilibre avant/arrière était de 3 pour 1 et complètement masqué |
| **Pompes prise serrée** = pompes diamant | un seul exercice, deux primaires | ❌ **Réfuté.** Deux exercices distincts chez Hevy, attribution musculaire différente. Voir §4 ter |
| **Épaulé-jeté** | 3 primaires : fessiers, quadriceps, trapèzes | ✅ **Non contesté.** La mesure EMG met les fessiers au niveau des quadriceps. Hevy affiche « corps entier », case supprimée du comptage |

> **Ce que cette table démontre.** Trois réfutations sur quatre en une session. Le point commun des trois erreurs : elles s'appuyaient sur la **fréquence dans l'export d'Aurélien** ou sur le **défaut de suivre Hevy**, jamais sur un raisonnement propre au problème.
>
> **Règle qui en sort :** la rareté d'un exercice dans l'historique d'Aurélien n'est jamais un argument pour l'exclure du modèle. Elle mesure sa pratique, pas l'utilité de l'exercice.

---

## 9. Ce que ce document ne résout pas

- **Le seuil de « série dure ».** Une série à 5 répétitions restantes compte-t-elle autant qu'une série à l'échec ? La littérature dit non, mais ne donne pas de coupure nette. Sujet du chantier « proximité de l'échec », qui s'appuiera sur tes 59 séries marquées `[Échec]`.
- **Les supersets.** 49 % de tes séries. Le comptage par muscle les traite comme des séries indépendantes ; à vérifier.
- **La comparabilité des machines entre salles.** Réglée à moitié : la masse de départ est réglable, mais l'angle et le rapport de poulie ne le sont pas. Une courbe charge↔répétitions sur machine vaut pour **une** machine.
- **Marzagão 2026** (nouvelle équation de max estimé, 303 494 séries) : préprint non revu, auteur affilié à Fitbod, aucun max réellement mesuré dans le jeu de données. **Repli étiqueté « non validé » au mieux, jamais en défaut.**

---

## 10. Sources

- Ebben W.P. et al. (2011). *JSCR* 25(10):2891-2894. DOI 10.1519/JSC.0b013e31820c8587 — charge en pompes
- Baz-Valle E. et al. (2021). *JSCR* 35(3):870-878 — définition du volume
- Pelland J.C. et al. (2025). *Sports Medicine*. DOI 10.1007/s40279-025-02344-w — dose-réponse volume
- Nuzzo J.L. et al. (2023). *Sports Medicine*. DOI 10.1007/s40279-023-01937-7 — répétitions ↔ %1RM
- Cooke D.M. et al. (2019). *JSCR* 33(3):890-895 — variation individuelle au squat
- Andersen L.L. et al. (2008) — EMG rowing debout
- Marchetti P.H., Uchida M.C. (2011) — EMG pull-over
- Ortiz-Padilla V.E. et al. (2022). *Applied Sciences* 12(21):11138 — EMG tirage bras tendus
- Coratella G. et al. (2020) — EMG élévations d'épaule
