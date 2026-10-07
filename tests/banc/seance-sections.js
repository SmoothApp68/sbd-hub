#!/usr/bin/env node
// tests/banc/seance-sections.js — le banc d'écran, découpé en sections.
//
// Le banc (`seance-ecran.js`) est UN script : un préambule (serveur, base de
// papier, navigateur, helpers), puis des sections qui s'enchaînent, chacune
// ouverte par `console.log('\n══ NOM ══')`, puis `await clore()`. Ce module le
// lit (acorn, pas d'expression régulière sur 8 000 lignes) et en fabrique un
// programme qui ne joue que les sections demandées :
//
//   · le préambule, toujours ;
//   · les sections choisies, entières, dans l'ordre du banc ;
//   · des AUTRES sections, seulement leurs DÉCLARATIONS sans effet — les
//     helpers (`terminer`, `menuBloc`…) sont déclarés au fil du banc, et une
//     section plus loin s'en sert. Une déclaration « sans effet » : une
//     fonction, ou une valeur sans appel ni `await`. Tout le reste (gestes,
//     contrôles, états calculés) est retiré ;
//   · la fin (`clore`), toujours.
//
// Le banc lui-même n'est jamais modifié : le programme est écrit ailleurs, et
// ses chemins (`__dirname`) sont rendus absolus.

const fs = require('fs');
const path = require('path');
const os = require('os');
const acorn = require('acorn');

const BANC = path.join(__dirname, 'seance-ecran.js');
const MARQUE = /^\n══ (.*) ══$/;

// « 7 G sexies. LE DÉVERROUILLAGE… » → « 7-G-sexies » ; « 0. LA MONTÉE » → « 0 ».
function idDe(nom) {
  const avant = String(nom).split('.')[0].trim();
  return avant.replace(/\s+/g, '-');
}

function estMarque(st) {
  if (!st || st.type !== 'ExpressionStatement') return null;
  const e = st.expression;
  if (!e || e.type !== 'CallExpression' || !e.callee || e.callee.type !== 'MemberExpression') return null;
  if (!e.callee.object || e.callee.object.name !== 'console' || !e.callee.property ||
      e.callee.property.name !== 'log') return null;
  const a = e.arguments[0];
  if (!a || a.type !== 'Literal' || typeof a.value !== 'string') return null;
  const m = MARQUE.exec(a.value);
  return m ? m[1] : null;
}

function estClore(st) {
  return !!st && st.type === 'ExpressionStatement' && st.expression.type === 'AwaitExpression' &&
    st.expression.argument.type === 'CallExpression' && st.expression.argument.callee.name === 'clore';
}

// Un nœud « a un effet » s'il contient, hors d'un corps de fonction, un appel,
// un `await`, un `new`, une affectation ou une incrémentation.
function aUnEffet(noeud) {
  let effet = false;
  (function visiter(n) {
    if (effet || !n || typeof n.type !== 'string') return;
    if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' ||
        n.type === 'FunctionDeclaration') return;
    if (['CallExpression', 'AwaitExpression', 'NewExpression', 'AssignmentExpression',
      'UpdateExpression', 'TaggedTemplateExpression', 'YieldExpression'].indexOf(n.type) >= 0) {
      effet = true;
      return;
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visiter);
      else if (v && typeof v.type === 'string') visiter(v);
    }
  })(noeud);
  return effet;
}

function estFonction(n) {
  return !!n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');
}

// La déclaration survit hors de sa section si elle ne fait rien d'autre que
// nommer quelque chose.
function declarationSansEffet(st) {
  if (st.type === 'FunctionDeclaration') return true;
  if (st.type === 'VariableDeclaration') {
    return st.declarations.every((d) => d.id.type === 'Identifier' && (!d.init || !aUnEffet(d.init)));
  }
  // `crochetPlan = async () => {…}` : l'affectation d'une fonction à une
  // variable du préambule.
  if (st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' &&
      st.expression.operator === '=' && st.expression.left.type === 'Identifier' &&
      estFonction(st.expression.right)) return true;
  return false;
}

function nomsDeclares(st) {
  if (st.type === 'FunctionDeclaration') return [st.id.name];
  if (st.type === 'VariableDeclaration') {
    const noms = [];
    st.declarations.forEach((d) => (function prendre(p) {
      if (!p) return;
      if (p.type === 'Identifier') noms.push(p.name);
      else if (p.type === 'ObjectPattern') p.properties.forEach((q) => prendre(q.value || q.argument));
      else if (p.type === 'ArrayPattern') p.elements.forEach(prendre);
      else if (p.type === 'RestElement') prendre(p.argument);
      else if (p.type === 'AssignmentPattern') prendre(p.left);
    })(d.id));
    return noms;
  }
  return [];
}

