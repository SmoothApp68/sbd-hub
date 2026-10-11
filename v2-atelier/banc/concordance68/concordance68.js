// concordance68.js — rejoue des séances au format cas-49u2-fantome.json par le vrai plan (THPlan.rejouer), avec les
// lignes figées relues dans les paris, comme v2-fantome-plan.test.js. Usage : node concordance68.js entree.json sortie.json
const path = require('path'); const fs = require('fs');
const R = path.join(__dirname, '..', '..', '..', 'v2', 'js') + path.sep;
require(R + 'modele.js'); require(R + 'palier.js'); require(R + 'profil.js');
require(R + 'moteur.js'); const S = require(R + 'seance.js'); const T = require(R + 'plan.js');
const cent = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const out = [];
for (const c of d.cas) {
  const k = c.consigne;
  const consigne = { etat: k.etat, zone: k.zone === null ? null : k.zone.nom, palier: k.palier, n: k.n, ligne: k.ligne, haut: k.haut };
  const paris = []; let figees = {}; const etapes = []; let err = null;
  try {
    for (let t = 0; t <= c.series; t++) {
      const r = T.rejouer(consigne, c.contexte, c.series, c.faites.slice(0, t), figees);
      etapes.push({
        lignes: r.lignes.map((l) => ({ role: l.role, charge: cent(l.charge), vise: l.vise })),
        fantomes: r.lignes.map((l) => (l.fantome ? { charge: cent(l.fantome.charge), reps: l.fantome.reps, source: l.fantome.source } : null)),
        message: r.message ? r.message.type : null
      });
      if (t === c.series) break;
      const apres = T.rejouer(consigne, c.contexte, c.series, c.faites.slice(0, t + 1), figees, { slug: 'x', seance: 'S' });
      if (apres.paris[t]) paris.push(Object.assign({}, apres.paris[t], { set_observe: 'r' + (t + 1) }));
      const g = S.figeesDe(paris, apres.series, consigne);
      figees = {}; Object.keys(g).forEach((kk) => { figees[Number(kk.slice(1)) - 1] = g[kk]; });
    }
  } catch (e) { err = String(e && e.stack || e); }
  out.push({ id: c.id, etapes, err });
}
fs.writeFileSync(process.argv[3], JSON.stringify(out));
