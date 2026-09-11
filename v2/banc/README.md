# Banc d'essai — la référence exécutable du moteur

Ces quatre fichiers ont servi à valider l'enchaînement `MOTEUR §4 → §7` sur les
exports Hevy des cinq profils, **avant** qu'il soit porté en JavaScript. Ils ne
tournent pas dans l'app : ils sont ici pour que la prochaine session reparte de
la bonne référence, pas d'une copie divergente.

| Fichier | Rôle |
|---|---|
| `banc_etage1.py` | l'enchaînement §4 → §7 : types, chauffe probable, rampe, descente, palier |
| `banc_etage2.py` | du palier au format et à la cible (§8.2, §9.1) |
| `banc_etage3.py` | critères d'évaluation des règles candidates |
| `recette_palier.py` | le test de recette du `BANC-ESSAI-V1.md` §6.1 — autonome, il s'exécute seul |

Les trois premiers lisent un export Hevy (`workout_data_*.csv`) qui **n'est pas
versé au dépôt** : il contient les données d'entraînement de cinq personnes
réelles, et ce dépôt est public.

## Le portage JavaScript

`v2/js/palier.js` porte `banc_etage1.py`. **Les deux doivent rester d'accord.**
Vérifié au chantier 17 sur un échantillon stratifié de 200 séance-exercices
(40 par cas : chauffe probable, rampe, descente, simple, sans palier) :
200/200 sur le palier et sur les meilleures reps.

Ce que le portage ajoute et que le Python n'a pas : les fonctions de validation
du §9.2 / §17.3 / §17.4 (`cranEffort`, `repsComptees`, `palierTenu`), portées
depuis `recette_palier.py` parce que la recette les exige.

## Corrections apportées ici

**11/09/2026 — `analyse()` : les séries `failure` ne votent plus.** Le banc
n'écartait que `warmup` et `dropset`, contre le tableau du §4. Détail complet en
tête de `banc_etage1.py`.

## Réserve connue, non corrigée

`etats_exercices()` compte sur les séries non-`warmup` — dégressives et échecs
compris — alors que `analyse()` les écarte. Mesuré : quasi inerte (un exercice
change d'état, et seulement parce qu'il retombe sous le seuil de 8 séances ; le
tableau du §5.1 est inchangé). Laissée en l'état pour que les deux références
restent alignées.
