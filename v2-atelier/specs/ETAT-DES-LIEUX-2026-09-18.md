# ÉTAT DES LIEUX — 18 septembre 2026

> Relevé **en lecture seule** pendant le chantier 46, écran par écran, en réponse à son §4 :
> *« parcours l'app et dis ce qui est branché et ce qui ne l'est pas ».*
>
> ⚠️ **On signale, on ne corrige pas.** Une trouvaille corrigée au milieu d'un lot de trois
> parties devient impossible à attribuer. **Rien n'a été corrigé ici.**

> **Ce document est une liste à dépiler**, comme l'audit du 14/09. Chaque entrée porte son
> emplacement. Un défaut corrigé se barre, il ne disparaît pas : sa trace explique pourquoi le
> code est comme il est.

## Ce qu'il vaut, et ce qu'il ne vaut pas

Ce relevé est **une lecture du code**, pas une exécution. Il dit ce que les greps montrent.
Un échantillon a été **re-vérifié à la main** avant publication :

| Trouvaille | Vérifiée |
|---|---|
| `rendreListeSeances` (rendu.js:102) sans aucun appelant, exportée **deux fois** | ✅ |
| `var api` (rendu.js:2758) construit et jamais affecté à `racine.THRendu` | ✅ |
| `etat.local` écrit par `sync.js` et `attente.js`, lu **nulle part** (`rendreEtat` ne lit que `code` et `libelle`) | ✅ |
| `#vue-profil` : un paragraphe, aucun id, aucune classe lue, aucune requête `profiles` | ✅ |

**Le reste est à confirmer avant d'agir.** Une entrée de ce document justifie d'aller
regarder ; elle ne justifie pas d'écrire du code sans avoir regardé.

## Lecture rapide

| Écran | répond | inerte | manque | sans raison |
|---|---|---|---|---|
| Accueil / liste des séances | 15 | 15 | 8 | 11 |
| Progression | 13 | 11 | 8 | 11 |
| Bibliothèque de routines | 15 | 13 | 8 | 12 |
| Séance en cours | 24 | 13 | 6 | 7 |
| Page exercice | 17 | 12 | 9 | 16 |
| audit 14/09 | 11 | 29 | 17 | 13 |
| transversal | 8 | 17 | 9 | 10 |

---

## Accueil / liste des séances (`#vue-liste`) et détail d'une séance (`#vue-detail`) — v2/index.html:43-71, rendus par v2/js/app.js (`rendreSemaine` l.416-439, `rendreDetail` l.2788-2800) et v2/js/rendu.js (`rendreBarreSemaine` l.526, `rendreRappel` l.576, `rendreJours` l.766, `rendreDetail` l.206, `rendreBloc` l.168).

Les deux écrans sont câblés de bout en bout : les huit identifiants présents dans `#vue-liste` et `#vue-detail` sont tous lus par `v2/js/app.js`, et aucun gestionnaire `vue.surXxx` attendu par `rendreJours`/`rendreDetail` n'est laissé vide par l'appelant. Le tissu mort est ailleurs : `rendreListeSeances` (rendu.js:102) — l'ancien rendu de la liste — n'a plus aucun appelant mais reste exporté deux fois, avec ses deux règles CSS `.seance-date`/`.seance-salle` que plus rien ne produit, et un objet `var api` (rendu.js:2758) déclaré puis jamais lu.
Trois valeurs voyagent jusqu'à l'écran et n'y arrivent pas : `etat.local` (écrit par sync.js et attente.js, lu par personne), `rpe`/`ressenti` (lus en base, cachés, jamais affichés au détail), et la note d'exercice (§7 septies.1, 196 couples en base). Un commentaire de rendu.js:407 affirme même l'inverse pour l'effort.
Les contradictions les plus nettes portent sur la séance « incomplète » et sur le retour : la carte dit « séries pas encore reçues », le détail de la même séance dit « Aucune série sur cette séance. » ; le menu ⋯ lui est refusé dans la liste, les trois mêmes gestes lui sont offerts au détail — et « Modifier » y ouvre une séance vide dont l'enregistrement pose un `remplacerSeries(id, [])` qui efface toutes ses séries. Enfin « ← Séances » empile une entrée d'historique au lieu de la remonter, à l'inverse du bouton de la page d'exercice qui a été corrigé pour exactement cette raison.
Côté spec, quatre réponses décidées manquent : le balayage horizontal entre semaines, la recherche par titre, le saut à une année, et le bandeau de séance en cours sur l'Accueil.


### Là, mais inerte — 15

*Affiché ou écrit, et qui ne fait rien.*

- **`rendreListeSeances` — le rendu de liste « plate » de l'Accueil, remplacé par `rendreJours` mais jamais supprimé. Il produit un balisage complet (carte, date, salle) que rien n'affiche.**
  `v2/js/rendu.js:102-131, exporté deux fois (rendu.js:2778 et rendu.js:2833)`
  <br>*Preuve :* `grep -rn "rendreListeSeances" --include=*.js --include=*.html --include=*.md .` sur tout le dépôt ne rend que 4 lignes : la définition (rendu.js:102), un COMMENTAIRE qui la cite comme « le jumeau » (rendu.js:795) et les deux lignes d'export. Zéro site d'appel, y compris dans tests/.
- **`var api = { … }` — un objet de 23 entrées construit puis jamais référencé (doublon de la queue de `racine.THRendu`).**
  `v2/js/rendu.js:2758-2782`
  <br>*Preuve :* `grep -n "\bapi\b" v2/js/rendu.js` ne rend QUE la ligne 2758. Contrairement aux autres modules (routeur.js:214+233, sync.js:247+264), rien ne fait `racine.THRendu = api`.
- **Règles CSS `.seance-date` et `.seance-salle` : elles ne sont produites que par la fonction morte ci-dessus, donc jamais appliquées en pratique.**
  `v2/styles.css:139 et v2/styles.css:141`
  <br>*Preuve :* `grep -rn "seance-date" v2/js/` → une seule occurrence, rendu.js:116, à l'intérieur de `rendreListeSeances`. Idem `seance-salle` → rendu.js:126. `rendreJours` (rendu.js:766-820) ne produit ni l'une ni l'autre.
- **Le champ `salle` du résumé de séance : calculé pour chaque carte de l'Accueil et jamais lu par le rendu qui le reçoit.**
  `v2/js/modele.js:997 (`salle: seance.salle_norme || seance.salle || ''`)`
  <br>*Preuve :* `rendreJours` (rendu.js:766-820) n'accède jamais à `r.salle` ; le seul lecteur est `rendreListeSeances` rendu.js:126, qui n'a pas d'appelant.
- **`etat.local` — le drapeau « ces données viennent de l'appareil », posé par les deux décideurs d'état et lu par AUCUN code de production. C'est le piège n° 2 de SCHEMA-REEL (valeur écrite, personne ne s'en sert), transposé au modèle de vue de l'Accueil.**
  `écrit v2/js/sync.js:236, 241, 243, 244 et v2/js/attente.js:405-407 ; consommateur attendu v2/js/rendu.js:493-500`
  <br>*Preuve :* `grep -rn "\.local\b" --include=*.js v2/js/` → AUCUN résultat. `rendreEtat` (rendu.js:496-499) n'utilise que `etat.libelle` et `etat.code`. Le champ n'est assuré que par les tests : tests/unit/v2-sync.test.js:118, 124, 236.
- **Les trois états d'écriture de la file (`bloque`, `echec`, `a-envoyer`) posent bien leur classe sur `#etat-sync`, mais aucune règle CSS ne les distingue : la pastille d'une file BLOQUÉE est du même gris que celle de « Données locales ».**
  `codes produits v2/js/attente.js:405-407, appliqués v2/js/rendu.js:497 ; feuille v2/styles.css:85-91`
  <br>*Preuve :* `grep -n "bloque\|echec\|a-envoyer" v2/styles.css` → aucun résultat. Les seuls codes stylés sont `.a-jour`, `.local`, `.vide`, `.partiel`, `.sync` (styles.css:86-91).
- **Les classes de tag `.tag.d` (dégressive) et `.tag.x` (échec) sont produites sur le détail et n'ont aucune règle CSS — seule `.tag.c` (chauffe) en a une. Dans un superset, une dégressive et une chauffe affichent toutes deux la lettre nue de leur exercice, sans rien qui les sépare à part la couleur que seule la chauffe reçoit.**
  `produites v2/js/rendu.js:197 via `ETIQUETTE_TYPE` rendu.js:1170-1174 ; CSS v2/styles.css:183-188`
  <br>*Preuve :* `grep -n "\.tag" v2/styles.css` rend exactement 3 lignes : 183 (`.tag`), 185 (`.serie.hors-travail .tag`), 188 (`.serie.hors-travail .tag.c`). Ni `.tag.d` ni `.tag.x`.
- **L'effort saisi (`rpe`, `ressenti`) est lu du serveur, mis en cache et jamais affiché sur le détail. Le commentaire qui précède l'historique d'exercice affirme pourtant que « `rendreBloc` sait déjà tout ça » pour l'effort.**
  `colonnes lues v2/js/seance.js:79-83 → donnees.js:103 ; formateur `texteEffort` v2/js/rendu.js:1344-1347 ; commentaire faux v2/js/rendu.js:407-408`
  <br>*Preuve :* `grep -n "texteEffort" v2/js/rendu.js` → 3 lignes : la définition (1344), UN seul appel (1996, dans `rendreLigneSerie` de l'écran de saisie/éditeur) et l'export (2802). `rendreBloc` (rendu.js:168-204) n'ajoute que `tag` et `mesure`.
- **`Calendrier.semaineDuJour` — fonction exportée dont le seul consommateur est sa propre suite de tests ; le rendu utilise `ligne.lundi` directement.**
  `v2/js/calendrier.js:84-88, exportée calendrier.js:108`
  <br>*Preuve :* `grep -rn "semaineDuJour" --include=*.js v2/ tests/` → définition, export, et 3 lignes dans tests/unit/v2-calendrier.test.js (53, 65, 85). Aucun appel dans v2/js/. `rendreCalendrier` (rendu.js:700) passe `ligne.lundi`.
- **Le champ `date` de chaque jour du calendrier est construit et n'est lu par aucun rendu (seuls `jour`, `horsMois`, `points` le sont).**
  `v2/js/calendrier.js:71 ; consommateur v2/js/rendu.js:694-701`
  <br>*Preuve :* `rendreCalendrier` lit `j.jour` (696), `j.horsMois` (694), `j.points` (699) — jamais `j.date`. Les seuls lecteurs de `j.date` sont tests/unit/v2-calendrier.test.js:53, 65, 85.
- **`aria-labelledby="fen-muscle-titre"` pointe sur un identifiant qui n'existe nulle part — ni dans le HTML, ni produit par le JS. La fenêtre de muscle est ouverte depuis la ligne de rappel de l'Accueil (via Volume).**
  `v2/index.html:201`
  <br>*Preuve :* `grep -rn "fen-muscle-titre" v2/ --include=*.js --include=*.html --include=*.css` → une seule ligne, index.html:201 elle-même. Le contenu est injecté dans `#fen-muscle-contenu` (app.js:2716), qui ne porte pas cet id.
- **`aria-label="Série"` est figé sur le voile `#feuille-seance`, qui sert de feuille générique à treize usages différents — dont le menu ⋯ d'une carte de l'Accueil et la confirmation de suppression du détail. Un lecteur d'écran y annonce « Série » pour « Supprimer cette séance ? ».**
  `v2/index.html:210`
  <br>*Preuve :* `grep -rn "feuille-seance" v2/js/` → 13 `ouvrirVoile($('feuille-seance'))` (app.js:1706, 1718, 2058, 2343, 2359, 2380, 2416, 2553, 2986, 3006, 3027, 3086) + le clic sur le voile (3357). Aucun ne repose l'`aria-label` ; seul `#feuille-contenu` est rempli.
- **`racine.THApp = { ajouterGarde, retirerGarde }` — surface globale exposée « pour l'écran de saisie à venir », sans aucun consommateur externe (les deux fonctions ne sont appelées que depuis app.js lui-même).**
  `v2/js/app.js:3462 ; le commentaire l.3460-3461 le dit : « Rien ne s'en sert encore »`
  <br>*Preuve :* `grep -rn "THApp" --include=*.js --include=*.html v2/ tests/` → une seule ligne : app.js:3462.
- **Trois classes purement typographiques de la feuille de style ne sont produites par aucun JS ni aucun HTML : `bilan-chiffre`, `semaine-libelle`, `volume-valeur` — vestiges de l'ancien bilan hebdomadaire de l'Accueil.**
  `v2/styles.css:42, 43, 46`
  <br>*Preuve :* Balayage des 301 classes de styles.css contre `v2/js/` et `v2/index.html` : ces trois-là (avec `puce-cour`/`puce-prec` côté radar) ne sont produites nulle part. `grep -rn "bilan-chiffre\|semaine-libelle\|volume-valeur" v2/js/ v2/index.html` → aucun résultat.
- **Le drapeau `horsTable` porté par chaque zone est exploité par le relevé de Progression mais ignoré par la ligne de rappel de l'Accueil : un paquet « Hors zone » y apparaît avec exactement le même poids visuel qu'une vraie zone.**
  `produit v2/js/semaine.js:170 ; lu v2/js/rendu.js:613 (`.zone.hors-table`, CSS styles.css:249) ; ignoré par `rendreRappel` v2/js/rendu.js:576-598`
  <br>*Preuve :* `grep -n "hors-table" v2/styles.css v2/js/rendu.js` → styles.css:249 et rendu.js:613 uniquement. `rendreRappel` n'accède jamais à `z.horsTable`.

### Ce qui manque — 8

*Décidé en spec, absent du code.*

- **Le balayage horizontal pour changer de semaine. La barre ne propose que les deux flèches et la date ouvrable ; aucun geste tactile n'est branché sur `#barre-seances`.**
  `ECRAN-SAISIE-V1 §7 bis.11 : « Flèches conservées, plus le balayage horizontal, plus la date ouvrable. » La spec ajoute : « Point technique fragile : le balayage horizontal doit cohabiter avec le défilement vertical. À tester sur device tôt, pas à la fin. » Preuve : `grep -rn "touchstart|touchmove|touchend|swipe" v2/js/` → aucun résultat ; les seuls `pointerdown` (app.js:1500, rendu.js:1366, rendu.js:1514) appartiennent au glissement de blocs et à la molette de repos.`
- **La recherche par titre de séance. Aucun champ de recherche n'existe sur l'Accueil ; le seul `type="search"` du dépôt est celui du catalogue d'exercices.**
  `ECRAN-SAISIE-V1 §7 bis.3, réponse n° 2 sur trois : « La recherche par titre. Les séances en ont — “Pecs - Dos”, “Alpes du Liechtenstein”. Un mot suffit à retrouver le bon endroit, quelle que soit l'ancienneté. » Preuve : `grep -n "<input" v2/index.html` → 4 champs seulement (email, mot de passe, nom de routine, `#champ-recherche-exo`).`
- **Le saut direct à un mois ET une année. Le calendrier ne se déplace que d'un mois à la fois : avec 167 semaines d'historique, atteindre janvier 2023 demande une quarantaine d'appuis.**
  `ECRAN-SAISIE-V1 §7 bis.3, réponse n° 3 : « Le saut direct à un mois et une année, pour le cas rare où la date est connue. » — posée précisément contre le constat « reculer semaine par semaine est infaisable ». Preuve : v2/index.html:231-234 ne porte que `#btn-mois-prec` / `#btn-mois-suiv`, branchés sur `Calendrier.decalerMois(…, ±1)` (app.js:3388-3395, calendrier.js:90-93). Aucun sélecteur d'année.`
- **Le bandeau de séance en cours en tête de l'onglet Séances. Le composant existe et sert déjà au brouillon de routine, mais l'Accueil ne le rend pas ; seule la pastille de l'onglet Saisie signale la séance ouverte.**
  `ECRAN-SAISIE-V1 §7 nonies (« COMPOSANT ÉCRIT, non branché ») : « Un bandeau la signale : titre, durée écoulée, séries validées. Deux actions — reprendre, ou terminer. » L'emplacement y est explicitement « non tranché » entre l'en-tête de Séances et un rang permanent. Preuve : `grep -rn "rendreBandeauReprise|bandeau-reprise" v2/js/` → app.js:2028-2040 seulement, dans `rendreSaisie`, pour le brouillon de routine ; `#bandeau-reprise` vit dans `#vue-saisie` (index.html:102), pas dans `#vue-liste`.`
- **La note d'exercice sur le détail. Elle est stockée (projetée sur chaque série), relue (`sets.note` est dans la liste des colonnes lues), et le détail ne l'affiche jamais — la structure de bloc ne la transporte même pas.**
  `ECRAN-SAISIE-V1 §7 septies.1 : « 196 couples séance-exercice portant une note, 185 ont exactement la même note sur toutes leurs séries […] Emplacement : sous le nom de l'exercice, au voisinage du repos cible. » Preuve : `construireBlocs` crée l'exercice sans champ note (v2/js/modele.js:470 : `{ slug, nom, lettre, series, nbTravail }`), et `rendreBloc` (rendu.js:170-183) n'affiche que la lettre et le nom. L'écran de saisie, lui, la porte (`note-exo`, rendu.js:1850).`
- **L'effort (RPE / ressenti) sur le détail et dans l'historique d'exercice. Chaque série l'a potentiellement en base, la donnée est mise en cache, et aucune des deux surfaces de relecture ne la montre.**
  `ECRAN-SAISIE-V1 §7 quater.4, repris en commentaire dans le code : « Chaque séance avec TOUTES ses séries : chauffe en retrait, tentative marquée, effort selon ce qui a été saisi — c'est `rendreBloc` qui sait déjà tout ça. » Preuve : `rendreBloc` (v2/js/rendu.js:168-204) n'appelle jamais `texteEffort` (défini rendu.js:1344, appelé uniquement rendu.js:1996).`
- **Le relibellé « rest-pause » à la relecture d'une dégressive à charges identiques.**
  `MODIFICATEURS-SERIE-V1 §2.2 : « Une dégressive enregistre 100, 80, 60 […] un rest-pause enregistre 100, 100, 100 […] À la relecture, l'app lit les charges et affiche “rest-pause” d'elle-même quand elles sont identiques. On ne stocke que l'observé, l'étiquette se recalcule à l'affichage. » Repris par ECRAN-SAISIE-V1 §2.4 (« Même mécanisme que la dégressive et le rest-pause »). Preuve : `grep -rni "rest.pause" v2/js/ v2/styles.css` → aucun résultat. À vérifier : la portée déclarée de MODIFICATEURS-SERIE-V1 est « l'écran de saisie », ce qui laisse une ambiguïté sur l'écran qui doit porter ce relibellé.`
- **Des en-têtes de colonnes qui suivent la mesure sur le détail. Le détail écrit « Série | Charge » en dur, alors que l'écran de saisie dérive ses en-têtes de la mesure de l'exercice.**
  `ECRAN-SAISIE-V1 §3 ter (« Les quatre mesures, et pourquoi la grille ne peut pas être unique ») et CADRAGE-V2 §2 undecies (« câbler, jamais dupliquer »). Preuve : `rendreBloc` v2/js/rendu.js:182-185 (`'Série'`, `'Charge'` littéraux) contre `enTetesColonnes` v2/js/rendu.js:1866-1876, qui construit ses libellés depuis `M().champDeMesure(n)`. Les mesures `reps`, `temps` et `distance_temps` représentent 4 076 séries — 15 % de l'historique (modele.js:84-90).`

### Ce qui apparaît sans raison — 11

*Contradictions et affichages impossibles.*

- **Une séance dont les séries ne sont pas encore en cache dit deux choses opposées selon l'écran : sa carte affiche « séries pas encore reçues » (un manque, assumé comme tel), et son détail affiche « Aucune série sur cette séance. » (un fait, faux). C'est le même objet, à un tap d'écart.**
  `carte v2/js/rendu.js:793 ← `incomplet` posé v2/js/modele.js:990 ; détail v2/js/rendu.js:220-221 (`if (!blocs.length)`), atteint depuis v2/js/app.js:2791-2792`
- **Sur cette même séance incomplète, la liste RETIRE volontairement le menu ⋯ — mais le détail offre les trois mêmes gestes. Et « Modifier » y passe : la garde du détail vérifie la provenance des séries, pas leur présence, et rend `false` sur une liste vide. On ouvre alors une séance sans aucun exercice ; « Terminé » y appelle `enregistrerEdition`, qui pose un `remplacerSeries(id, [])` — lequel supprime en base toutes les séries de la séance. Chaîne lisible de bout en bout dans le code, non exécutée ici (lecture seule).**
  `menu refusé v2/js/rendu.js:810 (`if (!surMenu || r.estSortie || r.incomplet) { … return; }`) mais le clic de carte est déjà branché ligne 806 · gestes du détail v2/js/rendu.js:230-248 ← app.js:2796-2798 · garde `seriesIncompletes` app.js:3073 → `provenanceIncomplete` v2/js/seance.js:341 (`liste.length > 0 && …`) · `Seance.reprendre(ligne, [])` seance.js:272-286 · `surTerminer` app.js:1253 → `enregistrerEdition` app.js:3099-3113 → `poserSeries` app.js:640 → `Donnees.remplacerSeries` v2/js/donnees.js:336-370 (suppression ligne 361-364)`
- **Une séance fantôme : ouvrir `/seance/<uuid>` inconnu du cache rend un écran de séance complet — titre « Séance » et « Aucune série sur cette séance. » — pour un objet qui n'existe pas. Reproductible sans URL forgée : supprimer une séance renvoie sur la semaine en EMPILANT une entrée, l'entrée `/seance/<id>` reste dessous, et le retour d'Android rouvre la page de la séance qu'on vient d'effacer.**
  ``ligne` peut être null v2/js/app.js:2790 ; le rendu ne s'en protège pas v2/js/rendu.js:209 (`(seance && seance.titre) || 'Séance'`) et rendu.js:220 ; chemin de suppression app.js:3056 (`afficherSemaine(lundiAffiche)`) → `allerA` sans `remplacer` app.js:3265-3270 → `Sortie.surRetour` v2/js/sortie.js:94 rend la route précédente`
- **« ← Séances » n'est pas un retour : il EMPILE une entrée d'historique au lieu d'en remonter une. Conséquence : détail → « ← Séances » → bouton retour d'Android rouvre le détail qu'on vient de quitter. Le bouton de la page d'exercice, lui, a été explicitement corrigé pour cette raison et fait `history.back()`, avec le commentaire qui l'explique — les deux boutons voisins ne se comportent donc pas pareil.**
  `v2/js/app.js:3334 (`$('btn-retour')… afficherSemaine()` → `allerA` push) contre v2/js/app.js:3339-3341 (`$('btn-retour-exercice')… racine.history.back()`), commentaire app.js:3335-3338`
- **Sur le détail, la colonne de droite est intitulée « Charge » pour toutes les mesures : une randonnée y affiche « 2 h 10 · 8,4 km » sous l'en-tête « Charge », une planche « 45 s ». L'en-tête ne peut pas être vrai pour 15 % de l'historique.**
  `en-têtes en dur v2/js/rendu.js:182-185 ; valeurs rendues par `formatMesure` v2/js/modele.js:67-77 ; volumes par mesure documentés modele.js:84-90`
- **Le résumé d'un bloc du détail compte les séries de travail SANS la porte du volume, alors que la carte et la barre de semaine l'appliquent. Un bloc « Tapis de course » annonce donc « 2 séries de travail » sous une carte qui n'en compte aucune, et la somme des blocs d'une séance mixte ne retombe pas sur le chiffre de sa propre carte. C'est le défaut C2 du chantier 39 (« 25 contre 23 sur la même séance »), non appliqué à ce troisième compteur.**
  `v2/js/modele.js:559-560 (`bloc.nbTravail` alimenté par `estTravail` seul, modele.js:26-28) contre v2/js/semaine.js:276-292 (`compteSeriesTravail` + `porteDuVolume` semaine.js:262) ; doctrine CADRAGE-V2 §2 undecies, tableau « C2 (15/09) »`
- **Le bouton « Quitter » de l'en-tête de l'Accueil déclenche, d'un seul tap et sans confirmation, un `Cache.viderTout()` qui efface AUSSI les magasins `attente` et `brouillon`. Une séance encore en file — celle que l'indicateur juste au-dessus annonce comme « à envoyer » — est perdue. À deux centimètres de là, supprimer UNE séance passée exige une feuille de confirmation qui compte les séries.**
  `bouton v2/index.html:51, branché sans garde v2/js/app.js:3333 → `deconnecter` app.js:3229-3245 (`Cache.viderTout()` l.3232, `attente = []` l.3239) → `viderTout` v2/js/cache.js:169-174 sur `MAGASINS` cache.js:25-26 (inclut `brouillon` et `attente`) ; à comparer à app.js:3013-3028`
- **Au démarrage sur un cache vide, l'écran affiché et l'URL se contredisent : arriver sur `/seance/<id>` montre la liste avec « Première synchronisation… » pendant que la barre d'adresse dit toujours `/seance/<id>` — l'écran ne rattrape l'URL qu'une fois la synchronisation finie.**
  `v2/js/app.js:3176-3182 (la route d'entrée est conservée) puis app.js:3197-3198 (`montrer('liste', RACINE)` + message) ; rattrapage seulement app.js:3216`
- **La couleur de barre système annoncée par la page n'est pas celle de l'app : `theme-color` vaut `#0b0c0e` alors que le fond du corps est `var(--fond)` = `#15171A`, la valeur que la spec des jetons fait foi.**
  `v2/index.html:6 contre v2/styles.css:15 (`--fond:#15171A`) et styles.css:51 (`body{background:var(--fond)}`) ; ECRAN-SAISIE-V1 §7 bis.4`
- **Le commentaire qui introduit la liste des jours annonce l'inverse de ce que fait le code : « Les sept jours, vides compris. Un jour sans séance s'affiche et ne se juge pas » — or l'appelant filtre les jours vides avant d'appeler.**
  `commentaire v2/js/rendu.js:708-709 ; appel v2/js/app.js:436 (`Semaine.joursAvecSeances(sem.jours)`) → v2/js/semaine.js:234-236, qui ne garde que `j.seances.length > 0``
- **L'étiquette d'accessibilité de la ligne de rappel promet une destination qui n'est pas celle du clic : « Voir la répartition dans Progression », alors que le gestionnaire saute directement à la vue Volume (le sommaire Progression n'est jamais affiché). Le commentaire du code assume ce raccourci, l'`aria-label` ne le dit pas.**
  ``aria-label` v2/js/rendu.js:584 ; gestionnaire v2/js/app.js:429-435 (`allerA(Routeur.VOLUME, {}); rendreVolume();`)`

