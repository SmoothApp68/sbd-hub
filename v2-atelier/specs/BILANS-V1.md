# Bilans — v1 (« Ton année », la saison et le mois)

**Statut** : décisions d'Aurélien du 12 et du 14/10/2026, écrites ici mot pour mot (prompt 95). Maquette figée le
12/10/2026 : [`maquette-ton-annee-v11.html`](../maquettes/maquette-ton-annee-v11.html) — le contrat visuel. Les données
qu'elle montre sont celles d'aurel_br en 2026 : elles servent d'exemple, pas de fixture.

## 1. Les décisions (12 et 14/10/2026)

- Un seul moteur de bilan, avec la période en paramètre (année, saison, mois) : mêmes règles, même partage, seule la fenêtre change. CE PROMPT CODE L'ANNÉE SEULEMENT. Le moteur accepte une période, mais les versions saison et mois attendent leur maquette (Claude.ai) : pas d'écran pour elles, et le bilan du mois actuel ne bouge pas.
- Les 12 écrans de l'année : tonnes de l'année + équivalence (éléphants de 6 t) ; mois par mois (le plus lourd) ; reps et séries ; profil force / mix / muscle (part des séries par zone de reps : force ≤ 5, mix 6-8, muscle ≥ 9 — vérifie si faits.js a déjà une notion de zone et réutilise-la) ; muscle de l'année avec les deux suivants (en séries) ; exercice de l'année avec les deux suivants (séances, reps) ; séance la plus lourde (tonnage, date, titre) ; barres de l'année (squat, couché, soulevé, militaire à la barre) 2025 → 2026, avec dans un encadré à part « Rapporté à ton poids de corps ce jour-là » (%), et le total des trois grandes avec l'écart à 2025 ; ce qui a le plus avancé (noms complets des exercices ; haltères en poids total des deux) ; le coach (paris tenus sur paris faits) ; écran du jeu branché sur la fonction du jeu (rien en base) ; plaque finale à partager, sans le coach.
- Comparaison 2026 contre 2025. Année incomplète (moins de 12 mois de données) : début contre fin de la période. Moins de 2 mois de données : les faits seulement, aucune comparaison.
- « Ce qui a le plus avancé » suit la règle « moins pratiqué » de Ton parcours (réutilise-la). Les records = nouvelles charges maximales seulement.
- % du poids de corps : poids du jour estimé entre les deux pesées qui encadrent la performance (au plus 60 j de chaque côté) ; sinon la pesée la plus proche à 45 j au plus, avec « ≈ » ; sinon pas de %.
- Jamais : l'assiduité, le nombre de séances, la santé, une comparaison à une autre personne. *(En partie remplacé le 15/10/2026 : voir ci-dessous.)*
- Partage en image de chaque écran (sur l'appareil, sans serveur).
- Annonce : un seul message dans l'app à l'ouverture, le 1er janvier (une fois par personne et par année, mémorisé sur l'appareil ET dans le profil si une colonne adaptée existe déjà ; sinon sur l'appareil seulement, et dis-le). Le bilan reste accessible depuis Progression toute l'année suivante.
- Écartés : « Ton moment », la devinette.

### Décision du 15/10/2026 (prompt 97) — les heures et les jours à la salle

« Les bilans montrent le nombre d'heures et de jours à la salle de la période, comme un fait, jamais comparés à une autre période (aucun écart, aucune flèche) : une période moins assidue ne se lit jamais comme un échec. Un écran à eux, juste après les tonnes, avec une équivalence (« ≈ 11 jours entiers sous la barre »). Les jours = jours distincts avec une séance terminée (heure de Paris) ; les heures = somme des durées des séances terminées qui ont une fin, une séance de plus de 5 h n'étant pas comptée dans les heures. Le nombre de séances lui-même n'est toujours pas affiché. »

Repère réel : aurel_br en 2026 au 15/10, environ 180 jours et 260 heures.

*Complétée le 16/10/2026 (audit du 16/10, prompt 119)* : **seules les séances de musculation comptent**, en heures
comme en jours. Une séance de musculation porte au moins une série de travail d'un exercice qui porte du volume
(au moins un muscle principal au catalogue, la règle de `compteSeriesTravail` ; un exercice inconnu du catalogue
compte) — `THSemaine.estSeanceDeMusculation`. Une randonnée, un vélo, une natation ou un tapis seul ne comptent ni en
heures ni en jours ; une séance de gainage en est une ; une séance mixte (« Rando avec Léa + Pull », CADRAGE §2 ter)
compte en entier ; une séance sans aucune série en cache ne compte pas (on ne dit pas ce qu'on ne sait pas). Le repère
ci-dessus contient des sorties : il baisse.

### Décisions du 14-15/10/2026 (prompt 98) — la saison et le mois

Maquette validée par Aurélien le 15/10/2026 : [`maquette-saison-mois-v1.html`](../maquettes/maquette-saison-mois-v1.html),
à laquelle le prompt 98 ajoute l'écran « À la salle » juste après les tonnes (décision du 15/10).

- Un seul moteur pour l'année, la saison et le mois : mêmes règles, même partage ; seule la fenêtre change.
- Saison et mois : ~6 écrans (+ « À la salle ») : tonnes et équivalence, à la salle, semaine par semaine (la plus lourde), exercice ou muscle phare avec les deux suivants, records (nouvelles charges max), ce qui a le plus avancé, le coach (paris tenus), la plaque à partager. Comparaison à la saison ou au mois précédent (tonnes seulement, comme l'année ; jamais les heures ni les jours). Moins de 3 semaines de données dans la période : les faits seulement, sans comparaison.
- Saisons météorologiques : hiver déc.→févr., printemps mars→mai, été juin→août, automne sept.→nov. Hiver = « Winter Arc » pour tout le monde. Les autres suivent la phase du profil au début de la saison : prise de masse → Spring Bulk / Summer Bulk / Bulk Season ; sèche → Summer Prep / Summer Shred / Fall Cut ; maintien ou recomposition (et sans phase) → Spring Arc / Summer Arc / Fall Arc. Vérifie le nom réel des phases dans le code.
- La story du mois REMPLACE le bilan du mois actuel de Progression : elle en reprend tout le contenu (les records du mois, les paris du coach — le détail des paris au toucher). Rien ne doit se perdre : liste ce que l'ancien bilan montrait et où chaque élément se retrouve.
- Annonce : un seul message dans l'app à l'ouverture, le premier jour de la saison suivante (1er déc., 1er mars, 1er juin, 1er sept.) ou le 1er du mois (mémorisé sur l'appareil, comme l'année). La saison et le mois passés restent accessibles depuis Progression.
- Jamais : le nombre de séances, une comparaison des heures ou des jours, la santé, une comparaison à une autre personne. Pas de partage du coach sur la plaque.
- Accès de développement : `?bilan=2026-10` (mois) et `?bilan=2026-automne` (saison), hors production, comme `?bilan=2026`.

Les noms réels des phases (vérifiés dans `v2/js/profil.js`, contrainte `profiles_phase_valeurs`) : `prise_de_masse`,
`seche`, `maintien` ; vide = `maintien`.

### Décision du 16/10/2026 (prompt 104) — l'annonce mémorisée dans le profil

« L'annonce d'un bilan est mémorisée dans le profil ; elle ne revient pas sur un autre appareil. »

- Colonne `profiles.bilans_annonces` (`text[] NOT NULL DEFAULT '{}'`, au plus 200 — migration `v2_086`) : la liste des
  périodes déjà annoncées, par leur clé (`'2026'`, `'2026-ete'`, `'2026-09'`). Elle remplace « sur l'appareil seulement »
  dans les décisions ci-dessus (l'année et la saison et le mois).
- Une période est annoncée si elle n'est **ni** dans la colonne **ni** dans la mémoire de l'appareil. À l'affichage de
  l'annonce, elle s'ajoute aux deux : au profil par son chemin d'écriture (la liste blanche `CHAMPS_ECRITS`, l'envoi
  rejoué au retour du réseau), à l'appareil pour le hors-ligne. Les périodes notées vues avec elle (le même jour, un
  seul message) s'y ajoutent aussi. La liste ne garde que les 200 dernières périodes.
- L'annonce attend la lecture du profil (au plus 5 s) : décider sur le seul cache la reposerait sur un appareil neuf.
- Un profil jamais lu (appareil neuf, hors réseau) ne se crée pas d'une annonce : l'appareil retient seul.
- **La colonne est facultative** pour l'app (`COLONNES_FACULTATIVES`, `v2/js/donnees.js`) : tant que `v2_086` n'est pas
  lancée, la base la refuse (`42703` à la lecture, `PGRST204` à l'écriture) ; elle quitte alors la lecture et
  l'écriture pour la session, et le profil se lit et s'écrit sans elle — le défaut de #418 (une colonne nommée avant
  sa migration : plus de profil) ne se reproduit pas. L'appareil retient seul en attendant.

### Décisions du 16/10/2026 (audit du 16/10, prompt 119) — les mesures en durée et en distance

Aurélien, 16/10/2026 : « Pour l'exercice du mois, le tapis ne devrait pas apparaître » ; « Pour les exercices
calculés en temps, il ne faut pas mettre les reps ».

- **L'exercice du mois, de la saison, de l'année** (et les deux suivants) : seulement les exercices mesurés en reps
  (`mesure` ∈ {`charge_reps`, `reps`}, `THModele.seMesureEnReps`), avec au moins une rep dans la période — jamais le
  tapis, une randonnée ou une planche. **Classés par le chiffre affiché** : la saison et le mois montrent les reps, ils
  se classent par les reps (puis les séances) ; l'année montre les séances puis les reps, elle se classe ainsi.
- « rep » s'accorde par une seule fonction (`THModele.repsTexte`) : « 0 rep », « 1 rep », « 2 reps ».
- **À la salle** : seulement les séances de musculation (décision du 15/10 complétée, ci-dessus).
- **Une période de seules sorties est vide** : `vide`, et les semaines ou les mois de données de la comparaison, se
  lisent sur les séries de musculation (`THSemaine.estSerieDeMusculation`) — un mois de randonnées n'a pas de story
  (« 0 t soulevées ») et ne s'annonce pas ; trois semaines de sorties n'ouvrent pas de comparaison.
- **Le bloc du mois écoulé** (Progression) : sans tonnes, il dit ses séries de travail (« 24 séries de travail », un
  mois au poids du corps), et « Pas encore de série de travail » seulement quand il n'en a aucune.

## 2. Où cela vit (implémentation des prompts 95, 97 et 98)

| Quoi | Où |
|---|---|
| Le moteur, pur, la période en paramètre | `v2/js/bilans.js` — `bilanDeLaPeriode`, `periodeDeLAnnee`, `periodeDuMois` (prête, sans écran), `poidsDuJour`, `comparaisonDe` |
| L'entrée, le bilan mémorisé, les faits du jeu bornés | `v2/js/faits.js` — `entreeDuBilan`, `bilanDePeriode`, `faitsDuJeuDeLaPeriode` |
| Les heures et les jours à la salle (97), pour toute période | `v2/js/faits.js` — `tempsALaSalle`, passé dans l'entrée (`salle`) ; le moteur le rend (`bilan.salle`) |
| L'écran (mots, défilement, pause, `ajuste()`, partage en image, annonce) | `v2/js/annee.js` |
| Le bloc de Progression, l'annonce, l'accès de développement | `v2/js/app.js` (« 95 — TON ANNÉE ») |
| La saison et le mois (98) : les périodes, les saisons, leur nom, la comparaison à 3 semaines, semaine par semaine, les nouvelles charges max | `v2/js/bilans.js` — `periodeDeLaSaison`, `periodeDuMois`, `saisonDuJour`, `nomDeSaison`, `comparaisonDe`, `bilan.semaines`, `bilan.records`, `bilan.tonnes.avant/ecart` |
| La phase au début de la saison | `v2/js/profil.js` — `phaseAuJour` |
| Les écrans de la saison et du mois | `v2/js/annee.js` — `ecransDePeriode`, `titreDe` (le même lecteur que l'année) |
| La story du mois à la place de l'ancien bilan, le bloc de la saison, les annonces, `?bilan=AAAA-MM` et `?bilan=AAAA-saison` | `v2/js/app.js` (« 98 — LA SAISON ET LE MOIS » : `ouvrirBilan`, `rendreMois`, `saisonDuSommaire`, `annoncerUnBilan`) |
| Les bilans annoncés (104) : la liste, ses 200 dernières, la colonne facultative | `v2/js/profil.js` — `bilansAnnonces`, `ajouterBilansAnnonces`, `CHAMPS_ECRITS` ; `v2/js/donnees.js` — `COLONNES_FACULTATIVES` ; `v2/js/app.js` — `annonceDejaVue`, `noterAnnonces`, `apresSynchroAnnee` |

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
   *(Remplacé le 16/10/2026, prompt 104 : mémorisée dans le profil et sur l'appareil — voir §1.)*
10. **Le bloc de Progression** : « Ton année {N−1} » toute l'année N (N−1 ≥ 2026) ; hors production, celui de l'année
    en cours quand l'écoulée n'en a pas.
11. **L'accès de développement** : `?bilan=AAAA`, là où la garde du coach est active (localhost, aperçus
    `*.pages.dev`, ou `?garde=1`) — comme `?rejouer=`.
12. **Le partage** : l'écran redessiné sur un canevas (1080 × 1920, Archivo), la feuille de partage de l'appareil
    (`navigator.share` avec un fichier), sinon un téléchargement. Aucun serveur.
13. **« Voir le détail par muscle »** ouvre « Ton parcours ».

## 4. Les choix tranchés en route (prompt 97), à valider

1. **Séance terminée** : toute séance qui n'est pas `en_cours` (la règle de `entreeDuBilan`). Son jour : le jour civil
   de son début, à l'heure de l'appareil (Paris).
2. **Les heures** : seule une séance avec une fin postérieure à son début compte ; exactement 5 h compte, au-delà non
   (son jour compte quand même). Le chiffre est arrondi à l'heure.
3. **L'équivalence** : « ≈ N jours entiers sous la barre » (jours de 24 h, arrondis) dès 36 h ; en dessous, pas
   d'équivalence. Aucune séance avec une fin : l'écran montre les jours seuls.
4. **L'écran** (`salle`) : « À la salle », le chiffre des heures, « sur N jours. » puis l'équivalence. Il ne figure
   pas sur la plaque finale (elle garde ses six cases).
5. **La période** : du premier jour de la période à aujourd'hui (ou à sa fin) ; le même calcul sert l'année, la saison
   et le mois.

## 5. Les choix tranchés en route (prompt 98), à valider

1. **Les écrans.** Saison : tonnes (avec le nom de la saison en titre et la plage des mois) · à la salle · semaine par
   semaine · l'exercice de la saison (ses reps) et les deux suivants · nouvelles charges max · ce qui a le plus avancé ·
   le coach · la plaque. Mois : tonnes · à la salle · semaine par semaine · le muscle du mois et les deux suivants ·
   l'exercice du mois et les deux suivants · les records du mois · ce qui a le plus avancé · le coach · la plaque. Le
   mois porte les deux phares (muscle ET exercice) parce que l'ancien bilan montrait les deux. Pas d'écran
   d'ouverture (la maquette commence par les tonnes). Un écran sans donnée ne paraît pas.
2. **La comparaison** : contre la saison ou le mois d'avant, si la période a au moins 3 semaines de données (semaines du
   lundi avec au moins une série de travail) ET la période d'avant au moins une série ; sinon aucune. Jamais « début
   contre fin » pour une saison ou un mois. Elle ne s'affiche que sur les tonnes (« +38 t sur l'été », « −1 t sur
   septembre », « Comme en septembre. ») ; « ce qui a le plus avancé » compare aussi à la période d'avant (c'est sa
   nature), il ne paraît qu'avec une comparaison. Les barres de l'année (« 2025 → 2026 ») ne sont pas un écran de la
   saison ni du mois.
