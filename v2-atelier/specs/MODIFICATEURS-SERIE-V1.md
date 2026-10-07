# Modificateurs de série — v1

**Date :** 3 septembre 2026
**Statut :** figé. Liste fermée.
**Portée :** ce qui se coche ou se saisit **sur une série**, dans l'écran de saisie.
**Ne couvre pas :** le catalogue d'exercices, les types de série existants (`type_serie`), les supersets (`groupe_superset`).

---

## 1. La règle qui décide de tout

Vingt-deux candidats ont été examinés un par un. Deux survivent.

> **Un modificateur de série n'existe que s'il remplit trois conditions :
> il produit une seule ligne dans `sets`, il n'est pas déjà lisible dans les
> données, et son absence ferait dire une bêtise au moteur.**

La troisième condition est la plus discriminante. Ce n'est pas « est-ce intéressant » mais « **le moteur se trompe-t-il sans lui** ».

### Ce que fait un modificateur, et ce qu'il ne fait pas

| | |
|---|---|
| **Il fait** | Dire au moteur que deux séries ne sont pas comparables |
| **Il ne fait pas** | Prescrire, pondérer, corriger une charge, estimer une difficulté |

> **Un modificateur sert à se taire au bon moment.**

Aucun des deux retenus n'est modélisé. Le moteur ne sait pas — et ne saura pas — combien un tempo 4-2-0 coûte de kilos, ni ce qu'un élastique vert ajoute. Il sait seulement que deux séries de tempo identique se comparent, et que deux tempos différents ne se comparent pas.

C'est une position modeste, et elle est délibérée : la modélisation demanderait des données qu'on n'a pas et qu'on n'aura pas à cinq utilisateurs.

---

## 2. Les deux retenus

### 2.1 Le tempo

**Ce que c'est.** Trois chiffres : descente, pause, montée, en secondes. « 4-2-0 » = quatre secondes de descente, deux de pause en bas, remontée normale.

**Volume observé.** 68 séries sur les cinq comptes, en trois ans. C'est rare, et c'est assumé.

**Pourquoi les chiffres et pas un simple drapeau.** Trois séances à 4-2-0 puis une à 1-0-1. Avec un drapeau, le moteur voit quatre séries « tempo », les compare entre elles, et annonce une chute de charge qui n'existe pas. **Le drapeau seul ne supprime pas le faux signal, il le déplace.**

**Pourquoi pas « lent / moyen / rapide ».** Ces mots ne veulent rien dire d'une personne à l'autre, ni d'un exercice à l'autre : lent au squat et lent au curl ne sont pas la même seconde. Même défaut que les gradations fines de RPE.

**Pourquoi pas un tempo déduit par un modèle de langage.** Ce serait écrire une déduction dans l'étage observé. Interdit par l'architecture actée après le test Gemini : le moteur calcule, le modèle de langage met en mots.

**Saisie.** Appui long sur le numéro de série → menu (échauffement, dégressive, échec, puis les modificateurs) → tempo → mini-fenêtre à trois cases, **pré-remplies avec le dernier tempo utilisé sur cet exercice**, plus une case **« appliquer aux séries suivantes » cochée par défaut**.

> La case est cochée par défaut parce que le tempo se décide pour tout l'exercice. Décochée par défaut, le cas courant demanderait une action à chaque série et le cas rare aucune — l'inverse de ce qu'il faut.

**Usage moteur.** Égalité stricte, et rien d'autre.

**Stockage.** Trois entiers, appliqué en migration `v2_035` :

| Colonne | Rôle |
|---|---|
| `sets.tempo_descente` | Phase excentrique, en secondes |
| `sets.tempo_pause` | Pause en position basse |
| `sets.tempo_montee` | Phase concentrique |

Chacun de 0 à 99, soit deux caractères par case dans l'écran.

**Pas de colonne normalisée, contrairement à l'élastique.** Un tempo est numérique : 4 et 4 sont égaux sans traitement. La normalisation n'existe pour l'élastique que parce que c'est du texte. La comparaison se fait sur le triplet.

**Contrainte tout ou rien.** Les trois valeurs sont présentes ou aucune ne l'est. Un tempo partiel — « descente 4, le reste inconnu » — serait ininterprétable : deux séries dans cet état ne sont ni comparables entre elles, ni distinguables l'une de l'autre.

**Trois chiffres et pas quatre.** La convention powerlifting compte parfois une quatrième valeur, la pause en haut. Écartée : une case que personne ne remplirait.

