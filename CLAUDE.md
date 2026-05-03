# CLAUDE.md — Contexte Complet TrainHub

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il contient tout ce qu'il faut savoir sur TrainHub pour travailler efficacement.
> **Ne jamais supprimer ce fichier. Le mettre à jour après chaque feature majeure.**

---

## 1. IDENTITÉ DU PROJET

**TrainHub** — PWA fitness premium de coaching algorithmique.
- URL : https://smoothapp68.github.io/sbd-hub
- Repo : SmoothApp68/sbd-hub
- Positionnement : "Data-Driven Powerbuilding — l'algorithme de force piloté par votre physiologie globale"
- Cible : powerbuilders, powerlifters, intermédiaires, femmes (cycle menstruel)
- Prix : Freemium + Premium 9.99€/mois + Lifetime 149€

---

## 2. STACK TECHNIQUE

```
Vanilla JS (pas de bundler, pas de framework)
GitHub Pages (smoothapp68.github.io/sbd-hub)
Supabase PostgreSQL eu-west-1 (Paris) — projet swwygywahfdenyzotrce
Service Worker (offline complet, Chart.js bundlé localement)
localStorage clé : SBD_HUB_V29
```

### Fichiers JS (ordre de chargement dans index.html)
```
js/engine.js      — Calculs purs : APRE, e1RM, TRIMP, ACWR, SRS, DUP zones
js/exercises.js   — Base 800+ exercices
js/supabase.js    — Auth, sync cloud, leaderboard, challenges
js/import.js      — Import CSV Hevy
js/stats.js       — Statistiques et graphiques
js/coach.js       — Textes coach, recommandations
js/social.js      — Feed social, amis
js/program.js     — Génération programme (wpGeneratePowerbuildingDay)
js/app.js         — TOUJOURS EN DERNIER (~22 500 lignes)
```

**Règle absolue : app.js toujours chargé en dernier.**

---

## 3. RÈGLES DE DÉVELOPPEMENT

