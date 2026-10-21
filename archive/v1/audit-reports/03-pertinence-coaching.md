# AUDIT 03 — Pertinence Coaching

> Regard : **coach de force powerbuilding evidence-based** lisant ce que l'app *dit* à ses
> utilisateurs. Profil de référence jugé : H, 98 kg, 182 cm, 28 ans, **avancé**, powerbuilding,
> **recompo**, 6-7 séances/sem, ~20 séances/28j, volume ~75k/sem, **ACWR ~1.26 (sain)**,
> **coachingStyle=agressif**. PR vraies barres : squat **145** / bench **140** / deadlift **170**
> (S/B **1.04**). Deadlift **plat à 160×3** depuis des semaines, objectif 220.
> READ-ONLY. Branche `claude/agent09-profils-fixtures`, SW `trainhub-v350`.

## Blocages rencontrés

Aucun. Dépôt propre (`git status` vide), lecture seule intégrale, un seul fichier écrit
(`audit/03-pertinence-coaching.md`). Aucun accès Supabase tenté. Aucune modif applicative.
*(Note mineure : le skill mentionne `trainhub-v349` ; le code réel est `trainhub-v350` — skill
légèrement daté, sans impact sur l'audit.)*

## Résumé exécutif

L'app est, dans l'ensemble, **un bon coach** : l'arbitre d'intensité est bien calibré pour le profil
agressif (push jusqu'à ACWR 1.4), le deload est vendu comme une arme (« C'est de la programmation,
pas du repos »), la reprise/le churn sont empathiques, le plateau deadlift EST détecté et reçoit le
bon conseil (« varie l'intensité — séries lourdes 1-3 reps »), les supersets ne touchent jamais un
composé, et les SBD ne sont jamais bannis sur signal comportemental. **Mais** j'ai trouvé
**16 findings** : **1 P0-adjacent** (e1RM affiché comme record « Meilleur » sans disclaimer),
**5 P1** (seuils absurdes/faux pour ce profil), **6 P2** (contradictions entre surfaces), **4 P3**
(ton/jargon). Le point le plus important : **la carte Ratios de l'onglet Stats
(`computeStrengthRatios`) porte encore les anciennes bandes ultra-étroites** (bench/squat idéal
**[0.60,0.70]** → le profil à 0.97 lit « ⚠️ Trop haut ») **alors que l'onglet Coach a été recalibré**
→ deux surfaces se contredisent et condamnent structurellement un bencher-fort. C'est le pattern
central du projet, resté non-propagé à l'onglet Stats.

---

## Findings

### [P1] (P0-adjacent) e1RM affiché comme un chiffre-record à l'utilisateur (plusieurs surfaces)
- **Où** : `app.js:10018` (le pire), `app.js:9957`, `app.js:16845`, `app.js:9865`, `app.js:11271`, `app.js:16841`, `app.js:10026`
- **Code** :
  ```js
  // app.js:10018 (show1RM OFF) — un e1RM ESTIMÉ étiqueté « Meilleur »
  '<div>Meilleur : <strong>' + exo.maxRM + 'kg</strong></div>'
  // app.js:9957 (weight-type, dropdown Home) — headline « kg » sans aucun label e1RM
  mainVal = exo.maxRM || 0; mainUnit = '<span>kg</span>';
  // app.js:16845 (Stats › Records) — e1RM comme PR-headline quand aucune vraie barre loggée
  return { label: lift.maxRM + ' kg', icon:'🏋️', sub:'e1RM estimé' };
  ```
- **Problème** : `exo.maxRM` = e1RM Brzycki. CLAUDE.md §7 est catégorique : « e1RM = indicateur, JAMAIS
  un record. Ne l'affiche jamais comme un chiffre. » Pour le profil, le deadlift à 160×3 produit
  maxRM≈169 kg ; l'app l'affiche comme « Meilleur : 169 kg » alors que la **vraie** PR est 170 et que
  la barre du jour était 160. `app.js:10018` et `9957` n'ont **aucun** disclaimer (« Meilleur » /
  « kg » nus) → l'utilisateur lit une estimation comme son record. C'est exactement le bug cité
  CLAUDE.md §4 (« e1RM affiché au lieu du PR ») qui a déjà shippé. Un avancé qui voit « Meilleur :
  169 kg » alors qu'il a tiré 170 en compète perd immédiatement confiance.
- **Devrait** : n'afficher que la vraie barre (`db.bestPR` / `_exoMaxRealWeight`) comme record ; l'e1RM
  reste en coulisse (pente, projection). Si un indicateur est montré, toujours le libeller « e1RM
  estimé (tendance, pas un record) », jamais « Meilleur » / « kg » nu.
- **Confiance** : certain (affichage déterministe). *Ampleur réelle (quels exos passent par la branche
  sans-disclaimer) = data-dépendante → §Supabase.*
- **[VOULU?]** : non — contredit §7 frontalement. Recouvre l'audit références/hardcoded (signalé),
  mais c'est un problème de **vérité coaching**, donc dans mon périmètre.

### [P1] Onglet Stats — carte Ratios non recalibrée, bandes idéales absurdement étroites
- **Où** : `app.js:15618` `computeStrengthRatios` + `app.js:15586` `renderStrengthRatios` (rendu via
  `showStatsSub('stats-muscles')`, `app.js:15522` — **LIVE**)
- **Code** :
  ```js
  if (bench && squat)    ratios.bench_squat    = { value: bench/squat,    ideal:[0.60,0.70], label:'Bench / Squat' };
  if (squat && deadlift) ratios.squat_deadlift = { value: squat/deadlift, ideal:[0.80,0.85], label:'Squat / Deadlift' };
  if (ohp && bench)      ratios.ohp_bench      = { value: ohp/bench,      ideal:[0.60,0.65], label:'OHP / Bench' };
  // rendu : const alert = !inRange ? (val < lo ? '⚠️ Trop bas' : '⚠️ Trop haut') : '✅';  (15603)
  ```
- **Problème** : c'est un **second** système de ratios, distinct de l'arbitre (`STRENGTH_RATIO_TARGETS`
  recalibré, engine.js:43). Il a gardé les vieilles bandes :
  - **bench/squat idéal [0.60,0.70]** : le profil = 140/145 = **0.97** → **« ⚠️ Trop haut »** en
    permanence. Un bencher-fort powerbuilder est structurellement condamné ici.
  - **squat/deadlift [0.80,0.85]** : bande **large de 0.05** — quasi personne n'y tombe. Le profil
    (~0.84-0.85) oscille entre ✅ et « Trop haut » selon l'arrondi e1RM.
  - **ohp/bench [0.60,0.65]** : 0.05 de large aussi. → mur de « ⚠️ Trop bas/haut ».
  C'est le pattern central (seuil calibré pour un cas d'école, franchi en permanence par un assidu),
  **et** une contradiction directe : sur l'onglet Coach le même athlète lit « S/B 1.04 — rien
  d'alarmant » (voir P2 ci-dessous), sur l'onglet Stats il lit « Bench/Squat trop haut ».
