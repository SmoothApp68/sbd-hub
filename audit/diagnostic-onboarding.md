# DIAGNOSTIC — Parcours d'entrée (chantier #7, phase 1, READ-ONLY)

> Date : 19/07/2026, ~08:26–10:20 UTC. Base de code : branche `claude/fix-rgpd-account-deletion-p2` (= main v353, contenu identique).
> Dispositif : 8 agents de cartographie (questions A–H) + 2 agents runtime Playwright (réseau 100 % stubbé,
> aucune requête n'a pu atteindre Supabase) + contre-vérification adversariale de chaque finding P0–P2
> + critique de complétude. 18 agents, ~1,1M tokens. **Aucune modification, aucun commit.**
> Convention : OBSERVÉ = prouvé code ou runtime · HYPOTHÈSE = à valider · [VOULU?] = possible choix produit.

## Blocages rencontrés

- La limite de session a fauché la 1re passe de contre-vérification (9 agents) ; relance en reprise-cache
  demandée par Aurélien → **tout est passé au 2e run**. Aucun blocage résiduel.
- Hors périmètre (consigne) : code d'invitation vide (mentionné en E1 ci-dessous, non investigué) ;
  comptes anonymes créés à chaque visite (croisé en G — `signInAnonymously` supabase.js:81 — non investigué,
  à traiter côté Supabase/auth via Claude.ai).

## Résumé exécutif

Le parcours d'entrée est un **empilement de 5 strates jamais ordonnancées** (login → onboarding v337 →
quiz archétype → magic start → social), chacune s'auto-déclenchant par timer/condition locale. Les 8
constats device sont **tous expliqués par le code**, et 2 ont été **reproduits au runtime** (doublon
« programme prêt »/« par où commencer », adoption du résidu AlexGuerrier). Cinq causes racines, pas huit
bugs indépendants. La plus grave (constat 8) : **l'app est aveugle à l'identité** — un signup adopte le
db local résiduel et le **pousse dans le cloud du nouveau compte** (sbd_profiles + workout_sessions +
leaderboard). Et un vecteur de résurrection est **encore vivant en v353** : `cloudLogout` ne purge que
`SBD_HUB_V29`, la clé legacy `SBD_HUB` survit et ressuscite le profil en boucle (prouvé runtime).

---

## 1. LA CARTE DU FLUX

### Les 9 écrans (id DOM · fonction · déclencheur · ce qu'il persiste)

| # | Écran | Fonction (fichier:ligne) | Déclencheur(s) | Persiste |
|---|---|---|---|---|
| 1 | **Login** `#loginScreen` (index.html:1912, z 99998) | `showLoginScreen` supabase.js:1111 | pas de session (`checkAuthGate` supabase.js:1137) ; SIGNED_OUT ; post-suppression | signup : `passwordMigrated` + `saveDB()` + **`syncToCloud(true)` du db courant** + `ensureProfile` (supabase.js:1043-1052). login : remplace db par le blob cloud s'il existe (1066-1071), **sinon pousse le local** (1074-1077). offline : **rien** (1104-1109) |
| 2 | **Onboarding v337** `#onboarding-overlay` (index.html:1977, z 1200) | `showOnboarding` app.js:2021 — **2 seuls call sites**, gatés `needsOnboarding()` : boot welcome-back (14921, exige `onboarded=true`) et `_showFirstRunUI` (14930, **exige `user.email`**) | boot cloud+email uniquement | fast flow : q1→name/level/vocabLevel (2160) · qdisc→trainingMode/skipPRs (2178) · q2→goal (2208) · q3→programParams.mat (2219) · **obSaveQ3→DÉFAUTS bw=0/height=null/age=null/gender='unspecified'/freq auto/60min/jours auto (2231-2250)** · qstyle→coachingStyle (2277) · q4→morpho · consent (2522) |
| 3 | **Consentement RGPD** `#ob-consent-overlay` | `obGenerateProgram` app.js:2585-2594 | si `!consentHealth\|\|!medicalConsent` | consentHealth/medicalConsent + dates |
| 4 | **« Ton programme est prêt ! » (étape 7)** | `_obGenerateProgramCore` app.js:2601, titre :2689 | fin du fast flow | `generateProgram` (2661) → **db.generatedProgram + db.routine/routineExos + programParams** (2662-2684) — **jamais db.weeklyPlan** |
| 5 | **Quiz archétype** `#classQuizOverlay` (créé app.js:5006, **z 1300**) | `showClassQuiz` app.js:4998 — boot `_showFirstRunUI` à **+400 ms si `!quizDone`** (14932-14933) + bouton « Changer de classe » | **par-dessus l'onboarding** (1300 > 1200) | **rien pendant les 7 questions ni au reveal** ; tout au tap final « Commencer l'aventure » : playerClass/quizAnswers/quizDone + saveDB + syncToCloud (5118-5126). Zéro effet programme (seul lecteur : onglet Jeux, 7719) |
| 6 | **Magic Start « Par où tu veux commencer ? »** (créé app.js:3266-3324) | `obFinish` si `!_magicStartDone` et **`db.weeklyPlan` vide** (3231-3238), +400 ms | après CHAQUE onboarding neuf (cf. cause racine 2) | écran pur affichage ; `handleMagicChoice` (3327) : `_magicStartDone` + `generateWeeklyPlan()` pour 'programme'/'skip' |
| 7 | **Swipe « Personnalisation »** | `renderSwipeOnboarding` app.js:11375 | `obFinish` si `weeklyPlan` NON vide && !powerlifting (3240-3245) → **jamais vrai au 1er onboarding** | bannedExercises etc. à la fin — **strate quasi-morte** |
| 8 | **Social onboarding** `#social-onboarding-overlay` (index.html:3292, z 1200, DOM postérieur → passe devant) | `showSocialOnboarding` supabase.js:3916 — **4 déclencheurs** : `initSocialTab` si `!onboardingCompleted` (1391-1393) ; restore lastTab au boot (app.js:14943→3872-3879, **avant `_showFirstRunUI`**) ; `postLoginSync` +800 ms (32814-32817) ; `obFinish` +500 ms si session (3256-3258) | peut tirer **avant/pendant** le flux principal | step 1 : username/bio **mémoire seule** ; step 2→3 : **upsert `profiles` + insert `invite_codes` AVANT validation finale** (3969-3972) ; sobFinish : onboardingCompleted + leaderboard. Écran 3 « Invite tes amis ! » : placeholder `---` (index.html:3351) remplacé **async** — reste figé si `createNewInviteCode` échoue/tarde |
| 9 | **Modal « Ton programme est prêt ! » bis** | `showOnboardingComplete` app.js:2539 | **unique appelant runtime : `pbGenerateProgram`** (builder, 13608-13612) si `!onboarded` — **pose `onboarded=true` en bypass complet de l'onboarding** | rien (pur affichage) |

