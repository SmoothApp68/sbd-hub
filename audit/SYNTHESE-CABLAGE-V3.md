# Synthèse — audit de câblage v3 (inventaire par UNION), **les 5 vagues**

> **READ-ONLY.** Aucun code applicatif modifié. Aucune priorisation, aucune recommandation.
> Date : 29/07/2026 · Base : `origin/main` = `a1c2444`.
> Rapports v2 **conservés**. Rapports v3 : `cablage-vague2-seances-v3.md`, `cablage-vague3-v3.md`,
> `cablage-vague4-v3.md`, `cablage-vague5-v3.md`.

---

## 1. COMPTEURS ET COMPARAISON v2 → v3

| Vague | Estimation | **v2** | **v3** | dont ids | dont blocs | A∩B | **A seul** | B seul | États |
|---|---|---|---|---|---|---|---|---|---|
| **1 · Profil** | 256 | **176** | **260** | 210 | 50 | 183 | **3** | 24* | 17 |
| 2 · Séances | 113 | 54 | **131** | 91 | 40 | 50 | **41** | 0 | 14 |
| 3 · Maison + Coach | 90 | 62 | **53** | 43 | 10 | 29 | **9** | 5 | 26 |
| 4 · Stats | 85 | 28 | **50** | 32 | 18 | 28 | **4** | 0 | 36 |
| 5 · Social + Jeux | 130 | 89 | **129** | 97 | 32 | 72 | **25** | 0 | 17 |
| **Total** | 674 | **409** | **623** | 473 | 150 | 362 | **82** | 29 | 110 |

**+214 éléments, soit +52 %.** L'écart de méthode n'était marginal sur aucune vague.

\* Les 24 « B seul » de la vague 1 ne sont pas des générateurs ratés : ce sont des éléments de
**l'onglet Jeux**, présents dans le DOM du Profil parce que `showProfilSub('tab-profil-badges')` fait
`badgesContainer.innerHTML = gameEl.innerHTML` (app.js:4205) — il **duplique l'onglet Jeux entier**.
Avec 17 blocs de même origine, **41 éléments sont marqués hors périmètre** ; périmètre Profil net : 219.

### Ce que la v3 apporte à la vague 1

La vague 1 croisait déjà markup + runtime — d'où Weight Cut, et **aucun nouveau 🔴 n'apparaît** : ses
3 « A seul » ont tous un point d'entrée réel. Le gain est ailleurs :
- **+34 éléments à `id`** (176 → 210) : le **contenu** des 7 sections injectées, jamais détaillé en v2 ;
- **+50 blocs sans `id`**, dont les **35 boutons de réglage** (objectifs, fréquence, jours, matériel,
  durée, supersets, blessures, cardio) et les **19 entrées du Glossaire** — deux zones que la v2
  listait explicitement comme « non auditées champ par champ ».
- Un générateur entier retrouvé : l'éditeur de routine (`renderSettingsRoutineEditor`, 5 familles ×
  7 jours), invisible à la source A tant que le motif `id="prefixe-${var}"` n'était pas détecté.

⚠️ **La vague 3 baisse (62 → 53)** : ce n'est pas une régression. La v2 y recensait les cartes du Coach
**par leur titre visible** (24 titres) ; la v3 les recense par **signature de classe** (10 signatures).
La granularité diffère — les deux comptes sont valides, ils ne mesurent pas la même chose. C'est la
seule vague où les deux méthodes ne sont pas directement comparables, et je le signale plutôt que de
présenter une fausse progression.

### L'auto-contrôle a-t-il servi ?

| Vague | Écart initial | Verdict | Ce qu'il a fait trouver |
|---|---|---|---|
| 2 | −19 % | ✔ cohérent | — |
| 3 | **−52 %** | ⚠️ déclenché | **2 vrais défauts** : zone HTML trop étroite (conteneurs Coach dans le markup de Séances) et générateur manquant (`buildCheckinFormHtml`). Puis : erreur d'unité dans mon estimation. |
| 4 | **−62 %** | ⚠️ déclenché | **Le recensement des blocs sans `id`** — 18 éléments que ni la v2 ni l'inventaire d'ids v3 ne voyaient. C'est exactement le signal « Stats = 28 » qui a motivé cette reprise. |
| 5 | −25 % | ✔ cohérent | — |

