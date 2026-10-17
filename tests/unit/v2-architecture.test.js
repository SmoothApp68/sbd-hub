/** @jest-environment node */
//
// LA GARDE D'ARCHITECTURE — « un seul coach, un seul câblage » (29/09/2026).
//
// C1 à C6 ont fait de `planDeSeance` le seul coach : la garde de C6 vérifie
// chaque plan (`verifierPlan`, I1 à I15), et le banc vérifie les invariants
// après chaque geste. Ils protègent le RÉSULTAT. Ce test protège le CÂBLAGE :
// un calcul du coach appelé directement depuis l'écran, en contournant le
// plan, ne se verrait dans les invariants que s'il produisait une
// contradiction visible. Ici, il se voit à la lecture du source.
//
// LA RÈGLE. Chaque fonction de calcul du coach (liste `GARDEES`) ne s'appelle
// que depuis le module qui la définit, `plan.js`, ou un fichier inscrit pour
// elle dans `AUTORISATIONS`, AVEC SA RAISON. Élargir la liste est un geste
// conscient, visible dans une PR — jamais un blocage : c'est ce qui laisse
// passer les chantiers suivants (programmes, poids du corps, chauffes…) sans
// laisser passer un second coach.
//
// LE PÉRIMÈTRE : ce que l'app sert — `v2/js/*.js` et `v2/index.html`. Les
// tests et les bancs sont hors du périmètre (ils appellent le moteur exprès).
//
// LA LECTURE : le source, commentaires et chaînes retirés. Un appel se
// reconnaît à l'accès par propriété (`Moteur.x`, `M.x`, `racine.THMoteur.x`,
// `Moteur().x` — l'alias ne compte pas), ou à l'accès entre crochets
// (`Moteur['x']`). Limite assumée : un alias de la FONCTION elle-même
// (`var f = …`) se voit à sa création, pas à ses appels.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '../..');
const V2 = path.join(RACINE, 'v2');

// ── LES FONCTIONS DE CALCUL DU COACH ────────────────────────────────────────
//
// `module` : le fichier qui la définit et l'exporte (il a toujours le droit de
// l'appeler). `motif` : seulement quand le nom est AUSSI un champ ou un rappel
// ordinaire ailleurs — `fantome` est un champ des lignes du plan et un rappel
// de la vue (`vue.fantome(i, j)` dans `rendu.js`) : on ne garde que l'appel
// qualifié par le module.
const GARDEES = [
  // moteur.js — la consigne
  { fn: 'consignePour', module: 'moteur.js' },
  { fn: 'consigneDExercice', module: 'moteur.js' },
  { fn: 'contratDe', module: 'moteur.js' },
  { fn: 'sansPalierRetenues', module: 'moteur.js' },
  { fn: 'consigneFigee', module: 'moteur.js' },
  { fn: 'habitudeDe', module: 'moteur.js' },
  { fn: 'zoneRetenue', module: 'moteur.js' },
  { fn: 'zoneEnVigueur', module: 'moteur.js' },
  // moteur.js — le mode d'un exercice, la carte du lest, le départ lesté (§9.17, 50-1)
  { fn: 'modeEnVigueur', module: 'moteur.js' },
  { fn: 'intentionDe', module: 'moteur.js' },
  { fn: 'carteLestTitre', module: 'moteur.js' },
  { fn: 'carteLestDetail', module: 'moteur.js' },
  { fn: 'consigneDepartLeste', module: 'moteur.js' },
  { fn: 'niveauValide', module: 'moteur.js' },
  { fn: 'chargeVoisine', module: 'moteur.js' },
  { fn: 'pasDeSalle', module: 'moteur.js' },
  { fn: 'repriseDe', module: 'moteur.js' },
  { fn: 'ecartHabituel', module: 'moteur.js' },
  // moteur.js — la réaction, la seconde charge, la couverture, les paris
  { fn: 'reactionPour', module: 'moteur.js' },
  { fn: 'contexteReaction', module: 'moteur.js' },
  { fn: 'secondeCharge', module: 'moteur.js' },
  { fn: 'sautsDeMontee', module: 'moteur.js' },
  { fn: 'planDeCouverture', module: 'moteur.js' },
  { fn: 'lignesDePari', module: 'moteur.js' },
  { fn: 'revisionsDuPlan', module: 'moteur.js' },
  { fn: 'observationDe', module: 'moteur.js' },
  { fn: 'idDePrediction', module: 'moteur.js' },
  // moteur.js — ce que le coach dit (phrases, en-tête, pourquoi, constat)
  { fn: 'phraseReaction', module: 'moteur.js' },
  { fn: 'enteteDeDisposition', module: 'moteur.js' },
  { fn: 'libellesConsigne', module: 'moteur.js' },
  { fn: 'pourquoiConsigne', module: 'moteur.js' },
  { fn: 'etiquetteZone', module: 'moteur.js' },
  { fn: 'constatDe', module: 'moteur.js' },
  { fn: 'constatDuJour', module: 'moteur.js' },
  { fn: 'suiteDExercice', module: 'moteur.js' },
  // moteur.js — les chauffes et les dégressives (§9.15, 49-U10)
  { fn: 'situationChauffe', module: 'moteur.js' },
  { fn: 'chauffesDe', module: 'moteur.js' },
  { fn: 'degressiveDe', module: 'moteur.js' },
  // moteur.js — la chute de fin de séance (§9.2 bis, 49-U12)
  { fn: 'chuteDe', module: 'moteur.js' },
  // moteur.js — le compteur de stagnation (§12.9, 49-U13)
  { fn: 'compteurDe', module: 'moteur.js' },
  { fn: 'phraseCompteur', module: 'moteur.js' },
  // moteur.js — les frères (§13.6, 49-U20)
  { fn: 'frereQuiProgresse', module: 'moteur.js' },
  { fn: 'phraseFrere', module: 'moteur.js' },
  // moteur.js — l'escalier, la semaine allégée (§14.4, 49-U14)
  { fn: 'blocageGeneralise', module: 'moteur.js' },
  { fn: 'phraseCarte', module: 'moteur.js' },
  { fn: 'consigneAllegee', module: 'moteur.js' },
  { fn: 'phraseAllegee', module: 'moteur.js' },
  { fn: 'detailAllegee', module: 'moteur.js' },
  { fn: 'bandeauAllegee', module: 'moteur.js' },
  { fn: 'periodeAllegee', module: 'moteur.js' },
  { fn: 'carteAutorisee', module: 'moteur.js' },
  { fn: 'observationSemaineAllegee', module: 'moteur.js' },
  { fn: 'idDEscalier', module: 'moteur.js' },
  // 69 — l'identifiant d'une séance importée et de ses séries (ECRAN-PROFIL §2.4 quater)
  { fn: 'idDImport', module: 'moteur.js' },
  // moteur.js — l'escalier, le blocage isolé (§14.5, 49-U15)
  { fn: 'nIsole', module: 'moteur.js' },
  { fn: 'declenchementsRepondus', module: 'moteur.js' },
  { fn: 'marcheIsolee', module: 'moteur.js' },
  { fn: 'autresAvancent', module: 'moteur.js' },
  { fn: 'carteSchema', module: 'moteur.js' },
  { fn: 'phraseSeche', module: 'moteur.js' },
  { fn: 'repliEscalier', module: 'moteur.js' },
  // moteur.js — le report de charge au changement de zone (§9.10, 53-1)
  { fn: 'reportDeZone', module: 'moteur.js' },
  { fn: 'consigneRepli', module: 'moteur.js' },
  { fn: 'phraseRepli', module: 'moteur.js' },
  { fn: 'observationMarche', module: 'moteur.js' },
  // moteur.js — la règle de volume, la place pour une série de plus (§14.6, 49-U16)
  { fn: 'placeDeVolume', module: 'moteur.js' },
  { fn: 'placePourExercice', module: 'moteur.js' },
  { fn: 'musclesParPriorite', module: 'moteur.js' },
  // moteur.js — l'escalier, la série de plus (§14.7, 49-U17)
  { fn: 'marcheProposee', module: 'moteur.js' },
  { fn: 'serieDePlusProposee', module: 'moteur.js' },
  { fn: 'serieDePlusActive', module: 'moteur.js' },
  { fn: 'periodesSerieDePlus', module: 'moteur.js' },
  { fn: 'carteSerieDePlus', module: 'moteur.js' },
  { fn: 'consigneSerieDePlus', module: 'moteur.js' },
  // moteur.js — l'escalier, la dégressive proposée (§14, 111)
  { fn: 'degressivePossible', module: 'moteur.js' },
  { fn: 'degressiveProposee', module: 'moteur.js' },
  { fn: 'degressiveActive', module: 'moteur.js' },
  { fn: 'carteDegressive', module: 'moteur.js' },
  // moteur.js — l'escalier au plafond de la salle (§10 bis, 113)
  { fn: 'auPlafondDeLaSalle', module: 'moteur.js' },
  { fn: 'plafondDeLaConsigne', module: 'moteur.js' },
  { fn: 'marcheAuPlafond', module: 'moteur.js' },
  { fn: 'plusChargeableALaSalle', module: 'moteur.js' },
  { fn: 'remplacantAuPlafond', module: 'moteur.js' },
  { fn: 'cartePlafond', module: 'moteur.js' },
  { fn: 'detailRemplacement', module: 'moteur.js' },
  { fn: 'observationPlafond', module: 'moteur.js' },
  // seance.js — le fantôme, la couverture, les lignes figées, les paris
  { fn: 'fantome', module: 'seance.js',
    motif: /(?:\bSeance|\bS|\bSeance\(\)|\bS\(\)|racine\.THSeance)\s*\.\s*fantome\b/g },
  { fn: 'planDe', module: 'seance.js' },
  { fn: 'couvertureDe', module: 'seance.js' },
  { fn: 'couvertureSeance', module: 'seance.js' },
  { fn: 'figeesDe', module: 'seance.js' },
  { fn: 'observationTenue', module: 'seance.js' },
  { fn: 'peutObserver', module: 'seance.js' },
  { fn: 'parisAObserver', module: 'seance.js' },
  { fn: 'observationsARenvoyer', module: 'seance.js' },
  // generateur.js — le programme construit (QUESTIONNAIRE-COACH-V2 §5 bis, 60-4). `generer` et `pourquoi` sont des
  // noms courants : on ne garde que l'appel qualifié par le module.
  { fn: 'generer', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*generer\b/g },
  { fn: 'neVeuxPas', module: 'generateur.js' },
  { fn: 'remplacePar', module: 'generateur.js' },
  { fn: 'pourquoi', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*pourquoi\b/g },
  { fn: 'carteCycles', module: 'generateur.js' },
  // generateur.js — « Le coach relit ta semaine » (66A, QUESTIONNAIRE-COACH-V2 §5 ter) : l'écran (66B) lira la
  // relecture, il ne la refait pas ; ses invariants (R1-R4) se vérifient par le module.
  { fn: 'relireSemaine', module: 'generateur.js' },
  // `motif` : la garde de développement a sa méthode du même nom (`garde.verifierRelecture`, plan.js, 66B), qui lit
  // le générateur à l'appel ; seul l'appel qualifié par le module compte.
  { fn: 'verifierRelecture', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*verifierRelecture\b/g },
  // generateur.js — le programme déduit complété (66C, QUESTIONNAIRE-COACH-V2 §5 quater.3) : aucun appelant hors du
  // module avant « Construis-le-moi » (66D).
  { fn: 'completer', module: 'generateur.js' },
  { fn: 'verifierComplement', module: 'generateur.js' },
  // generateur.js — la fin (66D, QUESTIONNAIRE-COACH-V2 §5 quater.4-5) : l'ordre, les supersets, l'habillage d'une
  // ligne déduite et les lignes de « Ce que j'ai changé ». `motif` de `ranger` : `Sync.ranger` (sync.js) est une
  // autre fonction du même nom ; seul l'appel qualifié par le générateur compte.
  { fn: 'ranger', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*ranger\b/g },
  { fn: 'associer', module: 'generateur.js' },
  { fn: 'verifierAssociation', module: 'generateur.js' },
  { fn: 'habiller', module: 'generateur.js' },
  { fn: 'changementsDeLApercu', module: 'generateur.js' },
  // deraille.js — la semaine qui déraille (99, MOTEUR §9.24)
  { fn: 'semaineQuiDeraille', module: 'deraille.js' },
  // objectif.js — l'objectif posé par la personne, à l'essai (109, MOTEUR §9.25) : la date annoncée, ce que la page
  // montre, l'observation du pari ; et l'identifiant du pari (moteur.js).
  { fn: 'projection', module: 'objectif.js', motif: /(?:\bObjectif|racine\.THObjectif)\s*\.\s*projection\b/g },
  { fn: 'vue', module: 'objectif.js', motif: /(?:\bObjectif|racine\.THObjectif)\s*\.\s*vue\b/g },
  { fn: 'observationDe', module: 'objectif.js', motif: /(?:\bObjectif|racine\.THObjectif)\s*\.\s*observationDe\b/g },
  { fn: 'idDObjectif', module: 'moteur.js' },
  // 124 (audit du 16/10/2026, 06 #5) — ce que le coach PROPOSE ou RÉDIGE hors de la séance : la carte de fin de bloc
  // (§9.22), les cibles et la carte de « J'ai peu de temps » (§9.18), la feuille « J'ai mal » (§9.20). Appelées par
  // l'écran, elles n'étaient inscrites nulle part : la garde ne les voyait pas. Le reste de ce que les écrans lisent du
  // moteur (faits, formats, lectures des lignes en base) est au registre des notions, bloc « 124 ».
  { fn: 'carteFinDeBloc', module: 'moteur.js' },
  { fn: 'ciblesDeTemps', module: 'moteur.js' },
  { fn: 'carteRaccourcir', module: 'moteur.js' },
  { fn: 'feuilleDouleur', module: 'moteur.js' }
];

// ── LA LISTE D'AUTORISATIONS ────────────────────────────────────────────────
//
// `plan.js` : le coach. Il a le droit d'appeler toutes les fonctions gardées —
// c'est sa raison d'être (`planDeSeance`, MOTEUR §9.13 bis).
const LE_COACH = 'plan.js';
//
// Les AUTRES fichiers, fonction par fonction, chacun avec sa raison. Une
// entrée qui n'a plus d'appel fait échouer le test : la liste dit exactement
// ce qui est, jamais ce qui a été.
//
// ⚠️ Toutes les entrées ci-dessous existaient à la pose de la garde
// (29/09/2026) et sont RAPPORTÉES dans sa PR pour décision : elles ne sont pas
// forcées dans le plan par ce commit.
const AUTORISATIONS = {
  projection: {
    'app.js': 'MOTEUR §9.25 (109) : l’objectif se pose sur la page d’exercice, hors séance — donc sans plan ; la date ' +
      'se projette UNE fois, à la pose (app.js, `poserObjectif`), et la ligne `objectifs` la garde figée — ou, pour un ' +
      'objectif posé en « Juste un carnet », UNE fois au retour en Progresser (app.js, `projeterObjectifsDuCarnet`, ' +
      'audit du 16/10/2026, 01 #11).'
  },
  vue: {
    'app.js': 'MOTEUR §9.25 (109) : la carte « Mon objectif » de la page d’exercice relit l’objectif posé (sa date ' +
      'figée) et les records de l’exercice — une lecture, hors séance (app.js, `carteObjectifDe`).'
  },
  observationDe: {
    'app.js': 'MOTEUR §9.25 (109) : l’observation d’un pari d’objectif (les jours réellement mis, la série qui ' +
      'l’atteint), au moment de l’écrire en base : de la persistance (app.js, `observerObjectifs`).'
  },
  idDObjectif: {
    'app.js': 'l’identifiant déterministe du pari d’un objectif au moment de l’écrire en base : de la persistance, ' +
      'la date vient de `THObjectif.projection` (app.js, `poserObjectif`, 109).'
  },
  semaineQuiDeraille: {
    'app.js': 'MOTEUR §9.24 (99) : la carte de la semaine qui déraille vit sur Saisie, AVANT toute séance — donc sans ' +
      'plan ; l’écran passe à la règle son entrée (le programme, les faits de `faits.semaineDuProgramme`, les décisions ' +
      'de la semaine) et lit la carte telle quelle (app.js, `rendreCarteSemaine`). Un exercice ajouté entre ensuite ' +
      'dans la séance et le plan le coache comme les autres.'
  },
  periodeAllegee: {
    'app.js': 'MOTEUR §9.18 (51-1 ter) : l’écran de la ROUTINE, avant toute séance — donc sans plan — ' +
      'dit si une semaine allégée est en cours, pour taire « J’ai peu de temps » et afficher la durée ' +
      'allégée ; la même lecture des cartes que `escalierDuPlan` (app.js, `semaineAllegeeEnCours`).'
  },
  consigneDExercice: {
    'app.js': 'calcule les ENTRÉES du plan (`entrees.consignes`) : le plan n’a pas l’historique ' +
      '(app.js, `consigneDe`) ; et l’étiquette de zone de la page d’exercice, hors séance, où ' +
      'il n’y a pas de plan (app.js, `rendreExercice`).'
  },
  periodesSerieDePlus: {
    'app.js': 'calcule l’ENTRÉE `periodesSerieDePlus` de `consigneDExercice` (les séances où une ' +
      'série de plus était active, dont le niveau se lit sur la routine) — préparer les entrées ' +
      'du plan (app.js, `periodesSerieDePlusDe`, 49-U17).'
  },
  placeDeVolume: {
    'app.js': 'calcule l’ENTRÉE `entrees.volume` du plan, une fois par séance, sur tout ' +
      'l’historique (le plan ne l’a pas) — préparer les entrées du plan (app.js, ' +
      '`volumeDeLaSeance`, 49-U16). 66B : une seule fonction, `volumeDuCoach(avant)`, appelée par ' +
      '`volumeDeLaSeance` (le début de la séance) et par l’entrée de « Le coach relit ta semaine » (maintenant, ' +
      'QUESTIONNAIRE §5 ter.4 bis) — le même fait, jamais recalculé autrement.'
  },
  suiteDExercice: {
    'app.js': 'calcule l’ENTRÉE `entrees.suites` du plan (la consigne de la prochaine séance, ' +
      'sur l’historique augmenté du jour) : le plan n’a pas l’historique (app.js, `suiteDe`).'
  },
  zoneEnVigueur: {
    'app.js': 'lit la zone CHOISIE dans les lignes `zones` (§9.1.1) pour la passer en ' +
      '`correction` au moteur : une entrée, pas une décision (app.js, `zoneDe`).'
  },
  modeEnVigueur: {
    'app.js': 'lit le mode CHOISI d’un exercice dans les lignes `modes` (§9.17) pour le passer ' +
      'au plan (`entrees.modes`) et à la consigne : une entrée, pas une décision (app.js, `modeDe`).'
  },
  intentionDe: {
    'app.js': 'compose l’intention d’UN exercice (celle du profil, puis son mode, §9.17) pour la ' +
      'passer à `consigneDExercice` : une entrée, pas une décision (app.js, `intentionDeLExercice`).'
  },
  idDePrediction: {
    'app.js': 'l’identifiant déterministe d’un pari au moment de l’écrire en base : de la ' +
      'persistance, le pari lui-même vient du plan (app.js, `finirPari`).'
  },
  observationSemaineAllegee: {
    'app.js': 'l’observation SANS SÉRIE du pari de la semaine allégée, au moment de l’écrire ' +
      'en base : de la persistance (app.js, `observerEscalier`) ; la règle vit dans le moteur.'
  },
  idDImport: {
    'app.js': 'l’identifiant déterministe d’une séance importée de Hevy (et de ses séries) au moment ' +
      'de la poser dans la file : de la persistance — un import rejoué écrit la même ligne (69, ' +
      '`importerHevy`).'
  },
  idDEscalier: {
    'app.js': 'l’identifiant déterministe du pari de l’escalier au moment de l’écrire en base : ' +
      'de la persistance, la carte (ou la marche isolée, 49-U15) vient du plan (app.js, ' +
      '`repondreCarte`, `repondreSchema`, `ecrireReplis`).'
  },
  observationMarche: {
    'app.js': 'l’observation SANS SÉRIE du pari d’une marche isolée (schéma accepté, repli), au ' +
      'moment de l’écrire en base : de la persistance (app.js, `observerEscalier`) ; la règle ' +
      'vit dans le moteur (49-U15).'
  },
  observationPlafond: {
    'app.js': 'l’observation SANS SÉRIE du pari au plafond de la salle (série de plus, dégressive : « tu tiens le ' +
      'plafond »), au moment de l’écrire en base : de la persistance (app.js, `observerEscalier`) ; la règle vit dans ' +
      'le moteur (113, MOTEUR §10 bis), sur les faits (`faits.seancesDeLExercice`).'
  },
  observationDe: {
    'app.js': 'l’observation d’un pari par sa série, au moment de l’écrire en base : de la ' +
      'persistance d’une ligne du plan (app.js, `observerPari`).'
  },
  peutObserver: {
    'app.js': 'la garde d’écriture d’une observation (une ligne observée par une AUTRE série ' +
      'n’est jamais réécrite) : de la persistance (app.js, `observerPari`).'
  },
  parisAObserver: {
    'app.js': 'les paris de la séance à observer, pour la file d’écriture : de la persistance ' +
      '(app.js).'
  },
  observationsARenvoyer: {
    'app.js': 'les observations à renvoyer à la reprise d’une séance : de la persistance (app.js).'
  },
  // ── 60-4 — LE PROGRAMME CONSTRUIT (QUESTIONNAIRE-COACH-V2 §5 bis) ─────────
  generer: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : le générateur est un calcul du PROGRAMME, avant toute séance — ' +
      'donc sans plan. L’app compose (`entreeDuProgramme` lit le profil et les faits, `ouvrirApercuProgramme` appelle ' +
      'le générateur une fois) ; elle ne décide ni un exercice, ni une série, ni des reps.'
  },
  neVeuxPas: {
    'app.js': 'ECRAN-SAISIE §7 quindecies.9 (60-4) : « Je n’en veux pas » dans l’aperçu change SEULE la place touchée, ' +
      'par la règle du générateur (`ecarterDansLeProgramme`) ; l’écran n’invente pas le remplaçant.'
  },
  remplacePar: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : « Remplacer » dans l’aperçu — l’exercice choisi prend la place ' +
      '(`poserDansLeProgramme`) avec les séries de la place et les reps que la règle du générateur donne à CET exercice.'
  },
  pourquoi: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : la ligne « pourquoi » d’une carte de l’aperçu est un fait du ' +
      'générateur, recalculé après chaque changement (`lectureDuProgramme`) ; l’écran n’additionne aucune série.'
  },
  relireSemaine: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 ter.4 bis (66B) : l’écran « Le coach relit ta semaine » assemble l’entrée à ' +
      'partir des faits existants (`entreeDeRelecture`), appelle la relecture une fois par ouverture et après chaque ' +
      '« oui » (`relire`), et dessine sa sortie — il ne calcule aucun verdict lui-même.'
  },
  // 66D — l'aperçu de Construis-le-moi assemble le programme (§5 quater.5) : une raison, cinq fonctions.
  completer: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’aperçu de Construis-le-moi assemble le programme ' +
      '(`assemblerLeProgramme`, la seule fonction qui le calcule) ; l’écran ne décide rien lui-même.'
  },
  ranger: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’aperçu de Construis-le-moi assemble le programme ' +
      '(`assemblerLeProgramme`, la seule fonction qui le calcule) ; l’écran ne décide rien lui-même.'
  },
  associer: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’aperçu de Construis-le-moi assemble le programme ' +
      '(`assemblerLeProgramme`, la seule fonction qui le calcule) ; l’écran ne décide rien lui-même.'
  },
  habiller: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’aperçu de Construis-le-moi assemble le programme ' +
      '(`assemblerLeProgramme`, la seule fonction qui le calcule) ; l’écran ne décide rien lui-même.'
  },
  changementsDeLApercu: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’aperçu de Construis-le-moi assemble le programme ' +
      '(`assemblerLeProgramme`, la seule fonction qui le calcule) ; l’écran ne décide rien lui-même.'
  },
  carteCycles: {
    'app.js': 'MOTEUR §9.22 (60-4) : la carte « Passer en cycles » de Saisie lit la règle du générateur ' +
      '(`carteCyclesDuProfil`) : l’objectif, les jours depuis la création, les séances du dossier, un dossier déjà ' +
      'programme, « Juste un carnet », « Pas maintenant » — l’écran ne compte et ne compare rien lui-même.'
  },
  // ── 124 (audit du 16/10/2026, 06 #5) — les décisions du coach hors séance, enfin inscrites ──
  carteFinDeBloc: {
    'app.js': 'MOTEUR §9.22 (53-2) : la carte de fin de bloc vit dans la bibliothèque, HORS séance — donc sans plan ; ' +
      'l’écran lui passe le bloc, son bilan (`Moteur.bilanDuBloc`) et le pari de programme, et la montre telle quelle ' +
      '(app.js, `programmeDuDossierCalcule`) ; « Juste un carnet » la tait avant (`coachSeTait`, I13).'
  },
  ciblesDeTemps: {
    'app.js': 'MOTEUR §9.18 (60-1) : « J’ai peu de temps » vit sur l’écran de la ROUTINE, avant toute séance — donc sans ' +
      'plan ; l’écran passe l’estimation et la durée déclarée, la règle rend les cibles (app.js, `ciblesPlusCourtes`).'
  },
  carteRaccourcir: {
    'app.js': 'MOTEUR §9.18 (51-1) : la carte de « J’ai peu de temps », sur l’écran de la routine, avant toute séance — ' +
      'donc sans plan ; elle met en mots le résultat de `raccourcirRoutine` (app.js, `montrerCarteRaccourci`).'
  },
  feuilleDouleur: {
    'app.js': 'MOTEUR §9.20 (51-3) : la feuille « J’ai mal » est un geste de la personne en séance ; ses phrases sont ' +
      'fixes (`TEXTES_DOULEUR`, le nom de l’exercice), elle ne décide rien — la séance marquée devient neutre ensuite ' +
      'par le plan (`sansPalierRetenues`) (app.js, `rendreFeuilleDeviation`).'
  }
};

