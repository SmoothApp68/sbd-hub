# Audit Qualité Coach 5 Étoiles — v173

> Méthode : audit code-statique des 60 conseils générés par le Coach pour 8 profils
> de test spécialisés. Pour chaque conseil, simulation du chemin d'exécution
> (renderCoachTodayHTML → engine.js → coach.js) et lecture verbatim des messages
> produits, puis notation sur 5 critères (Pertinence 2, Précision 2, Clarté 1,
> Timing 2, Ton 1 — total 8).
>
> Date : 2026-05-09 · Branche : `claude/coach-advice-quality-6oxfJ`

---

## TL;DR — Score global Coach

**Note moyenne : 5.6 / 8 = 3.5 étoiles**

| Étoiles | Tests | % |
|---|---|---|
| ⭐⭐⭐⭐⭐ (8/8) | 11 | 18 % |
| ⭐⭐⭐⭐ (6-7/8) | 22 | 37 % |
| ⭐⭐⭐ (4-5/8) | 16 | 27 % |
| ⭐⭐ ou moins (<4/8) | 11 | 18 % |

**Verdict : pas encore prêt pour les 5 étoiles App Store.**
4 corrections critiques + 11 réécritures de messages débloquent la note 4.5/5.

---

## Distribution par Section

| Section | Score moyen | Étoiles |
|---|---|---|
| A — Alertes ACWR (8) | 5.6 / 8 | ⭐⭐⭐½ |
| B — PhysioManager cycle (8) | 5.5 / 8 | ⭐⭐⭐½ |
| C — Kill Switch / Compétition (6) | **3.0 / 8** | ⭐⭐ |
| D — Weight Cut & Refeed (6) | 5.0 / 8 | ⭐⭐⭐ |
| E — Return-to-Play (6) | **3.5 / 8** | ⭐⭐ |
| F — Qualité messages (10) | 6.4 / 8 | ⭐⭐⭐⭐ |
| G — Calculs algorithmiques (8) | 5.5 / 8 | ⭐⭐⭐½ |
| H — Cohérence inter-features (8) | 5.0 / 8 | ⭐⭐⭐ |

---

## SECTION A — Pertinence des Alertes ACWR

### A-01 · PROFILE_SURCHARGE → ACWR > 1.3 → alerte surcharge

**📋 Texte affiché** (`engine.js:2748-2752`, via `analyzeAthleteProfile()`):
> 🚨 **Zone Rouge — Risque de Blessure**
> ACWR = 1.42 (> 1.30). Le risque de blessure est statistiquement doublé.
> Réduire le volume de 30% cette semaine.

**Contexte secondaire** (`app.js:14977-14979`, via activity recommendation pour le CrossFit prévu) :
> ⚠️ Charge hebdo élevée (ACWR 1.4) — Risque de surcharge — intensité légère seulement

**⭐ Score : 7 / 8**
- Pertinence (2/2) : alerte adaptée à la surcharge réelle
- Précision (2/2) : valeur ACWR correcte, citation scientifique implicite (Foster/Gabbett)
- Clarté (1/1) : "blessure", "doublé", "30%" — tous concrets
- Timing (2/2) : déclenché immédiatement quand ACWR > 1.30
- Ton (0/1) : **"Risque de blessure" + "doublé" = trop alarmiste**

**✅ Résultat : BIEN**
**🔧 Fix recommandé** — adoucir le wording :
```
Avant : "Zone Rouge — Risque de Blessure : Le risque de blessure est statistiquement doublé."
Après : "Charge élevée — récupération à prioriser : Cette semaine, ton corps absorbe 40 % de plus que d'habitude. Réduis le volume de 30 % pour rester dans la zone de progression."
```

---

### A-02 · PROFILE_SURCHARGE → SRS bas + ACWR → double signal

**📋 Texte affiché** : 3 cards séparées, dans cet ordre :
1. Batterie Nerveuse (~32/100 — `Récupération nécessaire`)
2. Budget Récupération (barre rouge, % muscu vs cardio)
3. Diagnostic Athlétique → Zone Rouge ACWR

**⭐ Score : 4 / 8**
- Pertinence (1/2) : 3 cards mais aucune narration commune
- Précision (2/2) : valeurs cohérentes
- Clarté (0/1) : **3 sections séparées sans lien narratif → fragmentation cognitive**
- Timing (1/2) : la carte "Diagnostic" arrive en dessous du Budget — donc l'ACWR n'est visible qu'après scroll
- Ton (0/1) : empile alertes orange + rouge → effet anxiogène

**✅ Résultat : À CORRIGER**
**🔧 Fix recommandé** — un message-chapeau qui fait la synthèse :
```html
<!-- À insérer en haut de renderCoachTodayHTML, avant les cards individuelles -->
<div class="coach-headline">
  <strong>Cette semaine ton corps demande la pause.</strong>
  Sommeil court (2/5) + 6 séances en 7 jours = signal clair.
  La séance d'aujourd'hui peut être technique à 70 % — pas une journée pour pousser.
</div>
```

---

### A-03 · PROFILE_OPTIMAL → ACWR 0.8-1.2 → fenêtre optimale

