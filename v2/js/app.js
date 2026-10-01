// v2/js/app.js — amorçage et orchestration.
//
// Principe : les données vivent sur le téléphone, le réseau ne sert qu'à les
// mettre à jour. On affiche TOUJOURS ce qu'on a d'abord, puis on rafraîchit en
// arrière-plan. Aucun écran d'attente quand quelque chose peut déjà être montré.
//
// L'app ÉCRIT désormais, mais pour les routines seulement, et EN DIRECT — pas
// par le cache. Voir `chargerRoutines` pour le pourquoi. Le corpus importé
// (séances, séries) reste lu depuis le cache et n'est jamais modifié.

(function (racine) {
  'use strict';

  var doc = racine.document;
  var Rendu = racine.THRendu, Modele = racine.THModele;
  var Donnees = racine.THDonnees, Auth = racine.THAuth;
  var Cache = racine.THCache, Sync = racine.THSync, Semaine = racine.THSemaine;
  var Routeur = racine.THRouteur, Sortie = racine.THSortie;
  var Calendrier = racine.THCalendrier;
  var Periode = racine.THPeriode, Poids = racine.THPoids;
  var Palier = racine.THPalier, Routines = racine.THRoutines;
  var Seance = racine.THSeance, Attente = racine.THAttente;
  var Profil = racine.THProfil, Moteur = racine.THMoteur, Plan = racine.THPlan;
  var Rejeu = racine.THRejeu;

  var vues = {};
  var local = { seances: [], series: [], exercices: [], pesees: [], zones: [],
                predictions: [], sousConsigne: {}, parisLegers: [], escalier: [], parSeance: null };
  var etat = { code: 'vide', libelle: '', local: false };
  var syncEnCours = false;
  var lundiAffiche = null;   // le lundi de la semaine à l'écran
  var gardes = [];           // vues qui peuvent refuser la sortie (§ écran de saisie)
  var sortie = null;         // mécanisme du bouton retour (v2/js/sortie.js)
  var sessionActive = null;  // sans elle, aucune vue authentifiée n'est rendue
  var zoneOuverte = null;    // une seule zone dépliée à la fois (§7 bis.10)
  var moisCalendrier = null; // le mois affiché par le calendrier
  var gardeOverlay = null;   // la garde qui rend le retour d'Android fermant
  var periodeRadar = Periode.PERIODE_DEFAUT;   // fenêtre comparée du radar
  var periodePoids = Poids.PERIODE_DEFAUT;     // fenêtre de la courbe de poids
  var etatsExercices = {};   // §5.2 : « monte » / « ne monte pas », par exercice

  // ── Routines ─────────────────────────────────────────────────────────────
  //
  // ⚠️ ELLES NE PASSENT PAS PAR LE CACHE, et c'est un choix.
  //
  // Le cache local est un MIROIR EN LECTURE d'un corpus qu'on ne modifie pas,
  // avec tout l'appareillage que ça demande : curseur incrémental, compte de
  // contrôle, cliquet de complétude. Il répond à une seule question — « ai-je
  // tout reçu ». Y verser une table qu'on écrit y ajouterait la question
  // inverse — « ai-je tout envoyé » — pour laquelle il n'a AUCUNE FILE
  // D'ATTENTE ni aucun suivi de ce qui reste à pousser. À moitié fait, on
  // obtiendrait le pire : une bibliothèque locale qui diverge en silence de ce
  // qui est en base.
  //
  // ⚠️ Corrigé le 12/09 : ce commentaire ajoutait « ni identité locale, ni
  // résolution de conflit ». C'est FAUX, et `SCHEMA-REEL.md` le dit —
  // `sessions.id` et `sets.id` ont `gen_random_uuid()` en défaut, donc l'app
  // peut fabriquer les identifiants elle-même et la synchronisation devient une
  // réécriture IDEMPOTENTE : la même ligne envoyée deux fois écrase la même
  // ligne. L'identité et le conflit sont donc réglés d'avance. Ce qui manque
  // vraiment, c'est la file d'attente — et c'est elle le chantier suivant.
  //
  // Une routine se crée au calme, avec du réseau ; une SÉANCE se saisit à la
  // salle, où le réseau tombe. L'écriture hors ligne est le vrai problème, et
  // il se posera au commit suivant, avec la séance en cours — entier, pas
  // entamé de travers ici.
  //
  // La contrepartie est assumée et visible à l'écran : sans réseau, la
  // bibliothèque le DIT au lieu de faire semblant.
  var routines = [];
  var etatRoutines = { code: 'jamais', message: '' };
  var brouillon = null;      // la routine en cours d'édition, en mémoire
  var enregistrementEnCours = false;

  // ── LA SÉANCE EN COURS ───────────────────────────────────────────────────
  //
  // Trois états, et il faut les distinguer :
  //
  //   `seance`   la séance en cours, en MÉMOIRE. Réécrite sur disque après
  //              chaque geste — c'est ce qui la fait survivre à une app tuée.
  //   `attente`  la file d'écriture, sur disque elle aussi. Elle survit au
  //              redémarrage, sinon une séance saisie hors ligne ne monterait
  //              jamais.
  //   `vidange`  un verrou. Deux vidanges simultanées enverraient deux fois.
  //
  // La règle qui commande tout : ÉCRITURE LOCALE D'ABORD, TOUJOURS. Aucun geste
  // de saisie n'attend le réseau, aucun n'échoue parce qu'il est absent.
  var seance = null;
  var attente = [];
  var vidangeEnCours = false;
  var chrono = null;         // { depuis, cible, sonne, exo } — le repos en cours
  var minuteur = null;       // l'intervalle d'affichage du chronomètre
  var sourdine = false;      // le son du repos, coupé et retenu (§3 bis.8)
  var audio = null;          // le contexte Web Audio, né au premier geste
  var modeRPE = false;       // la bascule effort, retenue d'une fois sur l'autre
  var feuille = null;        // la feuille ouverte : { quoi, iExo, iSerie }
  // §7 octies.2 — la saisie sert à CORRIGER quand son brouillon porte une
  // séance DÉJÀ terminée. L'état se LIT sur la séance, il ne se retient pas à
  // côté : une app tuée au milieu d'une correction la rouvre en correction, et
  // il n'y a pas de drapeau à désynchroniser.
  function enEdition() { return !!seance && seance.statut === Seance.TERMINEE; }

  // L'identifiant est fabriqué ICI, côté client. C'est lui qui rend l'envoi
  // idempotent : la même ligne envoyée deux fois écrase la même ligne, donc
  // rejouer la file après une coupure ne crée pas de doublon.
  // `crypto.randomUUID` n'existe pas partout ; le repli tire les mêmes 122 bits
  // d'aléa de `getRandomValues`, et `Math.random` ne sert que si rien d'autre
  // n'existe — cas où l'app a d'autres soucis.
  function uuid() {
    var c = racine.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var o = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(o);
    else for (var i = 0; i < 16; i++) o[i] = Math.floor(Math.random() * 256);
    o[6] = (o[6] & 0x0f) | 0x40;
    o[8] = (o[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(o, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
           h.slice(16, 20) + '-' + h.slice(20);
  }

  function $(id) { return doc.getElementById(id); }

  var ecranCourant = null;

  // Une vue visible à la fois, et la barre d'onglets suit : elle disparaît sur
  // la connexion, où il n'y a rien à naviguer.
  function montrer(nom, vue) {
    // ⚠️ LE MODE RÉORGANISER NE TRAVERSE PAS LES ÉCRANS (§7 vicies, ch. 46).
    // Il porte un ordre NON ENREGISTRÉ : le laisser ouvert emporterait des
    // déplacements en attente sur un écran qui ne sait pas les enregistrer.
    // Une seule porte, donc une seule remise à zéro — et elle règle au passage
    // un défaut plus ancien : le mode ne se refermait JAMAIS, pas même en
    // terminant une séance.
    if (ecranCourant !== nom) fermerReorganisation();
    var onglet = Routeur.ongletDe(vue || nom);
    // ⚠️ MÊME PORTE, MÊME RAISON (§2, ch. 46). Quitter le profil vaut « vu » :
    // sans ça, quelqu'un qui remplit tout puis touche un onglet retrouverait le
    // bandeau de bienvenue à chaque ouverture.
    //
    // ⚠️ ET ON DEMANDE AU ROUTEUR, ON NE LISTE PAS LES ÉCRANS. « Tous mes
    // exercices » est une sous-vue DU profil : en sortir n'est pas quitter le
    // profil. Lister les exceptions à la main, c'était garantir qu'une sous-vue
    // de plus soit oubliée le jour où on l'ajoute — `ongletDe` le sait déjà.
    if (ecranCourant === 'profil' && onglet !== Routeur.PROFIL) marquerProfilVu();
    ecranCourant = nom;
    Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); });
    var barre = $('onglets');
    if (barre) barre.hidden = !onglet;
    Rendu.rendreOnglets(barre, onglet);
    // Une séance en cours se voit depuis N'IMPORTE QUEL écran. Une PWA qui
    // rouvre sur `/` la cacherait sinon, et « je ne la retrouve pas » est une
    // perte comme une autre. Un point, pas une alarme.
    var saisie = doc.querySelector('.onglet[data-vue="' + Routeur.SAISIE + '"]');
    if (saisie) saisie.classList.toggle('en-cours', !!seance);
    // La barre d'onglets vient d'apparaître ou de disparaître : sa hauteur est
    // ce sur quoi toute la réserve du bas se règle. On mesure ici plutôt qu'au
    // seul démarrage — au démarrage elle est encore cachée, et la mesure
    // vaudrait zéro.
    mesurerBarres();
  }

  function texteErreur(e) {
    if (!e) return 'Erreur inconnue.';
    var m = e.message || String(e);
    if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) return 'Pas de réseau.';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    return m;
  }

  // ── Index des séries par séance, construit une fois par chargement ───────
  function indexerParSeance() {
    var index = new Map();
    local.series.forEach(function (s) {
      var l = index.get(s.session_id);
      if (l) l.push(s); else index.set(s.session_id, [s]);
    });
    local.parSeance = index;
  }
  function seriesDe(sessionId) { return (local.parSeance && local.parSeance.get(sessionId)) || []; }

  // ── §9.1.1 — LES CORRECTIONS DE ZONE ─────────────────────────────────────
  //
  // Un historique en ajout seul : chaque choix ajoute une ligne, la plus
  // récente fait foi, une zone vide ramène à la déduction. Rien ne se modifie,
  // rien ne s'efface — donc la fusion est une UNION par identifiant, et la
  // ligne du serveur l'emporte sur sa copie locale (elle a traversé les
  // contraintes de la base).
  function fondreZones(locales, distantes) {
    var par = {};
    (locales || []).forEach(function (l) { if (l && l.id) par[l.id] = l; });
    (distantes || []).forEach(function (l) { if (l && l.id) par[l.id] = l; });
    return Object.keys(par).map(function (k) { return par[k]; });
  }

  // La zone en vigueur d'un exercice. Le CALCUL vit dans le moteur (§9.1.1) —
  // l'app lui passe les lignes, elle ne les trie pas elle-même.
  function zoneDe(slug) { return Moteur.zoneEnVigueur(local.zones, slug); }

  // ⚠️ L'APPAREIL D'ABORD, LE RÉSEAU ENSUITE. Le choix s'affiche tout de suite,
  // même sans réseau, et part par la file. `user_id` et `corrigee_a` sont posés
  // ICI, à l'instant du geste : laissés au défaut du serveur, deux choix faits
  // hors ligne remonteraient dans l'ordre du réseau, pas dans celui des gestes,
  // et le dernier choisi ne serait pas le dernier gardé.
  //
  // `zone` nulle veut dire « Revenir à celle d'après tes séances » : on AJOUTE
  // une ligne vide, on n'efface pas l'historique.
  async function poserZone(slug, zone) {
    var id = uuid();
    var ligne = {
      id: id,
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      exercise_slug: slug,
      zone: zone || null,
      corrigee_a: new Date().toISOString()
    };
    local.zones = local.zones.concat([ligne]);
    // La seule exception au gel de la consigne (§9.13 bis, 49-U1) :
    // l'utilisateur corrige LUI-MÊME la zone de CET exercice. Il se recalcule,
    // lui seul ; ses séries validées restent figées par leurs paris.
    if (consignes && consignes.parSlug) {
      delete consignes.parSlug[slug];
      versionConsignes++;
      sauverConsignes();
    }
    await Cache.ecrireLot('zones', [ligne]).catch(function () {});
    await poser({ table: Attente.ZONES, op: Attente.UPSERT, id: id, donnees: ligne });
  }

  // ── Cache ────────────────────────────────────────────────────────────────
  async function chargerCache() {
    local.seances = await Cache.lireTout('seances');
    local.series = await Cache.lireTout('series');
    local.exercices = await Cache.lireTout('exercices');
    local.pesees = await Cache.lireTout('pesees');
    // §9.1.1 — les corrections de zone. Elles sont LUES AU DÉMARRAGE comme le
    // reste : une zone choisie hier doit tenir avant même que le réseau
    // réponde, sinon la première consigne de la séance serait celle d'avant la
    // correction, puis changerait sous les yeux.
    local.zones = await Cache.lireTout('zones');
    // §9.11 (48c) — ce que le moteur a DÉJÀ noté. Lu au démarrage, parce que
    // c'est ce qui l'empêche de réécrire : fermer l'app au milieu d'une séance
    // et la rouvrir rejouerait sinon toutes les consignes de cette séance.
    local.predictions = await Cache.lireTout('predictions');
    // §12.9 (49-U13) — les séances SOUS CONSIGNE vues par le serveur (tous
    // appareils), relues à la dernière synchronisation : le compteur de
    // stagnation tient hors ligne.
    try { local.sousConsigne = (await Cache.lireBrouillon(CLE_SOUS_CONSIGNE)) || {}; }
    catch (e) { local.sousConsigne = {}; }
    // MOTEUR §14.4 (49-U14) — les compteurs figés dans les paris (tous
    // appareils) et les paris de l'escalier, relus à la dernière
    // synchronisation : la carte et la semaine allégée tiennent hors ligne.
    try { local.parisLegers = (await Cache.lireBrouillon(CLE_PARIS_LEGERS)) || []; }
    catch (e) { local.parisLegers = []; }
    try { local.escalier = (await Cache.lireBrouillon(CLE_PARIS_ESCALIER)) || []; }
    catch (e) { local.escalier = []; }
    rangerSeances();
    indexerParSeance();
    recalculerEtats();
  }

  // INVARIANT : `local.seances` ne contient QUE des séances terminées, de la
  // plus récente à la plus ancienne.
  //
  // ⚠️ LE FILTRE EST ICI, ET NULLE PART AILLEURS DANS LA LECTURE.
  //
  // Cette fonction est appelée aux TROIS seuls endroits où `local.seances`
  // change — le cache, la synchronisation, l'adoption d'une séance terminée.
  // C'est donc un goulot : une séance en cours ne PEUT PAS entrer dans
  // `local.seances`, quel que soit le chemin, y compris un chemin qu'on
  // ajouterait demain sans y penser.
  //
  // L'alternative — filtrer à chaque point de lecture — demandait de traiter
  // les SEPT lectures qui dérivent de `local.seances` (semaine, sommaire de
  // progression, période, relevé par muscle, calendrier, détail d'une séance,
  // colonne « précédent ») et d'y penser à la huitième. C'est exactement ainsi
  // que le défaut est né.
  //
  // La règle elle-même vit dans `sync.js`, module pur : c'est là qu'elle se
  // teste. Ici il ne reste que le goulot.
  function rangerSeances() {
    local.seances = Sync.ranger(local.seances);
  }

  // §5.2 — « monte en charge » est une propriété MESURÉE sur tout l'historique,
  // pas devinée séance par séance. Elle se recalcule quand le corpus change,
  // jamais à chaque rendu : c'est un balayage des 28 000 séries.
  //
  // ⚠️ Elle lit donc TOUT l'historique, y compris les séances postérieures à
  // celle qu'on affiche. Le banc Python fait pareil, et c'est sans conséquence
  // ici — l'état décrit une habitude de l'exercice, pas un état à une date.
  // Ça deviendra une vraie question au chantier suivant, quand le moteur
  // prescrira : une consigne ne doit rien lire de l'avenir.
  function recalculerEtats() {
    // Le corpus a changé, donc les dernières dates par exercice aussi. Elles se
    // recalculent à la prochaine ouverture de la liste, pas ici : cet écran
    // n'est presque jamais celui qu'on regarde pendant une synchronisation.
    datesExercices = null;
    // ⚠️ PLUS `consignes = null` (49-U1, D7) : la consigne est figée pour la
    // séance ; ce qui arrive en arrière-plan sert à la séance suivante.
    constats = null;
    try {
      etatsExercices = Palier.etatsExercices(Palier.seanceExercices(local.series));
    } catch (e) {
      etatsExercices = {};
      console.warn('États d\u2019exercice indisponibles :', texteErreur(e));
    }
  }

  // Le cache appartient à un compte et à un seul. Un cache qui survivrait à un
  // changement de compte montrerait les séances de quelqu'un d'autre.
  async function garantirProprietaire(userId) {
    var meta = await Cache.lireMeta('proprietaire');
    if (Sync.cacheAppartientA(meta, userId)) return;
    await Cache.viderTout();
    // Les routines ne sont pas dans le cache, mais elles appartiennent au
    // compte précédent : les laisser en mémoire montrerait la bibliothèque de
    // quelqu'un d'autre le temps d'une requête.
    routines = []; brouillon = null; etatRoutines = { code: 'jamais', message: '' };
    // La séance en cours et la file appartiennent au compte précédent. Le
    // `viderTout` ci-dessus a effacé leurs magasins ; on remet la mémoire
    // d'accord avec le disque.
    seance = null; attente = []; chrono = null;
    // §12.9 (49-U13) — les séances sous consigne aussi (le brouillon qui les
    // porte vient d'être effacé avec le reste).
    local.sousConsigne = {};
    local.parisLegers = [];
    local.escalier = [];
    // Le profil aussi appartient au compte précédent — et son envoi en attente
    // avec lui. Le rejouer sur le compte suivant écrirait la taille de
    // quelqu'un d'autre dans sa ligne `profiles`.
    profil = null; profilAEnvoyer = false; pseudoAInscrire = null;
    datesExercices = null;
    await Cache.ecrireMeta('proprietaire', { userId: userId });
  }

  // Un cache construit par une version défaillante est incomplet ET se croit à
  // jour : son curseur est au maximum, l'incrémental ne redemandera rien. On
  // efface donc le curseur UNE FOIS — le cache, lui, reste en place, pour que
  // l'app s'ouvre sur ce qu'elle a pendant que le reste revient.
  //
  // La version n'est écrite qu'APRÈS une synchronisation réussie : marquer
  // avant laisserait un cache toujours incomplet réputé à jour, c'est-à-dire
  // exactement le défaut qu'on corrige.
  async function armerResynchronisation() {
    var marque = await Cache.lireMeta('formeSync');
    var attendu = await Cache.lireMeta('attendu');
    var enMagasin = await compteSur(function () { return Cache.compterMagasin('series'); });
    // Deux raisons de reprendre une passe complète : la forme a changé, ou le
    // magasin est plus court que ce qu'on y a mis. La seconde est le filet —
    // elle casse le cliquet même pour un cas qu'on n'aurait pas prévu.
    if (!Sync.doitReprendre(marque, enMagasin, attendu)) return false;
    await Cache.ecrireMeta('curseurSeries', null);
    return true;
  }

  // ── Synchronisation ──────────────────────────────────────────────────────
  async function synchroniser() {
    if (syncEnCours) return;
    syncEnCours = true;
    try {
      var resync = await armerResynchronisation();
      var curseur = await Cache.lireMeta('curseurSeries');

      // sessions : complet (545 Ko, aucune colonne de modification, capte aussi
      // les suppressions). sets : incrémental (15 Mo, 28× plus lourd).
      var seances = await Donnees.toutesLesSeances();
      var nouvellesSeries = await Donnees.seriesDepuis(curseur);
      var exercices = await Donnees.tousLesExercices();
      // Les pesées sont ACCESSOIRES : 116 lignes, une page, aucun curseur. Une
      // lecture qui échoue ne doit pas emporter la synchronisation des séries —
      // c'est le gros du travail et le cœur de l'app. `null` veut dire « on
      // n'a rien reçu », et le cache garde ce qu'il avait.
      var pesees = await essayer(Donnees.toutesLesPesees);
      // Les corrections de zone sont ACCESSOIRES au même titre que les pesées :
      // une lecture qui échoue ne doit pas emporter la synchronisation des
      // séries. `null` veut dire « on n'a rien reçu », et le cache garde ce
      // qu'il avait — donc les choix faits ici tiennent.
      var zones = await essayer(Donnees.mesZones);

      // Le serveur annonce ce qu'il a. C'est ce qui autorise la purge, et c'est
      // ce qui permet de dire qu'il manque quelque chose au lieu de l'ignorer.
      var compteSeances = await compteSur(Donnees.compterSeances);
      var compteSeries = await compteSur(Donnees.compterSeries);

      // §12.9 (49-U13) — les paris du compte, EN LECTURE SEULE, pour une seule
      // chose : savoir quelles séances ont reçu une consigne (« sous
      // consigne »). Trois colonnes (`Donnees.seancesAvecPari`). Accessoire
      // comme les zones : un échec garde ce qu'on avait. Ils n'entrent PAS dans
      // `local.predictions` (le circuit des paris et des observations de la
      // séance en cours n'en dépend pas, et n'en change pas). En mémoire TOUT
      // DE SUITE : une consigne qui se fige pendant les écritures qui suivent
      // doit déjà les voir.
      //
      // ⚠️ APRÈS LES DEUX COMPTES, PAS ENTRE `seriesDepuis` ET `compterSeries`.
      // Une série montée par la file pendant cette fenêtre est comptée par le
      // serveur sans être dans `nouvellesSeries` : l'état dit « 1 série
      // manquante » jusqu'à la synchronisation suivante. Toute lecture posée
      // là élargit la fenêtre (banc d'écran, section 5, 01/10/2026).
      var parisDuCompte = await essayer(Donnees.seancesAvecPari);
      if (parisDuCompte) {
        local.sousConsigne = seancesAvecPari(parisDuCompte);
        // §14.4 (49-U14) — et le compteur figé dans chacun (`compteur`).
        local.parisLegers = parisDuCompte;
      }
      // MOTEUR §14.4 (49-U14) — LES PARIS DE L'ESCALIER, en entier : peu de
      // lignes (une par carte), lues à part. Accessoires comme les autres.
      var escalierDuCompte = await essayer(Donnees.parisEscalier);
      if (escalierDuCompte) {
        local.escalier = escalierDuCompte.filter(function (l) { return l && l.module === Moteur.MODULE_ESCALIER; });
      }

      // ⚠️ La liste du serveur ne contient PAS ce qui n'y est pas encore monté.
      // Sans cette garde, la première synchronisation réussie effacerait une
      // séance saisie hors ligne — au moment précis où le réseau revient.
      local.seances = Sync.remplacer(seances, {
        conserver: Attente.seancesEnAttente(attente),
        existants: local.seances
      });
      // Le compte de contrôle porte sur ce que le SERVEUR a envoyé, pas sur la
      // liste augmentée des séances locales : celles-ci ne sont pas encore
      // comptées côté serveur, et les inclure ferait croire à un surplus.
      var listeComplete = Sync.verifierCompletude(seances.length, compteSeances).complet;
      var fusionnees = Sync.fusionner(local.series, nouvellesSeries);
      // ⚠️ LA PURGE PASSE AVANT LE RANGEMENT, ET L'ORDRE COMPTE.
      //
      // Elle répond à « cette séance existe-t-elle encore ? », pas à « est-elle
      // terminée ? ». Rangée d'abord, la liste ne contiendrait plus la séance
      // en cours, et la purge effacerait ses séries montées — que
      // `compterSeries` compte toujours côté serveur. Le curseur cesserait
      // d'avancer, « N séries manquantes » s'afficherait, et 15 Mo
      // redescendraient à chaque synchronisation, pendant toute la séance.
      local.series = Sync.purgerSeriesOrphelines(fusionnees, local.seances, listeComplete);
      local.exercices = Sync.remplacer(exercices);
      // Et MAINTENANT le corpus de lecture : la séance en cours sort ici, une
      // ligne avant que le cache ne soit écrit — donc elle n'y entre pas non
      // plus.
      rangerSeances();
      indexerParSeance();
      recalculerEtats();

      // Séances et exercices : petits, rafraîchis en entier, vider-puis-écrire
      // dans UNE transaction. Séries : on n'efface plus rien d'abord — `put`
      // est un upsert, et ce que la purge a retiré se supprime explicitement.
      await Cache.remplacerTout('seances', local.seances);
      await Cache.remplacerTout('exercices', local.exercices);
      if (pesees) {
        local.pesees = Sync.remplacer(pesees);
        await Cache.remplacerTout('pesees', local.pesees);
      }
      // ⚠️ FUSION, JAMAIS REMPLACEMENT. Une correction posée hors ligne n'est
      // pas encore chez le serveur : la liste qu'il envoie ne la contient pas,
      // et l'écraser avec elle effacerait le choix au moment précis où le
      // réseau revient — le défaut que `Sync.remplacer` évite déjà pour les
      // séances. On fond par `id`, et `ecrireLot` upserte ligne à ligne.
      if (zones) {
        local.zones = fondreZones(local.zones, zones);
        await Cache.ecrireLot('zones', local.zones);
      }
      if (parisDuCompte) {
        await Cache.ecrireBrouillon(CLE_SOUS_CONSIGNE, local.sousConsigne).catch(function () {});
        await Cache.ecrireBrouillon(CLE_PARIS_LEGERS, local.parisLegers).catch(function () {});
      }
      if (escalierDuCompte) {
        await Cache.ecrireBrouillon(CLE_PARIS_ESCALIER, local.escalier).catch(function () {});
      }
      await Cache.supprimer('series', idsRetires(fusionnees, local.series));
      await Cache.ecrireLot('series', local.series);

      // LE COMPTE AUTORISE. On relit le MAGASIN — une variable en mémoire ne
      // prouve rien sur ce qui a été persisté. Sans preuve de complétude, le
      // curseur reste vide : la synchro suivante recommence au lieu de se
      // croire finie, et le cache ne peut plus se figer amputé.
      var enMagasin = await Cache.compterMagasin('series');
      var commit = Sync.decisionDeCommit(enMagasin, compteSeries);
      if (commit.autorise) {
        var avance = Sync.curseurDe(nouvellesSeries);
        if (avance) await Cache.ecrireMeta('curseurSeries', avance);
        if (resync) await Cache.ecrireMeta('formeSync', { version: Sync.VERSION_SYNC });
        if (commit.attendu !== null) await Cache.ecrireMeta('attendu', { series: commit.attendu });
      }

      etat = Sync.deciderEtat({
        syncOk: true, aDesDonnees: true, manquantes: commit.manquantes
      });
      // §14.4 (49-U14) — une semaine allégée acceptée se tranche ici aussi.
      observerEscalier().catch(function () {});
    } catch (e) {
      // Une synchronisation ratée n'est jamais bloquante : on garde ce qu'on a.
      etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });
      console.warn('Synchronisation impossible :', texteErreur(e));
    } finally {
      syncEnCours = false;
    }
  }

  // Ce que la purge a retiré doit quitter le magasin : sans `clear()`, une
  // série dont la séance a disparu y resterait.
  function idsRetires(avant, apres) {
    var restants = new Set((apres || []).map(function (s) { return s && s.id; }));
    var retires = [];
    (avant || []).forEach(function (s) { if (s && !restants.has(s.id)) retires.push(s.id); });
    return retires;
  }

  // Un compte indisponible n'est pas un compte à zéro : on rend null, et
  // `verifierCompletude` s'abstient plutôt que d'accuser.
  async function compteSur(lire) {
    try { return await lire(); }
    catch (e) { console.warn('Compte serveur indisponible :', texteErreur(e)); return null; }
  }

  // Même forme, pour une lecture accessoire : `null` plutôt qu'une exception
  // qui ferait tomber la synchronisation entière.
  async function essayer(lire) {
    try { return await lire(); }
    catch (e) { console.warn('Lecture indisponible :', texteErreur(e)); return null; }
  }

  // ── Écrans ───────────────────────────────────────────────────────────────
  // Toute la navigation entre semaines lit le cache. Aucun appel réseau, aucun
  // rechargement de page — et aucune entrée empilée dans l'historique, pour ne
  // pas aggraver le bouton retour d'Android, qui est un chantier à part.
  // Tout ce que les deux onglets lisent de la semaine affichée. Une seule
  // source : passer de Séances à Progression conserve la semaine.
  function semaineCourante() {
    if (!lundiAffiche) lundiAffiche = Semaine.bornesSemaine(new Date()).lundi;
    var bornes = Semaine.bornesSemaine(lundiAffiche);
    var jours = Semaine.repartirParJour(local.seances, bornes.lundi);
    var seances = jours.reduce(function (acc, j) { return acc.concat(j.seances); }, []);
    var series = seances.reduce(function (acc, s) { return acc.concat(seriesDe(s.id)); }, []);
    return {
      bornes: bornes, jours: jours, seances: seances, series: series,
      bilan: Semaine.bilanSemaine(seances, series, local.exercices),
      zones: Semaine.volumeParZone(series, local.exercices)
    };
  }

  function barrePour(sem, avecSeances) {
    // La barre est IDENTIQUE dans Séances et dans la vue Volume : une seule
    // définition, deux emplacements. « Cette semaine » n'est fourni que si on a
    // quitté la semaine courante — c'est l'absence de la fonction qui fait
    // l'absence du bouton, pas un test dans le rendu.
    var courante = Semaine.memeSemaine(sem.bornes.lundi, new Date());
    return {
      surCetteSemaine: courante ? null : function () {
        var lundi = Semaine.bornesSemaine(new Date()).lundi;
        if (!vues.volume.hidden) { lundiAffiche = lundi; return rendreVolume(); }
        afficherSemaine(lundi);
      },
      libelle: Rendu.libelleSemaine(sem.bornes.lundi, sem.bornes.dimanche),
      sousTitre: (avecSeances ? sem.bilan.nbSeances + ' séance' +
        (sem.bilan.nbSeances > 1 ? 's' : '') + ' · ' : '') +
        sem.bilan.nbSeriesTravail + ' série' + (sem.bilan.nbSeriesTravail > 1 ? 's' : '') +
        ' de travail',
      surPrecedente: function () { naviguer(-1); },
      surSuivante: function () { naviguer(1); },
      surDate: ouvrirCalendrier
    };
  }

  function rendreSemaine(lundi) {
    if (lundi) lundiAffiche = lundi;
    montrer('liste', Routeur.RACINE);
    // ⚠️ L'ÉTAT COMBINÉ, JAMAIS L'ÉTAT DE LECTURE SEUL (chantier 33). Peindre
    // `etat` ici court-circuitait `Attente.deciderEtat` : l'écran Séances —
    // celui sur lequel on retombe après chaque relance — affichait « À jour »
    // pendant qu'une entrée était bloquée en file. Une file bloquée qui se dit
    // à jour EST la perte silencieuse que tout ce mécanisme existe pour
    // empêcher, et c'est ce qui a laissé le défaut du chantier 32 invisible.
    rendreEtatSync();

    var sem = semaineCourante();
    Rendu.rendreBarreSemaine($('barre-seances'), barrePour(sem, true));
    Rendu.rendreRappel($('rappel-zones'), sem.zones, function () {
      // Un rappel DE VOLUME ouvre le volume, pas le sommaire : passer par une
      // table des matières pour retrouver ce qu'on vient de toucher serait un
      // pas de plus pour rien.
      allerA(Routeur.VOLUME, {});
      rendreVolume();
    });
    Rendu.rendreJours($('liste-seances'), Semaine.joursAvecSeances(sem.jours), function (s) {
      return Modele.resumerSeance(s, seriesDe(s.id), local.exercices, Palier, etatsExercices);
    }, afficherDetail, ouvrirMenuSeance);
  }

  // ── Progression : le sommaire (§7 bis.14) ────────────────────────────────
  //
  // Trois blocs empilés, chacun répondant en deux lignes. L'écran est utile
  // SANS RIEN TOUCHER : ouvrir un bloc approfondit, ça ne révèle pas la réponse.
  function rendreProgression() {
    montrer('progression', Routeur.PROGRESSION);
    var sem = semaineCourante();
    Rendu.rendreSommaire($('sommaire'), {
      volume: {
        quand: Rendu.libelleSemaine(sem.bornes.lundi, sem.bornes.dimanche),
        zones: sem.zones,
        surChoix: function () { allerA(Routeur.VOLUME, {}); rendreVolume(); }
      },
      poids: {
        resume: Poids.resume(local.pesees),
        surChoix: function () { allerA(Routeur.POIDS, {}); rendrePoids(); }
      },
      exercices: sommaireExercices(function (slug) { afficherExercice(slug); })
    });
  }

  // Les trois derniers exercices pratiqués, et combien d'exercices distincts le
  // compte a vus passer. Un seul balayage des séances récentes — inutile de
  // parcourir trois ans pour trois noms.
  //
  // La valeur affichée est la MEILLEURE SÉRIE, exactement comme sur la carte de
  // séance. Les deux surfaces disent le même chiffre pour le même exercice du
  // même jour — deux voix pour un seul chiffre est la famille de défauts que
  // l'audit v1 a cataloguée. Un exercice sans meilleure série n'affiche pas de
  // valeur : rien ne s'invente.
  function sommaireExercices(surExercice) {
    var index = Modele.indexerExercices(local.exercices);
    var vus = {}, lignes = [];
    for (var i = 0; i < local.seances.length && lignes.length < 3; i++) {
      var seance = local.seances[i];
      var d = seance.debut ? new Date(seance.debut) : null;
      var parExo = {};
      Palier.decouperParExercice(seriesDe(seance.id)).forEach(function (se) { parExo[se.slug] = se; });
      Palier.trier(seriesDe(seance.id)).forEach(function (serie) {
        if (!serie.exercise_slug || vus[serie.exercise_slug]) return;
        vus[serie.exercise_slug] = true;
        if (lignes.length >= 3) return;
        // La mesure vient du catalogue : le moteur ne devine pas la nature
        // d'un exercice (cf. `THPalier.analyser`).
        var r = Palier.analyser((parExo[serie.exercise_slug] || {}).series || [],
                                etatsExercices[serie.exercise_slug],
                                { mesure: (index[serie.exercise_slug] || {}).mesure });
        lignes.push({
          // Le slug voyage avec la ligne : c'est lui qui ouvre la page
          // d'exercice (§7 quater), et le nom ne sert qu'à l'affichage.
          slug: serie.exercise_slug,
          nom: (index[serie.exercise_slug] && index[serie.exercise_slug].nom) || serie.exercise_slug,
          mesure: r.meilleure === null ? ''
            : Modele.formatMesure({ charge_kg: r.meilleure.charge, reps: r.meilleure.reps }),
          jour: d && !isNaN(d.getTime()) ? d : null
        });
      });
    }

    // Le compte d'exercices distincts porte sur TOUT l'historique : c'est ce
    // que le bloc annonce, et il ne doit pas dépendre des trois séances lues.
    var distincts = {}, n = 0;
    local.series.forEach(function (serie) {
      if (!serie || serie.type_serie !== 'travail' || !serie.exercise_slug) return;
      if (distincts[serie.exercise_slug]) return;
      distincts[serie.exercise_slug] = true; n++;
    });

    return { quand: n ? n + ' exercices' : '', lignes: lignes, surExercice: surExercice };
  }

  // ══ LA SÉANCE EN COURS ═══════════════════════════════════════════════════
  //
  // Le contrat, dans l'ordre où il compte :
  //
  //   1. tout geste écrit d'abord EN LOCAL, et rend la main ;
  //   2. l'intention d'envoi est POSÉE dans la file, sur disque ;
  //   3. la vidange tente le réseau — et son échec ne remonte jamais à l'écran
  //      de saisie, parce qu'il n'y a rien à y faire.
  //
  // Une séance perdue est le pire défaut possible. Tout ce qui suit est écrit
  // pour que ça n'arrive pas, y compris si l'app est tuée entre deux lignes.

  // Écrit la séance sur disque, ENTIÈRE, dans une transaction. Appelé après
  // chaque geste. Une séance pèse quelques kilo-octets : le coût est nul devant
  // la garantie qu'aucun état à moitié écrit ne puisse exister.
  // ⚠️ LES DEUX PORTES PAR OÙ LA SÉANCE SORT (chantier 33) : le DISQUE
  // (`sauverSeance`) et le FIL (`poserSeries`). On sème aux deux, pas à une
  // seule — tous les gestes ne passent pas par `apresGeste` : `enregistrerEdition`
  // pose et adopte sans jamais sauver de brouillon. Couvrir l'entonnoir des
  // gestes aurait donc laissé la correction d'une séance passée à découvert.
  //
  // Une série sans identifiant ne doit exister ni sur le disque ni sur le fil :
  // `sets.id` est uuid NOT NULL, et le refus du serveur bloquerait la file
  // entière (voir la garde de sortie dans `Seance.lignes`).
  //
  // Sans effet et sans recopie quand rien ne manque : le chemin normal ne paie
  // rien, et l'appel est sûr à répéter.
  function semerSeance() { seance = Seance.semerIdentifiants(seance, uuid); }

  async function sauverSeance() {
    semerSeance();
    try {
      await Cache.ecrireBrouillon('seance', seance);
    } catch (e) {
      // Le disque local est la dernière ligne. S'il refuse, l'utilisateur doit
      // le savoir tout de suite — c'est le seul cas où la saisie doit crier.
      console.error('Séance non sauvegardée :', texteErreur(e));
      Rendu.message($('erreur-seance'), 'Sauvegarde impossible sur cet appareil. Ne ferme pas l\u2019app.', 'erreur');
    }
  }

  // Pose une intention dans la file ET l'écrit sur disque. La file EST la
  // promesse d'envoi : tant qu'une entrée y est, rien n'est perdu.
  async function poser(operation) {
    attente = Attente.poser(attente, operation);
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File non persistée :', texteErreur(e)); }
    rendreEtatSync();
    vidanger();   // volontairement PAS attendu : la saisie ne dépend pas du réseau
  }

  // L'état affiché combine lecture et écriture. Tant qu'il reste quelque chose
  // à envoyer, « à jour » serait faux.
  function rendreEtatSync() {
    var noeud = $('etat-sync');
    if (noeud) Rendu.rendreEtat(noeud, Attente.deciderEtat(etat, attente));
  }

  // ── La vidange ──────────────────────────────────────────────────────────
  //
  // Une opération ne quitte la file QUE sur confirmation du serveur. C'est la
  // règle du chantier 15 appliquée à l'écriture : le compte AUTORISE, il ne
  // constate pas. En cas d'échec, l'entrée reste, marquée — et la file s'arrête
  // là plutôt que de sauter l'entrée suivante, dont la clé étrangère dépend
  // peut-être de celle qui vient d'échouer.
  async function vidanger() {
    if (vidangeEnCours || !sessionActive) return;
    vidangeEnCours = true;
    try {
      var garde = 200;   // une file qui ne rétrécit pas ne doit pas tourner sans fin
      while (garde-- > 0) {
        var op = Attente.prochaine(attente);
        if (!op) break;
        // ⚠️ LE CONFLIT « UNE SEULE EN COURS » SE RÉSOUT DANS L'ENVOI
        // (26/09/2026) : une autre séance encore ouverte en base est refermée
        // — la décision du chantier 36, puisque la nôtre est celle que le
        // téléphone a sous les yeux —, puis l'entrée repart AUSSITÔT, et ses
        // séries et ses paris derrière elle dans cette même boucle. Si le
        // renvoi échoue encore, l'entrée reste EN ÉCHEC, à retenter comme une
        // coupure : jamais bloquée, jamais abandonnée en silence.
        var echec = await Attente.envoyer(op, executer, refermerSeancesSauf);
        // §9.11 — ce que devient un envoi refusé se décide dans `attente.js`
        // (`apresEchec`). Une observation dont la série (23503) ou le pari
        // (`TH000`, 29/09/2026) n'est pas en base ATTEND : elle ne bloque
        // rien. Orpheline — sa séance n'a plus rien en file, son pari ne
        // montera jamais —, elle est ABANDONNÉE. Seul le reste arrête la
        // vidange.
        if (echec) {
          var issue = Attente.apresEchec(attente, op, echec);
          attente = issue.file;
          await Cache.ecrireAttente(attente).catch(function () {});
          if (issue.suite === 'abandonnee') {
            console.warn('Observation orpheline abandonnée (' + op.cle + ') : son pari n\u2019est pas en base, ' +
              'et sa séance n\u2019a plus rien à envoyer.');
            continue;
          }
          if (issue.suite === 'attend') continue;
          console.warn('Envoi différé (' + op.cle + ') :', texteErreur(echec));
          break;
        }
        // Retirée APRÈS confirmation, jamais avant — et seulement si elle est
        // restée CELLE QU'ON A ENVOYÉE. Un geste survenu pendant l'aller-retour
        // a pu la remplacer par une intention plus récente : la jeter perdrait
        // cette intention sans que rien ne le dise (voir `attente.js`).
        // `|| 1` : une entrée écrite par un build antérieur n'a pas de `version`.
        // Sans ce défaut elle serait retirée sans condition — donc la perte
        // silencieuse rouvrirait, une seule fois, pour ce qui traînait dans la
        // file au moment de la mise à jour.
        // Les observations qui attendaient repartent (`apresSucces`).
        attente = Attente.apresSucces(attente, op);
        await Cache.ecrireAttente(attente).catch(function () {});
        if (op.table === Attente.OBSERVATIONS) await confirmerObservation(op);
      }
    } finally {
      vidangeEnCours = false;
      rendreEtatSync();
    }
  }

  // Referme en base toutes les séances `en_cours` sauf celle-ci. UPDATE ciblé
  // (`Donnees.refermerSeance`) : rien n'est supprimé, elles gardent leurs
  // séries et rejoignent l'historique. Une lecture qui échoue remonte — la
  // vidange en fait un échec à retenter, pas un blocage.
  async function refermerSeancesSauf(id) {
    var ouvertes = await Donnees.seancesEnCours();
    for (var i = 0; i < (ouvertes || []).length; i++) {
      var x = ouvertes[i];
      if (!x || !x.id || x.id === id) continue;
      await Donnees.refermerSeance(x.id);
      console.warn('Séance restée ouverte en base refermée : ' + x.id);
    }
  }

  function executer(op) {
    if (op.table === Attente.SESSIONS && op.op === Attente.SUPPRIMER) {
      return Donnees.supprimerSeance(op.id);
    }
    if (op.table === Attente.SESSIONS) return Donnees.enregistrerSeance(op.donnees);
    if (op.table === Attente.SETS) return Donnees.remplacerSeries(op.id, op.donnees || []);
    // §9.1.1 — la ligne part telle qu'elle a été posée : son identifiant la
    // rend idempotente, sa date dit quand le choix a été fait.
    if (op.table === Attente.ZONES) return Donnees.enregistrerZone(op.donnees);
    // §9.11 — l'insertion IGNORE les doublons (le trigger refuserait un
    // upsert rejoué), et l'observation la suit par une mise à jour étroite.
    if (op.table === Attente.PREDICTIONS) return envoyerPrediction(op);
    if (op.table === Attente.OBSERVATIONS) return Donnees.observerPrediction(op.id, op.donnees || {});
    // §6 — l'intention porte l'ÉTAT VOULU de la routine, pas un chemin pour y
    // aller : le plan d'écritures se calcule à la vidange, contre ce que la
    // routine est devenue entre-temps. C'est de là que vient l'idempotence.
    if (op.table === Attente.ROUTINE_EXOS && op.op === Attente.PLAN) {
      return appliquerReportRoutine(op.id, op.donnees);
    }
    // ⚠️ UNE RÉPONSE DU CHANTIER 26 ENCORE EN FILE. Son intention visait UNE
    // ligne et portait des champs ; la nouvelle vise la routine et porte un
    // état. Sans cette porte, une file écrite avant la mise à jour serait
    // vidée sans rien écrire — exactement la perte silencieuse que la file
    // existe pour empêcher.
    if (op.table === Attente.ROUTINE_EXOS) return Donnees.majExercice(op.id, op.donnees);
    return Promise.resolve();
  }

  // ⚠️ UNE ENTRÉE `predictions` EN `observer` EST UNE ENTRÉE D'AVANT LE
  // 27/09/2026, encore sur un appareil : le pari et son observation dans la
  // même entrée. On la rejoue telle quelle — l'insertion part sans
  // observation, la mise à jour prouve qu'elle a touché le pari. Les entrées
  // neuves séparent les deux (`Attente.OBSERVATIONS`).
  async function envoyerPrediction(op) {
    await Donnees.enregistrerPrediction(op.donnees);
    if (op.op !== Attente.OBSERVER) return true;
    var l = op.donnees || {};
    await Donnees.observerPrediction(op.id, {
      valeur_observee: l.valeur_observee === undefined ? null : l.valeur_observee,
      observee_a: l.observee_a === undefined ? null : l.observee_a,
      set_observe: l.set_observe === undefined ? null : l.set_observe
    });
    return true;
  }

  // Après chaque geste : on sauve, on pose l'état des séries, on redessine.
  // Un seul chemin, pour qu'aucun geste ne puisse oublier l'un des trois.
  async function apresGeste(options) {
    var o = options || {};
    await sauverSeance();
    if (o.structure !== false) await poserSeries();
    if (o.rendre !== false) rendreSeance();
    // §14.5 (49-U15) — un exercice ajouté en cours de séance peut ouvrir sur
    // un repli : son pari s'écrit à sa première apparition (une fois).
    if (o.structure !== false) ecrireReplis().catch(function () {});
  }

  function poserSeries() {
    semerSeance();
    return poser({
      table: Attente.SETS, op: Attente.REMPLACER, id: seance.id,
      donnees: Seance.lignes(seance)
    });
  }

  function poserSeance(creation) {
    return poser({
      table: Attente.SESSIONS, op: Attente.UPSERT, id: seance.id,
      donnees: Seance.ligneSession(seance), creation: !!creation
    });
  }

  // ── Démarrer, reprendre, terminer ───────────────────────────────────────
  async function demarrerSeance(routine) {
    seance = Seance.creer({
      id: uuid(),
      userId: sessionActive && sessionActive.user && sessionActive.user.id,
      titre: routine ? routine.nom : null,
      routine: routine,
      idSerie: uuid
    });
    chrono = null;
    await sauverSeance();
    await poserSeance(true);
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
    // §14.4 (49-U14) — une séance créée PENDANT une semaine allégée ne garde
    // que ses lignes allégées.
    await appliquerAllegee();
    // §14.5 (49-U15) — le repli s'écrit à l'ouverture.
    await ecrireReplis();
    // §14.7 (49-U17) — une série de plus en cours : la ligne en plus.
    await appliquerSerieDePlus();
  }

  // §14.4 (49-U14) — RETIRER LES LIGNES EN TROP, une fois : à l'acceptation
  // de la carte et à la création d'une séance dans la période. Jamais au
  // rendu : une série ajoutée ensuite (« + Série ») reste. La règle est
  // `Plan.lignesARetirer` (les séries validées n'y sont jamais).
  async function appliquerAllegee() {
    if (!seance || enEdition()) return;
    var aRetirer = Plan.lignesARetirer(planActuel());
    if (!aRetirer.length) return;
    aRetirer.forEach(function (r) { seance = Seance.retirerSerie(seance, r.iExo, r.iSerie); });
    await apresGeste();
  }

  // ⚠️ RÉPARATION AU DÉMARRAGE (chantier 33). L'APPAREIL NE SE RÉPARE PAS TOUT
  // SEUL : un téléphone mis à jour porte peut-être déjà un brouillon dont des
  // séries n'ont pas d'identifiant, et une entrée de file que le serveur a
  // refusée en 23502 et que la file a donc bloquée DÉFINITIVEMENT. Le correctif
  // du contrat ne suffit pas — sans ce passage, ces séances ne remonteraient
  // JAMAIS, même après la mise à jour.
  //
  // L'ordre compte. Le MODÈLE d'abord : son entrée de file se reconstruit
  // ensuite depuis lui, donc les deux portent les MÊMES identifiants. Semer des
  // deux côtés séparément les ferait diverger — la ligne monterait sous une
  // identité, puis serait remplacée sous une autre au geste suivant.
  async function reparerIdentifiantsManquants() {
    var avant = seance;
    if (seance) {
      // `sauverSeance` sème et écrit le brouillon réparé.
      await sauverSeance();
      // Et si cette séance attendait déjà, son intention se repose depuis le
      // modèle : `poser` compresse sur la même clé, remonte la version et
      // remet `bloquee` à null — le déblocage et la réparation sont le même
      // geste, et l'intention reste un REMPLACEMENT COMPLET.
      var cle = Attente.cleDe(Attente.SETS, seance.id);
      if (seance !== avant && (attente || []).some(function (e) { return e.cle === cle; })) {
        await poserSeries();
      }
    }
    // Le reste de la file : les séances DÉJÀ TERMINÉES, dont plus aucun geste
    // ne repassera jamais. C'est le cas que le correctif du contrat n'atteint
    // pas, et c'est celui qui laisse une séance fantôme en base.
    var r = Attente.reparerIdentifiants(attente, uuid);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.lignes + ' série(s) sans identifiant dans ' +
      r.entrees + ' envoi(s) — ' + 'déblocage et renvoi complet.');
  }

  // ⚠️ ET CELLES QUE LE CHANTIER 36 NE PEUT PLUS CRÉER (chantier 37).
  //
  // Même raison, même règle : borner à la saisie n'a aucun effet sur ce qui est
  // DÉJÀ sur le disque, marqué définitif. Une file posée avant le correctif porte
  // peut-être un report de déviation refusé en `23514`, ou des reps hors `int4`
  // refusées en `22003` — et elle bloquait tout ce qui suivait.
  //
  // Ça compte maintenant : l'app s'ouvre à d'autres utilisateurs, un appareil
  // qui arrive avec une file bloquée n'a aucune issue, et `/__sw-off` — la seule
  // sortie connue — efface la file d'écriture avec les données non montées.
  //
  // Le bornage est celui de `THSeance`, pas un second jeu de règles : la
  // réparation et la saisie passent par la MÊME expression par colonne.
  async function reparerFileHorsBornes() {
    var r = Attente.reparerBornes(attente, Seance.bornerLigne);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.entrees + ' envoi(s) hors bornes débloqué(s)' +
      (r.lignes ? ', ' + r.lignes + ' série(s) bornée(s)' : '') + '.');
  }

  // ⚠️ ET CELLES QUE LE CONFLIT « UNE SEULE EN COURS » AVAIT BLOQUÉES (26/09).
  //
  // Même règle encore : une file écrite avant ce correctif porte peut-être une
  // séance marquée définitive sur `sessions_une_seule_en_cours`, et ses séries
  // et ses paris retenus derrière elle. On la débloque ; la vidange la renverra
  // en refermant d'abord l'autre séance.
  async function reparerFileConflitsEnCours() {
    var r = Attente.reparerConflitsEnCours(attente);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.entrees + ' séance(s) en conflit « une seule en cours » débloquée(s).');
  }

  // ══ LA SÉANCE `en_cours` RESTÉE EN BASE (chantier 36, D7) ════════════════
  //
  // `sessions_une_seule_en_cours` est un index UNIQUE sur `user_id` WHERE
  // `statut = 'en_cours'`, et il n'est PAS différable. Une séance restée ouverte
  // en base — autre appareil, réinstallation, ou un fantôme — fait donc échouer
  // la CRÉATION de la suivante en `23505` : code définitif, la file meurt, et
  // avec elle tout ce qui suit. `Donnees.seancesEnCours` avait été écrite
  // exactement pour ça, et n'était appelée que par un test.
  // (Depuis le 26/09/2026, ce `23505`-là n'est plus définitif : la vidange le
  // résout en refermant l'autre séance — voir `vidanger`. Cette fonction reste
  // la première ligne : elle évite le conflit au lieu de le réparer.)
  //
  // ── CE QU'ON EN FAIT, ET POURQUOI ──────────────────────────────────────
  //
  // Pas de brouillon local → on la REPREND. Elle peut porter des séries
  // validées ; les jeter serait la perte que tout ce projet s'interdit, et
  // `Donnees.seriesDeSeance` existe pour la rapatrier.
  //
  // Un brouillon local → on la REFERME (`statut = 'terminee'`). Les deux ne
  // peuvent pas coexister — l'index l'interdit — et c'est le brouillon local que
  // l'utilisateur a sous les yeux. Refermer ne perd RIEN : la séance distante
  // garde ses séries et rejoint l'historique.
  //
  // On ne DEMANDE pas. La question se poserait au démarrage, avant que
  // l'utilisateur ait rien fait, sur un cas qui est presque toujours un
  // fantôme — et les deux issues étant non destructives, il n'y a aucune
  // décision à lui déléguer. Une modale au boot est précisément ce que
  // l'ordonnanceur d'entrée a appris à ne plus faire.
  //
  // ⚠️ ET ÇA SE PASSE AU DÉMARRAGE, JAMAIS AU GESTE. « Démarrer une séance »
  // doit marcher hors ligne : y glisser une requête réseau ferait dépendre le
  // geste du réseau, ce que le contrat de la file interdit. Si la lecture
  // échoue, on ne bloque rien et on retentera au prochain démarrage.
  async function resoudreSeanceEnCoursDistante() {
    if (!sessionActive) return;
    var ouvertes;
    try { ouvertes = await Donnees.seancesEnCours(); }
    catch (e) {
      // Le réseau ne décide de rien : sans réponse, on ne touche à rien.
      console.warn('Séances en cours illisibles :', texteErreur(e));
      return;
    }
    // ⚠️ TOUTES CELLES QUI NE SONT PAS LA NÔTRE, pas « la première ». L'index
    // n'en autorise qu'une à la fois, mais il a pu être créé APRÈS que
    // plusieurs se soient installées — et surtout, si la première rendue est la
    // nôtre, s'arrêter là laisserait les autres bloquer la file pour toujours.
    var etrangeres = (ouvertes || []).filter(function (x) {
      return x && x.id && !(seance && seance.id === x.id);
    });
    if (!etrangeres.length) return;

    // Un brouillon local existe : les autres ne peuvent pas coexister avec lui,
    // on les referme. Aucune n'est supprimée — elles gardent leurs séries et
    // rejoignent l'historique.
    if (seance) {
      for (var i = 0; i < etrangeres.length; i++) {
        try {
          await Donnees.refermerSeance(etrangeres[i].id);
          console.warn('Séance restée ouverte en base refermée : ' + etrangeres[i].id);
        } catch (e) { console.warn('Séance distante non refermée :', texteErreur(e)); }
      }
      return;
    }

    // Aucun brouillon : on REPREND la plus récente, et on referme les autres.
    var triees = etrangeres.slice().sort(function (a, b) {
      return String(b.debut).localeCompare(String(a.debut));
    });
    var distante = triees[0];
    for (var j = 1; j < triees.length; j++) {
      try { await Donnees.refermerSeance(triees[j].id); }
      catch (e) { console.warn('Séance distante non refermée :', texteErreur(e)); }
    }

    try {
      var series = await Donnees.seriesDeSeance(distante.id);
      seance = Seance.reprendre(distante, Modele.construireBlocs(series, local.exercices));
      // Les tours se recalculent depuis ce qu'on vient de lire : `sessions` ne
      // les porte pas, et sans ça un superset repris repartirait au tour 0.
      seance = Seance.avancerTours(seance,
        Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
      chrono = null;
      await sauverSeance();
      rendreChrono();
    } catch (e) { console.warn('Séance distante non reprise :', texteErreur(e)); }
  }

  // Une seule séance en cours à la fois. Au lancement, si un brouillon existe,
  // on le REPREND — on n'en crée pas une seconde.
  // La vérification de la séance en cours en base, lancée au démarrage.
  // Toujours résolue (jamais rejetée) : on l'attend sans jamais en dépendre.
  var verificationSeance = null;

  async function chargerSeanceLocale() {
    try {
      seance = await Cache.lireBrouillon('seance');
      attente = await Cache.lireAttente();
    } catch (e) {
      console.warn('Séance locale illisible :', texteErreur(e));
      seance = null; attente = [];
    }
    // §9.13 bis (49-U3) — les consignes figées de CETTE séance, relues avec
    // elle. Une lecture qui échoue ne coûte qu'un recalcul : on n'invente rien.
    try { consignesSauvees = await Cache.lireBrouillon(CLE_CONSIGNES); }
    catch (e) { consignesSauvees = null; }
  }

  async function terminerSeance(verdict) {
    seance = Seance.terminer(seance, new Date());
    await sauverSeance();
    await poserSeries();
    await poserSeance(false);
    // §9.11 (27/09/2026) — LE RATTRAPAGE, en filet : chaque pari dont la copie
    // locale porte une observation sur une série encore validée la renvoie,
    // derrière les séries. Idempotent ; il répare toute divergence restante
    // entre la base et l'appareil, quelle qu'en soit l'origine.
    var aRenvoyer = Seance.observationsARenvoyer(local.predictions, seance);
    for (var r = 0; r < aRenvoyer.length; r++) await poserObservation(aRenvoyer[r]);
    // §6 — le report sur la routine, seulement s'il a été demandé, et APRÈS la
    // séance : la séance ne dépend pas de lui, et l'ordre de la file le dit.
    if (majRoutineVoulue) await reporterSurRoutine(verdict);
    majRoutineVoulue = false;
    var finie = seance;
    // La séance rejoint la liste TOUT DE SUITE, sans attendre le réseau : hors
    // ligne, elle serait sinon invisible entre « terminée » et « montée ».
    adopterLocalement(finie);
    seance = null; chrono = null; arreterMinuteur();
    // La barre s'efface AVEC la séance : la laisser affichée lui ferait
    // traverser la fin, et la réserve du bas la suivrait.
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConsignes();
    rendreSaisie();
  }

  // Verse la séance terminée dans le cache de lecture, pour qu'elle s'affiche
  // comme n'importe quelle autre. `Sync.remplacer` ne l'effacera pas tant
  // qu'elle est dans la file — c'est la garde de `sync.js`.
  // ⚠️ LE CACHE DE LECTURE DOIT APPRENDRE LES SUPPRESSIONS (chantier 35, D1).
  //
  // `Sync.fusionner` FUSIONNE : même identifiant → la nouveauté remplace. Rien
  // n'en sort jamais. Et `sets` se synchronise à l'INCRÉMENT, sur `created_at`
  // et `modifie_a` : une ligne effacée en base ne revient, par définition,
  // jamais dire qu'elle n'est plus là. Une série supprimée restait donc dans le
  // cache pour toujours.
  //
  // C'est la BOUCLE DE RÉSURRECTION, mesurée au banc d'écran :
  //   1. on supprime le curl, on enregistre → la base passe bien à 4 séries ;
  //   2. on recharge → l'écran relit le cache et remontre les 6 ;
  //   3. la correction suivante repose ces 6 → `remplacerSeries` les UPSERTE →
  //      la base repasse à 6.
  // Vu de l'utilisateur : « la suppression ne s'écrit pas ». Vu de la base :
  // elle s'écrivait, puis l'app la défaisait elle-même.
  //
  // La symétrie manquante : `Donnees.remplacerSeries` met la BASE à l'image de
  // la séance ; ici on met le CACHE à l'image de la même séance. Le périmètre
  // est la séance et rien qu'elle — on ne retire jamais une série d'une autre.
  function adopterLocalement(finie) {
    var ligne = Seance.ligneSession(finie);
    var restantes = Seance.lignes(finie);
    var retirees = Seance.idsRetires(local.series, finie);
    var partantes = {};
    retirees.forEach(function (id) { partantes[id] = true; });

    local.seances = Sync.fusionner(local.seances, [ligne]);
    local.series = Sync.fusionner(
      (local.series || []).filter(function (s) { return !s || !partantes[s.id]; }),
      restantes);
    rangerSeances();
    indexerParSeance();
    recalculerEtats();
    Cache.remplacerTout('seances', local.seances).catch(function () {});
    Cache.ecrireLot('series', restantes).catch(function () {});
    // Le disque APRÈS la mémoire, et seulement s'il y a quelque chose à retirer :
    // `Cache.supprimer` ouvre une transaction par lot, et une liste vide en
    // ouvrirait une pour rien.
    if (retirees.length) Cache.supprimer('series', retirees).catch(function () {});
  }

  // Abandonner SUPPRIME la séance. Sans ça, une séance `en_cours` fantôme
  // resterait en base et se rouvrirait au prochain lancement.
  async function abandonnerSeance() {
    var id = seance.id;
    // L'ordre compte : on retire d'abord les intentions d'écriture des séries,
    // sinon la vidange essaierait d'écrire des séries d'une séance supprimée.
    attente = Attente.retirer(attente, Attente.cleDe(Attente.SETS, id));
    seance = null; chrono = null; arreterMinuteur();
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConsignes();
    await poser({ table: Attente.SESSIONS, op: Attente.SUPPRIMER, id: id });
    rendreSaisie();
  }

  // ── Le chronomètre (§7 ter) ─────────────────────────────────────────────
  //
  // Il part à la VALIDATION d'une série et court jusqu'à la suivante. Le temps
  // d'exécution n'entre donc pas dans la mesure — elle est juste par
  // construction, là où un écart entre deux validations contiendrait les deux.
  //
  // Il INFORME, il ne commande pas : pas d'alarme au dépassement, pas de
  // blocage, aucun décompte qui presse.
  // ⚠️ UN REPOS DÉSACTIVÉ N'ARME RIEN (§7 sexdecies.3, défaut du §7 novodecies).
  //
  // La décision est dans `Seance.cibleArmable`, pas dans une condition écrite
  // ici : au point d'appel, elle ne se teste qu'en pilotant tout l'écran, et
  // c'est exactement pour ça que le défaut a vécu — le test du chantier 44
  // annonçait l'armement dans son nom et ne vérifiait que le stockage.
  //
  // ⚠️ ET VALIDER ARRÊTE TOUJOURS LE REPOS PRÉCÉDENT. Sans cible, on ne laisse
  // pas courir celui d'avant : commencer une série met fin au repos, qu'il y
  // ait quelque chose à compter ensuite ou non.
  // ⚠️ IL RETIENT QUI L'A ARMÉ (§7 quatervicies.2). Sans ça, régler le repos de
  // l'exercice B retargerait le décompte lancé par A — pire que le trou qu'on
  // bouche. L'identité est le COUPLE (indice, slug), et pas l'un des deux :
  // la séance n'a pas d'identifiant par exercice, l'indice bouge à la
  // réorganisation, et le slug ne distingue pas deux fois le même exercice.
  // Les deux ensemble échouent FERMÉ : dès qu'ils divergent, on ne retarge rien.
  function demarrerChrono(cible, iExo, slug) {
    var c = Seance.cibleArmable(cible);
    // C'est `rendreChrono` qui décide si le minuteur tourne — ici on repart
    // juste de zéro. Deux endroits qui lancent des `setInterval` finissent
    // toujours par en laisser un derrière.
    arreterMinuteur();
    chrono = c === null ? null
      : { depuis: Date.now(), cible: c, sonne: false, exo: { i: iExo, slug: slug } };
    // Le contexte audio doit NAÎTRE dans le geste utilisateur : une politique
    // d'autoplay refuse un contexte créé une minute plus tard, dans un
    // `setInterval`. On le réveille donc à la validation, pas à l'échéance —
    // et seulement s'il y a une échéance à annoncer.
    if (chrono) reveillerAudio();
    rendreChrono();
  }

  function arreterMinuteur() {
    if (minuteur) { racine.clearInterval(minuteur); minuteur = null; }
  }

  // ⚠️ UNE SEULE RÈGLE DÉCIDE SI LE MINUTEUR TOURNE, ET ELLE VIT DANS
  // `rendreChrono` : il tourne tant qu'il reste quelque chose à compter.
  //
  // Sans ce point de reprise, le +15 qui repousse une cible déjà franchie
  // n'aurait relancé personne : le chronomètre serait resté figé pour toujours,
  // et le repos suivant n'aurait plus jamais avancé. C'est le coût habituel
  // d'un arrêt — il faut aussi savoir repartir.
  function assurerMinuteur() {
    if (!minuteur) minuteur = racine.setInterval(rendreChrono, 1000);
  }

  function secondesDeRepos() {
    return Math.max(0, Math.round((Date.now() - chrono.depuis) / 1000));
  }

  // ══ RIEN D'INTERACTIF NE DOIT RESTER SOUS UNE BARRE FIXE ════════════════
  //
  // Constaté sur device au chantier 24 : la barre de repos RECOUVRAIT
  // « + Série » et « Ajouter un exercice ». On ne pouvait plus rien ajouter
  // pendant un repos — c'est-à-dire pendant les deux minutes où l'on a
  // justement le temps de le faire. Le chronomètre INFORME, il ne commande
  // pas (§7 ter.3) : masquer une commande, c'est commander.
  //
  // Deux hauteurs étaient écrites en dur et toutes deux fausses :
  //   · `.tel` réservait 88 px, alors que la barre d'onglets fait ~68 px PLUS
  //     l'encoche du bas, et que la barre de repos en ajoute ~65 de plus ;
  //   · `.repos` se posait à `bottom: 56px`, donc PAR-DESSUS les 12 px hauts
  //     de la barre d'onglets — qu'elle masquait aussi, z-index 50 contre 10.
  //
  // On MESURE les deux barres et on réserve exactement ce qu'elles occupent.
  // Une hauteur mesurée suit tout : l'encoche, le repli des commandes à 360 px,
  // une barre qu'on rendrait plus haute demain.
  var barresMesurees = { onglets: null, repos: null, pied: null };

  function mesurerBarres() {
    var style = doc.documentElement.style;
    var onglets = doc.querySelector('.onglets');
    var repos = $('repos');
    var pied = $('pied-reorg');
    // Une barre cachée — par elle-même ou par sa vue — rend un rectangle nul :
    // c'est le bon zéro, il n'y a rien à réserver pour ce qu'on ne voit pas.
    var hOnglets = onglets ? Math.ceil(onglets.getBoundingClientRect().height) : 0;
    // ⚠️ LES DEUX S'EMPILENT, ILS NE SE REMPLACENT PAS (corrigé le 18/09).
    // Le premier jet posait « les deux ne coexistent jamais — on ne range pas
    // pendant un repos » : c'est faux. Valider une série arme le chronomètre,
    // et remettre de l'ordre juste après est le geste le plus normal du monde.
    // Les deux barres étaient alors au même `bottom`, superposées au pixel près.
    //
    // La réserve du bas vaut donc leur SOMME, et le pied se pose au-dessus du
    // repos (`bottom: calc(--h-onglets + --h-repos)`, styles.css). La leçon est
    // celle du §7 sexies : ce qui est `position: fixed` n'ajoute aucune course
    // de défilement — ce qu'il couvre est perdu si la réserve ne le compte pas.
    var hRepos = (repos && !repos.hidden) ? Math.ceil(repos.getBoundingClientRect().height) : 0;
    var hPied = (pied && !pied.hidden) ? Math.ceil(pied.getBoundingClientRect().height) : 0;
    // On n'écrit QUE ce qui change. `rendreChrono` passe ici chaque seconde ;
    // réécrire la même valeur salirait le style pour rien, et une mesure suivie
    // d'une écriture qui change la mise en page est le début d'une boucle.
    if (hOnglets && hOnglets !== barresMesurees.onglets) {
      barresMesurees.onglets = hOnglets;
      style.setProperty('--h-onglets', hOnglets + 'px');
    }
    if (hRepos !== barresMesurees.repos) {
      barresMesurees.repos = hRepos;
      style.setProperty('--h-repos', hRepos + 'px');
    }
    if (hPied !== barresMesurees.pied) {
      barresMesurees.pied = hPied;
      style.setProperty('--h-pied', hPied + 'px');
    }
  }

  // ══ LA RÈGLE DU REPOS FINI VIT ICI, ET NULLE PART AILLEURS (§7 quinvicies) ═
  //
  // ⚠️ DÉFAUT CONSTATÉ SUR DEVICE : « −15 » jusqu'à zéro faisait disparaître la
  // barre, mais un décompte qui arrivait à zéro TOUT SEUL la laissait figée.
  // L'extinction était branchée sur le GESTE, dans `ajusterRepos`, et pas sur
  // l'ÉTAT — deux chemins vers le même zéro, un seul l'éteignait.
  //
  // Elle est donc remontée ICI, au SEUL endroit qui voit l'état à chaque
  // seconde. `appliquerCible` n'en sait plus rien : elle pose la cible et
  // redessine, et c'est ce passage-ci qui conclut. Un « −15 » n'est plus qu'un
  // moyen d'arriver à zéro plus vite.
  function rendreChrono() {
    var noeud = $('repos');
    if (!noeud) return;
    if (!chrono) { noeud.hidden = true; mesurerBarres(); return; }
    var secondes = secondesDeRepos();
    // UNE SEULE FOIS : `echeanceAtteinte` retourne faux dès que `sonne` est
    // posé, et rien ne le repose tant que la cible n'est pas repoussée.
    //
    // ⚠️ AVANT L'EXTINCTION, ET C'EST L'ORDRE QUI COMPTE : le repos qui se
    // termine s'ANNONCE, puis la barre s'en va. Éteindre d'abord avalerait le
    // bip du dernier passage — celui, justement, qui dit que c'est fini. Une
    // cible tombée à zéro par un « −15 » ne sonne pas, elle : `echeanceAtteinte`
    // répond faux sous une cible nulle, et quelqu'un qui coupe son repos n'a pas
    // besoin qu'on le lui annonce.
    if (Seance.echeanceAtteinte(chrono.cible, secondes, chrono.sonne)) {
      chrono.sonne = true;
      signalerEcheance();
    }
    // ⚠️ LA RÈGLE, ET ELLE EST SEULE. `eteindreChrono` rappelle cette fonction :
    // la récursion est bornée à UN niveau, parce que `chrono` y devient nul et
    // que le passage suivant sort sur la garde du dessus.
    if (Seance.reposTermine(chrono.cible, secondes)) { eteindreChrono(); return; }
    noeud.hidden = false;
    // Tant qu'il reste quelque chose à décompter, le minuteur tourne. Il n'y a
    // plus de troisième état à gérer : une barre affichée est une barre qui
    // compte, et une barre qui ne compte plus n'est plus affichée.
    assurerMinuteur();
    Rendu.rendreRepos(noeud, {
      // ⚠️ CE QU'ON PASSE AU RENDU EST LE TEMPS QUI RESTE (§7 quatervicies), pas
      // le temps écoulé. `secondes` reste la mesure interne — elle sert à
      // `echeanceAtteinte` et à `reposTermine` juste au-dessus — et ne sort plus
      // d'ici : l'écran ne montre que le décompte.
      //
      // Et `repos_s`, lui, se mesure à la validation suivante depuis l'écart
      // entre deux `validee_a` : il porte le repos RÉEL, même s'il a duré trois
      // fois la cible. La barre s'en va, l'observation continue.
      restant: Seance.secondesRestantes(chrono.cible, secondes),
      cible: chrono.cible,
      sourdine: sourdine,
      pas: Seance.PAS_REPOS,
      surAjuster: function (delta) { ajusterRepos(delta); },
      surSourdine: function () { basculerSourdine(); },
      surPasser: function () { eteindreChrono(); }
    });
    // APRÈS le rendu : la barre vient de prendre sa hauteur définitive.
    mesurerBarres();
  }

  // Une cible mal réglée est le cas courant : on la corrige par pas de 15 s,
  // en séance, sans rien enregistrer — le réglage vaut pour le repos en cours,
  // pas pour la routine.
  //
  // Repousser la cible au-delà du temps écoulé RÉARME l'échéance : c'est une
  // nouvelle échéance, posée à la main, pas une répétition de la précédente.
  // Le réglage vaut pour le REPOS EN COURS, jamais pour la routine — le repos
  // cible d'un exercice se change sous son nom (§7 septies.2), et la routine ne
  // bouge qu'à la fin, sur question (§6).
  function ajusterRepos(delta) {
    if (!chrono) return;
    // ⚠️ UN « −15 » N'EST QU'UN MOYEN D'ARRIVER À ZÉRO PLUS VITE (§7 quinvicies).
    //
    // Cette fonction portait la conclusion — « si la cible tombe à zéro, éteins »
    // — et c'est précisément pour ça que le décompte qui arrivait à zéro TOUT
    // SEUL restait affiché : personne ne concluait sur ce chemin-là. Elle ne
    // fait donc plus que de l'arithmétique bornée, et `rendreChrono` conclut.
    //
    // Ce qui ne change pas : le réglage vaut pour le REPOS EN COURS, jamais pour
    // la routine — le repos cible d'un exercice se change sous son nom
    // (§7 septies.2), et la routine ne bouge qu'à la fin, sur question (§6).
    appliquerCible(Seance.ajusterCible(chrono.cible, delta));
  }

  // La règle est ICI, et elle est UNE (§7 quatervicies.2) : deux gestes changent
  // la cible d'un repos qui court — les « −15/+15 » de la barre et la molette
  // sous le nom de l'exercice — et ils doivent en tirer les MÊMES conséquences.
  // Deux copies de ces quatre lignes, c'est la garantie qu'un chantier futur en
  // corrigera une sur deux ; c'est la maladie que ce dépôt passe son temps à
  // soigner.
  function appliquerCible(cible) {
    if (!chrono) return;
    chrono.cible = cible;
    // Une cible repoussée AU-DELÀ de l'écoulé réarme l'échéance : c'est une
    // échéance neuve, posée à la main, pas une répétition de la précédente.
    if (chrono.cible > secondesDeRepos()) chrono.sonne = false;
    // ⚠️ ELLE NE DÉCIDE PLUS DE L'EXTINCTION (ch. 51). Elle posait ici son
    // propre `if (reposEcoule(cible)) eteindreChrono()`, et c'était la moitié
    // du défaut : la même conclusion vivait à deux endroits, et seul celui-ci
    // était atteint par un geste. `rendreChrono` conclut désormais pour tout le
    // monde — y compris pour la cible à zéro qu'on vient peut-être de poser.
    rendreChrono();
  }

  // ══ LA MOLETTE RETARGE LE DÉCOMPTE EN COURS (§7 quatervicies.2) ═════════
  //
  // Constaté sur device : régler le repos d'un exercice pendant qu'on se repose
  // ne changeait RIEN à la barre. Le chronomètre avait copié sa cible à
  // l'armement, et plus personne ne la relisait — `repos_cible_s` n'était lu que
  // par `demarrerChrono`, à la validation SUIVANTE.
  //
  // ⚠️ LE §7 TERVICIES N'EST PAS CONTREDIT, IL EST ORIENTÉ. Il sépare deux objets
  // pour empêcher un « −15 » de désactiver une CONSIGNE ; il ne dit pas qu'un
  // geste doit rester sans effet. Le fil ne va donc que dans un sens :
  //
  //     −15 / +15 sur la barre  →  le décompte seul. La consigne ne bouge pas.
  //     molette sous l'exercice  →  la consigne ET le décompte, s'il est à lui.
  //
  // Et désactiver le repos pendant qu'il court, c'est dire « pas de repos ici » :
  // `appliquerCible(0)` éteint, exactement comme le −15 arrivé à zéro.
  function chronoDeCetExo(iExo) {
    if (!chrono || !chrono.exo) return false;
    var exo = seance && seance.exercices ? seance.exercices[iExo] : null;
    if (!exo) return false;
    return chrono.exo.i === iExo && chrono.exo.slug === exo.exercise_slug;
  }

  function retargeterChrono(iExo, cible) {
    if (!chronoDeCetExo(iExo)) return;
    // `cible` est relue depuis la séance APRÈS écriture : elle a donc déjà passé
    // les bornes de `definirReposCible`, ou elle vaut ce qu'elle valait si la
    // valeur a été refusée. `null` — repos désactivé — devient zéro, donc une
    // extinction.
    //
    // ⚠️ LE `|| 0` EST REDONDANT AUJOURD'HUI, ET IL RESTE EXPRÈS. Sa mutation
    // survit : `reposTermine` répond déjà « fini » sur `NaN` comme sur zéro
    // (via `secondesRestantes`, qui normalise), donc `Number(cible)` seul
    // éteindrait pareil. Ce n'est vrai QUE grâce à ce contrat, qui est épinglé
    // par un test (`v2-statut-seance`, §8) : le jour où il changerait, cette
    // normalisation serait la seule chose empêchant `chrono.cible = NaN` — une
    // barre qui ne finit jamais, le troisième état que le §7 novodecies interdit.
    appliquerCible(Number(cible) || 0);
  }

  // Le repos n'existe plus : ni objet, ni minuteur, ni barre. Les trois vont
  // ENSEMBLE — oublier `arreterMinuteur` laisse un `setInterval` qui rend un
  // chronomètre absent une fois par seconde, pour toujours.
  function eteindreChrono() {
    chrono = null;
    arreterMinuteur();
    rendreChrono();
  }

  function basculerSourdine() {
    sourdine = !sourdine;
    try { racine.localStorage.setItem('th-v2-sourdine', sourdine ? '1' : '0'); }
    catch (e) { /* stockage refusé : le choix vaut pour la session, pas au-delà */ }
    rendreChrono();
  }

  function lireSourdine() {
    try { sourdine = racine.localStorage.getItem('th-v2-sourdine') === '1'; }
    catch (e) { sourdine = false; }
  }

  // À l'échéance : un son court et unique, et une vibration unique (§3 bis.8).
  //
  // La SOURDINE coupe le son, pas la vibration. C'est délibéré : on met son
  // téléphone en silencieux dans une salle, on ne renonce pas pour autant à
  // savoir que le repos est fini. Couper les deux reviendrait à retirer le
  // chronomètre.
  //
  // ⚠️ LA VIBRATION D'ÉCHÉANCE — CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS.
  //
  // Signalé sur device, écran ALLUMÉ : le son part, la vibration non — ce n'est
  // donc pas la limite de Chrome sur écran éteint. Ce qui EST mesuré (banc
  // d'écran § 5 ter, navigateur réel) : l'app émet exactement UN
  // `navigator.vibrate(120)` à l'échéance, et rien ne le supprime ni ne le
  // double. Le défaut n'est pas dans l'émission.
  //
  // Ce que le banc ne peut PAS mesurer, et c'est le §2 quater à la lettre :
  // Chromium de bureau n'a pas de vibreur. `vibrate()` y rend `true` quoi qu'il
  // arrive — avec geste, sans geste, depuis un minuteur — et n'écrit rien en
  // console. « Accepté » et « refusé » y sont INDISTINGUABLES.
  //
  // On ne devine donc pas la suite : on rend la réponse de la plateforme
  // LISIBLE, pour que la mesure qui compte — sur l'appareil — tranche. Aucun
  // correctif spéculatif ici ; la proposition est dans le rapport du chantier.
  function signalerEcheance() {
    if (!sourdine) biper();
    if (vibrer(VIBRATION_ECHEANCE) === false) {
      console.warn('Vibration d’échéance refusée par la plateforme ' +
        '(activation utilisateur, visibilité, ou réglage système).');
    }
  }

  function contexteAudio() {
    if (audio) return audio;
    var C = racine.AudioContext || racine.webkitAudioContext;
    if (!C) return null;
    try { audio = new C(); } catch (e) { audio = null; }
    return audio;
  }

  function reveillerAudio() {
    if (sourdine) return;
    var a = contexteAudio();
    if (a && a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* rien à faire */ }
    }
  }

  // Le son est SYNTHÉTISÉ, pas chargé : pas de fichier binaire au dépôt, pas
  // de CDN, rien à précacher. Une sinusoïde de 880 Hz sur 200 ms, avec une
  // rampe d'attaque et d'extinction — un créneau coupé net claque.
  function biper() {
    var a = contexteAudio();
    if (!a || typeof a.createOscillator !== 'function') return;
    try {
      var t = a.currentTime;
      var osc = a.createOscillator();
      var gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) { /* le son est un confort, pas une garantie */ }
  }

  // ── Les gestes de saisie ────────────────────────────────────────────────
  async function validerSerie(iExo, iSerie) {
    var exo = seance.exercices[iExo];
    var serie = exo.series[iSerie];
    // ⚠️ `partEnBase`, PAS `validee_a` (chantier 35, D3). La case affichée cochée
    // et l'action du tap doivent dire la MÊME chose : une série importée
    // s'affiche cochée (elle a été faite) alors que son `validee_a` est NULL.
    // Tester `validee_a` ici ferait VALIDER une case déjà cochée — un tap qui
    // fait l'inverse de ce que l'écran annonce.
    if (Seance.partEnBase(serie)) {
      // Dévalider RETIRE la ligne : une série non validée ne peut pas exister
      // en base (`sets_validee_si_saisie`).
      seance = Seance.devalider(seance, iExo, iSerie);
      // R2 (49-18) — l'observation se vide SUR L'APPAREIL AVANT LE REDESSIN,
      // comme pour A et B : la partie synchrone d'`oublierObservationDe` est
      // faite dès l'appel. Avant, `apresGeste` dessinait un plan où la série
      // dévalidée portait encore l'observation de son pari (I7), et rien ne le
      // redessinait avant le geste suivant.
      var vidage = oublierObservationDe(iExo, iSerie);
      await apresGeste();
      await vidage;
      return observerSerie(iExo, iSerie);
    }
    // Ce qui est affiché en gris devient réel à la validation : on valide sans
    // rien taper quand c'est juste (§3 bis.3).
    //
    // ⚠️ SEULEMENT LES CHAMPS DU GABARIT. Recopier aveuglément les quatre
    // écrirait une charge sur une planche et une durée sur un développé — la
    // « planche à 0 kg × 45 » que ce chantier supprime, réintroduite par la
    // porte de derrière.
    var g = Modele.gabaritDe((local.exercices || []).filter(function (e) {
      return e && e.slug === exo.exercise_slug;
    })[0]);
    var plan = planDe(iExo);
    // §9.14 (ECRAN §3.2, 25/09/2026) — LA LIGNE PROPOSÉE NE SE VALIDE PAS À
    // VIDE. Ses reps ne sont pas un fantôme : valider sans les taper
    // enregistrerait le bas de la zone, et le pari serait jugé exact d'office.
    // On ne valide pas, on met le curseur dans les reps, et on le dit — sans
    // alarme ni rouge.
    if (plan[iSerie] && plan[iSerie].proposee && (serie.reps === null || serie.reps === undefined)) {
      Rendu.demanderReps($('blocs-seance'), iExo, iSerie);
      return;
    }
    var f = fantomeDe(iExo, iSerie);
    var champs = {};
    //
    // La seule condition qui compte est « le champ est VIDE » : ce qui a été
    // tapé n'est jamais écrasé. Un fantôme absent se normalise en `null` dans
    // `modifierSerie`, donc le tester ici ne changerait rien — un garde-fou
    // qu'aucune mutation ne peut tuer est un garde-fou mort (leçon de
    // `palier.js`, chantier 17).
    g.champs.forEach(function (nom) {
      var c = Modele.champDeMesure(nom);
      if (c && serie[c.cle] === null) champs[c.cle] = f[c.cle];
    });
    if (Object.keys(champs).length) seance = Seance.modifierSerie(seance, iExo, iSerie, champs);

    // ⚠️ EN CORRECTION, ON HORODATE LA SÉANCE, PAS L'INSTANT. Une ligne
    // ajoutée en rouvrant une séance d'avant-hier porterait sinon la date
    // d'aujourd'hui : un fait faux en base, dans la colonne même qui dit
    // quand la série a été faite.
    seance = Seance.valider(seance, iExo, iSerie,
      enEdition() ? new Date(seance.fin || seance.debut) : new Date());
    // §2.7 — le tour avance ICI, au geste, et jamais au rendu : une marque qui
    // se recalculerait à l'affichage reculerait à la première dévalidation,
    // et c'est précisément ce que l'asymétrie assumée interdit.
    seance = Seance.avancerTours(seance,
      Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    // §9.11, I7 G2 (49-17) — le pari de CETTE série est enregistré sur
    // l'appareil AVANT tout plan suivant, dans le même geste synchrone que la
    // validation : aucun plan ne voit la série validée sans son pari.
    var pariProvisoire = enregistrerPari(iExo, iSerie);
    vibrer();
    // ⚠️ PAS DE REPOS EN CORRECTION. Le chronomètre mesure le temps entre deux
    // séries RÉELLES ; en rouvrant une séance d'avant-hier, il compterait un
    // repos qui n'a pas eu lieu et l'écrirait dans `repos_s`.
    //
    // MOTEUR §9.15 (49-U10) — LE REPOS APRÈS CETTE SÉRIE VIENT DU PLAN
    // (`THPlan.reposApres`) : 60 s après une chauffe, 120 s après la dernière,
    // AUCUN avant la dégressive que le coach a remplie (« sans repos »), et le
    // repos de l'exercice pour une série de travail. Une cible nulle n'arme
    // rien ET arrête le repos d'avant — valider met toujours fin au repos
    // précédent.
    if (!enEdition()) demarrerChrono(Plan.reposApres(planDeLExercice(iExo), iSerie, exo.repos_cible_s), iExo, exo.exercise_slug);
    // ⚠️ L'OBSERVATION VIENT APRÈS `apresGeste`, ET C'EST L'ORDRE QUI COMPTE :
    // `poserSeries` y pose l'entrée des séries, donc avec un `seq` plus petit
    // que celui de la prédiction. `set_observe` trouve alors toujours sa série.
    await apresGeste();
    // §9.11 (49-C) — le pari de CETTE série, AVANT son observation : il doit
    // exister pour être observé. C'est aussi lui qui la fige (§9.13). Déjà sur
    // l'appareil ; il entre dans la file ICI, derrière les séries.
    if (pariProvisoire) await poserPari(await finirPari(pariProvisoire));
    await observerSerie(iExo, iSerie);
  }

  // Le retour haptique : aucun pixel, et il confirme la validation même avec
  // les mains moites (§3 bis.4). `vibrate` n'existe pas partout et peut être
  // refusé.
  //
  // ⚠️ 18 ms — la valeur d'avant — est SOUS le seuil utile : le moteur à masse
  // excentrée d'un téléphone met une vingtaine de millisecondes rien qu'à
  // démarrer, si bien que l'appel réussissait sans que rien ne se sente. C'est
  // l'explication la plus probable du « spécifié mais absent » relevé sur
  // device le 11/09 ; la vérification au banc est dans le rapport.
  var VIBRATION_VALIDATION = 35;
  var VIBRATION_ECHEANCE = 120;   // à travers une poche, il faut plus long

  // Rend CE QUE LA PLATEFORME A RÉPONDU — `false` quand elle refuse, `null`
  // quand l'API n'existe pas. Ignorer ce booléen, c'était se priver du seul
  // signal qui distingue « l'app n'a pas demandé » de « le téléphone a dit
  // non » : les deux se ressemblent exactement au poignet.
  function vibrer(duree) {
    try {
      if (racine.navigator && typeof racine.navigator.vibrate === 'function') {
        return racine.navigator.vibrate(duree || VIBRATION_VALIDATION);
      }
    } catch (e) { /* rien à faire : c'est un confort, pas une garantie */ }
    return null;
  }

  function precedentDe(slug) {
    return Seance.precedent(slug, local.seances, seriesDe, seance ? seance.id : null);
  }

  // ── §9.13 — LA CONSIGNE DE CHAQUE EXERCICE DE LA SÉANCE OUVERTE ────────────
  //
  // ⚠️ UNE FOIS PAR EXERCICE, JAMAIS À LA FRAPPE. Le mémo suit exactement le
  // patron de `datesExercices` : paresseux (le premier rendu suit l'ouverture,
  // donc « calculé à l'ouverture »), remis à `null` quand le CORPUS change
  // (`recalculerEtats`), et clé sur ce qui change la consigne sans toucher au
  // corpus : la séance ouverte et le profil (intention, rythme). Un slug qui
  // n'y est pas encore — un exercice ajouté en séance — se calcule seul.
  //
  // Tout est en mémoire (`local`, `seancesDeLExercice`) : aucun réseau, et en
  // salle il n'y en a pas. Le plan, lui, se dérive à chaque rendu depuis cette
  // consigne et la liste ACTUELLE des séries — c'est `Seance.planDe`, et c'est
  // de l'arithmétique sur trois entiers, pas le moteur.
  var consignes = null;   // { cle, index, parSlug }

  function cleConsignes() {
    return (seance ? seance.id : '') + '|' + ((profil && profil.intention) || '') +
      '|' + Profil.rythmeDe(profil);
  }

  // ⚠️ LA CONSIGNE EST FIGÉE POUR LA SÉANCE dès son premier calcul (MOTEUR
  // §9.13 bis, 49-U1, D7) : une synchronisation, un import, une séance
  // corrigée ailleurs pendant la séance servent à la séance SUIVANTE — le mémo
  // n'est plus remis à zéro par `recalculerEtats`. Il se recalcule quand la
  // CLÉ change (une autre séance, l'intention ou le rythme changés par
  // l'utilisateur), et pour UN exercice quand l'utilisateur corrige sa zone
  // (`poserZone`). `versionConsignes` dit au plan que le mémo a bougé.
  //
  // ⚠️ ON NE FIGE PAS SANS CATALOGUE : un exercice encore inconnu donnerait
  // une mesure inconnue, donc une consigne nulle, figée pour toute la séance.
  var versionConsignes = 0;

  // ⚠️ ET ELLE SURVIT AU RECHARGEMENT (MOTEUR §9.13 bis, 49-U3). Sur Android,
  // le système ferme souvent une PWA restée en arrière-plan pendant un repos :
  // un gel qui ne vivait qu'en mémoire recalculait la consigne à la
  // réouverture — sur un historique qu'une synchronisation avait pu changer.
  //
  // OÙ : dans le magasin `brouillon`, sous sa propre clé, à côté de la séance
  // en cours (`'seance'`) — même base, même durée de vie : relue avec elle au
  // démarrage (`chargerSeanceLocale`), effacée avec elle à la fin, à l'abandon,
  // à l'enregistrement d'une correction, et par `viderTout` (déconnexion,
  // changement de compte). PAS DANS L'OBJET `seance` : il part tel quel dans
  // la file et en base, et une consigne n'est pas une propriété de la séance
  // (« la proposition n'est jamais écrite », §7 septendecies.3).
  //
  // Liée à l'identifiant de la séance ET à la clé du mémo : une autre séance,
  // ou l'intention ou le rythme changés par l'utilisateur, la font ignorer.
  var CLE_CONSIGNES = 'consignes';
  var consignesSauvees = null;   // { seanceId, cle, parSlug }, tel que sur le disque

  function sauverConsignes() {
    // L'outil de rejeu (développement) ne fige rien sur le disque.
    if (!seance || !consignes || rejeuEnCours) return;
    consignesSauvees = { seanceId: seance.id, cle: consignes.cle, parSlug: consignes.parSlug,
                         phase: phaseDeLaSeance() };
    Cache.ecrireBrouillon(CLE_CONSIGNES, consignesSauvees)
      .catch(function (e) { console.warn('Consignes non sauvées :', texteErreur(e)); });
  }

  async function oublierConsignes() {
    consignesSauvees = null;
    phaseGelee = null;
    await Cache.ecrireBrouillon(CLE_CONSIGNES, null).catch(function () {});
  }

  // ── MOTEUR §9.16 (49-U11) — LA PHASE, GELÉE AVEC LA CONSIGNE ─────────────
  //
  // Lue UNE FOIS dans le profil (le cache, hors ligne compris), au moment où la
  // consigne de la séance se fige, et gelée pour la séance : changer de phase
  // dans Profil en pleine séance ne change ni la séance en cours ni ses paris
  // suivants — elle vaut à partir de la séance suivante. Elle ne suit PAS la
  // clé des consignes (un rythme changé recalcule la consigne, pas la phase) :
  // elle ne dépend que de la séance. Elle survit au rechargement avec les
  // consignes (`consignesSauvees.phase`). Jamais vide : `Profil.phaseDe`.
  var phaseGelee = null;   // { seanceId, phase }

  // MOTEUR §14.6 (49-U16) — LA RÈGLE DE VOLUME, UNE FOIS PAR SÉANCE, à côté
  // de la phase : le volume de chaque semaine par muscle sur TOUT l'historique
  // (`Semaine.semainesDeVolume`, importées comprises), puis la place de chaque
  // muscle (`Moteur.placeDeVolume`). Gelée en mémoire pour la séance : une
  // synchronisation en cours de séance ne la change pas ; au rechargement, le
  // même historique la redonne. Aucun affichage.
  var volumeGele = null;   // { seanceId, volume }
  function volumeDeLaSeance() {
    if (!seance) return null;
    if (volumeGele && volumeGele.seanceId === seance.id) return volumeGele.volume;
    var semaines = Semaine.semainesDeVolume(local.seances, local.series, local.exercices, seance.debut);
    var volume = {};
    Object.keys(semaines).forEach(function (m) { volume[m] = Moteur.placeDeVolume(semaines[m]); });
    volumeGele = { seanceId: seance.id, volume: volume };
    return volume;
  }

  function phaseDeLaSeance() {
    if (!seance) return null;
    var sauvee = consignesSauvees && consignesSauvees.seanceId === seance.id
      ? consignesSauvees.phase : null;
    phaseGelee = Profil.phaseGelee(phaseGelee, seance.id, sauvee, profil);
    return phaseGelee.phase;
  }

  // §12.9 (49-U13) — « sous consigne », dans l'app : une séance qui porte au
  // moins un pari sur l'exercice (table `predictions`, le fondement dit la
  // séance). Deux sources, réunies : les paris du serveur (tous appareils,
  // relus à la synchronisation, `local.sousConsigne`) et ceux de cet appareil
  // pas encore montés (`local.predictions`).
  var CLE_SOUS_CONSIGNE = 'sous-consigne';
  var CLE_PARIS_LEGERS = 'paris-legers';
  var CLE_PARIS_ESCALIER = 'paris-escalier';

  // `{ [slug]: [identifiants de séance] }`, à partir de lignes `predictions` —
  // celles du serveur (`session_id`, colonne générée) ou celles de l'appareil
  // (le fondement).
  function seancesAvecPari(lignes) {
    var parSlug = {}, vus = {};
    (lignes || []).forEach(function (l) {
      var slug = l && l.exercise_slug;
      var id = !slug ? null : l.session_id || (l.fondement ? l.fondement.seance : null);
      if (!id || vus[slug + '|' + id]) return;
      vus[slug + '|' + id] = true;
      (parSlug[slug] || (parSlug[slug] = [])).push(id);
    });
    return parSlug;
  }

  function seancesSousConsigne(slug) {
    var ids = ((local.sousConsigne || {})[slug] || []).slice();
    var vus = {};
    ids.forEach(function (id) { vus[id] = true; });
    (local.predictions || []).forEach(function (l) {
      var id = l && l.exercise_slug === slug && l.fondement ? l.fondement.seance : null;
      if (id && !vus[id]) { vus[id] = true; ids.push(id); }
    });
    return ids;
  }

  // ── MOTEUR §14.4 (49-U14) — L'ESCALIER : CE QUE L'APP LIT POUR LE PLAN ──
  //
  // Les paris de l'escalier : ceux du serveur (`local.escalier`) et ceux de cet
  // appareil (`local.predictions`, `module = 'escalier'`), une fois chacun — la
  // copie de l'appareil l'emporte (elle porte la dernière observation posée).
  function parisEscalierConnus() {
    var parId = {};
    (local.escalier || []).forEach(function (l) { if (l && l.id) parId[l.id] = l; });
    (local.predictions || []).forEach(function (l) {
      if (l && l.id && l.module === Moteur.MODULE_ESCALIER) parId[l.id] = l;
    });
    return Object.keys(parId).map(function (k) { return parId[k]; });
  }

  // Les compteurs à l'ouverture, lus dans le fondement des paris de consigne :
  // ceux du serveur (`local.parisLegers`, la colonne `compteur`) et ceux de
  // l'appareil. Une entrée par (séance, exercice). La date est celle de la
  // séance (`local.seances`, ou la séance ouverte).
  function compteursDesParis() {
    var debutDe = {};
    (local.seances || []).forEach(function (s) { if (s && s.id) debutDe[s.id] = s.debut; });
    if (seance && seance.id) debutDe[seance.id] = seance.debut;
    var vus = {}, sortie = [];
    var ajouter = function (slug, sid, c) {
      if (!slug || !sid || typeof c !== 'number' || !debutDe[sid] || vus[sid + '|' + slug]) return;
      vus[sid + '|' + slug] = true;
      sortie.push({ exercice: slug, seance: sid, compteur: c, debut: debutDe[sid],
                    jour: Moteur.jourCivil(debutDe[sid]) });
    };
    (local.predictions || []).forEach(function (l) {
      if (!l || l.module === Moteur.MODULE_ESCALIER || !l.fondement) return;
      ajouter(l.exercise_slug, l.fondement.seance, l.fondement.compteur);
    });
    (local.parisLegers || []).forEach(function (l) {
      var c = l && typeof l.compteur === 'string' ? Number(l.compteur) : l && l.compteur;
      ajouter(l && l.exercise_slug, l && l.session_id, typeof c === 'number' && isFinite(c) ? c : null);
    });
    return sortie;
  }

  // Les semaines allégées ACCEPTÉES, `[{ debut, fin }]` : le compteur ne compte
  // ni ne juge leurs séances (décharge déclarée, §9.10).
  // §14.7 (49-U17) — les périodes de série de plus d'un exercice, lues dans les
  // paris de l'escalier et les compteurs figés : `[{ debut, fin, n }]`.
  function periodesSerieDePlusDe(slug) {
    var p = Moteur.periodesSerieDePlus(Moteur.marchesDesParis(parisEscalierConnus()), compteursDesParis());
    return p[slug] || [];
  }

  function periodesAllegees() {
    return Moteur.cartesDesParis(parisEscalierConnus()).filter(function (c) {
      return c.reponse === 'acceptee' && c.debut && c.fin;
    }).map(function (c) { return { debut: c.debut, fin: c.fin }; });
  }

  // Les séries de travail d'un exercice dans la séance ouverte : à l'ouverture,
  // celles de la routine (ou du pré-remplissage). Figées avec la consigne.
  function nombreDeSeriesDeTravail(slug) {
    var exo = ((seance && seance.exercices) || []).filter(function (x) { return x && x.exercise_slug === slug; })[0];
    return exo ? (exo.series || []).filter(function (s) { return Seance.typeDe(s) === 'travail'; }).length : 0;
  }

  function consigneDe(slug) {
    if (!seance) return null;
    var cle = cleConsignes();
    if (!consignes || consignes.cle !== cle) {
      var sauvees = consignesSauvees && consignesSauvees.seanceId === seance.id &&
        consignesSauvees.cle === cle && consignesSauvees.parSlug ? consignesSauvees.parSlug : null;
      consignes = { cle: cle, index: Modele.indexerExercices(local.exercices),
                    parSlug: sauvees ? Object.assign({}, sauvees) : {} };
      versionConsignes++;
    }
    if (!Object.prototype.hasOwnProperty.call(consignes.parSlug, slug)) {
      var exo = consignes.index[slug];
      if (!exo && (local.exercices || []).length) {
        consignes.index = Modele.indexerExercices(local.exercices);
        exo = consignes.index[slug];
      }
      var calculee = Moteur.consigneDExercice(
        seancesDeLExercice(slug), etatsExercices[slug], seance.debut, optionsDeConsigne(slug, exo));
      if (!exo) return calculee;
      // §14.4 (49-U14) — les séries de travail de la routine, FIGÉES avec la
      // consigne : la semaine allégée en couvre 60 %, et « + Série » ne change
      // pas ce compte en cours de séance.
      if (calculee) calculee.seriesRoutine = nombreDeSeriesDeTravail(slug);
      consignes.parSlug[slug] = calculee;
      versionConsignes++;
      sauverConsignes();
    }
    // §14.7 (delta 49-35) — un exercice ajouté hors routine : sa consigne a
    // servi au pré-remplissage AVANT ses séries (figée à 0). Sa routine se fige
    // à ses premières séries — sinon le compte suivrait « + Série », et la
    // ligne de plus se fondrait dans la routine.
    var figee = consignes.parSlug[slug];
    if (figee && figee.seriesRoutine === 0) {
      var premieres = nombreDeSeriesDeTravail(slug);
      if (premieres > 0) {
        figee.seriesRoutine = premieres;
        versionConsignes++;
        sauverConsignes();
      }
    }
    return consignes.parSlug[slug];
  }

  // ⚠️ LES OPTIONS DE LA CONSIGNE, UNE SEULE FOIS (49-U18, 01/10/2026). La
  // consigne de la séance (`consigneDe`) et la consigne de la PROCHAINE séance
  // que le constat annonce (`suiteDe`) sont le même calcul
  // (`Moteur.consigneDExercice`) : elles reçoivent les mêmes entrées. La suite
  // en recevait moins (ni les séances sous consigne, ni les zones par date, ni
  // les périodes) — sa « cible de la prochaine fois » pouvait ne pas être la
  // consigne de la fois d'après (« le coach ne fait qu'un »).
  function optionsDeConsigne(slug, exo) {
    var g = Modele.gabaritDe(exo);
    return {
      mesure: g.inconnue ? null : g.mesure,
      equipement: exo ? exo.equipement : null,
      intention: profil ? profil.intention : null,
      reglage: Profil.rythmeDe(profil),
      // §9.1.1 — la zone choisie, ou `null`. Le mémo ne la porte pas dans
      // sa clé : `poserZone` le remet à zéro, et la synchronisation passe
      // par `recalculerEtats`, qui fait déjà de même.
      correction: zoneDe(slug),
      // §12.9 (49-U13) — les séances SOUS CONSIGNE de l'exercice : celles
      // qui portent au moins un pari sur lui. Le compteur de stagnation ne
      // compte qu'elles ; les séances importées ou d'avant le coach n'en
      // portent aucun.
      seancesSousConsigne: seancesSousConsigne(slug),
      // Et l'historique des zones choisies : chaque séance passée se rejoue
      // avec la zone en vigueur ce jour-là, pas celle d'aujourd'hui.
      correctionsDeZone: (local.zones || []).filter(function (l) { return l && l.exercise_slug === slug; }),
      // §14.4 (49-U14) — les semaines allégées acceptées : leurs séances ne
      // sont ni comptées ni jugées par le compteur.
      periodesAllegees: periodesAllegees(),
      // §14.7 (49-U17) — les périodes où une série de plus était active :
      // le niveau de ces séances se lit sur les séries de la routine.
      periodesSerieDePlus: periodesSerieDePlusDe(slug),
      // §7 octies — une séance terminée rouverte est une séance FAITE : le
      // moteur n'y prescrit rien, ni en-tête ni plan.
      edition: enEdition()
    };
  }

  // ── §9.13 bis (49-U1) — LE PLAN DE SÉANCE, UN SEUL COACH ─────────────────
  //
  // Un seul calcul (`THPlan.planDeSeance`) décide de tout ce que le coach dit
  // et fait dans la séance ; la grille, l'en-tête, le « Donc » du « Pourquoi »
  // et la phrase du coach le LISENT. Mémoïsé sur ses entrées : la séance (un
  // nouvel objet à chaque geste), les paris (un nouveau tableau à chaque
  // écriture), la version du mémo des consignes et le mode Édition.
  var planMemo = null;

  // §9.13 bis (49-U7) — LA GARDE DU COACH. Hors production (machine locale,
  // prévisualisation Cloudflare, `?garde=1`), chaque plan calculé passe les
  // invariants ; une violation s'écrit en console et un petit marqueur
  // apparaît. En production, `verifier` ne fait rien (`THPlan.creerGarde`).
  var garde = Plan.creerGarde({
    location: racine.location,
    stockage: (function () { try { return racine.localStorage; } catch (e) { return null; } })(),
    journal: racine.console,
    marquer: marquerGarde
  });
  // Le banc lit ce que la garde a vu (le nombre de plans vérifiés) ; rien
  // d'autre ne le relit.
  Plan.garde = garde;
  // §14.4 (49-U14) — `?escalier=demo` se lit AU DÉMARRAGE, avant que le
  // routeur ne réécrive l'adresse ; il est ensuite retenu pour la session.
  try { demoEscalier(); } catch (e) { /* rien à retenir */ }

  // ══ L'OUTIL DE REJEU (développement seulement, diagnostic du 01/10/2026) ══
  //
  // `…/saisie?rejouer=<id de séance>`, LÀ OÙ LA GARDE EST ACTIVE — jamais en
  // production (`THRejeu.demande`). Il rejoue le plan de la séance à
  // l'ouverture, puis après chaque série validée (ordre réel de `validee_a`),
  // chaque réponse de l'escalier et chaque zone corrigée, et l'écrit en texte
  // (`rejeu.js`).
  //
  // ⚠️ IL PASSE PAR LES FONCTIONS MÊMES DE L'APP — `consigneDe`,
  // `entreesDuPlan`, `fantomeDe` —, sur un état « tel qu'à l'ouverture » posé
  // à la place de l'état courant le temps d'un calcul SYNCHRONE, puis rendu
  // (`finally`). Aucune attente entre les deux : aucun geste, aucune
  // synchronisation, aucun rendu ne voit l'état du rejeu. Et pendant ce calcul
  // (`rejeuEnCours`), rien ne s'écrit : ni consigne figée sur le disque
  // (`sauverConsignes`), ni la garde, ni `Plan.dernier`. La séance en cours,
  // s'il y en a une, n'est ni lue ni touchée.
  var rejeuEnCours = null;    // { instant } pendant un calcul de rejeu
  var rejeuDemande = null;    // l'identifiant lu au démarrage
  var rejeuSortie = null;     // le dernier texte rendu
  try { rejeuDemande = Rejeu ? Rejeu.demande(racine.location, garde.active) : null; } catch (e) { rejeuDemande = null; }

  var ROLE_DU_PARI_REJEU = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour' };

  async function rejouerSeance(id) {
    var ligne = (local.seances || []).filter(function (s) { return s && s.id === id; })[0] || null;
    if (!ligne) {
      return 'Séance ' + id + ' introuvable sur cet appareil : la synchronisation est-elle finie ? ' +
        '(Seules les séances terminées se rejouent.)\n';
    }
    var notes = [];
    var parId = {}, serveur = 0, appareil = 0;
    try {
      (await Donnees.parisDeSeance(id)).forEach(function (l) {
        if (l && l.id && l.fondement && l.fondement.seance === id) { parId[l.id] = l; serveur++; }
      });
    } catch (e) {
      notes.push('les paris du serveur n’ont pas pu être lus (' + texteErreur(e) + ') : seuls ceux de l’appareil le sont');
    }
    (local.predictions || []).forEach(function (l) {
      if (!l || !l.id || !l.fondement || l.fondement.seance !== id) return;
      if (!parId[l.id]) appareil++;
      parId[l.id] = l;
    });
    var paris = Object.keys(parId).map(function (k) { return parId[k]; }).sort(function (a, b) {
      var ta = Date.parse(a.emise_a), tb = Date.parse(b.emise_a);
      return ta !== tb ? ta - tb : (a.id < b.id ? -1 : 1);
    });
    var routine = null;
    if (ligne.routine_id) {
      if (etatRoutines.code !== 'ok') await chargerRoutines().catch(function () { return false; });
      routine = (routines || []).filter(function (r) { return r && r.id === ligne.routine_id; })[0] || null;
    }
    return calculerRejeu(ligne, paris, routine, notes, { serveur: serveur, appareil: appareil });
  }

  // L'état d'UNE étape posé à la place de l'état courant, `fn` calculée, puis
  // tout rendu. Le mémo des consignes du rejeu survit d'une étape à l'autre
  // (`memo`) : la consigne se fige à l'ouverture, comme dans la séance.
  function avecEtatDeRejeu(e, fn) {
    var avant = { seance: seance, local: local, consignes: consignes, sauvees: consignesSauvees,
                  version: versionConsignes, phaseGelee: phaseGelee, volumeGele: volumeGele,
                  constats: constats, planMemo: planMemo, etats: etatsExercices, dernier: Plan.dernier };
    seance = e.seance; local = e.local;
    consignes = e.memo.consignes; consignesSauvees = null; versionConsignes = e.memo.version;
    phaseGelee = e.memo.phaseGelee; volumeGele = e.memo.volumeGele; constats = null;
    planMemo = null; etatsExercices = e.etats;
    rejeuEnCours = { instant: e.instant };
    try {
      return fn();
    } finally {
      e.memo.consignes = consignes; e.memo.version = versionConsignes;
      e.memo.phaseGelee = phaseGelee; e.memo.volumeGele = volumeGele;
      seance = avant.seance; local = avant.local; consignes = avant.consignes;
      consignesSauvees = avant.sauvees; versionConsignes = avant.version;
      phaseGelee = avant.phaseGelee; volumeGele = avant.volumeGele; constats = avant.constats;
      planMemo = avant.planMemo; etatsExercices = avant.etats; Plan.dernier = avant.dernier;
      rejeuEnCours = null;
    }
  }

  function memeNombre(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return a === b || (a == null && b == null);
    return Number(a) === Number(b);
  }

  function calculerRejeu(ligne, paris, routine, notes, lus) {
    var id = ligne.id;
    var enBase = Seance.reprendre(ligne, Modele.construireBlocs(seriesDe(id), local.exercices));
    // La séance de l'ouverture : la routine (les lignes jamais validées
    // reconstruites, vides), puis ce que la base y ajoute (`THRejeu.structure`).
    var pres = {};
    var reconstruites = [];
    var finale = Object.assign({}, enBase, { statut: Seance.EN_COURS, fin: null,
      exercices: Rejeu.structure(enBase.exercices, routine ? { exercices: routine.exercices } : null).map(function (x) {
        var exo = x.iExo === null ? null : enBase.exercices[x.iExo];
        var parId = {};
        ((exo && exo.series) || []).forEach(function (s) { parId[s.id] = s; });
        return Object.assign({ exercise_slug: x.exercise_slug, routine_exercise_id: null, repos_cible_s: null,
                               note: null, groupe_superset: null }, exo || {}, {
          series: x.lignes.map(function (l) {
            pres[l.id] = l;
            if (l.reconstruite) reconstruites.push(x.exercise_slug);
            return parId[l.id] ? parId[l.id] : Object.assign(Seance.serieVide(l.id), { type_serie: l.type_serie });
          })
        });
      })
    });
    var debutMs = Date.parse(ligne.debut);
    var finMs = Date.parse(ligne.fin || '');
    if (!isFinite(finMs)) finMs = Infinity;
    var index = catalogueIndexe();
    var nomDe = function (slug) { return index[slug] && index[slug].nom ? index[slug].nom : slug; };

    // ── L'historique, tel que l'app l'avait à l'ouverture ──
    var seances = (local.seances || []).filter(function (s) { return s && s.id !== id && Date.parse(s.debut) < debutMs; });
    var ids = {};
    seances.forEach(function (s) { ids[s.id] = true; });
    var series = (local.series || []).filter(function (s) { return s && ids[s.session_id]; });
    var parSeance = new Map();
    series.forEach(function (s) {
      var l = parSeance.get(s.session_id);
      if (l) l.push(s); else parSeance.set(s.session_id, [s]);
    });
    var sousConsigne = {};
    Object.keys(local.sousConsigne || {}).forEach(function (slug) {
      var l = (local.sousConsigne[slug] || []).filter(function (sid) { return ids[sid]; });
      if (l.length) sousConsigne[slug] = l;
    });
    var dAvant = function (l) {
      var sid = l && (l.session_id || (l.fondement && l.fondement.seance));
      return !!sid && !!ids[sid];
    };
    var parisLegers = (local.parisLegers || []).filter(dAvant);
    var escalierAvant = (local.escalier || []).filter(dAvant);
    var predictionsAvant = (local.predictions || []).filter(dAvant);
    var etats = {};
    try { etats = Palier.etatsExercices(Palier.seanceExercices(series)); } catch (e) { etats = {}; }

    // ── Ce que les paris de la séance disent de l'ouverture ──
    var deConsigne = paris.filter(function (l) { return l.module !== Moteur.MODULE_ESCALIER && l.exercise_slug; });
    var phaseLue = null;
    deConsigne.forEach(function (l) { if (!phaseLue && l.fondement && l.fondement.phase) phaseLue = l.fondement.phase; });
    var reglageLu = null;
    deConsigne.forEach(function (l) { if (!reglageLu && l.fondement && l.fondement.reglage) reglageLu = l.fondement.reglage; });

    // ── Les événements, dans l'ordre réel ──
    var evts = [];
    Rejeu.etapes(finale.exercices).forEach(function (v) { evts.push({ a: v.a, ordre: 2, quoi: 'serie', v: v }); });
    paris.filter(function (l) { return l.module === Moteur.MODULE_ESCALIER && l.emise_a; }).forEach(function (l) {
      evts.push({ a: l.emise_a, ordre: 1, quoi: 'escalier', pari: l });
    });
    (local.zones || []).forEach(function (z) {
      var t = z && Date.parse(z.corrigee_a);
      if (isFinite(t) && t > debutMs && t <= finMs) evts.push({ a: z.corrigee_a, ordre: 0, quoi: 'zone', zone: z });
    });
    evts.sort(function (x, y) {
      var tx = Date.parse(x.a), ty = Date.parse(y.a);
      return tx !== ty ? tx - ty : x.ordre - y.ordre;
    });

    var ajoutees = [];
    finale.exercices.forEach(function (exo) {
      (exo.series || []).forEach(function (s, i) {
        if (pres[s.id] && !pres[s.id].ouverture) ajoutees.push(nomDe(exo.exercise_slug) + ' #' + (i + 1));
      });
    });

    // ── La séance à une étape : les séries validées (leurs valeurs), et les
    // autres lignes de l'ouverture, VIDES (la base ne garde pas une saisie non
    // validée) ──
    var seanceA = function (validees) {
      var exos = finale.exercices.map(function (exo) {
        var siennes = (exo.series || []).filter(function (s) {
          return validees[s.id] || (pres[s.id] && pres[s.id].ouverture);
        }).map(function (s) {
          var p = pres[s.id] || {};
          var b = Object.assign({}, s, { reps_visees: p.reps_visees === undefined ? null : p.reps_visees,
                                         charge_cible_kg: p.charge_cible_kg === undefined ? null : p.charge_cible_kg });
          if (validees[s.id]) return b;
          return Object.assign(b, { charge_kg: null, reps: null, duree_s: null, distance_m: null, rpe: null,
                                    ressenti: null, validee_a: null, repos_s: null, source: null });
        });
        return Object.assign({}, exo, { series: siennes });
      }).filter(function (exo) { return exo.series.length; });
      return Object.assign({}, finale, { exercices: exos });
    };

    var memo = { consignes: null, version: 0, volumeGele: null,
                 phaseGelee: phaseLue ? { seanceId: id, phase: phaseLue } : null };
    var validees = {};
    var zonesVues = {};
    var resultat = [];
    var precedent = null;
    for (var k = 0; k <= evts.length; k++) {
      var ev = k === 0 ? null : evts[k - 1];
      if (ev && ev.quoi === 'serie') validees[ev.v.id] = true;
      var t = ev ? ev.a : ligne.debut;
      var tMs = Date.parse(t);
      var loc = {
        seances: seances, series: series, exercices: local.exercices, pesees: local.pesees,
        zones: (local.zones || []).filter(function (z) { return z && Date.parse(z.corrigee_a) <= tMs; }),
        // Les paris de la séance déjà écrits à cet instant : celui d'une série
        // validée (sa série observée) ; sans série observée, par son heure
        // d'émission (une réponse de l'escalier, un pari dont l'observation n'a
        // pas été écrite — une seconde de marge après la validation).
        predictions: predictionsAvant.concat(paris.filter(function (l) {
          if (l.set_observe) return !!validees[l.set_observe];
          return Date.parse(l.emise_a) <= tMs + (ev && ev.quoi === 'serie' ? 1000 : 0);
        })),
        sousConsigne: sousConsigne, parisLegers: parisLegers, escalier: escalierAvant, parSeance: parSeance
      };
      var etape = avecEtatDeRejeu({ seance: seanceA(validees), local: loc, memo: memo, etats: etats, instant: t },
        function () {
          // Une zone corrigée en cours de séance : son exercice se recalcule,
          // lui seul (`poserZone`).
          if (consignes && consignes.parSlug) {
            Object.keys(consignes.parSlug).forEach(function (slug) {
              if (Object.prototype.hasOwnProperty.call(zonesVues, slug) && zonesVues[slug] !== zoneDe(slug)) {
                delete consignes.parSlug[slug];
                versionConsignes++;
              }
            });
          }
          var entrees = entreesDuPlan();
          var plan = Plan.planDeSeance(entrees);
          var verification = Plan.verifierPlan(plan, entrees, precedent ? precedent.plan : null);
          var occ = {};
          var blocs = plan.exercices.map(function (x, i) {
            var exo = seance.exercices[i];
            occ[x.slug] = (occ[x.slug] || 0) + 1;
            zonesVues[x.slug] = zoneDe(x.slug);
            var fantomes = {};
            x.lignes.forEach(function (l) { if (!l.validee) fantomes[l.iSerie] = fantomeDe(i, l.iSerie); });
            var controles = controlesRejeu(x, exo, ev, precedent, paris, k === 0);
            return { cle: x.slug + '#' + occ[x.slug], nom: nomDe(x.slug),
                     texte: Rejeu.texteExercice(x, { nom: nomDe(x.slug), series: exo.series, fantomes: fantomes, controles: controles }) };
          });
          return { plan: plan, verification: verification, blocs: blocs };
        });
      etape.titre = titreEtape(k, ev, t, finale, nomDe);
      resultat.push(etape);
      precedent = etape;
    }

    var entete = [
      finale.exercices.length + ' exercice(s) · ' + seriesDe(id).length + ' série(s) en base · ' +
        Rejeu.etapes(finale.exercices).length + ' validée(s) · ' + paris.length + ' pari(s) (' +
        lus.serveur + ' du serveur, ' + lus.appareil + ' de l’appareil seulement)',
      'historique lu : ' + seances.length + ' séance(s) terminée(s) avant le début, ' + series.length + ' série(s)',
      'phase gelée : ' + (phaseLue ? phaseLue + ' (lue dans les paris)' : (Profil.phaseDe(profil) + ' (profil actuel : aucun pari ne la porte)')),
      'rythme : ' + Profil.rythmeDe(profil) + ' (profil actuel)' +
        (reglageLu ? (reglageLu === Profil.rythmeDe(profil) ? ' = celui des paris ✓' : ' ≠ celui des paris (' + reglageLu + ') ✗') : ''),
      'intention : ' + ((profil && profil.intention) || '–') + ' (profil actuel)',
      'routine : ' + (routine ? '« ' + (routine.nom || '?') + ' » (sa structure ACTUELLE)' : (ligne.routine_id ? 'introuvable' : 'aucune'))
    ];
    notes.push('l’historique est celui du cache d’aujourd’hui, coupé au début de la séance : une séance antérieure corrigée depuis l’est aussi ici');
    if (routine) {
      notes.push('les lignes présentes à l’ouverture viennent de la routine actuelle ; les autres (' +
        (ajoutees.length ? ajoutees.join(', ') : 'aucune') + ') n’apparaissent qu’à leur validation, en fin d’exercice — l’instant et la place d’un ajout ne sont pas en base');
      var parExo = {};
      reconstruites.forEach(function (slug) { parExo[slug] = (parExo[slug] || 0) + 1; });
      var dites = Object.keys(parExo).map(function (slug) { return nomDe(slug) + ' × ' + parExo[slug]; });
      notes.push('lignes de la routine jamais validées, reconstruites vides (elles ont pu être retirées pendant la séance) : ' +
        (dites.length ? dites.join(', ') : 'aucune'));
    } else {
      notes.push('sans routine, toutes les séries en base sont présentes dès l’ouverture');
    }
    notes.push('une ligne jamais validée n’est pas en base : elle manque au rejeu');
    notes.push('« pré-rempli » est le fantôme recalculé ; une valeur tapée puis effacée avant validation ne se voit pas');
    notes.push('les « Non merci » aux chauffes vivent sur l’appareil de la séance : supposés aucun');
    if (!phaseLue) notes.push('la phase est celle du profil actuel, pas celle gelée ce jour-là');
    notes.push('le rythme et l’intention sont ceux du profil actuel');
    return Rejeu.texte({ seance: { id: id, titre: ligne.titre, debut: ligne.debut, fin: ligne.fin },
                         entete: entete, notes: notes, etapes: resultat });
  }

  function titreEtape(k, ev, t, finale, nomDe) {
    if (!ev) return 'Étape 0 — à l’ouverture (' + Rejeu.heure(t) + ')';
    var tete = 'Étape ' + k + ' — ' + Rejeu.heure(t) + ' — ';
    if (ev.quoi === 'serie') {
      var exo = finale.exercices[ev.v.iExo];
      var s = exo.series[ev.v.iSerie];
      return tete + nomDe(exo.exercise_slug) + ' #' + (ev.v.iSerie + 1) + ' validée : ' +
        Modele.nombre(s.charge_kg) + ' × ' + Modele.nombre(s.reps) + ' (' + Seance.typeDe(s) + ')';
    }
    if (ev.quoi === 'escalier') {
      var f = ev.pari.fondement || {};
      return tete + 'escalier : ' + (f.marche || '?') + ' « ' + (f.reponse || '?') + ' »' +
        (f.exercice ? ' (' + nomDe(f.exercice) + ')' : '');
    }
    return tete + 'zone de ' + nomDe(ev.zone.exercise_slug) + ' corrigée → ' + (ev.zone.zone || 'déduite');
  }

  // Ce que les paris disent, en face de ce que le rejeu affiche : à
  // l'ouverture, la consigne figée et le compteur ; à chaque validation, la
  // ligne affichée JUSTE AVANT (étape précédente) et le pari écrit.
  function controlesRejeu(x, exo, ev, precedent, paris, ouverture) {
    var c = [];
    var siens = paris.filter(function (l) {
      return l.exercise_slug === x.slug && l.module !== Moteur.MODULE_ESCALIER && l.fondement;
    });
    if (ouverture && x.consigne && siens.length) {
      var f = siens[0].fondement;
      var ok = f.etat === x.consigne.etat && (f.zone || null) === (x.consigne.zone || null) &&
        memeNombre(f.palier, x.consigne.palier) && memeNombre(f.niveau, x.consigne.niveau);
      c.push('contrôle consigne (1er pari) : ' + f.etat + ' · zone ' + (f.zone || '–') + ' · palier ' +
        Modele.nombre(f.palier) + ' · niveau ' + Modele.nombre(f.niveau) + (ok ? ' ✓' : ' ✗ ÉCART avec le rejeu'));
      if (f.compteur !== undefined) {
        var cr = x.compteur ? x.compteur.compteur : null;
        c.push('contrôle compteur : pari ' + f.compteur + ' · rejeu ' + (cr === null ? '–' : cr) +
          (memeNombre(f.compteur, cr) ? ' ✓' : ' ✗'));
      }
    }
    if (!ev || ev.quoi !== 'serie') return c;
    var s = null;
    (exo.series || []).forEach(function (y) { if (y.id === ev.v.id) s = y; });
    if (!s) return c;
    var avant = null;
    if (precedent) {
      precedent.plan.exercices.forEach(function (px) {
        (px.lignes || []).forEach(function (l) { if (l.id === s.id) avant = l; });
      });
    }
    var leurs = siens.filter(function (l) { return l.set_observe === s.id; });
    if (!leurs.length && avant && avant.role !== 'hors') {
      leurs = siens.filter(function (l) { return !l.set_observe && Number(l.fondement.rang) === Number(avant.rang); });
    }
    var vu = avant ? (avant.role === 'hors' ? 'hors plan' :
      avant.role + ' ' + Modele.nombre(avant.charge) + ' × ' + Modele.nombre(avant.vise)) : 'absente (ligne ajoutée)';
    if (!leurs.length) {
      c.push('contrôle #' + (ev.v.iSerie + 1) + ' : ligne affichée juste avant : ' + vu + ' · aucun pari en base' +
        (avant && avant.role !== 'hors' ? ' ✗ (ligne couverte sans pari)' : ''));
      return c;
    }
    leurs.forEach(function (l) {
      var f = l.fondement;
      var rev = Number(f.revision) || 0;
      var ok = !!avant && avant.role !== 'hors' && ROLE_DU_PARI_REJEU[avant.role] === f.role &&
        memeNombre(f.charge, avant.charge) && (rev > 0 || memeNombre(l.valeur_predite, avant.vise));
      c.push('contrôle #' + (ev.v.iSerie + 1) + ' : pari en base ' + f.role + ' ' + Modele.nombre(f.charge) + ' × ' +
        Modele.nombre(l.valeur_predite) + (rev ? ' (révision ' + rev + ')' : '') + ' · ligne affichée juste avant : ' + vu +
        (ok ? ' ✓' : ' ✗ ÉCART'));
    });
    return c;
  }

  // La vue : un texte brut, « Copier », « Rejouer », « Fermer ». Rien d'autre.
  var rejeuBranche = false;
  async function ouvrirRejeu() {
    var vue = $('rejeu'), pre = $('rejeu-sortie');
    if (!rejeuDemande || !vue || !pre) return;
    if (!rejeuBranche) {
      rejeuBranche = true;
      $('rejeu-copier').addEventListener('click', function () {
        var t = rejeuSortie || pre.textContent || '';
        var dit = function (m) { $('rejeu-etat').textContent = m; };
        try {
          racine.navigator.clipboard.writeText(t).then(function () { dit('Copié.'); },
            function () { dit('Copie refusée : sélectionne le texte.'); });
        } catch (e) { dit('Copie indisponible : sélectionne le texte.'); }
      });
      $('rejeu-relancer').addEventListener('click', function () { ouvrirRejeu(); });
      $('rejeu-fermer').addEventListener('click', function () { vue.hidden = true; });
    }
    vue.hidden = false;
    $('rejeu-etat').textContent = 'Rejeu en cours…';
    var texte;
    try { texte = await rejouerSeance(rejeuDemande); }
    catch (e) { texte = 'Rejeu impossible : ' + texteErreur(e) + '\n' + ((e && e.stack) || '') + '\n'; }
    rejeuSortie = texte;
    pre.textContent = texte;
    $('rejeu-etat').textContent = '';
  }

  function marquerGarde(violations) {
    var doc = racine.document;
    if (!doc || !doc.body) return;
    var m = doc.getElementById('garde-coach');
    if (!m) {
      m = doc.createElement('button');
      m.id = 'garde-coach';
      m.type = 'button';
      m.className = 'garde-coach';
      m.addEventListener('click', function () {
        if (racine.console) racine.console.error('[garde du coach]', m.violations || []);
      });
      doc.body.appendChild(m);
    }
    m.violations = violations;
    var invariants = [];
    violations.forEach(function (v) {
      var i = String(v).split(' — ')[0];
      if (invariants.indexOf(i) < 0) invariants.push(i);
    });
    m.textContent = '⚠ ' + invariants.join(' ') + ' (' + violations.length + ')';
    m.title = violations[violations.length - 1] || '';
  }

  var catalogueMemo = null;
  function catalogueIndexe() {
    if (!catalogueMemo || catalogueMemo.source !== local.exercices) {
      catalogueMemo = { source: local.exercices, index: Modele.indexerExercices(local.exercices || []) };
    }
    return catalogueMemo.index;
  }

  // ── MOTEUR §9.15.2 (49-U10) — LA MÉMOIRE DES « NON MERCI » ───────────────
  //
  // ⚠️ SUR L'APPAREIL SEULEMENT, aucune colonne en base : `localStorage`,
  // clé `th-v2-refus-chauffes`, `{ [slug]: { n, seance } }`. La règle
  // (un refus par séance, trois d'affilée, « Ajouter » remet à zéro) vit dans
  // `THPlan` (fonctions pures) ; ici, seulement la lecture et l'écriture. Un
  // autre appareil repart de zéro : assumé, rien n'est perdu que trois « Non
  // merci ».
  var CLE_REFUS_CHAUFFES = 'th-v2-refus-chauffes';
  var refusChauffes = null;   // l'objet lu, remplacé (jamais modifié) à chaque écriture

  function lireRefusChauffes() {
    if (refusChauffes) return refusChauffes;
    var lu = null;
    try { lu = JSON.parse(racine.localStorage.getItem(CLE_REFUS_CHAUFFES) || 'null'); }
    catch (e) { lu = null; }
    refusChauffes = lu && typeof lu === 'object' ? lu : {};
    return refusChauffes;
  }

  function ecrireRefusChauffes(r) {
    refusChauffes = r;
    try { racine.localStorage.setItem(CLE_REFUS_CHAUFFES, JSON.stringify(r)); }
    catch (e) { /* stockage indisponible : la mémoire vit pour la session */ }
  }

  function refusChauffesDe(seanceId) { return Plan.refusChauffesDe(lireRefusChauffes(), seanceId); }
  function refuserChauffes(slug) { ecrireRefusChauffes(Plan.refuserChauffes(lireRefusChauffes(), slug, seance.id)); }
  function accepterChauffes(slug) { ecrireRefusChauffes(Plan.accepterChauffes(lireRefusChauffes(), slug)); }

  // Le plan de l'exercice `iExo`, avec ou sans consigne : les chauffes et la
  // dégressive existent aussi sans elle (§9.15).
  function planDeLExercice(iExo) {
    var p = planActuel();
    return p ? p.exercices[iExo] || null : null;
  }

  // Les entrées du plan de la séance ouverte. Les consignes et les suites se
  // lisent D'ABORD : leur mémo peut changer `versionConsignes`.
  function entreesDuPlan() {
    var edition = enEdition();
    var exos = seance.exercices || [];
    var cs = {};
    var suites = {};
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (slug && !Object.prototype.hasOwnProperty.call(cs, slug)) {
        cs[slug] = consigneDe(slug);
        suites[slug] = cs[slug] ? suiteDe(slug) : null;
      }
    });
    // §9.15 (49-U10) — le catalogue des exercices de la séance (matériel,
    // muscles primaires) et les propositions de chauffes retirées.
    var catalogue = {};
    var index = catalogueIndexe();
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      var f = slug && index[slug];
      if (f && !catalogue[slug]) {
        catalogue[slug] = { equipement: f.equipement || null,
                            muscles_primaires: (f.muscles_primaires || []).slice() };
      }
    });
    // §14.4 (49-U14) — la démonstration ne touche qu'aux ENTRÉES (une copie).
    if (demoEscalier()) cs = consignesDeDemo(cs);
    return {
      seance: { id: seance.id, debut: seance.debut, edition: edition, exercices: exos },
      consignes: cs,
      // MOTEUR §9.16 — la phase GELÉE de la séance (lue après les consignes :
      // elle se fige avec elles).
      phase: phaseDeLaSeance(),
      // MOTEUR §14.6 (49-U16) — la règle de volume, gelée pour la séance.
      volume: volumeDeDemo(volumeDeLaSeance(), catalogue),
      catalogue: catalogue,
      // Le rejeu (développement) : les « Non merci » vivent sur l'appareil de
      // la séance, pas en base — supposés aucun, et la sortie le dit.
      refusChauffes: rejeuEnCours ? {} : refusChauffesDe(seance.id),
      reglage: Profil.rythmeDe(profil),
      suites: suites,
      paris: (local.predictions || []).filter(function (l) {
        return l && l.fondement && l.fondement.seance === seance.id;
      }),
      // MOTEUR §14.4 (49-U14) — l'escalier : les cartes passées, les compteurs
      // figés dans les paris des autres séances, les noms du catalogue et les
      // séries de la routine. Le plan décide de la carte et de la période.
      escalier: escalierDesEntrees(cs)
    };
  }

  // ── MOTEUR §14.4 (49-U14) — VOIR LA CARTE SUR LA PRÉVISUALISATION ────────
  //
  // `?escalier=demo` (et `?escalier=0` pour l'éteindre), SEULEMENT là où la
  // garde du coach est active — `localhost`, une prévisualisation `*.pages.dev`,
  // `?garde=1` ; JAMAIS en production. Retenu pour la session de l'onglet.
  // Tant qu'il est allumé : deux exercices TÉMOINS (« Exercice témoin A, B »)
  // calent depuis 4 et 5 séances aujourd'hui, et le premier exercice de la
  // séance qui a une consigne déclenche (compteur 4) — dans les ENTRÉES du plan
  // seulement, jamais dans le mémo des consignes. La réponse à la carte reste
  // EN MÉMOIRE, et AUCUN PARI NE S'ÉCRIT (ni de consigne, ni de l'escalier) :
  // la base ne voit rien de faux. ⚠️ On n'y valide donc AUCUNE SÉRIE (une série
  // validée sans son pari, la garde le dirait : I7) ; on abandonne la séance.
  //
  // §14.5 (49-U15) — `?escalier=isole` : le BLOCAGE ISOLÉ, sur une séance
  // quelconque. Le premier exercice qui a une consigne déclenche une première
  // fois (compteur 4, en zone force : la carte de schéma) ; le suivant, une
  // deuxième fois (compteur 8, avec un repli inventé à 5 % sous son meilleur).
  // Une valeur à part, et pas `demo` : la carte de semaine allégée cite tous
  // les exercices à 4 ou plus, et un exercice cité n'a pas de marche isolée
  // (I21) — les deux ne se montrent pas dans la même séance. La réponse au
  // schéma reste en mémoire : AUCUNE zone n'est posée, AUCUN pari n'est écrit.
  var demoReponse = null;   // la carte « répondue » de la démonstration, en mémoire
  var demoMarches = [];     // les schémas « répondus » de la démonstration, en mémoire
  var demoSerieDePlus = null;   // l'exercice de la série de plus de la démonstration
  // La place inventée de la démonstration : les muscles primaires de cet
  // exercice ont de la place (une copie de l'entrée, jamais le gel).
  function volumeDeDemo(volume, catalogue) {
    if (!demoSerieDePlus || demoModeEscalier() !== 'isole') return volume;
    var cat = catalogue && catalogue[demoSerieDePlus];
    var copie = Object.assign({}, volume || {});
    ((cat && cat.muscles_primaires) || []).forEach(function (m) {
      copie[m] = { place: true, moyenne: 5, seuil: 6, fenetres: 6 };
    });
    return copie;
  }
  function demoModeEscalier() {
    // ⚠️ La clé est ICI, pas dans une `var` du module : la fonction est appelée
    // au démarrage, plus haut, avant que cette ligne ne soit exécutée.
    var CLE_DEMO_ESCALIER = 'th-v2-escalier-demo';
    if (!garde || !garde.active || rejeuEnCours) return null;
    var s = null;
    try { s = racine.sessionStorage; } catch (e) { s = null; }
    var m = /[?&]escalier=(demo|isole|0)(?:&|$)/.exec(String((racine.location && racine.location.search) || ''));
    if (m) {
      try { if (s) s.setItem(CLE_DEMO_ESCALIER, m[1]); } catch (e) { /* fermé */ }
      return m[1] === '0' ? null : m[1];
    }
    var v = null;
    try { v = s ? s.getItem(CLE_DEMO_ESCALIER) : null; } catch (e) { v = null; }
    // `1` : la valeur d'avant 49-U15, pour `demo`.
    return v === 'demo' || v === '1' ? 'demo' : (v === 'isole' ? 'isole' : null);
  }
  function demoEscalier() { return !!demoModeEscalier(); }
  function consignesDeDemo(cs) {
    var copie = Object.assign({}, cs);
    var avecConsigne = Object.keys(cs).filter(function (s) { return cs[s] && cs[s].consigne && cs[s].consigne.etat !== 'silence'; });
    var compteurDe = function (slug, n, meilleur) {
      return Object.assign({ meilleur: null, derniere: null, blocages: [] }, cs[slug].compteur || {},
        { compteur: n }, meilleur ? { meilleur: meilleur } : {});
    };
    if (demoModeEscalier() !== 'isole') {
      var premier = avecConsigne[0];
      if (premier) copie[premier] = Object.assign({}, cs[premier], { compteur: compteurDe(premier, 4) });
      return copie;
    }
    var meilleurDe = function (k) {
      var l = k.ligne || k.haut;
      var P = l && typeof l.charge === 'number' ? l.charge : (typeof k.palier === 'number' ? k.palier : null);
      if (P === null) return null;
      var z = Moteur.zoneParCle(k.zone);
      return { palier: P, niveau: l && typeof l.vise === 'number' ? l.vise : (z ? z.bas : 5) };
    };
    var a = avecConsigne[0], b = avecConsigne[1], c = avecConsigne[2];
    // §14.7 (49-U17) — le troisième : une zone muscle qui cale (compteur 4),
    // ses muscles avec de la place (`volumeDeDemo`) — la carte de la série de plus.
    demoSerieDePlus = null;
    if (c) {
      var kc = cs[c].consigne;
      var zc = kc.zone === 'lourd' || kc.zone === 'mix' || !kc.zone ? 'volume' : kc.zone;
      copie[c] = Object.assign({}, cs[c], { consigne: Object.assign({}, kc, { zone: zc }),
        compteur: compteurDe(c, 4, (cs[c].compteur && cs[c].compteur.meilleur) || meilleurDe(kc)) });
      demoSerieDePlus = c;
    }
    if (a) {
      var ka = cs[a].consigne;
      var za = ka.zone === 'lourd' || ka.zone === 'mix' ? ka.zone : 'lourd';
      copie[a] = Object.assign({}, cs[a], { consigne: Object.assign({}, ka, { zone: za }),
        compteur: compteurDe(a, 4, (cs[a].compteur && cs[a].compteur.meilleur) || meilleurDe(ka)) });
    }
    if (b) {
      var kb = cs[b].consigne;
      var mb = (cs[b].compteur && cs[b].compteur.meilleur) || meilleurDe(kb);
      var zb = Moteur.zoneParCle(kb.zone);
      if (mb && zb) {
        // Le repli inventé : 5 % sous le meilleur, au demi-kilo, tenu au bas de
        // la zone il y a 10 jours — dans les bornes de I22.
        var P = Math.round(mb.palier * 0.95 * 2) / 2;
        if (P >= mb.palier) P = mb.palier - 0.5;
        var il = new Date(new Date(seance.debut).getTime() - 10 * 86400000).toISOString();
        copie[b] = Object.assign({}, cs[b], { compteur: compteurDe(b, 8, mb),
          repli: { palier: P, niveau: zb.bas, debut: il, reps: [zb.bas, zb.bas, zb.bas], ligne: [P, zb.bas] } });
      }
    }
    return copie;
  }

  function escalierDesEntrees(cs) {
    var noms = {}, seriesRoutine = {};
    var index = catalogueIndexe();
    Object.keys(index).forEach(function (s) { if (index[s] && index[s].nom) noms[s] = index[s].nom; });
    Object.keys(cs).forEach(function (s) {
      var c = cs[s];
      // Figé à 0 (un exercice ajouté hors routine, avant ses séries) : le compte
      // d'aujourd'hui.
      seriesRoutine[s] = c && typeof c.seriesRoutine === 'number' && c.seriesRoutine > 0
        ? c.seriesRoutine : nombreDeSeriesDeTravail(s);
    });
    var connus = parisEscalierConnus();
    var cartes = Moteur.cartesDesParis(connus);
    var compteurs = compteursDesParis();
    // §14.5 (49-U15) — les marches isolées déjà écrites (schéma, repli).
    var marches = Moteur.marchesDesParis(connus);
    if (demoModeEscalier() === 'isole' && seance) marches = marches.concat(demoMarches);
    if (demoModeEscalier() === 'demo' && seance) {
      var jour = Moteur.jourCivil(seance.debut);
      noms['demo-a'] = 'Exercice témoin A';
      noms['demo-b'] = 'Exercice témoin B';
      compteurs = compteurs.concat([
        { exercice: 'demo-a', jour: jour, compteur: 5, seance: 'demo', debut: seance.debut },
        { exercice: 'demo-b', jour: jour, compteur: 4, seance: 'demo', debut: seance.debut }]);
      if (demoReponse) cartes = cartes.concat([demoReponse]);
    }
    return { cartes: cartes, compteurs: compteurs, noms: noms, seriesRoutine: seriesRoutine, marches: marches,
             carteSuspendue: demoModeEscalier() === 'isole' };
  }

  function planActuel() {
    if (!seance) return null;
    var entrees = entreesDuPlan();
    var edition = entrees.seance.edition;
    // `constats` porte les suites : une synchronisation le remet à zéro
    // (`recalculerEtats`) et la suite se recalcule sur le nouvel historique.
    if (planMemo && planMemo.seance === seance && planMemo.paris === local.predictions &&
        planMemo.version === versionConsignes && planMemo.edition === edition &&
        planMemo.constats === constats && planMemo.catalogue === local.exercices &&
        planMemo.refus === refusChauffes && planMemo.escalier === local.escalier &&
        planMemo.legers === local.parisLegers && planMemo.seances === local.seances &&
        planMemo.demo === demoReponse && planMemo.demoMarches === demoMarches) return planMemo.plan;
    var plan = Plan.planDeSeance(entrees);
    planMemo = { seance: seance, paris: local.predictions, version: versionConsignes,
                 edition: edition, constats: constats, catalogue: local.exercices,
                 refus: refusChauffes, escalier: local.escalier, legers: local.parisLegers,
                 seances: local.seances, demo: demoReponse, demoMarches: demoMarches, plan: plan };
    // Le banc lit le dernier plan et ses entrées pour vérifier les invariants
    // après chaque geste (§9.13 bis) ; rien d'autre ne le relit. Un plan du
    // REJEU (développement) n'y entre pas : il vérifie ses invariants lui-même.
    if (!rejeuEnCours) {
      Plan.dernier = { entrees: entrees, plan: plan };
      garde.verifier(plan, entrees);
    }
    return plan;
  }

  function planDuSlug(slug) {
    var p = planActuel();
    if (!p) return null;
    return p.exercices.filter(function (x) { return x.slug === slug && x.consigne; })[0] || null;
  }

  // §3.12 (49-U1) — l'en-tête LU SUR LE PLAN : il décrit les lignes de la
  // séance, plus le `n` de la consigne brute. Sans exercice dans la séance
  // (la page d'exercice), la consigne seule.
  function libellesDe(slug) {
    var c = consigneDe(slug);
    if (!c) return null;
    var x = planDuSlug(slug);
    return x ? { jaune: x.entete.jaune, gris: x.entete.gris, compteur: x.entete.compteur || null,
                 plus: x.entete.plus || null } : c.libelles;
  }

  // §3.8 et §3.10 — l'étiquette de zone et le calcul, tirés du MÊME mémo que
  // les phrases. Trois lectures d'une consigne calculée une fois à l'ouverture.
  function etiquetteDe(slug) {
    var c = consigneDe(slug);
    return c ? c.etiquette : null;
  }
  // Le « Donc » du « Pourquoi » dit la même chose que l'en-tête (49-U1) ; le
  // reste de la feuille lit encore la consigne (C5).
  // ECRAN §3.10 (delta 49-14 W1) — LA FEUILLE LIT LE PLAN. « Donc » et les
  // lignes : celles de la séance en cours (`x.pourquoi`). Les paragraphes : la
  // consigne FIGÉE du plan (`x.consigne`), plus la consigne brute du mémo.
  function pourquoiDe(slug) {
    var x = planDuSlug(slug);
    if (!x || !x.consigne || !x.pourquoi) return null;
    // §20.2 — « Ta dernière séance, mardi » se lit contre le début de la séance
    // en cours : la référence est une entrée, jamais l'horloge du moteur.
    var base = Moteur.pourquoiConsigne(x.consigne, Profil.rythmeDe(profil), seance ? seance.debut : null);
    return base ? Object.assign({}, base, x.pourquoi) : null;
  }

  // ── §3.9 — LE CONSTAT DE FIN DE BLOC ─────────────────────────────────────
  //
  // ⚠️ LA CONDITION EST « TOUTES LES SÉRIES DE TRAVAIL VALIDÉES », et elle se
  // lit sur ce que l'écran MONTRE : `partEnBase`, le même critère que la coche
  // (chantier 35, D3). Tester `validee_a` ferait diverger la case cochée et le
  // constat sur une séance importée.
  //
  // Les chauffes ne comptent pas : on peut finir un exercice sans en faire, et
  // en laisser une non validée ne doit pas retenir le constat. Un exercice sans
  // aucune série de travail n'a rien fini du tout.
  //
  // ⚠️ ET ELLES PORTENT LEUR RANG (20/09/2026). Une série en mémoire n'en a
  // pas : `rang` se calcule à l'écriture (`Seance.lignes`). Or le moteur trie
  // dessus (MOTEUR §1.2) — et sans lui, `Palier.trier` départageait sur
  // l'identifiant, un UUID tiré au hasard : le constat lisait la séance du jour
  // dans un ordre qu'aucun geste n'avait produit. Au squat du 20/09,
  // `120 → 130 → 130 → 130` (5, 4, 4 au palier) s'est lu « 4-5-4 ».
  //
  // La numérotation vient de `toutesLesSeries` — LA MÊME que celle qui partira
  // en base — pour que l'écran, la base et le moteur lisent la même séance.
  function seriesDeTravailDe(slug) {
    return Seance.toutesLesSeries(seance).filter(function (p) {
      return p.exo && p.exo.exercise_slug === slug &&
        ((p.serie.type_serie || 'travail') === 'travail');
    }).map(function (p) { return Object.assign({}, p.serie, { rang: p.rang }); });
  }

  function exerciceFini(slug) {
    var travail = seriesDeTravailDe(slug);
    if (!travail.length) return false;
    for (var i = 0; i < travail.length; i++) {
      if (!Seance.partEnBase(travail[i])) return false;
    }
    return true;
  }

  // ── §3.9 (48b-6b-2) — LE CONSTAT EST CELUI DU BLOC ───────────────────────
  //
  // ⚠️ CORRIGÉ APRÈS L'APPAREIL. 48b-6b ouvrait le constat dès que L'EXERCICE
  // était fini : en superset, la première branche annonçait son bilan pendant
  // qu'on travaillait encore la seconde. Un superset est UN bloc (§3.9), et
  // son constat attend la fin du bloc — chaque exercice gardant le sien.
  //
  // Le bloc, ici, c'est `groupe_superset` : deux exercices le partagent, ou
  // chacun est seul. ⚠️ `null` NE GROUPE PAS — deux exercices hors superset
  // ont tous deux `null` et ne forment pas un bloc à eux deux.
  function slugsDuBloc(slug) {
    var groupe, trouve = false;
    (seance.exercices || []).forEach(function (exo) {
      if (!exo || exo.exercise_slug !== slug) return;
      groupe = exo.groupe_superset === undefined ? null : exo.groupe_superset;
      trouve = true;
    });
    if (!trouve) return [];
    if (groupe === null) return [slug];
    var sortie = [];
    (seance.exercices || []).forEach(function (exo) {
      if (!exo || exo.groupe_superset !== groupe) return;
      if (sortie.indexOf(exo.exercise_slug) < 0) sortie.push(exo.exercise_slug);
    });
    return sortie;
  }

  function blocFini(slug) {
    var liste = slugsDuBloc(slug);
    if (!liste.length) return false;
    for (var i = 0; i < liste.length; i++) {
      if (!exerciceFini(liste[i])) return false;
    }
    return true;
  }

  // ⚠️ SON PROPRE MÉMO, ET SA PROPRE CLÉ. Celui des consignes a pour clé la
  // séance et le profil, qui ne bougent pas d'une validation à l'autre ; le
  // constat, lui, dépend de CE QUI EST VALIDÉ — il doit donc se recalculer
  // quand une série est validée ou dévalidée, et à ce moment-là seulement. Une
  // clé qui compte les séries de travail et les validées dit exactement ça :
  // ajouter une série la change, en dévalider une aussi, et taper dans un
  // champ ne la change pas.
  var constats = null;   // { cle, parSlug }

  // ⚠️ ET ELLE PORTE LES VALEURS, PAS SEULEMENT LE COMPTE (48b-6b-2). Compter
  // les séries et les validées suffisait à voir une validation ; corriger une
  // charge ou des reps SUR UNE SÉRIE DÉJÀ VALIDÉE laissait la clé identique,
  // donc le constat en cache — vu sur appareil. Les quatre colonnes que le
  // moteur lit : la charge, les reps, et l'effort sous ses deux formes (un RPE
  // de 10 vaut une rep de moins, §17.4).
  function empreinteSerie(s) {
    return [s.charge_kg, s.reps, s.rpe, s.ressenti].join('|');
  }

  function empreinteValidations() {
    var parts = [];
    (seance.exercices || []).forEach(function (exo) {
      var t = seriesDeTravailDe(exo.exercise_slug);
      var faites = t.filter(function (s) { return Seance.partEnBase(s); });
      parts.push(exo.exercise_slug + ':' + t.length + '/' + faites.length +
        ':' + faites.map(empreinteSerie).join(';'));
    });
    return parts.join(',');
  }

  // §3.9 (49-U4) — LA SUITE D'UN EXERCICE : la consigne de la PROCHAINE
  // séance, sur l'historique augmenté de la séance du jour (`consignePour`,
  // par `Moteur.suiteDExercice`), et le cran au-dessus de son palier. C'est
  // la seule chose que le plan ne peut pas calculer seul : il n'a pas
  // l'historique. Calculée quand les séries de travail de l'exercice sont
  // faites, jamais avant — le constat n'existe pas avant (I10 a).
  function suiteDe(slug) {
    if (!seance || !exerciceFini(slug)) return null;
    var cle = cleConsignes() + '|' + empreinteValidations();
    if (!constats || constats.cle !== cle) constats = { cle: cle, parSlug: {} };
    if (!Object.prototype.hasOwnProperty.call(constats.parSlug, slug)) {
      var exo = Modele.indexerExercices(local.exercices)[slug];
      var faites = seriesDeTravailDe(slug).filter(function (s) { return Seance.partEnBase(s); });
      // ⚠️ LA COUPURE D'APRÈS EST L'INSTANT PRÉSENT. Le moteur ne lit jamais
      // l'avenir : une coupure au début de la séance en exclurait la séance du
      // jour, et la suite raconterait la fois d'avant.
      var r = Moteur.suiteDExercice(
        seancesDeLExercice(slug),
        { seance: { debut: seance.debut }, series: faites },
        etatsExercices[slug], rejeuEnCours ? rejeuEnCours.instant : new Date().toISOString(),
        // Les MÊMES options que la consigne de la séance (49-U18).
        optionsDeConsigne(slug, exo));
      constats.parSlug[slug] = r ? { consigne: r.apres.consigne, cranSuivant: r.cranSuivant } : null;
    }
    return constats.parSlug[slug];
  }

  // ⚠️ LE CONSTAT SE LIT DANS LE PLAN (§9.13 bis, 49-U4, I10). Il y était
  // recalculé à part — deux consignes sur les séries BRUTES, sans les rôles du
  // jour — et disait « Pas de palier aujourd'hui » juste après une montée du
  // coach annoncée « dans ta zone ». Il s'affiche, comme avant, quand le BLOC
  // est fini (superset compris).
  function constatPour(slug) {
    if (!seance || !blocFini(slug)) return null;
    var x = planDuSlug(slug);
    return x && x.constat ? x.constat : null;
  }

  // Taper dans un champ ne redessine pas la séance — le champ perdrait le
  // focus à chaque frappe. Le constat, lui, doit suivre : on réécrit ses deux
  // lignes par la porte étroite de `rendu.js`, et rien d'autre. Les exercices
  // dont le bloc n'est pas fini sortent tout de suite de `constatPour` : le
  // coût d'une frappe reste celui du seul bloc qui affiche un constat.
  function rafraichirConstats() {
    if (!seance) return;
    var racine = $('blocs-seance');
    if (!racine) return;
    var vus = {};
    (seance.exercices || []).forEach(function (exo) {
      var slug = exo && exo.exercise_slug;
      if (!slug || vus[slug]) return;
      vus[slug] = true;
      Rendu.majConstat(racine, slug, constatPour(slug));
    });
  }

  // ── §9.11 (48c) — CE QUE LE MOTEUR A PROPOSÉ S'ÉCRIT ─────────────────────
  //
  // ⚠️ À LA VALIDATION DE CHAQUE SÉRIE COUVERTE, JUSTE AVANT SON OBSERVATION
  // (révisé le 26/09/2026, 49-C). C'est ce que l'utilisateur a LU sur la ligne
  // et sur quoi il a agi — charge, visée, rôle —, et le rang que la série
  // porte à ce moment-là, qui ne change plus. Jusque-là, les paris s'écrivaient
  // à l'affichage de la consigne, une fois par séance et par exercice : des
  // paris pour des séries qui n'ont jamais existé quand la séance en comptait
  // moins que `n`, et des paris qui changeaient de série à chaque ajout ou
  // retrait. Ni à chaque redessin, qui noierait la table, ni la veille au
  // constat, qu'un historique modifié peut encore changer. Rien quand le
  // moteur se tait — `consigneDe` rend `null` en Entretenir, en Édition et sur
  // une mesure sans charge, et `lignesDePari` ne rend rien en silence.
  //
  // La garde vit dans `local.predictions`, pas en mémoire : rouvrir l'app au
  // milieu d'une séance ne doit pas réécrire ce qui a déjà été noté.
  // ⚠️ DEUX MARQUES, ET LA PREMIÈRE EST SYNCHRONE. `local.predictions` dit ce
  // qui est noté ; `notesEnCours` dit ce qui est EN TRAIN de l'être. Depuis
  // 48c-2, fabriquer l'identifiant demande une attente (SHA-256), et sans
  // cette seconde marque deux gestes rapprochés repasseraient tous deux la
  // garde. Les lignes seraient identiques — l'identifiant les dédoublonne à
  // destination — mais on les écrirait deux fois pour rien.
  var notesEnCours = {};

  // §9.11 — LA GARDE PORTE (séance, exercice, rang, révision). Depuis 49-C,
  // chaque pari s'écrit ligne par ligne, révision 0 comprise : la garde porte
  // donc toujours le rang. Sans la révision dans la clé, le pari de la
  // consigne bloquerait celui du coach sur le même rang (séance ouverte avant
  // 49-C, dont les paris de l'ouverture existent déjà).
  function revisionDe(l) {
    var r = l && l.fondement ? Number(l.fondement.revision) : 0;
    return isFinite(r) && r >= 1 ? r : 0;
  }

  function cleNote(slug, revision, rang) {
    return seance.id + '|' + slug + '|' + (revision || 0) + '|' + rang;
  }

  function dejaNote(slug, revision, rang) {
    var rev = revision || 0;
    if (notesEnCours[cleNote(slug, rev, rang)]) return true;
    return (local.predictions || []).some(function (l) {
      return l && l.exercise_slug === slug && l.fondement &&
        l.fondement.seance === seance.id && revisionDe(l) === rev &&
        l.fondement.rang === rang;
    });
  }

  // §9.11 (49-C) — LE PARI DE LA SÉRIE QU'ON VIENT DE VALIDER.
  //
  // ⚠️ IL SE LIT DANS LE PLAN, IL NE SE CALCULE PLUS ICI (§9.13 bis, 49-U3).
  // Le plan relit la séance APRÈS la validation, la série pas encore figée
  // (son pari n'existe pas) : il porte donc exactement ce que la ligne
  // affichait juste avant, et le pari qu'elle doit écrire (`paris[iSerie]`),
  // tiré de la réaction sur les séries validées qui la PRÉCÈDENT — l'effort
  // saisi pendant le repos qui a retiré une proposition ne laisse rien écrire
  // du coach. Cette fonction n'écrit que ce que le plan dit.
  //
  // ⚠️ I7, G2 (49-17, 28/09/2026) — LE PARI S'ENREGISTRE SUR L'APPAREIL AVANT
  // QUE LE PLAN SUIVANT SOIT CALCULÉ. Avant, le redessin (`apresGeste`)
  // passait d'abord : un plan où la série était validée sans son pari, vu par
  // la garde à chaque validation. Le pari se lit donc ici SANS passer par
  // `planActuel` (mémoïsé, gardé) : `Plan.planDeSeance`, pur, sur les mêmes
  // entrées — le même plan (I12). Et il entre dans `local.predictions`
  // TOUT DE SUITE, de façon synchrone : l'identifiant (SHA-256) demande une
  // attente, pendant laquelle un redessin (minuterie, synchronisation) doit
  // déjà le voir. L'identifiant se pose ensuite (`finirPari`), et l'envoi
  // dans la file reste après les séries (`poserPari`, après `apresGeste`).
  // Rend la ligne provisoire (sans identifiant), ou `null`.
  function enregistrerPari(iExo, iSerie) {
    if (!seance || enEdition()) return null;
    // §14.4 (49-U14) — en démonstration de l'escalier, AUCUN pari ne s'écrit :
    // les compteurs y sont inventés.
    if (demoEscalier()) return null;
    var p = Plan.planDeSeance(entreesDuPlan());
    var r = p && p.exercices[iExo];
    if (!r || !r.consigne) return null;
    var serie = seance.exercices[iExo].series[iSerie];
    if (!serie || !Seance.partEnBase(serie) || r.figees[serie.id]) return null;
    var pari = r.paris && r.paris[iSerie];
    if (!pari) return null;
    var slug = pari.exercise_slug;
    var rang = pari.fondement.rang;
    var rev = revisionDe(pari);
    if (dejaNote(slug, rev, rang)) return null;
    notesEnCours[cleNote(slug, rev, rang)] = true;
    // ⚠️ `emise_a` ET `user_id` SONT POSÉS ICI, comme pour une correction de
    // zone (§9.1.1) : laissés au défaut du serveur, deux séances notées hors
    // ligne remonteraient dans l'ordre du réseau, pas dans celui des gestes.
    // ⚠️ UNE LIGNE PROVISOIRE N'EST PAS OBSERVABLE (pas d'identifiant : une
    // observation partirait vers `id = null`). `observerSerie` l'ignore ;
    // `validerSerie` l'observe lui-même, une fois identifiée. Le jeton la
    // retrouve même si elle a été recopiée entre-temps.
    var provisoire = Object.assign({}, pari, {
      id: null, _provisoire: uuid(),
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      module_version: Moteur.VERSION_CONSIGNE,
      emise_a: new Date().toISOString(), horizon_jours: null,
      valeur_observee: null, observee_a: null, set_observe: null
    });
    local.predictions = (local.predictions || []).concat([provisoire]);
    return provisoire;
  }

  // ⚠️ L'IDENTIFIANT EST CALCULÉ, PAS TIRÉ (48c-2). Deux instances de l'app
  // qui notent la même consigne calculent le même identifiant, et l'insert
  // qui ignore les doublons fait du second envoi un non-événement. C'est ce
  // qui a manqué le 21/09 : six lignes au lieu de trois. `uuid()` reste le
  // repli quand `crypto.subtle` n'existe pas. La ligne provisoire est
  // remplacée par la ligne identifiée — ajoutée si une synchronisation l'a
  // emportée entre-temps.
  async function finirPari(provisoire) {
    var calcule = await Moteur.idDePrediction(seance.id, provisoire.exercise_slug,
      provisoire.fondement.rang, revisionDe(provisoire)).catch(function () { return null; });
    var ligne = Object.assign({}, provisoire, { id: calcule || uuid() });
    delete ligne._provisoire;
    var trouve = false;
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l._provisoire !== provisoire._provisoire) return l;
      trouve = true;
      return ligne;
    });
    if (!trouve) local.predictions = local.predictions.concat([ligne]);
    await Cache.ecrireLot('predictions', [ligne]).catch(function () {});
    // §14.4 (49-U14) — un compteur de plus vient d'être figé : une semaine
    // allégée acceptée peut se trancher.
    observerEscalier().catch(function () {});
    return ligne;
  }

  // ── MOTEUR §14.4 (49-U14) — LA RÉPONSE À LA CARTE ──────────────────────
  //
  // Acceptée ou refusée, la réponse S'ÉCRIT : c'est le pari de la semaine
  // allégée (`module = 'escalier'`), identifié dans son espace de noms
  // (`Moteur.idDEscalier`). Acceptée, il ouvre la période (le plan la lit dans
  // les paris de l'escalier) ; refusée, il n'est jamais observé, et un bandeau
  // d'un instant le dit. Rien d'autre n'est stocké : la mémoire des cartes vit
  // dans ces paris.
  var refusMontre = null;      // l'identifiant de la séance du bandeau d'un instant
  var DUREE_BANDEAU_REFUS = 6000;
  var VERSION_ESCALIER = '1';
  var reponseEnCours = false;

  function montrerRefus() {
    var ici = seance.id;
    refusMontre = ici;
    setTimeout(function () {
      if (refusMontre !== ici) return;
      refusMontre = null;
      if (seance && seance.id === ici && ecranCourant === 'seance') rendreSeance();
    }, DUREE_BANDEAU_REFUS);
  }

  async function repondreCarte(reponse) {
    if (!seance || enEdition() || reponseEnCours) return;
    var p = planActuel();
    var carte = p && p.carte;
    if (!carte) return;
    reponseEnCours = true;
    try {
      var acceptee = reponse === 'acceptee';
      if (demoEscalier()) {
        // La démonstration : la réponse reste en mémoire, rien ne s'écrit.
        demoReponse = { seance: seance.id, jour: carte.jour, declencheur: carte.declencheur, compteur: carte.compteur,
                        reponse: acceptee ? 'acceptee' : 'refusee', debut: acceptee ? carte.jour : null,
                        fin: acceptee ? Moteur.finAllegee(carte.jour) : null };
        if (!acceptee) montrerRefus();
        rendreSeance();
        if (acceptee) await appliquerAllegee();
        return;
      }
      var id = await Moteur.idDEscalier(seance.id, null, Moteur.MARCHE_SEMAINE_ALLEGEE)
        .catch(function () { return null; });
      var pari = {
        id: id || uuid(),
        user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
        module: Moteur.MODULE_ESCALIER, module_version: VERSION_ESCALIER,
        emise_a: new Date().toISOString(),
        exercise_slug: null, grandeur: 'progres', horizon_jours: null,
        valeur_predite: 1, borne_basse: null, borne_haute: null,
        fondement: {
          seance: seance.id, jour: carte.jour, marche: Moteur.MARCHE_SEMAINE_ALLEGEE,
          reponse: acceptee ? 'acceptee' : 'refusee',
          declencheur: carte.declencheur, compteur: carte.compteur, cites: carte.cites.slice(),
          debut: acceptee ? carte.jour : null, fin: acceptee ? Moteur.finAllegee(carte.jour) : null,
          phase: p.phase
        },
        valeur_observee: null, observee_a: null, set_observe: null
      };
      local.predictions = (local.predictions || []).concat([pari]);
      await Cache.ecrireLot('predictions', [pari]).catch(function () {});
      await poserPari(pari);
      if (!acceptee) montrerRefus();
    } finally {
      reponseEnCours = false;
    }
    if (seance) rendreSeance();
    if (seance && reponse === 'acceptee') await appliquerAllegee();
  }

  // ── MOTEUR §14.5 (49-U15) — LES MARCHES ISOLÉES : SCHÉMA ET REPLI ───────
  //
  // Un pari de marche (`module = 'escalier'`) a l'identifiant de son espace de
  // noms : `escalier|séance|exercice|marche`. ⚠️ SA COLONNE `exercise_slug`
  // RESTE VIDE, l'exercice vit dans le fondement (`exercice`) : cinq lecteurs
  // prennent un pari portant `exercise_slug` pour un pari de CONSIGNE — les
  // lignes figées du plan, I7, `dejaNote`, l'observation d'une série, et
  // « sous consigne » côté serveur (`seancesAvecPari`).
  function pariDeMarche(id, x, marche, reponse, phase, extra) {
    return {
      id: id || uuid(),
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      module: Moteur.MODULE_ESCALIER, module_version: VERSION_ESCALIER,
      emise_a: new Date().toISOString(),
      exercise_slug: null, grandeur: 'progres', horizon_jours: null,
      valeur_predite: 1, borne_basse: null, borne_haute: null,
      fondement: Object.assign({
        seance: seance.id, jour: Moteur.jourCivil(seance.debut), exercice: x.slug,
        marche: marche, reponse: reponse, compteur: x.escalier.compteur, n: x.escalier.n,
        zone: x.escalier.zone, phase: phase
      }, extra || {}),
      valeur_observee: null, observee_a: null, set_observe: null
    };
  }

  async function ecrirePariDeMarche(pari) {
    local.predictions = (local.predictions || []).concat([pari]);
    await Cache.ecrireLot('predictions', [pari]).catch(function () {});
    await poserPari(pari);
  }

  // « Passer à 6-8 reps » / « Garder 3-5 ». OUI = LE GESTE DE LA CORRECTION DE
  // ZONE (48b-7, `poserZone`), comme si la personne l'avait choisie — pas un
  // second chemin : elle revient depuis l'étiquette, et le compteur repart de
  // zéro (changement de zone). NON = rien ne change. Les deux s'écrivent.
  //
  // §14.7 (49-U17) — LA MÊME RÉPONSE pour la carte de la SÉRIE DE PLUS : le
  // pari (`marche : serie_de_plus`, avec les séries de la routine `n_routine`
  // et le début de la séance), puis, acceptée, la ligne en plus.
  async function repondreSchema(iExo, reponse) {
    if (!seance || enEdition() || reponseEnCours) return;
    var p = planActuel();
    var x = p && p.exercices[iExo];
    var m = x && x.escalier;
    if (!m || !m.carte) return;
    reponseEnCours = true;
    var acceptee = reponse === 'acceptee';
    var marche = m.marche;
    var plus = marche === Moteur.MARCHE_SERIE_DE_PLUS;
    var nRoutine = nombreDeSeriesRoutine(x.slug);
    try {
      if (demoEscalier()) {
        // La démonstration : la réponse reste en mémoire ; aucune zone posée,
        // aucun pari.
        demoMarches = demoMarches.concat([{ seance: seance.id, jour: Moteur.jourCivil(seance.debut),
          exercice: x.slug, marche: marche, reponse: acceptee ? 'acceptee' : 'refusee',
          compteur: m.compteur, debut: seance.debut, n: nRoutine }]);
      } else {
        var id = await Moteur.idDEscalier(seance.id, x.slug, marche).catch(function () { return null; });
        await ecrirePariDeMarche(pariDeMarche(id, x, marche, acceptee ? 'acceptee' : 'refusee', p.phase,
          plus ? { n_routine: nRoutine, debut: seance.debut } : { nouvelle_zone: m.carte.nouvelle_zone }));
        if (acceptee && !plus) await poserZone(x.slug, m.carte.nouvelle_zone);
      }
    } finally {
      reponseEnCours = false;
    }
    if (seance) rendreSeance();
    if (seance && acceptee && plus) await appliquerSerieDePlus();
  }

  // §14.7 (delta 49-35) — LA LIGNE DE PLUS DE L'EXERCICE QU'ON VIENT D'AJOUTER,
  // et de lui SEUL : l'exercice nouveau (absent de `avantExos`, sans série
  // faite), s'il a une série de plus en cours. Le même geste qu'à l'ouverture
  // (`lignesAAjouter`), restreint à lui : une ligne retirée ailleurs par la
  // personne ne revient pas (§14.3).
  async function ligneDePlusPourAjout(avantExos, slug) {
    if (!seance || enEdition()) return;
    var exos = seance.exercices || [];
    var i = -1;
    for (var k = 0; k < exos.length && i < 0; k++) {
      var x = exos[k];
      if (x && x.exercise_slug === slug && (avantExos || []).indexOf(x) < 0 &&
          !(x.series || []).some(function (s) { return !!s.validee_a; })) i = k;
    }
    if (i < 0 || Plan.lignesAAjouter(planActuel()).indexOf(i) < 0) return;
    seance = Seance.ajouterSerie(seance, i, uuid());
    await apresGeste();
  }

  // Les séries de la routine d'un exercice, figées avec sa consigne.
  function nombreDeSeriesRoutine(slug) {
    var c = consigneDe(slug);
    return c && typeof c.seriesRoutine === 'number' && c.seriesRoutine > 0 ? c.seriesRoutine : nombreDeSeriesDeTravail(slug);
  }

  // §14.7 (49-U17) — LA LIGNE EN PLUS, une fois : à l'acceptation, et à la
  // création d'une séance pendant que la série de plus est en cours. Jamais au
  // rendu : une ligne retirée par la personne ne revient pas dans la séance.
  async function appliquerSerieDePlus() {
    if (!seance || enEdition()) return;
    var aAjouter = Plan.lignesAAjouter(planActuel());
    if (!aAjouter.length) return;
    aAjouter.forEach(function (iExo) { seance = Seance.ajouterSerie(seance, iExo, uuid()); });
    await apresGeste();
  }

  // LE REPLI S'ÉCRIT À L'OUVERTURE (`reponse : appliquee`) : pas de question.
  // Une fois par séance et par exercice — l'identifiant déterminé fait le
  // reste (un second envoi est ignoré à destination).
  var replisEcrits = {};
  async function ecrireReplis() {
    if (!seance || enEdition() || demoEscalier()) return;
    var p = planActuel();
    var aEcrire = ((p && p.exercices) || []).filter(function (x) {
      return x && x.escalier && x.escalier.marche === Moteur.MARCHE_REPLI && x.escalier.repli &&
        !replisEcrits[seance.id + '|' + x.slug];
    });
    for (var i = 0; i < aEcrire.length; i++) {
      var x = aEcrire[i];
      replisEcrits[seance.id + '|' + x.slug] = true;
      var id = await Moteur.idDEscalier(seance.id, x.slug, Moteur.MARCHE_REPLI).catch(function () { return null; });
      if (id && parisEscalierConnus().some(function (l) { return l && l.id === id; })) continue;
      var r = x.escalier.repli;
      await ecrirePariDeMarche(pariDeMarche(id, x, Moteur.MARCHE_REPLI, 'appliquee', p.phase,
        { repli: { palier: r.palier, niveau: r.niveau, debut: r.debut } }));
    }
  }

  // L'OBSERVATION DU PARI ACCEPTÉ, SANS SÉRIE (§14.4) — SON PROPRE CHEMIN, pas
  // celui des paris de consigne (`observerSerie`, qui suppose une série) :
  // 1 si le déclencheur progresse avant son prochain déclenchement, 0 à ce
  // déclenchement, `observee_a` = le début de la séance qui tranche. Lue dans
  // les compteurs figés des paris ; posée par la file, comme toute observation.
  // La contrainte `predictions_observation_coherente` l'admet pour `module =
  // 'escalier'` seulement (`v2_052`).
  var escalierObserves = {};
  async function observerEscalier() {
    if (demoEscalier()) return;
    var compteurs = compteursDesParis();
    var paris = parisEscalierConnus();
    for (var i = 0; i < paris.length; i++) {
      var l = paris[i];
      if (!l || !l.id || escalierObserves[l.id]) continue;
      if (l.valeur_observee !== null && l.valeur_observee !== undefined) continue;
      var carte = Moteur.cartesDesParis([l])[0];
      // §14.5 (49-U15) — une marche isolée (schéma accepté, repli) s'observe
      // de même, sur les compteurs de SON exercice.
      var marche = carte ? null : Moteur.marchesDesParis([l])[0];
      var obs = carte ? Moteur.observationSemaineAllegee(carte, compteurs)
        : (marche ? Moteur.observationMarche(marche, compteurs) : null);
      if (!obs) continue;
      escalierObserves[l.id] = true;
      var maj = Object.assign({}, l, { valeur_observee: obs.valeur,
        observee_a: obs.debut || new Date().toISOString(), set_observe: null });
      var ici = false;
      local.predictions = (local.predictions || []).map(function (x) {
        if (!x || x.id !== maj.id) return x;
        ici = true;
        return maj;
      });
      if (ici) await Cache.ecrireLot('predictions', [maj]).catch(function () {});
      local.escalier = (local.escalier || []).map(function (x) { return x && x.id === maj.id ? maj : x; });
      await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: maj.id,
                    depend: (carte || marche).seance, alaFin: true, donnees: donneesObservation(maj) });
    }
  }

  // `depend` porte la séance : une prédiction ne monte jamais avant les séries
  // auxquelles son observation se référera (`set_observe` → `sets`).
  async function poserPari(ligne) {
    await poser({ table: Attente.PREDICTIONS, op: Attente.UPSERT,
                  id: ligne.id, depend: seance.id, donnees: ligne });
  }

  // ⚠️ APPARIEMENT STRICT : MÊME RANG, MÊME CHARGE. Le rang vient de
  // `Seance.couvertureSeance`, la fonction qui décide déjà quelles lignes la
  // consigne couvre (§9.13) — deux numérotations diraient deux séances
  // différentes. La charge doit être celle qui a été proposée : une série
  // faite à une autre charge n'observe rien, et la ligne reste sans
  // observation. C'est un fait à mesurer, pas un manque — elle dira combien de
  // fois le moteur a proposé ce qui n'a pas été suivi.
  //
  // ⚠️ ET ELLE RETIRE AUTANT QU'ELLE POSE. Une observation qui ne se retirerait
  // pas serait pire que pas d'observation du tout : corriger 130 en 140 après
  // coup, ou dévalider la série, laisserait en base un fait FAUX — dans la
  // table même qui existe pour dire si le moteur a eu raison. Trois chemins y
  // mènent : la validation, la dévalidation, et la frappe dans un champ.
  //
  // Appelée APRÈS `poserSeries` : la série doit être posée avant la prédiction
  // pour que la clé étrangère de `set_observe` trouve sa ligne.
  async function observerSerie(iExo, iSerie) {
    if (!seance || enEdition()) return;
    var exo = (seance.exercices || [])[iExo];
    if (!exo) return;
    var serie = (exo.series || [])[iSerie];
    if (!serie) return;
    // §9.14 (49-R2) — le rang se lit sur la RÉACTION, le seul lecteur de la
    // consigne ; la consigne mémorisée à l'ouverture n'est plus relue ici.
    var r = reactionDe(iExo);
    if (!r) return;
    var j = r.indices.indexOf(iSerie);
    var rang = j < 0 ? null : r.rangs[j];
    // ⚠️ TOUS LES PARIS DU RANG, jamais le premier trouvé (§9.11, P7). Après
    // un rechargement, les lignes se relisent dans l'ordre de leur identifiant
    // haché : « le premier » serait un pari au hasard. Chacun se juge sur SES
    // charges — celui dont la charge a été faite compte ses reps, l'autre se
    // lit « autre chose tenté ».
    //
    // ⚠️ ET UNE OBSERVATION NE CHANGE JAMAIS DE SÉRIE (§9.11, 49-8). Le rang
    // se relit sur la liste actuelle et glisse quand une série est ajoutée ou
    // supprimée : `parisAObserver` rend les paris de CETTE série, où qu'ils
    // soient, et ceux de son rang que personne d'autre ne tient.
    // ⚠️ SANS IDENTIFIANT, PAS D'OBSERVATION (49-U7 bis) : un pari encore
    // provisoire (`enregistrerPari`, avant `finirPari`) est ignoré ici. Une
    // frappe qui croise la validation l'observait, et l'observation partait
    // vers `id = null` — deux paris du même rang, et aucun en base.
    var paris = (local.predictions || []).filter(function (l) {
      return l && l.id && l.exercise_slug === exo.exercise_slug && l.fondement &&
        l.fondement.seance === seance.id;
    });
    var aLire = Seance.parisAObserver(paris, serie, rang, exo.series);
    for (var p = 0; p < aLire.length; p++) await observerPari(aLire[p], serie, exo.series);
  }

  // §9.11 (49-8) — UNE SÉRIE SUPPRIMÉE EMPORTE SON OBSERVATION. En base, le
  // déclencheur `sets_efface_observation` le fait déjà (v2_047) ; la copie
  // locale doit dire la même chose, sinon la ligne garderait des reps comptées
  // sur une série qui n'existe plus. Rien n'est ré-observé ensuite sur une
  // autre série : c'est `parisAObserver` qui le garantit.
  async function oublierObservationDe(iExo, iSerie) {
    var exo = seance && (seance.exercices || [])[iExo];
    var s = exo && (exo.series || [])[iSerie];
    var id = s && s.id;
    if (!id) return;
    var maj = [];
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l.set_observe !== id) return l;
      var m = Object.assign({}, l, { set_observe: null, valeur_observee: null, observee_a: null });
      maj.push(m);
      return m;
    });
    if (maj.length) await Cache.ecrireLot('predictions', maj).catch(function () {});
    // La base le fait déjà (le déclencheur) ; l'entrée qui partirait encore
    // avec l'ancienne observation est remplacée par la vraie, vide — sinon
    // elle attendrait pour toujours une série qui ne reviendra pas.
    for (var k = 0; k < maj.length; k++) await poserObservation(maj[k]);
  }

  // §9.11 (27/09/2026) — L'OBSERVATION PART PAR SA PROPRE ENTRÉE, EN FIN DE
  // FILE : derrière son pari (même identifiant, posé avant elle) et derrière
  // les séries qu'elle désigne (`poserSeries` passe avant). Voir `attente.js`.
  async function poserObservation(ligne) {
    await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: ligne.id,
                  depend: seance.id, alaFin: true,
                  donnees: donneesObservation(ligne) });
  }

  function donneesObservation(l) {
    return {
      valeur_observee: l.valeur_observee === undefined ? null : l.valeur_observee,
      observee_a: l.observee_a === undefined ? null : l.observee_a,
      set_observe: l.set_observe === undefined ? null : l.set_observe
    };
  }

  // Ce que la base a CONFIRMÉ, sur la copie locale : l'observation n'est
  // « posée » qu'une fois la base d'accord. Sans cette trace, une observation
  // perdue en route restait « posée » en local, et rien ne la renvoyait.
  function confirmee(l, vue) {
    var c = l && l.observation_confirmee;
    return !!c && c.set_observe === vue.set_observe && c.valeur_observee === vue.valeur_observee;
  }

  function observationEnFile(id) {
    var cle = Attente.cleDe(Attente.OBSERVATIONS, id);
    return (attente || []).some(function (e) { return e.cle === cle; });
  }

  async function confirmerObservation(op) {
    var d = op.donnees || {};
    var maj = null;
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l.id !== op.id) return l;
      maj = Object.assign({}, l, { observation_confirmee: {
        set_observe: d.set_observe === undefined ? null : d.set_observe,
        valeur_observee: d.valeur_observee === undefined ? null : d.valeur_observee } });
      return maj;
    });
    if (maj) await Cache.ecrireLot('predictions', [maj]).catch(function () {});
  }

  async function observerPari(ligne, serie, series) {
    // La garde, au plus près de l'écriture : une ligne observée sur une AUTRE
    // série, encore en base, n'est jamais réécrite par celle-ci.
    if (!Seance.peutObserver(ligne, serie, series)) return;
    var enBase = Seance.partEnBase(serie);
    var vue = Moteur.observationDe(ligne.fondement, {
      enBase: enBase, id: serie.id, charge: serie.charge_kg,
      reps: enBase ? Palier.repsComptees(serie) : null
    });
    var etaitSienne = ligne.set_observe && serie.id && ligne.set_observe === serie.id;
    // Ni reliée maintenant, ni reliée par cette série avant : rien à dire.
    if (vue.set_observe === null && !etaitSienne) return;
    // Rien n'a changé — et `surChamp` passe ici à CHAQUE FRAPPE : sans cette
    // sortie, taper « 130 » poserait trois fois la même intention.
    //
    // ⚠️ « RIEN N'A CHANGÉ » VEUT DIRE : LA BASE EST D'ACCORD, OU L'ENVOI EST EN
    // FILE (27/09/2026). La copie locale seule ne suffit pas : une observation
    // refusée en route y restait « posée », et la revalidation de sa série ne
    // renvoyait rien.
    var memeLocale = ligne.set_observe === vue.set_observe &&
      ligne.valeur_observee === vue.valeur_observee;
    if (memeLocale && (confirmee(ligne, vue) || observationEnFile(ligne.id))) return;

    // `observee_a` DATE UNE OBSERVATION, et « autre chose tenté » n'en est pas
    // une : la série est reliée, rien n'est compté, la colonne reste vide. Une
    // observation renvoyée telle quelle garde sa date.
    var maj = Object.assign({}, ligne, {
      set_observe: vue.set_observe,
      valeur_observee: vue.valeur_observee,
      observee_a: vue.valeur_observee === null ? null
        : (memeLocale && ligne.observee_a ? ligne.observee_a : new Date().toISOString())
    });
    local.predictions = local.predictions.map(function (l) {
      return l && l.id === maj.id ? maj : l;
    });
    await Cache.ecrireLot('predictions', [maj]).catch(function () {});
    await poserObservation(maj);
  }

  // ── §9.14 (49-R2) — LA RÉACTION SÉRIE PAR SÉRIE, BRANCHÉE ────────────────
  //
  // `Moteur.reactionPour` relit la consigne après chaque série VALIDÉE. Ses
  // entrées : la consigne et son contexte (mémoïsés à l'ouverture, une fois
  // par séance et par exercice, sur les séances antérieures), le plan de la
  // séance EN COURS (49-C : toutes ses séries de travail, les validées figées)
  // et les séries validées couvertes, dans l'ordre. Pas de mémo : c'est de
  // l'arithmétique sur une poignée de séries, et chaque lecture voit donc
  // l'état courant — une validation, une dévalidation, une correction, un
  // effort saisi après coup, une série ajoutée ou retirée.
  //
  // ⚠️ `faites` S'ARRÊTE À LA PREMIÈRE SÉRIE NON VALIDÉE. La réaction lit la
  // série i comme la ligne i du plan : une série tapée mais non validée, ou un
  // trou, décalerait tout. Le silence « la séance compte moins de séries que
  // la consigne » (#318) n'existe plus : la consigne couvre les séries de la
  // séance, il n'y a plus rien à aligner (§9.14, retiré le 26/09/2026).
  //
  // Rend, par POSITION (l'index dans le plan) : `indices` (l'index de la série
  // dans l'exercice), `rangs` et `roles` ; et `figees`, `planInitial`,
  // `faites`, `reaction`.
  // 49-U1 — LE PLAN DE L'EXERCICE, lu dans le plan de séance : la même
  // couverture, les mêmes lignes figées, la même réaction pour la grille, la
  // phrase, les paris et l'observation. Plus aucun recalcul ici.
  function reactionDe(iExo) {
    var p = planActuel();
    var x = p && p.exercices[iExo];
    return x && x.consigne ? x : null;
  }

  // ⚠️ LE REDESSIN ATTEND QUE LA SAISIE SOIT FINIE. Corriger la charge d'une
  // série validée puis toucher ses reps fait SORTIR du premier champ : un
  // redessin à cet instant détruirait le champ qu'on vient de toucher — le
  // clavier se fermerait sous le doigt. On marque la réaction périmée, et on
  // ne redessine que lorsque le focus a quitté TOUS les champs du journal.
  // Une validation, elle, redessine de toute façon.
  var reactionPerimee = false;
  var ecouteSortie = false;

  function redessinerSiSaisieFinie() {
    if (!reactionPerimee || !seance) return;
    var a = doc.activeElement;
    if (a && a.tagName === 'INPUT' && a.closest && a.closest('#blocs-seance')) return;
    reactionPerimee = false;
    apresGeste().catch(function () { /* la file garde la séance */ });
  }

  function ecouterSortieDesChamps() {
    if (ecouteSortie) return;
    ecouteSortie = true;
    doc.addEventListener('focusout', function () {
      if (reactionPerimee) setTimeout(redessinerSiSaisieFinie, 0);
    });
  }

  // ⚠️ LE FANTÔME D'UNE LIGNE COUVERTE VIENT DU PLAN, ET DE LUI SEUL
  // (§9.13 bis, 49-U2). Tant que la dernière série faite a suivi sa ligne, la
  // ligne affiche le plan ; sinon elle recopie la dernière série faite, charge
  // ET reps ensemble. L'ancienne cascade (`Seance.fantome`) prenait la charge
  // dans la saisie et les reps dans le plan : le « 125 × 4 » après un refus.
  // Elle ne sert plus qu'aux lignes hors plan — chauffes, dégressives, séries
  // sans consigne —, où rien ne change. La durée et la distance, qu'aucune
  // consigne ne porte, gardent leur règle.
  function fantomeDe(iExo, iSerie) {
    var exo = seance.exercices[iExo];
    var ancien = Seance.fantome(seance, iExo, iSerie, precedentDe(exo.exercise_slug), planDe(iExo));
    var x = planDeLExercice(iExo);
    var l = x && x.lignes[iSerie];
    // MOTEUR §9.15 (49-U10) — une chauffe ou une dégressive que le coach
    // remplit : SA charge (vide à la barre pour une dégressive) ; les reps
    // restent celles de la routine, ou de la fois d'avant.
    if (l && l.role === 'hors' && l.fantome &&
        (l.fantome.source === 'chauffe' || l.fantome.source === 'degressive')) {
      return { charge_kg: l.fantome.charge === undefined ? null : l.fantome.charge,
               reps: ancien.reps, duree_s: ancien.duree_s, distance_m: ancien.distance_m };
    }
    if (!x || !x.consigne || !l || l.role === 'hors' || !l.fantome) return ancien;
    return {
      charge_kg: l.fantome.charge === undefined ? null : l.fantome.charge,
      reps: l.fantome.reps === undefined ? null : l.fantome.reps,
      duree_s: ancien.duree_s, distance_m: ancien.distance_m
    };
  }

  function planDe(iExo) {
    var exo = seance.exercices[iExo];
    var r = reactionDe(iExo);
    return Seance.planDe(exo.series, r ? r.consigne : null, r ? r.reaction.plan : null,
      r ? r.figees : null);
  }

  // Ce que la grille montre de la réaction sur UNE ligne : la phrase au-dessus
  // d'elle (`message.rang`), et la ligne proposée — filet, charge en couleur du
  // coach, fourchette dans le champ des reps. La phrase vient de
  // `phraseReaction`, jamais recalculée ici.
  function reactionSurLigne(iExo, iSerie) {
    // MOTEUR §9.15 (49-U10) — la phrase des chauffes, au-dessus de la première
    // ligne de chauffe ; celle de la dégressive, au-dessus d'elle. Du plan,
    // jamais recomposées ici.
    var x = planDeLExercice(iExo);
    if (x && x.chauffes && x.chauffes.phrase && x.chauffes.iSerie === iSerie) {
      return { message: { type: 'chauffe', phrase: x.chauffes.phrase }, proposee: false, fourchette: null };
    }
    if (x && x.degressive && x.degressive.phrase && x.degressive.iSerie === iSerie) {
      return { message: { type: 'degressive', phrase: x.degressive.phrase }, proposee: false, fourchette: null };
    }
    // §14.7 (49-U17) — la ligne de la série de plus, marquée à la couleur du
    // coach (lue sur le plan).
    var ajoutee = !!(x && x.lignes && x.lignes[iSerie] && x.lignes[iSerie].ajoutee);
    var r = reactionDe(iExo);
    if (!r) return ajoutee ? { message: null, proposee: false, fourchette: null, ajoutee: true } : null;
    var j = r.indices.indexOf(iSerie);
    if (j < 0) return null;
    var m = r.message;
    var sortie = { message: null, proposee: false, fourchette: null };
    if (m && m.position === j) {
      sortie.message = { type: m.type, phrase: m.phrase };
    }
    var p = r.reaction.plan[j];
    var serie = seance.exercices[iExo].series[iSerie];
    if (p && p.source === 'coach' && !Seance.partEnBase(serie)) {
      sortie.proposee = true;
      sortie.fourchette = p.zone ? p.zone.slice() : null;
    }
    if (ajoutee) sortie.ajoutee = true;
    return sortie.message || sortie.proposee || sortie.ajoutee ? sortie : null;
  }

  // ── L'écran ─────────────────────────────────────────────────────────────
  function rendreSeance() {
    montrer('seance', Routeur.SAISIE);
    reactionPerimee = false;
    ecouterSortieDesChamps();
    var index = Modele.indexerExercices(local.exercices);
    var c = Seance.compter(seance);
    Rendu.rendreBandeauSeance($('bandeau-seance'), {
      titre: seance.titre || 'Séance',
      debut: seance.debut,
      compte: c,
      modifier: modeModifier,
      selection: selectionGroupe,
      // §7 octies.2 — en correction d'une séance passée, « Terminer » n'a pas
      // de sens : elle est déjà terminée, et le rester est tout l'intérêt.
      edition: enEdition(),
      // ⚠️ « TERMINÉ » ENREGISTRE, IL N'ANNULE PAS. Le bouton du bandeau dit
      // « Terminé » : un bouton qui porte ce mot et jetterait des déplacements
      // serait un piège à perte de données. Il y a DEUX sorties, et chacune
      // dit ce qu'elle fait — « Terminé » (ou « Enregistrer ») garde, « Annuler »
      // jette. C'est le pied du mode qui porte le geste destructif, jamais le
      // bandeau.
      surModifier: function () {
        if (modeModifier) return enregistrerReorganisation();
        ouvrirReorganisation();
      },
      surAnnulerSelection: function () { selectionGroupe = null; rendreSeance(); },
      surTerminer: function () { if (enEdition()) return enregistrerEdition(); confirmerFin(); }
    });
    // MOTEUR §14.4 (49-U14) — l'escalier en tête de la séance, lu sur le plan.
    var planEsc = planActuel();
    Rendu.rendreEscalier($('escalier-seance'), {
      carte: planEsc ? planEsc.carte : null,
      allegee: planEsc ? planEsc.allegee : null,
      refus: refusMontre === seance.id ? Moteur.PHRASE_REFUS : null,
      surAlleger: function () { repondreCarte('acceptee'); },
      surRefuser: function () { repondreCarte('refusee'); }
    });
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    Rendu.rendreBlocsSeance($('blocs-seance'), seance, {
      // ⚠️ LES BLOCS VIENNENT DE LA MÊME FONCTION QUE LE DÉTAIL DE SÉANCE
      // (§2.1) : un exercice seul est un bloc d'un seul, un superset un bloc
      // de 2 à 6, et l'entrelacement A1/B1/A2/B2 en sort tout fait.
      blocs: blocs,
      // §5.3 — le mode Modifier replie tout sur une ligne par bloc.
      modifier: modeModifier,
      // §7 vicies.2 — et, replié, chaque bloc porte une poignée de glissement.
      reorganiser: modeModifier,
      // §5.7 — le bloc en attente d'un partenaire de superset, s'il y en a un.
      selection: selectionGroupe,
      surGrouper: function (a, b) { grouperBlocs(blocs, a, b); },
      surDeplacerBloc: function (i, d) { deplacerBloc(blocs, i, d); },
      surMenuBloc: function (i) { ouvrirFeuilleBloc('bloc', i, null); },
      surMenuExercice: function (i, iExo) { ouvrirFeuilleBloc('exercice', i, iExo); },
      // §2.8 — un tap sur le nom d'un exercice donne sa page (§7 quater). La
      // séance n'est pas quittée : elle reste visible en bandeau là-bas, avec
      // « Reprendre ».
      surExercice: function (slug) { afficherExercice(slug); },
      // §2.7 — le tour atteint, marque MONOTONE portée par la séance.
      tourAtteint: function (groupe) { return Seance.tourAtteint(seance, groupe); },
      // La fiche du catalogue, d'où la vue tire la MESURE — donc le gabarit de
      // ligne. `undefined` si le catalogue n'est pas encore là : `gabaritDe`
      // retombe alors sur `charge_reps` sans rien affirmer.
      exercice: function (slug) { return index[slug]; },
      precedent: precedentDe,
      fantome: function (i, j) {
        return fantomeDe(i, j);
      },
      // §3.1 — la voix du moteur dans l'en-tête : les lignes jaunes et la
      // phrase grise, ou rien (Édition, Entretenir, mesure sans charge).
      libelles: libellesDe,
      // §3.8 — l'étiquette de zone, à côté du nom, et son menu (48b-7).
      etiquette: etiquetteDe,
      zoneChoisie: function (slug) { return !!zoneDe(slug); },
      surZone: function (slug) { if (etiquetteDe(slug)) ouvrirZone(slug); },
      // §3.10 — toucher la consigne ouvre le calcul.
      surPourquoi: ouvrirPourquoi,
      // §3.9 — et quand l'exercice est fini, le constat prend sa place.
      constat: constatPour,
      surChamp: async function (i, j, champ, valeur) {
        seance = Seance.modifierSerie(seance, i, j, defObjet(champ, valeur));
        rafraichirConstats();
        await apresGeste({ rendre: false });
        // §9.11 — une valeur corrigée sur une série DÉJÀ validée : l'observation
        // suit, ou se retire si la charge ne correspond plus.
        await observerSerie(i, j);
      },
      surValider: validerSerie,
      // §9.14 (49-R2) — la phrase du coach et la ligne proposée.
      reaction: reactionSurLigne,
      // ⚠️ CORRIGER AU CLAVIER UNE SÉRIE VALIDÉE REDESSINE LE BLOC (P10), mais
      // à la SORTIE du champ, pas à chaque frappe : redessiner à la frappe
      // volerait le focus au milieu de « 130 ». La réaction se refait alors sur
      // la valeur finale.
      surChampQuitte: function (i, j) {
        var s0 = seance && seance.exercices[i] && seance.exercices[i].series[j];
        if (!s0 || !Seance.partEnBase(s0)) return;
        reactionPerimee = true;
        setTimeout(redessinerSiSaisieFinie, 0);
      },
      surNumero: function (i, j) { ouvrirFeuille('type', i, j); },
      surEffort: function (i, j) { ouvrirFeuille('effort', i, j); },
      // Les deux réglages de l'exercice, sous son nom (§7 septies.1 et .2).
      surNote: function (i) { ouvrirFeuille('note', i, null); },
      surRepos: function (i) { ouvrirFeuille('repos', i, null); },
      surAjoutSerie: async function (i) {
        seance = Seance.ajouterSerie(seance, i, uuid());
        await apresGeste({ structure: false });
      },
      // MOTEUR §9.15.2 (49-U10) — la proposition de chauffes, lue sur le plan.
      propositionChauffes: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.proposition ? x.proposition : null;
      },
      surAjouterChauffes: async function (i) {
        var x = planDeLExercice(i);
        if (!x || !x.proposition) return;
        accepterChauffes(x.slug);
        seance = Seance.insererChauffes(seance, i, x.proposition.lignes, uuid);
        await apresGeste({ structure: false });
      },
      // MOTEUR §14.5 (49-U15) — la carte de schéma, sous l'exercice, lue sur
      // le plan ; ses deux gestes.
      propositionSchema: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.escalier && x.escalier.carte ? x.escalier.carte : null;
      },
      surSchema: function (i, reponse) { return repondreSchema(i, reponse); },
      surRefuserChauffes: function (i) {
        var x = planDeLExercice(i);
        if (!x || !x.proposition) return;
        refuserChauffes(x.slug);
        rendreSeance();
      },
      surSupprimerSerie: async function (i, j) {
        await oublierObservationDe(i, j);
        seance = Seance.retirerSerie(seance, i, j);
        await apresGeste();
      }
    });
    rendreChrono();
    rendreEtatSync();
    brancherReorg('blocs-seance');
    brancherAppuiLong('blocs-seance');
    rendrePiedReorg();
    // §9.11 (49-C) — plus aucun pari à l'affichage : chacun s'écrit à la
    // validation de SA série (`enregistrerPari`).
  }

  function defObjet(cle, valeur) { var o = {}; o[cle] = valeur; return o; }

  // ══ LA DÉVIATION (§5) ════════════════════════════════════════════════════
  //
  // Tout se décide dans `THSeance`, module pur ; ici on ne fait que traduire
  // « ce bloc » en indices d'exercices, et reposer la séance après coup.
  //
  // ⚠️ CHAQUE GESTE DE STRUCTURE RENUMÉROTE LES GROUPES, ce qui efface les
  // marques de tour (`normaliserGroupes`). On les re-sème aussitôt depuis l'état
  // courant : le repère se reconstruit sans que l'écran clignote.
  var modeModifier = false;
  var selectionGroupe = null;

  // ══ RÉORGANISER — LE MODE MODIFIER, ÉTENDU (§7 vicies, chantier 46) ══════
  //
  // ⚠️ PAS UN SECOND MODE. `modeModifier` existait déjà pour la séance ; il
  // vaut maintenant pour les TROIS surfaces — la séance, l'éditeur de routine
  // et la bibliothèque. Un second booléen aurait fini par contredire le premier
  // le jour où l'on quitte un écran sans le refermer.
  //
  // ⚠️ ET IL SE REFERME EN CHANGEANT D'ÉCRAN. Il ne se refermait JAMAIS
  // jusqu'ici : ni en terminant une séance, ni en démarrant la suivante. On
  // pouvait donc démarrer une séance déjà repliée sans l'avoir demandé.
  // Maintenant qu'il porte un ordre NON ENREGISTRÉ, le laisser ouvert d'un
  // écran à l'autre ferait pire : il emporterait des déplacements en attente.
  //
  // `reorgOrdre` est l'ordre AFFICHÉ tant qu'on n'a pas enregistré ; `reorgDepart`
  // est ce qu'il faut restituer sur « Annuler ».
  var reorgOrdre = null;
  var reorgDepart = null;

  function enReorganisation() { return modeModifier; }

  // Les trois surfaces, et ce qui change entre elles : d'où vient l'ordre, et
  // ce qu'« enregistrer » veut dire. Le geste, le pied et le repli, non.
  function surfaceReorg() {
    if (ecranCourant === 'seance') return 'seance';
    if (ecranCourant === 'routine') return 'routine';
    if (ecranCourant === 'saisie') return 'bibliotheque';
    return null;
  }

  function rendreSurfaceCourante() {
    if (ecranCourant === 'seance') return rendreSeance();
    if (ecranCourant === 'routine') return rendreEditeur();
    return rendreSaisie();
  }

  // ⚠️ L'INSTANTANÉ EST CE QUI REND « ANNULER » VRAI. Sans lui, « annulable
  // tant qu'on n'a pas validé » serait une promesse que l'écran ne tient pas :
  // les déplacements s'appliquent en mémoire au fur et à mesure, parce que
  // c'est ce qu'on voit bouger.
  function ouvrirReorganisation() {
    modeModifier = true;
    reorgOrdre = null;
    var q = surfaceReorg();
    if (q === 'seance') reorgDepart = seance;
    else if (q === 'routine') reorgDepart = brouillon ? brouillon.exercices.slice() : null;
    else reorgDepart = Routines.reordonnables(routines).map(function (r) { return r.id; });
    rendreSurfaceCourante();
  }

  function annulerReorganisation() {
    var q = surfaceReorg();
    if (q === 'seance' && reorgDepart) seance = reorgDepart;
    else if (q === 'routine' && reorgDepart && brouillon) brouillon.exercices = reorgDepart;
    fermerReorganisation();
    rendreSurfaceCourante();
  }

  // Ce que le glissement rend : les clés des rangées, dans leur nouvel ordre à
  // l'écran. Rien n'est ÉCRIT — l'ordre va en mémoire, et l'écriture attend
  // « Enregistrer ».
  //
  // ⚠️ MAIS ON REDESSINE, ET C'EST OBLIGATOIRE. Le glissement bouge des nœuds
  // du DOM sans passer par le rendu : la liste de blocs que les FLÈCHES du bloc
  // replié tiennent dans leur fermeture reste alors celle d'avant. Mesuré au
  // banc : après un glissement, « Descendre le bloc » déplaçait le voisin.
  //
  // Le rendu est sûr ICI et nulle part ailleurs : `surOrdre` est appelé au
  // RELÂCHEMENT, quand plus aucun doigt ne tient de rangée. Redessiner pendant
  // le geste l'arracherait de sous le pouce.
  function surOrdreReorg(cles) {
    appliquerOrdreReorg(cles);
    rendreSurfaceCourante();
  }

  function appliquerOrdreReorg(cles) {
    var q = surfaceReorg();
    if (q === 'seance') {
      var blocs = Modele.blocsDeSeance(seance, local.exercices);
      var tranches = cles.map(function (k) { return indicesDe(blocs[Number(k)]) || []; });
      seance = Seance.reordonnerBlocs(seance, tranches);
      seance = Seance.avancerTours(seance,
        Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    } else if (q === 'routine') {
      // ⚠️ DES INDICES DE BLOC ICI AUSSI, jamais d'exercice : `blocReplie` pose
      // `data-cle` = l'indice du BLOC, et un superset est un bloc de plusieurs.
      // Traiter les clés comme des exercices couperait un superset en deux au
      // premier glissement — et le §7 vicies.3 dit exactement le contraire.
      if (!brouillon) return;
      reordonnerBrouillonParBlocs(cles);
    } else {
      reorgOrdre = cles.slice();
    }
  }

  // ⚠️ TROIS ENREGISTREMENTS DIFFÉRENTS, ET C'EST NORMAL : ce sont trois
  // tables. La séance passe par la file (elle vit hors ligne), l'éditeur écrit
  // à l'« Enregistrer » de l'éditeur, la bibliothèque écrit tout de suite —
  // `routines` ne passe ni par le cache ni par la file (app.js, en-tête).
  async function enregistrerReorganisation() {
    var q = surfaceReorg();
    if (q === 'seance') {
      fermerReorganisation();
      rendreSurfaceCourante();
      return apresGeste();
    }
    if (q === 'routine') {
      // Le brouillon est déjà à jour en mémoire ET sur le disque : l'ordre
      // définitif part avec l'« Enregistrer » de l'éditeur, comme tout le reste.
      fermerReorganisation();
      return apresEditeur();
    }
    return enregistrerOrdreBibliotheque();
  }

  // ⚠️ `routines_user_rang_uniq` EST NON DIFFÉRABLE (§7 vicies.3). Les PATCH
  // partent un par un, chacun dans sa transaction : écrire les rangs dans
  // l'ordre naïf heurterait l'index à la première écriture. `planRangs` rend
  // donc une suite ORDONNÉE, avec un rang tampon pour casser les cycles — c'est
  // `ordonnerDeplacements` du chantier 28, réutilisé tel quel.
  async function enregistrerOrdreBibliotheque() {
    var voulus = reorgOrdre || [];
    var plan = Routines.planRangs(routines, voulus);
    var noeud = $('pied-reorg');
    if (!plan.length) { fermerReorganisation(); return rendreSaisie(); }
    reorgEnCours = true;
    rendrePiedReorg();
    try {
      for (var i = 0; i < plan.length; i++) {
        await Donnees.majRoutine(plan[i].id, plan[i].champs);
      }
      fermerReorganisation();
      await chargerRoutines();
      rendreSaisie();
    } catch (e) {
      // ⚠️ ON NE PERD PAS L'ORDRE À L'ÉCRAN. Une écriture refusée laisse la base
      // à mi-chemin ; relire la remettrait dans un ordre que personne n'a voulu.
      // On garde le mode ouvert, l'ordre affiché, et on dit quoi faire.
      console.error('Ordre de bibliothèque non enregistré :', texteErreur(e));
      Rendu.message($('liste-routines'),
        'Ordre non enregistré. Vérifie ta connexion et réessaie.', 'erreur');
    } finally {
      reorgEnCours = false;
      rendrePiedReorg();
    }
  }

  var reorgEnCours = false;

  function rendrePiedReorg() {
    var noeud = $('pied-reorg');
    if (!noeud) return;
    if (!modeModifier) {
      Rendu.rendrePiedReorganisation(noeud, null);
      return mesurerBarres();
    }
    Rendu.rendrePiedReorganisation(noeud, {
      aide: 'Maintiens la poignée et fais glisser.',
      enCours: reorgEnCours,
      surAnnuler: annulerReorganisation,
      surEnregistrer: enregistrerReorganisation
    });
    // APRÈS le rendu : le pied vient de prendre sa hauteur définitive.
    mesurerBarres();
  }

  // ⚠️ UNE SEULE LIAISON PAR CONTENEUR, ET ELLE SURVIT AUX RENDUS. Les
  // écouteurs vivent sur le CONTENEUR, pas sur les rangées : un rendu remplace
  // les rangées, jamais le conteneur. Rebrancher à chaque rendu empilerait les
  // écouteurs, et le bloc sauterait de deux crans au lieu d'un.
  // ══ L'APPUI LONG, SECONDE ENTRÉE DU MODE (§7 vicies.1) ═══════════════════
  //
  // ⚠️ IL S'ANNULE AU MOINDRE MOUVEMENT. Sans ça, commencer un défilement en
  // posant le doigt une demi-seconde ouvrirait le mode — et l'utilisateur
  // regarderait sa liste se replier sans avoir rien demandé. Le seuil est le
  // MÊME que celui du glissement latéral (12 px), et c'est voulu : deux seuils
  // différents pour « ai-je bougé ? » finiraient par diverger.
  //
  // ⚠️ ET IL NE FAIT RIEN SI LE MODE EST DÉJÀ OUVERT : dedans, le doigt sert à
  // glisser.
  var DUREE_APPUI = 500;   // ms
  var SEUIL_APPUI = 12;    // px
  var appuiBranches = {};

  function brancherAppuiLong(id) {
    if (appuiBranches[id]) return;
    var noeud = $(id);
    if (!noeud) return;
    appuiBranches[id] = true;
    var minuteur = null, x0 = 0, y0 = 0;
    function annuler() {
      if (minuteur) { clearTimeout(minuteur); minuteur = null; }
    }
    noeud.addEventListener('pointerdown', function (e) {
      if (modeModifier) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Pas sur un champ : un appui long dans un champ de saisie, c'est la
      // sélection de texte du système, et on ne la lui prend pas.
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      x0 = e.clientX; y0 = e.clientY;
      annuler();
      minuteur = setTimeout(function () {
        minuteur = null;
        if (modeModifier) return;
        if (surfaceReorg() === 'bibliotheque' &&
            Routines.reordonnables(routines).length < 2) return;
        ouvrirReorganisation();
      }, DUREE_APPUI);
    });
    noeud.addEventListener('pointermove', function (e) {
      if (minuteur === null) return;
      if (Math.abs(e.clientX - x0) > SEUIL_APPUI ||
          Math.abs(e.clientY - y0) > SEUIL_APPUI) annuler();
    });
    noeud.addEventListener('pointerup', annuler);
    noeud.addEventListener('pointercancel', annuler);
    noeud.addEventListener('scroll', annuler, true);
  }

  var reorgBranches = {};
  function brancherReorg(id) {
    if (reorgBranches[id]) return;
    var noeud = $(id);
    if (!noeud) return;
    reorgBranches[id] = Rendu.brancherReorganisation(noeud, {
      surOrdre: function (cles) { if (modeModifier) surOrdreReorg(cles); }
    });
  }

  // Toute sortie d'écran referme le mode et jette ce qui n'a pas été enregistré.
  // C'est explicite : « Annulable tant qu'on n'a pas validé » (§7 vicies.1), et
  // quitter l'écran est une façon de ne pas valider.
  function fermerReorganisation() {
    modeModifier = false;
    reorgOrdre = null;
    reorgDepart = null;
  }

  // Le rang libre suivant, sur TOUTES les routines de l'utilisateur :
  // `routines_user_rang_uniq` porte sur (user_id, rang), pas sur une sous-liste.
  function rangSuivantBibliotheque() {
    var max = -1;
    (routines || []).forEach(function (r) {
      var rg = Routines.rangOuNul(r && r.rang);
      if (rg !== null && rg > max) max = rg;
    });
    return max + 1;
  }

  function indicesDe(bloc) {
    return (bloc.exercices || []).map(function (x) { return x._iExo; })
      .filter(function (i) { return i !== null && i !== undefined; });
  }

  function apresStructure() {
    seance = Seance.avancerTours(seance,
      Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    return apresGeste();
  }

  // §5.5 — Déplacer agit sur le BLOC entier. Sans glissement tactile : deux
  // poignées à 360 px se confondent au pouce (§5.3), et le geste de glissement
  // est déjà pris par la suppression d'une série.
  function deplacerBloc(blocs, iBloc, delta) {
    var cible = iBloc + delta;
    if (cible < 0 || cible >= blocs.length) return;
    var indices = indicesDe(blocs[iBloc]);
    var voisins = indicesDe(blocs[cible]);
    // Vers le bas : on se pose APRÈS le voisin. Vers le haut : AVANT lui.
    var ou = delta > 0 ? voisins[voisins.length - 1] + 1 : voisins[0];
    seance = Seance.deplacerVers(seance, indices, ou);
    apresStructure();
  }

  function grouperBlocs(blocs, iA, iB) {
    selectionGroupe = null;
    if (!blocs[iA] || !blocs[iB]) return rendreSeance();
    seance = Seance.grouperBlocs(seance, indicesDe(blocs[iA]), indicesDe(blocs[iB]));
    apresStructure();
  }

  // ── Les feuilles de déviation (§5.5, §5.6) ──────────────────────────────
  //
  // Le menu du BLOC agit sur le bloc ; celui d'un EXERCICE sur l'exercice. Les
  // deux passent ici, parce que les deux finissent par le même travail : une
  // liste d'indices, un geste de `THSeance`, et la séance reposée.
  function rendreFeuilleDeviation(cible, index) {
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    // ⚠️ TOUT CE QUI VIENT DE `feuille` EST PRIS MAINTENANT. `fermerVoile()`
    // rappelle le `apres` de la feuille, qui remet `feuille` à null : un
    // gestionnaire qui lirait `feuille.iBloc` APRÈS avoir fermé lirait null.
    // Le geste ne partait pas, et la feuille se fermait quand même — rien à
    // l'écran ne disait que rien ne s'était passé. Trouvé au banc d'écran.
    var iBloc = feuille.iBloc, cibleExo = feuille.cibleExo;
    var lignesF = feuille.lignes, chauffesF = feuille.chauffes;
    var quoiFeuille = feuille.quoi;
    var bloc = blocs[iBloc];
    if (!bloc) return fermerVoile();
    var noms = bloc.exercices.map(function (x) { return x.nom; }).join(' · ');

    if (quoiFeuille === 'supprimer') {
      return Rendu.rendreFeuilleSupprimer(cible, {
        quoi: cibleExo === null ? (bloc.superset ? 'le bloc' : 'l’exercice') : 'l’exercice',
        noms: cibleExo === null ? noms
          : Modele.nommer(index, seance.exercices[cibleExo].exercise_slug),
        lignes: lignesF, chauffes: chauffesF,
        surConfirmer: function () {
          var quoi = cibleExo === null ? indicesDe(bloc) : [cibleExo];
          fermerVoile();
          seance = Seance.retirerExercices(seance, quoi);
          apresStructure();
        },
        surAnnuler: fermerVoile
      });
    }

    if (quoiFeuille === 'exercice') {
      return Rendu.rendreFeuilleExercice(cible, {
        nom: Modele.nommer(index, seance.exercices[cibleExo].exercise_slug),
        surRemplacer: function () { demanderRemplacement(cibleExo); },
        surDegrouper: function () {
          var indices = indicesDe(bloc);
          fermerVoile();
          seance = Seance.degrouperExercice(seance, cibleExo, indices);
          apresStructure();
        },
        surProgression: function () {
          fermerVoile();
          afficherExercice(seance.exercices[cibleExo].exercise_slug);
        },
        surSupprimer: function () { demanderSuppression(iBloc, cibleExo); }
      });
    }

    return Rendu.rendreFeuilleBloc(cible, {
      superset: bloc.superset,
      noms: noms,
      peutGrouper: blocs.length > 1,
      surRemplacer: function () { demanderRemplacement(indicesDe(bloc)[0]); },
      surGrouper: function () {
        // §5.7 — on passe en SÉLECTION : les autres blocs s'allument et
        // deviennent tapables. Un tap de plus, aucune ambiguïté, et ça marche
        // à n'importe quelle distance dans la liste.
        selectionGroupe = iBloc;
        fermerVoile();
      },
      surAjouterApres: function () {
        var apres = indicesDe(bloc);
        fermerVoile();
        ouvrirCatalogue(apres[apres.length - 1] + 1);
      },
      // §7 vicies.1 — une entrée au lieu de deux : le mode, pas le cran.
      surReorganiser: blocs.length > 1
        ? function () { fermerVoile(); ouvrirReorganisation(); }
        : null,
      // Sur un bloc à plusieurs, « la progression » de QUEL exercice ? Le menu
      // du bloc ne tranche pas : dans un superset, c'est le menu de l'exercice
      // qui porte le geste, et ici il reste grisé.
      surProgression: bloc.superset ? null : function () {
        fermerVoile();
        afficherExercice(bloc.exercices[0].slug);
      },
      surSupprimer: function () { demanderSuppression(iBloc, null); }
    });
  }

  // ⚠️ RIEN DE DESTRUCTIF EN SILENCE, ET RIEN DE BAVARD NON PLUS. On confirme
  // quand il y a du travail à perdre — des séries VALIDÉES — et seulement
  // alors : une question posée sur un bloc vide serait le bruit qu'on tape sans
  // lire (§6.2).
  function demanderSuppression(iBloc, cibleExo) {
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    var bloc = blocs[iBloc];
    if (!bloc) return fermerVoile();
    var quoi = cibleExo === null ? indicesDe(bloc) : [cibleExo];
    var aEffacer = Seance.compterAEffacer(seance, quoi);
    if (!aEffacer.lignes) {
      fermerVoile();
      seance = Seance.retirerExercices(seance, quoi);
      return apresStructure();
    }
    feuille = { quoi: 'supprimer', iBloc: iBloc, cibleExo: cibleExo,
                lignes: aEffacer.lignes, chauffes: aEffacer.chauffes };
    rendreFeuille();
  }

  function demanderRemplacement(iExo) {
    fermerVoile();
    ouvrirCatalogue(null, iExo);
  }

  // ── Les feuilles ────────────────────────────────────────────────────────
  //
  // La fermeture REDESSINE la séance : la note et le repos vivent sur la tête
  // du bloc, et une feuille se ferme aussi par la croix, par le fond, ou par le
  // retour d'Android — trois chemins qui ne passent par aucun de ses boutons.
  function ouvrirFeuille(quoi, iExo, iSerie) {
    feuille = { quoi: quoi, iExo: iExo, iSerie: iSerie };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // Les menus de déviation visent un BLOC, et parfois une de ses branches. Ils
  // ne parlent donc pas le même langage d'indices que les feuilles de série —
  // d'où une porte à part, plutôt qu'un troisième sens donné à `iExo`.
  function ouvrirFeuilleBloc(quoi, iBloc, cibleExo) {
    feuille = { quoi: quoi, iBloc: iBloc, cibleExo: cibleExo === undefined ? null : cibleExo };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // §3.10 — La feuille « Pourquoi ». Elle vise un EXERCICE par son slug, pas
  // une série ni un bloc : la consigne est celle de l'exercice, et un superset
  // en a une par branche.
  function ouvrirPourquoi(slug) {
    if (!pourquoiDe(slug)) return;
    feuille = { quoi: 'pourquoi', slug: slug };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // ── §3.8 — LE MENU DES ZONES, ET SA PROPRE PORTE ────────────────────────
  //
  // ⚠️ IL NE PASSE PAS PAR `rendreFeuille`, ET C'EST LA RAISON D'ÊTRE DE CETTE
  // FONCTION. `rendreFeuille` refuse net s'il n'y a pas de séance en cours —
  // une garde juste, qui protège les feuilles de série, de bloc et de fin, qui
  // toutes lisent `seance`. Or l'étiquette s'ouvre AUSSI depuis la page
  // d'exercice, où il n'y a pas de séance. Lever la garde là-bas, c'était la
  // lever pour les six autres feuilles ; on ouvre donc une porte à part, qui
  // ne lit rien de la séance.
  //
  // `apres` dit ce qu'il faut redessiner à la fermeture : l'écran d'où l'on
  // vient, et la séance ouverte s'il y en a une — un choix fait depuis la page
  // d'exercice change la consigne de la séance, qui est derrière.
  function ouvrirZone(slug, apres) {
    var exo = Modele.indexerExercices(local.exercices)[slug];
    var rendre = function () {
      Rendu.rendreFeuilleZone($('feuille-contenu'), {
        nom: Modele.nommer(Modele.indexerExercices(local.exercices), slug),
        zones: Moteur.ZONES,
        choisie: zoneDe(slug),
        deduite: deduiteDe(slug),
        surChoix: async function (cle) {
          await poserZone(slug, cle);
          fermerVoile();
        },
        surFermer: fermerVoile
      });
    };
    rendre();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (typeof apres === 'function') apres();
      if (seance && !vues.seance.hidden) rendreSeance();
    });
    return exo;
  }

  // La zone DÉDUITE de l'exercice, et la raison qui l'accompagne : ce sont
  // exactement l'habitude et sa profondeur, que le fondement porte déjà. Le
  // menu ne les recalcule pas — il les lit, comme la feuille « Pourquoi ».
  function deduiteDe(slug) {
    var c = consigneDe(slug);
    var f = c && c.consigne ? c.consigne.fondement : null;
    if (!f || !f.habitude) return null;
    var cle = f.correction ? f.correction.zoneDeduite : c.consigne.zone;
    return { zone: cle, habitude: f.habitude.valeur, seances: f.habitude.seances };
  }

  function rendreFeuille() {
    if (!feuille || !seance) return;
    var cible = $('feuille-contenu');
    var index = Modele.indexerExercices(local.exercices);
    if (feuille.quoi === 'fin') return rendreFeuilleFin(cible, index);
    if (feuille.quoi === 'pourquoi') {
      return Rendu.rendreFeuillePourquoi(cible, {
        nom: Modele.nommer(index, feuille.slug),
        pourquoi: pourquoiDe(feuille.slug),
        // ⚠️ ON FERME AVANT DE NAVIGUER. Une feuille laissée ouverte sur un
        // autre écran est un voile qu'on ne sait plus d'où il vient — et le
        // retour d'Android le refermerait au lieu de remonter.
        surProfil: function () {
          fermerVoile();
          allerA(Routeur.PROFIL, {});
          rendreProfilEcran();
        }
      });
    }
    if (feuille.quoi === 'bloc' || feuille.quoi === 'exercice' ||
        feuille.quoi === 'supprimer') return rendreFeuilleDeviation(cible, index);

    var exo = seance.exercices[feuille.iExo];
    if (!exo) return;
    var nom = Modele.nommer(index, exo.exercise_slug);

    // La note d'EXERCICE (§7 septies.1). Elle ne touche pas à la structure mais
    // elle change ce que `lignes()` produit — toutes les séries de cet exercice
    // la portent — donc elle repose bien les séries.
    if (feuille.quoi === 'note') {
      return Rendu.rendreFeuilleNote(cible, {
        exercice: nom,
        note: exo.note,
        surNote: function (v) {
          seance = Seance.definirNoteExercice(seance, feuille.iExo, v);
          apresGeste({ rendre: false });
        },
        surFermer: fermerVoile
      });
    }

    // Le repos cible (§7 septies.2). ⚠️ `structure: false` : il ne vit sur
    // AUCUNE colonne de `sets`, donc il n'y a rien à reposer — et surtout,
    // RIEN NE PART DANS LA ROUTINE ICI. La question se pose à la fin (§6).
    if (feuille.quoi === 'repos') {
      // ⚠️ LA MOLETTE, LA MÊME QU'À L'ÉDITEUR (§7 sexdecies). C'est la même
      // question posée deux fois : elle n'a qu'un écran. Ce qui diffère est la
      // PHRASE — ici le réglage vaut pour la séance, pas pour la routine.
      var poserRepos = function (v) {
        seance = Seance.definirReposCible(seance, feuille.iExo, v);
        // ⚠️ ON RELIT LA VALEUR EFFECTIVEMENT POSÉE, on ne retarge pas sur `v`.
        // `definirReposCible` REFUSE ce qui sort de ses bornes et rend la
        // séance inchangée : retarger sur `v` ferait bouger la barre pendant que
        // la consigne, elle, n'aurait pas bougé — les deux se remettraient à
        // dire deux choses différentes, ce qui est tout le défaut qu'on répare.
        retargeterChrono(feuille.iExo, seance.exercices[feuille.iExo].repos_cible_s);
        apresGeste({ structure: false, rendre: false });
        fermerVoile();
      };
      return Rendu.rendreFeuilleRepos(cible, {
        exercice: nom,
        repos: exo.repos_cible_s,
        aide: 'Pour cette séance. La routine n\u2019est pas touchée : la question se pose à la fin.',
        surValider: poserRepos,
        // ⚠️ `null`, JAMAIS ZÉRO. `definirReposCible` refuse tout ce qui sort
        // de ses bornes — un zéro serait donc ignoré en silence, et le repos
        // resterait celui d'avant sans que personne ne le voie.
        surDesactiver: function () { poserRepos(null); },
        surAnnuler: fermerVoile
      });
    }

    var serie = exo.series[feuille.iSerie];
    if (!serie) return;
    Rendu.rendreFeuilleSerie(cible, {
      quoi: feuille.quoi,
      modeRPE: modeRPE,
      exercice: nom,
      numero: feuille.iSerie + 1,
      serie: serie,
      // Ce que porterait la série faute de note propre : le placeholder dit
      // donc ce qui s'écrira si on ne tape rien.
      noteExercice: exo.note,
      surNoteSerie: function (v) {
        seance = Seance.definirNoteSerie(seance, feuille.iExo, feuille.iSerie, v);
        apresGeste({ rendre: false });
      },
      surType: async function (type) {
        var i = feuille.iExo, j = feuille.iSerie;
        var etait = Seance.typeDe(seance.exercices[i].series[j]);
        seance = Seance.changerType(seance, i, j, type);
        // §9.11, G3 (49-17, 28/09/2026) — UNE SÉRIE QUI CESSE D'ÊTRE UNE SÉRIE
        // DE TRAVAIL PERD SON OBSERVATION, comme une série supprimée : des reps
        // d'échauffement ne jugent pas un pari de travail. Sur l'appareil et
        // dans la file (une observation vide) ; la base le garantit aussi.
        // ⚠️ LANCÉ AVANT `fermerVoile`, QUI REDESSINE : le vidage local est la
        // partie synchrone d'`oublierObservationDe`, faite dès l'appel — aucun
        // plan ne voit le type changé sans l'observation vidée.
        // E1 (49-19) — TOUT PASSAGE DE `travail` À UN AUTRE TYPE VIDE :
        // l'échauffement, la dégressive, et l'échec — une TENTATIVE MANQUÉE
        // (« Tentative manquée » à l'écran, « série ratée » chez Hevy), hors
        // couverture et qui ne vote pas au palier. La base suit la même règle
        // (`v2_050`, qui annule `v2_049`).
        var vidage = etait === 'travail' && type !== 'travail' ? oublierObservationDe(i, j) : null;
        fermerVoile();
        if (vidage) await vidage;
        await apresGeste();
      },
      surSupprimer: async function () {
        var i = feuille.iExo, j = feuille.iSerie;
        fermerVoile();
        await oublierObservationDe(i, j);
        seance = Seance.retirerSerie(seance, i, j);
        await apresGeste();
      },
      surEffort: async function (effort) {
        seance = Seance.definirEffort(seance, feuille.iExo, feuille.iSerie, effort);
        fermerVoile();
        await apresGeste();
      },
      surBascule: function () { modeRPE = !modeRPE; memoriserModeRPE(); rendreFeuille(); }
    });
  }

  // La bascule se retient : quelqu'un qui pratique le RPE ne veut pas le
  // rechoisir à chaque série.
  function memoriserModeRPE() {
    try { racine.localStorage.setItem('th-v2-effort', modeRPE ? 'rpe' : 'ressenti'); }
    catch (e) { /* stockage refusé : le choix vaut pour la session, pas au-delà */ }
  }

  function lireModeRPE() {
    try { modeRPE = racine.localStorage.getItem('th-v2-effort') === 'rpe'; }
    catch (e) { modeRPE = false; }
  }

  // ── L'écran de fin de séance (§7 septies.4) ─────────────────────────────
  //
  // `majRoutineVoulue` est remis à FAUX à chaque ouverture, et c'est le défaut :
  // ne pas toucher à la routine est le geste qui a le moins de conséquences.
  var majRoutineVoulue = false;

  function routineDeLaSeance() {
    if (!seance || !seance.routine_id) return null;
    return routines.filter(function (r) { return r.id === seance.routine_id; })[0] || null;
  }

  function confirmerFin() {
    majRoutineVoulue = false;
    ouvrirFeuille('fin', null, null);
  }

  function rendreFeuilleFin(cible, index) {
    var routine = routineDeLaSeance();
    // §6.2 — on ne demande QUE si la séance a réellement dévié. Une séance
    // conforme n'ouvre aucune question, sinon la question devient un bruit
    // qu'on tape sans lire.
    var verdict = Seance.ecartsRoutine(seance, routine);
    Rendu.rendreFeuilleFin(cible, {
      compte: Seance.compter(seance),
      titre: seance.titre,
      note: seance.note,
      salle: seance.salle,
      salleMax: Seance.SALLE_MAX,
      routine: routine ? routine.nom : '',
      ecarts: verdict.ecarts.map(function (e) {
        return Object.assign({}, e, {
          nom: e.exercise_slug ? Modele.nommer(index, e.exercise_slug) : ''
        });
      }),
      majRoutine: majRoutineVoulue,
      surMajRoutine: function (v) { majRoutineVoulue = v; rendreFeuille(); },
      // Les trois champs déclarés n'écrivent que le brouillon : la ligne de
      // séance part entière au moment de terminer. Poser la file à chaque
      // frappe d'un titre n'apporterait rien — la séance est déjà montée.
      surTitre: function (v) { seance = Seance.decrire(seance, { titre: v }); sauverSeance(); },
      surSalle: function (v) { seance = Seance.decrire(seance, { salle: v }); sauverSeance(); },
      surNoteSeance: function (v) { seance = Seance.decrire(seance, { note: v }); sauverSeance(); },
      surTerminer: async function () { fermerVoile(); await terminerSeance(verdict); },
      surAbandonner: async function () { fermerVoile(); await abandonnerSeance(); }
    });
  }

  // §6.3 — on ne reporte que les ÉCARTS constatés, jamais les charges, et
  // jamais le nombre de séries fait ce jour-là. Par la FILE : la question se
  // pose en salle, là où le réseau n'est pas, et une réponse perdue parce que
  // la requête a échoué serait la perte silencieuse qu'on s'interdit.
  async function reporterSurRoutine(verdict) {
    var routine = routineDeLaSeance();
    if (!routine || !verdict || !verdict.voulues.length) return;

    // ⚠️ CHAQUE LIGNE NEUVE PART AVEC SON IDENTIFIANT, FABRIQUÉ ICI.
    // `routine_exercises.id` a `gen_random_uuid()` en défaut : l'app peut donc
    // choisir le sien, et c'est ce qui rend le report IDEMPOTENT. Sans ça, une
    // vidange rejouée — réseau qui lâche, app relancée — réinsérerait une
    // seconde fois chaque exercice ajouté.
    var voulues = verdict.voulues.map(function (v) {
      return v.id ? v : Object.assign({}, v, { id: uuid() });
    });

    await poser({
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN,
      id: routine.id, donnees: { voulues: voulues }
    });

    // La bibliothèque en mémoire suit tout de suite : rouvrir la routine juste
    // après ne doit pas montrer la structure d'avant.
    routine.exercices = voulues.map(function (v, rang) {
      return Object.assign({}, v, { routine_id: routine.id, rang: rang });
    });
  }

  // ⚠️ LE PLAN SE CALCULE À LA VIDANGE, PAS À LA POSE. L'intention dit l'ÉTAT
  // VOULU ; le chemin pour y arriver dépend de ce que la routine est devenue
  // entre-temps — modifiée sur un autre appareil, ou déjà à jour parce que
  // cette même vidange a déjà tourné. Recalculé sur place, il est vide au
  // second passage : c'est là qu'est l'idempotence.
  async function appliquerReportRoutine(routineId, donnees) {
    var brutes = await Donnees.mesRoutines();
    var r = brutes.filter(function (x) { return x.id === routineId; })[0];
    // Routine archivée ou supprimée entre-temps : il n'y a plus rien à mettre à
    // jour, et l'intention a fait son temps. On ne la rejoue pas indéfiniment.
    if (!r) return;
    // ⚠️ AU VOCABULAIRE DE LA SAISIE, comme partout ailleurs. `planEcritures`
    // compare les séries d'avant à celles d'après pour n'écrire que ce qui
    // change : lui passer des lignes brutes (`routine_sets`, noms de la cible)
    // lui ferait conclure « différent » à chaque vidange, et réécrire pour rien.
    var existantes = (r.routine_exercises || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); })
      .map(function (e) { return Object.assign({}, e, { series: seriesProgrammees(e) }); });
    // `routine_sets.user_id` est NOT NULL et sans défaut — contrairement à
    // `routine_exercises`, qui n'a pas la colonne. Le plan en a donc besoin.
    var plan = Routines.planEcritures(existantes, (donnees && donnees.voulues) || [], routineId,
      sessionActive && sessionActive.user && sessionActive.user.id);
    await Routines.appliquerPlan(plan, Donnees);
  }

  // ── Saisie : la bibliothèque de routines ─────────────────────────────────

  // PostgREST rend les exercices imbriqués sous le nom de la table. On traduit
  // ICI, une fois : le rendu et le module pur ne connaissent que `exercices`,
  // triés par rang. Un seul endroit sait à quoi ressemble une réponse.
  // ⚠️ ET LA TRADUCTION VA JUSQU'AUX SÉRIES (chantier 43). `routine_sets`
  // arrive imbriquée, dans un ordre que PostgREST ne garantit pas, et au
  // vocabulaire de la CIBLE. On la trie par rang et on la passe au vocabulaire
  // de la SAISIE ici, une fois : l'éditeur de routine est l'écran de séance et
  // rend ces lignes telles quelles, `Seance.creer` les lit pareil.
  function seriesProgrammees(brut) {
    return ((brut && brut.routine_sets) || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); })
      .map(Routines.enSaisie);
  }

  function normaliserRoutine(brute) {
    var exos = (brute && brute.routine_exercises) || [];
    return {
      id: brute.id, nom: brute.nom, note: brute.note,
      archivee_a: brute.archivee_a,
      // `rang` porte l'ordre de la bibliothèque depuis v2_043 (§7 vicies.4).
      rang: brute.rang === undefined ? null : brute.rang,
      exercices: exos.slice().sort(function (a, b) { return a.rang - b.rang; })
        .map(function (e) {
          return Object.assign({}, e, { series: seriesProgrammees(e) });
        })
    };
  }

  async function chargerRoutines() {
    etatRoutines = { code: 'charge', message: '' };
    // Sans routines, pas de « Démarrer » : attendre ici la vérification de la
    // séance en cours en base garantit qu'une séance ouverte ailleurs est
    // reprise AVANT qu'on puisse en lancer une autre (voir `entrerVraiment`).
    if (verificationSeance) await verificationSeance;
    try {
      var brutes = await Donnees.mesRoutines();
      routines = brutes.map(normaliserRoutine);
      etatRoutines = { code: 'ok', message: '' };
      return true;
    } catch (e) {
      // On ne vide pas `routines` : ce qu'on avait affiché reste affiché. Un
      // écran qui se vide sur une panne de réseau fait croire à une perte.
      etatRoutines = { code: 'echec', message: texteErreur(e) };
      console.warn('Routines indisponibles :', texteErreur(e));
      return false;
    }
  }

  function rendreSaisie() {
    // L'onglet Saisie EST la saisie : s'il y a une séance en cours, c'est elle
    // qu'on ouvre. Un rechargement, un retour d'arrière-plan, une app tuée et
    // rouverte — on retombe toujours dedans, sans rien chercher.
    if (seance) return rendreSeance();
    montrer('saisie', Routeur.SAISIE);
    var cible = $('liste-routines');
    // ⚠️ « Je ne sais pas encore » n'est PAS « il n'y en a pas ». Tant qu'un
    // chargement n'a pas abouti, on ne montre pas l'état vide : hors ligne, il
    // annoncerait une bibliothèque vide à quelqu'un qui a des routines. Trouvé
    // au banc d'écran, réseau coupé — pas en test.
    if ((etatRoutines.code === 'jamais' || etatRoutines.code === 'charge') && !routines.length) {
      return Rendu.message(cible, 'Chargement…');
    }
    if (etatRoutines.code === 'echec' && !routines.length) {
      Rendu.message(cible, etatRoutines.message + ' Les routines vivent en ligne.', 'erreur');
      var reessayer = Rendu.el('button', 'discret', 'Réessayer');
      reessayer.type = 'button';
      reessayer.addEventListener('click', async function () {
        Rendu.message(cible, 'Chargement…');
        await chargerRoutines();
        rendreSaisie();
      });
      cible.appendChild(reessayer);
      return;
    }
    rendreBandeauBrouillon();
    var ranger = $('btn-ranger-routines');
    // Une seule routine ne se range pas : le bouton n'a rien à proposer.
    if (ranger) ranger.hidden = Routines.reordonnables(routines).length < 2;
    Rendu.rendreListeRoutines(cible, routines, {
      // §7 vicies — le mode Réorganiser, la bibliothèque étant la 3ᵉ surface.
      reorganiser: modeModifier && ecranCourant === 'saisie',
      ordre: reorgOrdre,
      // `apercu` compte les séries de TRAVAIL par `THSemaine.compteSeriesTravail`,
      // dont la règle du volume a besoin des muscles du catalogue.
      catalogue: local.exercices,
      surChoix: ouvrirRoutine,
      surNouvelle: function () { ouvrirRoutine(null); },
      surDemarrer: function (id) {
        demarrerSeance(routines.filter(function (r) { return r.id === id; })[0] || null);
      },
      surSeanceVide: function () { demarrerSeance(null); }
    });
    brancherReorg('liste-routines');
    brancherAppuiLong('liste-routines');
    rendrePiedReorg();
  }

  // ⚠️ IL NE DISPARAÎT PAS ET NE S'ENREGISTRE PAS TOUT SEUL (§7 octodecies.3).
  // Un brouillon oublié se SIGNALE : c'est le seul comportement qui ne décide
  // rien à la place de l'utilisateur. Et l'ancienneté règle le seuil sans
  // qu'on en fixe un — « depuis 3 jours » se lit tout seul comme un oubli.
  //
  // ⚠️ ABANDONNER DEMANDE D'ABORD. Un brouillon de trois jours ne s'efface pas
  // au premier tap d'un bandeau : c'est `showConfirm` du §6.2, ici
  // `rendreFeuilleConfirmer`, la même que la suppression d'une routine.
  function rendreBandeauBrouillon() {
    var noeud = $('bandeau-reprise');
    if (!noeud) return;
    var b = Routines.brouillonASignaler(brouillonLocal);
    if (!b) { Rendu.rendreBandeauReprise(noeud, null); return; }
    Rendu.rendreBandeauReprise(noeud, {
      quoi: 'Routine en cours d\u2019édition',
      sujet: b.nom || 'Sans nom',
      depuis: Modele.anciennete(b.modifie_a, new Date()),
      libelleQuitter: 'Abandonner',
      libelleReprendre: 'Reprendre',
      surReprendre: function () { ouvrirRoutine(b.id); },
      surQuitter: function () { demanderAbandonBrouillon(b); }
    });
  }

  function demanderAbandonBrouillon(b) {
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Abandonner ce brouillon ?',
      sujet: b.nom || 'Sans nom',
      danger: true,
      libelle: 'Abandonner',
      aide: 'Rien n\u2019a été enregistré : ce brouillon n\u2019existe que sur cet appareil. ' +
            'Les routines déjà enregistrées ne bougent pas.',
      surConfirmer: async function () {
        fermerVoile();
        await oublierBrouillon();
        rendreSaisie();
      },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  async function afficherSaisie() {
    allerA(Routeur.SAISIE, {});
    rendreSaisie();
    if (etatRoutines.code === 'ok') return;   // déjà chargé : pas de requête de plus
    await chargerRoutines();
    if (vues.saisie.hidden) return;           // l'utilisateur est parti ailleurs
    rendreSaisie();
  }

  // ── L'éditeur ────────────────────────────────────────────────────────────
  //
  // Tout se passe EN MÉMOIRE jusqu'au bouton Enregistrer. Écrire à chaque
  // frappe multiplierait les allers-retours, rendrait chaque geste faillible,
  // et surtout empêcherait de calculer le plan de renumérotation d'un coup —
  // celui qui évite de heurter `routine_exos_rang_uniq`.
  function brouillonDe(routine) {
    if (!routine) return { id: null, nom: '', exercices: [], existantes: [], nomChange: false };
    return {
      id: routine.id,
      nom: routine.nom,
      nomChange: false,
      // Copie : on édite le brouillon, jamais la routine chargée. Sans ça, un
      // enregistrement raté laisserait la liste montrant des valeurs qui ne
      // sont pas en base.
      // ⚠️ LE BROUILLON TRANSPORTE TOUT CE QUE LA LISTE BLANCHE ÉCRIT.
      // `groupe_superset` et `note` sont entrés dans `CHAMPS_EXERCICE` au
      // chantier 28 : les oublier ici les ferait partir à `null` au premier
      // enregistrement, c'est-à-dire effacer le superset et la note en voulant
      // seulement renommer la routine.
      //
      // ⚠️ ET IL LES NORMALISE (§7 decies). Une routine ancienne peut porter un
      // groupe à UN seul exercice — l'état que `v2_041` a nettoyé en base.
      // Le relire tel quel, puis enregistrer, le réécrirait : l'éditeur serait
      // un chemin par lequel l'état interdit revient.
      //
      // ⚠️ ET LES SÉRIES SE RECOPIENT LIGNE À LIGNE (chantier 43). `series` est
      // maintenant un TABLEAU d'objets : le partager avec la routine chargée
      // ferait muter la liste à chaque frappe dans l'éditeur, et un
      // enregistrement raté laisserait la bibliothèque montrant des valeurs
      // qui ne sont pas en base — exactement ce que la copie ci-dessus évite.
      exercices: Routines.renumeroter(routine.exercices.map(function (e) {
        return {
          id: e.id, exercise_slug: e.exercise_slug,
          series: (e.series || []).map(function (l) { return Object.assign({}, l); }),
          repos_cible_s: e.repos_cible_s,
          groupe_superset: e.groupe_superset === undefined ? null : e.groupe_superset,
          note: e.note === undefined ? null : e.note
        };
      })),
      existantes: routine.exercices.slice()
    };
  }

  // ══ LE BROUILLON VIT SUR L'APPAREIL (§7 octodecies.2) ════════════════════
  //
  // ⚠️ LE MÊME MÉCANISME QUE LA SÉANCE EN COURS (chantier 22), pas un second.
  // `Cache.ecrireBrouillon` porte déjà une séance sous la clé `'seance'` ; la
  // routine en cours d'édition prend la clé `'routine'`, et c'est tout. Le
  // problème est le même — quitter l'écran ne doit rien perdre — et il a déjà
  // été résolu une fois.
  //
  // ⚠️ LOCAL, JAMAIS EN BASE. Une routine en cours d'édition n'a rien à faire
  // sur le serveur, et `routines_nom_court` ou les bornes de `routine_sets`
  // refuseraient un état transitoire — un nom vide le temps de le taper, un
  // exercice sans ligne le temps d'en ajouter une. L'enregistrement reste
  // EXPLICITE : le brouillon protège du départ accidentel, la routine n'existe
  // que quand l'utilisateur le dit.
  var CLE_BROUILLON = 'routine';
  var brouillonLocal = null;   // ce que le disque porte, relu au démarrage

  // ⚠️ ON N'ÉCRIT QU'À LA MODIFICATION, JAMAIS À L'OUVERTURE. Sans cette règle,
  // ouvrir une routine pour la REGARDER effacerait le brouillon d'une autre —
  // et le bandeau qu'on vient d'ignorer aurait menti.
  async function sauverBrouillon() {
    if (!brouillon) return;
    brouillonLocal = {
      modifie_a: new Date().toISOString(),
      nom: $('champ-nom-routine') ? $('champ-nom-routine').value : brouillon.nom,
      brouillon: brouillon
    };
    brouillon.nom = brouillonLocal.nom;
    try {
      await Cache.ecrireBrouillon(CLE_BROUILLON, brouillonLocal);
    } catch (e) {
      // Même règle que la séance : le disque local est la dernière ligne, et
      // s'il refuse, l'utilisateur doit le savoir avant de partir.
      console.error('Brouillon non sauvegardé :', texteErreur(e));
      Rendu.message($('erreur-routine'),
        'Sauvegarde impossible sur cet appareil. N\u2019oublie pas d\u2019enregistrer.', 'erreur');
    }
  }

  async function oublierBrouillon() {
    brouillonLocal = null;
    try { await Cache.ecrireBrouillon(CLE_BROUILLON, null); }
    catch (e) { console.warn('Brouillon non effacé :', texteErreur(e)); }
  }

  async function chargerBrouillonLocal() {
    try { brouillonLocal = await Cache.lireBrouillon(CLE_BROUILLON); }
    catch (e) {
      console.warn('Brouillon local illisible :', texteErreur(e));
      brouillonLocal = null;
    }
  }

  async function ouvrirRoutine(id) {
    allerA(Routeur.ROUTINE, id ? { id: id } : { neuve: true });
    await prepererEditeur(id);
  }

  // Ouvrable par URL directe : la routine peut ne pas être chargée.
  async function prepererEditeur(id) {
    montrer('routine', Routeur.ROUTINE);
    if (id && etatRoutines.code !== 'ok') {
      Rendu.message($('exos-routine'), 'Chargement…');
      await chargerRoutines();
      if (vues.routine.hidden) return;
    }
    var routine = id ? routines.filter(function (r) { return r.id === id; })[0] : null;
    if (id && !routine) {
      // Une routine qui n'existe plus, ou qu'on n'a pas pu charger. On ne
      // fabrique pas un éditeur vide qui créerait un doublon à l'enregistrement.
      allerA(Routeur.SAISIE, {}, true);
      return rendreSaisie();
    }
    // ⚠️ LE BROUILLON REPREND LA MAIN, MAIS SEULEMENT SUR SA PROPRE ROUTINE.
    // Un brouillon de la routine Y ne doit pas se déverser dans l'éditeur de X
    // — ni être effacé par le seul fait d'ouvrir X. Il attend son tour ;
    // c'est le bandeau qui y ramène (§7 octodecies.3).
    var reprise = Routines.brouillonReprenable(brouillonLocal, id || null);
    brouillon = reprise || brouillonDe(routine);
    $('champ-nom-routine').value = brouillon.nom;
    $('btn-supprimer-routine').hidden = !brouillon.id;
    $('erreur-routine').textContent = '';
    rendreEditeur();
  }

  function nomExoBrouillon(i) {
    var e = brouillon.exercices[i];
    return e ? Modele.nommer(Modele.indexerExercices(local.exercices), e.exercise_slug) : '';
  }

  // ══ L'ÉDITEUR EST L'ÉCRAN DE SÉANCE (§7 quindecies) ══════════════════════
  //
  // ⚠️ AUCUN RENDU PROPRE. Pas de seconde `construireBlocs`, pas de second
  // rendu de ligne, pas de second pavé de chronométrage, pas de second badge de
  // chauffe : l'éditeur appelle `Rendu.rendreBlocsSeance` avec `programme:
  // true`, et le reste suit. C'est ce qui garantit qu'une routine se lit
  // exactement comme la séance qu'elle produira — deux rendus se seraient
  // contredits un jour, et le jour où ils se contrediraient serait celui où on
  // découvre que la routine ne dit pas ce qu'elle fait.
  //
  // Le brouillon a donc la FORME d'une séance : `exercices[].series[]`, aux
  // noms de la saisie. `Modele.blocsDeSeance` l'entrelace, groupe les supersets
  // et compte les tours sans savoir qu'il s'agit d'une routine.
  function brouillonCommeSeance() {
    return { exercices: brouillon.exercices };
  }

  // ⚠️ UN SEUL ENTONNOIR APRÈS UNE MODIFICATION, comme `apresGeste` en séance.
  // Le brouillon part sur disque à CHAQUE modification (§7 octodecies.2) ;
  // N points d'appel qui écriraient chacun le leur finiraient par en oublier
  // un, et l'oubli ne se verrait qu'en perdant une routine.
  //
  // `rendre: false` pour la saisie de ligne : re-rendre à chaque frappe
  // arracherait le focus et le clavier d'Android avec lui. L'écriture sur
  // disque, elle, a lieu dans les deux cas.
  function apresEditeur(options) {
    var o = options || {};
    var p = sauverBrouillon();
    if (o.rendre !== false) rendreEditeur();
    return p;
  }

  function exoBrouillon(i) { return brouillon.exercices[i] || null; }

  function ligneBrouillon(i, j) {
    var e = exoBrouillon(i);
    return (e && e.series && e.series[j]) || null;
  }

  function rendreEditeur() {
    var index = Modele.indexerExercices(local.exercices);
    var blocs = Modele.blocsDeSeance(brouillonCommeSeance(), local.exercices);
    var ranger = $('btn-ranger-routine');
    if (ranger) ranger.hidden = blocs.length < 2;
    Rendu.rendreBlocsSeance($('exos-routine'), null, {
      programme: true,
      blocs: blocs,
      // §7 vicies — l'éditeur est la 2ᵉ surface du mode. Le repli vient du MÊME
      // `blocReplie` que la séance : l'éditeur ne l'avait simplement jamais
      // demandé (`modifier` n'était pas passé). Rien de neuf, un branchement.
      modifier: modeModifier && ecranCourant === 'routine',
      reorganiser: modeModifier && ecranCourant === 'routine',
      // Les deux flèches du bloc replié — le chemin accessible au clavier, et
      // le filet quand le glissement rate. Même geste qu'en séance.
      surDeplacerBloc: function (i, d) { deplacerBlocRoutine(blocs, i, d); },
      exercice: function (slug) { return index[slug]; },
      // §7 septendecies.2 — la charge RÉELLEMENT soulevée à la dernière séance
      // s'affiche en gris sur chaque ligne. Même fonction qu'en séance
      // (`Seance.precedent`), donc pas de seconde lecture d'historique ; c'est
      // `rangeeDeSerie` qui l'aligne par type et par rang (chantier 38).
      precedent: precedentDe,
      // ⚠️ LE TAP EST REBRANCHÉ (§7 octodecies.4). Il avait été retiré au
      // chantier 43 parce que le brouillon n'était pas persisté : partir de
      // l'écran coûtait la routine en cours d'édition. Le raisonnement était
      // juste, la conclusion non — il traitait la conséquence comme une
      // fatalité. **La réponse était de persister le brouillon, pas de retirer
      // le geste** (§7 octodecies.1), et c'est fait au §2 de ce chantier.
      //
      // Et c'est précisément là qu'on en a besoin : consulter l'historique d'un
      // exercice pendant qu'on construit une routine est le moment où l'on
      // décide combien de séries y mettre.
      surExercice: function (slug) { afficherExercice(slug); },
      // ⚠️ LES CHAMPS MUTENT SANS REDESSINER. Re-rendre à chaque frappe
      // arracherait le focus, et le clavier d'Android avec lui — c'est la même
      // règle qu'en séance, pour la même raison.
      surChamp: function (i, j, champ, valeur) {
        var l = ligneBrouillon(i, j);
        if (!l) return;
        l[champ] = valeur;
        apresEditeur({ rendre: false });
      },
      surNumero: ouvrirTypeSerieRoutine,
      surNote: ouvrirNoteExoRoutine,
      surRepos: ouvrirReposExoRoutine,
      surAjoutSerie: function (i) {
        var e = exoBrouillon(i);
        if (!e) return;
        // La nouvelle ligne REPREND LA PRÉCÉDENTE de son exercice : programmer
        // « 5, 5, 5 » se fait alors en trois taps au lieu de trois saisies. Le
        // type suit aussi — trois chauffes d'affilée sont le cas courant d'une
        // rampe. Rien n'est repris quand il n'y a pas de précédente.
        var derniere = e.series[e.series.length - 1];
        e.series.push(derniere
          ? Object.assign({}, derniere, { id: null })
          : Routines.enSaisie(null));
        apresEditeur();
      },
      surSupprimerSerie: function (i, j) {
        var e = exoBrouillon(i);
        if (!e || !e.series[j]) return;
        e.series.splice(j, 1);
        apresEditeur();
      },
      // Sur un bloc d'un seul, bloc et exercice sont le même objet : le menu du
      // bloc EST celui de l'exercice. Sur un superset, `teteDeBloc` ne rend pas
      // de menu de bloc en mode programme — les cinq gestes portent tous sur une
      // branche, et c'est le menu d'exercice qui les donne.
      surMenuBloc: function (iBloc) {
        var b = blocs[iBloc];
        var x = b && b.exercices[0];
        if (x && x._iExo !== null && x._iExo !== undefined) ouvrirFeuilleExoRoutine(x._iExo);
      },
      surMenuExercice: function (iBloc, iExo) { ouvrirFeuilleExoRoutine(iExo); }
    });
    brancherReorg('exos-routine');
    brancherAppuiLong('exos-routine');
    rendrePiedReorg();
  }

  // Le type d'une série programmée — chauffe, travail, dégressive, échec. C'est
  // la MÊME feuille qu'en séance, `programme: true` en moins de la note de
  // série : `routine_sets` n'a pas de colonne où la mettre.
  function ouvrirTypeSerieRoutine(i, j) {
    var l = ligneBrouillon(i, j);
    if (!l) return;
    Rendu.rendreFeuilleSerie($('feuille-contenu'), {
      quoi: 'type',
      programme: true,
      numero: j + 1,
      exercice: nomExoBrouillon(i),
      serie: l,
      surType: function (t) { l.type_serie = t; fermerVoile(); apresEditeur(); },
      surSupprimer: function () {
        fermerVoile();
        var e = exoBrouillon(i);
        if (e) e.series.splice(j, 1);
        apresEditeur();
      }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LA NOTE DE LA ROUTINE, PAS CELLE DE LA SÉANCE (§7 quindecies.4). Ce
  // qu'on écrit ici REVIENT à chaque réutilisation — c'est un rappel de
  // technique. Celle qu'on prendra en séance restera sur la séance : ce sont
  // deux colonnes, sur deux tables, et la question de fin (§6) les distingue.
  function ouvrirNoteExoRoutine(i) {
    var e = exoBrouillon(i);
    if (!e) return;
    Rendu.rendreFeuilleNote($('feuille-contenu'), {
      exercice: nomExoBrouillon(i),
      note: e.note,
      surNote: function (v) { e.note = v; },
      surFermer: function () { fermerVoile(); apresEditeur(); }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LA MÊME MOLETTE QU'EN SÉANCE (§7 sexdecies), et c'est tout l'objet du
  // chantier 44 : le pavé de décalage vivait ici et une grille de huit valeurs
  // vivait là-bas, pour la même question. Il n'en reste qu'un écran.
  //
  // Trois sorties, et elles diffèrent : « Valider » pose la valeur centrée,
  // « Annuler » ne touche à rien — le brouillon reste exactement ce qu'il
  // était — et « Désactiver » écrit `null`, jamais zéro.
  function ouvrirReposExoRoutine(i) {
    var e = exoBrouillon(i);
    if (!e) return;
    var poser = function (v) { e.repos_cible_s = v; fermerVoile(); apresEditeur(); };
    Rendu.rendreFeuilleRepos($('feuille-contenu'), {
      exercice: nomExoBrouillon(i),
      repos: e.repos_cible_s,
      surValider: poser,
      surDesactiver: function () { poser(null); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LES CINQ GESTES DU §7 duodecies.2, ET AUCUN CALCUL ICI. Ce qui a du sens
  // — grouper, dégrouper — se lit sur les liens, par `THRoutines`. L'écran ne
  // redécide pas tout seul ce qu'est un groupe.
  function ouvrirFeuilleExoRoutine(i) {
    if (!brouillon.exercices[i]) return;
    Rendu.rendreFeuilleExoRoutine($('feuille-contenu'), {
      nom: nomExoBrouillon(i),
      peutGrouper: Routines.peutGrouper(brouillon.exercices, i),
      estGroupe: Routines.estGroupe(brouillon.exercices, i),
      // Le lien avec le voisin du dessous : c'est lui, et lui seul, qui fait un
      // superset dans une liste (§2.3 — un bloc est une suite contiguë).
      surGrouper: function () {
        brouillon.exercices = Routines.basculerLien(brouillon.exercices, i);
        fermerVoile(); apresEditeur();
      },
      // Sortir l'exercice de son groupe. Un superset à deux se DISSOUT : il
      // n'existe pas de groupe à un (§7 decies), et `appliquerLiens` le sait.
      surDegrouper: function () {
        brouillon.exercices = Routines.degrouper(brouillon.exercices, i);
        fermerVoile(); apresEditeur();
      },
      surReorganiser: brouillon.exercices.length > 1
        ? function () { fermerVoile(); ouvrirReorganisation(); }
        : null,
      // Rien n'est écrit tant qu'on n'a pas enregistré : retirer une ligne du
      // brouillon ne perd rien, et une question ici serait le bruit qu'on tape
      // sans lire (§6.2).
      surSupprimer: function () {
        fermerVoile();
        brouillon.exercices.splice(i, 1);
        renumeroterBrouillon();
      }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ DÉPLACER RELIT LES LIENS DE LA NOUVELLE ADJACENCE. Sortir un exercice
  // d'un superset le dégroupe ; en glisser un au milieu le coupe en deux. Les
  // deux se voient tout de suite — le lien est dessiné entre les cartes, à
  // l'endroit exact où il vient de céder.
  function renumeroterBrouillon() {
    brouillon.exercices = Routines.renumeroter(brouillon.exercices);
    return apresEditeur();
  }

  // ⚠️ L'ÉDITEUR DÉPLACE DÉSORMAIS DES BLOCS, PLUS DES VOISINS (ch. 46).
  // `echanger(i, i±1)` échangeait deux EXERCICES : sur un superset, ça sortait
  // une branche de son groupe. En séance, `deplacerBloc` déplace le bloc entier
  // depuis le chantier 28 — les deux écrans disaient donc deux choses
  // différentes du même geste. Maintenant qu'ils partagent le repli, le
  // glissement et le mode, ils partagent aussi la règle.
  function ordreBlocsCourant(blocs) {
    return blocs.map(function (_, i) { return String(i); });
  }

  function reordonnerBrouillonParBlocs(cles) {
    var blocs = Modele.blocsDeSeance(brouillonCommeSeance(), local.exercices);
    var neufs = [];
    cles.forEach(function (k) {
      (indicesDe(blocs[Number(k)]) || []).forEach(function (i) {
        if (brouillon.exercices[i]) neufs.push(brouillon.exercices[i]);
      });
    });
    if (neufs.length !== brouillon.exercices.length) return;
    brouillon.exercices = neufs;
    renumeroterBrouillon();
  }

  function deplacerBlocRoutine(blocs, iBloc, delta) {
    var cible = iBloc + delta;
    if (cible < 0 || cible >= blocs.length) return;
    var cles = ordreBlocsCourant(blocs);
    var pris = cles.splice(iBloc, 1)[0];
    cles.splice(cible, 0, pris);
    reordonnerBrouillonParBlocs(cles);
  }

  async function enregistrerBrouillon() {
    if (enregistrementEnCours) return;
    var bouton = $('btn-enregistrer-routine'), erreur = $('erreur-routine');
    brouillon.nom = $('champ-nom-routine').value;

    var routineDOrigine = brouillon.id
      ? routines.filter(function (r) { return r.id === brouillon.id; })[0] : null;
    brouillon.nomChange = !routineDOrigine ||
      Routines.nomPropre(brouillon.nom) !== Routines.nomPropre(routineDOrigine.nom);

    var verdict = Routines.valider(brouillon, routines);
    if (!verdict.valide) { erreur.textContent = messageVerdict(verdict); return; }

    enregistrementEnCours = true;
    erreur.textContent = '';
    bouton.disabled = true; bouton.textContent = 'Enregistrement…';
    try {
      var r = await Routines.enregistrer(brouillon, Donnees, {
        userId: sessionActive && sessionActive.user && sessionActive.user.id,
        // Les séries programmées visent leur exercice par clé étrangère : un
        // exercice neuf doit donc porter son identifiant AVANT d'être écrit,
        // sinon sa structure ne peut pas partir dans le même passage.
        uuid: uuid,
        // ⚠️ LE RANG D'UNE ROUTINE NEUVE SE CALCULE ICI, parce que c'est ici
        // qu'on a la liste complète — `routines_user_rang_uniq` porte sur
        // (user_id, rang), donc le prochain libre se lit sur TOUT l'utilisateur.
        rangSuivant: rangSuivantBibliotheque()
      });
      if (!r.ok) {
        // Le brouillon reste À L'ÉCRAN, intact. Rien n'est vidé, rien n'est
        // perdu — c'est la première question de quelqu'un dont l'enregistrement
        // vient d'échouer, et la réponse doit être visible.
        erreur.textContent = Routines.messageErreur(r);
        return;
      }
      // ⚠️ LE BROUILLON EST CONSOMMÉ, PAS LAISSÉ DERRIÈRE. Il n'existait que
      // pour protéger du départ accidentel ; la routine est en base, donc il
      // n'a plus rien à protéger — et un bandeau qui proposerait de « reprendre »
      // ce qui vient d'être enregistré ferait douter de l'enregistrement.
      await oublierBrouillon();
      await chargerRoutines();
      allerA(Routeur.SAISIE, {}, true);
      rendreSaisie();
    } finally {
      enregistrementEnCours = false;
      bouton.disabled = false; bouton.textContent = 'Enregistrer';
    }
  }

  // Un message par cause, jamais la liste brute des soucis : on nomme le
  // premier problème, celui qu'il faut corriger maintenant.
  function messageVerdict(verdict) {
    var s = verdict.soucis[0];
    if (s.champ === 'nom' && s.raison === 'vide') return 'Donne un nom à ta routine.';
    if (s.champ === 'nom' && s.raison === 'trop-long') return 'Le nom fait plus de ' + Routines.NOM_MAX + ' caractères.';
    if (s.champ === 'nom' && s.raison === 'doublon') return Routines.MESSAGES.doublon;
    // ⚠️ IL N'Y A PLUS DE BORNE SUR LE NOMBRE DE SÉRIES (chantier 43) : une
    // ligne par série, et `routine_sets` n'impose aucun minimum de lignes. Le
    // seul refus qui reste est l'exercice VIDE — qui démarrerait une séance
    // sans rien à y faire.
    if (s.champ === 'series') return 'Un exercice n\u2019a aucune série. Ajoute-lui une ligne, ou retire-le.';
    if (s.champ === 'reps_visees') return 'Les reps visées vont de ' + Routines.REPS_MIN + ' à ' + Routines.REPS_MAX + ', ou restent vides.';
    // ⚠️ LE MESSAGE PARLE LA LANGUE DU CHAMP (chantier 42). Le repos se saisit
    // en mm:ss depuis le §7 quaterdecies.2 : annoncer une borne « en secondes »
    // obligerait à convertir de tête pour comprendre ce qu'on vient de taper.
    if (s.champ === 'repos_cible_s') return 'Le repos va de ' + Rendu.mmss(Routines.REPOS_MIN) +
      ' à ' + Rendu.mmss(Routines.REPOS_MAX) + ', ou reste vide.';
    return 'Il manque un exercice sur une ligne.';
  }

  // ══ SUPPRIMER UNE ROUTINE (§7 duodecies.1) ═══════════════════════════════
  //
  // ⚠️ L'ARCHIVAGE EST PARTI, ET C'EST LE POINT. Archiver était irréversible
  // DEPUIS L'APP : une routine archivée par erreur n'avait aucun chemin de
  // retour, et il a fallu une écriture en base le 13/09. Un geste franc, avec
  // confirmation, vaut mieux qu'un geste doux dont on ne revient pas.
  //
  // ⚠️ ET LA CONFIRMATION NE PARLE PAS DE « LIEN ». Une séance passée n'est pas
  // liée à sa routine, elle en est ISSUE : `sessions_routine_fk` est
  // ON DELETE SET NULL, donc rien de ce qui a été fait ne bouge. C'est la
  // crainte légitime de quelqu'un qui supprime, et la phrase doit y répondre.
  function demanderSuppressionRoutine() {
    if (!brouillon || !brouillon.id) return;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Supprimer cette routine ?',
      sujet: Routines.nomPropre(brouillon.nom) || 'Routine',
      danger: true,
      libelle: 'Supprimer',
      aide: 'Les séances que tu as déjà faites avec elle restent intactes, ' +
            'avec toutes leurs séries. Seule la routine part, et rien ne la remet en place.',
      surConfirmer: async function () { fermerVoile(); await supprimerCourante(); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  async function supprimerCourante() {
    if (!brouillon || !brouillon.id) return;
    var erreur = $('erreur-routine');
    erreur.textContent = '';
    try {
      // `routine_exercises_routine_id_fkey` est ON DELETE CASCADE : les
      // exercices partent avec la routine, sans second appel.
      await Donnees.supprimerRoutine(brouillon.id);
      // La routine n'existe plus : son brouillon non plus. Le garder ferait
      // proposer la reprise d'une routine supprimée.
      await oublierBrouillon();
      await chargerRoutines();
      allerA(Routeur.SAISIE, {}, true);
      rendreSaisie();
    } catch (e) {
      erreur.textContent = Routines.messageErreur({ erreur: Routines.classerErreur(e) });
    }
  }

  // ── Le catalogue ─────────────────────────────────────────────────────────
  //
  // Il vit dans le cache local (237 entrées, synchronisées avec le reste) :
  // chercher un exercice marche donc HORS LIGNE, contrairement à
  // l'enregistrement. C'est la moitié du problème que le cache résout déjà.
  // Le catalogue sert trois intentions, et c'est lui qui les distingue :
  // ajouter en fin de séance (rien), insérer APRÈS un bloc (`apres`), ou
  // REMPLACER un exercice (`remplace`).
  var intentionCatalogue = { apres: null, remplace: null };

  // ⚠️ DEUX INDICES, ET RIEN D'AUTRE (chantier 33). Les deux boutons généraux
  // étaient câblés `addEventListener('click', ouvrirCatalogue)` : le gestionnaire
  // recevait donc le MouseEvent comme `apres`, qui n'est pas `undefined` et
  // passait la garde. `Math.min(n, MouseEvent)` vaut `NaN`, `splice(NaN, …)`
  // insère à l'index 0 — et tout exercice ajouté en séance se posait EN TÊTE.
  // Effet de bord : `ajouterExercice` en devenait inatteignable, ce qui masquait
  // la moitié du défaut d'identifiant du chantier 32.
  //
  // Comme pour `serieVide`, on corrige le CONTRAT : ce qui n'est pas un indice
  // n'est pas un indice. Le câblage est explicite en face, mais c'est cette
  // garde qui survit au prochain appelant.
  function indiceOuNul(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // §9.13 (49-C) — le nombre de séries proposé au départ, hors routine :
  // `n` de la consigne (l'habitude), sinon les séries de travail de la
  // dernière séance, sinon l'intention (`Plan.seriesDeDepart`, 49-U6).
  //
  // ⚠️ PAS EN ÉDITION. Corriger une séance passée (§7 octies), c'est noter ce
  // qui a été fait, pas démarrer une séance : il n'y a pas de « séance en
  // cours » à proposer, et le moteur s'y tait déjà. Une ligne, comme avant.
  function seriesDeDepartPour(slug) {
    if (enEdition()) return 1;
    var c = seance ? consigneDe(slug) : null;
    return Plan.seriesDeDepart(c ? c.consigne : null, precedentDe(slug), profil ? profil.intention : null);
  }

  function ouvrirCatalogue(apres, remplace) {
    intentionCatalogue = { apres: indiceOuNul(apres), remplace: indiceOuNul(remplace) };
    $('champ-recherche-exo').value = '';
    rendreCatalogue();
    ouvrirVoile($('catalogue'));
    $('champ-recherche-exo').focus();
  }

  function rendreCatalogue() {
    // « Aucun exercice ne correspond » serait FAUX tant que le catalogue n'est
    // pas arrivé — il dirait que la recherche a échoué alors que c'est la
    // synchronisation qui n'a pas fini. Trouvé au banc d'écran, pas en test.
    if (!local.exercices.length) {
      return Rendu.message($('resultats-exo'), 'Le catalogue arrive… Il est enregistré sur l\u2019appareil à la première synchronisation.');
    }
    // Le même catalogue sert deux écrans : l'éditeur de routine et la séance en
    // cours. C'est la séance qui gagne quand elle est ouverte — on y est.
    var pourSeance = !!seance && !vues.seance.hidden;
    Rendu.rendreResultatsExo($('resultats-exo'),
      Routines.chercher(local.exercices, $('champ-recherche-exo').value),
      function (exo) {
        fermerVoile();
        if (pourSeance) {
          // §14.7 (49-U17, delta 49-35) — l'exercice ajouté dont la série de
          // plus est active reçoit sa ligne de plus, comme à l'ouverture.
          var avantAjout = seance.exercices;
          var puisLigneDePlus = function () { return ligneDePlusPourAjout(avantAjout, exo.slug); };
          if (intentionCatalogue.remplace !== null) {
            // §5.2 — remplacer, c'est ajouter puis sauter en gardant la place.
            seance = Seance.remplacerExercice(seance, intentionCatalogue.remplace,
              exo.slug, uuid);
            return apresStructure().then(puisLigneDePlus);
          }
          // §9.13 (49-C) — HORS ROUTINE, les séries de travail sont posées
          // d'emblée : l'habitude de l'exercice, sinon l'intention. Un
          // pré-remplissage, pas une prescription : « + Série » et le retrait
          // restent libres.
          var depart = { series: seriesDeDepartPour(exo.slug) };
          if (intentionCatalogue.apres !== null) {
            seance = Seance.insererExercice(seance, intentionCatalogue.apres, exo.slug, uuid, depart);
            return apresStructure().then(puisLigneDePlus);
          }
          seance = Seance.ajouterExercice(seance, exo.slug, uuid, depart);
          return apresGeste({ structure: false }).then(puisLigneDePlus);
        }
        // ⚠️ UNE SEULE LIGNE, VIDE (chantier 43). L'ancien modèle posait
        // `series: 3` — un défaut hérité de la colonne, qui prescrivait trois
        // séries à la place de l'utilisateur. Avec une ligne par série, en
        // poser trois serait le même geste en pire : trois lignes à effacer.
        // On en pose UNE, parce qu'un exercice à zéro série ne se saisit pas,
        // et « + Série » recopie la précédente — trois taps pour trois séries.
        //
        // Ni reps ni repos par défaut : une valeur inventée se lirait comme une
        // prescription, et serait pire qu'une absence.
        brouillon.exercices.push({
          id: null, exercise_slug: exo.slug,
          series: [Routines.enSaisie(null)],
          repos_cible_s: null, groupe_superset: null, note: null
        });
        apresEditeur();
      });
  }

  // ── Vue Volume : la semaine, le relevé, puis le radar ────────────────────
  function rendreVolume(lundi) {
    if (lundi) lundiAffiche = lundi;
    montrer('volume', Routeur.VOLUME);

    var sem = semaineCourante();
    Rendu.rendreBarreSemaine($('barre-progression'), barrePour(sem, false));
    Rendu.rendreReleveZones($('releve-zones'), sem.zones, zoneOuverte,
      function (cle) {
        // Une zone ouverte à la fois : ouvrir Dos referme Jambes.
        zoneOuverte = (zoneOuverte === cle) ? null : cle;
        rendreVolume();
      },
      ouvrirFenetreMuscle);

    rendreRadar();
  }

  // Le radar ne suit PAS la semaine affichée : il compare deux fenêtres
  // glissantes ancrées sur aujourd'hui. Faire glisser la semaine du dessus ne
  // le fait donc pas bouger — c'est voulu, ce sont deux questions différentes
  // (« cette semaine » et « ces trente jours contre les trente d'avant »).
  function rendreRadar() {
    var p = Periode.periodeDe(periodeRadar);
    var f = Periode.fenetres(p.jours, new Date());
    var c = Periode.decouper(local.seances, local.series, f.courante);
    var a = Periode.decouper(local.seances, local.series, f.precedente);

    var comparaison = Periode.comparerZones(
      Semaine.volumeParZone(c.series, local.exercices),
      Semaine.volumeParZone(a.series, local.exercices),
      Semaine.ZONES);

    Rendu.rendrePeriodes($('periodes-radar'), Periode.PERIODES, periodeRadar, function (cle) {
      periodeRadar = cle;
      rendreRadar();
    });
    Rendu.rendreRadar($('radar'), comparaison, p, Periode);
    Rendu.rendreCartesPeriode($('cartes-radar'),
      comparaison.vide ? [] : Periode.cartes(comparaison,
        Semaine.bilanSemaine(c.seances, c.series, local.exercices),
        Semaine.bilanSemaine(a.seances, a.series, local.exercices)),
      p);
    $('note-radar').hidden = comparaison.vide;
  }

  // ── Vue Poids ────────────────────────────────────────────────────────────
  function rendrePoids() {
    montrer('poids', Routeur.POIDS);
    var p = Poids.periodeDe(periodePoids);
    var fenetre = Poids.filtrer(local.pesees, p.jours, new Date());

    Rendu.rendrePeriodes($('periodes-poids'), Poids.PERIODES, periodePoids, function (cle) {
      periodePoids = cle;
      rendrePoids();
    });
    Rendu.rendreCourbePoids($('courbe-poids'), Poids.courbe(fenetre, 300, 104));
    Rendu.rendreListePesees($('liste-pesees'), Poids.dernieres(fenetre, 12), fenetre.length);
  }

  // ── Fenêtre d'un muscle ──────────────────────────────────────────────────
  function ouvrirFenetreMuscle(muscle) {
    var sem = semaineCourante();
    var zone = Semaine.zoneDuMuscle(muscle.muscle);
    Rendu.rendreFenetreMuscle($('fen-muscle-contenu'), muscle,
      zone ? zone.libelle : null,
      Semaine.apportsParMuscle(muscle.muscle, sem.series, local.exercices, sem.seances),
      sem.bornes);
    ouvrirVoile($('fenetre-muscle'));
  }

  // ── Calendrier ───────────────────────────────────────────────────────────
  function ouvrirCalendrier() {
    var l = lundiAffiche || Semaine.bornesSemaine(new Date()).lundi;
    moisCalendrier = { annee: l.getFullYear(), mois: l.getMonth() };
    rendreCalendrier();
    ouvrirVoile($('calendrier'));
  }

  function rendreCalendrier() {
    var grille = Calendrier.grilleMois(moisCalendrier.annee, moisCalendrier.mois, local.seances);
    $('cal-mois-nom').textContent = grille.libelle;
    Rendu.rendreCalendrier($('cal-grille'), grille, lundiAffiche, function (lundi) {
      fermerVoile();
      afficherSemaine(lundi);
    });
  }

  // ── Voiles ───────────────────────────────────────────────────────────────
  //
  // Un voile ouvert pose une GARDE : le retour d'Android le ferme au lieu de
  // naviguer. C'est le point d'accroche prévu depuis le chantier 8, utilisé
  // pour la première fois ici.
  var voileOuvert = null;
  var apresVoile = null;
  // `apres` court à la FERMETURE, quel qu'en soit le chemin : la croix, le
  // fond, le retour d'Android, ou un bouton de la feuille. Une feuille qui
  // laisse l'écran derrière elle périmé est un écran faux affiché une seconde —
  // et la leçon du chantier 21 est qu'on mesure aussi les états transitoires.
  function ouvrirVoile(noeud, apres) {
    fermerVoile();
    voileOuvert = noeud;
    apresVoile = apres || null;
    noeud.hidden = false;
    gardeOverlay = function () { return { raison: 'voile', afficher: fermerVoile }; };
    ajouterGarde(gardeOverlay);
  }

  function fermerVoile() {
    // Pris AVANT de fermer, et remis à zéro tout de suite : `apres` peut
    // rouvrir une feuille, et il ne doit pas se rappeler lui-même.
    var apres = apresVoile;
    apresVoile = null;
    if (gardeOverlay) { retirerGarde(gardeOverlay); gardeOverlay = null; }
    if (voileOuvert) { voileOuvert.hidden = true; voileOuvert = null; }
    if (apres) apres();
  }

  // Navigation explicite : elle écrit l'URL, puis rend.
  //
  // `remplacer` sert au bouton « ← Séances » (voir son branchement) : il ne veut
  // pas EMPILER la liste par-dessus le détail qu'il quitte, il veut la METTRE
  // À SA PLACE. Le détail disparaît de l'historique au lieu de dormir dessous,
  // et aucun retour d'Android ne peut le rouvrir — ce que le chantier 40
  // reprochait à la navigation explicite tient donc à l'empilement, pas à
  // l'explicite.
  function afficherSemaine(lundi, remplacer) {
    var l = lundi || lundiAffiche || Semaine.bornesSemaine(new Date()).lundi;
    allerA(Semaine.memeSemaine(l, new Date()) ? Routeur.RACINE : Routeur.SEMAINE, { lundi: l }, remplacer === true);
    rendreSemaine(l);
  }

  function afficherDetail(sessionId) {
    allerA(Routeur.SEANCE, { id: sessionId });
    rendreDetail(sessionId);
  }

  function naviguer(n) {
    var l = Semaine.decalerSemaine(lundiAffiche, n).lundi;
    if (!vues.volume.hidden) { lundiAffiche = l; return rendreVolume(); }
    afficherSemaine(l);
  }

  function rendreDetail(sessionId) {
    montrer('detail', Routeur.SEANCE);
    var ligne = local.seances.filter(function (s) { return s.id === sessionId; })[0] || null;
    var series = seriesDe(sessionId);
    var blocs = Modele.construireBlocs(series, local.exercices);
    // ⚠️ LA MÊME RÈGLE QUE LA CARTE (chantier 47). Sans elle, cet écran offrait
    // « Modifier » sur une séance dont les séries n'étaient pas arrivées — et
    // l'enregistrement les effaçait en base. Une séance INCONNUE (`ligne` nulle)
    // n'est pas incomplète : elle n'existe pas, et aucun geste ne lui est offert
    // de toute façon.
    var incomplet = !!ligne && Seance.seriesIncompletes(series);
    // §2.8 — un tap sur le nom d'un exercice donne sa page. C'est la porte
    // d'entrée la plus naturelle, et elle était inerte depuis le chantier 27.
    Rendu.rendreDetail($('detail-seance'), ligne, blocs, {
      incomplet: incomplet,
      surExercice: function (slug) { afficherExercice(slug); },
      surSupprimer: ligne ? function () { demanderSuppressionSeance(ligne); } : null,
      surModifier: ligne ? function () { modifierSeance(ligne, blocs); } : null,
      surRefaire: ligne ? function () { refaireSeance(ligne, blocs); } : null
    });
  }

  // ══ LA PAGE D'EXERCICE (§7 quater) ═══════════════════════════════════════
  //
  // ⚠️ ELLE NE CALCULE RIEN QUI EXISTE DÉJÀ (`CADRAGE-V2` §2 undecies). Cette
  // fonction n'est qu'un CÂBLAGE : elle rassemble les séries, appelle les
  // mêmes fonctions que la carte de séance et que la barre de semaine, et passe
  // le résultat au rendu.
  //
  //   meilleure série  → `Modele.meilleureSerieDeTout`, qui rappelle le chemin
  //                      de la carte séance par séance ;
  //   palier           → `Palier.analyser` sur la DERNIÈRE séance, comme le
  //                      sommaire de Progression ;
  //   séries de travail→ `Semaine.compteSeriesTravail`, la règle unique du §1 ;
  //   historique       → `Modele.construireBlocs`, qui rend déjà le détail.
  var PAS_HISTORIQUE = 20;     // §7 quater.4 — 20 séances, puis « voir plus »
  // ⚠️ RIEN D'AUTRE QUE CE QUI SE LIT. Cet état ne retient QUE combien de
  // séances l'historique déplie, et pour quel exercice. L'onglet courant, lui,
  // vient de l'URL à chaque rendu : le garder ici en ferait une seconde source
  // — un champ écrit que personne ne lit, exactement le défaut C1 du chantier 39.
  var exoAffiche = null;       // { slug, combien }

  // Les séances qui portent cet exercice, de la plus récente à la plus
  // ancienne : `local.seances` est déjà rangée ainsi (invariant de
  // `rangerSeances`), on ne retrie pas ce qui est trié.
  function seancesDeLExercice(slug) {
    return local.seances.map(function (s) {
      var siennes = seriesDe(s.id).filter(function (x) {
        return x && x.exercise_slug === slug;
      });
      return siennes.length ? { seance: s, series: siennes } : null;
    }).filter(Boolean);
  }

  // `repos_s` est NULL sur les 28 103 séries importées : l'export Hevy ne porte
  // pas le repos. On ne moyenne donc que ce qui existe, et on ne rend rien
  // plutôt qu'un zéro — une séance sans repos mesuré n'est pas une séance sans
  // repos.
  function reposMoyenDe(series) {
    var somme = 0, n = 0;
    series.forEach(function (s) {
      var v = s && s.repos_s;
      if (v === null || v === undefined) return;
      somme += Number(v) || 0; n++;
    });
    return n ? Math.round(somme / n) : null;
  }

  function rendreExercice(slug, onglet) {
    montrer('exercice', Routeur.EXERCICE);
    var vueOnglet = onglet === Routeur.EXO_HISTORIQUE ? Routeur.EXO_HISTORIQUE : 'resume';
    // Le « voir plus » ne survit pas à un changement d'exercice : on repart des
    // 20 dernières, sinon une page ouverte sur 60 séances en afficherait 60
    // pour l'exercice suivant sans que personne ne l'ait demandé.
    if (!exoAffiche || exoAffiche.slug !== slug) {
      exoAffiche = { slug: slug, combien: PAS_HISTORIQUE };
    }

    var index = Modele.indexerExercices(local.exercices);
    var exo = index[slug] || null;
    var mesure = exo ? exo.mesure : null;
    var groupes = seancesDeLExercice(slug);
    var toutes = [].concat.apply([], groupes.map(function (g) { return g.series; }));

    // Le palier du JOUR le plus récent. Il ne se calcule pas sur trois ans :
    // « chauffe probable » se juge à ≤ 75 % de la plus lourde DU JOUR (§4.1).
    var palier = groupes.length
      ? Palier.analyser(groupes[0].series, etatsExercices[slug], { mesure: mesure })
      : { palier: null, reps: null, erreur: null };

    // La date d'un record est celle de la SÉANCE, pas `validee_a` : les séries
    // importées ont `validee_a` à NULL (chantier 35, D3).
    var debutDe = {};
    groupes.forEach(function (g) {
      g.series.forEach(function (x) { debutDe[x.id] = g.seance.debut; });
    });
    var table = Modele.tableParReps(toutes, mesure, function (x) { return debutDe[x.id] || null; });
    // Un jour de record se DÉDUIT de la table, il ne se recalcule pas : ce sont
    // exactement les dates de ses lignes non déduites. On garde le plus grand
    // nombre de reps du jour — « record à 6 reps » dit de quoi il s'agit.
    var joursRecord = {};
    table.forEach(function (l) {
      if (l.deduit || !l.date) return;
      if (!joursRecord[l.date] || l.reps > joursRecord[l.date]) joursRecord[l.date] = l.reps;
    });

    // La dernière séance porte le PALIER sur `charge_reps` — la grandeur du
    // moteur. Sur les autres mesures il n'y en a pas : on lit alors la meilleure
    // série du jour, par le chemin de la carte.
    var derniere = null;
    if (groupes.length) {
      derniere = mesure === 'charge_reps'
        ? { charge: palier.palier, reps: palier.reps }
        : Modele.meilleureSerieDe(slug, groupes[0].series, local.exercices, Palier, etatsExercices);
      derniere.date = groupes[0].seance.debut;
    }

    var record = Modele.meilleureSerieDeTout(slug, groupes.map(function (g) {
      return { cle: g.seance.debut, series: g.series };
    }), local.exercices, Palier, etatsExercices);
    record.date = record.cle || null;

    var visibles = groupes.slice(0, exoAffiche.combien);
    // §7 quater — L'ÉTIQUETTE DE ZONE SUR LA PAGE D'EXERCICE. La zone
    // appartient à l'exercice : la montrer seulement en séance la ferait
    // passer pour un réglage de la séance du jour.
    //
    // ⚠️ LA DATE DE COUPURE EST CELLE DE LA SÉANCE OUVERTE quand il y en a
    // une, comme partout ailleurs (MOTEUR §9.12) : sinon la page d'exercice
    // lirait une séance que l'écran de saisie, lui, ne voit pas — deux zones
    // pour un même exercice à la même seconde.
    var gabaritExo = Modele.gabaritDe(exo);
    var consigneExo = Moteur.consigneDExercice(groupes, etatsExercices[slug],
      seance ? seance.debut : new Date().toISOString(), {
        mesure: gabaritExo.inconnue ? null : gabaritExo.mesure,
        equipement: exo ? exo.equipement : null,
        intention: profil ? profil.intention : null,
        reglage: Profil.rythmeDe(profil),
        correction: zoneDe(slug),
        edition: false
      });
    Rendu.rendrePageExercice($('page-exercice'), {
      nom: exo ? exo.nom : slug,
      etiquette: consigneExo ? consigneExo.etiquette : null,
      zoneChoisie: !!zoneDe(slug),
      // ⚠️ ET LA PAGE SE REDESSINE APRÈS LE CHOIX. Elle n'est pas rendue par
      // `rendreSeance` : sans ce rappel, l'étiquette et la consigne y
      // resteraient celles d'avant la correction — la ligne écrite, l'écran
      // muet. Trouvé au banc, pas en test. `ouvrirZone` s'occupe de la séance
      // ouverte s'il y en a une, et il peut n'y en avoir aucune : c'est
      // précisément d'ici qu'on ouvre le menu sans séance.
      surZone: consigneExo ? function () {
        ouvrirZone(slug, function () { rendreExercice(slug, vueOnglet); });
      } : null,
      mesure: mesure,
      onglet: vueOnglet,
      sousTitre: sousTitreExercice(groupes),
      surOnglet: function (o) { afficherExercice(slug, o); },
      // §7 quater.1 — la séance en cours reste visible, et « Reprendre » y
      // ramène : on consulte sans avoir l'impression d'avoir quitté.
      seanceEnCours: seance ? {
        titre: seance.titre || 'Séance',
        surReprendre: function () { afficherSaisie(); }
      } : null,
      derniere: derniere,
      record: record,
      volume: {
        nbSeries: Semaine.compteSeriesTravail(toutes, local.exercices),
        nbSeances: groupes.length
      },
      table: table,
      // Pas de moteur de cible à ce jour (`CADRAGE-V2` §2 ter) : la ligne mise
      // en avant est celle des reps du palier courant — celle sur laquelle on
      // travaille réellement aujourd'hui.
      cibleReps: palier.reps,
      historique: visibles.map(function (g) {
        return {
          id: g.seance.id,
          titre: g.seance.titre,
          debut: g.seance.debut,
          note: g.seance.note || '',
          reposMoyen: reposMoyenDe(g.series),
          record: (g.seance.debut && joursRecord[g.seance.debut]) || 0,
          blocs: Modele.construireBlocs(g.series, local.exercices)
        };
      }),
      surSeance: function (id) { afficherDetail(id); },
      reste: Math.max(0, groupes.length - visibles.length),
      surVoirPlus: function () {
        exoAffiche.combien += PAS_HISTORIQUE;
        rendreExercice(slug, vueOnglet);
      }
    });
  }

  // « 123 séances depuis janvier 2024 · dernière le 11 sept. » — trois faits
  // lus sur la liste déjà rangée, aucun jugement. Rien du tout quand il n'y a
  // rien : un exercice jamais fait n'a pas d'histoire à résumer.
  function sousTitreExercice(groupes) {
    if (!groupes.length) return '';
    var n = groupes.length;
    var depuis = new Date(groupes[n - 1].seance.debut);
    var derniere = new Date(groupes[0].seance.debut);
    var bouts = [n + ' séance' + (n > 1 ? 's' : '')];
    if (!isNaN(depuis.getTime())) {
      bouts[0] += ' depuis ' + depuis.toLocaleDateString('fr-FR',
        { month: 'long', year: 'numeric' });
    }
    if (!isNaN(derniere.getTime())) {
      bouts.push('dernière le ' + derniere.toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'short' }));
    }
    return bouts.join(' \u00b7 ');
  }

  function afficherExercice(slug, onglet) {
    var params = { slug: slug };
    if (onglet === Routeur.EXO_HISTORIQUE) params.onglet = Routeur.EXO_HISTORIQUE;
    allerA(Routeur.EXERCICE, params);
    rendreExercice(slug, onglet);
  }

  // §7 octies — LE MÊME MENU, DEPUIS LA LISTE. Supprimer une séance demandait de
  // l'ouvrir : un détour pour un geste courant. Les trois gestes sont ceux du
  // détail, appelés tels quels — refus compris quand une séance est en cours.
  function ouvrirMenuSeance(id) {
    var ligne = local.seances.filter(function (s) { return s.id === id; })[0];
    if (!ligne) return;
    var blocs = Modele.construireBlocs(seriesDe(id), local.exercices);
    Rendu.rendreFeuilleSeance($('feuille-contenu'), {
      titre: ligne.titre,
      surRefaire: function () { fermerVoile(); refaireSeance(ligne, blocs); },
      surModifier: function () { fermerVoile(); modifierSeance(ligne, blocs); },
      surSupprimer: function () { fermerVoile(); demanderSuppressionSeance(ligne); }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ══ LES GESTES SUR UNE SÉANCE TERMINÉE (§7 octies) ═══════════════════════
  //
  // Aucun n'existait : deux séances ont dû être supprimées directement en base
  // le 13/09 parce que l'app ne savait pas le faire.
  //
  // ⚠️ MODIFIER ET REFAIRE OUVRENT LA SAISIE, qui ne tient qu'UNE séance à la
  // fois. Écraser un brouillon en cours perdrait une séance réellement
  // commencée : on refuse, et on le dit.
  function seanceEnCoursBloque() {
    if (!seance) return false;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Une séance est en cours',
      aide: 'Termine-la ou abandonne-la d’abord : l’écran de saisie n’en tient qu’une.',
      libelle: 'Aller à la séance en cours',
      surConfirmer: function () { fermerVoile(); rendreSaisie(); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
    return true;
  }

  // §7 octies.1 — rien de silencieux. Les séries partent avec la séance : la
  // cascade `sets_session_id_fkey ON DELETE CASCADE` s'en charge en base, et on
  // fait le même ménage en local pour que l'écran suive tout de suite.
  function demanderSuppressionSeance(ligne) {
    // Des LIGNES, chauffes comprises : c'est ce qui part vraiment (C1).
    var toutes = seriesDe(ligne.id);
    var n = toutes.length;
    var nW = toutes.filter(function (x) { return x && x.type_serie === 'echauffement'; }).length;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Supprimer cette séance ?',
      sujet: ligne.titre || 'Séance',
      danger: true,
      libelle: 'Supprimer',
      aide: Rendu.phraseEffacement(n, nW) + ' avec elle. Rien ne la remet en place.',
      surConfirmer: async function () { fermerVoile(); await supprimerSeance(ligne.id); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  async function supprimerSeance(id) {
    // L'ordre compte, comme à l'abandon : on retire d'abord l'intention
    // d'écrire ses séries, sinon la vidange écrirait les séries d'une séance
    // supprimée — et les recréerait par la clé étrangère.
    attente = Attente.retirer(attente, Attente.cleDe(Attente.SETS, id));
    // ⚠️ ON RETIRE, ON NE FAIT PAS TABLE RASE (chantier 36).
    // `Cache.remplacerTout` VIDE le magasin puis le réécrit — `cache.js` le
    // réserve explicitement aux magasins petits et rafraîchis en entier, et dit
    // que « les 28 103 séries ne passent pas par ici ». Supprimer UNE séance
    // réécrivait donc les 28 103 lignes, et une fermeture d'app au mauvais
    // moment laissait le magasin à moitié plein, définitivement.
    var partantes = (local.series || [])
      .filter(function (s) { return s && s.session_id === id; })
      .map(function (s) { return s.id; });
    local.seances = local.seances.filter(function (s) { return s.id !== id; });
    local.series = local.series.filter(function (s) { return s.session_id !== id; });
    rangerSeances();
    // ⚠️ ET L'INDEX AUSSI. `local.parSeance` est construit une fois et n'était
    // pas refait ici : il gardait les séries d'une séance supprimée, donc
    // `seriesDe(id)` continuait de les rendre. Même famille que le reste.
    indexerParSeance();
    recalculerEtats();
    await Cache.remplacerTout('seances', local.seances).catch(function () {});
    if (partantes.length) await Cache.supprimer('series', partantes).catch(function () {});
    await poser({ table: Attente.SESSIONS, op: Attente.SUPPRIMER, id: id });
    afficherSemaine(lundiAffiche);
  }

  // §7 octies.2 — rouvrir pour corriger. Voir `THSeance.reprendre` : la séance
  // RESTE `terminee` pendant l'édition.
  // ⚠️ LA FENÊTRE DU CACHE PÉRIMÉ (chantier 34).
  //
  // `VERSION_SYNC` force une passe complète après la mise à jour, mais l'app
  // s'ouvre AVANT que cette passe soit finie : entre les deux, le cache porte
  // encore des lignes écrites par la version d'avant — sans `source`. Or c'est
  // `source` qui dit à `Seance.partEnBase` qu'une série importée doit rester
  // en base. Sans lui, elle est réputée absente, et « Enregistrer » l'efface :
  // le défaut qu'on vient de corriger, rejoué depuis le disque.
  //
  // On refuse donc de rouvrir une séance dont les séries ne portent pas encore
  // leur provenance. Aucune requête réseau ici — le geste doit rester possible
  // hors ligne dès que le cache est complet, et une lecture qui échoue ne doit
  // pas décider à la place de l'utilisateur.
  //
  // ⚠️ ET PAS DAVANTAGE UNE SÉANCE DONT AUCUNE SÉRIE N'EST ARRIVÉE (chantier 47).
  // `provenanceIncomplete` parle de la provenance de séries qui EXISTENT : elle
  // rend faux sur une liste vide, et c'est juste pour ce qu'elle dit. La
  // question posée ici est plus large, et c'est `Seance.seriesIncompletes` qui
  // la porte désormais — la même que la carte et que le détail consultent.
  // Cette garde reste : c'est la dernière avant l'écriture, et une troisième
  // surface qui oublierait de demander ne doit pas pouvoir effacer.
  function seriesIncompletes(id) { return Seance.seriesIncompletes(seriesDe(id)); }

  function modifierSeance(ligne, blocs) {
    if (seanceEnCoursBloque()) return;
    if (seriesIncompletes(ligne.id)) {
      Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
        titre: 'Séance pas encore complète',
        aide: 'Ses séries finissent d\u2019arriver. Réessaie dans un instant — ' +
          'la corriger maintenant risquerait d\u2019en perdre.',
        libelle: 'Compris',
        surConfirmer: fermerVoile,
        surAnnuler: fermerVoile
      });
      ouvrirVoile($('feuille-seance'));
      return;
    }
    seance = Seance.reprendre(ligne, blocs);
    chrono = null;
    sauverSeance();
    // ⚠️ REMPLACER, PAS EMPILER (chantier 47) — comme `refaireSeance` juste en
    // dessous, et comme les CINQ autres entrées dans l'onglet Saisie. Ces deux
    // lignes-ci étaient les seules à empiler, et c'est ce qui rendait le retour
    // faux : un aller-retour « Modifier → Enregistrer » laissait deux entrées
    // de plus, si bien que « ← Séances » remontait sur /saisie au lieu des
    // séances. Un écran qu'on rouvre pour corriger n'est pas un cran de plus
    // dans le parcours — c'est le même endroit, dans un autre mode.
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
  }

  // Enregistrer une modification : les mêmes écritures qu'une fin de séance,
  // sans la fin. Pas de question de routine — une séance passée a pu diverger
  // depuis longtemps, et la routine d'aujourd'hui n'est plus celle du jour-là.
  async function enregistrerEdition() {
    var id = seance.id;
    await poserSeries();
    await poserSeance(false);
    adopterLocalement(seance);
    seance = null; chrono = null;
    arreterMinuteur();
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConsignes();
    // Enregistrer une correction est un RETOUR, pas une navigation : on revient
    // d'où l'on vient, on n'empile pas une seconde fois le détail.
    allerA(Routeur.SEANCE, { id: id }, true);
    rendreDetail(id);
  }

  // §7 octies.3 — « Refaire » ne copie pas dans l'historique : il DÉMARRE une
  // séance neuve avec la même structure et les mêmes notes. Aucune charge.
  async function refaireSeance(ligne, blocs) {
    if (seanceEnCoursBloque()) return;
    seance = Seance.refaire({
      id: uuid(),
      userId: sessionActive && sessionActive.user && sessionActive.user.id,
      titre: ligne.titre || null,
      blocs: blocs,
      idSerie: uuid
    });
    chrono = null;
    await sauverSeance();
    await poserSeance(true);
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
  }

  // ── Entrée ───────────────────────────────────────────────────────────────
  //
  // L'entrée est appelée DEUX fois au démarrage : une fois par `demarrer` qui
  // lit la session courante, une fois par le rappel d'authentification qui
  // rejoue l'état initial. Sans garde, la seconde recharge un cache encore
  // vide et ÉCRASE en mémoire ce que la première venait de synchroniser —
  // puis réécrit ce vide dans le cache. Défaut révélé par le compte de
  // contrôle de ce commit, qui annonçait « 2500 séries manquantes » sur un
  // cache pourtant complet.
  var entreeEnCours = null;

  // ⚠️ LA RÉ-ENTRÉE DU MÊME UTILISATEUR NE RELIT PLUS LE DISQUE (30/09/2026).
  //
  // Le SDK émet `SIGNED_IN` à CHAQUE retour au premier plan — chaque
  // déverrouillage du téléphone, en pleine séance. L'entrée complète relisait
  // alors la séance, la file et les paris depuis le disque, après un
  // `chargerCache` de tout l'historique : ce qui était posé en mémoire pendant
  // la lecture était écrasé par l'état d'avant. Séance du 29/09 : trois paris
  // du coach perdus — posés une seule fois (`dejaNote`), ils ne revenaient
  // jamais —, et une observation orpheline qui a bloqué la file (#336).
  //
  // Pour l'utilisateur DÉJÀ ENTRÉ, la mémoire est la vérité : on met à jour la
  // session (le jeton), on synchronise, on vide la file. La première entrée,
  // et celle d'un autre compte, restent complètes.
  var entreeFaitePour = null;

  function idDeSession(session) {
    return (session && session.user && session.user.id) || null;
  }

  function entrer(session) {
    if (entreeEnCours) return entreeEnCours;
    var uid = idDeSession(session);
    entreeEnCours = uid && uid === entreeFaitePour ? reentrer(session) : entrerVraiment(session);
    entreeEnCours.catch(function () {}).then(function () { entreeEnCours = null; });
    return entreeEnCours;
  }

  async function reentrer(session) {
    sessionActive = session;
    await synchroniser();
    vidanger();
    rendreEtatSync();
    // Comme à la fin de l'entrée complète : une synchronisation de fond ne
    // reprend jamais la main sur un écran en cours d'édition.
    if (!vues.detail.hidden || !vues.routine.hidden || !vues.seance.hidden) return;
    rendreRoute(Routeur.analyser(racine.location.pathname));
  }

  async function entrerVraiment(session) {
    sessionActive = session || null;
    var userId = session && session.user && session.user.id;
    try {
      await garantirProprietaire(userId);
      await chargerCache();
    } catch (e) {
      console.warn('Cache local indisponible :', texteErreur(e));
    }

    // La séance en cours et la file, AVANT tout rendu et AVANT tout réseau.
    // C'est ce qui fait qu'une app tuée en pleine séance rouvre sur la séance,
    // hors ligne comme en ligne.
    lireModeRPE();
    lireSourdine();
    // ⚠️ AVANT LA MOINDRE ÉCRITURE (chantier 34). Si ce qui s'écrit et ce qui
    // se relit divergeaient, la première correction de séance perdrait des
    // colonnes en silence. On l'apprend ici, au démarrage, et bruyamment.
    Seance.verifierColonnes();
    await chargerSeanceLocale();
    await chargerBrouillonLocal();
    // AVANT tout rendu et AVANT tout réseau, comme la lecture qui précède : une
    // file bloquée par le défaut du chantier 32 se répare ici, sinon elle
    // resterait bloquée pour toujours (voir `reparerIdentifiantsManquants`).
    await reparerIdentifiantsManquants();
    await reparerFileHorsBornes();
    await reparerFileConflitsEnCours();
    // La mémoire est chargée : désormais, pour ce compte, c'est elle qui fait
    // foi (`entrer`).
    entreeFaitePour = userId || null;

    // Ouverture immédiate sur ce qu'on a déjà, avant toute requête réseau.
    // On honore l'URL d'entrée : un rechargement direct sur /semaine/… ou
    // /seance/… rouvre la bonne vue, pas systématiquement la semaine courante.
    await chargerProfilLocal();

    var routeInitiale = Routeur.analyser(racine.location.pathname);
    if (Routeur.interditAvecSession(routeInitiale.vue) || routeInitiale.repli) {
      routeInitiale = { vue: Routeur.RACINE, params: {} };
      allerA(Routeur.RACINE, {}, true);
    }

    // ⚠️ L'ONBOARDING EST UNE RÈGLE DE ROUTAGE, PAS UN ÉCRAN (§4). Un profil
    // jamais vu ouvre sur le profil ; tout le reste ouvre où l'URL dit. La
    // décision se prend sur ce qu'on a EN LOCAL, donc sans attendre le réseau —
    // et un profil inconnu (cache vide, premier démarrage hors ligne) ne
    // déclenche rien : on n'ouvre pas un formulaire sur une supposition.
    if (Profil.doitOuvrirProfil(profil)) {
      routeInitiale = { vue: Routeur.PROFIL, params: {} };
      allerA(Routeur.PROFIL, {}, true);
    }

    etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });

    // ⚠️ UNE SÉANCE EN COURS S'AFFICHE TOUT DE SUITE, quoi qu'il y ait en cache.
    //
    // Le repli « Première synchronisation… » ne valait que pour un cache vide en
    // LECTURE. Il n'a rien à faire ici : quelqu'un qui rouvre l'app en salle,
    // hors réseau, après un appel entrant, doit retrouver sa séance
    // immédiatement — pas après que le SDK ait fini de renoncer, ce qui prend
    // plusieurs secondes. Pendant ces secondes, il croit l'avoir perdue.
    //
    // Défaut trouvé au banc d'écran, pas en test : la mesure unitaire relit le
    // disque et conclut « tout est là », alors que l'écran, lui, montrait autre
    // chose.
    // ⚠️ LA SÉANCE EN COURS EN BASE SE VÉRIFIE AVANT LA SYNCHRONISATION
    // COMPLÈTE (26/09/2026), et avant que « Démarrer » soit possible.
    //
    // Elle se vérifiait APRÈS `synchroniser()` : des secondes — une première
    // synchro, bien plus —, pendant lesquelles l'écran des routines offrait
    // « Démarrer ». Le 26/09, une séance B a été lancée dans cette fenêtre
    // alors que A était encore ouverte en base : 409, et B n'a existé que sur
    // le téléphone jusqu'à « Terminer ».
    //
    // Une lecture légère, lancée ICI sans être attendue : l'écran s'ouvre
    // toujours sur ce qu'on a en local, hors ligne compris. Ce qui l'attend,
    // c'est `chargerRoutines` — or sans routines, pas de « Démarrer ». Hors
    // ligne, la lecture échoue vite et ne bloque rien : si une séance naît
    // quand même face à une autre ouverte, la vidange résout le conflit.
    verificationSeance = resoudreSeanceEnCoursDistante().catch(function () {});

    if (seance || local.seances.length) rendreRoute(routeInitiale);
    else { montrer('liste', Routeur.RACINE); Rendu.message($('liste-seances'), 'Première synchronisation…'); }

    // L'ancre s'installe dès l'ouverture, QUELLE QUE SOIT la vue d'entrée :
    // au fond de la pile, un retour ne déclenche aucun popstate, il ferme.
    // Y compris sur une ouverture directe sur /semaine/… — qui, jusqu'ici,
    // n'avait pas d'ancre et se fermait donc sans absorption.
    sortie.apresNavigation(false);

    await verificationSeance;
    await synchroniser();
    // ⚠️ VOLONTAIREMENT PAS ATTENDU, comme `vidanger()` plus bas. Une ligne de
    // 300 octets n'a aucune raison de retarder le rendu final — et hors réseau,
    // où chaque tentative dure des secondes, l'attendre retarde le moment où
    // l'écran DIT qu'il n'y a pas de réseau. Trouvé au banc, pas en test : la
    // mesure unitaire ne voit pas une seconde de plus, l'écran si.
    // Le profil sait se rendre tout seul quand il arrive.
    chargerProfil();
    // La séance `en_cours` restée en base est déjà résolue (ch. 36, D7) : la
    // vérification ci-dessus a précédé la synchronisation. Et si elle a échoué,
    // le conflit se résout à la vidange elle-même.
    vidanger();   // le réseau vient de répondre : c'est le moment d'envoyer
    // L'outil de rejeu (développement seulement) : après la synchronisation,
    // l'historique est là.
    if (rejeuDemande) ouvrirRejeu();
    // L'utilisateur est parti ailleurs pendant la synchro. Re-rendre écraserait
    // son écran — et, sur l'éditeur de routine, le brouillon qu'il est en train
    // de remplir. Une synchronisation de fond ne reprend jamais la main.
    if (!vues.detail.hidden || !vues.routine.hidden || !vues.seance.hidden) return;
    rendreRoute(Routeur.analyser(racine.location.pathname));
  }

  // Déconnexion EXPLICITE : le cache de ce compte part avec elle. Une session
  // qui expire toute seule, en revanche, ne doit rien effacer — on revient à
  // l'écran de connexion et les données restent là pour la prochaine ouverture.
  async function deconnecter() {
    // Avant toute chose : plus de session, donc plus aucune vue authentifiée
    // rendue — y compris par un retour qui atterrirait sur une ancienne entrée.
    sessionActive = null;
    // La prochaine entrée, même du même compte, repart du disque (vidé).
    entreeFaitePour = null;
    try { await Cache.viderTout(); } catch (e) { /* rien à garder de toute façon */ }
    local = { seances: [], series: [], exercices: [], pesees: [], zones: [],
              predictions: [], sousConsigne: {}, parisLegers: [], escalier: [], parSeance: null };
    notesEnCours = {};
    // Les routines vivent en mémoire, pas dans le cache — mais elles
    // appartiennent quand même au compte qui part.
    routines = []; brouillon = null; etatRoutines = { code: 'jamais', message: '' };
    seance = null; attente = []; chrono = null; arreterMinuteur();
    // Le profil appartient au compte qui part, et son envoi en attente avec lui :
    // rejouer une modification de profil sur le compte suivant serait pire que
    // de la perdre.
    profil = null; profilAEnvoyer = false; pseudoAInscrire = null;
    datesExercices = null;
    try { await Auth.deconnecter(); } catch (e) { /* le jeton part quand même */ }
    allerA(Routeur.CONNEXION, {}, true);
    rendreEntree('connexion');
  }

  function enregistrerSW() {
    if (!('serviceWorker' in racine.navigator)) return;
    // Chemins absolus : depuis /semaine/… un chemin relatif viserait
    // /semaine/service-worker.js, qui n'existe pas.
    racine.navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(function (e) { console.warn('SW non enregistré :', e && e.message); });
  }


  // ══ LE PROFIL (chantier 46 §2) ═══════════════════════════════════════════
  //
  // ⚠️ L'ONBOARDING, C'EST LE PROFIL (ECRAN-PROFIL-V1 §4). Pas de formulaire
  // séparé : un compte neuf arrive sur le profil aux champs vides, marqués
  // « à renseigner ». Même écran, même code — et c'est une RÈGLE DE ROUTAGE,
  // pas un écran de plus.
  //
  // Le v1 avait un ordonnanceur d'entrée de plusieurs centaines de lignes
  // (CLAUDE.md §9, chantier 7) pour tenir un tunnel de première visite. Ici il
  // n'y a pas de tunnel : il y a un écran, qu'on ouvre d'abord une fois, et
  // dont on peut sortir tout de suite.

  var profil = null;            // la ligne `profiles`, telle qu'on la connaît
  var profilAEnvoyer = false;   // une modification faite hors réseau attend
  var pseudoAInscrire = null;   // le pseudo saisi à l'inscription, pas encore posé
  var CLE_PROFIL = 'profil';
  var CLE_PROFIL_ENVOI = 'profil-a-envoyer';

  // ⚠️ LE CACHE D'ABORD, LE RÉSEAU ENSUITE, ET JAMAIS D'ATTENTE. Le profil
  // s'affiche hors ligne comme le reste : il tient dans le magasin `meta`, qui
  // existe depuis la version 1 du cache — aucune montée de version ici.
  async function chargerProfilLocal() {
    try {
      var v = await Cache.lireMeta(CLE_PROFIL);
      if (v) profil = v;
      profilAEnvoyer = !!(await Cache.lireMeta(CLE_PROFIL_ENVOI));
    } catch (e) { /* cache indisponible : on repartira du réseau */ }
  }

  async function sauverProfilLocal() {
    try {
      await Cache.ecrireMeta(CLE_PROFIL, profil);
      await Cache.ecrireMeta(CLE_PROFIL_ENVOI, profilAEnvoyer);
    } catch (e) { /* rien à faire : la copie réseau reste la référence */ }
  }

  function userId() {
    return (sessionActive && sessionActive.user && sessionActive.user.id) || null;
  }

  // Le profil distant. S'il n'existe pas, ON LE CRÉE — relevé sur `pg_trigger` :
  // AUCUN trigger ne pose la ligne à la création du compte, donc un compte tout
  // neuf n'a pas de profil et personne ne le posera à notre place.
  async function chargerProfil() {
    var id = userId();
    if (!id) return;
    var distant = null;
    try { distant = await Donnees.monProfil(id); }
    catch (e) { return; }   // hors réseau : ce qu'on a en cache fait l'affaire

    if (!distant) {
      try {
        distant = await Donnees.enregistrerProfil(id, Profil.champsEcrits({
          username: pseudoAInscrire || null,
          onboarding_completed: false
        }));
      } catch (e) { return; }
    }
    pseudoAInscrire = null;
    // Une modification locale non envoyée PRIME sur ce que le serveur rend :
    // sinon un aller-retour hors réseau la perdrait en silence, et c'est la
    // famille de défauts que le chantier 32 a coûté.
    if (profilAEnvoyer) { await envoyerProfil(); return; }
    profil = distant;
    await sauverProfilLocal();
    if (ecranCourant === 'profil') rendreProfilEcran();
  }

  async function envoyerProfil() {
    var id = userId();
    if (!id || !profil) return;
    try {
      var rendu = await Donnees.enregistrerProfil(id, Profil.champsEcrits(profil));
      profil = rendu;
      profilAEnvoyer = false;
      await sauverProfilLocal();
      if (ecranCourant === 'profil') rendreProfilEcran();
    } catch (e) {
      // Elle repartira : à la prochaine synchronisation, au prochain démarrage,
      // ou au retour du réseau. Rien n'est perdu — la valeur est en local et
      // l'intention est sur disque.
      profilAEnvoyer = true;
      await sauverProfilLocal();
    }
  }

  // Le seul chemin d'écriture. Local d'abord — l'écran dit la vérité tout de
  // suite et hors ligne — puis le réseau.
  //
  // ⚠️ POSER ET RENDRE SONT SÉPARÉS, et ce n'est pas du zèle. `marquerProfilVu`
  // écrit depuis `montrer`, AU MOMENT OÙ L'ON QUITTE LE PROFIL : s'il passait
  // par `rendreProfilEcran`, il rappellerait `montrer('profil')` et ramènerait
  // l'écran qu'on vient de quitter. Un écran qui se rouvre tout seul quand on
  // en sort est exactement le genre de défaut qu'aucun test unitaire ne voit.
  async function poserProfil(champs) {
    profil = Object.assign({}, profil || {}, Profil.champsEcrits(champs));
    profilAEnvoyer = true;
    await sauverProfilLocal();
    await envoyerProfil();
  }

  function ecrireProfil(champs) {
    var promesse = poserProfil(champs);   // `profil` est à jour avant le 1er await
    rendreProfilEcran();
    return promesse;
  }

  // ── La déclaration des quinze champs ─────────────────────────────────────
  //
  // ⚠️ UNE TABLE, PAS QUINZE FONCTIONS. Chaque entrée dit sa colonne, sa
  // feuille et comment se lit sa valeur ; `rendreProfil` ne connaît aucune de
  // ces colonnes et les feuilles n'en connaissent qu'une à la fois. Ajouter un
  // champ, c'est une ligne ici — pas une ligne dans le rendu, une dans le
  // routeur et une dans le HTML.
  function listeDe(cle) {
    if (cle === 'mode_entrainement') return Profil.DISCIPLINES;
    if (cle === 'materiel') return Profil.MATERIELS;
    if (cle === 'anciennete') return Profil.ANCIENNETES;
    if (cle === 'niveau_declare') return Profil.NIVEAUX;
    if (cle === 'sexe') return Profil.SEXES;
    if (cle === 'unites') return Profil.UNITES;
    return [];
  }

  function valeurProfil(cle) { return profil ? profil[cle] : null; }

  // Les listes fermées. `effacable` dit si la colonne accepte NULL : `sexe`,
  // `mode_entrainement` et `unites` sont NOT NULL en base — leur proposer
  // « Effacer » serait promettre une écriture que Postgres refuserait en 23502.
  var CHOIX = {
    mode_entrainement: { titre: 'Discipline', effacable: false,
      aide: 'Elle décide de ce que le moteur cherchera à faire progresser.' },
    materiel: { titre: 'Matériel', effacable: true,
      aide: 'Il décide quels exercices peuvent être proposés.' },
    anciennete: { titre: 'Entraînement régulier', effacable: true,
      aide: 'Depuis quand tu t’entraînes RÉGULIÈREMENT — pas depuis ta première séance. On peut s’entraîner depuis cinq ans et rester débutant.' },
    niveau_declare: { titre: 'Niveau déclaré', effacable: true,
      aide: 'Ce que tu en dis. Rien ne le vérifie et rien ne le contredit.' },
    sexe: { titre: 'Sexe', effacable: false,
      aide: 'Entrée du référentiel de force. « Non précisé » est une réponse, pas un trou.' },
    unites: { titre: 'Unités', effacable: false, aide: null }
  };

  function ouvrirChoixProfil(cle) {
    var def = CHOIX[cle];
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: def.titre,
        aide: def.aide,
        options: listeDe(cle),
        valeur: valeurProfil(cle),
        surChoix: function (v) { fermerVoile(); ecrireProfil(defObjet(cle, v)); },
        surEffacer: def.effacable
          ? function () { fermerVoile(); ecrireProfil(defObjet(cle, null)); } : null,
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Les nombres à liste fermée : séances par semaine (1 à 14, `profiles_rythme_borne`)
  // et durée visée. Une molette serait plus jolie ; une liste est plus honnête —
  // on voit les huit valeurs d'un coup et on sait ce qu'on choisit.
  function optionsNombre(valeurs, suffixe) {
    return valeurs.map(function (v) { return { cle: v, libelle: v + suffixe }; });
  }

  // ⚠️ CE « RYTHME »-LÀ EST « TA SEMAINE » — séances par semaine et durée,
  // borné par `profiles_rythme_borne`. À NE PAS CONFONDRE avec
  // `rythme_progression` (MOTEUR §9.8), qui règle la vitesse de montée du
  // moteur et vit dans la section « TON RYTHME ». Les noms internes gardent
  // l'ancien mot ; seuls les libellés d'écran ont été dé-confondus.
  function ouvrirRythmeProfil(cle) {
    var seances = cle === 'seances_par_semaine';
    var valeurs = [];
    if (seances) {
      for (var i = Profil.SEANCES_MIN; i <= Profil.SEANCES_MAX; i++) valeurs.push(i);
    } else valeurs = Profil.DUREES;
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: seances ? 'Séances par semaine' : 'Durée d’une séance',
        aide: seances
          ? 'Ce que tu VISES, pas ce que tu fais — le compte réel, lui, se lit dans tes séances.'
          : 'Une durée visée, pour un générateur de programme qui arrive au chantier 5.',
        options: optionsNombre(valeurs, seances ? '' : ' min'),
        valeur: valeurProfil(cle),
        surChoix: function (v) { fermerVoile(); ecrireProfil(defObjet(cle, v)); },
        surEffacer: function () { fermerVoile(); ecrireProfil(defObjet(cle, null)); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  function ouvrirJoursProfil() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleJours(cible, {
        jours: Profil.JOURS,
        valeur: Profil.joursValides(valeurProfil('jours_vises')),
        aide: 'Les jours où tu comptes t’entraîner. Aucune alarme si tu t’en écartes.',
        surValider: function (liste) {
          fermerVoile();
          var propres = Profil.joursValides(liste);
          ecrireProfil({ jours_vises: propres.length ? propres : null });
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Les saisies libres. Chacune rend une PHRASE quand elle refuse — jamais un
  // silence, jamais une fermeture. La borne doublée ici est un CHECK de la base.
  var SAISIES = {
    taille_cm: {
      titre: 'Taille', type: 'text', inputMode: 'numeric', etiquette: 'En centimètres',
      aide: 'Entrée du référentiel de force, avec l’âge, le sexe et le poids.',
      lire: function (p) { return p.taille_cm; },
      valider: function (v) {
        if (!String(v).trim()) return { champs: { taille_cm: null } };
        var n = Profil.tailleValide(String(v).replace(',', '.'));
        if (n === null) {
          return { erreur: 'Une taille entre ' + Profil.TAILLE_MIN + ' et ' +
                           Profil.TAILLE_MAX + ' cm.' };
        }
        return { champs: { taille_cm: n } };
      }
    },
    date_naissance: {
      titre: 'Date de naissance', type: 'date', etiquette: 'Jour de naissance',
      aide: 'L’âge change les bornes du référentiel. Il n’est jamais affiché à personne d’autre.',
      lire: function (p) { return p.date_naissance; },
      valider: function (v) {
        if (!String(v).trim()) return { champs: { date_naissance: null } };
        var d = Profil.naissanceValide(String(v).trim(), new Date());
        if (!d) return { erreur: 'Une date de naissance plausible.' };
        return { champs: { date_naissance: d } };
      }
    },
    bio: {
      titre: 'Bio', lignes: 3, max: 280, etiquette: 'Deux lignes sur toi',
      placeholder: 'Powerbuilding, 3 ans',
      aide: 'Elle ne sera visible que le jour où le social existera, et seulement si tu l’ouvres.',
      lire: function (p) { return p.bio; },
      valider: function (v) { return { champs: { bio: String(v).trim() } }; }
    },
    username: {
      titre: 'Pseudo', type: 'text', etiquette: 'Ton pseudo',
      aide: 'Il sert d’identifiant lisible partout. Ton e-mail, lui, reste privé.',
      lire: function (p) { return p.username; },
      valider: function (v) {
        var verdict = Profil.verdictPseudo(v, null, {});
        if (verdict.code === 'vide') return { erreur: 'Un pseudo, même court.' };
        if (verdict.message) return { erreur: verdict.message };
        return { champs: { username: verdict.pseudo } };
      }
    }
  };

  function ouvrirSaisieProfil(cle) {
    var def = SAISIES[cle];
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleSaisie(cible, {
        titre: def.titre, aide: def.aide, etiquette: def.etiquette,
        type: def.type, inputMode: def.inputMode, lignes: def.lignes,
        max: def.max, placeholder: def.placeholder,
        valeur: def.lire(profil || {}),
        surValider: function (v) {
          var r = def.valider(v);
          if (r.erreur) return r.erreur;
          fermerVoile();
          ecrireProfil(r.champs);
          return null;
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Promis à l'inscription : « Tu le changeras depuis ton profil. » C'est aussi
  // là qu'atterrit un lien « mot de passe oublié » — la session de récupération
  // est ouverte, il ne reste qu'à poser le nouveau mot de passe.
  function ouvrirMotDePasseProfil() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleSaisie(cible, {
        titre: 'Mot de passe', etiquette: 'Nouveau mot de passe',
        type: 'password', autocomplete: 'new-password',
        aide: Profil.MDP_MIN + ' caractères minimum.',
        valeur: '',
        surValider: function (v) {
          if (!Profil.mdpValide(v)) return Profil.MDP_MIN + ' caractères minimum.';
          fermerVoile();
          Auth.changerMotDePasse(v).then(function () {
            Rendu.message($('profil-corps'), '', 'rien');
            rendreProfilEcran();
          }).catch(function (e) {
            rendreProfilEcran();
            var err = Rendu.el('p', 'feuille-err', texteErreur(e));
            $('profil-corps').insertBefore(err, $('profil-corps').firstChild);
          });
          return null;
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ⚠️ LA MÊME FEUILLE, LE MÊME VOILE que la séance. Le retour d'Android la
  // ferme sans qu'on l'écrive, et le mode Réorganiser ne la traverse pas.
  var feuilleProfil = null;

  function ouvrirFeuilleProfil() {
    if (!feuilleProfil) return;
    feuilleProfil($('feuille-contenu'));
    ouvrirVoile($('feuille-seance'), function () { feuilleProfil = null; });
  }

  // ── L'écran ──────────────────────────────────────────────────────────────

  function nombreGroupe(n) {
    // Espace INSÉCABLE FIN comme séparateur de milliers : c'est la typographie
    // française, et un espace ordinaire casserait « 28 404 » en bout de ligne.
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function ligneChoix(cle, libelle, sous) {
    return { libelle: libelle, sous: sous,
      valeur: Profil.libelleDe(cle === 'mode_entrainement'
        ? Profil.DISCIPLINES_CONNUES : listeDe(cle), valeurProfil(cle)),
      surChoix: function () { ouvrirChoixProfil(cle); } };
  }

  function rendreProfilEcran() {
    montrer('profil', Routeur.PROFIL);
    var p = profil || {};
    var resumePoids = Poids.resume(local.pesees);
    var stats = Profil.statsDe(local.seances, local.series, new Date());

    $('profil-rond').textContent = Profil.initiale(p.username);
    $('profil-nom').textContent = p.username || 'Ton profil';
    $('profil-sous').textContent =
      Profil.sousTitre(p, resumePoids ? resumePoids.poids : null, new Date());

    var exos = compterExercices();

    Rendu.rendreProfil($('profil-corps'), {
      // « Contournable, obligatoirement » : le bandeau ne s'affiche QUE tant que
      // le profil n'a pas été vu une première fois, et il porte sa propre sortie.
      accueil: p.onboarding_completed === false
        ? { surPlusTard: function () { marquerProfilVu(); afficherSaisie(); } } : null,
      kpis: [
        { valeur: nombreGroupe(stats.seances), libelle: 'séances' },
        { valeur: nombreGroupe(stats.series), libelle: 'séries' },
        { valeur: Profil.libelleAnciennete(stats.annees), libelle: 'd’historique' }
      ],
      sections: [
        { titre: 'CE QUE JE FAIS', lignes: [
          ligneChoix('mode_entrainement', 'Discipline'),
          ligneChoix('materiel', 'Matériel', 'Décide des exercices proposés')
        ] },
        { titre: 'POURQUOI',
          segment: {
            options: Profil.INTENTIONS,
            valeur: p.intention || 'progresser',
            surChoix: function (v) { ecrireProfil({ intention: v }); }
          },
          note: { fort: 'Le moteur propose des charges',
                  reste: 'en mode Progresser. En Entretenir, il se tait sur la ' +
                         'charge et garde le repos et la structure.' } },
        // ── MOTEUR §9.8 / ECRAN-PROFIL §2.3 — « TON RYTHME » ───────────────
        //
        // Le MÊME sélecteur que l'intention juste au-dessus (§2.3, tranché le
        // 19/09) : deux composants pour deux réglages voisins donneraient deux
        // langages sur le même écran.
        //
        // ⚠️ LA SECTION SE CONSTRUIT DANS `profil.js`, ET C'EST VOULU. Elle
        // porte une RÈGLE — absente en Entretenir — et une COLONNE écrite ;
        // ici, rien ne les exercerait (`rendreProfilEcran` n'est pas testable).
        // `null` en Entretenir, et `rendreProfil` saute les sections absentes.
        Profil.sectionRythme(p, ecrireProfil),
        // MOTEUR §9.16 (49-U11) — « TA PHASE », à côté du rythme : le même
        // sélecteur, la même écriture (`ecrireProfil`, par la file du profil).
        Profil.sectionPhase(p, ecrireProfil),
        { titre: 'DEPUIS QUAND', lignes: [
          ligneChoix('anciennete', 'Entraînement régulier'),
          ligneChoix('niveau_declare', 'Niveau déclaré')
        ] },
        { titre: 'MES EXERCICES', lignes: [
          { libelle: 'Tous mes exercices', sansValeur: true,
            sous: exos.total + ' au catalogue · ' + exos.faits + ' déjà faits',
            surChoix: function () { allerA(Routeur.EXERCICES, {}); rendreMesExercices(); } }
        ] },
        { titre: 'MON CORPS', lignes: [
          // Le poids n'est pas un champ du profil : il a 116 pesées derrière lui
          // et son propre écran. La ligne MÈNE, elle ne saisit pas.
          { libelle: 'Poids',
            sous: resumePoids ? resumePoids.nb + ' pesée' + (resumePoids.nb > 1 ? 's' : '') : null,
            valeur: resumePoids ? String(resumePoids.poids).replace('.', ',') + ' kg' : null,
            surChoix: function () { allerA(Routeur.POIDS, {}); rendrePoids(); } },
          { libelle: 'Taille', valeur: p.taille_cm ? p.taille_cm + ' cm' : null,
            surChoix: function () { ouvrirSaisieProfil('taille_cm'); } },
          { libelle: 'Date de naissance',
            valeur: p.date_naissance ? Rendu.dateCourte(p.date_naissance) : null,
            surChoix: function () { ouvrirSaisieProfil('date_naissance'); } },
          ligneChoix('sexe', 'Sexe')
        ] },
        // ⚠️ « TA SEMAINE », ET PLUS « RYTHME VISÉ » (ECRAN-PROFIL §2.4, renommé
        // le 19/09). Ce bloc-ci parle de séances par semaine ; « rythme »
        // désigne désormais le réglage de progression, juste au-dessus. Deux
        // sections nommées « rythme » sur le même écran ne parleraient pas de
        // la même chose.
        { titre: 'TA SEMAINE', lignes: [
          { libelle: 'Séances par semaine', valeur: p.seances_par_semaine || null,
            surChoix: function () { ouvrirRythmeProfil('seances_par_semaine'); } },
          { libelle: 'Jours', valeur: Profil.libelleJours(p.jours_vises),
            surChoix: ouvrirJoursProfil },
          { libelle: 'Durée d’une séance',
            valeur: p.duree_seance_min ? p.duree_seance_min + ' min' : null,
            surChoix: function () { ouvrirRythmeProfil('duree_seance_min'); } }
        ] },
        { titre: 'L’APP', lignes: [
          ligneChoix('unites', 'Unités'),
          { libelle: 'Pseudo', valeur: p.username || null,
            surChoix: function () { ouvrirSaisieProfil('username'); } },
          { libelle: 'Bio', valeur: p.bio || null,
            surChoix: function () { ouvrirSaisieProfil('bio'); } },
          // L'e-mail se LIT, il ne se change pas d'ici : le changer demande une
          // confirmation sur les deux adresses, et c'est un geste à part entière.
          { libelle: 'E-mail de connexion',
            valeur: (sessionActive && sessionActive.user && sessionActive.user.email) || null },
          { libelle: 'Mot de passe', valeur: '••••••••', surChoix: ouvrirMotDePasseProfil }
        ] }
      ],
      surQuitter: demanderDeconnexion,
      surSupprimer: demanderSuppressionCompte
    });
  }

  // Le profil a été VU : le bandeau d'accueil ne revient plus. C'est le seul
  // effet de « première connexion » — pas un drapeau qui gouvernerait un tunnel.
  function marquerProfilVu() {
    if (!profil || profil.onboarding_completed !== false) return;
    poserProfil({ onboarding_completed: true });
  }

  // ── Quitter, et supprimer ────────────────────────────────────────────────

  function demanderDeconnexion() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleConfirmer(cible, {
        titre: 'Quitter',
        aide: 'Tes données restent en ligne. Elles reviendront à la prochaine ' +
              'connexion — mais cet appareil les oublie, donc il te faudra du réseau.',
        libelle: 'Quitter',
        surConfirmer: function () { fermerVoile(); deconnecter(); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ⚠️ LA CONFIRMATION DIT CE QUI PART, en chiffres réels. « Es-tu sûr ? » ne
  // dit rien ; « 1 221 séances et 28 103 séries » se comprend sans réfléchir.
  function demanderSuppressionCompte() {
    var stats = Profil.statsDe(local.seances, local.series, new Date());
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleConfirmer(cible, {
        titre: 'Supprimer mon compte',
        aide: 'Partent définitivement : ton profil, tes ' +
              nombreGroupe(stats.seances) + ' séances et leurs ' +
              nombreGroupe(stats.series) + ' séries, tes ' +
              (local.pesees || []).length + ' pesées, tes routines. ' +
              'Rien n’est conservé et rien ne se récupère.',
        libelle: 'Supprimer définitivement',
        danger: true,
        surConfirmer: function () { fermerVoile(); supprimerCompte(); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  async function supprimerCompte() {
    var id = userId();
    if (!id) return;
    Rendu.message($('profil-corps'), 'Suppression en cours…', 'rien');
    try {
      // La fonction de base sait ce qui part — on ne réécrit pas une suppression
      // en plusieurs DELETE côté client : c'est ainsi qu'on en oublie un.
      await Donnees.supprimerCompte(id);
    } catch (e) {
      rendreProfilEcran();
      $('profil-corps').insertBefore(
        Rendu.el('p', 'feuille-err', 'Suppression impossible : ' + texteErreur(e)),
        $('profil-corps').firstChild);
      return;
    }
    // Le local part avec le distant. `deconnecter` vide déjà tout le cache,
    // magasin `meta` compris — donc le profil, la file et le brouillon.
    profil = null; profilAEnvoyer = false;
    await deconnecter();
  }

  // ── Tous mes exercices (§2.4 bis) ────────────────────────────────────────
  //
  // Le tri se fait sur la DERNIÈRE séance où l'exercice apparaît. Un balayage
  // des 28 000 séries, fait UNE FOIS à l'ouverture de l'écran et gardé : le
  // refaire à chaque frappe de la recherche rendrait le champ poussif.
  var datesExercices = null;

  function calculerDatesExercices() {
    var parSeance = {};
    (local.seances || []).forEach(function (s) {
      if (s && s.id && s.debut) parSeance[s.id] = s.debut;
    });
    var dates = {};
    (local.series || []).forEach(function (serie) {
      if (!serie || !serie.exercise_slug) return;
      var d = parSeance[serie.session_id];
      if (!d) return;
      if (!dates[serie.exercise_slug] || d > dates[serie.exercise_slug]) {
        dates[serie.exercise_slug] = d;
      }
    });
    datesExercices = dates;
    return dates;
  }

  function compterExercices() {
    var dates = datesExercices || calculerDatesExercices();
    return { total: (local.exercices || []).length, faits: Object.keys(dates).length };
  }

  function rendreMesExercices() {
    montrer('exercices', Routeur.EXERCICES);
    var dates = calculerDatesExercices();
    var recherche = ($('champ-recherche-mes-exos').value || '').trim();

    // ⚠️ LA RECHERCHE DU CATALOGUE, PAS UNE SECONDE. `Routines.chercher` replie
    // déjà les accents des deux côtés et exige tous les mots — « couche halt »
    // trouve « Développé Couché Haltères ». En réécrire une ici, c'était deux
    // recherches à tenir d'accord (CADRAGE-V2 §2 undecies).
    //
    // Sa limite par défaut est de 30, et son tri est alphabétique : les deux
    // sont bons pour un champ de saisie qui cherche UN exercice, faux pour une
    // liste qui les montre TOUS. On lui demande donc tout, et on trie ici.
    var SANS_LIMITE = 100000;
    var lignes = Routines.chercher(local.exercices, recherche, SANS_LIMITE)
      .map(function (x) {
        return { slug: x.slug, nom: x.nom || x.slug, quandISO: dates[x.slug] || null };
      });

    // Les exercices FAITS d'abord, du plus récent au plus ancien ; les autres
    // ensuite, par ordre alphabétique. Un catalogue de 237 entrées trié
    // alphabétiquement répondrait à « quels exercices existent » — la question
    // ici est « qu'est-ce que je fais ».
    lignes.sort(function (a, b) {
      if (a.quandISO && b.quandISO) return a.quandISO < b.quandISO ? 1 : -1;
      if (a.quandISO) return -1;
      if (b.quandISO) return 1;
      return a.nom.localeCompare(b.nom, 'fr');
    });

    var faits = 0;
    lignes.forEach(function (l) { if (l.quandISO) faits++; });
    $('compte-mes-exos').textContent = lignes.length + ' exercice' +
      (lignes.length > 1 ? 's' : '') + ' · ' + faits + ' déjà fait' +
      (faits > 1 ? 's' : '');

    Rendu.rendreMesExercices($('liste-mes-exos'), {
      recherche: recherche,
      exercices: lignes.map(function (l) {
        return { slug: l.slug, nom: l.nom, jamais: !l.quandISO,
          quand: l.quandISO ? Rendu.jour(new Date(l.quandISO)) : 'jamais fait' };
      }),
      surChoix: function (slug) { afficherExercice(slug); }
    });
  }

  // ══ L'ENTRÉE : CONNEXION ET INSCRIPTION (§2 ter) ═════════════════════════

  var modeEntree = 'connexion';
  var sondePseudo = null;       // le minuteur de la vérification à la frappe
  var pseudoPris = null;        // true / false / null — null = « on ne sait pas »

  function champsEntree() {
    return {
      phrase: $('entree-phrase'), pseudo: $('env-pseudo'), oubli: $('btn-oubli'),
      aideMdp: $('aide-mdp'), bouton: $('btn-connexion'),
      bascule: $('btn-bascule-entree'), basculeAvant: $('entree-bascule-avant'),
      champEmail: $('champ-email'), champMdp: $('champ-mdp')
    };
  }

  // ⚠️ REMISE À ZÉRO À CHAQUE OUVERTURE. Sans elle, l'ancienne erreur et
  // l'ancien mot de passe restaient dans le formulaire après un « Quitter » —
  // défaut relevé à l'état des lieux du 18/09.
  function rendreEntree(mode) {
    modeEntree = mode || 'connexion';
    montrer('connexion', modeEntree === 'inscription'
      ? Routeur.INSCRIPTION : Routeur.CONNEXION);
    $('erreur-connexion').textContent = '';
    $('aide-pseudo').textContent = '';
    $('champ-mdp').value = '';
    pseudoPris = null;
    if (sondePseudo) { racine.clearTimeout(sondePseudo); sondePseudo = null; }
    var c = champsEntree();
    c.mode = modeEntree;
    Rendu.rendreEntree(c);
    majBoutonEntree();
  }

  function etatEntree() {
    return {
      pseudo: $('champ-pseudo').value,
      email: $('champ-email').value.trim(),
      mdp: $('champ-mdp').value,
      pseudoPris: pseudoPris
    };
  }

  function majBoutonEntree() {
    var b = $('btn-connexion');
    if (modeEntree !== 'inscription') { b.disabled = false; return; }
    b.disabled = !Profil.inscriptionPrete(etatEntree());
  }

  // Vérifié À LA FRAPPE, et le refus PROPOSE DEUX ALTERNATIVES (§3.1) — sinon
  // on tâtonne. Les alternatives se dérivent de l'e-mail déjà saisi : « mel »
  // avec melodie.dupont@… donne « melodie » et « mel_d ».
  function surFrappePseudo() {
    var e = etatEntree();
    pseudoPris = null;
    var verdict = Profil.verdictPseudo(e.pseudo, null, e);
    $('aide-pseudo').textContent = verdict.message || '';
    $('aide-pseudo').className = 'entree-err';
    majBoutonEntree();
    if (sondePseudo) racine.clearTimeout(sondePseudo);
    if (verdict.code !== 'inconnu' && verdict.code !== 'libre') return;
    // 400 ms : assez pour ne pas interroger à chaque lettre, assez peu pour que
    // la réponse arrive avant le champ suivant.
    sondePseudo = racine.setTimeout(function () { sonderPseudo(verdict.pseudo); }, 400);
  }

  async function sonderPseudo(nom) {
    var reponse = await Donnees.pseudoPris(nom);
    // La frappe a continué pendant la requête : sa réponse ne parle plus du
    // champ. On la jette plutôt que d'afficher un verdict périmé.
    if (Profil.normaliserPseudo($('champ-pseudo').value) !== nom) return;
    pseudoPris = reponse;
    var verdict = Profil.verdictPseudo(nom, reponse, etatEntree());
    $('aide-pseudo').textContent = verdict.message || '';
    majBoutonEntree();
  }

  async function soumettreEntree(e) {
    e.preventDefault();
    var bouton = $('btn-connexion'), erreur = $('erreur-connexion');
    var inscription = modeEntree === 'inscription';
    erreur.textContent = '';
    erreur.className = 'erreur';
    bouton.disabled = true;
    bouton.textContent = inscription ? 'Création…' : 'Connexion…';
    try {
      if (inscription) {
        var etat = etatEntree();
        // ⚠️ RETENU AVANT L'APPEL. `onAuthStateChange` peut partir AVANT que
        // `signUp` ne rende la main : si le pseudo n'était posé qu'après, le
        // chargement du profil créerait la ligne sans lui.
        pseudoAInscrire = Profil.normaliserPseudo(etat.pseudo);
        var r = await Auth.inscrire(etat.email, etat.mdp);
        if (!r.session) {
          erreur.className = 'erreur ok';
          erreur.textContent = 'Compte créé. Confirme ton e-mail, puis connecte-toi.';
        }
      } else {
        await Auth.connecter($('champ-email').value.trim(), $('champ-mdp').value);
      }
    } catch (err) {
      pseudoAInscrire = null;
      erreur.textContent = texteErreur(err);
    } finally {
      bouton.textContent = inscription ? 'Créer mon compte' : 'Se connecter';
      majBoutonEntree();
    }
  }

  async function demanderReinitialisation() {
    var email = $('champ-email').value.trim(), erreur = $('erreur-connexion');
    if (!email) {
      erreur.className = 'erreur';
      erreur.textContent = 'Saisis d’abord ton e-mail.';
      return;
    }
    try { await Auth.reinitialiser(email, racine.location.origin + '/profil'); }
    catch (err) { erreur.className = 'erreur'; erreur.textContent = texteErreur(err); return; }
    // La même phrase que l'adresse existe ou non : dire « ce compte n'existe
    // pas » révélerait qui est inscrit à qui demande.
    erreur.className = 'erreur ok';
    erreur.textContent = 'Si un compte existe pour cette adresse, le lien vient de partir.';
  }

  // ── Routage ──────────────────────────────────────────────────────────────
  //
  // Les semaines EMPILENT une entrée d'historique, contrairement au commit
  // précédent. Sans empilement, le retour depuis une semaine ancienne n'aurait
  // que deux issues : quitter l'app — le défaut même qu'on corrige — ou sauter
  // sans prévenir à la semaine courante. Empiler est la seule qui ne surprenne
  // pas, et le bouton « Cette semaine » borne le coût d'une exploration lointaine.

  function allerA(vue, params, remplacer) {
    var chemin = Routeur.construire(vue, params);
    var empilee = false;
    if (chemin !== racine.location.pathname) {
      if (remplacer) racine.history.replaceState({ vue: vue }, '', chemin);
      else { racine.history.pushState({ vue: vue }, '', chemin); empilee = true; }
    }
    // Même quand rien ne bouge : l'ancre doit rester en place tant que l'app
    // n'a rien empilé en dessous d'elle.
    sortie.apresNavigation(empilee);
  }

  // ⚠️ UN BOUTON « ← » REMONTE L'HISTORIQUE, IL NE CHOISIT PAS UNE DESTINATION
  // (règle du chantier 40, généralisée au 47).
  //
  // Naviguer explicitement EMPILE une entrée de plus au lieu de retirer celle
  // qu'on quitte. Depuis le détail d'une séance, « ← Séances » appelait
  // `afficherSemaine()` : il fallait ensuite TROIS retours d'Android pour
  // sortir de l'app, et l'un d'eux ROUVRAIT le détail qu'on venait de quitter.
  // Le bouton de la page d'exercice avait déjà été corrigé pour cette raison
  // exacte ; les deux faisaient depuis le même geste de deux façons.
  //
  // ⚠️ ET LE REPLI N'EST PAS DU ZÈLE. Au fond de notre pile, `history.back()`
  // est ABSORBÉ par `Sortie` (l'ancre) : le bouton ne ferait alors RIEN — le
  // cas d'un rechargement direct sur /seance/<uuid> ou /exercice/<slug>, où
  // aucune de nos entrées n'a jamais été empilée. On demande donc à `Sortie`
  // s'il reste quelque chose à nous de retirer, et sinon on navigue.
  function remonter(repli) {
    if (sortie.etat().pile > 0) racine.history.back();
    else repli();
  }

  // Une vue peut déclarer qu'elle refuse la sortie. C'est le point d'accroche
  // de l'écran de saisie : une séance en cours fournira ici sa propre question.
  // Rien ne l'utilise encore — seul le mécanisme existe.
  function ajouterGarde(fn) { if (typeof fn === 'function') gardes.push(fn); }
  function retirerGarde(fn) { gardes = gardes.filter(function (g) { return g !== fn; }); }

  // Un onglet sans contenu n'a rien à rendre : sa section est écrite en clair
  // dans index.html. Montrer la vue suffit.
  // Il n'en reste AUCUN : Saisie a un contenu depuis le chantier 21, Profil
  // depuis le chantier 46. La table survit pour Progression, qui rend son
  // sommaire mais dont la coquille est bien en clair.
  var VUES_ONGLET = {};
  VUES_ONGLET[Routeur.PROGRESSION] = 'progression';

  function rendreRoute(route) {
    var cible = Routeur.routeAffichable(route, { session: sessionActive });
    // Sans session, l'URL est corrigée en même temps que l'écran : laisser
    // /semaine/… dans la barre d'adresse rejouerait le défaut au rechargement.
    if (cible.redirigeDepuis) allerA(Routeur.CONNEXION, {}, true);
    if (cible.vue === Routeur.CONNEXION) return rendreEntree('connexion');
    if (cible.vue === Routeur.INSCRIPTION) return rendreEntree('inscription');
    if (cible.vue === Routeur.PROFIL) return rendreProfilEcran();
    if (cible.vue === Routeur.EXERCICES) return rendreMesExercices();
    if (cible.vue === Routeur.SAISIE) { rendreSaisie(); return chargerSiBesoin(); }
    if (cible.vue === Routeur.ROUTINE) return prepererEditeur(cible.params.id || null);
    if (cible.vue === Routeur.PROGRESSION) return rendreProgression();
    if (cible.vue === Routeur.VOLUME) return rendreVolume();
    if (cible.vue === Routeur.POIDS) return rendrePoids();
    if (VUES_ONGLET[cible.vue]) return montrer(VUES_ONGLET[cible.vue], cible.vue);
    if (cible.vue === Routeur.EXERCICE) {
      return rendreExercice(cible.params.slug, cible.params.onglet);
    }
    if (cible.vue === Routeur.SEANCE) return rendreDetail(cible.params.id);
    if (cible.vue === Routeur.SEMAINE) return rendreSemaine(cible.params.lundi);
    return rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
  }

  // Une seule requête par session, sauf échec : revenir sur l'onglet ne
  // redemande rien tant que la liste est bonne.
  async function chargerSiBesoin() {
    if (etatRoutines.code === 'ok' || etatRoutines.code === 'charge') return;
    await chargerRoutines();
    if (!vues.saisie.hidden) rendreSaisie();
  }

  async function demarrer() {
    vues = {
      connexion: $('vue-connexion'), liste: $('vue-liste'), detail: $('vue-detail'),
      saisie: $('vue-saisie'), routine: $('vue-routine'), seance: $('vue-seance'),
      progression: $('vue-progression'), exercice: $('vue-exercice'),
      volume: $('vue-volume'), poids: $('vue-poids'), profil: $('vue-profil'),
      exercices: $('vue-exercices')
    };
    sortie = Sortie.creer({
      history: racine.history,
      routeur: Routeur,
      chemin: function () { return racine.location.pathname; },
      etatHistorique: function () { return racine.history.state; },
      gardes: function () { return gardes; },
      rendre: rendreRoute
    });
    $('form-connexion').addEventListener('submit', soumettreEntree);
    // « Quitter » a quitté l'en-tête des séances : sa place est le profil, avec
    // « Supprimer mon compte » dessous (§2.5). Les deux boutons sont posés par
    // `rendreProfil`, avec leur propre confirmation.
    $('btn-bascule-entree').addEventListener('click', function () {
      var vers = modeEntree === 'inscription' ? Routeur.CONNEXION : Routeur.INSCRIPTION;
      allerA(vers, {});
      rendreEntree(vers);
    });
    $('btn-oubli').addEventListener('click', demanderReinitialisation);
    $('champ-pseudo').addEventListener('input', surFrappePseudo);
    ['champ-email', 'champ-mdp'].forEach(function (id) {
      $(id).addEventListener('input', majBoutonEntree);
    });
    $('btn-retour-mes-exos').addEventListener('click', function () {
      allerA(Routeur.PROFIL, {});
      rendreProfilEcran();
    });
    $('champ-recherche-mes-exos').addEventListener('input', rendreMesExercices);
    // ⚠️ UN BOUTON QUI NOMME SA DESTINATION Y VA ; UN BOUTON QUI N'EN NOMME
    // AUCUNE REMONTE L'HISTORIQUE (ch. 49). Les deux « ← » ne sont PAS le même
    // bouton, et le chantier 47 les avait confondus.
    //
    //   · « ← Séances » NOMME la liste. Une promesse écrite ne peut pas dépendre
    //     du chemin parcouru : `history.back()` rend l'entrée précédente, et
    //     l'entrée précédente n'est la liste que si l'on vient d'y passer. Sur
    //     device, après un aller-retour par la saisie, ce bouton a ramené
    //     Aurélien ailleurs que là où son libellé l'annonçait. Il navigue donc,
    //     et en REMPLAÇANT — le détail quitté ne reste pas dessous, ce qui était
    //     le vrai grief du chantier 40 (« l'un des retours ROUVRAIT le détail »).
    //   · « ← Retour » ne nomme RIEN, et la page d'exercice s'atteint depuis
    //     trois écrans : décider pour elle en enverrait deux sur trois au mauvais
    //     endroit. Elle garde `remonter`, qui est la bonne réponse à « je ne sais
    //     pas d'où tu viens ».
    //
    // Coût assumé et mesuré : l'entrée remplacée reste comptée dans `pile`, donc
    // un retour d'Android depuis la liste ne fait rien de visible avant que le
    // suivant n'atteigne l'ancre. Un appui invisible, contre une promesse tenue.
    $('btn-retour').addEventListener('click', function () { afficherSemaine(null, true); });
    $('btn-retour-exercice').addEventListener('click', function () { remonter(afficherSemaine); });
    ['btn-retour-volume', 'btn-retour-poids'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        allerA(Routeur.PROGRESSION, {});
        rendreProgression();
      });
    });
    $('btn-nouvelle-routine').addEventListener('click', function () { ouvrirRoutine(null); });
    // §7 vicies.1 — les deux boutons « Ranger », l'appui long étant l'autre
    // entrée. Un seul mode derrière : `ouvrirReorganisation` lit l'écran.
    $('btn-ranger-routines').addEventListener('click', ouvrirReorganisation);
    $('btn-ranger-routine').addEventListener('click', ouvrirReorganisation);
    // Sans argument : l'exercice se pose À LA FIN. Insérer après un bloc précis
    // reste le fait du menu de bloc, qui passe un vrai indice.
    $('btn-ajouter-exo-seance').addEventListener('click', function () { ouvrirCatalogue(); });
    $('btn-fermer-feuille').addEventListener('click', fermerVoile);
    $('feuille-seance').addEventListener('click', function (e) { if (e.target === this) fermerVoile(); });

    // Le réseau revient : on vide la file sans rien demander à personne — et le
    // profil modifié hors ligne repart avec elle.
    racine.addEventListener('online', function () { vidanger(); envoyerProfil(); });
    // Rotation, clavier logiciel, changement de taille : les barres changent de
    // hauteur, la réserve les suit. Mesuré une première fois au démarrage pour
    // que `--h-onglets` existe avant le premier rendu de séance.
    racine.addEventListener('resize', mesurerBarres);
    racine.addEventListener('orientationchange', mesurerBarres);
    mesurerBarres();
    $('btn-retour-routine').addEventListener('click', function () {
      allerA(Routeur.SAISIE, {});
      rendreSaisie();
    });
    // ⚠️ LE NOM EST UNE MODIFICATION COMME UNE AUTRE. Il vit dans le DOM et pas
    // dans le brouillon jusqu'à l'enregistrement : sans ce branchement, taper
    // un nom puis quitter l'écran le perdrait — et c'est le tout premier geste
    // d'une routine neuve.
    $('champ-nom-routine').addEventListener('input', function () {
      apresEditeur({ rendre: false });
    });
    $('btn-ajouter-exo').addEventListener('click', function () { ouvrirCatalogue(); });
    $('btn-enregistrer-routine').addEventListener('click', enregistrerBrouillon);
    $('btn-supprimer-routine').addEventListener('click', demanderSuppressionRoutine);
    $('btn-fermer-catalogue').addEventListener('click', fermerVoile);
    $('champ-recherche-exo').addEventListener('input', rendreCatalogue);
    $('btn-fermer-muscle').addEventListener('click', fermerVoile);
    $('btn-fermer-calendrier').addEventListener('click', fermerVoile);
    $('btn-cette-semaine').addEventListener('click', function () {
      fermerVoile();
      afficherSemaine(Semaine.bornesSemaine(new Date()).lundi);
    });
    $('btn-mois-prec').addEventListener('click', function () {
      moisCalendrier = Calendrier.decalerMois(moisCalendrier.annee, moisCalendrier.mois, -1);
      rendreCalendrier();
    });
    $('btn-mois-suiv').addEventListener('click', function () {
      moisCalendrier = Calendrier.decalerMois(moisCalendrier.annee, moisCalendrier.mois, 1);
      rendreCalendrier();
    });
    // Toucher le voile ferme, toucher la boîte ne ferme pas.
    ['fenetre-muscle', 'calendrier', 'catalogue'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) fermerVoile(); });
    });
    $('btn-rafraichir').addEventListener('click', async function () {
      Rendu.rendreEtat($('etat-sync'), { code: 'sync', libelle: 'Synchronisation…', local: false });
      await synchroniser();
      await chargerProfil();
      afficherSemaine();
    });

    // Chaque onglet est une VUE du routeur, avec son URL — pas un basculement
    // d'affichage. Séances renvoie sur la semaine courante.
    Routeur.ONGLETS.forEach(function (vue) {
      var bouton = doc.querySelector('.onglet[data-vue="' + vue + '"]');
      if (!bouton) return;
      bouton.addEventListener('click', function () {
        fermerVoile();
        // Séances revient sur la semaine courante ; Progression garde celle
        // qu'on regardait, pour que l'aller-retour soit sans surprise.
        if (vue === Routeur.RACINE) return afficherSemaine(Semaine.bornesSemaine(new Date()).lundi);
        if (vue === Routeur.SAISIE) return afficherSaisie();
        allerA(vue, {});
        rendreRoute({ vue: vue, params: {} });
      });
    });

    racine.addEventListener('popstate', function () { sortie.surRetour(); });

    // Le SEUL chemin qui déconnecte. Une session nulle annoncée par le SDK ne
    // suffit pas : hors réseau, il annonce « pas de session » sans que personne
    // ne se soit déconnecté. On ne sort quelqu'un de ses données que si le
    // jeton a VRAIMENT disparu du stockage — ce que fait `Auth.deconnecter`, et
    // ce que fait le SDK quand le compte est réellement révoqué.
    Auth.surChangement(function (session) {
      if (session) { entrer(session); return; }
      if (Auth.sessionPersistee()) return;
      sessionActive = null;
      entreeFaitePour = null;
      profil = null; datesExercices = null;
      allerA(Routeur.CONNEXION, {}, true);
      rendreEntree('connexion');
    });

    // ── DÉMARRAGE SANS RÉSEAU ────────────────────────────────────────────
    //
    // La sonde SYNCHRONE décide de ce qu'on affiche. Aucune attente, aucun
    // appel réseau : c'est cette attente qui laissait l'écran noir au
    // rechargement hors ligne, alors que les 28 000 séries étaient sur
    // l'appareil (cf. le commentaire de `sessionPersistee`).
    var persistee = Auth.sessionPersistee();
    if (persistee) {
      await entrer(persistee);
    } else {
      var entree = Routeur.analyser(racine.location.pathname);
      var mode = entree.vue === Routeur.INSCRIPTION ? 'inscription' : 'connexion';
      allerA(mode === 'inscription' ? Routeur.INSCRIPTION : Routeur.CONNEXION, {}, true);
      rendreEntree(mode);
    }
    enregistrerSW();

    // Le verdict du SDK arrive après, et il ne bloque RIEN. Il rafraîchit le
    // jeton, ce qui déclenche `surChangement` — c'est là que la vraie session
    // remplace la sonde. Volontairement pas attendu : `.catch` vide parce qu'un
    // réseau muet n'est pas une erreur à montrer.
    Auth.sessionCourante().catch(function () {});
  }

  // Exposé pour l'écran de saisie à venir : une vue déclare ici qu'elle refuse
  // la sortie, et fournit sa propre question. Rien ne s'en sert encore.
  racine.THApp = { ajouterGarde: ajouterGarde, retirerGarde: retirerGarde };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
