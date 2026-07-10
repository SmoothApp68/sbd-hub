# Audit documentaire — docs vs réalité du code (v320)

> **Read-only.** Aucun doc modifié, aucun code modifié. Chaque affirmation vérifiée contre le code
> (fichier:ligne). Livrable pour validation d'Aurélien — l'application des corrections sera un
> prompt séparé, doc par doc.
> État du code au moment de l'audit : branche = main = `2dcbddc`, SW **v320**.

---

## TL;DR — verdicts par doc

| Doc | Verdict | Gravité si relu comme actuel |
|---|---|---|
| `ROADMAP.md` | **À réécrire** — 9 tâches « à faire » sont FAITES ; tout le travail v151→v320 absent | 🔴 pilote les prompts avec un état faux |
| `TODO.md` | **À réécrire ou geler** — « état en temps réel » figé à v138/mai 2026 (réel : v320/juillet) | 🔴 le plus trompeur du repo |
| `ARCHITECTURE.md` | **À retoucher** — liste de fichiers partiellement fausse, systèmes récents absents | 🟠 |
| `CLAUDE.md` | **À retoucher** — liste JS §2 fausse, trou v151-v311, §4/§14 périmés | 🟠 |
| `PROMPT_RULES.md` | **Juste et actuel** — mais 2 règles ont été violées par le chantier polish (voir §Découvertes code) | 🟢 doc / 🔴 constat |
| `POLISH_DIAGNOSTIC.md`, `CHANTIER_A_PHASE1.md` | Justes comme diagnostics, mais décrivent comme « à faire » ce qui est fait → bandeau « réalisé v312-319 » à ajouter | 🟡 |
| `AUDIT_REPORT / REGRESSION / SOCIAL / STATS_AUDIT.md` (racine) | Historiques (avril, v105-era) — à marquer comme tels ou déplacer dans `audit/` | 🟡 |
| `audit/*` (dont 64-70 nomenclature) | Historiques par nature, cohérents avec le code (vérifié pour 67/69/70) — garder tels quels | 🟢 |
| `docs/GAMIFICATION_V2_SPEC.md` | Spec — non confronté en détail (hors périmètre prioritaire) | ⚪ |
| `decisions_nomenclature.md` | **N'existe pas** — la référence réelle = `audit/67-nomenclature-decisions-validees.md` + `audit/mapping_nomenclature_lotA.csv` | 🟡 |

---

## ⚠️ DÉCOUVERTES CODE faites pendant l'audit (à traiter, hors périmètre doc)

1. **1 test jest cassé par le polish v317** : `tests/unit/c2-harness.test.js` extrait `showReadinessModal`
   en isolation (vm) ; la fonction référence désormais `_uiOpen` (non extrait) → `ReferenceError`.
   Suite : **312/313 verts**. Cause : la règle « npm test vert à chaque commit » vit dans
   `PROMPT_RULES.md`, jamais chargé par les prompts polish (qui n'exigeaient que `node -c`).
2. **`SW_VERSION` (app.js:267) figé à `trainhub-v298`** alors que `CACHE_NAME` est à v320 — la règle
   PROMPT_RULES #4 (bump des DEUX) n'a été suivie par AUCUN chantier depuis v299 (nomenclature ET
   polish). Impact limité (fallback d'affichage, la vérité vient du SW actif) mais règle violée ×22.
3. **`family` sur EXO_DATABASE = métadonnée morte** : 139 entrées, 18 valeurs — **zéro consommateur**
   dans le code. Et le vocabulaire n'est PAS aligné avec `EXERCISE_TRANSFER_MATRIX` (engine.js:2391,
   porteuse de logique, vocabulaire propre `squat/hinge/bench/ohp`) — l'alignement exigé par
   audit/67 §vigilance #1 n'a jamais été livré. Le spec 67 annonçait 28 familles/163 exos ; le code
   en a 18/139.
