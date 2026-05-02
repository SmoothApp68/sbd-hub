# TrainHub — TODO (état en temps réel)

## État général
- Score Gemini : 9.2/10
- SW version : v128
- Objectif : lancement multi-users juillet 2026

## ✅ Complété

### Architecture & Algo
- [x] Périodisation 7 phases + DUP hybride
- [x] APRE + Shadow Weight + Back-off sets dynamiques
- [x] SRS (ACWR + Readiness + Trend)
- [x] Live Coaching GO + hiérarchie
- [x] Proxy VBT grind (9G, seuils par phase)
- [x] APRE bridé par phase (85% e1RM hypertrophie)
- [x] Grind Peak = 0G
- [x] isAbandoned flag (séries abandon exclues e1RM)
- [x] analyzeAthleteProfile() — diagnostic sans IA
- [x] Cold Start — semaine calibration
- [x] Bilan du matin (sommeil + readiness)
- [x] Sleep Penalty -5%
- [x] Prehab génératif
- [x] Activités secondaires injectées automatiquement

### Programme
- [x] Custom Programme Builder
- [x] Bibliothèque 800+ exercices
- [x] Backup automatique (15 versions + dates + sessionCount)
- [x] Sync multi-appareils (timestamp serveur)

### Social
- [x] Feed + profil ami enrichi
- [x] Notifications temps réel

### Qualité
- [x] getMRV genre normalisé (F/M/female)
- [x] NaN SÉRIES corrigé dans Stats Volume
- [x] coach.js + program.js dans SW cache
- [x] escapeHtml sur usernames
- [x] RLS vérifiées (propres)

### PHASE 1 — Stabilisation
- [x] TÂCHE 1 : Supprimer constants.js + utils.js orphelins — commit 5dbe918
- [x] TÂCHE 2 : Icônes PWA qualité + séparation any/maskable + icône notifications — commit eb260f5
- [x] TÂCHE 3 : Exercices manquants Custom Builder — tous présents dans EXO_DATABASE, aucun ajout nécessaire
- [x] TÂCHE 4 : Backup programme v2 — déjà implémenté (15 backups, firstUsedAt/lastUsedAt/sessionCount)

### PHASE 2 — Qualité coaching
- [x] TÂCHE 5 : Transfer Matrix auto-apprenante — commit c4703d5
- [x] TÂCHE 6 : Offline first (GO sans réseau) — commit 1178e6f

### PHASE 3 — Différenciation
- [x] TÂCHE 7 : Module cycle menstruel (PhysioManager) — commits a7acb40 + 43f37d5
  - ÉTAPE A : MENSTRUAL_PHASES + getCycleCoeff/getMRVWithCycleAdjust/getRestWithCycleAdjust → engine.js
  - ÉTAPE B : cycleCoeff intégré dans computeSRS() → coach.js
  - ÉTAPE C : wpComputeWorkWeight ajuste la charge selon la phase → app.js
  - ÉTAPE D : renderCoachTodayHTML affiche carte phase + alerte blessure → app.js
  - ÉTAPE E : renderSettingsProfile affiche section menstruel (genre F uniquement) → app.js
  - ÉTAPE F : toggleMenstrualTracking / saveMenstrualData / menstrualResetToday → app.js
  - ÉTAPE G : migration migrateDB (menstrualEnabled + menstrualData) → app.js
  - Supabase migration needed : non (données dans db.user, sync via sbd_profiles)
- [x] TÂCHE 8 : Nettoyage fonctions mortes app.js — 29 fonctions supprimées, 595 lignes — commits 1e63c2f, 261b82c, db24f5c

### PHASE 4 — Lancement
- [x] TÂCHE 10 : Onboarding 3 questions + ONBOARDING_PROFILES — commit 30c7d29
  - 3 étapes (Q1 profil, Q2 objectif, Q3 matériel) pour nouveaux utilisateurs
  - ONBOARDING_VERSION bumped à 3
  - vocabLevel, skipPRs, skipRPE, obProfile migrés dans db.user
- [x] TÂCHE 11 : Vocabulaire adaptatif (VOCAB + getVocab) — commit 40fe86d
  - VOCAB constant dans engine.js (e1rm, rpe, peak, apre, srs, deload, acwr, mrv, mev)
  - getVocab() utilisé dans formatRPE, coach SRS gauge, messages deload
- [x] TÂCHE 12 : 5-Rep Test calibration débutants — commit 74a0d56
  - calcE1RMFrom5RepTest() dans engine.js (Brzycki × 0.85)
  - Carte calibration dans GO idle si cold start + skipPRs profile
  - saveFiveRepTest() → stocke dans db.exercises[name].shadowWeight
- [x] TÂCHE 13 : Streak intelligent (calcSmartStreak) — commit 0ae4e93
  - Ne se casse que sur jours de séance prévus ratés
  - Jours de repos ignorés dans le compte
- [x] TÂCHE 14 : Badges de compétence (5 nouveaux) — commit c853153
  - precision_rpe, tempo_master, consistency_king, pr_hunter, volume_beast
  - Section "Compétence" ajoutée dans l'UI badges
