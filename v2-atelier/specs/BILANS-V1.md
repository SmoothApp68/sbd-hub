# Bilans — v1 (« Ton année », et après lui la saison et le mois)

**Statut** : décisions d'Aurélien du 12 et du 14/10/2026, écrites ici mot pour mot (prompt 95). Maquette figée le
12/10/2026 : [`maquette-ton-annee-v11.html`](../maquettes/maquette-ton-annee-v11.html) — le contrat visuel. Les données
qu'elle montre sont celles d'aurel_br en 2026 : elles servent d'exemple, pas de fixture.

## 1. Les décisions (12 et 14/10/2026)

- Un seul moteur de bilan, avec la période en paramètre (année, saison, mois) : mêmes règles, même partage, seule la fenêtre change. CE PROMPT CODE L'ANNÉE SEULEMENT. Le moteur accepte une période, mais les versions saison et mois attendent leur maquette (Claude.ai) : pas d'écran pour elles, et le bilan du mois actuel ne bouge pas.
- Les 12 écrans de l'année : tonnes de l'année + équivalence (éléphants de 6 t) ; mois par mois (le plus lourd) ; reps et séries ; profil force / mix / muscle (part des séries par zone de reps : force ≤ 5, mix 6-8, muscle ≥ 9 — vérifie si faits.js a déjà une notion de zone et réutilise-la) ; muscle de l'année avec les deux suivants (en séries) ; exercice de l'année avec les deux suivants (séances, reps) ; séance la plus lourde (tonnage, date, titre) ; barres de l'année (squat, couché, soulevé, militaire à la barre) 2025 → 2026, avec dans un encadré à part « Rapporté à ton poids de corps ce jour-là » (%), et le total des trois grandes avec l'écart à 2025 ; ce qui a le plus avancé (noms complets des exercices ; haltères en poids total des deux) ; le coach (paris tenus sur paris faits) ; écran du jeu branché sur la fonction du jeu (rien en base) ; plaque finale à partager, sans le coach.
- Comparaison 2026 contre 2025. Année incomplète (moins de 12 mois de données) : début contre fin de la période. Moins de 2 mois de données : les faits seulement, aucune comparaison.
- « Ce qui a le plus avancé » suit la règle « moins pratiqué » de Ton parcours (réutilise-la). Les records = nouvelles charges maximales seulement.
- % du poids de corps : poids du jour estimé entre les deux pesées qui encadrent la performance (au plus 60 j de chaque côté) ; sinon la pesée la plus proche à 45 j au plus, avec « ≈ » ; sinon pas de %.
- Jamais : l'assiduité, le nombre de séances, la santé, une comparaison à une autre personne.
- Partage en image de chaque écran (sur l'appareil, sans serveur).
- Annonce : un seul message dans l'app à l'ouverture, le 1er janvier (une fois par personne et par année, mémorisé sur l'appareil ET dans le profil si une colonne adaptée existe déjà ; sinon sur l'appareil seulement, et dis-le). Le bilan reste accessible depuis Progression toute l'année suivante.
- Écartés : « Ton moment », la devinette.

## 2. Où cela vit (implémentation du prompt 95)

| Quoi | Où |
|---|---|
| Le moteur, pur, la période en paramètre | `v2/js/bilans.js` — `bilanDeLaPeriode`, `periodeDeLAnnee`, `periodeDuMois` (prête, sans écran), `poidsDuJour`, `comparaisonDe` |
| L'entrée, le bilan mémorisé, les faits du jeu bornés | `v2/js/faits.js` — `entreeDuBilan`, `bilanDePeriode`, `faitsDuJeuDeLaPeriode` |
| L'écran (mots, défilement, pause, `ajuste()`, partage en image, annonce) | `v2/js/annee.js` |
| Le bloc de Progression, l'annonce, l'accès de développement | `v2/js/app.js` (« 95 — TON ANNÉE ») |

Ce qui est réutilisé, jamais recopié : `Modele.estTravail`, `Bilan.volumeKg`, `Semaine.compteSeriesTravail`,
`Semaine.volumeParMuscle`, `Bilan.compterParis`, `Bilan.comparaison`, et de « Ton parcours » la règle « moins
pratiqué » (`Parcours.pratique`) et la comparaison à reps égales (`Parcours.aRepsEgales`), extraites du parcours sans
en changer le calcul. faits.js n'avait pas de notion de « zone de reps » force / mix / muscle (ses zones sont des
zones de MUSCLES ; celles du moteur, `lourd` 3-5 / `mix` 6-8 / …, rangent autrement le 8) : la table
`ZONES_DE_REPS` vit dans `bilans.js`, une fois.

