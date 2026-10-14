# Specs — source de vérité de l'implémentation v2

Ces documents **font autorité pour tout ce qui s'écrit dans `v2/`**. Quand le code
et une spec divergent, c'est le code qui a tort.

Ils vivent ici, et non hors du dépôt, pour une raison précise : une spec jointe
à la main à un instant donné diverge de celle qui continue d'évoluer ailleurs.
**Deux vérités concurrentes, c'est ce qui produit les audits qui dérivent.**

**Dans le dépôt, mais pas dans le dossier publié** (59-1, 07/10/2026). Cloudflare
Pages publie `v2/`, et `v2/` ne contient que l'app : ces specs vivent dans
`v2-atelier/specs/`, avec les maquettes (`v2-atelier/maquettes/`) et le banc
(`v2-atelier/banc/`). Elles portent des données d'entraînement nominatives et le
plan de la base — rien de cela n'est servi.

Les chemins `v2/specs/…`, `v2/maquettes/…` et `v2/banc/…` cités DANS le texte des
specs (notamment l'état des lieux du 18/09) sont ceux d'avant ce déplacement : ils
ne changent qu'avec un delta, jamais à la main.

**Appliquer un delta de spec :**

```
python3 v2-atelier/specs/appliquer_deltas.py DELTAS.md v2-atelier/specs --verifier
python3 v2-atelier/specs/appliquer_deltas.py DELTAS.md v2-atelier/specs --appliquer
```

## Préséance

> **`CADRAGE-V2.md` prime sur tous les autres en cas de contradiction.**

Il fixe *pour qui* on construit et *ce que le système a le droit d'affirmer*.
Les autres fixent les bornes chiffrées.

## Les documents

| Fichier | Rôle |
|---|---|
| `CADRAGE-V2.md` | **Prime sur tous les autres.** Cible, périmètre, ce que le système peut affirmer |
| `SCHEMA-REEL.md` | État réel de la base, **régénéré, pas rédigé** — la date et la dernière migration sont dans son en-tête |
| `REFERENTIEL-BORNES-V1.md` | Bornes scientifiques sourcées. Ce que l'algo n'a pas le droit d'affirmer |
| `MOTEUR-PROGRESSION-V2.md` | Progression, palier, format, stagnation |
| `REGLE-VOLUME-V2.md` | Volume par muscle, fenêtres, seuils |
| `REGLES-DE-COMPTAGE-V1.md` | Ce qu'un nombre veut dire : séries dures, muscles, poids de corps |
| `MODIFICATEURS-SERIE-V1.md` | Tempo et élastique. Liste fermée |
| `ECRAN-SAISIE-V1.md` | Blocs, tours, routines, grille de saisie, déviation, page d'exercice |
| `ECRAN-PROFIL-V1.md` | Profil, connexion, inscription, et pourquoi l'onboarding EST le profil |
| `QUESTIONNAIRE-COACH-V2.md` | Le questionnaire du coach : parcours, lecteur de chaque réponse, découpage 60-1 à 60-4 (remplace la V1, jamais commitée) |
| `JEU-V1.md` | Le jeu : série de semaines et gels, sept muscles, XP et niveau global, succès, titres, cadres, et ses écrans (onglet Jeu, Profil, fin de séance, interrupteur). Lit les faits, n'est jamais lu par le coach |
| `BILANS-V1.md` | Les bilans de période : un seul moteur, la période en paramètre ; « Ton année » (95), la saison et le mois attendent leur maquette. Jamais l'assiduité, le nombre de séances, la santé, une comparaison à une autre personne |
| `SOCIAL-V1.md` | Le social, étage 1 : abonnements en trois cercles (inconnu, abonné, mutuel), compte privé par défaut, blocage, fil des 30 derniers jours, profil avec calendrier, niveau publié du jeu. Les autres ne se lisent que par les fonctions de la base (v2_078) ; coach et bilans ne lisent jamais le social |
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
l'emporte sur tout. Les divergences connues au 12/09/2026 sont listées ci-dessous.

## Un document délibérément exclu

`CATALOGUE-EXERCICES-V4.md` est cité comme dépendance par `MOTEUR-PROGRESSION-V2.md`
mais **n'est pas commité, et c'est volontaire** : il se déclare périmé en tête,
annonce 172 exercices quand la base en compte 237, et affirme que rien n'est écrit
en base. Le commiter installerait la même fausse vérité que `SCHEMA-V2_2.md`.

**La cartographie muscles réelle est en base** — `exercises.muscles_primaires`,
`muscles_secondaires` et `muscles_stabilisateurs` (v2_069) — et `SCHEMA-REEL.md` y renvoie.

Les documents `REGLE-PROGRESSION-V1*.md`, `REGLE-VOLUME-V1.md`, `SCHEMA-V2.md` et
`SCHEMA-V2_2.md` sont cités comme **remplacés** : leur absence est normale.

## Divergences connues — signalées, pas arbitrées

### Chiffres périmés

Plusieurs documents citent une volumétrie antérieure aux imports. L'état au
10/09/2026 est de **1 221 séances · 28 103 séries · 237 exercices · 116 pesées**.

| Document | Ce qu'il annonce |
|---|---|
| `REGLES-DE-COMPTAGE-V1.md` | 582 séances · 15 677 séries · 164 exercices — mesures datées du 23/08, présentées comme telles dans leur contexte |
| `REFERENTIEL-BORNES-V1.md` | 891 séances · 557 pour aurel_br |
| `REGLE-VOLUME-V2.md` §9.4 | 206 exercices au catalogue |
| `ECRAN-SAISIE-V1.md` §9 | `v2_037` comme prochaine migration libre — `SCHEMA-REEL.md` dit **`v2_041`**. La section est datée d'une session antérieure et se lit comme telle |

### Résolu le 12/09/2026 — trois corrections rétablies dans `ECRAN-SAISIE-V1.md`

La version reçue le 12/09 apportait la grille de saisie (§3 bis), le menu de bloc en séance
(§5 bis), le temps de repos (§7 ter) et la page d'exercice (§7 quater) — **et avait perdu
trois corrections datées du 11/09 déjà en dépôt**. Elles ont été rétablies plutôt qu'écrasées ;
deux d'entre elles décrivent du code déjà livré, et les perdre aurait mis la spec en
contradiction avec l'app.

| § | Ce qui revenait | Pourquoi c'est faux |
|---|---|---|
| 7 bis.5 | « meilleure série = palier × meilleures reps au palier » | Définition retirée le 11/09. La retenue est « la charge la plus lourde tenue sur au moins la moitié des reps de la série la plus longue » — implémentée dans `v2/js/palier.js` au chantier 18 |
| 7 bis.11 | « Cette semaine » uniquement dans le pied du calendrier | Corrigé le 11/09 : le bouton est **aussi** dans la barre de semaine, et il y est dans `app.js` |
| 7 bis.18 | *(section absente)* | Le diagnostic du rechargement hors ligne — la sonde synchrone, et pourquoi `getSession()` ne doit rien décider au démarrage. Sans elle, rien n'empêche de rebrancher le défaut |

Le §7 bis.18 reçoit au passage **deux phrases de suite** : le « cache d'abord » qu'il décrit a
ensuite rendu l'app inaccessible **en ligne** (chantier 19), et la correction du chantier 20 a
posé les quatre vérifications d'avant-fusion dans `CLAUDE.md` §4 bis.

### Résolu le 10/09/2026

- **`validee_a`** — `ECRAN-SAISIE-V1.md` §7.1 disait « vaut `now()` par défaut ».
  La migration `v2_039` a retiré ce défaut ; la section porte désormais la
  correction et sa raison.
- **Volumétrie du cadrage** — 891 séances corrigées en 1 221.
- **Auto-correction du banc d'essai** — un avertissement en tête du §3 dit
  quel critère a survécu et renvoie au §12.
- **Périmètre du moteur ≠ périmètre de l'affichage** — `CADRAGE-V2.md` §2 ter :
  la v2 affiche randonnée, pilates, escalade et course ; le moteur ne les lit pas.
- **Noms de colonnes** — `REGLES-DE-COMPTAGE-V1.md` §7 écrivait `sets.load_kg` et
  `body_weight_log.weight_kg`, formes anglaises antérieures à l'écriture du schéma
  en français. Corrigées en `charge_kg` et `poids_kg`, avec l'avertissement en tête.
- **« Rien n'est écrit en base »** — en-tête du même document, faux depuis le 28 août.
  Corrigé : muscles, `coef_pdc`, `masse_depart_kg` et `body_weight_log` existent tous.
- **Supersets à 38 %** — `MODIFICATEURS-SERIE-V1.md` §4 portait un chiffre jamais
  mesuré. Remesuré à **48,7 %** chez aurel_br, avec le détail par profil : la limite
  qu'il documente s'en trouve aggravée, pas atténuée.
