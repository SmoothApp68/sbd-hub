// Aide de test — rejoue des fonctions d'app.js (extraites) dans un bac à sable : tout nom non fourni est une fonction muette.
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
}
// Tout nom que l'extrait ne reçoit pas est une fonction muette : seuls les noms listés dans `vrais` comptent.
function bac(vrais, noms) {
  const muet = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : muet), apply: () => muet, construct: () => muet });
  const portee = new Proxy(vrais, { has: () => true, get: (o, k) => (k === Symbol.unscopables ? undefined : (k in o ? o[k] : muet)),
    set: (o, k, v) => { o[k] = v; return true; } });
  const code = noms.map(extraire).join('\n') + '\nreturn { ' + noms.map((n) => n + ': ' + n).join(', ') + ' };';
  // eslint-disable-next-line no-new-func
  return new Function('portee', 'with (portee) {' + code + '}')(portee);
}

module.exports = { bac, extraire };
