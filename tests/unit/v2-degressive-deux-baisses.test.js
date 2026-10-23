/** @jest-environment node */
//
// 151 — LA DÉGRESSIVE À DEUX BAISSES (MOTEUR §9.15.3, I17 étendu ; décision d'Aurélien du 23/10/2026).
// La routine ou l'utilisateur pose jusqu'à deux lignes dégressives ; le coach remplit la seconde à −20 % de la
// première (cran inférieur de la salle), « Vise 4 à 6 », sans repos. Elle s'arrête si la première est validée sous 4
// reps ; à la barre lourde, une seule baisse ; une troisième ligne n'est jamais remplie (et le dit). Le coach n'en
// ajoute jamais : la dégressive qu'il propose (§14.8) reste à une baisse.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');

const NB = ' ';
const DEBUT = '2026-10-23T10:00:00+00:00';
const CATALOGUE = {
  curl_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['biceps'] },
  squat_barre: { equipement: 'barre', mesure: 'charge_reps', mouvement: 'squat', muscles_primaires: ['quadriceps'] },
  curl_biceps_barre_ez: { equipement: 'barre', mesure: 'charge_reps', mouvement: 'curl', muscles_primaires: ['biceps'] }
};
const second = (der, extra) => M.degressiveDe(Object.assign({ rang: 2, equipement: 'poulie', derniere_serie: der, reps_travail: 15 }, extra));

describe('151 — la seconde baisse, au moteur', () => {
  test('curl poulie 30 × 15 : 22,5 puis 17,5 (crans de 2,5), « Vise 4 à 6 », sans repos', () => {
    const a = M.degressiveDe({ equipement: 'poulie', derniere_serie: 30, reps_travail: 15 });
    expect(a.charge).toBe(22.5);
    const b = second(a.charge);
    expect(b.charge).toBe(17.5);
    expect(b.vise).toEqual([4, 6]);
    expect(b.repos).toBe(0);
    expect(b.phrase).toBe('Deuxième baisse : 17,5' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 4 à 6.');
  });

  test('DISCRIMINANT — −20 % et non −22,5 % : 45 → 35 (et non 32,5)', () => {
    expect(second(45).charge).toBe(35);
    expect(M.degressiveDe({ equipement: 'poulie', derniere_serie: 45, reps_travail: 15 }).charge).toBe(32.5);
  });

  test('haltères de la salle : la paire au cran inférieur (2 × 18 → 2 × 14)', () => {
    const salle = { materiel: 'halteres', charges: [] };
    for (let h = 1; h <= 20; h += (h < 10 ? 1 : 2)) salle.charges.push(2 * h);
    const a = M.degressiveDe({ equipement: 'haltere', derniere_serie: 48, reps_travail: 12, salle });
    expect(a.charge).toBe(36);
    const b = M.degressiveDe({ rang: 2, equipement: 'haltere', derniere_serie: a.charge, reps_travail: 12, salle });
    expect(b.charge).toBe(28);
    expect(b.phrase).toBe('Deuxième baisse : 28' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 4 à 6.');
  });

  test('barre fixe déclarée : la barre du cran inférieur (30 → 20 → 15 ; −20 % de 20 = 16)', () => {
    const salle = { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] };
    const a = M.degressiveDe({ equipement: 'barre', derniere_serie: 30, reps_travail: 12, salle });
    expect(a.charge).toBe(20);
    const b = M.degressiveDe({ rang: 2, equipement: 'barre', derniere_serie: 20, reps_travail: 12, salle });
    expect(b.charge).toBe(15);
    expect(b.phrase).toBe('Prends la barre de 15' + NB + 'kg. Sans repos, jusqu\'à l\'échec. Vise 4 à 6.');
  });

  test('la chaîne s\'arrête sous 4 reps (le nombre réel) ; à 4, la seconde est remplie', () => {
    const arret = second(22.5, { reps_premiere: 3 });
    expect(arret.charge).toBeNull();
    expect(arret.phrase).toBe('3 reps à la première baisse : on s\'arrête là.');
    expect(arret.gestes).toEqual(['serie_normale', 'retirer']);
    expect(second(22.5, { reps_premiere: 1 }).phrase).toBe('1 rep à la première baisse : on s\'arrête là.');
    expect(second(22.5, { reps_premiere: 4 }).charge).toBe(17.5);
  });

  test('barre lourde : une seule baisse ; troisième ligne : deux au plus ; jamais vide en silence', () => {
    const l = second(120, { lourde: true });
    expect(l.charge).toBeNull();
    expect(l.phrase).toBe('À la barre lourde, une seule baisse.');
    expect(l.gestes).toEqual(['serie_normale', 'retirer']);
    const t = M.degressiveDe({ rang: 3, equipement: 'poulie', derniere_serie: 17.5, reps_travail: 15 });
    expect(t.charge).toBeNull();
    expect(t.phrase).toBe('Deux baisses au plus : une troisième fatigue sans rien ajouter.');
    expect(t.gestes).toEqual(['serie_normale', 'retirer']);
    expect(M.degressiveDe({ rang: 3, lourde: true, equipement: 'barre', derniere_serie: 100 }).phrase).toBe('À la barre lourde, une seule baisse.');
  });

  test('la première baisse ne change pas (sans rang : −22,5 %)', () => {
    expect(M.degressiveDe({ equipement: 'poulie', derniere_serie: 30, reps_travail: 15 }).phrase)
      .toBe('Dégressive : 22,5' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 6 à 8.');
  });
});

// ── dans le plan ───────────────────────────────────────────────────────────────────────────────────────────────
function seanceDe(slug, nDeg) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: 1 });
  for (let i = 0; i < nDeg; i++) {
    se = S.ajouterSerie(se, 0, id);
    const j = se.exercices[0].series.findIndex((x) => x.id === 's' + k);
    se = S.changerType(se, 0, j, 'degressive');
  }
  return se;
}
const valider = (se, j, charge, reps) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: charge, reps: reps }), 0, j, new Date(DEBUT));
const entrees = (se, slug, extra) => Object.assign({ seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
  consignes: { [slug]: null }, catalogue: CATALOGUE, reglage: 'normal', paris: [], suites: {} }, extra);
