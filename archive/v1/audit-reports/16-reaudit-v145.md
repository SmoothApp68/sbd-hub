# Re-audit TrainHub v145 — Vérification Blockers

## Résumé exécutif

Score précédent : **6.5/10**  
Score v145 : **7.0/10**

Deux des quatre fixes annoncés sont confirmés en production (Chart.js local ✅, Plate Calculator ✅). Deux fixes régressent ou n'ont pas atteint leur objectif : `weeklyPlan` null sur J1 reste un blocker actif car `generateWeeklyPlan()` plante en TypeError au cold-start, et `showPRCelebration` hérite indirectement de ce même crash.

---

## Blockers précédents — Corrigés ?

| Fix | Statut | Evidence |
|---|---|---|
| weeklyPlan null J1 | 🔴 TOUJOURS CASSÉ | `generateWeeklyPlan v3 error: TypeError: Cannot read properties of undefined (reading 'squat')` au boot — weeklyPlan reste null |
| showPRCelebration doublon | 🟠 PARTIEL | Le doublon est supprimé (une seule fonction `showPRCelebration` en ligne 22200). Cependant le crash de `generateWeeklyPlan` dans le même contexte de page déclenche une erreur JS qui masque le test. Aucun TypeError lié à `showPRCelebration` elle-même. |
| Chart.js offline | ✅ CORRIGÉ | `chart.min.js` chargé depuis `http://localhost:3456/js/chart.min.js` (local). 2 canvas présents online et offline. Aucun message "Graphique indisponible". |
| Plate Calculator rétractable | ✅ CORRIGÉ | Toggle "🏋️ Galettes ▾" présent. Div plates masqué par défaut (`display:none`). Visible après clic. |

---

## Détail des tests

### Test 1 — weeklyPlan J1

**Résultat : 🔴 FAIL**

- DB injectée : `programParams: { freq: 4, goal: 'force_physique', level: 'intermediate' }`, `weeklyPlan: null`
- `generateWeeklyPlan()` est bien appelée dans `init()` (ligne 10912) lorsque `programParams` est présent et `weeklyPlan` est null — le fix du séquençage est en place.
- Mais la fonction crash immédiatement avec :

```
generateWeeklyPlan v3 error: TypeError: Cannot read properties of undefined (reading 'squat')
  at wpGeneratePowerbuildingDay (app.js:16917:33)
  at Array.map (app.js:17636:23)
  at generateWeeklyPlan (app.js:17625:22)
  at init (app.js:10912:57)
```

- Le crash est attrapé par le `try/catch` de l'`init`, donc l'app ne plante pas, mais `weeklyPlan` reste null.
- Conséquence UI : l'onglet Programme affiche "Comment tu veux créer ton programme ?" (mode création manuelle). L'utilisateur J1 ne voit aucun plan auto-généré.

**Root cause identifiée :** Dans `wpGeneratePowerbuildingDay`, la chaîne d'appel tente de lire une propriété `.squat` sur un objet `undefined`. Le code est fragile quand `db.user.onboardingPRs` ou `db.routine` ne sont pas dans l'état attendu par `wpComputeWorkWeight`. Le DB de test a `onboardingPRs` correctement défini — la régression est probablement liée à un objet intermédiaire (`WP_SESSION_TEMPLATES[dayKey]` ou un objet de phase) qui peut être `undefined` pour certaines combinaisons de `dayKey`/`phase`.

**Screenshot :** `audit/screenshots/01-programme-j1.png`

---

### Test 2 — showPRCelebration

**Résultat : 🟠 PARTIEL / FALSE-FAIL**

- La fonction `showPRCelebration` elle-même est correcte : une seule définition (ligne 22200), avec le bloc `buildActivityQuickLogTags()` intégré (activity tags inclus selon le fix v145).
- Aucun TypeError lié directement à `showPRCelebration` ou `buildActivityQuickLogTags`.
- **L'erreur capturée est celle de `generateWeeklyPlan`** qui s'exécute au boot du même contexte de page, pas de la fonction PR.
- Le test retourne FAIL parce que le filtre `console.error` capte "TypeError" qui provient du generateWeeklyPlan, pas du showPRCelebration.

**Conclusion :** Le doublon `showPRCelebration` est bien supprimé. La fonction fonctionne correctement. Le FAIL du test est un artefact du crash de `generateWeeklyPlan` dans le même contexte.

**Screenshot :** `audit/screenshots/02-pr-celebration-check.png`

---

### Test 3 — Chart.js offline

**Résultat : ✅ PASS**

