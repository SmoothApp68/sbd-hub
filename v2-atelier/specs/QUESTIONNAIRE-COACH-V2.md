# Le questionnaire du coach — spec v2

**Date :** 07/10/2026 · **Statut :** décidé par Aurélien le 07/10 ; maquette `maquette-questionnaire-v4.html` (« Questionnaire
du coach ») ; recherche `RECHERCHE-QUESTIONNAIRE-2026-10-07.md` ; relevé du dépôt 60-0. **Remplace
`QUESTIONNAIRE-COACH-V1.md`** (27/09), dont les tableaux §3.1 (objectif) et §3.2 (phase) restent la référence des effets.

## 1. Principes

1. **Tout le monde le voit une fois** : compte neuf comme compte existant, **tant qu'il ne l'a jamais rempli** (Aurélien
   compris). « Plus tard » le repousse sans rien perdre.
2. **Rien de ce que les séries savent n'est demandé** : c'est **montré** pour confirmation (fréquence, durée, niveau,
   autres activités). **Ce que la personne a déjà donné est pré-rempli** (phase, rythme, poids de la dernière pesée,
   sexe, taille) : elle vérifie, elle ne retape pas.
3. **Chaque réponse a au moins un lecteur** (§4) ; chaque champ dit **pourquoi** on le demande ; tout est facultatif
   sauf le chemin du programme. Une réponse sans lecteur n'est pas posée.
