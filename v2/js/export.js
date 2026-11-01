// v2/js/export.js — « Exporter mes données » (207). MODULE PUR : il formate, il ne lit rien et n'écrit rien.
//
// La lecture (avec la session de la personne, page par page) est `THDonnees.exporterTout` ; le fichier (Blob, lien,
// feuille de partage) se fabrique dans `app.js`. Ici : le JSON complet et le CSV des séries, en chaînes.
//   - JSON : une enveloppe { app, version, exporte_le, tables: { nom: [lignes] } }, toutes les lignes lues telles
//     quelles (aucune colonne retirée, aucune interprétation).
//   - CSV : une ligne par série, virgule, UTF-8 avec BOM, fins de ligne CRLF (RFC 4180), colonnes proches de celles de
//     Hevy pour qu'une autre app puisse les relire. `reserve` = 10 − RPE quand un RPE est noté (conversion d'unité, pas
//     une décision du coach), vide sinon.
(function (racine) {
  'use strict';

  var BOM = '﻿';
  var COLONNES_CSV = ['date', 'seance', 'exercice', 'charge_kg', 'reps', 'type_serie', 'reserve', 'note'];
  var VERSION = 1;

  // Un champ CSV : guillemets si virgule, guillemet, saut de ligne ; un guillemet se double.
  function champ(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function nombre(v) { return v === null || v === undefined || v === '' || isNaN(Number(v)) ? '' : String(Number(v)); }

  function reserveDe(rpe) {
    var n = nombre(rpe);
    return n === '' ? '' : String(Math.round((10 - Number(n)) * 10) / 10);
  }

  // `seances`, `series` : les lignes de `sessions` et de `sets` ; `noms` : { slug: nom } (le catalogue).
  // Ordre : séances par début, séries par rang. Une série dont la séance manque garde sa ligne, date vide.
  function csvSeances(seances, series, noms) {
    var parId = {};
    (seances || []).forEach(function (s) { parId[s.id] = s; });
    var lignes = (series || []).map(function (x) {
      var s = parId[x.session_id] || {};
      return { debut: s.debut || '', titre: s.titre || '', x: x };
    });
    lignes.sort(function (a, b) {
      if (a.debut !== b.debut) return a.debut < b.debut ? -1 : 1;
      var ra = Number(a.x.rang), rb = Number(b.x.rang);
      return (isNaN(ra) ? 0 : ra) - (isNaN(rb) ? 0 : rb);
    });
    var sortie = [COLONNES_CSV.join(',')];
    lignes.forEach(function (l) {
      var x = l.x;
      var nom = (noms && noms[x.exercise_slug]) || x.exercise_slug || '';
      sortie.push([
        l.debut, l.titre, nom, nombre(x.charge_kg), nombre(x.reps), x.type_serie || '', reserveDe(x.rpe), x.note || ''
      ].map(champ).join(','));
    });
    return BOM + sortie.join('\r\n') + '\r\n';
  }

  function jsonComplet(tables, quand) {
    return JSON.stringify({
      app: 'TrainHub', version: VERSION, exporte_le: new Date(quand || Date.now()).toISOString(), tables: tables || {}
    }, null, 1);
  }

  // « trainhub-donnees-2026-11-01.json »
  function nomDeFichier(genre, quand) {
    var d = new Date(quand || Date.now()).toISOString().slice(0, 10);
    return genre === 'csv' ? 'trainhub-seances-' + d + '.csv' : 'trainhub-donnees-' + d + '.json';
  }

  var api = { csvSeances: csvSeances, jsonComplet: jsonComplet, nomDeFichier: nomDeFichier, champ: champ,
              COLONNES_CSV: COLONNES_CSV, BOM: BOM, VERSION: VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  racine.THExport = api;
})(typeof self !== 'undefined' ? self : globalThis);
