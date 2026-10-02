#!/usr/bin/env node
// tests/banc/seance-rapide.js — le banc d'écran de séance, en rapide.
//
//   node tests/banc/seance-rapide.js                         le banc COMPLET, en parallèle (6 groupes)
//   node tests/banc/seance-rapide.js --sections 7-G-sexies   un banc RÉDUIT (les sections nommées)
//   node tests/banc/seance-rapide.js --sequentiel            le banc complet, en séquentiel (la référence)
//   node tests/banc/seance-rapide.js --comparer              les deux, et la preuve qu'ils disent la même chose (~33 min)
//   node tests/banc/seance-rapide.js --contre seq.json       ce banc, comparé à un rapport écrit par --rapport
//   node tests/banc/seance-rapide.js --lister                les sections, leurs chaînes, leur durée, les groupes
//
// Options : --groupes N (défaut 6 : mesuré le plus court sur 4 cœurs — les
// sections attendent bien plus qu'elles ne calculent) · --racine DOSSIER (un autre arbre : un
// worktree de mutation) · --rapport FICHIER (le rapport fusionné, en JSON).
//
// ⚠️ RIEN NE SE RELÂCHE. Le banc complet, parallèle ou séquentiel, joue les
// MÊMES sections et compte les MÊMES contrôles ; le lanceur le vérifie à
// chaque exécution (la couverture), et `--comparer` le prouve contre le
// séquentiel. Un banc réduit le dit en toutes lettres.

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const Sections = require('./seance-sections.js');
const { compteDeLaGarde, fusionnerGardes } = require('./garde-compte.js');

// ── Chaînes et préalables : ce qui ne se joue pas seul ─────────────────────
//
// Le banc est une histoire : une section lit souvent ce qu'une autre a laissé
// — la séance ouverte, une routine ajoutée au décor, l'historique d'un
// exercice. Deux liens, mesurés (section seule, puis par fenêtres, contre le
// séquentiel complet) et écrits dans `seance-chaines.json` :
//
//   · une CHAÎNE : des sections qui se jouent ensemble, dans le même groupe,
//     dans l'ordre du banc. Chacune compte ses contrôles ;
//   · un PRÉALABLE : une section REJOUÉE avant, dans le même groupe, pour
//     construire l'état. Ses contrôles ne comptent pas là — ils comptent dans
//     le groupe qui la POSSÈDE, une fois. Un préalable en échec fait quand même
//     échouer le banc : l'état qu'il construit serait faux.
//
// Une section nouvelle qui lit l'état d'une autre doit s'inscrire ici : sinon,
// seule ou en parallèle, elle échoue — le banc le dit, il ne ment pas.
const CHAINES = require('./seance-chaines.json');

// La section qui compte la garde de TOUT le banc : jamais jouée dans un groupe,
// refaite par le lanceur sur le compte fusionné (`garde-compte.js`).
const SECTION_FUSIONNEE = '7-G-bis';
const PREAMBULE = '(préambule)';
// 6 groupes : 306 s contre 443 s à 4 groupes, mêmes contrôles (mesuré le 30/09/2026).
const GROUPES = 6;
const PREPARATION = '(préparation)';

// ── Petits outils ───────────────────────────────────────────────────────────
function portLibre() {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.unref();
    s.on('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

function lireJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
}

function secondes(ms) { return Math.round(ms / 100) / 10; }

// Lance un programme de banc ; rend { code, rapport, journal, duree }.
function jouer(fichier, options) {
  const o = options || {};
  return portLibre().then((port) => new Promise((ok) => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-groupe-'));
    const rapportF = path.join(dossier, 'rapport.json');
    const journalF = path.join(dossier, 'journal.txt');
    const sortie = fs.openSync(journalF, 'w');
    const debut = Date.now();
    const p = spawn(process.execPath, [fichier], {
      env: Object.assign({}, process.env, { BANC_PORT: String(port), BANC_RAPPORT: rapportF }, o.env || {}),
      stdio: ['ignore', sortie, sortie]
    });
    p.on('exit', (code) => {
      fs.closeSync(sortie);
      ok({ code: code, rapport: lireJson(rapportF), journal: journalF, duree: Date.now() - debut, port: port });
    });
  }));
}

// La durée connue d'une section (le séquentiel mesuré) ; une section neuve
// compte pour la moyenne.
function dureeDe(id, durees) {
  if (durees && durees[id] !== undefined) return durees[id];
  const v = Object.keys(durees || {}).map((k) => durees[k]);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 20;
}