4. **Un seul chemin d'écriture** : le questionnaire présente les sections du profil dans un ordre ; il écrit par
   `ecrireProfil` comme le profil (ECRAN-PROFIL §4 : « l'onboarding, c'est le profil » — le questionnaire en est
   l'ordre et la mise en avant, pas un second écran). Tout se modifie ensuite dans Profil.
5. **Chaque réponse est datée** ; l'objectif et la phase entrent dans le fondement de chaque pari, gelés pour la séance
   comme la phase (§9.16).
6. **La voix** : VOIX-DU-COACH ; le losange ambre explique, ne juge pas ; aucune question sur le corps n'est commentée.

## 2. Le déclencheur

- Colonne `profiles.questionnaire_fait_le` (timestamptz, vide = jamais rempli). **Pas `onboarding_completed`**, qui
  veut dire « profil vu » et vaut déjà « vrai » chez Alexis, Léa, Jordan et Aurélien (relevé 60-0).
- La décision de l'ouvrir se prend **quand la ligne de profil est connue** (au premier démarrage comme aux suivants),
  pas sur le seul cache (relevé 60-0 : le compte neuf n'était routé qu'au second démarrage).
- « Plus tard » : un bandeau discret sur Saisie (le composant du « brouillon oublié ») et une ligne en tête de Profil
  (« Terminer mon questionnaire »), jusqu'à ce qu'il soit rempli. Jamais bloquant. **Il s'ouvre de lui-même une fois
  par appareil** (mémoire locale, par compte) ; ensuite, le bandeau et la ligne seuls (précisé le 07/10/2026).
- Rouvert, il repart du début, chaque écran pré-rempli avec ce qui est déjà en base.
- Rempli = arrivé au récapitulatif (« Commencer »). Chaque écran validé est écrit au fur et à mesure.

## 3. Le parcours (ordre de la maquette v4)

| # | Écran | Réponses | Stockage |
|---|---|---|---|
| 1 | Bienvenue | — | — |
| 2 | **Tes données** | Oui, dans une autre app · Oui, mais pas noté · Je débute | `profiles.historique_declare` (`import` / `non_note` / `debutant`) |
| 3a | **Ce que je sais** (si historique en base) | montré : nombre de séances et depuis quand, rythme sur 12 semaines, durée habituelle, maximums aux barres, autres activités (sorties de l'historique) ; un seul bouton, « Continuer » : ce sont des faits de tes séances, et la durée se corrige à l'écran 7 (précisé le 07/10/2026 : « Je corrige » n'avait rien à écrire qui ait un lecteur) | rien (lu dans les séances) |
| 3b | **Sans historique** | ancienneté (moins d'un an · 1 à 3 ans · 3 à 5 ans · plus de 5 ans : les valeurs de la colonne existante, contrainte `profiles_anciennete_ok`, précisé le 07/10/2026) ; séances par semaine (2 à 6+) ; durée (45 · 60 · 75 · 90 · plus) | `anciennete`, `seances_par_semaine`, `duree_seance_min` (existantes) |
| 4 | **Toi** (facultatif) | sexe (homme · femme · préfère ne pas dire) ; année de naissance ; taille ; poids | `sexe`, `date_naissance` (1er janvier de l'année), `taille_cm` (existantes) ; le poids = **une pesée** du jour dans `body_weight_log`, écrite seulement si la valeur diffère de la dernière pesée ; l'année ne réécrit `date_naissance` que si elle change (une date complète déjà saisie est gardée ; précisé le 07/10/2026) |
| 5 | **Ton but** | objectif (Force · Muscle · Les deux · Forme et santé) ; phase (Prise de masse · Maintien ou recomposition · Sèche · Je ne sais pas = maintien) | `profiles.objectif` (nouvelle) ; `phase`, `phase_depuis` (existantes) |
| 6 | **Priorités** | jusqu'à 3 : exercices (squat, couché, soulevé, militaire, tractions) ou muscles (les 6 groupes du radar) · Pas de priorité. **En sèche**, le coach dit : « En sèche, je garde surtout tes charges : une priorité musculaire attendra ta prochaine prise de masse. Un exercice prioritaire, oui. » | `profiles.priorites` (text[], slugs d'exercice ou groupes de `ZONE_DE`, nouvelle) |
| 7 | **Temps et matériel** | le temps est montré (« environ 75 min ») : C'est mon maximum · J'ai de la marge · Moins en ce moment · Ça varie ; matériel : Salle complète · Salle basique · Maison équipée · Maison minimale · Poids du corps | `profiles.temps_reponse` (nouvelle) ; `duree_seance_min` (montrée, modifiable) ; `materiel` (existante) |
| 8 | **Ton programme** | Garder ce que je fais · Je crée mes routines · Construis-le-moi | `profiles.programme_choix` (nouvelle) — **écran absent jusqu'à 60-3** : sans programme déduit ni générateur, la réponse n'aurait pas de lecteur (§1.3 ; précisé le 07/10/2026). À 60-3, il est proposé une fois, par une carte, à qui a déjà rempli le questionnaire |
| 8a | Programme déduit | les séances qui reviennent → routines proposées | routines (§5) |
| 8b | Construis-le-moi | jours réalistes (2 à 6) ; **une zone à ménager ?** (épaule · dos · genou · coude · hanche · aucune) ; exercices aimés / jamais | `seances_par_semaine` ; `profiles.zones_a_menager` (text[], nouvelle) ; aimés / jamais : au chantier du générateur |
| 9 | **Ton coach** | Me ménager · Normal · Me pousser · Juste un carnet | `rythme_progression` (prudent / normal / franc) ; « Juste un carnet » = `intention = 'entretien'` rendu silencieux (§4) |
| 10 | **Ce que j'ai compris** | récapitulatif, chaque ligne modifiable | `questionnaire_fait_le` |

## 4. Les lecteurs : qui lit quelle réponse

| Réponse | Lue par | Quand |
|---|---|---|
| Phase | escalier, série de plus, phrases, paris (déjà) ; **rappel à 6 semaines** (bandeau sur Saisie, lu depuis `phase_confirmee_le`, sinon `phase_depuis`) | 60-2b (précisé le 07/10/2026 : il lit `phase_confirmee_le`, ajoutée par v2_065) |
| Temps | « J'ai peu de temps » : `duree_seance_min` devient la cible proposée (à la place de 45 / 60 en dur) ; « Moins en ce moment » : la carte proposée d'office quand l'estimation dépasse ; « Ça varie » : le temps demandé avant une séance qui dépasse | 60-1 (la cible, #382) ; 60-2b (« Moins en ce moment », « Ça varie ») |
| Matériel | **range, ne cache jamais** : catalogue, « Machine prise », générateur. Salle complète : tout · Salle basique : tout sauf machines guidées et Smith · Maison équipée : barre, haltères, disques, kettlebell, élastique, poids du corps · Maison minimale : haltères, kettlebell, élastique, poids du corps · Poids du corps : poids du corps, élastique. Un exercice déjà dans l'historique n'est jamais rétrogradé | 60-1 |
| Juste un carnet | `intention = 'entretien'` : **aucune** phrase, proposition, carte ni bandeau du coach (dégressive et décharge comprises) ; l'invariant I13 le garde (`sansCoach`) | 60-1 |
| Objectif | zone du premier bloc d'un programme (Force, Les deux : Lourd ; Muscle, Forme : Mix) ; carte « zone de force » (avec les priorités) ; générateur (reps) ; fondement des paris (gelé pour la séance, invariant jumeau d'I18) | 60-2 |
| Priorités | escalier : un muscle prioritaire passe la série de plus en premier (hors sèche) ; un exercice prioritaire + objectif Force ou Les deux, habitude en Volume : **la carte « zone de force », une fois** (patron du lest, mémoire en base, et une ligne de Profil pour changer d'avis) ; exercices par défaut d'un programme ; générateur | 60-2 |
| Âge, taille, poids, ancienneté, sexe | sans historique : prudence des charges de départ (générateur, séances de calage) ; poids : poids du corps, force rapportée au poids ; sexe : repères de force, classement | générateur, jeu |
| Historique déclaré | le parcours (3a ou 3b) ; « Oui, dans une autre app » sans séances en base : l'écran 3b, avec « L'import dans l'app arrive plus tard. Ces trois réponses suffisent pour commencer. » (import dans l'app : chantier à part) | 60-2a |
| Programme | 8a, 8b, ou l'éditeur | 60-3, générateur |
| Zones à ménager | générateur seulement : les exercices qui chargent la zone passent en dernier choix, jamais interdits ; jamais de diagnostic, rien en séance (« J'ai mal » reste là) | générateur |

## 5. Le programme déduit (8a)

Sur les 12 dernières semaines : les séances avec au moins une série de travail chargée (sorties, randonnées, escalade
exclues) ; **regroupées par leurs exercices, pas par leur titre** ; un groupe qui revient **au moins 4 fois** devient
une routine : ses exercices présents dans au moins la moitié des séances du groupe, dans leur ordre médian ; séries,
reps et chauffes médianes ; repos par défaut (§9.21) ; supersets s'ils reviennent. Nom proposé : le titre le plus
fréquent du groupe, modifiable. Rien n'est écrit avant « En faire mes routines ». Règles exactes (seuil de
ressemblance, ordre) : simulées sur les cinq historiques avant le prompt.

## 6. Retiré de l'écran du profil

`mode_entrainement` (Discipline, absorbée par l'objectif), `niveau_declare`, `jours_vises`, `unites` : retirés de
l'écran (les valeurs restent en base, aucune n'est lue). Les quatre phrases qui promettaient un effet absent
(Discipline, Matériel, Durée « pour un générateur… ») sont réécrites selon ce qui est branché.

## 7. Le découpage

| PR | Contenu | Migration |
|---|---|---|
| **60-1** (#382) | brancher l'existant : temps (la cible), matériel, « Juste un carnet » silencieux ; nettoyage du profil | non |
| **60-2a** | l'écran du questionnaire (§2, §3 sauf 8, 8a, 8b), son déclencheur, « Plus tard », les nouveaux champs dans Profil ; « Juste un carnet » éteint aussi la fin de bloc | `v2_065` (appliquée le 07/10/2026) |
| **60-2b** | les lecteurs : objectif (zone du premier bloc, fondement des paris), priorités (escalier, carte « zone de force »), rappel de phase à 6 semaines, « Moins en ce moment » et « Ça varie » — chacun simulé sur les vraies séances avant le prompt | non |
| **60-3** | le programme déduit (8a), et « Remplacer » dans l'éditeur de routine | non |
| **60-4…** | le générateur (8b) : règles écrites, simulées sur les cinq historiques, validées, puis codées | à voir |

**Ouverture à Alexis : après 60-2b** (le questionnaire complet et branché, hors programme). 60-3 peut suivre.

## 8. Amendements — faits le 07/10/2026 (deltas 60-2a), sauf §9.16 (avec 60-2b)

- MOTEUR §1.1 (« ne jamais demander, toujours déduire — une seule exception ») : déjà dépassé par le réglage, la phase
  et le lest ; le questionnaire le remplace par « on ne demande que ce que les séries ne savent pas, et ce qui est
  demandé a un lecteur ».
- ECRAN-PROFIL §4 : le questionnaire est l'ordre et la mise en avant des sections du profil.
- MOTEUR §9.16 : le rappel de phase à 6 semaines n'est plus « au chantier du questionnaire ».