// ── LE REGISTRE DES NOTIONS (relevé du 01/10/2026, « un seul coach, un seul câblage ») ──
//
// La garde ci-dessus dit QUI APPELLE une fonction ; le registre dit, NOTION
// PAR NOTION, sa source unique et qui la lit. Une notion du registre :
//   · `module`, `fonction` : sa source — la seule fonction qui la décide ;
//   · `lecteurs` : les fichiers autres que son module qui peuvent l'appeler ;
//   · `par` (facultatif) : les fonctions de son module qui DOIVENT passer par
//     elle (sinon elles la redécident à la main) ;
//   · `parAilleurs` (facultatif) : `{ fichier: [fonctions] }`, les fonctions
//     d'AUTRES fichiers qui doivent passer par elle ;
//   · `interdit` (facultatif) : un littéral qui ne doit plus exister dans son
//     module — la trace d'une décision écrite d'office.
// Chaque PR de la consolidation y a ajouté ses notions ; la PR 7, la
// dernière, le rend complet (les sept PR y figurent, un test le vérifie) et
// bloquant (chaque test ci-dessous exige zéro faute).
const NOTIONS = [
  { notion: 'la feuille « Pourquoi » (ses paragraphes)', pr: 'PR 1',
    module: 'moteur.js', fonction: 'pourquoiConsigne', lecteurs: ['plan.js'],
    raison: 'le plan la rédige sur la consigne qu’il applique (figée, allégée, repli, série de ' +
      'plus) et la pose dans `x.pourquoi` ; l’app la lisait sur une autre, et plantait.' },
  { notion: 'le mot d’ordre de la série restée (« première », « dernière »)', pr: 'PR 1',
    module: 'moteur.js', fonction: 'rangDuReste', lecteurs: [],
    par: ['phraseGrise', 'etatBrutDuPourquoi'],
    interdit: { motif: /(['"])[Tt]a (?:dernière|première) série\1/,
                raison: 'le mot d’ordre écrit d’office (« ta dernière série », le 01/10)' },
    raison: 'l’en-tête et la feuille le lisent sur le rang, par la même fonction : ils ' +
      'disaient « première » et « dernière » pour la même série.' },
  { notion: 'l’exercice fini (toutes ses séries de travail en base)', pr: 'PR 2',
    module: 'seance.js', fonction: 'exerciceFini', lecteurs: ['app.js', 'plan.js'],
    parAilleurs: { 'app.js': ['exerciceFini'], 'plan.js': ['planDeSeance'] },
    raison: 'le plan ouvrait le constat sur ses lignes couvertes, l’app calculait la suite ' +
      'sur toutes les séries de travail : deux définitions, d’accord par accident.' },
  { notion: 'le bloc fini (un superset attend sa fin)', pr: 'PR 2',
    module: 'seance.js', fonction: 'blocFini', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['blocFini'] },
    raison: 'le constat d’un superset attend la fin du bloc ; le bloc se lit sur la même ' +
      'définition de l’exercice fini.' },
  { notion: 'la suite du constat (la consigne de la prochaine séance)', pr: 'PR 2',
    module: 'moteur.js', fonction: 'suiteDExercice', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['suiteDe'] },
    raison: 'une ENTRÉE du plan, calculée avec les options de la consigne ; son cache porte ' +
      'ces options (une zone choisie la recalcule).' },
  { notion: 'le pré-remplissage d’une ligne (ce qui s’écrit en base à la validation d’un champ vide)', pr: 'PR 3',
    module: 'seance.js', fonction: 'fantome', lecteurs: ['plan.js'],
    motif: /(?:\bSeance|\bS|\bSeance\(\)|\bS\(\)|racine\.THSeance)\s*\.\s*fantome\b/g,
    parAilleurs: { 'plan.js': ['preremplir'] },
    raison: 'le plan pose `l.prerempli` sur TOUTES les lignes ; l’app fusionnait la cascade ' +
      'd’avant le plan et le fantôme du plan dans `fantomeDe`.' },
  { notion: 'la grille de la réaction (la ligne proposée, sa fourchette)', pr: 'PR 3',
    module: 'seance.js', fonction: 'planDe', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['preremplir'] },
    raison: 'l’app refaisait la couverture pour savoir quelle ligne est proposée : le plan ' +
      'le dit (`l.proposee`).' },
  { notion: 'les reps de la dégressive (le milieu de « Vise… »)', pr: 'PR 3',
    module: 'plan.js', fonction: 'repsDeLaDegressive', lecteurs: [],
    par: ['preremplir'],
    raison: 'MOTEUR §9.15.3 (delta 49-38) : la phrase « Vise 6 à 8 » et la ligne disent le ' +
      'même chiffre ; la routine et la fois d’avant ne décident plus des reps de la dégressive.' },
  { notion: 'la place d’une série ajoutée (avant la dégressive qui attend)', pr: 'PR 4',
    module: 'seance.js', fonction: 'placeDeLaSerie', lecteurs: [],
    par: ['ajouterSerie'],
    raison: '« + Série » après une dégressive posait une série de travail DERRIÈRE elle ; la ' +
      'ligne de la série de plus passe par le même geste.' },
  { notion: 'les lignes allégées d’une séance (la semaine allégée appliquée)', pr: 'PR 4',
    module: 'plan.js', fonction: 'lignesARetirer', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['appliquerAllegee', 'allegeePourAjout'] },
    raison: 'à l’ouverture, à l’acceptation ET à l’ajout d’un exercice, la même règle : un ' +
      'exercice ajouté en pleine semaine allégée gardait toutes ses lignes de départ.' },
  { notion: 'l’exercice qu’on vient d’ajouter (absent avant, rien de fait)', pr: 'PR 4',
    module: 'app.js', fonction: 'exerciceAjoute', lecteurs: [],
    par: ['ligneDePlusPourAjout', 'allegeePourAjout'],
    raison: 'la ligne de plus et la semaine allégée s’appliquent au seul exercice ajouté : ' +
      'une définition, sinon l’une toucherait un exercice que l’autre épargne.' },
  { notion: 'la routine figée avec la consigne (héritée d’un remplacement en semaine allégée)', pr: 'PR 4',
    module: 'app.js', fonction: 'routineAFiger', lecteurs: [],
    par: ['consigneDe'],
    raison: 'décision du 02/10/2026 : l’allègement s’applique une fois, sur la routine de ' +
      'l’exercice remplacé ; figer la routine aux lignes déjà allégées allégeait deux fois.' },
  { notion: 'la dernière séance d’un exercice (la meilleure série du jour)', pr: 'PR 5',
    module: 'modele.js', fonction: 'meilleureSerieDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['sommaireExercices', 'derniereSeanceDe'] },
    raison: 'décision du 02/10/2026 : la page d’exercice affichait le palier, Progression la ' +
      'meilleure série — deux nombres pour le même exercice et la même date, à un tap.' },
  { notion: 'le record de charge (la ligne la plus lourde de la table)', pr: 'PR 5',
    module: 'modele.js', fonction: 'recordDeLaTable', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreExercice'] },
    raison: 'décision du 02/10/2026 : un record est un fait, exploration comprise ; la fiche ' +
      'l’écartait et pouvait s’afficher sous la ligne « 1 rep » de la table.' },
  { notion: 'la consigne d’un exercice hors de l’en-tête (étiquette, zone déduite, cible)', pr: 'PR 5',
    module: 'app.js', fonction: 'consigneDeLExercice', lecteurs: [],
    par: ['rendreExercice', 'deduiteDe'],
    raison: 'la page d’exercice recalculait sa consigne avec cinq options de moins ; le menu ' +
      'des zones n’avait pas de zone déduite sans séance.' },
  { notion: 'le palier brut d’une séance (l’analyse du moteur de palier)', pr: 'PR 5',
    module: 'palier.js', fonction: 'analyser', lecteurs: ['modele.js', 'moteur.js'],
    motif: /(?:\bPalier|\bpalier|THPalier)\s*(?:\(\))?\s*\.\s*analyser\b/g,
    raison: 'aucun écran ne lit le palier brut : les faits passent par `Modele`, les mots du ' +
      'coach par la consigne. La page et Progression l’appelaient chacune à part.' },
  { notion: 'la série de travail (le type, `travail` quand il manque)', pr: 'PR 6',
    module: 'modele.js', fonction: 'estTravail', lecteurs: ['seance.js', 'semaine.js', 'plan.js', 'app.js', 'bilan.js', 'faits.js', 'routines.js', 'jeu.js', 'generateur.js', 'reserve.js', 'bilans.js', 'deraille.js', 'objectif.js', 'moteur.js'],
    motif: /\.\s*estTravail\s*\(/g,
    par: ['exercicesFaits', 'tableParReps', 'construireBlocs'],
    interditAilleurs: { motif: /type_serie\s*[!=]==?\s*(['"])travail\1|typeDe\([^()]*\)\s*[!=]==?\s*(['"])travail\2|\|\|\s*(['"])travail\3\s*\)\s*[!=]==?/,
      raison: 'une comparaison à « travail » écrite en dur : passer par `Modele.estTravail` (ou `typeDe`)' },
    raison: 'cinq définitions : une série sans type était du travail pour le moteur et le plan, ' +
      'pas pour les écrans ; la base dit `travail` par défaut. 78 : la question de réserve lit l’effort de la ' +
      'dernière série de TRAVAIL de chaque séance passée (`reserve.js`, `passeDeReserve`). 99 : la semaine qui déraille ' +
      'compte les séries de travail que prévoit une routine (`deraille.js`). 113 : le pari au plafond de la salle s’observe ' +
      'sur les séries de travail des séances de l’exercice (`moteur.js`, `observationPlafond`). 109 : l’objectif ne lit que des séries de ' +
      'travail (ses records, la série qui l’atteint, `objectif.js`).' },
  { notion: 'le compte des séries de travail (la règle du volume)', pr: 'PR 6',
    module: 'semaine.js', fonction: 'compteSeriesTravail', lecteurs: ['modele.js', 'seance.js', 'profil.js', 'routines.js', 'app.js', 'bilan.js', 'faits.js', 'bilans.js'],
    parAilleurs: { 'modele.js': ['resumerSeance', 'construireBlocs'], 'seance.js': ['compter'], 'bilan.js': ['bilanDuMois'],
                   'profil.js': ['statsDe'], 'app.js': ['rendreExercice'] },
    raison: 'décision du 02/10/2026 : la carte, la barre, la page, le détail (« de travail »), le ' +
      'bandeau, la feuille de fin et le profil disent le même nombre ; le tapis n’y entre pas. 71 : le récap compte ' +
      'les exercices faits (au moins une série de travail) par la même règle — 119 : par `exercicesDeMusculation`, ' +
      'qui la lit (`estSerieDeMusculation`).' },
  // 119 (audit du 16/10/2026, F9) — « exercice fait » : UNE définition PAR USAGE, chacune ici. Le journal (ci-dessous,
  // cardio compris) ; le récap (`exercicesDeMusculation`, au moins une série de musculation) ; le classement d'un
  // bilan (`seMesureEnReps`, un exercice mesuré en reps).
  { notion: 'l’exercice fait du récap de fin de séance (au moins une série de musculation ; le cardio se dit à part)', pr: '119-U1',
    module: 'semaine.js', fonction: 'exercicesDeMusculation', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['recapDeLaSeance'] },
    raison: 'audit du 16/10/2026 (F9) : le récap excluait le tapis par un filtre écrit à la main, à côté de ' +
      '`exercicesFaits` qui le compte ; deux définitions sans nom. ECRAN §7 septies.4 bis le dit désormais.' },
  { notion: 'l’exercice classé par un bilan (l’exercice du mois, de la saison, de l’année : mesuré en reps)', pr: '119-U1',
    module: 'modele.js', fonction: 'seMesureEnReps', lecteurs: ['bilans.js'],
    parAilleurs: { 'bilans.js': ['bilanDeLaPeriode'] },
    raison: 'audit du 16/10/2026 (F1, F9) : le tapis gagnait l’exercice du mois (« 0 reps ») ; seuls `charge_reps` ' +
      'et `reps` se classent, par le chiffre affiché (BILANS-V1, 16/10).' },
  { notion: 'l’exercice fait (au moins une série de travail, cardio compris)', pr: 'PR 6',
    module: 'modele.js', fonction: 'exercicesFaits', lecteurs: ['app.js', 'faits.js'],
    // 64A : l'APPEL, pas le champ — `entree.exercicesFaits` (JEU-V1 §8) est un nombre que le jeu lit, pas un
    // second calcul (même forme que `estTravail`).
    motif: /\.\s*exercicesFaits\s*\(/g,
    par: ['resumerSeance'],
    parAilleurs: { 'app.js': ['sommaireExercices'], 'faits.js': ['datesDesExercices'] },
    raison: 'décision du 02/10/2026 : Progression, le profil et la carte comptaient les exercices ' +
      'de trois façons (une ligne de chauffe suffisait au profil).' },
  { notion: 'les séries hors chauffe (« monte en charge », §5.1) — PAS la série de travail', pr: 'PR 7',
    module: 'palier.js', fonction: 'seriesHorsChauffe', lecteurs: [],
    par: ['etatsExercices'],
    raison: 'le travail, les dégressives et les échecs : le compte du Python qui a produit le §5.1. ' +
      'Une autre notion que `estTravail` ; elle portait un nom (`trav`) qui la faisait passer pour elle.' },
  { notion: 'le formateur des nombres et des dates (un seul)', pr: 'PR 7',
    module: 'modele.js', fonction: 'nombreSigne', lecteurs: ['rendu.js', 'app.js', 'profil.js', 'questionnaire.js', 'bilan.js'],
    motif: /\.\s*nombreSigne\s*\(/g,
    interditAilleurs: {
      // 124 (audit du 16/10/2026, 06 #15) — et les jours comme les mois : une liste de jours (« lundi », « mardi » ;
      // « dimanche », « lundi » ; « Lun », « Mar » ; « L », « M », « M ») ou leur alternative dans un motif.
      motif: /\.replace\(\s*(['"])\.\1\s*,\s*(['"]),\2\s*\)|toLocale(?:Date|Time)?String\s*\(|\\u2212|(['"])janv\.?\3|(['"])janvier\4|['"][Ll]undi['"]\s*,\s*['"][Mm]ardi['"]|['"][Dd]imanche['"]\s*,\s*['"][Ll]undi['"]|['"]Lun\.?['"]\s*,\s*['"]Mar\.?['"]|['"]L['"]\s*,\s*['"]M['"]\s*,\s*['"]M['"]|[Ll]undi\|[Mm]ardi/,
      raison: 'une virgule décimale, une date `toLocale…`, un signe moins, une liste de mois ou de jours écrits hors du ' +
        'formateur (`modele.js`)' },
    raison: '`rendu.nombreFr`, `MOIS`, `mmss`, `dateCourte`, `nombreGroupe`, `poids.arrondi`, les mois du ' +
      'calendrier et l’horodatage du rejeu en étaient des copies, chacune avec sa règle.' },
  { notion: 'l’arrondi (symétrique) des nombres affichés', pr: 'PR 7',
    module: 'modele.js', fonction: 'arrondi', lecteurs: ['poids.js', 'generateur.js'],
    motif: /\.\s*arrondi\s*\(/g,
    par: ['nombreTexte'],
    raison: 'le formateur arrondissait −11,5 vers −11 et +11,5 vers +12 ; le poids, symétriquement. Un seul arrondi. ' +
      '66A : la jauge d’une barre de la relecture (§5 ter.3) est cet arrondi, à 2 décimales.' },
  // Après la consolidation, les notions d'un chantier portent son geste.
  { notion: 'la lecture d’un nombre tapé (l’inverse du formateur, tous les signes moins)', pr: 'correctif 03/10/2026',
    module: 'modele.js', fonction: 'lireNombre', lecteurs: ['seance.js', 'routines.js', 'app.js', 'importhevy.js', 'objectif.js'],
    motif: /\.\s*lireNombre\s*\(/g,
    parAilleurs: { 'seance.js': ['nombreOuNul'], 'routines.js': ['decimalOuNul'] },
    interditAilleurs: { motif: /\.replace\(\s*(['"]),\1\s*,\s*(['"])\.\2\s*\)/,
                        raison: 'une virgule décimale relue hors de `lireNombre` : une seconde lecture des nombres' },
    raison: 'le champ réaffiche une assistance avec le vrai signe moins (U+2212) que la copie de ' +
      '`seance.js` ne relisait pas : retoucher les reps d’une série à « −25 » effaçait sa charge. ' +
      '69 : les nombres que Hevy écrit (« 31,5 kg », « 1.17 » km) se lisent ici aussi (`importhevy.js`). 109 : la ' +
      'charge et les reps d’un objectif tapées dans sa feuille (`objectif.js`, `lireSaisie`).' },
  { notion: 'les frères d’un exercice (même `mouvement` au catalogue, MOTEUR §13.6)', pr: '49-U20',
    module: 'modele.js', fonction: 'freresDe', lecteurs: ['app.js', 'seance.js', 'faits.js', 'generateur.js', 'parcours.js', 'deraille.js'],
    parAilleurs: { 'app.js': ['freresPourLeMoteur', 'faitsDesFreres'], 'seance.js': ['freresProposes'],
                   'faits.js': ['barresDuBilan'], 'generateur.js': ['familleDeBarre'], 'parcours.js': ['parcours'] },
    interditAilleurs: { motif: /\.\s*mouvement\b|\[\s*(['"`])mouvement\1\s*\]/,
                        raison: '`mouvement` lu ailleurs que dans `freresDe` : une seconde définition des frères' },
    raison: 'les frères sont les exercices de même `mouvement` — pas de même `famille`, plus large ; ' +
      'une seule lecture de la colonne, sinon deux écrans auraient deux listes de frères. 66A : les variantes à la ' +
      'barre du bilan (QUESTIONNAIRE §5 ter.2) sont ses frères à la barre — `faits.js` (le fait) et `generateur.js` ' +
      '(la relecture : le lourd en premier, la poussée, le squat à déplacer) les lisent ici, sans relire `mouvement`. ' +
      '75 : le relais d’un exercice moins pratiqué (« Ton parcours », ECRAN-SAISIE §7 bis.14 ter) est un frère ou ' +
      'un exercice de la même famille (`parcours.js`).' },
  // 67B — les libellés des équipements : une table, à côté de la liste du profil.
  { notion: 'le libellé d’un équipement (« Machine », « Haltère »… ; ECRAN-SAISIE §7 quindecies.10)', pr: '67-U2',
    module: 'profil.js', fonction: 'libelleEquipement', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['descriptionExo'] },
    interditAilleurs: { motif: /['"`]Sans matériel['"`]/,
                        raison: 'un libellé d’équipement écrit ailleurs que dans `LIBELLES_EQUIPEMENT` : une seconde table' },
    raison: 'ES §7 quindecies.10 (67B) : le filtre « matériel » du catalogue et la sous-ligne de chaque résultat lisent la ' +
      'MÊME table, à côté de `EQUIPEMENTS` ; une valeur inconnue se rend telle quelle.' },
  // 67A — la famille : une colonne, une lecture, un seul usage (la feuille « Remplacer »).
  { notion: 'la même famille d’un exercice (même `schema_mouvement` au catalogue, MOTEUR §13.6 bis)', pr: '67-U1',
    module: 'modele.js', fonction: 'cousinsDe', lecteurs: ['app.js', 'parcours.js'],
    parAilleurs: { 'app.js': ['cousinsDe'], 'parcours.js': ['parcours'] },
    // 75 — un second lecteur, avec sa raison (décidé le 11/10/2026).
    raisonsDesLecteurs: { 'parcours.js': 'le relais d’un exercice moins pratiqué (75)' },
    interditAilleurs: { motif: /\.\s*schema_mouvement\b|\[\s*(['"`])schema_mouvement\1\s*\]/,
                        raison: '`schema_mouvement` lu ailleurs que dans `cousinsDe` : une famille hors de « Remplacer »' },
    raison: 'MOTEUR §13.6 bis (67A) : la famille ne sert QU’À la feuille « Remplacer », sous les frères ; aucun calcul ' +
      '(variantes à la barre, barre lourde, supersets, frère qui progresse) ne la lit — ils lisent `freresDe`. ' +
      '75 : et au relais d’un exercice moins pratiqué de « Ton parcours » (`parcours.js`), qui dit ce qui a pris sa ' +
      'place — jamais une charge, jamais une consigne.' },
  { notion: 'la version lestée d’un exercice libre (`parent` au catalogue, MOTEUR §9.17)', pr: '50-U1',
    module: 'modele.js', fonction: 'lesteDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne', 'entreesDuPlan'] },
    interditAilleurs: { motif: /\.\s*parent\b|\[\s*(['"`])parent\1\s*\]/,
                        raison: '`parent` lu ailleurs que dans `lesteDe` et `parentDe` : une seconde définition du lesté' },
    raison: '« J’ai du lest » met la version lestée à la place de l’exercice libre : la carte ne ' +
      'promet que ce que le catalogue sait livrer, et une seule lecture de la colonne le dit.' },
  { notion: 'l’exercice libre d’une version lestée (le départ à 2,5 kg, MOTEUR §8.4)', pr: '50-U1',
    module: 'modele.js', fonction: 'parentDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne'] },
    raison: 'la première fois qu’un exercice lesté se fait, il part de la zone de l’exercice libre ; ' +
      'l’app donne au moteur cet exercice, par la même lecture du catalogue que la carte.' },
  { notion: 'le matériel effectif d’un exercice (une charge ajoutée est du lest, cran 2,5 kg)', pr: '50-U1',
    module: 'moteur.js', fonction: 'equipementEffectif', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne', 'entreesDuPlan'] },
    raison: 'le catalogue dit `equipement` ; la consigne, les chauffes et la dégressive lisent le ' +
      'MATÉRIEL EFFECTIF : sans lui, le lesté prenait le cran de la salle ou celui d’une barre.' },
  { notion: 'l’aide (tapée en positif, rangée en négatif)', pr: '50-U1',
    module: 'modele.js', fonction: 'rangerAide', lecteurs: ['rendu.js', 'app.js'],
    parAilleurs: { 'app.js': ['validerSerie'] },
    interditAilleurs: { motif: /-\s*Math\.abs\s*\(/,
                        raison: 'un signe d’aide posé à la main hors de `rangerAide` : une seconde règle du signe' },
    raison: 'MOTEUR §9.17 : le signe d’une aide se pose à UN endroit — la saisie et le pré-remplissage ' +
      'que la validation écrit. Une aide qui entre en positif se lit comme une charge.' },
  { notion: 'le frère qui progresse pendant le blocage (MOTEUR §13.6)', pr: '49-U20',
    module: 'moteur.js', fonction: 'frereQuiProgresse', lecteurs: [],
    par: ['frereDuBlocage'],
    raison: 'la règle (un progrès après le dernier progrès de l’exercice bloqué, un meilleur en hausse, ' +
      'la même zone pour la flèche) se décide une fois ; le plan ne lit que son résultat, figé avec la consigne.' },
  { notion: 'la durée estimée d’une routine (MOTEUR §9.18)', pr: '51-U1',
    // generateur.js (66D) : `associer` estime chaque séance par la même fonction — le superset tant qu'elle
    // dépasse la cible (QUESTIONNAIRE-COACH-V2 §5 quater.4 bis).
    module: 'moteur.js', fonction: 'dureeEstimee', lecteurs: ['app.js', 'generateur.js', 'deraille.js'],
    par: ['raccourcirRoutine'],
    parAilleurs: { 'app.js': ['tempsDeLaRoutine'], 'generateur.js': ['associer'] },
    raison: 'une seule fonction pour la durée affichée sur la routine, la durée allégée et la carte ; ' +
      'ses constantes sont des valeurs par défaut, définies une fois (`DUREE_PAR_DEFAUT`). 99 : la semaine qui déraille ' +
      'n’ajoute un exercice à une séance que dans la durée visée, par cette même estimation (`deraille.js`).' },
  { notion: 'le raccourci d’une routine (« J’ai peu de temps », MOTEUR §9.18)', pr: '51-U1',
    module: 'moteur.js', fonction: 'raccourcirRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['montrerCarteRaccourci'] },
    raison: 'le coach coupe les dernières séries, pas les muscles : la carte et la séance raccourcie ' +
      'lisent le même résultat, jamais une seconde règle à l’écran.' },
  { notion: 'la dernière séance d’un exercice, sur sa page et sous un frère de « Machine prise »', pr: '51-U2',
    module: 'app.js', fonction: 'derniereSeanceDe', lecteurs: [],
    par: ['rendreExercice', 'faitsDesFreres'],
    raison: 'MOTEUR §9.19 : le fait sous un frère est « Dernière séance » de sa page d’exercice, par la ' +
      'même fonction — un second calcul dirait un autre chiffre que la page, à un tap.' },
  { notion: '« Plus tard » de « Machine prise » (le bloc passe après le suivant, MOTEUR §9.19)', pr: '51-U2',
    module: 'seance.js', fonction: 'plusTard', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['vueMachinePrise'] },
    raison: 'où va le bloc, et quand « Plus tard » est absent (dernier bloc, exercice commencé), se ' +
      'décide une fois ; l’écran déplace par `reordonnerBlocs`, sans toucher à la consigne.' },
  { notion: 'les frères proposés par « Machine prise » (et leur ordre, MOTEUR §9.19)', pr: '51-U2',
    module: 'seance.js', fonction: 'freresProposes', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['freresDe'] },
    raison: 'les frères pas encore dans la séance d’abord, l’historique le plus récent, puis par nom ; ' +
      'un frère déjà présent à la fin — une règle, que la feuille affiche sans la refaire. 60-4 : UNE liste pour ' +
      '« Machine prise », « Remplacer » (l’éditeur et l’aperçu du programme) et « Je n’en veux pas » (`freresDe`).' },
  { notion: 'la séance neutre (§7.6), déduite ou DÉCLARÉE par la marque « douleur » (MOTEUR §9.20)', pr: '51-U3',
    module: 'moteur.js', fonction: 'sansPalierRetenues', lecteurs: [],
    par: ['contratDe'],
    raison: 'une séance marquée ne vote pas pour la charge et reste une présence pour le rythme : ' +
      'le même chemin que la séance sans travail dans la zone, pas une seconde notion.' },
  { notion: 'la séance-exercice douloureuse (une série marquée, dans le contrat)', pr: '51-U3',
    module: 'moteur.js', fonction: 'seanceDouloureuse', lecteurs: [],
    par: ['contratDe'],
    raison: 'MOTEUR §9.20 : une seule série marquée rend la séance-exercice douloureuse ; le contrat ' +
      'le lit une fois, et `sansPalierRetenues` en fait une séance neutre.' },
  { notion: 'l’occurrence marquée « douleur » en séance (sans coach, I33)', pr: '51-U3',
    module: 'seance.js', fonction: 'occurrenceDouloureuse', lecteurs: ['plan.js'],
    par: ['lignes'],
    parAilleurs: { 'plan.js': ['planDeSeance'] },
    raison: 'le plan (sans coach), l’envoi (`sets.douleur` sur chaque série) et l’écran lisent la même ' +
      'marque : posée sur l’occurrence, tenue de ses séries quand la séance est relue.' },
  { notion: 'la reprise après une séance douloureuse (la carte, la zone suivante, le repli)', pr: '51-U3',
    module: 'moteur.js', fonction: 'reprisePour', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'MOTEUR §9.20 : la carte se décide sur la dernière séance, figée avec la consigne ; « Plus ' +
      'léger » passe par la zone suivante et le report (§9.10, 53-1), sinon les replis existants, ' +
      'jamais une charge à part.' },
  { notion: 'le repli de la reprise longue (§9.9 : le cran en dessous, 10 % au plus)', pr: '51-U3',
    module: 'moteur.js', fonction: 'repliDeReprise', lecteurs: [],
    par: ['consigneFigee', 'repliDeLaRepriseLongue'],
    raison: '51-3 bis : « Plus léger » le réutilise quand le repli de §14.5 n’existe pas — la règle de ' +
      '§9.9 appelée par sa fonction, jamais recopiée (une charge de repli calculée à part serait une seconde règle).' },
  { notion: 'la structure d’une séance en routine (« En faire une routine », ECRAN-SAISIE §7 quindecies.4)', pr: '52-U1',
    module: 'routines.js', fonction: 'routineDepuisSeance', lecteurs: ['app.js'],
    par: ['routineDeduite'],
    parAilleurs: { 'app.js': ['structureDeLaSeance'] },
    raison: 'la nouvelle routine et la mise à jour lisent la même structure (blocs du détail, supersets, ' +
      'reps repères, repos et leur origine, jamais une charge) : un second découpage dirait une autre routine.' },
  { notion: 'un nom libre de routine (« (2) », « (copie) », l’index `lower(btrim(nom))`)', pr: '52-U1',
    module: 'routines.js', fonction: 'nomLibre', lecteurs: ['app.js'],
    par: ['routineDepuisSeance'],
    parAilleurs: { 'app.js': ['demanderDuplication'] },
    raison: 'une seule fonction pour le nom d’une routine créée depuis une séance et d’une copie : ' +
      'la comparaison est celle de l’index de la base, sinon l’écriture se ferait refuser.' },
  { notion: 'la copie d’une routine (« Dupliquer », par le chemin de création)', pr: '52-U1',
    module: 'routines.js', fonction: 'copieDeRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['dupliquerRoutine'] },
    raison: 'une routine NEUVE que `enregistrer` crée comme les autres (rang suivant, annulation) ; ' +
      'aucun identifiant partagé : l’originale ne peut pas être touchée.' },
  { notion: 'un polyarticulaire (au moins 3 muscles) : le raccourci et les repos par défaut', pr: '52-U1',
    module: 'moteur.js', fonction: 'estPolyarticulaire', lecteurs: ['routines.js', 'generateur.js', 'profil.js', 'plan.js', 'app.js'],
    par: ['raccourcirRoutine'],
    parAilleurs: { 'routines.js': ['routineDepuisSeance'], 'generateur.js': ['relecture'], 'profil.js': ['avecIsolation'],
                   'plan.js': ['polyarticulaireDe'], 'app.js': ['degressiveDeDemo'] },
    raison: 'les repos par défaut d’« En faire une routine » sont les classes de « J’ai peu de temps » : ' +
      'une définition, lue aux deux endroits. 66A : la relecture de la semaine (§5 ter.4) la lit aussi — l’isolation ' +
      'avant la barre, et les séries que la sèche peut retirer (jamais un polyarticulaire). 108 (MOTEUR §10 bis, ' +
      '16/10/2026) : la salle d’un exercice d’isolation, dont la fourchette s’étend à 15 reps à la plus lourde. 111 : la dégressive ' +
      'proposée (MOTEUR §14), en isolation seulement — le plan la lit (`polyarticulaireDe`), et la démonstration ' +
      '`?escalier=degressive` de l’app y choisit son exercice (`degressiveDeDemo`).' },
  { notion: 'le débutant (« Moins d’un an » d’ancienneté)', pr: '111-U1',
    module: 'profil.js', fonction: 'estDebutant', lecteurs: ['app.js', 'generateur.js'],
    parAilleurs: { 'app.js': ['entreeDeLaSemaine', 'debutantDeLaSeance'], 'generateur.js': ['generer', 'neVeuxPas'] },
    interditAilleurs: { motif: /(['"])moins_1_an\1\s*[;)]|===\s*(['"])moins_1_an\2/,
      raison: 'le débutant écrit en dur (« moins_1_an » comparé ou posé seul) : passer par `Profil.estDebutant`' },
    raison: 'la semaine qui déraille et la dégressive proposée (MOTEUR §14, jamais pour un débutant) lisent la même ' +
      'règle ; 124 (audit du 16/10/2026, 01 #14) : le générateur (60-6) la lit aussi — sa copie est retirée.' },
  { notion: 'les écarts d’une séance avec une routine (§6.3, et « Mettre à jour » depuis une séance)', pr: '52-U1',
    module: 'seance.js', fonction: 'ecartsRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreFeuilleFin', 'apercuMiseAJour'] },
    raison: '« Mettre à jour une routine » passe par la question de fin de séance — les mêmes écarts, le ' +
      'même aperçu, la même écriture —, pas par un second mécanisme (ECRAN-SAISIE §7 quindecies.4).' },
  { notion: 'l’écriture d’une routine mise à jour depuis une séance (la file, comme la fin de séance)', pr: '52-U1',
    module: 'app.js', fonction: 'reporterSurRoutine', lecteurs: [],
    par: ['terminerSeance', 'apercuMiseAJour'],
    raison: 'une intention posée dans la file, recalculée à la vidange : la fin de séance et « Mettre à ' +
      'jour » écrivent par le même chemin, jamais par l’éditeur.' },
  { notion: 'un exercice jamais fait (la charge de départ ne sert que là, MOTEUR §9.21)', pr: '52-U1',
    module: 'app.js', fonction: 'jamaisFait', lecteurs: [],
    par: ['chargeDansLEditeur', 'chargeDeDepartDe'],
    raison: 'l’éditeur (« Charge de départ » ou « le coach décide ») et la charge passée au coach lisent la ' +
      'même définition : sans elle, l’éditeur promettrait un départ que le coach ignore.' },
  { notion: 'la consigne de la charge de départ, la première fois (MOTEUR §9.21)', pr: '52-U1',
    module: 'moteur.js', fonction: 'departDeRoutine', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'seulement sur « Première fois ici », en charge × reps : la routine donne un point de départ, ' +
      'et dès qu’il y a des données le coach décide seul.' },
  { notion: 'le report de charge au changement de zone (MOTEUR §9.10 : la plus basse de la charge tenue et de l’estimation, au bas de la zone)', pr: '53-U1',
    module: 'moteur.js', fonction: 'reportDeZone', lecteurs: [],
    par: ['reportSur'],
    interditAilleurs: { motif: /\/\s*\(?\s*30\b|\bREPORT_EPLEY\b/,
                        raison: 'une estimation (« n/30 ») écrite hors du moteur : un second calcul du report',
                        // 75 — une exception nommée, avec sa raison (la garde vérifie qu'elle sert encore).
                        sauf: { 'parcours.js': 'le k au bord de la courbe personnelle de « Ton parcours » (ECRAN-SAISIE ' +
                          '§7 bis.14 ter) : 1/30, fixé par la spec, ne sert qu’à placer un exercice sur SA courbe — jamais ' +
                          'une charge, jamais un report, rien d’affiché' } },
    raison: 'une seule règle pour tout changement de zone — la correction à l’étiquette, la reprise ' +
      '« Plus léger », demain un bloc : l’estimation reste en coulisse, seule la charge arrondie en sort.' },
  { notion: 'le report sur le contrat d’un exercice (ses séances non neutres, le cran du moteur)', pr: '53-U1',
    module: 'moteur.js', fonction: 'reportSur', lecteurs: [],
    par: ['consigneNouvelleZone', 'reprisePour'],
    raison: 'la consigne d’une nouvelle zone et « Plus léger » lisent les mêmes séances et le même cran ' +
      '(`chargeVoisine`) : la charge proposée à la carte est celle que la consigne pose ensuite (I35).' },
  { notion: 'la consigne d’une nouvelle zone (l’état `nouvelle_zone`)', pr: '53-U1',
    module: 'moteur.js', fonction: 'consigneNouvelleZone', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'une étape de la consigne, une seule fois, comme les départs : tout ce qui suit (le plan, ' +
      'la réaction, la suite, le repli) lit la consigne reportée, jamais une charge à part.' },
  // 53-2 (MOTEUR §9.22) — les programmes à cycles : une fonction par notion.
  { notion: 'la semaine du bloc (« semaine k sur N », au calendrier, jamais en séances)', pr: '53-U2',
    module: 'moteur.js', fonction: 'semaineDuBloc', lecteurs: [],
    par: ['badgeDuBloc', 'exercicesEnBloc'],
    raison: 'le badge et « Changer de schéma » lisent la même semaine : le coach ne commente pas l’assiduité.' },
  { notion: 'le début de la décharge planifiée (la dernière semaine du bloc)', pr: '53-U2',
    module: 'moteur.js', fonction: 'debutDecharge', lecteurs: [],
    par: ['dechargePlanifiee', 'carteAllegeeAutorisee', 'dechargeDuJour', 'periodesDecharge'],
    raison: 'la décharge, la carte qui se tait et les périodes du compteur partent du même jour.' },
  { notion: 'la décharge planifiée a lieu (pas de cumul avec une semaine allégée, 14 jours)', pr: '53-U2',
    module: 'moteur.js', fonction: 'dechargePlanifiee', lecteurs: [],
    par: ['dechargeDuJour', 'periodesDecharge'],
    raison: 'MOTEUR §14.4 : une réduction s’applique une fois — le plan (la décharge du jour) et le compteur ' +
      '(ses périodes) le décident par la même règle.' },
  { notion: 'la décharge planifiée du jour (la semaine allégée posée par le programme, sans carte)', pr: '53-U2',
    module: 'moteur.js', fonction: 'dechargeDuJour', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['escalierDuPlan'], 'app.js': ['semaineAllegeeEnCours'] },
    raison: 'le plan (la séance allégée, le bandeau) et la bibliothèque (la durée allégée) disent la même semaine.' },
  { notion: 'la carte d’une semaine allégée se tait autour d’une décharge planifiée', pr: '53-U2',
    module: 'moteur.js', fonction: 'carteAllegeeAutorisee', lecteurs: [],
    par: ['carteAutorisee'],
    raison: 'la mémoire de l’escalier (`carteAutorisee`) est la seule porte de la carte : la règle y entre, une fois.' },
  { notion: 'les lignes de zone d’un bloc (une par exercice, datées du début, origine « bloc »)', pr: '53-U2',
    module: 'moteur.js', fonction: 'zonesPosees', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['creerBloc'] },
    raison: 'MOTEUR §9.1.2 amendé : la déclaration la plus récente l’emporte — un bloc écrit des lignes datées, ' +
      'lues par `zoneEnVigueur` et `correctionAu` comme les autres ; jamais un troisième étage.' },
  { notion: 'la ligne de zone en vigueur à un instant (la déclaration la plus récente)', pr: '53-U2',
    module: 'moteur.js', fonction: 'ligneDeZoneAu', lecteurs: ['app.js'],
    par: ['zoneEnVigueur', 'correctionAu', 'lignesDArret'],
    parAilleurs: { 'app.js': ['ligneDeZoneDe'] },
    raison: 'une seule lecture des lignes de zone : la séance d’aujourd’hui, une séance passée, et l’arrêt d’un ' +
      'programme (`lignesDArret`, 53-2 ter) lisent la même ligne.' },
  { notion: 'la consigne d’une séance passée, lue à sa fin (la zone qu’elle a vraiment eue)', pr: '54-U1',
    module: 'moteur.js', fonction: 'consigneDeLaSeance', lecteurs: [],
    par: ['zoneDeLaSeance', 'compteurDe'],
    interdit: { motif: /correctionAu\([^)]*\.debut\b/,
                raison: 'la zone d’une séance passée relue à son début (une zone changée pendant la séance ' +
                  'n’y serait pas, 54-0 E)' },
    raison: 'MOTEUR §12.2 bis : une zone changée à l’étiquette pendant la séance est celle de la séance — ' +
      'le compteur et la zone d’une séance la lisent au même instant, sa fin.' },
  { notion: 'la zone d’une séance passée (report, compteur, repli de l’escalier)', pr: '54-U1',
    module: 'moteur.js', fonction: 'zoneDeLaSeance', lecteurs: [],
    par: ['zoneDeLaDerniere', 'consigneDExercice'],
    raison: 'le report de §9.10 et le repli de §14.5 lisaient la zone au début, le compteur à la fin : ' +
      'trois lectures, une règle à deux endroits — une seule fonction désormais.' },
  { notion: 'le bloc suivant (une règle fixe : Mix ↔ Lourd, mêmes durée et exercices, une décharge)', pr: '53-U2',
    module: 'moteur.js', fonction: 'blocSuivant', lecteurs: ['app.js'],
    par: ['carteFinDeBloc'],
    parAilleurs: { 'app.js': ['ouvrirProgramme', 'commencerBlocSuivant'] },
    raison: 'MOTEUR §9.22 : jamais déduit du bloc passé (§20.1) — la carte, « Commencer » et « Ajuster » proposent ' +
      'le même bloc.' },
  { notion: 'les exercices d’un bloc par défaut (les barres polyarticulaires du dossier)', pr: '53-U2',
    module: 'moteur.js', fonction: 'exercicesParDefaut', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirProgramme'] },
    raison: 'une barre, au moins 3 muscles (`estPolyarticulaire`) : la définition du raccourci, lue une fois.' },
  { notion: 'le bilan d’un bloc (première et dernière charge de travail, paris tenus, hors décharge)', pr: '53-U2',
    module: 'moteur.js', fonction: 'bilanDuBloc', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['bilanDe'] },
    raison: 'la carte de fin de bloc et l’observation du pari de programme lisent le même bilan.' },
  { notion: '« Plus léger, plus de reps » appliqué à la consigne (le report de §9.10, sinon le repli de §14.5 ou de §9.9)', pr: '51-U3',
    module: 'moteur.js', fonction: 'consignePlusLegere', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['planDeSeance'] },
    raison: 'le plan n’applique « Plus léger » que par elle : la ligne du repli choisi, sans ligne haute, ' +
      'et le repli d’escalier par `consigneRepli` (qu’I22 vérifie).' },
  { notion: 'la zone suivante en reps (« Plus léger, plus de reps »)', pr: '51-U3',
    module: 'moteur.js', fonction: 'zonePlusDeReps', lecteurs: [],
    par: ['reprisePour'],
    raison: 'lourd → mix → hypertrophie → volume → séries longues, dans l’ordre de la table des ' +
      'zones : une définition, que la carte et la correction de zone lisent.' },
  { notion: 'les séries par muscle (un principal la série entière, un secondaire pour moitié, un stabilisateur pour un quart)', pr: '55-U1',
    module: 'semaine.js', fonction: 'volumeParMuscle', lecteurs: ['bilan.js', 'faits.js', 'bilans.js', 'deraille.js'],
    par: ['semainesDeVolume', 'volumeParZone'],
    parAilleurs: { 'bilan.js': ['bilanDuMois'], 'faits.js': ['recapDeLaSeance'] },
    raison: 'REGLE-VOLUME et MOTEUR §9.23 (H2, #371) : le bloc Volume et le bilan du mois comptent les séries ' +
      'par muscle par la même fonction — deux définitions d’une même grandeur, c’est ce que UN-SEUL-FIL interdit. ' +
      '71 : le récap de fin de séance aussi (ECRAN-SAISIE §7 septies.4 bis). 99 : le volume que PRÉVOIT le programme ' +
      '(la semaine qui déraille, `deraille.js`) se compte par la même fonction que le volume fait (`faits.semaineDuProgramme`).' },
  // ── 65 — LE POIDS D'UN MUSCLE (REGLE-VOLUME §1 bis, v2_069) : une table, lue par le coach et le jeu ──
  { notion: 'le poids d’un muscle dans une série (principal 1, secondaire ½, stabilisateur ¼)', pr: '65-U1',
    module: 'semaine.js', fonction: 'musclesPonderes', lecteurs: ['jeu.js', 'generateur.js'],
    par: ['volumeParMuscle', 'apportsParMuscle'],
    raison: 'REGLE-VOLUME §1 bis (65) : UNE table de poids (`POIDS_DES_MUSCLES`), lue par le coach (le volume, la fenêtre ' +
      '« d’où vient ce chiffre ») et par le jeu (les points des muscles) ; une seconde table finirait par dire autre chose. ' +
      '66A : la relecture de la semaine (§5 ter.1) compte les séries d’une routine par muscle avec ces poids.' },
  { notion: 'la fin effective d’une séance (sans heure de fin : 3 h au plus, jamais après la suivante)', pr: '55-U1',
    module: 'moteur.js', fonction: 'finEffective', lecteurs: [],
    par: ['consigneDeLaSeance'],
    raison: 'MOTEUR §12.2 bis (G2) : la zone d’une séance se lit à sa fin ; sans heure de fin, une borne, ' +
      'une fois — sinon une zone changée entre deux séances comptait pour la précédente.' },
  { notion: 'la table par reps cumulée (la charge la plus lourde pour au moins N reps)', pr: '55-U1',
    module: 'modele.js', fonction: 'tableCumulee', lecteurs: [],
    par: ['tableParReps', 'recordsBattus', 'recordsDeLExercice'],
    raison: 'MOTEUR §9.23, ECRAN §7 bis.16 (« cumulée, jamais brute ») : la médaille, le tableau des records, ' +
      'le record de charge de la page et le chiffre d’une ligne déduite lisent la même table.' },
  { notion: 'les records d’un exercice à une date (le périmètre de la médaille)', pr: '55-U1',
    module: 'modele.js', fonction: 'recordsDeLExercice', lecteurs: ['app.js', 'faits.js', 'objectif.js'],
    par: ['tableauDesRecords'],
    parAilleurs: { 'app.js': ['rendreExercice'], 'faits.js': ['ceQueJeSais'], 'objectif.js': ['recordA'] },
    raison: 'MOTEUR §9.23 : le record de charge de la page, sa force estimée (hors des records, D1) et le tableau des records lisent ' +
      'la même table cumulée, sur le même périmètre que la médaille (12 mois pour un matériel de salle). ' +
      '60-2a : « Ce que je sais » montre le maximum de chaque barre par cette même fonction — jamais une seconde. ' +
      '109 (MOTEUR §9.25) : le rythme d’un objectif se lit sur ce record « au moins N reps », jamais sur un maximum estimé.' },
  { notion: 'le périmètre d’un record (12 mois pour un matériel de salle, toute la vie ailleurs)', pr: '55-U1',
    module: 'modele.js', fonction: 'seancesDuPerimetre', lecteurs: ['app.js', 'objectif.js'],
    par: ['recordsDeLExercice'],
    parAilleurs: { 'app.js': ['rendreExercice'] },
    raison: 'MOTEUR §9.23 et ECRAN §7 quater.3 (H3, #371) : le tableau des records, le record de charge et la ' +
      'table par reps d’une page lisent le même périmètre — une page n’en montre jamais deux.' },
  { notion: 'le 1RM estimable (3 à 10 reps, une charge soulevée, jamais au poids du corps)', pr: '55-U1',
    module: 'modele.js', fonction: 'estimable1RM', lecteurs: [],
    par: ['recordsDeLExercice'],
    raison: 'ECRAN §7 bis.15 : hors de 3 à 10 reps, l’estimation n’est pas fiable. 120 (D1, 16/10/2026) : la force ' +
      'estimée n’est plus un record — la médaille ne la lit plus ; la page seule la dit.' },
  { notion: 'les records battus par une série (et l’ancien record, avec sa date)', pr: '55-U1',
    module: 'modele.js', fonction: 'recordsBattus', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['recordsDeLaSerie', 'recordsDeLaSeance'] },
    raison: 'MOTEUR §9.23 : un record est un fait ; une seule fonction décide ce qu’une série bat, ' +
      'la médaille en séance, la feuille « Terminer » et Progression la lisent.' },
  { notion: 'la phrase de la médaille ([gras, gris])', pr: '55-U1',
    module: 'modele.js', fonction: 'phraseDeRecord', lecteurs: ['app.js', 'faits.js'],
    parAilleurs: { 'app.js': ['medailleSurLigne'], 'faits.js': ['recordsDuJour'] },
    raison: 'MOTEUR §9.23 : les mots de la médaille, une fois — le cap rond, la charge pour N reps, le volume, ' +
      'la durée, et le record d’avant avec sa date (120, D1 : plus le 1RM estimé).' },
  { notion: 'le 1RM estimé (Epley)', pr: '55-U1',
    module: 'moteur.js', fonction: 'unRMEpley', lecteurs: ['modele.js'],
    par: ['reportDeZone'],
    parAilleurs: { 'modele.js': ['recordsDeLExercice'] },
    raison: 'MOTEUR §9.10 et §9.23 : l’estimation du report et la force estimée de la page (120, D1 : une ' +
      'progression, plus un record) lisent la même formule — jamais recopiée.' },
  { notion: 'la fenêtre des 12 mois d’un matériel (machines, poulies, haltères, Smith)', pr: '55-U1',
    module: 'moteur.js', fonction: 'plancherDuMateriel', lecteurs: ['modele.js'],
    par: ['chargeVoisine'],
    parAilleurs: { 'modele.js': ['recordsBattus', 'seancesDuPerimetre'] },
    raison: 'MOTEUR §10.2 et §9.23 : la charge voisine du coach et les records comparent sur la même ' +
      'liste de matériels et la même fenêtre — un seul câblage.' },
  { notion: 'l’occurrence coachée d’un exercice (la première, ou celle qui porte ses paris)', pr: 'correctif 04/10/2026',
    module: 'seance.js', fonction: 'occurrenceCoachee', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance'], 'app.js': ['occurrenceLibre'] },
    raison: 'prérequis d’« adapter » : un exercice deux fois dans la séance, le coach en suit une ; ' +
      'le plan et l’écran (en-tête, étiquette, constat) le décident par la même règle.' },
  { notion: 'les paris d’une occurrence (un exercice deux fois, sans paris mélangés)', pr: 'correctif 04/10/2026',
    module: 'seance.js', fonction: 'parisDeLOccurrence', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance', 'verifierPlan'], 'app.js': ['dejaNote', 'observerSerie'] },
    raison: 'prérequis d’« adapter » : le plan, I7, « déjà noté » et l’observation lisaient les paris par ' +
      '(séance, exercice) — la seconde occurrence se serait figée sur les paris de la première.' }
,
  // ── 58-1 — LE MODULE DES FAITS (`faits.js`, « un seul fil ») ─────────────
  // L'assemblage des faits quittait `app.js` : un écran les LIT, il ne les
  // assemble plus (la garde « un fait ne se déclare que dans `faits.js` »,
  // plus bas, refuse une seconde déclaration ailleurs).
  { notion: 'les séances avec leurs séries (le cache groupé par séance, trié par rang)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesAvecSeries', lecteurs: ['app.js'],
    par: ['seancesDuSlug', 'recordsDuMois', 'dernierRecord', 'programmeDeduit'],
    parAilleurs: { 'app.js': ['bilanDuMoisDe'] },
    raison: 'UN-SEUL-FIL : le bilan du mois, ses records et le dernier record lisent le même groupement, ' +
      'avec le même mémo — un second groupement dirait une autre séance.' },
  { notion: 'les séances d’un exercice, pour ses records (`{ id, debut, series }`)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesDuSlug', lecteurs: [],
    par: ['recordsDeLaSeance'],
    raison: 'MOTEUR §9.23 : une série passée se compare aux séances de son exercice, lues une fois ' +
      'par état du cache ; seul le module des faits les assemble.' },
  { notion: 'les séances d’un exercice, pour le coach et sa page (`{ seance, series }`)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesDeLExercice', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['derniereSeanceDe', 'consigneDe', 'suiteDe', 'rendreExercice'] },
    raison: 'la consigne, la suite, « Dernière séance » et la page d’exercice lisent le même historique ' +
      'd’un exercice ; un second assemblage dans l’écran pourrait en oublier une séance.' },
  { notion: 'les records d’une séance passée (ses séries médaillées)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDeLaSeance', lecteurs: [],
    par: ['recordsDuMois', 'dernierRecord', 'journalDeLaSeance'],
    raison: 'MOTEUR §9.23 : un record est un fait ; le mois et le dernier record lisent les records ' +
      'd’une séance par la même fonction, au même mémo.' },
  { notion: 'les records d’un mois (dans l’ordre des séances)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDuMois', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProgression', 'ouvrirBilan', 'rendreRecordsDuMois'] },
    raison: 'MOTEUR §9.23 : le bloc Records, le bilan du mois et la liste des records du mois disent ' +
      'le même compte — le jeu les lira là aussi.' },
  { notion: 'le dernier record (la dernière série médaillée)', pr: '58-U1',
    module: 'faits.js', fonction: 'dernierRecord', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProgression'] },
    raison: 'MOTEUR §9.23 : « Le dernier » du bloc Records est un fait, assemblé une fois.' },
  { notion: 'l’historique d’un exercice pendant la séance (sans la séance en cours)', pr: '58-U1',
    module: 'faits.js', fonction: 'historiqueDesRecords', lecteurs: [],
    par: ['recordsDeLaSerie'],
    raison: 'MOTEUR §9.23 : la médaille compare une série à l’historique sans la séance en cours, ' +
      'lu une fois par exercice et par état.' },
  { notion: 'la séance en cours telle que les records la lisent (ses séries validées)', pr: '58-U1',
    module: 'faits.js', fonction: 'seanceDesRecords', lecteurs: [],
    par: ['recordsDeLaSerie', 'recordsDuJour'],
    raison: 'MOTEUR §9.23 : la médaille et la feuille « Terminer » lisent les mêmes séries validées, ' +
      'dans le même ordre.' },
  { notion: 'les records d’une série de la séance en cours (la médaille)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDeLaSerie', lecteurs: ['app.js'],
    par: ['recordsDuJour', 'journalDuJour'],
    parAilleurs: { 'app.js': ['medailleSurLigne'] },
    raison: 'MOTEUR §9.23 : la médaille sous une rangée et la feuille « Terminer » lisent le même ' +
      'calcul.' },
  { notion: 'les records du jour (la feuille « Terminer »)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDuJour', lecteurs: [],
    par: ['recapDeLaSeance'],
    raison: 'MOTEUR §9.23 : les records d’une séance qu’on termine. 71 : la feuille « Terminer » ne les montre ' +
      'plus ; le récap de fin de séance les lit, avec la phrase de la médaille (ECRAN-SAISIE §7 septies.4 bis).' },
  { notion: 'le récap de fin de séance (tout ce qu’il montre)', pr: '71-U1',
    module: 'faits.js', fonction: 'recapDeLaSeance', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreRecap'] },
    raison: 'ECRAN-SAISIE §7 septies.4 bis : les faits du récap en un seul endroit, qui câble ce qui existe ' +
      '(séries, volume, muscles, records, paris, comparaison) sans en recopier rien ; l’écran les lit.' },
  { notion: 'le compte des paris vérifiés et tenus (tenu : observé ≥ prédit)', pr: '71-U1',
    module: 'bilan.js', fonction: 'compterParis', lecteurs: ['faits.js', 'bilans.js'],
    par: ['bilanDuMois'],
    parAilleurs: { 'faits.js': ['recapDeLaSeance'] },
    raison: 'MOTEUR §9.22 : le bilan du mois et le récap de fin de séance comptent les paris par la même boucle ' +
      '(extraite de `bilanDuMois`, 71) — le bilan ne change pas d’un chiffre.' },
  { notion: 'la comparaison du volume à un objet connu (« à peu près un tricératops »)', pr: '71-U1',
    module: 'bilan.js', fonction: 'comparaison', lecteurs: ['bilans.js'],
    par: ['phraseComparaison'],
    raison: 'ECRAN-SAISIE §7 septies.4 bis : la table des cinquante objets et le choix par l’empreinte de la ' +
      'séance vivent à un seul endroit (`comparaison71.py` est la référence).' },
  { notion: 'la semaine affichée (ses jours, séances, séries, bilan, zones)', pr: '58-U1',
    module: 'faits.js', fonction: 'semaineDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['semaineCourante'] },
    raison: 'UN-SEUL-FIL : Séances, Progression et la vue Volume lisent la même semaine ; l’écran ne ' +
      'retient que le lundi affiché.' },
  { notion: 'les exercices faits et la date de leur dernière séance', pr: '58-U1',
    module: 'faits.js', fonction: 'datesDesExercices', lecteurs: ['app.js'],
    par: ['compterExercices'],
    parAilleurs: { 'app.js': ['rendreMesExercices'] },
    raison: 'PR 6 : « fait » a une définition (`exercicesFaits`) ; sa date et son compte s’assemblent ' +
      'une fois, avec leur oubli explicite.' },
  { notion: 'le compte des exercices faits (le profil)', pr: '58-U1',
    module: 'faits.js', fonction: 'compterExercices', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProfilEcran'] },
    raison: 'PR 6 : le profil dit « N déjà faits » par le même balayage que Mes exercices.' },
  // ── 58-2 — LE JOURNAL DES RECORDS (MOTEUR §9.23, `v2_061`, `v2_062`) ──────
  // Le journal ne calcule rien : ses lignes sortent des deux fonctions des
  // records d'une séance, et il se LIT ici, nulle part ailleurs. Il s'écrit
  // par la file seule (garde « un seul écrivain », plus bas).
  { notion: 'les lignes du journal de la séance qu’on termine ou qu’on corrige', pr: '58-U2',
    module: 'faits.js', fonction: 'journalDuJour', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ecrireJournalDeSeance'] },
    raison: 'MOTEUR §9.23 (58-2) : le journal garde ce que la feuille « Terminer » affiche — la même ' +
      'fonction (`recordsDeLaSerie`), aucun recalcul à part, à « Terminer » comme en Édition.' },
  { notion: 'les lignes du journal d’une séance passée (le remplissage de l’historique)', pr: '58-U2',
    module: 'faits.js', fonction: 'journalDeLaSeance', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['remplirJournal'] },
    raison: 'MOTEUR §9.23 (58-2) : l’historique se remplit une fois, avec la fonction des records ' +
      'd’une séance passée — celle du bilan et du dernier record.' },
  { notion: 'la lecture du journal des records (le jeu, plus tard le social)', pr: '58-U2',
    module: 'faits.js', fonction: 'recordsDuJournal', lecteurs: [],
    raison: 'MOTEUR §9.23 (58-2) : les lecteurs lisent le journal, jamais un recalcul — et le lisent ' +
      'ici. Aucun écran ne le lit encore : le jeu viendra.' },
  // ── 87 — LE SOCIAL (SOCIAL-V1) : il lit les médailles dans le module des faits, il ne les recompte pas ──
  { notion: 'les médailles d’une séance d’une autre personne (une par série médaillée, sur les lignes de `social_records_seance`)', pr: '87-U1',
    module: 'faits.js', fonction: 'medaillesDuSocial', lecteurs: ['app.js'],
    raison: 'SOCIAL-V1 : le fil et le profil d’une personne montrent ses médailles ; la règle de la médaille (une par ' +
      'série, les types dans l’ordre de la phrase) est celle de `recordsDeLaSeance` et du journal, écrite une fois ici.' },
  // ── 89 — LE SOCIAL, ÉTAGE 2 : mes séries comptées dans le module des faits ; le DOTS dans un seul module ──
  { notion: 'mes séries comptées pour le social (travail, charge > 0, reps > 0 : la forme des fonctions de v2_079)', pr: '89-U1',
    module: 'faits.js', fonction: 'seriesComptees', lecteurs: ['app.js'],
    raison: 'SOCIAL-V1 « Étage 2 » : mes chiffres et ceux d’un ami passent par les mêmes fonctions de `social.js` ; ' +
      'les miens sortent d’ici, sur la règle de `Bilan.volumeKg` et des fonctions de la base.' },
  // ── 90 — LA GUILDE : mes nombres (séances prévues, records sans dépasser la charge proposée) dans le module des faits ──
  { notion: 'les records qui comptent pour la guilde (six types ; sans pari relié, ou à la charge proposée ou en dessous)', pr: '90-U1',
    module: 'faits.js', fonction: 'recordsSansDepasser', lecteurs: [],
    par: ['scoresDeGuilde'],
    raison: 'SOCIAL-V1 « Guilde » : le classement Progression et le défi des records lisent la même règle, décidée le 14/10/2026 ' +
      '(un record sans proposition compte ; avec une proposition, à sa charge ou en dessous).' },
  { notion: 'mes nombres de guilde (séances de la semaine et prévues, records, exercices du mois)', pr: '90-U1',
    module: 'faits.js', fonction: 'scoresDeGuilde', lecteurs: ['app.js'],
    raison: 'SOCIAL-V1 « Guilde » : calculés sur l’appareil, publiés tels quels (`guilde_scores`) ; les séances prévues lisent ' +
      '`habitudes` quand le profil n’en déclare pas, sans la recopier.' },
  { notion: 'le score DOTS (la force à poids de corps égal, par sexe)', pr: '89-U1',
    module: 'social.js', fonction: 'scoreDots', lecteurs: [],
    par: ['scoresAPublier'],
    raison: 'SOCIAL-V1 « Étage 2 » : « Entre amis » et « Se comparer » classent à poids de corps égal ; le score se ' +
      'calcule sur l’appareil (le poids n’en sort jamais), par une seule fonction.' },
  { notion: 'le poids flouté (la pesée + un décalage secret, arrondie à la dizaine : le seul poids d’un score publié)', pr: 'correctif 16/10/2026',
    module: 'social.js', fonction: 'poidsFloute', lecteurs: [],
    par: ['scoresAPublier'],
    raison: 'audit du 16/10/2026 (P0) : « aucun mutuel ne peut déduire le poids de corps à mieux que ±5 kg » — un ' +
      'score sur la pesée, à côté d’une charge vue dans les séances, la redonnait au centième.' },
  // ── 60-2a — LE QUESTIONNAIRE DU COACH MONTRE, IL NE DEMANDE PAS ───────────
  { notion: 'ce que les séances savent de la personne (historique, rythme, durée habituelle, maximums, autres activités)', pr: '60-U1',
    module: 'faits.js', fonction: 'ceQueJeSais', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['actualiserFaitsDuQuestionnaire', 'dureeHabituelleDesSeances'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §1.2 : rien de ce que les séries savent n’est demandé, c’est montré — ' +
      'l’écran « Ce que je sais » et la durée habituelle de l’écran « Temps » lisent ce fait, aucun ne recompte.' },
  // ── 60-2a — « JUSTE UN CARNET » SE TAIT PARTOUT, D'UNE SEULE VOIX ─────────
  { notion: 'le silence du coach au profil (« Juste un carnet », MOTEUR I13 : le plan, la semaine allégée annoncée, le badge et la carte de fin de bloc)', pr: '60-U2',
    module: 'moteur.js', fonction: 'coachSeTait', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance', 'verifierSilenceDuProgramme'],
                   'app.js': ['semaineAllegeeEnCours', 'programmeDuDossierCalcule', 'rendreBandeauPhase'] },
    // La forme écrite à la main, hors du moteur : l'intention du PROFIL comparée à
    // « entretien » (`profil.intention === 'entretien'`), ou `intentionDe` appelée
    // avec le profil seul (`intentionDe(profil && profil.intention, null)`).
    interditAilleurs: { motif: /\bprofil\s*(?:&&\s*profil\s*)?\.\s*intention\s*[!=]==?\s*(['"])entretien\1|\bintentionDe\s*\(\s*profil\b[^()]*,\s*null\s*\)/,
      raison: 'le silence du coach au profil se lit par `Moteur.coachSeTait`, jamais par un second test de `intention` écrit à la main' },
    raison: 'MOTEUR I13 (précisé le 07/10/2026, 60-2a) : au profil « Juste un carnet », le plan, la semaine ' +
      'allégée annoncée sur une routine, le badge de bloc et la carte de fin de bloc lisent le MÊME fait. ' +
      'Le badge et la carte vivent hors de `planDeSeance` : un second test de l’intention les aurait fait diverger.' },
  { notion: 'la préparation des champs d’une réponse du profil (objectif daté, phase datée, année, priorités, « fait »)', pr: '60-U3',
    module: 'profil.js', fonction: 'preparerChamps', lecteurs: ['questionnaire.js', 'app.js'],
    parAilleurs: { 'questionnaire.js': ['champsDeLEcran'], 'app.js': ['ecrireReponse'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §6 : le questionnaire (un écran à la fois) et le Profil (une ligne à la ' +
      'fois) écrivent la même chose — `objectif_depuis` suit un objectif qui change, une réponse inchangée ' +
      'n’écrit rien. Deux préparations auraient fini par dater différemment.' },
  // ── 60-2b — LES LECTEURS DE L'OBJECTIF ────────────────────────────────────
  { notion: 'la zone proposée pour le premier bloc d’un programme (elle suit l’objectif, MOTEUR §9.22)', pr: '60-U4',
    module: 'moteur.js', fonction: 'zoneDuPremierBloc', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirProgramme'] },
    raison: 'MOTEUR §9.22 (60-2b) : Force et Les deux proposent Lourd, le reste Mix. `ouvrirProgramme` écrivait ' +
      'Mix d’office ; la règle vit dans le moteur, l’écran ne la recopie pas.' },
  { notion: 'l’objectif gelé de la séance (lu une fois, avec la phase ; entre dans le fondement des paris, I40)', pr: '60-U5',
    module: 'profil.js', fonction: 'objectifGele', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['objectifDeLaSeance'] },
    raison: 'MOTEUR §9.16 (60-2b) : jumeau de la phase gelée. Lu en direct, un changement d’objectif dans Profil ' +
      'en pleine séance ferait dériver les paris d’une même séance (I40) ; `null` est une valeur, pas une absence.' },
  { notion: 'les priorités gelées de la séance (lues une fois, avec la phase ; décident la place d’un muscle prioritaire)', pr: '60-U6',
    module: 'profil.js', fonction: 'prioritesGelees', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['prioritesDeLaSeance'] },
    raison: 'MOTEUR §14.6 (60-2b) : jumelle de la phase gelée. Lues en direct, cocher une priorité dans Profil en ' +
      'pleine séance ferait apparaître ou disparaître une carte de série de plus (I12 : le mémo du plan ne voit pas le profil).' },
  { notion: 'le rappel de phase (une phase déclarée dont la dernière réponse date de 42 jours ou plus)', pr: '60-U7',
    module: 'profil.js', fonction: 'rappelDePhase', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreBandeauPhase'] },
    raison: 'MOTEUR §9.16 (60-2b) : le seuil des 42 jours et le choix de la date (`phase_confirmee_le`, sinon ' +
      '`phase_depuis`) vivent dans une règle pure ; le bandeau de Saisie la lit, il ne recalcule pas l’âge d’une phase.' },
  { notion: 'ce que la réponse « temps » déclenche sur une routine (la carte d’office pour « moins », l’ambre pour « varie »)', pr: '60-U8',
    module: 'moteur.js', fonction: 'reponseDeTemps', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['tempsDeLaRoutine'] },
    raison: 'MOTEUR §9.18 (60-2b) : la condition (durée visée déclarée, estimation au-dessus, pas de carnet) et ce que chaque ' +
      'réponse en fait vivent dans le moteur ; `tempsDeLaRoutine` la lit, ni l’écran ni la rangée ne comparent une durée à la main.' },
  // ── 60-3 — LE PROGRAMME DÉDUIT (QUESTIONNAIRE-COACH-V2 §5) ────────────────
  { notion: 'les séances qui reviennent (la règle du programme déduit : fenêtre, signature, regroupement, médianes, nom, récence)', pr: '60-U9',
    module: 'routines.js', fonction: 'seancesQuiReviennent', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['programmeDeduit'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 (60-3) : le portage de `deduire()` (`deduit60b.py`), prouvé par ses cas. ' +
      'Une seule règle : l’écran 8 et la ligne de Routines ouvrent la même feuille, sur les mêmes routines.' },
  // 66C — la signature, extraite de `seancesQuiReviennent` : le déduit et les habitudes la lisent, aucun ne la recopie.
  { notion: 'la signature d’une séance du programme déduit (au moins deux exercices en charge × reps ou en reps, une série de travail ou d’échec)', pr: '66-U3',
    module: 'routines.js', fonction: 'signatureDeSeance', lecteurs: ['faits.js'],
    par: ['seancesQuiReviennent'],
    parAilleurs: { 'faits.js': ['habitudes'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 quater.2 (66C) : une séance compte pour les habitudes comme pour le programme ' +
      'déduit, par la même définition ; deux copies auraient fini par compter deux séances différentes.' },
  { notion: 'les faits du programme déduit (les séances, leur titre, leurs séries, la mesure de chaque exercice)', pr: '60-U9',
    module: 'faits.js', fonction: 'programmeDeduit', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirSeancesQuiReviennent'] },
    raison: 'UN-SEUL-FIL (60-3) : la règle reçoit ses faits du module des faits, le groupement du bilan ; ' +
      'un écran qui assemblerait ses séances à part pourrait en oublier une.' },
  { notion: 'la structure d’une routine déduite (celle de « En faire une routine »)', pr: '60-U9',
    module: 'routines.js', fonction: 'routineDeduite', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['creerDansUnDossier'] },
    raison: 'ECRAN-SAISIE §7 quindecies.7 (60-3) : chaque routine cochée devient la structure de « En faire une ' +
      'routine » — les mêmes blocs, les mêmes repos et leur origine, jamais une charge. Pas une seconde règle des repos.' },
  // ── 60-3 — « REMPLACER » DANS L'ÉDITEUR (ECRAN-SAISIE §7 quindecies.8) ───
  { notion: 'le remplaçant d’un exercice de routine (à sa place, son groupe, ses séries, sans la charge de départ)', pr: '60-U10',
    module: 'routines.js', fonction: 'exerciceRemplace', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['remplacerDansLEditeur', 'remplacerAuPlafond'] },
    raison: 'ES §7 quindecies.8 (60-3) : le frère et le catalogue remplacent par la même fonction — même rang, même ' +
      'superset (§7 decies), mêmes séries et repos, la charge de départ retirée (MOTEUR §9.21). 113 (MOTEUR §10 bis) : ' +
      '« Changer d’exercice », au plafond de la salle, remplace dans la routine de la séance par le même geste.' },
  // ── 60-3b — LE PSEUDO TRAVERSE LA CONFIRMATION D'E-MAIL (ECRAN-PROFIL §3.1) ─
  { notion: 'le pseudo posé à la création de la ligne de profil (celui de la page, sinon celui des données du compte)', pr: '60-U11',
    module: 'profil.js', fonction: 'pseudoDeLInscription', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['chargerProfil'] },
    raison: 'ECRAN-PROFIL §3.1 (60-3b) : le lien de confirmation s’ouvre souvent dans une autre page, où la mémoire ' +
      'de l’inscription n’existe plus. UN SEUL ENDROIT choisit — et valide : les données d’un compte sont modifiables ' +
      'par son propriétaire, un pseudo qui n’en est pas un est ignoré.' },
  { notion: 'la ligne « Pseudo » du Profil (et sa phrase « pris entre-temps »)', pr: '60-U11',
    module: 'profil.js', fonction: 'lignePseudo', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProfilEcran'] },
    raison: 'ECRAN-PROFIL §3.1 (60-3b) : la phrase « Ce pseudo vient d’être pris » se dit tant qu’aucun pseudo n’est ' +
      'posé ; elle vit avec la ligne, l’écran ne la compose pas.' },
  // ── 60-4 — LE PROGRAMME CONSTRUIT (QUESTIONNAIRE-COACH-V2 §5 bis) ─────────
  { notion: 'la fenêtre de la personne (les 84 jours qui finissent à SA dernière séance, pas aujourd’hui)', pr: '60-U12',
    module: 'routines.js', fonction: 'fenetreDeLaPersonne', lecteurs: ['faits.js'],
    par: ['seancesQuiReviennent'],
    raison: 'QUESTIONNAIRE-COACH-V2 §5 (60-3) : le programme déduit et l’historique du programme construit (60-4) ' +
      'lisent la MÊME fenêtre ; deux fenêtres écrites à la main finiraient par ne plus se recouvrir.' },
  { notion: 'l’historique du programme construit (par exercice, le nombre de séances de travail sur la fenêtre de la personne)', pr: '60-U12',
    module: 'faits.js', fonction: 'historiqueDesExercices', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['entreeDuProgramme'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : le générateur ordonne ses candidats par ce que la personne fait ' +
      'le plus ; le fait vit dans le module des faits (58-1) et le générateur le REÇOIT, il ne relit pas les séances.' },
  { notion: 'les exercices écartés en fin de liste (le catalogue, les frères de « Machine prise » et de « Remplacer »)', pr: '60-U14',
    module: 'profil.js', fonction: 'ecartesALaFin', lecteurs: ['app.js'],
    par: ['rangerParMateriel'],
    parAilleurs: { 'app.js': ['freresDe'] },
    raison: 'ECRAN-SAISIE §7 quindecies.9 (60-4) : un exercice écarté passe en fin de liste, jamais caché, avec la mention ' +
      '« écarté » — la règle « range, ne cache jamais » du matériel, composée, pas un second tri : le catalogue passe par ' +
      '`rangerParMateriel`, les frères par `freresDe`.' },
  { notion: 'la carte « Passer en cycles » (Force ou Les deux, 21 jours, 6 séances du dossier, une seule fois)', pr: '60-U15',
    module: 'generateur.js', fonction: 'carteCycles', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'MOTEUR §9.22 (60-4) : les seuils (21 jours, 6 séances), l’objectif et les silences se décident une fois, dans le ' +
      'générateur ; la carte de Saisie lit son verdict, comme le rappel de phase lit `rappelDePhase`.' },
  { notion: 'les séances faites depuis les routines d’un dossier (le compte de la carte « Passer en cycles »)', pr: '60-U15',
    module: 'faits.js', fonction: 'seancesDesRoutines', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'UN-SEUL-FIL (60-4) : l’appartenance d’une séance à un dossier se lit sur `routine_id`, dans le module des faits ; ' +
      'un écran qui compterait à part pourrait compter une séance importée ou une séance d’avant la création.' },
  { notion: 'les jours calendaires écoulés depuis la création du programme construit', pr: '60-U15',
    module: 'profil.js', fonction: 'joursDepuis', lecteurs: ['app.js', 'generateur.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'MOTEUR §9.22 (60-4) : 21 jours CALENDAIRES (le changement d’heure ne les change pas), la même arithmétique que ' +
      'le rappel de phase (`jourCalendaire`) — pas une soustraction de millisecondes à l’écran. 66A : « pas encore ' +
      'dépassé » (§5 ter.3, un record d’au moins 12 mois) se compte de même.' },
  { notion: 'la durée que le programme construit doit tenir (la durée déclarée, avec « C’est mon maximum », « Moins en ce moment » ou « Ça varie »)', pr: '60-U13',
    module: 'moteur.js', fonction: 'cibleDuProgramme', lecteurs: ['app.js'],
    // 66D : lue une fois (`cibleDuProgrammeConstruit`) par le raccourci et par les supersets (`assemblerLeProgramme`).
    parAilleurs: { 'app.js': ['cibleDuProgrammeConstruit'] },
    raison: 'MOTEUR §9.18 (G8, 60-4) : quelles réponses de temps font raccourcir le programme, et à quelle durée, se décide ' +
      'une fois dans le moteur ; l’app lit le résultat et passe par `raccourcirRoutine`, elle ne teste pas `temps_reponse`.' },
  // ── 64A — LE JEU (JEU-V1) : il lit les faits, le coach ne le lit jamais ───
  { notion: 'les faits du jeu (séances, séries de travail, catalogue, journal, maximums des barres, exercices faits)', pr: '64-U1',
    module: 'faits.js', fonction: 'faitsDuJeu', lecteurs: ['app.js'],
    raison: 'JEU-V1 §8 (64A) : le jeu lit les faits, il ne les recompte pas — son entrée s’assemble une fois, dans le ' +
      'module des faits, avec les fonctions qu’il a déjà (le journal, les maximums, les exercices faits). 64B : l’écran ' +
      'du jeu (`app.js`) l’assemble pour l’onglet et, avec la séance en cours, pour la feuille « Terminer ».' },
  { notion: 'l’état du jeu (série et gels, muscles, XP, niveau, succès, titres, cadres, le plus proche)', pr: '64-U1',
    module: 'jeu.js', fonction: 'etatDuJeu', lecteurs: ['app.js'],
    raison: 'JEU-V1 (64A) : un seul calcul du jeu, pur, depuis l’historique ; aucun écran ne le refait. 64B : `app.js` ' +
      'le calcule (avec sa mémoire) pour l’onglet Jeu, le Profil et la feuille « Terminer » ; le rendu reçoit l’état.' },
  // ── 64B — LES ÉCRANS DU JEU (JEU-V1 §9) : un écran ne refait ni la vitrine, ni l'apport, ni « le plus proche » ──
  // `motif` : l'APPEL seulement — `vue.vitrine`, `jeu.apport`, `vue.jauges` sont des champs que le rendu lit.
  { notion: 'la description d’un succès (catégorie, palier, rareté, points)', pr: '64-U2',
    module: 'jeu.js', fonction: 'descriptionDuSucces', lecteurs: ['app.js'], motif: /\.\s*descriptionDuSucces\s*\(/g,
    raison: 'JEU-V1 §9.5 : tirée des tables du module ; l’écran nomme un succès (vitrine, feuille) sans recopier les paliers.' },
  { notion: 'la vitrine (trois succès, les plus rares, à égalité le plus tard)', pr: '64-U2',
    module: 'jeu.js', fonction: 'vitrine', lecteurs: ['app.js'], motif: /\.\s*vitrine\s*\(/g,
    raison: 'JEU-V1 §9.3 : la vitrine est automatique ; un écran qui la referait pourrait en choisir d’autres.' },
  { notion: 'l’apport d’une séance (XP, niveau, muscles qui montent, succès gagnés, points)', pr: '64-U2',
    module: 'jeu.js', fonction: 'apport', lecteurs: ['app.js'], motif: /\.\s*apport\s*\(/g,
    raison: 'JEU-V1 §9.4 : la feuille « Terminer » compare deux états du jeu par le module, jamais à la main.' },
  { notion: 'le plus proche (les trois plus grands `fait`)', pr: '64-U2',
    module: 'jeu.js', fonction: 'lesPlusProches', lecteurs: ['app.js'], motif: /\.\s*lesPlusProches\s*\(/g,
    raison: 'JEU-V1 §9.2 : un écran qui prendrait les trois premiers de la liste dirait autre chose que le jeu.' },
  { notion: 'les succès par catégorie (obtenus, total, prochain)', pr: '64-U2',
    module: 'jeu.js', fonction: 'parCategorie', lecteurs: ['app.js'], motif: /\.\s*parCategorie\s*\(/g,
    raison: 'JEU-V1 §9.2 : les totaux viennent des tables du module (la randonnée compte la grande sortie).' },
  { notion: 'les titres et les cadres détaillés (obtenus, affiché, le muscle le plus bas)', pr: '64-U2',
    module: 'jeu.js', fonction: 'titresEtCadresDetailles', lecteurs: ['app.js'], motif: /\.\s*titresEtCadresDetailles\s*\(/g,
    raison: 'JEU-V1 §9.2 : Succès et Déblocages lisent le jeu, ils ne recomptent pas les titres.' },
  { notion: 'les jauges (la part faite du niveau en cours)', pr: '64-U2',
    module: 'jeu.js', fonction: 'jauges', lecteurs: ['app.js'], motif: /\.\s*jauges\s*\(/g,
    raison: 'JEU-V1 §9.2 : le coût d’un niveau reste dans le module ; l’écran ne le recalcule pas.' },
  { notion: 'les tables du jeu, en lecture (paliers, raretés, titres, cadres, gels)', pr: '64-U2',
    module: 'jeu.js', fonction: 'tables', lecteurs: ['app.js'], motif: /\bJeu\s*\.\s*tables\s*\(/g,
    raison: 'JEU-V1 §9.5 : une copie des tables du module — les vues disent les conditions sans les recopier.' },
  { notion: 'le jeu allumé (`profiles.jeu_actif`, absent = allumé)', pr: '64-U2',
    module: 'profil.js', fonction: 'jeuActif', lecteurs: ['app.js'],
    raison: 'JEU-V1 §9.1 : l’onglet, le Profil, la feuille et la garde des routes lisent le même fait ; un second test ' +
      'de `jeu_actif === false` écrit à la main dirait autre chose au premier démarrage (colonne absente).' },
  // ── 66A — LE COACH RELIT TA SEMAINE (QUESTIONNAIRE-COACH-V2 §5 ter) ───────
  { notion: 'le fait des barres du bilan (record, série récente, semaines, séries lourdes, variantes à la barre)', pr: '66-U1',
    module: 'faits.js', fonction: 'barresDuBilan', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['entreeDeRelecture'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 ter.2 (66A) : la relecture de la semaine REÇOIT ce fait, elle ne relit pas les ' +
      'séances ; le record est celui de la page de l’exercice (`recordsDeLExercice(...).lourde`). 66B : l’écran ' +
      '(`app.js`, `entreeDeRelecture`) l’assemble dans l’entrée, sans le recompter.' },
  // ── 75 — « TON PARCOURS » (ECRAN-SAISIE §7 bis.14 ter) : un calcul pur, assemblé par les faits, lu par l'écran ──
  { notion: '« Ton parcours » (les verdicts des exercices et des groupes, le relais, les rapports, le levier, les courbes, la phrase)', pr: '75-U1',
    module: 'parcours.js', fonction: 'parcours', lecteurs: ['faits.js'],
    motif: /\b(?:TH)?Parcours\s*\.\s*parcours\s*\(/g,
    parAilleurs: { 'faits.js': ['parcoursDe'] },
    raison: 'ECRAN-SAISIE §7 bis.14 ter (75) : une règle fixe, testée contre `parcours75.py` ; seul le module des faits ' +
      'l’appelle, sur l’entrée qu’il assemble — aucun écran ne refait un verdict, un rapport ou le levier.' },
  { notion: 'l’entrée de « Ton parcours » (séries de travail datées, catalogue, priorités, sexe, aujourd’hui)', pr: '75-U1',
    module: 'faits.js', fonction: 'entreeDuParcours', lecteurs: [],
    par: ['parcoursDe'],
    raison: 'ECRAN-SAISIE §7 bis.14 ter (75) : les séries de travail (`Modele.estTravail`) des séances terminées, au jour ' +
      'civil de leur séance ; une seule assemblée, celle que le parcours mémorisé lit.' },
  { notion: '« Ton parcours », mémorisé (le bloc du sommaire et la page)', pr: '75-U1',
    module: 'faits.js', fonction: 'parcoursDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProgression', 'rendreParcours'] },
    raison: 'ECRAN-SAISIE §7 bis.14 ter (75) : le bloc et la page lisent le même parcours, recalculé seulement quand le ' +
      'corpus, le jour, les priorités, le sexe ou le catalogue changent ; l’écran ne le calcule pas.' },
  // ── 95 — LES BILANS DE PÉRIODE (BILANS-V1, « Ton année ») : un moteur pur, assemblé par les faits, lu par l'écran ──
  { notion: 'le bilan d’une période (tonnes, mois, reps, profil, muscle, exercice, séance, barres, ce qui a avancé, le coach)', pr: '95-U1',
    module: 'bilans.js', fonction: 'bilanDeLaPeriode', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['bilanDePeriode'] },
    raison: 'BILANS-V1 (95) : un seul moteur, la période en paramètre (année, saison, mois) ; seul le module des faits ' +
      'l’appelle, sur l’entrée qu’il assemble — l’écran « Ton année » met en mots, il ne recompte rien.' },
  { notion: 'le poids du jour d’une perf (deux pesées à 60 j, sinon la plus proche à 45 j avec « ≈ »)', pr: '95-U1',
    module: 'bilans.js', fonction: 'poidsDuJour', lecteurs: [],
    par: ['bilanDeLaPeriode'],
    raison: 'BILANS-V1 (95) : « rapporté à ton poids de corps ce jour-là » — une seule règle d’estimation.' },
  { notion: 'la comparaison d’un bilan (contre la période d’avant, début contre fin, ou aucune)', pr: '95-U1',
    module: 'bilans.js', fonction: 'comparaisonDe', lecteurs: [],
    par: ['bilanDeLaPeriode'],
    raison: 'BILANS-V1 (95) : moins de 2 mois de données, les faits seulement ; moins de 12, début contre fin.' },
  { notion: 'l’entrée d’un bilan de période (séances terminées datées, catalogue, pesées, paris)', pr: '95-U1',
    module: 'faits.js', fonction: 'entreeDuBilan', lecteurs: [],
    par: ['bilanDePeriode'],
    raison: 'BILANS-V1 (95) : une seule assemblée, celle que le bilan mémorisé lit.' },
  { notion: 'les heures et les jours à la salle d’une période (jours distincts, durées des séances terminées, rien au-delà de 5 h)', pr: '97-U1',
    module: 'faits.js', fonction: 'tempsALaSalle', lecteurs: [],
    par: ['entreeDuBilan'],
    raison: 'BILANS-V1 (décision du 15/10/2026) : un fait de la période, jamais comparé ; une seule règle de compte, ' +
      'celle que l’entrée de tous les bilans (année, saison, mois) passe au moteur. 119 : seulement les séances de ' +
      'musculation (`Semaine.estSeanceDeMusculation`).' },
  // ── 119 — LES MESURES EN DURÉE ET EN DISTANCE (audit du 16/10/2026) ──
  { notion: 'la série de musculation (une série de travail d’un exercice qui porte du volume ; inconnu : comptée)', pr: '119-U1',
    module: 'semaine.js', fonction: 'estSerieDeMusculation', lecteurs: ['bilans.js', 'seance.js', 'faits.js'],
    par: ['compteSeriesTravail', 'estSeanceDeMusculation'],
    parAilleurs: { 'bilans.js': ['bilanDeLaPeriode'], 'seance.js': ['compter'], 'faits.js': ['scoresDeGuilde'] },
    raison: 'BILANS-V1 (16/10/2026) : la règle que `compteSeriesTravail` comptait sans la nommer ; une période de seules ' +
      'sorties est vide (F4) par la même règle que le compte des séries de travail ; la feuille « Terminer » d’une ' +
      'séance de cardio dit ce qui part hors musculation (E12, `Seance.compter`). 120 (D3) : le défi de guilde par ' +
      'défaut compte les séries de travail par cette même règle (`faits.scoresDeGuilde`, `series_semaine`).' },
  { notion: 'la séance de musculation (au moins une série de musculation : ni une randonnée, ni un tapis seul)', pr: '119-U1',
    module: 'semaine.js', fonction: 'estSeanceDeMusculation', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['tempsALaSalle'] },
    raison: 'BILANS-V1 (décision du 15/10 complétée le 16/10/2026) : « à la salle » (heures et jours) ne compte que les ' +
      'séances de musculation ; CADRAGE §2 ter : une séance mixte en est une.' },
  // ── 98 — LA SAISON ET LE MOIS (BILANS-V1, décisions du 14-15/10/2026) ──
  { notion: 'le nom d’une saison (Winter Arc pour tous ; les autres selon la phase au début de la saison)', pr: '98-U1',
    module: 'bilans.js', fonction: 'nomDeSaison', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['titreDeSaison', 'ouvrirBilan'] },
    raison: 'BILANS-V1 (98) : une seule table de noms ; le bloc de Progression, l’annonce et la story disent le même nom.' },
  { notion: 'la phase du profil à un jour (le défaut quand la phase a commencé après)', pr: '98-U1',
    module: 'profil.js', fonction: 'phaseAuJour', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['titreDeSaison', 'ouvrirBilan'] },
    raison: 'BILANS-V1 (98) : le nom de la saison suit la phase au début de la saison, lue une fois.' },
  { notion: 'le bilan d’une période, mémorisé (le bloc de Progression, l’annonce, l’écran « Ton année »)', pr: '95-U1',
    module: 'faits.js', fonction: 'bilanDePeriode', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['bilanDeLAnnee'] },
    raison: 'BILANS-V1 (95) : le bloc, l’annonce et l’écran lisent le même bilan, recalculé seulement quand le corpus, ' +
      'le jour, les pesées, les paris ou le catalogue changent.' },
  { notion: 'les faits du jeu au début et à la fin d’une période (l’écran du jeu du bilan)', pr: '95-U1',
    module: 'faits.js', fonction: 'faitsDuJeuDeLaPeriode', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirBilan'] },
    raison: 'BILANS-V1 (95) : l’écran du jeu est branché sur la fonction du jeu (`Jeu.etatDuJeu`), sur un corpus borné ' +
      'par les faits ; rien en base.' },
  { notion: 'la pratique d’un exercice (« moins pratiqué », « nouveau », « peu »)', pr: '95-U1',
    module: 'parcours.js', fonction: 'pratique', lecteurs: ['bilans.js'],
    par: ['parcours'],
    raison: 'ECRAN-SAISIE §7 bis.14 ter et BILANS-V1 (95) : « ce qui a le plus avancé » suit la règle « moins pratiqué » ' +
      'de « Ton parcours » — la même fonction, extraite du parcours.' },
  { notion: 'la comparaison à reps égales (hausse au-delà de × 1,025, baisse en deçà de × 0,975)', pr: '95-U1',
    module: 'parcours.js', fonction: 'aRepsEgales', lecteurs: ['bilans.js'],
    par: ['parcours'],
    raison: 'ECRAN-SAISIE §7 bis.14 ter (règle 4) et BILANS-V1 (95) : les exercices qui progressent et ce qui a le plus ' +
      'avancé se lisent sur la même comparaison que le verdict du parcours.' },
  { notion: 'la barre en retard (Force et Les deux), dite par la relecture', pr: '66-U1',
    module: 'generateur.js', fonction: 'relireSemaine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['relire'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 ter.3 (66A) : jamais hors Force et Les deux (R4). 66B : l’écran (`app.js`, ' +
      '`relire`) lit la relecture, jamais le repère. 76 : le repère n’est plus ici — c’est celui de « Ton parcours » ' +
      '(`parcours.js`, `repereSquatCouche`).' },
  // ── 76 — UN SEUL REPÈRE SQUAT ÷ COUCHÉ ──
  { notion: 'le repère squat ÷ couché et sa lecture, par sexe (« en dessous » sous 95 %)', pr: '76-U1',
    module: 'parcours.js', fonction: 'repereSquatCouche', lecteurs: ['generateur.js'],
    parAilleurs: { 'generateur.js': ['historique'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 ter.3 et ECRAN-SAISIE §7 bis.14 ter (76, 12/10/2026) : une seule table (`REPERES`, ' +
      'carnets de pratiquants : 1,21 homme, 1,52 femme) et une seule lecture (`lectureDe`), celles de « Ton parcours » ; la ' +
      'relecture de la semaine (`generateur.js`, `historique`) les lit pour la barre en retard, sans copie.' },
  // ── 66B — LES GESTES DE LA RELECTURE : une règle chacun, dans routines.js ──
  { notion: 'le retrait de séries d’une proposition de sèche (les dernières séries de travail, jusqu’à `a`)', pr: '66-U2',
    module: 'routines.js', fonction: 'retraitDeSeries', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouiDeRelecture'] },
    raison: 'QUESTIONNAIRE §5 ter.4 bis (66B) : quel exercice, quelles séries (les dernières de travail, jamais une ' +
      'chauffe), et quand la routine ne correspond plus — une règle pure ; l’écran pose ce qu’elle rend, il ne retire rien.' },
  { notion: 'la mise en tête d’un exercice et de son superset (« En faire ma priorité »)', pr: '66-U2',
    module: 'routines.js', fonction: 'miseEnTete', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouiDeRelecture'] },
    raison: 'QUESTIONNAIRE §5 ter.4 bis (66B) : le bloc (l’exercice, ou tout son superset contigu) passe avant le bloc ' +
      'visé, les numéros relus de la nouvelle adjacence (`renumeroter`, comme l’éditeur) ; l’écran ne déplace rien.' },
  // ── 66C — LE GÉNÉRATEUR V2, LE COMPLÉMENT (QUESTIONNAIRE-COACH-V2 §5 quater) ─
  { notion: 'les habitudes (séances par semaine, taille d’une séance, reps et séries habituelles par exercice)', pr: '66-U3',
    module: 'faits.js', fonction: 'habitudes', lecteurs: ['app.js'],
    // `motif` : l'APPEL seulement — `entree.habitudes` est le champ que le générateur lit.
    motif: /\.\s*habitudes\s*\(/g,
    parAilleurs: { 'app.js': ['aUnHistorique'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 quater.2 (66C) : le complément du programme déduit REÇOIT les habitudes, il ne relit ' +
      'pas les séances ; la fenêtre et la signature sont celles du déduit. 66D : « Construis-le-moi » (`app.js`, ' +
      '`aUnHistorique`) les lit pour décider du chemin et assembler l’entrée.' },
  // ── 66D — LA FIN DU GÉNÉRATEUR (QUESTIONNAIRE-COACH-V2 §5 quater.5) ─
  { notion: 'la dernière séance de la personne (là où finit SA fenêtre)', pr: '66-U4',
    module: 'faits.js', fonction: 'derniereSeance', lecteurs: ['app.js'],
    par: ['historiqueDesExercices', 'habitudes'],
    parAilleurs: { 'app.js': ['aUnHistorique'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 quater.5 (66D) : l’historique des exercices et les habitudes finissent leur fenêtre ' +
      'à la même séance, et « Construis-le-moi » y borne le fait du coach (la semaine de la dernière séance comprise) — ' +
      'une seule définition de « la dernière », extraite des deux faits qui la recalculaient.' },
  // ── 74 — « SANS MARGE » COMPTE SES REPS (MOTEUR §17.4, révisé le 11/10/2026) ─
  { notion: 'le calcul prudent (une série à fond compte une rep de moins)', pr: '74-U1',
    module: 'palier.js', fonction: 'repsPrudentes', lecteurs: ['moteur.js'],
    parAilleurs: { 'moteur.js': ['compter', 'serieAFondDe'] },
    raison: 'MOTEUR §17.4 (74) : une série à fond compte ses reps partout (`repsComptees`) ; la règle de 68B ne sert plus ' +
      'qu’à comparer — les plafonds de `consigneDExercice` rejouent la consigne en calcul prudent (`enPrudent`, par ' +
      '`compter`), et la note « sans marge » se pose sur la série qu’elle abaisse (`serieAFondDe`). Un seul endroit.' },
  // ── 78 — LA QUESTION DE RÉSERVE (MOTEUR §17.2 bis, décidée le 12/10/2026) ─────
  { notion: 'la question de réserve (quels exercices, et pourquoi : calage, écart, rappel)', pr: '78-U1',
    module: 'reserve.js', fonction: 'questionsDeReserve', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['questionsDuPlan'] },
    raison: 'MOTEUR §17.2 bis (78) : une règle fixe, testée contre `question78.py` ; le plan la porte ' +
      '(`x.questionReserve`, `x.serieReserve`, I45), figée pour la séance comme la consigne, et l’écran la lit — la ' +
      'carte de repos ne décide rien.' },
  { notion: 'le passé d’un exercice pour la réserve (l’effort de la dernière série de travail de chaque séance)', pr: '78-U1',
    module: 'reserve.js', fonction: 'passeDeReserve', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['reserveDeLaSeance'] },
    raison: 'MOTEUR §17.2 bis (78) : l’entrée de la règle, lue par `Modele.estTravail` et `Moteur.jourCivil` (jamais ' +
      'recopiés) ; l’app la fige une fois par exercice et par séance, et la passe au plan.' },
  // ── 124 (audit du 16/10/2026, 06 #5) — LE RESTE DU MOTEUR QUE LES AUTRES FICHIERS LISENT ──────────────────
  // Des faits, des formats, des lectures des lignes en base : aucune ne décide ce que le coach propose (celles qui le
  // font sont dans GARDEES). Inscrites ici, chacune a désormais ses lecteurs ; le contrôle « 124 » (plus bas) refuse
  // toute fonction de `moteur.js` lue ailleurs sans être inscrite.
  { notion: 'la structure d’une routine (ses séries par type, ses repos, ses muscles), pour l’estimer', pr: '124-U1',
    module: 'moteur.js', fonction: 'structureDeRoutine', lecteurs: ['app.js', 'deraille.js'],
    raison: 'MOTEUR §9.18 : la durée de la routine, la durée allégée, la carte de « J’ai peu de temps », la durée d’une ' +
      'carte du programme construit et la semaine qui déraille (99) lisent la même structure, jamais refaite à l’écran.' },
  { notion: 'la structure d’une semaine allégée (pour la seule estimation de sa durée)', pr: '124-U1',
    module: 'moteur.js', fonction: 'structureAllegee', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.18 (51-1 ter) : la durée allégée de la routine se lit par la même part allégée que la séance ' +
      '(`seriesAllegees`, §14.4) ; l’écran n’enlève aucune série lui-même.' },
  { notion: 'la routine raccourcie (le résultat accepté de « J’ai peu de temps » appliqué à ses lignes)', pr: '124-U1',
    module: 'moteur.js', fonction: 'appliquerRaccourci', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.18 : la séance démarre sur une COPIE de la routine, moins les lignes que `raccourcirRoutine` a ' +
      'retirées et que la personne a acceptées ; l’écran ne choisit aucune ligne.' },
  { notion: 'la durée estimée, mise en mots (« Environ 62 min (estimation) »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'texteDureeEstimee', lecteurs: ['app.js'],
    raison: 'un format : la minute arrondie une fois (`minutesDe`), par le formateur unique.' },
  { notion: 'la durée allégée, mise en mots (« Semaine allégée : environ … »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'texteDureeAllegee', lecteurs: ['app.js'],
    raison: 'un format : la même minute que la durée estimée, jamais arrondie à part.' },
  { notion: 'la durée courte d’une carte du programme construit (« ≈ 69 min »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'texteDureeCourte', lecteurs: ['app.js'],
    raison: 'un format (60-4) : la même minute que les phrases de la routine (`minutesDe`).' },
  { notion: 'le libellé d’une cible de « J’ai peu de temps » (« 45 min », « Tenir en 60 min »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'libelleCibleTemps', lecteurs: ['app.js'],
    raison: 'un format : la cible vient de `ciblesDeTemps` (gardée), le libellé dit si c’est la durée de la personne.' },
  { notion: 'un exercice qui a des muscles au catalogue', pr: '124-U1',
    module: 'moteur.js', fonction: 'aDesMuscles', lecteurs: ['generateur.js', 'profil.js', 'routines.js'],
    raison: 'les trois listes du catalogue comptées une fois (`nombreDeMuscles`) : le raccourci, Ma salle, le générateur ' +
      'et « En faire une routine » disent la même chose d’un exercice sans muscles.' },
  { notion: 'le jour civil d’un instant ou d’une date (AAAA-MM-JJ, heure locale)', pr: '124-U1',
    module: 'moteur.js', fonction: 'jourCivil', lecteurs: ['app.js', 'faits.js', 'generateur.js', 'plan.js', 'reserve.js', 'objectif.js'],
    raison: 'un seul passage d’un instant au jour du calendrier de la personne : les faits, le plan, la réserve, le ' +
      'générateur, l’objectif (124 : sa copie retirée, 01 #14) et l’app comptent les mêmes jours.' },
  { notion: 'le numéro d’un jour civil (la différence de deux numéros compte les jours du calendrier)', pr: '124-U2',
    module: 'moteur.js', fonction: 'numeroDuJour', lecteurs: ['objectif.js', 'deraille.js'],
    parAilleurs: { 'objectif.js': ['numeroDuJour'], 'deraille.js': ['numero'] },
    raison: 'audit du 16/10/2026 (01 #14) : l’arithmétique des jours civils était écrite trois fois (moteur, objectif, ' +
      'semaine qui déraille) ; une fois, au moteur.' },
  { notion: 'le jour civil d’un numéro (l’inverse)', pr: '124-U2',
    module: 'moteur.js', fonction: 'jourDuNumero', lecteurs: ['deraille.js'],
    par: ['ajouterJours'],
    parAilleurs: { 'deraille.js': ['civil'] },
    raison: 'audit du 16/10/2026 (01 #14) : le jour d’un numéro, une fois ; `ajouterJours` et la semaine qui déraille le lisent.' },
  { notion: 'la fin d’une semaine allégée acceptée', pr: '124-U1',
    module: 'moteur.js', fonction: 'finAllegee', lecteurs: ['app.js'],
    raison: 'MOTEUR §14.4 : la durée de la semaine allégée (`DUREE_ALLEGEE_JOURS`) est écrite une fois ; l’app la lit ' +
      'au moment d’écrire la réponse (app.js, `repondreCarte`).' },
  { notion: 'les cartes de l’escalier, lues dans les paris (jour, réponse, période, exercices cités)', pr: '124-U1',
    module: 'moteur.js', fonction: 'cartesDesParis', lecteurs: ['app.js'],
    raison: 'une lecture des lignes `predictions` (module escalier) : la mémoire de la carte, les fins allégées, ' +
      'l’observation et la démonstration lisent les mêmes cartes.' },
  { notion: 'les marches isolées, lues dans les paris (schéma, repli, série de plus, dégressive, remplacement)', pr: '124-U1',
    module: 'moteur.js', fonction: 'marchesDesParis', lecteurs: ['app.js'],
    raison: 'une lecture des lignes `predictions` (module escalier) : les périodes de la série de plus, l’observation et ' +
      'la démonstration lisent les mêmes marches.' },
  { notion: 'une zone par sa clé (bornes, libellé)', pr: '124-U1',
    module: 'moteur.js', fonction: 'zoneParCle', lecteurs: ['app.js', 'plan.js'],
    raison: 'les bornes d’une zone sont écrites une fois (`ZONES`) ; le plan et la démonstration les lisent par la clé.' },
  { notion: 'les charges de travail d’un exercice, séance par séance', pr: '124-U1',
    module: 'moteur.js', fonction: 'chargesDeTravailDe', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 : le bilan du bloc et la tête des records de la page d’exercice lisent les charges de travail ' +
      'comme la consigne les lit (`contratDe`), jamais recalculées à l’écran.' },
  { notion: 'les périodes des décharges planifiées (que le compteur saute)', pr: '124-U1',
    module: 'moteur.js', fonction: 'periodesDecharge', lecteurs: ['app.js'],
    raison: 'une ENTRÉE du compteur, préparée par l’app : la décharge part du même jour que la carte qui se tait ' +
      '(`debutDecharge`).' },
  { notion: 'les exercices qui ont progressé sur un bloc (l’observation du pari de programme)', pr: '124-U1',
    module: 'moteur.js', fonction: 'progresDuBilan', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 : la carte de fin de bloc et l’observation écrite en base lisent le même nombre.' },
  { notion: 'le bloc en cours d’un dossier (un seul)', pr: '124-U1',
    module: 'moteur.js', fonction: 'blocEnCours', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 : la bibliothèque, « Arrêter », « Commencer » et la feuille du bloc lisent le même bloc ' +
      '(l’index `blocs_un_en_cours`).' },
  { notion: 'le badge du bloc (« Bloc Mix · semaine 2 sur 4 », « terminé »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'badgeDuBloc', lecteurs: ['app.js'],
    raison: 'un format, sur la semaine du bloc (`semaineDuBloc`) : le coach ne commente pas l’assiduité.' },
  { notion: 'le libellé d’une zone de bloc (« Mix », « Mix (6-8) »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'libelleZoneDeBloc', lecteurs: ['app.js'],
    raison: 'un format : la feuille du programme et la carte de fin de bloc nomment la zone de la même façon.' },
  { notion: 'le bloc terminé (sa fin passée, jusqu’au choix de la personne)', pr: '124-U1',
    module: 'moteur.js', fonction: 'blocTermine', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 : la carte de fin de bloc et l’arrêt (fini ou arrêté) lisent la même fin.' },
  { notion: 'les lignes de zone qui comptent (celles d’un bloc arrêté avant son début sont ignorées)', pr: '124-U1',
    module: 'moteur.js', fonction: 'lignesDeZoneValides', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 (53-2 ter) : LA seule lecture des zones de l’app (`zonesLues`) — le plan, le compteur, le ' +
      'report, l’étiquette et le rejeu lisent les mêmes lignes.' },
  { notion: 'les lignes de zone posées à l’arrêt d’un programme (la zone d’avant le programme)', pr: '124-U1',
    module: 'moteur.js', fonction: 'lignesDArret', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.22 (53-2 ter) : la règle de l’arrêt (sauf un exercice corrigé pendant le programme) vit dans ' +
      'le moteur ; l’app pose ce qu’elle rend.' },
  { notion: 'la ligne de zone qui commence un bloc', pr: '124-U1',
    module: 'moteur.js', fonction: 'ligneDeDebutDeBloc', lecteurs: ['app.js'],
    raison: 'MOTEUR §9.10 (53-2 bis) : « Nouveau bloc » et « · bloc » se disent sur la même ligne.' },
  { notion: 'la salle en vigueur pour une charge (ses crans, l’isolation)', pr: '124-U1',
    module: 'moteur.js', fonction: 'salleEnVigueur', lecteurs: ['objectif.js', 'plan.js'],
    raison: 'MOTEUR §10 bis (108) : le plan et l’objectif lisent la même salle (une barre chargée n’est pas concernée).' },
  { notion: 'la charge la plus lourde de la salle déclarée', pr: '124-U1',
    module: 'moteur.js', fonction: 'maxDeLaSalle', lecteurs: ['objectif.js'],
    raison: 'MOTEUR §10 bis (108) : la plus lourde se lit sur les crans de la salle (`chargesDeLaSalle`), une fois.' },
  { notion: 'les noms des muscles, accordés (« tes pectoraux », « ton grand dorsal »)', pr: '124-U1',
    module: 'moteur.js', fonction: 'motsDesMuscles', lecteurs: ['generateur.js'],
    raison: 'un format de la voix du coach : les singuliers sont écrits une fois (`MUSCLES_SINGULIERS`).' },
  { notion: 'la phase effective (vide ou inconnue : maintien)', pr: '124-U2',
    module: 'profil.js', fonction: 'phaseDe', lecteurs: ['app.js', 'plan.js'],
    parAilleurs: { 'plan.js': ['phaseDuPlan'] },
    interditAilleurs: { motif: /(['"])prise_de_masse\1\s*,\s*(['"])maintien\2|===\s*(['"])prise_de_masse\3\s*\|\|/,
      raison: 'la liste des phases écrite en dur : lire `Profil.PHASES_EN_BASE` ou `Profil.phaseDe`' },
    raison: 'audit du 16/10/2026 (01 #14) : le plan (`PHASES_DU_PLAN`) et le questionnaire (`phaseSaisie`) recopiaient la ' +
      'liste du profil, et le plan son défaut (« maintien ») ; une liste, un défaut, au profil.' },
  { notion: 'deux charges égales (au centième)', pr: '124-U2',
    module: 'moteur.js', fonction: 'memeCharge', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['memeChargeOuVides'] },
    raison: 'audit du 16/10/2026 (01 #14) : deux `memeCharge`, deux sémantiques (le plan rendait vrai pour deux vides, le ' +
      'moteur faux) ; une arithmétique, au moteur, et la règle des vides nommée dans le plan (`memeChargeOuVides`).' },
  { notion: 'la zone force (Lourd, Mix)', pr: '124-U2',
    module: 'moteur.js', fonction: 'estZoneForce', lecteurs: ['plan.js', 'app.js'],
    par: ['marcheIsoleeBrute', 'degressivePossible'],
    interditAilleurs: { motif: /(['"])lourd\1\s*,\s*(['"])mix\2|===\s*(['"])lourd\3\s*\|\|[^;]*===\s*(['"])mix\4/,
      raison: 'la zone force écrite en dur (« lourd », « mix ») : passer par `Moteur.estZoneForce`' },
    raison: 'audit du 16/10/2026 (06 #16, 01 #14) : `ZONES_FORCE` et `ZONES_DE_BLOC` étaient deux listes identiques dans ' +
      'le moteur, et « lourd ou mix » s’écrivait en littéral dans le plan (la série de plus, I23, I48) et la démonstration.' },
  { notion: 'la médiane d’une liste de nombres', pr: '124-U1',
    module: 'moteur.js', fonction: 'mediane', lecteurs: ['faits.js', 'routines.js'],
    raison: 'MOTEUR §8.2, §9.1.2 : la moyenne des deux du milieu pour une longueur paire ; les habitudes et le programme ' +
      'déduit la lisent, puis arrondissent par `Routines.arrondiDeduit`.' }
];

// ── 58-1 — UN FAIT NE SE DÉCLARE QUE DANS `faits.js` ─────────────────────────
// Les noms des faits assemblés par le module : aucun autre fichier servi ne
// déclare une fonction de ce nom. Un écran qui reconstruirait « son »
// `dernierRecord` à côté du module se voit ici, même s'il n'appelle rien.
const FAITS = NOTIONS.filter((n) => n.module === 'faits.js').map((n) => n.fonction);

const CONSEIL = 'Passe par `planDeSeance` (v2/js/plan.js), ou ajoute ce fichier à la liste ' +
  'AUTORISATIONS de tests/unit/v2-architecture.test.js, avec sa raison, dans une PR qui le justifie.';

// ── LA LECTURE DU SOURCE ────────────────────────────────────────────────────
//
// Les commentaires deviennent des espaces, les chaînes aussi (sauf quand on
// cherche l'accès entre crochets) ; les sauts de ligne restent, pour que les
// numéros de ligne soient ceux de l'éditeur.
function nettoyer(src, garderChaines) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (c) => (c === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += blanc(src[i]); i++; }
      out += '  '; i += 2;
    } else if (c === '<' && src.startsWith('<!--', i)) {
      while (i < n && !src.startsWith('-->', i)) { out += blanc(src[i]); i++; }
      out += '   '; i += 3;
    } else if (c === '"' || c === '\'' || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += garderChaines ? src[i] + (src[i + 1] || '') : '  '; i += 2; continue; }
        out += garderChaines ? src[i] : blanc(src[i]);
        i++;
      }
      if (i < n) { out += q; i++; }
    } else {
      out += c; i++;
    }
  }
  return out;
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ligneDe(texte, index) {
  let l = 1;
  for (let i = 0; i < index; i++) if (texte.charCodeAt(i) === 10) l++;
  return l;
}

// Les appels d'une fonction gardée dans un source : `[{ ligne }]`.
function appels(src, g) {
  const trouves = [];
  const code = nettoyer(src, false);
  const motif = g.motif ? new RegExp(g.motif.source, 'g') : new RegExp('\\.\\s*' + echapper(g.fn) + '\\b', 'g');
  let m;
  while ((m = motif.exec(code)) !== null) trouves.push({ ligne: ligneDe(code, m.index) });
  const avecChaines = nettoyer(src, true);
  const crochets = new RegExp('\\[\\s*([\'"`])' + echapper(g.fn) + '\\1\\s*\\]', 'g');
  while ((m = crochets.exec(avecChaines)) !== null) trouves.push({ ligne: ligneDe(avecChaines, m.index) });
  return trouves;
}

function perimetre() {
  const fichiers = fs.readdirSync(path.join(V2, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ nom: f, chemin: path.join(V2, 'js', f) }));
  fichiers.push({ nom: 'index.html', chemin: path.join(V2, 'index.html') });
  return fichiers.map((f) => Object.assign(f, { src: fs.readFileSync(f.chemin, 'utf8') }));
}

// Le relevé : pour chaque fonction gardée, ses appels hors de son module.
function releve(fichiers, gardees) {
  const r = {};
  gardees.forEach((g) => {
    r[g.fn] = {};
    fichiers.forEach((f) => {
      if (f.nom === g.module) return;
      const a = appels(f.src, g);
      if (a.length) r[g.fn][f.nom] = a.map((x) => x.ligne);
    });
  });
  return r;
}

function violations(rel, autorisations) {
  const v = [];
  Object.keys(rel).forEach((fn) => {
    Object.keys(rel[fn]).forEach((fichier) => {
      if (fichier === LE_COACH) return;
      const permis = autorisations[fn] && Object.prototype.hasOwnProperty.call(autorisations[fn], fichier);
      if (!permis) {
        v.push('`' + fn + '` est appelée dans v2/' + (fichier === 'index.html' ? '' : 'js/') + fichier +
          ', ligne' + (rel[fn][fichier].length > 1 ? 's ' : ' ') + rel[fn][fichier].join(', ') +
          '. Seul le plan appelle les calculs du coach. ' + CONSEIL);
      }
    });
  });
  return v;
}

function perimees(rel, autorisations) {
  const v = [];
  Object.keys(autorisations).forEach((fn) => {
    Object.keys(autorisations[fn]).forEach((fichier) => {
      if (!rel[fn] || !rel[fn][fichier]) {
        v.push('AUTORISATIONS.' + fn + '[\'' + fichier + '\'] n’a plus d’appel : retire l’entrée — ' +
          'la liste dit ce qui est, pas ce qui a été.');
      }
    });
  });
  return v;
}

// ── LES TESTS ───────────────────────────────────────────────────────────────

describe('architecture — un seul coach, un seul câblage', () => {
  const FICHIERS = perimetre();
  const REL = releve(FICHIERS, GARDEES);

  test('chaque fonction gardée existe, exportée par le module qui la définit', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/palier.js');
    const modules = { 'moteur.js': require('../../v2/js/moteur.js'), 'seance.js': require('../../v2/js/seance.js'),
      'generateur.js': require('../../v2/js/generateur.js'), 'deraille.js': require('../../v2/js/deraille.js'),
      'objectif.js': require('../../v2/js/objectif.js') };
    const absentes = GARDEES.filter((g) => typeof modules[g.module][g.fn] !== 'function')
      .map((g) => g.module + ' n’exporte plus `' + g.fn + '` : mets la liste GARDEES à jour.');
    expect(absentes).toEqual([]);
  });

  test('la liste d’autorisations ne nomme que des fonctions gardées, et chaque entrée a sa raison', () => {
    const noms = new Set(GARDEES.map((g) => g.fn));
    Object.keys(AUTORISATIONS).forEach((fn) => {
      expect([fn, noms.has(fn)]).toEqual([fn, true]);
      Object.keys(AUTORISATIONS[fn]).forEach((f) => {
        expect([fn, f, f !== LE_COACH]).toEqual([fn, f, true]);
        const raison = AUTORISATIONS[fn][f];
        expect([fn, f, typeof raison === 'string' && raison.length > 20]).toEqual([fn, f, true]);
      });
    });
  });

  test('⚠️ LA GARDE — seuls le plan et les fichiers autorisés appellent les calculs du coach', () => {
    // Le message dit la fonction, le fichier, la ligne, et quoi faire.
    expect(violations(REL, AUTORISATIONS)).toEqual([]);
  });

  test('la liste d’autorisations dit exactement ce qui est : aucune entrée sans appel', () => {
    expect(perimees(REL, AUTORISATIONS)).toEqual([]);
  });

  test('le plan appelle bien le moteur : la garde lit le vrai câblage, pas un fichier vide', () => {
    ['reactionPour', 'planDeCouverture', 'lignesDePari', 'constatDuJour', 'consigneFigee']
      .forEach((fn) => expect([fn, !!REL[fn][LE_COACH]]).toEqual([fn, true]));
  });

  // 124 (audit du 16/10/2026, 06 #5) — LA GARDE NE PROTÈGE QUE CE QU'ON Y INSCRIT. Ce contrôle ferme le trou : toute
  // fonction exportée par `moteur.js` et lue hors du moteur et du plan est inscrite, dans GARDEES (une décision du
  // coach, avec ses autorisations) ou au registre des notions (un fait, un format, avec ses lecteurs). Une fonction
  // nouvelle du moteur, appelée par un écran sans inscription, fait échouer la garde.
  test('⚠️ 124 — une fonction de `moteur.js` lue hors du moteur et du plan est inscrite (GARDEES ou NOTIONS)', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/palier.js');
    const M = require('../../v2/js/moteur.js');
    expect(nonInscritesDuMoteur(FICHIERS, M)).toEqual([]);
  });

  test('le contrôle 124 se lit vraiment : un appel nu se voit, par chaque alias ; un champ du même nom non', () => {
    const M = { jourCivil: function () {}, fonctionNeuve: function () {}, CONSTANTE: 4 };
    const f = (nom, src) => ({ nom, src });
    const fautes = nonInscritesDuMoteur([
      f('a.js', 'var Moteur = racine.THMoteur;\nMoteur.fonctionNeuve(1);'),
      f('b.js', 'function Moteur() { return racine.THMoteur; }\nvar x = Moteur().fonctionNeuve;'),
      f('c.js', 'var y = racine.THMoteur.fonctionNeuve(2);'),
      f('d.js', 'var Mo = racine.THMoteur;\nvar z = ligne.fonctionNeuve + Mo.jourCivil(1) + Mo.CONSTANTE;'),
      f('plan.js', 'Moteur().fonctionNeuve();'),
      f('moteur.js', 'fonctionNeuve();')
    ], M);
    expect(fautes.map((x) => x.split(' :')[0])).toEqual(['a.js:2 `fonctionNeuve`', 'b.js:2 `fonctionNeuve`',
      'c.js:1 `fonctionNeuve`']);
  });
});

// 124 — les fonctions de `moteur.js` lues par un fichier (hors moteur et plan) par un alias du module (`var Mo =
// racine.THMoteur`, `function Moteur() { return racine.THMoteur; }`, ou `racine.THMoteur.x`), qui ne sont ni dans
// GARDEES ni source d'une notion. `M` : le module chargé (seules ses FONCTIONS comptent — les constantes sont des valeurs).
function nonInscritesDuMoteur(fichiers, M) {
  const inscrites = new Set(GARDEES.filter((g) => g.module === 'moteur.js').map((g) => g.fn)
    .concat(NOTIONS.filter((n) => n.module === 'moteur.js').map((n) => n.fonction)));
  const fautes = [];
  fichiers.forEach((f) => {
    if (f.nom === 'moteur.js' || f.nom === LE_COACH) return;
    const code = nettoyer(f.src, false);
    const vars = [], fns = [];
    let m;
    const reVar = /([A-Za-z_$][\w$]*)\s*=\s*racine\s*\.\s*THMoteur\b(?!\s*\.)/g;
    while ((m = reVar.exec(code)) !== null) vars.push(m[1]);
    const reFn = /function\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{\s*return\s+racine\s*\.\s*THMoteur\s*;?\s*\}/g;
    while ((m = reFn.exec(code)) !== null) fns.push(m[1]);
    const tetes = ['racine\\s*\\.\\s*THMoteur'].concat(vars.map((v) => '\\b' + echapper(v)))
      .concat(fns.map((v) => '\\b' + echapper(v) + '\\s*\\(\\s*\\)'));
    const re = new RegExp('(?:' + tetes.join('|') + ')\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
    while ((m = re.exec(code)) !== null) {
      if (typeof M[m[1]] === 'function' && !inscrites.has(m[1])) {
        fautes.push(f.nom + ':' + ligneDe(code, m.index) + ' `' + m[1] + '` : ni dans GARDEES (une décision du coach, ' +
          'avec ses autorisations) ni au registre NOTIONS (un fait, un format, avec ses lecteurs) — inscris-la.');
      }
    }
  });
  return fautes;
}

// Le corps d'une fonction déclarée `function nom(...) { … }` dans un source
// nettoyé : de son accolade ouvrante à l'accolade qui la ferme.
function corpsDe(code, nom) {
  const m = new RegExp('function\\s+' + echapper(nom) + '\\s*\\(').exec(code);
  if (!m) return null;
  let i = code.indexOf('{', m.index);
  let prof = 0;
  for (let j = i; j < code.length; j++) {
    if (code[j] === '{') prof++;
    else if (code[j] === '}' && --prof === 0) return code.slice(i, j + 1);
  }
  return null;
}

describe('architecture — le registre des notions : une source, des lecteurs', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });

  test('le registre est complet : chacune des sept PR de la consolidation y a ses notions', () => {
    const prs = ['PR 1', 'PR 2', 'PR 3', 'PR 4', 'PR 5', 'PR 6', 'PR 7'];
    expect(prs.filter((pr) => !NOTIONS.some((n) => n.pr === pr))).toEqual([]);
    // Après la consolidation (49-U20) : une notion porte le geste du chantier
    // qui l'a introduite (« 49-U20 »), ou la date d'un correctif hors chantier
    // (« correctif 03/10/2026 », le signe moins de l'assistance).
    expect(NOTIONS.filter((n) => prs.indexOf(n.pr) < 0 && !/^\d+-U\d+$/.test(n.pr) &&
      !/^correctif \d{2}\/\d{2}\/\d{4}$/.test(n.pr)).map((n) => n.notion)).toEqual([]);
  });

  test('chaque notion a sa source, déclarée dans son module, et sa raison', () => {
    NOTIONS.forEach((n) => {
      const code = nettoyer(parNom[n.module].src, false);
      expect([n.notion, !!corpsDe(code, n.fonction)]).toEqual([n.notion, true]);
      expect([n.notion, typeof n.raison === 'string' && n.raison.length > 20]).toEqual([n.notion, true]);
    });
  });

  test('⚠️ hors de son module, une notion ne se lit QUE chez ses lecteurs', () => {
    const fautes = [];
    NOTIONS.forEach((n) => {
      FICHIERS.forEach((f) => {
        if (f.nom === n.module || n.lecteurs.indexOf(f.nom) >= 0) return;
        const a = appels(f.src, { fn: n.fonction, motif: n.motif });
        if (a.length) fautes.push(n.notion + ' : `' + n.fonction + '` appelée dans ' + f.nom + ', ligne(s) ' + a.map((x) => x.ligne).join(', '));
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ dans son module, chaque fonction qui la dit passe par sa source', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.par).forEach((n) => {
      const code = nettoyer(parNom[n.module].src, false);
      n.par.forEach((fn) => {
        const corps = corpsDe(code, fn);
        if (!corps) fautes.push(n.notion + ' : `' + fn + '` n’existe plus — mets le registre à jour');
        else if (!new RegExp('\\b' + echapper(n.fonction) + '\\s*\\(').test(corps)) {
          fautes.push(n.notion + ' : `' + fn + '` ne passe pas par `' + n.fonction + '`');
        }
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ hors de son module, chaque fonction désignée passe par la source', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.parAilleurs).forEach((n) => {
      Object.keys(n.parAilleurs).forEach((fichier) => {
        const code = nettoyer(parNom[fichier].src, false);
        n.parAilleurs[fichier].forEach((fn) => {
          const corps = corpsDe(code, fn);
          if (!corps) fautes.push(n.notion + ' : `' + fn + '` n’existe plus dans ' + fichier + ' — mets le registre à jour');
          else if (!new RegExp('\\.\\s*' + echapper(n.fonction) + '\\s*\\(').test(corps)) {
            fautes.push(n.notion + ' : `' + fn + '` (' + fichier + ') ne passe pas par `' + n.fonction + '`');
          }
        });
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ aucune trace d’une décision écrite d’office', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.interdit).forEach((n) => {
      const avecChaines = nettoyer(parNom[n.module].src, true);
      const m = n.interdit.motif.exec(avecChaines);
      if (m) fautes.push(n.notion + ' : ' + n.interdit.raison + ', ligne ' + ligneDe(avecChaines, m.index));
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ aucune trace hors de son module : la définition n’est écrite qu’une fois (PR 6)', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.interditAilleurs).forEach((n) => {
      FICHIERS.forEach((f) => {
        if (f.nom === n.module) return;
        if (n.interditAilleurs.sauf && n.interditAilleurs.sauf[f.nom]) return;
        const avecChaines = nettoyer(f.src, true);
        const motif = new RegExp(n.interditAilleurs.motif.source, 'g');
        let m;
        while ((m = motif.exec(avecChaines)) !== null) {
          fautes.push(n.notion + ' : ' + n.interditAilleurs.raison + ' — ' + f.nom + ', ligne ' + ligneDe(avecChaines, m.index));
        }
      });
    });
    expect(fautes).toEqual([]);
  });

  // 75 — une exception à un interdit est nommée fichier par fichier, avec sa raison, et elle sert : le motif doit
  // encore se voir dans ce fichier (une exception sans objet se retire).
  test('⚠️ une exception à un interdit a sa raison, et elle sert encore', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.interditAilleurs && n.interditAilleurs.sauf).forEach((n) => {
      Object.keys(n.interditAilleurs.sauf).forEach((nom) => {
        const raison = n.interditAilleurs.sauf[nom];
        if (typeof raison !== 'string' || raison.length < 20) fautes.push(n.notion + ' : l’exception pour ' + nom + ' n’a pas de raison');
        const f = FICHIERS.filter((x) => x.nom === nom)[0];
        if (!f) { fautes.push(n.notion + ' : l’exception nomme ' + nom + ', qui n’existe pas'); return; }
        if (!new RegExp(n.interditAilleurs.motif.source).test(nettoyer(f.src, true))) {
          fautes.push(n.notion + ' : l’exception pour ' + nom + ' ne sert plus — retire-la');
        }
      });
    });
    expect(fautes).toEqual([]);
  });

  test('l’interdit des frères se lit vraiment : `mouvement` lu hors de `freresDe` se voit, la colonne nommée non', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'freresDe')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit('if (a.mouvement === b.mouvement) return true;')).toBe(true);
    expect(voit("var m = e['mouvement'];")).toBe(true);
    expect(voit("select('slug, nom, mouvement')")).toBe(false);
    expect(voit('Modele.freresDe(index, slug)')).toBe(false);
  });

  test('l’interdit du formateur se lit vraiment', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'nombreSigne')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("String(p).replace('.', ',')")).toBe(true);
    expect(voit("d.toLocaleDateString('fr-FR', {})")).toBe(true);
    expect(voit("'\\u2212' + x")).toBe(true);
    expect(voit("var MOIS = ['janv.', 'févr.'];")).toBe(true);
    expect(voit("Modele.nombreSigne(p)")).toBe(false);
    // 124 — les jours comme les mois.
    expect(voit("var NOMS = ['lundi', 'mardi', 'mercredi'];")).toBe(true);
    expect(voit("var J = [\"Dimanche\", \"Lundi\"];")).toBe(true);
    expect(voit("var C = ['Lun', 'Mar', 'Mer'];")).toBe(true);
    expect(voit("['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(f)")).toBe(true);
    expect(voit("var P = /^(Lundi|Mardi|Mercredi) — /;")).toBe(true);
    expect(voit("debut: depuis ? 'aujourdhui' : 'lundi'")).toBe(false);
    expect(voit("Modele.JOURS_DEPUIS_LUNDI.map(f)")).toBe(false);
  });

  test('l’interdit du silence du coach se lit vraiment : un second test de l’intention se voit, l’appel au fait non', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'coachSeTait')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("if (profil && profil.intention === 'entretien') return {};")).toBe(true);
    expect(voit("if (profil.intention !== \"entretien\") return;")).toBe(true);
    expect(voit("if (Moteur.intentionDe(profil && profil.intention, null) === 'entretien') return false;")).toBe(true);
    expect(voit('if (Moteur.coachSeTait(profil && profil.intention)) return {};')).toBe(false);
    expect(voit("var i = Moteur.intentionDe(profil && profil.intention, modeDe(slug));")).toBe(false);
    expect(voit("if (plan.intention === 'entretien') {")).toBe(false);   // le VÉRIFICATEUR lit le plan, pas le profil
  });

  test('l’interdit se lit vraiment : les trois formes écrites en dur se voient, l’appel non', () => {
    const n = NOTIONS.filter((x) => x.interditAilleurs)[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("if (s.type_serie !== 'travail') return;")).toBe(true);
    expect(voit('return Seance.typeDe(s) === "travail";')).toBe(true);
    expect(voit("((p.serie.type_serie || 'travail') === 'travail')")).toBe(true);
    expect(voit('if (!Modele.estTravail(s)) return;')).toBe(false);
    expect(voit("type_serie: 'travail',")).toBe(false);
  });

  test('le registre se lit vraiment : une décision écrite d’office et un lecteur de trop se voient', () => {
    const n = NOTIONS[1];
    expect(n.interdit.motif.test('x = c.ligne ? \'une série de plus\' : \'ta dernière série\';')).toBe(true);
    expect(n.interdit.motif.test('\'Ta dernière série a chuté après des séries stables\'')).toBe(false);
    expect(appels('var p = Moteur.pourquoiConsigne(x.consigne);', { fn: 'pourquoiConsigne' })).toHaveLength(1);
    expect(corpsDe('function a(x) { return b(x, { y: 1 }); } function c() {}', 'a')).toBe('{ return b(x, { y: 1 }); }');
  });
});

describe('architecture — le module des faits : un fait ne se déclare que dans faits.js (58-1)', () => {
  const FICHIERS = perimetre();

  test('les faits du module : trente-cinq (treize en 58-1, trois du journal en 58-2, un du questionnaire en 60-2a, un du programme déduit en 60-3, deux du programme construit en 60-4, un du jeu en 64A, un du bilan en 66A, les habitudes en 66C, la dernière séance en 66D, le récap de fin de séance en 71, l’entrée et le parcours en 75, les médailles d’une séance d’autrui en 87, mes séries comptées pour le social en 89, les records et les nombres de la guilde en 90, les trois des bilans de période en 95, les heures et les jours à la salle en 97), chacun déclaré et exporté par faits.js', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/semaine.js');
    require('../../v2/js/bilan.js');
    require('../../v2/js/palier.js');
    require('../../v2/js/moteur.js');
    require('../../v2/js/seance.js');
    require('../../v2/js/periode.js');
    require('../../v2/js/parcours.js');
    const instance = require('../../v2/js/faits.js').creer();
    expect(FAITS.length).toBe(35);
    expect(FAITS.filter((fn) => typeof instance[fn] !== 'function')).toEqual([]);
  });

  test('⚠️ aucun autre fichier servi ne déclare une fonction d’un fait', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'faits.js') return;
      const code = nettoyer(f.src, false);
      FAITS.forEach((fn) => {
        if (corpsDe(code, fn) !== null) fautes.push('`' + fn + '` est déclarée dans ' + f.nom + ' : un fait s’assemble dans faits.js, l’écran le lit.');
      });
    });
    expect(fautes).toEqual([]);
  });

  // ⚠️ LE PIÈGE DU HISSAGE (trouvé par le banc des routines, 58-1). Un `var
  // faits = 0;` local dans `rendreMesExercices` masquait l'instance du module :
  // hissé, il valait `undefined` à l'appel de `faits.datesDesExercices(…)`, et
  // « Tous mes exercices » restait vide. Dans app.js, `faits` et `corpus` ne se
  // déclarent qu'une fois — ni variable locale, ni paramètre du même nom.
  const MASQUES = (code, nom) => {
    const re = new RegExp('\\b(?:var|let|const)\\s+' + nom + '\\b|\\bfunction\\s*\\w*\\s*\\(([^)]*)\\)', 'g');
    let n = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m[1] === undefined) n++;
      else if (new RegExp('\\b' + nom + '\\b').test(m[1])) n++;
    }
    return n;
  };

  test('⚠️ dans app.js, `faits` et `corpus` ne se redéclarent pas (aucun masque de l’instance)', () => {
    const app = FICHIERS.filter((f) => f.nom === 'app.js')[0];
    const code = nettoyer(app.src, false);
    expect(MASQUES(code, 'faits')).toBe(1);
    expect(MASQUES(code, 'corpus')).toBe(0);
    expect(corpsDe(code, 'corpus')).not.toBeNull();
  });

  test('la garde du masque voit une variable locale et un paramètre', () => {
    expect(MASQUES('var faits = THFaits.creer();\nfunction f() { var faits = 0; }', 'faits')).toBe(2);
    expect(MASQUES('var faits = THFaits.creer();\nfunction f(a, faits) {}', 'faits')).toBe(2);
    expect(MASQUES('var faits = THFaits.creer();\nfunction f() { return faits.dernierRecord(c); }', 'faits')).toBe(1);
  });

  test('la garde voit vraiment une seconde déclaration', () => {
    const code = nettoyer('function dernierRecord() { return null; }\nvar x = faits.dernierRecord(c);', false);
    expect(corpsDe(code, 'dernierRecord')).not.toBeNull();
    expect(corpsDe(nettoyer('var x = faits.dernierRecord(c);', false), 'dernierRecord')).toBeNull();
  });
});

// ── 64A — LE COACH NE LIT JAMAIS LE JEU (JEU-V1 §1) ─────────────────────────
// Un seul fil, sans boucle : les faits nourrissent le coach ET le jeu ; le coach
// ne lit jamais le jeu, le jeu ne lit jamais le coach (ni plan, ni consigne, ni
// pari). `THJeu` n'apparaît que chez les lecteurs du jeu — son module seul en
// 64A ; 64B y inscrira l'écran, avec sa raison. Le source est lu commentaires
// retirés, chaînes GARDÉES (`racine['THJeu']` se voit).
// `{ fichier: raison }` — élargir est un geste conscient, avec sa raison (64B).
const LECTEURS_DU_JEU = {
  'jeu.js': 'le module du jeu lui-même.',
  'app.js': '64B (JEU-V1 §9) : l’ÉCRAN du jeu — l’onglet et ses sous-vues, le Profil, la feuille « Terminer ». Il ' +
    'calcule l’état (`etatDuJeu`, `apport`) et ses lectures, et passe des données au rendu, qui ne nomme pas le jeu.'
};
const LE_JEU_NE_NOMME_PAS = /\b(?:THPlan|THMoteur|THPalier|planDeSeance|prediction)\b/;
const nommeLeJeu = (src) => {
  const code = nettoyer(src, true);
  const lignes = [];
  const re = /\bTHJeu\b/g;
  let m;
  while ((m = re.exec(code)) !== null) lignes.push(ligneDe(code, m.index));
  return lignes;
};
const nommeLeCoach = (src) => LE_JEU_NE_NOMME_PAS.exec(nettoyer(src, true));

// 64B — LES FICHIERS DU COACH NE NOMMENT NI LE JEU NI SES FAITS. Le plan et le moteur (la consigne, la réaction),
// le palier, la semaine et le bilan (les faits du coach), la séance, le générateur, les routines, le
// questionnaire et la période (les autres voix du coach). Le coach ne parle jamais du jeu (JEU-V1 §1.1).
const FICHIERS_DU_COACH = ['plan.js', 'moteur.js', 'palier.js', 'semaine.js', 'bilan.js', 'seance.js',
  'generateur.js', 'routines.js', 'questionnaire.js', 'periode.js'];
const NOMME_LE_JEU_OU_SES_FAITS = /\b(?:THJeu|faitsDuJeu)\b/;
const coachNommeLeJeu = (src) => NOMME_LE_JEU_OU_SES_FAITS.exec(nettoyer(src, true));

describe('architecture — le coach ne lit jamais le jeu, le jeu ne lit jamais le coach (64A)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });

  test('⚠️ `THJeu` n’apparaît que chez les lecteurs du jeu', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(LECTEURS_DU_JEU, f.nom)) return;
      const l = nommeLeJeu(f.src);
      if (l.length) fautes.push('`THJeu` nommé dans ' + f.nom + ', ligne(s) ' + l.join(', ') + ' : le coach ne lit ' +
        'jamais le jeu. Un écran qui l’affiche s’inscrit dans LECTEURS_DU_JEU, avec sa raison.');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ le jeu ne nomme rien du coach (plan, moteur, palier, prédiction)', () => {
    const m = nommeLeCoach(parNom['jeu.js'].src);
    expect(m ? '`' + m[0] + '` nommé dans jeu.js' : null).toBeNull();
  });

  test('la garde lit le vrai câblage : le module du jeu existe et se nomme lui-même', () => {
    expect(nommeLeJeu(parNom['jeu.js'].src).length).toBeGreaterThan(0);
    expect(Object.keys(LECTEURS_DU_JEU).every((f) => !!parNom[f])).toBe(true);
    // Chaque lecteur a sa raison, et chacun nomme vraiment le jeu (la liste dit ce qui est).
    Object.keys(LECTEURS_DU_JEU).forEach((f) => {
      expect([f, typeof LECTEURS_DU_JEU[f] === 'string' && LECTEURS_DU_JEU[f].length > 10]).toEqual([f, true]);
      expect([f, nommeLeJeu(parNom[f].src).length > 0]).toEqual([f, true]);
    });
  });

  test('⚠️ 64B — aucun fichier du coach ne nomme `THJeu` ni `faitsDuJeu`', () => {
    const fautes = FICHIERS_DU_COACH.map((f) => {
      expect([f, !!parNom[f]]).toEqual([f, true]);
      const m = coachNommeLeJeu(parNom[f].src);
      return m ? '`' + m[0] + '` nommé dans ' + f : null;
    }).filter(Boolean);
    expect(fautes).toEqual([]);
  });

  test('64B — la garde du coach mord : un `faitsDuJeu` glissé dans moteur.js et un `THJeu` dans semaine.js se voient', () => {
    expect(coachNommeLeJeu(parNom['moteur.js'].src + '\nvar e = faits.faitsDuJeu(c, j);\n')).not.toBeNull();
    expect(coachNommeLeJeu(parNom['semaine.js'].src + '\nvar J = racine[\'THJeu\'];\n')).not.toBeNull();
    expect(coachNommeLeJeu(parNom['moteur.js'].src + '\n// faitsDuJeu, en commentaire\n')).toBeNull();
  });

  test('l’interdit se lit vraiment : un `THJeu` glissé dans plan.js et un `THMoteur` glissé dans jeu.js se voient', () => {
    const plan = parNom['plan.js'].src;
    expect(nommeLeJeu(plan)).toEqual([]);
    expect(nommeLeJeu(plan + '\nvar etat = racine.THJeu.etatDuJeu(e);\n').length).toBe(1);
    expect(nommeLeJeu(plan + '\nvar j = racine[\'THJeu\'];\n').length).toBe(1);
    expect(nommeLeJeu(plan + '\n// racine.THJeu, en commentaire\n')).toEqual([]);
    const jeu = parNom['jeu.js'].src;
    expect(nommeLeCoach(jeu)).toBeNull();
    expect(nommeLeCoach(jeu + '\nvar M = racine.THMoteur;\n')).not.toBeNull();
    ['THPlan.x', 'THPalier.y', 'planDeSeance(a)', 'Moteur.prediction(b)'].forEach((x) =>
      expect([x, nommeLeCoach(jeu + '\n' + x + ';\n') !== null]).toEqual([x, true]));
    expect(nommeLeCoach(jeu + '\n/* THMoteur, en commentaire */\n')).toBeNull();
  });
});

