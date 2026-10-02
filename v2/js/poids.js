// v2/js/poids.js — le poids de corps.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache. Ce qui décide —
// quelle pesée est la dernière, sur quoi porte une variation, où tombe un point
// sur la courbe — vit ici et se teste sans navigateur.
//
// COLONNES RELEVÉES AU SCHÉMA, pas supposées (table `body_weight_log`) :
//   id uuid · user_id uuid · date date · poids_kg numeric · source text
//   · created_at timestamptz · masse_grasse_pct numeric (nullable)
// `masse_grasse_pct` existe et n'est pas lue ici : elle n'a pas d'écran.
//
// ⚠️ `date` est une colonne DATE, pas un timestamp : elle arrive en
// « AAAA-MM-JJ ». `new Date('2026-08-30')` la lit en UTC — sous un fuseau
// négatif, le 30 août deviendrait le 29. On lit donc les composantes une à une
// et on construit une date LOCALE à minuit, comme le routeur le fait déjà pour
// les lundis de semaine.
//
// RIEN N'EST JUGÉ ICI. Pas d'objectif, pas de poids cible, pas de seuil, pas de
// commentaire sur la variation — donc rien qui puisse porter une couleur de
// verdict. Une pesée est un fait (CADRAGE-V2 §3.1 bis).

