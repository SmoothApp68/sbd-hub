/**
 * Consolidation des statuts runtime des 176 éléments. OUTIL D'AUDIT.
 * Fusionne out-5a.json (visibilité mesurée) avec les résultats des passes ciblées
 * (variantes, conditionnels, aller-retour, consommation, hash) et produit la colonne
 * « Runtime » du rapport. Chaque statut vient d'une observation, pas d'une opinion.
 */
'use strict';
const fs = require('fs');
const ELEMENTS = require('./elements.json');
const VIS = JSON.parse(fs.readFileSync(__dirname + '/out-5a.json', 'utf8'));
const PROFILS = ['aurel_like', 'vierge', 'debutant'];

// Révélés par une action réelle (5a quinquies / 5b bis) → conditionnels, pas inatteignables
const REVELE_PAR_ACTION = {
  formeScoreTooltip: 'clic sur ⓘ → VISIBLE',
  csvPreview: 'choix d\'un fichier → VISIBLE',
  restorePreview: 'choix d\'un fichier → VISIBLE',
  inputPasswordConfirm: 'switchAuthMode(\'signup\') → VISIBLE',
  emailLoginSection: 'session anonyme → VISIBLE', inputEmail: 'session anonyme → VISIBLE',
  inputPassword: 'session anonyme → VISIBLE', authSubmitBtn: 'session anonyme → VISIBLE',
  forgotPasswordBtn: 'session anonyme → VISIBLE', authModeLogin: 'session anonyme → VISIBLE',
  authModeSignup: 'session anonyme → VISIBLE', authModeTabs: 'session anonyme → VISIBLE',
  changePasswordSection: 'session email → VISIBLE', newPassword: 'session email → VISIBLE',
  newPasswordConfirm: 'session email → VISIBLE',
  settingsCycleBlock: 'profil femme → VISIBLE 322×71',
  settingsCycleDetails: 'femme + cycle activé → VISIBLE 296×191',
  settingsCycleLastDate: 'femme + cycle activé → éditable (aller-retour ✔)',
  settingsCycleLength: 'femme + cycle activé → éditable',
  settingsMenstrualSection: 'profil femme → VISIBLE 322×144',
  menstrualStartDate: 'femme + suivi activé → présent', menstrualCycleLength: 'femme + suivi activé → présent',
  settingsWeightCut: 'weightCut.active=true → VISIBLE 322×432',
  'wc-start-weight': 'weightCut.active=true → VISIBLE', 'wc-target-weight': 'weightCut.active=true → VISIBLE',
  'wc-current-weight': 'weightCut.active=true → VISIBLE + aller-retour ✔',
  'wc-competition-date': 'weightCut.active=true → VISIBLE',
  'toggle-creatine': 'weightCut.active=true → aller-retour ✔ (case 0×0 : motif switch iOS)',
  settingsMorphoSection: 'level ≠ debutant → VISIBLE 322×134',
  settingsPrehabToggle: 'case 0×0 volontaire (switch iOS) ; aller-retour ✔',
  'toggle-hybrid': 'case 0×0 volontaire (switch iOS) ; aller-retour ✔',
  settingsCycleEnabled: 'profil femme ; aller-retour ✔',
};

// Non testables, avec la raison
const NON_TESTABLE = {
  importSummary: 'chemin de révélation présent (import.js:1004) mais mon échantillon Hevy n\'a pas été parsé',
  importDetails: 'idem importSummary (conteneur enfant)',
  aiImportAnalysis: 'dépend d\'une analyse IA (Edge Function) — réseau stubbé',
  csvProgress: 'csvImportBtn resté disabled : mon échantillon CSV a été rejeté par parseCSVData',
  csvProgressBar: 'idem csvProgress', csvProgressText: 'idem csvProgress',
  settingsHealthConnect: 'dépend de l\'appairage Garmin/Health Connect — hors périmètre et hors réseau',
};

// Vraiment inatteignables — vérifié après avoir exécuté leur action déclenchante
const INATTEIGNABLE = {
  'acc-notif': 'toggleAcc(\'acc-notif\') exécuté → reste display:none (style INLINE jamais retiré)',
  'push-status-label': 'contenu de acc-notif → jamais atteint',
  'tab-profil-badges': 'aucun appelant : showProfilSub ne reçoit JAMAIS cette valeur (0/16 appels). '
    + 'Forcé à la main → VISIBLE, donc le markup fonctionne : c\'est le parcours qui manque',
  'profil-badges-content': 'contenu de tab-profil-badges',
};

const rows = ELEMENTS.map((e) => {
  const v = PROFILS.map((p) => VIS[p][e.id]);
  const visQqPart = v.some((x) => x.vis);
  const domQqPart = v.some((x) => x.dom);
  let statut, note;
  if (INATTEIGNABLE[e.id]) { statut = '✔ CONFIRMÉ'; note = 'inatteignable — ' + INATTEIGNABLE[e.id]; }
  else if (visQqPart) { statut = '✔ CONFIRMÉ'; note = 'visible au repos dans ≥1 profil'; }
  else if (REVELE_PAR_ACTION[e.id]) { statut = '✔ CONFIRMÉ'; note = 'conditionnel — ' + REVELE_PAR_ACTION[e.id]; }
  else if (NON_TESTABLE[e.id]) { statut = '⊘ NON TESTABLE'; note = NON_TESTABLE[e.id]; }
  else { statut = '❓ SANS STATUT'; note = 'dom=' + domQqPart + ' vis=false, aucune règle'; }
  return { n: e.n, id: e.id, sec: e.sec, statut, note };
});

const sans = rows.filter((r) => r.statut.startsWith('❓'));
console.log('Total : ' + rows.length);
['✔ CONFIRMÉ', '⊘ NON TESTABLE', '❓ SANS STATUT'].forEach((s) => {
  console.log('  ' + s.padEnd(16) + rows.filter((r) => r.statut === s).length);
});
if (sans.length) { console.log('\nLIGNES SANS STATUT :'); sans.forEach((r) => console.log('  #' + r.n + ' ' + r.id + ' — ' + r.note)); }

console.log('\n## Détail des lignes NON « visible au repos »');
rows.filter((r) => r.note !== 'visible au repos dans ≥1 profil')
  .forEach((r) => console.log('  #' + String(r.n).padEnd(4) + r.id.padEnd(26) + r.statut.padEnd(16) + r.note));

fs.writeFileSync(__dirname + '/out-runtime.json', JSON.stringify(rows, null, 1));
