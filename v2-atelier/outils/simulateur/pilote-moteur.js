'use strict';
// NIVEAU N — le vrai moteur et le vrai plan (require, comme tests/unit/), sur un historique simulé. Aucune règle du coach n'est
// réécrite ici : on assemble les ENTRÉES comme app.js (entreesDuPlan, optionsDeConsigne) et on appelle planDeSeance / verifierPlan.
// Limites assumées (AUDIT-PLAN §2.1) : pas d'escalier assemblé par app.js (cartes jamais répondues), pas de chauffes, pas de
// série de plus, pas de frères/échelles/figures ; chaque pari écrit s'accumule comme `local.predictions`.
const C = require('./charger.js');
const A = require('./alea.js');
const { catalogue } = require('./catalogue.js');
const P = require('./pratiquant.js');
const { Moteur, Seance: S, Plan: T, Generateur: G, Modele, Palier } = C;

const DECALAGE_JOURS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
const DEBUT = { an: 2026, mois: 0, jour: 5 };   // lundi 5 janvier 2026

function equipementDe(slug) { const f = catalogue[slug]; return f ? (Moteur.equipementEffectif(f) || null) : null; }
function mesureDe(slug) { const f = catalogue[slug]; if (!f) return null; const g = Modele.gabaritDe(f); return g.inconnue ? null : g.mesure; }

function fichePlan(slug) {
  const f = catalogue[slug]; const g = Modele.gabaritDe(f);
  return { equipement: Moteur.equipementEffectif(f) || null, nom: f.nom || slug, muscles_primaires: (f.muscles_primaires || []).slice(),
    muscles_secondaires: (f.muscles_secondaires || []).slice(), muscles_stabilisateurs: (f.muscles_stabilisateurs || []).slice(),
    mesure: g.inconnue ? null : g.mesure, leste: Modele.lesteDe(catalogue, slug), variante: null, salle: null };
}

function programmeDe(profil) {
  const rt = G.generer(catalogue, { jours: profil.freq, objectif: profil.objectif, phase: profil.phase, materiel: profil.materiel,
    anciennete: profil.anciennete, priorites: [], menager: [], ecartes: [], faits: {} });
  return rt.filter((r) => r.exercices.length);
}

const iso = (d) => d.toISOString();
function dateSeance(semaine, k, freq) {
  const off = (DECALAGE_JOURS[freq] || DECALAGE_JOURS[3])[k % (DECALAGE_JOURS[freq] || DECALAGE_JOURS[3]).length];
  return new Date(DEBUT.an, DEBUT.mois, DEBUT.jour + semaine * 7 + off, 18, 0, 0);
}

// --- Le pratiquant face à une ligne --------------------------------------------------------------------------------------
function faireSerie(ctx, ex, ligne, nSerieFaite) {
  const { profil, r, forme } = ctx;
  const fiche = catalogue[ex.slug];
  const cap = ex.cap;
  const mesure = mesureDe(ex.slug);
  const vise = ligne && ligne.vise ? ligne.vise : ex.reps;
  const isoFacteur = Moteur.estIsolation({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] }) ? 1.15 : 1;
  const fatigue = 1 - 0.04 * ex.dures;
  let charge = null, rmax;
  if (cap.type === 'kg' && mesure === 'charge_reps') {
    let w = ligne && typeof ligne.charge === 'number' ? ligne.charge : null;
    const pas = P.pasDe(profil, ex.equipement);
    if (w === null) w = P.arrondir(cap.C * (profil.anciennete === 'plus_5_ans' ? 0.75 : 0.6) * 1, pas);
    else {
      const u = r();
      if (u >= 0.88 && u < 0.93) w += pas; else if (u >= 0.93 && u < 0.98) w = Math.max(pas, w - pas); else if (u >= 0.98) w = Math.max(pas, Math.round(w * 0.9 / pas) * pas);
    }
    let plafonne = false;
    if (profil.special.plafondHaltere && ex.equipement === 'haltere' && w > profil.special.plafondHaltere) { w = profil.special.plafondHaltere; plafonne = true; }
    charge = w;
    rmax = Math.max(0, Math.round(30 * (forme * cap.C * fatigue / w - 1) * isoFacteur));
    ex.plafonne = plafonne;
  } else {
    // reps (poids du corps) ; une charge de ligne (aide négative, lest) module la capacité
    const w = ligne && typeof ligne.charge === 'number' ? ligne.charge : 0;
    charge = (mesure === 'reps') ? (w || null) : w;
    rmax = Math.max(0, Math.round(cap.C * forme * fatigue * (w > 0 ? 0.85 : 1) * (w < 0 ? 1.25 : 1)));
  }
  let faites = Math.min(vise, rmax);
  if (rmax >= vise + 3 && r() < 0.08) faites = vise + 1;
  const ratee = faites < vise;
  faites = Math.max(1, faites);
  const reserveVraie = Math.max(0, rmax - faites);
  let notee = null;
  const note = profil.reserve === 'notee' || r() < 0.11;
  if (note) {
    let v = reserveVraie + Math.round(profil.anciennete === 'moins_1_an' ? A.gauss(r, -3, 2) : A.gauss(r, -1, 1.5));
    if (profil.special.reserveHaute) v = Math.max(v, 4);
    v = Math.max(0, Math.min(5, v));
    notee = v >= 3 ? 'reste_3_plus' : 'reste_' + v;
  }
  if (reserveVraie <= 2) ex.dures += 1;
  if (reserveVraie <= 4) ex.stimul += 1;
  return { charge, reps: faites, ratee, reserveVraie, notee, vise, rmax };
}

