/** @jest-environment node */
//
// 20/11/2026 — LE REPOS CONSEILLÉ DE BASE (MOTEUR §9.52, I256 à I266).
//
//   · la règle pure (`Moteur.reposConseilleDeBase`) : la table, « près de l'échec », la semaine de test, le superset, le raccourci,
//     les bornes, le silence ; les familles ; les phrases et leurs formateurs (jamais `dureeEnMinutes`) ;
//   · les repos par défaut d'une routine (`Routines.reposParDefaut`) = la même base ;
//   · le plan : `x.reposConseille`, rien d'écrit, les chauffes intactes, des violations FORGÉES attrapées par `verifierPlan`.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
const Modele = require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const R = require('../../v2/js/routines.js');

const DEBUT = '2026-09-29T10:00:00+00:00';
const CAT = {
  squat_barre: { equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischio_jambiers', 'bas_du_dos'] },
  developpe_couche_barre: { equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  curl_barre: { equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['biceps'] },
  presse: { equipement: 'machine', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischio_jambiers'] },
  pompes: { equipement: 'poids_du_corps', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  traction_lestee: { equipement: 'poids_du_corps', mesure: 'charge_reps', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps', 'haut_du_dos'] },
  tirage_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps', 'haut_du_dos'] },
  ecarte_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['pectoraux'] },
  planche: { equipement: 'poids_du_corps', mesure: 'temps', muscles_primaires: ['abdominaux'] },
  trou_du_catalogue: { equipement: 'machine', mesure: 'charge_reps' }
};
const fam = (slug) => { const c = CAT[slug]; return M.familleDeRepos({ prim: c.muscles_primaires || [], sec: c.muscles_secondaires || [], stab: c.muscles_stabilisateurs || [], equipement: c.equipement }); };

describe('la famille propre au repos (≠ « grand mouvement » de la compression)', () => {
  test('grand = polyarticulaire à la barre ; poly = les autres (poids du corps, machines) ; isolation', () => {
    expect(fam('squat_barre')).toBe('grand');
    expect(fam('developpe_couche_barre')).toBe('grand');
    expect(fam('pompes')).toBe('poly');           // poids du corps : un polyarticulaire ordinaire
    expect(fam('traction_lestee')).toBe('poly');  // lestée ou non
    expect(fam('presse')).toBe('poly');           // machine lourde
    expect(fam('tirage_poulie')).toBe('poly');
    expect(fam('curl_barre')).toBe('isolation');  // à la barre, mais une isolation
    expect(fam('ecarte_poulie')).toBe('isolation');
    expect(fam('trou_du_catalogue')).toBeNull();  // aucun muscle : aucune famille
  });
  test('la compression garde SA notion : les pompes y sont encore « un grand mouvement »', () => {
    const c = CAT.pompes;
    expect(M.estGrandMouvement({ slug: 'pompes', prim: c.muscles_primaires, sec: c.muscles_secondaires, stab: [], equipement: c.equipement })).toBe(true);
  });
});

describe('la table : famille × P (≤ 6 · 7 à 12 · ≥ 13)', () => {
  const s = (famille, reps, garde) => M.reposConseilleDeBase({ famille, reps, garde: garde === undefined ? 2 : garde, series: 3 }).s;
  test('les neuf cases, aux bornes de P', () => {
    // garde 2 : P = reps + 2
    expect([s('grand', 4), s('grand', 5), s('grand', 10), s('grand', 11)]).toEqual([180, 150, 150, 150]);
    expect([s('poly', 4), s('poly', 5), s('poly', 10), s('poly', 11)]).toEqual([150, 120, 120, 120]);
    expect([s('isolation', 4), s('isolation', 5), s('isolation', 10), s('isolation', 11)]).toEqual([120, 90, 90, 90]);
  });
  test('P = 6, 7, 12, 13 exactement (reps seules, sans garde lisible)', () => {
    const p = (famille, reps) => M.reposConseilleDeBase({ famille, reps, garde: null, series: 3 }).s;
    expect([p('grand', 6), p('grand', 7), p('grand', 12), p('grand', 13)]).toEqual([180, 150, 150, 150]);
    expect([p('poly', 6), p('poly', 7)]).toEqual([150, 120]);
    expect([p('isolation', 6), p('isolation', 7), p('isolation', 13)]).toEqual([120, 90, 90]);
  });
  test('MONOTONIE : P plus bas ne donne jamais un repos plus court ; grand ≥ poly ≥ isolation (I257)', () => {
    for (let p = 1; p < 30; p++) {
      const b = (f, q) => M.baseDeRepos(f, q);
      ['grand', 'poly', 'isolation'].forEach((f) => expect(b(f, p)).toBeGreaterThanOrEqual(b(f, p + 1)));
      expect(b('grand', p) >= b('poly', p) && b('poly', p) >= b('isolation', p)).toBe(true);
    }
  });
});

describe('« près de l\'échec » : +30 s, une seule fois', () => {
  const r = (o) => M.reposConseilleDeBase(Object.assign({ famille: 'grand', reps: 3, garde: 1, series: 3 }, o));
  test('garde 0 : +30 s ; garde 1 avec 5 séries ou plus : +30 s ; garde 1 sur 4 séries : rien ; garde 2 : rien', () => {
    expect(r({ garde: 0 }).s).toBe(210);               // P = 3 : 3:00 + 30 s
    expect(r({ garde: 1, series: 5 }).s).toBe(210);
    expect(r({ garde: 1, series: 6 }).s).toBe(210);
    expect(r({ garde: 1, series: 4 }).s).toBe(180);
    expect(r({ garde: 2, series: 5 }).s).toBe(180);
    expect(r({ garde: null, series: 5 }).s).toBe(180);
  });
  test('jamais cumulé : garde 0 sur 5 séries = +30 s, pas +60', () => {
    expect(r({ garde: 0, series: 5 }).s).toBe(210);
    expect(r({ famille: 'isolation', reps: 12, garde: 0, series: 5 }).s).toBe(120);   // 1:30 + 30 s
  });
  test('la case dit pourquoi : `pres` (garde / séries) et `cas`', () => {
    expect(r({ garde: 0 })).toEqual(expect.objectContaining({ cas: 'pres_echec', pres: 'garde', base: 180 }));
    expect(r({ garde: 1, series: 5 })).toEqual(expect.objectContaining({ cas: 'pres_echec', pres: 'series' }));
    expect(r({ garde: 2 })).toEqual(expect.objectContaining({ cas: 'base', pres: null }));
  });
});

describe('la semaine de test, le raccourci, la décharge', () => {
  test('semaine de test : 4:00', () => {
    expect(M.reposConseilleDeBase({ famille: 'grand', reps: 1, garde: 0, series: 3, test: true })).toEqual(expect.objectContaining({ s: 240, cas: 'test' }));
  });
  test('« J\'ai peu de temps » : la valeur posée par le raccourci, aucun conseil au-dessus (I263)', () => {
    const o = { famille: 'isolation', reps: 12, garde: 2, series: 3, raccourci: true };
    expect(M.reposConseilleDeBase(Object.assign({ reposPose: 60 }, o))).toEqual(expect.objectContaining({ s: 60, cas: 'raccourci' }));
    expect(M.reposConseilleDeBase(Object.assign({ reposPose: 90 }, o)).s).toBeLessThanOrEqual(90);
    // Le raccourci ne touche jamais au repos d'un grand mouvement : il reste à sa base.
    expect(M.reposConseilleDeBase({ famille: 'grand', reps: 5, garde: 2, series: 3, raccourci: true, reposPose: null }).s).toBe(150);
    // Sans le raccourci, la valeur réglée n'est qu'un réglage : le conseil garde sa base.
    expect(M.reposConseilleDeBase(Object.assign({ reposPose: 60 }, o, { raccourci: false })).s).toBe(90);
  });
  test('décharge : la ligne allégée, sans « près de l\'échec », jamais plus long que le jour normal (I257)', () => {
    // Garde 2, 5 reps : P = 7 (2:30) ; la ligne allégée (3 reps) a P = 5, une cellule plus longue (3:00) : plafonnée à celle du jour normal.
    const o = { famille: 'grand', reps: 5, garde: 2, series: 5 };
    const normal = M.reposConseilleDeBase(o).s;
    const alle = M.reposConseilleDeBase(Object.assign({}, o, { reps: 3, allegee: { reps: 5 } })).s;
    expect(normal).toBe(150);
    expect(alle).toBe(150);
    // Garde 0 : le jour normal ajoute +30 s (3:30), la décharge non (3:00) — jamais plus long.
    const o0 = { famille: 'grand', reps: 5, garde: 0, series: 5 };
    expect(M.reposConseilleDeBase(o0).s).toBe(210);
    expect(M.reposConseilleDeBase(Object.assign({}, o0, { reps: 3, allegee: { reps: 5 } })).s).toBe(180);
  });
});

describe('le superset : le plus grand des repos de base − 60 s par autre membre, sur le dernier membre', () => {
  const tour = (membres, extra) => M.reposConseilleDeBase(Object.assign({ membres }, extra || {}));
  test('couché (2:30) + tirage poulie (2:00) = 2:30 − 60 s = 1:30', () => {
    const r = tour([{ famille: 'grand', reps: 8, garde: 1 }, { famille: 'poly', reps: 10, garde: 1 }]);
    expect(r).toEqual(expect.objectContaining({ s: 90, cas: 'superset', membres: 2 }));
  });
  test('deux grands à 3:00 : 2:00 ; trois membres : −120 s', () => {
    expect(tour([{ famille: 'grand', reps: 3, garde: 1 }, { famille: 'grand', reps: 3, garde: 1 }]).s).toBe(120);
    expect(tour([{ famille: 'grand', reps: 3, garde: 1 }, { famille: 'poly', reps: 3, garde: 1 }, { famille: 'isolation', reps: 3, garde: 1 }]).s).toBe(90);   // 3:00 − 120 s = 60 → plancher 1:30
  });
  test('jamais sous 1:30 ; l\'exercice sans reps n\'a pas de base mais compte comme membre', () => {
    expect(tour([{ famille: 'isolation', reps: 12, garde: 2 }, { famille: 'isolation', reps: 12, garde: 2 }]).s).toBe(90);
    expect(tour([{ famille: 'grand', reps: 5, garde: 2 }, { famille: 'poly', reps: null, garde: null }]).s).toBe(90);   // 2:30 − 60 = 1:30
  });
  test('le « près de l\'échec » n\'entre pas dans le superset (la base des membres seule)', () => {
    expect(tour([{ famille: 'grand', reps: 3, garde: 0 }, { famille: 'poly', reps: 10, garde: 0 }]).s).toBe(120);   // 3:00 − 60 = 2:00, pas 2:30
  });
});

describe('les bornes et le silence', () => {
  test('tout résultat (hors raccourci) est un cran de la molette, entre 1:30 / 2:00 et 4:00 (I258)', () => {
    ['grand', 'poly', 'isolation'].forEach((f) => {
      for (let reps = 1; reps <= 30; reps++) [0, 1, 2, null].forEach((g) => [3, 5, 6].forEach((n) => {
        const r = M.reposConseilleDeBase({ famille: f, reps, garde: g, series: n });
        expect(Modele.VALEURS_DE_REPOS).toContain(r.s);
        expect(r.s).toBeGreaterThanOrEqual(f === 'grand' ? 120 : 90);
        expect(r.s).toBeLessThanOrEqual(240);
      }));
    });
  });
  test('la liste des crans : 36 valeurs, 5 s jusqu\'à 2:00 puis 15 s jusqu\'à 5:00 — la même que celle de la molette', () => {
    expect(Modele.VALEURS_DE_REPOS).toHaveLength(36);
    expect(Modele.reposAuCran(100)).toBe(100);
    expect(Modele.reposAuCran(127)).toBe(120);
    expect(Modele.reposAuCran(128)).toBe(135);
    expect(Modele.reposAuCran(200)).toBe(195);     // 195 et 210 sont à 5 et 10 s
    expect(Modele.reposAuCran(173)).toBe(180);
    expect(Modele.reposAuCran(142.5)).toBe(150);   // à égalité, le plus long
    // La molette lit cette liste (une seule fois) : `rendu.js` ne la réécrit pas.
    const rendu = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(rendu).toMatch(/var VALEURS_REPOS = M\(\)\.VALEURS_DE_REPOS;/);
    expect(rendu).not.toMatch(/PAS_FIN|PAS_LARGE/);
  });
  test('silence : sans reps visées (une durée), sans famille', () => {
    expect(M.reposConseilleDeBase({ famille: 'grand', reps: null, garde: 1, series: 3 })).toBeNull();
    expect(M.reposConseilleDeBase({ famille: 'grand', reps: 0, garde: 1, series: 3 })).toBeNull();
    expect(M.reposConseilleDeBase({ famille: null, reps: 8, garde: 1, series: 3 })).toBeNull();
    expect(M.reposConseilleDeBase({})).toBeNull();
    expect(M.reposConseilleDeBase(null)).toBeNull();
  });
});

describe('les mots : « 3 min 30 », jamais « 4 min » (dureeEnMinutes arrondit)', () => {
  const phrase = (o, reps, garde, dite) => Modele.capturer(() => M.phraseDuReposConseille({ r: M.reposConseilleDeBase(o), reps, garde, gardeDite: dite })).texte;
  test('l\'écueil, figé : dureeEnMinutes(3,5) donne « 4 min », (2,5) « 3 min »', () => {
    expect(Modele.dureeEnMinutes(3.5)).toBe('4 min');
    expect(Modele.dureeEnMinutes(2.5)).toBe('3 min');
    expect(Modele.formatDuree(210)).toBe('3 min 30');
    expect(Modele.formatDuree(150)).toBe('2 min 30');
  });
  test('les exemples de la règle', () => {
    expect(phrase({ famille: 'grand', reps: 3, garde: 1, series: 5 }, 3, 1, true)).toBe('3 reps en gardant 1, sur 5 séries : je conseille 3 min 30 entre les séries.');
    expect(phrase({ famille: 'grand', reps: 10, garde: 1, series: 4 }, 10, 1, true)).toBe('10 reps en gardant 1 : je conseille 2 min 30 entre les séries.');
    expect(phrase({ famille: 'isolation', reps: 12, garde: 0, series: 3 }, 12, 0, true)).toBe('12 reps sans marge : je conseille 2 min entre les séries.');
    expect(phrase({ famille: 'grand', reps: 3, garde: 1, series: 3, test: true }, 3, 1, true)).toBe('Entre deux essais lourds, je conseille 4 min.');
    expect(phrase({ membres: [{ famille: 'grand', reps: 8, garde: 1 }, { famille: 'poly', reps: 10, garde: 1 }] })).toBe('2 exercices dans le tour : je conseille 1 min 30 entre les tours.');
  });
  test('la garde ne se dit que si elle est celle de la ligne affichée (I261)', () => {
    expect(phrase({ famille: 'grand', reps: 10, garde: 1, series: 3 }, 10, 1, false)).toBe('10 reps : je conseille 2 min 30 entre les séries.');
    expect(phrase({ famille: 'grand', reps: 10, garde: 1, series: 3 }, 10, 1, false)).not.toMatch(/gardant|marge/);
    expect(phrase({ famille: 'grand', reps: 1, garde: 2, series: 3 }, 1, 2, true)).toMatch(/^1 rep en gardant 2/);
  });
  test('la ligne du repos long (I76) garde le fait sans chiffre (I264)', () => {
    expect(M.phraseReposLong()).toBe('Sur un gros mouvement, ton repos réel est court ; le conseil est dans le minuteur.');
    expect(M.phraseReposLong()).not.toMatch(/\d/);
    expect(M.reposAConseiller({ grand: true, stagne: true, chutes: [0.35, 0.4, 0.31], reposS: 75 })).toBe(true);   // la règle I76 elle-même ne change pas
  });
});

describe('les repos par défaut d\'une routine = la base du conseil (I262)', () => {
  const muscles = (slug) => { const c = CAT[slug]; return { prim: c.muscles_primaires || [], sec: c.muscles_secondaires || [], stab: [], equipement: c.equipement }; };
  const travail = (reps) => [{ type_serie: 'travail', reps_visees: reps }];
  test('P = reps visées + 2 : la même fonction, la même valeur', () => {
    expect(R.REPOS_PAR_DEFAUT).toBeUndefined();
    expect(R.GARDE_DE_ROUTINE).toBe(2);
    ['squat_barre', 'pompes', 'presse', 'curl_barre'].forEach((slug) => {
      [3, 5, 8, 10, 12, 15].forEach((reps) => {
        const conseil = M.reposConseilleDeBase({ famille: fam(slug), reps, garde: 2, series: 3 }).s;
        expect(R.reposParDefaut(muscles(slug), travail(reps))).toBe(conseil);
        expect(conseil).toBe(M.baseDeRepos(fam(slug), reps + 2));
      });
    });
  });
  test('sans reps visées (une durée) ou sans muscle : aucun repos par défaut', () => {
    expect(R.reposParDefaut(muscles('planche'), [{ type_serie: 'travail', reps_visees: null }])).toBeNull();
    expect(R.reposParDefaut(muscles('trou_du_catalogue'), travail(8))).toBeNull();
    expect(R.reposParDefaut(muscles('squat_barre'), [{ type_serie: 'echauffement', reps_visees: null }])).toBeNull();
  });
  test('`routineDepuisSeance` passe par là ; une routine existante garde son repos', () => {
    const exercices = Object.keys(CAT).map((slug) => Object.assign({ slug, nom: slug }, CAT[slug]));
    const l = (slug, rang, reps) => ({ exercise_slug: slug, rang, type_serie: 'travail', reps, groupe_superset: null, occurrence: null });
    const r = R.routineDepuisSeance([l('squat_barre', 1, 5), l('curl_barre', 2, 10), l('pompes', 3, 20)], { titre: 'X', exercices, routines: [] });
    expect(r.exercices.map((e) => [e.exercise_slug, e.repos_cible_s, e.repos_origine])).toEqual([
      ['squat_barre', 150, 'par défaut'], ['curl_barre', 90, 'par défaut'], ['pompes', 120, 'par défaut']]);
    const connue = [{ nom: 'Lundi', modifiee_a: '2026-10-01T10:00:00Z', exercices: [{ exercise_slug: 'squat_barre', repos_cible_s: 100 }] }];
    const r2 = R.routineDepuisSeance([l('squat_barre', 1, 5)], { titre: 'X', exercices, routines: connue });
    expect(r2.exercices[0]).toEqual(expect.objectContaining({ repos_cible_s: 100, repos_origine: 'Lundi' }));
  });
});

// ── le plan ───────────────────────────────────────────────────────────────────────────────────────────────
let n = 0;
const id = () => 's' + (++n);
const consigne = (zone, charge, vise) => ({ etat: 'progression', zone, palier: charge, niveau: vise, n: 5, ligne: { charge, vise }, haut: null, fondement: {} });
// exos : [{ slug, zone, charge, vise, series, groupe, repos }]
function monter(exos, reglage, extra) {
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  exos.forEach((x) => { se = S.ajouterExercice(se, x.slug, id, { series: x.series === undefined ? 3 : x.series }); });
  se = Object.assign({}, se, { exercices: se.exercices.map((e, i) => Object.assign({}, e, exos[i].groupe ? { groupe_superset: exos[i].groupe } : {})) });
  exos.forEach((x, i) => { if (x.repos) se = S.definirReposCible(se, i, x.repos); });
  const consignes = {};
  exos.forEach((x) => {
    if (x.vise === null) { consignes[x.slug] = null; return; }   // une durée : le coach n'a pas de consigne
    const c = consigne(x.zone || 'lourd', x.charge || 100, x.vise); consignes[x.slug] = { consigne: c, libelles: M.libellesConsigne(c), pas: null };
  });
  const e = Object.assign({ seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes, catalogue: CAT, reglage: reglage === undefined ? null : reglage, paris: [], suites: {} }, extra || {});
  return { plan: T.planDeSeance(e), entrees: e, seance: se };
}
const erreurs = (m) => T.verifierPlan(m.plan, m.entrees).erreurs;

describe('le plan : `x.reposConseille`', () => {
  test('squat 5 × 3, garde 1 (Franc, zone Lourd) : 3:30, la phrase du coach, le plan est propre', () => {
    const m = monter([{ slug: 'squat_barre', vise: 3, series: 5 }], 'franc');
    const x = m.plan.exercices[0];
    expect(x.reposConseille).toEqual(expect.objectContaining({ s: 210, cas: 'pres_echec', famille: 'grand', gardeDite: true, entreLesTours: false }));
    expect(x.reposConseille.pourquoi).toBe('3 reps en gardant 1, sur 5 séries : je conseille 3 min 30 entre les séries.');
    expect(x.phrases.some((p) => p.ou === 'repos.conseil')).toBe(true);
    expect(erreurs(m)).toEqual([]);
  });
  test('squat 5 × 3, garde 2 (Normal) : 3:00, sans ajustement ; couché 3 × 10 garde 2 : 2:30', () => {
    const m = monter([{ slug: 'squat_barre', vise: 3, series: 5 }]);
    expect(m.plan.exercices[0].reposConseille.s).toBe(180);
    const m2 = monter([{ slug: 'developpe_couche_barre', zone: 'volume', vise: 10, series: 3 }]);
    expect(m2.plan.exercices[0].reposConseille.s).toBe(150);
    expect(erreurs(m)).toEqual([]);
    expect(erreurs(m2)).toEqual([]);
  });
  test('pompes (poids du corps) 3 × 20 : 2:00 — pas 2:30 (la famille propre au repos) ; curl : isolation', () => {
    const m = monter([{ slug: 'pompes', zone: 'volume', vise: 20, charge: 0, series: 3 }, { slug: 'curl_barre', zone: 'volume', vise: 12, series: 3 }]);
    expect(m.plan.exercices[0].reposConseille.famille).toBe('poly');
    expect(m.plan.exercices[0].reposConseille.s).toBe(120);
    expect(m.plan.exercices[1].reposConseille.famille).toBe('isolation');
    expect(m.plan.exercices[1].reposConseille.s).toBe(90);    // 12 reps, garde 1 : P = 13, isolation : 1:30 (3 séries : pas de « près de l'échec »)
  });
  test('la garde dite est celle de la visée affichée (jamais une autre)', () => {
    const m = monter([{ slug: 'squat_barre', zone: 'volume', vise: 12, series: 3 }], 'franc');
    const x = m.plan.exercices[0];
    expect(x.gardeDeLigne).toBe(x.reserveAffichee);
    expect(x.reposConseille.gardeDite).toBe(true);
    expect(x.reposConseille.pourquoi).toMatch(/sans marge/);
    expect(erreurs(m)).toEqual([]);
  });
  test('un superset : le conseil vit sur le dernier membre, −60 s ; l\'autre n\'en a pas', () => {
    const m = monter([{ slug: 'developpe_couche_barre', zone: 'mix', vise: 8, groupe: 1 }, { slug: 'tirage_poulie', zone: 'volume', vise: 10, groupe: 1 }]);
    expect(m.plan.exercices[0].reposConseille).toBeNull();
    expect(m.plan.exercices[1].reposConseille).toEqual(expect.objectContaining({ s: 90, cas: 'superset', membres: 2, entreLesTours: true }));
    expect(m.plan.exercices[1].reposConseille.pourquoi).toBe('2 exercices dans le tour : je conseille 1 min 30 entre les tours.');
    expect(erreurs(m)).toEqual([]);
  });
  test('silence : une durée (planche), Entretenir, l\'Édition, « Sans coach cette fois »', () => {
    const planche = monter([{ slug: 'planche', vise: null, series: 3 }]);
    expect(planche.plan.exercices[0].reposConseille).toBeNull();
    const carnet = monter([{ slug: 'squat_barre', vise: 5 }], null, { intention: 'entretien' });
    expect(carnet.plan.exercices[0].reposConseille).toBeNull();
    const edition = monter([{ slug: 'squat_barre', vise: 5 }]);
    edition.entrees.seance = Object.assign({}, edition.entrees.seance, { edition: true });
    expect(T.planDeSeance(edition.entrees).exercices[0].reposConseille).toBeNull();
    const sans = monter([{ slug: 'squat_barre', vise: 5 }]);
    const marque = S.marquerSansCoach(sans.seance, 0, { douleur: false });
    sans.entrees.seance = Object.assign({}, sans.entrees.seance, { exercices: marque.exercices, gestes: marque.gestes || [] });
    expect(T.planDeSeance(sans.entrees).exercices[0].reposConseille).toBeNull();
    expect(erreurs(planche)).toEqual([]);
  });
  test('« J\'ai peu de temps » : la valeur du raccourci, jamais au-dessus (I263)', () => {
    const m = monter([{ slug: 'curl_barre', zone: 'volume', vise: 12, repos: 60 }], 'franc', { raccourci: { complet: null, raccourcie: null } });
    const r = m.plan.exercices[0].reposConseille;
    expect(r.cas).toBe('raccourci');
    expect(r.s).toBe(60);
    expect(r.pourquoi).not.toMatch(/\d/);
    expect(erreurs(m).filter((e) => /^I2(5|6)/.test(e))).toEqual([]);
  });
});

describe('le plan ne fait rien d\'autre : rendu pur, chauffes intactes (I259, I260)', () => {
  test('aucune écriture : la séance des entrées est identique avant et après, repos_cible_s compris', () => {
    const m = monter([{ slug: 'squat_barre', vise: 5, series: 4, repos: 120 }]);
    const avant = JSON.stringify(m.entrees);
    T.planDeSeance(m.entrees);
    T.planDeSeance(m.entrees);
    expect(JSON.stringify(m.entrees)).toBe(avant);
    expect(m.entrees.seance.exercices[0].repos_cible_s).toBe(120);
  });
  test('deux rendus donnent le même conseil', () => {
    const m = monter([{ slug: 'squat_barre', vise: 5, series: 5 }], 'franc');
    expect(JSON.stringify(T.planDeSeance(m.entrees).exercices[0].reposConseille)).toBe(JSON.stringify(m.plan.exercices[0].reposConseille));
  });
  test('les chauffes automatiques : 60 s entre deux, 120 s après la dernière', () => {
    expect(M.REPOS_ENTRE_CHAUFFES).toBe(60);
    expect(M.REPOS_APRES_CHAUFFES).toBe(120);
    const m = monter([{ slug: 'squat_barre', vise: 5 }]);
    m.plan.exercices[0].lignes.filter((l) => l.type === 'echauffement').forEach((l) => expect(l.reposConseille).toBeUndefined());
  });
  test('le conseil ne porte aucun champ d\'écriture', () => {
    const m = monter([{ slug: 'squat_barre', vise: 5 }]);
    Object.keys(m.plan.exercices[0].reposConseille).forEach((k) => expect(k).not.toMatch(/repos_cible|arme|minuteur|chrono|routine/i));
  });
});

describe('des violations FORGÉES sont attrapées par `verifierPlan`', () => {
  const base = () => monter([{ slug: 'squat_barre', vise: 3, series: 5 }], 'franc');
  const avec = (modif) => { const m = base(); modif(m.plan.exercices[0].reposConseille, m.plan.exercices[0]); return erreurs(m); };
  test('le plan d\'origine est propre', () => { expect(erreurs(base())).toEqual([]); });
  test('I257 — une valeur qui n\'est pas celle de la règle (« près de l\'échec » compté deux fois)', () => {
    const e = avec((r) => { r.s = 240; r.pourquoi = r.pourquoi.replace('3 min 30', '4 min'); });
    expect(e.some((x) => /^I257/.test(x))).toBe(true);
  });
  test('I258 — hors bornes ou hors cran', () => {
    expect(avec((r) => { r.s = 100; }).some((x) => /^I258/.test(x))).toBe(true);
    expect(avec((r) => { r.s = 300; }).some((x) => /^I258/.test(x))).toBe(true);
  });
  test('I259 — un champ d\'écriture', () => {
    expect(avec((r) => { r.arme = true; }).some((x) => /^I259/.test(x))).toBe(true);
  });
  test('I261 — une garde dite alors que ce n\'est pas celle de la visée affichée', () => {
    expect(avec((r) => { r.gardeDite = false; }).some((x) => /^I261/.test(x))).toBe(true);
    expect(avec((r, x) => { r.garde = 0; }).some((x) => /^I261/.test(x))).toBe(true);
  });
  test('I264 — un chiffre de repos dans la ligne du repos long', () => {
    expect(avec((r, x) => { x.pourquoi = Object.assign({}, x.pourquoi, { repos: 'Sur un gros mouvement, 2 min 30 à 3 min de repos aident.' }); }).some((e) => /^I264/.test(e))).toBe(true);
  });
  test('I266 — « 4 min » pour 3 min 30 (dureeEnMinutes)', () => {
    expect(avec((r) => { r.pourquoi = r.pourquoi.replace('3 min 30', '4 min'); }).some((x) => /^I266/.test(x))).toBe(true);
  });
  test('I256 — un conseil là où le coach se tait', () => {
    const m = monter([{ slug: 'squat_barre', vise: 5 }]);
    m.plan.intention = 'entretien';
    expect(T.verifierPlan(m.plan, m.entrees).erreurs.some((x) => /^I256/.test(x))).toBe(true);
  });
  test('I265 — un superset qui ne retire pas 60 s par membre', () => {
    const m = monter([{ slug: 'developpe_couche_barre', zone: 'mix', vise: 8, groupe: 1 }, { slug: 'tirage_poulie', zone: 'volume', vise: 10, groupe: 1 }]);
    m.plan.exercices[1].reposConseille.s = 150;
    m.plan.exercices[1].reposConseille.pourquoi = '2 exercices dans le tour : je conseille 2 min 30 entre les tours.';
    expect(T.verifierPlan(m.plan, m.entrees).erreurs.some((x) => /^I265/.test(x))).toBe(true);
  });
  test('I263 — au-dessus de la valeur du raccourci', () => {
    const m = monter([{ slug: 'curl_barre', zone: 'volume', vise: 12, repos: 60 }], 'franc', { raccourci: { complet: null, raccourcie: null } });
    m.plan.exercices[0].reposConseille.s = 90;
    m.plan.exercices[0].reposConseille.cas = 'base';
    expect(T.verifierPlan(m.plan, m.entrees).erreurs.some((x) => /^I263/.test(x))).toBe(true);
  });
});