// La lecture elle-même : sans ces cas, un défaut du lecteur rendrait la garde
// muette sans que rien ne tombe.
describe('architecture — la lecture du source', () => {
  const G = (fn, extra) => Object.assign({ fn, module: 'moteur.js' }, extra || {});
  const FANTOME = GARDEES.filter((g) => g.fn === 'fantome')[0];

  test('les accès par propriété se voient, quel que soit l’alias', () => {
    const src = 'var a = Moteur.reactionPour(x);\nvar b = M.reactionPour(y);\n' +
      'racine.THMoteur.reactionPour(z);\nMoteur().reactionPour(w);\nMoteur[\'reactionPour\'](v);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([1, 2, 3, 4, 5]);
  });

  test('les commentaires et les chaînes ne comptent pas, les lignes restent justes', () => {
    const src = '// Moteur.reactionPour(x)\n/* M.reactionPour(\n y) */\nvar s = "Moteur.reactionPour()";\n' +
      'var t = \'M.reactionPour\';\nMoteur.reactionPour(ok);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([6]);
  });

  test('un préfixe ne compte pas : `reactionPourTout` n’est pas `reactionPour`', () => {
    expect(appels('Moteur.reactionPourTout(x);', G('reactionPour'))).toEqual([]);
  });

  test('`fantome` : l’appel qualifié par le module compte, le champ et le rappel de la vue non', () => {
    const src = 'Seance.fantome(s, 0, 1);\nvar f = vue.fantome(i, j);\nl.fantome = null;\nS().fantome(a);';
    expect(appels(src, FANTOME).map((x) => x.ligne)).toEqual([1, 4]);
  });

  test('le message d’échec dit la fonction, le fichier, la ligne, et quoi faire', () => {
    const rel = { reactionPour: { 'rendu.js': [12, 40] } };
    const v = violations(rel, {});
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('`reactionPour`');
    expect(v[0]).toContain('v2/js/rendu.js');
    expect(v[0]).toContain('lignes 12, 40');
    expect(v[0]).toContain('planDeSeance');
    expect(v[0]).toContain('AUTORISATIONS');
  });
});

