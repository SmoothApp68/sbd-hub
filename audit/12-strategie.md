# AUDIT 12 — Stratégie produit (le challenger)

> Agent 12 (stratège / challenger — le dernier). READ-ONLY.
> Généré le 2026-07-15. Branche `claude/agent09-profils-fixtures`. SW v350.
> Mandat : contredire Aurélien, prendre de la hauteur, dire non quand il faut.
> Un seul fichier écrit : `audit/12-strategie.md`. Aucun git, aucun Supabase, aucun sous-agent.
> STATUT : en cours de rédaction incrémentale.

---

## Ce que je vois (10 lignes)

1. **L'app ne casse pas — elle ment, et elle ment surtout aux gens qui ne sont pas toi.** 0 crash sur 9 profils × 10 onglets (agent 10), socle défensif solide (`loadDB→defaultDB`, quota capté, offline complet — agent 07). Le mal est dans les couches hautes.
2. Les ~60 findings ne sont pas 60 problèmes : ce sont ~4 causes qui se répètent, et la plus grave n'est pas dans le code, elle est dans **ta manière de vérifier** (device + toi + Gemini).
3. Trois choses sont **éliminatoires** pour une bêta et confirmées à l'écran : le compte supprimé qui **ressuscite** (RGPD, app.js:4388), Léa 60 kg à **1408 kcal** / une athlète 40 kg à **939 kcal** (engine.js:1355), le Coach qui dit « décharge » ET « vise un PR » sur le même écran (agent 10 A5).
4. `calcIPFGL` (app.js:15355) affiche « Débutant » à un total 455 avancé — cassé **depuis toujours**, jamais remonté. Ça, ça raconte quelque chose.
5. `renderFriendsTab` (supabase.js:3224) **crashe pour tout utilisateur connecté** sur Social>Amis. Une bêta, c'est 50 utilisateurs connectés.
6. Le garde-fou de sécurité 60 % est **documenté, cru actif, et mort** (app.js:23017). Un coach parallèle entier vit sur `tab-ai` depuis des mois (coach.js:67-285). Personne ne les voyait.
7. Les 602 tests étaient aveugles par construction : rétro-ajoutés après coup, ~10 % grepent la source (fichiers coach 91-92 %), fixtures idéalisées (agent 08). Le vert est un doudou.
8. Ta rigueur est réelle et rare (diagnostic-first, vérif device qui a attrapé ce que 602 tests rataient). Ton instinct « seuils calibrés pour l'occasionnel, condamnent l'assidu » est **juste** et confirmé partout.
9. Mais tu as bouclé le chantier Coach 4 fois. Cet audit en a trouvé ~150 de plus. **Aucun round ne t'a rapproché du lancement.** Ce n'est pas un défaut de rigueur, c'est un défaut de méthode à ton échelle.
10. **Le vrai sujet de ce rapport n'est pas « quels bugs » — c'est « est-ce que corriger est devenu ta façon de ne pas lancer ». Je pense que oui. Et je pense que corriger 5 choses précises EST lancer.**

---

## Ce que les bugs racontent (la cause derrière les causes)

L'agent 11 nomme le méta-pattern « corrections non-propagées » : tu corriges le Coach, pas Stats/Corps/Diagnostic. C'est vrai, mais c'est un **symptôme**, pas la cause. Je vois **une seule cause racine, avec quatre visages** :

**L'app a dépassé la seule méthode qui l'a construite.** Solo + un fichier de 31 500 lignes + vérif-sur-toi + tests-verrous a marché jusqu'à une certaine taille. Au-delà, la **même** méthode produit mécaniquement les 60 findings. Détaillons les quatre visages, parce que chacun appelle une réponse différente :

**1. Pas de source de vérité unique → la duplication est le chemin de moindre résistance.**
Cible calorique : **3** implémentations (`getDailyCaloricTarget`/`calcTDEE` ~2672 vs `calcCalorieCible` 2300 vs Katch ~2971 — agent 01). Macros : **2** (P 2.2/L 0.9 vs P 2.4/L 0.73, avec un commentaire « harmonisées » **faux**, app.js:15335). Ratios de force : **2** tables divergentes (engine.js:44 vs app.js:15634). Push/pull : **3** calculs (agent 06). Coach : **2** (le vrai + coach.js:67-285). Quand un concept vit à N endroits, un fix en touche 1 et les N-1 pourrissent. Ce n'est **pas** un manque de discipline de propagation — c'est que dans un fichier de 31 500 lignes sans modules, écrire une nouvelle fonction à côté de là où tu travailles est **plus facile** que retrouver la canonique. L'architecture *encourage* la divergence. Pourquoi trois voies caloriques ? Parce que rien dans le code ne t'empêche d'en écrire une quatrième.

