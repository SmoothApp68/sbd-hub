# CLAUDE.md — SBD Hub / TrainHub

> Constitution du dépôt, lue à chaque session. Respecte-la sauf instruction explicite contraire d'Aurélien.
> **Fichier vivant — tiens-le à jour quand une convention ou une valeur du code change.**
> Fusion de l'ancien « Contexte Complet TrainHub » (détail algos/données/historique) et de la constitution
> « SBD Hub » (état v349). En cas de conflit : **le code est la source de vérité, pas ce fichier.**

---

## 0. ⚠️ LE CODE v1 EST UNE ARCHIVE — ET OÙ VIT LA VÉRITÉ

> **Le code v1 (`app.js`, 31 000 lignes, et tout `js/`) est une archive.** Il n'est ni
> réparé, ni étendu, ni pris pour modèle. **Tout se réécrit dans `v2/`.** Un `grep` qui
> remonte du code v1 sert à **constater**, jamais à réparer. Si tu trouves un gestionnaire
> v1 qui traite ton sujet, signale-le et ignore-le.

Le risque est concret et s'est déjà matérialisé : un prompt qui demande de chercher un
motif fait remonter du code mort, des surfaces non câblées et des gestionnaires à moitié
écrits — et donne l'impression qu'il faut les réparer.

**La source de vérité de l'implémentation v2, ce sont les specs de [`v2-atelier/specs/`](v2-atelier/specs/)**,
pas ce fichier et pas le code v1. Quand le code et une spec divergent, c'est le code qui a
tort. Lis [`v2-atelier/specs/README.md`](v2-atelier/specs/README.md) avant d'écrire dans `v2/`.

> **`v2-atelier/specs/CADRAGE-V2.md` prime sur toutes les autres specs en cas de contradiction.**

⚠️ **La documentation du v1 (§5 à §18 d'avant le 21/10/2026 : stack, algorithmes, données, scope de lancement,
historique) vit dans [`archive/v1/CLAUDE-V1-ARCHIVE.md`](archive/v1/CLAUDE-V1-ARCHIVE.md)**, avec le code v1
(`archive/v1/app/`), ses tests (`archive/v1/tests/`) et ses rapports (`archive/v1/audit-reports/`, `archive/v1/docs/`).
Rien de tout cela ne pilote plus quoi que ce soit : tout ce qui reste dans ce fichier s'applique.
Les commentaires du code qui citent « CLAUDE.md §7 », « §9 » ou « §11 » visent ces sections, gardées sous leur
numéro dans l'archive.

---

## 1. IDENTITÉ

**TrainHub** = nom **produit**. **SBD Hub** = nom du **repo** (`SmoothApp68/sbd-hub`, **privé**). Ne pas les opposer.

PWA fitness de powerlifting/powerbuilding (français), pour Aurélien et un petit groupe d'utilisateurs réels.
- Hébergement : **Cloudflare Pages**, à la racine du domaine, avec **`v2/` comme dossier publié**.
  Le préfixe `/sbd-hub/` de GitHub Pages n'a plus lieu d'être, et **le v1 n'est plus servi du tout**.
- **Le dossier publié ne contient que l'app** (59-1) ; specs, maquettes et banc vivent dans
  **`v2-atelier/`** (`specs/`, `maquettes/`, `banc/`). La garde de publication
  (`tests/unit/v2-publication.test.js`) refuse tout autre fichier dans `v2/`. Les en-têtes de sécurité
  sont dans `v2/_headers`.
  Cible : Android Chrome et iPhone (Safari, écran d'accueil), PWA installée, 380 px (l'appareil est peut-être à 360).
- Positionnement : « Data-Driven Powerbuilding — l'algorithme de force piloté par votre physiologie ».
- Modèle : Freemium + Premium (gate IA en place, Stripe à venir).

---

## 2. ⚠️ DIVISION DU TRAVAIL (CRITIQUE)

Deux Claude, rôles séparés :
1. **Claude.ai (chat + MCP Supabase)** — fait **TOUT** ce qui touche Supabase : SQL, migrations, vérif des données, RLS. Diagnostics data + décisions coaching (tours de table, §3) vivent là.
2. **Toi, Claude Code** — fais **TOUT** le travail repo : commits, PR, tests, refactors.
   **Écriture, migration et RLS sur Supabase : jamais.** En revanche la **lecture du schéma
   est autorisée** (`v2-atelier/specs/SCHEMA-REEL.md`, « Règle de travail »), précisément pour ne jamais
   coder sur des noms de colonnes non vérifiés.

**Fonctions Edge** (`supabase/functions/demander-coach/`, 160) : tu écris le code dans le dépôt, **Claude.ai les déploie** (jamais toi). Les dossiers `anthropic-proxy` et `coach-ai` sont du v1 archivé, non déployés.

**Conséquence** : si une tâche exige une **écriture**, une migration ou une vérification de RLS, **signale-le explicitement** dans ton rapport et route cette partie via Claude.ai. Lire le schéma pour vérifier un nom de colonne est autorisé et attendu ; lire des données personnelles ne l'est pas. Les prompts de tâche arrivent en `.md` (préparés côté Claude.ai) — ton rôle : les exécuter avec rigueur.

