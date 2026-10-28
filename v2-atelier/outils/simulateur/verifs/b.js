'use strict';
// Vérifications du niveau B : V1 (garde de l'app + verifierPlan échantillonné), V11, V6/V8 sur le texte visible, V12 (concordance N <-> B).
// node verifs/b.js DOSSIER_B DOSSIER_N  -> ../verifs-B.json (dans /home/claude/nuit/audit-fil/)
const fs = require('fs'); const path = require('path');
const [dB, dN] = [process.argv[2] || '/home/claude/nuit/audit-fil/simulation-B', process.argv[3] || '/home/claude/nuit/audit-fil/simulation'];
const lire = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const regles = JSON.parse(fs.readFileSync('/home/claude/nuit/audit-fil/voix-regles.json', 'utf8')).interdits.map((r) => ({ re: new RegExp(r.motif, r.drapeaux || ''), regle: r.regle.split(' ;')[0].slice(0, 80), motif: r.motif, compter: /cran/.test(r.motif) }));
const out = { profils: {}, V1: [], V11: [], V6: [], V12: [], erreursPage: {}, resume: {} };
fs.readdirSync(dB).filter((f) => /\.jsonl$/.test(f)).forEach((f) => {
  const L = lire(path.join(dB, f)); if (!L.length) return; const id = L[0].profil + '-g' + L[0].graine;
  const garde = {}, mon = {}, v11 = {}, voixVus = {}; let nPlans = 0, nVoix = 0;
  L.forEach((s) => {
    nPlans += s.plans;
    (s.violations || []).forEach((v) => { const k = (/^(I\d+)/.exec(v.msg) || [0, v.msg.slice(0, 20)])[1]; mon[k] = (mon[k] || 0) + 1; out.V1.push({ profil: L[0].profil, seance: s.seance, geste: v.geste, msg: v.msg.slice(0, 300) }); });
    const vus = {};
    (s.erreursPage || []).forEach((m) => { const k = (/\[(I\d+)/.exec(m) || [0, 'autre'])[1]; if (vus[m]) return; vus[m] = 1; garde[k] = (garde[k] || 0) + 1; (out.erreursPage[k] = out.erreursPage[k] || []).push({ profil: L[0].profil, seance: s.seance, m: m.slice(0, 400) }); });
    (s.v11 || []).forEach((v) => { v11[v.type] = (v11[v.type] || 0) + 1; out.V11.push({ profil: L[0].profil, seance: s.seance, type: v.type, geste: v.geste, slug: v.slug, jaune: v.jaune }); });
    (s.voix || []).forEach((t) => { if (!t) return; nVoix++; const tx = String(t).replace(/[  ]/g, ' '); regles.forEach((g) => { if (g.re.test(tx)) { if (g.compter) return; const k = g.regle + '|' + tx.slice(0, 120); if (voixVus[k]) return; voixVus[k] = 1; out.V6.push({ profil: L[0].profil, seance: s.seance, regle: g.regle, texte: tx.slice(0, 200) }); } }); });
  });
  // V12 : la première séance où la consigne de B diffère de celle de N (même profil, même graine)
  let div = null, egales = 0, total = 0;
  const fN = path.join(dN, id + '.jsonl');
  if (fs.existsSync(fN)) {
    const N = lire(fN);
    for (const sB of L) {
      const sN = N.find((q) => q.seance === sB.seance); if (!sN) break;
      let diff = null;
      for (const xB of sB.exos) { const xN = sN.exos.find((q) => q.slug === xB.slug); if (!xN) { diff = { slug: xB.slug, B: 'présent', N: 'absent' }; break; } total++; const a = JSON.stringify([xB.consigne && xB.consigne.etat, xB.consigne && xB.consigne.ligne]), b = JSON.stringify([xN.consigne && xN.consigne.etat, xN.consigne && xN.consigne.ligne]); if (a === b) egales++; else if (!diff) diff = { slug: xB.slug, B: a, N: b }; }
      if (diff) { div = { seance: sB.seance, semaine: sB.semaine, ...diff }; break; }
    }
  }
  out.V12.push({ profil: id, seancesB: L.length, premiereDivergence: div, consignesEgalesAvant: egales, consignesComparees: total });
  out.profils[id] = { seances: L.length, plans: nPlans, gardeApp: garde, verifierPlanEchantillonne: mon, v11, voixTextes: nVoix };
});
fs.writeFileSync('/home/claude/nuit/audit-fil/verifs-B.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.profils, null, 1)); console.log('V12', JSON.stringify(out.V12.map((x) => [x.profil, x.seancesB, x.premiereDivergence && x.premiereDivergence.seance, x.consignesEgalesAvant + '/' + x.consignesComparees]))); console.log('V6 B', out.V6.length, 'V11', out.V11.length);
