// v2/js/partage-image.js — « Partager en image » (social 2) : la CONSTRUCTION PURE de l'écran `e` d'un record et d'une séance.
//
// ⚠️ ICI, RIEN NE SE DESSINE ET RIEN NE SE CALCULE QUI EXISTE AILLEURS. Le dessin est celui de « Ton année » (`annee.js` :
// `dessiner`, `partager`, `dessinerLeCorps`, la palette, la police) ; ce module ne fait que dire QUOI écrire, en mots du coach
// (un fait, jamais un « bravo »). Les entrées viennent de l'app (`app.js`), qui lit les faits (`faits.js`) :
//   · un record : la ligne de `faits.recordsDuJour(…, { avecDetail: true })`, le journal des records de l'exercice, les paris, les pesées ;
//   · une séance : ses exercices et leurs séries VALIDÉES, les records du jour.
// Jamais : durée, tonnage, compte de séances, régularité, comparaison à quelqu'un. Aux haltères la charge est déjà le TOTAL de la
// paire (245) : « 24 kg × 15 », jamais « 2 × 12 kg ».

(function (racine) {
  'use strict';

  function M() { return racine.THModele; }
  function P() { return racine.THPoids; }

  // Une séance de plus de 8 exercices : la police rétrécit ; de plus de 14 : deux colonnes.
  var SEUIL_RETRECI = 8, SEUIL_COLONNES = 14;

  function jourDe(iso) {
    var d = iso instanceof Date ? iso : new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  // « 8 nov. 2026 »
  function dateTexte(iso) {
    var d = jourDe(iso);
    return d ? d.getDate() + ' ' + M().MOIS_COURTS[d.getMonth()] + ' ' + d.getFullYear() : '';
  }
  // « 2026-11-08 » — pour le nom du fichier.
  function dateFichier(iso) {
    return (racine.THMoteur && racine.THMoteur.jourCivil(iso)) || 'sans-date';
  }
  // Sans accents ni espaces : lettres, chiffres, tirets.
  function pourFichier(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exercice';
  }
  function nombre(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? null : n; }

  // LA MEILLEURE SÉRIE d'un exercice : la plus lourde série de TRAVAIL validée — chauffes, dégressives et reculs exclus. Les séries
  // passées sont déjà celles qui sont en base (`Seance.partEnBase`). Sans charge : le plus de reps, puis la plus longue distance, puis
  // la plus longue durée. Rend la série, ou `null`.
  function meilleureSerie(series) {
    var Mo = M(), meilleure = null, clef = null;
    (series || []).forEach(function (s) {
      if (!Mo.estTravail(s) || Mo.estRecul(s)) return;
      var k = [nombre(s.charge_kg) || 0, nombre(s.reps) || 0, nombre(s.distance_m) || 0, nombre(s.duree_s) || 0];
      var mieux = !clef;
      for (var i = 0; clef && i < k.length && !mieux; i++) {
        if (k[i] > clef[i]) mieux = true; else if (k[i] < clef[i]) break;
      }
      if (mieux) { meilleure = s; clef = k; }
    });
    return meilleure;
  }

  // ── La séance ────────────────────────────────────────────────────────────
  //   entree = { debut, titre, exercices: [{ nom, series }], records: [nom] }
  function ecranSeance(entree) {
    var e = entree || {};
    var lignes = [];
    (e.exercices || []).forEach(function (x) {
      var s = meilleureSerie(x.series);
      if (s) lignes.push({ n: x.nom, v: M().formatMesure(s) });
    });
    var n = lignes.length;
    var vus = [], noms = [];
    (e.records || []).forEach(function (r) {
      var nom = String(r || '').toLowerCase();
      if (nom && vus.indexOf(nom) < 0) { vus.push(nom); noms.push(nom); }
    });
    var colonnes = n > SEUIL_COLONNES ? 2 : 1;
    var taille = colonnes === 2 ? 30 : n <= SEUIL_RETRECI ? 50 : Math.max(34, 50 - (n - SEUIL_RETRECI) * 3);
    var date = dateTexte(e.debut);
    return {
      cle: 'seance',
      fichier: 'trainhub-seance-' + dateFichier(e.debut) + '.png',
      date: date,
      partage: {
        type: 'seance',
        sur: (e.titre || 'Séance') + ' · ' + date,
        titre: 'La meilleure série de chaque exercice',
        lignes: lignes, taille: taille, colonnes: colonnes,
        records: noms.length ? noms.length + (noms.length > 1 ? ' records' : ' record') + ' : ' + M().enumerer(noms) + '.' : null
      }
    };
  }

  // ── Le record ────────────────────────────────────────────────────────────
  var UNITES = {
    charge: function (v) { return M().nombreTexte(v, 1) + ' kg'; },
    reps: function (v) { return M().nombreTexte(v, 0) + (Math.abs(Number(v)) >= 2 ? ' reps' : ' rep'); },
    duree: function (v) { return M().formatDuree(v); },
    distance: function (v) { return M().formatDistance(v); }
  };
  // « 5 kg de plus que ton record d'avant, posé le 21 sept. 2026. » — l'écart dans l'unité du record ; rien sans record d'avant.
  function phraseEcart(r) {
    if (!r || !UNITES[r.kind]) return null;
    var v = nombre(r.valeur), a = nombre(r.ancien);
    if (v === null || a === null || v <= a) return null;
    var quand = r.ancien_le ? dateTexte(r.ancien_le) : '';
    return UNITES[r.kind](Math.round((v - a) * 100) / 100) + ' de plus que ton record d’avant' + (quand ? ', posé le ' + quand : '') + '.';
  }
  // Le pari de consigne tenu sur CETTE série : « Le coach l'avait annoncé : 100 kg × 3, tenu. »
  function phrasePari(e) {
    var c = nombre(e.serie && e.serie.charge_kg), trouve = null;
    (e.paris || []).forEach(function (q) {
      if (!q || q.seance !== e.seanceId || q.exercice !== e.slug) return;
      var pe = nombre(q.predite), ob = nombre(q.observee), qc = nombre(q.charge);
      if (pe === null || ob === null || ob < pe) return;
      if (qc !== null && c !== null && Math.abs(qc - c) > 0.01) return;
      if (!trouve) trouve = { charge: qc !== null ? qc : c, reps: pe };
    });
    if (!trouve) return null;
    var mesure = trouve.charge !== null ? M().formatMesure({ charge_kg: trouve.charge, reps: trouve.reps }) : UNITES.reps(trouve.reps);
    return 'Le coach l’avait annoncé : ' + mesure + ', tenu.';
  }
  // La courbe des records de l'exercice depuis le premier : `[{ date, valeur }]` → points normalisés + étiquettes.
  function courbeDesRecords(kind, points) {
    var f = UNITES[kind];
    var liste = (points || []).map(function (p) { return { t: jourDe(p.date), v: nombre(p.valeur) }; })
      .filter(function (p) { return p.t && p.v !== null; }).sort(function (a, b) { return a.t - b.t; });
    if (!f || liste.length < 2) return null;
    var t0 = liste[0].t.getTime(), t1 = liste[liste.length - 1].t.getTime();
    var vs = liste.map(function (p) { return p.v; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    return {
      points: liste.map(function (p, i) {
        return { x: t1 > t0 ? (p.t.getTime() - t0) / (t1 - t0) : i / (liste.length - 1), y: mx > mn ? (p.v - mn) / (mx - mn) : 0.5 };
      }),
      gauche: { date: dateTexte(liste[0].t), valeur: f(liste[0].v) },
      droite: { valeur: f(liste[liste.length - 1].v) }
    };
  }
  // « 1,23 × PDC » : la charge sur la pesée de ce jour-là — `THPoids.rapportAuPoids`, le rapport de l'app (une pesée de MOINS de 14 jours,
  // sinon rien).
  function rapportAuPoids(charge, pesees, jour) {
    var c = nombre(charge);
    if (c === null || c <= 0 || !P()) return null;
    var r = P().rapportAuPoids(c, pesees, jourDe(jour));
    return r ? M().nombreFixe(r.rapport, 2) + ' \u00d7 PDC' : null;
  }
  //   entree = { debut, seanceId, slug, nom, serie, record: { kind, valeur, ancien, ancien_le },
  //              paris: [{ seance, exercice, predite, observee, charge }], courbe: [{ date, valeur }], pesees, corps }
  function ecranRecord(entree) {
    var e = entree || {};
    var r = e.record || {};
    var c = nombre(e.serie && e.serie.charge_kg);
    var corps = e.corps && e.corps.volume ? e.corps : null;
    var muscles = null;
    if (corps) {
      var tries = Object.keys(corps.volume).filter(function (k) { return corps.volume[k] > 0; })
        .sort(function (a, b) { return corps.volume[b] - corps.volume[a]; });
      if (tries.length) muscles = tries.slice(0, 3).map(function (k) { return (corps.libelles && corps.libelles[k]) || k; }).join(', ');
    }
    var date = dateTexte(e.debut);
    return {
      cle: 'record',
      fichier: 'trainhub-record-' + pourFichier(e.slug || e.nom) + '-' + dateFichier(e.debut) + '.png',
      date: date,
      partage: {
        type: 'record',
        sur: 'Record · ' + date,
        chiffre: M().formatMesure(e.serie),
        nom: e.nom,
        ecart: phraseEcart(r),
        pari: phrasePari(e),
        courbe: courbeDesRecords(r.kind, e.courbe),
        rapport: rapportAuPoids(c, e.pesees, e.debut),
        muscles: muscles, corps: muscles ? corps : null
      }
    };
  }

  var api = { meilleureSerie: meilleureSerie, ecranSeance: ecranSeance, ecranRecord: ecranRecord,
              phraseEcart: phraseEcart, courbeDesRecords: courbeDesRecords, dateFichier: dateFichier, pourFichier: pourFichier,
              SEUIL_RETRECI: SEUIL_RETRECI, SEUIL_COLONNES: SEUIL_COLONNES };
  racine.THPartageImage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
