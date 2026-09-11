// v2/js/periode.js — deux périodes qui se comparent, et la géométrie du radar.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache, au catalogue.
// Il reçoit des volumes par zone déjà calculés (THSemaine.volumeParZone) et
// n'en refait aucun : une seule définition du volume dans l'app, celle de
// REGLE-VOLUME-V2.
//
// FENÊTRES GLISSANTES, PAS DES MOIS CALENDAIRES. C'est le seul écart assumé
// avec la maquette, qui illustre « août contre juillet ». Un mois calendaire
// compare un mois ENTAMÉ à un mois COMPLET : le 1er septembre, le radar
// s'effondre à un jour de données contre trente-et-un, sans que rien n'ait
// changé dans l'entraînement — et l'app n'a aucun moyen de le dire. Deux
// fenêtres de MÊME LONGUEUR ne peuvent pas fabriquer cet artefact.
//
// RIEN N'EST JUGÉ ICI. Deux périodes se comparent, elles ne se jugent pas
// (CADRAGE-V2 §3.1 bis) : aucune flèche, aucun pourcentage de variation,
// aucun sens attribué à l'écart. Le module rend deux nombres côte à côte.

(function (racine) {
  'use strict';

  var PERIODES = [
    // `courante` / `precedente` légendent le radar ; `avant` sert aux cartes,
    // où « 123 SUR 30 jours précédents » se lirait comme une fraction — « 123
    // sur 30 » est une proportion, pas une période. Sans « sur », le nombre
    // reste un compte.
    { cle: '30j', libelle: '30 jours', jours: 30,
      courante: '30 derniers jours', precedente: '30 jours précédents',
      avant: 'les 30 jours d\u2019avant' },
    { cle: '3mois', libelle: '3 mois', jours: 90,
      courante: '90 derniers jours', precedente: '90 jours précédents',
      avant: 'les 90 jours d\u2019avant' }
  ];
  var PERIODE_DEFAUT = '30j';

  function periodeDe(cle) {
    for (var i = 0; i < PERIODES.length; i++) if (PERIODES[i].cle === cle) return PERIODES[i];
    return PERIODES[0];
  }

  // Deux fenêtres contiguës et de même longueur, la seconde finissant la veille
  // du début de la première. Bornes en HEURE LOCALE, minuit à 23:59:59.999 :
  // `sessions.debut` est un timestamptz, et le seul repère qui corresponde au
  // vécu est l'heure locale (même règle que semaine.js).
  function fenetres(jours, aujourdhui) {
    var n = Math.max(1, Math.round(Number(jours) || 0));
    var ref = aujourdhui instanceof Date ? aujourdhui : new Date();
    var an = ref.getFullYear(), mois = ref.getMonth(), jour = ref.getDate();

    var debutC = new Date(an, mois, jour - n + 1, 0, 0, 0, 0);
    var finC = new Date(an, mois, jour, 23, 59, 59, 999);
    var debutP = new Date(an, mois, jour - (2 * n) + 1, 0, 0, 0, 0);
    var finP = new Date(an, mois, jour - n, 23, 59, 59, 999);

    return {
      courante: { debut: debutC, fin: finC, jours: n },
      precedente: { debut: debutP, fin: finP, jours: n }
    };
  }

  function dans(date, fenetre) {
    if (!fenetre) return false;
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;
    return d >= fenetre.debut && d <= fenetre.fin;
  }

  // Découpe séances et séries sur une fenêtre. Les séries suivent LEUR SÉANCE :
  // `sets` ne porte aucune date d'entraînement propre — `created_at` est celle
  // de l'import, la même pour des milliers de lignes (cf. donnees.js).
  function decouper(seances, series, fenetre) {
    var gardees = (seances || []).filter(function (s) {
      return s && s.debut && dans(s.debut, fenetre);
    });
    var ids = {};
    gardees.forEach(function (s) { ids[s.id] = true; });
    return {
      seances: gardees,
      series: (series || []).filter(function (s) { return s && ids[s.session_id]; })
    };
  }

  // ── Le radar ────────────────────────────────────────────────────────────
  //
  // Ordre GÉOMÉTRIQUE, dans le sens des aiguilles depuis le haut. Il est fixe
  // et ne dépend pas des volumes : si l'ordre suivait la taille des zones, les
  // deux polygones superposés ne voudraient plus rien dire.
  var ORDRE = ['jambes', 'poitrine', 'epaules', 'tronc', 'bras', 'dos'];

  // `hors-zone` n'entre pas dans le radar — un hexagone a six sommets, et un
  // septième axe en ferait autre chose. Le volume qui s'y trouve reste lisible
  // dans le relevé, juste au-dessus : il n'est escamoté nulle part.
  function indexer(zones) {
    var out = {};
    (zones || []).forEach(function (z) {
      if (z && z.zone) out[z.zone] = Number(z.series) || 0;
    });
    return out;
  }

  // Les six zones dans l'ordre de l'hexagone, avec leurs deux valeurs. Une zone
  // absente d'une période vaut ZÉRO, elle ne manque pas : un sommet qui
  // sauterait déformerait le polygone au lieu de le creuser.
  function comparerZones(zonesCourantes, zonesPrecedentes, table) {
    var libelles = {};
    (table || []).forEach(function (z) { if (z && z.cle) libelles[z.cle] = z.libelle; });
    var c = indexer(zonesCourantes), p = indexer(zonesPrecedentes);

    var zones = ORDRE.map(function (cle) {
      return {
        cle: cle, libelle: libelles[cle] || cle,
        courante: c[cle] || 0, precedente: p[cle] || 0
      };
    });
    var max = 0;
    zones.forEach(function (z) {
      if (z.courante > max) max = z.courante;
      if (z.precedente > max) max = z.precedente;
    });
    return { zones: zones, max: max, vide: max === 0 };
  }

  // `-0` est un nombre valide en SVG, mais `points="0,-0 0,-0 …"` est illisible
  // dans l'inspecteur et se compare mal en test. `r === 0` est vrai pour −0 :
  // on rend toujours le zéro positif.
  function arrondi(v) {
    var r = Math.round(v * 100) / 100;
    return r === 0 ? 0 : r;
  }

  // Sommet k de l'hexagone régulier, k = 0 en haut, sens des aiguilles.
  function sommet(k, rayon) {
    var angle = (Math.PI / 3) * k - (Math.PI / 2);
    return { x: arrondi(Math.cos(angle) * rayon), y: arrondi(Math.sin(angle) * rayon) };
  }

  function hexagone(rayon) {
    return [0, 1, 2, 3, 4, 5].map(function (k) { return sommet(k, rayon); });
  }

  // Polygone d'une série de valeurs, à l'échelle COMMUNE aux deux périodes.
  // Sans échelle commune, chaque polygone serait normalisé sur son propre
  // maximum : les deux rempliraient l'hexagone pareil, et un mois deux fois
  // plus petit se dessinerait aussi grand que l'autre.
  function polygone(valeurs, max, rayon) {
    var m = Number(max) > 0 ? Number(max) : 1;
    var r = Number(rayon) || 0;
    return (valeurs || []).map(function (v, k) {
      var val = Number(v);
      if (!isFinite(val) || val < 0) val = 0;
      return sommet(k, (val / m) * r);
    });
  }

  // Quatre cartes de contexte : deux comptes, puis les DEUX ZONES PRINCIPALES
  // de la période COURANTE — celles qui portent le plus de volume maintenant,
  // pas celles qui en portaient le plus avant. Chacune donne la valeur
  // précédente à côté, en clair : ni flèche, ni pourcentage, ni couleur.
  function cartes(comparaison, bilanCourant, bilanPrecedent) {
    var bc = bilanCourant || { nbSeances: 0, nbSeriesTravail: 0 };
    var bp = bilanPrecedent || { nbSeances: 0, nbSeriesTravail: 0 };
    var liste = [
      { cle: 'seances', libelle: 'Séances',
        courante: bc.nbSeances || 0, precedente: bp.nbSeances || 0 },
      { cle: 'series', libelle: 'Séries de travail',
        courante: bc.nbSeriesTravail || 0, precedente: bp.nbSeriesTravail || 0 }
    ];
    var principales = ((comparaison && comparaison.zones) || []).slice()
      .sort(function (a, b) {
        return b.courante - a.courante || a.libelle.localeCompare(b.libelle);
      })
      .slice(0, 2);
    principales.forEach(function (z) {
      liste.push({ cle: z.cle, libelle: z.libelle, courante: z.courante, precedente: z.precedente });
    });
    return liste;
  }

  var api = {
    PERIODES: PERIODES,
    PERIODE_DEFAUT: PERIODE_DEFAUT,
    ORDRE: ORDRE,
    periodeDe: periodeDe,
    fenetres: fenetres,
    dans: dans,
    decouper: decouper,
    comparerZones: comparerZones,
    sommet: sommet,
    hexagone: hexagone,
    polygone: polygone,
    cartes: cartes
  };

  racine.THPeriode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
