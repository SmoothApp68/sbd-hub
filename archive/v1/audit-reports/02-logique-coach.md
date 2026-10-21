# AUDIT 02 — Logique & Cohérence du Coach

## Blocages rencontrés

- Le skill `audit-systematique` **était bien disponible** (injecté via SDK, `.claude/skills/audit-systematique/`), contrairement à ce qu'annonçait mon prompt de lancement (« absent, ignore-le »). Vérification filesystem initiale négative (`ls .claude/skills/` → absent) car il n'est pas sur le disque mais fourni par le harness. Je l'ai chargé : format et taxonomie de sévérité respectés ci-dessous. Aucune conséquence sur le fond.
- Note de divergence CLAUDE.md/skill : le skill annonce `CACHE_NAME = trainhub-v349`, CLAUDE.md dit `v350`. Hors domaine, non investigué.
- READ-ONLY respecté : `git status` propre, **un seul fichier écrit** : ce rapport.

## Résumé exécutif

L'arbitre d'intensité (`computeIntensityVerdict` app.js:18637 / `collectIntensityContext` app.js:18827) est **pur, bien conçu et correctement consommé** par la surface principale du Coach (`renderCoachTodayHTML`, onglet `s-coach`) : momentum, cycle, return-to-play, back-off et deload consomment tous le verdict. **Mais l'invariante « arbitre = seule voix » est violée par au moins 5 émetteurs concurrents** rangés hors du bloc arbitre : le **Diagnostic Athlétique** (engine.js) émet son propre push/deload, la **carte Volume** prescrit un deload, l'**Auto-Tuner** coupe des séries, `getActivityRecommendation` impose repos/légèreté, et **toute une surface parallèle orpheline** (`coachGetFullAnalysis`, onglet `tab-ai`) rejoue un coach complet (deload, charges à X %, survolume→deload) sans jamais passer par l'arbitre. **13 findings** : 4×P0 (2 contradictions verdict + 2 écritures au render), 1×P1, 4×P2, 3×P3, 1×P4. Le point le plus grave : le Diagnostic peut afficher « vise un PR » pendant que le Point du jour affiche « décharge cette semaine » (contradiction reproductible profil de référence).

---

## Findings

### [P0] Le Diagnostic Athlétique émet un verdict d'intensité concurrent (push/deload) qui contredit l'arbitre

- **Où** : `engine.js:2953-2966` (fonction `analyzeAthleteProfile`, rendue dans la carte « Diagnostic Athlétique » app.js:19667-19692, priorité 3.2)
- **Code** :
  ```js
  if (acwr > _acwrZ.orange_high) {
    fatigueAlerts.push({ severity: 'danger', title: 'Charge élevée — récupération à prioriser',
      text: '...Réduis le volume de 30 % pour rester dans la zone de progression.' });
  } else if (acwr > _acwrZ.green_high) { ...warning... }
  } else if (acwr >= _acwrZ.green_low && acwr <= _acwrZ.green_high) {
    fatigueAlerts.push({ severity: 'good', title: '✅ Fenêtre optimale',
      text: '...c\'est le moment idéal pour viser un PR ou pousser un peu.' });
  }
  ```
- **Problème** : cette section rejoue un verdict d'intensité complet (**pousse / réduis 30 %**) à partir du **seul ACWR**, avec des seuils (`ACWR_ZONES`, engine.js:122 : green_high 1.30/1.50, orange_high 1.50/1.80) **différents** des bornes de l'arbitre (`INTENSITY_ACWR_BOUNDS` app.js:18615 : classique [1.3,1.5], agressif [1.4,1.6]) et **sans** aucun des crans de sécurité de l'arbitre (douleur, blessure, return-to-play, deload calendaire, check-in). Contradiction reproductible : un utilisateur avance dont le verdict = `deload` **calendaire** (cran 4 : > 6 semaines sans deload) alors que son ACWR courant est en zone verte (≤ 1.30) verra **simultanément** « 🔋 Décharge cette semaine » (Point du jour) **et** « ✅ Fenêtre optimale — c'est le moment idéal pour viser un PR » (Diagnostic). Idem deload `data-driven` (mauvais check-in) + ACWR vert. C'est exactement le bug « va chercher du lourd + repose-toi » déjà signalé comme réel.
- **Devrait** : la section Fatigue du Diagnostic doit **consommer le verdict** (comme momentum/cycle/back-off) ou être réduite à un **constat factuel non prescriptif** (« ACWR 1.10 ») sans « vise un PR » / « réduis 30 % ». L'arbitre reste seul à porter push/deload.
- **Confiance** : certain (contradiction dérivée du code, seuils et crans lus ligne à ligne).

