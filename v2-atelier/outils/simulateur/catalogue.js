'use strict';
// Catalogue : à défaut de l'export `exercises` (237 lignes), l'union des catalogues des fixtures (le rapport le dit).
const f = (n) => require('../../../tests/unit/fixtures/' + n + '.json');
const cat = Object.assign({}, f('cas-66c-generateur').catalogue, f('cas-66d-generateur').catalogue);
const reel = f('cas-75-reel').catalogue;
const manquants = reel.filter((x) => !cat[x.slug]).map((x) => x.slug);
// Les noms : le slug lisible (les fixtures ne portent pas le nom de tous).
Object.keys(cat).forEach((s) => { if (!cat[s].nom) cat[s].nom = s.replace(/_/g, ' '); });
module.exports = { catalogue: cat, manquants, nSlugs: Object.keys(cat).length };