### Ordre réel — (i) nouvel utilisateur qui s'inscrit par email

```
Boot #1 : loginScreen (cloudSignIn signe ANONYME en fond, sans email → _showFirstRunUI inerte)
  → signup (supabase.js:1033-1052) → syncToCloud(true) du db local courant + hideLoginScreen
  → dashboard NON onboardé. RIEN ne se déclenche (TROU : ni onboarding, ni postLoginSync).
Reboot (PWA relancée) : session email → _restoreLastTabFromCloud (peut ouvrir tab-social → SOCIAL ONBOARDING)
  → _showFirstRunUI : showOnboarding(q1) PUIS showClassQuiz à +400 ms PAR-DESSUS
  → l'utilisateur voit : QUIZ 7 questions → « Tu es un(e)… Protecteur » → (dessous) fast flow
    q1→qdisc→q2→q3→qstyle→[q4]→consentement→« Ton programme est prêt ! » + planning
  → obFinish → +400 ms MAGIC START « Par où tu veux commencer ? » (weeklyPlan vide)
  → +500 ms SOCIAL ONBOARDING (si session) → sob 1→2→3 « Invite tes amis ! » ('---' si insert échoue)
  → dashboard.
```

### Ordre réel — (ii) utilisateur offline

```
loginScreen → « Continuer hors-ligne » (loginOffline supabase.js:1104-1109) → dashboard vide. FIN.
AUCUN onboarding, jamais (les 2 call sites de showOnboarding exigent onboarded=true ou user.email).
Seule sortie : le builder pbGenerateProgram, qui pose onboarded=true sans name/level/goal (13608).
```
**PROUVÉ RUNTIME** (3 profils testés, storage vide, offline) : seul `#loginScreen` s'affiche ; l'onboarding
n'a pu être parcouru qu'en appelant `showOnboarding()` manuellement. Zéro `pageerror` sur tout le flux.

### Strates

- **ACTIVES** : login gate · fast flow v337 (q1/qdisc/q2/q3/qstyle/q4/consent/étape 7) · welcome-back v4 ·
  quiz archétype (PAS une strate morte pré-v337 : gamification branchée au boot) · magic start ·
  social onboarding · modal `showOnboardingComplete` (via builder seulement).
- **QUASI-MORTES** : flux d'édition `ob-step-1..6` — **la seule strate qui collecte bw/height/age/gender/cycle
  (obSaveStep1, app.js:2362-2384) et freq/jours/durée (ob-step-5, index.html:2263-2311)** — orpheline :
  aucun bouton ne l'appelle ; seule route = edge legacy `onboarded=true && onboardingVersion undefined`
  (car `undefined < 4 === false` court-circuite welcome-back, app.js:2032-2052) · swipe onboarding
  (condition `_hasPlan` jamais vraie au premier run, app.js:3240).

---

## 2. RÉPONSES A → H

### A. Combien d'écrans, quel ordre, quels déclencheurs ?