// ── 55-1 — UNE FONCTION, UN NOM, PAR MODULE ─────────────────────────────────
//
// Deux déclarations du même nom dans un même module : la seconde efface la
// première, en silence. Le 06/10/2026, `bilanDe(mois)` (le bilan du mois) a
// effacé `bilanDe(bloc)` (le bilan de fin de bloc) dans `app.js` — la carte
// de fin de bloc s'est vidée, et seul le banc « cycles » l'a vu.
describe('architecture — aucune fonction de premier niveau déclarée deux fois dans un module', () => {
  const fs = require('fs');
  const path = require('path');
  const dossier = path.join(__dirname, '../../v2/js');
  test('chaque module v2 : un nom, une déclaration', () => {
    const fautes = [];
    fs.readdirSync(dossier).filter((f) => f.endsWith('.js')).forEach((f) => {
      const src = fs.readFileSync(path.join(dossier, f), 'utf8');
      const vus = {};
      const re = /^  (?:async )?function (\w+)\s*\(/gm;
      let m;
      while ((m = re.exec(src))) vus[m[1]] = (vus[m[1]] || 0) + 1;
      Object.keys(vus).filter((k) => vus[k] > 1).forEach((k) => fautes.push(f + ' : ' + k + ' (' + vus[k] + ' fois)'));
    });
    expect(fautes).toEqual([]);
  });
  test('la garde voit vraiment un doublon', () => {
    const re = /^  (?:async )?function (\w+)\s*\(/gm;
    const src = '  function a() {}\n  function a(x) {}\n    function b() {}\n';
    const noms = [];
    let m;
    while ((m = re.exec(src))) noms.push(m[1]);
    expect(noms).toEqual(['a', 'a']);
  });
});

// ── 58-2 — LE JOURNAL DES RECORDS : LU DANS `faits.js`, ÉCRIT PAR LA SEULE FILE ──
//
// La lecture est au registre (`recordsDuJournal`, lecteurs : aucun hors du
// module). L'écriture a UN chemin, et cette garde refuse un second écrivain :
//   · en base, une seule fonction touche `records` en écriture —
//     `THDonnees.ajouterRecords`, un ajout qui ignore les doublons ;
//   · elle n'est appelée que par la vidange de la file (`app.js`, `executer`) ;
//   · une entrée du journal ne se pose que par `poserJournal` (`app.js`).
describe('architecture — le journal des records : un seul écrivain (58-2)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE_RECORDS = /from\(\s*(['"])records\1\s*\)[\s\S]{0,120}?\.\s*(insert|upsert|update|delete)\s*\(/g;
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ en base, `records` ne s’écrit que dans `ajouterRecords` (donnees.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const code = nettoyer(f.src, true);
      const n = compter(code, ECRITURE_RECORDS);
      if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `records` (' + n + ')'); return; }
      const corps = corpsDe(code, 'ajouterRecords');
      if (!corps) { fautes.push('ajouterRecords absente de donnees.js'); return; }
      if (compter(corps, ECRITURE_RECORDS) !== 1 || n !== 1) fautes.push('donnees.js : ' + n + ' écriture(s) de `records`, dont ' + compter(corps, ECRITURE_RECORDS) + ' dans ajouterRecords');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ et c’est un ajout qui IGNORE les doublons — jamais un upsert qui modifie', () => {
    const corps = corpsDe(nettoyer(parNom['donnees.js'].src, true), 'ajouterRecords');
    expect(corps).toMatch(/onConflict:\s*'set_id,type'/);
    expect(corps).toMatch(/ignoreDuplicates:\s*true/);
  });

  test('⚠️ `ajouterRecords` n’est appelée que par la vidange (`executer`, app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      const a = appels(f.src, { fn: 'ajouterRecords' });
      if (!a.length) return;
      if (f.nom !== 'app.js') { fautes.push(f.nom + ' appelle ajouterRecords'); return; }
      const corps = corpsDe(nettoyer(f.src, false), 'executer');
      const dedans = corps ? (corps.match(/\.\s*ajouterRecords\s*\(/g) || []).length : 0;
      if (dedans !== a.length) fautes.push('app.js appelle ajouterRecords hors d’executer');
    });
    expect(fautes).toEqual([]);
    expect(appels(parNom['app.js'].src, { fn: 'ajouterRecords' }).length).toBe(1);
  });

  test('⚠️ une entrée du journal ne se pose que par `poserJournal` (app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      const n = (code.match(/\bAJOUTER\b/g) || []).length;
      if (!n) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserJournal') : null;
      const dedans = corps ? (corps.match(/\bAJOUTER\b/g) || []).length : 0;
      if (dedans !== n) fautes.push(f.nom + ' pose une entrée du journal hors de poserJournal');
    });
    expect(fautes).toEqual([]);
  });

  test('la garde se lit vraiment : un second écrivain se voit', () => {
    const code = nettoyer("client().from('records').upsert(l);\nclient().from('records').select('id');", true);
    expect(compter(code, ECRITURE_RECORDS)).toBe(1);
    expect(compter(nettoyer("client().from(\"records\")\n  .delete().eq('id', x);", true), ECRITURE_RECORDS)).toBe(1);
  });
});

