# SPEC — Gamification V2 · SBD Hub
> Statut : Validée · Prête pour Claude Code · 20/04/2026

---

## Décisions validées — récapitulatif

| Sujet | Décision |
|---|---|
| Classes | 8 classes Dofus uniquement |
| Quiz | 7 questions, mix choix unique + slider, révélation animée |
| Rangs SBD | 6 tiers Dofus, Strength Level, sans sous-rangs |
| Rangs musculaires | 23 groupes, tiers anatomiques, mix volume + fréquence |
| Affichage musculaires | Figure SVG + liste en dessous |
| Célébration PR type A | Vibration + toast non bloquant |
| Célébration PR type B | Overlay plein écran + bouton Continuer + partage |
| Streak freeze | 1/mois automatique, cap 2, consommation auto + manuelle |
| Dashboard home | Carte dédiée « Rangs SBD » |

---

## Vue d'ensemble — ordre d'implémentation

| # | Feature | Complexité | Session Claude Code |
|---|---|---|---|
| 1 | Streak Freezes | Faible | 1 |
| 2 | Classes de joueur + Quiz | Moyenne | 2 |
| 3 | Rangs SBD | Moyenne | 3 |
| 4a | Figure SVG anatomique | Élevée | 4 |
| 4b | Calcul rangs musculaires (23) | Élevée | 5 |
| 5 | Célébration PR | Moyenne | 6 |

Architecture : tout vanilla JS dans app.js, données dans db.gamification (JSONB Supabase), sync via syncToCloud() après chaque write.

---

## 1. Streak Freezes

### Logique métier
- 1 freeze attribué le 1er du mois automatiquement si streakFreezes < 2
- Cap absolu : 2 — jamais au-dessus
- Consommation double :
  - Auto : si la semaine se termine sans séance ET streak >= 4 semaines → freeze consommé silencieusement
  - Manuelle : l'utilisateur peut activer un freeze en avance depuis la carte streak (bouton "Protéger cette semaine")
- Ne pas re-déclencher si freeze déjà utilisé cette semaine

### Structure de données
```js
db.gamification = {
  streakFreezes: 1,
  lastFreezeGrantedMonth: 3,
  freezesUsedAt: [],
  freezeActiveThisWeek: false
}
```

### Fonctions
```js
function grantMonthlyFreeze()      // init — vérifie le mois, octroie si dû
function consumeStreakFreezeAuto() // dans calcStreak() si semaine manquante
function activateFreezeManual()    // bouton UI → freezeActiveThisWeek = true
function getStreakFreezes()        // retourne db.gamification.streakFreezes
```

### UI
- Carte streak existante : icône ❄️ × N après le compteur
- Bouton "Protéger cette semaine" si streakFreezes > 0 et semaine non protégée
- Tooltip : "X freeze(s) disponible(s) · Se régénère le 1er du mois"
- Quand consommé : toast "❄️ Freeze utilisé — streak protégé"

---

## 2. Classes de joueur

### Les 8 classes Dofus

| Classe | Icône | Archétype fitness |
|---|---|---|
| Iop | ⚔️ | Powerlifter pur — force brute, charges max |
| Sacrieur | 🩸 | Bodybuilder — volume élevé, pompe |
| Pandawa | 🍶 | Bien-être — régularité, équilibre, long terme |
| Osamodas | 🐉 | Athlète fonctionnel — instinctif, varie les stimuli |
| Xelor | ⏳ | Concurrent / meet prep — tout planifié |
| Feca | 🛡️ | Réathlétisation — technique, prévention blessures |
| Ecaflip | 🎲 | Débutant / reprise — irrégulier, improvise |
| Enutrof | 💰 | Vétéran — long historique, progressions lentes |

### Quiz — 7 questions, mix choix unique + slider

