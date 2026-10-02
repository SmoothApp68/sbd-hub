#!/usr/bin/env node
//
// tests/banc/seance-ecran.js — la séance en cours, dans un vrai navigateur.
//
// ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
//
//        L'APP TUÉE EN PLEINE SÉANCE, SANS RÉSEAU.
//
// Une séance terminée proprement avec du réseau ne distingue rien : tout
// marchait déjà. Ce qui sépare « ça tient » de « on perd la séance », c'est la
// coupure au milieu — et elle se mesure ici pour de vrai : la page est FERMÉE
// (le JS s'arrête, la mémoire part), IndexedDB reste, et on rouvre.
//
// Leçon du chantier 21 retenue : le banc mesure aussi les états TRANSITOIRES,
// pas seulement l'état final. Un écran faux affiché une seconde ne laisse
// aucune trace dans une mesure de fin.
//
// Le Supabase de papier applique les contraintes RÉELLES relevées au schéma —
// `sets_validee_si_saisie`, `sets_rang_positif`, `sessions_statut_ok`,
// `sets_rang_unique` différée. Sans elles, écrire juste et écrire n'importe
// quoi donneraient le même résultat.
//
//   node tests/banc/seance-ecran.js

const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const { creer } = require(path.join(R, 'v2/banc/serveur-pages.js'));
const { compteDeLaGarde } = require(path.join(__dirname, 'garde-compte.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8874), BASE = 'http://127.0.0.1:' + PORT;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ⚠️ 49-U7 (C6) — LA GARDE DU BANC. Chaque geste de chaque section est suivi
// d'une attente : c'est là que le crochet commun passe. Après CHAQUE attente,
// si l'app a calculé un nouveau plan, `verifierPlan` le vérifie (I1 à I15,
// I4 face au plan d'avant de la même séance, rechargement compris). Une
// violation fait échouer la section qui l'a produite. Posé une fois la page
// ouverte (plus bas) ; jamais rappelé par lui-même (il n'attend qu'avec `pause`).
let crochetPlan = null;
const attendre = async (ms) => {
  await pause(ms);
  if (crochetPlan) await crochetPlan();
};

// Attendre une CONDITION plutôt qu'une durée. Le pavé de chronométrage pose une
// écriture par chiffre : taper « 21000 » enchaîne cinq vidanges de file, et la
// dernière montée arrive après un délai qui dépend de la machine. Un `sleep`
// calibré sur un portable devient une intermittence sur un runner chargé.
const jusqua = async (cond, ms) => {
  const fin = Date.now() + (ms || 6000);
  while (Date.now() < fin) {
    if (await cond()) return true;
    await attendre(120);
  }
  return false;
};

let echecs = 0;
// Le dernier contrôle écrit : la garde du banc s'en sert pour situer le geste
// qui a produit un plan fautif.
let dernierControle = '(aucun contrôle encore)';
// ── LE RAPPORT (outillage, 30/09/2026) ──────────────────────────────────
//
// Chaque contrôle est noté avec sa section, chaque section avec sa durée. Si
// `BANC_RAPPORT` nomme un fichier, le tout y est écrit en JSON à la fin :
// c'est ce que lit le lanceur parallèle (`seance-rapide.js`) pour fusionner
// les groupes et prouver qu'aucun contrôle ne manque. Sans la variable, rien
// ne change à la sortie du banc.
const rapport = { debut: Date.now(), sections: [], controles: [] };
let sectionRapport = '(préambule)';
{
  const logDuModule = console.log;
  console.log = function () {
    const m = /^\n══ (.*) ══$/.exec(String(arguments[0]));
    if (m) {
      const t = Date.now();
      const prec = rapport.sections[rapport.sections.length - 1];
      if (prec && prec.fin === null) prec.fin = t;
      rapport.sections.push({ nom: m[1], debut: t, fin: null });
      sectionRapport = m[1];
    }
    return logDuModule.apply(console, arguments);
  };
}
const ok = (nom, cond, detail) => {
  if (!cond) echecs++;
  if (!/^\[garde\]/.test(nom)) dernierControle = nom;
  rapport.controles.push({ section: sectionRapport, nom: nom, ok: !!cond });
  console.log('   ' + (cond ? '✅' : '❌') + ' ' + nom + (detail !== undefined ? '  — ' + detail : ''));
};

const CATALOGUE = [
  { slug: 'squat-barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc-barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl Biceps Haltères', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  // ⚠️ Les trois autres mesures du catalogue (chantier 24). Sans elles, le banc
  // ne teste qu'un quart de la grille — et c'est exactement l'angle mort qui a
  // laissé passer le défaut pendant trois chantiers de saisie.
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', charge: 'aucune', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'marche', nom: 'Marche', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 38. `Seance.precedent` rend la séance la PLUS
  // RÉCENTE portant l'exercice : un slug déjà utilisé par les sections
  // précédentes ferait pointer l'antécédent sur une séance du banc, et le test
  // ne mesurerait plus rien de déterministe.
  { slug: 'rowing-barre', nom: 'Rowing Barre', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 40, et à lui seul : « un exercice jamais fait ». Tout
  // slug que le banc utilise ailleurs finit par porter des séries, et la page
  // vide ne serait alors jamais mesurée. Son nom ne répond à aucune des
  // recherches du catalogue faites plus haut.
  { slug: 'souleve-terre', nom: 'Soulevé de Terre (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['ischios'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 49-C, et à lui seul : « un exercice JAMAIS FAIT »,
  // pour le nombre de séries posé au départ hors routine (l'intention, faute
  // d'habitude). Tous les autres slugs de ce banc finissent par porter des
  // séries. Son nom ne répond à aucune des recherches faites ailleurs.
  { slug: 'mollets-debout', nom: 'Mollets Debout (Machine)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['mollets'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 49-U1 : le décor EXACT du 26/09/2026 (un historique
  // qui donne `etend`, n = 4, deux tests à 130, un cran à 127,5). Aucun autre
  // exercice du banc ne peut le porter sans fausser la section qui l'utilise.
  // Son nom ne répond à aucune des recherches faites ailleurs.
  { slug: 'hip-thrust', nom: 'Hip Thrust (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['fessiers'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 49-U2 : un décor calqué sur le cas F044 du
  // simulateur (ligne 50 × 5, deux tests à 55 × 4, un cran à 52,5). Aucun autre
  // exercice du banc ne peut le porter sans fausser la section qui l'utilise.
  // Son nom ne répond à aucune des recherches faites ailleurs.
  { slug: 'leg-extension', nom: 'Leg Extension (Machine)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 49-U4 : une montée du coach HORS ZONE LOURD, pour
  // que la propagation joue (en Lourd, la montée ne se propage pas, §9.7).
  // Son nom ne répond à aucune des recherches faites ailleurs.
  { slug: 'elevations-laterales', nom: 'Élévations Latérales (Machine)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['epaules'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 49-U4 : le décor du cas N3 (`consigne-48b7.json`),
  // À LA BARRE — le cran au-dessus de 125 est 127,5, sous le test à 130. C'est
  // ce qui permet une montée du coach ENTRE la ligne et le test.
  { slug: 'front-squat', nom: 'Front Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉS AU CHANTIER 49-U5 : une reprise longue sur une machine à GROS
  // CRAN (32 → 23, −28 %, le curl pupitre du 26/09), et une reprise courte à
  // la barre. Leurs noms ne répondent à aucune des recherches faites ailleurs.
  { slug: 'pupitre-machine', nom: 'Pupitre (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉS AU CORRECTIF DE LA FILE (27/09/2026) : la séance du constat,
  // « Mardi — Pecs Dos », deux exercices.
  { slug: 'rowing-poulie', nom: 'Rowing Poulie Assis', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'dci-halteres', nom: 'Développé Couché Incliné (Haltères)', mesure: 'charge_reps', charge: 'externe', equipement: 'haltere', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'haussement-barre', nom: 'Haussement d’Épaules (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['trapezes'], muscles_secondaires: [] },
  // 49-U8 — réservé à la section 7 G quinquies (une séance sans charge répétée).
  { slug: 'rowing-pendlay', nom: 'Rowing Pendlay (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  // 49-U10 — réservés à la section 7 G septies (les chauffes et la dégressive,
  // MOTEUR §9.15). Leurs noms ne répondent à aucune des recherches faites
  // ailleurs ; aucun muscle primaire en commun entre eux : chacun est « premier
  // sur ses muscles ».
  { slug: 'bench-u10', nom: 'Bench U10 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'quadri-u10', nom: 'Quadri U10 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'biceps-u10', nom: 'Biceps U10 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  { slug: 'militaire-u10', nom: 'Militaire U10 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['epaules'], muscles_secondaires: [] },
  // 49-U11 — réservé à la section 7 G octies (la phase). Son nom ne répond à
  // aucune des recherches faites ailleurs.
  { slug: 'presse-u11', nom: 'Presse U11 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  // 49-U12 — réservé à la section 7 G nonies (la chute). Son nom ne répond à
  // aucune des recherches faites ailleurs.
  { slug: 'incline-u12', nom: 'Incliné U12 (Haltères)', mesure: 'charge_reps', charge: 'externe', equipement: 'haltere', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  // 49-U13 — réservés à la section 7 G decies (le compteur). Leurs noms ne
  // répondent à aucune des recherches faites ailleurs.
  { slug: 'curl-u13', nom: 'Curl U13 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  { slug: 'tirage-u13', nom: 'Tirage U13 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  // 49-U14 — réservés à la section 7 G undecies (la semaine allégée). Leurs
  // noms ne répondent à AUCUNE recherche faite ailleurs (« Couch », « Rowing »…).
  { slug: 'couche-u14', nom: 'Allongé U14 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'rowing-u14', nom: 'Tirée U14', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'squat-u14', nom: 'Fléchi U14 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  // 49-U15 — réservés à la section 7 G duodecies (le blocage isolé). Leurs
  // noms ne répondent à aucune recherche faite ailleurs.
  { slug: 'pousse-u15', nom: 'Poussé U15 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'tracte-u15', nom: 'Tracté U15 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'leve-u15', nom: 'Levé U15 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['epaules'], muscles_secondaires: [] },
  { slug: 'presse-u15', nom: 'Pressé U15 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  // PR 5 de la consolidation — réservé à la section 7 G quindecies (tous les
  // écrans, mêmes données). Son nom ne répond à aucune recherche faite
  // ailleurs ; son muscle n'est travaillé nulle part ailleurs.
  { slug: 'ecrans-u5', nom: 'Écrans U5 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['adducteurs'], muscles_secondaires: [] },
  // PR 6 — réservés aux comptes de la même section : un cardio (aucun muscle
  // primaire : ses séries n'entrent pas dans « séries de travail ») et un
  // exercice où l'on ne fera que des chauffes (il n'est pas « fait »).
  { slug: 'cardio-u6', nom: 'Rameur U6', mesure: 'temps', charge: 'aucune', equipement: 'machine', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'chauffes-u6', nom: 'Chauffé U6 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['adducteurs'], muscles_secondaires: [] },
  // 49-U17 — réservé à la section 7 G terdecies (la série de plus). Son muscle
  // (les avant-bras) n'est travaillé nulle part ailleurs : sa règle de volume
  // ne dépend que de ce décor.
  { slug: 'serre-u17', nom: 'Serré U17 (Poulie)', mesure: 'charge_reps', charge: 'externe', equipement: 'poulie', muscles_primaires: ['avant_bras'], muscles_secondaires: [] },
  { slug: 'hausse-u17', nom: 'Haussé U17 (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['trapezes'], muscles_secondaires: [] },
  { slug: 'tendu-u17', nom: 'Tendu U17 (Machine)', mesure: 'charge_reps', charge: 'externe', equipement: 'machine', muscles_primaires: ['mollets'], muscles_secondaires: [] },
  // Le rejeu (diagnostic du 01/10/2026) — réservés à la section 7 G
  // quaterdecies : le décor équivalent de la séance « Jeudi — Haut B » (le
  // militaire, le couché aux haltères, le tirage visage, le curl EZ). Leurs
  // noms ne répondent à AUCUNE recherche faite ailleurs (« Couch », « Curl »…),
  // et leurs muscles ne sont travaillés nulle part ailleurs.
  { slug: 'militaire-rj', nom: 'Rejeu Un (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: [] },
  { slug: 'couche-rj', nom: 'Rejeu Deux (Haltères)', mesure: 'charge_reps', charge: 'externe', equipement: 'haltere', muscles_primaires: ['triceps'], muscles_secondaires: [] },
  { slug: 'visage-rj', nom: 'Rejeu Trois (Poulie)', mesure: 'charge_reps', charge: 'externe', equipement: 'poulie', muscles_primaires: ['deltoide_posterieur'], muscles_secondaires: [] },
  { slug: 'curlez-rj', nom: 'Rejeu Quatre (Barre EZ)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre', muscles_primaires: ['brachial'], muscles_secondaires: [] }
];

// ⚠️ UNE ROUTINE PORTE MAINTENANT SES LIGNES (chantier 43). `routine_sets`
// remplace les deux entiers `series` / `reps_visees` : c'est de là que
// `Seance.creer` tire la structure d'une séance démarrée depuis une routine.
// Une fixture restée aux entiers démarrerait une séance à UNE série vide, et
// la moitié du banc mesurerait un écran que personne n'aura jamais.
//
// `progr(n, reps)` fabrique n lignes de TRAVAIL identiques — exactement ce que
// l'entier voulait dire, et rien de plus. La rampe d'échauffement, elle,
// s'écrit à la main : c'est la configuration discriminante du chantier, et la
// cacher derrière une aide la rendrait invisible.
let grainePr = 0;
const progr = (n, reps) => {
  const lignes = [];
  for (let i = 0; i < n; i++) {
    lignes.push({ id: 'pr' + (++grainePr), rang: i + 1, type_serie: 'travail',
      reps_visees: reps === undefined ? null : reps,
      charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
  }
  return lignes;
};

const ROUTINE = {
  id: 'r-banc', nom: 'Push', note: null, archivee_a: null,
  created_at: '2026-09-01T08:00:00Z', modifiee_a: '2026-09-01T08:00:00Z',
  routine_exercises: [
    { id: 're1', routine_id: 'r-banc', exercise_slug: 'squat-barre', rang: 0, routine_sets: progr(3, 5), repos_cible_s: 180, groupe_superset: null, note: null },
    { id: 're2', routine_id: 'r-banc', exercise_slug: 'dc-barre', rang: 1, routine_sets: progr(2, 8), repos_cible_s: null, groupe_superset: null, note: null }
  ]
};

// ⚠️ CONFIGURATION DISCRIMINANTE DU CHANTIER 27 — UN SUPERSET À SÉRIES
// INÉGALES, ET UN EXERCICE SEUL DANS LA MÊME SÉANCE.
//
// Sur un superset régulier validé de haut en bas, « l'éclairage porte sur le
// tour » et « l'éclairage porte sur la ligne » donnent le même écran : chaque
// validation ferme son tour dans la foulée. Il faut la branche plus courte (C
// n'a que deux séries) pour que le tour 3 se ferme sans `C3`, et l'exercice
// seul pour prouver que les lettres ne débordent pas sur lui.
const ROUTINE_SUPERSET = {
  id: 'r-super', nom: 'Superset', note: null, archivee_a: null,
  created_at: '2026-09-03T08:00:00Z', modifiee_a: '2026-09-03T08:00:00Z',
  routine_exercises: [
    { id: 'rs1', routine_id: 'r-super', exercise_slug: 'dc-barre', rang: 0, routine_sets: progr(3, 8), repos_cible_s: 90, groupe_superset: 1, note: null },
    { id: 'rs2', routine_id: 'r-super', exercise_slug: 'curl', rang: 1, routine_sets: progr(3, 12), repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs3', routine_id: 'r-super', exercise_slug: 'planche', rang: 2, routine_sets: progr(2, null), repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs4', routine_id: 'r-super', exercise_slug: 'squat-barre', rang: 3, routine_sets: progr(2, 5), repos_cible_s: 180, groupe_superset: null, note: null }
  ]
};

// ⚠️ CONFIGURATION DISCRIMINANTE DU CHANTIER 24 — les QUATRE mesures dans la
// MÊME séance. Sur une séance qui n'en contient qu'une, « la grille s'adapte »
// et « la grille est fixe » donnent exactement le même écran.
const ROUTINE_MESURES = {
  id: 'r-mesures', nom: 'Les quatre mesures', note: null, archivee_a: null,
  created_at: '2026-09-02T08:00:00Z', modifiee_a: '2026-09-02T08:00:00Z',
  routine_exercises: [
    { id: 'rm1', routine_id: 'r-mesures', exercise_slug: 'dc-barre', rang: 0, routine_sets: progr(1, 8), repos_cible_s: 120, groupe_superset: null, note: null },
    { id: 'rm2', routine_id: 'r-mesures', exercise_slug: 'tractions', rang: 1, routine_sets: progr(1, 12), repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm3', routine_id: 'r-mesures', exercise_slug: 'planche', rang: 2, routine_sets: progr(1, null), repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm4', routine_id: 'r-mesures', exercise_slug: 'marche', rang: 3, routine_sets: progr(1, null), repos_cible_s: null, groupe_superset: null, note: null }
  ]
};

// ⚠️ LE DÉCOR — une séance DÉJÀ TERMINÉE, dans la semaine affichée.
//
// C'est la moitié de la configuration discriminante du chantier 23. Sans elle,
// les totaux de la semaine valent zéro, et « 0 » avec la séance en cours comme
// sans elle ne distingue rien : le banc passerait sur du code qui ne filtre
// pas. Il faut un total NON NUL qui doit rester IDENTIQUE.
// ⚠️ DEUX ROUTINES POUR LA CASCADE DES REPS (48b-5b-3, §7 duovicies) : le
// même exercice, trois séries de travail, avec des reps visées (8) et sans.
// Le soulevé de terre, que rien d'autre dans ce banc ne fait : son historique
// se pose au §7 duovicies, et la consigne s'y calcule sans décor parasite.
const ROUTINE_TERRE = {
  id: 'r-terre', nom: 'Terre', note: null, archivee_a: null,
  created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
  routine_exercises: [
    { id: 'rt1', routine_id: 'r-terre', exercise_slug: 'souleve-terre', rang: 0, routine_sets: progr(3, 8), repos_cible_s: 180, groupe_superset: null, note: null }
  ]
};
const ROUTINE_TERRE_LIBRE = {
  id: 'r-terre-libre', nom: 'Terre libre', note: null, archivee_a: null,
  created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
  routine_exercises: [
    { id: 'rtl1', routine_id: 'r-terre-libre', exercise_slug: 'souleve-terre', rang: 0, routine_sets: progr(3, null), repos_cible_s: 180, groupe_superset: null, note: null }
  ]
};

// ⚠️ LE PROFIL DU BANC, DÉJÀ VU (48b-5b-3). Sans ligne `profiles`, l'app en
// crée une à `onboarding_completed: false` et le démarrage suivant s'ouvre sur
// le profil (`doitOuvrirProfil`) : chaque `aller('/saisie')` tomberait sur le
// mauvais écran. Un profil existant, comme sur l'appareil, et l'intention
// fait l'aller-retour serveur — c'est ce que le §7 duovicies mesure.
const PROFIL_BANC = {
  id: 'u-banc', username: 'banc', bio: null, sexe: null, taille_cm: null,
  date_naissance: null, mode_entrainement: null, unites: null, anciennete: null,
  intention: 'progresser', rythme_progression: 'normal', materiel: null,
  niveau_declare: null, seances_par_semaine: null, jours_vises: null,
  duree_seance_min: null, onboarding_completed: true
};

// ⚠️ LE DÉCOR SE DATE DANS LA JOURNÉE EN COURS, JAMAIS DEPUIS UN JOUR DE LA
// SEMAINE. Le pourquoi, en entier, est dans `decor-dates.js` — avec la seule
// milliseconde de bord qui subsiste. `JOURS[n]` remplace l'ancien
// `LUNDI + n jours` : même ORDRE, mêmes rangs, et toujours dans le passé.
const { datesDuDecor, ancreSemaineIsolee, seanceSansSeries, jourIsole, ilYa, finDe } =
  require(path.join(__dirname, 'decor-dates.js'));
const JOURS = datesDuDecor();

const PASSEE = {
  id: 'sess-passee', user_id: 'u-banc', titre: 'Séance de lundi',
  debut: JOURS[0].toISOString(), fin: finDe(JOURS[0]).toISOString(),
  statut: 'terminee', salle: null, salle_norme: null,
  created_at: JOURS[0].toISOString()
};

const SETS_PASSES = [1, 2].map((n) => ({
  id: 'set-passe-' + n, session_id: PASSEE.id, user_id: 'u-banc',
  exercise_slug: 'squat-barre',
  charge_kg: 120, reps: 5, duree_s: null, distance_m: null, type_serie: 'travail',
  rang: n, groupe_superset: null, validee_a: JOURS[0].toISOString(), rpe: null,
  ressenti: null, repos_s: null, note: null, source: 'import',
  created_at: JOURS[0].toISOString(), modifie_a: null
}));

// ⚠️ LA SÉANCE IMPORTÉE, TELLE QUE LA BASE LA PORTE VRAIMENT (chantier 34).
//
// `SETS_PASSES` ci-dessus est une fixture IDÉALISÉE : elle porte `source` d'un
// import ET un `validee_a`. Les 28 103 lignes réelles n'ont PAS de `validee_a`
// — c'est ce que dit `SCHEMA-REEL.md`, et c'est ce que `sets_validee_si_saisie`
// autorise (la contrainte n'exige `validee_a` que pour `source = 'app'`).
//
// C'est exactement cet écart qui a caché la perte : avec un `validee_a`, la
// séance passait par le chemin normal ; sans lui, `lignes()` la rendait VIDE
// et `remplacerSeries` effaçait tout. La configuration discriminante est donc
// `validee_a` NULL **et** `source <> 'app'`, et rien d'autre.
//
// Deux exercices ENTRELACÉS (rangs 1,2,3,4 en A,B,A,B) : 53 blocs de la base
// réelle sont dans cet état, et c'est la forme qui éprouve la préservation des
// rangs à la réécriture. `ressenti` et `repos_s` sont renseignés : ce sont les
// deux colonnes que la liste de lecture oubliait.
const IMPORTEE = {
  id: 'sess-importee', user_id: 'u-banc', titre: 'Séance importée',
  debut: JOURS[2].toISOString(),
  fin: finDe(JOURS[2]).toISOString(),
  statut: 'terminee', note: null, salle: null, salle_norme: null,
  routine_id: null, source: 'hevy',
  created_at: JOURS[2].toISOString()
};

// ⚠️ DEUX BLOCS, PAS UN — ET C'EST LE CHANTIER 35 QUI L'EXIGE (§6).
// Les quatre premières lignes forment un SUPERSET entrelacé ; les deux
// dernières un exercice seul, posé après. Sans ce second bloc, « Monter le
// bloc » est inerte et le déplacement ne peut pas se mesurer — or c'est
// exactement la forme de la séance du 24/08 qui a montré les défauts : un
// superset, puis un accessoire à la fin.
const SETS_IMPORTES = [
  { slug: 'squat-barre', rang: 1, kg: 100,  groupe: 1 },
  { slug: 'dc-barre',    rang: 2, kg: 60,   groupe: 1 },
  { slug: 'squat-barre', rang: 3, kg: 105,  groupe: 1 },
  { slug: 'dc-barre',    rang: 4, kg: 62.5, groupe: 1 },
  { slug: 'curl',        rang: 5, kg: 12,   groupe: null },
  { slug: 'curl',        rang: 6, kg: 12,   groupe: null }
].map((d) => ({
  id: 'set-imp-' + d.rang, session_id: IMPORTEE.id, user_id: 'u-banc',
  exercise_slug: d.slug, charge_kg: d.kg, reps: 5,
  duree_s: null, distance_m: null, type_serie: 'travail',
  rang: d.rang, groupe_superset: d.groupe,
  validee_a: null,                       // ← LE POINT : NULL, comme les 28 103
  rpe: null, ressenti: 'reste_2', repos_s: 120, note: null,
  source: 'hevy',
  created_at: IMPORTEE.debut, modifie_a: null
}));

(async () => {
  // ── Le Supabase de papier, avec les contraintes de la vraie base ────────
  const base = {
    sessions: [Object.assign({}, PASSEE), Object.assign({}, IMPORTEE)],
    sets: SETS_PASSES.concat(SETS_IMPORTES).map((s) => Object.assign({}, s)),
    profiles: [Object.assign({}, PROFIL_BANC)],
    zones: [],
    predictions: [],
    journal: [], patchs: [], reseau: true
  };

  // Le décor ne doit pas fausser les comptes des sections qui parlent de LA
  // séance en cours : on le met de côté une fois pour toutes.
  // ⚠️ DEUX DÉCORS, PAS UN. `IMPORTEE` (chantier 34) est du décor au même titre
  // que `PASSEE` : les compteurs du banc portent sur ce que la SÉANCE EN COURS
  // écrit, pas sur ce que la base contenait déjà.
  const DECORS = [PASSEE.id, IMPORTEE.id];
  const sessions = () => base.sessions.filter((s) => DECORS.indexOf(s.id) < 0);
  const sets = () => base.sets.filter((s) => DECORS.indexOf(s.session_id) < 0);

  // ⚠️ TOUT REFUS EST JOURNALISÉ (chantier 33). Un banc qui ne note pas ce que
  // le serveur a refusé ne peut pas affirmer qu'il n'a rien refusé — et c'est
  // exactement ce qu'un test de perte de données doit pouvoir prouver.
  const refus = (code, msg) => {
    base.journal.push({ op: 'refus', refus: code, message: msg });
    return { code: code, message: msg, details: msg };
  };

  // Les routines du banc, et l'index unique (routine_id, rang) de la vraie
  // base. Un instantané permet de REFUSER une écriture en la défaisant, comme
  // le ferait Postgres — sans lui, le banc laisserait passer un plan qui
  // collisionne et le device seul dirait non.
  const ROUTINES = [ROUTINE, ROUTINE_MESURES, ROUTINE_SUPERSET, ROUTINE_TERRE, ROUTINE_TERRE_LIBRE];
  // ⚠️ L'INSTANTANÉ COPIE AUSSI LES LIGNES PROGRAMMÉES. Sans ça, défaire une
  // écriture refusée rendrait les rangs d'avant et les séries d'après — un
  // état que la vraie base n'atteint jamais, et sur lequel la suite du banc
  // mesurerait n'importe quoi.
  const instantaneRoutines = () =>
    ROUTINES.map((r) => r.routine_exercises.map((e) => Object.assign({}, e, {
      routine_sets: (e.routine_sets || []).map((x) => Object.assign({}, x))
    })));
  const rendreRoutines = (instantane) => {
    ROUTINES.forEach((r, i) => { r.routine_exercises = instantane[i]; });
  };
  const collisionRangRoutine = () => {
    const vus = new Set();
    for (const r of ROUTINES) {
      for (const e of r.routine_exercises) {
        const c = r.id + '#' + e.rang;
        if (vus.has(c)) return true;
        vus.add(c);
      }
    }
    return false;
  };

  // ⚠️ L'UTILISATEUR DE LA SESSION DU BANC. Le RLS réel est
  // `USING (user_id = auth.uid())` avec le même `WITH CHECK` : une écriture
  // dont le `user_id` n'est pas celui du jeton est refusée par le serveur,
  // pas par le client. On imite le WITH CHECK — voir la note au-dessus de
  // `verifierSet`.
  const MOI = 'u-banc';

  function verifierSet(l) {
    // ⚠️ CE QUE CETTE IMITATION PROUVE, ET CE QU'ELLE NE PROUVE PAS.
    //
    // Elle prouve que l'APP envoie un `user_id` cohérent — c'est-à-dire
    // exactement le défaut D2 du chantier 34, où `COLONNES_SEANCE` ne relisait
    // pas la colonne et l'app renvoyait `null` après une synchro.
    //
    // Elle NE prouve PAS que la politique RLS est correcte : la vraie policy
    // vit en base, elle peut être absente, mal écrite ou désactivée sans que
    // ce banc s'en aperçoive. Un faux serveur ne teste jamais le RLS ; il teste
    // ce que le client lui donne à avaler. Confondre les deux donnerait une
    // fausse assurance, et c'est le seul endroit de ce fichier où la tentation
    // existe.
    if (l.user_id === null || l.user_id === undefined) return refus('23502', 'sets.user_id NOT NULL');
    if (l.user_id !== MOI) return refus('42501', 'new row violates row-level security policy for table "sets"');
    if (!l.exercise_slug) return refus('23502', 'sets.exercise_slug NOT NULL');
    if (!CATALOGUE.some((e) => e.slug === l.exercise_slug)) return refus('23503', 'sets_exercise_slug_fkey');
    if (['app', 'hevy', 'import', 'collage'].indexOf(l.source) < 0) return refus('23514', 'sets_source_ok');
    // GÉNÉRÉE : Postgres refuse toute valeur, même NULL — comme `salle_norme`.
    if ('elastique_norme' in l) return refus('428C9', 'elastique_norme est générée');
    // ⚠️ `sets.id` EST uuid NOT NULL (chantier 33). Ce banc ne le vérifiait pas :
    // il acceptait `id: null`, et son upsert par `findIndex` écrasait alors
    // toutes les lignes nulles les unes sur les autres — six séries devenaient
    // deux, SANS ERREUR. C'est par ce trou précis que le défaut du chantier 22
    // a traversé un banc, des tests et onze chantiers. Un banc plus permissif
    // que la base ne teste pas la base.
    if (l.id === null || l.id === undefined) return refus('23502', 'sets.id NOT NULL');
    if (l.source === 'app' && !l.validee_a) return refus('23514', 'sets_validee_si_saisie');
    if (!(l.rang >= 1)) return refus('23514', 'sets_rang_positif');
    if (['echauffement', 'travail', 'degressive', 'echec'].indexOf(l.type_serie) < 0) return refus('23514', 'sets_type_serie_ok');
    if (l.ressenti && ['reste_3_plus', 'reste_2', 'reste_1', 'reste_0'].indexOf(l.ressenti) < 0) return refus('23514', 'sets_ressenti_ok');
    if (l.rpe !== null && l.rpe !== undefined && !(l.rpe > 0 && l.rpe <= 10)) return refus('23514', 'sets_rpe_ok');
    if (l.repos_s !== null && l.repos_s !== undefined && !(l.repos_s >= 0 && l.repos_s <= 3600)) return refus('23514', 'sets_repos_borne');
    // ⚠️ `reps` ET `duree_s` SONT `integer` (chantier 36, D6). Aucun CHECK ne
    // les borne : ce qui les refuse est le TYPE. Au-delà d'`int4` Postgres
    // répond `22003` ; au-delà de 1e21 le nombre part en notation exponentielle
    // dans le JSON et devient `22P02`, code DÉFINITIF. Un banc qui accepte
    // n'importe quel entier ne peut pas voir ce défaut-là.
    for (const col of ['reps', 'duree_s']) {
      const v = l[col];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number' || !isFinite(v)) return refus('22P02', col + ' : entier invalide');
      if (Math.abs(v) > 2147483647) return refus('22003', col + ' hors int4');
    }
    if (!base.sessions.some((s) => s.id === l.session_id)) return refus('23503', 'sets_session_id_fkey');
    return null;
  }

  const serveur = creer({ racine: path.join(R, 'v2') });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });

  const SCRIPT_JETON = () => {
    const JETON = JSON.stringify({
      access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800,
      token_type: 'bearer', user: { id: 'u-banc', email: 'banc@test' }
    });
    localStorage.setItem('th-v2-auth', JETON);
    const vraiRemove = Storage.prototype.removeItem;
    const vraiSet = Storage.prototype.setItem;
    Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vraiRemove.call(this, c); };
    Storage.prototype.setItem = function (c, v) { return vraiSet.call(this, c, c === 'th-v2-auth' ? JETON : v); };
  };
  await ctx.addInitScript(SCRIPT_JETON);

  // ── Mouchards : la vibration et le son ─────────────────────────────────
  //
  // ⚠️ On RELÈVE d'abord la présence native, AVANT de toucher à quoi que ce
  // soit. En remplaçant `navigator.vibrate` par un bouchon, on ne testerait
  // plus que son propre bouchon — et la question posée est justement « l'API
  // est-elle là ? ». On enveloppe donc la vraie fonction, on ne la remplace pas.
  // ⚠️ MOUCHARD SUR `THCache.remplacerTout` (chantier 36). `cache.js` le réserve
  // aux magasins PETITS et rafraîchis en entier, et écrit noir sur blanc que
  // « les 28 103 séries ne passent pas par ici » : il VIDE le magasin puis le
  // réécrit, et une fermeture d'app au milieu le laisse à moitié plein,
  // définitivement. Supprimer UNE séance l'appelait sur `series`.
  //
  // On ENVELOPPE, on ne remplace pas : sinon on ne testerait plus que son propre
  // bouchon.
  await ctx.addInitScript(() => {
    window.__magasinsRemplaces = [];
    const poser = () => {
      if (!window.THCache || window.THCache.__espionne) return false;
      const vrai = window.THCache.remplacerTout;
      window.THCache.remplacerTout = function (magasin, enr) {
        window.__magasinsRemplaces.push(magasin);
        return vrai.call(this, magasin, enr);
      };
      window.THCache.__espionne = true;
      return true;
    };
    if (!poser()) {
      const t = setInterval(() => { if (poser()) clearInterval(t); }, 20);
      setTimeout(() => clearInterval(t), 8000);
    }
  });

  await ctx.addInitScript(() => {
    window.__vibrateNatif = typeof navigator.vibrate === 'function';
    window.__vibrations = [];
    const vrai = window.__vibrateNatif ? navigator.vibrate.bind(navigator) : null;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: function (d) { window.__vibrations.push(d); return vrai ? vrai(d) : false; }
    });

    window.__bips = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    window.__audioNatif = !!AC;
    if (AC) {
      const creer = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () {
        const o = creer.call(this);
        const demarrer = o.start.bind(o);
        o.start = function (t) { window.__bips++; return demarrer(t); };
        return o;
      };
    }
  });

  // ⚠️ LE FAUX SERVEUR PROJETTE LES COLONNES, COMME POSTGREST (chantier 34).
  //
  // Il renvoyait la LIGNE ENTIÈRE en ignorant `select=`. Le vrai PostgREST ne
  // renvoie que les colonnes demandées — et c'est CE seul écart qui rendait
  // invisibles les trois pertes du chantier 34 : une colonne écrite mais
  // absente de la liste de lecture revenait quand même au banc, jamais sur
  // l'appareil. Un banc plus permissif que la base ne teste pas la base.
  //
  // La syntaxe couverte est celle que `donnees.js` emploie réellement : une
  // liste séparée par des virgules, et UNE ressource imbriquée
  // (`routine_exercises(...)`). Les alias et les filtres imbriqués de
  // PostgREST ne sont pas couverts — l'app ne s'en sert pas, et imiter ce
  // qu'on n'utilise pas donnerait une assurance sur du code qui n'existe pas.
  const decouperSelect = (texte) => {
    const bouts = []; let profondeur = 0, courant = '';
    for (const c of texte) {
      if (c === '(') profondeur++;
      if (c === ')') profondeur--;
      if (c === ',' && profondeur === 0) { bouts.push(courant); courant = ''; continue; }
      courant += c;
    }
    if (courant.trim()) bouts.push(courant);
    return bouts.map((b) => b.trim()).filter(Boolean);
  };
  const projeterUne = (ligne, champs) => {
    if (champs.indexOf('*') >= 0) return Object.assign({}, ligne);
    const sortie = {};
    for (const champ of champs) {
      const m = /^([A-Za-z_][\w]*)\s*\((.*)\)$/.exec(champ);
      if (m) {
        const imbrique = ligne[m[1]];
        sortie[m[1]] = Array.isArray(imbrique)
          ? imbrique.map((x) => projeterUne(x, decouperSelect(m[2])))
          : imbrique;
        continue;
      }
      // 49-U14 — un champ JSON nommé, comme PostgREST : `compteur:fondement->compteur`.
      const j = /^(\w+):(\w+)->(\w+)$/.exec(champ);
      if (j) {
        const objet = ligne[j[2]];
        sortie[j[1]] = objet && Object.prototype.hasOwnProperty.call(objet, j[3]) ? objet[j[3]] : null;
        continue;
      }
      // ⚠️ LA COLONNE ABSENTE DE `select=` EST ABSENTE DE LA RÉPONSE — pas
      // `null`. C'est la différence qui compte : `undefined` traverse
      // `Object.assign` sans écraser, `null` écrase.
      if (Object.prototype.hasOwnProperty.call(ligne, champ)) sortie[champ] = ligne[champ];
    }
    return sortie;
  };
  const projeter = (data, url) => {
    const select = url.searchParams.get('select');
    if (!select || !Array.isArray(data)) return data;
    const champs = decouperSelect(select);
    return data.map((l) => projeterUne(l, champs));
  };

  await ctx.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    const corps = req.postData() ? JSON.parse(req.postData()) : null;
    const unSeul = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const json = (data, status) => route.fulfill({
      status: status || 200, contentType: 'application/json',
      body: JSON.stringify(unSeul && Array.isArray(data) ? data[0] : data)
    });

    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (!base.reseau) return route.abort('failed');
    // 27/09/2026 — une LENTEUR sur `predictions` seule (écritures) : c'est la
    // fenêtre du constat, où l'observation vidée à la dévalidation était encore
    // en vol quand la série revenait.
    if (base.lenteurPredictions && table === 'predictions' && req.method() !== 'GET') {
      await new Promise((r) => setTimeout(r, base.lenteurPredictions));
    }
    // 26/09/2026 — deux réglages de la section 7 tricies. `lenteur` retarde la
    // synchronisation COMPLÈTE (la liste des séances), pas la lecture légère
    // des séances en cours : c'est la fenêtre du constat, où « Démarrer »
    // était offert avant que la séance ouverte en base soit vue. `enCoursEnPanne`
    // fait échouer cette lecture légère — le démarrage « hors ligne »
    // où la vérification ne peut rien, et où la vidange doit prendre le relais.
    // Une PANNE TENUE (la requête n'aboutit pas), pas un compteur : le client
    // retente certains GET, un seul refus serait absorbé sans rien éprouver.
    const lectureEnCours = req.method() === 'GET' && table === 'sessions' &&
      /statut=eq\.en_cours/.test(url.search);
    if (base.enCoursEnPanne && lectureEnCours) return route.abort('failed');
    if (base.lenteur && req.method() === 'GET' && table === 'sessions' && !lectureEnCours) {
      await attendre(base.lenteur);
    }

    // PR 8 de la consolidation — LA COURSE DE LA SYNCHRONISATION, FORCÉE
    // (section 5). Au retour du réseau, la vidange de la file (l'envoi d'une
    // série) et la synchronisation de l'entrée partent EN MÊME TEMPS. Selon le
    // minutage, la série arrivait en base ENTRE les deux lectures de la
    // synchronisation — la liste des séries (`seriesDepuis`) et leur compte
    // (`compterSeries`) : l'une l'avait, l'autre non (2 bancs complets sur 4).
    // Ici la fenêtre est imposée, quel que soit l'ordre des deux lectures :
    // l'envoi attend que la PREMIÈRE ait été servie, la SECONDE attend que
    // l'envoi soit en base. Un coup, puis le banc reprend son cours.
    const cs = base.courseSync;
    const lectureDeLaCourse = table === 'sets' && (
      (req.method() === 'GET' && !url.searchParams.get('session_id')) ||
      (req.method() === 'HEAD' && /count=exact/.test(req.headers()['prefer'] || '')));
    if (cs && !cs.envoye && req.method() === 'POST' && table === 'sets') {
      await Promise.race([cs.premiere, pause(5000)]);
      cs.envoye = true;
    }
    if (cs && lectureDeLaCourse && cs.lectures < 2) {
      cs.lectures++;
      if (cs.lectures === 2) {
        for (let k = 0; k < 50 && !cs.envoye; k++) await pause(100);
        await pause(300);
        cs.ordre.push(req.method());
      } else {
        cs.ordre.push(req.method());
        // Servie d'abord, PUIS l'envoi est libéré.
        setTimeout(() => cs.libere(), 50);
      }
    }

    // ⚠️ LE COMPTE DE CONTRÔLE, POUR DE VRAI. Sans l'en-tête `Content-Range`,
    // `compterSeances`/`compterSeries` rendent null, `verifierCompletude` se
    // déclare non vérifiable, et la cohérence entre la purge des séries
    // orphelines et le compte du serveur n'est JAMAIS mise à l'épreuve. C'est
    // précisément ce qui a laissé passer la première version de ce chantier,
    // où filtrer `statut` au serveur faisait purger les séries de la séance en
    // cours pendant qu'on s'entraînait.
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      const n = table === 'sessions' ? base.sessions.length
              : table === 'sets' ? base.sets.length : 0;
      // ⚠️ `access-control-expose-headers` n'est pas une politesse : sans lui,
      // le navigateur laisse passer la réponse mais INTERDIT au JavaScript de
      // lire `content-range`, qui n'est pas dans la liste sûre du CORS. Le
      // compte revient alors `null`, `verifierCompletude` se déclare non
      // vérifiable, et le banc n'éprouve plus rien. Le vrai Supabase l'envoie.
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-range': '0-' + Math.max(0, n - 1) + '/' + n,
          'access-control-expose-headers': 'content-range, content-length'
        },
        body: ''
      });
    }

    // ⚠️ LA TABLE `profiles` (48b-5b-3). Elle n'était pas servie : le profil ne
    // faisait jamais l'aller-retour serveur, et `profil = rendu` (la ligne que
    // l'upsert renvoie, PROJETÉE sur `select=`) n'était exercé par aucun banc.
    // `maybeSingle` sans ligne → PGRST116 « 0 rows », que postgrest-js rend en
    // `data: null` — c'est le cas du compte neuf.
    // §9.1.1 (48b-7) — `zones_exercice`, l'historique des corrections de zone.
    // En ajout seul : chaque choix ajoute une ligne, et l'upsert par `id` est
    // ce qui rend un renvoi inoffensif. La politique réelle est celle du
    // propriétaire, donc la lecture ne filtre pas par `user_id`.
    if (table === 'zones_exercice') {
      if (req.method() === 'GET') return json(projeter(base.zones, url));
      if (req.method() === 'POST') {
        const l = Array.isArray(corps) ? corps[0] : corps;
        base.journal.push({ op: 'zone', id: l.id, slug: l.exercise_slug, zone: l.zone });
        if (!l.id) return json(refus('23502', 'zones_exercice.id NOT NULL'), 400);
        if (!l.user_id) return json(refus('23502', 'zones_exercice.user_id NOT NULL'), 400);
        if (l.user_id !== MOI) return json(refus('42501', 'new row violates row-level security policy for table "zones_exercice"'), 400);
        if (!CATALOGUE.some((e) => e.slug === l.exercise_slug)) return json(refus('23503', 'zones_exercice_exercise_slug_fkey'), 400);
        // La contrainte réelle de la colonne : cinq clés, ou NULL.
        if (l.zone !== null && l.zone !== undefined &&
            ['lourd', 'mix', 'hypertrophie', 'volume', 'series_longues'].indexOf(l.zone) < 0) {
          return json(refus('23514', 'zones_exercice_zone_ok'), 400);
        }
        if (!l.corrigee_a) return json(refus('23502', 'zones_exercice.corrigee_a NOT NULL'), 400);
        const i = base.zones.findIndex((x) => x.id === l.id);
        const ligne = Object.assign({ created_at: l.corrigee_a }, i >= 0 ? base.zones[i] : {}, l);
        if (i >= 0) base.zones[i] = ligne; else base.zones.push(ligne);
        return json(projeter([ligne], url), 201);
      }
    }

    // §9.11 (48c) — `predictions`, AVEC SON VERROU. C'est ce verrou qui fait
    // la valeur de ce décor : la vraie base porte le trigger
    // `predictions_immuable`, qui compare `to_jsonb(new)` moins les trois
    // colonnes d'observation à `to_jsonb(old)` moins ces mêmes colonnes et
    // lève si ça diffère. Un décor sans lui laisserait passer un upsert rejoué
    // — exactement la forme que la vraie base refuse définitivement.
    const OBSERVATION = ['valeur_observee', 'observee_a', 'set_observe'];
    const sansObservation = (l) => {
      const o = {};
      Object.keys(l || {}).sort().forEach((k) => {
        if (OBSERVATION.indexOf(k) < 0) o[k] = l[k];
      });
      return JSON.stringify(o);
    };
    if (table === 'predictions') {
      // `session_id` est une colonne GÉNÉRÉE en base (`fondement->>'seance'`,
      // relevé le 01/10/2026) : le banc la calcule comme Postgres.
      if (req.method() === 'GET') {
        // 49-U14 — le filtre `module=eq.…` (les paris de l'escalier, lus à part).
        const module = (url.searchParams.get('module') || '').replace(/^eq\./, '');
        // L'outil de rejeu — le filtre `session_id=eq.…` (les paris d'UNE séance).
        const sid = (url.searchParams.get('session_id') || '').replace(/^eq\./, '');
        return json(projeter(base.predictions.map((l) => Object.assign({}, l,
          { session_id: l.fondement && l.fondement.seance ? l.fondement.seance : null }))
          .filter((l) => (!module || l.module === module) && (!sid || l.session_id === sid)), url));
      }
      if (req.method() === 'POST') {
        const l = Array.isArray(corps) ? corps[0] : corps;
        const ignorer = /resolution=ignore-duplicates/.test(req.headers()['prefer'] || '');
        base.journal.push({ op: 'prediction', id: l.id, slug: l.exercise_slug,
                            rang: l.fondement && l.fondement.rang, ignorer: ignorer });
        if (!l.id) return json(refus('23502', 'predictions.id NOT NULL'), 400);
        if (!l.user_id) return json(refus('23502', 'predictions.user_id NOT NULL'), 400);
        if (l.user_id !== MOI) return json(refus('42501', 'new row violates row-level security policy for table "predictions"'), 400);
        // Une clé étrangère NULLE ne vérifie rien (le pari de la semaine
        // allégée, 49-U14, ne porte aucun exercice).
        if (l.exercise_slug !== null && l.exercise_slug !== undefined &&
            !CATALOGUE.some((e) => e.slug === l.exercise_slug)) return json(refus('23503', 'predictions_exercise_slug_fkey'), 400);
        if (l.set_observe && !base.sets.some((x) => x.id === l.set_observe)) {
          return json(refus('23503', 'predictions_set_observe_fkey'), 400);
        }
        if (l.borne_basse !== null && l.borne_haute !== null &&
            l.borne_basse !== undefined && l.borne_haute !== undefined &&
            l.borne_basse > l.borne_haute) {
          return json(refus('23514', 'predictions_bornes_ordonnees'), 400);
        }
        const i = base.predictions.findIndex((x) => x.id === l.id);
        if (i >= 0) {
          // ON CONFLICT DO NOTHING d'un côté ; de l'autre, le trigger.
          if (ignorer) return json([], 201);
          if (sansObservation(base.predictions[i]) !== sansObservation(l)) {
            return json(refus('P0001', 'predictions : ligne immuable'), 400);
          }
          base.predictions[i] = Object.assign({}, base.predictions[i], l);
          return json(projeter([base.predictions[i]], url), 201);
        }
        base.predictions.push(Object.assign({ created_at: l.emise_a }, l));
        return json(projeter([l], url), 201);
      }
      if (req.method() === 'PATCH') {
        const id = (url.searchParams.get('id') || '').replace('eq.', '');
        const l = Array.isArray(corps) ? corps[0] : corps;
        base.journal.push({ op: 'observation', id: id, valeur: l.valeur_observee });
        const i = base.predictions.findIndex((x) => x.id === id);
        if (i < 0) return json([], 200);
        const fusion = Object.assign({}, base.predictions[i], l);
        if (sansObservation(base.predictions[i]) !== sansObservation(fusion)) {
          return json(refus('P0001', 'predictions : ligne immuable'), 400);
        }
        if (fusion.set_observe && !base.sets.some((x) => x.id === fusion.set_observe)) {
          return json(refus('23503', 'predictions_set_observe_fkey'), 400);
        }
        // `predictions_observation_coherente` (v2_052) : une observation exige
        // `set_observe`, sauf pour `module = 'escalier'` ; `observee_a` la suit.
        if ((fusion.valeur_observee !== null && fusion.valeur_observee !== undefined &&
             !fusion.set_observe && fusion.module !== 'escalier') ||
            ((fusion.valeur_observee === null || fusion.valeur_observee === undefined) !==
             (fusion.observee_a === null || fusion.observee_a === undefined))) {
          return json(refus('23514', 'predictions_observation_coherente'), 400);
        }
        base.predictions[i] = fusion;
        return json(projeter([fusion], url), 200);
      }
    }

    if (table === 'profiles') {
      if (req.method() === 'GET') {
        const lignesProfil = projeter(base.profiles, url);
        if (unSeul && !lignesProfil.length) {
          return route.fulfill({ status: 406, contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows',
              hint: null, message: 'JSON object requested, multiple (or no) rows returned' }) });
        }
        return json(lignesProfil);
      }
      if (req.method() === 'POST') {
        const l = Array.isArray(corps) ? corps[0] : corps;
        base.journal.push({ op: 'profil', champs: Object.assign({}, l) });
        const i = base.profiles.findIndex((x) => x.id === l.id);
        const ligne = Object.assign({}, i >= 0 ? base.profiles[i] : {}, l);
        if (i >= 0) base.profiles[i] = ligne; else base.profiles.push(ligne);
        return json(projeter([ligne], url), 201);
      }
    }

    if (req.method() === 'GET') {
      if (table === 'exercises') return json(projeter(CATALOGUE, url));
      if (table === 'routines') return json(projeter(ROUTINES, url));
      if (table === 'sessions') {
        const st = (url.searchParams.get('statut') || '').replace('eq.', '');
        return json(projeter(st ? base.sessions.filter((s) => s.statut === st) : base.sessions, url));
      }
      if (table === 'sets') {
        const sid = (url.searchParams.get('session_id') || '').replace('eq.', '');
        return json(projeter(sid ? base.sets.filter((s) => s.session_id === sid) : base.sets, url));
      }
      return json([]);
    }

    // ⚠️ LA MISE À JOUR D'UNE LIGNE DE ROUTINE (chantier 26). Sans ce
    // gestionnaire, un PATCH tombait dans le `json([])` final : la requête
    // « réussissait » sans rien écrire, et « la routine n'est pas touchée »
    // aurait été vrai de toute implémentation — y compris d'une qui écrit à
    // chaque geste. C'est exactement le banc plus permissif que l'appareil.
    // ⚠️ LES CHECK DE `routine_exercises` MANQUAIENT À CE BANC (chantier 36).
    //
    // Le banc des routines les applique depuis le chantier 34 ; celui-ci, non.
    // Or c'est ICI que passe le REPORT DE FIN DE SÉANCE — le seul chemin qui
    // n'appelle pas `Routines.valider()`. Le défaut D5 était donc structurellement
    // invisible : le banc qui voit le geste ne vérifiait pas la contrainte, et le
    // banc qui vérifie la contrainte ne voit pas le geste.
    // ⚠️ ET CELLES DE `routine_sets` (chantier 43), qui ne sont PAS les mêmes :
    // le rang y commence à 1, là où celui d'un exercice accepte 0. C'est ici
    // que passe le report de fin de séance — le seul chemin qui n'appelle pas
    // `Routines.valider()` — donc c'est ici qu'un 23514 définitif naîtrait.
    const checkRoutineSet = (l) => {
      if (!(l.rang >= 1)) return 'routine_sets_rang_positif';
      if (['travail', 'echauffement', 'degressive', 'echec'].indexOf(l.type_serie) < 0) {
        return 'routine_sets_type_serie';
      }
      if (l.reps_visees !== null && l.reps_visees !== undefined &&
          !(l.reps_visees >= 1 && l.reps_visees <= 100)) return 'routine_sets_reps_bornees';
      if (l.duree_cible_s !== null && l.duree_cible_s !== undefined &&
          !(l.duree_cible_s >= 1 && l.duree_cible_s <= 35999)) return 'routine_sets_duree_bornee';
      if (l.distance_cible_m !== null && l.distance_cible_m !== undefined &&
          !(l.distance_cible_m >= 0 && l.distance_cible_m <= 100000)) return 'routine_sets_distance_bornee';
      if (!l.routine_exercise_id) return 'routine_sets.routine_exercise_id NOT NULL';
      if (!l.user_id) return 'routine_sets.user_id NOT NULL';
      return null;
    };
    const exoDeSerie = (id) => {
      for (const r of ROUTINES) {
        const e = r.routine_exercises.filter((x) => x.id === id)[0];
        if (e) return e;
      }
      return null;
    };

    const checkRoutineExo = (l) => {
      if (l.reps_visees !== null && l.reps_visees !== undefined &&
          !(l.reps_visees >= 1 && l.reps_visees <= 100)) return 'routine_exos_reps_bornees';
      if (l.repos_cible_s !== null && l.repos_cible_s !== undefined &&
          !(l.repos_cible_s >= 5 && l.repos_cible_s <= 1800)) return 'routine_exos_repos_borne';
      if (l.groupe_superset !== null && l.groupe_superset !== undefined &&
          !(l.groupe_superset >= 0)) return 'routine_exos_superset_positif';
      if (l.rang !== undefined && !(l.rang >= 0)) return 'routine_exos_rang_positif';
      return null;
    };

    if (req.method() === 'PATCH' && table === 'routine_exercises') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const champs = Array.isArray(corps) ? corps[0] : corps;
      base.patchs.push({ id: id, champs: Object.assign({}, champs) });
      const malPatch = checkRoutineExo(champs);
      if (malPatch) return json(refus('23514', malPatch), 400);
      const avant = instantaneRoutines();
      for (const r of ROUTINES) {
        const i = r.routine_exercises.findIndex((e) => e.id === id);
        if (i >= 0) r.routine_exercises[i] = Object.assign({}, r.routine_exercises[i], champs);
      }
      // ⚠️ `routine_exos_rang_uniq` N'EST PAS DIFFÉRÉE, elle. Contrairement à
      // `sets_rang_unique`, elle se vérifie À CHAQUE ÉNONCÉ : un plan qui passe
      // par un état intermédiaire en collision est refusé au milieu, la routine
      // à moitié écrite. C'est la contrainte qui fait tout l'intérêt du plan.
      if (collisionRangRoutine()) { rendreRoutines(avant);
        return json(refus('23505', 'routine_exos_rang_uniq'), 409); }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'routine_exercises') {
      const lignes = (Array.isArray(corps) ? corps : [corps]).map((l) => Object.assign({}, l));
      base.patchs.push({ op: 'insert', lignes: lignes });
      for (const l of lignes) {
        const mal = checkRoutineExo(l);
        if (mal) return json(refus('23514', mal), 400);
      }
      const avant = instantaneRoutines();
      for (const l of lignes) {
        const r = ROUTINES.filter((x) => x.id === l.routine_id)[0];
        if (r) r.routine_exercises.push(l);
      }
      if (collisionRangRoutine()) { rendreRoutines(avant);
        return json(refus('23505', 'routine_exos_rang_uniq'), 409); }
      return json(lignes, 201);
    }

    // Le remplacement en bloc des lignes d'un exercice : DELETE par parent,
    // puis INSERT. `routine_sets_rang_unique` est DIFFÉRABLE, donc l'état
    // intermédiaire est légal et seule la fin compte.
    if (req.method() === 'DELETE' && table === 'routine_sets') {
      const parent = (url.searchParams.get('routine_exercise_id') || '').replace('eq.', '');
      base.patchs.push({ op: 'delete-series', id: parent });
      const e = exoDeSerie(parent);
      if (e) e.routine_sets = [];
      return json([]);
    }

    if (req.method() === 'POST' && table === 'routine_sets') {
      const lignes = (Array.isArray(corps) ? corps : [corps]).map((l) => Object.assign({}, l));
      base.patchs.push({ op: 'insert-series', lignes: lignes });
      for (const l of lignes) {
        const mal = checkRoutineSet(l);
        if (mal) return json(refus('23514', mal), 400);
      }
      const avant = instantaneRoutines();
      for (const l of lignes) {
        const e = exoDeSerie(l.routine_exercise_id);
        if (!e) { rendreRoutines(avant);
          return json(refus('23503', 'routine_sets_routine_exercise_id_fkey'), 400); }
        e.routine_sets = (e.routine_sets || []).concat([Object.assign({ id: 'pr' + (++grainePr) }, l)]);
      }
      for (const r of ROUTINES) {
        for (const e of r.routine_exercises) {
          const vus = new Set();
          for (const x of (e.routine_sets || [])) {
            if (vus.has(x.rang)) { rendreRoutines(avant);
              return json(refus('23505', 'routine_sets_rang_unique'), 409); }
            vus.add(x.rang);
          }
        }
      }
      return json(lignes, 201);
    }

    if (req.method() === 'DELETE' && table === 'routine_exercises') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.')
        ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''))
        : [brut.replace('eq.', '')];
      base.patchs.push({ op: 'delete', ids: ids });
      for (const r of ROUTINES) {
        r.routine_exercises = r.routine_exercises.filter((e) => ids.indexOf(e.id) < 0);
      }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'sessions') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'session', id: l.id, statut: l.statut });
      // ⚠️ LE DÉFAUT DE LA COLONNE, PAS UN REFUS (chantier 34). `sessions.statut`
      // vaut `'terminee'` PAR DÉFAUT en base : une omission est ACCEPTÉE et
      // rend la séance immédiatement réputée finie. Refuser l'omission, comme
      // ce banc le faisait, produisait un symptôme bruyant là où la production
      // produit une corruption muette — le contraire d'un banc utile.
      if (!('statut' in l)) l.statut = 'terminee';
      if (['en_cours', 'terminee'].indexOf(l.statut) < 0) return json(refus('23514', 'sessions_statut_ok'), 400);
      if (l.user_id === null || l.user_id === undefined) return json(refus('23502', 'sessions.user_id NOT NULL'), 400);
      if (l.user_id !== MOI) return json(refus('42501', 'new row violates row-level security policy for table "sessions"'), 400);
      if (!l.debut) return json(refus('23502', 'sessions.debut NOT NULL'), 400);
      if (l.source === null || l.source === undefined) return json(refus('23502', 'sessions.source NOT NULL'), 400);
      // ⚠️ `sessions_une_seule_en_cours` — INDEX UNIQUE, NON DIFFÉRABLE, sur
      // (user_id) WHERE statut = 'en_cours'. Il n'est ni dans `SCHEMA-REEL.md`
      // ni dans aucun banc, et c'est lui qui fait qu'une séance restée ouverte
      // en base empêche DÉFINITIVEMENT d'en démarrer une autre : 23505 est un
      // code définitif, donc la file se bloque derrière.
      if (l.statut === 'en_cours' && base.sessions.some(
            (x) => x.id !== l.id && x.user_id === l.user_id && x.statut === 'en_cours')) {
        return json(refus('23505', 'sessions_une_seule_en_cours'), 409);
      }
      // GÉNÉRÉE : Postgres refuse toute valeur, même la bonne, même NULL.
      if ('salle_norme' in l) return json(refus('428C9', 'salle_norme est générée'), 400);
      if (l.salle !== null && l.salle !== undefined &&
          !(String(l.salle).length >= 1 && String(l.salle).length <= 60)) {
        return json(refus('23514', 'sessions_salle_non_vide'), 400);
      }
      const i = base.sessions.findIndex((s) => s.id === l.id);
      if (i >= 0) base.sessions[i] = Object.assign({}, base.sessions[i], l);
      else base.sessions.push(Object.assign({}, l));
      return json([l], 201);
    }

    if (req.method() === 'POST' && table === 'sets') {
      const lignes = Array.isArray(corps) ? corps : [corps];
      base.journal.push({ op: 'sets', n: lignes.length });
      const avant = base.sets.slice();
      // ⚠️ `sets_pkey` — deux lignes d'un même lot ne peuvent pas partager un
      // identifiant (chantier 34, défaut D4). Le banc les écrasait l'une sur
      // l'autre en silence : six séries en devenaient deux, et le banc
      // applaudissait. C'est la forme exacte du défaut du chantier 33, une
      // contrainte plus loin.
      const idsDuLot = lignes.map((l) => l && l.id);
      if (new Set(idsDuLot).size !== idsDuLot.length) {
        return json(refus('23505', 'duplicate key value violates unique constraint "sets_pkey"'), 409);
      }
      for (const l of lignes) {
        const e = verifierSet(l);
        if (e) { base.sets = avant; return json(e, 400); }
        const i = base.sets.findIndex((s) => s.id === l.id);
        if (i >= 0) base.sets[i] = Object.assign({}, l); else base.sets.push(Object.assign({}, l));
      }
      // La contrainte est DIFFÉRÉE : vérifiée à la fin de la transaction.
      const vus = new Set();
      for (const l of base.sets) {
        const c = l.session_id + '#' + l.rang;
        if (vus.has(c)) { base.sets = avant; return json(refus('23505', 'sets_rang_unique'), 409); }
        vus.add(c);
      }
      return json(lignes, 201);
    }

    // ⚠️ LE PATCH SUR `sessions` MANQUAIT (chantier 36, D7), et c'est le même
    // piège qu'au chantier 26 : sans gestionnaire, il tombait dans le `json([])`
    // final. La requête « réussissait » sans rien écrire — donc « la séance
    // restée ouverte est refermée » aurait été vrai de toute implémentation, y
    // compris d'une qui ne fait rien.
    if (req.method() === 'PATCH' && table === 'sessions') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const champs = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'patch-session', id: id, champs: Object.assign({}, champs) });
      // GÉNÉRÉE : Postgres refuse toute écriture sur `salle_norme`, même NULL.
      if ('salle_norme' in champs) return json(refus('428C9', 'salle_norme est générée'), 400);
      if (champs.statut !== undefined &&
          ['en_cours', 'terminee'].indexOf(champs.statut) < 0) {
        return json(refus('23514', 'sessions_statut_ok'), 400);
      }
      const i = base.sessions.findIndex((x) => x.id === id);
      if (i < 0) return json([]);
      const apres = Object.assign({}, base.sessions[i], champs);
      // Et l'index unique se vérifie ICI aussi : repasser une séance `en_cours`
      // alors qu'une autre l'est déjà est exactement ce qu'il interdit.
      if (apres.statut === 'en_cours' && base.sessions.some(
            (x) => x.id !== id && x.user_id === apres.user_id && x.statut === 'en_cours')) {
        return json(refus('23505', 'sessions_une_seule_en_cours'), 409);
      }
      base.sessions[i] = apres;
      return json([]);
    }

    if (req.method() === 'DELETE') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.')
        ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''))
        : [brut.replace('eq.', '')];
      if (table === 'sessions') {
        base.journal.push({ op: 'suppression', ids: ids });
        base.sessions = base.sessions.filter((s) => ids.indexOf(s.id) < 0);
        base.sets = base.sets.filter((s) => ids.indexOf(s.session_id) < 0);   // CASCADE
      } else {
        base.sets = base.sets.filter((s) => ids.indexOf(s.id) < 0);
        // `sets_efface_observation` (v2_047, BEFORE DELETE ON sets) : une série
        // supprimée emporte l'observation des prédictions qui la désignent.
        // Sans lui, le banc garderait des reps comptées sur une série disparue
        // — un état que la vraie base ne peut pas avoir.
        base.predictions.forEach((l, i) => {
          if (l.set_observe && ids.indexOf(l.set_observe) >= 0) {
            base.predictions[i] = Object.assign({}, l,
              { set_observe: null, valeur_observee: null, observee_a: null });
          }
        });
      }
      return json([]);
    }
    return json([]);
  });

  let page = await ctx.newPage();
  const erreurs = [];
  const brancher = (p) => {
    p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 140)));
  };
  brancher(page);

  // ── 49-U7 (C6) — LA GARDE DU BANC : TOUS LES PLANS, TOUTES LES SECTIONS ──
  //
  // Deux comptes, indépendants l'un de l'autre :
  //   · LE CROCHET (`verifierDernier`) : après chaque attente, si l'app a
  //     calculé un nouveau plan (`THPlan.dernier`), `verifierPlan` le vérifie,
  //     avec le plan d'avant de la même séance (I4, rechargement compris — le
  //     plan d'avant est gardé ici, côté banc, pas dans la page). Une violation
  //     fait échouer la section qui l'a produite, avec le dernier contrôle
  //     écrit pour situer le geste ;
  //   · LA GARDE DE L'APP (`THPlan.garde`, active sur 127.0.0.1) : elle voit
  //     TOUS les plans que l'app calcule, même ceux qu'un geste remplace avant
  //     la fin de l'attente. Le banc lit son compte à chaque attente : une
  //     violation qu'elle voit fait aussi échouer la section, et à la fin,
  //     chaque section où l'app a calculé un plan doit avoir été vérifiée par
  //     le crochet — sans quoi le crochet s'est tu quelque part.
  // `I10 suite` est RAPPORTÉE (49-U4), pas une violation : comptée à part.
  // I26 (49-U19) aussi, EN MODE RAPPORT : chaque écart de cohérence des
  // phrases que LA GARDE DE L'APP voit (tous les plans, pas un échantillon :
  // la liste ne dépend pas du moment des attentes) se note une fois
  // (`phrases`), puis se compare à la liste d'attente (`garde-compte.js`).
  const gardeBanc = { plans: 0, violations: 0, rapports: [], phrases: [], avant: null, sections: {}, liste: [],
                      suspendue: false, app: { plans: 0, violations: 0, phrases: 0 } };
  const phrasesVues = {};
  let sectionCourante = '(préparation)';
  const sectionDe = (nom) => gardeBanc.sections[nom] ||
    (gardeBanc.sections[nom] = { verifies: 0, app: 0, violations: 0 });
  const logBanc = console.log;
  console.log = function () {
    const m = /^\n══ (.*) ══$/.exec(String(arguments[0]));
    if (m) { sectionCourante = m[1]; sectionDe(sectionCourante); }
    return logBanc.apply(console, arguments);
  };
  const echouerGarde = (quoi, erreurs) => {
    const s = sectionDe(sectionCourante);
    s.violations++;
    gardeBanc.violations++;
    gardeBanc.liste.push({ section: sectionCourante, geste: dernierControle, quoi, erreurs });
    ok('[garde] ' + sectionCourante + ' — ' + quoi + ' après « ' + dernierControle + ' »', false,
      JSON.stringify(erreurs.slice(0, 3)));
  };
  const verifierDernier = async () => {
    let r;
    try {
      r = await page.evaluate((avant) => {
        const P = window.THPlan, d = P && P.dernier;
        if (!d || !d.plan) return null;
        window.__gardeBancVu = d;
        const av = avant && avant.seance === d.plan.seance ? avant : null;
        return { erreurs: P.verifierPlan(d.plan, d.entrees, av).erreurs, plan: d.plan };
      }, gardeBanc.avant);
    } catch (e) { return; }   // navigation en cours : le plan sera vu à l'attente suivante
    if (!r) return;
    gardeBanc.plans++;
    gardeBanc.avant = r.plan;
    sectionDe(sectionCourante).verifies++;
    r.erreurs.filter((x) => x.indexOf('I10 suite') === 0)
      .forEach((x) => gardeBanc.rapports.push(sectionCourante + ' : ' + x));
    const graves = r.erreurs.filter((x) => x.indexOf('I10 suite') !== 0);
    if (graves.length) echouerGarde('le plan viole un invariant', graves);
  };
  let enCours = false;
  crochetPlan = async () => {
    if (enCours || gardeBanc.suspendue) return;
    enCours = true;
    try {
      let r;
      try {
        r = await page.evaluate(() => {
          const P = window.THPlan;
          if (!P) return null;
          // Un nouveau contexte (page neuve, rechargement) : la garde de l'app
          // y repart de zéro.
          const neufCtx = !window.__gardeBancJeton;
          window.__gardeBancJeton = 1;
          const e = P.garde && P.garde.etat ? P.garde.etat() : null;
          return { neufCtx, app: e ? e.plans : 0, appV: e ? e.violations : [], appP: e ? (e.ecartsPhrases || []) : [],
                   neuf: !!(P.dernier && window.__gardeBancVu !== P.dernier) };
        });
      } catch (e) { return; }
      if (!r) return;
      const base = r.neufCtx ? { plans: 0, violations: 0, phrases: 0 } : gardeBanc.app;
      sectionDe(sectionCourante).app += Math.max(0, r.app - base.plans);
      const nouvelles = r.appV.slice(base.violations).filter((x) => x.indexOf('I10 suite') !== 0);
      r.appP.slice(base.phrases || 0).forEach((e) => {
        const x = { plan: 'banc', ou: e.ou, phrase: e.phrase, citation: e.citation, attendu: e.attendu, cause: e.cause };
        const cle = JSON.stringify(x);
        if (phrasesVues[cle]) return;
        phrasesVues[cle] = true;
        gardeBanc.phrases.push(x);
      });
      gardeBanc.app = { plans: r.app, violations: r.appV.length, phrases: r.appP.length };
      if (nouvelles.length) echouerGarde('la garde de l’app a vu une violation', nouvelles);
      if (r.neuf) await verifierDernier();
    } finally { enCours = false; }
  };

  const aller = async (chemin) => {
    await page.goto(BASE + (chemin || '/'), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await attendre(2600);
  };
  const visible = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id));
  const texte = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const compter = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

  // Les lignes de série sont réparties dans plusieurs blocs : on les adresse par
  // leur index GLOBAL, pas par `nth-child`, qui compterait l'en-tête du bloc.
  const ligne = async (i) => (await page.$$('.ligne-serie'))[i];

  const saisirSerie = async (i, charge, reps) => {
    const l = await ligne(i);
    const champs = await l.$$('input');
    await champs[0].fill(String(charge));
    await champs[1].fill(String(reps));
    await l.$eval('.ok-serie', (b) => b.click());
    await attendre(450);
  };

  const toucher = async (i, sel) => {
    const l = await ligne(i);
    await l.$eval(sel, (b) => b.click());
    await attendre(400);
  };
  const lire = async (i, sel) => (await ligne(i)).$eval(sel, (b) => b.textContent);

  // La bibliothèque porte plusieurs routines, triées par nom : on démarre CELLE
  // qu'on vise, pas la première venue.
  const demarrerRoutine = async (nom) => {
    await page.evaluate((n) => {
      const rangees = Array.from(document.querySelectorAll('.routine-rangee'));
      const r = rangees.filter((x) => x.querySelector('.routine-nom').textContent === n)[0];
      r.querySelector('.demarrer').click();
    }, nom);
    await attendre(900);
  };

  // ── LA FIN DU BANC ──────────────────────────────────────────────────────
  // Une fonction, et pas des lignes en fin de fichier : le découpeur de
  // sections (`seance-sections.js`) la garde telle quelle, quelles que soient
  // les sections jouées.
  const clore = async () => {
    const fin = rapport.sections[rapport.sections.length - 1];
    if (fin && fin.fin === null) fin.fin = Date.now();
    console.log('\nerreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
    if (erreurs.length) echecs++;
    if (process.env.BANC_RAPPORT) {
      require('fs').writeFileSync(process.env.BANC_RAPPORT, JSON.stringify({
        debut: rapport.debut, fin: Date.now(), echecs: echecs, erreurs: erreurs,
        sections: rapport.sections, controles: rapport.controles,
        garde: { plans: gardeBanc.plans, violations: gardeBanc.violations, rapports: gardeBanc.rapports,
                 phrases: gardeBanc.phrases, liste: gardeBanc.liste, sections: gardeBanc.sections }
      }));
    }
    console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ tout passe'));
    await nav.close();
    await new Promise((r) => serveur.close(r));
    process.exit(echecs ? 1 : 0);
  };

  console.log('\n══ 0. LA MONTÉE D’INDEXEDDB, VERSION 4 → 5 ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : UNE BASE QUI EXISTE DÉJÀ, en
  // version 4, AVEC DES DONNÉES DEDANS. Une base neuve ne distingue rien —
  // elle se crée en version 5 et tous les magasins y sont d'emblée. Ce qu'on
  // doit prouver, c'est qu'un téléphone qui a déjà tout (des séances, des
  // séries, son profil, une file d'attente non vidée) traverse la montée sans
  // rien perdre. Un magasin ajouté par une montée fautive — `deleteObjectStore`
  // de trop, transaction avortée — les emporterait DÉFINITIVEMENT.
  //
  // On se place sur l'origine SANS lancer l'app : une feuille de style suffit.
  // Charger l'app d'abord créerait la base en version 4 et il n'y aurait plus
  // de montée à mesurer.
  await page.goto(BASE + '/styles.css', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const posees = await page.evaluate(() => new Promise((resoudre, rejeter) => {
    const req = indexedDB.open('trainhub-v2', 4);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      db.createObjectStore('seances', { keyPath: 'id' }).createIndex('debut', 'debut');
      db.createObjectStore('series', { keyPath: 'id' }).createIndex('session_id', 'session_id');
      db.createObjectStore('exercices', { keyPath: 'slug' });
      db.createObjectStore('pesees', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'cle' });
      db.createObjectStore('brouillon', { keyPath: 'cle' });
      db.createObjectStore('attente', { keyPath: 'cle' });
      db.createObjectStore('zones', { keyPath: 'id' }).createIndex('exercise_slug', 'exercise_slug');
    };
    req.onerror = () => rejeter(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['seances', 'series', 'meta', 'attente', 'zones'], 'readwrite');
      // La correction de zone est ce que la version d'avant a de plus récent,
      // donc ce qu'une montée fautive emporterait en premier (48b-7).
      //
      // ⚠️ UNE LIGNE À ZONE VIDE, ET C'EST DÉLIBÉRÉ. C'est ce qu'écrit
      // « Revenir à celle d'après tes séances » : une vraie ligne, qui ne
      // change AUCUNE consigne. Une correction active ici tiendrait tout le
      // reste du banc — mesuré : `mix` sur le couché faisait dire « 120 kg,
      // vise 6 » à quatre sections qui n'ont rien à voir avec les zones.
      tx.objectStore('zones').put({ id: 'zone-v4', user_id: 'u-banc',
        exercise_slug: 'dc-barre', zone: null, corrigee_a: '2026-09-02T08:00:00.000Z' });
      tx.objectStore('seances').put({ id: 'sess-v3', user_id: 'u-banc', titre: 'Séance de la v3',
        debut: '2026-09-01T08:00:00.000Z', fin: '2026-09-01T09:00:00.000Z', statut: 'terminee' });
      tx.objectStore('series').put({ id: 'set-v3', session_id: 'sess-v3', user_id: 'u-banc',
        exercise_slug: 'dc-barre', charge_kg: 111, reps: 5, type_serie: 'travail', rang: 1 });
      // ⚠️ `proprietaire` FAIT PARTIE DU DÉCOR, ET SANS ELLE IL N'Y A PAS DE
      // SCÉNARIO. Le cache appartient à un compte et à un seul : sans cette
      // clé, `garantirProprietaire` le VIDE au démarrage — à juste titre, un
      // cache orphelin pourrait être celui de quelqu'un d'autre. On mesurerait
      // alors cette purge en croyant mesurer la montée. Un vrai téléphone en
      // version 3 la porte ; le décor doit la porter aussi.
      tx.objectStore('meta').put({ cle: 'proprietaire', valeur: { userId: 'u-banc' } });
      tx.objectStore('meta').put({ cle: 'profil', valeur: { id: 'u-banc', intention: 'progresser' } });
      tx.objectStore('meta').put({ cle: 'curseurSeries', valeur: '2026-09-01T00:00:00.000Z' });
      // ⚠️ ET LA MARQUE DE FORME, POUR LA MÊME RAISON QUE `proprietaire`. Sans
      // elle, `armerResynchronisation` conclut — à juste titre — qu'il faut
      // reprendre une passe complète, et remet le curseur à zéro : on
      // mesurerait ce cliquet en croyant mesurer la montée. Un téléphone qui a
      // déjà synchronisé la porte.
      tx.objectStore('meta').put({ cle: 'formeSync', valeur: { version: 4 } });
      tx.objectStore('meta').put({ cle: 'attendu', valeur: { series: 1 } });
      tx.objectStore('attente').put({ cle: 'sessions:sess-v3', seq: 1, table: 'sessions',
        op: 'upsert', id: 'sess-v3', donnees: { id: 'sess-v3' }, version: 1, essais: 0, bloquee: null });
      tx.oncomplete = () => { db.close(); resoudre(true); };
      tx.onerror = () => rejeter(tx.error);
    };
  })).catch((e) => String(e));
  ok('[V] une base de version 4 existe, avec séance, série, profil, zone et file',
    posees === true, String(posees));

  // L'app démarre : `cache.js` ouvre en version 5 et crée `predictions`.
  //
  // ⚠️ RÉSEAU COUPÉ POUR CETTE OUVERTURE, ET C'EST LA MOITIÉ DU SCÉNARIO.
  // Avec le réseau, la synchronisation qui suit la montée REMPLACE légitimement
  // séances et profil par ce que le serveur envoie : le magasin serait vide de
  // `sess-v3` sans qu'aucune montée n'ait rien perdu, et ce banc mesurerait la
  // synchronisation en croyant mesurer la montée. Hors réseau, la montée est
  // seule à agir — et c'est aussi le cas réel : un téléphone mis à jour rouvre
  // l'app là où il est, souvent sans réseau.
  base.reseau = false;
  await aller('/');
  await attendre(1500);
  const apresMontee = await page.evaluate(() => new Promise((resoudre, rejeter) => {
    const req = indexedDB.open('trainhub-v2');
    req.onerror = () => rejeter(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const noms = Array.from(db.objectStoreNames);
      const tx = db.transaction(['seances', 'series', 'meta', 'attente', 'zones'], 'readonly');
      const lu = {};
      const prendre = (magasin, cle, nom) => {
        const r = tx.objectStore(magasin).get(cle);
        r.onsuccess = () => { lu[nom] = r.result || null; };
      };
      prendre('seances', 'sess-v3', 'seance');
      prendre('series', 'set-v3', 'serie');
      prendre('meta', 'profil', 'profil');
      prendre('meta', 'curseurSeries', 'curseur');
      prendre('attente', 'sessions:sess-v3', 'file');
      prendre('zones', 'zone-v4', 'zone');
      tx.oncomplete = () => { resoudre({ version: db.version, magasins: noms, lu: lu }); db.close(); };
      tx.onerror = () => rejeter(tx.error);
    };
  })).catch((e) => ({ erreur: String(e) }));
  ok('[V] la base est montée en version 5, et `predictions` existe',
    apresMontee.version === 5 && apresMontee.magasins.indexOf('predictions') >= 0,
    'version ' + apresMontee.version + ' · ' + JSON.stringify(apresMontee.magasins));
  ok('[V] les huit magasins d’avant sont TOUS encore là',
    ['seances', 'series', 'exercices', 'pesees', 'meta', 'brouillon', 'attente', 'zones']
      .every((m) => apresMontee.magasins.indexOf(m) >= 0),
    JSON.stringify(apresMontee.magasins));
  ok('[V] LA CORRECTION DE ZONE A TRAVERSÉ LA MONTÉE',
    apresMontee.lu.zone && apresMontee.lu.zone.exercise_slug === 'dc-barre' &&
    apresMontee.lu.zone.corrigee_a === '2026-09-02T08:00:00.000Z' &&
    apresMontee.lu.zone.user_id === 'u-banc',
    JSON.stringify(apresMontee.lu.zone));
  ok('[V] LA SÉANCE ET SA SÉRIE ONT TRAVERSÉ LA MONTÉE',
    apresMontee.lu.seance && apresMontee.lu.seance.titre === 'Séance de la v3' &&
    apresMontee.lu.serie && apresMontee.lu.serie.charge_kg === 111,
    JSON.stringify(apresMontee.lu.seance && apresMontee.lu.seance.titre) + ' · ' +
    JSON.stringify(apresMontee.lu.serie && apresMontee.lu.serie.charge_kg));
  // Le curseur est le témoin le plus exigeant : il ne se retélécharge pas et
  // sa perte ferait redescendre 15 Mo de séries à la prochaine ouverture.
  ok('[V] le profil et le curseur de synchronisation aussi',
    apresMontee.lu.profil && apresMontee.lu.profil.valeur.id === 'u-banc' &&
    apresMontee.lu.curseur && apresMontee.lu.curseur.valeur === '2026-09-01T00:00:00.000Z',
    JSON.stringify(apresMontee.lu.profil && apresMontee.lu.profil.valeur));
  // ⚠️ LA FILE EST LE PLUS IMPORTANT DES CINQ. Une séance perdue dans le cache
  // se retélécharge ; une entrée de file perdue est une écriture qui ne montera
  // JAMAIS, et personne ne le saura.
  ok('[V] ET LA FILE D’ATTENTE, qui ne se retélécharge pas',
    apresMontee.lu.file && apresMontee.lu.file.id === 'sess-v3',
    JSON.stringify(apresMontee.lu.file && apresMontee.lu.file.cle));

  // Le décor de la v3 a fait son office : on le retire pour que les comptes des
  // sections suivantes portent sur ce que la séance en cours écrit. Le réseau
  // revient avec lui.
  base.reseau = true;
  await page.evaluate(() => new Promise((resoudre) => {
    const req = indexedDB.open('trainhub-v2');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['seances', 'series', 'attente'], 'readwrite');
      tx.objectStore('seances').delete('sess-v3');
      tx.objectStore('series').delete('set-v3');
      tx.objectStore('attente').delete('sessions:sess-v3');
      tx.oncomplete = () => { db.close(); resoudre(); };
    };
  })).catch(() => {});

  console.log('\n══ 1. DÉMARRER DEPUIS UNE ROUTINE ══');
  await aller('/saisie');
  ok('la bibliothèque montre la routine', /Push/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).slice(0, 60));
  await demarrerRoutine('Push');
  ok('la séance s’ouvre', JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('la structure de la routine est reprise : 2 blocs, 5 lignes',
    (await compter('.bloc-seance')) === 2 && (await compter('.ligne-serie')) === 5,
    (await compter('.bloc-seance')) + ' blocs, ' + (await compter('.ligne-serie')) + ' lignes');
  ok('AUCUNE série n’est créée en base', sets().length === 0, sets().length + ' séries');
  ok('la séance est en base avec statut `en_cours`',
    sessions().length === 1 && sessions()[0].statut === 'en_cours',
    JSON.stringify(base.sessions.map((s) => s.statut)));

  console.log('\n══ 2. SAISIR, VALIDER, CHRONOMÈTRE ══');
  await saisirSerie(0, 100, 5);
  ok('la première série est validée', (await compter('.ok-serie.cochee')) === 1,
    (await compter('.ok-serie.cochee')) + ' validée(s)');
  ok('elle est montée avec `validee_a` et rang ≥ 1',
    sets().length === 1 && !!sets()[0].validee_a && sets()[0].rang >= 1,
    JSON.stringify(sets().map((s) => ({ rang: s.rang, v: !!s.validee_a }))));
  const repos = await page.evaluate(() => {
    const r = document.querySelector('#repos');
    return { visible: r && !r.hidden, texte: (r || {}).textContent || '' };
  });
  ok('le chronomètre part SEUL à la validation', repos.visible, repos.texte.replace(/\s+/g, ' ').slice(0, 40));
  ok('il affiche la cible de la routine sans l’imposer', /cible 3:00/.test(repos.texte), repos.texte.replace(/\s+/g, ' ').slice(0, 40));

  // ⚠️ [50] C'EST UN COMPTE À REBOURS (§7 quatervicies). À l'armement, le grand
  // nombre vaut la CIBLE ENTIÈRE — un chronomètre montant afficherait 0:00 ou
  // 0:01. Les deux lectures se séparent ici, à la seconde près.
  const barreRebours = () => page.evaluate(() => ({
    grand: ((document.querySelector('#repos .repos-g') || {}).textContent || '').trim(),
    largeur: parseInt(((document.querySelector('#repos .piste i') || {}).style || {}).width, 10)
  }));
  const rebours0 = await barreRebours();
  ok('[50] à l’armement, le rebours affiche la cible entière — pas 0:00',
    /^(3:00|2:5[0-9])$/.test(rebours0.grand), 'affiché ' + rebours0.grand);
  ok('[50] …et la piste part PLEINE, pour se vider ensuite',
    rebours0.largeur >= 95, 'piste à ' + rebours0.largeur + '%');

  await attendre(1200);
  await saisirSerie(1, 100, 5);
  ok('la deuxième porte un `repos_s` mesuré, pas déduit',
    sets().length === 2 && sets()[1].repos_s !== null && sets()[1].repos_s >= 1,
    'repos_s = ' + JSON.stringify(sets().map((s) => s.repos_s)));

  console.log('\n══ 2 bis. LA LIGNE VERTE ET LA VIBRATION ══');
  // §2.1 — l'API haptique : on relève ce qui EST, on ne conclut pas d'avance.
  const haptique = await page.evaluate(() => ({
    natif: window.__vibrateNatif, appels: window.__vibrations.slice(), audio: window.__audioNatif
  }));
  ok('`navigator.vibrate` existe dans ce contexte', haptique.natif === true,
    'natif=' + haptique.natif + ' · Web Audio=' + haptique.audio);
  ok('la validation d’une série APPELLE bien la vibration', haptique.appels.length >= 2,
    haptique.appels.length + ' appel(s) : ' + JSON.stringify(haptique.appels));
  // 18 ms — la valeur d'avant ce chantier — est sous le seuil où un moteur à
  // masse excentrée a seulement fini de démarrer : l'appel réussissait sans que
  // rien ne se sente.
  ok('et pour une durée PERCEPTIBLE, pas 18 ms',
    haptique.appels.every((d) => d >= 30), JSON.stringify(haptique.appels));

  // §2.2 — toute la ligne validée change de fond, pas seulement la coche.
  const fonds = await page.evaluate(() => {
    const lire = (el) => getComputedStyle(el).backgroundColor;
    const lignes = Array.from(document.querySelectorAll('.serie'));
    const faite = lignes.filter((l) => l.classList.contains('faite'))[0];
    const brute = lignes.filter((l) => !l.classList.contains('faite'))[0];
    return { faite: faite && lire(faite), brute: brute && lire(brute) };
  });
  const rvb = (c) => (String(c).match(/\d+/g) || []).map(Number);
  ok('le fond de la ligne validée DIFFÈRE de celui d’une ligne non validée',
    fonds.faite !== fonds.brute, fonds.faite + ' vs ' + fonds.brute);
  const [r, v, b] = rvb(fonds.faite);
  ok('et il est VERT — vert de sens, pas l’accent jaune', v > r && v > b,
    'rvb(' + r + ',' + v + ',' + b + ')');
  // L'accent (#F2B705) est jaune : rouge et vert hauts, bleu bas. Un fond qui
  // partirait de là se reconnaîtrait à son bleu écrasé.
  ok('ce n’est pas l’accent : le bleu n’est pas écrasé', b > 20 && v - b < 40,
    'rvb(' + r + ',' + v + ',' + b + ')');

  console.log('\n══ 2 ter. UNE SÉANCE EN COURS N’EST PAS UNE SÉANCE ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : une séance `en_cours` DANS LA SEMAINE
  // AFFICHÉE, avec DEUX SÉRIES DÉJÀ VALIDÉES, et un décor terminé non vide
  // (`PASSEE`, 1 séance / 2 séries) pour que les totaux aient une valeur à
  // conserver. Sans ces trois conditions, filtrer et ne pas filtrer donnent
  // exactement le même écran — c'est ainsi que le défaut a survécu au
  // chantier 22.
  ok('la séance en cours porte bien 2 séries validées, dans la semaine affichée',
    sets().length === 2 && sessions()[0].statut === 'en_cours',
    sets().length + ' série(s) · ' + sessions()[0].statut);

  await aller('/');
  const totaux = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  // ⚠️ DEUX séances de décor depuis le chantier 34 (`PASSEE` et `IMPORTEE`),
  // toutes deux TERMINÉES et dans la semaine affichée. Ce qui est éprouvé ici
  // reste intact : la séance EN COURS, elle, n'y entre pas.
  ok('les totaux de la semaine ne comptent QUE les séances terminées',
    /^2 séances · 8 séries de travail$/.test(totaux), totaux);
  ok('la liste ne montre que les deux cartes du décor', (await compter('.jour .seance')) === 2,
    (await compter('.jour .seance')) + ' carte(s)');
  ok('et c’est la séance terminée, pas celle en cours',
    /Séance de lundi/.test(await texte('#liste-seances')) &&
    !/Push/.test(await texte('#liste-seances')),
    (await texte('#liste-seances')).replace(/\s+/g, ' ').slice(0, 70));

  // Le relevé par muscle : la séance en cours travaille le squat, le décor
  // aussi. S'il comptait les deux, les quadriceps doubleraient.
  const rappel = (await texte('#rappel-zones')).replace(/\s+/g, ' ').trim();
  ok('le relevé par zone ne double pas les jambes', /(^|\D)2(\D|$)/.test(rappel) && !/\b4\b/.test(rappel),
    rappel.slice(0, 70));

  // Et le cache : la séance en cours n'y entre pas non plus. C'est la même
  // ligne de code qui l'assure — `rangerSeances` court avant l'écriture.
  const enCache = await page.evaluate(() => new Promise((res) => {
    const d = indexedDB.open('trainhub-v2');
    d.onsuccess = () => {
      const bd = d.result;
      const q = bd.transaction('seances', 'readonly').objectStore('seances').getAll();
      q.onsuccess = () => res(q.result.map((s) => s.statut));
      q.onerror = () => res(['?']);
    };
    d.onerror = () => res(['?']);
  }));
  ok('le cache local ne contient AUCUNE séance en cours',
    enCache.length > 0 && enCache.every((st) => st === 'terminee'), JSON.stringify(enCache));

  await aller('/saisie');
  ok('et la séance en cours, elle, est toujours reprise intacte',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    (await compter('.ok-serie.cochee')) === 2,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ok-serie.cochee')) + ' validée(s)');

  console.log('\n══ 3. LE TYPE ET L’EFFORT ══');
  // G3 (49-17) — la série 1 est VALIDÉE et son pari OBSERVÉ en base : c'est la
  // configuration qui laissait un pari de travail jugé sur une chauffe.
  const enCoursB = (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
  const serieB = sets().filter((x) => x.session_id === enCoursB && x.rang === 1 && x.type_serie === 'travail')[0];
  const observesB = () => base.predictions.filter((l) => serieB && l.set_observe === serieB.id);
  ok('[B] prémisse : la série 1 est validée, et un pari est observé sur elle en base',
    !!serieB && !!serieB.validee_a && observesB().length >= 1,
    JSON.stringify({ serie: serieB && serieB.id, observes: observesB().length }));
  await toucher(0, '.no-serie');
  await page.click('#feuille-contenu .feuille-menu button:nth-child(2)');   // Échauffement
  await attendre(700);
  await jusqua(async () => observesB().length === 0, 6000);
  ok('[B] DISCRIMINANT — passée en chauffe, elle perd son observation : plus aucun pari observé sur elle en base',
    observesB().length === 0, JSON.stringify(observesB().map((l) => [l.fondement.rang, l.valeur_observee])));
  const fileB = await page.evaluate(() => window.THCache.lireAttente());
  ok('[B] et rien ne reste refusé ni en attente dans la file',
    fileB.length === 0, JSON.stringify(fileB.map((e) => e.cle + (e.bloquee ? ' BLOQUÉE' : ''))));
  // §7 undecies.1 — hors superset, le badge porte `W` : il n'y a pas de lettre
  // d'exercice à porter, et « C » se confondait avec la charge.
  ok('le numéro porte le type : la série devient une chauffe',
    (await lire(0, '.no-serie')) === 'W' &&
    sets().filter((s) => s.type_serie === 'echauffement').length === 1,
    'écran=' + (await lire(0, '.no-serie')) +
    ' base=' + JSON.stringify(sets().map((s) => s.type_serie)));

  await toucher(1, '.eff-serie');
  const feuilleEffort = await texte('#feuille-contenu');
  ok('la feuille pose la question en langage courant', /combien te restait/.test(feuilleEffort),
    feuilleEffort.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#feuille-contenu .grille-rir button:nth-child(3)');   // « 1 »
  await attendre(600);
  ok('le ressenti est enregistré', sets().some((s) => s.ressenti === 'reste_1'),
    JSON.stringify(sets().map((s) => s.ressenti)));

  await toucher(1, '.eff-serie');
  await page.click('#feuille-contenu .bascule button');
  await attendre(300);
  ok('la bascule vers le RPE donne une GRILLE, pas un curseur',
    (await compter('#feuille-contenu .grille-rpe button')) === 8 &&
    (await compter('#feuille-contenu input[type=range]')) === 0,
    (await compter('#feuille-contenu .grille-rpe button')) + ' boutons');
  await page.click('#feuille-contenu .grille-rpe button:nth-child(6)');   // RPE 9
  await attendre(600);
  const ligneEffort = sets().filter((s) => s.rpe !== null && s.rpe !== undefined)[0];
  ok('RPE et ressenti sont EXCLUSIFS : choisir l’un efface l’autre',
    !!ligneEffort && ligneEffort.rpe === 9 && ligneEffort.ressenti === null,
    JSON.stringify(sets().map((s) => ({ rpe: s.rpe, r: s.ressenti }))));

  console.log('\n══ 4. HORS LIGNE, APP TUÉE EN PLEINE SÉANCE ══');
  base.reseau = false;
  await attendre(200);
  await saisirSerie(2, 110, 4);
  const montees = sets().length;
  ok('la saisie continue sans réseau', (await compter('.ok-serie.cochee')) === 3,
    (await compter('.ok-serie.cochee')) + ' validée(s) à l’écran');
  ok('et rien n’est monté — c’est attendu', sets().length === montees, montees + ' en base');
  const etatHL = await texte('#etat-sync');
  ok('l’utilisateur voit ce qui reste à envoyer, sans alarme',
    /à envoyer/.test(etatHL) && !/erreur|échec|perdu/i.test(etatHL), etatHL.trim());

  // ⚠️ L'APP EST TUÉE. La page se ferme : le JS s'arrête, la mémoire part.
  // IndexedDB, lui, reste — c'est tout l'enjeu.
  await page.close();
  page = await ctx.newPage();
  brancher(page);

  // ⚠️ On échantillonne PENDANT la réouverture, pas seulement à la fin. Un écran
  // faux affiché deux secondes ne laisse aucune trace dans une mesure d'état
  // final — c'est exactement ce que la mutation M10 du chantier 21 a montré.
  // Ici, voir la liste des séances à la place de sa séance, même une seconde,
  // c'est croire qu'on l'a perdue.
  await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const vues = [];
  for (let i = 0; i < 14; i++) {
    await attendre(300);
    vues.push((await visible())[0] || '');
  }
  const egares = vues.filter((v) => v === 'vue-liste' || v === 'vue-connexion');
  ok('la séance ne disparaît JAMAIS de l’écran pendant la réouverture',
    egares.length === 0, egares.length ? egares.length + ' rendu(s) égaré(s) : ' +
    Array.from(new Set(egares)).join(', ') : 'jamais');

  ok('à la réouverture, on retombe DANS la séance',
    JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('les trois séries validées sont là, intactes',
    (await compter('.ok-serie.cochee')) === 3, (await compter('.ok-serie.cochee')) + ' validée(s)');
  const valeurs = await page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie'))
    .map((l) => Array.from(l.querySelectorAll('input')).map((i) => i.value).join('×')));
  ok('avec leurs charges et leurs reps',
    valeurs[0] === '100×5' && valeurs[1] === '100×5' && valeurs[2] === '110×4',
    JSON.stringify(valeurs.slice(0, 3)));

  console.log('\n══ 4 bis. LE GLISSEMENT LATÉRAL ══');
  // La famille de geste qui a coûté trois chantiers. La règle qui la rend sûre :
  // la direction se décide UNE FOIS, au premier mouvement qui dépasse le seuil,
  // et ne change plus. On vérifie les DEUX sens : qu'il supprime quand on tire
  // à l'horizontale, et qu'il ne gêne pas le défilement vertical.
  const avantGlisse = await compter('.ligne-serie');
  const boite = await (await ligne(4)).boundingBox();

  // 1. Un geste DIAGONAL à dominante verticale ne doit rien supprimer.
  //    C'est LUI qui discrimine : un geste parfaitement vertical ne bouge pas
  //    l'axe horizontal, donc il ne supprimerait rien même sans verrouillage.
  //    Un pouce qui fait défiler, lui, part de travers — 70 px de côté pour
  //    90 px vers le bas. Sans le verrouillage de direction, la ligne partirait.
  await page.mouse.move(boite.x + boite.width - 40, boite.y + boite.height / 2);
  await page.mouse.down();
  for (let d = 0; d <= 9; d++) {
    await page.mouse.move(boite.x + boite.width - 40 - d * 8, boite.y + boite.height / 2 + d * 10);
    await attendre(30);
  }
  await page.mouse.up();
  await attendre(600);
  ok('un geste diagonal à dominante verticale ne supprime rien',
    (await compter('.ligne-serie')) === avantGlisse,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // 2. Un geste HORIZONTAL supprime.
  const boite2 = await (await ligne(4)).boundingBox();
  await page.mouse.move(boite2.x + boite2.width - 40, boite2.y + boite2.height / 2);
  await page.mouse.down();
  for (let d = 0; d <= 110; d += 14) {
    await page.mouse.move(boite2.x + boite2.width - 40 - d, boite2.y + boite2.height / 2);
    await attendre(30);
  }
  await page.mouse.up();
  await attendre(700);
  ok('un geste horizontal supprime la série', (await compter('.ligne-serie')) === avantGlisse - 1,
    (await compter('.ligne-serie')) + ' ligne(s) après');

  console.log('\n══ 5. LE RETOUR DU RÉSEAU ══');
  // PR 8 — la course, imposée (voir le routeur) : la série de la file arrive
  // en base entre les deux lectures de la synchronisation.
  base.courseSync = { lectures: 0, ordre: [], envoye: false };
  base.courseSync.premiere = new Promise((r) => { base.courseSync.libere = r; });
  base.reseau = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  // La course imposée retarde la seconde lecture : on attend qu'elle ait eu lieu.
  await attendre(2500);
  for (let k = 0; k < 60 && !(base.courseSync.envoye && base.courseSync.lectures === 2); k++) await pause(100);
  await attendre(2500);
  ok('prémisse (PR 8) — la course a eu lieu : la série est arrivée en base entre les deux lectures de la synchronisation',
    base.courseSync.envoye && base.courseSync.lectures === 2 && base.courseSync.ordre.length === 2,
    JSON.stringify(base.courseSync.ordre) + ' · envoi ' + base.courseSync.envoye);
  ok('la séance monte', sets().length === 3, sets().length + ' séries en base');
  ok('sans doublon de séance', sessions().length === 1, sessions().length + ' séance(s)');
  const ids = sets().map((s) => s.id);
  ok('sans doublon de série', new Set(ids).size === ids.length, ids.length + ' ids, ' + new Set(ids).size + ' distincts');
  const etatOK = await texte('#etat-sync');
  // ⚠️ « À jour » et pas seulement « plus rien à envoyer ». C'est ici que se
  // voit la cohérence entre la purge des séries orphelines et le compte du
  // serveur : si la liste des séances est filtrée sur `statut`, les séries de
  // la séance EN COURS sont purgées du cache alors que le serveur les compte
  // toujours, et l'état bascule en « N séries manquantes ». Un simple
  // « plus rien à envoyer » laissait passer exactement ce défaut.
  ok('et l’état dit « À jour » — le cache et le compte du serveur concordent',
    /À jour/.test(etatOK), etatOK.trim() || '(vide)');

  console.log('\n══ 5 bis. RETIRER UNE SÉRIE DU MILIEU, DÉJÀ MONTÉE ══');
  // ⚠️ Configuration discriminante de l'envoi en LOT. Retirer la série du milieu
  // décale les suivantes vers le bas : la 3ᵉ prend le rang de la 2ᵉ. Envoyées
  // une par une, chacune dans sa transaction, elles heurteraient
  // `sets_rang_unique` — qui n'est différée qu'À L'INTÉRIEUR d'une transaction.
  // Retirer la DERNIÈRE ne prouverait rien : aucun rang ne bouge.
  const rangsAvant = base.sets.filter((x) => x.session_id === sessions()[0].id)
    .map((x) => x.rang).sort((a, b) => a - b);
  await toucher(1, '.no-serie');
  await page.click('#feuille-contenu .feuille-menu button.danger');   // Supprimer la série
  await attendre(2000);
  const apresRetrait = base.sets.filter((x) => x.session_id === sessions()[0].id)
    .sort((a, b) => a.rang - b.rang);
  ok('la série du milieu part, et les rangs suivants se décalent sans collision',
    apresRetrait.length === rangsAvant.length - 1 &&
    new Set(apresRetrait.map((x) => x.rang)).size === apresRetrait.length,
    'avant ' + JSON.stringify(rangsAvant) + ' → après ' + JSON.stringify(apresRetrait.map((x) => x.rang)));
  const etatApres = await texte('#etat-sync');
  ok('et rien ne reste coincé dans la file', !/à envoyer|refusé/.test(etatApres),
    etatApres.trim() || '(vide)');

  console.log('\n══ 5 ter. LE CHRONOMÈTRE — RÉGLAGE, SON, VIBRATION, SOURDINE ══');
  // La barre de repos se redessine chaque seconde : on clique DANS la page,
  // pas via un handle, qui serait périmé avant d'arriver.
  const cliqueRepos = async (i) => {
    await page.evaluate((k) => {
      const b = document.querySelectorAll('#repos .repos-b')[k];
      if (b) b.click();
    }, i);
    await attendre(260);
  };
  const MOINS = 0, PLUS = 1, SON = 2;
  // « 2:00 » → 120. Le grand nombre est une horloge ; le comparer comme texte ne
  // dirait pas s'il a monté ou descendu.
  const enSecondes51 = (t) => {
    const m = /^(\d+):(\d\d)$/.exec(String(t).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const compteurs = () => page.evaluate(() => ({
    bips: window.__bips, vibrations: window.__vibrations.length
  }));

  // ══ §7 novodecies — UN REPOS DÉSACTIVÉ N'ARME AUCUN CHRONOMÈTRE ═════════
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : le deuxième bloc ne prescrit
  // PAS de repos (`repos_cible_s` null), le premier en prescrit 180. Si tous
  // les repos étaient désactivés, « lit la valeur » et « n'arme jamais »
  // rendraient le même écran — et une implémentation qui n'arme plus rien du
  // tout passerait pour correcte.
  //
  // ⚠️ CE BANC BÉNISSAIT LE DÉFAUT. Jusqu'au chantier 45 il validait une série
  // sur l'exercice SANS repos et vérifiait que « la cible s'affiche absente » —
  // c'est-à-dire que la barre était LÀ, à compter sans but. Il travaillait
  // exprès sur cet exercice, « le cas le plus exigeant ». C'était le cas
  // INTERDIT, et personne ne l'a vu parce que la mesure regardait le texte de
  // la barre au lieu de son existence.
  const barreVisible = () => page.evaluate(() => {
    const n = document.getElementById('repos');
    return !!n && !n.hidden;
  });
  // ⚠️ DÉFINIS ICI, PAS PLUS BAS. Les mêmes accesseurs existent à la section
  // 7 septies, mais `const` ne se hisse pas : les appeler d'ici serait une
  // erreur de zone morte. Trois lignes recopiées valent mieux qu'un
  // déplacement qui décalerait tout le reste du banc.
  const toucherBloc = async (iBloc, sel) => {
    await page.evaluate(([k, x]) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector(x).click();
    }, [iBloc, sel]);
    await attendre(400);
  };
  const lireDansBloc = (iBloc, sel) => page.evaluate(([k, x]) =>
    (document.querySelectorAll('.bloc-seance')[k].querySelector(x) || {}).textContent || '',
    [iBloc, sel]);
  const lignesDuBloc = (iBloc) => page.evaluate((k) =>
    document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie').length, iBloc);
  const molette = async (secondes) => {
    await page.evaluate((v) => {
      const p = document.querySelector('#feuille-contenu .molette .piste');
      const opts = Array.from(p.querySelectorAll('.opt'));
      p.scrollTop = opts.findIndex((o) => Number(o.dataset.v) === v) * 48;
      p.dispatchEvent(new Event('scroll'));
    }, secondes);
    await attendre(250);
    await page.click('#feuille-contenu .feuille-pied .pri');
    await attendre(700);
  };

  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniere = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniere, 80, 10);
  ok('[45] repos DÉSACTIVÉ : valider n’arme AUCUN chronomètre',
    (await barreVisible()) === false,
    'barre visible = ' + (await barreVisible()) +
    ' · « ' + (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 40) + ' »');

  // L'autre moitié, sur le bloc d'à côté : un repos prescrit arme, lui.
  // ⚠️ SUR UNE LIGNE NEUVE, jamais sur la ligne 0. À ce stade de la séance les
  // premières lignes sont DÉJÀ validées : `saisirSerie` retape la coche, donc
  // les DÉvaliderait — et une barre absente passerait alors pour la preuve que
  // rien n'arme, alors qu'on vient juste de tout défaire.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  const neuveA = (await lignesDuBloc(0)) - 1;   // le bloc 0 ouvre la liste : index global = index local
  await saisirSerie(neuveA, 100, 5);
  ok('[45] …et l’exercice d’à côté, lui, arme bien sur sa cible',
    (await barreVisible()) === true && /cible 3:00/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  // ⚠️ ET LE CHEMIN POUR EN POSER UN RESTE OUVERT : la molette, sous le nom de
  // l'exercice (§7 sexdecies). Ce n'est donc pas une capacité perdue — c'est la
  // barre qui cesse d'être la porte d'entrée d'un repos qui n'existe pas.
  await toucherBloc(1, '.repos-cible');
  await molette(15);
  ok('[45] la molette pose un repos sur l’exercice qui n’en avait pas',
    /repos 0:15/.test(await lireDansBloc(1, '.repos-cible')),
    await lireDansBloc(1, '.repos-cible'));
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniereB = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniereB, 80, 10);
  ok('[45] et LÀ, valider arme — sur la cible qu’on vient de poser',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  // ⚠️ ASSERTION RETOURNÉE DEUX FOIS — 47 PUIS 49 — ET VOICI POURQUOI.
  //
  //   · avant le 47, elle exigeait « cible — » après les −15 : l'état que le
  //     §7 novodecies interdit, une cible ni armée ni désactivée sur laquelle
  //     `reposFige` rend faux pour toute seconde — un chronomètre qui compte
  //     sans jamais se figer. Le banc ne constatait pas le défaut, il le
  //     VERROUILLAIT, deux chantiers durant ;
  //   · au 47, elle exigeait 0:15 : le −15 REFUSAIT de descendre. Bonne règle,
  //     mauvais objet — elle protège le repos PRESCRIT, pas le décompte ;
  //   · au 49 (§7 tervicies), à zéro le repos est FINI : la barre S'EN VA.
  //
  // C'est ce que fait n'importe quel minuteur, et c'est ce que le §7 novodecies.2
  // disait déjà de ces boutons : « ajuster une cible pendant qu'elle court ».
  // Une cible qui court peut arriver à son terme.
  //
  // ⚠️ LA MESURE EST L'EXISTENCE DE LA BARRE, pas son texte. C'est la leçon du
  // §7 novodecies, répétée ici : lire « cible — », c'était décrire un état
  // qui n'aurait jamais dû s'afficher. Les bornes de l'arithmétique (50 s, la
  // cible non multiple de 15 du §2 quater) se prouvent en unitaire, où elles
  // coûtent une milliseconde — ici on prouve l'OBSERVABLE.
  await cliqueRepos(MOINS);
  ok('[49] −15 depuis 0:15 → le repos est FINI, et la barre s’en va',
    (await barreVisible()) === false,
    'barre ' + ((await barreVisible()) ? 'encore là' : 'partie'));

  // ⚠️ ET LE REPOS PRESCRIT N'A PAS BOUGÉ (§5.4 du prompt). C'est l'autre moitié
  // du §7 tervicies : deux objets distincts portent le même nom, et raccourcir
  // le décompte ne touche pas la consigne. Si le réglage de la barre écrivait
  // sur l'exercice, la molette afficherait « repos — » ici.
  ok('[49] …et le repos PRESCRIT de l’exercice est intact',
    /repos 0:15/.test(await lireDansBloc(1, '.repos-cible')),
    await lireDansBloc(1, '.repos-cible'));

  // On réarme pour la suite : valider une série repart de la cible prescrite,
  // qui vaut toujours 15 s. Sans ça, tout ce qui suit mesurerait une barre
  // absente — et l'échéance, le dépassement et la sourdine passeraient à vide.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const rearmee = (await compter('.ligne-serie')) - 1;
  await saisirSerie(rearmee, 80, 10);
  ok('[49] valider une série réarme sur la cible prescrite, inchangée',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  const avantEcheance = await compteurs();
  await attendre(17000);
  const aEcheance = await compteurs();
  ok('à l’échéance : UN son', aEcheance.bips - avantEcheance.bips === 1,
    (aEcheance.bips - avantEcheance.bips) + ' son(s)');
  ok('et UNE vibration', aEcheance.vibrations - avantEcheance.vibrations === 1,
    (aEcheance.vibrations - avantEcheance.vibrations) + ' vibration(s)');

  // ⚠️ LE DÉPASSEMENT. Le chronomètre informe, il ne commande pas : rien ne se
  // répète, aucune alarme ne monte. C'est ici que se verrait un `setInterval`
  // qui resonne, et nulle part ailleurs.
  await attendre(10000);
  const apresDepassement = await compteurs();
  ok('au dépassement : plus RIEN, ni son ni vibration',
    apresDepassement.bips === aEcheance.bips &&
    apresDepassement.vibrations === aEcheance.vibrations,
    'bips ' + apresDepassement.bips + ' · vibrations ' + apresDepassement.vibrations);
  // ⚠️ ASSERTION RETOURNÉE TROIS FOIS, ET VOICI LA DERNIÈRE MARCHE.
  //   · au 26, elle exigeait que le chronomètre CONTINUE de compter au-delà de
  //     la cible — corrigé : « il s'arrête à l'échéance » ;
  //   · au 50, elle lisait le grand nombre plutôt que tout le bandeau, parce que
  //     l'étiquette « cible 0:15 » y reste affichée et faisait passer un
  //     `/0:15/` quoi qu'il arrive ;
  //   · au 51, il n'y a PLUS de grand nombre à lire : à zéro la barre s'en va.
  //
  // ⚠️ C'EST LE DÉFAUT DU CHANTIER 51, ET C'EST ICI QU'IL SE VOYAIT : « −15 »
  // jusqu'à zéro faisait disparaître la barre (assertion [49] plus haut), mais le
  // décompte qui y arrivait TOUT SEUL la laissait figée. Deux chemins, un seul
  // éteignait. On mesure donc l'EXISTENCE de la barre — pas son contenu, qui
  // n'existe plus.
  ok('[51] arrivé à zéro TOUT SEUL, le décompte éteint la barre',
    (await barreVisible()) === false,
    'barre ' + ((await barreVisible()) ? 'encore là' : 'partie'));

  // On réarme pour la suite — la barre vient de s'en aller, et tout ce qui suit
  // lui parle.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const rearmee51 = (await compter('.ligne-serie')) - 1;
  await saisirSerie(rearmee51, 80, 10);
  ok('[51] …et valider une série en réarme un neuf, entier',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 40));

  // ══ [50] LA MOLETTE RETARGE LE DÉCOMPTE EN COURS (§7 quatervicies.2) ════
  //
  // Constaté sur device : régler le repos d'un exercice pendant qu'on se repose
  // ne changeait RIEN à la barre. Le chronomètre avait copié sa cible à
  // l'armement, et plus personne ne la relisait.
  //
  // ⚠️ L'ÉTAT ICI, ET IL EST LA CONFIGURATION DISCRIMINANTE : le décompte en
  // cours vient d'être armé par le bloc 1, sur 0:15. Le bloc 0 porte 3:00 et n'a
  // rien armé. Avec un seul exercice, « il retarge le bon » et « il retarge
  // n'importe lequel » rendraient le même écran.
  //
  // ⚠️ ET ON MESURE LA CIBLE, PAS LE GRAND NOMBRE : le décompte tourne pendant
  // qu'on manipule la molette, donc le grand nombre bouge de toute façon. Ce qui
  // dit si le retarge a eu lieu, c'est l'étiquette.
  await toucherBloc(0, '.repos-cible');
  await molette(120);
  ok('[50] régler l’exercice d’À CÔTÉ ne touche pas le repos en cours',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')) &&
    /repos 2:00/.test(await lireDansBloc(0, '.repos-cible')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 30) +
    ' · bloc 0 : ' + (await lireDansBloc(0, '.repos-cible')).trim());

  // Et LE fil : le même geste, sur l'exercice QUI A ARMÉ.
  await toucherBloc(1, '.repos-cible');
  await molette(120);
  const retarge = (await texte('#repos .repos-g')).trim();
  ok('[50] régler l’exercice QUI A ARMÉ fait bouger le décompte',
    (await barreVisible()) === true && /cible 2:00/.test(await texte('#repos')) &&
    enSecondes51(retarge) > 60,
    'grand nombre ' + retarge + ' · ' +
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 30));

  // ⚠️ ET RAMENÉE DERRIÈRE L'ÉCOULÉ, ELLE ÉTEINT (ch. 51). C'est la même règle
  // que partout : il ne reste rien à décompter, donc il n'y a rien à montrer. Au
  // chantier 50 elle retombait à 0:00 et restait à l'écran.
  //
  // Les six secondes d'attente sont la CONFIGURATION : la plus petite valeur de
  // la molette vaut 5 s, il faut donc que l'écoulé la dépasse pour que le cas
  // soit réel. Sans elles, on testerait un repos qu'on vient de rallonger.
  await attendre(6000);
  await toucherBloc(1, '.repos-cible');
  await molette(5);
  ok('[51] …et ramenée derrière l’écoulé, la molette éteint la barre',
    (await barreVisible()) === false && /repos 0:05/.test(await lireDansBloc(1, '.repos-cible')),
    'barre ' + ((await barreVisible()) ? 'encore là' : 'partie') +
    ' · ' + (await lireDansBloc(1, '.repos-cible')).trim());

  // On remet 0:15 sur l'exercice — §5 quater réarme dessus et attend la sonnerie
  // à 17 s — puis on réarme, la barre venant de s'éteindre.
  await toucherBloc(1, '.repos-cible');
  await molette(15);
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const rearmee51b = (await compter('.ligne-serie')) - 1;
  await saisirSerie(rearmee51b, 80, 10);

  console.log('\n══ 5 quater. LA SOURDINE SE RETIENT D’UNE SÉANCE À L’AUTRE ══');
  await cliqueRepos(SON);
  ok('la sourdine s’affiche coupée', /Son ✕/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));

  // ⚠️ FERMETURE COMPLÈTE DE L'APP. Un état gardé en mémoire passerait un
  // simple changement d'onglet ; il ne passe pas ceci.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('on retombe dans la séance', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniere2 = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniere2, 80, 8);
  ok('la sourdine est TOUJOURS coupée après fermeture complète',
    /Son ✕/.test(await texte('#repos')), (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));

  // ⚠️ PAS DE « +15 » ICI. Depuis le chantier 45 cet exercice porte un repos de
  // 0:15 — posé à la molette plus haut — et la validation arme donc déjà sur
  // 0:15. L'ajouter porterait la cible à 0:30, que les 17 s d'attente
  // n'atteindraient jamais : le banc conclurait « pas de vibration » sur un
  // chronomètre qui n'a simplement pas fini. Avant le chantier 45, la barre
  // s'ouvrait ici SANS cible, et le « +15 » était le seul moyen d'en poser une.
  const avantMuet = await compteurs();
  await attendre(17000);
  const apresMuet = await compteurs();
  // La sourdine coupe le SON, pas la vibration : on met son téléphone en
  // silencieux dans une salle, on ne renonce pas pour autant à savoir que le
  // repos est fini.
  ok('en sourdine : aucun son', apresMuet.bips - avantMuet.bips === 0,
    (apresMuet.bips - avantMuet.bips) + ' son(s)');
  ok('mais la vibration reste', apresMuet.vibrations - avantMuet.vibrations === 1,
    (apresMuet.vibrations - avantMuet.vibrations) + ' vibration(s)');
  await cliqueRepos(SON);   // on rétablit, pour ne pas laisser l'état au suivant

  console.log('\n══ 6. TERMINER ══');
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(500);
  await page.click('#feuille-contenu .principal');
  await attendre(2200);
  ok('le statut bascule en `terminee`',
    sessions()[0].statut === 'terminee' && !!sessions()[0].fin, sessions()[0].statut);
  ok('on revient à la bibliothèque', JSON.stringify(await visible()) === '["vue-saisie"]',
    JSON.stringify(await visible()));

  // ⚠️ L'AUTRE MOITIÉ DU TEST. Prouver qu'une séance en cours est absente ne
  // vaut que si la même, terminée, revient. Sinon le filtre pourrait tout jeter
  // et le banc applaudirait.
  await aller('/');
  const totauxFin = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  ok('terminée, elle entre dans les totaux de la semaine',
    /^3 séances · \d+ séries de travail$/.test(totauxFin), totauxFin);
  ok('et elle prend sa carte dans la liste', (await compter('.jour .seance')) === 3,
    (await compter('.jour .seance')) + ' carte(s)');

  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('et aucune séance fantôme ne se rouvre',
    JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));

  console.log('\n══ 7. ABANDONNER ══');
  await demarrerRoutine('Push');
  await saisirSerie(0, 90, 6);
  await attendre(800);
  const idAbandon = base.sessions.filter((s) => s.statut === 'en_cours').map((s) => s.id)[0];
  ok('une deuxième séance est bien ouverte', !!idAbandon, idAbandon || '(aucune)');
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(500);
  await page.click('#feuille-contenu .danger');
  await attendre(2200);
  ok('la séance abandonnée est SUPPRIMÉE',
    !base.sessions.some((s) => s.id === idAbandon), sessions().length + ' séance(s) restante(s)');
  ok('ses séries partent avec elle',
    !base.sets.some((s) => s.session_id === idAbandon), sets().length + ' série(s)');
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('et aucune fantôme au lancement suivant',
    JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));

  console.log('\n══ 7 bis. LES QUATRE MESURES ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : les QUATRE mesures
  // dans la MÊME séance. Sur une séance d'une seule mesure, « la grille
  // s'adapte » et « la grille est fixe » rendent le même écran — c'est
  // exactement pourquoi le défaut a survécu à trois chantiers de saisie. Les
  // assertions comparent donc les lignes ENTRE ELLES.
  await aller('/saisie');
  await demarrerRoutine('Les quatre mesures');
  // L'identifiant de CETTE séance : `sessions()[0]` désigne la plus ancienne,
  // qui est la séance Push déjà terminée plus haut.
  const idMesures = (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
  ok('la séance des quatre mesures s’ouvre',
    JSON.stringify(await visible()) === '["vue-seance"]' && (await compter('.bloc-seance')) === 4,
    JSON.stringify(await visible()) + ' · ' + (await compter('.bloc-seance')) + ' bloc(s)');

  const gabarits = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) => ({
      nom: b.querySelector('.exo-seance').textContent,
      type: b.querySelector('.type-mesure') ? b.querySelector('.type-mesure').textContent : null,
      grille: Array.from(b.querySelector('.serie').classList).filter((c) => c.indexOf('g-') === 0)[0],
      colonnes: getComputedStyle(b.querySelector('.serie')).gridTemplateColumns,
      entetes: Array.from(b.querySelectorAll('.cols-seance span')).map((x) => x.textContent).filter(Boolean),
      champs: Array.from(b.querySelectorAll('.serie .ch-serie, .serie .rp-serie')).map((c) =>
        (c.querySelector('u') ? c.querySelector('u').textContent : '')),
      effort: b.querySelectorAll('.serie .eff-serie').length
    })));

  const g4 = await gabarits();
  ok('quatre grilles DIFFÉRENTES, une par mesure',
    JSON.stringify(g4.map((x) => x.grille)) ===
      '["g-charge_reps","g-reps","g-temps","g-distance_temps"]',
    JSON.stringify(g4.map((x) => x.grille)));
  ok('et elles ne rendent pas les mêmes colonnes à l’écran',
    new Set(g4.map((x) => x.colonnes)).size === 4,
    JSON.stringify(g4.map((x) => x.colonnes)));
  ok('les en-têtes suivent la mesure',
    JSON.stringify(g4.map((x) => x.entetes)) ===
      JSON.stringify([['PRÉC.', 'KG', 'REPS', 'EFFORT'], ['PRÉC.', 'REPS', 'EFFORT'],
                      ['PRÉC.', 'DURÉE'], ['PRÉC.', 'DURÉE', 'DISTANCE']]),
    JSON.stringify(g4.map((x) => x.entetes)));
  // Depuis le chantier 25, la DURÉE ne porte plus d'unité écrite : c'est la
  // forme `HH:MM:SS` qui la dit. Seuls les kilos et les kilomètres en gardent.
  ok('chaque champ porte son unité', JSON.stringify(g4.map((x) => x.champs)) ===
    JSON.stringify([['kg', ''], [''], [''], ['', 'km']]),
    JSON.stringify(g4.map((x) => x.champs)));
  ok('le type de mesure est rappelé sous le nom',
    JSON.stringify(g4.map((x) => x.type)) ===
      '["CHARGE × REPS","REPS SEULES","DURÉE","DISTANCE ET DURÉE"]',
    JSON.stringify(g4.map((x) => x.type)));

  // §3 — la colonne d'effort n'existe que là où il y a des répétitions.
  ok('aucune colonne d’effort sur `temps` ni sur `distance_temps`',
    JSON.stringify(g4.map((x) => x.effort)) === '[1,1,0,0]',
    JSON.stringify(g4.map((x) => x.effort)));

  // ⚠️ Et la LARGEUR, qui est tout l'enjeu : chaque gabarit doit être plus
  // confortable que le précédent, à 360 px. Le champ principal est en `1fr` —
  // on mesure ce que le navigateur lui donne VRAIMENT.
  const largeurs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) =>
      Math.round(b.querySelector('.serie .ch-serie').getBoundingClientRect().width)));
  ok('le champ principal gagne en largeur à chaque colonne retirée',
    largeurs[0] < largeurs[1] && largeurs[1] < largeurs[2] && largeurs[0] >= 70,
    'kg=' + largeurs[0] + ' reps=' + largeurs[1] + ' durée=' + largeurs[2] +
    ' durée(sortie)=' + largeurs[3] + ' px');

  console.log('\n══ 7 ter. SAISIR DANS LES QUATRE MESURES ══');
  // ⚠️ UN CHAMP DE DURÉE NE SE REMPLIT PAS, IL SE TAPE.
  //
  // Depuis le chantier 25 la durée est un pavé de chronométrage : il n'écoute
  // QUE `beforeinput`, chiffre par chiffre. `fill()` de Playwright pose la
  // valeur d'un bloc et n'émet pas ces événements — il ne saisirait rien, et
  // le banc verrait un champ vide sans savoir pourquoi. On tape pour de vrai.
  const estChrono = (bloc, i) => bloc.$$eval('.serie .ch-serie, .serie .rp-serie',
    (envs, k) => envs[k] ? envs[k].classList.contains('chrono') : false, i);

  const saisirChamps = async (iBloc, valeurs) => {
    const bloc = (await page.$$('.bloc-seance'))[iBloc];
    const champs = await bloc.$$('.serie input');
    for (let i = 0; i < valeurs.length; i++) {
      if (await estChrono(bloc, i)) {
        await champs[i].click();
        await champs[i].type(String(valeurs[i]), { delay: 30 });
      } else {
        await champs[i].fill(String(valeurs[i]));
      }
    }
    await bloc.$eval('.serie .ok-serie', (b) => b.click());
    await attendre(500);
  };
  // ⚠️ 6 reps là où la routine en VISE 8 : c'est ce qui sépare « le fantôme
  // complète un champ vide » de « le fantôme écrase ce qu'on a tapé ». Saisir
  // 8 ne prouverait rien, les deux comportements donneraient 8.
  await saisirChamps(0, [80, 6]);
  await saisirChamps(1, [12]);
  // La planche : `5` `0` -> 00:50. Deux appuis, pas « 50 s ».
  await saisirChamps(2, ['50']);
  // ⚠️ CONFIGURATION DISCRIMINANTE : 2 h 10 en CINQ appuis. Sous une heure, un
  // pavé à deux groupes et un pavé à trois rendent la même chose.
  await saisirChamps(3, ['21000', '8,4']);
  await jusqua(() => base.sets.filter((x) => x.session_id === idMesures).length === 4, 8000);

  const montees4 = base.sets.filter((x) => x.session_id === idMesures);
  const parExo = {};
  montees4.forEach((x) => { parExo[x.exercise_slug] = x; });
  ok('les quatre séries sont montées', montees4.length === 4, montees4.length + ' série(s)');
  ok('le développé porte charge ET reps, rien d’autre — et la valeur TAPÉE, pas la visée',
    parExo['dc-barre'] && parExo['dc-barre'].charge_kg === 80 && parExo['dc-barre'].reps === 6 &&
    parExo['dc-barre'].duree_s === null && parExo['dc-barre'].distance_m === null,
    JSON.stringify(parExo['dc-barre'] && { c: parExo['dc-barre'].charge_kg, r: parExo['dc-barre'].reps, d: parExo['dc-barre'].duree_s }));
  ok('les tractions portent des reps et AUCUNE charge',
    parExo.tractions && parExo.tractions.reps === 12 && parExo.tractions.charge_kg === null &&
    parExo.tractions.duree_s === null,
    JSON.stringify(parExo.tractions && { c: parExo.tractions.charge_kg, r: parExo.tractions.reps }));
  ok('la planche porte une DURÉE, pas un poids',
    parExo.planche && parExo.planche.duree_s === 50 && parExo.planche.charge_kg === null &&
    parExo.planche.reps === null,
    JSON.stringify(parExo.planche && { d: parExo.planche.duree_s, c: parExo.planche.charge_kg, r: parExo.planche.reps }));
  // Saisie en minutes et en kilomètres, base en secondes et en mètres.
  ok('la marche porte durée ET distance, converties en secondes et en mètres',
    parExo.marche && parExo.marche.duree_s === 7800 && parExo.marche.distance_m === 8400,
    JSON.stringify(parExo.marche && { d: parExo.marche.duree_s, m: parExo.marche.distance_m }));
  ok('et RIEN n’est écrit dans `rpe` ni dans `ressenti` sur les deux mesures sans effort',
    [parExo.planche, parExo.marche].every((x) => x && (x.rpe === null || x.rpe === undefined) &&
      (x.ressenti === null || x.ressenti === undefined)),
    JSON.stringify([parExo.planche, parExo.marche].map((x) => x && { rpe: x.rpe, r: x.ressenti })));

  // L'effort reste accessible là où il a un sens, et l'affichage rend la forme
  // saisie — pas une traduction.
  // Les handles se périment au moindre re-rendu : on adresse dans la page.
  const effortTractions = () => page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[1].querySelector('.serie .eff-serie').textContent);
  await page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[1].querySelector('.serie .eff-serie').click());
  await attendre(600);
  // La bascule RPE/ressenti se RETIENT (§3 bis.2) : le §3 l'a laissée sur RPE.
  // On revient au ressenti, sinon la feuille rend l'autre grille.
  if ((await compter('#feuille-contenu .grille-rpe')) > 0) {
    await page.click('#feuille-contenu .bascule button');
    await attendre(400);
  }
  await page.click('#feuille-contenu .grille-rir button:nth-child(3)');
  await attendre(1600);
  const tractionsEnBase = base.sets.filter((x) => x.exercise_slug === 'tractions' &&
    x.session_id === idMesures)[0];
  ok('l’effort reste saisissable sur `reps`, et s’affiche en reps restantes',
    (await effortTractions()) === '−1' && tractionsEnBase &&
    tractionsEnBase.ressenti === 'reste_1',
    (await effortTractions()) + ' · base=' + JSON.stringify(tractionsEnBase && tractionsEnBase.ressenti));

  console.log('\n══ 7 quinquies. LE PAVÉ DE CHRONOMÉTRAGE ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : une durée qui DÉPASSE UNE HEURE. Sous une
  // heure, un pavé à deux groupes et un pavé à trois rendent le même écran —
  // et toutes les durées d'essai évidentes (planche, gainage) sont sous la
  // minute. La marche ci-dessus a été saisie `2·1·0·0·0`.
  const champDuree = async () => page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    return { valeur: i.value, tampon: i.dataset.chiffres, mode: i.inputMode };
  });
  const frapper = async (suite) => {
    const i = (await page.$$('.bloc-seance'))[3];
    const champ = (await i.$$('.serie input'))[0];
    await champ.click();
    await champ.type(String(suite), { delay: 30 });
    await attendre(250);
  };

  let d = await champDuree();
  ok('la durée reste affichée en horloge après validation', d.valeur === '02:10:00',
    JSON.stringify(d));
  ok('et le champ repart du tampon canonique, pas d’une chaîne à reformer',
    d.tampon === '21000' && d.mode === 'numeric', JSON.stringify(d));

  // Effacer : le geste inverse exact, par la droite.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input').focus();
  });
  await page.keyboard.press('Backspace');
  await attendre(250);
  d = await champDuree();
  // « 21000 » moins son dernier chiffre = « 2100 » = 21 min 00 s. Les heures
  // disparaissent DÈS ce premier effacement : c'est le décalage, pas un
  // décompte — le chiffre des heures redevient celui des minutes.
  ok('effacer retire le dernier chiffre et l’affichage se resserre',
    d.valeur === '21:00' && d.tampon === '2100', JSON.stringify(d));

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await attendre(250);
  d = await champDuree();
  ok('les heures disparaissent avec leur chiffre', d.valeur === '00:21' && d.tampon === '21',
    JSON.stringify(d));

  // Rien qui ne soit un chiffre n'entre — virgule, lettre, collage.
  await page.keyboard.type(',a');
  await page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    i.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertFromPaste', data: '999', cancelable: true, bubbles: true }));
  });
  await attendre(250);
  d = await champDuree();
  ok('ni virgule, ni lettre, ni collage', d.valeur === '00:21', JSON.stringify(d));

  // La borne : cinq chiffres, et 9:59:59 — rien qu'on ne sache reprendre.
  await frapper('999999');
  d = await champDuree();
  ok('le pavé est borné, et ce qu’il produit reste une horloge',
    d.tampon.length <= 5 && /^\d\d:\d\d(:\d\d)?$/.test(d.valeur) &&
    Number(d.valeur.split(':').slice(-1)[0]) < 60, JSON.stringify(d));

  // ⚠️ UNE VALEUR DIFFÉRENTE DE CELLE DÉJÀ EN BASE. Retaper `21000` et
  // revérifier 7 800 serait satisfait aussi bien par « la valeur retapée est
  // remontée » que par « rien n'a bougé » : l'assertion ne pourrait pas
  // échouer. On retape donc 2 h 13, qui n'a jamais été écrit.
  await page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    i.focus();
  });
  for (let k = 0; k < 6; k++) await page.keyboard.press('Backspace');
  await frapper('21300');
  const remontee = await jusqua(async () => {
    const m = base.sets.filter((x) => x.session_id === idMesures && x.exercise_slug === 'marche')[0];
    return m && m.duree_s === 7980;
  }, 8000);
  ok('une valeur RETAPÉE après validation remonte bien en base', remontee,
    'duree_s = ' + JSON.stringify((base.sets.filter((x) => x.session_id === idMesures &&
      x.exercise_slug === 'marche')[0] || {}).duree_s) + ' (attendu 7980)');

  // Et on la remet à sa valeur d'origine pour la carte de séance qui suit.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input').focus();
  });
  for (let k = 0; k < 6; k++) await page.keyboard.press('Backspace');
  await frapper('21000');
  await jusqua(async () => {
    const m = base.sets.filter((x) => x.session_id === idMesures && x.exercise_slug === 'marche')[0];
    return m && m.duree_s === 7800;
  }, 8000);

  console.log('\n══ 7 sexies. RIEN D’INTERACTIF SOUS LA BARRE DE REPOS ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : barre de repos OUVERTE **et** défilement
  // au MAXIMUM. La barre est `position: fixed` : elle n'ajoute aucune course de
  // défilement, donc le contenu qu'elle recouvre n'est récupérable que si la
  // réserve du bas en tient compte. Tester sans faire défiler ne montre rien.
  //
  // ⚠️ ET IL FAUT L'ARMER EXPRÈS (chantier 45). Cette séance-là finit sur
  // `marche`, qui ne prescrit AUCUN repos : depuis que le chronomètre ne s'arme
  // plus sans cible, la barre est fermée en arrivant ici et il n'y aurait plus
  // rien à mesurer. On valide donc une série neuve sur le développé, seul
  // exercice des quatre mesures à porter un repos (120 s). Avant le chantier
  // 45, la barre traînait ouverte « cible — » et le banc s'en contentait.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  const neuveMesures = await page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.ligne-serie').length - 1);
  await saisirSerie(neuveMesures, 80, 6);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await attendre(600);

  const jetons = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { onglets: s.getPropertyValue('--h-onglets').trim(),
             repos: s.getPropertyValue('--h-repos').trim() };
  });
  ok('les deux hauteurs sont MESURÉES, pas devinées',
    /^\d+px$/.test(jetons.onglets) && /^\d+px$/.test(jetons.repos) &&
    parseInt(jetons.repos, 10) > 0, JSON.stringify(jetons));

  const geometrie = await page.evaluate(() => {
    const repos = document.querySelector('#repos');
    const onglets = document.querySelector('.onglets');
    if (!repos || repos.hidden) return { ouvert: false };
    const rb = repos.getBoundingClientRect(), ro = onglets.getBoundingClientRect();
    const chevauche = (a, b) => a.left < b.right && b.left < a.right &&
                                a.top < b.bottom && b.top < a.bottom;
    // Tout ce qui se tape, hors des deux barres elles-mêmes.
    const cibles = Array.from(document.querySelectorAll(
      '#vue-seance button, #vue-seance input, #vue-seance a, #vue-seance [role="button"]'))
      .filter((n) => !repos.contains(n) && !onglets.contains(n))
      .filter((n) => n.offsetParent !== null);
    const dessous = cibles.filter((n) => chevauche(n.getBoundingClientRect(), rb))
      .map((n) => (n.className || n.tagName) + '');
    const erreur = document.querySelector('#erreur-seance');
    return {
      ouvert: true,
      nCibles: cibles.length,
      dessous: dessous,
      barresSeChevauchent: chevauche(rb, ro),
      hautRepos: Math.round(rb.top), basRepos: Math.round(rb.bottom),
      hautOnglets: Math.round(ro.top),
      erreurDessous: chevauche(erreur.getBoundingClientRect(), rb),
      // Le dernier bouton du flux : « Ajouter un exercice ».
      basDuDernier: Math.round(document.querySelector('#btn-ajouter-exo-seance')
        .getBoundingClientRect().bottom)
    };
  });

  ok('la barre de repos est bien ouverte pour ce test', geometrie.ouvert === true,
    JSON.stringify(geometrie.ouvert));
  ok('le banc a de quoi mesurer : plusieurs commandes dans la séance',
    geometrie.nCibles >= 8, geometrie.nCibles + ' cible(s) tapable(s)');
  // C'EST LE DÉFAUT CONSTATÉ SUR DEVICE.
  ok('AUCUNE commande ne reste sous la barre de repos', geometrie.dessous.length === 0,
    geometrie.dessous.length ? geometrie.dessous.join(' · ') : 'aucune');
  ok('« Ajouter un exercice » finit AU-DESSUS de la barre',
    geometrie.basDuDernier <= geometrie.hautRepos,
    'bas du bouton ' + geometrie.basDuDernier + ' · haut de la barre ' + geometrie.hautRepos);
  // Trouvé à la cartographie : le seul message d'erreur de la séance
  // (« Sauvegarde impossible sur cet appareil ») vivait entièrement dessous.
  ok('le message d’erreur de séance n’est plus masqué', geometrie.erreurDessous === false,
    'sous la barre : ' + geometrie.erreurDessous);
  // La barre de repos se posait à `bottom:56px` alors que les onglets font
  // ~69 px : elle mordait leurs 13 px hauts, et son z-index les recouvrait.
  ok('la barre de repos ne mord plus sur la barre d’onglets',
    geometrie.barresSeChevauchent === false,
    'bas du repos ' + geometrie.basRepos + ' · haut des onglets ' + geometrie.hautOnglets);

  console.log('\n══ 7 quater. LA CARTE DE SÉANCE DIT LA BONNE GRANDEUR ══');
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(500);
  await page.click('#feuille-contenu .principal');
  await attendre(2400);
  await aller('/');
  const carte = await page.evaluate(() => {
    const cartes = Array.from(document.querySelectorAll('.jour .seance'));
    const c = cartes.filter((x) => /quatre mesures/i.test(x.textContent))[0] ||
              cartes[cartes.length - 1];
    return Array.from(c.querySelectorAll('.apercu-exo')).map((l) => l.textContent);
  });
  ok('la carte donne la grandeur de chaque mesure, pas un blanc',
    carte.length === 3 && /80/.test(carte[0]) && /12/.test(carte[1]) && /50\s*s/.test(carte[2]),
    JSON.stringify(carte));

  console.log('\n══ 7 septies. NOTES, REPOS EN SÉANCE, FIN DE SÉANCE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
  //   UN EXERCICE À AU MOINS TROIS SÉRIES, DONT UNE AJOUTÉE *APRÈS* LA NOTE.
  //
  // Sur une série unique, « duplique sur toutes » et « écrit sur celle-là »
  // produisent exactement la même ligne en base. Il faut plusieurs séries pour
  // distinguer la duplication, et une ajoutée ENSUITE pour distinguer « on
  // recopie au geste » de « on projette à l'écriture ».
  await aller('/saisie');
  await demarrerRoutine('Push');

  const patchsRoutine = () => base.patchs.slice();
  // ⚠️ SCOPÉ À LA SÉANCE EN COURS. `squat-barre` a déjà servi dans les sections
  // précédentes : lire toute la table mélangerait des séries d'autres séances,
  // et la note « manquerait » sur des lignes qui n'ont jamais été concernées.
  const seanceCourante = () => (base.sessions.filter((s) => s.statut === 'en_cours')[0] || {}).id;
  const notesEnBase = (slug) => {
    const sid = seanceCourante();
    return base.sets.filter((s) => s.session_id === sid && s.exercise_slug === slug)
      .sort((a, b) => a.rang - b.rang)
      .map((s) => s.note);
  };
  const lireBloc = (iBloc, sel) => page.evaluate(([k, s]) =>
    (document.querySelectorAll('.bloc-seance')[k].querySelector(s) || {}).textContent || '',
    [iBloc, sel]);
  const ouvrirFeuilleBloc = async (iBloc, sel) => {
    await page.evaluate(([k, s]) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector(s).click();
    }, [iBloc, sel]);
    await attendre(400);
  };
  const taperFeuille = async (sel, texte) => {
    await page.fill('#feuille-contenu ' + sel, texte);
    await attendre(500);
  };
  const fermerFeuille = async () => { await page.click('#btn-fermer-feuille'); await attendre(600); };

  // §7 septies.2 — le repos s'affiche MÊME ABSENT : sans tiret, il n'y aurait
  // rien à toucher pour en poser un, et le seul chemin serait l'éditeur.
  ok('chaque exercice porte ses deux réglages sous son nom',
    (await compter('.reglages-exo')) === 2 &&
    (await compter('.reglages-exo .repos-cible')) === 2 &&
    (await compter('.reglages-exo .note-exo')) === 2,
    (await compter('.reglages-exo')) + ' tête(s)');
  const reglages = await page.evaluate(() => Array.from(document.querySelectorAll('.bloc-seance'))
    .map((b) => b.querySelector('.repos-cible').textContent.trim()));
  ok('le repos prescrit s’affiche, et son ABSENCE aussi — pas zéro, pas deviné',
    reglages[0] === 'repos 3:00' && reglages[1] === 'repos —', JSON.stringify(reglages));

  // ── La note d'exercice ──────────────────────────────────────────────────
  await ouvrirFeuilleBloc(0, '.note-exo');
  ok('un appui sur « + Note » ouvre la feuille de note',
    /Note de l’exercice/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 60));
  await taperFeuille('textarea', 'Barre basse, ceinture');
  await fermerFeuille();
  ok('la note s’affiche sous le nom, à la place du « + Note »',
    /Barre basse, ceinture/.test(await lireBloc(0, '.note-exo')), await lireBloc(0, '.note-exo'));

  await saisirSerie(0, 100, 5);
  await saisirSerie(1, 100, 5);
  await saisirSerie(2, 100, 5);
  ok('TOUTES les séries de cet exercice portent la note en base',
    notesEnBase('squat-barre').length === 3 &&
    notesEnBase('squat-barre').every((n) => n === 'Barre basse, ceinture'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ⚠️ LA SÉRIE AJOUTÉE APRÈS. C'est elle qui sépare les deux implémentations.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  await saisirSerie(3, 105, 5);
  ok('une série ajoutée APRÈS la note la reçoit aussi',
    notesEnBase('squat-barre').length === 4 &&
    notesEnBase('squat-barre').every((n) => n === 'Barre basse, ceinture'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ── La note modifiée : toutes suivent ───────────────────────────────────
  await ouvrirFeuilleBloc(0, '.note-exo');
  await taperFeuille('textarea', 'Ceinture + genouillères');
  await fermerFeuille();
  ok('modifiée, toutes les séries suivent — aucune ne reste en arrière',
    notesEnBase('squat-barre').length === 4 &&
    notesEnBase('squat-barre').every((n) => n === 'Ceinture + genouillères'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ── La note de série : minoritaire, mais elle existe ────────────────────
  await toucher(1, '.no-serie');
  ok('le menu de la série porte un champ de note propre',
    /Note de cette série/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await taperFeuille('textarea', 'Celle-ci sur bloc');
  await fermerFeuille();
  ok('une note de série est DISTINCTE de celle de l’exercice, et ne déteint pas',
    JSON.stringify(notesEnBase('squat-barre')) === JSON.stringify([
      'Ceinture + genouillères', 'Celle-ci sur bloc',
      'Ceinture + genouillères', 'Ceinture + genouillères']),
    JSON.stringify(notesEnBase('squat-barre')));
  ok('et son numéro le signale — sinon la note serait invisible',
    (await compter('.no-serie.a-note')) === 1,
    (await compter('.no-serie.a-note')) + ' série(s) marquée(s)');

  // ── Le repos se modifie en séance, sans rien écrire dans la routine ─────
  //
  // ⚠️ LA MOLETTE, LA MÊME QU'À L'ÉDITEUR (§7 sexdecies). La grille de huit
  // valeurs est partie au chantier 44 : elle et le pavé de l'éditeur disaient
  // la même chose, pour la même question. Il n'en reste qu'un écran — et ce
  // banc et celui des routines parcourent maintenant le MÊME composant.
  const reglerRepos = async (secondes) => {
    await page.evaluate((v) => {
      const p = document.querySelector('#feuille-contenu .molette .piste');
      const opts = Array.from(p.querySelectorAll('.opt'));
      const i = opts.findIndex((o) => Number(o.dataset.v) === v);
      p.scrollTop = i * 48;
      p.dispatchEvent(new Event('scroll'));
    }, secondes);
    await attendre(250);
  };
  const sortieRepos = async (classe) => {
    await page.click('#feuille-contenu .feuille-pied .' + classe);
    await attendre(900);
  };
  const patchsAvantRepos = patchsRoutine().length;
  await ouvrirFeuilleBloc(0, '.repos-cible');
  ok('[44] un appui sur le repos ouvre la MOLETTE — 36 valeurs, pas 8',
    /Temps de repos/.test(await texte('#feuille-contenu')) &&
    (await compter('#feuille-contenu .molette .opt')) === 36 &&
    (await compter('#feuille-contenu .grille-rpe button')) === 0,
    (await compter('#feuille-contenu .molette .opt')) + ' valeur(s)');
  // ⚠️ ET ELLE DIT QUE LA ROUTINE N'EST PAS TOUCHÉE. C'est la seule chose qui
  // diffère entre les deux écrans : la phrase, pas le composant.
  ok('[44] …et elle rappelle que la routine n’est pas touchée',
    /La routine n’est pas touchée/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await reglerRepos(120);
  await sortieRepos('pri');
  ok('le repos cible change à l’écran, tout de suite',
    /repos 2:00/.test(await lireBloc(0, '.repos-cible')), await lireBloc(0, '.repos-cible'));
  ok('et RIEN n’est écrit dans la routine au moment du geste (§7 septies.2)',
    patchsRoutine().length === patchsAvantRepos &&
    ROUTINE.routine_exercises[0].repos_cible_s === 180,
    patchsRoutine().length + ' PATCH · routine à ' + ROUTINE.routine_exercises[0].repos_cible_s);

  // ── Le chronomètre s'arrête à l'échéance ───────────────────────────────
  //
  // ⚠️ SUR LE PREMIER BLOC, DEPUIS LE CHANTIER 45. Cette section travaillait sur
  // le SECOND — celui dont la routine ne prescrit AUCUN repos — et posait la
  // cible « entièrement à la main » avec quatre +15. Ce chemin n'existe plus :
  // un repos désactivé n'arme aucun chronomètre, donc il n'y a plus de barre à
  // laquelle parler. On part maintenant du premier bloc, dont le repos vient
  // d'être porté à 2:00 juste au-dessus, et on DESCEND à 1:00 avec quatre −15.
  // Les nombres qui suivent sont inchangés, et le sujet du test non plus : ce
  // qu'il mesure, c'est l'arrêt à l'échéance et la relance, pas l'armement.
  //
  // ⚠️ ET SUR UNE LIGNE NEUVE : les quatre premières sont déjà validées, les
  // retaper les DÉvaliderait (et ne relancerait aucun chronomètre).
  console.log('   … 30 s de chronomètre réel');
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  await saisirSerie(4, 60, 8);   // 5ᵉ ligne du bloc 0 : l'index global vaut encore 4
  const cliqueRepos2 = async (i, n) => {
    for (let k = 0; k < (n || 1); k++) {
      await page.evaluate((j) => {
        const b = document.querySelectorAll('#repos .repos-b')[j];
        if (b) b.click();
      }, i);
      await attendre(260);
    }
  };
  const chrono = async () => (await texte('#repos .repos-g')).trim();

  await cliqueRepos2(0, 4);                 // −15 ×4 : 2:00 → cible 1:00
  ok('la cible réglée à la main vaut 1:00', /cible 1:00/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));
  // ⚠️ [50] IL DÉCOMPTE, il ne compte pas. « t1 ≠ t2 » passait dans les deux
  // sens et ne distinguait donc pas un rebours d'un chronomètre montant : on
  // compare les secondes, et on exige que ça DIMINUE.
  const enSecondes = (t) => {
    const m = /^(\d+):(\d\d)$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const t1 = await chrono();
  await attendre(20000);                    // écoulé ≈ 21 s, bien sous la cible
  const t2 = await chrono();
  ok('sous la cible, il DÉCOMPTE', enSecondes(t2) < enSecondes(t1) && (await barreVisible()) === true,
    t1 + ' → ' + t2);

  // ⚠️ LE CAS SIGNALÉ : trois −15 font passer la cible (1:00 → 0:15) DERRIÈRE
  // le temps écoulé (≈ 22 s). Il ne reste alors rien à décompter — et depuis le
  // chantier 51 « rien à décompter » veut dire « plus de barre », par ce chemin
  // comme par les autres. Jusqu'au 50, elle restait là, figée sur 0:00.
  const avantFranchi = await chrono();
  await cliqueRepos2(0, 3);
  ok('[51] un −15 qui FRANCHIT la cible éteint la barre',
    (await barreVisible()) === false,
    avantFranchi + ' → barre ' + ((await barreVisible()) ? 'encore là' : 'partie'));

  // ⚠️ S'ÉTEINDRE, C'EST AUSSI ARRÊTER DE TRAVAILLER.
  //
  // `rendreRepos` VIDE et reconstruit la barre à chaque passage. Un minuteur
  // qu'on laisse tourner derrière une barre éteinte rebâtit le DOM une fois par
  // seconde pour rien, et personne ne le verrait — l'écran est déjà vide. On
  // observe donc le DOM lui-même, sinon « éteint » ne veut dire que « éteint à
  // l'écran ». C'est la même mesure qu'au chantier 26, sur l'état d'après.
  const remuements = await page.evaluate(() => new Promise((res) => {
    const cible = document.getElementById('repos');
    let n = 0;
    const obs = new MutationObserver((l) => { n += l.length; });
    obs.observe(cible, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); res(n); }, 3200);
  }));
  ok('éteinte, la barre cesse AUSSI de se redessiner chaque seconde',
    remuements === 0, remuements + ' remaniement(s) du DOM en 3,2 s');

  // ⚠️ ET LES COMMANDES D'UNE BARRE ÉTEINTE NE RÉVEILLENT RIEN. Les boutons
  // restent dans le DOM, cachés avec elle : un « +15 » qui les atteindrait ne
  // doit pas ressusciter un chronomètre éteint. C'est `ajusterRepos` qui le
  // garantit (`if (!chrono) return`), et c'est la seule façon de le voir.
  await cliqueRepos2(1, 3);
  await attendre(1200);
  ok('[51] …et un +15 sur une barre éteinte ne la fait pas revenir',
    (await barreVisible()) === false, 'barre ' + ((await barreVisible()) ? 'revenue' : 'toujours partie'));

  // Ce qui relance un repos, c'est une série validée — et rien d'autre. Un arrêt
  // qui ne saurait pas repartir condamnerait tous les repos suivants.
  // ⚠️ L'INDEX EST CELUI DU BLOC 0, PAS LE DERNIER DE LA LISTE. « + Série » du
  // bloc 0 ajoute une ligne À LA FIN DU BLOC 0 ; la dernière ligne de l'écran
  // appartient au bloc 1, qui ne prescrit AUCUN repos. La valider n'armait donc
  // rien, et la mesure lisait un affichage périmé : « 0:08 → 0:08 », comme un
  // chronomètre mort. Les lignes du bloc 0 venant en premier, son dernier indice
  // LOCAL vaut encore son indice global.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  await saisirSerie((await lignesDuBloc(0)) - 1, 60, 8);
  const reparti = await chrono();
  await attendre(3200);
  const reparti2 = await chrono();
  ok('valider une série réarme un décompte neuf, qui descend',
    (await barreVisible()) === true && enSecondes(reparti2) < enSecondes(reparti),
    reparti + ' → ' + reparti2);

  // ── L'écran de fin ─────────────────────────────────────────────────────
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  ok('l’écran de fin porte les trois champs déclarés',
    (await compter('#feuille-contenu .champs-fin .champ-texte')) === 3,
    (await compter('#feuille-contenu .champs-fin .champ-texte')) + ' champ(s)');
  ok('et la question sur la routine, puisque la séance a dévié (§6.2)',
    (await compter('#feuille-contenu .question-routine')) === 1 &&
    /repos 3:00 → 2:00/.test(await texte('#feuille-contenu .ecarts')),
    (await texte('#feuille-contenu .ecarts')).replace(/\s+/g, ' ').slice(0, 90));

  await page.fill('#feuille-contenu .champs-fin input[type="text"]', 'Jambes du jeudi');
  await attendre(300);
  await page.evaluate(() => {
    const c = document.querySelectorAll('#feuille-contenu .champs-fin .champ-texte');
    const salle = c[1].querySelector('input');
    salle.value = 'Basic-Fit Mulhouse';
    salle.dispatchEvent(new Event('input', { bubbles: true }));
    const note = c[2].querySelector('textarea');
    note.value = 'Dos fatigué, charges tenues';
    note.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await attendre(500);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .choix-routine button'))
      .filter((x) => /Reporter/.test(x.textContent))[0];
    b.click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  const finie = base.sessions.filter((s) => s.titre === 'Jambes du jeudi')[0];
  ok('titre, salle et note de séance sont enregistrés', !!finie &&
    finie.salle === 'Basic-Fit Mulhouse' && /Dos fatigué/.test(finie.note || ''),
    JSON.stringify({ t: finie && finie.titre, s: finie && finie.salle, n: finie && finie.note }));
  // La base de papier REFUSE `salle_norme` (428C9) : si l'app l'envoyait, la
  // séance ne serait jamais montée et le test précédent tomberait déjà. On
  // vérifie en plus que rien n'est resté coincé dans la file.
  ok('`salle_norme` n’est jamais envoyée — la séance monte',
    finie.statut === 'terminee' && !/à envoyer|refusé/.test(await texte('#etat-sync')),
    (await texte('#etat-sync')).trim() || '(vide)');

  // ⚠️ `p.champs` : `base.patchs` porte aussi les écritures de `routine_sets`
  // depuis le chantier 43, et une entrée `delete-series` porte le MÊME `id` —
  // celui de l'exercice parent. Sans ce filtre, `.pop()` rend la suppression
  // des séries, qui n'a pas de `champs`.
  const patch = patchsRoutine().filter((p) => p.id === 're1' && p.champs).pop();
  ok('« Reporter » écrit les écarts sur la routine, et RIEN d’autre',
    !!patch && JSON.stringify(Object.keys(patch.champs).sort()) === '["note","repos_cible_s"]' &&
    patch.champs.repos_cible_s === 120 && /Ceinture/.test(patch.champs.note || ''),
    JSON.stringify(patch && patch.champs));

  // ⚠️ « RIEN D'AUTRE » VAUT AUSSI POUR LES SÉRIES (mutation M30, chantier 43).
  //
  // `planEcritures` REMPLACE les lignes d'un exercice — supprime puis réinsère.
  // Appliqué sans condition, le report réécrivait donc la structure de TOUS les
  // exercices à chaque passage, changés ou non : six suppressions et six
  // insertions pour n'avoir rien changé. L'assertion d'au-dessus ne le voyait
  // pas (aucune de ces colonnes ne ressemble à une charge), et c'est exactement
  // ce qu'une mutation a montré. Ici la déviation ne touche que le repos et la
  // note : AUCUNE ligne ne doit bouger.
  const ecrituresSeries = patchsRoutine()
    .filter((p) => p.op === 'insert-series' || p.op === 'delete-series');
  ok('[43] …et aucune ligne programmée n’est réécrite quand elle n’a pas changé',
    ecrituresSeries.length === 0,
    ecrituresSeries.length + ' écriture(s) de `routine_sets`');

  await aller('/');
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.jour .seance'))
      .filter((x) => /Jambes du jeudi/.test(x.textContent))[0];
    c.click();
  });
  await attendre(1200);
  ok('la note de séance se relit sur le détail',
    /Dos fatigué/.test(await texte('#vue-detail')),
    (await texte('#vue-detail')).replace(/\s+/g, ' ').slice(0, 100));

  // ── Aucune déviation → aucune question (§6.2) ──────────────────────────
  //
  // La routine porte maintenant 2:00 et la note : une séance qui n'y touche pas
  // est CONFORME. C'est l'autre moitié du test — prouver qu'on demande ne vaut
  // que si l'on prouve aussi qu'on se tait.
  await aller('/saisie');
  await demarrerRoutine('Push');
  ok('la note de la routine suit dans la nouvelle séance',
    /Ceinture/.test(await lireBloc(0, '.note-exo')), await lireBloc(0, '.note-exo'));
  await saisirSerie(0, 100, 5);
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  ok('sans déviation, AUCUNE question sur la routine ne se pose',
    (await compter('#feuille-contenu .question-routine')) === 0,
    (await compter('#feuille-contenu .question-routine')) + ' question(s)');
  await fermerFeuille();

  // ⚠️ L'AUTRE MOITIÉ : « GARDER », qui est le DÉFAUT.
  //
  // Prouver que « Reporter » écrit ne vaut que si l'on prouve aussi que ne rien
  // demander n'écrit pas. Sans ce test, une implémentation qui reporte TOUJOURS
  // passerait le banc — et corrigerait les routines d'Aurélien dans son dos.
  await ouvrirFeuilleBloc(0, '.repos-cible');
  await reglerRepos(180);
  await sortieRepos('pri');
  const patchsAvantGarder = patchsRoutine().length;
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  ok('une déviation ROUVRE la question', (await compter('#feuille-contenu .question-routine')) === 1,
    (await texte('#feuille-contenu .ecarts')).replace(/\s+/g, ' ').slice(0, 60));
  ok('et « Garder la routine » est sélectionné par défaut',
    await page.evaluate(() => {
      const s = document.querySelector('#feuille-contenu .choix-routine button.sel');
      return !!s && /Garder/.test(s.textContent);
    }), 'défaut = garder');
  await page.click('#feuille-contenu .principal');
  await attendre(2600);
  ok('terminer en gardant n’écrit RIEN dans la routine',
    patchsRoutine().length === patchsAvantGarder &&
    ROUTINE.routine_exercises[0].repos_cible_s === 120,
    patchsRoutine().length + ' PATCH (avant ' + patchsAvantGarder +
    ') · routine à ' + ROUTINE.routine_exercises[0].repos_cible_s);

  console.log('\n══ 7 octies. LES SUPERSETS ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : un superset à
  // SÉRIES INÉGALES, validé DANS LE DÉSORDRE. Sur un superset régulier validé
  // de haut en bas, « éclairage par tour » et « éclairage par ligne » rendent
  // exactement le même écran.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const etiquettes = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.no-serie'))
      .map((n) => n.textContent), iBloc);
  const allumees = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.serie'))
      .map((r) => r.classList.contains('faite')), iBloc);
  // Une rangée est adressée par son INDICE D'AFFICHAGE dans le bloc — c'est
  // l'ordre entrelacé, donc exactement ce qu'un pouce touche.
  const validerRangee = async (iBloc, iRangee) => {
    await page.evaluate(([k, r]) => {
      document.querySelectorAll('.bloc-seance')[k]
        .querySelectorAll('.ligne-serie')[r].querySelector('.ok-serie').click();
    }, [iBloc, iRangee]);
    await attendre(500);
  };
  const superT = () => texte('.bloc-seance.superset .superset-t');

  ok('le superset fait UN bloc, l’exercice seul en fait un autre',
    (await compter('.bloc-seance')) === 2 &&
    (await compter('.bloc-seance.superset')) === 1,
    (await compter('.bloc-seance')) + ' bloc(s), dont ' +
    (await compter('.bloc-seance.superset')) + ' superset');

  // Le liseré du détail de séance, repris tel quel : la même chose se reconnaît
  // au même signe d'un écran à l'autre. Couleur calculée, pas classe posée.
  const lisere = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance');
    return [getComputedStyle(b[0]).borderLeftWidth, getComputedStyle(b[1]).borderLeftWidth];
  });
  ok('le superset porte le liseré, l’exercice seul n’en a pas',
    lisere[0] === '3px' && lisere[1] === '0px', JSON.stringify(lisere));

  ok('les séries s’affichent ENTRELACÉES, et le tour 3 n’attend aucun C3',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3']),
    JSON.stringify(await etiquettes(0)));

  ok('l’exercice seul numérote 1, 2 — aucune lettre',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['1', '2']),
    JSON.stringify(await etiquettes(1)));

  const legende = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.exo-seance'))
      .map((n) => n.textContent));
  ok('le nom de chaque exercice n’apparaît QU’UNE FOIS, dans la légende',
    legende.length === 3 && /^ADéveloppé/.test(legende[0]) && /^BCurl/.test(legende[1]),
    JSON.stringify(legende));

  // ⚠️ 360 px — LA LARGEUR RÉELLE DE L'APPAREIL. La légende existe pour tenir
  // le nom une seule fois ; si elle le coupe, elle ne sert plus à rien. Et
  // « A1 » dans 30 px de numéro débordait : la colonne passe à 36.
  const geom = await page.evaluate(() => {
    const bloc = document.querySelectorAll('.bloc-seance')[0];
    const noms = Array.from(bloc.querySelectorAll('.exo-seance'));
    const rangees = Array.from(bloc.querySelectorAll('.serie'));
    return {
      largeur: document.documentElement.clientWidth,
      debordePage: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nomsCoupes: noms.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
      // ⚠️ ON MESURE LE TEXTE, PAS LA BOÎTE. `.no-serie` est une grille à
      // contenu centré, `overflow` visible : « A1 » dans 12 px déborde sur les
      // colonnes voisines SANS changer d'un pixel son `scrollWidth`. Une
      // mutation qui rétrécissait la colonne passait donc au travers. Un
      // `Range` sur le contenu donne la largeur réellement peinte.
      numerosCoupes: Array.from(bloc.querySelectorAll('.no-serie')).filter((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return r.getBoundingClientRect().width > n.getBoundingClientRect().width + 1;
      }).length,
      rangeesDebordantes: rangees.filter((r) => r.scrollWidth > r.clientWidth + 1).length
    };
  });
  ok('à 360 px : aucun nom coupé, aucun numéro coupé, rien qui déborde',
    geom.largeur <= 360 && !geom.debordePage && geom.nomsCoupes === 0 &&
    geom.numerosCoupes === 0 && geom.rangeesDebordantes === 0,
    JSON.stringify(geom));

  // §3 ter — un superset peut mélanger les mesures. Chaque ligne garde la
  // sienne ; l'en-tête se tait plutôt que de mentir sur la moitié des rangées.
  const grilles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.serie'))
      .map((r) => Array.from(r.classList).filter((c) => c.startsWith('g-'))[0]));
  ok('chaque ligne garde le gabarit de SON exercice, même mélangés',
    JSON.stringify(grilles) === JSON.stringify([
      'g-charge_reps', 'g-charge_reps', 'g-temps',
      'g-charge_reps', 'g-charge_reps', 'g-temps',
      'g-charge_reps', 'g-charge_reps']),
    JSON.stringify(grilles));
  ok('et l’en-tête de colonnes se tait sur un bloc à mesures mélangées',
    (await page.evaluate(() =>
      document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.cols-seance').length)) === 0 &&
    (await page.evaluate(() =>
      document.querySelectorAll('.bloc-seance')[1].querySelectorAll('.cols-seance').length)) === 1,
    'superset mélangé : aucun · exercice seul : un');

  // ── L'éclairage porte sur le TOUR, et le tour ne recule pas ─────────────
  // §7 undecies.3 — le compteur affiche les tours FAITS : rien de fait, 0/3.
  ok('au départ, aucun tour n’est fait : 0/3', /tour 0\/3/.test(await superT()),
    (await superT()).trim());

  // Rangée 0 = A1. Validée seule, elle n'allume rien : le tour n'est pas fait.
  await validerRangee(0, 0);
  ok('valider A1 seul n’allume RIEN — l’éclairage porte sur le tour',
    (await allumees(0)).every((x) => x === false) && /tour 0\/3/.test(await superT()),
    JSON.stringify(await allumees(0)) + ' · ' + (await superT()).trim());
  // ⚠️ ET ELLE SE VOIT POUR DE VRAI — couleur calculée, pas classe posée.
  // Le style de la coche était accroché à `.serie.faite` ; le fond vert disant
  // désormais « le tour est fait », la coche d'une ligne validée dans un tour
  // incomplet se serait éteinte exactement là où elle sert le plus.
  const coche = await page.evaluate(() => {
    const bloc = document.querySelectorAll('.bloc-seance')[0];
    const cochees = bloc.querySelectorAll('.ok-serie.cochee');
    const eteinte = bloc.querySelectorAll('.ok-serie:not(.cochee)')[0];
    return {
      n: cochees.length,
      fond: cochees[0] ? getComputedStyle(cochees[0]).backgroundColor : '',
      fondEteinte: eteinte ? getComputedStyle(eteinte).backgroundColor : '',
      rangeeAllumee: cochees[0] ? cochees[0].closest('.serie').classList.contains('faite') : null
    };
  });
  ok('mais sa coche, elle, se voit — même dans un tour non allumé',
    coche.n === 1 && coche.rangeeAllumee === false &&
    coche.fond !== coche.fondEteinte && /^rgb/.test(coche.fond),
    JSON.stringify(coche));

  // ⚠️ DANS LE DÉSORDRE : C1 avant B1.
  await validerRangee(0, 2);          // C1
  await validerRangee(0, 1);          // B1
  ok('le tour se ferme dans le désordre, et s’allume d’un coup',
    JSON.stringify(await allumees(0)) ===
    JSON.stringify([true, true, true, false, false, false, false, false]),
    JSON.stringify(await allumees(0)));
  ok('et le tour annoncé avance', /tour 1\/3/.test(await superT()), (await superT()).trim());

  // ⚠️ DÉVALIDER NE FAIT PAS RECULER LE TOUR — asymétrie assumée (§2.7).
  await validerRangee(0, 0);          // dévalide A1
  ok('dévalider ne fait PAS reculer le tour', /tour 1\/3/.test(await superT()),
    (await superT()).trim());
  ok('mais l’éclairage, lui, dit la vérité du moment',
    (await allumees(0)).slice(0, 3).every((x) => x === false),
    JSON.stringify((await allumees(0)).slice(0, 3)));
  await validerRangee(0, 0);          // revalide A1

  // ── Le tour 3, sans C3 ─────────────────────────────────────────────────
  for (const r of [3, 4, 5, 6, 7]) await validerRangee(0, r);
  ok('le tour 3 se ferme sans C3 : tout le bloc est allumé',
    (await allumees(0)).every((x) => x === true) && /tour 3\/3/.test(await superT()),
    JSON.stringify(await allumees(0)) + ' · ' + (await superT()).trim());

  // ── Le superset SURVIT à l'enregistrement ──────────────────────────────
  //
  // L'exercice seul est validé lui aussi : sans ses lignes, la comparaison
  // avec le détail ne porterait que sur le superset et laisserait justement
  // passer un débordement des lettres sur le bloc d'à côté.
  await validerRangee(1, 0);
  await validerRangee(1, 1);
  const enBase = sets().filter((s) => s.session_id === seanceCourante());
  ok('`groupe_superset` part en base — sinon le superset disparaîtrait au détail',
    enBase.length === 10 &&
    enBase.filter((s) => s.groupe_superset === 1).length === 8 &&
    enBase.filter((s) => s.groupe_superset === null).length === 2,
    JSON.stringify(enBase.map((s) => s.exercise_slug + '@' + s.groupe_superset)));

  const idSuper = seanceCourante();
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ⚠️ LA COMPARAISON QUI COMPTE : le détail de séance rend déjà
  // l'entrelacement en lecture (chantier 12). Les deux écrans doivent dire la
  // même chose de la même séance — sinon l'un des deux est faux.
  await aller('/seance/' + idSuper);
  const auDetail = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#vue-detail .bloc')).map((b) =>
      Array.from(b.querySelectorAll('.serie .tag')).map((t) => t.textContent)));
  ok('le détail rend les MÊMES étiquettes que la saisie',
    JSON.stringify(auDetail) ===
    JSON.stringify([['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3'], ['1', '2']]),
    JSON.stringify(auDetail));
  ok('et il reconnaît le superset, liseré compris',
    (await compter('#vue-detail .bloc.superset')) === 1,
    (await compter('#vue-detail .bloc.superset')) + ' bloc(s) superset');

  console.log('\n══ 7 nonies. LA DÉVIATION — MENU DE BLOC, MODIFIER, REPORT ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET À TROIS
  // EXERCICES, ET UN DÉPLACEMENT AU MILIEU DE LA LISTE.
  //
  // Sur un superset à DEUX, « sortir un exercice » et « dissoudre le bloc »
  // donnent exactement le même écran : il reste deux blocs d'un seul dans les
  // deux cas. Il faut un troisième pour que la différence existe — l'un sort,
  // les deux autres restent groupés. Et en déplaçant le DERNIER bloc,
  // « renuméroter les rangs » et « ne rien faire » sont indistinguables : rien
  // ne bouge derrière lui. Le déplacement se fait donc AU MILIEU, là où les
  // rangs de tout ce qui suit doivent suivre sans se heurter à
  // `sets_rang_unique`.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const menuBloc = async (i) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector('.tete-haut .menu-pts').click();
    }, i);
    await attendre(500);
  };
  // ⚠️ « MONTER LE BLOC » A QUITTÉ LE MENU AU CHANTIER 46 (§7 vicies.1) : le
  // menu porte désormais « Réorganiser… », qui ouvre le mode. Les deux flèches
  // vivent sur le bloc REPLIÉ, où elles restent le chemin accessible au clavier.
  // Le banc passe donc par le mode — et sa sortie « Terminé », qui ENREGISTRE.
  const deplacerBlocParMode = async (i, sens) => {
    await page.click('#bandeau-seance .bandeau-modifier');
    await attendre(600);
    await page.evaluate(([k, d]) => {
      document.querySelectorAll('.bloc-seance.replie')[k]
        .querySelector('.geste[aria-label="' + (d === 'haut' ? 'Monter' : 'Descendre') + ' le bloc"]')
        .click();
    }, [i, sens]);
    await attendre(700);
    await page.click('#bandeau-seance .bandeau-modifier');
    await attendre(900);
  };
  const menuExo = async (i, k) => {
    await page.evaluate(([b, x]) => {
      document.querySelectorAll('.bloc-seance')[b]
        .querySelectorAll('.legende-haut .menu-pts')[x].click();
    }, [i, k]);
    await attendre(500);
  };
  const entreesFeuille = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .map((b) => b.textContent + (b.disabled ? ' (inerte)' : '')));
  const entree = async (motif) => {
    await page.evaluate((m) => {
      const b = Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => new RegExp(m).test(x.textContent))[0];
      b.click();
    }, motif);
    await attendre(700);
  };
  const choisirCatalogue = async (q) => {
    await page.fill('#champ-recherche-exo', q);
    await attendre(350);
    await page.click('#resultats-exo .resultat');
    await attendre(800);
  };
  // La forme de la séance : un tableau de blocs, chacun la liste de ses noms.
  // ⚠️ PAS LE TEXTE ENTIER : le nom est précédé de sa lettre dans un superset
  // (`A`, `B`, `C`), et replié il vit dans `.replie-nom`. Le même appel doit
  // lire les deux vues, sinon le mode Modifier ne se mesure pas.
  // ⚠️ ET PAS `span:last-child` : depuis le chantier 40, le nom en séance est un
  // BOUTON qui mène à la page d'exercice (§2.8). On lit `.nom-exo`, qui est
  // porté par les deux formes, et on retombe sur le dernier `span` pour la vue
  // repliée.
  const formeEcran = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) =>
      Array.from(b.querySelectorAll('.exo-seance, .replie-nom'))
        .map((n) => (n.querySelector('.nom-exo') || n.querySelector('span:last-child')).textContent)));
  // ⚠️ LES SÉRIES DE **CETTE** SÉANCE. `sets()` écarte le décor, pas les séances
  // des sections précédentes : à la septième, elles sont une vingtaine, et
  // « 2 séries validées » serait faux de toute implémentation.
  const setsSeance = () => base.sets.filter((s) => s.session_id === seanceCourante());
  const rangsBase = () => setsSeance().slice().sort((a, b) => a.rang - b.rang)
    .map((s) => s.exercise_slug + '@' + s.rang);

  // ── §5 bis — le menu est là PENDANT qu'on saisit ────────────────────────
  ok('le menu de bloc est accessible sans passer par Modifier',
    (await compter('.tete-haut .menu-pts')) === 2 &&
    (await compter('.legende-haut .menu-pts')) === 3 &&
    (await compter('.bloc-seance.replie')) === 0,
    (await compter('.tete-haut .menu-pts')) + ' menu(s) de bloc · ' +
    (await compter('.legende-haut .menu-pts')) + ' menu(s) d’exercice');

  await menuBloc(1);
  ok('sur un bloc d’UN SEUL, le menu porte aussi les gestes de l’exercice',
    (await entreesFeuille()).join(' | ').indexOf('Remplacer') >= 0 &&
    (await entreesFeuille()).join(' | ').indexOf('Supprimer l’exercice') >= 0,
    (await entreesFeuille()).join(' | '));
  // §2.8 — « voir la progression » a été inerte du chantier 27 au 40 : la page
  // d'exercice (§7 quater) n'existait pas. Elle existe.
  ok('[40] « Voir la progression » est CÂBLÉ sur un bloc d’un seul',
    (await entreesFeuille()).some((t) => /^Voir la progression$/.test(t)),
    (await entreesFeuille()).join(' | '));
  await fermerFeuille();

  // §5.6 — sur un SUPERSET, « Remplacer » n'a pas de sens au niveau du bloc :
  // il faut dire LEQUEL des trois. Le geste vit sur la branche, et le menu du
  // bloc ne le propose pas — masqué, pas grisé.
  await menuBloc(0);
  ok('sur un SUPERSET, le menu du bloc ne propose PAS « Remplacer »',
    !(await entreesFeuille()).some((t) => /Remplacer/.test(t)) &&
    (await entreesFeuille()).some((t) => /Supprimer le bloc/.test(t)),
    (await entreesFeuille()).join(' | '));
  // ⚠️ L'ASYMÉTRIE EST LA MESURE. Sur un bloc d'un seul il est actif, sur un
  // superset il est grisé — « la progression de QUEL exercice ? » n'a pas de
  // réponse au niveau du bloc. Sans les deux côtés, « câblé » et « inerte »
  // rendraient le même écran.
  ok('[40] mais « Voir la progression » y reste GRISÉ — le bloc ne tranche pas',
    (await entreesFeuille()).some((t) => /Voir la progression \(inerte\)/.test(t)),
    (await entreesFeuille()).join(' | '));
  await fermerFeuille();

  // ── §5.8 — SORTIR UN EXERCICE, celui du MILIEU ──────────────────────────
  // ⚠️ UN TOUR ENTIER, PAS DEUX LIGNES. Une marque de tour ne se voit reculer
  // que si elle a d'abord avancé : avec un tour incomplet, « les marques sont
  // re-semées après un geste » et « elles sont perdues » donnent le même écran.
  await validerRangee(0, 0);      // A1 — Développé Couché
  await validerRangee(0, 1);      // B1 — Curl
  await validerRangee(0, 2);      // C1 — Planche
  ok('le premier tour est bouclé avant qu’on touche à la structure',
    setsSeance().length === 3 && /tour 1\/3/.test(await superT()),
    JSON.stringify(rangsBase()) + ' · ' + (await superT()).trim());

  await menuExo(0, 1);            // le CURL, au milieu du superset à trois
  ok('le menu d’un exercice de superset propose de l’en sortir',
    (await entreesFeuille()).some((t) => /Sortir du superset/.test(t)),
    (await entreesFeuille()).join(' | '));
  await entree('Sortir du superset');

  ok('il sort SEUL : les deux autres restent groupés',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Planche'], ['Curl Biceps Haltères'], ['Squat (Barre)']]),
    JSON.stringify(await formeEcran()));
  ok('et il se pose JUSTE APRÈS son bloc, pas en fin de séance',
    (await compter('.bloc-seance')) === 3 && (await compter('.bloc-seance.superset')) === 1,
    (await compter('.bloc-seance')) + ' bloc(s), dont ' +
    (await compter('.bloc-seance.superset')) + ' superset');
  ok('les étiquettes suivent la nouvelle forme',
    JSON.stringify(await etiquettes(0)) === JSON.stringify(['A1', 'B1', 'A2', 'B2', 'A3']) &&
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['1', '2', '3']),
    JSON.stringify(await etiquettes(0)) + ' · ' + JSON.stringify(await etiquettes(1)));
  // ⚠️ LA MARQUE DE TOUR SURVIT AU GESTE. `normaliserGroupes` renumérote les
  // groupes, donc jette `seance.tours` — indexé par numéro de groupe. L'app la
  // re-sème aussitôt depuis l'état courant ; sans ça, le tour reculerait à 1 à
  // chaque déviation, ce que le §2.7 interdit explicitement.
  ok('et le tour atteint ne recule pas d’un geste de structure',
    /tour 1\/3/.test(await superT()), (await superT()).trim());

  // « Ce qui est déjà saisi ne se perd pas » (§5 du chantier).
  ok('la série validée du sortant est TOUJOURS là, à l’écran et en base',
    (await page.evaluate(() => document.querySelectorAll('.bloc-seance')[1]
      .querySelectorAll('.ok-serie.cochee').length)) === 1 &&
    setsSeance().filter((s) => s.exercise_slug === 'curl').length === 1,
    JSON.stringify(rangsBase()));

  // ── §5.5 — DÉPLACER UN BLOC, AU MILIEU DE LA LISTE ──────────────────────
  await deplacerBlocParMode(2, 'haut');   // Squat, en dernier
  ok('le bloc déplacé se pose au milieu, et le superset ne bouge pas',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Planche'], ['Squat (Barre)'], ['Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ LA CONTRAINTE RÉELLE : tout ce qui suit a changé de rang. Sur une séance
  // DÉJÀ MONTÉE, écrire ces rangs sans se heurter à `sets_rang_unique` est
  // exactement le travail de `remplacerSeries` — déplacer le DERNIER bloc ne
  // l'aurait jamais montré.
  ok('les rangs suivent en base, sans collision',
    JSON.stringify(rangsBase()) ===
      JSON.stringify(['dc-barre@1', 'planche@4', 'curl@8']) &&
    new Set(setsSeance().map((s) => s.rang)).size === setsSeance().length,
    JSON.stringify(rangsBase()));

  // ── §5.7 — GROUPER DEUX BLOCS PAR SÉLECTION ─────────────────────────────
  await menuBloc(1);              // Squat
  await entree('Grouper en superset');
  ok('l’écran passe en SÉLECTION : la consigne prend le bandeau',
    /Grouper avec/.test(await texte('#bandeau-seance')) &&
    (await compter('.bloc-seance.source-groupe')) === 1 &&
    (await compter('.bloc-seance.cible-groupe')) === 2,
    (await texte('#bandeau-seance')).replace(/\s+/g, ' ').slice(0, 50));
  // ⚠️ « Terminer » disparaît pendant la sélection : le laisser sous la main à
  // ce moment-là, c'est proposer de finir sa séance par erreur.
  ok('et « Terminer » n’est plus sous la main', (await compter('#bandeau-seance .bandeau-fin')) === 0,
    (await compter('#bandeau-seance .bandeau-fin')) + ' bouton Terminer');
  // ⚠️ NI LES « ⋯ ». La carte entière est la cible du tap : un bouton au milieu
  // d'elle qui ferait autre chose est un piège, et le bloc SOURCE ne se propose
  // pas à lui-même — se grouper avec soi-même rendrait le geste muet.
  ok('aucun menu « ⋯ » ne reste tapable pendant la sélection',
    (await compter('.menu-pts')) === 0, (await compter('.menu-pts')) + ' menu(s)');
  ok('et le bloc qui a lancé le geste n’est pas sa propre cible',
    (await compter('.bloc-seance.source-groupe')) === 1 &&
    (await compter('.bloc-seance.cible-groupe')) === 2 &&
    (await compter('.bloc-seance.source-groupe.cible-groupe')) === 0,
    (await compter('.bloc-seance.source-groupe')) + ' source · ' +
    (await compter('.bloc-seance.cible-groupe')) + ' cible(s)');
  // §5.7 — la source se réduit à sa tête comme les cibles : on choisit un bloc,
  // on ne saisit pas. Les laisser déployées ferait défiler pour choisir.
  ok('et plus aucune ligne de saisie ne reste sous la main',
    (await compter('.ligne-serie')) === 0, (await compter('.ligne-serie')) + ' ligne(s)');

  await page.evaluate(() => document.querySelectorAll('.bloc-seance')[2].click());
  await attendre(800);
  ok('le bloc touché rejoint le sélectionné : deux supersets',
    (await compter('.bloc-seance')) === 2 && (await compter('.bloc-seance.superset')) === 2,
    JSON.stringify(await formeEcran()));
  ok('et les étiquettes du nouveau bloc s’entrelacent',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['A1', 'B1', 'A2', 'B2', 'B3']),
    JSON.stringify(await etiquettes(1)));

  // ── §5.2 — REMPLACER, sur un exercice QUI PORTE DU TRAVAIL FAIT ─────────
  //
  // La règle tranchée : les séries validées RESTENT, sous l'ancien nom, et le
  // nouveau démarre vide juste après. On ne récrit pas du travail réellement
  // fait sous un autre exercice — ce serait une donnée fausse, pas un raccourci.
  await menuExo(0, 0);            // Développé Couché — 1 série validée sur 3
  await entree('Remplacer');
  await choisirCatalogue('tractions');
  // ⚠️ LE NOUVEAU HÉRITE DU SLOT, DONC DU NOMBRE DE LIGNES — trois, comme le
  // Développé Couché en avait trois. L'ancien, lui, ne garde que sa ligne
  // FAITE. Le bloc passe donc de 3+2 à 1+3+2 lignes, et l'entrelacement le dit :
  // A n'a plus qu'un tour, B en a trois.
  ok('l’ancien garde SES séries validées, le nouveau démarre vide à sa suite',
    JSON.stringify((await formeEcran())[0]) ===
    JSON.stringify(['Développé Couché (Barre)', 'Tractions', 'Planche']) &&
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A1', 'B1', 'C1', 'B2', 'C2', 'B3']),
    JSON.stringify((await formeEcran())[0]) + ' · ' + JSON.stringify(await etiquettes(0)));
  ok('la série faite est intacte en base — aucune n’a changé d’exercice',
    setsSeance().filter((s) => s.exercise_slug === 'dc-barre').length === 1 &&
    setsSeance().filter((s) => s.exercise_slug === 'tractions').length === 0,
    JSON.stringify(rangsBase()));
  ok('et le remplaçant hérite du SLOT : il est dans le superset, pas à côté',
    (await compter('.bloc-seance')) === 2 &&
    (await page.evaluate(() => document.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.lettre-exo').length)) === 3,
    JSON.stringify(await formeEcran()));

  // ── §5 bis — AJOUTER UN EXERCICE APRÈS UN BLOC ──────────────────────────
  await menuBloc(0);
  await entree('Ajouter un exercice après');
  await choisirCatalogue('marche');
  ok('le nouvel exercice se pose APRÈS le bloc, seul, sans rejoindre le superset',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Développé Couché (Barre)', 'Tractions', 'Planche'], ['Marche'],
      ['Squat (Barre)', 'Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));

  // ── §5.3 — LE MODE MODIFIER ─────────────────────────────────────────────
  //
  // ⚠️ AVEC UN REPOS QUI COURT, et c'est la configuration discriminante du
  // défaut relevé le 18/09 : le pied du mode et la barre de repos étaient posés
  // au MÊME `bottom`, donc superposés au pixel près. Le commentaire du code
  // jurait qu'ils ne coexistaient jamais. Ils coexistent au contraire dans le
  // cas le plus ordinaire : on valide une série, puis on remet de l'ordre.
  // Sans chronomètre armé, les deux barres ne se rencontrent pas et le banc
  // applaudirait un écran que personne n'a vu.
  const iArmee = await page.evaluate(() => {
    const toutes = Array.from(document.querySelectorAll('.ligne-serie'));
    const l = toutes.filter((x) => !x.querySelector('.ok-serie.cochee'))[0];
    if (!l) return -1;
    l.querySelector('.ok-serie').click();
    return toutes.indexOf(l);
  });
  await attendre(900);
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(700);
  const deuxBarres = await page.evaluate(() => {
    const r = document.getElementById('repos');
    const p = document.getElementById('pied-reorg');
    if (!r || r.hidden || !p || p.hidden) return { ensemble: false };
    const a = r.getBoundingClientRect(), b = p.getBoundingClientRect();
    return { ensemble: true,
             chevauche: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.top + a.height,
             basPied: Math.round(b.bottom), hautRepos: Math.round(a.top) };
  });
  ok('[46] le pied du mode et la barre de repos s’affichent ENSEMBLE',
    deuxBarres.ensemble === true, JSON.stringify(deuxBarres));
  ok('[46] …et ils s’EMPILENT, ils ne se superposent pas',
    deuxBarres.ensemble === true && deuxBarres.chevauche === false &&
    deuxBarres.basPied <= deuxBarres.hautRepos,
    JSON.stringify(deuxBarres));
  // On rend la barre de repos ET la série : la suite de la section compte les
  // séries faites, et une de plus la ferait échouer pour une raison qui n'est
  // pas la sienne. Dévalider repose exactement l'état d'avant.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#repos button'))
      .filter((x) => /Passer/.test(x.textContent))[0];
    if (b) b.click();
  });
  await attendre(400);
  await page.click('#bandeau-seance .bandeau-modifier');   // on ressort du mode
  await attendre(700);
  await page.evaluate((k) => {
    if (k < 0) return;
    const l = document.querySelectorAll('.ligne-serie')[k];
    if (l) l.querySelector('.ok-serie').click();
  }, iArmee);
  await attendre(1200);
  await page.click('#bandeau-seance .bandeau-modifier');   // et on y rentre
  await attendre(700);
  ok('Modifier replie TOUT sur une ligne par bloc',
    (await compter('.bloc-seance.replie')) === 3 &&
    (await compter('.ligne-serie')) === 0 &&
    (await compter('.replie-avancement')) === 3,
    (await compter('.bloc-seance.replie')) + ' replié(s), ' +
    (await compter('.ligne-serie')) + ' ligne(s) de saisie');
  const bornes = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.bloc-seance'));
    const g = (n, s) => n.querySelector('.geste[aria-label="' + s + '"]').disabled;
    return [g(b[0], 'Monter le bloc'), g(b[b.length - 1], 'Descendre le bloc')];
  });
  ok('les bornes sont grisées : le premier ne monte pas, le dernier ne descend pas',
    JSON.stringify(bornes) === '[true,true]', JSON.stringify(bornes));
  ok('l’avancement remplace le palier : des faits, aucune prescription',
    /2 \/ 6 séries/.test(await texte('.bloc-seance .replie-avancement')),
    (await texte('.bloc-seance .replie-avancement')).trim());

  // ⚠️ DÉPLACER UN SUPERSET ENTIER. C'est le bloc qui bouge, pas ses branches :
  // les trois exercices restent collés, dans leur ordre, et restent un superset.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[0]
      .querySelector('.geste[aria-label="Descendre le bloc"]').click();
  });
  await attendre(800);
  ok('un superset se déplace ENTIER, sans se défaire',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Marche'], ['Développé Couché (Barre)', 'Tractions', 'Planche'],
      ['Squat (Barre)', 'Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ ET LA POIGNÉE, TROISIÈME SURFACE DU §7 vicies (ch. 46). Le même
  // composant qu'à la bibliothèque et à l'éditeur ; ce qu'on mesure ici est
  // qu'il est BRANCHÉ sur la séance, et qu'un superset y voyage entier.
  ok('[46] les blocs repliés portent une poignée, et un pied apparaît',
    (await compter('.bloc-seance.replie .poignee')) === 3 &&
    (await page.evaluate(() => {
      const p = document.getElementById('pied-reorg');
      return !!p && !p.hidden;
    })) === true,
    (await compter('.bloc-seance.replie .poignee')) + ' poignée(s)');
  const formeAvantGlisse = await formeEcran();
  // ⚠️ LA COURSE SE CALCULE, ELLE NE SE DEVINE PAS. Les blocs repliés n'ont
  // PAS la même hauteur : un superset à trois branches porte trois noms, un bloc
  // seul un seul. Glisser « d'une hauteur de bloc » suffit quand on descend vers
  // un bloc plus court et rate quand on remonte vers un plus haut — mesuré : le
  // premier jet ne déplaçait rien. On vise donc le MILIEU du bloc d'au-dessus,
  // plus une marge : c'est exactement le seuil que le composant compare.
  const pgS = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance.replie');
    const p = b[2].querySelector('.poignee');
    const r = p.getBoundingClientRect();
    const mi = (n) => { const x = n.getBoundingClientRect(); return x.top + x.height / 2; };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             h: Math.ceil(mi(b[2]) - mi(b[1])) + 12 };
  });
  await page.mouse.move(pgS.x, pgS.y);
  await page.mouse.down();
  for (let d = 0; d <= pgS.h + 10; d += 8) {
    await page.mouse.move(pgS.x, pgS.y - d);
    await attendre(18);
  }
  await page.mouse.up();
  await attendre(500);
  ok('[46] glisser par la poignée remonte le bloc, en séance aussi',
    JSON.stringify(await formeEcran()) !== JSON.stringify(formeAvantGlisse) &&
    JSON.stringify((await formeEcran())[1]) === JSON.stringify(formeAvantGlisse[2]),
    JSON.stringify(formeAvantGlisse) + ' → ' + JSON.stringify(await formeEcran()));
  // On le remet où il était : la suite de ce banc attend cet ordre-là.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[1]
      .querySelector('.geste[aria-label="Descendre le bloc"]').click();
  });
  await attendre(700);
  ok('[46] …et les flèches le remettent — elles n’ont pas disparu avec le geste',
    JSON.stringify(await formeEcran()) === JSON.stringify(formeAvantGlisse),
    JSON.stringify(await formeEcran()));

  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(900);
  ok('« Terminé » rend la saisie',
    (await compter('.bloc-seance.replie')) === 0 && (await compter('.ligne-serie')) > 0 &&
    (await compter('.bloc-seance.superset')) === 2,
    (await compter('.ligne-serie')) + ' ligne(s) de saisie');

  // ── RIEN DE DESTRUCTIF EN SILENCE ───────────────────────────────────────
  await menuBloc(2);              // Squat + Curl : le Curl porte 1 série validée
  await entree('Supprimer le bloc');
  ok('supprimer un bloc qui porte du travail fait DEMANDE d’abord',
    /1 série sera effacée/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await entree('Supprimer quand même');
  ok('confirmé : le bloc part de l’écran ET de la base',
    (await compter('.bloc-seance')) === 2 &&
    setsSeance().filter((s) => s.exercise_slug === 'curl').length === 0 &&
    setsSeance().length === 2,
    JSON.stringify(rangsBase()));

  await menuBloc(0);              // Marche : rien de validé
  await entree('Supprimer l’exercice');
  ok('sans travail à perdre, aucune question : il part tout de suite',
    (await compter('.bloc-seance')) === 1 &&
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Tractions', 'Planche']]),
    JSON.stringify(await formeEcran()));

  // ── §6 — UNE SEULE QUESTION, ET LE DÉFAUT NE TOUCHE À RIEN ──────────────
  const avantFin = JSON.stringify(ROUTINE_SUPERSET.routine_exercises);
  const patchsAvant = base.patchs.length;
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  const question = await texte('#feuille-contenu');
  ok('la question de fin dit ce qui a dévié, en toutes lettres',
    /s’écarte de/.test(question) && /Tractions — ajouté/.test(question) &&
    /Curl Biceps Haltères — retiré/.test(question) && /Squat \(Barre\) — retiré/.test(question),
    question.replace(/\s+/g, ' ').slice(0, 180));
  ok('aucune charge, aucun poids dans la question',
    !/charge|poids|kg/i.test(question), 'aucun mot de charge');
  const defaut = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.choix-routine button'))
      .map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')));
  ok('le défaut est de NE PAS toucher la routine',
    JSON.stringify(defaut) === '["Garder la routine:true","Reporter sur la routine:false"]',
    JSON.stringify(defaut));

  await page.click('#feuille-contenu .principal');
  await attendre(2600);
  ok('« Garder » tenu parole : la routine est exactement celle d’avant',
    JSON.stringify(ROUTINE_SUPERSET.routine_exercises) === avantFin &&
    base.patchs.length === patchsAvant,
    (base.patchs.length - patchsAvant) + ' écriture(s) de routine');

  // ── §6 — LE REPORT, SUR UNE DÉVIATION DE STRUCTURE PURE ─────────────────
  //
  // ⚠️ COMPOSITION IDENTIQUE, ORDRE ET GROUPEMENT CHANGÉS. C'est la
  // configuration où le report est le plus exposé : les deux lignes ÉCHANGENT
  // leur rang, et `routine_exos_rang_uniq` N'EST PAS DIFFÉRÉE. Un plan naïf
  // écrirait le rang 0 sur la seconde alors que la première l'occupe encore.
  await aller('/saisie');
  await demarrerRoutine('Push');
  // ⚠️ LE NOMBRE DE SÉRIES EST UN NOMBRE DE LIGNES depuis le chantier 43.
  // `routine_exercises.series` n'existe plus dans le circuit : ce qui ne doit
  // pas bouger, c'est la STRUCTURE programmée, ligne pour ligne.
  const structureAvant = () => ROUTINE.routine_exercises.slice()
    .sort((a, b) => a.rang - b.rang)
    .map((e) => (e.routine_sets || []).length + '×' + e.exercise_slug);
  const seriesRoutineAvant = structureAvant();

  await deplacerBlocParMode(1, 'haut');
  await menuBloc(0);
  await entree('Grouper en superset');
  await page.evaluate(() => document.querySelectorAll('.bloc-seance')[1].click());
  await attendre(800);
  // Une série de plus : elle ne doit RIEN reporter (§6.3 — le nombre de séries
  // du jour n'est pas une prescription).
  await page.evaluate(() => document.querySelector('.ajout-serie button').click());
  await attendre(600);
  ok('la séance est un seul superset, dans l’ordre inverse de la routine',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Squat (Barre)']]),
    JSON.stringify(await formeEcran()));

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  const q2 = await texte('#feuille-contenu');
  ok('ordre ET groupement se rapportent, dans la MÊME question',
    /L’ordre des exercices a changé/.test(q2) &&
    /Le groupement en superset a changé/.test(q2) &&
    (q2.match(/s’écarte de/g) || []).length === 1,
    q2.replace(/\s+/g, ' ').slice(0, 160));
  ok('et la série ajoutée n’y figure pas — le nombre de séries ne se prescrit pas ici',
    !/série/.test(q2.split('s’écarte de')[1] || ''),
    (q2.split('s’écarte de')[1] || '').replace(/\s+/g, ' ').slice(0, 120));

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.choix-routine button'))
      .filter((b) => /Reporter/.test(b.textContent))[0].click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(3000);

  const routineApres = ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang);
  ok('la routine a suivi : ordre échangé, superset posé, rangs 0/1 sans collision',
    JSON.stringify(routineApres.map((e) => e.exercise_slug + '@' + e.rang + '#' + e.groupe_superset)) ===
    JSON.stringify(['dc-barre@0#1', 'squat-barre@1#1']),
    JSON.stringify(routineApres.map((e) => e.exercise_slug + '@' + e.rang + '#' + e.groupe_superset)));
  ok('[43] le nombre de LIGNES programmées n’a PAS bougé (§6.3)',
    JSON.stringify(structureAvant().slice().sort()) ===
    JSON.stringify(seriesRoutineAvant.slice().sort()),
    JSON.stringify(structureAvant()) + ' vs ' + JSON.stringify(seriesRoutineAvant));
  const champsRoutine = base.patchs.slice(patchsAvant)
    .flatMap((p) => p.champs ? Object.keys(p.champs)
      : (p.lignes || []).flatMap((l) => Object.keys(l)));
  // ⚠️ `charge_cible_kg` EST LA SEULE EXCEPTION, ET ELLE EST NOMMÉE (§7
  // quindecies.3) : une CIBLE facultative, qui ne prime jamais sur le moteur.
  // Ce qui reste interdit, c'est une charge OBSERVÉE.
  ok('aucune charge OBSERVÉE n’est partie dans la routine',
    champsRoutine.length > 0 && !champsRoutine.filter((k) => k !== 'charge_cible_kg')
      .some((k) => /charge|poids|kg|weight|rm\b/i.test(k)),
    Array.from(new Set(champsRoutine)).join(', '));

  // ── §6 — UNE LIGNE AJOUTÉE PART AVEC SON IDENTIFIANT ───────────────────
  //
  // ⚠️ C'EST CE QUI REND LE REPORT IDEMPOTENT. `routine_exercises.id` a
  // `gen_random_uuid()` en défaut : laisser la base le choisir marcherait UNE
  // fois, puis une vidange rejouée — réseau qui lâche, app relancée —
  // réinsérerait une seconde fois chaque exercice ajouté. L'app fabrique donc
  // le sien, et la ligne se retrouve au lieu de se dédoubler.
  await aller('/saisie');
  await demarrerRoutine('Push');
  const insertsAvant = base.patchs.filter((p) => p.op === 'insert').length;
  await menuBloc(0);
  await entree('Ajouter un exercice après');
  await choisirCatalogue('planche');

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  ok('un exercice ajouté en séance se rapporte comme ajouté',
    /Planche — ajouté/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 140));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.choix-routine button'))
      .filter((b) => /Reporter/.test(b.textContent))[0].click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(3000);

  const inserts = base.patchs.filter((p) => p.op === 'insert').slice(insertsAvant);
  const lignesInserees = inserts.flatMap((p) => p.lignes);
  ok('la ligne neuve part avec un identifiant fabriqué par l’app',
    lignesInserees.length === 1 && typeof lignesInserees[0].id === 'string' &&
    lignesInserees[0].id.length >= 8 && lignesInserees[0].exercise_slug === 'planche',
    JSON.stringify(lignesInserees.map((l) => l.exercise_slug + '#' + String(l.id).slice(0, 8))));
  ok('et la routine porte bien trois lignes, rangs 0/1/2',
    JSON.stringify(ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang)
      .map((e) => e.exercise_slug + '@' + e.rang)) ===
    JSON.stringify(['dc-barre@0', 'squat-barre@1', 'planche@2']),
    JSON.stringify(ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang)
      .map((e) => e.exercise_slug + '@' + e.rang)));

  console.log('\n══ 7 undecies. LES CHAUFFES EN SUPERSET, ET LES GESTES SUR UNE SÉANCE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET DONT
  // LES EXERCICES ONT UN NOMBRE INÉGAL DE CHAUFFES.
  //
  // Avec une chauffe chacun, « les chauffes forment leurs propres tours » et
  // « chaque chauffe est collée à son exercice » rendent exactement le même
  // écran. Il faut que A en ait deux et B une seule pour que le second tour de
  // chauffe existe — et ne contienne que A.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  // La i-ième rangée d'un bloc : on lui change son TYPE par la feuille.
  const passerEnChauffe = async (iBloc, iRangee) => {
    await page.evaluate(([k, r]) => {
      document.querySelectorAll('.bloc-seance')[k]
        .querySelectorAll('.ligne-serie')[r].querySelector('.no-serie').click();
    }, [iBloc, iRangee]);
    await attendre(500);
    await page.click('#feuille-contenu .feuille-menu button:nth-child(2)');   // Échauffement
    await attendre(700);   // la feuille de type se referme d'elle-même
  };

  // Le bloc 0 est le superset : A = Développé Couché (3), B = Curl (3),
  // C = Planche (2). On donne DEUX chauffes à A et UNE à B — C n'en a pas.
  // Les rangées se renumérotent à chaque changement : on reprend toujours la
  // première ligne encore en travail de l'exercice visé.
  await passerEnChauffe(0, 0);   // A1 → chauffe
  ok('une chauffe seule ouvre le bloc : elle ne reste pas collée à son tour',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'B3']),
    JSON.stringify(await etiquettes(0)));

  await passerEnChauffe(0, 2);   // B1 → chauffe  (l'ordre a bougé : A, A1, B1, …)
  await passerEnChauffe(0, 2);   // la 2e ligne de A → chauffe (A, B, A1, …)
  ok('chauffes INÉGALES : le 2e tour de chauffe ne contient que celui qui en a deux',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A', 'B', 'A', 'A1', 'B1', 'C1', 'B2', 'C2']),
    JSON.stringify(await etiquettes(0)));
  ok('et le compteur de tours ignore les chauffes',
    /tour 0\/2/.test(await superT()), (await superT()).trim());

  // Hors superset — non-régression : la chauffe reste en tête de SON exercice.
  await passerEnChauffe(1, 0);
  // Hors superset le numéro porte le TYPE (« C »), pas la lettre : il n'y a
  // pas d'alternance à nommer. C'est la règle du §3 bis.1, inchangée.
  ok('hors superset, la chauffe reste en tête de son exercice',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['W', '1']),
    JSON.stringify(await etiquettes(1)));

  // ── §7 decies — un groupe ne descend jamais à un seul exercice ──────────
  await menuExo(0, 2);                       // la Planche, 3e branche
  await entree('Supprimer l’exercice');
  ok('un superset à trois qui perd une branche en garde deux, groupées',
    (await compter('.bloc-seance.superset')) === 1 &&
    JSON.stringify((await formeEcran())[0]) ===
    JSON.stringify(['Développé Couché (Barre)', 'Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));
  await menuExo(0, 1);                       // le Curl
  await entree('Supprimer l’exercice');
  ok('tombé à un, le bloc n’est PLUS un superset — et rien n’en porte le numéro',
    (await compter('.bloc-seance.superset')) === 0 &&
    (await compter('.lettre-exo')) === 0,
    JSON.stringify(await formeEcran()));

  // On termine la séance pour avoir de quoi exercer les gestes du §7 octies.
  await validerRangee(0, 0);
  await validerRangee(0, 1);
  const idGestes = seanceCourante();
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ── §7 octies.3 — REFAIRE ───────────────────────────────────────────────
  await aller('/seance/' + idGestes);
  ok('la séance terminée porte enfin ses trois gestes',
    (await compter('#vue-detail .detail-gestes button')) === 3 &&
    /Refaire cette séance/.test(await texte('#vue-detail .detail-gestes')) &&
    !/Partager/.test(await texte('#vue-detail .detail-gestes')),
    (await texte('#vue-detail .detail-gestes')).replace(/\s+/g, ' '));

  const seancesAvant = sessions().length;
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Refaire/.test(b.textContent))[0].click();
  });
  await attendre(1600);
  ok('« Refaire » DÉMARRE une séance neuve — il ne copie rien dans l’historique',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    sessions().length === seancesAvant + 1 &&
    seanceCourante() !== idGestes,
    sessions().length + ' séance(s), en cours = ' + String(seanceCourante()).slice(0, 8));
  // ⚠️ LE POINT DU §7 octies.3 : aucune charge pré-remplie. Le moteur décide
  // des charges — même règle qu'un démarrage depuis une routine.
  const champsRefaits = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie input')).map((i) => i.value));
  ok('aucune charge, aucune rep pré-remplie',
    champsRefaits.length > 0 && champsRefaits.every((v) => v === ''),
    JSON.stringify(champsRefaits));
  ok('et rien n’est monté en base pour cette séance neuve',
    setsSeance().length === 0, setsSeance().length + ' série(s)');

  // Une séance en cours interdit d'en rouvrir une autre : l'écran n'en tient
  // qu'une, et écraser un brouillon perdrait du travail réellement commencé.
  await aller('/seance/' + idGestes);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Modifier/.test(b.textContent))[0].click();
  });
  await attendre(700);
  ok('avec une séance en cours, « Modifier » refuse et le DIT',
    /séance est en cours/i.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await fermerFeuille();

  // On abandonne la séance refaite pour libérer l'écran.
  await aller('/saisie');
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .danger');
  await attendre(1600);

  // ── §7 octies.2 — MODIFIER ──────────────────────────────────────────────
  await aller('/seance/' + idGestes);
  const avantModif = base.sessions.filter((s) => s.id === idGestes)[0];
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Modifier/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  ok('« Modifier » rouvre la séance dans la saisie, avec ses valeurs',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    (await compter('.ok-serie.cochee')) === 2,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ok-serie.cochee')) + ' validée(s)');
  // ⚠️ CE QUI EST TRANCHÉ : elle RESTE `terminee`. La repasser `en_cours` la
  // ferait sortir des totaux et du relevé pendant l'édition (§7 quinquies).
  ok('elle reste TERMINÉE pendant la correction — elle ne quitte pas l’historique',
    base.sessions.filter((s) => s.id === idGestes)[0].statut === 'terminee',
    JSON.stringify(base.sessions.map((s) => s.statut)));
  ok('et le bandeau le dit : on enregistre, on ne termine pas',
    /Enregistrer/.test(await texte('#bandeau-seance .bandeau-fin')) &&
    /Modification/.test(await texte('#bandeau-seance')),
    (await texte('#bandeau-seance')).replace(/\s+/g, ' ').slice(0, 60));

  // ⚠️ PAS `setsSeance()` ICI : il vise la séance `en_cours`, et le propre de
  // la correction est qu'il n'y en a pas — la séance reste terminée.
  const lignesGestes = () => base.sets.filter((s) => s.session_id === idGestes);
  const chargeAvant = lignesGestes().slice().sort((a, b) => a.rang - b.rang)[0].charge_kg;
  await page.evaluate(() => {
    const i = document.querySelectorAll('.ligne-serie')[0].querySelector('input');
    i.value = '137';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await attendre(400);
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(2600);
  ok('« Enregistrer » referme sur le détail, correction écrite',
    JSON.stringify(await visible()) === '["vue-detail"]' &&
    lignesGestes().some((s) => s.charge_kg === 137),
    'avant ' + chargeAvant + ' → ' + JSON.stringify(lignesGestes().map((s) => s.charge_kg)));
  ok('la fin et le début n’ont pas bougé',
    base.sessions.filter((s) => s.id === idGestes)[0].fin === avantModif.fin &&
    base.sessions.filter((s) => s.id === idGestes)[0].debut === avantModif.debut,
    'fin inchangée');

  // ── §7 octies.1 — SUPPRIMER ─────────────────────────────────────────────
  const nSeriesAvant = lignesGestes().length;
  const autresAvant = base.sets.filter((s) => s.session_id !== idGestes).length;
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Supprimer/.test(b.textContent))[0].click();
  });
  await attendre(700);
  ok('supprimer une séance DEMANDE d’abord, en comptant ce qui part',
    /Supprimer cette séance/.test(await texte('#feuille-contenu')) &&
    new RegExp(nSeriesAvant + ' série').test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 110));
  await page.click('#feuille-contenu .feuille-menu .danger');
  await attendre(2600);
  ok('confirmé : la séance part, ses séries avec, et rien d’autre n’est touché',
    base.sessions.filter((s) => s.id === idGestes).length === 0 &&
    lignesGestes().length === 0 &&
    base.sets.filter((s) => s.session_id !== idGestes).length === autresAvant,
    nSeriesAvant + ' série(s) parties · ' + autresAvant + ' intactes');
  // ⚠️ ET SANS FAIRE TABLE RASE DU MAGASIN DES SÉRIES (chantier 36).
  // Le résultat visible est le même dans les deux cas — c'est bien pour ça que
  // la mutation survivait. Ce qui diffère est la MANIÈRE, et elle seule décide
  // si une fermeture d'app au mauvais moment coûte tout l'historique.
  const magasins = await page.evaluate(() => window.__magasinsRemplaces || []);
  ok('et SANS réécrire tout le magasin des séries — `cache.js` l’interdit',
    magasins.indexOf('series') < 0 && magasins.indexOf('seances') >= 0,
    'remplacerTout appelé sur : ' + JSON.stringify(magasins));
  ok('et on revient sur la semaine, pas sur un détail vide',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  console.log('\n══ 7 duodecies. BADGE DE CHAUFFE, ESPACE DE TOUR, COMPTEUR, MENU DE CARTE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET AVEC DES
  // CHAUFFES. Sans chauffe, « le compteur compte les tours de travail » et « il
  // compte tous les tours » sont indistinguables — il n'y a que des tours de
  // travail. C'est exactement ce qui a laissé passer le défaut du compteur.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const badges = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.no-serie'))
      .map((n) => n.textContent), iBloc);
  const marques = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie'))
      .map((l) => l.classList.contains('debut-tour')), iBloc);

  // A = Développé Couché (3), B = Curl (3), C = Planche (2). Une chauffe sur A
  // et une sur B — C n'en a pas : les tours de chauffe sont donc INÉGAUX.
  await passerEnChauffe(0, 0);
  await passerEnChauffe(0, 2);
  ok('le compteur démarre à 0, et une chauffe ne le fait pas bouger',
    /tour 0\/2/.test(await superT()), (await superT()).trim());

  // ⚠️ LA COULEUR EST CALCULÉE, PAS DÉDUITE D'UNE CLASSE. Une classe posée ne
  // prouve rien si la règle CSS ne s'applique pas — c'est la leçon de la M22 du
  // chantier 27, où un liseré « présent » ne peignait rien.
  const teintes = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.no-serie');
    const lu = (n) => {
      const s = getComputedStyle(n);
      return { t: n.textContent, couleur: s.color, fond: s.backgroundColor,
               bord: s.borderTopColor, l: s.width, h: s.height };
    };
    return [lu(b[0]), lu(b[2])];     // une chauffe, une série de travail
  });
  ok('la chauffe porte la LETTRE de son exercice, pas « Ac »',
    teintes[0].t === 'A' && teintes[1].t === 'A1',
    JSON.stringify(await badges(0)));
  ok('elle se distingue par la TEINTE — couleur, fond et bordure diffèrent',
    teintes[0].couleur !== teintes[1].couleur &&
    teintes[0].fond !== teintes[1].fond &&
    teintes[0].bord !== teintes[1].bord &&
    teintes[0].couleur === 'rgb(91, 138, 196)',
    JSON.stringify(teintes[0]) + ' vs ' + JSON.stringify(teintes[1]));
  ok('et la colonne garde son rythme : même boîte, au pixel près',
    teintes[0].l === teintes[1].l && teintes[0].h === teintes[1].h,
    teintes[0].l + '×' + teintes[0].h + ' vs ' + teintes[1].l + '×' + teintes[1].h);

  // ── §7 undecies.2 — l'espace entre les tours ────────────────────────────
  ok('chaque tour ouvre sur une rangée marquée, jamais la première du bloc',
    JSON.stringify(await badges(0)) ===
      JSON.stringify(['A', 'B', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']) &&
    JSON.stringify(await marques(0)) ===
      JSON.stringify([false, false, true, false, false, true, false, false]),
    JSON.stringify(await badges(0)) + ' · ' + JSON.stringify(await marques(0)));
  // ⚠️ MESURÉ, PAS DÉDUIT D'UNE CLASSE : l'espace doit exister à l'écran.
  const ecarts = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.ligne-serie'));
    const trou = (i) => Math.round(l[i].getBoundingClientRect().top -
      l[i - 1].getBoundingClientRect().bottom);
    return { entreTours: trou(2), dansUnTour: trou(1) };
  });
  ok('l’espace est RÉEL : une dizaine de pixels entre les tours, zéro dedans',
    ecarts.entreTours >= 9 && ecarts.entreTours <= 13 && ecarts.dansUnTour === 0,
    JSON.stringify(ecarts));
  ok('et aucun texte n’a été ajouté entre les lignes',
    !/Tour\s*\d/i.test(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bloc-seance')[0]
        .querySelectorAll('.ligne-serie')).map((r) => r.textContent).join(' '))),
    'aucun libellé de tour');

  // Hors superset — non-régression : rien à séparer, rien de marqué, et un `W`.
  await passerEnChauffe(1, 0);
  ok('hors superset : un « W », et aucune rangée marquée',
    JSON.stringify(await badges(1)) === JSON.stringify(['W', '1']) &&
    JSON.stringify(await marques(1)) === JSON.stringify([false, false]),
    JSON.stringify(await badges(1)) + ' · ' + JSON.stringify(await marques(1)));

  // ── §7 undecies.3 — le compteur, sur la configuration discriminante ─────
  await validerRangee(0, 0);          // la chauffe de A
  await validerRangee(0, 1);          // la chauffe de B
  ok('les deux chauffes validées : le compteur n’a toujours pas bougé',
    /tour 0\/2/.test(await superT()), (await superT()).trim());
  await validerRangee(0, 2);          // A1
  ok('un tour entamé mais pas bouclé ne compte pas',
    /tour 0\/2/.test(await superT()), (await superT()).trim());
  await validerRangee(0, 3);          // B1
  await validerRangee(0, 4);          // C1 — le tour 1 est complet
  ok('le premier tour de travail bouclé : 1/2',
    /tour 1\/2/.test(await superT()), (await superT()).trim());

  // ── §7 octies — LE MENU SUR LA CARTE DE SÉANCE ──────────────────────────
  const idCarte = seanceCourante();
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  await aller('/');
  ok('la carte de séance porte un menu, sans qu’on l’ouvre',
    (await compter('.seance-enveloppe .menu-pts')) > 0,
    (await compter('.seance-enveloppe .menu-pts')) + ' menu(s) sur ' +
    (await compter('.seance')) + ' carte(s)');

  const ouvrirMenuCarte = async () => {
    await page.evaluate((id) => {
      const env = Array.from(document.querySelectorAll('.seance-enveloppe'))
        .filter((e) => e.querySelector('.seance').textContent.indexOf(id) >= 0)[0] ||
        document.querySelectorAll('.seance-enveloppe')[0];
      env.querySelector('.menu-pts').click();
    }, '');
    await attendre(700);
  };
  await ouvrirMenuCarte();
  ok('il propose les TROIS gestes du détail, et pas « Partager »',
    JSON.stringify(await entreesFeuille()) ===
    JSON.stringify(['Refaire cette séance', 'Modifier', 'Supprimer']),
    JSON.stringify(await entreesFeuille()));
  ok('et on n’a pas quitté la liste pour autant',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  const avantSup = base.sessions.length;
  await entree('Supprimer');
  ok('« Supprimer » demande d’abord, depuis la liste comme depuis le détail',
    /Supprimer cette séance/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await page.click('#feuille-contenu .feuille-menu .danger');
  await attendre(2600);
  ok('confirmé : la séance part, sans jamais avoir été ouverte',
    base.sessions.length === avantSup - 1 &&
    JSON.stringify(await visible()) === '["vue-liste"]',
    avantSup + ' → ' + base.sessions.length + ' séance(s)');

  console.log('\n══ 7 terdecies. L’IDENTIFIANT MANQUANT, ET LA FILE BLOQUÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : AU MOINS UNE SÉRIE
  // AJOUTÉE À LA MAIN, et un serveur qui applique le `NOT NULL` de `sets.id`
  // (`verifierSet`, ajouté par ce chantier). Sans la première, tous les
  // identifiants viennent de `creer({idSerie: uuid})` et sont réels. Sans le
  // second, les lignes nulles s'écrasent les unes sur les autres et le banc
  // applaudit une séance amputée. Il faut les deux — c'est ce qui a laissé le
  // défaut traverser onze chantiers.

  const seanceVide = async () => {
    await aller('/saisie');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .filter((x) => /séance vide/i.test(x.textContent))[0];
      b.click();
    });
    await attendre(900);
  };
  const ajouterExoSeance = async (q) => {
    await page.click('#btn-ajouter-exo-seance');
    await attendre(300);
    await choisirCatalogue(q);
  };
  // ⚠️ 49-C (MOTEUR §9.13, 26/09/2026) — HORS ROUTINE, UN EXERCICE AJOUTÉ
  // ARRIVE AVEC SES SÉRIES DE DÉPART : l'habitude, sinon l'intention (3 en
  // Progresser, 2 en Entretenir). Avant, il arrivait avec UNE ligne. Les
  // sections qui construisent une forme précise à partir de cette ligne
  // unique (« + Série » × k, puis retypage) la retrouvent ici, EXPLICITEMENT :
  // on retire les dernières lignes jusqu'à `n`. Ça ne vaut que lorsque
  // l'exercice ajouté est le DERNIER de la séance — c'est le cas partout où
  // on l'appelle.
  const reduireA = async (n) => {
    while ((await compter('.ligne-serie')) > n) {
      await page.evaluate(() => {
        const nos = document.querySelectorAll('.ligne-serie .no-serie');
        nos[nos.length - 1].click();
      });
      await attendre(500);
      await page.click('#feuille-contenu .feuille-menu button.danger');
      await attendre(700);
    }
  };
  const plusSerie = async (iBloc) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.ajout-serie')[k].querySelector('button').click();
    }, iBloc);
    await attendre(300);
  };
  const validerToutes = async () => {
    const n = await compter('.ligne-serie');
    for (let i = 0; i < n; i++) {
      const l = (await page.$$('.ligne-serie'))[i];
      await l.$eval('.ok-serie', (b) => b.click());
      await attendre(200);   // rapprochées, comme un pouce sur l'appareil
    }
    await attendre(2600);
    return n;
  };
  const seriesDe = (id) => base.sets.filter((x) => x.session_id === id).length;
  const enCoursId = () => (sessions().filter((x) => x.statut === 'en_cours')[0] || {}).id;
  const terminer = async () => {
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(600);
    await page.click('#feuille-contenu .principal');
    await attendre(2600);
  };
  // ⚠️ ABANDONNER N'EST PAS TERMINER, ET C'EST TOUT L'INTÉRÊT (§7 octodecies).
  // « Terminer » fait entrer la séance dans l'historique : elle devient alors
  // LA FOIS D'AVANT de son exercice, et devance le décor que la section vient
  // de poser. « Abandonner » la supprime — l'antécédent reste l'antécédent.
  const abandonner = async () => {
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(600);
    await page.click('#feuille-contenu .danger');
    await attendre(1600);
  };
  const onglet = async (vue) => {
    await page.click('.onglet[data-vue="' + vue + '"]');
    await attendre(900);
  };
  // La bascule d'intention, par l'écran : le mémo des consignes se cle dessus
  // (`cleConsignes`), et l'écrire en base à la main ne le ferait pas bouger.
  const choisirIntention = async (cle) => {
    await onglet('profil');
    await page.click('.p-seg button[data-cle="' + cle + '"]');
    await attendre(1200);   // l'écriture locale, puis l'aller-retour serveur
  };

  // ── 8. L'ajout d'exercice se pose à la FIN, pas en tête ────────────────
  const repereVide = base.journal.length;
  await seanceVide();
  ok('une séance vide s’ouvre, sans aucun exercice',
    JSON.stringify(await visible()) === '["vue-seance"]' && (await compter('.ligne-serie')) === 0,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ligne-serie')) + ' ligne(s)');

  await ajouterExoSeance('Tractions');
  await ajouterExoSeance('Planche');
  // ⚠️ LE DÉFAUT : `addEventListener('click', ouvrirCatalogue)` passait le
  // MouseEvent comme `apres`, `Math.min(n, MouseEvent)` valait `NaN`, et
  // `splice(NaN, …)` insérait à l'index 0 — l'ordre s'inversait.
  ok('les exercices se posent dans l’ordre d’ajout, le second APRÈS le premier',
    JSON.stringify(await formeEcran()) === '[["Tractions"],["Planche"]]',
    JSON.stringify(await formeEcran()));

  // ── 4. Séance vide, six séries ajoutées à la main → les six arrivent ───
  // ⚠️ LA FORME DE DÉPART SE POSE, ELLE NE SE SUPPOSE PAS (49-U13). Hors
  // routine, un exercice arrive avec les séries de travail de SA DERNIÈRE
  // séance (49-C) : une ligne chacun seulement si l'historique laissé par les
  // sections d'avant en dit une. Après « 7 octies » (deux Planche dans le
  // superset), la Planche en arrive avec DEUX, et le banc comptait 7 lignes
  // au lieu de 6 — prouvé sur `main`, sans 49-U13, par
  // `--sections 7-septies,7-octies,7-terdecies`. On ramène chaque bloc à UNE
  // ligne, comme `reduireA`, mais bloc par bloc : la Planche n'est pas le
  // dernier exercice à y passer.
  const reduireBlocA = async (k, n) => {
    const dans = () => page.evaluate((i) =>
      document.querySelectorAll('.bloc-seance')[i].querySelectorAll('.ligne-serie').length, k);
    while ((await dans()) > n) {
      await page.evaluate((i) => {
        const nos = document.querySelectorAll('.bloc-seance')[i].querySelectorAll('.ligne-serie .no-serie');
        nos[nos.length - 1].click();
      }, k);
      await attendre(500);
      await page.click('#feuille-contenu .feuille-menu button.danger');
      await attendre(700);
    }
  };
  await reduireBlocA(0, 1); await reduireBlocA(1, 1);
  await plusSerie(0); await plusSerie(0);
  await plusSerie(1); await plusSerie(1);
  const idVide = enCoursId();
  const nVide = await validerToutes();
  ok('six séries à l’écran, dont quatre ajoutées à la main', nVide === 6, nVide + ' ligne(s)');
  // ⚠️ DEPUIS UN REPÈRE, pas depuis le début. Le journal est global et porte
  // les refus de toutes les sections précédentes : sans repère, cette ligne
  // parlerait d'un défaut qui n'est pas le sien.
  ok('AUCUNE ligne ne part sans identifiant : le serveur n’a rien refusé',
    !base.journal.slice(repereVide).some((j) => j.refus === '23502'),
    JSON.stringify(base.journal.slice(repereVide).filter((j) => j.op === 'refus').slice(0, 3)));
  ok('les SIX arrivent en base — c’est le cas qui en perdait quatre',
    seriesDe(idVide) === 6 && seriesDe(idVide) === nVide,
    seriesDe(idVide) + '/' + nVide + ' série(s)');

  // ── 7. Fin de séance : plus de fantôme ─────────────────────────────────
  await terminer();
  ok('la séance passe bien `terminee` — aucune séance fantôme `en_cours`',
    sessions().filter((x) => x.statut === 'en_cours').length === 0 &&
    (sessions().filter((x) => x.id === idVide)[0] || {}).statut === 'terminee',
    JSON.stringify(sessions().map((x) => x.statut)));
  ok('et ses six séries sont toujours là après la fin',
    seriesDe(idVide) === 6, seriesDe(idVide) + '/6 série(s)');

  // ── 9. L'état de synchronisation ne ment pas ───────────────────────────
  await aller('/');
  ok('file vidée : l’écran Séances peut dire « à jour »',
    !/refusé/.test(await texte('#etat-sync')), await texte('#etat-sync'));

  // ── 5. Routine + UNE seule série ajoutée → tout arrive ─────────────────
  //      C'est le cas qui montait 3 séries sur 7.
  await aller('/saisie');
  await demarrerRoutine('Push');
  await plusSerie(0);
  const idRoutine = enCoursId();
  const nRoutine = await validerToutes();
  // ⚠️ ON COMPARE À L'ÉCRAN, PAS À UN NOMBRE EN DUR. La routine « Push » a été
  // remaniée par les sections précédentes (report de déviation) : figer « 6 »
  // ici ferait échouer le banc pour une raison étrangère au défaut testé. Ce
  // qui compte est l'ÉGALITÉ — autant de séries en base qu'à l'écran.
  ok('une routine plus une série ajoutée à la main : au moins deux blocs',
    nRoutine >= 2, nRoutine + ' ligne(s)');
  ok('TOUTES arrivent — la série ajoutée ne bloque plus les autres',
    seriesDe(idRoutine) === nRoutine,
    seriesDe(idRoutine) + '/' + nRoutine + ' série(s)');
  await terminer();
  ok('et cette séance-là se termine aussi',
    (sessions().filter((x) => x.id === idRoutine)[0] || {}).statut === 'terminee',
    JSON.stringify(sessions().map((x) => x.statut)));

  console.log('\n══ 7 quaterdecies. CORRIGER UNE SÉANCE IMPORTÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) — les TROIS conditions,
  // et il faut les trois :
  //   1. une séance IMPORTÉE : `validee_a` NULL et `source <> 'app'` ;
  //   2. un serveur qui HONORE `select=` (sinon les colonnes manquantes de la
  //      liste de lecture reviennent quand même, et rien ne se voit) ;
  //   3. le geste « Modifier », puis « Enregistrer ».
  // Avec un `validee_a` renseigné (la fixture `SETS_PASSES`), ou avec le
  // serveur permissif d'avant ce chantier, les quatre vérifications ci-dessous
  // passent quel que soit le code.

  const sesSeries = (id) => base.sets.filter((x) => x.session_id === id);
  const ouvrirMenuDe = async (titre) => {
    await aller('/');
    await page.evaluate((t) => {
      const env = Array.from(document.querySelectorAll('.seance-enveloppe'))
        .filter((e) => e.querySelector('.seance').textContent.indexOf(t) >= 0)[0];
      env.querySelector('.menu-pts').click();
    }, titre);
    await attendre(700);
  };

  const avantCorrection = sesSeries(IMPORTEE.id).length;
  ok('la séance importée porte bien ses 6 séries, sans `validee_a`',
    avantCorrection === 6 && sesSeries(IMPORTEE.id).every((x) => x.validee_a === null),
    avantCorrection + ' série(s), validee_a : ' +
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.validee_a)));

  await ouvrirMenuDe('Séance importée');
  await entree('Modifier');
  ok('elle s’ouvre en correction',
    JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('et ses six séries sont à l’écran', (await compter('.ligne-serie')) === 6,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // ── Enregistrer SANS RIEN CHANGER ─────────────────────────────────────
  // ⚠️ EN CORRECTION, « Enregistrer » n'ouvre aucune feuille : `surTerminer`
  // route directement sur `enregistrerEdition` (app.js). Attendre une
  // confirmation ici ferait expirer le banc sur un écran qui n'existe pas.
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(2600);

  ok('enregistrée sans rien changer : AUCUNE série n’est effacée',
    sesSeries(IMPORTEE.id).length === 6,
    sesSeries(IMPORTEE.id).length + '/6 série(s) — c’est LE défaut du chantier 34');
  ok('aucune écriture n’a été refusée par le serveur',
    !base.journal.some((j) => j.op === 'refus'),
    JSON.stringify(base.journal.filter((j) => j.op === 'refus').slice(0, 3)));
  ok('`user_id` est intact sur les séries',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.user_id === 'u-banc'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.user_id)));
  ok('`ressenti` et `repos_s` ont survécu',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.ressenti === 'reste_2' && x.repos_s === 120),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => [x.ressenti, x.repos_s])));
  ok('les rangs entrelacés sont préservés',
    JSON.stringify(sesSeries(IMPORTEE.id).sort((a, b) => a.rang - b.rang)
      .map((x) => x.exercise_slug.slice(0, 5) + '@' + x.rang)) ===
    JSON.stringify(['squat@1', 'dc-ba@2', 'squat@3', 'dc-ba@4', 'curl@5', 'curl@6']),
    JSON.stringify(sesSeries(IMPORTEE.id).sort((a, b) => a.rang - b.rang)
      .map((x) => x.exercise_slug.slice(0, 5) + '@' + x.rang)));
  ok('`source` n’a pas été réécrit en `app`',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.source === 'hevy'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.source)));

  console.log('\n══ 7 quindecies. SUPPRIMER ET DÉPLACER UNE SÉANCE IMPORTÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (chantier 35, §6) — une séance IMPORTÉE sur
  // laquelle on SUPPRIME et on DÉPLACE, puis qu'on RECHARGE complètement.
  // Sans rechargement, l'écran relit son propre modèle en mémoire et montre le
  // geste qu'on vient de faire, quoi qu'il soit arrivé en base.

  const rangsImportee = () => sesSeries(IMPORTEE.id).slice()
    .sort((a, b) => a.rang - b.rang).map((s) => s.exercise_slug + '@' + s.rang);
  const ouvrirCorrection = async () => {
    await aller('/');
    await ouvrirMenuDe('Séance importée');
    await entree('Modifier');
  };
  const enregistrer = async () => {
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(2600);
  };

  // ── D2 : DÉPLACER ─────────────────────────────────────────────────────
  await ouvrirCorrection();
  ok('[D2] la séance importée s’ouvre sur deux blocs : un superset, puis le curl',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Squat (Barre)', 'Développé Couché (Barre)'], ['Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ [D3] L'ÉCRAN, PAS SEULEMENT LE MODÈLE. Une séance rouverte s'affichait
  // entièrement vierge — aucune case cochée — parce que les 28 103 séries
  // importées portent `validee_a` à NULL. On lit la classe que `rendu.js` pose
  // sur le bouton de validation, `cochee` : c'est elle qui fait le vert.
  const cochees = () => page.evaluate(() =>
    document.querySelectorAll('.ligne-serie .ok-serie.cochee').length);
  ok('[D3] les six séries s’affichent COCHÉES — la séance a bien eu lieu',
    (await cochees()) === 6, (await cochees()) + '/6 cochée(s)');

  // ⚠️ LE VERT, PAS SEULEMENT LA COCHE (survivantes M14/M18 de la campagne de
  // mutations). La rangée porte `.faite` — c'est elle qui fait la couleur — et
  // elle passe par `toursComplets`, un chemin que la coche n'emprunte pas. Deux
  // lectures différentes de « c'est fait » : les deux doivent être vraies.
  const vertes = () => page.evaluate(() =>
    document.querySelectorAll('.serie.faite').length);
  ok('[D3] et elles sont VERTES — le tour entier est reconnu comme fait',
    (await vertes()) === 6, (await vertes()) + '/6 verte(s)');

  // ⚠️ ET LE COMPTEUR DU BLOC REPLIÉ (survivante M17). « Modifier » replie les
  // blocs et affiche « x / y séries » : c'est le troisième endroit qui dit ce
  // qui a été fait, et il affichait « 0 / 4 » sur une séance entièrement faite.
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(600);
  const avancements = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.replie-avancement')).map((n) => n.textContent.trim()));
  ok('[D3] replié, le compteur du bloc compte ce qui est fait, pas « 0 / n »',
    (await avancements()).join(' · ') === '4 / 4 séries · 2 / 2 séries',
    JSON.stringify(await avancements()));
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(600);

  const avantDeplacement = JSON.stringify(rangsImportee());
  await deplacerBlocParMode(1, 'haut');
  ok('[D2] à l’écran, le curl est passé devant',
    JSON.stringify((await formeEcran())[0]) === JSON.stringify(['Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));
  await enregistrer();
  ok('[D2] LE DÉPLACEMENT S’ÉCRIT EN BASE',
    rangsImportee()[0].indexOf('curl@') === 0 && rangsImportee()[1].indexOf('curl@') === 0,
    'avant ' + avantDeplacement + ' · après ' + JSON.stringify(rangsImportee()));
  ok('[D2] et rien n’a été perdu au passage',
    sesSeries(IMPORTEE.id).length === 6,
    sesSeries(IMPORTEE.id).length + '/6 série(s)');

  // Rechargement COMPLET : le modèle en mémoire disparaît, l'écran se
  // reconstruit depuis ce qui a été LU. C'est la seule façon de voir ce qui a
  // vraiment été écrit.
  await ouvrirCorrection();
  ok('[D2] après rechargement complet, l’ordre déplacé tient',
    JSON.stringify((await formeEcran())[0]) === JSON.stringify(['Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));

  // ── D1 : SUPPRIMER ────────────────────────────────────────────────────
  // ⚠️ LE BLOC SE CHERCHE PAR SON NOM, PAS PAR SON INDEX. Tant que D2 n'est
  // pas corrigé, le curl reste en seconde position ; une fois corrigé, il est
  // en première. Un index en dur ferait échouer D1 pour la raison de D2.
  const indexBloc = async (nom) => page.evaluate((n) =>
    Array.from(document.querySelectorAll('.bloc-seance'))
      .findIndex((b) => b.textContent.indexOf(n) >= 0), nom);
  await menuBloc(await indexBloc('Curl'));
  await entree('Supprimer l’exercice');
  // ⚠️ [D3] LA QUESTION EST POSÉE, et c'est le point : avant ce chantier,
  // `compterValidees` comptait 0 sur une séance importée (tous les `validee_a`
  // à NULL) et les deux séries partaient SANS RIEN DEMANDER.
  ok('[D3] supprimer du travail importé DEMANDE d’abord, et le compte',
    /2 séries seront effacées/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 100));
  await entree('Supprimer quand même');
  ok('[D1] à l’écran, le curl est parti',
    (await compter('.bloc-seance')) === 1 && (await compter('.ligne-serie')) === 4,
    (await compter('.bloc-seance')) + ' bloc(s), ' +
    (await compter('.ligne-serie')) + ' ligne(s)');
  await enregistrer();
  ok('[D1] LA SUPPRESSION S’ÉCRIT EN BASE',
    sesSeries(IMPORTEE.id).length === 4,
    sesSeries(IMPORTEE.id).length + '/4 série(s) restantes — ' +
    JSON.stringify(rangsImportee()));
  ok('[D1] et c’est bien le curl qui est parti',
    sesSeries(IMPORTEE.id).every((x) => x.exercise_slug !== 'curl'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.exercise_slug)));
  // ⚠️ L'ÉCRAN DE DÉTAIL, TOUT DE SUITE — sans recharger. `enregistrerEdition`
  // y revient, et il lit le CACHE EN MÉMOIRE, pas le modèle. Une correction qui
  // ne purgerait que le disque montrerait encore le curl ici, une seconde après
  // l'avoir supprimé.
  ok('[D1] le détail affiché juste après ne montre plus le curl',
    !/Curl/.test(await texte('#detail-seance')),
    (await texte('#detail-seance')).replace(/\s+/g, ' ').slice(0, 90));

  await ouvrirCorrection();
  ok('[D1] après rechargement complet, la suppression tient',
    (await compter('.ligne-serie')) === 4,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // ⚠️ LA BOUCLE DE RÉSURRECTION — c'est ELLE, le défaut D1 tel qu'il se voit.
  // La suppression PART bien en base. Mais le cache de lecture ne l'apprend
  // jamais : `sets` se synchronise à l'INCRÉMENT (`created_at`/`modifie_a`), et
  // une ligne effacée ne revient par définition jamais dire qu'elle n'est plus
  // là. L'écran la remontre ; la correction suivante la RÉÉCRIT en base. Vu de
  // l'utilisateur, la suppression « ne s'est pas écrite ».
  // ⚠️ [D3] LE TAP DIT CE QUE LA CASE ANNONCE. Une case cochée se dévalide ;
  // tester `validee_a` au lieu de « part en base » ferait VALIDER une case déjà
  // cochée — le tap ferait l'inverse de ce que l'écran montre. Et sur une série
  // importée, dévalider doit la faire VRAIMENT sortir de la base.
  ok('[D3] la case annonce « Dévalider », pas « Valider »',
    (await page.evaluate(() =>
      document.querySelector('.ligne-serie .ok-serie').getAttribute('aria-label'))) === 'Dévalider',
    await page.evaluate(() =>
      document.querySelector('.ligne-serie .ok-serie').getAttribute('aria-label')));
  await page.evaluate(() => document.querySelectorAll('.ligne-serie .ok-serie')[0].click());
  await attendre(900);
  ok('[D3] tapée, elle se DÉCOCHE',
    (await cochees()) === 3, (await cochees()) + '/3 cochée(s)');
  await enregistrer();
  ok('[D3] et elle est VRAIMENT sortie de la base',
    sesSeries(IMPORTEE.id).length === 3,
    sesSeries(IMPORTEE.id).length + '/3 série(s) — ' + JSON.stringify(rangsImportee()));

  await ouvrirCorrection();
  ok('[D3] elle ne revient pas à la réouverture',
    (await compter('.ligne-serie')) === 3 && (await cochees()) === 3,
    (await compter('.ligne-serie')) + ' ligne(s), ' + (await cochees()) + ' cochée(s)');
  await enregistrer();
  ok('[D1] et une correction de plus ne ressuscite rien',
    sesSeries(IMPORTEE.id).length === 3,
    sesSeries(IMPORTEE.id).length + '/3 série(s) — ' + JSON.stringify(rangsImportee()));

  console.log('\n══ 7 sexdecies. TROIS CHEMINS VERS UNE FILE BLOQUÉE ══');
  //
  // Le point commun des trois : une valeur que la base refuse avec un code
  // DÉFINITIF. L'entrée devient la tête de file, `prochaine()` s'arrête dessus,
  // et tout ce qui suit ne monte plus JAMAIS.
  //
  // ⚠️ CE BANC NE POUVAIT PAS LES VOIR AVANT CE CHANTIER. Il ne vérifiait
  // aucun CHECK de `routine_exercises` — alors que c'est ICI que passe le
  // report de fin de séance — ni la plage `int4` de `reps` et `duree_s`. Les
  // deux manques ont été comblés dans le serveur de papier, plus haut.

  const refusDepuis = (n) => base.journal.filter((j, i) => i >= n && j.op === 'refus');
  const glisserPourSupprimer = async (i) => {
    const l = await ligne(i);
    await l.scrollIntoViewIfNeeded();
    await attendre(200);
    const b = await l.boundingBox();
    await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2);
    await page.mouse.down();
    for (let d = 0; d <= 110; d += 14) {
      await page.mouse.move(b.x + b.width - 40 - d, b.y + b.height / 2);
      await attendre(30);
    }
    await page.mouse.up();
    await attendre(700);
  };

  // ── D5 — LA CONFIGURATION DISCRIMINANTE ────────────────────────────────
  //
  // Une DÉVIATION QUI VIDE UN EXERCICE AJOUTÉ. C'est le seul geste qui produit
  // `series: 0`, et il passe par le REPORT, qui n'appelle jamais
  // `Routines.valider()`. Un report avec des valeurs normales ne distingue pas
  // « borné » de « non borné ».
  const repereD5 = base.journal.length;
  await aller('/saisie');
  await demarrerRoutine('Push');
  await saisirSerie(0, 100, 5);
  const avantAjout = await compter('.ligne-serie');
  // 49-C (§9.13) — l'attendu du pré-remplissage, par la MÊME fonction pure que
  // l'app, sur la même base : les tractions n'ont pas de consigne (mesure en
  // reps), donc l'habitude = les séries de travail de leur dernière séance,
  // faute de quoi l'intention.
  const departTractions = (() => {
    // 49-U6 — la règle vit dans le plan (`THPlan.seriesDeDepart`), qui lit la
    // consigne lui-même ; il s'appuie sur `THSeance` (le type d'une série).
    require(path.join(R, 'v2/js/seance.js'));
    const PlanD5 = require(path.join(R, 'v2/js/plan.js'));
    const avecTr = base.sessions.filter((x) => x.statut === 'terminee' &&
      base.sets.some((y) => y.session_id === x.id && y.exercise_slug === 'tractions'))
      .sort((a, b) => Date.parse(b.debut) - Date.parse(a.debut))[0];
    const prec = avecTr ? { series: base.sets.filter((y) => y.session_id === avecTr.id &&
      y.exercise_slug === 'tractions').map((y) => ({ type_serie: y.type_serie })) } : null;
    return PlanD5.seriesDeDepart(null, prec, base.profiles[0].intention);
  })();
  await ajouterExoSeance('Tractions');
  const avantVidage = await compter('.ligne-serie');
  ok('[D5] l’exercice ajouté arrive avec SES SÉRIES DE DÉPART (49-C : l’habitude, sinon l’intention)',
    avantVidage === avantAjout + departTractions && departTractions >= 1 &&
    /Tractions/.test(await texte('#vue-seance')),
    avantAjout + ' → ' + avantVidage + ' ligne(s), attendu +' + departTractions);

  // ⚠️ PAR LE MENU DU NUMÉRO, pas par le glissement. `rendu.js` le dit :
  // « il n'est JAMAIS le seul chemin : le menu du numéro porte Supprimer ».
  // Au banc, le glissement synthétique est le geste le plus fragile du projet ;
  // ce qu'on éprouve ici est la BORNE du report, pas la reconnaissance du geste.
  // 49-C : l'exercice arrive avec plusieurs séries — on les retire TOUTES,
  // la configuration discriminante reste « un exercice ajouté puis vidé ».
  for (let k = 0; k < avantVidage - avantAjout; k++) {
    await page.evaluate(() => {
      const nos = document.querySelectorAll('.ligne-serie .no-serie');
      nos[nos.length - 1].click();
    });
    await attendre(600);
    await page.click('#feuille-contenu .feuille-menu button.danger');
    await attendre(900);
  }
  ok('[D5] ses séries sont supprimées — l’exercice reste, VIDE',
    (await compter('.ligne-serie')) === avantAjout &&
    /Tractions/.test(await texte('#vue-seance')),
    (await compter('.ligne-serie')) + ' ligne(s), Tractions présent : ' +
    /Tractions/.test(await texte('#vue-seance')));

  // Terminer EN REPORTANT sur la routine : c'est le report qui pose l'entrée.
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  ok('[D5] la déviation est annoncée, donc la question est posée',
    /s’écarte/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .choix-routine button'))
      .filter((x) => /Reporter/.test(x.textContent))[0];
    b.click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  ok('[D5] AUCUNE écriture n’est refusée — c’était `23514`, définitif',
    refusDepuis(repereD5).length === 0,
    JSON.stringify(refusDepuis(repereD5).slice(0, 3)));
  // ⚠️ LE DÉFAUT D5 A DISPARU PAR CONSTRUCTION AU CHANTIER 43, et le banc le
  // VÉRIFIE plutôt que de le supposer. Il portait sur `series: 0`, refusé par
  // `routine_exos_series_bornees` avec un 23514 DÉFINITIF. La colonne n'est
  // plus écrite, et `routine_sets` n'impose aucun minimum de lignes : un
  // exercice vidé s'écrit pour ce qu'il est, zéro ligne.
  const ligneTractions = ROUTINE.routine_exercises.filter((e) => e.exercise_slug === 'tractions')[0];
  // ⚠️ ZÉRO LIGNE, ET C'EST LE RÉSULTAT ATTENDU — pas un défaut d'écriture.
  //
  // Le scénario VIDE l'exercice ajouté : c'est tout son objet. Ce que la base
  // reçoit est donc une ligne de `routine_exercises` sans aucune série
  // programmée, ce que `routine_sets` accepte (aucune borne de nombre de
  // lignes). Avant le chantier 43, le même geste envoyait `series: 0` et
  // récoltait un 23514 DÉFINITIF qui bloquait la file pour toujours.
  //
  // ⚠️ UNE PREMIÈRE RÉDACTION DE CE TEST EXIGEAIT `length > 0` : elle est
  // tombée ici, et elle avait tort. La leçon vaut dans l'autre sens aussi —
  // « tous les rangs sont >= 1 » est VRAI SUR UNE LISTE VIDE, donc ne prouve
  // rien tout seul. On énonce donc le compte attendu, explicitement.
  const setsTractions = (ligneTractions && ligneTractions.routine_sets) || [];
  ok('[D5] la ligne arrive, VIDÉE — zéro série programmée, et la base l’accepte',
    !!ligneTractions && ligneTractions.series === undefined &&
    setsTractions.length === 0,
    ligneTractions ? setsTractions.length + ' ligne(s) programmée(s)' : 'ligne absente');
  // Et l'écriture des séries, elle, se mesure sur un exercice NON vidé : celui
  // de la routine, qui garde exactement ce qu'il avait.
  const setsSquat = (ROUTINE.routine_exercises
    .filter((e) => e.exercise_slug === 'squat-barre')[0] || {}).routine_sets || [];
  ok('[43] et l’exercice non vidé garde ses lignes, rangs >= 1 et user_id posé',
    setsSquat.length > 0 && setsSquat.every((x) => x.rang >= 1),
    setsSquat.length + ' ligne(s), rangs ' + JSON.stringify(setsSquat.map((x) => x.rang)));
  ok('[D5] et la file n’est pas bloquée : l’état ne dit ni « refusé » ni « échec »',
    !/refusé|échec/i.test(await texte('#etat-sync')),
    (await texte('#etat-sync')) || '(vide)');

  // ── D6 — UN NOMBRE HORS `int4` ─────────────────────────────────────────
  const repereD6 = base.journal.length;
  await seanceVide();
  await ajouterExoSeance('Tractions');
  // ⚠️ « Tractions » se mesure en REPS : sa grille n'a qu'UN champ. `saisirSerie`
  // en attend deux — ici on tape dans le seul qui existe.
  await page.evaluate(async (v) => {
    const l = document.querySelector('.ligne-serie');
    const i = l.querySelector('input');
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, '99999999999');
  await attendre(300);
  await page.evaluate(() => document.querySelector('.ligne-serie .ok-serie').click());
  await attendre(1800);
  ok('[D6] AUCUN refus — c’était `22003`, puis `22P02` au-delà de 1e21',
    refusDepuis(repereD6).length === 0,
    JSON.stringify(refusDepuis(repereD6).slice(0, 3)));
  const repsMontees = base.sets.filter((x) => x.session_id === enCoursId()).map((x) => x.reps);
  ok('[D6] et ce qui monte tient dans `int4`',
    repsMontees.length > 0 && repsMontees.every((r) => r === null || Math.abs(r) <= 2147483647),
    JSON.stringify(repsMontees));
  await terminer();

  // ── D7 — LA SÉANCE `en_cours` RESTÉE EN BASE ───────────────────────────
  //
  // `sessions_une_seule_en_cours` est UNIQUE sur (user_id) WHERE
  // statut='en_cours', et NON différable : démarrer la suivante répondait
  // `23505`, code définitif.
  const FANTOME = {
    id: 'sess-fantome', user_id: 'u-banc', titre: 'Restée ouverte',
    debut: JOURS[4].toISOString(), fin: null,
    statut: 'en_cours', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: JOURS[4].toISOString()
  };
  base.sessions.push(Object.assign({}, FANTOME));
  base.sets.push({
    id: 'set-fantome-1', session_id: FANTOME.id, user_id: 'u-banc',
    exercise_slug: 'squat-barre', charge_kg: 90, reps: 5, duree_s: null,
    distance_m: null, type_serie: 'travail', rang: 1, groupe_superset: null,
    validee_a: FANTOME.debut, rpe: null, ressenti: null, repos_s: null,
    note: null, source: 'app', created_at: FANTOME.debut, modifie_a: null
  });

  // ⚠️ SANS BROUILLON LOCAL → ON LA REPREND. Elle peut porter des séries
  // validées ; les jeter serait la perte que tout ce projet s'interdit.
  const repereD7 = base.journal.length;
  await aller('/');
  await attendre(1500);
  // G2 (49-17) — A' : la série arrive validée, sans pari. Personne ne l'écrit
  // après coup.
  ok('[A’] une série validée hors de l’app n’est JAMAIS pariée après coup',
    !base.predictions.some((l) => l.set_observe === 'set-fantome-1' ||
      (l.fondement && l.fondement.seance === FANTOME.id)),
    JSON.stringify(base.predictions.filter((l) => l.fondement && l.fondement.seance === FANTOME.id)));
  ok('[D7] la séance restée ouverte est REPRISE, avec sa série',
    (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut === 'en_cours' &&
    (await page.evaluate(() => !document.getElementById('vue-seance').hidden ||
      !!document.querySelector('#bandeau-seance'))),
    'statut=' + (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut);
  await aller('/saisie');
  ok('[D7] et l’app ne propose pas d’en démarrer une seconde en silence',
    base.sessions.filter((x) => x.statut === 'en_cours').length === 1,
    base.sessions.filter((x) => x.statut === 'en_cours').length + ' séance(s) en_cours');
  ok('[D7] aucun `23505` : rien n’a été refusé',
    refusDepuis(repereD7).length === 0,
    JSON.stringify(refusDepuis(repereD7).slice(0, 3)));

  // ⚠️ AVEC UN BROUILLON LOCAL → ON REFERME LA DISTANTE. Les deux ne peuvent
  // pas coexister, et c'est le brouillon local que l'utilisateur a sous les yeux.
  const SECONDE = Object.assign({}, FANTOME, { id: 'sess-fantome-2', titre: 'Autre appareil' });
  base.sessions.push(SECONDE);
  const repereD7b = base.journal.length;
  await aller('/');
  await attendre(1800);
  ok('[D7] une seconde séance ouverte côté serveur est REFERMÉE, pas supprimée',
    (base.sessions.filter((x) => x.id === SECONDE.id)[0] || {}).statut === 'terminee' &&
    base.sessions.some((x) => x.id === SECONDE.id),
    'statut=' + (base.sessions.filter((x) => x.id === SECONDE.id)[0] || {}).statut);
  ok('[D7] le brouillon local, lui, reste en cours',
    (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut === 'en_cours',
    'statut=' + (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut);
  ok('[D7] et sa série n’a pas bougé',
    base.sets.filter((x) => x.session_id === FANTOME.id).length === 1,
    base.sets.filter((x) => x.session_id === FANTOME.id).length + ' série(s)');
  ok('[D7] toujours aucun refus', refusDepuis(repereD7b).length === 0,
    JSON.stringify(refusDepuis(repereD7b).slice(0, 3)));

  console.log('\n══ 7 septdecies. RÉPARER UNE FILE DÉJÀ BLOQUÉE ══');
  //
  // L'APPAREIL NE SE RÉPARE PAS TOUT SEUL. Borner à la saisie (chantier 36)
  // n'a aucun effet sur ce qui est DÉJÀ sur le disque, marqué définitif.
  //
  // CONFIGURATION DISCRIMINANTE : DEUX entrées bloquées, dont UNE SEULE
  // réparable. Avec une entrée unique, « réparer ce qui est réparable » et
  // « tout débloquer » donnent exactement le même écran.

  const SESS_BLOQ = {
    id: 'sess-bloquee', user_id: 'u-banc', titre: 'Bloquée depuis des jours',
    debut: JOURS[5].toISOString(),
    fin: finDe(JOURS[5]).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: JOURS[5].toISOString()
  };
  base.sessions.push(Object.assign({}, SESS_BLOQ));

  // On écrit la file bloquée SUR LE DISQUE, telle qu'une version d'avant le
  // chantier 36 l'aurait laissée — puis on recharge. C'est le seul banc fidèle :
  // une file posée en mémoire serait reposée par le geste, pas relue.
  const repereRep = base.journal.length;
  await page.evaluate(async ([sid, debut]) => {
    await window.THCache.ecrireAttente([
      { cle: 'sets:' + sid, seq: 1, table: 'sets', op: 'remplacer', id: sid,
        donnees: [{
          id: 'set-bloq-1', session_id: sid, user_id: 'u-banc',
          exercise_slug: 'squat-barre', charge_kg: 100, reps: 99999999999,
          duree_s: null, distance_m: null, type_serie: 'travail', rang: 1,
          groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
          repos_s: null, note: null, source: 'app'
        }],
        version: 1, essais: 1, creation: false, posee_a: null,
        bloquee: { code: '22003', message: 'reps hors int4' } },
      { cle: 'sets:sess-rls', seq: 2, table: 'sets', op: 'remplacer', id: 'sess-rls',
        donnees: [{ id: 'set-rls-1', session_id: 'sess-rls', reps: 5 }],
        version: 1, essais: 1, creation: false, posee_a: null,
        bloquee: { code: '42501', message: 'row-level security' } }
    ]);
  }, [SESS_BLOQ.id, SESS_BLOQ.debut]);

  const enFile = () => page.evaluate(async () => {
    const f = await window.THCache.lireAttente();
    return f.map((e) => e.cle + (e.bloquee ? ':bloquée' : ':libre'));
  });
  ok('[R] la file est bien bloquée sur le disque avant le rechargement',
    JSON.stringify(await enFile()) ===
      JSON.stringify(['sets:sess-bloquee:bloquée', 'sets:sess-rls:bloquée']),
    JSON.stringify(await enFile()));

  await aller('/');
  await attendre(2000);

  ok('[R] LA SÉANCE BLOQUÉE DEPUIS DES JOURS REMONTE ENFIN',
    base.sets.filter((x) => x.session_id === SESS_BLOQ.id).length === 1,
    base.sets.filter((x) => x.session_id === SESS_BLOQ.id).length + ' série(s) montée(s)');
  const monteeRep = base.sets.filter((x) => x.session_id === SESS_BLOQ.id)[0];
  ok('[R] et ce qui monte est BORNÉ — la charge utile a été réparée, pas rejouée',
    !!monteeRep && monteeRep.reps > 0 && monteeRep.reps <= 2147483647,
    monteeRep ? 'reps=' + monteeRep.reps : 'rien');
  ok('[R] aucun refus du serveur : la réparation a produit une ligne acceptable',
    base.journal.filter((j, i) => i >= repereRep && j.op === 'refus').length === 0,
    JSON.stringify(base.journal.filter((j, i) => i >= repereRep && j.op === 'refus').slice(0, 3)));

  // ⚠️ ET L'IRRÉPARABLE RESTE BLOQUÉE, SANS CONDAMNER LA FILE. Pas de
  // déblocage en masse : une entrée RLS le resterait, et la débloquer masquerait
  // un défaut réel derrière une tentative qui échouerait à l'identique.
  ok('[R] l’entrée irréparable reste en file ET marquée — elle n’est pas jetée',
    (await enFile()).indexOf('sets:sess-rls:bloquée') >= 0,
    JSON.stringify(await enFile()));
  ok('[R] mais elle n’a plus empêché la réparable de partir',
    (await enFile()).indexOf('sets:sess-bloquee:bloquée') < 0,
    JSON.stringify(await enFile()));
  ok('[R] et l’état ne dit pas « À jour » — il reste une entrée refusée',
    !/À jour/.test(await texte('#etat-sync')) && /refusé/.test(await texte('#etat-sync')),
    (await texte('#etat-sync')) || '(vide)');

  // On rend la file propre : la section suivante parle d'autre chose.
  await page.evaluate(async () => { await window.THCache.ecrireAttente([]); });
  await aller('/');
  await attendre(1200);
  ok('[R] file vidée, l’app redémarre sans rien réparer ni rien casser',
    JSON.stringify(await visible()) === '["vue-liste"]' &&
    JSON.stringify(await enFile()) === '[]',
    JSON.stringify(await visible()) + ' · ' + JSON.stringify(await enFile()));

  console.log('\n══ 7 octodecies. LE FANTÔME S’ALIGNE PAR TYPE ══');
  //
  // CONFIGURATION DISCRIMINANTE : une séance précédente AVEC des chauffes, et
  // une séance d'aujourd'hui qui en a MOINS. Avec le même nombre des deux
  // côtés, aligner par indice et aligner par type donnent le même fantôme.
  //
  // Ce que seul ce banc peut prouver : `validerSerie` COMMET la valeur du
  // fantôme (§3 bis.3 — « on valide sans rien taper quand c'est juste »). Le
  // test unitaire montre le bon fantôme ; celui-ci montre la bonne ligne EN BASE.

  // ⚠️ DATÉE UNE SECONDE AVANT MAINTENANT — corrigé le 20/09/2026 (48b-5b-4),
  // exactement comme `AVANT_DC` au §7 unvicies, et pour la même raison.
  //
  // Elle était datée `LUNDI + 6 j`, dimanche 08:00. Un jour de semaine, cette
  // date est DANS LE FUTUR : la séance devançait tout ce que la campagne crée,
  // et le moteur l'ignorait (il ne lit jamais l'avenir, MOTEUR §9.12). Les deux
  // effets se compensaient par accident. Un dimanche matin elle repasse dans le
  // passé, l'ordre s'inverse et le moteur se met à parler : quatre
  // vérifications tombaient, sans qu'aucun code ait changé (mesuré sur `main`
  // le 20/09). Un banc qui dépend du jour de la semaine ne prouve rien.
  // (L'ancre elle-même a été refaite le 21/09 : voir `decor-dates.js`.)
  //
  // Ce que la section teste est LA CASCADE D'AVANT LE MOTEUR — le fantôme et la
  // colonne par type, chantiers 38 et 39. Elle tourne donc en ENTRETENIR, où le
  // moteur se tait PAR RÈGLE et non par accident de calendrier, et le décor est
  // dans le passé comme une vraie séance. Les attendus ne changent pas.
  const debutRowing = ilYa(1000);
  const AVANT_ROWING = {
    id: 'sess-rowing', user_id: 'u-banc', titre: 'Dos — la fois d’avant',
    debut: debutRowing.toISOString(),
    fin: finDe(debutRowing).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: debutRowing.toISOString()
  };
  base.sessions.push(Object.assign({}, AVANT_ROWING));
  // `40(W) · 70(W) · 120 · 120 · 120` — exactement le cas de l'audit.
  [[1, 40, 10, 'echauffement'], [2, 70, 5, 'echauffement'],
   [3, 120, 5, 'travail'], [4, 120, 5, 'travail'], [5, 120, 4, 'travail']
  ].forEach(([rang, kg, reps, type]) => {
    base.sets.push({
      id: 'set-row-' + rang, session_id: AVANT_ROWING.id, user_id: 'u-banc',
      exercise_slug: 'rowing-barre', charge_kg: kg, reps: reps, duree_s: null,
      distance_m: null, type_serie: type, rang: rang, groupe_superset: null,
      validee_a: AVANT_ROWING.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_ROWING.debut, modifie_a: null
    });
  });
  // ⚠️ ET UN ANTÉCÉDENT POUR LES TRACTIONS, dans la MÊME séance (chantier 39).
  // Sans lui, la seconde branche du superset n'a rien à afficher en colonne, et
  // « chaque ligne lit les séries de SON exercice » ne se mesure pas : prendre le
  // premier exercice du bloc donnerait le même écran.
  [[6, 12, 'travail'], [7, 10, 'travail']].forEach(([rang, reps]) => {
    base.sets.push({
      id: 'set-trac-' + rang, session_id: AVANT_ROWING.id, user_id: 'u-banc',
      exercise_slug: 'tractions', charge_kg: null, reps: reps, duree_s: null,
      distance_m: null, type_serie: 'travail', rang: rang, groupe_superset: null,
      validee_a: AVANT_ROWING.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_ROWING.debut, modifie_a: null
    });
  });

  const repereF = base.journal.length;
  await aller('/');           // l'app synchronise la séance d'avant
  await attendre(1200);

  // ⚠️ LA SECTION D7 A LAISSÉ UNE SÉANCE EN COURS (elle en reprend une restée
  // ouverte en base, c'est tout son objet). L'écran de saisie n'en tient qu'UNE :
  // sans la refermer, « séance vide » n'existe pas et ce banc échouerait pour une
  // raison étrangère au défaut testé.
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();

  // ⚠️ LE GARDE-FOU DE LA PRÉMISSE (§7 unvicies, généralisé ici). La section
  // repose entière sur un fait : « Dos — la fois d'avant » est la DERNIÈRE
  // séance de rowing ET de tractions de la base. Si une séance la devance, le
  // banc mesure autre chose que ce qu'il annonce — il le DIT, en nommant la
  // fautive, plutôt que de tomber vingt lignes plus bas sans raison lisible.
  const devancentRowing = () => base.sessions.filter((x) => x.id !== AVANT_ROWING.id &&
    Date.parse(x.debut) >= Date.parse(AVANT_ROWING.debut) &&
    base.sets.some((y) => y.session_id === x.id &&
      (y.exercise_slug === 'rowing-barre' || y.exercise_slug === 'tractions')));
  const premisseRowing = (quand) => ok('[F] la fois d’avant est la dernière séance de rowing et de tractions — ' + quand,
    devancentRowing().length === 0 && Date.parse(AVANT_ROWING.debut) < Date.now(),
    devancentRowing().length
      ? 'datées après : ' + JSON.stringify(devancentRowing().map((x) => x.id + '@' + x.debut))
      : AVANT_ROWING.debut);
  premisseRowing('au départ');

  // ⚠️ EN ENTRETENIR, ET C'EST LA CONFIGURATION DISCRIMINANTE. Le moteur se tait
  // par RÈGLE (`consigneDExercice` rend `null`), donc le plan est vide et la
  // cascade qui s'affiche est celle d'avant lui : ce que la section mesure
  // depuis le chantier 38. En Progresser, le plan prendrait le rang 2 et
  // couvrirait ces lignes — on testerait le moteur, pas la cascade.
  //
  // ⚠️ ET AUCUNE ROUTINE ICI : les séries sont ajoutées à la main, donc
  // `reps_visees` est nul. C'est ce qui fait que les reps descendent jusqu'à la
  // dernière séance. Depuis une routine qui porte des reps visées, elles
  // passeraient DEVANT (ECRAN-SAISIE §7 septendecies.3) et « 5 » viendrait de
  // la routine, pas de l'antécédent — la section ne prouverait plus rien.
  await choisirIntention('entretien');

  await seanceVide();
  await ajouterExoSeance('Rowing');
  // 49-C (§9.13) — en Entretenir, pas de consigne : l'habitude, ce sont les
  // séries de TRAVAIL de la fois d'avant (ses chauffes ne comptent pas). Avant
  // 49-C : une seule ligne.
  const travailAvantRowing = base.sets.filter((x) => x.session_id === AVANT_ROWING.id &&
    x.exercise_slug === 'rowing-barre' && x.type_serie === 'travail').length;
  const badgesAjout = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent));
  ok('[F] l’exercice est ajouté avec SON HABITUDE — les séries de travail de la fois d’avant, aucune chauffe',
    (await compter('.ligne-serie')) === travailAvantRowing && travailAvantRowing >= 1 &&
    badgesAjout.indexOf('W') < 0,
    (await compter('.ligne-serie')) + ' ligne(s) · attendu ' + travailAvantRowing + ' · ' + JSON.stringify(badgesAjout));

  // Le fantôme s'affiche en `placeholder` du champ de charge.
  const fantomeAffiche = () => page.evaluate(() =>
    (document.querySelector('.ligne-serie .ch-serie input') || {}).placeholder || '');
  ok('[F] LE FANTÔME AFFICHÉ EST LA CHARGE DE TRAVAIL, PAS CELLE DE LA CHAUFFE',
    (await fantomeAffiche()) === '120',
    'placeholder = « ' + (await fantomeAffiche()) + ' » (40 = la chauffe, le défaut)');

  // ⚠️ ET LA COLONNE, ICI ET PAS AILLEURS (chantier 39). C'est LA configuration
  // discriminante : la séance d'avant a deux chauffes, celle-ci aucune. Par
  // indice la colonne montrerait 40 ; par type elle montre 120 — comme le
  // fantôme, qu'elle contredisait sur device après la PR #282.
  const colonneAffichee = () => page.evaluate(() =>
    (document.querySelector('.ligne-serie .prec') || {}).textContent || '');
  ok('[F] LA COLONNE « PRÉCÉDENT » AUSSI — elle ne contredit plus le fantôme',
    /120/.test(await colonneAffichee()) && !/\b40\b/.test(await colonneAffichee()),
    'colonne = « ' + (await colonneAffichee()) + ' » · fantôme « ' +
    (await fantomeAffiche()) + ' »');

  // ⚠️ LE GESTE QUE LE §3 bis.3 VEND : valider sans rien taper.
  await page.evaluate(() => document.querySelector('.ligne-serie .ok-serie').click());
  await attendre(1800);
  const idRow = (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
  const monteeF = base.sets.filter((x) => x.session_id === idRow)[0];
  ok('[F] et VALIDER SANS RIEN TAPER écrit 120 en base, pas 40',
    !!monteeF && Number(monteeF.charge_kg) === 120,
    monteeF ? 'charge_kg = ' + monteeF.charge_kg : 'aucune série montée');
  ok('[F] les reps aussi viennent de la série de travail',
    !!monteeF && Number(monteeF.reps) === 5,
    monteeF ? 'reps = ' + monteeF.reps : '—');
  ok('[F] aucun refus du serveur',
    base.journal.filter((j, i) => i >= repereF && j.op === 'refus').length === 0,
    JSON.stringify(base.journal.filter((j, i) => i >= repereF && j.op === 'refus').slice(0, 3)));

  // ⚠️ ABANDONNÉE, PAS TERMINÉE. Terminée, elle deviendrait la fois d'avant du
  // rowing pour la suite de la section — elle n'a aucune chauffe, et le
  // superset ci-dessous ne pourrait plus mesurer « la chauffe prend la
  // chauffe ». C'est exactement ce que la date dans le futur masquait.
  await abandonner();

  // ── L'ALIGNEMENT TIENT DANS UN SUPERSET (§2.5) ────────────────────────
  //
  // ⚠️ SUR UNE SÉANCE VIERGE, et c'est obligatoire : `derniereSaisie` — « ce que
  // tu viens de taper sur cet exercice » — PRIME sur l'historique, et c'est
  // juste. Sur la séance précédente, la charge validée à 120 masquait le
  // fantôme historique : le banc mesurait la bonne règle au mauvais endroit.
  //
  // ⚠️ ET LA CHAUFFE EST EN SECONDE POSITION DANS LE MODÈLE. Première, les deux
  // alignements donneraient 40 et ne prouveraient rien. En position 2 : par
  // indice elle prendrait `prec[1]` = 70, par type elle est la PREMIÈRE chauffe
  // et prend 40.
  await seanceVide();
  await ajouterExoSeance('Rowing');
  await reduireA(1);                  // 49-C : la forme de la section part d'UNE ligne
  await plusSerie(0);
  await attendre(400);
  await page.evaluate(() => {
    const nos = document.querySelectorAll('.ligne-serie .no-serie');
    nos[nos.length - 1].click();
  });
  await attendre(600);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .filter((x) => /chauffement/i.test(x.textContent))[0].click();
  });
  await attendre(800);
  await ajouterExoSeance('Tractions');
  await reduireA(3);                  // 49-C : deux lignes de rowing, UNE de tractions
  await menuBloc(0);
  await entree('Grouper en superset');
  await attendre(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.bloc-seance'))[1];
    if (b) b.click();
  });
  await attendre(800);

  const badgesF = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent));
  ok('[F] le superset est formé, la chauffe porte la LETTRE SEULE (§2.5)',
    (await compter('.bloc-seance.superset')) === 1 &&
    (await badgesF()).indexOf('A') >= 0,
    (await compter('.bloc-seance.superset')) + ' superset · badges ' +
    JSON.stringify(await badgesF()));

  const fantomeChauffeA = () => page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent === 'A')[0];
    if (!d) return '(aucune chauffe A)';
    const i = d.querySelector('.ch-serie input');
    return i ? (i.value ? '(saisie ' + i.value + ')' : i.placeholder) : '(pas de champ)';
  });
  // ⚠️ CHAQUE BRANCHE LIT LES SÉRIES DE SON EXERCICE — MESURÉ SUR LA SECONDE
  // SÉRIE DE B. Sur la première, le rang vaut 0 et le type « travail » des deux
  // côtés : prendre la liste de A ou celle de B donne la même réponse, et
  // l'assertion ne prouverait rien. En seconde position, A porte une CHAUFFE au
  // même indice — la mauvaise liste chercherait donc une chauffe de tractions,
  // qui n'existe pas, et la colonne resterait vide.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.ajout-serie button'))
      .filter((b) => /Série B/.test(b.textContent))[0].click();
  });
  await attendre(600);
  const colonnesDeB = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => /^B/.test(x.querySelector('.no-serie').textContent))
      .map((x) => x.querySelector('.prec').textContent.trim()));
  ok('[F] dans un superset, la colonne de B lit les séries de B, pas celles de A',
    JSON.stringify(await colonnesDeB()) === JSON.stringify(['12', '10']),
    'colonnes B = ' + JSON.stringify(await colonnesDeB()));

  ok('[F] dans un superset, la chauffe prend la CHAUFFE précédente (40), pas `prec[1]` (70)',
    (await fantomeChauffeA()) === '40',
    'placeholder = « ' + (await fantomeChauffeA()) + ' » · badges ' +
    JSON.stringify(await badgesF()));

  premisseRowing('après le superset');
  await abandonner();
  // Le moteur reprend la parole : le §7 unvicies mesure le PLAN, et le §7
  // duovicies rejouera la bascule par les deux écrans.
  await choisirIntention('progresser');

  console.log('\n══ 7 unvicies. LE NIVEAU 1 DE LA CASCADE — PAR TYPE, ET S’IL DÉVIE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater), et elle demande DEUX choses à
  // la fois — c'est la quatrième fois que ce piège revient sur ce sujet :
  //
  //   · des CHAUFFES, sinon la moitié « par type » du défaut ne se voit pas ;
  //   · des charges de travail qui VARIENT (`120 · 120 · 125`), sinon la
  //     règle de déviation ne se mesure pas — tout est égal à tout.
  //
  // La fixture `AVANT_ROWING` ci-dessus ne convient pas : ses trois séries de
  // travail valent 120 · 120 · 120. On en pose donc une seconde, sur un autre
  // exercice, plutôt que de toucher à celle des chantiers 38 et 39.
  //
  // ⚠️ DES ENTIERS, PAS `122,5`. Le placeholder passe par `nombreFr`, qui rend
  // une VIRGULE, quand `fill()` écrirait un point : comparer les deux ferait
  // échouer le banc sur l'écriture du nombre et non sur la règle. `120 · 120 ·
  // 125` varie tout autant — c'est la VARIATION qui discrimine, pas la décimale.
  //
  // Ce que seul ce banc prouve : le fantôme AFFICHÉ à l'écran, après une vraie
  // validation au pouce. Le test unitaire montre la règle ; celui-ci montre que
  // le rendu la lit.
  // ⚠️ DATÉE UNE SECONDE AVANT MAINTENANT — corrigé le 20/09/2026 (48b-5b-2).
  // Elle était datée `LUNDI + 5 j` : un jour de semaine, c'est dans le futur et
  // elle gagne d'office ; un DIMANCHE, samedi 08:00 est dans le passé et sept
  // séances `dc-barre` créées par les scénarios précédents lui passent devant —
  // le fantôme montrait une séance Push à 100 kg, et trois vérifications
  // tombaient sans qu'aucun code n'ait changé. Mesuré sur `main` le 20/09.
  //
  // « La fois d'avant » doit être la plus récente quel que soit le jour, ET dans
  // le passé : depuis 48b, le moteur ne lit rien après le début de la séance
  // ouverte (MOTEUR §9.12) — une « fois d'avant » datée dans le futur serait vue
  // par le fantôme et ignorée par la consigne, deux voix pour une ligne. Le
  // premier correctif la calait « une seconde après la dernière séance de la
  // base » : un décor du §7 octodecies est daté `LUNDI + 6 j`, dimanche 08:00,
  // encore à venir à l'heure du banc — et la consigne se calculait sur la
  // séance d'avant. Une seconde avant maintenant est toujours dans le passé,
  // et après tout ce que l'app a créé pendant la campagne.
  const debutDC = ilYa(1000);
  const AVANT_DC = {
    id: 'sess-dc-rampe', user_id: 'u-banc', titre: 'Pecs — la fois d’avant',
    debut: debutDC.toISOString(),
    fin: finDe(debutDC).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: debutDC.toISOString()
  };
  base.sessions.push(Object.assign({}, AVANT_DC));
  [[1, 20, 12, 'echauffement'], [2, 60, 8, 'echauffement'],
   [3, 120, 5, 'travail'], [4, 120, 5, 'travail'], [5, 125, 4, 'travail']
  ].forEach(([rang, kg, reps, type]) => {
    base.sets.push({
      id: 'set-dc-' + rang, session_id: AVANT_DC.id, user_id: 'u-banc',
      exercise_slug: 'dc-barre', charge_kg: kg, reps: reps, duree_s: null,
      distance_m: null, type_serie: type, rang: rang, groupe_superset: null,
      validee_a: AVANT_DC.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_DC.debut, modifie_a: null
    });
  });
  await aller('/');
  await attendre(1200);
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();

  await seanceVide();
  await ajouterExoSeance('Couch');
  await reduireA(1);                  // 49-C : la forme de la section part d'UNE ligne
  await plusSerie(0); await plusSerie(0); await plusSerie(0); await plusSerie(0);
  await attendre(500);
  // Les deux premières en chauffe : on reproduit la forme de la fois d'avant.
  for (const k of [0, 1]) {
    await page.evaluate((i) => {
      document.querySelectorAll('.ligne-serie .no-serie')[i].click();
    }, k);
    await attendre(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => /chauffement/i.test(x.textContent))[0].click();
    });
    await attendre(700);
  }
  const fantomes = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie')).map((l) => {
      const i = l.querySelector('.ch-serie input');
      return i ? (i.value || i.placeholder || '') : '';
    }));

  // ⚠️ DEPUIS 48b-5b-2, LE MOTEUR PARLE AU RANG 2 DE LA CASCADE. Les chauffes
  // gardent la fois d'avant ; les séries de travail que la consigne couvre
  // proposent LE PLAN. L'attendu se calcule ici par les MÊMES modules purs que
  // l'app (`THMoteur.consigneDExercice`, `THSeance.planDe`), sur les mêmes
  // données : le banc prouve que l'écran LIT le plan, pas que le moteur calcule
  // juste — ça, 76 cas unitaires le prouvent. Un attendu en dur dépendrait de
  // tout ce que les scénarios précédents ont laissé en base pour cet exercice.
  // Dans l'ordre d'`index.html` : `moteur.js` lit `THModele` et `THPalier`
  // tardivement, sans repli — un module absent casse bruyamment, et c'est voulu.
  require(path.join(R, 'v2/js/modele.js'));
  require(path.join(R, 'v2/js/palier.js'));
  const Moteur = require(path.join(R, 'v2/js/moteur.js'));
  const SeanceM = require(path.join(R, 'v2/js/seance.js'));
  const PalierM = require(path.join(R, 'v2/js/palier.js'));
  const ProfilM = require(path.join(R, 'v2/js/profil.js'));
  const attenduMoteur = () => {
    const parSeance = {};
    base.sets.filter((x) => x.exercise_slug === 'dc-barre').forEach((x) => {
      (parSeance[x.session_id] = parSeance[x.session_id] || []).push(x);
    });
    const groupes = base.sessions.filter((x) => parSeance[x.id] && x.statut === 'terminee')
      .map((x) => ({ seance: x, series: parSeance[x.id] }));
    const etats = PalierM.etatsExercices(PalierM.seanceExercices(base.sets));
    const profil = base.profiles ? base.profiles[0] : null;
    const c = Moteur.consigneDExercice(groupes, etats['dc-barre'], new Date().toISOString(), {
      mesure: 'charge_reps', equipement: null, intention: profil && profil.intention,
      reglage: ProfilM.rythmeDe(profil), edition: false
    });
    const types = ['echauffement', 'echauffement', 'travail', 'travail', 'travail'];
    const plan = SeanceM.planDe(types.map((t) => ({ type_serie: t })), c && c.consigne);
    return { c, plan };
  };
  const { c: consigneDC, plan: planDC } = attenduMoteur();
  // Le garde-fou de la prémisse : aucune séance `dc-barre` de la base n'est
  // datée après la fois d'avant. Sinon la consigne ne se calcule pas sur elle,
  // et ce banc mesure autre chose que ce qu'il annonce — il le DIT, en nommant
  // la séance fautive, plutôt que de tomber trois lignes plus bas sans raison.
  const dcApres = base.sessions.filter((x) => x.id !== AVANT_DC.id &&
    Date.parse(x.debut) >= Date.parse(AVANT_DC.debut) &&
    base.sets.some((y) => y.session_id === x.id && y.exercise_slug === 'dc-barre'));
  ok('[G] la fois d’avant est bien la dernière séance de couché de la base, et dans le passé',
    dcApres.length === 0 && Date.parse(AVANT_DC.debut) < Date.now(),
    dcApres.length ? 'datées après : ' + JSON.stringify(dcApres.map((x) => x.id + '@' + x.debut)) : AVANT_DC.debut);
  const chargeFr = (v) => v === null || v === undefined ? null : String(v).replace('.', ',');
  // Les deux premières lignes : la fois d'avant (chauffes). Les trois autres :
  // le plan là où il propose une charge, la fois d'avant sinon.
  const attendus = ['20', '60'].concat([120, 120, 125].map((kg, j) =>
    planDC[j + 2] && planDC[j + 2].charge_kg !== null ? chargeFr(planDC[j + 2].charge_kg) : String(kg)));
  ok('[G] le moteur a une consigne sur cette séance, et elle couvre les trois séries de travail',
    !!consigneDC && consigneDC.consigne.etat !== 'silence' && planDC.slice(2).every(Boolean),
    JSON.stringify(consigneDC && { etat: consigneDC.consigne.etat, n: consigneDC.consigne.n }) + ' · plan ' + JSON.stringify(planDC));
  ok('[G] les chauffes montrent la fois d’avant, les séries de travail LE PLAN',
    JSON.stringify(await fantomes()) === JSON.stringify(attendus),
    JSON.stringify(await fantomes()) + ' vs ' + JSON.stringify(attendus));
  const entete = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.legende-exo .consigne, .legende-exo .consigne-dit')).map((e) => e.textContent));
  ok('[G] l’en-tête dit la consigne en jaune, puis sa phrase grise',
    JSON.stringify(entete) === JSON.stringify(consigneDC.libelles.jaune.concat([consigneDC.libelles.gris])),
    JSON.stringify(entete).replace(/\u00a0/g, '·'));

  // ① LE DÉFAUT DU DEVICE : taper une chauffe qui DÉVIE (25 au lieu de 20).
  // Sans le filtre par type, les trois séries de travail passeraient à 25.
  await saisirSerie(0, 25, 12);
  ok('[G] une chauffe qui dévie ne touche PAS à la rampe de travail',
    JSON.stringify((await fantomes()).slice(2)) === JSON.stringify(attendus.slice(2)),
    JSON.stringify(await fantomes()));
  ok('[G] …mais elle propage bien à la chauffe suivante',
    (await fantomes())[1] === '25', JSON.stringify(await fantomes()));

  // ② LA RÈGLE DE DÉVIATION (§7 unvicies, précisée 48b-5b-2) : valider la 1ʳᵉ
  // série de travail À CE QUE LA LIGNE PROPOSAIT — le plan — ne doit rien
  // écraser : la 3ᵉ garde sa proposition.
  await saisirSerie(2, Number(attendus[2].replace(',', '.')), 5);
  ok('[G] valider la proposition de la 1ʳᵉ laisse celle de la 3ᵉ',
    (await fantomes())[4] === attendus[4], JSON.stringify(await fantomes()) + ' vs ' + attendus[4]);

  // ③ ET UNE VRAIE DÉVIATION SE PROPAGE — à plat, jamais en décalant la rampe,
  // et par-dessus le plan : ce qu'on vient de taper reste souverain.
  await saisirSerie(3, 130, 5);
  ok('[G] 130 se propage à plat sur la suivante, pas 135 — et par-dessus le plan',
    (await fantomes())[4] === '130', JSON.stringify(await fantomes()));

  await terminer();

  console.log('\n══ 7 novodecies. UN SEUL COMPTE, ET UNE COLONNE QUI NE MENT PLUS ══');
  //
  // CONFIGURATION DISCRIMINANTE : une séance AVEC des chauffes. Sans elles,
  // « compter les séries de travail » et « compter toutes les lignes » rendent
  // le même nombre, et les cinq écrans se ressemblent.

  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();
  await seanceVide();
  await ajouterExoSeance('Rowing');
  await reduireA(1);                  // 49-C : la forme de la section part d'UNE ligne
  await plusSerie(0); await plusSerie(0); await plusSerie(0);
  await attendre(400);
  // Les DEUX premières en échauffement : 2 chauffes + 2 séries de travail.
  for (const k of [0, 1]) {
    await page.evaluate((i) => {
      document.querySelectorAll('.ligne-serie .no-serie')[i].click();
    }, k);
    await attendre(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => /chauffement/i.test(x.textContent))[0].click();
    });
    await attendre(700);
  }
  ok('[C] 2 chauffes + 2 séries de travail',
    (await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent)
    )).filter((b) => b === 'W').length === 2,
    JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent))));

  // ⚠️ LA COLONNE, SUR LA PREMIÈRE LIGNE DE TRAVAIL. L'antécédent est la séance
  // `40(W) · 70(W) · 120 · 120 · 120` du chantier 38 : par indice la colonne
  // montrerait 40, par type elle montre 120 — comme le fantôme.
  const colonneEtFantome = () => page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent !== 'W');
    const d = l[0];
    return d ? { colonne: d.querySelector('.prec').textContent.trim(),
                 fantome: d.querySelector('.ch-serie input').placeholder } : null;
  });
  const cf = await colonneEtFantome();
  ok('[C] la colonne « précédent » montre la charge de TRAVAIL, pas la chauffe',
    !!cf && /120/.test(cf.colonne),
    'colonne = « ' + (cf && cf.colonne) + ' »');
  ok('[C] et elle ne contredit plus le fantôme',
    !!cf && cf.colonne.indexOf(cf.fantome) >= 0,
    'colonne « ' + (cf && cf.colonne) + ' » · fantôme « ' + (cf && cf.fantome) + ' »');

  // La colonne d'une CHAUFFE montre une chauffe.
  const colonneChauffe = () => page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent === 'W')[0];
    return d ? d.querySelector('.prec').textContent.trim() : '';
  });
  ok('[C] sur une chauffe, elle montre une chauffe',
    /40/.test(await colonneChauffe()),
    'colonne = « ' + (await colonneChauffe()) + ' »');

  // ── LE MÊME COMPTE SUR TOUS LES ÉCRANS ────────────────────────────────
  await validerToutes();
  await attendre(1000);
  // L'identifiant se prend MAINTENANT : après « Terminer », la séance n'est plus
  // `en_cours` et son titre vaut null — la retrouver par le libellé affiché
  // chercherait une valeur que la base ne porte pas.
  const idC = enCoursId();
  const bandeau = () => texte('#bandeau-seance .bandeau-ch');
  ok('[C] le BANDEAU compte les séries de travail, pas les lignes',
    /2 séries de travail/.test(await bandeau()),
    (await bandeau()).replace(/\s+/g, ' '));

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(800);
  ok('[C] l’ÉCRAN DE FIN dit le même nombre',
    /2 séries de travail/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ⚠️ QUATRE LIGNES POUR DEUX SÉRIES DE TRAVAIL. C'est l'écart que les cinq
  // écrans confondaient — et c'est lui que l'avertissement de suppression, seul,
  // doit continuer d'annoncer.
  ok('[C] et la base porte bien 4 lignes pour 2 séries de travail',
    base.sets.filter((x) => x.session_id === idC).length === 4 &&
    base.sets.filter((x) => x.session_id === idC && x.type_serie === 'travail').length === 2,
    base.sets.filter((x) => x.session_id === idC).length + ' ligne(s), ' +
    base.sets.filter((x) => x.session_id === idC && x.type_serie === 'travail').length +
    ' de travail');

  await aller('/');
  await attendre(800);
  const carteC = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.seance-meta')).map((n) => n.textContent));
  ok('[C] la CARTE porte le qualificatif « de travail » qu’elle avait perdu',
    (await carteC()).some((t) => /série(s)? de travail/.test(t)),
    JSON.stringify(await carteC()));

  // ── UNE SORTIE N'A PAS DE SÉRIES DE TRAVAIL ───────────────────────────
  const avantSortie = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  const SORTIE = {
    id: 'sess-sortie', user_id: 'u-banc', titre: 'Marche du soir',
    debut: JOURS[3].toISOString(),
    fin: finDe(JOURS[3]).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: JOURS[3].toISOString()
  };
  base.sessions.push(Object.assign({}, SORTIE));
  [1, 2].forEach((rang) => base.sets.push({
    id: 'set-sortie-' + rang, session_id: SORTIE.id, user_id: 'u-banc',
    exercise_slug: 'marche', charge_kg: null, reps: null, duree_s: 1800,
    distance_m: 3000, type_serie: 'travail', rang: rang, groupe_superset: null,
    validee_a: SORTIE.debut, rpe: null, ressenti: null, repos_s: null,
    note: null, source: 'app', created_at: SORTIE.debut, modifie_a: null
  }));
  await aller('/');
  await attendre(1500);
  const apresSortie = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  ok('[C] UNE SORTIE N’AJOUTE AUCUNE SÉRIE DE TRAVAIL À LA SEMAINE',
    apresSortie.replace(/^\d+ séances/, '') === avantSortie.replace(/^\d+ séances/, ''),
    'avant « ' + avantSortie +' » · après « ' + apresSortie + ' »');
  ok('[C] mais elle est bien là — c’est le compte de séries qui l’ignore, pas la liste',
    /Marche du soir/.test(await texte('#liste-seances')),
    (await texte('#liste-seances')).replace(/\s+/g, ' ').slice(0, 70));

  console.log('\n══ 7 vicies. LA PAGE D’EXERCICE, ET LE COMPTE QUI DIVERGEAIT ══');
  //
  // CONFIGURATION DISCRIMINANTE (§2 quater), et il en faut trois :
  //
  //   · §1 — une séance MIXTE, musculation ET tapis, SEULE dans sa semaine.
  //     Sans sortie dedans, « filtre appliqué » et « filtre absent » donnent le
  //     même nombre ; sans l'isoler dans sa semaine, la barre additionne les
  //     vingt autres séances du banc et la comparaison ne mesure plus rien.
  //   · table par reps — un jeu où UNE ligne au moins est dominée par une autre
  //     à PLUS de reps, et une autre non.
  //   · mesures sans charge — un exercice en `temps` et un en `reps` : deux
  //     chemins différents dans `palier.js`.

  // ⚠️ DES IDENTIFIANTS EN UUID. Le routeur refuse tout le reste (`repli`), et
  // une ouverture directe sur `/seance/sess-mixte` retomberait sur la semaine —
  // le test mesurerait alors le repli, pas le détail.
  const ID_MIXTE = '40000000-0000-4000-8000-000000000014';

  // Une semaine à elle toute seule, loin de celle du banc.
  // Huit semaines avant le décor : `decor-dates.js`, contrôlé pour les sept jours.
  const L_EXO = ancreSemaineIsolee(JOURS[0]);
  const isoL = (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // Les séances de cette semaine : `jourIsole`, les autres jours de la
  // semaine de l'ancre (`decor-dates.js`). « Ancre + k jours » en sortait
  // selon le jour où le banc tourne.
  const jourExo = (rang) => jourIsole(L_EXO, rang).toISOString();

  let nExo = 0;
  const poserSeance = (id, titre, quand, lignes, note) => {
    base.sessions.push({
      id: id, user_id: 'u-banc', titre: titre, debut: quand, fin: quand,
      statut: 'terminee', note: note || null, salle: null, salle_norme: null,
      routine_id: null, source: 'app', created_at: quand
    });
    lignes.forEach((l, k) => base.sets.push(Object.assign({
      id: 'set-exo-' + (++nExo), session_id: id, user_id: 'u-banc',
      charge_kg: null, reps: null, duree_s: null, distance_m: null,
      type_serie: 'travail', rang: k + 1, groupe_superset: null,
      validee_a: quand, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: quand, modifie_a: null
    }, l)));
  };

  // ── §1 — LA SÉANCE MIXTE : 3 séries de musculation, 2 de tapis ──────────
  const kg = (charge, reps) => ({ exercise_slug: 'dc-barre', charge_kg: charge, reps: reps });
  poserSeance(ID_MIXTE, 'Quads tous terrains', jourExo(2), [
    { exercise_slug: 'dc-barre', charge_kg: 60, reps: 10, type_serie: 'echauffement' },
    kg(120, 6), kg(110, 8), kg(42.5, 14),
    { exercise_slug: 'marche', duree_s: 900, distance_m: 2000 },
    { exercise_slug: 'marche', duree_s: 900, distance_m: 2000 }
  ]);

  await aller('/semaine/' + isoL(L_EXO));
  const barreExo = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  const carteExo = (await texte('#liste-seances .seance-meta')).replace(/\s+/g, ' ').trim();
  const nBarre = (barreExo.match(/(\d+) séries? de travail/) || [])[1];
  const nCarte = (carteExo.match(/(\d+) séries? de travail/) || [])[1];
  ok('[40 §1] LA CARTE ET LA BARRE DISENT LE MÊME NOMBRE SUR UNE SÉANCE MIXTE',
    nBarre !== undefined && nBarre === nCarte,
    'barre « ' + barreExo + ' » · carte « ' + carteExo + ' »');
  ok('[40 §1] et ce nombre EXCLUT le tapis — 3, pas 5',
    nCarte === '3', 'carte « ' + carteExo + ' »');

  // ── LE RESTE DE L'HISTORIQUE DU COUCHÉ, pour la table par reps ──────────
  // 80 × 15 en dernier : c'est lui qui domine le 42,5 × 14 de la séance mixte.
  poserSeance('40000000-0000-4000-8000-000000000015', 'Pecs – Dos', jourExo(4), [kg(80, 15)], 'Dur de se réveiller');
  // Une planche et des tractions, pour les deux chemins sans charge.
  poserSeance('40000000-0000-4000-8000-000000000016', 'Gainage', jourExo(5), [
    { exercise_slug: 'planche', duree_s: 90 },
    { exercise_slug: 'tractions', reps: 12 }
  ]);

  // ── 3. LE TAP SUR UN NOM D'EXERCICE, DEPUIS LE DÉTAIL D'UNE SÉANCE ──────
  await aller('/seance/' + ID_MIXTE);
  ok('[40] le détail de la séance mixte s’ouvre', (await visible())[0] === 'vue-detail',
    JSON.stringify(await visible()));
  const nomsDetail = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.exos .nom')).map((n) => n.tagName + ':' + n.textContent));
  ok('[40] les noms d’exercices y sont des BOUTONS — inertes depuis le chantier 27',
    (await nomsDetail()).every((t) => t.indexOf('BUTTON:') === 0),
    JSON.stringify(await nomsDetail()));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.exos .nom'))
      .filter((n) => /Couché/.test(n.textContent))[0].click();
  });
  await attendre(900);
  const url = () => page.evaluate(() => location.pathname);
  ok('[40] taper le nom ouvre la page d’exercice, et l’URL la porte',
    (await visible())[0] === 'vue-exercice' && (await url()) === '/exercice/dc-barre',
    JSON.stringify(await visible()) + ' · ' + (await url()));

  // ── 7. LA TABLE PAR REPS : brut, lignes déduites grisées ────────────────
  const tableExo = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.tr-ligne')).map((l) =>
      (l.querySelector('.tr-reps') || {}).textContent + '=' +
      (l.querySelector('.tr-charge') || {}).textContent +
      (l.classList.contains('deduit') ? '(déduit)' : '') +
      (l.classList.contains('cible') ? '(cible)' : '')));
  ok('[40] la table par reps est triée par nombre de répétitions croissant',
    (await tableExo()).length >= 4 &&
    (await tableExo()).map((t) => parseInt(t, 10))
      .every((n, i, a) => i === 0 || a[i - 1] < n),
    JSON.stringify(await tableExo()));
  // ⚠️ L'ASYMÉTRIE EST LA MESURE. Le 14 reps est dominé par le 80 × 15 : il est
  // grisé ET il montre le 80 qu'on pourrait revendiquer, pas le 42,5 fait ce
  // jour-là. Le 6 reps, lui, ne l'est pas. Une table où tout serait déduit — ou
  // rien — ne prouverait rien.
  ok('[40] la ligne dominée est grisée et montre le 80 qu’on pourrait revendiquer',
    (await tableExo()).some((t) => t === '14=80(déduit)'),
    JSON.stringify(await tableExo()));
  ok('[40] et celle qui ne l’est pas garde sa charge brute et sa DATE',
    (await tableExo()).some((t) => t === '6=120') &&
    (await page.evaluate(() => Array.from(document.querySelectorAll('.tr-ligne'))
      .filter((l) => !l.classList.contains('deduit'))
      .map((l) => l.querySelector('.tr-quand').textContent))).every((t) => /\d{4}/.test(t)),
    JSON.stringify(await tableExo()) + ' · ' + JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tr-ligne')).map((l) => l.querySelector('.tr-quand').textContent))));

  // ── 4. LES DEUX SOUS-ONGLETS ONT LEUR URL ───────────────────────────────
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.sous-onglet'))
      .filter((b) => /Historique/.test(b.textContent))[0].click();
  });
  await attendre(900);
  ok('[40] l’Historique a SON URL',
    (await url()) === '/exercice/dc-barre/historique' &&
    (await compter('.exo-jour')) >= 2,
    (await url()) + ' · ' + (await compter('.exo-jour')) + ' jour(s)');
  ok('[40] et il montre les séries de chaque jour, chauffe comprise',
    (await compter('.exo-jour .serie')) >= 4 &&
    (await compter('.exo-jour .serie.hors-travail')) >= 1,
    (await compter('.exo-jour .serie')) + ' ligne(s), dont ' +
    (await compter('.exo-jour .serie.hors-travail')) + ' hors travail');
  ok('[40] la note de séance y est rendue',
    /Dur de se réveiller/.test(await texte('#page-exercice')),
    (await texte('#page-exercice')).replace(/\s+/g, ' ').slice(0, 80));

  // ⚠️ LE RECHARGEMENT DIRECT — c'est lui qui distingue une URL d'un onglet.
  await aller('/exercice/dc-barre/historique');
  ok('[40] LE RECHARGEMENT DIRECT ROUVRE L’HISTORIQUE, pas le Résumé',
    (await visible())[0] === 'vue-exercice' &&
    /Historique/.test(await texte('.sous-onglet.actif')),
    JSON.stringify(await visible()) + ' · onglet « ' + (await texte('.sous-onglet.actif')) + ' »');
  await aller('/exercice/dc-barre');
  ok('[40] et celui du Résumé rouvre le Résumé',
    /Résumé/.test(await texte('.sous-onglet.actif')),
    'onglet « ' + (await texte('.sous-onglet.actif')) + ' »');

  // ── 5. UN EXERCICE SANS CHARGE N'AFFICHE JAMAIS 0 kg ────────────────────
  for (const [slug, mot] of [['planche', 'durée'], ['tractions', 'répétitions']]) {
    await aller('/exercice/' + slug);
    const p = (await texte('#page-exercice')).replace(/\s+/g, ' ');
    ok('[40] ' + slug + ' : pas de « 0 kg », et la phrase lit la MESURE',
      (await visible())[0] === 'vue-exercice' && !/0 kg/.test(p) &&
      p.indexOf(mot) >= 0 && !/sans-charge|hors-moteur/.test(p),
      p.slice(0, 110));
  }

  // ── 6. UN EXERCICE JAMAIS FAIT : page vide propre, pas de plantage ──────
  const avantVide = erreurs.length;
  await aller('/exercice/souleve-terre');
  const pVide = (await texte('#page-exercice')).replace(/\s+/g, ' ');
  ok('[40] un exercice jamais fait rend une page, sans erreur de script',
    (await visible())[0] === 'vue-exercice' && erreurs.length === avantVide &&
    /Soulevé de Terre/.test(pVide), pVide.slice(0, 90));
  ok('[40] et il montre des tirets, pas des zéros',
    (await page.evaluate(() =>
      Array.from(document.querySelectorAll('.exo-li-v')).map((n) => n.textContent)))
      .join('|') === '—|—|—',
    JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.exo-li-v')).map((n) => n.textContent))));

  // ── §7 quater.1 — LE BANDEAU DE SÉANCE, ET « REPRENDRE » ────────────────
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();
  await seanceVide();
  await ajouterExoSeance('Développé Couché');
  ok('[40] une séance est en cours', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));
  const sansBandeau = await compter('.exo-bandeau');
  await page.evaluate(() => { document.querySelector('.exo-seance .nom-exo').click(); });
  await attendre(900);
  ok('[40] taper le nom EN SÉANCE ouvre la page — §2.8, inerte depuis le chantier 27',
    (await visible())[0] === 'vue-exercice' && (await url()) === '/exercice/dc-barre',
    JSON.stringify(await visible()) + ' · ' + (await url()));
  ok('[40] la séance reste visible en bandeau : on n’a pas l’impression de l’avoir quittée',
    sansBandeau === 0 && (await compter('.exo-bandeau')) === 1 &&
    /en cours/.test(await texte('.exo-bandeau')),
    'avant ' + sansBandeau + ' · ici ' + (await compter('.exo-bandeau')) +
    ' · « ' + (await texte('.exo-bandeau')).replace(/\s+/g, ' ') + ' »');
  await page.click('.exo-reprendre');
  await attendre(900);
  ok('[40] « Reprendre » y ramène', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));

  // Le retour REMONTE l'historique : la page s'atteint depuis trois écrans,
  // décider d'une destination en enverrait deux sur trois au mauvais endroit.
  await aller('/seance/' + ID_MIXTE);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.exos .nom'))
      .filter((n) => /Couché/.test(n.textContent))[0].click();
  });
  await attendre(900);
  await page.click('#btn-retour-exercice');
  await attendre(900);
  ok('[40] le bouton retour de la page ramène D’OÙ L’ON VIENT',
    (await visible())[0] === 'vue-detail' && (await url()) === '/seance/' + ID_MIXTE,
    JSON.stringify(await visible()) + ' · ' + (await url()));
  await terminer().catch(() => {});

  // ══ 47. LES DÉFAUTS DE L'ÉTAT DES LIEUX DU 18/09 ═════════════════════════

  console.log('\n══ 47. « MODIFIER » SUR UNE SÉANCE DONT LES SÉRIES NE SONT PAS ARRIVÉES ══');
  //
  // ⚠️ LA CONFIGURATION DISCRIMINANTE, ET ELLE EST TOUT LE SUJET : une séance
  // que le cache CONNAÎT et dont il n'a AUCUNE série. Sur une séance complète,
  // « la règle est consultée » et « elle ne l'est pas » rendent exactement le
  // même écran — c'est précisément ce qui a laissé le défaut vivre.
  //
  // En vrai, cet état dure : `synchroniser` écrit les SÉANCES au cache avant
  // les SÉRIES. Une app fermée entre les deux, ou un commit refusé, laisse
  // l'écart SUR DISQUE, et le démarrage suivant le relit tel quel.
  // ⚠️ ON REPART D'UN ÉTAT PROPRE, ET C'EST NÉCESSAIRE. Le `terminer()` de la
  // section précédente est appelé depuis le DÉTAIL d'une séance, où
  // `#bandeau-seance` n'existe pas : son `.catch(() => {})` avale l'échec et la
  // séance reste EN COURS. `modifierSeance` refuse alors net
  // (`seanceEnCoursBloque`) — et la mesure dirait « le bouton ne marche pas »
  // alors qu'elle n'aurait mesuré que l'état laissé par la section d'avant.
  await aller('/saisie');
  if ((await visible())[0] === 'vue-seance') await terminer().catch(() => {});

  const ID_VIDE = '40000000-0000-4000-8000-0000000000e1';
  // ⚠️ PAS `jourExo(6)` : l'ancre n'est pas un lundi, et « ancre + 6 jours »
  // sortait de la semaine ouverte six jours sur sept (`decor-dates.js`).
  poserSeance(ID_VIDE, 'Séries pas arrivées', seanceSansSeries(L_EXO).toISOString(), []);
  // ⚠️ ON MESURE AVANT, ON COMPARE APRÈS. Un compte écrit en dur dans
  // l'assertion ne dit rien du défaut — il dit ce que la fixture contenait le
  // jour où on l'a écrit, et il se périme au premier ajout. L'invariante, elle,
  // est « rien n'a bougé », et elle vaut quelle que soit la fixture.
  const setsAvant47 = base.sets.length;
  await aller('/semaine/' + isoL(L_EXO));

  const carteVide = () => page.evaluate((id) => {
    const cartes = Array.from(document.querySelectorAll('.seance'));
    const c = cartes.filter((n) => /Séries pas arrivées/.test(n.textContent))[0];
    if (!c) return null;
    return {
      texte: c.textContent,
      incomplete: c.classList.contains('incomplete'),
      // Le « ⋯ » vit À CÔTÉ de la carte, dans son enveloppe.
      menu: !!(c.parentElement && c.parentElement.querySelector('.menu-pts'))
    };
  }, ID_VIDE);

  const vue47 = await carteVide();
  ok('[47] la CARTE dit que les séries ne sont pas arrivées, et refuse son menu',
    !!vue47 && /séries pas encore reçues/.test(vue47.texte) && vue47.menu === false,
    vue47 ? (vue47.texte.replace(/\s+/g, ' ').slice(0, 60) + ' · menu ' + vue47.menu) : '(carte absente)');

  // ⚠️ ET LE DÉTAIL DE LA MÊME SÉANCE, AU MÊME INSTANT. C'était l'incohérence :
  // la carte refusait, le détail offrait — et « Modifier » y rouvrait une séance
  // vide dont l'enregistrement posait `remplacerSeries(id, [])`.
  await aller('/seance/' + ID_VIDE);
  ok('[47] le DÉTAIL refuse les mêmes gestes — plus aucun bouton',
    JSON.stringify(await visible()) === '["vue-detail"]' &&
    (await compter('#vue-detail .detail-gestes button')) === 0,
    JSON.stringify(await visible()) + ' · ' +
    (await compter('#vue-detail .detail-gestes button')) + ' geste(s)');
  ok('[47] …et il dit POURQUOI, au lieu d’affirmer qu’il n’y a rien',
    /finissent d.arriver/.test(await texte('#vue-detail')) &&
    !/Aucune série sur cette séance/.test(await texte('#vue-detail')),
    (await texte('#vue-detail .vide')).replace(/\s+/g, ' ').slice(0, 70));

  // ⚠️ ET RIEN N'EST PARTI. C'est la mesure qui compte : le défaut ne se voyait
  // pas à l'écran, il se voyait en base. Aucune séance du banc ne doit avoir
  // perdu de séries pendant tout ce qui précède.
  ok('[47] et aucune série n’a été effacée en base',
    base.sets.length === setsAvant47,
    setsAvant47 + ' → ' + base.sets.length + ' série(s) en base');

  // NON-RÉGRESSION DU CHANTIER 29 : une séance COMPLÈTE garde ses trois gestes.
  await aller('/seance/' + ID_MIXTE);
  ok('[47] une séance complète, elle, garde ses trois gestes',
    (await compter('#vue-detail .detail-gestes button')) === 3,
    (await compter('#vue-detail .detail-gestes button')) + ' geste(s)');

  console.log('\n══ 47 bis. « ← SÉANCES » REMONTE, IL N’EMPILE PAS ══');
  //
  // ⚠️ ON MESURE `history.length`, PAS L'ÉCRAN. Les deux implémentations
  // arrivent sur la liste : celle qui EMPILE y arrive en ajoutant une entrée,
  // et c'est l'entrée de trop qui obligeait à trois retours pour sortir — dont
  // un qui ROUVRAIT le détail qu'on venait de quitter.
  await aller('/semaine/' + isoL(L_EXO));
  const longueurAvant = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.seance'))
      .filter((n) => /Quads tous terrains/.test(n.textContent))[0];
    if (c) c.click();
  });
  await attendre(900);
  const surDetail = JSON.stringify(await visible());
  const longueurDetail = await page.evaluate(() => history.length);
  await page.click('#btn-retour');
  await attendre(900);
  const longueurApres = await page.evaluate(() => history.length);
  ok('[47] « ← Séances » ramène aux séances SANS empiler une entrée de plus',
    surDetail === '["vue-detail"]' && JSON.stringify(await visible()) === '["vue-liste"]' &&
    longueurApres === longueurDetail,
    surDetail + ' · ' + longueurAvant + ' → ' + longueurDetail + ' → ' + longueurApres);

  // ⚠️ LA MOITIÉ QUI COMPTE VRAIMENT : le retour d'Android, juste après. Avec
  // une entrée empilée, il ROUVRAIT le détail. C'est le « trois retours pour
  // sortir » du relevé, et c'est ce qu'aucune mesure d'écran seule ne montre.
  await page.goBack().catch(() => {});
  await attendre(900);
  ok('[47] …et le retour d’Android ne ROUVRE PAS le détail qu’on vient de quitter',
    JSON.stringify(await visible()) !== '["vue-detail"]',
    JSON.stringify(await visible()));

  // ⚠️ ET LE REPLI, QUI EST LA MOITIÉ QU'ON N'AURAIT PAS TESTÉE. Après un
  // rechargement DIRECT, aucune de nos entrées n'a été empilée : `history.back()`
  // est alors absorbé par l'ancre de `THSortie` et le bouton ne fait RIEN. Ce
  // trou existait sur le « ← » de la page d'exercice depuis le chantier 40 — le
  // banc ne l'avait jamais vu parce qu'il empile toujours une entrée avant de
  // cliquer. C'est exactement la configuration discriminante : un `aller()`,
  // qui est un goto, et rien d'autre avant le clic.
  await aller('/seance/' + ID_MIXTE);
  await page.click('#btn-retour');
  await attendre(900);
  ok('[47] après un rechargement direct, « ← Séances » n’est pas un bouton MORT',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  // Le chemin d'édition ne doit pas non plus laisser d'entrées derrière lui :
  // « Modifier » puis « Enregistrer » revenaient en empilant deux fois, et
  // « ← Séances » remontait alors sur /saisie — le bouton mentait sur sa
  // destination. Les deux REMPLACENT désormais, comme les cinq autres entrées
  // dans l'onglet Saisie.
  await aller('/seance/' + ID_MIXTE);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /^Modifier$/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  const enEdition47 = JSON.stringify(await visible());
  await page.click('#bandeau-seance .bandeau-fin').catch(() => {});
  await attendre(2000);
  const apresEdition = JSON.stringify(await visible());
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  ok('[47] après « Modifier → Enregistrer », « ← Séances » va bien aux SÉANCES',
    enEdition47 === '["vue-seance"]' && apresEdition === '["vue-detail"]' &&
    JSON.stringify(await visible()) === '["vue-liste"]',
    enEdition47 + ' → ' + apresEdition + ' → ' + JSON.stringify(await visible()));

  console.log('\n══ 49. LE CHEMIN COMPLET DU RETOUR, SUR UNE PAGE NEUVE ══');
  //
  // ⚠️ UNE PAGE NEUVE, ET C'EST LA CONFIGURATION DISCRIMINANTE (§2 quater).
  // Chrome PLAFONNE `history.length` à 50. La page unique de ce banc sature
  // bien avant d'arriver ici : toute mesure de profondeur y est vraie par
  // saturation, jamais par correction — c'est ce qui a rendu VIDE l'assertion
  // « longueurApres === longueurDetail » du chantier 47, mesurée à 50 = 50. Une
  // page neuve repart à une profondeur de deux ou trois, où une entrée de trop
  // se voit.
  //
  // ⚠️ ET LE CHEMIN ENTIER, PAS LE DERNIER SAUT (§5.7). C'est la troisième fois
  // que le bouton retour coûte un chantier, et à chaque fois pour la même
  // raison : on mesurait UN retour. Un seul ne montre pas qu'une pile est
  // fausse — il montre seulement que l'écran d'après est le bon. On en fait
  // donc DEUX de suite, et on regarde ce que le premier a laissé.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/semaine/' + isoL(L_EXO));
  const h49Liste = await page.evaluate(() => history.length);
  const vue49Liste = JSON.stringify(await visible());

  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.seance'))
      .filter((n) => /Quads tous terrains/.test(n.textContent))[0];
    if (c) c.click();
  });
  await attendre(900);
  const h49Detail = await page.evaluate(() => history.length);
  const libelle49 = (await texte('#btn-retour')).trim();

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /^Modifier$/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  const vue49Saisie = JSON.stringify(await visible());
  await page.click('#bandeau-seance .bandeau-fin').catch(() => {});
  await attendre(2000);
  const vue49Retour = JSON.stringify(await visible());
  const h49Apres = await page.evaluate(() => history.length);

  // ⚠️ LE LIBELLÉ EST LA MOITIÉ DU DÉFAUT, ET C'EST ELLE QUI CAUSE L'AUTRE.
  // Un bouton qui NOMME sa destination fait une promesse écrite ; `history.back()`
  // rend l'entrée précédente, qui n'est cette destination que si l'on vient d'y
  // passer. On vérifie donc le mot AVANT le saut — et qu'il n'a pas changé après
  // l'aller-retour par la saisie, là où Aurélien a lu autre chose sur device.
  ok('[49] le détail annonce « ← Séances », avant comme après l’édition',
    libelle49 === '← Séances' && (await texte('#btn-retour')).trim() === '← Séances',
    libelle49 + ' → ' + (await texte('#btn-retour')).trim());

  ok('[49] …et l’édition n’a ajouté aucune entrée d’historique',
    vue49Liste === '["vue-liste"]' && vue49Saisie === '["vue-seance"]' &&
    vue49Retour === '["vue-detail"]' && h49Apres === h49Detail && h49Detail <= h49Liste + 1,
    'liste ' + h49Liste + ' → détail ' + h49Detail + ' → après édition ' + h49Apres);

  // §5.6 — le bouton tient sa promesse : la LISTE, pas autre chose.
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  const vue49R1 = JSON.stringify(await visible());
  const h49R1 = await page.evaluate(() => history.length);
  ok('[49] « ← Séances » ramène à la liste — et sans empiler',
    vue49R1 === '["vue-liste"]' && h49R1 === h49Apres,
    vue49R1 + ' · profondeur ' + h49Apres + ' → ' + h49R1);

  // §5.7 — DEUX retours d'Android de suite. Le premier ne doit pas rouvrir le
  // détail qu'on vient de quitter (c'est le grief du chantier 40) ; le second ne
  // doit pas remonter PLUS LOIN que la liste — ni la saisie, ni un écran d'avant.
  // C'est ce saut-là qu'Aurélien a signalé, et un seul retour ne l'aurait pas vu.
  await page.goBack().catch(() => {});
  await attendre(900);
  const vue49B1 = JSON.stringify(await visible());
  await page.goBack().catch(() => {});
  await attendre(900);
  const vue49B2 = JSON.stringify(await visible());
  ok('[49] deux retours d’Android de suite : ni le détail, ni la saisie',
    vue49B1 === '["vue-liste"]' && vue49B2 === '["vue-liste"]',
    vue49B1 + ' → ' + vue49B2);

  // Le repli reste vivant : sur une page neuve ouverte DIRECTEMENT sur le
  // détail, aucune de nos entrées n'a été empilée. Le bouton doit naviguer,
  // pas rester inerte — c'est le trou que le chantier 47 avait fermé, et qui
  // se refermerait tout seul ici puisque la navigation est désormais explicite.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/seance/' + ID_MIXTE);
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  ok('[49] ouvert directement sur le détail, « ← Séances » n’est pas MORT',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  // ⚠️ ET L'AUTRE « ← » NE CHANGE PAS. « ← Retour » ne nomme aucune
  // destination, et la page d'exercice s'atteint depuis trois écrans : elle
  // garde `remonter`. Sans cette mesure, « corriger les deux pareil » serait la
  // régression suivante — c'est exactement ce que le chantier 47 a fait en sens
  // inverse.
  ok('[49] « ← Retour », lui, ne nomme aucune destination',
    (await page.evaluate(() => (document.getElementById('btn-retour-exercice') || {}).textContent || '')).trim()
      === '← Retour',
    await page.evaluate(() => (document.getElementById('btn-retour-exercice') || {}).textContent || ''));

  console.log('\n══ 7 duovicies. LA CASCADE DES REPS, ET LE SILENCE D’ENTRETENIR ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : les TROIS sources du fantôme
  // de reps doivent différer deux à deux, sinon le banc ne dit pas laquelle
  // parle. Constaté sur l'appareil le 20/09 : une routine de couché à 5 · 5 · 4
  // reps donnait, en Entretenir, le même fantôme que le plan du moteur —
  // mêmes chiffres, autre source. Ici : le plan vise 5 · 5 · 4, la routine dit
  // 8 · 8 · 8, la dernière séance a fait 4 · 5 · 3.
  //
  // Ce que seul ce banc prouve : l'aller-retour Progresser → Entretenir → séance
  // par les VRAIS écrans (l'onglet Profil, le segment, l'onglet Saisie, puis un
  // rechargement), avec le profil qui fait l'aller-retour serveur — le mémo de
  // `app.js` se re-cle sur l'intention, et l'en-tête ET le fantôme le lisent.
  // Le soulevé de terre : quatre séances, la dernière une seconde avant
  // maintenant (§7 unvicies, même raison), 125 × 4 · 125 × 5 · 130 × 3.
  {
    const JOUR = 86400000, tMaintenant = Date.now(), repereH = base.journal.length;
    const poserTerre = (id, ilYA, lignes) => {
      const debut = ilYa(ilYA, tMaintenant).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Jambes — ' + id, debut,
        fin: finDe(debut, tMaintenant).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'souleve-terre',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserTerre('terre-a', 21 * JOUR, [[120, 5], [120, 5], [120, 5]]);
    poserTerre('terre-b', 14 * JOUR, [[122.5, 5], [122.5, 5], [122.5, 5]]);
    poserTerre('terre-c', 7 * JOUR, [[125, 5], [125, 5], [125, 5]]);
    poserTerre('terre-d', 1000, [[125, 4], [125, 5], [130, 3]]);
    await aller('/');
    await attendre(1200);
    await aller('/saisie');
    if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();

    // L'attendu par les MÊMES modules purs que l'app, sur les mêmes données.
    const attenduTerre = () => {
      const parSeance = {};
      base.sets.filter((x) => x.exercise_slug === 'souleve-terre').forEach((x) => {
        (parSeance[x.session_id] = parSeance[x.session_id] || []).push(x);
      });
      const groupes = base.sessions.filter((x) => parSeance[x.id] && x.statut === 'terminee')
        .map((x) => ({ seance: x, series: parSeance[x.id] }));
      const etats = PalierM.etatsExercices(PalierM.seanceExercices(base.sets));
      const c = Moteur.consigneDExercice(groupes, etats['souleve-terre'], new Date().toISOString(), {
        mesure: 'charge_reps', equipement: null, intention: 'progresser',
        reglage: ProfilM.rythmeDe(base.profiles[0]), edition: false
      });
      return { c, plan: SeanceM.planDe([{}, {}, {}], c && c.consigne) };
    };
    const { c: cTerre, plan: planTerre } = attenduTerre();
    const PLAN = ['125\u00d75', '125\u00d75', '130\u00d74'];
    const ROUTINE_8 = ['125\u00d78', '125\u00d78', '130\u00d78'];
    const DERNIERE = ['125\u00d74', '125\u00d75', '130\u00d73'];
    ok('[H] prémisse : sur cet historique, le moteur dit 125 kg vise 5, puis 130 kg vise 4',
      !!cTerre && JSON.stringify(planTerre.map((x) => x.charge_kg + '\u00d7' + x.reps)) === JSON.stringify(PLAN),
      JSON.stringify(cTerre && { etat: cTerre.consigne.etat, ligne: cTerre.consigne.ligne, haut: cTerre.consigne.haut }));

    // Le fantôme AFFICHÉ, charge ET reps : « 125×5 » ; une valeur saisie se lit entre crochets.
    const fantomesCR = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie')).map((l) =>
        Array.from(l.querySelectorAll('input')).map((i) => i.value ? '[' + i.value + ']' : (i.placeholder || '\u2205')).join('\u00d7')));
    const enteteExo = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne, .legende-exo .consigne-dit')).map((e) => e.textContent));
    // ── Progresser : le plan, charge et reps, et l'en-tête ────────────────
    await demarrerRoutine('Terre');
    ok('[H] Progresser, routine à 8 reps visées : les fantômes disent LE PLAN, charge et reps',
      JSON.stringify(await fantomesCR()) === JSON.stringify(PLAN), JSON.stringify(await fantomesCR()));
    ok('[H] et l’en-tête dit la consigne',
      JSON.stringify(await enteteExo()) === JSON.stringify(cTerre.libelles.jaune.concat([cTerre.libelles.gris])),
      JSON.stringify(await enteteExo()).replace(/\u00a0/g, '·'));

    // ── Profil → Entretenir → retour par l'onglet Saisie ───────────────────
    await choisirIntention('entretien');
    ok('[H] l’intention est partie au serveur, et la ligne rendue la porte',
      base.profiles[0].intention === 'entretien' &&
      base.journal.filter((j) => j.op === 'profil').slice(-1)[0].champs.intention === 'entretien',
      JSON.stringify(base.profiles[0].intention));
    await onglet('saisie');
    ok('[H] retour à la séance en Entretenir : l’en-tête est MUET',
      (await enteteExo()).length === 0, JSON.stringify(await enteteExo()));
    ok('[H] …et les fantômes : charges de la dernière séance, reps de la ROUTINE (8)',
      JSON.stringify(await fantomesCR()) === JSON.stringify(ROUTINE_8), JSON.stringify(await fantomesCR()));

    // ── L'app rechargée, séance reprise, profil relu du cache puis du serveur ──
    await aller('/saisie');
    ok('[H] après rechargement : toujours muet, toujours la routine',
      (await enteteExo()).length === 0 && JSON.stringify(await fantomesCR()) === JSON.stringify(ROUTINE_8),
      JSON.stringify(await fantomesCR()));
    await abandonner();

    // ── Sans reps visées, en Entretenir : la dernière séance, reps comprises ──
    await demarrerRoutine('Terre libre');
    ok('[H] routine sans reps visées, Entretenir : la dernière séance, charge ET reps',
      JSON.stringify(await fantomesCR()) === JSON.stringify(DERNIERE), JSON.stringify(await fantomesCR()));
    ok('[H] en-tête muet aussi', (await enteteExo()).length === 0, JSON.stringify(await enteteExo()));
    await abandonner();

    // ── Retour en Progresser : le mémo se re-cle, le plan revient ──────────
    await choisirIntention('progresser');
    await onglet('saisie');
    await demarrerRoutine('Terre');
    ok('[H] revenu en Progresser : le plan et l’en-tête reviennent',
      JSON.stringify(await fantomesCR()) === JSON.stringify(PLAN) && (await enteteExo()).length === 3,
      JSON.stringify(await fantomesCR()) + ' · ' + (await enteteExo()).length + ' ligne(s)');
    await abandonner();
    ok('[H] la seconde bascule est partie au serveur aussi : la ligne dit Progresser',
      base.profiles[0].intention === 'progresser', JSON.stringify(base.profiles[0].intention));
    // Pour le relevé : chaque bascule est une écriture du profil ENTIER
    // (`envoyerProfil` envoie `champsEcrits(profil)`), dans l'ordre des gestes.
    console.log('   écritures du profil pendant la section : ' +
      JSON.stringify(base.journal.slice(repereH).filter((j) => j.op === 'profil').map((j) => j.champs.intention)));
  }

  console.log('\n══ 7 tervicies. LA CORRECTION DE ZONE ══');
  //
  // ⚠️ CE QUE SEUL CE BANC PROUVE : l'écriture. La zone choisie s'affiche
  // d'abord sur l'appareil, part par la file, et un renvoi ne la double pas.
  // Les modules purs disent la règle ; ici on regarde une ligne arriver en
  // base, et l'en-tête changer sous le pouce.
  //
  // Le soulevé de terre du §7 duovicies sert de sujet : son historique est
  // connu (125 × 4 · 125 × 5 · 130 × 3), sa zone déduite est Lourd, et une
  // correction en Volume change la consigne du tout au tout — la configuration
  // discriminante, puisque deux zones voisines donneraient presque le même
  // chiffre et ne prouveraient pas le recalcul.
  {
    const repereZ = base.journal.length;
    const enTete = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne')).map((e) => e.textContent));
    const puce = () => page.evaluate(() => {
      const n = document.querySelector('.legende-exo .puce-zone');
      return n ? { balise: n.tagName, texte: n.textContent, choisie: n.classList.contains('choisie') } : null;
    });
    const optionsMenu = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('#feuille-contenu .option-zone')).map((b) => ({
        cle: b.dataset.cle, actif: b.classList.contains('active'),
        sous: (b.querySelector('.oz-sous') || {}).textContent || null })));
    const boutonsMenu = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('#feuille-contenu button:not(.option-zone)'))
        .map((b) => b.textContent));
    const ouvrirMenu = async () => {
      await page.click('.legende-exo .puce-zone');
      await attendre(700);
    };
    const choisirZone = async (cle) => {
      await page.click('#feuille-contenu .option-zone[data-cle="' + cle + '"]');
      await attendre(1600);
    };
    const zonesEnBase = () => base.zones.map((z) => z.exercise_slug + ':' + z.zone);
    const enFileZones = () => page.evaluate(() =>
      (window.THCache ? window.THCache.lireAttente() : Promise.resolve([]))
        .then((f) => f.filter((e) => e.table === 'zones_exercice').map((e) => e.id)));

    await demarrerRoutine('Terre');
    const avantCorrection = await enTete();
    ok('[Z] l’étiquette est un BOUTON, au contour, et dit la zone déduite',
      JSON.stringify(await puce()) === JSON.stringify({ balise: 'BUTTON', texte: 'Lourd 3-5', choisie: false }),
      JSON.stringify(await puce()));

    await ouvrirMenu();
    const opts = await optionsMenu();
    ok('[Z] le menu montre les cinq zones, la déduite cochée, et sa raison',
      opts.length === 5 && opts.filter((o) => o.actif).map((o) => o.cle).join() === 'lourd' &&
      opts.filter((o) => o.sous).length === 1 && /reps d’|reps d'/.test(opts.filter((o) => o.sous)[0].sous),
      JSON.stringify(opts));
    ok('[Z] aucune zone choisie : pas de « Revenir », mais « Fermer »',
      (await boutonsMenu()).filter((x) => /Revenir/.test(x)).length === 0 &&
      (await boutonsMenu()).indexOf('Fermer') >= 0,
      JSON.stringify(await boutonsMenu()));

    // ── LE CHOIX : l'écran d'abord, la base ensuite ───────────────────────
    await choisirZone('volume');
    ok('[Z] L’EN-TÊTE A CHANGÉ AUSSITÔT — la consigne s’est recalculée',
      JSON.stringify(await enTete()) !== JSON.stringify(avantCorrection) &&
      (await enTete()).length > 0,
      JSON.stringify(avantCorrection) + ' → ' + JSON.stringify(await enTete()));
    ok('[Z] et l’étiquette passe au fond plein : Volume 10-12, choisie',
      JSON.stringify(await puce()) === JSON.stringify({ balise: 'BUTTON', texte: 'Volume 10-12', choisie: true }),
      JSON.stringify(await puce()));
    ok('[Z] une ligne est montée en base, avec son identifiant et sa date',
      base.zones.length === 1 && base.zones[0].exercise_slug === 'souleve-terre' &&
      base.zones[0].zone === 'volume' && !!base.zones[0].id && !!base.zones[0].corrigee_a &&
      base.zones[0].user_id === 'u-banc',
      JSON.stringify(base.zones));
    ok('[Z] aucun refus du serveur : la ligne était acceptable',
      base.journal.filter((j, i) => i >= repereZ && j.op === 'refus').length === 0,
      JSON.stringify(base.journal.filter((j, i) => i >= repereZ && j.op === 'refus').slice(0, 2)));
    ok('[Z] la file est vide : la ligne est partie',
      (await enFileZones()).length === 0, JSON.stringify(await enFileZones()));

    // ── « Revenir » n'existe que maintenant, et écrit une ligne VIDE ───────
    await ouvrirMenu();
    ok('[Z] une zone choisie : « Revenir » apparaît',
      (await boutonsMenu()).filter((x) => /Revenir/.test(x)).length === 1,
      JSON.stringify(await boutonsMenu()));
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu button'))
        .filter((b) => /Revenir/.test(b.textContent))[0].click();
    });
    await attendre(1600);
    ok('[Z] « Revenir » AJOUTE une ligne vide, il n’efface pas l’historique',
      base.zones.length === 2 && base.zones[1].zone === null,
      JSON.stringify(zonesEnBase()));
    ok('[Z] et la consigne revient à celle d’avant, au contour',
      JSON.stringify(await enTete()) === JSON.stringify(avantCorrection) &&
      (await puce()).choisie === false,
      JSON.stringify(await enTete()));

    // ── HORS LIGNE : le choix s'affiche et ATTEND ─────────────────────────
    base.reseau = false;
    await ouvrirMenu();
    await choisirZone('mix');
    ok('[Z] HORS LIGNE, le choix s’affiche quand même',
      (await puce()).texte === 'Mix 6-8' && (await puce()).choisie === true,
      JSON.stringify(await puce()));
    ok('[Z] …et il attend dans la file, rien n’est monté',
      (await enFileZones()).length === 1 && base.zones.length === 2,
      (await enFileZones()).length + ' en file · ' + base.zones.length + ' en base');

    // ── L'APP RECHARGÉE, TOUJOURS HORS LIGNE : le choix tient ─────────────
    await aller('/saisie');
    ok('[Z] l’app rechargée garde le choix, sans réseau',
      (await puce()).texte === 'Mix 6-8' && (await puce()).choisie === true,
      JSON.stringify(await puce()));

    // ── LE RÉSEAU REVIENT : la ligne monte, et UNE SEULE FOIS ────────────
    base.reseau = true;
    await aller('/saisie');
    await attendre(2000);
    ok('[Z] le réseau revenu, la ligne monte',
      base.zones.length === 3 && base.zones[2].zone === 'mix',
      JSON.stringify(zonesEnBase()));
    const envoisMix = base.journal.filter((j) => j.op === 'zone' && j.zone === 'mix').length;
    // ⚠️ L'IDEMPOTENCE : on rejoue une vidange. L'entrée est partie, donc rien
    // ne doit repartir ; et même rejouée, l'`upsert` par `id` écrirait la MÊME
    // ligne. Un identifiant laissé au serveur en ferait une seconde.
    await aller('/saisie');
    await attendre(2000);
    ok('[Z] UN RENVOI NE DOUBLE RIEN : toujours trois lignes',
      base.zones.length === 3 && new Set(base.zones.map((z) => z.id)).size === 3,
      base.zones.length + ' ligne(s) · ' + envoisMix + ' envoi(s) de « mix »');
    await abandonner();

    // ── LE MENU DEPUIS LA PAGE D'EXERCICE, SANS SÉANCE EN COURS ──────────
    //
    // ⚠️ C'EST LA CONFIGURATION QUI A DEMANDÉ UNE PORTE À PART. `rendreFeuille`
    // refuse net sans séance en cours — une garde juste pour les six autres
    // feuilles, qui toutes lisent la séance. Ici il n'y en a aucune, et le menu
    // doit quand même s'ouvrir et écrire.
    ok('[Z] aucune séance en cours : la configuration est bien celle-là',
      !seanceCourante(), String(seanceCourante()));
    await aller('/exercice/souleve-terre');
    const puceExo = () => page.evaluate(() => {
      const n = document.querySelector('#page-exercice .puce-zone');
      return n ? { balise: n.tagName, texte: n.textContent, choisie: n.classList.contains('choisie') } : null;
    });
    ok('[Z] la page d’exercice porte l’étiquette, et c’est un bouton',
      (await puceExo()) && (await puceExo()).balise === 'BUTTON' && (await puceExo()).texte === 'Mix 6-8',
      JSON.stringify(await puceExo()));
    await page.click('#page-exercice .puce-zone');
    await attendre(700);
    ok('[Z] le menu s’ouvre SANS séance en cours',
      (await optionsMenu()).length === 5, JSON.stringify((await optionsMenu()).map((o) => o.cle)));
    await choisirZone('hypertrophie');
    ok('[Z] le choix depuis la page d’exercice écrit sa ligne',
      base.zones.length === 4 && base.zones[3].zone === 'hypertrophie' &&
      base.zones[3].exercise_slug === 'souleve-terre',
      JSON.stringify(zonesEnBase()));
    ok('[Z] la file est repartie à vide, et la page s’est redessinée',
      (await enFileZones()).length === 0 && (await puceExo()).texte === 'Hypertrophie 8-10' &&
      (await puceExo()).choisie === true,
      JSON.stringify(await puceExo()));
    ok('[Z] aucune erreur de page pendant toute la correction',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 quatervicies. LE CONSTAT DE FIN DE BLOC ══');
  //
  // ⚠️ CE QUE SEUL CE BANC PROUVE : la CONDITION. Les 14 cas du fichier
  // montrent ce que le constat dit ; ici on regarde QUAND il paraît, et
  // surtout quand il se défait. Un constat qui resterait après l'ajout d'une
  // série annoncerait la fin d'un exercice qu'on est en train de continuer.
  //
  // Le soulevé de terre du §7 duovicies sert encore : trois séries de travail,
  // un historique connu, et l'exercice tient dans un seul bloc.
  {
    const enTete = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne')).map((e) => e.textContent));
    const constat = () => page.evaluate(() => ({
      verdict: (document.querySelector('.legende-exo .constat') || {}).textContent || null,
      suite: (document.querySelector('.legende-exo .constat-suite') || {}).textContent || null
    }));
    const puceZone = () => page.evaluate(() =>
      (document.querySelector('.legende-exo .puce-zone') || {}).textContent || null);
    const valider = async (i) => {
      await page.evaluate((k) => {
        document.querySelectorAll('.ligne-serie')[k].querySelector('.ok-serie').click();
      }, i);
      await attendre(700);
    };

    // La zone du soulevé a été corrigée en Hypertrophie au §7 tervicies : on
    // revient à la déduction pour que le constat se lise sur la zone d'origine.
    await aller('/exercice/souleve-terre');
    await page.click('#page-exercice .puce-zone');
    await attendre(700);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu button'))
        .filter((b) => /Revenir/.test(b.textContent))[0].click();
    });
    await attendre(1600);

    await aller('/saisie');
    await demarrerRoutine('Terre');
    ok('[C6] au départ, la consigne parle et il n’y a pas de constat',
      (await enTete()).length > 0 && (await constat()).verdict === null,
      JSON.stringify(await enTete()));

    await valider(0);
    await valider(1);
    ok('[C6] DEUX séries sur trois validées : toujours la consigne, pas de constat',
      (await enTete()).length > 0 && (await constat()).verdict === null,
      JSON.stringify(await enTete()));

    await valider(2);
    const fini = await constat();
    ok('[C6] LA TROISIÈME VALIDÉE : le constat paraît, et la consigne s’efface',
      !!fini.verdict && (await enTete()).length === 0,
      JSON.stringify(fini).replace(/\u00a0/g, '·'));
    ok('[C6] il porte un verdict ET une suite',
      /aujourd’hui|aujourd'hui|Pas encore|Premier|Reprise|toutes tes séries/.test(fini.verdict) &&
      !!fini.suite,
      JSON.stringify(fini).replace(/\u00a0/g, '·'));
    ok('[C6] l’étiquette de zone, elle, reste',
      (await puceZone()) === 'Lourd 3-5', String(await puceZone()));

    // ── CE QUI LE DÉFAIT ──────────────────────────────────────────────────
    await valider(2);   // dévalide : la coche est une bascule
    ok('[C6] DÉVALIDER UNE SÉRIE DÉFAIT LE CONSTAT : la consigne revient',
      (await constat()).verdict === null && (await enTete()).length > 0,
      JSON.stringify(await enTete()));
    await valider(2);
    ok('[C6] et la revalider le ramène, identique',
      JSON.stringify(await constat()) === JSON.stringify(fini),
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));

    // ── LES MODIFICATIONS SUIVENT (48b-6b-2) ─────────────────────────────
    //
    // ⚠️ LE DÉFAUT VU SUR APPAREIL. Corriger une valeur sur une série DÉJÀ
    // VALIDÉE laissait le constat tel quel : taper ne redessine pas la séance
    // (le champ perdrait le focus), et la clé du mémo ne comptait que les
    // séries et les validées, jamais leurs VALEURS. Les deux moitiés sont
    // testées ici, et la seconde vérification est celle qui compte : le champ
    // garde ce qu'on y a tapé.
    const repsDe = (i) => page.evaluate((k) =>
      document.querySelectorAll('.ligne-serie')[k].querySelectorAll('input')[1].value, i);
    const taperReps = async (i, v) => {
      const champs = await (await ligne(i)).$$('input');
      await champs[1].fill(String(v));
      await attendre(500);
    };
    const repsOrigine = await repsDe(2);
    await taperReps(2, 9);
    const modifie = await constat();
    ok('[C6] UNE VALEUR CHANGÉE SUR UNE SÉRIE VALIDÉE : le constat suit',
      modifie.verdict !== null && modifie.verdict !== fini.verdict && /9/.test(modifie.verdict),
      JSON.stringify(modifie).replace(/\u00a0/g, '·'));
    ok('[C6] et le champ garde ce qu’on y a tapé — la porte étroite n’a rien reconstruit',
      (await repsDe(2)) === '9', JSON.stringify(await repsDe(2)));
    await taperReps(2, repsOrigine);
    ok('[C6] la valeur d’origine revenue, le constat d’origine revient',
      JSON.stringify(await constat()) === JSON.stringify(fini),
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));

    // Dévalider pour corriger, puis revalider : le constat des NOUVELLES valeurs.
    await valider(2);
    ok('[C6] dévalidée pour la corriger : la consigne revient',
      (await constat()).verdict === null && (await enTete()).length > 0,
      JSON.stringify(await enTete()));
    await taperReps(2, 9);
    await valider(2);
    ok('[C6] revalidée : le constat est celui des NOUVELLES valeurs',
      JSON.stringify(await constat()) === JSON.stringify(modifie),
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));
    await taperReps(2, repsOrigine);

    // ── L'ORDRE DE LECTURE (20/09/2026) ──────────────────────────────────
    //
    // ⚠️ CONFIGURATION DISCRIMINANTE : trois séries à la MÊME charge et à des
    // reps DIFFÉRENTES. À charges inégales, c'est le palier qui départage et
    // l'ordre ne se voit pas ; à reps égales, « 4-4-4 » se lit pareil dans
    // tous les sens. Il faut 5-4-3 pour que l'ordre soit lisible dans la
    // phrase. Et c'est ici, et NULLE PART AILLEURS, que l'ordre se teste pour
    // de vrai : le banc conduit la vraie app, donc ses séries portent de vrais
    // UUID tirés au hasard — le décor exact qui a fait lire « 4-5-4 » à la
    // séance du 20/09, alors que l'écran montrait 5, 4, 4.
    const taper = async (i, charge, reps) => {
      const champs = await (await ligne(i)).$$('input');
      await champs[0].fill(String(charge));
      await champs[1].fill(String(reps));
      await attendre(450);
    };
    await taper(0, 130, 5);
    await taper(1, 130, 4);
    await taper(2, 130, 3);
    const vues = [await repsDe(0), await repsDe(1), await repsDe(2)];
    ok('[C6] l’écran montre 5, 4, 3 dans cet ordre',
      JSON.stringify(vues) === JSON.stringify(['5', '4', '3']), JSON.stringify(vues));
    const lecture = String((await constat()).verdict);
    // §20.2 (49-U9) — les reps se disent « × 5, 4, 3 » (plus « 5-4-3 »).
    ok('[C6] LE MOTEUR LIT DANS L’ORDRE DE L’ÉCRAN : « 5, 4, 3 », aucune autre permutation',
      /5, 4, 3/.test(lecture) && !/4, 5, 3|4, 3, 5|5, 3, 4|3, 4, 5|3, 5, 4/.test(lecture),
      JSON.stringify(lecture).replace(/\u00a0/g, '·'));
    await taper(2, 130, 4);
    ok('[C6] la troisième corrigée à 4 : la lecture suit, « 5, 4, 4 »',
      /5, 4, 4/.test(String((await constat()).verdict)),
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));

    await plusSerie(0);
    ok('[C6] AJOUTER UNE SÉRIE LE DÉFAIT AUSSI — l’exercice n’est plus fini',
      (await constat()).verdict === null && (await enTete()).length > 0,
      (await compter('.ligne-serie')) + ' ligne(s) · ' + JSON.stringify(await enTete()));
    await valider(3);
    ok('[C6] la quatrième validée : le constat revient',
      (await constat()).verdict !== null && (await enTete()).length === 0,
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));
    await abandonner();

    // ── LES CHAUFFES NE COMPTENT PAS, ET NE SUFFISENT PAS ────────────────
    await seanceVide();
    await ajouterExoSeance('Terre');
    await reduireA(1);                // 49-C : la forme de la section part d'UNE ligne
    await plusSerie(0);
    await attendre(400);
    await page.evaluate(() => { document.querySelectorAll('.ligne-serie .no-serie')[0].click(); });
    await attendre(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => /chauffement/i.test(x.textContent))[0].click();
    });
    await attendre(700);
    await valider(0);
    ok('[C6] SEULE LA CHAUFFE VALIDÉE : pas de constat, la consigne tient',
      (await constat()).verdict === null && (await enTete()).length > 0,
      JSON.stringify(await enTete()));
    await valider(1);
    ok('[C6] la série de travail validée : le constat paraît, la chauffe n’a rien retenu',
      (await constat()).verdict !== null,
      JSON.stringify(await constat()).replace(/\u00a0/g, '·'));
    await abandonner();

    // ── UN SUPERSET : LE CONSTAT EST CELUI DU BLOC (48b-6b-2) ────────────
    //
    // ⚠️ CETTE SECTION DÉFENDAIT LA RÈGLE INVERSE, ET ELLE AVAIT TORT. 48b-6b
    // ouvrait le constat dès que L'EXERCICE était fini ; sur appareil, la
    // première branche du superset annonçait son bilan pendant qu'on
    // travaillait encore la seconde. Un superset est UN bloc (ECRAN-SAISIE
    // §3.9) : le constat attend la fin du bloc, chaque exercice gardant le
    // sien. La configuration reste discriminante — deux exercices dans un
    // bloc, la première branche finie seule — seul l'attendu a changé de sens.
    await seanceVide();
    await ajouterExoSeance('Terre');
    await ajouterExoSeance('Curl');
    await menuBloc(0);
    await entree('Grouper en superset');
    await attendre(400);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.bloc-seance'))[1];
      if (b) b.click();
    });
    await attendre(800);
    ok('[C6] le superset est formé : deux exercices, un bloc',
      (await compter('.bloc-seance.superset')) === 1 && (await compter('.legende-exo')) === 2,
      (await compter('.bloc-seance.superset')) + ' superset · ' +
      (await compter('.legende-exo')) + ' légende(s)');
    const parExo = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo')).map((n) => ({
        nom: (n.querySelector('.nom-exo') || {}).textContent || '',
        constat: ((n.querySelector('.constat') || {}).textContent || null),
        consigne: !!n.querySelector('.consigne')
      })));

    // La première ligne est celle de A (le soulevé) : on la valide seule.
    await valider(0);
    const seulA = await parExo();
    ok('[C6] A est fini, B ne l’est pas : AUCUN constat — le BLOC n’est pas fini',
      seulA.length === 2 && !seulA[0].constat && !seulA[1].constat,
      JSON.stringify(seulA));

    // Tout le reste du bloc, valeurs comprises : B n'a pas d'historique, une
    // série validée à vide n'existe pas en base (`sets_validee_si_saisie`).
    const lignes = await compter('.ligne-serie');
    for (let i = 0; i < lignes; i++) {
      const deja = await page.evaluate((k) =>
        !!document.querySelectorAll('.ligne-serie')[k].querySelector('.ok-serie.cochee'), i);
      if (!deja) await saisirSerie(i, 20, 10);
    }
    const tout = await parExo();
    ok('[C6] le bloc fini : LES DEUX constats paraissent, chacun le sien',
      tout.length === 2 && !!tout[0].constat && !!tout[1].constat &&
      tout[0].constat !== tout[1].constat && !tout[0].consigne && !tout[1].consigne,
      JSON.stringify(tout).replace(/\u00a0/g, '·'));
    await abandonner();
    ok('[C6] aucune erreur de page pendant tout le constat',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 quinvicies. CE QUE LE MOTEUR A PROPOSÉ S’ÉCRIT (§9.11) ══');
  //
  // Cette écriture est INVISIBLE : aucun pixel ne change. Elle ne se teste donc
  // qu'ici, par ce que la base reçoit et par ce que la file porte — et c'est
  // aussi la seule surface où `app.js` est exécuté pour de vrai.
  {
    // ⚠️ ON NE COMPTE QUE CE QUE CETTE SÉANCE ÉCRIT. Sept séances antérieures
    // du banc ont déjà affiché une consigne pour le soulevé, et elles ont eu
    // RAISON de la noter : filtrer sur le seul exercice ferait passer leur
    // travail pour des doublons. Le repère est l'index de départ, comme
    // `DECORS` ailleurs dans ce fichier.
    const depart = base.predictions.length;
    const predictions = () => base.predictions.slice(depart)
      .filter((l) => l.exercise_slug === 'souleve-terre')
      .sort((a, b) => a.fondement.rang - b.fondement.rang);
    const enFilePred = () => page.evaluate(() =>
      (window.THCache ? window.THCache.lireAttente() : Promise.resolve([]))
        // 27/09/2026 — l'observation a sa propre entrée (`observations`),
        // séparée de son pari : les deux attendent, et c'est elle qui compte ici.
        .then((f) => f.filter((e) => e.table === 'predictions' || e.table === 'observations')
          .map((e) => ({ id: e.id, op: e.op, depend: e.depend, seq: e.seq }))));
    const enFileSets = () => page.evaluate(() =>
      (window.THCache ? window.THCache.lireAttente() : Promise.resolve([]))
        .then((f) => f.filter((e) => e.table === 'sets').map((e) => e.seq)));

    // La zone du soulevé a été corrigée puis rendue à la déduction plus haut ;
    // on repart d'une séance neuve pour que la consigne soit celle d'origine.
    await aller('/saisie');
    await demarrerRoutine('Terre');
    // ⚠️ 49-C (MOTEUR §9.11, révisé le 26/09/2026) : RIEN À L'OUVERTURE. Un
    // pari s'écrit à la validation de SA série, avec ce que sa ligne affichait
    // — avant, trois lignes s'écrivaient ici, dont une orpheline dès que la
    // séance comptait moins de séries que la consigne.
    ok('[P] 49-C — à l’ouverture, AUCUN pari : la consigne est affichée, rien n’est écrit',
      predictions().length === 0, predictions().length + ' ligne(s)');
    const planOuvert = [];
    for (let i = 0; i < 3; i++) {
      const [cTxt, rTxt] = await (await ligne(i)).$$eval('input', (l) => l.map((x) => x.placeholder));
      planOuvert.push([Number(String(cTxt).replace(',', '.')), Number(rTxt)]);
    }
    await saisirSerie(0, planOuvert[0][0], planOuvert[0][1]);
    await saisirSerie(1, planOuvert[1][0], planOuvert[1][1]);
    await saisirSerie(2, planOuvert[2][0], planOuvert[2][1]);
    await attendre(900);
    const notees = predictions();
    ok('[P] une ligne PAR SÉRIE VALIDÉE, écrite à sa validation, avec ce que la ligne affichait',
      notees.length === 3 && notees.map((l) => l.fondement.rang).join() === '1,2,3' &&
      new Set(notees.map((l) => l.fondement.seance)).size === 1 &&
      notees.every((l, i) => l.fondement.charge === planOuvert[i][0] && l.valeur_predite === planOuvert[i][1]) &&
      notees.map((l) => l.fondement.role).join() === 'ligne,ligne,haut',
      JSON.stringify(notees.map((l) => l.fondement.rang + ':' + l.fondement.role + ':' +
        l.fondement.charge + '×' + l.valeur_predite)));
    ok('[P] le pari, ce sont les REPS ; la charge vit dans le fondement',
      notees.every((l) => l.grandeur === 'reps' && l.valeur_predite !== null &&
        l.fondement.charge !== null && l.module === 'moteur.consigne'),
      JSON.stringify(notees[0]));
    // ⚠️ LA VERSION EST CELLE DU MODULE, ET C'EST TOUT L'ENJEU. Un chiffre
    // recopié dans `app.js` dériverait le jour où une règle change, et deux
    // semaines de prédictions se compareraient sans le savoir. On lit la
    // constante DANS LA PAGE et on la confronte à ce que la base a reçu.
    const versionModule = await page.evaluate(() => window.THMoteur.VERSION_CONSIGNE);
    ok('[P] chaque ligne porte son identité, son instant et LA VERSION DU MODULE',
      notees.every((l) => !!l.id && l.user_id === 'u-banc' && !!l.emise_a &&
        l.module_version === versionModule && l.horizon_jours === null),
      JSON.stringify({ id: !!notees[0].id, user: notees[0].user_id,
        v: notees[0].module_version, module: versionModule, h: notees[0].horizon_jours }));
    ok('[P] le fondement porte la séance, l’état, la zone, le réglage, le palier',
      notees.every((l) => l.fondement.seance && l.fondement.etat && l.fondement.reglage &&
        l.fondement.palier !== undefined && l.fondement.niveau !== undefined),
      JSON.stringify(notees[0].fondement));

    // ⚠️ DIX REDESSINS. La consigne se relit à chaque rendu : sans la garde,
    // chaque frappe, chaque validation, chaque retour d'onglet ajouterait
    // trois lignes de plus. La table serait noyée en une séance.
    for (let i = 0; i < 10; i++) {
      await aller('/progression');
      await aller('/saisie');
    }
    ok('[P] DIX REDESSINS PLUS TARD : toujours trois lignes, pas trente',
      predictions().length === 3, predictions().length + ' ligne(s)');
    await abandonner();

    // ── L'OBSERVATION : MÊME RANG, MÊME CHARGE ────────────────────────────
    // Une séance neuve : l'observation se lit série par série, dès la
    // validation de chacune (49-C : le pari naît à la même validation).
    await aller('/saisie');
    await demarrerRoutine('Terre');
    const parRang = (r) => predictions().filter((l) => l.fondement.rang === r &&
      l.fondement.seance === base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0])[0];
    const c1 = planOuvert[0][0];
    await saisirSerie(0, c1, 5);
    ok('[P] la série faite à la charge proposée est OBSERVÉE',
      parRang(1).valeur_observee === 5 && !!parRang(1).observee_a && !!parRang(1).set_observe,
      JSON.stringify({ v: parRang(1).valeur_observee, set: !!parRang(1).set_observe }));
    ok('[P] et `set_observe` désigne une série QUI EXISTE en base',
      base.sets.some((x) => x.id === parRang(1).set_observe),
      String(parRang(1).set_observe));

    // ⚠️ CONFIGURATION DISCRIMINANTE : une charge AUTRE que celle proposée. À
    // la même charge, apparier sur le rang seul et apparier sur les deux
    // donnent le même résultat — c'est la déviation qui les sépare.
    await saisirSerie(1, planOuvert[1][0] + 5, 5);
    // ⚠️ CORRIGÉ LE 21/09 (48c-2) : la série est RELIÉE, ses reps ne comptent
    // pas. Une exploration dit quelque chose ; elle ne doit pas disparaître de
    // la table. Mais comparer « vise 4 à 130 » à « 3 à 135 » ne dirait rien de
    // la visée du moteur.
    ok('[P] AUTRE CHOSE TENTÉ : la série est reliée, ses reps ne comptent PAS',
      parRang(2).valeur_observee === null && parRang(2).observee_a === null &&
      !!parRang(2).set_observe && base.sets.some((x) => x.id === parRang(2).set_observe),
      JSON.stringify({ propose: parRang(2).fondement.charge,
        v: parRang(2).valeur_observee, a: parRang(2).observee_a,
        set: !!parRang(2).set_observe }));

    // ── UNE VALEUR CORRIGÉE APRÈS COUP ────────────────────────────────────
    const taper = async (i, champ, v) => {
      const champs = await (await ligne(i)).$$('input');
      await champs[champ].fill(String(v));
      await attendre(600);
    };
    await taper(0, 1, 4);
    ok('[P] les reps corrigées sur une série validée : l’observation SUIT',
      parRang(1).valeur_observee === 4, JSON.stringify(parRang(1).valeur_observee));
    await taper(0, 0, c1 + 10);
    ok('[P] la CHARGE corrigée hors de la proposition : les reps se retirent, la série reste',
      parRang(1).valeur_observee === null && parRang(1).observee_a === null &&
      !!parRang(1).set_observe,
      JSON.stringify({ v: parRang(1).valeur_observee, a: parRang(1).observee_a,
        set: !!parRang(1).set_observe }));
    await taper(0, 0, c1);
    ok('[P] revenue à la charge proposée : l’observation revient',
      parRang(1).valeur_observee === 4, JSON.stringify(parRang(1).valeur_observee));

    // ── L'ORDRE DANS LA FILE, ET HORS LIGNE ───────────────────────────────
    base.reseau = false;
    await taper(0, 1, 3);
    const fileP = await enFilePred();
    const fileS = await enFileSets();
    ok('[P] hors ligne, la prédiction ATTEND dans la file, avec sa dépendance',
      fileP.length > 0 && fileP.every((e) => e.depend === fileP[0].depend && !!e.depend),
      JSON.stringify(fileP));
    ok('[P] et les séries y sont AVANT elle : `set_observe` trouvera sa ligne',
      fileS.length > 0 && Math.min.apply(null, fileS) < Math.min.apply(null, fileP.map((e) => e.seq)),
      'sets ' + JSON.stringify(fileS) + ' · predictions ' + JSON.stringify(fileP.map((e) => e.seq)));
    base.reseau = true;
    await aller('/saisie');
    await attendre(2200);
    ok('[P] le réseau revenu, la file se vide et l’observation monte',
      (await enFilePred()).length === 0 && parRang(1).valeur_observee === 3,
      JSON.stringify({ file: (await enFilePred()).length, v: parRang(1).valeur_observee }));

    // ── L'APP FERMÉE PUIS ROUVERTE ────────────────────────────────────────
    //
    // ⚠️ C'EST LA RAISON D'ÊTRE DU MAGASIN LOCAL. La garde « déjà noté » ne
    // peut pas vivre en mémoire : le JS s'arrête quand l'app se ferme, et la
    // séance, elle, continue. Sans le magasin, rouvrir réécrirait tout.
    const avantFermeture = predictions().length;
    await page.close();
    page = await ctx.newPage();
    brancher(page);
    await aller('/saisie');
    await attendre(1200);
    ok('[P] L’APP ROUVERTE EN PLEINE SÉANCE NE RÉÉCRIT RIEN',
      predictions().length === avantFermeture, predictions().length + ' vs ' + avantFermeture);
    await abandonner();

    // ── LÀ OÙ LE MOTEUR SE TAIT, IL N'ÉCRIT PAS ───────────────────────────
    // L'intention se change AU SERVEUR : la synchronisation qui suit le
    // rechargement écraserait sinon une écriture locale, et le banc mesurerait
    // cette synchronisation en croyant mesurer le silence du moteur.
    const compteAvant = base.predictions.length;
    base.profiles[0].intention = 'entretien';
    await aller('/saisie');
    await demarrerRoutine('Terre');
    // 49-C : le pari naîtrait à la validation — on valide donc, sinon cette
    // vérification serait vraie de toute implémentation.
    await saisirSerie(0, planOuvert[0][0], planOuvert[0][1]);
    await attendre(900);
    ok('[P] EN ENTRETENIR, rien ne s’écrit — le moteur ne prescrit pas',
      base.predictions.length === compteAvant,
      base.predictions.length + ' vs ' + compteAvant);
    await abandonner();
    base.profiles[0].intention = 'progresser';
    await aller('/saisie');
    await seanceVide();
    await ajouterExoSeance('Planche');
    await attendre(900);
    ok('[P] sur une mesure SANS CHARGE, rien non plus',
      base.predictions.length === compteAvant,
      base.predictions.length + ' vs ' + compteAvant);
    await abandonner();
    // ── DEUX INSTANCES QUI NOTENT EN MÊME TEMPS (48c-2) ──────────────────
    //
    // ⚠️ LE DÉFAUT DU 21/09, dans sa configuration discriminante. Le squat a
    // été noté DEUX FOIS — six lignes, même `emise_a` à la milliseconde. Une
    // seule page ne le peut pas : la marque « déjà noté » se pose avant toute
    // attente. Il faut deux réalités JavaScript dont les deux LECTURES du
    // magasin ont précédé les deux ÉCRITURES.
    //
    // ⚠️ 49-C : le pari ne naît plus à l'ouverture mais à la VALIDATION. La
    // configuration discriminante devient donc : UNE SÉANCE QUI EXISTE, et la
    // MÊME série validée dans deux instances ouvertes en même temps — chacune
    // a lu le magasin avant que l'autre n'écrive.
    //
    // Ce qui les dédoublonne n'est pas une garde — c'est l'identifiant, calculé
    // depuis (séance, exercice, rang). Les deux instances écrivent la même
    // ligne, et l'insertion qui ignore les doublons fait du second envoi un
    // non-événement.
    const depart3 = base.predictions.length;
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(1200);
    ok('[P] la séance est ouverte, et rien n’est noté avant une validation (49-C)',
      base.predictions.length === depart3, (base.predictions.length - depart3) + ' ligne(s)');
    await page.close();

    const p1 = await ctx.newPage();
    const p2 = await ctx.newPage();
    brancher(p1); brancher(p2);
    await Promise.all([
      p1.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {}),
      p2.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {})
    ]);
    await attendre(3200);
    await Promise.all([p1, p2].map(async (p) => {
      const l = (await p.$$('.ligne-serie'))[0];
      const champs = await l.$$('input');
      await champs[0].fill(String(planOuvert[0][0]));
      await champs[1].fill(String(planOuvert[0][1]));
    }));
    await Promise.all([p1, p2].map((p) => p.evaluate(() =>
      document.querySelectorAll('.ligne-serie')[0].querySelector('.ok-serie').click())));
    await attendre(3200);
    const duo = base.predictions.slice(depart3);
    ok('[P] DEUX INSTANCES QUI VALIDENT LA MÊME SÉRIE : UN SEUL pari en base',
      duo.length === 1 && new Set(duo.map((l) => l.id)).size === 1,
      duo.length + ' ligne(s) · ' + new Set(duo.map((l) => l.id)).size + ' identifiant(s) distinct(s)');
    ok('[P] et leurs identifiants sont CALCULÉS, pas tirés au hasard',
      duo.length > 0 && duo.every((l) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(l.id)),
      JSON.stringify(duo.map((l) => l.id)));
    await p1.close();
    await p2.close();
    page = await ctx.newPage();
    brancher(page);
    await aller('/saisie');
    await abandonner();

    ok('[P] aucune erreur de page pendant toute l’écriture',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 sexvicies. LA RÉACTION SÉRIE PAR SÉRIE, DANS LA GRILLE (§9.14) ══');
  //
  // Le vrai `app.js`, par les vrais gestes : la phrase au-dessus de la série
  // suivante, la ligne proposée qui demande ses reps, le pari de révision
  // écrit à la validation de SA série et pas avant, les deux paris du rang
  // observés chacun sur sa charge, le refus, l'effort saisi après coup, la
  // correction au clavier, et le silence d'Entretenir.
  {
    const depart = base.predictions.length;
    const revisions = () => base.predictions.slice(depart)
      .filter((l) => l.exercise_slug === 'souleve-terre' && l.fondement &&
        Number(l.fondement.revision) >= 1);
    const duRang = (seanceId, rang) => base.predictions.slice(depart)
      .filter((l) => l.exercise_slug === 'souleve-terre' && l.fondement &&
        l.fondement.seance === seanceId && l.fondement.rang === rang);
    const phrases = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.bloc-seance .reaction-serie'))
        .map((n) => n.className.replace('reaction-serie', '').trim() + ':' + n.textContent));
    const proposees = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie')).map((l) => l.classList.contains('proposee')));
    const placeholders = async (i) => (await ligne(i)).$$eval('input', (l) => l.map((x) => x.placeholder));
    const seanceOuverte = () => page.evaluate(() => {
      const n = document.querySelector('#bandeau-seance');
      return n ? true : false;
    });
    const idSeance = () => base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];
    const quitterChamp = async (i, champ, v) => {
      const champs = await (await ligne(i)).$$('input');
      await champs[champ].fill(String(v));
      await champs[champ].evaluate((e) => e.blur());
      await attendre(900);
    };

    // ── LA PROPOSITION, PUIS LA MONTÉE PRISE ─────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    const [c1Txt, viseTxt] = await placeholders(0);
    const c1 = Number(String(c1Txt).replace(',', '.'));
    const vise = Number(viseTxt);
    ok('[R] le décor : une consigne au palier sur la première série',
      isFinite(c1) && c1 > 0 && isFinite(vise) && vise > 0 && (await seanceOuverte()),
      JSON.stringify({ c1Txt, viseTxt }));

    await saisirSerie(0, c1, vise + 3);
    const ph1 = await phrases();
    ok('[R] 3 DE PLUS QUE VISÉ : la phrase apparaît au-dessus de la série suivante',
      ph1.length === 1 && /^propose:/.test(ph1[0]) && /3 de plus que visé/.test(ph1[0]) &&
      /je passe ta série 2 /.test(ph1[0]) && !/\?/.test(ph1[0]),
      JSON.stringify(ph1));
    const prop1 = await proposees();
    const [cranTxt, fourchette] = await placeholders(1);
    const cran = Number(String(cranTxt).replace(',', '.'));
    ok('[R] la ligne proposée : le filet, la charge du coach, la FOURCHETTE dans les reps',
      prop1[1] === true && prop1.filter(Boolean).length === 1 && cran > c1 &&
      /^\d+-\d+$/.test(fourchette),
      JSON.stringify({ prop1, cranTxt, fourchette }));
    ok('[R] PAS DE PARI À L’AFFICHAGE : aucune ligne de révision tant que la série n’est pas validée',
      revisions().length === 0, revisions().length + ' ligne(s)');

    // Valider la ligne proposée SANS ses reps : refusé, le curseur va aux reps.
    const setsAvant = base.sets.length;
    await (await ligne(1)).$eval('.ok-serie', (b) => b.click());
    await attendre(600);
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      const rp = a && a.closest ? a.closest('.rp-serie') : null;
      const serie = a && a.closest ? a.closest('.serie') : null;
      return { rp: !!rp, attend: !!(rp && rp.classList.contains('a-taper')),
               iSerie: serie ? serie.getAttribute('data-iserie') : null };
    });
    ok('[R] VALIDER À VIDE NE VALIDE PAS : la série reste ouverte, le curseur va à ses reps',
      base.sets.length === setsAvant && !(await (await ligne(1)).$eval('.ok-serie',
        (b) => b.classList.contains('cochee'))) && focus.rp && focus.attend && focus.iSerie === '1',
      JSON.stringify({ sets: base.sets.length - setsAvant, focus }));

    // Les reps tapées, la charge laissée au fantôme du coach : la montée tient.
    const bas = Number(fourchette.split('-')[0]);
    {
      const champs = await (await ligne(1)).$$('input');
      await champs[1].fill(String(bas));
      await (await ligne(1)).$eval('.ok-serie', (b) => b.click());
      await attendre(900);
    }
    const ph2 = await phrases();
    ok('[R] REPS TAPÉES, MONTÉE TENUE : la phrase blanche, précédée de la coche verte',
      ph2.length === 1 && /^(tenue|haut):/.test(ph2[0]) && /dans ta zone|le haut de ta zone/.test(ph2[0]) &&
      (await page.evaluate(() => !!document.querySelector('.reaction-serie .coche-verte'))),
      JSON.stringify(ph2));
    const sId = idSeance();
    const rev1 = revisions().filter((l) => l.fondement.seance === sId);
    ok('[R] À LA VALIDATION DE SA SÉRIE : UNE ligne de révision 1, la séance dans le fondement',
      rev1.length === 1 && rev1[0].fondement.revision === 1 && rev1[0].fondement.rang === 2 &&
      rev1[0].fondement.seance === sId && rev1[0].valeur_predite === bas &&
      rev1[0].fondement.declencheur && rev1[0].fondement.declencheur.marge === 3 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-5/.test(rev1[0].id),
      JSON.stringify(rev1.map((l) => ({ rang: l.fondement.rang, rev: l.fondement.revision,
        seance: !!l.fondement.seance, decl: l.fondement.declencheur }))));
    const rang2 = duRang(sId, 2);
    const p0 = rang2.filter((l) => !l.fondement.revision)[0];
    const p1 = rang2.filter((l) => l.fondement.revision === 1)[0];
    // 49-C (MOTEUR §9.11, révisé le 26/09/2026) : UN pari par série validée,
    // celui de ce que sa ligne affichait — la proposition du coach. Avant
    // 49-C, le pari de l'ouverture (révision 0) existait aussi sur ce rang,
    // et les deux étaient observés, chacun sur sa charge.
    ok('[R] UN SEUL PARI SUR LA SÉRIE PROPOSÉE : celui du coach, observé sur sa charge',
      !p0 && !!p1 && rang2.length === 1 && p1.valeur_observee === bas && !!p1.set_observe &&
      p1.fondement.role === 'coach',
      JSON.stringify(rang2.map((l) => ({ rev: l.fondement.revision || 0, charge: l.fondement.charge,
        v: l.valeur_observee, set: !!l.set_observe }))));
    await abandonner();

    // ── LE REFUS ─────────────────────────────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    await saisirSerie(0, c1, vise + 3);
    await saisirSerie(1, c1, vise + 2);
    const phRefus = await phrases();
    ok('[R] UNE CHARGE PLUS BASSE SUR LA LIGNE PROPOSÉE : la phrase disparaît, plus rien dans le bloc',
      phRefus.length === 0 && (await proposees()).every((x) => !x),
      JSON.stringify(phRefus));
    await saisirSerie(2, c1, vise + 3);
    ok('[R] et le coach se tait jusqu’à la fin du bloc',
      (await phrases()).length === 0, JSON.stringify(await phrases()));
    await abandonner();

    // ── L'EFFORT SAISI APRÈS COUP ────────────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    await saisirSerie(0, c1, vise + 3);
    ok('[R] (effort) la proposition est affichée', (await phrases()).length === 1,
      JSON.stringify(await phrases()));
    await toucher(0, '.eff-serie');
    if ((await compter('#feuille-contenu .grille-rpe')) > 0) {
      await page.click('#feuille-contenu .bascule button');
      await attendre(400);
    }
    await page.click('#feuille-contenu .grille-rir button:nth-child(4)');   // « 0 », à fond
    await attendre(900);
    ok('[R] « À FOND » SUR LA SÉRIE QUI A DÉCLENCHÉ : la proposition disparaît',
      (await phrases()).length === 0 && (await proposees()).every((x) => !x),
      JSON.stringify(await phrases()));
    const sEffort = idSeance();
    await saisirSerie(1, cran, bas);
    ok('[R] et AUCUN pari de révision ne s’écrit',
      revisions().filter((l) => l.fondement.seance === sEffort).length === 0,
      revisions().filter((l) => l.fondement.seance === sEffort).length + ' ligne(s)');
    await abandonner();

    // ── LA CORRECTION AU CLAVIER D'UNE SÉRIE VALIDÉE ─────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    await saisirSerie(0, c1, vise);
    ok('[R] (clavier) à la visée, le coach se tait', (await phrases()).length === 0,
      JSON.stringify(await phrases()));
    await quitterChamp(0, 1, vise + 3);
    ok('[R] CORRIGER AU CLAVIER UNE SÉRIE VALIDÉE REDESSINE LE BLOC : la proposition arrive',
      (await phrases()).length === 1 && (await proposees())[1] === true,
      JSON.stringify(await phrases()));
    await abandonner();

    // ── UNE SÉRIE TAPÉE MAIS NON VALIDÉE N'EST PAS UNE SÉRIE FAITE ───────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    await quitterChamp(0, 0, c1);
    await quitterChamp(0, 1, vise + 3);
    await aller('/progression');
    await aller('/saisie');
    await attendre(600);
    ok('[R] UNE SÉRIE SEULEMENT TAPÉE NE DÉCLENCHE RIEN, même au rendu suivant',
      (await phrases()).length === 0 && (await proposees()).every((x) => !x),
      JSON.stringify(await phrases()));
    await abandonner();

    // ── ENTRETENIR : RIEN ────────────────────────────────────────────────
    base.profiles[0].intention = 'entretien';
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    await saisirSerie(0, c1, vise + 3);
    ok('[R] EN ENTRETENIR, rien : ni phrase, ni ligne proposée',
      (await phrases()).length === 0 && (await proposees()).every((x) => !x),
      JSON.stringify(await phrases()));
    await abandonner();
    base.profiles[0].intention = 'progresser';
    await aller('/saisie');

    ok('[R] aucune erreur de page pendant la réaction',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 septvicies. UNE OBSERVATION NE CHANGE JAMAIS DE SÉRIE (§9.11, 49-8) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : une série AJOUTÉE ou SUPPRIMÉE après des
  // séries déjà observées. `couvertureDe` aligne les rangs par la fin : la
  // série ajoutée prend le rang du test, et la validation qui suit écrasait
  // l'observation du test tenu (diagnostic du 26/09/2026, scénarios A, B2, C,
  // E2). Sans glissement, garde et absence de garde donnent le même résultat.
  {
    const idSeance = () => base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];
    const lignesDe = (sid) => base.predictions.filter((l) => l.exercise_slug === 'souleve-terre' &&
      l.fondement && l.fondement.seance === sid);
    const photo = (sid) => {
      const m = {};
      lignesDe(sid).forEach((l) => { m[l.id] = { rang: l.fondement.rang, rev: l.fondement.revision || 0,
        set: l.set_observe, v: l.valeur_observee, a: l.observee_a }; });
      return m;
    };
    const serieDe = (id) => { const s = base.sets.find((x) => x.id === id); return s ? s.rang : null; };
    const dire = (sid) => JSON.stringify(lignesDe(sid).map((l) => l.fondement.rang + '.' +
      (l.fondement.revision || 0) + '→' + (l.set_observe ? 's' + serieDe(l.set_observe) : '∅') + ':' + l.valeur_observee));
    // Aucune ligne déjà observée n'a changé de série, ni de valeur, ni de date.
    const rienNaBouge = (avant, apres) => Object.keys(avant).every((id) =>
      !avant[id].set || (apres[id] && apres[id].set === avant[id].set &&
        apres[id].v === avant[id].v && apres[id].a === avant[id].a));
    const plusSerie = async () => {
      await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
      await attendre(900);
    };
    const planAffiche = async () => {
      const p = [];
      for (let i = 0; i < 3; i++) {
        const [c, r] = await (await ligne(i)).$$eval('input', (l) => l.map((x) => x.placeholder));
        p.push([Number(String(c).replace(',', '.')), Number(String(r).split('-')[0])]);
      }
      return p;
    };
    const faireLePlan = async (plan, n) => {
      for (let i = 0; i < n; i++) await saisirSerie(i, plan[i][0], plan[i][1]);
      await attendre(1200);
    };
    const localPred = (id) => page.evaluate((x) => window.THCache.lireTout('predictions')
      .then((l) => l.filter((p) => p.id === x)[0] || null), id);

    // ── A. le bloc fait, « + Série », une série plus légère ─────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    const plan = await planAffiche();
    ok('[O] prémisse : une consigne de trois séries, la dernière plus lourde (le test)',
      plan.every((x) => x[0] > 0 && x[1] > 0) && plan[2][0] > plan[0][0], JSON.stringify(plan));
    const leger = [plan[0][0] - 15, plan[0][1] + 3];
    let sid = idSeance();
    await faireLePlan(plan, 3);
    const avantA = photo(sid);
    const testA = lignesDe(sid).filter((l) => l.fondement.rang === 3)[0];
    ok('[O] A — le test tenu est observé sur la série 3',
      !!testA && serieDe(testA.set_observe) === 3 && testA.valeur_observee === plan[2][1] && !!testA.observee_a,
      dire(sid));
    await plusSerie();
    await saisirSerie(3, leger[0], leger[1]);
    await attendre(1200);
    ok('[O] A — « + Série » puis une série plus légère : AUCUNE observation ne change de série',
      rienNaBouge(avantA, photo(sid)) && base.sets.some((x) => x.session_id === sid && x.rang === 4),
      dire(sid));
    await abandonner();

    // ── B2. la série ajoutée au poids du test, ratée ─────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await faireLePlan(plan, 3);
    const avantB = photo(sid);
    await plusSerie();
    await saisirSerie(3, plan[2][0], Math.max(1, plan[2][1] - 2));
    await attendre(1200);
    const testB = lignesDe(sid).filter((l) => l.fondement.rang === 3)[0];
    ok('[O] B2 — à la MÊME charge, une autre série ne fait pas d’un test tenu un test raté',
      rienNaBouge(avantB, photo(sid)) && testB.valeur_observee === plan[2][1], dire(sid));
    await abandonner();

    // ── C. « + Série » avant la 3ᵉ ───────────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await faireLePlan(plan, 2);
    const avantC = photo(sid);
    await plusSerie();
    await saisirSerie(2, plan[2][0], plan[2][1]);
    await saisirSerie(3, leger[0], leger[1]);
    await attendre(1200);
    const rang2C = lignesDe(sid).filter((l) => l.fondement.rang === 2)[0];
    ok('[O] C — l’observation juste du rang 2 reste sur la série 2',
      rienNaBouge(avantC, photo(sid)) && serieDe(rang2C.set_observe) === 2 &&
      rang2C.valeur_observee === plan[1][1], dire(sid));
    await abandonner();

    // ── E2. la proposition du coach, puis « + Série » juste après ────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await saisirSerie(0, plan[0][0], plan[0][1] + 3);
    const [cranTxt, fourchette] = await (await ligne(1)).$$eval('input', (l) => l.map((x) => x.placeholder));
    const cran = Number(String(cranTxt).replace(',', '.')), bas = Number(String(fourchette).split('-')[0]);
    await saisirSerie(1, cran, bas);
    await attendre(1200);
    const avantE = photo(sid);
    const rang2E = () => lignesDe(sid).filter((l) => l.fondement.rang === 2);
    // 49-C : un seul pari sur la série proposée, celui du coach (avant : le
    // pari de l'ouverture l'accompagnait sur le même rang).
    ok('[O] E2 — prémisse : le pari du rang 2 est sur la série proposée',
      rang2E().length === 1 && rang2E().every((l) => serieDe(l.set_observe) === 2) &&
      rang2E().some((l) => l.fondement.revision === 1 && l.valeur_observee === bas), dire(sid));
    await plusSerie();
    await saisirSerie(2, cran, bas + 2);
    await saisirSerie(3, plan[2][0], plan[2][1]);
    await attendre(1200);
    ok('[O] E2 — « + Série » juste après : la proposition reste jugée sur SA série',
      rienNaBouge(avantE, photo(sid)) && rang2E().every((l) => serieDe(l.set_observe) === 2),
      dire(sid));
    await abandonner();

    // ── LA SUPPRESSION, PUIS UNE FRAPPE SUR s1 ───────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await faireLePlan(plan, 3);
    const rang = (r) => lignesDe(sid).filter((l) => l.fondement.rang === r)[0];
    const id2 = rang(2).id, id1 = rang(1).id, s1 = rang(1).set_observe;
    await toucher(1, '.no-serie');
    await page.click('#feuille-contenu .feuille-menu button.danger');   // Supprimer la série
    await attendre(2000);
    const local2 = await localPred(id2);
    ok('[O] la série observée supprimée : l’observation se vide, en base ET dans l’app',
      rang(2).set_observe === null && rang(2).valeur_observee === null &&
      !!local2 && local2.set_observe === null && local2.valeur_observee === null && local2.observee_a === null,
      JSON.stringify({ base: dire(sid), local: local2 && [local2.set_observe, local2.valeur_observee] }));
    // s1 porte maintenant le rang 2 (alignement par la fin). Une frappe sur
    // ses reps refait SON observation — et rien d'autre.
    const champs = await (await ligne(0)).$$('input');
    await champs[1].fill(String(plan[0][1] + 1));
    await champs[1].evaluate((e) => e.blur());
    await attendre(1500);
    const local2b = await localPred(id2);
    ok('[O] une frappe sur s1 ne rattache PAS le pari du rang 2 à s1',
      rang(2).set_observe === null && rang(2).valeur_observee === null &&
      !!local2b && local2b.set_observe === null, dire(sid));
    ok('[O] et s1 relit SON pari : la correction suit (48c-2)',
      rang(1).id === id1 && rang(1).set_observe === s1 && rang(1).valeur_observee === plan[0][1] + 1,
      dire(sid));
    await abandonner();
    await aller('/saisie');

    ok('[O] aucune erreur de page pendant ces glissements',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 octovicies. LA SÉANCE EN COURS FAIT FOI (§9.13, §9.11, §9.14 — 49-C) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : une séance qui ne compte PAS autant de
  // séries de travail que la consigne (`n` = 3 sur l'historique du soulevé) —
  // 4 dans une routine, 2 dans une autre —, des séries ajoutées avant et après
  // le test, un retrait, un rechargement. À trois séries et sans geste,
  // l'ancienne couverture (« les n dernières ») et la nouvelle donnent
  // exactement le même écran : c'est ce qui a laissé passer le constat du
  // 26/09 (routine à 4, première série sans consigne, aucune réaction).
  {
    const routineTerre = (id, nom, n) => ({ id: id, nom: nom, note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: id + '-e', routine_id: id, exercise_slug: 'souleve-terre', rang: 0,
        routine_sets: progr(n, 8), repos_cible_s: 180, groupe_superset: null, note: null }] });
    ROUTINES.push(routineTerre('r-terre-4', 'Terre ×4', 4), routineTerre('r-terre-2', 'Terre ×2', 2));
    const idSeance = () => base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];
    const parisDe = (sid) => base.predictions.filter((l) => l.exercise_slug === 'souleve-terre' &&
      l.fondement && l.fondement.seance === sid).sort((a, b) => a.fondement.rang - b.fondement.rang);
    const rangDuSet = (id) => { const s = base.sets.find((x) => x.id === id); return s ? s.rang : null; };
    const dire = (sid) => JSON.stringify(parisDe(sid).map((l) => l.fondement.rang + ':' +
      (l.fondement.role || '?') + ':' + l.fondement.charge + '×' + l.valeur_predite + '→' +
      (l.set_observe ? 's' + rangDuSet(l.set_observe) : '∅') + ':' + l.valeur_observee));
    const fantomesC = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) =>
      (l.classList.contains('proposee') ? '*' : '') + Array.from(l.querySelectorAll('input'))
        .map((i) => (i.value ? '[' + i.value + ']' : (i.placeholder || '∅'))).join('×')));
    const phrasesC = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.bloc-seance .reaction-serie')).map((n) => n.textContent));
    const plusC = async () => {
      await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
      await attendre(900);
    };
    const lue = async (i) => {
      const [c, r] = await (await ligne(i)).$$eval('input', (l) => l.map((x) => x.placeholder));
      return [Number(String(c).replace(',', '.')), Number(String(r).split('-')[0])];
    };
    const X = (v) => String(v[0]).replace('.', ',') + '×' + v[1];

    await aller('/saisie');
    const noms = await page.evaluate(() => Array.from(document.querySelectorAll('.routine-rangee .routine-nom'))
      .map((n) => n.textContent));
    ok('[C] prémisse : les routines « Terre ×4 » et « Terre ×2 » sont arrivées',
      noms.indexOf('Terre ×4') >= 0 && noms.indexOf('Terre ×2') >= 0, JSON.stringify(noms));

    // La référence : la consigne sur la routine à trois, que l'historique donne.
    await demarrerRoutine('Terre');
    await attendre(600);
    const ref = [await lue(0), await lue(1), await lue(2)];
    ok('[C] prémisse : une consigne sur 3 séries, la dernière plus lourde (le test)',
      ref.every((v) => v[0] > 0 && v[1] > 0) && ref[2][0] > ref[0][0], JSON.stringify(ref));
    const Lg = X(ref[0]), Tst = X(ref[2]);
    await abandonner();

    // ── ROUTINE À 4 SUR UN HISTORIQUE À 3 ────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(600);
    ok('[C] routine à 4, historique à 3 : QUATRE séries couvertes, le test sur la dernière',
      JSON.stringify(await fantomesC()) === JSON.stringify([Lg, Lg, Lg, Tst]), JSON.stringify(await fantomesC()));
    await saisirSerie(0, ref[0][0], ref[0][1] + 3);
    await attendre(900);
    const ph4 = await phrasesC();
    const f4 = await fantomesC();
    ok('[C] la PREMIÈRE série a sa consigne, et réagit : proposition sur la série 2',
      ph4.length === 1 && /de plus que visé/.test(ph4[0]) && /ta série 2 /.test(ph4[0]) &&
      f4[1].charAt(0) === '*', JSON.stringify({ ph4, f4 }));
    await abandonner();

    // ── ROUTINE À 2 SUR UN HISTORIQUE À 3 ────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre ×2');
    await attendre(900);
    let sid = idSeance();
    ok('[C] routine à 2 : la ligne, puis le test',
      JSON.stringify(await fantomesC()) === JSON.stringify([Lg, Tst]), JSON.stringify(await fantomesC()));
    ok('[C] RIEN À L’OUVERTURE : aucun pari avant une validation',
      parisDe(sid).length === 0, dire(sid));
    await saisirSerie(0, ref[0][0], ref[0][1]);
    await saisirSerie(1, ref[2][0], ref[2][1]);
    await attendre(1500);
    const p2 = parisDe(sid);
    const setsDe = (s) => base.sets.filter((x) => x.session_id === s).map((x) => x.id);
    ok('[C] un pari PAR SÉRIE VALIDÉE, écrit à sa validation — et AUCUN sans série',
      p2.length === 2 && p2.map((l) => l.fondement.rang + ':' + l.fondement.role).join() === '1:ligne,2:haut' &&
      p2.every((l) => setsDe(sid).indexOf(l.set_observe) >= 0) && p2[1].valeur_observee === ref[2][1],
      dire(sid));
    await abandonner();

    // ── « + SÉRIE » AVANT LE TEST ────────────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await saisirSerie(0, ref[0][0], ref[0][1]);
    await saisirSerie(1, ref[1][0], ref[1][1]);
    await plusC();
    const fAvant = await fantomesC();
    ok('[C] « + Série » AVANT le test : le test passe sur la nouvelle dernière',
      fAvant[2] === Lg && fAvant[3] === Tst, JSON.stringify(fAvant));
    await saisirSerie(2, ref[0][0], ref[0][1]);
    await saisirSerie(3, ref[2][0], ref[2][1]);
    await attendre(1500);
    const pc = parisDe(sid);
    ok('[C] et chaque série a SON pari, à son rang : la 3ᵉ à la ligne, la 4ᵉ au test',
      pc.length === 4 && pc.map((l) => l.fondement.rang + ':' + l.fondement.role).join() ===
        '1:ligne,2:ligne,3:ligne,4:haut' && pc.every((l) => rangDuSet(l.set_observe) === l.fondement.rang),
      dire(sid));
    await abandonner();

    // ── « + SÉRIE » APRÈS LE TEST FAIT, PUIS RECHARGEMENT ────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    for (let i = 0; i < 3; i++) await saisirSerie(i, ref[i][0], ref[i][1]);
    await attendre(900);
    await plusC();
    const fApres = await fantomesC();
    const test3 = parisDe(sid).filter((l) => l.fondement.rang === 3)[0];
    ok('[C] « + Série » APRÈS le test fait : la série ajoutée reçoit la LIGNE, le test reste sur la 3ᵉ',
      fApres[3] === Lg && !!test3 && test3.fondement.role === 'haut' && rangDuSet(test3.set_observe) === 3,
      JSON.stringify({ fApres, paris: dire(sid) }));
    const empreinte = () => JSON.stringify(parisDe(sid).map((l) =>
      [l.id, l.fondement.rang, l.fondement.role, l.set_observe, l.valeur_observee]));
    const parisAvant = empreinte();
    await page.close();
    page = await ctx.newPage();
    brancher(page);
    await aller('/saisie');
    await attendre(1200);
    const fRecharge = await fantomesC();
    ok('[C] RECHARGEMENT en pleine séance : mêmes rangs, mêmes rôles — la série ajoutée reste à la ligne',
      JSON.stringify(fRecharge) === JSON.stringify(fApres) && empreinte() === parisAvant,
      JSON.stringify({ avant: fApres, apres: fRecharge }));
    await abandonner();

    // ── RETRAIT D'UNE SÉRIE NON VALIDÉE ──────────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('Terre');
    await attendre(600);
    sid = idSeance();
    await saisirSerie(0, ref[0][0], ref[0][1]);
    await attendre(900);
    const avantRetrait = empreinte();
    await toucher(1, '.no-serie');
    await page.click('#feuille-contenu .feuille-menu button.danger');   // Supprimer la série
    await attendre(1500);
    const fRetrait = await fantomesC();
    ok('[C] retirer une série NON validée : rien de ce qui est fait ne bouge, le test reste le dernier',
      empreinte() === avantRetrait && fRetrait.length === 2 && fRetrait[1] === Tst &&
      /^\[/.test(fRetrait[0]), JSON.stringify({ fRetrait, paris: dire(sid) }));
    await abandonner();

    // ── UNE SÉRIE PLUS LÉGÈRE NOTÉE EN TRAVAIL N'EST PAS UN REFUS ────────
    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(600);
    sid = idSeance();
    await saisirSerie(0, ref[0][0] - 20, ref[0][1] + 3);
    await saisirSerie(1, ref[0][0], ref[0][1] + 3);
    await attendre(900);
    const phL = await phrasesC();
    const p1L = parisDe(sid).filter((l) => l.fondement.rang === 1)[0];
    ok('[C] une série PLUS LÉGÈRE en travail : pas un refus — la suivante propose encore',
      phL.length === 1 && /ta série 3 /.test(phL[0]), JSON.stringify(phL));
    ok('[C] et son pari dit « autre chose tenté » : reliée, rien de compté',
      !!p1L && rangDuSet(p1L.set_observe) === 1 && p1L.valeur_observee === null && p1L.observee_a === null,
      dire(sid));
    await abandonner();

    // ── HORS ROUTINE : LE NOMBRE DE SÉRIES POSÉ AU DÉPART ────────────────
    // Le curl : sa dernière séance, cinq séries de travail (et une chauffe),
    // une seconde avant maintenant — l'habitude, qui n'est ni 3 ni 2.
    {
      const tM = Date.now();
      const debut = ilYa(1000, tM).toISOString();
      base.sessions.push({ id: 'curl-49c', user_id: 'u-banc', titre: 'Bras — 49-C', debut,
        fin: finDe(debut, tM).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      [['echauffement', 6, 15], ['travail', 12, 12], ['travail', 12, 12], ['travail', 12, 11],
       ['travail', 12, 10], ['travail', 12, 10]].forEach(([type, kg, reps], i) => base.sets.push({
        id: 'curl-49c-s' + (i + 1), session_id: 'curl-49c', user_id: 'u-banc', exercise_slug: 'curl',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: type,
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    }
    await seanceVide();
    await ajouterExoSeance('Curl');
    const nCurl = await compter('.ligne-serie');
    const typesCurl = await page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie'))
      .map((l) => (l.querySelector('.no-serie') || {}).textContent));
    ok('[C] hors routine, un exercice déjà fait : pré-rempli à SON habitude (5 séries de travail)',
      nCurl === 5, nCurl + ' ligne(s) ' + JSON.stringify(typesCurl));
    await abandonner();
    // En ÉDITION d'une séance passée, il n'y a pas de séance en cours à
    // proposer : l'exercice ajouté arrive avec une ligne, comme avant 49-C.
    await ouvrirMenuDe('Bras — 49-C');
    await entree('Modifier');
    await attendre(600);
    const avantEd = await compter('.ligne-serie');
    await ajouterExoSeance('Mollets');
    ok('[C] EN ÉDITION d’une séance passée : l’exercice ajouté arrive avec UNE ligne',
      avantEd === 6 && (await compter('.ligne-serie')) === avantEd + 1,
      avantEd + ' → ' + (await compter('.ligne-serie')) + ' ligne(s)');
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(2600);
    ok('[C] et l’enregistrer n’écrit aucune ligne vide : la séance garde ses 6 séries',
      base.sets.filter((x) => x.session_id === 'curl-49c').length === 6,
      base.sets.filter((x) => x.session_id === 'curl-49c').length + ' série(s)');
    await seanceVide();
    await ajouterExoSeance('Mollets');
    ok('[C] hors routine, un exercice jamais fait, en Progresser : 3 séries',
      (await compter('.ligne-serie')) === 3, (await compter('.ligne-serie')) + ' ligne(s)');
    await abandonner();
    base.profiles[0].intention = 'entretien';
    await seanceVide();
    await ajouterExoSeance('Mollets');
    ok('[C] hors routine, un exercice jamais fait, en Entretenir : 2 séries',
      (await compter('.ligne-serie')) === 2, (await compter('.ligne-serie')) + ' ligne(s)');
    await abandonner();
    base.profiles[0].intention = 'progresser';
    await aller('/saisie');

    ok('[C] aucune erreur de page pendant la séance qui fait foi',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 novovicies. LE PLAN DE SÉANCE, UN SEUL COACH (§9.13 bis, §9.14, ECRAN §3.12 — 49-U1) ══');
  //
  // ⚠️ LE CAS DU 26/09/2026, REJOUÉ SUR LE VRAI `app.js`. La consigne (`etend`,
  // palier 125, deux tests à 130, `n` = 4 de la dernière séance) sur une
  // routine à 3 : l'en-tête décrivait 4 séries quand la grille en montrait 3,
  // et après 125 × 8 la réaction proposait 127,5 SUR LA SÉRIE PRÉVUE EN TEST
  // À 130. Sans ce décor (n ≠ nombre de séries, un cran plus bas que le test),
  // l'ancien code et le nouveau donnent le même écran.
  //
  // Après CHAQUE geste, `THPlan.verifierPlan` repasse sur le plan que l'app
  // vient de calculer, avec ses entrées (I1, I2, I3, I6, I9, I12).
  {
    const tH = Date.now();
    const poserHip = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tH).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Fessiers — ' + id, debut,
        fin: finDe(debut, tH).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'hip-thrust',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserHip('hip-z', 25, [[127.5, 3], [127.5, 3], [127.5, 3]]);
    poserHip('hip-a', 21, [[120, 5], [120, 5], [120, 5]]);
    poserHip('hip-b', 14, [[122.5, 5], [122.5, 5], [122.5, 5]]);
    poserHip('hip-c', 7, [[125, 5], [125, 5], [125, 5], [130, 4]]);
    ROUTINES.push({ id: 'r-hip', nom: 'Hip ×3', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-hip-e', routine_id: 'r-hip', exercise_slug: 'hip-thrust', rang: 0,
        routine_sets: progr(3, 8), repos_cible_s: 180, groupe_superset: null, note: null }] });

    const nb = (x) => JSON.stringify(x).replace(/ /g, ' ');
    const enTeteU = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne')).map((e) => e.textContent));
    const grilleU = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) =>
      (l.classList.contains('proposee') ? '*' : '') + Array.from(l.querySelectorAll('input'))
        .map((i) => (i.value ? '[' + i.value + ']' : (i.placeholder || '∅'))).join('×')));
    const phrasesU = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.bloc-seance .reaction-serie')).map((n) => n.textContent));
    const invariants = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      if (!d) return { ok: false, erreurs: ['aucun plan calculé'] };
      return window.THPlan.verifierPlan(d.plan, d.entrees);
    });
    const verifierApres = async (geste) => {
      const v = await invariants();
      ok('[U] invariants du plan après « ' + geste + ' »', v.ok, v.ok ? 'I1 I2 I3 I6 I9 I12' : nb(v.erreurs.slice(0, 3)));
    };
    const idSeanceU = () => base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];

    await aller('/saisie');
    await demarrerRoutine('Hip ×3');
    await attendre(800);
    await verifierApres('ouverture');
    const entete0 = await enTeteU();
    ok('[U] DISCRIMINANT — l’en-tête décrit les 3 séries de la grille, pas les 4 de la dernière séance',
      nb(entete0) === nb(['130 kg × 4 sur les 2 dernières séries', '125 kg × 5 sur celle d\'avant']),
      nb(entete0));
    ok('[U] la grille : la ligne, puis deux tests à 130',
      nb(await grilleU()) === nb(['125×5', '130×4', '130×4']), nb(await grilleU()));

    await saisirSerie(0, 125, 8);
    await attendre(900);
    await verifierApres('125 × 8');
    const g1 = await grilleU();
    const ph1 = await phrasesU();
    ok('[U] DISCRIMINANT — 125 × 8 : AUCUNE proposition à 127,5, la série 2 reste le test à 130',
      g1[1] === '130×4' && g1.every((x) => x.charAt(0) !== '*') && !/127,5/.test(g1.join(' ') + ph1.join(' ')),
      nb({ g1, ph1 }));
    ok('[U] et la phrase est celle de la décision du 26/09 : le test arrive, avec de la marge',
      nb(ph1) === nb(['125 kg × 8, 3 de plus que prévu : ton test à 130 kg arrive dès la série 2, avec de la marge.']),
      nb(ph1));

    await saisirSerie(1, 130, 4);
    await attendre(1200);
    await verifierApres('130 × 4 en série 2');
    const ph2 = await phrasesU();
    ok('[U] 130 × 4 en série 2 : PAS de « ton test a avancé » à tort',
      !ph2.some((x) => /ton test a avancé/.test(x)), nb(ph2));
    const sidU = idSeanceU();
    const parisU = base.predictions.filter((l) => l.exercise_slug === 'hip-thrust' && l.fondement &&
      l.fondement.seance === sidU).sort((a, b) => a.fondement.rang - b.fondement.rang);
    ok('[U] et le pari de la série 2 est celui du TEST à 130, pas d’une proposition',
      parisU.length === 2 && parisU[1].fondement.role === 'haut' && parisU[1].fondement.charge === 130 &&
      !parisU[1].fondement.revision && parisU[1].valeur_observee === 4,
      nb(parisU.map((l) => l.fondement.rang + ':' + l.fondement.role + ':' + l.fondement.charge + '→' + l.valeur_observee)));

    // ── D7 — LA CONSIGNE EST FIGÉE POUR LA SÉANCE ───────────────────────
    // Une séance ANTÉRIEURE plus récente arrive en base pendant la séance (une
    // séance corrigée ailleurs, un import) ; une synchronisation la ramène.
    // La consigne de la séance ne change pas : elle servira à la suivante.
    poserHip('hip-d', 0.1, [[130, 5], [130, 5], [130, 5], [135, 3]]);
    await onglet('racine');
    await page.evaluate(() => document.getElementById('btn-rafraichir').click());
    await attendre(2600);
    await onglet('saisie');
    await attendre(900);
    ok('[U] D7 — une synchronisation en pleine séance ne change pas la consigne : même en-tête',
      nb(await enTeteU()) === nb(entete0), nb(await enTeteU()));
    ok('[U] …et la série 3 garde le test à 130 (la séance arrivée derrière le dirait à 135)',
      (await grilleU())[2] === '130×4', nb(await grilleU()));
    await verifierApres('synchronisation');
    await abandonner();

    // ── SANS TEST À SUIVRE : LA PROPOSITION CLASSIQUE DE R2 ──────────────
    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    const refT = await (await ligne(0)).$$eval('input', (l) => l.map((x) => x.placeholder));
    const cT = Number(String(refT[0]).replace(',', '.')), vT = Number(refT[1]);
    await saisirSerie(0, cT, vT + 3);
    await attendre(900);
    await verifierApres('+3 sur la série 1, routine à 4');
    const phT = await phrasesU();
    ok('[U] sans test à suivre, la proposition de R2 tient : la série 2 est proposée',
      phT.length === 1 && /de plus que visé/.test(phT[0]) && /ta série 2 /.test(phT[0]) &&
      (await grilleU())[1].charAt(0) === '*', nb({ phT, g: await grilleU() }));

    // ── 49-U6 — LA FEUILLE « POURQUOI » LIT LE PLAN (ECRAN §3.10) ────────
    // ⚠️ CONFIGURATION DISCRIMINANTE : une routine à 4 sur un historique dont
    // la consigne dit `n` = 3. Une feuille qui relirait la consigne brute
    // décrirait 3 séries ; la grille en porte 4. Et une proposition du coach :
    // la ligne 2 n'est pas celle de la consigne.
    const feuilleU = () => page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .pq-plan'))
      .map((n) => n.querySelector('.pq-quoi').textContent + ' | ' + n.querySelector('.pq-role').textContent));
    const planFeuilleU = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'souleve-terre')[0];
      if (!x || !x.pourquoi) return null;
      return { n: x.consigne.n,
        grille: x.lignes.filter((l) => l.role !== 'hors').map((l) => [l.rang, l.role, l.charge, l.vise]),
        feuille: x.pourquoi.lignes.map((f) => [f.rang, f.role, f.charge, f.vise]) };
    });
    const ouvrirFeuilleU = async () => {
      await page.evaluate(() => {
        const c = document.querySelector('.legende-exo .consigne, .legende-exo .consigne-dit');
        if (c) c.click();
      });
      await attendre(700);
    };
    const chargeDe = (t) => String(t).split(/\s*kg/)[0];
    const feuilleCommeLaGrille = async (quand) => {
      await ouvrirFeuilleU();
      const f = await feuilleU();
      const p = await planFeuilleU();
      const rangs = (await grilleU()).length;
      ok('[U6] ' + quand + ' — la feuille décrit les ' + rangs + ' lignes de la grille, pas les ' + (p && p.n) + ' de la consigne',
        !!p && rangs === 4 && p.n === 3 && f.length === rangs && nb(p.feuille) === nb(p.grille) &&
        f.every((t, k) => chargeDe(t) === String(p.grille[k][2]).replace('.', ',')),
        nb({ f, p }));
      await fermerFeuille();
      return f;
    };

    const f1 = await feuilleCommeLaGrille('proposition affichée');
    ok('[U6] la ligne 2 est dite « proposée après » la série 1, à la charge proposée',
      f1.length > 1 && /proposée par le coach · proposée après /.test(f1[1]) && !/\./.test(f1.join(' ')), nb(f1));
    const phProp = await (await ligne(1)).$$eval('input', (l) => l.map((x) => x.placeholder));
    const cProp = Number(String(phProp[0]).replace(',', '.')), vProp = Number(String(phProp[1]).split('-')[0]);
    await saisirSerie(1, cProp, vProp);
    await attendre(900);
    await verifierApres('proposition acceptée');
    const f2 = await feuilleCommeLaGrille('après une proposition acceptée');
    ok('[U6] la ligne acceptée est décrite FIGÉE, telle que validée (faite à la charge proposée)',
      f2.length > 1 && /proposée après /.test(f2[1]) && f2[1].indexOf('faite') >= 0 &&
      f2[1].indexOf(String(cProp).replace('.', ',')) >= 0, nb({ f2, cProp }));
    await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await attendre(2600);
    await verifierApres('rechargement');
    const f3 = await feuilleCommeLaGrille('après un rechargement');
    ok('[U6] DISCRIMINANT — après un rechargement, la feuille est IDENTIQUE', nb(f3) === nb(f2), nb({ f2, f3 }));
    await abandonner();

    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    await saisirSerie(0, cT, vT + 3);
    await attendre(900);
    await saisirSerie(1, cT, vT);
    await attendre(900);
    await verifierApres('proposition refusée');
    const f4 = await feuilleCommeLaGrille('après une proposition refusée');
    ok('[U6] refusée, la ligne 2 dit ce qui a été fait (à ' + String(cT).replace('.', ',') + ')',
      f4.length > 1 && f4[1].indexOf('faite') >= 0 && f4[1].indexOf(String(cT).replace('.', ',') + ' kg ×') >= 0,
      nb(f4));
    await abandonner();
    await aller('/saisie');

    ok('[U] aucune erreur de page pendant le plan de séance',
      erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 tricies. UNE SÉANCE NE RESTE PLUS BLOQUÉE SUR LE TÉLÉPHONE (409, démarrage, brouillon — 26/09) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : UNE SÉANCE `en_cours` EN BASE, LE
  // TÉLÉPHONE SANS SON BROUILLON, ET UNE SYNCHRONISATION LENTE. Réseau rapide,
  // la fenêtre où « Démarrer » était offert avant que la séance ouverte en base
  // soit vue dure quelques millisecondes : aucune mesure ne la voit. Le 26/09,
  // elle a duré assez pour lancer B — 409, et B n'a existé que sur le téléphone
  // pendant onze minutes, jusqu'à « Terminer ».
  {
    const idbT = (p) => (p || page).evaluate(() => new Promise((res) => {
      const r = indexedDB.open('trainhub-v2');
      r.onsuccess = () => {
        const tx = r.result.transaction(['attente', 'brouillon'], 'readonly');
        const out = {};
        tx.objectStore('attente').getAll().onsuccess = (e) => { out.file = e.target.result; };
        tx.objectStore('brouillon').get('seance').onsuccess = (e) => {
          out.brouillon = (e.target.result && e.target.result.valeur) || null;
        };
        tx.oncomplete = () => { r.result.close(); res(out); };
      };
    }));
    // Le téléphone « perd » sa séance : brouillon et file effacés, la base
    // garde la séance ouverte. C'est l'état du 26/09 à la réouverture.
    const perdreLocal = () => page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('trainhub-v2');
      r.onsuccess = () => {
        const tx = r.result.transaction(['brouillon', 'attente'], 'readwrite');
        tx.objectStore('brouillon').clear(); tx.objectStore('attente').clear();
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    }));
    const enCours = () => base.sessions.filter((x) => x.user_id === MOI && x.statut === 'en_cours').map((x) => x.id);
    const statutDe = (id) => (base.sessions.find((x) => x.id === id) || {}).statut || '(absente)';
    const setsDe = (id) => base.sets.filter((x) => x.session_id === id).length;
    const boutonsDemarrer = () => compter('.routine-rangee .demarrer');
    const recharger = async (ms) => {
      await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await attendre(ms);
    };
    const etatT = async () => (await texte('#etat-sync')).trim();
    const nettoyer = async () => {
      base.lenteur = 0; base.enCoursEnPanne = false; base.reseau = true;
      await aller('/saisie');
      if ((await visible())[0] === 'vue-seance') await abandonner();
      base.sessions.forEach((x) => { if (x.user_id === MOI && x.statut === 'en_cours') x.statut = 'terminee'; });
    };
    await nettoyer();

    // ── C — LA FERMETURE IMMÉDIATE APRÈS LE LANCEMENT ────────────────────
    // Non-régression : le brouillon s'écrit, attendu, AVANT l'envoi. Ce banc
    // ne reproduit pas la perte du 26/09 (voir la PR) — il garde ce qui tient.
    for (const delai of [0, 30]) {
      await aller('/saisie');
      await page.evaluate(() => {
        const r = Array.from(document.querySelectorAll('.routine-rangee'))
          .filter((x) => x.querySelector('.routine-nom').textContent === 'Push')[0];
        r.querySelector('.demarrer').click();
      });
      if (delai) await attendre(delai);
      await page.close({ runBeforeUnload: false });
      page = await ctx.newPage(); brancher(page);
      await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await attendre(2600);
      const d = await idbT();
      ok('[409] C — page fermée ' + delai + ' ms après « Démarrer » : la séance est là à la réouverture',
        !!d.brouillon && (await visible())[0] === 'vue-seance' && (await boutonsDemarrer()) === 0,
        JSON.stringify({ brouillon: d.brouillon && d.brouillon.id, vue: await visible() }));
      await nettoyer();
    }

    // ── B — LA SÉANCE OUVERTE EN BASE EST REPRISE AVANT TOUT « DÉMARRER » ─
    await aller('/saisie');
    await demarrerRoutine('Push');
    const idA = enCours()[0];
    ok('[409] prémisse : A est en cours en base', !!idA, JSON.stringify(enCours()));
    await perdreLocal();
    base.lenteur = 6000;
    await recharger(1800);
    // La synchronisation complète n'est PAS finie (6 s) : c'est la fenêtre.
    ok('[409] B — réouverture sans brouillon, synchro lente : A est REPRISE, aucun « Démarrer »',
      (await visible())[0] === 'vue-seance' && (await boutonsDemarrer()) === 0 &&
      ((await idbT()).brouillon || {}).id === idA,
      JSON.stringify({ vue: await visible(), demarrer: await boutonsDemarrer(),
        brouillon: ((await idbT()).brouillon || {}).id }));
    await attendre(6000);
    await nettoyer();

    // ── A — LE CAS DU 26/09 : B NAÎT FACE À A OUVERTE → 409 → RÉSOLU ─────
    // La vérification du démarrage échoue (réseau capricieux) : rien ne
    // bloque, « Démarrer » est offert, B est lancée alors que A est ouverte en
    // base. C'est la vidange qui doit résoudre — sans « Terminer ».
    await aller('/saisie');
    await demarrerRoutine('Push');
    const idA2 = enCours()[0];
    await perdreLocal();
    // Synchro plus lente encore : la lecture en panne est retentée par le
    // client (1 s, 2 s, 4 s) avant d'échouer, et la synchro ne part qu'après.
    base.lenteur = 12000; base.enCoursEnPanne = true;
    const refus0 = base.journal.length;
    await recharger(500);
    for (let t = 0; t < 40 && (await boutonsDemarrer()) === 0; t++) await attendre(500);
    ok('[409] A — prémisse : la vérification a échoué, « Démarrer » est offert',
      (await boutonsDemarrer()) > 0, String(await boutonsDemarrer()));
    // La lecture revient : c'est ce que la vidange utilisera pour refermer A.
    base.enCoursEnPanne = false;
    await demarrerRoutine('Push');
    await attendre(800);
    const idB = enCours().filter((x) => x !== idA2)[0] || enCours()[0];
    const refus409 = base.journal.slice(refus0).filter((j) => j.op === 'refus' && j.refus === '23505').length;
    ok('[409] A — B a heurté A en base (409 `sessions_une_seule_en_cours`)', refus409 >= 1, String(refus409));
    ok('[409] A — DÈS LE 409 : A refermée, B montée en cours — sans « Terminer », synchro pas finie',
      statutDe(idA2) === 'terminee' && !!idB && idB !== idA2 && statutDe(idB) === 'en_cours',
      JSON.stringify({ A: statutDe(idA2), B: idB && statutDe(idB) }));
    await saisirSerie(0, 100, 5);
    await saisirSerie(1, 100, 5);
    await attendre(900);
    const dA = await idbT();
    ok('[409] A — les séries de B arrivent en base au fil de la séance, et sa file est vide',
      setsDe(idB) === 2 && dA.file.length === 0,
      JSON.stringify({ sets: setsDe(idB), file: dA.file.map((e) => e.cle + (e.bloquee ? ' BLOQUÉE' : '')) }));
    ok('[409] A — l’état ne dit jamais « refusé »', !/refus/i.test(await etatT()), await etatT());
    await attendre(12000);
    await nettoyer();

    // ── A3 — UNE FILE DÉJÀ BLOQUÉE SUR LE TÉLÉPHONE ─────────────────────
    // L'état exact d'un téléphone du 26/09 : B et sa série en file, la séance
    // marquée DÉFINITIVE sur le conflit, A ouverte en base. On le fabrique :
    // B lancée hors ligne, une série validée, puis l'entrée marquée à la main.
    await aller('/saisie');
    base.reseau = false;
    await demarrerRoutine('Push');
    await saisirSerie(0, 100, 5);
    await attendre(600);
    const idB3 = ((await idbT()).brouillon || {}).id;
    await page.evaluate((id) => new Promise((res) => {
      const r = indexedDB.open('trainhub-v2');
      r.onsuccess = () => {
        const tx = r.result.transaction(['attente'], 'readwrite');
        const st = tx.objectStore('attente');
        st.get('sessions:' + id).onsuccess = (e) => {
          const v = e.target.result;
          st.put(Object.assign({}, v, { essais: 1, bloquee: { code: '23505',
            message: 'duplicate key value violates unique constraint "sessions_une_seule_en_cours"' } }));
        };
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    }), idB3);
    const idA3 = '40000000-0000-4000-8000-00000000a409';
    const debutA3 = ilYa(600000).toISOString();   // ouverte il y a dix minutes
    base.sessions.push({ id: idA3, user_id: MOI, titre: 'Ouverte ailleurs', debut: debutA3,
      fin: null, statut: 'en_cours', note: null, salle: null, salle_norme: null, routine_id: null,
      source: 'app', created_at: debutA3 });
    const bloqueeAvant = ((await idbT()).file.find((e) => e.cle === 'sessions:' + idB3) || {}).bloquee;
    ok('[409] A3 — prémisse : la séance est bloquée DÉFINITIVE dans la file, B absente de la base',
      !!bloqueeAvant && statutDe(idB3) === '(absente)', JSON.stringify({ bloqueeAvant, B: statutDe(idB3) }));
    base.reseau = true;
    await recharger(3500);
    const d3 = await idbT();
    ok('[409] A3 — au démarrage : débloquée ET envoyée — B en base avec sa série, A refermée, file vide',
      statutDe(idB3) === 'en_cours' && setsDe(idB3) === 1 && statutDe(idA3) === 'terminee' && d3.file.length === 0,
      JSON.stringify({ B: statutDe(idB3), sets: setsDe(idB3), A: statutDe(idA3),
        file: d3.file.map((e) => e.cle + (e.bloquee ? ' BLOQUÉE' : '')) }));
    ok('[409] A3 — l’état ne dit pas « refusé »', !/refus/i.test(await etatT()), await etatT());
    await nettoyer();

    ok('[409] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 untricies. LE FANTÔME D’UNE LIGNE VIENT D’UNE SEULE SOURCE (§9.13 bis, I11 — 49-U2) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : UN ÉCART, PUIS UN RETOUR AU PLAN, ET UN
  // REFUS SUIVI D'UN TEST. Sans écart, l'ancienne cascade et le plan donnent le
  // même fantôme. Après un écart, l'ancienne prenait la charge tapée et les reps
  // du plan (« 125 × 4 ») ; après un retour, elle continuait parfois de
  // recopier. Et « valider sans rien taper » écrivait ce mélange en base.
  //
  // Après CHAQUE geste, `THPlan.verifierPlan` repasse sur le plan que l'app
  // vient de calculer (I11 compris).
  {
    const tL = Date.now();
    const poserLE = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tL).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Quadriceps — ' + id, debut,
        fin: finDe(debut, tL).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'leg-extension',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserLE('le-z', 25, [[52.5, 3], [52.5, 3], [52.5, 3]]);
    poserLE('le-a', 21, [[45, 5], [45, 5], [45, 5]]);
    poserLE('le-b', 14, [[47.5, 5], [47.5, 5], [47.5, 5]]);
    poserLE('le-c', 7, [[50, 5], [50, 5], [50, 5], [55, 4]]);
    ROUTINES.push({ id: 'r-le', nom: 'LE ×4', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-le-e', routine_id: 'r-le', exercise_slug: 'leg-extension', rang: 0,
        routine_sets: progr(4, 8), repos_cible_s: 90, groupe_superset: null, note: null }] });

    const nbF = (x) => JSON.stringify(x).replace(/ /g, ' ');
    const grilleF = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) =>
      (l.classList.contains('proposee') ? '*' : '') + Array.from(l.querySelectorAll('input'))
        .map((i) => String(i.value ? '[' + i.value + ']' : (i.placeholder || '∅')).replace(',', '.')).join('×')));
    const invariantsF = async (geste) => {
      const v = await page.evaluate(() => {
        const d = window.THPlan && window.THPlan.dernier;
        if (!d) return { ok: false, erreurs: ['aucun plan calculé'] };
        return window.THPlan.verifierPlan(d.plan, d.entrees);
      });
      ok('[F] invariants du plan après « ' + geste + ' »', v.ok, v.ok ? 'I1 I2 I3 I6 I9 I11 I12' : nbF(v.erreurs.slice(0, 3)));
    };
    const ouvrirLE = async () => {
      await aller('/saisie');
      await demarrerRoutine('LE ×4');
      await attendre(800);
    };

    // ── L'ÉCART, PUIS LE RETOUR AU PLAN ─────────────────────────────────
    await ouvrirLE();
    await invariantsF('ouverture');
    const g0 = await grilleF();
    ok('[F] prémisse : le décor donne la ligne 50 × 5 puis deux tests à 55 × 4',
      nbF(g0) === nbF(['50×5', '50×5', '55×4', '55×4']), nbF(g0));
    await saisirSerie(0, 45, 7);
    await attendre(700);
    await invariantsF('série 1 plus légère (45 × 7)');
    const g1 = await grilleF();
    ok('[F] DISCRIMINANT — série 1 plus légère : les trois lignes suivantes recopient 45 × 7, charge ET reps',
      nbF(g1.slice(1)) === nbF(['45×7', '45×7', '45×7']), nbF(g1));
    await saisirSerie(1, 50, 5);
    await attendre(700);
    await invariantsF('série 2 à la charge prévue (50 × 5)');
    const g2 = await grilleF();
    ok('[F] DISCRIMINANT — série 2 faite à la charge prévue : le plan revient (55 × 4, 55 × 4)',
      nbF(g2.slice(2)) === nbF(['55×4', '55×4']), nbF(g2));
    await abandonner();

    // ── VALIDER SANS RIEN TAPER, APRÈS UN ÉCART ─────────────────────────
    await ouvrirLE();
    await saisirSerie(0, 45, 7);
    await attendre(700);
    await toucher(1, '.ok-serie');
    await attendre(900);
    await invariantsF('série 2 validée sans rien taper');
    const g3 = await grilleF();
    ok('[F] DISCRIMINANT — valider sans taper après un écart écrit 45 × 7, pas « 45 × 5 »',
      g3[1] === '[45]×[7]', nbF(g3));
    await abandonner();

    // ── F044 : LE REFUS SUIVI D'UN TEST ─────────────────────────────────
    await ouvrirLE();
    await saisirSerie(0, 50, 8);
    await attendre(900);
    await invariantsF('série 1 à 50 × 8');
    const g4 = await grilleF();
    // 49-U5 (delta 49-13, §9.14, I14) : les tests à 55 sont prévus plus loin,
    // la proposition prend leur charge (avant : 52,5, le cran du dessus).
    ok('[F] prémisse F044 : après 50 × 8, le coach propose 55 — la charge du test prévu — sur la série 2 (reps à taper)',
      g4[1].charAt(0) === '*' && /^\*55×/.test(g4[1]), nbF(g4));
    await saisirSerie(1, 50, 6);
    await attendre(900);
    await invariantsF('refus : série 2 à 50 × 6');
    const g5 = await grilleF();
    ok('[F] DISCRIMINANT — F044 : après le refus, les tests affichent 50 × 6 — plus « 50 × 4 »',
      nbF(g5.slice(2)) === nbF(['50×6', '50×6']), nbF(g5));
    await saisirSerie(2, 55, 7);
    await attendre(900);
    await invariantsF('série 3, le test, à 55 × 7');
    const g6 = await grilleF();
    ok('[F] F044 : le test fait à 55 — le plan revient sur la série 4 (55 × 4)',
      g6[3] === '55×4', nbF(g6));
    await abandonner();
    await aller('/saisie');

    ok('[F] aucune erreur de page pendant le fantôme', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 duotricies. LES PARIS ET LES LIGNES FIGÉES SE LISENT DANS LE PLAN ; LA CONSIGNE SURVIT AU RECHARGEMENT (49-U3) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : UNE SYNCHRONISATION QUI CHANGE LA
  // CONSIGNE, PUIS UN RECHARGEMENT COMPLET DE LA PAGE. Sans rechargement, le gel
  // en mémoire suffisait déjà (49-U1, D7) ; c'est le rechargement — Android
  // ferme la PWA pendant un repos — qui recalculait la consigne sur un
  // historique changé. La prémisse est vérifiée à la fin : une NOUVELLE séance
  // reçoit bien une autre consigne.
  //
  // Après chaque geste : `verifierPlan(plan, entrées, plan d'avant)` — I4
  // compris, À TRAVERS le rechargement.
  {
    const nbP = (x) => JSON.stringify(x).replace(/ /g, ' ');
    const enTeteP = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne')).map((e) => e.textContent));
    const planP = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      return d ? JSON.parse(JSON.stringify(d)) : null;
    });
    let avantP = null;
    const invariantsP = async (geste) => {
      const v = await page.evaluate((avant) => {
        const d = window.THPlan && window.THPlan.dernier;
        if (!d) return { ok: false, erreurs: ['aucun plan calculé'] };
        return window.THPlan.verifierPlan(d.plan, d.entrees, avant);
      }, avantP);
      ok('[P3] invariants du plan après « ' + geste + ' »', v.ok,
        v.ok ? 'I1 I2 I3 I4 I6 I7 I8 I9 I11 I12' : nbP(v.erreurs.slice(0, 3)));
      avantP = (await planP()).plan;
    };
    const figeesP = (d) => d.plan.exercices[0].lignes.filter((l) => l.figee)
      .map((l) => l.id + ':' + l.rang + ':' + l.role + ':' + l.charge + '×' + l.vise);
    const brouillonConsignes = () => page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('trainhub-v2');
      r.onsuccess = () => {
        const q = r.result.transaction(['brouillon'], 'readonly').objectStore('brouillon').get('consignes');
        q.onsuccess = () => { r.result.close(); res(q.result ? q.result.valeur : null); };
      };
    }));

    await aller('/saisie');
    await demarrerRoutine('LE ×4');
    await attendre(800);
    await invariantsP('ouverture');
    const idS = base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];
    await saisirSerie(0, 50, 5);
    await attendre(700);
    await invariantsP('série 1');
    await saisirSerie(1, 50, 5);
    await attendre(700);
    await invariantsP('série 2');
    const avant = await planP();
    const enTete0 = await enTeteP();
    const consigne0 = avant.plan.exercices[0].consigne;
    const figees0 = figeesP(avant);
    const stockee = await brouillonConsignes();
    ok('[P3] la consigne est sur l’appareil, liée à CETTE séance',
      !!stockee && stockee.seanceId === idS && !!stockee.parSlug && !!stockee.parSlug['leg-extension'],
      nbP(stockee ? { seanceId: stockee.seanceId === idS, slugs: Object.keys(stockee.parSlug || {}) } : null));
    ok('[P3] prémisse : deux séries figées par leurs paris', figees0.length === 2, nbP(figees0));

    // Une séance arrive en arrière-plan : elle changerait la consigne d'une
    // séance NEUVE (le palier monte à 55, sans test).
    const tP = Date.now();
    const debutP = ilYa(3 * 3600000, tP).toISOString();
    base.sessions.push({ id: 'le-d', user_id: 'u-banc', titre: 'Quadriceps — le-d', debut: debutP,
      fin: finDe(debutP, tP).toISOString(), statut: 'terminee', note: null, salle: null, salle_norme: null,
      routine_id: null, source: 'app', created_at: debutP });
    [[55, 5], [55, 5], [55, 5], [57.5, 5]].forEach(([kg, reps], i) => base.sets.push({
      id: 'le-d-s' + (i + 1), session_id: 'le-d', user_id: 'u-banc', exercise_slug: 'leg-extension',
      charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail', rang: i + 1,
      groupe_superset: null, validee_a: debutP, rpe: null, ressenti: null, repos_s: null, note: null,
      source: 'app', created_at: debutP, modifie_a: null }));

    // ⚠️ LA SYNCHRONISATION AVANT LA FERMETURE, comme sur l'appareil : la
    // séance arrivée est dans le CACHE quand l'app se rouvre. Sans ce pas, le
    // premier rendu recalculait la consigne sur l'ancien cache — le même
    // historique — et une consigne jamais relue passait inaperçue (mutation
    // (b) de 49-U3, survivante avant ce correctif).
    await page.click('.onglet[data-vue="racine"]');
    await attendre(900);
    await page.click('#btn-rafraichir');
    await attendre(2500);
    await page.click('.onglet[data-vue="saisie"]');
    await attendre(900);
    ok('[P3] prémisse : la séance arrivée est dans le cache AVANT la fermeture',
      await page.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('trainhub-v2');
        r.onsuccess = () => {
          const q = r.result.transaction(['seances'], 'readonly').objectStore('seances').get('le-d');
          q.onsuccess = () => { r.result.close(); res(!!q.result); };
          q.onerror = () => { r.result.close(); res(false); };
        };
      })), 'le-d');

    // Le RECHARGEMENT COMPLET : l'app repart de zéro, synchronise, et relit.
    await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await attendre(3200);
    const apres = await planP();
    ok('[P3] DISCRIMINANT — après une synchronisation ET un rechargement, la même consigne',
      nbP(apres.plan.exercices[0].consigne) === nbP(consigne0),
      nbP({ avant: consigne0 && consigne0.ligne, apres: apres.plan.exercices[0].consigne && apres.plan.exercices[0].consigne.ligne }));
    ok('[P3] …le même en-tête', nbP(await enTeteP()) === nbP(enTete0), nbP({ avant: enTete0, apres: await enTeteP() }));
    ok('[P3] …et les mêmes lignes figées (rang, rôle, charge, visée)',
      nbP(figeesP(apres)) === nbP(figees0), nbP({ avant: figees0, apres: figeesP(apres) }));
    avantP = avant.plan;   // I4 À TRAVERS le rechargement
    await invariantsP('rechargement');

    // La séance complète : chaque pari en base, une ligne du plan.
    await saisirSerie(2, 55, 4);
    await attendre(700);
    await invariantsP('série 3');
    await saisirSerie(3, 55, 4);
    await attendre(1500);
    await invariantsP('série 4');
    const fin = await planP();
    const role = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour' };
    const lignes = fin.plan.exercices[0].lignes;
    const enBase = base.predictions.filter((l) => l.exercise_slug === 'leg-extension' &&
      l.fondement && l.fondement.seance === idS);
    const concordent = lignes.every((l) => {
      const q = enBase.filter((x) => x.fondement.rang === l.rang);
      return l.validee && q.length === 1 && q[0].fondement.role === role[l.role] &&
        Number(q[0].fondement.charge) === Number(l.charge) && Number(q[0].valeur_predite) === Number(l.vise) &&
        q[0].set_observe === l.id;
    });
    ok('[P3] séance complète : UN pari en base par série validée, identique à sa ligne (rang, rôle, charge, visée, série)',
      enBase.length === lignes.length && concordent,
      nbP({ base: enBase.map((q) => q.fondement.rang + ':' + q.fondement.role + ':' + q.fondement.charge + '×' + q.valeur_predite),
            plan: lignes.map((l) => l.rang + ':' + l.role + ':' + l.charge + '×' + l.vise) }));

    await terminer();
    ok('[P3] la séance terminée emporte sa consigne sur l’appareil', (await brouillonConsignes()) === null,
      nbP(await brouillonConsignes()));

    // La prémisse, vérifiée : une séance NEUVE reçoit l'autre consigne.
    await aller('/saisie');
    await demarrerRoutine('LE ×4');
    await attendre(900);
    const neuve = await planP();
    ok('[P3] prémisse : une séance neuve reçoit bien une AUTRE consigne (la synchronisation la changeait)',
      nbP(neuve.plan.exercices[0].consigne) !== nbP(consigne0),
      nbP({ avant: consigne0 && consigne0.ligne, neuve: neuve.plan.exercices[0].consigne && neuve.plan.exercices[0].consigne.ligne }));
    await abandonner();
    await aller('/saisie');
    ok('[P3] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 tertricies. LE CONSTAT DE FIN DE BLOC LIT LE PLAN (I10 — 49-U4) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE. (1) Une montée du coach TENUE jusqu'à la
  // fin du bloc, hors zone Lourd : la proposition se propage à la série
  // suivante, la séance du jour a deux charges — l'ancien constat, lu sur les
  // séries brutes, ne savait pas qu'une montée avait été proposée. (2) Une
  // séance suivie à la lettre sur une ligne ET un test à une autre charge :
  // aucune charge répétée, et l'ancien constat disait « Pas de palier
  // aujourd'hui ». Les charges sont LUES à l'écran, jamais supposées.
  {
    const tE = Date.now();
    const poserEL = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tE).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Épaules — ' + id, debut,
        fin: finDe(debut, tE).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'elevations-laterales',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserEL('el-z', 35, [[52.5, 7], [52.5, 7], [52.5, 7]]);
    poserEL('el-a', 21, [[50, 9], [50, 9], [50, 9]]);
    poserEL('el-b', 14, [[50, 9], [50, 9], [50, 9]]);
    poserEL('el-c', 7, [[50, 9], [50, 9], [50, 9]]);
    ROUTINES.push({ id: 'r-el', nom: 'EL ×3', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-el-e', routine_id: 'r-el', exercise_slug: 'elevations-laterales', rang: 0,
        routine_sets: progr(3, 9), repos_cible_s: 90, groupe_superset: null, note: null }] });

    const nbC = (x) => JSON.stringify(x).replace(/[  ]/g, ' ');
    const nr = (v) => Number(String(v).replace(',', '.').split('-')[0]);
    const grilleC = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) => ({
      proposee: l.classList.contains('proposee'),
      charge: (l.querySelectorAll('input')[0] || {}).placeholder || '',
      reps: (l.querySelectorAll('input')[1] || {}).placeholder || '' })));
    const constatC = () => page.evaluate(() => ({
      verdict: (document.querySelector('.legende-exo .constat') || {}).textContent || null,
      suite: (document.querySelector('.legende-exo .constat-suite') || {}).textContent || null }));
    // La partie « suite » d'I10 (b) — la prochaine séance proposerait moins
    // que la montée tenue — se RAPPORTE (décision de fond, hors de ce
    // commit) : comptée à part, elle ne fait pas échouer l'invariant.
    const suitesSous = [];
    const invariantsC = async (geste) => {
      const v = await page.evaluate(() => {
        const d = window.THPlan && window.THPlan.dernier;
        if (!d) return { ok: false, erreurs: ['aucun plan calculé'] };
        return window.THPlan.verifierPlan(d.plan, d.entrees);
      });
      const horsSuite = v.erreurs.filter((e) => e.indexOf('I10 suite') !== 0);
      v.erreurs.filter((e) => e.indexOf('I10 suite') === 0).forEach((e) => suitesSous.push(geste + ' : ' + e));
      ok('[C4] invariants du plan après « ' + geste + ' »', horsSuite.length === 0,
        horsSuite.length === 0 ? 'I1 … I12, I10 compris' : nbC(horsSuite.slice(0, 3)));
    };

    // ── (1) LA MONTÉE DU COACH, TENUE JUSQU'À LA FIN DU BLOC ─────────────
    await aller('/saisie');
    await demarrerRoutine('EL ×3');
    await attendre(800);
    const zoneC = await page.evaluate(() => {
      const d = window.THPlan.dernier;
      return d && d.plan.exercices[0].consigne ? d.plan.exercices[0].consigne.zone : null;
    });
    ok('[C4] prémisse : hors zone Lourd', !!zoneC && zoneC !== 'lourd', String(zoneC));
    let g = await grilleC();
    const c1 = nr(g[0].charge), v1 = nr(g[0].reps);
    await saisirSerie(0, c1, v1 + 3);
    await attendre(900);
    await invariantsC('série 1 à ' + c1 + ' × ' + (v1 + 3));
    g = await grilleC();
    ok('[C4] prémisse : 3 reps de plus → le coach propose sur la série 2', g[1].proposee && nr(g[1].charge) > c1, nbC(g));
    const cm = nr(g[1].charge);
    const zoneBas = nr(g[1].reps);          // la fourchette « bas-haut » des reps à taper
    await saisirSerie(1, cm, zoneBas + 1);
    await attendre(900);
    await invariantsC('montée acceptée et tenue à ' + cm);
    g = await grilleC();
    ok('[C4] prémisse : la montée tenue se propage à la série 3 (hors Lourd)', nr(g[2].charge) === cm, nbC(g));
    ok('[C4] aucun constat avant la dernière ligne validée (I10 a)', (await constatC()).verdict === null,
      nbC(await constatC()));
    await saisirSerie(2, cm, zoneBas + 1);
    await attendre(1500);
    await invariantsC('fin du bloc');
    const k1 = await constatC();
    const cmFr = String(cm).replace('.', ',');
    ok('[C4] DISCRIMINANT — le constat dit la montée du coach tenue',
      /La montée du coach a tenu/.test(k1.verdict || '') && (k1.verdict || '').indexOf(cmFr) >= 0, nbC(k1));
    ok('[C4] …et la suite propose cette charge', (k1.suite || '').indexOf(cmFr) >= 0, nbC(k1));
    await abandonner();

    // ── (2) UNE SÉANCE SUIVIE À LA LETTRE : UNE LIGNE, PUIS UN TEST ──────
    await aller('/saisie');
    await demarrerRoutine('Terre ×2');
    await attendre(900);
    g = await grilleC();
    const t1 = nr(g[0].charge), t2 = nr(g[1].charge);
    ok('[C4] prémisse : une ligne puis un test à une AUTRE charge (aucune charge répétée)', t1 > 0 && t2 > t1, nbC(g));
    await saisirSerie(0, t1, nr(g[0].reps));
    await attendre(900);
    g = await grilleC();
    await saisirSerie(1, nr(g[1].charge) || t2, nr(g[1].reps));
    await attendre(1500);
    await invariantsC('séance suivie à la lettre');
    const k2 = await constatC();
    ok('[C4] suivie à la lettre (une ligne, un test) : pas de « Pas de palier »',
      !!k2.verdict && !/Pas de palier/.test(k2.verdict), nbC(k2));
    await abandonner();

    // ── (3) LE CAS DE #327 : 125 × 8 AVANT UN TEST À 130 ─────────────────
    // Le décor du cas N3, à la barre : la ligne à 125, le test à 130 en série
    // 3, le cran connu 127,5. 49-U4 y montrait trois charges sans répétition
    // (125, la montée du coach à 127,5, le test à 130) et une suite MUETTE.
    // ⚠️ 49-U5 (delta 49-13, §9.14, I14) : le test est prévu plus loin, la
    // proposition prend SA charge — 130 dès la série 2, une seule montée —, et
    // 130 se répète : la suite est chiffrée.
    const tF = Date.now();
    const poserFS = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tF).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Jambes — ' + id, debut,
        fin: finDe(debut, tF).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'front-squat',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserFS('fs-a', 70, [[115, 5], [115, 5], [115, 5]]);
    poserFS('fs-b', 63, [[117.5, 5], [117.5, 5], [117.5, 5]]);
    poserFS('fs-c', 56, [[120, 5], [120, 5], [120, 5]]);
    poserFS('fs-d', 49, [[122.5, 5], [122.5, 5], [122.5, 5]]);
    poserFS('fs-e', 14, [[125, 5], [125, 5], [130, 3]]);
    ROUTINES.push({ id: 'r-fs', nom: 'FS ×3', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-fs-e', routine_id: 'r-fs', exercise_slug: 'front-squat', rang: 0,
        routine_sets: progr(3, 5), repos_cible_s: 180, groupe_superset: null, note: null }] });
    await aller('/saisie');
    await demarrerRoutine('FS ×3');
    await attendre(800);
    g = await grilleC();
    const d1 = nr(g[0].charge), w1 = nr(g[0].reps);
    ok('[C4] prémisse : la ligne, puis le test à une autre charge', d1 > 0 && nr(g[2].charge) > d1, nbC(g));
    await saisirSerie(0, d1, w1 + 3);
    await attendre(900);
    g = await grilleC();
    const d2 = nr(g[1].charge);
    const basZone = nr(g[1].reps);
    await invariantsC('série 1 à ' + d1 + ' × ' + (w1 + 3) + ', avant le test');
    ok('[C5] DISCRIMINANT — la proposition est 130, la charge du test prévu, dès la série 2 (avant : 127,5)',
      g[1].proposee && d2 === 130 && d2 === nr(g[2].charge), nbC(g));
    await saisirSerie(1, d2, basZone);
    await attendre(900);
    await invariantsC('130 accepté et tenu en série 2');
    g = await grilleC();
    const d3 = nr(g[2].charge), w3 = nr(g[2].reps);
    ok('[C5] une seule montée : deux charges seulement, 125 puis 130', new Set([d1, d2, d3]).size === 2 && d3 === 130,
      nbC({ d1, d2, d3, g }));
    await saisirSerie(2, d3, w3);
    await attendre(1500);
    await invariantsC('suivie à la lettre, une seule montée');
    const k3 = await constatC();
    ok('[C5] le constat ne dit pas « Pas de palier »', !!k3.verdict && !/Pas de palier/.test(k3.verdict), nbC(k3));
    ok('[C5] DISCRIMINANT — le constat annonce une suite chiffrée (avant : aucune, la suite muette de #327)',
      /^Prochaine séance/.test((k3.suite || '').replace(/[\u00a0\u202f]/g, ' ')) && /130/.test(k3.suite || ''), nbC(k3));
    ok('[C5] plus aucune suite sous la montée dans cette section', suitesSous.length === 0, nbC(suitesSous));
    await abandonner();
    await aller('/saisie');
    ok('[C4] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 quatertricies. LA RÉACTION REVUE : LA REPRISE (49-U5) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE. (1) Une reprise longue (plus de 12
  // semaines) sur une machine à GROS CRAN : le cran dessous (23) est à −28 %
  // du palier (32) — l'ancienne consigne y reprenait, la nouvelle garde 32.
  // (2) Une reprise courte, 3 reps de marge sur la série 1 : l'ancienne
  // réaction se taisait, la nouvelle propose. Les charges sont LUES à l'écran.
  {
    const tR = Date.now();
    const poser = (slug, titre) => (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tR).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: titre + ' — ' + id, debut,
        fin: finDe(debut, tR).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: slug,
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    const poserCP = poser('pupitre-machine', 'Bras');
    poserCP('cp-a', 130, [[23, 12], [23, 12], [23, 12]]);
    poserCP('cp-b', 123, [[32, 12], [32, 12], [32, 12]]);
    poserCP('cp-c', 116, [[32, 12], [32, 12], [32, 12]]);
    poserCP('cp-d', 109, [[32, 12], [32, 12], [32, 12]]);
    const poserHB = poser('haussement-barre', 'Dos');
    poserHB('hb-a', 60, [[80, 12], [80, 12], [80, 12]]);
    poserHB('hb-b', 53, [[80, 12], [80, 12], [80, 12]]);
    poserHB('hb-c', 46, [[80, 12], [80, 12], [80, 12]]);
    [['r-cp', 'CP ×3', 'pupitre-machine'], ['r-hb', 'HB ×3', 'haussement-barre']].forEach(([rid, nom, slug]) =>
      ROUTINES.push({ id: rid, nom, note: null, archivee_a: null,
        created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
        routine_exercises: [{ id: rid + '-e', routine_id: rid, exercise_slug: slug, rang: 0,
          routine_sets: progr(3, 12), repos_cible_s: 90, groupe_superset: null, note: null }] }));

    const nbR = (x) => JSON.stringify(x).replace(/[\u00a0\u202f]/g, ' ');
    const nr = (v) => Number(String(v).replace(',', '.').split('-')[0]);
    const grilleR = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) => ({
      proposee: l.classList.contains('proposee'),
      charge: (l.querySelectorAll('input')[0] || {}).placeholder || '',
      reps: (l.querySelectorAll('input')[1] || {}).placeholder || '' })));
    const griseR = () => page.evaluate(() =>
      ((document.querySelector('.legende-exo .consigne-dit') || {}).textContent || '').replace(/[\u00a0\u202f]/g, ' '));
    const planR = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      if (!d) return { consigne: null, erreurs: ['aucun plan calculé'] };
      return { consigne: d.plan.exercices[0].consigne, erreurs: window.THPlan.verifierPlan(d.plan, d.entrees).erreurs };
    });

    // ── (1) REPRISE LONGUE, MACHINE À GROS CRAN ──────────────────────────
    await aller('/saisie');
    await demarrerRoutine('CP ×3');
    await attendre(900);
    let r = await planR();
    ok('[RP1] prémisse : reprise longue, palier 32', !!r.consigne && r.consigne.etat === 'reprise_longue' &&
      r.consigne.palier === 32, nbR(r.consigne));
    let g = await grilleR();
    ok('[RP1] DISCRIMINANT — la consigne garde le dernier palier : 32 sur les trois séries (avant : 23, −28 %)',
      g.length === 3 && g.every((l) => nr(l.charge) === 32), nbR(g));
    ok('[RP1] …et le dit, sans « un cran en dessous »',
      (await griseR()) === 'Longue pause : on reprend à ta charge de travail, sans rep de plus.',
      nbR(await griseR()));
    ok('[RP1] invariants du plan (le repli compris)', r.erreurs.length === 0, nbR(r.erreurs.slice(0, 3)));
    await abandonner();

    // ── (2) REPRISE COURTE, 3 REPS DE MARGE ─────────────────────────────
    await aller('/saisie');
    await demarrerRoutine('HB ×3');
    await attendre(900);
    r = await planR();
    ok('[RP2] prémisse : reprise courte, 80 × 12', !!r.consigne && r.consigne.etat === 'reprise_courte' &&
      r.consigne.ligne && r.consigne.ligne.charge === 80, nbR(r.consigne));
    g = await grilleR();
    await saisirSerie(0, nr(g[0].charge), nr(g[0].reps) + 3);
    await attendre(900);
    g = await grilleR();
    r = await planR();
    ok('[RP2] DISCRIMINANT — la réaction parle en reprise : une proposition au-dessus de 80 sur la série 2',
      g[1].proposee && nr(g[1].charge) > 80, nbR(g));
    ok('[RP2] invariants du plan', r.erreurs.length === 0, nbR(r.erreurs.slice(0, 3)));
    await abandonner();
    await aller('/saisie');
    ok('[RP] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 quinquatricies. UNE OBSERVATION NE SE PERD PLUS DANS LA FILE (§9.11, 27/09/2026) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE — LA SÉQUENCE DES JOURNAUX DU 27/09. Une
  // série observée, DÉVALIDÉE pendant que d'autres séries sont supprimées ;
  // l'observation vidée part LENTEMENT (en vol) ; la série est REVALIDÉE
  // pendant ce temps. Avant le correctif, l'observation reposée gardait sa
  // position de première pose et partait AVANT la réinsertion de la série :
  // 23503, classé définitif, observation perdue en base, « posée » en local.
  {
    const tO = Date.now();
    const poserO = (slug, titre) => (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tO).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: titre + ' — ' + id, debut,
        fin: finDe(debut, tO).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: slug,
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    const ro = poserO('rowing-poulie', 'Dos');
    ro('of-ro-a', 21, [[95, 12], [95, 12]]); ro('of-ro-b', 14, [[95, 12], [95, 12]]); ro('of-ro-c', 7, [[95, 12], [100, 10]]);
    const dci = poserO('dci-halteres', 'Pecs');
    dci('of-dc-z', 35, [[84, 8], [84, 8], [84, 8]]);
    dci('of-dc-a', 21, [[80, 10], [80, 10], [80, 10]]); dci('of-dc-b', 14, [[80, 10], [80, 10], [80, 10]]);
    dci('of-dc-c', 7, [[80, 10], [80, 10], [80, 10]]);
    ROUTINES.push({ id: 'r-of', nom: 'Mardi — Pecs Dos', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-of-1', routine_id: 'r-of', exercise_slug: 'rowing-poulie', rang: 0,
          routine_sets: progr(2, 12), repos_cible_s: 90, groupe_superset: null, note: null },
        { id: 'r-of-2', routine_id: 'r-of', exercise_slug: 'dci-halteres', rang: 1,
          routine_sets: progr(3, 11), repos_cible_s: 90, groupe_superset: null, note: null }] });

    const nbO = (x) => JSON.stringify(x);
    const idS = () => base.sessions.filter((x) => x.statut === 'en_cours').map((x) => x.id)[0];
    const pariDC = (sid, rang) => base.predictions.filter((l) => l.exercise_slug === 'dci-halteres' &&
      l.fondement && l.fondement.seance === sid && l.fondement.rang === rang && !l.fondement.revision)[0] || null;
    const serieDC1 = (sid) => base.sets.filter((x) => x.session_id === sid && x.exercise_slug === 'dci-halteres')
      .sort((a, b) => a.rang - b.rang)[0] || null;
    const fileO = () => page.evaluate(() => window.THCache.lireAttente())
      .then((f) => (f || []).map((e) => e.cle.split(':')[0] + (e.bloquee ? ' BLOQUÉE' : '') + (e.attend ? ' ATTEND' : '')));
    const grilleO = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie')).map((l) => ({
      charge: (l.querySelectorAll('input')[0] || {}).placeholder || '',
      reps: (l.querySelectorAll('input')[1] || {}).placeholder || '' })));
    const supprimerLigne = async (i) => {
      await toucher(i, '.no-serie');
      await page.click('#feuille-contenu .feuille-menu button.danger');   // Supprimer la série
      await attendre(300);
    };

    await aller('/saisie');
    await demarrerRoutine('Mardi — Pecs Dos');
    await attendre(1200);
    const sid = idS();
    let g = await grilleO();
    await saisirSerie(0, g[0].charge, g[0].reps);
    await saisirSerie(1, g[1].charge, g[1].reps);
    await saisirSerie(2, 80, 14);                 // couché, série 1 : 80 × 14
    await attendre(2500);
    const p1 = pariDC(sid, 1);
    ok('[OF] prémisse : la série 1 du couché est observée en base (14)',
      !!p1 && !!p1.set_observe && p1.valeur_observee === 14, nbO(p1));
    const s1 = p1 && p1.set_observe;

    // La séquence : l'observation part lentement ; dévalider, supprimer,
    // revalider, pendant qu'elle est en vol.
    base.lenteurPredictions = 2500;
    await toucher(2, '.ok-serie');                // dévalidée (le tap accidentel)
    await attendre(700);
    await supprimerLigne(0);                      // rowing, série 1
    await supprimerLigne(0);                      // rowing, série 2
    const enVol = base.sets.some((x) => x.id === s1);
    await toucher(0, '.ok-serie');                // couché, série 1 revalidée (80 × 14 déjà tapé)
    await attendre(600);
    ok('[OF] prémisse : la série a bien quitté la base pendant la séquence (dévalidée)',
      !enVol, nbO({ serieEnBase: enVol }));
    base.lenteurPredictions = 0;
    await attendre(9000);
    const apres = pariDC(sid, 1);
    ok('[OF] prémisse : la série 1 est revenue en base, même identifiant',
      !!serieDC1(sid) && serieDC1(sid).id === s1, nbO(serieDC1(sid)));
    ok('[OF] DISCRIMINANT — le pari du rang 1 est observé en base, SANS « Terminer »',
      !!apres && apres.set_observe === s1 && apres.valeur_observee === 14, nbO(apres));
    const f1 = await fileO();
    ok('[OF] la file est vide : rien de refusé, rien qui attende encore', f1.length === 0, nbO(f1));

    // LE RATTRAPAGE : une divergence forcée par le serveur — l'observation
    // vidée en base dans le dos de l'app, qui la croit posée.
    const i1 = base.predictions.indexOf(pariDC(sid, 1));
    base.predictions[i1] = Object.assign({}, base.predictions[i1], { set_observe: null, valeur_observee: null, observee_a: null });
    g = await grilleO();
    await saisirSerie(1, 84, 10);
    await saisirSerie(2, 84, 10);
    await attendre(2000);
    ok('[OF] prémisse : la divergence tient tant qu’on ne termine pas', pariDC(sid, 1).set_observe === null,
      nbO(pariDC(sid, 1)));
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(500);
    await page.click('#feuille-contenu .principal');
    await attendre(3000);
    const fin = pariDC(sid, 1);
    ok('[OF] DISCRIMINANT — « Terminer » rattrape l’observation perdue (14, sur la série 1)',
      !!fin && fin.set_observe === s1 && fin.valeur_observee === 14, nbO(fin));
    const toutes = base.predictions.filter((l) => l.fondement && l.fondement.seance === sid &&
      l.exercise_slug === 'dci-halteres');
    ok('[OF] chaque série validée du couché a son observation',
      [1, 2, 3].every((r) => toutes.some((l) => l.fondement.rang === r && l.set_observe)), nbO(toutes.map((l) =>
        [l.fondement.rang, l.fondement.revision || 0, l.set_observe ? 'obs' : '—', l.valeur_observee])));
    await aller('/saisie');
    ok('[OF] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G. LA GARDE DU COACH DANS L’APP (49-U7) ══');
  //
  // La garde de l'app, bout à bout : sur 127.0.0.1 elle est active ; un plan
  // FORGÉ (un champ de plus : I12, « même entrée, plan différent ») fait
  // apparaître le marqueur ; avec `?garde=0`, le même plan forgé ne fait rien.
  // Le crochet du banc est suspendu le temps du forgé — c'est lui qu'on
  // attend fautif.
  {
    const forger = () => page.evaluate(() => {
      const P = window.THPlan;
      if (!P.__planOrigine) P.__planOrigine = P.planDeSeance;
      P.planDeSeance = (e) => Object.assign({ forge: true }, P.__planOrigine(e));
    });
    const deforger = () => page.evaluate(() => {
      const P = window.THPlan;
      if (P.__planOrigine) { P.planDeSeance = P.__planOrigine; delete P.__planOrigine; }
    });
    const marqueur = () => page.evaluate(() => {
      const m = document.getElementById('garde-coach');
      return m ? m.textContent : null;
    });
    const etatG = () => page.evaluate(() => window.THPlan.garde.etat());

    await aller('/saisie');
    const e0 = await etatG();
    ok('[G] prémisse : sur 127.0.0.1, la garde de l’app est active et a déjà vérifié des plans',
      e0.active === true && e0.plans >= 0, JSON.stringify({ active: e0.active, plans: e0.plans }));
    gardeBanc.suspendue = true;
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    await forger();
    await saisirSerie(0, 100, 5);
    await attendre(900);
    const m1 = await marqueur();
    const e1 = await etatG();
    ok('[G] DISCRIMINANT — un plan forgé : le marqueur apparaît et dit l’invariant (I12)',
      m1 !== null && /I12/.test(m1) && e1.violations.some((v) => /^I12 — /.test(v)), JSON.stringify({ m1, v: e1.violations.slice(0, 2) }));
    await deforger();
    await abandonner();

    // Le même plan forgé, garde éteinte par `?garde=0` : rien.
    await aller('/saisie?garde=0');
    const e2 = await etatG();
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    await forger();
    await saisirSerie(0, 100, 5);
    await attendre(900);
    const e3 = await etatG();
    ok('[G] DISCRIMINANT — `?garde=0` : ni marqueur, ni plan vérifié, malgré le plan forgé',
      e2.active === false && e3.plans === 0 && e3.violations.length === 0 && (await marqueur()) === null,
      JSON.stringify({ e2: { active: e2.active }, e3: { plans: e3.plans, v: e3.violations.length }, m: await marqueur() }));
    await deforger();
    await abandonner();
    await page.evaluate(() => { try { localStorage.removeItem('th-v2-garde'); } catch (e) { /* rien */ } });
    await aller('/saisie');
    ok('[G] le paramètre retiré, la garde revient (hôte de développement)', (await etatG()).active === true,
      JSON.stringify(await etatG()));
    // Le crochet reprend sur un plan neuf, sans comparer au forgé.
    await page.evaluate(() => { window.__gardeBancVu = window.THPlan.dernier; });
    gardeBanc.avant = null;
    gardeBanc.suspendue = false;
  }

  console.log('\n══ 7 G ter. LE PARI ENREGISTRÉ AVANT LE PLAN, ET LA FRAPPE QUI LE CROISE (49-U7 bis) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : UNE FRAPPE ET LA VALIDATION DANS LE MÊME
  // INSTANT. Taper dans un champ (`surChamp`) attend la sauvegarde, PUIS
  // observe la série. Si « valider » passe pendant cette attente, l'observation
  // arrive après la validation — et trouve le pari que `enregistrerPari` vient
  // de poser sur l'appareil, alors qu'il n'a pas encore son identifiant. Sous
  // charge (deux bancs à la fois), le banc a vu : deux paris du même rang et de
  // la même révision sur l'appareil, et aucun en base. Ici, le croisement est
  // forcé : la frappe et le toucher partent dans la même tâche.
  {
    const parisLocaux = () => page.evaluate(async () => {
      const toutes = await window.THCache.lireTout('predictions');
      return toutes.filter((l) => l.exercise_slug === 'souleve-terre');
    });
    const idSeance = () => (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    const sid = idSeance();
    await page.evaluate(() => {
      const l = document.querySelectorAll('.ligne-serie')[0];
      const [ch, rp] = l.querySelectorAll('input');
      ch.value = String(Number(String(ch.placeholder).replace(',', '.')));
      ch.dispatchEvent(new Event('input', { bubbles: true }));
      rp.value = String(parseInt(rp.placeholder, 10));
      rp.dispatchEvent(new Event('input', { bubbles: true }));
      l.querySelector('.ok-serie').click();
    });
    await attendre(2500);
    const locaux = (await parisLocaux()).filter((l) => l.fondement && l.fondement.seance === sid);
    const enBase = base.predictions.filter((l) => l.fondement && l.fondement.seance === sid &&
      l.exercise_slug === 'souleve-terre');
    const serie0 = base.sets.filter((x) => x.session_id === sid && x.rang === 1)[0];
    ok('[FV] DISCRIMINANT — la frappe croise la validation : UN pari au rang 1 sur l’appareil, avec son identifiant',
      locaux.filter((l) => l.fondement.rang === 1).length === 1 && locaux.every((l) => !!l.id),
      JSON.stringify(locaux.map((l) => [l.fondement.rang, l.fondement.revision || 0, l.id ? 'id' : 'SANS id', l.set_observe ? 'obs' : '—'])));
    ok('[FV] …et en base : le pari du rang 1, observé sur la série 1',
      enBase.filter((l) => l.fondement.rang === 1).length === 1 && !!serie0 &&
      enBase.filter((l) => l.fondement.rang === 1)[0].set_observe === serie0.id,
      JSON.stringify(enBase.map((l) => [l.fondement.rang, l.set_observe === (serie0 && serie0.id) ? 'obs s1' : l.set_observe])));
    const fileF = await page.evaluate(() => window.THCache.lireAttente());
    ok('[FV] …et la file est vide : rien de bloqué', fileF.length === 0,
      JSON.stringify(fileF.map((e) => e.cle + (e.bloquee ? ' BLOQUÉE' : ''))));
    await abandonner();
  }

  console.log('\n══ 7 G quater. L’ÉCHEC ET LA DÉGRESSIVE VIDENT L’OBSERVATION (49-19, E1) ══');
  //
  // Une série validée, son pari observé en base. Passée en « Tentative
  // manquée » (`echec`) : l'observation se vide — une tentative manquée ne
  // juge pas un pari de travail (E1 ; H2, qui la gardait, est annulé).
  // Deuxième série : passée en dégressive, elle se vide aussi.
  {
    const idSeance = () => (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
    await aller('/saisie');
    await demarrerRoutine('Terre ×4');
    await attendre(800);
    const sid = idSeance();
    await saisirSerie(0, 125, 5);
    await attendre(1500);
    const s1 = base.sets.filter((x) => x.session_id === sid && x.rang === 1)[0];
    const observes = () => base.predictions.filter((l) => s1 && l.set_observe === s1.id);
    ok('[TY] prémisse : la série 1 est validée, son pari observé en base',
      !!s1 && observes().length === 1, JSON.stringify({ s1: s1 && s1.id, observes: observes().length }));
    await toucher(0, '.no-serie');
    await page.click('#feuille-contenu .feuille-menu button:nth-child(4)');   // Tentative manquée (echec)
    await attendre(700);
    await jusqua(async () => observes().length === 0, 6000);
    ok('[TY] DISCRIMINANT — passée en « Tentative manquée », elle perd son observation (E1)',
      sets().filter((x) => x.id === s1.id)[0].type_serie === 'echec' && observes().length === 0,
      JSON.stringify({ type: (sets().filter((x) => x.id === s1.id)[0] || {}).type_serie, observes: observes().length }));
    // La dégressive, sur la série 2.
    await saisirSerie(1, 125, 5);
    await attendre(1500);
    const s2 = base.sets.filter((x) => x.session_id === sid && x.rang === 2)[0];
    const observes2 = () => base.predictions.filter((l) => s2 && l.set_observe === s2.id);
    ok('[TY] prémisse : la série 2 est validée, son pari observé en base',
      !!s2 && observes2().length === 1, JSON.stringify({ s2: s2 && s2.id, observes: observes2().length }));
    await toucher(1, '.no-serie');
    await page.click('#feuille-contenu .feuille-menu button:nth-child(3)');   // Dégressive
    await attendre(700);
    await jusqua(async () => observes2().length === 0, 6000);
    ok('[TY] DISCRIMINANT — passée en dégressive, elle perd son observation',
      sets().filter((x) => x.id === s2.id)[0].type_serie === 'degressive' && observes2().length === 0,
      JSON.stringify({ type: (sets().filter((x) => x.id === s2.id)[0] || {}).type_serie, observes: observes2().length }));
    await abandonner();
  }

  console.log('\n══ 7 G quinquies. UNE SÉANCE SANS CHARGE RÉPÉTÉE (49-U8, MOTEUR §7.6) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE. La dernière séance est une PYRAMIDE —
  // 105 × 5, 110 × 4, 115 × 2 : aucune charge répétée, donc aucun palier
  // (§7.2), et la consigne se taisait. Zone Lourd (3-5) : 110 est la plus
  // lourde charge TENUE dans la zone ; 115 × 2 est sous le bas. « La plus
  // lourde de la séance » dirait 115 : la consigne doit dire 110. Puis la
  // séance du jour refait une pyramide : le constat annonce une suite chiffrée.
  {
    const tP = Date.now();
    const poserRP = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tP).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Dos — ' + id, debut,
        fin: finDe(debut, tP).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], i) => base.sets.push({
        id: id + '-s' + (i + 1), session_id: id, user_id: 'u-banc', exercise_slug: 'rowing-pendlay',
        charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: i + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserRP('rp-a', 28, [[100, 5], [100, 5], [100, 5]]);
    poserRP('rp-b', 21, [[102.5, 5], [102.5, 5], [102.5, 5]]);
    poserRP('rp-c', 14, [[105, 5], [105, 5], [105, 5]]);
    poserRP('rp-d', 7, [[105, 5], [110, 4], [115, 2]]);
    ROUTINES.push({ id: 'r-rp', nom: 'RP ×3', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-rp-e', routine_id: 'r-rp', exercise_slug: 'rowing-pendlay', rang: 0,
        routine_sets: progr(3, 5), repos_cible_s: 180, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[\u00a0\u202f]/g, ' ');
    const enteteSP = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.legende-exo .consigne, .legende-exo .consigne-dit')).map((e) => e.textContent));
    const constatSP = () => page.evaluate(() => ({
      verdict: (document.querySelector('.legende-exo .constat') || {}).textContent || null,
      suite: (document.querySelector('.legende-exo .constat-suite') || {}).textContent || null }));
    const violationsAvant = gardeBanc.violations;
    await aller('/saisie');
    await demarrerRoutine('RP ×3');
    await attendre(900);
    const cons = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const c = d && d.plan.exercices[0].consigne;
      return c ? { etat: c.etat, palier: c.palier } : null;
    });
    const ent = (await enteteSP()).map(esp);
    ok('[SP] DISCRIMINANT — après la pyramide, la consigne n’est plus un silence : palier 110 (avant : « Pas de palier »)',
      !!cons && cons.etat !== 'silence' && cons.palier === 110, JSON.stringify(cons));
    ok('[SP] l’en-tête chiffre 110, la plus lourde charge TENUE dans la zone — ni 115 (la plus lourde de la séance), ni rien',
      ent.length > 0 && ent[0] === '110 kg × 4' && !ent.some((t) => /Pas de palier|115/.test(t)), JSON.stringify(ent));
    // La séance du jour : encore une pyramide, trois charges, aucune répétée.
    await saisirSerie(0, 105, 5);
    await attendre(700);
    await saisirSerie(1, 110, 4);
    await attendre(700);
    await saisirSerie(2, 112.5, 3);
    await attendre(1500);
    const k = await constatSP();
    ok('[SP] le constat de fin de bloc paraît', !!k.verdict, esp(JSON.stringify(k)));
    ok('[SP] DISCRIMINANT — il annonce une suite chiffrée (avant : aucune suite après trois charges différentes)',
      /^Prochaine séance : .*\d.* kg/.test(esp(k.suite)), esp(JSON.stringify(k)));
    ok('[SP] la garde (C6) n’a rien signalé dans cette section', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await abandonner();
    await aller('/saisie');
    ok('[SP] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G sexies. LE DÉVERROUILLAGE EN PLEINE SÉANCE NE PERD PLUS RIEN (29-30/09/2026) ══');
  //
  // La séance du 29/09, rejouée. Hors réseau, chaque validation « armée » se
  // fait juste après un retour au premier plan : le SDK émet alors `SIGNED_IN`
  // (`visibilitychange`, qui REMONTE jusqu'à `window` — un événement qui ne
  // remonte pas n'est pas vu, et le banc ne prouverait rien), et l'app
  // ré-entre. Avant le 30/09, la ré-entrée relisait la file et la séance
  // depuis le disque, et un pari posé pendant la lecture était perdu (2 sur 7
  // au banc). Les lectures du disque sont RALENTIES comme sur le téléphone, et
  // le clic tombe DEDANS s'il y en a une ; sinon, 300 ms après le retour.
  //
  // #336 (l'orpheline ne bloque plus la file) reste couvert par
  // `v2-file-orpheline.test.js` : sans perte, ce rejeu ne produit plus
  // d'orpheline.
  {
    const idSeanceO = () => (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
    const avertissements = [];
    const ecouter = (m) => { if (m.type() === 'warning') avertissements.push(m.text()); };
    page.on('console', ecouter);
    await aller('/saisie');
    await demarrerRoutine('Superset');
    await attendre(800);
    const sid = idSeanceO();
    ok('[RE] prémisse : la séance est ouverte en base', !!sid, String(sid));
    base.reseau = false;
    // Les lectures du disque ralenties, le clic dedans, et le compte des
    // `SIGNED_IN` (les ré-entrées).
    await page.evaluate(() => {
      const C = window.THCache;
      window.__reentrees = 0;
      C.__vrais = { lireAttente: C.lireAttente, lireBrouillon: C.lireBrouillon };
      const cliquer = () => {
        const k = window.__cliquerALaRelecture;
        if (k === undefined || k === null) return false;
        window.__cliquerALaRelecture = null;
        clearTimeout(window.__repli);
        setTimeout(() => {
          const li = document.querySelectorAll('.ligne-serie')[k];
          if (li) li.querySelector('.ok-serie').click();
        }, 30);
        return true;
      };
      window.__cliquer = cliquer;
      const lente = (nom) => function () {
        const r = C.__vrais[nom].apply(this, arguments);
        if (nom === 'lireBrouillon' && arguments[0] !== 'seance') return r;
        if (!cliquer()) return r;
        return r.then((v) => new Promise((ok) => setTimeout(() => ok(v), 1500)));
      };
      C.lireAttente = lente('lireAttente');
      C.lireBrouillon = lente('lireBrouillon');
      // Le compte des ré-entrées : le même `SIGNED_IN` que reçoit l'app.
      window.THClient.obtenir().auth.onAuthStateChange((evt) => {
        if (evt === 'SIGNED_IN') window.__reentrees++;
      });
    });
    await attendre(300);
    await page.evaluate(() => { window.__reentrees = 0; });
    const n = await compter('.ligne-serie');
    let armees = 0;
    for (let i = 0; i < n; i++) {
      const l = await ligne(i);
      const ph = await l.$$eval('input', (x) => x.map((y) => y.placeholder));
      if (ph.length >= 2) {
        const c = Number(String(ph[0] || '20').replace(',', '.')) || 20;
        const r = Number(ph[1]) || 8;
        await l.$$eval('input', (x, v) => {
          x[0].value = v[0]; x[0].dispatchEvent(new Event('input', { bubbles: true }));
          x[1].value = v[1]; x[1].dispatchEvent(new Event('input', { bubbles: true }));
        }, [String(c), String(r)]);
      }
      // Une validation sur deux après un déverrouillage, l'autre normalement.
      if (i % 2 === 0) {
        armees++;
        await page.evaluate((k) => {
          window.__cliquerALaRelecture = k;
          window.__repli = setTimeout(() => window.__cliquer(), 300);
          document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
        }, i);
        await attendre(4000);
      } else {
        await l.$eval('.ok-serie', (b) => b.click());
        await attendre(1200);
      }
    }
    const reentrees = await page.evaluate(() => window.__reentrees);
    await page.evaluate(() => { const C = window.THCache; C.lireAttente = C.__vrais.lireAttente; C.lireBrouillon = C.__vrais.lireBrouillon; });
    ok('[RE] prémisse : l’app a ré-entré à chaque déverrouillage (SIGNED_IN reçu)',
      reentrees >= armees, reentrees + ' ré-entrée(s) pour ' + armees + ' déverrouillage(s)');
    const validees = await page.evaluate(() =>
      document.querySelectorAll('.ligne-serie .ok-serie.cochee').length);
    ok('[RE] prémisse : toutes les lignes sont validées à l’écran', validees === n, validees + ' / ' + n);
    const locaux = await page.evaluate((s) => window.THCache.lireTout('predictions')
      .then((l) => l.filter((x) => x && x.id && x.fondement && x.fondement.seance === s)), sid);
    // Hors réseau, rien n'est en base : un pari perdu est un pari de
    // l'appareil qui n'a PAS d'entrée dans la file.
    const enFile = await page.evaluate(() => window.THCache.lireAttente()
      .then((f) => f.filter((e) => e.table === 'predictions').map((e) => e.id)));
    const horsFile = locaux.filter((x) => enFile.indexOf(x.id) < 0);
    ok('[RE] DISCRIMINANT — hors réseau, chaque pari de l’appareil est dans la file (avant : 2 sur 7 perdus)',
      locaux.length >= 4 && horsFile.length === 0,
      locaux.length + ' pari(s) sur l’appareil, ' + horsFile.length + ' hors de la file : ' +
      horsFile.map((x) => x.id.slice(0, 8)).join(','));

    // Le réseau revient ; « Terminer ».
    base.reseau = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await attendre(2500);
    await terminer();
    await jusqua(async () => (await page.evaluate(() => window.THCache.lireAttente())).length === 0, 8000);
    const fileO = await page.evaluate(() => window.THCache.lireAttente());
    ok('[RE] la file se vide', fileO.length === 0,
      JSON.stringify(fileO.map((e) => e.cle + (e.attend ? ' (attend)' : '') + ' ×' + e.essais)));
    ok('[RE] DISCRIMINANT — toutes les séries validées sont en base',
      base.sets.filter((x) => x.session_id === sid).length === n,
      base.sets.filter((x) => x.session_id === sid).length + ' / ' + n);
    const finaux = await page.evaluate((s) => window.THCache.lireTout('predictions')
      .then((l) => l.filter((x) => x && x.id && x.fondement && x.fondement.seance === s)), sid);
    const absents = finaux.filter((x) => !base.predictions.some((p) => p.id === x.id));
    ok('[RE] DISCRIMINANT — tous les paris posés sont en base, sans en perdre un seul',
      finaux.length >= 4 && absents.length === 0,
      finaux.length + ' pari(s), ' + absents.length + ' absent(s) : ' + absents.map((x) => x.id.slice(0, 8)).join(','));
    const divergents = finaux.filter((x) => {
      const p = base.predictions.filter((q) => q.id === x.id)[0];
      return !p || p.set_observe !== x.set_observe || p.valeur_observee !== x.valeur_observee;
    });
    ok('[RE] et leurs observations sont en base, identiques à l’appareil',
      finaux.some((x) => x.set_observe) && divergents.length === 0,
      divergents.length + ' divergente(s)');
    ok('[RE] aucune observation orpheline à abandonner',
      !avertissements.some((t) => /Observation orpheline abandonnée/.test(t)),
      JSON.stringify(avertissements.filter((t) => /orpheline/.test(t)).slice(0, 2)));

    // La séance suivante, réseau présent : elle monte.
    await aller('/saisie');
    await demarrerRoutine('Superset');
    await attendre(800);
    const sid2 = idSeanceO();
    const l0 = await ligne(0);
    const ph0 = await l0.$$eval('input', (x) => x.map((y) => y.placeholder));
    await saisirSerie(0, Number(String(ph0[0]).replace(',', '.')) || 20, Number(ph0[1]) || 8);
    await attendre(2000);
    ok('[RE] la séance suivante arrive en base, avec sa série',
      !!sid2 && sid2 !== sid && base.sets.some((x) => x.session_id === sid2),
      JSON.stringify({ sid2: sid2, series: base.sets.filter((x) => x.session_id === sid2).length }));
    await abandonner();
    page.off('console', ecouter);
    ok('[RE] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G septies. LES CHAUFFES ET LA DÉGRESSIVE, CALCULÉES PAR LE COACH (49-U10, MOTEUR §9.15) ══');
  //
  // ⚠️ CONFIGURATIONS DISCRIMINANTES.
  //   · Une routine avec des chauffes SANS charge (10-6-3-1) sur une barre à
  //     125 : avant, la ligne recopiait la fois d'avant ou restait vide ;
  //     maintenant 20 · 60 · 90 · 110, calées sur la consigne.
  //   · Une machine avec une dégressive après la dernière série de travail :
  //     −22,5 % au cran inférieur, et AUCUN repos entre les deux.
  //   · Une barre avec une dégressive : la ligne reste VIDE.
  //   · Un exercice ajouté hors routine, à la barre, sans chauffe : une
  //     proposition, « Non merci » (la séance), puis « Ajouter » (une autre).
  {
    const tU = Date.now();
    const poserU = (id, jours, exos) => {
      const debut = ilYa(jours * 86400000, tU).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U10 — ' + id, debut,
        fin: finDe(debut, tU).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      let rang = 0;
      exos.forEach(([slug, kg, reps, n]) => {
        for (let i = 0; i < n; i++) {
          rang++;
          base.sets.push({ id: id + '-s' + rang, session_id: id, user_id: 'u-banc', exercise_slug: slug,
            charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
            rang, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
            repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null });
        }
      });
    };
    [21, 14, 7].forEach((j) => poserU('u10-' + j, j, [['bench-u10', 125, 5, 3], ['quadri-u10', 60, 15, 2],
      ['biceps-u10', 40, 12, 2], ['militaire-u10', 80, 5, 3]]));
    const lignesU = (types) => types.map(([t, reps], i) => ({ id: 'u10-l' + (++grainePr), rang: i + 1,
      type_serie: t, reps_visees: reps, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null }));
    ROUTINES.push({ id: 'r-u10', nom: 'Chauffes U10', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-u10-a', routine_id: 'r-u10', exercise_slug: 'bench-u10', rang: 0,
          routine_sets: lignesU([['echauffement', 10], ['echauffement', 6], ['echauffement', 3], ['echauffement', 1],
            ['travail', 5], ['travail', 5], ['travail', 5]]), repos_cible_s: 180, groupe_superset: null, note: null },
        { id: 'r-u10-b', routine_id: 'r-u10', exercise_slug: 'quadri-u10', rang: 1,
          routine_sets: lignesU([['travail', 15], ['travail', 15], ['degressive', null]]),
          repos_cible_s: 90, groupe_superset: null, note: null },
        { id: 'r-u10-c', routine_id: 'r-u10', exercise_slug: 'biceps-u10', rang: 2,
          routine_sets: lignesU([['travail', 12], ['travail', 12], ['degressive', null]]),
          repos_cible_s: 90, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const fantomesU = () => page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie'))
      .map((l) => (l.querySelector('.ch-serie input') || {}).placeholder || ''));
    const phrasesU = (cls) => page.evaluate((c) => Array.from(document.querySelectorAll('.reaction-serie.' + c))
      .map((e) => e.textContent), cls);
    const reposVisible = () => page.evaluate(() => !document.getElementById('repos').hidden);
    // La proposition d'UN exercice (par son indice) : le biceps à la barre de
    // la routine, sans chauffe, a aussi la sienne (20 kg × 10 · 35 kg × 2).
    const propositionU = (iExo) => page.evaluate((i) => {
      const p = document.querySelector('.proposition-chauffes[data-iexo="' + i + '"] .pc-texte');
      return p ? p.textContent : null;
    }, iExo);
    const planU = (slug) => page.evaluate((sl) => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === sl)[0];
      return x ? { reference: x.chauffes && x.chauffes.reference, degressive: x.degressive,
                   paris: (x.paris || []).map((q, i) => (q ? x.lignes[i].type : null)).filter(Boolean) } : null;
    }, slug);
    const violationsAvant = gardeBanc.violations;

    await aller('/saisie');
    await demarrerRoutine('Chauffes U10');
    await attendre(900);
    let f = await fantomesU();
    const pb = await planU('bench-u10');
    ok('[U10] la référence des chauffes est la ligne de la consigne : 125', pb && pb.reference === 125, JSON.stringify(pb));
    ok('[U10] DISCRIMINANT — les chauffes de la routine, remplies d’office : 20 · 60 · 90 · 110 (avant : vides)',
      JSON.stringify(f.slice(0, 4)) === JSON.stringify(['20', '60', '90', '110']), JSON.stringify(f.slice(0, 7)));
    ok('[U10] la phrase des chauffes, au-dessus de la première',
      esp((await phrasesU('chauffe'))[0]) === 'Chauffes calées sur 125 kg : 20 · 60 · 90 · 110 kg.', esp(JSON.stringify(await phrasesU('chauffe'))));
    ok('[U10] aucun pari sur une chauffe ni une dégressive', pb && pb.paris.every((t) => t === 'travail'), JSON.stringify(pb && pb.paris));

    // Valider une chauffe SANS RIEN TAPER : sa charge s'écrit (ce qui est gris devient réel).
    await page.evaluate(() => document.querySelectorAll('.ligne-serie')[1].querySelector('.ok-serie').click());
    await attendre(900);
    const chauffeEcrite = base.sets.filter((x) => x.exercise_slug === 'bench-u10' && x.type_serie === 'echauffement' &&
      DECORS.indexOf(x.session_id) < 0 && !/^u10-/.test(x.session_id));
    ok('[U10] une chauffe validée à vide s’écrit à 60 kg, typée échauffement',
      chauffeEcrite.some((x) => Number(x.charge_kg) === 60), JSON.stringify(chauffeEcrite.map((x) => [x.charge_kg, x.reps])));
    // §9.15.1 — le repos des chauffes : 1 minute entre deux, 2 minutes après
    // la dernière ; le repos de l'exercice (3:00) ne vaut que pour le travail.
    ok('[U10] après une chauffe, 1 minute de repos (pas les 3:00 de l’exercice)', /cible 1:00/.test(await texte('#repos')),
      esp(await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));
    await page.evaluate(() => document.querySelectorAll('.ligne-serie')[2].querySelector('.ok-serie').click());
    await attendre(700);
    await page.evaluate(() => document.querySelectorAll('.ligne-serie')[3].querySelector('.ok-serie').click());
    await attendre(700);
    ok('[U10] après la dernière chauffe, 2 minutes', /cible 2:00/.test(await texte('#repos')),
      esp(await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));
    await saisirSerie(4, 125, 5);
    ok('[U10] après une série de travail, le repos de l’exercice (3:00)', /cible 3:00/.test(await texte('#repos')),
      esp(await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));

    // La machine : deux séries de travail, puis la dégressive.
    ok('[U10] DISCRIMINANT — la dégressive de la machine : 45 kg (60 − 22,5 %, au cran inférieur)', f[9] === '45', JSON.stringify(f.slice(7, 10)));
    // Delta 49-24 : une proposition seulement dès 60 kg à la barre, 80 kg
    // ailleurs. Le biceps à la barre de la routine, à 40 kg : rien.
    ok('[U10] DISCRIMINANT (49-24) — le biceps à la barre à 40 kg, sans chauffe : AUCUNE proposition (avant : « 20 kg × 10 · 35 kg × 2 »)',
      (await propositionU(2)) === null && (await compter('.proposition-chauffes')) === 0, esp(await propositionU(2)));
    await saisirSerie(7, 60, 15);
    await attendre(500);
    ok('[U10] après la première série de travail, le repos tourne', await reposVisible(), '');
    await saisirSerie(8, 60, 15);
    await attendre(500);
    ok('[U10] DISCRIMINANT — après la dernière série de travail, PAS de repos avant la dégressive', !(await reposVisible()),
      esp(await texte('#repos')));
    // La visée : la moitié des reps de la dernière série de travail FAITE (15).
    ok('[U10] la phrase de la dégressive',
      esp((await phrasesU('degressive'))[0]) === 'Dégressive : 45 kg, sans repos, jusqu\'à l\'échec. Vise 6 à 8.',
      esp(JSON.stringify(await phrasesU('degressive'))));
    // PR 3 de la consolidation (delta 49-38, MOTEUR §9.15.3) — LA DÉGRESSIVE
    // N'A QU'UNE VOIX : les reps grisées de la ligne sont le milieu de « Vise
    // 6 à 8 », pas celles de la routine ni de la fois d'avant.
    const repsDeg = await page.evaluate(() => {
      const l = document.querySelectorAll('.ligne-serie')[9];
      const champs = l ? Array.from(l.querySelectorAll('input')) : [];
      return champs.length > 1 ? champs[1].placeholder : null;
    });
    ok('[U10] PR 3 (delta 49-38) — DISCRIMINANT : la dégressive pré-remplit 7 reps, le milieu de « Vise 6 à 8 »',
      repsDeg === '7', String(repsDeg));
    await page.evaluate(() => document.querySelectorAll('.ligne-serie')[9].querySelector('.ok-serie').click());
    await attendre(1200);
    const deg = base.sets.filter((x) => x.exercise_slug === 'quadri-u10' && x.type_serie === 'degressive' && !/^u10-/.test(x.session_id));
    ok('[U10] la dégressive validée à vide s’écrit à 45 kg', deg.some((x) => Number(x.charge_kg) === 45),
      JSON.stringify(deg.map((x) => [x.charge_kg, x.reps])));
    ok('[U10] PR 3 (delta 49-38) — et à 7 reps : ce que la ligne affichait, ce que la phrase visait',
      deg.some((x) => Number(x.charge_kg) === 45 && Number(x.reps) === 7), JSON.stringify(deg.map((x) => [x.charge_kg, x.reps])));
    ok('[U10] la dégressive faite relance le repos (la suite n’est plus une dégressive)', await reposVisible(), '');

    // La barre : la dégressive reste vide.
    f = await fantomesU();
    ok('[U10] DISCRIMINANT — à la barre, la dégressive reste vide', f[12] === '', JSON.stringify(f.slice(10, 13)));
    ok('[U10] et le coach le dit', (await phrasesU('degressive')).map(esp).indexOf('Pas de dégressive à la barre.') >= 0,
      esp(JSON.stringify(await phrasesU('degressive'))));

    // Un exercice ajouté hors routine, à la barre, sans chauffe : la proposition.
    await ajouterExoSeance('Militaire U10');
    const prop1 = await propositionU(3);
    ok('[U10] DISCRIMINANT — ajouté sans chauffe : le coach PROPOSE la montée (80 kg : 20 · 40 · 55 · 70)',
      esp(prop1) === 'Chauffe : 20 kg × 10 · 40 kg × 6 · 55 kg × 3 · 70 kg × 1', esp(prop1));
    const nAvant = await compter('.ligne-serie');
    await page.click('.proposition-chauffes[data-iexo="3"] .pc-refuser');
    await attendre(700);
    ok('[U10] « Non merci » : la proposition disparaît, aucune série insérée',
      (await propositionU(3)) === null && (await compter('.ligne-serie')) === nAvant, String(await compter('.ligne-serie')));
    const memoire1 = await page.evaluate(() => localStorage.getItem('th-v2-refus-chauffes'));
    ok('[U10] la mémoire du refus vit sur l’appareil (localStorage), un refus', /"militaire-u10":\{"n":1/.test(memoire1 || ''), memoire1);
    await abandonner();

    // Une AUTRE séance : un seul refus, la proposition revient ; « Ajouter ».
    await aller('/saisie');
    await demarrerRoutine('Chauffes U10');
    await attendre(900);
    await ajouterExoSeance('Militaire U10');
    ok('[U10] une autre séance : la proposition revient (un refus seulement)', (await propositionU(3)) !== null, '');
    const avantAjout = await compter('.ligne-serie');
    await page.click('.proposition-chauffes[data-iexo="3"] .pc-ajouter');
    await attendre(900);
    f = await fantomesU();
    ok('[U10] « Ajouter » : quatre lignes au-dessus du travail, remplies 20 · 40 · 55 · 70',
      (await compter('.ligne-serie')) === avantAjout + 4 && JSON.stringify(f.slice(13, 17)) === JSON.stringify(['20', '40', '55', '70']),
      JSON.stringify(f.slice(13)));
    ok('[U10] et la proposition disparaît', (await propositionU(3)) === null, '');
    const memoire2 = await page.evaluate(() => localStorage.getItem('th-v2-refus-chauffes'));
    ok('[U10] « Ajouter » remet le compte à zéro', !/militaire-u10/.test(memoire2 || ''), memoire2);
    // PR 4 de la consolidation — « + Série » sur la machine, dont la
    // dégressive attend : la série de travail se place AVANT elle. Avant, elle
    // tombait derrière la dégressive.
    const typesQuadri = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'quadri-u10')[0];
      return x ? x.lignes.map((l) => l.type) : null;
    });
    const avantPlus = await typesQuadri();
    await plusSerie(1);
    await attendre(600);
    const apresPlus = await typesQuadri();
    ok('[U10] PR 4 — DISCRIMINANT : « + Série » avant la dégressive qui attend (travail, travail, travail, dégressive)',
      JSON.stringify(avantPlus) === JSON.stringify(['travail', 'travail', 'degressive']) &&
      JSON.stringify(apresPlus) === JSON.stringify(['travail', 'travail', 'travail', 'degressive']),
      JSON.stringify([avantPlus, apresPlus]));
    ok('[U10] la garde (C6) n’a rien signalé dans cette section', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await abandonner();
    await aller('/saisie');
    ok('[U10] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G octies. LA PHASE, GELÉE POUR LA SÉANCE ET ENREGISTRÉE AVEC CHAQUE PARI (49-U11, MOTEUR §9.16) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : la phase CHANGÉE EN PLEINE SÉANCE. Une
  // phase lue en direct et une phase gelée donnent les mêmes paris tant que
  // personne ne touche au Profil ; seul le troisième pari, posé après le
  // changement, les sépare. Puis la séance SUIVANTE, qui doit, elle, prendre
  // la nouvelle phase.
  {
    const tF = Date.now();
    [21, 14, 7].forEach((j) => {
      const id = 'u11-' + j;
      const debut = ilYa(j * 86400000, tF).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U11 — ' + id, debut,
        fin: finDe(debut, tF).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      [1, 2, 3].forEach((rang) => base.sets.push({ id: id + '-s' + rang, session_id: id, user_id: 'u-banc',
        exercise_slug: 'presse-u11', charge_kg: 100, reps: 10, duree_s: null, distance_m: null,
        type_serie: 'travail', rang, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    });
    ROUTINES.push({ id: 'r-u11', nom: 'Phase U11', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-u11-e', routine_id: 'r-u11', exercise_slug: 'presse-u11', rang: 0,
        routine_sets: progr(3, 10), repos_cible_s: 90, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const phases = () => base.predictions.filter((q) => q.exercise_slug === 'presse-u11')
      .map((q) => q.fondement && q.fondement.phase);
    const parSeance = () => {
      const m = {};
      base.predictions.filter((q) => q.exercise_slug === 'presse-u11')
        .forEach((q) => { const k = q.fondement.seance; (m[k] = m[k] || []).push(q.fondement.phase); });
      return Object.keys(m).map((k) => m[k]);
    };
    const choisirPhase = async (cle) => {
      await onglet('profil');
      await page.click('.p-seg button[data-cle="' + cle + '"]');
      await attendre(1200);
    };
    const violationsAvant = gardeBanc.violations;
    const avantProfil = base.journal.length;

    // 1. Profil : Sèche, et la date du jour sous le réglage.
    await aller('/saisie');
    await choisirPhase('seche');
    const pied = esp(await texte('.p-pied'));
    const aujourdHui = await page.evaluate(() => window.THModele.quand(new Date().toISOString()));
    ok('[U11] Profil : Sèche est sélectionnée, sans attendre le serveur',
      (await texte('.p-seg button.on[data-cle="seche"]')) === 'Sèche', esp(await texte('.p-seg.deux')));
    ok('[U11] « Depuis le … » : la date de la déclaration', pied === esp('Depuis ' + aujourdHui), pied);
    const envoi = base.journal.slice(avantProfil).filter((j) => j.op === 'profil').slice(-1)[0];
    ok('[U11] `phase` et `phase_depuis` partent au serveur (par la file du profil)',
      base.profiles[0].phase === 'seche' && !!base.profiles[0].phase_depuis &&
      !!envoi && envoi.champs.phase === 'seche' && !!envoi.champs.phase_depuis,
      JSON.stringify({ phase: base.profiles[0].phase, depuis: base.profiles[0].phase_depuis }));

    // 2. Une séance, deux séries validées : deux paris à `seche`.
    await onglet('saisie');
    await demarrerRoutine('Phase U11');
    await attendre(900);
    await saisirSerie(0, 100, 10);
    await saisirSerie(1, 100, 10);
    await attendre(1500);
    ok('[U11] deux paris posés, tous deux à `seche`', JSON.stringify(phases()) === '["seche","seche"]',
      JSON.stringify(phases()));

    // 3. En pleine séance, la phase change dans Profil.
    await choisirPhase('maintien');
    ok('[U11] le profil passe à « Maintien ou recomposition »', base.profiles[0].phase === 'maintien',
      JSON.stringify(base.profiles[0].phase));
    await onglet('saisie');
    await attendre(600);
    // 4. Une troisième série : son pari reste à `seche`.
    await saisirSerie(2, 100, 10);
    await attendre(1500);
    ok('[U11] DISCRIMINANT — le troisième pari, posé après le changement, reste à `seche` (gelée pour la séance)',
      JSON.stringify(phases()) === '["seche","seche","seche"]', JSON.stringify(phases()));
    await terminer();

    // 5. La séance SUIVANTE prend la nouvelle phase.
    await aller('/saisie');
    await demarrerRoutine('Phase U11');
    await attendre(900);
    await saisirSerie(0, 100, 10);
    await attendre(1500);
    const ps = parSeance();
    ok('[U11] la séance suivante prend la nouvelle phase : `maintien`',
      ps.length === 2 && JSON.stringify(ps.map((l) => l.join(','))) === '["seche,seche,seche","maintien"]',
      JSON.stringify(ps));
    await abandonner();
    await choisirPhase('seche');
    ok('[U11] la garde (C6) n’a rien signalé dans cette section (I18 compris)', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await aller('/saisie');
    ok('[U11] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G nonies. LA CHUTE DE FIN DE SÉANCE NE TIRE PLUS LE NIVEAU ET BLOQUE LE TEST (49-U12, MOTEUR §9.2 bis) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : la séance du 29/09 d'Aurélien, 80 × 10,
  // 10, puis 6 à RPE 10, après deux séances à 9 (zone Hypertrophie, 8 à 10).
  // Sans la règle, le niveau tombait à 7 (« une rep de plus », 80 × 8) ; avec
  // le niveau à 10, le coach testerait plus lourd. Avec la règle : TENIR, à
  // 80 kg × 10, sans ligne haute, et la phrase grise le dit.
  {
    const tC = Date.now();
    const poserC = (id, jours, lignes) => {
      const debut = ilYa(jours * 86400000, tC).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U12 — ' + id, debut,
        fin: finDe(debut, tC).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps, rpe], i) => base.sets.push({ id: id + '-s' + (i + 1), session_id: id,
        user_id: 'u-banc', exercise_slug: 'incline-u12', charge_kg: kg, reps, duree_s: null, distance_m: null,
        type_serie: 'travail', rang: i + 1, groupe_superset: null, validee_a: debut, rpe: rpe || null,
        ressenti: null, repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
    };
    poserC('u12-a', 15, [[80, 9], [80, 9], [80, 9]]);
    poserC('u12-b', 8, [[80, 9], [80, 9], [80, 9]]);
    poserC('u12-c', 1, [[80, 10], [80, 10], [80, 6, 10]]);
    ROUTINES.push({ id: 'r-u12', nom: 'Chute U12', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-u12-e', routine_id: 'r-u12', exercise_slug: 'incline-u12', rang: 0,
        routine_sets: progr(3, 10), repos_cible_s: 120, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const violationsAvant = gardeBanc.violations;
    await aller('/saisie');
    await demarrerRoutine('Chute U12');
    await attendre(900);
    const cons = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'incline-u12')[0];
      const c = x && x.consigne;
      return c ? { etat: c.etat, niveau: c.niveau, ligne: c.ligne, haut: c.haut, chute: c.fondement.chute || null } : null;
    });
    const jaune = (await page.evaluate(() => Array.from(document.querySelectorAll('.legende-exo .consigne'))
      .map((e) => e.textContent))).map(esp);
    const gris = esp(await texte('.legende-exo .consigne-dit'));
    ok('[U12] la chute est repérée : la 3ᵉ série au palier', !!cons && !!cons.chute && cons.chute.rang === 3, JSON.stringify(cons));
    ok('[U12] DISCRIMINANT — tenir : 80 kg × 10, niveau 10, sans ligne haute (avant : 80 kg × 8)',
      !!cons && cons.etat === 'tenue_apres_chute' && cons.niveau === 10 && cons.haut === null &&
      cons.ligne.charge === 80 && cons.ligne.vise === 10, JSON.stringify(cons));
    ok('[U12] l’en-tête dit « 80 kg × 10 », et rien de plus lourd',
      jaune.length === 1 && jaune[0] === '80 kg × 10', JSON.stringify(jaune));
    ok('[U12] la phrase grise : « … : 80 kg × 10, 10, 6. Je ne compte pas la dernière série : on tient 80 kg × 10. »',
      /^\S+ : 80 kg × 10, 10, 6\. Je ne compte pas la dernière série : on tient 80 kg × 10\.$/.test(gris), gris);
    // La réaction en séance n'est pas touchée : 13 reps sur la première série, le coach réagit.
    await saisirSerie(0, 80, 13);
    await attendre(900);
    const reaction = esp(await texte('.reaction-serie'));
    ok('[U12] la réaction en séance reste libre (3 reps de plus → le coach parle)', reaction.length > 0, reaction);
    ok('[U12] la garde (C6) n’a rien signalé dans cette section', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await abandonner();
    await aller('/saisie');
    ok('[U12] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G decies. LE COMPTEUR DE STAGNATION, CALCULÉ DANS LE PLAN (49-U13, MOTEUR §12.9) ══');
  //
  // ⚠️ CONFIGURATIONS DISCRIMINANTES.
  //   · `curl-u13` : 25 kg × 12 cinq fois, chaque séance PORTANT UN PARI (sous
  //     consigne) : la première remet à zéro, les quatre suivantes sont
  //     suivies sans progrès → 4, et la phrase grise le dit, à l'ouverture et
  //     dans la feuille « Pourquoi ».
  //   · `tirage-u13` : le même plateau, mais deux des séances n'ont AUCUN pari
  //     (importées, ou d'avant le coach) : comptées, elles feraient 5 ; elles
  //     ne comptent pas → 3, et rien ne s'affiche.
  {
    const tK = Date.now();
    let graineK = 0;
    const poserK = (slug, id, jours, avecPari, charge) => {
      const kg = charge || 25;
      const debut = ilYa(jours * 86400000, tK).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U13 — ' + id, debut,
        fin: finDe(debut, tK).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      [1, 2, 3].forEach((rang) => base.sets.push({ id: id + '-s' + rang, session_id: id, user_id: 'u-banc',
        exercise_slug: slug, charge_kg: kg, reps: 12, duree_s: null, distance_m: null,
        type_serie: 'travail', rang, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
        repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null }));
      if (avecPari) {
        // Un pari sur la première série, comme l'app l'écrit : c'est lui qui
        // fait de la séance une séance SOUS CONSIGNE.
        base.predictions.push({ id: '00000000-0000-5000-8000-' + String(++graineK).padStart(12, '0') + '',
          user_id: 'u-banc', module: 'moteur.consigne', module_version: 4, emise_a: debut,
          exercise_slug: slug, grandeur: 'reps', horizon_jours: null, valeur_predite: 12,
          borne_basse: 10, borne_haute: 12,
          fondement: { rang: 1, charge: 25, etat: 'progression', zone: 'volume', reglage: 'normal',
                       palier: 25, niveau: 12, seance: id, role: 'ligne', phase: 'maintien' },
          valeur_observee: 12, observee_a: debut, set_observe: id + '-s1', created_at: debut });
      }
    };
    // Le curl : sept séances, la première sans pari (le départ), les six
    // suivantes avec — 1 remise à zéro + 4 suivies sans progrès, puis une
    // séance à 20 kg, SOUS la charge proposée : ni progrès ni stagnation (le
    // compteur reste à 4), et la phrase cite toujours le meilleur, 25 kg × 12,
    // jamais la charge du jour.
    poserK('curl-u13', 'k-c0', 40, false);
    [35, 30, 25, 20, 15].forEach((j, i) => poserK('curl-u13', 'k-c' + (i + 1), j, true));
    poserK('curl-u13', 'k-c6', 10, true, 20);
    // Le tirage : sept séances ; les deux du milieu SANS pari.
    poserK('tirage-u13', 'k-t0', 40, false);
    [[35, true], [30, true], [25, false], [20, false], [15, true], [10, true]]
      .forEach(([j, p], i) => poserK('tirage-u13', 'k-t' + (i + 1), j, p));
    ROUTINES.push({ id: 'r-u13', nom: 'Compteur U13', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-u13-a', routine_id: 'r-u13', exercise_slug: 'curl-u13', rang: 0,
          routine_sets: progr(3, 12), repos_cible_s: 90, groupe_superset: null, note: null },
        { id: 'r-u13-b', routine_id: 'r-u13', exercise_slug: 'tirage-u13', rang: 1,
          routine_sets: progr(3, 12), repos_cible_s: 90, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const violationsAvant = gardeBanc.violations;
    await aller('/saisie');
    await demarrerRoutine('Compteur U13');
    await attendre(900);
    const compteurs = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const de = (slug) => { const x = d && d.plan.exercices.filter((e) => e.slug === slug)[0]; return x ? x.compteur : null; };
      const x = d && d.plan.exercices.filter((e) => e.slug === 'curl-u13')[0];
      const carte = x ? document.querySelector('.proposition-exercice[data-iexo="' + x.iExo + '"]:not(.proposition-chauffes) .pc-texte') : null;
      return { curl: de('curl-u13'), tirage: de('tirage-u13'), phase: d ? d.plan.phase : null,
               marche: x && x.escalier ? x.escalier.marche : null, carte: carte ? carte.textContent : null };
    });
    // MOTEUR §14.5 (49-U15) — le curl (Volume, compteur 4) est au 1er
    // déclenchement isolé : EN SÈCHE, la phrase dit aussi « je ne te propose
    // rien de plus ». La phase est celle que les sections d'avant ont laissée
    // au profil (en séquentiel, 7 G octies finit en sèche) : on la lit sur le
    // plan, la phrase attendue suit.
    const phraseU13 = '25 kg × 12 reste ton meilleur depuis 4 séances.' +
      (compteurs.phase === 'seche' ? ' En sèche, je ne te propose rien de plus.' : '');
    const lignesCompteur = (await page.evaluate(() => Array.from(document.querySelectorAll('.legende-exo'))
      .map((l) => { const c = l.querySelector('.consigne-dit.compteur'); return c ? c.textContent : null; }))).map((t) => t && esp(t));
    ok('[U13] le curl : 4 séances suivies sans progrès depuis 25 kg × 12 (la séance à 20 kg, non suivie, ne compte pas)',
      !!compteurs.curl && compteurs.curl.compteur === 4 && compteurs.curl.meilleur.palier === 25 &&
      compteurs.curl.meilleur.niveau === 12, JSON.stringify(compteurs.curl));
    // MOTEUR §14.7 (49-U17) — le curl (Volume, compteur 4) est au 1er
    // déclenchement isolé : selon la place de ses muscles (lue sur tout
    // l'historique du banc), la carte de la série de plus dit le meilleur, ou
    // le repli tout de suite — sauté sans palier tenu, c'est le silence : la
    // phrase quitte l'en-tête. Le meilleur, lui, reste 25 × 12 (contrôle
    // ci-dessus) ; là où une phrase le dit, elle dit celui-là.
    const silence = compteurs.marche === 'silence';
    ok('[U13] DISCRIMINANT — la phrase grise à l’ouverture : « 25 kg × 12 reste ton meilleur depuis 4 séances. » (le meilleur, pas les 20 kg du jour)',
      silence ? lignesCompteur[0] === null
        : (compteurs.carte ? esp(compteurs.carte).indexOf('25 kg × 12 reste ton meilleur depuis 4 séances') === 0
                           : lignesCompteur[0] === phraseU13),
      JSON.stringify([lignesCompteur, compteurs.phase, compteurs.marche, compteurs.carte]));
    ok('[U13] DISCRIMINANT — le tirage : les séances sans pari ne comptent pas → 3 (elles en feraient 5)',
      !!compteurs.tirage && compteurs.tirage.compteur === 3, JSON.stringify(compteurs.tirage));
    ok('[U13] à 3 séances : rien dans l’en-tête', lignesCompteur.length === 2 && lignesCompteur[1] === null,
      JSON.stringify(lignesCompteur));
    // La feuille « Pourquoi » du curl : la même phrase, en une ligne.
    await page.evaluate(() => {
      const c = document.querySelector('.legende-exo .consigne, .legende-exo .consigne-dit');
      if (c) c.click();
    });
    await attendre(700);
    const feuille = (await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .pq-p'))
      .map((n) => n.textContent))).map(esp);
    ok('[U13] la feuille « Pourquoi » le dit en une ligne (quand l’en-tête le dit)',
      feuille.filter((t) => t === phraseU13).length === (lignesCompteur[0] ? 1 : 0), JSON.stringify(feuille));
    await page.click('#btn-fermer-feuille');
    await attendre(600);
    ok('[U13] la garde (C6) n’a rien signalé dans cette section', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await abandonner();
    await aller('/saisie');
    ok('[U13] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G terdecies. LA SÉRIE DE PLUS, JUSQU’AU PROCHAIN PROGRÈS (49-U17, MOTEUR §14.7) ══');
  //
  // ⚠️ CHAÎNÉE DEVANT 7 G duodecies et 7 G undecies (`seance-chaines.json`) :
  // 7 G undecies laisse une semaine allégée acceptée aujourd'hui (aucune marche
  // pendant la période, I21). Ici, rien ne gêne la suite : les paris du décor
  // ont 9 jours ou plus, et la section ne valide aucune série.
  //
  // CONFIGURATION DISCRIMINANTE : `serre-u17` (Volume, 25 kg × 12), SEUL sur
  // son muscle (avant-bras) :
  //   · seize séances, une par semaine, de 114 à 9 jours : 4 séries, puis 3 sur
  //     les trois dernières semaines → la dernière fenêtre (3) ne dépasse pas
  //     le 3e quartile (4) : DE LA PLACE ;
  //   · les cinq dernières sous consigne → compteur 4 : le 1er déclenchement
  //     isolé, en zone muscle, hors sèche → la carte de la série de plus.
  // A — la carte, « Ajouter une série » : le pari, PUIS une ligne de plus,
  //     après les 3 de la routine, à 25 kg × 12, jamais un test.
  // B — une nouvelle séance, le même jour (compteur toujours 4, pas de
  //     progrès) : la ligne en plus revient d'elle-même, sans carte.
  // 0 — `?escalier=isole`, le 3e exercice : la carte, « Ajouter une série »,
  //     la ligne de plus — et AUCUN pari.
  {
    const tP = Date.now();
    let graineP = 500;
    const sessionP = (id, jours) => {
      const debut = ilYa(jours * 86400000, tP).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U17 — ' + id, debut,
        fin: finDe(debut, tP).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      return debut;
    };
    const serieP = (id, slug, rang, kg, reps, debut) => base.sets.push({ id: id + '-' + slug + '-s' + rang,
      session_id: id, user_id: 'u-banc', exercise_slug: slug, charge_kg: kg, reps, duree_s: null,
      distance_m: null, type_serie: 'travail', rang, groupe_superset: null, validee_a: debut, rpe: null,
      ressenti: null, repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null });
    const pariP = (id, slug, debut, compteur, kg, reps) => base.predictions.push({
      id: '00000000-0000-5000-8000-' + String(++graineP).padStart(12, '0'),
      user_id: 'u-banc', module: 'moteur.consigne', module_version: 4, emise_a: debut,
      exercise_slug: slug, grandeur: 'reps', horizon_jours: null, valeur_predite: reps,
      borne_basse: 10, borne_haute: 12,
      fondement: { rang: 1, charge: kg, etat: 'progression', zone: 'volume', reglage: 'normal',
                   palier: kg, niveau: reps, seance: id, role: 'ligne', phase: 'maintien', compteur },
      valeur_observee: reps, observee_a: debut, set_observe: id + '-' + slug + '-s1', created_at: debut });
    const jours = [];
    for (let k = 15; k >= 0; k--) jours.push(9 + 7 * k);
    jours.forEach((j, i) => {
      const id = 'u17-s' + i;
      const debut = sessionP(id, j);
      const n = i >= jours.length - 3 ? 3 : 4;
      for (let r = 1; r <= n; r++) serieP(id, 'serre-u17', r, 25, 12, debut);
      if (i >= jours.length - 5) pariP(id, 'serre-u17', debut, i - (jours.length - 5), 25, 12);
    });
    // La démonstration : deux exercices avec une consigne (deux séances, sans
    // pari), devant le serré.
    [['u17-h', 'hausse-u17', 60], ['u17-t', 'tendu-u17', 100]].forEach(([id, slug, kg]) => {
      [40, 31].forEach((jj, k) => {
        const sid = id + '-' + k;
        const debut = sessionP(sid, jj);
        [1, 2, 3].forEach((r) => serieP(sid, slug, r, kg, 5, debut));
      });
    });
    ROUTINES.push({ id: 'r-u17', nom: 'Série U17', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: 'r-u17-a', routine_id: 'r-u17', exercise_slug: 'serre-u17', rang: 0,
        routine_sets: progr(3, 12), repos_cible_s: 90, groupe_superset: null, note: null }] });
    ROUTINES.push({ id: 'r-u17-d', nom: 'Démo U17', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: ['hausse-u17', 'tendu-u17', 'serre-u17'].map((slug, k) => ({ id: 'r-u17-d' + k,
        routine_id: 'r-u17-d', exercise_slug: slug, rang: k, routine_sets: progr(3, 12), repos_cible_s: 90,
        groupe_superset: null, note: null })) });
    // La phase du profil : celle qu'auront laissée d'autres sections (en
    // séquentiel, 7 G octies finit en sèche) n'est pas la question ici.
    if (base.profiles && base.profiles[0]) base.profiles[0].phase = 'maintien';
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const lireSerie = () => page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'serre-u17')[0];
      const i = x ? x.iExo : -1;
      const carte = document.querySelector('.proposition-serie[data-iexo="' + i + '"]');
      const legende = Array.from(document.querySelectorAll('.legende-exo'))[i] || null;
      return {
        phase: d ? d.plan.phase : null,
        compteur: x && x.compteur ? x.compteur.compteur : null,
        place: x ? x.placeSerieDePlus : null,
        marche: x && x.escalier ? x.escalier.marche : null,
        carte: carte ? { texte: carte.querySelector('.pc-texte').textContent,
                         detail: carte.querySelector('.pc-detail').textContent,
                         oui: carte.querySelector('.psp-oui').textContent, non: carte.querySelector('.psp-non').textContent } : null,
        lignes: x ? x.lignes.filter((l) => l.type === 'travail').map((l) => [l.role, l.charge, l.vise, !!l.ajoutee]) : null,
        ajouteesEcran: document.querySelectorAll('.ligne-serie.ajoutee').length,
        plus: legende && legende.querySelector('.consigne-dit.serie-de-plus') ? legende.querySelector('.consigne-dit.serie-de-plus').textContent : null
      };
    });
    const parisPlus = () => base.predictions.filter((l) => l.module === 'escalier' && l.fondement &&
      l.fondement.marche === 'serie_de_plus');
    const violationsAvant = gardeBanc.violations;

    // ── 0. La démonstration : le 3e exercice, sans pari.
    const parisAvant = base.predictions.length;
    await aller('/saisie?escalier=isole');
    await demarrerRoutine('Démo U17');
    await attendre(1200);
    const d1 = await page.evaluate(() => {
      const c = document.querySelector('.proposition-serie');
      return c ? { iexo: c.getAttribute('data-iexo'), texte: c.querySelector('.pc-texte').textContent } : null;
    });
    ok('[U17] 0 — démonstration : la carte de la série de plus sur le 3e exercice',
      !!d1 && d1.iexo === '2' && /reste ton meilleur depuis 4 séances/.test(esp(d1.texte)), JSON.stringify(d1));
    const avant0 = await compter('.ligne-serie');
    await page.click('.proposition-serie .psp-oui');
    await attendre(1200);
    ok('[U17] 0 — « Ajouter une série » : une ligne de plus, et AUCUN pari écrit',
      (await compter('.ligne-serie')) === avant0 + 1 && (await compter('.ligne-serie.ajoutee')) === 1 &&
      base.predictions.length === parisAvant,
      JSON.stringify({ lignes: (await compter('.ligne-serie')) - avant0, paris: base.predictions.length - parisAvant }));
    await abandonner();
    await aller('/saisie?escalier=0');

    // ── A. La carte, puis « Ajouter une série ».
    await aller('/saisie');
    await demarrerRoutine('Série U17');
    await attendre(1200);
    const a = await lireSerie();
    ok('[U17] prémisse : Volume, maintien, compteur 4, de la place sur les avant-bras',
      a.phase === 'maintien' && a.compteur === 4 && a.place === true, JSON.stringify(a));
    ok('[U17] A — la carte de la série de plus sous l’exercice : la phrase, le détail, « Ajouter une série » / « Non merci »',
      a.marche === 'serie_de_plus' && !!a.carte &&
      /^25 kg × 12 reste ton meilleur depuis 4 séances(, et tes autres exercices avancent)?\.$/.test(esp(a.carte.texte)) &&
      a.carte.detail === 'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. Tes avant-bras restent sous leur volume habituel.' &&
      a.carte.oui === 'Ajouter une série' && a.carte.non === 'Non merci', JSON.stringify(a.carte));
    ok('[U17] A — avant la réponse : les 3 lignes de la routine, aucune en plus',
      a.lignes.length === 3 && a.lignes.every((l) => !l[3]), JSON.stringify(a.lignes));
    await page.click('.proposition-serie .psp-oui');
    await attendre(1500);
    const a2 = await lireSerie();
    const pari = parisPlus()[0];
    ok('[U17] A — le pari : escalier, série de plus, acceptée, l’exercice dans le fondement, 3 séries de routine',
      !!pari && pari.exercise_slug === null && pari.fondement.exercice === 'serre-u17' &&
      pari.fondement.reponse === 'acceptee' && pari.fondement.compteur === 4 && pari.fondement.n_routine === 3,
      JSON.stringify(pari && pari.fondement));
    ok('[U17] A — une ligne de plus, après la routine, à 25 kg × 12, jamais un test ; marquée à l’écran',
      a2.lignes.length === 4 && JSON.stringify(a2.lignes[0]) === JSON.stringify(['ligne', 25, 12, false]) &&
      JSON.stringify(a2.lignes[3]) === JSON.stringify(['ligne', 25, 12, true]) &&
      a2.lignes.slice(0, 3).every((l) => !l[3]) && a2.ajouteesEcran === 1 && a2.carte === null, JSON.stringify(a2));
    ok('[U17] A — en gris : « une série de plus, jusqu’à ton prochain progrès »',
      a2.plus === 'une série de plus, jusqu\'à ton prochain progrès',
      JSON.stringify(a2.plus));
    await abandonner();

    // ── B. Une nouvelle séance : la ligne en plus revient, sans carte.
    await aller('/saisie');
    await demarrerRoutine('Série U17');
    await attendre(1500);
    const b = await lireSerie();
    ok('[U17] B — la séance suivante, sans progrès : 4 lignes, la dernière en plus ; ni carte ni nouveau pari',
      b.lignes.length === 4 && b.lignes[3][3] === true && b.lignes[3][0] === 'ligne' && b.carte === null &&
      parisPlus().length === 1, JSON.stringify({ b, paris: parisPlus().length }));
    await abandonner();

    // ── C. (delta 49-35) Un exercice AJOUTÉ en cours de séance, sa série de
    //     plus active : il reçoit sa ligne de plus, comme à l'ouverture.
    await seanceVide();
    await ajouterExoSeance('Serré U17');
    await attendre(1200);
    const c = await lireSerie();
    ok('[U17] C — l’exercice ajouté en cours de séance reçoit sa ligne de plus : ses séries de départ, puis la ligne en plus',
      !!c.lignes && c.lignes.length >= 2 && c.lignes[c.lignes.length - 1][3] === true &&
      c.lignes.slice(0, -1).every((l) => !l[3]) && c.carte === null && c.ajouteesEcran === 1, JSON.stringify(c));
    await abandonner();


    ok('[U17] la garde (C6) n’a rien signalé dans cette section (I23, I24 compris)', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    ok('[U17] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
    // Rien d'ici ne reste pour la suite de la chaîne : le pari de la série de
    // plus est retiré de la base.
    base.predictions = base.predictions.filter((l) => !(l.module === 'escalier' && l.fondement &&
      l.fondement.exercice === 'serre-u17'));
  }

  console.log('\n══ 7 G duodecies. LE BLOCAGE ISOLÉ : LE SCHÉMA, PUIS LE REPLI (49-U15, MOTEUR §14.5) ══');
  //
  // ⚠️ AVANT 7 G undecies, ET CHAÎNÉE DEVANT ELLE (`seance-chaines.json`) :
  // celle-ci laisse une semaine allégée ACCEPTÉE aujourd'hui (sur l'appareil
  // ET en base), et pendant la période aucune marche isolée ne s'ouvre (I21).
  // En sens inverse, rien d'ici ne la gêne : les paris de ce décor ont tous
  // 9 jours ou plus, hors de sa fenêtre de 7 jours, et cette section ne valide
  // aucune série (aucun compteur figé aujourd'hui).
  //
  // CONFIGURATION DISCRIMINANTE : UN SEUL exercice cale (aucun autre à 4 ou
  // plus sur 7 jours) — pas de carte de semaine allégée.
  //   · `pousse-u15` (Lourd, 125 kg × 5) : six séances tous les 9 jours, cinq
  //     sous consigne → compteur 4 à l'ouverture : le 1er déclenchement isolé,
  //     en zone force — la carte de schéma ;
  //   · `tracte-u15` (Lourd, 125 kg × 5) : une séance à 120 kg × 5 il y a 88
  //     jours (le palier TENU sous le meilleur, à moins de 10 %), puis neuf
  //     séances à 125 sous consigne → compteur 8 : le 2e déclenchement, le
  //     repli à 120 kg.
  // 0 — `?escalier=isole` : la carte de schéma et un repli sur une séance
  //     quelconque, AUCUN pari, aucune zone posée.
  // A — la carte, « Passer à 6-8 reps » : le pari, puis la correction de zone.
  // B — le repli : la consigne de 120 kg, sans test, et son pari à l'ouverture.
  {
    const tI = Date.now();
    let graineI = 300;
    const sessionI = (id, jours) => {
      const debut = ilYa(jours * 86400000, tI).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U15 — ' + id, debut,
        fin: finDe(debut, tI).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      return debut;
    };
    const serieI = (id, slug, rang, kg, reps, debut) => base.sets.push({ id: id + '-' + slug + '-s' + rang,
      session_id: id, user_id: 'u-banc', exercise_slug: slug, charge_kg: kg, reps, duree_s: null,
      distance_m: null, type_serie: 'travail', rang, groupe_superset: null, validee_a: debut, rpe: null,
      ressenti: null, repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null });
    const pariI = (id, slug, debut, compteur, kg, reps) => base.predictions.push({
      id: '00000000-0000-5000-8000-' + String(++graineI).padStart(12, '0'),
      user_id: 'u-banc', module: 'moteur.consigne', module_version: 4, emise_a: debut,
      exercise_slug: slug, grandeur: 'reps', horizon_jours: null, valeur_predite: reps,
      borne_basse: 3, borne_haute: 5,
      fondement: { rang: 1, charge: kg, etat: 'progression', zone: 'lourd', reglage: 'normal',
                   palier: kg, niveau: reps, seance: id, role: 'ligne', phase: 'maintien', compteur },
      valeur_observee: reps, observee_a: debut, set_observe: id + '-' + slug + '-s1', created_at: debut });
    // Le poussé : six séances, la première sans pari.
    [54, 45, 36, 27, 18, 9].forEach((j, i) => {
      const id = 'u15-p' + i;
      const debut = sessionI(id, j);
      [1, 2, 3, 4].forEach((r) => serieI(id, 'pousse-u15', r, 125, 5, debut));
      if (i > 0) pariI(id, 'pousse-u15', debut, i - 1, 125, 5);
    });
    // Le tracté : 120 × 5 il y a 88 jours (sans pari), puis neuf séances à 125.
    const debutRepli = sessionI('u15-t-repli', 88);
    [1, 2, 3, 4].forEach((r) => serieI('u15-t-repli', 'tracte-u15', r, 120, 5, debutRepli));
    [81, 72, 63, 54, 45, 36, 27, 18, 9].forEach((j, i) => {
      const id = 'u15-t' + i;
      const debut = sessionI(id, j);
      [1, 2, 3, 4].forEach((r) => serieI(id, 'tracte-u15', r, 125, 5, debut));
      pariI(id, 'tracte-u15', debut, i, 125, 5);
    });
    // La démonstration : deux exercices avec une consigne, sans pari.
    [['u15-d1', 'leve-u15', 40, 60], ['u15-d2', 'presse-u15', 30, 150]].forEach(([id, slug, j, kg]) => {
      [j + 9, j].forEach((jj, k) => {
        const sid = id + '-' + k;
        const debut = sessionI(sid, jj);
        [1, 2, 3].forEach((r) => serieI(sid, slug, r, kg, 5, debut));
      });
    });
    const routineI = (id, nom, slug) => ROUTINES.push({ id, nom, note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [{ id: id + '-a', routine_id: id, exercise_slug: slug, rang: 0,
        routine_sets: progr(4, 5), repos_cible_s: 180, groupe_superset: null, note: null }] });
    routineI('r-u15-p', 'Schéma U15', 'pousse-u15');
    routineI('r-u15-t', 'Repli U15', 'tracte-u15');
    ROUTINES.push({ id: 'r-u15-d', nom: 'Démo U15', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-u15-d1', routine_id: 'r-u15-d', exercise_slug: 'leve-u15', rang: 0,
          routine_sets: progr(3, 5), repos_cible_s: 120, groupe_superset: null, note: null },
        { id: 'r-u15-d2', routine_id: 'r-u15-d', exercise_slug: 'presse-u15', rang: 1,
          routine_sets: progr(3, 5), repos_cible_s: 120, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
    const lireIsole = (slug) => page.evaluate((s) => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === s)[0];
      const i = x ? x.iExo : -1;
      const carte = document.querySelector('.proposition-schema[data-iexo="' + i + '"]');
      const legende = Array.from(document.querySelectorAll('.legende-exo'))[i] || null;
      return {
        marche: x && x.escalier ? x.escalier.marche : null,
        carte: carte ? { texte: carte.querySelector('.pc-texte').textContent,
                         detail: carte.querySelector('.pc-detail') ? carte.querySelector('.pc-detail').textContent : null,
                         oui: carte.querySelector('.ps-oui').textContent, non: carte.querySelector('.ps-non').textContent } : null,
        cartes: document.querySelectorAll('.proposition-schema').length,
        zone: x && x.consigne ? x.consigne.zone : null,
        compteur: x && x.compteur ? x.compteur.compteur : null,
        jaune: legende ? Array.from(legende.querySelectorAll('.consigne')).map((n) => n.textContent) : [],
        gris: legende && legende.querySelector('.consigne-dit:not(.compteur)') ? legende.querySelector('.consigne-dit:not(.compteur)').textContent : null,
        phraseCompteur: legende && legende.querySelector('.consigne-dit.compteur') ? legende.querySelector('.consigne-dit.compteur').textContent : null,
        lignes: x ? x.lignes.filter((l) => l.type === 'travail').map((l) => [l.role, l.charge, l.vise]) : null,
        repli: x && x.consigne && x.consigne.repli ? x.consigne.repli : null,
        carteAllegee: !!(d && d.plan.carte)
      };
    }, slug);
    const parisEscalier = () => base.predictions.filter((l) => l.module === 'escalier');
    const violationsAvant = gardeBanc.violations;

    // ── 0. `?escalier=isole` : la carte de schéma sur le premier exercice, un
    //     repli inventé sur le second — et RIEN n'est écrit.
    const parisAvant = base.predictions.length;
    const zonesAvant = base.zones.length;
    await aller('/saisie?escalier=isole');
    await demarrerRoutine('Démo U15');
    await attendre(900);
    const d1 = await lireIsole('leve-u15');
    const d2 = await lireIsole('presse-u15');
    ok('[U15] 0 — démonstration : la carte de schéma sous le premier exercice, « Passer à 6-8 reps » / « Garder 3-5 »',
      d1.marche === 'schema' && !!d1.carte && /reste ton meilleur depuis 4 séances/.test(esp(d1.carte.texte)) &&
      d1.carte.oui === 'Passer à 6-8 reps' && d1.carte.non === 'Garder 3-5', JSON.stringify(d1));
    ok('[U15] 0 — démonstration : un repli sur le second, sans test, la phrase « On repart de … »',
      d2.marche === 'repli' && !!d2.repli && /^On repart de .* kg, ta dernière charge tenue : .* kg × (\d+), \1, \1 le /.test(esp(d2.gris)) &&
      d2.lignes.every((l) => l[0] === 'ligne' && l[1] === d2.repli.palier), JSON.stringify(d2));
    await page.click('.proposition-schema .ps-non');
    await attendre(700);
    const d3 = await lireIsole('leve-u15');
    ok('[U15] 0 — « Garder 3-5 » : la carte part ; AUCUN pari, AUCUNE zone posée',
      d3.cartes === 0 && base.predictions.length === parisAvant && base.zones.length === zonesAvant,
      JSON.stringify({ cartes: d3.cartes, paris: base.predictions.length - parisAvant, zones: base.zones.length - zonesAvant }));
    await abandonner();
    await aller('/saisie?escalier=0');

    // ── A. Le poussé : la carte de schéma, puis « Passer à 6-8 reps ».
    await aller('/saisie');
    await demarrerRoutine('Schéma U15');
    await attendre(900);
    const a = await lireIsole('pousse-u15');
    ok('[U15] A — compteur 4, zone Lourd, un seul exercice qui cale : la carte de schéma, pas de carte de semaine allégée',
      a.compteur === 4 && a.zone === 'lourd' && a.marche === 'schema' && !a.carteAllegee && a.cartes === 1, JSON.stringify(a));
    ok('[U15] A — la phrase, le détail et les deux libellés de §14.5',
      !!a.carte && /^125 kg × 5 reste ton meilleur depuis 4 séances(, et tes autres exercices avancent)?\.$/.test(esp(a.carte.texte)) &&
      a.carte.detail === 'En force, une série de plus aide peu. Changer de schéma quelques semaines relance souvent la barre, avant d\'y revenir.' &&
      a.carte.oui === 'Passer à 6-8 reps' && a.carte.non === 'Garder 3-5', JSON.stringify(a.carte));
    ok('[U15] A — la phrase du compteur n\'est pas répétée dans l\'en-tête', a.phraseCompteur === null, JSON.stringify(a.phraseCompteur));
    // MOTEUR §14.6 (49-U16) — la règle de volume, entrée du plan : calculée
    // UNE FOIS par séance (le même objet d'un plan au suivant), sur tout
    // l'historique ; le poussé (pectoraux) a une entrée. Rien ne s'affiche.
    const volumeAvant = await page.evaluate(() => {
      const v = window.THPlan && window.THPlan.dernier && window.THPlan.dernier.entrees.volume;
      window.__volumeU16 = v;
      return v ? { pectoraux: Object.prototype.hasOwnProperty.call(v, 'pectoraux'), place: window.THPlan.dernier.plan.exercices[0].placeSerieDePlus } : null;
    });
    ok('[U16] l\'entrée de volume est dans le plan (pectoraux), et la place par exercice aussi',
      !!volumeAvant && volumeAvant.pectoraux === true && typeof volumeAvant.place === 'boolean', JSON.stringify(volumeAvant));
    await page.click('.proposition-schema .ps-oui');
    await attendre(1500);
    const a2 = await lireIsole('pousse-u15');
    const pariS = parisEscalier().filter((l) => l.fondement && l.fondement.marche === 'schema')[0];
    const zoneS = base.zones.filter((l) => l.exercise_slug === 'pousse-u15').slice(-1)[0];
    ok('[U15] A — « Passer à 6-8 reps » écrit le pari : escalier, schéma, accepté, exercice dans le fondement, colonne vide',
      !!pariS && pariS.exercise_slug === null && pariS.fondement.exercice === 'pousse-u15' &&
      pariS.fondement.reponse === 'acceptee' && pariS.fondement.compteur === 4 && pariS.fondement.nouvelle_zone === 'mix' &&
      pariS.valeur_observee === null, JSON.stringify(pariS));
    ok('[U16] l\'entrée de volume n\'est PAS recalculée en cours de séance (même objet après la correction de zone)',
      await page.evaluate(() => !!window.__volumeU16 && window.THPlan.dernier.entrees.volume === window.__volumeU16), '');
    ok('[U15] A — … puis la correction de zone (le geste de 48b-7) : Mix, et le compteur repart de zéro',
      !!zoneS && zoneS.zone === 'mix' && a2.zone === 'mix' && a2.compteur === 0 && a2.cartes === 0 && a2.marche === null,
      JSON.stringify({ zone: zoneS, plan: a2 }));
    await abandonner();

    // ── B. Le tracté : le 2e déclenchement, le repli à 120 kg.
    await aller('/saisie');
    await demarrerRoutine('Repli U15');
    await attendre(1500);
    const b = await lireIsole('tracte-u15');
    ok('[U15] B — compteur 8 : la consigne de repli, 120 kg × 5 sur les quatre séries, aucun test',
      b.compteur === 8 && b.marche === 'repli' && JSON.stringify(b.lignes) === JSON.stringify([['ligne', 120, 5], ['ligne', 120, 5], ['ligne', 120, 5], ['ligne', 120, 5]]),
      JSON.stringify(b));
    ok('[U15] B — l\'en-tête : « 120 kg × 5 », et en gris « On repart de 120 kg, ta dernière charge tenue : 120 kg × 5, 5, 5, 5 le … » ; pas de phrase du compteur',
      b.jaune.length === 1 && b.jaune[0] === '120 kg × 5' &&
      /^On repart de 120 kg, ta dernière charge tenue : 120 kg × 5, 5, 5, 5 le \d+ [a-zéû]+\.?$/.test(esp(b.gris)) &&
      b.phraseCompteur === null, JSON.stringify([b.jaune, b.gris, b.phraseCompteur]));
    await attendre(800);
    const pariR = parisEscalier().filter((l) => l.fondement && l.fondement.marche === 'repli')[0];
    ok('[U15] B — le pari du repli, écrit à l\'ouverture : escalier, appliqué, 120 kg, exercice dans le fondement',
      !!pariR && pariR.exercise_slug === null && pariR.fondement.exercice === 'tracte-u15' &&
      pariR.fondement.reponse === 'appliquee' && pariR.fondement.compteur === 8 && pariR.fondement.repli.palier === 120,
      JSON.stringify(pariR && pariR.fondement));
    ok('[U15] B — un seul pari de repli, même après un geste (l\'identifiant est déterminé)',
      parisEscalier().filter((l) => l.fondement && l.fondement.marche === 'repli').length === 1,
      String(parisEscalier().length));
    await abandonner();

    ok('[U15] la garde (C6) n’a rien signalé dans cette section (I21, I22 compris)', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    await aller('/saisie');
    ok('[U15] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
    // Rien d'ici ne doit rester pour 7 G undecies : les paris de l'escalier
    // de cette section sont retirés de la base (ceux de l'appareil ne portent
    // pas de carte de semaine allégée, et leurs compteurs ont 9 jours ou plus).
    base.predictions = base.predictions.filter((l) => !(l.module === 'escalier' && l.fondement &&
      (l.fondement.exercice === 'pousse-u15' || l.fondement.exercice === 'tracte-u15')));
  }

  console.log('\n══ 7 G undecies. LA SEMAINE ALLÉGÉE : LA CARTE, PUIS 7 JOURS ALLÉGÉS (49-U14, MOTEUR §14.4) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : TROIS exercices qui calent ensemble.
  //   · `couche-u14` : 125 kg × 5 sur 4 séries, six séances dont cinq SOUS
  //     CONSIGNE → un compteur de 4 à l'ouverture : un DÉCLENCHEMENT ;
  //   · `squat-u14` (5) et `rowing-u14` (4) : un pari chacun il y a 2 et 3
  //     jours, le compteur À L'OUVERTURE figé dans son fondement. Le blocage
  //     généralisé se lit là, dans les paris, sans rejeu.
  // Un seul autre exercice à 4 ne suffirait pas ; les deux, si.
  // A — UNE SEMAINE ACCEPTÉE HIER : la séance d'aujourd'hui est allégée, sans
  //     carte (le bandeau, « 125 kg × 3 », « 2 séries au lieu de 4 »).
  // B — SANS ELLE : la carte s'ouvre ; « Alléger 7 jours » écrit le pari de
  //     l'escalier, et la séance même passe en allégée.
  {
    const tK = Date.now();
    let graineK = 100;
    const sessionK = (id, jours) => {
      const debut = ilYa(jours * 86400000, tK).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'U14 — ' + id, debut,
        fin: finDe(debut, tK).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      return debut;
    };
    const serieK = (id, slug, rang, kg, reps, debut) => base.sets.push({ id: id + '-' + slug + '-s' + rang,
      session_id: id, user_id: 'u-banc', exercise_slug: slug, charge_kg: kg, reps, duree_s: null,
      distance_m: null, type_serie: 'travail', rang, groupe_superset: null, validee_a: debut, rpe: null,
      ressenti: null, repos_s: null, note: null, source: 'app', created_at: debut, modifie_a: null });
    const pariK = (id, slug, debut, compteur, kg, reps) => base.predictions.push({
      id: '00000000-0000-5000-8000-' + String(++graineK).padStart(12, '0'),
      user_id: 'u-banc', module: 'moteur.consigne', module_version: 4, emise_a: debut,
      exercise_slug: slug, grandeur: 'reps', horizon_jours: null, valeur_predite: reps,
      borne_basse: 3, borne_haute: 5,
      fondement: { rang: 1, charge: kg, etat: 'progression', zone: 'lourd', reglage: 'normal',
                   palier: kg, niveau: reps, seance: id, role: 'ligne', phase: 'maintien', compteur },
      valeur_observee: reps, observee_a: debut, set_observe: id + '-' + slug + '-s1', created_at: debut });
    // Le couché : six séances à 125 × 5 (4 séries), la première sans pari.
    [30, 25, 20, 15, 10, 5].forEach((j, i) => {
      const id = 'u14-c' + i;
      const debut = sessionK(id, j);
      [1, 2, 3, 4].forEach((r) => serieK(id, 'couche-u14', r, 125, 5, debut));
      if (i > 0) pariK(id, 'couche-u14', debut, i - 1, 125, 5);
    });
    // Le squat (5) et le rowing (4), dans les 7 jours.
    [['u14-sq', 'squat-u14', 2, 5, 140], ['u14-ro', 'rowing-u14', 3, 4, 80]].forEach(([id, slug, j, k, kg]) => {
      const debut = sessionK(id, j);
      [1, 2, 3].forEach((r) => serieK(id, slug, r, kg, 5, debut));
      pariK(id, slug, debut, k, kg, 5);
    });
    // La routine de la démonstration : le rowing seul (aucun déclenchement réel).
    ROUTINES.push({ id: 'r-u14-demo', nom: 'Démo U14', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-u14-d', routine_id: 'r-u14-demo', exercise_slug: 'rowing-u14', rang: 0,
          routine_sets: progr(3, 5), repos_cible_s: 120, groupe_superset: null, note: null }] });
    ROUTINES.push({ id: 'r-u14', nom: 'Allégée U14', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-u14-a', routine_id: 'r-u14', exercise_slug: 'couche-u14', rang: 0,
          routine_sets: progr(4, 5), repos_cible_s: 180, groupe_superset: null, note: null }] });
    const esp = (t) => String(t || '').replace(/[\u00a0\u202f]/g, ' ');
    const MOIS_U14 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const bandeauAttendu = (jourDebut) => {
      const f = new Date(jourDebut.getFullYear(), jourDebut.getMonth(), jourDebut.getDate() + 6);
      return 'Semaine allégée jusqu’au ' + f.getDate() + ' ' + MOIS_U14[f.getMonth()] +
        ' : mêmes charges, moins de séries, loin de l’échec. Rien ne monte.';
    };
    const lireEscalier = () => page.evaluate(() => {
      const z = document.querySelector('#escalier-seance');
      const l = document.querySelector('.legende-exo');
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'couche-u14')[0];
      return {
        visible: !!z && !z.hidden,
        carte: z && z.querySelector('.carte-escalier .ce-phrase') ? z.querySelector('.carte-escalier .ce-phrase').textContent : null,
        bandeau: z && z.querySelector('.bandeau-allegee') ? z.querySelector('.bandeau-allegee').textContent : null,
        jaune: l ? Array.from(l.querySelectorAll('.consigne')).map((n) => n.textContent) : [],
        gris: l && l.querySelector('.consigne-dit') ? l.querySelector('.consigne-dit').textContent : null,
        couvertes: x ? x.lignes.filter((li) => li.role !== 'hors').map((li) => [li.role, li.charge, li.vise]) : null,
        // La consigne NORMALE du jour (entrée du plan) : la ligne, sinon la haute.
        normale: (() => {
          const c = d && d.entrees.consignes['couche-u14'];
          const k = c && c.consigne && (c.consigne.ligne || c.consigne.haut);
          return k ? [k.charge, k.vise] : null;
        })(),
        roles: x ? x.lignes.map((li) => li.role) : null
      };
    });
    const violationsAvant = gardeBanc.violations;
    // L'allégée attendue, lue sur la consigne NORMALE : même charge, 2 reps de
    // moins, sur 2 séries de 4 (le décor laissé par d'autres sections peut
    // changer la charge du jour ; la règle, elle, ne bouge pas).
    const kgFr = (v) => String(v).replace('.', ',');
    const allegee = (x) => (x.normale ? [x.normale[0], Math.max(1, x.normale[1] - 2)] : null);
    // À l'OCTET : le formateur unique (chargeFois) met des insécables autour
    // du « × » aussi (décision du 01/10/2026, #345).
    const jauneAttendu = (x) => (allegee(x) ? kgFr(allegee(x)[0]) + '\u00a0kg\u00a0×\u00a0' + allegee(x)[1] : '?');
    const deuxLignes = (x) => JSON.stringify(x.couvertes) === JSON.stringify([['ligne'].concat(allegee(x)), ['ligne'].concat(allegee(x))]);

    // ── 0. La démonstration de la prévisualisation (`?escalier=demo`, garde
    //     active seulement) : la carte sur une séance QUELCONQUE, deux exercices
    //     témoins, et RIEN n'est écrit : la réponse reste en mémoire.
    const parisAvant = base.predictions.length;
    await aller('/saisie?escalier=demo');
    await demarrerRoutine('Démo U14');
    await attendre(900);
    const d1 = await lireEscalier();
    ok('[U14] 0 — démonstration : la carte, avec les exercices témoins',
      /^Tirée U14, Exercice témoin A, .* autres exercices : aucun n'a progressé depuis 4 séances\.$/.test(esp(d1.carte)),
      JSON.stringify(d1.carte));
    await page.click('#escalier-seance .ce-alleger');
    await attendre(900);
    const d2 = await lireEscalier();
    ok('[U14] 0 — « Alléger 7 jours » : le bandeau, la séance allégée, et AUCUN pari écrit',
      d2.carte === null && /^Semaine allégée jusqu’au /.test(esp(d2.bandeau)) && base.predictions.length === parisAvant &&
      esp(d2.gris) === '2 séries au lieu de 3, cette semaine',
      JSON.stringify({ bandeau: d2.bandeau, gris: d2.gris, paris: base.predictions.length - parisAvant }));
    await abandonner();
    await aller('/saisie?escalier=0');

    // ── A. Acceptée HIER (une autre séance) : aujourd'hui est allégé.
    const hier = new Date(tK - 86400000);
    const jourDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const debutHier = sessionK('u14-hier', 1);
    const finHier = new Date(hier.getFullYear(), hier.getMonth(), hier.getDate() + 6);
    base.predictions.push({ id: '00000000-0000-5000-8000-000000000199', user_id: 'u-banc',
      module: 'escalier', module_version: '1', emise_a: debutHier, exercise_slug: null, grandeur: 'progres',
      horizon_jours: null, valeur_predite: 1, borne_basse: null, borne_haute: null,
      fondement: { seance: 'u14-hier', jour: jourDe(hier), marche: 'semaine_allegee', reponse: 'acceptee',
                   declencheur: 'couche-u14', compteur: 4, cites: ['couche-u14', 'squat-u14', 'rowing-u14'],
                   debut: jourDe(hier), fin: jourDe(finHier), phase: 'maintien' },
      valeur_observee: null, observee_a: null, set_observe: null, created_at: debutHier });
    await aller('/saisie');
    await demarrerRoutine('Allégée U14');
    await attendre(900);
    const a = await lireEscalier();
    ok('[U14] A — acceptée hier : le bandeau en tête de la séance, et pas de carte',
      a.visible && a.carte === null && esp(a.bandeau) === esp(bandeauAttendu(hier)), JSON.stringify(a));
    ok('[U14] A — la consigne allégée : la charge de la consigne normale, 2 reps de moins (« 125 kg × 3 » au décor seul), « 2 séries au lieu de 4, cette semaine »',
      a.jaune.length === 1 && a.jaune[0] === jauneAttendu(a) && esp(a.gris) === '2 séries au lieu de 4, cette semaine',
      JSON.stringify([a.jaune, a.gris, a.normale]));
    // Décision d'Aurélien (01/10/2026, #345) : pendant la période, la séance
    // ne contient QUE les lignes allégées — les 2 séries en trop de la routine
    // ne sont pas laissées à l'écran. « + Série » reste disponible.
    ok('[U14] A — 2 lignes couvertes, à cette charge, aucun test — et seulement elles : les 2 séries en trop sont retirées',
      deuxLignes(a) && JSON.stringify(a.roles) === JSON.stringify(['ligne', 'ligne']) &&
      (await compter('.ligne-serie')) === 2, JSON.stringify(a));
    await plusSerie(0);
    await attendre(600);
    const a2 = await lireEscalier();
    ok('[U14] A — « + Série » reste disponible : une 3ᵉ ligne, hors consigne, et la consigne allégée ne bouge pas',
      (await compter('.ligne-serie')) === 3 && JSON.stringify(a2.roles) === JSON.stringify(['ligne', 'ligne', 'hors']) &&
      deuxLignes(a2), JSON.stringify(a2));
    // PR 4 de la consolidation — UN EXERCICE AJOUTÉ PENDANT LA SEMAINE :
    // ses séries de départ (l'habitude : 3) sont allégées comme à
    // l'ouverture (2), et la série rajoutée au couché reste. Avant, il
    // gardait ses 3 lignes, la dernière « hors plan ».
    await ajouterExoSeance('Tirée U14');
    await attendre(900);
    const a3 = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const de = (slug) => {
        const x = d && d.plan.exercices.filter((e) => e.slug === slug)[0];
        return x ? x.lignes.map((l) => l.role) : null;
      };
      return { couche: de('couche-u14'), tiree: de('rowing-u14'),
        allegee: !!(d && d.plan.exercices.filter((e) => e.slug === 'rowing-u14').map((e) => e.consigne && e.consigne.allegee)[0]) };
    });
    ok('[U14] A — PR 4, DISCRIMINANT : un exercice ajouté pendant la semaine ne garde que ses lignes allégées (2 sur 3), le couché garde sa série rajoutée',
      a3.allegee && JSON.stringify(a3.tiree) === JSON.stringify(['ligne', 'ligne']) &&
      JSON.stringify(a3.couche) === JSON.stringify(['ligne', 'ligne', 'hors']) && (await compter('.ligne-serie')) === 5,
      JSON.stringify(a3));
    await abandonner();
    // PR 4, décision du 02/10/2026 — UN REMPLACEMENT PENDANT LA SEMAINE :
    // le couché (routine de 4, allégé à 2 à l'ouverture) remplacé par la
    // tirée. L'allègement s'applique une fois, sur la routine du couché (4) :
    // 2 lignes couvertes, « 2 séries au lieu de 4 ». Avant, la tirée figeait
    // sa routine aux 2 lignes déjà allégées, et n'en couvrait plus qu'une.
    await aller('/saisie');
    await demarrerRoutine('Allégée U14');
    await attendre(900);
    await menuBloc(0);
    await entree('Remplacer');
    await choisirCatalogue('Tirée U14');
    await attendre(900);
    const a4 = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'rowing-u14')[0];
      const l = document.querySelector('.legende-exo .consigne-dit');
      return { roles: x ? x.lignes.map((li) => li.role) : null, allegee: !!(x && x.consigne && x.consigne.allegee),
        series: x && x.consigne && x.consigne.allegee ? x.consigne.allegee.series : null, gris: l ? l.textContent : null,
        couche: d ? d.plan.exercices.filter((e) => e.slug === 'couche-u14').length : null };
    });
    ok('[U14] A — PR 4, DISCRIMINANT : un remplacement pendant la semaine n’allège qu’une fois (2 lignes couvertes sur la routine de 4 du couché)',
      a4.couche === 0 && a4.allegee && a4.series === 2 && JSON.stringify(a4.roles) === JSON.stringify(['ligne', 'ligne']) &&
      esp(a4.gris) === '2 séries au lieu de 4, cette semaine' && (await compter('.ligne-serie')) === 2,
      JSON.stringify(a4));
    await abandonner();
    base.predictions = base.predictions.filter((l) => l.module !== 'escalier');

    // ── B. Sans semaine en cours : la carte, puis « Alléger 7 jours ».
    await aller('/saisie');
    await demarrerRoutine('Allégée U14');
    await attendre(900);
    const b = await lireEscalier();
    ok('[U14] B — la carte s’ouvre, une seule, en tête de la séance (le déclencheur, puis par compteur)',
      esp(b.carte) === 'Allongé U14 (Barre), Fléchi U14 (Barre) et Tirée U14 : aucun n\'a progressé depuis 4 séances.' &&
      (await compter('.carte-escalier')) === 1, JSON.stringify(b));
    ok('[U14] B — avant la réponse, la séance est normale (un test est prévu sur la dernière série)',
      JSON.stringify(b.roles) === JSON.stringify(['ligne', 'ligne', 'ligne', 'test']), JSON.stringify(b.roles));
    await page.click('#escalier-seance .ce-alleger');
    await attendre(1500);
    const c = await lireEscalier();
    const aujourdhui = new Date();
    ok('[U14] B — « Alléger 7 jours » : le bandeau remplace la carte',
      c.carte === null && esp(c.bandeau) === esp(bandeauAttendu(aujourdhui)), JSON.stringify(c));
    ok('[U14] B — la séance même passe en allégée : la charge normale, 2 reps de moins, sur 2 séries, aucun test',
      deuxLignes(c) && c.jaune[0] === jauneAttendu(c), JSON.stringify(c));
    ok('[U14] B — à l’acceptation, les 2 séries en trop (non validées) sont retirées : 2 lignes à l’écran',
      JSON.stringify(c.roles) === JSON.stringify(['ligne', 'ligne']) && (await compter('.ligne-serie')) === 2,
      JSON.stringify(c.roles));
    const pari = base.predictions.filter((l) => l.module === 'escalier')[0];
    ok('[U14] B — le pari de la semaine allégée est en base : module escalier, acceptée, J à J+6, sans exercice',
      !!pari && pari.exercise_slug === null && pari.fondement.reponse === 'acceptee' &&
      pari.fondement.debut === jourDe(aujourdhui) && pari.fondement.declencheur === 'couche-u14' &&
      pari.fondement.marche === 'semaine_allegee' && pari.valeur_observee === null,
      JSON.stringify(pari && pari.fondement));
    ok('[U14] B — son identifiant n’est pas celui d’un pari de consigne (espace de noms à part)',
      !!pari && !base.predictions.some((l) => l !== pari && l.id === pari.id), pari && pari.id);
    await abandonner();

    ok('[U14] la garde (C6) n’a rien signalé dans cette section (I19, I20 compris)', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-2)));
    // PR 8 de la consolidation — LA SECTION RETIRE CE QU'ELLE A POSÉ. B laisse
    // une semaine allégée ACCEPTÉE aujourd'hui : toute séance du jour jouée
    // ensuite était allégée. En séquentiel, le rejeu (7 G quaterdecies) ne
    // trouvait plus que 11 de ses 17 lignes, et le banc s'arrêtait.
    // ⚠️ EN BASE ET SUR L'APPAREIL. Le pari a été posé PAR L'APPAREIL : il vit
    // aussi dans son magasin `predictions` (un pari ne s'efface jamais en
    // base, l'app n'a aucune raison de l'oublier). Le retirer de la base seule
    // ne suffisait pas. Le rechargement relit le magasin.
    const semaineAllegee = (l) => l && l.module === 'escalier' && l.fondement && l.fondement.marche === 'semaine_allegee';
    const parisU14 = base.predictions.filter(semaineAllegee).map((l) => l.id);
    base.predictions = base.predictions.filter((l) => !semaineAllegee(l));
    await page.evaluate((ids) => window.THCache.supprimer('predictions', ids), parisU14);
    await aller('/saisie');
    const restes = await page.evaluate(() => window.THCache.lireTout('predictions')
      .then((l) => l.filter((x) => x && x.module === 'escalier' && x.fondement && x.fondement.marche === 'semaine_allegee').length));
    ok('[U14] la section ne laisse aucune semaine allégée derrière elle (base et appareil)',
      parisU14.length === 1 && restes === 0 && !base.predictions.some(semaineAllegee), JSON.stringify([parisU14.length, restes]));
    ok('[U14] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G quaterdecies. L’OUTIL DE REJEU (développement, diagnostic du 01/10/2026) ══');
  //
  // LE DÉCOR ÉQUIVALENT de la séance réelle du 01/10 (« Jeudi — Haut B ») :
  //   · un militaire en Mix (corrigé APRÈS sa dernière séance), au rythme de
  //     4 jours, repris 14 jours après → la reprise courte ;
  //   · un couché aux haltères dont la dernière séance commence par une
  //     montée (88, 92, 92), routine de 4 séries → « rejoint » ;
  //   · un tirage visage à la poulie : 24,8 kg × 20 trois fois, un 27 essayé,
  //     et un vieux 25 (l'hypothèse à vérifier sur les vraies données) ;
  //   · un curl à la barre EZ avec sa dégressive.
  // La séance est JOUÉE DANS L'APP (les paris enregistrent ce que l'écran
  // affichait), terminée, puis rouverte par `?rejouer=<id>`. Chaque ligne
  // validée confronte le pari en base à la ligne que le rejeu affichait juste
  // avant : un écart serait un rejeu infidèle.
  {
    const tR = Date.now();
    const sessionR = (id, jours) => {
      const debut = ilYa(jours * 86400000, tR).toISOString();
      base.sessions.push({ id, user_id: 'u-banc', titre: 'RJ — ' + id, debut,
        fin: finDe(debut, tR).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      return debut;
    };
    const seriesR = (id, slug, lignes, debut) => lignes.forEach(([kg, reps, type], k) => base.sets.push({
      id: id + '-' + slug + '-s' + (k + 1), session_id: id, user_id: 'u-banc', exercise_slug: slug,
      charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: type || 'travail', rang: k + 1,
      groupe_superset: null, validee_a: debut, rpe: null, ressenti: null, repos_s: null, note: null,
      source: 'app', created_at: debut, modifie_a: null }));
    // 49-U18 — le militaire comme dans la base (lu par Claude.ai) : deux fois
    // par semaine l'automne d'avant, une fois par semaine depuis, la dernière
    // il y a 14 jours. Sur TOUT l'historique, l'écart habituel tombe sous 4,7
    // jours (une reprise) ; sur les 8 derniers, il vaut 7 (pas de reprise).
    const militaire = [];
    for (let j = 150; j > 70; j -= (j % 2 ? 3 : 4)) militaire.push(['militaire-rj', j, [[45, 10], [45, 10], [45, 10]]]);
    [70, 63, 56, 49, 42, 35, 28, 21].forEach((j) =>
      militaire.push(['militaire-rj', j, [[50, 10], [50, 10], [50, 10], [52.5, 8]]]));
    const historique = militaire.concat([
      ['militaire-rj', 14, [[52.5, 10], [52.5, 10], [52.5, 10], [55, 8]]],
      ['couche-rj', 14, [[88, 10], [88, 10], [88, 10]]],
      ['couche-rj', 11, [[88, 10], [88, 10], [88, 11]]],
      ['couche-rj', 8, [[88, 11], [88, 11], [92, 11]]],
      ['couche-rj', 5, [[88, 10], [92, 11], [92, 11]]],
      // Le 25 kg du 30/04/2024 : une autre machine, 17 mois avant.
      ['visage-rj', 520, [[25, 15], [25, 15], [25, 15]]],
      ['visage-rj', 40, [[22.5, 20], [22.5, 20], [22.5, 20]]],
      ['visage-rj', 33, [[22.5, 20], [22.5, 20], [27, 12]]],
      ['visage-rj', 26, [[24.8, 20], [24.8, 20], [24.8, 20]]],
      ['visage-rj', 19, [[24.8, 20], [24.8, 20], [24.8, 20]]],
      ['visage-rj', 12, [[24.8, 20], [24.8, 20], [24.8, 20]]],
      ['curlez-rj', 21, [[20, 10], [20, 10], [20, 10]]],
      ['curlez-rj', 14, [[20, 10], [20, 10], [20, 10]]],
      // La fois d'avant porte une dégressive à 15 kg : à la barre, elle ne
      // doit pas revenir pré-remplie (49-U18).
      ['curlez-rj', 7, [[20, 10], [20, 10], [20, 10], [15, 10, 'degressive']]]
    ]);
    historique.forEach(([slug, j, lignes], k) => {
      const id = 'rj-h' + k;
      seriesR(id, slug, lignes, sessionR(id, j));
    });
    // La zone du militaire, corrigée en Mix APRÈS sa dernière séance.
    base.zones.push({ id: 'rj-zone-1', user_id: 'u-banc', exercise_slug: 'militaire-rj', zone: 'mix',
      corrigee_a: ilYa(10 * 86400000, tR).toISOString() });
    const ligneR = (type, reps) => ({ id: 'pr' + (++grainePr), rang: 0, type_serie: type, reps_visees: reps,
      charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
    const lignesR = (l) => l.map((x, k) => Object.assign(x, { rang: k + 1 }));
    ROUTINES.push({ id: 'r-rj', nom: 'Jeudi RJ', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        ['militaire-rj', lignesR([ligneR('echauffement', 10), ligneR('echauffement', 2)].concat(progr(4, null)))],
        ['couche-rj', progr(4, null)],
        ['visage-rj', progr(3, null)],
        ['curlez-rj', lignesR(progr(3, null).concat([ligneR('degressive', null)]))]
      ].map(([slug, sets], k) => ({ id: 'r-rj-' + k, routine_id: 'r-rj', exercise_slug: slug, rang: k,
        routine_sets: sets, repos_cible_s: 90, groupe_superset: null, note: null })) });
    if (base.profiles && base.profiles[0]) base.profiles[0].phase = 'maintien';
    const violationsAvant = gardeBanc.violations;

    // ── La séance, jouée comme le 01/10 ──
    await aller('/saisie');
    await demarrerRoutine('Jeudi RJ');
    await attendre(1200);
    const idRJ = enCoursId();
    const validerTel = async (i) => {
      const l = (await page.$$('.ligne-serie'))[i];
      await l.$eval('.ok-serie', (b) => b.click());
      await attendre(450);
    };
    // Militaire : une chauffe à 40 × 6 (la seconde laissée), puis le travail.
    await saisirSerie(0, 40, 6);
    for (const [i, kg, r] of [[2, 52.5, 10], [3, 52.5, 10], [4, 52.5, 10], [5, 52.5, 9]]) await saisirSerie(i, kg, r);
    // Couché : la 1re ligne validée TELLE QUELLE (son pré-remplissage), puis 92.
    await validerTel(6);
    for (const [i, kg, r] of [[7, 92, 10], [8, 92, 9], [9, 92, 9]]) await saisirSerie(i, kg, r);
    // Tirage visage : 24,8 × 20 deux fois, puis la ligne de test telle quelle.
    for (const [i, kg, r] of [[10, 24.8, 20], [11, 24.8, 20]]) await saisirSerie(i, kg, r);
    await validerTel(12);
    // Curl EZ : trois séries, puis la dégressive à 15 × 10.
    for (const [i, kg, r] of [[13, 20, 10], [14, 20, 10], [15, 20, 10], [16, 15, 10]]) await saisirSerie(i, kg, r);
    const enBaseRJ = () => base.sets.filter((x) => x.session_id === idRJ).length;
    await terminer();
    await attendre(1500);
    ok('[RJ] le décor : la séance jouée est terminée en base, ses séries et ses paris montés',
      !!idRJ && (base.sessions.filter((x) => x.id === idRJ)[0] || {}).statut === 'terminee' && enBaseRJ() >= 15 &&
      base.predictions.filter((l) => l.fondement && l.fondement.seance === idRJ).length >= 10,
      JSON.stringify({ idRJ, series: enBaseRJ(), paris: base.predictions.filter((l) => l.fondement && l.fondement.seance === idRJ).length }));

    // ── Le rejeu : AUCUNE écriture ──
    const ecritures = [];
    const surRequete = (req) => {
      if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.method() !== 'OPTIONS' && /\/rest\/v1\//.test(req.url())) {
        ecritures.push(req.method() + ' ' + req.url().replace(/^.*\/rest\/v1\//, ''));
      }
    };
    const avant = { journal: base.journal.length, patchs: base.patchs.length, paris: base.predictions.length,
                    sets: base.sets.length, sessions: base.sessions.length, zones: base.zones.length };
    const local = () => page.evaluate(async () => {
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
      const brouillon = {};
      for (const k of ['seance', 'consignes']) {
        try { brouillon[k] = JSON.stringify(await window.THCache.lireBrouillon(k)); } catch (e) { brouillon[k] = 'illisible'; }
      }
      let attente = null;
      try { attente = JSON.stringify(await window.THCache.lireAttente()); } catch (e) { attente = 'illisible'; }
      return { ls, brouillon, attente };
    });
    await aller('/saisie');
    const localAvant = await local();
    page.on('request', surRequete);
    await aller('/saisie?rejouer=' + idRJ);
    await jusqua(() => page.evaluate(() => {
      const v = document.getElementById('rejeu');
      return !!v && !v.hidden && /═══ Rejeu/.test(document.getElementById('rejeu-sortie').textContent);
    }), 15000);
    const lireRejeu = () => page.evaluate(() => ({
      visible: !document.getElementById('rejeu').hidden,
      texte: document.getElementById('rejeu-sortie').textContent
    }));
    const r1 = await lireRejeu();
    const t1 = r1.texte;
    console.log('   ── sortie du rejeu (décor) ──\n' + t1.split('\n').map((l) => '   │ ' + l).join('\n'));
    const nValidees = base.sets.filter((x) => x.session_id === idRJ && x.validee_a).length;
    const nEtapes = (t1.match(/^── Étape \d+/gm) || []).length;
    ok('[RJ] la vue s’ouvre et rejoue l’ouverture puis chaque série validée, dans l’ordre réel',
      r1.visible && t1.indexOf('═══ Rejeu de la séance ' + idRJ) === 0 && /── Étape 0 — à l’ouverture/.test(t1) &&
      nEtapes === nValidees + 1, JSON.stringify({ nEtapes, nValidees }));
    ok('[RJ] chaque exercice y est, avec sa consigne, ses lignes et ses phrases',
      ['Rejeu Un', 'Rejeu Deux', 'Rejeu Trois', 'Rejeu Quatre'].every((n) => t1.indexOf('▸ ' + n) >= 0) &&
      /consigne rejoint/.test(t1) &&
      /en-tête \(jaune\)/.test(t1) && /pré-rempli/.test(t1) && /invariants : /.test(t1), '');
    const controles = t1.split('\n').filter((l) => /contrôle /.test(l));
    const ecarts = controles.filter((l) => /✗/.test(l));
    ok('[RJ] le rejeu est fidèle : chaque pari en base dit la ligne que le rejeu affichait juste avant',
      controles.length >= 10 && ecarts.length === 0, JSON.stringify({ controles: controles.length, ecarts: ecarts.slice(0, 4) }));
    // Le décor ne viole aucun invariant pendant la séance jouée (la garde du
    // banc le vérifie plus bas) : le rejeu n'en invente pas.
    ok('[RJ] le rejeu n’invente aucune violation : « aucune violation » à chaque étape',
      (t1.match(/^invariants : aucune violation$/gm) || []).length === nEtapes,
      JSON.stringify(t1.split('\n').filter((l) => /^invariants : /.test(l) && !/aucune/.test(l)).slice(0, 3)));
    ok('[RJ] une ligne de routine jamais validée est reconstruite (la 2e chauffe du militaire)',
      /reconstruites vides[^\n]*Rejeu Un \(Barre\) × 1/.test(t1), '');
    // ── 49-U18 — la séance du 01/10, rejouée avec les correctifs ──
    const ouverture = t1.split('── Étape 1 ')[0];
    const bloc = (nom) => (ouverture.split('▸ ' + nom)[1] || '').split('\n▸ ')[0];
    const mil = bloc('Rejeu Un (Barre)'), cou = bloc('Rejeu Deux (Haltères)');
    const vis = bloc('Rejeu Trois (Poulie)'), cur = bloc('Rejeu Quatre (Barre EZ)');
    const visees = (b) => (b.match(/plan [0-9,–]+ × (\d+)/g) || []).map((x) => Number(x.split(' × ')[1]));
    ok('[RJ] 49-U18 — le militaire n’est plus en reprise, et ne vise rien au-dessus de 8 (Mix 6-8)',
      !/consigne reprise/.test(mil) && /zone mix/.test(mil) && visees(mil).length >= 4 && visees(mil).every((v) => v <= 8),
      JSON.stringify({ tete: mil.split('\n')[0], visees: visees(mil) }));
    ok('[RJ] 49-U18 — le couché n’a plus de ligne à 88 : sa 1re ligne prend la charge du coach',
      /#1 · travail · ligne · rang 1 · plan 92 × 11/.test(cou) && !/88 × 10/.test(cou) && !/travail · hors plan/.test(cou),
      cou.split('\n').filter((l) => /#\d/.test(l)).join(' | '));
    ok('[RJ] 49-U18 — le tirage visage teste à 27 (le 25 d’il y a 17 mois ne compte plus)',
      /haut 27 × /.test(vis) && /plan 27 × /.test(vis), vis.split('\n')[0]);
    ok('[RJ] 49-U18 — la dégressive du curl EZ reste vide (malgré les 15 kg de la fois d’avant)',
      /#4 · degressive · hors plan · dégressive – « Pas de dégressive à la barre\. » · à faire · pré-rempli – × /.test(cur),
      cur.split('\n').filter((l) => /degressive/.test(l)).join(' | '));
    // 49-U18 bis (02/10/2026) — la phrase des chauffes disparaît dès qu'une
    // chauffe est validée (le militaire : 40 × 6 à l'étape 1).
    const etape1 = (t1.split('── Étape 1 ')[1] || '').split('── Étape 2 ')[0];
    ok('[RJ] 49-U18 bis — la phrase des chauffes du militaire disparaît après la chauffe à 40 × 6',
      /chauffes : « Chauffes calées sur 52,5.kg.: 20 · 45.kg\. »/.test(mil) &&
      /chauffes : \(sans phrase\)/.test(etape1) && !/Chauffes calées/.test(etape1),
      (etape1.split('\n').filter((l) => /chauffes/.test(l))[0] || ''));
    ok('[RJ] 49-U18 bis — le couché : « Ta première série à 88 kg passe à 92 kg. » (une montée)',
      /en-tête \(gris\) : « Ta première série à 88.kg passe à 92.kg\. »/.test(cou),
      (cou.split('\n').filter((l) => /gris/.test(l))[0] || ''));
    ok('[RJ] 49-U18 — aucune phrase ne dit « null » (l’en-tête du couché disait « le cran au-dessus × null »)',
      !/null/.test(t1), (t1.split('\n').filter((l) => /null/.test(l))[0] || ''));
    ok('[RJ] ce qui n’est pas reconstruit exactement est dit', /Ce qui n’est pas reconstruit exactement :/.test(t1) &&
      /jamais validée/.test(t1), '');

    // ── Deux fois de suite, la même sortie ──
    await page.click('#rejeu-relancer');
    await attendre(2500);
    const t2 = (await lireRejeu()).texte;
    ok('[RJ] « Rejouer » rend la même sortie, à l’octet', t2 === t1 && t1.length > 500, t2.length + ' / ' + t1.length);
    // Les plans du rejeu ne passent pas par la garde de l'app : elle ne vérifie
    // que les plans de la séance en cours (il n'y en a pas ici).
    ok('[RJ] la garde de l’app n’a vu aucun plan du rejeu (ni `Plan.dernier`)',
      await page.evaluate(() => window.THPlan.garde.etat().plans === 0 && window.THPlan.dernier === null), '');
    ok('[RJ] « Copier » est là', await page.evaluate(() => !!document.getElementById('rejeu-copier')), '');

    // ── Rien n'est parti, rien n'a été écrit ──
    page.off('request', surRequete);
    const localApres = await local();
    const apres = { journal: base.journal.length, patchs: base.patchs.length, paris: base.predictions.length,
                    sets: base.sets.length, sessions: base.sessions.length, zones: base.zones.length };
    ok('[RJ] aucune écriture vers la base pendant le rejeu (ni séance, ni série, ni pari, ni zone)',
      ecritures.length === 0 && JSON.stringify(avant) === JSON.stringify(apres),
      JSON.stringify({ ecritures: ecritures.slice(0, 4), avant, apres }));
    ok('[RJ] rien dans la file, ni dans le brouillon de séance, ni dans le stockage local',
      localApres.attente === localAvant.attente && JSON.stringify(localApres.brouillon) === JSON.stringify(localAvant.brouillon) &&
      JSON.stringify(localApres.ls) === JSON.stringify(localAvant.ls),
      JSON.stringify({ avant: localAvant.brouillon, apres: localApres.brouillon }));
    ok('[RJ] la vue n’ouvre pas de séance', !base.sessions.some((x) => x.statut === 'en_cours') &&
      await page.evaluate(() => document.getElementById('vue-seance').hidden), '');

    // ── En production (garde éteinte), rien ──
    await aller('/saisie?garde=0&rejouer=' + idRJ);
    await attendre(2500);
    const prod = await page.evaluate(() => ({ cache: document.getElementById('rejeu').hidden,
      texte: document.getElementById('rejeu-sortie').textContent }));
    ok('[RJ] garde éteinte (la production) : l’outil ne s’ouvre pas', prod.cache && prod.texte === '', JSON.stringify(prod));
    await page.evaluate(() => localStorage.removeItem('th-v2-garde'));
    await aller('/saisie');
    ok('[RJ] la garde du banc n’a rien signalé pendant la séance du décor', gardeBanc.violations === violationsAvant,
      JSON.stringify(gardeBanc.liste.slice(-3)));
    ok('[RJ] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G quindecies. TOUS LES ÉCRANS, MÊMES DONNÉES (PR 5 de la consolidation) ══');
  //
  // UN HISTORIQUE, PLUSIEURS ÉCRANS : chaque notion affichée hors de l'en-tête
  // est comparée à SA source (le registre `NOTIONS`).
  //   · dernière séance → la meilleure série du jour : la page d'exercice,
  //     Progression et la carte de la séance disent le même chiffre ;
  //   · record de charge → la ligne la plus lourde de la table par reps ;
  //   · zone → l'étiquette de la séance est celle de la page ; sans séance,
  //     le menu des zones porte la zone déduite ;
  //   · cible → la ligne mise en avant dans la table est la visée de l'en-tête.
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE :
  //   · la dernière séance : 100 × 10, 100 × 10, 105 × 8 → palier 100 × 10,
  //     meilleure série 105 × 8 (la page affichait le palier) ;
  //   · une séance avec une exploration à 130 × 1 → le record de charge est
  //     130 × 1, la ligne « 1 rep » de la table (la fiche l'écartait) ;
  //   · la visée de l'en-tête n'est pas 10, les reps du palier qu'elle
  //     mettait en avant.
  {
    const tE = Date.now();
    const poserE = (id, debut, lignes) => {
      base.sessions.push({ id, user_id: 'u-banc', titre: 'Écrans — ' + id, debut,
        fin: finDe(debut, tE).toISOString(), statut: 'terminee', note: null,
        salle: null, salle_norme: null, routine_id: null, source: 'app', created_at: debut });
      lignes.forEach(([kg, reps], k) => base.sets.push({ id: id + '-s' + (k + 1), session_id: id, user_id: 'u-banc',
        exercise_slug: 'ecrans-u5', charge_kg: kg, reps, duree_s: null, distance_m: null, type_serie: 'travail',
        rang: k + 1, groupe_superset: null, validee_a: debut, rpe: null, ressenti: null, repos_s: null, note: null,
        source: 'app', created_at: debut, modifie_a: null }));
    };
    poserE('ecr-1', ilYa(21 * 86400000, tE).toISOString(), [[90, 12], [90, 12], [90, 12]]);
    poserE('ecr-2', ilYa(14 * 86400000, tE).toISOString(), [[95, 11], [95, 11], [95, 11]]);
    poserE('ecr-3', ilYa(7 * 86400000, tE).toISOString(), [[100, 10], [100, 10], [100, 10], [130, 1]]);
    // La plus récente de toutes : Progression la montre en tête.
    poserE('ecr-4', new Date(tE - 1000).toISOString(), [[100, 10], [100, 10], [105, 8]]);
    ROUTINES.push({ id: 'r-ecr', nom: 'Écrans U5', note: null, archivee_a: null,
      created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z',
      routine_exercises: [
        { id: 'r-ecr-a', routine_id: 'r-ecr', exercise_slug: 'ecrans-u5', rang: 0,
          routine_sets: progr(3), repos_cible_s: 120, groupe_superset: null, note: null }] });
    const sp = (t) => String(t || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
    // « 105 kg × 8 », « 105× 8 » : la charge et les reps, quel que soit l'écran.
    const ck = (t) => { const m = /(\d+(?:,\d+)?)\D+?(\d+)\s*$/.exec(sp(t)); return m ? m[1] + '×' + m[2] : null; };
    const fiche = () => page.evaluate(() => Array.from(document.querySelectorAll('#page-exercice .exo-li'))
      .map((l) => [(l.querySelector('.exo-li-k') || {}).firstChild ? l.querySelector('.exo-li-k').firstChild.textContent : '',
        (l.querySelector('.exo-li-v') || {}).textContent || '']));
    const ligneFicheE = async (motif) => ((await fiche()).filter((l) => motif.test(l[0]))[0] || [null, null])[1];
    const tableE = () => page.evaluate(() => Array.from(document.querySelectorAll('#page-exercice .tr-ligne')).map((l) => ({
      reps: parseInt((l.querySelector('.tr-reps') || {}).textContent, 10),
      charge: (l.querySelector('.tr-charge') || {}).textContent, cible: l.classList.contains('cible'),
      deduit: l.classList.contains('deduit') })));
    const puceE = () => page.evaluate(() => (document.querySelector('#page-exercice .puce-zone') || {}).textContent || null);

    // ── A. SANS SÉANCE : la page, Progression, la carte de la séance.
    await aller('/exercice/ecrans-u5');
    await attendre(700);
    const derniereA = await ligneFicheE(/Dernière séance/);
    const recordA = await ligneFicheE(/Record/);
    const tA = await tableE();
    const plusLourde = tA.filter((l) => !l.deduit).reduce((a, l) => {
      const c = parseFloat(String(l.charge).replace(',', '.'));
      return !a || c > a.c || (c === a.c && l.reps > a.reps) ? { c, reps: l.reps } : a;
    }, null);
    ok('[E] DISCRIMINANT — « Dernière séance » : la meilleure série du jour, 105 kg × 8 (pas le palier 100 × 10)',
      ck(derniereA) === '105×8', JSON.stringify(derniereA));
    ok('[E] DISCRIMINANT — « Record de charge » : la ligne la plus lourde de la table, 130 kg × 1 (l’exploration comprise)',
      ck(recordA) === '130×1' && plusLourde && plusLourde.c === 130 && plusLourde.reps === 1,
      JSON.stringify([recordA, plusLourde]));
    await aller('/progression');
    await attendre(700);
    const prog = await page.evaluate(() => Array.from(document.querySelectorAll('.bloc-exo'))
      .filter((l) => /Écrans U5/.test(l.textContent)).map((l) => (l.querySelector('.bloc-exo-val') || {}).textContent)[0] || null);
    ok('[E] Progression dit le même chiffre que la page', ck(prog) !== null && ck(prog) === ck(derniereA),
      JSON.stringify([prog, derniereA]));
    await aller('/');
    await attendre(700);
    const carte = await page.evaluate(() => Array.from(document.querySelectorAll('.apercu-exo'))
      .filter((l) => /Écrans U5/.test(l.textContent)).map((l) => (l.querySelector('.apercu-val') || {}).textContent)[0] || null);
    ok('[E] la carte de la séance aussi', ck(carte) !== null && ck(carte) === ck(derniereA), JSON.stringify([carte, derniereA]));
    // Le menu des zones, ouvert depuis la page SANS séance : la zone déduite
    // et sa raison (le menu la lisait sur la consigne de la séance, absente).
    await aller('/exercice/ecrans-u5');
    await attendre(700);
    const puceSans = await puceE();
    await page.click('#page-exercice .puce-zone');
    await attendre(700);
    const menuSans = await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .option-zone'))
      .map((b) => ({ cle: b.dataset.cle, actif: b.classList.contains('active'), sous: (b.querySelector('.oz-sous') || {}).textContent || null })));
    ok('[E] DISCRIMINANT — sans séance, le menu des zones porte la zone déduite et sa raison, celle de l’étiquette',
      menuSans.filter((o) => o.actif && o.sous).length === 1 && !!puceSans,
      JSON.stringify([puceSans, menuSans.filter((o) => o.actif)]));
    await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
      .filter((b) => /Fermer/.test(b.textContent))[0].click());
    await attendre(500);

    // ── B. AVEC LA SÉANCE OUVERTE : l'étiquette et la visée de l'en-tête.
    await aller('/saisie');
    await demarrerRoutine('Écrans U5');
    await attendre(900);
    const enSeance = await page.evaluate(() => {
      const d = window.THPlan && window.THPlan.dernier;
      const x = d && d.plan.exercices.filter((e) => e.slug === 'ecrans-u5')[0];
      const k = x && x.consigne;
      return { puce: (document.querySelector('.legende-exo .puce-zone') || {}).textContent || null,
        vise: k ? (k.ligne || k.haut || {}).vise : null };
    });
    await aller('/exercice/ecrans-u5');
    await attendre(700);
    const puceAvec = await puceE();
    const tB = await tableE();
    const cible = tB.filter((l) => l.cible).map((l) => l.reps);
    ok('[E] l’étiquette de la page est celle de la séance ouverte (une seule consigne)',
      !!enSeance.puce && sp(puceAvec) === sp(enSeance.puce) && sp(puceSans) === sp(enSeance.puce),
      JSON.stringify([enSeance.puce, puceAvec, puceSans]));
    ok('[E] DISCRIMINANT — la ligne mise en avant est la visée de l’en-tête (pas les 10 reps du palier)',
      typeof enSeance.vise === 'number' && enSeance.vise !== 10 &&
      JSON.stringify(cible) === JSON.stringify(tB.some((l) => l.reps === enSeance.vise) ? [enSeance.vise] : []) &&
      tB.some((l) => l.reps === enSeance.vise),
      JSON.stringify({ vise: enSeance.vise, cible, reps: tB.map((l) => l.reps) }));
    // ⚠️ LA SÉANCE OUVERTE FAIT FOI, MÊME APRÈS UNE SYNCHRONISATION. Cinq
    // séances à 20 reps (l'habitude passe à 20, Séries longues) arrivent d'un autre appareil pendant la séance : la
    // consigne de la séance est figée (MOTEUR §9.13 bis), et la page la lit.
    // Une page qui recalculerait la sienne passerait à une autre zone que
    // l'en-tête, à la même seconde.
    [2, 3, 4, 5, 6].forEach((j) => poserE('ecr-sync-' + j, ilYa(j * 86400000, tE).toISOString(), [[60, 20], [60, 20], [60, 20]]));
    await aller('/');
    await attendre(500);
    await page.evaluate(() => document.getElementById('btn-rafraichir').click());
    await attendre(2500);
    await aller('/exercice/ecrans-u5');
    await attendre(700);
    const puceApresSync = await puceE();
    const neuve = await page.evaluate(() => {
      const t = (window.THPlan && window.THPlan.dernier) || null;
      return t ? t.entrees.seance.id : null;
    });
    ok('[E] DISCRIMINANT — après une synchronisation en pleine séance, l’étiquette de la page reste celle de la séance',
      sp(puceApresSync) === sp(enSeance.puce), JSON.stringify([enSeance.puce, puceApresSync, neuve]));
    await aller('/saisie');
    await abandonner();
    // Sans séance, la page lit l'historique à jour : la zone suit les cinq
    // séances arrivées (la prémisse du contrôle précédent).
    await aller('/exercice/ecrans-u5');
    await attendre(700);
    const puceSansApres = await puceE();
    ok('[E] prémisse — sans séance, les séances arrivées changent la zone (sinon le contrôle d’avant ne prouve rien)',
      !!puceSansApres && sp(puceSansApres) !== sp(enSeance.puce), JSON.stringify([enSeance.puce, puceSansApres]));

    // ── C. LES COMPTES (PR 6) : une séance IMPORTÉE (rien de validé dans
    //    l'app) — 3 séries de travail d'Écrans U5 et une chauffe, deux
    //    chauffes de Chauffé U6 (rien d'autre), une série de Rameur U6.
    //    La règle unique : 3 séries de travail, 2 exercices faits.
    const debutCpt = ilYa(500, Date.now()).toISOString();
    const ID_CPT = '50000000-0000-4000-8000-000000000601';
    base.sessions.push({ id: ID_CPT, user_id: 'u-banc', titre: 'Écrans — comptes', debut: debutCpt,
      fin: finDe(debutCpt, Date.now()).toISOString(), statut: 'terminee', note: null,
      salle: null, salle_norme: null, routine_id: null, source: 'hevy', created_at: debutCpt });
    [['ecrans-u5', 'echauffement', 40, 10], ['ecrans-u5', 'travail', 100, 10], ['ecrans-u5', 'travail', 100, 10], ['ecrans-u5', 'travail', 100, 9],
      ['chauffes-u6', 'echauffement', 20, 10], ['chauffes-u6', 'echauffement', 30, 8], ['cardio-u6', 'travail', null, null]]
      .forEach(([slug, type, kg, reps], k) => base.sets.push({ id: '50000000-0000-4000-8000-0000000006' + String(10 + k), session_id: ID_CPT, user_id: 'u-banc',
        exercise_slug: slug, charge_kg: kg, reps, duree_s: slug === 'cardio-u6' ? 900 : null, distance_m: null, type_serie: type,
        rang: k + 1, groupe_superset: null, validee_a: null, rpe: null, ressenti: null, repos_s: null, note: null,
        source: 'hevy', created_at: debutCpt, modifie_a: null }));
    await aller('/');
    await page.evaluate(() => document.getElementById('btn-rafraichir').click());
    await attendre(2500);
    const carteCpt = await page.evaluate(() => Array.from(document.querySelectorAll('button.seance'))
      .filter((c) => /Écrans — comptes/.test(c.textContent)).map((c) => (c.querySelector('.seance-meta') || {}).textContent).filter(Boolean)[0] || null);
    ok('[E] PR 6 — DISCRIMINANT : la carte dit « 2 exercices · 3 séries de travail » (le cardio n’entre pas dans les séries, les chauffes seules ne font pas un exercice)',
      sp(carteCpt) === '2 exercices · 3 séries de travail', JSON.stringify(carteCpt));
    await aller('/seance/' + ID_CPT);
    const resumes = await page.evaluate(() => Array.from(document.querySelectorAll('.resume')).map((r) => r.textContent));
    const sommeDeTravail = resumes.filter((r) => / de travail$/.test(r)).reduce((t, r) => t + parseInt(r.replace(/^Superset · /, ''), 10), 0);
    ok('[E] PR 6 — DISCRIMINANT : le détail dit « 1 série » au rameur, et la somme des blocs « de travail » égale la carte',
      JSON.stringify(resumes) === JSON.stringify(['3 séries de travail', '0 série de travail', '1 série']) && sommeDeTravail === 3,
      JSON.stringify(resumes));
    await page.evaluate(() => Array.from(document.querySelectorAll('.detail-gestes button'))
      .filter((b) => /^Modifier$/.test(b.textContent))[0].click());
    await attendre(1500);
    const bandeauCpt = await texte('#bandeau-seance');
    ok('[E] PR 6 — DISCRIMINANT : rouverte en modification, le bandeau dit « 3 séries de travail » (avant : 0, rien n’était validé dans l’app)',
      /(^|\D)3 séries de travail/.test(sp(bandeauCpt)), sp(bandeauCpt).slice(0, 90));
    await page.click('#bandeau-seance .bandeau-fin').catch(() => {});
    await attendre(2600);
    // Le profil : les séries de travail, sur la même règle, contre ce que la
    // base porte (la règle rejouée ici).
    const sansMuscle = new Set(CATALOGUE.filter((e) => !(e.muscles_primaires || []).length).map((e) => e.slug));
    const attendu = base.sets.filter((x) => (x.type_serie || 'travail') === 'travail' && !sansMuscle.has(x.exercise_slug)).length;
    await aller('/profil');
    const kpis = await page.evaluate(() => Array.from(document.querySelectorAll('#profil-corps .p-kpi')).map((k) => k.textContent));
    const nKpi = parseInt(String(kpis[1] || '').replace(/[^\d]/g, ''), 10);
    ok('[E] PR 6 — DISCRIMINANT : le profil compte les séries de travail (pas toutes les lignes)',
      nKpi === attendu && attendu < base.sets.length, JSON.stringify({ kpi: kpis[1], attendu, lignes: base.sets.length }));
    ok('[E] aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs.slice(0, 2)));
  }

  console.log('\n══ 7 G bis. LA GARDE DU BANC — LE COMPTE ══');
  // Le compte vit dans `garde-compte.js` : le lanceur parallèle refait les
  // mêmes contrôles sur le compte fusionné de ses groupes.
  {
    const compte = compteDeLaGarde(gardeBanc);
    compte.controles.forEach((c) => ok(c.nom, c.ok, c.detail));
    compte.lignes.forEach((l) => console.log(l));
  }

  console.log('\n══ 8. NON-RÉGRESSION ══');
  for (const [chemin, attendu] of [['/', 'vue-liste'], ['/progression', 'vue-progression'],
                                   ['/profil', 'vue-profil'], ['/routine/nouvelle', 'vue-routine']]) {
    await aller(chemin);
    ok('l’onglet ' + chemin + ' s’ouvre', (await visible())[0] === attendu, JSON.stringify(await visible()));
  }
  base.reseau = false;
  await aller('/');
  ok('hors ligne, les séances restent lisibles', (await visible())[0] === 'vue-liste',
    JSON.stringify(await visible()));

  await clore();
})();