4. Bug préexistant « Recherche manuelle » corrigé en v320 (hors audit, pour mémoire).

---

## 1. ROADMAP.md — tableau affirmation → réalité

Dernier commit : 12 juin. Les tâches « dans l'ordre strict » :

| Affirmation ROADMAP | Réalité code | Statut | Correction proposée |
|---|---|---|---|
| TÂCHE 7 cycle menstruel `[ ]` « prompt prêt » | Module complet : `MENSTRUAL_PHASES` engine.js:3259, `getCycleCoeff` :3298-3335, C_cycle appliqué app.js:21829/23904, UI app.js:17562-17592, modificateur SRS :19971 | **FAIT** | cocher `[x]` |
| TÂCHE 9/17 Health Connect/Garmin `[ ]` | Placeholder `connectHealthConnect` app.js:17456 ; le réel = import CSV `parseGarminCSV` :17505 + RHR/TRIMP engine.js:3101/4510. Pas d'API live | **PARTIEL** | requalifier : « CSV fait, API live restante » |
| TÂCHE 10 onboarding 3Q + flags `[ ]` HAUTE | `ONBOARDING_PROFILES` app.js:1735, flux câblé :1962-2031, conforme au spec | **FAIT** | cocher |
| TÂCHE 11 vocabulaire adaptatif `[ ]` | `getVocab` engine.js:33 + `VOCAB`, `vocabLevel` migré app.js:210, consommé coach.js:133… | **FAIT** | cocher |
| TÂCHE 12 5-Rep Test `[ ]` | `calcE1RMFrom5RepTest` engine.js:4081 (formule identique au spec), UI GO app.js:26572-26753 | **FAIT** | cocher |
| TÂCHE 13 streak intelligent `[ ]` | `smartStreak` app.js:206-208, `calcStreak` :4299 (semaine ISO + freeze) | **FAIT** | cocher |
| TÂCHE 14 badges compétence `[ ]` | Les 5 ids présents app.js:3972-3976, groupe « ⭐ Compétence » :7862 | **FAIT** | cocher |
| TÂCHE 15 notifications J1→J30 `[ ]` | Bloc app.js:14892 + triggers :15015 (client-side ; push serveur non fait) | **FAIT** (client) | cocher + note « push serveur restant » |
| TÂCHE 16 churn detection `[ ]` | `detectChurn` app.js:26690, bannière réactivation :18757 | **FAIT** | cocher |
| TÂCHE 18 Bluetooth FC `[ ]` post-lancement | `toggleBluetoothHR` app.js:26759 (Web Bluetooth GATT heart_rate), widget :26274 | **FAIT** | cocher |
| TÂCHE 19 Weight Cut `[ ]` post-lancement | Module complet engine.js:4101-4214 + UI app.js:17601-17656 + LPF appliqué :21690-21814 | **FAIT** | cocher |
| TÂCHE 20 paywall Premium `[ ]` | Gate réel uniquement sur le coaching IA (engine.js:5719-5812 → `showPaywall`) ; SRS/APRE/Garmin NON gatés ; pas de Stripe | **PARTIEL** | requalifier |

**MANQUANT dans ROADMAP** (0 occurrence des mots-clés) : nomenclature Lots 1/2/A/B/B-2, Sentry,
cardio stats, sparklines, fusion de logs sync cross-device, freemium coaching IA (fait !), polish
chantier A (v312-319), chantiers polish restants B/E/C/D, priorité freemium #1.

**Proposition** : réécrire ROADMAP en 3 sections — ✅ Fait (avec versions), 🔄 En cours/partiel
(Garmin API, paywall/Stripe, push serveur), 📋 À faire priorisé (freemium #1, polish B/E/C/D,
alignement `family`↔matrix, fix test c2-harness, SW_VERSION). Conserver les règles absolues (elles
sont justes).

---

## 2. ARCHITECTURE.md — affirmation → réalité

