/** @jest-environment node */
//
// Tri des 7 erreurs de `verifierPlan` sur main (25/11/2026), corrigées le 26/11/2026 (nuit-2) :
//   · I255 (×4) — le vérificateur exigeait « ligne = niveau » ; la spec dit « jamais au-dessus du niveau » ;
//   · I252 (×2) — le vérificateur bornait `effortVise.vise` au haut de la zone : la consigne REÇUE (etirement, zero_rep…) vise légitimement au-dessus ;
//   · I272 (×1, affichée) — une garde dont la ligne est sous la cible d'avant disait « Je garde … » sans dire la baisse : verbe `borne` + « Ta cible passe à … ».
// Histoires figées h79 et h82 (tests/unit/fixtures/tri-*.json) : UNE séance rejouée, indépendante du banc.

process.env.TZ = 'Europe/Paris';
global.self = global;
['modele', 'palier', 'semaine', 'profil', 'periode', 'generateur', 'bilan'].forEach((f) => require('../../v2/js/' + f + '.js'));
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
['reserve', 'plan', 'faits'].forEach((f) => { try { require('../../v2/js/' + f + '.js'); } catch (e) { /* module absent */ } });
const T = require('../../v2/js/plan.js');
const sp = (t) => String(t == null ? '' : t).replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

const CAT = { squat: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] } };
function rejouer(fichier) {
  const J = require('./fixtures/' + fichier), H = J.H;
  const o = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: H.reglage, edition: false, debutant: H.debutant, protegee: H.protegee || H.debutant, correction: H.zone };
  const R = M.consigneDExercice(J.groupes, undefined, J.avant, o);
  let n = 0; const id = () => 'q' + (++n);
  let se = S.creer({ id: 'SX', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, H.slug, id, { series: H.nseries });
  const e = { seance: { id: 'SX', debut: J.avant, edition: false, exercices: se.exercices }, consignes: { [H.slug]: R }, paris: [], suites: {}, reglage: H.reglage, objectif: H.protegee ? 'forme' : 'muscle', debutant: H.debutant, parisRates: {}, catalogue: CAT };
  const p = T.planDeSeance(e);
  return { k: R.consigne, x: p.exercices[0], erreurs: (T.verifierPlan(p, e).erreurs || []).map(String) };
}

describe('I255 — « jamais au-dessus du niveau » (plafond, pas égalité)', () => {
  const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail' });
  const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();
  const seance = (i, series) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j + 1, rpe: null, ressenti: null, exercise_slug: 'squat', validee_a: jour(i), session_id: 'H' + i, source: 'app' }, s)) });
  function jouer(zone, niv) {
    const b = () => [g(100, niv), g(100, niv), g(100, niv)], l = () => [g(92.5, niv), g(92.5, niv), g(92.5, niv)];
    const liste = [b(), b(), b(), [g(100, 0, 'echec'), g(100, 0), g(100, 0)], l()];
    const avant = new Date(Date.parse(jour(liste.length - 1)) + 4 * 864e5).toISOString();
    const R = M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined, avant, { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false, correction: zone });
    let n = 0; const id = () => 'q' + (++n);
    let se = S.creer({ id: 'SX', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat', id, { series: 3 });
    const e = { seance: { id: 'SX', debut: avant, edition: false, exercices: se.exercices }, consignes: { squat: R }, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: false, parisRates: {}, catalogue: CAT };
    const p = T.planDeSeance(e);
    return { k: R.consigne, erreurs: (T.verifierPlan(p, e).erreurs || []).map(String), p, e };
  }
  test.each([['volume', 13, 12], ['lourd', 6, 5]])('zone %s : niveau %i au-dessus du haut, retour à %i : aucune erreur I255', (zone, niv, vise) => {
    const r = jouer(zone, niv);
    expect(r.k.etat).toBe('retour_jour_sans');
    expect(r.k.niveau).toBe(niv);
    expect(r.k.ligne.vise).toBe(vise);
    expect(r.erreurs.filter((s) => /^I255/.test(s))).toEqual([]);
  });
  test('le plafond tient encore : une ligne AU-DESSUS du niveau est refusée', () => {
    const r = jouer('volume', 13);
    r.p.exercices[0].consigne.ligne.vise = 14;
    expect(T.verifierPlan(r.p, r.e).erreurs.join('|')).toMatch(/I255.*jamais au-dessus du niveau d’avant/);
  });
});

describe('I252 — la consigne reçue peut viser au-dessus du haut de la zone (vérificateur relâché)', () => {
  test('h82 (protégé, etirement 8 reçu, zone Lourd haut 5) : plus aucune erreur I252', () => {
    const r = rejouer('tri-h82-etirement-vise-haut.json');
    expect(r.k.fondement.effortVise.vise).toBeGreaterThan(5);
    expect(r.erreurs.filter((s) => /^I252/.test(s))).toEqual([]);
  });
  test('h79 (zero_rep 7 reçu, zone Lourd haut 5) : plus aucune erreur I252, la visée n’est PAS bornée', () => {
    const r = rejouer('tri-h79-garde-cible-baisse.json');
    expect(r.k.fondement.effortVise.vise).toBe(7);
    expect(r.erreurs.filter((s) => /^I252/.test(s))).toEqual([]);
  });
});