**2. Ta vérification est device + toi → elle est structurellement aveugle aux autres corps.**
C'est ta plus grande force ET le piège. Tu vérifies sur **ton** profil. Donc `calcCalorieCible` câblé en dur sur 98 kg/2300 (engine.js:1356-1357) produit chez toi un chiffre à peu près juste — tu ne l'as jamais attrapé. Mais Léa reçoit 1408 kcal, une femme de 40 kg reçoit 939 (agent 10 A4). Le mono-bencher reçoit « 🚨 protège ton Squat lourd » qu'il n'a jamais fait (agent 10 B1). **Tu testes le seul profil incapable de révéler la classe de bugs qui blesse tout le monde d'autre.** C'est pourquoi les deux agents les plus précieux de la nuit sont le 09 (profils réalistes dans le vrai `loadDB`) et le 10 (exécution multi-profils) : ils ont fait exactement ce que ta boucle ne peut pas faire.

**3. Les tests verrouillent le passé, ils ne protègent pas l'avenir.**
Agent 08, sans appel : les tests comportementaux sont des **rétro-ajouts** (« fix v345 », « fix deadlift v346 ») — ils bloquent le correctif, ils n'ont jamais eu la chance de prévenir le bug. ~10 % grepent la source (coach-justesse-r2 **91 %**, coach-contradictions **92 %**) : ils vérifient qu'un littéral existe, pas qu'un comportement est juste. `computeStrengthRatiosDetailed` et `calcWeeklyJointStress` — les fonctions derrière « S/B Critique 1.04 » et « articulaire 100 pts » — ont **0 exécution** dans toute la suite. Donc « 602 verts » veut dire « les chaînes que j'ai ajoutées sont toujours là », pas « c'est correct ». **C'est le mécanisme exact qui t'a fait croire 4 fois que le chantier Coach était bouclé.** Le doudou vert.

**4. Tu ne peux plus tenir le système dans ta tête, et les artefacts censés compenser ont eux-mêmes dérivé.**
Le garde-fou 60 % : CLAUDE.md le documente actif, il est **mort** (`_prepenaltyBase` jamais écrit, app.js:23017). « Macros harmonisées » : faux. `renderCoachTodayHTML` documenté à 438 lignes : il en fait **847** (agent 06). Le coach parallèle sur `tab-ai` : retiré de la nav, jamais supprimé, toujours atteignable par `lastTab` persisté (agent 02). Quand tu es seul, tu navigues à la carte — et la carte ment. Le coach parallèle « a pu vivre des mois » précisément parce qu'il est **invisible aux deux seuls yeux qui regardent** : ta vérif device (qui ne va jamais sur un `lastTab='tab-ai'`) et tes tests (qui ne le rendent jamais). Ce n'est pas de la négligence. C'est de l'**invisibilité structurelle**.

**La synthèse en une phrase** : chacun des 60 findings est un symptôme du même décalage — *une app trop grosse pour être maintenue par une personne + une doc qui dérive + une vérif qui ne voit qu'un corps + des tests qui ne voient que le passé.* On ne corrige pas ça en corrigeant plus fort. On le corrige en **rétrécissant ce qu'il faut maintenir** et en **branchant les deux yeux qui manquent** (les fixtures du 09 dans le gate, per agent 08).

---

## 🔴 Corriger ou lancer ?

**Ma position : LANCE. Mais avant, corrige exactement 5 choses — pas 6 chantiers, pas 60 findings — et gèle tout le reste. Corriger ces 5-là, c'est lancer. Corriger les 55 autres, c'est le chantier Coach round 5.**

Le faux binaire « corriger OU lancer » est lui-même le piège. La vérité tient en deux affirmations qui semblent se contredire mais ne le font pas :

**Oui, une bêta dans cet état serait éliminatoire.** Un coach qui se contredit sur le même écran, qui sert 939 kcal à une femme de 40 kg, qui dit « Débutant » à un avancé, qui crashe l'onglet Amis pour tout connecté, et qui ne supprime pas les comptes — dans une **app santé, en France, avec consentement RGPD explicite dans le produit** — ce n'est pas « à polir ». Un bêta-testeur qui vit un de ces cinq cas ne revient pas, et le dit autour de lui. Donc « lancer maintenant tel quel » serait irresponsable. **Sur ce point, l'audit a raison contre l'envie de shipper.**

