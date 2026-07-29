/**
 * SOURCE A — INVENTAIRE STATIQUE PAR LECTURE DU CODE. OUTIL D'AUDIT.
 *
 * C'est la pièce qui manquait aux vagues 2-5 du passage précédent : elles inventoriaient
 * par le DOM seul, qui ne peut PAS voir ce qui n'est jamais rendu. Weight Cut (vague 1)
 * n'aurait pas été trouvé par cette méthode — il n'apparaît dans aucun état.
 *
 * Ce module extrait, SANS exécuter l'app :
 *   1. les ids du markup statique d'une zone d'index.html
 *   2. les handlers inline de cette zone
 *   3. les ids produits par le CODE (template literals, concaténations, createElement)
 *      à l'intérieur des fonctions de rendu d'une surface donnée
 *
 * La cartographie fonction → plage de lignes est reconstruite par comptage d'accolades
 * (suffisant ici : le dépôt est en JS classique, sans modules ni classes imbriquées).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FICHIERS = ['app', 'engine', 'supabase', 'import', 'program', 'joints', 'coach', 'exercises'];

// ── Cartographie des fonctions ───────────────────────────────────────────────
function fonctionsDe(fichier) {
  const src = fs.readFileSync(path.join(ROOT, 'js', fichier + '.js'), 'utf8').split('\n');
  const out = [];
  let cur = null, depth = 0;
  src.forEach((ligne, i) => {
    const n = i + 1;
    if (!cur) {
      const m = ligne.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (m) { cur = { nom: m[1], fichier, debut: n }; depth = 0; }
    }
    if (cur) {
      for (const ch of ligne) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth <= 0 && n > cur.debut) { cur.fin = n; out.push(cur); cur = null; }
    }
  });
  if (cur) { cur.fin = src.length; out.push(cur); }
  return out;
}

let _fns = null;
function toutesLesFonctions() {
  if (_fns) return _fns;
  _fns = [];
  FICHIERS.forEach((f) => { try { _fns.push(...fonctionsDe(f)); } catch (e) { /* fichier absent */ } });
  return _fns;
}

function fonctionContenant(fichier, ligne) {
  const cands = toutesLesFonctions().filter((f) => f.fichier === fichier && ligne >= f.debut && ligne <= f.fin);
  // la plus étroite (fonctions imbriquées)
  return cands.sort((a, b) => (a.fin - a.debut) - (b.fin - b.debut))[0] || null;
}

