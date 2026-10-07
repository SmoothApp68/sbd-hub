# Maquettes — références visuelles de l'écran de saisie

**Ces fichiers ne sont pas du code de production.** Ils ne sont ni chargés, ni
importés, ni précachés par la v2. Rien dans `v2/js/` ne les référence.

Ce sont les **maquettes validées** de l'écran de saisie. Elles vivent dans le
dépôt pour que les chantiers suivants travaillent en les ayant sous les yeux
plutôt que de mémoire.

| Fichier | Ce qu'il fixe |
|---|---|
| `bloc-suggere-entete.html` | Anatomie d'un bloc : palier et cible de reps écrits **une seule fois** dans l'en-tête, pas sur chaque série. Les séries de rampe et de chauffe ne reçoivent aucune suggestion. Un exercice sans palier établi le dit au lieu d'inventer un chiffre. |
| `mode-edition.html` | Bascule **Modifier** : les blocs se replient sur leur légende, les poignées apparaissent, le menu trois points expose grouper / dégrouper / déplacer / remplacer / supprimer. |
| `grouper-degrouper.html` | Grouper en superset par désignation (« tape le bloc à joindre »), ouvrir un bloc pour atteindre ses exercices, **Sortir du superset**. Un superset retombé à un exercice redevient un bloc simple. |
| `maquette-moteur-parle-v2.html` | **Le moteur qui parle** (chantier 48) — étiquette de zone, consigne à deux charges, règle du test, menu des zones, feuille « Pourquoi », constats, rythme dans Profil, reprise, et le dictionnaire complet des phrases. Remplace la v1, jamais commitée. |
| `maquette-reaction-serie-v1.html` | **La réaction série par série** (chantier 49, MOTEUR §9.14, ECRAN-SAISIE §3.2) — variante A : la phrase du coach dans la grille, au-dessus de la série qu'elle concerne ; la ligne proposée avec son filet et sa charge en couleur du coach, les reps à taper ; « tenue », « le haut de ta zone », « pas encore » ; le refus qui fait taire le bloc. |
| `maquette-questionnaire-v4.html` | **Le questionnaire du coach** (chantier 60, QUESTIONNAIRE-COACH-V2 §3) — le parcours complet, écran par écran, avec ce que chaque réponse change à droite. Elle fait foi pour l'apparence et les textes, **sauf** ses écarts décidés le 07/10 : pas d'écran « Ton programme » (60-3), un seul bouton sur « Ce que je sais », ancienneté à quatre valeurs, année de naissance, libellés du profil pour le coach, « Jusqu'à trois. ». Les panneaux d'explication et le sommaire sont pour Aurélien, pas pour l'app. Remplace les versions précédentes, jamais commitées. |

## Ce qu'elles ne fixent pas

Le réordonnancement y est câblé avec l'API **HTML5 native** (`draggable="true"`,
`dragstart`, `dragover`). **Cette API ne répond pas au doigt sur Android Chrome.**
Elle fonctionne à la souris en développement, ce qui rend le défaut invisible
hors device réel. L'implémentation devra passer par des **Pointer Events** —
c'est un chantier à part entière, hors du socle.

## Correspondance avec le modèle de données

Le vocabulaire des maquettes est déjà celui des tables v2 :

- un **bloc** = une suite contiguë de `sets` partageant `groupe_superset`
  (superset), ou à défaut le même `exercise_slug` (bloc simple) ;
- l'ordre d'affichage vient de `sets.rang`, **jamais** de `sets.validee_a` ;
- les séries de chauffe des maquettes sont `sets.type_serie = 'echauffement'`.

`v2/js/modele.js` construit exactement cette structure et porte les tests.