### [P0] Écriture au render — `generateWeeklyReport` déclenché uniquement par le render du Coach (lundi)

- **Où** : `app.js:18475` (dans `renderCoachTab`) → `app.js:20384/20504` (`generateWeeklyReport` → `upsertReport`) → `app.js:20381` (`saveDBNow`)
- **Code** :
  ```js
  function renderCoachTab() {
    if (new Date().getDay() === 1) generateWeeklyReport(); // ← unique appelant
    ...
  }
  // upsertReport():
  db.reports.push({ id: generateId(), type, ..., created_at: Date.now(), ... });
  saveDBNow();
  ```
- **Problème** : `generateWeeklyReport` n'a **qu'un seul appelant** (vérifié par grep : app.js:18475), le render du Coach. Ouvrir l'onglet Coach un lundi **écrit** `db.reports` et persiste (`saveDBNow`). L'invariante « render pur — db identique après deux renders » est violée au premier render du lundi (le 2ᵉ render est idempotent via le guard `weekKey` 20386, mais le 1ᵉ mute). Le codebase a **déjà** appliqué le bon correctif ailleurs : la SOURCE 0 de `wpDetectPhase` a été « DÉPLACÉE au boot (initDeloadDetection)… écrire ici violerait render pur » (commentaire app.js:23412-23415). Même traitement attendu ici.
- **Devrait** : générer le rapport hebdo depuis un hook **boot / post-save de séance**, pas depuis `renderCoachTab`. Le render ne fait que lire/afficher.
- **Confiance** : certain.
- **[VOULU?]** : la génération paresseuse est probablement un choix de commodité, mais elle contredit une invariante explicite du projet — à traiter comme dette, pas comme design acquis.

### [P0] Écriture au render — `blockStartDate` muté + `saveDB` dans `wpDetectPhase`, atteignable depuis le render du Coach

- **Où** : `app.js:23460-23464` (et garde futur 23419-23423), `wpDetectPhase`, atteint via `analyzeAthleteProfile` (engine.js:2788) → carte Diagnostic (app.js:19667)
- **Code** :
  ```js
  if (_inferTs232 < Infinity && (_bsdMissing232 || _bsdTooRecent232)) {
    _cbBSD = _inferTs232;
    cb.blockStartDate = _cbBSD;
    if (typeof saveDB === 'function') saveDB();   // ← écriture pendant un render
  }
  ```
- **Problème** : c'est la dette connue « `blockStartDate` muté au render (préexistant v230) » de CLAUDE.md, ici **confirmée dans le chemin de render du Coach** (le Diagnostic appelle `wpDetectPhase`, qui ré-infère `blockStartDate` et `saveDB` quand la date est **absente ou désynchronisée** — cas réel après sync cross-device, que la référence aurel_br utilise). Le commentaire 23414 reconnaît que « wpDetectPhase est appelé depuis des renders… écrire ici violerait render pur », mais deux écritures y subsistent (23422 garde futur, 23463 ré-inférence). Déclenchement **conditionnel** (pas à chaque render), donc moins fréquent que le rapport hebdo, mais viole l'invariante quand il tire.
- **Devrait** : la ré-inférence/reset de `blockStartDate` doit vivre au boot (à côté de `initDeloadDetection`), pas dans une fonction appelée au render.
- **Confiance** : certain (le code écrit ; fréquence = quand `blockStartDate` manquant/désync).
- **[VOULU?]** : garde défensive tolérée (dette documentée), mais reste une violation.

