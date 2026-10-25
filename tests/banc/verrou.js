// tests/banc/verrou.js — 168 : deux bancs ne tournent jamais ensemble, et aucun port n'est fixe.
//
// LE VERROU. Un fichier commun (`os.tmpdir()/trainhub-banc.verrou`), créé en exclusif (`wx`), qui porte le PID du
// détenteur. Un banc qui le trouve pris ATTEND (« banc en attente : un autre tourne, PID … ») ; un verrou dont le
// PID est mort est repris. Il se rend à la sortie du processus, exception comprise.
//
// PAS D'INTERBLOCAGE. Le détenteur déclare `BANC_VERROU_TENU=<pid>` dans son environnement : tout banc qu'il lance
// (tout.js et ses cinq bancs, seance-rapide et ses groupes, muter et ses copies) hérite de la variable et passe
// sans reprendre le verrou — il joue SOUS celui de son parent. Si le PID déclaré n'est plus celui du fichier (un
// environnement hérité d'un vieux processus), on reprend normalement.
//
// `--sans-verrou` (ou `BANC_SANS_VERROU=1`) : pas de verrou du tout. La CI GitHub n'en a pas besoin (une machine
// par job, rien d'autre ne tourne) : elle lance `tout.js` tel quel, le verrou y est pris sans attente, sans effet.
//
// LES PORTS. `ecouter(serveur, souhaite)` écoute sur le port demandé, ou sur 0 (le système en donne un libre) et
// rend le port RÉEL : plus aucun port fixe dans les bancs.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FICHIER = path.join(os.tmpdir(), 'trainhub-banc.verrou');

function vivant(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lire(fichier) {
  try { return parseInt(fs.readFileSync(fichier, 'utf8').trim(), 10); } catch (e) { return NaN; }
}

function essayer(fichier) {
  try {
    fs.writeFileSync(fichier, String(process.pid), { flag: 'wx' });
    return { pris: true };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const pid = lire(fichier);
  if (pid === process.pid) return { pris: true };
  if (!vivant(pid)) {                       // verrou d'un PID mort (ou fichier vide/illisible) : on le reprend
    try { fs.unlinkSync(fichier); } catch (e) { /* un autre l'a déjà repris */ }
    return essayer(fichier);
  }
  return { pris: false, pid };
}

const attendreMs = (ms) => new Promise((r) => setTimeout(r, ms));   // plafond : le pas d'une boucle qui lit l'état

// Prend le verrou (attend s'il est pris). Rend une fonction `rendre()`. Options : fichier, sans, pas, dire.
async function prendre(options) {
  const o = options || {};
  const fichier = o.fichier || FICHIER;
  const env = o.env || process.env;
  const sans = o.sans !== undefined ? o.sans : (process.argv.indexOf('--sans-verrou') >= 0 || env.BANC_SANS_VERROU === '1');
  const dire = o.dire || ((m) => process.stderr.write(m + '\n'));
  if (sans) return () => {};
  // Sous le verrou d'un parent vivant : rien à prendre.
  const tenu = parseInt(env.BANC_VERROU_TENU, 10);
  if (tenu > 0 && tenu !== process.pid && vivant(tenu) && lire(fichier) === tenu) return () => {};
  let prevenu = 0;
  for (;;) {
    const r = essayer(fichier);
    if (r.pris) break;
    if (r.pid !== prevenu) { dire('banc en attente : un autre tourne, PID ' + r.pid); prevenu = r.pid; }
    await attendreMs(o.pas || 2000);
  }
  let rendu = false;
  const rendre = () => {
    if (rendu) return;
    rendu = true;
    if (lire(fichier) === process.pid) { try { fs.unlinkSync(fichier); } catch (e) { /* déjà parti */ } }
    if (env.BANC_VERROU_TENU === String(process.pid)) delete env.BANC_VERROU_TENU;
  };
  env.BANC_VERROU_TENU = String(process.pid);     // hérité par les bancs lancés d'ici : ils jouent sous ce verrou
  if (o.surSortie === false) return rendre;       // (tests unitaires : pas de crochets sur le processus de jest)
  process.on('exit', rendre);
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((s) => process.on(s, () => { rendre(); process.exit(130); }));
  process.on('uncaughtException', (e) => { rendre(); console.error(e && e.stack || e); process.exit(1); });
  return rendre;
}

// Écoute sur le port demandé, ou sur un port libre donné par le système ; rend le port réel.
function ecouter(serveur, souhaite) {
  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(souhaite || 0, () => { serveur.removeListener('error', ko); ok(serveur.address().port); });
  });
}

module.exports = { prendre, ecouter, essayer, vivant, FICHIER };
