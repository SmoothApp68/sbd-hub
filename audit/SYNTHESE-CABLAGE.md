# Synthèse transversale — audit de câblage, vagues 1 à 5

> **READ-ONLY.** Aucun code applicatif modifié. Aucune priorisation, aucune recommandation.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.
> Rapports de détail : `cablage-vague1-profil-v2.md` · `cablage-vague2-seances.md` ·
> `cablage-vague3-maison-coach.md` · `cablage-vague4-stats.md` · `cablage-vague5-social-jeux.md`.

---

## 1. COMPTEURS CONSOLIDÉS

| Vague | Surface | Inventoriés | Verdicts | Statuts runtime | États explorés |
|---|---|---|---|---|---|
| 1 | Profil (Corps, Réglages, RGPD) | 176 | 176 | 176 | 8 |
| 2 | Séances (Coach, Plan, GO, Log, Analyse) | 54 | 54 | 54 | 14 |
| 3 | Maison + Coach | 62 | 62 | 62 | 26 |
| 4 | Stats | 28 | 28 | 28 | 36 |
| 5 | Social + Jeux | 89 | 89 | 89 | 17 |
| | **TOTAL** | **409** | **409** | **409** | **101** |

**Le contrat N = N = N tient sur les 5 vagues.** Chaque table est vérifiée mécaniquement (générateur
qui lève une exception sur tout élément sans verdict, ou contrôle de numérotation 1..N sans trou).

### Provenance des éléments — pourquoi la méthode a dû changer

| Vague | markup statique | généré au runtime | % runtime |
|---|---|---|---|
| 1 · Profil | 160 | 16 | 9 % |
| 2 · Séances | 18 | 36 | **67 %** |
| 3 · Maison + Coach | 38 (dont 24 cartes sans `id`) | 24 | — |
| 4 · Stats | 26 | 2 | 7 % |
| 5 · Social + Jeux | 69 | 20 | 22 % |

Un `grep 'id="'` sur `index.html` — la méthode de la première tentative — aurait raté **67 % de
Séances** et **la totalité des cartes du Coach**. Trois extensions de méthode ont été nécessaires :

1. **Vague 1** : ajouter le markup injecté par `createElement` (7 sections, dont tout le RGPD).
2. **Vague 2** : inventorier **par le DOM réel**, l'app exécutée dans N états, plutôt que par le HTML.
3. **Vague 3** : recenser aussi les **cartes sans `id`**, par leur titre visible.

---

## 2. TOUS LES 🔴, REGROUPÉS PAR TYPE

C'est ce regroupement — et non le découpage par vague — qui fait apparaître les patterns.

### 2.1 🔴 RENDU INATTEIGNABLE (28 éléments, 8 causes distinctes)

| Cause | Éléments | Vague | Mécanisme |
|---|---|---|---|
| **Porte circulaire** | `settingsWeightCut` + 5 champs `wc-*` + `toggle-creatine` | 1 (F19) | La section n'apparaît que si `weightCut.active` est vrai, et ce flag n'est posé que par un bouton **situé dans la section**. L'autre déverrouillage (`goals` contient `'competition'`) n'est producible par **aucune UI** : les 6 ids d'objectifs sont les mêmes partout. |
| **`display:none` inline jamais retiré** | `acc-notif`, `push-status-label` | 1 (F3) | `toggleAcc` ne bascule qu'une **classe** ; `.acc-body` n'agit que sur `max-height`. Seul accordéon de la zone dans ce cas. |
| **Aucun appelant** | `tab-profil-badges`, `profil-badges-content` | 1 (F2) | `showProfilSub` ne reçoit **jamais** cette valeur (0 appel sur 16), et aucune pilule n'y mène. Forcé à la main → **s'affiche** : le markup fonctionne, c'est le parcours qui manque. |
| **Aucun appelant** *(même motif)* | `social-feed`, `social-leaderboard`, `social-challenges` | 5 (J3) | Aucune des 5 pilules n'y mène, mais `showFeedSub` (supabase.js:1672-1675) conserve leurs branches. |
| **Masquage en dur assumé** | `dashWeekCard`, `quickLogCard`, `perfCard`, `dashWeekContent` | 3 (H2) | `app.js:9397` les masque explicitement (« Maison v264 — anciennes cards remplacées »). **[VOULU]**, mais `renderPerfCard` continue de les alimenter. |
| **Bloc hérité masqué** | 14 conteneurs de `index.html:2469` | 3 (H6) | « IDs conservés pour compatibilité ». **6 sont encore alimentés** par du JS → du rendu calculé et jeté. |
| **Coefficient sans collecte** | `long_torso` de `JOINT_MORPHO_COEFFS` | 1 (F18) | Aucune UI ne produit cette clé morpho. |

