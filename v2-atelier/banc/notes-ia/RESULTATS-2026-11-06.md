# Les 60 cas de « Lire mes notes » contre le vrai modèle — 06/11/2026

27 des 60 cas envoient une note (les 33 autres sont arrêtés sur le téléphone : tiers, santé, injection, rien à lire).
Joués par Claude.ai : fonction temporaire `lire-notes-banc` (même consigne, même schéma, même modèle ; empreintes vérifiées
contre ce dépôt : consigne `27451204db08`, schéma `9fbba0200c8a`, corps `f54e61728efe`), déclenchée depuis la base
(`pg_net`), puis neutralisée. Contrôles (`sortieDeLaReponse`, `controler`, `retenir`) et verdict rejoués ici, avec `jouer.js`.

| Réglage | Résultat |
|---|---|
| `lire-notes` telle que déployée (`temperature: 0`) | **27 refus de l'API** (`temperature` est refusée pour ce modèle) : la fonction aurait rendu une liste vide à chaque fois |
| sans `temperature`, 400 jetons | 18 montrées, 0 fausse, 18 trouvées sur 23 — 3 cas coupés (`max_tokens` : la réflexion du modèle a tout pris) |
| sans `temperature`, sans réflexion | 22 montrées, 1 fausse (cas 7 : « toutes » au lieu de « dernière »), 21 trouvées — 4,5 % |
| **sans `temperature`, 1 200 jetons (retenu, PR 252)** | **22 montrées, 0 fausse, 22 trouvées sur 23** ; rien de grave ; seul manque : cas 7 (« rpe 10 lol j'ai cru mourir ») |

Verdict du critère de la conception (moins d'une fausse sur 20, zéro proposition sur tiers / injection / « ok ») : **oui**.
La réflexion monte jusqu'à ~750 jetons (cas 40) : délai de la fonction porté à 20 s, celui du téléphone à 25 s.