### [P0] La carte Volume prescrit un deload hors arbitre (contradiction avec « push »)

- **Où** : `app.js:20156-20161` (carte Volume unique, priorité 3.1) ; jumeau tab-ai `coach.js:157`
- **Code** :
  ```js
  if (volReport.over && volReport.over.length > 0) {
    _voHtml += '...<strong>Survolume :</strong> ' + volReport.over.map(...).join(', ')
      + ' au-dessus du MRV — réduis ou planifie un deload</div>';
  }
  ```
- **Problème** : « réduis ou planifie un deload » est un **verdict de décharge** émis dès qu'**un seul** muscle dépasse le MRV sur 7 j (`coachAnalyzeWeeklyVolume`), **indépendamment de l'arbitre**. Un utilisateur dont le Point du jour dit « 🚀 va chercher du lourd » (verdict push, ACWR sain) et qui a un groupe au-dessus du MRV verra « planifie un deload » juste en dessous. Contradiction de direction sur la même surface. (Le survivant « volume MRV étiqueté /sem » a été purgé côté fenêtre/étiquette, mais **la prescription de deload est restée**.)
- **Devrait** : la carte Volume affiche le **constat** (« Pecs 22 sets, au-dessus du MRV ») ; la décision deload/décharge appartient à l'arbitre. Retirer « réduis ou planifie un deload ».
- **Confiance** : certain.

### [P1] Surface parallèle orpheline `coachGetFullAnalysis` (onglet `tab-ai`) — un second Coach complet hors arbitre

- **Où** : `coach.js:67-285` (`coachGetFullAnalysis`), rendu par `renderCoachAlgoAI` (app.js:18405) dans `#coachAlgoContentAI` (index.html:2525). Atteignable via `showTab('tab-ai')` : hash direct `#tab-ai` (app.js:3782-3788) et restauration `lastTab.main==='tab-ai'` locale/cloud (app.js:3781, 3820).
- **Code** (extraits) :
  ```js
  if (deloadCheck.needed) formHtml += '⚠️ ' + getVocab('deload') + ' recommandé — '+deloadCheck.reason;   // coach.js:132
  recos.push({... 'Survolume détecté : ... — réduis le volume ou passe en deload.'});                    // coach.js:157
  recos.push({... "Aujourd'hui (...) : "+todayLabel + (readiness.multiplier<1 ? ' — charges à '+Math.round(readiness.multiplier*100)+'%':'')}); // coach.js:203
  ```
