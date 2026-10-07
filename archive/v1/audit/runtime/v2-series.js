/**
 * VAGUE 2 — mécanique du bug « les séries prescrites n'arrivent pas dans la séance ».
 * OUTIL D'AUDIT. Read-only : n'écrit rien dans le dépôt, ne touche à aucun fichier applicatif.
 *
 * Chaîne réelle (_goDoStartWorkout, app.js:28464) :
 *   1. dayExos = getProgExosForDay(jour)          → lit db.routineExos      (éditeur manuel)
 *   2. planDay = db.weeklyPlan.days.find(...)     → lit db.weeklyPlan       (programme généré)
 *   3. pour chaque NOM de dayExos, on cherche l'exercice du plan par matchExoName
 *   4. si trouvé ET planExo.sets non vide → toutes les séries sont recopiées
 *      sinon → repli historique, sinon UNE série vide
 * La boucle itère donc sur (1) et non sur (2) : ce que le plan prescrit n'entre dans la
 * séance que si son nom est retrouvé dans routineExos.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

async function scenario(nom, mut) {
  const db = profiles.build('aurel_like');
  if (mut) mut(db);
  const app = await H.openApp(db);
  const { page } = app;
  const r = await page.evaluate(() => {
    // getDay() : 0 = dimanche. Utiliser DAYS_FULL de l'app, exactement comme _goDoStartWorkout.
    const jour = DAYS_FULL[new Date().getDay()];
    const routineExos = (db.routineExos || {})[jour];
    const dayExos = typeof getProgExosForDay === 'function' ? getProgExosForDay(jour) : null;
    const planDay = (db.weeklyPlan && db.weeklyPlan.days)
      ? db.weeklyPlan.days.find((d) => d.day === jour && !d.rest) : null;

    // Démarrage réel de la séance, via la vraie fonction
    if (typeof _goDoStartWorkout === 'function') _goDoStartWorkout(true);
    const aw = typeof activeWorkout !== 'undefined' ? activeWorkout : null;

    return {
      jour,
      routineExosBrut: routineExos === undefined ? '(absent)' : routineExos,
      matchTest: (typeof matchExoName === 'function' && planDay && planDay.exercises && planDay.exercises[0])
        ? planDay.exercises.map((pe) => ({ plan: pe.name,
            matcheRoutine: (dayExos || []).map((n) => n + ':' + matchExoName(pe.name, n)) })) : null,
      dayExos,
      nbDayExos: (dayExos || []).length,
      planPresent: !!planDay,
      planExercices: planDay ? planDay.exercises.map((e) => ({
        nom: e.name,
        nbSets: Array.isArray(e.sets) ? e.sets.length : ('non-tableau: ' + typeof e.sets),
        detailSets: Array.isArray(e.sets)
          ? e.sets.map((s) => (s.weight || 0) + 'kg×' + (s.reps || 0) + (s.isWarmup ? ' (warmup)' : '')).slice(0, 8)
          : null,
      })) : null,
      seanceTitre: aw ? aw.title : null,
      seanceExercices: aw ? aw.exercises.map((e) => ({
        nom: e.name,
        nbSets: e.sets.length,
        detailSets: e.sets.map((s) => (s.weight || 0) + 'kg×' + (s.reps || 0) + ' [' + s.type + ']').slice(0, 8),
      })) : null,
    };
  });

  console.log('\n=== ' + nom + ' ===');
  console.log('  jour résolu : ' + r.jour);
  console.log('  db.routineExos[jour]  : ' + JSON.stringify(r.routineExosBrut));
  console.log('  getProgExosForDay()   : ' + JSON.stringify(r.dayExos) + '   → ' + r.nbDayExos + ' nom(s)');
  console.log('  db.weeklyPlan jour    : ' + (r.planPresent ? 'présent' : 'ABSENT'));
  if (r.planExercices) {
    console.log('  ── ce que le PLAN prescrit ──');
    r.planExercices.forEach((e) => console.log('     • ' + e.nom + '  (' + e.nbSets + ' séries) '
      + (e.detailSets ? e.detailSets.join(' · ') : '')));
  }
  console.log('  ── ce que la SÉANCE contient ──');
  if (!r.seanceExercices || !r.seanceExercices.length) console.log('     (aucun exercice)');
  else r.seanceExercices.forEach((e) => console.log('     • ' + e.nom + '  (' + e.nbSets + ' séries) '
    + e.detailSets.join(' · ')));

  // Verdict mécanique
  const planTotal = (r.planExercices || []).reduce((s, e) => s + (typeof e.nbSets === 'number' ? e.nbSets : 0), 0);
  const seanceTotal = (r.seanceExercices || []).reduce((s, e) => s + e.nbSets, 0);
  console.log('  → séries prescrites par le plan : ' + planTotal + '   |   séries dans la séance : ' + seanceTotal
    + (planTotal !== seanceTotal ? '   ✘ ÉCART' : '   ✔ identique'));
  await app.close();
  return { planTotal, seanceTotal, r };
}

(async () => {
  console.log('# VAGUE 2 — pourquoi les séries du plan n\'arrivent pas dans la séance');

  await scenario('A. Profil tel quel (fixture aurel_like)');

  await scenario('B. routineExos VIDE pour le jour, plan présent', (db) => {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = jours[new Date().getDay()];
    db.routineExos = db.routineExos || {};
    db.routineExos[jour] = [];
    db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: [
      { name: 'Squat (Barre)', isPrimary: true, sets: [
        { weight: 50, reps: 8, isWarmup: true }, { weight: 67.5, reps: 5, isWarmup: true },
        { weight: 85, reps: 3, isWarmup: true }, { weight: 100, reps: 2, isWarmup: true },
        { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
    ] }] };
  });

  await scenario('C. routineExos ALIGNÉ sur le plan (même nom)', (db) => {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = jours[new Date().getDay()];
    db.routineExos = db.routineExos || {};
    db.routineExos[jour] = ['Squat (Barre)'];
    db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: [
      { name: 'Squat (Barre)', isPrimary: true, sets: [
        { weight: 50, reps: 8, isWarmup: true }, { weight: 67.5, reps: 5, isWarmup: true },
        { weight: 85, reps: 3, isWarmup: true }, { weight: 100, reps: 2, isWarmup: true },
        { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
    ] }] };
  });

  await scenario('D. routineExos avec un nom DIFFÉRENT du plan', (db) => {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = jours[new Date().getDay()];
    db.routineExos = db.routineExos || {};
    db.routineExos[jour] = ['Squat avec pause (barre)'];   // variante prescrite par le coach
    db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: [
      { name: 'Squat (Barre)', isPrimary: true, sets: [
        { weight: 50, reps: 8, isWarmup: true }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
    ] }] };
  });

  await scenario('E. plan présent, sets stocké en NOMBRE (format hérité)', (db) => {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = jours[new Date().getDay()];
    db.routineExos = db.routineExos || {};
    db.routineExos[jour] = ['Squat (Barre)'];
    db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: [
      { name: 'Squat (Barre)', isPrimary: true, sets: 4, reps: 5, weight: 115 },
    ] }] };
  });
// F. wpApplyDay (app.js:27379) écrit `db.routineExos[day] = dayData.exercises`,
  //    soit des OBJETS, là où saveRoutine (3984) et la génération (14084) écrivent des CHAÎNES.
  await scenario('F. routineExos rempli par wpApplyDay (OBJETS, pas des chaînes)', (db) => {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = jours[new Date().getDay()];
    const exos = [{ name: 'Squat (Barre)', isPrimary: true, sets: [
      { weight: 50, reps: 8, isWarmup: true }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] }];
    db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: exos }] };
    db.routineExos = db.routineExos || {};
    db.routineExos[jour] = exos;   // exactement ce que fait wpApplyDay
  });
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