### Ce qui répond — 15

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## Progression (#vue-progression) · Volume (#vue-volume) · Poids (#vue-poids)

Les trois écrans sont réellement câblés de bout en bout : tous les id de v2/index.html y sont lus, tous les gestionnaires `surXxx` attendus par v2/js/rendu.js sont fournis par v2/js/app.js, et aucune fonction de rendu n'est appelée sans ses rappels. Ce qui cloche n'est donc pas du câblage manquant mais des messages faux et des chiffres qui se contredisent d'un écran à l'autre.
Trois défauts sont vérifiables par le code seul : le relevé et le bloc de sommaire affichent « Aucune séance cette semaine » pour une semaine qui n'a que des sorties (rando, course), ce que CADRAGE-V2 §2 ter interdit explicitement ; la vue Poids annonce « N pesées en tout » en comptant la FENÊTRE alors que le sommaire, un tap plus tôt, annonce le total réel ; et cette même ligne explicative disparaît exactement quand la période est vide, c'est-à-dire quand elle servirait.
Côté navigation, « ← Progression » EMPILE une entrée au lieu de dépiler (contrairement à « ← Retour » de la page d'exercice qui, lui, fait `history.back()`), si bien que le retour d'Android renvoie dans Volume ; et le calendrier, ouvert depuis Volume, éjecte vers l'onglet Séances alors que les flèches et « Cette semaine », eux, restent dans Volume.
Du code mort existe : `var api` de rendu.js (26 entrées) n'est lu par personne, `rendreListeSeances` n'a aucun appelant dans tout le dépôt, le paramètre `lundi` de `rendreVolume` n'est jamais passé, et `aria-labelledby="fen-muscle-titre"` pointe un id qui n'existe nulle part.
Enfin, deux manques nommés par les specs : le signalement de péremption du poids à 3 mois (MOTEUR-PROGRESSION-V2 §1.3) n'existe pas, et le bloc « Par exercice » ne s'ouvre sur rien alors que §7 bis.14 et la maquette lui donnent un chevron.


### Là, mais inerte — 11

*Affiché ou écrit, et qui ne fait rien.*

- **`var api = { … }` dans rendu.js : un objet de 26 entrées (dont rendreSommaire, rendreRadar, rendreCourbePoids, rendreListePesees — tout ce qui rend ces trois écrans) qui n'est JAMAIS lu. Le vrai export est `racine.THRendu` juste en dessous, qui recopie les mêmes 26 entrées à la main. C'est exactement la duplication que CADRAGE-V2 §2 undecies interdit.**
  `v2/js/rendu.js:2758 (déclaration) et v2/js/rendu.js:2785 (le vrai export)`
  <br>*Preuve :* `grep -n "\bapi\b" v2/js/rendu.js` ne rend QUE la ligne 2758 — aucune lecture. `grep -n "module.exports" v2/js/rendu.js` : zéro résultat, donc pas d'export CommonJS qui la consommerait.
- **`rendreListeSeances` — un rendu complet de liste de séances (36 lignes) sans AUCUN appelant, ni dans v2/js, ni dans tests/, ni à l'intérieur de rendu.js. Supplanté par `rendreJours`.**
  `v2/js/rendu.js:102-135`
  <br>*Preuve :* `grep -rn --include=*.js "rendreListeSeances" .` (hors node_modules) rend 4 lignes, toutes dans rendu.js : 102 (la définition), 795 (un commentaire qui la nomme « le jumeau »), 2778 et 2833 (les deux listes d'export). Zéro appel.
- **Le paramètre `lundi` de `rendreVolume(lundi)` n'est jamais passé : la ligne `if (lundi) lundiAffiche = lundi;` ne s'exécute jamais.**
  `v2/js/app.js:2653-2654`
  <br>*Preuve :* `grep -n "rendreVolume(" v2/js/app.js` : 7 sites d'appel (402, 434, 2663, 2667 via rendreRadar, 2784, 3298) — tous `rendreVolume()` sans argument. Seule la définition ligne 2653 porte le paramètre.
- **`aria-labelledby="fen-muscle-titre"` sur la fenêtre de muscle : aucun élément ne porte cet id. Le dialogue n'a donc pas de nom accessible, et `rendreFenetreMuscle` ne pose jamais cet id sur le titre qu'il crée (`fen-quoi`).**
  `v2/index.html:201 · v2/js/rendu.js:654-657`
  <br>*Preuve :* `grep -rn "fen-muscle-titre" .` (js, html, css, md) rend UNE seule ligne : v2/index.html:201, l'attribut lui-même. Aucun `id="fen-muscle-titre"` nulle part.
- **Le slug d'exercice est calculé et transporté jusqu'à la fenêtre de muscle, puis jamais utilisé : les noms d'exercices y sont des `div`, pas des boutons. §2.8 (« un tap sur le nom d'un exercice donne son historique ») n'est pas honoré ici, alors que la donnée est déjà là.**
  `v2/js/semaine.js:216 (`slug: s.exercise_slug` dans `apportsParMuscle`) · v2/js/rendu.js:661-680`
  <br>*Preuve :* `rendreFenetreMuscle` lit `a.nom`, `a.jour`, `a.seriesReelles`, `a.secondaire`, `a.apport` — jamais `a.slug` ; et la ligne est créée par `el('div', 'fen-exo')`, sans `addEventListener`.
- **Bloc « Par exercice » : son en-tête est construit `inerte`, donc sans chevron et sans écouteur. Il annonce « N exercices » (tout l'historique) et n'ouvre rien — seules les 3 lignes affichées mènent quelque part. Il n'existe aucune vue de liste d'exercices dans le routeur.**
  `v2/js/rendu.js:901-902 (`coquilleBloc('Par exercice', v.quand, true)`) · v2/js/rendu.js:838-848 · v2/js/app.js:516`
  <br>*Preuve :* `coquilleBloc(..., inerte=true)` rend un `div` (pas un `button`), n'ajoute pas `bloc-fl`, et `blocExercices` ne pose aucun `addEventListener` sur le bloc. Côté routes : `v2/js/routeur.js:118-127` ne connaît que `/exercice/<slug>`, jamais une liste.
- **Quatre id posés dans index.html et lus nulle part — ni en JS, ni en CSS. Dont `onglet-progression`, l'entrée de ces écrans : le JS sélectionne par `.onglet[data-vue="…"]` et le CSS par `.onglet`.**
  `v2/index.html:248-251 (`onglet-seances`, `onglet-saisie`, `onglet-progression`, `onglet-profil`) et v2/index.html:126 (`note-routine`)`
  <br>*Preuve :* Boucle sur tous les `id="…"` de index.html avec `grep -rq` dans v2/js/ : ces cinq-là ne sont trouvés nulle part ; et `grep -c "#<id>" v2/styles.css` rend 0 pour chacun.
- **Trois sélecteurs CSS dans la règle de chiffres tabulaires ne sont produits par aucun JS ni aucun HTML. `.volume-valeur` et `.semaine-libelle` visaient manifestement ces écrans ; les classes réellement produites sont `zone-valeur`, `muscle-valeur`, `barre-date`.**
  `v2/styles.css:41-46 (`.bilan-chiffre`, `.volume-valeur`, `.semaine-libelle`)`
  <br>*Preuve :* Boucle sur les 301 classes de styles.css avec `grep -rqF` dans v2/js/ et v2/index.html : ces trois-là ne sont trouvées nulle part (`puce-cour`/`puce-prec` sortaient aussi de ce filtre mais sont bien produites, par concaténation `'puce-' + paire[0]` à rendu.js:1011 — faux positif écarté).
- **`.cal-num` — la classe du numéro de jour du calendrier (le calendrier est ouvrable depuis la barre de semaine de Volume) est produite par le JS et n'a aucune règle CSS.**
  `v2/js/rendu.js:709 (`el('span', 'cal-num', …)`) · v2/styles.css:295-316`
  <br>*Preuve :* `grep -n "cal-" v2/styles.css` rend 15 règles (cal-mois, cal-grille, cal-entete, cal-jour, cal-points, cal-pied, cal-aide…) — `.cal-num` n'y figure pas.
- **Six symboles exportés par les modules de ces écrans, sans aucun appelant hors de leur propre fichier (ni v2/js, ni tests) : `THPoids.depuisJour`, `THPoids.normaliser`, `THPeriode.ORDRE`, `THPeriode.sommet`, `THSemaine.JOURS`, `THSemaine.LIBELLES_MUSCLE`.**
  `v2/js/poids.js:199-200 · v2/js/periode.js:182,188 · v2/js/semaine.js:306-307`
  <br>*Preuve :* `grep -rn --include=*.js "Poids.depuisJour|Poids.normaliser|Periode.ORDRE|Periode.sommet|Semaine.JOURS|Semaine.LIBELLES_MUSCLE" v2/ tests/` en excluant le fichier qui les définit : une seule ligne remonte, et c'est un COMMENTAIRE (v2/js/rendu.js:951, « dans l'ordre géométrique de THPeriode.ORDRE ») — les ancres du radar sont en fait recopiées à la main à rendu.js:952-959, donc l'ordre géométrique est écrit deux fois.
- **La colonne `source` de `body_weight_log` est lue en base, normalisée et transportée jusqu'à la vue, puis jamais affichée : on ne peut pas distinguer une pesée importée d'une pesée saisie.**
  `v2/js/donnees.js:150 (select) · v2/js/poids.js:71 et 188 (transport) · v2/js/rendu.js:1081-1099`
  <br>*Preuve :* `rendreListePesees` lit `p.date`, `p.poids`, `p.ecart` — jamais `p.source`. `grep -n "source" v2/js/rendu.js` ne rend que des occurrences sans rapport (lignes 752, 1189, 1612, 1696).

### Ce qui manque — 8

*Décidé en spec, absent du code.*

- **Le signalement de péremption du poids de corps à 3 mois. Rien dans v2/js ne compare la date de la dernière pesée à aujourd'hui, ni ne marque quoi que ce soit comme approximatif. Le sommaire affiche une pesée de mars à côté d'un gros chiffre de 26 px, sans dire qu'elle a six mois.**
  `MOTEUR-PROGRESSION-V2.md:100 (« Au-delà de 3 mois sans pesée, l'app le signale une fois, sans insister, et marque les charges suspendues de cette période comme approximatives ») et MOTEUR-PROGRESSION-V2.md:39, ligne 12 de la table des décisions. Preuve : `grep -rn "peremption|péremption|approximati|interpol" v2/js/` ne rend qu'un « lien approximatif » dans routeur.js:34, sans rapport.`
- **Aucun moyen d'enregistrer une pesée. La vue Poids est en lecture seule de bout en bout : aucun champ, aucun bouton, et aucun chemin d'écriture vers `body_weight_log` nulle part dans le code v2. Or la spec du moteur suppose qu'« une nouvelle pesée déclenche le recalcul ».**
  `MOTEUR-PROGRESSION-V2.md:96 · REGLES-DE-COMPTAGE-V1.md:427 (« Une pesée ajoutée après coup recalcule les séances concernées »). Preuve : `grep -n "upsert|insert|update(|delete()" v2/js/donnees.js` ne mentionne que `routines`, `routine_exercises`, `routine_sets`, `sessions`, `sets` — jamais `body_weight_log` ; v2/js/attente.js:55 ne connaît que trois tables.`
- **Le balayage horizontal pour changer de semaine (barre de semaine de Volume comme de Séances). Seules les flèches et la date ouvrable existent.**
  `ECRAN-SAISIE-V1.md §7 bis.11 (« Flèches conservées, plus le balayage horizontal, plus la date ouvrable »). Preuve : `grep -rn "touchstart|touchmove|touchend|swipe" v2/js/` : zéro. Les trois `pointerdown` du dépôt (app.js:1500, rendu.js:1366, rendu.js:1514) servent l'appui long des routines et le glissement des blocs de séance.`
- **Le bloc « Par exercice » ne s'ouvre sur aucune vue complète, alors que les deux autres blocs du sommaire le font et que la maquette lui dessine un chevron « › » à côté de « 116 exercices ».**
  `ECRAN-SAISIE-V1.md §7 bis.14 (« Des blocs empilés, chacun donnant sa réponse en deux lignes, chacun s'ouvrant sur une vue complète ») · v2/maquettes/maquette-progression.html:129-130. À vérifier : le commentaire de v2/js/rendu.js:894-900 présente l'inertie comme un choix, mais aucune section de spec ne l'entérine — c'est la spec ou le commentaire qui a tort, et je ne peux pas trancher depuis le code.`
- **La courbe de la page d'exercice et ses cinq vues (Charge de travail · Meilleure série · Reps totales · Tonnage · 1RM estimé), destination des lignes du bloc « Par exercice ».**
  `ECRAN-SAISIE-V1.md §7 bis.15, et le manque est NOMMÉ comme assumé en tête de §7 quater (ECRAN-SAISIE-V1.md:1262-1275, point 1 : « Ne sont PAS en place, et ce n'est pas un oubli »). À signaler, pas à corriger.`
- **Aucun indicateur d'état de synchronisation sur les trois écrans : `#etat-sync` vit uniquement dans `#vue-liste`. Une file bloquée ou une synchro échouée laisse Progression, Volume et Poids afficher des chiffres périmés sans le dire.**
  `À VÉRIFIER — ECRAN-SAISIE-V1.md §7 sexies pose la règle « la file d'attente ne perd rien en silence » mais ne dit pas explicitement que l'indicateur doit être visible hors de Séances. Constat factuel : v2/index.html:47 place `#etat-sync` dans `#vue-liste` seul, et `rendreEtatSync()` (v2/js/app.js:565) n'est appelé que depuis `rendreSemaine` et les chemins de séance (app.js:425, 559, 606, 1303).`
- **La semaine affichée dans Volume n'entre pas dans l'URL et n'empile aucune entrée d'historique, alors que dans Séances elle fait les deux. Un rechargement sur /progression/volume après avoir reculé de cinq semaines revient à la semaine courante.**
  `À VÉRIFIER — v2/js/routeur.js:7-18 ne prévoit pas de paramètre de semaine sous /progression/volume, donc c'est peut-être assumé ; mais ECRAN-SAISIE-V1.md §7 bis.9 affirme que « la barre de semaine est identique dans les deux onglets ». Constat : v2/js/app.js:2784 fait `lundiAffiche = l; return rendreVolume();` sans `allerA`, là où v2/js/app.js:2771-2775 (`afficherSemaine`) appelle `allerA`.`
- **`AUDIT-2026-09-14.md`, désigné comme « le document de référence des défauts connus », est absent du dépôt.**
  `CADRAGE-V2.md:231-233. Preuve : `find . -iname "*AUDIT*"` ne rend que des artefacts v1 (audit/, DOC_AUDIT.md, audit-diag.js) — aucun AUDIT-2026-09-14.md.`

### Ce qui apparaît sans raison — 11

*Contradictions et affichages impossibles.*

- **« Aucune séance cette semaine. » s'affiche pour une semaine qui CONTIENT des séances, dès qu'elles ne portent que des exercices sans muscle primaire (rando, course, vélo, natation, tapis). Le message est faux : au même moment, l'onglet Séances affiche la carte de cette sortie. Chaîne vérifiée : `volumeParMuscle` écarte ces exercices → `volumeParZone` rend `[]` → le relevé et le bloc affichent l'état vide. CADRAGE-V2 §2 ter compte 64 séances sur 1 221 dans ce cas et dit expressément que « la masquer serait mentir sur son historique ».**
  `v2/js/rendu.js:607 (relevé, vue Volume) et v2/js/rendu.js:863 (bloc du sommaire) · cause : v2/js/semaine.js:117-121 · contraste : v2/js/rendu.js:774, où le même texte est piloté par `joursAvecSeances` et dit donc vrai`
- **Même famille, côté radar : « Aucune série de travail sur ces deux périodes. » alors que des séries de travail existent. `comparerZones` ne regarde que les six zones de l'hexagone et ignore `hors-zone` (documenté à periode.js:90-92), et `vide` vaut `max === 0` — donc deux périodes entièrement faites de sorties, ou d'un muscle absent de la table des zones, produisent ce message faux.**
  `v2/js/rendu.js:965 · cause : v2/js/periode.js:104-121 (`vide: max === 0`) · appelé par v2/js/app.js:2680-2688`
- **Deux comptes de pesées contradictoires à un tap d'intervalle. Le sommaire affiche le total réel (`resume().nb` = toute la liste). La vue Poids affiche « N pesées en tout. » où N est le nombre de pesées de la FENÊTRE, pas le total : avec « 1 an » sélectionné on peut lire « 4 pesées en tout. » sur l'écran précédé de « 114 pesées ». Le mot « en tout » est faux.**
  `v2/js/app.js:2709 (`Poids.dernieres(fenetre, 12), fenetre.length`) → v2/js/rendu.js:1095-1097 · à comparer à v2/js/poids.js:94 (`nb: liste.length`, non filtré) rendu par v2/js/rendu.js:885-886`
- **La ligne qui explique le vide disparaît précisément quand la période est vide : `rendreListePesees` sort par `if (!pesees || !pesees.length) return;` AVANT de pouvoir écrire « N pesées en tout. ». Sur « 3 mois » avec zéro pesée dans la fenêtre, l'écran Poids se réduit aux trois pastilles et à « Aucune pesée sur cette période. », sans rien qui dise que le compte en a 114 ailleurs — et `periodePoids` est une variable de module, donc cet état vide persiste d'une visite à l'autre.**
  `v2/js/rendu.js:1083-1084 (sortie anticipée) vs v2/js/rendu.js:1095-1097 (la ligne jamais atteinte) · v2/js/app.js:36 (`periodePoids` persistante)`
- **« ← Progression » EMPILE au lieu de dépiler : `allerA(PROGRESSION)` pousse une entrée d'historique, si bien qu'un retour d'Android depuis le sommaire ramène DANS Volume (ou Poids) qu'on vient de quitter. Le bouton équivalent de la page d'exercice fait `history.back()`, avec un commentaire ⚠️ qui explique pourquoi — les deux boutons voisins ne suivent pas la même règle.**
  `v2/js/app.js:3342-3348 (btn-retour-volume / btn-retour-poids) vs v2/js/app.js:3338-3341 (btn-retour-exercice) · mécanique : v2/js/app.js:3263-3273 et v2/js/sortie.js:93-94`
- **Le calendrier éjecte de Volume vers Séances, alors que les flèches et « Cette semaine » de la même barre, eux, restent dans Volume. Choisir une ligne au calendrier — ou appuyer sur « Cette semaine » dans son pied — appelle `afficherSemaine`, qui fait `montrer('liste', RACINE)`. Deux entrées de la MÊME barre se comportent différemment, alors que index.html:54-56 annonce une barre identique « calendrier compris ».**
  `v2/js/app.js:2734-2737 et v2/js/app.js:3385-3388 (aucune garde) vs v2/js/app.js:400-404 et v2/js/app.js:2782-2786 (garde `!vues.volume.hidden`)`
- **Le radar ne bouge pas quand on change la semaine juste au-dessus de lui. Il est ancré sur `new Date()` et non sur `lundiAffiche` — c'est voulu et commenté, mais à l'écran on recule de cinq semaines et le graphique se redessine strictement identique. Rien dans la page ne dit que ce bloc ignore la barre ; seuls les libellés « 30 derniers jours / 30 jours précédents » le laissent deviner, et la note en bas parle d'autre chose.**
  `v2/js/app.js:2670-2676 (`Periode.fenetres(p.jours, new Date())`) appelé inconditionnellement par v2/js/app.js:2667 · libellés : v2/js/periode.js:27-32 · note : v2/index.html:174-176`
- **Le titre « Répartition » reste affiché même quand toute la section en dessous est vide : il est écrit en dur dans le balisage, alors que la note explicative, elle, est bien masquée dans ce cas. Un compte neuf voit donc un intertitre de section suivi d'un message d'absence.**
  `v2/index.html:170 (statique) vs v2/js/app.js:2695 (`$('note-radar').hidden = comparaison.vide`)`
- **Un poids de six mois se présente comme une mesure du moment : gros chiffre de 26 px, et pour date « 18 mars » sans l'année (l'année n'est affichée que si elle diffère de l'année courante). La courbe de la vue Poids répète ce dernier point en `graphe-v` sous le titre « Poids de corps », sans aucune date à côté.**
  `v2/js/rendu.js:875 (`jour(r.date)` sans année de référence) et v2/js/rendu.js:880-881 · v2/js/rendu.js:78-85 (règle d'affichage de l'année) · v2/js/rendu.js:1050-1054 (`graphe-v` sans date)`
