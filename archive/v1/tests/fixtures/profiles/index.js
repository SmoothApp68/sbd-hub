/**
 * SBD Hub — Registre des profils de test (Agent 09).
 *
 * USAGE (tests unitaires ou agent 10) :
 *   const profiles = require('./tests/fixtures/profiles');
 *   const db = profiles.build('aurel_like');          // blob db now-relatif
 *   const all = profiles.buildAll();                   // { name: db, ... }
 *   const meta = profiles.meta;                        // descriptions + « stresse »
 *
 * Chaque profil est now-relatif : passez un `now` explicite pour figer les
 * fenêtres glissantes dans un test déterministe :
 *   const db = profiles.build('aurel_like', FIXED_NOW);
 *
 * CLI (aperçu / snapshots JSON) — n'écrit QUE dans ce dossier :
 *   node tests/fixtures/profiles/index.js list
 *   node tests/fixtures/profiles/index.js dump [dir]     (défaut: ./snapshots)
 */
'use strict';

const generator = require('./generator');

const MODULES = {
  vierge: require('./vierge'),
  debutant: require('./debutant'),
  aurel_like: require('./aurel_like'),
  retour_apres_pause: require('./retour_apres_pause'),
  mono_lift: require('./mono_lift'),
  donnees_sales: require('./donnees_sales'),
  extreme_bas: require('./extreme_bas'),
  extreme_haut: require('./extreme_haut'),
  progression_nette: require('./progression_nette')
};

const NAMES = Object.keys(MODULES);

function build(name, now) {
  const m = MODULES[name];
  if (!m) throw new Error('Profil inconnu : ' + name + ' (dispo : ' + NAMES.join(', ') + ')');
  return m.build(now);
}

function buildAll(now) {
  const out = {};
  NAMES.forEach(function (n) { out[n] = MODULES[n].build(now); });
  return out;
}

const meta = NAMES.map(function (n) {
  return { name: n, description: MODULES[n].description, stresses: MODULES[n].stresses };
});

module.exports = {
  generator,
  names: NAMES,
  modules: MODULES,
  meta: meta,
  build: build,
  buildAll: buildAll
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2] || 'list';
  if (cmd === 'list') {
    meta.forEach(function (m) {
      const db = build(m.name);
      console.log('• ' + m.name + '  (' + (db.logs ? db.logs.length : 0) + ' séances)');
      console.log('    ' + m.description);
      console.log('    stresse: ' + m.stresses);
    });
  } else if (cmd === 'dump') {
    const fs = require('fs');
    const path = require('path');
    const dir = process.argv[3] || path.join(__dirname, 'snapshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Snapshot figé à une date de référence documentée (aperçu uniquement — les
    // builders now-relatifs restent la source de vérité).
    const FIXED_NOW = Date.parse('2026-07-15T05:42:00Z');
    NAMES.forEach(function (n) {
      const db = build(n, FIXED_NOW);
      const file = path.join(dir, n + '.json');
      fs.writeFileSync(file, JSON.stringify(db, null, 0));
      console.log('wrote ' + file + '  (' + (fs.statSync(file).size / 1024).toFixed(1) + ' KB, ' + db.logs.length + ' séances)');
    });
    console.log('\n⚠️ Snapshots FIGÉS à ' + new Date(FIXED_NOW).toISOString() + ' — pour inspection. Utilisez les builders now-relatifs dans les tests.');
  } else {
    console.error('Commande inconnue : ' + cmd + '. Utilisez: list | dump [dir]');
    process.exit(1);
  }
}