// ── Les unités : une chaîne, ou une section seule, avec ses préalables ──────
function unites(banc, config, exclues) {
  const c = config || {};
  const ids = banc.sections.map((s) => s.id).filter((id) => (exclues || []).indexOf(id) < 0);
  const prise = {};
  const liste = [];
  (c.chaines || []).forEach((ch) => {
    const membres = ch.filter((id) => ids.indexOf(id) >= 0);
    if (!membres.length) return;
    membres.forEach((id) => { prise[id] = true; });
    liste.push(membres);
  });
  ids.forEach((id) => { if (!prise[id]) liste.push([id]); });
  return liste.map((membres) => {
    const pre = [];
    membres.forEach((id) => ((c.prealables || {})[id] || []).forEach((p) => {
      if (membres.indexOf(p) < 0 && pre.indexOf(p) < 0) pre.push(p);
    }));
    return { membres, prealables: pre };
  });
}

// Le coût d'une unité dans un groupe : ses sections, et ceux de ses préalables
// que le groupe ne joue pas déjà.
function cout(u, groupe, durees) {
  const deja = groupe ? groupe.membres.concat(groupe.prealables) : [];
  return u.membres.reduce((t, id) => t + dureeDe(id, durees), 0) +
    u.prealables.filter((p) => deja.indexOf(p) < 0).reduce((t, id) => t + dureeDe(id, durees), 0);
}

// Répartit les unités en N groupes : la plus longue d'abord, dans le groupe où
// elle finit le plus tôt (un préalable déjà joué là ne coûte rien de plus).
// Dans un groupe, tout se joue dans l'ordre du banc.
function repartir(banc, n, config, exclues) {
  const c = config || {};
  const ordre = banc.sections.map((s) => s.id);
  const u = unites(banc, c, exclues).sort((a, b) => cout(b, null, c.durees) - cout(a, null, c.durees));
  const groupes = Array.from({ length: Math.max(1, n) }, () => ({ membres: [], prealables: [], duree: 0 }));
  u.forEach((x) => {
    let meilleur = null, fin = Infinity;
    groupes.forEach((g) => {
      const f = g.duree + cout(x, g, c.durees);
      if (f < fin) { fin = f; meilleur = g; }
    });
    meilleur.membres = meilleur.membres.concat(x.membres);
    x.prealables.forEach((p) => { if (meilleur.prealables.indexOf(p) < 0) meilleur.prealables.push(p); });
    meilleur.duree = fin;
  });
  const trier = (l) => l.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  return groupes.filter((g) => g.membres.length).map((g) => ({
    membres: trier(g.membres),
    // Un préalable que le groupe possède déjà n'est pas rejoué : il est joué.
    prealables: trier(g.prealables.filter((p) => g.membres.indexOf(p) < 0)),
    duree: g.duree
  }));
}

// Ce qu'une demande de banc réduit joue : les sections nommées, ce qui les
// précède dans leur chaîne (compté), et leurs préalables (rejoués).
function planReduit(ids, config) {
  const c = config || {};
  const membres = ids.slice();
  (c.chaines || []).forEach((ch) => ch.forEach((id, i) => {
    if (membres.indexOf(id) < 0) return;
    ch.slice(0, i).forEach((avant) => { if (membres.indexOf(avant) < 0) membres.push(avant); });
  }));
  const prealables = [];
  membres.forEach((id) => ((c.prealables || {})[id] || []).forEach((p) => {
    if (membres.indexOf(p) < 0 && prealables.indexOf(p) < 0) prealables.push(p);
  }));
  return { membres, prealables, ajoutees: membres.filter((id) => ids.indexOf(id) < 0) };
}