- **Le sous-titre de la barre de semaine n'est pas le même dans les deux onglets : Séances affiche « N séances · X séries de travail », Volume seulement « X séries de travail ». Le drapeau qui produit cet écart n'est justifié nulle part — ni commentaire, ni spec, ni test.**
  `v2/js/app.js:406-409 (`avecSeances`) · appelé avec `true` à v2/js/app.js:2657 et `false` à v2/js/app.js:2658 · `grep -rn "avecSeances" v2/ tests/` : 2 résultats, tous deux dans app.js`
- **Le sous-titre de la barre et le relevé juste en dessous peuvent se contredire quand le catalogue d'exercices n'est pas encore chargé : `compteSeriesTravail` compte volontairement les séries dont l'exercice est inconnu, tandis que `volumeParMuscle` les écarte. La barre annonce alors « 25 séries de travail » au-dessus d'un « Aucune séance cette semaine. ».**
  `v2/js/semaine.js:288-290 (« on ne retranche que ce qu'on connaît », `n++`) vs v2/js/semaine.js:118 (`if (!exo) return;`)`

### Ce qui répond — 13

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## Bibliothèque de routines (`#vue-saisie`) et éditeur de routine (`#vue-routine`) — v2/index.html:89-131, rendus par v2/js/app.js (`rendreSaisie` 1969, `rendreEditeur` 2244) et v2/js/rendu.js (`rendreListeRoutines` 2599, `rendreBlocsSeance` 1578).

Les deux écrans sont câblés de bout en bout dans leur chemin nominal : tous les id de index.html sont lus par app.js (sauf `note-routine`, qui est un paragraphe statique), tous les `vue.surXxx` que `rendreBlocsSeance` lit en mode `programme` sont fournis, et les handlers non fournis (surEffort, surValider, fantome, tourAtteint) sont tous gardés par `!vue.programme`.
Le défaut le plus lourd est silencieux : l'éditeur écrit `l[champ] = valeur` avec le nom d'affichage (`duree`, `distance_km`, rendu.js:1982), alors que `THRoutines.CIBLES` (routines.js:188) ne lit que `duree_s` et `distance_m` — tout ce qui est programmé en DURÉE ou en DISTANCE est perdu à l'enregistrement, sans message. La séance, elle, traduit les deux vocabulaires (`THSeance.modifierSerie`, seance.js:809-818). Même famille : `decimalOuNul` (routines.js:163) ne convertit pas la virgule française que `nombreFr` (rendu.js:23) vient pourtant d'afficher, et `valider` (routines.js:277) n'examine jamais la charge — « 82,5 » retapé devient NULL sans un mot.
Le second défaut est le pied fixe `#pied-reorg` : `montrer` (app.js:134) referme le mode mais n'appelle pas `rendrePiedReorg`, et aucune des vues Séances/Progression/Volume/Poids/Profil ne l'appelle. Le pied reste donc à l'écran, avec « Annuler » et « Enregistrer », sur un écran qui ne sait plus ce qu'il range.
Enfin plusieurs promesses écrites dans le code sont contredites par le code lui-même : la note de l'éditeur annonce un moteur qui recalcule la cible alors que `correspondant` (seance.js:1512) dit « rien n'est prédit ici », le commentaire d'index.html:108 nie un champ de charge qui existe, et le `catch` d'`enregistrerOrdreBibliotheque` jure garder l'ordre à l'écran tout en vidant la liste.


### Là, mais inerte — 13

*Affiché ou écrit, et qui ne fait rien.*

- **Le pied fixe `#pied-reorg` n'est jamais refermé quand on quitte l'écran : `montrer` remet `modeModifier` à false mais n'appelle pas `rendrePiedReorg`, et aucune des vues Séances / Progression / Volume / Poids / Profil ne l'appelle. Le pied reste donc affiché, avec ses deux boutons, sur un écran qui n'a rien à ranger.**
  `v2/js/app.js:134 (`if (ecranCourant !== nom) fermerReorganisation();`) et v2/js/app.js:1456-1470 (`rendrePiedReorg`)`
  <br>*Preuve :* `grep -n "rendrePiedReorg()" v2/js/app.js` → 1306 (fin de `rendreSeance`), 1433 et 1450 (dans `enregistrerOrdreBibliotheque`), 2016 (fin de `rendreSaisie`), 2320 (fin de `rendreEditeur`). Aucune occurrence dans `rendreSemaine` (416), `rendreProgression` (445), `rendreVolume` (2653), `rendrePoids` (2699), `rendreExercice` (2848), `rendreDetail` (2789). Le nœud est `position:fixed; z-index:11` (styles.css:828) et n'est caché que par `rendrePiedReorganisation(cible, null)` (rendu.js:1553).
- **`racine.THApp = { ajouterGarde, retirerGarde }` — export global sans aucun lecteur ; le commentaire dit lui-même « Rien ne s'en sert encore », et les appels internes passent par les fonctions locales.**
  `v2/js/app.js:3462`
  <br>*Preuve :* `grep -rn "THApp" .` sur tout le dépôt (hors node_modules) → une seule ligne : `./v2/js/app.js:3462`. Les deux seuls appels réels sont `ajouterGarde(gardeOverlay)` app.js:2757 et `retirerGarde(gardeOverlay)` app.js:2765, tous deux internes.
- **`lettresDeLiens(lies)` — fonction complète (calcul des lettres A/B/C d'un superset dans l'éditeur) sans aucun appelant, ni interne, ni exporté, ni en test.**
  `v2/js/rendu.js:2729-2741`
  <br>*Preuve :* `grep -rn "lettresDeLiens" v2/js/ tests/` → une seule ligne, sa définition (rendu.js:2729). Elle n'est pas dans l'objet `racine.THRendu` (rendu.js:2785-2838).
- **`var api = { … }` dans rendu.js — table de 25 exports construite à chaque chargement et jamais lue ; ses entrées sont recopiées à l'identique dans le littéral `racine.THRendu` juste en dessous.**
  `v2/js/rendu.js:2758-2783`
  <br>*Preuve :* `grep -n "\bapi\b" v2/js/rendu.js` → une seule occurrence, la déclaration ligne 2758. Contraste avec routines.js:1017 (`racine.THRoutines = api;`) où la variable est bien consommée.
