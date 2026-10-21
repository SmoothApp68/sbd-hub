# AUDIT 04 — Affichage, Couleur & Ton

> Agent 04 (vague 3) · branche `claude/agent09-profils-fixtures` · READ-ONLY.
> Horodatage run : 2026-07-15 08:08 → 08:17 UTC. SW réel `trainhub-v350` (service-worker.js:1).
> Domaine : affichage utilisateur, couleur/rouge, ton, unités/fenêtres, textes cassés, états vides, a11y mobile, overlays.

## Blocages rencontrés

Aucun. Aucune contrainte ne m'a forcé à envisager un contournement. Un seul fichier écrit : ce rapport.
Aucun accès Supabase tenté. `git status` doit rester `working tree clean` hormis `audit/04-affichage-couleur.md`.

## Résumé exécutif

- **~19 findings** : 1 P0, 2 P1, 4 P2, 10 P3, 2 P4.
- **LE point le plus important** : la **carte « Performance » du dashboard (`renderPerfCard`, app.js:9410)** affiche l'**e1RM comme chiffre principal, NON labellisé, dans la couleur du lift** — présenté comme si c'était le max réel. C'est exactement le pattern P0 « e1RM affiché au lieu du PR » (CLAUDE.md §4). Les surfaces sœurs (Records `renderRecordsPersonnels`, Coach SBD, import) sont, elles, **correctement gardées** (bestPR en tête, e1RM labellisé « estimé » ou masqué) → `renderPerfCard` est **l'oubli** du chantier de dé-fuite e1RM.
- **Chantier couleur (livrable principal)** : le vrai rouge injury-only est globalement respecté pour les alertes santé (douleur, RHR, kill-switch SRS). Les fuites de rouge décoratif restantes sont **des scores/jauges bas (<40)**, des **ratios de force « danger »** (déséquilibre ≠ blessure) et la **perte musculaire / weight-cut** (compo ≠ blessure). Le cas connu « volume insuffisant » est **déjà en orange** (15565), pas rouge — corrigé.
- **Palette** : les 3 tokens `--color-squat/--color-bench/--color-deadlift` sont **définis mais jamais utilisés (0 usage)** ; chaque carte hardcode ses propres couleurs de lift → le **squat est rouge (token), vert (perfCard), bleu (records)** selon l'écran. `--surface-solid` et les `--z-*` sont, eux, cohérents et bien employés.
- **Overlays** : 8 `prompt()` + 2 `confirm()` natifs subsistent (régression de l'invariante v313-320). Aucun `alert()` natif.

---

## Findings

### [P0] `renderPerfCard` affiche l'e1RM estimé comme chiffre principal du lift, sans label
- **Où** : `js/app.js:9410` (+ 9405, 9374, 9425), carte « Performance » (index.html:2445-2447, dashboard).
- **Code** :
  ```js
  // 9406-9410 : le GROS chiffre = e1rm, dans la couleur du lift ; le vrai 1RM en 9px sous-texte
  var realLine = kl.real1rm > 0 ? '<div style="font-size:9px;...">1RM: ' + kl.real1rm + ' kg</div>' : '';
  boxesHtml += '<div class="rm-box" ...>' +
    '<div style="font-size:9px;...">' + kl.shortLabel + '</div>' +
    '<div class="rm-val" style="color:' + kl.color + ';">' + kl.e1rm + '<span> kg</span></div>' + // ← e1RM en tête
    realLine + targetLine + bwRatio + ...
  // 9405 : le ratio ×bw est aussi calculé sur l'e1RM
  var bwRatio = (userBw > 0) ? '...×' + (kl.e1rm / userBw).toFixed(2) + ' bw...' : '';
  ```
- **Problème** : sous l'intitulé « Squat », l'utilisateur lit « **157 kg** » (= e1RM Brzycki estimé) et le comprend comme son max réel — alors que la vraie barre (`db.bestPR`) peut être 145. C'est le bug « Deadlift stable autour de 169 kg » (CLAUDE.md §7, §15). Aggravant : `real1rm` (9359) n'est pris **que sur `s.reps === 1`** — un powerbuilder qui ne loggue jamais de single a `real1rm = 0` → la ligne « 1RM » disparaît et **seul l'e1RM reste affiché**. Le ratio `×bw` (9405) et les barres du chart (9425) reposent aussi sur l'e1RM. Cette carte viole **et** CLAUDE.md §7 **et** la « Philosophie B » du code lui-même (e1RM visible seulement s'il est étiqueté « estimé » et que la vraie barre est le record — cf. `renderRecordsPersonnels`, 11269-11271).
- **Devrait** : chiffre principal = `db.bestPR[key]` (vraie barre) ; e1RM soit masqué, soit relégué et **explicitement labellisé « e1RM estimé »** comme à `renderRecordsPersonnels:11271`. Ratio `×bw` calculé sur la vraie barre. Aligner sur le pattern déjà correct de la carte Records.
- **Confiance** : certain (fonction live : appelée 9594, rendue dans `#perfDisplay`).
- **[VOULU?]** : non — la carte Records voisine prouve que la règle est connue et appliquée ailleurs ; c'est un oubli.

### [P1] Couleurs de lift incohérentes entre surfaces ; tokens `--color-*` définis mais inutilisés
- **Où** : `index.html:52-54` (définition) vs `js/app.js:9348` (perfCard) vs `js/app.js:11225-11235` (records). **0 usage** de `var(--color-squat|bench|deadlift)` dans tout le repo.
- **Code** :
  ```css
  --color-squat: #FF453A; --color-bench: #0A84FF; --color-deadlift: #FF9F0A;   /* jamais référencés */
  ```
  ```js
  // perfCard : squat = index 2 = #32D74B (VERT), deadlift = #FF453A (ROUGE)
  var LIFT_COLORS = ['#0A84FF','#32D74B','#FF453A','#FF9F0A','#BF5AF2'];
  // records : squat=#4a8fff (BLEU), bench=#5fc85f (vert), deadlift=#ff6b6b (rouge)
  ```
- **Problème** : le **squat** est rouge (token CSS), vert (perfCard), bleu (records) selon l'écran ; le **deadlift** orange (token) vs rouge (perfCard/records). Les 3 tokens créés précisément pour standardiser ne sont **jamais** utilisés. Effet de bord couleur : dans perfCard, la **barre deadlift est rouge #FF453A = `--danger`** → un lift lu comme une alarme. Incohérence de marque + rouge parasite.
- **Devrait** : une seule source de vérité (les tokens `--color-*`), employée par toutes les cartes. Choisir des teintes de lift **hors rouge/orange sémantiques** (le rouge doit rester réservé aux alertes) — cf. backlog §17.1.
- **Confiance** : certain.
- **[VOULU?]** : partiel — le hardcode par carte est probablement de la dette accumulée, pas un choix.

### [P1] Fuites e1RM secondaires (labellisées) — tension CLAUDE.md §7 vs « Philosophie B » du code
- **Où** : `js/import.js:1285` et `1290` (résumé d'import) ; `js/app.js:11271` (Records) ; `js/engine.js:5639` (message progression).
- **Code** :
  ```js
  // import.js:1285 — e1RM affiché en kg, labellisé
  html += `<div>...<strong>${comp.name}</strong> — e1RM <span class="ai-highlight blue">${Math.round(comp.e1rm)}kg</span> · ${comp.sets} séries</div>`;
  // import.js:1290 — comparaison e1RM inter-séances (prevE1RM en kg)
  // app.js:11271 — « e1RM estimé : XXX kg » (8px, gris, sous la vraie barre) ← pattern de RÉFÉRENCE
  // engine.js:5639 — branche FATIGUE_MASKED, pilotée par maxHistoricE1rm (5633)
  line2 = 'Potentiel ' + objectif + 'kg intact · Hausse attendue post-deload.';
  ```
- **Problème** : ces surfaces affichent des **nombres e1RM en kg**. Elles respectent la « Philosophie B » interne (e1RM visible **si** étiqueté « e1RM/estimé » et si la vraie barre reste le record — 11269-11270), mais **contredisent la lecture stricte de CLAUDE.md §7** (« Ne l'affiche jamais comme un chiffre »). Cas particulier `engine.js:5633-5639` : « Potentiel 160 kg intact » se déclenche quand `maxHistoricE1rm ≥ objectif·0.95` — donc un e1RM gonflé par du rep-work (130×8 → 162) peut afficher « Potentiel 160 kg intact » sans que la barre ait touché 160 (version douce du faux « objectif atteint »).
- **Devrait** : **décision produit à trancher (Aurélien/Gemini)** — soit §7 strict (retirer TOUT nombre e1RM de l'UI, y compris import et « e1RM estimé »), soit officialiser la Philosophie B dans CLAUDE.md §7 (e1RM autorisé **si** labellisé + vraie barre en tête). En l'état, la règle écrite et le code divergent. Pour `renderPerfCard` (P0 ci-dessus), **les deux lectures le condamnent**.
- **Confiance** : certain (sur l'affichage) ; le caractère « bug vs choix » dépend de la décision produit.
- **[VOULU?]** : oui pour import.js/records (Philosophie B assumée dans les commentaires) — à confirmer côté doc.

### [P2] `editRecord` : `prompt()` natif + cadrage « Record » sur un e1RM
- **Où** : `js/app.js:18350-18382`, liste de correction des records (`renderRecordsCorrectionList`).
- **Code** :
  ```js
  const newVal = prompt('Nouveau e1RM pour ' + exoName + ' (actuellement ' + Math.round(currentRM) + 'kg) :', ...);
  ...
  showToast('✓ Record corrigé : ' + exoName + ' → ' + val + 'kg');
  ```
- **Problème** : (a) `prompt()` natif = régression de l'invariante overlays (v313-320). (b) L'écran affiche `e1RM: XXXkg` (18340) puis parle de « **Record** corrigé » (18382) → conflation e1RM/record, précisément ce que la philosophie PR-vs-e1RM interdit. Pour les lignes SBD, `maxRM = db.bestPR[t]` (vraie barre) mais est quand même étiqueté « e1RM » (18311/18340) — double confusion.
- **Devrait** : input via `showSheet`/`showModal` (pas de `prompt()`) ; vocabulaire cohérent (« estimation » pour l'e1RM, « record » réservé à la vraie barre).
- **Confiance** : certain.

### [P2] Ratios de force « danger » rendus en rouge alors que ce n'est pas une blessure imminente
- **Où** : `js/engine.js:2799` (S/B), `2819` (S/D) → couleur via `js/app.js:19671` (`danger: 'var(--red)'`, icône 🚨 19665).
- **Code** :
  ```js
  bioAlerts.push({ severity: 'danger', title: 'Bench nettement plus fort que le Squat', ... }); // 2799
  bioAlerts.push({ severity: 'danger', title: 'Squat et Deadlift très déséquilibrés', ... });   // 2819
  ```
- **Problème** : un déséquilibre S/B ou S/D est un **problème de structure de force**, pas un risque de blessure imminent (le texte lui-même dit « priorise les quadriceps », pas « stop »). Le rendu 🚨 + rouge (`--danger`) sur-dramatise. Seul **Row/Bench danger (2838)** a un cadrage blessure légitime (« instabilité des épaules ») → rouge défendable là.
- **Devrait** : réserver le rouge à Row/Bench (santé épaules) ; passer S/B et S/D « danger » en **orange fort** (déséquilibre marqué mais non urgent). Ton déjà mesuré côté texte — c'est la **couleur** qui déraille.
- **Confiance** : probable (la calibration des seuils `STRENGTH_RATIO_TARGETS` est hors-domaine — voir Hors-domaine).
- **[VOULU?]** : possible pour Row/Bench ; non pour S/B, S/D.

### [P2] États vides SBD : nouvel utilisateur → tout « Objectif très ambitieux »
- **Où** : `js/engine.js:5633-5646` via `js/app.js:11248-11256`.
- **Problème** : sans historique, `maxHistoricE1rm = 0`, `requiredRateFromBest = (objectif-0)/sem` ≫ plafond → statut `AMBITIOUS` sur les 3 lifts. Un nouvel inscrit voit d'emblée « ⚡ Objectif très ambitieux » ×3, avec un PR affiché « 0kg / 160 ». Techniquement vrai mais mauvais premier contact.
- **Devrait** : état vide dédié (« Loggue tes premières séances pour estimer ta trajectoire ») tant que `dataPoints < 1`, plutôt que « très ambitieux ».
- **Confiance** : probable (dépend du gating d'affichage de la carte, non tracé ligne à ligne).

### [P3] Grappe de rouges décoratifs sur scores/jauges bas (< 40) — pas des blessures
- **Où** : `js/app.js:8363` & `15977` (Score de forme <40), `15997` (barres composantes <30), `18897` (Potentiel de Performance/SRS « Surcharge » <40), `19813` (jauge <40), `1009` (Readiness <40).
- **Code** :
  ```js
  const color = fs.total >= 80 ? 'var(--green)' : fs.total >= 60 ? 'var(--blue)' : fs.total >= 40 ? 'var(--orange)' : 'var(--red)'; // 15977
  var color = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : pct >= 40 ? 'var(--orange)' : 'var(--red)'; // 18896-97 « Surcharge »
  ```
- **Problème** : un score de forme/readiness bas est une **information d'état**, pas une blessure imminente. Le label est doux (« À améliorer », « Surcharge », « Entamé ») mais la couleur est l'alarme maximale — dissonance. C'est le rouge décoratif qui érode la crédibilité des vrais rouges.
- **Devrait** : borne basse en **orange** (ou orange foncé), rouge réservé aux alertes santé réelles. Le label doux garde le sens sans crier.
- **Confiance** : certain (couleur) ; le verdict « à dé-rougir » est un choix de chantier (Gemini).
- **[VOULU?]** : à trancher — palier de jauge classique, mais contraire au principe injury-only.

### [P3] Perte musculaire / weight-cut trop rapide en `severity:'danger'` (rouge) — compo ≠ blessure
- **Où** : `js/engine.js:4180-4184` (« ⚠️ Perte trop rapide ») et `4188-4194` (« 🔴 Perte musculaire suspectée »).
- **Problème** : perte de poids trop rapide et fonte musculaire sont des enjeux de **composition/nutrition**, pas des blessures imminentes. Rendus rouge (🚨/🔴) via le mapping `danger`.
- **Devrait** : orange/warning (enjeu à corriger, non urgence traumatique). Réserver le rouge à la blessure.
- **Confiance** : probable.
- **[VOULU?]** : possible (santé au sens large) — mais hors du principe injury-only.

### [P3] Volume `> MRV` en rouge & heatmap fatigue en rouge thermique
- **Où** : `js/app.js:15560` (`> MRV` → `var(--red)`) ; `js/app.js:9108-9112` (heatmap : fatigue ≥85 → `#FF453A`).
- **Problème** : (a) dépasser le MRV d'un muscle une semaine = **overreaching**, pas blessure imminente — le rouge est le haut d'un dégradé vert→orange→rouge, discutable pour un powerbuilder à haut volume assumé. (b) La heatmap colore la **fatigue** haute en rouge (thermal) : sur une silhouette corporelle, le rouge est lu comme « zone blessée/problème » alors qu'il signifie « très sollicité récemment ». Un muscle non entraîné ressort **vert** (pas rouge) → pas de piège « volume insuffisant = rouge » ici.
- **Devrait** : (a) rouge `> MRV` seulement bien au-dessus du seuil, sinon orange. (b) Heatmap : envisager une échelle chaude non-rouge (jusqu'au magenta/violet) pour dissocier « fatigué » de « danger ».
- **Confiance** : certain (couleurs) ; verdict = choix de chantier.
- **[VOULU?]** : oui pour la heatmap (convention thermique) — à arbitrer.

### [P3] `prompt()` / `confirm()` natifs restants (régression overlays v313-320)
- **Où** : `prompt()` — `js/app.js:13417, 14222, 18351, 26806, 27545, 28023, 29740, 30359`. `confirm()` — `js/supabase.js:2397, 4704`.
- **Problème** : l'invariante interdit `confirm()`/`alert()` natifs (CLAUDE.md §6). Les deux `confirm()` de supabase.js sont des violations nettes (`showConfirm` existe). Les 8 `prompt()` (ajout d'exo, renommage séance, intention de semaine, bug report…) sont des dialogues natifs bloquants incohérents sur Android Chrome — il n'existe pas de `showPrompt` (angle mort du système d'overlays).
- **Devrait** : router les `confirm()` via `showConfirm` ; introduire un helper d'input (`showSheet` avec champ) pour remplacer les `prompt()`.
- **Confiance** : certain. Aucun `alert()` natif trouvé (bon point).

### [P3] Micro-typographie sous 8px illisible sur mobile
- **Où** : `js/app.js:11050` (**6px**, titre de séance), `11205` (**6px**, label), `11138/11273/11280` (7.5px), `8404/8414/11045/11127/30651/30658` (7px). 161 occurrences <11px au total dans app.js.
- **Problème** : cible = Android Chrome ~412px. 6-7.5px est en-deçà du lisible (min recommandé ~12px, plancher absolu ~10px). Concentré dans les cartes Records/dashboard — pénalise justement les chiffres clés.
- **Devrait** : plancher 10-11px pour tout texte porteur d'information ; réserver <9px aux ornements non essentiels.
- **Confiance** : certain (tailles) ; l'impact réel demande une vérif device.

### [P3] Rouge sur messages de charge non-traumatiques
- **Où** : `js/app.js:16018` (`🔴 Surcharge`, ACWR>1.6), `23760` (`🔴 Activité très intense hier`), `20345` (`🔴 ` point notif non-lue).
- **Problème** : `🔴 Surcharge` sur ACWR>1.6 est le **plus défendable** (l'ACWR est un vrai proxy de risque de blessure) — à garder, mais vérifier l'alignement avec l'arbitre. « Activité très intense hier » (décale la séance) est du **load management**, pas une blessure → orange. Le point 🔴 « non-lu » (20345) est un indicateur décoratif conventionnel — neutre acceptable, mais c'est un rouge de plus dans l'inventaire.
- **Confiance** : certain.
- **[VOULU?]** : oui pour ACWR et le dot non-lu.

### [P4] Tokens `--color-squat/--color-bench/--color-deadlift` morts
- **Où** : `index.html:52-54`. 0 référence `var(--color-*)`.
- **Problème** : dette — tokens définis, jamais consommés (cf. P1 incohérence). Nettoyage OU adoption.
- **Confiance** : certain.

### [P4] `--parchment`, `--gold-*`, `--surface-border` : vérifier l'usage réel
- **Où** : `index.html:63` (bloc « Legacy aliases »).
- **Problème** : plusieurs alias legacy cohabitent avec les tokens « propres » (`--bg-card` vs `--card`, `--border-card` vs `--border`). Non bloquant, mais source de dérive de palette. `--surface-solid` (67) et `--z-*` (71) sont, eux, cohérents et bien utilisés (backdrops opaques, empilement) — RAS.
- **Confiance** : probable (usage exact non tracé exhaustivement).

---

## TABLEAU 1 — INVENTAIRE DU ROUGE (livrable principal)

Convention : « vrai risque blessure ? » = le principe directeur (rouge = blessure imminente uniquement).

| # | Occurrence | fichier:ligne | Condition d'affichage | Vrai risque blessure ? | Verdict |
|---|---|---|---|---|---|
| 1 | e1RM du lift en couleur rouge (deadlift) | app.js:9348,9410 | perfCard, deadlift = 3e lift | Non (c'est un lift) | **→ neutre** (couleur lift hors rouge) |
| 2 | `🔴 Perte musculaire suspectée` | engine.js:4191 | SRS bon mais perfs ↓ | Non (compo) | **→ orange** |
| 3 | `⚠️ Perte trop rapide` (danger) | engine.js:4181 | perte hebdo > seuil cut | Non (nutrition) | **→ orange** |
| 4 | Ratio S/B « danger » 🚨 rouge | engine.js:2799 | S/B < 0.85 | Non (structure force) | **→ orange** |
| 5 | Ratio S/D « danger » 🚨 rouge | engine.js:2819 | S/D < 0.65 ou > 1.25 | Non (structure force) | **→ orange** |
| 6 | Ratio Row/Bench « danger » | engine.js:2838 | R/B < 0.65 | **Oui (épaules)** | **Garder rouge** |
| 7 | Score de forme < 40 rouge | app.js:8363,15977 | formScore < 40 | Non (état composite) | **→ orange** |
| 8 | Barres composantes < 30 rouge | app.js:15997 | pct composante < 30 | Non (info) | **→ orange/neutre** |
| 9 | « Surcharge » Potentiel/SRS < 40 | app.js:18897 | SRS < 40 | Non (readiness) | **→ orange** |
| 10 | Jauge readiness < 40 rouge | app.js:8505,19813 | score < 40 | Non (readiness) | **→ orange** |
| 11 | Readiness faible bandeau rouge | app.js:1009 | readiness < 40 | Non (info du jour) | **→ orange** |
| 12 | Volume `> MRV` rouge | app.js:15560 | sets ≥ MRV (7j) | Marginal (overreaching) | **→ orange** (rouge si ≫ MRV) |
| 13 | Heatmap fatigue ≥85 rouge | app.js:9112 | fatigue muscle ≥ 85 | Non (thermal) | **→ teinte chaude non-rouge** [VOULU?] |
| 14 | `🔴 Surcharge` ACWR>1.6 | app.js:16018 | ratio ATL/CTL > 1.6 | **Oui-ish (ACWR)** | **Garder** (vérifier arbitre) |
| 15 | `🔴 Activité très intense hier` | app.js:23760 | activité score haut J-1 | Non (load mgmt) | **→ orange** |
| 16 | Point 🔴 notif non-lue | app.js:20345 | notif non lue | Non (indicateur) | **→ neutre** (ou garder, conv.) |
| 17 | Prot < 1.8 g/kg surligné rouge | app.js:15477 | ppk < 1.8 | Non (nutrition) | **→ orange** |
| 18 | `🔴 Charge critique / récup active` | coach.js:828,847 | kill-switch SRS/ACWR | **Oui (blessure)** | **Garder rouge** |
| 19 | Score douleur/soreness 🔴 | app.js:796,905 | score > 3 | **Oui (douleur)** | **Garder rouge** |
| 20 | `🔴 Charge axiale remplacée` | app.js:25091 | Squat RPE>9 < 48h | **Oui (prévention)** | **Garder rouge** |
| 21 | Onboarding « Douleur » niveau 2 | index.html:433,2238 | déclaration douleur | **Oui (douleur)** | **Garder rouge** |
| 22 | RHR danger ×0.80 | engine.js:3080-3083 | RHR danger (Garmin) | **Oui (santé)** | **Garder rouge** |
| 23 | Boutons destructifs (Supprimer/Reset/✕/Zone Danger/Déconnexion/Bloquer) | app.js:1542,1664,10269,14208,16595,18344,18386,30296… ; index.html:3082-3097 | actions destructives | N/A (convention) | **Garder rouge** (norme UI) |
| 24 | `❌ Format non reconnu` / erreurs import | app.js:10353,17886 ; import.js:318 | erreur/échec | N/A (erreur) | **Garder rouge** |

**Synthèse** : ~10 rouges à sortir (compo, ratios structure, scores bas, load mgmt) ; ~8 rouges légitimes (douleur, RHR, kill-switch, prévention axiale, destructif/erreur). Le cas connu « volume insuffisant (Fessiers/Mollets/Trapèzes) » est **déjà en orange** (app.js:15565) — **corrigé**, pas de régression.

---

## TABLEAU 2 — FUITES e1RM (livrable clé)

Règle : e1RM (`maxRM`, `.e1rm`, `currentE1RM`) = coulisse uniquement. Affichable → seulement `bestPR` (vraie barre) ou `repRecords`.

| Nombre affiché | fichier:ligne | Source | Fuite ? |
|---|---|---|---|
| Chiffre principal du lift (« 157 kg ») | app.js:9410 | **e1RM** (`kl.e1rm`, NON labellisé, couleur lift) | **🔴 FUITE (P0)** |
| Ratio `×X.XX bw` | app.js:9405 | **e1RM** (`kl.e1rm / bw`) | **🔴 FUITE** |
| Barres du chart Performance | app.js:9425 | **e1RM** (dataset `e1rms`) | **🔴 FUITE (partielle, labellisée légende ?)** |
| « e1RM XXXkg · N séries » (import) | import.js:1285 | **e1RM** (labellisé « e1RM ») | 🟠 Labellisé — §7 strict = fuite / Philo B = toléré |
| « vs dernière : XXXkg ↑ +Ykg » | import.js:1290 | **e1RM** (`prevE1RM`, labellisé) | 🟠 Idem (comparaison inter-séances) |
| « Potentiel {objectif}kg intact » | engine.js:5639 | **e1RM** (`maxHistoricE1rm` ≥ obj·0.95) | 🟠 Message piloté e1RM (faux-positif doux) |
| Momentum « Bench +2kg/sem » | app.js:15459,20436 | **e1RM** (pente registre) | 🟠 Taux dérivé e1RM affiché (borderline) |
| « e1RM estimé : XXX kg » (Records) | app.js:11271 | **e1RM** (labellisé « estimé », 8px, sous bestPR) | 🟢 **Pattern de référence** (Philo B respectée) |
| « e1RM: XXXkg » (correction records) | app.js:18340 | e1RM (non-SBD) / **bestPR** (SBD) mais labellisé « e1RM » | 🟠 Conflation label (P2) |
| Chiffre principal SBD « 145 kg » | app.js:11263 | **bestPR** (vraie barre) | 🟢 OK |
| « Objectif 160 kg atteint 🏆 » | app.js:20005-20006 | **bestPR** (`pr[t] >= targets[t]`) | 🟢 OK (garde anti-e1RM explicite 20029-20036) |
| « stable autour de 145 kg » | app.js:20050 | **bestPR** (`_dw(pr[t])`) | 🟢 OK (= fix du bug « 169 kg ») |
| Progression % vers objectif | app.js:11256 | **bestPR** (`pr / obj`) | 🟢 OK |
| Records SBD (Stats) | app.js:18307-18311 | **bestPR** | 🟢 OK (source vraie barre) |

**Conclusion e1RM** : **une seule vraie fuite non-labellisée = `renderPerfCard` (app.js:9410, P0)**. Le reste des surfaces respecte soit bestPR, soit la « Philosophie B » (e1RM labellisé). La divergence CLAUDE.md §7 (« jamais ») vs Philosophie B (« si labellisé ») doit être tranchée (voir P1).

---

## Angles morts de cet audit

- **Rendu visuel réel non observé** (READ-ONLY, pas de device) : contrastes exacts, débordements horizontaux, chevauchements avec la tab-bar, lisibilité effective des 6px → à valider sur Android Chrome.
- **Chart.js** : couleurs/labels des datasets (e1RM vs réel vs cible) dans perfCard mode « bars/curve » lus dans le code mais pas rendus — la légende peut ou non labelliser « e1RM ».
- **index.html (312 KB)** : j'ai ciblé `:root`, overlays, z-index, bannières et zones citées ; je n'ai pas lu ligne à ligne les ~4000 lignes de CSS/markup — d'autres rouges inline mineurs possibles.
- **Couverture des 161 polices <11px** : échantillonnées, non toutes cataloguées.
- **Modes non-SBD** (`bien_etre`, calisthenics) : surfaces d'affichage seulement effleurées.

## Hors-domaine (signalé, non investigué)

- `buildE1rmHistory` (engine.js:5662-5664) et `renderPerfCard` (app.js:9355) utilisent des regex maison / `matchExoName` au lieu de `getSBDType` → « Soulevé de Terre Roumain » (RDL) capté comme deadlift, « Squat Bulgare » comme squat (angle mort matching, CLAUDE.md §9). → domaine **matching/lifts**.
- Calibration des seuils `STRENGTH_RATIO_TARGETS`, MRV, ACWR 1.6 : domaine **diagnostic/seuils**.
- `real1rm` dérivé de `s.reps===1` (app.js:9359) ignore `db.bestPR` → cohérence **données/records**.
- Écriture orpheline `setItem('SBD_HUB')` (app.js:4388, CLAUDE.md §11) : domaine **persistance**.
- `getProgressionMessage`/`predictPR`/pente e1RM (fiabilité) : domaine **algorithmes/projections**.

## À VÉRIFIER CÔTÉ SUPABASE

Aucune requête indispensable pour cet audit (tout est côté rendu client). Deux confirmations utiles si un doute subsiste :

1. **Sur données réelles (aurel_br, `6e2936e7-…`)** : dans `sbd_profiles.data`, comparer `bestPR` (squat 145 / bench 140 / deadlift 170) au max `data.exercises[].maxRM` — pour **chiffrer l'écart** que `renderPerfCard` afficherait (ex. squat e1RM ~157 vs barre 145 = +12 kg trompeurs). Requête : lire `data.bestPR` et `MAX(maxRM)` par lift.
2. **`data.readiness`/`readinessHistory`** : confirmer la distribution des scores <40 (fréquence du rouge « Surcharge/À améliorer ») pour prioriser le dé-rougissement des jauges (findings P3).

---

STOP. Audit affichage-couleur terminé. Rapport : audit/04-affichage-couleur.md. Aucune modification, aucun commit.
