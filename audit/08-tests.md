# AUDIT 08 — Qualité des tests

> Agent 08 (vague 4, prioritaire). Domaine : **pourquoi ~602 tests verts n'ont pas empêché
> les 5 bugs de référence.** READ-ONLY strict — un seul fichier écrit : ce rapport.
> Branche `claude/agent09-profils-fixtures`, mercredi 15 juillet 2026, 08h46 UTC.
> Analyse **statique** (node_modules absent, cf. Blocages). S'appuie en lecture sur
> `audit/09-profils.md` + `tests/fixtures/profiles/` (agent 09) pour le volet « fixtures mensongères ».

---

## Blocages rencontrés

**1. `node_modules` absent → `npm test` ne tourne pas** (constaté : `ls node_modules/.bin/jest` KO).
Conforme à la consigne : j'ai **priorisé l'analyse statique** des fichiers de test et fixtures.
Je n'ai **pas** tenté `npm ci` (optionnel, best-effort) — la valeur du domaine est dans la
lecture des fixtures et des assertions, pas dans l'exécution. **Aucun contournement.** Un
état d'exécution réel (nombre exact de tests, temps de render bug e) reste à confirmer par
Aurélien via un `npm ci && npm test` sur device/CI.

**2. Playwright injoignable** : les 397 cas `tests/*.spec.js` exigent node_modules **+** un
serveur http (`playwright.config.js` → `http-server . -p 8080`). Non exécutables ici, et
par ailleurs signalés « ancien markup » (CLAUDE.md §17). Ce tier entier est **noir en CI
sans navigateur** — point remonté, non bloquant pour l'audit statique.

Aucun autre blocage. Aucune modification, aucun commit, aucun accès Supabase.

---

## Résumé exécutif

**LA raison pour laquelle 602 tests étaient aveugles** : les tests *comportementaux* sont des
**rétro-ajouts** écrits APRÈS que chaque bug ait été attrapé sur device (les en-têtes le
disent : « fix v345 », « fix deadlift v346 », « closes the 0-unit-tests gap ») — ils
**verrouillent le correctif, ils n'ont jamais eu la chance de prévenir le bug.** Et là où un
test préventif aurait dû exister, il a été remplacé par du **grep de source** : **97 / 985
assertions (~10 %) vérifient qu'un littéral existe dans app.js/engine.js/coach.js**, pas un
comportement — concentré sur les fichiers « coach » (`coach-justesse-r2` **91 %**,
`coach-contradictions` **92 %**, la partie message de `sbd-projection` **45 %**). Ces tests
prouvent la **forme du code**, jamais son **exécution sur données réelles** — exactement la
classe de bug qui part en prod. Enfin les seules fixtures « profil complet » (`buildLogs`,
betatester) **étalent l'idéal** (20 séances régulières, aucun trou en tête de fenêtre, aucun
warm-up typé, maxRM plat, noms de lift génériques, rpe toujours numérique) → **structurellement
incapables de déclencher a/b/c/d/e.** Bilan : **17 findings** — P1 : 4 (faux sentiment de
sécurité, dont **bugs c et e sans AUCUN garde-fou**) · P2 : 6 · P4 : 7. Points forts réels :
`intensity-verdict`, `work-weight-harness/-bounds`, `merge-exercise-data`, `logs-out-of-blob`,
la moitié `calcTDEE`/`predictPR`/`recalcBestPR` sont d'excellents tests de comportement.

---

## Findings