// Lit le banc et le découpe. Rend `{ source, tete, preambule, sections, fin, queue }`,
// chaque partie en positions dans `source`.
function lireBanc(fichier) {
  const source = fs.readFileSync(fichier || BANC, 'utf8');
  const sansShebang = source.replace(/^#!.*/, (l) => ' '.repeat(l.length));
  const ast = acorn.parse(sansShebang, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: false });
  // `(async () => { … })()`, éventuellement suivi de `.catch(…)`.
  const appelDe = (e) => {
    if (!e || e.type !== 'CallExpression') return null;
    if (e.callee.type === 'ArrowFunctionExpression' && e.callee.async && e.callee.body.type === 'BlockStatement') return e.callee;
    if (e.callee.type === 'MemberExpression') return appelDe(e.callee.object);
    return null;
  };
  const principal = ast.body.filter((st) => st.type === 'ExpressionStatement' && appelDe(st.expression)).pop();
  if (!principal) throw new Error('banc : fonction principale `(async () => { … })()` introuvable');
  const corps = appelDe(principal.expression).body;
  const instructions = corps.body;

  const sections = [];
  const preambule = [];
  let finale = null;
  instructions.forEach((st) => {
    const nom = estMarque(st);
    if (nom !== null) {
      sections.push({ nom: nom, id: idDe(nom), instructions: [st] });
      return;
    }
    if (estClore(st)) { finale = st; return; }
    if (finale) throw new Error('banc : du code après `await clore()`');
    if (sections.length) sections[sections.length - 1].instructions.push(st);
    else preambule.push(st);
  });
  if (!finale) throw new Error('banc : `await clore()` introuvable à la fin de la fonction principale');
  const ids = {};
  sections.forEach((s) => {
    if (ids[s.id]) throw new Error('banc : deux sections ont le même identifiant « ' + s.id + ' »');
    ids[s.id] = true;
    s.debut = s.instructions[0].start;
    s.fin = s.instructions[s.instructions.length - 1].end;
    s.declarations = s.instructions.slice(1).filter(declarationSansEffet);
    s.donnees = [];
    s.instructions.slice(1).filter((st) => !declarationSansEffet(st))
      .forEach((st) => { s.donnees = s.donnees.concat(nomsDeclares(st)); });
    s.nomsDeclares = [];
    s.declarations.forEach((st) => { s.nomsDeclares = s.nomsDeclares.concat(nomsDeclares(st)); });
  });
  return {
    fichier: fichier || BANC, source, sections,
    tete: [0, corps.start + 1],
    preambule: preambule.length ? [preambule[0].start, preambule[preambule.length - 1].end] : [corps.start + 1, corps.start + 1],
    finale: [finale.start, finale.end],
    queue: [corps.end - 1, source.length]
  };
}

// Traduit une liste d'identifiants (ou de préfixes « 7-G ») en sections, dans
// l'ordre du banc. Un identifiant inconnu est une erreur : un banc réduit qui
// ne jouerait rien en silence serait pire qu'aucun banc.
function choisir(banc, demandes) {
  const voulus = (demandes || []).map((d) => String(d).trim()).filter(Boolean);
  const inconnus = voulus.filter((d) => !banc.sections.some((s) => s.id === d));
  if (inconnus.length) {
    throw new Error('sections inconnues : ' + inconnus.join(', ') + '\nconnues : ' +
      banc.sections.map((s) => s.id).join(', '));
  }
  return banc.sections.filter((s) => voulus.indexOf(s.id) >= 0);
}

// Les noms qu'une instruction LIT hors des corps de fonction.
function lusHorsFonctions(st) {
  const lus = new Set();
  (function visiter(n, parent, cle) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') return;
    if (n.type === 'Identifier') {
      const propriete = parent && parent.type === 'MemberExpression' && cle === 'property' && !parent.computed;
      const clef = parent && parent.type === 'Property' && cle === 'key' && !parent.computed;
      const declare = parent && parent.type === 'VariableDeclarator' && cle === 'id';
      if (!propriete && !clef && !declare) lus.add(n.name);
    }
    for (const k of Object.keys(n)) {
      if (k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => visiter(x, n, k));
      else if (v && typeof v.type === 'string') visiter(v, n, k);
    }
  })(st, null, null);
  return lus;
}

function valeurNonFonction(st) {
  return st.type === 'VariableDeclaration' && st.declarations.some((d) => d.init && !estFonction(d.init));
}

