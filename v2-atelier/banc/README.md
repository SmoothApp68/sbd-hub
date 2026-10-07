# Banc d'essai

Deux bancs vivent ici : celui du **moteur** (Python, quatre fichiers) et celui
de l'**hébergeur** (`serveur-pages.js`). Aucun ne tourne dans l'app ; ils sont
là pour que la prochaine session reparte de la bonne référence, pas d'une copie
divergente.

## Le banc du moteur

Ces quatre fichiers ont servi à valider l'enchaînement `MOTEUR §4 → §7` sur les
exports Hevy des cinq profils, **avant** qu'il soit porté en JavaScript.

| Fichier | Rôle |
|---|---|
| `banc_etage1.py` | l'enchaînement §4 → §7 : types, chauffe probable, rampe, descente, palier |
| `banc_etage2.py` | du palier au format et à la cible (§8.2, §9.1) |
| `banc_etage3.py` | critères d'évaluation des règles candidates |
| `recette_palier.py` | le test de recette du `BANC-ESSAI-V1.md` §6.1 — autonome, il s'exécute seul |

Les trois premiers lisent un export Hevy (`workout_data_*.csv`) qui **n'est pas
versé au dépôt** : il contient les données d'entraînement de cinq personnes
réelles. Le dépôt est privé, mais ces exports n'y entrent pas pour autant — et
ce dossier n'est pas publié (`v2-atelier/`, hors de `v2/`, depuis 59-1).

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


---

## Le banc de l'hébergeur — `serveur-pages.js`

**Un serveur qui IMITE Cloudflare Pages**, canonicalisation comprise :
`GET /index.html` répond **308 vers `/`**, et tout chemin sans fichier rend
`index.html` en 200 (la règle `/* /index.html 200` de `v2/_redirects`).

```
node v2-atelier/banc/serveur-pages.js [racine] [port] [--sans-canonicalisation]
```

**Pourquoi il existe.** Le banc du chantier 18 servait `/index.html` avec un
200. Le seul comportement de Cloudflare qu'il n'avait pas copié était
précisément celui qui casse l'app : le service worker mettait en cache la
réponse 308-suivie (marquée `redirected`), la servait aux navigations, et le
navigateur la convertissait en erreur réseau. `ERR_FAILED` en ligne, sur
appareil, sans autre sortie que d'effacer les données du site.

> **Un banc qui n'imite pas la production ne prouve rien sur la production.**

`--sans-canonicalisation` est le **témoin** : dans ce mode, la garde
`redirected` et son absence donnent le même résultat. Un banc qui ne tourne que
là ne prouve rien — c'est exactement ce qui s'est passé au chantier 18.

Il sert `tests/banc/sw-navigation.js` (7 scénarios, navigateur réel). Les règles
d'avant-fusion du service worker sont au **§4 bis de `CLAUDE.md`**.

---

## Les bancs navigateur — `tests/banc/`

Deux bancs y vivent, tous deux autonomes et rendant un code de retour non nul en
cas d'échec, pour qu'une campagne de mutation puisse s'en servir :

| Banc | Ce qu'il éprouve |
|---|---|
| `sw-navigation.js` | le service worker : 7 scénarios, dont la sortie de l'état cassé du chantier 19 |
| `routines-ecran.js` | la bibliothèque de routines : l'app réelle, session truquée, **Supabase de papier** |
| `seance-ecran.js` | la séance en cours, **l'app tuée en pleine séance sans réseau** |

**`routines-ecran.js` applique les deux index uniques de la vraie base** —
`routine_exos_rang_uniq (routine_id, rang)` et
`routines_user_nom_actif_uniq (user_id, lower(btrim(nom))) WHERE archivee_a IS NULL`.
Sans eux il serait plus permissif que Postgres, et « renuméroter proprement »
deviendrait indistinguable de « écrire n'importe comment ».

Il a trouvé trois défauts que les tests purs ne voyaient pas — dont la
bibliothèque qui annonçait « aucune routine » hors ligne, c'est-à-dire
« je ne sais pas » présenté comme « il n'y en a pas ».

**`seance-ecran.js` ferme la page pour de vrai** (`page.close()`) : le JS s'arrête,
la mémoire part, IndexedDB reste. C'est la seule façon d'éprouver ce qui compte —
une séance se perd quand l'app meurt au milieu, pas quand elle se termine bien.
Son Supabase de papier applique `sets_validee_si_saisie`, `sets_rang_positif`,
`sessions_statut_ok` et `sets_rang_unique` **différée**, et il sait couper le
réseau à mi-parcours.

Il échantillonne aussi l'écran **pendant** la réouverture, pas seulement à la
fin : voir la liste des séances à la place de sa séance, même une seconde, c'est
croire qu'on l'a perdue. C'est ce contrôle-là qui a trouvé le défaut central du
chantier 22.
