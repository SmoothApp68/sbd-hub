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

## TÂCHES — Dans l'ordre strict

### ✅ PHASE 1 — Stabilisation (COMPLÈTE)
- [x] TÂCHE 1 : Supprimer constants.js + utils.js orphelins
- [x] TÂCHE 2 : Icônes PWA qualité + séparation any/maskable + icône notifications
- [x] TÂCHE 3 : Exercices manquants Custom Builder (déjà présents)
- [x] TÂCHE 4 : Backup programme v2 (déjà implémenté)

### ✅ PHASE 2 — Qualité coaching (COMPLÈTE)
- [x] TÂCHE 5 : Transfer Matrix auto-apprenante
- [x] TÂCHE 6 : Offline first (GO sans réseau)

### 🔄 PHASE 3 — Différenciation (EN COURS)
- [ ] TÂCHE 7 : Module cycle menstruel (prompt prêt)
- [x] TÂCHE 8 : Nettoyage 29 fonctions mortes app.js (complété — 595 lignes)
- [ ] TÂCHE 9 : Health Connect / Garmin (attendre validation Claude.ai)

### 🆕 PHASE 4 — Lancement (NOUVEAU — validé Gemini)

#### TÂCHE 10 — Onboarding 3 questions + système de flags profil
**Priorité : HAUTE — impact direct sur taux de complétion (60% → 92%)**
**Fichiers :** js/app.js, index.html
**Action :**

Remplacer l'onboarding 7 étapes par 3 questions + micro-onboarding progressif.

```js
// Système de flags profil
var ONBOARDING_PROFILES = {
  debutant:      { skipPRs: true,  skipRPE: true,  coldStartRPE: 6, rpeMax: 7,
                   vocab: 1, message: "On s'occupe de tout. Apprends le mouvement, on gère les poids." },
  intermediaire: { skipPRs: false, skipRPE: false, coldStartRPE: 7, rpeMax: 9,
                   vocab: 2, message: "Optimise tes séances. Ne stagne plus jamais." },
  powerlifter:   { skipPRs: false, skipRPE: false, coldStartRPE: 8, rpeMax: 10,
                   vocab: 3, message: "Précision millimétrée. Domine ton prochain plateau." },
  yoga:          { skipPRs: true,  skipRPE: true,  coldStartRPE: 5, rpeMax: 7,
                   vocab: 1, message: "Force & Souplesse. Des muscles fonctionnels, sans le volume." },
  senior:        { skipPRs: true,  skipRPE: true,  coldStartRPE: 5, rpeMax: 6,
                   vocab: 1, message: "Santé & Vitalité. Protège ton corps et reste fort longtemps." },
  reeducation:   { skipPRs: true,  skipRPE: true,  coldStartRPE: 4, rpeMax: 6,
                   vocab: 1, message: "Reprends le contrôle. Ta guérison est notre priorité." }
};
```

3 questions onboarding :
1. Niveau d'expérience → détermine le profil + vocab
2. Objectif principal → détermine le mode (force/recompo/santé/mobilité)
3. Matériel disponible → détermine les exercices proposés

Collecter PRs, fréquence, blessures, activités secondaires → via micro-questions
au fil des premières séances (GO tab).

**Test :** Créer un compte test débutant et vérifier que l'onboarding ne pose pas
de questions techniques
**Commit :** `feat(onboarding): 3-question flow + profile flags system`

---

#### TÂCHE 11 — Vocabulaire adaptatif selon niveau
**Fichiers :** js/engine.js, js/app.js
**Action :**

```js
var VOCAB = {
  e1rm:  { 1: 'Force estimée',   2: 'Max théorique',   3: 'e1RM (Brzycki)' },
  rpe:   { 1: 'Difficulté',      2: 'Effort perçu',    3: 'RPE / RIR' },
  peak:  { 1: 'Intensité max',   2: 'Phase de force',  3: 'Peaking / Tapering' },
  apre:  { 1: 'Poids adaptatif', 2: 'Ajustement auto', 3: 'APRE Protocol' },
  srs:   { 1: 'Forme du jour',   2: 'Score de forme',  3: 'SRS / ACWR' },
  deload:{ 1: 'Semaine légère',  2: 'Semaine de récup', 3: 'Deload / Washout' }
};

function getVocab(key) {
  var level = (db.user && db.user.vocabLevel) || 2;
  return (VOCAB[key] && VOCAB[key][level]) || key;
}
```

Remplacer les termes techniques dans le Coach et GO par `getVocab('terme')`.
**Commit :** `feat(ux): adaptive vocabulary by user level`

---

#### TÂCHE 12 — 5-Rep Test calibration débutants
**Fichiers :** js/app.js, js/engine.js
**Action :**

Pour les profils sans PRs (debutant, yoga, senior, reeducation),
proposer un test de calibration simple à la première séance :

```js
function calcE1RMFrom5RepTest(weight, reps) {
  // Brzycki
  var e1rm = weight / (1.0278 - (0.0278 * reps));
  // Coefficient sécurité S1
  return Math.round(e1rm * 0.85 / 2.5) * 2.5;
}
```

UI dans GO : avant le premier exercice si cold start + profil débutant →
"Fais le max de reps avec une bonne forme, arrête quand c'est difficile"
→ Saisie poids + reps → calcul e1RM → stocké dans db.exercises
**Commit :** `feat(cold-start): 5-rep test calibration for beginners`

---

#### TÂCHE 13 — Streak intelligent
**Fichiers :** js/app.js
**Action :**

Le streak ne doit PAS se casser les jours de repos prévus dans le programme.
Il se casse uniquement si l'user rate une séance PRÉVUE.

**Commit :** `fix(gamification): smart streak — rest days don't break streak`

---

#### TÂCHE 14 — Badges de compétence
**Fichiers :** js/app.js (section gamification)
**Action :**

Remplacer/compléter les badges de présence par des badges de compétence :
precision_rpe, tempo_master, consistency_king, pr_hunter, volume_beast.
**Commit :** `feat(gamification): competence badges replacing presence badges`

---

#### TÂCHE 15 — Calendrier notifications J1→J30
**Fichiers :** js/supabase.js, service-worker.js
**Action :**

Implémenter un système de notifications programmées basé sur la date
d'inscription de l'user. 1 notification max par jour. Opt-out facile.
**Note :** Nécessite migration Supabase — noter dans TODO.md, ne pas exécuter
**Commit :** `feat(notifications): J1-J30 onboarding notification schedule`

---

#### TÂCHE 16 — Churn detection + réactivation
**Fichiers :** js/app.js, js/supabase.js
**Action :**

Détecter quand l'user est absent 2× son intervalle habituel.
Message de réactivation empathique selon le contexte (PR raté, etc).
**Commit :** `feat(retention): churn detection + empathetic reactivation messages`

---

### ✅ PHASE 5 — Post-lancement (EN COURS)
- [x] TÂCHE 15 : Notifications J1→J30 — commit 49562b3
- [x] TÂCHE 17 : Health Connect UI + Garmin CSV import + RHR analysis + penalty — commit d925a42
- [x] TÂCHE 18 : Bluetooth FC live GO — commit 25d4d32
- [ ] TÂCHE 9 : Health Connect API native (Supabase Edge Functions, attendre validation)
- [ ] TÂCHE 19 : Weight Cut module (attendre validation Claude.ai)
- [ ] TÂCHE 20 : Paywall features Premium (attendre validation Claude.ai)

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
