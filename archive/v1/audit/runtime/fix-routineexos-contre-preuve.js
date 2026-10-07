/**
 * CONTRE-PREUVE — tentatives de mise en défaut du fix « routineExos = noms ».
 * OUTIL D'AUDIT, read-only sur l'app. Réseau intégralement stubbé (harness.js).
 *
 * Étape 7 du protocole : chercher activement à casser le fix. Comme la preuve
 * avant/après, ce script tourne à l'identique sur l'arbre AVANT et l'arbre APRÈS.
 *
 * A1  Perte d'information : réduire les objets du weeklyPlan à des noms jette
 *     `sets` et `isPrimary`. La séance démarrée porte-t-elle encore les charges ?
 * A2  Types tordus : name numérique, name objet, tableau imbriqué, null, 0, ''.
 * A3  Format legacy chaîne : un nom contenant une virgule survit-il au split ?
 * A4  Absence de migration : que reste-t-il dans le blob PERSISTÉ après le fix ?
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOUR = JOURS[new Date().getDay()];

const EXOS_DU_JOUR = [
  { name: 'Squat (Barre)', isPrimary: true, sets: [
    { weight: 60, reps: 8, isWarmup: true },
    { weight: 115, reps: 5 }, { weight: 115, reps: 5 }, { weight: 115, reps: 5 }] },
  { name: 'Développé Couché (Barre)', isPrimary: true, sets: [
    { weight: 95, reps: 5 }, { weight: 95, reps: 5 }] },
];

// Charges effectivement prescrites dans la séance démarrée.
const CHARGES = `(() => {
  try {
    _goDoStartWorkout(true);
    return { ok: true, n: activeWorkout.exercises.length,
      detail: activeWorkout.exercises.map(e => String(e.name) + ' → ' +
        (e.sets || []).map(s => (s.weight == null ? '?' : s.weight) + 'kg×' + (s.reps == null ? '?' : s.reps)).join(', ')) };
  } catch (e) { return { ok: false, err: String(e.message).split('\\n')[0] }; }
})()`;

(async () => {
  const etiquette = process.argv[2] || '(sans étiquette)';
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' CONTRE-PREUVE — ' + etiquette + '   (jour : ' + JOUR + ')');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── A1 ─────────────────────────────────────────────────────────────────────
  console.log('A1 — PERTE D\'INFORMATION : les charges prescrites survivent-elles ?');
  const db = profiles.build('aurel_like');
  db.weeklyPlan = { days: [{ day: JOUR, rest: false, exercises: JSON.parse(JSON.stringify(EXOS_DU_JOUR)) }] };
  db.routineExos = { [JOUR]: EXOS_DU_JOUR.map((e) => e.name) };
  const app = await H.openApp(db);
  const { page } = app;

  const nominal = await page.evaluate(CHARGES);
  console.log('   AVANT le clic (routineExos = chaînes) :');
  if (nominal.ok) nominal.detail.forEach((d) => console.log('      ' + d));
  else console.log('      CRASH — ' + nominal.err);

  await page.evaluate((j) => { wpApplyDay(j); }, JOUR);
  await page.waitForTimeout(250);
  const apresClic = await page.evaluate(CHARGES);
  console.log('   APRÈS le clic « Appliquer ce jour » :');
  if (apresClic.ok) apresClic.detail.forEach((d) => console.log('      ' + d));
  else console.log('      CRASH — ' + apresClic.err);

  // ── A2 ─────────────────────────────────────────────────────────────────────
  console.log('\nA2 — TYPES TORDUS dans un blob pollué');
  const a2 = await page.evaluate((j) => {
    db.routineExos[j] = [
      { name: 42 }, { name: {} }, [['Squat (Barre)']], null, 0, '',
      '   ', { name: '  Squat (Barre)  ' }, 'Développé Couché (Barre)',
    ];
    const out = {};
    try { out.lu = getProgExosForDay(j); } catch (e) { out.luErr = String(e.message).split('\n')[0]; }
    try { _goDoStartWorkout(true); out.n = activeWorkout.exercises.length; }
    catch (e) { out.startErr = String(e.message).split('\n')[0]; }
    return out;
  }, JOUR);
  console.log('   9 entrées tordues en entrée.');
  console.log('   getProgExosForDay : ' + (a2.luErr ? 'LÈVE — ' + a2.luErr : JSON.stringify(a2.lu)));
  console.log('   démarrage séance  : ' + (a2.startErr ? 'CRASH — ' + a2.startErr : a2.n + ' exercice(s)'));

  // ── A3 ─────────────────────────────────────────────────────────────────────
  console.log('\nA3 — FORMAT LEGACY CHAÎNE : un nom contenant une virgule');
  const a3 = await page.evaluate((j) => {
    db.routineExos[j] = 'Développé couché, prise serrée';
    try { return { lu: getProgExosForDay(j) }; }
    catch (e) { return { err: String(e.message).split('\n')[0] }; }
  }, JOUR);
  console.log('   « Développé couché, prise serrée » → '
    + (a3.err ? 'LÈVE — ' + a3.err : JSON.stringify(a3.lu)));

  // ── A4 ─────────────────────────────────────────────────────────────────────
  console.log('\nA4 — ABSENCE DE MIGRATION : que reste-t-il dans le blob PERSISTÉ ?');
  const a4 = await page.evaluate((j) => {
    db.routineExos[j] = [{ name: 'Squat (Barre)', sets: [{ weight: 115 }] }];
    // saveDB est débounced : sans saveDBNow, on relirait le blob d'AVANT et la
    // mesure ne voudrait rien dire (piège vu au premier passage de ce banc).
    if (typeof saveDBNow === 'function') saveDBNow(); else saveDB();
    return { memoire: (db.routineExos[j] || []).map((x) => typeof x) };
  }, JOUR);
  await page.waitForTimeout(600);
  const persiste = await H.readPersisted(page);
  const typesPersistes = ((persiste && persiste.routineExos && persiste.routineExos[JOUR]) || [])
    .map((x) => typeof x);
  console.log('   en mémoire  : ' + JSON.stringify(a4.memoire));
  console.log('   PERSISTÉ    : ' + JSON.stringify(typesPersistes)
    + '   ← ce qui part aussi dans le blob de sync');
  const relu = await page.evaluate((j) => {
    try { return getProgExosForDay(j); } catch (e) { return 'LÈVE — ' + String(e.message).split('\n')[0]; }
  }, JOUR);
  console.log('   relu par getProgExosForDay : ' + JSON.stringify(relu));

  await app.close();
  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
