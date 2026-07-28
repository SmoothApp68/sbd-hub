/** Config d'inventaire — VAGUE 4 : onglet Stats (Volume · Muscles · Records · Cardio). OUTIL D'AUDIT. */
'use strict';
const SUBS = ['stats-volume', 'stats-muscles', 'stats-records', 'stats-cardio'];
const PROFILS = ['aurel_like', 'vierge', 'debutant', 'mono_lift', 'donnees_sales',
  'extreme_haut', 'extreme_bas', 'progression_nette', 'retour_apres_pause'];

const etats = [];
PROFILS.forEach((prof) => SUBS.forEach((sub) => etats.push({
  nom: prof + ' · ' + sub, profil: prof, settle: 1500,
  action: async (p) => { await p.evaluate((s) => { showTab('tab-stats'); showStatsSub(s); }, sub); },
})));

module.exports = { nom: 'VAGUE 4 — Stats', conteneur: '#tab-stats', sortie: 'out-v4-elements.json', etats };