// ── 60-2a — LA PESÉE : ÉCRITE PAR LA SEULE FILE, ET CE QUI LA FUSIONNE ────────
//
// `body_weight_log` n'était que lue ; le questionnaire en écrit une. L'écriture a
// UN chemin, comme le journal des records, et cette garde refuse un second
// écrivain :
//   · en base, une seule fonction touche la table en écriture —
//     `THDonnees.enregistrerPesee`, un upsert sur (`user_id`, `date`) qui
//     FUSIONNE (deux pesées le même jour n'en font qu'une, la dernière l'emporte) ;
//   · elle n'est appelée que par la vidange de la file (`app.js`, `executer`) ;
//   · une entrée de la file ne se pose que par `poserPesee` (`app.js`).
// ── 69 — LE RATTACHEMENT D'UN NOM IMPORTÉ : ÉCRIT PAR LA SEULE FILE ────────────
//
// `alias_exercice` (`v2_076`) : le nom Hevy qu'une personne a rattaché à un
// exercice du catalogue. Une ligne retient un choix pour tous les imports
// suivants — elle a UN chemin, comme la pesée :
//   · en base, une seule fonction touche la table en écriture —
//     `THDonnees.enregistrerAlias`, un upsert sur (`user_id`, `alias_norme`) qui
//     FUSIONNE (rattacher de nouveau le même nom remplace le choix) ;
//   · elle n'est appelée que par la vidange de la file (`app.js`, `executer`) ;
//   · une entrée de la file ne se pose que par `poserAlias` (`app.js`).
describe('architecture — le rattachement d’un nom importé : un seul écrivain (69)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE_ALIAS = /from\(\s*(['"])alias_exercice\1\s*\)[\s\S]{0,120}?\.\s*(insert|upsert|update|delete)\s*\(/g;
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ en base, `alias_exercice` ne s’écrit que dans `enregistrerAlias` (donnees.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const code = nettoyer(f.src, true);
      const n = compter(code, ECRITURE_ALIAS);
      if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `alias_exercice` (' + n + ')'); return; }
      const corps = corpsDe(code, 'enregistrerAlias');
      if (!corps) { fautes.push('enregistrerAlias absente de donnees.js'); return; }
      if (compter(corps, ECRITURE_ALIAS) !== 1 || n !== 1) {
        fautes.push('donnees.js : ' + n + ' écriture(s) de `alias_exercice`, dont ' + compter(corps, ECRITURE_ALIAS) + ' dans enregistrerAlias');
      }
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ et c’est un upsert qui FUSIONNE sur (user_id, alias_norme), sans jamais envoyer la colonne générée', () => {
    const corps = corpsDe(nettoyer(parNom['donnees.js'].src, true), 'enregistrerAlias');
    expect(corps).toMatch(/onConflict:\s*'user_id,alias_norme'/);
    expect(corps).not.toMatch(/ignoreDuplicates/);
    const pose = corpsDe(nettoyer(parNom['app.js'].src, true), 'poserAlias');
    expect(pose).not.toMatch(/alias_norme/);
  });

  test('⚠️ `enregistrerAlias` n’est appelée que par la vidange (`executer`, app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      const a = appels(f.src, { fn: 'enregistrerAlias' });
      if (!a.length) return;
      if (f.nom !== 'app.js') { fautes.push(f.nom + ' appelle enregistrerAlias'); return; }
      const corps = corpsDe(nettoyer(f.src, false), 'executer');
      const dedans = corps ? (corps.match(/\.\s*enregistrerAlias\s*\(/g) || []).length : 0;
      if (dedans !== a.length) fautes.push('app.js appelle enregistrerAlias hors d’executer');
    });
    expect(fautes).toEqual([]);
    expect(appels(parNom['app.js'].src, { fn: 'enregistrerAlias' }).length).toBe(1);
  });

  test('⚠️ une entrée de la file pour un rattachement ne se pose que par `poserAlias` (app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      const poses = (code.match(/table:\s*Attente\.ALIAS\b/g) || []).length;
      if (!poses) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserAlias') : null;
      const dedans = corps ? (corps.match(/table:\s*Attente\.ALIAS\b/g) || []).length : 0;
      if (dedans !== poses) fautes.push(f.nom + ' pose une entrée de rattachement hors de poserAlias');
    });
    expect(fautes).toEqual([]);
    expect(corpsDe(nettoyer(parNom['app.js'].src, false), 'poserAlias')).toMatch(/table:\s*Attente\.ALIAS\b/);
  });
});