| Affirmation | Réalité | Statut | Correction |
|---|---|---|---|
| « stats.js, workout.js, coach.js, social.js, ui.js à créer » | `coach.js` **existe** (chargé index.html:3420) ; stats/workout/social/ui n'existent toujours pas ; `joints.js` et `sentry-init.js` existent mais absents du tableau | **PARTIEL/PÉRIMÉ** | mettre à jour le tableau des fichiers cibles |
| Ordre de chargement listé (stats/workout/coach/social/ui « à créer ») | Réel (index.html:3414-3421) : engine → exercises → supabase → import → program → **joints** → coach → app (+ sentry.min/sentry-init en tête) | **PÉRIMÉ** | recopier l'ordre réel |
| « Navigation, tabs, toasts, modals → js/ui.js » | Le système unifié modales/toasts (v313-318) vit dans **app.js** (`_uiOpen`/`_uiClose`/`closeAllOverlays`, `showModal/showInfoModal/showConfirm/showSheet/showToast`) | **PÉRIMÉ** | soit documenter l'emplacement réel, soit acter une future extraction vers ui.js |
| (absent) modèle `family` ≠ muscleGroup | `family` posé sur 139 entrées EXO_DATABASE (18 valeurs) mais **non consommé** ; `EXERCISE_TRANSFER_MATRIX` (engine.js:2391) a SON vocabulaire family porteur de logique — non alignés | **MANQUANT** | documenter le modèle + l'état réel (dead metadata + mismatch à résoudre) |
| (absent) nomenclature : `name` précis, `nameAlt` (1020 occ.), synonymes | `EXO_SYNONYMS` engine.js:884, `matchExoName` :988, `WP_SYNONYMS` app.js:20755, `mergeExerciseData` engine.js:5002, migration import.js:1731-1773 | **MANQUANT** | section « Résolution des noms d'exercices » |
| (absent) échelle z, scroll-lock, `--surface-solid` | index.html `:root` (5 vars `--z-*`, `--surface-solid`), lock body fixed | **MANQUANT** | section « Système UI overlays » |

