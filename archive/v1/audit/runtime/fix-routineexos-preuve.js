/**
 * PREUVE RUNTIME AVANT / APRÈS — fix « routineExos ne stocke que des noms ».
 * OUTIL D'AUDIT, read-only sur l'app. Réseau intégralement stubbé (harness.js).
 *
 * Ce script est fait pour être exécuté DEUX FOIS, à l'identique, sur deux arbres :
 *   - un arbre au code AVANT le fix  → sortie « AVANT »
 *   - un arbre au code APRÈS le fix  → sortie « APRÈS »
 * Les libellés et les chiffres sont volontairement identiques dans les deux runs
 * pour que la comparaison soit directe (mêmes scénarios, mêmes compteurs).
 *
 * Il ne référence AUCUN symbole introduit par le fix (normalizeExoName), sans quoi
 * le run « AVANT » échouerait pour une raison qui n'est pas le bug.
 *
 * Scénarios :
 *   S0  chemin NOMINAL      — routineExos sain (chaînes) → démarrer la séance
 *   S1  le bug              — bouton « Appliquer ce jour » → démarrer la séance
 *   S2  surfaces adjacentes — Corps / Dash / Program viewer après S1
 *   S3  éditeur de routine  — Réglages, sur le db pollué par S1
 *   S4  builder             — pbEditExisting, sur le db pollué par S1
 *   S5  blob DÉJÀ pollué    — profil d'un utilisateur qui avait cliqué avant le fix
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOUR = JOURS[new Date().getDay()];

// 3 exercices, pour que « N exercices » soit un chiffre parlant et pas 0 vs 1.
const EXOS_DU_JOUR = [
  { name: 'Squat (Barre)', isPrimary: true, sets: [
    { weight: 60, reps: 8, isWarmup: true },
    { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
  { name: 'Développé Couché (Barre)', isPrimary: true, sets: [
    { weight: 95, reps: 5 }, { weight: 95, reps: 5 }] },
  { name: 'Rowing Barre', isPrimary: false, sets: [
    { weight: 70, reps: 10 }, { weight: 70, reps: 10 }] },
];
const NOMS = EXOS_DU_JOUR.map((e) => e.name);

function planDuJour() {
  return { days: [{ day: JOUR, rest: false, exercises: JSON.parse(JSON.stringify(EXOS_DU_JOUR)) }] };
}

// Démarrage de séance : le vrai chemin du bouton « Lancer la séance du jour ».
const DEMARRER = `(() => {
  try {
    _goDoStartWorkout(true);
    return { ok: true, n: activeWorkout.exercises.length,
             noms: activeWorkout.exercises.map(e => String(e.name)) };
  } catch (e) { return { ok: false, n: null, err: String(e.message).split('\\n')[0] }; }
})()`;

function ligneDemarrage(prefixe, r) {
  if (r.ok) console.log(prefixe + ' séance : ' + r.n + ' exercice(s) — ' + JSON.stringify(r.noms));
  else console.log(prefixe + ' séance : CRASH — ' + r.err);
}

function ligneRendu(prefixe, r) {
  console.log(prefixe + ' ' + (r.ok ? 'rendu OK' : 'LÈVE — ' + r.err));
}

const RENDU = (appel) => `(() => {
  try { ${appel}; return { ok: true }; }
  catch (e) { return { ok: false, err: String(e.message).split('\\n')[0] }; }
})()`;

(async () => {
  const etiquette = process.argv[2] || '(sans étiquette)';
  const PROFIL = process.argv[3] || 'aurel_like';
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' PREUVE RUNTIME — ' + etiquette + '   (profil : ' + PROFIL + ', jour : ' + JOUR + ')');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── Session 1 : S0 → S4 ────────────────────────────────────────────────────
  const db = profiles.build(PROFIL);
  db.weeklyPlan = planDuJour();
  db.routineExos = { [JOUR]: NOMS.slice() };   // état SAIN au départ (chaînes)

  const app = await H.openApp(db);
  const { page } = app;
  const erreursJS = [];
  page.on('pageerror', (e) => erreursJS.push(String(e.message).split('\n')[0]));

  console.log('S0 — CHEMIN NOMINAL (routineExos sain, chaînes)');
  const t0 = await page.evaluate((j) => typeof db.routineExos[j][0], JOUR);
  console.log('   db.routineExos[' + JOUR + '] : entrées de type ' + t0);
  ligneDemarrage('  ', await page.evaluate(DEMARRER));

  console.log('\nS1 — LE BUG : bouton « Appliquer ce jour au programme » (wpApplyDay)');
  await page.evaluate((j) => { wpApplyDay(j); }, JOUR);
  await page.waitForTimeout(300);
  const apres = await page.evaluate((j) => ({
    type: Array.isArray(db.routineExos[j]) ? typeof db.routineExos[j][0] : 'pas un tableau',
    brut: JSON.stringify(db.routineExos[j]).slice(0, 80),
    lu: (() => { try { return { ok: true, v: getProgExosForDay(j).map((x) => typeof x) }; }
                 catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; } })(),
  }), JOUR);
  console.log('   db.routineExos[' + JOUR + '] : entrées de type ' + apres.type);
  console.log('   valeur brute : ' + apres.brut + '…');
  console.log('   getProgExosForDay rend : ' + (apres.lu.ok ? JSON.stringify(apres.lu.v) : 'LÈVE — ' + apres.lu.err));
  ligneDemarrage('  ', await page.evaluate(DEMARRER));

  console.log('\nS2 — SURFACES ADJACENTES, sur ce même db');
  ligneRendu('   renderCorpsTab       :', await page.evaluate(RENDU('renderCorpsTab()')));
  ligneRendu('   renderDash           :', await page.evaluate(RENDU('renderDash()')));
  ligneRendu('   renderProgramViewer  :', await page.evaluate(RENDU(
    "if (typeof renderProgramViewer === 'function') renderProgramViewer()")));

  // S3/S4 mesurent la PROPAGATION, pas l'affichage : les deux rendus (app.js:3893 et
  // 13923) protègent déjà le libellé par `typeof e === 'string' ? e : e.name`, donc
  // aucun « [object Object] » à l'écran. Ce qui se propage, c'est la SAUVEGARDE :
  // saveRoutine (3984) et pbSaveManualProgram (13997) réécrivent tels quels ce que
  // l'écran a chargé. Un utilisateur qui passe par l'éditeur pour réparer son
  // programme réécrit donc les objets.
  console.log('\nS3 — ÉDITEUR DE ROUTINE (Réglages) : charger puis SAUVEGARDER');
  const s3 = await page.evaluate((j) => {
    try {
      renderSettingsRoutineEditor();
      const charge = (editingExos[j] || []).map((x) => typeof x);
      const objObj = (document.body.innerHTML.match(/\[object Object\]/g) || []).length;
      saveRoutine();
      return { ok: true, charge, objObj, reecrit: (db.routineExos[j] || []).map((x) => typeof x) };
    } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
  }, JOUR);
  if (!s3.ok) console.log('   LÈVE — ' + s3.err);
  else {
    console.log('   editingExos[' + JOUR + '] chargé      : ' + JSON.stringify(s3.charge));
    console.log('   « [object Object] » à l\'écran      : ' + s3.objObj);
    console.log('   db.routineExos[' + JOUR + '] réécrit  : ' + JSON.stringify(s3.reecrit));
  }
  ligneDemarrage('   après sauvegarde de la routine —', await page.evaluate(DEMARRER));

  console.log('\nS4 — BUILDER : re-polluer, reprendre (pbEditExisting) puis SAUVEGARDER');
  await page.evaluate((j) => { wpApplyDay(j); }, JOUR);   // remettre l'état pollué
  const s4 = await page.evaluate((j) => {
    try {
      const label = (db.routine || {})[j] || '(sans libellé)';
      pbEditExisting();
      const de = (_pbState && _pbState.dayExercises) || {};
      const charge = (de[label] || []).map((x) => typeof x);
      pbSaveManualProgram();
      return { ok: true, label, charge, reecrit: (db.routineExos[j] || []).map((x) => typeof x) };
    } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
  }, JOUR);
  if (!s4.ok) console.log('   LÈVE — ' + s4.err);
  else {
    console.log('   _pbState.dayExercises["' + s4.label + '"] chargé : ' + JSON.stringify(s4.charge));
    console.log('   db.routineExos[' + JOUR + '] réécrit            : ' + JSON.stringify(s4.reecrit));
  }
  ligneDemarrage('   après sauvegarde du builder —', await page.evaluate(DEMARRER));

  console.log('\n   erreurs JS non capturées durant la session 1 : ' + erreursJS.length);
  erreursJS.slice(0, 4).forEach((e) => console.log('      ! ' + e.slice(0, 120)));
  await app.close();

  // ── Session 2 : S5, blob déjà pollué au boot ───────────────────────────────
  console.log('\nS5 — BLOB DÉJÀ POLLUÉ AU BOOT (utilisateur ayant cliqué « Appliquer » avant le fix)');
  const db2 = profiles.build(PROFIL);
  db2.weeklyPlan = planDuJour();
  db2.routineExos = { [JOUR]: JSON.parse(JSON.stringify(EXOS_DU_JOUR)) };   // OBJETS persistés
  const app2 = await H.openApp(db2);
  const err2 = [];
  app2.page.on('pageerror', (e) => err2.push(String(e.message).split('\n')[0]));
  const t5 = await app2.page.evaluate((j) => typeof db.routineExos[j][0], JOUR);
  console.log('   db.routineExos[' + JOUR + '] au boot : entrées de type ' + t5);
  ligneDemarrage('  ', await app2.page.evaluate(DEMARRER));
  ligneRendu('   renderCorpsTab       :', await app2.page.evaluate(RENDU('renderCorpsTab()')));
  console.log('   erreurs JS non capturées durant la session 2 : ' + err2.length);
  await app2.close();

  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