describe('architecture — la pesée : un seul écrivain (60-2a)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE_PESEES = /from\(\s*(['"])body_weight_log\1\s*\)[\s\S]{0,120}?\.\s*(insert|upsert|update|delete)\s*\(/g;
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ en base, `body_weight_log` ne s’écrit que dans `enregistrerPesee` (donnees.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const code = nettoyer(f.src, true);
      const n = compter(code, ECRITURE_PESEES);
      if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `body_weight_log` (' + n + ')'); return; }
      const corps = corpsDe(code, 'enregistrerPesee');
      if (!corps) { fautes.push('enregistrerPesee absente de donnees.js'); return; }
      if (compter(corps, ECRITURE_PESEES) !== 1 || n !== 1) {
        fautes.push('donnees.js : ' + n + ' écriture(s) de `body_weight_log`, dont ' + compter(corps, ECRITURE_PESEES) + ' dans enregistrerPesee');
      }
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ et c’est un upsert qui FUSIONNE sur (user_id, date) — jamais un ajout qui ignore les doublons', () => {
    const corps = corpsDe(nettoyer(parNom['donnees.js'].src, true), 'enregistrerPesee');
    expect(corps).toMatch(/onConflict:\s*'user_id,date'/);
    expect(corps).not.toMatch(/ignoreDuplicates/);
  });

  test('⚠️ `enregistrerPesee` n’est appelée que par la vidange (`executer`, app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      const a = appels(f.src, { fn: 'enregistrerPesee' });
      if (!a.length) return;
      if (f.nom !== 'app.js') { fautes.push(f.nom + ' appelle enregistrerPesee'); return; }
      const corps = corpsDe(nettoyer(f.src, false), 'executer');
      const dedans = corps ? (corps.match(/\.\s*enregistrerPesee\s*\(/g) || []).length : 0;
      if (dedans !== a.length) fautes.push('app.js appelle enregistrerPesee hors d’executer');
    });
    expect(fautes).toEqual([]);
    expect(appels(parNom['app.js'].src, { fn: 'enregistrerPesee' }).length).toBe(1);
  });

  test('⚠️ une entrée de la file pour une pesée ne se pose que par `poserPesee` (app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      // `Attente.PESEES` se lit aussi à l'exécution (`executer`) et à la
      // synchronisation (`protegees`) : ce qui est interdit, c'est de POSER
      // une entrée de cette table ailleurs que dans `poserPesee`.
      const poses = (code.match(/table:\s*Attente\.PESEES\b/g) || []).length;
      if (!poses) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserPesee') : null;
      const dedans = corps ? (corps.match(/table:\s*Attente\.PESEES\b/g) || []).length : 0;
      if (dedans !== poses) fautes.push(f.nom + ' pose une entrée de pesée hors de poserPesee');
    });
    expect(fautes).toEqual([]);
    expect(corpsDe(nettoyer(parNom['app.js'].src, false), 'poserPesee')).toMatch(/table:\s*Attente\.PESEES\b/);
  });

  test('la garde se lit vraiment : un second écrivain se voit, une lecture non', () => {
    const code = nettoyer("client().from('body_weight_log').upsert(l);\nclient().from('body_weight_log').select('id');", true);
    expect(compter(code, ECRITURE_PESEES)).toBe(1);
    expect(compter(nettoyer("client().from(\"body_weight_log\")\n  .delete().eq('id', x);", true), ECRITURE_PESEES)).toBe(1);
    expect(compter(nettoyer("return client().from('body_weight_log').select('id, date, poids_kg, source');", true), ECRITURE_PESEES)).toBe(0);
  });
});