// --- Les entrées du plan -------------------------------------------------------------------------------------------------
function entrees(ctx, se, consignes, suites, precedents) {
  const exos = se.exercices;
  const cat = {};
  exos.forEach((x) => { cat[x.exercise_slug] = fichePlan(x.exercise_slug); });
  const noms = {}; Object.keys(catalogue).forEach((s) => { noms[s] = catalogue[s].nom || s; });
  const seriesRoutine = {}; exos.forEach((x) => { seriesRoutine[x.exercise_slug] = x.series.filter((s) => s.type_serie === 'travail').length; });
  const compteurs = [];
  const debutDe = {}; ctx.sessions.forEach((s) => { debutDe[s.id] = s.debut; }); debutDe[se.id] = se.debut;
  const vus = {};
  ctx.predictions.forEach((l) => {
    if (!l || l.module === Moteur.MODULE_ESCALIER || !l.fondement) return;
    const sid = l.fondement.seance, c = l.fondement.compteur;
    if (!sid || typeof c !== 'number' || !debutDe[sid] || vus[sid + '|' + l.exercise_slug]) return;
    vus[sid + '|' + l.exercise_slug] = true;
    compteurs.push({ exercice: l.exercise_slug, seance: sid, compteur: c, debut: debutDe[sid], jour: Moteur.jourCivil(debutDe[sid]) });
  });
  const cartes = Moteur.cartesDesParis(ctx.predictions.filter((l) => l.module === Moteur.MODULE_ESCALIER));
  const marches = Moteur.marchesDesParis(ctx.predictions.filter((l) => l.module === Moteur.MODULE_ESCALIER));
  const profilNow = ctx.profilNow;
  return {
    seance: { id: se.id, debut: se.debut, edition: false, exercices: exos, reprises: null }, consignes, phase: profilNow.phase, objectif: profilNow.objectif,
    priorites: [], debutant: profilNow.anciennete === 'moins_1_an', volume: null, catalogue: cat, refusChauffes: {}, reglage: profilNow.reglage,
    intention: profilNow.intention, modes: {}, lestReponse: profilNow.special.lest || null, echelles: {}, figures: {}, marcheReponses: {},
    reserve: null, programme: { blocs: ctx.blocs, lignes: [] },
    periodesAllegees: Moteur.cartesDesParis(ctx.predictions.filter((l) => l.module === Moteur.MODULE_ESCALIER)).filter((c) => c.reponse === 'acceptee' && c.debut && c.fin).map((c) => ({ debut: c.debut, fin: c.fin })).concat(Moteur.periodesDecharge(ctx.blocs, [])),
    suites, precedents, paris: ctx.predictions.filter((l) => l.fondement && l.fondement.seance === se.id),
    escalier: { cartes, compteurs, noms, seriesRoutine, marches, degressivesRoutine: {}, remplacants: {}, carteSuspendue: false }, raccourci: null
  };
}