**Le contrôle a été utile deux fois sur quatre, et sur les deux vagues les plus suspectes.** Il a aussi
révélé une faiblesse de ma propre estimation : je comptais des *instances* (12 jauges, 7 groupes
musculaires, 10 lignes de lift) là où la règle de comptage collapse en *familles*.

---

## 2. CE QUE LA MÉTHODE PAR UNION A TROUVÉ ET QUE LE DOM SEUL AVAIT MANQUÉ

**79 éléments « A seul »** — présents dans le code, jamais rendus sur les 93 états testés. La v2 ne
pouvait structurellement pas les inventorier, donc pas leur donner de verdict.

### 2.1 🔴 Rendus dans un conteneur masqué — **4 éléments, CONFIRMÉS**

| Élément | Produit par | Conteneur cible |
|---|---|---|
| `prog-chev<n>`, `prog-body<n>` | `renderProgramViewer` app.js:15073-15074 (**5 appelants réels**) | `programViewer` — bloc `display:none` d'`index.html:2469`. Et `programViewerCard`, cherché à app.js:15056, **n'existe nulle part**. |
| `chartPerfDash`, `chartPerfLine` | `renderPerfCard` app.js:9977, 10051 (**4 appelants**) | `perfCard` — masqué en dur par `app.js:9397` depuis v264 |

**C'est le gain le plus net de la reprise.** Les vagues v2 avaient trouvé les *conteneurs* masqués
(vague 3, H2 et H6) ; l'union montre **ce qu'on continue d'y dessiner** : un viewer de programme
complet et **deux graphiques Chart.js**, recalculés à chaque rendu, dans des zones qui ne peuvent pas
s'afficher.

### 2.2 ✅ Overlays et panneaux à ouverture explicite — **~40 éléments**

Recherche d'exercice GO (9), calculateur de galettes (4), bibliothèque d'exercices (2), assistant GO (2),
ajustement de séance, import CSV Garmin, glossaire, édition d'objectif inline, sélecteur de photo,
modale DOMS, modale de titres, dialogue de suppression de compte (3), modale de défi (3)…

**Verdict : ✅ CÂBLÉ (conditionnel).** Ils ne sont pas inatteignables — **mes états ne les ont pas
ouverts**. C'est une limite de couverture, pas un défaut de l'app. Mais **la v2 les omettait purement
et simplement de l'inventaire** : ils n'avaient aucun verdict, ni bon ni mauvais.

### 2.3 ⊘ Conditions hors banc — **~30 éléments**

Cartes de feed v1 et v2, commentaires, réactions, menus contextuels, profil social (vague 5) : tous
dépendent d'une **lecture réseau**, stubbée par construction. Capteur FC Bluetooth (`go-hr-display`),
PR battu (`prOverlayB`), check-in déjà saisi, sauvegardes de programme existantes.

**Correction d'un constat que j'avais posé à tort.** J'écrivais que la chaîne RGPD n'avait jamais été
rendue. **C'est faux, et la vague 1 v3 le corrige** : un clic réel sur « 🗑️ Supprimer définitivement
mon compte » ouvre bien sa modale de confirmation. J'avais conflaté **deux chaînes distinctes** —
`requestAccountDeletion` (app.js:1862, suppression de compte RGPD, via `showModal`) et
`showAccountDeletionDialog` (supabase.js:4336, « Quitter la communauté » : effacement **ou**
anonymisation du profil *social*, via les ids `del-*`). **Les deux se rendent** (vérifié).
Ce qui reste non testé : le comportement **au-delà** de la confirmation (Edge Function `delete-account`,
`_deleteAccountDecision`, purge locale) — il faudrait une vraie suppression sur un compte jetable.

### 2.4 ❓ Non tranchés — **5 éléments**

`phasePill`, `phaseDropdown` (`renderProgramTab`, 5 appelants internes, aucun handler direct trouvé),
`frt<n>` (`buildGoIdleHtml`), et 2 autres. Je ne conclus pas.

---

## 3. TOUS LES 🔴, REGROUPÉS PAR TYPE