> Sévérité (cadrée par le prompt pour ce domaine) : **P1** = test mensonger / faux sentiment
> de sécurité (le vert ne prouve rien d'utile) · **P2** = incohérence / tautologie / test
> fragile qui n'exerce pas ce qu'il prétend · **P4** = dette de test invisible.

### [P1] Les fichiers « coach-justesse » vérifient du texte source, pas du comportement
- **Où** : `tests/unit/coach-justesse-r2.test.js` (34 assertions, **31 sont du grep source, 0 fonction exécutée**) ; frères : `coach-contradictions.test.js` (22/24), `sbd-projection.test.js` bloc « recos Coach » (l.164-219).
- **Code** :
  ```js
  // coach-justesse-r2.test.js:22-25, 79-80  (aucun appel de fonction — que du texte)
  const src = fnA('calcTDEE');
  test('lit la fenêtre 28j…', () => { expect(src).toContain('getLogsInRange(28)'); });
  expect(src).not.toContain("stagnation.type === 'sur_atteinte' ? 'danger'");
  ```
- **Problème** : le fichier s'appelle « justesse Coach » et affiche 14 tests verts, mais il
  ne **calcule** jamais un ratio push/pull, ne **classe** jamais une stagnation, n'**évalue**
  jamais un seuil neuromusculaire. Il vérifie que des chaînes existent dans `engine.js`. Un
  bug de câblage/classification (la vraie cause de « S/B Critique 1.04 », « articulaire 100 pts »)
  passe **vert** tant que le littéral est présent. Et le test **casse à la moindre reformulation**
  (guillemets, ordre du ternaire) — brittle ET décoratif à la fois.
- **Devrait** : exécuter la vraie `analyzeAthleteProfile`/`classifyStagnation` (vm-extraction,
  comme le fait déjà `work-weight-harness`) sur un `db` et asserter la **sortie** (verdict,
  sévérité, libellé), pas le texte source.
- **Confiance** : certain.

### [P1] Deux « chiffres faux » shippés n'ont AUCUN test de comportement
- **Où** : `computeStrengthRatiosDetailed` (engine.js:2589) et `calcWeeklyJointStress`
  (engine.js:3915) — **0 exécution dans toute la suite** (unit+spec). Seule trace : le
  **stub** `getJointStressAlerts: () => opts.jointAlerts` (coach-contradictions.test.js:46) qui
  les **masque**, et le grep du **constant** `STRENGTH_RATIO_TARGETS`.
- **Code** :
  ```js
  // coach-contradictions.test.js:100 — on assert le TEXTE de la constante, pas le classement
  expect(src).toContain('squat_bench: { ideal: [1.10, 1.35], alert: 1.10, danger: 0.85 }');
  ```
- **Problème** : ce sont exactement les fonctions derrière les bugs « S/B Critique à 1.04 » et
  « surcharge articulaire 100 pts ». Vérifier que la **constante de seuil** existe ne prouve
  pas qu'un ratio de 1.04 est classé « sain » ni qu'un stress de 120 est classé « orange ».
  Si la comparaison utilise `<` au lieu de `<=`, lit le mauvais champ, ou re-condamne un
  powerbuilder assidu, **tout reste vert.**
- **Devrait** : un test exécutant `computeStrengthRatiosDetailed({squat,bench,…})` qui assert
  **1.04 → pas danger** et `calcWeeklyJointStress` qui assert **120 → sous le seuil orange 130**.
- **Confiance** : certain.

### [P1] Bug (c) — faux « ✅ objectif atteint » : verrouillé uniquement par un grep négatif
- **Où** : `tests/unit/sbd-projection.test.js:196-201`.
- **Code** :
  ```js
  test('cas 1 — plus de faux « atteint » basé e1RM…', () => {
    expect(APP).not.toContain('atteint — fixe-toi un nouveau cap');
    expect(APP).toContain("_u+' atteint ! 🏆");           // branche bestPR
  });
  ```
- **Problème** : `predictPR` renvoie bien `weeks:0` quand `target ≤ currentE1RM`
  (l.61, testé) — c'est **l'entrée dangereuse** (e1RM gonflé ≥ objectif). Mais **aucun test
  ne construit un profil `{bestPR<objectif, e1RM≥objectif}` et n'assert que le message rendu
  ne dit PAS « atteint »**. Le fix est « prouvé » en vérifiant qu'une chaîne a été supprimée
  du source. Refactor du builder de message avec d'autres libellés → grep vert, **régression
  invisible**. Le commentaire l.194-195 l'admet : « le message est dérivé au render, dans un
  gros orchestrateur non extractible en pur ; l'e2e couvre le rendu réel » — or l'e2e est
  Playwright (ancien markup §17, **hors `npm test`**, non exécuté ici).
- **Devrait** : rendre le builder de message extractible (petit refactor qui **paie sa
  testabilité**) puis asserter, sur profil {bestPR 155 / e1RM 162 / target 160} → message
  **sans** `atteint`/`🏆`, **avec** « stable autour de 155 ». (Cf. livrable « test manquant c ».)
- **Confiance** : certain.

### [P1] Bug (e) — freeze au render sur gros historique : zéro test de charge/perf
- **Où** : `tests/unit/coach-render-pure.test.js` (fixtures ≤ 5 logs), tout le tier render.
  L'unique fixture volumineuse (`aurel_like`, **562 séances / ~1 Mo**, agent 09) n'est
  **consommée par AUCUN test** (grep `fixtures/profiles` dans tests/ → NONE).
- **Problème** : la classe de bug « freeze sur gros historique » est **entièrement non
  couverte**. Tous les tests de render tournent sur des `db` minuscules et prouvent la
  correction fonctionnelle, jamais le **passage à l'échelle** (O(n²) sur `db.logs`, quota
  localStorage, temps de render). Un render qui gèle à 562 séances passe vert à 5.