(function (racine) {
  'use strict';

  var RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})/;

  // Marge intérieure de la courbe : sans elle, le disque du dernier point est
  // rogné par le bord du cadre.
  var MARGE = 6;

  // L'arrondi SYMÉTRIQUE vit dans le formateur unique (`modele.js`, PR 7) :
  // le même pour les écarts de poids et pour tous les nombres affichés.
  function arrondi(v, decimales) { return racine.THModele.arrondi(v, decimales); }

  function depuisJour(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var m = RE_JOUR.exec(String(v == null ? '' : v));
    if (!m) return null;
    var an = +m[1], mois = +m[2] - 1, jour = +m[3];
    var d = new Date(an, mois, jour, 0, 0, 0, 0);
    if (d.getFullYear() !== an || d.getMonth() !== mois || d.getDate() !== jour) return null;
    return d;
  }

  // Lignes brutes -> pesées triées de la PLUS ANCIENNE à la plus récente.
  // Une ligne sans date lisible ou sans poids fini est écartée : elle ne peut
  // ni se placer sur une courbe, ni entrer dans une variation.
  function normaliser(lignes) {
    var out = [];
    (lignes || []).forEach(function (l) {
      if (!l) return;
      var d = depuisJour(l.date);
      // `Number(null)` vaut ZÉRO, pas NaN : sans ce test explicite, une pesée
      // sans poids entrerait dans la série à 0 kg et écraserait toute l'échelle
      // de la courbe. La colonne est NOT NULL au schéma — une garde qui
      // fabrique un 0 reste pire que pas de garde du tout.
      if (l.poids_kg === null || l.poids_kg === undefined || l.poids_kg === '') return;
      var p = Number(l.poids_kg);
      if (!d || !isFinite(p)) return;
      out.push({ date: d, poids: p, source: l.source || null });
    });
    out.sort(function (a, b) { return a.date - b.date; });
    return out;
  }

  // ── Le bloc de sommaire ─────────────────────────────────────────────────
  //
  // La variation se mesure depuis la PESÉE PRÉCÉDENTE, datée, et non « sur
  // trois mois ». C'est un écart avec la maquette, et il est mesuré : sur les
  // données réelles, UNE SEULE pesée tombe dans les 90 derniers jours et quatre
  // dans les 365 — 93 des 114 sont en 2024, avec un trou de 233 jours. Une
  // ligne « sur 3 mois » serait donc vide pour le seul compte qui a des pesées.
  // L'écart avec la pesée précédente existe dès qu'il y a deux mesures, il dit
  // lui-même sur quelle durée il porte, et il n'invente rien.
  function resume(lignes) {
    var liste = normaliser(lignes);
    if (!liste.length) return null;
    var derniere = liste[liste.length - 1];
    var avant = liste.length > 1 ? liste[liste.length - 2] : null;
    return {
      poids: arrondi(derniere.poids),
      date: derniere.date,
      nb: liste.length,
      variation: avant
        ? { valeur: arrondi(derniere.poids - avant.poids), depuis: avant.date }
        : null
    };
  }

  // ── Périodes de la courbe ───────────────────────────────────────────────
  //
  // « Tout » par défaut : c'est la seule des trois qui montre quelque chose sur
  // un suivi irrégulier, et c'est le trajet complet qui répond à « où j'en
  // suis ». Les deux autres restent offertes pour un suivi dense.
  var PERIODES = [
    { cle: '3mois', libelle: '3 mois', jours: 90 },
    { cle: '1an', libelle: '1 an', jours: 365 },
    { cle: 'tout', libelle: 'Tout', jours: null }
  ];
  var PERIODE_DEFAUT = 'tout';

  function periodeDe(cle) {
    for (var i = 0; i < PERIODES.length; i++) if (PERIODES[i].cle === cle) return PERIODES[i];
    return PERIODES[PERIODES.length - 1];
  }

  // La fenêtre est ancrée sur AUJOURD'HUI, pas sur la dernière pesée : « les
  // trois derniers mois » veut dire les trois derniers mois, même si on ne
  // s'est pas pesé depuis. Une fenêtre ancrée sur la dernière mesure dirait
  // toujours qu'on vient de se peser.
  function filtrer(lignes, jours, aujourdhui) {
    var liste = normaliser(lignes);
    if (!jours) return liste;
    var ref = aujourdhui instanceof Date ? aujourdhui : new Date();
    var debut = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - jours + 1, 0, 0, 0, 0);
    return liste.filter(function (p) { return p.date >= debut; });
  }

  // ── La courbe ───────────────────────────────────────────────────────────
  //
  // LES POINTS SONT ESPACÉS PAR LA DATE, jamais par leur rang. Mesuré sur les
  // données réelles : 93 des 114 pesées tombent en 2024, sept en 2025, quatre
  // en 2026, et l'écart le plus long vaut 233 jours. Espacées uniformément, ces
  // pesées raconteraient un suivi régulier qui n'a jamais existé — la courbe
  // mentirait sur le temps, qui est justement son axe.
  //
  // Prend la sortie de `filtrer` (des pesées déjà normalisées et triées).
  // L'échelle verticale est celle de la FENÊTRE, pas zéro : un poids de corps
  // varie de deux kilos sur cent, et une échelle depuis zéro l'aplatirait en
  // ligne droite. Elle décrit, elle ne compare à rien.
  function courbe(pesees, largeur, hauteur) {
    var liste = pesees || [];
    var L = Number(largeur) > 0 ? Number(largeur) : 300;
    var H = Number(hauteur) > 0 ? Number(hauteur) : 104;
    if (!liste.length) {
      return { points: [], min: null, max: null, debut: null, fin: null, largeur: L, hauteur: H };
    }

    var min = liste[0].poids, max = liste[0].poids;
    liste.forEach(function (p) {
      if (p.poids < min) min = p.poids;
      if (p.poids > max) max = p.poids;
    });

    var t0 = liste[0].date.getTime();
    var t1 = liste[liste.length - 1].date.getTime();
    var etendue = t1 - t0;
    var amplitude = max - min;
    var haut = MARGE, bas = H - MARGE;
    var gauche = MARGE, droite = L - MARGE;

    var points = liste.map(function (p) {
      var x = etendue > 0
        ? gauche + ((p.date.getTime() - t0) / etendue) * (droite - gauche)
        : (gauche + droite) / 2;
      var y = amplitude > 0
        ? bas - ((p.poids - min) / amplitude) * (bas - haut)
        : (haut + bas) / 2;
      return { x: arrondi(x, 2), y: arrondi(y, 2), date: p.date, poids: p.poids };
    });

    return {
      points: points, min: min, max: max,
      debut: liste[0].date, fin: liste[liste.length - 1].date,
      largeur: L, hauteur: H
    };
  }

  // Les dernières pesées, la plus récente d'abord, avec l'écart depuis celle
  // qui la précède dans le temps. Un fait par ligne, aucune appréciation.
  function dernieres(pesees, combien) {
    var liste = pesees || [];
    var n = Math.max(0, Math.round(Number(combien) || 0)) || liste.length;
    var out = [];
    for (var i = liste.length - 1; i >= 0 && out.length < n; i--) {
      out.push({
        date: liste[i].date, poids: arrondi(liste[i].poids), source: liste[i].source,
        ecart: i > 0 ? arrondi(liste[i].poids - liste[i - 1].poids) : null
      });
    }
    return out;
  }

  var api = {
    MARGE: MARGE,
    PERIODES: PERIODES,
    PERIODE_DEFAUT: PERIODE_DEFAUT,
    depuisJour: depuisJour,
    normaliser: normaliser,
    resume: resume,
    periodeDe: periodeDe,
    filtrer: filtrer,
    courbe: courbe,
    dernieres: dernieres
  };

  racine.THPoids = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
