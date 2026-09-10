# Specs — source de vérité de l'implémentation v2

Ces documents **font autorité pour tout ce qui s'écrit dans `v2/`**. Quand le code
et une spec divergent, c'est le code qui a tort.

Ils vivent ici, et non hors du dépôt, pour une raison précise : une spec jointe
à la main à un instant donné diverge de celle qui continue d'évoluer ailleurs.
**Deux vérités concurrentes, c'est ce qui produit les audits qui dérivent.**

## Préséance

> **`CADRAGE-V2.md` prime sur tous les autres en cas de contradiction.**

Il fixe *pour qui* on construit et *ce que le système a le droit d'affirmer*.
Les autres fixent les bornes chiffrées.

## Les documents

| Fichier | Rôle |
|---|---|
| `CADRAGE-V2.md` | **Prime sur tous les autres.** Cible, périmètre, ce que le système peut affirmer |
| `SCHEMA-REEL.md` | État réel de la base, régénéré le 10/09/2026 |
| `MOTEUR-PROGRESSION-V2.md` | Progression, palier, format, stagnation |
| `REGLE-VOLUME-V2.md` | Volume par muscle, fenêtres, seuils |
| `ECRAN-SAISIE-V1.md` | Blocs, tours, routines, déviation |
| `BANC-ESSAI-V1.md` | Méthode de validation et **pistes rejetées** |

## Trois choses à savoir avant de s'en servir

**`SCHEMA-REEL.md` est régénéré depuis la base, pas rédigé.** En cas de doute,
**la base fait foi**, pas ce fichier. Sa régénération relève de Claude.ai, qui
seul touche à Supabase. Claude Code a le droit de **lire** le schéma pour ne
jamais coder sur des noms non vérifiés ; écriture, migration et RLS : jamais.

**`BANC-ESSAI-V1.md` liste des pistes testées puis rejetées par la mesure.**
Le consulter **avant** de proposer une amélioration du moteur — plusieurs idées
qui semblent évidentes y sont déjà mortes, chiffres à l'appui (conditionner la
cible de reps à la charge, le délai d'atteinte comme critère principal, le
critère de concordance). Sans cette lecture, on refait un travail déjà invalidé.

**Une spec récente peut en contredire une plus ancienne.** Les documents portent
leur date ; le plus récent l'emporte sur le point concerné, et `CADRAGE-V2.md`
l'emporte sur tout. Les divergences connues au 10/09/2026 sont listées ci-dessous.

## Documents cités mais absents de ce dossier

À connaître : plusieurs specs renvoient à des documents qui ne sont pas ici. Une
règle qui en dépend ne peut pas être implémentée de mémoire — la demander avant.

| Document | Où il est cité |
|---|---|
| `REFERENTIEL-BORNES-V1.md` | `MOTEUR-PROGRESSION-V2.md` (dépendance déclarée) et **une dizaine de renvois** « référentiel §… » dans le moteur et `REGLE-VOLUME-V2.md` |
| `REGLES-DE-COMPTAGE-V1.md` | dépendance déclarée du moteur — comptage des séries, poids de corps |
| `MODIFICATEURS-SERIE-V1.md` | dégressive, rest-pause, amplitudes |
| `CATALOGUE-EXERCICES-V4.md` | dépendance déclarée du moteur |

Les documents `REGLE-PROGRESSION-V1*.md`, `REGLE-VOLUME-V1.md`, `SCHEMA-V2.md` et
`SCHEMA-V2_2.md` sont cités comme **remplacés** — leur absence est normale.

## Divergences connues entre specs — non tranchées ici

Signalées, pas arbitrées. À trancher par Aurélien.

**`validee_a` a-t-il un défaut ?** `ECRAN-SAISIE-V1.md` §7.1 écrit qu'il « vaut
`now()` par défaut sur toute série saisie dans l'app ». `SCHEMA-REEL.md` écrit que
le `DEFAULT now()` **a été retiré** par la migration `v2_039`, délibérément, parce
qu'un défaut rendait la règle « écrire à la validation, jamais à l'insertion »
impossible à tenir. `SCHEMA-REEL.md` est postérieur et régénéré depuis la base :
c'est lui qui décrit l'état réel. La conséquence pratique est la même dans les
deux textes — l'app doit écrire `validee_a` elle-même, au moment de la coche.

**Chiffres périmés.** Le cadrage (23/08) parle de 891 séances et
`REGLE-VOLUME-V2.md` §9.4 de 206 exercices ; l'état au 10/09 est de **1 221
séances** et **237 exercices**. `ECRAN-SAISIE-V1.md` §9 annonce `v2_037` comme
prochain numéro de migration libre, `SCHEMA-REEL.md` dit **`v2_040`**.

**`BANC-ESSAI-V1.md` se corrige en cours de route.** Son §3 présente le délai
d'atteinte comme critère principal ; son §12.1 le **retire**. De même le §8 pose
un désaccord sur le seuil de stagnation que le §12.4 tranche à 4 séances. Lire
les sections finales avant d'appliquer les premières.
