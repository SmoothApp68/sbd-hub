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
// séance —, les séries par muscle `THSemaine.seriesParMusclePrincipal`.

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

  // LE TEMPS DU MOIS, en minutes : la somme de `fin − début`. ⚠️ SEULEMENT
  // SI TOUTES les séances du mois ont une heure de fin — un total faux serait
  // pire qu'aucun (6 des 22 séances de septembre, importées de Hevy, n'en
  // ont pas). `null` sinon, et sur un mois sans séance.
  function tempsDuMois(seances) {
    var liste = seances || [];
    if (!liste.length) return null;
    var total = 0;
    for (var i = 0; i < liste.length; i++) {
      var a = dateDe(liste[i].debut), b = dateDe(liste[i].fin);
      if (a === null || b === null || b <= a) return null;
      total += (b - a) / 60000;
    }
    return Math.round(total);
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

  // Les exercices les plus faits du mois : par séries de travail, puis par
  // nom. `{ slug, series }`.
  function exercicesLesPlusFaits(series, combien) {
    var n = {};
    (series || []).forEach(function (s) {
      if (!Mo().estTravail(s) || !s.exercise_slug) return;
      n[s.exercise_slug] = (n[s.exercise_slug] || 0) + 1;
    });
    return Object.keys(n).map(function (slug) { return { slug: slug, series: n[slug] }; })
      .sort(function (a, b) { return b.series - a.series || (a.slug < b.slug ? -1 : 1); })
      .slice(0, combien || 5);
  }

  // LE BILAN D'UN MOIS.
  //   `o.mois`      : « AAAA-MM » ;
  //   `o.seances`   : `[{ debut, fin, series }]` — toutes, le mois les trie ;
  //   `o.paris`     : `[{ date, predite, observee }]` — la date est le début de
  //                   la séance du pari ; un pari sans observation n'est pas
  //                   vérifié ;
  //   `o.exercices` : le catalogue (le compte des séries de travail, les
  //                   muscles) ; sans lui, toute série de travail compte.
  // Rend `{ mois, seances, series, volume_kg, jours, paris_verifies,
  // paris_tenus, temps_min, muscles, exercices }`.
  function bilanDuMois(o) {
    var p = o || {};
    var du = seancesDuMois(p.seances, p.mois);
    var series = [];
    du.forEach(function (s) { (s.series || []).forEach(function (x) { series.push(x); }); });
    var jours = {};
    du.forEach(function (s) { jours[dateDe(s.debut).getDate()] = true; });
    var verifies = 0, tenus = 0;
    (p.paris || []).forEach(function (q) {
      if (!q || cleMois(q.date) !== p.mois) return;
      if (q.observee === null || q.observee === undefined) return;
      var pr = Number(q.predite), ob = Number(q.observee);
      if (!isFinite(pr) || !isFinite(ob)) return;
      verifies++;
      // Tenu : observé ≥ prédit (la règle du bilan de bloc, §9.22).
      if (ob >= pr) tenus++;
    });
    var avant = [];
    seancesDuMois(p.seances, moisPrecedent(p.mois)).forEach(function (s) {
      (s.series || []).forEach(function (x) { avant.push(x); });
    });
    var ici = Se().seriesParMusclePrincipal(series, p.exercices);
    var la = {};
    Se().seriesParMusclePrincipal(avant, p.exercices).forEach(function (m) { la[m.muscle] = m.series; });
    return {
      mois: p.mois,
      seances: du.length,
      series: Se().compteSeriesTravail(series, p.exercices),
      volume_kg: volumeKg(series),
      jours: Object.keys(jours).map(Number).sort(function (a, b) { return a - b; }),
      paris_verifies: verifies,
      paris_tenus: tenus,
      temps_min: tempsDuMois(du),
      muscles: ici.map(function (m) {
        return { muscle: m.muscle, libelle: m.libelle, series: m.series, avant: la[m.muscle] || 0 };
      }),
      exercices: exercicesLesPlusFaits(series, 5)
    };
  }

  // LA PHRASE DES PARIS : « Sur 10 paris vérifiés, le coach en a tenu 9. » —
  // ramenée à 10 dès 10 paris vérifiés (au plus proche), les chiffres tels
  // quels en dessous, rien sans pari vérifié.
  function phraseParis(verifies, tenus) {
    var v = Number(verifies) || 0, t = Number(tenus) || 0;
    if (v <= 0) return null;
    if (v >= 10) { t = Math.round(t * 10 / v); v = 10; }
    return 'Sur ' + v + ' pari' + (v > 1 ? 's' : '') + ' vérifié' + (v > 1 ? 's' : '') +
      ', le coach en a tenu ' + t + '.';
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
    tempsDuMois: tempsDuMois,
    volumeKg: volumeKg,
    exercicesLesPlusFaits: exercicesLesPlusFaits,
    bilanDuMois: bilanDuMois,
    phraseParis: phraseParis,
    texteTemps: texteTemps
  };

  racine.THBilan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