const planDe = (se, slug, extra) => { const e = entrees(se, slug, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0] }; };

describe('151 — dans le plan', () => {
  test('curl poulie, deux lignes dégressives : la seconde est proposée à −20 % de la première, « Vise 4 à 6 », 5 reps pré-remplies', () => {
    let se = seanceDe('curl_poulie', 2);
    se = valider(se, 0, 30, 15);
    const { e, p, x } = planDe(se, 'curl_poulie');
    expect(x.degressive.charge).toBe(22.5);
    expect(x.degressivesPlus).toHaveLength(1);
    const d2 = x.degressivesPlus[0];
    expect([d2.iSerie, d2.apres, d2.rang, d2.reference, d2.charge, d2.repos]).toEqual([2, 1, 2, 22.5, 17.5, 0]);
    expect(d2.phrase).toBe('Deuxième baisse : 17,5' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 4 à 6.');
    expect(x.lignes[2].fantome).toEqual({ charge: 17.5, reps: null, source: 'degressive' });
    expect(x.lignes[2].degressive.vise).toEqual([4, 6]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('sans repos : le minuteur ne démarre pas après la première baisse validée', () => {
    let se = seanceDe('curl_poulie', 2);
    se = valider(se, 0, 30, 15);
    const { x } = planDe(se, 'curl_poulie');
    expect(T.reposApres(x, 0, 90)).toBeNull();
    expect(T.reposApres(x, 1, 90)).toBeNull();     // 1 : la première baisse, la seconde suit sans repos
    expect(T.reposApres(x, 2, 90)).toBe(90);
  });

  test('la première validée à 3 reps : la seconde n\'est pas remplie, « on s\'arrête là » et les deux gestes', () => {
    let se = seanceDe('curl_poulie', 2);
    se = valider(se, 0, 30, 15);
    se = valider(se, 1, 22.5, 3);
    const { e, p, x } = planDe(se, 'curl_poulie');
    const d2 = x.degressivesPlus[0];
    expect(d2.charge).toBeNull();
    expect(d2.phrase).toBe('3 reps à la première baisse : on s\'arrête là.');
    expect(d2.gestes).toEqual(['serie_normale', 'retirer']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    // À 4 reps : remplie, sur la charge réellement faite.
    let se4 = valider(valider(seanceDe('curl_poulie', 2), 0, 30, 15), 1, 20, 4);
    const r4 = planDe(se4, 'curl_poulie');
    expect(r4.x.degressivesPlus[0].charge).toBe(15);
    expect(r4.x.degressivesPlus[0].reference).toBe(20);
    expect(T.verifierPlan(r4.p, r4.e).erreurs).toEqual([]);
  });

  test('squat (barre lourde) avec deux dégressives : la première se remplit, la seconde dit « une seule baisse »', () => {
    let se = seanceDe('squat_barre', 2);
    se = valider(se, 0, 140, 6);
    const { e, p, x } = planDe(se, 'squat_barre');
    expect(x.degressive.charge).not.toBeNull();
    const d2 = x.degressivesPlus[0];
    expect(d2.charge).toBeNull();
    expect(d2.phrase).toBe('À la barre lourde, une seule baisse.');
    expect(d2.gestes).toEqual(['serie_normale', 'retirer']);
    expect(x.lignes[2].fantome.charge).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('une troisième ligne : « Deux baisses au plus… », jamais de charge ; toutes les lignes en trop', () => {
    let se = seanceDe('curl_poulie', 4);
    se = valider(se, 0, 30, 15);
    const { e, p, x } = planDe(se, 'curl_poulie');
    expect(x.degressivesPlus.map((q) => [q.rang, q.charge])).toEqual([[2, 17.5], [3, null], [4, null]]);
    expect(x.degressivesPlus[1].phrase).toBe('Deux baisses au plus : une troisième fatigue sans rien ajouter.');
    expect(x.degressivesPlus[2].gestes).toEqual(['serie_normale', 'retirer']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('une seule ligne dégressive : rien ne change (pas de degressivesPlus)', () => {
    let se = seanceDe('curl_poulie', 1);
    se = valider(se, 0, 30, 15);
    const { x } = planDe(se, 'curl_poulie');
    expect(x.degressivesPlus || null).toBeNull();
    expect(x.degressive.charge).toBe(22.5);
  });

  test('« Juste un carnet » (Entretenir) : aucune baisse remplie, ni la première, ni la seconde (I13)', () => {
    let se = seanceDe('curl_poulie', 2);
    se = valider(se, 0, 30, 15);
    const e = entrees(se, 'curl_poulie', { intention: 'entretien' });
    const x = T.planDeSeance(e).exercices[0];
    expect(x.degressive || null).toBeNull();
    expect(x.degressivesPlus || null).toBeNull();
  });

  test('DISCRIMINANT I17 — une seconde baisse forgée à la barre lourde, ou une troisième remplie, est attrapée', () => {
    let se = seanceDe('curl_poulie', 3);
    se = valider(se, 0, 30, 15);
    const { e, p } = planDe(se, 'curl_poulie');
    const forge = JSON.parse(JSON.stringify(p));
    forge.exercices[0].degressivesPlus[1].charge = 10;
    forge.exercices[0].lignes[3].fantome = { charge: 10, reps: null, source: 'degressive' };
    expect(T.verifierPlan(forge, e).erreurs.join(' ')).toMatch(/I17/);
    const forge2 = JSON.parse(JSON.stringify(p));
    forge2.exercices[0].degressivesPlus[0].lourde = true;
    expect(T.verifierPlan(forge2, e).erreurs.join(' ')).toMatch(/I17.*barre lourde/);
    const forge3 = JSON.parse(JSON.stringify(p));
    forge3.exercices[0].degressivesPlus[0].premiereReps = 2;
    expect(T.verifierPlan(forge3, e).erreurs.join(' ')).toMatch(/I17.*2 reps/);
  });
});
