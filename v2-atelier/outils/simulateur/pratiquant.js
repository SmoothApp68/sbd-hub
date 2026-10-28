'use strict';
// Le modèle de pratiquant (AUDIT-PLAN §2.3) : pur, déterministe. Il ne connaît pas le coach ; il juge ce que le coach propose.
const A = require('./alea.js');
const { catalogue } = require('./catalogue.js');

// Rapports 1RM / poids de corps (repères de PRATIQUANTS, §2.3). Rangs : deb, int, ava.
const RATIOS = {
  H: { squat: [0.8, 1.3, 1.8], dc: [0.66, 1.07, 1.49], dl: [1.0, 1.6, 2.2], ohp: [0.4, 0.6, 0.85], row: [0.6, 0.9, 1.2] },
  F: { squat: [0.6, 1.0, 1.4], dc: [0.39, 0.66, 0.92], dl: [0.8, 1.25, 1.7], ohp: [0.25, 0.4, 0.55], row: [0.4, 0.6, 0.8] }
};
// Maximum de reps au poids du corps (H/F × débutant/intermédiaire/avancé).
const REPS_PDC = {
  H: { tractions: [1, 6, 14], pompes: [10, 25, 45], dips: [3, 10, 20], core: [8, 16, 25] },
  F: { tractions: [0, 2, 7], pompes: [3, 12, 25], dips: [0, 4, 10], core: [6, 12, 20] }
};
const RANG = { moins_1_an: 0, '1_a_3_ans': 1, '3_a_5_ans': 1, plus_5_ans: 2 };

// slug -> [référence, coefficient]
const TABLE = [
  [/^squat_barre|^squat_avec_pause/, 'squat', 1], [/hack_squat|belt_squat/, 'squat', 0.9], [/presse_a_cuisses_une_jambe/, 'squat', 0.9],
  [/presse_a_cuisses/, 'squat', 1.8], [/split_squat|step_up|fentes/, 'squat', 0.5], [/extensions_une_jambe/, 'squat', 0.3],
  [/souleve_de_terre_roumain_haltere/, 'dl', 0.55], [/souleve_de_terre_roumain/, 'dl', 0.75], [/jambes_tendues/, 'dl', 0.7],
  [/souleve_de_terre_barre_hex/, 'dl', 0.95], [/souleve_de_terre_haltere/, 'dl', 0.6], [/^souleve_de_terre/, 'dl', 1],
  [/hip_thrust_une_jambe/, 'dl', 0.35], [/hip_thrust/, 'dl', 0.9], [/leg_curl/, 'squat', 0.35], [/extension_jambes/, 'squat', 0.55],
  [/mollets/, 'squat', 0.9], [/rear_kick|kickbacks_poulie/, 'squat', 0.2], [/abduction|adduction/, 'squat', 0.5],
  [/developpe_couche_incline_haltere/, 'dc', 0.68], [/developpe_couche_incline_barre/, 'dc', 0.85], [/developpe_couche_haltere/, 'dc', 0.76],
  [/chest_press_incline/, 'dc', 0.8], [/chest_press/, 'dc', 0.9], [/developpe_couche|decline_barre/, 'dc', 1],
  [/developpe_militaire_haltere/, 'ohp', 0.78], [/developpe_militaire|presse_epaules/, 'ohp', 1], [/arnold/, 'ohp', 0.7],
  [/elevation_laterale_haltere/, 'dc', 0.12], [/elevation_laterale|elevation_frontale/, 'dc', 0.14], [/tirage_vers_visage/, 'row', 0.3],
  [/rowing_haltere|rowing_incline/, 'row', 0.8], [/rowing_poulie|rowing_assis_machine|rowing_divergent/, 'row', 0.95], [/rowing/, 'row', 1],
  [/tirage_poitrine_bras_tendus/, 'row', 0.3], [/tirage_poitrine|tirage_machine/, 'row', 0.95],
  [/ecarte_haltere/, 'dc', 0.25], [/ecarte|ecartes/, 'dc', 0.45], [/oiseau/, 'dc', 0.15],
  [/curl_biceps_haltere|curl_marteau_haltere|curl_incline/, 'dc', 0.33], [/curl/, 'dc', 0.4],
  [/triceps_haltere|au_dessus_de_la_tete/, 'dc', 0.3], [/kickback_triceps/, 'dc', 0.2], [/triceps|skullcrusher/, 'dc', 0.45],
  [/shrug_haltere/, 'dl', 0.7], [/shrug/, 'dl', 0.9], [/crunch_poulie/, 'dc', 0.5], [/rotation_russe|hyperextension/, 'dc', 0.2],
  [/pull_over/, 'dc', 0.35]
];
const PDC_REPS = [[/tractions/, 'tractions'], [/pompes|pompe/, 'pompes'], [/dips/, 'dips'], [/releve|planche|crunch|gainage/, 'core']];