**9 écrans sur 5 strates** (table §1). Points saillants, tous CONFIRMÉS en contre-vérification :
- L'onboarding v337 est **inaccessible hors cloud+email** (`_showFirstRunUI` app.js:14928-14930 : `if (!user || !user.email) return`) — un offline n'est JAMAIS onboardé (P1, certain ; prouvé runtime).
- **Trou post-inscription** : la branche signup de `loginSubmit` (supabase.js:1036-1052) ne déclenche ni onboarding ni `postLoginSync` — le flux ne reprend qu'au **relancement de l'app** (P1, certain).
- Le quiz archétype **recouvre** l'onboarding (+400 ms, z-critical 1300 > z-overlay 1200, app.js:14930-14933 + 5010) → l'utilisateur répond à 7 questions cosmétiques avant les 5 questions structurantes (P2, certain).
- Edge supplémentaire : un profil avec logs mais sans `lastSync` court-circuite `_showFirstRunUI` (`return` à app.js:14947-14952) → ni onboarding ni quiz (P3, [VOULU?], confirmé par le critique).

### B. Qui persiste quoi ?

Table complète §1, colonne « Persiste ». À retenir :
- **Écrans qui n'écrivent rien** : loginOffline, welcome-back (l'écran), showOnboardingComplete, showMagicStart, quiz avant le tap final, sob-step-1 avant « Continuer ».
- **Écran qui n'écrit QUE des défauts : `obSaveQ3`** (app.js:2231-2250, commentaire « Defaults for fields not asked in fast flow »).
- Le quiz **enregistre** (au tap final uniquement, app.js:5118-5126) — le constat device 2 « n'enregistre rien » = sortie avant le bouton final (aucune sauvegarde intermédiaire, overlay artisanal sans fermeture) OU perception (zéro effet visible hors onglet Jeux).
- Le social onboarding **écrit côté serveur AVANT la validation finale** (upsert `profiles` + insert `invite_codes` au passage step 2→3, supabase.js:3969-3972) — un abandon à l'étape 3 laisse un profil serveur avec `onboarding_completed=false`.
- **Amplificateur** : chaque `saveDB()` d'un écran déclenche `debouncedCloudSync` → l'onboarding fait ~8-10 upserts `sbd_profiles` du profil partiel, défauts `bw=0` poussés au cloud avant même la fin (app.js:342-354, 419 ; supabase.js:316).

### C. Pourquoi bw/height/age/gender ne sont pas collectés ?

**RÉPONSE BINAIRE : jamais demandés — et pire, activement écrasés.** Le chemin q1 ne passe jamais par le
step '1' (grep exhaustif des transitions : q1→qdisc→q2→q3→qstyle→[q4]→'7', aucun lien vers '1'-'6' ;
unique appelant de `gotoObStep('1')` = branche édition orpheline app.js:2052). `obSaveQ3` (app.js:2231-2236)
pose `bw=0, height=null, age=null, gender='unspecified'` **inconditionnellement**. C'est un choix délibéré
du « 5 questions » [VOULU?] — ses conséquences ne le sont probablement pas :

- **calcTDEE ne voit jamais bw=0** : chaque appelant substitue un poids inventé AVANT l'appel — 75 kg
  (`getDailyCaloricTarget` app.js:15374, `getRefeedRecommendation` engine.js:2142) ou 80 kg
  (`getUserBW` → `BW_FALLBACK_KG`, app.js:6530/6534). La garde `return 2300` (engine.js:1149) est **morte** sur ces chemins.
- `height/age = null` → Mifflin inaccessible (engine.js:1188 exige les deux) ; `fatPct null` → pas de
  Katch-McArdle → **toujours le fallback `bw_fictif × 33 × facteur`**.
- Chiffres réellement affichés à un nouvel utilisateur J1 (vérifié) : onglet Corps → **anneau 2300 kcal**
  (`calcCalorieCible(80)`, defaults kcalBase 2300/bwBase 80, app.js:84+16199) **ET label TDEE 3732 kcal**
  (80×33×1.3+300) simultanément ; onglet Coach → **3518 kcal** (75×33×1.3+300). Trois chiffres
  contradictoires dans l'app (deux sur le même écran), aucun basé sur son poids. Recoupe le fix bloquant
  n°2 — **qui ne suffira pas seul** : sans bw collecté, le chiffre unique restera fabriqué.
- `gender='unspecified'` = **traité homme partout** (tous les tests sont `=== 'female' ? F : M` :
  Mifflin engine.js:1190, DOTS 1276/4415, standards 1619, incréments 1347) ; et le **cycle menstruel est
  structurellement inaccessible** (bloc Réglages masqué tant que `gender !== 'female'`, app.js:18250-18252 →
  `menstrualEnabled` jamais activable → `getCycleCoeff()=1.0`). La feature v184 est morte pour toute nouvelle utilisatrice.
- DOTS : `validateUserLevel` no-op (engine.js:1274-1275, pourtant appelé par obFinish) ; sortie DOTS de la LP
  désactivée (engine.js:5129-5133) ; IPF-GL onglet Corps calculé sur 80 kg fictifs (app.js:16172).
- Les chemins de réparation existent (Réglages : taille/âge « optionnel », genre, poids) mais **rien ne
  pousse l'utilisateur vers eux** — aucun état « profil incomplet » (P2, certain).

### D. freq/durée/lieu : collecte vs Réglages ?