**Mais non, l'audit ne doit PAS occuper tes 3 prochains mois.** Parce que 55 des 60 findings ne feront **quitter personne** : un rouge décoratif sur un score < 40 (agent 04), une double formule de macros que seul un agent voit (agent 01), un `predictPR` sans récence qui ne s'affiche jamais (agent 10 A8), une perte de données sync **non reproduite** (agent 10 était offline). Les traiter maintenant, c'est reproduire exactement le pattern qui t'a mené ici : chaque finding est légitime, aucun ne rapproche du lancement. **L'audit de la nuit risque de devenir le nouveau chantier Coach — 3 à 6 mois (estimation agent 11) qui finissent en v380 avec 200 nouveaux findings.**

### Le sous-ensemble minimal — les 5 (nommés, scopés, ordonnés)

Critère : *ferait quitter un bêta-testeur, l'expose légalement, ou casse dur une surface qu'une bêta utilise.* Rien d'autre ne passe la barre.

| # | Blocage | Où (précis) | Pourquoi éliminatoire | Effort | Preuve |
|---|---|---|---|---|---|
| **1** | **Le compte supprimé ressuscite** | retirer `setItem('SBD_HUB')` **app.js:4388** ; purger TOUTES les clés SBD dans `requestAccountDeletion` **app.js:1675** + `cloudLogout` | **Légal.** App santé, RGPD explicite. Droit à l'oubli défait = pas un bug, une violation. | petit | agent 05 P0, **agent 10 A6 (962 KB réécrits au render)** |
| **2** | **Léa 1408 kcal / 40 kg → 939 kcal** | router l'anneau Corps + Forme Score sur `getDailyCaloricTarget`/`calcTDEE` ; retirer `calcCalorieCible` **engine.js:1355** | **Conseil nutritionnel nocif à de vrais utilisateurs.** Fait fuir toute utilisatrice + viole ta propre règle « ne pas hardcoder de données user ». | petit-moyen | agent 06 P1, **agent 10 A4 (à l'écran)** |
| **3** | **« IPF GL 220 — Débutant » pour un avancé** | corriger `calcIPFGL` **app.js:15355** (`denom = a − b·e^(−c·bw)`, sans `Math.pow`) + recalibrer seuils | **Détruit la promesse produit** (« l'algorithme de force piloté par ta physiologie ») dès la carte Corps. Trivial à corriger. | trivial | agent 01 P1, **agent 10 A2 (preuve numérique)** |
| **4** | **Le Coach se contredit sur le même écran** | rendre **non-prescriptives** 2 cartes : Diagnostic « Fenêtre optimale — vise un PR » **engine.js:2964** + Volume « planifie un deload » **app.js:20156**. (PAS le chantier arbitre complet.) | **Casse le cœur produit** : « décharge » + « vise un PR » simultanés. Le seul contre-argument produit qui compte. | moyen (scopé) | agent 02 P0, **agent 10 A5 (capture, sur ton profil)** |
| **5** | **Crash Social>Amis pour tout connecté** | garde `if (badgeEl)` **supabase.js:3224** | Une bêta = 50 connectés utilisant le social. Crash dur sur une surface centrale. | trivial | agent 00 P1, **agent 10 A3 (throw sur uid stubbé)** |

**C'est tout.** Deux triviaux (3, 5), deux petits (1, 2), un moyen scopé (4). Avec vérif device + un vrai test par fix (fixture agent 09 dans le vrai `loadDB`, per agent 08), c'est **~3 semaines de soirées**, pas 3 mois.

### Ce que je REFUSE d'inclure avant bêta (et pourquoi je conteste la consolidation de l'agent 11)

- **Je découpe le Chantier 1 de l'agent 11.** Il bundle RGPD + render-pur complet (readOnly aux 11 sites + `generateWeeklyReport` hors render). La **résurrection RGPD** (l'écriture `SBD_HUB` + la purge) est un blocage. Le reste du render-pur est une invariante de testabilité — réel, mais **aucun bêta-testeur ne quitte** à cause d'un toast « ❄️ Freeze utilisé » parasite. Post-lancement.
- **Je scope le Chantier 3 (arbitre) de « gros, 6 émetteurs » à « 2 cartes observées ».** Tu n'as pas besoin de faire consommer le verdict par les 6 émetteurs avant bêta. Tu as besoin de faire taire les **2** qui co-affichent visiblement une contradiction (confirmées écran sur ton profil). Les 4 autres (SNC, LCA, RHR, activité) : post-lancement. C'est la différence entre 2-4 semaines et 3 jours.
- **Je SORS le Chantier 8 (sync) de tout ce qui précède la bêta.** Non confirmé à l'écran (agent 10 offline), **risqué** (agent 11 le dit lui-même : « un mauvais fix perd des données réelles »). Toucher une sync fragile que tu ne peux pas reproduire, juste avant d'exposer de vrais comptes, est la pire idée du lot. **La bêta est précisément l'outil qui te donnera la donnée pour confirmer ou infirmer ce bug.** Ne le touche qu'après.
- **Warm-up `isWorkSet` (agent 11 Chantier 4)** : juste sous la barre. Fausses alertes Push/Pull, pas éliminatoire. À faire pendant la bêta si le temps le permet, pas un blocage.