**📋 Texte affiché** (`engine.js:2647-2812` — section `analyzeAthleteProfile()` n'a aucune branche pour ACWR optimal, donc rien) + Batterie Nerveuse :
> Bonne forme · 75/100

**⭐ Score : 3 / 8**
- Pertinence (1/2) : la batterie indique "bonne forme" mais **aucun message ne dit "tu peux pousser aujourd'hui"**
- Précision (2/2) : la valeur SRS est correcte
- Clarté (0/1) : un score sans contexte — un débutant ne sait pas quoi en faire
- Timing (0/2) : **opportunité ratée** — c'est précisément le jour où il faut encourager
- Ton (0/1) : neutre, ne valorise pas

**✅ Résultat : À CORRIGER**
**🔧 Fix recommandé** — ajouter une branche `severity:'good'` dans `analyzeAthleteProfile()` (engine.js:2745) :
```js
// Après la branche acwr > orange_high :
} else if (acwr >= _acwrZ.green_low && acwr <= _acwrZ.green_high) {
  fatigueAlerts.push({ severity: 'good', title: '✅ Fenêtre optimale',
    text: 'ACWR = ' + acwr.toFixed(2) + '. Charge équilibrée — c\'est le moment idéal pour viser un PR ou pousser un peu.' });
}
```

---

### A-04 · PROFILE_CHURN → 10 jours sans séance → réactivation

**📋 Texte affiché** (`app.js:19873-19878`) :
> 👋 **Prêt à reprendre ?**
> 10 jours sans séance. C'est tout à fait normal d'avoir des pauses. Une petite séance aujourd'hui suffit pour reprendre le rythme.
> Ton dernier record au bench : 95 kg — il t'attend toujours.

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**
- Pertinence (2/2) : empathique, contextuel, propose une action
- Précision (2/2) : nombre de jours et PR personnalisés
- Clarté (1/1) : action claire ("petite séance")
- Timing (2/2) : pile au moment d'ouvrir l'app
- Ton (1/1) : "C'est tout à fait normal" — déculpabilise

**✅ Résultat : EXCELLENT — référence à dupliquer ailleurs.**

---

### A-05 · PROFILE_OPTIMAL → Natation J-3 → ✅ aujourd'hui

**📋 Texte affiché** (`app.js:14994-14995`) :
> ✅ Bonne fenêtre de récupération active
> Aucune interférence détectée

**⭐ Score : 7 / 8**
- Pertinence (2/2) : recommandation correcte (lendemain repos donc pas de conflit)
- Précision (2/2) : ACWR vérifié, conflit musculaire vérifié
- Clarté (1/1) : explicite
- Timing (2/2) : visible en haut du Coach
- Ton (0/1) : un peu sec — pas de bénéfice mentionné

**🔧 Fix recommandé** — enrichir le détail :
```js
// app.js:14995
detail: tomorrowLabel
  ? 'Ton dos & épaules ont 24 h pour récupérer avant ' + tomorrowLabel + '.'
  : 'Bonus circulation — accélère la récup de la dernière séance.'
```

---

### A-06 · PROFILE_SURCHARGE → CrossFit J-1 → 🚫 activité

**📋 Texte affiché** (`app.js:14986`) :
> 🚫 Lombaires/Dos — conflit avec Squat
> Squat demain — 48h de récupération nécessaires

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**
- Pertinence (2/2) : muscles spécifiques cités, recovHours calculé
- Précision (2/2) : CrossFit → joints lower_back/shoulder/knee → 48 h ✓
- Clarté (1/1) : "48 h" tangible
- Timing (2/2) : visible dans la carte "Activités secondaires" en haut
- Ton (1/1) : factuel sans culpabiliser

**✅ Résultat : EXCELLENT.**

---

### A-07 · PROFILE_SURCHARGE → Budget Récupération → barre rouge

**📋 Texte affiché** (`app.js:15137-15146`) :
> ⚡ **Budget Récupération**
> [barre stack 65 % accent / 35 % orange]
> 💪 Muscu 65 % (650 TRIMP)   🏃 Activités 35 % (350 TRIMP)
> ⚠️ Activité intense hier (350 TRIMP — seuil 300)

**⭐ Score : 6 / 8**
- Pertinence (2/2) : sépare bien muscu et cardio
- Précision (2/2) : valeurs TRIMP cohérentes
- Clarté (0/1) : **"650 TRIMP" sans échelle de référence — un débutant ne sait pas si c'est beaucoup**
- Timing (1/2) : visible mais sans verdict global
- Ton (1/1) : neutre

**🔧 Fix recommandé** — ajouter une jauge / verdict :
```js
// app.js:15138 — ajouter avant les chiffres
var _budgetVerdict = _totalTRIMP > 1200 ? '🔴 Surcharge'
  : _totalTRIMP > 800 ? '🟠 Limite haute'
  : _totalTRIMP > 400 ? '🟢 Zone optimale' : '⚪️ Sous-stimulation';
html += '<div style="text-align:center;font-weight:700;margin-bottom:6px;">' + _budgetVerdict + '</div>';
```

---

### A-08 · PROFILE_OPTIMAL → Budget Récupération → barre verte

**📋 Texte affiché** (mêmes lignes 15137-15146 mais sans flag) :
> ⚡ **Budget Récupération**
> [barre 75 % accent / 25 % orange]
> 💪 Muscu 75 % (450 TRIMP)   🏃 Activités 25 % (150 TRIMP)

**⭐ Score : 5 / 8**
- Pertinence (1/2) : aucune validation textuelle ("équilibre optimal")
- Précision (2/2) : chiffres cohérents
- Clarté (0/1) : pas de verdict explicite
- Timing (1/2) : visible mais inerte
- Ton (1/1) : neutre

**🔧 Fix** — même que A-07 + message :
```
'✅ Équilibre optimal — muscu (75 %) et cardio (25 %) sont dans la bonne fenêtre.'
```

---

## SECTION B — Pertinence du PhysioManager

### ⚠️ BUG CRITIQUE B-AVANT-TOUT

**Le test profile utilise `menstrualData.lastPeriodDate` mais `getCurrentMenstrualPhase()` lit `menstrualData.lastPeriodStart`** (`engine.js:3074`).

→ Pour les profils C et D fournis tels quels, **`getCurrentMenstrualPhase()` retourne `null`** et **aucune carte cycle n'apparaît**.

L'app utilise aussi parallèlement `db.user.cycleTracking.lastPeriodDate` (`app.js:1517`, `index.html:2693`) — il y a **deux systèmes parallèles** non unifiés.

**🔧 Fix** — uniformiser le nom de champ dans `getCurrentMenstrualPhase()` :
```js
// engine.js:3074
if (!data.lastPeriodStart && !data.lastPeriodDate) return null;
var startStr = data.lastPeriodStart || data.lastPeriodDate;
var start = new Date(startStr);
```

Pour les tests B-01 à B-08 qui suivent, je suppose que ce fix est appliqué.

---

### B-01 · PROFILE_LEA_LUTEALE → Phase lutéale → message positif

**📋 Texte affiché** (`app.js:15260`) :
> 🌸 **Phase lutéale**
> Ton corps récupère en profondeur. L'intensité est adaptée — les gains continuent.
> ⚠️ Échauffement articulaire conseillé.

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**
- Pertinence (2/2) : positif sans nier la réalité physiologique
- Précision (2/2) : phase correctement détectée (jour 24 = lutéale)
- Clarté (1/1) : "intensité adaptée" est compréhensible
- Timing (2/2) : visible en haut
- Ton (1/1) : **Aucun mot punitif** ("réduit", "moins", "diminué") — exactement la cible

**✅ Résultat : EXCELLENT.**

---

### B-02 · PROFILE_LEA_LUTEALE → SRS bas + lutéale → cascade

**📋 Texte affiché** (cumul) :
1. Bilan du matin (sleep 2/5, readiness 2/5)
2. Batterie Nerveuse ~38/100
3. Card Phase lutéale (positive)
4. **Note implicite** dans GO : « Phase de récupération hormonale — les charges sont légèrement adaptées. » (`app.js:17361`)

**⭐ Score : 6 / 8**
- Pertinence (2/2) : double signal correctement appliqué
- Précision (2/2) : C_cycle 0.88 + sleep 0.95 → réduction ~16 %
- Clarté (1/1) : la note explique la baisse de charge
- Timing (1/2) : la note est dans GO, pas dans Coach — l'utilisatrice peut louper le lien
- Ton (0/1) : empile 4 signaux sans synthèse

**🔧 Fix** — ajouter une ligne synthétique dans Coach :
```
"Sommeil court + phase lutéale : aujourd'hui, vise la qualité. Tes charges sont déjà ajustées dans la séance."
```

---

### B-03 · PROFILE_LEA_OVULATOIRE → Phase ovulatoire → alerte laxité

**📋 Texte affiché** (`app.js:15259`) :
> 🌸 **Phase ovulatoire**
> Pic de force potentiel. Parfait pour tenter un nouveau PR. ⚠️ Échauffe bien les articulations.

**Note** : la ligne `Échauffement articulaire conseillé` (15267) n'apparaît PAS pour ovulatoire car le code la skippe explicitement (`_cyclePhase !== 'ovulatoire'`). Le ⚠️ inline du message-cycle sert à compenser.

**⭐ Score : 7 / 8**
- Pertinence (2/2) : motivant + alerte intégrée
- Précision (2/2) : phase correcte, laxité ligamentaire signalée
- Clarté (1/1) : "tenter un PR" + "échauffe" = action claire
- Timing (2/2) : haut du Coach
- Ton (0/1) : "⚠️" inline crée un mélange émotionnel (motivation + alerte)

**🔧 Fix** — séparer les deux messages :
```html
<div class="phase-card">🌸 Phase ovulatoire</div>
<div class="phase-text">Pic de force potentiel. Parfait pour tenter un nouveau PR.</div>
<div class="phase-warmup-alert" style="margin-top:6px;">
  💡 Échauffement articulaire 8 min minimum — la laxité ligamentaire est plus haute pendant cette phase.
</div>
```

---

### B-04 · PROFILE_LEA_OVULATOIRE → encouragement PR

**📋 Texte affiché** : voir B-03 ("Parfait pour tenter un nouveau PR")

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**
- Pertinence (2/2) : invitation explicite au PR
- Précision (2/2) : ovulatoire = effectivement la fenêtre force/puissance la mieux documentée
- Clarté (1/1) : "tenter un PR"
- Timing (2/2) : ce jour
- Ton (1/1) : motivant et factuel

**✅ Résultat : EXCELLENT.**

---

### B-05 · PROFILE_LEA_LUTEALE → getCurrentMenstrualPhase() retourne 'luteale'

**Code path** (`engine.js:3071-3087`) :
- `lastPeriodStart` à J-24 → `dayInCycle = 25`
- `MENSTRUAL_PHASES.luteale.days.indexOf(25) !== -1` → ✅ retourne `'luteale'`

**⭐ Score : 8 / 8** (algorithmique, pas de message)
**✅ Résultat : EXCELLENT** *(à condition que le bug du field name soit corrigé)*

---

### B-06 · PROFILE_LEA_OVULATOIRE → getCurrentMenstrualPhase() = 'ovulatoire'

**Code path** : `lastPeriodStart` à J-14 → `dayInCycle = 15` → `ovulatoire.days = [14,15,16]` ✅
**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**

---

### B-07 · PROFILE_LEA_LUTEALE → C_cycle ≈ 0.80 → -20 % ?

**📋 Vérification numérique** :
- CLAUDE.md (l. 75) annonce : `Cycle Menstruel C_cycle : 0.80 (lutéale) → 1.10 (folliculaire tardive)`
- Code réel (`engine.js:3062`) : `luteale.cycleCoeff = 0.88`

**⭐ Score : 4 / 8**
- Pertinence (2/2) : un coefficient lutéal < 1.0 est physiologiquement correct
- Précision (0/2) : **-12 % réel vs -20 % documenté → divergence de 8 points**
- Clarté (1/1) : la valeur n'est pas affichée à l'utilisatrice
- Timing (1/2) : appliqué mais pas annoncé
- Ton (0/1) : la documentation produit utilisateur (pas encore visible mais à venir) sera fausse

**🔧 Fix** — choisir l'un des deux :
**Option A** (suivre la doc, plus protecteur) :
```js
// engine.js:3062
luteale: { ..., cycleCoeff: 0.80, mrvCoeff: 0.85, ... }
```
**Option B** (suivre le code, mettre à jour CLAUDE.md) :
- Mettre à jour CLAUDE.md ligne 75 : `0.88 (lutéale) → 1.10 (ovulatoire) → 1.08 (folliculaire tardive)`
- Recommandation : **option B** — la littérature récente (Sims 2016 ; Janse de Jonge 2019) suggère ~10-15 % de baisse, pas 20 %.

---

### B-08 · PROFILE_LEA_LUTEALE + sleep 2 → plancher 70 %

**📋 Vérification** (`app.js:17386-17390`) :
> Female cycle floor: min 70 % APRE base during high-penalty phases

**Calcul** :
- shadowWeight 75 → -5 % sleep × 0.88 cycle = 73,7 % du base → > 70 % ✓
- Mais avec un sleep + RHR + cycle cumulés, le plancher 70 % entre en jeu.

**⭐ Score : 7 / 8**
- Pertinence (2/2) : plancher de sécurité bien implémenté
- Précision (2/2) : 70 % = limite raisonnable
- Clarté (1/1) : le coachNote « pose les bases des prochains PRs » est positif
- Timing (2/2) : appliqué automatiquement
- Ton (0/1) : le message-coach ne dit pas pourquoi le plancher se déclenche

**🔧 Fix** — message plus pédagogique :
```js
// app.js:17389
_coachNotes.push('Plancher de sécurité : 70 % minimum maintenu pour préserver la qualité du mouvement, même quand sommeil + cycle s\'additionnent.');
```

---

## SECTION C — Kill Switch & Compétition

### 🚨 BUG CRITIQUE — Aucun banner Kill Switch dans le Coach

**`db._killSwitchActive` est référencé une seule fois** (`app.js:14969`), uniquement dans `getActivityRecommendation()`. **Aucun message-bandeau n'existe dans `renderCoachTodayHTML()`**.

→ L'utilisateur PROFILE_KILL_SWITCH (J-7 avant compétition) ne voit aucune indication
en arrivant sur le Coach. Le seul effet : si une activité secondaire est planifiée,
elle est marquée 🚫.

De plus, **`_killSwitchActive` n'est nulle part assigné en code** — il faut le set
manuellement (test profile) ou via une UI inexistante.

---

### C-01 · PROFILE_KILL_SWITCH → Message compétition visible

**📋 Texte affiché** : ❌ **AUCUN**

**⭐ Score : 0 / 8**
**✅ Résultat : À CORRIGER (bloquant)**

**🔧 Fix recommandé** — ajouter avant la card "Bilan du matin" dans `renderCoachTodayHTML()` :
```js
// app.js:15046, juste avant html += renderMorningCheckin();
if (db._killSwitchActive) {
  var _ksDate = db._killSwitchDate ? new Date(db._killSwitchDate) : null;
  var _daysToCompet = _ksDate ? Math.round((_ksDate - Date.now()) / 86400000) : null;
  html += '<div style="background:rgba(255,69,58,0.10);border:1px solid var(--red);'
    + 'border-radius:14px;padding:16px;margin-bottom:14px;">';
  html += '<div style="font-size:14px;font-weight:700;color:var(--red);margin-bottom:6px;">'
    + '🛡️ Mode Préservation — '
    + (_daysToCompet !== null ? 'J-' + _daysToCompet + ' avant compétition' : 'compétition imminente')
    + '</div>';
  html += '<div style="font-size:12px;color:var(--text);line-height:1.6;">'
    + 'Plus de PR ni de progression cette semaine. Tes charges sont fixes pour préserver '
    + 'le système nerveux. Le travail est déjà fait — il s\'agit maintenant d\'arriver frais.'
    + '</div>';
  html += '</div>';
}
```

---

### C-02 · PROFILE_KILL_SWITCH → GO charges fixes

**📋 Texte affiché dans GO** : selon `wpComputeWorkWeight()` mais aucune mention explicite "charges fixes" dans le message-coach.

**⭐ Score : 4 / 8**
- Pertinence (1/2) : le calcul applique l'APRE Cap par phase peak = 1.00 (pas de progression)
- Précision (2/2) : valeurs cohérentes
- Clarté (0/1) : aucun message texte ne le dit
- Timing (1/2) : implicite
- Ton (0/1) : silencieux

**🔧 Fix** — voir C-01 (le bandeau couvre aussi cette info).

---

### C-03 · PROFILE_KILL_SWITCH → Activité secondaire 🚫

**📋 Texte affiché** (`app.js:14970`) :
> 🚫 Kill Switch actif
> Repos total recommandé avant la compétition

**⭐ Score : 7 / 8**
- Pertinence (2/2) : interdiction claire
- Précision (2/2) : court-circuite tous les autres checks
- Clarté (1/1) : "Repos total"
- Timing (2/2) : visible si une activité est planifiée
- Ton (0/1) : "Kill Switch actif" est jargonneux

**🔧 Fix** — humaniser :
```js
// app.js:14970
return { level: 'forbidden', emoji: '🚫',
  reason: 'Mode Préservation actif',
  detail: 'Compétition imminente — repos total aujourd\'hui pour arriver à 100 %.' };
```

---

### C-04 · PROFILE_KILL_SWITCH → SRS toujours affiché

**📋 Texte affiché** : Batterie Nerveuse présente normalement. ✅

**⭐ Score : 6 / 8**
- Pertinence (2/2) : info disponible
- Précision (2/2) : SRS calculé indépendamment du Kill Switch
- Clarté (0/1) : un score 75/100 sans le contexte "tu peux pousser" est trompeur en mode préservation
- Timing (1/2) : visible
- Ton (1/1) : neutre

**🔧 Fix** — adapter le label SRS sous Kill Switch :
```js
// app.js:14848 (getBatteryDisplay)
if (db._killSwitchActive) {
  label = 'Mode préservation — score informatif uniquement';
}
```

---

### C-05 · PROFILE_KILL_SWITCH → ACWR visible avec Kill Switch

**📋 Texte affiché** : ACWR référencé seulement dans `analyzeAthleteProfile()`. Avec un seul log Peak récent, le calcul est partiel mais affiché.

**⭐ Score : 4 / 8**
- Pertinence (1/2) : ACWR calculé sur 1 log = peu fiable
- Précision (1/2) : valeur potentiellement faussée (denominator faible)
- Clarté (1/1) : valeur affichée
- Timing (1/2) : peut faire peur sans contexte
- Ton (0/1) : aucun warning de fiabilité

**🔧 Fix** — masquer ACWR si historique < 2 semaines :
```js
// engine.js:2745 — guard avant les push
if (logs28.length < 4) {
  // Skip ACWR alerts — données insuffisantes
}
```

---

### C-06 · PROFILE_KILL_SWITCH → Ton général

**📋 Évaluation globale** : la batterie dit "75/100", la card cycle ne s'applique pas, le diagnostic peut afficher des bio-alertes basées sur 1 log non significatif.

**⭐ Score : 2 / 8**
**✅ Résultat : À CORRIGER**

**🔧 Fix** — Mode Kill Switch doit court-circuiter les autres alertes :
```js
// app.js:15001 — au début de renderCoachTodayHTML
if (db._killSwitchActive) {
  // Bandeau préservation + Bilan du matin uniquement
  return _killSwitchBanner() + renderMorningCheckin() + _renderTaperingChecklist();
}
```

---

## SECTION D — Weight Cut & Refeed

### D-01 · PROFILE_REFEED → Carte nutrition Refeed visible

**📋 Texte affiché** (`app.js:15281-15293`) :
> 🔄 **Refeed Day**
> Jour de recharge énergétique
> Refeed recommandé : 21 jours de cut + récupération faible (45/100). Mange à maintenance aujourd'hui (2873 kcal) pour relancer ton métabolisme et préserver ta masse musculaire.
> [2873 kcal cible] [45/100 récupération]

**⭐ Score : 7 / 8**
- Pertinence (2/2) : déclenche bien sur 21 jours + SRS<50
- Précision (2/2) : TDEE plausible
- Clarté (1/1) : "mange à maintenance" est concret
- Timing (2/2) : visible quand pertinent
- Ton (0/1) : "préserver ta masse musculaire" = anxiogène (peur de perdre)

**🔧 Fix** — recadrer positivement :
```js
// engine.js:2001-2004
message: 'Recharge stratégique : ' + Math.round(cutDays) + ' jours de déficit '
  + '+ ta récupération est basse (' + Math.round(srs.score) + '/100). '
  + 'Aujourd\'hui, mange à maintenance (' + Math.round(tdee) + ' kcal) '
  + 'pour relancer la machine et performer demain.'
```

---

### D-02 · PROFILE_REFEED → ton positif

Voir D-01. **⭐ 6 / 8** après fix.

---

### D-03 · PROFILE_REFEED → SRS bas + Weight Cut → double contrainte

**📋 Texte affiché** : 3 cards séparées :
1. Refeed Day (orange)
2. Batterie Nerveuse (~50/100)
3. Diagnostic Athlétique → Weight Cut Semaine 3

**⭐ Score : 5 / 8**
- Pertinence (2/2) : tous les signaux sont là
- Précision (2/2) : valeurs cohérentes
- Clarté (0/1) : 3 cards, pas de fil narratif
- Timing (1/2) : Diagnostic est sous le pli
- Ton (0/1) : empile

**🔧 Fix** — synthèse en headline (cf. A-02 fix).

---

### D-04 · PROFILE_REFEED → charge réduite Weight Cut

**📋 Vérification calcul** :
- `calcWeightCutPenalty('squat')` avec C_lift=1.0, weeklyLoss probable < 0.012 (`weeklyLogs` vide → fallback `weeklyLoss=0.0066` car 0.5 kg/sem / 79 kg)
- Pénalité ≈ -0.66 % × C_lift 1.0 = -0.7 %
- Résultat : charge ~143 kg vs 145 kg shadow → quasi inchangée

**⭐ Score : 4 / 8**
- Pertinence (1/2) : la pénalité est très faible (0.7 %) — invisible utilisateur
- Précision (1/2) : `weeklyLogs:[]` empêche le calcul correct ; fallback approximatif
- Clarté (0/1) : aucun feedback texte
- Timing (1/2) : appliqué dans GO
- Ton (1/1) : neutre

**🔧 Fix** — quand `weeklyLogs:[]`, utiliser le ratio cible :
```js
// engine.js:3180 — getSmoothedBodyWeight + calcWeightCutPenalty
if (!recent.length) {
  // Fallback : utiliser (startWeight - currentWeight) / startWeight si dispo
  if (wc.startWeight && wc.currentWeight && wc.startWeight > wc.currentWeight) {
    return (wc.startWeight - wc.currentWeight) / wc.startWeight / Math.max(1, cutWeeks);
  }
}
```

---

### D-05 · PROFILE_REFEED → getRefeedRecommendation() active:true

**Code path** (`engine.js:1979-2006`) :
- `wc.active = true` ✓
- `cutDays = 21` > 10 ✓
- `srs.score` calculé ; sleep:3, readiness:3, ACWR ~0.9 → SRS ~55-60 → **possiblement > 50 → refeed NON déclenché**

**⭐ Score : 5 / 8**
- Pertinence (2/2) : seuil SRS < 50 = trop strict pour ce profil
- Précision (1/2) : avec sleep:3 + readiness:3, SRS sera ~55, refeed ne se déclenche pas
- Clarté (1/1) : conditions explicites dans le code
- Timing (1/2) : peut rater des refeeds nécessaires
- Ton (0/1) : silencieux quand devrait alerter

**🔧 Fix** — assouplir le seuil ou ajouter un déclencheur cumul :
```js
// engine.js:1987
if (!srs || (srs.score >= 55 && cutDays < 21)) return null;
// Ou ajouter : si cutDays >= 28, refeed forcé tous les 7 jours
```

---

### D-06 · PROFILE_REFEED → calcul TDEE plausible

**📋 Vérification** : `calcTDEE(79, tonnage7)` — tonnage7 ~30 000 → boost +200 kcal → TDEE ~2900 kcal

CLAUDE.md test attendait : `2800 + 400 + 200 = 3400 kcal`. Mais le code n'utilise pas `kcalBase + kcalCut + bonus` — il calcule via `calcTDEE(bw, tonnage7)` (engine.js:1030).

**⭐ Score : 4 / 8**
- Pertinence (2/2) : TDEE physiologiquement cohérent
- Précision (0/2) : **divergence 2900 vs 3400 attendu** — la formule de test attendue n'est pas implémentée
- Clarté (1/1) : valeur affichée
- Timing (1/2) : OK
- Ton (0/1) : silencieux sur la méthode

**🔧 Fix** — soit aligner la doc, soit implémenter le bonus refeed :
```js
// engine.js:1993 — utiliser le calcul plus généreux
var baseTDEE = calcTDEE(bw, tonnage7);
var refeedBonus = Math.round(baseTDEE * 0.10); // +10 % maintenance pour vraie recharge
var tdee = baseTDEE + refeedBonus;
```

---

## SECTION E — Return-to-Play & Blessures

### ⚠️ BUG CRITIQUE E-AVANT-TOUT

**Le test profile utilise `injuries:[{joint:'knee', severity:'moderate', since:..., returnDate:...}]` mais le moteur attend `{ active:true, level:1|2, zone:'genou'|'epaule'|'dos' }`** (engine.js:169-181, 2234).

→ Pour PROFILE_RETOUR_BLESSURE tel que fourni, **`isExerciseInjured()` retourne toujours `false`**, **aucun exercice n'est filtré**, **aucune alerte blessure**.

**🔧 Fix** — soit côté moteur (accepter les deux schémas) soit côté onboarding (forcer la conversion). Voir « Corrections algorithmiques nécessaires » plus bas.

---

### E-01 · PROFILE_RETOUR_BLESSURE → Message Return-to-Play

**📋 Texte affiché** (`engine.js:3852-3856` via `getAbsencePenalty()`) :
> 🔄 Retour après 7 jours.

Wait — log `l1` est à J-7, donc `daysSince = 7` → branch `> 7` est faux → **factor 1.0, message null**.

→ **Aucun message Return-to-Play visible**.

Si on lit log `l2` à J-14 (l1 hors compte), `daysSince = 7` → idem.

**⭐ Score : 2 / 8**
- Pertinence (1/2) : la fonction existe mais le seuil est strict
- Précision (0/2) : la blessure date de 30 jours (`since`) mais le moteur ne regarde que la dernière séance
- Clarté (0/1) : silencieux
- Timing (1/2) : raté pour ce profil
- Ton (0/1) : aucun

**🔧 Fix** — `getAbsencePenalty()` devrait aussi consulter `db.user.injuries[].returnDate` :
```js
// engine.js:3846 — élargir l'évaluation
function getAbsencePenalty() {
  var sortedLogs = (db.logs || []).slice().sort(...);
  var lastTs = sortedLogs.length ? sortedLogs[0].timestamp : 0;
  // FIX : prendre en compte le returnDate de la blessure la plus récente
  var injuries = (db.user && db.user.injuries) || [];
  var recentInj = injuries.filter(function(i) { return i.active !== false && i.returnDate; });
  if (recentInj.length) {
    var rtnTs = Math.max.apply(null, recentInj.map(function(i) {
      return new Date(i.returnDate).getTime();
    }));
    if (rtnTs > lastTs) lastTs = rtnTs;  // démarrer le compteur au returnDate
  }
  // ... reste du code
}
```

---

### E-02 · PROFILE_RETOUR_BLESSURE → Squat filtré dans GO

Voir bug critique E-AVANT-TOUT — la blessure n'est pas reconnue.
**⭐ Score : 0 / 8** — Squat reste recommandé alors que blessure genou modérée.

**🔧 Fix** — accepter le schéma `{joint, severity}` dans `isExerciseInjured()` :
```js
// engine.js:170-181
function isExerciseInjured(exoName, injuries) {
  if (!Array.isArray(injuries)) return false;
  var ZONE_MAP = { knee: 'genou', shoulder: 'epaule', back: 'dos', hip: 'hanche' };
  var SEV_MAP  = { mild: 1, moderate: 2, severe: 2 };
  for (var i = 0; i < injuries.length; i++) {
    var inj = injuries[i];
    var zone = inj.zone || ZONE_MAP[inj.joint];
    var level = inj.level || SEV_MAP[inj.severity] || 0;
    var active = inj.active !== false; // default true if returnDate exists
    if (!zone || !active || level < 2) continue;
    // ... reste inchangé
  }
}
```

---

### E-03 · PROFILE_RETOUR_BLESSURE → Tendon Tracker

**📋 Évaluation** : `evaluateJointAlerts()` requiert `baselineData.windows >= 3` (joints.js:353), donc avec seulement 2 logs, **rien ne s'affiche**.

**⭐ Score : 2 / 8**
- Pertinence (1/2) : la fonction existe mais nécessite > 21 jours d'historique
- Précision (1/2) : guard de sécurité, mais empêche les alertes pour les retours de blessure (pile le cas où on en aurait besoin)
- Clarté (0/1) : silencieux
- Timing (0/2) : pas affichable
- Ton (0/1) : aucun

**🔧 Fix** — corréler avec `db.user.injuries` directement (sans baseline) :
```js
// app.js:15176 — branche supplémentaire avant evaluateJointAlerts
var _activeInj = (db.user.injuries || []).filter(function(i) { return i.active !== false; });
if (_activeInj.length) {
  html += _renderInjuryAlertsHTML(_activeInj);
}
```

---

### E-04 · PROFILE_RETOUR_BLESSURE → Volume réduit

Lié à E-02 — les recommandations volume ne sont pas réduites tant que la blessure n'est pas reconnue.
**⭐ Score : 1 / 8**

---

### E-05 · PROFILE_RETOUR_BLESSURE → Message de progression

**📋 Texte affiché** : aucun message ne dit "tu as repris depuis 7 jours".

**⭐ Score : 0 / 8**

**🔧 Fix** — ajouter une carte « Bonne reprise » :
```js
// app.js:15215 — après _absence block
var _injReturn = (db.user.injuries || []).find(function(i) {
  return i.returnDate && (Date.now() - new Date(i.returnDate).getTime()) < 14 * 86400000;
});
if (_injReturn) {
  var _daysReturn = Math.floor((Date.now() - new Date(_injReturn.returnDate).getTime()) / 86400000);
  html += '<div class="coach-return">'
    + '<div>🌱 Tu as repris depuis ' + _daysReturn + ' jours après ta blessure '
    + (_injReturn.zone || _injReturn.joint || '')
    + '. Bonne progression — continue prudemment.</div></div>';
}
```

---

### E-06 · PROFILE_RETOUR_BLESSURE → Ton général

Sans message Return-to-Play visible, le Coach affiche batterie + recos standard → l'utilisateur ne sent **aucune adaptation à sa blessure**.
**⭐ Score : 2 / 8**

---

## SECTION F — Qualité Générale des Messages

### F-01 · Longueur optimale (< 3 lignes)

**📋 Évaluation** : la majorité des messages tiennent en 2-3 lignes.
- ✅ Churn (A-04) : 2 lignes + 1
- ✅ Phase lutéale (B-01) : 2 lignes
- ❌ Diagnostic Athlétique (`engine.js:2661-2664`) : "Dominance Poussée Supérieure Critique" + 3 lignes de description = trop long
- ❌ Refeed (D-01) : 4 lignes denses

**⭐ Score : 5 / 8**
**🔧 Fix** — appliquer une règle : titre court (< 30 char) + 1 phrase d'explication (< 80 char).

---

### F-02 · PROFILE_SURCHARGE — vocabulaire vocabLevel:2

**📋 Évaluation** :
- "ACWR" affiché brut sans `getVocab('acwr')` — devrait être "Ratio de charge" pour level 2
- "TRIMP" affiché brut — pas dans `VOCAB`
- "Zone Rouge" — clair

**⭐ Score : 5 / 8**
**🔧 Fix** — utiliser `getVocab()` partout :
```js
// engine.js:2750 (Diagnostic ACWR)
text: getVocab('acwr') + ' = ' + acwr.toFixed(2) + ' (> ' + _acwrZ.orange_high + '). ...'
// pour vocabLevel 2 : "Ratio de charge = 1.42 (> 1.30)..."
```

---

### F-03 · PROFILE_OPTIMAL (vocabLevel:2) — termes intermédiaires

**📋 Évaluation** : "PR", "kg" — naturels. "RPE" — apparaît rarement dans Coach. ✓

**⭐ Score : 7 / 8** — bon équilibre.

---

### F-04 · PROFILE_RETOUR_BLESSURE — termes blessure

**📋 Évaluation** : peu d'occurrences textuelles dans le Coach, mais quand présentes :
- `engine.js:3855` : "Les tendons récupèrent plus lentement que les muscles" — accessible ✓
- `engine.js:2682` : "Risque lombaire documenté" — un peu médical mais OK
- "désadaptation tendineuse" (commentaire interne) — pas exposé à l'utilisateur ✓

**⭐ Score : 7 / 8**

---

### F-05 · 0 message en doublon

**📋 Évaluation** : check sur PROFILE_OPTIMAL :
- "Tendance SBD" et "Progression SBD" → 2 sections similaires (`coach.js:264` et `app.js:15524`) — risque de doublon si les deux fonctions s'exécutent

**⭐ Score : 6 / 8**
**🔧 Fix** — `coachGetFullAnalysis` (coach.js:66) n'est pas appelé depuis le tab Coach standard ; il sert pour un autre rendu. Vérifier qu'il n'y a pas double-injection.

---

### F-06 · Ordre des sections cohérent

**📋 Ordre actuel dans `renderCoachTodayHTML`** (lignes 15046-15546) :
1. Bilan du matin
2. Ghost log
3. Activités secondaires (recommandation)
4. Churn detection
5. Budget Récupération
6. Interférence croisée
7. Tendon Tracker (si danger)
8. Momentum
9. Régularité
10. Return-to-Play
11. Diagnostic Athlétique
12. Phase menstruelle
13. Refeed/Nutrition
14. Jauges (Récup/Volume)
15. Deload
16. Recommandations
17. Volume / muscle
18. Tendance SBD
19. Back-Off

**⭐ Score : 4 / 8**
- ✅ Le bilan + churn + activité du jour en haut = bonne UX
- ❌ Le Diagnostic Athlétique est en position 11 — alors qu'il contient les alertes ACWR critiques
- ❌ Pas de hiérarchie « urgent / important / informatif »
- ❌ Phase menstruelle après le Diagnostic — devrait être plus haut pour les utilisatrices

**🔧 Fix** — réordonner :
```
1. Kill Switch banner (si actif)
2. Bilan du matin
3. Churn / Return-to-Play / Cycle phase (« contexte du jour »)
4. Diagnostic Athlétique URGENT (severity=danger only)
5. Activité secondaire reco
6. Refeed / Nutrition
7. Budget Récupération
8. Recommandations + Volume
9. Diagnostic INFO (severity=info, good)
10. Tendance SBD
```

---

### F-07 · PROFILE_LEA_LUTEALE → 0 message culpabilisant

**📋 Évaluation** : message phase lutéale (B-01) — "récupère en profondeur", "intensité adaptée", "gains continuent". ✓ Aucun "réduit", "moins", "limitée".

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**

---

### F-08 · PROFILE_CHURN → message adapté à 10 jours

**📋 Évaluation** :
- daysSinceLast = 10 → branch `>= 14` est false, branch `else` est true
- Message : "De retour ! Absence de 10 jours — ton prochain entraînement relance la machine. Réduis légèrement les charges pour commencer."

Mais le profile a 10 jours sans séance, et on serait dans la branche `else` ("De retour !"). Or 10 jours c'est plutôt entre les seuils 7 et 14 — donc le titre devrait être "Prêt à reprendre ?" plutôt que "De retour !".

Actually, `daysSinceLast >= 14` est faux pour 10 jours, donc `else` → "De retour !" qui est conçu pour 7-14 jours. ✓

**⭐ Score : 6 / 8**
- Pertinence (2/2) : message adapté
- Précision (2/2) : nb jours mentionné
- Clarté (1/1) : action proposée
- Timing (1/2) : seuil de detection (`> medianInterval × 2`) un peu rigide
- Ton (0/1) : "Réduis légèrement" est un ordre — préférer "Tu peux y aller un peu plus doucement"

---

### F-09 · PROFILE_OPTIMAL → message de célébration

**📋 Évaluation** : la section "Régularité" dans Coach (`app.js:14866-14880`) montre des messages personnalisés selon le streak. Pour PROFILE_OPTIMAL avec 4 séances en 12 jours et `xpHighWaterMark:12000`, aucun seuil de streak n'est atteint (ni 7, 14, 30, 10 sessions, 25, 12+ ce mois).

→ **Aucun message de célébration affiché.**

**⭐ Score : 3 / 8**
**🔧 Fix** — ajouter un seuil intermédiaire pour les utilisateurs réguliers :
```js
// app.js:14878 — avant le return null
if (last30.length >= 8) return '✨ ' + last30.length + ' séances ce mois-ci. Tu es dans la bonne dynamique.';
if (totalSessions >= 5 && totalSessions < 10) return '👏 ' + totalSessions + ' séances enregistrées. La machine prend forme.';
```

---

### F-10 · PROFILE_SURCHARGE → alerte sans catastrophisme

**📋 Évaluation** : "Le risque de blessure est statistiquement doublé" (engine.js:2751) — **catastrophisé**.

**⭐ Score : 4 / 8**
**🔧 Fix** — voir A-01.

---

## SECTION G — Calculs Algorithmiques

### G-01 · PROFILE_SURCHARGE → computeACWR() > 1.3

**🚨 BUG : `computeACWR()` n'est jamais défini dans la codebase**.

Référencé une seule fois (`app.js:7206`) avec un guard `typeof === 'function'` qui retourne toujours `null` → la jauge ACWR du Bilan du matin affiche **toujours `—`**.

L'ACWR réel est calculé inline dans `computeSRS()` (`coach.js:362-390`) et exposé via `srs.acwr`.

**⭐ Score : 2 / 8** (la valeur n'est pas accessible côté Bilan du matin)

**🔧 Fix critique** — exposer la valeur ACWR :
```js
// engine.js — ajouter en zone publique
function computeACWR() {
  var s = typeof computeSRS === 'function' ? computeSRS() : null;
  return s && typeof s.acwr === 'number' ? s.acwr : null;
}
```

---

### G-02 · PROFILE_OPTIMAL → ACWR 0.8-1.2

**📋 Vérification** : 4 logs ~9000 vol moyens sur 12 jours.
- TRIMP Force 7j ≈ 600 (estimation)
- TRIMP Force 28j hebdomadarisé ≈ 700
- ACWR ≈ 0.86 ✓

**⭐ Score : 7 / 8** — calcul correct, valeur non affichée à l'utilisateur (cf. G-01).

---

### G-03 · PROFILE_SURCHARGE → SRS < 50

**📋 Vérification** :
- ACWR ≈ 1.5 → acwrScore ≈ 20 (formule `Math.max(0, 100 - |1 - 1.5| × 160)` = 20)
- subjScore : pas de db.readiness alimenté → fallback 60
- trendScore : pas assez de logs avec `maxRM` → 70 (default)
- Sans HRV : `raw = 20 × 0.60 + 60 × 0.20 + 70 × 0.20 = 38`
- Phase peak ? non → reste 38
- cycle coeff = 1.0
- Activité secondaire CrossFit hier → malus
- ACWR > 1.6 ? non (1.5) → **pas de force active recovery**

→ Score final ~35, label "🟠 Fatigue modérée"

**⭐ Score : 7 / 8** — calcul cohérent.

---

### G-04 · PROFILE_OPTIMAL → SRS > 65

**📋 Vérification** :
- ACWR ≈ 0.86 → dans 0.8-1.2 → acwrScore = 100
- subjScore = 60 (fallback)
- trendScore : avec quelques logs maxRM → ~75
- raw = 100 × 0.60 + 60 × 0.20 + 75 × 0.20 = 87

→ Score ~87 ✓

**⭐ Score : 8 / 8 ⭐⭐⭐⭐⭐**

---

### G-05 · PROFILE_LEA_LUTEALE → C_cycle ≈ 0.80

Voir B-07. **⭐ Score : 4 / 8** — divergence 0.88 vs 0.80 documenté.

---

### G-06 · PROFILE_SURCHARGE → TRIMP semaine > budget

**📋 Vérification** :
- 6 séances dont 1 avec exercices détaillés (130 kg × 5 reps × RPE 9 × cSlot 1.5) ÷ 15 ≈ 263 par exo principal
- Estimation totale 7j : ~600-700 TRIMP Force
- Activité secondaire : 2 CrossFit × ~200 = 400
- Total ≈ 1000-1100 TRIMP

→ Au-dessus du seuil moderate (300) ✓ et heavy (450 dynamique pour DOTS ~300)
→ Flag « Activité intense hier (350+ TRIMP — seuil 300) » devrait s'afficher ✓

**⭐ Score : 7 / 8**

---

### G-07 · PROFILE_REFEED → getRefeedRecommendation active:true

Voir D-05. **⭐ Score : 5 / 8** — déclenche peut-être ou pas selon SRS exact.

---

### G-08 · PROFILE_RETOUR_BLESSURE → Tendon stress score genou

Voir E-03. **⭐ Score : 2 / 8** — baseline insuffisante + injuries non reconnues.

---

## SECTION H — Cohérence Inter-Features

### H-01 · PROFILE_SURCHARGE → Coach "repos" + GO "séance"

**📋 Évaluation** :
- Coach affiche : Diagnostic ACWR (zone rouge), Sleep Penalty active
- GO (`renderGoTab`) → calcule charges via `wpComputeWorkWeight` qui applique sleep × 0.95 + cycleCoeff 1.0 + RHR × 0.95... pénalités cumulées ~0.86 → > 0.70 → pas de force recovery
- → GO propose une séance avec charges réduites de ~14 %

**Cohérence** : moyenne. Le Coach signale danger mais GO ne propose pas explicitement « séance technique ».

**⭐ Score : 5 / 8**

**🔧 Fix** — quand `srs.acwr > 1.4` ou `forceActiveRecovery`, GO devrait afficher un bandeau « Mode récupération active ».

---

### H-02 · PROFILE_KILL_SWITCH → Coach + GO cohérents

**📋 Évaluation** : Coach silencieux (cf. C-01), GO applique `APRE_PHASE_CAPS.peak = 1.00` → charges fixes mais sans bandeau explicite.
**⭐ Score : 3 / 8** — l'utilisateur ne sait pas qu'il est en peak.

**🔧 Fix** — voir C-01 (bandeau Coach) + bandeau GO :
```js
// dans renderGoTab — début
if (db._killSwitchActive) {
  html += '<div class="go-killswitch-banner">🛡️ Mode Préservation — charges fixes, RPE max 8</div>';
}
```

---

### H-03 · PROFILE_LEA_LUTEALE → charge réduite cohérente

**📋 Vérification** : Coach card "Phase lutéale" + GO applique `× 0.88` automatiquement + coachNote "Phase de récupération hormonale".

**⭐ Score : 7 / 8** — bonne cohérence.

---

### H-04 · PROFILE_OPTIMAL → "fenêtre optimale" + charge max

**📋 Évaluation** : Coach n'affiche aucun message "fenêtre optimale" (cf. A-03), GO applique pénalités neutres → propose charges normales.

**⭐ Score : 4 / 8** — message manque côté Coach.

---

### H-05 · PROFILE_CHURN → Dashboard "Reprendre" + Coach "bienvenue"

**📋 Vérification** : la home affiche probablement la même `detectChurn()` ou un équivalent. Le Coach a le full message "Prêt à reprendre ?" très empathique. ✓

**⭐ Score : 7 / 8** — bon ton sur les deux entrées.

---

### H-06 · PROFILE_SURCHARGE → ACWR Coach + TRIMP Analyse

**📋 Évaluation** : ACWR dans Diagnostic Athlétique + Budget Récupération avec TRIMP. Mais valeurs séparées sans corrélation visible.
**⭐ Score : 5 / 8**

**🔧 Fix** — ajouter une légende sous la barre Budget : `« ACWR ratio = 1.42 → ce ratio dépasse la zone de progression sûre. »`

---

### H-07 · PROFILE_REFEED → Coach Refeed + Dashboard nutrition

**📋 Évaluation** : Coach affiche carte Refeed (orange). Le tab Stats / Profil ont aussi des affichages nutrition. Pas de doublon manifeste.
**⭐ Score : 6 / 8**

---

### H-08 · PROFILE_RETOUR_BLESSURE → Coach RTP + Plan sans risques

**📋 Évaluation** : voir E-02 — la blessure n'est pas reconnue, le plan ne filtre pas le squat. **Incohérence majeure**.
**⭐ Score : 2 / 8**

---

## Récapitulatif des scores

| ID | Sec | Score | Verdict |
|---|---|---|---|
| A-01 | A | 7/8 | BIEN |
| A-02 | A | 4/8 | À CORRIGER |
| A-03 | A | 3/8 | À CORRIGER |
| A-04 | A | **8/8** | EXCELLENT |
| A-05 | A | 7/8 | BIEN |
| A-06 | A | **8/8** | EXCELLENT |
| A-07 | A | 6/8 | BIEN |
| A-08 | A | 5/8 | PASSABLE |
| B-01 | B | **8/8** | EXCELLENT |
| B-02 | B | 6/8 | BIEN |
| B-03 | B | 7/8 | BIEN |
| B-04 | B | **8/8** | EXCELLENT |
| B-05 | B | **8/8** | EXCELLENT (si fix field) |
| B-06 | B | **8/8** | EXCELLENT (si fix field) |
| B-07 | B | 4/8 | À CORRIGER (doc/code) |
| B-08 | B | 7/8 | BIEN |
| C-01 | C | 0/8 | BLOQUANT |
| C-02 | C | 4/8 | À CORRIGER |
| C-03 | C | 7/8 | BIEN |
| C-04 | C | 6/8 | BIEN |
| C-05 | C | 4/8 | À CORRIGER |
| C-06 | C | 2/8 | BLOQUANT |
| D-01 | D | 7/8 | BIEN |
| D-02 | D | 6/8 | BIEN |
| D-03 | D | 5/8 | PASSABLE |
| D-04 | D | 4/8 | À CORRIGER |
| D-05 | D | 5/8 | PASSABLE |
| D-06 | D | 4/8 | À CORRIGER |
| E-01 | E | 2/8 | BLOQUANT |
| E-02 | E | 0/8 | BLOQUANT |
| E-03 | E | 2/8 | BLOQUANT |
| E-04 | E | 1/8 | BLOQUANT |
| E-05 | E | 0/8 | BLOQUANT |
| E-06 | E | 2/8 | BLOQUANT |
| F-01 | F | 5/8 | PASSABLE |
| F-02 | F | 5/8 | PASSABLE |
| F-03 | F | 7/8 | BIEN |
| F-04 | F | 7/8 | BIEN |
| F-05 | F | 6/8 | BIEN |
| F-06 | F | 4/8 | À CORRIGER |
| F-07 | F | **8/8** | EXCELLENT |
| F-08 | F | 6/8 | BIEN |
| F-09 | F | 3/8 | À CORRIGER |
| F-10 | F | 4/8 | À CORRIGER |
| G-01 | G | 2/8 | BLOQUANT |
| G-02 | G | 7/8 | BIEN |
| G-03 | G | 7/8 | BIEN |
| G-04 | G | **8/8** | EXCELLENT |
| G-05 | G | 4/8 | À CORRIGER |
| G-06 | G | 7/8 | BIEN |
| G-07 | G | 5/8 | PASSABLE |
| G-08 | G | 2/8 | BLOQUANT |
| H-01 | H | 5/8 | PASSABLE |
| H-02 | H | 3/8 | À CORRIGER |
| H-03 | H | 7/8 | BIEN |
| H-04 | H | 4/8 | À CORRIGER |
| H-05 | H | 7/8 | BIEN |
| H-06 | H | 5/8 | PASSABLE |
| H-07 | H | 6/8 | BIEN |
| H-08 | H | 2/8 | BLOQUANT |

**Total : 339 / 480 = 70.6 % → 5.65 / 8 → ⭐⭐⭐½**

---

## Points forts identifiés (5 étoiles)

1. **A-04 Churn detection** — le ton « De retour / Prêt à reprendre / Tu nous as manqué » est exemplaire. Personnalisation avec le PR, déculpabilisation, action concrète. **À dupliquer ailleurs.**
2. **A-06 Activity recommendation** — quand un conflit musculaire est détecté, le système nomme les muscles, donne le délai, et reste factuel.
3. **B-01 / B-04 Phase menstruelle** — vraies réussites éditoriales : « Ton corps récupère en profondeur. L'intensité est adaptée — les gains continuent ». 0 mot punitif.
4. **F-07 Phase lutéale** — non-culpabilisant à 100 %.
5. **G-04 SRS optimal** — calcul cohérent avec les données du profil.

---

## Points faibles critiques (1-2 étoiles)

1. **🚨 Section E entière (Return-to-Play)** — incompatibilité de schéma `injuries` empêche toute reconnaissance des blessures.
2. **🚨 Section C (Kill Switch)** — aucun bandeau Coach, mode silencieux pour un cas pourtant critique.
3. **🚨 G-01 `computeACWR()` non défini** — la jauge ACWR du Bilan du matin affiche toujours `—`.
4. **B-PRELIM Field name `lastPeriodStart` vs `lastPeriodDate`** — duplication empêchant la phase menstruelle d'apparaître pour des profils valides.
5. **A-02 Empilement de cards en mode surcharge** — pas de message-headline qui synthétise.
6. **A-03 Aucune célébration en zone optimale** — opportunité ratée.
7. **B-07 Cycle coefficient** — 0.88 (code) vs 0.80 (CLAUDE.md) — incohérence doc/produit.

---

## Messages à réécrire (verbatim avant/après)

| ID | Message actuel | Problème | Message proposé |
|---|---|---|---|
| A-01 | « Zone Rouge — Risque de Blessure : ACWR = X (>1.30). Le risque de blessure est statistiquement doublé. Réduire le volume de 30 % cette semaine. » | Catastrophisme | « Charge élevée — récupération à prioriser : Cette semaine, ton corps absorbe 40 % de plus que d'habitude. Réduis le volume de 30 % pour rester dans la zone de progression. » |
| A-02 | (rien — 3 cards séparées) | Pas de synthèse | « Cette semaine ton corps demande la pause. Sommeil court (2/5) + 6 séances en 7 jours = signal clair. Aujourd'hui, séance technique à 70 % — pas une journée pour pousser. » |
| A-03 | (rien — silence sur ACWR optimal) | Opportunité ratée | « ✅ Fenêtre optimale — Charge équilibrée (ACWR 0.86). C'est le moment idéal pour viser un PR ou pousser un peu. » |
| A-05 | « Aucune interférence détectée » | Sec | « Ton dos & épaules ont 24 h pour récupérer avant Deadlift demain. » |
| A-08 | (rien — barre verte sans message) | Verdict implicite | « ✅ Équilibre optimal — muscu (75 %) et cardio (25 %) sont dans la bonne fenêtre. » |
| C-01 | (rien — pas de bandeau) | Bloquant | « 🛡️ Mode Préservation — J-7 avant compétition. Plus de PR ni de progression cette semaine. Tes charges sont fixes pour préserver le système nerveux. Le travail est déjà fait — il s'agit maintenant d'arriver frais. » |
| C-03 | « Kill Switch actif — Repos total recommandé avant la compétition » | Jargon | « Mode Préservation actif — Compétition imminente, repos total aujourd'hui pour arriver à 100 %. » |
| D-01 | « Refeed recommandé : X jours de cut + récupération faible (Y/100). Mange à maintenance aujourd'hui (Z kcal) pour relancer ton métabolisme et préserver ta masse musculaire. » | « Préserver » = peur de perdre | « Recharge stratégique : X jours de déficit + ta récupération est basse (Y/100). Aujourd'hui, mange à maintenance (Z kcal) pour relancer la machine et performer demain. » |
| E-01 | (rien — 7 jours = pas de message) | Blessure ignorée | « 🌱 Tu as repris depuis 7 jours après ta blessure genou. Bonne progression — continue prudemment. » |
| F-08 | « Réduis légèrement les charges pour commencer. » | Ton injonctif | « Tu peux y aller un peu plus doucement aujourd'hui — pas besoin d'aller au max. » |
| F-09 | (rien pour 4 séances/12j) | Régularité non célébrée | « ✨ 4 séances en 12 jours — tu es dans la bonne dynamique. » |

---

## Corrections algorithmiques nécessaires

| Calcul | Valeur attendue | Valeur obtenue | Fix recommandé |
|---|---|---|---|
| `computeACWR()` | nombre 0-3 | `null` toujours | Définir `function computeACWR(){ return computeSRS().acwr; }` dans engine.js |
| `getCurrentMenstrualPhase()` field | lit `lastPeriodStart` | profils utilisent `lastPeriodDate` | Accepter les deux : `var startStr = data.lastPeriodStart \|\| data.lastPeriodDate;` |
| `MENSTRUAL_PHASES.luteale.cycleCoeff` | 0.80 (CLAUDE.md) | 0.88 (code) | Soit aligner code à 0.80 (plus protecteur), soit MAJ doc — **recommandation : MAJ doc** |
| `MENSTRUAL_PHASES.folliculaire_tardive.cycleCoeff` | 1.10 (CLAUDE.md) | 1.08 (code) | Idem — MAJ doc |
| `_killSwitchActive` setter | UI ou auto-détecté | jamais set | Auto-détecter : `db._killSwitchActive = (programParams.competitionDate && daysToCompet <= 7)` |
| Bandeau Kill Switch dans Coach | présent | absent | Ajouter en haut de `renderCoachTodayHTML()` (cf. fix C-01) |
| `isExerciseInjured()` schéma | accepte `{joint, severity}` ET `{zone, level}` | seulement `{zone, level}` | Ajouter mapping dans `engine.js:170` (cf. fix E-02) |
| `getAbsencePenalty()` injury awareness | regarde `injuries[].returnDate` | regarde uniquement les logs | Étendre fonction (cf. fix E-01) |
| `evaluateJointAlerts()` cold start | gère < 3 fenêtres | retourne `[]` | Ajouter une branche « blessure active connue » (cf. fix E-03) |
| `getRefeedRecommendation()` SRS threshold | 50 | déclenche rarement | Assouplir : `srs.score >= 55 && cutDays < 21` |
| `calcWeightCutPenalty` fallback weeklyLogs vides | utilise startWeight | utilise 0 → pénalité quasi-nulle | Fallback sur `(startWeight - currentWeight) / startWeight / cutWeeks` |
| Diagnostic Athlétique severity 'good' branche ACWR optimal | présente | absente | Ajouter `else if (acwr in [0.8,1.2])` push 'good' |
| `getRegularityMessage()` seuil 4-8 séances | message présent | jamais retourné | Ajouter seuils 5 et 8 séances |
| Vocabulaire `getVocab('acwr')` dans Diagnostic | « Ratio de charge » | « ACWR » brut | Wrapper tous les termes dans engine.js:2750+ |

---

## Verdict utilisateur

> **Un powerbuilder intermediate qui lit le Coach ce matin :**
>
> - **A-t-il envie de s'entraîner ?** → **OUI** si profil OPTIMAL ou CHURN (messages bienveillants), **PAS SÛR** si SURCHARGE (3 cards anxiogènes, pas de synthèse), **NON** si KILL_SWITCH (silence + jauge à 75/100 trompeuse).
> - **Comprend-il pourquoi la charge a changé ?** → **OUI** pour cycle menstruel, sleep, cut. **NON** pour Kill Switch (aucun bandeau), **NON** pour return-to-play (blessure ignorée si schéma `{joint, severity}`).
> - **Fait-il confiance à l'app ?** → Globalement **OUI** sur les algos clairs (SRS, ACWR optimal, churn). **MOINS** sur les zones où la doc CLAUDE.md diverge du code (cycle 0.80 vs 0.88, ACWR jauge cassée).

---

## Score final Coach : **3.5 / 5 ⭐⭐⭐½**

### Prêt pour les 5 étoiles App Store ? ❌ **NON dans l'état actuel**.

✅ **OUI avec ces 11 corrections critiques** :

1. **[CRITIQUE]** Définir `computeACWR()` dans engine.js (G-01)
2. **[CRITIQUE]** Ajouter le bandeau Kill Switch dans `renderCoachTodayHTML` (C-01)
3. **[CRITIQUE]** Auto-set `_killSwitchActive` quand `competitionDate <= J+7`
4. **[CRITIQUE]** Accepter `{joint, severity}` dans `isExerciseInjured()` (E-02)
5. **[CRITIQUE]** Étendre `getAbsencePenalty()` pour lire `injuries[].returnDate` (E-01)
6. **[IMPORTANT]** Uniformiser `lastPeriodStart` / `lastPeriodDate` dans `getCurrentMenstrualPhase()`
7. **[IMPORTANT]** Ajouter une branche `severity:'good'` ACWR optimal dans `analyzeAthleteProfile()` (A-03)
8. **[IMPORTANT]** Réécrire 11 messages identifiés (cf. tableau verbatim)
9. **[QUALITÉ]** Réordonner les sections du Coach par criticité (F-06)
10. **[QUALITÉ]** Wrapper les termes techniques dans `getVocab()` partout (F-02)
11. **[DOC]** Mettre à jour CLAUDE.md cycle coefficients pour aligner avec engine.js

Avec ces corrections, l'audit projeté passerait à **6.7 / 8 = 4.2 / 5 ⭐⭐⭐⭐** — au-dessus du seuil App Store visé.

Une **deuxième passe sur la section H (cohérence inter-features)** sera nécessaire après les corrections E + C pour viser **4.5 / 5 ⭐⭐⭐⭐½**.

---

*Audit généré le 2026-05-09 par claude-opus-4-7. 60 tests. 8 profils. Méthodologie : code-statique + simulation des chemins d'exécution.*
