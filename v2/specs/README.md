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
| `REFERENTIEL-BORNES-V1.md` | Bornes scientifiques sourcées. Ce que l'algo n'a pas le droit d'affirmer |
| `MOTEUR-PROGRESSION-V2.md` | Progression, palier, format, stagnation |
| `REGLE-VOLUME-V2.md` | Volume par muscle, fenêtres, seuils |
| `REGLES-DE-COMPTAGE-V1.md` | Ce qu'un nombre veut dire : séries dures, muscles, poids de corps |
| `MODIFICATEURS-SERIE-V1.md` | Tempo et élastique. Liste fermée |
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
critère de concordance). Le document porte en tête de son §3 un avertissement
qui dit lequel des critères a survécu : **lire le §12 en premier**.

**Une spec récente peut en contredire une plus ancienne.** Les documents portent
leur date ; le plus récent l'emporte sur le point concerné, et `CADRAGE-V2.md`
l'emporte sur tout. Les divergences connues au 10/09/2026 sont listées ci-dessous.

## Un document délibérément exclu

`CATALOGUE-EXERCICES-V4.md` est cité comme dépendance par `MOTEUR-PROGRESSION-V2.md`
mais **n'est pas commité, et c'est volontaire** : il se déclare périmé en tête,
annonce 172 exercices quand la base en compte 237, et affirme que rien n'est écrit
en base. Le commiter installerait la même fausse vérité que `SCHEMA-V2_2.md`.

**La cartographie muscles réelle est en base** — `exercises.muscles_primaires` et
`muscles_secondaires` — et `SCHEMA-REEL.md` y renvoie.

Les documents `REGLE-PROGRESSION-V1*.md`, `REGLE-VOLUME-V1.md`, `SCHEMA-V2.md` et
`SCHEMA-V2_2.md` sont cités comme **remplacés** : leur absence est normale.

## Divergences connues — signalées, pas arbitrées

### ⚠️ Deux noms de colonne qui n'existent pas

`REGLES-DE-COMPTAGE-V1.md` §7 (daté du 23/08, antérieur à l'écriture du schéma en
français) nomme deux colonnes dans leur forme anglaise. **Coder d'après ce tableau
produirait une erreur certaine.** Vérifié en base le 10/09/2026 :

| Le document écrit | La base a |
|---|---|
| `sets.load_kg` | **`sets.charge_kg`** |
| `body_weight_log.weight_kg` | **`body_weight_log.poids_kg`** |

`body_weight_log` porte en outre `masse_grasse_pct`, que le document ne mentionne pas.

### Chiffres périmés

Plusieurs documents citent une volumétrie antérieure aux imports. L'état au
10/09/2026 est de **1 221 séances · 28 103 séries · 237 exercices · 116 pesées**.

| Document | Ce qu'il annonce |
|---|---|
| `REGLES-DE-COMPTAGE-V1.md` | « Rien n'est écrit en base » (en-tête) — **faux depuis** : muscles, `coef_pdc`, `masse_depart_kg` et `body_weight_log` existent tous. C'est le défaut même qui fait rejeter `CATALOGUE-EXERCICES-V4.md` |
| `REGLES-DE-COMPTAGE-V1.md` | 582 séances · 15 677 séries · 113 pesées · 164 exercices |
| `REFERENTIEL-BORNES-V1.md` | 891 séances · 557 pour aurel_br |
| `REGLE-VOLUME-V2.md` §9.4 | 206 exercices au catalogue |
| `ECRAN-SAISIE-V1.md` §9 | `v2_037` comme prochaine migration libre — `SCHEMA-REEL.md` dit **`v2_040`** |

### Un chiffre que sa propre doctrine condamne

`MODIFICATEURS-SERIE-V1.md` §4 écrit que les supersets « représentent 38 % des
séries ». `ECRAN-SAISIE-V1.md` mesure **48,7 %** et en tire précisément la doctrine
« un chiffre qui traîne dans les notes doit être remesuré avant d'être utilisé ».
Le premier document conserve le chiffre que le second a corrigé.

### Résolu le 10/09/2026

- **`validee_a`** — `ECRAN-SAISIE-V1.md` §7.1 disait « vaut `now()` par défaut ».
  La migration `v2_039` a retiré ce défaut ; la section porte désormais la
  correction et sa raison.
- **Volumétrie du cadrage** — 891 séances corrigées en 1 221.
- **Auto-correction du banc d'essai** — un avertissement en tête du §3 dit
  quel critère a survécu et renvoie au §12.
- **Périmètre du moteur ≠ périmètre de l'affichage** — `CADRAGE-V2.md` §2 ter :
  la v2 affiche randonnée, pilates, escalade et course ; le moteur ne les lit pas.
