/**
 * TRIAGE DES ÉLÉMENTS « A SEUL ». OUTIL D'AUDIT (v3).
 *
 * Un élément vu dans le CODE mais jamais rendu sur les états testés est un CANDIDAT
 * 🔴 RENDU INATTEIGNABLE — pas une conclusion. Pour trancher, il faut répondre :
 *   1. quelle fonction le produit ?
 *   2. qui appelle cette fonction ?
 *   3. cet appelant est-il relié à un élément d'interface (onclick/handler) ?
 *
 * Sortie : pour chaque élément, la chaîne d'appel remontée jusqu'à un point d'entrée UI,
 * ou l'absence de point d'entrée — qui est le vrai signal.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./source-a');

const ROOT = A.ROOT;
const SRC = {};
['app', 'engine', 'supabase', 'import', 'program', 'joints', 'coach'].forEach((f) => {
  try { SRC[f] = fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'); } catch (e) {}
});
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Sites d'appel de `nom`, hors sa propre définition. */
function appelants(nom) {
  const re = new RegExp('\\b' + nom + '\\s*\\(', 'g');
  const out = [];
  Object.entries(SRC).forEach(([f, src]) => {
    src.split('\n').forEach((l, i) => {
      if (!re.test(l)) { re.lastIndex = 0; return; }
      re.lastIndex = 0;
      if (new RegExp('function\\s+' + nom + '\\s*\\(').test(l)) return;
      const fn = A.fonctionContenant(f, i + 1);
      out.push({ ou: f + '.js:' + (i + 1), dans: fn ? fn.nom : '(hors fonction)', ligne: l.trim().slice(0, 100) });
    });
  });
  // points d'entrée markup
  HTML.split('\n').forEach((l, i) => {
    if (new RegExp('on\\w+="[^"]*\\b' + nom + '\\s*\\(').test(l)) {
      out.push({ ou: 'index.html:' + (i + 1), dans: '**HANDLER INLINE**', ligne: l.trim().slice(0, 100) });
    }
  });
  return out;
}

/** Le nom est-il attaché à un handler quelque part (markup OU html généré en JS) ? */
function pointEntreeUI(nom) {
  const pts = [];
  if (new RegExp('on\\w+="[^"]*\\b' + nom + '\\s*\\(').test(HTML)) pts.push('handler inline index.html');
  Object.entries(SRC).forEach(([f, src]) => {
    src.split('\n').forEach((l, i) => {
      if (/on(click|change|input)=/.test(l) && new RegExp('\\b' + nom + '\\s*\\(').test(l)) {
        pts.push(f + '.js:' + (i + 1) + ' (handler dans du HTML généré)');
      }
    });
  });
  return pts;
}

function triage(fichierUnion) {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, fichierUnion), 'utf8'));
  const aSeul = rows.filter((r) => r.provenance === 'A seul');
  return aSeul.map((r) => {
    const orig = (r.origines || [])[0] || '';
    const m = orig.match(/\[([^\]]+)\]$/);
    const fonction = m ? m[1] : null;
    const pts = fonction ? pointEntreeUI(fonction) : [];
    const app = fonction ? appelants(fonction) : [];
    return {
      cle: r.cle, fonction, origine: orig,
      pointsEntreeUI: pts,
      nbAppelants: app.length,
      appelantsUI: app.filter((x) => x.dans === '**HANDLER INLINE**').length,
      appelants: app.slice(0, 4),
      verdict: pts.length ? 'conditionnel — point d\'entrée UI trouvé'
        : app.length ? 'à investiguer — appelants sans point d\'entrée UI direct'
          : '🔴 AUCUN APPELANT',
    };
  });
}

module.exports = { triage, appelants, pointEntreeUI };

if (require.main === module) {
  const res = triage(process.argv[2]);
  console.log('# TRIAGE « A SEUL » — ' + res.length + ' éléments\n');
  const grp = {};
  res.forEach((r) => { (grp[r.fonction] = grp[r.fonction] || []).push(r); });
  Object.entries(grp).forEach(([fn, items]) => {
    const r = items[0];
    console.log('## ' + fn + '   (' + items.length + ' élément' + (items.length > 1 ? 's' : '') + ')');
    console.log('   éléments : ' + items.map((x) => x.cle).join(', '));
    console.log('   verdict  : ' + r.verdict);
    if (r.pointsEntreeUI.length) console.log('   entrée UI : ' + r.pointsEntreeUI.slice(0, 3).join(' · '));
    else console.log('   appelants : ' + (r.appelants.map((a) => a.ou + ' [' + a.dans + ']').join(' · ') || 'AUCUN'));
    console.log('');
  });
}