### 2.2 🔴 DONNÉE MORTE — écrite, jamais lue (6)

| Champ | Écrit par | Vague |
|---|---|---|
| `db.user.targetBW` | `updateProfileField` (app.js:17831) — saisie utilisateur « Objectif poids de corps » | 1 (F13) |
| `db.user.coachEnabled` | migration seule (app.js:199) | 1 · confirmé en 5 |
| `db.user.navMode` | migration seule (app.js:236, `= 'A'`) | 1 · recoupé en 2 (G3) |
| `db.user.medicalConsentDate` | onboarding (app.js:3026, 3713) | 1 |
| `db.user._swipeResults` | swipe post-onboarding (app.js:11988) | 1 |
| `db.user.sportsConfig` | migration (app.js:248-252) | 1 *(❓ 1 lecture, dans son propre backfill)* |

**`targetBW` est le seul que l'utilisateur saisit lui-même.** Vérifié au runtime : `targetBW = 82`
persiste, et le texte de l'onglet Corps est **identique caractère pour caractère** avant/après.

### 2.3 🔴 CHAMP FANTÔME — lu, jamais écrit (7)

| Champ | Lecteurs | Repli | Vague |
|---|---|---|---|
| **`db.user.plannedTestDate`** | app.js:11784 | `Date.now() + 35 j` | 1 · **affiché** en 3 (H1) |
| `db.user.trainingDuration` | **6 sites, en tête de chaîne** | `params.duration \|\| 90` | 1 (F12) |
| `db.user.nutritionStrategyStartDate` | engine.js:1997-1998 | `weeksOnStrategy = 0` | 1 |
| `db.user.tdee` | app.js:15873, 16468 | le calcul | 1 |
| `db.user.streak` | index.html:4039 | `0` | 1 *(dans du code mort — cf. §3.4)* |
| `db.user.plan` / `betaExpiresAt` | `canUseAI` engine.js:5705-5706 | `'free'` | 1 (F8) — *alimenté par le blob cloud, pas par le code* |
| **`db.lastModified`** | `_computeDataHash` supabase.js:311 | constante `0` **dans la signature de sync** | 1 (F10) |

**`plannedTestDate` est le cas le plus visible** : l'écran d'accueil affiche « Test : 1 sept. » —
exactement aujourd'hui + 35 jours, vérifié par calcul, pour tout le monde, sans que personne ait fixé
de date.

### 2.4 🔴 CRASH — exception non rattrapée sur un parcours réel (2)

| Parcours | Exception | Vague |
|---|---|---|
| **Plan → « Appliquer ce jour au programme » → démarrer une séance** | `s.toLowerCase is not a function` (engine.js:1008 ← `matchExoName` ← app.js:28513) | 2 (G1) |
| **Social → Profil** (`renderFriendsTab`) | `Cannot read properties of null (reading 'style')` — `socialFriendsBadge` n'existe nulle part | 5 (J1) |

