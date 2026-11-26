# La voix du coach — v1

**Date :** 26/09/2026 · **Statut :** validé par Aurélien. Fait foi pour toute phrase que le coach affiche (en-tête, feuille « Pourquoi », phrase en séance, constat, escalier, chauffes, plus tard l'assistant). Remplace, pour la forme, les formulations du registre MOTEUR §20 ; le fond (ce que dit chaque situation) reste celui de la spec. Au dépôt depuis le 05/11/2026 (243), avec les deltas du 28/10/2026 ci-dessous (audit, 181 D2).

## Les six principes

1. **Les chiffres comme on les dit, charge d'abord** : « 130 kg × 4 ». Plusieurs séries : « 125 kg × 5, 5 et 4 ». Toujours l'unité sur la charge.
   *(15/11/2026, « Un seul formateur », MOTEUR §9.51 quater : les formats sont ceux de `Modele`, jamais recopiés — **« 127,25 kg »** (virgule, au plus deux décimales, espace insécable avant l'unité, vrai signe moins), **« 12,3 t »** (un volume, toujours au dixième), **« 71 % »**, **« 1er nov. »** pour le premier du mois seulement et « 2 nov. » ensuite (jamais « 01 nov. »), **« 1 h 05 »**, **« 12 min 30 »**, **« 6 h »** pour une durée. Les mots ne changent pas.)*
2. **Les dates proches en jours** : « mardi » plutôt que « le 22 sept. » quand c'est dans les 7 derniers jours ; au-delà, la date (« le 15 sept. »).
   *(14/11/2026, mots PR 6, MAQUETTE-PR6 §3.2 : le lexique des périodes est FERMÉ — « 3 / 6 derniers mois », « 12 mois », « 12 derniers mois » (15/11/2026, la fenêtre d'un matériel de salle ; « Pic ancien … le 18 sept. 2025 » : une date, jamais « il y a 14 mois »), « du 12 avr. au 11 oct. », « sept. 2026 », « oct. 2026 (en cours) » ; « ce mois-ci », « cette semaine », « cette année » ne se disent que si la période contient aujourd'hui (`Periode.contient`) ; aucun « depuis N mois », « récemment », « en ce moment » sur un écran de période ; une date seule (« depuis le 17 août ») est permise, jamais une durée d'absence. `tests/unit/v2-periodes-garde-pr6.test.js` balaie le texte rendu.)*
3. **Pas de jargon du moteur** : « palier » devient **« ta charge de travail »**. On garde **« zone »** (affichée sur l'étiquette) et **« test »**. Jamais « niveau validé », « bascule », « étirement », « rampe » dans une phrase affichée. *(28/10/2026, audit 181 D2 : « cran » est ADOPTÉ, c'est l'usage du produit — voir MOTEUR §20.2 règle 7.)*
4. **Des phrases courtes, au « tu »** : le fait, puis la suite. *(28/10/2026, 181 D2 : « je » partout où le coach décide — « je garde », « je teste », « je visais » ; les aides des réglages restent neutres, sans « je » ni « le coach ».)*
   *(13/11/2026, « Les mots disent vrai » PR 4a, MOTEUR §9.47 : la règle des personnes — **je** = le coach décide la charge (« Je garde 130 kg », « Je baisse à 97,5 kg ») ; **tu** = ce que fait la personne (« Tu restes à 70 kg × 8 », jamais « Je garde 8 reps ») ; **on** = l'essai à deux seulement (« On essaie 72,5 kg »). Le lexique du verbe est fermé : « Une rep de plus : 70 kg × 9 » (toujours avec son chiffre), « Tu restes à … », « sans marge » (défini au Pourquoi : « il ne t'en restait aucune »), « la dernière » seulement pour la dernière série de la séance.)*
   *(14/11/2026, « Les mots disent vrai » PR 5a, MOTEUR §9.48 : le lexique des ANNONCES est fermé et n'a qu'un auteur (`Moteur.annonceDe`). **« La prochaine fois : une rep de plus, 65 kg × 9 »** (le verbe de la consigne suivante, la même fonction que son en-tête), **« La prochaine fois : tu restes à 157,5 kg × 4, la dernière sans marge »** (la cause, six mots au plus, seulement quand le verbe garde ou borne ; jamais devant « de plus »), **« La prochaine fois : 70 kg × 10, puis ≈ 72,5 kg × 8 sur la dernière série »** (les lignes de la consigne suivante ; PR 5b-2, 16/11/2026 : « Prochaine séance » n'existe plus dans une annonce, un seul libellé), **« Il te manque 2 reps pour tester 55 kg »** (seulement si le moteur confirme, sinon rien). **Supprimés** : « Même cible » (il compare cible à cible quand « une rep de plus » compare à ce qui a été fait), « Le test te ramènera à X kg » (une promesse non datée). Une annonce ne promet que ce que le moteur fera ; quand il ne peut pas le confirmer, elle se tait.)*
   *(26/11/2026, « D2 », MOTEUR §9.2 ter : une dernière série tombée dit le fait puis la conséquence, contre la ligne que l'écran a MONTRÉE. **« Dernière série à 4 : ta cible passe à 100 kg × 5. »** (le plancher s'arrête au haut de la zone ; rien de montré à cette charge, ou une ligne montrée plus haute), **« Dernière série à 4 : tu restes à 100 kg × 5. »** (l'écran montrait déjà 5 : rien ne change pour toi), **« Dernière série à 4 : ta cible, 100 kg × 5. »** (inchangé : la ligne monte par rapport à celle que l'écran montrait). « Ta cible passe à » annonce une baisse et ne se dit jamais devant une ligne qui ne baisse pas ; « tu restes à » ne se dit que si la ligne est égale à celle que tu as vue. Phrase du fil, amendée : « … elle ne baisse pas ta cible sous tes premières séries, dans la limite du haut de ta zone, mais elle retarde l'essai d'une séance. »)*
   *(14/11/2026, PR 5b-1, MOTEUR §9.50 : quand la fois suivante peut tomber dans un régime daté, l'annonce dit la DATE, absolue, ou rien — **« Ta décharge commence le 16 nov., prévue par ton programme. »** (les mots du bandeau), **« Ta semaine de mesure commence le 23 nov. »**, **« Ton bloc commence le 23 nov. »** — et la phrase d'effort se réduit à sa tête : **« 130 kg × 5, sans marge. »**, **« 34 kg × 9, il t'en restait 3. Au-dessus de ce que je visais. »**, **« Deux fois 30 kg × 10 au haut de ta zone. »**. Refusés : « séances plus légères » (faux : la charge reste), « semaine allégée », « repos », « jusqu'au », toute date relative, « je garde », « on essaie ».)*
   *(14/11/2026, « Les mots disent vrai » PR 4b, MOTEUR §9.47 ter : le verdict de fin d'exercice dit la cause comme la consigne — **« Cible faite : 70 kg × 8, 8, 8, la dernière sans marge. »** (« une série sans marge » si ce n'est pas la dernière ; rien pour un public protégé ; jamais « tenu, sans marge », qui n'existe plus) ; et la montée tenue perd la troisième personne : **« 127,5 kg × 4, dans ta zone : la montée a tenu. Elle compte comme un test tenu. »**)*
5. **Un fait, jamais un « bravo »** ; aucun rouge, aucun vocabulaire de risque ; jamais la durée d'une absence ni un commentaire d'assiduité (inchangé).
6. **Une question seulement quand le coach propose** (« tu passes à 130 kg ? »).

## Exemples validés

| Situation | Phrase |
|---|---|
| Consigne | 125 kg × 5 |
| Consigne avec test | 125 kg × 5, puis 130 kg × 4 sur la dernière série |
| Test qui gagne une série | Mardi, 130 kg × 4 est passé : cette fois, 130 kg sur les deux dernières séries. |
| Test gardé | Mardi, 130 kg × 3, le bas de ta zone : on refait 130 kg sur la dernière série. |
| Test raté | 130 kg × 2 : pas encore. La prochaine fois : 125 kg × 5, puis 127,5 kg × 3 sur la dernière. |
| Zone étirée | Impossible de monter moins de 4 kg ici : tu restes à 28 kg jusqu'à 16 reps, puis tu essaies 32 kg. |
| Proposition en séance | 125 kg × 8, 3 de plus que prévu : tu passes à 130 kg dès la série 2 ? Vise 3 à 5. |
| Montée tenue | 130 kg × 5, dans ta zone : ton test arrive une série plus tôt. |
| Reprise après une pause | Reprise après une pause : un cran en dessous, à 122,5 kg. — ou : Reprise après une pause : on reprend à ta charge de travail, sans rep de plus. (jamais « Longue pause », jamais la durée de l'absence) |
| Montée pas encore tenue | 130 kg × 2 : pas encore. On revient à 125 kg pour la suite. |
| Pas de charge répétée | Chaque série était à une charge différente : la prochaine séance repartira de mardi. |
| Blocage | 122,5 kg depuis 4 séances, un peu plus longtemps que d'habitude chez toi. |
| « Pourquoi » | Ta charge de travail est 30 kg, et tu la tiens à 12 reps : 30 kg × 15, 12 et 12. |
| Une seule séance sous 3 reps (12/11/2026, PR 2) | 25 kg × 1 : une seule séance sous 3 reps. Je garde 25 kg. |
| Une seule séance sous 3 reps, « Pourquoi » | Sous 3 reps, je ne te demande jamais une rep de plus. Une seule séance ne fait pas une habitude : je garde 25 kg, la prochaine séance dira si c'est ta zone. |
| Zéro rep partout (12/11/2026, PR 2) | 102,5 kg × 0 : pas encore. Je baisse à 97,5 kg. |
| Zéro rep partout, bornée par la charge d'avant | 102,5 kg × 0 : pas encore. Je reviens à 100 kg. |
| Zéro rep, « Pourquoi » | Tes séries à 102,5 kg sont restées à 0 rep. Je repars du cran le plus proche de 95 % de cette charge : 97,5 kg × 9. Je remonte dès que les reps passent. |
| Un zéro rep, le plafond mord (13/11/2026, PR 4b) | 102,5 kg × 0 : pas encore. Je garde 100 kg. |
| Un zéro rep, « Pourquoi » (reste 2) | Ta série à 102,5 kg est restée à 0 rep : je garde 100 kg pour cette séance et la suivante. Une rep à 102,5 kg, et je reprends la montée à la séance d’après. |
| Un zéro rep, « Pourquoi » (reste 1) | Ta série à 102,5 kg est restée à 0 rep : je garde 100 kg pour cette séance. |
| Un zéro rep, les gestes | Tenter 102,5 kg (ou Tenter le cran au-dessus) · Annuler |
| Un zéro rep en séance, la suite (Z1) | 30 kg est resté à 0 rep : je propose 27,5 kg pour la suite. + Prendre 27,5 kg |
| Un zéro rep en séance, rien de plus léger (Z2) | 30 kg est resté à 0 rep. |
| Force estimée, 1 à 2 reps (15/11/2026, « Un seul max ») | au moins 150 kg · d'après 150 kg × 1 |
| Force estimée, 3 à 10 reps (inchangé) | ≈ 145 kg · d'après 124 kg × 5 |
| Courbe, un pic d'avant la fenêtre | Pic ancien 233 kg, le 18 sept. 2025, hors fenêtre. |
| Courbe, un pic d'avant la fenêtre qui est un plancher (15/11/2026, « Un seul chiffre de force ») | Pic ancien au moins 152,5 kg, le 18 sept. 2025, hors fenêtre. |
| Courbe, la tête (la force de la fiche) | ≈ 93 kg · force estimée · d'après 73,5 kg × 8, le 12 juil. |
| Courbe, la tête d'une borne basse | au moins 150 kg · force estimée · d'après 150 kg × 1, le 1er oct. |
| Courbe, la tête d'un max mesuré | 150 kg · max mesuré · à ta semaine de mesure, 150 kg × 1, le 3 nov. |
| Courbe, le trajet (deux projections, deux dates) | 87 → 92 kg, du 18 mai au 18 oct. |
| Courbe, le trajet, deux chiffres égaux | 92 kg, inchangé, du 18 mai au 18 oct. |
| Courbe, la bulle d'un point | Le 18 sept. 2025 · 200 kg × 5 · force estimée 233 kg |
| Progression, la légende de « Tes exercices » | Force estimée par séance · 6 derniers mois (du 18 mai au 18 nov.) |
| Courbe, la fenêtre du matériel | Barre : tout l'historique. · Machine : 12 derniers mois. |
(Jamais « quand même », « plafond », « encore 2 séances » ni un mot sur l’assiduité : un fait, puis ce que le coach garde.)

## L'effort visé (154, ajouté le 24/10/2026 — décision d'Aurélien ; en vigueur dans l'app)

| Situation | Phrase |
|---|---|
| En-tête d'un exercice (20/11/2026 : « réserve 1 », plus « garde-en 1 » ; à 0 : « jusqu'au bout ») | réserve 1 |
| Question dans la barre de repos, après la dernière série de travail (259 : une seule fois ; la case « Effort » de la ligne répond aussi) | Il t’en restait combien ? — 0 · 1 · 2 · 3 ou + · Passer |
| Réserve au-dessus de la visée (le seuil, `reserveAtteintLeSeuil`) | 34 kg × 9, il t'en restait 3 ou plus. Au-dessus de ce que je visais : la prochaine fois, on essaie 36 kg. (« ou plus » à la case du haut de la grille, « 3 ou + » ; 2 se dit « 2 ») |
| Réserve égale à la visée relevée par un plancher, en « Me pousser » (le test se lit sur la table, 20/11/2026, CONTRA-TT3-A1 C) | 100 kg × 10, il t'en restait 2 : c'est ce que je visais ; avec Me pousser, c'est assez pour tester. La prochaine fois, on essaie 102,5 kg. |
| Réserve sous la visée, à fond (R = 0 < V) | 130 kg × 5, sans marge. Je garde 130 kg la prochaine fois. |
| En séance, une série sans marge, la suite à la même charge (20/11/2026, MOTEUR §9.14 ter) | 70 kg × 9, sans marge : la suite vise 8. (la même phrase pour une ligne ou plusieurs, à toute garde : décision d'Aurélien du 20/11/2026 ; jamais « à fond », jamais « à fond aussi » : un fait, pas une injonction à l'échec) |
| Réserve sous la visée (0 < R < V) | 130 kg × 5, avec 1 en réserve. Je garde 130 kg la prochaine fois. |
| Réserve sous la visée, capacité tenue (reps + réserve ≥ reps visées + visée, 20/11/2026, MOTEUR §9.26, I254), en fin d'exercice | 100 kg × 7, sans marge : 2 de plus que prévu. Sur cette barre, je vise 1 en réserve. (« 2 de plus » : l'écart aux reps de la consigne reçue ; la seconde phrase seulement quand le plancher de la barre relève la table, avec la visée affichée : jamais au squat en Normal, où le coach vise 2 ; hors barre, la première seule ; « avec 1 en réserve » si R > 0 ; jamais « je garde », jamais « bravo » ni « tu es allé au bout » ; en séance, rien) |
| R = V ou V + 1 | (rien) |
| « Pourquoi » du test à la séance suivante | On essaie 36 kg : la dernière fois, 34 kg × 9 avec 3 en réserve ou plus. (« ou plus » à la case du haut ; « avec 2 en réserve. » sinon) |

Jamais « bravo », jamais un reproche quand il n'en restait pas assez. Source : MOTEUR §9.26 (dépôt).

## La porte du cran (251, 05/11/2026)

Quatre phrases, un fait chacune, jamais « porte » ni « rampe » ni « max » :
- « Pas de test à 110 kg aujourd'hui : ta série est sous ta zone. » (ou « …allée jusqu'à l'échec. ») + « Tenter 110 kg quand même »
- « Le test à 110 kg revient. » + « Annuler »
- Pourquoi : « Ta série à 107,5 kg × 2 est sous ta zone (3 à 5 reps) : le test à 110 kg × 3 attend une autre séance. Ta force du jour, d'environ 113 kg, donne environ 2 reps à 110 kg. »
- « Pas de test à 110 kg aujourd'hui : tu as baissé la charge. » (après un « Prendre X kg » accepté) ; Pourquoi : « Tu as baissé la charge après ta série à 107,5 kg × 3 : le test à 110 kg × 3 attend une autre séance. » Tenté : aucune phrase au Pourquoi.
- Pourquoi (forme) : « Tu as ajusté la fin de séance à ta forme du jour : pas de test aujourd'hui. »

## L'assistant « Demander au coach » (160, 24/10/2026)

Les réponses de l'IA suivent ces principes : la première personne (« je garde », « je teste »), jamais « le coach » ni « la
règle de… » ; 3 phrases au plus ; aucun nombre absent du contexte ; pas de jugement (« c'est bien », « c'est grave ») ; le
rappel « c'est toi qui décides de ta charge » seulement si l'on demande de changer la consigne. Phrases fixes, sans IA :
« Je ne réponds pas sur une douleur. Dis-le au coach avec « J'ai mal » : il adapte ta séance. » · « Je n'ai pas de réponse
sûre : regarde la feuille Pourquoi. »

## Les notes (250, 05/11/2026)

Forme unique : **Ta note dit « <extrait> » → je propose : <proposition>.** Titre du bloc : *Dans tes notes*. L'extrait est toujours les mots exacts de la personne (fautes comprises), « … » au-delà de 60 signes. Jamais « J'ai corrigé », « Tu as mal », « bravo », un mot de gravité, du rouge.

| Genre | Proposition | Après ✓ |
|---|---|---|
| effort, N ≥ 1 | Squat, dernière série, 1 en réserve. / Squat, séries 2 et 3, 2 en réserve. / Squat, toutes les séries, 3 en réserve ou plus. | 1 en réserve noté. *Annuler* |
| effort, N = 0 | Squat, dernière série, sans marge. | Sans marge noté. *Annuler* |
| dégressive | Extension triceps, séries 3 et 4 en dégressive. | Noté. *Annuler* |
| échec | Squat, dernière série en échec. | Noté. *Annuler* |
| réglage | ta note de la presse. / ta note de la presse, à la place de « dossier cran 4 ». | Noté. *Annuler* |
| douleur | douleur au coude, sur Curl marteau. | Douleur notée : coude. *Annuler* |

Une réserve de 0 se dit « sans marge », jamais « 0 en réserve » *(20/11/2026 : exception unique pour l'en-tête d'un exercice, où la réserve visée 0 se dit « jusqu'au bout » — jamais « réserve 0 », jamais « sans marge », qui dit ce qui s'est passé et reste réservé à la cause, I162)*. Les phrases sont balayées par `tests/unit/v2-notes-ia.test.js` avec les motifs de `fixtures/voix-regles-181.json`.

**« Au max » disparaît (20/11/2026, MOTEUR §9.30, I251, CONTRA-AUMAX-DEDUIT C9).** Le glossaire perd « Au max » et « 5+ » : ni carte « Dernière série au max ? »,
ni bouton, ni « Au max en gardant N », ni « Jusqu'à l'échec » sous une ligne, ni étiquette « 5+ · garde N », ni « Ta dernière série me dit où tu en es »,
ni « Pas d'« Au max » sur cet exercice aujourd'hui », ni « L'échec sur une barre passe par la série « Au max » ». Le coach ne demande l'échec que par la visée
affichée. Celui qui va au bout le note : **« sans marge » = « tu n'aurais pas pu faire une rep de plus, propre »** (le mot « propre » : l'échec technique,
TT-AUMAX-DEDUIT §6). En séance, le silence ; en fin d'exercice, la phrase de la capacité tenue (I254, ci-dessus : « 100 kg × 7, sans marge : 2 de plus que
prévu. ») puis l'annonce, rien d'autre. La « Série au max » de la semaine de test devient « Série de mesure » le 21/11/2026 (MOTEUR §9.32, I253) ; l'autre façon garde « viser ton max ». Les phrases sont balayées par `tests/unit/v2-notes-ia.test.js` avec les motifs de `fixtures/voix-regles-181.json`.

## Les chauffes depuis ta charge (15/11/2026, MOTEUR §9.41 bis)

Lexique fermé (tutoiement, un fait, aucun « bravo », aucun jugement) ; chaque nombre passe par le formateur (I26) :

| Où | Phrase | Bouton |
|---|---|---|
| Après « + Chauffe » ou « Ajouter » (référence saisie) | Montée posée sur ta 1re série : 100 kg. | *Annuler* (secondaire) |
| Idem, référence du plan | Montée posée sur ta charge de travail : 90 kg. | *Annuler* (secondaire) |
| Ajout automatique (inchangé) | Chauffe ajoutée, comme d'habitude. | *Annuler* (secondaire) |
| Pourquoi de la carte, saisie ≠ plan | Calée sur ta 1re série, 100 kg. Le plan disait 90 kg. | — |

« Montée » est le mot de la ligne posée, « chauffe » celui du geste : les deux existent déjà dans l'app (« + Chauffe », « Chauffe : 50 kg × 8 · 80 kg × 3 »). Jamais « libre », « perf » ni « bravo » dans une phrase du coach. *Notée pour plus tard, non livrée en PR 1 :* « Tape la charge de ta 1re série : la montée se cale dessus. » (la ligne vide sans référence).

## Une seule montée (20/11/2026, MOTEUR §9.15, §9.15.5, §9.17 et §9.41 delta)

Le chiffre d'abord, l'unité sur chaque charge, « tu », un fait. Jamais « une de plus » (réservé au verbe « Une rep de plus : … », §9.47), jamais « suffisent » (un jugement), jamais « loin de ton max » (« max » est retiré des écrans, I183).

| Où | Phrase |
|---|---|
| Lignes de la routine | Chauffes calées sur 135 kg : 20 kg × 10 · 70 kg × 6 · 90 kg × 3 · 120 kg × 1. |
| Proposition, ajout d'office | Chauffe : 20 kg × 10 · 70 kg × 6 · 90 kg × 3 · 120 kg × 1. |
| Pourquoi (la part VRAIE, charge affichée ÷ référence) | Tes séries visent 4 reps : la dernière chauffe est à 120 kg, 89 % de 135 kg. |
| Pourquoi, programme du coach | Dans le programme que je t'ai construit, je choisis tes chauffes. |
| Après « + Chauffe » | Chauffe ajoutée : 125 kg × 1, entre 120 et 135 kg. — sans chauffe d'avant : Chauffe ajoutée : 75 kg × 3, sous 135 kg. — sans place : Trop proche de ta charge de travail pour une chauffe de plus. |
| Poids du corps | Chauffe : poids du corps × 3. — Pourquoi : Le mouvement lui-même, avec de la marge. |
| Lesté | Chauffe : poids du corps × 2 · 15 kg de lest × 2. — Pourquoi : Avec un lest, tu passes d'abord au poids du corps. |
| Peu de temps | Tu as peu de temps : deux chauffes. / Tu as peu de temps : une seule. |
| Une ligne qui n'a plus de marche | Trop léger pour une chauffe de plus. |

## Un mot par notion (20/11/2026, revue des règles, décision du fondateur)

Un sens, un mot ; un mot, un sens. Appliqué à tous les textes affichés (le code, le lexique de l'app, les bancs).

| Notion | Le mot | Avant | Exemple |
|---|---|---|---|
| La marge visée sur la dernière série | **réserve** : « réserve 1 » en en-tête, « N en réserve » dans les phrases | « garde-en 1 », « garde 1 » | « 3 × 8 · réserve 1 » ; « Je baisse à 80 kg : vise 1 en réserve. » (dans une phrase de raté : « On passe à 80 kg, vise 1 en réserve, entre 8 et 10. ») |
| Une réserve visée de 0 | **jusqu'au bout** (en-tête et puce) | « garde 0 » | « 3 × 8 · jusqu'au bout » (jamais « réserve 0 », jamais « sans marge ») |
| La marge d'une série dans une phrase du recul, du test ou de l'essai d'une marche (21/11/2026) | **N en réserve**, 0 : **jusqu'au bout** ; « sans marge » reste pour ce qui s'est passé (une série faite) | « en gardant N reps », « en en gardant N » | « Essai 1 : 142,5 kg × 1, avec 2 en réserve. » ; « Pour 8 reps avec 2 en réserve, c’est 74 % : 112,5 kg. » ; « C’est fait : Tractions, 3 séries, autant de reps que tu peux, avec 2 en réserve. » |
| La semaine où l'on mesure ses barres | **semaine de mesure** ; « test » reste pour la charge au-dessus | « semaine de test » | « Ta semaine de mesure commence le 23 nov. » ; « Faire une semaine de mesure » |
| Laisser le coach tel qu'il avait dit, un geste de séance | **Comme prévu** (parallèle à « Comme avant ») ; « Garder N jours » reste pour refuser une carte | « Garder le plan » | « <barre> plus léger aujourd'hui » / « Comme prévu » |
| Reprendre une séance en cours | **Continuer la séance** ; « Reprendre » reste pour une routine en cours d'édition | « Reprendre » | le bandeau « · en cours », la carte « Prochaine séance » |
| La carte après une douleur | titre daté, sans « on » ni « hier » | « Ta dernière séance de Squat était douloureuse. » | « Squat : tu as noté une douleur le 12 nov. » (les trois choix ne changent pas) |
| Un exercice plus dur de la même famille | **une variante plus dure** (le bouton reste « Essayer <exercice> ») ; « marche », « échelle » restent internes | « La marche au-dessus » | « Une variante plus dure : pompes déclinées. » |
| Une plage de reps | **zone** (jamais autre chose) ; les muscles se disent **groupe** ; la douleur se dit **à ménager** | « Zone à ménager » | « À ménager » (le Profil, la feuille) ; « Ce que tu ménages, je le garde » |

Inchangés : « je garde » (la charge, pour cette seule décision), « tu restes à » (l'objectif de reps tenu), « test » (la charge au-dessus, « Pas de test à 110 kg »), « reprise après une pause ». Restent à trancher (relevés, non faits) : « la marche d'en dessous » (I55), « Des zones raides ? » (un troisième sens de « zone »).

## Ce qui reste à faire

*Réécrit au présent le 05/11/2026 (243) : la refonte du plan unique est faite.* La garde `tests/unit/v2-voix.test.js` (règles de
`fixtures/voix-regles-181.json`) balaie les phrases produites (fichiers de cas et plans générés). Ce qui reste : tenir cette garde
à jour quand un principe change, et valider avec Aurélien toute phrase nouvelle avant le code.