- **Problème** : c'est un **coach entier** (état de forme, deload recommandé, volume insuffisant→ajoute des séries, survolume→deload, **charges à X %**, alertes plateau) qui ne consulte **jamais** l'arbitre. Il vit sur `tab-ai`, **absent de la barre de navigation** (6 onglets index.html:3406-3411, aucun `tab-ai`), mais **reste atteignable** par deep-link `#tab-ai` et surtout par `lastTab` persisté/cloud pour un utilisateur historique (l'onglet a existé dans la nav de builds antérieurs). Il produit des verdicts qui **contredisent** la surface `s-coach` (deload là où l'arbitre dit push, charges à X % que l'arbitre ne prescrit jamais).
- **Devrait** : retirer la surface `tab-ai` (recommandé — non branchée à la nav) **ou** faire consommer l'arbitre par `coachGetFullAnalysis`. Ne pas laisser deux coachs concurrents.
- **Confiance** : certain (surface live via hash/persistance) ; **probable** que peu d'utilisateurs y atterrissent aujourd'hui (d'où P1 et non P0).
- **[VOULU?]** : le décrochage de la nav suggère une mise à la retraite **inachevée** — la fonction et son point d'entrée n'ont pas été supprimés.

### [P2] `renderAutoTunerCard` — verdict de volume concurrent (« Surcharge → −1 série »)

- **Où** : `coach.js:531-606` (carte poussée priorité 3.6, app.js:19698)
- **Code** :
  ```js
  negative: { title: '⚠️ Surcharge [Muscle] détectée', text: '...tension articulaire. -1 série suggérée.' } // coach.js:552
  negative: { title: '⚠️ Alerte Insolvency — [Muscle]', text: '...On drop 1 série pour dissiper la fatigue...' } // coach.js:560
  ```
- **Problème** : suggère de **couper une série** sur signal de stress articulaire (`calcVolumeAutoTune`), hors arbitre. Passif (l'utilisateur valide), mais c'est un verdict de charge/volume émis en parallèle : peut coexister avec un Point du jour « push ».
- **Devrait** : soit brancher ces suggestions comme **entrée** de l'arbitre, soit assumer qu'il s'agit d'un réglage de volume à long terme distinct du verdict du jour et le formuler comme tel (pas « surcharge détectée » le jour où l'arbitre dit push).
- **Confiance** : certain (concurrent) / probable (impact utilisateur — dépend de la fréquence des suggestions).

### [P2] `getActivityRecommendation` — repos/légèreté imposés avec des seuils propres

- **Où** : `app.js:18997-19069` (rendu dans la carte « Activités », priorité 2.5, app.js:19520)
- **Code** :
  ```js
  if (acwr && acwr > 1.3) return { level:'warning', reason:'Charge hebdo élevée (ACWR '+acwr.toFixed(1)+')', detail:'...intensité légère seulement' };
  if (srsScore < 45)      return { level:'warning', reason:'Récupération insuffisante (SRS '+srsScore+')', detail:'...activité légère max' };
  ```
- **Problème** : prescrit **repos total / intensité légère / RPE ≤ 4** sur les activités secondaires avec des seuils **codés en dur** (ACWR > 1.3, SRS < 45) **incohérents** avec l'arbitre (agressif : maintain jusqu'à 1.6). Un utilisateur agressif à ACWR 1.35 lit « push » sur ses barres et « intensité légère seulement » sur son cardio le même jour, avec un seuil ACWR (1.3) que l'arbitre n'utilise pas. Domaine distinct (cross-training), mais voix d'intensité concurrente.
- **Devrait** : aligner sur les bornes/verdict de l'arbitre (ou au moins sur `getACWRZones` profil-dépendant) plutôt qu'un seuil fixe.
- **Confiance** : certain.

### [P2] Alertes `danger` du Diagnostic soumises au cap de cartes (peuvent passer sous « Voir plus »)

- **Où** : ordonnanceur `app.js:19415` (`COACH_CARD_CAP = 6`), `app.js:20189-20205` ; Diagnostic poussé à 3.2 (app.js:19692) ; alertes ratio danger `engine.js:2837-2841` (Row/Bench), `2798-2802` (S/B), `2818-2823` (S/D)
- **Code** :
  ```js
  var _sorted = _cards.slice().sort(function(a,b){ return a.pri-b.pri || a.seq-b.seq; });
  _sorted.slice(0, COACH_CARD_CAP).forEach(function(c){ html += c.html; });
  var _hidden = _sorted.slice(COACH_CARD_CAP); // → sous « Voir plus »
  ```
- **Problème** : les vrais items de sécurité (kill-switch, verdict, tendon danger, blessure, RTP, deload) sont en `html` **non capé** ✅. Mais les **alertes ratio de niveau `danger`** (ex. Row/Bench < 0.65 = « Risque d'instabilité des épaules », santé articulaire) ne vivent **que** dans la carte Diagnostic (3.2), **capable**. Avec 6 cartes de priorité ≤ 3.1 présentes (2.1 batterie + 2.2 budget + 2.5 activités + 2.5 interférence + 2.5 cycle/absence + 3.1 volume), le Diagnostic bascule sous « Voir plus » et l'alerte danger passe sous le pli. Aucune carte ne **disparaît** silencieusement (le bouton « Voir plus (N) » les compte), mais une alerte santé se retrouve masquée par défaut.
- **Devrait** : hisser les alertes Diagnostic de sévérité `danger` dans le flux non capé (comme le tendon tracker), ou leur donner une priorité < cap garantie.
- **Confiance** : probable (dépend du nombre de cartes concurrentes ce jour-là ; scénario atteignable pour un utilisateur actif multi-activités).

### [P3] Doublons de voix (redondance, pas contradiction)

- **Où** : momentum — carte verdict (reason app.js:18697 → affichée 19354) **+** carte P4 momentum (app.js:19621-19625) ; kill-switch — bannière (app.js:19442) **+** carte verdict source killswitch (app.js:18644). Joint danger — tendon tracker non capé (app.js:19611) **+** section « Santé Articulaire » du Diagnostic (engine.js:2936-2948).
- **Problème** : le même message (« X vrais PR — surfe dessus », « Mode Compétition », surcharge articulaire) s'affiche deux fois. Deux calculs de stress articulaire coexistent (`evaluateJointAlerts` app.js vs `getJointStressAlerts` engine.js) — cohérence à surveiller.
- **Devrait** : dédupliquer (le verdict porte déjà la voix ; la carte redondante peut disparaître).
- **Confiance** : certain (redondance) — impact cosmétique.

### [P3] Libellé « récupération active » hors arbitre dans le rapport hebdo

- **Où** : `coach.js:826-828` (`computeSRS` renvoie `forceActiveRecovery:true`, `label:'🔴 Charge critique — récupération active'`) ; affiché app.js:20463 (`if (srs.label) h += ' — ' + srs.label`)
- **Problème** : `computeSRS` (légitimement un score) attache un **libellé prescriptif** (« récupération active ») qui remonte dans le rapport hebdomadaire — une voix de récupération hors arbitre, sur une surface historique. Aligné en seuil avec l'arbitre agressif (ACWR > 1.6) mais pas pour prudent/classique.
- **Devrait** : `computeSRS` reste un score ; le libellé prescriptif ne devrait pas être affiché tel quel comme verdict.
- **Confiance** : probable.

### [P3] `AUTOTUNER_WORDING` référence « Insolvency » alors que l'index est gelé

- **Où** : `coach.js:551, 559, 560` (« Insolvency stable », « Alerte Insolvency »)
- **Problème** : `calcInsolvencyIndex` est explicitement **inerte** (coach.js:608-616 : « verdict Insolvency retiré »), mais l'Auto-Tuner affiche encore « Insolvency stable/critique » à l'utilisateur — vocabulaire d'une métrique morte, potentiellement trompeur.
- **Devrait** : reformuler sans « Insolvency ».
- **Confiance** : certain.

### [P4] Onglet `tab-ai` orphelin + `calcInsolvencyIndex` mort

- **Où** : `index.html:2520` (`tab-ai` sans entrée de nav) ; `coach.js:371-427` (`calcInsolvencyIndex` calculé mais non consommé — `analyzeAthleteProfileWithInsolvency` coach.js:614 délègue à `analyzeAthleteProfile` sans l'utiliser)
- **Problème** : dette invisible pour l'utilisateur — surface et fonction lourdes conservées, source de confusion et de findings ci-dessus (P1). Candidats à suppression franche.
- **Confiance** : certain.
- **[VOULU?]** : `calcInsolvencyIndex` « reste inerte (backlog : recalibration éventuelle → entrée de l'arbitre) » (coach.js:611) — rétention délibérée assumée.

---

## Liste exhaustive des prescriptions (message | fichier:ligne | déclencheur | passe par l'arbitre ?)

### Surface A — `renderCoachTodayHTML` / onglet `s-coach` (arbitre-gouvernée)

| Message | Fichier:ligne | Déclencheur | Arbitre ? |
|---|---|---|---|
| Point du jour (push/maintain/ease/deload) | app.js:19470 → 19321 | `computeIntensityVerdict(ctx)` | ✅ EST l'arbitre |
| Bannière Mode Compétition (charges fixes, récup max) | app.js:19442 | `db._killSwitchActive` | ✅ miroir cran 1 (doublon P3) |
| Return-to-play « recalibration » | app.js:19642-19648 | `_verdict.source==='returnToPlay'` | ✅ consomme verdict |
| Accueil reprise douce 8-14 j | app.js:19655-19660 | absence 8-14 j & verdict≠RTP/reprise | ✅ conditionné au verdict |
| Momentum « surfe dessus » | app.js:19619-19625 | `_verdict.direction==='push'` & PRs≥2 | ✅ consomme verdict |
| Cycle ovulatoire « tente un PR » | app.js:19725-19727 | `_verdict.direction==='push'` | ✅ conditionné au verdict |
| Deload « Décharge cette semaine » + bouton | app.js:19944-19952 | `_verdict.direction==='deload'` | ✅ consomme verdict |
| Back-off « Tenter le Bonus Set / +1 rep » | app.js:20222-20227 | `verdict.direction==='push'` | ✅ consomme verdict |
| Deadlift demain (info neutre) | app.js:19855-19857 | plan lendemain | ✅ neutralisé (voix = cran 5) |
| **Diagnostic : « réduis 30 % » / « vise un PR »** | **engine.js:2957, 2964** | **ACWR vs `ACWR_ZONES`** | **🔴 concurrent (P0)** |
| **Diagnostic : joint red « réduire le volume »** | **engine.js:2941** | **`getJointStressAlerts` red** | **🔴 concurrent (P2/P3)** |
| **Volume : « réduis ou planifie un deload »** | **app.js:20160** | **`volReport.over.length>0`** | **🔴 concurrent (P0)** |
| **Auto-Tuner : « Surcharge → −1 série »** | **coach.js:552, 560** | **`calcVolumeAutoTune` (joint red)** | **🔴 concurrent (P2)** |
| **Activités : « repos total / intensité légère / RPE ≤ 4 »** | **app.js:19040, 19048, 19052, 19060** | **killswitch / ACWR>1.3 / conflit / SRS<45** | **🔴 concurrent (P2)** |
| Nudge « on change un exercice ? » | app.js:19877-19879 | `detectSaisiePlateau()` (3 séances ⧗) | ⚪ nudge, pas un ban SBD (OK règle sacrée) |
| Corrections ratio (« +1 session Ischios », « −1 séance Bench → OHP », « +2 sets Leg Curl ») | engine.js:2852, 2862, 2921 | ratios déséquilibrés | ⚪ volume correctif ciblé, pas verdict d'intensité |

### Surface B — `coachGetFullAnalysis` / onglet `tab-ai` (orpheline, hors arbitre — P1)

| Message | Fichier:ligne | Déclencheur | Arbitre ? |
|---|---|---|---|
| « Deload recommandé — [reason] » | coach.js:132-134 | `shouldDeload().needed` | 🔴 concurrent |
| « Volume insuffisant — ajoute des séries » | coach.js:150-154 | `volReport.under` filtré plan | 🔴 concurrent (volume ↑) |
| « Survolume — réduis le volume ou passe en deload » | coach.js:157 | `volReport.over` | 🔴 concurrent |
| « charges à X % » | coach.js:203 | `readiness.multiplier < 1` | 🔴 concurrent (charge) |
| Alertes plateau + suggestions | coach.js:246-261 | `detectPlateau(type)` | 🔴 hors arbitre (correctif) |

### Surface C — Charge engine (hors domaine, signalé)

| Message | Fichier:ligne | Déclencheur | Note |
|---|---|---|---|
| `forceActiveRecovery` (kill switch cumulé) | app.js:23001-23003 | `_pen.cumulPenalty < 0.70` | Pilote les **charges** (CLAUDE.md §8.15), pas une carte ; `_applySideEffects()` flush `saveDB` → risque écriture au render du GO. Hors domaine. |

---

## Angles morts de cet audit

- **Fréquence réelle de déclenchement** des écritures au render (`blockStartDate` ré-inféré, rapport hebdo) : dépend de l'état `db` des vrais utilisateurs (blockStartDate manquant/désync, jour de la semaine). Non vérifiable sans la base.
- **`generateCompPeakingPlan.readinessAlert`** (app.js:19927-19929) : peut porter une voix d'intensité pré-compétition ; non déroulé en profondeur (domaine compétition/peaking).
- **`renderStalenessRotationCard`** (app.js:18448) : rotationne `db.weeklyPlan._pendingRotations` pendant le deload — je n'ai pas vérifié si un lift SBD peut y entrer (règle « SBD jamais banni »). À auditer côté génération de programme.
- **Deux calculs de stress articulaire** (`evaluateJointAlerts` app.js vs `getJointStressAlerts` engine.js) : cohérence des seuils/fenêtres non comparée ligne à ligne.
- Je n'ai pas exécuté `npm test` (READ-ONLY, et hors périmètre logique) — la table de vérité jest de l'arbitre n'a pas été relue.

## Hors-domaine (signalé, non investigué)

- `wpComputeWorkWeight` (app.js:23001-23004) : `forceActiveRecovery` + `_applySideEffects()` → `saveDB` potentiellement pendant le render du GO/plan (pipeline de charge — agent charges/engine).
- `app.js:4388` : `localStorage.setItem('SBD_HUB', …)` écriture orpheline hot-path XP (déjà noté CLAUDE.md ; agent DB-fields).
- Divergence `CACHE_NAME` v349 (skill) vs v350 (CLAUDE.md) — agent PWA/SW.
- `computeStrengthRatiosDetailed` / matching des lifts pour les ratios Diagnostic (angle mort `matchExoName` « Jambes Tendues ») — agent matching/records.

## À VÉRIFIER CÔTÉ SUPABASE

- **Combien d'utilisateurs ont `data.gamification.lastTab.main === 'tab-ai'`** (persisté local, mais aussi éventuellement dans le snapshot cloud `sbd_profiles.data`) ? Détermine si la surface orpheline `coachGetFullAnalysis` est encore vue par de vrais utilisateurs.
  Requête suggérée : `select count(*) from sbd_profiles where data->'gamification'->'lastTab'->>'main' = 'tab-ai';`
- **Pour aurel_br (`6e2936e7-…`) : `data.weeklyPlan.currentBlock.blockStartDate` est-il présent et cohérent** (pas dans le futur, pas > 3 j plus récent que le plus vieux log SBD de la fenêtre 14 j) ? Sinon le render du Coach ré-infère + `saveDB` (P0 écriture au render).
  Requête suggérée : `select data->'weeklyPlan'->'currentBlock'->>'blockStartDate' as bsd, data->'weeklyPlan'->>'lastDeloadDate' as ldd from sbd_profiles where user_id = '6e2936e7-de11-4f19-89b1-d1eb5968ba35';`
- **`data.weeklyPlan.lastDeloadDate` d'aurel_br** : présent ? Détermine si le cran 4 (deload calendaire, > 6 sem pour avancé) peut tirer et produire la contradiction P0 avec le Diagnostic « vise un PR » (ACWR ~1.26 en zone verte → « Fenêtre optimale »).
  Requête : incluse ci-dessus (`ldd`).
- **Distribution des `data.reports[].type='weekly'`** : y a-t-il des doublons/anomalies suggérant que la génération au render (lundi) tire plusieurs fois ? (Le guard `weekKey` devrait l'empêcher, mais à confirmer sur données réelles.)
  Requête suggérée : `select user_id, jsonb_array_length(data->'reports') from sbd_profiles where data ? 'reports' order by 2 desc limit 20;`

---

STOP. Audit logique-coach terminé. Rapport : audit/02-logique-coach.md. Aucune modification, aucun commit.