**Proposition** : retouche substantielle (garder les 3 règles de tête qui sont bonnes), réécrire le
tableau fichiers + ordre réel, ajouter 3 courtes sections (overlays unifiés, nomenclature/synonymes,
family/matrix avec l'état « non aligné »).

---

## 3. CLAUDE.md — affirmation → réalité

| Affirmation | Réalité | Statut | Correction |
|---|---|---|---|
| §2 « Fichiers JS (ordre) : … stats.js … social.js … » | `js/stats.js` et `js/social.js` **n'existent pas** ; manquent `joints.js`, `sentry-init.js` (+ min bundles). Ordre réel : index.html:3414-3421 | **FAUX** | corriger la liste |
| §2 clé `SBD_HUB_V29` | Confirmé (V26-V28 = chaîne de migration) | **JUSTE** | — |
| §4 « calcE1RM DEUX versions… program.js `_calcE1RMPrecise` NE PAS fusionner » | `_calcE1RMPrecise` **n'existe plus** ; program.js a `epleyE1RM`/`brzyckiE1RM` (program.js:61-66) | **PÉRIMÉ** | réécrire l'encart |
| §11 table versions : v150 → v312 | **Trou v151→v311** (161 versions !) : sync cross-device, challenges, sparklines, cardio stats, nettoyages, nomenclature Lots (v306-311)… Et **v320 absent** (fix recherche manuelle) | **INCOMPLET** | ajouter au minimum les jalons v300-v311 (nomenclature) + v320 ; idéalement une ligne par grand thème v151-v299 |
| §14 « Télémétrie error_logs à brancher (prompt prêt) » | **Branchée** : supabase.js:189 + rapport bug app.js:26656 ; ET Sentry livré (sentry-init.js, index.html:30-31) — non mentionné | **PÉRIMÉ** | cocher + ajouter Sentry |
| §14 « calcE1RM dedup final (renommage program.js déjà fait) » | Le renommage constaté (epley/brzycki) — l'item semble soldé | **À VÉRIFIER/cocher** | statuer |
| (absent) système modales unifié + primitives + règles d'usage | Livré v313-318 | **MANQUANT** | courte section « UI overlays : toujours passer par showModal/showConfirm/showSheet/showToast, jamais de confirm() natif, jamais d'overlay artisanal » — c'est LA règle anti-régression |
| (absent) `PROMPT_RULES.md` non référencé | Il contient des règles de commit/tests OBLIGATOIRES (npm test vert, SW_VERSION+CACHE_NAME) que CLAUDE.md ne mentionne pas → les prompts qui ne lisent que CLAUDE.md les ratent (c'est arrivé : polish) | **MANQUANT** | référencer PROMPT_RULES.md dans §3 « Toujours faire » |

---

## 4. Autres .md

| Doc | Constat | Proposition |
|---|---|---|
| `TODO.md` (30 Ko) | « État en temps réel » : SW **v138**, dernier audit 2 mai — réel v320/9 juillet. Sections migrations Supabase utiles historiquement | Réécrire l'en-tête + état, OU renommer `TODO-archive.md` et repartir d'un TODO court. Ne pas laisser « temps réel » sur un doc de mai |
| `PROMPT_RULES.md` | À jour, actionnable, mais violé par les chantiers polish (règles 1 et 4) faute d'être référencé dans les prompts | Garder tel quel ; le référencer dans CLAUDE.md et dans le gabarit de prompts |
| `POLISH_DIAGNOSTIC.md` | Diagnostic exact au moment T ; chantier A désormais FAIT, chantiers B/E/C/D restent valides | Bandeau en tête : « Chantier A réalisé v312-319 — reste B/E/C/D » |
| `CHANTIER_A_PHASE1.md` | Plan intégralement exécuté (5 vagues) | Bandeau « Exécuté v313-319 » |
| `AUDIT_REPORT.md` (v105, 27/04), `REGRESSION_AUDIT.md`, `SOCIAL_AUDIT.md`, `STATS_AUDIT.md` (26/04) | Photos d'avril, très périmées si relues comme actuelles | Déplacer dans `audit/` (00-*) ou bandeau « HISTORIQUE avril 2026 » |
| `audit/64-70` (nomenclature) | Vérifiés cohérents avec le code (spot-checks OK : anti-collapse livré, BEGINNER_SUBSTITUTES présent, gaps créés). Un écart de fond : spec 67 = 28 familles/alignement matrix → code = 18 familles/pas d'alignement | Garder ; noter l'écart famille/matrix dans ROADMAP comme reste-à-faire |
| `audit/*` (reste, ~100 fichiers) | Journaux datés par nature | Garder tels quels (aucun ne se présente comme actuel) |
| `docs/GAMIFICATION_V2_SPEC.md` | Spec non confrontée (hors périmètre demandé) | Auditer si un chantier gamification est prévu |

---

## Ordre de correction proposé (après ta validation, doc par doc)

1. **ROADMAP.md** (réécriture 3 sections) — c'est lui qui oriente les prompts.
2. **CLAUDE.md** (liste JS §2, §4 e1RM, table versions, §14, réf PROMPT_RULES, section overlays).
3. **ARCHITECTURE.md** (fichiers réels + 3 sections nouvelles).
4. **TODO.md** (renommage archive + nouveau TODO court).
5. Bandeaux « historique/réalisé » : POLISH_DIAGNOSTIC, CHANTIER_A_PHASE1, 4 audits racine.
6. **Hors doc, à planifier** : fix test `c2-harness` (extraction `_uiOpen`), bump `SW_VERSION`,
   décision `family` (aligner avec la matrix ou assumer la métadonnée dormante).

**STOP — aucun doc modifié. À toi de valider quelles corrections appliquer.**