Le premier a une **conséquence croisée** : `renderCorpsTab` (onglet Corps, vague 1) casse aussi, parce
qu'il appelle `getProgExosForDay` pour son libellé de type de jour. Un bouton de la vague 2 casse une
surface de la vague 1.

### 2.5 🔴 AFFICHAGE e1RM — 4 surfaces (§7 de CLAUDE.md)

| Surface | Ce qui s'affiche | Vague |
|---|---|---|
| Accueil, « RECORDS PERSONNELS » | `SQUAT 145kg / 160` **et** `e1RM estimé : 158 kg` | 3 (H3) |
| Stats → Records | `🏋️ 145 kg` **et** `est. 158 kg e1RM` | 4 (I4) |
| Réglages → Correction des Records | `e1RM: 186kg` pour un deadlift dont le PR réel est **170** | 1 (F14) |
| Coach (cartes de progression) | e1RM en coulisse, non affiché en clair | 1-3 |

**[VOULU ?]** partout : l'étiquetage est explicite et distinct du PR. Le constat est posé, pas tranché.

### 2.6 🔴 PLAUSIBILITÉ — aucune borne (1, observé sur 2 surfaces)

Profil `donnees_sales` (`bestPR.squat = 315`, poids de corps 80 kg — saisie en lbs) :
Stats → Records affiche `🏋️ 315 kg · ×3.94 bw · est. 354 kg e1RM`, sans aucun signalement.
`recalcBestPR` (app.js:1759) accepte tout.

---

## 3. LES PATTERNS TRANSVERSAUX

Un même défaut répété sur plusieurs surfaces vaut plus qu'un cas isolé. En voici **six**.

### 3.1 — Le point d'entrée disparaît, le code reste

**4 occurrences, 3 vagues.** À chaque fois : un markup valide, un aiguillage encore présent, mais plus
aucun chemin utilisateur.

| Cas | Preuve |
|---|---|
| `tab-profil-badges` (v1) | 0 appel sur 16 à `showProfilSub` ; forcé à la main → **s'affiche** |
| `social-feed` / `-leaderboard` / `-challenges` (v5) | aucune des 5 pilules n'y mène ; `showFeedSub` garde ses branches |
| Weight Cut (v1, F19) | porte circulaire ; la section **fonctionne** une fois déverrouillée |
| `s-go` (v2, G3) | 5 sous-vues pour 4 pilules ; atteint par 9 appels programmés seulement |

**Le trait commun** : ce n'est jamais le rendu qui est cassé, c'est l'**accès**. Un audit statique
conclurait « câblé » dans les quatre cas — le runtime montre l'inverse.

### 3.2 — Deux stores pour un même concept

**7 occurrences, 3 vagues.** Aucun n'est faux isolément ; c'est leur cohabitation qui produit l'écart.

| Concept | Store A | Store B | Conséquence mesurée |
|---|---|---|---|
| Calories (v1, F4) | `calcCalorieCible` (kcalBase/bwBase) | `calcTDEE` | **2300 vs 2672 dans la même carte** ; après manipulation, 3675 vs 2672 |
| Blessures (v1, F5) | `db.user.injuries` (objets, 4 niveaux, 7 zones) | `programParams.injuries` (chaînes, binaire, 6 zones) | Niveau 2 sur « Genoux » dans l'une → l'autre reste vide |
| Cycle (v1, F6) | `db.user.cycleTracking` | `menstrualEnabled` + `menstrualData` | `getCycleCoeff = 1`, MRV inchangé, **mais** SRS = 5 |
| Activités (v1, F7) | `db.user.activities` | `activityTemplate` **et** `secondaryActivities` | **3** stores ; la branche Katch-McArdle lit le 3ᵉ |
| Premium (v1, F8) | `db.user.plan` (lu par `canUseAI`) | `db.user.tier` (écrit par le serveur) | Le gate IA ne consulte pas le champ que le serveur alimente |
| Composition de séance (v2, G2) | `db.routineExos` | `db.weeklyPlan` | Un plan complet peut produire une séance **vide** |
| Cardio (v4, I1) | `logs` + `activityLogs` (sous-onglet Cardio) | `logs` seuls (ligne Cardio de « Volume par Muscle ») | Une natation compte dans l'un, pas dans l'autre |

