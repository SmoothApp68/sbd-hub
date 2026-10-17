// v2/js/bilan.js — le bilan d'un mois (MOTEUR §9.23, ECRAN-SAISIE §7 bis.14).
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache. Il reçoit des
// séances (avec leurs séries) et des paris déjà lus, et rend des comptes.
//
// DES MOIS CALENDAIRES, ET C'EST VOULU ICI. `periode.js` compare deux
// fenêtres glissantes pour le radar (un mois entamé contre un mois complet
// fabriquerait une chute) ; le bilan, lui, ne compare pas pour juger : il
// raconte UN mois, celui qu'on a vécu — « Septembre : 22 séances ». Les
// séries par muscle s'affichent à côté de celles du mois d'avant, sans
// flèche ni couleur.
//
// RIEN N'EST JUGÉ. Aucune couleur de jugement, aucune phrase sur l'assiduité
// (CADRAGE) : un mois plus court n'est pas un échec, et l'app n'en connaît
// pas la raison.
//
// Les définitions ne sont PAS refaites ici : la série de travail est
// `THModele.estTravail`, le compte des séries de travail
// `THSemaine.compteSeriesTravail` — celui de la barre et de la carte de
// séance —, les séries par muscle `THSemaine.volumeParMuscle`, celle du bloc
// Volume (REGLE-VOLUME : un muscle principal compte la série entière, un
// secondaire pour moitié — MOTEUR §9.23, H2, #371 : une seule définition).

