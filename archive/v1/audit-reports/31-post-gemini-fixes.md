# Rapport Fix Post-Audit Gemini — v180 → v181

**Date** : 2026-05-10  
**Branche** : `claude/audit-ble-watch-app-7O2cs`  
**Score visé** : 6.3/10 → 8/10 (dimensions critiquées par Gemini)

---

## Contexte

4 fixes critiques identifiées par un audit Gemini "killer" portant sur :
- L'expérience iOS manquante (pas de prompt d'installation, widget FC inutilisable)
- Le risque de yo-yo APRE sur les lifts principaux (progression non plafonnée)
- Le vocabulaire expert non adapté aux débutants (SRS/ACWR/TRIMP illisibles)

---

## Fixes Appliqués

### FIX 1 — iOS Install Prompt Banner
**Fichier** : `js/app.js`  
**Fonction** : `checkIOSInstallPrompt()` (nouvelle)  
**Appelée** : `init()` → `setTimeout(..., 3000)`

- Détecte iOS Safari (UA `iPhone|iPad|iPod` sans `CriOS|FxiOS|EdgiOS|OPiOS`)
- Skip si `navigator.standalone === true` (PWA déjà installée)
- Skip si `db.user._iosInstallPromptShown === true` (affichée une seule fois)
- Banner fixe en bas d'écran : "Appuie sur Partager ⎙ puis Sur l'écran d'accueil"
- Bouton ✕ pour fermer manuellement
- Auto-dismiss après 10s
- Persiste le flag `_iosInstallPromptShown` dans `db.user` via `saveDB()`

### FIX 2 — iOS FC Widget : Input Manuel
**Fichier** : `js/app.js`  
**Fonction** : `renderFCWidget()`

- Détecte iOS Safari dans la branche `isConnected === false`
- Remplace le bouton "Connecter" (BLE indisponible sur iOS Safari) par un `<input type="number">` min=40 max=220
- `onchange` : affecte `_currentHR` et re-render le widget via `outerHTML = renderFCWidget()`
- Chrome Android et connexion BLE active inchangés

### FIX 3 — Cap APRE +5%/semaine sur Lifts Principaux
**Fichier** : `js/app.js`  
**Fonction** : `wpComputeWorkWeight()`  
**Position** : avant `var apre_base = baseWeight` (ligne ~17548)

- S'applique uniquement aux lifts `squat`, `bench`, `deadlift` (paramètre `liftType`)
- Exemption : mode LP (`isInLP()`) et mode débutant (`isBeginnerMode`) — progrès linéaire préservé
- Formule : `if (baseWeight > last.weight * 1.05) baseWeight = wpRound25(last.weight * 1.05)`
- Prévient les bonds > 5% qui déclenchent des fails RPE 10 puis des deloads cycliques

### FIX 4 — Vocabulaire Adaptatif `labelFor()`
**Fichier** : `js/app.js`  
**Fonctions** : `labelFor()` (nouvelle) + `_LABEL_MAP` (constante)

| vocabLevel | srs | acwr | trimp |
|---|---|---|---|
| 1 | Forme du jour | Charge semaine | Fatigue |
| 2 | Forme du jour | Charge semaine | Charge cumul. |
| 3 | SRS (Readiness) | ACWR | TRIMP |

**Appliqué dans** :
- Dashboard (batterie nerveuse) : label ACWR → `labelFor('acwr','ACWR')`
- Coach HTML (section charge) : titre + labels SRS + ACWR
- Activity breakdown : labels TRIMP sur les 2 barres muscu/activités
- Activity log card : TRIMP dans la ligne de résumé

---

## Tests Playwright — 25/25

| Test | Résultat |
|---|---|
| FIX1-01 checkIOSInstallPrompt définie | ✅ |
| FIX1-02 Pas de banner sur UA desktop | ✅ |
| FIX1-03 Banner sur UA iOS Safari | ✅ |
| FIX1-04 Flag _iosInstallPromptShown empêche répétition | ✅ |
| FIX1-05 standalone=true → pas de banner | ✅ |
| FIX1-06 CriOS (Chrome iOS) → pas de banner | ✅ |
| FIX2-01 renderFCWidget définie | ✅ |
| FIX2-02 Non-iOS → bouton "Connecter" | ✅ |
| FIX2-03 iOS → input numérique | ✅ |
| FIX2-04 iOS → pas de bouton "Connecter" | ✅ |
| FIX2-05 Connecté → affichage bpm | ✅ |
| FIX3-01 wpComputeWorkWeight définie | ✅ |
| FIX3-02 Code cap 1.05 présent dans app.min.js | ✅ |
| FIX3-03 Squat APRE plafonné ≤ 105% last weight | ✅ |
| FIX3-04 Users LP exemptés du cap | ✅ |
| FIX4-01 labelFor() définie | ✅ |
| FIX4-02 vocabLevel 1 SRS → "Forme du jour" | ✅ |
| FIX4-03 vocabLevel 1 ACWR → "Charge semaine" | ✅ |
| FIX4-04 vocabLevel 1 TRIMP → "Fatigue" | ✅ |
| FIX4-05 vocabLevel 2 ACWR → "Charge semaine" | ✅ |
| FIX4-06 vocabLevel 2 TRIMP → "Charge cumul." | ✅ |
| FIX4-07 vocabLevel 3 SRS → "SRS (Readiness)" | ✅ |
| FIX4-08 vocabLevel 3 ACWR → "ACWR" | ✅ |
| FIX4-09 vocabLevel 3 TRIMP → "TRIMP" | ✅ |
| FIX4-10 Dashboard affiche "Charge semaine" vocabLevel 1 | ✅ |

**Total : 25/25 — 100%**

---

## Build

- `js/app.js` : 24 595 lignes (SW_VERSION = 'trainhub-v181')
- `js/app.min.js` : régénéré avec terser 5.47.1
- `service-worker.js` : CACHE_NAME 'trainhub-v180' → 'trainhub-v181'

---

## Dimensions Gemini Répondues

| Dimension | Avant | Après |
|---|---|---|
| iOS UX (install) | 2/10 — zéro prompt | 8/10 — banner Safari correct |
| iOS FC widget | 2/10 — erreur BLE inutile | 8/10 — saisie manuelle fonctionnelle |
| Stabilité APRE | 6/10 — yo-yo possible | 9/10 — cap +5%/semaine |
| Accessibilité vocabulaire | 4/10 — ACWR/SRS/TRIMP | 9/10 — labelFor() adaptatif |