3. **Le nom de la saison** suit la phase au début de la saison : le profil ne garde que la phase en cours et son début
   (`phase_depuis`). Une phase commencée après le début de la saison : la phase d'avant n'est écrite nulle part, on dit
   le défaut (« Arc »). L'hiver 2026 s'appelle « Winter Arc 2026 » (décembre 2026 → février 2027).
4. **Les records** : la saison dit ses nouvelles charges max (la charge la plus lourde de la période, série de travail
   d'au moins 1 rep, au-dessus de tout ce qui précède ; sans avant, pas de record ; haltères « 2 × »). Le mois dit
   TOUS ses records (`faits.recordsDuMois`, ceux de l'ancien bilan et de la maquette : « 2 × 50 kg × 6 »), les trois
   premiers puis « Et N autres », et « Tous les records du mois » ouvre la liste (chaque record mène à sa séance).
5. **Le coach** : « N / M paris tenus » ; « Le détail des paris » déplie au toucher les paris vérifiés, les tenus et la
   phrase de l'ancien bilan (`Bilan.phraseParis`) — l'écran ne défile plus tant que le détail est ouvert.
6. **La semaine** : du lundi au dimanche ; seules les séances de la période comptent (la première et la dernière
   semaine peuvent être partielles). « La plus lourde : semaine du 12 octobre, 52 t. »
7. **L'annonce** : du 1er au 7 du mois (le seul premier jour manquerait qui n'ouvre pas l'app ce jour-là), une fois par
   personne et par période, sur l'appareil (`localStorage`) — *dans le profil aussi depuis le 16/10/2026 (104, §1)*. Le même jour, un seul message : l'année (en janvier),
   sinon la saison (1er déc., mars, juin, sept.), sinon le mois ; les autres sont notés vus et restent dans
   Progression. Une période vide n'est pas annoncée.
8. **Progression** : le bloc du mois écoulé garde son titre (« Septembre ») et dit ses tonnes, ses records et ses paris
   — plus son nombre de séances ; il ouvre la story. Le bloc de la saison (« Summer Arc 2026 ») : la saison écoulée,
   toute la saison suivante ; hors production, la saison en cours si l'écoulée est vide. `/progression/mois/AAAA-MM`
   ouvre la story du mois par-dessus Progression (tous les mois restent ouvrables par l'adresse) ; la fermer rend
   `/progression`.
9. **L'exercice phare** ouvre sa page (« Voir l'exercice », et chaque nom des deux suivants) ; le retour rend la story
   du même mois.
10. **La plaque** : le titre (« Fall Arc 2026 », « Octobre 2026 »), le nom, les tonnes, les records (nombre et noms
    courts, sans doublon), le plus gros progrès, l'exercice de la saison ou le muscle du mois. Jamais le coach.
    « Partager ma saison » / « Partager mon mois ». L'image partagée porte le titre de la période.

### Ce que l'ancien bilan du mois montrait, et où c'est maintenant

| L'ancien bilan du mois | La story du mois |
|---|---|
| Le nombre de séances | **Retiré** — décision du 14/10 : « Jamais : le nombre de séances » |
| Les séries de travail du mois | Écran « Ton muscle du mois » : « Sur N séries de travail ce mois-ci. » |
| Le volume soulevé | Écran des tonnes (et l'équivalence) |
| Le nombre de records | Écran « Tes records d'… » et la plaque |
| Le temps d'entraînement | Écran « À la salle » (heures et jours, jamais comparés) |
| Les séries, mois par mois (trois mois) | Remplacé par « Semaine par semaine » (en tonnes) — **une comparaison de séries entre mois disparaît** (tonnes seulement) |
| Le calendrier des jours faits | Remplacé par le nombre de jours de « À la salle » — le calendrier lui-même disparaît |
| Les records (trois, puis « et N autres », puis tous) | Écran « Tes records d'… » : les trois, « Et N autres », « Tous les records du mois » (la même liste, chacun mène à sa séance) |
| Les séries par muscle, à côté du mois d'avant | Le muscle du mois et les deux suivants, en séries — **le chiffre du mois d'avant disparaît** (tonnes seulement), et les muscles au-delà du troisième (la page « Ton parcours » les détaille, « Voir le détail par muscle ») |
| Les exercices les plus faits (cinq, chacun ouvre sa page) | L'exercice du mois et les deux suivants (en reps), chacun ouvre sa page — trois au lieu de cinq |
| Les paris du coach : vérifiés, tenus, la phrase | Écran « Le coach » : « N / M », et au toucher les vérifiés, les tenus et la phrase |
| ‹ › mois précédent, mois suivant | L'adresse `/progression/mois/AAAA-MM` ouvre n'importe quel mois ; Progression porte le mois écoulé ; la liste des records garde ‹ › |
