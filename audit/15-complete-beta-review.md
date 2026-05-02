# Review Complète TrainHub v143
Date: 2026-05-02

## Métriques UX (Playwright — Profil J1, cold start)

| Écran | Chargement | Friction | Contenu attendu | Score UX |
|-------|------------|----------|-----------------|----------|
| Coach Today (J1) | ~1.5s | Faible | Message de bienvenue affiché, semaine 1 calibration, jauges sommeil/readiness | 8/10 |
| GO Idle | ~1.0s | Faible | "Session Express" bouton présent, info programme détectée | 7/10 |
| GO Active | ~1.5s | Moyenne | Warmup détecté ; calculateur de galettes non visible à l'écran initial | 6/10 |
| Programme | ~1.2s | Élevée | Fragment "Comment créer ton programme ?" — weeklyPlan=null, aucun plan affiché | 5/10 |
| Réglages | ~1.0s | Faible | kg/lbs toggle OK, barre OK, section RGPD présente | 8/10 |
| Waitlist | ~1.5s | Aucune | Page affichée sans overlay login — flow correct | 9/10 |
| Coach Today (J30) | ~1.5s | Faible | Historique squat détecté, contenu progressif activé | 8/10 |
| Stats (J30) | ~1.2s | Moyenne | Métriques chiffrées OK ; graphiques non rendus (Chart.js CDN en échec) | 6/10 |

---

## Bugs trouvés

| Sévérité | Description | Screenshot |
|----------|-------------|------------|
| **CRITIQUE** | `showPRCelebration` défini deux fois dans app.js (lignes 22190 et 22253) avec des signatures différentes `(prs, sessionId)` vs `(liftName, newValue, oldValue)` — la deuxième définition écrase la première, risque de crash ou comportement silencieux incorrect lors d'un PR | 03-go-active.png |
| **HAUTE** | `calcE1RM` défini dans app.js (l.1092) ET program.js (l.115) avec des noms de paramètres différents — collision possible selon l'ordre de chargement des scripts | — |
| **HAUTE** | Graphiques Stats entièrement indisponibles lors d'un test offline/local : `typeof Chart === 'undefined'` → affiche "Graphique indisponible (hors-ligne)" même avec connexion normale, car le CDN jsdelivr.net échoue avec `ERR_CERT_AUTHORITY_INVALID` en environnement local. En production avec CDN accessible, ce bug disparaît, mais aucun fallback local n'est bundlé. | 08-stats-j30.png |
| **HAUTE** | Programme non généré au cold start (J1) : `weeklyPlan=null` → l'écran affiche "Comment créer ton programme ?" au lieu d'un plan auto-généré depuis `programParams`. Le flow d'onboarding ne déclenche pas `generateWeeklyPlan()` automatiquement | 04-programme.png |
| **MOYENNE** | `Supabase init failed: ReferenceError: supabase is not defined` à chaque chargement — le CDN `@supabase/supabase-js@2` est bloqué par la CSP ou le réseau local, et l'appli tente quand même d'initialiser. Le bloc try/catch absorbe l'erreur mais elle s'affiche en console pour tout beta-testeur ouvrant les devtools | 01-coach-j1.png |
| **MOYENNE** | `navigator.vibrate` bloqué systématiquement au premier tap — erreur console : "Blocked call to navigator.vibrate because user hasn't tapped on the frame yet". L'API vibration est appelée trop tôt (avant interaction utilisateur), cassant le retour haptique sur les premières actions | 03-go-active.png |
| **FAIBLE** | Le calculateur de galettes (plateCalc) n'est pas accessible depuis la vue GO active sans action supplémentaire. L'écran GO active reste identique à GO idle — aucun workout n'a démarré visuellement, suggérant un problème de déclenchement du bouton "Démarrer" en headless | 03-go-active.png |
| **FAIBLE** | 36 `addEventListener` pour seulement 3 `removeEventListener` dans app.js — risque de fuites mémoire sur navigation intensive entre onglets | — |
| **INFO** | L'occurrence du mot "undefined" dans le body provient d'un `<script>` inline (`typeof db !== 'undefined'`), pas d'une valeur affichée — faux positif résolu | — |

---

## Code Quality

