// v2/js/secours.js — l'écran de secours : « L'app n'a pas pu démarrer » + « Réessayer ».
//
// POURQUOI. Si un script de la coquille n'arrive pas (config.js, client.js… : un 503, une coupure, une page HTML
// servie à sa place par un portail captif), l'app ne démarrait pas et l'utilisateur voyait une PAGE VIDE, sans
// un mot, sans issue. Ce fichier est chargé EN PREMIER, ne dépend d'AUCUN autre module, et ne fait que deux choses :
// attraper un démarrage raté et le dire.
//
// Trois déclencheurs, un seul écran (`montrer`) :
//   1. un `<script>` de la page échoue à se charger (événement `error` capté en phase de capture) ;
//   2. à la fin du chargement, `THApp` n'existe pas : `app.js` est absent ou s'est arrêté avant d'avoir fini ;
//   3. `demarrer()` (app.js) lève : elle appelle `THSecours.montrer(erreur)`.
// Ce n'est PAS un gestionnaire d'erreurs général : une erreur qui survient app ouverte ne remplace jamais l'écran.
//
// Aucune écriture en base, aucun calcul du coach. Les styles sont des classes de styles.css (la CSP interdit le
// style en ligne) ; si la feuille manque aussi, le texte reste lisible, juste nu.
(function (racine) {
  'use strict';

  var doc = racine.document;
  var TITRE = 'L’app n’a pas pu démarrer';
  var TEXTE = 'Un fichier n’est pas arrivé jusqu’à ton appareil. Tes séances enregistrées ne sont pas touchées.';

  function montrer(raison) {
    if (!doc || !doc.body) return false;
    if (raison && racine.console) racine.console.error('Démarrage raté :', raison);
    if (doc.getElementById('vue-secours')) return true;
    doc.documentElement.classList.add('en-secours');
    var s = doc.createElement('section');
    s.id = 'vue-secours';
    s.className = 'secours';
    s.setAttribute('role', 'alert');
    var h = doc.createElement('h1');
    h.textContent = TITRE;
    var p = doc.createElement('p');
    p.textContent = TEXTE;
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = 'btn-secours-reessayer';
    b.textContent = 'Réessayer';
    b.addEventListener('click', function () { racine.location.reload(); });
    s.appendChild(h); s.appendChild(p); s.appendChild(b);
    doc.body.appendChild(s);
    return true;
  }

  if (racine.addEventListener) {
    // Le chargement raté d'un script : l'événement ne remonte pas, seule la capture le voit.
    racine.addEventListener('error', function (e) {
      var c = e && e.target;
      // Seulement un script de l'app, au démarrage : le script du captcha (autre origine, ajouté plus tard) qui ne
      // vient pas a déjà son propre « Réessayer » et ne doit jamais couvrir l'app.
      if (c && c.tagName === 'SCRIPT' && !racine.THApp && racine.location &&
          String(c.src || '').indexOf(racine.location.origin + '/') === 0) montrer('script absent : ' + c.src);
    }, true);
    // Les scripts classiques de la page sont tous exécutés avant `load` : si `THApp` n'existe pas, `app.js` n'est
    // pas allé au bout. `load` peut avoir déjà eu lieu si ce fichier est chargé tard : on teste aussi `readyState`.
    var verifier = function () {
      if (!racine.THApp) montrer('app.js n’a pas fini de se charger');
    };
    if (doc && doc.readyState === 'complete') verifier();
    else racine.addEventListener('load', verifier);
  }

  racine.THSecours = { montrer: montrer, TITRE: TITRE };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.THSecours;
})(typeof self !== 'undefined' ? self : globalThis);
