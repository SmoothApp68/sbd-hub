'use strict';
// V7 (ordre) : à graine égale, Franc >= Normal >= Prudent en vitesse moyenne (tolérance 1 cran) ; sèche <= maintien ; haut du corps <= bas.
// Expérience appariée : même identité (donc mêmes tirages), un seul paramètre change.
const { PROFILS } = require('./profils.js'); const { jouerProfil } = require('./pilote-moteur.js');
const BASES = ['P10', 'P08', 'P01', 'P02', 'P05'];
const GRANDS = /^(squat_barre|developpe_couche_barre|developpe_couche_haltere|souleve_de_terre_barre|developpe_militaire_barre|developpe_militaire_haltere|rowing_penche_barre|hip_thrust_barre|presse_a_cuisses)$/;
const BAS = /squat|presse_a|souleve|hip_thrust/;
function vitesse(lignes, sel) {
  const par = {};
  lignes.forEach((s) => s.exos.forEach((x) => { if (x.consigne && x.consigne.ligne && x.consigne.ligne.charge > 0 && GRANDS.test(x.slug) && sel(x.slug)) (par[x.slug] = par[x.slug] || []).push(x.consigne.ligne.charge * (1 + x.consigne.ligne.vise / 30)); }));
  const v = Object.values(par).filter((L) => L.length >= 8).map((L) => { const a = L.slice(1, 4), b = L.slice(-3); return (b.reduce((t, u) => t + u, 0) / 3) / (a.reduce((t, u) => t + u, 0) / 3) - 1; });
  return v.length ? v.reduce((t, u) => t + u, 0) / v.length * 100 : null;
}
const out = [];
BASES.forEach((id) => {
  const base = PROFILS.find((p) => p.id === id);
  [1, 2].forEach((g) => {
    const res = {};
    ['P', 'N', 'F'].forEach((rg) => { const p = Object.assign({}, base, { reglage: rg }); res['reglage_' + rg] = vitesse(jouerProfil(p, g, 16).lignes, () => true); });
    ['maintien', 'seche', 'masse'].forEach((ph) => { const p = Object.assign({}, base, { phase: ph }); res['phase_' + ph] = vitesse(jouerProfil(p, g, 16).lignes, () => true); });
    const l = jouerProfil(base, g, 16).lignes; res.haut = vitesse(l, (s) => !BAS.test(s)); res.bas = vitesse(l, (s) => BAS.test(s));
    out.push({ profil: id, graine: g, base: { reglage: base.reglage, phase: base.phase, anciennete: base.anciennete }, res });
    console.log(id, g, JSON.stringify(res));
  });
});
require('fs').writeFileSync('/home/claude/nuit/audit-fil/ordre-reglages.json', JSON.stringify(out, null, 1));