// ── La couverture : la garantie d'équivalence ───────────────────────────────
//
// Statique : chaque section du banc est POSSÉDÉE par un groupe, exactement
// (sauf la section fusionnée, que le lanceur refait). Dynamique : chaque
// groupe a réellement ouvert, dans l'ordre du banc, ses préalables et ses
// sections, et a rendu son rapport. Un groupe qui « oublie » une section — ou
// qui s'arrête en route — fait échouer le banc, même si tous les contrôles
// qu'il a joués sont verts.
function verifierCouverture(banc, groupes, resultats, attendues) {
  const erreurs = [];
  const tous = attendues || banc.sections.map((s) => s.id);
  const vues = {};
  groupes.forEach((g, i) => g.membres.forEach((id) => {
    if (vues[id] !== undefined) erreurs.push('section « ' + id + ' » dans deux groupes (' + (vues[id] + 1) + ' et ' + (i + 1) + ')');
    vues[id] = i;
  }));
  tous.forEach((id) => { if (vues[id] === undefined) erreurs.push('section « ' + id + ' » dans aucun groupe'); });
  const ordre = banc.sections.map((s) => s.id);
  const nomDe = {};
  banc.sections.forEach((s) => { nomDe[s.id] = s.nom; });
  groupes.forEach((g, i) => {
    const r = resultats[i];
    if (!r || !r.rapport) {
      erreurs.push('groupe ' + (i + 1) + ' : aucun rapport (code ' + (r && r.code) + ') — voir ' + (r && r.journal));
      return;
    }
    const jouees = r.rapport.sections.map((s) => s.nom);
    const prevues = g.membres.concat(g.prealables || [])
      .sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)).map((id) => nomDe[id]);
    if (JSON.stringify(jouees) !== JSON.stringify(prevues)) {
      const manquent = prevues.filter((n) => jouees.indexOf(n) < 0);
      const enTrop = jouees.filter((n) => prevues.indexOf(n) < 0);
      erreurs.push('groupe ' + (i + 1) + ' : sections jouées ≠ prévues' +
        (manquent.length ? ' · manquent : ' + manquent.map((n) => n.split('.')[0]).join(', ') : '') +
        (enTrop.length ? ' · en trop : ' + enTrop.map((n) => n.split('.')[0]).join(', ') : ''));
    }
  });
  return erreurs;
}

// ── Fusion ──────────────────────────────────────────────────────────────────
//
// On ne garde, de chaque groupe, que ce qui appartient à ses sections
// POSSÉDÉES : contrôles, sections, et compte de la garde. Le préambule est
// rejoué par chaque groupe ; il compte une fois (le premier groupe), plus tout
// échec vu ailleurs. Un préalable en échec est rapporté et fait échouer le
// banc, sans que ses contrôles soient comptés deux fois.
function fusionner(banc, groupes, resultats, avecGarde) {
  const ordre = banc.sections.map((s) => s.nom);
  const nomDe = {};
  banc.sections.forEach((s) => { nomDe[s.id] = s.nom; });
  const sections = [];
  let controles = [];
  let erreursPage = [];
  let echecs = 0;
  const prealablesEnEchec = [];
  const gardes = [];
  resultats.forEach((r, i) => {
    if (!r.rapport) { echecs++; return; }
    const possedees = groupes[i].membres.map((id) => nomDe[id]);
    const garderSection = (n) => possedees.indexOf(n) >= 0 || (i === 0 && (n === PREAMBULE || n === PREPARATION));
    if ((r.rapport.erreurs || []).length) { echecs++; erreursPage = erreursPage.concat(r.rapport.erreurs); }
    r.rapport.sections.forEach((s) => { if (possedees.indexOf(s.nom) >= 0) sections.push(s); });
    r.rapport.controles.forEach((c) => {
      if (garderSection(c.section) || (c.section === PREAMBULE && !c.ok)) {
        controles.push(c);
        if (!c.ok) echecs++;
      } else if (!c.ok) {
        prealablesEnEchec.push('groupe ' + (i + 1) + ' · préalable « ' + c.section.split('.')[0] + ' » : ' + c.nom);
        echecs++;
      }
    });
    const g = r.rapport.garde || {};
    const secs = {};
    Object.keys(g.sections || {}).forEach((n) => { if (garderSection(n)) secs[n] = g.sections[n]; });
    gardes.push({
      plans: Object.keys(secs).reduce((t, n) => t + (secs[n].verifies || 0), 0),
      violations: Object.keys(secs).reduce((t, n) => t + (secs[n].violations || 0), 0),
      rapports: (g.rapports || []).filter((x) => garderSection(String(x).split(' : ')[0])),
      phrases: g.phrases || [],
      liste: (g.liste || []).filter((v) => garderSection(v.section)),
      sections: secs
    });
  });
  const garde = fusionnerGardes(gardes);
  let lignesGarde = [];
  if (avecGarde) {
    const nomGarde = nomDe[SECTION_FUSIONNEE];
    const compte = compteDeLaGarde(garde);
    compte.controles.forEach((c) => {
      controles.push({ section: nomGarde, nom: c.nom, ok: c.ok, detail: c.detail });
      if (!c.ok) echecs++;
    });
    lignesGarde = compte.lignes;
    sections.push({ nom: nomGarde, debut: 0, fin: 0 });
  }
  const rang = (n) => ordre.indexOf(n);
  controles = controles.map((c, i) => Object.assign({ i: i }, c))
    .sort((a, b) => (rang(a.section) - rang(b.section)) || (a.i - b.i));
  sections.sort((a, b) => rang(a.nom) - rang(b.nom));
  return { controles, sections, garde, lignesGarde, erreursPage, echecs, prealablesEnEchec };
}

