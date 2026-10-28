'use strict';
// node verifs/resume.js DOSSIER  -> DOSSIER/resume.txt et resume.json : une ligne par (profil, graine).
const fs = require('fs'); const path = require('path');
const d = process.argv[2] || '/home/claude/nuit/audit-fil/simulation';
const lignes = []; const out = {};
fs.readdirSync(d).filter((f) => /\.jsonl$/.test(f)).sort().forEach((f) => {
  const L = fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); if (!L.length) return;
  const uniq = {}; let plans = 0, exos = 0, bord = 0, series = 0, ratees = 0, allegees = 0;
  const rap = {};
  L.forEach((s) => { plans += s.plans; if (s.allegee) allegees++;
    (s.violations || []).forEach((v) => { if (/^I10 suite/.test(v.msg)) return; uniq[s.seance + '|' + v.msg] = (/^(I\d+)/.exec(v.msg) || [0, 'autre'])[1]; });
    s.exos.forEach((x) => { exos++; if (x.consigne && /^bord/.test(x.consigne.etat)) bord++; (x.fait || []).forEach((q) => { series++; if (q.ratee) ratees++; }); (x.cartes || []); }); });
  Object.values(uniq).forEach((k) => { rap[k] = (rap[k] || 0) + 1; });
  const id = L[0].profil + '-g' + L[0].graine; const nom = (L[0].niveau || 'N');
  out[id] = { niveau: nom, seances: L.length, plans, exercices: exos, violationsDistinctes: Object.keys(uniq).length, parInvariant: rap, exercicesEnBord: bord, seriesRatees: series ? Math.round(1000 * ratees / series) / 10 : 0, allegees };
  lignes.push([id.padEnd(8), String(L.length).padStart(4) + ' séances', String(plans).padStart(6) + ' plans', String(Object.keys(uniq).length).padStart(4) + ' écarts V1 distincts', JSON.stringify(rap), 'bord ' + bord + '/' + exos, 'ratées ' + out[id].seriesRatees + ' %'].join(' | '));
});
fs.writeFileSync(path.join(d, 'resume.txt'), 'Niveau ' + (Object.values(out)[0] || {}).niveau + ' — une ligne par (profil, graine) ; écarts V1 comptés une fois par (séance, message).\n' + lignes.join('\n') + '\n');
fs.writeFileSync(path.join(d, 'resume.json'), JSON.stringify(out, null, 1));
console.log(lignes.length, 'lignes');
