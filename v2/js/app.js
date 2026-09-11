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

  var vues = {};
  var local = { seances: [], series: [], exercices: [], parSeance: null };
  var etat = { code: 'vide', libelle: '', local: false };
  var syncEnCours = false;
  var lundiAffiche = null;   // le lundi de la semaine à l'écran

  function $(id) { return doc.getElementById(id); }
  function montrer(nom) { Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); }); }

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
    local.seances.sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); });
    indexerParSeance();
  }

  // Le cache appartient à un compte et à un seul. Un cache qui survivrait à un
  // changement de compte montrerait les séances de quelqu'un d'autre.
  async function garantirProprietaire(userId) {
    var meta = await Cache.lireMeta('proprietaire');
    if (Sync.cacheAppartientA(meta, userId)) return;
    await Cache.viderTout();
    await Cache.ecrireMeta('proprietaire', { userId: userId });
  }

  // ── Synchronisation ──────────────────────────────────────────────────────
  async function synchroniser() {
    if (syncEnCours) return;
    syncEnCours = true;
    try {
      var curseur = await Cache.lireMeta('curseurSeries');

      // sessions : complet (545 Ko, aucune colonne de modification, capte aussi
      // les suppressions). sets : incrémental (15 Mo, 28× plus lourd).
      var seances = await Donnees.toutesLesSeances();
      var nouvellesSeries = await Donnees.seriesDepuis(curseur);
      var exercices = await Donnees.tousLesExercices();

      local.seances = Sync.remplacer(seances);
      local.series = Sync.purgerSeriesOrphelines(
        Sync.fusionner(local.series, nouvellesSeries), local.seances);
      local.exercices = Sync.remplacer(exercices);
      indexerParSeance();

      await Cache.remplacerTout('seances', local.seances);
      await Cache.remplacerTout('series', local.series);
      await Cache.remplacerTout('exercices', local.exercices);

      var avance = Sync.curseurDe(nouvellesSeries);
      if (avance) await Cache.ecrireMeta('curseurSeries', avance);

      etat = Sync.deciderEtat({ syncOk: true, aDesDonnees: true });
    } catch (e) {
      // Une synchronisation ratée n'est jamais bloquante : on garde ce qu'on a.
      etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });
      console.warn('Synchronisation impossible :', texteErreur(e));
    } finally {
      syncEnCours = false;
    }
  }

  // ── Écrans ───────────────────────────────────────────────────────────────
  // Toute la navigation entre semaines lit le cache. Aucun appel réseau, aucun
  // rechargement de page — et aucune entrée empilée dans l'historique, pour ne
  // pas aggraver le bouton retour d'Android, qui est un chantier à part.
  function afficherSemaine(lundi) {
    if (lundi) lundiAffiche = lundi;
    if (!lundiAffiche) lundiAffiche = Semaine.bornesSemaine(new Date()).lundi;
    montrer('liste');
    Rendu.rendreEtat($('etat-sync'), etat);

    var bornes = Semaine.bornesSemaine(lundiAffiche);
    $('semaine-libelle').textContent = Rendu.libelleSemaine(bornes.lundi, bornes.dimanche);
    $('btn-semaine-actuelle').hidden = Semaine.memeSemaine(lundiAffiche, new Date());

    var jours = Semaine.repartirParJour(local.seances, bornes.lundi);
    var deLaSemaine = jours.reduce(function (acc, j) { return acc.concat(j.seances); }, []);
    var seriesSemaine = deLaSemaine.reduce(function (acc, s) { return acc.concat(seriesDe(s.id)); }, []);

    Rendu.rendreBilan($('bilan-semaine'),
      Semaine.bilanSemaine(deLaSemaine, seriesSemaine),
      Semaine.volumeParMuscle(seriesSemaine, local.exercices));

    Rendu.rendreJours($('liste-seances'), jours, function (s) {
      return Modele.resumerSeance(s, seriesDe(s.id), local.exercices);
    }, afficherDetail);
  }

  function naviguer(n) {
    afficherSemaine(Semaine.decalerSemaine(lundiAffiche, n).lundi);
  }

  function afficherDetail(sessionId) {
    montrer('detail');
    var seance = local.seances.filter(function (s) { return s.id === sessionId; })[0] || null;
    var blocs = Modele.construireBlocs(seriesDe(sessionId), local.exercices);
    Rendu.rendreDetail($('detail-seance'), seance, blocs);
  }

  // ── Entrée ───────────────────────────────────────────────────────────────
  async function entrer(session) {
    var userId = session && session.user && session.user.id;
    try {
      await garantirProprietaire(userId);
      await chargerCache();
    } catch (e) {
      console.warn('Cache local indisponible :', texteErreur(e));
    }

    // Ouverture immédiate sur ce qu'on a déjà, avant toute requête réseau.
    etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });
    if (local.seances.length) afficherSemaine();
    else { montrer('liste'); Rendu.message($('liste-seances'), 'Première synchronisation…'); }

    await synchroniser();
    if (!vues.detail.hidden) return;   // l'utilisateur a ouvert une séance entre-temps
    afficherSemaine();
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
    try { await Cache.viderTout(); } catch (e) { /* rien à garder de toute façon */ }
    local = { seances: [], series: [], exercices: [], parSeance: null };
    try { await Auth.deconnecter(); } catch (e) { montrer('connexion'); }
  }

  function enregistrerSW() {
    if (!('serviceWorker' in racine.navigator)) return;
    racine.navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(function (e) { console.warn('SW non enregistré :', e && e.message); });
  }

  async function demarrer() {
    vues = { connexion: $('vue-connexion'), liste: $('vue-liste'), detail: $('vue-detail') };
    $('form-connexion').addEventListener('submit', soumettreConnexion);
    $('btn-deconnexion').addEventListener('click', deconnecter);
    $('btn-retour').addEventListener('click', function () { afficherSemaine(); });
    $('btn-semaine-prec').addEventListener('click', function () { naviguer(-1); });
    $('btn-semaine-suiv').addEventListener('click', function () { naviguer(1); });
    $('btn-semaine-actuelle').addEventListener('click', function () {
      afficherSemaine(Semaine.bornesSemaine(new Date()).lundi);
    });
    $('btn-rafraichir').addEventListener('click', async function () {
      Rendu.rendreEtat($('etat-sync'), { code: 'sync', libelle: 'Synchronisation…', local: false });
      await synchroniser();
      afficherSemaine();
    });

    Auth.surChangement(function (session) {
      if (session) entrer(session);
      else montrer('connexion');
    });

    try {
      var session = await Auth.sessionCourante();
      if (session) await entrer(session); else montrer('connexion');
    } catch (e) {
      montrer('connexion');
      $('erreur-connexion').textContent = texteErreur(e);
    }
    enregistrerSW();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
