/**
 * ATTEIGNABILITÉ — les boutons « Appliquer ce jour / toutes les suggestions au programme »
 * (wpApplyDay / wpApplyAll) ont-ils un point d'entrée UI ?
 * OUTIL D'AUDIT, read-only. Réseau Supabase intégralement stubbé.
 *
 * Hypothèse issue du grep : renderWeeklyPlanUI (app.js:27313) sort immédiatement sur
 *   const genBtn = document.getElementById('wpGenerateBtn');
 *   const content = document.getElementById('wpContent');
 *   if (!genBtn || !content) return;   // « Elements not in DOM yet »
 * or ces ids ne sont créés NI dans index.html NI par aucun générateur de js/.
 *
 * On ne se fie pas au grep : on balaie tous les onglets et sous-onglets d'un profil
 * normal, avec un weeklyPlan bien présent, et on cherche dans le DOM RÉEL :
 *   - les conteneurs (#wpContent, #wpGenerateBtn…)
 *   - tout élément dont le onclick appelle wpApplyDay/wpApplyAll
 *   - les libellés exacts des deux boutons
 * puis on teste isVisible() sur ce qui existe.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const LIB_JOUR = 'Appliquer ce jour au programme';
const LIB_ALL = 'Appliquer toutes les suggestions au programme';

// Un weeklyPlan complet, sans jour de repos sur les jours testés : aucune raison
// « métier » que les boutons soient masqués.
function planComplet() {
  const exos = [{ name: 'Squat (Barre)', isPrimary: true, sets: [{ weight: 115, reps: 5 }] },
                { name: 'Rowing Barre', sets: [{ weight: 70, reps: 10 }] }];
  return {
    week: 1, generated_at: Date.now(), blocLabel: 'Accumulation',
    days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((d) => ({
      day: d, rest: false, title: 'Séance ' + d,
      exercises: JSON.parse(JSON.stringify(exos)),
    })).concat([{ day: 'Dimanche', rest: true }]),
  };
}

const ONGLETS = ['tab-go', 'tab-home', 'tab-seances', 'tab-stats', 'tab-profil', 'tab-social', 'tab-jeux'];
const SOUS_PROFIL = ['tab-corps', 'tab-profil-reglages', 'tab-profil-badges', 'tab-profil-records'];
const SOUS_SEANCES = ['s-log', 's-prog', 's-import'];

(async () => {
  const db = profiles.build('aurel_like');
  db.weeklyPlan = planComplet();
  db.routineExos = { Lundi: ['Squat (Barre)'] };

  const app = await H.openApp(db);
  const { page } = app;

  console.log('══════════════════════════════════════════════════════════════');
  console.log(' ATTEIGNABILITÉ de wpApplyDay / wpApplyAll  (profil aurel_like)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const sonde = () => page.evaluate(({ libJour, libAll }) => {
    const ids = ['wpContent', 'wpGenerateBtn', 'wpRegenBtn', 'wpMeta', 'wpBlocSelect'];
    const present = {};
    ids.forEach((i) => { present[i] = !!document.getElementById(i); });
    const parOnclick = [...document.querySelectorAll('[onclick]')]
      .filter((e) => /wpApply(Day|All)/.test(e.getAttribute('onclick') || ''))
      .map((e) => e.tagName + ' « ' + (e.textContent || '').trim().slice(0, 50) + ' »');
    const html = document.body.innerHTML;
    return {
      present,
      parOnclick,
      libJourDansDom: html.indexOf(libJour) > -1,
      libAllDansDom: html.indexOf(libAll) > -1,
      classesWp: ['wp-session', 'wp-day-pill', 'wp-days', 'wp-bloc-badge']
        .filter((c) => document.querySelector('.' + c)),
    };
  }, { libJour: LIB_JOUR, libAll: LIB_ALL });

  console.log('1) Balayage de tous les onglets et sous-onglets');
  const vus = [];
  for (const t of ONGLETS) {
    await page.evaluate((x) => { if (typeof showTab === 'function') showTab(x); }, t);
    await page.waitForTimeout(500);
    const s = await sonde();
    vus.push([t, s]);
    if (t === 'tab-profil') {
      for (const sub of SOUS_PROFIL) {
        await page.evaluate((x) => { if (typeof showProfilSub === 'function') showProfilSub(x); }, sub);
        await page.waitForTimeout(400);
        vus.push([t + ' / ' + sub, await sonde()]);
      }
    }
    if (t === 'tab-seances') {
      for (const sub of SOUS_SEANCES) {
        await page.evaluate((x) => { if (typeof showSeancesSub === 'function') showSeancesSub(x); }, sub);
        await page.waitForTimeout(400);
        vus.push([t + ' / ' + sub, await sonde()]);
      }
    }
  }
  const trouve = vus.filter(([, s]) => s.parOnclick.length || s.libJourDansDom || s.libAllDansDom
    || s.present.wpContent || s.classesWp.length);
  console.log('   états balayés : ' + vus.length);
  console.log('   états où un bouton wpApply* (ou le conteneur, ou le markup wp-*) apparaît : ' + trouve.length);
  trouve.forEach(([n, s]) => console.log('      ' + n + ' → ' + JSON.stringify(s)));

  console.log('\n2) Appel DIRECT de renderWeeklyPlanUI() — le générateur produit-il quelque chose ?');
  const direct = await page.evaluate(() => {
    if (typeof renderWeeklyPlanUI !== 'function') return { absent: true };
    let err = null;
    try { renderWeeklyPlanUI(); } catch (e) { err = String(e.message).split('\n')[0]; }
    return {
      err,
      conteneur: !!document.getElementById('wpContent'),
      genBtn: !!document.getElementById('wpGenerateBtn'),
      boutons: [...document.querySelectorAll('[onclick]')]
        .filter((e) => /wpApply/.test(e.getAttribute('onclick') || '')).length,
    };
  });
  console.log('   ' + JSON.stringify(direct));

  console.log('\n3) Les fonctions existent-elles, et le plan est-il bien là ?');
  const etat = await page.evaluate(() => ({
    wpApplyDay: typeof wpApplyDay,
    wpApplyAll: typeof wpApplyAll,
    renderWeeklyPlanUI: typeof renderWeeklyPlanUI,
    joursDuPlan: (db.weeklyPlan && db.weeklyPlan.days || []).length,
  }));
  console.log('   ' + JSON.stringify(etat));

  console.log('\n4) isVisible() sur les libellés, s\'ils existent quelque part');
  for (const lib of [LIB_JOUR, LIB_ALL]) {
    const loc = page.locator('text=' + lib);
    const n = await loc.count();
    let vis = 'n/a';
    if (n) { try { vis = String(await loc.first().isVisible()); } catch (e) { vis = 'erreur'; } }
    console.log('   « ' + lib + ' » → ' + n + ' occurrence(s), visible=' + vis);
  }

  await app.close();
  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