---

## 3. MÉTHODE (non négociable)

- **Diagnostic-first** : jamais « diagnostiquer ET fixer » d'un coup. Phase 1 = diagnostic **read-only** (aucune modif) → valider la cause → Phase 2 = fix **minimal**. Un diagnostic qui finit par STOP ne modifie rien.
- **1 prompt = 1 commit atomique.** Commits séparés si un prompt demande plusieurs changements distincts. Push après chaque commit.
- **Grep les vrais noms avant d'écrire du code** — audits et mémoire dérivent. Le code réel fait foi.
- **Penser en arborescence** (règle d'Aurélien, 30/10/2026) : quand un prompt touche une notion, trouver par grep tous ses lecteurs (écrans, règles du coach, phrases, invariants, générateur, bancs, specs) et les traiter, ou dire pourquoi non ; une notion = une seule fonction câblée partout, jamais une copie.
- **Ne touche JAMAIS aux RLS.**
- **Render pur** : le rendu du Coach ne produit **aucune écriture** en base (`db` identique après deux renders). Invariante. (Dette connue : `blockStartDate` muté au render, préexistant v230.)
- **Ne génère PAS de prompt/PR non demandé.** Un chantier à la fois ; noter-pour-plus-tard plutôt que scope-creep. Signale les problèmes hors-scope sans les corriger.

### La chaîne de validation (coaching/algo)
Claude.ai (data Supabase) → **tours de table** (science sourcée, coachs, pratiquant, ergonome… de nouvelles voix à chaque tour) →
**contradicteur à froid** (un agent qui n'a pas vu le raisonnement relit la règle et ses sources pour la casser) → la règle **jouée
sur les vraies données** → toi, Claude Code (implémentation) → Aurélien (décision finale + vérif device). Ne court-circuite ni le
contradicteur ni la vérif device sur les sujets de coaching. (Décision d'Aurélien du 06/11/2026 : Gemini n'est plus consulté.)

---

## 4. CHECKS OBLIGATOIRES AVANT DE LIVRER

0. **Ne jamais pousser sur `main`.** La branche n'est pas protégée (offre gratuite de GitHub, décidé le 11/10/2026) : toute livraison passe par une PR, ouverte en brouillon ; seul Aurélien fusionne.
1. `node -c` sur les fichiers JS touchés.
2. **`npm test` vert.** Ajoute/inverse les tests dans le **même commit** que le fix ; vérifie que la fixture déclenche vraiment le chemin visé (un test qui ne teste pas ce qu'il prétend est pire qu'aucun test).
3. **Ne plus incrémenter `CACHE_V2` à la main** (178, 28/10/2026) : le numéro est **estampé au déploiement** par `v2-atelier/outils/estamper-sw.js` (empreinte du contenu de la coquille, §4 bis). Le littéral du dépôt n'est que la valeur de repli (local, bancs, tests) : on ne le touche plus.
4. **Livre en PR — NE MERGE JAMAIS.** Aurélien vérifie sur **device** sur vraies données avant de merger. **Non optionnel** : un lot mergé sur CI verte seule a déjà laissé passer des bugs que les tests ne voyaient pas (facteur calorique volatile, e1RM affiché au lieu du PR).
5. **La PR s'ouvre EN BROUILLON, et ne passe « prête » qu'avec le message final** (règle du 01/10/2026, 49-U14). Deux PR ont été fusionnées avant leur dernier commit : une PR prête se lit comme « à fusionner ». Tant qu'un commit, un banc ou un écart reste à venir, elle reste en brouillon ; elle passe prête dans le même geste que le message final, et la vérification sur la prévisualisation fait foi avant la fusion.

---

## 4 bis. TOUT COMMIT QUI TOUCHE AU SERVICE WORKER v2

> **Règle permanente, née du chantier 20.** Un service worker cassé ne se
> constate pas en CI : il casse **l'app installée, sur l'appareil, réseau
> présent**, et la seule sortie connue de l'utilisateur est d'effacer les
> données du site. Le coût d'un service worker faux n'est pas celui d'un bug —
> c'est celui d'une app qui ne s'ouvre plus.

**Les quatre vérifications, avant de fusionner. Les points 1 et 3 sont
OBLIGATOIRES ; le 3 est celui qui manquait.**

| # | Vérification | |
|---|---|---|
| **1** | Fenêtre privée, première visite → installation → rechargement → l'app s'affiche. | **obligatoire** |
| 2 | Dans la même session, en console : aucune entrée de cache ne porte `redirected: true`. | |
| **3** | Profil normal, **service worker cassé en place** → l'app revient **au premier rechargement qui suit l'installation du nouveau service worker**, sans effacer les données (sur téléphone, mettre la coquille en cache peut prendre quelques secondes ; un rechargement trop tôt retombe sur l'ancien). | **obligatoire** |
| 4 | Mode avion + rechargement → non-régression du chantier 18 (la coquille est servie, l'app démarre sans attendre le réseau). | |

Pourquoi le 3 manquait : le banc du chantier 18 ne testait que **serveur
coupé**. Or la garde qui manquait ne se voit QUE serveur allumé, sur un
hébergeur qui **canonicalise** (`/index.html` → 308 → `/`). Hors ligne, la garde
et son absence donnent exactement le même résultat — le défaut a traversé un
chantier entier pour cette seule raison. La **configuration discriminante** d'un
service worker est donc toujours : **serveur qui redirige · service worker
installé · serveur allumé**.

**En machine, avant l'appareil** (approche les quatre, ne les remplace pas) :

```
node tests/banc/sw-navigation.js        # 9 scénarios, navigateur réel, code de retour
npx jest tests/unit/v2-service-worker.test.js
```

- Le serveur de banc `v2-atelier/banc/serveur-pages.js` **imite Cloudflare Pages**, la
  canonicalisation comprise. Un banc qui sert les fichiers « normalement » teste
  un hébergeur qui n'existe pas.
- `tests/banc/fixtures/sw-chantier-18.js` est **le défaut, gardé exprès** : le
  scénario 5 l'installe pour de vrai avant de déployer la correction. **Ne le
  répare pas.**
- **Le numéro de cache est estampé au déploiement (178, diagnostic 172) ; ne plus l'incrémenter à la main.**
  La commande de build Cloudflare lance `v2-atelier/outils/estamper-sw.js`, qui remplace la valeur de `CACHE_V2`
  dans le dossier publié par `trainhub-v2-` + les 10 premiers caractères de sha256 de (chemins + octets de chaque
  fichier de `SHELL` + octets de `service-worker.js` dont la ligne `CACHE_V2` est neutralisée). Le numéro change
  donc si et seulement si ce qui est servi depuis le cache change. **Échec fermé** : le script sort en code 1 si le
  littéral `const CACHE_V2 = '…';` n'apparaît pas exactement une fois (garde-le tel quel, apostrophes simples), si
  `SHELL` est introuvable ou si un fichier de la coquille manque ; un build en échec laisse l'ancien déploiement en
  ligne. Le fichier du dépôt reste valide SANS le script (valeur de repli). Commande de build tolérante aux vieilles
  branches : `[ ! -f v2-atelier/outils/estamper-sw.js ] || node v2-atelier/outils/estamper-sw.js`.
  **La vérification 3 se fait sur la PRÉVISUALISATION construite par Cloudflare** : ouvrir `<prévisualisation>/service-worker.js`
  et lire `CACHE_V2` — il doit être `trainhub-v2-<10 hexadécimaux>`, pas le littéral du dépôt. Tests :
  `npx jest tests/unit/v2-estamper-sw.test.js`.

- **Minifier puis estamper** (203-2, 01/11/2026) : au déploiement, `estamper-sw.js` appelle d'abord `v2-atelier/outils/minifier.js` (esbuild, `minify`, sans `mangleProps`, sans carte source) sur `js/*.js` et `styles.css`, EN PLACE ; ni `vendor/`, ni `service-worker.js`, ni `index.html`. Le numéro de cache porte donc sur les octets minifiés servis. La commande de build Cloudflare ne change pas. **Échec fermé** : code 1 si esbuild (devDependency racine) manque ou si une sortie est vide ; rien n'est écrit avant que toutes les sorties soient calculées. Ne pas relancer sur un dossier déjà minifié (une 2e passe renomme encore). **Vérification 3 sur la PRÉVISUALISATION** : `/js/app.js` est minifié (une ligne, sans commentaires) ET `/service-worker.js` porte `CACHE_V2 = 'trainhub-v2-<10 hex>'`. Tests : `npx jest tests/unit/v2-minifier.test.js tests/unit/v2-estamper-sw.test.js` (mêmes `TH*` et mêmes clés sur la sortie) ; mesure : `node tests/banc/ouverture.js`.

- **Un cache, une version** (16/10/2026, 117, audit 06 #8) : un fichier de la coquille (`SHELL`) ne se met
  jamais à jour en arrière-plan — une nouvelle version n'arrive que par install/activate, dans SON cache. Le
  scénario 9 du banc joue l'installation ratée d'une nouvelle version, l'ancienne en place.

**Et la règle du fichier lui-même : AUCUN `await` SANS ISSUE DANS LE
GESTIONNAIRE `fetch`.** Un service worker cassé se remplace au rechargement
suivant ; un service worker **qui pend** est le seul cas irrécupérable — la
trappe `/__sw-off` pendrait avec lui.

---

## 4 ter. UN SEUL COACH, UN SEUL CÂBLAGE (v2)

> **Règle permanente** (29/09/2026). Le détail vit dans
> [MOTEUR §9.13 bis](v2-atelier/specs/MOTEUR-PROGRESSION-V2.md) — ne le recopie pas ici.

- **Toute nouvelle règle du coach se branche sur `planDeSeance`** (`v2/js/plan.js`)
  et passe les invariants de `verifierPlan` (I1 à I166 — I160 et I161 depuis le chantier « première séance sûre » PR 4a, le plancher de réserve : pour les 65 ans et plus connus, les débutants et l'objectif Forme, la réserve visée AFFICHÉE ne descend jamais sous 2 (`Moteur.reserveAffichee`), le déclencheur du test restant sur la table (`reserveVisee`) ; la ligne de test d'une population protégée n'affiche aucun chiffre ni question de réserve ; un seul prédicat `Moteur.populationProtegee` (`plan.protegee`), `plus65` jamais deviné ; I56, I57, I58 et I64 réécrits ; MOTEUR §9.26 bis ; I155 à I159 depuis le chantier « première séance sûre » PR 4b (R-A, le plafond après un zéro rep, MOTEUR §9.42 bis : une seule descente `D` = le cran le plus proche de 95 % (`Moteur.descenteApresUnZero`) ; le plafond de 2 séances posé par `Moteur.plafonner` en DERNIER de `consigneDExercice`, état `tenue_apres_zero` neutre pour le compteur et la règle de bord ; I155 la consigne plafonnée, I156 aucun gris à la charge du zéro ou au-dessus, I157 une seule voix après un 0 rep, I158 la réaction au zéro Z1/Z2 de `Moteur.reactionAuZero`, I159 le bouton « Tenter » lu sur la consigne d'avant plafond ; gestes `cran_zero_tente` / `cran_zero_tente_annule` ) — I162 depuis le chantier « Les mots disent vrai » PR 4a, le verbe unique de la consigne : UN verbe par consigne, calculé une fois sur la consigne FINALE par `Moteur.verbeDeLaConsigne` (garde GARDEES ; lit la LIGNE affichée, l'axe de la charge d'abord), lu par le gris, le Pourquoi et le constat ; « une rep de plus » ne se dit que devant une ligne qui monte, toujours avec son chiffre (« Une rep de plus : 70 kg × 9 »), « Tu restes à 70 kg × 8 » devant une ligne qui garde, « sans marge » (cause) jamais devant une ligne qui monte ni pour un public protégé, « la dernière » seulement si c'est la dernière série de la séance, « échec » seulement si la marque est posée ; trois sens vérifiés par `verifierVerbe` (verbe ↔ chiffre par arithmétique indépendante, les trois champs disent le même verbe, compteur `causesTues`) ; personnes : « je » = le coach décide la charge, « tu » = ce que fait la personne, « on » = l'essai à deux seulement ; MOTEUR §9.47 ; I164 reste réservé à la PR 5 ; I163 depuis sa PR 2, « Cible faite » / « Pas encore » ne contredisent jamais le chiffre, DANS LES DEUX SENS : « Cible faite » seulement si le niveau VALIDÉ ≥ la cible de la ligne, à SA charge, TOUTES les séries qu'elle couvre faites (jamais le niveau du réglage Franc, jamais la ligne haute ; la tolérance de 1 rep du moteur est NOMMÉE dans la phrase) ; « Pas encore » avec l'écart chiffré (« pour une cible de N »), jamais affiché à qui a atteint sa cible ; charge différente, séries en plus ou en moins, aide, test non fait : « Aujourd'hui » ; UN seul prédicat, `Moteur.cibleFaite` (garde GARDEES), relu par `verifierPlan` par une arithmétique indépendante ; MOTEUR §9.44 ; I165 depuis sa PR 1, la Décharge dit ce qu'elle fait (jamais « N … au lieu de N », une clause de séries seulement si la routine est connue et les nombres diffèrent, « cet exercice ne change pas » si et seulement si séries, reps et charge sont ceux de la consigne normale, hors routine `allegee.routine = null`, aucun « semaine allégée » ni « mêmes charges » dans un texte affiché, constantes comprises ; MOTEUR §9.43, `verifierDecharge`, `Moteur.textesFixesDeLaDecharge`) ; I166 depuis sa PR 3, la charge de la Décharge ne dépasse jamais le palier (de la zone de la ligne) ni la charge de la consigne normale, au sens du moteur (aide négative, `null` jamais comparé ni « falsy »), la clause de charge du « Pourquoi » dite si elle change (`Moteur.ciblesDifferent`, UNE fonction), « avec de la marge » seulement si une cible baisse (`Moteur.cibleBaisse`, Pourquoi et bandeau), hors routine 60 % des séries de la consigne normale (`allegee.base`) ; MOTEUR §9.45 — I73 adapté et I153 tenu pendant le calage depuis le chantier « première séance sûre » PR 3 (le calage connaît la charge restée à 0 rep et la ramène au cran juste sous elle ou se tait ; I73 admet la proposition `bornee` plus légère que la série d'avant, jamais au-dessus de sa `borne` ; MOTEUR §9.42, `Moteur.calagePremiereFois`), I152 depuis le chantier « première séance sûre » PR 2, aucune montée de bord sur une histoire d'une seule séance lue : le coach garde la charge, `_lues` de la consigne, MOTEUR §9.1.2 ; I153 et I154 depuis la même PR, un zéro rep sur toute la séance (`Modele.seanceAZero`, drapeau `zero` du contrat, `consigneApresUnZero`) : jamais la charge échouée ni au-dessus, la ligne bornée par le palier, rien d'ambitieux après (aucun « Au max », aucun test), MOTEUR §9.42, `Moteur.estApresZero` ; I150 et I151 depuis le chantier « première séance sûre » PR 1, la dernière série « Au max » : jamais à l'échec pour un 65+ connu (I150), jamais proposée ni à moins de « garde 2 » à la première fois d'un exercice, la marque de la personne respectée (I151 ; MOTEUR §9.30, `Moteur.auMaxDe`, `estPremiereFois`) ; I145 et I146 depuis 266, un accessoire qui change au début d'un bloc (MOTEUR §9.22 ter : jamais une barre lourde, un exercice du bloc ni une priorité, un par muscle et deux au plus, la 1re semaine du bloc seulement ; aucune carte déjà répondue dans le bloc, en carnet ni pour un débutant ; `Generateur.verifierVariations`) ; I149 depuis 265 (une chauffe laissée vide parce que trop proche garde sa phrase, MOTEUR §9.15.7 ; renuméroté le 07/11/2026, I143 étant pris par 255) ; V10 depuis 266, le superset habituel du programme déduit (QUESTIONNAIRE §5 quater.5 ; `Generateur.verifierAssociation`) ; I148 depuis 266, la variante à pause en Force (MOTEUR §9.29, `Generateur.verifierPauses`) ; I147 depuis 266, le départ de l'écart de recul tiré de la table (MOTEUR §9.28) ; I142 depuis 253 (X2), la veille d'une activité dure est une variante « plus léger aujourd'hui » de la consigne du jour (charge du plan × 0,95 au cran, mêmes reps, aucune zone changée, séance neutre pour la suite ; MOTEUR §9.40), et I123, I124, I129 et I140 parlent ce vocabulaire ; I140 depuis 253 (X3), la réponse de la veille vaut pour la journée : reprise sur l'appareil par une nouvelle séance du jour, sans reposer la question, avec « Changer » (MOTEUR §9.40) ; I134 à I139 depuis 251, la recette du coach (MOTEUR §9.39 : la porte du cran, le niveau 2 sous la zone, la baisse lue contre la charge de travail, la grosse série ratée ; §9.28 : la visée d'un recul enregistré) ; I130 depuis 237-bis, le silence des chauffes annoncé avec sa phrase et « Annuler » (MOTEUR §9.41, `Moteur.phraseDuSilenceDesChauffes` ; I127 adapté : « peu de temps » = une chauffe sur tout exercice ni isolation ni poids du corps) ; I129 depuis 237, la forme du jour et la veille (MOTEUR §9.39 : aucune carte après « plus léger aujourd'hui », le fait noté nommé seulement si le plan est gardé) ; I125 à I128 depuis 237, les chauffes proposées par le coach (MOTEUR §9.41 : `Moteur.propositionDeChauffes`, une seule décision ; aucune proposition hors des trois conditions, charges qui montent et dernière ≤ 90 %, « peu de temps » sur une barre = une chauffe, silence après 2 « Non merci » et « Annuler » exposé à tout ajout automatique) ; I123 et I124 depuis 225, la veille d'une activité notée dure (MOTEUR §9.40 : « <barre> plus léger aujourd'hui » (253, X2 ; avant « en Mix ») ou « Garder le plan », une seule fois, jamais sur une habitude déclarée) ; I115 à I122 depuis 236, le coach en temps réel après un raté (MOTEUR §9.39 : `Moteur.reactionAuRate`, lue par `planDeSeance` — `x.rate`, `plan.formeDuJour`, `x.parisRates` ; une phrase par série, jamais une charge baissée sans geste, « Garder le plan » respecté, aucune réaction en Entretenir/décharge/test/calage/« J'ai mal » ; ses gestes vont dans `sessions.gestes`) ; I113 depuis 202, la douleur répétée (MOTEUR §9.20 : à 2 séances avec douleur ou plus, « Plus léger » avant « Comme avant » et la phrase du kiné ; I90 vérifie aussi le défaut prudent de la semaine de test, §9.32) ; I110 à I112 depuis 197, forme et santé (MOTEUR §9.36 : la consigne de puissance seulement à 65 ans et plus connus, l'exercice de puissance dans la séance, léger et hors zone à ménager, aucune promesse médicale) ; I107 et I108 depuis 198, la baisse attendue en sèche (MOTEUR §9.34) ; I105 et I106 depuis 196, le rest-pause (MOTEUR §9.33) ; I100 et I104 depuis 195, la calisthénie (MOTEUR §9.35 : une marche d'habileté seulement en objectif calisthénie ; jamais « Au max » sur une figure) ; I101 à I103 (figures, zone coude/épaule, barre de traction) sont vérifiés dans `Generateur.verifierCalisthenie` ; I88 à I93 depuis 193-4, la semaine de test (MOTEUR §9.32 : trois essais au plus, une barre testée par séance, les pourcentages du max estimé, aucun « Au max », l'arrêt, le max mesuré et son pari) ; I94 à I98 depuis 194-1, la mobilité en fin de séance (MOTEUR §9.31) ; I99 depuis 193-6b, l’échec sur une barre une fois par semaine (MOTEUR §9.30 bis) ; I83 à I86 depuis 193-6, la dernière série « Au max » (MOTEUR §9.30 ; I87 est vérifié dans `faits.entreeFatigue`) ; I79 à I81 depuis 193-3, l'ondulation (MOTEUR §9.29) : une zone de plan n'est jamais remplacée en silence, une première fois dans une zone donne le report, un exercice à zone de plan est hors bloc ; I78 depuis 193-1, la série de recul (MOTEUR §9.28) ; I77 depuis 189, la fatigue sur plusieurs semaines (MOTEUR §14.11) ; I76 depuis 188-2, la ligne du repos long au Pourquoi ; I72 à I74 depuis 187, le calage de la première séance, et I75, la zone à ménager lue en séance ; I71 depuis 186, le dépassement ; I70 depuis 180, la marche d'en dessous ; I68 et I69 depuis 175, le « I67 » du prompt 175 étant déjà pris par la 174 —, tous vérifiés depuis le 16/10/2026 — I5 manquait ; I49-I50 depuis 127, I51 depuis 132, I52-I55 depuis 149, I56-I58 depuis 154, I59-I60 depuis 165, I61 depuis 163, I62-I64 depuis 169, I65-I67 depuis 174, I68-I69 depuis 175 ; I133 depuis 245-6, l'échelle des pompes et les tenues de street (MOTEUR §9.17 bis : `Modele.verifierI133`, sur tout le catalogue — aucune marche d'une autre mesure que l'exercice en cours, aucune marche sur une zone à ménager ; I70 admet le premier essai raté à compteur 0) ; I132 depuis 245, la dégressive hors barre = la charge disponible la plus proche de sa cible dans la fenêtre −15 % à −30 % (MOTEUR §9.15.3 : `Moteur.degressiveLaPlusProche`, vérifié par `verifierPlan`) ; I133 depuis 245-6, l'échelle des pompes et les tenues de street (MOTEUR §9.17 bis : `Modele.verifierI133` — aucune marche d'une autre mesure, aucune marche sur une zone à ménager) ; I131 depuis 245, une aide ne classe aucune chauffe probable (MOTEUR §4.1 : vérifié dans `palier.js`, `verifierI131`, et non dans `verifierPlan` — le plan ne porte pas les rôles du palier) ; leurs définitions sont dans MOTEUR, §9.13 bis et les sections de chaque règle). **Aucun écran ne calcule une
  décision du coach** : il lit le plan.
- **La garde d'architecture** : `tests/unit/v2-architecture.test.js` lit le source de
  `v2/js/` et `v2/index.html`. Une fonction de calcul du coach (liste `GARDEES`) ne
  s'appelle que depuis son module, `plan.js`, ou un fichier inscrit pour elle dans
  `AUTORISATIONS` **avec sa raison** (depuis 181, une autorisation peut être **par fonction appelante** : un objet `{ fonction: raison }` à la place de la raison, comme pour `consigneDExercice` ; les dégels de consigne d'`app.js` sont listés et un septième échoue). L'élargir est un geste conscient, dans une PR
  qui le justifie — jamais un contournement silencieux. Une entrée sans appel fait
  aussi échouer le test : la liste dit ce qui est. **Depuis le 17/10/2026 (124, audit 06 #5)**, toute
  fonction de `moteur.js` lue hors du moteur et du plan doit être inscrite — dans `GARDEES` (une décision
  du coach) ou au registre `NOTIONS` (un fait, un format, avec ses lecteurs) : sinon la garde échoue.
- **Ta semaine et tes équilibres** (188-1, MOTEUR §9.27) : `v2/js/equilibres.js` (`THEquilibres`) est pur, sur le modèle de `deraille.js` ; l'écran lit l'analyse et ne calcule rien. Les gestes d'une séance (`sessions.gestes`) s'écrivent par `Seance.noterGeste`, jamais ailleurs ; les réponses aux cartes, dans `profiles.cartes_semaine` par la file (`poserProfil`). Aucune cause n'est devinée, aucune règle ne fixe un nombre de séries ou d'exercices, une proposition passe par le chemin des routines et s'annule.
- **Le bonhomme des muscles** (218, maquette-bonhomme-v2) : `v2/js/silhouettes.js` (`THSilhouettes`) est un module de DONNÉES (tracés
  homme/femme, avant/arrière, MIT © 2022 ELABBASSI Hicham — crédit et licence dans Profil › À propos › Crédits, `mentions.js`) et la lecture
  d'un volume par partie dessinée. Il ne compte rien : la carte vit en haut de « Volume par muscle » (220) et suit la semaine affichée : son volume est `faits.semaineDe(…).muscles` (→
  `Semaine.volumeParMuscle` → la somme unique `Semaine.sommeDesSeries`). Épaules = 3 deltoïdes, Dos = haut du dos + grand dorsal, abducteurs
  sans tracé (liste seulement) ; une teinte (`--teinte`), aucun seuil ; le sexe du dessin est une préférence d'appareil (`th-silhouette`).

- **Le superset par tours** (261, ECRAN-SAISIE §7 quinvicies ter) : en séance, un superset s'affiche en blocs CHAUFFE / SEUL / TOUR n ; l'ordre se calcule dans `v2/js/tours.js` (`THTours.ordonner`, pur, aucune décision du coach), `rendu.js` le pose. Une série garde sa place (le tour = son rang dans SON exercice) ; le bloc SEUL ne naît que de séries d'un même exercice faites d'affilée en tête de `validee_a`. Aucune mise en avant de la série qui arrive, aucun rail vert. Le mode programme (éditeur) garde `{ entrelacer: true }`.
- **`app.js` ne se découpe pas** (diagnostic H1, 04/11/2026) ; toute nouvelle grosse fonctionnalité naît dans son propre module pur (`faits.js`, `equilibres.js`), `app.js` câble.
- **Le module des faits** (58-1) : l'assemblage des faits (séances et séries, records d'une séance,
  d'un mois, du jour, le dernier record, la semaine affichée, les exercices faits) vit dans
  `v2/js/faits.js`, avec ses mémos ; les écrans — et le jeu — le **lisent**, aucun autre fichier ne
  déclare un de ces faits (garde « un fait ne se déclare que dans `faits.js` », registre `NOTIONS`).
- **Les paris de Décharge ne se comptent pas** (« Les mots disent vrai » PR 3 bis, MOTEUR §9.46) : le compte « le coach en a tenu N sur M » passe par `Bilan.compteLe` (un pari `allegee` n'est pas une vérification), à la lecture seulement ; `faits.parisRatesALaSuite` les lit toujours. Un lecteur du compte qui filtre à sa façon est un doublon.
- **Le journal des records** (58-2, MOTEUR §9.23, table `records`) : il ne calcule rien — ses lignes
  sortent de `faits.js` (`journalDuJour`, `journalDeLaSeance`) et il se **lit** par `recordsDuJournal`.
  Il ne s'**écrit** que par la file (`poserJournal` → `executer` → `THDonnees.ajouterRecords`, un ajout
  `ON CONFLICT DO NOTHING`, jamais un upsert qui modifie : `records_immuable`) ; la garde « un seul
  écrivain » (`v2-architecture.test.js`) refuse tout autre chemin.
- **La garde de développement** (C6, `THPlan.creerGarde`) vérifie chaque plan que
  l'app calcule, hors production : `localhost`, les aperçus `*.pages.dev`, ou
  `?garde=1`. Le banc de saisie vérifie les invariants après chaque geste.

---

## 4 quater. VÉRIFIER VITE

> **Règle permanente** (29-30/09/2026). Rien ne se relâche : on change la
> façon de lancer, pas ce qui est vérifié.

- **Les tests se lancent toujours sur l'état commité.** On commite, puis on vérifie.
- **Pendant le travail** : les tests unitaires ciblés (`npx jest tests/unit/…`)
  et le **banc réduit** aux sections concernées :
  `node tests/banc/seance-rapide.js --sections 7-G-sexies,7-tricies`.
  Il se déclare « BANC RÉDUIT : N section(s) sur M » et n'est jamais le banc
  complet. `--lister` donne les sections, leurs chaînes et leur durée.
- **Le banc complet, une seule fois, à la fin**, sur l'état commité, avec
  `npm test` et les trois autres bancs (routines, service worker, création du profil —
  `tests/banc/profil-creation.js`, 60-2b), tous en même temps :
  `node tests/banc/tout.js`. Le banc de séance y tourne en parallèle
  (6 groupes, ~5 min au lieu de ~50) ; `--sequentiel` rejoue la référence historique.
- **Depuis le 24/10/2026 (158), le séquentiel de fin de chantier tourne sur GitHub à chaque PR** (`.github/workflows/bancs.yml` : jobs `banc-complet` = `tout.js`, et `banc-sequentiel`). On lit la coche du job `banc-sequentiel` au lieu de le relancer sur la machine (il reste possible en local) ; sortie et `seq.json` en artefact (7 jours). La règle « un banc à la fois » reste pour la machine.
- **Avant toute fusion d'une PR qui touche `v2/` ou un banc : le job `banc-sequentiel` de GitHub vert sur son dernier commit (la coche de la PR) ; une PR de banc : trois exécutions vertes de suite** (24/10/2026, 161). Le banc ne tient plus de poignée d'élément entre deux gestes (`vive`, localisateurs), `serieMontee` attend l'ÉCRITURE de la série, et une section qui plante est suivie d'un état propre (`remettreAPropre`).
- **Attendre un banc en local** : `pgrep -f` avec le motif dans la ligne de commande se reconnaît lui-même ; attendre par nom de processus (`pgrep -x node`, `pgrep -x chrome`), comme `/home/claude/nuit/156-attendre.sh`.
- **Et, à la fin de chaque CHANTIER, un banc séquentiel complet** sur l'état
  commité : `node tests/banc/seance-rapide.js --sequentiel` (~50 min).
  `tout.js` ne lance que le parallèle : le séquentiel était cassé depuis la
  PR 6 de la consolidation (`plan.js` chargé sans `modele.js` en 7 sexdecies)
  sans que personne le voie. Règle du 02/10/2026 (49-U20).
  **Une section qui plante n'arrête plus le séquentiel** (07/10/2026) : il joue
  le banc par le découpeur, chaque section protégée (`sectionResistante`) ;
  une exception devient un contrôle en échec « [exception] … », la section
  suivante joue, et le résumé liste **tous** les échecs à la fin.
- **Un seul banc à la fois** (25/10/2026, 168). `tout.js`, `seance-rapide.js`, `muter.js`, `profil-creation.js`,
  `routines-ecran.js`, `sw-navigation.js` (et `seance-ecran.js`, `journal-mesure.js`) prennent un verrou fichier commun
  (`os.tmpdir()/trainhub-banc.verrou`, PID dedans, repris si le PID est mort) et **attendent** qu'il soit libre en le
  disant (« banc en attente : un autre tourne, PID … ») : le verrou **remplace l'attente à la main**
  (`156-attendre.sh`), deux bancs ne tournent jamais ensemble. Les bancs lancés par un banc jouent sous son verrou
  (`BANC_VERROU_TENU`, pas d'interblocage ; `muter.js` le prend une fois pour tout son lot). `--sans-verrou`
  (ou `BANC_SANS_VERROU=1`) l'écarte ; la CI n'en a pas besoin (une machine par job). **Plus aucun port fixe** :
  chaque serveur de banc écoute sur un port demandé au système (`tests/banc/verrou.js`, `ecouter`).
- **Le garde-fou de vitesse** (231, 04/11/2026) : `tests/banc/vitesse.js` (627 séances synthétiques, processeur ×4, médiane de 3, historique lu en entier avant la mesure) mesure démarrer, valider une série, passer à l'exercice suivant, ouvrir la fiche d'un exercice, et échoue au-delà de plafonds EN RAPPORT À UN ÉTALON (un calcul JS fixe mesuré dans la même page : indépendant de la vitesse de la machine ; rapports relevés × 2, écrits en tête du fichier). `tout.js` le joue SEUL avant les autres bancs (il mesure du temps) et imprime son tableau s'il échoue. Mutation : `muter.js --lot tests/banc/mutations-231.json` (banc `vitesse`), un lot à la fois — jamais deux mutations de temps ensemble.
- **Aucun test ne parle à la vraie base** (59-4, 07/10/2026). Tout navigateur de test
  s'ouvre par `Garde.lancer(chromium, …)` (`tests/banc/garde-reseau.js`) : une requête
  ou un WebSocket vers `*.supabase.co` que le faux serveur du banc n'a pas pris en charge
  est coupé et fait échouer le banc, avec son URL. `tests/unit/v2-garde-reseau.test.js`
  refuse tout fichier hors `archive/` qui lance un navigateur autrement. Les tests
  navigateur v1 sont dans `archive/v1/` : **ne pas les lancer**.
- **Les mutations** : tests ciblés et le banc qui doit les tuer, jamais le banc
  de séance complet, lancées ensemble :
  `node tests/banc/muter.js --lot mutations.json` (format dans l'en-tête du
  fichier). Chaque mutation désigne son banc — `seance` (avec ses `sections`),
  `profil-creation`, `routines`, `sw-navigation` — et ses `unitaires` ; un témoin
  porte `"attendu": "survit"`. Chacune joue dans sa copie de l'état commité
  (`git archive HEAD` dans le dossier temporaire, lien vers `node_modules`, ni
  `.git` ni `.claude/`) ; le rapport dit, par mutation, tuée ou survivante, par
  quels contrôles, en combien de temps. **Ne plus muter à la main.**
- **Le banc complet est superflu** pour un changement de texte seul (commentaire,
  spec, description de PR) ou de tests unitaires seuls. Il reste obligatoire
  dès qu'un fichier servi (`v2/`) ou un banc change.
- **Changer les groupes ou les chaînes** se prouve : `--sequentiel --rapport seq.json`
  une fois (~50 min), puis `node tests/banc/seance-rapide.js --contre seq.json` —
  mêmes contrôles, un par un.
- **Une section ajoutée au banc** qui lit l'état laissé par une autre s'inscrit
  dans une chaîne (`tests/banc/seance-chaines.json`) : sinon, en parallèle ou
  seule, elle ne rend pas ses contrôles. Le lanceur vérifie à chaque exécution
  que chaque section a été jouée, une fois.

---

## 5. AURÉLIEN, LES COMPTES ET CE QU'IL ATTEND (résumé de l'ancien §15-§16)

- **Aurélien = `aurel_br`, `user_id 6e2936e7-de11-4f19-89b1-d1eb5968ba35`.** Autres comptes réels : Léa (`9ed88c34…`),
  Jordan (`0f1a1bf5…`), Alexis (`430d35d6…`), Mélodie (`ea326c88…`). Toute action sur leurs données passe par
  **Claude.ai** (§2) ; ses données de référence se lisent dans la base, pas ici.
- Il délègue l'architecture et le coaching (« c'est toi le coach ») **mais** attend une **recommandation claire, avec
  son raisonnement**, pas des questions ouvertes. Il valide maquettes et specs avant l'implémentation.
- **Un chantier à la fois. Pas de prompt ni de PR non demandés. On ne fusionne jamais à sa place** : il vérifie sur
  son téléphone, sur la prévisualisation de la PR, avant de fusionner.
