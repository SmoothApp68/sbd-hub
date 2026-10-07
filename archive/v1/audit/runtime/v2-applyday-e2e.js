/**
 * VAGUE 2 — parcours réel : « Appliquer ce jour au programme » puis démarrer la séance.
 * OUTIL D'AUDIT, read-only.
 *
 * wpApplyDay (app.js:27379) et wpApplyAll (27391) écrivent `db.routineExos[day] = dayData.exercises`,
 * soit des OBJETS. saveRoutine (3984) et la génération guidée (14084) y écrivent des CHAÎNES.
 * getProgExosForDay (engine.js:890) rend le tableau tel quel ; _goDoStartWorkout (28513) passe
 * ensuite chaque entrée à matchExoName, qui appelle `s.toLowerCase()`.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

(async () => {
  const db = profiles.build('aurel_like');
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const jour = jours[new Date().getDay()];
  db.weeklyPlan = { days: [{ day: jour, rest: false, exercises: [
    { name: 'Squat (Barre)', isPrimary: true, sets: [
      { weight: 50, reps: 8, isWarmup: true }, { weight: 67.5, reps: 5, isWarmup: true },
      { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
  ] }] };
  db.routineExos = { [jour]: ['Squat (Barre)'] };   // état sain au départ (chaînes)

  const app = await H.openApp(db);
  const { page } = app;
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).split('\n')[0]));

  console.log('# VAGUE 2 — « Appliquer ce jour » puis démarrage de séance\n');

  const avant = await page.evaluate((j) => ({
    type: Array.isArray(db.routineExos[j]) ? typeof db.routineExos[j][0] : 'absent',
    valeur: JSON.stringify(db.routineExos[j]).slice(0, 60),
  }), jour);
  console.log('AVANT — db.routineExos[' + jour + '] : type des entrées = ' + avant.type + '  ' + avant.valeur);

  // Démarrage de séance dans l'état sain
  const sain = await page.evaluate(() => {
    try {
      _goDoStartWorkout(true);
      return { ok: true, exos: activeWorkout.exercises.map((e) => e.name + ' (' + e.sets.length + ' séries)') };
    } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
  });
  console.log('  démarrage : ' + (sain.ok ? '✔ ' + JSON.stringify(sain.exos) : '✘ ' + sain.err));

  // Appel de la VRAIE fonction du bouton « Appliquer ce jour au programme »
  console.log('\nAction utilisateur : bouton « Appliquer ce jour au programme » (app.js:27347)');
  await page.evaluate((j) => { if (typeof wpApplyDay === 'function') wpApplyDay(j); }, jour);
  await page.waitForTimeout(400);

  const apres = await page.evaluate((j) => ({
    type: Array.isArray(db.routineExos[j]) ? typeof db.routineExos[j][0] : 'absent',
    valeur: JSON.stringify(db.routineExos[j]).slice(0, 90),
    getProg: (typeof getProgExosForDay === 'function' ? getProgExosForDay(j) : []).map((x) => typeof x),
  }), jour);
  console.log('APRÈS — db.routineExos[' + jour + '] : type des entrées = ' + apres.type);
  console.log('        valeur : ' + apres.valeur + '…');
  console.log('        getProgExosForDay rend des : ' + JSON.stringify(apres.getProg));

  // Nouveau démarrage de séance
  const casse = await page.evaluate(() => {
    try {
      _goDoStartWorkout(true);
      return { ok: true, exos: activeWorkout.exercises.map((e) => String(e.name) + ' (' + e.sets.length + ' séries)') };
    } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
  });
  console.log('\n  démarrage après « Appliquer » : ' + (casse.ok ? '✔ ' + JSON.stringify(casse.exos) : '✘ CRASH — ' + casse.err));

  // Conséquence sur l'état de la séance
  const etat = await page.evaluate(() => ({
    activeWorkout: typeof activeWorkout !== 'undefined' && activeWorkout
      ? { titre: activeWorkout.title, nbExos: activeWorkout.exercises.length } : null,
    brouillon: (() => { try { const d = JSON.parse(localStorage.getItem('SBD_ACTIVE_WORKOUT') || 'null');
      return d ? { titre: d.title, nbExos: (d.exercises || []).length } : null; } catch (e) { return 'illisible'; } })(),
  }));
  console.log('  activeWorkout après le crash : ' + JSON.stringify(etat.activeWorkout));
  console.log('  brouillon auto-sauvegardé    : ' + JSON.stringify(etat.brouillon));

  // Les autres lecteurs de routineExos survivent-ils au format objet ?
  console.log('\n  Autres lecteurs de routineExos, en présence d\'objets :');
  const autres = await page.evaluate((j) => {
    const essais = {};
    const test = (nom, fn) => { try { const v = fn(); essais[nom] = 'ok → ' + JSON.stringify(v).slice(0, 70); }
      catch (e) { essais[nom] = '✘ ' + String(e.message).split('\n')[0]; } };
    test('getProgExosForDay', () => getProgExosForDay(j));
    test('renderCorpsTab', () => { renderCorpsTab(); return 'rendu'; });
    test('renderDash', () => { renderDash(); return 'rendu'; });
    test('renderProgramViewer', () => { if (typeof renderProgramViewer === 'function') { renderProgramViewer(); return 'rendu'; } return '(absent)'; });
    return essais;
  }, jour);
  Object.entries(autres).forEach(([k, v]) => console.log('     ' + k.padEnd(22) + v));

  console.log('\n  erreurs JS non capturées durant la session : ' + erreurs.length);
  erreurs.slice(0, 5).forEach((e) => console.log('     ! ' + e.slice(0, 140)));
  await app.close();
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