// Les déclarations gardées d'une section NON jouée : ses fonctions, et ses
// valeurs sans effet qui ne lisent rien de retiré. `const b = (a && a.x) || []`
// n'a pas d'effet, mais si `a` vient d'une instruction retirée, la garder
// casserait le programme : on la retire aussi, jusqu'à stabilité.
function declarationsGardees(banc, garder) {
  const retires = new Set();
  banc.sections.forEach((s) => {
    if (garder.has(s.id)) return;
    s.instructions.slice(1).filter((st) => !declarationSansEffet(st))
      .forEach((st) => nomsDeclares(st).forEach((n) => retires.add(n)));
  });
  const gardees = new Map();
  banc.sections.forEach((s) => { if (!garder.has(s.id)) gardees.set(s.id, s.declarations.slice()); });
  let change = true;
  while (change) {
    change = false;
    gardees.forEach((liste, id) => {
      const reste = liste.filter((st) => {
        if (!valeurNonFonction(st)) return true;
        const lus = lusHorsFonctions(st);
        const casse = Array.from(lus).some((n) => retires.has(n));
        if (casse) { nomsDeclares(st).forEach((n) => retires.add(n)); change = true; }
        return !casse;
      });
      gardees.set(id, reste);
    });
  }
  return gardees;
}

// ── UNE SECTION QUI PLANTE N'ARRÊTE PLUS LE BANC (07/10/2026) ───────────────
//
// Le banc est UN script : une exception dans une section (un `page.click` qui
// attend 30 s un élément absent) le tuait d'un bloc, et toutes les sections
// suivantes disparaissaient du compte. C'est arrivé au séquentiel de 58-1 : il
// s'arrêtait au contrôle [57-1], sans rien dire de `forge` ni de `8`.
//
// Rendue RÉSISTANTE, une section devient :
//
//   console.log('\n══ NOM ══');          ← la marque, telle quelle
//   let a, b;                              ← ses noms, déclarés AVANT le try
//   try { …corps, `const a = x` devenu `(a = x);`… }
//   catch (e) { ok('[exception] NOM — …', false, pile) }
//
// Les noms restent visibles des sections suivantes (le banc les partage), une
// exception devient un contrôle EN ÉCHEC — compté, listé à la fin — et la
// section suivante joue. Le corps n'est pas réécrit autrement : mêmes
// instructions, mêmes commentaires, dans le même ordre.
//
// ⚠️ Une forme de premier niveau que la réécriture ne sait pas traiter (une
// classe) est une ERREUR, pas un passage en silence.
function sectionResistante(src, s) {
  const marque = s.instructions[0];
  const corps = s.instructions.slice(1);
  if (!corps.length) return src.slice(s.debut, s.fin);
  const lets = [], vars = [], fonctions = [], edits = [];
  corps.forEach((st) => {
    if (st.type === 'ClassDeclaration') {
      throw new Error('banc : section « ' + s.id + ' » — une classe au premier niveau, que la réécriture résistante ne sait pas traiter');
    }
    if (st.type === 'FunctionDeclaration') {
      // Hissée hors du try : une déclaration de fonction l'est déjà dans la
      // fonction principale, elle le reste.
      fonctions.push(src.slice(st.start, st.end));
      edits.push({ debut: st.start, fin: st.end, texte: '' });
      return;
    }
    if (st.type !== 'VariableDeclaration') return;
    (st.kind === 'var' ? vars : lets).push.apply(st.kind === 'var' ? vars : lets, nomsDeclares(st));
    const affectations = st.declarations.filter((d) => d.init)
      .map((d) => src.slice(d.id.start, d.id.end) + ' = ' + src.slice(d.init.start, d.init.end));
    edits.push({ debut: st.start, fin: st.end, texte: affectations.length ? '(' + affectations.join(', ') + ');' : '' });
  });
  let texte = src.slice(marque.end, s.fin);
  edits.sort((a, b) => b.debut - a.debut).forEach((e) => {
    texte = texte.slice(0, e.debut - marque.end) + e.texte + texte.slice(e.fin - marque.end);
  });
  return [
    '  ' + src.slice(marque.start, marque.end),
    lets.length ? '  let ' + lets.join(', ') + ';' : '',
    vars.length ? '  var ' + vars.join(', ') + ';' : '',
    fonctions.map((f) => '  ' + f).join('\n'),
    '  try {' + texte,
    '  } catch (exceptionDuBanc) {',
    '    ok(' + JSON.stringify('[exception] ' + s.nom + ' — la section s’arrête là, le banc continue') + ', false,',
    '      String((exceptionDuBanc && exceptionDuBanc.stack) || exceptionDuBanc).split(\'\\n\').slice(0, 4).join(\' | \'));',
    '  }'
  ].filter((l) => l !== '').join('\n');
}