### 2.2 L'élastique

**Ce que c'est.** L'identité de la bande, en texte court : « verte », « noir 32mm ». Pas une charge.

**Pourquoi pas des kilos.** Deux raisons cumulées.

La résistance d'une bande n'est pas un nombre : elle est presque nulle en bas du mouvement et maximale au verrouillage. Un multiplicateur dirait « +30 % partout », faux là où la série casse. La version additive existe en powerlifting — « 100 kg de barre plus 30 kg au verrouillage » — mais elle dépend de l'ancrage, de la précontrainte et de la longueur, et personne à la salle ne la mesure.

Et surtout : **Mélodie a laissé le champ d'assistance vide sur trois séries de tractions élastique, parce qu'elle ne savait pas combien la bande enlevait.** Un champ qu'on ne peut pas remplir produit un trou, pas une donnée. L'identité, elle, est toujours nommable.

**Ce que ça règle.** Changer d'élastique est aujourd'hui invisible : passer du vert au noir fait grimper la difficulté sans qu'aucun chiffre ne bouge. Même classe de problème que les changements de convention de Léa sur les haltères.

**Saisie.** Texte libre **à la première utilisation sur cet exercice**, puis **liste de pastilles** construite à partir de ce que la personne a déjà nommé.

> Le texte libre pur reproduirait l'erreur qu'on cherche à éviter : « verte », « Verte », « vert », « la verte » feraient quatre bandes différentes. Les pastilles ferment la porte sans enlever la liberté — n'importe quelle marque, n'importe quel vocabulaire.

**Stockage.** Deux colonnes, deux rôles, appliqué en migration `v2_034` :

| Colonne | Rôle |
|---|---|
| `sets.elastique` | Ce qui a été tapé. L'observé. Jamais réécrit |
| `sets.elastique_norme` | Calculé par Postgres. Minuscules, espaces normalisés, accents repliés. **Sert uniquement à la comparabilité, jamais à l'affichage** |

Limite à 40 caractères, pour que le champ ne devienne pas une seconde note.

**Portée.** Les deux sens. Assistance comme résistance — c'est le cas de Mélodie qui l'a imposé, pas celui de la résistance qui n'a encore aucune série.

---

## 3. Les vingt écartés, et pourquoi

### 3.1 Absorbés par un mécanisme existant

| Candidat | Où il tombe |
|---|---|
| Dégressive | `type_serie = 'degressive'` |
| Superset, biset, triset, séries géantes | `groupe_superset` — le nombre se lit dans le groupe |
| **Rest-pause** | Dégressive **à charge constante** |
| **Séries en grappe** | Idem |
| Excentrique accentué | Premier chiffre du tempo |
| Isométrie (pause en cours de répétition) | Chiffre du milieu du tempo |

> **La trouvaille sur le rest-pause.** Une dégressive enregistre 100, 80, 60 — trois lignes, trois charges. Un rest-pause enregistre 100, 100, 100 — trois lignes, charge identique. **Le journal a exactement la même forme.** Le moteur peut donc les distinguer seul, sans aucune saisie supplémentaire.
>
> Le bouton reste étiqueté **« dégressive »** — court et sans ambiguïté au moment de taper. À la relecture, l'app lit les charges et affiche « rest-pause » d'elle-même quand elles sont identiques. **On ne stocke que l'observé, l'étiquette se recalcule à l'affichage.**

### 3.2 Ce sont des exercices, pas des modificateurs

| Candidat | Traitement |
|---|---|
| Isométrie (maintien) | Catalogue : planche, L-sit, gainage, et les maintiens supramaximaux créés en `v2_030` |
| Unilatéral | Catalogue : une entrée par exercice |
| Prise large, serrée, neutre, supination, inversée | Catalogue : 13 entrées créées en `v2_033` |
| Convergentes | Catalogue : 3 entrées créées en `v2_033` |
| Négatives autonomes | Catalogue : 3 entrées créées en `v2_033` |
| Amplitudes partielles (rack pull, planches, pin squat) | Catalogue : créées en `v2_030` |
| Élastique en résistance | Catalogue : 5 entrées créées en `v2_033` |
| Technique 21 et prises enchaînées | Catalogue + `groupe_superset` — voir §5 |

**Le principe qui a tranché tous ces cas**, énoncé par Aurélien à propos du squat sumo :

