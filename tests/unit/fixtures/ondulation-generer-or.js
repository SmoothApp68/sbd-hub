// node ondulation-generer-or.js <chemin de moteur.js> <sortie.json> — régénère le JSON d'or (volontairement, jamais en test).
'use strict';
const path = require('path');
const fs = require('fs');
global.window = global;
const racine = path.dirname(path.resolve(process.argv[2]));
['modele', 'palier', 'profil'].forEach((f) => require(path.join(racine, f + '.js')));
const M = require(path.resolve(process.argv[2]));
fs.writeFileSync(process.argv[3], JSON.stringify(require('./ondulation-corpus.js').produire(M)));
console.log('or écrit :', process.argv[3]);
