# SOCIAL-V1 — le social, étage 1 : abonnements, fil, profil avec calendrier

> Décisions d'Aurélien du 12/10/2026 (prompt 87), complétées le 13/10/2026 (visibilité des séances, niveau publié,
> jeu éteint). Texte de Claude.ai, repris tel quel. Maquette : `v2-atelier/maquettes/maquette-social-etage1-v2.html`.
> Base : migration `v2_078_social_abonnements` (écrite par Claude.ai, lancée par Aurélien).

## 1. Les trois cercles

Abonnements façon Instagram, trois cercles :

| Cercle | Voit |
|---|---|
| Inconnu | pseudo, blason, niveau du jeu |
| Abonné accepté (un sens) | fil : titre, date, records (médailles), tonnage ; réagir ; calendrier du profil (jours, résumé au toucher) |
| Mutuel | + détail des séances (exercices, séries, charges) ; bouton « Inviter dans un groupe » (grisé sinon, avec « Abonnez-vous l'un à l'autre pour l'inviter » — l'invitation elle-même est l'étage 3, le bouton seulement ici, inactif même en mutuel avec « Bientôt ») |
| Jamais | poids de corps, santé, notes, RPE, ressenti, douleur |

## 2. Les règles

- Compte privé par défaut (chaque abonnement s'approuve ; public = acceptation d'office).
- Bloquer et retirer un abonné en silence ; bloquer efface tout lien.
- Le nombre de réactions n'est visible que par l'auteur.
- Fil : séances terminées des 30 derniers jours, liste chronologique, puis « Tu es à jour » ; jamais une séance en
  cours ; jamais une séance `visibilite = 'private'`.
- Pas de commentaires, pas de notification push (un badge sur l'onglet pour les demandes).
- Un seul onglet « Jeu & amis » : le fil est un sous-onglet à côté du jeu, pas un onglet de plus.
- Coach et bilans ne lisent jamais rien du social.

## 3. La base (v2_078)

Tables `abonnements`, `blocages`, `reactions_seance`, colonne `profiles.compte_prive`. Les autres ne lisent que par
les fonctions RPC : `social_profil(pseudo)`, `social_rechercher(debut)`, `social_fil()`,
`social_records_seance(session)`, `social_calendrier(user, de, a)` (≤ 62 jours), `social_detail_seance(session)`
(mutuels), `social_mes_reactions(session)`, `social_liens()` (mes demandes reçues et envoyées, abonnés, abonnements,
bloqués, avec pseudo et niveau).

Écritures directes par le client : insert/delete `abonnements`, update statut → `accepte` (le suivi seulement),
insert/delete `blocages`, insert/delete `reactions_seance`, update `profiles.compte_prive`.

Le tonnage des fonctions est celui de `Bilan.volumeKg` (`faits.js`) : séries de travail, charge > 0, reps > 0,
arrondi au centième. Les médailles affichées se choisissent par la règle de `faits.js` sur les lignes rendues par
`social_records_seance` (une médaille par série médaillée, `set_id`).

## 4. Décisions du 13/10/2026

- **Visibilité des séances** : le défaut de `sessions.visibilite` passe à `mutuels`, et toutes les séances `private`
  existantes passent à `mutuels` (le v2 n'avait jamais écrit cette colonne : le défaut `private` n'était le choix de
  personne). La confidentialité se règle au niveau du compte (`compte_prive`). `private` voudra dire « séance
  masquée », un choix explicite à venir (noté pour plus tard). `public` vaut `mutuels` pour l'instant. Le v2 n'écrit
  toujours pas `visibilite`.
- **Niveau publié** : colonnes `profiles.jeu_niveau` (integer) et `jeu_titre` (text), publiées par l'app depuis
  `etatDuJeu` (fin de séance et ouverture de l'onglet Jeu, par le chemin du profil, seulement si elles changent).
  `social_profil` et `social_rechercher` rendent `niveau` (et `titre`), nuls si `jeu_actif = false`. Sans titre,
  l'écran n'affiche que le niveau.
- **Blason** : le gabarit de la maquette, d'une couleur dérivée du pseudo (le jeu v2 n'a pas de blason).
- **Jeu éteint** : l'onglet reste, réduit au fil et aux amis ; il s'appelle « Amis » quand le jeu est éteint,
  « Jeu & amis » sinon. Le social est volontaire et indépendant du jeu, il reste accessible sans adresse cachée.
- **Pas de « Classements »** à l'étage 1 : ce sera l'étage 2.
- **Lien d'invitation** : `/a/<pseudo>` ouvre le profil (une route de l'app).