| Aspect | Observation | Note |
|--------|-------------|------|
| **Taille de app.js** | 22 464 lignes — fichier monolithique, difficile à maintenir et déboguer | 4/10 |
| **Fonctions géantes** | `renderGamificationTab` : 639 lignes. `renderCoachTodayHTML` : 439 lignes. `renderSettingsProfile` : 369 lignes. `wpComputeWorkWeight` : 340 lignes. Ces fonctions violent le principe de responsabilité unique | 3/10 |
| **Fonctions dupliquées** | `showPRCelebration` (×2 dans app.js), `calcE1RM` (app.js + program.js) — la deuxième définition écrase silencieusement la première en JS | 3/10 |
| **Gestion d'erreurs** | 97 blocs `try {}` dans app.js — couverture correcte des zones critiques. La plupart des accès DOM sont guardés | 7/10 |
| **TODO/FIXME restants** | Aucun commentaire TODO/FIXME/HACK/XXX trouvé dans `js/` — code nettoyé | 9/10 |
| **console.log non-guardés** | 12 `console.log` non protégés par `DEBUG` dans app.js (principalement dans `calcStreak` et `generateWeeklyPlan`) — exposent des données d'entraînement en console prod | 5/10 |
| **Gestion des événements** | 36 `addEventListener` vs 3 `removeEventListener` — fort déséquilibre, risque de fuites mémoire lors des re-renders | 4/10 |
| **Données sensibles** | Les données menstruelles/cycle sont exclusivement lues depuis `db.user` (localStorage) et affichées via `style.display`. Pas de log console de ces données — comportement correct | 8/10 |
| **Handlers onclick manquants** | Les 9 fonctions signalées comme "manquantes" par l'analyse statique (`closeGodMode`, `dismissAnnouncement`, etc.) sont en réalité définies en inline script dans index.html — non un bug, mais pattern fragile | 6/10 |
| **CSP** | Politique bien définie : `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`. Point négatif : `'unsafe-inline'` requis pour les scripts inline du HTML | 7/10 |
| **Séparation des modules** | 7 fichiers JS mais app.js représente ~70% du code total. engine.js (3877 l.) et supabase.js (4982 l.) mieux délimités | 5/10 |
| **Syntaxe** | Aucune erreur de syntaxe détectée (`node --check` passe). 76 déclarations `var` globales dans app.js (pollue le scope global) | 6/10 |
| **Offline/PWA** | Service worker v143 présent. Fallback "hors-ligne" pour les graphiques. Mais Chart.js non bundlé localement — graphiques absents sans CDN | 6/10 |

---

## Top 5 points forts

1. **Robustesse du cold start** : Le profil J1 charge sans crash, sans NaN visible, avec un message de bienvenue cohérent ("Semaine 1 de calibration") et des jauges de forme (sommeil/readiness) fonctionnelles dès le départ.

2. **Waitlist sans login gate** : La page `#waitlist` s'affiche correctement pour un utilisateur authentifié (via localStorage), sans overlay de connexion — le routing hash est bien géré.

3. **Couverture des erreurs** : 97 blocs try/catch dans app.js, fallbacks systématiques sur les éléments DOM (`if (el) { ... }`), messages d'état appropriés quand les données sont insuffisantes.

4. **Zéro TODO/FIXME** : Le code de production ne contient aucun marqueur de code temporaire ou incomplet dans les fichiers JS — signe de propreté éditoriale.

5. **Données médicales sensibles bien traitées** : Données menstruelles/cycle non loguées en console, gestion via localStorage uniquement avec consentement explicite (`consentHealth`, `medicalConsent`). La section est masquée par défaut pour les profils masculins.

---

## Top 5 frictions à corriger

1. **[CRITIQUE] Résoudre la double définition de `showPRCelebration`** (lignes 22190 et 22253 de app.js) : unifier les deux signatures ou renommer pour éviter que la deuxième écrase la première. Le comportement actuel est indéterminé lors de la détection d'un PR.

2. **[HAUTE] Auto-générer le plan hebdomadaire à l'onboarding** : Avec `programParams` renseigné et `weeklyPlan=null`, l'écran Programme affiche un prompt de création au lieu du plan auto. Appeler `generateWeeklyPlan()` en fin d'onboarding ou au premier chargement quand `programParams` est présent.

3. **[HAUTE] Bundler Chart.js localement** : Inclure Chart.js en self-hosted (ou l'inliner) plutôt que de dépendre exclusivement du CDN jsdelivr.net. Un beta-testeur sur réseau instable ou en PWA mode offline voit des statistiques entièrement vides — c'est un écran essentiel.

4. **[MOYENNE] Corriger l'initialisation haptique** : Déplacer les appels `navigator.vibrate()` dans un callback post-interaction utilisateur (ou les wrapper avec un flag `_userInteracted = true` positionné sur le premier `pointerdown`). Les erreurs console nuisent à l'expérience des testeurs.

5. **[MOYENNE] Décomposer les fonctions géantes** : `renderGamificationTab` (639 lignes), `renderCoachTodayHTML` (439 lignes) et `renderSettingsProfile` (369 lignes) sont difficiles à tester unitairement et à déboguer. Extraire des sous-fonctions logiques (`renderBadgeSection`, `renderCoachGauges`, `renderSettingsForm`) améliorerait la maintenabilité.

---

## Score global : 6.5/10

## Prêt pour la bêta ? OUI avec réserves

**Réserves bloquantes avant bêta publique :**
- Corriger la double définition de `showPRCelebration` (bug silencieux sur les PRs)
- Corriger l'auto-génération du plan hebdomadaire au cold start (UX cassée pour tout nouvel utilisateur)

**Réserves non-bloquantes (à corriger dans les 2 semaines suivant la bêta) :**
- Bundler Chart.js localement pour le mode offline
- Réduire les `console.log` non guardés en production
- Nettoyer la duplication `calcE1RM` entre app.js et program.js
- Corriger le déséquilibre addEventListener/removeEventListener

**Points solides pour la bêta :**
L'architecture offline-first fonctionne, le flow Coach est cohérent, les données sensibles sont bien protégées, et la PWA v143 charge rapidement sans erreur fatale pour un utilisateur onboardé avec historique.