Q1 (choix unique) : "Ton objectif principal à la salle ?"
  - Soulever le plus lourd → Iop+3, Xelor+1
  - Construire un physique → Sacrieur+3, Osamodas+1
  - Rester en forme → Pandawa+3, Feca+1
  - Performer en compétition → Xelor+3, Iop+1
  - Reprendre après une pause → Ecaflip+3, Pandawa+1
  - Continuer sur la durée → Enutrof+3

Q2 (slider 0-10, Force ←→ Volume) :
  - 0–2 → Iop+2
  - 3–4 → Xelor+1, Iop+1
  - 5   → Osamodas+2, Feca+1
  - 6–7 → Sacrieur+1, Osamodas+1
  - 8–10 → Sacrieur+2

Q3 (choix unique) : "Ta séance idéale ?"
  - Peu de séries, charges lourdes → Iop+2, Xelor+1
  - Beaucoup de séries, pompe → Sacrieur+2
  - Régulière, technique, sans blessure → Feca+2, Pandawa+1
  - Variée, jamais la même → Osamodas+2
  - Courte et efficace → Enutrof+2, Ecaflip+1

Q4 (choix unique) : "Une semaine sans salle ?"
  - Ça me ronge → Iop+2, Sacrieur+1
  - C'est la vie → Pandawa+3
  - Je fais autre chose → Osamodas+2
  - J'avais planifié ce repos → Xelor+2, Enutrof+1
  - Ça arrive souvent → Ecaflip+2

Q5 (slider 0-10, Spontané ←→ Planifié) :
  - 0–2 → Ecaflip+2, Osamodas+1
  - 3–5 → Osamodas+1, Feca+1
  - 6–8 → Xelor+1, Enutrof+1
  - 9–10 → Xelor+2

Q6 (choix unique) : "Ton rapport aux blessures ?"
  - Je pousse jusqu'à la limite → Iop+2, Sacrieur+1
  - Je fais attention → Feca+3
  - J'écoute mon corps → Osamodas+2, Pandawa+1
  - J'ai déjà été blessé → Feca+2, Enutrof+1
  - Je ne me suis jamais blessé → Ecaflip+1, Iop+1

Q7 (choix unique) : "Si tu étais un perso Dofus ?"
  - Un guerrier qui fonce → Iop+3
  - Un titan du volume → Sacrieur+3
  - Un moine patient → Pandawa+3
  - Un dresseur qui s'adapte → Osamodas+3
  - Un maître du temps → Xelor+3
  - Un gardien de son temple → Feca+3
  - Un joueur qui tente sa chance → Ecaflip+3
  - Un chasseur de trésors au long cours → Enutrof+3

### Scoring
Classe avec le score total le plus élevé assignée. Égalité : Xelor > Enutrof > Feca > Osamodas > Iop = Sacrieur = Pandawa = Ecaflip.

### Révélation animée
1. "Analyse en cours…" avec icône qui pulse
2. "Tu es un(e)…" → pause 0.5s → NOM DE LA CLASSE en grand
3. Description courte + bouton "Commencer l'aventure"

### Structure de données
```js
db.gamification.playerClass = 'iop'
db.gamification.playerClassSetAt = 1745000000
db.gamification.quizAnswers = [0, 7, 2, 1, 9, 3, 0]
db.gamification.quizCompletedAt = 1745000000
```

### Déclenchement
- Première ouverture si db.gamification.playerClass est null/undefined
- Modifiable via Réglages > "Changer de classe"

### Affichage
Sous le nom utilisateur dans la carte profil : ⚔️ Iop · Niveau 12

---

## 3. Rangs par lift SBD

### 6 tiers Dofus

| # | Tier | Couleur | Percentile |
|---|---|---|---|
| 1 | Apprenti  | #8B7355 | 0–19%   |
| 2 | Aventurier | #9EB0C0 | 20–39%  |
| 3 | Guerrier  | #C8A24C | 40–59%  |
| 4 | Champion  | #78D8D0 | 60–74%  |
| 5 | Héros     | #6EB4FF | 75–89%  |
| 6 | Légende   | #BF5AF2 | 90–100% |

