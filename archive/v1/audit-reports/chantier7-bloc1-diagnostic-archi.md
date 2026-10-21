# Chantier #7 — Bloc 1 : diagnostic confirmé + architecture du séquenceur d'entrée

> **Phase 1 read-only** (méthode diagnostic-first). Aucune modification de code dans ce commit.
> **STOP à la fin de ce rapport** : Aurélien valide l'architecture (§B) avant toute implémentation.
> Date : 2026-07-21 · Base : `main` = merge PR #241 (RC4 sync) · SW actuel : `trainhub-v362`.
> Toutes les lignes citées ont été **re-greppées sur cet arbre** (les ancres du plan avaient bougé :
> le merge RC4 décale app.js de +140 lignes après ~1820, et `resolveIdentity` n'est pas à supabase.js:342).
> Recon : 6 lecteurs parallèles + contre-vérification manuelle ligne à ligne des claims porteurs.

---

## A. DIAGNOSTIC CONFIRMÉ

### A.1 La garde cloud+email (symptôme c) — CONFIRMÉE, mécanisme complet

`_showFirstRunUI(user)` — **app.js:15068** (plan : ~14930) :

```js
function _showFirstRunUI(user) {
  if (!user || !user.email) return; // skip for anonymous / no-auth   ← app.js:15069
  if (needsOnboarding()) showOnboarding();                            // ← 15070
  db.gamification = db.gamification || {};
  if (!db.user.quizDone) {
    setTimeout(function() { ... showClassQuiz(); }, 400);             // ← 15073
  }
}
```

- Appelée **uniquement** depuis les 2 chemins du `cloudSignIn().then(...)` du boot (app.js:15097 et 15140). Aucun listener ne l'appelle : **seul un rechargement complet de page peut re-tenter l'entrée**.
- `cloudSignIn()` (supabase.js:70) fait un **`signInAnonymously()` de repli** (supabase.js:81) : tout utilisateur neuf a une session anonyme **sans email** → la garde 15069 bloque à chaque boot. Un compte créé mais non confirmé = pareil. C'est exactement le vécu `+test2107@`.
- `onAuthStateChange` (supabase.js:95) n'appelle **jamais** `_showFirstRunUI` ni `showOnboarding` : un login/confirmation en cours de session ne déclenche l'onboarding **qu'au prochain reload** — la moitié du symptôme (b).
- Angle mort supplémentaire : le chemin `db.logs.length > 0 && !db.lastSync` fait `syncToCloud(true); return;` **avant** le call site 2 → ni onboarding ni quiz sur ce boot-là.

### A.2 Aucun séquenceur — inventaire exhaustif des déclencheurs (symptômes a+b)

Chaque écran d'entrée s'auto-déclenche par un événement one-shot indépendant. **Inventaire vérifié** (utilisateur neuf, écrans cœur) :

| # | Écran | DOM | z réel | Déclencheur(s) | Mécanisme |
|---|---|---|---|---|---|
| 1 | Splash | `#splashScreen` | 99999 (hors échelle) | toujours | boot, retiré ~1400 ms |
| 2 | Login | `#loginScreen` | 99998 (hors échelle) | `checkAuthGate` (supabase.js:1328) | boot sans session |
| 3 | **Onboarding v337** | `#onboarding-overlay` (index.html:1977) | **1200** (`--z-overlay`, index.html:306) | `_showFirstRunUI` (15070) · welcome-back local (15061) | boot cloud gaté email / boot local (onboardés seulement) |
| 4 | **Quiz archétype** (« Protecteur ») | `#classQuizOverlay` (créé app.js:5146) | **1300** (`--z-critical`, app.js:5150) | app.js:15073 | **setTimeout +400 ms**, garde `!quizDone` — aucune garde « onboarding en cours » |
| 5 | Consentement RGPD onboarding | `#ob-consent-overlay` (app.js:2729) | 1200, `_uiOpen` non-dismissible | clic « Générer » si consentements manquants (app.js:2727) | user-action (sain) |
| 6 | **Consentement santé Art. 9** | `#consentHealthOverlay` (app.js:1549) | **1300** (inline, app.js:1552), non-dismissible | `checkRequiredConsents` (app.js:1540) depuis `postLoginSync` (32975) | **setTimeout +600 ms** post-login |
| 7 | **Magic Start** | `#magic-start-overlay` (app.js:3408) | 1200, appendé fin de body | `obFinish` (app.js:3378) | **setTimeout +400 ms** ; bypass `_hasPlan` **inerte** (l'onboarding n'écrit jamais `weeklyPlan` avant `obFinish` — audit A0 ; le plan n'est créé qu'au boot suivant, app.js:15048) |
| 8 | **Swipe onboarding** | `[data-swipe-container]` (app.js:11515) | 1200 | `obFinish` (app.js:3381) | **setTimeout +800 ms** (seul déclencheur d'entrée ; 11589 = re-render interne) |
| 9 | **Social onboarding** (« Invite tes amis ») | `#social-onboarding-overlay` (index.html:3292) | **1200 mais DOM-postérieur** (3292 > 1977 → peint AU-DESSUS de l'onboarding à z égal) | `obFinish` +**500 ms** (app.js:3388, une session **anonyme** suffit : `getSession` seul) · `postLoginSync` +**800 ms** (app.js:32967) · `initSocialTab` (supabase.js:1586) | 3 déclencheurs concurrents, même flag |
| 10 | Onboarding-complete (chemin builder) | `.modal-overlay` (app.js:2689) | 1200 | `pbGenerateProgram` si `!onboarded` (app.js:13752) | setTimeout +800 ms — pose `onboarded=true` **sans** `obFinish` (2e voie d'écriture) |

Le décompte historique « 9 écrans / 5 strates » reste vrai ; en réalité **jusqu'à 10 overlays** (+ bannières install à z 1100).

**Superpositions structurelles prouvées** :
- Quiz archétype (z1300) planifié +400 ms **dans la même fonction** qui vient d'ouvrir l'onboarding (z1200) → il le recouvre pendant 7 questions.
- Consentement santé (z1300, non-dismissible) +600 ms post-login → peut recouvrir l'onboarding aussi (**écran absent du plan — découvert au recon**).
- Social : DOM-postérieur à z égal → passe devant l'onboarding ; cas prouvé « pendant » : welcome-back local ouvert (15061) + `_restoreLastTabFromCloud` → onglet Social → `initSocialTab` → social par-dessus.
- Post-`obFinish` : 3 timers en 800 ms (Magic +400, social +500, swipe +800) — Magic Start, appendé en dernier, recouvre le social qui réapparaît à sa fermeture.

**« Il faut recharger pour lancer le quiz suivant »** : les transitions dépendent du boot (`init` IIFE app.js:14981 → `checkAuthGate` → `cloudSignIn` → `_showFirstRunUI`) et des handlers de login (`postLoginSync`, app.js:32950). Une fois le boot passé, **rien** ne ré-évalue « quel écran d'entrée manque » — sauf un reload. CONFIRMÉ.

### A.3 Le parcours réel d'un utilisateur neuf aujourd'hui (reconstitué, code à l'appui)

1. Boot, localStorage vierge → `checkAuthGate` → pas de session → **login screen** (z99998). En parallèle `cloudSignIn` → session **anonyme** → `_showFirstRunUI` → return (pas d'email). *Pas d'onboarding.*
2. Signup (supabase.js:1229-1253) : `signUp` → **pas de session** tant que l'email n'est pas confirmé → `_resetLocalToOwner(uid)` (purge, ligne 1246) → `hideLoginScreen()` → **app vide, aucun événement à venir**. (Vécu `+test2107@`.)
3. Confirmation email (redirect vers la racine, `detectSessionInUrl`) → nouveau boot → `SIGNED_IN` → `resolveIdentity` ('no-row' → reset tatoué) → `_showFirstRunUI(user)` passe enfin → onboarding + quiz archétype à +400 ms **par-dessus**.
4. `obFinish` → Magic Start +400 (bypass inerte) + social +500 + swipe +800 → strates concurrentes.

### A.4 RC4 / adoption — état réel (⚠️ écarts vs le plan)

- `resolveIdentity` existe, à **supabase.js:373** (pas ~342). La confirmation email **passe bien par elle** : `onAuthStateChange` → `SIGNED_IN | TOKEN_REFRESHED | PASSWORD_RECOVERY` → `resolveIdentity(session.user.id)` (supabase.js:111-118, commentaire explicite « retour de confirmation email »). Le routage demandé par le plan est donc **déjà en place**.
- MAIS un blob local **rempli et non tatoué** (= exactement ce que produira l'onboarding local du bloc 1) est aujourd'hui **détruit à 3 endroits** :
  1. `resolveIdentity` branche `'no-row'` (supabase.js:405-408) : compte neuf en ligne → `_resetLocalToOwner(uid)` = purge totale + `defaultDB` tatoué (app.js:1794-1797). Seule la branche `'has-data'` a l'union anti-perte, et **séances uniquement** — le profil (`db.user`) est écrasé dans tous les cas. (Au passage, trou préexistant : `_preAdoptLogs` est capturé ligne 391 mais **jamais réinjecté sur 'no-row'** → séances offline TOFU perdues sur compte neuf.)
  2. Signup handler Réglages (supabase.js:1066) : `_resetLocalToOwner` **inconditionnel**.
  3. Signup handler login screen (supabase.js:1246) : idem, assumé par commentaire (« Le nouvel inscrit repart toujours vierge »).
  Ce design était **correct** sous l'ordre actuel (onboarding APRÈS login confirmé). Il devient le point de perte n°1 sous l'ordre du bloc 1.
- **Piège anonyme** (découvert au recon) : le handler `onAuthStateChange` appelle `resolveIdentity` **sans filtre email**, alors que le site du boot exclut explicitement les uid anonymes (app.js:15078-15081 : « les garder purgerait le local à chaque boot »). Le `signInAnonymously` du boot émet un `SIGNED_IN` anonyme → `resolveIdentity(anonUid)` → sur blob non tatoué : 'no-row' probable → **tatouage à l'uid anonyme**. Conséquence sous le bloc 1 : le profil rempli ensuite en local serait vu « tatoué AUTRE uid » au premier login email → capture vide → **aucune union, tout est écrasé**. À neutraliser en 1e.
- Le critère d'INTENTION `_isDefaultDB` (app.js:1809 : aucun vrai PR ET `onboarded !== true` ET pas d'`ownerUid`) est **exactement le discriminant** dont le 1e a besoin : un onboarding local complété (`onboarded=true`) n'est PAS un defaultDB.

### A.5 Strate orpheline `ob-step-1..6` (contexte pour le séquenceur, fix au bloc 2)

- Fast flow réel : `q1 → qdisc → q2 → q3 → qstyle → [q4 morpho si level ≠ debutant] → 7` (5 dots, app.js:2248). `obSaveProfile` **n'existe plus** (le plan la citait).
- La strate 1..6 n'est atteignable que par le `else` de `showOnboarding` (app.js:2178-2192 → `gotoObStep('1')`) : onboardé avec `onboardingVersion` ≥ 4 **ou undefined/0** (`undefined < 4 === false` à la ligne 2172 court-circuite le welcome-back). `#ob-step-1` porte `class="active"` en statique (index.html:2164).
- `obSaveQ3` (app.js:2371) écrit toujours `bw=0, height=null, age=null, gender='unspecified'` — cible du bloc 2, ne pas toucher ici.

### A.6 Verdict — trois symptômes, une cause, confirmée

Pas de séquenceur : 5 timers d'entrée concurrents (+400 quiz, +400 magic, +500 social, +600 consentement santé, +800 swipe/social), 2 strates z (1200/1300) + ordre DOM comme arbitre implicite, transitions possibles uniquement au boot/login, et une garde email en amont de tout. Le fix du plan (ordonnanceur local + dé-gating + neutralisation des parasites + câblage RC4) est le bon et **suffit** — aucune refonte des écrans eux-mêmes n'est nécessaire au bloc 1.

---

## B. ARCHITECTURE PROPOSÉE — ordonnanceur d'entrée (À VALIDER)

### B.1 Principes (les 5 règles du séquenceur)

1. **Une seule autorité d'affichage.** Un module `obSeq*` dans app.js (pas de nouveau fichier, pas de module ES6). Les écrans d'entrée ne s'auto-déclenchent plus jamais : **zéro `setTimeout` d'entrée**, l'ordonnanceur les appelle.
2. **Avancement par signal de complétion.** Chaque écran, à sa fermeture/complétion, appelle `obSeqDone(id)` → l'ordonnanceur affiche le suivant **immédiatement, en local**. Aucune transition n'attend un événement réseau/auth. (Demi-mesure refusée, conformément au plan.)
3. **100 % local et résumable.** L'état = les flags db **existants** (`onboarded`/`onboardingVersion`, `quizDone`, `consentHealth`+`medicalConsent`, `_magicStartDone`, `_swipeCompleted`) — pas de nouveau champ d'état. Un reload reprend au premier écran non complété : le boot appelle `obSeqStart()` une fois le db hydraté/migré (à l'endroit du welcome-back local actuel, app.js:15061). Idempotent : ré-appeler `obSeqStart` pendant qu'un écran est ouvert est un no-op.
4. **Un seul écran à la fois.** L'ordonnanceur n'affiche l'étape N+1 qu'après fermeture de l'étape N. Les z-index cessent d'être un mécanisme de séquencement.
5. **Écrans existants réutilisés tels quels.** Le bloc 1 ne change ni le contenu ni le design des écrans — seulement *qui* les affiche et *quand*.

### B.2 La file (utilisateur neuf, appareil vierge)

```
obSeqStart()  [boot local, après hydratation db — AUCUNE condition email/session]
  │
  ├─ 1. profile    isDone: !needsOnboarding()
  │     → showOnboarding() : q1 → qdisc → q2 → q3 → qstyle → [q4] → 7
  │       (consentements santé+médical DÉJÀ posés dans le flux : ob-consent au « Générer »)
  │     → obFinish() pose onboarded/version puis obSeqDone('profile')
  │
  ├─ 2. plan       isDone: db._magicStartDone
  │     → showMagicStart()  [étape séquencée, plus de timer — SUPPRIMÉE au bloc 4,
  │       le retrait sera alors trivial : on enlève une entrée de la file]
  │
  ├─ 3. swipe      isDone: db.user._swipeCompleted || plan absent || powerlifting
  │     → renderSwipeOnboarding()
  │
  ├─ 4. classQuiz  isDone: db.user.quizDone
  │     → showClassQuiz()  [APRÈS le profil, jamais par-dessus]
  │
  └─ fin → app (dashboard). L'ordonnanceur se désarme.
```

**Sortent du tunnel d'entrée** (plus jamais déclenchés pendant la file) :
- **Social onboarding** : conservé au **premier accès à l'onglet Social** (`initSocialTab`, supabase.js:1586 — déjà en place et suffisant). Les 2 timers (`obFinish` +500, `postLoginSync` +800) sont supprimés.
- **Consentement santé post-login** (`checkRequiredConsents`) : conservé comme **filet pour comptes existants** (pull cloud d'un vieux profil sans `consentHealth`), mais gardé « pas pendant la file » (si l'ordonnanceur est actif, c'est l'étape `profile` qui pose le consentement via ob-consent).
- **Login screen** : voir B.3.

### B.3 Dé-gating (1c) — qui voit quoi au boot

| État local au boot | Comportement proposé |
|---|---|
| `needsOnboarding()` (neuf OU version en retard) | **La file démarre immédiatement** (onboarding-first), sans attendre `checkAuthGate`/`cloudSignIn`. Le premier écran (q1) porte un lien discret **« J'ai déjà un compte → se connecter »** → `showLoginScreen()` (l'utilisateur existant sur appareil neuf s'échappe, se connecte, le pull cloud pose `onboarded` → la file constate `isDone` et se referme). |
| Onboardé, version à jour | Aucune file. Comportement actuel inchangé (login screen si pas de session, etc.). |
| Logout volontaire (même session de page) | Comportement actuel inchangé : `showLoginScreen()` immédiat (supabase.js:101). Au reload suivant, le db purgé est un defaultDB → onboarding-first avec le lien « J'ai déjà un compte ». |

- `_showFirstRunUI` est **réduite/supprimée** : la garde email disparaît, le timer quiz disparaît ; le boot cloud n'a plus aucun rôle d'affichage d'entrée.
- La session anonyme de repli (`signInAnonymously`) est conservée telle quelle (support cloud silencieux) — mais voir B.4 pour son exclusion du tatouage.
- Un utilisateur **hors-ligne** voit l'onboarding complet et utilise l'app ; la création de compte reste proposée où elle l'est aujourd'hui (l'entrée ne force pas le compte).

### B.4 Câblage RC4 (1e) — adoption du profil local, 4 retouches chirurgicales

> Le plan dit « RC4/D2 fait — ne pas y retoucher » pour la purge logout/anti-résurrection : **intact**.
> Le 1e est explicitement prévu par le plan ; il étend l'adoption au cas TOFU-rempli. Critère unique
> réutilisé : `!db.user.ownerUid && !_isDefaultDB(db)` = « vrai profil local, jamais possédé » → il
> appartient à la personne qui tient l'appareil, donc au compte qu'elle crée.

1. **`resolveIdentity`, branche `'no-row'`** (supabase.js:405-408) : si blob non tatoué ET `!_isDefaultDB(db)` → **adopter le LOCAL** : `_stampOwner(incomingUid)` + `_markCloudHydrated()` + push (`syncToCloud` + `syncLogsToSupabase`). Sinon, comportement actuel (`_resetLocalToOwner`). Corrige au passage le trou préexistant des `_preAdoptLogs` perdus sur 'no-row'.
2. **Signup handler login screen** (supabase.js:1246) : même critère — blob non tatoué et rempli → tatouer au nouvel uid **sans purge** ; sinon purge actuelle. (Blob tatoué à un AUTRE uid → toujours purgé : anti-fuite inchangé.)
3. **Signup handler Réglages** (supabase.js:1066) : idem.
4. **Piège anonyme** : dans `onAuthStateChange` (supabase.js:111), **exclure les sessions anonymes** de `resolveIdentity` (aligner sur la garde du boot, app.js:15081) — un uid anonyme ne tatoue jamais un blob. Sans ça, le profil rempli en local se fait tatouer à l'uid anonyme du boot et devient « blob d'autrui » au signup.

**Invariants NON touchés** : `_canPushForOwner` (défense terminale anti-fuite), verrou d'hydratation 3 états, purge logout (voix unique `_purgeLocalSession`), adoption `'has-data'` + union des séances, anti-résurrection (un blob d'un compte supprimé est purgé à la suppression ; un blob d'un autre utilisateur est tatoué → toujours purgé au signup).

**Chaîne cible complète** : onboarding 100 % local (session anonyme non tatouée) → signup → blob tatoué au nouvel uid, conservé → confirmation email → `SIGNED_IN` → `resolveIdentity` → verdict **'kept'** (même owner) → verrou ouvert → push du profil vers `sbd_profiles`. Zéro perte, zéro reload nécessaire.

### B.5 Découpage en commits (conforme au plan)

| Commit | Contenu | Tests dans le même commit |
|---|---|---|
| **1a** | Ordonnanceur (`obSeqStart`/`obSeqAdvance`/`obSeqDone` + file déclarative) + retrait des 5 timers d'entrée (quiz +400, magic +400, social +500/+800, swipe +800) + garde « pas pendant la file » sur `checkRequiredConsents` | file pure (ordre, un seul écran, reprise après reload simulé) |
| **1b** | Signaux de complétion branchés : `obFinish`, bouton final du quiz (5263), `handleMagicChoice`, `skipSwipeOnboarding`/complétion swipe | chaque complétion avance la file sans reload |
| **1c** | Dé-gating : `obSeqStart()` au boot local ; `_showFirstRunUI` vidée de son rôle ; lien « J'ai déjà un compte » sur q1 ; login screen non affiché par-dessus la file pour un `needsOnboarding()` | onboarding visible sans session/email (db vierge) |
| **1d** | Neutralisation résiduelle des parasites : social hors tunnel (initSocialTab seul), vérif qu'aucun chemin ne ré-empile (welcome-back + lastTab social) | pas de social pendant la file ; social au 1er accès onglet |
| **1e** | RC4 : les 4 retouches B.4 + tests d'adoption (style `rgpd-sync-guards`, via `vm` sur la vraie source) | signup TOFU-rempli adopté · signup blob autrui purgé · 'no-row' TOFU adopté+poussé · anonyme ne tatoue pas · les suites `rgpd-*` existantes restent vertes |

Chaque commit : `node -c` (app.js, engine.js, supabase.js) + `npm test` vert + bump `CACHE_NAME` (v362 → v363 au premier commit de code). PR non mergée — vérif device Aurélien.

### B.6 Décisions à valider par Aurélien (avec reco)

| # | Question | Reco |
|---|---|---|
| **D-A** | Ordre de la file : profil → Magic Start → swipe → quiz archétype ? | **Oui** — choix minimal, comportements conservés ; Magic Start saute au bloc 4 en retirant une entrée. Alternative si tu préfères : quiz archétype déplacé au 1er accès à l'onglet Jeux (encore moins de friction) — dis-le, c'est le même coût. |
| **D-B** | Appareil vierge = **onboarding-first**, login accessible par lien « J'ai déjà un compte » sur q1 ? | **Oui** — c'est le cœur du découplage demandé ; standard de l'industrie. Conséquence assumée : un utilisateur existant sur appareil neuf fait 1 tap de plus. |
| **D-C** | Le tunnel d'entrée ne force PAS la création de compte (elle reste où elle est aujourd'hui) ? | **Oui** pour le bloc 1 — zéro refonte d'UI compte ; l'adoption 1e garantit que le profil survivra au compte créé plus tard. |
| **D-D** | Critère d'adoption au signup/'no-row' : `pas d'ownerUid && !_isDefaultDB` → adopter (sinon purge actuelle) ? | **Oui** — réutilise le critère d'INTENTION déjà validé (décision Aurélien, RC4 v2) ; ne touche ni l'anti-fuite ni l'anti-résurrection. |
| **D-E** | Exclure les uid anonymes de `resolveIdentity` dans le handler auth (comme au boot) ? | **Oui** — sans ça, D-D est contourné par le tatouage anonyme du boot. Retouche d'1 ligne + test. |

### B.7 Ce que le bloc 1 ne touche PAS

Contenu des écrans v337 · collecte du corps (`obSaveQ3` bw=0 — bloc 2) · « Maison »=calisthenics (bloc 3) · suppression de Magic Start (bloc 4) · `trainingDuration`/code d'invitation (bloc 5) · les fixes #2-#6 du scope originel.

---

## C. HORS-SCOPE — signalé sans corriger

1. **Trou RC4 préexistant** : `_preAdoptLogs` jamais réinjecté sur `'no-row'` (supabase.js:391 vs 405-408) → séances offline TOFU perdues sur compte neuf. Le 1e le corrige de fait ; sinon à traiter séparément.
2. **Doublon prompt install iOS** : `#iosInstallGuide` (+30 s, flag localStorage, index.html:3555-3562) vs `#ios-install-banner` (+3 s, flag `db.user._iosInstallPromptShown`, app.js:15150-15189) — deux mécanismes, deux flags.
3. **Overlays artisanaux hors système unifié** : quiz archétype, Magic Start, swipe, social, `setNewPasswordOverlay`/`magicLinkMigrationOverlay` (z 99999) — pas de pile LIFO/Échap/scroll-lock (dette connue §UI overlays, vagues 2-3).
4. **2e voie d'écriture `onboarded=true`** : `pbGenerateProgram` (builder, app.js:13740-13752) pose le flag sans `obFinish` — à garder en tête pour les invariants de la file.
5. **Dérives CLAUDE.md** (le code fait foi) : `CACHE_NAME` = **trainhub-v362** (doc : v350) · `ONBOARDING_VERSION` à **engine.js:16** (doc : :12) · `STORAGE_KEY` à engine.js:10 (doc : :11). À corriger dans CLAUDE.md lors du prochain commit de code.
6. **`_restoreLastTabFromCloud` → onglet Social au boot** peut ouvrir le social par-dessus un welcome-back — le 1d le neutralise pour la file ; le cas « onboardé version à jour » reste possible (mineur).

## D. À ROUTER CLAUDE.AI (Supabase)

Rien pour ce bloc en phase diagnostic. Après l'implémentation 1e : vérifier qu'un compte test créé APRÈS un onboarding local a bien son blob `sbd_profiles` rempli (pas un defaultDB) et `bestPR` cohérent.

---

**STOP.** Aucun code modifié. J'attends la validation de §B (et les réponses D-A à D-E) avant le commit 1a.
