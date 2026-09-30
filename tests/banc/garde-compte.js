// tests/banc/garde-compte.js — « 7 G bis. LA GARDE DU BANC — LE COMPTE ».
//
// Le compte de la garde porte sur TOUT le banc : combien de plans le crochet a
// vérifiés, dans quelles sections, et si chaque section où l'app a calculé un
// plan a bien été vérifiée. Le banc séquentiel le fait à sa section 7 G bis ;
// le lanceur parallèle (`seance-rapide.js`) le refait sur le compte FUSIONNÉ
// des groupes — les mêmes contrôles, par la même fonction, sur les mêmes
// chiffres. Une seule règle, donc un seul endroit.

const SECTION_GARDE_APP = '7 G. LA GARDE DU COACH DANS L’APP (49-U7)';
const ANCIENNES = /^[0-6]|^7 (bis|ter|quater|quinquies|sexies|septies|octies|nonies|undecies)\./;

// `garde` : `{ plans, violations, rapports, liste, sections: { [nom]: { verifies, app, violations } } }`.
function compteDeLaGarde(garde) {
  const sections = garde.sections || {};
  const noms = Object.keys(sections);
  const sansVerif = noms.filter((n) => sections[n].app > 0 && sections[n].verifies === 0 &&
    n !== SECTION_GARDE_APP);
  const avecPlans = noms.filter((n) => sections[n].verifies > 0);
  const totalApp = noms.reduce((t, n) => t + sections[n].app, 0);
  const controles = [
    { nom: '[garde] chaque section où l’app a calculé un plan a été vérifiée par le crochet',
      ok: sansVerif.length === 0, detail: JSON.stringify(sansVerif) },
    { nom: '[garde] le crochet a vu des plans dans les sections ANCIENNES, pas seulement celles du chantier 49',
      ok: avecPlans.filter((n) => ANCIENNES.test(n)).length >= 5, detail: JSON.stringify(avecPlans.slice(0, 8)) }
  ];
  const lignes = ['   ' + garde.plans + ' plans vérifiés par le crochet, dans ' + avecPlans.length + ' sections · ' +
    totalApp + ' plans vérifiés par la garde de l’app · ' + garde.violations + ' violation(s) · ' +
    (garde.rapports || []).length + ' « I10 suite » rapportée(s)'];
  (garde.liste || []).forEach((v) => lignes.push('   ⚠️ ' + v.section + ' · après « ' + v.geste + ' » · ' +
    v.quoi + ' · ' + JSON.stringify((v.erreurs || []).slice(0, 2))));
  (garde.rapports || []).slice(0, 10).forEach((x) => lignes.push('   ℹ️ rapporté — ' + x));
  return { controles, lignes, plans: garde.plans, planApp: totalApp, sectionsAvecPlans: avecPlans.length };
}

// Fusionne les comptes de plusieurs groupes. Une section n'appartient qu'à un
// groupe ; le préambule, lui, est rejoué par chacun : ses nombres s'ajoutent.
function fusionnerGardes(gardes) {
  const f = { plans: 0, violations: 0, rapports: [], liste: [], sections: {} };
  gardes.forEach((g) => {
    if (!g) return;
    f.plans += g.plans || 0;
    f.violations += g.violations || 0;
    f.rapports = f.rapports.concat(g.rapports || []);
    f.liste = f.liste.concat(g.liste || []);
    Object.keys(g.sections || {}).forEach((n) => {
      const s = g.sections[n];
      const d = f.sections[n] || (f.sections[n] = { verifies: 0, app: 0, violations: 0 });
      d.verifies += s.verifies || 0; d.app += s.app || 0; d.violations += s.violations || 0;
    });
  });
  return f;
}

module.exports = { compteDeLaGarde, fusionnerGardes };
