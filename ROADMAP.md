# TrainHub — ROADMAP Autonome (mise à jour mai 2026)

## RÈGLES ABSOLUES (ne jamais violer)

### Sécurité du code
- Lire TOUT le code concerné avant de modifier quoi que ce soit
- Faire `node -c js/app.js js/engine.js js/coach.js js/program.js js/supabase.js` après chaque modification
- Faire un audit Playwright après chaque feature (screenshots + vérification visuelle)
- Ne JAMAIS commiter si `node -c` échoue
- Commiter chaque étape séparément avec un message clair

### Sécurité des données
- Ne JAMAIS modifier la structure de `db.logs`
- Ne JAMAIS modifier `db.bestPR` directement
- Ne JAMAIS toucher aux politiques RLS Supabase (laisser Claude.ai le faire)
- Ne JAMAIS hardcoder de données utilisateur
- Toujours tester avec les 3 profils : débutant (cold start), intermédiaire, avancé

### Sécurité du build
- Bumper le SW après chaque groupe de commits
- Ne JAMAIS supprimer une fonction sans grep complet dans tout le codebase
- Maximum 1 feature par commit

---

## CHECKLIST AVANT CHAQUE COMMIT

```bash
node -c js/app.js && node -c js/engine.js && node -c js/coach.js && node -c js/supabase.js
grep -r "Aurélien\|Jordan\|Léa\|smoothapp68" js/ --include="*.js"
```

---

## ÉTAT DU PROJET — au 9 juillet 2026 (SW v321)

> Réécrit après l'audit `DOC_AUDIT.md` : 9 tâches « à faire » de l'ancienne roadmap étaient en
> réalité LIVRÉES (re-vérifiées dans le code, fichier:ligne ci-dessous). Tout le travail v151→v321
> (nomenclature, observabilité, polish) n'y figurait pas. Voir aussi `POLISH_DIAGNOSTIC.md`.

### ✅ FAIT

**Fondations (Phases 1-3 historiques)**
- [x] TÂCHE 1-4 : stabilisation (orphelins, icônes PWA, custom builder, backup v2)
- [x] TÂCHE 5-6 : Transfer Matrix auto-apprenante, Offline first (GO sans réseau)
- [x] TÂCHE 8 : nettoyage fonctions mortes (récurrent — encore v300)

**Physiologie & personnalisation (ex-« à faire », confirmé dans le code)**
- [x] TÂCHE 7 : module cycle menstruel — `MENSTRUAL_PHASES`/`getCycleCoeff` engine.js:3259-3335, C_cycle app.js:21829
- [x] TÂCHE 10 : onboarding 3 questions + flags profil — `ONBOARDING_PROFILES` app.js:1735
- [x] TÂCHE 11 : vocabulaire adaptatif — `getVocab`/`VOCAB` engine.js:33
- [x] TÂCHE 12 : 5-Rep Test calibration — `calcE1RMFrom5RepTest` engine.js:4081
- [x] TÂCHE 13 : streak intelligent (jours de repos ne cassent pas) — `smartStreak`/`calcStreak` app.js:4299
- [x] TÂCHE 14 : badges de compétence — precision_rpe/tempo_master/consistency_king/pr_hunter/volume_beast app.js:3972
- [x] TÂCHE 16 : churn detection + réactivation — `detectChurn` app.js:26702
- [x] TÂCHE 18 : Bluetooth FC live GO — `toggleBluetoothHR` (Web Bluetooth GATT) app.js:26771
- [x] TÂCHE 19 : Weight Cut module — `WEIGHT_CUT_COEFFICIENTS`/`calcWeightCutPenalty` engine.js:4101-4214

**Travail v151→v321 (absent de l'ancienne roadmap)**
- [x] Nomenclature exercices (Lots 1/2/A/B/B-2) — `EXO_SYNONYMS`/`WP_SYNONYMS`/`matchExoName`, `nameAlt`, `mergeExerciseData` ; réf `audit/64-70`
- [x] Observabilité : Sentry (`js/sentry-init.js`) + télémétrie silencieuse `error_logs` (supabase.js:189)
- [x] Cardio stats (fusion logs + activityLogs) — `computeCardioStatsData` app.js:15419
- [x] Sparklines e1RM (GO + cartes exercice) — `_renderGoSparklines` app.js:27391
- [x] Fusion sync cross-device non-destructive — supabase.js:611
- [x] Freemium : gate coaching IA — engine.js:5719 (Edge Function `coach-ai`)
- [x] Polish Chantier A (v312-319) : modales unifiées, scroll-lock, fonds opaques, confirmations, CSS nettoyé
- [x] Garde-fou version SW source-unique (v321) — `getSWVersion`, plus de littéral figé

### 🔄 EN COURS / PARTIEL
- [~] TÂCHE 9/17 Garmin/Health Connect : import CSV + RHR/TRIMP FAITS (`parseGarminCSV` app.js:17505) ; API live / Edge Function RESTANTE (`connectHealthConnect` = placeholder app.js:17456)
- [~] TÂCHE 15 notifications J1→J30 : programmation CLIENT faite (app.js:14892) ; push SERVEUR (table `notification_schedule` + Edge Function) restant
- [~] TÂCHE 20 paywall Premium : gate coaching IA fait ; **SRS/APRE/Garmin NON gatés**, pas de Stripe/billing

### 📋 À FAIRE — priorisé
1. **Freemium (priorité #1)** : décider le périmètre gratuit/payant, gater les features premium, brancher Stripe (`profiles.tier` / `stripe_customer_id` déjà en place)
2. **Polish restant** (`POLISH_DIAGNOSTIC.md`) : chantier B (mouvement/sous-onglets), E (fluidité : virtualisation picker 881 items + fix 429), C (tokens couleur), D (boutons/états)
3. **Dette `family`** : le champ `family` sur EXO_DATABASE (18 valeurs/139 entrées) n'est PAS consommé et n'est PAS aligné avec le vocabulaire porteur de `EXERCISE_TRANSFER_MATRIX` (engine.js:2391) — trancher : aligner (spec `audit/67`) ou retirer la métadonnée dormante
4. **Push serveur notifications** (TÂCHE 15 côté serveur) + **Garmin API live** (TÂCHE 9/17)

---

## FORMAT DE RAPPORT APRÈS CHAQUE TÂCHE

Après chaque tâche, mettre à jour `TODO.md` :
```
## Tâche N — [Nom] ✅
- Commits : [hash]
- Tests : [résultat playwright]
- Notes : [observations]
- Supabase migration needed : [oui/non — décrire si oui]
```

Ne pas modifier Supabase directement —
noter les migrations nécessaires dans `TODO.md` pour que Claude.ai les applique.