// ══ 107 — LES GESTES SOCIAUX : UN SEUL CHEMIN, LA FILE (SOCIAL-V1 §8) ═══════════
//
// Un geste fait hors ligne part au retour du réseau, comme une séance. Il n'a donc QU'UN chemin : posé par
// `poserGesteSocial` (une entrée `social` par geste), envoyé par la vidange (`executer` → `executerGesteSocial`),
// écrit par l'écrivain de sa table dans `donnees.js`. Une écriture directe depuis un écran — l'ancien chemin d'avant
// 107, qui perdait le geste hors ligne — se voit ici.
describe('architecture — les gestes sociaux : un seul chemin, la file (107)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const TABLES = {
    abonnements: ['sAbonner', 'retirerAbonnement', 'accepterDemande'],
    blocages: ['bloquer', 'debloquer'],
    reactions_seance: ['reagir', 'retirerReaction']
  };
  const ecriture = (table) => new RegExp('from\\(\\s*([\'"])' + table + '\\1\\s*\\)[\\s\\S]{0,120}?\\.\\s*(insert|upsert|update|delete)\\s*\\(', 'g');
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ `abonnements`, `blocages`, `reactions_seance` ne s’écrivent que dans leurs écrivains (donnees.js)', () => {
    const fautes = [];
    Object.keys(TABLES).forEach((table) => {
      FICHIERS.forEach((f) => {
        const code = nettoyer(f.src, true);
        const n = compter(code, ecriture(table));
        if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `' + table + '`'); return; }
        const dedans = TABLES[table].reduce((t, fn) => t + compter(corpsDe(code, fn) || '', ecriture(table)), 0);
        if (dedans !== n || n !== TABLES[table].length) fautes.push('donnees.js : ' + n + ' écriture(s) de `' + table + '`, dont ' + dedans + ' dans ses écrivains');
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ une fonction de guilde qui écrit ne part que par `gesteDeGuilde` — et la liste est la même des deux côtés', () => {
    const Social = require('../../v2/js/social.js');
    const Donnees = require('../../v2/js/donnees.js');
    expect(Donnees.GESTES_GUILDE).toEqual(Social.GESTES_DE_GUILDE);
    const fautes = [];
    const appelDirect = new RegExp('rpc\\(\\s*([\'"])(' + Social.GESTES_DE_GUILDE.join('|') + ')\\1', 'g');
    FICHIERS.forEach((f) => {
      const n = compter(nettoyer(f.src, true), appelDirect);
      if (n) fautes.push(f.nom + ' appelle une fonction de guilde qui écrit sans passer par la file (' + n + ')');
    });
    expect(fautes).toEqual([]);
    expect(corpsDe(nettoyer(parNom['donnees.js'].src, false), 'gesteDeGuilde')).toMatch(/\.\s*rpc\s*\(\s*nom\b/);
  });

  test('⚠️ une entrée sociale de la file ne se pose que par `poserGesteSocial`, et ne part que par `executerGesteSocial`', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      const poses = (code.match(/table:\s*Attente\.SOCIAL\b/g) || []).length;
      if (!poses) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserGesteSocial') : null;
      const dedans = corps ? (corps.match(/table:\s*Attente\.SOCIAL\b/g) || []).length : 0;
      if (dedans !== poses) fautes.push(f.nom + ' pose une entrée sociale hors de poserGesteSocial');
    });
    expect(fautes).toEqual([]);
    const app = nettoyer(parNom['app.js'].src, false);
    expect(corpsDe(app, 'executer')).toMatch(/Attente\.SOCIAL\)\s*return\s+executerGesteSocial\(/);
    // Chaque écrivain social a son appel dans `executerGesteSocial`, et nulle part ailleurs dans app.js.
    Object.keys(TABLES).reduce((t, k) => t.concat(TABLES[k]), ['gesteDeGuilde']).forEach((fn) => {
      const tous = (app.match(new RegExp('\\.\\s*' + fn + '\\s*\\(', 'g')) || []).length;
      const dedans = (corpsDe(app, 'executerGesteSocial').match(new RegExp('\\.\\s*' + fn + '\\s*\\(', 'g')) || []).length;
      if (!dedans || tous !== dedans) fautes.push(fn + ' : ' + tous + ' appel(s) dans app.js, ' + dedans + ' dans executerGesteSocial');
    });
    expect(fautes).toEqual([]);
  });

  test('la garde se lit vraiment : une écriture directe se voit, une lecture non', () => {
    expect(compter(nettoyer("client().from('abonnements').insert({ suiveur: a, suivi: b });", true), ecriture('abonnements'))).toBe(1);
    expect(compter(nettoyer("client().from('abonnements').select('suivi');", true), ecriture('abonnements'))).toBe(0);
    expect(compter(nettoyer("return client().rpc('guilde_creer', { p_nom: n });", true),
      new RegExp('rpc\\(\\s*([\'"])(guilde_creer)\\1', 'g'))).toBe(1);
  });
});

// ══ 73 — LA CARTE DES ÉCRITURES (fin de la passe sécurité, audit 72) ═══════════
//
// Toute écriture vers Supabase passe par une fonction de `donnees.js` (ou par `auth.js`, pour l'authentification),
// et chacune est AU REGISTRE : soit par la FILE (appelée seulement depuis `executer` ou ce qu'il appelle), soit en
// LISTE BLANCHE, avec ses appelants exacts et sa raison. Un écrivain hors registre, une entrée dont un appelant a
// disparu, un appel d'un appelant non déclaré, un `.from(variable)` : la garde échoue, avec le nom. Les appels par
// l'écrivain injecté (`ecrivain.x`, `routines.js`) comptent comme des appels de `x`. Les gardes « un seul écrivain »
// (records, pesées, `alias_exercice`) restent ; la carte les complète.
const RAISON_BIBLIOTHEQUE = 'geste de bibliothèque, fait hors de la salle, qui échoue avec un message et garde le brouillon';
// 107 — les GESTES sociaux passent par la file ; restent en liste blanche les PUBLICATIONS (mes scores), recalculées
// sur l'appareil à chaque ouverture et à chaque fin de séance.
const RAISON_PUBLICATION = 'publication recalculée sur l’appareil (seulement ce qui a changé) à chaque ouverture du social et à '
  + 'chaque fin de séance : un envoi raté repart à la suivante, rien n’est perdu';
// 117 (audit du 16/10, 06 #3) — le groupe de séance : en direct, jamais par la file (SOCIAL-V1 §7).
const RAISON_GROUPE = 'le groupe de séance est du temps réel, fait réseau présent (son écran se lit au serveur) ; « le direct '
  + 'est une décoration, jamais une dépendance » (SOCIAL-V1 §7) : hors de la file, un échec se dit et se refait';
