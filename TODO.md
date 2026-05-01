# TrainHub — TODO (état en temps réel)

## État général
- Score Gemini : 9.2/10
- SW version : v127
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

## 🔄 En cours / À faire

### PHASE 5 — Reste
- [ ] TÂCHE 9 : Health Connect API native (Supabase Edge Functions, attendre validation)
- [ ] TÂCHE 20 : Paywall features Premium

## Migrations Supabase en attente
(à appliquer par Claude.ai après chaque tâche)
- TÂCHE 15 (notifications J1→J30) : nécessite table `notification_schedule` en Supabase
  - Colonnes : user_id, day_number (1-30), scheduled_at, sent_at, title, body, type
  - RLS : user peut lire ses propres lignes, Edge Function peut écrire