- **`o.dataset.v = String(v)` sur chaque entrée de la molette de repos (atteinte depuis l'éditeur par le bouton « repos » sous chaque nom) : `data-v` est posé et jamais relu — la valeur choisie est reprise de `VALEURS_REPOS[piste.dataset.rang]`, pas du `data-v` de l'option.**
  `v2/js/rendu.js:2419`
  <br>*Preuve :* `grep -rn "dataset\.v\b|data-v=" v2/js/` → une seule ligne, rendu.js:2419. La lecture effective est rendu.js:2454 (`VALEURS_REPOS[Number(piste.dataset.rang) || 0]`).
- **Les options de la molette portent `role="option"` et `aria-selected`, mais aucune n'a de gestionnaire de clic ni de clavier : taper directement sur « 2:00 » ne fait rien, seul le défilement sélectionne. L'`aria` décrit une liste choisissable qui ne l'est pas.**
  `v2/js/rendu.js:2417-2434`
  <br>*Preuve :* Dans la boucle `VALEURS_REPOS.map` (rendu.js:2417-2423) et dans `marquer` (2425-2433), les options ne reçoivent que `className`, `role`, `aria-label`, `aria-selected`. Le seul `addEventListener` de la molette est sur `piste` : `piste.addEventListener('scroll', …)` (rendu.js:2435).
- **`routines.note` est demandée à PostgREST, normalisée dans le modèle d'écran, puis jamais affichée ni écrite : ni la carte de la bibliothèque, ni l'éditeur, ni `brouillonDe` ne la reprennent.**
  `v2/js/donnees.js:196 (`COLONNES_ROUTINE`) → v2/js/app.js:1943 (`note: brute.note`)`
  <br>*Preuve :* `grep -n "\.note\b" v2/js/app.js v2/js/rendu.js` : les seules lectures de `note` sont celles de l'EXERCICE (app.js:2107, 2355-2356 ; rendu.js:1851-1854) et de la séance (rendu.js:440, 2493). `brouillonDe` (app.js:2093-2113) ne copie que `id` et `nom` au niveau routine.
- **`reorgDepart` est calculé pour la bibliothèque mais n'y est jamais relu : `annulerReorganisation` ne restaure que les surfaces `seance` et `routine`.**
  `v2/js/app.js:1368 (`else reorgDepart = Routines.reordonnables(routines).map(…)`) et app.js:1371-1377`
  <br>*Preuve :* `annulerReorganisation` (app.js:1371) : `if (q === 'seance' …) … else if (q === 'routine' …) …` puis `fermerReorganisation(); rendreSurfaceCourante();`. Aucune branche `bibliotheque`.
- **Variable locale morte : `var noeud = $('pied-reorg');` dans `enregistrerOrdreBibliotheque`, jamais utilisée dans la fonction.**
  `v2/js/app.js:1430`
  <br>*Preuve :* Lecture intégrale de la fonction (app.js:1427-1452) : `noeud` n'apparaît qu'à sa déclaration ; le pied est redessiné par `rendrePiedReorg()` (1432, 1450), qui relit lui-même `$('pied-reorg')`.
- **`Routines.enregistrer` renvoie `etape` et `orpheline` dans ses résultats d'échec ; aucun appelant ne les lit (seul `partiel` est consommé par `messageErreur`).**
  `v2/js/routines.js:884, 892, 917, 921, 923`
  <br>*Preuve :* `grep -rn "orpheline|\.etape" v2/js/` → routines.js:921 (écriture) uniquement, plus deux commentaires sans rapport (donnees.js:319, sync.js:219). L'unique consommateur du résultat est `erreur.textContent = Routines.messageErreur(r)` (app.js:2492), et `messageErreur` (routines.js:964-970) ne lit que `r.erreur` et `r.partiel`.
- **`brouillonASignaler` renvoie `nbExercices` ; l'appelant ne le passe pas au bandeau et `rendreBandeauReprise` ne le lit pas.**
  `v2/js/routines.js:681 → v2/js/app.js:2030-2042`
  <br>*Preuve :* `rendreBandeauBrouillon` (app.js:2027-2043) ne transmet que `quoi`, `sujet`, `depuis`, `libelleQuitter`, `libelleReprendre`, `surReprendre`, `surQuitter`. `rendreBandeauReprise` (rendu.js:2565-2591) ne lit que ces champs-là.
- **`#note-routine` est le seul id de index.html jamais référencé dans v2/js/ (avec les quatre `onglet-*`, qui passent eux par `.onglet[data-vue=…]`). Ce n'est pas un contrôle mort, mais un texte figé que rien ne peut mettre à jour — voir la contradiction signalée plus bas.**
  `v2/index.html:126-128`
  <br>*Preuve :* Balayage de tous les `id="…"` de index.html contre `grep -rF` dans v2/js/ : seuls `note-routine`, `onglet-profil`, `onglet-progression`, `onglet-saisie`, `onglet-seances` ne remontent rien. Les quatre derniers sont atteints par sélecteur (app.js:144, app.js:3410, rendu.js:757) ; `note-routine` ne l'est par aucun chemin.
- **`Routines.replier` est exporté sans consommateur externe (usage strictement interne à `chercher`). Export de surface, pas de code mort — mentionné pour l'exhaustivité.**
  `v2/js/routines.js:816 (définition) et 1013 (export)`
  <br>*Preuve :* `grep -rn "\breplier\b" v2/js/` hors routines.js → uniquement deux commentaires (app.js:1481, rendu.js:1621). Dans routines.js, les seuls appels sont 822 et 829, tous deux dans `chercher`.

### Ce qui manque — 8

*Décidé en spec, absent du code.*

- **Aucun contrôle de bornes sur la charge cible à l'enregistrement. `valider` vérifie le nom, l'exercice, la présence d'au moins une série, les reps et le repos — jamais `charge_kg`. Une valeur hors [0, 1000] ou illisible est convertie en `null` par `decimalOuNul` (routines.js:163) et part en base sans message, alors que reps et repos, eux, bloquent l'enregistrement avec une phrase.**
  `ECRAN-SAISIE-V1 §7 quaterdecies.1 : « CE QUE LA CARTE AFFICHE EST CE QUE LA BASE RECEVRA — la leçon de la mutation M7 du chantier 41, généralisée aux trois réglages. » L'invariant n'est tenu ni pour la charge, ni pour la durée, ni pour la distance. (routines.js:277-308, aucune branche `charge_kg`.)`
- **Aucune traduction du vocabulaire d'affichage vers le vocabulaire de stockage dans l'éditeur. `rendu.js:1982` passe `nom = g.champs[iChamp]`, c'est-à-dire `duree` et `distance_km` ; l'éditeur écrit `l['duree']` / `l['distance_km']` (app.js:2282) ; `THRoutines.CIBLES` (routines.js:188-197) ne lit que `duree_s` et `distance_m`. La séance, elle, possède cette traduction, facteur ×1000 compris (`THSeance.modifierSerie`, seance.js:809-818). Conséquence : sur les 12 exercices en `temps` et les 7 en `distance_temps`, tout ce qui est programmé en DURÉE et en DISTANCE est perdu à l'enregistrement.**
  `ECRAN-SAISIE-V1 §7 quindecies.1 « L'éditeur de routine EST l'écran de séance » et §3 ter « Les quatre mesures » (tableau ligne 150 : `temps` 12 exercices, `distance_temps` 7 exercices / 501 séries). CADRAGE-V2 §2 undecies « Câbler, jamais dupliquer » — ici la règle existe (seance.js:809), elle n'a pas été câblée.`
- **Aucune conversion de la virgule décimale française côté routine. `champSerie` affiche la valeur avec `nombreFr` (rendu.js:23, remplace `.` par `,`), mais `decimalOuNul` (routines.js:163) et `entierOuNul` (routines.js:123) font `Number(v)` sur la chaîne brute — « 82,5 » devient NaN, donc `null`. `THSeance.nombreOuNul` (seance.js:735-739) fait `String(v).replace(',', '.')`.**
  `Même §7 quindecies.1 (un seul écran, donc un seul comportement) et MODELE : « Le séparateur décimal est la virgule » (modele.js:31). Le champ affiche une virgule que son propre parseur refuse.`
- **Le bandeau de séance en cours n'est pas branché : le composant existe et sert déjà au brouillon, mais rien ne le nourrit depuis `seance.debut`, et aucun écran hors Saisie ne l'affiche.**
  `ECRAN-SAISIE-V1 §7 nonies : « décidé, COMPOSANT ÉCRIT, non branché — Il reste à la séance : décider l'emplacement, calculer le sujet et l'ancienneté depuis `seance.debut`, câbler « Reprendre » et « Terminer », et poser la pastille sur l'onglet Saisie. » La pastille, elle, est faite (app.js:143-145).`
- **Aucune garde n'empêche d'écrire un `rang` sur une routine archivée. `rendreListeRoutines` affiche toutes les `visibles` (routines.js:726, qui ne filtre PAS `archivee_a`) et leur pose une poignée en mode Ranger (rendu.js:2665), tandis que `reordonnables` (routines.js:770) les exclut. `planRangs` (routines.js:772) ne filtre que sur l'existence de l'id : une archivée glissée reçoit donc un rang.**
  `ECRAN-SAISIE-V1 §7 vicies.5 : « Les archivées ne se rangent pas. L'index est PARTIEL : elles sont dehors, deux d'entre elles peuvent partager un rang, et leur en écrire un pourrait heurter une active. » Atteignable dès qu'il reste des lignes `archivee_a` de l'incident du 13/09, avec au moins 2 routines actives (sinon le mode ne s'ouvre pas : garde app.js:1515-1517).`
- **Les deux critères du geste « Réorganiser » divergent dans l'éditeur : le bouton « Ranger » se cache sur `blocs.length < 2` (app.js:2246-2247), l'entrée de menu « Réorganiser… » s'active sur `brouillon.exercices.length > 1` (app.js:2404-2406), et l'appui long n'a aucune garde du tout côté éditeur (app.js:1515, la garde ne vise que `'bibliotheque'`). Une routine faite d'un seul superset à deux exercices = 1 bloc : bouton caché, menu actif, mode ouvrable — et le mode n'y peut rien faire (deux flèches désactivées, rendu.js:1657-1660).**
  `ECRAN-SAISIE-V1 §7 vicies.1 « le mode, pas le geste » — trois surfaces, un seul mode. Trois seuils différents pour le même mode sur le même écran.`
- **Une routine sans aucun exercice passe la validation et s'enregistre : `valider` n'exige pas `exercices.length > 0` (il n'itère que sur la liste, vide ici). La carte affiche alors « 0 exercice · 0 série » et « Démarrer » ouvre une séance vide.**
  `ECRAN-SAISIE-V1 §1.1 « Une routine stocke les exercices, l'ordre, le nombre de séries et les reps visées » ; la même fonction refuse pourtant un exercice sans série au motif qu'il « démarrerait une séance sans rien à y faire » (routines.js:300-302). Le cas plus grave — aucune structure du tout — n'est pas couvert.`
- **Deux gestes de l'éditeur ne sont pas protégés contre un brouillon encore nul. `prepererEditeur` affiche la vue (app.js:2173) AVANT d'attendre `chargerRoutines()` (app.js:2176-2179) ; pendant cette fenêtre, `#btn-enregistrer-routine` et `#btn-ajouter-exo` sont vivants. `enregistrerBrouillon` fait `brouillon.nom = …` (app.js:2464) et le choix au catalogue fait `brouillon.exercices.push(…)` (app.js:2641) sans garde — TypeError sur `null`. `sauverBrouillon`, lui, est gardé (`if (!brouillon) return;`, app.js:2134).**
  `ECRAN-SAISIE-V1 §7 octodecies.2 (l'enregistrement reste explicite, le brouillon protège du départ accidentel) : il n'existe aucune spec qui autorise l'écran à être tapable avant d'avoir un brouillon.`

### Ce qui apparaît sans raison — 12

*Contradictions et affichages impossibles.*

- **La note sous l'éditeur affirme « Les reps visées sont indicatives : le moteur recalcule la cible séance après séance. » Aucun moteur ne recalcule quoi que ce soit aujourd'hui : `correspondant` écrit en toutes lettres « Rien n'est prédit ici ; le moteur parlera au chantier 5 » (seance.js:1512), et le fantôme n'est qu'une cascade d'observations passées (seance.js:1519-1568). Le texte promet un comportement que le code déclare absent.**
  `v2/index.html:126-128 (`#note-routine`) contre v2/js/seance.js:1508-1516 et v2/js/rendu.js:1834 (« le moteur ne parle pas encore »)`
- **Deux affirmations contradictoires à vingt lignes d'écart dans le même fichier : le commentaire de la vue dit « AUCUN champ de charge nulle part — la routine porte la structure, le moteur décide du poids (ECRAN-SAISIE-V1 §1.1) », et le paragraphe rendu à l'écran dit « La charge est une cible facultative ». C'est le second qui est juste (`charge_cible_kg` est saisie, bornée et écrite : routines.js:191-192, 228-236), le commentaire n'a pas suivi §7 quindecies.3.**
  `v2/index.html:106-109 contre v2/index.html:126-128`
- **Sur échec d'enregistrement de l'ordre de la bibliothèque, le commentaire jure « ON NE PERD PAS L'ORDRE À L'ÉCRAN […] On garde le mode ouvert, l'ordre affiché » — mais `Rendu.message` commence par `vider(cible)` (rendu.js:2536) : toutes les routines disparaissent et il ne reste que la phrase d'erreur, sous un pied qui propose toujours « Enregistrer » l'ordre qu'on ne voit plus.**
  `v2/js/app.js:1441-1447, `Rendu.message($('liste-routines'), …)` → v2/js/rendu.js:2535-2538`
- **Message impossible à l'enregistrement : quand une écriture réseau échoue APRÈS qu'une autre soit passée, `messageErreur` concatène la base « Pas de réseau : rien n'a été enregistré. » et le suffixe « L'enregistrement est incomplet : rouvre la routine pour voir ce qui est passé. » Les deux moitiés de la phrase se contredisent.**
  `v2/js/routines.js:957-970 (`MESSAGES.reseau` + la branche `if (r.partiel)` testée en premier), atteint par `partiel: ecrit` routines.js:923`
- **Le bouton « Ranger » reste affiché PENDANT le mode Réorganiser et y est destructeur silencieusement : `ouvrirReorganisation` remet `reorgOrdre = null` et reprend un nouvel instantané. Dans la bibliothèque, un second tap jette les déplacements en cours ; dans l'éditeur, il fige l'instantané sur l'état DÉJÀ déplacé, donc « Annuler » ne restaure plus l'ordre d'origine.**
  `v2/js/app.js:1996-1998 et 2246-2247 (le `hidden` ne tient pas compte de `modeModifier`) → v2/js/app.js:1361-1370`
- **Dans l'éditeur, « Annuler » ne défait qu'en mémoire. Les déplacements sont écrits sur le disque au fur et à mesure (`reordonnerBrouillonParBlocs` → `renumeroterBrouillon` → `apresEditeur` → `sauverBrouillon`), mais le chemin d'annulation appelle `rendreEditeur()` sans jamais réécrire le brouillon. Tuer l'app après un « Annuler » ramène la routine dans l'ordre annulé.**
  `v2/js/app.js:1371-1377 (`annulerReorganisation` → `rendreSurfaceCourante`) contre v2/js/app.js:2437-2449 et 2422-2425`
- **Le pied « Annuler / Enregistrer » resté sur un écran étranger (voir INERTE) fait bien quelque chose, et rien de ce qu'il annonce : `surfaceReorg()` rend `null`, donc « Enregistrer » tombe dans `enregistrerOrdreBibliotheque`, trouve un plan vide et exécute `rendreSaisie()` — l'écran bascule sur la bibliothèque SANS `allerA`, donc l'URL continue d'afficher /progression. « Annuler » fait exactement la même chose via `rendreSurfaceCourante()`.**
  `v2/js/app.js:1344-1349 (`surfaceReorg`), 1400-1416 (`enregistrerReorganisation`), 1431 (`if (!plan.length) … return rendreSaisie()`), 1355 (`rendreSurfaceCourante` retombe sur `rendreSaisie`)`
- **« ← Routines » empile au lieu de dépiler : il appelle `allerA(SAISIE)` qui fait un `pushState`, là où enregistrer et supprimer utilisent `allerA(SAISIE, {}, true)` (replace). Le retour d'Android ré-ouvre donc l'éditeur qu'on vient de quitter, alors que le routeur affirme « le retour d'Android remonte à la bibliothèque sans qu'on ait à l'écrire ». Le bouton de la page d'exercice, lui, fait bien `history.back()` avec le commentaire qui explique pourquoi.**
  `v2/js/app.js:3367-3370 contre app.js:2500 / 2574 (replace) et app.js:3341 (`history.back()`), commentaire v2/js/routeur.js:42-46`
- **Au démarrage sur un cache sans aucune séance, l'URL et l'écran divergent : `entrer` n'honore la route initiale que `if (seance || local.seances.length)`, sinon il affiche la liste des séances avec « Première synchronisation… » sans corriger l'URL. Un rechargement sur /routine/<uuid> ou /saisie montre donc l'onglet Séances pendant que la barre d'adresse dit autre chose — et hors ligne, rien ne le corrige.**
  `v2/js/app.js:3193-3194 (`if (seance || local.seances.length) rendreRoute(routeInitiale); else { montrer('liste', …); … }`), correction différée à app.js:3213`
- **La carte d'une routine peut annoncer « 1 exercice · 0 série » : `apercu` délègue à `compteSeriesTravail`, qui écarte tout exercice sans muscle primaire (semaine.js, `porteDuVolume`). Une routine de cardio (tapis, rando — les 7 exercices `distance_temps`) ou faite uniquement de chauffes affiche zéro série alors qu'elle en porte. Le comportement est conforme à la spec (§7 quindecies.5, « règle du volume comprise ») et le test le fige — à vérifier : c'est un arbitrage produit, pas forcément un défaut, mais la carte dit alors quelque chose de faux pour l'utilisateur.**
  `v2/js/routines.js:644-657 → v2/js/semaine.js (`compteSeriesTravail`, `porteDuVolume`) ; assertion figée dans tests/unit/v2-editeur-est-la-seance.test.js:934-940`
- **Deux commentaires du dépôt se contredisent sur la même liste blanche : donnees.js affirme que `note` est « LUE et jamais écrite par l'éditeur » et qu'elle est « hors de `CHAMPS_EXERCICE` », alors qu'elle y est bel et bien depuis le chantier 28. Sans conséquence à l'écran, mais c'est le commentaire qu'on lira avant de toucher au réordonnancement.**
  `v2/js/donnees.js:198-201 contre v2/js/routines.js:61-74 (`CHAMPS_EXERCICE` contient `'note'`)`
- **Les trois zones d'erreur des deux écrans portent à la fois `role="alert"` (assertif) et `aria-live="polite"`. Les deux se contredisent ; selon le lecteur d'écran, l'un gagne arbitrairement.**
  `v2/index.html:129 (`#erreur-routine`), et de même v2/index.html:38 et 140`

### Ce qui répond — 15

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## Séance en cours — `#vue-seance` (v2/index.html:136-144) et ses satellites : la feuille `#feuille-seance` (209-214), le catalogue `#catalogue` (218-225), le pied `#pied-reorg` (150) et la barre `#repos` (143). Rendu par `rendreSeance` (v2/js/app.js:1229) via `Rendu.rendreBandeauSeance` (v2/js/rendu.js:1109), `Rendu.rendreBlocsSeance` (v2/js/rendu.js:1582) et `Rendu.rendreRepos` (v2/js/rendu.js:2049).

L'écran est, de loin, le plus complet de la v2 : saisie, validation, tours, supersets, déviation, chronomètre, réorganisation, fin de séance et persistance hors ligne marchent de bout en bout, et chaque gestionnaire rendu par `rendu.js` est bien fourni par `app.js` — je n'ai trouvé AUCUN `vue.surXxx` non branché sur ce chemin.
Ce qui est inerte est donc surtout du hors-DOM : un objet `var api` de 25 entrées jamais assigné (rendu.js:2758), un global `THApp` sans lecteur (app.js:3462), un drapeau `gabarit.inconnue` dont le commentaire dit qu'il « le dit à la vue » alors que la vue ne le lit jamais (modele.js:258), deux classes CSS posées sans règle (`bandeau-modifier`, `bandeau-fin`), et un `rendreEtatSync()` appelé à chaque rendu de séance qui écrit dans un nœud masqué.
Trois manques tiennent à la spec : le palier et la cible de reps en tête de bloc (§3.1/§3.3/§3.5), le bandeau de séance en cours (§7 nonies, que index.html:99-101 avoue non branché), et le tap sur une carte repliée (§5.4).
Deux parasites me paraissent sérieux : la barre de repos et le pied Réorganiser partagent le même `bottom` avec un z-index qui met le pied dessous, alors qu'un commentaire affirme qu'ils « ne coexistent jamais » ; et quatre appuis sur −15 ramènent la cible à 0, ce qui remet exactement l'état que le §7 novodecies interdit — un chronomètre armé sans cible qui ne s'arrête plus.
Enfin, pendant la CORRECTION d'une séance terminée, trois surfaces affirment « séance en cours » et une quatrième conseille de « la terminer ou l'abandonner » alors qu'aucun de ces deux boutons n'existe dans ce mode.


### Là, mais inerte — 13

*Affiché ou écrit, et qui ne fait rien.*

- **`var api = { … }` — un objet de 25 entrées (rendreEtat, rendreBloc, rendreDetail, message…) construit puis jamais assigné à rien. Ce n'est ni `racine.THRendu` (déclaré juste après, ligne 2785) ni un `module.exports` : le fichier se termine ligne 2839 sans jamais y toucher.**
  `v2/js/rendu.js:2758-2782`
  <br>*Preuve :* `grep -c "\bapi\b" v2/js/rendu.js` → 1 (la seule occurrence est la déclaration elle-même).
- **Le drapeau `inconnue` du gabarit. Le commentaire juste au-dessus dit « `inconnue` le dit à la vue » ; aucune vue ne le lit. La seule conséquence visible d'une mesure inconnue est `libelle: null`, qui fait taire la ligne `.type-mesure` (rendu.js:1806).**
  `v2/js/modele.js:252-258 ; consommateur attendu : `teteDeBloc` v2/js/rendu.js:1805-1806`
  <br>*Preuve :* `grep -rn "\.inconnue\|inconnue:" v2/ tests/` → 3 lignes seulement : la déclaration (modele.js:258) et deux assertions de test (tests/unit/v2-mesures.test.js:278, 280-281). Zéro lecteur dans `v2/js/rendu.js` ou `v2/js/app.js`.
- **Classes `bandeau-modifier` et `bandeau-fin` posées sur les deux boutons du bandeau de séance. Aucune règle CSS ne les cible : les deux boutons ne sont stylés que par `.discret` (et `.discret.sel` pour l'état pressé).**
  `v2/js/rendu.js:1149 et v2/js/rendu.js:1157`
  <br>*Preuve :* `grep -c "bandeau-modifier\|bandeau-fin" v2/styles.css` → 0. Les seules règles `bandeau*` sont `.bandeau-reprise` (543), `.bandeau-seance` (625), `.bandeau-t` (627), `.bandeau-nom` (628), `.bandeau-ch` (630).
- **Classe `pied-reorg` posée sur le `<div>` créé à l'intérieur de `#pied-reorg`. Seul l'ID est stylé ; la classe ne sert à rien.**
  `v2/js/rendu.js:1557`
  <br>*Preuve :* `grep -n "pied-reorg" v2/styles.css` → 828 (`#pied-reorg{…}`) et 831 (`#pied-reorg[hidden]`). Aucune règle `.pied-reorg`.
- **Le global `racine.THApp = { ajouterGarde, retirerGarde }`, « exposé pour l'écran de saisie à venir ». L'écran de saisie existe depuis le chantier 22 et ne s'en sert pas : la seule garde posée est celle des voiles, câblée en interne (`gardeOverlay`, app.js:2757).**
  `v2/js/app.js:3462 (et le commentaire 3460-3461 : « Rien ne s'en sert encore »)`
  <br>*Preuve :* `grep -rn "THApp" v2/ tests/` → 1 seule ligne, la déclaration.
- **`Seance.retirerExercice` (singulier) : fonction écrite et exportée, aucun appelant nulle part. La séance utilise `retirerExercices` (pluriel), qui prend une liste d'indices.**
  `v2/js/seance.js:403 (définition) et v2/js/seance.js:1663 (export)`
  <br>*Preuve :* `grep -rn "retirerExercice\b" v2/ tests/` → exactement 2 lignes : la définition et l'export. Zéro appel, y compris dans les tests.
- **Neuf autres entrées de l'API `THSeance` qui n'ont aucun appelant externe (elles ne servent qu'à l'intérieur de seance.js) : `TYPES`, `RESSENTIS`, `EN_COURS`, `REPOS_CIBLE_MIN`, `REPOS_CIBLE_MAX`, `derniereValidation`, `dureeBornee`, `repsBornees`, `serieVide`, `toutesLesSeries`.**
  `v2/js/seance.js:1650-1716`
  <br>*Preuve :* Pour chacune : `grep -rn "Seance\.<nom>\b\|THSeance\.<nom>\b" v2/js/ tests/` → 0 résultat.
- **Entrées mortes de l'API `THModele` : `TYPES_CONNUS` (jamais référencé même en interne hors sa déclaration), `MESURES`, `paqueter`, `toursFaits` (ces trois-là n'ayant qu'un usage interne).**
  `v2/js/modele.js:1046-1076 ; déclarations 24, 246, 371, 689`
  <br>*Preuve :* `grep -rn "Modele\.TYPES_CONNUS\|THModele\.TYPES_CONNUS"` → 0 ; idem pour `MESURES`, `paqueter`, `toursFaits` hors de `v2/js/modele.js`.
- **Entrées de l'API `THRendu` sans appelant hors de rendu.js, dont trois concernent directement cet écran : `champChrono`, `etiquetteSerie`, `texteEffort` (plus `vider`, `dateCourte`, `dateLongue`).**
  `v2/js/rendu.js:2811-2814, 2825-2827`
  <br>*Preuve :* `grep -rn "Rendu\.champChrono\|Rendu\.etiquetteSerie\|Rendu\.texteEffort" v2/js/ tests/` → 0 résultat (`Rendu.el` et `Rendu.VALEURS_REPOS`, eux, ont bien des appelants).
- **`rendreEtatSync()` est appelé à chaque rendu de la séance, mais écrit dans `#etat-sync`, qui vit dans l'en-tête de `#vue-liste` — masqué par `montrer()` dès qu'on est sur la séance. L'écran de saisie n'a donc AUCUN indicateur de synchronisation, et l'appel ne produit rien de visible.**
  `appel : v2/js/app.js:1303 (dans `rendreSeance`) ; cible : v2/index.html:47 ; masquage : v2/js/app.js:136`
  <br>*Preuve :* `grep -rn "etat-sync" v2/index.html` → une seule occurrence, ligne 47, à l'intérieur de `<section id="vue-liste" hidden>` (43-63). `montrer()` fait `vues[k].hidden = (k !== nom)`.
- **`#erreur-seance` n'a qu'un écrivain et aucun effaceur : une fois le message « Sauvegarde impossible sur cet appareil » affiché, rien ne le retire, même si l'écriture suivante réussit.**
  `v2/index.html:140 ; écriture unique : v2/js/app.js:549`
  <br>*Preuve :* `grep -rn "erreur-seance" v2/js/ v2/index.html v2/styles.css` → 2 lignes : la balise et l'unique `Rendu.message(...)`. Aucun `Rendu.message($('erreur-seance'), '')` ni `textContent = ''`.
- **`aria-label="Série"` sur la boîte de dialogue `#feuille-seance`, jamais mis à jour. Dix feuilles différentes y passent (type de série, effort, note d'exercice, repos, menu de bloc, menu d'exercice, suppression, fin de séance, confirmations) et toutes s'annoncent « Série » à un lecteur d'écran.**
  `v2/index.html:210 ; les appelants : v2/js/app.js:1706, 1718, 2058, 2343, 2359, 2380, 2416, 2553, 2986, 3006, 3027, 3086`
  <br>*Preuve :* `grep -rn "setAttribute('aria-label'" v2/js/app.js` → 0 résultat ; `ouvrirVoile` (v2/js/app.js:2751) ne touche qu'à `hidden` et à la garde.
- **Nuance plutôt qu'inertie : `o.dataset.v` sur chaque cran de la molette de repos n'est jamais lu par l'app — le bouton « Valider » lit `piste.dataset.rang` et indexe `VALEURS_REPOS`. L'attribut n'existe que pour les bancs.**
  `pose : v2/js/rendu.js:2419 ; lecture réelle : v2/js/rendu.js:2454`
  <br>*Preuve :* `grep -rn "dataset\.v\b" v2/ tests/` → la pose (rendu.js:2419) puis uniquement des bancs : tests/banc/seance-ecran.js:1121 et 1727, tests/banc/routines-ecran.js:572 et 621. Aucune lecture dans `v2/js/`.

### Ce qui manque — 6

*Décidé en spec, absent du code.*

- **Le palier et la cible de reps en tête de bloc. `teteDeBloc` ne rend que le nom, la lettre, le type de mesure, le repos cible et la note ; il n'y a aucun appel à `THPalier` dans le chemin de rendu de la séance, alors que le module existe et sert déjà ailleurs (Progression app.js:217/478-485, page d'exercice app.js:2867). Corollaire : la phrase « pas assez de séances » du §3.3 n'existe nulle part, et le « prochain palier : 125 kg × 5 » du §3.5 non plus. Le code l'assume dans un commentaire (rendu.js:1830-1834 : « le moteur ne parle pas encore »), et CADRAGE-V2 §2 ter met le moteur hors périmètre — mais l'écart avec le §3 reste entier.**
  `ECRAN-SAISIE-V1.md §3.1 (« Le palier et la cible de reps s'écrivent une seule fois, dans l'en-tête du bloc »), §3.3, §3.5 ; à confronter à CADRAGE-V2.md §2 ter. Code : v2/js/rendu.js:1723-1817 et v2/js/app.js:1229-1307.`
- **Le bandeau de séance en cours. `#bandeau-reprise` existe et `Rendu.rendreBandeauReprise` aussi, mais l'unique appelant est le brouillon de ROUTINE. Rien ne calcule le sujet ni l'ancienneté depuis `seance.debut`, rien ne câble « Reprendre » / « Terminer » pour la séance. Seule la pastille de l'onglet Saisie est livrée (app.js:145). Conséquence concrète : `start_url` vaut `/` dans le manifeste, donc rouvrir la PWA avec une séance ouverte atterrit sur l'écran Séances, et le seul signal est le point de 6 px sur l'onglet.**
  `ECRAN-SAISIE-V1.md §7 nonies (« COMPOSANT ÉCRIT, non branché »), repris tel quel dans v2/index.html:99-101. Code : v2/js/app.js:2027-2040 ; v2/manifest.webmanifest.`
- **Le tap sur une carte repliée pour la rouvrir. En mode Modifier, `blocReplie` ne pose aucun gestionnaire de clic sur la carte : seuls les deux boutons ↑/↓ et la poignée répondent. Il n'y a donc, en mode replié, aucun accès au menu ⋯ du bloc ni à celui d'un exercice. À vérifier : le §5 bis a corrigé le §5.3 sans rayer explicitement le §5.4, je ne peux pas trancher seul s'il est abandonné ou oublié.**
  `ECRAN-SAISIE-V1.md §5.4 (« Un tap sur une carte repliée l'ouvre et donne accès aux poignées et aux menus de ses exercices »). Code : v2/js/rendu.js:1636-1684.`
- **La correction manuelle du repos mesuré. `sets.repos_s` n'est écrit que par `Seance.valider` (calculé depuis l'écart entre deux `validee_a`) et remis à `null` par `devalider` ; aucune surface de l'écran ne permet de le corriger. La molette de repos, elle, ne touche que `repos_cible_s`.**
  `ECRAN-SAISIE-V1.md §7 ter.3 (« La valeur enregistrée est corrigeable à la main — pour les cas où on s'est interrompu, où on a discuté, où on a attendu une machine »). Code : v2/js/seance.js:1036-1071 ; feuille de repos v2/js/app.js:1793-1808.`
- **Le champ « partenaire de séance » sur l'écran de fin. La feuille n'a que trois champs : Titre, Salle, Note de séance. Le mot « partenaire » n'apparaît nulle part dans le code v2 (hors un commentaire sans rapport sur le partenaire de superset, app.js:1265), ni dans SCHEMA-REEL.md.**
  `ECRAN-SAISIE-V1.md §7 septies.4 (« Le partenaire, en version simple d'abord. Un nom saisi sur la séance, rien de plus »). Code : v2/js/rendu.js:2489-2504.`
- **« Partager » — absent, mais la spec le range elle-même en dernier (« social, donc en dernier »). Signalé pour la complétude de la table du §7 octies, pas comme un défaut.**
  `ECRAN-SAISIE-V1.md §7 octies, ligne « Partager | absent ».`

### Ce qui apparaît sans raison — 7

*Contradictions et affichages impossibles.*

- **La barre de repos et le pied du mode Réorganiser peuvent s'afficher en même temps, au même endroit. Les deux sont `position:fixed; bottom:var(--h-onglets)` ; `.repos` est en `z-index:50`, `#pied-reorg` en `z-index:11` — donc la barre de repos passe DEVANT le pied et masque « Annuler » / « Enregistrer ». Rien n'empêche la coexistence : `ouvrirReorganisation` (app.js:1361) ne touche pas à `chrono`, et `rendreSeance` (app.js:1302-1306) appelle `rendreChrono()` puis `rendrePiedReorg()` l'un après l'autre. De plus `mesurerBarres` réserve `Math.max(hRepos, hPied)`, pas leur somme. Le commentaire app.js:985-987 affirme pourtant : « Les deux ne coexistent jamais — on ne range pas pendant un repos ». Chemin : valider une série (chrono armé) puis appui long de 500 ms sur un bloc, ou ⋯ → « Réorganiser… ».**
  `v2/js/app.js:985-992 (le commentaire et la réserve), v2/js/app.js:1302-1306, v2/styles.css:828 (`#pied-reorg`, z-index 11) et v2/styles.css:864-866 (`.repos`, z-index 50)`
- **Quatre appuis sur « −15 » ramènent la cible du repos à 0 et remettent exactement l'état que le §7 novodecies interdit. `ajusterRepos` applique `Seance.ajusterCible`, qui borne à 0, et ne repasse jamais par `cibleArmable`. À 0 : `rendreRepos` affiche « cible — », la piste reste bloquée à 0 %, `reposFige(0, s)` rend faux donc `assurerMinuteur()` relance l'intervalle — le chronomètre compte indéfiniment et ne se fige plus jamais. C'est le « chronomètre armé qui comptait sans but » que le chantier 46 disait avoir refermé côté armement seulement.**
  `v2/js/app.js:1051-1059 (`ajusterRepos`), v2/js/seance.js:1580-1587 (`ajusterCible`, borne basse 0), v2/js/seance.js:1611-1613 (`cibleArmable`, jamais rappelé), v2/js/seance.js:1637-1641 (`reposFige`), v2/js/rendu.js:2061-2063 et 2082-2084`
- **« Ajouter un exercice » (`#btn-ajouter-exo-seance`) reste visible et actif dans deux modes où l'écran prétend ne servir qu'à autre chose. (a) Pendant la sélection « Grouper avec… », le bandeau ne propose plus que « Annuler » et les menus ⋯ sont retirés « parce qu'un bouton au milieu de la carte qui ferait autre chose est un piège » — mais ce bouton-là, hors de la liste, n'est jamais masqué. (b) Pendant le mode Réorganiser, ajouter un exercice déclenche `apresGeste()`, qui écrit le brouillon et pose la file ; or « Annuler » restaure `reorgDepart`, l'instantané pris AVANT l'ajout : l'exercice ajouté disparaît de la mémoire, alors que le disque et la file portent déjà la version avec l'ajout jusqu'au geste suivant.**
  `v2/index.html:139 et v2/js/app.js:3355 (jamais masqué : `grep -rn btn-ajouter-exo-seance v2/js/` → 1 ligne) ; v2/js/rendu.js:1115-1126 (bandeau de sélection) ; v2/js/app.js:1361-1369 (`reorgDepart = seance`) et v2/js/app.js:1371-1378 (`annulerReorganisation`, sans `sauverSeance`)`
- **Pendant la CORRECTION d'une séance terminée, trois surfaces affirment « séance en cours » alors que `seance.statut === 'terminee'` : la pastille jaune de l'onglet Saisie (togglée sur `!!seance`, sans regarder le statut), et sur la page d'exercice le bandeau « <titre> · en cours » avec son bouton « Reprendre ». Le bandeau de la séance, lui, dit correctement « Modification · … » — les deux affichages se contredisent donc au même instant.**
  `v2/js/app.js:144-145 (pastille), v2/js/app.js:2911-2914 (`seanceEnCours: seance ? …`) et v2/js/rendu.js:314-326 (`bandeauExoSeance`), contre v2/js/rendu.js:1133-1143 (bandeau « Modification »)`
- **Message impossible à suivre : en correction d'une séance passée, toute tentative de supprimer / modifier / refaire une autre séance ouvre « Une séance est en cours — Termine-la ou abandonne-la d'abord ». Or dans ce mode il n'y a ni « Terminer » ni « Abandonner » : le bandeau affiche « Enregistrer » et `surTerminer` va droit à `enregistrerEdition`, sans jamais ouvrir la feuille de fin qui porte « Abandonner et tout effacer ». Le bouton « Aller à la séance en cours » ramène sur la correction, seule sortie réelle.**
  `v2/js/app.js:2997-3008 (le message), v2/js/app.js:1244 (`surTerminer: if (enEdition()) return enregistrerEdition()`), v2/js/rendu.js:1157 (« Enregistrer ») et v2/js/rendu.js:2527-2532 (« Abandonner », hors d'atteinte)`
- **Le « X min » du bandeau se fige entre deux gestes. Il est calculé avec `Date.now()` au moment du rendu, mais seul `rendreSeance()` le recalcule ; `rendreChrono()`, qui tourne à 1 Hz pendant un repos, ne re-rend que la barre. Pendant un repos de deux minutes, puis pendant toute pause sans geste, le bandeau annonce une durée périmée.**
  `v2/js/rendu.js:1129-1143 (calcul au rendu) ; v2/js/app.js:1005-1041 (`rendreChrono` ne touche qu'à `#repos`)`
- **Détail : `Rendu.message($('erreur-seance'), …)` insère un `<p class="erreur">` À L'INTÉRIEUR du `<p class="erreur">` déjà présent dans le HTML. La règle `.erreur{padding:10px 0 0; min-height:1em}` s'applique donc deux fois, et le nœud vide occupe déjà de la place en permanence en bas de l'écran.**
  `v2/index.html:140, v2/js/app.js:549, v2/js/rendu.js:2535-2538 (`message`), v2/styles.css:195`

### Ce qui répond — 24

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## Page exercice (#vue-exercice) · Profil (#vue-profil) · Connexion (#vue-connexion)

La page d'exercice est la seule des trois qui vit vraiment : cinq portes d'entrée y mènent, les deux sous-onglets ont leur URL, la fiche de records, la table par reps avec ses lignes déduites et l'historique par jour sont câblés de bout en bout. Ce qui manque y est déjà nommé par la spec elle-même (la courbe et ses cinq vues, la table par séries sur `temps`, la colonne d'effort), mais s'y ajoutent des écarts non consignés : « Dernière séance » affiche le PALIER là où Progression, à un tap de distance, affiche la MEILLEURE série ; la séance en cours reste hors de tous les chiffres alors que son bandeau est affiché au-dessus ; un slug inconnu ouvre quand même une page complète ; chaque bascule de sous-onglet empile une entrée d'historique, et « ← Retour » ne fait rien du tout quand la page est la page d'entrée. La Connexion fonctionne, mais son formulaire n'est jamais remis à zéro : après un échec puis une session, la déconnexion ramène l'écran avec l'ancien message d'erreur et le mot de passe encore dans le champ. Le Profil n'est qu'un paragraphe écrit en clair dans index.html : aucun id, aucune classe lue, aucune table `profiles` interrogée dans tout v2/js — et il promet au futur un réglage de compte dont la déconnexion vit, elle, dans l'en-tête de Séances.


