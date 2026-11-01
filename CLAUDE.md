# CLAUDE.md — SBD Hub / TrainHub

> Constitution du dépôt, lue à chaque session. Respecte-la sauf instruction explicite contraire d'Aurélien.
> **Fichier vivant — tiens-le à jour quand une convention ou une valeur du code change.**
> Fusion de l'ancien « Contexte Complet TrainHub » (détail algos/données/historique) et de la constitution
> « SBD Hub » (état v349). En cas de conflit : **le code est la source de vérité, pas ce fichier.**
> Les valeurs marquées `[À VÉRIFIER]` n'ont pas été confirmées par grep — re-grep avant de t'y fier.

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
1. **Claude.ai (chat + MCP Supabase)** — fait **TOUT** ce qui touche Supabase : SQL, migrations, vérif des données, RLS. Diagnostics data + décisions coaching (avec Gemini) vivent là.
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

### La chaîne à 4 voix (coaching/algo)
Claude.ai (data Supabase) → toi, Claude Code (implémentation) → Gemini (validation coaching/seuils) → Aurélien (décision finale + vérif device). Ne court-circuite ni Gemini ni la vérif device sur les sujets de coaching.

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
  et passe les invariants de `verifierPlan` (I1 à I113 — I113 depuis 202, la douleur répétée (MOTEUR §9.20 : à 2 séances avec douleur ou plus, « Plus léger » avant « Comme avant » et la phrase du kiné ; I90 vérifie aussi le défaut prudent de la semaine de test, §9.32) ; I110 à I112 depuis 197, forme et santé (MOTEUR §9.36 : la consigne de puissance seulement à 65 ans et plus connus, l'exercice de puissance dans la séance, léger et hors zone à ménager, aucune promesse médicale) ; I107 et I108 depuis 198, la baisse attendue en sèche (MOTEUR §9.34) ; I105 et I106 depuis 196, le rest-pause (MOTEUR §9.33) ; I100 et I104 depuis 195, la calisthénie (MOTEUR §9.35 : une marche d'habileté seulement en objectif calisthénie ; jamais « Au max » sur une figure) ; I101 à I103 (figures, zone coude/épaule, barre de traction) sont vérifiés dans `Generateur.verifierCalisthenie` ; I88 à I93 depuis 193-4, la semaine de test (MOTEUR §9.32 : trois essais au plus, une barre testée par séance, les pourcentages du max estimé, aucun « Au max », l'arrêt, le max mesuré et son pari) ; I94 à I98 depuis 194-1, la mobilité en fin de séance (MOTEUR §9.31) ; I99 depuis 193-6b, l’échec sur une barre une fois par semaine (MOTEUR §9.30 bis) ; I83 à I86 depuis 193-6, la dernière série « Au max » (MOTEUR §9.30 ; I87 est vérifié dans `faits.entreeFatigue`) ; I79 à I81 depuis 193-3, l'ondulation (MOTEUR §9.29) : une zone de plan n'est jamais remplacée en silence, une première fois dans une zone donne le report, un exercice à zone de plan est hors bloc ; I78 depuis 193-1, la série de recul (MOTEUR §9.28) ; I77 depuis 189, la fatigue sur plusieurs semaines (MOTEUR §14.11) ; I76 depuis 188-2, la ligne du repos long au Pourquoi ; I72 à I74 depuis 187, le calage de la première séance, et I75, la zone à ménager lue en séance ; I71 depuis 186, le dépassement ; I70 depuis 180, la marche d'en dessous ; I68 et I69 depuis 175, le « I67 » du prompt 175 étant déjà pris par la 174 —, tous vérifiés depuis le 16/10/2026 — I5 manquait ; I49-I50 depuis 127, I51 depuis 132, I52-I55 depuis 149, I56-I58 depuis 154, I59-I60 depuis 165, I61 depuis 163, I62-I64 depuis 169, I65-I67 depuis 174, I68-I69 depuis 175 ; leurs définitions sont dans MOTEUR, §9.13 bis et les sections de chaque règle). **Aucun écran ne calcule une
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
- **Le module des faits** (58-1) : l'assemblage des faits (séances et séries, records d'une séance,
  d'un mois, du jour, le dernier record, la semaine affichée, les exercices faits) vit dans
  `v2/js/faits.js`, avec ses mémos ; les écrans — et le jeu — le **lisent**, aucun autre fichier ne
  déclare un de ces faits (garde « un fait ne se déclare que dans `faits.js` », registre `NOTIONS`).
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