**Il n'y a PAS deux stores persistés** : onboarding, Réglages ET `generateWeeklyPlan` lisent/écrivent tous
`db.user.programParams` (écrit 2663 + selectedDays 3218-3220 ; lu Réglages 17496/17506/17517/17528 ;
lu générateur 26272-26276/26356). Le constat 7 est un problème de **collecte, pas de source** : le fast
flow ne pose JAMAIS les questions freq/jours/durée (défauts silencieux obSaveQ3) → **les Réglages sont le
premier endroit où l'utilisateur choisit vraiment** — d'où l'impression de « redemande ». Le lieu/matériel,
lui, EST collecté (q3) et pré-sélectionné dans les Réglages (le constat device 4 est contredit sur ce point).

Deux vraies divergences de canal existent en amont :
1. Le générateur legacy `generateProgram` lit la **variable lexicale `obSelectedDays`** (app.js:2821) et
   reçoit freq/mat/durée en paramètres-closures (2661) — le wizard doit patcher la closure à la main
   (commentaire app.js:13567-13568). Nuance contre-vérif : aucun call site ne rejoue aujourd'hui
   `generateProgram` avec des closures périmées — risque dormant, pas bug actif.
2. **Champ fantôme `db.user.trainingDuration`** : lu en PRIORITÉ sur `programParams.duration` dans
   **5 sites** du générateur (app.js:24726-24728, 24770, 25572, 26638, 26847 — le 6e, 10955-10956, a l'ordre
   inverse), mais **jamais écrit par le code de prod** (grep exhaustif : seulement des fixtures de tests).
   S'il traîne dans un vieux profil cloud, le réglage « Durée de séance » devient silencieusement inopérant
   (P2, probable — dépend des données réelles, question Supabase).
3. Mineur : fallbacks freq divergents quand programParams est vide — 3 (Réglages 17496, engine.js:2190)
   vs 4 (générateur 26276) ; mord après `pbResetProgram` qui fait `programParams = {}` (14554).

### E. D'où vient le programme généré, pourquoi ne correspond-il pas ?

**Pas de course d'ordre** : level/trainingMode/goal/mat sont écrits AVANT la génération. Quatre mécanismes structurels :

1. **DEUX générateurs** : `_obGenerateProgramCore` → legacy `generateProgram` (app.js:2789) → l'aperçu
   « Ton programme est prêt ! » (`db.generatedProgram`/`db.routine`) ; le VRAI plan (`db.weeklyPlan.days`)
   vient de `generateWeeklyPlan` (app.js:26258), déclenché par Magic Start ou l'onglet Plan. Routages
   différents (goal-driven vs trainingMode-driven) → le résumé peut dire « force » et le plan « natation ».
2. **Le split n'est une entrée d'AUCUN générateur** (CONFIRMÉ). Les 3 lieux de stockage sont des culs-de-sac :
   `programParams.split` écrit une seule fois par **inférence** (app.js:2674 ← engine.js:5596-5599 : freq=4
   → 'upper_lower' !) et **jamais relu** ; `db.user.selectedSplit` (progSelectSplit, toast « Split mis à
   jour » **mensonger**, relu seulement pour surligner le chip 13958) ; `_pbState.split` (noms de jours
   vides). Les générateurs dérivent le split de freq+goal/mode : PL 4j avec goal 'force' (la présélection) →
   `'powerlifting_4'` → **Squat/Bench/Deadlift/Bench 2** (app.js:2894-2897, 3013, 25968) ; et
   `generateWeeklyPlan` **écrase même `db.routine`** avec `_wpGetSplitLabels` (26367-26379) → une routine
   Upper/Lower posée à la main est clobberée à la régénération. Nuance contre-vérif : « toujours S/B/D/B2 »
   vaut pour goal 'force' présélectionné ; goal changé à 'masse' avec discipline powerlifting → 'upper_lower'.
3. **« Marche / Mobilité / Natation » pour un profil force** (CONFIRMÉ) : `obQ3SelectMat` réécrit
   **silencieusement `trainingMode='calisthenics'`** quand l'utilisateur répond « Maison (poids de corps) »
   (app.js:2222-2223) — même s'il a choisi Powerlifting — et `generateWeeklyPlan` n'a **aucune branche
   calisthenics** : tout mode ∉ {powerbuilding, powerlifting, musculation, bodybuilding} tombe dans le ELSE
   « bien-être » (26575-26631, `beActivities` = Marche/Yoga-Mobilité/Natation/Renfo/Vélo). Sous-bug
   (vérifié par le critique) : revenir de « Maison » à « Salle » repasse trainingMode à **'musculation'**,
   pas à la discipline choisie (app.js:2224-2227) — perte silencieuse de Powerlifting.
4. **PROUVÉ RUNTIME** (profil « powerlifting/force/intermédiaire/salle ») : le weeklyPlan généré ne contient
   **aucun lift SBD barre** (Goblet Squat, DC Haltères, SDT Roumain Haltère) — `isBeginnerMode = logsCount<24`
   (app.js:26452) **ignore le niveau déclaré** et substitue les mains via `BEGINNER_SUBSTITUTES`
   (engine.js:1857). Un « Avancé — 3+ ans » fraîchement inscrit y passe aussi.

### F. « Ton programme est prêt » PUIS « Par où tu veux commencer ? » — doublon ou voulu ?