function lignesEnEchec(journal, possedees) {
  try {
    let section = '';
    const sortie = [];
    fs.readFileSync(journal, 'utf8').split('\n').forEach((l) => {
      const m = /^══ (.*) ══$/.exec(l);
      if (m) section = m[1];
      if (/^\s*❌/.test(l) && (!possedees || possedees.indexOf(section) >= 0)) sortie.push(l);
    });
    return sortie;
  } catch (e) { return []; }
}

function config(o) {
  return { chaines: o.chaines || CHAINES.chaines, prealables: o.prealables || CHAINES.prealables || {},
    durees: o.durees || CHAINES.durees };
}

// ── Le banc complet en parallèle ────────────────────────────────────────────
async function parallele(options) {
  const o = options || {};
  const banc = Sections.lireBanc(o.banc);
  const avecGarde = banc.sections.some((s) => s.id === SECTION_FUSIONNEE);
  const exclues = avecGarde ? [SECTION_FUSIONNEE] : [];
  const groupes = (o.groupesFixes || repartir(banc, o.groupes || GROUPES, config(o), exclues))
    .map((g) => Object.assign({ prealables: [] }, g));
  const construire = o.construire ||
    ((g) => Sections.ecrireProgramme(banc, Sections.choisir(banc, g.membres.concat(g.prealables))));
  const debut = Date.now();
  const resultats = await Promise.all(groupes.map((g) => jouer(construire(g), o)));
  const attendues = banc.sections.map((s) => s.id).filter((id) => exclues.indexOf(id) < 0);
  const couverture = verifierCouverture(banc, groupes, resultats, attendues);
  const f = fusionner(banc, groupes, resultats, avecGarde);
  return { mode: 'parallele', banc, groupes, resultats, couverture, fusion: f, duree: Date.now() - debut,
    total: banc.sections.length, jouees: banc.sections.length };
}

// ── Un banc réduit ──────────────────────────────────────────────────────────
async function reduit(ids, options) {
  const o = options || {};
  const banc = Sections.lireBanc(o.banc);
  Sections.choisir(banc, ids);   // une section inconnue est une erreur, tout de suite
  const plan = planReduit(ids, config(o));
  const groupes = [{ membres: plan.membres, prealables: plan.prealables }];
  const debut = Date.now();
  const resultats = [await jouer(Sections.ecrireProgramme(banc,
    Sections.choisir(banc, plan.membres.concat(plan.prealables))), o)];
  const couverture = verifierCouverture(banc, groupes, resultats, plan.membres);
  const f = fusionner(banc, groupes, resultats, false);
  return { mode: 'reduit', banc, groupes, resultats, couverture, fusion: f, duree: Date.now() - debut,
    total: banc.sections.length, jouees: plan.membres.length, ajoutees: plan.ajoutees };
}

// ── Le banc séquentiel : la référence, le fichier tel quel ──────────────────
async function sequentiel(options) {
  const o = options || {};
  const banc = Sections.lireBanc(o.banc);
  const debut = Date.now();
  const r = await jouer(banc.fichier, o);
  const groupes = [{ membres: banc.sections.map((s) => s.id), prealables: [] }];
  const couverture = verifierCouverture(banc, groupes, [r]);
  const f = fusionner(banc, groupes, [r], false);
  return { mode: 'sequentiel', banc, groupes, resultats: [r], couverture, fusion: f, duree: Date.now() - debut,
    total: banc.sections.length, jouees: banc.sections.length };
}

