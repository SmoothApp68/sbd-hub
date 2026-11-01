// v2/js/courbe.js — la géométrie des courbes d'un exercice (206).
//
// Module PUR, sur le modèle de `poids.js` : aucune dépendance au DOM, au réseau, au cache. Il prend les points du fait
// `faits.pointsDeLExercice` (un par séance : `{ debut, valeur, record, … }`, du plus ancien au plus récent) et rend où ils
// tombent. L'écran dessine ce qu'il lit ; il ne calcule rien.
//
// CE QU'ELLE DIT, CE QU'ELLE NE DIT PAS :
//   · les points sont ESPACÉS PAR LA DATE (jamais par leur rang) : une pause de trois mois se voit ;
//   · le trait est la MOYENNE GLISSANTE des trois dernières séances (`lisser`) : une description, jamais une prédiction.
//     Rien ne prolonge la courbe — projeter est le rôle des paris du coach, qui sont vérifiés ;
//   · l'échelle verticale est celle de la fenêtre (pas zéro), arrondie à des repères ronds.

(function (racine) {
  'use strict';

  var JOUR_MS = 86400000;
  // Les noms de mois sont ceux du formateur (`modele.js`) : lus à l'usage, jamais recopiés ici.
  function mois(i) { return racine.THModele.MOIS_COURTS[i]; }

  // Les quatre périodes. `jours: null` : tout l'historique.
  var PERIODES = [
    { cle: '3m', libelle: '3 mois', jours: 92, long: '3 mois' },
    { cle: '6m', libelle: '6 mois', jours: 183, long: '6 mois' },
    { cle: '1a', libelle: '1 an', jours: 366, long: '1 an' },
    { cle: 'tout', libelle: 'Tout', jours: null, long: 'tout l’historique' }
  ];
  var PERIODE_PAR_DEFAUT = '6m';

  function periodeDe(cle) {
    for (var i = 0; i < PERIODES.length; i++) if (PERIODES[i].cle === cle) return PERIODES[i];
    return PERIODES[1];
  }

  function arrondi(v, d) {
    var f = Math.pow(10, d || 0);
    return Math.round(v * f) / f;
  }

  function temps(p) {
    var t = new Date(p.debut).getTime();
    return isNaN(t) ? null : t;
  }

  // Les points de la période qui finit à `maintenant` (ceux sans date lisible sont écartés).
  function dansLaPeriode(points, cle, maintenant) {
    var per = periodeDe(cle);
    var fin = (maintenant instanceof Date ? maintenant : new Date()).getTime();
    var debut = per.jours === null ? -Infinity : fin - per.jours * JOUR_MS;
    return (points || []).filter(function (p) {
      var t = temps(p);
      return t !== null && t >= debut && t <= fin + JOUR_MS;
    });
  }

  // La moyenne glissante sur `n` séances (3 par défaut) : chaque point devient la moyenne de lui-même et des `n - 1`
  // séances d'avant (moins au début de la fenêtre : jamais une valeur inventée).
  function lisser(points, n) {
    var k = n || 3;
    return (points || []).map(function (p, i) {
      var debut = Math.max(0, i - k + 1), somme = 0;
      for (var j = debut; j <= i; j++) somme += points[j].valeur;
      return { debut: p.debut, valeur: somme / (i - debut + 1) };
    });
  }

  // Un pas rond pour environ `reperes` graduations.
  function pasRond(etendue, reperes) {
    var brut = etendue / Math.max(1, reperes);
    if (!(brut > 0)) return 1;
    var puissance = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10));
    var f = brut / puissance;
    var base = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return base * puissance;
  }

  // L'ÉTENDUE MINIMALE de l'axe vertical : sans elle, 1 kg d'écart sur 133 remplit tout le cadre et paraît dramatique.
  // Charge : au moins 10 % de la valeur médiane ; reps : 4 ; secondes : 10. Centrée sur les données (`encadrer`).
  function etendueMinimale(genre, valeurs) {
    if (genre === 'reps') return 4;
    if (genre === 'temps') return 10;
    var v = (valeurs || []).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return 1;
    var m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return Math.abs(m) * 0.1;
  }
  // Les bornes [bas, haut] d'une fenêtre, élargies autour de son centre jusqu'à l'étendue minimale.
  function encadrer(genre, min, max, valeurs) {
    var mini = etendueMinimale(genre, valeurs), c = (min + max) / 2, e = max - min;
    return e >= mini ? [min, max] : [c - mini / 2, c + mini / 2];
  }

  // Le départ et la fin affichés d'une fenêtre : premier et dernier point, avec l'écart. `null` sous deux points.
  function resume(points) {
    var l = points || [];
    if (!l.length) return null;
    var debut = l[0].valeur, fin = l[l.length - 1].valeur;
    return { debut: debut, fin: fin, ecart: l.length > 1 ? fin - debut : null, n: l.length };
  }

  // La géométrie complète d'une courbe de page : points (pâles), trait (moyenne glissante), graduations, repères de mois.
  //   cadre : { largeur, hauteur, gauche, droite, haut, bas } (valeurs par défaut : le 340 × 150 de la maquette).
  function geometrie(points, cadre, genre) {
    var c = cadre || {};
    var L = c.largeur > 0 ? c.largeur : 340, H = c.hauteur > 0 ? c.hauteur : 150;
    var gauche = c.gauche !== undefined ? c.gauche : 34, droite = c.droite !== undefined ? c.droite : L - 6;
    var haut = c.haut !== undefined ? c.haut : 14, bas = c.bas !== undefined ? c.bas : 110;
    var liste = (points || []).filter(function (p) { return temps(p) !== null; });
    var vide = { largeur: L, hauteur: H, points: [], trait: [], graduations: [], mois: [], min: null, max: null };
    if (!liste.length) return vide;

    var lisse = lisser(liste, 3);
    var min = Infinity, max = -Infinity;
    liste.forEach(function (p) { if (p.valeur < min) min = p.valeur; if (p.valeur > max) max = p.valeur; });
    // 3 graduations rondes qui encadrent la fenêtre.
    var large = encadrer(genre, min, max, liste.map(function (p) { return p.valeur; }));
    var pas = pasRond(large[1] - large[0], 3);
    var bornBas = Math.floor(large[0] / pas + 1e-9) * pas, bornHaut = Math.ceil(large[1] / pas - 1e-9) * pas;
    if (bornHaut === bornBas) bornHaut = bornBas + pas;
    var graduations = [];
    for (var g = bornBas; g <= bornHaut + pas / 1000; g += pas) graduations.push(arrondi(g, 4));

    var t0 = temps(liste[0]), t1 = temps(liste[liste.length - 1]);
    var etendue = t1 - t0;
    function x(t) { return etendue > 0 ? gauche + ((t - t0) / etendue) * (droite - gauche) : (gauche + droite) / 2; }
    function y(v) { return bas - ((v - bornBas) / (bornHaut - bornBas)) * (bas - haut); }

    var pts = liste.map(function (p, i) {
      return { x: arrondi(x(temps(p)), 2), y: arrondi(y(p.valeur), 2), valeur: p.valeur, debut: p.debut,
               record: !!p.record, charge: p.charge === undefined ? null : p.charge, reps: p.reps === undefined ? null : p.reps, i: i };
    });
    var trait = lisse.map(function (p) { return { x: arrondi(x(temps(p)), 2), y: arrondi(y(p.valeur), 2) }; });

    // Les repères de mois : le premier de chaque mois dans la fenêtre, éclaircis à 4 au plus.
    var reperes = [];
    var d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth(), 1);
    if (d.getTime() < t0) d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    while (d.getTime() <= t1) {
      reperes.push({ t: d.getTime(), libelle: mois(d.getMonth()) + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '') });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    var pasM = Math.max(1, Math.ceil(reperes.length / 4));
    var reperesMois = reperes.filter(function (r, i) { return i % pasM === 0; }).map(function (r) {
      return { x: arrondi(x(r.t), 2), libelle: r.libelle };
    });

    return {
      largeur: L, hauteur: H, gauche: gauche, droite: droite, haut: haut, bas: bas,
      points: pts, trait: trait,
      graduations: graduations.map(function (v) { return { valeur: v, y: arrondi(y(v), 2) }; }),
      mois: reperesMois, min: min, max: max
    };
  }

  // La mini-courbe de Progression : un trait seul (la moyenne glissante, la même que sur la page) et le dernier point
  // (ambre quand la dernière séance est un record). Cadre 92 × 36 de la maquette.
  function mini(points, largeur, hauteur, genre) {
    var L = largeur > 0 ? largeur : 92, H = hauteur > 0 ? hauteur : 36, marge = 3;
    var liste = (points || []).filter(function (p) { return temps(p) !== null; });
    if (liste.length < 2) return { largeur: L, hauteur: H, trait: [], dernier: null };
    var lisse = lisser(liste, 3);
    var min = Infinity, max = -Infinity;
    lisse.forEach(function (p) { if (p.valeur < min) min = p.valeur; if (p.valeur > max) max = p.valeur; });
    var large = encadrer(genre, min, max, liste.map(function (p) { return p.valeur; }));
    min = large[0]; max = large[1];
    var t0 = temps(liste[0]), t1 = temps(liste[liste.length - 1]);
    var trait = lisse.map(function (p) {
      var t = temps(p);
      return {
        x: arrondi(t1 > t0 ? marge + ((t - t0) / (t1 - t0)) * (L - 2 * marge) : L / 2, 2),
        y: arrondi(max > min ? (H - marge) - ((p.valeur - min) / (max - min)) * (H - 2 * marge) : H / 2, 2)
      };
    });
    return { largeur: L, hauteur: H, trait: trait, dernier: { x: trait[trait.length - 1].x, y: trait[trait.length - 1].y, record: !!liste[liste.length - 1].record } };
  }

  var api = {
    PERIODES: PERIODES,
    PERIODE_PAR_DEFAUT: PERIODE_PAR_DEFAUT,
    periodeDe: periodeDe,
    dansLaPeriode: dansLaPeriode,
    lisser: lisser,
    pasRond: pasRond,
    etendueMinimale: etendueMinimale,
    resume: resume,
    geometrie: geometrie,
    mini: mini
  };
  racine.THCourbe = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