---

## Le backlog contesté (mon ordre vs le sien)

Ton §17 a **trois problèmes structurels**, avant même le détail :
- **Le RGPD n'y est pas.** Ni la correction multi-user (calcCalorieCible, calcIPFGL). Normal : ta vérif-sur-toi ne les fait pas *sentir*. Mais ce sont tes seuls vrais blocages. **Le backlog est écrit par la méthode qui a créé les angles morts.**
- **Ton #1 (chantier couleur) est un P3 cosmétique** hissé en tête. C'est le tell du perfectionnisme : un chantier multi-phases (diagnostic → palette Gemini → maquette → impl) pour un problème qui ne fait quitter personne.
- **Ton #9 « freemium = #1 lancement » confond bêta et lancement public.** Une bêta de 50 personnes est **gratuite**. Tu n'as pas besoin de Stripe en juillet.

### Item par item

| Ton rang | Sujet | Mon verdict | Pourquoi |
|---|---|---|---|
| — (absent) | **RGPD résurrection** | **→ #1 absolu** | Légal. N'est pas dans ta liste. |
| — (absent) | **Multi-user (calcCalorieCible, calcIPFGL)** | **→ top 3** | Nocif/faux pour tout non-toi. Invisible à ta vérif. |
| **#1** | Chantier couleur global | **→ post-lancement** | P3. Rouge décoratif ne fait quitter personne (agent 04). Ton instinct « rouge = danger only » est **juste**, le *timing* est faux. |
| **#2** | Morpho → seuils ratios | **→ jamais (pour l'instant)** | Feature d'un produit qui n'a pas prouvé sa traction. Aucun de tes 5 users ne l'a demandé. |
| **#3** | Fiabiliser pente/trend e1RM | **→ post-lancement** | `predictPR` récence est latent, jamais affiché (agent 10 A8). Réel mais pas saignant. |
| **#4** | Audit `matchExoName` (stiff-leg) | **→ post-lancement, dé-priorisé** | Agent 09 confirme : `getSBDType` gère bien le deadlift (RDL-en-1er → 170 quand même). Impact live plus petit que craint. |
| **#5** | Freeze-at-render global | **→ post-lancement** | Agent 10 : aucun freeze ≤ 82 ms même à 562 séances. Non prouvé sur Android, mais non urgent. |
| **#6** | RPE simplifié | **→ post-lancement** | Bonne idée produit. Pas un blocage. |
| **#7** | Disciplines mixtes | **→ jamais (pour l'instant)** | Scope-creep pur. Tu n'as pas prouvé que quiconque veut le mode principal. |
| **#8** | Découplage onboarding/cloud | **→ #7 (après bêta)** | Agent 10 B3 : un user offline **ne peut pas s'onboarder**. Plus haut que tu ne le ranges SI la bêta n'impose pas l'email — à vérifier d'abord. |
| **#9** | Freemium/Stripe | **→ pour septembre, pas juillet** | Important pour le modèle, inutile pour une bêta gratuite. Ne construis pas Stripe maintenant. |
| **#10** | Onglet Analyse | **→ jamais (pour l'instant)** | Déjà pausé. Laisse-le pausé. |
| **#11** | Réglages/Plan/SVG | **→ post-lancement** | Dette UX, pas blocage. |

### Mon ordre