// ── Comparer deux exécutions ────────────────────────────────────────────────
function comparer(a, b) {
  const cle = (c) => c.section + ' ▸ ' + c.nom + ' ▸ ' + (c.ok ? 'ok' : 'ÉCHEC');
  const compte = (liste) => liste.reduce((m, c) => { m[cle(c)] = (m[cle(c)] || 0) + 1; return m; }, {});
  const ca = compte(a.fusion.controles), cb = compte(b.fusion.controles);
  const diff = [];
  new Set(Object.keys(ca).concat(Object.keys(cb))).forEach((k) => {
    if ((ca[k] || 0) !== (cb[k] || 0)) diff.push(k + ' : ' + (ca[k] || 0) + ' contre ' + (cb[k] || 0));
  });
  const ga = compteDeLaGarde(a.fusion.garde), gb = compteDeLaGarde(b.fusion.garde);
  return {
    controles: [a.fusion.controles.length, b.fusion.controles.length],
    echecs: [a.fusion.echecs, b.fusion.echecs],
    plansCrochet: [ga.plans, gb.plans],
    plansApp: [ga.planApp, gb.planApp],
    violations: [a.fusion.garde.violations, b.fusion.garde.violations],
    differences: diff
  };
}

// ── L'affichage ─────────────────────────────────────────────────────────────
function resumer(r) {
  const f = r.fusion;
  const lignes = [];
  const titre = r.mode === 'reduit'
    ? '⚠️  BANC RÉDUIT : ' + r.jouees + ' section(s) sur ' + r.total + ' — ce n’est PAS le banc complet'
    : 'banc complet (' + (r.mode === 'parallele' ? 'parallèle, ' + r.groupes.length + ' groupes' : 'séquentiel') +
      ') : ' + r.jouees + ' sections sur ' + r.total;
  lignes.push('\n══ ' + titre + ' ══');
  if (r.ajoutees && r.ajoutees.length) lignes.push('   (chaîne : ajouté ' + r.ajoutees.join(', ') + ')');
  const nomDe = {};
  r.banc.sections.forEach((s) => { nomDe[s.id] = s.nom; });
  r.groupes.forEach((g, i) => {
    const res = r.resultats[i];
    lignes.push('   groupe ' + (i + 1) + ' · ' + secondes(res.duree) + ' s · code ' + res.code + ' · ' +
      g.membres.length + ' section(s)' + (g.prealables && g.prealables.length ? ' + ' + g.prealables.length +
      ' préalable(s) rejoué(s)' : '') + ' · journal ' + res.journal);
  });
  r.resultats.forEach((res, i) => lignesEnEchec(res.journal, r.groupes[i].membres.map((id) => nomDe[id]))
    .forEach((l) => lignes.push(l)));
  f.prealablesEnEchec.forEach((l) => lignes.push('   ❌ ' + l));
  if (f.lignesGarde.length) f.lignesGarde.forEach((l) => lignes.push(l));
  f.controles.filter((c) => c.section.indexOf('7 G bis') === 0 && r.mode === 'parallele').forEach((c) =>
    lignes.push('   ' + (c.ok ? '✅' : '❌') + ' ' + c.nom + (c.detail ? '  — ' + c.detail : '')));
  r.couverture.forEach((e) => lignes.push('   ❌ COUVERTURE — ' + e));
  lignes.push('\n   ' + f.controles.length + ' contrôles · ' + f.echecs + ' en échec · erreurs de page : ' +
    (f.erreursPage.length ? f.erreursPage.join(' | ') : 'aucune') + ' · ' + secondes(r.duree) + ' s');
  // Tout échec est compté dans `f.echecs` (contrôle, préalable, erreur de page) ;
  // un groupe qui plante n'a pas de rapport, et la couverture le dit.
  const vert = !f.echecs && !r.couverture.length;
  lignes.push('\n' + (vert ? '✅ tout passe' : '❌ en échec') + (r.mode === 'reduit' ? ' (banc réduit)' : ''));
  return { texte: lignes.join('\n'), vert };
}

function durees(r) {
  const par = {};
  r.fusion.sections.forEach((s) => { if (s.fin) par[Sections.idDe(s.nom)] = secondes(s.fin - s.debut); });
  return par;
}

module.exports = { portLibre, jouer, unites, repartir, planReduit, verifierCouverture, fusionner,
  parallele, reduit, sequentiel, comparer, resumer, durees, dureeDe, SECTION_FUSIONNEE, CHAINES };

