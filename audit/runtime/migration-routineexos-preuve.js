/**
 * PREUVE RUNTIME AVANT / APRÈS — migration de db.routineExos.
 * OUTIL D'AUDIT, read-only sur l'app. Réseau Supabase intégralement stubbé.
 *
 * Exécuté à l'identique sur deux arbres (avant / après la migration). Ne référence
 * AUCUN symbole introduit par la migration, sinon le run AVANT échouerait pour une
 * raison qui n'est pas le sujet.
 *
 * Scénarios — les trois cas demandés, plus les deux points d'entrée du db :
 *   M1  blob POLLUÉ au boot        → l'objet est-il encore là après le boot ?
 *   M2  blob PROPRE au boot        → la migration écrit-elle quand il n'y a rien à faire ?
 *   M3  blob LEGACY CHAÎNE         → le nom contenant une virgule survit-il ?
 *   M4  blob MIXTE                 → chaînes conservées, objets normalisés ?
 *   M5  adoption cloud polluée     → _applyCloudBlob puis ce qui repartirait au cloud
 *   M6  §6.3 « N exercices prévus » sur le format legacy chaîne (compte de caractères)
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOUR = JOURS[new Date().getDay()];

const OBJ = (n) => ({ name: n, isPrimary: true, sets: [{ weight: 100, reps: 5 }] });
const NOM_A_VIRGULE = 'Développé couché, prise serrée';

function blobAvec(valeur) {
  const db = profiles.build('aurel_like');
  db.routineExos = { [JOUR]: valeur };
  db.weeklyPlan = { days: [{ day: JOUR, rest: false, exercises: [OBJ('Squat (Barre)')] }] };
  return db;
}

// Types + valeur brute de routineExos[JOUR], en mémoire ET tel que persisté.
const ETAT = `(() => {
  const j = ${JSON.stringify(JOUR)};
  const v = (db.routineExos || {})[j];
  const p = (() => { try { const b = JSON.parse(localStorage.getItem('SBD_HUB_V29') || '{}');
    return (b.routineExos || {})[j]; } catch (e) { return '(illisible)'; } })();
  const desc = (x) => Array.isArray(x) ? x.map(e => typeof e) : typeof x;
  return { memTypes: desc(v), memBrut: JSON.stringify(v),
           perTypes: desc(p), perBrut: JSON.stringify(p) };
})()`;

async function etat(page, titre) {
  const e = await page.evaluate(ETAT);
  console.log('   ' + titre);
  console.log('      mémoire  : ' + JSON.stringify(e.memTypes) + '  ' + (e.memBrut || '').slice(0, 90));
  console.log('      persisté : ' + JSON.stringify(e.perTypes) + '  ' + (e.perBrut || '').slice(0, 90));
  return e;
}

(async () => {
  const etiquette = process.argv[2] || '(sans étiquette)';
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' MIGRATION routineExos — ' + etiquette + '   (jour : ' + JOUR + ')');
  console.log('══════════════════════════════════════════════════════════════\n');

  // ── M1 : blob pollué au boot ───────────────────────────────────────────────
  console.log('M1 — BLOB POLLUÉ AU BOOT (objets écrits par l\'ancien wpApplyDay)');
  let app = await H.openApp(blobAvec([OBJ('Squat (Barre)'), OBJ('Rowing Barre')]));
  await etat(app.page, 'après boot :');
  await app.close();

  // ── M2 : blob propre au boot ───────────────────────────────────────────────
  console.log('\nM2 — BLOB DÉJÀ PROPRE AU BOOT (la migration doit être un no-op)');
  app = await H.openApp(blobAvec(['Squat (Barre)', 'Rowing Barre']));
  await etat(app.page, 'après boot :');
  const m2 = await app.page.evaluate(`(() => {
    const j = ${JSON.stringify(JOUR)};
    const avant = JSON.stringify(db.routineExos[j]);
    const ref = db.routineExos[j];
    return { inchange: JSON.stringify(db.routineExos[j]) === avant,
             memeReference: db.routineExos[j] === ref };
  })()`);
  console.log('      contenu inchangé : ' + m2.inchange);
  await app.close();

  // ── M3 : legacy chaîne ─────────────────────────────────────────────────────
  console.log('\nM3 — FORMAT LEGACY CHAÎNE (ne doit PAS être converti)');
  app = await H.openApp(blobAvec(NOM_A_VIRGULE));
  const e3 = await etat(app.page, 'après boot :');
  console.log('      nom d\'origine récupérable : '
    + (String(e3.memBrut).indexOf('prise serrée') > -1 && String(e3.memTypes) === 'string'
       ? 'OUI (chaîne intacte)' : 'NON — converti/détruit'));
  const lu3 = await app.page.evaluate((j) => getProgExosForDay(j), JOUR);
  console.log('      lu par getProgExosForDay  : ' + JSON.stringify(lu3));
  await app.close();

  // ── M4 : mixte ─────────────────────────────────────────────────────────────
  console.log('\nM4 — BLOB MIXTE (chaînes + objets + une entrée sans nom)');
  app = await H.openApp(blobAvec(['Squat (Barre)', OBJ('Rowing Barre'), { sets: [] }]));
  await etat(app.page, 'après boot :');
  await app.close();

  // ── M5 : adoption cloud ────────────────────────────────────────────────────
  console.log('\nM5 — ADOPTION D\'UN BLOB CLOUD POLLUÉ (_applyCloudBlob)');
  app = await H.openApp(blobAvec(['Squat (Barre)', 'Rowing Barre']));
  await etat(app.page, 'avant adoption (local propre) :');
  const m5 = await app.page.evaluate(`(() => {
    const j = ${JSON.stringify(JOUR)};
    if (typeof _applyCloudBlob !== 'function') return { absent: true };
    const cloud = JSON.parse(JSON.stringify(db));
    cloud.routineExos = { [j]: [${JSON.stringify(OBJ('Squat (Barre)'))}, ${JSON.stringify(OBJ('Rowing Barre'))}] };
    delete cloud.logs;
    _applyCloudBlob(cloud, (db.user && db.user.ownerUid) || 'uid-test', Date.now());
    return { repousse: (typeof _buildSyncedBlob === 'function')
      ? JSON.stringify((_buildSyncedBlob(db, db.weeklyPlan).routineExos || {})[j]).slice(0, 90)
      : '(indisponible)' };
  })()`);
  await etat(app.page, 'après adoption :');
  if (!m5.absent) console.log('      repartirait au cloud : ' + m5.repousse);
  await app.close();

  // ── M6 : §6.3 ──────────────────────────────────────────────────────────────
  console.log('\nM6 — §6.3 : « N exercices prévus » sur le format legacy chaîne');
  app = await H.openApp(blobAvec(NOM_A_VIRGULE));
  const m6 = await app.page.evaluate(`(() => {
    const j = ${JSON.stringify(JOUR)};
    db.weeklyPlan = null;                        // forcer le repli sur routineExos
    db.routine = db.routine || {};
    db.routine[j] = 'Séance test';               // sinon la carte part en « jour de repos »
    const brut = (db.routineExos || {})[j];
    let html = '';
    try { html = buildGoIdleHtml(); } catch (e) { return { err: String(e.message).split('\\n')[0] }; }
    const m = html.match(/go-hero-sub">([^<]*)/);
    return { affiche: m ? m[1].trim() : '(motif introuvable)',
             longueurBrute: typeof brut === 'string' ? brut.length : (brut || []).length };
  })()`);
  console.log('   valeur stockée : ' + JSON.stringify(NOM_A_VIRGULE) + '  (longueur ' + m6.longueurBrute + ')');
  console.log('   affiché        : ' + (m6.err ? 'LÈVE — ' + m6.err : JSON.stringify(m6.affiche)));
  await app.close();

  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
