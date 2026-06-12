# PROMPT_RULES — Règles d'exécution des chantiers

> Règles transverses applicables à tout prompt de chantier sur ce repo.
> Mettre à jour ce fichier quand une nouvelle règle est actée (commit dédié).

## Commits

1. **Chaque commit poussé doit être vert** : `node -c` sur les fichiers touchés ET
   la suite de tests complète (`npm test`) passent au commit près.
2. **Quand un changement inverse un test de caractérisation, l'inversion vit dans
   LE MÊME commit que le changement de comportement.** Jamais de commit rouge
   intermédiaire « le test sera inversé au commit suivant ».
   (Leçon du run #44 de READY-C2-b : le commit 2/3 — persistance session.readiness —
   a laissé `readiness_non_persiste_actuellement` rouge jusqu'au commit 3/3.)
3. Un commit par changement logique (UI / stockage / persistance / tests…),
   push après chaque commit.
4. Bump `CACHE_NAME` (service-worker.js) + `SW_VERSION` (js/app.js) sur le DERNIER
   commit d'un chantier qui modifie un fichier précaché par le SW.

## Tests de caractérisation

5. Observe-then-assert : toute valeur figée a été observée par probe AVANT d'être
   écrite dans une assertion. Les tests décrivent ce que le code FAIT, bugs inclus.
6. Vraie source uniquement : vm-extraction depuis les fichiers réels, jamais de
   réimplémentation d'un helper dans un test.
7. Une assertion gelée ne change que si le prompt du chantier l'a explicitement
   listée comme inversion délibérée (et alors : règle 2).

## Périmètre

8. Diagnostic = lecture seule absolue (aucun fichier source modifié, aucun commit
   de code ; seul le livrable markdown est autorisé).
9. Découvertes hors-scope : signaler dans le rapport sans agir.
10. Si une extraction/refactor s'avère inséparable ou rompt l'iso-fonctionnalité :
    STOP et rapport, jamais de contournement silencieux.