function optionsDe(ctx, slug, profilNow, groupes, extra) {
  const fiche = catalogue[slug];
  const sous = [...new Set(ctx.predictions.filter((l) => l.exercise_slug === slug && l.fondement && l.module !== Moteur.MODULE_ESCALIER).map((l) => l.fondement.seance))];
  const o = {
    mesure: mesureDe(slug), equipement: Moteur.equipementEffectif(fiche), intention: profilNow.intention, lestReponse: profilNow.special.lest || null,
    lestPossible: Modele.lesteDe(catalogue, slug) !== null, rallonge: null,
    isolation: Moteur.estIsolation({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] }) === true,
    echelle: false, libre: null, reglage: profilNow.reglage, correction: null, ligneDeZone: null, seancesSousConsigne: sous,
    correctionsDeZone: [], periodesAllegees: Moteur.cartesDesParis(ctx.predictions.filter((l) => l.module === Moteur.MODULE_ESCALIER)).filter((c) => c.reponse === 'acceptee' && c.debut && c.fin).map((c) => ({ debut: c.debut, fin: c.fin })).concat(Moteur.periodesDecharge(ctx.blocs, [])),
    periodesSerieDePlus: [], edition: false, depart: null, salle: null, elastiqueRetire: null
  };
  return Object.assign(o, extra || {});
}
const etatDe = (slug, groupes) => Palier.etatsExercices(groupes.map((g) => ({ slug, series: g.series })))[slug];