### Ne jamais faire
- Modifier app.js sans lire la zone concernée en entier
- Refactoriser une fonction de calcul sans tests (wpComputeWorkWeight, computeSRS, etc.)
- Ajouter des dépendances CDN externes (tout doit être bundlé localement)
- Créer des modules ES6 (vanilla JS uniquement, pas d'import/export)
- Hardcoder des données utilisateur (tout doit fonctionner pour n'importe quel profil)
- Double-compter le tonnage (MUSCLE_PARENT_MAP gère l'accumulation correctement)
- Appeler des APIs AI dans la logique de coaching (100% algorithmique)

### Toujours faire
- `node -c js/app.js` après chaque modification
- Un commit par fichier, push après chaque commit
- Lire la zone de code AVANT de modifier
- Signaler les problèmes hors-scope sans les corriger
- Bumper le SW après chaque feature

### Pattern migrations DB
```js
// Dans migrateDB() dans app.js :
if (db.user.newField === undefined) db.user.newField = defaultValue;
```

---

## 4. ALGORITHMES CLÉS

### wpComputeWorkWeight() — Ordre des pénalités
1. Base APRE depuis e1RM zone DUP + phase
2. Sleep Penalty : -5% si sommeil ≤ 2/5
3. RHR Penalty : -5%/-20% si FC +5/+10bpm vs moyenne 7j
4. Cycle Menstruel C_cycle : 0.80 (lutéale) → 1.10 (folliculaire tardive)
5. Weight Cut LPF : e1RM × (1 - loss% × C_lift), moyenne mobile 14j
6. Activity Penalty adaptatif : seuil DOTS-dépendant (300/450/600 TRIMP)
7. Fatigue Penalty : -3% à -15% selon position exercice
8. APRE Cap par phase : 75% à 100%
9. Mental Recovery : -3%/-1%/0% décroissance 3 séances après fail rep
10. Return-to-Play : -8%/10j, -15%/14j, -18%/>14j
11. Hard Cap 102.5% e1RM
12. Kill Switch : <0.70 cumulé → forceActiveRecovery
13. Floor global : jamais <60% base

### DUP — Registres e1RM séparés
```js
getDUPZone(reps) : ≤5 → 'force', 6-12 → 'hypertrophie', >12 → 'vitesse'
// Zone Force    : e1RM × 1.00
// Zone Hypert.  : e1RM × 0.94
// Zone Vitesse  : e1RM × 0.88
// Tethering ±15% entre zones
```

### SRS (Sport Readiness Score)
```js
// Sans HRV : ACWR 60% + Readiness 20% + Trend 20%
// Avec HRV : ACWR 40% + HRV z-score 30% + Readiness 15% + Trend 15%
// HRV z-score : min 7 jours, capé ±3
```

### TRIMP (Training Impulse)
```js
// Force : Σ(sets × reps × RPE² × C_slot) ÷ 15  (normalisé Bannister)
// C_slot : main_lift 1.5, accessory 1.2, isolation 1.0
// Cardio : durée × RPE × C_spec
ACTIVITY_SPEC_COEFFICIENTS = {
  natation: 0.8, course: 1.2, trail: 1.4, velo: 1.0,
  yoga: 0.5, arts_martiaux: 1.6, sports_collectifs: 1.5
}
```

### calcE1RM — DEUX versions intentionnellement différentes
```js
// app.js:1092 — Brzycki simple (utilisée partout dans app.js)
function calcE1RM(w, r) { return r <= 1 ? w : Math.round(w / (1.0278 - 0.0278 * r)); }

// program.js — Moyenne pondérée Epley + Brzycki avec cap 12 reps
function _calcE1RMPrecise(weight, reps) { ... }
// NE PAS fusionner — formules différentes pour usages différents
```

### LP → APRE (3 Strikes)
```js
// Strike 1 (RPE ≥ 9.5) → retry même poids
// Strike 2 → deload -10%
// Strike 3 → transition APRE (lpActive = false)
// isInLP() : DOTS total SBD < seuil + durée < 12 semaines
```

---

## 5. STRUCTURE DES DONNÉES

### localStorage (clé SBD_HUB_V29)
```js
db = {
  user: {
    name, age, bw, height, gender,
    onboardingProfile,    // 'debutant'|'intermediaire'|'powerlifter'|'yoga'|'senior'|'reeducation'
    programParams: { freq, goal, level, intensity },
    onboardingPRs: { squat, bench, deadlift },
    barWeight,            // 20 (olympique), 15 (femmes), 10 (technique)
    units,                // 'kg' | 'lbs'
    tier,                 // 'free' | 'premium'
    lpActive,             // true si en Progression Linéaire
    lpStrikes,            // { 'Squat (Barre)': 1, ... }
    activityTemplate,     // Programme fixe activités secondaires
    consentHealth,        // RGPD
    medicalConsent,
    _activityMigrated,    // Flag migration v142
    _dupMigrated          // Flag migration DUP
  },
  logs: [],               // Séances (ordre: plus récent en premier, index 0)
  exercises: {            // e1RM par exercice
    'Squat (Barre)': { e1rm: 157, shadowWeight: 155, lastRPE: 7.5 }
  },
  bestPR: { squat: 148, bench: 140, deadlift: 186 },
  weeklyPlan: null,       // Généré par generateWeeklyPlan()
  activityLogs: [],       // Vraies activités faites (vs template = prévu)
  earnedBadges: {},       // { 's25': { earnedAt, xp } } — jamais révoqués
  xpHighWaterMark: 0,     // XP ne peut que monter
  _ghostLogAnswered: null // Date ISO — reset chaque jour
}
```

### Supabase — Tables principales
```
sbd_profiles        — JSONB principal (col 'data'), sync bidirectionnelle
profiles            — Username, flags, tier, admin
activity_logs       — Vraies activités faites (source: 'manual'|'garmin'|'ghost')
leaderboard_entries — Classement XP/DOTS/volume (SELECT public)
friend_challenges   — Défis entre amis (SELECT participants seulement)
error_logs          — Télémétrie silencieuse (INSERT public, SELECT admin)
user_consents       — RGPD versionnée
menstrual_logs      — RLS stricte (SELECT own uniquement)
waitlist            — Emails bêta (INSERT public, SELECT admin)
```

---

## 6. FONCTIONS REFACTORISÉES (ne pas recombiner)

### renderGamificationTab() — v148
```js
// 638L → 20L orchestrateur + 11 sous-fonctions
function renderGamificationTab() {
  var ctx = _buildGamContext();      // contexte partagé calculé une fois
  _renderGamMuscleAnatomy();
  _renderGamWeeklyRecap(ctx);
  _renderGamLevelCard(ctx);
  _renderGamXPSources(ctx);
  _renderGamChallenges(ctx);
  _renderGamMonthlyChallenges(ctx);
  _renderGamSBDRanks(ctx);
  _renderGamStrengthCards(ctx);
  _renderGamHeatmap(ctx);
  _renderGamBadges(ctx);
  _renderLeaderboard();
  renderFriendChallenges();
}
```

### getAllBadges() — v149
```js
// 343L → 18L orchestrateur + 10 sous-fonctions
function getAllBadges() {
  var b = [];
  var stats = _computeBadgeStats(); // 1 seul pass sur db.logs
  _buildSessionBadges(b, stats);
  _buildVolumeBadges(b, stats);
  _buildDurationBadges(b, stats);
  _buildPRBadges(b, stats);
  _buildSBDBadges(b, stats);
  _buildStreakBadges(b, stats);
  _buildExerciseBadges(b, stats);
  _buildSkillBadges(b, stats);
  _buildStatusBadges(b, stats);
  _buildCollectorBadges(b);
  _applyWellnessTheme(b);
  return b;
}
```

---

## 7. GAMIFICATION

```
98 badges total
Types : 'achiever' (permanent) | 'status' (peut se griser, XP conservé)
earnedBadges : jamais révoqués (db.earnedBadges)
xpHighWaterMark : XP ne descend jamais

Badges status actuels :
- status_consistency  : 12 séances/mois
- status_warrior      : 4 séances/semaine
- status_volume_king  : TRIMP > 800/semaine
- status_early_bird   : 5 séances avant 9h/mois
- status_comeback     : reprise après 10j d'absence
- status_pr_month     : 3 PRs/mois
```

---

## 8. ACTIVITÉS SECONDAIRES (architecture v142)

```js
// Template (prévu) vs Logs (réel) — NE PAS mélanger
db.user.activityTemplate = [
  { type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45, fixed: true }
]
db.activityLogs = [
  { date: '2026-05-01', type: 'natation', duration: 45, trimp: 108, source: 'manual' }
]

// Mapping clés onboarding → clés internes
ACTIVITY_KEY_MAP = { swimming:'natation', running:'course', cycling:'velo', ... }

// Seuil removeAccessories adaptatif
// DOTS < 250 → 300 TRIMP | DOTS 250-400 → 450 TRIMP | DOTS > 400 → 600 TRIMP
```

---

## 9. RGPD & SÉCURITÉ

```
- Consentement santé explicite (modal bloquante, db.user.consentHealth)
- Consentement médical obligatoire onboarding (db.user.medicalConsent)
- Droit à l'oubli : delete_user_complete_data() SQL
- Export JSON : exportUserData()
- IndexedDB backup séance GO par série
- Content Security Policy dans index.html
- 0 référence copyright (Dofus/Bleach remplacés en v141)
- Toutes les tables avec RLS activée
- NE JAMAIS stocker données sensibles dans error_logs
```

---

## 10. PROFIL AURÉLIEN (fondateur / compte de test)

```
Supabase profile ID : 9ed88c34-8ebb-4bda-8754-ad222b6a9bdf
user_id            : 6e2936e7-de11-4f19-89b1-d1eb5968ba35
PRs                : Bench 140kg / Squat 148kg / Dead 186kg
e1RM calculés      : Bench 148 / Squat 157 / Dead 200kg
Poids de corps     : 98kg
S/D ratio          : 0.785 (quads faibles → programme correctif)
S/B ratio          : 1.057 (bench fort par rapport au squat)
```

---

## 11. VERSIONS & HISTORIQUE

| SW | Feature principale |
|---|---|
| v128-v130 | Total Load Management, TRIMP, HRV |
| v131-v132 | LP 3-Strikes, RGPD, DUP registres séparés |
| v133-v135 | Temps repos PCr, Volume Spike, Tapering, Return-to-Play |
| v136 | Warm-up generator, Accessibilité, kg/lbs |
| v137 | Cartes partage + Waitlist |
| v138 | Audit bêta-testeur, fix waitlist route |
| v139 | Nettoyage GitHub, Social throttle |
| v140 | Humanisation UX (langage naturel, timer RPE, Express 60min) |
| v141 | Fix copyright Dofus/Bleach |
| v142 | Activités secondaires unifiées (Template+Logs), Gamification permanente |
| v143 | Seuil adaptatif, one-tap log, ghost log, badges status |
| v144 | showPRCelebration doublon, weeklyPlan J1 auto, Plate Calculator rétractable |
| v145 | Chart.js local (offline complet) |
| v146 | generateWeeklyPlan crash guard (cold-start J1) |
| v147 | Guards wpGeneratePowerbuildingDay + wpComputeWorkWeight |
| v148 | renderGamificationTab 638L→20L, Leaderboard, Friend Challenges, 6 badges status |
| v149 | getAllBadges 343L→18L, calcE1RM clarifiée, EventListeners guards, offline messages |
| v150 | Télémétrie silencieuse (error_logs) |

---

## 12. SCORES EXPERTS

| Source | Score | Version |
|---|---|---|
| Gemini (pondéré) | **9.4/10** | v149 |
| Claude Code (Playwright) | **8.5/10** | v149 |
| Claude Code (Playwright) | 7.8/10 | v148 |
| Gemini Architecture | 8.5/10 | v149 |
| Gemini Algorithmes | 9.8/10 | v149 |
| Gemini Gamification | 9.6/10 | v148 |

---

## 13. BÊTA & LANCEMENT

```
Bêta juillet 2026  : 50 users, Discord, Typeform de sélection
Ratio H/F cible    : 60% / 40% (valider PhysioManager)
Lancement public   : Septembre 2026 (rentrée fitness)
Product Hunt       : Mardi 00h01 PST
Presse             : Les Numériques, L'Équipe tech, Maddyness
Influenceurs       : Coachs Evidence-Based 10k-50k abonnés
                     Deal : Lifetime + 30% affiliation vs étude de cas 6 semaines
```

---

## 14. CE QUI RESTE À FAIRE (priorité bêta)

- [ ] Télémétrie error_logs branchée dans app.js (prompt prêt)
- [ ] calcE1RM dedup final (renommage program.js déjà fait)
- [ ] Discord ouvert pour la bêta
- [ ] Typeform de sélection bêta (à faire sur typeform.com)
- [ ] Message d'annonce waitlist (fichier prêt : message-annonce-waitlist.md)

## POST-BÊTA (ne pas faire avant)
- Découper renderCoachTodayHTML (438L) — trop risqué avant bêta
- Découper wpComputeWorkWeight (339L) — cœur de l'algo, attendre les tests
- Modularisation ES6 complète d'app.js
- Health Connect Edge Function (Garmin automatique)
- Paywall Stripe (infrastructure en place : profiles.tier, stripe_customer_id)
