/**
 * DIAGNOSTIC (read-only) — où doit tourner la migration de db.routineExos ?
 * OUTIL D'AUDIT. Réseau Supabase intégralement stubbé. N'écrit rien dans js/.
 *
 * Question : une migration placée au BOOT (bloc top-level d'app.js, comme les
 * migrations _migratedFreezeV2/V3/V4) suffit-elle ?
 *
 * Hypothèse à tester : NON — `_applyCloudBlob` (supabase.js:337) fait `db = cloudBlob`
 * en OVERWRITE après le boot. Un blob cloud pollué écraserait donc un db fraîchement
 * migré, et repartirait vers Supabase une fois routineExos signé (fix 2).
 *
 * Ce script n'applique aucune migration : il mesure l'état du code ACTUEL de la branche.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOUR = JOURS[new Date().getDay()];

const POLLUE = [
  { name: 'Squat (Barre)', isPrimary: true, sets: [{ weight: 115, reps: 5 }] },
  { name: 'Rowing Barre', sets: [{ weight: 70, reps: 10 }] },
];

(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' DIAGNOSTIC — portée nécessaire de la migration routineExos');
  console.log(' (code actuel de la branche : fix appliqué, AUCUNE migration)');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Local SAIN au départ : c'est l'état qu'une migration au boot produirait.
  const db = profiles.build('aurel_like');
  db.routineExos = { [JOUR]: ['Squat (Barre)', 'Rowing Barre'] };
  const app = await H.openApp(db);
  const { page } = app;

  const t0 = await page.evaluate((j) => ({
    memoire: (db.routineExos[j] || []).map((x) => typeof x),
    persiste: (() => { const b = JSON.parse(localStorage.getItem('SBD_HUB_V29') || '{}');
      return ((b.routineExos || {})[j] || []).map((x) => typeof x); })(),
  }), JOUR);
  console.log('1) Après boot (état qu\'une migration au boot laisserait) :');
  console.log('   db.routineExos[' + JOUR + ']   en mémoire : ' + JSON.stringify(t0.memoire));
  console.log('                              persisté   : ' + JSON.stringify(t0.persiste));

  // Adoption d'une ligne cloud POLLUÉE, via la VRAIE fonction du chemin de pull.
  console.log('\n2) Adoption d\'un blob cloud pollué — _applyCloudBlob (supabase.js:337) :');
  const t1 = await page.evaluate(({ j, pollue }) => {
    if (typeof _applyCloudBlob !== 'function') return { absent: true };
    const cloud = JSON.parse(JSON.stringify(db));
    cloud.routineExos = { [j]: pollue };
    delete cloud.logs;                       // le blob cloud ne porte pas les logs
    _applyCloudBlob(cloud, (db.user && db.user.ownerUid) || 'uid-test', Date.now());
    return {
      memoire: (db.routineExos[j] || []).map((x) => typeof x),
      persiste: (() => { const b = JSON.parse(localStorage.getItem('SBD_HUB_V29') || '{}');
        return ((b.routineExos || {})[j] || []).map((x) => typeof x); })(),
      // Ce qui repartirait vers Supabase une fois routineExos signé (fix 2) :
      repousse: (typeof _buildSyncedBlob === 'function')
        ? ((_buildSyncedBlob(db, db.weeklyPlan).routineExos || {})[j] || []).map((x) => typeof x)
        : '(_buildSyncedBlob indisponible)',
      lecteur: (typeof getProgExosForDay === 'function') ? getProgExosForDay(j) : null,
    };
  }, { j: JOUR, pollue: POLLUE });

  if (t1.absent) { console.log('   _applyCloudBlob indisponible dans la page.'); }
  else {
    console.log('   db.routineExos[' + JOUR + ']   en mémoire : ' + JSON.stringify(t1.memoire));
    console.log('                              persisté   : ' + JSON.stringify(t1.persiste));
    console.log('   blob qui repartirait au cloud          : ' + JSON.stringify(t1.repousse));
    console.log('   lu par getProgExosForDay (défensif)    : ' + JSON.stringify(t1.lecteur));
  }

  // Le second point de remplacement de db : le merge de pull (supabase.js:992).
  console.log('\n3) Points du code où `db` est remplacé en bloc (grep) :');
  console.log('   supabase.js:337  _applyCloudBlob  → db = cloudBlob');
  console.log('   supabase.js:992  merge de pull    → db = _mergedData');
  console.log('   app.js:1342      restauration     → db = sanitizeDB(_restoreData)');

  await app.close();
  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