**Avant bêta (les 5) :** RGPD → calcIPFGL → renderFriendsTab → calcCalorieCible → 2 cartes contradictoires. (Ordre d'exécution : le plus trivial/sûr d'abord pour l'élan — cf. Le plan.)
**--- LIGNE BÊTA ---**
6. Warm-up `isWorkSet` (fausses alertes) · 7. Découpler onboarding (si la bêta le révèle) · 8. Intégrité sync (**seulement après que la bêta l'ait confirmé**) · 9. Freemium/Stripe (pour septembre) · 10. Chantier couleur · 11. Le reste, à la demande des vrais users.

### Où je suis d'accord avec toi (un challenger crédible le dit)

- **Ta méthode diagnostic-first est juste. Je n'y touche pas.** Le danger n'est pas ta méthode, c'est la **taille** de chaque chantier.
- **« Jamais merger sans vérif device » est ta meilleure décision.** C'est littéralement ce qui a attrapé ce que 602 tests rataient (facteur calorique, e1RM affiché). Garde-la, non négociable.
- **Ton instinct « seuils calibrés pour l'occasionnel condamnent l'assidu » est ta plus belle intuition produit** — confirmée sur toute la ligne (agents 03, 04, 10). C'est un vrai avantage de coach evidence-based. Ne le perds pas.
- **« Un chantier à la fois » est correct.** Applique-le aux 5, pas aux 60.

---

## Ce que cette app est vraiment

Positionnement affiché : « Data-Driven Powerbuilding — l'algorithme de force piloté par votre physiologie ». Moteur réel : 15 pénalités de charge, DUP, SRS, TRIMP, ACWR, cycle, weight cut, HRV, 98 badges, leaderboard, challenges, cardio, morpho, IA premium.

**La richesse du moteur est un piège, pas un atout — et l'audit le prouve.** Un solo dev ne peut pas maintenir 15 pénalités interconnectées avec correction. Les preuves sont dans le rapport : un garde-fou de sécurité **documenté actif et mort** (app.js:23017) ; **6 verdicts d'intensité concurrents** là où l'invariante §9 en veut UN (agent 02) ; le kill-switch `forceActiveRecovery` **avalé** par le wrapper `wpComputeWorkWeightSafe` — il n'atteint jamais l'appelant (agent 08, work-weight-harness:224). La sophistication du moteur **dépasse ta capacité, et celle de tes tests, à la vérifier.** Les 15 pénalités ne sont pas ce qui rend l'app bonne ; ce sont ce qui la rend **invérifiable**.

**Ce qui te différencie vraiment** — sois honnête sur bâti vs prévu. Hevy/Strong = logging + social, poli, énorme. Boostcamp = programmes gratuits. JuggernautAI = IA powerlifting adaptative (ton concurrent le plus proche) — mais **anglais, powerlifting, cher, pas powerbuilding**. Ce que TU as bâti et qu'ils n'ont pas : **un arbitre d'intensité qui adapte la charge à la readiness / l'ACWR / le cycle / le return-to-play, en français, avec une voix de coach opinionée** (« le deload est une arme, pas du repos » — app.js:19357 ; salué par agents 02 et 03). C'est réel et rare. **Ton wedge = le coach adaptatif opinioné, en français, pour le powerbuilding.** C'est ~20 % du moteur. Les 80 % restants (les 14 autres pénalités, les 6 cartes qui se contredisent, l'IPF GL cassé, le coach parallèle) sont ce qui casse et ce qui te bouffe tes soirées. **Ton avantage se noie dans ta propre richesse.**

Le différenciateur est dans le **construit** (l'arbitre existe et il est bon). Le danger est que tu passes ton temps sur le **prévu** (disciplines mixtes, Analyse, morpho) au lieu de polir les 20 % qui gagnent.

---

## Ce qu'il faut couper

Un solo dev qui coupe 30 % de son scope avance deux fois plus vite. **Chaque carte que tu gardes est une carte que tu dois maintenir correcte sur tous les profils, pour toujours.** Ton nombre de cartes est un compteur de dette. Concrètement, nommément :

1. **Le coach parallèle `coachGetFullAnalysis` / `tab-ai` (coach.js:67-285).** Supprime-le — ne le « fais pas consommer l'arbitre ». Il ne sert personne, il contredit le vrai coach, il est hors-nav (agent 02 P1). Deep-link `#tab-ai` + `lastTab` persisté = seul moyen d'y arriver. Suppression franche.

2. **La moitié des cartes prescriptives du Coach.** La règle qui coupe le plus : **l'arbitre est la SEULE voix ; tout le reste est un FAIT ou est supprimé.** Passe en note factuelle non-prescriptive (ou supprime) : SNC « repos complet » (engine.js:2977), LCA « risque blessure » (engine.js:2921), AutoTuner « Insolvency » (coach.js:551 — sur une métrique **gelée**, donc littéralement un mot mort affiché), activité « intensité légère » (app.js:18997). Cette coupe unique résout la plus grosse famille (2), tue le coach parallèle, ET réduit la surface à maintenir. C'est **à la fois un fix et une coupe.**

3. **La carte « IPF GL Points ».** Si tu ne la corriges pas (blocage #3), supprime-la. Une métrique cassée depuis toujours que personne n'a remontée ne mérite pas de survivre en l'état. (Corrige-la — c'est trivial — ou tue-la.)

4. **Le backlog « features » : disciplines mixtes (#7), Analyse (#10), unification 2 builders (#11), morpho→ratios (#2).** Ce sont des features pour un produit qui n'a pas prouvé que quiconque veut le cœur. Zéro de tes 5 users ne les a demandées.

5. **~72 fonctions mortes + générateurs `program.js` + `supabase.min.js` (154 KB) + configs orphelines `js/{babel,jest}.config.js`** (agent 00). Pas urgent, mais c'est de la charge cognitive qui rend le fichier géant encore plus dur à tenir en tête. `calibrateTDEE`, `detectMomentum`, `checkRecompoProgress`, `computeWilks` : morts confirmés (agent 06). **Grep de 10 s avant chaque suppression** (dispatch dynamique, onclick).

**Ne coupe PAS** : l'arbitre (`computeIntensityVerdict`), `calcTDEE` (juste, testé), `wpComputeWorkWeight` (excellent harnais), `recalcBestPR`, le socle défensif (agent 07). Ce sont tes 20 % qui gagnent. **N'AJOUTE aucune pénalité.** Le moteur est déjà au-delà de ta capacité de vérification.

---

## Les 3 questions qu'il ne se pose pas

Pas rhétoriques. Chacune a une **décision** attachée qui change tes 3 prochains mois.

**1. « Quelle est la SEULE chose que la bêta doit prouver ? »**
Tu as 5 users réels et une bêta de 50 prévue. Mais quelle hypothèse teste-t-elle ? Si c'est « le coach adaptatif crée de la confiance et de la rétention », alors **90 % des 60 findings sont hors-sujet pour la bêta** — seuls comptent ceux qui touchent la crédibilité du coach (les 5). Si tu ne peux pas nommer cette chose unique, tu traiteras chaque finding comme un blocage (le piège). **Décision attachée** : la réponse détermine si la bêta est dans 3 semaines ou dans 4 mois. Écris-la en une phrase avant de toucher une ligne de code.

**2. « Si `calcIPFGL` est faux depuis toujours et qu'aucun de mes 5 users ne l'a remonté — combien de mes 98 badges / 15 pénalités / cartes métriques quelqu'un regarde-t-il vraiment ? »**
C'est la question inconfortable. Le silence autour d'une métrique headline cassée est une **donnée** : il suggère que les surfaces riches du moteur sont largement **non regardées**. Si c'est vrai, tu as passé des soirées à maintenir la correction de cartes que personne ne lit, pendant que la chose qu'ils utilisent (le verdict quotidien du coach) est là où vivent les contradictions. **Décision attachée** : si tu confirmes que 3 users sur 5 ne regardent jamais l'onglet Corps/Stats, tu peux **couper 30 % du scope sans perdre un seul utilisateur** — et tu sauras enfin où mettre tes soirées. (Nuance : 5 users est un échantillon minuscule ; ne sur-interprète pas le silence — mais **pose la question** en bêta.)

**3. « Quel est l'angle mort de ma méthode, et qui le couvre ? »**
Ta vérif = device + toi + Gemini. L'audit vient de prouver que cette méthode est structurellement aveugle à : (a) les autres corps (Léa, 40 kg), (b) les autres surfaces que celle que tu touches (Stats non propagé), (c) les états connecté/multi-device (crash Amis, perte sync), (d) l'échelle (562 séances, quota). Tu ne corrigeras pas ça en essayant plus fort — **une vérif-sur-soi ne peut pas voir les bugs non-soi.** Les deux seules choses qui ont vu ces bugs cette nuit : les profils réalistes dans le vrai `loadDB` (agent 09) et l'exécution multi-profils (agent 10). **Décision attachée** : ta plus haute action à levier n'est pas de corriger un bug — c'est de **brancher les fixtures de l'agent 09 dans `npm test`** (tout l'objet de l'agent 08). Sans ça, les 60 prochains findings sont déjà en train de s'écrire. Avec ça, le filet attrape enfin ce que tu ne peux pas voir.

---

## Le plan (maintenant / dans un mois / jamais)

Nous sommes le **15 juillet 2026**. Ta bêta était « juillet », ton lancement « septembre ».

**Verdict sur les dates :** La bêta de juillet **telle qu'imaginée est morte** — on est mi-juillet avec des blocages légaux + conseil nocif + crash. Mais une **bêta bornée début août (~3 semaines)** est défendable si tu corriges UNIQUEMENT les 5 et ne touches rien d'autre. **Septembre lancement public reste défendable** SI la bêta est petite, le scope gelé, et si tu résistes à transformer les retours bêta en nouvel audit de 60 items.

### MAINTENANT (→ bêta début août, ~3 semaines de soirées)

- **Jour 0, avant tout fix (1 h)** : `npm ci && npm test` sur un env avec deps. **Personne ne l'a lancé de toute la nuit** (agents 00, 01, 06, 08) — « 602 verts » est analysé, pas prouvé. De-risque tout le reste.
- **Branche les fixtures agent 09 dans le gate jest** (`tests/fixtures/profiles/`). C'est le mouvement à plus haut levier de tout le plan. Chaque fix ci-dessous embarque un test basé fixture, dans le même commit (CLAUDE.md §4).
- **Les 5 fixes, un commit atomique + un vrai test chacun, dans cet ordre** (trivial/sûr d'abord, pour l'élan et parce que tu douteras moins vite) :
  1. `calcIPFGL` (trivial, agent 01 donne la formule) — quick win visible.
  2. `renderFriendsTab` garde `if (badgeEl)` (trivial, agent 00).
  3. RGPD : retirer `setItem('SBD_HUB')` + purger toutes les clés à la suppression (petit, agent 05).
  4. `calcCalorieCible` → `calcTDEE` sur anneau Corps + Forme Score (petit-moyen). **Prérequis : 1 décision** (Gemini/toi : cible « vraie » = 2300 ou 2672 ? — Q3 Supabase) + confirmer via Claude.ai que `kcalBase`/`bwBase` ne sont pas renseignés pour les autres users (Q2).
  5. Rendre non-prescriptives les 2 cartes contradictoires (moyen scopé, engine.js:2964 + app.js:20156). **Vérif device + Gemini obligatoires** (surface principale).
- **Gèle le scope par écrit** : « ces 5, rien d'autre avant bêta ». Colle-le au mur. Chaque fois que tu trouves un 6ᵉ, note-le pour plus tard — ne le fais pas.
- **Route vers Claude.ai** (tu n'as pas Supabase) : Q2 (kcalBase/bwBase multi-user), Q3 (cible vraie), Q8 (résurrection RGPD confirmée device), Q9 (error_logs socialFriendsBadge réels). Ces 4 suffisent à calibrer les 5 fixes.

### DANS UN MOIS (août — pendant/après la bêta)

- **Lance la bêta PETITE (10-20, pas 50).** 20 vrais users te disent lesquels des 55 autres findings comptent. 50 = 50× le bruit pour la même information.
- **Instrumente** : le coach est-il cru ? Les gens loggent-ils ? Surveille `error_logs` pour les crashes que l'audit prédit (socialFriendsBadge, quota localStorage ~2700 séances).
- **Utilise la bêta pour CONFIRMER la perte de données sync** (chantier 8) **avant** d'y toucher. Ne corrige jamais une sync fragile que tu ne peux pas reproduire.
- Warm-up `isWorkSet` (fausses alertes, cheap).
- Découpler onboarding **si** la bêta montre de la friction au step 0 (agent 10 B3).
- **ENSUITE** décide freemium/Stripe pour le lancement public de septembre. Pas avant.
- **Ne commence PAS** le chantier couleur, les disciplines mixtes, ni l'Analyse.

### JAMAIS (ou : pas tant que le produit n'est pas prouvé)

- **Disciplines mixtes (#7), Analyse (#10), unification builders (#11), morpho→ratios (#2)** : features d'un produit qui n'a pas la traction pour les justifier.
- **AJOUTER des pénalités.** Le moteur est déjà invérifiable. Coupe des cartes, n'en ajoute pas.
- **Maintenir le coach parallèle** (coach.js:67-285) : supprime, ne maintiens pas.
- **Ré-auditer vers la perfection v380.** L'audit est fait. La réponse à « quel est le prochain bug » est désormais **« lance et laisse 20 vrais users te dire lesquels comptent ».**

**La phrase unique** : le remède à ton « je ne sais plus » n'est pas de corriger plus — c'est de **corriger 5 et livrer à 20**, parce que seuls de vrais users peuvent te dire lesquels des 55 autres comptent vraiment, et là tout de suite tu devines (et tes devinettes, comme le chantier couleur, sont d'habitude les cosmétiques).

---

## Ce en quoi je peux me tromper

Cette section n'est pas une politesse. Elle te donne de quoi me contredire — utilise-la.

- **Je n'ai jamais fait tourner l'app ni vu la donnée.** Tout passe par les rapports. Si Supabase montre que `kcalBase`/`bwBase` **sont** renseignés pour les vrais users, alors `calcCalorieCible` ne nuit pas à Léa et mon blocage #2 tombe en sévérité — mon argument « conseil nocif » s'effondre. Agents 06/10 l'ont flaggé non vérifié (Q2). **Vérifie Q2 avant de me croire sur le #2.**

- **Mon ensemble minimal est calibré sur UN profil exécuté (le tien).** Agent 10 n'a observé que `aurel_like` en profondeur pour la contradiction Coach. Sur un profil `bien_être` (agents 01/03), une **autre** voix concurrente (activité ACWR, SNC) pourrait dominer, et ma coupe « 2 cartes » raterait. Mon #4 scopé suppose que ces 2 cartes sont les seules à co-afficher visiblement. Ça peut être faux hors de ton corps.

- **Ma thèse « la richesse est un piège » est peut-être biaisée par la survie.** Un audit est une liste de ce qui est **cassé** ; il ne peut pas me dire ce qui est **aimé et utilisé**. Peut-être que les 15 pénalités SONT pourquoi tes 5 users restent, et je lis un document qui, par construction, ne montre jamais ce qui marche. Mon inférence « personne ne regarde les cartes métriques » repose sur le silence autour d'UN bug (calcIPFGL) — inférence **faible** : 5 users est trop petit pour que qui que ce soit remonte quoi que ce soit. Je peux confondre « personne ne l'utilise » avec « échantillon trop petit ».

- **J'ai accepté le cadrage « il perfectionne au lieu de lancer ».** C'est la prémisse du prompt, et je l'ai largement adoptée. Lecture inverse tout aussi valide : tu es un solo dev prudent sur une **app santé**, et shipper un coach qui donne de mauvais conseils à 50 personnes pourrait être **pire** que shipper en retard. Si la cohorte bêta inclut des users vulnérables, mon « lance les 5 et pars » pourrait être imprudent. Toute ma position « lance maintenant » suppose que le downside d'une bêta rugueuse est faible — pour la plupart des apps oui, pour une app santé/nutrition c'est moins évident.

- **Mon timeline « 3 semaines pour 5 fixes » est l'extrémité agressive.** L'agent 11, honnête sur le volume, met même les « petits » chantiers à des jours et les « moyens » à 1-2 semaines. Si chaque fix exige Gemini + device + un vrai test, 5 fixes = 5-6 semaines, ce qui pousse la bêta à septembre et le lancement à Q4. Prends mon « début août » comme le meilleur cas, pas le cas probable.

- **Mon découpage des chantiers de l'agent 11 (RGPD sans render-pur, arbitre scopé à 2 cartes) peut sous-traiter la dette.** Si tu corriges la résurrection RGPD sans corriger le render impur (`calcStreak` mutant, `generateWeeklyReport` au render), l'écriture-au-render **reste** une source d'effets de bord — et un futur re-branchement de `SBD_HUB` pourrait rouvrir le trou RGPD. Je parie que le gain de vitesse vaut la dette résiduelle ; ce pari peut être faux si la dette render-pur remord vite.

---

**Résumé pour l'orchestrateur** : un seul fichier écrit — `audit/12-strategie.md`. Aucune modification applicative/test/config/CLAUDE.md, aucun git, aucun Supabase, aucun sous-agent. READ-ONLY respecté.

STOP.