### Là, mais inerte — 12

*Affiché ou écrit, et qui ne fait rien.*

- **Les quatre ids de la barre d'onglets — onglet-seances, onglet-saisie, onglet-progression, onglet-profil — ne sont lus nulle part**
  `v2/index.html:248-251`
  <br>*Preuve :* grep -rn "onglet-profil" v2/js v2/styles.css → 0 résultat (idem pour les trois autres). La sélection réelle passe par l'attribut data-vue : doc.querySelector('.onglet[data-vue="…"]') en v2/js/app.js:144 et 3419, et getAttribute('data-vue') en v2/js/rendu.js:756.
- **Le bouton « ← Retour » de la page d'exercice ne fait RIEN quand cette page est la page d'entrée (ouverture directe d'un lien, ou PWA rouverte sur /exercice/<slug>)**
  `v2/index.html:81 → v2/js/app.js:3353-3355 (racine.history.back())`
  <br>*Preuve :* Au démarrage, sortie.apresNavigation(false) laisse pile = 0 et pose une ancre au-dessus de l'entrée de lancement (v2/js/app.js:3218 ; v2/js/sortie.js:56-77). history.back() repose alors sur l'entrée de lancement, dont history.state vaut null : estAncre(null) est faux (sortie.js:53) et pile === 0, donc surRetour tombe dans la branche « fond de pile : absorbé » (sortie.js:96-98) — poserAncre() et rien d'autre. Aucun rendu, aucun changement d'URL, aucun retour.
- **racine.THApp = { ajouterGarde, retirerGarde } : export global sans lecteur**
  `v2/js/app.js:3476`
  <br>*Preuve :* grep -rn "THApp" v2/js/ → une seule ligne, la définition. Les deux fonctions sont bien utilisées, mais en interne (v2/js/app.js:2771 et 2779), jamais via le global.
- **Un objet d'API complet écrit et jamais lu dans rendu.js : var api = { … 24 clés, dont rendrePageExercice … }**
  `v2/js/rendu.js:2758-2782`
  <br>*Preuve :* grep -n "\bapi\b" v2/js/rendu.js → une seule ligne : 2758, la définition. rendu.js n'a aucun module.exports (grep -n "module.exports" v2/js/rendu.js → 0) ; le seul export réel est racine.THRendu = { … } en v2/js/rendu.js:2784-2838, qui redéclare les mêmes clés.
- **THRendu.rendreListeSeances : fonction complète, exportée deux fois, aucun appelant**
  `v2/js/rendu.js:102-133, exportée en 2778 et 2833`
  <br>*Preuve :* grep -rn "rendreListeSeances" v2/js/ → la définition, les deux lignes d'export, et un commentaire en v2/js/rendu.js:795 qui l'appelle « le jumeau ». Aucun « Rendu.rendreListeSeances(» nulle part.
- **L'e-mail du compte est extrait du jeton puis jamais lu — donc jamais affichable sur Profil ni ailleurs**
  `v2/js/auth.js:37 (return { user: { id: u.id, email: u.email || null }, … })`
  <br>*Preuve :* grep -n "sessionActive" v2/js/app.js → 11 lignes, et toutes celles qui déréférencent ne lisent que .user.id (659, 1934, 2492, 3132). grep -rn "email" v2/js/ → 4 lignes seulement, aucune lecture de session.user.email.
- **#vue-profil : la section entière est inerte — aucun id, aucune classe produite ou lue par le JS**
  `v2/index.html:191-194`
  <br>*Preuve :* Le seul traitement est VUES_ONGLET[Routeur.PROFIL] = 'profil' puis montrer('profil', …) (v2/js/app.js:3298-3302) ; rien n'écrit dans la section. Le commentaire du code le dit : « Profil est le dernier onglet encore écrit en clair dans le HTML » (v2/js/app.js:3296). La classe .a-venir n'existe qu'en CSS (v2/styles.css:390) et dans ce seul <p>.
- **#erreur-connexion porte deux attributs ARIA qui se contredisent : role="alert" (qui impose une annonce assertive) et aria-live="polite"**
  `v2/index.html:38`
  <br>*Preuve :* grep -rn "role=\"alert\"\|aria-live" v2/js/ → 0 : aucun JS ne lit ni ne pose ces attributs ; ils sont figés dans le balisage et jamais arbitrés.
- **Cache.ouvrir exporté sans appelant externe**
  `v2/js/cache.js:30 (définition), 206 (export)`
  <br>*Preuve :* grep -o "Cache\.\w*" v2/js/app.js | sort -u → lireTout, lireMeta, ecrireMeta, ecrireLot, remplacerTout, supprimer, compterMagasin, ecrireAttente, lireAttente, ecrireBrouillon, lireBrouillon, viderTout. Jamais Cache.ouvrir ; l'unique usage est interne (v2/js/cache.js:62).
- **Cinq classes CSS jamais produites par le JS ni posées dans le balisage (elles appartiennent à Progression/Volume, pas aux trois écrans, mais elles sont mortes)**
  `v2/styles.css:42 (.bilan-chiffre), 43 (.volume-valeur), 46 (.semaine-libelle), 475 (.puce-cour), 476 (.puce-prec)`
  <br>*Preuve :* Balayage des 301 classes de styles.css contre v2/js/ et v2/index.html : ces cinq-là rendent 0 occurrence. (Les classes .g-charge_reps / .g-reps / .g-temps / .g-distance_temps ressortent aussi du balayage mais sont bien produites, par concaténation : 'grille g-' + g.mesure, v2/js/rendu.js:1868 et 1903.)
- **Le CSS de la page d'exercice se dit « transcription de maquette-page-exercice.html » — ce fichier n'existe pas dans le dépôt**
  `v2/styles.css:963`
  <br>*Preuve :* find . -name "maquette-page-exercice*" → aucun résultat ; v2/maquettes/ contient 10 fichiers, aucun pour la page d'exercice, et son README ne la mentionne pas.
- **aria-labelledby pointe sur un id qui n'existe pas (fenêtre de muscle — hors des trois écrans, mais c'est un aria posé et jamais relié)**
  `v2/index.html:201`
  <br>*Preuve :* grep -rn "fen-muscle-titre" v2/ → une seule occurrence, l'attribut lui-même. Aucun élément ne porte cet id, ni dans le balisage, ni créé par rendreFenetreMuscle (v2/js/rendu.js:662-707).

### Ce qui manque — 9

*Décidé en spec, absent du code.*

- **La courbe de la page d'exercice et ses cinq vues (Charge de travail par défaut · Meilleure série · Reps totales · Tonnage en barres · 1RM estimé en pointillé), avec son sélecteur de trois périodes (3 mois · 1 an · tout). Rien dans rendreResumeExo, qui se limite à la fiche + la table (v2/js/rendu.js:381-410). La maquette existe pourtant au dépôt et n'est référencée par aucun JS : v2/maquettes/maquette-vues-courbe.html.**
  `ECRAN-SAISIE-V1.md §7 bis.15 « La vue d'un exercice » et §7 quater.2 (tableau : Résumé = courbe et ses cinq vues · records · table). Le manque est déjà nommé dans l'en-tête d'état du §7 quater (chantier 40).`
- **Les « trois repères sous la courbe » : dernière séance · record de charge avec sa date · MEILLEURE SÉRIE AU PALIER COURANT. Les deux premiers existent dans la fiche (v2/js/rendu.js:386-394) ; le troisième n'existe nulle part — aucun appel ne croise le palier courant avec la meilleure série.**
  `ECRAN-SAISIE-V1.md §7 bis.15, paragraphe « Trois repères sous la courbe ».`
- **La table par nombre de SÉRIES sur la mesure `temps` (« la plus longue en une série, en deux, en trois »). tableParReps sort immédiatement hors de charge_reps et reps.**
  `ECRAN-SAISIE-V1.md §7 quater.3, encadré « Ne vaut que pour charge_reps et reps… Sur temps, la table est par nombre de séries ». Manque assumé et écrit dans l'en-tête d'état du §7 quater. Code : v2/js/modele.js:892.`
- **La colonne d'effort (RPE ou répétitions restantes selon ce qui a été saisi) dans l'historique de la page d'exercice. rendreBloc ne pose que deux en-têtes, « Série » et « Charge » (v2/js/rendu.js:181-184). Un texteEffort existe (v2/js/rendu.js:1344) mais n'est consommé que par la grille de saisie (v2/js/rendu.js:1996).**
  `ECRAN-SAISIE-V1.md §7 quater.4. Manque également nommé dans l'en-tête d'état du §7 quater.`
- **Le traitement de la tentative manquée dans la table par répétitions (« 140 kg, tentative », jamais une ligne muette à zéro). tableParReps ne retient que estTravail, donc les séries type_serie='echec' (126 en base) disparaissent sans être montrées comme telles.**
  `ECRAN-SAISIE-V1.md §7 bis.16, paragraphe « Cas à traiter ». Code : v2/js/modele.js:899.`
- **Le PROFIL DE TRAVAIL DÉCLARÉ (force / hypertrophie…), sa phrase d'explication en une ou deux lignes, sa date, et le fait qu'un changement daté reprenne la main sur l'observation antérieure. Rien de tout cela n'existe : aucun `.from('profiles')` dans v2/js (grep → 0 résultat), aucun champ, aucun écran.**
  `ECRAN-SAISIE-V1.md §4.2 à §4.6 · MOTEUR-PROGRESSION-V2.md §8.5 (« Profil de travail de la personne | Déclaré | `profiles`, avec sa date »), §8.5.1, §8.5.2, §8.5.3. À vérifier côté base : SCHEMA-REEL.md ne détaille pas les colonnes de `profiles` (6 lignes, citée sans schéma) — impossible de dire d'ici si la colonne existe déjà.`
- **Le réglage du compte sur l'écran Profil. La page promet « ton compte », mais la seule action de compte existante — la déconnexion — vit dans l'en-tête de l'onglet Séances (bouton « Quitter », v2/index.html:51), et rien n'affiche l'e-mail connecté.**
  `ECRAN-SAISIE-V1.md §7 bis.1 (découpage Séances · Saisie · Statistiques · Profil). Nuance honnête : le §7 quindecies.6 range « le profil » explicitement hors périmètre — le manque est donc assumé côté spec, mais la phrase affichée à l'écran, elle, promet le contraire.`
- **Une sauvegarde / un export des données. Aucun code d'export dans v2/js : grep -ni "export|sauvegard|telecharg|download|blob" ne rend que des messages d'erreur, des commentaires et des module.exports.**
  `CADRAGE-V2.md §2 nonies, tableau « Ce qui doit être fini AVANT » : « Une sauvegarde — ⚠️ le point le plus important. […] Sans export ou sauvegarde, une erreur devient définitive ».`
- **Inscription, mot de passe oublié, premier compte. L'écran de connexion n'offre que e-mail + mot de passe ; auth.js déclare ces trois sujets hors périmètre.**
  `v2/js/auth.js:2 (« Hors périmètre : inscription, mot de passe oublié, comptes anonymes ») contre CADRAGE-V2.md §2 nonies, qui planifie l'ouverture à Mélodie, « qui ne s'est jamais connectée ». À vérifier : la création du compte peut être prévue hors app (côté Claude.ai / Supabase) — rien dans les specs ne tranche.`

### Ce qui apparaît sans raison — 16

*Contradictions et affichages impossibles.*

- **Connexion — le formulaire n'est JAMAIS remis à zéro. Un échec de connexion, puis une session, puis « Quitter » : l'écran de connexion réapparaît avec l'ancien « E-mail ou mot de passe incorrect. » toujours affiché, et le mot de passe encore dans son champ. Le message ne peut pas être vrai : la connexion précédente a réussi.**
  `v2/js/app.js:3234-3241 est le SEUL code qui touche ces trois éléments (grep : champ-email, champ-mdp, erreur-connexion n'apparaissent qu'ici dans v2/js/). Aucun `.value = ''`, aucun `.reset()` dans tout v2/js. deconnecter() (v2/js/app.js:3244-3257) ne nettoie que le cache et l'état mémoire.`
- **Connexion — environ 68 px réservés en bas de l'écran pour une barre d'onglets qui n'y est pas affichée**
  `v2/styles.css:386 applique padding-bottom:calc(var(--h-onglets,68px)+…) à .tel, qui enveloppe TOUTES les vues, connexion comprise. Et mesurerBarres ne remet jamais la variable à zéro : la garde est `if (hOnglets && hOnglets !== barresMesurees.onglets)` (v2/js/app.js:995), donc une barre cachée (hauteur 0) laisse la dernière valeur en place — ou, au tout premier démarrage, le repli de 68 px.`
- **Connexion — « v2 · socle » affiché comme jalon sous le titre : du vocabulaire de chantier sur le premier écran que verra un bêta-testeur**
  `v2/index.html:29 (<span class="jalon">v2 · socle</span>), styles.css:74`
- **Page exercice — « Dernière séance » affiche le PALIER, alors que le bloc « Par exercice » de Progression, d'où l'on arrive en un seul tap, affiche la MEILLEURE SÉRIE du même jour. Deux nombres différents pour le même exercice et la même date, à un clic d'écart — et l'onglet Historique de la même page montre, lui, les séries réelles.**
  `v2/js/app.js:2905-2907 ({ charge: palier.palier, reps: palier.reps }) contre v2/js/app.js:493-495 (Modele.formatMesure sur r.meilleure). Les deux grandeurs sont séparées exprès dans le moteur (v2/js/palier.js:419-423 : « palier/reps pour le moteur, meilleure pour le journal »), mais rien à l'écran ne dit laquelle on regarde : les deux s'affichent au format « 122,5 × 5 ».`
- **Page exercice — « Dernière séance » avec une date mais « — » comme valeur, quand le palier du jour n'a pas pu être reconnu, alors que l'onglet Historique de la même page liste bien les séries de ce jour-là**
  `v2/js/app.js:2905-2909 pose derniere.date même si palier.palier vaut null ; texteMeilleure rend '' dans ce cas (v2/js/rendu.js:278-287) et ligneFiche écrit '—' (v2/js/rendu.js:293).`
- **Page exercice — « Record » sans aucune date sur toutes les mesures autres que charge_reps (reps, temps, distance_temps), alors que la spec demande la date de chaque record**
  `v2/js/modele.js:837-844 : meilleureSerieDeTout sort par le chemin non-charge_reps avant d'avoir posé `cle`, donc v2/js/app.js:2914 (record.date = record.cle || null) vaut toujours null. ECRAN-SAISIE-V1 §7 quater.3 : « La date de chaque record est affichée, et elle change la lecture ».`
- **Page exercice — « Séries de travail · sur 12 séances » en face d'un tiret, pour tout exercice qui ne porte pas de volume (randonnée, ou tout exercice à muscles_primaires vide)**
  `Le compte passe par Semaine.compteSeriesTravail (v2/js/app.js:2932), qui écarte ces exercices (v2/js/semaine.js:262-264 porteDuVolume, appelé en 288) → 0 → ligneFiche écrit '—' (v2/js/rendu.js:395-397), tandis que nbSeances vient du nombre de groupes (v2/js/app.js:2933). À vérifier sur les 237 entrées réelles du catalogue : le cas est certain dans la fixture de test (tests/unit/v2-page-exercice.test.js, slug 'rando' avec muscles_primaires: []).`
- **Page exercice — l'en-tête de section « PAR NOMBRE DE RÉPÉTITIONS » est rendu même sur `temps` et `distance_temps`, juste au-dessus de « Pas de table par répétitions pour cet exercice. » : un titre pour une chose qui n'existe pas**
  `v2/js/rendu.js:336 (l'en-tête est posé avant tout test) puis 338-343`
- **Page exercice — sur une mesure `reps` sans série de travail enregistrée, le message affiché est « Pas de table par répétitions pour cet exercice. » : c'est faux, tableParReps en construit une pour `reps`. Le ternaire teste la MESURE au lieu de la CAUSE de l'absence.**
  `v2/js/rendu.js:340-342 (PHRASE_SANS_PALIER[vue.mesure] ? … : …) et v2/js/rendu.js:270-275, où la clé 'reps' est présente — alors que v2/js/modele.js:892 accepte explicitement 'reps'.`
- **Page exercice — la séance EN COURS n'entre dans aucun chiffre de la page. On y arrive depuis elle, son bandeau « … · en cours » est affiché en haut, et « Dernière séance », « Record », « Séries de travail », la table et l'historique ignorent tout ce qui vient d'être fait.**
  `seancesDeLExercice ne lit que local.seances (v2/js/app.js:2838-2846), dont l'invariant est « QUE des séances terminées » (v2/js/app.js:183-202, goulot rangerSeances → Sync.ranger).`
- **Page exercice — un slug inconnu du catalogue ouvre quand même une page complète, titrée avec le slug brut, avec une fiche de records entièrement vide**
  `RE_SLUG accepte n'importe quel mot de 1 à 64 caractères (v2/js/routeur.js:51, 118-127) et rendreExercice ne vérifie rien : nom: exo ? exo.nom : slug (v2/js/app.js:2918), mesure: null → PHRASE_SANS_PALIER[null] undefined → « Aucune série de travail enregistrée. »`
- **Page exercice — chaque bascule de sous-onglet EMPILE une entrée d'historique. Résumé↔Historique trois fois = trois retours à faire avant de quitter la page, et « ← Retour » ramène au sous-onglet précédent, pas « d'où l'on vient » comme l'annoncent le commentaire du balisage et la spec.**
  `afficherExercice appelle allerA sans le drapeau `remplacer` (v2/js/app.js:2980-2984), et allerA empile dès que le chemin change (v2/js/app.js:3277-3286). Le bouton fait history.back() (v2/js/app.js:3353-3355). Promesse contraire : v2/index.html:74-76 et ECRAN-SAISIE-V1 §7 quater.`
- **Page exercice — l'onglet allumé en bas est « Séances » même quand on arrive depuis la séance en cours (onglet Saisie), juste sous le bandeau « … · en cours » qui dit l'inverse**
  `v2/js/routeur.js:167 (ongletDe : EXERCICE → RACINE), appliqué par v2/js/app.js:137-141 ; le bandeau vient de v2/js/rendu.js:314-329.`
- **Démarrage à froid — une ouverture directe sur /exercice/<slug> avec un cache vide affiche l'écran « Mes séances » et le message « Première synchronisation… », pendant que la barre d'adresse continue d'indiquer /exercice/<slug>. Si la synchronisation échoue, l'écart persiste.**
  `v2/js/app.js:3212 : montrer('liste', Routeur.RACINE) sans allerA — l'URL n'est pas corrigée. La correction n'arrive que plus tard, en v2/js/app.js:3230, après un réseau qui répond.`
- **Contradiction routeur ↔ app sur les sous-onglets périmés : le routeur promet en commentaire ET en code qu'un sous-onglet inconnu « retombe sur le Résumé, pas sur la racine », mais au démarrage l'app jette toute route portant un `repli` et va à la racine. La même URL se comporte différemment selon qu'on l'ouvre ou qu'on y revient par le bouton retour (popstate → rendreRoute, qui ne regarde pas `repli`).**
  `v2/js/routeur.js:120-124 (retourne { vue: EXERCICE, params:{slug}, repli:'sous-vue-inconnue' }) contre v2/js/app.js:3193-3196 (if (routeInitiale.vue === CONNEXION || routeInitiale.repli) → RACINE). Chemin popstate : v2/js/sortie.js:91-94 → v2/js/app.js:3303-3320.`
- **Profil — « Tu régleras ici ton compte et ta façon de travailler. » : un futur qui ne s'appuie sur rien (aucune table `profiles` lue, aucun champ, aucun écran), pendant que la seule action de compte réellement disponible, « Quitter », se trouve sur un autre onglet. Le commentaire CSS qui stylise cette phrase parle encore d'« onglets » au pluriel alors qu'il n'en reste qu'un.**
  `v2/index.html:193 · v2/styles.css:388-391 (« Onglets encore sans contenu ») · bouton de déconnexion en v2/index.html:51`

### Ce qui répond — 17

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## audit 14/09

L'audit du 14/09 a été largement dépilé : toute la gravité 1 est refermée (D5, D6, D7, D9 aux chantiers 36-38 et 46, D8 requalifié au 35), et les deux plus gros défauts de gravité 2 sur le compte de séries (C1, C2) sont réglés par `THSemaine.compteSeriesTravail` et `Seance.compter().travail`. Restent ouverts, inchangés : le tonnage spécifié et implémenté nulle part (C3), la porte `SANS_CHARGE` qui masque les exercices assistés (C4), le seuil de chauffe dégénéré sur charges négatives (C5), les chiffres de specs périmés (C6, C7, C8), le `cou` (C10), les deux contradictions non tranchées (C11), quatre des sept défauts de tests (T3, T5, T6, T7) et l'essentiel du code mort de gravité 4. Les specs portent elles-mêmes une quinzaine de marqueurs « signalé et non corrigé », dont trois que j'ai re-vérifiés vrais dans le code aujourd'hui (assistance, gainage seul classé sortie, durée 0 s muette). Attention : un résidu de C1/C2 subsiste, le bandeau et l'écran de fin comptent sans le filtre catalogue que la carte et la barre appliquent.


### Là, mais inerte — 29

*Affiché ou écrit, et qui ne fait rien.*

- **C3 — le tonnage est spécifié en détail et n'existe nulle part dans le code**
  `v2/js/ (aucun calcul) · v2/js/donnees.js:169-173`
  <br>*Preuve :* `grep -rn "tonnage|coef_pdc|masse_depart" v2/js/` ne rend que deux COMMENTAIRES (palier.js:291, palier.js:448). `tousLesExercices` sélectionne `slug, nom, mesure, charge, muscles_primaires, muscles_secondaires` — ni `compte_tonnage`, ni `coef_pdc`, ni `masse_depart_kg` ne descendent. La règle « dernier poids avant la séance » n'est écrite nulle part.
- **C4 — la porte du chantier 31 sort `SANS_CHARGE` avant toute lecture de charge : les exercices assistés restent invisibles au moteur**
  `v2/js/palier.js:79 et 255`
  <br>*Preuve :* `var MESURES_SANS_CHARGE = { reps: true, temps: true };` puis, ligne 255, `if (MESURES_SANS_CHARGE[mesure]) return sortie(series, roles, null, SANS_CHARGE, []);` — placé AVANT `plusLourde` (ligne 266) et avant toute lecture de `charge_kg`. Tractions / dips / muscle-up sont en `mesure = 'reps'` : remplir `charge_kg` en amont ne les ferait toujours pas entrer.
- **C5 — le seuil de chauffe reste dégénéré sur les charges négatives**
  `v2/js/palier.js:282 · v2/banc/banc_etage1.py:163`
  <br>*Preuve :* `if (k < indexPalier && nombre(s.charge_kg) <= SEUIL_CHAUFFE_PROBABLE * plusLourde)` — aucun test de signe. Avec `plusLourde = -10`, le seuil vaut -7,5 et tout ce qui précède le palier provisoire passe. Le Python reproduit la même ligne. La spec elle-même le documente comme non corrigé (MOTEUR-PROGRESSION-V2.md:208-217).
- **C6 — le moteur raisonne encore sur une population de 16 704 séries quand la base en a 28 103**
  `v2/specs/MOTEUR-PROGRESSION-V2.md:1293 et 1391`
  <br>*Preuve :* « la colonne `ressenti` est vide sur les **16 704 séries** » et « `ressenti` vide sur 16 704 séries », alors que README.md:67, SCHEMA-REEL.md:13 et ECRAN-SAISIE-V1.md:604 disent tous 28 103. Les parts citées comme preuve au §4-§5 portent donc sur ~60 % du corpus.
- **C7 — le compte de `rpe` en base reste périmé dans deux specs**
  `v2/specs/SCHEMA-REEL.md:97 · v2/specs/ECRAN-SAISIE-V1.md:342`
  <br>*Preuve :* SCHEMA-REEL : « `rpe` | numeric(3,1) | **136 renseignées sur 28 103** (0,5 %) ». ECRAN-SAISIE : « aurel_br l'a saisi sur **136 séries en trois ans** ». L'audit du 14/09 a mesuré 246, sur 2 utilisateurs. Aucune des deux lignes n'a bougé.
- **C8 — la numérotation des migrations est toujours déraillée dans les specs**
  `v2/specs/SCHEMA-REEL.md:4, 10-11, 189 · v2/specs/ECRAN-SAISIE-V1.md:2238`
  <br>*Preuve :* SCHEMA-REEL annonce « Dernière migration : `v2_040_temps_de_repos` · Prochain numéro libre : `v2_041` », ECRAN-SAISIE §9 annonce « Prochain numéro libre : `v2_037` » — pendant que le code cite `v2_042_routine_sets` (routines.js:41, SCHEMA-REEL.md:133) et que ECRAN-SAISIE:1518 consigne « Migration `v2_043` — appliquée le 17/09/2026 ».
- **C10 — `cou` reste retiré de la nomenclature contre la décision explicite de la spec**
  `v2/js/semaine.js:20-36`
  <br>*Preuve :* Le commentaire se contredit lui-même en quatre lignes : « `cou` existe dans la nomenclature et reste vide — c'est voulu » puis « `cou` y figurait et n'existe dans aucun exercice : retiré. » `LIBELLES_MUSCLE` (lignes 28-36) porte 18 clés, sans `cou`.
- **C11a — les crans d'effort : trois côté moteur, quatre côté base, et aucun pont `reste_* → cran`**
  `v2/js/palier.js:439-445 · v2/js/seance.js:33 · v2/js/rendu.js:2106-2109`
  <br>*Preuve :* `function cranEffort(rpe)` ne lit QUE `rpe` ; `RESSENTIS = ['reste_3_plus','reste_2','reste_1','reste_0']` en porte quatre. `rendu.js:2106-2109` mappe les quatre vers des LIBELLÉS (`'3+'`, `'facile'`, `'à l'échec'`), jamais vers un cran. La pénalité du §17.4 (`repsComptees`, palier.js:449-453) reste donc inatteignable dans le mode par défaut, qui est le ressenti.
- **C11b — §5.11 (« un geste destructeur ne doit pas être accessible au glissement ») contre §3 bis.5 (glissement pour supprimer une série), et le code suit le second**
  `v2/js/rendu.js:1363-1399 · v2/specs/ECRAN-SAISIE-V1.md:577-579 vs 388-390`
  <br>*Preuve :* `brancherGlissement(ligne, surSupprimer)` : au relâchement, `if (dx <= -OUVERTURE * 0.6) surSupprimer();`. La contradiction n'est arbitrée nulle part ; le commentaire du code la contourne (« il n'est JAMAIS le seul chemin ») sans que la spec soit mise à jour.