const REGISTRE_ECRITURES = [
  // ── Par la file : `executer` (app.js) et ce qu'il appelle.
  { fn: 'enregistrerSeance', chemin: 'file' },
  { fn: 'supprimerSeance', chemin: 'file' },
  { fn: 'remplacerSeries', chemin: 'file' },
  { fn: 'enregistrerZone', chemin: 'file' },
  { fn: 'enregistrerMode', chemin: 'file' },
  { fn: 'enregistrerBloc', chemin: 'file' },
  { fn: 'enregistrerPrediction', chemin: 'file' },
  { fn: 'observerPrediction', chemin: 'file' },
  { fn: 'ajouterRecords', chemin: 'file' },
  { fn: 'enregistrerPesee', chemin: 'file' },
  { fn: 'enregistrerAlias', chemin: 'file' },
  { fn: 'enregistrerChoixDeSemaine', chemin: 'file' },
  // 107 (SOCIAL-V1 §8) — les gestes sociaux : `executer` → `executerGesteSocial`, dans l'ordre ; un geste qui annule le précédent le remplace (l'état final seul part).
  { fn: 'sAbonner', chemin: 'file' },
  { fn: 'retirerAbonnement', chemin: 'file' },
  { fn: 'accepterDemande', chemin: 'file' },
  { fn: 'bloquer', chemin: 'file' },
  { fn: 'debloquer', chemin: 'file' },
  { fn: 'reagir', chemin: 'file' },
  { fn: 'retirerReaction', chemin: 'file' },
  { fn: 'gesteDeGuilde', chemin: 'file' },

  { fn: 'enregistrerObjectif', chemin: 'file' },
  { fn: 'retirerObjectif', chemin: 'file' },
  // ── En liste blanche : des appelants exacts, une raison.
  { fn: 'supprimerCompte', chemin: 'liste-blanche', appelants: ['app.js:supprimerCompte'],
    raison: 'la suppression de compte exige le serveur ; rien n’est effacé localement avant sa réponse' },
  { fn: 'enregistrerProfil', chemin: 'liste-blanche', appelants: ['app.js:chargerProfil', 'app.js:envoyerProfilMaintenant'],
    raison: 'le profil a son propre canal, local d’abord, avec un drapeau persistant (60-2c)' },
  // Deux appelants, deux raisons : une par appelant (`raisons`), la garde exige qu'elles se correspondent.
  { fn: 'refermerSeance', chemin: 'liste-blanche',
    appelants: ['app.js:resoudreSeanceEnCoursDistante', 'app.js:refermerSeancesSauf', 'app.js:avantDeCommencer'],
    raisons: {
      'app.js:avantDeCommencer': 'la réponse de l’utilisateur (84) : « La terminer et commencer » referme la séance vivante '
        + 'd’un autre appareil avant d’en créer une ; si elle échoue, l’envoi de la nouvelle la refermera (`refermerSeancesSauf`)',
      'app.js:resoudreSeanceEnCoursDistante': 'ménage recalculé à chaque lancement : rien à perdre s’il échoue',
      'app.js:refermerSeancesSauf': 'réparation d’un conflit pendant l’envoi de la file : referme une séance restée ouverte en base, '
        + 'autre que celle qu’on envoie ; si elle échoue, l’envoi suivant la retente'
    } },
  // Une LECTURE par une fonction du serveur (`.rpc(`), que la règle d'écriture attrape : rien n'est écrit.
  { fn: 'pseudoPris', chemin: 'liste-blanche', appelants: ['app.js:var SAISIES', 'app.js:sonderPseudo'],
    raison: 'une lecture (ce pseudo est-il pris ?) par une fonction du serveur : rien n’est écrit' },
  // La bibliothèque de routines : les écrivains, appelés par `routines.js` (l'écrivain injecté) ou par un geste.
  { fn: 'creerRoutine', chemin: 'liste-blanche', appelants: ['routines.js:enregistrer'], raison: RAISON_BIBLIOTHEQUE },
  { fn: 'majRoutine', chemin: 'liste-blanche', appelants: ['routines.js:enregistrer', 'app.js:enregistrerOrdreBibliotheque'],
    raison: RAISON_BIBLIOTHEQUE },
  { fn: 'supprimerRoutine', chemin: 'liste-blanche',
    appelants: ['routines.js:enregistrer', 'app.js:supprimerCourante', 'app.js:creerDansUnDossier'], raison: RAISON_BIBLIOTHEQUE },
  { fn: 'insererExercices', chemin: 'liste-blanche', appelants: ['routines.js:appliquerPlan'], raison: RAISON_BIBLIOTHEQUE },
  { fn: 'supprimerExercices', chemin: 'liste-blanche', appelants: ['routines.js:appliquerPlan'], raison: RAISON_BIBLIOTHEQUE },
  { fn: 'remplacerSeriesRoutine', chemin: 'liste-blanche', appelants: ['routines.js:appliquerPlan'], raison: RAISON_BIBLIOTHEQUE },
  // ── 87 (SOCIAL-V1) — les lectures sociales passent par les fonctions de la base (`.rpc(`) : rien n'est écrit. Les
  // GESTES (107) sont plus haut, par la file ; ceux de la guilde par `gesteDeGuilde`, seul à appeler une fonction qui écrit.
  { fn: 'rpc', chemin: 'liste-blanche', appelants: [],
    raison: 'les lectures sociales par les fonctions de la base (`social_*`, v2_078) : rien n’est écrit — `rpc` refuse '
      + 'les fonctions qui écrivent (`GESTES_GUILDE`, `GESTES_GROUPE`), garde « rpc ne fait que lire » (117)' },
  // ── 117 (audit du 16/10, 06 #3) — LE GROUPE DE SÉANCE (v2_082) : ses huit fonctions qui écrivent passaient par `rpc`,
  // inscrite comme une lecture. Elles ont leur écrivain (`groupeEcrire`) et sont au registre, EN DIRECT, hors file.
  { fn: 'groupeEcrire', chemin: 'liste-blanche', appelants: [],
    raison: 'l’écrivain unique des gestes du groupe (`GESTES_GROUPE`) ; relayé par les écrivains ci-dessous, jamais appelé d’ailleurs' },
  { fn: 'groupeGeste', chemin: 'liste-blanche', appelants: [], raison: 'relais de `groupeEcrire` pour les gestes sans réponse' },
  { fn: 'groupeCreer', chemin: 'liste-blanche', appelants: ['app.js:inviterAuGroupe'], raison: RAISON_GROUPE },
  { fn: 'groupeInviter', chemin: 'liste-blanche', appelants: ['app.js:inviterAuGroupe'], raison: RAISON_GROUPE },
  { fn: 'groupeAnnulerInvitation', chemin: 'liste-blanche', appelants: ['app.js:annulerInvitation'], raison: RAISON_GROUPE },
  { fn: 'groupeRejoindre', chemin: 'liste-blanche', appelants: ['app.js:rejoindre'], raison: RAISON_GROUPE },
  { fn: 'groupePublier', chemin: 'liste-blanche', appelants: ['app.js:publierMesExercices', 'app.js:publierFinPourLeGroupe'],
    raison: RAISON_GROUPE },
  { fn: 'groupeEnvoyer', chemin: 'liste-blanche', appelants: ['app.js:envoyerFileGroupe'],
    raison: RAISON_GROUPE + ' ; un message écrit hors ligne attend dans la file du groupe (`grp.file`), sur l’appareil' },
  { fn: 'groupeFermer', chemin: 'liste-blanche', appelants: ['app.js:fermerRecapGroupe'], raison: RAISON_GROUPE },
  { fn: 'groupeQuitter', chemin: 'liste-blanche', appelants: ['app.js:quitterLeGroupeSiMembre'], raison: RAISON_GROUPE },
  // ── 89 (SOCIAL-V1 « Étage 2 ») — mes scores de force (`scores_force`, v2_079) : le score et la charge, jamais le poids.
  { fn: 'publierScores', chemin: 'liste-blanche', appelants: ['app.js:publierScoresForce'], raison: RAISON_PUBLICATION },
  { fn: 'retirerScores', chemin: 'liste-blanche', appelants: ['app.js:publierScoresForce'], raison: RAISON_PUBLICATION },
  // ── 90 (SOCIAL-V1 « Guilde ») — mes nombres de guilde (`guilde_scores`, v2_080), déjà calculés sur l'appareil.
  { fn: 'publierScoresGuilde', chemin: 'liste-blanche', appelants: ['app.js:publierScoresGuilde', 'app.js:publierScoresGuildeDeLaFile'],
    raisons: {
      'app.js:publierScoresGuilde': RAISON_PUBLICATION + ' — à l’ouverture de la guilde, en direct (la jauge lue juste après les contient)',
      // 121 (audit du 16/10, 05 #5) — à la fin d'une séance et au démarrage : par la file (`poserScoresGuilde` →
      // `executerGesteSocial`), seulement membre (`guilde_moi`).
      'app.js:publierScoresGuildeDeLaFile': RAISON_PUBLICATION + ' — à la fin d’une séance et au démarrage, PAR LA FILE ' +
        '(`executerGesteSocial`), seulement si je suis membre'
    } },
  // `executer` : une réponse du chantier 26 encore en file (une ligne, des champs) — par la file, elle aussi.
  { fn: 'majExercice', chemin: 'liste-blanche', appelants: ['routines.js:appliquerPlan', 'app.js:executer'], raison: RAISON_BIBLIOTHEQUE }
];
// L'authentification : `auth.js`, qui ne touche que `.auth.*`.
const AUTHENTIFICATION = { fichier: 'auth.js', raison: 'l’authentification exige le serveur' };
// LES GESTES DE LA BIBLIOTHÈQUE (app.js) qui atteignent un écrivain de routine — directement, par l'écrivain injecté
// (`Routines.enregistrer`, `Routines.appliquerPlan`), ou par un autre geste. `relais` : un geste qui n'est qu'un
// passage (tous ses appelants doivent être au registre).
const GESTES_BIBLIOTHEQUE = [
  { geste: 'enregistrerBrouillon', quoi: 'l’éditeur : « Enregistrer »', raison: RAISON_BIBLIOTHEQUE },
  { geste: 'dupliquerRoutine', quoi: '« Dupliquer »', raison: RAISON_BIBLIOTHEQUE },
  { geste: 'supprimerCourante', quoi: '« Supprimer »', raison: RAISON_BIBLIOTHEQUE },
  { geste: 'enregistrerOrdreBibliotheque', quoi: '« Réorganiser »', raison: RAISON_BIBLIOTHEQUE },
  { geste: 'creerDansUnDossier', quoi: '« Retrouver mes routines », le programme du questionnaire', raison: RAISON_BIBLIOTHEQUE },
  { geste: 'creerRoutineDepuisSeance', quoi: '« En faire une routine »', raison: 'à passer par la file (noté le 11/10)' },
  { geste: 'creerRoutineNeuve', quoi: 'relais de « En faire une routine » et de `creerDansUnDossier`', relais: true },
  // Par la file : le report de fin de séance (`executer` → `appliquerReportRoutine` → `Routines.appliquerPlan`).
  { geste: 'appliquerReportRoutine', quoi: 'le report sur la routine, par la file', file: true }
];

describe('architecture — la carte des écritures (73, audit 72)', () => {
  const FICHIERS = perimetre().filter((f) => f.nom.endsWith('.js'));
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE = /\.\s*(insert|upsert|update|delete|rpc)\s*\(/;

  // Les fonctions de premier niveau d'un source nettoyé : `{ nom, debut, fin }` (accolades appariées).
  function fonctionsDe(code) {
    const out = [];
    // Une fonction de premier niveau, ou une variable de premier niveau qui en contient (`var X = { f: function … }`).
    const re = /^ {2}(?:(?:async\s+)?function\s+(\w+)\s*\(|var\s+(\w+)\s*=\s*[{[])/mg;
    let m;
    while ((m = re.exec(code)) !== null) {
      const nom = m[1] || m[2];
      let i = m[1] ? code.indexOf('{', m.index) : m.index + m[0].length - 1, prof = 0, fin = code.length;
      const ouvre = code[i], ferme = ouvre === '[' ? ']' : '}';
      for (let j = i; j < code.length; j++) {
        if (code[j] === ouvre) prof++;
        else if (code[j] === ferme && --prof === 0) { fin = j; break; }
      }
      out.push({ nom: m[1] ? nom : 'var ' + nom, debut: m.index, fin });
    }
    return out;
  }
  const FONCTIONS = {};
  FICHIERS.forEach((f) => { f.code = nettoyer(f.src, false); f.codeChaines = nettoyer(f.src, true); FONCTIONS[f.nom] = fonctionsDe(f.code); });
  const englobante = (fichier, index) => {
    const g = FONCTIONS[fichier].filter((x) => x.debut <= index && index <= x.fin)[0];
    return fichier + ':' + (g ? g.nom : '(hors fonction)');
  };

  // Les appelants directs d'un écrivain `x` : `Donnees.x(`, `THDonnees.x(`, `ecrivain.x(`, hors de `donnees.js`.
  function appelantsDe(x) {
    const out = new Set();
    const re = new RegExp('\\b(?:Donnees|THDonnees|ecrivain)\\s*\\.\\s*' + x + '\\s*\\(', 'g');
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      let m;
      while ((m = re.exec(f.code)) !== null) out.add(englobante(f.nom, m.index));
    });
    return Array.from(out).sort();
  }
  // Les appelants directs d'une fonction de app.js (`nom(`, sans point devant), dans app.js.
  function appelantsDansApp(nom) {
    const out = new Set();
    const re = new RegExp('(^|[^.\\w])' + nom + '\\s*\\(', 'g');
    let m;
    const app = parNom['app.js'];
    while ((m = re.exec(app.code)) !== null) {
      const i = m.index + m[1].length;
      const g = FONCTIONS['app.js'].filter((x) => x.debut <= i && i <= x.fin)[0];
      if (g && g.nom !== nom) out.add(g.nom);
    }
    return Array.from(out).sort();
  }

  // Ce qu'`executer` atteint : les fonctions de app.js qu'il appelle, et celles de routines.js (`Routines.x(`),
  // de proche en proche.
  function fermetureDeExecuter() {
    const vues = new Set(['app.js:executer']);
    const pile = ['app.js:executer'];
    while (pile.length) {
      const [fichier, nom] = pile.pop().split(':');
      const g = FONCTIONS[fichier].filter((x) => x.nom === nom)[0];
      if (!g) continue;
      const corps = parNom[fichier].code.slice(g.debut, g.fin);
      const re = /(Routines\s*\.\s*)?\b(\w+)\s*\(/g;
      let m;
      while ((m = re.exec(corps)) !== null) {
        const cible = m[1] ? 'routines.js' : fichier;
        if (!m[1] && /\.\s*$/.test(corps.slice(0, m.index))) continue;
        const cle = cible + ':' + m[2];
        if (!vues.has(cle) && FONCTIONS[cible].some((x) => x.nom === m[2])) { vues.add(cle); pile.push(cle); }
      }
    }
    return vues;
  }
  const FILE = fermetureDeExecuter();

  test('`client()` n’apparaît que dans `donnees.js` et `auth.js` ; `auth.js` ne touche que `.auth.*`', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const n = (f.code.match(/\bclient\s*\(\s*\)/g) || []).length;
      if (n && f.nom !== 'donnees.js' && f.nom !== 'auth.js') fautes.push(f.nom + ' appelle client() (' + n + ')');
    });
    const auth = parNom['auth.js'].code;
    (auth.match(/\bclient\s*\(\s*\)\s*\.\s*(\w+)/g) || []).forEach((x) => {
      if (!/\.\s*auth$/.test(x)) fautes.push('auth.js : ' + x.replace(/\s+/g, ''));
    });
    if (ECRITURE.test(auth.replace(/\.auth\.\w+\(/g, ''))) fautes.push('auth.js écrit hors de `.auth.*`');
    expect(fautes).toEqual([]);
    expect(AUTHENTIFICATION.raison).toBe('l’authentification exige le serveur');
  });

  test('aucun `fetch` dans le code de l’app ; l’adresse du serveur n’est écrite que dans `config.js`', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (/\bfetch\s*\(/.test(f.code)) fautes.push(f.nom + ' appelle fetch');
      if (f.nom !== 'config.js' && /supabase\.co/.test(f.codeChaines)) fautes.push(f.nom + ' écrit l’adresse de supabase.co');
    });
    expect(fautes).toEqual([]);
  });

  test('chaque `.from(` porte un nom de table littéral', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const re = /(\w*)\s*\.\s*from\s*\(\s*([^)]*)\)/g;
      let m;
      while ((m = re.exec(f.codeChaines)) !== null) {
        if (m[1] === 'Array') continue;
        if (!/^(['"])[a-z_]+\1$/.test(m[2].trim())) fautes.push(f.nom + ', ligne ' + ligneDe(f.codeChaines, m.index) + ' : from(' + m[2].trim() + ')');
      }
    });
    expect(fautes).toEqual([]);
  });

  // 117 (audit du 16/10, 06 #3) — UN ÉCRIVAIN SE VOIT AUSSI PAR CE QU'IL APPELLE. Les gestes du groupe appelaient
  // `rpc(` sans point devant : la règle `.rpc(` ne les voyait pas. Désormais, dans `donnees.js`, une fonction qui
  // appelle (sans point) un écrivain est un écrivain, de proche en proche — sauf `rpc`, dont la garde ci-dessous
  // prouve qu'elle ne fait que lire.
  function ecrivainsDeDonnees() {
    const d = parNom['donnees.js'];
    const corps = {};
    FONCTIONS['donnees.js'].forEach((g) => { corps[g.nom] = d.code.slice(g.debut, g.fin); });
    const ecrivains = new Set(Object.keys(corps).filter((n) => ECRITURE.test(corps[n])));
    let change = true;
    while (change) {
      change = false;
      Object.keys(corps).forEach((n) => {
        if (ecrivains.has(n)) return;
        const appelle = Array.from(ecrivains).some((w) => w !== 'rpc' &&
          new RegExp('(^|[^.\\w])' + w + '\\s*\\(').test(corps[n].slice(corps[n].indexOf('{') + 1)));
        if (appelle) { ecrivains.add(n); change = true; }
      });
    }
    return Array.from(ecrivains);
  }

  test('⚠️ 117 — `rpc` ne fait que lire : elle refuse les fonctions qui écrivent, et aucun appel ne lui en passe une', () => {
    const d = parNom['donnees.js'];
    const liste = (nom) => {
      const m = new RegExp('var ' + nom + ' = \\[([^\\]]*)\\]').exec(d.codeChaines);
      return m ? m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')) : null;
    };
    const guilde = liste('GESTES_GUILDE'), groupe = liste('GESTES_GROUPE');
    expect(groupe).toEqual(['groupe_creer', 'groupe_inviter', 'groupe_annuler_invitation', 'groupe_repondre', 'groupe_publier',
      'groupe_envoyer', 'groupe_fermer', 'groupe_quitter']);
    expect(guilde && guilde.length).toBeGreaterThan(0);
    const g = FONCTIONS['donnees.js'].filter((x) => x.nom === 'rpc')[0];
    expect(d.code.slice(g.debut, g.fin)).toMatch(/GESTES_GUILDE\.indexOf\(nom\) >= 0 \|\| GESTES_GROUPE\.indexOf\(nom\) >= 0/);
    const fautes = [];
    const re = /(^|[^.\w])rpc\s*\(\s*(['"])(\w+)\2/g;
    let m;
    while ((m = re.exec(d.codeChaines)) !== null) {
      if (guilde.indexOf(m[3]) >= 0 || groupe.indexOf(m[3]) >= 0) fautes.push(m[3] + ' passe par `rpc`');
    }
    // Toute fonction `groupe_*` qui écrit passe par `groupeEcrire` (ou son relais `groupeGeste`).
    const re2 = /(\w+)\s*\(\s*(['"])(groupe_\w+)\2/g;
    while ((m = re2.exec(d.codeChaines)) !== null) {
      if (groupe.indexOf(m[3]) >= 0 && ['groupeEcrire', 'groupeGeste'].indexOf(m[1]) < 0) fautes.push(m[3] + ' écrit par ' + m[1]);
    }
    expect(fautes).toEqual([]);
  });

  test('⚠️ toute fonction de `donnees.js` qui écrit est au registre, et le registre ne nomme que des écrivains', () => {
    const ecrivains = ecrivainsDeDonnees();
    const inscrits = REGISTRE_ECRITURES.map((e) => e.fn);
    expect(ecrivains.filter((x) => inscrits.indexOf(x) < 0).map((x) => x + ' écrit et n’est pas au registre')).toEqual([]);
    expect(inscrits.filter((x) => ecrivains.indexOf(x) < 0).map((x) => x + ' est au registre et n’écrit pas')).toEqual([]);
    expect(new Set(inscrits).size).toBe(inscrits.length);
  });

  test('⚠️ par la file : chaque appel vient d’`executer` ou de ce qu’il appelle', () => {
    const fautes = [];
    REGISTRE_ECRITURES.filter((e) => e.chemin === 'file').forEach((e) => {
      const a = appelantsDe(e.fn);
      if (!a.length) fautes.push(e.fn + ' : aucun appel');
      a.filter((x) => !FILE.has(x)).forEach((x) => fautes.push(e.fn + ' appelée hors de la file, par ' + x));
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ en liste blanche : exactement les appelants déclarés, chacun avec un appel réel, et une raison (une par appelant si `raisons`)', () => {
    const fautes = [];
    REGISTRE_ECRITURES.filter((e) => e.chemin === 'liste-blanche').forEach((e) => {
      if (e.raisons) {
        // Une raison par appelant : chaque appelant a la sienne, et aucune raison ne vise un appelant non déclaré.
        if (e.raison) fautes.push(e.fn + ' : `raison` et `raisons` à la fois');
        e.appelants.filter((x) => !(e.raisons[x] && e.raisons[x].trim())).forEach((x) => fautes.push(e.fn + ' : l’appelant ' + x + ' n’a pas de raison'));
        Object.keys(e.raisons).filter((x) => e.appelants.indexOf(x) < 0).forEach((x) => fautes.push(e.fn + ' : une raison pour ' + x + ', qui n’est pas un appelant déclaré'));
      } else if (!e.raison || !e.raison.trim()) fautes.push(e.fn + ' : pas de raison');
      const a = appelantsDe(e.fn);
      e.appelants.filter((x) => a.indexOf(x) < 0).forEach((x) => fautes.push(e.fn + ' : l’appelant ' + x + ' n’appelle plus'));
      a.filter((x) => e.appelants.indexOf(x) < 0).forEach((x) => fautes.push(e.fn + ' : appelée par ' + x + ', non déclaré'));
    });
    REGISTRE_ECRITURES.forEach((e) => {
      if (e.chemin !== 'file' && e.chemin !== 'liste-blanche') fautes.push(e.fn + ' : chemin inconnu « ' + e.chemin + ' »');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ les gestes de la bibliothèque : chacun atteint un écrivain de routine, et tout ce qui en atteint un est déclaré', () => {
    const fautes = [];
    const ROUTINE = ['creerRoutine', 'majRoutine', 'supprimerRoutine', 'insererExercices', 'supprimerExercices',
      'remplacerSeriesRoutine', 'majExercice'];
    const declares = GESTES_BIBLIOTHEQUE.map((g) => g.geste);
    const app = parNom['app.js'];
    const corps = (nom) => { const g = FONCTIONS['app.js'].filter((x) => x.nom === nom)[0]; return g ? app.code.slice(g.debut, g.fin) : null; };
    const atteint = (c) => new RegExp('\\b(?:Donnees\\s*\\.\\s*(?:' + ROUTINE.join('|') + ')|Routines\\s*\\.\\s*(?:enregistrer|appliquerPlan))\\s*\\(').test(c);
    // 1. Ce qui, dans app.js, atteint directement un écrivain de routine est un geste déclaré (ou `executer`).
    FONCTIONS['app.js'].forEach((g) => {
      if (g.nom === 'executer') return;
      if (atteint(app.code.slice(g.debut, g.fin)) && declares.indexOf(g.nom) < 0) fautes.push(g.nom + ' écrit une routine et n’est pas déclaré');
    });
    // 2. Chaque geste déclaré existe et atteint un écrivain (directement, ou par un relais déclaré) ; un relais n'a
    //    pour appelants que des gestes déclarés.
    GESTES_BIBLIOTHEQUE.forEach((g) => {
      const c = corps(g.geste);
      if (!c) { fautes.push(g.geste + ' : n’existe plus'); return; }
      const parRelais = GESTES_BIBLIOTHEQUE.filter((r) => r.relais && new RegExp('(^|[^.\\w])' + r.geste + '\\s*\\(').test(c)).length > 0;
      if (!atteint(c) && !parRelais) fautes.push(g.geste + ' : n’atteint plus aucun écrivain de routine');
      if (g.relais) appelantsDansApp(g.geste).filter((x) => declares.indexOf(x) < 0).forEach((x) => fautes.push(g.geste + ' : relayé par ' + x + ', non déclaré'));
      if (g.file && !FILE.has('app.js:' + g.geste)) fautes.push(g.geste + ' : déclaré par la file, hors d’`executer`');
      if (!g.relais && !g.file && !(g.raison && g.raison.trim())) fautes.push(g.geste + ' : pas de raison');
    });
    expect(fautes).toEqual([]);
  });

  test('les raisons de la liste blanche, au mot près (décidé le 11/10/2026)', () => {
    const raison = (fn) => REGISTRE_ECRITURES.filter((e) => e.fn === fn)[0].raison;
    expect(raison('supprimerCompte')).toBe('la suppression de compte exige le serveur ; rien n’est effacé localement avant sa réponse');
    expect(raison('enregistrerProfil')).toBe('le profil a son propre canal, local d’abord, avec un drapeau persistant (60-2c)');
    const refermer = REGISTRE_ECRITURES.filter((e) => e.fn === 'refermerSeance')[0].raisons;
    expect(refermer['app.js:resoudreSeanceEnCoursDistante']).toBe('ménage recalculé à chaque lancement : rien à perdre s’il échoue');
    expect(refermer['app.js:refermerSeancesSauf']).toBe('réparation d’un conflit pendant l’envoi de la file : referme une séance restée '
      + 'ouverte en base, autre que celle qu’on envoie ; si elle échoue, l’envoi suivant la retente');
    expect(RAISON_BIBLIOTHEQUE).toBe('geste de bibliothèque, fait hors de la salle, qui échoue avec un message et garde le brouillon');
    expect(GESTES_BIBLIOTHEQUE.filter((g) => g.geste === 'creerRoutineDepuisSeance')[0].raison).toBe('à passer par la file (noté le 11/10)');
  });
});

// ── 124 (audit du 16/10/2026, 06 #15-16, 01 #14) — LES CONSTANTES RECOPIÉES ─────────────────────────────────────
// Une valeur partagée s'écrit une fois, dans son module (`ou`), et se lit partout ailleurs. `motif` : la trace d'une
// recopie (une liste écrite en dur), cherchée dans le source sans les commentaires (chaînes gardées) de tous les
// fichiers servis sauf `ou`.
const CONSTANTES = [
  { quoi: 'les quatre barres (squat, couché, soulevé, militaire)', ou: 'modele.js',
    motif: /(['"])(?:squat_barre|developpe_couche_barre)\1\s*,\s*(['"])(?:developpe_couche_barre|squat_barre)\2/ },
  { quoi: 'les colonnes de `guilde_scores`', ou: 'social.js',
    motif: /(['"])prevues\1\s*,\s*(['"])records_semaine\2/ }
];

describe('architecture — une constante partagée ne s’écrit qu’une fois (124)', () => {
  const FICHIERS = perimetre();

  test('⚠️ aucune recopie hors de son module', () => {
    const fautes = [];
    CONSTANTES.forEach((c) => {
      FICHIERS.forEach((f) => {
        if (f.nom === c.ou) return;
        const code = nettoyer(f.src, true);
        const m = new RegExp(c.motif.source, 'g');
        let x;
        while ((x = m.exec(code)) !== null) fautes.push(c.quoi + ' : recopiées dans ' + f.nom + ', ligne ' + ligneDe(code, x.index) + ' — lis `' + c.ou + '`');
      });
    });
    expect(fautes).toEqual([]);
  });

  test('chaque constante existe bien dans son module (la garde lit le vrai source)', () => {
    const parNom = {};
    FICHIERS.forEach((f) => { parNom[f.nom] = f; });
    CONSTANTES.forEach((c) => expect([c.quoi, new RegExp(c.motif.source).test(nettoyer(parNom[c.ou].src, true))]).toEqual([c.quoi, true]));
  });

  test('01 #14 — un seuil, une valeur : le pas de l’escalier EST le seuil du compteur ; les jours civils, au moteur', () => {
    const moteur = FICHIERS.filter((f) => f.nom === 'moteur.js')[0].src;
    expect(/var PAS_ESCALIER = SEUIL_COMPTEUR;/.test(nettoyer(moteur, true))).toBe(true);
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/palier.js');
    const M = require('../../v2/js/moteur.js');
    expect(M.PAS_ESCALIER).toBe(M.SEUIL_COMPTEUR);
    const midi = new Date(2026, 9, 17, 12, 0, 0);
    expect(M.jourCivil(midi.getTime())).toBe('2026-10-17');            // un nombre de millisecondes (l'objectif en passe)
    expect(M.jourDuNumero(M.numeroDuJour('2026-10-17') + 15)).toBe('2026-11-01');
    expect(M.memeCharge(null, null)).toBe(false);                     // le moteur : une charge qui manque n'égale rien
    expect(M.memeCharge(12.2 - 10, 16.6 - 14.4)).toBe(true);
    // Les trois copies sont parties : ni `objectif.js` ni `deraille.js` ne refont `Date.UTC(+m[1]…`.
    ['objectif.js', 'deraille.js'].forEach((nom) => {
      const src = nettoyer(FICHIERS.filter((f) => f.nom === nom)[0].src, false);
      expect([nom, /Date\.UTC\(\s*\+m\[1\]/.test(src)]).toEqual([nom, false]);
    });
  });

  test('la garde se lit vraiment : une liste recopiée se voit, la lecture non', () => {
    const voit = (i, t) => new RegExp(CONSTANTES[i].motif.source).test(t);
    expect(voit(0, "var BARRES = ['developpe_couche_barre', 'squat_barre', 'souleve_de_terre_barre'];")).toBe(true);
    expect(voit(0, "var BARRES = racine.THModele.BARRES;")).toBe(false);
    expect(voit(1, "var C = ['semaine', 'seances', 'prevues', 'records_semaine'];")).toBe(true);
    expect(voit(1, "racine.THSocial.COLONNES_GUILDE.filter(f)")).toBe(false);
    const zf = NOTIONS.filter((n) => n.fonction === 'estZoneForce')[0].interditAilleurs.motif;
    expect(zf.test("if (c.zone === 'lourd' || c.zone === 'mix') return;")).toBe(true);
    expect(zf.test("var Z = ['lourd', 'mix'];")).toBe(true);
    expect(zf.test("if (Moteur.estZoneForce(c.zone)) return;")).toBe(false);
    expect(zf.test("if (k.zone === 'lourd' && elans.length > 1) {")).toBe(false);
  });
});