// --- Une séance ---------------------------------------------------------------------------------------------------------
function jouerSeance(ctx, routine, semaine, rang, date) {
  const { profil, graine } = ctx;
  const profilNow = ctx.profilNow;
  const id = 'S' + String(ctx.sessions.length + 1).padStart(3, '0');
  const debut = iso(date);
  let n = 0; const idSerie = () => id + '-s' + (++n);
  let se = S.creer({ id, userId: 'u', idSerie, debut });
  routine.exercices.forEach((e) => { se = S.ajouterExercice(se, e.exercise_slug, idSerie, { series: e.series, reps_visees: e.reps }); });
  se = Object.assign({}, se, { debut });
  const r = A.creer(profil.id, graine, 'seance', semaine, rang);
  const forme = Math.max(0.8, A.gauss(r, 1, 0.04)) * (profil.special.forme || 1);
  const entretien = profilNow.intention === 'entretien';
  const consignes = {}, suites = {}, precedents = {}, exInfos = [], opts = {};
  const mal = profil.special.mal && semaine + 1 === profil.special.mal.semaine && rang === 0;
  se.exercices.forEach((x, i) => {
    const slug = x.exercise_slug;
    const groupes = ctx.H[slug] || [];
    const premiere = !groupes.length;
    const cap = ctx.cap[slug] || (ctx.cap[slug] = P.capaciteInitiale(profil, slug, r));
    const equipement = equipementDe(slug);
    const mesure = mesureDe(slug);
    // La charge de départ de la routine (§9.21) : la seule charge que le pratiquant invente.
    let depart = null;
    if (premiere && cap.type === 'kg' && mesure === 'charge_reps' && !(ctx.rejeuB && ctx.rejeuB.sansDepart)) {
      const pas = P.pasDe(profil, equipement);
      depart = { charge: P.arrondir(cap.C * (profil.anciennete === 'plus_5_ans' ? 0.75 : 0.6), pas), reps: x.series[0].reps_visees, n: x.series.length };
      se.exercices[i].series.forEach((s, j) => { se = S.modifierSerie(se, i, j, { charge_cible_kg: depart.charge }); });
    }
    const o = optionsDe(ctx, slug, profilNow, groupes, { depart });
    opts[slug] = o;
    let c = null;
    if (!Object.prototype.hasOwnProperty.call(consignes, slug)) {
      c = Moteur.consigneDExercice(groupes, etatDe(slug, groupes), debut, o);
      if (c) { c.seriesRoutine = x.series.length; c.degressiveRoutine = false; }
      consignes[slug] = c;
      precedents[slug] = S.precedent(slug, ctx.sessions.map((s) => ({ id: s.id, debut: s.debut })), (sid) => (ctx.rows[sid] || []).filter((q) => q.exercise_slug === slug), se.id);
    }
    exInfos.push({ slug, iExo: i, cap, equipement, reps: x.series[0].reps_visees || 10, dures: 0, stimul: 0, fait: [], mesure });
  });
  const log = { violations: [], plans: 0, cartes: [], gestes: 0 };
  let avantPlan = null;
  const pariPose = {};
  const calc = () => {
    const e = entrees(ctx, se, consignes, suites, precedents);
    const plan = T.planDeSeance(e);
    log.plans++;
    let v;
    try { v = T.verifierPlan(plan, e, avantPlan); } catch (err) { v = { erreurs: ['[exception verifierPlan] ' + err.message] }; }
    (v.erreurs || []).forEach((m) => log.violations.push({ geste: log.gestes, msg: String(m) }));
    avantPlan = plan;
    return { e, plan };
  };
  const premierPlan = calc().plan;
  const t0 = Date.parse(debut) + 5 * 60000;
  let t = t0;
  exInfos.forEach((ex) => {
    const i = ex.iExo;
    const sers = se.exercices[i].series;
    if (mal && i === 0) { se = S.marquerDouleur(se, i); }
    for (let j = 0; j < sers.length; j++) {
      const { e, plan } = calc();
      const px = plan.exercices[i];
      const ligne = px && px.lignes && px.lignes[j] ? px.lignes[j] : null;
      const pre = ligne && ligne.prerempli ? ligne.prerempli : null;
      let l2 = ligne && ligne.charge !== undefined && ligne.vise ? { charge: ligne.charge, vise: ligne.vise } : null;
      if (entretien || !consignes[ex.slug]) {
        const prec = precedents[ex.slug];
        const pj = prec && prec.series && prec.series[j] ? prec.series[j] : null;
        l2 = pj && pj.charge_kg !== null && pj.charge_kg !== undefined ? { charge: pj.charge_kg, vise: pj.reps } : null;
      }
      // Le pari de la série (comme enregistrerPari) : écrit avant la validation.
      if (px && px.paris && px.paris[j] && !px.figees[sers[j].id] && !pariPose[ex.slug + '|' + px.paris[j].fondement.rang + '|' + (px.paris[j].fondement.revision || 0)]) {
        const pari = px.paris[j]; pariPose[ex.slug + '|' + pari.fondement.rang + '|' + (pari.fondement.revision || 0)] = true;
        ctx.predictions.push(Object.assign({}, pari, { id: [se.id, ex.slug, pari.fondement.rang, pari.fondement.revision || 0].join('|'), module_version: Moteur.VERSION_CONSIGNE }));
      }
      if (false && process.env.DBG && ex.slug===process.env.DBG && semaine===0) console.error('DBG j',j,'lignes',JSON.stringify(px.lignes.map(l=>[l.rang,l.role,l.charge,l.vise,l.validee,l.figee])),'paris',JSON.stringify(px.paris.map(q=>[q.fondement.rang,q.fondement.revision,q.valeur_predite])),'figees',JSON.stringify(px.figees),'sid',sers[j].id);
      let res = faireSerie({ profil, r, forme }, ex, l2, j);
      // V12 (concordance N <-> B) : les gestes de la personne sont ceux que B a joués (opts.script[séance][slug][série]) ; le moteur, lui, est celui de N.
      const sc = ctx.rejeuB && ctx.rejeuB.script && ctx.rejeuB.script[ctx.sessions.length + 1] && ctx.rejeuB.script[ctx.sessions.length + 1][ex.slug];
      if (sc && sc[j]) res = { charge: sc[j].kg, reps: sc[j].reps, ratee: !!sc[j].ratee, reserveVraie: 0, notee: sc[j].notee || null, vise: res.vise, rmax: res.rmax };
      se = S.modifierSerie(se, i, j, { charge_kg: res.charge, reps: res.reps, type_serie: sers[j].type_serie || 'travail' });
      if (res.notee) se = S.definirEffort(se, i, j, { ressenti: res.notee });
      t += 150000; log.gestes++;
      se = S.valider(se, i, j, new Date(t));
      // L'observation du pari (comme observerPari) : set_observe et valeur_observee, par les fonctions du moteur et de la séance.
      {
        const serie = se.exercices[i].series[j];
        const jj = px && px.indices ? px.indices.indexOf(j) : -1; const rg = jj < 0 ? null : px.rangs[jj];
        const siens = ctx.predictions.filter((q) => q.exercise_slug === ex.slug && q.fondement && q.fondement.seance === se.id && q.id);
        S.parisAObserver(siens, serie, rg, se.exercices[i].series).forEach((q) => {
          const vue = Moteur.observationDe(q.fondement, { enBase: S.partEnBase(serie), id: serie.id, charge: serie.charge_kg, reps: serie.reps });
          q.set_observe = vue.set_observe; q.valeur_observee = vue.valeur_observee; q.observee_a = vue.valeur_observee !== null && vue.valeur_observee !== undefined ? new Date(t).toISOString() : null;
        });
      }
      ex.fait.push({ kg: res.charge, reps: res.reps, vise: res.vise, ratee: res.ratee, reserveVraie: res.reserveVraie, notee: res.notee, role: ligne ? ligne.role : null, rmax: res.rmax });
      // la suite, une fois les séries de travail faites
      if (j === sers.length - 1 && consignes[ex.slug] && !entretien) {
        const groupes = ctx.H[ex.slug] || [];
        const faites = se.exercices[i].series.filter((s) => s.validee_a).map((s, k) => ({ id: s.id, rang: k + 1, charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti, type_serie: 'travail', exercise_slug: ex.slug, validee_a: s.validee_a }));
        const rs = Moteur.suiteDExercice(groupes, { seance: { id: se.id, debut: se.debut }, series: faites }, etatDe(ex.slug, groupes), new Date(t + 600000).toISOString(), opts[ex.slug]);
        // V10 (a) — le contrefactuel : la même séance, sans réserve notée ; la suite doit être identique (hors bord_garde).
        if (faites.some((f) => f.ressenti === 'reste_0')) {
          const sans = faites.map((f) => Object.assign({}, f, { ressenti: null, rpe: null }));
          const rs2 = Moteur.suiteDExercice(groupes, { seance: { id: se.id, debut: se.debut }, series: sans }, etatDe(ex.slug, groupes), new Date(t + 600000).toISOString(), opts[ex.slug]);
          const k1 = rs && rs.apres.consigne, k2 = rs2 && rs2.apres.consigne;
          ex.contrefactuel = { etat: k1 && k1.etat, etatSans: k2 && k2.etat, ligne: k1 && k1.ligne, ligneSans: k2 && k2.ligne };
        }
        suites[ex.slug] = rs ? { consigne: rs.apres.consigne, cranSuivant: rs.cranSuivant, cranSuivantApprochee: rs.cranSuivantApprochee === true } : null;
      }
    }
  });
  const fin = calc();
  // Cartes posées par le plan (jamais répondues en N)
  const cartesPlan = [];
  ['escalier', 'carteReprise', 'carteLest', 'carteMarche', 'proposition', 'degressive', 'leviersGardes', 'cranDeMoins', 'tempo', 'placeSerieDePlus'].forEach((k) => {
    fin.plan.exercices.forEach((x) => { if (x && x[k]) cartesPlan.push({ exo: x.slug, type: k }); });
  });
  if (fin.plan.carte) cartesPlan.push({ exo: null, type: 'plan.carte' });
  if (fin.plan.allegee) cartesPlan.push({ exo: null, type: 'plan.allegee' });
  // Historique : la séance termine
  const rows = [];
  exInfos.forEach((ex, ii) => {
    const sr = se.exercices[ex.iExo].series.filter((s) => s.validee_a).map((s, k) => ({ id: s.id, rang: k + 1, charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti, type_serie: 'travail', exercise_slug: ex.slug, validee_a: s.validee_a, douleur: false }));
    rows.push.apply(rows, sr);
    (ctx.H[ex.slug] = ctx.H[ex.slug] || []).push({ seance: { id: se.id, debut: se.debut }, series: sr });
    ctx.stim[ex.slug] = (ctx.stim[ex.slug] || 0) + ex.stimul;
    ctx.derniere[ex.slug] = semaine;
  });
  ctx.rows[se.id] = rows;
  ctx.sessions.push({ id: se.id, debut: se.debut });
  const exLog = fin.plan.exercices.map((x, ii) => {
    const ex = exInfos.find((q) => q.iExo === x.iExo) || exInfos[ii];
    const k = x.consigne;
    return { slug: x.slug, iExo: x.iExo, consigne: k ? { etat: k.etat, zone: k.zone || null, palier: k.palier === undefined ? null : k.palier, niveau: k.niveau === undefined ? null : k.niveau, ligne: k.ligne || null, haut: k.haut || null, compteur: x.compteur ? x.compteur.compteur : null } : null,
      entete: x.entete ? { jaune: x.entete.jaune, gris: x.entete.gris } : null,
      enteteInitial: premierPlan.exercices[x.iExo] && premierPlan.exercices[x.iExo].entete ? { jaune: premierPlan.exercices[x.iExo].entete.jaune, gris: premierPlan.exercices[x.iExo].entete.gris } : null,
      lignesInitiales: premierPlan.exercices[x.iExo] ? premierPlan.exercices[x.iExo].lignes.map((l) => ({ role: l.role, charge: l.charge, vise: l.vise })) : [],
      phrases: (x.phrases || []).map((p) => ({ ou: p.ou, texte: p.texte })), constat: x.constat || null, donc: x.donc || null,
      suiteConsigne: suites[x.slug] && suites[x.slug].consigne ? { etat: suites[x.slug].consigne.etat, ligne: suites[x.slug].consigne.ligne || null } : null,
      fait: ex ? ex.fait : [], capacite: ex ? Math.round(ex.cap.C * 100) / 100 : null, equipement: ex ? ex.equipement : null, mesure: ex ? ex.mesure : null,
      douleur: !!x.douleur, intention: x.intention, plafonne: ex ? !!ex.plafonne : false, contrefactuel: ex ? ex.contrefactuel || null : null };
  });
  return { profil: profil.id, graine, niveau: 'N', semaine: semaine + 1, seance: ctx.sessions.length, rang, date: debut, routine: routine.nom,
    exos: exLog, violations: log.violations, cartes: cartesPlan, plans: log.plans, allegee: fin.plan.allegee ? true : false };
}