- **T3 — les assertions de navigation du banc SW ne prouvent toujours que « le HTML a été servi »**
  `tests/banc/sw-navigation.js:52-53 et 318-327`
  <br>*Preuve :* `sections: document.querySelectorAll('section').length`, vrai même si aucun des scripts n'a tourné, est le seul critère de `ouvrir()`. Et `VERIF_6` rattache à ces scénarios les DEUX vérifications marquées `obligatoire: true` du §4 bis de CLAUDE.md.
- **T5 — aucun timeout dans la vidange : un `fetch` qui pend laisse `vidangeEnCours` à `true` pour toujours**
  `v2/js/app.js:577-607`
  <br>*Preuve :* `vidangeEnCours = true;` ligne 579, `await executer(op)` ligne 588 sans `AbortController` ni course contre un délai ; le `finally` ne s'exécute que si l'`await` rend la main. Toute vidange ultérieure sort au premier `if` de la ligne 578. Aucun `timeout`/`AbortController` dans tout v2/js/app.js.
- **T6 — les supersets sont toujours validés VIDES au banc**
  `tests/banc/seance-ecran.js:1979-1984, appelé 2072-2126`
  <br>*Preuve :* `validerRangee` fait `...querySelectorAll('.ligne-serie')[r].querySelector('.ok-serie').click();` — aucune charge, aucune rep saisie avant le clic. Les 10 séries écrites en base au scénario 7 octies le sont toutes sans valeur tapée.