### Calcul — Strength Level (ratio e1RM/BW)

```js
const STRENGTH_LEVEL_STANDARDS = {
  bench:    { male: [0.35,0.50,0.75,1.00,1.25,1.50,1.75,2.00,2.25], female: [0.20,0.30,0.45,0.60,0.80,1.00,1.20,1.40,1.60] },
  squat:    { male: [0.50,0.75,1.00,1.25,1.50,1.75,2.00,2.25,2.50], female: [0.35,0.50,0.70,0.90,1.10,1.30,1.55,1.80,2.00] },
  deadlift: { male: [0.60,0.85,1.10,1.35,1.60,1.90,2.20,2.50,2.75], female: [0.40,0.60,0.80,1.00,1.25,1.50,1.75,2.00,2.20] }
};
const STRENGTH_PERCENTILE_POINTS = [5,10,20,35,50,65,80,90,95];

function calcLiftPercentile(liftType, e1rm, bw, gender) { /* interpolation linéaire */ }
function percentileToSBDTier(pct) { /* retourne { tier, index, color } */ }
```

### Dashboard home — Carte "Rangs SBD"
- 3 lignes : SQ / BP / DL + barre de progression dans le tier + nom du tier
- Tap → tab-game section Rangs
- Masquée si aucun e1RM (modes non-SBD)

### Tab-game — section détail
- Cards par lift : tier + e1RM + percentile + écart kg vers tier suivant
- Style dark glass morphism

### Données
```js
db.gamification.liftRanks = {
  squat:    { tier: 'Héros',    index: 4, percentile: 76, e1rm: 148, updatedAt: 1745000000 },
  bench:    { tier: 'Guerrier', index: 2, percentile: 44, e1rm: 140, updatedAt: 1745000000 },
  deadlift: { tier: 'Champion', index: 3, percentile: 62, e1rm: 186, updatedAt: 1745000000 }
}
```

---

## 4. Rangs par muscle (23 groupes)

### Les 23 groupes

| # | Muscle | Clé |
|---|---|---|
| 1 | Pectoraux hauts | chest_upper |
| 2 | Pectoraux bas | chest_lower |
| 3 | Grands dorsaux | lats |
| 4 | Rhomboïdes | rhomboids |
| 5 | Érecteurs spinaux | erectors |
| 6 | Quadriceps | quads |
| 7 | Ischio-jambiers | hamstrings |
| 8 | Grand fessier | glutes_major |
| 9 | Moyen fessier | glutes_med |
| 10 | Adducteurs | adductors |
| 11 | Deltoïdes antérieurs | shoulders_front |
| 12 | Deltoïdes latéraux | shoulders_side |
| 13 | Deltoïdes postérieurs | shoulders_rear |
| 14 | Trapèzes | traps |
| 15 | Triceps | triceps |
| 16 | Biceps | biceps |
| 17 | Avant-bras | forearms |
| 18 | Abdominaux | abs |
| 19 | Obliques | obliques |
| 20 | Mollets (gastrocnémien) | calves_gastro |
| 21 | Soléaire | calves_soleus |
| 22 | Fléchisseurs de hanche | hip_flexors |
| 23 | Dentelé antérieur | serratus |

### 6 tiers anatomiques

| # | Tier | Couleur | Seuil score |
|---|---|---|---|
| 1 | Atrophié   | #555566 | 0–16   |
| 2 | Développé  | #7A8C6E | 17–33  |
| 3 | Sculpté    | #C8A24C | 34–50  |
| 4 | Puissant   | #78D8D0 | 51–67  |
| 5 | Massif     | #6EB4FF | 68–84  |
| 6 | Titanesque | #BF5AF2 | 85–100 |

### Calcul — mix volume (70%) + fréquence (30%) sur 4 semaines

