/** @jest-environment node */
//
// 201 — LE « POURQUOI » DIT D'OÙ ÇA VIENT : `x.pourquoi.sources`, posé par le plan (les clés de règle qu'il applique), lu au registre
// `SOURCES` du moteur. Le cas de la maquette : 132,5 kg × 4 puis des reculs → la table de Tuchscherer et Barbell Medicine (coachs),
// Reynolds 2006 (étude), la zone (convention). Pas de source : pas de ligne.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

function seance(reculs, repsGrosse, repsRecul) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'sq', id, { series: 1 + reculs });
  se.exercices[0].series.forEach((s, i) => {
    if (i >= 1) { s.type_serie = 'recul'; s.reps_visees = repsRecul; } else s.reps_visees = repsGrosse;
  });
  return se;
}
function entrees(se, palier, repsGrosse, zone) {
  const consigne = { etat: 'progression', zone: zone === undefined ? 'lourd' : zone, palier: palier, n: 1, ligne: { charge: palier, vise: repsGrosse }, haut: null };
  return {
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { sq: { consigne: consigne, contexte: { cran: palier + 2.5, haut: null } } },
    reglage: 'franc', paris: [],
    catalogue: { sq: { equipement: 'barre', mesure: 'charge_reps', pas: 2.5 } }
  };
}

describe('201 — « D\'où ça vient » au Pourquoi', () => {
  test('recul sur le max du jour : coachs + Reynolds 2006 + la zone en convention, sans doublon, avec étiquettes', () => {
    const e = entrees(seance(2, 4, 8), 132.5, 4);
    const p = T.planDeSeance(e);
    const src = p.exercices[0].pourquoi.sources;
    expect(src.map((s) => s.etiquette)).toEqual(expect.arrayContaining(['Pratique de coachs', 'Étude', 'Convention']));
    expect(src.some((s) => /Tuchscherer/.test(s.texte) && s.type === 'coachs')).toBe(true);
    expect(src.some((s) => s.auteur === 'Reynolds' && s.annee === 2006 && /70 personnes/.test(s.effectif))).toBe(true);
    expect(src.some((s) => /fourchettes de reps/.test(s.texte) && s.type === 'convention')).toBe(true);
    expect(new Set(src.map((s) => s.texte)).size).toBe(src.length);
    // Lecture seule : le plan reste cohérent (invariants, phrases).
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    expect(T.verifierPhrases(p)).toEqual([]);
  });

  test('aucun texte de source du Pourquoi ne dit « prouvé », « garanti » ou « toujours »', () => {
    const p = T.planDeSeance(entrees(seance(2, 4, 8), 132.5, 4));
    p.exercices[0].pourquoi.sources.forEach((s) => expect(/prouv|garanti|toujours/i.test(s.texte)).toBe(false));
  });

  test('sans règle qui ait une source (pas de zone, pas de recul), pas de ligne « D\'où ça vient »', () => {
    const e = entrees(seance(0, 4, 8), 100, 4, null);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.pourquoi && x.pourquoi.sources).toBeUndefined();
  });
});

describe('201 — Profil › Les mots du coach', () => {
  const { profilEcran } = require('./aide-profil-ecran');
  test('la section existe sous « À propos », avec le compte des mots du lexique', () => {
    const r = profilEcran({ username: 'a' });
    const sec = r.section('LES MOTS DU COACH');
    expect(sec).toBeTruthy();
    expect(sec.groupe).toBe('À propos');   // 213 : « Les mots du coach » rejoint « À propos »
    expect(sec.lignes).toHaveLength(1);
    expect(sec.lignes[0].libelle).toBe('Les mots du coach');
    expect(sec.lignes[0].sous).toBe(M.lexique().length + ' mots, une phrase chacun');
  });
});