### 3.3 — Le repli masque l'absence

**7 champs fantômes, tous silencieux** parce qu'un `|| valeur` fait tourner le code sans erreur :
`plannedTestDate → +35 j` · `trainingDuration → params.duration` · `tdee → le calcul` ·
`nutritionStrategyStartDate → 0` · `plan → 'free'` · `lastModified → 0` · `bwBase || 98` (contre un
défaut de **80** dans `defaultDB`).

Le plus coûteux est `trainingDuration` : lu **en tête** de `A || B`, un fantôme non vide **écraserait**
le réglage de l'utilisateur sur 6 sites. Vérifié : avec `trainingDuration = 45` et `duration = 90`,
l'interface affiche **1h30** et l'algorithme utilise **45**.

### 3.4 — La promesse d'interface que le code ne tient plus

**3 occurrences.** Un texte visible annonce un comportement que le code ne produit pas.

| Texte affiché | Réalité |
|---|---|
| « Retirer ton consentement désactivera les modules HRV, FC repos et suivi menstruel » (app.js:1601) | **Aucun des trois** ne teste `consentHealth` (v1, F15) |
| « Les exercices affichés dans la rubrique **Performance sur l'accueil** » (index.html:2965) | `perfCard` est masqué en dur depuis v264 (v3, H2) |
| « 🩹 Blessure notée. Le Coach adapte ta prochaine séance » (app.js:15005) | Pousse un **nom d'exercice** dans un tableau d'objets `{zone, level}` ; les consommateurs l'ignorent (v1, F5) |

### 3.5 — La divergence de TYPE sur un store à écrivains multiples

**Le 9ᵉ piège, découvert en vague 2.** `db.routineExos` reçoit des **chaînes** de `saveRoutine`
(app.js:3984) et de la génération guidée (14084), mais des **objets** de `wpApplyDay` (27379) et
`wpApplyAll` (27391). Aucun n'est faux isolément ; le lecteur (`matchExoName`) casse sur le second.

C'est le seul crash **déclenché par un bouton normal** trouvé par l'audit.

### 3.6 — La définition dupliquée

**Le 8ᵉ piège.** `renderTierSection` existe dans `js/app.js:17742` **et** dans un `<script>` inline
d'`index.html:4012`. Les blocs inline s'exécutent au parsing, les `defer` après : **`app.js` gagne**.
La version d'`index.html` — avec ses badges de réussite — est morte, ainsi que `getWelcomeMessage`,
`getAchievementBadges`, `renderAchievementBadges`.

---

## 4. LES CHAMPS NON SIGNÉS PAR LA SYNCHRONISATION

Liste complète dans `audit/CHAMPS-NON-SIGNES.md`. Résumé :

`_computeDataHash` (supabase.js:261-312) signe **14 termes**. Le blob poussé est pourtant **`db`
entier moins `logs`**. Les clés suivantes sont donc **transportées mais non signées** — leur
modification ne déclenche **aucun push** :

| Store | Vérification runtime |
|---|---|
| **`db.body`** (macros) | signature **inchangée**, **0** écriture `sbd_profiles`, alors que la donnée **est** persistée en local (contrôle explicite : `prot 216→210, carb 250, fat 85` en mémoire **et** en `localStorage`). *Le poids échappe au problème : `saveBodyEntry` écrit aussi `db.user.bw`, signé.* |
| **`db.keyLifts`** | signature inchangée, 0 écriture |
| **`db.routine`** / **`db.routineExos`** | signature inchangée, 0 écriture |
| **`db.gamification.*`** hors `xpHighWaterMark` et `earnedBadges` — `unlockedTitles`, `activeTitle`, `questHistory`, `questStreak`, `secretQuestsCompleted`, `seenBadges`, `smartStreak`, `smartStreakRecord`, `lastTab` | non signés (lecture des 14 termes) |
| **`db.lastModified`** | vaut `undefined` avant **et** après une modification → contribue une **constante `0`**. Le champ réellement horodaté est `db.updatedAt`, non signé. |

