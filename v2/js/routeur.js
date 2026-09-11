// v2/js/routeur.js — routage d'URL et décisions de retour.
//
// Module PUR : aucune dépendance au DOM, à History, au réseau. Analyser un
// chemin, en construire un, dire quelle route est affichable — tout cela se
// teste sans navigateur, et c'est là que vivent les règles.
//
// SCHÉMA D'URL
//   /                       la semaine courante — la racine, onglet Séances
//   /semaine/AAAA-MM-JJ     une semaine, désignée par son lundi
//   /seance/<uuid>          le détail d'une séance
//   /saisie                 onglet Saisie
//   /progression            onglet Progression
//   /profil                 onglet Profil
//   /connexion              l'écran de connexion
//
// Les trois onglets reprennent la forme de /connexion : un segment, en clair,
// sans paramètre. Chaque onglet est une VUE du routeur, avec son URL — pas un
// basculement d'affichage : un rechargement direct rouvre le bon onglet.
//
// La semaine est désignée par la DATE de son lundi, pas par un numéro ISO :
// « /semaine/2026-09-07 » se lit sans décoder, se partage tel quel, et évite
// les pièges de la numérotation ISO (années à 53 semaines, semaine 1 à cheval).
// Un chemin qui pointe un autre jour que le lundi est accepté et ramené au
// lundi de sa semaine — un lien approximatif vaut mieux qu'un 404.

(function (racine) {
  'use strict';

  var RACINE = 'racine', SEMAINE = 'semaine', SEANCE = 'seance', CONNEXION = 'connexion';
  var SAISIE = 'saisie', PROGRESSION = 'progression', PROFIL = 'profil';

  // Vues à segment unique, sans paramètre. La racine n'y figure pas : elle est
  // le chemin « / », et c'est l'onglet Séances.
  var SEGMENTS = {};
  SEGMENTS[CONNEXION] = true; SEGMENTS[SAISIE] = true;
  SEGMENTS[PROGRESSION] = true; SEGMENTS[PROFIL] = true;

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

    if (bouts.length === 1 && SEGMENTS[bouts[0]]) return { vue: bouts[0], params: {} };

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
    if (SEGMENTS[vue]) return '/' + vue;
    return '/';
  }

  // ── Onglets ─────────────────────────────────────────────────────────────
  //
  // Une semaine et le détail d'une séance sont des vues DE l'onglet Séances :
  // elles l'allument, elles n'en ouvrent pas un autre. La connexion n'allume
  // rien — la barre n'y est pas affichée.
  var ONGLETS = [RACINE, SAISIE, PROGRESSION, PROFIL];

  function ongletDe(vue) {
    if (vue === SEMAINE || vue === SEANCE) return RACINE;
    for (var i = 0; i < ONGLETS.length; i++) if (ONGLETS[i] === vue) return vue;
    return null;
  }

  // ── Session et vues authentifiées ────────────────────────────────────────
  //
  // Toutes les vues sauf la connexion montrent les données d'un compte. Sans
  // session, elles ne sont pas rendues : on renvoie à la connexion. Ça ne
  // protège rien — le RLS reste seul juge côté serveur — mais afficher des
  // données à quelqu'un qui vient de se déconnecter est un défaut d'interface.
  function exigeSession(vue) { return vue !== CONNEXION; }

  // Route demandée -> route réellement affichable. `redirigeDepuis` dit d'où
  // l'on vient, pour que l'appelant puisse corriger l'URL.
  function routeAffichable(route, contexte) {
    var ctx = contexte || {};
    var vue = (route && route.vue) || RACINE;
    if (exigeSession(vue) && !ctx.session) {
      return { vue: CONNEXION, params: {}, redirigeDepuis: vue };
    }
    return route && route.vue ? route : { vue: RACINE, params: {} };
  }

  // ── Le point d'accroche des gardes ───────────────────────────────────────
  //
  // Une garde est une fonction qui rend un objet quand elle refuse la sortie
  // (avec de quoi se présenter), ou rien quand elle laisse passer. C'est ce
  // que l'écran de saisie utilisera pour retenir une séance en cours — avec sa
  // propre confirmation, légitime celle-là : elle protège un travail en cours,
  // elle ne prétend pas fermer l'application, ce qu'aucune page ne peut faire.
  //
  // Ce qui a disparu ici : `decisionRetour`. Le retour ne se décide plus par
  // la vue — il est absorbé au fond de la pile et navigue au-dessus — et cette
  // décision-là vit désormais avec l'historique, dans v2/js/sortie.js.
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
    SAISIE: SAISIE, PROGRESSION: PROGRESSION, PROFIL: PROFIL,
    versDate: versDate,
    depuisDate: depuisDate,
    analyser: analyser,
    construire: construire,
    ONGLETS: ONGLETS,
    ongletDe: ongletDe,
    exigeSession: exigeSession,
    routeAffichable: routeAffichable,
    premiereGardeBloquante: premiereGardeBloquante
  };

  racine.THRouteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