// ── En ligne de commande ────────────────────────────────────────────────────
if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (nom) => { const i = a.indexOf(nom); return i >= 0 ? a[i + 1] : undefined; };
  const racine = val('--racine');
  const options = {
    banc: racine ? path.join(path.resolve(racine), 'tests/banc/seance-ecran.js') : undefined,
    groupes: val('--groupes') ? Number(val('--groupes')) : GROUPES
  };
  const ecrire = (r) => {
    const f = val('--rapport');
    if (f) fs.writeFileSync(f, JSON.stringify({ mode: r.mode, duree: r.duree, groupes: r.groupes,
      couverture: r.couverture, controles: r.fusion.controles, sections: r.fusion.sections,
      garde: r.fusion.garde, echecs: r.fusion.echecs, durees: durees(r) }, null, 1));
  };
  (async () => {
    if (a.indexOf('--lister') >= 0) {
      const banc = Sections.lireBanc(options.banc);
      const c = config({});
      const g = repartir(banc, options.groupes, c, [SECTION_FUSIONNEE]);
      banc.sections.forEach((s) => console.log(s.id.padEnd(18) + String(dureeDe(s.id, c.durees)).padStart(7) + ' s  ' + s.nom));
      console.log('\nchaînes :\n' + c.chaines.map((x) => '   ' + x.join(' → ')).join('\n'));
      console.log('préalables :\n' + Object.keys(c.prealables).map((k) => '   ' + k + ' ← ' + c.prealables[k].join(', ')).join('\n'));
      console.log('\n' + g.length + ' groupes :');
      g.forEach((x, i) => console.log('   groupe ' + (i + 1) + ' (~' + Math.round(x.duree) + ' s) : ' + x.membres.join(', ') +
        (x.prealables.length ? '  [rejoue : ' + x.prealables.join(', ') + ']' : '')));
      return;
    }
    if (a.indexOf('--comparer') >= 0) {
      const p = await parallele(options);
      console.log(resumer(p).texte);
      const s = await sequentiel(options);
      console.log(resumer(s).texte);
      const c = comparer(s, p);
      console.log('\n══ ÉQUIVALENCE (séquentiel contre parallèle) ══');
      console.log('   contrôles         : ' + c.controles.join(' contre '));
      console.log('   en échec          : ' + c.echecs.join(' contre '));
      console.log('   plans (crochet)   : ' + c.plansCrochet.join(' contre '));
      console.log('   plans (garde app) : ' + c.plansApp.join(' contre '));
      console.log('   violations        : ' + c.violations.join(' contre '));
      console.log('   durée             : ' + secondes(s.duree) + ' s contre ' + secondes(p.duree) + ' s');
      console.log('   différences       : ' + (c.differences.length ? c.differences.length : 'aucune'));
      c.differences.slice(0, 30).forEach((d) => console.log('   ≠ ' + d));
      const f = val('--rapport');
      if (f) fs.writeFileSync(f, JSON.stringify({ comparaison: c,
        sequentiel: { duree: s.duree, durees: durees(s), controles: s.fusion.controles.length },
        parallele: { duree: p.duree, groupes: p.groupes.map((g, i) => Object.assign({ duree: p.resultats[i].duree }, g)) } }, null, 1));
      process.exit(c.differences.length || !resumer(s).vert || !resumer(p).vert ? 1 : 0);
    }
    const sections = val('--sections');
    const r = a.indexOf('--sequentiel') >= 0 ? await sequentiel(options)
      : sections ? await reduit(sections.split(','), options)
      : await parallele(options);
    ecrire(r);
    const s = resumer(r);
    console.log(s.texte);
    // `--contre RAPPORT` : compare cette exécution à une autre, déjà écrite par
    // `--rapport` (le séquentiel dure 25 min : on le joue une fois, on compare
    // ensuite autant de parallèles qu'il faut).
    const contre = val('--contre');
    if (contre) {
      const ref = JSON.parse(fs.readFileSync(contre, 'utf8'));
      const c = comparer({ fusion: { controles: ref.controles, echecs: ref.echecs, garde: ref.garde } }, r);
      console.log('\n══ ÉQUIVALENCE (' + ref.mode + ' enregistré contre ' + r.mode + ') ══');
      console.log('   contrôles         : ' + c.controles.join(' contre '));
      console.log('   en échec          : ' + c.echecs.join(' contre '));
      console.log('   plans (crochet)   : ' + c.plansCrochet.join(' contre '));
      console.log('   plans (garde app) : ' + c.plansApp.join(' contre '));
      console.log('   violations        : ' + c.violations.join(' contre '));
      console.log('   durée             : ' + secondes(ref.duree) + ' s contre ' + secondes(r.duree) + ' s');
      console.log('   différences       : ' + (c.differences.length ? c.differences.length : 'aucune'));
      c.differences.slice(0, 30).forEach((d) => console.log('   ≠ ' + d));
      process.exit(s.vert && !c.differences.length ? 0 : 1);
    }
    process.exit(s.vert ? 0 : 1);
  })().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