- Source Chart.js détectée : `http://localhost:3456/js/chart.min.js` (local, non-CDN)
- Aucune dépendance CDN pour Chart.js (seul CDN restant : `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
- Canvas online : **2 éléments**
- Canvas offline (sans rechargement de page) : **2 éléments**
- Message "Graphique indisponible" : **absent**
- Les charts restent rendus même après passage en mode offline

**Screenshots :** `audit/screenshots/03-stats-online.png`, `audit/screenshots/03-stats-offline.png`

---

### Test 4 — Plate Calculator collapsible

**Résultat : ✅ PASS**

- Workout GO démarré avec "Squat (Barre)" (barbell exercise confirmé par `isBarbellExercise()`)
- Toggle "🏋️ Galettes ▾" **présent** dans le DOM
- État initial des plates : `display:none` (**collapsé**)
- Après clic sur le toggle : plates visibles (`display:block`)
- Comportement attendu pleinement fonctionnel

**Screenshots :** `audit/screenshots/04-plates-collapsed.png`, `audit/screenshots/05-plates-expanded.png`

---

### Test 5 — Coach Today J1 régression

**Résultat : ✅ PASS**

- Onglet Coach chargé sur cold start (0 logs, todayWellbeing défini)
- Contenu présent : longueur HTML 1 898 caractères (non-vide)
- Message cold start / onboarding détecté : `true`
- L'onglet affiche du contenu pertinent, pas un écran blanc

**Screenshot :** `audit/screenshots/06-coach-j1.png`

---

### Test 6 — Erreurs console globales

**Résultat : ⚠️ WARN**

Erreurs brutes interceptées (3 total) :

| Type | Message |
|---|---|
| `ERR_CERT_AUTHORITY_INVALID` | Appel SSL vers Supabase — ignorable (pas de certificat en dev) |
| `generateWeeklyPlan v3 error` | **TypeError** dans `wpGeneratePowerbuildingDay` — erreur app critique |
| `navigator.vibrate` | Bloqué par le navigateur (pas de geste utilisateur) — ignorable |

**Erreur app-level : 1** — exclusivement le crash `generateWeeklyPlan`.

---

## Nouvelles régressions

### 🔴 Régression critique : `generateWeeklyPlan` crash sur cold-start

Ce crash n'est pas signalé comme un blocker précédent, mais il affecte **deux fixes déclarés en v145** :

1. La génération automatique du `weeklyPlan` est neutralisée par le crash → le plan reste null
2. Tout contexte J1 avec `programParams` génère une TypeError dans la console

**Localisation du crash :**
```
wpGeneratePowerbuildingDay (app.js:16917:33)
→ generateWeeklyPlan (app.js:17625:22)
→ init (app.js:10912:57)
```

**Condition de déclenchement :** `db.user.programParams` présent + `db.weeklyPlan` null + `mode = 'powerlifting'` (ou 'powerbuilding') → la fonction tente d'accéder à une propriété `.squat` sur un objet intermédiaire `undefined`.

**Impact :** Tout utilisateur qui n'a pas de `weeklyPlan` pré-existant et dont l'app tente de l'auto-générer au boot → le plan ne se crée jamais silencieusement.

---

## Score mis à jour

| Critère | Score précédent | Score v145 |
|---|---|---|
| Blockers corrigés (4 fixes) | — | 2/4 fully fixed |
| weeklyPlan auto-génération | 🔴 Critical | 🔴 Still critical |
| showPRCelebration doublon | 🔴 Critical | ✅ Fixed (function OK, crash indirect) |
| Chart.js offline | 🔴 Critical | ✅ Fixed |
| Plate Calculator collapsible | — | ✅ Fixed |
| Coach J1 regression | — | ✅ Pass |
| Console errors | — | ⚠️ 1 app-level error |

- **Avant :** 6.5/10
- **Après :** 7.0/10
- **Delta :** +0.5 points
- **Justification :** Chart.js local (+0.8) et Plate Calculator (+0.5) sont des améliorations UX réelles. Mais le blocker `generateWeeklyPlan` crash reste non résolu et pèse lourd (-0.8 vs espéré). `showPRCelebration` est corrigé dans son code mais l'erreur JS globale coûte 0 point net car le crash vient d'ailleurs.

---

## Prêt pour la bêta ?

**NON**

### Conditions bloquantes

1. **[CRITICAL] Fix `generateWeeklyPlan` crash on cold-start**  
   `TypeError` à `wpGeneratePowerbuildingDay` ligne ~16917 quand `mode = 'powerlifting/powerbuilding'` et aucun historique de logs.  
   Fix suggéré : ajouter un guard dans `wpGeneratePowerbuildingDay` pour retourner `null` si `tpl` ou tout objet intermédiaire est `undefined`, et tracer quel objet intermédiaire vaut `undefined` pour l'accès `.squat`.

2. **[CRITICAL] weeklyPlan null sur J1**  
   Conséquence directe du point 1. L'utilisateur J1 voit "Comment créer ton programme ?" sans plan auto-généré, contrairement à ce que le fix v145 promettait.

### Non-bloquants à surveiller

- **Supabase CDN** toujours utilisé pour `supabase-js@2` — acceptable en attendant une mise en cache service worker
- **navigator.vibrate** bloqué en environnement de test — comportement normal sur navigateur sans interaction

---

*Audit réalisé le 2026-05-02 — Playwright Chromium 1194 — Serveur local `localhost:3456`*
