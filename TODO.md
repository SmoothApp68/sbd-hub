# TrainHub — TODO (état en temps réel)

## État général
- Score Gemini : 9.2/10
- SW version : v119
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
- [x] Backup automatique (actuellement 5 versions)
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

## 🔄 En cours / À faire

### PHASE 1 — Stabilisation
- [x] TÂCHE 1 : Supprimer constants.js + utils.js orphelins — commit 5dbe918
- [x] TÂCHE 2 : Icônes PWA qualité + séparation any/maskable — commit eb260f5
- [x] TÂCHE 3 : Exercices manquants Custom Builder — vérification : tous présents dans EXO_DATABASE (exercises.js), aucun ajout nécessaire
- [x] TÂCHE 4 : Backup programme v2 (15 versions + dates) — déjà implémenté (15 backups, firstUsedAt/lastUsedAt/sessionCount, UI "Du X au Y · N séances")

### PHASE 2 — Qualité coaching
- [x] TÂCHE 5 : Transfer Matrix auto-apprenante — commit c4703d5 — getTransferRatio() ajouté dans engine.js (ratio réel user en priorité, fallback EXERCISE_TRANSFER_MATRIX)
- [x] TÂCHE 6 : Offline first (GO sans réseau) — commit 1178e6f — debouncedCloudSync() gère navigator.onLine, db.pendingSync, window.addEventListener('online') auto-sync, toast "📱 Séance sauvegardée localement" sur session native

### PHASE 3 — Différenciation
- [ ] TÂCHE 7 : Health Connect / Garmin (attendre validation)
- [ ] TÂCHE 8 : Module cycle menstruel (attendre validation)
- [ ] TÂCHE 9 : Nettoyage 44 fonctions mortes app.js

## Migrations Supabase en attente
(à appliquer par Claude.ai après chaque tâche)
- Aucune pour l'instant