- **Devrait** : un test qui charge `aurel_like` et assert (a) le pipeline de render se
  termine sous un budget (ex. < 500 ms) et (b) `db` inchangé après render (double bénéfice :
  perf **et** render pur). C'est le test le plus rentable — il consomme enfin la fixture 09.
- **Confiance** : certain.

### [P2] `coach-render-pure.test.js` ne teste PAS l'invariante render-pur
- **Où** : `tests/unit/coach-render-pure.test.js:22-33` ; `renderCoachToday` seulement **stubbé**
  (l.28), jamais exécuté ; idem `sbd-projection.test.js:232`.
- **Problème** : malgré son nom, le fichier teste des **helpers isolés** en lecture seule
  (`applyTdeeAdjustment` idempotent, `getVolumeByMuscleGroup`, `calcStreak(readOnly)` — ce
  dernier étant la seule **vraie** assertion de pureté, l.191-202). L'invariante CLAUDE.md §9
  « **db identique après 2 renders** » n'est **jamais** assertée sur le render composite. Le
  seul proxy est un grep (`_coachShowMore jamais écrit`, coach-card-budget.test.js:39).
- **Devrait** : `const b=JSON.stringify(db); renderCoachTodayHTML(); renderCoachTodayHTML(); expect(JSON.stringify(db)).toBe(b);` sur un profil réaliste.
- **Confiance** : certain.

### [P2] Test tautologique : l'ordonnanceur de cartes réimplémente le tri qu'il prétend tester
- **Où** : `tests/unit/coach-card-budget.test.js:62-70`.
- **Code** :
  ```js
  function schedule(cards, cap) {                     // ← copie locale de la logique
    const sorted = cards.slice().sort((a, b) => a.pri - b.pri || a.seq - b.seq);
    return { visible: sorted.slice(0, cap), … };
  }
  // …et l.33 on a justement grepé : expect(BODY).toContain('a.pri - b.pri || a.seq - b.seq');
  ```
- **Problème** : le test recrée **exactement** l'expression de tri du code (grepée l.33) puis
  assert sur sa **propre copie**. Le vrai ordonnanceur de `renderCoachTodayHTML` n'est jamais
  exécuté. Si le tri réel était faux, le test — qui teste sa réimplémentation — reste vert.
- **Devrait** : extraire le vrai ordonnanceur ou l'exercer via le render ; sinon le test ne
  couvre rien du code de prod.
- **Confiance** : certain.

### [P2] L'exclusivité de l'arbitre d'intensité (unicité du verdict) n'est pas testée
- **Où** : `tests/unit/intensity-verdict.test.js` prouve `computeIntensityVerdict` **interne**
  (table de vérité + pureté + « exactement 1 verdict », l.214-229 — excellent). Mais
  l'invariante §9 « **aucune carte ne prescrit repos/deload hors arbitre** » n'est vérifiée
  que par grep négatif ailleurs (`not.toContain('Banqueroute')`, coach-contradictions:26).
- **Problème** : la correction interne du verdict ne prouve pas son **exclusivité**. Les
  contradictions purgées (« Banqueroute », « 3 jours de repos ») venaient d'**autres** cartes
  émettant un verdict. Rien ne scanne le render pour garantir qu'une seule voix prescrit
  l'intensité. Un futur ajout de carte peut ré-émettre un deload concurrent → vert.
- **Devrait** : test qui rend le Coach sur un `db` et assert **au plus une** occurrence de
  prescription d'intensité (une seule `renderIntensityVerdictCard` / un seul bloc `coach-deload`).
- **Confiance** : probable.

### [P2] Assertion morte : `&&` entre deux `expect` court-circuite la seconde
- **Où** : `tests/unit/coach-contradictions.test.js:85-86`.
- **Code** :
  ```js
  expect(body).not.toContain('var volumes   = getVolumeByMuscleGroup')
    && expect(body).not.toContain('volumes[key]');
  ```
- **Problème** : `expect().not.toContain()` renvoie `undefined` → `undefined && …`
  **court-circuite** → la seconde assertion (`volumes[key]`) **n'est jamais évaluée**. Un
  test qui affiche « 2 vérifications » n'en exécute qu'une, silencieusement.