// Le programme : préambule, sections choisies, déclarations des autres, fin.
// `options.resistant` : chaque section jouée est protégée (ci-dessus).
function programme(banc, choisies, options) {
  const o = options || {};
  const src = banc.source;
  const garder = new Set(choisies.map((s) => s.id));
  const gardees = declarationsGardees(banc, garder);
  const morceaux = [src.slice(banc.tete[0], banc.tete[1]), src.slice(banc.preambule[0], banc.preambule[1])];
  banc.sections.forEach((s) => {
    if (garder.has(s.id)) {
      morceaux.push(o.resistant ? sectionResistante(src, s) : src.slice(s.debut, s.fin));
    } else if (gardees.get(s.id).length) {
      morceaux.push('  // — ' + s.id + ' : non jouée, ses déclarations seules —');
      gardees.get(s.id).forEach((st) => morceaux.push('  ' + src.slice(st.start, st.end)));
    }
  });
  morceaux.push('  ' + src.slice(banc.finale[0], banc.finale[1]));
  morceaux.push(src.slice(banc.queue[0], banc.queue[1]));
  const dossier = path.dirname(path.resolve(banc.fichier));
  return morceaux.join('\n').replace(/^#!.*\n/, '').replace(/\b__dirname\b/g, JSON.stringify(dossier));
}

// Écrit le programme dans un fichier à part et rend son chemin.
function ecrireProgramme(banc, choisies, dossier, options) {
  const d = dossier || fs.mkdtempSync(path.join(os.tmpdir(), 'banc-sections-'));
  const f = path.join(d, 'banc-' + (choisies.length === banc.sections.length ? 'complet'
    : choisies.map((s) => s.id).join('_').slice(0, 80)) + ((options || {}).resistant ? '-resistant' : '') + '.js');
  fs.writeFileSync(f, programme(banc, choisies, options));
  return f;
}

// Ce qu'une section lit d'une autre : les noms qu'une autre section calcule
// (une valeur AVEC effet, retirée quand elle n'est pas jouée) et qu'elle
// mentionne. Une dépendance STATIQUE ; les états partagés (la base de papier,
// la page) se mesurent en jouant la section seule.
// Les noms LIÉS dans un sous-arbre (déclarations, paramètres, fonctions,
// `catch`) et les noms LUS (identifiants hors propriété et hors clé d'objet).
function liesEtLus(noeuds) {
  const lies = new Set(), lus = new Set();
  const lier = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') lies.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => lier(q.value || q.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(lier);
    else if (p.type === 'RestElement') lier(p.argument);
    else if (p.type === 'AssignmentPattern') lier(p.left);
  };
  (function visiter(n, parent, cle) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclarator') lier(n.id);
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      if (n.id) lier(n.id);
      n.params.forEach(lier);
    }
    if (n.type === 'CatchClause') lier(n.param);
    if (n.type === 'Identifier') {
      const propriete = parent && parent.type === 'MemberExpression' && cle === 'property' && !parent.computed;
      const clef = parent && parent.type === 'Property' && cle === 'key' && !parent.computed;
      if (!propriete && !clef) lus.add(n.name);
    }
    for (const k of Object.keys(n)) {
      if (k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => visiter(x, n, k));
      else if (v && typeof v.type === 'string') visiter(v, n, k);
    }
  })({ type: 'Programme', corps: noeuds }, null, null);
  return { lies, lus };
}

function dependancesStatiques(banc) {
  const sortie = {};
  banc.sections.forEach((s) => {
    const { lies, lus } = liesEtLus(s.instructions);
    const lues = [];
    banc.sections.forEach((autre) => {
      if (autre === s) return;
      autre.donnees.forEach((nom) => {
        if (lies.has(nom) || !lus.has(nom)) return;
        lues.push({ nom: nom, de: autre.id });
      });
    });
    if (lues.length) sortie[s.id] = lues;
  });
  return sortie;
}

module.exports = { BANC, idDe, lireBanc, choisir, programme, ecrireProgramme, dependancesStatiques };

// ── En ligne de commande : lister les sections ─────────────────────────────
if (require.main === module) {
  const banc = lireBanc(process.argv[2] && !/^--/.test(process.argv[2]) ? process.argv[2] : BANC);
  if (process.argv.indexOf('--dependances') >= 0) {
    console.log(JSON.stringify(dependancesStatiques(banc), null, 2));
  } else {
    banc.sections.forEach((s) => console.log(s.id.padEnd(20) + ' ' + s.nom));
    console.log('\n' + banc.sections.length + ' sections');
  }
}