*(Cumul v2 + v3 sur les vagues 2 à 5. Les 🔴 de la vague 1 sont dans `SYNTHESE-CABLAGE.md`.)*

### 3.1 Rendu inatteignable

| Cause | Éléments | Source |
|---|---|---|
| **Rendu dans un conteneur masqué** | `prog-chev<n>`, `prog-body<n>`, `chartPerfDash`, `chartPerfLine`, `div.perf-card-title` | **v3 (union)** |
| **Conteneur masqué en dur** | `dashWeekCard`, `quickLogCard`, `perfCard`, `dashWeekContent` + 14 conteneurs hérités | v2 |
| **Aucun appelant** | `social-feed`, `social-leaderboard`, `social-challenges` | v2 |

### 3.2 Crash sur un parcours réel

| Parcours | Exception | Source |
|---|---|---|
| Plan → « Appliquer ce jour » → démarrer une séance | `s.toLowerCase is not a function` — et **`renderCorpsTab` casse aussi** | v2 (G1) |
| Social → Profil | `Cannot read properties of null (reading 'style')` — `socialFriendsBadge` inexistant | v2 (J1) |

### 3.3 Champ fantôme affiché

`plannedTestDate` → « Test : 1 sept. » sur l'accueil = aujourd'hui + 35 jours, pour tout le monde (v2, H1).

### 3.4 Affichage de l'e1RM — **6 surfaces** (2 découvertes par l'union)

Accueil · Stats → Records · Réglages → Correction des Records · **`div.sg-page` (Jeux, « e1RM 79kg ·
0.81× BW »)** · **`div.sbd-rank-detail-e1rm` (Jeux, « 158 kg »)** · cartes de progression du Coach.
Les deux surfaces de l'onglet **Jeux** n'apparaissaient dans aucun rapport v2 — elles sont rendues par
des blocs **sans `id`**, invisibles à un inventaire d'ids.

### 3.5 Absence de bornes de plausibilité

« Squat 315 kg · ×3.94 bw · est. 354 kg e1RM » affiché sans signalement (v2, I5).

---

## 4. PATTERNS TRANSVERSAUX

1. **Le code continue d'alimenter ce qui ne peut plus s'afficher.** `renderProgramViewer` (5 appelants),
   `renderPerfCard` (4 appelants) et leurs 2 graphiques Chart.js tournent à chaque rendu dans des
   conteneurs masqués. *Nouveau : visible uniquement par l'union.*
2. **Le point d'entrée disparaît, le code reste** (cf. v2, §3.1) — 4 cas.
3. **Deux stores pour un même concept** (cf. v2, §3.2) — 7 cas.
4. **Le repli masque l'absence** — 7 champs fantômes.
5. **La promesse d'interface que le code ne tient plus** — 3 cas.
6. **Divergence de type sur un store à écrivains multiples** — `routineExos`, seul crash déclenché par
   un bouton normal.
7. **La définition dupliquée** — `renderTierSection`.
8. **🆕 Le contenu sans `id` échappe à tout inventaire d'ids.** Sur Stats, **18 des 50 éléments** (36 %)
   n'ont pas d'`id` ; sur Social + Jeux, **32 sur 129** (25 %) — dont 2 des 6 surfaces d'affichage de
   l'e1RM. Un audit par ids seuls a un angle mort proportionnel à la part de rendu par classes.

---

## 5. CHAMPS NON SIGNÉS PAR `_computeDataHash`

**Inchangés par cette reprise** — l'union porte sur les *éléments d'interface*, pas sur les *champs*.
Liste complète : `audit/CHAMPS-NON-SIGNES.md`.

`db.body` (macros) · `db.keyLifts` · `db.routine` / `db.routineExos` · `db.gamification.*` hors
`xpHighWaterMark` et `earnedBadges` · `db.lastModified` (constante `0` **dans la signature elle-même**).
Hors périmètre : `activeWorkout` (séance en cours, hors `db` et hors blob).

---

## 6. FONCTIONNALITÉS ENTIÈREMENT INACCESSIBLES