- **Devrait** : deux `expect` sur deux lignes distinctes.
- **Confiance** : certain.

### [P2] `getDailyCaloricTarget` (chiffre montré à l'utilisateur) testé par grep + tautologie
- **Où** : `tests/unit/caloric-target.test.js:140-154`.
- **Code** :
  ```js
  const src = extractFn(APP, 'getDailyCaloricTarget');
  test('macros : P 2.2 g/kg…', () => {
    expect(src).toContain('bw * 2.2');                 // grep source
    expect(Math.round(98 * 2.2)).toBe(216);            // tautologie : le test recalcule lui-même
  });
  ```
- **Problème** : la fonction **n'est jamais exécutée** — on grep son source et on recalcule la
  macro **avec la même formule** que le code. Le « 4035 kcal (triple comptage d'activité) »
  peut revenir par un autre chemin (bonus jour-séance, `activityLogs`) sans que ce test le
  voie. (Nuance : `calcTDEE` **est** testé comportementalement et bien — l.51-138, dont le
  trou de fenêtre l.60-71 ; c'est l'**assemblage final** cible+macros+activités qui n'est que
  grepé.)
- **Devrait** : exécuter `getDailyCaloricTarget()` avec `activityLogs` peuplés et asserter la
  cible numérique (≈2672, jamais > 3000). Cf. livrable « test manquant a ».
- **Confiance** : certain.

### [P4] Aucun contrôle du temps → tests fragiles à la date / au fuseau
- **Où** : `jest.setup.js` (vide de tout contrôle temporel) ; **12/36** fichiers unit utilisent
  l'horloge réelle ; **0** `useFakeTimers`/`setSystemTime`/MockDate dans tout le repo.
- **Code** :
  ```js
  // autoreg-apply.test.js:25   intensity-verdict.test.js:275
  const TODAY = DAYS[new Date().getDay()];
  const tomorrow = JOURS[(new Date().getDay() + 1) % 7];
  // partout : new Date().toISOString().split('T')[0]  → date UTC injectée comme « aujourd'hui »
  ```
- **Problème** : les attentes dépendent du **jour d'exécution** et d'un « today » calculé en
  **UTC** injecté dans des fonctions qui peuvent utiliser l'heure **locale** → décalage d'un
  jour près de minuit / hors UTC → check-in du jour non matché → **flaky**. `sbd-projection.test.js:26-30`
  documente explicitement un non-déterminisme flottant lié aux **vraies dates** qu'il a dû
  contourner (base T0 réduite). Vert aujourd'hui (CI en UTC) mais **latent-flaky**.
- **Devrait** : `jest.useFakeTimers().setSystemTime(FIXED)` global, ou injecter `now` partout.
- **Confiance** : certain (fragilité de construction) ; probable (flake réel).

### [P4] Les harnais de caractérisation figent des quirks comme s'ils étaient corrects
- **Où** : `tests/unit/c2-harness.test.js` (72 cas) + `work-weight-harness.test.js`, stratégie
  « observe-then-assert ».
- **Code** :
  ```
  // c2-harness.test.js:11-14 (en-tête) — quirks nommés, puis FIGÉS :
  //  - Fast-Track : moyenne readiness ARRONDIE avant seuil 85 → frontière effective 84.5
  //  - calculateReadiness(10,10,10,10) = 78, pas 100 (soreness inversé 11-x)
  ```
- **Problème** : ces 72 tests verts assertent le comportement **actuel, y compris ses bugs
  documentés**. « Vert » = « inchangé », **pas** « correct ». C'est excellent pour la sécurité
  de refactor, mais ça **gonfle le compteur de tests verts** d'assertions qui ne valident pas
  la justesse — contributeur direct au faux sentiment de sécurité (« 602 verts »).
- **[VOULU?]** : oui, stratégie délibérée. Le risque n'est pas le harnais, c'est de **lire son
  vert comme une preuve de correction**.
- **Confiance** : certain.

### [P4] Config Jest dupliquée + fixture `helpers.js` périmée
- **Où** : `js/jest.config.js` (orphelin) duplique `jest.config.js` racine (sans
  `testPathIgnorePatterns`) ; `tests/helpers.js:9-28` `DEFAULT_DB`.
- **Code** :
  ```js
  // helpers.js — champs qui ne collent plus au schéma onboarding v337 :
  targets:{…}, trainingMode:'powerlifting', onboarded:true, social:{…}
  ```
- **Problème** : la config orpheline dérive silencieusement (piège de maintenance : §5 skill).
  `DEFAULT_DB` et les `profileA/B/C` betatester (`onboardingProfile`, `todayWellbeing`,
  `coachProfile`, `vocabLevel`) utilisent des champs **obsolètes** (cf. agent 09 §5) → toute
  spec Playwright bâtie dessus seed un `db` non représentatif du réel v337.
- **Confiance** : certain (déjà partiellement au backlog / signalé agent 09).

### [P4] Tier Playwright (397 cas) non exécutable en CI sans navigateur, markup ancien
- **Où** : `tests/*.spec.js` + `tests/playwright/` ; `playwright.config.js` exige `http-server`.
- **Problème** : ~40 % de la surface de test nominale (397 cas) ne tourne pas dans `npm test`
  (jest ne matche que `**/*.test.js`) et est marquée « ancien markup » (§17). Le
  `no-console-errors.spec.js` / smoke réels ne protègent donc rien en CI headless.
- **[VOULU?]** : partiellement — séparation jest/playwright volontaire ; la **péremption** du
  markup ne l'est pas.
- **Confiance** : certain.

---

## Ce qui est BON (à ne pas régresser)

Contrepoint honnête — la suite n'est pas globalement mauvaise, elle a des **trous ciblés** :
- `intensity-verdict.test.js` : table de vérité complète de `computeIntensityVerdict`, **pureté
  + unicité** assertées (l.214-229). Modèle du genre.
- `work-weight-harness.test.js` : orchestrateur `wpComputeWorkWeight` **de bout en bout**
  (vraie source, valeurs + effets de bord), documente même un bug latent via `test.failing`
  (l.224). `work-weight-bounds.test.js` : pipeline de clamps pur, pureté assertée.
- `merge-exercise-data.test.js` : pureté + **idempotence** — anti-double-somme réel.
- `logs-out-of-blob.test.js` : fonctions de sync réelles (blob/hydratation) exécutées.
- `pr-real-records.test.js` + moitié `sbd-projection.test.js` : b/c/d **au niveau calcul**
  (`recalcBestPR`, `_exoMaxRealWeight`, `predictPR`, `getSBDType`, `getLiftPRDisplay`) sont
  de vrais tests de comportement. Le trou est le **dernier kilomètre** (message rendu) et le
  **réalisme des fixtures**, pas le cœur algo.
- `caloric-target.test.js:60-71` : le scénario **trou en tête de fenêtre** (bug a) EST couvert
  au niveau `calcTDEE` — rétro-ajout réussi.
- Assertions faibles rares : `toBeDefined`/`toBeTruthy` = 6 occurrences sur 985. Bon point.

---

## LIVRABLE 1 — TABLEAU DES FIXTURES

| Fixture | Fichier | Réaliste ? | Aspérités manquantes (→ bug rendu invisible) |
|---|---|---|---|
| **`buildLogs(bw)`** | `tests/audit-seances-betatester.spec.js:56-95` | ❌ **idéalisée** | 20 séances **pile** à `i×1.5 j`, **aucun trou** ni trou en tête de fenêtre (→ bug **a**) ; `isWarmup:false` partout, **jamais** `setType:'warmup'` (→ warmups typés comptés) ; `maxRM` **plat** hardcodé (150/100/180), pas de `repRecords`/`series` (→ `_exoMaxRealWeight` chemin #1 jamais exercé) ; `'Soulevé de Terre'` **générique**, pas de RDL/« Jambes Tendues » à côté (→ bug **d** impossible) ; `rpe` toujours numérique (→ NaN jamais testé) ; e1RM≈bestPR jamais divergents (→ bugs **b/c**) |
| `profileA/B/C` | même fichier, l.99-… | ❌ **champs obsolètes** | `onboardingProfile`, `todayWellbeing`, `coachProfile`, `vocabLevel`, `trainingMode` — schéma **pré-v337** (cf. agent 09 §5) ; `readinessHistory`/`pain` absents |
| `DEFAULT_DB` | `tests/helpers.js:9-28` | ❌ **périmée + vide** | `targets`, `trainingMode`, `onboarded`, `social` (champs stale) ; `logs:[]` — aucune donnée à stresser |
| `nominalDb` | `tests/unit/work-weight-harness.test.js:98-109` | ⚠️ **OK pour son scope** | 1 seul squat log ; adéquat pour tester le pipeline de charge en isolation, **pas** un profil complet |
| `HIST` / `mkExo`/`mkLog` | `tests/unit/pr-real-records.test.js:37-40` | ⚠️ **OK pour son scope** | exo synthétique isolé ; ne reproduit **pas** une séance mixte ordonnée (RDL-d'abord + warmups + titre sans lift) |
| `deviceLogs` | `tests/unit/caloric-target.test.js:54-59` | ✅ **modélise le trou** | rétro-ajout : trou en tête de fenêtre + historique long. Bon. Mais **synthétique** (timestamps nus, sans exercices) |
| `seedWithGap` | `tests/unit/coach-render-pure.test.js:184-190` | ⚠️ partielle | trou de streak + freezes ; logs sans exercices |
| **`tests/fixtures/profiles/*`** (agent 09) | `aurel_like`, `donnees_sales`, `mono_lift`, … | ✅ **réalistes** | **reproduisent** trous irréguliers, RDL-first, warmups 2 formats, rpe null, check-in partiel pain=null, e1RM≠bestPR, 562 séances. **MAIS consommées par AUCUN test** (grep → NONE) |

**Synthèse** : toutes les fixtures **exécutées par la suite** étalent l'idéal ou sont trop
minces ; la seule bibliothèque réaliste (agent 09) n'est pas encore branchée. C'est la cause
racine avérée : *une fixture qui ne reproduit pas la réalité rend le test décoratif.*

---

## LIVRABLE 2 — TABLEAU DE COUVERTURE PAR RISQUE

| Fonction critique | Testée ? | Risque si elle casse |
|---|---|---|
| `calcTDEE` (engine.js:1144) | ✅ **comportement** (caloric-target, trou de fenêtre inclus) | chiffre kcal faux montré à l'user |
| `getDailyCaloricTarget` (app.js:15316) | ⚠️ **grep source seul** (jamais exécutée) | **retour du 4035** via activités recomptées — non détecté |
| `calcE1RM` (app.js:1729) | ✅ comportement (formulas) | e1RM faux (mais **isolé** — pas son câblage UI) |
| `wpCalcE1RM` / `wpComputeWorkWeight` (13 étapes) | ✅ **excellent** (work-weight-harness + bounds, orchestrateur complet) | charge prescrite dangereuse |
| **`computeStrengthRatiosDetailed`** (engine.js:2589) | ❌ **0 exécution** (constante grepée, alertes stubbées) | **retour du « S/B Critique 1.04 »** — non détecté |
| **`calcWeeklyJointStress`** (engine.js:3915) | ❌ **0 exécution** | **retour de « articulaire 100 pts »** — non détecté |
| `computeIntensityVerdict` (app.js:18637) | ✅ **excellent** (table de vérité + pureté) | verdict d'intensité faux |
| *exclusivité* de l'arbitre (§9) | ❌ **grep négatif seul** | carte concurrente ré-émet deload/repos |
| `computeSRS` (coach.js:672) | ⚠️ partiel (pin ACWR/reprise testés ; pondérations non) | readiness faux |
| `predictPR` (app.js:9262) | ✅ comportement (plateau/progression/RDL-first **synthétique**) | palier faux (bug d au niveau calcul : couvert) |
| `recalcBestPR` / `_exoMaxRealWeight` | ✅ comportement (pr-real-records) | PR gonflé par rep-work |
| **message-ladder Coach** (rendu 6-cas) | ❌ **grep source seul** (« e2e couvre » = faux : hors npm test) | **bugs b + c** (e1RM affiché / faux « atteint ») |
| **render composite** (`renderCoachTodayHTML`, `renderHome`) | ❌ **stubbé/grepé**, jamais exécuté | **bug e (freeze)** + violation render-pur |
| `getSmoothedE1RM` (engine.js:4051) | ❌ 0 test | fallback bestPR sur lift absent → fausse alerte (agent 09 F2) |
| `migrateDB` (V26→V29) | ❌ pas de test dédié | **perte de données** à un bump de version |
| sync/blob (`_buildSyncedBlob`, `_shouldHydrateLogs`) | ✅ comportement (logs-out-of-blob) | perte de logs au sync |
| `getAllBadges` / `xpHighWaterMark` monotone | ⚠️ préservation au merge testée (sync-*) ; **invariante « ne descend jamais » non** | XP qui régresse / badge révoqué |
| `getCycleCoeff` (volume cycle) / `getReturnToPlayFactor` | ❌ 0 test (le state reprise l'est, pas le coeff) | volume/charge cycle faux |
| *coaching 100 % algorithmique* (pas d'IA dans la décision) | ❌ non testé (hits « Gemini » = commentaires) | une prescription se met à dépendre d'un appel IA |

---

## LIVRABLE 3 — LES 5 TESTS MANQUANTS (a→e), prêts à implémenter

> Style aligné sur les harnais existants (vm-extraction de la vraie source). Les fixtures
> `aurel_like`/`progression_nette` viennent de `tests/fixtures/profiles/` (agent 09) et sont
> chargeables par le vrai loadDB — **il est temps de les brancher.**

### (a) — TDEE : les activités ne sont JAMAIS recomptées (anti-4035), et stabilité au trou
```js
// tests/unit/caloric-target.test.js  (compléter le describe getDailyCaloricTarget)
test('getDailyCaloricTarget: activités présentes → cible ≈2672, JAMAIS > 3000 (pas de triple comptage)', () => {
  // FIXTURE (aspérité : activityLogs peuplés + trou en tête de fenêtre)
  const db = { user:{ bw:98,height:182,age:28,gender:'male',goal:'recompo',tdeeAdjustment:0 },
    logs: deviceLogs(22, [45,60]),                 // 20 séances, 1re à J-22, historique long
    activityLogs:[{date:today, type:'course', duration:60, intensity:4, trimp:422, source:'garmin'}] };
  const target = runReal('getDailyCaloricTarget', db);   // EXÉCUTE la vraie fn (pas un grep)
  expect(target.kcal).toBeLessThan(3000);
  expect(target.kcal).toBe(2672);                        // valeur de réf aurel_br
});
// ASSERTION-CLÉ : exécuter la fonction, pas grep `bw * 2.2`. Le bug est un chemin, pas un littéral.
```

### (b) — e1RM jamais affiché : la ligne coach montre bestPR (170), pas l'e1RM (169)
```js
// nécessite d'exposer le builder de message SBD (petit refactor de testabilité)
test('coach « stable autour de » affiche bestPR, jamais l\'e1RM plat', () => {
  // FIXTURE aurel_like : bestPR.deadlift=170 ; maxRM récents PLATS à 169 (deadlift 160×3)
  const db = profiles.build('aurel_like');
  const pred = predictPR('deadlift', 220);               // → currentE1RM 169, plateau
  const line = buildSbdMilestoneLine('deadlift', pred, db.bestPR);  // fn à extraire
  expect(line).toContain('170');                         // la VRAIE barre
  expect(line).not.toContain('169');                     // jamais l'e1RM en chiffre affiché
});
```

### (c) — faux « objectif atteint » sur e1RM gonflé alors que la barre n'y est pas
```js
test('e1RM gonflé (162) ≥ objectif (160) MAIS bestPR (155) < objectif → PAS de « atteint »', () => {
  // FIXTURE (aspérité : e1RM ≠ bestPR — rep-work gonfle l'e1RM sous l'objectif réel)
  const db = { bestPR:{squat:155}, user:{ targets:{squat:160} },
    logs: repWorkLogs('Squat (Barre)', {reps:8, weight:150})  // e1RM Brzycki ≈ 162, barre réelle 150
  };
  const msg = buildSbdMilestoneLine('squat', predictPR('squat',160), db.bestPR);
  expect(msg).not.toMatch(/atteint|🏆/);                 // aucune célébration
  expect(msg).toContain('155');                          // « stable autour de 155 », le PR réel
});
```

### (d) — deadlift reconnu : predictPR suit le SDT (Barre), pas le RDL « Jambes Tendues »
```js
// durcit le test synthétique existant (sbd-projection:81) sur un PROFIL RÉALISTE complet
test('aurel_like: predictPR(deadlift) régresse sur le SDT (Barre), jamais sur le RDL listé avant', () => {
  // FIXTURE aurel_like : séance « Ischios Fessiers » = RDL « Jambes Tendues » (plat 110) EN 1er,
  //                       puis « Soulevé de Terre (Barre) » qui progresse. Warmups 2 formats.
  const db = profiles.build('aurel_like');
  const r = predictPR('deadlift', 210);                  // vm avec le VRAI getSBDType
  expect(r.currentE1RM).toBeGreaterThan(150);            // le SDT (~186-200), pas 110 du RDL
  expect(r.reason).not.toBe('Pas de progression détectée'); // le RDL plat ne masque plus la pente
});
```

### (e) — freeze au render + render-pur sur gros historique (562 séances)
```js
test('render Coach sur 562 séances : termine < 500ms ET n\'écrit rien (perf + render pur)', () => {
  // FIXTURE aurel_like : 562 séances / ~1 Mo — la volumétrie réelle jamais approchée jusqu\'ici
  const db = profiles.build('aurel_like');
  const before = JSON.stringify(db);
  const t0 = Date.now();
  renderCoachTodayHTML();                                // le VRAI render (à instrumenter via jsdom/vm)
  expect(Date.now() - t0).toBeLessThan(500);             // garde-fou freeze (bug e)
  expect(JSON.stringify(db)).toBe(before);               // invariante render-pur §9
});
```

---

## Angles morts de cet audit

- **Exécution réelle impossible** (node_modules absent) : je n'ai pas pu confirmer que les 536
  cas jest passent effectivement ni mesurer le temps de render (bug e). Compte runtime ≈ 602
  plausible (536 statiques + expansions de boucles/`.each`, ex. la batterie `getSBDType`
  ~17 cas générés). À confirmer par `npm ci && npm test` côté Aurélien.
- **Playwright non lu en détail** (397 cas) : caractérisés comme « ancien markup » (§17) et
  hors `npm test` ; je n'ai audité que leur non-exécutabilité et la fixture `buildLogs`.
- **Je n'ai pas ré-audité** la correction algorithmique des fonctions (domaine agents 01/02) —
  seulement leur **couverture de test**.
- **`test.each`/boucles** : mon comptage statique (536) sous-estime le runtime ; sans exécution
  je ne peux pas lister les cas générés dynamiquement.

## Hors-domaine (signalé, non investigué)

- Bug latent `wpComputeWorkWeightSafe` **avale** `forceActiveRecovery` (kill switch cumulé
  n'atteint jamais l'appelant) — documenté en `test.failing` (work-weight-harness:224). → agents algo.
- `_normalizeCheckinEntry` : `null/2=0`, `undefined/2=NaN` sur check-in partiel (agent 09 F4). → agent data/coach.
- Absence de garde-fou outlier sur `recalcBestPR` (315 kg empoisonne PR+ratios, agent 09 F1). → agent calculs.
- Écriture orpheline `localStorage.setItem('SBD_HUB', …)` app.js:4388 (backlog §17). → agent persistance.
- `js/jest.config.js`, `js/supabase.min.js` orphelins — cleanup. → agent inventaire.

## À VÉRIFIER CÔTÉ SUPABASE

Je suis aveugle à la base. Pour **calibrer le réalisme des fixtures de test** (et donc la
pertinence des 5 tests manquants), questions précises à router via Claude.ai :

1. **Distribution réelle 28j d'aurel_br** : y a-t-il effectivement des **trous irréguliers**
   et un trou **en début de fenêtre** (le scénario qui faisait osciller le TDEE) ? Confirme
   que la fixture `deviceLogs(22,…)` reflète la réalité.
   > `select short_date, timestamp from workout_sessions where user_id='6e2936e7-de11-4f19-89b1-d1eb5968ba35' and timestamp > now() - interval '28 days' order by timestamp;`
2. **e1RM registre deadlift vs bestPR** : le test (b) suppose e1RM ≈ 169-188 (plat) ≠ bestPR 170.
   Quelle est la vraie divergence en base ? (calibre l'assertion « 170 pas 169 »).
   > `select data->'exercises'->'Soulevé de Terre (Barre)'->>'e1rm', data->'bestPR' from sbd_profiles where user_id='6e2936e7-…';`
3. **Rep-work sous objectif** (test c) : existe-t-il de vrais cas où l'e1RM Brzycki d'un
   set de rep-work **dépasse l'objectif** alors que la barre réelle est en dessous ? (prouve
   que le bug c est reproductible sur données réelles, pas seulement théorique).
4. **`activityLogs` peuplés** (test a) : les vrais profils ont-ils des activités secondaires
   (garmin/manual) susceptibles d'avoir causé le triple comptage ? Combien, quel `trimp` ?
   > `select jsonb_array_length(data->'activityLogs') from sbd_profiles where user_id='6e2936e7-…';`
5. **Volume réel d'historique** (test e) : ~562 séances est-il l'ordre de grandeur réel du
   plus gros user ? Le seuil de freeze doit être calé sur le pire cas réel.
   > `select user_id, count(*) from workout_sessions group by user_id order by count(*) desc limit 5;`
6. **Séances deadlift titrées sans le lift** (test d) : confirme « Ischios Fessiers » + exo
   « Soulevé de Terre (Barre) » **avec** un RDL/« Jambes Tendues » listé **avant** dans la même
   séance (l'ordre exact conditionne l'assertion).

---

STOP. Audit qualité-des-tests terminé. Rapport : audit/08-tests.md. Aucune modification, aucun commit.