```js
function calcMuscleScore(muscleKey, logs4weeks) {
  const tonnage = getMuscleContributions(logs4weeks)[muscleKey] || 0;
  const freq    = getMuscleFrequency(logs4weeks)[muscleKey] || 0;
  const sV = Math.min(100, Math.round(100 * Math.log1p(tonnage) / Math.log1p(MUSCLE_TONNAGE_TARGETS[muscleKey])));
  const sF = Math.min(100, Math.round(100 * freq / MUSCLE_FREQ_TARGETS[muscleKey]));
  return Math.round(sV * 0.7 + sF * 0.3);
}
```

### Affichage — Figure SVG anatomique
- Toggle Avant / Arrière
- Zones colorées selon le tier
- Tap sur zone → popover : nom + tier + score + progression
- Taille max 340px height, dark background, style épuré

### Affichage — Liste complémentaire
- 23 lignes : nom + tier + barre de progression + score
- Triable par tier (défaut), nom, score

### Données
```js
db.gamification.muscleRanks = {
  chest_upper: { tier: 'Sculpté', index: 2, score: 54, updatedAt: 1745000000 },
  // ... 22 autres
  _computedAt: 1745000000   // recalcul si > 7 jours
}
```

---

## 5. Célébration PR

### Type A — e1RM battu en cours de saisie (non bloquant)
- Vibration : navigator.vibrate([50, 30, 80])
- Toast slide-down 2.5s : "⚡ Nouveau PR — Bench Press · 148 kg e1RM"
- Fond toast : gradient violet/magenta subtil

### Type B — charge absolue battue au save (cinématique)
- Overlay plein écran
- Contenu : particules CSS + "RECORD PERSONNEL" + lift + poids + nouveau tier si montée
- Bouton "📤 Partager" : canvas → navigator.share() → fallback presse-papier
- Bouton "Continuer →"

### Anti-doublon
```js
db.gamification.lastPRCelebrated = { exo: 'Deadlift', e1rm: 186, timestamp: 1745000000 }
// Pas de re-déclenchement si même exo + même e1rm dans les 24h
```

---

## Structure complète db.gamification

```js
db.gamification = {
  streakFreezes: 1,
  lastFreezeGrantedMonth: 3,
  freezesUsedAt: [],
  freezeActiveThisWeek: false,

  playerClass: 'iop',
  playerClassSetAt: 1745000000,
  quizAnswers: [0, 7, 2, 1, 9, 3, 0],
  quizCompletedAt: 1745000000,

  liftRanks: {
    squat:    { tier: 'Héros',    index: 4, percentile: 76, e1rm: 148, updatedAt: 1745000000 },
    bench:    { tier: 'Guerrier', index: 2, percentile: 44, e1rm: 140, updatedAt: 1745000000 },
    deadlift: { tier: 'Champion', index: 3, percentile: 62, e1rm: 186, updatedAt: 1745000000 }
  },

  muscleRanks: {
    chest_upper: { tier: 'Sculpté', index: 2, score: 54, updatedAt: 1745000000 },
    _computedAt: 1745000000
  },

  lastPRCelebrated: { exo: 'Deadlift', e1rm: 186, timestamp: 1745000000 }
}
```

Init défensive dans initDB() :
```js
db.gamification = db.gamification || {};
```

---

## Template Claude Code (à copier en tête de chaque session)

Contexte : PWA powerlifting SBD Hub — vanilla JS, pas de modules ES6, pas de bundler.
Fichier principal : app.js (~11 700 lignes). Lire le fichier complet avant toute modification.
Règles absolues :
  - Zéro refactoring opportuniste
  - Modifier uniquement les fonctions nécessaires à la feature
  - db.gamification = db.gamification || {} en accès défensif
  - syncToCloud() après chaque write dans db.gamification
  - Un seul fichier modifié par session, commit + push immédiat
  - Tester sur GitHub Pages (pas la preview Claude)
Feature de cette session : [INSÉRER ICI]

---

Spec finalisée le 20/04/2026 — toutes décisions validées par Aurélien
Prochaine étape : Session 1 Claude Code — Feature Streak Freezes