// --- Un profil, 16 semaines -----------------------------------------------------------------------------------------------
function jouerProfil(profil, graine, semaines, opts) {
  const routines = programmeDe(profil);
  const ctx = { profil, graine, H: {}, rows: {}, sessions: [], predictions: [], cap: {}, stim: {}, derniere: {}, blocs: [], profilNow: null, rejeuB: opts || {} };
  const sortie = [];
  if (!routines.length) return { lignes: sortie, routines, vide: true };
  let rang = 0;
  const abs = A.creer(profil.id, graine, 'absences');
  for (let w = 0; w < semaines; w++) {
    const pn = Object.assign({}, profil, { special: profil.special });
    if (profil.special.phaseA && w + 1 >= profil.special.phaseA.semaine) pn.phase = profil.special.phaseA.phase === 'seche' ? 'seche' : pn.phase;
    if (profil.special.reglageA && w + 1 >= profil.special.reglageA.semaine) pn.reglage = profil.special.reglageA.reglage;
    ctx.profilNow = pn;
    if (profil.special.cycles && !ctx.blocs.length) {
      for (let b = 0; b < 4; b++) {
        const d = new Date(DEBUT.an, DEBUT.mois, DEBUT.jour + b * 28);
        ctx.blocs.push({ id: 'B' + b, statut: 'en_cours', debut: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), semaines: 4, decharge: true, zone: 'mix', dossier: 'D', exercices: [] });
      }
      // un seul bloc « en cours » à la fois : les précédents sont terminés à la date
    }
    if (profil.special.cycles) ctx.blocs.forEach((b, bi) => { b.statut = bi === Math.floor(w / 4) ? 'en_cours' : (bi < Math.floor(w / 4) ? 'termine' : 'a_venir'); });
    const f = profil.freq;
    for (let k = 0; k < f; k++) {
      const absente = profil.special.irregulier ? ([5, 6, 10, 11, 12].includes(w) || abs() < 0.25) : abs() < 0.05;
      const date = dateSeance(w, k, f);
      if (absente) continue;
      const routine = routines[(rang) % routines.length];
      rang++;
      sortie.push(jouerSeance(ctx, routine, w, k, date));
    }
    // La capacité vraie évolue (fin de semaine).
    Object.keys(ctx.cap).forEach((slug) => {
      const c = ctx.cap[slug]; const vu = w - (ctx.derniere[slug] === undefined ? -99 : ctx.derniere[slug]);
      const stim = ctx.stim[slug] >= 2 ? 1 : ctx.stim[slug] === 1 ? 0.5 : 0;
      const bas = P.BAS.test(slug) ? 1 : 0.8;
      const rr = A.creer(profil.id, graine, 'cap', slug, w);
      let g = P.gHebdo(profil, w) * P.S_PHASE(profil.phase, profil.anciennete) * bas * stim;
      if (vu > 2 && vu < 90) g = profil.special.irregulier ? -0.015 : -0.007;
      c.C = Math.max(1, c.C * (1 + g) * (1 + A.gauss(rr, 0, 0.005)));
      ctx.stim[slug] = 0;
    });
  }
  return { lignes: sortie, routines, vide: false };
}

module.exports = { jouerProfil, programmeDe, faireSerie, equipementDe, mesureDe, dateSeance, DECALAGE_JOURS };
