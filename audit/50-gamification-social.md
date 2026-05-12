# Gamification + Social — v207

## Source : validation Gemini — badges sagesse + leaderboard relatif + social filtré

## Systèmes livrés

### SYSTÈME 1 — Badges relatifs au poids de corps

`getBWBadgeThresholds(liftKey, bw, gender)` retourne les seuils en
multiplicateurs (arrondis 2.5kg) :

| Lift | Bronze | Argent | Or | Platine | Diamant | Élite | Légendaire |
|---|---|---|---|---|---|---|---|
| Bench    | 0.5×  | 0.75× | 1.0×  | 1.25× | 1.5×  | 1.75× | 2.0×  |
| Squat    | 0.75× | 1.0×  | 1.25× | 1.5×  | 1.75× | 2.0×  | 2.25× |
| Deadlift | 1.0×  | 1.25× | 1.5×  | 1.75× | 2.0×  | 2.25× | 2.5×  |
| OHP      | 0.3×  | 0.4×  | 0.5×  | 0.6×  | 0.75× | 0.9×  | —     |

`getLiftBadgeTier(liftKey, prValue)` retourne `{ tier, label, next,
thresholds }`. Fallback `BADGE_THRESHOLDS` absolus si `bw === 0`.

`BW_BADGE_LABELS = ['Bronze','Argent','Or','Platine','Diamant','Élite','Légendaire']`.

---

### SYSTÈME 2 — Badges de Sagesse

| Badge | Trigger | XP |
|---|---|---|
| 🧠 Écoute du Corps | accepter ≥ 1 deload (compteur `_deloadAcceptedCount`) | 300 |
| 😴 Récupération Pro | 3 readiness consécutifs score > 80 | 200 |
| ⚖️ Équilibre Parfait | 4 semaines avec ACWR ∈ [0.8 ; 1.3] | 400 |

**`_awardWisdomXP(xp, title, message)`** : accumule `db.gamification.wisdomXP`
et déclenche un toast (5s).

**`calcTotalXP()`** patché : ajoute `wisdomXP` au total avant high-water mark.

**`acceptDeload()`** : incrémente `_deloadAcceptedCount` et appelle
`checkWisdomBadge_Deload()` immédiatement.

**`goFinishWorkout()`** : appelle `checkWisdomBadge_Recovery()` + `checkWisdomBadge_ACWR()`
après `saveAlgoDebrief()`.

**Défis spécifiques** `generateWisdomChallenges()` :
- `level === 'avance'` + ratio S/B < 1.20 → `ratio_correction` (+500 XP)
- Sinon → `new_exercises` exploration (+150 XP)

---

### SYSTÈME 3 — Leaderboard relatif (% progression)

**`getProgressionScore(userId)`** : compare le volume moyen des 30
derniers jours vs une fenêtre antérieure équivalente. Retourne un entier
signé en %.

`_renderLeaderboard()` ajoute une 3e metric `progression` :
- `period_type = 'monthly'`
- `unitLabel = '%'`
- Format d'affichage : `+25 %`, `-10 %`, `0 %`

Permet aux profils légers (Léa, Alexis) d'égaler les profils lourds
proportionnellement.

---

### SYSTÈME 4 — Notifications sociales groupées + Ghost mode

**`triggerDailyHighlight()`** :
- Max 1× par jour (`db._lastDailyHighlight === todayStr`)
- Charge le feed (`loadFeedItems(0)`) filtré sur `type='pr'` et timestamp d'aujourd'hui
- 1 ami → `"Aurélien a battu un record aujourd'hui ! 🏆"`
- 2 amis → `"Aurélien et Léa ont battu des records aujourd'hui ! 🏆"`
- 3+ → `"Aurélien, Léa et 2 autres ont battu des records aujourd'hui ! 🏆"`
- Toast 6s + `sendLocalNotification()`

**`setGhostMode(enabled)`** :
- `true` → toutes les `visibility` passent à `'private'` (bio, prs, programme, seances, stats, feed)
- `false` → toutes à `'friends'`
- Stocké dans `db.user.social.ghostMode` + `db.user.social.visibility.*`

---

## Tests : 8 invariants Playwright

| Groupe | Tests | Status |
|---|---|---|
| BADGE-01..02 | tier relatif + fallback absolu | ✅ |
| WISDOM-01..02 | deload + recovery badges | ✅ |
| PROG-01..02 | progression score signé + zéro logs | ✅ |
| GHOST-01 | ghost mode toggle | ✅ |
| CHALLENGE-01 | défi ratio avancé | ✅ |

> Tests Playwright : `tests/audit-gamification-social-v207.spec.js` (8 tests).

## SW v206 → v207
