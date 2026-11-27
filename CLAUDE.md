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

**TrainHub** = nom **produit**. **SBD Hub** = nom du **repo** (`SmoothApp68/sbd-hub`, **public** — constaté le 16/11/2026 par `gh api` ; la visibilité est une décision d'Aurélien, jamais la tienne ; aucune clé secrète n'y est écrite, mais des identifiants d'utilisateurs y figurent encore : ne jamais y ajouter de donnée personnelle). Ne pas les opposer.

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

0. **Ne jamais pousser sur `main`.** Un ruleset GitHub « protect main » est actif (PR obligatoire, pas de force-push, pas de suppression) mais il n'exige AUCUN contrôle vert (constaté le 16/11/2026) : une PR pourrait être fusionnée sans que le banc ait fini, donc la coche `banc-sequentiel` se lit à la main avant toute fusion. Toute livraison passe par une PR, ouverte en brouillon ; seul Aurélien fusionne.
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

- **Toute nouvelle règle du coach se branche sur `planDeSeance`** (`v2/js/plan.js`) et passe les invariants de `verifierPlan` (I1 à I272, I281, I282 ; I272 depuis « Les chutes », MOTEUR §9.2 ter : le plancher de la dernière série ; I168 est celui de la reprise d'une séance, MOTEUR §9.49). **Aucun écran ne calcule une décision du coach** : il lit le plan. Le registre des invariants (numéro, résumé, fonction qui le vérifie, section MOTEUR, date ; numéros réservés, retirés et trous) vit dans [`v2-atelier/specs/REGISTRE-INVARIANTS.md`](v2-atelier/specs/REGISTRE-INVARIANTS.md), avec le texte d'origine. **Le prochain numéro libre (I283 au 27/11/2026 ; I273 à I279 réservés) se vérifie sur `main` ET sur les PR ouvertes** avant d'en prendre un ; les définitions sont dans MOTEUR, §9.13 bis et la section de chaque règle.
- **Le recul raté et le jour sans** (20/11/2026, MOTEUR §9.39 (6), §9.28 et §9.42 bis, I255) : un zéro à ou sous la charge de travail ouvre UN jour sans, neutre pour la suite ; un recul « manquée » garde son type et reste hors volume et stagnation. Une seule fonction, `Moteur.consigneApresUnZero` (`jourSansDe`) ; vérifié par `Plan.verifierJourSans` ; le détail est dans MOTEUR. Depuis le 25/11/2026 (yo-yo du zéro) : le jeton n'est relevé que par une séance ordinaire réussie, jamais par le retour imposé, et une règle B le consomme.
- **Un seul repos conseillé** (20/11/2026, MOTEUR §9.52, I256 à I266) : UNE fonction, `Moteur.reposConseilleDeBase` (sous `GARDEES`), calcule le repos de la molette ; le plan l'expose (`x.reposConseille`), l'écran le lit et n'arme jamais le minuteur ni n'écrit. Les durées passent par `Modele.secondes` / `mmss`. Le détail est dans MOTEUR.
- **Une seule montée de chauffe** (20/11/2026, MOTEUR §9.15, §9.15.5, §9.17 et §9.41 delta, I244 à I250) : UNE fonction, `Moteur.monteeDeChauffe` (sous `GARDEES`), calcule toute montée (routine, coach, proposition, « + Chauffe », « peu de temps »). `routine_exercises.chauffes_du_coach` est une colonne FACULTATIVE (migration Claude.ai). Vérifiée par `verifierLaMontee` (`plan.js`) et `tests/unit/v2-chauffes-une-montee.test.js` ; le détail est dans MOTEUR.
- **Une série à 0 rep, une seule réaction** (19/11/2026, MOTEUR §9.39 et §9.42 bis, I236 et I237) : toute série validée à 0 rep avec une charge > 0 (`Modele.estZeroDeTravail`) a SA réaction Z1 / Z2 (`Moteur.reactionAuZero`), la même partout ; aucune fourchette ni « garde » sous un 0 rep. Le détail est dans MOTEUR.
- **La garde d'architecture** : `tests/unit/v2-architecture.test.js` lit le source de
  `v2/js/` et `v2/index.html`. Une fonction de calcul du coach (liste `GARDEES`) ne
  s'appelle que depuis son module, `plan.js`, ou un fichier inscrit pour elle dans
  `AUTORISATIONS` **avec sa raison** (depuis 181, une autorisation peut être **par fonction appelante** : un objet `{ fonction: raison }` à la place de la raison, comme pour `consigneDExercice` ; les dégels de consigne d'`app.js` sont listés et un septième échoue). L'élargir est un geste conscient, dans une PR
  qui le justifie — jamais un contournement silencieux. Une entrée sans appel fait
  aussi échouer le test : la liste dit ce qui est. **Depuis le 17/10/2026 (124, audit 06 #5)**, toute
  fonction de `moteur.js` lue hors du moteur et du plan doit être inscrite — dans `GARDEES` (une décision
  du coach) ou au registre `NOTIONS` (un fait, un format, avec ses lecteurs) : sinon la garde échoue.
- **Un seul formateur** (MOTEUR §9.51 quater, I197 à I201) : un poids, un volume, un pourcentage, un jour, une durée s'écrivent par UNE fonction de `v2/js/modele.js` (`kgTexte`, `kgListe`, `tonnesTexte`, `pourcentTexte`, `jourDit`, `quantieme` — « 1er » seulement le 1er du mois —, `dureeEnMinutes`) ; jamais un suffixe « kg » ou « t », un `Math.round(x * 10) / 10` d'affichage ni un `getDate()` suivi d'un mois écrits à la main (garde NOTIONS `interditAilleurs`, exceptions motivées). ⚠️ Arrondi d'affichage ≠ arrondi de calcul : ces fonctions rendent du texte, aucune ne touche un calcul. Dette notée : les phrases du coach de `moteur.js` (« 33 % », « kg. ») et leurs fixtures de simulateur, les pluriels (F-16), les zones (F-06).
- **Ta semaine et tes équilibres** (188-1, MOTEUR §9.27) : `v2/js/equilibres.js` (`THEquilibres`) est pur ; l'écran lit l'analyse et ne calcule rien. Les gestes d'une séance s'écrivent par `Seance.noterGeste`, jamais ailleurs ; les réponses aux cartes par la file (`poserProfil`). Aucune cause n'est devinée, aucune règle ne fixe un nombre de séries ; une proposition passe par le chemin des routines et s'annule.
- **La routine apprend de tes gestes** (16/11/2026, MOTEUR §9.27 quater, I208 à I213 et I217 à I219) : dans `equilibres.js`, UN décompte (`gestesRecurrents` ← `gesteDeLExercice`, `decompteDuGroupe` ; registre `NOTIONS`), au même rôle (`Routines.roleDansLaRoutine`) sur toutes les routines ; l'écriture sur un geste est relue par `Equilibres.verifierRetrait`, « Annuler » rend tout. Vérifié par `Equilibres.verifierGestes`, jamais par `verifierPlan`. Le détail est dans MOTEUR.
- **« Le coach te dit » sur l'accueil** (16/11/2026, MOTEUR §9.27 Placement, I214 et I215) : UNE carte, choisie par `Equilibres.carteDeLAccueil` (le même objet que dans « Ton parcours »). Vérifié par `Equilibres.verifierCarteDeLAccueil` et `tests/unit/v2-coach-accueil.test.js`. Le détail est dans MOTEUR.
- **Un seul mois** (PR B de « un seul max et un seul mois », 15/11/2026, MOTEUR §9.51 ter, I178 et I194 à I196) : « il y a / dans N mois » est une DATE et ne se calcule que par `v2/js/periode.js` (`THPeriode`) ; une DURÉE reste en jours et se nomme (`THPeriode.JOURS_DE`). **Garde** (`v2-architecture.test.js`) : aucun `setMonth`, `setFullYear` ni `getMonth() ± k` (k ≥ 2), aucune durée de mois ou d'année littérale hors de `periode.js`. `periode.js` se charge AVANT `moteur.js` (`index.html`, bancs, tests). Le détail est dans MOTEUR.
- **« Sans coach cette fois » par exercice** (MOTEUR §9.41 ter, I202 et I203) : la marque `sans_coach` est DISTINCTE de la douleur ; `Seance.occurrenceSansCoach` est LE prédicat du silence et de la neutralité, `Seance.marquerSansCoach` la pose, aucune lecture directe de `.sans_coach` hors `seance.js` (garde d'architecture, `NOTIONS`). La colonne `sets.sans_coach` est facultative tant que la migration (Claude.ai) n'est pas passée. **La réponse « Sans coach cette fois » de la carte de reprise (§9.20) pose cette même marque, jamais `douleur`.**
- **Essayer la marche** (16/11/2026, MOTEUR §9.17 bis delta, I49 réécrit, I220 à I223) : en reps, « Essayer <marche> » REMPLACE les séries restantes (`Seance.essayerMarche`), « Annuler » les remet ; la routine ne change qu'en fin de séance, marche tenue (`Moteur.marcheTenue`), sur « Oui ». Le détail est dans MOTEUR.
- **La tête d'un exercice : 3 + 1** (21/11/2026, chantier « Simplifier » pilote, ECRAN-SAISIE §7 quinvicies quater, MOTEUR §9.53, I269 à I271) : l'en-tête d'un exercice porte au plus trois éléments et UNE carte de décision à la fois (`x.file`, `Plan.tetesDuPlan`) ; la ligne grise est la forme COURTE écrite par le moteur (`Moteur.grisCourt`), jamais coupée par `rendu.js`. Aucune décision du coach ne change. Vérifié par `Plan.verifierTete`, `tests/unit/v2-simplifier-3plus1.test.js` et `tests/banc/tete-3plus1.js`.
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
- **Les coupures de reps** (PR A, MOTEUR §9.51 quinquies) : une série se DÉCRIT par ses reps par `Modele.bandeDeReps` / `libelleDeBande` / `estSerieLourde` (`COUPURES_DE_REPS` : ≤ 5 · 6 à 8 · 9 à 12 · 13+), jamais par un littéral recopié (garde `NOTIONS`, exceptions nommées : plan (PR B) et bilans (PR C) retirées, faits à retirer en PR D) ; la prescription (`ZONES`, `RANGEMENT`) ne la lit pas, `v2-coupures-de-reps.test.js` les relie. Le profil de reps du bilan lit les quatre bandes (§9.51 sexies : « Surtout muscle, 9 à 12 reps. »).
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

- **Aurélien = `aurel_br`, `user_id 6e2936e7…`.** Autres comptes réels : Léa (`9ed88c34…`),
  Jordan (`0f1a1bf5…`), Alexis (`430d35d6…`), Mélodie (`ea326c88…`). Toute action sur leurs données passe par
  **Claude.ai** (§2) ; ses données de référence se lisent dans la base, pas ici.
- Il délègue l'architecture et le coaching (« c'est toi le coach ») **mais** attend une **recommandation claire, avec
  son raisonnement**, pas des questions ouvertes. Il valide maquettes et specs avant l'implémentation.
- **Un chantier à la fois. Pas de prompt ni de PR non demandés. On ne fusionne jamais à sa place** : il vérifie sur
  son téléphone, sur la prévisualisation de la PR, avant de fusionner.
