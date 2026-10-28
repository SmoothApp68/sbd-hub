'use strict';
// V12 — concordance N <-> B. Les gestes de la personne sont ceux de B (script), le moteur et le plan sont ceux de N : la consigne reçue
// par exercice doit être la même (état + ligne). Les cartes répondues en B (N ne répond jamais) font diverger l'historique : on s'arrête
// à la première séance qui en porte une.   node concordance.js [DOSSIER_B]
const fs = require('fs'); const path = require('path');
const { PROFILS } = require('./profils.js'); const { jouerProfil } = require('./pilote-moteur.js');
const dB = process.argv[2] || '/home/claude/nuit/audit-fil/simulation-B';
const res = [];
fs.readdirSync(dB).filter((f) => /\.jsonl$/.test(f)).forEach((f) => {
  const B = fs.readFileSync(path.join(dB, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); if (!B.length) return;
  const profil = PROFILS.find((p) => p.id === B[0].profil);
  const script = {}; B.forEach((s) => { script[s.seance] = {}; s.exos.forEach((x) => { script[s.seance][x.slug] = x.fait.map((q) => ({ kg: q.kg, reps: q.reps, ratee: q.ratee, notee: q.notee })); }); });
  const semaines = Math.max.apply(null, B.map((s) => s.semaine));
  const N = jouerProfil(profil, B[0].graine, semaines, { script, sansDepart: true }).lignes;
  let comparees = 0, egales = 0, premiere = null, avantCarte = true, arret = null;
  for (const sB of B) {
    const cartesQuiComptent = (sB.cartes || []).filter((c) => c.type !== 'proposition-chauffes'); if (cartesQuiComptent.length && avantCarte) { arret = { seance: sB.seance, raison: 'cartes répondues en B (' + cartesQuiComptent.map((c) => c.type).join(',') + ')' }; avantCarte = false; }
    if (!avantCarte) break;
    const sN = N.find((q) => q.seance === sB.seance); if (!sN) { premiere = premiere || { seance: sB.seance, raison: 'séance absente de N' }; break; }
    for (const xB of sB.exos) {
      const xN = sN.exos.find((q) => q.slug === xB.slug); comparees++;
      const a = JSON.stringify([xB.consigne && xB.consigne.etat, xB.consigne && xB.consigne.ligne, xB.consigne && xB.consigne.haut]);
      const b = xN ? JSON.stringify([xN.consigne && xN.consigne.etat, xN.consigne && xN.consigne.ligne, xN.consigne && xN.consigne.haut]) : 'absent';
      if (a === b) egales++; else if (!premiere) premiere = { seance: sB.seance, semaine: sB.semaine, slug: xB.slug, B: a, N: b };
    }
  }
  res.push({ profil: B[0].profil, graine: B[0].graine, seancesB: B.length, comparees, egales, premiereDivergence: premiere, arret });
  console.log(B[0].profil, comparees, egales, JSON.stringify(premiere), JSON.stringify(arret));
});
fs.writeFileSync('/home/claude/nuit/audit-fil/concordance-NB.json', JSON.stringify(res, null, 1));
