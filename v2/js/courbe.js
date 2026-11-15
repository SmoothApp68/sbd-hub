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

  // Les noms de mois sont ceux du formateur (`modele.js`) : lus à l'usage, jamais recopiés ici.
  function mois(i) { return racine.THModele.MOIS_COURTS[i]; }

  // Les quatre périodes. Leur longueur en jours (3 mois = 90, 6 mois = 183, 1 an = 366 ; `null` : tout l'historique) n'est
  // PAS écrite ici : elle se lit dans `THPeriode.JOURS_DE`, la même que le Parcours et le radar (PR 6 des mots, R-NOMMEES).
  var PERIODES = [
    { cle: '3m', libelle: '3 mois', long: '3 mois' },
    { cle: '6m', libelle: '6 mois', long: '6 mois' },
    { cle: '1a', libelle: '1 an', long: '1 an' },
    { cle: 'tout', libelle: 'Tout', long: 'tout l’historique' }
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

  // Les points de la période qui finit à `maintenant` (ceux sans date lisible sont écartés). PR 6 des mots : la période est une
  // FENÊTRE EN JOURS CIVILS LOCAUX (`THPeriode.fenetres`, minuit du premier jour à 23:59:59.999 du jour de `maintenant`), la
  // même que le radar — plus `maintenant − N × 24 h`, qui coupait « à 13 h » au changement d'heure et tolérait un jour de futur.
  function dansLaPeriode(points, cle, maintenant) {
    var per = periodeDe(cle), P = racine.THPeriode;
    var ref = maintenant instanceof Date ? maintenant : new Date();
    var jours = per.cle === 'tout' ? null : P.JOURS_DE[per.cle];
    var f = P.fenetres(jours === null ? 1 : jours, ref).courante;
    var debut = jours === null ? -Infinity : f.debut.getTime(), fin = f.fin.getTime();
    return (points || []).filter(function (p) {
      var t = temps(p);
      return t !== null && t >= debut && t <= fin;
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

  // « UN SEUL MAX » (MOTEUR §9.51, I175) — un point GRIS est d'avant la fenêtre de la fiche (`faits.pointsDeLExercice`, `gris`) :
  // il se dessine creux, mais le trait, le dernier chiffre, le sommet et l'écart ne lisent QUE les points pleins.
  function pleins(points) { return (points || []).filter(function (p) { return !p.gris; }); }

  // Le départ et la fin affichés d'une fenêtre : premier et dernier point PLEIN, avec l'écart. `null` sans point plein.
  function resume(points) {
    var l = pleins(points);
    if (!l.length) return null;
    var debut = l[0].valeur, fin = l[l.length - 1].valeur;
    // `du` / `au` (PR 6 des mots) : les dates des DEUX séances que l'écart compare (la 1re et la dernière de la fenêtre) — le texte les dit.
    // `mode` : celui du dernier point (un plancher se dit « au moins », §9.51.6.8).
    return { debut: debut, fin: fin, ecart: l.length > 1 ? fin - debut : null, n: l.length, du: l[0].debut || null, au: l[l.length - 1].debut || null,
             mode: l[l.length - 1].mode || null, modeDebut: l[0].mode || null };
  }

  // LE TRAJET (§9.51 bis, I181) — « 87 → 92 kg, du 18 mai au 18 oct. » : le premier et le dernier point PLEIN de la vue, avec leurs deux
  // chiffres et leurs deux dates. Il n'est ÉCRIT que si les DEUX bouts sont des projections et qu'il y a deux points pleins ou plus :
  // un plancher (« au moins 150 kg », une charge nue) ne se soustrait jamais d'une projection (150 × 1 contre 140 donnait « −10 kg »,
  // une baisse qui n'existe pas), et deux bornes basses ne font pas une tendance. Le chiffre de TÊTE n'est pas lu ici : c'est la `force`
  // de la fiche (`Modele.libelleDeForce`). `null` hors charge × reps (reps et temps gardent `resume`) ou sans point plein.
  //   · `court` : ce que dit Progression (« 87 → 92 kg » ; « 92 kg » si les deux chiffres affichés sont égaux ; sans trajet, le dernier
  //     point plein dans son mode : « 140 kg », « au moins 150 kg ») ; `texte` : la phrase de la page (`court` + les deux dates), « » sans trajet.
  function trajet(points, genre, aujourdhui) {
    if (genre !== undefined && genre !== 'charge') return null;
    var l = pleins(points);
    if (!l.length) return null;
    var M = racine.THModele, P = racine.THPeriode;
    var prem = l[0], der = l[l.length - 1];
    var lp = M.libelleDeForce(prem, aujourdhui), lf = M.libelleDeForce(der, aujourdhui);
    if (!lp || !lf) return null;
    var ecrit = l.length > 1 && lp.mode === 'projection' && lf.mode === 'projection';
    var egaux = ecrit && lp.nombre === lf.nombre;
    var court = ecrit && !egaux ? M.nombreTexte(lp.nombre) + ' \u2192 ' + lf.chiffre : lf.texteCourt;
    var plage = '';
    if (ecrit && prem.debut && der.debut) plage = M.plageDeJours(P.jourISO(new Date(prem.debut)), P.jourISO(new Date(der.debut)), aujourdhui);
    return { n: l.length, debut: prem.valeur, fin: der.valeur, du: prem.debut || null, au: der.debut || null, mode: lf.mode, modeDebut: lp.mode,
             ecrit: ecrit, ecart: ecrit ? arrondi(lf.nombre - lp.nombre, 1) : null, debutTexte: lp.chiffre, finTexte: lf.chiffre, court: court,
             texte: ecrit ? (egaux ? 'inchangé à ' + lf.chiffre : court) + (plage ? ', ' + plage : '') : '' };
  }

  // Le PIC ANCIEN (§9.51.6.5, I176, I182) : le plus haut point gris de la vue — `null` sans point gris. Il est retenu s'il DÉPASSE la
  // force AFFICHÉE (`force`, celle de la fiche : les deux nombres tels que `Modele.libelleDeForce` les écrit — au kg une projection, au
  // dixième un plancher : jamais « Pic ancien 187 kg » sous un « ≈ 187 kg », jamais 152,5 arrondi vers le haut) ; sans force à comparer
  // (aucun point plein dans la vue), il est dit seul. Il rend son MODE (un pic plancher se dit « au moins »), sa charge et ses reps.
  function picAncien(points, force, aujourdhui) {
    var pic = null;
    (points || []).forEach(function (p) { if (p.gris && (pic === null || p.valeur > pic.valeur)) pic = p; });
    if (!pic) return null;
    if (force) {
      var M = racine.THModele, lp = M.libelleDeForce(pic, aujourdhui), lf = M.libelleDeForce(force, aujourdhui);
      if (lp && lf && !(lp.nombre > lf.nombre)) return null;
    }
    return { valeur: pic.valeur, debut: pic.debut, mode: pic.mode || null,
             charge: pic.charge === undefined ? null : pic.charge, reps: pic.reps === undefined ? null : pic.reps };
  }

  // La géométrie complète d'une courbe de page : points (pâles), trait (moyenne glissante), graduations, repères de mois.
  //   cadre : { largeur, hauteur, gauche, droite, haut, bas } (valeurs par défaut : le 340 × 150 de la maquette).
  //   mesures : les max MESURÉS d'une semaine de test dans la vue (`[{ debut, valeur, charge, reps }]`) — des repères à part, sur la
  //   même échelle, jamais dans le trait (I177).
  function geometrie(points, cadre, genre, mesures) {
    var c = cadre || {};
    var L = c.largeur > 0 ? c.largeur : 340, H = c.hauteur > 0 ? c.hauteur : 150;
    var gauche = c.gauche !== undefined ? c.gauche : 34, droite = c.droite !== undefined ? c.droite : L - 6;
    var haut = c.haut !== undefined ? c.haut : 14, bas = c.bas !== undefined ? c.bas : 110;
    var liste = (points || []).filter(function (p) { return temps(p) !== null; });
    var vide = { largeur: L, hauteur: H, points: [], trait: [], graduations: [], mois: [], min: null, max: null, mesures: [] };
    if (!liste.length) return vide;

    // Le trait et les bornes (`min`, `max`) ne lisent que les points pleins ; l'ÉCHELLE contient aussi les points creux et les
    // mesures (sans quoi ils sortiraient du cadre).
    var lisse = lisser(pleins(liste), 3);
    var min = Infinity, max = -Infinity, bas0 = Infinity, haut0 = -Infinity;
    var repMesures = (mesures || []).filter(function (p) { return temps(p) !== null; });
    liste.concat(repMesures).forEach(function (p) { if (p.valeur < bas0) bas0 = p.valeur; if (p.valeur > haut0) haut0 = p.valeur; });
    pleins(liste).forEach(function (p) { if (p.valeur < min) min = p.valeur; if (p.valeur > max) max = p.valeur; });
    if (min === Infinity) { min = null; max = null; }
    // 3 graduations rondes qui encadrent la fenêtre.
    var large = encadrer(genre, bas0, haut0, liste.concat(repMesures).map(function (p) { return p.valeur; }));
    var pas = pasRond(large[1] - large[0], 3);
    var bornBas = Math.floor(large[0] / pas + 1e-9) * pas, bornHaut = Math.ceil(large[1] / pas - 1e-9) * pas;
    if (bornHaut === bornBas) bornHaut = bornBas + pas;
    var graduations = [];
    for (var g = bornBas; g <= bornHaut + pas / 1000; g += pas) graduations.push(arrondi(g, 4));

    var t0 = temps(liste[0]), t1 = temps(liste[liste.length - 1]);
    repMesures.forEach(function (p) { var t = temps(p); if (t < t0) t0 = t; if (t > t1) t1 = t; });
    var etendue = t1 - t0;
    function x(t) { return etendue > 0 ? gauche + ((t - t0) / etendue) * (droite - gauche) : (gauche + droite) / 2; }
    function y(v) { return bas - ((v - bornBas) / (bornHaut - bornBas)) * (bas - haut); }

    var pts = liste.map(function (p, i) {
      // Un point creux ne porte jamais l'anneau « record » (et n'en calcule pas : `record` se lit à la demande).
      return { x: arrondi(x(temps(p)), 2), y: arrondi(y(p.valeur), 2), valeur: p.valeur, debut: p.debut,
               record: p.gris ? false : !!p.record, charge: p.charge === undefined ? null : p.charge, reps: p.reps === undefined ? null : p.reps,
               mode: p.mode || null, gris: !!p.gris, i: i };
    });
    var trait = lisse.map(function (p) { return { x: arrondi(x(temps(p)), 2), y: arrondi(y(p.valeur), 2) }; });

    // Les repères de mois : le premier de chaque mois dans la fenêtre, éclaircis à 4 au plus. PR 6 des mots : si la fenêtre CHEVAUCHE deux
    // années, chaque repère porte son année (« avr. 2024 · déc. 2024 · août 2025 ») — plus seulement le 1er janvier ; sinon aucune année.
    var reperes = [];
    var avecAnnee = new Date(t0).getFullYear() !== new Date(t1).getFullYear();
    var d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth(), 1);
    if (d.getTime() < t0) d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    while (d.getTime() <= t1) {
      var cle = d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
      reperes.push({ t: d.getTime(), libelle: avecAnnee ? racine.THModele.libelleDePeriode({ genre: 'mois', cle: cle, forme: 'axe' }) : mois(d.getMonth()) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    var pasM = Math.max(1, Math.ceil(reperes.length / 4));
    var reperesMois = reperes.filter(function (r, i) { return i % pasM === 0; }).map(function (r) {
      return { x: arrondi(x(r.t), 2), libelle: r.libelle };
    });

    return {
      largeur: L, hauteur: H, gauche: gauche, droite: droite, haut: haut, bas: bas,
      points: pts, trait: trait,
      mesures: repMesures.map(function (p) {
        return { x: arrondi(x(temps(p)), 2), y: arrondi(y(p.valeur), 2), valeur: p.valeur, debut: p.debut,
                 charge: p.charge === undefined ? null : p.charge, reps: p.reps === undefined ? null : p.reps };
      }),
      graduations: graduations.map(function (v) { return { valeur: v, y: arrondi(y(v), 2) }; }),
      mois: reperesMois, min: min, max: max
    };
  }

  // La mini-courbe de Progression : un trait seul (la moyenne glissante, la même que sur la page) et le dernier point
  // (ambre quand la dernière séance est un record). Cadre 92 × 36 de la maquette.
  function mini(points, largeur, hauteur, genre) {
    var L = largeur > 0 ? largeur : 92, H = hauteur > 0 ? hauteur : 36, marge = 3;
    var liste = pleins(points).filter(function (p) { return temps(p) !== null; });
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
    trajet: trajet,
    picAncien: picAncien,
    geometrie: geometrie,
    mini: mini
  };
  racine.THCourbe = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
