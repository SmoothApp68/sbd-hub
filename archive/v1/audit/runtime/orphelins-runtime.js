/**
 * VÉRIFICATION RUNTIME — générateurs orphelins.
 * OUTIL D'AUDIT, read-only. Réseau Supabase intégralement stubbé.
 *
 * Le scan statique (orphelins-scan.js) donne des CANDIDATS : des ids lus par du code
 * mais dont le littéral n'apparaît nulle part comme création. Ici on confirme sur
 * l'app réelle : ces ids existent-ils dans le DOM, sur un état quelconque ?
 *
 * On balaie les onglets et sous-onglets, puis on appelle directement les deux
 * générateurs du motif exact pour observer leur no-op.
 */
'use strict';
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const profiles = require('../../tests/fixtures/profiles');

const OUT = JSON.parse(fs.readFileSync(path.join(__dirname, 'out-orphelins.json'), 'utf8'));
const CANDIDATS = [...new Set([...OUT.avecGarde, ...OUT.sansGarde].map((r) => r.id))].sort();
// Témoins : des ids qui EXISTENT, pour prouver que la sonde sait en trouver.
const TEMOINS = ['tab-go', 'dayExercisesContainer', 'trainingLogs', 'programViewer', 'sbdTotalDisplay'];

const ONGLETS = ['tab-go', 'tab-home', 'tab-seances', 'tab-stats', 'tab-profil', 'tab-social', 'tab-jeux'];
const SOUS_PROFIL = ['tab-corps', 'tab-profil-reglages', 'tab-profil-badges', 'tab-profil-records'];
const SOUS_SEANCES = ['s-log', 's-prog', 's-import'];
const SOUS_SOCIAL = ['soc-feed', 'soc-friends', 'soc-leaderboard'];

(async () => {
  const db = profiles.build('aurel_like');
  db.weeklyPlan = { week: 1, days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    .map((d) => ({ day: d, rest: false, title: 'Séance ' + d,
      exercises: [{ name: 'Squat (Barre)', sets: [{ weight: 115, reps: 5 }] }] }))
    .concat([{ day: 'Dimanche', rest: true }]) };
  db.generatedProgram = [{ day: 'Lundi', isRest: false, exercises: ['Squat (Barre)'] }];

  const app = await H.openApp(db);
  const { page } = app;

  console.log('══════════════════════════════════════════════════════════════');
  console.log(' VÉRIFICATION RUNTIME — ' + CANDIDATS.length + ' ids candidats');
  console.log('══════════════════════════════════════════════════════════════\n');

  const vus = new Set();       // ids trouvés au moins une fois
  const temoinsVus = new Set();
  let nbEtats = 0;

  const sonder = async (nom) => {
    nbEtats++;
    const r = await page.evaluate(({ ids, temoins }) => ({
      trouves: ids.filter((i) => !!document.getElementById(i)),
      temoins: temoins.filter((i) => !!document.getElementById(i)),
    }), { ids: CANDIDATS, temoins: TEMOINS });
    r.trouves.forEach((i) => vus.add(i));
    r.temoins.forEach((i) => temoinsVus.add(i));
    if (r.trouves.length) console.log('   ' + nom + ' → PRÉSENTS : ' + JSON.stringify(r.trouves));
  };

  for (const t of ONGLETS) {
    await page.evaluate((x) => { if (typeof showTab === 'function') showTab(x); }, t);
    await page.waitForTimeout(450);
    await sonder(t);
    const subs = t === 'tab-profil' ? SOUS_PROFIL : t === 'tab-seances' ? SOUS_SEANCES
               : t === 'tab-social' ? SOUS_SOCIAL : [];
    for (const s of subs) {
      await page.evaluate(({ tab, sub }) => {
        if (tab === 'tab-profil' && typeof showProfilSub === 'function') showProfilSub(sub);
        if (tab === 'tab-seances' && typeof showSeancesSub === 'function') showSeancesSub(sub);
        if (tab === 'tab-social' && typeof showSocialSub === 'function') showSocialSub(sub);
      }, { tab: t, sub: s });
      await page.waitForTimeout(400);
      await sonder(t + '/' + s);
    }
  }

  console.log('\n1) Balayage : ' + nbEtats + ' états');
  console.log('   ids candidats trouvés au moins une fois : ' + vus.size
    + (vus.size ? ' → ' + JSON.stringify([...vus]) : ''));
  console.log('   TÉMOINS trouvés (contrôle de la sonde)  : ' + temoinsVus.size + '/' + TEMOINS.length
    + ' → ' + JSON.stringify([...temoinsVus]));

  console.log('\n2) Les deux générateurs du motif exact, appelés directement');
  for (const fn of ['renderDaySelector', 'renderWeeklyPlanUI']) {
    const r = await page.evaluate((n) => {
      if (typeof window[n] === 'undefined' && typeof eval(n) !== 'function') return { absent: true };
      const avant = document.body.innerHTML.length;
      let err = null;
      try { eval(n + '()'); } catch (e) { err = String(e.message).split('\n')[0]; }
      return { err, deltaDom: document.body.innerHTML.length - avant };
    }, fn);
    console.log('   ' + fn + '() → ' + (r.absent ? 'introuvable'
      : (r.err ? 'LÈVE — ' + r.err : 'aucune levée, delta DOM = ' + r.deltaDom + ' caractère(s)')));
  }

  console.log('\n3) Contexte : le compagnon de renderDaySelector existe-t-il ?');
  const ctx = await page.evaluate(() => ({
    dayExercisesContainer: !!document.getElementById('dayExercisesContainer'),
    trainingLogs: !!document.getElementById('trainingLogs'),
    dashDaySelector: !!document.getElementById('dashDaySelector'),
  }));
  console.log('   ' + JSON.stringify(ctx));

  await app.close();
  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