// ── Extraction des ids produits par le code ──────────────────────────────────
// Motifs réels du dépôt :
//   'id="foo"'                       (template literal ou concaténation)
//   "id='foo'"                       (rare)
//   el.id = 'foo'                    (createElement)
//   id="' + variable + '"            → id DYNAMIQUE, on note le préfixe littéral
const RE_ID_ATTR = /id=\\?["']([A-Za-z][\w:.-]*)\\?["']/g;
const RE_ID_ATTR_DYN = /id=\\?["']([A-Za-z][\w:.-]*)-?['"]\s*\+/g;
const RE_ID_PROP = /\.id\s*=\s*['"]([A-Za-z][\w:.-]*)['"]/g;
// id="' + variable + '"  → id entièrement dynamique. On remonte au littéral de la variable
// (`var _platesId = 'plates-' + exoIdx;`) pour ne pas perdre l'élément dans l'inventaire.
const RE_ID_VAR = /id=\\?["']\s*\\?["']\s*\+\s*([A-Za-z_$][\w$]*)/g;
// Interpolation de template literal : id="${mgId}"  (motif app.js:10762, entre autres).
// Sans lui, tout un générateur passe inaperçu — c'est ce qui faisait apparaître `mg-<n>`
// en « B seul » alors que sa fonction était bien dans la fermeture.
const RE_ID_TPL = /id=\\?["']\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
// Interpolation AVEC préfixe littéral : id="prog-section-${day}" (app.js:3877).
// Distinct du motif précédent : ici le `${` ne suit pas immédiatement le guillemet.
const RE_ID_TPL_PREFIXE = /id=\\?["']([A-Za-z][\w:.-]*?)-?\$\{/g;
const RE_VAR_LITTERAL = (nom) => new RegExp('\\b' + nom + '\\s*=\\s*[\'"]([A-Za-z][\\w:.-]*)[\'"]\\s*\\+');

function idsProduitsPar(fichier, debut, fin) {
  const src = fs.readFileSync(path.join(ROOT, 'js', fichier + '.js'), 'utf8').split('\n');
  const trouves = [];
  for (let n = debut; n <= fin && n <= src.length; n++) {
    const ligne = src[n - 1];
    let m;
    RE_ID_ATTR.lastIndex = 0;
    while ((m = RE_ID_ATTR.exec(ligne))) trouves.push({ id: m[1], ligne: n, dyn: false });
    RE_ID_ATTR_DYN.lastIndex = 0;
    while ((m = RE_ID_ATTR_DYN.exec(ligne))) trouves.push({ id: m[1] + '<var>', ligne: n, dyn: true });
    RE_ID_PROP.lastIndex = 0;
    while ((m = RE_ID_PROP.exec(ligne))) trouves.push({ id: m[1], ligne: n, dyn: false });
    RE_ID_TPL_PREFIXE.lastIndex = 0;
    while ((m = RE_ID_TPL_PREFIXE.exec(ligne))) {
      if (m[1]) trouves.push({ id: m[1] + '<var>', ligne: n, dyn: true });
    }
    RE_ID_TPL.lastIndex = 0;
    while ((m = RE_ID_TPL.exec(ligne))) {
      const nomVar = m[1];
      let prefixe = null;
      for (let k = debut; k <= fin && k <= src.length; k++) {
        const mm = src[k - 1].match(RE_VAR_LITTERAL(nomVar));
        if (mm) { prefixe = mm[1]; break; }
      }
      trouves.push({ id: (prefixe ? prefixe + '<var>' : '<var:' + nomVar + '>'), ligne: n, dyn: true });
    }
    RE_ID_VAR.lastIndex = 0;
    while ((m = RE_ID_VAR.exec(ligne))) {
      const nomVar = m[1];
      // chercher le littéral d'origine dans la fonction
      let prefixe = null;
      for (let k = debut; k <= fin && k <= src.length; k++) {
        const mm = src[k - 1].match(RE_VAR_LITTERAL(nomVar));
        if (mm) { prefixe = mm[1]; break; }
      }
      trouves.push({ id: (prefixe ? prefixe + '<var>' : '<var:' + nomVar + '>'), ligne: n, dyn: true });
    }
  }
  return trouves;
}

/**
 * Ferme transitivement l'ensemble des fonctions de rendu d'une surface.
 * `racines` : noms de fonctions. `profondeur` : niveaux d'appel à suivre.
 */
// Racines de rendu des AUTRES surfaces. La fermeture s'y arrête : sans cette barrière,
// suivre les appels sur 3 niveaux depuis Séances ramène les sections des Réglages, les
// badges des Jeux et les graphes du Corps — qui ne font pas partie de la surface auditée.
// Chaque vague peut l'étendre via cfg.arret.
const ARRET_PAR_DEFAUT = [
  'renderSettingsProfile', 'fillSettingsFields', 'renderCorpsTab', 'renderDash',
  'renderGamificationTab', 'renderMuscleHeatmap', 'renderBodyWeightChart',
  'renderMuscleVolumeContent', 'renderMuscleList', 'initSocialTab', 'showStatsSub',
  'showTab', 'showProfilSub', 'showJeuxSub', 'showFeedSub', 'renderLifts', 'renderReports',
  'renderRadarImproved', 'renderCardioStats', 'renderStrengthRatios', 'renderVolumeLandmarks',
  'renderFriendsTab', 'renderFeed', 'renderLeaderboard', 'renderChallengesTab',
  'renderTodaySessionInline', 'renderPerfCard', 'renderGlossaryPage', 'renderTierSection',
  'renderRGPDSection', 'renderInjuriesEditor', 'renderSettingsActivities', 'renderKeyLiftsEditor',
  'renderRecordsCorrectionList', 'renderStorageGauge', 'renderAppVersionLine',
];

function fermetureRendu(racines, profondeur, arret) {
  const toutes = toutesLesFonctions();
  const parNom = {};
  toutes.forEach((f) => { (parNom[f.nom] = parNom[f.nom] || []).push(f); });
  const stop = new Set([...ARRET_PAR_DEFAUT, ...(arret || [])].filter((n) => racines.indexOf(n) < 0));
  const vues = new Set();
  let front = racines.slice();
  for (let d = 0; d <= (profondeur === undefined ? 2 : profondeur); d++) {
    const suivant = [];
    front.forEach((nom) => {
      if (vues.has(nom) || !parNom[nom]) return;
      vues.add(nom);
      parNom[nom].forEach((f) => {
        const src = fs.readFileSync(path.join(ROOT, 'js', f.fichier + '.js'), 'utf8').split('\n')
          .slice(f.debut - 1, f.fin).join('\n');
        // appels de fonctions connues, à l'intérieur du corps
        Object.keys(parNom).forEach((autre) => {
          if (stop.has(autre)) return;                      // barrière inter-surfaces
          if (!vues.has(autre) && new RegExp('\\b' + autre + '\\s*\\(').test(src)) suivant.push(autre);
        });
      });
    });
    front = suivant;
  }
  return [...vues].filter((n) => parNom[n]).flatMap((n) => parNom[n]);
}

/** Ids du markup statique d'une zone d'index.html (bornes incluses). */
function idsMarkup(debut, fin) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');
  const out = [];
  for (let n = debut; n <= fin && n <= html.length; n++) {
    let s = html[n - 1], m;
    const re = /id="([^"]+)"/g;
    while ((m = re.exec(s))) out.push({ id: m[1], ligne: n });
  }
  return out;
}

/** Handlers inline d'une zone d'index.html. */
function handlersMarkup(debut, fin) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');
  const out = [];
  for (let n = debut; n <= fin && n <= html.length; n++) {
    let s = html[n - 1], m;
    const re = /on(change|input|click|blur|submit|focus)="([^"]*)"/g;
    while ((m = re.exec(s))) out.push({ evt: m[1], code: m[2].slice(0, 120), ligne: n });
  }
  return out;
}