**Mécanique certaine, intention à trancher.** L'écran device est l'étape 7 (PAS `showOnboardingComplete`).
Un bypass anti-doublon **existe** dans `obFinish` (commentaire explicite « Bypass magicStart si le programme
a déjà été généré », app.js:3229-3236) mais il teste `db.weeklyPlan.days` — artefact que la chaîne
d'onboarding **n'écrit jamais** (elle écrit `generatedProgram`/`routine`) → le bypass est **inerte pour
100 % des nouveaux utilisateurs** et Magic Start s'affiche toujours à +400 ms, avec une option « Programme
complet — L'algo génère ton plan » qui contredit l'écran précédent. Reproduit au runtime (3 runs).
Nuances : l'option 'programme' ne RE-génère pas l'aperçu, elle **matérialise** `db.weeklyPlan` depuis la
routine (nécessaire aujourd'hui : sans elle, création lazy au premier rendu de l'onglet Plan) ; même
« Passer » finit par générer (3353-3356). Origine : deux strates historiques (Magic Start = « J1 blank
slate fix » pré-v206, app.js:3264 ; génération intégrée = v206 ; fast flow = v337) — git blame impossible
(historique tronqué au 12/07). **Le code ne peut pas trancher seul bug vs séquence assumée → décision
produit Aurélien** (la contre-vérif a explicitement refusé de conclure « bug » : Magic Start est aussi
le créateur légitime du weeklyPlan).

### G. 🔴 BUG #4 : le point exact où l'identité change sans reset local

**L'app est AVEUGLE à l'identité** (P0, certain, contre-vérifié) :

- **(b) Aucune détection de changement d'identité n'existe.** Grep exhaustif : aucun `cloudId`/`lastUserId`/
  `prevUid` ; `db.user.supabaseId` est écrit UNE fois (`''`, app.js:32785) et **jamais relu** ; la clé
  `sb-*-auth-token` n'est lue que par le SDK. Le db est chargé au parse d'app.js (IIFE app.js:110-131)
  avant toute notion d'auth.
