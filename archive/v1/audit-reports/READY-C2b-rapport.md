# READY-C2-b — Rapport : saisie quotidienne unique

Branche : `feat/ready-c2b-saisie-unique` · Base : `main` = `78a5bb7` (post-harnais C2-a)
Commits : `7e79055` (composant + stockage + gate) · `e9ed60e` (persistance session) ·
`b931d50` (tests) · + bump v283 (dernier commit).

## Ce qui a été fait

**Composant unique emoji 1-5** (`CHECKIN_ITEMS` + `buildCheckinFormHtml(prefix)` +
`setCheckin(field, value, prefix)`), rendu aux deux surfaces :
- **Carte Coach** « ☀️ Check-in du jour » (`renderMorningCheckin`, même emplacement,
  appelant 18534 inchangé) — bouton Confirmer gated 4/4.
- **Modal pré-séance** (`showReadinessModal` réécrit, même wrapper/overlay
  `#readinessModal`, mêmes corrections viewport iOS/Android) — Passer (sémantique skip
  inchangée : `_readinessSkipDate`, ne compte pas comme rempli) / Valider gated 4/4.

Items : 😴 Sommeil (emojis existants) · ⚡ Énergie 🪫😪😐😊🔋 (nouveau) · 🧠 Motivation
(existants) · 🦵 **Fraîcheur musculaire** 🥵😖😐😌✨ (inversion délibérée des courbatures,
libellé explicite « 1 = très courbaturé · 5 = très frais ») · Douleurs (zones inchangées,
non scoré). Mapping Helms : ×2, `soreness = 11 − fraîcheur×2` — `calculateReadiness`
**intact**. Contrôles vérifiés par tests ET en réel (Playwright) : 5/5/5/5 → 100,
1/1/1/1 → 20, 3/3/3/3 → 60.

**Sauvegarde unique** `saveDailyCheckin()`, écritures dans l'ordre spécifié :
readinessHistory (cible, désormais avec `date` + `pain`, cap 90) → miroir `db.readiness`
(forme strictement identique à l'ancienne — les 9 lecteurs inchangés) → miroir
`todayWellbeing` en 1-5 brut avec **merge non destructif** (préserve `rhr`/`rhrAlert` d'un
import Garmin **du jour** ; un rhrAlert d'un autre jour n'est volontairement PAS propagé —
choix documenté : propager une alerte périmée aurait aggravé le quirk « rhrAlert sans
date » figé en C2-a) → `wellbeingHistory` comme avant → `saveDB()`. Séance active :
`activeWorkout.readiness` posé comme avant (loadAdjustment stocké, non consommé — C3).

**Gate unifié** `hasTodayCheckin()` (readinessHistory OU readiness OU todayWellbeing du
jour) : la carte Coach se masque, le modal ne s'ouvre plus après un check-in matinal —
**inversion du bug de double saisie**, prouvée en réel (cf. vérification visuelle).

**Persistance séance** : `convertWorkoutToSession` copie `activeWorkout.readiness` →
`session.readiness`. Effet assumé : le `readinessAdj` de `generateAlgoSessionDebrief`
devient actif sur la cible de compliance.

**Supprimés avec l'ancien modal** (franchement, sans archive) : sliders 1-10,
`updateReadinessPreview` (et sa promesse « Charges ajustées ±X % »), fallback fossile
`rd-stress`, ancien `submitReadiness`.

## Tests

```
Test Suites: 5 passed, 5 total
Tests:       123 passed, 123 total   (0 rouge, 0 skip)
```
106 de départ − 2 inversés sciemment (`double_saisie_impossible`,
`readiness_persistee_dans_session`, références C2-b en commentaire) + 19 nouveaux
(3 valeurs de contrôle, item manquant → zéro écriture, forme exacte des 4 écritures,
merge rhr/rhrAlert même-jour + alerte périmée non propagée, activeWorkout.readiness,
saveDB ×1, hasTodayCheckin 4 cas, session sans readiness → pas de champ fantôme).
**Tous les tests figés du harnais (pénalités, wpDetectPhase, stress, shouldDeload,
gates) verts SANS modification** — l'iso-fonctionnalité des miroirs est démontrée.

## Vérification visuelle (Playwright, chromium 390×844)

- **Carte Coach avant saisie** : visible avec les 4 items + douleurs (capture
  c2b-card-before/filled.png) ; sélections surlignées ; bouton 0.4 → 1 à 4/4.
- **Après validation** : carte masquée, écritures vérifiées en live
  (hist `{8,6,10,7, score 68, pain 'Dos'}` pour 4/3/5/2+Dos — mapping exact),
  `hasTodayCheckin()` true.
- **Modal pré-séance supprimé après check-in matinal** : `showReadinessModal(cb)` →
  callback immédiat, aucun `#readinessModal` au DOM.
- **Surface modal** (contexte vierge) : s'ouvre, gate Valider 0.4 → 1 à 4/4, Valider →
  modal fermé + callback + score 100 écrit (capture c2b-modal-filled.png).
- **Toast score** : contrat vérifié par instrumentation — exactement
  `✅ Check-in : 60/100`, aucune mention de charges. (L'affichage passe par la file
  `_toastQueue` préexistante : en headless il est différé derrière d'autres toasts du
  boot — mécanisme commun à toute l'app, pas une régression C2-b ; un toast de la file
  est d'ailleurs visible sur la capture carte.)
- Zéro pageerror filtré sur tous les parcours.

## Signalements hors-scope (non traités)

1. **Carte « Batterie Nerveuse » (renderWeekCard, ~8166)** : son sous-bloc s'intitule
   encore « Bilan du matin » avec CTA « Faire le bilan → » (deep-link Coach, fonctionnel).
   Libellé à aligner sur « Check-in du jour » — cosmétique, surface C2-c/d.
2. **Cold start** : la carte check-in n'apparaît pas pour un utilisateur sans logs
   (la vue Coach affiche l'état calibration sans `renderMorningCheckin`) — comportement
   préexistant au remplacement, découvert pendant la vérification visuelle.
3. **Bannière readiness (`getReadinessBannerHtml`)** : intentionnellement intacte (C2-d) ;
   son détail dépliable affiche toujours « X/5 » pour des valeurs 1-10 et le champ stress
   fantôme — inchangé, déjà documenté au diagnostic.
4. Les anciens lecteurs `todayWellbeing.sleep ≤ 2` (pénalité) reçoivent désormais
   toujours une échelle 1-5 cohérente via le miroir — aucun changement de comportement,
   mais le rebranchement propre reste C2-c.