/**
 * Inventaire SOURCE A complet d'une surface.
 * @param {{zoneHtml?:[number,number], racines:string[], profondeur?:number}} cfg
 */
function sourceA(cfg) {
  const markup = cfg.zoneHtml ? idsMarkup(cfg.zoneHtml[0], cfg.zoneHtml[1]) : [];
  const handlers = cfg.zoneHtml ? handlersMarkup(cfg.zoneHtml[0], cfg.zoneHtml[1]) : [];
  const fns = fermetureRendu(cfg.racines, cfg.profondeur, cfg.arret);
  const codeIds = [];
  fns.forEach((f) => {
    idsProduitsPar(f.fichier, f.debut, f.fin).forEach((t) =>
      codeIds.push({ id: t.id, ou: f.fichier + '.js:' + t.ligne, fonction: f.nom, dyn: t.dyn }));
  });
  return { markup, handlers, fonctions: fns, codeIds };
}

module.exports = { sourceA, idsMarkup, handlersMarkup, fermetureRendu, idsProduitsPar,
  toutesLesFonctions, fonctionContenant, ROOT };

if (require.main === module) {
  const cfg = require(path.resolve(process.argv[2]));
  const a = sourceA(cfg.sourceA);
  const uniq = (arr) => [...new Set(arr)];
  console.log('=== SOURCE A — ' + cfg.nom + ' ===');
  console.log('zone html            : ' + (cfg.sourceA.zoneHtml ? cfg.sourceA.zoneHtml.join('-') : '(aucune)'));
  console.log('ids markup           : ' + uniq(a.markup.map((x) => x.id)).length);
  console.log('handlers inline      : ' + a.handlers.length);
  console.log('fonctions de rendu   : ' + a.fonctions.length);
  console.log('ids produits par code: ' + uniq(a.codeIds.map((x) => x.id)).length);
  console.log('TOTAL source A       : ' + uniq([...a.markup.map((x) => x.id), ...a.codeIds.map((x) => x.id)]).length);
}
