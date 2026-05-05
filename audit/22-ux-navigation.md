# Audit UX Navigation TrainHub v162

**Date :** 2026-05-05 · **Profil test :** J7 Powerbuilder intermédiaire  
**Méthode :** Playwright headless + analyse code · **7/7 tests passés**

---

## Profondeur de navigation (clics depuis le dashboard)

| Feature | Clics réels | Idéal | Verdict |
|---|---|---|---|
| Programme du jour | **0** (carousel dash) | ≤1 | ✅ |
| SRS / Forme | **0** ("Forme 25" visible) | ≤1 | ⚠️ label ambigu |
| Lancer la séance | **1** (bouton "GO 💪" sur dash) | ≤2 | ✅ |
| Statistiques | **1** (tab Stats) | ≤2 | ✅ |
| Batterie Nerveuse détaillée | **2** (Séances → Coach) | ≤2 | ✅ |
| Leaderboard DOTS | **1+scroll** (tab Jeux) | ≤2 | ⚠️ |
| Badges | **1** (tab Jeux) | ≤2 | ✅ |
| Réglages | **1** (tab Profil) | ≤2 | ✅ |

---

## Ce que le dashboard affiche réellement (T2 — données Playwright)

```
Salut TestJ7 👋
Mardi 5 mai
Forme 25                          ← SRS visible mais label peu explicite
LUN ✓  MAR ●  MER  JEU  VEN  SAM  DIM
2 SÉANCES · 36min · 15.5t volume  ← Stats semaine
🔥 2 semaines consécutives

◀  🏋️ AUJOURD'HUI  💪 Bench & Push  6 exercices prévus  GO 💪  ▶
                                  ← Plan du jour + bouton direct

PERFORMANCE
```

**Verdict dashboard :** très dense et utile. Le plan du jour, le SRS et le GO sont tous présents dès l'ouverture. Ce n'est pas un problème de profondeur, c'est un problème de lisibilité des labels.

---

## Bugs / Problèmes identifiés

| # | Problème | Sévérité | Description |
|---|---|---|---|
| 1 | Label "Forme 25" opaque | 🟠 MODÉRÉ | Un nouveau user voit "Forme 25/100" sans comprendre que c'est le SRS algorithmique (charge, récup, HRV). Le mot "Batterie Nerveuse" n'apparaît que dans Coach → sous-onglet. |
| 2 | Séances default sub = historique | 🟠 MODÉRÉ | Taper "Séances" dans la nav ouvre l'historique de séances (liste de dates), pas GO ni Coach. L'utilisateur qui veut s'entraîner doit cliquer une 2e fois sur "🏋️ GO". |
| 3 | DOTS absent au premier coup d'œil dans Jeux | 🟡 MINEUR | Tab Jeux ouvre sur le profil joueur (XP, niveau, quêtes). Le Leaderboard DOTS est plus bas dans la page, pas immédiatement visible sans scroller. |
| 4 | Bouton "GO 💪" sur dashboard minimaliste | 🟡 MINEUR | Le bouton est efficace mais le label "GO 💪" ne dit pas "Démarrer ta séance du jour". Un user non initié peut le rater dans le carousel. |
| 5 | Onglet "🦍 Coach" — label trop vague | 🟡 MINEUR | "Coach" peut évoquer un coach humain. La feature réelle (analyse algo Batterie Nerveuse / Budget Récupération / Biomécanique) n'est pas perceptible depuis la tab bar. |

---

## Quick wins recommandés (sans restructurer la nav)

| Fix | Effort | Impact |
|---|---|---|
| Ajouter sous-label à "Forme 25" → "Forme · Algo TrainHub" ou renommer en "SRS" + tooltip | 30 min | Élimine confusion sur le score dash |
| Changer default sub Séances → `seances-go` | 5 min, 1 ligne | L'user qui tape "Séances" arrive directement sur GO |
| Ajouter "Classement" pill visible dans la zone initiale du tab Jeux | 15 min | DOTS accessible sans scroll |
| Renommer le carousel slide en "Séance du jour →" au lieu de "GO 💪" | 10 min | Intention claire pour nouveaux users |

---

## Ce qui fonctionne très bien

### Dashboard comme hub central ✅
Le dashboard affiche en un seul écran : le plan du jour (carousel), le SRS (Forme 25), les stats semaine, et un bouton GO direct. C'est une architecture efficace — le user n'a pas à chercher loin si il sait lire les cartes.

### GO tab : séance en 1 clic depuis le dash ✅
Le bouton "GO 💪" dans le carousel du dashboard = **1 clic** pour démarrer. Le GO actif génère 222 664 chars de HTML (séance complète, warm-up, charges calculées). Aucun NaN.

### Stats en 1 clic ✅
Tab Stats = 2 canvas Chart.js + SVG anatomie + Records + Volume + Standards. Accessible immédiatement.

### Coach tab : très riche ✅
En 2 clics : Budget Récupération, TRIMP muscu/cardio, Biomécanique, Ratios antagonistes. Content dense et pertinent. Aucun NaN.

### Jeux : gamification complète en 1 clic ✅
Profil joueur, XP, niveau, quêtes hebdo, badges, leaderboard — tout dans un seul tab.

---

## Ce qui peut frustrer un bêta-testeur non initié

1. **"Forme 25" sans contexte** — J'aurais besoin d'aide pour comprendre ce chiffre. 25% ? 25 sur 100 ? C'est bon ou mauvais ?
2. **"Séances" → liste de séances passées** — Je veux m'entraîner maintenant, pas voir mon historique.
3. **Gorille 🦍** — Amusant mais je ne sais pas que derrière il y a une analyse scientifique de ma récupération.

---

## Données brutes collectées

```
Tab bar : Maison | Social | Séances | Stats | ⚔️ Jeux | Profil
Séances default sub-tab : seances-historique
Stats sub-tabs : Volume | Muscles | Records | Cardio
Jeux sub-tabs : Profil joueur | Rangs | Badges | (scroll→) Amis | Communauté | Challenges | Classement
GO idle : 4116 chars (plan du jour affiché)
GO active : 222 664 chars (séance complète)
Leaderboard (T6) : hasLeaderboard: true | dotsVisible: false (au-dessus du fold)
```

---

## Score UX Navigation : **8.5/10**

**Forces :** Dashboard complet, GO en 1 clic, Stats/Jeux/Profil en 1 clic, 0 deadend.  
**Faiblesses :** Labels "Forme" et "GO 💪" peu explicites pour J1, sous-onglet Séances par défaut inadapté.

## Prêt pour la bêta ? **OUI avec 2 quick wins prioritaires**

> **Priorité 1** (5 min) : Changer le default sub Séances → `seances-go`  
> **Priorité 2** (30 min) : Clarifier le label "Forme 25" sur le dashboard