> **Le catalogue est un menu, pas une trace.** Une entrée à zéro série est normale — c'est un exercice disponible. On ajoute ce qui existe, indépendamment de l'usage.

### 3.3 Lisibles dans les données — les taguer serait une déduction dans l'observé

| Candidat | Où ça se lit |
|---|---|
| Pyramidal | Les charges montent, les répétitions baissent |
| Pré-fatigue | L'ordre des exercices de la séance |
| Sans repos / enchaîné | L'horodatage de validation — voir §4 |

### 3.4 Écartés faute d'usage réel

| Candidat | Motif |
|---|---|
| Répétitions forcées | Demande un partenaire. Aucune occurrence sur cinq comptes |
| Répétitions négatives assistées | Idem, et le reste tombe dans le tempo |
| Répétitions trichées | Personne ne cochera « j'ai triché », et l'information serait inexploitable |
| Occlusion / BFR | Zéro occurrence. La **note de série** suffira le jour venu |

> **Sur l'occlusion, une précision qui compte.** L'argument « ce sera facilement identifiable » est faux : une chute de charge à 30 % avec des répétitions qui montent à 25 ne se distingue pas d'un travail léger de fin de séance ni d'une reprise après blessure. Rien dans les chiffres ne dit « garrot ». Elle est écartée parce qu'elle est rare et que la note la couvre — pas parce qu'elle serait détectable.

---

## 4. Le temps de repos — la règle du silence

**Décision d'Aurélien, et elle est plus propre que ce que je proposais.**

Deux choses distinctes qui ne doivent jamais se mélanger :

| | |
|---|---|
| **Temps de repos voulu** | Réglé par l'utilisateur, pilote le minuteur, modifiable |
| **Temps de repos constaté** | Déduit de l'horodatage. **Enregistré, jamais affiché, jamais utilisé pour juger** |

**Pourquoi le constaté doit rester muet.** L'horodatage ment structurellement : avec la fatigue, on valide parfois deux ou trois séries d'un coup après coup. Deux séries à quinze secondes d'écart peuvent être un vrai enchaînement ou un rattrapage, et rien ne les distingue.

**Ce que ça règle définitivement.** Le modificateur « sans repos » n'existe pas : on cocherait une case précisément dans le cas où on a oublié de cocher.

**Piste notée pour plus tard, pas retenue en v1.** Le repos moyen d'un bloc est plus solide que les intervalles individuels : durée totale du bloc, moins le temps d'exécution estimé, divisé par le nombre d'intervalles. Même avec des horodatages chaotiques, si le bloc a duré quinze minutes pour quatre séries, l'ordre de grandeur est bon. **Limite connue :** les supersets brouillent le calcul, et ils représentent **48,7 % des séries de travail chez aurel_br** (19,8 % chez alexis, 16,2 % chez lea, 9,4 % chez melodie, 0,6 % chez jordan).

> ⚠️ **Chiffre corrigé le 10/09/2026.** Ce paragraphe annonçait 38 %, chiffre qui traînait dans les notes sans avoir été mesuré. La mesure réelle donne 48,7 %, ce qui aggrave la limite au lieu de l'atténuer. Doctrine : **un chiffre qui traîne dans les notes doit être remesuré avant d'être utilisé.**

---

## 5. Ce qui reste ouvert

| | Sujet | Question |
|---|---|---|
| 1 | **Prise variable en cours de série** | Technique 21, prises enchaînées sans reposer la barre. Trois lignes en superset sur le même mouvement, ou un exercice nommé ? |
| 2 | **Séries en grappe** | Absorbées par la dégressive à charge constante. À rouvrir si un usage réel apparaît |

---

## 6. Ce que cette spec conditionne

L'écran de saisie. Le menu d'appui long sur le numéro de série contient, dans cet ordre :

```
échauffement · dégressive · échec
─────────────────────────────────
tempo · élastique
```

Trois types de série, deux modificateurs. C'est tout, et la liste est fermée.

---

## Annexe — le compte

| | Nombre |
|---|---|
| Candidats examinés | 22 |
| Retenus comme modificateurs | **2** |
| Absorbés par un mécanisme existant | 6 |
| Devenus des exercices du catalogue | 8 |
| Lisibles dans les données | 3 |
| Écartés faute d'usage | 4 |

Entrées de catalogue créées pendant cet arbitrage : **37** (6 en `v2_030`, 31 en `v2_033`).