- [x] TÂCHE 16 : Churn detection + réactivation — commit f396aa1
  - detectChurn() : médiane intervalle × 2 = seuil absence
  - Message empathique dans Coach Today selon durée d'absence

### PHASE 5 — Post-lancement
- [x] TÂCHE 15 : Notifications J1→J30 — commit 49562b3
  - NOTIFICATION_SCHEDULE (6 waypoints), calcWeeklyTonnage(), checkScheduledNotifications()
  - Appelée depuis postLoginSync() après login, 1 notif max/jour
  - db.user.onboardingDate défini dans obFinish()
- [x] TÂCHE 17 : Health Connect / Garmin CSV + RHR analysis — commit d925a42
  - ÉTAPE A : UI Health Connect dans renderSettingsProfile()
  - ÉTAPE B : connectHealthConnect(), showGarminCSVImport(), parseGarminCSV(), analyzeRHR()
  - ÉTAPE C : alerte RHR dans analyzeAthleteProfile() → engine.js
  - ÉTAPE D : RHR penalty dans wpComputeWorkWeight() (-5% warning, -20% danger)
  - Supabase migration needed : non (données dans db.rhrHistory via sbd_profiles)
- [x] TÂCHE 18 : Bluetooth FC live GO — commit 25d4d32
  - toggleBluetoothHR() : Web Bluetooth API (Chrome Android)
  - updateHRDisplay() : bpm + % FCmax + indicateur "Prêt"
  - Widget FC sous le timer de repos pendant la séance
- [x] TÂCHE 19 : Weight Cut module — commit 1e128eb
  - WEIGHT_CUT_COEFFICIENTS : bench×1.5, squat×1.0, deadlift×0.5
  - calcWeightCutPenalty() : LPF basé sur % perte de poids corporel
  - getWeightCutWeek(), detectMuscleLoss(), getWeightCutAlerts() → engine.js
  - Pénalité intégrée dans wpComputeWorkWeight() après RHR, avant APRE cap
  - Section Weight Cut dans analyzeAthleteProfile() (progrès + alertes)
  - UI Réglages : toggle + saisie poids + barre de progrès + date compétition
  - toggleWeightCut() / saveWeightCutData() CRUD → app.js
  - Supabase migration needed : non (données dans db.user.weightCut via sbd_profiles)

- [x] FEATURE Activités Secondaires : Total Load Management — commit 5ef1632
  - ACTIVITY_SPEC_COEFFICIENTS (11 types) + RECOVERY_ACTIVITIES + ACTIVITY_TRIMP_THRESHOLDS
  - calcActivityTRIMP() : TRIMP = durée × RPE × C_spec (trail bonus dénivelé)
  - getRecoveryBonus() : yoga/pilates hier → +5% Readiness dans SRS
  - getActivityPenaltyFlags() : volume/shoulder/warning flags selon TRIMP 24h
  - getDominantTrainingMode() + checkSwimmingInterference() → analyzeAthleteProfile()
  - wpComputeWorkWeight() : -3% si charge secondaire lourde (≥400 TRIMP)
  - computeSRS() : recoveryBonus + forceActiveRecovery si ACWR > 1.6 ou TRIMP critique
  - renderCoachTodayHTML() : carte '⚡ Budget Récupération' (barre empilée muscu/activités)
  - calcTRIMPFromGarminZones() : mapping zones FC Garmin → TRIMP
  - SW v128

### Gemini Q4.1 — Features critiques
- [x] FEATURE 1 : Transparence algorithmique (ℹ️ Pourquoi ce poids ?) — commit 64b9fe9
  - explainWeight() : breakdown phase %, RPE trend, sleep/RHR/WC/cycle penalties
  - Bouton ℹ️ dans chaque carte exercice GO, à côté de l'e1RM
- [x] FEATURE 2 : Substitution d'exercice intelligente — commit 64b9fe9
  - getSubstitutes() : même groupe musculaire, ratio transfer matrix
  - showSubstituteMenu() : modal avec % équivalence + charge adaptée
  - substituteExercise() : remplace in-session, flag isSubstituted (e1RM protégé)
  - goReplaceExercise() → utilise le menu smart (fallback recherche manuelle)
- [x] FEATURE 3 : Trophées sociaux / Écran célébration PR — commit 64b9fe9
  - checkAndShowPRCelebration() : détecte nouveaux PRs à la finalisation
  - showPRCelebration() : écran 🏆 avec gain + bouton partage social
  - sendLocalNotification() avec détail du PR
  - SW v127

## ✅ SESSION NUIT — Audit Ultra-Complet v128 + Implémentations (mai 2026)
- SW : v128 → **v129** (6 commits)

### B1 — Bug fixes critiques ✅ — commit 94e5968
- `_getWeekStart()` dupliqué (app.js l.13924 écrasait l.3017) — cassait m_consistency challenge
- `isCreator()` vérifie uniquement `db.user.isCreator === true` (supprimé check nom hardcodé)
- Migration one-shot Aurélien → powerbuilding supprimée
- Guard `typeof Chart !== 'undefined'` ajouté dans 4 fonctions de rendu graphique