- **Devrait** : une **seule** source de ratios (celle recalibrée de l'arbitre, engine.js:43), avec des
  bandes réalistes et le ROUGE réservé au danger. Supprimer `computeStrengthRatios` ou l'aligner sur
  `computeStrengthRatiosDetailed`.
- **Confiance** : certain (déterministe pour bench/squat 0.97 > 0.70). *Valeurs e1RM exactes → §Supabase.*
- **[VOULU?]** : non — divergence de calibration non propagée (le fix Coach n'a pas atteint Stats).

### [P1] Carte « Fatigue Systémique (SNC) — Repos complet recommandé » (seuil franchi en accumulation)
- **Où** : `engine.js:2977-2980` (dans `analyzeAthleteProfile`, rendu sur l'onglet Coach `app.js:19667`)
- **Code** :
  ```js
  if (acwr > 1.3 && grindData && grindData.grindCount > 2) {
    fatigueAlerts.push({ severity:'danger', title:'Fatigue Systémique (SNC)',
      text:'ACWR élevé + '+grindData.grindCount+' grind(s) détectés. '
        +'Le système nerveux central est en dette. Repos complet recommandé.' });
  ```
- **Problème** : ACWR > 1.3 **et** ≥ 3 sets marqués « grind » est un état **normal** en semaine
  d'accumulation pour un powerbuilder agressif. Or l'arbitre, pour ce profil, dit au même moment
  « pousse, tu as de la marge » (bounds agressif [1.4,1.6], `app.js:18618`). Donc la même page Coach
  affiche « push » (arbitre) **et** « SNC en dette, repos complet » (diagnostic) → contradiction +
  prescription de repos **hors arbitre** (viole l'invariante §9 « l'arbitre = SEULE voix du verdict
  d'intensité »). Le vocabulaire (« SNC en dette », « repos complet ») est en plus alarmiste : grinder
  3 triples lourds n'est pas une urgence médicale.
- **Devrait** : soit supprimer cette carte (l'arbitre gère déjà l'ACWR), soit la réduire à une note
  informative sans prescription (« charge nerveuse élevée cette semaine — surveille la vitesse de
  barre »), jamais « repos complet recommandé » qui court-circuite l'arbitre.
- **Confiance** : certain sur le code/seuils. Fréquence de déclenchement = data-dépendante (exige des
  sets flaggés `s.grind` dans `activeWorkout`) → probable pour ce profil en semaine dure. → §Supabase.
- **[VOULU?]** : peu probable — ressemble à un survivant de la purge des contradictions (§9), la même
  famille que « sur-atteinte → 3 jours de repos » déjà retiré.

### [P1] « risque blessure LCA » déclenché par un ratio de séries hebdo — alarme sur-médicalisée
- **Où** : `engine.js:2921-2926`
- **Code** :
  ```js
  if (isoQuadRatio !== null && isoQuadRatio < 0.75 && _quadSets >= 4) {
    bioAlerts.push({ severity:'warning', title:'Ischios/Quads faible ('+isoQuadRatio.toFixed(2)+' < 0.75)',
      text:'Ratio H:Q insuffisant — risque blessure LCA. Ajoute 2 sets de Leg Curl isolés cette semaine.' });
  ```
- **Problème** : un ratio **de séries** ischios/quads < 0.75 sur 7 jours n'est PAS un « risque de blessure
  LCA » (le ratio H:Q pertinent pour le LCA est un ratio de **force excentrique/concentrique**, pas un
  décompte de séries). Une semaine quad-dominante (jour squat + presse + hack) fait passer un
  powerbuilder sous 0.75 en permanence sans aucun risque ligamentaire. Annoncer une déchirure du LCA
  sur un décompte de séries est le pattern « chiffre peut-être juste, alarme sur-calibrée », version
  médicalisante.
- **Devrait** : reformuler en conseil d'équilibre non-médical (« Tes ischios sont un peu en retard cette
  semaine — 2 séries de leg curl resserreront l'équilibre »). Retirer « risque blessure LCA ».
- **Confiance** : certain sur le texte/seuil ; déclenchement pour ce profil = data-dépendant → §Supabase.
- **[VOULU?]** : non — overclaim médical, contraire au ton non-alarmiste voulu (§10).

### [P1] Plafonds de progression non scalés au niveau → l'avancé faussement « sur la bonne voie »
- **Où** : `engine.js:5611` `WP_MAX_WEEKLY_RATES = { squat:2.0, bench:1.0, deadlift:2.5 }` +
  `getProgressionMessage` (engine.js:5613, feed la carte Records Home `app.js:11215`)
- **Code** :
  ```js
  var allowedRate = WP_MAX_WEEKLY_RATES[liftType] || 1.5;   // kg/SEMAINE, identiques tous niveaux
  else if (requiredRateFromBest > allowedRate) { status='AMBITIOUS'; ... }
  else { status='ON_TRACK'; line1='Sur la bonne voie.'; }
  ```
- **Problème** : **2.5 kg/sem au deadlift = 130 kg/an** — un rythme de **débutant**, appliqué à
  **tous** les niveaux. Pour un avancé, le plafond réaliste est ~0.1-0.3 kg/sem. Résultat : dès que
  l'échéance est un peu longue, un objectif irréaliste passe en « ON_TRACK / Sur la bonne voie »
  au lieu d'être signalé « très ambitieux ». L'app rassure faussement l'avancé (pattern **inversé** :
  seuil trop *permissif*). *(La fenêtre de test par défaut = 35 j atténue partiellement, en poussant
  souvent vers AMBITIOUS/FATIGUE_MASKED.)*
- **Devrait** : scaler `WP_MAX_WEEKLY_RATES` par `db.user.level` (avancé ≈ 0.15-0.3 kg/sem deadlift),
  pour que « Sur la bonne voie » signifie quelque chose pour un avancé.
- **Confiance** : certain sur la constante non-scalée ; effet exact = data-dépendant (objectif/échéance)
  → §Supabase.
- **[VOULU?]** : possible côté produit (éviter de décourager), mais physiologiquement faux pour l'avancé.

### [P2] Deux systèmes de ratios de force → onglet Coach et onglet Stats se contredisent
- **Où** : `engine.js:2589` `computeStrengthRatiosDetailed` (Coach, bandes recalibrées) vs
  `app.js:15618` `computeStrengthRatios` (Stats, bandes anciennes — cf. P1 ci-dessus)
- **Problème** : même donnée sous-jacente (e1RM squat/bench/dead), deux orientations et deux jeux de
  bandes. Coach : squat/bench idéal [1.10,1.35], danger 0.85 → à 1.04 « Quadriceps en retard, rien
  d'alarmant » (warning doux). Stats : bench/squat idéal [0.60,0.70] → à 0.97 « ⚠️ Trop haut ». Idem
  row/bench (Coach [0.80,1.00] vs Stats [0.90,1.00]) et squat/dead (Coach [0.75,1.05] vs Stats
  [0.80,0.85]). L'utilisateur reçoit deux verdicts opposés selon l'onglet.
- **Devrait** : une source unique.
- **Confiance** : certain.
- **[VOULU?]** : non.

### [P2] Le ratio Squat/Bench diagnostic alerte dès 1.10 → « Quadriceps en retard » permanent
- **Où** : `engine.js:44` (`alert:1.10`) + `engine.js:2803-2807`
- **Code** :
  ```js
  } else if (sb < tSB.alert) {   // tSB.alert = 1.10
    bioAlerts.push({ severity:'warning', title:'Quadriceps en retard sur le pressing',
      text:'S/B = '+sb.toFixed(2)+' (cible > '+tSB.ideal[0]+'). Rien d\'alarmant — un peu plus de '
        +'variantes quadriceps-dominantes (High Bar, Hack Squat, Front Squat) resserrera l\'équilibre.' });
  ```
- **Problème** : le profil (S/B 1.04-1.06 en e1RM) est **structurellement** sous 1.10 → warning affiché
  à **chaque** ouverture du Coach, à vie. Le seuil danger a bien été descendu à 0.85 (bien), mais la
  borne basse de la zone idéale (1.10) reste au-dessus du profil d'un bencher-fort. Le ton est mesuré
  (« rien d'alarmant »), donc c'est un P2 et non P1 — mais c'est le pattern « alarme permanente pour
  un athlète normal ».
- **Devrait** : soit une borne basse plus tolérante pour un profil pressing-dominant (assouplissement
  morpho, backlog §17.2), soit dégrader cette carte en « info » plutôt que « warning » quand
  0.95 ≤ S/B < 1.10.
- **Confiance** : certain (déterministe). *Valeur e1RM exacte → §Supabase.*
- **[VOULU?]** : partiellement — la douceur du texte est voulue ; la permanence de l'alerte ne l'est
  probablement pas.

### [P2] Trois calculs Push/Pull différents (fenêtres et seuils incohérents)
- **Où** : (1) `engine.js:2888-2901` diagnostic, 30j, alerte >1.2, zone 0.8-1.2 ; (2)
  `program.js:170` `analyzeMuscleBalance`, 14j, alerte **>1.4** — **live** dans `coachGetFullAnalysis`
  (coach.js:161) ; (3) `app.js:15640` Stats, idéal **[0.80,1.10]**
- **Problème** : trois fenêtres (30j/14j/7j), trois seuils (1.2/1.4/1.10). Un powerbuilder pressing-
  dominant peut franchir 1.2 (diagnostic → « Tu pousses plus que tu ne tires ») sans franchir 1.4
  (balance → rien) → messages incohérents selon la surface. CLAUDE.md §10 signale déjà la divergence
  Stats [0.80,1.10].
- **Devrait** : un seul calcul Push/Pull (une fenêtre, un seuil), réutilisé partout.
- **Confiance** : certain (code) ; déclenchement pour ce profil = data-dépendant.
- **[VOULU?]** : non.

### [P2] Arbitre agressif (push jusqu'à 1.4) vs zones ACWR diagnostic (vigilance dès 1.30)
- **Où** : arbitre `app.js:18618` (`agressif:[1.4,1.6]`) vs `engine.js:2960-2962` (`getACWRZones`
  non-hybride, `green_high=1.30` → « Charge soutenue — vigilance utile »)
- **Problème** : sur la même page Coach, entre ACWR 1.30 et 1.40, l'arbitre dit « pousse/maintiens »
  tandis que la section Fatigue du diagnostic passe en « vigilance ». Signal mixte pour le profil
  agressif (dont l'ACWR 1.26 est déjà proche de 1.30). L'arbitre a été calibré par profil, pas les
  zones ACWR du diagnostic.
- **Devrait** : les zones du diagnostic devraient hériter du profil de coaching (comme l'arbitre), ou
  la section Fatigue devrait déléguer le verdict d'intensité à l'arbitre.
- **Confiance** : probable.
- **[VOULU?]** : peu probable.

### [P2] Prescriptions de repos/récup hors arbitre (survivants de l'invariante §9)
- **Où** : `engine.js:2980` (SNC, cf. P1) ; `app.js:27751` « Effort total élevé — repos complet
  recommandé » ; `app.js:22669` « Ton cœur bat vite ce matin — journée de récupération active
  recommandée » ; `app.js:17897` « FC repos +X bpm — repos complet recommandé » ; `engine.js:3084`
  Garmin danger « séance de récupération active ou un jour de repos complet »
- **Problème** : §9 pose que l'arbitre est la **seule** voix du verdict d'intensité. Ces cartes émettent
  des prescriptions de repos/récup en parallèle. Les cartes FC/RHR sont adossées à un signal santé réel
  (jour d'import Garmin) et donc plus défendables, mais elles restent des voix concurrentes qui peuvent
  co-afficher un « repos complet » pendant que l'arbitre dit « pousse ».
- **Devrait** : router ces signaux **en entrée** de l'arbitre (comme pain/injury le sont déjà), pas en
  cartes-verdict autonomes.
- **Confiance** : certain que les textes existent ; co-firing avec l'arbitre à confirmer sur device.
- **[VOULU?]** : les RHR/Garmin peut-être ; le SNC non.

### [P2] AutoTuner : le texte décrit un mécanisme « Insolvency » gelé (donc faux)
- **Où** : `coach.js:551-552`, `coach.js:559-560` (`renderAutoTunerCard`, live via `renderCoachTodayHTML`
  `app.js:19698`)
- **Code** :
  ```js
  positive: { title:'📈 Volume [Muscle] optimal', text:'Insolvency stable, tonnage en hausse. +1 série suggérée.' },
  negative: { title:'⚠️ Surcharge [Muscle] détectée', text:'Insolvency critique, tension articulaire. -1 série suggérée.' }
  ```
- **Problème** : l'Insolvency Index est **gelé/inerte** (coach.js:612 : « calcInsolvencyIndex reste
  inerte ») ; `calcVolumeAutoTune` s'appuie désormais sur les alertes de stress articulaire, pas sur
  l'Insolvency. Le texte affiche donc un mécanisme qui ne tourne plus (« Insolvency stable/critique »)
  → **faux** et jargon financier anglais non traduit devant un powerbuilder français.
- **Devrait** : reformuler sur le vrai signal (« Articulation récupérée, tonnage en hausse — +1 série »
  / « Charge articulaire élevée — -1 série d'accessoire »). Bannir le mot « Insolvency » de l'UI.
- **Confiance** : certain.
- **[VOULU?]** : non — texte non nettoyé après le gel de l'Insolvency.

### [P3] « Progression Anormalement Lente » : titre alarmiste qui se contredit lui-même
- **Où** : `engine.js:3040-3047`
- **Code** :
  ```js
  if (monthlyRate < rateTarget.alert) {   // avancé : alert = 0.002 (0.2%/mois)
    nutrAlerts.push({ severity:'warning', title:'Progression Anormalement Lente',
      text:'Progression e1RM Squat : X%/mois (attendu > 1.0% pour niveau avance). '
        + (level==='debutant' ? 'Vérifier technique et alimentation.' : 'Normal si en deload ou recompo strict.') });
  ```
- **Problème** : pour un avancé **en recompo** (exactement le profil), une progression ~0 % est la
  norme, pas une anomalie. Le titre « Anormalement Lente » (severity warning) est démenti par sa propre
  dernière phrase « Normal si en deload ou recompo strict ». Une carte qui dit « anormal » puis
  « normal » sape la crédibilité. En plus, la section ne regarde que le **squat** — le vrai sujet
  (deadlift plat) n'y est pas.
- **Devrait** : pour recompo/deload, dégrader en « info » et retitrer (« Progression sur pause — normal
  en recompo »). Ne pas qualifier d'« anormal » ce que le corps du message reconnaît comme normal.
- **Confiance** : certain (texte) ; déclenchement = data-dépendant (tendance squat).
- **[VOULU?]** : le hedge est voulu ; la contradiction titre/corps non.

### [P3] Labels volume « > MRV — risque surentraînement / surmenage » (alarmiste pour un assidu à MRV)
- **Où** : `program.js:133`, `app.js:15560`, `app.js:15567` (renderVolumeLandmarks) ; `coach.js:157`
  « Survolume détecté … réduis le volume ou passe en deload »
- **Problème** : atteindre son MRV **est le but** d'une semaine de pic de volume pour un powerbuilder.
  Le libeller « risque surentraînement » / « surmenage » (rouge) dramatise un état recherché. La
  fenêtre est correcte (7j, fix v340), donc c'est du **ton**, pas un bug d'unité — mais le rouge
  devrait rester au danger. « réduis le volume ou passe en deload » (coach.js:157) est aussi une
  prescription de deload hors arbitre (cf. P2).
- **Devrait** : « À MRV — semaine de pic, planifie ta décharge ensuite » en orange, pas rouge/« risque ».
- **Confiance** : certain.
- **[VOULU?]** : partiellement (le seuil MRV est juste ; le mot « risque » est le problème).

### [P3] Gamification : quêtes/statuts incitent l'intensité/fréquence pendant les semaines de récup
- **Où** : quêtes `app.js:4791` (« Charges lourdes : 5 séries à +85% e1RM »), `app.js:4807` (« Mois de
  force : 15 séries à +90% e1RM »), `app.js:4784` (« Machine de guerre : N jours d'affilée ») ; statuts
  `app.js:4241` (« Roi du Volume : TRIMP hebdo > 800 »), `app.js:4220` (« Guerrier de la semaine : 4/sem »)
- **Problème** : ces quêtes récompensent XP pour pousser l'intensité, le volume et les jours consécutifs,
  **sans gate** sur le verdict de l'arbitre. La semaine où l'arbitre dit « ease/deload », la quête
  « 15 séries à +90% » reste affichée comme opportunité XP → l'incitation gamifiée tire à l'opposé de
  la consigne de récupération. De plus, les statuts « Guerrier de la semaine » / « Roi du Volume » se
  **grisent** pendant un deload volontaire → la récup est subtilement cadrée comme une perte, contre la
  philosophie « le deload est une arme, pas une punition ».
- **Devrait** : neutraliser/masquer les quêtes d'intensité pendant un verdict ease/deload ; ne pas
  griser les statuts d'assiduité sur une semaine de deload planifiée.
- **Confiance** : probable (les quêtes sont randomisées ; le pull est réel mais intermittent).
- **[VOULU?]** : oui — la gamification est délibérément séparée du coaching. À arbitrer (Gemini/Aurélien).

### [P3] Ton : petits crochets marketing dans les nudges (mineur, probablement voulu)
- **Où** : `app.js:27607` « Tu nous as manqué ! » (churn ≥30j) ; `app.js:27618` « Ton dernier record au
  bench : X kg — il t'attend toujours. » ; `checkDisciplinePercentile` `app.js:15188-15192` « top 5%
  mondial 🏅 » (≥14 séances/mois) ; `app.js:15072` « Reprend là où… » (devrait être « Reprends »)
- **Problème** : globalement la copie de réengagement est **exemplaire** (« C'est tout à fait normal
  d'avoir des pauses », « pas besoin d'être au max »). Restent : une légère culpabilisation
  anthropomorphe (« Tu nous as manqué »), un hook FOMO (« il t'attend toujours »), une claim non
  substantiée (« top 5% mondial » sans données mondiales réelles), et une coquille (« Reprend »).
- **Devrait** : garder l'empathie ; adoucir « il t'attend toujours » ; qualifier « top 5% » (« estimé »)
  ou le retirer ; corriger la coquille.
- **Confiance** : certain.
- **[VOULU?]** : oui pour les hooks (choix growth) — signalé, non bloquant.

---

## 🔴 TABLEAU DES SEUILS (le cœur de la mission)

| Seuil | Fichier:ligne | Valeur | Déclenche | Un powerbuilder assidu le franchit-il **en permanence** ? | Verdict |
|---|---|---|---|---|---|
| bench/squat idéal (Stats) | app.js:15634 | [0.60,0.70] | « ⚠️ Trop haut » | **OUI** — profil 0.97, tout bencher-fort | 🔴 Absurde (P1) |
| squat/deadlift idéal (Stats) | app.js:15633 | [0.80,0.85] | « Trop bas/haut » | **OUI** — bande de 0.05, quasi tous | 🔴 Absurde (P1) |
| ohp/bench idéal (Stats) | app.js:15635 | [0.60,0.65] | « Trop bas/haut » | **OUI** — bande de 0.05 | 🔴 Absurde (P1) |
| SNC : ACWR>1.3 + grinds>2 | engine.js:2977 | 1.3 / 3 grinds | « Repos complet recommandé » | **OUI** en accumulation | 🔴 Absurde + contradiction (P1) |
| Ischios/Quads | engine.js:2921 | < 0.75 | « risque blessure LCA » | Souvent (semaine quad-dominante) | 🟠 Alarme sur-médicalisée (P1) |
| squat/bench alert (Coach) | engine.js:44 | 1.10 | « Quadriceps en retard » | **OUI** — profil 1.04 | 🟠 Permanent, ton doux (P2) |
| ACWR green_high (diagnostic) | engine.js:2960 | 1.30 | « vigilance » vs arbitre push→1.4 | Franchi en accumulation | 🟠 Incohérent/profil (P2) |
| Push/Pull (diagnostic) | engine.js:2891 | > 1.2 | « Tu pousses plus que tu tires » | Possible (pressing-dominant) | 🟠 3 seuils rivaux (P2) |
| Plafond progression | engine.js:5611 | 2.5 kg/sem dead | « Sur la bonne voie » (faux) | N/A (trop *permissif*) | 🟠 Pattern inversé (P1) |
| Volume « over » MRV | program.js:133 | ≥ MRV (7j) | « risque surentraînement » | OUI en pic de volume | 🟡 Ton alarmiste, fenêtre OK (P3) |
| Progression lente (avancé) | engine.js:3040 | < 0.2%/mois | « Anormalement Lente » | OUI en recompo | 🟡 Titre contradictoire (P3) |
| Récup musculaire volMult | app.js:15398 | vol>10 → ×1.3 | « demain X pas récupéré » | Possible (jour composé lourd) | 🟡 Peut sur-avertir (à surveiller) |

### Seuils vérifiés CORRECTS (ne pas régresser)
- Stress articulaire orange **130** / rouge **180** (engine.js:3564) — recalibré, bon.
- Volume spike détection **+20 %** / danger **+30 %** (engine.js:4678,2995) — bon.
- S/B danger **0.85** (engine.js:44) — recalibré depuis 1.10, bon.
- Alertes Volume MRV/MAV **retirées du diagnostic** (bug d'unité 30j→hebdo corrigé, engine.js:2968).
- Arbitre bounds par profil (agressif [1.4,1.6]) — bien calibré : à ACWR 1.26 → « pousse » (juste).

---

## ✅ CE QUI EST BIEN FAIT (un coach honnête le dit)

- **Arbitre d'intensité** (`computeIntensityVerdict`, app.js:18637) : pyramide de priorité propre,
  bien calibrée par profil ; pour l'agressif à ACWR 1.26 → « Charge saine — tu as de la marge ». Juste.
- **Deload vendu comme une arme** : « La fatigue accumulée masque ta force réelle — une semaine légère
  et tu repars au-dessus. **C'est de la programmation, pas du repos.** » (app.js:19357). Excellent.
- **Plateau deadlift correctement adressé** : `predictPR` renvoie « Pas de progression détectée » pour
  un lift plat (seuil bruit 0.05 kg/sem bien pensé, app.js:9286), → « Deadlift **stable autour de
  170kg — varie l'intensité (séries lourdes 1-3 reps ou nouveau schéma) pour relancer** » (app.js:20050).
  C'est **exactement** le bon conseil, et il utilise la **vraie** PR (170), pas l'e1RM (169). Bravo.
- **« Objectif atteint 🏆 » gaté sur la vraie barre** (`pr[t] >= targets[t]`, app.js:20005), avec un
  garde-fou explicite contre un e1RM gonflé (Cas 1, app.js:20029-20036). Respecte §7.
- **Jamais « tu régresses »** : commentaires explicites (app.js:20026, 20049), remplacé par du neutre.
- **Supersets jamais sur un composé** (`NEVER_SUPERSET`, app.js:23858 + `isPrimary`). Règle sacrée OK.
- **SBD jamais bannis sur signal comportemental** : seuls les accessoires sautent en jour d'activité
  lourde ; le kill-switch (<70% pénalités cumulées) est une soupape de fatigue extrême, pas un ban.
- **Reprise/return-to-play graduée** (-8/-15/-18% à 7/10/14j) + copie churn empathique.
- **Consécutifs** : « répartis tes séances avec des jours de repos entre les gros lifts » (app.js:26324)
  — bon conseil de récup entre séances lourdes du même lift.
- **Cycle menstruel** : C_cycle sur le volume (pas la charge), et « tente un PR » gaté sur l'arbitre.

## CE QUI MANQUE (l'œil du coach)

1. **Le deadlift plat est bien signalé, mais le conseil est bicéphale.** La carte plateau du Coach Algo
   (coach.js:255-257) penche accessoires/hypertrophie (« Romanian DL · Renforcer la chaîne
   postérieure ») alors que la carte projection (app.js:20050) donne le vrai levier (« séries lourdes
   1-3 reps »). Pour un **avancé** à 160×3 (e1RM 169 ≈ PR 170), le besoin n°1 est un **bloc
   d'intensité/peaking**, pas plus de RDL. → harmoniser vers l'angle intensité, et **relever que ses
   séries de travail (160) sont SOUS sa PR (170)** — il ne s'entraîne pas assez près de son max pour
   convertir.
2. **Aucune projection réaliste vers 220.** L'écart « −50 kg » est affiché, mais rien ne dit que
   +50 kg deadlift pour un avancé est un projet **pluriannuel**. Pire, le plafond 2.5 kg/sem (P1) peut
   afficher « Sur la bonne voie ». Il manque un « à ton niveau, +50 kg = ~2-4 ans de travail structuré ».
3. **Pas de deload programmé proactif signalé.** Le deload calendaire existe (arbitre cran 4), mais
   pour un athlète qui accumule sans jamais décharger, l'app attend le seuil `maxWeeks` (6 pour avancé)
   au lieu de proposer un mésocycle avec deload intégré d'emblée.
4. **Déséquilibre S/B non actionné utilement.** Le vrai signal du profil (squat en retard sur le bench,
   S/B 1.04) est noyé sous des cartes qui se contredisent (P1/P2) au lieu d'un plan clair : « ton squat
   est ton point faible SBD — 1 bloc squat-priorité (fréquence 2-3×, variantes high-bar/pause) ».
5. **Recompo : peu de guidage nutrition-force couplé.** La section Nutrition (engine.js:3009) est
   binaire (recompo confirmée / double stagnation) et squat-only ; pour un recompo avancé, un cadrage
   « force stable + composition qui bouge = succès » serait plus juste et rassurant.

---

## Angles morts de cet audit

- **Je suis aveugle aux données réelles.** Le déclenchement effectif de la plupart des cartes dépend
  des vraies valeurs (e1RM exacts, sets flaggés `grind`, splits, tendances). J'ai prouvé les **seuils
  et textes** (certain) ; la **fréquence de déclenchement pour aurel_br** est à confirmer sur device
  (§Supabase).
- **Structure des onglets non tracée exhaustivement** : j'ai confirmé que Coach (renderCoachTodayHTML)
  et Coach Algo (renderCoachAlgoAI/coachGetFullAnalysis) et Stats sont des surfaces distinctes toutes
  live, mais je n'ai pas cartographié chaque chemin de navigation.
- **Coach Algo double** (`coachGetFullAnalysis` coach.js:67 vs `generateCoachAlgoMessage` app.js:15405) :
  les deux existent et rendent selon la cible DOM ; recouvrement possible non entièrement démêlé.
- Modes non-powerbuilding (bien_être, powerlifting, calisthenics) survolés — jugés hors profil de réf.

## Hors-domaine (signalé, non investigué)

- Badges status dupliqués `consistency_month`/`status_consistency` gonflant les totaux (app.js:4209/4235) — dette (P4, agent références).
- Pas de toast de level-up malgré l'aide qui le promet (app.js:7113) — UX (P4).
- `computeStrengthRatios` (Stats) utilise `matchExoName` (angle mort « Jambes Tendues », engine.js:998) pour `row` — matching (agent références/matching).
- Écriture orpheline `setItem('SBD_HUB')` app.js:4388 (déjà connue CLAUDE.md).
- e1RM-as-number : recouvre l'audit références/hardcoded (mais jugé ici pour la vérité coaching, §7).
- Justesse numérique de `calcTDEE`/macros : domaine « calculs » (agent 01).

## À VÉRIFIER CÔTÉ SUPABASE (questions data précises)

1. **Ratios réels aurel_br** : quels sont les e1RM courants squat/bench/deadlift/ohp/row utilisés par
   `computeStrengthRatios` ? → confirme que l'onglet Stats affiche bien « Bench/Squat ⚠️ Trop haut » et
   « Squat/Deadlift Trop bas/haut » pour ce profil.
   *Requête suggérée : lire `sbd_profiles.data.exercises` + `bestPR`, recomputer les 5 ratios.*
2. **Carte SNC** : les séries de S/B/D d'aurel_br portent-elles des flags `grind=true` (≥3 dans une
   séance) et son ACWR dépasse-t-il 1.3 en semaine d'accumulation ? → fréquence réelle de « Repos
   complet recommandé ».
3. **Ischios/Quads** : sur 7 j, son ratio de séries ischio/quads tombe-t-il sous 0.75 avec quadSets≥4 ?
   → fréquence de l'alerte « risque blessure LCA ».
4. **e1RM affiché** : pour ses exos deadlift/squat/bench, `maxRM` (e1RM) diffère-t-il de la vraie barre
   max ? De combien ? → mesure l'écart affiché (« Meilleur : 169 » vs vraie 170).
5. **Objectifs (`data.targets`)** : quels objectifs SBD sont fixés (deadlift 220 ?) et quelle échéance ?
   → détermine si `getProgressionMessage` affiche ON_TRACK/AMBITIOUS/FATIGUE_MASKED pour lui.
6. **coachingStyle** : confirmer `db.user.coachingStyle==='agressif'` (bounds arbitre [1.4,1.6]) — toute
   ma lecture de l'arbitre en dépend.

---

STOP. Audit pertinence-coaching terminé. Rapport : audit/03-pertinence-coaching.md. Aucune modification, aucun commit.
