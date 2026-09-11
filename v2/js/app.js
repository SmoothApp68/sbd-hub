// v2/js/app.js — amorçage et orchestration.
//
// Principe : les données vivent sur le téléphone, le réseau ne sert qu'à les
// mettre à jour. On affiche TOUJOURS ce qu'on a d'abord, puis on rafraîchit en
// arrière-plan. Aucun écran d'attente quand quelque chose peut déjà être montré.
//
// Aucune écriture vers Supabase. Ce commit rend l'app lisible hors ligne, pas
// modifiable hors ligne — l'écriture hors ligne est un autre problème.

(function (racine) {
  'use strict';

  var doc = racine.document;
  var Rendu = racine.THRendu, Modele = racine.THModele;
  var Donnees = racine.THDonnees, Auth = racine.THAuth;
  var Cache = racine.THCache, Sync = racine.THSync, Semaine = racine.THSemaine;
  var Routeur = racine.THRouteur, Sortie = racine.THSortie;
  var Calendrier = racine.THCalendrier;
  var Periode = racine.THPeriode, Poids = racine.THPoids;
  var Palier = racine.THPalier;

  var vues = {};
  var local = { seances: [], series: [], exercices: [], pesees: [], parSeance: null };
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

  function $(id) { return doc.getElementById(id); }

  // Une vue visible à la fois, et la barre d'onglets suit : elle disparaît sur
  // la connexion, où il n'y a rien à naviguer.
  function montrer(nom, vue) {
    Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); });
    var onglet = Routeur.ongletDe(vue || nom);
    var barre = $('onglets');
    if (barre) barre.hidden = !onglet;
    Rendu.rendreOnglets(barre, onglet);
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

  // ── Cache ────────────────────────────────────────────────────────────────
  async function chargerCache() {
    local.seances = await Cache.lireTout('seances');
    local.series = await Cache.lireTout('series');
    local.exercices = await Cache.lireTout('exercices');
    local.pesees = await Cache.lireTout('pesees');
    ordonnerSeances();
    indexerParSeance();
    recalculerEtats();
  }

  // INVARIANT : `local.seances` va toujours de la PLUS RÉCENTE à la plus
  // ancienne. La pagination rend les séances triées par `id`, donc dans un
  // ordre qui n'a rien à voir avec le temps ; seul le chargement du cache
  // triait, et une synchronisation réussie défaisait ce tri sans que rien ne
  // s'en plaigne. Défaut trouvé au banc, pas en test : la vue hebdomadaire
  // filtre par date et ne voyait donc rien, mais le sommaire, qui lit « les
  // trois derniers exercices pratiqués », rendait les trois PLUS ANCIENS.
  function ordonnerSeances() {
    local.seances.sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); });
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

      // Le serveur annonce ce qu'il a. C'est ce qui autorise la purge, et c'est
      // ce qui permet de dire qu'il manque quelque chose au lieu de l'ignorer.
      var compteSeances = await compteSur(Donnees.compterSeances);
      var compteSeries = await compteSur(Donnees.compterSeries);

      local.seances = Sync.remplacer(seances);
      var listeComplete = Sync.verifierCompletude(local.seances.length, compteSeances).complet;
      var fusionnees = Sync.fusionner(local.series, nouvellesSeries);
      local.series = Sync.purgerSeriesOrphelines(fusionnees, local.seances, listeComplete);
      local.exercices = Sync.remplacer(exercices);
      ordonnerSeances();
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
      bilan: Semaine.bilanSemaine(seances, series),
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
    Rendu.rendreEtat($('etat-sync'), etat);

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
    }, afficherDetail);
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
      exercices: sommaireExercices()
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
  function sommaireExercices() {
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
        var r = Palier.analyser((parExo[serie.exercise_slug] || {}).series || [],
                                etatsExercices[serie.exercise_slug]);
        lignes.push({
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

    return { quand: n ? n + ' exercices' : '', lignes: lignes };
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
        Semaine.bilanSemaine(c.seances, c.series),
        Semaine.bilanSemaine(a.seances, a.series)),
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
  function ouvrirVoile(noeud) {
    fermerVoile();
    voileOuvert = noeud;
    noeud.hidden = false;
    gardeOverlay = function () { return { raison: 'voile', afficher: fermerVoile }; };
    ajouterGarde(gardeOverlay);
  }

  function fermerVoile() {
    if (gardeOverlay) { retirerGarde(gardeOverlay); gardeOverlay = null; }
    if (voileOuvert) { voileOuvert.hidden = true; voileOuvert = null; }
  }

  // Navigation explicite : elle écrit l'URL, puis rend.
  function afficherSemaine(lundi) {
    var l = lundi || lundiAffiche || Semaine.bornesSemaine(new Date()).lundi;
    allerA(Semaine.memeSemaine(l, new Date()) ? Routeur.RACINE : Routeur.SEMAINE, { lundi: l });
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
    var seance = local.seances.filter(function (s) { return s.id === sessionId; })[0] || null;
    var blocs = Modele.construireBlocs(seriesDe(sessionId), local.exercices);
    Rendu.rendreDetail($('detail-seance'), seance, blocs);
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

  function entrer(session) {
    if (entreeEnCours) return entreeEnCours;
    entreeEnCours = entrerVraiment(session);
    entreeEnCours.catch(function () {}).then(function () { entreeEnCours = null; });
    return entreeEnCours;
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

    // Ouverture immédiate sur ce qu'on a déjà, avant toute requête réseau.
    // On honore l'URL d'entrée : un rechargement direct sur /semaine/… ou
    // /seance/… rouvre la bonne vue, pas systématiquement la semaine courante.
    var routeInitiale = Routeur.analyser(racine.location.pathname);
    if (routeInitiale.vue === Routeur.CONNEXION || routeInitiale.repli) {
      routeInitiale = { vue: Routeur.RACINE, params: {} };
      allerA(Routeur.RACINE, {}, true);
    }

    etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });
    if (local.seances.length) rendreRoute(routeInitiale);
    else { montrer('liste', Routeur.RACINE); Rendu.message($('liste-seances'), 'Première synchronisation…'); }

    // L'ancre s'installe dès l'ouverture, QUELLE QUE SOIT la vue d'entrée :
    // au fond de la pile, un retour ne déclenche aucun popstate, il ferme.
    // Y compris sur une ouverture directe sur /semaine/… — qui, jusqu'ici,
    // n'avait pas d'ancre et se fermait donc sans absorption.
    sortie.apresNavigation(false);

    await synchroniser();
    if (!vues.detail.hidden) return;   // l'utilisateur a ouvert une séance entre-temps
    rendreRoute(Routeur.analyser(racine.location.pathname));
  }

  async function soumettreConnexion(e) {
    e.preventDefault();
    var bouton = $('btn-connexion'), erreur = $('erreur-connexion');
    erreur.textContent = '';
    bouton.disabled = true; bouton.textContent = 'Connexion…';
    try { await Auth.connecter($('champ-email').value.trim(), $('champ-mdp').value); }
    catch (err) { erreur.textContent = texteErreur(err); }
    finally { bouton.disabled = false; bouton.textContent = 'Se connecter'; }
  }

  // Déconnexion EXPLICITE : le cache de ce compte part avec elle. Une session
  // qui expire toute seule, en revanche, ne doit rien effacer — on revient à
  // l'écran de connexion et les données restent là pour la prochaine ouverture.
  async function deconnecter() {
    // Avant toute chose : plus de session, donc plus aucune vue authentifiée
    // rendue — y compris par un retour qui atterrirait sur une ancienne entrée.
    sessionActive = null;
    try { await Cache.viderTout(); } catch (e) { /* rien à garder de toute façon */ }
    local = { seances: [], series: [], exercices: [], pesees: [], parSeance: null };
    try { await Auth.deconnecter(); } catch (e) { montrer('connexion', Routeur.CONNEXION); }
    allerA(Routeur.CONNEXION, {}, true);
  }

  function enregistrerSW() {
    if (!('serviceWorker' in racine.navigator)) return;
    // Chemins absolus : depuis /semaine/… un chemin relatif viserait
    // /semaine/service-worker.js, qui n'existe pas.
    racine.navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(function (e) { console.warn('SW non enregistré :', e && e.message); });
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

  // Une vue peut déclarer qu'elle refuse la sortie. C'est le point d'accroche
  // de l'écran de saisie : une séance en cours fournira ici sa propre question.
  // Rien ne l'utilise encore — seul le mécanisme existe.
  function ajouterGarde(fn) { if (typeof fn === 'function') gardes.push(fn); }
  function retirerGarde(fn) { gardes = gardes.filter(function (g) { return g !== fn; }); }

  // Un onglet sans contenu n'a rien à rendre : sa section est écrite en clair
  // dans index.html. Montrer la vue suffit.
  var VUES_ONGLET = {};
  VUES_ONGLET[Routeur.SAISIE] = 'saisie';
  VUES_ONGLET[Routeur.PROGRESSION] = 'progression';
  VUES_ONGLET[Routeur.PROFIL] = 'profil';

  function rendreRoute(route) {
    var cible = Routeur.routeAffichable(route, { session: sessionActive });
    // Sans session, l'URL est corrigée en même temps que l'écran : laisser
    // /semaine/… dans la barre d'adresse rejouerait le défaut au rechargement.
    if (cible.redirigeDepuis) allerA(Routeur.CONNEXION, {}, true);
    if (cible.vue === Routeur.CONNEXION) return montrer('connexion', Routeur.CONNEXION);
    if (cible.vue === Routeur.PROGRESSION) return rendreProgression();
    if (cible.vue === Routeur.VOLUME) return rendreVolume();
    if (cible.vue === Routeur.POIDS) return rendrePoids();
    if (VUES_ONGLET[cible.vue]) return montrer(VUES_ONGLET[cible.vue], cible.vue);
    if (cible.vue === Routeur.SEANCE) return rendreDetail(cible.params.id);
    if (cible.vue === Routeur.SEMAINE) return rendreSemaine(cible.params.lundi);
    return rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
  }

  async function demarrer() {
    vues = {
      connexion: $('vue-connexion'), liste: $('vue-liste'), detail: $('vue-detail'),
      saisie: $('vue-saisie'), progression: $('vue-progression'),
      volume: $('vue-volume'), poids: $('vue-poids'), profil: $('vue-profil')
    };
    sortie = Sortie.creer({
      history: racine.history,
      routeur: Routeur,
      chemin: function () { return racine.location.pathname; },
      etatHistorique: function () { return racine.history.state; },
      gardes: function () { return gardes; },
      rendre: rendreRoute
    });
    $('form-connexion').addEventListener('submit', soumettreConnexion);
    $('btn-deconnexion').addEventListener('click', deconnecter);
    $('btn-retour').addEventListener('click', function () { afficherSemaine(); });
    ['btn-retour-volume', 'btn-retour-poids'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        allerA(Routeur.PROGRESSION, {});
        rendreProgression();
      });
    });
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
    ['fenetre-muscle', 'calendrier'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) fermerVoile(); });
    });
    $('btn-rafraichir').addEventListener('click', async function () {
      Rendu.rendreEtat($('etat-sync'), { code: 'sync', libelle: 'Synchronisation…', local: false });
      await synchroniser();
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
      allerA(Routeur.CONNEXION, {}, true);
      montrer('connexion', Routeur.CONNEXION);
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
      allerA(Routeur.CONNEXION, {}, true);
      montrer('connexion', Routeur.CONNEXION);
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