**Hors périmètre** (cas distinct, pas « non signé ») : `activeWorkout` — la séance **en cours** vit
dans une variable globale + `localStorage['SBD_ACTIVE_WORKOUT']`, **hors `db`** et **hors blob**. Une
séance interrompue ne quitte jamais l'appareil. À la fin de séance en revanche, tout est correct :
`db.logs` +1, signature qui change, brouillon effacé.

*Déjà corrigés (PR #245) : `db.user`, `db.weeklyPlan`, `db.bestPR` signaient leur **longueur**.*

---

## 5. FONCTIONNALITÉS ENTIÈREMENT INACCESSIBLES

Du travail développé, présent dans le code, et qu'aucun utilisateur ne peut atteindre.

| Fonctionnalité | Ampleur | Pourquoi inaccessible |
|---|---|---|
| **Weight Cut** | **50 références** dans le code (LPF, blocage APRE, Kill Switch compétition — CLAUDE.md §8 points 6, 10, 11) + `takesCreatine` (engine.js:4119) | Porte circulaire (v1, F19). La section **fonctionne** une fois déverrouillée : `wc-current-weight` 98 → 96,2 survit au reload. |
| **Notifications Push** | 1 section, 1 bouton d'abonnement | `display:none` inline jamais retiré (v1, F3) |
| **Sous-onglet Badges du Profil** | Recopie de `tab-game` | Aucun appelant, aucune pilule (v1, F2) |
| **`renderTierSection` version `index.html`** | Badges de réussite + `APP_THEMES` + 3 helpers | Écrasée par la définition d'`app.js` (v1, F9) |
| **`db.keyLifts` → rubrique Performance** | Jusqu'à 6 exercices configurables | Conteneur masqué en dur depuis v264 (v3, H2) |
| **3 sous-sections Social** | `renderFeed`, `renderLeaderboard`, `renderChallengesTab` encore aiguillées | Aucune pilule (v5, J3) |
| **Coefficient morpho `long_torso`** | 1 coefficient (hanches ×1.1) | Aucune UI ne collecte la clé (v1, F18) |

---

## 6. CE QUI N'A PAS PU ÊTRE VÉRIFIÉ

| Angle mort | Portée | Raison |
|---|---|---|
| **Aucun device Android réel** | les 5 vagues | Le banc exécute Chromium à 390×844, Service Worker **bloqué**. Perfs, Chart.js asynchrone et SW actif ne sont pas couverts. |
| **Réseau Supabase stubbé** | surtout vague 5 | **19 des 89 éléments** de Social dépendent d'une lecture réseau → ⊘ NON TESTABLE assumé. C'est la vague la moins couverte. Contrainte volontaire : ne jamais toucher aux vraies données. |
| **Aucune donnée Supabase consultée** | les 5 vagues | Pas d'accès (CLAUDE.md §2). **17 questions** sont formulées avec leur requête, en fin de chaque rapport de vague. |
| **Capteurs** | v2 (`go-fc-widget`), v1 (`settingsHealthConnect`) | Bluetooth / Garmin hors banc |
| **Justesse des chiffres** | v3, v4 | L'audit vérifie que la sortie **dépend** de l'entrée, pas qu'elle soit **correcte** — c'est l'objet des audits 01-03. |
| **Graphiques Chart.js** | v4 | Vérifiés comme conteneurs rendus, pas comme courbes justes (canvas non lu). |
| **Import Hevy / CSV** | v1 (#109-111, #115-117) | Mes échantillons n'ont pas été parsés ; les chemins de révélation existent dans le code. |

### Quatre suspicions que j'ai RÉFUTÉES

Je les liste parce qu'elles auraient fait quatre faux findings.

| Suspicion | Ce qui l'a levée |
|---|---|
| « Des cartes du Coach ne s'affichent jamais » (v3) | Sur **26 états**, les 24 cartes apparaissent toutes au moins une fois. « 📐 Analyse morphologique », que CLAUDE.md dit « jamais branchée », **se rend** derrière « Voir plus ». |
| « Le sous-onglet Cardio affiche *Aucune session* pour tout le monde » (v4) | Défaut de **mon** test : je ne gardais que la première valeur par `id`, donc le **placeholder statique**. Le rendu est correct. |
| « `mg-6` (ligne Cardio) est structurellement mort » (v4) | Il se remplit dès qu'une séance contient un exercice cardio. Vide sur mes 9 profils parce qu'**aucune fixture** n'en porte. |
| « Le quiz archétype est peut-être inatteignable » (v5) | Il fonctionne : 7 questions, overlay 844 px. Mon test cherchait `.modal-overlay` au lieu de `#classQuizOverlay`. |
| *(v1)* « Le rognage par `max-height:5000px` tronque les Réglages » | Mesuré : `clientHeight = scrollHeight = 3531 px`. **Rien n'est rogné.** |

### Défauts de mon propre banc, corrigés en cours de route

Documentés dans chaque rapport, parce qu'ils ont d'abord produit de faux résultats et que le lecteur
doit pouvoir juger de la fiabilité du reste :

1. `db` est un `let` de portée lexicale globale — **pas** sur `window` (v1).
2. `addInitScript` rejoue à **chaque** navigation : sans sentinelle, un `reload()` réécrase le profil
   et les 26 tests d'aller-retour échouent pour une raison qui n'appartient pas à l'app (v1).
3. La garde anti-fuite RC4 **purge** un blob dont l'`ownerUid` ne correspond pas à la session —
   comportement **correct** de l'app. Toutes les passes de la vague 1 ont été **rejouées** après
   tatouage des fixtures ; c'est cette correction qui a **inversé** le résultat de persistance de F1.
4. Capture de la sous-section inactive → 20 faux invariants en vague 4 (corrigé).
5. Sélecteur d'overlay erroné → fausse conclusion sur le quiz en vague 5 (corrigé).

---

## 7. NOTES FACTUELLES SUR CLAUDE.md

Divergences relevées entre le fichier et le code réel (le code fait foi) :

| CLAUDE.md | Code réel |
|---|---|
| §11 : `db.user.mode` (discipline) | **N'existe pas** — 0 écriture, 0 lecture. Le champ réel est `db.user.trainingMode` (10 écritures, 61 lectures, lu par `getMode`). |
| §11 : `level` ∈ `debutant\|intermediaire\|avance` | Le sélecteur propose une **4ᵉ** valeur : `competiteur` (index.html:2763-2768). |
| §17 : « `npm test` n'a jamais tourné (`node_modules` absent) » | **`node_modules` est présent.** `npm test` tourne : **51 suites, 817 tests verts**. |
| Backlog post-bêta §1 : « Analyse morphologique … jamais branchée » | Elle **se rend** (v3, H4), derrière « Voir plus ». |
| §17 fix #5 : garde `renderFriendsTab` | **Confirmé au runtime** (v5, J1) : l'exception se produit bien. |
| §17 fix #2 : source calorique unique | **Confirmé et resserré** (v1, F4) : les deux chiffres sont dans la **même carte**, pas sur deux écrans. |

---

**Aucune modification de code applicatif n'a été faite sur les 5 vagues.**
Contrôle à chaque commit : `git diff --name-only origin/main..HEAD -- js/ index.html service-worker.js tests/` → **vide**.