function pdcDe(profil, r) { return (profil.special.pdc || (profil.sexe === 'femme' ? 63 : 80)) * (1 + (r() - 0.5) * 0.16); }

// La capacité initiale de l'exercice : { type: 'kg' | 'reps', C }.
function capaciteInitiale(profil, slug, r) {
  const fiche = catalogue[slug] || {};
  const sx = profil.sexe === 'femme' ? 'F' : 'H';
  const rg = RANG[profil.anciennete];
  const bw = profil._pdc || (profil._pdc = pdcDe(profil, A.creer(profil.id, 'pdc')));
  if (fiche.mesure === 'reps' || fiche.charge === 'aucune' || fiche.equipement === 'aucun') {
    const cle = (PDC_REPS.find(([re]) => re.test(slug)) || [0, 'core'])[1];
    return { type: 'reps', C: Math.max(1, REPS_PDC[sx][cle][rg] * (profil.special.progres === 2 ? 1 : 1)) };
  }
  const F = profil.special.force;
  const ref = {
    squat: F ? F.squat : bw * RATIOS[sx].squat[rg], dc: F ? F.dc : bw * RATIOS[sx].dc[rg], dl: F ? F.dl : bw * RATIOS[sx].dl[rg],
    ohp: F ? F.dc * 0.62 : bw * RATIOS[sx].ohp[rg], row: F ? F.dc * 0.88 : bw * RATIOS[sx].row[rg]
  };
  const t = TABLE.find(([re]) => re.test(slug));
  let C = t ? ref[t[1]] * t[2] : ref.dc * 0.4;
  if (profil.special.leger && /curl|elevation|triceps/.test(slug)) C *= 0.8;
  return { type: 'kg', C };
}

function pasDe(profil, equipement) {
  if (equipement === 'machine') return profil.special.pasMachine || 5;
  if (equipement === 'haltere') return 2;
  if (equipement === 'kettlebell') return 4;
  return 2.5;
}
const arrondir = (v, pas) => Math.max(pas, Math.round(v / pas) * pas);

// Croissance hebdomadaire de base (§2.3).
function gHebdo(profil, semaine) {
  const s = profil.special;
  let g;
  if (profil.anciennete === 'moins_1_an') g = 0.016 * Math.exp(-semaine / 30);
  else if (profil.anciennete === 'plus_5_ans') g = 0.0002;
  else if (profil.anciennete === '3_a_5_ans') g = 0.0008;        // C : 2e-5e année, +2 à +6 %/an (REFERENTIEL §1.2)
  else g = 0.0019;                                                 // 1re année structurée (Latella 2024)
  if (s.progres !== undefined) g *= s.progres;
  return g;
}
// C (bornes-verifiees.json) : la sèche ne freine pas la FORCE (Murphy & Koehler 2022 : elle freine la masse). Débutant/intermédiaire 1,0 ; avancé 0,9 (hypothèse 0,8-1,0).
const S_PHASE = (phase, niv) => phase === 'prise_de_masse' ? 1.15 : phase === 'seche' ? (niv === 'plus_5_ans' ? 0.9 : 1.0) : 1;
const BAS = /squat|presse_a|hack|souleve|hip_thrust|leg_|extension_jambes|mollets|split|step_up|abduction|adduction|rear_kick|kickback/;

module.exports = { capaciteInitiale, pasDe, arrondir, gHebdo, S_PHASE, BAS };
