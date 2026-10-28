// Charge le vrai code v2 en Node, dans l'ordre de index.html (comme tests/unit/). Aucune réimplémentation.
'use strict';
process.env.TZ = 'Europe/Paris';
const path = require('path');
const R = path.resolve(__dirname, '../../../v2/js') + '/';
if (typeof self === 'undefined') global.self = global;
['modele', 'semaine', 'palier', 'moteur', 'seance', 'plan', 'profil', 'generateur'].forEach((m) => require(R + m + '.js'));
module.exports = {
  Modele: global.THModele, Palier: global.THPalier, Moteur: global.THMoteur, Seance: global.THSeance,
  Plan: global.THPlan, Profil: global.THProfil, Generateur: global.THGenerateur, Semaine: global.THSemaine
};