### B2+B3 — TRIMP Force + HRV z-score dans SRS ✅ — commit f1a171d
- `calcWeeklyTRIMPForce()` : Σ reps×RPE²×C_slot (Foster 2001 adapté powerbuilding)
- `calcHRVZScore()` : z-score HRV sur 7j depuis rhrHistory[].hrv
- Pondération dynamique SRS : avec HRV → ACWR 40% + HRV 30% + Read 15% + Trend 15%
- Zones ACWR powerbuilding : 0.8-1.2 optimal, 1.2-1.4 overreach tolérable, >1.5 danger

### B4 — Arbre de décision plateau ✅ — commit 0face3e
- `classifyStagnation(liftType)` : 4 branches (sur_atteinte/fatigue/consolidation/plateau_reel)
- Intégré dans `analyzeAthleteProfile()` section 7 "Analyse Progression SBD" pour SBD

### B5 — TDEE Katch-McArdle ✅ — commit 043a5bd
- `calcTDEEKatchMcArdle(bw, fatPct, activityFactor, weeklyTRIMP)` dans engine.js
- Activé si `db.user.fatPct` disponible (priorité sur Mifflin-St Jeor)

### B6 — Guards console.log ✅ — commit a11ab99
- Migration STORAGE_KEY conditionné derrière DEBUG
- generateWeeklyPlan : condition DEBUG inversée corrigée (loggait en prod)

### B7 — DB maintenance ✅ — commit 3b98c2a
- `db.user.fatPct` (null) dans defaultDB() + migration migrateDB()
- Note : `_realLevel` est write-only (écrit dans validateUserLevel() mais jamais relu)
  → À connecter lors TÂCHE 20 pour adapter contenu selon niveau réel

### B8 — Guards Premium (audit) ✅
- TÂCHE 20 non encore implémentée — toutes features accessibles
- `coachProfile` contrôle verbosité seulement (pas paywall)

### Audit RLS (A4) — NE PAS MODIFIER
- ✅ Toutes 17 tables ont rowsecurity=true
- ℹ️ Quelques tables avec roles={public} pour write — sécurité via WITH CHECK
- ℹ️ SELECT ouverts sur tables sociales (challenges/leaderboard/reactions) — intentionnel

## ✅ SESSION — Cohérence Algorithmique v129 → v130 (mai 2026)
- SW : v129 → **v130** (5 commits)

### FIX 1+5 — Hard Cap + Kill Switch + Cold Start Guard ✅ — commit a556516
- `isE1RMStabilized(exoName)` : vrai si ≥3 sessions de l'exercice dans db.logs
- Hard Cap : `baseWeight ≤ e1rmRef × 1.025` arrondi à 2.5kg (après toutes pénalités)
- Kill Switch : si pénalités cumulées < 70% → return `{forceActiveRecovery:true}`
- Pénalités physiologiques (sommeil/RHR/cycle/activité) skippées jusqu'à stabilisation

### FIX 2+3 — TRIMP Force normalisé + HRV robuste ✅ — commit a3499c7
- `calcWeeklyTRIMPForce` : divisé par 15 (alignement échelle Bannister cardio)
- `calcChronicTRIMPForce` : divisé par 60 (weekly avg ÷15)
- `calcHRVZScore` : exige minimum 7 lectures HRV (était 3), lit 10 entrées, z capé ±3

### FIX 4 — classifyStagnation amélioré ✅ — commit 98d5330
- Sur-atteinte : seuil continu `trend<-0.03` ou `trend<-0.015+rpe>9.5` (peak) / `rpe>9.0`
- Nouveau cas `monitoring` entre consolidation et plateau_reel
- Seuils élargis à 0.01 (était 0.005) pour détection réaliste

### FIX 6 — Weight Cut 14j moving average ✅ — commit ac7218b
- `getSmoothedBodyWeight()` : moyenne des `weeklyLogs[].weight` sur 14 jours
- `calcWeightCutPenalty()` utilise poids lissé (plus de faux positifs rétention hormonale)

## 🔄 En cours / À faire

### PHASE 5 — Reste
- [ ] TÂCHE 9 : Health Connect API native (Supabase Edge Functions, attendre validation)
- [ ] TÂCHE 20 : Paywall features Premium
  - Gate : db.user.tier (free/premium/founder)
  - Features à gater : SRS dynamique, APRE avancé, analyzeAthleteProfile complet
  - Exposer db.user.fatPct dans UI Réglages pour Katch-McArdle

## Migrations Supabase en attente
(à appliquer par Claude.ai après chaque tâche)
- TÂCHE 15 (notifications J1→J30) : nécessite table `notification_schedule` en Supabase
  - Colonnes : user_id, day_number (1-30), scheduled_at, sent_at, title, body, type
  - RLS : user peut lire ses propres lignes, Edge Function peut écrire