| Fonctionnalité | Ampleur | Cause | Trouvée par |
|---|---|---|---|
| **Weight Cut** | 50 références (LPF, blocage APRE, Kill Switch compétition) | porte circulaire | vague 1 (grep markup) |
| **Viewer de programme** | `renderProgramViewer`, 5 appelants, + `programViewerCard` inexistant | conteneur `display:none` | **v3 (union)** |
| **Carte Performance + 2 graphiques** | `renderPerfCard`, 4 appelants, `db.keyLifts` configurable | masquage en dur v264 | v2 (conteneur) + **v3 (contenu)** |
| **Notifications Push** | 1 section, 1 bouton | `display:none` inline jamais retiré | vague 1 |
| **Sous-onglet Badges du Profil** | recopie de `tab-game` | aucun appelant | vague 1 |
| **3 sous-sections Social** | `renderFeed`, `renderLeaderboard`, `renderChallengesTab` | aucune pilule | v2 |
| **`renderTierSection` d'`index.html`** | badges de réussite + `APP_THEMES` | écrasée par `app.js` | vague 1 |

---

## 7. CE QUI N'A PAS PU ÊTRE VÉRIFIÉ

| Angle mort | Portée | Raison |
|---|---|---|
| **Les ~40 overlays du groupe 2.2 n'ont pas été ouverts** | v2, v3, v5 | Mes états ne les déclenchent pas. Leur **existence** et leur **point d'entrée** sont établis ; leur **contenu interne** ne l'est pas. Une vague dédiée aux overlays serait nécessaire. |
| **Réseau Supabase stubbé** | surtout v5 | 25 éléments A-seul + 19 conteneurs conditionnels. Contrainte volontaire : ne jamais toucher aux vraies données. |
| ~~Chaîne RGPD de suppression de compte~~ | v1 v3 | ✔ **RÉSOLU** — voir ci-dessous |
| **Capteur FC Bluetooth** | v2 | hors banc |
| **Aucun device Android réel** | toutes | Chromium 390×844, Service Worker bloqué |
| **Aucune donnée Supabase consultée** | toutes | pas d'accès — questions listées en fin de chaque rapport v2 |
| **5 « B seul » résiduels en vague 3** | v3 | `checkin-coach-*` : la source A produit un préfixe variable que l'appariement ne rapproche pas. **Limitation de mon outil**, pas de l'app — ces éléments sont rendus. |

### Limites de mon propre outillage, corrigées en cours de route

1. **Appariement des ids dynamiques** entre A (préfixe littéral) et B (id complet) — sans lui, chaque
   élément sériés comptait deux fois.
2. **Fermeture d'appels trop courte** (profondeur 2) → 13 « B seul » en vague 2.
3. **Interpolation `id="${var}"` non détectée** → tout un générateur invisible (`mg-<n>`).
4. **🆕 10ᵉ piège : la fermeture d'appels traverse les frontières de surface.** À profondeur 3 sans
   barrière, l'inventaire de Séances ramenait les sections des Réglages, les badges des Jeux et les
   graphes du Corps : **+20 éléments hors périmètre**, et un contrôle d'exhaustivité **trompeusement
   « cohérent »**. D'où `ARRET_PAR_DEFAUT` dans `source-a.js`.
5. **Blocs sans `id` non recensés** dans un premier temps → c'est ce qui expliquait « Stats = 28 ».

---

## 8. LA FIABILITÉ DE LA VAGUE 1 — MESURÉE, PLUS SUPPOSÉE

Je supposais qu'une reprise v3 du Profil « donnerait un compte supérieur à 176 ». **Mesuré : 260**
(219 hors recopie Jeux), soit **+48 %**.

**Ce que ça confirme** : la vague 1 était la plus fiable des cinq — c'est la seule dont la reprise ne
produit **aucun nouveau 🔴**. Weight Cut y avait bien été trouvé, et l'union le confirme une troisième
fois.

**Ce que ça corrige** : elle partageait quand même l'angle mort des blocs sans `id` (50, dont 35 boutons
de réglage et 19 entrées de glossaire) et ne détaillait pas le contenu des sections injectées.

**Bilan de l'audit, les 5 vagues : 623 éléments inventoriés, 623 verdicts, 623 statuts runtime.**

---

**Aucune modification de code applicatif.**
Contrôle : `git diff --name-only origin/main..HEAD -- js/ index.html service-worker.js tests/` → **vide**.