- **T7 — aucune suite ne charge `v2/js/app.js` : `synchroniser`, la boucle de vidange et l'ordonnancement du démarrage ne sont couverts par aucun test unitaire**
  `tests/unit/ et tests/banc/ (aucun require)`
  <br>*Preuve :* Le décompte des `require('../../v2/js/…')` donne seance 22, modele 21, semaine 11, routines 10, rendu 10, sync 5, attente 5, palier 4, routeur 3, donnees 3, periode 2, calendrier 2, cache 2, sortie 1, poids 1, auth 1 — et **zéro** pour app.js. Les `app.js` qui apparaissent dans tests/unit pointent tous vers `js/app.js` (le v1).
- **T2 — l'assertion tautologique de `seance-ecran.js:604` : non retrouvée, à vérifier**
  `tests/banc/seance-ecran.js`
  <br>*Preuve :* La ligne 604 porte aujourd'hui le faux serveur `routine_sets` (le fichier a été réécrit aux chantiers 41-45). Aucun motif `ok('…', X === X)` ne ressort d'un balayage des 343 assertions. Pour trancher il faudrait le diff de ce fichier entre le 14/09 et aujourd'hui, que je n'ai pas fait (une seule lecture git autorisée).
- **G4 — `CHAMPS_EXERCICE` : liste blanche annoncée deux fois comme LA garde, zéro lecture en production**
  `v2/js/routines.js:27, 73, 976`
  <br>*Preuve :* Le commentaire ligne 27 dit « La liste blanche `CHAMPS_EXERCICE` ci-dessous est la garde : rien d'autre ne part en base, et un test l'exige explicitement. » Or `normaliserExercice` (routines.js:471-490) construit son objet à la main, champ par champ, sans jamais consulter la liste. Les seules lectures sont deux tests (v2-editeur-est-la-seance.test.js:658, v2-file-bloquee.test.js:76) — qui gardent donc une constante que le chemin d'écriture ignore.
- **G4 — `protegees` : son commentaire lui attribue la protection contre la pire perte du projet, et rien ne l'appelle ; la vraie garde est sa jumelle dix lignes plus bas**
  `v2/js/attente.js:334-346 vs 349-356 · v2/js/app.js:289`
  <br>*Preuve :* `app.js:289` passe `conserver: Attente.seancesEnAttente(attente)`. `protegees` n'a aucun appelant de production ; son seul lecteur est tests/unit/v2-notes-repos-fin.test.js:477-478.
- **G4 — `TYPES_CONNUS` : seconde copie inerte d'un CHECK**
  `v2/js/modele.js:24 et 1046`
  <br>*Preuve :* Déclarée et exportée, aucune autre occurrence dans v2/ ni dans tests/.
- **G4 — `rendu.js` : 25 clés construites dans un littéral `api` jamais lu ; la vraie surface est un second littéral**
  `v2/js/rendu.js:2758 vs 2785`
  <br>*Preuve :* `var api = { … }` (ligne 2758) n'est référencé nulle part ailleurs dans le fichier (`grep -n "\bapi\b" v2/js/rendu.js` ne rend que la déclaration). L'export réel est `racine.THRendu = { … }` ligne 2785.
- **G4 — `calendrier.js` : les deux fonctions qui ÉNONCENT la règle centrale du module ne sont lues que par les tests**
  `v2/js/calendrier.js:84 et 96`
  <br>*Preuve :* `semaineDuJour` et `ligneDeLaSemaine` : appelants uniquement dans tests/unit/v2-calendrier.test.js:53, 65, 85, 141, 144, 145. Aucun dans v2/js/.
- **G4 — `rendreListeSeances` reste du poids mort, et il est exporté DEUX fois**
  `v2/js/rendu.js:102, 2778 et 2833`
  <br>*Preuve :* Aucun appelant dans v2/js/app.js, v2/index.html ni tests/. Exporté à la fois dans le littéral mort `api` et dans `racine.THRendu`.
- **G4 — `seance.js retirerExercice` (singulier) sans appelant : seul `retirerExercices` (pluriel) sert**
  `v2/js/seance.js:403 et 1663`
  <br>*Preuve :* Les appels réels sont `Seance.retirerExercices` (app.js:1630 et 1699, plus quatre tests). La forme au singulier n'apparaît que dans sa déclaration et son export.
- **G4 — `racine.THApp` : exporté, et son propre commentaire dit que rien ne s'en sert**
  `v2/js/app.js:3474-3476`
  <br>*Preuve :* « Exposé pour l'écran de saisie à venir : une vue déclare ici qu'elle refuse la sortie… Rien ne s'en sert encore. » `grep -rn THApp v2/ tests/` ne rend que cette ligne ; `ajouterGarde`/`retirerGarde` sont bien utilisées, mais en interne (app.js:2771, 2779).
- **G4 — `rendu.js:951` code six ancres en dur « dans l'ordre géométrique de THPeriode.ORDRE » sans jamais lire `ORDRE`**
  `v2/js/rendu.js:951-960`
  <br>*Preuve :* `ANCRES` est un tableau littéral de six positions ; `ORDRE` n'apparaît que dans le commentaire. Le couplage reste implicite : réordonner `periode.js:88` décale silencieusement les étiquettes du radar.
- **G5 — `recette_palier.py` cite un « §812 » qui n'existe pas**
  `v2/banc/recette_palier.py:71 et 78`
  <br>*Preuve :* « le compteur reproduit le bug du §812 » et « C'est le bug documenté au §812 ». Aucun §812 dans MOTEUR-PROGRESSION-V2.md.
- **G5 — `banc_etage1.py` cite §7.4 pour l'exploration, qui est au §7.5**
  `v2/banc/banc_etage1.py:192`
  <br>*Preuve :* Commentaire « # §7.4 — exploration ». Dans la spec : ligne 431 « ### 7.4 Ce qui entre dans `n` », ligne 441 « ### 7.5 L'exploration ».
- **G5 — `banc_etage2.py` calcule la cible par le MODE des reps, méthode que MOTEUR §9.1 déclare remplacée**
  `v2/banc/banc_etage2.py:34, 46, 79`
  <br>*Preuve :* `def cible_reps(historique, methode="mode")` puis `Counter(historique).most_common(1)[0][0]`. MOTEUR §9.1 (ligne 542-547) : « La cible n'essaie pas de deviner ce qui sera fait. Elle dit quoi faire. » → reps du dernier passage +1, ou bas de fourchette.
- **G5 — `.g-distance_temps` met 66 px là où la spec et les trois autres gabarits disent 62**
  `v2/styles.css:669 vs v2/specs/ECRAN-SAISIE-V1.md:324`
  <br>*Preuve :* `.g-distance_temps{grid-template-columns:30px 66px 1fr 1fr 40px}` face à `.g-charge_reps`, `.g-reps`, `.g-temps` qui portent tous `62px` (styles.css:666-668), et au gabarit de la spec « 30px 62px 1fr 44px 40px 40px ».
- **G5 — trois comptages inconciliés de l'assistance**
  `v2/js/palier.js:148 · v2/specs/ECRAN-SAISIE-V1.md:297-299 · v2/specs/MOTEUR-PROGRESSION-V2.md:210`
  <br>*Preuve :* palier.js : « 124 séries en base ». ECRAN-SAISIE §3 ter.4 : « 128 séries, 10 exercices ». MOTEUR §4.1 : « 42 séance-exercices sur 6 385, six exercices ». L'audit avait tranché à 125 séries / 42 séance-exercices / 6 exercices — aucune des trois lignes n'a été alignée.
- **Résidu de C1/C2 — le bandeau et l'écran de fin comptent SANS le filtre catalogue que la carte et la barre appliquent**
  `v2/js/seance.js:1140-1148 vs v2/js/semaine.js:276-292`
  <br>*Preuve :* `Seance.compter().travail` = `validee_a && type_serie === 'travail'`, sans `porteDuVolume`. `Semaine.compteSeriesTravail` retranche en plus les exercices sans muscle primaire (les 13 du corpus, cf. C2). Une séance contenant un tel exercice affiche donc un nombre au bandeau (rendu.js:1141, via app.js:1232) et à l'écran de fin (rendu.js:2480, via app.js:1860), et un autre sur sa carte et sa barre. À vérifier sur un cas réel : il faut un exercice sans `muscles_primaires` validé en `type_serie = 'travail'`, ce que je ne peux pas confirmer sans la base.

### Ce qui manque — 17

*Décidé en spec, absent du code.*

- **Le bandeau de séance en cours : composant écrit, jamais branché à la séance. `Rendu.rendreBandeauReprise` n'a qu'un appelant, `rendreBandeauBrouillon` (v2/js/app.js:2041-2055), pour le brouillon de ROUTINE. Restent dus : l'emplacement (« toujours non tranché »), le calcul du sujet et de l'ancienneté depuis `seance.debut`, le câblage de « Reprendre » / « Terminer », et la pastille sur l'onglet Saisie.**
  `v2/specs/ECRAN-SAISIE-V1.md:1371-1378 — titre de section : « décidé, COMPOSANT ÉCRIT, non branché »`
- **L'assistance casse le seuil des 75 % du §4.1 — « signalé au chantier 17 et non corrigé ». Vérifié vrai dans le code aujourd'hui (v2/js/palier.js:282).**
  `v2/specs/ECRAN-SAISIE-V1.md:297-299 (§3 ter.4) et v2/specs/MOTEUR-PROGRESSION-V2.md:208-217 (« Réserve signalée le 11/09/2026, non corrigée »)`
- **Une séance de gainage seul est classée « sortie » — « trouvé au chantier 24, non corrigé ». Vérifié vrai : `estExerciceSortie` retient `charge === 'aucune' && (mesure === 'temps' || mesure === 'distance_temps')` (v2/js/modele.js:332-335), lu par `resumerSeance` (modele.js:982).**
  `v2/specs/ECRAN-SAISIE-V1.md:305-309 (§3 ter.4)`
- **Une durée de zéro seconde disparaît de l'affichage — « trouvé au chantier 25, non corrigé ». Vérifié vrai : `if (serie.duree_s)` (v2/js/modele.js:74) et `if (s.duree_s)` (v2/js/modele.js:980) sont des tests de vérité, pas de nullité.**
  `v2/specs/ECRAN-SAISIE-V1.md:311-314 (§3 ter.4) — « Même famille que “0 comme null”, à traiter d'un coup pour les quatre mesures »`
- **Le tonnage suspendu : le catalogue dit qu'un exercice suspendu compte 100 % du poids de corps daté, mais tractions, dips barres et muscle-up sont en `reps` — sans charge saisie, avec un tonnage réel. Point ouvert venu du catalogue, jamais fermé.**
  `v2/specs/ECRAN-SAISIE-V1.md:301-303 (§3 ter.4) · v2/specs/REGLES-DE-COMPTAGE-V1.md:205-231 (§4)`
- **Le total hebdomadaire de tonnage : décider s'il est affiché du tout, ou seulement par exercice. Point 3 du « Ce qui reste à faire », les quatre autres étant barrés.**
  `v2/specs/REGLE-VOLUME-V2.md:321-326 (§12)`
- **L'ordre des exercices dans la séance — chantier ouvert le 11/09/2026, mesure obligatoire avant toute règle.**
  `v2/specs/MOTEUR-PROGRESSION-V2.md:58 (index) et 822 (§12 bis) · point ouvert au §12.7, ligne 816`
- **La notion de PROGRESSION entre variantes (la prise serrée sert de palier avant le diamant) : « notée, pas implémentée ».**
  `v2/specs/REGLES-DE-COMPTAGE-V1.md:325 (§8, renvoi au §9)`
- **Le banc d'essai du moteur : « Statut : spec validée, non implémentée », plus un §13 « Reste ouvert ».**
  `v2/specs/BANC-ESSAI-V1.md:3 et 509`
- **Marquer un échec à l'écran de saisie : « Point ouvert ». Et les alternatives d'exercice, §7 ter.4, également « Point ouvert ».**
  `v2/specs/ECRAN-SAISIE-V1.md:974 et 1099`
- **Huit points au « Reste ouvert » de l'écran de saisie, dont deux qui touchent au comportement livré : « Fin de bloc — quand le dernier tour est validé, plus rien n'est éclairé, il faut que le bloc suivant s'allume », et « Menu qui sort de l'écran en bas de liste ».**
  `v2/specs/ECRAN-SAISIE-V1.md:2211-2226 (§8)`
- **La fenêtre muette du référentiel : « Couvert depuis, mais à recalibrer » — ses seuils reposent sur un seul utilisateur alors que les cinq profils sont en base.**
  `v2/specs/REFERENTIEL-BORNES-V1.md:407 (§1.5)`
- **« Ce qui reste ouvert » des modificateurs de série (tempo, élastique).**
  `v2/specs/MODIFICATEURS-SERIE-V1.md:176 (§5)`
- **Le moteur ne parle pas encore : trois commentaires du code renvoient explicitement une prescription au « chantier 5 ». `fantome` ne propose que du mesuré, `rendu.js` ne suggère aucune charge.**
  `v2/js/seance.js:1392, 1515, 1538 · v2/js/rendu.js:1830 (« le moteur ne parle pas encore, et inventer un… »)`
- **`body_weight_log.masse_grasse_pct` est lue au schéma et n'a pas d'écran : la colonne existe, rien ne l'affiche ni ne la saisit.**
  `v2/js/donnees.js:144-152 (commentaire de `toutesLesPesees`)`
- **`toursComplets` garde un filtre d'entrée dont le commentaire admet qu'il ne protège de rien (« On la garde parce qu'elle dit la règle… pas parce qu'elle protège de quelque chose ») — dette assumée, pas un défaut.**
  `v2/js/modele.js:665-680`
- **Le README des specs tient lui-même une table « Divergences connues — signalées, pas arbitrées » de quatre documents à volumétrie périmée (REGLES-DE-COMPTAGE, REFERENTIEL-BORNES, REGLE-VOLUME §9.4, ECRAN-SAISIE §9). Aucune n'a été arbitrée depuis le 12/09.**
  `v2/specs/README.md:60-75`

### Ce qui apparaît sans raison — 13

*Contradictions et affichages impossibles.*

- **Le commentaire de `LIBELLES_MUSCLE` se contredit en quatre lignes (« `cou` existe dans la nomenclature et reste vide — c'est voulu » / « `cou` y figurait et n'existe dans aucun exercice : retiré ») et contredit la spec, qui fait du maintien de la case vide le point même de la règle : « Le cou et l'avant-bras sont gardés bien qu'inutilisés, et c'est le point ».**
  `v2/js/semaine.js:20-36 vs v2/specs/REGLES-DE-COMPTAGE-V1.md:114 (§3)`
- **La phrase qui décrit l'ordre des charges négatives est inversée par rapport au code qu'elle commente : « −20 kg d'assistance est une charge, et elle est plus lourde que −10 », alors que `calculerPalier` prend le MAXIMUM, donc traite −10 comme la plus lourde. La même phrase est recopiée dans le banc Python.**
  `v2/js/palier.js:147-148 (au-dessus de `calculerPalier`, ligne 149) · v2/banc/banc_etage1.py:92-93`
- **Trois numéros de « prochaine migration libre » coexistent : SCHEMA-REEL dit `v2_041`, ECRAN-SAISIE §9 dit `v2_037`, et le code plus la §7 vicies.4 attestent `v2_042` et `v2_043` déjà appliquées.**
  `v2/specs/SCHEMA-REEL.md:4, 10-11, 189 · v2/specs/ECRAN-SAISIE-V1.md:2238 vs v2/js/routines.js:41 et v2/specs/ECRAN-SAISIE-V1.md:1518`
- **Le moteur raisonne sur 16 704 séries quand le README, SCHEMA-REEL et ECRAN-SAISIE en annoncent tous 28 103 — les parts citées comme preuve au §4 et §5 portent donc sur ~60 % du corpus, et ce corpus est réparti sur cinq utilisateurs dont aucun ne voit ce total.**
  `v2/specs/MOTEUR-PROGRESSION-V2.md:1293, 1391 vs v2/specs/README.md:67 et SCHEMA-REEL.md:13`
- **`sets.rpe` est donné à 136 renseignées par deux specs, chiffre que l'audit du 14/09 a mesuré à 246 sur deux utilisateurs — et le §21.5 du moteur affirme en outre que le RPE « n'a jamais atteint la base ».**
  `v2/specs/SCHEMA-REEL.md:97 · v2/specs/ECRAN-SAISIE-V1.md:342 · v2/specs/MOTEUR-PROGRESSION-V2.md:1293`
- **MOTEUR §17.3 spécifie trois crans d'effort ; ECRAN-SAISIE §3 bis.2 et le CHECK `sets_ressenti_ok` en imposent quatre. Le code implémente les deux côte à côte sans pont : `cranEffort` ne lit que `rpe`, `RESSENTIS` porte les quatre valeurs, et `rendu.js` ne traduit les quatre qu'en libellés.**
  `v2/js/palier.js:439-445 et v2/js/seance.js:19, 33, v2/js/rendu.js:2106-2109 vs v2/specs/MOTEUR-PROGRESSION-V2.md:1103-1119 et v2/specs/ECRAN-SAISIE-V1.md:336-347`
- **ECRAN-SAISIE §5.11 interdit un geste destructeur au glissement ; §3 bis.5 spécifie le glissement latéral pour supprimer une série ; `brancherGlissement` implémente le second. Contradiction interne non arbitrée, seulement contournée par un commentaire de code.**
  `v2/specs/ECRAN-SAISIE-V1.md:577-579 vs 388-390 · v2/js/rendu.js:1350-1399`
- **Le gabarit `distance_temps` met 66 px à la colonne « précédent » là où la spec et les trois autres gabarits du même fichier disent 62.**
  `v2/styles.css:669 vs v2/specs/ECRAN-SAISIE-V1.md:324`
- **Le tonnage est spécifié en détail dans trois specs — jusqu'à l'icône qui déroulerait la règle appliquée (« Tractions — 100 % de ton poids du 2 sept. ») — et n'existe dans aucune ligne de v2/js/ ; les colonnes qui le permettraient ne sont même pas sélectionnées.**
  `v2/specs/REGLES-DE-COMPTAGE-V1.md:30-40, 205-231, 329, 417 et v2/specs/REGLE-VOLUME-V2.md §12.3 vs v2/js/donnees.js:169-173`
- **`routines.js` annonce deux fois `CHAMPS_EXERCICE` comme LA garde qui empêche une charge de partir en base, et le chemin d'écriture ne la lit jamais : la garde réelle est l'objet littéral de `normaliserExercice`. Deux tests verrouillent la liste inerte, ce qui donne l'apparence d'une protection testée.**
  `v2/js/routines.js:27 et 73 vs v2/js/routines.js:471-490 · tests/unit/v2-file-bloquee.test.js:76-77`
- **`attente.js` place deux fonctions quasi identiques à dix lignes d'écart : `protegees`, qui porte le commentaire décrivant « la perte la plus grave du projet », n'a aucun appelant ; `seancesEnAttente`, sans commentaire de doctrine, est celle que `app.js` passe réellement à `Sync.remplacer`.**
  `v2/js/attente.js:334-346 vs 349-356 · v2/js/app.js:289`
- **Le banc Python du palier renvoie à un « §812 » qui n'existe dans aucune spec, et cite §7.4 pour l'exploration qui est au §7.5 ; `banc_etage2.py` calcule la cible par le mode des reps, méthode que MOTEUR §9.1 déclare remplacée.**
  `v2/banc/recette_palier.py:71, 78 · v2/banc/banc_etage1.py:192 · v2/banc/banc_etage2.py:34, 46, 79 vs v2/specs/MOTEUR-PROGRESSION-V2.md:441 et 542-547`
- **`rendu.js:951` déclare suivre « l'ordre géométrique de THPeriode.ORDRE » et code six ancres en dur sans jamais lire `ORDRE` : réordonner `periode.js:88` décalerait silencieusement les étiquettes du radar.**
  `v2/js/rendu.js:951-960 vs v2/js/periode.js:88`

### Ce qui répond — 11

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*

---

## transversal

