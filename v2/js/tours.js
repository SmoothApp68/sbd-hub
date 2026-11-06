// v2/js/tours.js — l'ORDRE D'AFFICHAGE d'un superset en séance : par TOURS (261, maquette-superset-entrelace-v4).
//
// Un superset s'affiche en blocs : « CHAUFFE » (les chauffes qui existent), « SEUL » (des séries d'un même exercice faites
// d'affilée AVANT l'alternance), puis « TOUR 1 », « TOUR 2 »… : dans un tour, A puis B (puis C). Ce module ne décide rien du
// coach (aucune charge, aucune règle) : il range des séries EXISTANTES pour l'écran. Pur : aucun DOM, aucune horloge, aucune
// écriture ; les séries sont lues, jamais copiées ni modifiées (`_iExo` / `_iSerie` voyagent avec elles).
//
// LES RÈGLES (validées par Aurélien le 06/11/2026) :
//   · rien ne bouge sous le pouce : une série garde sa place quand on en coche une autre. Le tour d'une série est le rang de son
//     paquet dans SON exercice (A3 et B3 sont au tour 3, que B2 soit faite ou non : B2 reste vide dans le tour 2) ;
//   · UNE SEULE exception, dite par le bloc « SEUL » : des séries d'un même exercice FAITES D'AFFILÉE en tête de la chronologie
//     réelle (`validee_a`), deux au moins, avant que l'autre exercice ait été touché. Elles se lisent dans l'ordre où elles ont
//     été faites ; les tours reprennent ensuite, renumérotés à partir de 1, avec ce qui reste (la série suivante de A rejoint
//     la première de B) ;
//   · une dégressive (ou un échec) prolonge la série qui la précède : elle reste sous elle, dans son tour, avant l'autre
//     exercice, et n'ouvre pas de tour (`Modele.paqueter`, la même découpe que l'éditeur de routine) ;
//   · les chauffes forment un bloc avant le tour 1 (jamais un « tour 0 »), seulement celles qui existent ;
//   · le dernier tour dit qui reste seul (« Couché seul : Pull-over a 3 séries. ») quand un exercice a fini avant les autres.
//
// ordonner(bloc) -> { blocs: [{ genre: 'chauffe'|'seul'|'tour', n, iExo (seul), lignes: [série], phrase: string|null }],
//                     nbTours }