## 3. Les choix tranchés en route (prompt 95), à valider

1. **« Mois de données »** : les mois civils qui ont au moins une série de travail, de la première séance à la fin de
   la période. 12 ou plus, et l'année d'avant a des séries : contre elle. Sinon, avec au moins 2 mois de données dans
   l'année : « début contre fin » — la moitié des jours entre la première et la dernière série de l'année
   (« en début d'année »). Sinon : aucune comparaison.
2. **Ce qui a le plus avancé** : un exercice se compare s'il n'est ni « moins pratiqué », ni « nouveau », ni « peu »
   (5 séances de chaque côté) et a au moins deux nombres de reps en commun (la règle 4 du parcours). Il progresse sur
   ↑ ou ↗. Le plus avancé : le plus grand rapport charge d'après / charge d'avant à un même nombre de reps. La plaque
   dit « exercices qui progressent : k / n » sur ces comparés. Haltère (`equipement = 'haltere'`) : × 2 à l'affichage.
3. **La barre la plus lourde** : la charge la plus lourde d'une série de travail d'au moins 1 rep (celle de la table
   des records, `recordsDeLExercice(...).lourde`, vérifié par un test) ; « la plus lourde de ta vie » si elle dépasse
   tout ce qui précède l'année (et qu'il y a un avant).
4. **Le tonnage** ne double pas les haltères (comme le bilan du mois, `Bilan.volumeKg`) ; seul « ce qui a le plus
   avancé » les montre en total des deux.
5. **Le profil** : la maquette écrit « force, 6 reps ou moins · mix, 7 à 8 » ; la décision dit force ≤ 5, mix 6-8 :
   c'est la décision qui est codée (« 5 reps ou moins », « 6 à 8 reps »). Titre : « Plutôt {premier} que {second}. »,
   ou « Plutôt entre les deux. » quand le mix domine.
6. **L'écran du jeu** : le niveau à la fin de l'année (`Jeu.etatDuJeu` sur le corpus borné), le niveau du début et
   les succès gagnés dans l'année ; aucun nombre de semaines (assiduité). Jeu éteint : pas d'écran.
7. **L'ouverture** (« 2026 — Ton année sous la barre. ») précède les douze écrans, comme dans la maquette.
8. **Le coach** : paris vérifiés de l'année ; « depuis le … » quand le premier est venu en cours d'année ; aucun pari
   vérifié : pas d'écran.
9. **L'annonce** : en janvier, à la première ouverture, une fois par personne et par année — **sur l'appareil
   seulement** (`localStorage`) : aucune colonne de `profiles` ne s'y prête. À partir de l'année 2026 (la première).
10. **Le bloc de Progression** : « Ton année {N−1} » toute l'année N (N−1 ≥ 2026) ; hors production, celui de l'année
    en cours quand l'écoulée n'en a pas.
11. **L'accès de développement** : `?bilan=AAAA`, là où la garde du coach est active (localhost, aperçus
    `*.pages.dev`, ou `?garde=1`) — comme `?rejouer=`.
12. **Le partage** : l'écran redessiné sur un canevas (1080 × 1920, Archivo), la feuille de partage de l'appareil
    (`navigator.share` avec un fichier), sinon un téléchargement. Aucun serveur.
13. **« Voir le détail par muscle »** ouvre « Ton parcours ».