- **(a+c+e) LE point exact** : `loginSubmit` branche **signup** (supabase.js:1043-1052) — l'identité change
  à `auth.signUp` (:1037) avec le db résiduel intact en mémoire et sur disque, puis le code enchaîne
  `saveDB()` (re-persiste le résiduel) → `syncToCloud(true)` → **upsert `sbd_profiles` {user_id: NOUVEL uid,
  data: blob résiduel}** (:315-316) + `syncLeaderboard()` (:327) + `syncLogsToSupabase(uid)` (:328) qui
  upserte **toutes les séances de l'ancien** dans `workout_sessions` du nouveau compte + `ensureProfile()`
  qui fabrique le profil public depuis `db.social` résiduel (username/bio/friend_code de l'ancien,
  :1555-1588). Aucun pull, aucune purge, aucun onboarding (`needsOnboarding()`=false car le résiduel est
  onboardé, app.js:2002 → **le nouvel inscrit ne voit même pas l'onboarding**).
- **Le signin vers un compte SANS ligne `sbd_profiles`** a le même vecteur (`else`/`catch` → `syncToCloud(true)`,
  supabase.js:1074-1077). Le signin vers un compte AVEC blob est sûr (`db = prof.data`, :1067-1071).
- **Même sans loginSubmit** : tout boot authentifié avec résiduel + compte cloud vierge pousse le blob
  (chaîne boot app.js:14936-14980 → branche else → `syncToCloud(true)`).
- **(d) `purgeAllLocalDb` n'a qu'UN appelant** (suppression de compte, app.js:1728) et ne purge que le
  **disque** : le `db` mémoire survit (aucun `db = defaultDB()`), `location.reload()` n'est atteint que si
  `showLoginScreen` n'existe pas (1737-1738) → **un signup dans la même session de page ressuscite le profil
  supprimé** puis le pousse dans le cloud du nouveau compte. Scénario exact du constat 8.
- **Producteurs du résiduel** : `appSignOut` garde délibérément tout le db ([VOULU?] mono-appareil —
  commentaire « garder les données d'entraînement », app.js:32783-32787) ; et **PROUVÉ RUNTIME** :
  `cloudLogout` (supabase.js:1192) ne retire QUE `SBD_HUB_V29` → la clé legacy `SBD_HUB` (présente sur tout
  device pré-v353, 962 KB) survit, la migration boot la recopie **sans supprimer la source** (app.js:114-127)
  → **résurrection en boucle infinie après chaque déconnexion** (démontré : logout → reload → AlexGuerrier
  revient, indéfiniment). Le fix v353 (retrait de l'écriture orpheline + purgeAllLocalDb) est réel mais son
  **périmètre d'appel est trop étroit**.
- Vecteur annexe (probable) : `signInAnonymously` au boot (supabase.js:81) + chaîne boot → possible ligne
  `sbd_profiles` **anonyme orpheline** contenant les données du résiduel.
- Clés hors périmètre de purge : `_lastCloudPush`/`_wsSyncedHashes`/`_lastCloudSync` + `_cachedUid`
  (invalidé seulement dans cloudLogout, supabase.js:1177 — PAS dans requestAccountDeletion) →
  `ensureProfile` peut upserter `profiles` sous l'uid du compte **supprimé**.
- **Points d'insertion naturels d'un fix** (sans le coder) : (1) branche signup entre signUp réussi et
  saveDB — un signup n'a par définition aucune donnée légitime à conserver → purge + `db = defaultDB()` ;
  (2) garde générique « uid propriétaire du blob » (clé hors blob posée à chaque sync réussie) comparée dans
  le handler SIGNED_IN (supabase.js:109) — seul entonnoir couvrant magic link et confirmation email ;
  (3) `requestAccountDeletion` : `db = defaultDB()` ou reload après purge ; (4) `cloudLogout`/migration boot :
  purger toutes les clés SBD_HUB* (via `purgeAllLocalDb`) au lieu de la seule V29.

### H. « Force » vs « Musculation »

- **Un seul champ fait foi : `db.user.trainingMode`** (`db.user.mode` N'EXISTE PAS — 0 occurrence hors script
  d'audit ; dérive CLAUDE.md §11). Valeurs : 'musculation'|'powerbuilding'|'powerlifting'|'bien_etre'|
  'calisthenics'|null (legacy bodybuilding/force_athletique migrés au boot, app.js:142-143).
- Le mapping central `TRAINING_MODES` (engine.js:307-450) a un `.label` pour chaque mode… **jamais affiché**
  (seules `.features` sont lues). **7 tables de labels hardcodées** (index.html:2025-2040, 2213-2217,
  2848-2851 ; app.js:3276-3277, 12388-12392, 13186-13189, 13340-13345) → libellés divergents pour le même
  mode ('Powerlifting' vs 'Powerlifting (SBD)' ; 'Bien-être' vs 'Bien-être & Santé' ; icône powerbuilding ⚡/🔥/💪).
- **'calisthenics' absent de 4 tables** : l'en-tête Programme affiche « Powerbuilding » à un utilisateur
  calisthenics (fallback app.js:12391 — et rappel E3 : le fast flow peut poser calisthenics à l'insu de
  l'utilisateur), le raccourci affiche « calisthenics » brut, le select Réglages n'a pas l'option.
- **Le mot « Force » à l'écran ne désigne JAMAIS la discipline** (elle s'appelle « Powerlifting ») mais
  3 autres choses : l'objectif `goal='force'` (« 🏋️ Force », « Gagner en force »), la phase de bloc 'force'
  (3 variantes d'icône), et des titres génériques (« Métriques Force »). Collision aiguë : le wizard
  programme affiche l'id 'force' comme… « Powerlifting » et **écrase `trainingMode`** (app.js:13342 +
  13529-13535). « Musculation » = discipline ET libellé wizard de l'objectif 'hypertrophie' (13343).
- Fallbacks `trainingMode` null divergents selon l'écran ('powerbuilding'/'powerlifting'/'musculation') ;
  listes de phases par mode dupliquées et divergentes (app.js:10852 vs 12170/13798).
- Seule question sans contre-vérification dédiée (aucun P0-P2) ; les 2 claims centraux (`db.user.mode`
  inexistant, `.label` jamais affiché) ont été re-vérifiés par le critique : CONFIRMÉS.

---

## 3. CONSTATS DEVICE → EXPLICATION

| # | Constat device | Expliqué | Par quoi |
|---|---|---|---|
| 1 | « Invite tes amis », code « - - - » | ✅ | 4 déclencheurs du social onboarding, dont 2 tirent avant/pendant le flux principal ; placeholder `---` du markup remplacé async, figé si `createNewInviteCode` échoue (supabase.js:3969-3972 ; cause serveur exacte → Supabase) |
| 2 | 2e écran/quiz « qui n'enregistre rien » | ✅ (réinterprété) | Quiz archétype : rien pendant les 7 questions ni au reveal, **tout au tap final** ; fermeture avant = zéro trace + re-déclenchement au boot suivant ; zéro effet produit visible |
| 3 | Archétype « Protecteur » | ✅ | `showClassQuiz` +400 ms PAR-DESSUS l'onboarding (z 1300 > 1200) ; 'feca' = Protecteur (app.js:4876) |
| 4 | v337 n'enregistre pas bw/height/age/gender ni freq/durée/lieu | ✅ (sauf « lieu ») | `obSaveQ3` pose les défauts en dur ; freq/jours/durée dérivés du niveau. **Le matériel (lieu) EST collecté et persisté** — partie du constat contredite par le code |
| 5 | « Programme prêt » PUIS « Par où commencer » | ✅ + reproduit runtime | Bypass anti-doublon teste `weeklyPlan`, jamais écrit par l'onboarding (app.js:3231) |
| 6 | Programme ≠ réponses | ✅ + reproduit runtime | Split = cul-de-sac sans lecteur ; PL/PB 4j → S/B/D/B2 ; mat 'maison' → calisthenics silencieux → plan « bien-être » ; `isBeginnerMode` ignore le niveau → mains substitués |
| 7 | Réglages redemandent freq/durée/lieu | ✅ | Pas deux stores : première vraie collecte. Le fast flow n'a jamais posé les questions |
| 8 | Nouvelle inscription hérite du résiduel | ✅ + reproduit runtime (partie boot/logout) | App aveugle à l'identité ; signup adopte + re-persiste + pousse au cloud ; purge disque sans purge mémoire ; cloudLogout laisse `SBD_HUB` → boucle infinie |

---

## 4. LES CAUSES RACINES (5, pas 8 bugs indépendants)

1. **RC1 — Aucun séquenceur d'écrans d'entrée.** Cinq strates s'auto-déclenchent par timers et conditions
   locales (+0 ms lastTab, +400 ms quiz, +400 ms magicStart, +500/800 ms social), arbitrées par z-index.
   → constats 1, 2, 3, et la moitié de 5. Aggravé par : entrée gatée cloud+email (jamais offline, trou
   post-signup — le flux ne démarre qu'au 2e lancement).
2. **RC2 — Deux artefacts de programme, deux générateurs, gardes sur le mauvais artefact.**
   `generateProgram` → `generatedProgram/routine` ; `generateWeeklyPlan` → `weeklyPlan` ; le bypass
   anti-doublon et le swipe testent `weeklyPlan` → doublon systématique + strate morte. Le split est un
   cul-de-sac ; `trainingMode` peut être réécrit silencieusement par le matériel ; `isBeginnerMode` ignore
   le niveau. → constats 5, 6.
3. **RC3 — Le fast flow pose des défauts silencieux au lieu de collecter** (obSaveQ3), et la seule strate
   qui collecte (ob-step-1..6) est orpheline. → constats 4, 7, + toute la chaîne calorique/DOTS/cycle
   fabriquée (3 chiffres kcal contradictoires ; femmes traitées hommes).
4. **RC4 — L'app est aveugle à l'identité** (aucun uid propriétaire du blob ; signup adopte + pousse ;
   purge disque ≠ purge mémoire ; cloudLogout/migration laissent les clés legacy). → constat 8. **P0 RGPD :
   fuite inter-utilisateurs de données de santé + résurrection serveur de données effacées.**
5. **RC5 — Vocabulaire éclaté** : 7 tables de labels hardcodées, mapping central jamais utilisé, collisions
   « Force »/« Musculation ». → symptôme transversal, P3-P4.

---

## 5. DÉCOUPAGE PHASE 2 PROPOSÉ (rien n'est fait — à valider)

> ⚠️ Préalable : **5 décisions produit** appartiennent à Aurélien avant tout code :
> (D1) le doublon Magic Start est-il à supprimer ou à garder comme choix d'entrée (F) ?
> (D2) au logout, garder les données locales (mono-appareil) ou purger (device partagé) — appSignOut et
> cloudLogout font aujourd'hui l'inverse l'un de l'autre ?
> (D3) le fast flow doit-il collecter bw/gender (1 question de plus) ou pousser un état « profil incomplet » ?
> (D4) « Maison » doit-il changer la discipline (calisthenics) ou seulement le matériel ?
> (D5) l'onboarding doit-il se déclencher offline et immédiatement après signup (dé-gater email) ?

**Bloc 1 — RC4, P0 RGPD (à faire en premier, indépendant du reste)** :
- 1a. Purge à l'inscription : branche signup de `loginSubmit` — `purgeAllLocalDb()` + `db = defaultDB()` +
  reset `_cachedUid`/`_wsSyncedHashes`/`_lastCloudPush` AVANT `saveDB`/`syncToCloud`. Trivial-petit, rayon
  minimal (un signup n'a jamais de données légitimes à conserver). Test : signup avec résiduel → db vierge poussé.
- 1b. `requestAccountDeletion` : tuer le résiduel mémoire (`db = defaultDB()` ou reload) après la purge. Trivial.
- 1c. `cloudLogout` + migration boot : `purgeAllLocalDb()` au lieu de `removeItem(V29)` ; supprimer la clé
  source après migration réussie. Trivial — mais dépend de D2 pour appSignOut.
- 1d. Garde d'identité générique (uid propriétaire hors blob, comparé au SIGNED_IN). Moyen, couvre magic
  link/confirmation email/signin-compte-neuf — peut venir dans un second temps si 1a-1c passent d'abord.
- Risque : 1d touche le flux de sync (post-bêta #7 adjacente) — bien borner.

**Bloc 2 — RC2, doublon + programme incohérent** (dépend de D1, D4 ; le point « substitution débutant » est
du coaching → **chaîne 4 voix, validation Gemini**) :
- 2a. Bypass obFinish : tester le bon artefact OU faire générer `weeklyPlan` par l'onboarding (un seul générateur à terme). Petit si test corrigé ; moyen si unification.
- 2b. `obQ3SelectMat` : ne plus réécrire `trainingMode` (D4) + restaurer la discipline choisie au retour « Salle ». Petit.
- 2c. `isBeginnerMode` : tenir compte du niveau déclaré. **Coaching → Gemini d'abord.** Petit en code.
- (post-bêta probable : brancher réellement un split, ou supprimer les 3 culs-de-sac qui prétendent le régler.)

**Bloc 3 — RC3, collecte minimale** (dépend de D3 ; recoupe fix #2 calorique et post-bêta #1 morpho) :
- 3a. bw (+gender) dans le fast flow OU état « profil incomplet » visible. Moyen (UI onboarding v337).
- 3b. Nettoyage : `obSaveQ3` ne doit plus écraser des valeurs existantes (garde `if undefined`). Trivial.

**Bloc 4 — RC1, séquenceur** (dépend de D5) : file d'attente d'overlays d'entrée (onboarding → quiz →
social), suppression des timers concurrents ; dé-gater l'onboarding (offline + post-signup). Moyen-gros,
**c'est le chantier structurel** — à découper après validation de la carte.

**Bloc 5 — RC5, vocabulaire** : table de labels unique (utiliser `TRAINING_MODES.label`), option
calisthenics, harmonisation « Powerlifting (SBD) ». Petit, purement cosmétique, peut attendre.

---

## 6. À VÉRIFIER CÔTÉ SUPABASE (router via Claude.ai — je n'y ai pas accès)

1. **Contamination constat 8** : le compte créé le 19/07 après suppression — `sbd_profiles.data.user.name`
   = 'AlexGuerrier' ? `data.bestPR.squat` = 110 ? `workout_sessions` antérieures au `created_at` du user auth ?
   `leaderboard_entries` héritées ? (`SELECT user_id, data->'user'->>'name', data->'bestPR'->>'squat', created_at FROM sbd_profiles ORDER BY created_at DESC LIMIT 5;`)
2. **Config auth** : la confirmation email est-elle exigée au signUp (session immédiate ou pas — détermine
   si la contamination part au clic ou au retour du lien) ? Le sign-in anonyme est-il activé ? Si oui,
   chercher des lignes `sbd_profiles` orphelines sous uid anonymes contenant des données réelles.
3. **Code ami '---'** : ligne `invite_codes` créée pour le compte test du 19/07 ? Et lignes `profiles` avec
   username posé mais `onboarding_completed=false` (écritures serveur avant validation, sobNext(2)) ?
4. **Profils fast-flow v337** : part des profils avec `user.bw=0`, `height/age=null`, `gender='unspecified'`,
   `kcalBase=2300`, `programParams.freq ∈ {3,4}` et `duration=60` uniformes ?
5. **Champ fantôme** : `SELECT user_id, data->'user'->>'trainingDuration' FROM sbd_profiles WHERE data->'user' ? 'trainingDuration';`
6. **trainingMode des testeurs du 19/07** : vaut-il 'calisthenics' (chemin mat='maison') ? Et
   `programParams.split='upper_lower'` avec un weeklyPlan S/B/D/B2 (preuve du split non honoré) ?
7. **Legacy** : profils `onboarded=true` SANS `onboardingVersion` (edge « full flow édition » au lieu de welcome-back) ?
8. Compte test : `user.quizDone`/`gamification.playerClass` posés ? (absents = quiz quitté avant le tap final.)

## 7. Dérives CLAUDE.md constatées (à corriger dans un commit doc dédié — PAS fait ici, phase read-only)

- `BW_FALLBACK_KG` réel : app.js:**6530** (doc : 6472) · `getUserBW` : app.js:**6534** (doc : 6476) ·
  `calcTDEE` : engine.js:**1148** (doc : 1144).
- §11 : `db.user.mode` **n'existe pas** (seul `trainingMode`) ; la forme documentée de `programParams`
  (`intensity`, `goal`) ne correspond pas au code (réels : mat/duration/injuries/cardio/split/selectedDays…).
- §11 P0 RGPD : l'écriture orpheline `SBD_HUB` est retirée en v353 **mais** le vecteur reste vivant sur les
  devices pré-v353 (clé jamais nettoyée par la migration, cloudLogout partiel) — reformulation à prévoir.
- `calcCalorieCible` : fallback `bwBase||98` (engine.js:1361) vs 80 documenté (sans effet profil neuf).

## 8. Angles morts de ce diagnostic

- **Le chemin CONNECTÉ n'a jamais été exécuté** (réseau stubbé pour protéger les vrais utilisateurs) :
  l'ordre exact des overlays sur device (quiz/social/onboarding) est déduit statiquement (z-index + timers),
  cohérent avec les constats mais non capturé en ligne. Idem l'amplificateur ~8-10 upserts pendant l'onboarding.
- Le chemin device exact du constat 6a (où le testeur a « choisi » upper_lower) n'est pas tracé — le fast
  flow ne pose pas la question ; probablement le wizard programme ou l'inférence stockée. À vérifier sur device.
- La question F (doublon voulu ?) n'est **pas tranchable par le code** — décision produit.
- H n'a pas eu de contre-vérification dédiée (aucun finding P0-P2) ; ses 2 claims porteurs ont été
  re-vérifiés par le critique (confirmés).

---

STOP. Diagnostic parcours d'entrée terminé. Rapport : `audit/diagnostic-onboarding.md` (non commité).
Aucune modification de code, aucun commit. Cause(s) racine(s) à valider par Aurélien avant toute phase 2.