Le transversal est en meilleur état que les écrans : la liste SHELL du service worker correspond EXACTEMENT aux 20 scripts et 4 ressources chargés par v2/index.html, la barre d'onglets de index.html et ONGLETS de routeur.js déclarent les quatre mêmes vues, et le « fil rouge » des colonnes est réellement fermé côté sets/sessions — donnees.js:98-105 dérive la liste LUE de la liste ÉCRITE de seance.js, l'écart n'est plus possible par construction.
Le même fil rouge reste OUVERT côté routines : COLONNES_ROUTINE_EXO / COLONNES_ROUTINE_SET (donnees.js:208-214) sont des chaînes écrites à la main, pas dérivées de CHAMPS_EXERCICE / CHAMPS_SERIE (routines.js:73-79). Résultat mesuré : routine_sets.user_id est écrit et jamais relu ; routines.created_at et routines.modifiee_a sont relues puis jetées par normaliserRoutine (app.js:1954) ; routines.note est relue, conservée, jamais écrite ni affichée.
Côté code mort : ~45 entrées exportées sans consommateur dans les 14 modules, dont trois vrais corps de fonction jamais appelés (seance.js:403 retirerExercice, rendu.js:102 rendreListeSeances) et un objet `api` de 24 entrées construit puis abandonné (rendu.js:2758, THRendu étant un second littéral à 2785). racine.THApp (app.js:3476) n'a aucun lecteur dans tout le dépôt.
Le plus gros trou est la couverture : les trois bancs ne touchent JAMAIS /progression/volume (radar, relevé par zones), /progression/poids (courbe, pesées), le calendrier, la fenêtre de muscle, l'écran de connexion ni la déconnexion. Progression et Profil n'y apparaissent que comme un smoke-test de routage (« la bonne section est visible »). L'onglet Profil, lui, est une vue atteignable dont tout le contenu est une phrase statique.


### Là, mais inerte — 17

*Affiché ou écrit, et qui ne fait rien.*

- **rendu.js construit un objet `api` de 24 entrées… et ne s'en sert jamais. `racine.THRendu` est un SECOND littéral, écrit 27 lignes plus bas, qui réénumère les mêmes 24 entrées plus 28 autres. La variable `api` n'apparaît qu'une fois dans tout le fichier : sa déclaration.**
  `v2/js/rendu.js:2758 (objet mort) vs v2/js/rendu.js:2785 (le vrai export)`
  <br>*Preuve :* grep -n '\bapi\b' v2/js/rendu.js → une seule ligne : 2758. Aucun `module.exports`, aucun `racine.THRendu = api`.
- **rendreListeSeances — corps de fonction jamais appelé. Supplanté par rendreJours (le commentaire ligne 795 le nomme lui-même « le jumeau »).**
  `v2/js/rendu.js:102 (définition), exporté deux fois en 2777 et 2832`
  <br>*Preuve :* grep -rn 'rendreListeSeances' sur tout le dépôt : 4 occurrences, toutes dans rendu.js — la définition, un commentaire (795) et les deux lignes d'export. Zéro appel.
- **racine.THApp = { ajouterGarde, retirerGarde } — global exposé, zéro lecteur dans le dépôt entier (v2/js, tests/, index.html, specs).**
  `v2/js/app.js:3476`
  <br>*Preuve :* grep -rn 'THApp' . --include=*.js --include=*.html --include=*.md → une seule ligne, la définition.
- **seance.js — retirerExercice : corps jamais appelé, ni dehors ni dedans. (À ne pas confondre avec retirerExercices, pluriel, qui, lui, sert.)**
  `v2/js/seance.js:403 (définition), export ligne 1663`
  <br>*Preuve :* grep -n '\bretirerExercice\b' v2/js/seance.js → 2 occurrences : la définition et l'export. `.retirerExercice` hors seance.js → 0.
- **seance.js — exports de constantes sans aucun consommateur : TYPES (l.32), RESSENTIS (l.33), EN_COURS (l.34), REPOS_CIBLE_MIN et REPOS_CIBLE_MAX (l.39). Elles servent à l'intérieur du module, jamais via le namespace.**
  `v2/js/seance.js, exports lignes 1650 et 1658`
  <br>*Preuve :* `.TYPES`, `.RESSENTIS`, `.EN_COURS`, `.REPOS_CIBLE_MIN`, `.REPOS_CIBLE_MAX` hors seance.js dans v2/js + tests → 0 occurrence. (L'EN_COURS de tests/unit/v2-statut-seance.test.js:48 est une const locale du test, sans rapport.)
- **seance.js — fonctions exportées utilisées seulement en interne, jamais via THSeance : serieVide (l.322), derniereValidation (l.1077), repsBornees (l.776), dureeBornee (l.780), toutesLesSeries (l.1130).**
  `v2/js/seance.js, exports lignes 1689, 1702-1703, 1712`
  <br>*Preuve :* `.serieVide`, `.derniereValidation`, `.repsBornees`, `.dureeBornee`, `.toutesLesSeries` hors seance.js → 0. Les mentions dans tests/unit/ sont des commentaires (« LE DÉFAUT : `serieVide` … »), pas des appels.
- **modele.js — TYPES_CONNUS (l.24) et MESURES (l.246) : aucune référence nulle part, pas même dans modele.js. Code strictement mort.**
  `v2/js/modele.js:24 et 246, exports lignes 1046 et 1047`
  <br>*Preuve :* grep -rn '\bTYPES_CONNUS\b' v2/js tests → 2 lignes, la définition et l'export. Idem MESURES : les autres hits sont des titres de commentaires (« LES QUATRE MESURES »).
- **modele.js — nombre (l.33), paqueter (l.371), toursFaits (l.689) : appelées en interne, exportées pour personne.**
  `v2/js/modele.js, exports lignes 1061, 1069, 1076`
  <br>*Preuve :* `.nombre`, `.paqueter`, `.toursFaits` hors modele.js → 0. (`\btoursFaits\b` ne matche pas toursFaitsParGroupe, qui, lui, est consommé.)
- **routines.js — normaliserNom (l.91), nomValide (l.101), nulSiHorsBornes (l.159), repsEcrites (l.272), replier (l.816) : exportées, aucun appelant via THRoutines.**
  `v2/js/routines.js, exports lignes 977, 979, 981, 982, 1015`
  <br>*Preuve :* `.normaliserNom` etc. hors routines.js dans v2/js + tests → 0. Les deux hits de « replier » (app.js:1495, rendu.js:1621) sont le verbe français dans un commentaire.
- **palier.js — treize exports sans consommateur : SEUIL_CHAUFFE_PROBABLE (l.27), SEUIL_SEANCES_ETAT (l.31), SEUIL_MONTE (l.32), SEUIL_NE_MONTE_PAS (l.33), ETAT_MONTE (l.54), ETAT_NE_MONTE_PAS (l.55), CHAUFFE (l.40), DEGRESSIVE (l.41), ECHEC (l.42), TOUT_CHAUFFE (l.74), MESURES_SANS_CHARGE (l.79), ROLE_DU_TAG (l.44), roleDuTag (l.49).**
  `v2/js/palier.js, bloc d'export lignes 476-507`
  <br>*Preuve :* Aucun `.SEUIL_*`, `.ETAT_MONTE`, `.roleDuTag`… hors palier.js. Ironie : le commentaire ligne 480-481 justifie l'export de SANS_CHARGE/HORS_MOTEUR par « un appelant qui veut distinguer… compare à une constante » — SANS_CHARGE et HORS_MOTEUR sont bien consommées, les onze autres non.
- **semaine.js — JOURS (l.18) et LIBELLES_MUSCLE (l.28) : exportées, jamais lues via THSemaine (libelleMuscle, lui, est consommé).**
  `v2/js/semaine.js, exports lignes 306 et 307`
  <br>*Preuve :* `.JOURS` et `.LIBELLES_MUSCLE` hors semaine.js → 0. Le JOURS de tests/unit/intensity-verdict.test.js:274 est une const locale d'un test v1.
- **routeur.js — ROUTINE_NEUVE (l.52), SOUS_PROGRESSION (l.56), depuisDate (l.79) : exportées, aucun appelant. Le routeur s'en sert à l'intérieur (analyser, construire).**
  `v2/js/routeur.js, exports lignes 219, 221, 223`
  <br>*Preuve :* `.ROUTINE_NEUVE`, `.SOUS_PROGRESSION`, `.depuisDate` hors routeur.js dans v2/js + tests → 0. À noter que versDate, elle, EST consommée — l'asymétrie est réelle.
- **poids.js — depuisJour (l.46) et normaliser (l.59) : exportées sans consommateur.**
  `v2/js/poids.js, exports lignes 199 et 200`
  <br>*Preuve :* `.depuisJour` et `.normaliser` hors poids.js → 0 occurrence dans v2/js et tests.
- **calendrier.js — MOIS (l.24) et LIGNES (l.27) exportées sans consommateur. Pire pour MOIS : rendu.js redéclare sa PROPRE table de mois plutôt que d'utiliser celle du module.**
  `v2/js/calendrier.js:24 et 27, exports 105-106 ; doublon à v2/js/rendu.js:507`
  <br>*Preuve :* `.MOIS` / `.LIGNES` hors calendrier.js → 0. rendu.js:507 : `var MOIS = ['janv.','févr.',…]` — une seconde source pour la même information.
- **periode.js — sommet (l.132), attente.js — CODES_DEFINITIFS (l.65) et CODES_BORNES (l.303), sync.js — terminees (l.168) : exportées, aucun appelant via le namespace.**
  `v2/js/periode.js:188, v2/js/attente.js:414 et 424, v2/js/sync.js:257`
  <br>*Preuve :* `.sommet`, `.CODES_DEFINITIFS`, `.CODES_BORNES`, `.terminees` hors de leur fichier → 0. Les seuls hits de « sommet » sont le mot français dans tests/unit/v2-periode.test.js.
- **Attributs id morts dans la page : note-routine, onglet-seances, onglet-saisie, onglet-progression, onglet-profil — référencés ni en JS ni en CSS. Les onglets sont sélectionnés par .onglet[data-vue=…], l'id est un reliquat.**
  `v2/index.html:120 (note-routine) et 237-240 (les quatre onglet-*)`
  <br>*Preuve :* grep de chaque id dans v2/js/*.js et v2/styles.css → 0. (Tous les autres id de la page ont au moins une référence.)
- **cache.js et donnees.js et sortie.js : RIEN d'inerte. Chacun de leurs exports a au moins un appelant — c'est le seul trio propre des quatorze.**
  `v2/js/cache.js:205-219, v2/js/donnees.js:407-433, v2/js/sortie.js:108`
  <br>*Preuve :* Balayage nom par nom de chaque clé de l'objet exporté : zéro résultat à zéro appelant.

### Ce qui manque — 9

*Décidé en spec, absent du code.*

- **Aucun des trois bancs ne parcourt /progression/volume. Le relevé par zones, le sélecteur de périodes, le radar et les cartes de comparaison ne sont jamais rendus dans un navigateur réel — rendreReleveZones, rendrePeriodes, rendreRadar, rendreCartesPeriode sont appelés par app.js mais aucun banc n'ouvre la vue.**
  `v2/specs/REGLE-VOLUME-V2.md · vue #vue-volume (v2/index.html:160-176), rendreVolume (v2/js/app.js:2669). grep 'vue-volume|radar|releve-zones|periodes-radar' dans tests/banc/ → 0 occurrence.`
- **Aucun banc ne parcourt /progression/poids : courbe, liste des pesées, sélecteur de période. La seule couverture est tests/unit/v2-poids.test.js, qui exerce le module pur sans jamais toucher au DOM.**
  `vue #vue-poids (v2/index.html:180-189), rendrePoids (v2/js/app.js:2714). grep 'courbe-poids|liste-pesees|periodes-poids' dans tests/banc/ → 0.`
- **Aucun banc n'ouvre le calendrier (choisir une semaine, mois précédent/suivant, « Cette semaine », fermeture au tap dehors). C'est pourtant l'entrée principale vers une semaine passée.**
  `#calendrier (v2/index.html:216-231), câblage v2/js/app.js:3400-3411. grep 'cal-grille|btn-mois|btn-cette-semaine|#calendrier' dans tests/banc/ → 0.`
- **Aucun banc n'ouvre la fenêtre de muscle (« d'où vient ce 11,5 »), troisième niveau du volume.**
  `#fenetre-muscle (v2/index.html:196-202), rendreFenetreMuscle (v2/js/rendu.js). grep 'fenetre-muscle' dans tests/banc/ → 0.`
- **Aucun banc ne passe par l'écran de connexion réel, ni par la déconnexion, ni par « Rafraîchir ». Les bancs entrent avec une session déjà posée. Le seul chemin qui déconnecte (app.js:3444-3452, la garde Auth.sessionPersistee) n'est donc éprouvé que par tests/unit/v2-auth.test.js, hors navigateur.**
  `#form-connexion, #btn-deconnexion, #btn-rafraichir (v2/index.html:27-37 et 52-54). grep 'form-connexion|champ-email|btn-deconnexion|btn-rafraichir' dans tests/banc/ → 0.`
- **Progression et Profil ne sont couverts par les bancs QUE comme smoke-test de routage : « /progression affiche vue-progression », « /profil affiche vue-profil ». Rien de leur contenu n'est vérifié.**
  `tests/banc/seance-ecran.js:4197-4199 (section 8 NON-RÉGRESSION) et tests/banc/routines-ecran.js:1570-1571.`
- **L'onglet Profil est atteignable et vide : toute la vue est une phrase statique (« Tu régleras ici ton compte et ta façon de travailler »), sans aucun rendu JS. C'est le dernier onglet écrit en clair dans le HTML — app.js:3296-3298 le dit lui-même.**
  `v2/index.html:191-194 ; VUES_ONGLET (v2/js/app.js:3299-3301) ne fait que montrer la section.`
- **La séance EN COURS n'a pas d'URL. rendreSeance appelle montrer('seance', Routeur.SAISIE) sans jamais écrire le chemin : #vue-seance est la seule des onze sections de index.html qui ne corresponde à aucune route du routeur. Le rattrapage existe (rendreSaisie rouvre la séance s'il y en a une), mais aucun chemin ne la désigne — ni partage, ni retour direct, ni scénario de banc adressable.**
  `v2/js/app.js:1229-1230 vs le schéma d'URL de v2/js/routeur.js:7-18. À vérifier si c'est délibéré : le commentaire de v2/index.html:130-133 (« Elle vit DANS l'onglet Saisie ») le suggère, mais aucune spec lue ne l'écrit noir sur blanc.`
- **v2/js/cache.js n'a ni module.exports ni test unitaire propre. tests/unit/v2-cache-integrite.test.js, malgré son nom, charge sync.js (ligne 11) et pas cache.js. Le magasin IndexedDB n'est donc éprouvé qu'indirectement, par les scénarios hors ligne des bancs.**
  `v2/js/cache.js:205 (racine.THCache = {…}, pas de module.exports) vs tests/unit/v2-cache-integrite.test.js:11.`

### Ce qui apparaît sans raison — 10

*Contradictions et affichages impossibles.*

- **Le fil rouge des colonnes est fermé sur sets/sessions et LAISSÉ OUVERT sur les routines. donnees.js dérive les colonnes de séance depuis THSeance (« l'écart n'est plus une chose à surveiller, c'en est une qu'on ne peut plus créer », l.88-94), puis, cent lignes plus bas, redéclare COLONNES_ROUTINE_EXO et COLONNES_ROUTINE_SET comme des chaînes tapées à la main, sans lien avec CHAMPS_EXERCICE / CHAMPS_SERIE. Même classe de défaut, même fichier, doctrine appliquée à moitié.**
  `v2/js/donnees.js:88-105 (dérivé) vs v2/js/donnees.js:197-214 (écrit à la main) ; listes blanches à v2/js/routines.js:73-79`
- **routine_sets.user_id est ÉCRIT et JAMAIS RELU. CHAMPS_SERIE contient user_id (l.78) ; COLONNES_ROUTINE_SET ne le lit pas. C'est justifié (le WITH CHECK de la policy l'exige, donnees.js:272-275) et sans conséquence tant que personne ne relit — mais c'est exactement l'asymétrie qui avait bloqué la file en 23502 au chantier 34, côté sets.**
  `v2/js/routines.js:78 (écrit) vs v2/js/donnees.js:212-214 (lu)`
- **routines.created_at et routines.modifiee_a sont transportées à chaque SELECT puis jetées. normaliserRoutine ne garde que id, nom, note, archivee_a, rang. modifiee_a est en plus ÉCRITE à la main à chaque majRoutine — donc entretenue avec soin pour n'être lue par personne.**
  `v2/js/donnees.js:197 (lues) et v2/js/donnees.js:240 (modifiee_a écrite) vs v2/js/app.js:1954-1965 (normaliserRoutine, qui les laisse tomber)`
- **routines.note est lue, conservée par normaliserRoutine (app.js:1957), et ensuite : jamais affichée, jamais écrite. brouillonDe ne la transporte pas (app.js:2090-2097), rendreListeRoutines ne l'affiche pas. Une colonne relue pour rien. À distinguer de routine_exercises.note, qui, elle, est lue ET écrite.**
  `v2/js/donnees.js:197 · v2/js/app.js:1957 · v2/js/app.js:2090 · v2/js/rendu.js:2598-2640`
- **routines.archivee_a est lue et filtrée (visibles, reordonnables) mais AUCUN code v2 ne l'écrit : le geste « Supprimer » supprime la ligne. Le commentaire routines.js:701 l'assume (« archivee_a NE CACHE PLUS RIEN »), mais la colonne reste dans COLONNES_ROUTINE et dans deux filtres actifs — du code de lecture pour une valeur que l'app ne peut plus produire.**
  `v2/js/donnees.js:197 · v2/js/routines.js:112 et 810 · v2/js/app.js:1958 ; aucun `archivee_a:` dans un payload d'écriture (grep exhaustif)`
- **Deux commentaires affirment que le mécanisme de gardes ne sert à personne — alors qu'il sert. ajouterGarde est appelée à app.js:2771 (gardeOverlay : un voile ouvert absorbe le retour d'Android). Les deux commentaires datent d'avant et contredisent le code d'aujourd'hui.**
  `v2/js/app.js:3290-3291 (« Rien ne l'utilise encore — seul le mécanisme existe ») et v2/js/app.js:3474-3475 (« Exposé pour l'écran de saisie à venir […] Rien ne s'en sert encore ») vs v2/js/app.js:2771`
- **rendu.js porte deux tables de mois : celle de THCalendrier.MOIS, jamais consommée, et la sienne propre à la ligne 507. Deux sources pour la même information — ce que CADRAGE-V2 §2 undecies interdit, et ce que le même dépôt invoque ailleurs pour sortir series/reps_visees des routines.**
  `v2/js/calendrier.js:24 (exportée, 0 appelant) vs v2/js/rendu.js:507`
- **CLAUDE.md §4 bis annonce CACHE_V2 = trainhub-v2-042 ; le code est à trainhub-v2-044. Même dérive au §4 pour le v1 : CACHE_NAME annoncé v377, service-worker.js:1 est à v379. Sans conséquence fonctionnelle (le code fait foi), mais la constitution se veut « fichier vivant » et sert de référence de bump.**
  `CLAUDE.md §4 et §4 bis vs v2/service-worker.js:36 et service-worker.js:1`
- **rendu.js est le seul module à exporter deux fois les mêmes 24 fonctions dans le même fichier : une fois dans un objet mort (`api`, l.2758) et une fois dans l'objet réel (`racine.THRendu`, l.2785). Toute nouvelle fonction ajoutée au mauvais des deux blocs sera silencieusement invisible.**
  `v2/js/rendu.js:2758-2782 et v2/js/rendu.js:2785-2836`
- **Dix fonctions de rendu sont exportées dans THRendu alors qu'elles ne servent qu'à l'intérieur de rendu.js : rendreApercu (l.725), signe (l.89), resumeSortie (l.97), rendreBloc (l.157), etiquetteSerie (l.1176), texteEffort (l.1344), champChrono (l.1201), dateCourte (l.56), dateLongue (l.67) — et rendreListeSeances (l.102) qui, elle, n'est même pas appelée en interne. Surface publique gonflée d'un tiers sans raison.**
  `v2/js/rendu.js, blocs d'export 2758-2836`

### Ce qui répond — 8

*Non détaillé ici : ce document sert à dépiler ce qui ne marche pas.*
