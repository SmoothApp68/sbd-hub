# TrainHub — TODO (état en temps réel)

## État général
- Score Gemini : 9.2/10
- SW version : v121
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

### PHASE 3 — Différenciation (EN COURS)
- [x] TÂCHE 8 (ex-9) : Nettoyage fonctions mortes app.js — 29 fonctions supprimées, 595 lignes (batches 1-3), SW v121 — commits 1e63c2f, 261b82c, db24f5c

## 🔄 En cours / À faire

### PHASE 3 suite
- [ ] TÂCHE 7 : Module cycle menstruel (PhysioManager) — architecture validée

### PHASE 4 — Lancement (nouveau)
- [ ] TÂCHE 10 : Onboarding 3 questions + système de flags profil
- [ ] TÂCHE 11 : Vocabulaire adaptatif selon niveau
- [ ] TÂCHE 12 : 5-Rep Test calibration débutants
- [ ] TÂCHE 13 : Streak intelligent (jours de repos ne cassent pas le streak)
- [ ] TÂCHE 14 : Badges de compétence
- [ ] TÂCHE 15 : Calendrier notifications J1→J30
- [ ] TÂCHE 16 : Churn detection + réactivation

### PHASE 5 — Post-lancement
- [ ] TÂCHE 17 : Health Connect / Garmin (attendre validation)
- [ ] TÂCHE 18 : Bluetooth FC live GO
- [ ] TÂCHE 19 : Weight Cut module
- [ ] TÂCHE 20 : Paywall features Premium

## Migrations Supabase en attente
(à appliquer par Claude.ai après chaque tâche)
- TÂCHE 15 (notifications J1→J30) : nécessite table `notification_schedule` en Supabase
