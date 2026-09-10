// v2/js/app.js — amorçage et orchestration des trois écrans.
//
// Écrans : connexion → liste des séances → détail d'une séance.
// Aucune écriture en base. Aucun écran de saisie.

(function (racine) {
  'use strict';

  var doc = racine.document;
  var Rendu = racine.THRendu;
  var Modele = racine.THModele;
  var Donnees = racine.THDonnees;
  var Auth = racine.THAuth;

  var vues = {};
  var seancesChargees = [];

  function $(id) { return doc.getElementById(id); }

  function montrer(nom) {
    Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); });
  }

  // Toute panne réseau doit produire une phrase, jamais un écran blanc.
  function texteErreur(e) {
    if (!e) return 'Erreur inconnue.';
    var m = e.message || String(e);
    if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) {
      return 'Pas de réseau. Les données n’ont pas pu être chargées.';
    }
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    return m;
  }

  // ── Connexion ────────────────────────────────────────────────────────────
  async function soumettreConnexion(e) {
    e.preventDefault();
    var bouton = $('btn-connexion');
    var erreur = $('erreur-connexion');
    erreur.textContent = '';
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    try {
      await Auth.connecter($('champ-email').value.trim(), $('champ-mdp').value);
      // La suite est pilotée par onAuthStateChange.
    } catch (err) {
      erreur.textContent = texteErreur(err);
    } finally {
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
    }
  }

  // ── Liste des séances ────────────────────────────────────────────────────
  async function afficherListe() {
    montrer('liste');
    var cible = $('liste-seances');
    Rendu.message(cible, 'Chargement…');
    try {
      var seances = await Donnees.listerSeances(20);
      seancesChargees = seances;
      if (!seances.length) {
        Rendu.message(cible, 'Aucune séance sur ce compte.');
        return;
      }
      // Le résumé a besoin des séries : une requête par séance affichée.
      // Volontairement naïf — 20 séances, socle de vérification, pas de vue de production.
      var parSeance = [];
      var slugs = [];
      for (var i = 0; i < seances.length; i++) {
        var series = await Donnees.seriesDe(seances[i].id);
        parSeance.push(series);
        series.forEach(function (s) { slugs.push(s.exercise_slug); });
      }
      // Un seul appel au catalogue pour tous les slugs rencontrés : reconnaître
      // une sortie demande `mesure` et `charge`.
      var catalogue = await Donnees.exercicesDe(slugs);
      var resumes = seances.map(function (seance, i) {
        return Modele.resumerSeance(seance, parSeance[i], catalogue);
      });
      Rendu.rendreListeSeances(cible, resumes, afficherDetail);
    } catch (err) {
      Rendu.message(cible, texteErreur(err), 'erreur');
    }
  }

  // ── Détail d'une séance ──────────────────────────────────────────────────
  async function afficherDetail(sessionId) {
    montrer('detail');
    var cible = $('detail-seance');
    Rendu.message(cible, 'Chargement…');
    try {
      var seance = seancesChargees.filter(function (s) { return s.id === sessionId; })[0] || null;
      var paquet = await Donnees.chargerSeance(sessionId);
      var blocs = Modele.construireBlocs(paquet.series, paquet.exercices);
      Rendu.rendreDetail(cible, seance, blocs);
    } catch (err) {
      Rendu.message(cible, texteErreur(err), 'erreur');
    }
  }

  // ── Service worker ───────────────────────────────────────────────────────
  function enregistrerSW() {
    if (!('serviceWorker' in racine.navigator)) return;
    racine.navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(function (e) { console.warn('SW non enregistré :', e && e.message); });
  }

  // ── Amorçage ─────────────────────────────────────────────────────────────
  async function demarrer() {
    vues = { connexion: $('vue-connexion'), liste: $('vue-liste'), detail: $('vue-detail') };

    $('form-connexion').addEventListener('submit', soumettreConnexion);
    $('btn-deconnexion').addEventListener('click', async function () {
      try { await Auth.deconnecter(); } catch (e) { /* l'état est rejoué par onAuthStateChange */ }
    });
    $('btn-retour').addEventListener('click', afficherListe);
    $('btn-rafraichir').addEventListener('click', afficherListe);

    Auth.surChangement(function (session) {
      if (session) afficherListe();
      else montrer('connexion');
    });

    // Session persistée : au lancement, on repart de l'état stocké sans réseau.
    try {
      var session = await Auth.sessionCourante();
      if (session) afficherListe(); else montrer('connexion');
    } catch (e) {
      montrer('connexion');
      $('erreur-connexion').textContent = texteErreur(e);
    }

    enregistrerSW();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
