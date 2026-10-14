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

  // MOTEUR §9.23 (55-1) — LE RAPPORT AU POIDS : la charge de travail divisée
  // par la pesée la plus récente, si elle a MOINS DE 14 JOURS (au jour du
  // calendrier) ; au centième. `null` sinon — sans charge, sans pesée, ou
  // pesée trop vieille : l'écran dit alors « Pèse-toi pour voir ce rapport. »
  var RAPPORT_JOURS = 14;
  function rapportAuPoids(charge, lignes, jour) {
    var c = Number(charge);
    if (charge === null || charge === undefined || !isFinite(c) || c <= 0) return null;
    var liste = normaliser(lignes);
    if (!liste.length) return null;
    var p = liste[liste.length - 1];
    var j = jour instanceof Date ? jour : (depuisJour(jour) || new Date(jour));
    if (!(j instanceof Date) || isNaN(j.getTime())) return null;
    var ecart = Math.round((Date.UTC(j.getFullYear(), j.getMonth(), j.getDate()) -
      Date.UTC(p.date.getFullYear(), p.date.getMonth(), p.date.getDate())) / 86400000);
    if (ecart < 0 || ecart >= RAPPORT_JOURS) return null;
    return { rapport: Math.round(c / p.poids * 100) / 100, pesee: { date: p.date, poids: p.poids } };
  }

  // ── La pesée qu'on ÉCRIT (60-2a, QUESTIONNAIRE-COACH-V2 §3, écran « Toi ») ──
  //
  // Jusqu'ici une pesée ne se LISAIT que (Hevy, l'import) ; le questionnaire en
  // pose une, et les règles qui disent QUAND vivent ici, pures.
  //
  // `body_weight_log.poids_kg` : 20 < p < 400, un CHECK de la base (relevé par
  // Claude.ai le 07/10/2026). Un refus serveur serait un 23514, que la file
  // classe DÉFINITIF : on refuse avant, ici, à la précision d'une pesée (le
  // dixième de kilo).
  var POIDS_MIN = 20, POIDS_MAX = 400;

  // Le poids d'un nombre déjà lu (`Modele.lireNombre`, côté écran), ou `null`.
  function poidsValide(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    n = arrondi(n, 1);
    return n > POIDS_MIN && n < POIDS_MAX ? n : null;
  }

  // La pesée À ÉCRIRE, ou `null`. « Écrite seulement si la valeur diffère de la
  // dernière pesée, ou s'il n'y en a aucune » : confirmer son poids ne fait pas
  // une pesée de plus. `jour` : « AAAA-MM-JJ », le jour de la personne (le
  // fuseau de l'appareil, jamais l'UTC) ; passé, parce qu'un module pur ne lit
  // pas l'horloge.
  function peseeAEcrire(lignes, poids, jour) {
    var p = poidsValide(poids);
    if (p === null || !RE_JOUR.test(String(jour || ''))) return null;
    var derniere = resume(lignes);
    if (derniere && derniere.poids === p) return null;
    return { date: String(jour).slice(0, 10), poids_kg: p };
  }

  // 92 — LA PESÉE DU PROFIL (ligne « Poids », ECRAN-PROFIL §2.4) : un poids et un jour, tapés. Mêmes bornes que
  // le questionnaire (`poidsValide`, jamais recopiées) ; le jour est celui du champ, par défaut le jour de la
  // personne, jamais après lui. Contrairement au questionnaire, une valeur égale à la dernière pesée S'ÉCRIT :
  // ici la personne pèse, elle ne confirme pas. `poids` : le nombre déjà lu (`Modele.lireNombre`), ou `null`.
  // Rend `{ pesee }` (la forme de `poserPesee`) ou `{ erreur }`, la phrase à poser dans la feuille.
  function peseeDuProfil(poids, jour, aujourdhui) {
    var p = poidsValide(poids);
    if (p === null) return { erreur: 'Un poids entre ' + POIDS_MIN + ' et ' + POIDS_MAX + ' kg.' };
    var j = String(jour || '').slice(0, 10);
    var m = RE_JOUR.exec(j);
    var d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (!d || d.getUTCDate() !== +m[3] || d.getUTCMonth() !== +m[2] - 1) return { erreur: 'Une date valide.' };
    if (RE_JOUR.test(String(aujourdhui || '')) && j > String(aujourdhui).slice(0, 10)) {
      return { erreur: 'Une date passée ou aujourd’hui.' };
    }
    return { pesee: { date: j, poids_kg: p } };
  }

  // Les pesées du serveur, PLUS celles que la file n'a pas encore envoyées.
  // `Sync.remplacer` écraserait une pesée posée hors ligne au premier rafraîchis-
  // sement réussi : la liste du serveur ne la connaît pas encore. Une pesée en
  // attente REMPLACE celle que le serveur a pour le même jour — la file la
  // fusionnera dessus (unicité `user_id, date`) —, sinon la courbe porterait
  // deux points ce jour-là. `enAttente` : `{ [id]: true }`, ce que
  // `Attente.protegees` rend pour cette table.
  function fondreEnAttente(distantes, locales, enAttente) {
    var gardees = (locales || []).filter(function (l) { return l && l.id && enAttente && enAttente[l.id]; });
    var jours = {};
    gardees.forEach(function (l) { jours[l.date] = true; });
    return (distantes || []).filter(function (d) { return !(d && jours[d.date]); }).concat(gardees);
  }

  var api = {
    RAPPORT_JOURS: RAPPORT_JOURS,
    rapportAuPoids: rapportAuPoids,
    MARGE: MARGE,
    PERIODES: PERIODES,
    PERIODE_DEFAUT: PERIODE_DEFAUT,
    POIDS_MIN: POIDS_MIN, POIDS_MAX: POIDS_MAX,
    poidsValide: poidsValide,
    peseeAEcrire: peseeAEcrire,
    peseeDuProfil: peseeDuProfil,
    fondreEnAttente: fondreEnAttente,
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