(function (racine) {
  'use strict';

  function Mo() { return racine.THModele; }
  function Se() { return racine.THSemaine; }

  function deux(n) { return (n < 10 ? '0' : '') + n; }

  // La date locale d'un début de séance, ou `null`.
  function dateDe(iso) {
    if (iso === null || iso === undefined || iso === '') return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // « AAAA-MM », le mois d'une date ou d'un début, au calendrier LOCAL.
  function cleMois(x) {
    var d = x instanceof Date ? x : dateDe(x);
    return d ? d.getFullYear() + '-' + deux(d.getMonth() + 1) : null;
  }
  function decaler(cle, n) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(cle || ''));
    if (!m) return null;
    return cleMois(new Date(Number(m[1]), Number(m[2]) - 1 + n, 1));
  }
  function moisPrecedent(cle) { return decaler(cle, -1); }
  function moisSuivant(cle) { return decaler(cle, 1); }
  // Le premier jour du mois, en date locale.
  function premierJour(cle) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(cle || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null;
  }

  // LE MOIS ÉCOULÉ : celui d'avant aujourd'hui. Il reste le mois du bloc
  // jusqu'à la fin du mois suivant — le 31 octobre, c'est encore septembre.
  function moisEcoule(aujourdhui) { return moisPrecedent(cleMois(aujourdhui)); }

  function seancesDuMois(seances, mois) {
    return (seances || []).filter(function (s) { return s && cleMois(s.debut) === mois; });
  }

  // Le volume soulevé : charge × reps des séries de travail, charges
  // POSITIVES seulement (ni le corps, ni une aide).
  function volumeKg(series) {
    var v = 0;
    (series || []).forEach(function (s) {
      if (!Mo().estTravail(s)) return;
      var c = Number(s.charge_kg), r = Number(s.reps);
      if (s.charge_kg === null || s.charge_kg === undefined || !isFinite(c) || c <= 0) return;
      if (s.reps === null || s.reps === undefined || !isFinite(r) || r <= 0) return;
      v += c * r;
    });
    return Math.round(v * 100) / 100;
  }

  // ⚠️ LE COMPTE DES PARIS VÉRIFIÉS ET TENUS, UNE FOIS (71) : le bilan du mois
  // et le récap de fin de séance (ECRAN-SAISIE §7 septies.4 bis) le lisent ici.
  // `garder(q)` choisit les paris (un mois, une séance). Un pari sans
  // observation n'est pas vérifié ; tenu : observé ≥ prédit (la règle du
  // bilan de bloc, §9.22). Rend `{ verifies, tenus }`.
  function compterParis(paris, garder) {
    var verifies = 0, tenus = 0;
    (paris || []).forEach(function (q) {
      if (!q || (garder && !garder(q))) return;
      if (q.observee === null || q.observee === undefined) return;
      var pr = Number(q.predite), ob = Number(q.observee);
      if (!isFinite(pr) || !isFinite(ob)) return;
      verifies++;
      if (estTenu(q)) tenus++;
    });
    return { verifies: verifies, tenus: tenus };
  }
  function estTenu(q) { return Number(q.observee) >= Number(q.predite); }

  // LE BILAN D'UN MOIS.
  //   `o.mois`      : « AAAA-MM » ;
  //   `o.seances`   : `[{ debut, fin, series }]` — toutes, le mois les trie ;
  //   `o.exercices` : le catalogue (le compte des séries de travail, les
  //                   muscles) ; sans lui, toute série de travail compte.
  // Rend `{ mois, seances, series, volume_kg, muscles }`. 124 (audit du 16/10/2026, 04 #13, #14) — les jours, le
  // temps (la règle « tout ou rien », contraire à celle des heures à la salle, 97) et les exercices les plus faits
  // (par séries) de l'ancien bilan sont retirés : rien ne les lisait depuis la story du mois (98), qui a les siens
  // (`THBilans`) ; et les paris du mois ont UN fil, celui de la période (`bilan.coach`, `THBilans`).
  function bilanDuMois(o) {
    var p = o || {};
    var du = seancesDuMois(p.seances, p.mois);
    var series = [];
    du.forEach(function (s) { (s.series || []).forEach(function (x) { series.push(x); }); });
    var avant = [];
    seancesDuMois(p.seances, moisPrecedent(p.mois)).forEach(function (s) {
      (s.series || []).forEach(function (x) { avant.push(x); });
    });
    var ici = Se().volumeParMuscle(series, p.exercices);
    var la = {};
    Se().volumeParMuscle(avant, p.exercices).forEach(function (m) { la[m.muscle] = m.series; });
    return {
      mois: p.mois,
      seances: du.length,
      series: Se().compteSeriesTravail(series, p.exercices),
      volume_kg: volumeKg(series),
      muscles: ici.map(function (m) {
        return { muscle: m.muscle, libelle: m.libelle, series: m.series, avant: la[m.muscle] || 0 };
      })
    };
  }

  // LA PHRASE DES PARIS : « Sur 10 paris vérifiés, le coach en a tenu 9. » —
  // ramenée à 10 dès 10 paris vérifiés (au plus proche), les chiffres tels
  // quels en dessous, rien sans pari vérifié.
  // 71 — `options.telsQuels` : le récap de fin de séance dit les chiffres tels
  // quels (« Sur 16 paris vérifiés, le coach en a tenu 14. ») — une séance en
  // compte rarement plus de 30, et « sur 10 » contredirait le compte. Une
  // phrase, deux réglages ; le bilan du mois garde la sienne.
  function phraseParis(verifies, tenus, options) {
    var v = Number(verifies) || 0, t = Number(tenus) || 0;
    if (v <= 0) return null;
    if (v >= 10 && !(options && options.telsQuels)) { t = Math.round(t * 10 / v); v = 10; }
    return 'Sur ' + v + ' pari' + (v > 1 ? 's' : '') + ' vérifié' + (v > 1 ? 's' : '') +
      ', le coach en a tenu ' + t + '.';
  }

  // ══ LA COMPARAISON DU RÉCAP (71, ECRAN-SAISIE §7 septies.4 bis) ══════════
  //
  // « 10,1 t soulevées : à peu près un tricératops. » Règle pour règle celle de
  // `tests/unit/fixtures/comparaison71.py`. ⚠️ LA TABLE EST UNE DONNÉE ET VIT
  // ICI SEULEMENT (cinquante objets, recopiés tels quels de L1 : libellé tel
  // qu'écrit, masse en tonnes — des ordres de grandeur, « à peu près »).
  var OBJETS = [
    ['un cheval de trait', 1.0], ['un grand crocodile marin', 1.0], ['une Renault Clio', 1.1], ['un rhinocéros noir', 1.1],
    ['un taureau charolais', 1.1], ['un grand requin blanc', 1.1], ['une girafe', 1.2], ['une Mini', 1.2], ['un morse', 1.2],
    ['une Peugeot 3008', 1.4], ['un hippopotame', 1.5], ['une Tesla Model 3', 1.8], ['un pick-up', 2.2],
    ['un hélicoptère Écureuil plein', 2.2], ['un rhinocéros blanc', 2.3], ['une Tesla Model X', 2.5], ['un Range Rover', 2.5],
    ['un éléphant de forêt', 2.7], ['une camionnette chargée', 3.5], ['un camping-car', 3.5], ['un éléphant de mer', 3.5],
    ['un éléphant d’Asie', 4.0], ['un stégosaure', 5.0], ['un orque', 5.5], ['un éléphant d’Afrique', 6.0],
    ['un mammouth laineux', 6.0], ['un ankylosaure', 6.0], ['un Mirage 2000 à vide', 7.5], ['un T. rex', 8.0],
    ['un tricératops', 9.0], ['un Rafale à vide', 10.0], ['un ATR 72 à vide', 13.0], ['le bourdon Emmanuel de Notre-Dame', 13.0],
    ['la cloche de Big Ben', 13.7], ['un cachalot femelle', 15.0], ['un diplodocus', 15.0], ['un requin-baleine', 15.0],
    ['un char AMX-13', 15.0], ['la Savoyarde du Sacré-Cœur', 19.0], ['un camion chargé', 19.0],
    ['un camion à trois essieux chargé', 26.0], ['un VBCI', 29.0], ['une baleine à bosse', 30.0], ['une baleine grise', 30.0],
    ['le cuivre de la statue de la Liberté', 31.0], ['une toupie à béton chargée', 32.0], ['un Boeing 737 à vide', 41.0],
    ['un Airbus A320 à vide', 42.0], ['un semi-remorque chargé', 44.0], ['un cachalot mâle', 45.0]
  ];
  var TOLERANCE = Math.log(1.2);   // ±20 %, en logarithme
  var AU_DELA = 'plus qu’un semi-remorque chargé';

  // L'ordre (masse, libellé) de Python : `sorted` compare les chaînes point de
  // code par point de code — c'est `<` en JavaScript, pas `localeCompare`.
  var TRIES = OBJETS.slice().sort(function (a, b) {
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });

  // FNV-1a 32 bits sur les octets UTF-8 de l'identifiant.
  function fnv1a(texte) {
    var h = 0x811c9dc5;
    var o = utf8(String(texte));
    for (var i = 0; i < o.length; i++) {
      h ^= o[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function utf8(s) {
    var o = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) o.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else o.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return o;
  }

  // ⚠️ LE MÊME OBJET POUR UNE MÊME SÉANCE, À CHAQUE AFFICHAGE : le choix parmi
  // les objets à ±20 % se fait par l'empreinte de l'identifiant, jamais au
  // hasard. `null` sous 1 000 kg ; au-delà de 50 000 kg, « plus qu’un
  // semi-remorque chargé » ; aucun à ±20 % : le plus proche (à égalité, le
  // premier dans l'ordre).
  function comparaison(volumeKg, idSeance) {
    var v = Number(volumeKg);
    if (volumeKg === null || volumeKg === undefined || !isFinite(v) || v < 1000) return null;
    if (v > 50000) return AU_DELA;
    var t = v / 1000;
    var proches = TRIES.filter(function (o) { return Math.abs(Math.log(t / o[1])) <= TOLERANCE + 1e-12; });
    if (proches.length) return proches[fnv1a(idSeance) % proches.length][0];
    var meilleur = null, ecart = Infinity;
    TRIES.forEach(function (o) {
      var e = Math.abs(Math.log(t / o[1]));
      if (e < ecart) { ecart = e; meilleur = o; }
    });
    return meilleur[0];
  }

  // Le volume tel que l'écrit la tuile du récap : en tonnes, au dixième (« 10,1 t »).
  function tonnesDuRecap(kg) {
    return Mo().nombreSigne(Math.round((Number(kg) || 0) / 100) / 10) + '\u00a0t';
  }

  // « 10,1 t soulevées : à peu près un tricératops. » ; au-delà de 50 t,
  // « … : plus qu’un semi-remorque chargé. » ; sous 1 t, rien.
  function phraseComparaison(volumeKg, idSeance) {
    var objet = comparaison(volumeKg, idSeance);
    if (!objet) return null;
    return tonnesDuRecap(volumeKg) + ' soulevées : ' + (objet === AU_DELA ? objet : 'à peu près ' + objet) + '.';
  }

  // Le temps, « 12 h 05 » ou « 45 min ».
  function texteTemps(minutes) {
    if (minutes === null || minutes === undefined) return '';
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return h ? h + ' h ' + deux(m) : m + ' min';
  }

  var api = {
    cleMois: cleMois,
    moisPrecedent: moisPrecedent,
    moisSuivant: moisSuivant,
    premierJour: premierJour,
    moisEcoule: moisEcoule,
    seancesDuMois: seancesDuMois,
    volumeKg: volumeKg,
    bilanDuMois: bilanDuMois,
    compterParis: compterParis,
    estTenu: estTenu,
    phraseParis: phraseParis,
    OBJETS: OBJETS,
    fnv1a: fnv1a,
    comparaison: comparaison,
    tonnesDuRecap: tonnesDuRecap,
    phraseComparaison: phraseComparaison,
    texteTemps: texteTemps
  };

  racine.THBilan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
