// v2/js/routeur.js — routage d'URL et décisions de retour.
//
// Module PUR : aucune dépendance au DOM, à History, au réseau. Analyser un
// chemin, en construire un, décider ce que fait le bouton retour — tout cela se
// teste sans navigateur, et c'est là que vivent les règles.
//
// SCHÉMA D'URL
//   /                       la semaine courante — la racine
//   /semaine/AAAA-MM-JJ     une semaine, désignée par son lundi
//   /seance/<uuid>          le détail d'une séance
//   /connexion              l'écran de connexion
//
// La semaine est désignée par la DATE de son lundi, pas par un numéro ISO :
// « /semaine/2026-09-07 » se lit sans décoder, se partage tel quel, et évite
// les pièges de la numérotation ISO (années à 53 semaines, semaine 1 à cheval).
// Un chemin qui pointe un autre jour que le lundi est accepté et ramené au
// lundi de sa semaine — un lien approximatif vaut mieux qu'un 404.

(function (racine) {
  'use strict';

  var RACINE = 'racine', SEMAINE = 'semaine', SEANCE = 'seance', CONNEXION = 'connexion';

  var RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  // Date locale -> « AAAA-MM-JJ ». En composantes locales, jamais en ISO/UTC :
  // toISOString() décalerait la date d'un jour selon le fuseau.
  function versDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate());
  }

  // « AAAA-MM-JJ » -> Date locale à minuit. Rejette ce qui n'existe pas :
  // 2026-13-01 et 2026-02-30 ne sont pas des dates.
  function depuisDate(txt) {
    var m = RE_DATE.exec(String(txt || ''));
    if (!m) return null;
    var an = +m[1], mois = +m[2] - 1, jour = +m[3];
    var d = new Date(an, mois, jour, 0, 0, 0, 0);
    if (d.getFullYear() !== an || d.getMonth() !== mois || d.getDate() !== jour) return null;
    return d;
  }

  // Chemin -> { vue, params }. Une URL inconnue ou malformée retombe sur la
  // racine : l'app s'ouvre, elle ne montre jamais d'erreur de routage.
  function analyser(chemin) {
    var brut = String(chemin || '/').split('?')[0].split('#')[0];
    var bouts = brut.split('/').filter(Boolean);

    if (!bouts.length) return { vue: RACINE, params: {} };

    if (bouts[0] === CONNEXION && bouts.length === 1) return { vue: CONNEXION, params: {} };

    if (bouts[0] === SEMAINE && bouts.length === 2) {
      var d = depuisDate(bouts[1]);
      if (!d) return { vue: RACINE, params: {}, repli: 'date-invalide' };
      return { vue: SEMAINE, params: { lundi: d } };
    }

    if (bouts[0] === SEANCE && bouts.length === 2) {
      if (!RE_UUID.test(bouts[1])) return { vue: RACINE, params: {}, repli: 'id-invalide' };
      return { vue: SEANCE, params: { id: bouts[1] } };
    }

    return { vue: RACINE, params: {}, repli: 'inconnu' };
  }

  // { vue, params } -> chemin. L'aller-retour avec analyser est idempotent.
  function construire(vue, params) {
    var p = params || {};
    if (vue === SEMAINE) {
      var d = versDate(p.lundi);
      return d ? '/' + SEMAINE + '/' + d : '/';
    }
    if (vue === SEANCE) return p.id && RE_UUID.test(p.id) ? '/' + SEANCE + '/' + p.id : '/';
    if (vue === CONNEXION) return '/' + CONNEXION;
    return '/';
  }

  // ── Le bouton retour ─────────────────────────────────────────────────────
  //
  // Quatre issues, volontairement distinctes — un test qui les confondrait ne
  // prouverait rien :
  //   'garde'      une vue refuse la sortie et fournit sa propre confirmation
  //   'historique' il y a où revenir : on laisse l'historique faire
  //   'confirmer'  on est à la racine, on demande avant de quitter
  //   'quitter'    rien à retenir (écran de connexion)
  //
  // L'ordre compte : une garde l'emporte sur tout le reste. C'est le point
  // d'accroche que l'écran de saisie utilisera pour retenir une séance en cours.
  function decisionRetour(route, contexte) {
    var ctx = contexte || {};
    var garde = premiereGardeBloquante(ctx.gardes);
    if (garde) return { action: 'garde', garde: garde };

    var vue = (route && route.vue) || RACINE;
    if (vue === CONNEXION) return { action: 'quitter' };
    if (vue === SEANCE || vue === SEMAINE) return { action: 'historique' };
    return { action: 'confirmer' };
  }

  // Une garde est une fonction qui rend un objet quand elle refuse la sortie
  // (avec de quoi se présenter), ou rien quand elle laisse passer.
  function premiereGardeBloquante(gardes) {
    var liste = gardes || [];
    for (var i = 0; i < liste.length; i++) {
      if (typeof liste[i] !== 'function') continue;
      var verdict = liste[i]();
      if (verdict) return verdict;
    }
    return null;
  }

  var api = {
    RACINE: RACINE, SEMAINE: SEMAINE, SEANCE: SEANCE, CONNEXION: CONNEXION,
    versDate: versDate,
    depuisDate: depuisDate,
    analyser: analyser,
    construire: construire,
    decisionRetour: decisionRetour,
    premiereGardeBloquante: premiereGardeBloquante
  };

  racine.THRouteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
