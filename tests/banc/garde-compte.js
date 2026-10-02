// tests/banc/garde-compte.js — « 7 G bis. LA GARDE DU BANC — LE COMPTE ».
//
// Le compte de la garde porte sur TOUT le banc : combien de plans le crochet a
// vérifiés, dans quelles sections, et si chaque section où l'app a calculé un
// plan a bien été vérifiée. Le banc séquentiel le fait à sa section 7 G bis ;
// le lanceur parallèle (`seance-rapide.js`) le refait sur le compte FUSIONNÉ
// des groupes — les mêmes contrôles, par la même fonction, sur les mêmes
// chiffres. Une seule règle, donc un seul endroit.

const fs = require('fs');
const path = require('path');

const SECTION_GARDE_APP = '7 G. LA GARDE DU COACH DANS L’APP (49-U7)';

// I26 (MOTEUR §20 bis, 49-U19) — LA LISTE D'ATTENTE des écarts de cohérence
// des phrases : les fichiers de cas (`cas`, le test unitaire) et le banc
// (`banc`, ici). Un écart nouveau fait échouer le compte ; un écart de la liste
// qui ne se produit plus aussi (il se retire, dans la PR qui le tranche). Le
// compte ne tourne que sur le banc COMPLET (séquentiel, ou parallèle fusionné) :
// un banc réduit ne dit rien des écarts qu'il n'a pas joués.
// Régénérer la part du banc : ECRIRE_ATTENTE_BANC=1, sur le banc complet.
const FICHIER_ATTENTE = path.join(__dirname, '..', 'unit', 'fixtures', 'attente-coherence-phrases.json');
// L'identité d'un écart — sa cause et son endroit, pas son texte (PR 7) — et
// sa lecture : partagées avec le test des cas.
const { cleDEcart, lectureDe } = require('../i26-ecarts.js');
const parCle = (a, b) => (cleDEcart(a) < cleDEcart(b) ? -1 : cleDEcart(a) > cleDEcart(b) ? 1 : 0);
function lireAttente() { return JSON.parse(fs.readFileSync(FICHIER_ATTENTE, 'utf8')); }
function ecrireAttente(o) {
  const tete = Object.keys(o).filter((k) => k !== 'cas' && k !== 'banc')
    .map((k) => ' ' + JSON.stringify(k) + ': ' + JSON.stringify(o[k]));
  const bloc = (k) => ' ' + JSON.stringify(k) + ': [\n' + (o[k] || []).map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n ]';
  fs.writeFileSync(FICHIER_ATTENTE, '{\n' + tete.concat([bloc('cas'), bloc('banc')]).join(',\n') + '\n}\n');
}
function comparerPhrases(garde) {
  // Le préambule, rejoué par chaque groupe, voit les mêmes écarts : une fois.
  const uniques = new Map();
  (garde.phrases || []).forEach((e) => { if (!uniques.has(cleDEcart(e))) uniques.set(cleDEcart(e), e); });
  const vues = Array.from(uniques.values()).sort(parCle)
    .map((e) => Object.assign({}, e, { lecture: lectureDe(e) }));
  if (process.env.ECRIRE_ATTENTE_BANC === '1') {
    const a = lireAttente();
    a.banc = vues;
    ecrireAttente(a);
  }
  const attente = lireAttente().banc || [];
  const connus = new Set(attente.map(cleDEcart));
  const trouves = new Set(vues.map(cleDEcart));
  return {
    vues,
    nouveaux: vues.filter((e) => !connus.has(cleDEcart(e))),
    disparus: attente.filter((e) => !trouves.has(cleDEcart(e)))
  };
}
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
  const ph = comparerPhrases(garde);
  controles.push(
    { nom: '[garde] I26 (rapport) — aucun écart de cohérence des phrases hors de la liste d’attente',
      ok: ph.nouveaux.length === 0, detail: JSON.stringify(ph.nouveaux.slice(0, 3)) },
    { nom: '[garde] I26 (rapport) — aucun écart de la liste d’attente disparu',
      ok: ph.disparus.length === 0, detail: JSON.stringify(ph.disparus.slice(0, 3)) });
  const lignes = ['   ' + garde.plans + ' plans vérifiés par le crochet, dans ' + avecPlans.length + ' sections · ' +
    totalApp + ' plans vérifiés par la garde de l’app · ' + garde.violations + ' violation(s) · ' +
    (garde.rapports || []).length + ' « I10 suite » rapportée(s) · ' + ph.vues.length + ' écart(s) I26 (rapport)'];
  (garde.liste || []).forEach((v) => lignes.push('   ⚠️ ' + v.section + ' · après « ' + v.geste + ' » · ' +
    v.quoi + ' · ' + JSON.stringify((v.erreurs || []).slice(0, 2))));
  (garde.rapports || []).slice(0, 10).forEach((x) => lignes.push('   ℹ️ rapporté — ' + x));
  return { controles, lignes, plans: garde.plans, planApp: totalApp, sectionsAvecPlans: avecPlans.length };
}

// Fusionne les comptes de plusieurs groupes. Une section n'appartient qu'à un
// groupe ; le préambule, lui, est rejoué par chacun : ses nombres s'ajoutent.
function fusionnerGardes(gardes) {
  const f = { plans: 0, violations: 0, rapports: [], phrases: [], liste: [], sections: {} };
  gardes.forEach((g) => {
    if (!g) return;
    f.plans += g.plans || 0;
    f.violations += g.violations || 0;
    f.rapports = f.rapports.concat(g.rapports || []);
    f.phrases = f.phrases.concat(g.phrases || []);
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