(function (racine) {
  'use strict';

  function Modele() { return racine.THModele; }

  function estChauffe(s) { return !!s && s.type_serie === 'echauffement'; }
  function heure(s) { var t = s && s.validee_a ? Date.parse(s.validee_a) : NaN; return isNaN(t) ? null : t; }

  // Un paquet = une série de travail et ce qui la prolonge (dégressive, échec). Son instant = celui de sa série de travail.
  function instantDuPaquet(p) {
    for (var i = 0; i < p.length; i++) if (Modele().estTravail(p[i])) return heure(p[i]);
    return heure(p[0]);
  }
  function faitDuPaquet(p) {
    for (var i = 0; i < p.length; i++) if (Modele().estTravail(p[i])) return !!p[i].faite;
    return !!p[0].faite;
  }

  // Le nom court d'un exercice : celui des phrases du coach, casse gardée, sans la précision entre parenthèses.
  function nomDe(x) { return Modele().nomParle(x && x.nom); }

  // Les chauffes, en tours entre exercices (A B · A B) : un premier passage léger sur chaque machine, un second sur celles qui
  // en ont besoin. Elles ne comptent pas dans les tours.
  function lignesDeChauffe(exercices) {
    var parExo = exercices.map(function (x) { return (x.series || []).filter(estChauffe); });
    var prof = parExo.reduce(function (m, l) { return Math.max(m, l.length); }, 0), sortie = [];
    for (var t = 0; t < prof; t++) parExo.forEach(function (l) { if (l[t]) sortie.push(l[t]); });
    return sortie;
  }

  function ordonner(bloc) {
    var exercices = (bloc && bloc.exercices) || [];
    var blocs = [];

    var chauffes = lignesDeChauffe(exercices);
    if (chauffes.length) blocs.push({ genre: 'chauffe', n: 0, iExo: null, lignes: chauffes, phrase: null });

    // Les paquets de travail de chaque exercice, dans l'ordre de la routine (les séries d'un exercice arrivent rangées).
    var paquets = exercices.map(function (x) {
      return Modele().paqueter((x.series || []).filter(function (s) { return !estChauffe(s); }));
    });

    // SEUL : la tête de la chronologie réelle. On ne regarde que les paquets FAITS qui portent une heure ; la tête est la suite,
    // du plus ancien, des paquets d'un même exercice, et il en faut deux au moins.
    var faits = [];
    paquets.forEach(function (liste, e) {
      liste.forEach(function (p, k) {
        var t = faitDuPaquet(p) ? instantDuPaquet(p) : null;
        if (t !== null) faits.push({ e: e, k: k, t: t, p: p });
      });
    });
    faits.sort(function (a, b) { return a.t - b.t || a.e - b.e || a.k - b.k; });
    var tete = [];
    if (exercices.length > 1 && faits.length) {
      for (var i = 0; i < faits.length && faits[i].e === faits[0].e; i++) tete.push(faits[i]);
    }
    if (tete.length >= 2) {
      var ligS = [];
      tete.forEach(function (f) { ligS = ligS.concat(f.p); paquets[f.e][f.k] = null; });
      blocs.push({ genre: 'seul', n: 0, iExo: exercices[tete[0].e]._iExo === undefined ? null : exercices[tete[0].e]._iExo,
        lignes: ligS, phrase: null });
      paquets = paquets.map(function (l) { return l.filter(function (p) { return p !== null; }); });
    }

    // LES TOURS : le t-ième paquet de chaque exercice, dans l'ordre de la routine.
    var prof = paquets.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    var tours = [];
    for (var t = 0; t < prof; t++) {
      var lignes = [], presents = [];
      paquets.forEach(function (l, e) { if (l[t]) { lignes = lignes.concat(l[t]); presents.push(e); } });
      tours.push({ genre: 'tour', n: t + 1, iExo: null, lignes: lignes, phrase: null, presents: presents });
    }
    // Le dernier tour dit qui reste seul. L'exercice dont toutes les séries sont ailleurs (un SEUL qui les a prises toutes) n'a
    // plus de série de travail dans les tours : il n'est « absent » que s'il en a eu.
    if (tours.length) {
      var dernier = tours[tours.length - 1];
      var totaux = exercices.map(function (x) {
        return (x.series || []).filter(function (s) { return !estChauffe(s) && Modele().estTravail(s); }).length;
      });
      var absents = [];
      exercices.forEach(function (x, e) { if (dernier.presents.indexOf(e) < 0 && totaux[e] > 0) absents.push(e); });
      if (absents.length && dernier.presents.length) {
        var qui = dernier.presents.map(function (e) { return nomDe(exercices[e]); });
        var reste = absents.map(function (e) {
          return nomDe(exercices[e]) + ' a ' + totaux[e] + ' série' + (totaux[e] > 1 ? 's' : '');
        });
        var sans = absents.map(function (e) { return nomDe(exercices[e]); });
        dernier.phrase = (qui.length === 1 ? qui[0] + ' seul' : Modele().enumerer(qui) + ' sans ' + Modele().enumerer(sans)) +
          '\u00a0: ' + Modele().enumerer(reste) + '.';
      }
    }
    tours.forEach(function (tr) { delete tr.presents; blocs.push(tr); });
    return { blocs: blocs, nbTours: tours.length };
  }

  // La forme d'un exercice dans un superset : rond (A), carré (B), triangle (C) ; au-delà de trois, on recommence (rare).
  var FORMES = ['rond', 'carre', 'triangle'];
  function formeDe(i) { return FORMES[i % FORMES.length]; }

  var api = { ordonner: ordonner, formeDe: formeDe, FORMES: FORMES };
  racine.THTours = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
